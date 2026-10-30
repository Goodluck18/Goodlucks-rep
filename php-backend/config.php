<?php
/**
 * Goodlucks Homes - Core configuration & bootstrap
 *
 * NO SECRETS ARE STORED IN THIS FILE.
 * Database credentials and API keys are read from (in order of precedence):
 *   1. Real environment variables (cPanel "Environment Variables" / SetEnv)
 *   2. php-backend/.env           (git-ignored, create from .env.example)
 *   3. php-backend/config.local.php  (git-ignored, returns an array)
 *
 * Drivers:
 *   - mysql  : production (cPanel / phpMyAdmin). This is the DEFAULT.
 *   - sqlite : local development & automated tests ONLY.
 *
 * The driver is only ever 'sqlite' when DB_DRIVER is explicitly set to sqlite.
 * There is no silent fallback: if MySQL is configured and unreachable we return
 * a 500 error and log the real reason server-side (never to the browser).
 */

declare(strict_types=1);

if (!defined('GOODLUCKS_BOOTSTRAPPED')) {
    define('GOODLUCKS_BOOTSTRAPPED', true);
}

define('GL_ROOT', __DIR__);

// ---------------------------------------------------------------------------
// Error handling: never leak stack traces / DB errors to visitors.
// ---------------------------------------------------------------------------
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('html_errors', '0');

$logDir = GL_ROOT . '/logs';
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}
@ini_set('error_log', $logDir . '/php-error.log');

// ---------------------------------------------------------------------------
// Tiny .env loader (KEY=VALUE, # comments, optional quotes)
// ---------------------------------------------------------------------------
function gl_load_env_file(string $path): void
{
    if (!is_file($path) || !is_readable($path)) {
        return;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (strlen($value) >= 2) {
            $first = $value[0];
            $last = substr($value, -1);
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $value = substr($value, 1, -1);
            }
        }
        if ($key !== '' && getenv($key) === false) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}

gl_load_env_file(GL_ROOT . '/.env');

/** Local override file may return an array of config values. */
$GL_LOCAL_CONFIG = [];
$localConfigPath = GL_ROOT . '/config.local.php';
if (is_file($localConfigPath)) {
    $loaded = require $localConfigPath;
    if (is_array($loaded)) {
        $GL_LOCAL_CONFIG = $loaded;
    }
}

/**
 * Read a configuration value (env var > config.local.php > default).
 */
function cfg(string $key, $default = null)
{
    global $GL_LOCAL_CONFIG;

    $value = getenv($key);
    if ($value !== false && $value !== '') {
        return $value;
    }
    if (isset($GL_LOCAL_CONFIG[$key]) && $GL_LOCAL_CONFIG[$key] !== '') {
        return $GL_LOCAL_CONFIG[$key];
    }
    return $default;
}

// ---------------------------------------------------------------------------
// Application constants (safe, non-secret)
// ---------------------------------------------------------------------------
define('OFFICIAL_EMAIL', (string)cfg('OFFICIAL_EMAIL', 'rentals@goodlucks.co'));
define('OFFICIAL_NAME', (string)cfg('OFFICIAL_NAME', 'Goodlucks Homes Intermediary'));
define('OFFICIAL_PHONE', (string)cfg('OFFICIAL_PHONE', '+233237690080'));
define('SITE_URL', rtrim((string)cfg('APP_URL', 'https://rent.goodlucks.co'), '/'));

define('DB_DRIVER', strtolower((string)cfg('DB_DRIVER', 'mysql')));
define('DB_HOST', (string)cfg('DB_HOST', 'localhost'));
define('DB_NAME', (string)cfg('DB_NAME', ''));
define('DB_USER', (string)cfg('DB_USER', ''));
define('DB_PASS', (string)cfg('DB_PASS', ''));
define('DB_CHARSET', (string)cfg('DB_CHARSET', 'utf8mb4'));

/** Absolute path of the SQLite file used when DB_DRIVER=sqlite. */
define('DB_SQLITE_PATH', (string)cfg('DB_SQLITE_PATH', GL_ROOT . '/local-dev.sqlite'));
/** Absolute path of the SQLite schema used for local development/tests. */
define('DB_SQLITE_SCHEMA', GL_ROOT . '/schema.sqlite.sql');

define('UPLOAD_DIR', (string)cfg('UPLOAD_DIR', GL_ROOT . '/uploads'));
define('UPLOAD_MAX_BYTES', (int)cfg('UPLOAD_MAX_BYTES', 8 * 1024 * 1024)); // 8 MB
define('UPLOAD_URL_PATH', (string)cfg('UPLOAD_URL_PATH', '/api/uploads'));

define('SESSION_COOKIE', 'gl_session');
define('SESSION_TTL_SECONDS', (int)cfg('SESSION_TTL_SECONDS', 60 * 60 * 24 * 7)); // 7 days
define('VIEWING_FEE_GHS', (float)cfg('VIEWING_FEE_GHS', 100));

require_once GL_ROOT . '/lib/http.php';
require_once GL_ROOT . '/lib/db.php';
require_once GL_ROOT . '/lib/validate.php';
require_once GL_ROOT . '/lib/auth.php';
require_once GL_ROOT . '/lib/mailer.php';
require_once GL_ROOT . '/lib/repository.php';
require_once GL_ROOT . '/lib/api.php';
