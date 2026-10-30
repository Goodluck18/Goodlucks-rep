<?php
/**
 * Goodlucks Homes - HTTP layer helpers
 * (request parsing, JSON responses, CORS/origin protection, rate limiting)
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function gl_log(string $level, string $message, array $context = []): void
{
    $line = sprintf(
        "[%s] %s %s %s\n",
        date('c'),
        strtoupper($level),
        $message,
        $context ? json_encode($context, JSON_UNESCAPED_SLASHES) : ''
    );
    $dir = GL_ROOT . '/logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @file_put_contents($dir . '/api.log', $line, FILE_APPEND | LOCK_EX);
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------
function gl_send_common_headers(): void
{
    if (headers_sent()) {
        return;
    }
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Cache-Control: no-store');
}

/**
 * Send a successful JSON response and terminate.
 */
function json_response($data, int $status = 200): void
{
    if (ob_get_length()) {
        @ob_clean();
    }
    gl_send_common_headers();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Backwards-compatible alias used by legacy endpoint files. */
function sendJsonResponse($data, int $status = 200): void
{
    json_response($data, $status);
}

/**
 * Send an error response and terminate.
 * The public message is deliberately generic; details are logged server-side.
 */
function error_response(string $message, int $status = 400, $fields = null): void
{
    $payload = ['success' => false, 'error' => $message];
    if (is_array($fields) && $fields) {
        $payload['fields'] = $fields;
    }
    json_response($payload, $status);
}

/** Log the real cause and return a generic 500 to the caller. */
function server_error_response(Throwable $e, string $publicMessage = 'An unexpected server error occurred. Please try again.'): void
{
    gl_log('error', $e->getMessage(), [
        'file' => $e->getFile(),
        'line' => $e->getLine(),
    ]);
    error_response($publicMessage, 500);
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------
function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

/**
 * API-relative path, e.g. "/properties/prop-1" for "/api/properties/prop-1".
 * Works both with Apache rewrites and with the PHP built-in dev server.
 */
function request_path(): string
{
    $path = $_SERVER['REQUEST_URI'] ?? '/';
    $path = explode('?', $path, 2)[0];

    // The API is mounted at /api (Apache rewrite on cPanel, the Vite dev proxy
    // locally, or a router script). Normalise all three to "/properties" etc.
    if ($path === '/api' || str_starts_with($path, '/api/')) {
        $path = substr($path, 4);
    }

    // Otherwise strip the directory the front controller lives in (/api/index.php)
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    $baseDir = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
    if ($baseDir !== '' && $baseDir !== '/' && !str_ends_with($baseDir, '/api') && str_starts_with($path, $baseDir)) {
        $path = substr($path, strlen($baseDir));
    }

    // Support ?route=... for hosts where rewrites are unavailable
    if (isset($_GET['route']) && is_string($_GET['route'])) {
        $path = '/' . ltrim($_GET['route'], '/');
    }

    $path = '/' . trim($path, '/');
    return $path === '/' ? '/' : rtrim($path, '/');
}

/**
 * Decoded JSON body (or form-encoded fallback).
 */
function request_json(): array
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $raw = file_get_contents('php://input');
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $cached = $decoded;
            return $cached;
        }
        // Some clients send form encoded bodies without a JSON content type.
        if (str_contains((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/x-www-form-urlencoded')) {
            parse_str($raw, $parsed);
            $cached = is_array($parsed) ? $parsed : [];
            return $cached;
        }
        $cached = [];
        return $cached;
    }

    $cached = is_array($_POST) ? $_POST : [];
    return $cached;
}

/** Backwards-compatible alias used by legacy endpoint files. */
function getJsonInput(): array
{
    return request_json();
}

function query_param(string $key, $default = null)
{
    if (!isset($_GET[$key])) {
        return $default;
    }
    $value = $_GET[$key];
    if (!is_string($value)) {
        return $default;
    }
    $value = trim($value);
    return $value === '' ? $default : $value;
}

function request_header(string $name): ?string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (isset($_SERVER[$key])) {
        return (string)$_SERVER[$key];
    }
    if (strtolower($name) === 'content-type' && isset($_SERVER['CONTENT_TYPE'])) {
        return (string)$_SERVER['CONTENT_TYPE'];
    }
    return null;
}

// ---------------------------------------------------------------------------
// Cross-site request protection
// ---------------------------------------------------------------------------

/**
 * Host part of a URL/origin string, lower-case, without port.
 */
function host_of(string $url): string
{
    $parts = parse_url($url);
    if ($parts === false) {
        return '';
    }
    return strtolower($parts['host'] ?? '');
}

/**
 * For state-changing requests we require a trustworthy Origin/Referer.
 *
 * This blocks classic cross-site form POSTs while still allowing:
 *  - same-origin browser requests (production),
 *  - the local Vite dev proxy (dev origins, only when APP_ENV != production).
 *
 * Combined with SameSite=Lax session cookies this removes the CSRF risk for
 * this API without needing per-form tokens.
 */
function require_trusted_origin(): void
{
    $origin = request_header('origin');
    if (!$origin) {
        $referer = request_header('referer');
        $origin = $referer ?: '';
    }

    // Non-browser clients (curl, tests, mobile shells) send no Origin.
    if ($origin === '') {
        return;
    }

    $originHost = host_of($origin);
    $requestHost = strtolower(explode(':', (string)($_SERVER['HTTP_HOST'] ?? ''))[0]);

    if ($originHost !== '' && ($originHost === $requestHost || $originHost === host_of(SITE_URL))) {
        return;
    }

    $allowed = array_filter(array_map('trim', explode(',', (string)cfg('ALLOWED_ORIGINS', ''))));
    foreach ($allowed as $entry) {
        if ($originHost !== '' && $originHost === host_of($entry)) {
            return;
        }
    }

    $appEnv = strtolower((string)cfg('APP_ENV', 'production'));
    if ($appEnv !== 'production' && in_array($originHost, ['localhost', '127.0.0.1', '0.0.0.0', '::1'], true)) {
        return;
    }

    gl_log('warning', 'Blocked request from untrusted origin', ['origin' => $origin, 'host' => $requestHost]);
    error_response('Request origin could not be verified.', 403);
}

// ---------------------------------------------------------------------------
// Rate limiting (database backed, shared across PHP workers)
// ---------------------------------------------------------------------------
function client_ip(): string
{
    $forwarded = request_header('x-forwarded-for');
    if ($forwarded) {
        $first = trim(explode(',', $forwarded)[0]);
        if ($first !== '') {
            return $first;
        }
    }
    return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/**
 * Enforce a sliding-window rate limit. Returns silently when allowed.
 */
function enforce_rate_limit(string $bucket, int $maxAttempts, int $windowSeconds): void
{
    $identity = $bucket . '|' . client_ip();
    $key = hash('sha256', $identity);
    $windowStart = intdiv(time(), $windowSeconds) * $windowSeconds;

    try {
        $pdo = db();
        $pdo->prepare('DELETE FROM rate_limits WHERE window_start < :cutoff')
            ->execute([':cutoff' => $windowStart - ($windowSeconds * 4)]);

        $stmt = $pdo->prepare('SELECT attempts FROM rate_limits WHERE rl_key = :k AND window_start = :w');
        $stmt->execute([':k' => $key, ':w' => $windowStart]);
        $row = $stmt->fetch();

        if ($row) {
            $attempts = (int)$row['attempts'] + 1;
            $pdo->prepare('UPDATE rate_limits SET attempts = :a WHERE rl_key = :k AND window_start = :w')
                ->execute([':a' => $attempts, ':k' => $key, ':w' => $windowStart]);
        } else {
            $attempts = 1;
            $pdo->prepare('INSERT INTO rate_limits (rl_key, window_start, attempts) VALUES (:k, :w, :a)')
                ->execute([':k' => $key, ':w' => $windowStart, ':a' => $attempts]);
        }

        if ($attempts > $maxAttempts) {
            header('Retry-After: ' . $windowSeconds);
            error_response('Too many attempts. Please wait a few minutes and try again.', 429);
        }
    } catch (Throwable $e) {
        // Never let rate limiting take the whole site down; log and continue.
        gl_log('error', 'Rate limit check failed: ' . $e->getMessage());
    }
}
