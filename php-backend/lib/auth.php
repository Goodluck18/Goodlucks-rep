<?php
/**
 * Goodlucks Homes - Authentication & authorisation
 *
 * Server-side sessions stored in `auth_sessions`; the browser only ever holds
 * a random 256-bit token in an HttpOnly, SameSite=Lax cookie. Tokens are
 * stored hashed (SHA-256) so a database leak cannot be replayed.
 *
 * Authorisation is always enforced here on the server. Hiding a button in the
 * UI is never treated as a security control.
 */

declare(strict_types=1);

function is_https_request(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    $proto = request_header('x-forwarded-proto');
    if ($proto && strtolower(explode(',', $proto)[0]) === 'https') {
        return true;
    }
    return str_contains(strtolower((string)($_SERVER['HTTP_HOST'] ?? '')), 'https');
}

function session_cookie_options(int $expiresAt): array
{
    return [
        'expires'  => $expiresAt,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => is_https_request(),
    ];
}

function hash_session_token(string $token): string
{
    return hash('sha256', $token);
}

function password_is_strong_enough(string $password): bool
{
    return strlen($password) >= 8;
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a new session for a user and set the cookie.
 */
/**
 * Create a single-use password reset token.
 *
 * Only the SHA-256 hash is stored, so a database dump cannot be replayed to
 * take over accounts. Requesting a new token invalidates any previous one.
 *
 * @return array{token: string, expiresAt: string}
 */
function create_password_reset(string $userId): array
{
    $token = bin2hex(random_bytes(32));
    $expiresAt = gmdate('Y-m-d H:i:s', time() + 3600);

    db_exec('DELETE FROM password_resets WHERE user_id = :uid', [':uid' => $userId]);
    db_exec('DELETE FROM password_resets WHERE expires_at < :now', [':now' => db_now()]);
    db_exec(
        'INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at)
         VALUES (:id, :uid, :hash, :expires, :created)',
        [
            ':id'      => new_id('pwreset'),
            ':uid'     => $userId,
            ':hash'    => hash('sha256', $token),
            ':expires' => $expiresAt,
            ':created' => db_now(),
        ]
    );

    return ['token' => $token, 'expiresAt' => $expiresAt];
}

/** Look up an unused, unexpired reset token by its raw value. */
function find_password_reset(string $token): ?array
{
    if (strlen($token) < 32) {
        return null;
    }

    $row = db_one(
        'SELECT * FROM password_resets WHERE token_hash = :hash AND used_at IS NULL LIMIT 1',
        [':hash' => hash('sha256', $token)]
    );
    if (!$row) {
        return null;
    }

    $expires = strtotime((string)$row['expires_at']) ?: 0;
    if ($expires === 0 || $expires < time()) {
        return null;
    }

    return $row;
}

/** Mark a reset token as used and revoke every existing session for the user. */
function consume_password_reset(array $reset): void
{
    db_exec('UPDATE password_resets SET used_at = :now WHERE id = :id', [
        ':now' => db_now(),
        ':id'  => (string)$reset['id'],
    ]);
    db_exec('UPDATE password_resets SET used_at = :now WHERE user_id = :uid AND used_at IS NULL', [
        ':now' => db_now(),
        ':uid' => (string)$reset['user_id'],
    ]);
    db_exec('DELETE FROM auth_sessions WHERE user_id = :uid', [':uid' => (string)$reset['user_id']]);
}

function issue_session(string $userId): string
{
    $token = bin2hex(random_bytes(32));
    $expiresAt = time() + SESSION_TTL_SECONDS;

    db_exec(
        'INSERT INTO auth_sessions (id, user_id, token_hash, user_agent, expires_at, created_at, last_seen_at)
         VALUES (:id, :user_id, :token_hash, :ua, :expires, :created, :seen)',
        [
            ':id'         => new_id('sess'),
            ':user_id'    => $userId,
            ':token_hash' => hash_session_token($token),
            ':ua'         => clean_string(request_header('user-agent') ?? '', 255),
            ':expires'    => db_future(SESSION_TTL_SECONDS),
            ':created'    => db_now(),
            ':seen'       => db_now(),
        ]
    );

    // Opportunistic cleanup of expired sessions (cheap, keeps the table small)
    db_exec('DELETE FROM auth_sessions WHERE expires_at < :now', [':now' => db_now()]);

    if (!headers_sent()) {
        setcookie(SESSION_COOKIE, $token, session_cookie_options($expiresAt));
    }
    return $token;
}

/** Remove the current session (logout). */
function revoke_current_session(): void
{
    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if (is_string($token) && $token !== '') {
        db_exec('DELETE FROM auth_sessions WHERE token_hash = :h', [':h' => hash_session_token($token)]);
    }
    if (!headers_sent()) {
        setcookie(SESSION_COOKIE, '', session_cookie_options(time() - 3600));
    }
}

/**
 * Currently authenticated user row, or null. Cached per request.
 */
function auth_user(): ?array
{
    static $resolved = false;
    static $user = null;

    if ($resolved) {
        return $user;
    }
    $resolved = true;

    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!is_string($token) || $token === '') {
        return null;
    }

    $row = db_one(
        'SELECT s.id AS session_id, s.expires_at, u.*
           FROM auth_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = :h
          LIMIT 1',
        [':h' => hash_session_token($token)]
    );

    if (!$row) {
        return null;
    }

    if (strtotime((string)$row['expires_at']) < time()) {
        db_exec('DELETE FROM auth_sessions WHERE id = :id', [':id' => $row['session_id']]);
        return null;
    }

    $user = $row;
    return $user;
}

/**
 * Require an authenticated user, optionally with one of the given roles.
 *
 * @param string[] $roles empty = any authenticated user
 */
function require_auth(array $roles = []): array
{
    $user = auth_user();
    if (!$user) {
        error_response('You must be signed in to perform this action.', 401);
    }
    if ($roles && !in_array($user['role'], $roles, true)) {
        error_response('You do not have permission to perform this action.', 403);
    }
    return $user;
}

function require_admin(): array
{
    return require_auth(['admin']);
}

/** True when the authenticated user is an admin. */
function is_admin(?array $user = null): bool
{
    $user = $user ?? auth_user();
    return $user !== null && ($user['role'] ?? '') === 'admin';
}

/** Ownership check used for landlord property access. */
function can_manage_property(array $user, array $property): bool
{
    if (($user['role'] ?? '') === 'admin') {
        return true;
    }
    return ($user['role'] ?? '') === 'landlord' && (string)$property['landlord_id'] === (string)$user['id'];
}

/**
 * Public representation of a user row (never includes password_hash).
 */
function public_user(array $row): array
{
    return [
        'id'                 => (string)$row['id'],
        'email'              => (string)$row['email'],
        'name'               => (string)$row['name'],
        'role'               => (string)$row['role'],
        'phone'              => (string)($row['phone'] ?? ''),
        'avatar'             => (string)($row['avatar'] ?? ''),
        'address'            => (string)($row['address'] ?? ''),
        'bio'                => (string)($row['bio'] ?? ''),
        'company'            => (string)($row['company'] ?? ''),
        'isVerified'         => (bool)($row['is_verified'] ?? false),
        'preferredLocations' => json_column($row['preferred_locations'] ?? null),
        'budgetMin'          => isset($row['budget_min']) && $row['budget_min'] !== null ? (float)$row['budget_min'] : null,
        'budgetMax'          => isset($row['budget_max']) && $row['budget_max'] !== null ? (float)$row['budget_max'] : null,
        'preferredBedrooms'  => isset($row['preferred_bedrooms']) && $row['preferred_bedrooms'] !== null ? (int)$row['preferred_bedrooms'] : null,
        'additionalNotes'    => (string)($row['additional_notes'] ?? ''),
        'createdAt'          => to_iso($row['created_at'] ?? null),
    ];
}

/** Convert a DB datetime (UTC) to an ISO-8601 string for the client. */
function to_iso(?string $value): string
{
    if (!$value) {
        return '';
    }
    $ts = strtotime($value . (str_contains($value, 'Z') ? '' : ' UTC'));
    return $ts === false ? '' : gmdate('c', $ts);
}
