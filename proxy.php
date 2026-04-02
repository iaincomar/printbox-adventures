<?php
error_reporting(E_ALL);
ini_set('display_errors', 0); // No mostrar errores en producción

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
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
    // En Windows local: usar LOCALAPPDATA
    $localAppData = getenv('LOCALAPPDATA');
    if ($localAppData) {
        $dir = $localAppData . '/PrintboxAdventures/config';
        if (is_writable(dirname($dir))) {
            return $dir;
        }
    }
    // En servidor web (IONOS): usar directorio del script
    return __DIR__ . '/config';
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

// Log TODOS los requests para debuggear
@file_put_contents(__DIR__ . '/pba_requests.log', 
    date('Y-m-d H:i:s') . " {$_SERVER['REQUEST_METHOD']} {$_SERVER['REQUEST_URI']} " . 
    "Content-Length:" . ($_SERVER['CONTENT_LENGTH'] ?? '0') . " Body:" . substr($body, 0, 200) . "\n", 
    FILE_APPEND);

header('Content-Type: application/json');

// ── /health ──
if ($uri === '/health') {
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
        $keys  = ['servidor', 'evento', 'timer', 'impresora', 'delay'];
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
    if (!is_dir($configDir)) {
        if (!mkdir($configDir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['error' => 'No se pudo crear directorio config']);
            exit();
        }
    }

    // Obtener el código de evento del query string (para guardar precios específicos de cada evento)
    $eventCode = $_GET['eventCode'] ?? '';
    
    $writeErrors = [];

    if (isset($data['config'])) {
        $c = $data['config'];
        $success = file_put_contents($configDir . '/servidor_api.txt', implode("\n", [
            'servidor;' . ($c['servidor'] ?? 'http://gestion.printboxweb.com'),
            'evento;'   . ($c['evento']    ?? ''),
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
            'empresa' => $t['empresa'] ?? 'PrintboxAdventures',
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
    $config = ['servidor' => 'http://gestion.printboxweb.com', 'evento' => '', 'timer' => 5, 'impresora' => '', 'delay' => 5];
    $textos = ['text_es' => '', 'text_en' => '', 'text_fr' => '', 'text_de' => '', 'precio1' => '', 'precio2' => '', 'precio3' => '', 'empresa' => ''];

    $apiFile = $configDir . '/servidor_api.txt';
    if (file_exists($apiFile)) {
        $lines = file($apiFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines) {
            $keys = ['servidor', 'evento', 'timer', 'impresora', 'delay'];
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

// ── /debug/config (para ver qué está en el archivo) ──
if ($uri === '/debug/config' || $uri === '/debug/config/') {
    $configDir = getConfigDir();
    $textosFile = $configDir . '/textos.txt';
    $logFile = $configDir . '/debug.log';
    
    $result = [
        'configDir' => $configDir,
        'textosFile' => $textosFile,
        'fileExists' => file_exists($textosFile),
        'isWritable' => is_writable($configDir),
        'rawContent' => file_exists($textosFile) ? file_get_contents($textosFile) : 'archivo no existe',
        'lastLog' => file_exists($logFile) ? implode("\n", array_slice(file($logFile, FILE_IGNORE_NEW_LINES), -5)) : 'sin logs',
    ];
    
    // Como JSON devolvemos lo que está en el archivo
    if (file_exists($textosFile)) {
        $lines = file($textosFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $result['parsed'] = [];
        $keyMap = ['es' => 'text_es', 'en' => 'text_en', 'fr' => 'text_fr', 'de' => 'text_de'];
        foreach ($lines as $line) {
            $parts = explode(':', $line, 2);
            $shortKey = trim($parts[0]);
            $val = trim($parts[1] ?? '');
            $key = isset($keyMap[$shortKey]) ? $keyMap[$shortKey] : $shortKey;
            $result['parsed'][$key] = $val;
        }
    }
    
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit();
}

// ── /reset-config (restaurar valores por defecto) ──
if ($uri === '/reset-config' || $uri === '/reset-config/') {
    $configDir = getConfigDir();
    if (!is_dir($configDir)) {
        mkdir($configDir, 0755, true);
    }
    
    $defaultContent = "es:¡Consigue tu foto del evento!\nen:Get your event photo!\nfr:Obtenez votre photo!\nde:Hol dir dein Foto!\nprecio1:5\nprecio2:9\nprecio3:12\nempresa:PrintboxAdventures";
    
    file_put_contents($configDir . '/textos.txt', $defaultContent);
    @file_put_contents($configDir . '/debug.log', date('Y-m-d H:i:s') . " RESET /reset-config\n", FILE_APPEND);
    clearstatcache();
    
    echo json_encode(['ok' => true, 'message' => 'Config restaurada a valores por defecto']);
    exit();
}

// ── /print/* (simulados) ──
if ($uri === '/print/count')    { echo json_encode(['count' => 0]);          exit(); }
if ($uri === '/print/printers') { echo json_encode(['printers' => []]);       exit(); }
if ($uri === '/print/job')      { echo json_encode(['ok' => true, 'count' => 0]); exit(); }

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

    if ($uri === '/printbox/photo-send') {
        $result = proxyPost($PRINTBOX_BASE . '/api/v1/events/photo/send', $data, $headers);
        http_response_code($result['code'] ?: 500);
        echo $result['body'] ?: json_encode(['error' => 'Sin respuesta']);
        exit();
    }
}

// ── Proxy de imágenes (con HTTP) ──
if (strpos($uri, '/proxy-image/') === 0) {
    $imagePath = substr($uri, strlen('/proxy-image'));
    $imageUrl  = 'http://gestion.printboxweb.com' . $imagePath; // forzamos HTTP

    $ch = curl_init($imageUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ]);
    $imageData   = curl_exec($ch);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);

    if ($imageData) {
        header('Content-Type: ' . $contentType);
        echo $imageData;
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Imagen no encontrada']);
    }
    exit();
}

// Ruta: /proxy.php?route=process-payment
if ($_GET['route'] === 'process-payment') {
    $data = json_decode(file_get_contents('php://input'), true);

    $SQUARE_ACCESS_TOKEN = getenv('SQUARE_ACCESS_TOKEN') ?: 'EAAAl0j_Yx8fE69GiPLm7N3hmvuLAD2h6uRIaKomqSVfInluHW9gzA0twdKLPrn8';
    $SQUARE_LOCATION_ID = getenv('SQUARE_LOCATION_ID') ?: 'LPMZR4EC495TD';

    $amount = isset($data['amount']) ? round(floatval($data['amount']) * 100) : 0;
    $location = $data['location_id'] ?? $SQUARE_LOCATION_ID;

    if (!$data['token'] || $amount <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'token y amount son requeridos']);
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

    $url = "https://connect.squareupsandbox.com/v2/payments";
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $SQUARE_ACCESS_TOKEN,
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
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Ruta no encontrada', 'uri' => $uri]);