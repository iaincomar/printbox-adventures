<?php
error_reporting(E_ALL);
ini_set('display_errors', 0); // No mostrar errores en producción

// Sin cookies de sesión aquí (el admin se verifica por contraseña en cada escritura,
// no por cookie), así que no hace falta Allow-Credentials. Aun así no se refleja
// CUALQUIER origen: solo el propio dominio y orígenes de desarrollo local, para no
// dejar que cualquier web de internet lea la config/cupones vía fetch cross-origin.
$__origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($__origin !== '') {
    $__host  = $_SERVER['HTTP_HOST'] ?? '';
    $__self  = ['http://' . $__host, 'https://' . $__host];
    $__isDev = (bool) preg_match('#^https?://(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$#i', $__origin);
    if (in_array($__origin, $__self, true) || $__isDev) {
        header('Access-Control-Allow-Origin: ' . $__origin);
        header('Vary: Origin');
    }
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, X-Admin-Password');
header('Access-Control-Max-Age: 86400');

// Responder a preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Headers anti-cache para config
if (strpos($_SERVER['REQUEST_URI'], '/config') !== false || strpos($_SERVER['REQUEST_URI'], '/reset-config') !== false) {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
}

// URI normalizada (sin barra final, sin query string)
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = rtrim($uri, '/');
if ($uri === '') $uri = '/';

$PRINTBOX_BASE = 'http://gestion.printboxweb.com'; // ¡HTTP!
$cookiePath = __DIR__ . '/pba_cookies.txt'; // Guardar en la misma carpeta

// ── Diagnóstico ──
if ($uri === '/proxy.php') {
    header('Content-Type: application/json');
    echo json_encode([
        'status'       => 'ok',
        'php_version'  => PHP_VERSION,
        'curl'         => function_exists('curl_init'),
        'uri'          => $uri,
        'tmp_writable' => is_writable(__DIR__),
        'cookie_path'  => $cookiePath,
    ]);
    exit();
}

if (!function_exists('curl_init')) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['error' => 'cURL no disponible']);
    exit();
}

// ── Funciones helper ──

function getConfigDir() {
    $scriptConfig = __DIR__ . '/config';
    if (is_dir($scriptConfig) && is_writable($scriptConfig)) {
        return $scriptConfig;
    }

    // En Windows local: usar LOCALAPPDATA si el directorio existe o si se puede crear
    $localAppData = getenv('LOCALAPPDATA');
    if ($localAppData) {
        $dir = $localAppData . '/PrintboxAdventures/config';
        if (is_dir($dir) || is_writable(dirname($dir))) {
            return $dir;
        }
    }

    // En servidor web (IONOS): usar directorio del script como fallback
    return $scriptConfig;
}

function getTextosFile($configDir, $eventCode = '') {
    // Si hay un código de evento, usar archivo específico del evento
    // Ejemplo: eventCode "1668042" → "textos_1668042.txt"
    // Si no hay eventCode, usar archivo global "textos.txt" (backward compatibility)
    if ($eventCode && trim($eventCode) !== '') {
        // Sanitizar el eventCode para evitar directory traversal
        $eventCode = preg_replace('/[^0-9a-zA-Z_-]/', '', $eventCode);
        return $configDir . '/textos_' . $eventCode . '.txt';
    }
    return $configDir . '/textos.txt';
}

function getPaypalConfigFile($configDir) {
    $result = [];

    $jsonPath = $configDir . '/paypal.json';
    if (file_exists($jsonPath)) {
        $content = file_get_contents($jsonPath);
        $parsed = json_decode($content, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($parsed)) {
            $result = array_merge($result, $parsed);
        }
    }

    $txtPath = $configDir . '/paypal.txt';
    if (file_exists($txtPath)) {
        $lines = file($txtPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) {
                continue;
            }
            $parts = explode('=', $line, 2);
            if (count($parts) === 2) {
                $key = trim($parts[0]);
                $value = trim($parts[1]);
                if ($key !== '') {
                    $result[$key] = $value;
                }
            }
        }
    }

    return $result;
}

function getPaypalCredentials($configDir) {
    $credentials = [
        'clientId' => getenv('PAYPAL_CLIENT_ID') ?: '',
        'clientSecret' => getenv('PAYPAL_CLIENT_SECRET') ?: '',
        'env' => getenv('PAYPAL_ENV') ?: '',
    ];

    if (!$credentials['clientId'] || !$credentials['clientSecret'] || !$credentials['env']) {
        $fileConfig = getPaypalConfigFile($configDir);
        if (!$credentials['clientId'] && !empty($fileConfig['clientId'])) {
            $credentials['clientId'] = $fileConfig['clientId'];
        }
        if (!$credentials['clientSecret'] && !empty($fileConfig['clientSecret'])) {
            $credentials['clientSecret'] = $fileConfig['clientSecret'];
        }
        if (!$credentials['env'] && !empty($fileConfig['env'])) {
            $credentials['env'] = $fileConfig['env'];
        }
    }

    if (!$credentials['env']) {
        $credentials['env'] = 'sandbox';
    }

    return $credentials;
}

// Credenciales de Square: variable de entorno si existe, si no config/square.json
// (fuera de git, protegido por config/.htaccess). Nunca hardcodeadas en el código.
function getSquareCredentials($configDir) {
    $accessToken = getenv('SQUARE_ACCESS_TOKEN') ?: '';
    $locationId  = getenv('SQUARE_LOCATION_ID') ?: '';
    if (!$accessToken || !$locationId) {
        $file = $configDir . '/square.json';
        if (file_exists($file)) {
            $parsed = json_decode(file_get_contents($file), true);
            if (is_array($parsed)) {
                if (!$accessToken) $accessToken = $parsed['accessToken'] ?? '';
                if (!$locationId)  $locationId  = $parsed['locationId'] ?? '';
            }
        }
    }
    return ['accessToken' => $accessToken, 'locationId' => $locationId];
}

// ── Autenticación de Admin ──────────────────────────────────────────────────
// Un único panel de Admin (sin multi-tenant), así que no hace falta sesión/cookie:
// cada escritura (guardar config, crear/listar cupones) exige la contraseña en la
// cabecera X-Admin-Password, verificada aquí con password_verify() contra el hash
// bcrypt guardado en config/admin.json (nunca en texto plano ni en el código).
function getAdminPasswordHash($configDir) {
    $f = $configDir . '/admin.json';
    if (is_file($f)) {
        $parsed = json_decode(@file_get_contents($f), true);
        if (is_array($parsed) && !empty($parsed['passHash'])) return $parsed['passHash'];
    }
    return null;
}

function checkAdminAuth($configDir) {
    $hash = getAdminPasswordHash($configDir);
    if (!$hash) return false; // sin config/admin.json no hay forma de entrar — fallar cerrado
    $sent = $_SERVER['HTTP_X_ADMIN_PASSWORD'] ?? '';
    if ($sent === '') return false;
    return password_verify($sent, $hash);
}

// Clave secreta para firmar los códigos de cupón: aleatoria, generada una vez y
// guardada en config/coupon_secret.txt (fuera de git, protegida por config/.htaccess).
function getCouponSecret($configDir) {
    $f = $configDir . '/coupon_secret.txt';
    if (is_file($f)) { $s = trim(@file_get_contents($f)); if ($s !== '') return $s; }
    $secret = bin2hex(random_bytes(32));
    if (!is_dir($configDir)) @mkdir($configDir, 0755, true);
    @file_put_contents($f, $secret);
    return $secret;
}

// Lee precio1/2/3 del evento (o global si no hay eventCode) para recalcular el
// importe en el servidor — nunca confiar en el importe que manda el cliente.
function pbhReadPrices($configDir, $eventCode) {
    $prices = ['precio1' => 5.0, 'precio2' => 9.0, 'precio3' => 12.0];
    $textosFile = getTextosFile($configDir, $eventCode);
    clearstatcache(true, $textosFile);
    if (!file_exists($textosFile)) return $prices;
    foreach (file($textosFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $parts = explode(':', trim($line), 2);
        $key = trim($parts[0] ?? '');
        if (in_array($key, ['precio1', 'precio2', 'precio3'], true)) {
            $prices[$key] = (float) trim($parts[1] ?? '');
        }
    }
    return $prices;
}

// Cupón aplicado (sin consumirlo) para restar del importe esperado: mismo criterio
// que /coupon/validate (firma HMAC + activo + no caducado), pero de solo lectura.
function pbhCouponDiscountCents($eventCode, $couponCode, $expectedCents) {
    if (!$couponCode) return 0;
    $code = strtoupper(trim($couponCode));
    if (!verifyCouponCode($code)) return 0;
    $coupons = readCoupons(getCouponFile($eventCode));
    if (!isset($coupons[$code])) return 0;
    $c = $coupons[$code];
    if (($c['status'] ?? '') !== 'active') return 0;
    if (strtotime($c['expires_at'] ?? '') < time()) return 0;
    if (($c['type'] ?? 'discount') === 'full') return min((int) $c['amount'], $expectedCents);
    return min((int) $c['amount'], $expectedCents);
}

// Recalcula el importe esperado a partir de las copias reales del pedido y los
// precios configurados del evento — el importe que mande el cliente DEBE coincidir.
function pbhCheckAmountCents($configDir, $data, $amountCents, &$err) {
    $order = is_array($data['order'] ?? null) ? $data['order'] : null;
    if (!$order || !isset($order['copies']) || !is_array($order['copies'])) {
        $err = 'Falta el detalle del pedido (order.copies)';
        return false;
    }
    $eventCode = preg_replace('/^ev[-_]?/i', '', trim((string) ($order['eventCode'] ?? '')));
    $prices = pbhReadPrices($configDir, $eventCode);
    $table  = [0, $prices['precio1'], $prices['precio2'], $prices['precio3']];

    $total = 0.0;
    foreach ($order['copies'] as $c) {
        $n = intval($c);
        if ($n < 1) continue;
        if ($n > 3) $n = 3;
        $total += $table[$n];
    }
    $expected = (int) round($total * 100);
    $expected = max(0, $expected - pbhCouponDiscountCents($eventCode, $order['coupon'] ?? null, $expected));

    if ($amountCents !== $expected) {
        $err = 'El importe no coincide con el pedido';
        return false;
    }
    return true;
}

// ¿De verdad cambian los precios/textos respecto a lo que ya hay en disco? Se
// compara siempre contra el fichero real (nunca contra lo que el cliente "declare"
// que está haciendo), para que /config POST pueda seguir usándose sin contraseña
// para elegir qué evento se monitoriza (acción operativa, sin impacto económico)
// pero SÍ la exija en cuanto se toquen precios/empresa de verdad.
function pbhTextosChanged($configDir, $eventCode, $newTextos) {
    if (!is_array($newTextos)) return false;
    $textosFile = getTextosFile($configDir, $eventCode);
    clearstatcache(true, $textosFile);
    $current = ['text_es' => '', 'text_en' => '', 'text_fr' => '', 'text_de' => '', 'precio1' => '', 'precio2' => '', 'precio3' => '', 'empresa' => ''];
    if (file_exists($textosFile)) {
        $keyMap = ['es' => 'text_es', 'en' => 'text_en', 'fr' => 'text_fr', 'de' => 'text_de'];
        foreach (file($textosFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $parts = explode(':', trim($line), 2);
            $key = $keyMap[trim($parts[0])] ?? trim($parts[0]);
            if (isset($current[$key])) $current[$key] = trim($parts[1] ?? '');
        }
    }
    foreach ($current as $key => $val) {
        if ((string) ($newTextos[$key] ?? '') !== (string) $val) return true;
    }
    return false;
}

function getCsrfToken() {
    global $PRINTBOX_BASE, $cookiePath;
    $ch = curl_init($PRINTBOX_BASE . '/sanctum/csrf-cookie');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_COOKIEJAR      => $cookiePath,
        CURLOPT_COOKIEFILE     => $cookiePath,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ]);
    curl_exec($ch);
    curl_close($ch);

    if (file_exists($cookiePath)) {
        $cookies = file_get_contents($cookiePath);
        if (preg_match('/XSRF-TOKEN\s+([^\s\r\n]+)/', $cookies, $m)) {
            return urldecode($m[1]);
        }
    }
    return null;
}

function proxyPost($url, $data, $extraHeaders = []) {
    global $cookiePath;
    $json = json_encode($data);
    $headers = array_merge([
        'Content-Type: application/json',
        'Accept: application/json',
        'Content-Length: ' . strlen($json),
    ], $extraHeaders);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $json,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_COOKIEJAR      => $cookiePath,
        CURLOPT_COOKIEFILE     => $cookiePath,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ]);

    $response = curl_exec($ch);
    $code     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error    = curl_error($ch);
    curl_close($ch);

    return ['code' => $code, 'body' => $response, 'error' => $error];
}

$body = file_get_contents('php://input');
$data = json_decode($body, true) ?? [];

// Log TODOS los requests para debuggear — el body de rutas sensibles (contraseña de
// admin, tokens de pago) nunca se loguea en texto plano.
$__uriForLog = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$__sensitive = ['/auth/', '/process-payment', '/paypal/', '/coupon/'];
$__isSensitiveLog = false;
foreach ($__sensitive as $__s) { if (strpos($__uriForLog, $__s) !== false) { $__isSensitiveLog = true; break; } }
@file_put_contents(__DIR__ . '/pba_requests.log',
    date('Y-m-d H:i:s') . " {$_SERVER['REQUEST_METHOD']} {$_SERVER['REQUEST_URI']} " .
    "Content-Length:" . ($_SERVER['CONTENT_LENGTH'] ?? '0') . " Body:" . ($__isSensitiveLog ? '[redacted]' : substr($body, 0, 200)) . "\n",
    FILE_APPEND);

header('Content-Type: application/json');

// ── /health ──
if ($uri === '/health') {
    echo json_encode(['ok' => true]);
    exit();
}

// ── /auth/check (verifica la contraseña de Admin sin crear sesión) ──
// Solo da feedback inmediato en el modal de acceso; la protección real está en que
// cada escritura (POST /config, /coupon/create, /coupon/list) exige la MISMA
// contraseña otra vez en la cabecera X-Admin-Password.
if ($uri === '/auth/check' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $password = (string)($data['password'] ?? '');
    $hash = getAdminPasswordHash(getConfigDir());
    if (!$hash || $password === '' || !password_verify($password, $hash)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Contraseña incorrecta']);
        exit();
    }
    echo json_encode(['ok' => true]);
    exit();
}

// ── /config GET ──
if ($uri === '/config' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    
    // Limpiar caché para asegurar lectura fresca del disco
    clearstatcache(true);
    
    $configDir = getConfigDir();
    
    // Obtener el código de evento del query string (para cargar precios específicos de cada evento)
    $eventCode = $_GET['eventCode'] ?? '';
    $eventCode = preg_replace('/^ev[-_]?/i', '', $eventCode);
    
    $config = [
        'servidor'  => 'http://gestion.printboxweb.com',
        'evento'    => '', 'timer' => 5, 'impresora' => '', 'delay' => 5,
    ];
    $textos = [
        'text_es' => '', 'text_en' => '', 'text_fr' => '', 'text_de' => '',
        'precio1' => '', 'precio2' => '', 'precio3' => '', 'empresa' => '',
    ];

    $apiFile = $configDir . '/servidor_api.txt';
    if (file_exists($apiFile)) {
        $lines = file($apiFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $keys  = ['servidor', 'evento', 'evento_printer', 'timer', 'impresora', 'delay'];
        foreach ($lines as $i => $line) {
            $val = trim(strpos($line, ';') !== false ? explode(';', $line, 2)[1] : $line);
            if (isset($keys[$i]))
                $config[$keys[$i]] = in_array($keys[$i], ['timer','delay']) ? ((int)$val ?: 5) : $val;
        }
    }

    // Usar getTextosFile() para obtener el archivo correcto (específico de evento o global)
    $textosFile = getTextosFile($configDir, $eventCode);
    if (file_exists($textosFile)) {
        $lines = file($textosFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        
        // Mapear claves cortas del archivo a claves largas esperadas por la app
        $keyMap = ['es' => 'text_es', 'en' => 'text_en', 'fr' => 'text_fr', 'de' => 'text_de'];
        
        foreach ($lines as $line) {
            $line = trim($line);
            if (strpos($line, ':') !== false) {
                $parts = explode(':', $line, 2);
                $shortKey = trim($parts[0]);
                $val = trim($parts[1] ?? '');
                
                // Convertir clave corta a larga si aplica
                $key = isset($keyMap[$shortKey]) ? $keyMap[$shortKey] : $shortKey;
                
                // Guardar si es una clave válida
                $validKeys = ['text_es','text_en','text_fr','text_de','precio1','precio2','precio3','empresa'];
                if (in_array($key, $validKeys)) {
                    $textos[$key] = $val;
                }
            }
        }
    }

    echo json_encode(['config' => $config, 'textos' => $textos]);
    exit();
}

// ── /config POST ──
if ($uri === '/config' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    // Headers anti-cache
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');

    $configDir = getConfigDir();

    // Obtener el código de evento del query string (para guardar precios específicos de cada evento)
    $eventCode = $_GET['eventCode'] ?? '';
    $eventCode = preg_replace('/^ev[-_]?/i', '', $eventCode);

    // Solo cambiar precios/empresa de verdad exige la contraseña de Admin — elegir
    // qué evento se monitoriza no la requiere (ver pbhTextosChanged).
    if (pbhTextosChanged($configDir, $eventCode, $data['textos'] ?? null) && !checkAdminAuth($configDir)) {
        http_response_code(401);
        echo json_encode(['error' => 'No autenticado']);
        exit();
    }

    if (!is_dir($configDir)) {
        if (!mkdir($configDir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['error' => 'No se pudo crear directorio config']);
            exit();
        }
    }

    $writeErrors = [];

    if (isset($data['config'])) {
        $c = $data['config'];
        $success = file_put_contents($configDir . '/servidor_api.txt', implode("\n", [
            'servidor;' . ($c['servidor'] ?? 'http://gestion.printboxweb.com'),
            'evento;'   . ($c['evento']    ?? ''),
            'evento_printer;'   . ($c['evento_printer']    ?? ''),
            'timer;'    . ($c['timer']     ?? 5),
            'impresora;'. ($c['impresora'] ?? ''),
            'delay;'    . ($c['delay']     ?? 5),
        ]));
        if ($success === false) $writeErrors[] = 'No se pudo escribir servidor_api.txt';
    }
    if (isset($data['textos'])) {
        $t = $data['textos'];
        
        $finalTextos = [
            'text_es' => $t['text_es'] ?? '¡Consigue tu foto del evento!',
            'text_en' => $t['text_en'] ?? 'Get your event photo!',
            'text_fr' => $t['text_fr'] ?? 'Obtenez votre photo!',
            'text_de' => $t['text_de'] ?? 'Hol dir dein Foto!',
            'precio1' => $t['precio1'] ?? '5',
            'precio2' => $t['precio2'] ?? '9',
            'precio3' => $t['precio3'] ?? '12',
            'empresa' => $t['empresa'] ?? 'Printbox Adventur',
        ];
        
        $content = implode("\n", [
            'es:' . $finalTextos['text_es'],
            'en:' . $finalTextos['text_en'],
            'fr:' . $finalTextos['text_fr'],
            'de:' . $finalTextos['text_de'],
            'precio1:' . $finalTextos['precio1'],
            'precio2:' . $finalTextos['precio2'],
            'precio3:' . $finalTextos['precio3'],
            'empresa:' . $finalTextos['empresa'],
        ]);
        
        // Log para debuggear
        @file_put_contents($configDir . '/debug.log', date('Y-m-d H:i:s') . " POST /config eventCode: " . $eventCode . " textos: " . json_encode($t) . "\n", FILE_APPEND);
        
        // IMPORTANTE: Cada evento debe tener precios INDEPENDIENTES
        // Si hay eventCode → guardar SOLO en textos_<eventCode>.txt (aislado)
        // Si NO hay eventCode → guardar en textos.txt (global/default)
        // Esto evita que cambios en un evento afecten a otros eventos
        $filesToWrite = [];
        
        if ($eventCode && trim($eventCode) !== '') {
            // Guardar SOLO en archivo específico del evento
            $filesToWrite[] = getTextosFile($configDir, $eventCode);
        } else {
            // Si no hay eventCode, guardar en global (defaults)
            $filesToWrite[] = $configDir . '/textos.txt';
        }
        
        // Escribir en el archivo correspondiente
        foreach ($filesToWrite as $file) {
            $success = file_put_contents($file, $content, LOCK_EX);
            if ($success === false) $writeErrors[] = 'No se pudo escribir ' . basename($file);
        }
    }

    if (count($writeErrors) > 0) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'errors' => $writeErrors]);
        exit();
    }

    // Limpiar caché de PHP antes de releer
    $textosFile = getTextosFile($configDir, $eventCode);
    clearstatcache(true, $configDir . '/servidor_api.txt');
    clearstatcache(true, $textosFile);

    // Leer y devolver los valores actualizados inmediatamente
    $config = ['servidor' => 'http://gestion.printboxweb.com', 'evento' => '', 'evento_printer' => '', 'timer' => 5, 'impresora' => '', 'delay' => 5];
    $textos = ['text_es' => '', 'text_en' => '', 'text_fr' => '', 'text_de' => '', 'precio1' => '', 'precio2' => '', 'precio3' => '', 'empresa' => ''];

    $apiFile = $configDir . '/servidor_api.txt';
    if (file_exists($apiFile)) {
        $lines = file($apiFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines) {
            $keys = ['servidor', 'evento', 'evento_printer', 'timer', 'impresora', 'delay'];
            foreach ($lines as $i => $line) {
                if (!isset($keys[$i])) break;
                $val = trim(strpos($line, ';') !== false ? explode(';', $line, 2)[1] : $line);
                $key = $keys[$i];
                if (in_array($key, ['timer', 'delay'])) {
                    $config[$key] = (int) $val;
                } else {
                    $config[$key] = $val;
                }
            }
        }
    }

    $textosFile = getTextosFile($configDir, $eventCode);
    if (file_exists($textosFile)) {
        $lines = file($textosFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines) {
            // Soportar claves cortas del archivo y claves largas del JSON
            $keyMap = ['es' => 'text_es', 'en' => 'text_en', 'fr' => 'text_fr', 'de' => 'text_de'];
            $validKeys = ['text_es','text_en','text_fr','text_de','precio1','precio2','precio3','empresa'];

            foreach ($lines as $line) {
                $line = trim($line);
                if (strpos($line, ':') !== false) {
                    $parts = explode(':', $line, 2);
                    $shortKey = trim($parts[0]);
                    $val = trim($parts[1] ?? '');
                    $key = $keyMap[$shortKey] ?? $shortKey;
                } else {
                    $key = '';
                    $val = $line;
                }
                
                if (in_array($key, $validKeys)) {
                    $textos[$key] = $val;
                }
            }
        }
    }

    echo json_encode(['ok' => true, 'config' => $config, 'textos' => $textos]);
    exit();
}


// ── /print/* (simulados) ──
if ($uri === '/print/count')    { echo json_encode(['count' => 0]);          exit(); }
if ($uri === '/print/printers') { echo json_encode(['printers' => []]);       exit(); }
if ($uri === '/print/job')      { echo json_encode(['ok' => true, 'count' => 0]); exit(); }

// ── Apple Pay domain verification (Square) ──
if ($uri === '/.well-known/apple-developer-merchantid-domain-association' || 
    $uri === '/apple-developer-merchantid-domain-association') {
    header('Content-Type: application/json');
    header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: Thu, 01 Jan 1970 00:00:00 GMT');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    
    $file = __DIR__ . '/.well-known/apple-developer-merchantid-domain-association';
    if (!file_exists($file)) {
        http_response_code(404);
        echo json_encode(['error' => 'Verification file not found']);
        exit();
    }
    
    $content = file_get_contents($file);
    header('Content-Length: ' . strlen($content));
    echo $content;
    exit();
}

// ── /printbox/* ──
if (strpos($uri, '/printbox/') === 0) {
    getCsrfToken();
    $csrf    = getCsrfToken();
    $headers = $csrf ? ['X-XSRF-TOKEN: ' . $csrf] : [];

    if ($uri === '/printbox/find-event') {
        $result = proxyPost($PRINTBOX_BASE . '/api/v1/events/find', $data, $headers);
        if ($result['error']) {
            http_response_code(500);
            echo json_encode(['error' => $result['error']]);
            exit();
        }
        $resp = json_decode($result['body'], true);
        if ($result['code'] === 200 && isset($resp['data']['uuid'])) {
            echo json_encode(['uuid' => $resp['data']['uuid']]);
        } else {
            http_response_code($result['code'] ?: 500);
            echo $result['body'] ?: json_encode(['error' => 'Sin respuesta del servidor']);
        }
        exit();
    }

    if ($uri === '/printbox/photos') {
        $page   = $_GET['page'] ?? 1;
        $result = proxyPost($PRINTBOX_BASE . '/api/v1/events/photos?page=' . $page, $data, $headers);
        http_response_code($result['code'] ?: 500);
        echo $result['body'] ?: json_encode(['error' => 'Sin respuesta']);
        exit();
    }

    if ($uri === '/printbox/photos-to-print') {
        $result = proxyPost($PRINTBOX_BASE . '/api/v1/events/photos_two', $data, $headers);
        http_response_code($result['code'] ?: 500);
        echo $result['body'] ?: json_encode(['error' => 'Sin respuesta']);
        exit();
    }

    if ($uri === '/printbox/otp/request') {
        $result = proxyPost($PRINTBOX_BASE . '/api/v1/otp/request', $data, $headers);
        http_response_code($result['code'] ?: 500);
        echo $result['body'] ?: json_encode(['error' => 'Sin respuesta']);
        exit();
    }

    if ($uri === '/printbox/otp/validate') {
        $result = proxyPost($PRINTBOX_BASE . '/api/v1/otp/validate', $data, $headers);
        http_response_code($result['code'] ?: 500);
        echo $result['body'] ?: json_encode(['error' => 'Sin respuesta']);
        exit();
    }

    if ($uri === '/printbox/photo-send') {
        $payload = [
            'event' => $data['event'] ?? '',
            'image' => $data['image'] ?? '',
            'times' => $data['times'] ?? 1,
            'name' => $data['name'] ?? ('photo-' . time()),
            'print' => isset($data['print']) ? $data['print'] : (!empty($data['times']) ? true : false),
        ];
        if (!empty($data['phone'])) {
            $payload['phone'] = $data['phone'];
        }
        if (!empty($data['orientation'])) {
            $payload['orientation'] = $data['orientation'];
        }

        $result = proxyPost($PRINTBOX_BASE . '/api/v1/events/photo/send', $payload, $headers);
        http_response_code($result['code'] ?: 500);
        echo $result['body'] ?: json_encode(['error' => 'Sin respuesta']);
        exit();
    }
}

// ── Proxy de imágenes (con HTTP + Reintentos + Caché) ──
if (strpos($uri, '/proxy-image/') === 0) {
    $imagePath = substr($uri, strlen('/proxy-image'));
    $imageUrl  = 'http://gestion.printboxweb.com' . $imagePath; // forzamos HTTP

    // Headers de caché agresivo (imágenes son estáticas)
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Pragma: cache');
    header('Expires: ' . date('r', strtotime('+1 year')));

    // Reintentos con backoff exponencial
    $maxRetries = 3;
    $imageData = null;
    $contentType = 'application/octet-stream';
    
    for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
        $ch = curl_init($imageUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 20 + ($attempt * 5), // Aumentar timeout en cada reintento
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            CURLOPT_FAILONERROR    => false, // No fallar silenciosamente
        ]);
        $imageData   = curl_exec($ch);
        $httpCode    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'application/octet-stream';
        $curlError   = curl_error($ch);
        curl_close($ch);

        // Si éxito (código 200), salir del loop de reintentos
        if ($httpCode === 200 && $imageData) {
            break;
        }

        // Si fallo y no es el último intento, esperar antes de reintentar
        if ($attempt < $maxRetries) {
            $backoffMs = 500 * ($attempt); // 500ms, 1s, 1.5s
            usleep($backoffMs * 1000);
        }
    }

    if ($imageData && $httpCode === 200) {
        header('Content-Type: ' . $contentType);
        echo $imageData;
    } else {
        http_response_code(503); // 503 en lugar de 404, así el navegador lo reintentará
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Imagen no disponible', 'attempt' => $attempt]);
    }
    exit();
}

// ── /process-payment (Square payment processing) ──
if ($uri === '/process-payment') {
    $data = json_decode(file_get_contents('php://input'), true);
    $configDir = getConfigDir();

    $square = getSquareCredentials($configDir);
    if (!$square['accessToken']) {
        http_response_code(500);
        echo json_encode(['error' => 'Square no configurado en el servidor']);
        exit();
    }

    $amount = isset($data['amount']) ? intval($data['amount']) : 0;  // Ya viene en centavos desde el cliente
    // location_id SIEMPRE del servidor: si viene del cliente se puede desviar el cobro.
    $location = $square['locationId'];

    if (!$data['token'] || $amount <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'token y amount son requeridos']);
        exit;
    }

    $amountError = '';
    if (!pbhCheckAmountCents($configDir, $data, $amount, $amountError)) {
        http_response_code(400);
        echo json_encode(['error' => $amountError]);
        exit;
    }

    $payload = json_encode([
        "source_id" => $data['token'],
        "idempotency_key" => uniqid('pba_', true),
        "amount_money" => [
            "amount" => $amount,
            "currency" => ($data['currency'] ?? 'EUR')
        ],
        "location_id" => $location
    ]);

    $url = "https://connect.squareup.com/v2/payments";
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $square['accessToken'],
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    http_response_code($httpCode ?: 500);
    echo $response;
    exit();
}

// ── /paypal/config (Devuelve clientId para PayPal JS SDK) ──
if ($uri === '/paypal/config') {
    $paypal = getPaypalCredentials(getConfigDir());
    header('Content-Type: application/json');
    echo json_encode([
        'clientId' => $paypal['clientId'],
        'env' => $paypal['env'],
        'currency' => 'EUR',
    ]);
    exit();
}

// ── /paypal/create-order (Crea orden en PayPal) ──
if ($uri === '/paypal/create-order') {
    $data = json_decode(file_get_contents('php://input'), true);
    $paypal = getPaypalCredentials(getConfigDir());

    if (!$paypal['clientId'] || !$paypal['clientSecret']) {
        http_response_code(500);
        echo json_encode(['error' => 'PayPal no configurado en el servidor']);
        exit();
    }

    $amount = isset($data['amount']) ? number_format(floatval($data['amount']), 2, '.', '') : null;
    $currency = $data['currency'] ?? 'EUR';

    if (!$amount) {
        http_response_code(400);
        echo json_encode(['error' => 'amount es requerido']);
        exit();
    }

    $amountError = '';
    if (!pbhCheckAmountCents(getConfigDir(), $data, (int) round(floatval($amount) * 100), $amountError)) {
        http_response_code(400);
        echo json_encode(['error' => $amountError]);
        exit();
    }

    $urlBase = $paypal['env'] === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    $url = "$urlBase/v2/checkout/orders";
    $payload = json_encode([
        'intent' => 'CAPTURE',
        'purchase_units' => [[
            'amount' => [
                'currency_code' => $currency,
                'value' => $amount,
            ],
        ]],
    ]);

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Basic ' . base64_encode($paypal['clientId'] . ':' . $paypal['clientSecret']),
        'Content-Type: application/json',
    ]);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    http_response_code($httpCode ?: 500);
    echo $response;
    exit();
}

// ── /paypal/capture-order (Captura orden PayPal) ──
if ($uri === '/paypal/capture-order') {
    $data = json_decode(file_get_contents('php://input'), true);
    $paypal = getPaypalCredentials(getConfigDir());

    if (!$paypal['clientId'] || !$paypal['clientSecret']) {
        http_response_code(500);
        echo json_encode(['error' => 'PayPal no configurado en el servidor']);
        exit();
    }

    $orderId = $data['orderId'] ?? '';
    if (!$orderId) {
        http_response_code(400);
        echo json_encode(['error' => 'orderId es requerido']);
        exit();
    }

    $urlBase = $paypal['env'] === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    $url = "$urlBase/v2/checkout/orders/{$orderId}/capture";

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Basic ' . base64_encode($paypal['clientId'] . ':' . $paypal['clientSecret']),
        'Content-Type: application/json',
    ]);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    http_response_code($httpCode ?: 500);
    echo $response;
    exit();
}

// ══════════════════════════════════════════════════════════════════════════
// ── SISTEMA DE CUPONES ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

/**
 * Normaliza el código de evento (quita prefijo ev- / ev_)
 */
function normalizeCouponEvent($code) {
    return preg_replace('/^ev[-_]?/i', '', trim($code));
}

/**
 * Devuelve la ruta del archivo JSON de cupones para un evento.
 * Formato: /config/cupones-{evento}.json
 */
function getCouponFile($evento) {
    $configDir = getConfigDir();
    $evento = preg_replace('/[^0-9a-zA-Z_-]/', '', $evento);
    return $configDir . '/cupones-' . $evento . '.json';
}

/**
 * Devuelve la ruta del archivo de log de cupones para un evento.
 */
function getCouponLogFile($evento) {
    $configDir = getConfigDir();
    $evento = preg_replace('/[^0-9a-zA-Z_-]/', '', $evento);
    return $configDir . '/cupones-log-' . $evento . '.txt';
}

/**
 * Lee el JSON de cupones. Devuelve array vacío si no existe.
 * Lee siempre desde $file (que puede ser el .lock durante el lock).
 */
function readCoupons($file) {
    if (!file_exists($file)) return [];
    $content = file_get_contents($file);
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * Escribe el JSON de cupones en el archivo indicado.
 */
function writeCoupons($file, $coupons) {
    file_put_contents($file, json_encode($coupons, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

/**
 * Genera un código de cupón con firma HMAC para evitar falsificaciones.
 * Formato breve: XXXXXXX-YYY (6 chars aleatorios + 3 chars HMAC)
 */
function generateCouponCode() {
    $random = strtoupper(bin2hex(random_bytes(3))); // 6 chars hex
    $hmac   = strtoupper(substr(hash_hmac('sha256', $random, getCouponSecret(getConfigDir())), 0, 3));
    return $random . '-' . $hmac;
}

/**
 * Verifica que el código de cupón tiene una firma HMAC válida.
 * Protege contra códigos inventados manualmente y sigue admitiendo códigos antiguos.
 */
function verifyCouponCode($code) {
    $parts = explode('-', $code);
    if (count($parts) !== 2) return false;
    [$random, $hmac] = $parts;

    $isLegacy = strlen($random) === 8 && strlen($hmac) === 4;
    $isShort = strlen($random) === 6 && strlen($hmac) === 3;
    if (!$isLegacy && !$isShort) return false;

    $expectedLength = $isLegacy ? 4 : 3;
    $expected = strtoupper(substr(hash_hmac('sha256', $random, getCouponSecret(getConfigDir())), 0, $expectedLength));
    return hash_equals($expected, $hmac);
}

/**
 * Ejecuta una función con lock atómico sobre el archivo de cupones.
 * rename() en Linux/IONOS es atómico: solo un proceso gana.
 * Si el .lock tiene más de 30s (proceso muerto), se limpia automáticamente.
 */
function withCouponLock($couponFile, callable $fn) {
    $lockFile = $couponFile . '.lock';
    $timeout  = 4000; // ms máximo de espera
    $start    = microtime(true) * 1000;

    // Limpiar lock huérfano (proceso muerto hace más de 30s)
    if (file_exists($lockFile) && (time() - filemtime($lockFile)) > 30) {
        @rename($lockFile, $couponFile);
    }

    // Si el archivo aún no existe, crearlo vacío para poder renombrarlo
    if (!file_exists($couponFile)) {
        file_put_contents($couponFile, '{}');
    }

    // Intentar obtener el lock renombrando el archivo original a .lock
    while (!@rename($couponFile, $lockFile)) {
        if ((microtime(true) * 1000 - $start) > $timeout) {
            http_response_code(503);
            echo json_encode(['error' => 'Sistema ocupado, reintenta']);
            exit();
        }
        usleep(60000); // esperar 60ms antes de reintentar
    }

    try {
        $result = $fn($lockFile);
    } finally {
        // SIEMPRE desbloquear, aunque falle
        @rename($lockFile, $couponFile);
    }
    return $result;
}

/**
 * Escribe una línea en el log de uso de cupones.
 */
function logCouponUsage($evento, $code, $amount, $action) {
    $logFile = getCouponLogFile($evento);
    $ip      = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $line    = date('Y-m-d H:i:s') . " [$action] code=$code amount={$amount} ip=$ip\n";
    @file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
}

// ── POST /coupon/create (Solo admin autenticado) ───────────────────────────
if ($uri === '/coupon/create' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!checkAdminAuth(getConfigDir())) {
        http_response_code(401);
        echo json_encode(['error' => 'No autenticado']);
        exit();
    }

    $evento = normalizeCouponEvent($data['evento'] ?? '');
    $amount = intval($data['amount'] ?? 0); // en céntimos (ej: 500 = 5.00€)
    $expiresIn = intval($data['expires_hours'] ?? 72); // horas hasta caducar, default 72h
    $type = ($data['type'] ?? 'discount') === 'full' ? 'full' : 'discount';

    if (!$evento) {
        http_response_code(400);
        echo json_encode(['error' => 'evento requerido']);
        exit();
    }
    if ($amount <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'amount debe ser mayor que 0 (en céntimos)']);
        exit();
    }

    $code = generateCouponCode();
    $now  = time();

    $couponFile = getCouponFile($evento);
    withCouponLock($couponFile, function($lockFile) use ($code, $amount, $now, $expiresIn, $type) {
        $coupons = readCoupons($lockFile);
        $coupons[$code] = [
            'amount'     => $amount,
            'type'       => $type,
            'status'     => 'active',
            'created_at' => date('c', $now),
            'expires_at' => date('c', $now + ($expiresIn * 3600)),
            'used_at'    => null,
            'used_by_ip' => null,
            'used_order' => null,
        ];
        writeCoupons($lockFile, $coupons);
    });

    logCouponUsage($evento, $code, $amount, 'CREATE');

    echo json_encode([
        'ok'     => true,
        'code'   => $code,
        'amount' => $amount,
        'type'   => $type,
        'amount_eur' => number_format($amount / 100, 2, '.', '') . '€',
        'expires_at' => date('c', $now + ($expiresIn * 3600)),
    ]);
    exit();
}

// ── POST /coupon/validate (Solo comprueba, no consume) ────────────────────
if ($uri === '/coupon/validate' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $evento = normalizeCouponEvent($data['evento'] ?? '');
    $code   = strtoupper(trim($data['code'] ?? ''));

    if (!$evento || !$code) {
        http_response_code(400);
        echo json_encode(['error' => 'evento y code requeridos']);
        exit();
    }

    // Verificar firma HMAC primero (evita leer el archivo para códigos inventados)
    if (!verifyCouponCode($code)) {
        http_response_code(422);
        echo json_encode(['valid' => false, 'error' => 'Código de cupón inválido']);
        exit();
    }

    $couponFile = getCouponFile($evento);
    $coupons    = readCoupons($couponFile);

    if (!isset($coupons[$code])) {
        http_response_code(422);
        echo json_encode(['valid' => false, 'error' => 'Cupón no encontrado']);
        exit();
    }

    $coupon = $coupons[$code];

    if ($coupon['status'] !== 'active') {
        http_response_code(422);
        echo json_encode(['valid' => false, 'error' => 'Cupón ya utilizado']);
        exit();
    }

    if (strtotime($coupon['expires_at']) < time()) {
        http_response_code(422);
        echo json_encode(['valid' => false, 'error' => 'Cupón caducado']);
        exit();
    }

    echo json_encode([
        'valid'      => true,
        'amount'     => $coupon['amount'],
        'type'       => $coupon['type'] ?? 'discount',
        'amount_eur' => number_format($coupon['amount'] / 100, 2, '.', '') . '€',
        'expires_at' => $coupon['expires_at'],
    ]);
    exit();
}

// ── POST /coupon/redeem (Consume el cupón — llamar solo tras pago exitoso) ─
if ($uri === '/coupon/redeem' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $evento   = normalizeCouponEvent($data['evento'] ?? '');
    $code     = strtoupper(trim($data['code'] ?? ''));
    $orderId  = $data['order_id'] ?? '';

    if (!$evento || !$code) {
        http_response_code(400);
        echo json_encode(['error' => 'evento y code requeridos']);
        exit();
    }

    // Verificar firma HMAC
    if (!verifyCouponCode($code)) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Código de cupón inválido']);
        exit();
    }

    $couponFile = getCouponFile($evento);
    $result = withCouponLock($couponFile, function($lockFile) use ($code, $orderId) {
        $coupons = readCoupons($lockFile);

        if (!isset($coupons[$code])) {
            return ['ok' => false, 'error' => 'Cupón no encontrado', 'http' => 422];
        }

        $coupon = $coupons[$code];

        if ($coupon['status'] !== 'active') {
            return ['ok' => false, 'error' => 'Cupón ya utilizado', 'http' => 422];
        }

        if (strtotime($coupon['expires_at']) < time()) {
            return ['ok' => false, 'error' => 'Cupón caducado', 'http' => 422];
        }

        // Marcar como usado
        $coupons[$code]['status']     = 'used';
        $coupons[$code]['used_at']    = date('c');
        $coupons[$code]['used_by_ip'] = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $coupons[$code]['used_order'] = $orderId;

        writeCoupons($lockFile, $coupons);

        return ['ok' => true, 'amount' => $coupon['amount']];
    });

    if (!$result['ok']) {
        http_response_code($result['http'] ?? 422);
        echo json_encode($result);
        exit();
    }

    logCouponUsage($evento, $code, $result['amount'], 'REDEEM');

    echo json_encode([
        'ok'     => true,
        'amount' => $result['amount'],
        'amount_eur' => number_format($result['amount'] / 100, 2, '.', '') . '€',
    ]);
    exit();
}

// ── GET /coupon/list (Panel admin — lista cupones de un evento) ────────────
if ($uri === '/coupon/list' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!checkAdminAuth(getConfigDir())) {
        http_response_code(401);
        echo json_encode(['error' => 'No autenticado']);
        exit();
    }

    $evento = normalizeCouponEvent($_GET['evento'] ?? '');

    if (!$evento) {
        http_response_code(400);
        echo json_encode(['error' => 'evento requerido']);
        exit();
    }

    $couponFile = getCouponFile($evento);
    $coupons    = readCoupons($couponFile);

    // Añadir info derivada a cada cupón para el panel
    $list = [];
    foreach ($coupons as $code => $c) {
        $list[] = array_merge($c, [
            'code'       => $code,
            'amount_eur' => number_format($c['amount'] / 100, 2, '.', '') . '€',
            'expired'    => strtotime($c['expires_at']) < time(),
        ]);
    }

    // Ordenar: activos primero, luego por fecha de creación desc
    usort($list, function($a, $b) {
        if ($a['status'] !== $b['status']) {
            return $a['status'] === 'active' ? -1 : 1;
        }
        return strcmp($b['created_at'], $a['created_at']);
    });

    echo json_encode(['ok' => true, 'evento' => $evento, 'coupons' => $list]);
    exit();
}

// ══════════════════════════════════════════════════════════════════════════
// ── FIN SISTEMA DE CUPONES ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

http_response_code(404);
echo json_encode(['error' => 'Ruta no encontrada', 'uri' => $uri]);