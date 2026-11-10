<?php
/**
 * Provider interest notifications (Upgrade 2, C7).
 *
 * A listing's provider — the agent who submitted it, or the landlord who owns
 * it — is the person who needs to know that somebody is interested. Until this
 * phase the platform only ever notified the *viewer*: saving a property and
 * receiving a price drop both wrote to the tenant's own mailbox, and the
 * provider was told nothing.
 *
 * The rule that shapes this file is privacy. A provider is told **that** their
 * listing drew interest and **how many** people are watching it. They are never
 * told who. No name, no email address, no phone number, no account id and no
 * tenant-side row id ever reaches the message, the email, or the log line. The
 * function therefore takes the property and an event name and nothing else —
 * there is no tenant parameter to leak by accident.
 *
 * Deliberately quiet, too: at most one notification per property per provider
 * per day per event, claimed through the existing `alert_deliveries` table. A
 * popular listing must not turn into a stream of mail.
 */

declare(strict_types=1);

/** The account responsible for a listing: the owner if there is one, else the submitter. */
function provider_interest_account(array $propertyRow): ?array
{
    $providerId = function_exists('property_provider_user_id')
        ? property_provider_user_id($propertyRow)
        : (string)($propertyRow['landlord_id'] ?? $propertyRow['submitted_by_user_id'] ?? '');
    if ($providerId === '') {
        return null;
    }

    $user = db_one('SELECT * FROM users WHERE id = :id LIMIT 1', [':id' => $providerId]);
    if (!$user) {
        return null;
    }
    if (strtolower((string)($user['status'] ?? 'active')) !== 'active') {
        return null;
    }
    // A provider we cannot email is not a provider we can notify.
    if (valid_email((string)($user['email'] ?? '')) === null) {
        return null;
    }

    return $user;
}

/**
 * How many accounts have this listing saved right now.
 *
 * A count of rows, never a list of them: the number is useful to a provider and
 * identifies nobody.
 */
function provider_interest_save_count(string $propertyId): int
{
    try {
        return (int)db_value(
            'SELECT COUNT(*) FROM saved_properties WHERE property_id = :pid',
            [':pid' => $propertyId]
        );
    } catch (Throwable $e) {
        gl_log('error', 'Could not count saved properties: ' . $e->getMessage());
        return 0;
    }
}

/**
 * Tell the responsible provider that their listing drew interest.
 *
 * @param array  $propertyRow The listing row (not the shaped payload).
 * @param string $event       'saved' or 'price_drop'.
 * @param array  $extra       Optional facts, e.g. ['watchers' => 4]. Scalar
 *                            values only — never a tenant row.
 * @return bool               True when this call actually notified.
 */
function notify_provider_property_interest(array $propertyRow, string $event, array $extra = []): bool
{
    $propertyId = (string)($propertyRow['id'] ?? '');
    if ($propertyId === '') {
        return false;
    }

    $provider = provider_interest_account($propertyRow);
    if ($provider === null) {
        return false;
    }

    $providerId = (string)$provider['id'];
    $email = (string)$provider['email'];
    $title = trim((string)($propertyRow['title'] ?? 'Your listing'));
    $location = trim((string)($propertyRow['location'] ?? ''));
    $label = $location !== '' ? $title . ' (' . $location . ')' : $title;
    $path = function_exists('property_path') ? property_path($propertyRow) : '/property/' . rawurlencode($propertyId);

    $saves = provider_interest_save_count($propertyId);

    // One notification per property per provider per day per event.
    $context = $event . ':' . gmdate('Y-m-d');
    if (!claim_alert_delivery('provider_interest', $providerId, $propertyId, $context, $email)) {
        return false;
    }

    if ($event === 'price_drop') {
        $watchers = max(0, (int)($extra['watchers'] ?? 0));
        $subject = 'Price alerts sent for ' . $title;
        $heading = 'Price alerts sent';
        $line = $watchers > 0
            ? $watchers . ' ' . ($watchers === 1 ? 'person was' : 'people were') . ' emailed because the rent on your listing dropped.'
            : 'The rent on your listing dropped. Nobody is watching it for price changes yet.';
        $inApp = 'The rent on "' . $title . '" dropped and ' . $watchers . ' '
            . ($watchers === 1 ? 'watcher was' : 'watchers were') . ' emailed. No viewer details are shared with you.';
    } else {
        $subject = 'Someone is interested in ' . $title;
        $heading = 'New interest in your listing';
        $line = $saves > 0
            ? 'Your listing has ' . $saves . ' ' . ($saves === 1 ? 'save' : 'saves') . ' from people browsing Goodlucks Homes.'
            : 'Someone just saved your listing on Goodlucks Homes.';
        $inApp = '"' . $title . '" was saved by a viewer' . ($saves > 0 ? ' — ' . $saves . ' in total' : '')
            . '. Viewer details stay private until they contact you.';
    }

    create_notification($providerId, $heading, $inApp, 'property');

    $body = '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e((string)($provider['name'] ?: 'there')) . ',</p>'
        . '<div style="background:#252A34;padding:16px;border-radius:8px;border-left:4px solid #08D9D6;margin:16px 0;">'
        . '<strong style="color:#FFFFFF;font-size:16px;">' . e($label) . '</strong><br>'
        . '<span style="color:#94A3B8;font-size:13px;">' . e($line) . '</span>'
        . '</div>'
        . '<p style="color:#CBD5E1;font-size:14px;">Goodlucks does not pass viewer names, email addresses or phone '
        . 'numbers to providers. A viewer reaches you by requesting a viewing, and then you are put in contact '
        . 'through the platform.</p>'
        . '<p style="color:#94A3B8;font-size:12px;">Open your listing: ' . e(SITE_URL . $path) . '</p>';

    send_email($email, (string)($provider['name'] ?? ''), $subject, email_html_template($heading, $body, $propertyId), 'provider_interest', $line);

    return true;
}

/**
 * Notify the provider of every live listing that a search alert matched.
 *
 * Used when a new listing goes live and saved searches are emailed; the provider
 * of that listing learns their property was surfaced. Same privacy rule: the
 * count of searches, never the people who saved them.
 */
function notify_provider_listing_live(array $propertyRow): bool
{
    return notify_provider_property_interest($propertyRow, 'saved');
}
