<?php
/**
 * Test helper: plant a password-reset token row without going through email.
 *
 * The real flow only reveals the token inside the email body, which tests cannot
 * read, so this inserts the same row the backend would (SHA-256 hash only).
 *
 *   php tests/reset-token.php --email=tenant@example.com --token=<raw> \
 *       [--expires-in=3600] [--used=0]
 */

require_once __DIR__ . '/../php-backend/config.php';

$options = getopt('', ['email:', 'token:', 'expires-in::', 'used::']);

$email = (string)($options['email'] ?? '');
$token = (string)($options['token'] ?? '');
$expiresIn = (int)($options['expires-in'] ?? 3600);
$used = (int)($options['used'] ?? 0);

if ($email === '' || $token === '') {
    fwrite(STDERR, "Usage: php tests/reset-token.php --email=<address> --token=<raw token>\n");
    exit(2);
}

$user = find_user_by_email($email);
if (!$user) {
    fwrite(STDERR, "No user with email {$email}\n");
    exit(3);
}

db_exec('DELETE FROM password_resets WHERE user_id = :uid', [':uid' => (string)$user['id']]);
db_exec(
    'INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at, created_at)
     VALUES (:id, :uid, :hash, :expires, :used, :created)',
    [
        ':id'      => new_id('pwreset'),
        ':uid'     => (string)$user['id'],
        ':hash'    => hash('sha256', $token),
        ':expires' => gmdate('Y-m-d H:i:s', time() + $expiresIn),
        ':used'    => $used === 1 ? db_now() : null,
        ':created' => db_now(),
    ]
);

echo json_encode(['userId' => (string)$user['id'], 'expiresIn' => $expiresIn]) . "\n";
