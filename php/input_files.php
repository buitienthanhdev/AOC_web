<?php
// Trước đây endpoint này mở công khai, không auth — bất kỳ ai cũng liệt kê
// được tên/đường dẫn ảnh khách đã tải lên/AI đã sinh ra qua ComfyUI. Không
// có nơi nào trong frontend gọi endpoint này (chỉ nhắc tới trong 1 comment ở
// history_api.php) — đây là tiện ích debug/admin, nên khoá lại bằng session
// admin của admin.php thay vì để public.
session_start();
if (!($_SESSION['admin_ok'] ?? false)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Forbidden — chỉ admin đã đăng nhập (xem admin.php).']);
    exit;
}

header('Content-Type: application/json');

require_once __DIR__ . '/env_loader.php';

$input_dir  = rtrim(getenv('COMFYUI_INPUT_DIR')  ?: '', '/\\') . '/';
$output_dir = rtrim(getenv('COMFYUI_OUTPUT_DIR') ?: '', '/\\') . '/';
$comfy_url  = rtrim(getenv('COMFYUI_URL') ?: 'http://localhost:8188', '/');

if (!$input_dir || $input_dir === '/') {
    echo json_encode(['error' => 'COMFYUI_INPUT_DIR chưa được cấu hình trong .env']);
    exit;
}

$type = $_GET['type'] ?? 'input';
$dir  = $type === 'output' ? $output_dir : $input_dir;

$exts  = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
$files = [];

if (is_dir($dir)) {
    foreach (scandir($dir) as $f) {
        if ($f === '.' || $f === '..') continue;
        $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
        if (!in_array($ext, $exts)) continue;
        $files[] = [
            'name'  => $f,
            'url'   => $comfy_url . '/view?filename=' . rawurlencode($f) . '&type=' . $type,
            'mtime' => filemtime($dir . $f),
            'size'  => filesize($dir . $f),
        ];
    }
    usort($files, fn($a, $b) => $b['mtime'] - $a['mtime']);
}

echo json_encode(array_values($files));
