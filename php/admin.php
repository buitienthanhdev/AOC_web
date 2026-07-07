<?php
// ══════════════════════════════════════════════════════════════
//  ColorAI — Admin Panel
//  Truy cập: kellymoore-usa.com/admin.php
// ══════════════════════════════════════════════════════════════
define('ADMIN_MODE', true);
define('ITEMS_PER_PAGE', 50);

session_start();
require_once __DIR__ . '/env_loader.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/csrf.php';
$csrfToken = csrfToken();
// Mọi form POST trong trang này PHẢI có token này — nếu không, ai đó dụ
// admin đang đăng nhập bấm/tự-submit 1 form ẩn từ trang khác (CSRF) là xoá
// được dữ liệu (delete_all, delete_user…) mà admin không hề chủ ý.
function csrfCheckPost(): bool {
    return hash_equals($_SESSION['csrf_token'] ?? '', (string)($_POST['_csrf'] ?? ''));
}

// Mật khẩu KHÔNG hardcode nữa — lấy HASH từ .env (ADMIN_PASSWORD_HASH).
// Tạo hash mới: chạy trong thư mục dự án:
//   php -r "echo password_hash('MAT_KHAU_MOI', PASSWORD_DEFAULT);"
// rồi dán vào .env dòng:  ADMIN_PASSWORD_HASH='$2y$...'
define('ADMIN_PASSWORD_HASH', getenv('ADMIN_PASSWORD_HASH') ?: '');
define('ADMIN_USERNAME', getenv('ADMIN_USERNAME') ?: 'admin');

// IP thật (Cloudflare gán CF-Connecting-IP, không tự spoof được).
function clientIP(): string {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
}

// ── Auth ─────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'login') {
    // Chặn brute-force: khoá 60s sau 5 lần sai. Khoá theo IP (lưu DB) thay vì
    // theo session — trước đây chỉ khoá theo session nên xoá cookie là reset
    // bộ đếm, đoán mật khẩu được vô hạn lần.
    $ip = clientIP();
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS admin_login_attempts (
        ip TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, until_ts INTEGER NOT NULL DEFAULT 0
    )");
    $now = time();
    $stmt = $db->prepare("SELECT n, until_ts FROM admin_login_attempts WHERE ip = ?");
    $stmt->execute([$ip]);
    $lock = $stmt->fetch() ?: ['n' => 0, 'until_ts' => 0];

    if ($lock['until_ts'] > $now) {
        $loginErr = 'Nhập sai quá nhiều. Thử lại sau ' . ($lock['until_ts'] - $now) . 's.';
    } elseif (ADMIN_PASSWORD_HASH === '') {
        $loginErr = 'Chưa cấu hình ADMIN_PASSWORD_HASH trong .env.';
    } elseif (hash_equals(ADMIN_USERNAME, (string)($_POST['username'] ?? ''))
              && password_verify((string)($_POST['password'] ?? ''), ADMIN_PASSWORD_HASH)) {
        session_regenerate_id(true);            // chống session fixation
        $_SESSION['admin_ok'] = true;
        $db->prepare("DELETE FROM admin_login_attempts WHERE ip = ?")->execute([$ip]);
        header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
        exit;
    } else {
        $n = $lock['n'] + 1;
        $until = $n >= 5 ? ($now + 60) : 0;
        if ($until) $n = 0;
        $db->prepare("INSERT INTO admin_login_attempts (ip, n, until_ts) VALUES (?, ?, ?)
            ON CONFLICT(ip) DO UPDATE SET n = excluded.n, until_ts = excluded.until_ts")
            ->execute([$ip, $n, $until]);
        $loginErr = 'Mật khẩu không đúng.';
    }
}
if (($_POST['action'] ?? '') === 'logout' && csrfCheckPost()) {
    session_destroy();
    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
    exit;
}

if (!($_SESSION['admin_ok'] ?? false)) { showLogin($loginErr ?? null); exit; }

// ── DB Actions ───────────────────────────────────────────────
$db = getDB();
$msg = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') !== 'login' && !csrfCheckPost()) {
    $msg = 'Phiên làm việc đã hết hạn hoặc yêu cầu không hợp lệ (CSRF) — vui lòng tải lại trang và thử lại.';
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $act = $_POST['action'] ?? '';

    if ($act === 'delete_one' && isset($_POST['id'])) {
        $db->prepare("DELETE FROM color_history WHERE id = ?")->execute([(int)$_POST['id']]);
        $msg = 'Đã xóa 1 bản ghi.';
    }
    if ($act === 'delete_bulk' && !empty($_POST['ids'])) {
        $ids = array_map('intval', (array)$_POST['ids']);
        $ph  = implode(',', array_fill(0, count($ids), '?'));
        $db->prepare("DELETE FROM color_history WHERE id IN ($ph)")->execute($ids);
        $msg = 'Đã xóa ' . count($ids) . ' bản ghi.';
    }
    if ($act === 'delete_ip' && isset($_POST['ip'])) {
        $db->prepare("DELETE FROM color_history WHERE ip = ?")->execute([$_POST['ip']]);
        $msg = 'Đã xóa toàn bộ lịch sử của IP ' . htmlspecialchars($_POST['ip']) . '.';
    }
    if ($act === 'clear_old' && isset($_POST['days'])) {
        $days = max(1, (int)$_POST['days']);
        $stmt = $db->prepare("DELETE FROM color_history WHERE created_at < datetime('now','localtime','-' || ? || ' days')");
        $stmt->execute([$days]);
        $msg = 'Đã xóa ' . $stmt->rowCount() . ' bản ghi cũ hơn ' . $days . ' ngày.';
    }
    if ($act === 'delete_all') {
        $db->exec("DELETE FROM color_history");
        $msg = 'Đã xóa toàn bộ lịch sử.';
    }
    if ($act === 'delete_user' && isset($_POST['user_id'])) {
        $uid = (int)$_POST['user_id'];
        $db->prepare("UPDATE color_history SET user_id = NULL WHERE user_id = ?")->execute([$uid]);
        $db->prepare("DELETE FROM users WHERE id = ?")->execute([$uid]);
        $msg = 'Đã xóa tài khoản người dùng #' . $uid . '.';
    }
}

// ── Export CSV ───────────────────────────────────────────────
if (($_GET['export'] ?? '') === 'csv') {
    $rows = $db->query("SELECT * FROM color_history ORDER BY created_at DESC")->fetchAll();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="color_history_' . date('Ymd_His') . '.csv"');
    $f = fopen('php://output', 'w');
    fprintf($f, chr(0xEF).chr(0xBB).chr(0xBF));
    fputcsv($f, ['ID','User ID','IP','Tường Hex','Tường Tên','Viền Hex','Viền Tên','Cửa Hex','Cửa Tên','Palette','File ảnh','Ngày tạo']);
    foreach ($rows as $r) {
        fputcsv($f, [$r['id'],$r['user_id']??'',$r['ip'],$r['wall_hex'],$r['wall_name'],$r['trim_hex'],$r['trim_name'],$r['frame_hex'],$r['frame_name'],$r['palette_name'],$r['image_filename'],$r['created_at']]);
    }
    fclose($f);
    exit;
}
if (($_GET['export'] ?? '') === 'users_csv') {
    $rows = $db->query(
        "SELECT u.id, u.name, u.email, u.phone, u.age, u.created_at,
                COUNT(h.id) as renders
         FROM users u LEFT JOIN color_history h ON h.user_id = u.id
         GROUP BY u.id ORDER BY u.created_at DESC"
    )->fetchAll();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="users_' . date('Ymd_His') . '.csv"');
    $f = fopen('php://output', 'w');
    fprintf($f, chr(0xEF).chr(0xBB).chr(0xBF));
    fputcsv($f, ['ID','Tên','Email','Điện thoại','Tuổi','Số lần phối','Ngày đăng ký']);
    foreach ($rows as $r) {
        fputcsv($f, [$r['id'],$r['name'],$r['email'],$r['phone'],$r['age'],$r['renders'],$r['created_at']]);
    }
    fclose($f);
    exit;
}

// ── Stats ────────────────────────────────────────────────────
$stats = [
    'total'        => (int)$db->query("SELECT COUNT(*) FROM color_history")->fetchColumn(),
    'today'        => (int)$db->query("SELECT COUNT(*) FROM color_history WHERE date(created_at) = date('now','localtime')")->fetchColumn(),
    'unique_ips'   => (int)$db->query("SELECT COUNT(DISTINCT ip) FROM color_history")->fetchColumn(),
    'this_week'    => (int)$db->query("SELECT COUNT(*) FROM color_history WHERE created_at >= datetime('now','localtime','-7 days')")->fetchColumn(),
    'total_users'  => (int)$db->query("SELECT COUNT(*) FROM users")->fetchColumn(),
    'users_today'  => (int)$db->query("SELECT COUNT(*) FROM users WHERE date(created_at) = date('now','localtime')")->fetchColumn(),
    'users_phone'  => (int)$db->query("SELECT COUNT(*) FROM users WHERE phone != ''")->fetchColumn(),
    'users_week'   => (int)$db->query("SELECT COUNT(*) FROM users WHERE created_at >= datetime('now','localtime','-7 days')")->fetchColumn(),
];

// ── Users list ───────────────────────────────────────────────
$uSearch = trim($_GET['usearch'] ?? '');
$uWhere  = $uSearch ? "WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ?)" : '';
$uParams = $uSearch ? ["%$uSearch%", "%$uSearch%", "%$uSearch%"] : [];
$userRows = $db->prepare(
    "SELECT u.id, u.name, u.email, u.phone, u.age, u.avatar, u.created_at,
            COUNT(h.id) as render_count
     FROM users u
     LEFT JOIN color_history h ON h.user_id = u.id
     $uWhere
     GROUP BY u.id
     ORDER BY u.created_at DESC LIMIT 100"
);
$userRows->execute($uParams);
$userRows = $userRows->fetchAll();

// ── Filters ──────────────────────────────────────────────────
$fIP   = trim($_GET['ip']   ?? '');
$fDate = trim($_GET['date'] ?? '');
$fHex  = trim($_GET['hex']  ?? '');
$fUser = (int)($_GET['user_id'] ?? 0);
$page  = max(1, (int)($_GET['page'] ?? 1));
$offset = ($page - 1) * ITEMS_PER_PAGE;

$where  = [];
$params = [];
if ($fIP)   { $where[] = 'ip LIKE ?';              $params[] = '%' . $fIP . '%'; }
if ($fDate) { $where[] = "date(created_at) = ?";    $params[] = $fDate; }
if ($fHex)  { $where[] = '(wall_hex = ? OR trim_hex = ? OR frame_hex = ?)'; $params[] = $fHex; $params[] = $fHex; $params[] = $fHex; }
// Link "N lần" ở tab Người dùng trỏ ?user_id=… — trước đây tham số này bị
// BỎ QUA nên bấm vào vẫn thấy lịch sử của tất cả mọi người.
if ($fUser) { $where[] = 'user_id = ?'; $params[] = $fUser; }

$whereSQL  = $where ? 'WHERE ' . implode(' AND ', $where) : '';

$totalRows = (int)$db->prepare("SELECT COUNT(*) FROM color_history $whereSQL")->execute($params) ?
             $db->prepare("SELECT COUNT(*) FROM color_history $whereSQL")->execute($params) : 0;

$cntStmt = $db->prepare("SELECT COUNT(*) FROM color_history $whereSQL");
$cntStmt->execute($params);
$totalRows  = (int)$cntStmt->fetchColumn();
$totalPages = max(1, (int)ceil($totalRows / ITEMS_PER_PAGE));

$rowStmt = $db->prepare("SELECT * FROM color_history $whereSQL ORDER BY created_at DESC LIMIT " . ITEMS_PER_PAGE . " OFFSET $offset");
$rowStmt->execute($params);
$rows = $rowStmt->fetchAll();

// ── Top IPs ──────────────────────────────────────────────────
$topIPs = $db->query(
    "SELECT ip, COUNT(*) as cnt, MAX(created_at) as last_seen
     FROM color_history GROUP BY ip ORDER BY cnt DESC LIMIT 15"
)->fetchAll();

// ── Xu hướng: phương án màu + màu tường được chọn nhiều nhất ──
// (gộp tên rỗng vào '—' để không vỡ layout khi palette_name null/blank)
$topPalettes = $db->query(
    "SELECT COALESCE(NULLIF(palette_name, ''), '—') as name, COUNT(*) as cnt
     FROM color_history GROUP BY name ORDER BY cnt DESC LIMIT 8"
)->fetchAll();
$topWallColors = $db->query(
    "SELECT wall_hex as hex, COALESCE(NULLIF(wall_name, ''), wall_hex) as name, COUNT(*) as cnt
     FROM color_history WHERE wall_hex IS NOT NULL AND wall_hex != ''
     GROUP BY wall_hex ORDER BY cnt DESC LIMIT 8"
)->fetchAll();

// ── Daily chart data (last 14 days) ─────────────────────────
$chartData = $db->query(
    "SELECT date(created_at) as d, COUNT(*) as n
     FROM color_history
     WHERE created_at >= datetime('now','localtime','-13 days')
     GROUP BY d ORDER BY d"
)->fetchAll(PDO::FETCH_KEY_PAIR);

$chartDays = [];
for ($i = 13; $i >= 0; $i--) {
    $d = date('Y-m-d', strtotime("-$i days"));
    $chartDays[$d] = $chartData[$d] ?? 0;
}
$chartMax = max(1, max($chartDays));

// ─────────────────────────────────────────────────────────────
showPage($db, $stats, $rows, $totalRows, $totalPages, $page,
         $topIPs, $chartDays, $chartMax, $msg,
         $fIP, $fDate, $fHex, $userRows, $uSearch,
         $topPalettes, $topWallColors);

// ══════════════════════════════════════════════════════════════
//  RENDER FUNCTIONS
// ══════════════════════════════════════════════════════════════
function showLogin(?string $err): void { ?>
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ColorAI Admin — Đăng nhập</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;
     background:#0f2419;font-family:system-ui,sans-serif}
.card{background:#fff;border-radius:16px;padding:40px 36px;width:340px;
      box-shadow:0 20px 60px rgba(0,0,0,.4)}
.logo{text-align:center;margin-bottom:28px}
.logo h1{color:#1a4731;font-size:22px;font-weight:800}
.logo p{color:#6b7280;font-size:13px;margin-top:4px}
label{display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}
input[type=password],input[type=text]{width:100%;padding:10px 14px;border:1.5px solid #d1d5db;border-radius:8px;
                     font-size:14px;outline:none;transition:.2s}
input[type=password]:focus,input[type=text]:focus{border-color:#1a4731;box-shadow:0 0 0 3px rgba(26,71,49,.15)}
.field+.field{margin-top:14px}
.btn{width:100%;margin-top:20px;padding:11px;background:#1a4731;color:#fff;border:none;
     border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;transition:.15s}
.btn:hover{background:#15392a}
.err{background:#fef2f2;border:1px solid #fecaca;color:#dc2626;border-radius:8px;
     padding:10px 14px;font-size:13px;margin-bottom:16px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <h1>ColorAI Admin</h1>
    <p>Quản trị lịch sử phối màu</p>
  </div>
  <?php if ($err): ?><div class="err"><?= htmlspecialchars($err) ?></div><?php endif ?>
  <form method="post">
    <input type="hidden" name="action" value="login">
    <div class="field">
      <label>Tên đăng nhập</label>
      <input type="text" name="username" autofocus autocomplete="username">
    </div>
    <div class="field">
      <label>Mật khẩu</label>
      <input type="password" name="password" autocomplete="current-password">
    </div>
    <button type="submit" class="btn">Đăng nhập</button>
  </form>
</div>
</body>
</html>
<?php }

function swatch(string $hex, string $name = ''): string {
    $h = htmlspecialchars($hex);
    $n = htmlspecialchars($name);
    return "<span class='swatch' style='background:$h' title='$n $h'></span>";
}

function qs(array $extra = []): string {
    $p = array_merge(['ip' => $_GET['ip'] ?? '', 'date' => $_GET['date'] ?? '', 'hex' => $_GET['hex'] ?? '', 'user_id' => $_GET['user_id'] ?? '', 'page' => $_GET['page'] ?? 1], $extra);
    return '?' . http_build_query(array_filter($p, fn($v) => $v !== '' && $v !== null));
}

function showPage(PDO $db, array $stats, array $rows, int $totalRows, int $totalPages, int $page,
                  array $topIPs, array $chartDays, int $chartMax, string $msg,
                  string $fIP, string $fDate, string $fHex,
                  array $userRows = [], string $uSearch = '',
                  array $topPalettes = [], array $topWallColors = []): void {
    // $csrfToken khai báo ở top-level — trong hàm PHP KHÔNG tự thấy biến
    // ngoài (khác JS); thiếu dòng này mọi form render token RỖNG → mọi
    // thao tác xoá/logout đều bị csrfCheckPost() chặn.
    $csrfToken = csrfToken();
    $fUser = (int)($_GET['user_id'] ?? 0); ?>
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ColorAI Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f3f4f6;color:#111827;font-size:14px}

/* Header */
.hdr{background:#1a4731;color:#fff;display:flex;align-items:center;justify-content:space-between;
     padding:0 24px;height:56px;position:sticky;top:0;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.hdr-logo{font-size:17px;font-weight:800;letter-spacing:-.3px}
.hdr-logo span{opacity:.6;font-weight:400;margin-left:6px;font-size:13px}
.hdr-right{display:flex;align-items:center;gap:12px}
.hdr-link{color:rgba(255,255,255,.75);text-decoration:none;font-size:13px;padding:6px 10px;
           border-radius:6px;transition:.15s}
.hdr-link:hover{background:rgba(255,255,255,.12);color:#fff}
.btn-logout{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);color:#fff;
             padding:6px 14px;border-radius:6px;font-size:13px;cursor:pointer;transition:.15s}
.btn-logout:hover{background:rgba(255,255,255,.25)}

/* Layout */
.wrap{max-width:1400px;margin:0 auto;padding:24px 20px}

/* Flash message */
.flash{background:#d1fae5;border:1px solid #6ee7b7;color:#065f46;padding:10px 16px;
       border-radius:8px;margin-bottom:20px;font-size:13px}

/* Stats cards */
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.card-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:6px}
.card-val{font-size:32px;font-weight:800;color:#111827}
.card-sub{font-size:12px;color:#9ca3af;margin-top:2px}
.card.green .card-val{color:#1a4731}
.card.blue  .card-val{color:#1d4ed8}
.card.amber .card-val{color:#d97706}
.card.rose  .card-val{color:#e11d48}

/* Chart */
.chart-wrap{background:#fff;border-radius:12px;padding:20px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.chart-title{font-size:13px;font-weight:700;color:#374151;margin-bottom:14px}
.chart{display:flex;align-items:flex-end;gap:6px;height:80px}
.bar-col{display:flex;flex-direction:column;align-items:center;flex:1;gap:4px}
.bar{background:#1a4731;border-radius:3px 3px 0 0;width:100%;min-height:2px;transition:.3s}
.bar:hover{background:#15392a;cursor:default}
.bar-lbl{font-size:9px;color:#9ca3af;white-space:nowrap}

/* Two column layout */
.grid2{display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start}

/* Filter bar */
.filter-bar{background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;
             box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.filter-bar label{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;
                  display:block;margin-bottom:4px}
.filter-bar input{padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:13px;
                  outline:none;width:160px;transition:.2s}
.filter-bar input:focus{border-color:#1a4731;box-shadow:0 0 0 2px rgba(26,71,49,.12)}
.filter-bar .btn-filter{padding:7px 16px;background:#1a4731;color:#fff;border:none;border-radius:6px;
                         cursor:pointer;font-size:13px;font-weight:600;transition:.15s;white-space:nowrap}
.filter-bar .btn-filter:hover{background:#15392a}
.filter-bar .btn-reset{padding:7px 12px;background:#f3f4f6;color:#6b7280;border:1.5px solid #e5e7eb;
                        border-radius:6px;cursor:pointer;font-size:13px;transition:.15s;text-decoration:none}
.filter-bar .btn-reset:hover{background:#e5e7eb}

/* Table */
.tbl-wrap{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden}
.tbl-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;
           border-bottom:1px solid #f3f4f6}
.tbl-head-title{font-size:13px;font-weight:700;color:#374151}
.tbl-head-right{display:flex;gap:8px}
.btn-sm{padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;
        border:1.5px solid transparent;transition:.15s;text-decoration:none;display:inline-flex;align-items:center;gap:4px}
.btn-danger{background:#fef2f2;color:#dc2626;border-color:#fecaca}
.btn-danger:hover{background:#dc2626;color:#fff}
.btn-export{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}
.btn-export:hover{background:#1d4ed8;color:#fff}
.btn-del-sel{background:#fef2f2;color:#dc2626;border-color:#fecaca;display:none}

table{width:100%;border-collapse:collapse}
thead th{background:#f9fafb;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
          color:#6b7280;padding:10px 14px;text-align:left;border-bottom:1px solid #f3f4f6;white-space:nowrap}
tbody tr{border-bottom:1px solid #f9fafb;transition:.1s}
tbody tr:hover{background:#f9fafb}
tbody tr:last-child{border-bottom:none}
td{padding:10px 14px;vertical-align:middle}
td.center{text-align:center}

.swatch{display:inline-block;width:18px;height:18px;border-radius:50%;border:2px solid rgba(0,0,0,.1);
         vertical-align:middle;margin-right:2px;cursor:default;flex-shrink:0}
.swatches{display:flex;gap:3px;align-items:center}
.ip-chip{display:inline-block;background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:100px;
          font-size:12px;font-family:monospace;font-weight:600}
.ip-chip a{color:inherit;text-decoration:none}
.ip-chip a:hover{text-decoration:underline}
.badge-id{font-size:11px;color:#9ca3af;font-family:monospace}
.pal-name{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#6b7280}
.ts{font-size:12px;color:#9ca3af;white-space:nowrap}
.btn-del{background:none;border:none;color:#dc2626;cursor:pointer;font-size:16px;padding:2px 6px;
          border-radius:4px;transition:.15s;opacity:.6}
.btn-del:hover{background:#fef2f2;opacity:1}
.img-thumb{width:56px;height:36px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb}
.img-thumb-placeholder{width:56px;height:36px;background:#f3f4f6;border-radius:4px;border:1px solid #e5e7eb;
                        display:inline-flex;align-items:center;justify-content:center;font-size:16px}

/* Pagination */
.pager{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;
        border-top:1px solid #f3f4f6;font-size:13px;color:#6b7280}
.pager-pages{display:flex;gap:4px}
.pager-btn{padding:5px 10px;border-radius:6px;border:1.5px solid #e5e7eb;background:#fff;
            color:#374151;font-size:12px;cursor:pointer;text-decoration:none;transition:.15s}
.pager-btn:hover{border-color:#1a4731;color:#1a4731}
.pager-btn.on{background:#1a4731;color:#fff;border-color:#1a4731}

/* IP stats sidebar */
.sidebar{display:flex;flex-direction:column;gap:16px}
.panel{background:#fff;border-radius:12px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.panel-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
              color:#6b7280;margin-bottom:14px}
.ip-row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;
         border-bottom:1px solid #f9fafb;gap:8px}
.ip-row:last-child{border-bottom:none}
.ip-bar-wrap{flex:1;height:5px;background:#f3f4f6;border-radius:3px;overflow:hidden;margin:0 8px}
.ip-bar{height:100%;background:#1a4731;border-radius:3px}
.ip-cnt{font-size:12px;font-weight:700;color:#1a4731;white-space:nowrap}
.ip-addr{font-size:11px;font-family:monospace;color:#374151;white-space:nowrap}
.ip-del-btn{background:none;border:none;color:#dc2626;cursor:pointer;font-size:13px;
             padding:1px 4px;border-radius:3px;opacity:.5;transition:.15s}
.ip-del-btn:hover{opacity:1;background:#fef2f2}

/* Danger zone */
.danger-zone{border:1.5px solid #fecaca;border-radius:8px;padding:14px}
.danger-zone .panel-title{color:#dc2626}
.dz-row{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
.dz-input{width:60px;padding:5px 8px;border:1.5px solid #e5e7eb;border-radius:6px;font-size:13px;text-align:center}
.btn-red{padding:6px 12px;background:#dc2626;color:#fff;border:none;border-radius:6px;
          font-size:12px;font-weight:700;cursor:pointer;transition:.15s}
.btn-red:hover{background:#b91c1c}
.btn-red-outline{padding:6px 12px;background:#fff;color:#dc2626;border:1.5px solid #fecaca;
                  border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;transition:.15s}
.btn-red-outline:hover{background:#fef2f2}

/* Modal */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;
                align-items:center;justify-content:center}
.modal-overlay.show{display:flex}
.modal{background:#fff;border-radius:16px;padding:28px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.modal h3{font-size:17px;font-weight:800;margin-bottom:10px}
.modal p{font-size:14px;color:#6b7280;margin-bottom:20px}
.modal-btns{display:flex;gap:10px;justify-content:flex-end}
.btn-cancel{padding:8px 18px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;
             font-size:13px;cursor:pointer;font-weight:600}
.btn-confirm{padding:8px 18px;background:#dc2626;color:#fff;border:none;border-radius:8px;
              font-size:13px;cursor:pointer;font-weight:700}

/* Tabs */
.tabs{display:flex;gap:2px;background:#e5e7eb;border-radius:10px;padding:3px;margin-bottom:22px;width:fit-content}
.tab-btn{padding:7px 20px;border-radius:8px;border:none;background:none;
          font-size:13px;font-weight:600;color:#6b7280;cursor:pointer;transition:.15s}
.tab-btn.on{background:#fff;color:#1a4731;box-shadow:0 1px 4px rgba(0,0,0,.1)}
.tab-pane{display:none}
.tab-pane.on{display:block}

/* User table */
.user-avatar{width:32px;height:32px;border-radius:50%;object-fit:cover;
              border:2px solid #e5e7eb;vertical-align:middle}
.user-avatar-ph{width:32px;height:32px;border-radius:50%;background:#e5e7eb;
                 display:inline-flex;align-items:center;justify-content:center;
                 font-size:14px;vertical-align:middle}
.phone-chip{font-size:11px;font-family:monospace;background:#f0fdf4;
             color:#166534;padding:2px 7px;border-radius:8px;white-space:nowrap}
.age-chip{font-size:11px;background:#eff6ff;color:#1d4ed8;padding:2px 7px;border-radius:8px}
.render-cnt{font-size:13px;font-weight:700;color:#1a4731}
.no-data-tag{color:#9ca3af;font-size:12px}

@media(max-width:900px){
  .cards{grid-template-columns:repeat(2,1fr)}
  .grid2{grid-template-columns:1fr}
}
</style>
</head>
<body>

<!-- Header -->
<div class="hdr">
  <div class="hdr-logo">ColorAI Admin <span>Quản trị lịch sử phối màu</span></div>
  <div class="hdr-right">
    <a class="hdr-link" href="/">← Về trang chủ</a>
    <form method="post" style="display:inline">
      <input type="hidden" name="action" value="logout">
      <input type="hidden" name="_csrf" value="<?= htmlspecialchars($csrfToken) ?>">
      <button type="submit" class="btn-logout">Đăng xuất</button>
    </form>
  </div>
</div>

<div class="wrap">

<?php if ($msg): ?>
<div class="flash"><?= htmlspecialchars($msg) ?></div>
<?php endif ?>

<!-- Tabs -->
<div class="tabs">
  <button class="tab-btn on" onclick="switchTab('history', this)">📊 Lịch sử phối màu</button>
  <button class="tab-btn"    onclick="switchTab('users',   this)">👥 Người dùng <?php if($stats['total_users']): ?><span style="background:#1a4731;color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;margin-left:4px"><?= $stats['total_users'] ?></span><?php endif ?></button>
</div>

<!-- ═══ TAB: HISTORY ═══ -->
<div class="tab-pane on" id="tab-history">

<!-- Stats cards -->
<div class="cards">
  <div class="card green">
    <div class="card-label">Tổng lịch sử</div>
    <div class="card-val"><?= number_format($stats['total']) ?></div>
    <div class="card-sub">tất cả thời gian</div>
  </div>
  <div class="card blue">
    <div class="card-label">Hôm nay</div>
    <div class="card-val"><?= number_format($stats['today']) ?></div>
    <div class="card-sub"><?= date('d/m/Y') ?></div>
  </div>
  <div class="card amber">
    <div class="card-label">IP khác nhau</div>
    <div class="card-val"><?= number_format($stats['unique_ips']) ?></div>
    <div class="card-sub">người dùng độc lập</div>
  </div>
  <div class="card rose">
    <div class="card-label">7 ngày qua</div>
    <div class="card-val"><?= number_format($stats['this_week']) ?></div>
    <div class="card-sub">lần phối màu</div>
  </div>
</div>

<!-- Chart -->
<div class="chart-wrap">
  <div class="chart-title">Lịch sử 14 ngày qua</div>
  <div class="chart">
    <?php foreach ($chartDays as $day => $cnt):
          $h = max(4, round(($cnt / $chartMax) * 72));
          $lbl = date('d/m', strtotime($day)); ?>
    <div class="bar-col">
      <div class="bar" style="height:<?= $h ?>px" title="<?= $lbl ?>: <?= $cnt ?> lần"></div>
      <div class="bar-lbl"><?= $lbl ?></div>
    </div>
    <?php endforeach ?>
  </div>
</div>

<!-- Main grid -->
<div class="grid2">
<div>

<!-- Filter bar -->
<form method="get" class="filter-bar">
  <div>
    <label>Lọc theo IP</label>
    <input name="ip"   type="text" value="<?= htmlspecialchars($fIP) ?>"   placeholder="192.168.1.1">
  </div>
  <div>
    <label>Lọc theo ngày</label>
    <input name="date" type="date" value="<?= htmlspecialchars($fDate) ?>">
  </div>
  <div>
    <label>Lọc theo Hex</label>
    <input name="hex"  type="text" value="<?= htmlspecialchars($fHex) ?>"  placeholder="#1a4731">
  </div>
  <button type="submit" class="btn-filter">Tìm kiếm</button>
  <a href="?" class="btn-reset">Xóa lọc</a>
</form>

<!-- Table -->
<form id="bulkForm" method="post">
<input type="hidden" name="action" value="delete_bulk">
<input type="hidden" name="_csrf" value="<?= htmlspecialchars($csrfToken) ?>">
<div class="tbl-wrap">
  <div class="tbl-head">
    <div class="tbl-head-title">
      <?= number_format($totalRows) ?> bản ghi
      <?php if ($fIP || $fDate || $fHex || $fUser): ?>
        <span style="color:#6b7280;font-weight:400"> (đang lọc<?= $fUser ? ' theo user #' . $fUser : '' ?>)</span>
        <a href="?" style="font-size:12px;margin-left:6px">Xoá lọc</a>
      <?php endif ?>
    </div>
    <div class="tbl-head-right">
      <button type="button" id="btnDelSel" class="btn-sm btn-del-sel" onclick="confirmBulk()">Xóa đã chọn</button>
      <a href="<?= qs(['export'=>'csv']) ?>" class="btn-sm btn-export">↓ Xuất CSV</a>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th><input type="checkbox" id="chkAll" onchange="toggleAll(this)"></th>
        <th>ID</th>
        <th>Ảnh</th>
        <th>IP</th>
        <th>Màu sắc</th>
        <th>Palette</th>
        <th>Thời gian</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
    <?php if (!$rows): ?>
      <tr><td colspan="8" style="text-align:center;padding:32px;color:#9ca3af">Không có dữ liệu</td></tr>
    <?php endif ?>
    <?php foreach ($rows as $r): ?>
      <tr>
        <td class="center"><input type="checkbox" name="ids[]" value="<?= $r['id'] ?>" class="row-chk" onchange="onChkChange()"></td>
        <td><span class="badge-id">#<?= $r['id'] ?></span></td>
        <td>
          <?php if ($r['day_url']): ?>
            <a href="<?= htmlspecialchars($r['day_url']) ?>" target="_blank">
              <img class="img-thumb" src="<?= htmlspecialchars($r['day_url']) ?>" loading="lazy"
                   onerror="this.replaceWith(document.querySelector('.img-thumb-placeholder').cloneNode(true))">
            </a>
          <?php else: ?>
            <div class="img-thumb-placeholder">🖼</div>
          <?php endif ?>
        </td>
        <td>
          <span class="ip-chip">
            <a href="<?= qs(['ip' => $r['ip'], 'page' => 1]) ?>"><?= htmlspecialchars($r['ip']) ?></a>
          </span>
        </td>
        <td>
          <div class="swatches">
            <?= swatch($r['wall_hex'],  $r['wall_name']) ?>
            <?= swatch($r['trim_hex'],  $r['trim_name']) ?>
            <?= swatch($r['frame_hex'], $r['frame_name']) ?>
          </div>
          <div style="font-size:10px;color:#9ca3af;margin-top:3px">
            <?= htmlspecialchars($r['wall_hex']) ?> · <?= htmlspecialchars($r['trim_hex']) ?> · <?= htmlspecialchars($r['frame_hex']) ?>
          </div>
        </td>
        <td><div class="pal-name" title="<?= htmlspecialchars($r['palette_name']) ?>"><?= htmlspecialchars($r['palette_name'] ?: '—') ?></div></td>
        <td><span class="ts"><?= date('d/m/y H:i', strtotime($r['created_at'])) ?></span></td>
        <td>
          <button type="button" class="btn-del" title="Xóa" onclick="confirmDelete(<?= $r['id'] ?>)">✕</button>
        </td>
      </tr>
    <?php endforeach ?>
    </tbody>
  </table>

  <!-- Pagination -->
  <?php if ($totalPages > 1): ?>
  <div class="pager">
    <span>Trang <?= $page ?> / <?= $totalPages ?></span>
    <div class="pager-pages">
      <?php if ($page > 1): ?>
        <a class="pager-btn" href="<?= qs(['page' => 1]) ?>">«</a>
        <a class="pager-btn" href="<?= qs(['page' => $page - 1]) ?>">‹</a>
      <?php endif ?>
      <?php
        $start = max(1, $page - 2);
        $end   = min($totalPages, $page + 2);
        for ($p = $start; $p <= $end; $p++):
      ?>
        <a class="pager-btn <?= $p === $page ? 'on' : '' ?>" href="<?= qs(['page' => $p]) ?>"><?= $p ?></a>
      <?php endfor ?>
      <?php if ($page < $totalPages): ?>
        <a class="pager-btn" href="<?= qs(['page' => $page + 1]) ?>">›</a>
        <a class="pager-btn" href="<?= qs(['page' => $totalPages]) ?>">»</a>
      <?php endif ?>
    </div>
  </div>
  <?php endif ?>
</div><!-- tbl-wrap -->
</form><!-- bulkForm -->

</div><!-- main col -->

<!-- Sidebar -->
<div class="sidebar">

  <!-- Xu hướng: combo + màu được chọn nhiều nhất -->
  <div class="panel">
    <div class="panel-title">Phương án được chọn nhiều nhất</div>
    <?php if (!$topPalettes): ?><p style="color:#9ca3af;font-size:13px">Chưa có dữ liệu</p><?php endif ?>
    <?php $maxPal = $topPalettes ? (int)$topPalettes[0]['cnt'] : 1; foreach ($topPalettes as $p):
      $pct = round(($p['cnt'] / $maxPal) * 100); ?>
    <div class="ip-row">
      <div class="ip-addr" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="<?= htmlspecialchars($p['name']) ?>"><?= htmlspecialchars($p['name']) ?></div>
      <div class="ip-bar-wrap"><div class="ip-bar" style="width:<?= $pct ?>%"></div></div>
      <div class="ip-cnt"><?= $p['cnt'] ?></div>
    </div>
    <?php endforeach ?>
  </div>

  <!-- Xu hướng: màu tường phổ biến nhất -->
  <div class="panel">
    <div class="panel-title">Màu tường được chọn nhiều nhất</div>
    <?php if (!$topWallColors): ?><p style="color:#9ca3af;font-size:13px">Chưa có dữ liệu</p><?php endif ?>
    <?php foreach ($topWallColors as $w): ?>
    <div class="ip-row">
      <?= swatch($w['hex'], $w['name']) ?>
      <div class="ip-addr" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="<?= htmlspecialchars($w['name']) ?>"><?= htmlspecialchars($w['name']) ?></div>
      <div class="ip-cnt"><?= $w['cnt'] ?></div>
    </div>
    <?php endforeach ?>
  </div>

  <!-- Top IPs -->
  <div class="panel">
    <div class="panel-title">Top IP hoạt động</div>
    <?php
      $maxCnt = $topIPs ? (int)$topIPs[0]['cnt'] : 1;
      foreach ($topIPs as $ip):
        $pct = round(($ip['cnt'] / $maxCnt) * 100);
    ?>
    <div class="ip-row">
      <div class="ip-addr">
        <a href="<?= qs(['ip' => $ip['ip'], 'page' => 1]) ?>" style="color:inherit;text-decoration:none">
          <?= htmlspecialchars($ip['ip']) ?>
        </a>
      </div>
      <div class="ip-bar-wrap"><div class="ip-bar" style="width:<?= $pct ?>%"></div></div>
      <div class="ip-cnt"><?= $ip['cnt'] ?></div>
      <form method="post" style="display:inline">
        <input type="hidden" name="action" value="delete_ip">
        <input type="hidden" name="ip"     value="<?= htmlspecialchars($ip['ip']) ?>">
        <input type="hidden" name="_csrf"  value="<?= htmlspecialchars($csrfToken) ?>">
        <button type="submit" class="ip-del-btn" title="Xóa IP này" onclick="return confirm('Xóa toàn bộ lịch sử IP <?= addslashes($ip['ip']) ?>?')">✕</button>
      </form>
    </div>
    <?php endforeach ?>
    <?php if (!$topIPs): ?><p style="color:#9ca3af;font-size:13px">Chưa có dữ liệu</p><?php endif ?>
  </div>

  <!-- Danger zone -->
  <div class="panel">
    <div class="panel-title danger-zone" style="border:none;padding:0">Xóa dữ liệu</div>
    <div class="danger-zone" style="margin-top:12px">
      <div style="font-size:12px;color:#6b7280">Xóa bản ghi cũ hơn N ngày:</div>
      <form method="post" class="dz-row" onsubmit="return confirm('Xóa các bản ghi cũ?')">
        <input type="hidden" name="action" value="clear_old">
        <input type="hidden" name="_csrf" value="<?= htmlspecialchars($csrfToken) ?>">
        <input type="number" name="days" class="dz-input" value="30" min="1">
        <span style="font-size:13px;color:#6b7280">ngày</span>
        <button type="submit" class="btn-red-outline">Xóa cũ</button>
      </form>
      <form method="post" style="margin-top:10px" onsubmit="return confirm('XÓA TOÀN BỘ lịch sử? Không thể khôi phục!')">
        <input type="hidden" name="action" value="delete_all">
        <input type="hidden" name="_csrf" value="<?= htmlspecialchars($csrfToken) ?>">
        <button type="submit" class="btn-red" style="width:100%">Xóa tất cả</button>
      </form>
    </div>
  </div>

</div><!-- sidebar -->
</div><!-- grid2 -->

</div><!-- tab-history -->

<!-- ═══ TAB: USERS ═══ -->
<div class="tab-pane" id="tab-users">

<!-- User stats -->
<div class="cards" style="grid-template-columns:repeat(4,1fr)">
  <div class="card green">
    <div class="card-label">Tổng tài khoản</div>
    <div class="card-val"><?= number_format($stats['total_users']) ?></div>
    <div class="card-sub">đã đăng ký Google</div>
  </div>
  <div class="card blue">
    <div class="card-label">Hôm nay</div>
    <div class="card-val"><?= number_format($stats['users_today']) ?></div>
    <div class="card-sub"><?= date('d/m/Y') ?></div>
  </div>
  <div class="card amber">
    <div class="card-label">7 ngày qua</div>
    <div class="card-val"><?= number_format($stats['users_week']) ?></div>
    <div class="card-sub">tài khoản mới</div>
  </div>
  <div class="card rose">
    <div class="card-label">Có SĐT</div>
    <div class="card-val"><?= number_format($stats['users_phone']) ?></div>
    <div class="card-sub">đã điền thông tin</div>
  </div>
</div>

<!-- User search -->
<form method="get" class="filter-bar" onsubmit="document.getElementById('tabTarget').value='users'">
  <input type="hidden" name="tab" value="users">
  <div>
    <label>Tìm kiếm</label>
    <input name="usearch" type="text" value="<?= htmlspecialchars($uSearch) ?>"
           placeholder="Tên, email, SĐT..." style="width:260px">
  </div>
  <button type="submit" class="btn-filter">Tìm</button>
  <a href="?tab=users" class="btn-reset">Xóa lọc</a>
  <a href="?export=users_csv" class="btn-sm btn-export" style="margin-left:auto">↓ Xuất CSV</a>
</form>

<!-- Users table -->
<div class="tbl-wrap">
  <div class="tbl-head">
    <div class="tbl-head-title"><?= count($userRows) ?> người dùng <?= $uSearch ? '(đang lọc)' : '' ?></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Avatar</th>
        <th>Tên</th>
        <th>Email</th>
        <th>Số điện thoại</th>
        <th>Tuổi</th>
        <th>Phối màu</th>
        <th>Ngày đăng ký</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
    <?php if (!$userRows): ?>
      <tr><td colspan="9" style="text-align:center;padding:32px;color:#9ca3af">Chưa có tài khoản nào</td></tr>
    <?php endif ?>
    <?php foreach ($userRows as $u): ?>
      <tr>
        <td><span class="badge-id">#<?= $u['id'] ?></span></td>
        <td>
          <?php if ($u['avatar']): ?>
            <img class="user-avatar" src="<?= htmlspecialchars($u['avatar']) ?>"
                 onerror="this.replaceWith(document.createElement('span'))" loading="lazy">
          <?php else: ?>
            <span class="user-avatar-ph">👤</span>
          <?php endif ?>
        </td>
        <td style="font-weight:600"><?= htmlspecialchars($u['name'] ?: '—') ?></td>
        <td style="font-size:12px;color:#6b7280"><?= htmlspecialchars($u['email']) ?></td>
        <td>
          <?php if ($u['phone']): ?>
            <span class="phone-chip"><?= htmlspecialchars($u['phone']) ?></span>
          <?php else: ?>
            <span class="no-data-tag">—</span>
          <?php endif ?>
        </td>
        <td>
          <?php if ($u['age'] > 0): ?>
            <span class="age-chip"><?= (int)$u['age'] ?></span>
          <?php else: ?>
            <span class="no-data-tag">—</span>
          <?php endif ?>
        </td>
        <td>
          <a href="?ip=&user_id=<?= $u['id'] ?>" class="render-cnt" style="text-decoration:none"
             title="Xem lịch sử phối màu">
            <?= (int)$u['render_count'] ?> lần
          </a>
        </td>
        <td><span class="ts"><?= date('d/m/y H:i', strtotime($u['created_at'])) ?></span></td>
        <td>
          <form method="post" style="display:inline"
                onsubmit="return confirm('Xóa tài khoản <?= addslashes(htmlspecialchars($u['name'])) ?>?\nLịch sử phối màu sẽ được giữ lại nhưng không liên kết với tài khoản.')">
            <input type="hidden" name="action"  value="delete_user">
            <input type="hidden" name="user_id" value="<?= $u['id'] ?>">
            <input type="hidden" name="_csrf"   value="<?= htmlspecialchars($csrfToken) ?>">
            <button type="submit" class="btn-del" title="Xóa tài khoản">✕</button>
          </form>
        </td>
      </tr>
    <?php endforeach ?>
    </tbody>
  </table>
</div>

</div><!-- tab-users -->

</div><!-- wrap -->

<!-- Modal xác nhận xóa 1 bản ghi -->
<div class="modal-overlay" id="modal1">
  <div class="modal">
    <h3>Xác nhận xóa</h3>
    <p>Xóa bản ghi này? Hành động không thể khôi phục.</p>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal('modal1')">Hủy</button>
      <form method="post" id="deleteOneForm" style="display:inline">
        <input type="hidden" name="action" value="delete_one">
        <input type="hidden" name="_csrf" value="<?= htmlspecialchars($csrfToken) ?>">
        <input type="hidden" name="id" id="deleteOneId">
        <button type="submit" class="btn-confirm">Xóa</button>
      </form>
    </div>
  </div>
</div>

<!-- Modal xác nhận xóa nhiều -->
<div class="modal-overlay" id="modalBulk">
  <div class="modal">
    <h3>Xóa các bản ghi đã chọn</h3>
    <p id="bulkMsg">Xác nhận xóa các bản ghi đã chọn?</p>
    <div class="modal-btns">
      <button class="btn-cancel" onclick="closeModal('modalBulk')">Hủy</button>
      <button type="button" class="btn-confirm" onclick="document.getElementById('bulkForm').submit()">Xóa</button>
    </div>
  </div>
</div>

<input type="hidden" id="tabTarget" value="">

<script>
function switchTab(name, btn) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('on'));
  document.getElementById('tab-' + name).classList.add('on');
  btn.classList.add('on');
  // Lưu tab vào URL để reload không mất
  const url = new URL(location.href);
  url.searchParams.set('tab', name);
  history.replaceState({}, '', url);
}
// Restore tab từ URL
(function() {
  const tab = new URLSearchParams(location.search).get('tab');
  if (tab === 'users') {
    const btn = document.querySelectorAll('.tab-btn')[1];
    if (btn) switchTab('users', btn);
  }
})();

function confirmDelete(id) {
  document.getElementById('deleteOneId').value = id;
  document.getElementById('modal1').classList.add('show');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}
function toggleAll(chk) {
  document.querySelectorAll('.row-chk').forEach(c => c.checked = chk.checked);
  onChkChange();
}
function onChkChange() {
  const n = document.querySelectorAll('.row-chk:checked').length;
  const btn = document.getElementById('btnDelSel');
  btn.style.display = n > 0 ? 'inline-flex' : 'none';
  btn.textContent = `Xóa ${n} đã chọn`;
  document.getElementById('chkAll').indeterminate =
    n > 0 && n < document.querySelectorAll('.row-chk').length;
}
function confirmBulk() {
  const n = document.querySelectorAll('.row-chk:checked').length;
  document.getElementById('bulkMsg').textContent = `Xác nhận xóa ${n} bản ghi đã chọn?`;
  document.getElementById('modalBulk').classList.add('show');
}
// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(o =>
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); })
);
</script>
</body>
</html>
<?php }
