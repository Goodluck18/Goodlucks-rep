<?php
/**
 * Goodlucks Homes — grant or revoke financial-policy capabilities (CLI only)
 *
 * Creating a fee policy and approving one are different powers, so that one
 * administrator cannot draft a financial arrangement, approve it and switch it on
 * without anyone else seeing it. Both start OFF for every administrator and are
 * granted only from the server console:
 *
 *   php php-backend/grant_finance.php --email=manager@goodlucks.co  --manage=1
 *   php php-backend/grant_finance.php --email=approver@goodlucks.co --approve=1
 *   php php-backend/grant_finance.php --email=approver@goodlucks.co --approve=0
 *   php php-backend/grant_finance.php --email=clerk@goodlucks.co    --view=1
 *   php php-backend/grant_finance.php --email=cashier@goodlucks.co  --confirm=1
 *   php php-backend/grant_finance.php --list
 *
 * Increment G adds two more, equally separate powers:
 *
 *   --view     read the money ledger, remittances and commissions;
 *   --confirm  confirm that money actually arrived, allocate it, reject it,
 *              reverse it and run the rental-commission workflow.
 *
 * `--confirm` is the only way to turn a claimed remittance into recorded
 * revenue. It is deliberately not implied by `--view`, `--manage` or
 * `--approve`: an account that can price a policy cannot silently mark cash as
 * received.
 *
 * There is deliberately no HTTP endpoint that grants these: a stolen admin
 * session must not be able to widen its own financial authority.
 *
 * Note: even an account holding both capabilities cannot approve a policy it
 * created itself — `approve_fee_policy()` refuses that outright.
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

echo "Goodlucks Homes - fee-policy capabilities\n";
echo "Database driver: " . db_driver() . "\n";

try {
    db();
} catch (Throwable $e) {
    fwrite(STDERR, "Could not connect to the database.\n");
    fwrite(STDERR, '  ' . $e->getMessage() . "\n");
    exit(1);
}

if (cli_flag('list') !== null) {
    $admins = db_all(
        'SELECT email, name, can_manage_fee_policies, can_approve_fee_policies,
                can_view_finance, can_confirm_remittances
           FROM users WHERE role = :role ORDER BY email ASC',
        [':role' => 'admin']
    );
    echo str_repeat('-', 96) . "\n";
    printf("%-40s %-8s %-8s %-8s %-8s\n", 'email', 'manage', 'approve', 'view', 'confirm');
    foreach ($admins as $admin) {
        printf(
            "%-40s %-8s %-8s %-8s %-8s\n",
            (string)$admin['email'],
            (int)$admin['can_manage_fee_policies'] === 1 ? 'yes' : 'no',
            (int)$admin['can_approve_fee_policies'] === 1 ? 'yes' : 'no',
            (int)($admin['can_view_finance'] ?? 0) === 1 ? 'yes' : 'no',
            (int)($admin['can_confirm_remittances'] ?? 0) === 1 ? 'yes' : 'no'
        );
    }
    exit(0);
}

$email = strtolower(trim((string)cli_flag('email')));
if ($email === '') {
    fwrite(STDERR, "Usage: php php-backend/grant_finance.php --email=<admin email> [--manage=1|0] [--approve=1|0] [--view=1|0] [--confirm=1|0]\n");
    fwrite(STDERR, "       php php-backend/grant_finance.php --list\n");
    exit(2);
}

$manage = cli_bool(cli_flag('manage'));
$approve = cli_bool(cli_flag('approve'));
$view = cli_bool(cli_flag('view'));
$confirm = cli_bool(cli_flag('confirm'));
if ($manage === null && $approve === null && $view === null && $confirm === null) {
    fwrite(STDERR, "Nothing to change: pass --manage, --approve, --view and/or --confirm with 1|0.\n");
    exit(2);
}

$user = find_user_by_email($email);
if (!$user) {
    fwrite(STDERR, "No account with that email.\n");
    exit(3);
}
if ((string)$user['role'] !== 'admin') {
    fwrite(STDERR, "That account is not an administrator. Only administrators can manage fee policies.\n");
    exit(3);
}

$currentManage = (int)($user['can_manage_fee_policies'] ?? 0) === 1;
$currentApprove = (int)($user['can_approve_fee_policies'] ?? 0) === 1;
$currentView = (int)($user['can_view_finance'] ?? 0) === 1;
$currentConfirm = (int)($user['can_confirm_remittances'] ?? 0) === 1;

$nextManage = $manage ?? $currentManage;
$nextApprove = $approve ?? $currentApprove;
$nextView = $view ?? $currentView;
$nextConfirm = $confirm ?? $currentConfirm;

set_finance_capabilities((string)$user['id'], $nextManage, $nextApprove);
set_finance_ledger_capabilities((string)$user['id'], $nextView, $nextConfirm);

audit_log('finance.capability_changed', 'user', (string)$user['id'], [
    'email'      => $email,
    'manage'     => ['from' => $currentManage, 'to' => $nextManage],
    'approve'    => ['from' => $currentApprove, 'to' => $nextApprove],
    'view'       => ['from' => $currentView, 'to' => $nextView],
    'confirm'    => ['from' => $currentConfirm, 'to' => $nextConfirm],
    'changedVia' => 'cli',
], ['id' => 'system', 'role' => 'system', 'name' => 'server-console']);

echo str_repeat('-', 78) . "\n";
echo "Account : {$email}\n";
echo "Manage  : " . ($nextManage ? 'granted' : 'revoked') . "\n";
echo "Approve : " . ($nextApprove ? 'granted' : 'revoked') . "\n";
echo "View    : " . ($nextView ? 'granted' : 'revoked') . "\n";
echo "Confirm : " . ($nextConfirm ? 'granted' : 'revoked') . "\n";
echo "Recorded in the audit log.\n";
