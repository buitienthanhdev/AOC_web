<?php
session_start();
require_once __DIR__ . '/auth_config.php';
require_once __DIR__ . '/db.php';

// ── cURL helpers (tránh lỗi SSL của file_get_contents trên Windows) ──
function curlPost(string $url, array $data): string {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($data),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $res = curl_exec($ch);
    if ($res === false) {
        $err = curl_error($ch); curl_close($ch);
        // Nếu SSL fail trên localhost → thử lại không verify (dev only)
        if (strpos($err, 'SSL') !== false || strpos($err, 'certificate') !== false) {
            $ch2 = curl_init($url);
            curl_setopt_array($ch2, [
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => http_build_query($data),
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
                CURLOPT_TIMEOUT        => 15,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
            ]);
            $res = curl_exec($ch2);
            curl_close($ch2);
            return $res ?: '';
        }
        return '';
    }
    curl_close($ch);
    return $res;
}

function curlGet(string $url, string $authHeader = ''): string {
    $ch = curl_init($url);
    $headers = $authHeader ? [$authHeader] : [];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $res = curl_exec($ch);
    if ($res === false) {
        $err = curl_error($ch); curl_close($ch);
        if (strpos($err, 'SSL') !== false || strpos($err, 'certificate') !== false) {
            $ch2 = curl_init($url);
            curl_setopt_array($ch2, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => $headers,
                CURLOPT_TIMEOUT        => 15,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
            ]);
            $res = curl_exec($ch2);
            curl_close($ch2);
            return $res ?: '';
        }
        return '';
    }
    curl_close($ch);
    return $res;
}

$action = $_GET['action'] ?? 'callback';

// ── [1] Login: redirect sang Google ──────────────────────────
if ($action === 'login') {
    $_SESSION['oauth_state']  = bin2hex(random_bytes(16));
    // Chỉ chấp nhận Referer CÙNG HOST — Referer do trình duyệt gửi nhưng
    // giá trị của nó là do TRANG NGUỒN (có thể là trang bên ngoài) quyết
    // định. Không kiểm tra → ai đó dụ khách bấm link auth.php?action=login
    // từ 1 trang lạ sẽ khiến đăng nhập xong bị redirect ngược về trang đó
    // (open redirect). Không cùng host → mặc định về '/'.
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    $refHost = $referer ? parse_url($referer, PHP_URL_HOST) : null;
    $_SESSION['oauth_return'] = ($refHost && $refHost === $_SERVER['HTTP_HOST']) ? $referer : '/';

    $url = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
        'client_id'     => GOOGLE_CLIENT_ID,
        'redirect_uri'  => GOOGLE_REDIRECT_URI,
        'response_type' => 'code',
        'scope'         => 'openid email profile',
        'state'         => $_SESSION['oauth_state'],
        'prompt'        => 'select_account',
    ]);
    header('Location: ' . $url);
    exit;
}

// ── [2] Logout ────────────────────────────────────────────────
if ($action === 'logout') {
    session_destroy();
    // Cùng lỗi open-redirect như action=login trước khi vá — 'return' là
    // tham số URL do khách quyết định, không kiểm tra thì
    // auth.php?action=logout&return=https://evil.example sẽ đăng xuất xong
    // rồi đưa thẳng sang trang lừa đảo. Chỉ chấp nhận PATH cùng host (không
    // có scheme/host riêng, tránh cả //evil.example kiểu protocol-relative).
    $ret = $_GET['return'] ?? '/';
    $safeRet = (is_string($ret) && $ret !== '' && $ret[0] === '/' && (strlen($ret) < 2 || $ret[1] !== '/')) ? $ret : '/';
    header('Location: ' . $safeRet);
    exit;
}

// ── [3] Callback từ Google ────────────────────────────────────
if ($action === 'callback' || isset($_GET['code'])) {
    $code  = $_GET['code']  ?? '';
    $state = $_GET['state'] ?? '';

    if (!$code || !hash_equals($_SESSION['oauth_state'] ?? '', $state)) {
        http_response_code(400);
        die('OAuth state không hợp lệ. <a href="/">Quay lại</a>');
    }

    // Đổi code → access token (dùng cURL để tránh lỗi SSL trên Windows)
    $resp  = curlPost('https://oauth2.googleapis.com/token', [
        'code'          => $code,
        'client_id'     => GOOGLE_CLIENT_ID,
        'client_secret' => GOOGLE_CLIENT_SECRET,
        'redirect_uri'  => GOOGLE_REDIRECT_URI,
        'grant_type'    => 'authorization_code',
    ]);
    $token = json_decode($resp, true);

    if (empty($token['access_token'])) {
        // invalid_grant thường do redirect_uri không khớp hoặc code hết hạn → thử lại từ đầu
        if (($token['error'] ?? '') === 'invalid_grant') {
            session_destroy();
            header('Location: /auth.php?action=login');
            exit;
        }
        http_response_code(500);
        die('Lỗi lấy token Google: ' . htmlspecialchars($resp ?? '')
            . '<br>redirect_uri đang dùng: <code>' . htmlspecialchars(GOOGLE_REDIRECT_URI) . '</code>'
            . '<br><a href="/">Quay lại</a>');
    }

    // Lấy thông tin user từ Google
    $uResp = curlGet('https://www.googleapis.com/oauth2/v3/userinfo',
                     'Authorization: Bearer ' . $token['access_token']);
    $gUser = json_decode($uResp, true);

    if (empty($gUser['sub'])) {
        http_response_code(500);
        die('Không lấy được thông tin Google. <a href="/">Quay lại</a>');
    }

    // Upsert user vào DB
    $db   = getDB();
    $stmt = $db->prepare("SELECT id, phone, age FROM users WHERE google_id = ?");
    $stmt->execute([$gUser['sub']]);
    $existing = $stmt->fetch();

    $isNew = false;
    if ($existing) {
        $db->prepare(
            "UPDATE users SET name=?, email=?, avatar=?, updated_at=datetime('now','localtime') WHERE google_id=?"
        )->execute([$gUser['name'] ?? '', $gUser['email'] ?? '', $gUser['picture'] ?? '', $gUser['sub']]);
        $_SESSION['user_id']          = (int)$existing['id'];
        $_SESSION['profile_complete'] = !empty($existing['phone']) && $existing['age'] > 0;
    } else {
        $db->prepare(
            "INSERT INTO users (google_id, name, email, avatar) VALUES (?,?,?,?)"
        )->execute([$gUser['sub'], $gUser['name'] ?? '', $gUser['email'] ?? '', $gUser['picture'] ?? '']);
        $_SESSION['user_id']          = (int)$db->lastInsertId();
        $_SESSION['profile_complete'] = false;
        $isNew = true;
    }

    $_SESSION['user_name']   = $gUser['name']    ?? '';
    $_SESSION['user_email']  = $gUser['email']   ?? '';
    $_SESSION['user_avatar'] = $gUser['picture'] ?? '';

    unset($_SESSION['oauth_state']);

    // Redirect về trang cũ, kèm flag để FE hiện modal profile nếu cần
    $return = $_SESSION['oauth_return'] ?? '/';
    unset($_SESSION['oauth_return']);

    $flag = $isNew || !$_SESSION['profile_complete'] ? '?new_user=1' : '';
    header('Location: ' . $return . $flag);
    exit;
}

http_response_code(400);
echo 'Tham số không hợp lệ.';
