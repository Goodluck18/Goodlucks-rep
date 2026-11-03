<?php
/**
 * Test helper: inspect what Increment D actually stored for one account.
 *
 * Used by tests/api.test.mjs to assert the properties that an HTTP response
 * cannot show: that the Ghana Card number is not sitting in the database in
 * plain text, that the encrypted column decrypts with the configured key, that
 * the uploaded file lives in the private store, and what the retention job does.
 *
 * It prints no identity number: only booleans, statuses and the masked value.
 *
 *   php tests/read-verification.php --email=a@example.com
 *   php tests/read-verification.php --email=a@example.com --backdate-retention=3
 */

require_once __DIR__ . '/../php-backend/config.php';

$options = getopt('', ['email:', 'backdate-retention::', 'expire-professional::']);

$email = strtolower(trim((string)($options['email'] ?? '')));
if ($email === '') {
    fwrite(STDERR, "Usage: php tests/read-verification.php --email=<address> [--backdate-retention=<days>]\n");
    exit(2);
}

$user = find_user_by_email($email);
if (!$user) {
    fwrite(STDERR, "No such user\n");
    exit(3);
}

$userId = (string)$user['id'];

if (isset($options['backdate-retention'])) {
    $days = max(1, (int)$options['backdate-retention']);
    db_exec(
        'UPDATE identity_verifications SET retention_purge_after = :at WHERE user_id = :uid',
        [':at' => gmdate('Y-m-d H:i:s', time() - $days * 86400), ':uid' => $userId]
    );
}

if (isset($options['expire-professional'])) {
    // Simulates time passing so the derived-expiry behaviour can be asserted
    // without waiting for a real licence to lapse.
    $days = max(1, (int)$options['expire-professional']);
    db_exec(
        'UPDATE professional_authorisations SET expiry_date = :date WHERE user_id = :uid',
        [':date' => gmdate('Y-m-d', time() - $days * 86400), ':uid' => $userId]
    );
}

$identity = find_identity_verification($userId);
$professional = find_professional_authorisation($userId);

$identityOut = null;
if ($identity) {
    $encrypted = $identity['document_number_encrypted'] ?? null;
    $decrypted = is_string($encrypted) && $encrypted !== '' ? decrypt_sensitive($encrypted) : null;
    $identityOut = [
        'status' => (string)$identity['status'],
        'masked' => (string)$identity['document_number_masked'],
        'retained' => (int)$identity['document_number_retained'] === 1,
        'encryptedPresent' => is_string($encrypted) && $encrypted !== '',
        // Shape only. The ciphertext must not look like the number at all.
        'encryptedPrefix' => is_string($encrypted) ? substr($encrypted, 0, 3) : '',
        'encryptedLooksLikePlainNumber' => is_string($encrypted)
            && preg_match('/^[A-Za-z0-9\-]{6,32}$/', $encrypted) === 1,
        'decryptsWithConfiguredKey' => $decrypted !== null,
        'retentionPurgeAfter' => (string)($identity['retention_purge_after'] ?? ''),
    ];
}

$professionalOut = null;
if ($professional) {
    $professionalOut = [
        'status' => (string)$professional['status'],
        'effectiveStatus' => effective_professional_status($professional),
        'licenceNumber' => (string)$professional['licence_number'],
        'registryChecked' => (int)$professional['registry_checked'] === 1,
        'expiryDate' => (string)($professional['expiry_date'] ?? ''),
    ];
}

$documents = [];
foreach (db_all('SELECT * FROM verification_documents WHERE user_id = :uid ORDER BY created_at ASC', [':uid' => $userId]) as $doc) {
    $meta = find_private_document((string)$doc['storage_id']);
    $path = is_array($meta) ? (string)($meta['path'] ?? '') : '';
    $documents[] = [
        'id' => (string)$doc['id'],
        'storageId' => (string)$doc['storage_id'],
        'scope' => (string)$doc['scope'],
        'kind' => (string)$doc['kind'],
        'deletedAt' => (string)($doc['deleted_at'] ?? ''),
        'fileExists' => $path !== '' && is_file($path),
        // Absolute path must never be inside the public uploads directory.
        'insidePublicUploads' => $path !== '' && str_starts_with($path, rtrim(UPLOAD_DIR, '/') . '/'),
    ];
}

echo json_encode([
    'user' => [
        'id' => $userId,
        'role' => (string)$user['role'],
        'capabilities' => [
            'reviewer' => (int)($user['can_review_verifications'] ?? 0) === 1,
            'documents' => (int)($user['can_access_identity_documents'] ?? 0) === 1,
        ],
    ],
    'encryptionConfigured' => identity_encryption_enabled(),
    'identity' => $identityOut,
    'professional' => $professionalOut,
    'documents' => $documents,
    'auditActions' => array_values(array_map(
        static fn(array $row): string => (string)$row['action'],
        db_all(
            'SELECT action FROM audit_logs WHERE entity_id IN (:uid, :uid2) OR actor_id = :uid3 ORDER BY created_at ASC',
            [':uid' => $userId, ':uid2' => $userId, ':uid3' => $userId]
        )
    )),
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
