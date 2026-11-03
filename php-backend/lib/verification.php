<?php
/**
 * Goodlucks Homes - identity verification and professional authorisation
 * (Increment D)
 *
 * Two independent checks live here, and they must never be conflated:
 *
 *   1. IDENTITY  - "is this person who they say they are?" (agents, and
 *                  optionally landlords). A verified identity says nothing about
 *                  property ownership or authority.
 *   2. PROFESSIONAL AUTHORISATION - "may this agent lawfully carry out regulated
 *                  real-estate activity?" Separate row, separate status, separate
 *                  reviewer decision, separate history.
 *
 * Nothing is auto-approved. Uploading a document or typing a licence number moves
 * a record to `pending_review` and no further; a human reviewer holding the
 * reviewer capability must decide, and the decision is written to an append-only
 * history table and the audit log.
 *
 * There is no external registry integration. `registry_checked` is always 0 and
 * exists so a future integration cannot be faked by a submitted number.
 */

declare(strict_types=1);

/** Identity lifecycle. `not_submitted` is the default for everybody. */
const IDENTITY_STATUSES = [
    'not_submitted',
    'pending_review',
    'under_review',
    'approved',
    'rejected',
    'resubmission_required',
];

/** Professional-authorisation lifecycle (identity statuses plus `expired`). */
const PROFESSIONAL_STATUSES = [
    'not_submitted',
    'pending_review',
    'under_review',
    'approved',
    'rejected',
    'resubmission_required',
    'expired',
];

const VERIFICATION_SCOPES = ['identity', 'professional'];

/** Document types this platform can accept. Nothing else is offered in the UI. */
const IDENTITY_DOCUMENT_TYPES = [
    'ghana_card'      => 'Ghana Card',
    'passport'        => 'Passport',
    'drivers_licence' => "Driver's licence",
    'voter_id'        => 'Voter ID',
    'other'           => 'Other identity document',
];

/** Upload kinds and the scope they belong to. */
const VERIFICATION_DOCUMENT_KINDS = [
    'document_front' => ['scope' => 'identity',     'label' => 'Identity document (front)'],
    'document_back'  => ['scope' => 'identity',     'label' => 'Identity document (back)'],
    'licence'        => ['scope' => 'professional', 'label' => 'Licence / registration certificate'],
    'supporting'     => ['scope' => 'any',          'label' => 'Supporting document'],
];

const MAX_VERIFICATION_DOCUMENTS_PER_SCOPE = 6;

/** Default retention window after a final decision. Pending legal confirmation. */
function verification_retention_days(): int
{
    $days = (int)cfg('VERIFICATION_RETENTION_DAYS', 365);
    return $days > 0 ? $days : 365;
}

// ---------------------------------------------------------------------------
// Reviewer permissions (least privilege)
//
// Being an administrator is NOT enough. Two capabilities exist, both default 0:
//
//   can_review_verifications      - see the queue, masked personal data and decide
//   can_access_identity_documents - open the actual uploaded files / full number
//
// They are granted only from the server console (php-backend/grant_reviewer.php).
// No web endpoint can grant them, so a compromised admin session cannot widen its
// own access to identity documents.
// ---------------------------------------------------------------------------

function is_verification_reviewer(?array $user = null): bool
{
    $user = $user ?? auth_user();
    if ($user === null || (string)($user['role'] ?? '') !== 'admin') {
        return false;
    }
    return (int)($user['can_review_verifications'] ?? 0) === 1;
}

function can_access_identity_documents(?array $user = null): bool
{
    $user = $user ?? auth_user();
    if (!is_verification_reviewer($user)) {
        return false;
    }
    return (int)($user['can_access_identity_documents'] ?? 0) === 1;
}

function require_verification_reviewer(): array
{
    $user = require_auth(['admin']);
    if (!is_verification_reviewer($user)) {
        error_response(
            'You do not have the verification-reviewer capability. Ask a server administrator to grant it.',
            403
        );
    }
    return $user;
}

function require_identity_document_access(): array
{
    $user = require_verification_reviewer();
    if (!can_access_identity_documents($user)) {
        // 403 rather than 404: the reviewer already knows the queue exists, and
        // the message must not hint at what the document contains.
        error_response(
            'Reading identity documents requires the identity-document capability.',
            403
        );
    }
    return $user;
}

/** Capabilities as exposed to the signed-in staff member (their own only). */
function verification_capabilities(array $user): array
{
    return [
        'verificationReviewer' => is_verification_reviewer($user),
        'identityDocumentAccess' => can_access_identity_documents($user),
    ];
}

function set_reviewer_capabilities(string $userId, bool $reviewer, bool $documents): void
{
    // Document access without reviewer access would be meaningless; refuse the
    // combination instead of storing a capability that can never be used.
    if ($documents && !$reviewer) {
        throw new InvalidArgumentException('Document access requires the reviewer capability.');
    }

    db_exec(
        'UPDATE users SET can_review_verifications = :reviewer, can_access_identity_documents = :documents,
                          updated_at = :updated
          WHERE id = :id AND role = :role',
        [
            ':reviewer'  => $reviewer ? 1 : 0,
            ':documents' => $documents ? 1 : 0,
            ':updated'   => db_now(),
            ':id'        => $userId,
            ':role'      => 'admin',
        ]
    );
}

// ---------------------------------------------------------------------------
// Reading verification records
// ---------------------------------------------------------------------------

function find_identity_verification(string $userId): ?array
{
    if ($userId === '') {
        return null;
    }
    return db_one('SELECT * FROM identity_verifications WHERE user_id = :uid LIMIT 1', [':uid' => $userId]);
}

function find_professional_authorisation(string $userId): ?array
{
    if ($userId === '') {
        return null;
    }
    return db_one('SELECT * FROM professional_authorisations WHERE user_id = :uid LIMIT 1', [':uid' => $userId]);
}

/**
 * Stored status adjusted for an expiry date that has passed.
 *
 * Expiry is derived on read as well as settable by a reviewer, so an approved
 * licence that lapses is never shown as current just because nobody revisited it.
 */
function effective_professional_status(?array $row): string
{
    $status = (string)($row['status'] ?? 'not_submitted');
    if ($status !== 'approved') {
        return $status;
    }
    $expiry = (string)($row['expiry_date'] ?? '');
    if ($expiry !== '' && $expiry < gmdate('Y-m-d')) {
        return 'expired';
    }
    return 'approved';
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function find_verification_document(string $id, bool $includeDeleted = false): ?array
{
    if ($id === '') {
        return null;
    }
    $sql = 'SELECT * FROM verification_documents WHERE id = :id';
    if (!$includeDeleted) {
        $sql .= ' AND deleted_at IS NULL';
    }
    return db_one($sql . ' LIMIT 1', [':id' => $id]);
}

/** Active documents for a subject, newest last. */
function list_verification_documents(string $userId, ?string $scope = null): array
{
    $sql = 'SELECT * FROM verification_documents WHERE user_id = :uid AND deleted_at IS NULL';
    $params = [':uid' => $userId];
    if ($scope !== null && in_array($scope, VERIFICATION_SCOPES, true)) {
        $sql .= ' AND scope = :scope';
        $params[':scope'] = $scope;
    }
    return db_all($sql . ' ORDER BY created_at ASC', $params);
}

function count_verification_documents(string $userId, string $scope): int
{
    return (int)db_value(
        'SELECT COUNT(*) FROM verification_documents
          WHERE user_id = :uid AND scope = :scope AND deleted_at IS NULL',
        [':uid' => $userId, ':scope' => $scope]
    );
}

function create_verification_document(
    string $userId,
    string $scope,
    string $kind,
    array $stored,
    string $uploadedBy
): array {
    $id = new_id('vdoc');
    db_exec(
        'INSERT INTO verification_documents
            (id, user_id, scope, kind, storage_id, mime_type, bytes, checksum_sha256, uploaded_by, created_at)
         VALUES (:id, :uid, :scope, :kind, :storage, :mime, :bytes, :checksum, :uploaded_by, :created)',
        [
            ':id'          => $id,
            ':uid'         => $userId,
            ':scope'       => $scope,
            ':kind'        => $kind,
            ':storage'     => (string)$stored['id'],
            ':mime'        => (string)$stored['mimeType'],
            ':bytes'       => (int)$stored['bytes'],
            ':checksum'    => (string)($stored['checksum'] ?? ''),
            ':uploaded_by' => $uploadedBy,
            ':created'     => db_now(),
        ]
    );

    $row = find_verification_document($id);
    if (!$row) {
        throw new RuntimeException('The document record could not be created.');
    }
    return $row;
}

/** Mark a document deleted (row kept as an audit anchor) and remove the file. */
function delete_verification_document(array $document, string $reason, ?array $actor = null): void
{
    db_exec(
        'UPDATE verification_documents SET deleted_at = :deleted WHERE id = :id AND deleted_at IS NULL',
        [':deleted' => db_now(), ':id' => (string)$document['id']]
    );
    remove_private_document((string)$document['storage_id']);

    audit_log('document.deleted', 'verification_document', (string)$document['id'], [
        'kind'   => (string)$document['kind'],
        'scope'  => (string)$document['scope'],
        'reason' => $reason,
    ], $actor);
}

/** Owner or authorised reviewer? Everything else is denied. */
function user_can_read_verification_document(?array $user, array $document): bool
{
    if ($user === null) {
        return false;
    }
    if ((string)($document['user_id'] ?? '') === (string)($user['id'] ?? '')) {
        return true;
    }
    return can_access_identity_documents($user);
}

// ---------------------------------------------------------------------------
// Submissions
//
// Both submission handlers validate server-side, bind every document to the
// signed-in user, and stop at `pending_review`. Neither can set a status.
// ---------------------------------------------------------------------------

function submit_identity_verification(array $user, array $input, array $documentIds): array
{
    $errors = [];

    $legalName = clean_string($input['legalName'] ?? '', 200);
    if (mb_strlen($legalName) < 3) {
        $errors['legalName'] = 'Enter your full legal name as it appears on the document.';
    }

    $documentType = (string)($input['documentType'] ?? 'ghana_card');
    if (!isset(IDENTITY_DOCUMENT_TYPES[$documentType])) {
        $errors['documentType'] = 'Choose a supported document type.';
    }

    $rawNumber = trim((string)($input['documentNumber'] ?? ''));
    $compact = preg_replace('/[^A-Za-z0-9]/', '', $rawNumber) ?? '';
    if (strlen($compact) < 6 || strlen($compact) > 32) {
        $errors['documentNumber'] = 'Enter the document number exactly as printed (6–32 characters).';
    }

    $owned = verification_documents_for_submission($user, 'identity', $documentIds, $errors);
    if (!$owned) {
        $errors['documents'] = 'Upload at least one identity document for the reviewer to check.';
    }

    if ($errors) {
        error_response('Please correct the verification details.', 422, $errors);
    }

    // Nothing is retained in plain text. The full number is encrypted only when
    // the deployment configured a key; otherwise it is discarded here and the
    // reviewer works from the uploaded document.
    //
    // The value as typed (trimmed) is what the reviewer needs to compare against
    // the document, so that is what gets encrypted; the compact form is only used
    // for masking and duplicate hashing.
    $encrypted = encrypt_sensitive($rawNumber);
    $retained = $encrypted !== null;
    $masked = mask_document_number($compact);

    $existing = find_identity_verification((string)$user['id']);
    $now = db_now();

    if ($existing) {
        db_exec(
            'UPDATE identity_verifications
                SET subject_role = :role, legal_name = :legal, document_type = :dtype,
                    document_number_masked = :masked, document_number_encrypted = :encrypted,
                    document_number_retained = :retained, status = :status, submitted_at = :submitted,
                    reviewed_by = NULL, reviewed_at = NULL, decision_note = NULL,
                    retention_purge_after = NULL, updated_at = :updated
              WHERE user_id = :uid',
            [
                ':role'      => (string)$user['role'],
                ':legal'     => $legalName,
                ':dtype'     => $documentType,
                ':masked'    => $masked,
                ':encrypted' => $encrypted,
                ':retained'  => $retained ? 1 : 0,
                ':status'    => 'pending_review',
                ':submitted' => $now,
                ':updated'   => $now,
                ':uid'       => (string)$user['id'],
            ]
        );
    } else {
        db_exec(
            'INSERT INTO identity_verifications
                (id, user_id, subject_role, legal_name, document_type, document_number_masked,
                 document_number_encrypted, document_number_retained, status, submitted_at, created_at)
             VALUES (:id, :uid, :role, :legal, :dtype, :masked, :encrypted, :retained, :status, :submitted, :created)',
            [
                ':id'        => new_id('ident'),
                ':uid'       => (string)$user['id'],
                ':role'      => (string)$user['role'],
                ':legal'     => $legalName,
                ':dtype'     => $documentType,
                ':masked'    => $masked,
                ':encrypted' => $encrypted,
                ':retained'  => $retained ? 1 : 0,
                ':status'    => 'pending_review',
                ':submitted' => $now,
                ':created'   => $now,
            ]
        );
    }

    // The audit entry records the fact of submission, never the number.
    audit_log('verification.identity_submitted', 'identity_verification', (string)$user['id'], [
        'documentType'     => $documentType,
        'documents'        => count($owned),
        'numberRetained'   => $retained,
        'encryptionActive' => identity_encryption_enabled(),
        'subjectRole'      => (string)$user['role'],
    ]);

    return find_identity_verification((string)$user['id']) ?? [];
}

function submit_professional_authorisation(array $user, array $input, array $documentIds): array
{
    $errors = [];

    $licenceNumber = clean_string($input['licenceNumber'] ?? '', 120);
    if (mb_strlen($licenceNumber) < 3) {
        $errors['licenceNumber'] = 'Enter the licence or registration number.';
    }

    $issuingAuthority = clean_string($input['issuingAuthority'] ?? '', 200);
    if (mb_strlen($issuingAuthority) < 2) {
        $errors['issuingAuthority'] = 'Name the body that issued the licence or registration.';
    }

    $category = clean_string($input['licenceCategory'] ?? '', 120);

    $issueDate = valid_date_iso($input['issueDate'] ?? null);
    if (!empty($input['issueDate']) && $issueDate === null) {
        $errors['issueDate'] = 'Enter a valid issue date (YYYY-MM-DD).';
    }
    $expiryDate = valid_date_iso($input['expiryDate'] ?? null);
    if (!empty($input['expiryDate']) && $expiryDate === null) {
        $errors['expiryDate'] = 'Enter a valid expiry date (YYYY-MM-DD).';
    }
    if ($issueDate !== null && $expiryDate !== null && $expiryDate < $issueDate) {
        $errors['expiryDate'] = 'The expiry date cannot be before the issue date.';
    }

    $owned = verification_documents_for_submission($user, 'professional', $documentIds, $errors);

    if ($errors) {
        error_response('Please correct the authorisation details.', 422, $errors);
    }

    $existing = find_professional_authorisation((string)$user['id']);
    $now = db_now();
    $params = [
        ':licence'   => $licenceNumber,
        ':authority' => $issuingAuthority,
        ':category'  => $category,
        ':issue'     => $issueDate,
        ':expiry'    => $expiryDate,
        ':status'    => 'pending_review',
        ':registry'  => 0,
        ':submitted' => $now,
        ':updated'   => $now,
        ':uid'       => (string)$user['id'],
    ];

    if ($existing) {
        db_exec(
            'UPDATE professional_authorisations
                SET licence_number = :licence, issuing_authority = :authority, licence_category = :category,
                    issue_date = :issue, expiry_date = :expiry, status = :status, registry_checked = :registry,
                    submitted_at = :submitted, reviewed_by = NULL, reviewed_at = NULL,
                    decision_note = NULL, updated_at = :updated
              WHERE user_id = :uid',
            $params
        );
    } else {
        db_exec(
            'INSERT INTO professional_authorisations
                (id, user_id, licence_number, issuing_authority, licence_category, issue_date, expiry_date,
                 status, registry_checked, submitted_at, created_at)
             VALUES (:id, :uid, :licence, :authority, :category, :issue, :expiry, :status, :registry, :submitted, :created)',
            // The INSERT has no `updated_at` column: binding :updated here would
            // add a parameter the statement does not know about.
            array_diff_key($params, [':updated' => true]) + [':id' => new_id('profauth'), ':created' => $now]
        );
    }

    audit_log('verification.professional_submitted', 'professional_authorisation', (string)$user['id'], [
        'issuingAuthority' => $issuingAuthority,
        'hasExpiry'        => $expiryDate !== null,
        'documents'        => count($owned),
        // No registry was consulted; recorded so the audit cannot imply one.
        'registryChecked'  => false,
    ]);

    return find_professional_authorisation((string)$user['id']) ?? [];
}

/**
 * Resolve client-supplied document ids to rows this user owns in this scope.
 *
 * Unknown ids, another user's ids, and ids from the wrong scope are rejected
 * with a generic message so the endpoint cannot be used to probe for documents.
 */
function verification_documents_for_submission(array $user, string $scope, array $documentIds, array &$errors): array
{
    $ids = array_values(array_unique(array_filter(array_map(
        static fn($id): string => is_string($id) ? trim($id) : '',
        $documentIds
    ))));

    if (count($ids) > MAX_VERIFICATION_DOCUMENTS_PER_SCOPE) {
        $errors['documents'] = 'Attach at most ' . MAX_VERIFICATION_DOCUMENTS_PER_SCOPE . ' documents.';
        return [];
    }

    $owned = [];
    foreach ($ids as $id) {
        $row = find_verification_document($id);
        if (!$row
            || (string)$row['user_id'] !== (string)$user['id']
            || (string)$row['scope'] !== $scope
        ) {
            $errors['documents'] = 'One of the attached documents is not available. Upload it again.';
            return [];
        }
        $owned[] = $row;
    }

    return $owned;
}

// ---------------------------------------------------------------------------
// Reviewer decisions
// ---------------------------------------------------------------------------

/**
 * Allowed decision verb => resulting status.
 *
 * `start_review` is a deliberate "I have picked this up" step so a queue entry
 * does not sit in `pending_review` while it is actually being looked at.
 */
const VERIFICATION_DECISIONS = [
    'start_review'          => 'under_review',
    'approve'               => 'approved',
    'reject'                => 'rejected',
    'request_resubmission'  => 'resubmission_required',
    'mark_expired'          => 'expired',
];

function record_verification_decision(
    string $userId,
    string $scope,
    string $decision,
    string $note,
    array $reviewer
): array {
    if (!in_array($scope, VERIFICATION_SCOPES, true)) {
        throw new InvalidArgumentException('Unknown verification scope.');
    }
    if (!isset(VERIFICATION_DECISIONS[$decision])) {
        throw new InvalidArgumentException('Unknown decision.');
    }
    if ($decision === 'mark_expired' && $scope !== 'professional') {
        throw new InvalidArgumentException('Only professional authorisation can expire.');
    }

    $note = clean_text($note, 1000);
    if (in_array($decision, ['reject', 'request_resubmission', 'mark_expired'], true) && $note === '') {
        // A rejection without a reason is useless to the agent and unreviewable
        // later, so it is refused rather than quietly stored.
        throw new InvalidArgumentException('Record a reason for this decision.');
    }

    $targetStatus = VERIFICATION_DECISIONS[$decision];
    $now = db_now();
    // Microsecond precision keeps the append-only history in true order.
    $decidedAt = db_now_precise();

    if ($scope === 'identity') {
        $row = find_identity_verification($userId);
        if (!$row) {
            throw new InvalidArgumentException('This account has not submitted identity verification.');
        }
        $fromStatus = (string)$row['status'];

        if ($decision === 'approve') {
            if (!in_array($fromStatus, ['pending_review', 'under_review'], true)) {
                throw new InvalidArgumentException('Only a submitted identity can be approved.');
            }
            if (count_verification_documents($userId, 'identity') === 0) {
                throw new InvalidArgumentException('An identity cannot be approved without at least one document on file.');
            }
        }
        if ($decision === 'start_review' && !in_array($fromStatus, ['pending_review', 'under_review', 'resubmission_required'], true)) {
            throw new InvalidArgumentException('This identity is not waiting for review.');
        }

        $purgeAfter = $targetStatus === 'approved'
            ? db_future(verification_retention_days() * 86400)
            : null;

        db_exec(
            'UPDATE identity_verifications
                SET status = :status, reviewed_by = :reviewer, reviewed_at = :reviewed,
                    decision_note = :note, retention_purge_after = :purge, updated_at = :updated
              WHERE user_id = :uid',
            [
                ':status'   => $targetStatus,
                ':reviewer' => (string)$reviewer['id'],
                ':reviewed' => $now,
                ':note'     => $note !== '' ? $note : null,
                ':purge'    => $purgeAfter,
                ':updated'  => $now,
                ':uid'      => $userId,
            ]
        );
    } else {
        $row = find_professional_authorisation($userId);
        if (!$row) {
            throw new InvalidArgumentException('This account has not submitted a professional authorisation.');
        }
        $fromStatus = effective_professional_status($row);

        if ($decision === 'approve' && !in_array($fromStatus, ['pending_review', 'under_review'], true)) {
            throw new InvalidArgumentException('Only a submitted authorisation can be approved.');
        }
        if ($decision === 'approve') {
            $expiry = (string)($row['expiry_date'] ?? '');
            if ($expiry !== '' && $expiry < gmdate('Y-m-d')) {
                // Approving something already out of date would put a current
                // "authorised" badge on a lapsed licence.
                throw new InvalidArgumentException(
                    'This authorisation expired on ' . $expiry . '. Reject it or ask for a current document.'
                );
            }
        }
        if ($decision === 'mark_expired' && !in_array($fromStatus, ['approved', 'expired'], true)) {
            throw new InvalidArgumentException('Only an approved authorisation can be marked expired.');
        }
        if ($decision === 'start_review' && !in_array($fromStatus, ['pending_review', 'under_review', 'resubmission_required'], true)) {
            throw new InvalidArgumentException('This authorisation is not waiting for review.');
        }

        db_exec(
            'UPDATE professional_authorisations
                SET status = :status, reviewed_by = :reviewer, reviewed_at = :reviewed,
                    decision_note = :note, updated_at = :updated
              WHERE user_id = :uid',
            [
                ':status'   => $targetStatus,
                ':reviewer' => (string)$reviewer['id'],
                ':reviewed' => $now,
                ':note'     => $note !== '' ? $note : null,
                ':updated'  => $now,
                ':uid'      => $userId,
            ]
        );
    }

    // Append-only history. There is no UPDATE or DELETE for this table anywhere
    // in the application, so an earlier decision cannot be rewritten.
    db_exec(
        'INSERT INTO verification_decisions
            (id, user_id, scope, decision, from_status, to_status, note, reviewer_id, reviewer_name, decided_at)
         VALUES (:id, :uid, :scope, :decision, :from, :to, :note, :reviewer, :reviewer_name, :decided)',
        [
            ':id'            => new_id('vdec'),
            ':uid'           => $userId,
            ':scope'         => $scope,
            ':decision'      => $decision,
            ':from'          => $fromStatus,
            ':to'            => $targetStatus,
            ':note'          => $note !== '' ? $note : null,
            ':reviewer'      => (string)$reviewer['id'],
            ':reviewer_name' => clean_string($reviewer['name'] ?? '', 200),
            ':decided'       => $decidedAt,
        ]
    );

    audit_log(
        $scope === 'identity' ? 'verification.identity_decided' : 'verification.professional_decided',
        $scope === 'identity' ? 'identity_verification' : 'professional_authorisation',
        $userId,
        [
            'decision'   => $decision,
            'fromStatus' => $fromStatus,
            'toStatus'   => $targetStatus,
            'note'       => $note,
            // No identity number, document content or file path is recorded.
            'registryChecked' => false,
        ]
    );

    $fresh = $scope === 'identity'
        ? find_identity_verification($userId)
        : find_professional_authorisation($userId);

    return $fresh ?? [];
}

function verification_history(string $userId, ?string $scope = null): array
{
    $sql = 'SELECT * FROM verification_decisions WHERE user_id = :uid';
    $params = [':uid' => $userId];
    if ($scope !== null && in_array($scope, VERIFICATION_SCOPES, true)) {
        $sql .= ' AND scope = :scope';
        $params[':scope'] = $scope;
    }

    $rows = db_all($sql . ' ORDER BY decided_at ASC, id ASC' . db_limit_clause(100, 0), $params);

    return array_map(static fn(array $row): array => [
        'id'           => (string)$row['id'],
        'scope'        => (string)$row['scope'],
        'decision'     => (string)$row['decision'],
        'fromStatus'   => (string)$row['from_status'],
        'toStatus'     => (string)$row['to_status'],
        'note'         => (string)($row['note'] ?? ''),
        'reviewerName' => (string)($row['reviewer_name'] ?? ''),
        'decidedAt'    => to_iso($row['decided_at'] ?? null),
    ], $rows);
}

// ---------------------------------------------------------------------------
// Shapes (what the API may say)
// ---------------------------------------------------------------------------

/**
 * Identity verification as seen by its owner, or by a reviewer.
 *
 * `$includeFullNumber` is only ever true for a reviewer holding the
 * document-access capability; the encrypted column itself is never serialised.
 */
function shape_identity_verification(?array $row, bool $includeFullNumber = false, ?string $userId = null): array
{
    $status = (string)($row['status'] ?? 'not_submitted');
    $full = null;
    if ($includeFullNumber && $row) {
        $full = decrypt_sensitive($row['document_number_encrypted'] ?? null);
    }

    return [
        'scope'        => 'identity',
        'status'       => $status,
        'legalName'    => (string)($row['legal_name'] ?? ''),
        'documentType' => (string)($row['document_type'] ?? ''),
        'documentTypeLabel' => IDENTITY_DOCUMENT_TYPES[(string)($row['document_type'] ?? '')] ?? 'Identity document',
        'documentNumberMasked' => (string)($row['document_number_masked'] ?? ''),
        // Present only for the narrow reviewer case above. Otherwise null, and
        // `numberRetained` explains whether the server still holds it at all.
        'documentNumber' => $full,
        'numberRetained' => (bool)($row['document_number_retained'] ?? false),
        'submittedAt'  => to_iso($row['submitted_at'] ?? null),
        'reviewedAt'   => to_iso($row['reviewed_at'] ?? null),
        'decisionNote' => (string)($row['decision_note'] ?? ''),
        'retentionPurgeAfter' => to_iso($row['retention_purge_after'] ?? null),
        'userId'       => $userId ?? (string)($row['user_id'] ?? ''),
        // Explicit: identity verification is not ownership or authority.
        'establishesOwnership' => false,
    ];
}

function shape_professional_authorisation(?array $row, bool $includeFullNumber = false, ?string $userId = null): array
{
    $stored = (string)($row['status'] ?? 'not_submitted');
    $effective = effective_professional_status($row);
    $licence = (string)($row['licence_number'] ?? '');

    return [
        'scope'        => 'professional',
        'status'       => $effective,
        'storedStatus' => $stored,
        'expired'      => $effective === 'expired',
        'licenceNumber'       => $includeFullNumber ? $licence : null,
        'licenceNumberMasked' => mask_document_number($licence),
        'issuingAuthority'    => (string)($row['issuing_authority'] ?? ''),
        'licenceCategory'     => (string)($row['licence_category'] ?? ''),
        'issueDate'    => (string)($row['issue_date'] ?? ''),
        'expiryDate'   => (string)($row['expiry_date'] ?? ''),
        'submittedAt'  => to_iso($row['submitted_at'] ?? null),
        'reviewedAt'   => to_iso($row['reviewed_at'] ?? null),
        'decisionNote' => (string)($row['decision_note'] ?? ''),
        // There is no external registry integration, so this is always false.
        'registryChecked' => (bool)($row['registry_checked'] ?? false),
        // A submitted number is never itself a licence.
        'establishesLegalAuthorisation' => false,
        'userId'       => $userId ?? (string)($row['user_id'] ?? ''),
    ];
}

function shape_verification_document(array $row, bool $canDownload): array
{
    return [
        'id'        => (string)$row['id'],
        'scope'     => (string)$row['scope'],
        'kind'      => (string)$row['kind'],
        'kindLabel' => VERIFICATION_DOCUMENT_KINDS[(string)$row['kind']]['label'] ?? 'Document',
        'mimeType'  => (string)$row['mime_type'],
        'bytes'     => (int)$row['bytes'],
        'uploadedAt'=> to_iso($row['created_at'] ?? null),
        // The original filename is deliberately not stored or echoed.
        'downloadUrl' => $canDownload ? '/api/verification-documents/' . (string)$row['id'] : null,
    ];
}

/** Everything a subject sees about their own verification. */
function verification_summary_for_user(array $user): array
{
    $userId = (string)$user['id'];
    $identityRow = find_identity_verification($userId);
    $professionalRow = find_professional_authorisation($userId);

    $identityDocs = array_map(
        static fn(array $doc): array => shape_verification_document($doc, true),
        list_verification_documents($userId, 'identity')
    );
    $professionalDocs = array_map(
        static fn(array $doc): array => shape_verification_document($doc, true),
        list_verification_documents($userId, 'professional')
    );

    $identity = shape_identity_verification($identityRow, false, $userId);
    $identity['documents'] = $identityDocs;

    $isAgent = (string)$user['role'] === 'agent';
    $professional = null;
    if ($isAgent) {
        $professional = shape_professional_authorisation($professionalRow, true, $userId);
        $professional['documents'] = $professionalDocs;
    }

    return [
        'identity'     => $identity,
        'professional' => $professional,
        // The two are independent by design; restated so the client cannot
        // collapse them into one "verified" flag.
        'identityVerified' => $identity['status'] === 'approved',
        'professionallyAuthorised' => $professional !== null && $professional['status'] === 'approved',
        'encryptionActive' => identity_encryption_enabled(),
        'retentionDays'    => verification_retention_days(),
        // Increment E: the agent tier this verification record supports. It is
        // derived on every read (never stored), is shown to the agent as an
        // eligibility label, and by itself activates no financial arrangement.
        'agentTier'        => $isAgent ? agent_tier_state($userId) : null,
        'documentTypes'    => array_map(
            static fn(string $key, string $label): array => ['value' => $key, 'label' => $label],
            array_keys(IDENTITY_DOCUMENT_TYPES),
            array_values(IDENTITY_DOCUMENT_TYPES)
        ),
        'documentKinds' => [
            ['value' => 'document_front', 'label' => VERIFICATION_DOCUMENT_KINDS['document_front']['label']],
            ['value' => 'document_back', 'label' => VERIFICATION_DOCUMENT_KINDS['document_back']['label']],
            ['value' => 'licence', 'label' => VERIFICATION_DOCUMENT_KINDS['licence']['label']],
            ['value' => 'supporting', 'label' => VERIFICATION_DOCUMENT_KINDS['supporting']['label']],
        ],
    ];
}

// ---------------------------------------------------------------------------
// Reviewer queue
// ---------------------------------------------------------------------------

/**
 * One row per subject with either verification record, for the review queue.
 *
 * Never includes identity numbers, document names or file paths.
 */
function verification_queue(?string $statusFilter = null, ?string $scopeFilter = null): array
{
    $rows = db_all(
        "SELECT u.id AS user_id, u.name, u.email, u.phone, u.role,
                ap.agency_name, ap.operating_city, ap.account_status AS agent_account_status,
                iv.status AS identity_status, iv.submitted_at AS identity_submitted_at,
                iv.reviewed_at AS identity_reviewed_at,
                pa.status AS professional_status, pa.expiry_date AS professional_expiry,
                pa.submitted_at AS professional_submitted_at,
                pa.reviewed_at AS professional_reviewed_at,
                (SELECT COUNT(*) FROM verification_documents d
                  WHERE d.user_id = u.id AND d.deleted_at IS NULL AND d.scope = 'identity') AS identity_documents,
                (SELECT COUNT(*) FROM verification_documents d
                  WHERE d.user_id = u.id AND d.deleted_at IS NULL AND d.scope = 'professional') AS professional_documents
           FROM users u
           LEFT JOIN identity_verifications iv ON iv.user_id = u.id
           LEFT JOIN professional_authorisations pa ON pa.user_id = u.id
           LEFT JOIN agent_profiles ap ON ap.user_id = u.id
          WHERE (iv.id IS NOT NULL OR pa.id IS NOT NULL)
          ORDER BY u.name ASC" . db_limit_clause(200, 0)
    );

    $items = [];
    foreach ($rows as $row) {
        $identityStatus = (string)($row['identity_status'] ?? 'not_submitted');
        $professionalStatus = effective_professional_status([
            'status'      => $row['professional_status'] ?? 'not_submitted',
            'expiry_date' => $row['professional_expiry'] ?? null,
        ]);

        if ($statusFilter !== null && $statusFilter !== ''
            && $statusFilter !== $identityStatus && $statusFilter !== $professionalStatus) {
            continue;
        }
        if ($scopeFilter === 'identity' && ($row['identity_status'] ?? null) === null) {
            continue;
        }
        if ($scopeFilter === 'professional' && ($row['professional_status'] ?? null) === null) {
            continue;
        }

        $items[] = [
            'userId'      => (string)$row['user_id'],
            'name'        => (string)$row['name'],
            'email'       => (string)$row['email'],
            'phone'       => (string)($row['phone'] ?? ''),
            'role'        => (string)$row['role'],
            'agencyName'  => (string)($row['agency_name'] ?? ''),
            'operatingCity' => (string)($row['operating_city'] ?? ''),
            'agentAccountStatus' => (string)($row['agent_account_status'] ?? ''),
            'identity' => [
                'status'      => $identityStatus,
                'submittedAt' => to_iso($row['identity_submitted_at'] ?? null),
                'reviewedAt'  => to_iso($row['identity_reviewed_at'] ?? null),
                'documentCount' => (int)($row['identity_documents'] ?? 0),
            ],
            'professional' => [
                'status'      => $professionalStatus,
                'expiryDate'  => (string)($row['professional_expiry'] ?? ''),
                'submittedAt' => to_iso($row['professional_submitted_at'] ?? null),
                'reviewedAt'  => to_iso($row['professional_reviewed_at'] ?? null),
                'documentCount' => (int)($row['professional_documents'] ?? 0),
            ],
        ];
    }

    return $items;
}

/** Full reviewer view of one subject. `$withDocuments` gates file access links. */
function verification_detail_for_reviewer(array $subject, bool $withDocuments): array
{
    $userId = (string)$subject['id'];
    $identityRow = find_identity_verification($userId);
    $professionalRow = find_professional_authorisation($userId);

    $identity = shape_identity_verification($identityRow, $withDocuments, $userId);
    $identity['documents'] = array_map(
        static fn(array $doc): array => shape_verification_document($doc, $withDocuments),
        list_verification_documents($userId, 'identity')
    );

    $professional = shape_professional_authorisation($professionalRow, $withDocuments, $userId);
    $professional['documents'] = array_map(
        static fn(array $doc): array => shape_verification_document($doc, $withDocuments),
        list_verification_documents($userId, 'professional')
    );

    return [
        'subject' => [
            'userId'   => $userId,
            'name'     => (string)($subject['name'] ?? ''),
            'email'    => (string)($subject['email'] ?? ''),
            'phone'    => (string)($subject['phone'] ?? ''),
            'role'     => (string)($subject['role'] ?? ''),
            'createdAt'=> to_iso($subject['created_at'] ?? null),
        ],
        'identity'     => $identity,
        'professional' => $professional,
        'history'      => verification_history($userId),
        // Landlord identity is never ownership; agents' identity is never a licence.
        'notes' => [
            'identityEstablishesOwnership' => false,
            'identityImpliesLicence'       => false,
            'registryIntegration'          => false,
        ],
        'capabilities' => [
            'identityDocumentAccess' => $withDocuments,
        ],
    ];
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/**
 * Delete personal data whose retention window has passed.
 *
 * Removes uploaded files, the encrypted number, the masked number and the
 * legal-name copy held on the verification row. The decision history, the
 * resulting status and the audit trail stay, so the platform can still explain
 * *that* a check happened without keeping the document.
 *
 * Licence certificates follow the same window, measured from the final
 * decision; their decision note (the reviewer's reasoning) is kept because it is
 * staff reasoning rather than the applicant's personal data.
 *
 * @return array{scanned:int, purged:int, documents:int, professionalScanned:int, professionalPurged:int, professionalDocuments:int}
 */
function purge_expired_verification_data(bool $apply = false, int $limit = 0): array
{
    $now = db_now();
    $sql = 'SELECT * FROM identity_verifications
             WHERE retention_purge_after IS NOT NULL AND retention_purge_after <= :now
             ORDER BY retention_purge_after ASC';
    if ($limit > 0) {
        $sql .= db_limit_clause($limit, 0);
    }
    $rows = db_all($sql, [':now' => $now]);

    $scanned = count($rows);
    $purged = 0;
    $documents = 0;

    foreach ($rows as $row) {
        $userId = (string)$row['user_id'];
        $docs = list_verification_documents($userId, 'identity');
        $documents += count($docs);

        if (!$apply) {
            $purged++;
            continue;
        }

        foreach ($docs as $doc) {
            delete_verification_document($doc, 'retention_purge', ['id' => 'system', 'role' => 'system']);
        }

        db_exec(
            "UPDATE identity_verifications
                SET document_number_masked = '', document_number_encrypted = NULL,
                    document_number_retained = 0, legal_name = '', retention_purge_after = NULL,
                    updated_at = :updated
              WHERE user_id = :uid",
            [':updated' => $now, ':uid' => $userId]
        );

        audit_log('verification.purged', 'identity_verification', $userId, [
            'reason'    => 'retention_window_elapsed',
            'documents' => count($docs),
            'retentionDays' => verification_retention_days(),
        ], ['id' => 'system', 'role' => 'system']);

        $purged++;
    }

    // Professional certificates: same window, derived from the final decision so
    // no extra column is needed on professional_authorisations.
    $retentionDays = verification_retention_days();
    $cutoff = gmdate('Y-m-d H:i:s', time() - ($retentionDays * 86400));
    $professionalSql = "SELECT * FROM professional_authorisations
                         WHERE status IN ('approved', 'rejected', 'expired')
                           AND reviewed_at IS NOT NULL
                           AND reviewed_at <= :cutoff";
    if ($limit > 0) {
        $professionalSql .= db_limit_clause($limit, 0);
    }
    $professionalRows = db_all($professionalSql, [':cutoff' => $cutoff]);
    $professionalScanned = count($professionalRows);
    $professionalPurged = 0;
    $professionalDocuments = 0;

    foreach ($professionalRows as $row) {
        $userId = (string)$row['user_id'];
        $docs = list_verification_documents($userId, 'professional');
        if (!$apply) {
            $professionalDocuments += count($docs);
            $professionalPurged++;
            continue;
        }
        if (count($docs) === 0) {
            continue;
        }
        foreach ($docs as $doc) {
            delete_verification_document($doc, 'retention_purge', ['id' => 'system', 'role' => 'system']);
        }
        $professionalDocuments += count($docs);
        audit_log('verification.professional_purged', 'professional_authorisation', $userId, [
            'reason'          => 'retention_window_elapsed',
            'documents'       => count($docs),
            'retentionDays'   => $retentionDays,
        ], ['id' => 'system', 'role' => 'system']);
        $professionalPurged++;
    }

    return [
        'scanned'             => $scanned,
        'purged'              => $purged,
        'documents'           => $documents,
        'professionalScanned' => $professionalScanned,
        'professionalPurged'  => $professionalPurged,
        'professionalDocuments' => $professionalDocuments,
    ];
}
