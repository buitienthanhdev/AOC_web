<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/csrf.php';

// Auth guard
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Chưa đăng nhập']);
    exit;
}

$uid = (int)$_SESSION['user_id'];

// ── GET: thông tin user ──────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $db   = getDB();
    $stmt = $db->prepare("SELECT id, name, email, phone, age, avatar, created_at FROM users WHERE id=?");
    $stmt->execute([$uid]);
    $u = $stmt->fetch();
    echo json_encode($u ?: []);
    exit;
}

// ── POST: cập nhật phone + age ───────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrfVerify();
    $d     = json_decode(file_get_contents('php://input'), true) ?? [];
    $phone = trim($d['phone'] ?? '');
    $age   = (int)($d['age'] ?? 0);
    $name  = trim($d['name'] ?? '');

    $errs = [];
    if ($phone !== '' && !preg_match('/^\+?[0-9\s\-\(\)]{7,20}$/', $phone)) {
        $errs[] = 'Số điện thoại không hợp lệ';
    }
    if ($age !== 0 && ($age < 12 || $age > 110)) {
        $errs[] = 'Tuổi phải từ 12–110';
    }
    if ($errs) {
        http_response_code(422);
        echo json_encode(['error' => implode('; ', $errs)]);
        exit;
    }

    $db = getDB();
    $sets  = ["updated_at = datetime('now','localtime')"];
    $binds = [];

    if ($phone !== '')  { $sets[] = 'phone = ?'; $binds[] = $phone; }
    if ($age > 0)       { $sets[] = 'age   = ?'; $binds[] = $age;   }
    if ($name !== '')   { $sets[] = 'name  = ?'; $binds[] = $name;  }

    if (count($binds) > 0) {
        $binds[] = $uid;
        $db->prepare("UPDATE users SET " . implode(', ', $sets) . " WHERE id = ?")
           ->execute($binds);
    }

    // Refresh session
    $stmt = $db->prepare("SELECT name, phone, age FROM users WHERE id = ?");
    $stmt->execute([$uid]);
    $u = $stmt->fetch();
    $_SESSION['user_name']        = $u['name'];
    $_SESSION['profile_complete'] = !empty($u['phone']) && $u['age'] > 0;

    echo json_encode(['ok' => true, 'profile_complete' => $_SESSION['profile_complete']]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
