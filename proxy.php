<?php
/**
 * proxy.php - Proxy para PrintboxAdventures
 * Reemplaza el backend Express en entornos Apache (IONOS)
 * Coloca este archivo en la raíz de PrintBox_Adventure/
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$PRINTBOX_BASE = 'http://gestion.printboxweb.com';

// Leer el body de la petición
$body = file_get_contents('php://input');
$data = json_decode($body, true) ?? [];

// Obtener la ruta solicitada
$uri = $_SERVER['REQUEST_URI'];
// Quitar el prefijo de la carpeta si existe
$uri = preg_replace('#^/PrintBox_Adventure#', '', $uri);
$uri = strtok($uri, '?'); // quitar query string

// ── Función para hacer peticiones cURL ──────────────────────────────────────
function curlRequest($url, $method = 'GET', $data = null, $headers = [], $cookieFile = null) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HEADER, true);

    $defaultHeaders = ['Content-Type: application/json', 'Accept: application/json'];
    curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($defaultHeaders, $headers));

    if ($data !== null) {
        $json = json_encode($data);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
    }

    // Cookie jar para mantener sesión CSRF
    $cookiePath = sys_get_temp_dir() . '/pba_cookies.txt';
    curl_setopt($ch, CURLOPT_COOKIEJAR, $cookiePath);
    curl_setopt($ch, CURLOPT_COOKIEFILE, $cookiePath);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    $responseHeaders = substr($response, 0, $headerSize);
    $responseBody = substr($response, $headerSize);

    return ['code' => $httpCode, 'body' => $responseBody, 'headers' => $responseHeaders];
}

// ── Obtener token CSRF ───────────────────────────────────────────────────────
function getCsrfToken() {
    global $PRINTBOX_BASE;
    $cookiePath = sys_get_temp_dir() . '/pba_cookies.txt';

    $ch = curl_init($PRINTBOX_BASE . '/sanctum/csrf-cookie');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_COOKIEJAR, $cookiePath);
    curl_setopt($ch, CURLOPT_COOKIEFILE, $cookiePath);
    curl_exec($ch);
    curl_close($ch);

    // Leer el token de las cookies
    if (file_exists($cookiePath)) {
        $cookies = file_get_contents($cookiePath);
        if (preg_match('/XSRF-TOKEN\s+([^\s]+)/', $cookies, $matches)) {
            return urldecode($matches[1]);
        }
    }
    return null;
}

// ── Rutas ────────────────────────────────────────────────────────────────────

// GET /health
if ($uri === '/health') {
    echo json_encode(['ok' => true]);
    exit();
}

// GET /config
if ($uri === '/config' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $configDir = __DIR__ . '/config';

    $config = [
        'servidor' => 'http://gestion.printboxweb.com',
        'evento'   => '',
        'timer'    => 5,
        'impresora'=> '',
        'delay'    => 5,
    ];
    $textos = [
        'text_es' => '', 'text_en' => '', 'text_fr' => '', 'text_de' => '',
        'precio1' => '', 'precio2' => '', 'precio3' => '', 'empresa' => '',
    ];

    $apiFile = $configDir . '/servidor_api.txt';
    if (file_exists($apiFile)) {
        $lines = file($apiFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $keys = ['servidor', 'evento', 'timer', 'impresora', 'delay'];
        foreach ($lines as $i => $line) {
            $val = strpos($line, ';') !== false ? explode(';', $line, 2)[1] : $line;
            $val = trim($val);
            if (isset($keys[$i])) {
                if ($keys[$i] === 'timer' || $keys[$i] === 'delay') $val = (int)$val ?: 5;
                $config[$keys[$i]] = $val;
            }
        }
    }

    $textosFile = $configDir . '/textos.txt';
    if (file_exists($textosFile)) {
        $lines = file($textosFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $keys = ['text_es', 'text_en', 'text_fr', 'text_de', 'precio1', 'precio2', 'precio3', 'empresa'];
        foreach ($lines as $i => $line) {
            $val = strpos($line, ':') !== false ? substr($line, strpos($line, ':') + 1) : $line;
            $val = trim($val);
            if (isset($keys[$i])) $textos[$keys[$i]] = $val;
        }
    }

    echo json_encode(['config' => $config, 'textos' => $textos]);
    exit();
}

// POST /config
if ($uri === '/config' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $configDir = __DIR__ . '/config';
    if (!is_dir($configDir)) mkdir($configDir, 0755, true);

    if (isset($data['config'])) {
        $c = $data['config'];
        $lines = [
            'servidor;' . ($c['servidor'] ?? 'http://gestion.printboxweb.com'),
            'evento;'   . ($c['evento']    ?? ''),
            'timer;'    . ($c['timer']     ?? 5),
            'impresora;'. ($c['impresora'] ?? ''),
            'delay;'    . ($c['delay']     ?? 5),
        ];
        file_put_contents($configDir . '/servidor_api.txt', implode("\n", $lines));
    }

    if (isset($data['textos'])) {
        $t = $data['textos'];
        $lines = [
            'es:'      . ($t['text_es'] ?? ''),
            'en:'      . ($t['text_en'] ?? ''),
            'fr:'      . ($t['text_fr'] ?? ''),
            'de:'      . ($t['text_de'] ?? ''),
            'precio1:' . ($t['precio1'] ?? ''),
            'precio2:' . ($t['precio2'] ?? ''),
            'precio3:' . ($t['precio3'] ?? ''),
            'empresa:' . ($t['empresa'] ?? ''),
        ];
        file_put_contents($configDir . '/textos.txt', implode("\n", $lines));
    }

    echo json_encode(['ok' => true]);
    exit();
}

// GET /print/count — siempre 0 en web (no hay impresora física)
if ($uri === '/print/count') {
    echo json_encode(['count' => 0]);
    exit();
}

// GET /print/printers — no aplica en web
if ($uri === '/print/printers') {
    echo json_encode(['printers' => []]);
    exit();
}

// POST /print/job — no aplica en web (la impresión la gestiona el PC con Electron)
if ($uri === '/print/job') {
    echo json_encode(['ok' => true, 'count' => 0, 'message' => 'Impresión gestionada por el operador']);
    exit();
}

// ── Rutas Printbox (proxy a gestion.printboxweb.com) ────────────────────────

// POST /printbox/find-event
if ($uri === '/printbox/find-event') {
    getCsrfToken();
    $csrfToken = getCsrfToken();
    $headers = $csrfToken ? ['X-XSRF-TOKEN: ' . $csrfToken] : [];

    $result = curlRequest(
        $PRINTBOX_BASE . '/api/v1/events/find',
        'POST',
        $data,
        $headers
    );

    $responseData = json_decode($result['body'], true);
    if ($result['code'] === 200 && isset($responseData['data']['uuid'])) {
        echo json_encode(['uuid' => $responseData['data']['uuid']]);
    } else {
        http_response_code($result['code']);
        echo $result['body'];
    }
    exit();
}

// POST /printbox/photos
if ($uri === '/printbox/photos') {
    getCsrfToken();
    $csrfToken = getCsrfToken();
    $headers = $csrfToken ? ['X-XSRF-TOKEN: ' . $csrfToken] : [];
    $page = $_GET['page'] ?? 1;

    $result = curlRequest(
        $PRINTBOX_BASE . '/api/v1/events/photos?page=' . $page,
        'POST',
        $data,
        $headers
    );

    http_response_code($result['code']);
    echo $result['body'];
    exit();
}

// POST /printbox/photos-to-print
if ($uri === '/printbox/photos-to-print') {
    getCsrfToken();
    $csrfToken = getCsrfToken();
    $headers = $csrfToken ? ['X-XSRF-TOKEN: ' . $csrfToken] : [];

    $result = curlRequest(
        $PRINTBOX_BASE . '/api/v1/events/photos_two',
        'POST',
        $data,
        $headers
    );

    http_response_code($result['code']);
    echo $result['body'];
    exit();
}

// POST /printbox/photo-send
if ($uri === '/printbox/photo-send') {
    getCsrfToken();
    $csrfToken = getCsrfToken();
    $headers = $csrfToken ? ['X-XSRF-TOKEN: ' . $csrfToken] : [];

    $result = curlRequest(
        $PRINTBOX_BASE . '/api/v1/events/photo/send',
        'POST',
        $data,
        $headers
    );

    http_response_code($result['code']);
    echo $result['body'];
    exit();
}

// Ruta no encontrada
http_response_code(404);
echo json_encode(['error' => 'Ruta no encontrada: ' . $uri]);