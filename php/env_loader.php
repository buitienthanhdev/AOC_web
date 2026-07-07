<?php
/**
 * Đọc file .env và nạp vào $_ENV / getenv()
 * Gọi require_once một lần duy nhất ở đầu mỗi file PHP cần dùng.
 */
function loadEnv(string $file = __DIR__ . '/../.env'): void {
    static $loaded = false;
    if ($loaded || !is_file($file)) return;
    $loaded = true;

    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (!str_contains($line, '=')) continue;
        [$key, $val] = explode('=', $line, 2);
        $key = trim($key);
        $val = trim($val);
        // Bỏ dấu nháy nếu có
        if (strlen($val) >= 2 && $val[0] === '"' && $val[-1] === '"') {
            $val = substr($val, 1, -1);
        } elseif (strlen($val) >= 2 && $val[0] === "'" && $val[-1] === "'") {
            $val = substr($val, 1, -1);
        }
        if (!array_key_exists($key, $_ENV)) {
            $_ENV[$key] = $val;
            putenv("$key=$val");
        }
    }
}

loadEnv();
