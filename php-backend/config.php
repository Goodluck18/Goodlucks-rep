<?php
/**
 * Goodlucks Homes - Core configuration & bootstrap
 *
 * NO SECRETS ARE STORED IN THIS FILE.
 * Database credentials and API keys are read from (in order of precedence):
 *   1. Real environment variables (cPanel "Environment Variables" / SetEnv)
 *   2. php-backend/.env           (git-ignored, create from .env.example)
 *   3. php-backend/config.local.php  (git-ignored, returns an array)
 *
 * Drivers:
 *   - mysql  : production (cPanel / phpMyAdmin). This is the DEFAULT.
 *   - sqlite : local development & automated tests ONLY.
 *
 * The driver is only ever 'sqlite' when DB_DRIVER is explicitly set to sqlite.
 * There is no silent fallback: if MySQL is configured and unreachable we return
 * a 500 error and log the real reason server-side (never to the browser).
 */

declare(strict_types=1);

if (!defined('GOODLUCKS_BOOTSTRAPPED')) {
    define('GOODLUCKS_BOOTSTRAPPED', true);
}

define('GL_ROOT', __DIR__);

// ---------------------------------------------------------------------------
// Error handling: never leak stack traces / DB errors to visitors.
// ---------------------------------------------------------------------------
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('html_errors', '0');

$logDir = GL_ROOT . '/logs';
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}
@ini_set('error_log', $logDir . '/php-error.log');

// ---------------------------------------------------------------------------
// Tiny .env loader (KEY=VALUE, # comments, optional quotes)
// ---------------------------------------------------------------------------
function gl_load_env_file(string $path): void
{
    if (!is_file($path) || !is_readable($path)) {
        return;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (strlen($value) >= 2) {
            $first = $value[0];
            $last = substr($value, -1);
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $value = substr($value, 1, -1);
            }
        }
        if ($key !== '' && getenv($key) === false) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}

gl_load_env_file(GL_ROOT . '/.env');

/** Local override file may return an array of config values. */
$GL_LOCAL_CONFIG = [];
$localConfigPath = GL_ROOT . '/config.local.php';
if (is_file($localConfigPath)) {
    $loaded = require $localConfigPath;
    if (is_array($loaded)) {
        $GL_LOCAL_CONFIG = $loaded;
    }
}

/**
 * Read a configuration value (env var > config.local.php > default).
 */
function cfg(string $key, $default = null)
{
    global $GL_LOCAL_CONFIG;

    $value = getenv($key);
    if ($value !== false && $value !== '') {
        return $value;
    }
    if (isset($GL_LOCAL_CONFIG[$key]) && $GL_LOCAL_CONFIG[$key] !== '') {
        return $GL_LOCAL_CONFIG[$key];
    }
    return $default;
}

// ---------------------------------------------------------------------------
// Application constants (safe, non-secret)
// ---------------------------------------------------------------------------
define('OFFICIAL_EMAIL', (string)cfg('OFFICIAL_EMAIL', 'rentals@goodlucks.co'));
define('OFFICIAL_NAME', (string)cfg('OFFICIAL_NAME', 'Goodlucks Homes Intermediary'));
define('OFFICIAL_PHONE', (string)cfg('OFFICIAL_PHONE', '+233237690080'));
// Optional email-brand assets and official social profile destinations.
define('EMAIL_LOGO_URL', (string)cfg('EMAIL_LOGO_URL', ''));
define('SOCIAL_FACEBOOK_URL', (string)cfg('SOCIAL_FACEBOOK_URL', 'https://www.facebook.com/GoodlucksHomes'));
define('SOCIAL_INSTAGRAM_URL', (string)cfg('SOCIAL_INSTAGRAM_URL', 'https://www.instagram.com/GoodlucksHomes'));
define('SOCIAL_LINKEDIN_URL', (string)cfg('SOCIAL_LINKEDIN_URL', 'https://www.linkedin.com/company/GoodlucksHomes'));
define('SOCIAL_X_URL', (string)cfg('SOCIAL_X_URL', 'https://x.com/GoodlucksHomes'));
define('SOCIAL_TIKTOK_URL', (string)cfg('SOCIAL_TIKTOK_URL', 'https://www.tiktok.com/@GoodlucksHomes'));
define('SITE_URL', rtrim((string)cfg('APP_URL', 'https://goodlucks.co'), '/'));

define('DB_DRIVER', strtolower((string)cfg('DB_DRIVER', 'mysql')));
define('DB_HOST', (string)cfg('DB_HOST', 'localhost'));
define('DB_NAME', (string)cfg('DB_NAME', ''));
define('DB_USER', (string)cfg('DB_USER', ''));
define('DB_PASS', (string)cfg('DB_PASS', ''));
define('DB_CHARSET', (string)cfg('DB_CHARSET', 'utf8mb4'));

/** Absolute path of the SQLite file used when DB_DRIVER=sqlite. */
define('DB_SQLITE_PATH', (string)cfg('DB_SQLITE_PATH', GL_ROOT . '/local-dev.sqlite'));
/** Absolute path of the SQLite schema used for local development/tests. */
define('DB_SQLITE_SCHEMA', GL_ROOT . '/schema.sqlite.sql');

define('UPLOAD_DIR', (string)cfg('UPLOAD_DIR', GL_ROOT . '/uploads'));
define('UPLOAD_MAX_BYTES', (int)cfg('UPLOAD_MAX_BYTES', 8 * 1024 * 1024)); // 8 MB
define('UPLOAD_URL_PATH', (string)cfg('UPLOAD_URL_PATH', '/api/uploads'));

/**
 * Private document store: identity documents and other personal data live
 * here, outside the publicly served uploads directory, and are only ever
 * streamed through an authenticated endpoint (see lib/private_storage.php).
 */
define('PRIVATE_UPLOAD_DIR', (string)cfg('PRIVATE_UPLOAD_DIR', GL_ROOT . '/storage/private'));

/**
 * Identity documents are capped lower than property photos: a legible scan or
 * photo of a card is well under this, and the smaller the upload the smaller the
 * data-protection surface.
 */
define('IDENTITY_DOCUMENT_MAX_BYTES', (int)cfg('IDENTITY_DOCUMENT_MAX_BYTES', 5 * 1024 * 1024)); // 5 MB

/**
 * Retention window for identity data after a FINAL decision (approved or
 * rejected). The retention job removes documents, the encrypted number and the
 * masked number once this elapses, keeping only the decision history.
 *
 * PENDING LEGAL CONFIRMATION: this is a conservative placeholder, not an agreed
 * Ghanaian Data Protection Act (Act 843) retention period. See
 * docs/INCREMENT_D_REPORT.md.
 */
define('VERIFICATION_RETENTION_DAYS', (int)cfg('VERIFICATION_RETENTION_DAYS', 365));

/**
 * Key used to encrypt identity-document numbers at rest (AES-256-GCM).
 *
 * Must be supplied by the deployment (environment variable or config.local.php):
 * a base64-encoded 32-byte key, or 64 hex characters. Generate one with
 * `openssl rand -base64 32`. Never commit it and never reuse another secret.
 *
 * When it is absent the platform does NOT retain the full document number at
 * all — only a masked value — rather than storing it in plain text.
 */
define('IDENTITY_DATA_KEY', (string)cfg('IDENTITY_DATA_KEY', ''));

define('SESSION_COOKIE', 'gl_session');
define('SESSION_TTL_SECONDS', (int)cfg('SESSION_TTL_SECONDS', 60 * 60 * 24 * 7)); // 7 days
// Task 03: there is NO hardcoded platform-wide viewing fee. Each AGENT property
// carries its own approved fee (`properties.viewing_fee_ghs`), and a property
// with none approved has no fee. A LANDLORD listing carries the administrator's
// general landlord viewing fee, which is stored in `platform_settings` and read
// with landlord_viewing_fee() — it is never a constant. The old `VIEWING_FEE_GHS` default of 100 was a figure no property
// had agreed to and has been removed; the constant is kept only as an explicitly
// configured, non-default escape hatch for legacy imports and reads as 0 unless
// somebody sets it on purpose.
define('VIEWING_FEE_GHS', (float)cfg('VIEWING_FEE_GHS', 0));

/**
 * Registrations accepted from one IP per hour. Kept as a config value so the
 * automated suite (which signs up many accounts from one loopback address) can
 * raise it without loosening the production default of 10.
 */
define('REGISTER_RATE_LIMIT_PER_HOUR', (int)cfg('REGISTER_RATE_LIMIT_PER_HOUR', 10));

/**
 * Viewing requests accepted from one IP per hour. Same reasoning as the
 * registration knob: the automated suite books many viewings from one loopback
 * address, and Increment E needs several distinct fee records. Production keeps
 * the previous default of 12.
 */
define('VIEWING_RATE_LIMIT_PER_HOUR', (int)cfg('VIEWING_RATE_LIMIT_PER_HOUR', 12));
/**
 * Rent (tenant matching) requests accepted from one IP per hour.
 *
 * Correction 1 made this a tenant-only action, and the automated suite now
 * exercises the whole role matrix (tenant, landlord, agent, administrator,
 * visitor) from one loopback address — every attempt counts, including the
 * refused ones. Production keeps the previous default of 10.
 */
define('TENANT_REQUEST_RATE_LIMIT_PER_HOUR', (int)cfg('TENANT_REQUEST_RATE_LIMIT_PER_HOUR', 10));

// Increment F: lifecycle actions (propose/confirm/reschedule/cancel/complete…).
// Separate from request creation so an agent working a queue is not throttled
// by the public booking limit, and high enough for an office using the console.
define('VIEWING_ACTION_RATE_LIMIT_PER_HOUR', (int)cfg('VIEWING_ACTION_RATE_LIMIT_PER_HOUR', 300));

/**
 * Receipt issuing is switched OFF until the truthful transaction-record model
 * ships (Increment B). The legacy template could imply Goodlucks received rent
 * that a tenant actually paid to the landlord, so no new receipt may be issued.
 * Reading and printing existing records stays enabled.
 */

/**
 * Viewing-fee sharing policy — PROVISIONAL, NOT APPROVED, NEVER APPLIED.
 *
 * The figures below are the *proposal* discussed with the business owner
 * (Standard agent 60/40, Professionally Verified agent 70/30). They are
 * deliberately NOT used by any calculation: a fee-sharing percentage may only
 * reach the ledger through an explicitly approved policy row in `fee_policies`
 * (see `active_fee_policy()`), and no such row ships with this release.
 *
 * Until the owner approves the percentages in writing, the ledger records the
 * agent-collected amount and an explicitly agreed Goodlucks share per
 * transaction (`share_basis = manual_agreement`). Money owed is never inferred
 * from these constants.
 *
 * What is needed before activation (Increment E made steps 2 and 3 real):
 *   1. Written approval of the percentages (and of any tier definitions);
 *   2. A policy created in the admin console by one administrator with the
 *      fee-policy MANAGER capability, approved by a *different* administrator
 *      holding the APPROVER capability, then activated — never seeded, never
 *      inserted by migrate.php, never created by config;
 *   3. A per-transaction snapshot so a later policy change never rewrites past
 *      records (implemented: `fee_policy_snapshots`, append-only and hashed);
 *   4. Confirmation from the business owner that viewing fees are not treated
 *      as Goodlucks revenue before remittance is actually received.
 *
 * These constants are still read by NOTHING except the "proposals on record"
 * notice in the admin console (lib/fee_policies.php `fee_policy_overview()`),
 * which labels them provisional and explicitly reports
 * `appliedToCalculations: false`.
 */
define('PROPOSED_FEE_POLICY_STATUS', 'provisional');
define('PROPOSED_STANDARD_AGENT_SHARE_PCT', 60.0);
define('PROPOSED_STANDARD_GOODLUCKS_SHARE_PCT', 40.0);
define('PROPOSED_VERIFIED_AGENT_SHARE_PCT', 70.0);
define('PROPOSED_VERIFIED_GOODLUCKS_SHARE_PCT', 30.0);

require_once GL_ROOT . '/lib/http.php';
require_once GL_ROOT . '/lib/db.php';
require_once GL_ROOT . '/lib/validate.php';
require_once GL_ROOT . '/lib/crypto.php';
require_once GL_ROOT . '/lib/auth.php';
require_once GL_ROOT . '/lib/audit.php';
require_once GL_ROOT . '/lib/mailer.php';
require_once GL_ROOT . '/lib/outbox.php';
require_once GL_ROOT . '/lib/repository.php';
// Property slugs, share metadata and canonical property URLs (one source of
// truth for the sitemap, the property page shell and the API payload).
require_once GL_ROOT . '/lib/property_url.php';
require_once GL_ROOT . '/lib/viewing_terms.php';
require_once GL_ROOT . '/lib/landlord_policy.php';
require_once GL_ROOT . '/lib/private_storage.php';
require_once GL_ROOT . '/lib/verification.php';
require_once GL_ROOT . '/lib/suspension.php';
require_once GL_ROOT . '/lib/availability.php';
require_once GL_ROOT . '/lib/fee_policies.php';
require_once GL_ROOT . '/lib/viewings.php';
require_once GL_ROOT . '/lib/property_media.php';
require_once GL_ROOT . '/lib/provider_alerts.php';
require_once GL_ROOT . '/lib/matching.php';
require_once GL_ROOT . '/lib/contact_disclosure.php';
require_once GL_ROOT . '/lib/finance.php';
require_once GL_ROOT . '/lib/finance_api.php';
require_once GL_ROOT . '/lib/alerts.php';
// Task 07: Blog & Learning Centre, and the editable layer of the emails.
// Both are required before api.php so its route table can name the handlers.
require_once GL_ROOT . '/lib/blog_content.php';
require_once GL_ROOT . '/lib/blog.php';
require_once GL_ROOT . '/lib/email_templates.php';
// Upgrade 2 Phase 3: the user directory, profiles/activity and bulk email.
require_once GL_ROOT . '/lib/users_admin.php';
require_once GL_ROOT . '/lib/campaigns.php';
require_once GL_ROOT . '/lib/blog_api.php';
require_once GL_ROOT . '/lib/api.php';
