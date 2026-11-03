<?php
/**
 * Goodlucks Homes - grant or revoke verification-reviewer capabilities (CLI only)
 *
 * Reading identity documents is not an "all administrators" privilege. Each
 * administrator starts with no verification access, and the two capabilities are
 * granted only from the server console:
 *
 *   php php-backend/grant_reviewer.php --email=reviewer@goodlucks.co --reviewer=1 --documents=1
 *   php php-backend/grant_reviewer.php --email=reviewer@goodlucks.co --documents=0
 *   php php-backend/grant_reviewer.php --email=reviewer@goodlucks.co --reviewer=0
 *   php php-backend/grant_reviewer.php --list
 *
 * There is deliberately no HTTP endpoint that grants these: a stolen admin
 * session must not be able to widen its own access to identity documents.
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

echo "Goodlucks Homes - verification reviewer capabilities\n";
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
        'SELECT email, name, can_review_verifications, can_access_identity_documents
           FROM users WHERE role = :role ORDER BY email ASC',
        [':role' => 'admin']
    );
    echo str_repeat('-', 78) . "\n";
    printf("%-40s %-10s %-10s\n", 'email', 'reviewer', 'documents');
    foreach ($admins as $admin) {
        printf(
            "%-40s %-10s %-10s\n",
            (string)$admin['email'],
            (int)$admin['can_review_verifications'] === 1 ? 'yes' : 'no',
            (int)$admin['can_access_identity_documents'] === 1 ? 'yes' : 'no'
        );
    }
    exit(0);
}

$email = strtolower(trim((string)cli_flag('email')));
if ($email === '') {
    fwrite(STDERR, "Usage: php php-backend/grant_reviewer.php --email=<admin email> [--reviewer=1|0] [--documents=1|0]\n");
    fwrite(STDERR, "       php php-backend/grant_reviewer.php --list\n");
    exit(2);
}

$reviewer = cli_bool(cli_flag('reviewer'));
$documents = cli_bool(cli_flag('documents'));
if ($reviewer === null && $documents === null) {
    fwrite(STDERR, "Nothing to change: pass --reviewer=1|0 and/or --documents=1|0.\n");
    exit(2);
}
if ($documents === true && $reviewer === false) {
    fwrite(STDERR, "Document access requires the reviewer capability; refusing --reviewer=0 --documents=1.\n");
    exit(2);
}

$user = find_user_by_email($email);
if (!$user) {
    fwrite(STDERR, "No account with that email.\n");
    exit(3);
}
if ((string)$user['role'] !== 'admin') {
    fwrite(STDERR, "That account is not an administrator. Only administrators can review verification.\n");
    exit(3);
}

$currentReviewer = (int)($user['can_review_verifications'] ?? 0) === 1;
$currentDocuments = (int)($user['can_access_identity_documents'] ?? 0) === 1;

$nextReviewer = $reviewer ?? $currentReviewer;
if ($documents === true && !$nextReviewer) {
    // Document access is only meaningful for a reviewer; granting it to an
    // account that cannot open the queue would be a stored capability that can
    // never be used and is easy to misread as access.
    fwrite(STDERR, "Document access requires the reviewer capability; pass --reviewer=1 as well.\n");
    exit(3);
}
// Revoking the reviewer capability must also revoke document access.
$nextDocuments = ($documents ?? $currentDocuments) && $nextReviewer;

try {
    set_reviewer_capabilities((string)$user['id'], $nextReviewer, $nextDocuments);
} catch (InvalidArgumentException $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(3);
}

audit_log('reviewer.capability_changed', 'user', (string)$user['id'], [
    'email'         => $email,
    'reviewer'      => ['from' => $currentReviewer, 'to' => $nextReviewer],
    'documents'     => ['from' => $currentDocuments, 'to' => $nextDocuments],
    'changedVia'    => 'cli',
], ['id' => 'system', 'role' => 'system', 'name' => 'server-console']);

echo str_repeat('-', 78) . "\n";
echo "Account   : {$email}\n";
echo "Reviewer  : " . ($nextReviewer ? 'granted' : 'revoked') . "\n";
echo "Documents : " . ($nextDocuments ? 'granted' : 'revoked') . "\n";
echo "Recorded in the audit log.\n";
