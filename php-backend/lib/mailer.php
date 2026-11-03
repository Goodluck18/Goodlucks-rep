<?php
/**
 * Goodlucks Homes - Transactional email
 *
 * Delivery order:
 *   1. Resend HTTP API (when RESEND_API_KEY is configured) — reliable delivery
 *      from shared hosting, where outbound SMTP is often blocked.
 *   2. The cPanel mail agent (PHP mail()) as a fallback.
 *
 * Sends never happen inline: `send_email()` queues the message (see
 * lib/outbox.php) so a slow or failing transport cannot delay an enquiry,
 * viewing request or enquiry. The queue is drained after the response
 * and retried by cron.php with exponential backoff.
 *
 * Set EMAIL_TRANSPORT to `none` to disable delivery entirely (tests, staging):
 * messages still queue and log, but every attempt deliberately fails.
 */

declare(strict_types=1);

/**
 * Render a compact, light Goodlucks Homes email shell.
 *
 * Social profile URLs and the logo image are optional deployment settings.
 * When an image URL is unavailable, the accessible text wordmark is used.
 */
function email_social_icon(string $label, string $mark, string $url, string $background): string
{
    $icon = '<span style="display:inline-block;width:30px;height:30px;line-height:30px;'
        . 'border-radius:50%;background:' . e($background) . ';color:#FFFFFF;'
        . 'font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;'
        . 'text-align:center;">' . e($mark) . '</span>';

    if ($url === '') {
        return '<span aria-label="' . e($label) . '" title="' . e($label) . '" '
            . 'style="display:inline-block;margin:0 5px;">' . $icon . '</span>';
    }

    return '<a href="' . e($url) . '" aria-label="' . e($label) . '" title="' . e($label) . '" '
        . 'style="display:inline-block;margin:0 5px;text-decoration:none;">' . $icon . '</a>';
}

function email_html_template(string $title, string $bodyHtml, string $reference = ''): string
{
    $safeTitle = e($title);
    $refHtml = $reference !== ''
        ? '<p style="font-size:11px;line-height:1.35;color:#6B7280;margin:0 0 10px 0;">Reference: ' . e($reference) . '</p>'
        : '';

    // Existing messages were authored for the old dark template. Normalize
    // those inline colors here so every transactional email is readable on
    // the new light card without changing each message's business content.
    $bodyHtml = strtr($bodyHtml, [
        '#CBD5E1' => '#4B5563',
        '#94A3B8' => '#6B7280',
        '#E2E8F0' => '#374151',
        '#FFFFFF' => '#252A34',
        '#38BDF8' => '#08D9D6',
        '#F59E0B' => '#FF2E63',
        'background:#252A34' => 'background:#F7F7F7',
        'background-color:#252A34' => 'background-color:#F7F7F7',
    ]);

    $logoUrl = trim((string)cfg('EMAIL_LOGO_URL', ''));
    $logoHtml = $logoUrl !== ''
        ? '<img src="' . e($logoUrl) . '" alt="Goodlucks Homes" width="190" '
            . 'style="display:block;width:190px;max-width:100%;height:auto;border:0;margin:0 auto;">'
        : '<div style="font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:1.2;'
            . 'font-weight:bold;text-align:center;color:#252A34;">Goodlucks'
            . '<span style="color:#FF2E63;"> Homes</span></div>';

    $socialHtml = email_social_icon('Facebook', 'f', trim((string)cfg('SOCIAL_FACEBOOK_URL', '')), '#252A34')
        . email_social_icon('Instagram', '◎', trim((string)cfg('SOCIAL_INSTAGRAM_URL', '')), '#FF2E63')
        . email_social_icon('TikTok', '♪', trim((string)cfg('SOCIAL_TIKTOK_URL', '')), '#252A34')
        . email_social_icon('X', 'X', trim((string)cfg('SOCIAL_X_URL', '')), '#252A34')
        . email_social_icon('LinkedIn', 'in', trim((string)cfg('SOCIAL_LINKEDIN_URL', '')), '#252A34');

    $phone = trim((string)OFFICIAL_PHONE);
    $displayPhone = preg_match('/^\\+233(\\d{2})(\\d{3})(\\d{4})$/', $phone, $phoneParts)
        ? '+233 ' . $phoneParts[1] . ' ' . $phoneParts[2] . ' ' . $phoneParts[3]
        : $phone;

    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>' . $safeTitle . '</title></head>'
        . '<body style="font-family:Arial,Helvetica,sans-serif;background-color:#EAEAEA;color:#252A34;'
        . 'padding:18px 10px;margin:0;">'
        . '<div style="max-width:600px;margin:0 auto;background-color:#FFFFFF;border-radius:10px;'
        . 'padding:24px 22px;border:1px solid #E2E2E2;">'
        . '<div style="text-align:center;margin:0 0 8px 0;">' . $logoHtml . '</div>'
        . '<p style="font-size:11px;line-height:1.35;color:#6B7280;text-align:center;margin:0 0 16px 0;">'
        . 'PROPERTY RENTALS &amp; INTERMEDIARY SERVICES</p>'
        . '<hr style="border:0;border-top:1px solid #EAEAEA;margin:0 0 18px 0;">'
        . $refHtml
        . $bodyHtml
        . '<hr style="border:0;border-top:1px solid #EAEAEA;margin:20px 0 12px 0;">'
        . '<div style="text-align:center;font-family:Arial,Helvetica,sans-serif;">'
        . '<p style="font-size:11px;line-height:1.3;font-weight:bold;letter-spacing:.5px;color:#FF2E63;margin:0 0 3px 0;">GOODLUCKS HOMES</p>'
        . '<p style="font-size:11px;line-height:1.3;color:#6B7280;margin:0 0 8px 0;">Property rentals made easier.</p>'
        . '<div style="text-align:center;margin:0 0 8px 0;">' . $socialHtml . '</div>'
        . '<p style="font-size:11px;line-height:1.35;color:#4B5563;margin:0 0 3px 0;">'
        . '<a href="mailto:' . e(OFFICIAL_EMAIL) . '" style="color:#4B5563;text-decoration:none;">'
        . '<span style="color:#FF2E63;font-weight:bold;">&#9993;</span> ' . e(OFFICIAL_EMAIL) . '</a></p>'
        . '<p style="font-size:11px;line-height:1.35;color:#4B5563;margin:0 0 7px 0;">'
        . '<a href="tel:' . e($phone) . '" style="color:#4B5563;text-decoration:none;">'
        . '<span style="color:#FF2E63;font-weight:bold;">&#9742;</span> ' . e($displayPhone) . '</a></p>'
        . '<p style="font-size:10px;line-height:1.3;color:#8A8A8A;margin:0;">'
        . '&copy; ' . gmdate('Y') . ' Goodlucks Homes. All rights reserved.</p>'
        . '</div></div></body></html>';
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
    // Queueing always succeeds for a valid address: the actual network call
    // happens after the response is sent, and retries are cron's job.
    return queue_email($to, $recipientName, $subject, $html, $type, $preview) !== null;
}

/**
 * Make one delivery attempt with the configured transport(s).
 *
 * Called by the outbox worker only. Sets `$error` to a short, human-readable
 * reason when delivery fails, so the admin console can explain it.
 */
function deliver_email_now(
    string $to,
    string $recipientName,
    string $subject,
    string $html,
    string $type = 'notification',
    ?string &$error = null
): bool {
    $to = valid_email($to) ?? '';
    if ($to === '') {
        $error = 'Invalid recipient address';
        return false;
    }

    $transport = strtolower(trim((string)cfg('EMAIL_TRANSPORT', 'auto')));
    if ($transport === 'none') {
        $error = 'Email delivery disabled (EMAIL_TRANSPORT=none)';
        return false;
    }

    $subjectLine = clean_string($subject, 200);
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . OFFICIAL_NAME . ' <' . OFFICIAL_EMAIL . '>',
        'Reply-To: ' . OFFICIAL_EMAIL,
        'X-Mailer: Goodlucks Homes',
    ];

    $accepted = false;

    if ($transport !== 'mail' && trim((string)cfg('RESEND_API_KEY', '')) !== '') {
        $accepted = send_email_via_resend($to, $subjectLine, $html, $type);
        if (!$accepted) {
            $error = 'Resend did not accept the message';
        }
    }

    if (!$accepted && $transport !== 'resend') {
        try {
            $accepted = @mail($to, $subjectLine, $html, implode("\r\n", $headers));
        } catch (Throwable $e) {
            gl_log('error', 'mail() threw: ' . $e->getMessage(), ['to' => $to, 'type' => $type]);
            $error = 'Mail agent error: ' . $e->getMessage();
        }
        if (!$accepted) {
            $error = $error ?? 'The server mail agent did not accept the message';
        }
    }

    if (!$accepted) {
        gl_log('warning', 'No mail transport accepted the message', [
            'to'      => $to,
            'type'    => $type,
            'error'   => $error,
        ]);
        return false;
    }

    $error = null;
    return true;
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
