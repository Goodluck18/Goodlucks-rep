<?php
/**
 * Goodlucks Homes - scheduled maintenance (CLI only)
 *
 * cPanel has no queue workers, so one cron entry runs everything that has to
 * happen outside a visitor's request:
 *
 *   1. Saved-search matching  - emails subscribers when a listing that matches
 *                               their search goes live. Idempotent: the
 *                               `alert_deliveries` unique key means a property
 *                               is never emailed to the same alert twice.
 *   2. Retention pruning      - trims page views, email logs, expired sessions
 *                               and stale rate-limit rows so the database does
 *                               not grow forever on shared hosting.
 *
 * Usage:
 *   php /home/cpuser/public_html/api/cron.php              # run everything
 *   php /home/cpuser/public_html/api/cron.php --dry-run    # report only
 *
 * Recommended cPanel cron (every 15 minutes):
 *   *\/15 * * * * /usr/local/bin/php /home/cpuser/public_html/api/cron.php >/dev/null 2>&1
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(403);
    echo json_encode(['error' => 'This script can only be run from the command line.']);
    exit;
}

require_once __DIR__ . '/config.php';

$dryRun = in_array('--dry-run', $argv ?? [], true);
$started = microtime(true);

echo "Goodlucks Homes - scheduled maintenance\n";
echo 'Driver : ' . db_driver() . "\n";
echo 'Mode   : ' . ($dryRun ? "DRY RUN\n" : "APPLY\n");
echo str_repeat('-', 64) . "\n";

try {
    db();
} catch (Throwable $e) {
    fwrite(STDERR, 'Database unavailable: ' . $e->getMessage() . "\n");
    exit(1);
}

// ---------------------------------------------------------------------------
// 1. Saved-search matching
// ---------------------------------------------------------------------------
try {
    if ($dryRun) {
        $active = (int)db_value("SELECT COUNT(*) FROM properties WHERE status = 'active'");
        echo "Search alerts: would match {$active} active listing(s) against saved searches\n";
    } else {
        $result = run_search_alert_digest();
        echo "Search alerts: {$result['properties']} active listing(s) checked, {$result['emails']} email(s) sent\n";
    }
} catch (Throwable $e) {
    fwrite(STDERR, 'Search alert run failed: ' . $e->getMessage() . "\n");
}

// ---------------------------------------------------------------------------
// 2. Retention pruning
// ---------------------------------------------------------------------------
$retention = [
    'page_views'  => ['column' => 'created_at', 'days' => (int)cfg('RETENTION_PAGE_VIEW_DAYS', 365)],
    'email_logs'  => ['column' => 'sent_at',    'days' => (int)cfg('RETENTION_EMAIL_LOG_DAYS', 180)],
];

foreach ($retention as $table => $rule) {
    $days = max(1, $rule['days']);
    $cutoff = gmdate('Y-m-d H:i:s', time() - $days * 86400);

    try {
        $count = (int)db_value(
            'SELECT COUNT(*) FROM ' . $table . ' WHERE ' . $rule['column'] . ' < :cutoff',
            [':cutoff' => $cutoff]
        );

        if ($dryRun) {
            echo "Retention: would delete {$count} {$table} row(s) older than {$days} days\n";
        } elseif ($count > 0) {
            db_exec(
                'DELETE FROM ' . $table . ' WHERE ' . $rule['column'] . ' < :cutoff',
                [':cutoff' => $cutoff]
            );
            echo "Retention: deleted {$count} {$table} row(s) older than {$days} days\n";
        } else {
            echo "Retention: {$table} is within the {$days}-day window\n";
        }
    } catch (Throwable $e) {
        fwrite(STDERR, "Retention on {$table} failed: " . $e->getMessage() . "\n");
    }
}

try {
    $expiredSessions = (int)db_value('SELECT COUNT(*) FROM auth_sessions WHERE expires_at < :now', [':now' => db_now()]);
    if (!$dryRun && $expiredSessions > 0) {
        db_exec('DELETE FROM auth_sessions WHERE expires_at < :now', [':now' => db_now()]);
    }
    echo ($dryRun ? "Sessions: {$expiredSessions} expired session(s) pending" : "Sessions: {$expiredSessions} expired session(s) removed") . "\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Session pruning failed: ' . $e->getMessage() . "\n");
}

// Stale rate-limit windows are harmless but pointless to keep.
try {
    $stale = (int)db_value('SELECT COUNT(*) FROM rate_limits WHERE window_start < :cutoff', [':cutoff' => time() - 86400]);
    if (!$dryRun && $stale > 0) {
        db_exec('DELETE FROM rate_limits WHERE window_start < :cutoff', [':cutoff' => time() - 86400]);
    }
    echo ($dryRun ? "Rate limits: {$stale} stale bucket(s)" : "Rate limits: {$stale} stale bucket(s) removed") . "\n";
} catch (Throwable $e) {
    fwrite(STDERR, 'Rate limit pruning failed: ' . $e->getMessage() . "\n");
}

echo str_repeat('-', 64) . "\n";
printf("Finished in %.0f ms\n", (microtime(true) - $started) * 1000);
