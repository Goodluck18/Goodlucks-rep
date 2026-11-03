<?php
/**
 * Goodlucks Homes - Safe database migration helper (CLI only)
 *
 * Upgrades an ALREADY EXISTING installation (the original 9-table schema) to
 * the current schema WITHOUT dropping tables, deleting rows or touching
 * existing listing content.
 *
 * What it does:
 *   1. Creates any missing tables (CREATE TABLE IF NOT EXISTS).
 *   2. Adds missing columns to existing tables.
 *   3. Adds missing indexes where cheap and safe.
 *   4. Reports what changed.
 *
 * Usage:  php php-backend/migrate.php           (dry run, shows the plan)
 *         php php-backend/migrate.php --apply   (executes the changes)
 *
 * Always take a phpMyAdmin export/backup before running with --apply.
 *
 * Rollback: every Increment D/E change is additive (new nullable/defaulted
 * columns and new empty tables). To roll back Increment E, drop the two policy
 * tables (`fee_policy_snapshots`, `fee_policy_events`) and the two `users`
 * financial-capability columns, then remove the added `fee_policies` and
 * `viewing_fee_records` columns. Increment D rollback is documented in
 * docs/INCREMENT_D_REPORT.md. No existing row is modified by this script.
 *
 * This script never inserts data. It cannot create an approved fee policy: a
 * policy must be drafted, approved by a second administrator and activated
 * through the admin console (see docs/INCREMENT_E_REPORT.md, section 6).
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(403);
    echo json_encode(['error' => 'This script can only be run from the command line.']);
    exit;
}

require_once __DIR__ . '/config.php';

$apply = in_array('--apply', $argv ?? [], true);

echo "Goodlucks Homes - database migration\n";
echo "Driver : " . db_driver() . "\n";
echo "Mode   : " . ($apply ? "APPLY (changes will be written)\n" : "DRY RUN (no changes)\n");
echo str_repeat('-', 64) . "\n";

try {
    $pdo = db();
} catch (Throwable $e) {
    fwrite(STDERR, "Could not connect to the database: " . $e->getMessage() . "\n");
    fwrite(STDERR, "Check DB_* in php-backend/.env (see .env.example).\n");
    exit(1);
}

if (db_driver() === 'sqlite') {
    echo "SQLite databases are created complete from schema.sqlite.sql.\n";
    echo "Delete the file and restart the API to recreate it, or run:\n";
    echo "  sqlite3 " . DB_SQLITE_PATH . " < " . DB_SQLITE_SCHEMA . "\n";
    exit(0);
}

/** Columns that must exist, with their ALTER TABLE definitions. */
$requiredColumns = [
    'users' => [
        'password_hash'       => "VARCHAR(255) DEFAULT NULL AFTER `phone`",
        'bio'                 => "TEXT DEFAULT NULL AFTER `address`",
        // Increment D: least-privilege reviewer capabilities (default deny).
        'can_review_verifications'     => "TINYINT(1) NOT NULL DEFAULT 0 AFTER `additional_notes`",
        'can_access_identity_documents'=> "TINYINT(1) NOT NULL DEFAULT 0 AFTER `can_review_verifications`",
        // Increment E: financial-policy capabilities (manage / approve), default deny.
        'can_manage_fee_policies'      => "TINYINT(1) NOT NULL DEFAULT 0 AFTER `can_access_identity_documents`",
        'can_approve_fee_policies'     => "TINYINT(1) NOT NULL DEFAULT 0 AFTER `can_manage_fee_policies`",
        // Increment F: audited viewing corrections. Ordinary administration does
        // not include them; the capability is granted from the server console.
        'can_correct_viewings'         => "TINYINT(1) NOT NULL DEFAULT 0 AFTER `can_approve_fee_policies`",
        // Increment G: reading money records and moving money are separate powers.
        'can_view_finance'             => "TINYINT(1) NOT NULL DEFAULT 0 AFTER `can_correct_viewings`",
        'can_confirm_remittances'      => "TINYINT(1) NOT NULL DEFAULT 0 AFTER `can_view_finance`",
        'updated_at'          => "DATETIME DEFAULT NULL",
    ],
    'properties' => [
        'landlord_name'        => "VARCHAR(255) DEFAULT NULL AFTER `landlord_id`",
        'landlord_company'     => "VARCHAR(255) DEFAULT NULL AFTER `landlord_name`",
        // Increment C: who actually submitted the listing, and whether landlord
        // authority has been established. Existing rows stay 'not_applicable'.
        'submitted_by_user_id' => "VARCHAR(64) DEFAULT NULL AFTER `landlord_company`",
        'submitted_by_role'    => "VARCHAR(32) DEFAULT NULL AFTER `submitted_by_user_id`",
        'landlord_authority_state' => "VARCHAR(32) NOT NULL DEFAULT 'not_applicable' AFTER `submitted_by_role`",
        'is_landlord_verified' => "TINYINT(1) NOT NULL DEFAULT 1 AFTER `landlord_company`",
        'nearby_places'        => "LONGTEXT DEFAULT NULL AFTER `amenities`",
        'availability'         => "VARCHAR(100) DEFAULT 'Available Now' AFTER `nearby_places`",
        'featured'             => "TINYINT(1) NOT NULL DEFAULT 0 AFTER `availability`",
        'updated_at'           => "DATETIME DEFAULT NULL",
    ],
    'remittance_submissions' => [
        'requested_allocations_json' => "LONGTEXT DEFAULT NULL AFTER `confirmed_at`",
    ],
    'fee_remittances' => [
        // Increment G: link each confirmed receipt to the agent submission and
        // allocation that produced it, and allow linked reversals.
        'submission_id'  => "VARCHAR(64) DEFAULT NULL AFTER `notes`",
        'allocation_id'  => "VARCHAR(64) DEFAULT NULL AFTER `submission_id`",
        'entry_type'     => "VARCHAR(16) NOT NULL DEFAULT 'receipt' AFTER `allocation_id`",
        'adjustment_id'  => "VARCHAR(64) DEFAULT NULL AFTER `entry_type`",
    ],
    'viewing_schedules' => [
        'tenant_email'   => "VARCHAR(255) DEFAULT NULL AFTER `tenant_phone`",
        'outcome_notes'  => "TEXT DEFAULT NULL",
    ],
    'tenant_requests' => [
        'matched_property_ids' => "TEXT DEFAULT NULL AFTER `status`",
        'assigned_agent'       => "VARCHAR(255) DEFAULT 'Goodlucks Intermediary Desk' AFTER `matched_property_ids`",
    ],
    'tenancy_agreements' => [
        'city'                   => "VARCHAR(100) DEFAULT 'Accra' AFTER `property_address`",
        'landlord_ghana_card'    => "VARCHAR(64) DEFAULT NULL",
        'tenant_ghana_card'      => "VARCHAR(64) DEFAULT NULL",
        'utilities_responsibility' => "TEXT DEFAULT NULL",
        'landlord_user_id'       => "VARCHAR(64) DEFAULT NULL AFTER `landlord_phone`",
        'tenant_user_id'         => "VARCHAR(64) DEFAULT NULL AFTER `tenant_phone`",
    ],
    'rent_receipts' => [
        'tenant_phone' => "VARCHAR(64) DEFAULT NULL AFTER `tenant_name`",
        'amount_in_words' => "TEXT DEFAULT NULL",
        'landlord_user_id' => "VARCHAR(64) DEFAULT NULL AFTER `landlord_name`",
        'tenant_user_id' => "VARCHAR(64) DEFAULT NULL AFTER `tenant_phone`",
    ],
    'email_logs' => [
        'status' => "VARCHAR(32) NOT NULL DEFAULT 'queued'",
    ],
    // Increment F: the landlord contact an agent claimed when submitting a
    // listing. Staff-only; never used to reveal whether an account exists.
    'properties' => [
        'landlord_contact_claimed' => "VARCHAR(255) DEFAULT NULL AFTER `landlord_authority_state`",
    ],
    // Increment F: the agent-led viewing lifecycle. Existing rows keep their
    // stored values; a legacy 'scheduled' row reads as a confirmed appointment
    // and is never rewritten.
    'viewing_schedules' => [
        'tenant_user_id'  => "VARCHAR(64) DEFAULT NULL AFTER `outcome_notes`",
        'agent_user_id'   => "VARCHAR(64) DEFAULT NULL AFTER `tenant_user_id`",
        'landlord_user_id'=> "VARCHAR(64) DEFAULT NULL AFTER `agent_user_id`",
        'request_type'    => "VARCHAR(16) NOT NULL DEFAULT 'viewing' AFTER `landlord_user_id`",
        'preferred_date'  => "VARCHAR(32) DEFAULT NULL AFTER `request_type`",
        'preferred_time'  => "VARCHAR(32) DEFAULT NULL AFTER `preferred_date`",
        'confirmed_at'    => "DATETIME DEFAULT NULL AFTER `preferred_time`",
        'confirmed_by'    => "VARCHAR(64) DEFAULT NULL AFTER `confirmed_at`",
        'cancel_reason'   => "TEXT DEFAULT NULL AFTER `confirmed_by`",
        'cancelled_by'    => "VARCHAR(64) DEFAULT NULL AFTER `cancel_reason`",
        'cancelled_at'    => "DATETIME DEFAULT NULL AFTER `cancelled_by`",
        'completed_at'    => "DATETIME DEFAULT NULL AFTER `cancelled_at`",
        'completed_by'    => "VARCHAR(64) DEFAULT NULL AFTER `completed_at`",
        'agent_notes'     => "TEXT DEFAULT NULL AFTER `completed_by`",
        'updated_at'      => "DATETIME DEFAULT NULL AFTER `agent_notes`",
    ],
    // Increment E: the Increment B policy table only had tier/percentages/status.
    // These columns add the lifecycle, approval evidence and calculation method.
    // Existing rows keep their stored values (a legacy `proposed` row reads as a
    // draft and can never price a transaction).
    'fee_policies' => [
        'name'                 => "VARCHAR(160) NOT NULL DEFAULT '' AFTER `id`",
        'description'          => "TEXT DEFAULT NULL AFTER `name`",
        'category'             => "VARCHAR(32) NOT NULL DEFAULT 'viewing_fee' AFTER `description`",
        'calculation_method'   => "VARCHAR(16) NOT NULL DEFAULT 'percentage' AFTER `tier`",
        'currency'             => "VARCHAR(8) NOT NULL DEFAULT 'GHS' AFTER `calculation_method`",
        'agent_share_fixed_ghs'    => "DECIMAL(10,2) DEFAULT NULL AFTER `goodlucks_share_percent`",
        'goodlucks_share_fixed_ghs'=> "DECIMAL(10,2) DEFAULT NULL AFTER `agent_share_fixed_ghs`",
        'version'              => "INT NOT NULL DEFAULT 1 AFTER `status`",
        'supersedes_policy_id' => "VARCHAR(64) DEFAULT NULL AFTER `version`",
        'effective_to'         => "DATE DEFAULT NULL AFTER `effective_from`",
        'created_by'           => "VARCHAR(64) DEFAULT NULL AFTER `effective_to`",
        'submitted_by'         => "VARCHAR(64) DEFAULT NULL AFTER `created_by`",
        'submitted_at'         => "DATETIME DEFAULT NULL AFTER `submitted_by`",
        'rejected_by'          => "VARCHAR(64) DEFAULT NULL AFTER `approved_at`",
        'rejected_at'          => "DATETIME DEFAULT NULL AFTER `rejected_by`",
        'rejection_reason'     => "TEXT DEFAULT NULL AFTER `rejected_at`",
        'activated_by'         => "VARCHAR(64) DEFAULT NULL AFTER `rejection_reason`",
        'activated_at'         => "DATETIME DEFAULT NULL AFTER `activated_by`",
        'deactivated_by'       => "VARCHAR(64) DEFAULT NULL AFTER `activated_at`",
        'deactivated_at'       => "DATETIME DEFAULT NULL AFTER `deactivated_by`",
        'deactivation_reason'  => "TEXT DEFAULT NULL AFTER `deactivated_at`",
        'updated_at'           => "DATETIME DEFAULT NULL",
    ],
    // Increment E: which policy priced a fee, and the immutable snapshot.
    'viewing_fee_records' => [
        'policy_id'             => "VARCHAR(64) DEFAULT NULL AFTER `policy_snapshot_json`",
        'policy_snapshot_id'    => "VARCHAR(64) DEFAULT NULL AFTER `policy_id`",
        'agent_tier_at_snapshot'=> "VARCHAR(32) DEFAULT NULL AFTER `policy_snapshot_id`",
    ],
];

/** Tables that must exist (created with the definitions in database.sql). */
$requiredTables = ['auth_sessions', 'enquiries', 'search_alerts', 'saved_properties', 'page_views', 'rate_limits', 'alert_deliveries', 'password_resets', 'submission_dedupe', 'email_outbox', 'audit_logs', 'fee_policies', 'viewing_fee_records', 'fee_remittances', 'agent_profiles',
    'identity_verifications', 'professional_authorisations', 'verification_documents', 'verification_decisions',
    'fee_policy_snapshots', 'fee_policy_events', 'viewing_events'];

function existing_tables(PDO $pdo): array
{
    $rows = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    return array_map('strval', $rows);
}

function existing_columns(PDO $pdo, string $table): array
{
    $rows = $pdo->query('SHOW COLUMNS FROM `' . $table . '`')->fetchAll();
    return array_map(static fn($r) => (string)$r['Field'], $rows);
}

$tables = existing_tables($pdo);
$changes = [];

foreach ($requiredTables as $table) {
    if (!in_array($table, $tables, true)) {
        $changes[] = "CREATE TABLE {$table}";
    }
}

foreach ($requiredColumns as $table => $columns) {
    if (!in_array($table, $tables, true)) {
        continue;
    }
    $present = existing_columns($pdo, $table);
    foreach ($columns as $column => $definition) {
        if (!in_array($column, $present, true)) {
            $changes[] = "ALTER TABLE {$table} ADD COLUMN {$column} {$definition}";
        }
    }
}

if (!$changes) {
    echo "Schema is already up to date. Nothing to do.\n";
    exit(0);
}

echo "Planned changes (" . count($changes) . "):\n";
foreach ($changes as $i => $change) {
    echo "  " . ($i + 1) . ". {$change}\n";
}

if (!$apply) {
    echo "\nDry run complete. Re-run with --apply to execute these statements.\n";
    exit(0);
}

// New tables: reuse the authoritative definitions from database.sql
$schemaFile = __DIR__ . '/database.sql';
$schemaSql = is_file($schemaFile) ? (string)file_get_contents($schemaFile) : '';
$createStatements = [];
if ($schemaSql !== '' && preg_match_all('/CREATE TABLE IF NOT EXISTS `([a-z_]+)`.*?;\s/s', $schemaSql, $matches, PREG_SET_ORDER)) {
    foreach ($matches as $match) {
        $createStatements[$match[1]] = $match[0];
    }
}

$pdo->beginTransaction();
try {
    foreach ($changes as $change) {
        if (preg_match('/^CREATE TABLE (\w+)$/', $change, $m)) {
            $table = $m[1];
            if (isset($createStatements[$table])) {
                $pdo->exec($createStatements[$table]);
                echo "  created table {$table}\n";
            } else {
                echo "  skipped {$table} (definition not found in database.sql)\n";
            }
        } else {
            $pdo->exec($change);
            echo "  applied: {$change}\n";
        }
    }
    $pdo->commit();
    echo "\nMigration completed successfully.\n";
} catch (Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, "\nMigration FAILED and was rolled back: " . $e->getMessage() . "\n");
    exit(1);
}
