<?php
/**
 * Goodlucks Homes - property-specific viewing fees and viewing terms (Task 03).
 *
 * Every property that an AGENT submits carries its own viewing fee (GHS) and
 * its own viewing terms. The old `VIEWING_FEE_GHS` default of 100 was a
 * universal figure that no property had actually agreed to, and it has been
 * removed; there is no hardcoded fallback.
 *
 * Task 03 update: LANDLORD-submitted listings are the exception, and they do not
 * use this per-property mechanism at all. They carry the ONE general landlord
 * viewing fee an administrator configures in `platform_settings` (see
 * lib/landlord_policy.php). It is never typed by the landlord and never
 * reviewed per property; a landlord cannot propose a change to it.
 *
 * Two different things are stored, on purpose:
 *
 *   properties.viewing_fee_ghs / viewing_terms_json
 *       The APPROVED values. These are the only values that are ever shown
 *       publicly, and the only values copied onto a viewing request.
 *
 *   property_viewing_fee_changes
 *       Every proposal. A change to an already-approved listing does NOT take
 *       effect when the agent submits it: the approved values keep applying
 *       until staff approve the replacement, and every decision is kept with
 *       who made it, when, and why.
 *
 * A viewing fee is NOT the rental commission and NOT the Goodlucks share: the
 * 60% / 70% agent commission tiers never apply to it.
 */

/** Fee bounds. A fee is per property and must be stated; nothing is defaulted. */
const VIEWING_FEE_MIN_GHS = 1.0;
const VIEWING_FEE_MAX_GHS = 10000.0;

/** Terms lifecycle for `properties.viewing_terms_state`. */
const VIEWING_TERMS_STATES = [
    'not_set'        => 'No viewing terms',
    'pending_review' => 'Waiting for review',
    'approved'       => 'Approved',
    'rejected'       => 'Needs changes',
];

/** Change-request lifecycle. */
const VIEWING_FEE_CHANGE_STATUSES = [
    'pending_review' => 'Waiting for review',
    'approved'       => 'Approved',
    'rejected'       => 'Rejected',
];

/**
 * The structured viewing terms and their limits.
 *
 * `required` fields are the ones a tenant needs in order to act: how to arrange
 * the viewing and how the fee is paid. Everything else is optional.
 */
const VIEWING_TERMS_FIELDS = [
    'appointmentRequired'  => ['max' => 0,    'required' => false],
    'howToArrange'         => ['max' => 600,  'required' => true],
    'conditions'           => ['max' => 1200, 'required' => false],
    'paymentInstructions'  => ['max' => 600,  'required' => true],
    'restrictions'         => ['max' => 600,  'required' => false],
];

/**
 * Validate and normalise a viewing-terms input.
 *
 * @return array{terms: array, errors: array<string,string>}
 */
function normalise_viewing_terms($input): array
{
    $errors = [];
    $terms = [];

    if (!is_array($input)) {
        // Still report each required field, so the form can highlight them
        // instead of showing one opaque error.
        $input = [];
    }

    $appointment = $input['appointmentRequired'] ?? null;
    if ($appointment === null || $appointment === '') {
        $errors['viewingTerms.appointmentRequired'] = 'Say whether an appointment is required.';
    } else {
        $terms['appointmentRequired'] = filter_var($appointment, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
            ?? (bool)$appointment;
    }

    foreach (VIEWING_TERMS_FIELDS as $field => $rules) {
        if ($field === 'appointmentRequired') {
            continue;
        }
        $value = clean_text($input[$field] ?? '', (int)$rules['max']);
        if ($rules['required'] && mb_strlen($value) < 5) {
            $errors['viewingTerms.' . $field] = $field === 'howToArrange'
                ? 'Explain how a tenant arranges the viewing (at least 5 characters).'
                : 'Explain how the viewing fee is paid (at least 5 characters).';
            continue;
        }
        if ($value !== '' && mb_strlen($value) < 5) {
            $errors['viewingTerms.' . $field] = 'Use at least 5 characters, or leave this blank.';
            continue;
        }
        $terms[$field] = $value;
    }

    return ['terms' => $terms, 'errors' => $errors];
}

/**
 * Validate a viewing fee. Returns null when the value is not a usable fee.
 *
 * Negative, zero, non-numeric and over-limit values are refused — there is no
 * silent fallback to a platform default.
 */
function valid_viewing_fee($value): ?float
{
    if ($value === null || $value === '' || is_array($value)) {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    $fee = (float)$value;
    if ($fee < VIEWING_FEE_MIN_GHS || $fee > VIEWING_FEE_MAX_GHS) {
        return null;
    }
    return round($fee, 2);
}

/** Terms stored on a property row, decoded. Empty array when none are set. */
function property_viewing_terms_values(array $row): array
{
    $decoded = json_column($row['viewing_terms_json'] ?? null);
    return is_array($decoded) ? $decoded : [];
}

/**
 * The approved fee for a property, or null when no fee has been approved.
 *
 * A pending proposal is never returned: until staff approve it, the previous
 * approved value (or nothing at all) is what applies.
 */
function approved_viewing_fee(array $row): ?float
{
    if ((string)($row['viewing_terms_state'] ?? 'not_set') !== 'approved') {
        return null;
    }
    if (($row['viewing_fee_ghs'] ?? null) === null || $row['viewing_fee_ghs'] === '') {
        return null;
    }
    $fee = (float)$row['viewing_fee_ghs'];
    return $fee > 0 ? round($fee, 2) : null;
}

/** The approved viewing terms for a property, or null when none are approved. */
function approved_viewing_terms(array $row): ?array
{
    if ((string)($row['viewing_terms_state'] ?? 'not_set') !== 'approved') {
        return null;
    }
    $terms = property_viewing_terms_values($row);
    return $terms === [] ? null : $terms;
}

/**
 * The public shape of a property's viewing fee and terms.
 *
 * Staff see the state and the pending proposal; the owner/submitting agent sees
 * their own proposal; everybody else sees only approved values. No storage path,
 * internal id or reviewer note is ever exposed here.
 */
function shape_property_viewing_terms(array $row, ?array $viewer, ?array $pending = null): array
{
    $viewerId = (string)($viewer['id'] ?? '');
    $role = (string)($viewer['role'] ?? '');
    $ownerId = (string)($row['landlord_id'] ?? '');
    $submitterId = (string)($row['submitted_by_user_id'] ?? '');
    $isStaff = $role === 'admin';
    $canSeeReviewState = $isStaff || ($viewerId !== '' && ($viewerId === $ownerId || $viewerId === $submitterId));

    $fee = approved_viewing_fee($row);
    $terms = approved_viewing_terms($row);

    // Task 03 update: whose policy set this fee. A landlord-submitted listing
    // carries the ONE general landlord viewing fee that an administrator sets;
    // the landlord neither chooses nor changes it. An agent-submitted listing
    // keeps the per-property fee the agent set and staff approved.
    $policyOwner = listing_policy_owner($row);
    $isLandlordListing = $policyOwner === 'landlord';

    $payload = [
        'feeGhs'        => $fee,
        'terms'         => $terms,
        // Public: is a fee/terms pair approved for this property right now?
        'isApproved'    => $fee !== null && $terms !== null,
        'appliesToRole' => (string)($row['submitted_by_role'] ?? ''),
        // 'platform_policy' = the administrator's general landlord viewing fee;
        // 'property' = the agent's own approved per-property fee; 'none' = no
        // fee has been approved, and none is invented here.
        'source'        => $isLandlordListing
            ? 'platform_policy'
            : ($fee !== null ? 'property' : 'none'),
        'setBy'         => $isLandlordListing ? 'Goodlucks Homes' : ($fee !== null ? 'The agent listing this property' : ''),
        // A viewing fee is always paid after the viewing, never online, and a
        // landlord never receives it.
        'payableAfterViewing' => $fee !== null,
        'paidTo'        => $isLandlordListing
            ? 'Goodlucks Homes'
            : ($fee !== null ? 'The agent named on this listing' : ''),
        'landlordShareGhs' => $isLandlordListing ? 0.0 : null,
    ];

    if (!$canSeeReviewState) {
        return $payload;
    }

    if ($isLandlordListing) {
        // Staff/owner-only: has the administrator configured the platform-wide
        // landlord fee at all? Without it a landlord listing has no fee, and the
        // dashboard says so instead of showing an invented figure.
        $payload['platformFeeConfigured'] = landlord_viewing_fee_is_configured();
    }

    $payload['state'] = (string)($row['viewing_terms_state'] ?? 'not_set');
    $payload['stateLabel'] = VIEWING_TERMS_STATES[$payload['state']] ?? 'Unknown';
    $payload['updatedAt'] = to_iso($row['viewing_terms_updated_at'] ?? null);
    $payload['pendingChange'] = $pending !== null ? shape_viewing_fee_change($pending) : null;

    return $payload;
}

// ---------------------------------------------------------------------------
// Change requests
// ---------------------------------------------------------------------------

function find_viewing_fee_change(string $id): ?array
{
    return db_one('SELECT * FROM property_viewing_fee_changes WHERE id = :id LIMIT 1', [':id' => $id]);
}

function pending_viewing_fee_change(string $propertyId): ?array
{
    return db_one(
        "SELECT * FROM property_viewing_fee_changes
          WHERE property_id = :pid AND status = 'pending_review'
          ORDER BY created_at DESC LIMIT 1",
        [':pid' => $propertyId]
    );
}

function list_viewing_fee_changes(array $filters = [], int $limit = 200): array
{
    $where = [];
    $params = [];

    if (!empty($filters['status'])) {
        $where[] = 'status = :status';
        $params[':status'] = (string)$filters['status'];
    }
    if (!empty($filters['propertyId'])) {
        $where[] = 'property_id = :pid';
        $params[':pid'] = (string)$filters['propertyId'];
    }

    $sql = 'SELECT * FROM property_viewing_fee_changes';
    if ($where) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }
    $sql .= ' ORDER BY created_at DESC' . db_limit_clause($limit, 0);

    return array_map('shape_viewing_fee_change', db_all($sql, $params));
}

function shape_viewing_fee_change(array $row): array
{
    $terms = json_column($row['proposed_terms_json'] ?? null);
    return [
        'id'              => (string)$row['id'],
        'propertyId'      => (string)$row['property_id'],
        'requestedBy'     => (string)($row['requested_by'] ?? ''),
        'requestedByRole' => (string)($row['requested_by_role'] ?? ''),
        'proposedFeeGhs'  => $row['proposed_fee_ghs'] === null ? null : round((float)$row['proposed_fee_ghs'], 2),
        'proposedTerms'   => is_array($terms) ? $terms : [],
        'previousFeeGhs'  => $row['previous_fee_ghs'] === null ? null : round((float)$row['previous_fee_ghs'], 2),
        'previousTerms'   => json_column($row['previous_terms_json'] ?? null) ?: null,
        'status'          => (string)$row['status'],
        'statusLabel'     => VIEWING_FEE_CHANGE_STATUSES[(string)$row['status']] ?? 'Unknown',
        'note'            => (string)($row['note'] ?? ''),
        // A reviewer's note is shown to the property owner; reviewer identity is not.
        'decisionNote'    => (string)($row['decision_note'] ?? ''),
        'reviewedAt'      => to_iso($row['reviewed_at'] ?? null),
        'appliedAt'       => to_iso($row['applied_at'] ?? null),
        'createdAt'       => to_iso($row['created_at'] ?? null),
    ];
}

/**
 * Record a proposal to set or change a property's viewing fee and terms.
 *
 * This never writes the property's approved values. When the property is not
 * yet approved the proposal is what staff will approve together with the
 * listing; when it is already live the current values keep applying.
 */
function request_viewing_fee_change(array $property, array $input, array $actor): array
{
    $fee = valid_viewing_fee($input['viewingFeeGhs'] ?? $input['feeGhs'] ?? null);
    $errors = [];
    if ($fee === null) {
        $errors['viewingFeeGhs'] = 'Enter this property\'s viewing fee in GHS (between '
            . number_format(VIEWING_FEE_MIN_GHS, 0) . ' and ' . number_format(VIEWING_FEE_MAX_GHS, 0) . ').';
    }

    $normalised = normalise_viewing_terms($input['viewingTerms'] ?? null);
    $errors += $normalised['errors'];

    if ($errors) {
        error_response('Please correct the viewing fee and terms.', 422, $errors);
    }

    $propertyId = (string)$property['id'];
    $existing = pending_viewing_fee_change($propertyId);
    if ($existing !== null) {
        // Avoid piling up duplicate proposals: the newest proposal replaces the
        // pending one, and the previous decision history is kept untouched.
        db_exec(
            'UPDATE property_viewing_fee_changes
                SET proposed_fee_ghs = :fee, proposed_terms_json = :terms,
                    requested_by = :by, requested_by_role = :role,
                    note = :note, updated_at = :updated
              WHERE id = :id',
            [
                ':fee'     => $fee,
                ':terms'   => json_encode($normalised['terms'], JSON_UNESCAPED_SLASHES),
                ':by'      => (string)($actor['id'] ?? ''),
                ':role'    => (string)($actor['role'] ?? ''),
                ':note'    => clean_text($input['note'] ?? '', 500) ?: null,
                ':updated' => db_now(),
                ':id'      => (string)$existing['id'],
            ]
        );
    } else {
        db_exec(
            'INSERT INTO property_viewing_fee_changes
                (id, property_id, requested_by, requested_by_role, proposed_fee_ghs,
                 proposed_terms_json, previous_fee_ghs, previous_terms_json, status, note,
                 created_at, updated_at)
             VALUES (:id, :pid, :by, :role, :fee, :terms, :prev_fee, :prev_terms, :status, :note, :now, :updated)',
            [
                ':id'         => new_id('vfc'),
                ':pid'        => $propertyId,
                ':by'         => (string)($actor['id'] ?? ''),
                ':role'       => (string)($actor['role'] ?? ''),
                ':fee'        => $fee,
                ':terms'      => json_encode($normalised['terms'], JSON_UNESCAPED_SLASHES),
                ':prev_fee'   => $property['viewing_fee_ghs'] ?? null,
                ':prev_terms' => $property['viewing_terms_json'] ?? null,
                ':status'     => 'pending_review',
                ':note'       => clean_text($input['note'] ?? '', 500) ?: null,
                ':now'        => db_now(),
                ':updated'    => db_now(),
            ]
        );
    }

    $change = pending_viewing_fee_change($propertyId);
    if ($change === null) {
        error_response('The viewing-fee change could not be read back.', 500);
    }

    audit_log('property.viewing_terms_change_requested', 'property', $propertyId, [
        'changeId' => (string)$change['id'],
        'feeGhs'   => $fee,
    ], $actor);

    // Task 03: the proposal is sent for review and both sides are told. These are
    // in-app notifications only — nothing here claims an email was delivered.
    $title = (string)($property['title'] ?? 'your property');
    create_notification(
        (string)($actor['id'] ?? ''),
        'Viewing fee and terms sent for review',
        'Your viewing fee (GH₵ ' . number_format($fee, 2) . ') and terms for "' . $title
            . '" are waiting for a reviewer. The current fee and terms stay in place until they approve the change.',
        'info'
    );
    foreach (db_all("SELECT id FROM users WHERE role = 'admin' LIMIT 20") as $admin) {
        create_notification(
            (string)$admin['id'],
            'Viewing fee change to review',
            '"' . $title . '" has a proposed viewing fee of GH₵ ' . number_format($fee, 2)
                . '. Open the listing review to approve or reject it.',
            'info'
        );
    }

    return shape_viewing_fee_change($change);
}

/**
 * Write the approved values onto the property. The ONLY place that happens.
 */
function apply_viewing_fee_change(array $change, array $actor): void
{
    db_exec(
        'UPDATE properties
            SET viewing_fee_ghs = :fee, viewing_terms_json = :terms,
                viewing_terms_state = :state, viewing_terms_updated_at = :now,
                viewing_terms_approved_by = :by, updated_at = :now
          WHERE id = :id',
        [
            ':fee'   => round((float)$change['proposed_fee_ghs'], 2),
            ':terms' => (string)($change['proposed_terms_json'] ?? '{}'),
            ':state' => 'approved',
            ':now'   => db_now(),
            ':by'    => (string)($actor['id'] ?? ''),
            ':id'    => (string)$change['property_id'],
        ]
    );

    db_exec(
        "UPDATE property_viewing_fee_changes
            SET status = 'approved', reviewed_by = :by, reviewed_at = :now,
                applied_at = :now, updated_at = :now
          WHERE id = :id",
        [
            ':by'  => (string)($actor['id'] ?? ''),
            ':now' => db_now(),
            ':id'  => (string)$change['id'],
        ]
    );
}

/**
 * Approve a pending change. Refuses anything that is not pending.
 */
function approve_viewing_fee_change(string $changeId, array $actor, string $note = ''): array
{
    $change = find_viewing_fee_change($changeId);
    if ($change === null) {
        error_response('That viewing-fee change does not exist.', 404);
    }
    if ((string)$change['status'] !== 'pending_review') {
        error_response('This viewing-fee change has already been decided.', 409);
    }

    $property = find_property((string)$change['property_id']);
    if ($property === null) {
        error_response('The property for this change no longer exists.', 404);
    }

    if ($note !== '') {
        db_exec(
            'UPDATE property_viewing_fee_changes SET decision_note = :note WHERE id = :id',
            [':note' => clean_text($note, 500), ':id' => $changeId]
        );
    }

    apply_viewing_fee_change($change, $actor);

    audit_log('property.viewing_terms_change_approved', 'property', (string)$change['property_id'], [
        'changeId' => $changeId,
        'feeGhs'   => (float)$change['proposed_fee_ghs'],
    ], $actor);

    notify_viewing_terms_decision($property, $change, 'approved', $note);

    $fresh = find_viewing_fee_change($changeId);
    return shape_viewing_fee_change($fresh ?? $change);
}

/**
 * Reject a pending change. The approved values stay exactly as they were.
 */
function reject_viewing_fee_change(string $changeId, array $actor, string $reason): array
{
    $change = find_viewing_fee_change($changeId);
    if ($change === null) {
        error_response('That viewing-fee change does not exist.', 404);
    }
    if ((string)$change['status'] !== 'pending_review') {
        error_response('This viewing-fee change has already been decided.', 409);
    }
    $reason = clean_text($reason, 500);
    if (mb_strlen($reason) < 5) {
        error_response('Give the owner a reason so they know what to change.', 422, [
            'reason' => 'A rejection needs a short reason.',
        ]);
    }

    db_exec(
        "UPDATE property_viewing_fee_changes
            SET status = 'rejected', decision_note = :note, reviewed_by = :by,
                reviewed_at = :now, updated_at = :now
          WHERE id = :id",
        [
            ':note' => $reason,
            ':by'   => (string)($actor['id'] ?? ''),
            ':now'  => db_now(),
            ':id'   => $changeId,
        ]
    );

    audit_log('property.viewing_terms_change_rejected', 'property', (string)$change['property_id'], [
        'changeId' => $changeId,
    ], $actor);

    $property = find_property((string)$change['property_id']);
    if ($property !== null) {
        notify_viewing_terms_decision($property, $change, 'rejected', $reason);
    }

    $fresh = find_viewing_fee_change($changeId);
    return shape_viewing_fee_change($fresh ?? $change);
}

/**
 * Tell the people who care about a fee/terms decision: the owner account, the
 * agent who submitted the listing, and (for a new request) staff.
 */
function notify_viewing_terms_decision(array $property, array $change, string $decision, string $note): void
{
    $title = $property['title'] ?? 'your property';
    $fee = number_format((float)$change['proposed_fee_ghs'], 2);
    $message = $decision === 'approved'
        ? 'The viewing fee (GH₵ ' . $fee . ') and viewing terms for "' . $title . '" are now live.'
        : 'The proposed viewing fee (GH₵ ' . $fee . ') and terms for "' . $title . '" were not approved. The current fee and terms stay in place.';

    if ($note !== '') {
        $message .= ' Reviewer note: ' . $note;
    }

    $recipients = [];
    $ownerId = (string)($property['landlord_id'] ?? '');
    if ($ownerId !== '') {
        $recipients[$ownerId] = true;
    }
    $submitterId = (string)($property['submitted_by_user_id'] ?? '');
    if ($submitterId !== '') {
        $recipients[$submitterId] = true;
    }

    foreach (array_keys($recipients) as $userId) {
        create_notification(
            (string)$userId,
            $decision === 'approved' ? 'Viewing fee and terms approved' : 'Viewing fee and terms need changes',
            $message,
            $decision === 'approved' ? 'success' : 'warning'
        );
    }
}

/**
 * Apply the property's pending change while staff approve the listing itself.
 *
 * This keeps one approval flow: a listing is approved together with the fee and
 * terms that were submitted with it. Nothing is auto-approved here that a
 * reviewer did not just approve.
 */
function apply_pending_change_on_property_approval(array $property, array $actor): void
{
    $pending = pending_viewing_fee_change((string)$property['id']);
    if ($pending === null) {
        return;
    }
    apply_viewing_fee_change($pending, $actor);
    audit_log('property.viewing_terms_change_approved', 'property', (string)$property['id'], [
        'changeId' => (string)$pending['id'],
        'feeGhs'   => (float)$pending['proposed_fee_ghs'],
        'via'      => 'listing_approval',
    ], $actor);
    notify_viewing_terms_decision($property, $pending, 'approved', 'Approved with the listing.');
}

/**
 * Reject the property's pending change, with the reviewer's reason, while
 * rejecting the listing itself.
 */
function reject_pending_change_on_property_rejection(array $property, array $actor, string $reason): void
{
    $pending = pending_viewing_fee_change((string)$property['id']);
    if ($pending === null) {
        return;
    }
    $reason = $reason !== '' ? $reason : 'The listing needs changes before it can be approved.';
    db_exec(
        "UPDATE property_viewing_fee_changes
            SET status = 'rejected', decision_note = :note, reviewed_by = :by,
                reviewed_at = :now, updated_at = :now
          WHERE id = :id",
        [
            ':note' => clean_text($reason, 500),
            ':by'   => (string)($actor['id'] ?? ''),
            ':now'  => db_now(),
            ':id'   => (string)$pending['id'],
        ]
    );
    db_exec(
        "UPDATE properties SET viewing_terms_state = 'rejected', updated_at = :now WHERE id = :id",
        [':now' => db_now(), ':id' => (string)$property['id']]
    );
    audit_log('property.viewing_terms_change_rejected', 'property', (string)$property['id'], [
        'changeId' => (string)$pending['id'],
        'via'      => 'listing_rejection',
    ], $actor);
}

/**
 * Task 03 update: the fee-policy facts the platform attaches to a viewing
 * request, so the viewing record itself says where the fee came from, who it is
 * paid to and whether it is payable after the viewing.
 */
function viewing_fee_policy_payload(array $property): array
{
    $policyOwner = listing_policy_owner($property);
    $isLandlordListing = $policyOwner === 'landlord';

    return [
        'source'              => $isLandlordListing ? 'platform_policy' : 'property',
        'policyType'          => $isLandlordListing ? COMMISSION_POLICY_LANDLORD : COMMISSION_POLICY_AGENT,
        'setBy'               => $isLandlordListing ? 'Goodlucks Homes' : 'The agent listing this property',
        'paidTo'              => $isLandlordListing ? 'Goodlucks Homes' : 'The agent named on this listing',
        'payableAfterViewing' => true,
        // The landlord never receives a viewing fee.
        'landlordShareGhs'    => $isLandlordListing ? 0.0 : null,
        'agentShareGhs'       => $isLandlordListing ? 0.0 : null,
    ];
}
