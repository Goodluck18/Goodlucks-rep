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
        'updated_at'          => "DATETIME DEFAULT NULL",
    ],
    'properties' => [
        'landlord_name'        => "VARCHAR(255) DEFAULT NULL AFTER `landlord_id`",
        'landlord_company'     => "VARCHAR(255) DEFAULT NULL AFTER `landlord_name`",
        'is_landlord_verified' => "TINYINT(1) NOT NULL DEFAULT 1 AFTER `landlord_company`",
        'nearby_places'        => "LONGTEXT DEFAULT NULL AFTER `amenities`",
        'availability'         => "VARCHAR(100) DEFAULT 'Available Now' AFTER `nearby_places`",
        'featured'             => "TINYINT(1) NOT NULL DEFAULT 0 AFTER `availability`",
        'updated_at'           => "DATETIME DEFAULT NULL",
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
    ],
    'rent_receipts' => [
        'tenant_phone' => "VARCHAR(64) DEFAULT NULL AFTER `tenant_name`",
        'amount_in_words' => "TEXT DEFAULT NULL",
    ],
    'email_logs' => [
        'status' => "VARCHAR(32) NOT NULL DEFAULT 'queued'",
    ],
];

/** Tables that must exist (created with the definitions in database.sql). */
$requiredTables = ['auth_sessions', 'enquiries', 'search_alerts', 'saved_properties', 'page_views', 'rate_limits', 'alert_deliveries', 'password_resets', 'submission_dedupe', 'email_outbox'];

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
