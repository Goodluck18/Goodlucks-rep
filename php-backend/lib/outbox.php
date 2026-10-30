<?php
/**
 * Goodlucks Homes - email outbox
 *
 * Every transactional email is written to `email_outbox` inside the request
 * that caused it, then delivered *after* the response has been handed back to
 * the visitor:
 *
 *   1. `queue_email()` stores the message and (on SAPIs that support it) calls
 *      `fastcgi_finish_request()` in a shutdown hook, so the browser is released
 *      before any network call to Resend happens.
 *   2. A shutdown flush tries the due messages straight away, with a small time
 *      budget.
 *   3. `cron.php` (every 15 minutes) picks up anything still pending — including
 *      rows whose send failed — retrying with exponential backoff.
 *
 * This means a Resend stall can no longer slow down an enquiry submit, and a
 * Resend failure can no longer be silently dropped.
 */

declare(strict_types=1);

/** Total delivery attempts before a message is parked as failed. */
const EMAIL_OUTBOX_MAX_ATTEMPTS = 6;

/** Statuses a worker may pick up. */
const EMAIL_OUTBOX_OPEN_STATUSES = "'pending', 'sending'";

/**
 * Backoff ladder (seconds): 1m, 5m, 15m, 1h, 4h, 12h.
 *
 * Attempt 1 is the immediate try, so `$attempts` is the number already made.
 */
function email_outbox_backoff_seconds(int $attempts): int
{
    $ladder = [60, 300, 900, 3600, 14400, 43200];
    $index = max(0, min(count($ladder) - 1, $attempts - 1));

    return $ladder[$index];
}

/**
 * Store an email for delivery and return the outbox id.
 *
 * The `email_logs` row is written immediately with status `queued`, so the admin
 * console can show the message even before it leaves the server; the row is
 * updated to `delivered` / `failed` once a worker has tried it.
 */
function queue_email(
    string $to,
    string $recipientName,
    string $subject,
    string $html,
    string $type = 'notification',
    string $preview = ''
): ?string {
    $to = valid_email($to) ?? '';
    if ($to === '') {
        gl_log('warning', 'Skipped email with invalid recipient', ['type' => $type]);
        return null;
    }

    $subject = clean_string($subject, 200);
    $preview = $preview !== '' ? $preview : clean_string(strip_tags($html), 240);
    $logId = log_email($to, $recipientName, $subject, $type, $preview, 'queued');
    $id = new_id('outbox');

    try {
        db_exec(
            'INSERT INTO email_outbox
                (id, recipient_email, recipient_name, subject, body_html, type, body_preview,
                 status, attempts, next_attempt_at, email_log_id, created_at)
             VALUES
                (:id, :to, :name, :subject, :html, :type, :preview,
                 \'pending\', 0, :due, :log, :created)',
            [
                ':id'      => $id,
                ':to'      => $to,
                ':name'    => clean_string($recipientName !== '' ? $recipientName : 'Valued Customer', 255),
                ':subject' => $subject,
                ':html'    => $html,
                ':type'    => clean_string($type, 64),
                ':preview' => $preview,
                ':due'     => db_now(),
                ':log'     => $logId,
                ':created' => db_now(),
            ]
        );
    } catch (Throwable $e) {
        // Never break a customer action because the queue is unavailable: the
        // email log row still records what should have been sent.
        gl_log('error', 'Could not queue email: ' . $e->getMessage(), ['type' => $type]);
        return null;
    }

    schedule_email_flush();

    return $id;
}

/**
 * Register the after-response flush exactly once per request.
 *
 * `fastcgi_finish_request()` tells PHP-FPM to flush the response and close the
 * connection; everything after it runs with the browser already served. Under
 * SAPIs without it (the wasm dev server, CLI) the work simply happens in the
 * shutdown hook.
 */
function schedule_email_flush(): void
{
    static $scheduled = false;
    if ($scheduled) {
        return;
    }
    $scheduled = true;

    // CLI harnesses and cron drive delivery themselves; a shutdown flush would
    // make their results non-deterministic.
    if (defined('EMAIL_OUTBOX_NO_FLUSH') && EMAIL_OUTBOX_NO_FLUSH) {
        return;
    }

    register_shutdown_function(static function (): void {
        try {
            if (function_exists('fastcgi_finish_request')) {
                @fastcgi_finish_request();
            }
            if (function_exists('ignore_user_abort')) {
                @ignore_user_abort(true);
            }
            if (function_exists('set_time_limit')) {
                @set_time_limit(25);
            }
            process_email_outbox(10, 12.0);
        } catch (Throwable $e) {
            gl_log('error', 'Outbox flush failed: ' . $e->getMessage());
        }
    });
}

/**
 * Deliver due outbox messages.
 *
 * Safe to run concurrently: each row is claimed with a conditional UPDATE, so
 * two workers (a shutdown flush racing cron) cannot send the same message twice.
 *
 * @return array{checked: int, sent: int, retried: int, failed: int, skipped: int}
 */
function process_email_outbox(int $limit = 20, float $budgetSeconds = 20.0): array
{
    $result = ['checked' => 0, 'sent' => 0, 'retried' => 0, 'failed' => 0, 'skipped' => 0];
    $started = microtime(true);

    try {
        $rows = db_all(
            'SELECT * FROM email_outbox
             WHERE status IN (' . EMAIL_OUTBOX_OPEN_STATUSES . ') AND next_attempt_at <= :now
             ORDER BY created_at ASC' . db_limit_clause($limit, 0),
            [':now' => db_now()]
        );
    } catch (Throwable $e) {
        gl_log('error', 'Could not read the email outbox: ' . $e->getMessage());
        return $result;
    }

    foreach ($rows as $row) {
        if (microtime(true) - $started > $budgetSeconds) {
            break;
        }
        $result['checked']++;

        $id = (string)$row['id'];
        $attempts = (int)$row['attempts'] + 1;

        // Claim: only one worker can move this row out of the open statuses.
        $claimed = db_exec(
            'UPDATE email_outbox SET status = \'sending\', attempts = :attempts
             WHERE id = :id AND status IN (' . EMAIL_OUTBOX_OPEN_STATUSES . ')',
            [':attempts' => $attempts, ':id' => $id]
        );
        if ($claimed === 0) {
            $result['skipped']++;
            continue;
        }

        $error = null;
        $delivered = deliver_email_now(
            (string)$row['recipient_email'],
            (string)$row['recipient_name'],
            (string)$row['subject'],
            (string)$row['body_html'],
            (string)$row['type'],
            $error
        );

        if ($delivered) {
            db_exec(
                'UPDATE email_outbox SET status = \'sent\', sent_at = :now, last_error = NULL WHERE id = :id',
                [':now' => db_now(), ':id' => $id]
            );
            update_email_log_status((string)($row['email_log_id'] ?? ''), 'delivered');
            $result['sent']++;
            continue;
        }

        $message = clean_string($error ?? 'Delivery failed', 480);
        if ($attempts >= EMAIL_OUTBOX_MAX_ATTEMPTS) {
            db_exec(
                'UPDATE email_outbox SET status = \'failed\', last_error = :error WHERE id = :id',
                [':error' => $message, ':id' => $id]
            );
            update_email_log_status((string)($row['email_log_id'] ?? ''), 'failed');
            gl_log('warning', 'Email permanently failed after retries', [
                'outbox_id' => $id,
                'type'      => (string)$row['type'],
                'attempts'  => $attempts,
            ]);
            $result['failed']++;
            continue;
        }

        db_exec(
            'UPDATE email_outbox SET status = \'pending\', last_error = :error, next_attempt_at = :due WHERE id = :id',
            [
                ':error' => $message,
                ':due'   => db_future(email_outbox_backoff_seconds($attempts)),
                ':id'    => $id,
            ]
        );
        $result['retried']++;
    }

    return $result;
}

/** Keep the matching audit-log row in step with the outbox. */
function update_email_log_status(string $logId, string $status): void
{
    if ($logId === '') {
        return;
    }
    try {
        db_exec(
            'UPDATE email_logs SET status = :status, sent_at = :now WHERE id = :id',
            [':status' => $status, ':now' => db_now(), ':id' => $logId]
        );
    } catch (Throwable $e) {
        gl_log('error', 'Could not update email log status: ' . $e->getMessage());
    }
}

/**
 * Counts for the admin console: how much mail is waiting, stuck, or went out.
 *
 * @return array{pending: int, failed: int, sentToday: int, oldestPendingAt: ?string}
 */
function email_outbox_summary(): array
{
    try {
        return [
            'pending'         => (int)db_value(
                'SELECT COUNT(*) FROM email_outbox WHERE status IN (' . EMAIL_OUTBOX_OPEN_STATUSES . ')'
            ),
            'failed'          => (int)db_value("SELECT COUNT(*) FROM email_outbox WHERE status = 'failed'"),
            'sentToday'       => (int)db_value(
                "SELECT COUNT(*) FROM email_outbox WHERE status = 'sent' AND sent_at >= :since",
                [':since' => gmdate('Y-m-d 00:00:00')]
            ),
            'oldestPendingAt' => db_value(
                'SELECT MIN(created_at) FROM email_outbox WHERE status IN (' . EMAIL_OUTBOX_OPEN_STATUSES . ')'
            ) ?: null,
        ];
    } catch (Throwable $e) {
        // Table missing on an unmigrated install - the console still works.
        return ['pending' => 0, 'failed' => 0, 'sentToday' => 0, 'oldestPendingAt' => null];
    }
}

/** Drop delivered rows after a couple of weeks so the table stays small. */
function prune_email_outbox(int $sentRetentionDays = 14): int
{
    return db_exec(
        "DELETE FROM email_outbox WHERE status = 'sent' AND sent_at < :before",
        [':before' => gmdate('Y-m-d H:i:s', time() - $retentionDays * 86400)]
    );
}
