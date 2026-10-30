<?php
/**
 * Goodlucks Homes - Transactional email
 *
 * Delivery order:
 *   1. Resend HTTP API (when RESEND_API_KEY is configured) — reliable delivery
 *      from shared hosting, where outbound SMTP is often blocked.
 *   2. The cPanel mail agent (PHP mail()) as a fallback.
 *
 * Every send attempt is recorded in `email_logs` so the admin console can show
 * what was actually dispatched.
 *
 * Email failures never break a customer-facing action: the record is still
 * saved and the failure is logged. The API response reflects the database
 * result, and the email status is visible in the admin audit log.
 */

declare(strict_types=1);

function email_html_template(string $title, string $bodyHtml, string $reference = ''): string
{
    $safeTitle = e($title);
    $refHtml = $reference !== '' ? '<p style="font-size:11px;color:#64748B;margin:0 0 12px 0;">Reference: ' . e($reference) . '</p>' : '';
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' . $safeTitle . '</title></head>'
        . '<body style="font-family:Arial,Helvetica,sans-serif;background-color:#252A34;color:#EAEAEA;padding:20px;margin:0;">'
        . '<div style="max-width:600px;margin:0 auto;background-color:#1A1D24;border-radius:12px;padding:24px;border:1px solid #2E3542;">'
        . '<h2 style="color:#08D9D6;margin-top:0;">Goodlucks<span style="color:#FFFFFF;">Homes</span></h2>'
        . '<p style="font-size:12px;color:#94A3B8;margin:0 0 16px 0;">Accra, Ghana &bull; Trusted Rental Intermediary</p>'
        . '<hr style="border:0;border-top:1px solid #2E3542;margin:16px 0;">'
        . $refHtml
        . $bodyHtml
        . '<hr style="border:0;border-top:1px solid #2E3542;margin:20px 0;">'
        . '<p style="font-size:11px;color:#64748B;text-align:center;margin:0;">'
        . e(OFFICIAL_NAME) . ' &bull; ' . e(OFFICIAL_EMAIL) . ' &bull; ' . e(OFFICIAL_PHONE)
        . '<br>Goodlucks Tower, Ridge, Accra, Ghana</p>'
        . '</div></body></html>';
}

/**
 * Record an email in the audit log.
 */
function log_email(string $recipientEmail, string $recipientName, string $subject, string $type, string $preview, string $status): string
{
    $id = new_id('email');
    try {
        db_exec(
            'INSERT INTO email_logs (id, recipient_email, recipient_name, subject, type, body_preview, sent_at, status)
             VALUES (:id, :to, :name, :subject, :type, :preview, :sent, :status)',
            [
                ':id'      => $id,
                ':to'      => clean_string($recipientEmail, 255),
                ':name'    => clean_string($recipientName !== '' ? $recipientName : 'Valued Customer', 255),
                ':subject' => clean_string($subject, 255),
                ':type'    => clean_string($type, 64),
                ':preview' => clean_string($preview, 500),
                ':sent'    => db_now(),
                ':status'  => $status,
            ]
        );
    } catch (Throwable $e) {
        gl_log('error', 'Could not write email log: ' . $e->getMessage());
    }
    return $id;
}

/**
 * Send a transactional email and log the attempt.
 *
 * @return bool true when the local mail agent accepted the message
 */
function send_email(string $to, string $recipientName, string $subject, string $html, string $type = 'notification', string $preview = ''): bool
{
    $to = valid_email($to) ?? '';
    if ($to === '') {
        gl_log('warning', 'Skipped email with invalid recipient', ['type' => $type]);
        return false;
    }

    $subjectLine = clean_string($subject, 200);
    $preview = $preview !== '' ? $preview : clean_string(strip_tags($html), 240);

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . OFFICIAL_NAME . ' <' . OFFICIAL_EMAIL . '>',
        'Reply-To: ' . OFFICIAL_EMAIL,
        'X-Mailer: Goodlucks Homes',
    ];

    $accepted = false;

    if (trim((string)cfg('RESEND_API_KEY', '')) !== '') {
        $accepted = send_email_via_resend($to, $subjectLine, $html, $type);
    }

    if (!$accepted) {
        try {
            $accepted = @mail($to, $subjectLine, $html, implode("\r\n", $headers));
        } catch (Throwable $e) {
            gl_log('error', 'mail() threw: ' . $e->getMessage(), ['to' => $to, 'type' => $type]);
        }
    }

    if (!$accepted) {
        gl_log('warning', 'No mail transport accepted the message', ['to' => $to, 'type' => $type]);
    }

    log_email($to, $recipientName, $subjectLine, $type, $preview, $accepted ? 'delivered' : 'queued');
    return (bool)$accepted;
}

/**
 * Send through the Resend HTTP API. Returns true when Resend accepted the
 * message. Never throws — failures fall back to PHP mail().
 */
function send_email_via_resend(string $to, string $subject, string $html, string $type): bool
{
    $apiKey = trim((string)cfg('RESEND_API_KEY', ''));
    if ($apiKey === '' || !function_exists('curl_init')) {
        return false;
    }

    $from = trim((string)cfg('RESEND_FROM_EMAIL', ''));
    $fromAddress = $from !== '' ? $from : OFFICIAL_EMAIL;
    $payload = json_encode([
        'from' => OFFICIAL_NAME . ' <' . $fromAddress . '>',
        'to' => [$to],
        'subject' => $subject,
        'html' => $html,
    ]);

    $ch = curl_init('https://api.resend.com/emails');
    if ($ch === false) {
        return false;
    }
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ],
    ]);
    $response = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($status >= 200 && $status < 300) {
        return true;
    }

    gl_log('warning', 'Resend rejected the message', [
        'status' => $status,
        'error' => $error,
        'type' => $type,
        'response' => is_string($response) ? substr($response, 0, 300) : '',
    ]);
    return false;
}

/** Notify the Goodlucks team about a new enquiry / viewing / listing. */
function send_internal_notification(string $subject, string $htmlBody, array $context = []): void
{
    gl_log('info', 'Internal notification: ' . $subject, $context);
    send_email(
        OFFICIAL_EMAIL,
        'Goodlucks Operations',
        $subject,
        email_html_template($subject, $htmlBody),
        'internal_notification',
        $subject
    );
}
