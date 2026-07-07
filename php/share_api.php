<?php
// ══════════════════════════════════════════════════════════════
//  share_api.php — Tạo link chia sẻ công khai cho 1 kết quả phối màu
//  POST {palette_name, style_label, colors:[{label,hex,name,code}],
//        day_url, night_url}  →  {ok, id, url}
//  Trang xem: /share.php?id=<id> (không cần đăng nhập).
//  Không nhận URL tuỳ ý — chỉ chấp nhận ảnh cùng domain (/api/view?...)
//  để trang share không thành open-redirect/hotlink hộ người lạ.
// ══════════════════════════════════════════════════════════════
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/env_loader.php';
require_once __DIR__ . '/db.php';

function clientIP(): string {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
}

// URL ảnh hợp lệ = đường dẫn tương đối cùng domain tới ComfyUI proxy.
function validImageUrl(?string $u): string {
    if (!$u) return '';
    if (preg_match('#^/api/view\?[A-Za-z0-9_\-=&%.+]*$#', $u)) return substr($u, 0, 600);
    return '';
}

function validHex(?string $h): string {
    return preg_match('/^#[0-9a-fA-F]{6}$/', (string)$h) ? strtolower($h) : '';
}

$db = getDB();
$db->exec("CREATE TABLE IF NOT EXISTS shares (
    id         TEXT PRIMARY KEY,
    ip         TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
)");

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $ip = clientIP();

    // Rate-limit nhẹ: tối đa 30 link/ngày/IP — đủ dùng thật, chặn spam bot.
    $cnt = $db->prepare("SELECT COUNT(*) FROM shares WHERE ip = ? AND created_at >= datetime('now','localtime','-1 day')");
    $cnt->execute([$ip]);
    if ((int)$cnt->fetchColumn() >= 30) {
        http_response_code(429);
        echo json_encode(['ok' => false, 'error' => 'Đã tạo quá nhiều link hôm nay, thử lại sau.']);
        exit;
    }

    $d = json_decode(file_get_contents('php://input'), true) ?? [];

    $day   = validImageUrl($d['day_url']   ?? '');
    $night = validImageUrl($d['night_url'] ?? '');
    if ($day === '' && $night === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Thiếu ảnh kết quả để chia sẻ.']);
        exit;
    }

    $colors = [];
    foreach ((array)($d['colors'] ?? []) as $c) {
        if (!is_array($c)) continue;
        $hex = validHex($c['hex'] ?? '');
        if ($hex === '') continue;
        $colors[] = [
            'label' => mb_substr((string)($c['label'] ?? ''), 0, 60),
            'hex'   => $hex,
            'name'  => mb_substr((string)($c['name'] ?? ''), 0, 120),
            'code'  => mb_substr((string)($c['code'] ?? ''), 0, 30),
        ];
        if (count($colors) >= 20) break;
    }

    $payload = json_encode([
        'palette_name' => mb_substr((string)($d['palette_name'] ?? ''), 0, 200),
        'style_label'  => mb_substr((string)($d['style_label'] ?? ''), 0, 200),
        'colors'       => $colors,
        'day_url'      => $day,
        'night_url'    => $night,
    ], JSON_UNESCAPED_UNICODE);

    // id ngắn, không đoán được (12 ký tự base36 từ random_bytes).
    $id = substr(str_replace(['+', '/', '='], '', base64_encode(random_bytes(12))), 0, 12);

    $db->prepare("INSERT INTO shares (id, ip, data) VALUES (?, ?, ?)")->execute([$id, $ip, $payload]);

    // Link share phải là DOMAIN CÔNG KHAI (PUBLIC_BASE_URL trong .env) chứ
    // không phải host đang gõ — tạo trên localhost mà đưa link localhost cho
    // người ngoài thì không ai mở được (web chạy máy này qua Cloudflare Tunnel).
    $base = rtrim((string)(getenv('PUBLIC_BASE_URL') ?: ''), '/');
    if ($base === '') {
        $scheme = (!empty($_SERVER['HTTPS']) || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http';
        $base   = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }
    echo json_encode(['ok' => true, 'id' => $id, 'url' => "$base/share.php?id=$id"]);
    exit;
}

if ($method === 'GET') {
    $id = (string)($_GET['id'] ?? '');
    if (!preg_match('/^[A-Za-z0-9]{6,20}$/', $id)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'id không hợp lệ']);
        exit;
    }
    $stmt = $db->prepare("SELECT data, created_at FROM shares WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Không tìm thấy']);
        exit;
    }
    $data = json_decode($row['data'], true) ?? [];
    $data['created_at'] = $row['created_at'];
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
