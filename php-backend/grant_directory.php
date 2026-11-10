<?php
/**
 * Goodlucks Homes — grant or revoke the Upgrade 2 Phase 3 capabilities (CLI only)
 *
 * Three new powers, all default-deny, all granted only from the server console:
 *
 *   --users     open the user directory and read a person's profile (A11)
 *   --activity  read a person's stored history and the platform activity feed
 *               (A13, A14)
 *   --bulk      write, queue and retry bulk email campaigns (A12)
 *
 *   php php-backend/grant_directory.php --email=manager@goodlucks.co --users=1
 *   php php-backend/grant_directory.php --email=manager@goodlucks.co --activity=1
 *   php php-backend/grant_directory.php --email=marketing@goodlucks.co --bulk=1
 *   php php-backend/grant_directory.php --email=clerk@goodlucks.co --bulk=0
 *   php php-backend/grant_directory.php --list
 *
 * Being an administrator is not enough: `role = 'admin'` grants none of these.
 * The PRIMARY platform administrator (users.is_primary_admin, assigned only by
 * php-backend/assign_primary_admin.php) holds all three without a grant, and
 * this script cannot make anyone primary.
 *
 * There is deliberately no HTTP route that grants any of them, so a stolen
 * administrator session cannot widen its own powers.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(403);
    echo json_encode(['error' => 'This script can only be run from the command line.']);
    exit;
}

require_once __DIR__ . '/config.php';

function cli_flag(string $name): ?string
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
    return null;
}

function cli_bool(?string $value): ?bool
{
    if ($value === null) {
        return null;
    }
    $normalised = strtolower(trim($value));
    if (in_array($normalised, ['1', 'true', 'yes', 'on'], true)) {
        return true;
    }
    if (in_array($normalised, ['0', 'false', 'no', 'off'], true)) {
        return false;
    }
    return null;
}

echo "Goodlucks Homes - user directory and bulk email capabilities\n";
echo 'Database driver: ' . db_driver() . "\n";

try {
    db();
} catch (Throwable $e) {
    fwrite(STDERR, "Could not connect to the database.\n");
    fwrite(STDERR, '  ' . $e->getMessage() . "\n");
    exit(1);
}

if (cli_flag('list') !== null) {
    $admins = db_all(
        'SELECT email, name, can_manage_users, can_view_user_activity, can_send_bulk_email, is_primary_admin
           FROM users WHERE role = :role ORDER BY email ASC',
        [':role' => 'admin']
    );
    echo str_repeat('-', 96) . "\n";
    printf("%-40s %-8s %-10s %-8s %-8s\n", 'email', 'users', 'activity', 'bulk', 'primary');
    foreach ($admins as $admin) {
        printf(
            "%-40s %-8s %-10s %-8s %-8s\n",
            (string)$admin['email'],
            (int)$admin['can_manage_users'] === 1 ? 'yes' : 'no',
            (int)$admin['can_view_user_activity'] === 1 ? 'yes' : 'no',
            (int)$admin['can_send_bulk_email'] === 1 ? 'yes' : 'no',
            (int)($admin['is_primary_admin'] ?? 0) === 1 ? 'yes' : 'no'
        );
    }
    exit(0);
}

$email = strtolower(trim((string)cli_flag('email')));
if ($email === '') {
    fwrite(STDERR, "Usage: php php-backend/grant_directory.php --email=<admin email> [--users=1|0] [--activity=1|0] [--bulk=1|0]\n");
    fwrite(STDERR, "       php php-backend/grant_directory.php --list\n");
    exit(2);
}

$manage = cli_bool(cli_flag('users'));
$activity = cli_bool(cli_flag('activity'));
$bulk = cli_bool(cli_flag('bulk'));
if ($manage === null && $activity === null && $bulk === null) {
    fwrite(STDERR, "Nothing to change: pass --users, --activity and/or --bulk with 1|0.\n");
    exit(2);
}

$user = find_user_by_email($email);
if (!$user) {
    fwrite(STDERR, "No account with that email.\n");
    exit(3);
}
if ((string)$user['role'] !== 'admin') {
    fwrite(STDERR, "That account is not an administrator.\n");
    exit(3);
}

$currentManage = (int)($user['can_manage_users'] ?? 0) === 1;
$currentActivity = (int)($user['can_view_user_activity'] ?? 0) === 1;
$currentBulk = (int)($user['can_send_bulk_email'] ?? 0) === 1;

$nextManage = $manage ?? $currentManage;
$nextActivity = $activity ?? $currentActivity;
$nextBulk = $bulk ?? $currentBulk;

set_user_directory_capabilities((string)$user['id'], $nextManage, $nextActivity);
set_bulk_email_capability((string)$user['id'], $nextBulk);

audit_log('user.capabilities_changed', 'user', (string)$user['id'], [
    'email'      => $email,
    'manageUsers' => ['from' => $currentManage, 'to' => $nextManage],
    'viewActivity' => ['from' => $currentActivity, 'to' => $nextActivity],
    'bulkEmail'  => ['from' => $currentBulk, 'to' => $nextBulk],
    'changedVia' => 'cli',
], ['id' => 'system', 'role' => 'system', 'name' => 'server-console']);

echo str_repeat('-', 78) . "\n";
echo "Account  : {$email}\n";
echo 'Users    : ' . ($nextManage ? 'granted' : 'revoked') . "\n";
echo 'Activity : ' . ($nextActivity ? 'granted' : 'revoked') . "\n";
echo 'Bulk mail: ' . ($nextBulk ? 'granted' : 'revoked') . "\n";
echo "Recorded in the audit log.\n";
