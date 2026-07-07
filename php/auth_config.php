<?php
// ══════════════════════════════════════════════════════════════
//  Google OAuth2 Credentials — đọc từ .env, KHÔNG hardcode
//  Lấy tại: https://console.cloud.google.com/apis/credentials
//  → Create credentials → OAuth client ID → Web application
//  Thêm Authorized redirect URIs:
//    http://localhost/auth.php          (dev)
//    https://kellymoore-usa.com/auth.php (prod)
// ══════════════════════════════════════════════════════════════

require_once __DIR__ . '/env_loader.php';

$_clientId     = getenv('GOOGLE_CLIENT_ID');
$_clientSecret = getenv('GOOGLE_CLIENT_SECRET');

if (!$_clientId || !$_clientSecret) {
    header('Content-Type: text/plain');
    http_response_code(500);
    die('Lỗi cấu hình: GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET phải được đặt trong file .env');
}

define('GOOGLE_CLIENT_ID',     $_clientId);
define('GOOGLE_CLIENT_SECRET', $_clientSecret);
unset($_clientId, $_clientSecret);

// Tự động chọn redirect URI theo môi trường
$_host = $_SERVER['HTTP_HOST'] ?? 'localhost';
define('GOOGLE_REDIRECT_URI',
    ($_host === 'kellymoore-usa.com' || $_host === 'www.kellymoore-usa.com')
        ? 'https://kellymoore-usa.com/auth.php'
        : 'http://localhost/auth.php'
);
