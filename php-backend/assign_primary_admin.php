<?php
/**
 * Goodlucks Homes — assign (or clear) the PRIMARY platform administrator
 *
 *   php php-backend/assign_primary_admin.php --email=goodlucksonly@gmail.com --confirm=1
 *   php php-backend/assign_primary_admin.php --email=goodlucksonly@gmail.com --confirm=0
 *   php php-backend/assign_primary_admin.php --list
 *
 * What the flag means
 * -------------------
 * `users.is_primary_admin = 1` marks THE account that holds the platform's own
 * administrative authority: fee policies and agent tiers, verification and
 * identity-document review, viewing corrections, the money ledger, and the
 * approvals that follow. It is the union of the staff capabilities, so those
 * capabilities do not have to be granted one by one.
 *
 * It is also the only account allowed to approve a fee policy it created
 * itself. That is a deliberate separation-of-duties exception: the platform's
 * fee terms are that account's decision to make. `approve_fee_policy()` grants
 * the exception to this flag and to nothing else, so an ordinary administrator
 * still gets "A policy must be approved by a different administrator…".
 *
 * Why it is CLI-only
 * ------------------
 * Every other capability in this codebase is granted from the console
 * (`grant_reviewer.php`, `grant_finance.php`, `grant_viewing.php`), and there is
 * deliberately no HTTP route that grants any of them. A stolen administrator
 * session must not be able to widen its own authority, and it must certainly not
 * be able to promote itself to primary administrator. This script therefore
 * requires shell access to the server.
 *
 * Safety
 * ------
 * - The target must be an existing account with `role = 'admin'`; the script
 *   never creates or promotes an account.
 * - `--confirm=1` is required to write anything: without it the script prints
 *   what it would do and exits, so a mistyped command changes nothing.
 * - Assigning a second account clears the flag on the previous holder, so there
 *   is never more than one primary administrator.
 * - `--confirm=0` clears the flag and leaves every stored capability untouched,
 *   so the account keeps exactly the capabilities it was explicitly granted.
 * - Every change is written to `audit_logs` with the operator's OS user.
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

echo "Goodlucks Homes - primary platform administrator\n";
echo "Database driver: " . db_driver() . "\n";

try {
    db();
} catch (Throwable $e) {
    fwrite(STDERR, "Could not connect to the database.\n");
    fwrite(STDERR, '  ' . $e->getMessage() . "\n");
    exit(1);
}

/** Column may not exist on an installation that has not run migrate.php yet. */
function primary_admin_column_exists(): bool
{
    try {
        db_value('SELECT COUNT(*) FROM users WHERE is_primary_admin = 1');
        return true;
    } catch (Throwable $e) {
        return false;
    }
}

if (!primary_admin_column_exists()) {
    fwrite(STDERR, "The `users.is_primary_admin` column is missing.\n");
    fwrite(STDERR, "Run the additive migration first:\n");
    fwrite(STDERR, "  php php-backend/migrate.php          (dry run)\n");
    fwrite(STDERR, "  php php-backend/migrate.php --apply  (writes it)\n");
    exit(1);
}

if (cli_flag('list') !== null) {
    $admins = db_all(
        'SELECT email, name, is_primary_admin, can_manage_fee_policies, can_approve_fee_policies,
                can_review_verifications, can_access_identity_documents, can_correct_viewings,
                can_view_finance, can_confirm_remittances
           FROM users WHERE role = :role ORDER BY is_primary_admin DESC, email ASC',
        [':role' => 'admin']
    );
    echo str_repeat('-', 104) . "\n";
    printf(
        "%-38s %-9s %-7s %-8s %-8s %-8s\n",
        'email',
        'PRIMARY',
        'manage',
        'approve',
        'review',
        'finance'
    );
    foreach ($admins as $admin) {
        printf(
            "%-38s %-9s %-7s %-8s %-8s %-8s\n",
            (string)$admin['email'],
            (int)$admin['is_primary_admin'] === 1 ? 'YES' : '-',
            (int)$admin['can_manage_fee_policies'] === 1 ? 'yes' : 'no',
            (int)$admin['can_approve_fee_policies'] === 1 ? 'yes' : 'no',
            (int)$admin['can_review_verifications'] === 1 ? 'yes' : 'no',
            ((int)($admin['can_view_finance'] ?? 0) === 1
                || (int)($admin['can_confirm_remittances'] ?? 0) === 1) ? 'yes' : 'no'
        );
    }
    echo str_repeat('-', 104) . "\n";
    echo "The primary administrator also reads identity documents and corrects viewings.\n";
    exit(0);
}

$email = strtolower(trim((string)cli_flag('email')));
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Usage: php php-backend/assign_primary_admin.php --email=<admin email> --confirm=1|0\n");
    fwrite(STDERR, "       php php-backend/assign_primary_admin.php --list\n");
    exit(2);
}

$confirm = strtolower(trim((string)cli_flag('confirm')));
if (!in_array($confirm, ['1', '0'], true)) {
    fwrite(STDERR, "Pass --confirm=1 to assign or --confirm=0 to clear. Without it nothing is written.\n");
    exit(2);
}

$assign = $confirm === '1';

$target = db_one('SELECT * FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1', [':email' => $email]);
if (!$target) {
    fwrite(STDERR, "No account exists with that email address.\n");
    fwrite(STDERR, "This script never creates accounts; register the administrator first, then run it again.\n");
    exit(1);
}
if ((string)($target['role'] ?? '') !== 'admin') {
    fwrite(STDERR, "That account's role is '" . (string)$target['role'] . "', not 'admin'.\n");
    fwrite(STDERR, "This script never promotes a role. Use php-backend/admin_bootstrap.php for a new administrator.\n");
    exit(1);
}

$current = db_all('SELECT email FROM users WHERE is_primary_admin = 1 AND id <> :id', [':id' => (string)$target['id']]);

if (!$assign) {
    if ((int)($target['is_primary_admin'] ?? 0) !== 1) {
        echo "That account is not the primary administrator. Nothing to do.\n";
        exit(0);
    }
    db_exec(
        'UPDATE users SET is_primary_admin = 0, updated_at = :now WHERE id = :id',
        [':now' => db_now(), ':id' => (string)$target['id']]
    );
    audit_log('admin.primary_cleared', 'user', (string)$target['id'], [
        'email' => $email,
        'operator' => get_current_user() . '@' . gethostname(),
    ]);
    echo "Cleared: {$email} is no longer the primary administrator.\n";
    echo "Its stored capabilities are untouched.\n";
    exit(0);
}

echo str_repeat('-', 72) . "\n";
echo "Target : {$email}\n";
echo "Name   : " . (string)($target['name'] ?? '') . "\n";
if ($current) {
    echo "Replacing: " . implode(', ', array_map(static fn(array $row): string => (string)$row['email'], $current)) . "\n";
} else {
    echo "Replacing: (nobody held the flag)\n";
}
echo "Effect : union of every staff capability, and the only account allowed to\n";
echo "         approve a fee policy it created itself.\n";
echo str_repeat('-', 72) . "\n";

db_transaction(static function () use ($target, $email): void {
    // One primary administrator, always: clear anyone else first.
    db_exec('UPDATE users SET is_primary_admin = 0 WHERE is_primary_admin = 1 AND id <> :id', [':id' => (string)$target['id']]);
    db_exec(
        'UPDATE users SET is_primary_admin = 1, updated_at = :now WHERE id = :id AND role = :role',
        [':now' => db_now(), ':id' => (string)$target['id'], ':role' => 'admin']
    );
});

audit_log('admin.primary_assigned', 'user', (string)$target['id'], [
    'email' => $email,
    'previous_holders' => array_map(static fn(array $row): string => (string)$row['email'], $current),
    'operator' => get_current_user() . '@' . gethostname(),
]);

echo "Done: {$email} is the primary administrator.\n";
echo "Nothing was deployed and no other account was granted anything.\n";
