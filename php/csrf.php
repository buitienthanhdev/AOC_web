<?php
/**
 * CSRF Token helper
 * - csrfToken()  : trả về token hiện tại (tạo mới nếu chưa có)
 * - csrfVerify() : kiểm tra token từ header X-CSRF-Token hoặc body _csrf
 *                  Ném Exception nếu không hợp lệ.
 */

if (session_status() === PHP_SESSION_NONE) session_start();

function csrfToken(): string {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrfVerify(): void {
    $token = $_SERVER['HTTP_X_CSRF_TOKEN']
          ?? (json_decode(file_get_contents('php://input'), true)['_csrf'] ?? '');

    if (!hash_equals(csrfToken(), (string)$token)) {
        http_response_code(403);
        header('Content-Type: application/json');
        die(json_encode(['error' => 'CSRF token không hợp lệ']));
    }
}
