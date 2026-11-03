<?php
/**
 * Goodlucks Homes - verification data retention job (CLI only)
 *
 * Dry run by default:
 *
 *   php php-backend/verification_retention.php            (report only)
 *   php php-backend/verification_retention.php --apply    (delete)
 *   php php-backend/verification_retention.php --apply --limit=100
 *
 * What it removes once an identity decision is final and older than
 * VERIFICATION_RETENTION_DAYS:
 *   - the uploaded identity files and their metadata rows (marked deleted);
 *   - the encrypted and masked document number;
 *   - the copy of the legal name held on the verification row.
 *
 * What it keeps: the decision status, the append-only decision history and the
 * audit rows, so the platform can still show that a check happened.
 *
 * The window is a conservative placeholder pending legal advice (Ghana Data
 * Protection Act, 2012 / Act 843) — see docs/INCREMENT_D_REPORT.md.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(403);
    echo json_encode(['error' => 'This script can only be run from the command line.']);
    exit;
}

require_once __DIR__ . '/config.php';

$apply = in_array('--apply', $argv ?? [], true);

$limit = 0;
foreach ($argv ?? [] as $arg) {
    if (str_starts_with($arg, '--limit=')) {
        $limit = max(0, (int)substr($arg, strlen('--limit=')));
    }
}

echo "Goodlucks Homes - verification retention\n";
echo "Driver : " . db_driver() . "\n";
echo "Mode   : " . ($apply ? "APPLY (data will be deleted)\n" : "DRY RUN (nothing deleted)\n");
echo "Window : " . verification_retention_days() . " days after a final decision\n";
if ($limit > 0) {
    echo "Limit  : {$limit} record(s)\n";
}
echo str_repeat('-', 64) . "\n";

try {
    db();
} catch (Throwable $e) {
    fwrite(STDERR, "Could not connect to the database: " . $e->getMessage() . "\n");
    exit(1);
}

$now = db_now();
$due = (int)db_value(
    'SELECT COUNT(*) FROM identity_verifications
      WHERE retention_purge_after IS NOT NULL AND retention_purge_after <= :now',
    [':now' => $now]
);

echo "Due for purge: {$due}\n";

if ($due === 0) {
    echo "Nothing to do.\n";
    exit(0);
}

$result = purge_expired_verification_data($apply, $limit);

echo "Scanned       : {$result['scanned']}\n";
echo ($apply ? 'Purged        : ' : 'Would purge   : ') . $result['purged'] . "\n";
echo ($apply ? 'Documents removed: ' : 'Documents that would be removed: ') . $result['documents'] . "\n";

if (!$apply) {
    echo "\nDry run complete. Re-run with --apply to delete.\n";
} else {
    echo "\nRetention run complete; audit rows written.\n";
}
