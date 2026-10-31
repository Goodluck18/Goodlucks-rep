<?php
/**
 * Goodlucks Homes - Alert delivery engine
 *
 * Two features used to be write-only: a visitor could subscribe to a price drop
 * or a saved search, the row was stored, and nothing ever emailed them. This
 * module turns those rows into real, delivered messages.
 *
 * Delivery rules
 * - "Price drop" alerts email when a listing's rent is reduced through the API
 *   (admin or landlord edit). Each alert is emailed at most once per new rent
 *   value, so refreshing or re-saving the same price never duplicates a send.
 * - "Search alert" emails are sent when a listing matches the subscriber's
 *   location / type / bedrooms / budget. Each alert is emailed at most once per
 *   property, ever.
 * - Every send is recorded in `alert_deliveries` (unique key) so cron catch-up
 *   runs, retries and concurrent requests are all idempotent.
 * - Delivery failures never break the underlying business action: the write has
 *   already happened, and the failure lands in the email audit log.
 */

declare(strict_types=1);

/**
 * Has this exact alert/property/context combination already been emailed?
 * Returns false when the row could be inserted (i.e. we own this delivery).
 */
function claim_alert_delivery(string $type, string $alertId, string $propertyId, string $context, string $email): bool
{
    $id = new_id('adl');
    try {
        db_exec(
            'INSERT INTO alert_deliveries (id, alert_type, alert_id, property_id, context, email, sent_at)
             VALUES (:id, :type, :alert, :property, :context, :email, :sent)',
            [
                ':id'       => $id,
                ':type'     => $type,
                ':alert'    => $alertId,
                ':property' => $propertyId,
                ':context'  => $context,
                ':email'    => clean_string($email, 255),
                ':sent'     => db_now(),
            ]
        );
        return true;
    } catch (Throwable $e) {
        // Unique key violation = somebody already claimed it. Anything else is a
        // real failure; log it so the cron output does not lie about delivery.
        if (stripos($e->getMessage(), 'unique') === false && stripos($e->getMessage(), 'duplicate') === false) {
            gl_log('error', 'Could not record alert delivery: ' . $e->getMessage());
        }
        return false;
    }
}

/** Money formatting used in every alert email. */
function alert_money(float $amount): string
{
    return 'GH₵ ' . number_format($amount, 2);
}

/**
 * Email everyone watching this property for a price drop.
 *
 * @return int number of subscribers actually emailed
 */
function dispatch_price_drop_alerts(array $propertyRow, float $oldRent, float $newRent): int
{
    if ($newRent >= $oldRent) {
        return 0;
    }

    $propertyId = (string)($propertyRow['id'] ?? '');
    if ($propertyId === '') {
        return 0;
    }

    $alerts = db_all(
        'SELECT * FROM price_drop_alerts WHERE property_id = :pid AND active = 1',
        [':pid' => $propertyId]
    );

    $sent = 0;
    $title = (string)($propertyRow['title'] ?? ($alerts[0]['property_title'] ?? 'Your saved property'));
    $location = (string)($propertyRow['location'] ?? ($alerts[0]['property_location'] ?? ''));

    foreach ($alerts as $alert) {
        $target = $alert['target_rent_ghs'] !== null ? (float)$alert['target_rent_ghs'] : null;
        $notifyOnAnyDrop = (int)($alert['notify_on_any_drop'] ?? 1) === 1;

        // Respect the subscriber's threshold: "any drop" or "below my target".
        if (!$notifyOnAnyDrop && $target !== null && $newRent > $target) {
            continue;
        }

        $email = (string)$alert['email'];
        if (valid_email($email) === null) {
            continue;
        }

        // One email per alert per new price (repeat drops notify again).
        if (!claim_alert_delivery('price_drop', (string)$alert['id'], $propertyId, number_format($newRent, 2, '.', ''), $email)) {
            continue;
        }

        $body = '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e((string)($alert['name'] ?: 'there')) . ',</p>'
            . '<p style="color:#CBD5E1;font-size:14px;">The rent on a property you are watching has just dropped.</p>'
            . '<div style="background:#252A34;padding:16px;border-radius:8px;border-left:4px solid #08D9D6;margin:16px 0;">'
            . '<strong style="color:#FFFFFF;font-size:16px;">' . e($title) . '</strong><br>'
            . '<span style="color:#94A3B8;font-size:13px;">' . e($location) . '</span><br>'
            . '<span style="color:#94A3B8;font-size:13px;text-decoration:line-through;">Was ' . e(alert_money($oldRent)) . '/month</span><br>'
            . '<span style="color:#08D9D6;font-size:18px;font-weight:bold;">Now ' . e(alert_money($newRent)) . '/month</span>'
            . ($target !== null ? '<br><span style="color:#38BDF8;font-size:13px;">Your target: below ' . e(alert_money($target)) . '</span>' : '')
            . '</div>'
            . '<p style="color:#CBD5E1;font-size:14px;">Viewings are arranged and supervised by a Goodlucks agent. '
            . 'The GH₵ ' . number_format(VIEWING_FEE_GHS, 0) . ' viewing fee is paid in cash on site, never online.</p>'
            . '<p style="color:#94A3B8;font-size:12px;">Open the listing: ' . e(SITE_URL) . '/?property=' . e($propertyId) . '</p>';

        send_email(
            $email,
            (string)($alert['name'] ?? ''),
            'Price drop: ' . $title . ' is now ' . alert_money($newRent) . '/month',
            email_html_template('Price drop alert', $body, $propertyId),
            'price_drop_alert',
            $title . ' dropped to ' . alert_money($newRent)
        );

        $sent++;
    }

    return $sent;
}

/**
 * Email subscribers whose saved search matches this listing.
 *
 * @return int number of subscribers actually emailed
 */
function dispatch_search_alert_matches(array $propertyRow): int
{
    $propertyId = (string)($propertyRow['id'] ?? '');
    if ($propertyId === '' || ($propertyRow['status'] ?? '') !== 'active') {
        return 0;
    }

    $alerts = db_all('SELECT * FROM search_alerts WHERE active = 1' . db_limit_clause(500, 0));
    if (!$alerts) {
        return 0;
    }

    $location = strtolower((string)($propertyRow['location'] ?? ''));
    $city = strtolower((string)($propertyRow['city'] ?? ''));
    $type = strtolower((string)($propertyRow['property_type'] ?? ''));
    $bedrooms = (int)($propertyRow['bedrooms'] ?? 0);
    $rent = (float)($propertyRow['rent_ghs'] ?? 0);

    $sent = 0;
    foreach ($alerts as $alert) {
        $wantedLocation = strtolower(trim((string)($alert['location'] ?? 'All')));
        if ($wantedLocation !== '' && $wantedLocation !== 'all'
            && !str_contains($location, $wantedLocation) && !str_contains($city, $wantedLocation)) {
            continue;
        }

        $wantedType = strtolower(trim((string)($alert['property_type'] ?? 'All')));
        if ($wantedType !== '' && $wantedType !== 'all' && $wantedType !== $type) {
            continue;
        }

        $wantedBedrooms = $alert['bedrooms'] !== null ? (int)$alert['bedrooms'] : 0;
        if ($wantedBedrooms > 0 && $bedrooms < $wantedBedrooms) {
            continue;
        }

        $maxRent = (float)($alert['max_rent_ghs'] ?? 0);
        if ($maxRent > 0 && $rent > $maxRent) {
            continue;
        }

        $email = (string)$alert['email'];
        if (valid_email($email) === null) {
            continue;
        }

        if (!claim_alert_delivery('search', (string)$alert['id'], $propertyId, '', $email)) {
            continue;
        }

        $cityLine = trim((string)($propertyRow['city'] ?? '')) !== '' ? ', ' . (string)$propertyRow['city'] : '';
        $body = '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e((string)($alert['name'] ?: 'there')) . ',</p>'
            . '<p style="color:#CBD5E1;font-size:14px;">A listing matching your saved search just went live.</p>'
            . '<div style="background:#252A34;padding:16px;border-radius:8px;border-left:4px solid #08D9D6;margin:16px 0;">'
            . '<strong style="color:#FFFFFF;font-size:16px;">' . e((string)($propertyRow['title'] ?? '')) . '</strong><br>'
            . '<span style="color:#94A3B8;font-size:13px;">' . e((string)($propertyRow['location'] ?? '')) . e($cityLine) . '</span><br>'
            . '<span style="color:#08D9D6;font-size:16px;font-weight:bold;">' . e(alert_money($rent)) . '/month</span><br>'
            . '<span style="color:#94A3B8;font-size:13px;">' . $bedrooms . ' bedrooms &bull; ' . (int)($propertyRow['bathrooms'] ?? 0) . ' bathrooms</span>'
            . '</div>'
            . '<p style="color:#CBD5E1;font-size:14px;">Reply to this email or call +233 23 769 0080 and a Goodlucks agent will arrange the viewing.</p>'
            . '<p style="color:#94A3B8;font-size:12px;">View it: ' . e(SITE_URL) . '/?property=' . e($propertyId) . '</p>';

        send_email(
            $email,
            (string)($alert['name'] ?? ''),
            'New match for your search: ' . (string)($propertyRow['title'] ?? ''),
            email_html_template('New property match', $body, $propertyId),
            'search_alert',
            'Matched ' . (string)($propertyRow['title'] ?? '')
        );

        $sent++;
    }

    return $sent;
}

/**
 * Catch-up pass used by the cron job: match every currently active listing
 * against every saved search. Idempotent thanks to `alert_deliveries`, so it is
 * safe to run as often as cron allows.
 *
 * @return array{properties:int,emails:int}
 */
function run_search_alert_digest(): array
{
    $properties = db_all(
        "SELECT * FROM properties WHERE status = 'active' ORDER BY created_at DESC" . db_limit_clause(200, 0)
    );

    $emails = 0;
    foreach ($properties as $property) {
        $emails += dispatch_search_alert_matches($property);
    }

    return ['properties' => count($properties), 'emails' => $emails];
}
