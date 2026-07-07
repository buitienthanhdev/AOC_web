<?php
/* ============================================================
   pref_api.php — Lưu/đọc BẢNG MÀU mà khách đã chọn, theo ĐỊA CHỈ IP.
   Không cần đăng nhập (khách vãng lai). Lần sau vào sẽ đề xuất lại.
   GET  → trả pref gần nhất của IP hiện tại.
   POST → upsert pref cho IP hiện tại (1 dòng/IP).
   Dữ liệu để trong cùng SQLite (data/colorai_history.db), bảng ip_pref.
   ============================================================ */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/db.php';

// IP thật của khách (sau Cloudflare → CF-Connecting-IP, do Cloudflare gán
// nên KHÔNG tự spoof được). KHÔNG dùng X-Forwarded-For — client tự set
// header này tuỳ ý, nếu tin sẽ cho phép giả IP người khác để đọc/ghi đè
// bảng màu đã lưu của họ (IDOR qua header spoofing).
function clientIP(): string {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
}

$db = getDB();
$db->exec("CREATE TABLE IF NOT EXISTS ip_pref (
    ip         TEXT PRIMARY KEY,
    data       TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
)");

$ip     = clientIP();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $db->prepare("SELECT data, updated_at FROM ip_pref WHERE ip = ?");
    $stmt->execute([$ip]);
    $row = $stmt->fetch();
    if (!$row || $row['data'] === '') { echo json_encode(['ok' => false]); exit; }
    echo json_encode([
        'ok'         => true,
        'updated_at' => $row['updated_at'],
        'pref'       => json_decode($row['data'], true),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $d = json_decode(file_get_contents('php://input'), true);
    if (!is_array($d)) { http_response_code(400); echo json_encode(['ok' => false, 'error' => 'bad json']); exit; }

    // Chỉ giữ các khoá cần thiết + giới hạn kích thước.
    $clean = [
        'palette_name' => substr((string)($d['palette_name'] ?? ''), 0, 200),
        'colors'       => is_array($d['colors'] ?? null) ? $d['colors'] : null,
        'full'         => array_slice(is_array($d['full'] ?? null) ? $d['full'] : [], 0, 40),
    ];
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE);
    if (strlen($json) > 20000) { http_response_code(413); echo json_encode(['ok' => false]); exit; }

    // Upsert thủ công (tương thích mọi phiên bản SQLite).
    $exists = $db->prepare("SELECT 1 FROM ip_pref WHERE ip = ?");
    $exists->execute([$ip]);
    if ($exists->fetchColumn()) {
        $db->prepare("UPDATE ip_pref SET data = ?, updated_at = datetime('now','localtime') WHERE ip = ?")
           ->execute([$json, $ip]);
    } else {
        $db->prepare("INSERT INTO ip_pref (ip, data) VALUES (?, ?)")->execute([$ip, $json]);
    }
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'method']);
