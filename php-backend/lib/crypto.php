<?php
/**
 * Goodlucks Homes - protection for identity-document numbers at rest
 *
 * Ghana Card numbers are sensitive personal data. They are never stored or
 * returned in plain text:
 *
 *   - ordinary API responses only ever contain a masked value;
 *   - the full number is stored only if the deployment supplies a key through
 *     the IDENTITY_DATA_KEY environment variable (or config.local.php). The key
 *     is never committed, never logged and never placed in the database;
 *   - without a key the full number is deliberately NOT retained. The platform
 *     keeps the masked value and asks the reviewer to work from the uploaded
 *     document instead. That fallback is honest: nothing here pretends to
 *     encrypt what it cannot encrypt.
 *
 * Cipher: AES-256-GCM (OpenSSL), random 96-bit IV per record, AAD binds the
 * payload to this application so a ciphertext cannot be replayed in another
 * context. Stored format: `v1:<base64(iv || tag || ciphertext)>`.
 *
 * This is application-level encryption at rest for two columns. It does NOT
 * encrypt the whole database, does not protect against a compromised server or
 * a database administrator with key access, and is not a substitute for
 * disk-level encryption. See docs/INCREMENT_D_REPORT.md §"Remaining concerns".
 */

declare(strict_types=1);

const IDENTITY_DATA_AAD = 'goodlucks.identity.number.v1';
const IDENTITY_DATA_CIPHER = 'aes-256-gcm';
const IDENTITY_DATA_VERSION = 'v1';

/**
 * The raw 32-byte key, or null when the deployment has not configured one.
 *
 * Accepted forms for IDENTITY_DATA_KEY:
 *   - base64 of exactly 32 bytes (preferred; `openssl rand -base64 32`);
 *   - 64 hex characters.
 * Anything else is treated as "not configured" rather than silently truncated,
 * so a mis-set key never produces weakly encrypted data.
 */
function identity_data_key(): ?string
{
    static $key = null;
    static $resolved = false;
    if ($resolved) {
        return $key;
    }
    $resolved = true;

    $raw = trim((string)cfg('IDENTITY_DATA_KEY', ''));
    if ($raw === '') {
        return $key = null;
    }

    if (preg_match('/^[a-f0-9]{64}$/i', $raw)) {
        $decoded = hex2bin($raw);
        return $key = ($decoded !== false && strlen($decoded) === 32) ? $decoded : null;
    }

    $decoded = base64_decode($raw, true);
    if ($decoded !== false && strlen($decoded) === 32) {
        return $key = $decoded;
    }

    gl_log('warning', 'IDENTITY_DATA_KEY is set but is not 32 bytes (base64 or hex); identity numbers will not be retained');

    return $key = null;
}

function identity_encryption_enabled(): bool
{
    return identity_data_key() !== null;
}

/**
 * Encrypt a sensitive value for storage.
 *
 * @return string|null ciphertext, or null when no key is configured (callers
 *                     must then store nothing and record that choice).
 */
function encrypt_sensitive(string $plaintext): ?string
{
    $key = identity_data_key();
    if ($key === null || $plaintext === '') {
        return null;
    }
    if (!function_exists('openssl_encrypt')) {
        return null;
    }

    $iv = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt(
        $plaintext,
        IDENTITY_DATA_CIPHER,
        $key,
        OPENSSL_RAW_DATA,
        $iv,
        $tag,
        IDENTITY_DATA_AAD,
        16
    );
    if ($ciphertext === false || strlen($tag) !== 16) {
        gl_log('error', 'Identity value could not be encrypted');
        return null;
    }

    return IDENTITY_DATA_VERSION . ':' . base64_encode($iv . $tag . $ciphertext);
}

/** Decrypt a stored value. Returns null when absent, malformed or unreadable. */
function decrypt_sensitive(?string $payload): ?string
{
    $key = identity_data_key();
    if ($key === null || !is_string($payload) || $payload === '') {
        return null;
    }
    $prefix = IDENTITY_DATA_VERSION . ':';
    if (!str_starts_with($payload, $prefix)) {
        return null;
    }
    $binary = base64_decode(substr($payload, strlen($prefix)), true);
    if ($binary === false || strlen($binary) < 29) {
        return null;
    }

    $iv = substr($binary, 0, 12);
    $tag = substr($binary, 12, 16);
    $ciphertext = substr($binary, 28);

    $plain = openssl_decrypt($ciphertext, IDENTITY_DATA_CIPHER, $key, OPENSSL_RAW_DATA, $iv, $tag, IDENTITY_DATA_AAD);

    return is_string($plain) && $plain !== '' ? $plain : null;
}

/**
 * Display form of an identity number.
 *
 * Separators are stripped, everything except the final four characters is
 * replaced with bullets, so "GHA-123456789-0" displays as a run of bullets
 * followed by "7890". The result can never be reversed into the real number.
 */
function mask_document_number(string $value): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }
    $compact = preg_replace('/[^A-Za-z0-9]/', '', $value) ?? '';
    if (strlen($compact) <= 4) {
        return str_repeat('•', 4);
    }

    return str_repeat('•', max(4, strlen($compact) - 4)) . substr($compact, -4);
}

/**
 * Keyed hash of an identity number, used only for duplicate detection.
 *
 * Returns null without a configured key: an unkeyed hash of a short,
 * low-entropy number is reversible by brute force and would be worse than
 * storing nothing.
 */
function hash_document_number(string $value): ?string
{
    $key = identity_data_key();
    if ($key === null) {
        return null;
    }
    $normalised = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $value) ?? '');
    if ($normalised === '') {
        return null;
    }

    return hash_hmac('sha256', 'goodlucks.identity.hash|' . $normalised, $key);
}
