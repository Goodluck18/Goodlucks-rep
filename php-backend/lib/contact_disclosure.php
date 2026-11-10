<?php
declare(strict_types=1);

/**
 * Goodlucks Homes — controlled tenant-contact disclosure (Upgrade 2, Phase 5: B6)
 *
 * A tenant's phone number and email address are private. Phase 1 stopped every
 * non-staff viewer from receiving them; this file adds the *approved* path, and
 * nothing else can open that door.
 *
 * The chain, in the order it happens:
 *
 *   1. an agent or landlord, on a viewing they are responsible for, asks for the
 *      tenant's contact with a written reason;
 *   2. the request is queued for staff — the tenant's details stay withheld;
 *   3. an administrator approves (with a note) or refuses (with a reason);
 *   4. approval reveals the details to THAT provider on THAT viewing only, and
 *      says when it was approved and when it expires;
 *   5. either side can end it: staff revoke, the request expires;
 *   6. every step is written to `audit_logs`, and the tenant is notified when
 *      their details are shared, so they always know who received them.
 *
 * Approval is per (viewing, provider): approving one agent never opens the
 * tenant's number to another provider, and a new viewing needs its own request.
 */

/** How long an approval stays open before it expires on its own. */
const CONTACT_DISCLOSURE_VALID_DAYS = 30;

const CONTACT_DISCLOSURE_STATES = ['pending', 'approved', 'rejected', 'revoked'];

/** Who is the provider responsible for this viewing, if any. */
function contact_disclosure_provider_id(array $viewing): string
{
    $agentId = (string)($viewing['agentUserId'] ?? '');
    if ($agentId !== '') {
        return $agentId;
    }

    $propertyId = (string)($viewing['propertyId'] ?? '');
    if ($propertyId === '') {
        return '';
    }
    $property = find_property($propertyId);

    // Upgrade 2 (C1): an independent agent listing has no landlord account, so
    // the responsible provider is the agent who submitted it.
    return $property ? property_provider_user_id($property) : '';
}

/** Stored row → shaped disclosure, with the effective state (expiry applied). */
function shape_contact_disclosure(array $row): array
{
    $stored = (string)($row['status'] ?? 'pending');
    $expiresAt = (string)($row['expires_at'] ?? '');
    $expired = $stored === 'approved' && $expiresAt !== '' && $expiresAt < db_now();
    $state = $expired ? 'expired' : $stored;

    $labels = [
        'pending'  => 'Awaiting staff review',
        'approved' => 'Approved',
        'rejected' => 'Refused',
        'revoked'  => 'Revoked',
        'expired'  => 'Expired',
    ];

    return [
        'id'             => (string)$row['id'],
        'viewingId'      => (string)($row['viewing_id'] ?? ''),
        'propertyId'     => (string)($row['property_id'] ?? ''),
        'propertyTitle'  => (string)($row['property_title'] ?? ''),
        'providerUserId' => (string)($row['provider_user_id'] ?? ''),
        'providerName'   => (string)($row['provider_name'] ?? ''),
        'tenantUserId'   => (string)($row['tenant_user_id'] ?? ''),
        'tenantName'     => (string)($row['tenant_name'] ?? ''),
        'requestedBy'    => (string)($row['requested_by'] ?? ''),
        'reason'         => (string)($row['reason'] ?? ''),
        'status'         => $state,
        'storedStatus'   => $stored,
        'statusLabel'    => $labels[$state] ?? ucfirst($state),
        'active'         => $state === 'approved',
        'decidedBy'      => (string)($row['decided_by'] ?? ''),
        'decidedAt'      => to_iso($row['decided_at'] ?? null),
        'decisionNote'   => (string)($row['decision_note'] ?? ''),
        'expiresAt'      => to_iso($row['expires_at'] ?? null),
        'requestedAt'    => to_iso($row['created_at'] ?? null),
        'updatedAt'      => to_iso($row['updated_at'] ?? null),
    ];
}

function find_contact_disclosure(string $id): ?array
{
    $row = db_one('SELECT * FROM contact_disclosures WHERE id = :id', [':id' => $id]);

    return $row ? shape_contact_disclosure($row) : null;
}

/** The disclosure between one viewing and one provider, if it exists. */
function find_contact_disclosure_for(string $viewingId, string $providerUserId): ?array
{
    if ($viewingId === '' || $providerUserId === '') {
        return null;
    }
    $row = db_one(
        'SELECT * FROM contact_disclosures WHERE viewing_id = :v AND provider_user_id = :p',
        [':v' => $viewingId, ':p' => $providerUserId]
    );

    return $row ? shape_contact_disclosure($row) : null;
}

/**
 * Is there an approved, unexpired disclosure for this viewer on this viewing?
 *
 * Called from `viewing_tenant_contact_state()`, which is the single place that
 * decides whether contact details are serialised.
 */
function contact_disclosure_active_for(string $viewingId, string $viewerId): bool
{
    $disclosure = find_contact_disclosure_for($viewingId, $viewerId);

    return $disclosure !== null && $disclosure['active'] === true;
}

/**
 * The staff queue: every request, newest first, optionally filtered by status.
 *
 * Expiry is applied when shaping, so an approved-but-expired row is shown as
 * expired rather than quietly still open.
 */
function list_contact_disclosures(array $filters = []): array
{
    $sql = 'SELECT * FROM contact_disclosures WHERE 1 = 1';
    $params = [];
    $status = (string)($filters['status'] ?? '');
    if ($status !== '' && in_array($status, CONTACT_DISCLOSURE_STATES, true)) {
        $sql .= ' AND status = :status';
        $params[':status'] = $status;
    }
    $sql .= ' ORDER BY created_at DESC, id DESC' . db_limit_clause((int)($filters['limit'] ?? 200), 0);

    $rows = array_map('shape_contact_disclosure', db_all($sql, $params));

    return array_values(array_filter(
        $rows,
        static fn(array $row): bool => !isset($filters['status']) || $filters['status'] === '' || $row['status'] === $filters['status']
    ));
}

/** A provider's own disclosures (so their panel can show the state). */
function list_contact_disclosures_for_provider(string $providerUserId, string $viewingId = ''): array
{
    $sql = 'SELECT * FROM contact_disclosures WHERE provider_user_id = :p';
    $params = [':p' => $providerUserId];
    if ($viewingId !== '') {
        $sql .= ' AND viewing_id = :v';
        $params[':v'] = $viewingId;
    }
    $sql .= ' ORDER BY created_at DESC' . db_limit_clause(200, 0);

    return array_map('shape_contact_disclosure', db_all($sql, $params));
}

/** What a tenant has agreed to share — the record they are entitled to see. */
function list_contact_disclosures_for_tenant(string $tenantUserId): array
{
    return array_map('shape_contact_disclosure', db_all(
        'SELECT * FROM contact_disclosures WHERE tenant_user_id = :t ORDER BY created_at DESC' . db_limit_clause(200, 0),
        [':t' => $tenantUserId]
    ));
}

/**
 * Ask staff to release the tenant's contact to this provider for this viewing.
 *
 * Only the provider responsible for the viewing may ask, and only with a reason.
 * Asking twice while a request is open is a 409, not a silent duplicate.
 *
 * @throws InvalidArgumentException
 * @throws RuntimeException when a request is already open
 */
function request_contact_disclosure(array $viewing, array $actor, string $reason): array
{
    $viewingId = (string)($viewing['id'] ?? '');
    $providerId = (string)($actor['id'] ?? '');
    $reason = trim($reason);

    if ($reason === '') {
        throw new InvalidArgumentException('Say why you need the tenant\'s contact details.');
    }
    if (contact_disclosure_provider_id($viewing) !== $providerId) {
        throw new InvalidArgumentException('Only the provider responsible for this viewing can ask for the tenant\'s contact details.');
    }

    $existing = find_contact_disclosure_for($viewingId, $providerId);
    if ($existing !== null) {
        if (in_array($existing['status'], ['pending', 'approved'], true)) {
            throw new RuntimeException(
                $existing['status'] === 'pending'
                    ? 'A request for this viewing is already with Goodlucks staff.'
                    : 'Goodlucks has already approved contact for this viewing until ' . ($existing['expiresAt'] ?: 'further notice') . '.'
            );
        }
        // A refused, revoked or expired request may be asked again — the old row
        // is reused so there is exactly one live row per (viewing, provider).
        db_exec(
            'UPDATE contact_disclosures
                SET status = :status, reason = :reason, requested_by = :by,
                    decided_by = NULL, decided_at = NULL, decision_note = NULL,
                    expires_at = NULL, updated_at = :updated
              WHERE id = :id',
            [
                ':status'  => 'pending',
                ':reason'  => clean_text($reason, 500),
                ':by'      => $providerId,
                ':updated' => db_now(),
                ':id'      => $existing['id'],
            ]
        );
        audit_log('contact_disclosure.requested', 'contact_disclosure', $existing['id'], [
            'viewingId' => $viewingId,
            'reason'    => 'Re-requested after ' . $existing['status'],
        ], $actor);

        return find_contact_disclosure($existing['id']) ?? [];
    }

    $id = new_id('cd');
    $propertyId = (string)($viewing['propertyId'] ?? '');
    $property = $propertyId !== '' ? find_property($propertyId) : null;

    db_exec(
        'INSERT INTO contact_disclosures
            (id, viewing_id, property_id, property_title, provider_user_id, provider_name,
             tenant_user_id, tenant_name, requested_by, reason, status, created_at, updated_at)
         VALUES
            (:id, :viewing, :property, :title, :provider, :provider_name,
             :tenant_user, :tenant_name, :requested_by, :reason, :status, :created, :updated)',
        [
            ':id'            => $id,
            ':viewing'       => $viewingId,
            ':property'      => $propertyId !== '' ? $propertyId : null,
            ':title'         => (string)($viewing['propertyTitle'] ?? ''),
            ':provider'      => $providerId,
            ':provider_name' => (string)($actor['name'] ?? ''),
            ':tenant_user'   => ((string)($viewing['tenantUserId'] ?? '')) !== '' ? (string)$viewing['tenantUserId'] : null,
            ':tenant_name'   => (string)($viewing['tenantName'] ?? ''),
            ':requested_by'  => $providerId,
            ':reason'        => clean_text($reason, 500),
            ':status'        => 'pending',
            ':created'       => db_now(),
            ':updated'       => db_now(),
        ]
    );

    audit_log('contact_disclosure.requested', 'contact_disclosure', $id, [
        'viewingId'  => $viewingId,
        'propertyId' => $propertyId,
        'tenantName' => (string)($viewing['tenantName'] ?? ''),
    ], $actor);

    // The viewing desk is told, not the tenant: nothing has been shared yet.
    $desk = trim((string)OFFICIAL_EMAIL);
    if ($desk !== '') {
        send_email(
            $desk,
            'Goodlucks viewing desk',
            'Contact disclosure requested - ' . (string)($viewing['propertyTitle'] ?? 'a viewing'),
            email_html_template(
                'Contact disclosure requested',
                '<p style="color:#CBD5E1;font-size:14px;">'
                . e((string)($actor['name'] ?? 'A provider')) . ' asked to contact the tenant for '
                . e((string)($viewing['propertyTitle'] ?? 'a viewing')) . '.</p>'
                . '<p style="color:#94A3B8;font-size:13px;">Reason: ' . e($reason) . '</p>'
                . '<p style="color:#94A3B8;font-size:13px;">Nothing has been shared. Approve or refuse it in '
                . 'Admin &rarr; Viewings &rarr; Contact requests.</p>'
            ),
            'contact_disclosure_request',
            'Contact disclosure requested'
        );
    }
    if ($property !== null) {
        // Kept for the audit trail only: the provider was already told.
        audit_log('contact_disclosure.property_linked', 'contact_disclosure', $id, [
            'propertyId' => (string)($property['id'] ?? ''),
        ]);
    }

    return find_contact_disclosure($id) ?? [];
}

/**
 * Staff decision. `approve` reveals the details to that provider on that
 * viewing; `reject` and `revoke` close the door again.
 *
 * @throws InvalidArgumentException
 * @throws RuntimeException when the decision does not fit the current state
 */
function decide_contact_disclosure(string $id, array $actor, string $decision, string $note): array
{
    $disclosure = find_contact_disclosure($id);
    if ($disclosure === null) {
        throw new InvalidArgumentException('Contact request not found.');
    }

    $decision = strtolower(trim($decision));
    if (!in_array($decision, ['approve', 'reject', 'revoke'], true)) {
        throw new InvalidArgumentException('Choose approve, reject or revoke.');
    }
    if (in_array($decision, ['reject', 'revoke'], true) && trim($note) === '') {
        throw new InvalidArgumentException($decision === 'reject'
            ? 'Give the provider a reason the request was refused.'
            : 'Say why the approved contact is being withdrawn.');
    }
    if ($decision === 'approve' && $disclosure['status'] !== 'pending') {
        throw new RuntimeException('This request is ' . strtolower($disclosure['statusLabel']) . '; only a pending request can be approved.');
    }
    if ($decision === 'reject' && $disclosure['status'] !== 'pending') {
        throw new RuntimeException('Only a pending request can be refused.');
    }
    if ($decision === 'revoke' && $disclosure['status'] !== 'approved') {
        throw new RuntimeException('Only an approved disclosure can be revoked.');
    }

    $status = $decision === 'approve' ? 'approved' : ($decision === 'reject' ? 'rejected' : 'revoked');
    $expiresAt = $decision === 'approve'
        ? gmdate('Y-m-d H:i:s', time() + CONTACT_DISCLOSURE_VALID_DAYS * 86400)
        : null;

    db_exec(
        'UPDATE contact_disclosures
            SET status = :status, decided_by = :by, decided_at = :at,
                decision_note = :note, expires_at = :expires, updated_at = :updated
          WHERE id = :id',
        [
            ':status'  => $status,
            ':by'      => (string)($actor['id'] ?? ''),
            ':at'      => db_now(),
            ':note'    => clean_text($note, 500),
            ':expires' => $expiresAt,
            ':updated' => db_now(),
            ':id'      => $id,
        ]
    );

    audit_log('contact_disclosure.' . $status, 'contact_disclosure', $id, [
        'viewingId'      => $disclosure['viewingId'],
        'providerUserId' => $disclosure['providerUserId'],
        'note'           => $note,
        'expiresAt'      => $expiresAt,
    ], $actor);

    // The provider learns the outcome.
    $provider = find_user_by_id($disclosure['providerUserId']);
    if ($provider) {
        $messages = [
            'approved' => 'Goodlucks approved sharing the tenant\'s contact details for ' . $disclosure['propertyTitle'] . '. They are on the viewing now.',
            'rejected' => 'Goodlucks refused the contact request for ' . $disclosure['propertyTitle'] . '. ' . $note,
            'revoked'  => 'Goodlucks withdrew the shared contact details for ' . $disclosure['propertyTitle'] . '. ' . $note,
        ];
        create_notification(
            (string)$provider['id'],
            'Contact request ' . $status,
            $messages[$status] ?? 'The contact request was updated.',
            $status === 'approved' ? 'success' : 'info'
        );
        send_email(
            (string)$provider['email'],
            (string)$provider['name'],
            'Contact request ' . $status . ' - Goodlucks Homes',
            email_html_template(
                'Contact request ' . $status,
                '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e((string)$provider['name']) . ',</p>'
                . '<p style="color:#CBD5E1;font-size:14px;">' . e($messages[$status] ?? '') . '</p>'
            ),
            'contact_disclosure_' . $status,
            'Contact request ' . $status
        );
    }

    // The tenant always learns when their details were shared, and with whom.
    if ($disclosure['tenantUserId'] !== '') {
        $tenantMessages = [
            'approved' => 'Goodlucks shared your phone number and email address with ' . ($disclosure['providerName'] ?: 'the provider') . ' for ' . $disclosure['propertyTitle'] . '. It stays available until ' . to_iso($expiresAt) . '.',
            'rejected' => 'A request for your contact details was refused.',
            'revoked'  => 'Your contact details are no longer shared for ' . $disclosure['propertyTitle'] . '.',
        ];
        create_notification(
            $disclosure['tenantUserId'],
            'Contact details ' . ($status === 'approved' ? 'shared' : 'not shared'),
            $tenantMessages[$status] ?? 'Your contact-detail request changed.',
            $status === 'approved' ? 'info' : 'info'
        );
    }

    return find_contact_disclosure($id) ?? [];
}
