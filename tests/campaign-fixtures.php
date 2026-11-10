<?php
/**
 * Test helper: fixtures and inspection for the bulk-email suite (Upgrade 2 A12).
 *
 * The suite must prove things the HTTP API deliberately does not expose:
 * the exact body of each queued message (to prove no recipient can see another
 * address), and a delivery failure that the outbox worker would only reach after
 * its retry ladder.
 *
 *   php tests/campaign-fixtures.php --opt-in=a@example.com --opt-in=b@example.com
 *   php tests/campaign-fixtures.php --opt-out=a@example.com
 *   php tests/campaign-fixtures.php --fail-outbox=campaign-abc123
 *   php tests/campaign-fixtures.php --dump=campaign-abc123     (JSON to stdout)
 *
 * Nothing here changes application code paths: it writes the same rows the
 * application writes, and it reads rows the application already stores.
 */

declare(strict_types=1);

require_once __DIR__ . '/../php-backend/config.php';

function fixture_args(string $name): array
{
    global $argv;
    $values = [];
    foreach ($argv ?? [] as $arg) {
        if (str_starts_with($arg, '--' . $name . '=')) {
            $values[] = substr($arg, strlen($name) + 3);
        }
    }

    return $values;
}

$optIns = fixture_args('opt-in');
$optOuts = fixture_args('opt-out');
$failCampaigns = fixture_args('fail-outbox');
$dumps = fixture_args('dump');

if ($optIns === [] && $optOuts === [] && $failCampaigns === [] && $dumps === []) {
    fwrite(STDERR, "Usage: php tests/campaign-fixtures.php [--opt-in=<email>] [--opt-out=<email>] [--fail-outbox=<campaignId>] [--dump=<campaignId>]\n");
    exit(2);
}

foreach ($optIns as $email) {
    $token = email_preference_token($email);
    email_preferences_update($token, true);
    echo "opted in: {$email}\n";
}

foreach ($optOuts as $email) {
    $token = email_preference_token($email);
    email_preferences_update($token, false);
    echo "opted out: {$email}\n";
}

foreach ($failCampaigns as $campaignId) {
    // Simulate what the outbox worker does once its retry ladder is exhausted:
    // park one message as failed so the retry path can be exercised without
    // waiting six backoff intervals.
    $row = db_one(
        "SELECT o.id FROM email_campaign_recipients r
           JOIN email_outbox o ON o.id = r.outbox_id
          WHERE r.campaign_id = :id AND o.status IN ('pending', 'sending')
          ORDER BY r.email ASC" . db_limit_clause(1, 0),
        [':id' => $campaignId]
    );
    if ($row === null) {
        fwrite(STDERR, "No pending message to fail for {$campaignId}\n");
        exit(3);
    }
    db_exec(
        "UPDATE email_outbox
            SET status = 'failed', attempts = 6, last_error = 'Simulated permanent failure (test fixture)'
          WHERE id = :id",
        [':id' => (string)$row['id']]
    );
    db_exec("UPDATE email_campaign_recipients SET status = 'failed' WHERE outbox_id = :id", [':id' => (string)$row['id']]);
    echo "parked as failed: {$campaignId}\n";
}

foreach ($dumps as $campaignId) {
    $rows = db_all(
        'SELECT r.email AS recipient_email, r.status AS recipient_status, r.outbox_id,
                o.status AS outbox_status, o.attempts, o.subject, o.body_html, o.last_error
           FROM email_campaign_recipients r
           LEFT JOIN email_outbox o ON o.id = r.outbox_id
          WHERE r.campaign_id = :id
          ORDER BY r.email ASC',
        [':id' => $campaignId]
    );
    $preferences = db_all(
        'SELECT email, marketing_opt_in, unsubscribe_token FROM email_preferences ORDER BY email ASC'
    );

    echo json_encode([
        'recipients'  => $rows,
        'preferences' => $preferences,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
}
