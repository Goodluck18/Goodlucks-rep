<?php
/**
 * Test helper: drive the email outbox from the command line.
 *
 * The API tests cover "a submit queues mail"; this harness covers the worker
 * itself (backoff, retries, the attempt cap) deterministically, without relying
 * on timing or on a real mail transport.
 *
 *   php tests/outbox.php --action=seed --count=2
 *   php tests/outbox.php --action=process
 *   php tests/outbox.php --action=force-due
 *   php tests/outbox.php --action=dump
 *   php tests/outbox.php --action=summary
 *   php tests/outbox.php --action=reset
 */

// Never let the shutdown flush interfere with an explicit --action=process.
define('EMAIL_OUTBOX_NO_FLUSH', true);

require_once __DIR__ . '/../php-backend/config.php';

$options = getopt('', ['action:', 'count::']);
$action = (string)($options['action'] ?? '');
$count = max(1, (int)($options['count'] ?? 1));

switch ($action) {
    case 'seed':
        $ids = [];
        for ($i = 0; $i < $count; $i++) {
            $ids[] = queue_email(
                'outbox-test-' . $i . '-' . bin2hex(random_bytes(4)) . '@example.com',
                'Outbox Test',
                'Outbox test ' . $i,
                '<p>Hello from the outbox test harness.</p>',
                'test'
            );
        }
        echo json_encode(['ids' => $ids]) . "\n";
        break;

    case 'process':
        echo json_encode(process_email_outbox(50, 30.0)) . "\n";
        break;

    case 'force-due':
        $updated = db_exec(
            'UPDATE email_outbox SET next_attempt_at = :past WHERE status IN (\'pending\', \'sending\')',
            [':past' => db_future(-60)]
        );
        echo json_encode(['updated' => $updated]) . "\n";
        break;

    case 'dump':
        $rows = db_all('SELECT id, status, attempts, next_attempt_at, last_error FROM email_outbox ORDER BY created_at ASC');
        echo json_encode($rows) . "\n";
        break;

    case 'summary':
        echo json_encode(email_outbox_summary()) . "\n";
        break;

    case 'reset':
        db_exec('DELETE FROM email_outbox');
        echo json_encode(['reset' => true]) . "\n";
        break;

    default:
        fwrite(STDERR, "Unknown --action. Use seed|process|force-due|dump|summary|reset\n");
        exit(2);
}
