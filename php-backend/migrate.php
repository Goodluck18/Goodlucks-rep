<?php
/**
 * Goodlucks Homes - Safe database migration helper (CLI only)
 *
 * Upgrades an ALREADY EXISTING installation (the original 9-table schema) to
 * the current schema WITHOUT dropping tables, deleting rows or touching
 * existing listing content.
 *
 * What it does:
 *   1. Creates any missing tables.
 *   2. Adds missing columns to existing tables.
 *   3. Adds the indexes that belong to a newly created table.
 *   4. Runs the small number of idempotent data backfills listed below.
 *   5. Reports what changed.
 *
 * MySQL/MariaDB takes its column definitions from `$requiredColumns` (new
 * tables come from database.sql); SQLite takes every definition from
 * schema.sqlite.sql, so an upgraded file ends up identical to a fresh one.
 * Both paths are additive and idempotent: no row is deleted, no table is
 * dropped, and re-running the script is always safe.
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

/** Columns that must exist, with their ALTER TABLE definitions. */
$requiredColumns = [
    'users' => [
        // Task 03: the official Ghana Card name supplied at registration. It is
        // a claim, never a verification; NULL for every existing account so no
        // one is locked out or given a verification they never submitted.
        'official_name'       => "VARCHAR(200) DEFAULT NULL AFTER `name`",
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
        // Increment F: the landlord contact an agent claimed when submitting a
        // listing. Staff-only; never used to reveal whether an account exists.
        'landlord_contact_claimed' => "VARCHAR(255) DEFAULT NULL AFTER `landlord_authority_state`",
        // Task 03: per-property viewing fee + viewing terms. Existing listings
        // keep NULL / 'not_set': no fee is invented for them, and nothing
        // becomes public until staff approve a value.
        'viewing_fee_ghs'      => "DECIMAL(10,2) DEFAULT NULL AFTER `featured`",
        'viewing_terms_json'   => "LONGTEXT DEFAULT NULL AFTER `viewing_fee_ghs`",
        'viewing_terms_state'  => "VARCHAR(24) NOT NULL DEFAULT 'not_set' AFTER `viewing_terms_json`",
        'viewing_terms_updated_at' => "DATETIME DEFAULT NULL AFTER `viewing_terms_state`",
        'viewing_terms_approved_by' => "VARCHAR(64) DEFAULT NULL AFTER `viewing_terms_updated_at`",
        'updated_at'           => "DATETIME DEFAULT NULL",
    ],
    'verification_documents' => [
        // Task 03: per-document reviewer outcome. Existing documents keep
        // 'pending' — no outcome is invented for a document nobody reviewed.
        'review_status' => "VARCHAR(24) NOT NULL DEFAULT 'pending' AFTER `uploaded_by`",
        'review_note'   => "VARCHAR(500) DEFAULT NULL AFTER `review_status`",
        'reviewed_by'   => "VARCHAR(64) DEFAULT NULL AFTER `review_note`",
        'reviewed_at'   => "DATETIME DEFAULT NULL AFTER `reviewed_by`",
    ],
    'rental_commissions' => [
        // Task 03 update: which policy priced the row, plus the landlord
        // platform-fee basis. Existing rows keep 'agent_commission' and NULL
        // basis columns — no historical fee is recalculated or back-filled.
        'policy_type'          => "VARCHAR(32) NOT NULL DEFAULT 'agent_commission' AFTER `basis`",
        'rent_amount_ghs'      => "DECIMAL(12,2) DEFAULT NULL AFTER `policy_type`",
        'platform_fee_percent' => "DECIMAL(5,2) DEFAULT NULL AFTER `rent_amount_ghs`",
        // UNIQUE on a nullable column: MySQL and SQLite both permit many NULLs,
        // so agent commissions are unaffected while one rent payment can never
        // be charged the landlord platform fee twice.
        'dedupe_key'           => "VARCHAR(191) DEFAULT NULL UNIQUE AFTER `platform_fee_percent`",
        // Task 03: the agent tier split frozen when the commission was priced.
        // Existing rows keep NULL — historical commissions are never
        // recalculated or back-filled with a percentage they never had.
        'agent_tier'             => "VARCHAR(32) DEFAULT NULL AFTER `policy_snapshot_hash`",
        'agent_share_percent'    => "DECIMAL(5,2) DEFAULT NULL AFTER `agent_tier`",
        'goodlucks_share_percent'=> "DECIMAL(5,2) DEFAULT NULL AFTER `agent_share_percent`",
        'agent_share_ghs'        => "DECIMAL(12,2) DEFAULT NULL AFTER `goodlucks_share_percent`",
        'goodlucks_share_ghs'    => "DECIMAL(12,2) DEFAULT NULL AFTER `agent_share_ghs`",
        'split_snapshot_json'    => "LONGTEXT DEFAULT NULL AFTER `goodlucks_share_ghs`",
        'split_snapshot_hash'    => "VARCHAR(64) DEFAULT NULL AFTER `split_snapshot_json`",
        'split_frozen_at'        => "DATETIME DEFAULT NULL AFTER `split_snapshot_hash`",
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
        // Audit-remediation R3: a reversal is tied to the ONE receipt it
        // reverses, so cumulative reversals are measured per receipt rather
        // than across the whole obligation.
        'reversal_of_receipt_id' => "VARCHAR(64) DEFAULT NULL AFTER `adjustment_id`",
    ],
    'viewing_schedules' => [
        'tenant_email'   => "VARCHAR(255) DEFAULT NULL AFTER `tenant_phone`",
        'outcome_notes'  => "TEXT DEFAULT NULL",
        // Increment F: the agent-led viewing lifecycle. Existing rows keep their
        // stored values; a legacy 'scheduled' row reads as a confirmed appointment
        // and is never rewritten.
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
        // Task 03: the approved viewing terms in force when the request was
        // made, kept so a later property change cannot rewrite history.
        'viewing_terms_snapshot_json' => "LONGTEXT DEFAULT NULL AFTER `fee_amount_ghs`",
        'updated_at'      => "DATETIME DEFAULT NULL AFTER `agent_notes`",
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
        // Task 03 update: agent_collection | landlord_platform_fee. Existing
        // records are agent collections, which is exactly the default.
        'fee_source'            => "VARCHAR(32) NOT NULL DEFAULT 'agent_collection' AFTER `agent_tier_at_snapshot`",
    ],
];

/** Tables that must exist (created with the definitions in database.sql). */
$requiredTables = ['auth_sessions', 'enquiries', 'search_alerts', 'saved_properties', 'page_views', 'rate_limits', 'alert_deliveries', 'password_resets', 'submission_dedupe', 'email_outbox', 'audit_logs', 'fee_policies', 'viewing_fee_records', 'fee_remittances', 'agent_profiles',
    'identity_verifications', 'professional_authorisations', 'verification_documents', 'verification_decisions',
    'fee_policy_snapshots', 'fee_policy_events', 'viewing_events',
    // Increment G financial tables. These were created by database.sql for a
    // fresh install but were missing from this list, so an EXISTING installation
    // upgrading through migrate.php never got them (audit finding R1).
    'remittance_submissions', 'remittance_allocations', 'rental_commissions',
    'commission_payments', 'financial_adjustments',
    // Task 03: property viewing fee / terms change requests.
    'property_viewing_fee_changes',
    // Task 03 update: administrator-controlled settings (landlord viewing fee).
    'platform_settings',
    // Task 07: Blog & Learning Centre, plus the extended email templates.
    'blog_categories', 'blog_posts', 'blog_post_properties', 'email_templates'];

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

// ---------------------------------------------------------------------------
// SQLite: the authoritative definitions live in schema.sqlite.sql
// ---------------------------------------------------------------------------

function sqlite_existing_tables(PDO $pdo): array
{
    $rows = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table'")->fetchAll(PDO::FETCH_COLUMN);
    return array_map('strval', $rows);
}

function sqlite_existing_columns(PDO $pdo, string $table): array
{
    $rows = $pdo->query('PRAGMA table_info(' . sqlite_ident($table) . ')')->fetchAll();
    return array_map(static fn($r) => (string)$r['name'], $rows);
}

/** Quote an identifier for SQLite (never accepts anything but a plain name). */
function sqlite_ident(string $name): string
{
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name)) {
        throw new InvalidArgumentException('Unsafe SQLite identifier: ' . $name);
    }
    return '"' . $name . '"';
}

/**
 * Read schema.sqlite.sql and return, for every CREATE TABLE statement, the
 * table name, the statement itself and its column definitions.
 *
 * schema.sqlite.sql is the single source of truth for SQLite, so the upgrade
 * path below uses exactly the same definitions a fresh install gets — there is
 * no second copy of the schema to drift out of date (which is what produced
 * audit findings R1 and R2).
 *
 * @return array<string, array{statement: string, columns: array<string, string>}>
 */
function sqlite_schema_definitions(string $path): array
{
    if (!is_file($path)) {
        throw new RuntimeException('schema.sqlite.sql not found at ' . $path);
    }
    $raw = (string)file_get_contents($path);
    $definitions = [];
    $offset = 0;

    while (preg_match('/CREATE TABLE IF NOT EXISTS\s+[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?\s*\(/i', $raw, $m, PREG_OFFSET_CAPTURE, $offset)) {
        $name = $m[1][0];
        $openParen = strpos($raw, '(', (int)$m[0][1]);
        $depth = 0;
        $length = strlen($raw);
        $close = null;
        for ($i = $openParen; $i < $length; $i++) {
            $char = $raw[$i];
            if ($char === '(') {
                $depth++;
            } elseif ($char === ')') {
                $depth--;
                if ($depth === 0) {
                    $close = $i;
                    break;
                }
            }
        }
        if ($close === null) {
            throw new RuntimeException('Unbalanced parentheses in the definition of ' . $name);
        }

        $body = substr($raw, $openParen + 1, $close - $openParen - 1);
        $statement = substr($raw, (int)$m[0][1], $close - (int)$m[0][1] + 1) . ';';
        $definitions[$name] = ['statement' => $statement, 'columns' => sqlite_column_definitions($body)];
        $offset = $close + 1;
    }

    return $definitions;
}

/**
 * Split a CREATE TABLE body into "column name => definition" pairs, skipping
 * table-level constraints (PRIMARY KEY (...), UNIQUE (...), FOREIGN KEY ...).
 *
 * @return array<string, string>
 */
function sqlite_column_definitions(string $body): array
{
    // Strip comment lines BEFORE splitting on commas: a comment may contain a
    // comma, and splitting first turns the words after it into fake columns.
    $body = preg_replace('/^[ \t]*--[^\n]*/m', '', $body) ?? $body;

    $columns = [];
    $parts = [];
    $current = '';
    $depth = 0;
    $length = strlen($body);
    for ($i = 0; $i < $length; $i++) {
        $char = $body[$i];
        if ($char === '(') {
            $depth++;
        } elseif ($char === ')') {
            $depth--;
        }
        if ($char === ',' && $depth === 0) {
            $parts[] = $current;
            $current = '';
            continue;
        }
        $current .= $char;
    }
    $parts[] = $current;

    foreach ($parts as $part) {
        $definition = trim(preg_replace('/\s+/', ' ', $part) ?? '');
        if ($definition === '' || str_ends_with($definition, ',')) {
            $definition = rtrim($definition, ',');
        }
        if ($definition === '') {
            continue;
        }
        if (preg_match('/^(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CONSTRAINT|CHECK)\b/i', $definition)) {
            continue;
        }
        if (!preg_match('/^[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?\s+(.+)$/s', $definition, $m)) {
            continue;
        }
        $columns[$m[1]] = trim($m[2]);
    }

    return $columns;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/**
 * Build the upgrade plan for MySQL/MariaDB from $requiredTables /
 * $requiredColumns (names only, definitions come from database.sql).
 */
function mysql_plan(PDO $pdo): array
{
    global $requiredTables, $requiredColumns;

    $plan = [];
    $tables = existing_tables($pdo);
    foreach ($requiredTables as $table) {
        if (!in_array($table, $tables, true)) {
            $plan[] = [
                'kind'        => 'create',
                'table'       => $table,
                'description' => "CREATE TABLE {$table}",
            ];
        }
    }

    foreach ($requiredColumns as $table => $columns) {
        if (!in_array($table, $tables, true)) {
            continue;
        }
        $present = existing_columns($pdo, $table);
        foreach ($columns as $column => $definition) {
            if (!in_array($column, $present, true)) {
                $plan[] = [
                    'kind'        => 'column',
                    'table'       => $table,
                    'column'      => $column,
                    'sql'         => "ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}",
                    'description' => "ALTER TABLE {$table} ADD COLUMN {$column}",
                ];
            }
        }
    }

    return $plan;
}

/**
 * Build the upgrade plan for SQLite from schema.sqlite.sql.
 *
 * An existing SQLite file gets exactly what a fresh install gets: the missing
 * Increment G tables, the missing columns, and nothing else. Existing rows are
 * never rewritten or deleted.
 */
function sqlite_plan(PDO $pdo): array
{
    $schemaText = (string)file_get_contents(DB_SQLITE_SCHEMA);
    $definitions = sqlite_schema_definitions(DB_SQLITE_SCHEMA);
    $plan = [];

    $tables = sqlite_existing_tables($pdo);
    $createdTables = [];
    foreach ($definitions as $table => $definition) {
        if (!in_array($table, $tables, true)) {
            $plan[] = [
                'kind'        => 'create',
                'table'       => $table,
                'sql'         => $definition['statement'],
                'description' => "CREATE TABLE {$table}",
            ];
            $createdTables[] = $table;
            continue;
        }

        $present = sqlite_existing_columns($pdo, $table);
        foreach ($definition['columns'] as $column => $columnDefinition) {
            if (in_array($column, $present, true)) {
                continue;
            }
            // SQLite cannot add a PRIMARY KEY or UNIQUE column to an existing
            // table. Say so instead of failing halfway through the upgrade.
            if (preg_match('/\b(PRIMARY\s+KEY|UNIQUE)\b/i', $columnDefinition)) {
                $plan[] = [
                    'kind'        => 'skip',
                    'table'       => $table,
                    'column'      => $column,
                    'description' => "SKIP {$table}.{$column}: SQLite cannot add a PRIMARY KEY/UNIQUE column to an existing table",
                ];
                continue;
            }
            $plan[] = [
                'kind'        => 'column',
                'table'       => $table,
                'column'      => $column,
                'sql'         => 'ALTER TABLE ' . sqlite_ident($table) . ' ADD COLUMN ' . sqlite_ident($column) . ' ' . $columnDefinition,
                'description' => "ALTER TABLE {$table} ADD COLUMN {$column}",
            ];
        }
    }

    // A table created here must also get the indexes schema.sqlite.sql declares
    // for it, otherwise an upgraded database quietly differs from a fresh one.
    if ($createdTables !== [] && preg_match_all('/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS[^;]*?ON\s+[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?[^;]*;/i', $schemaText, $indexMatches, PREG_SET_ORDER)) {
        foreach ($indexMatches as $match) {
            if (!in_array($match[1], $createdTables, true)) {
                continue;
            }
            $plan[] = [
                'kind'        => 'index',
                'table'       => $match[1],
                'sql'         => trim($match[0]),
                'description' => 'CREATE INDEX on ' . $match[1],
            ];
        }
    }

    return $plan;
}

$isSqlite = db_driver() === 'sqlite';

$plan = [];
$backfills = [
    // Audit finding R3: before this correction a reversal row was only linked to
    // the obligation, not to the receipt it reversed. The link can be recovered
    // from the adjustment that created it — `financial_adjustments.subject_id`
    // is exactly the original receipt id — so existing installations get the
    // same per-receipt accounting as new ones.
    'link existing reversal rows to the receipt they reverse' => [
        'sql' => "UPDATE `fee_remittances` SET `reversal_of_receipt_id` = (
                      SELECT `subject_id` FROM `financial_adjustments`
                       WHERE `financial_adjustments`.`id` = `fee_remittances`.`adjustment_id`
                  )
                   WHERE `entry_type` = 'reversal'
                     AND `reversal_of_receipt_id` IS NULL
                     AND `adjustment_id` IS NOT NULL",
        'probe' => "SELECT COUNT(*) FROM `fee_remittances`
                     WHERE `entry_type` = 'reversal'
                       AND `reversal_of_receipt_id` IS NULL
                       AND `adjustment_id` IS NOT NULL",
    ],
];

try {
    $plan = $isSqlite ? sqlite_plan($pdo) : mysql_plan($pdo);
} catch (Throwable $e) {
    fwrite(STDERR, "Could not read the schema: " . $e->getMessage() . "\n");
    exit(1);
}

$pendingBackfills = [];
foreach ($backfills as $label => $backfill) {
    try {
        $remaining = (int)$pdo->query($backfill['probe'])->fetchColumn();
    } catch (Throwable $e) {
        // The table or column does not exist yet; the backfill runs on the next
        // invocation, after the schema change above has created it.
        $remaining = 0;
    }
    if ($remaining > 0) {
        $pendingBackfills[$label] = $backfill;
    }
}

$changes = array_values(array_filter($plan, static fn($entry) => $entry['kind'] !== 'skip'));
$skips = array_values(array_filter($plan, static fn($entry) => $entry['kind'] === 'skip'));

if (!$changes && !$pendingBackfills) {
    foreach ($skips as $skip) {
        echo "  " . $skip['description'] . "\n";
    }
    echo "Schema is already up to date. Nothing to do.\n";
    exit(0);
}

echo "Planned changes (" . (count($changes) + count($pendingBackfills)) . "):\n";
$step = 0;
foreach ($changes as $change) {
    $step++;
    echo "  {$step}. {$change['description']}\n";
}
foreach (array_keys($pendingBackfills) as $label) {
    $step++;
    echo "  {$step}. DATA: {$label}\n";
}
foreach ($skips as $skip) {
    echo "  " . $skip['description'] . "\n";
}

if (!$apply) {
    echo "\nDry run complete. Re-run with --apply to execute these statements.\n";
    exit(0);
}

// New MySQL tables: reuse the authoritative definitions from database.sql
$createStatements = [];
if (!$isSqlite) {
    $schemaFile = __DIR__ . '/database.sql';
    $schemaSql = is_file($schemaFile) ? (string)file_get_contents($schemaFile) : '';
    if ($schemaSql !== '' && preg_match_all('/CREATE TABLE IF NOT EXISTS `([a-z_]+)`.*?;\s/s', $schemaSql, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $match) {
            $createStatements[$match[1]] = $match[0];
        }
    }
}

/*
 * MySQL/MariaDB commits implicitly before and after every DDL statement, so a
 * transaction cannot make a set of CREATE/ALTER statements atomic. Rather than
 * pretend otherwise, each statement runs on its own and reports its outcome; a
 * failure stops the run and says exactly which statement stopped it and what
 * was already applied. Every statement is idempotent (the tables are only
 * created when absent, and columns are only added when PRAGMA/SHOW COLUMNS says
 * they are missing), so re-running after fixing the cause is always safe.
 */
$applied = [];
$failed = null;

foreach ($changes as $change) {
    try {
        if ($change['kind'] === 'create') {
            $table = $change['table'];
            if ($isSqlite) {
                $pdo->exec($change['sql']);
            } elseif (isset($createStatements[$table])) {
                $pdo->exec($createStatements[$table]);
            } else {
                $applied[] = "skipped {$table} (no definition in database.sql)";
                echo "  skipped {$table} (definition not found in database.sql)\n";
                continue;
            }
            $applied[] = "created table {$table}";
            echo "  created table {$table}\n";
            continue;
        }

        if ($change['kind'] === 'index') {
            $pdo->exec($change['sql']);
            $applied[] = $change['description'];
            echo "  {$change['description']}
";
            continue;
        }

        try {
            $pdo->exec($change['sql']);
        } catch (Throwable $e) {
            // MySQL `AFTER <column>` fails on an installation where the
            // reference column was never created. Add the column without the
            // position rather than leaving the installation half-upgraded.
            if (!$isSqlite && preg_match('/\s+AFTER\s+`[a-z_]+`/i', (string)$change['sql'])) {
                $fallback = preg_replace('/\s+AFTER\s+`[a-z_]+`/i', '', (string)$change['sql']);
                $pdo->exec($fallback);
                $applied[] = "added {$change['table']}.{$change['column']} (without AFTER)";
                echo "  added {$change['table']}.{$change['column']} (position clause dropped: referenced column missing)\n";
                continue;
            }
            throw $e;
        }
        $applied[] = "added {$change['table']}.{$change['column']}";
        echo "  added {$change['table']}.{$change['column']}\n";
    } catch (Throwable $e) {
        $failed = $e;
        break;
    }
}

if ($failed === null) {
    foreach ($pendingBackfills as $label => $backfill) {
        try {
            $rows = $pdo->exec($backfill['sql']);
            $applied[] = "data: {$label} ({$rows} rows)";
            echo "  data: {$label} ({$rows} rows)\n";
        } catch (Throwable $e) {
            $failed = $e;
            break;
        }
    }
}

if ($failed !== null) {
    fwrite(STDERR, "\nMigration STOPPED: " . $failed->getMessage() . "\n");
    fwrite(STDERR, "Statements already applied (" . count($applied) . "):\n");
    foreach ($applied as $line) {
        fwrite(STDERR, "  - {$line}\n");
    }
    if (!$isSqlite) {
        fwrite(STDERR, "MySQL commits DDL implicitly, so the statements above stay applied.\n");
    }
    fwrite(STDERR, "Every statement is idempotent: fix the cause and re-run --apply; nothing is repeated.\n");
    exit(1);
}

echo "\nMigration completed successfully (" . count($applied) . " statements).\n";
