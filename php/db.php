<?php
// SQLite — không cần MySQL, tự tạo file khi lần đầu chạy
define('DB_FILE', __DIR__ . '/../data/colorai_history.db');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    try {
        $pdo = new PDO('sqlite:' . DB_FILE, null, null, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        $pdo->exec("PRAGMA journal_mode = WAL");
        $pdo->exec("PRAGMA foreign_keys = ON");

        // ── Bảng users ──────────────────────────────────────────
        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            google_id   TEXT    UNIQUE NOT NULL,
            name        TEXT    NOT NULL DEFAULT '',
            email       TEXT    UNIQUE NOT NULL,
            phone       TEXT    NOT NULL DEFAULT '',
            age         INTEGER NOT NULL DEFAULT 0,
            avatar      TEXT    NOT NULL DEFAULT '',
            created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        )");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");

        // ── Bảng color_history ───────────────────────────────────
        $pdo->exec("CREATE TABLE IF NOT EXISTS color_history (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
            ip             TEXT    NOT NULL DEFAULT '',
            wall_hex       TEXT    NOT NULL DEFAULT '',
            wall_name      TEXT    NOT NULL DEFAULT '',
            trim_hex       TEXT    NOT NULL DEFAULT '',
            trim_name      TEXT    NOT NULL DEFAULT '',
            frame_hex      TEXT    NOT NULL DEFAULT '',
            frame_name     TEXT    NOT NULL DEFAULT '',
            palette_name   TEXT    NOT NULL DEFAULT '',
            image_filename TEXT    NOT NULL DEFAULT '',
            day_url        TEXT    DEFAULT '',
            night_url      TEXT    DEFAULT '',
            created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        )");

        // ── Migration: thêm user_id nếu bảng cũ chưa có (phải trước CREATE INDEX) ──
        try {
            $pdo->exec("ALTER TABLE color_history ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
        } catch (PDOException $_) { /* cột đã tồn tại, bỏ qua */ }

        // Index sau khi đảm bảo cột đã tồn tại
        try { $pdo->exec("CREATE INDEX IF NOT EXISTS idx_user_id ON color_history(user_id)"); } catch (PDOException $_) {}
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_ip      ON color_history(ip)");
        $pdo->exec("CREATE INDEX IF NOT EXISTS idx_created ON color_history(created_at)");

    } catch (PDOException $e) {
        if (defined('ADMIN_MODE')) throw $e;
        header('Content-Type: application/json');
        http_response_code(500);
        die(json_encode(['error' => 'DB error: ' . $e->getMessage()]));
    }

    return $pdo;
}
