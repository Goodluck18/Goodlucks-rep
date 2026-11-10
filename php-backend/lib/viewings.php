<?php
declare(strict_types=1);

/**
 * Increment F — the agent-led viewing lifecycle.
 *
 * One row in `viewing_schedules` carries a viewing from "the tenant asked" to
 * "the viewing happened". The distinction the brief insists on is explicit
 * rather than implied:
 *
 *   - A request is `viewing_requested` (or `enquiry_received` for a plain
 *     enquiry). It is NOT an appointment.
 *   - An appointment exists only once a slot is proposed AND confirmed;
 *     `confirmed_at` is the evidence, and `viewing_appointment_is_confirmed()`
 *     is the only definition of "confirmed" in the codebase.
 *
 * Every change that matters goes through viewing_apply_transition(), which
 * validates the transition against the caller's role on the server, refuses
 * impossible ones, writes an append-only `viewing_events` row, and only then
 * notifies people. Nothing here touches money: completing a viewing is not a
 * payment and never creates a fee record (Increment B keeps that job, and it
 * still requires staff to record what the agent collected).
 */

/** What the tenant is asking for. A plain enquiry is not a viewing request. */
const VIEWING_REQUEST_TYPES = [
    'viewing' => 'Viewing request',
    'enquiry' => 'Property enquiry',
];

/**
 * The lifecycle vocabulary. `scheduled` is a legacy Increment 0 value: stored
 * rows keep it, and it is READ as `confirmed` (the old UI marked a request as
 * scheduled the moment it was submitted). Nothing rewrites those rows.
 */
const VIEWING_LIFECYCLE_STATUSES = [
    'enquiry_received',
    'viewing_requested',
    'awaiting_agent',
    'proposed',
    'confirmed',
    'reschedule_requested',
    'rescheduled',
    'cancelled',
    'completed',
    'tenant_no_show',
    'agent_no_show',
    'could_not_proceed',
];

const VIEWING_STATUS_LABELS = [
    'enquiry_received'    => 'Enquiry received',
    'viewing_requested'   => 'Viewing requested',
    'awaiting_agent'      => 'Awaiting agent response',
    'proposed'            => 'Appointment proposed',
    'confirmed'           => 'Appointment confirmed',
    'reschedule_requested'=> 'Reschedule requested',
    'rescheduled'         => 'Appointment rescheduled',
    'cancelled'           => 'Cancelled',
    'completed'           => 'Completed',
    'tenant_no_show'      => 'Tenant did not attend',
    'agent_no_show'       => 'Agent did not attend',
    'could_not_proceed'   => 'Viewing could not proceed',
];

/** Statuses a record cannot leave without an audited administrative correction. */
const VIEWING_TERMINAL_STATUSES = [
    'cancelled',
    'completed',
    'tenant_no_show',
    'agent_no_show',
    'could_not_proceed',
];

/** Statuses in which a confirmed appointment exists. */
const VIEWING_APPOINTMENT_STATUSES = ['confirmed', 'rescheduled'];

const VIEWING_CORRECTION_REASONS_MIN = 10;

/** Legacy stored value → the status the lifecycle understands today. */
function viewing_normalise_status(string $status): string
{
    $status = strtolower(trim($status));
    if ($status === 'scheduled') {
        return 'confirmed';
    }
    return in_array($status, VIEWING_LIFECYCLE_STATUSES, true) ? $status : 'viewing_requested';
}

function viewing_status_label(string $status): string
{
    return VIEWING_STATUS_LABELS[viewing_normalise_status($status)] ?? 'Unknown';
}

function viewing_is_terminal(string $status): bool
{
    return in_array(viewing_normalise_status($status), VIEWING_TERMINAL_STATUSES, true);
}

/** True only when an appointment has actually been agreed. */
function viewing_appointment_is_confirmed(array $viewing): bool
{
    return !empty($viewing['confirmedAt'])
        && in_array(viewing_normalise_status((string)($viewing['status'] ?? '')), VIEWING_APPOINTMENT_STATUSES, true);
}

/**
 * Allowed transitions, keyed by the actor's relationship to the viewing.
 *
 * Deliberately explicit: adding a status means editing this table, and an
 * unlisted pair simply cannot happen. Administrators do not appear here for
 * terminal moves — those require the correction endpoint with a written reason.
 */
function viewing_transition_matrix(): array
{
    $requestish = [
        // Upgrade 2 (B5): a landlord may propose a time for their own listing,
        // exactly like the agent responsible for it.
        'proposed'           => ['agent', 'landlord', 'admin'],
        'cancelled'          => ['tenant', 'agent', 'landlord', 'admin'],
        'could_not_proceed'  => ['agent', 'landlord', 'admin'],
    ];
    $proposed = [
        'confirmed'          => ['tenant', 'agent', 'landlord', 'admin'],
        'proposed'           => ['agent', 'landlord', 'admin'],
        'reschedule_requested' => ['tenant', 'agent', 'landlord', 'admin'],
        'cancelled'          => ['tenant', 'agent', 'landlord', 'admin'],
        'could_not_proceed'  => ['agent', 'landlord', 'admin'],
    ];
    $confirmed = [
        'reschedule_requested' => ['tenant', 'agent', 'landlord', 'admin'],
        // 'rescheduled' is deliberately absent. Upgrade 2 (B5): an agent or
        // landlord can no longer move an agreed appointment on their own; they
        // ask for a new time, and only the tenant accepts it.
        'cancelled'          => ['tenant', 'agent', 'landlord', 'admin'],
        'completed'          => ['agent', 'landlord', 'admin'],
        'tenant_no_show'     => ['agent', 'landlord', 'admin'],
        'agent_no_show'      => ['tenant', 'admin'],
        'could_not_proceed'  => ['agent', 'landlord', 'admin'],
    ];
    // Upgrade 2 (B5): a pending reschedule is closed by the tenant — accepting
    // the new slot moves the appointment, declining keeps the agreed one.
    $rescheduleRequested = [
        'rescheduled'        => ['tenant', 'admin'],
        'confirmed'          => ['tenant', 'admin'],
        'reschedule_requested' => ['tenant', 'agent', 'landlord', 'admin'],
        'cancelled'          => ['tenant', 'agent', 'landlord', 'admin'],
    ];

    return [
        'enquiry_received'    => $requestish + ['viewing_requested' => ['tenant', 'admin']],
        'viewing_requested'   => $requestish,
        'awaiting_agent'      => $requestish,
        'proposed'            => $proposed,
        'confirmed'           => $confirmed,
        'reschedule_requested' => $rescheduleRequested,
        'rescheduled'         => $confirmed,
        // Terminal statuses: no normal exits at all.
        'cancelled'           => [],
        'completed'           => [],
        'tenant_no_show'      => [],
        'agent_no_show'       => [],
        'could_not_proceed'   => [],
    ];
}

function viewing_transition_allowed(string $from, string $to, string $role): bool
{
    $from = viewing_normalise_status($from);
    $to = viewing_normalise_status($to);
    $matrix = viewing_transition_matrix();
    $roles = $matrix[$from][$to] ?? [];

    return in_array($role, $roles, true);
}

/**
 * What is this user to this viewing? Never stored, always derived.
 *
 * A suspended agent keeps their historical rows but loses operational access:
 * the role still resolves (so history is not destroyed) and the callers refuse
 * changes for a non-operational agent.
 */
function viewing_actor_role(array $viewing, ?array $user): string
{
    if (!$user) {
        return 'none';
    }
    if (is_admin($user)) {
        return 'admin';
    }

    $role = (string)($user['role'] ?? '');
    $userId = (string)($user['id'] ?? '');

    if ($role === 'agent' && (string)($viewing['agentUserId'] ?? '') === $userId) {
        return 'agent';
    }

    if ($role === 'tenant') {
        if ((string)($viewing['tenantUserId'] ?? '') === $userId) {
            return 'tenant';
        }
        // Legacy rows (Increment 0) only carry the email address.
        $email = strtolower(trim((string)($viewing['tenantEmail'] ?? '')));
        if ($email !== '' && $email === strtolower(trim((string)($user['email'] ?? '')))) {
            return 'tenant';
        }
    }

    if ($role === 'landlord') {
        // The landlord account id is never exposed in a viewing response, so the
        // relationship is resolved here (stored link first, then the property).
        if ((string)($viewing['landlordUserId'] ?? '') === $userId) {
            return 'landlord';
        }
        $propertyId = (string)($viewing['propertyId'] ?? '');
        if ($propertyId !== '') {
            $property = find_property($propertyId);
            if ($property && (string)($property['landlord_id'] ?? '') === $userId) {
                return 'landlord';
            }
        }
    }

    return 'none';
}

/** Agent accounts must be active to operate; history is untouched either way. */
function viewing_agent_operational(?array $user): bool
{
    if (!$user || (string)($user['role'] ?? '') !== 'agent') {
        return false;
    }
    $profile = find_agent_profile_by_user((string)$user['id']);

    return $profile !== null && (string)($profile['account_status'] ?? '') === 'active';
}

/**
 * Read access. Deliberately separate from the ability to change anything.
 *
 * @return array{role:string, canView:bool, canAct:bool, reason:string}
 */
function viewing_access(array $viewing, ?array $user): array
{
    $role = viewing_actor_role($viewing, $user);
    if ($role === 'none') {
        return [
            'role'    => 'none',
            'canView' => false,
            'canAct'  => false,
            'reason'  => 'This viewing request is not yours.',
        ];
    }

    if ($role === 'agent' && !viewing_agent_operational($user)) {
        return [
            'role'    => $role,
            'canView' => false,
            'canAct'  => false,
            'reason'  => 'Your agent account is not active, so viewing tools are closed. Existing records are kept.',
        ];
    }

    if (viewing_is_terminal((string)($viewing['status'] ?? '')) && $role !== 'admin') {
        return [
            'role'    => $role,
            'canView' => true,
            'canAct'  => false,
            'reason'  => 'This viewing is closed. Only an administrator can correct it.',
        ];
    }

    return ['role' => $role, 'canView' => true, 'canAct' => true, 'reason' => ''];
}

/** @return array{role:string} */
function require_viewing_view(array $viewing, ?array $user): array
{
    $access = viewing_access($viewing, $user);
    if (!$access['canView']) {
        error_response($access['reason'] !== '' ? $access['reason'] : 'You do not have access to this viewing.', 403);
    }

    return ['role' => $access['role']];
}

// ---------------------------------------------------------------------------
// Tenant contact disclosure (Upgrade 2, step 1)
//
// A tenant's phone number and email address are private. Goodlucks staff see
// them (they arrange viewings), and the tenant always sees their own record.
// An AGENT or LANDLORD does not: until an administrator explicitly approves
// sharing, the API returns those two fields empty and says why, so the console
// can show an honest state instead of a blank row.
//
// This is deliberately a seam at the serialisation boundary — `shape_viewing()`
// stays the trusted internal record so the code that emails the tenant still has
// the real address. The full request → review → approve → revoke workflow ships
// in Phase 5; until then every non-staff viewer is withheld, with no exceptions.
// ---------------------------------------------------------------------------

/**
 * Is this viewer allowed to see the tenant's phone number and email address?
 *
 * @return array{visible:bool, state:string, reason:string}
 */
function viewing_tenant_contact_state(array $viewing, ?array $viewer): array
{
    if ($viewer === null) {
        return [
            'visible' => false,
            'state'   => 'withheld',
            'reason'  => 'Sign in to see this request.',
        ];
    }

    if (is_admin($viewer)) {
        return ['visible' => true, 'state' => 'staff', 'reason' => ''];
    }

    $userId = (string)($viewer['id'] ?? '');
    $role = (string)($viewer['role'] ?? '');

    // The tenant's own record: always theirs.
    if ($role === 'tenant') {
        $ownerId = (string)($viewing['tenantUserId'] ?? '');
        if ($ownerId !== '' && $ownerId === $userId) {
            return ['visible' => true, 'state' => 'own_record', 'reason' => ''];
        }
        $ownerEmail = strtolower(trim((string)($viewing['tenantEmail'] ?? '')));
        $viewerEmail = strtolower(trim((string)($viewer['email'] ?? '')));
        if ($ownerEmail !== '' && $ownerEmail === $viewerEmail) {
            return ['visible' => true, 'state' => 'own_record', 'reason' => ''];
        }
    }

    if ($role === 'agent' || $role === 'landlord') {
        // Upgrade 2 Phase 5 (B6): one provider, one viewing, staff-approved and
        // time-limited. Nothing else opens this door.
        $viewingId = (string)($viewing['id'] ?? '');
        if ($viewingId !== '' && contact_disclosure_active_for($viewingId, $userId)) {
            return [
                'visible' => true,
                'state'   => 'approved_disclosure',
                'reason'  => '',
            ];
        }

        $disclosure = $viewingId !== '' ? find_contact_disclosure_for($viewingId, $userId) : null;
        $states = [
            'pending'  => 'Your request for the tenant\'s contact details is with Goodlucks staff.',
            'rejected' => 'Goodlucks refused the request for the tenant\'s contact details: ' . ($disclosure['decisionNote'] ?? ''),
            'revoked'  => 'Goodlucks withdrew the tenant\'s contact details for this viewing: ' . ($disclosure['decisionNote'] ?? ''),
            'expired'  => 'The approved contact details for this viewing have expired. Ask again if you still need them.',
        ];

        return [
            'visible' => false,
            'state'   => $disclosure !== null ? 'withheld_' . $disclosure['status'] : 'withheld_pending_approval',
            'reason'  => $disclosure !== null
                ? ($states[$disclosure['status']] ?? 'Goodlucks withholds the tenant\'s contact details until staff approve sharing them.')
                : 'Goodlucks shares a tenant\'s phone number and email address only after an administrator approves it. Ask for contact from this viewing.',
            'disclosure' => $disclosure,
        ];
    }

    return [
        'visible' => false,
        'state'   => 'withheld',
        'reason'  => 'You do not have access to this contact detail.',
    ];
}

/**
 * Shape a viewing for one viewer, withholding the tenant's contact details when
 * that viewer is not entitled to them. Every API response that returns a viewing
 * to a non-staff caller goes through this function.
 */
function viewing_for_viewer(array $viewing, ?array $viewer): array
{
    $state = viewing_tenant_contact_state($viewing, $viewer);

    $viewing['tenantContactVisible'] = $state['visible'];
    $viewing['tenantContactState'] = $state['state'];
    $viewing['tenantContactReason'] = $state['reason'];
    // Upgrade 2 (B6): the provider sees the state of their own request, including
    // why it was refused or when it expires. No contact details are included
    // unless `visible` is true.
    $viewing['contactDisclosure'] = $state['disclosure'] ?? null;

    if (!$state['visible']) {
        $viewing['tenantPhone'] = '';
        $viewing['tenantEmail'] = '';
    }

    return $viewing;
}

// ---------------------------------------------------------------------------
// Appointment slots
// ---------------------------------------------------------------------------

/** "11:00 AM" / "14:30" / "2:00 PM" → "HH:MM" (24h). Null when unparseable. */
function viewing_parse_time(?string $time): ?string
{
    $time = strtoupper(trim((string)$time));
    if ($time === '') {
        return null;
    }
    if (!preg_match('/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/', $time, $m)) {
        return null;
    }
    $hour = (int)$m[1];
    $minute = isset($m[2]) && $m[2] !== '' ? (int)$m[2] : 0;
    $meridiem = $m[3] ?? '';
    if ($meridiem === 'PM' && $hour < 12) {
        $hour += 12;
    }
    if ($meridiem === 'AM' && $hour === 12) {
        $hour = 0;
    }
    if ($hour > 23 || $minute > 59) {
        return null;
    }

    return sprintf('%02d:%02d', $hour, $minute);
}

/** Epoch seconds for a viewing slot, or null when the date/time is unusable. */
function viewing_slot_epoch(string $date, ?string $time): ?int
{
    $date = trim($date);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        return null;
    }
    $parsedTime = viewing_parse_time($time);
    $stamp = strtotime($date . ' ' . ($parsedTime !== null ? $parsedTime : '23:59') . ' UTC');

    return $stamp === false ? null : $stamp;
}

/**
 * Has the appointment slot arrived? A missing slot is treated as "not yet":
 * we never claim a viewing happened when we cannot prove the time.
 */
function viewing_slot_passed(array $viewing): bool
{
    $stamp = viewing_slot_epoch((string)($viewing['date'] ?? ''), $viewing['time'] ?? null);
    if ($stamp === null) {
        return false;
    }

    return $stamp <= time();
}

/** A viewing is overdue when it is still open after its slot has passed. */
function viewing_is_overdue(array $viewing): bool
{
    if (viewing_is_terminal((string)($viewing['status'] ?? ''))) {
        return false;
    }
    $stamp = viewing_slot_epoch((string)($viewing['date'] ?? ''), $viewing['time'] ?? null);
    if ($stamp === null) {
        return false;
    }

    return $stamp + 86400 < time();
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function record_viewing_event(
    string $viewingId,
    string $action,
    string $fromStatus,
    string $toStatus,
    ?string $note,
    ?array $actor,
    string $actorRole,
    ?string $previousDate = null,
    ?string $previousTime = null,
    ?string $newDate = null,
    ?string $newTime = null
): string {
    $id = new_id('vev');
    db_exec(
        'INSERT INTO viewing_events (id, viewing_id, action, from_status, to_status, previous_date, previous_time,
                                     new_date, new_time, note, actor_id, actor_role, actor_name, created_at)
         VALUES (:id, :viewing_id, :action, :from, :to, :pdate, :ptime,
                 :ndate, :ntime, :note, :actor_id, :actor_role, :actor_name, :created)',
        [
            ':id'         => $id,
            ':viewing_id' => $viewingId,
            ':action'     => $action,
            ':from'       => $fromStatus,
            ':to'         => $toStatus,
            ':pdate'      => $previousDate,
            ':ptime'      => $previousTime,
            ':ndate'      => $newDate,
            ':ntime'      => $newTime,
            ':note'       => $note,
            ':actor_id'   => $actor ? (string)$actor['id'] : null,
            ':actor_role' => $actorRole,
            ':actor_name' => $actor ? (string)($actor['name'] ?? '') : null,
            ':created'    => db_now(),
        ]
    );

    return $id;
}

function shape_viewing_event(array $row): array
{
    return [
        'id'           => (string)$row['id'],
        'viewingId'    => (string)$row['viewing_id'],
        'action'       => (string)$row['action'],
        'fromStatus'   => viewing_normalise_status((string)($row['from_status'] ?? '')),
        'toStatus'     => viewing_normalise_status((string)($row['to_status'] ?? '')),
        'previousDate' => (string)($row['previous_date'] ?? ''),
        'previousTime' => (string)($row['previous_time'] ?? ''),
        'newDate'      => (string)($row['new_date'] ?? ''),
        'newTime'      => (string)($row['new_time'] ?? ''),
        'note'         => (string)($row['note'] ?? ''),
        'actorId'      => (string)($row['actor_id'] ?? ''),
        'actorRole'    => (string)($row['actor_role'] ?? ''),
        'actorName'    => (string)($row['actor_name'] ?? ''),
        'at'           => to_iso($row['created_at'] ?? null),
    ];
}

function list_viewing_events(string $viewingId, int $limit = 100): array
{
    $rows = db_all(
        'SELECT * FROM viewing_events WHERE viewing_id = :id ORDER BY created_at ASC, id ASC' . db_limit_clause($limit, 0),
        [':id' => $viewingId]
    );

    return array_map('shape_viewing_event', $rows);
}

// ---------------------------------------------------------------------------
// Financial boundary
// ---------------------------------------------------------------------------

/**
 * A viewing is not a payment. This is the one sentence the UI and the tests
 * both lean on: the ledger only learns about money when staff record what the
 * agent actually collected (Increment B), and a policy entitlement is only an
 * entitlement (Increment E).
 */
function viewing_financial_state(array $viewing): array
{
    $record = find_viewing_fee_record_by_viewing((string)$viewing['id']);
    if (!$record) {
        return [
            'feeRecorded'      => false,
            'feeRecordId'      => '',
            'collectedGhs'     => null,
            'collectionState'  => 'none',
            'goodlucksShareGhs'=> null,
            'note'             => 'No fee has been recorded. A completed viewing does not create one.',
        ];
    }

    return [
        'feeRecorded'       => true,
        'feeRecordId'       => (string)$record['id'],
        'collectedGhs'      => $record['fee_total_ghs'] === null ? null : (float)$record['fee_total_ghs'],
        'collectionState'   => (string)($record['collection_state'] ?? 'reported'),
        'goodlucksShareGhs' => $record['goodlucks_share_ghs'] === null ? null : (float)$record['goodlucks_share_ghs'],
        'note'              => 'This is a record of what the agent collected. It is not Goodlucks revenue until a remittance is recorded.',
    ];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Tell the people who need to know, using the channels that already exist:
 * an in-app notification for accounts, and the existing email queue for the
 * tenant address on file (guests included). No SMS or WhatsApp is claimed.
 *
 * Called only AFTER the database change has committed.
 */
function viewing_notify(array $viewing, string $action, string $statusLabel, ?string $note, ?array $actor): void
{
    $title = 'Viewing: ' . $viewing['propertyTitle'];
    $lines = ['Status: ' . $statusLabel];
    if (!empty($viewing['date'])) {
        $lines[] = 'Appointment: ' . $viewing['date'] . (!empty($viewing['time']) ? ' at ' . $viewing['time'] : '');
    }
    if ($note !== null && trim($note) !== '') {
        $lines[] = 'Note: ' . $note;
    }
    $body = implode("\n", $lines);

    $tenantUserId = (string)($viewing['tenantUserId'] ?? '');
    if ($tenantUserId !== '') {
        create_notification($tenantUserId, $title . ' — ' . $statusLabel, $body, 'viewing');
    }

    $agentUserId = (string)($viewing['agentUserId'] ?? '');
    if ($agentUserId !== '' && $action !== 'created' && $agentUserId !== (string)($actor['id'] ?? '')) {
        create_notification($agentUserId, $title . ' — ' . $statusLabel, $body, 'viewing');
    }

    $email = trim((string)($viewing['tenantEmail'] ?? ''));
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
        send_email(
            $email,
            (string)($viewing['tenantName'] ?? 'Tenant'),
            'Viewing update: ' . $viewing['propertyTitle'] . ' — ' . $statusLabel,
            email_html_template(
                'Viewing update',
                '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e((string)($viewing['tenantName'] ?? '')) . ',</p>'
                . '<p style="color:#CBD5E1;font-size:14px;">' . nl2br(e($body)) . '</p>'
                . '<p style="color:#94A3B8;font-size:12px;">This message reflects the current record. A viewing fee, if any, is paid only after the viewing, and the listing states who it is paid to. Goodlucks never asks for a viewing fee online.</p>'
            ),
            'viewing_update',
            'Viewing update'
        );
    }
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

/** Actions a caller may take right now. Used by the UI and asserted in tests. */
function viewing_allowed_actions(array $viewing, string $role): array
{
    $status = viewing_normalise_status((string)($viewing['status'] ?? ''));
    if ($role === 'none' || viewing_is_terminal($status)) {
        return [];
    }

    $actions = [];
    $matrix = viewing_transition_matrix();

    if ($role === 'agent' || $role === 'landlord' || $role === 'admin') {
        if (isset($matrix[$status]['proposed'])) {
            $actions[] = 'propose';
        }
        // Upgrade 2 (B5): a provider asks for a new time; it no longer moves the
        // appointment outright (only an administrator may).
        if (isset($matrix[$status]['reschedule_requested'])) {
            $actions[] = 'reschedule';
        }
        if (isset($matrix[$status]['rescheduled']) || isset($matrix[$status]['confirmed'])) {
            $actions[] = 'confirm';
        }
        if (isset($matrix[$status]['completed'])) {
            $actions[] = 'complete';
        }
        if (isset($matrix[$status]['tenant_no_show'])) {
            $actions[] = 'tenant_no_show';
        }
        if (isset($matrix[$status]['could_not_proceed'])) {
            $actions[] = 'could_not_proceed';
        }
    }
    if ($role === 'tenant' || $role === 'admin') {
        if (isset($matrix[$status]['confirmed'])) {
            $actions[] = 'confirm';
        }
        if (isset($matrix[$status]['reschedule_requested'])) {
            $actions[] = 'request_reschedule';
        }
        // Upgrade 2 (B5): only the tenant accepts or declines a new time.
        if ($status === 'reschedule_requested') {
            $actions[] = 'accept_reschedule';
            $actions[] = 'decline_reschedule';
        }
        if (isset($matrix[$status]['agent_no_show'])) {
            $actions[] = 'agent_no_show';
        }
    }
    if ($role === 'landlord' || $role === 'agent' || $role === 'tenant' || $role === 'admin') {
        if (isset($matrix[$status]['cancelled'])) {
            $actions[] = 'cancel';
        }
    }

    return array_values(array_unique($actions));
}

/**
 * Apply a lifecycle change.
 *
 * @param array $viewing  shaped viewing row (from find_viewing)
 * @param array $actor    authenticated user; never a client-supplied identity
 * @param string $role    relationship from viewing_actor_role()
 * @param array{status:string, date?:?string, time?:?string, note?:?string, reason?:?string, outcome?:?string} $change
 * @return array shaped viewing after the change
 */
function viewing_apply_transition(array $viewing, array $actor, string $role, array $change): array
{
    $id = (string)$viewing['id'];
    $fromStatus = viewing_normalise_status((string)($viewing['status'] ?? ''));
    $toStatus = viewing_normalise_status((string)($change['status'] ?? ''));
    $note = isset($change['note']) && $change['note'] !== null ? clean_text((string)$change['note'], 1000) : null;
    $reason = isset($change['reason']) && $change['reason'] !== null ? clean_text((string)$change['reason'], 1000) : null;

    if (!in_array($toStatus, VIEWING_LIFECYCLE_STATUSES, true)) {
        error_response('That is not a viewing status.', 422, ['status' => 'Choose one of: ' . implode(', ', VIEWING_LIFECYCLE_STATUSES)]);
    }

    if (viewing_is_terminal($fromStatus)) {
        error_response(
            'This viewing is already closed (' . viewing_status_label($fromStatus) . '). An administrator must correct it, with a reason.',
            409
        );
    }

    if (!viewing_transition_allowed($fromStatus, $toStatus, $role)) {
        error_response(
            'A ' . viewing_status_label($fromStatus) . ' request cannot be moved to "' . viewing_status_label($toStatus)
            . '" by a ' . $role . '.',
            422
        );
    }

    $newDate = isset($change['date']) && $change['date'] !== null ? clean_string((string)$change['date'], 32) : null;
    $newTime = isset($change['time']) && $change['time'] !== null ? clean_string((string)$change['time'], 32) : null;

    // Slot rules.
    if (in_array($toStatus, ['proposed', 'rescheduled', 'reschedule_requested'], true)) {
        if ($newDate === null || $newDate === '') {
            error_response('Choose the date you are proposing.', 422, ['date' => 'A proposed appointment needs a date.']);
        }
        if (valid_date_iso($newDate) === null) {
            error_response('Choose a valid date.', 422, ['date' => 'Use a real calendar date.']);
        }
        if ($newDate < gmdate('Y-m-d')) {
            error_response('A proposed date cannot be in the past.', 422, ['date' => 'Choose today or a later date.']);
        }
    }

    // Upgrade 2 (B5): asking to move an agreed appointment needs a written
    // reason. A bare "new time?" gives the tenant nothing to judge.
    if ($toStatus === 'reschedule_requested' && $fromStatus !== 'proposed') {
        if ($reason === null || trim($reason) === '') {
            error_response(
                'Say why the appointment needs to move.',
                422,
                ['reason' => 'A reschedule request needs a reason.']
            );
        }
    }

    if ($toStatus === 'completed' && ($role === 'agent' || $role === 'landlord')) {
        if (!viewing_slot_passed($viewing)) {
            error_response(
                'The appointment slot has not arrived yet, so it cannot be marked complete. An administrator can correct the record with a written reason.',
                422,
                ['status' => 'Only an audited administrative correction may complete a viewing early.']
            );
        }
    }

    if (in_array($toStatus, ['tenant_no_show', 'agent_no_show'], true) && !viewing_slot_passed($viewing)) {
        error_response('A no-show can only be recorded after the appointment time has passed.', 422);
    }

    if ($toStatus === 'cancelled' && ($role === 'agent' || $role === 'landlord' || $role === 'admin')
        && ($reason === null || trim($reason) === '')
    ) {
        error_response('Record why the viewing is being cancelled.', 422, ['reason' => 'A cancellation needs a reason.']);
    }

    if ($toStatus === 'could_not_proceed' && ($reason === null || trim($reason) === '')) {
        error_response('Record why the viewing could not proceed.', 422, ['reason' => 'Explain what happened.']);
    }

    if ($toStatus === 'reschedule_requested' && $newDate !== null && $newDate !== '' && valid_date_iso($newDate) === null) {
        error_response('Choose a valid date.', 422, ['date' => 'Use a real calendar date.']);
    }

    $previousDate = (string)($viewing['date'] ?? '');
    $previousTime = (string)($viewing['time'] ?? '');
    $now = db_now();
    $fields = ['status' => $toStatus, 'updated_at' => $now];

    if (in_array($toStatus, ['proposed', 'rescheduled'], true)) {
        $fields['date'] = $newDate;
        $fields['time'] = $newTime ?? $previousTime;
        if ($toStatus === 'rescheduled') {
            // A reschedule is an agreed new slot, so it keeps confirmation evidence.
            $fields['confirmed_at'] = $now;
            $fields['confirmed_by'] = (string)$actor['id'];
        }
    }

    if ($toStatus === 'confirmed') {
        if (empty($viewing['date'])) {
            error_response('There is no proposed appointment to confirm yet.', 422);
        }
        $fields['confirmed_at'] = $now;
        $fields['confirmed_by'] = (string)$actor['id'];
    }

    if ($toStatus === 'reschedule_requested') {
        if ($newDate !== null && $newDate !== '') {
            $fields['preferred_date'] = $newDate;
        }
        if ($newTime !== null && $newTime !== '') {
            $fields['preferred_time'] = $newTime;
        }
    }

    if ($toStatus === 'cancelled') {
        $fields['cancel_reason'] = $reason ?? $note ?? '';
        $fields['cancelled_by'] = (string)$actor['id'];
        $fields['cancelled_at'] = $now;
    }

    if ($toStatus === 'completed') {
        $fields['completed_at'] = $now;
        $fields['completed_by'] = (string)$actor['id'];
        if ($note !== null && $note !== '') {
            $fields['outcome_notes'] = $note;
        }
    }

    if (in_array($toStatus, ['tenant_no_show', 'agent_no_show', 'could_not_proceed'], true)) {
        $fields['outcome_notes'] = $reason ?? $note ?? viewing_status_label($toStatus);
    }

    if ($role === 'agent' && $note !== null && $note !== '') {
        $fields['agent_notes'] = $note;
    }

    $action = match ($toStatus) {
        'proposed'             => $fromStatus === 'proposed' ? 'viewing.slot_reproposed' : 'viewing.proposed',
        'confirmed'            => 'viewing.confirmed',
        'rescheduled'          => 'viewing.rescheduled',
        'reschedule_requested' => 'viewing.reschedule_requested',
        'cancelled'            => 'viewing.cancelled',
        'completed'            => 'viewing.completed',
        'tenant_no_show'       => 'viewing.tenant_no_show',
        'agent_no_show'        => 'viewing.agent_no_show',
        'could_not_proceed'    => 'viewing.could_not_proceed',
        'viewing_requested'    => 'viewing.requested',
        default                => 'viewing.status_changed',
    };

    // The history should say why, whether the caller called it a note or a reason.
    $eventNote = ($note !== null && trim($note) !== '') ? $note : $reason;

    db_transaction(static function () use ($id, $fields, $action, $fromStatus, $toStatus, $eventNote, $actor, $role, $previousDate, $previousTime, $newDate, $newTime): void {
        $set = [];
        $params = [':id' => $id];
        foreach ($fields as $column => $value) {
            $set[] = $column . ' = :' . $column;
            $params[':' . $column] = $value;
        }
        db_exec('UPDATE viewing_schedules SET ' . implode(', ', $set) . ' WHERE id = :id', $params);

        record_viewing_event(
            $id,
            $action,
            $fromStatus,
            $toStatus,
            $eventNote,
            $actor,
            $role,
            $previousDate !== '' ? $previousDate : null,
            $previousTime !== '' ? $previousTime : null,
            $newDate,
            $newTime
        );
    });

    audit_log($action, 'viewing', $id, [
        'from'        => $fromStatus,
        'to'          => $toStatus,
        'actorRole'   => $role,
        'propertyId'  => (string)($viewing['propertyId'] ?? ''),
        'agentUserId' => (string)($viewing['agentUserId'] ?? ''),
        'note'        => $note,
    ]);

    $updated = find_viewing($id);
    if ($updated === null) {
        error_response('The viewing could not be reloaded after the change.', 500);
    }

    // A cancellation carries its reason in `reason`, not `note`. Never let an
    // empty note hide the explanation the recipient is owed (finding D11).
    $message = ($note !== null && trim($note) !== '') ? $note : $reason;
    viewing_notify($updated, $action, viewing_status_label($toStatus), $message, $actor);

    return $updated;
}

/**
 * Administrative correction: the only way out of a terminal status, or past the
 * timing rules. Always requires a written reason and always audited.
 */
function viewing_apply_correction(array $viewing, array $admin, string $status, string $reason): array
{
    $id = (string)$viewing['id'];
    $fromStatus = viewing_normalise_status((string)($viewing['status'] ?? ''));
    $toStatus = viewing_normalise_status($status);
    $reason = clean_text($reason, 1000);

    if (!is_admin($admin) || !is_viewing_corrector($admin)) {
        error_response('Correcting a viewing record requires the viewing-correction capability.', 403);
    }
    if (!in_array($toStatus, VIEWING_LIFECYCLE_STATUSES, true)) {
        error_response('That is not a viewing status.', 422, ['status' => 'Choose a recognised status.']);
    }
    if (mb_strlen(trim($reason)) < VIEWING_CORRECTION_REASONS_MIN) {
        error_response(
            'Write at least ' . VIEWING_CORRECTION_REASONS_MIN . ' characters explaining the correction.',
            422,
            ['reason' => 'The audit trail needs a real explanation.']
        );
    }
    if ($toStatus === $fromStatus) {
        error_response('The record already has that status.', 422, ['status' => 'Choose a different status.']);
    }

    $now = db_now();
    $fields = ['status' => $toStatus, 'updated_at' => $now];
    if ($toStatus === 'completed') {
        $fields['completed_at'] = $now;
        $fields['completed_by'] = (string)$admin['id'];
    }
    if ($toStatus === 'cancelled') {
        $fields['cancelled_at'] = $now;
        $fields['cancelled_by'] = (string)$admin['id'];
        $fields['cancel_reason'] = $reason;
    }

    db_transaction(static function () use ($id, $fields, $fromStatus, $toStatus, $reason, $admin): void {
        $set = [];
        $params = [':id' => $id];
        foreach ($fields as $column => $value) {
            $set[] = $column . ' = :' . $column;
            $params[':' . $column] = $value;
        }
        db_exec('UPDATE viewing_schedules SET ' . implode(', ', $set) . ' WHERE id = :id', $params);
        record_viewing_event($id, 'viewing.corrected', $fromStatus, $toStatus, $reason, $admin, 'admin');
    });

    audit_log('viewing.corrected', 'viewing', $id, [
        'from'   => $fromStatus,
        'to'     => $toStatus,
        'reason' => $reason,
    ]);

    $updated = find_viewing($id);
    if ($updated === null) {
        error_response('The viewing could not be reloaded after the correction.', 500);
    }
    viewing_notify($updated, 'viewing.corrected', viewing_status_label($toStatus) . ' (corrected by staff)', $reason, $admin);

    return $updated;
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

/**
 * Link a viewing to the agent account responsible for it.
 *
 * The agent must be an active agent account. Reassignment is audited and never
 * rewrites financial history: the fee ledger keeps whatever agent name was
 * recorded when the fee was reported.
 */
function viewing_assign_agent(array $viewing, ?string $agentUserId, array $admin): array
{
    $id = (string)$viewing['id'];
    $agentUserId = trim((string)$agentUserId);
    if ($agentUserId === '') {
        error_response('Choose the agent this viewing belongs to.', 422, ['agentUserId' => 'An agent is required.']);
    }

    $agent = find_user_by_id($agentUserId);
    if (!$agent || (string)($agent['role'] ?? '') !== 'agent') {
        error_response('That agent account could not be used.', 422, ['agentUserId' => 'Choose an agent account.']);
    }
    $profile = find_agent_profile_by_user($agentUserId);
    if (!$profile || (string)($profile['account_status'] ?? '') !== 'active') {
        error_response('Only an active agent account can be given a viewing.', 422, [
            'agentUserId' => 'That agent account is not active.',
        ]);
    }

    $previous = (string)($viewing['agentUserId'] ?? '');
    db_transaction(static function () use ($id, $agentUserId, $agent): void {
        db_exec(
            'UPDATE viewing_schedules SET agent_user_id = :agent, assigned_agent = :name, updated_at = :now WHERE id = :id',
            [':agent' => $agentUserId, ':name' => (string)$agent['name'], ':now' => db_now(), ':id' => $id]
        );
    });

    record_viewing_event(
        $id,
        'viewing.agent_assigned',
        viewing_normalise_status((string)($viewing['status'] ?? '')),
        viewing_normalise_status((string)($viewing['status'] ?? '')),
        $previous === '' ? 'Assigned to ' . $agent['name'] : 'Reassigned from the previous agent to ' . $agent['name'],
        $admin,
        'admin'
    );

    audit_log('viewing.agent_assigned', 'viewing', $id, [
        'from' => $previous,
        'to'   => $agentUserId,
    ]);

    $updated = find_viewing($id);
    if ($updated === null) {
        error_response('The viewing could not be reloaded after the assignment.', 500);
    }

    create_notification(
        $agentUserId,
        'Viewing assigned: ' . $updated['propertyTitle'],
        'A viewing request for ' . $updated['propertyTitle'] . ' has been assigned to you.',
        'viewing'
    );

    return $updated;
}

// ---------------------------------------------------------------------------
// Corrector capability
// ---------------------------------------------------------------------------

function is_viewing_corrector(array $user): bool
{
    if ((string)($user['role'] ?? '') !== 'admin') {
        return false;
    }
    // Upgrade 2: the primary platform administrator may correct a viewing
    // record without a separate grant; every other administrator still needs
    // `can_correct_viewings`, and the correction is audited either way.
    return is_primary_admin($user) || !empty($user['can_correct_viewings']);
}

function require_viewing_corrector(): array
{
    $user = require_auth(['admin']);
    if (!is_viewing_corrector($user)) {
        error_response(
            'Correcting a viewing record is an exceptional action and is not part of default administrator access.',
            403
        );
    }

    return $user;
}

function viewing_capabilities(array $user): array
{
    return ['viewingCorrections' => is_viewing_corrector($user)];
}

/** CLI-only: there is deliberately no HTTP route that grants this capability. */
function set_viewing_correction_capability(string $userId, bool $allowed): void
{
    db_exec(
        'UPDATE users SET can_correct_viewings = :allowed, updated_at = :now WHERE id = :id AND role = :role',
        [':allowed' => $allowed ? 1 : 0, ':now' => db_now(), ':id' => $userId, ':role' => 'admin']
    );
}

// ---------------------------------------------------------------------------
// Queries used by the handlers
// ---------------------------------------------------------------------------

/** Find the agent account responsible for a property, if the submitter was one. */
function viewing_responsible_agent(?array $property): ?array
{
    if (!$property) {
        return null;
    }
    // find_property() returns the raw row (snake_case); accept the shaped keys
    // too so this helper cannot silently fail depending on the caller.
    $submitterId = (string)($property['submitted_by_user_id'] ?? $property['submittedByUserId'] ?? '');
    $submitterRole = (string)($property['submitted_by_role'] ?? $property['submittedByRole'] ?? '');
    if ($submitterId === '' || $submitterRole !== 'agent') {
        return null;
    }
    $user = find_user_by_id($submitterId);
    if (!$user || (string)($user['role'] ?? '') !== 'agent') {
        return null;
    }
    $profile = find_agent_profile_by_user($submitterId);
    if (!$profile || (string)($profile['account_status'] ?? '') !== 'active') {
        return null;
    }

    return $user;
}

/**
 * Scoped listing. Filters are applied on the server; a client cannot widen a
 * scope by sending different parameters.
 *
 * @param array{tenantUserId?:string, tenantEmail?:string, agentUserId?:string, landlordId?:string, propertyId?:string, status?:string} $scope
 */
function list_viewings_filtered(array $scope = [], int $limit = 200): array
{
    $where = [];
    $params = [];
    if (!empty($scope['tenantUserId'])) {
        $where[] = '(tenant_user_id = :tenant_user_id OR (tenant_user_id IS NULL AND LOWER(tenant_email) = LOWER(:tenant_email)))';
        $params[':tenant_user_id'] = $scope['tenantUserId'];
        $params[':tenant_email'] = (string)($scope['tenantEmail'] ?? '');
    } elseif (!empty($scope['tenantEmail'])) {
        $where[] = 'LOWER(tenant_email) = LOWER(:tenant_email)';
        $params[':tenant_email'] = $scope['tenantEmail'];
    }
    if (!empty($scope['agentUserId'])) {
        $where[] = 'agent_user_id = :agent_user_id';
        $params[':agent_user_id'] = $scope['agentUserId'];
    }
    if (!empty($scope['propertyId'])) {
        $where[] = 'property_id = :property_id';
        $params[':property_id'] = $scope['propertyId'];
    }
    if (!empty($scope['landlordId'])) {
        $where[] = '(landlord_user_id = :landlord_id OR property_id IN (SELECT id FROM properties WHERE landlord_id = :landlord_id))';
        $params[':landlord_id'] = $scope['landlordId'];
    }
    if (!empty($scope['status'])) {
        $status = viewing_normalise_status((string)$scope['status']);
        if ($status === 'confirmed') {
            // Legacy rows store 'scheduled' for the same meaning.
            $where[] = "status IN ('confirmed', 'scheduled', 'rescheduled')";
        } else {
            $where[] = 'status = :status';
            $params[':status'] = $status;
        }
    }

    $sql = 'SELECT * FROM viewing_schedules'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY created_at DESC' . db_limit_clause($limit, 0);

    return array_map('shape_viewing', db_all($sql, $params));
}
