<?php
/**
 * Goodlucks Homes - Administrator bootstrap (CLI only)
 *
 * Creates or repairs the administrator account. Credentials are never stored in
 * the repository: they come from environment variables or .env / config.local.php.
 *
 * Usage (on the cPanel server, via SSH or cPanel "Terminal"):
 *
 *   php php-backend/admin_bootstrap.php --email=admin@goodlucks.co --name="Goodlucks Admin"
 *
 * The password is read from the ADMIN_INITIAL_PASSWORD environment variable, or
 * prompted for interactively. The script refuses to run over the web.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(403);
    echo json_encode(['error' => 'This script can only be run from the command line.']);
    exit;
}

require_once __DIR__ . '/config.php';

function cli_option(string $name, ?string $default = null): ?string
{
    global $argv;
    foreach ($argv as $arg) {
        if (str_starts_with($arg, '--' . $name . '=')) {
            return substr($arg, strlen($name) + 3);
        }
        if ($arg === '--' . $name) {
            return '1';
        }
    }
    return $default;
}

echo "Goodlucks Homes - administrator bootstrap\n";
echo "Database driver: " . db_driver() . "\n";

// Connect immediately so a bad configuration fails loudly instead of exiting
// silently (display_errors is off, so PDO errors are otherwise invisible).
try {
    db();
} catch (Throwable $e) {
    fwrite(STDERR, "Could not connect to the database.\n");
    fwrite(STDERR, '  ' . $e->getMessage() . "\n");
    fwrite(STDERR, "  Configure DB_* in php-backend/.env (see .env.example),\n");
    fwrite(STDERR, "  or for local development run with DB_DRIVER=sqlite DB_SQLITE_PATH=.data/dev.sqlite\n");
    exit(1);
}

$email = strtolower(trim((string)(cli_option('email') ?? getenv('ADMIN_EMAIL') ?: 'admin@goodlucks.co')));
$name = trim((string)(cli_option('name') ?? getenv('ADMIN_NAME') ?: 'Goodlucks Admin'));
$phone = trim((string)(cli_option('phone') ?? getenv('ADMIN_PHONE') ?: '+233 23 769 0080'));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "A valid --email is required.\n");
    exit(1);
}

$password = (string)(getenv('ADMIN_INITIAL_PASSWORD') ?: '');
if ($password === '' && cli_option('password')) {
    $password = (string)cli_option('password');
}
if ($password === '') {
    $prompt = "Password for {$email}: ";
    if (function_exists('shell_exec') && stripos(PHP_OS, 'WIN') === false) {
        echo $prompt;
        system('stty -echo');
        $password = trim((string)fgets(STDIN));
        system('stty echo');
        echo "\n";
    } else {
        echo $prompt;
        $password = trim((string)fgets(STDIN));
    }
}

if (strlen($password) < 10) {
    fwrite(STDERR, "Refusing to continue: the administrator password must be at least 10 characters.\n");
    exit(1);
}

$hash = password_hash($password, PASSWORD_BCRYPT);
$existing = find_user_by_email($email);

if ($existing) {
    update_user((string)$existing['id'], [
        'password_hash' => $hash,
        'name'          => $name !== '' ? $name : (string)$existing['name'],
        'phone'         => $phone !== '' ? $phone : (string)$existing['phone'],
    ]);
    db_exec("UPDATE users SET role = 'admin', is_verified = 1 WHERE id = :id", [':id' => $existing['id']]);
    echo "Updated existing administrator account: {$email}\n";
} else {
    $user = create_user([
        'email'         => $email,
        'name'          => $name !== '' ? $name : 'Goodlucks Admin',
        'role'          => 'admin',
        'phone'         => $phone,
        'password_hash' => $hash,
    ]);
    db_exec("UPDATE users SET is_verified = 1 WHERE id = :id", [':id' => $user['id']]);
    echo "Created administrator account: {$email}\n";
}

// Any admin login access key configured in the environment must be presented
// at the admin console. Print only whether it is set - never the value.
$accessKeySet = trim((string)cfg('ADMIN_ACCESS_KEY', '')) !== '';
echo $accessKeySet
    ? "ADMIN_ACCESS_KEY is configured: the admin console will also require it.\n"
    : "ADMIN_ACCESS_KEY is not configured (optional second factor).\n";

echo "Done. Sign in at " . SITE_URL . "/admin-login\n";
