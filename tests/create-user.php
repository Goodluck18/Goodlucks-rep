<?php
/**
 * Test helper: create a user row directly, without email or rate limits.
 *
 * The integration suite needs a handful of isolated accounts (a second landlord
 * and a second tenant) to prove that records are not readable across accounts.
 * Creating them over HTTP would consume the per-IP registration rate limit
 * (10/hour) that other tests in the same run also depend on, so they are
 * inserted the same way the backend inserts them and then signed in normally.
 *
 *   php tests/create-user.php --email=a@example.com --password=Secret-123 \
 *       --name="Access Landlord" --role=landlord [--phone="+233 20 900 0001"]
 */

require_once __DIR__ . '/../php-backend/config.php';

$options = getopt('', ['email:', 'password:', 'name:', 'role:', 'phone::']);

$email = (string)($options['email'] ?? '');
$password = (string)($options['password'] ?? '');
$name = (string)($options['name'] ?? '');
$role = (string)($options['role'] ?? 'tenant');
$phone = (string)($options['phone'] ?? '');

if ($email === '' || $password === '' || $name === '') {
    fwrite(STDERR, "Usage: php tests/create-user.php --email=<address> --password=<raw> --name=<name> --role=<tenant|landlord> [--phone=<number>]\n");
    exit(2);
}
if (!in_array($role, ['tenant', 'landlord'], true)) {
    fwrite(STDERR, "role must be tenant or landlord\n");
    exit(2);
}

$existing = find_user_by_email($email);
if ($existing) {
    echo json_encode(['id' => (string)$existing['id'], 'email' => $email, 'created' => false]) . "\n";
    exit(0);
}

create_user([
    'email'         => $email,
    'name'          => $name,
    'role'          => $role,
    'phone'         => $phone,
    'password_hash' => password_hash($password, PASSWORD_DEFAULT),
]);

$user = find_user_by_email($email);
if (!$user) {
    fwrite(STDERR, "User could not be created\n");
    exit(3);
}

echo json_encode(['id' => (string)$user['id'], 'email' => $email, 'created' => true]) . "\n";
