<?php

header('Content-Type: application/json');

// 1. Izinkan Origin Website Publik Kawal TB
$allowed_origin = 'https://puskesmaskebonjeruk.jakarta.go.id';
header("Access-Control-Allow-Origin: $allowed_origin");
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With, Accept");
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// 2. Sesuaikan Port Target Backend NestJS Kawal TB (Port 8766)
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
curl_setopt($curl, CURLOPT_CONNECTTIMEOUT, 10);
curl_setopt($curl, CURLOPT_TIMEOUT, 30);

$headers = [];

if (!$isMultipart) {
    if (isset($_SERVER['CONTENT_TYPE'])) {
        $headers[] = 'Content-Type: ' . $_SERVER['CONTENT_TYPE'];
    } else {
        $headers[] = 'Content-Type: application/json';
    }
}

// Teruskan header khusus (seperti X-Filename jika ada upload raw file)
if (isset($_SERVER['HTTP_X_FILENAME'])) {
    $headers[] = 'X-Filename: ' . $_SERVER['HTTP_X_FILENAME'];
}

// 3. Sesuaikan Nama Cookie Autentikasi untuk Kawal TB
if (isset($_COOKIE['kawaltb_session'])) {
    $headers[] = 'Cookie: kawaltb_session=' . $_COOKIE['kawaltb_session'];
}

curl_setopt($curl, CURLOPT_HTTPHEADER, $headers);

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
            $rawBody = file_get_contents('php://input');
            if ($rawBody !== '') {
                curl_setopt($curl, CURLOPT_POSTFIELDS, $rawBody);
            }
        }
        break;

    case 'PUT':
    case 'DELETE':
        curl_setopt($curl, CURLOPT_CUSTOMREQUEST, $method);
        $rawBody = file_get_contents('php://input');
        if ($rawBody !== '') {
            curl_setopt($curl, CURLOPT_POSTFIELDS, $rawBody);
        }
        break;

    case 'GET':
    default:
        break;
}

$result = curl_exec($curl);

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
curl_close($curl);

if ($result === '' || $result === false) {
    http_response_code(502);
    echo json_encode([
        "success" => false,
        "error_source" => "Target Server",
        "error_message" => "Server merespon dengan data kosong (Empty Response)."
    ]);
    exit;
}

// 4. Sesuaikan Handling Login & Logout Endpoint Kawal TB
if ($httpCode === 200) {
    if ($endpoint === 'api/auth/logout') {
        setcookie('kawaltb_session', '', [
            'expires' => time() - 3600,
            'path' => '/'
        ]);
    }
}

http_response_code($httpCode ?: 200);
echo $result;