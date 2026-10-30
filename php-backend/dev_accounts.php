<?php
/**
 * Goodlucks Homes - Development demo accounts (CLI only)
 *
 * The schema seeds a demo tenant, landlord and admin so the website has listings
 * and a moderation queue to look at. Their rows deliberately ship with NO
 * password: a published password for an account that owns listings would be a
 * security hole on a live site.
 *
 * This helper gives those accounts a known password for LOCAL DEVELOPMENT ONLY.
 * It refuses to run unless APP_ENV=development and DB_DRIVER=sqlite, so it can
 * never touch the production database.
 *
 * Usage:
 *   node_modules/.bin/php-wasm-cli php-backend/dev_accounts.php
 *   (or: php php-backend/dev_accounts.php)
 *
 * `npm run dev` runs this automatically and prints the credentials.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(403);
    echo json_encode(['error' => 'This script can only be run from the command line.']);
    exit;
}

require_once __DIR__ . '/config.php';

$appEnv = strtolower((string)cfg('APP_ENV', 'production'));

if ($appEnv !== 'development' || db_driver() !== 'sqlite') {
    fwrite(STDERR, "Refusing to run: development demo passwords are only allowed\n");
    fwrite(STDERR, "when APP_ENV=development and DB_DRIVER=sqlite.\n");
    fwrite(STDERR, "Current APP_ENV={$appEnv}, driver=" . db_driver() . "\n");
    exit(1);
}

try {
    db();
} catch (Throwable $e) {
    fwrite(STDERR, 'Could not open the development database: ' . $e->getMessage() . "\n");
    exit(1);
}

// Development-only credentials. Never deployed, never valid in production.
const DEV_PASSWORD = 'Goodlucks-Dev-123';

$accounts = [
    ['email' => 'admin@goodlucks.com',    'role' => 'admin'],
    ['email' => 'landlord@goodlucks.com', 'role' => 'landlord'],
    ['email' => 'tenant@goodlucks.com',   'role' => 'tenant'],
];

$hash = password_hash(DEV_PASSWORD, PASSWORD_BCRYPT);
$rows = [];

foreach ($accounts as $account) {
    $user = find_user_by_email($account['email']);
    if ($user) {
        $needsPassword = trim((string)($user['password_hash'] ?? '')) === '';
        if ($needsPassword) {
            update_user((string)$user['id'], ['password_hash' => $hash, 'is_verified' => 1]);
        }
        $rows[] = [$account['email'], $needsPassword ? 'password set' : 'already configured'];
        continue;
    }

    // The seeds were not imported (e.g. an existing local database): create it.
    $created = create_user([
        'email'         => $account['email'],
        'name'          => ucfirst($account['role']) . ' Demo',
        'role'          => $account['role'],
        'phone'         => '+233 23 769 0080',
        'password_hash' => $hash,
    ]);
    db_exec('UPDATE users SET is_verified = 1 WHERE id = :id', [':id' => $created['id']]);
    $rows[] = [$account['email'], 'created'];
}

echo "Development demo accounts (local only):\n";
foreach ($rows as [$email, $status]) {
    printf("  %-26s %-18s password: %s\n", $email, $status, DEV_PASSWORD);
}
echo "\nAdmin console: /admin-login (no ADMIN_ACCESS_KEY is set locally).\n";
