<?php
// Activar reporte de errores para depurar
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Test básico - comprobar que PHP funciona y curl está disponible
$uri = $_SERVER['REQUEST_URI'];
$uri = preg_replace('#^/PrintBox_Adventure#', '', $uri);
$uri = strtok($uri, '?');

// Diagnóstico
if ($uri === '/proxy.php' || $uri === '/') {
    echo json_encode([
        'status' => 'ok',
        'php_version' => PHP_VERSION,
        'curl_available' => function_exists('curl_init'),
        'uri' => $uri,
        'tmp_dir' => sys_get_temp_dir(),
        'tmp_writable' => is_writable(sys_get_temp_dir()),
    ]);
    exit();
}

if (!function_exists('curl_init')) {
    http_response_code(500);
    echo json_encode(['error' => 'cURL no está disponible en este servidor']);
    exit();
}

$PRINTBOX_BASE = 'http://gestion.printboxweb.com';
$cookiePath = sys_get_temp_dir() . '/pba_cookies.txt';

function getCsrfToken() {
    global $PRINTBOX_BASE, $cookiePath;
    $ch = curl_init($PRINTBOX_BASE . '/sanctum/csrf-cookie');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_COOKIEJAR, $cookiePath);
    curl_setopt($ch, CURLOPT_COOKIEFILE, $cookiePath);
    curl_exec($ch);
    curl_close($ch);

    if (file_exists($cookiePath)) {
        $cookies = file_get_contents($cookiePath);
        if (preg_match('/XSRF-TOKEN\s+([^\s]+)/', $cookies, $m)) {
            return urldecode($m[1]);
        }
    }
    return null;
}

function proxyPost($url, $data, $extraHeaders = []) {
    global $cookiePath;
    $ch = curl_init($url);
    $json = json_encode($data);
    $headers = array_merge([
        'Content-Type: application/json',
        'Accept: application/json',
        'Content-Length: ' . strlen($json),
    ], $extraHeaders);

    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_COOKIEJAR, $cookiePath);
    curl_setopt($ch, CURLOPT_COOKIEFILE, $cookiePath);

    $response = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    return ['code' => $code, 'body' => $response, 'error' => $error];
}

$body = file_get_contents('php://input');
$data = json_decode($body, true) ?? [];

// ── /health ──────────────────────────────────────────────────────────────────
if ($uri === '/health') {
    echo json_encode(['ok' => true]);
    exit();
}

// ── /config GET ──────────────────────────────────────────────────────────────
if ($uri === '/config' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $configDir = __DIR__ . '/config';
    $config = ['servidor'=>'http://gestion.printboxweb.com','evento'=>'','timer'=>5,'impresora'=>'','delay'=>5];
    $textos = ['text_es'=>'','text_en'=>'','text_fr'=>'','text_de'=>'','precio1'=>'','precio2'=>'','precio3'=>'','empresa'=>''];

    $apiFile = $configDir . '/servidor_api.txt';
    if (file_exists($apiFile)) {
        $lines = file($apiFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $keys = ['servidor','evento','timer','impresora','delay'];
        foreach ($lines as $i => $line) {
            $val = trim(strpos($line,';')!==false ? explode(';',$line,2)[1] : $line);
            if (isset($keys[$i])) {
                $config[$keys[$i]] = in_array($keys[$i],['timer','delay']) ? ((int)$val ?: 5) : $val;
            }
        }
    }

    $textosFile = $configDir . '/textos.txt';
    if (file_exists($textosFile)) {
        $lines = file($textosFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $keys = ['text_es','text_en','text_fr','text_de','precio1','precio2','precio3','empresa'];
        foreach ($lines as $i => $line) {
            $val = trim(strpos($line,':')!==false ? substr($line, strpos($line,':')+1) : $line);
            if (isset($keys[$i])) $textos[$keys[$i]] = $val;
        }
    }

    echo json_encode(['config'=>$config,'textos'=>$textos]);
    exit();
}

// ── /config POST ─────────────────────────────────────────────────────────────
if ($uri === '/config' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $configDir = __DIR__ . '/config';
    if (!is_dir($configDir)) mkdir($configDir, 0755, true);

    if (isset($data['config'])) {
        $c = $data['config'];
        file_put_contents($configDir.'/servidor_api.txt', implode("\n", [
            'servidor;'.($c['servidor']??'http://gestion.printboxweb.com'),
            'evento;'.($c['evento']??''),
            'timer;'.($c['timer']??5),
            'impresora;'.($c['impresora']??''),
            'delay;'.($c['delay']??5),
        ]));
    }
    if (isset($data['textos'])) {
        $t = $data['textos'];
        file_put_contents($configDir.'/textos.txt', implode("\n", [
            'es:'.($t['text_es']??''), 'en:'.($t['text_en']??''),
            'fr:'.($t['text_fr']??''), 'de:'.($t['text_de']??''),
            'precio1:'.($t['precio1']??''), 'precio2:'.($t['precio2']??''),
            'precio3:'.($t['precio3']??''), 'empresa:'.($t['empresa']??''),
        ]));
    }
    echo json_encode(['ok'=>true]);
    exit();
}

// ── /print/count ─────────────────────────────────────────────────────────────
if ($uri === '/print/count') { echo json_encode(['count'=>0]); exit(); }
if ($uri === '/print/printers') { echo json_encode(['printers'=>[]]); exit(); }
if ($uri === '/print/job') { echo json_encode(['ok'=>true,'count'=>0]); exit(); }

// ── /printbox/* ───────────────────────────────────────────────────────────────
if (strpos($uri, '/printbox/') === 0) {
    getCsrfToken();
    $csrf = getCsrfToken();
    $headers = $csrf ? ['X-XSRF-TOKEN: ' . $csrf] : [];

    if ($uri === '/printbox/find-event') {
        $result = proxyPost($PRINTBOX_BASE.'/api/v1/events/find', $data, $headers);
        if ($result['error']) { http_response_code(500); echo json_encode(['error'=>$result['error']]); exit(); }
        $resp = json_decode($result['body'], true);
        if ($result['code'] === 200 && isset($resp['data']['uuid'])) {
            echo json_encode(['uuid'=>$resp['data']['uuid']]);
        } else {
            http_response_code($result['code']);
            echo $result['body'];
        }
        exit();
    }

    if ($uri === '/printbox/photos') {
        $page = $_GET['page'] ?? 1;
        $result = proxyPost($PRINTBOX_BASE.'/api/v1/events/photos?page='.$page, $data, $headers);
        http_response_code($result['code']);
        echo $result['body'];
        exit();
    }

    if ($uri === '/printbox/photos-to-print') {
        $result = proxyPost($PRINTBOX_BASE.'/api/v1/events/photos_two', $data, $headers);
        http_response_code($result['code']);
        echo $result['body'];
        exit();
    }

    if ($uri === '/printbox/photo-send') {
        $result = proxyPost($PRINTBOX_BASE.'/api/v1/events/photo/send', $data, $headers);
        http_response_code($result['code']);
        echo $result['body'];
        exit();
    }
}

http_response_code(404);
echo json_encode(['error' => 'Ruta no encontrada', 'uri' => $uri]);