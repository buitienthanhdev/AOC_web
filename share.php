<?php
// ══════════════════════════════════════════════════════════════
//  share.php — Trang công khai xem 1 kết quả phối màu đã chia sẻ
//  /share.php?id=<id>  (link tạo bởi php/share_api.php)
//  Hiện ảnh Ngày/Đêm + bảng màu (tên + mã KM) + nút về trang chủ
//  để người xem tự phối cho nhà mình. Không cần đăng nhập.
// ══════════════════════════════════════════════════════════════
require_once __DIR__ . '/php/db.php';

$id = (string)($_GET['id'] ?? '');
$share = null;
if (preg_match('/^[A-Za-z0-9]{6,20}$/', $id)) {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY, ip TEXT NOT NULL, data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )");
    $stmt = $db->prepare("SELECT data, created_at FROM shares WHERE id = ?");
    $stmt->execute([$id]);
    if ($row = $stmt->fetch()) {
        $share = json_decode($row['data'], true);
        if (is_array($share)) $share['created_at'] = $row['created_at'];
        else $share = null;
    }
}
function h(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
$hasBoth = false;
$title = $share ? ('Phối màu: ' . ($share['palette_name'] ?: 'Kết quả AOC')) : 'Không tìm thấy kết quả';
?>
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= h($title) ?> — AOC · Paint &amp; More</title>
<meta property="og:title" content="<?= h($title) ?>">
<meta property="og:description" content="Xem phương án phối màu sơn nhà tạo bằng AI của Paint & More.">
<?php if ($share && ($share['day_url'] ?? '')): ?>
<meta property="og:image" content="<?= h($share['day_url']) ?>">
<?php endif ?>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f4f6f5;color:#14211c;min-height:100vh}
.hdr{background:#fff;border-bottom:1px solid #e3e8e5;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.hdr-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit}
.hdr-brand img{height:30px}
.hdr-brand b{font-size:18px;letter-spacing:-.02em}
.hdr-brand span{display:block;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#2f7d57;font-weight:600}
.btn-cta{background:#2f7d57;color:#fff;text-decoration:none;padding:9px 18px;border-radius:999px;font-size:14px;font-weight:700;transition:.15s}
.btn-cta:hover{background:#256345}
.wrap{max-width:960px;margin:0 auto;padding:24px 16px 48px}
.card{background:#fff;border:1px solid #e3e8e5;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.05)}
.card+.card{margin-top:16px}
.head{padding:16px 20px;border-bottom:1px solid #eef1ef}
.head h1{font-size:20px;letter-spacing:-.02em}
.head .sub{color:#6b7a72;font-size:13px;margin-top:2px}
.imgs{position:relative;background:#101513}
.imgs img{display:block;width:100%;height:auto}
.imgs img.hide{display:none}
.dn-bar{display:flex;gap:6px;padding:10px 14px;background:#fff;border-top:1px solid #eef1ef}
.dn-btn{border:1px solid #d7ded9;background:#fff;color:#374740;border-radius:999px;padding:6px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:.15s}
.dn-btn.on{background:#2f7d57;border-color:#2f7d57;color:#fff}
.colors{padding:16px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.c-row{display:flex;align-items:center;gap:10px;border:1px solid #eef1ef;border-radius:12px;padding:8px 10px}
.c-sw{width:34px;height:34px;border-radius:50%;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
.c-info b{display:block;font-size:13px}
.c-info span{font-size:12px;color:#6b7a72}
.c-hex{margin-left:auto;font-family:ui-monospace,monospace;font-size:12px;color:#6b7a72}
.empty{padding:60px 20px;text-align:center}
.empty h1{font-size:22px;margin-bottom:8px}
.empty p{color:#6b7a72;margin-bottom:20px}
.foot{text-align:center;color:#9aa7a0;font-size:12px;margin-top:24px}
.cta-block{padding:18px 20px;background:#f0f7f3;border-top:1px solid #dcebe2;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.cta-block p{font-size:14px;color:#2a4438}
@media(prefers-color-scheme:dark){
  body{background:#111613;color:#e7ece9}
  .hdr,.card,.dn-bar{background:#1a211d;border-color:#2a332d}
  .head,.c-row{border-color:#2a332d}
  .c-info span,.c-hex,.head .sub{color:#9aa79f}
  .dn-btn{background:#1a211d;border-color:#3a453e;color:#cfd8d2}
  .cta-block{background:#1e2a23;border-color:#2c3a31}
  .cta-block p{color:#c4d4ca}
}
</style>
</head>
<body>
<header class="hdr">
  <a class="hdr-brand" href="/">
    <img src="/image/logo-painmore.png" alt="PAINT &amp; MORE" onerror="this.remove()">
    <span style="display:flex;flex-direction:column;line-height:1.1"><b>AOC</b><span>AI for OneCoat Colormind</span></span>
  </a>
  <a class="btn-cta" href="/">Phối màu cho nhà bạn →</a>
</header>

<div class="wrap">
<?php if (!$share): ?>
  <div class="card"><div class="empty">
    <h1>Không tìm thấy kết quả này</h1>
    <p>Link có thể đã sai hoặc kết quả đã bị xoá.</p>
    <a class="btn-cta" href="/">Về trang phối màu →</a>
  </div></div>
<?php else:
  $day = $share['day_url'] ?? ''; $night = $share['night_url'] ?? '';
  $hasBoth = $day && $night; ?>
  <div class="card">
    <div class="head">
      <h1><?= h($share['palette_name'] ?: 'Phương án phối màu') ?></h1>
      <div class="sub">
        <?= $share['style_label'] ? 'Phong cách: ' . h($share['style_label']) . ' · ' : '' ?>
        Tạo ngày <?= h(date('d/m/Y H:i', strtotime($share['created_at'] ?? 'now'))) ?> bằng AOC — AI phối màu của Paint &amp; More
      </div>
    </div>
    <div class="imgs">
      <?php if ($day): ?><img id="imgDay" src="<?= h($day) ?>" alt="Kết quả ban ngày"><?php endif ?>
      <?php if ($night): ?><img id="imgNight" class="<?= $day ? 'hide' : '' ?>" src="<?= h($night) ?>" alt="Kết quả ban đêm"><?php endif ?>
    </div>
    <?php if ($hasBoth): ?>
    <div class="dn-bar">
      <button class="dn-btn on" id="btnDay" type="button">☀️ Ban ngày</button>
      <button class="dn-btn" id="btnNight" type="button">🌙 Ban đêm</button>
    </div>
    <?php endif ?>
    <?php if (!empty($share['colors'])): ?>
    <div class="colors">
      <?php foreach ($share['colors'] as $c): ?>
      <div class="c-row">
        <span class="c-sw" style="background:<?= h($c['hex']) ?>"></span>
        <span class="c-info">
          <b><?= h($c['label'] ?: '—') ?></b>
          <span><?= h($c['name'] ?: '') ?><?= $c['code'] ? ' · KM ' . h($c['code']) : '' ?></span>
        </span>
        <span class="c-hex"><?= h(strtoupper($c['hex'])) ?></span>
      </div>
      <?php endforeach ?>
    </div>
    <?php endif ?>
    <div class="cta-block">
      <p>Thích phương án này? Tải ảnh nhà bạn lên và để AI phối thử trong 1 phút.</p>
      <a class="btn-cta" href="/">Bắt đầu miễn phí →</a>
    </div>
  </div>
<?php endif ?>
  <div class="foot">© Paint &amp; More — Công cụ phối màu AI từ bảng màu Kelly-Moore.</div>
</div>

<?php if ($share && $hasBoth): ?>
<script>
(function(){
  var d=document.getElementById('imgDay'),n=document.getElementById('imgNight');
  var bd=document.getElementById('btnDay'),bn=document.getElementById('btnNight');
  function sw(day){d.classList.toggle('hide',!day);n.classList.toggle('hide',day);
    bd.classList.toggle('on',day);bn.classList.toggle('on',!day);}
  bd.addEventListener('click',function(){sw(true)});
  bn.addEventListener('click',function(){sw(false)});
})();
</script>
<?php endif ?>
</body>
</html>
