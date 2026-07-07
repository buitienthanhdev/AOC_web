<?php
/**
 * api.php — PHP Proxy for ComfyUI
 * Chuyển tiếp CÁC ENDPOINT NẰM TRONG ALLOWLIST bên dưới tới ComfyUI
 * (localhost:8188) — KHÔNG còn proxy mù mọi path như trước.
 */

require_once __DIR__ . '/env_loader.php';
require_once __DIR__ . '/db.php';
define('COMFYUI_URL', rtrim(getenv('COMFYUI_URL') ?: 'http://localhost:8188', '/'));
define('LOG_FILE', __DIR__ . '/api_proxy.log');

function logMsg($msg) {
    file_put_contents(LOG_FILE, '[' . date('Y-m-d H:i:s') . '] ' . $msg . "\n", FILE_APPEND);
}

// IP thật của khách — chỉ tin CF-Connecting-IP (Cloudflare gán, không tự
// spoof được) hoặc REMOTE_ADDR. KHÔNG dùng X-Forwarded-For (client tự set
// tuỳ ý, dùng để rate-limit sẽ bị bypass ngay lập tức nếu tin header đó).
function clientIP(): string {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
}

// Lấy path: /api/upload/image → /upload/image
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^/api(?=/|$)#', '', $path);
if (empty($path)) $path = '/';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$method = $_SERVER['REQUEST_METHOD'];

// ── Allowlist: endpoint này KHÔNG có auth (khách vãng lai gọi trực tiếp từ
// trình duyệt), nên trước đây forward MỌI path tới ComfyUI = ai chạm được
// qua Cloudflare Tunnel cũng gọi được các route quản trị nguy hiểm khác của
// ComfyUI (/interrupt, /free, /manager/*, /system_stats...) mà app không hề
// dùng tới. Chỉ 5 route dưới đây được js/api/comfyui.js gọi thật — chặn
// tuyệt đối phần còn lại.
$ALLOWED_ROUTES = [
    ['POST', '#^/upload/image$#'],
    ['POST', '#^/prompt$#'],
    ['GET',  '#^/history/[^/]+$#'],
    ['GET',  '#^/queue$#'],
    ['GET',  '#^/view$#'],
];
$routeOk = false;
foreach ($ALLOWED_ROUTES as [$m, $re]) {
    if ($method === $m && preg_match($re, $path)) { $routeOk = true; break; }
}
if (!$routeOk) {
    logMsg("Blocked (not in allowlist): $method $path");
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Endpoint not allowed']);
    exit;
}

// ── Rate-limit: /prompt kích hoạt render GPU nặng, endpoint không auth nên
// ai cũng gọi được — chặn dội request tối đa 10 lần/5 phút mỗi IP.
if ($method === 'POST' && $path === '/prompt') {
    $ip = clientIP();
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS api_rate_limit (ip TEXT NOT NULL, ts INTEGER NOT NULL)");
    $windowStart = time() - 300; // 5 phút
    $db->prepare("DELETE FROM api_rate_limit WHERE ts < ?")->execute([$windowStart]);
    $countStmt = $db->prepare("SELECT COUNT(*) FROM api_rate_limit WHERE ip = ? AND ts >= ?");
    $countStmt->execute([$ip, $windowStart]);
    if ((int)$countStmt->fetchColumn() >= 10) {
        logMsg("Rate limit hit: $ip");
        http_response_code(429);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Quá nhiều yêu cầu phối màu. Vui lòng thử lại sau ít phút.']);
        exit;
    }
    $db->prepare("INSERT INTO api_rate_limit (ip, ts) VALUES (?, ?)")->execute([$ip, time()]);
}

$url = COMFYUI_URL . $path;

if (!empty($_SERVER['QUERY_STRING'])) {
    $url .= '?' . $_SERVER['QUERY_STRING'];
}

logMsg("Proxying: $method $url");

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL,            $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT,        300);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST,  $method);

// Forward headers — bỏ qua các header mà ComfyUI security check sẽ reject
// ComfyUI v0.23+ so sánh Origin domain với Host domain, phải khớp nhau
$forwardHeaders = [];
if (function_exists('getallheaders')) {
    $skip = [
        'host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding',
        'origin', 'referer', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user',
    ];
    foreach (getallheaders() as $name => $value) {
        if (!in_array(strtolower($name), $skip)) {
            $forwardHeaders[] = "$name: $value";
        }
    }
}
// Ghi đè Origin/Referer/Host để ComfyUI tin đây là request nội bộ
$_comfyHost = parse_url(COMFYUI_URL, PHP_URL_HOST) . (parse_url(COMFYUI_URL, PHP_URL_PORT) ? ':' . parse_url(COMFYUI_URL, PHP_URL_PORT) : '');
$forwardHeaders[] = 'Host: ' . $_comfyHost;
$forwardHeaders[] = 'Origin: ' . COMFYUI_URL;
$forwardHeaders[] = 'Referer: ' . COMFYUI_URL . '/';

$contentType = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
$isRawImage  = (stripos($contentType, 'image/') !== false);
$isMultipart = stripos($contentType, 'multipart/form-data') !== false;

// Strip Content-Type header — will be set by cURL for multipart
$headersNoContentType = array_values(array_filter($forwardHeaders, fn($h) => stripos($h, 'content-type:') !== 0));

if (in_array($method, ['POST', 'PUT', 'PATCH'])) {
    if ($isRawImage) {
        // Client gửi raw binary ĐÚNG định dạng gốc (Content-Type thật, vd
        // image/png|image/webp|... — không còn ép JPEG phía client nữa) +
        // header X-Filename. Đọc thẳng từ php://input, không qua $_FILES —
        // tránh PHP multipart parse. Giữ NGUYÊN mime + đuôi file thật khi
        // forward cho ComfyUI, không hardcode .jpg/image/jpeg (trước đây ép
        // cứng khiến PNG/WEBP... bị dán nhãn sai khi tới ComfyUI).
        $rawBody  = file_get_contents('php://input');
        $filename = isset($_SERVER['HTTP_X_FILENAME']) ? basename($_SERVER['HTTP_X_FILENAME']) : 'upload.jpg';
        $ext      = pathinfo($filename, PATHINFO_EXTENSION);
        if ($ext === '') $ext = 'jpg';
        $tmpFile  = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'comfy_' . uniqid() . '.' . $ext;
        file_put_contents($tmpFile, $rawBody);
        register_shutdown_function(function () use ($tmpFile) { if (file_exists($tmpFile)) @unlink($tmpFile); });

        $mime = $isRawImage ? $contentType : 'application/octet-stream';
        $postFields = [
            'image'     => new CURLFile($tmpFile, $mime, $filename),
            'overwrite' => 'true',
        ];
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headersNoContentType);
        logMsg("Raw image upload: " . strlen($rawBody) . " bytes as $filename");

    } elseif ($isMultipart) {
        // Fallback multipart rebuild (không còn dùng từ JS nhưng giữ cho tương thích)
        $postFields = [];
        foreach ($_POST as $k => $v) { $postFields[$k] = $v; }
        foreach ($_FILES as $fieldName => $fileInfo) {
            if (is_array($fileInfo['name'])) {
                foreach ($fileInfo['name'] as $i => $fname) {
                    if ($fileInfo['error'][$i] === UPLOAD_ERR_OK) {
                        $postFields[$fieldName . '[' . $i . ']'] = new CURLFile(
                            $fileInfo['tmp_name'][$i], $fileInfo['type'][$i], $fname
                        );
                    }
                }
            } else {
                if ($fileInfo['error'] === UPLOAD_ERR_OK) {
                    $postFields[$fieldName] = new CURLFile(
                        $fileInfo['tmp_name'], $fileInfo['type'], $fileInfo['name']
                    );
                }
            }
        }
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headersNoContentType);
        logMsg("Multipart fallback: " . count($_FILES) . " file(s)");

    } else {
        // JSON hoặc raw body
        $body = file_get_contents('php://input');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        if (!empty($forwardHeaders)) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);
        }
        logMsg("JSON/raw body: " . strlen($body) . " bytes");
    }
} else {
    // GET / DELETE
    if (!empty($forwardHeaders)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);
    }
}

$response     = curl_exec($ch);
$http_code    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError    = curl_error($ch);
$content_type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($curlError) {
    logMsg("cURL error: $curlError");
} elseif ($http_code >= 400) {
    logMsg("Response code: $http_code | " . substr($response, 0, 300));
} else {
    logMsg("Response code: $http_code (OK)");
}

if ($content_type) {
    header("Content-Type: $content_type");
} else {
    header('Content-Type: application/json');
}

http_response_code($http_code ?: 502);

if ($curlError) {
    echo json_encode(['error' => 'Proxy error: ' . $curlError]);
} else {
    echo $response ?: '';
}
