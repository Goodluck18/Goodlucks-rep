<?php
/**
 * Test helper: an Agent/Landlord account with an APPROVED identity verification.
 *
 * Verification is mandatory before listing (Upgrade 2 correction), so every suite
 * that needs a provider able to submit properties has to start from an approved
 * account. Driving that through uploads + a reviewer decision in each suite would
 * add a lot of slow, repetitive HTTP work, so this seeds exactly the records the
 * review flow would have produced:
 *
 *   * an `identity_verifications` row in status `approved`, with the legal name
 *     and a masked Ghana Card number;
 *   * one identity document on file (an approval without a document is refused by
 *     the real flow, so the seed respects that rule);
 *   * for an agent, the agent profile activated with listing permission — which
 *     is what `record_verification_decision()` now does when it approves an
 *     identity.
 *
 * Nothing else is granted: no professional authorisation (Tier 2 is a real review
 * that tests exercise separately), no console capability, no administrator role.
 *
 *   php tests/approve-verification.php --email=agent@example.com
 *   php tests/approve-verification.php --email=landlord@example.com --documents=0
 */

require_once __DIR__ . '/../php-backend/config.php';

$options = getopt('', ['email:', 'documents::', 'activate-agent::']);

$email = (string)($options['email'] ?? '');
$withDocument = (string)($options['documents'] ?? '1') !== '0';
$activateAgent = (string)($options['activate-agent'] ?? '1') !== '0';

if ($email === '') {
    fwrite(STDERR, "Usage: php tests/approve-verification.php --email=<address> [--documents=1|0] [--activate-agent=1|0]\n");
    exit(2);
}

$user = find_user_by_email($email);
if ($user === null) {
    fwrite(STDERR, "No account with that email\n");
    exit(3);
}
if (!in_array((string)$user['role'], ['agent', 'landlord'], true)) {
    fwrite(STDERR, "Only an agent or landlord account carries an identity verification\n");
    exit(4);
}

$userId = (string)$user['id'];
$now = db_now();

// Classification is the first step of verification. A fixture that is approved
// has necessarily chosen Agent or Landlord, so the choice is recorded here too
// (the account keeps its existing role — no second account type is created).
if (trim((string)($user['provider_category'] ?? '')) === '') {
    db_exec('UPDATE users SET provider_category = :category, updated_at = :updated WHERE id = :uid', [
        ':category' => (string)$user['role'],
        ':updated'  => $now,
        ':uid'      => $userId,
    ]);
}
$legalName = trim((string)($user['official_name'] ?? '')) !== ''
    ? (string)$user['official_name']
    : (string)$user['name'];
$masked = 'GHA-' . str_repeat('*', 6) . '-*';

$existing = find_identity_verification($userId);
if ($existing === null) {
    db_exec(
        'INSERT INTO identity_verifications
            (id, user_id, subject_role, legal_name, document_type, document_number_masked,
             document_number_encrypted, document_number_retained, status, submitted_at,
             reviewed_at, decision_note, created_at, updated_at)
         VALUES (:id, :uid, :role, :legal, :dtype, :masked, NULL, 0, :status, :submitted,
                 :reviewed, :note, :created, :updated)',
        [
            ':id'        => new_id('ident'),
            ':uid'       => $userId,
            ':role'      => (string)$user['role'],
            ':legal'     => $legalName,
            ':dtype'     => 'ghana_card',
            ':masked'    => $masked,
            ':status'    => 'approved',
            ':submitted' => $now,
            ':reviewed'  => $now,
            ':note'      => 'Fixture: identity approved by the test helper.',
            ':created'   => $now,
            ':updated'   => $now,
        ]
    );
} else {
    db_exec(
        'UPDATE identity_verifications
            SET status = :status, legal_name = :legal, document_type = :dtype,
                document_number_masked = :masked, submitted_at = :submitted,
                reviewed_at = :reviewed, decision_note = :note, updated_at = :updated
          WHERE user_id = :uid',
        [
            ':status'    => 'approved',
            ':legal'     => $legalName,
            ':dtype'     => 'ghana_card',
            ':masked'    => $masked,
            ':submitted' => $now,
            ':reviewed'  => $now,
            ':note'      => 'Fixture: identity approved by the test helper.',
            ':updated'   => $now,
            ':uid'       => $userId,
        ]
    );
}

if ($withDocument && count_verification_documents($userId, 'identity') === 0) {
    db_exec(
        'INSERT INTO verification_documents
            (id, user_id, scope, kind, storage_id, mime_type, bytes, checksum_sha256,
             uploaded_by, review_status, created_at)
         VALUES (:id, :uid, :scope, :kind, :storage, :mime, :bytes, :checksum, :uploader, :review, :created)',
        [
            ':id'       => new_id('vdoc'),
            ':uid'      => $userId,
            ':scope'    => 'identity',
            ':kind'     => 'document_front',
            ':storage'  => 'fixture-' . new_id('store'),
            ':mime'     => 'image/png',
            ':bytes'    => 1024,
            ':checksum' => str_repeat('0', 64),
            ':uploader' => $userId,
            ':review'   => 'accepted',
            ':created'  => $now,
        ]
    );
}

// The same side effect an identity approval has for an agent account.
$activated = false;
if ((string)$user['role'] === 'agent' && $activateAgent) {
    $profile = find_agent_profile_by_user($userId);
    if ($profile !== null) {
        db_exec(
            'UPDATE agent_profiles
                SET account_status = :status, can_submit_listings = 1, updated_at = :updated
              WHERE user_id = :uid',
            [':status' => 'active', ':updated' => $now, ':uid' => $userId]
        );
        $activated = true;
    }
}

echo json_encode([
    'userId'         => $userId,
    'email'          => $email,
    'role'           => (string)$user['role'],
    'identityStatus' => 'approved',
    'agentActivated' => $activated,
]) . "\n";
