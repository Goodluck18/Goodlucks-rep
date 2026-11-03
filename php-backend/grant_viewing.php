<?php
/**
 * Goodlucks Homes — grant or revoke the viewing-correction capability (CLI only)
 *
 * Ordinary administration can read viewings and run the normal lifecycle
 * actions. *Correcting* a viewing — reopening a cancelled appointment, recording
 * a completion the agent could not record, fixing a mistaken no-show — rewrites
 * the operational record, so it needs a separate capability that is off by
 * default and granted only from the server console:
 *
 *   php php-backend/grant_viewing.php --email=ops@goodlucks.co --correct=1
 *   php php-backend/grant_viewing.php --email=ops@goodlucks.co --correct=0
 *   php php-backend/grant_viewing.php --list
 *
 * There is no HTTP endpoint that grants it, and every correction requires a
 * written reason that is stored in the viewing history and the audit log.
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

echo "Goodlucks Homes - viewing-correction capability\n";
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
        'SELECT email, name, can_correct_viewings FROM users WHERE role = :role ORDER BY email ASC',
        [':role' => 'admin']
    );
    echo str_repeat('-', 78) . "\n";
    printf("%-44s %-8s\n", 'email', 'correct');
    foreach ($admins as $admin) {
        printf(
            "%-44s %-8s\n",
            (string)$admin['email'],
            (int)$admin['can_correct_viewings'] === 1 ? 'yes' : 'no'
        );
    }
    exit(0);
}

$email = strtolower(trim((string)cli_flag('email')));
if ($email === '') {
    fwrite(STDERR, "Usage: php php-backend/grant_viewing.php --email=<admin email> [--correct=1|0]\n");
    fwrite(STDERR, "       php php-backend/grant_viewing.php --list\n");
    exit(2);
}

$correct = cli_bool(cli_flag('correct'));
if ($correct === null) {
    fwrite(STDERR, "Nothing to change: pass --correct=1 or --correct=0.\n");
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

$current = (int)($user['can_correct_viewings'] ?? 0) === 1;
set_viewing_correction_capability((string)$user['id'], $correct);

audit_log('viewing.capability_changed', 'user', (string)$user['id'], [
    'email'      => $email,
    'correct'    => ['from' => $current, 'to' => $correct],
    'changedVia' => 'cli',
], ['id' => 'system', 'role' => 'system', 'name' => 'server-console']);

echo str_repeat('-', 78) . "\n";
echo "Account : {$email}\n";
echo 'Correct : ' . ($correct ? 'granted' : 'revoked') . "\n";
echo "Recorded in the audit log.\n";
