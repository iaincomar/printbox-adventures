<?php
error_reporting(E_ALL);
ini_set('display_errors', 0); // No mostrar errores en producción

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
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

header('Content-Type: application/json');

// ── /health ──
if ($uri === '/health') {
    echo json_encode(['ok' => true]);
    exit();
}

// ── /config GET ──
if ($uri === '/config' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $configDir = __DIR__ . '/config';
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

    $textosFile = $configDir . '/textos.txt';
    if (file_exists($textosFile)) {
        $lines = file($textosFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $keys  = ['text_es','text_en','text_fr','text_de','precio1','precio2','precio3','empresa'];
        foreach ($lines as $i => $line) {
            $val = trim(strpos($line, ':') !== false ? substr($line, strpos($line,':')+1) : $line);
            if (isset($keys[$i])) $textos[$keys[$i]] = $val;
        }
    }

    echo json_encode(['config' => $config, 'textos' => $textos]);
    exit();
}

// ── /config POST ── (igual que antes) ──
if ($uri === '/config' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $configDir = __DIR__ . '/config';
    if (!is_dir($configDir)) mkdir($configDir, 0755, true);

    if (isset($data['config'])) {
        $c = $data['config'];
        file_put_contents($configDir . '/servidor_api.txt', implode("\n", [
            'servidor;' . ($c['servidor'] ?? 'http://gestion.printboxweb.com'),
            'evento;'   . ($c['evento']    ?? ''),
            'timer;'    . ($c['timer']     ?? 5),
            'impresora;'. ($c['impresora'] ?? ''),
            'delay;'    . ($c['delay']     ?? 5),
        ]));
    }
    if (isset($data['textos'])) {
        $t = $data['textos'];
        file_put_contents($configDir . '/textos.txt', implode("\n", [
            'es:'      . ($t['text_es'] ?? ''),
            'en:'      . ($t['text_en'] ?? ''),
            'fr:'      . ($t['text_fr'] ?? ''),
            'de:'      . ($t['text_de'] ?? ''),
            'precio1:' . ($t['precio1'] ?? ''),
            'precio2:' . ($t['precio2'] ?? ''),
            'precio3:' . ($t['precio3'] ?? ''),
            'empresa:' . ($t['empresa'] ?? ''),
        ]));
    }
    echo json_encode(['ok' => true]);
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

    $SQUARE_ACCESS_TOKEN = getenv('SQUARE_ACCESS_TOKEN') ?: 'sandbox-sq0atb-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
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