<?php
/**
 * Goodlucks Homes - seven-day property availability renewal.
 *
 * Every publicly published listing must be reconfirmed as still available by the
 * Agent or Landlord responsible for it every seven days. A listing that is not
 * confirmed is unpublished automatically; its record, photographs and history
 * are preserved and it can be brought back by confirming availability.
 *
 * The rule is expressed in three places, on purpose:
 *
 *   1. `property_availability_state()` — one derived answer used by every caller
 *      (provider dashboard, admin console, API shapes). Nothing is cached and
 *      nothing is trusted from the client.
 *   2. `property_is_publicly_visible()` / `availability_public_where_sql()` —
 *      a public listing whose deadline has passed is invisible *immediately*,
 *      whether or not the scheduled job has run. This is the safeguard that
 *      stops a stale listing surviving a broken cron.
 *   3. `run_property_availability_maintenance()` — the scheduled job that sends
 *      the reminder, asks for confirmation at the deadline, and moves an
 *      unconfirmed listing to `expired`.
 *
 * Timestamps are UTC throughout (`db_now()` is UTC), so "seven days" is exactly
 * 604800 seconds from the stored value and never depends on a server timezone.
 *
 * Automated events are recorded with `actor_role = 'system'` and no actor id, so
 * the audit trail never attributes a cron action to an administrator.
 */

declare(strict_types=1);

/** Seven days, in seconds. The whole rule hangs off this one number. */
const AVAILABILITY_PERIOD_SECONDS = 7 * 86400;

/** A reminder is sent when the deadline is this close. */
const AVAILABILITY_REMINDER_SECONDS = 86400;

/**
 * The public listing disappears at the deadline itself (see the query guard).
 * The database status moves to `expired` one hour later, so a provider who
 * confirms in that window simply renews a listing that is briefly hidden
 * instead of resurrecting an expired one.
 */
const AVAILABILITY_EXPIRY_GRACE_SECONDS = 3600;

/** "Due soon" in the admin console: inside 48 hours. */
const AVAILABILITY_DUE_SOON_SECONDS = 2 * 86400;

/** The state vocabulary the API, the dashboards and the console share. */
const AVAILABILITY_STATES = [
    'not_published',        // pending / rejected — never advertised yet
    'active_confirmed',     // published, deadline comfortably ahead
    'due_soon',             // published, deadline within 48 hours
    'awaiting_confirmation',// published, deadline passed, status not yet written
    'expired',              // unpublished automatically: no confirmation
    'unavailable',          // the provider said it is no longer available
    'suspended',            // unpublished because the provider account is suspended
    'rented',               // the listing says it has been let
];

/**
 * Parse a stored UTC timestamp. Stored values are UTC (`db_now()`), so they are
 * read as UTC rather than in whatever timezone the PHP process happens to use.
 */
function availability_timestamp(?string $value): ?int
{
    $value = trim((string)$value);
    if ($value === '') {
        return null;
    }
    $ts = strtotime(str_contains($value, 'Z') ? $value : $value . ' UTC');
    return $ts === false ? null : $ts;
}

/** Format an absolute timestamp in the database's UTC format. */
function availability_db_time(int $timestamp): string
{
    return gmdate('Y-m-d H:i:s', $timestamp);
}

/**
 * Everything derived about a listing's availability, for one reading of its row.
 *
 * @return array{
 *   state: string, label: string, explanation: string,
 *   publishedAt: string, confirmedAt: string, dueAt: string,
 *   dueInSeconds: ?int, overdue: bool, publiclyVisible: bool,
 *   canConfirm: bool, canDeclareUnavailable: bool,
 *   awaitingProvider: bool, expiredAutomatically: bool, withdrawnByProvider: bool
 * }
 */
function property_availability_state(array $row, ?int $now = null): array
{
    $now = $now ?? time();
    $status = (string)($row['status'] ?? '');
    $due = availability_timestamp($row['availability_due_at'] ?? null);
    $confirmed = availability_timestamp($row['availability_confirmed_at'] ?? null);
    $published = availability_timestamp($row['published_at'] ?? null);
    $dueIn = $due !== null ? $due - $now : null;

    $state = 'not_published';
    $label = 'Not published';
    $explanation = 'This listing is not advertised yet.';
    $awaitingProvider = false;

    if ($status === 'active') {
        if ($due !== null && $due <= $now) {
            $state = 'awaiting_confirmation';
            $label = 'Availability confirmation required';
            $explanation = 'The seven-day confirmation is overdue, so this listing is hidden from the public until you confirm it.';
            $awaitingProvider = true;
        } elseif ($due !== null && $due - $now <= AVAILABILITY_DUE_SOON_SECONDS) {
            $state = 'due_soon';
            $label = 'Confirmation due soon';
            $explanation = 'Confirm this listing is still available to keep it advertised.';
            $awaitingProvider = true;
        } else {
            $state = 'active_confirmed';
            $label = 'Published · availability current';
            $explanation = 'Confirmed available. The next confirmation is due before the deadline shown.';
        }
    } elseif ($status === 'expired') {
        $state = 'expired';
        $label = 'Availability confirmation required';
        $explanation = 'We asked whether this property is still available and did not hear back, so it was unpublished automatically. It has not been deleted.';
        $awaitingProvider = true;
    } elseif ($status === 'deactivated') {
        $state = 'unavailable';
        $label = 'Not available · withdrawn';
        $explanation = 'Marked as no longer available, so it is not advertised. The record is kept.';
    } elseif ($status === 'suspended') {
        $state = 'suspended';
        $label = 'Unpublished · provider account suspended';
        $explanation = 'This listing was unpublished because the provider account is suspended.';
    } elseif ($status === 'rented') {
        $state = 'rented';
        $label = 'Let';
        $explanation = 'The listing is recorded as let and is not advertised.';
    } elseif ($status === 'pending') {
        $state = 'not_published';
        $label = 'Awaiting staff approval';
        $explanation = 'This listing is waiting for Goodlucks staff to review it.';
    } elseif ($status === 'rejected') {
        $state = 'not_published';
        $label = 'Not approved';
        $explanation = 'Staff did not approve this listing, so it is not advertised.';
    }

    // A listing with no stored deadline yet is a row from before this upgrade.
    // It stays public until the backfill/cron stamps its clock — it is never
    // hidden just for being old, and it never stays public past a deadline it
    // does have.
    $publiclyVisible = $status === 'active' && ($due === null || $due > $now);
    $canAnswer = in_array($status, ['active', 'expired'], true);

    return [
        'state'                => $state,
        'label'                => $label,
        'explanation'          => $explanation,
        'publishedAt'          => to_iso($row['published_at'] ?? null),
        'confirmedAt'          => to_iso($row['availability_confirmed_at'] ?? null),
        'dueAt'                => to_iso($row['availability_due_at'] ?? null),
        'dueInSeconds'         => $dueIn,
        'overdue'              => $dueIn !== null && $dueIn <= 0,
        'publiclyVisible'      => $publiclyVisible,
        'canConfirm'           => $canAnswer,
        'canDeclareUnavailable' => $canAnswer,
        'awaitingProvider'     => $awaitingProvider,
        'expiredAutomatically' => $status === 'expired',
        'withdrawnByProvider'  => $status === 'deactivated',
    ];
}

/**
 * May the public see this listing right now?
 *
 * A published listing whose deadline has passed is NOT public, even if the
 * scheduled job has not yet written `expired`. This is the safeguard that makes
 * the seven-day rule independent of cron.
 */
function property_is_publicly_visible(array $row, ?int $now = null): bool
{
    return property_availability_state($row, $now)['publiclyVisible'];
}

/**
 * SQL fragment + parameters that hide overdue listings from a public query.
 *
 * `availability_due_at IS NULL` covers a row created before this upgrade and not
 * yet stamped by the migration backfill or the scheduled job: it is visible, and
 * the job gives it a deadline on its first pass.
 *
 * Kept next to `property_is_publicly_visible()` so there is one definition of
 * "public" rather than one per endpoint.
 *
 * @return array{0: string, 1: array<string, mixed>}
 */
function availability_public_where_sql(?int $now = null): array
{
    return [
        '(availability_due_at IS NULL OR availability_due_at > :availability_now)',
        [':availability_now' => availability_db_time($now ?? time())],
    ];
}

// ---------------------------------------------------------------------------
// Activity history
// ---------------------------------------------------------------------------

/**
 * Record one availability action, at most once per property/action/cycle.
 *
 * The unique index on (property_id, action, cycle_key) is what makes the
 * scheduled job idempotent: a second run of the same pass, a retried request or
 * a double click finds the row already there and records nothing.
 *
 * @param array{role?: string, id?: ?string, name?: string} $actor
 * @return bool true when this call recorded the event (i.e. it owns the action)
 */
function record_property_availability_event(
    string $propertyId,
    string $action,
    array $actor = [],
    string $source = '',
    string $note = '',
    string $cycleKey = '',
    ?string $dueAt = null
): bool {
    try {
        db_exec(
            'INSERT INTO property_availability_events
                (id, property_id, action, actor_role, actor_id, actor_name, source, note, cycle_key, due_at, created_at)
             VALUES
                (:id, :property_id, :action, :actor_role, :actor_id, :actor_name, :source, :note, :cycle_key, :due_at, :created)',
            [
                ':id'          => new_id('pavail'),
                ':property_id' => $propertyId,
                ':action'      => clean_string($action, 48),
                ':actor_role'  => one_of((string)($actor['role'] ?? 'system'), ['provider', 'admin', 'system'], 'system'),
                ':actor_id'    => $actor['id'] ?? null,
                ':actor_name'  => clean_string((string)($actor['name'] ?? ''), 255),
                ':source'      => clean_string($source, 64),
                ':note'        => clean_string($note, 500),
                ':cycle_key'   => clean_string($cycleKey !== '' ? $cycleKey : 'once', 64),
                ':due_at'      => $dueAt,
                ':created'     => db_now(),
            ]
        );
        return true;
    } catch (Throwable $e) {
        // Unique violation = this action is already recorded for this cycle.
        if (stripos($e->getMessage(), 'unique') === false && stripos($e->getMessage(), 'duplicate') === false) {
            gl_log('error', 'Could not record availability event: ' . $e->getMessage(), ['property' => $propertyId]);
        }
        return false;
    }
}

/** The identifier of the current seven-day cycle: the deadline it answers. */
function availability_cycle_key(array $row): string
{
    $due = trim((string)($row['availability_due_at'] ?? ''));
    return $due !== '' ? $due : 'unscheduled';
}

/** @return array<int, array<string, mixed>> newest first */
function property_availability_history(string $propertyId, int $limit = 20): array
{
    $limit = max(1, min(100, $limit));
    $rows = db_all(
        'SELECT * FROM property_availability_events WHERE property_id = :id ORDER BY created_at DESC, id DESC'
        . db_limit_clause($limit, 0),
        [':id' => $propertyId]
    );

    return array_map(static fn(array $row): array => [
        'id'        => (string)$row['id'],
        'propertyId' => (string)$row['property_id'],
        'action'    => (string)$row['action'],
        'label'     => availability_action_label((string)$row['action']),
        'actorRole' => (string)$row['actor_role'],
        'actorName' => (string)$row['actor_name'],
        'system'    => (string)$row['actor_role'] === 'system',
        'source'    => (string)$row['source'],
        'note'      => (string)$row['note'],
        'dueAt'     => to_iso($row['due_at'] ?? null),
        'createdAt' => to_iso($row['created_at'] ?? null),
    ], $rows);
}

/** A readable sentence for an availability action. */
function availability_action_label(string $action): string
{
    return match ($action) {
        'published'                     => 'Listing published · seven-day confirmation started',
        'published_legacy'              => 'Listing already published · confirmation clock started',
        'reminder_sent'                 => 'Confirmation reminder sent',
        'confirmation_requested'        => 'Availability confirmation requested',
        'confirmed'                     => 'Provider confirmed still available',
        'declared_unavailable'          => 'Provider declared no longer available',
        'expired'                       => 'Expired automatically — no confirmation',
        'reactivated_by_provider'       => 'Reactivated by provider after confirming availability',
        'reactivated_by_admin'          => 'Reactivated by an administrator',
        'suspended_by_admin'            => 'Unpublished because the provider was suspended',
        'reopened_after_reinstatement'  => 'Provider reinstated — listing needs a fresh confirmation',
        'admin_rejected_reactivation'   => 'Administrator reactivation refused',
        default                         => 'Availability action',
    };
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

/** The account responsible for a listing (owner, else the submitting agent). */
function availability_provider_for(array $row): ?array
{
    $id = property_provider_user_id($row);
    if ($id === '') {
        return null;
    }
    return find_user_by_id($id);
}

/**
 * Start (or restart) the seven-day clock.
 *
 * Called when a listing goes live — by staff approval, by a provider's
 * reactivation, or by an administrator's reactivation. `published_at` is only
 * set the first time, so the original publication date is never overwritten and
 * the history survives an expiry.
 */
function start_property_availability_cycle(array $row, array $actor, string $source, string $action = 'published', string $note = ''): array
{
    $now = time();
    $due = $now + AVAILABILITY_PERIOD_SECONDS;
    $published = trim((string)($row['published_at'] ?? ''));

    update_property((string)$row['id'], [
        'published_at'              => $published !== '' ? $published : availability_db_time($now),
        'availability_confirmed_at' => availability_db_time($now),
        'availability_due_at'       => availability_db_time($due),
    ]);

    $fresh = find_property((string)$row['id']) ?? $row;
    record_property_availability_event(
        (string)$row['id'],
        $action,
        $actor,
        $source,
        $note,
        availability_db_time($due),
        availability_db_time($due)
    );

    return $fresh;
}

/**
 * A provider answers "yes, still available".
 *
 * Two outcomes, one rule:
 *   * the listing is published — the deadline is renewed by seven days;
 *   * the listing expired   — it is republished, but only if the account may
 *     still list (verification approved, not suspended) and the listing was
 *     approved by staff in the first place.
 *
 * @return array{ok: bool, property?: array, error?: string, code?: int, fields?: array, renewed?: bool, reactivated?: bool}
 */
function confirm_property_availability(array $row, array $user, string $source = 'provider_dashboard', string $note = '')
{
    $propertyId = (string)($row['id'] ?? '');
    $status = (string)($row['status'] ?? '');
    $actor = [
        'role' => (string)($user['role'] ?? '') === 'admin' ? 'admin' : 'provider',
        'id'   => (string)($user['id'] ?? ''),
        'name' => (string)($user['name'] ?? ''),
    ];

    // `deactivated` is a listing the provider withdrew earlier; saying "available"
    // again is the same answer, so it is republished through the same gate.
    if (!in_array($status, ['active', 'expired', 'deactivated'], true)) {
        return [
            'ok'     => false,
            'code'   => 409,
            'error'  => 'This listing is not waiting for an availability confirmation.',
            'fields' => ['status' => 'Only a published, expired or withdrawn listing can be confirmed from here.'],
        ];
    }

    // Reactivating an expired listing must satisfy every publication rule that
    // applies to a new listing: the account may list at all (identity approved,
    // not suspended), and the listing itself was approved by staff.
    if ($status !== 'active') {
        // The gate belongs to the account that will own the published listing,
        // not necessarily to the person pressing the button (an administrator
        // may confirm on the provider's behalf, but never around a suspension).
        $responsible = availability_provider_for($row) ?? $user;
        $listing = provider_listing_state($responsible);
        if (!$listing['canList']) {
            return [
                'ok'     => false,
                'code'   => 403,
                'error'  => $listing['message'],
                'fields' => [
                    'verificationRequired' => $listing['message'],
                    'verificationStatus'   => $listing['identityStatus'],
                ],
            ];
        }
        if ((string)($row['published_at'] ?? '') === '') {
            return [
                'ok'     => false,
                'code'   => 409,
                'error'  => 'This listing has never been published, so it needs staff approval instead.',
                'fields' => ['status' => 'Ask Goodlucks to review it.'],
            ];
        }

        // A landlord listing is published with the administrator's general
        // viewing fee; reactivation follows the same rule as a new publication.
        if (function_exists('is_landlord_listing') && is_landlord_listing($row)) {
            apply_landlord_viewing_fee_to_property($row, $user);
        }

        update_property($propertyId, ['status' => 'active']);
        $reopened = find_property($propertyId) ?? $row;
        $fresh = start_property_availability_cycle($reopened, $actor, $source, 'reactivated_by_provider', $note);

        audit_log('property.availability_reactivated', 'property', $propertyId, [
            'by'     => 'provider',
            'source' => $source,
        ], $user);

        notify_availability_provider($fresh, 'reactivated', $actor['name']);
        notify_availability_staff($fresh, 'reactivated_by_provider', $actor['name']);

        return ['ok' => true, 'property' => $fresh, 'reactivated' => true, 'renewed' => false];
    }

    // Published: extend the deadline. This is the ordinary renewal.
    $cycle = availability_cycle_key($row);
    $due = time() + AVAILABILITY_PERIOD_SECONDS;
    update_property($propertyId, [
        'availability_confirmed_at' => availability_db_time(time()),
        'availability_due_at'       => availability_db_time($due),
    ]);

    $fresh = find_property($propertyId) ?? $row;
    record_property_availability_event(
        $propertyId,
        'confirmed',
        $actor,
        $source,
        $note,
        $cycle,
        availability_db_time($due)
    );

    audit_log('property.availability_confirmed', 'property', $propertyId, [
        'cycle' => $cycle,
        'nextDueAt' => availability_db_time($due),
        'source' => $source,
    ], $user);

    notify_availability_provider($fresh, 'renewed', $actor['name']);

    return ['ok' => true, 'property' => $fresh, 'renewed' => true, 'reactivated' => false];
}

/**
 * A provider answers "no longer available".
 *
 * The listing is unpublished (status `deactivated`) and nothing is deleted. The
 * record stays distinguishable from an automatic expiry: `expired` means the
 * provider said nothing, `deactivated` means they said it is gone.
 */
function withdraw_property_availability(array $row, array $user, string $note = '', string $source = 'provider_dashboard'): array
{
    $propertyId = (string)($row['id'] ?? '');
    $status = (string)($row['status'] ?? '');
    // A suspended provider keeps the right to withdraw: 'suspended' is an
    // account decision, and the provider may still say the property is gone.
    if (!in_array($status, ['active', 'expired', 'suspended'], true)) {
        return [
            'ok'     => false,
            'code'   => 409,
            'error'  => 'This listing is not currently advertised, so there is nothing to withdraw.',
            'fields' => ['status' => 'Only a published, expired or suspended listing can be marked unavailable.'],
        ];
    }

    $actor = [
        'role' => 'provider',
        'id'   => (string)($user['id'] ?? ''),
        'name' => (string)($user['name'] ?? ''),
    ];

    update_property($propertyId, ['status' => 'deactivated']);
    $fresh = find_property($propertyId) ?? $row;

    record_property_availability_event(
        $propertyId,
        'declared_unavailable',
        $actor,
        $source,
        $note,
        availability_cycle_key($row)
    );

    audit_log('property.availability_declined', 'property', $propertyId, [
        'note'   => clean_string($note, 500),
        'source' => $source,
    ], $user);

    notify_availability_provider($fresh, 'unavailable', $actor['name']);

    return ['ok' => true, 'property' => $fresh];
}

/**
 * Administrative reactivation of an expired listing.
 *
 * The reason is mandatory because an administrator is asserting that the
 * listing's availability was established — normally by asking the provider. The
 * action never bypasses suspension, verification or moderation: if the account
 * may not list, the reactivation is refused and recorded as refused.
 */
function admin_reactivate_property_availability(array $row, array $admin, string $reason, string $confirmedWith, string $note = ''): array
{
    $propertyId = (string)($row['id'] ?? '');
    $status = (string)($row['status'] ?? '');

    // A published listing whose deadline has already passed is "awaiting
    // confirmation": it is already hidden from the public, so an administrator
    // may reactivate it exactly as they would an expired one.
    $awaiting = $status === 'active' && !property_is_publicly_visible($row);
    if (!in_array($status, ['expired', 'deactivated', 'rented'], true) && !$awaiting) {
        return [
            'ok'     => false,
            'code'   => 409,
            'error'  => 'Only an expired or unpublished listing can be reactivated here.',
            'fields' => ['status' => 'A published listing with a current confirmation does not need reactivation.'],
        ];
    }

    $provider = availability_provider_for($row);
    if ($provider === null) {
        return [
            'ok'     => false,
            'code'   => 409,
            'error'  => 'This listing has no responsible account, so availability cannot be confirmed.',
            'fields' => ['provider' => 'No responsible Agent or Landlord is recorded.'],
        ];
    }

    // The same gate a provider faces: identity approved, not suspended.
    $listing = provider_listing_state($provider);
    if (!$listing['canList']) {
        $actor = ['role' => 'admin', 'id' => (string)$admin['id'], 'name' => (string)$admin['name']];
        record_property_availability_event(
            $propertyId,
            'admin_rejected_reactivation',
            $actor,
            'admin_console',
            $reason,
            availability_cycle_key($row) . ':' . gmdate('Y-m-d H:i:s')
        );
        audit_log('property.availability_reactivation_refused', 'property', $propertyId, [
            'reason' => clean_string($reason, 500),
            'because' => $listing['reason'],
        ], $admin);

        return [
            'ok'     => false,
            'code'   => 409,
            'error'  => 'The responsible account cannot list (' . str_replace('_', ' ', (string)$listing['reason']) . '), so this listing cannot be republished.',
            'fields' => ['provider' => $listing['message']],
        ];
    }

    if (function_exists('is_landlord_listing') && is_landlord_listing($row)) {
        apply_landlord_viewing_fee_to_property($row, $admin);
    }

    update_property($propertyId, ['status' => 'active']);
    $fresh = find_property($propertyId) ?? $row;

    $actor = ['role' => 'admin', 'id' => (string)$admin['id'], 'name' => (string)$admin['name']];
    $fresh = start_property_availability_cycle($fresh, $actor, 'admin_console', 'reactivated_by_admin', $reason);

    audit_log('property.availability_reactivated', 'property', $propertyId, [
        'by'                   => 'administrator',
        'reason'               => clean_string($reason, 500),
        'availabilityConfirmedWith' => clean_string($confirmedWith, 120),
        'note'                 => clean_string($note, 500),
        'previousStatus'       => $status,
    ], $admin);

    notify_availability_provider($fresh, 'reactivated_by_admin', (string)$admin['name']);

    return ['ok' => true, 'property' => $fresh];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** The dashboard page a provider manages one listing from. */
function availability_dashboard_path(array $row): string
{
    $role = (string)($row['submitted_by_role'] ?? '');
    $ownerRole = '';
    $ownerId = (string)($row['landlord_id'] ?? '');
    if ($ownerId !== '') {
        $owner = find_user_by_id($ownerId);
        $ownerRole = (string)($owner['role'] ?? '');
    }
    $role = $ownerRole !== '' ? $ownerRole : ($role !== '' ? $role : 'landlord');

    return $role === 'agent' ? '/agent/properties' : '/landlord/properties';
}

/**
 * In-app + email message to the responsible provider.
 *
 * The in-app notification is created once per property/event/cycle (the caller
 * only reaches here when it owns the event), and the email is additionally
 * claimed through `alert_deliveries` so a retried job cannot send it twice.
 */
function notify_availability_provider(array $row, string $event, string $actorName = ''): bool
{
    $provider = availability_provider_for($row);
    if ($provider === null) {
        return false;
    }

    $propertyId = (string)$row['id'];
    $title = trim((string)($row['title'] ?? 'Your listing'));
    $location = trim((string)($row['location'] ?? ''));
    $label = $location !== '' ? $title . ' (' . $location . ')' : $title;
    $path = availability_dashboard_path($row);
    $dueAt = property_availability_state($row)['dueAt'];
    $dueLabel = $dueAt !== '' ? gmdate('j M Y, H:i', availability_timestamp($dueAt) ?? time()) . ' UTC' : '';

    [$subject, $heading, $message, $emailLine] = match ($event) {
        'reminder' => [
            'Is ' . $title . ' still available?',
            'Confirm availability within 24 hours',
            '"' . $title . '" needs its seven-day availability confirmation. Confirm it in your dashboard before ' . $dueLabel . ', or it will be unpublished automatically.',
            'Confirm before ' . $dueLabel . ' or the listing will be unpublished automatically. Nothing is deleted — you can republish it by confirming availability.',
        ],
        'request' => [
            'Confirm availability: ' . $title,
            'Availability confirmation is due',
            'The seven-day confirmation for "' . $title . '" is due now. The listing is hidden from the public until you confirm it is still available.',
            'The deadline has passed, so the listing is no longer public. Confirm availability in your dashboard and it will be published again.',
        ],
        'expired' => [
            'Unpublished: ' . $title . ' needs an availability confirmation',
            'Availability confirmation missed',
            '"' . $title . '" was unpublished because its seven-day availability confirmation was not received. The listing and its photographs are preserved.',
            'The listing has been removed from public view. It was not deleted: open your dashboard, confirm the property is available, and it will be published again.',
        ],
        'renewed' => [
            'Availability renewed: ' . $title,
            'Availability confirmed — listing stays live',
            '"' . $title . '" is confirmed as still available. The next confirmation is due by ' . $dueLabel . '.',
            'Thank you — your listing stays live. The next seven-day confirmation is due by ' . $dueLabel . '.',
        ],
        'reactivated' => [
            'Published again: ' . $title,
            'Availability confirmed — listing published again',
            '"' . $title . '" is confirmed as available and is published again with a fresh seven-day confirmation period.',
            'Your listing is live again. The next availability confirmation is due by ' . $dueLabel . '.',
        ],
        'reactivated_by_admin' => [
            'Republished by Goodlucks: ' . $title,
            'Goodlucks confirmed your listing as available',
            'Goodlucks staff confirmed "' . $title . '" is still available and republished it after speaking with you. Its next confirmation is due by ' . $dueLabel . '.',
            'Goodlucks staff republished your listing after confirming its availability. The next confirmation is due by ' . $dueLabel . '.',
        ],
        'unavailable' => [
            'Removed from public view: ' . $title,
            'Listing marked as no longer available',
            '"' . $title . '" has been marked as no longer available and removed from public listings. The record and its photographs are kept.',
            'Your listing is no longer advertised. Nothing was deleted — contact Goodlucks if it becomes available again.',
        ],
        default => ['Listing update: ' . $title, 'Listing update', '"' . $title . '" was updated.', ''],
    };

    $providerId = (string)$provider['id'];
    $email = (string)($provider['email'] ?? '');
    $cycle = $event . ':' . availability_cycle_key($row);

    // Both channels are claimed through `alert_deliveries` — the table that
    // already guarantees once-only delivery — so a retried job, a double click
    // or two overlapping cron runs cannot message the provider twice.
    if (claim_alert_delivery('availability_inapp', $providerId, $propertyId, $cycle, '')) {
        // The dashboard path is part of the message: a notification that does not
        // say where to act is a notification the member has to go hunting after.
        create_notification($providerId, $heading, $message . ' Manage this listing: ' . $path, match ($event) {
            'expired', 'request' => 'warning',
            'renewed', 'reactivated', 'reactivated_by_admin' => 'success',
            default => 'info',
        });
    }

    if ($email !== '' && valid_email($email) !== null
        && claim_alert_delivery('availability_email', $providerId, $propertyId, $cycle, $email)) {
        $body = '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e((string)($provider['name'] ?: 'there')) . ',</p>'
            . '<div style="background:#252A34;padding:16px;border-radius:8px;border-left:4px solid #08D9D6;margin:16px 0;">'
            . '<strong style="color:#FFFFFF;font-size:16px;">' . e($label) . '</strong><br>'
            . '<span style="color:#94A3B8;font-size:13px;">' . e($emailLine) . '</span>'
            . '</div>'
            . '<p style="color:#CBD5E1;font-size:14px;">Manage this listing in your dashboard: '
            . '<a style="color:#08D9D6;" href="' . e(SITE_URL . $path) . '">' . e(SITE_URL . $path) . '</a></p>';

        send_email($email, (string)($provider['name'] ?? ''), $subject, email_html_template($heading, $body, $propertyId), 'availability', $emailLine);
    }

    return true;
}

/**
 * Tell staff that a listing expired, or was brought back.
 *
 * Automated events are written with an empty actor name and `system` role: the
 * console must never imply an administrator did this.
 */
function notify_availability_staff(array $row, string $event, string $actorName = ''): bool
{
    $propertyId = (string)($row['id'] ?? '');
    $title = trim((string)($row['title'] ?? 'Listing'));
    $cycle = $event . ':' . availability_cycle_key($row);

    if (!claim_alert_delivery('availability_staff', 'staff', $propertyId, $cycle, '')) {
        return false;
    }

    $message = match ($event) {
        'expired' => '"' . $title . '" expired without an availability confirmation and was unpublished automatically.',
        'reactivated_by_provider' => '"' . $title . '" was unpublished for missing confirmation and the provider has now confirmed availability in their dashboard.',
        'reactivated_by_admin' => '"' . $title . '" was republished by an administrator after confirming availability.',
        default => '"' . $title . '" availability changed.',
    };

    foreach (db_all("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC" . db_limit_clause(20, 0)) as $adminRow) {
        create_notification((string)$adminRow['id'], 'Property availability', $message, 'warning');
    }

    return true;
}

// ---------------------------------------------------------------------------
// Scheduled maintenance
// ---------------------------------------------------------------------------

/**
 * The scheduled pass: remind, request, expire.
 *
 * Idempotent by construction — every message and every status change is claimed
 * through `property_availability_events`, whose unique key includes the cycle.
 * Running it twice in a minute is safe; running it after downtime catches up.
 *
 * @return array{reminded:int, requested:int, expired:int, checked:int}
 */
function run_property_availability_maintenance(bool $dryRun = false): array
{
    $now = time();
    $result = ['checked' => 0, 'reminded' => 0, 'requested' => 0, 'expired' => 0];

    $rows = db_all("SELECT * FROM properties WHERE status = 'active' ORDER BY availability_due_at ASC");
    $result['checked'] = count($rows);

    foreach ($rows as $row) {
        $propertyId = (string)$row['id'];
        $due = availability_timestamp($row['availability_due_at'] ?? null);

        // A live listing without a deadline cannot stay live indefinitely: give it
        // a full period from now rather than expiring it on sight.
        if ($due === null) {
            if (!$dryRun) {
                start_property_availability_cycle($row, ['role' => 'system', 'id' => null, 'name' => ''], 'cron', 'published_legacy');
            }
            continue;
        }

        // 1. Reminder, a day before the deadline.
        if ($due > $now && $due - $now <= AVAILABILITY_REMINDER_SECONDS) {
            if (!$dryRun && notify_availability_provider($row, 'reminder')) {
                record_property_availability_event($propertyId, 'reminder_sent', ['role' => 'system'], 'cron', '', availability_cycle_key($row), $row['availability_due_at'] ?? null);
            }
            $result['reminded']++;
            continue;
        }

        // 2. The deadline has arrived: ask for confirmation (the listing is
        //    already hidden by the query guard, so this is the prompt, not a
        //    second chance to stay visible).
        if ($due <= $now && $due + AVAILABILITY_EXPIRY_GRACE_SECONDS > $now) {
            if (!$dryRun && notify_availability_provider($row, 'request')) {
                record_property_availability_event($propertyId, 'confirmation_requested', ['role' => 'system'], 'cron', '', availability_cycle_key($row), $row['availability_due_at'] ?? null);
            }
            $result['requested']++;
            continue;
        }

        // 3. Still unanswered after the grace window: expire it.
        if ($due + AVAILABILITY_EXPIRY_GRACE_SECONDS <= $now) {
            if (!$dryRun) {
                $expired = expire_property_availability($row);
                if ($expired) {
                    $result['expired']++;
                }
            } else {
                $result['expired']++;
            }
        }
    }

    return $result;
}

/**
 * Move one unanswered listing to `expired`, preserving everything else.
 *
 * The status write is guarded by the current status so two concurrent runs (or a
 * provider confirming at the same moment) cannot both expire it, and the event
 * claim means the notifications are sent once even if the job is retried.
 */
function expire_property_availability(array $row): bool
{
    $propertyId = (string)($row['id'] ?? '');
    if ($propertyId === '' || (string)($row['status'] ?? '') !== 'active') {
        return false;
    }

    $claimed = record_property_availability_event(
        $propertyId,
        'expired',
        ['role' => 'system', 'id' => null, 'name' => ''],
        'cron',
        '',
        availability_cycle_key($row),
        $row['availability_due_at'] ?? null
    );
    if (!$claimed) {
        return false;
    }

    // Guard the transition itself: only an active row becomes expired.
    db_exec(
        "UPDATE properties SET status = 'expired', updated_at = :updated WHERE id = :id AND status = 'active'",
        [':updated' => db_now(), ':id' => $propertyId]
    );

    $fresh = find_property($propertyId) ?? $row;
    audit_log('property.availability_expired', 'property', $propertyId, [
        'dueAt'      => (string)($row['availability_due_at'] ?? ''),
        'previousStatus' => 'active',
        'automated'  => true,
    ], ['id' => null, 'role' => 'system', 'name' => 'Goodlucks Homes']);

    notify_availability_provider($fresh, 'expired');
    notify_availability_staff($fresh, 'expired');

    return true;
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

/**
 * The availability console: one row per listing, with the filter the operator
 * asked for. A single query plus in-PHP state derivation keeps "awaiting
 * confirmation" and "due soon" consistent with the provider's own dashboard.
 *
 * @param array{filter?: string, q?: string, page?: int, perPage?: int} $filters
 * @return array{items: array<int, array<string, mixed>>, total: int, counts: array<string, int>}
 */
function admin_property_availability_list(array $filters = []): array
{
    $now = time();
    $filter = strtolower(trim((string)($filters['filter'] ?? '')));
    $q = mb_strtolower(trim((string)($filters['q'] ?? '')));
    $page = max(1, (int)($filters['page'] ?? 1));
    $perPage = max(1, min(100, (int)($filters['perPage'] ?? 50)));

    $rows = db_all(
        'SELECT * FROM properties ORDER BY'
        . " CASE status WHEN 'active' THEN 0 WHEN 'expired' THEN 1 ELSE 2 END,"
        . ' COALESCE(availability_due_at, created_at) ASC, created_at DESC'
    );

    $items = [];
    $counts = [
        'all' => 0,
        'active' => 0,
        'due_soon' => 0,
        'awaiting' => 0,
        'expired' => 0,
        'draft' => 0,
        'unavailable' => 0,
        'reactivated' => 0,
    ];

    foreach ($rows as $row) {
        $state = property_availability_state($row, $now);
        $provider = availability_provider_for($row);
        $last = db_one(
            'SELECT action, actor_role, actor_name, source, note, created_at
               FROM property_availability_events
              WHERE property_id = :id
              ORDER BY created_at DESC, id DESC
              LIMIT 1',
            [':id' => (string)$row['id']]
        );
        $lastAction = (string)($last['action'] ?? '');

        // Counts describe the whole catalogue, not the current page.
        $counts['all']++;
        if ($state['state'] === 'active_confirmed') {
            $counts['active']++;
        } elseif ($state['state'] === 'due_soon') {
            $counts['active']++;
            $counts['due_soon']++;
        } elseif ($state['state'] === 'awaiting_confirmation') {
            $counts['awaiting']++;
        } elseif ($state['state'] === 'expired') {
            $counts['expired']++;
        } elseif ($state['state'] === 'unavailable') {
            $counts['unavailable']++;
        } elseif (in_array((string)$row['status'], ['pending', 'rejected'], true)) {
            $counts['draft']++;
        }
        if (in_array($lastAction, ['reactivated_by_provider', 'reactivated_by_admin'], true)) {
            $counts['reactivated']++;
        }

        $haystack = mb_strtolower((string)$row['title'] . ' ' . (string)$row['location'] . ' '
            . (string)($provider['name'] ?? '') . ' ' . (string)($provider['email'] ?? '') . ' ' . (string)$row['id']);
        if ($q !== '' && !str_contains($haystack, $q)) {
            continue;
        }

        $matches = match ($filter) {
            '' , 'all'         => true,
            'active'           => in_array($state['state'], ['active_confirmed', 'due_soon', 'awaiting_confirmation'], true),
            'due_soon'         => $state['state'] === 'due_soon',
            'awaiting'         => $state['state'] === 'awaiting_confirmation',
            'expired'          => $state['state'] === 'expired',
            'draft'            => in_array((string)$row['status'], ['pending', 'rejected'], true),
            'unavailable'      => $state['state'] === 'unavailable',
            'reactivated'      => in_array($lastAction, ['reactivated_by_provider', 'reactivated_by_admin'], true),
            'suspended'        => $state['state'] === 'suspended',
            default            => true,
        };
        if (!$matches) {
            continue;
        }

        $items[] = [
            'id'             => (string)$row['id'],
            'title'          => (string)$row['title'],
            'location'       => (string)$row['location'],
            'status'         => (string)$row['status'],
            'availability'   => $state,
            'provider'       => [
                'id'     => (string)($provider['id'] ?? ''),
                'name'   => (string)($provider['name'] ?? ''),
                'email'  => (string)($provider['email'] ?? ''),
                'role'   => (string)($provider['role'] ?? ''),
                'accountStatus' => (string)($provider['account_status'] ?? 'active'),
            ],
            'lastAction'     => [
                'action'    => $lastAction,
                'label'     => $lastAction !== '' ? availability_action_label($lastAction) : '',
                'actorRole' => (string)($last['actor_role'] ?? ''),
                'actorName' => (string)($last['actor_name'] ?? ''),
                'system'    => (string)($last['actor_role'] ?? '') === 'system',
                'source'    => (string)($last['source'] ?? ''),
                'note'      => (string)($last['note'] ?? ''),
                'at'        => to_iso($last['created_at'] ?? null),
            ],
            'canReactivate'  => in_array((string)$row['status'], ['expired', 'deactivated', 'rented'], true),
        ];
    }

    $total = count($items);
    $items = array_slice($items, ($page - 1) * $perPage, $perPage);

    return ['items' => $items, 'total' => $total, 'counts' => $counts, 'page' => $page, 'perPage' => $perPage];
}

/** Shape the availability block for a property payload. */
function shape_property_availability(array $row, bool $detailed = true): array
{
    $state = property_availability_state($row);
    if (!$detailed) {
        return [
            'state'   => $state['state'],
            'label'   => $state['label'],
            'dueAt'   => $state['dueAt'],
        ];
    }
    return $state + [
        'canConfirmReview' => false,
        'periodDays'       => (int)(AVAILABILITY_PERIOD_SECONDS / 86400),
    ];
}

/**
 * Overall availability and suspension activity for the admin console.
 *
 * Every entry carries the timestamp, the actor (or "system"), the event type,
 * the affected property or account, and the recorded detail. Automated events
 * are labelled `system: true` — the console must never present a cron action as
 * something an administrator did.
 *
 * @param array{kind?: string, q?: string, page?: int, perPage?: int} $filters
 * @return array{items: array<int, array<string, mixed>>, total: int, counts: array<string, int>}
 */
function admin_availability_activity(array $filters = []): array
{
    $groups = [
        'requests'      => ['property.availability_expired'],
        'confirmations' => ['property.availability_confirmed'],
        'declines'      => ['property.availability_declined'],
        'expiry'        => ['property.availability_expired'],
        'reactivations' => ['property.availability_reactivated', 'property.availability_reopened', 'property.availability_reactivation_refused'],
        'suspension'    => ['provider.suspended', 'provider.reinstated', 'property.availability_unpublished_suspension'],
    ];

    $all = [
        'property.availability_confirmed',
        'property.availability_declined',
        'property.availability_expired',
        'property.availability_reactivated',
        'property.availability_reactivation_refused',
        'property.availability_unpublished_suspension',
        'property.availability_reopened',
        'provider.suspended',
        'provider.reinstated',
    ];

    $kind = strtolower(trim((string)($filters['kind'] ?? '')));
    $wanted = $all;
    if ($kind !== '' && $kind !== 'all') {
        $wanted = $groups[$kind] ?? $all;
        if ($kind === 'confirmations') {
            $wanted = ['property.availability_confirmed', 'property.availability_declined'];
        }
    }

    $placeholders = [];
    $params = [];
    foreach ($wanted as $index => $action) {
        $placeholders[] = ':act_' . $index;
        $params[':act_' . $index] = $action;
    }

    $rows = db_all(
        'SELECT a.id, a.action, a.entity_type, a.entity_id, a.actor_role, a.actor_id, a.context_json, a.created_at,
                u.name AS actor_name
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.actor_id
          WHERE a.action IN (' . implode(', ', $placeholders) . ')
          ORDER BY a.created_at DESC, a.id DESC'
        . db_limit_clause(500, 0),
        $params
    );

    $q = mb_strtolower(trim((string)($filters['q'] ?? '')));
    $counts = ['all' => 0, 'requests' => 0, 'confirmations' => 0, 'declines' => 0, 'expiry' => 0, 'reactivations' => 0, 'suspension' => 0];
    $items = [];

    foreach ($rows as $row) {
        $action = (string)$row['action'];
        $entityType = (string)$row['entity_type'];
        $entityId = (string)($row['entity_id'] ?? '');
        $system = (string)($row['actor_role'] ?? '') === 'system' || (string)($row['actor_name'] ?? '') === '';

        $property = null;
        $account = null;
        if ($entityType === 'property') {
            $propertyRow = find_property($entityId);
            if ($propertyRow !== null) {
                $property = ['id' => $entityId, 'title' => (string)$propertyRow['title'], 'location' => (string)$propertyRow['location']];
                $accountRow = availability_provider_for($propertyRow);
                if ($accountRow !== null) {
                    $account = [
                        'id'   => (string)$accountRow['id'],
                        'name' => (string)$accountRow['name'],
                        'role' => (string)$accountRow['role'],
                    ];
                }
            }
        } elseif ($entityType === 'user') {
            $accountRow = find_user_by_id($entityId);
            if ($accountRow !== null) {
                $account = [
                    'id'   => $entityId,
                    'name' => (string)$accountRow['name'],
                    'role' => (string)$accountRow['role'],
                ];
            }
        }

        // Counts are over the whole filtered set, before the text search.
        $counts['all']++;
        foreach ($groups as $group => $actions) {
            if (in_array($action, $actions, true)) {
                $counts[$group]++;
            }
        }
        if ($kind === 'confirmations' && $action === 'property.availability_declined') {
            $counts['confirmations']++;
        }

        $haystack = mb_strtolower(
            availability_action_label($action) . ' ' . $action . ' ' . (string)($property['title'] ?? '')
            . ' ' . (string)($account['name'] ?? '') . ' ' . (string)($row['actor_name'] ?? '') . ' ' . $entityId
        );
        if ($q !== '' && !str_contains($haystack, $q)) {
            continue;
        }

        $context = json_column($row['context_json'] ?? null);
        $items[] = [
            'id'         => (string)$row['id'],
            'at'         => to_iso($row['created_at'] ?? null),
            'action'     => $action,
            'label'      => availability_action_label($action),
            'actorRole'  => (string)($row['actor_role'] ?? ''),
            'actorName'  => (string)($row['actor_name'] ?? ''),
            'system'     => $system,
            'entityType' => $entityType,
            'entityId'   => $entityId,
            'property'   => $property,
            'account'    => $account,
            'detail'     => [
                'reason' => (string)($context['reason'] ?? ''),
                'note'   => (string)($context['note'] ?? ''),
                'source' => (string)($context['source'] ?? ($context['availabilityConfirmedWith'] ?? '')),
                'automated' => !empty($context['automated']),
            ],
        ];
    }

    $page = max(1, (int)($filters['page'] ?? 1));
    $perPage = max(1, min(200, (int)($filters['perPage'] ?? 50)));
    $total = count($items);

    return [
        'items' => array_slice($items, ($page - 1) * $perPage, $perPage),
        'total' => $total,
        'page'  => $page,
        'perPage' => $perPage,
        'counts' => $counts,
    ];
}
