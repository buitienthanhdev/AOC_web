<?php
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/csrf.php';

if (!empty($_SESSION['user_id'])) {
    echo json_encode([
        'user' => [
            'id'               => (int)$_SESSION['user_id'],
            'name'             => $_SESSION['user_name']   ?? '',
            'email'            => $_SESSION['user_email']  ?? '',
            'avatar'           => $_SESSION['user_avatar'] ?? '',
            'profile_complete' => (bool)($_SESSION['profile_complete'] ?? false),
        ],
        'csrf_token' => csrfToken(),
    ]);
} else {
    echo json_encode([
        'user'       => null,
        'csrf_token' => csrfToken(),
    ]);
}
