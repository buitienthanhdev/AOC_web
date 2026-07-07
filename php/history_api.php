<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/csrf.php';

// KHÔNG dùng X-Forwarded-For — client tự set tuỳ ý, tin nó cho phép giả IP
// người khác (xem cùng lỗi đã vá ở pref_api.php). Chỉ tin CF-Connecting-IP
// (Cloudflare gán) hoặc REMOTE_ADDR.
function clientIP(): string {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
}

$uid    = !empty($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
$method = $_SERVER['REQUEST_METHOD'];

// ── POST: lưu lịch sử (chỉ khi đã đăng nhập) ────────────────
if ($method === 'POST') {
    if (!$uid) {
        echo json_encode(['ok' => false, 'reason' => 'guest']);
        exit;
    }
    csrfVerify();

    $d    = json_decode(file_get_contents('php://input'), true) ?? [];
    $db   = getDB();
    $stmt = $db->prepare(
        "INSERT INTO color_history
            (user_id, ip, wall_hex, wall_name, trim_hex, trim_name, frame_hex, frame_name,
             palette_name, image_filename, day_url, night_url)
         VALUES
            (:uid,:ip,:wh,:wn,:th,:tn,:fh,:fn,:pal,:img,:day,:night)"
    );
    $stmt->execute([
        ':uid'   => $uid,
        ':ip'    => clientIP(),
        ':wh'    => substr($d['wall_hex']       ?? '', 0, 7),
        ':wn'    => substr($d['wall_name']      ?? '', 0, 200),
        ':th'    => substr($d['trim_hex']       ?? '', 0, 7),
        ':tn'    => substr($d['trim_name']      ?? '', 0, 200),
        ':fh'    => substr($d['frame_hex']      ?? '', 0, 7),
        ':fn'    => substr($d['frame_name']     ?? '', 0, 200),
        ':pal'   => substr($d['palette_name']   ?? '', 0, 500),
        ':img'   => substr($d['image_filename'] ?? '', 0, 400),
        ':day'   => $d['day_url']   ?? '',
        ':night' => $d['night_url'] ?? '',
    ]);

    echo json_encode(['ok' => true, 'id' => (int)$db->lastInsertId()]);
    exit;
}

// ── GET: lấy lịch sử ─────────────────────────────────────────
if ($method === 'GET') {
    $db = getDB();

    if ($uid) {
        // Người dùng đã đăng nhập → lịch sử theo user_id
        $stmt = $db->prepare(
            "SELECT id, wall_hex, wall_name, trim_hex, trim_name, frame_hex, frame_name,
                    palette_name, image_filename, day_url, night_url, created_at
             FROM color_history
             WHERE user_id = ?
             ORDER BY created_at DESC
             LIMIT 200"
        );
        $stmt->execute([$uid]);
    } else {
        // Khách → trả rỗng (history bar khách dùng input_files.php)
        echo json_encode([]);
        exit;
    }

    echo json_encode($stmt->fetchAll());
    exit;
}

// ── DELETE: xóa 1 bản ghi (chỉ chủ sở hữu) ──────────────────
if ($method === 'DELETE') {
    if (!$uid) { http_response_code(401); echo json_encode(['error'=>'Chưa đăng nhập']); exit; }
    csrfVerify();

    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { http_response_code(400); echo json_encode(['error'=>'Thiếu id']); exit; }

    $db = getDB();
    $db->prepare("DELETE FROM color_history WHERE id = ? AND user_id = ?")
       ->execute([$id, $uid]);

    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
