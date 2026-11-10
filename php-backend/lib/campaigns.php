<?php
/**
 * Goodlucks Homes - bulk email campaigns (Upgrade 2 Phase 3: A12).
 *
 * Deliberate design decisions
 * ---------------------------
 * 1. **One message per recipient.** A campaign never puts two addresses in one
 *    message: there is no `To:`/`Bcc:` list anywhere in this file. Each
 *    recipient gets their own `email_outbox` row, so no recipient can ever see
 *    another recipient's address and a failure is per recipient.
 * 2. **Queued, not sent in the request.** `campaign_queue()` only writes rows.
 *    Delivery stays with the existing outbox worker (`cron.php` and the
 *    post-response flush), with its existing retry/backoff ladder.
 * 3. **Marketing is opt-in.** A marketing campaign reaches only addresses whose
 *    `email_preferences.marketing_opt_in` is 1. A service notice (account,
 *    security, policy) may reach every matching account, and still carries the
 *    preferences link. Transactional mail is untouched by any of this.
 * 4. **Every campaign email carries a working preferences link** with a token
 *    that identifies the address, not the person, and that never appears in a
 *    `Referer`-visible query for another address.
 * 5. **Deduplicated by address**, case-insensitively, and one address appears at
 *    most once per campaign (unique index), even if two accounts share it.
 */

declare(strict_types=1);

/** Audiences the console offers. */
const CAMPAIGN_AUDIENCES = ['all', 'tenants', 'landlords', 'agents', 'admins', 'providers'];

/** A marketing mailing (opt-in only) or a service notice (all accounts). */
const CAMPAIGN_KINDS = ['marketing', 'service'];

/** Statuses a campaign itself can hold. */
const CAMPAIGN_STATUSES = ['draft', 'queued', 'sent', 'partly_failed'];

/** Hard ceiling per campaign, so one mistake cannot queue the world. */
const CAMPAIGN_MAX_RECIPIENTS = 5000;

/** May this account send bulk email? Primary administrator, or the capability. */
function can_send_bulk_email(?array $user = null): bool
{
    $user = $user ?? auth_user();
    if ($user === null || (string)($user['role'] ?? '') !== 'admin') {
        return false;
    }
    if (is_primary_admin($user)) {
        return true;
    }

    return (int)($user['can_send_bulk_email'] ?? 0) === 1;
}

/** CLI-only, like every other capability. */
function set_bulk_email_capability(string $userId, bool $allowed): void
{
    db_exec(
        'UPDATE users SET can_send_bulk_email = :allowed, updated_at = :now WHERE id = :id AND role = :role',
        [':allowed' => $allowed ? 1 : 0, ':now' => db_now(), ':id' => $userId, ':role' => 'admin']
    );
}

/** Human label for an audience key. */
function campaign_audience_label(string $audience): string
{
    return [
        'all'       => 'Everyone',
        'tenants'   => 'Tenants',
        'landlords' => 'Landlords',
        'agents'    => 'Agents',
        'admins'    => 'Administrators',
        'providers' => 'Agents and landlords',
    ][$audience] ?? $audience;
}

/**
 * Accounts in an audience, deduplicated by address.
 *
 * @return array<int, array{id: string, email: string, name: string, role: string}>
 */
function campaign_audience_rows(string $audience): array
{
    $roles = match ($audience) {
        'tenants'   => ['tenant'],
        'landlords' => ['landlord'],
        'agents'    => ['agent'],
        'admins'    => ['admin'],
        'providers' => ['landlord', 'agent'],
        default     => ['tenant', 'landlord', 'agent', 'admin'],
    };

    $placeholders = [];
    $params = [];
    foreach ($roles as $index => $role) {
        $placeholders[] = ':aud_role_' . $index;
        $params[':aud_role_' . $index] = $role;
    }

    $rows = db_all(
        'SELECT id, email, name, role FROM users
          WHERE role IN (' . implode(', ', $placeholders) . ')
          ORDER BY created_at ASC, id ASC',
        $params
    );

    $seen = [];
    $unique = [];
    foreach ($rows as $row) {
        $email = strtolower(trim((string)$row['email']));
        if ($email === '' || isset($seen[$email])) {
            continue;
        }
        $seen[$email] = true;
        $unique[] = [
            'id'    => (string)$row['id'],
            'email' => $email,
            'name'  => (string)$row['name'],
            'role'  => (string)$row['role'],
        ];
    }

    return $unique;
}

/** Preference rows for a set of addresses, keyed by lower-case address. */
function campaign_preference_map(array $emails): array
{
    if ($emails === []) {
        return [];
    }

    $placeholders = [];
    $params = [];
    foreach (array_values($emails) as $index => $email) {
        $placeholders[] = ':pref_email_' . $index;
        $params[':pref_email_' . $index] = strtolower((string)$email);
    }

    $map = [];
    foreach (db_all(
        'SELECT email, marketing_opt_in, unsubscribed_at FROM email_preferences
          WHERE LOWER(email) IN (' . implode(', ', $placeholders) . ')',
        $params
    ) as $row) {
        $map[strtolower((string)$row['email'])] = [
            'optIn'          => (int)$row['marketing_opt_in'] === 1,
            'unsubscribedAt' => $row['unsubscribed_at'] !== null ? to_iso($row['unsubscribed_at']) : null,
        ];
    }

    return $map;
}

/**
 * Who would receive this campaign, and who is excluded — before anything is
 * written. The console shows these figures next to the send button.
 *
 * @return array{audience: string, kind: string, total: int, recipients: array, excludedUnsubscribed: int, duplicatesRemoved: int}
 */
function campaign_preview(string $audience, string $kind): array
{
    $audience = in_array($audience, CAMPAIGN_AUDIENCES, true) ? $audience : 'all';
    $kind = in_array($kind, CAMPAIGN_KINDS, true) ? $kind : 'marketing';

    $rows = campaign_audience_rows($audience);
    $preferences = campaign_preference_map(array_column($rows, 'email'));

    $recipients = [];
    $excluded = 0;
    foreach ($rows as $row) {
        $optIn = $preferences[$row['email']]['optIn'] ?? false;
        if ($kind === 'marketing' && !$optIn) {
            $excluded++;
            continue;
        }
        $recipients[] = $row + ['optedIn' => $optIn];
    }

    return [
        'audience'            => $audience,
        'kind'                => $kind,
        'total'               => count($recipients),
        'recipients'          => array_slice($recipients, 0, 25),
        'excludedUnsubscribed' => $excluded,
        'duplicatesRemoved'   => max(0, count(campaign_audience_rows($audience)) - count($rows)),
    ];
}

/**
 * Validate a campaign draft. Throws InvalidArgumentException with field keys so
 * the console can put the message next to the field.
 *
 * @return array{subject: string, bodyHtml: string, audience: string, kind: string}
 */
function campaign_validate_input(array $input, bool $isCreate): array
{
    $fields = [];
    $clean = [];

    if ($isCreate || array_key_exists('subject', $input)) {
        $subject = clean_string($input['subject'] ?? '', 200);
        if ($subject === '') {
            $fields['subject'] = 'A subject line is required.';
        }
        $clean['subject'] = $subject;
    }

    if ($isCreate || array_key_exists('body', $input)) {
        $raw = (string)($input['body'] ?? '');
        if (trim(strip_tags($raw)) === '') {
            $fields['body'] = 'The message body cannot be empty.';
        }
        // Same allowlist as the email templates and the blog: an administrator's
        // message cannot smuggle a script, an iframe or an event handler.
        $clean['bodyHtml'] = blog_sanitize_html($raw, ['allow_media' => false]);
    }

    if ($isCreate || array_key_exists('audience', $input)) {
        $audience = (string)($input['audience'] ?? 'all');
        if (!in_array($audience, CAMPAIGN_AUDIENCES, true)) {
            $fields['audience'] = 'Choose one of: ' . implode(', ', CAMPAIGN_AUDIENCES) . '.';
        }
        $clean['audience'] = $audience;
    }

    if ($isCreate || array_key_exists('kind', $input)) {
        $kind = (string)($input['kind'] ?? 'marketing');
        if (!in_array($kind, CAMPAIGN_KINDS, true)) {
            $fields['kind'] = 'Choose marketing or service.';
        }
        $clean['kind'] = $kind;
    }

    if ($fields !== []) {
        throw new CampaignValidationException('The campaign could not be saved.', $fields);
    }

    return $clean;
}

/** A campaign problem that carries per-field messages. */
class CampaignValidationException extends InvalidArgumentException
{
    /** @var array<string, string> */
    public array $fields;

    public function __construct(string $message, array $fields = [])
    {
        parent::__construct($message);
        $this->fields = $fields;
    }
}

/** Create a draft. Nothing is sent until it is queued. */
function campaign_create(array $input, array $actor): array
{
    $clean = campaign_validate_input($input, true);
    $id = new_id('campaign');
    $now = db_now();

    db_exec(
        'INSERT INTO email_campaigns
            (id, subject, body_html, audience, kind, status, created_by, created_at, updated_at)
         VALUES
            (:id, :subject, :body, :audience, :kind, :status, :created_by, :now, :now)',
        [
            ':id'         => $id,
            ':subject'    => $clean['subject'],
            ':body'       => $clean['bodyHtml'],
            ':audience'   => $clean['audience'],
            ':kind'       => $clean['kind'],
            ':status'     => 'draft',
            ':created_by' => (string)($actor['id'] ?? ''),
            ':now'        => $now,
        ]
    );

    audit_log('campaign.created', 'campaign', $id, [
        'audience' => $clean['audience'],
        'kind'     => $clean['kind'],
        'subject'  => $clean['subject'],
    ], $actor);

    return campaign_shape(campaign_by_id($id) ?? []);
}

/** One campaign row, or null. */
function campaign_by_id(string $id): ?array
{
    return db_one('SELECT * FROM email_campaigns WHERE id = :id', [':id' => $id]);
}

/** Console shape for a campaign row. */
function campaign_shape(array $row): array
{
    if ($row === []) {
        return [];
    }

    return [
        'id'          => (string)$row['id'],
        'subject'     => (string)$row['subject'],
        'bodyHtml'    => (string)$row['body_html'],
        'audience'    => (string)$row['audience'],
        'audienceLabel' => campaign_audience_label((string)$row['audience']),
        'kind'        => (string)$row['kind'],
        'status'      => (string)$row['status'],
        'createdBy'   => (string)($row['created_by'] ?? ''),
        'createdAt'   => to_iso($row['created_at'] ?? null),
        'queuedAt'    => isset($row['queued_at']) ? to_iso($row['queued_at']) : null,
        'completedAt' => isset($row['completed_at']) && $row['completed_at'] !== null ? to_iso($row['completed_at']) : null,
        'recipientTotal' => (int)($row['recipient_total'] ?? 0),
        'skippedUnsubscribed' => (int)($row['skipped_unsubscribed'] ?? 0),
    ];
}

/** Recent campaigns, newest first. */
function campaign_list(int $limit = 20): array
{
    $rows = db_all('SELECT * FROM email_campaigns ORDER BY created_at DESC, id DESC' . db_limit_clause(max(1, min(100, $limit)), 0));

    return array_map('campaign_shape', $rows);
}

/**
 * Queue a draft: one outbox row and one recipient row per address.
 *
 * Returns the summary so the console can show exactly how many messages were
 * queued and how many addresses were skipped for having opted out.
 */
function campaign_queue(string $id, array $actor): array
{
    $campaign = campaign_by_id($id);
    if ($campaign === null) {
        throw new InvalidArgumentException('That campaign does not exist.');
    }
    if ((string)$campaign['status'] !== 'draft') {
        throw new CampaignConflictException('This campaign has already been queued.');
    }

    $audience = (string)$campaign['audience'];
    $kind = (string)$campaign['kind'];
    $preview = campaign_preview($audience, $kind);
    $recipients = campaign_audience_rows($audience);
    $preferences = campaign_preference_map(array_column($recipients, 'email'));

    $queued = [];
    $skipped = 0;
    foreach ($recipients as $row) {
        $optedIn = $preferences[$row['email']]['optIn'] ?? false;
        if ($kind === 'marketing' && !$optedIn) {
            $skipped++;
            continue;
        }
        $queued[] = $row;
        if (count($queued) >= CAMPAIGN_MAX_RECIPIENTS) {
            break;
        }
    }

    if ($queued === []) {
        throw new CampaignValidationException(
            'There is nobody to send to: no address in this audience has opted in to marketing email.',
            ['audience' => 'Choose another audience, or send a service notice instead.']
        );
    }

    $subject = (string)$campaign['subject'];
    $body = (string)$campaign['body_html'];
    $now = db_now();

    foreach ($queued as $row) {
        $token = email_preference_token($row['email']);
        $preferencesLink = campaign_preferences_url($token);
        $personal = str_replace('{{name}}', e($row['name'] !== '' ? $row['name'] : 'there'), $body);
        $footer = '<p style="font-size:11px;line-height:1.5;color:#6B7280;margin:18px 0 0 0;">'
            . 'You are receiving this because you have an account with Goodlucks Homes. '
            . '<a href="' . e($preferencesLink) . '" style="color:#FF2E63;">Manage your email preferences</a>.'
            . '</p>';

        $outboxId = queue_email(
            $row['email'],
            $row['name'],
            $subject,
            email_html_template($subject, $personal . $footer, ''),
            'campaign'
        );

        $recipientId = new_id('campaign_rcpt');
        db_exec(
            'INSERT INTO email_campaign_recipients
                (id, campaign_id, email, name, status, outbox_id, error, created_at)
             VALUES
                (:id, :campaign, :email, :name, :status, :outbox, :error, :created)',
            [
                ':id'       => $recipientId,
                ':campaign' => $id,
                ':email'    => $row['email'],
                ':name'     => $row['name'],
                ':status'   => $outboxId === null ? 'failed' : 'queued',
                ':outbox'   => $outboxId,
                ':error'    => $outboxId === null ? 'The address was not usable.' : null,
                ':created'  => $now,
            ]
        );
    }

    db_exec(
        'UPDATE email_campaigns
            SET status = :status, queued_at = :queued, updated_at = :updated,
                recipient_total = :total, skipped_unsubscribed = :skipped
          WHERE id = :id AND status = :draft',
        [
            ':status'  => 'queued',
            ':queued'  => $now,
            ':updated' => $now,
            ':total'   => count($queued),
            ':skipped' => $skipped,
            ':id'      => $id,
            ':draft'   => 'draft',
        ]
    );

    audit_log('campaign.queued', 'campaign', $id, [
        'audience' => $audience,
        'kind'     => $kind,
        'queued'   => count($queued),
        'skipped'  => $skipped,
    ], $actor);

    return campaign_summary($id) ?? [];
}

/** A campaign whose state no longer allows the requested action. */
class CampaignConflictException extends InvalidArgumentException
{
}

/**
 * Per-recipient delivery state, read from the outbox (the outbox is the truth:
 * a recipient row is only a pointer to it).
 */
function campaign_summary(string $id): ?array
{
    $campaign = campaign_by_id($id);
    if ($campaign === null) {
        return null;
    }

    $counts = ['queued' => 0, 'sent' => 0, 'failed' => 0, 'pending' => 0];
    $recipients = db_all(
        'SELECT r.id, r.email, r.name, r.status AS recipient_status, r.error, r.created_at,
                o.status AS outbox_status, o.attempts, o.last_error, o.sent_at
           FROM email_campaign_recipients r
           LEFT JOIN email_outbox o ON o.id = r.outbox_id
          WHERE r.campaign_id = :id
          ORDER BY r.created_at ASC, r.email ASC' . db_limit_clause(100, 0),
        [':id' => $id]
    );

    $shapedRecipients = [];
    foreach ($recipients as $row) {
        $state = (string)($row['outbox_status'] ?? '');
        if ($state === 'sent') {
            $counts['sent']++;
            $state = 'sent';
        } elseif ($state === 'failed') {
            $counts['failed']++;
            $state = 'failed';
        } elseif ($state === '') {
            $counts['failed']++;
            $state = 'failed';
        } else {
            $counts['pending']++;
            $state = 'pending';
        }

        $shapedRecipients[] = [
            'email'    => (string)$row['email'],
            'name'     => (string)$row['name'],
            'status'   => $state,
            'attempts' => (int)($row['attempts'] ?? 0),
            'error'    => (string)($row['last_error'] ?? $row['error'] ?? ''),
            'sentAt'   => isset($row['sent_at']) ? to_iso($row['sent_at']) : null,
        ];
    }

    // Delivery state computed from the outbox, so the console tells the truth
    // without a reconciliation job rewriting the stored campaign status.
    $total = (int)db_value('SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = :id', [':id' => $id]);
    $delivery = 'pending';
    if ($total > 0 && $counts['pending'] === 0) {
        if ($counts['failed'] === 0) {
            $delivery = 'delivered';
        } elseif ($counts['sent'] > 0) {
            $delivery = 'partly_failed';
        } else {
            $delivery = 'failed';
        }
    }

    return [
        'campaign'   => campaign_shape($campaign),
        'counts'     => $counts + ['total' => $total],
        'deliveryStatus' => $delivery,
        'recipients' => $shapedRecipients,
    ];
}

/**
 * Put failed messages back in the queue. Only failed rows are touched; a message
 * that was already delivered is never sent twice.
 */
function campaign_retry_failed(string $id, array $actor): array
{
    $campaign = campaign_by_id($id);
    if ($campaign === null) {
        throw new InvalidArgumentException('That campaign does not exist.');
    }

    $failed = db_all(
        "SELECT r.id AS recipient_id, o.id AS outbox_id
           FROM email_campaign_recipients r
           LEFT JOIN email_outbox o ON o.id = r.outbox_id
          WHERE r.campaign_id = :id AND (o.status = 'failed' OR o.id IS NULL)",
        [':id' => $id]
    );

    $retried = 0;
    foreach ($failed as $row) {
        if (!empty($row['outbox_id'])) {
            db_exec(
                "UPDATE email_outbox
                    SET status = 'pending', attempts = 0, next_attempt_at = :now, last_error = NULL
                  WHERE id = :id AND status = 'failed'",
                [':now' => db_now(), ':id' => (string)$row['outbox_id']]
            );
            $retried++;
        }
        db_exec(
            "UPDATE email_campaign_recipients SET status = 'queued', error = NULL WHERE id = :id",
            [':id' => (string)$row['recipient_id']]
        );
    }

    audit_log('campaign.retried', 'campaign', $id, ['retried' => $retried], $actor);

    return campaign_summary($id) ?? [];
}

// ---------------------------------------------------------------------------
// Preferences and unsubscribe
// ---------------------------------------------------------------------------

/** The token for an address, created on first use. */
function email_preference_token(string $email): string
{
    $email = strtolower(trim($email));
    $existing = db_one('SELECT unsubscribe_token FROM email_preferences WHERE email = :email', [':email' => $email]);
    if ($existing !== null) {
        return (string)$existing['unsubscribe_token'];
    }

    $token = bin2hex(random_bytes(24));
    $now = db_now();
    try {
        db_exec(
            'INSERT INTO email_preferences (email, user_id, marketing_opt_in, unsubscribe_token, created_at, updated_at)
             VALUES (:email, :user, 0, :token, :now, :now)',
            [
                ':email' => $email,
                ':user'  => (string)(db_value('SELECT id FROM users WHERE LOWER(email) = :email', [':email' => $email]) ?? ''),
                ':token' => $token,
                ':now'   => $now,
            ]
        );
    } catch (Throwable $e) {
        // A concurrent insert won the race; read the winner's token.
        $row = db_one('SELECT unsubscribe_token FROM email_preferences WHERE email = :email', [':email' => $email]);
        if ($row === null) {
            throw $e;
        }

        return (string)$row['unsubscribe_token'];
    }

    return $token;
}

/** Look a preference row up by its token. */
function email_preferences_by_token(string $token): ?array
{
    $row = db_one('SELECT * FROM email_preferences WHERE unsubscribe_token = :token', [':token' => $token]);
    if ($row === null) {
        return null;
    }

    return [
        'email'          => (string)$row['email'],
        'optIn'          => (int)$row['marketing_opt_in'] === 1,
        'unsubscribedAt' => $row['unsubscribed_at'] !== null ? to_iso($row['unsubscribed_at']) : null,
    ];
}

/** Record an opt-in or an opt-out from the preferences page. */
function email_preferences_update(string $token, bool $optIn): ?array
{
    $row = db_one('SELECT email FROM email_preferences WHERE unsubscribe_token = :token', [':token' => $token]);
    if ($row === null) {
        return null;
    }
    $now = db_now();
    db_exec(
        'UPDATE email_preferences
            SET marketing_opt_in = :opt, unsubscribed_at = :unsub, opted_in_at = :optin, updated_at = :now
          WHERE unsubscribe_token = :token',
        [
            ':opt'   => $optIn ? 1 : 0,
            ':unsub' => $optIn ? null : $now,
            ':optin' => $optIn ? $now : null,
            ':now'   => $now,
            ':token' => $token,
        ]
    );

    return email_preferences_by_token($token);
}

/** The public preferences URL for a token. */
function campaign_preferences_url(string $token): string
{
    return SITE_URL . '/email/preferences?token=' . rawurlencode($token);
}

/** An address with its middle hidden, for the public preferences page. */
function mask_email_address(string $email): string
{
    $parts = explode('@', $email, 2);
    if (count($parts) !== 2) {
        return '***';
    }
    $local = $parts[0];
    $visible = substr($local, 0, min(2, strlen($local)));

    return $visible . str_repeat('•', max(1, strlen($local) - strlen($visible))) . '@' . $parts[1];
}
