<?php
/**
 * Goodlucks Homes — grant or revoke the Legal Pages capabilities (CLI only)
 *
 * Two powers, both default deny:
 *
 *   --manage   open Legal Pages, edit a draft, preview it, discard it
 *   --publish  publish a draft, restore an older version, switch the
 *              re-acceptance prompt on or off
 *
 *   php php-backend/grant_legal.php --email=manager@goodlucks.co --manage=1
 *   php php-backend/grant_legal.php --email=manager@goodlucks.co --publish=1
 *   php php-backend/grant_legal.php --email=clerk@goodlucks.co --manage=0 --publish=0
 *   php php-backend/grant_legal.php --list
 *
 * Being an administrator is not enough: `role = 'admin'` grants neither. The
 * PRIMARY platform administrator (users.is_primary_admin) holds both without a
 * grant, and this script cannot make anyone primary.
 *
 * There is deliberately no HTTP route that grants either capability, so a stolen
 * administrator session cannot publish a policy, or widen its own powers.
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

/** Store the two flags on one administrator. Never touches any other column. */
function set_user_legal_capabilities(string $userId, bool $manage, bool $publish): void
{
    db_exec(
        'UPDATE users SET can_manage_legal = :manage, can_publish_legal = :publish,
                          updated_at = :now
          WHERE id = :id AND role = :role',
        [
            ':manage'  => $manage ? 1 : 0,
            ':publish' => $publish ? 1 : 0,
            ':now'     => db_now(),
            ':id'      => $userId,
            ':role'    => 'admin',
        ]
    );
}

echo "Goodlucks Homes - Legal Pages capabilities\n";
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
        'SELECT email, name, can_manage_legal, can_publish_legal, is_primary_admin
           FROM users WHERE role = :role ORDER BY email ASC',
        [':role' => 'admin']
    );
    echo str_repeat('-', 96) . "\n";
    printf("%-40s %-10s %-10s %-8s\n", 'email', 'manage', 'publish', 'primary');
    foreach ($admins as $admin) {
        printf(
            "%-40s %-10s %-10s %-8s\n",
            (string)$admin['email'],
            (int)$admin['can_manage_legal'] === 1 ? 'yes' : 'no',
            (int)$admin['can_publish_legal'] === 1 ? 'yes' : 'no',
            (int)($admin['is_primary_admin'] ?? 0) === 1 ? 'yes' : 'no'
        );
    }
    exit(0);
}

$email = strtolower(trim((string)cli_flag('email')));
if ($email === '') {
    fwrite(STDERR, "Usage: php php-backend/grant_legal.php --email=<admin email> [--manage=1|0] [--publish=1|0]\n");
    fwrite(STDERR, "       php php-backend/grant_legal.php --list\n");
    exit(2);
}

$manage = cli_bool(cli_flag('manage'));
$publish = cli_bool(cli_flag('publish'));
if ($manage === null && $publish === null) {
    fwrite(STDERR, "Nothing to change: pass --manage and/or --publish with 1|0.\n");
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
if ((int)($user['is_primary_admin'] ?? 0) === 1) {
    echo "This account is the primary administrator and already holds both capabilities.\n";
}

$currentManage = (int)($user['can_manage_legal'] ?? 0) === 1;
$currentPublish = (int)($user['can_publish_legal'] ?? 0) === 1;

$nextManage = $manage ?? $currentManage;
$nextPublish = $publish ?? $currentPublish;

set_user_legal_capabilities((string)$user['id'], $nextManage, $nextPublish);

audit_log('user.capabilities_changed', 'user', (string)$user['id'], [
    'email'       => $email,
    'manageLegal' => ['from' => $currentManage, 'to' => $nextManage],
    'publishLegal' => ['from' => $currentPublish, 'to' => $nextPublish],
    'changedVia'  => 'cli',
], ['id' => 'system', 'role' => 'system', 'name' => 'server-console']);

echo str_repeat('-', 78) . "\n";
echo "Account : {$email}\n";
echo 'Manage  : ' . ($nextManage ? 'granted' : 'revoked') . "\n";
echo 'Publish : ' . ($nextPublish ? 'granted' : 'revoked') . "\n";
echo "Recorded in the audit log.\n";
