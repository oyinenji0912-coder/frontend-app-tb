<?php

header('Content-Type: application/json');

// 1. Handling CORS (Multi-Origin / Production & Dev)
$allowed_origins = [
    'https://puskesmaskebonjeruk.jakarta.go.id',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:8888',
    'http://127.0.0.1:8888'
];

$http_origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($http_origin, $allowed_origins)) {
    header("Access-Control-Allow-Origin: $http_origin");
} else {
    header("Access-Control-Allow-Origin: https://puskesmaskebonjeruk.jakarta.go.id");
}

header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With, Accept, X-Filename, x-filename");
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Target URL mengarah ke Backend NestJS
define('TARGET_BASE_URL', 'http://10.15.102.73:8766/');

$endpoint = isset($_GET['endpoint']) ? trim($_GET['endpoint'], '/') : '';

if ($endpoint === '') {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "error_source" => "Bridge PHP",
        "error_message" => "Parameter 'endpoint' wajib diisi."
    ]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$targetUrl = TARGET_BASE_URL . $endpoint;

if ($method === 'GET') {
    $extraParams = $_GET;
    unset($extraParams['endpoint']);
    if (!empty($extraParams)) {
        $targetUrl .= '?' . http_build_query($extraParams);
    }
}

$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
$isMultipart = (stristr($contentType, 'multipart/form-data') !== false);

$curl = curl_init();
curl_setopt($curl, CURLOPT_URL, $targetUrl);
curl_setopt($curl, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 15);
curl_setopt($curl, CURLOPT_TIMEOUT, 120); // Timeout 2 menit untuk upload file besar
curl_setopt($curl, CURLOPT_HEADER, 1);

$headers = [];

// Teruskan Content-Type
if (!$isMultipart) {
    if (isset($_SERVER['CONTENT_TYPE'])) {
        $headers[] = 'Content-Type: ' . $_SERVER['CONTENT_TYPE'];
    } else {
        $headers[] = 'Content-Type: application/json';
    }
}

// 2. Teruskan Header X-Filename (Case Insensitive untuk NestJS @Headers)
$xFilename = $_SERVER['HTTP_X_FILENAME'] ?? $_SERVER['HTTP_X_FILENAME_LOWER'] ?? '';
if ($xFilename !== '') {
    $headers[] = 'X-Filename: ' . $xFilename;
    $headers[] = 'x-filename: ' . $xFilename;
}

// 3. Teruskan Cookie Session
if (isset($_COOKIE['kawaltb_session'])) {
    $headers[] = 'Cookie: kawaltb_session=' . $_COOKIE['kawaltb_session'];
} elseif (isset($_COOKIE['connect.sid'])) {
    $headers[] = 'Cookie: connect.sid=' . $_COOKIE['connect.sid'];
}

switch ($method) {
    case 'POST':
        curl_setopt($curl, CURLOPT_POST, 1);
        if ($isMultipart) {
            $postData = $_POST;
            if (!empty($_FILES)) {
                foreach ($_FILES as $key => $fileInfo) {
                    if (is_array($fileInfo['tmp_name'])) {
                        foreach ($fileInfo['tmp_name'] as $idx => $tmpName) {
                            if (!empty($tmpName) && is_uploaded_file($tmpName)) {
                                $postData["{$key}[{$idx}]"] = new CURLFile(
                                    $tmpName,
                                    $fileInfo['type'][$idx],
                                    $fileInfo['name'][$idx]
                                );
                            }
                        }
                    } else {
                        if (!empty($fileInfo['tmp_name']) && is_uploaded_file($fileInfo['tmp_name'])) {
                            $postData[$key] = new CURLFile(
                                $fileInfo['tmp_name'],
                                $fileInfo['type'],
                                $fileInfo['name']
                            );
                        }
                    }
                }
            }
            curl_setopt($curl, CURLOPT_POSTFIELDS, $postData);
        } else {
            // Raw binary file upload (Support Buffer Import Pasien/Tracing)
            $rawBody = file_get_contents('php://input');
            curl_setopt($curl, CURLOPT_POSTFIELDS, $rawBody);
            $headers[] = 'Content-Length: ' . strlen($rawBody);
        }
        break;

    case 'PUT':
    case 'DELETE':
        curl_setopt($curl, CURLOPT_CUSTOMREQUEST, $method);
        $rawBody = file_get_contents('php://input');
        if ($rawBody !== '') {
            curl_setopt($curl, CURLOPT_POSTFIELDS, $rawBody);
            $headers[] = 'Content-Length: ' . strlen($rawBody);
        }
        break;

    case 'GET':
    default:
        break;
}

curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);

$response = curl_exec($curl);

if (curl_errno($curl)) {
    $errorMsg = curl_error($curl);
    curl_close($curl);
    http_response_code(502);
    echo json_encode([
        "success" => false,
        "error_source" => "cURL PHP Client",
        "error_message" => $errorMsg,
        "target_url" => $targetUrl
    ]);
    exit;
}

$httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($curl, CURLINFO_HEADER_SIZE);
curl_close($curl);

// Pisahkan Header dan Body Response dari NestJS
$responseHeaders = substr($response, 0, $headerSize);
$result = substr($response, $headerSize);

if ($result === '' || $result === false) {
    http_response_code(502);
    echo json_encode([
        "success" => false,
        "error_source" => "Target Server",
        "error_message" => "Server merespon dengan data kosong (Empty Response)."
    ]);
    exit;
}

// 4. Set-Cookie Pass-Through dari NestJS ke Browser
preg_match_all('/^Set-Cookie:\s*([^;]*)/mi', $responseHeaders, $matches);
if (!empty($matches[1])) {
    foreach ($matches[1] as $item) {
        parse_str($item, $cookieInfo);
        foreach ($cookieInfo as $cookieName => $cookieValue) {
            setcookie($cookieName, $cookieValue, [
                'expires' => time() + 28800, // 8 Jam
                'path' => '/',
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
        }
    }
}

// Logout handling
if ($httpCode === 200 && $endpoint === 'api/auth/logout') {
    setcookie('kawaltb_session', '', ['expires' => time() - 3600, 'path' => '/']);
    setcookie('connect.sid', '', ['expires' => time() - 3600, 'path' => '/']);
}

http_response_code($httpCode ?: 200);
echo $result;