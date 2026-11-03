/**
 * Migration regression tests (audit findings R1 and R2).
 *
 * These tests do not need the API server. They build an "old" SQLite database
 * (pre-Increment G, without the columns later increments added), run the real
 * migration script against it, and check the result with a separate PDO
 * connection:
 *
 *   R1  the five Increment G tables are created on an existing installation,
 *       together with their indexes, and their data survives a second run;
 *   R2  the duplicated `$requiredColumns` keys are gone, so every column from
 *       both halves of the old `properties` / `viewing_schedules` entries is
 *       added — not just the last one;
 *   R3  the backfill that links old reversal rows to the receipt they reverse.
 *
 * The MySQL plan cannot be executed here (no MySQL server in this environment),
 * so the parts of it that are static — the required-table list and the merged
 * column keys — are checked against the source file directly.
 */

import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { runPhpScript } from '../scripts/php.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const workDir = path.join(projectRoot, '.data', 'migration-tests');
const tool = 'tests/sqlite-tool.php';
const schemaPath = path.join(projectRoot, 'php-backend', 'schema.sqlite.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');

const G_TABLES = [
  'remittance_submissions',
  'remittance_allocations',
  'rental_commissions',
  'commission_payments',
  'financial_adjustments',
];

const G_INDEXES = {
  remittance_submissions: ['idx_remit_sub_agent', 'idx_remit_sub_status'],
  remittance_allocations: ['idx_remit_alloc_record'],
  rental_commissions: ['idx_commission_status', 'idx_commission_agent'],
  commission_payments: ['idx_commission_payment'],
  financial_adjustments: ['idx_fin_adj_subject', 'idx_fin_adj_created'],
};

const env = (dbPath) => ({ DB_DRIVER: 'sqlite', DB_SQLITE_PATH: dbPath, APP_ENV: 'development' });

/** Run the inspection tool and return its parsed JSON. */
const inspect = (dbPath, mode, extra = []) => {
  const result = runPhpScript(tool, [`--path=${dbPath}`, `--mode=${mode}`, ...extra], {});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  return parsed;
};

/** Remove one column definition line, keeping the SQL list syntactically valid. */
function dropColumn(sql, column) {
  const line = new RegExp(`^\\s*${column}\\s+[^\\n]*,?\\n`, 'm');
  const match = sql.match(line);
  assert.ok(match, `expected to find a definition for ${column}`);
  const removed = match[0];
  const wasLast = !removed.trim().endsWith(',');
  const next = sql.replace(removed, '');
  if (wasLast) {
    // The column was the last in its table: the previous line must lose its comma.
    throw new Error('Refusing to drop the last column of a table in this test helper');
  }
  return next;
}

/** Build the pre-Increment-G schema the migration is expected to upgrade. */
function buildLegacySchema() {
  let sql = schemaSql;

  for (const table of G_TABLES) {
    const tableBlock = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+\`?${table}\`?\\s*\\([\\s\\S]*?\\n\\);\\n`, 'm');
    assert.match(sql, tableBlock, `expected a CREATE TABLE for ${table}`);
    sql = sql.replace(tableBlock, '');
    const indexLines = new RegExp(`^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS[^\\n]*ON\\s+\`?${table}\`?[^\\n]*\\n`, 'gm');
    sql = sql.replace(indexLines, '');
  }

  // Columns added by later increments, removed so the migration has real work.
  sql = dropColumn(sql, 'reversal_of_receipt_id');
  sql = dropColumn(sql, 'can_view_finance');
  sql = dropColumn(sql, 'can_confirm_remittances');
  sql = dropColumn(sql, 'landlord_contact_claimed');

  return sql;
}

const dbPath = () => path.join(workDir, 'legacy.sqlite');
const legacySchemaFile = path.join(workDir, 'legacy-schema.sql');

describe('Migration upgrades an existing database (R1, R2, R3)', () => {
  before(() => {
    fs.mkdirSync(workDir, { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(dbPath() + suffix, { force: true });
    }
    fs.writeFileSync(legacySchemaFile, buildLegacySchema(), 'utf8');

    // The tool refuses to create a database, which is exactly what we want: the
    // "old" file is written first, then filled from the legacy schema.
    fs.writeFileSync(dbPath(), '', 'utf8');
    const built = runPhpScript(tool, [`--path=${dbPath()}`, '--mode=exec-file', `--file=${legacySchemaFile}`], {});
    assert.equal(built.status, 0, built.stdout + built.stderr);
  });

  test('the old database really is missing the Increment G schema', () => {
    const tables = inspect(dbPath(), 'tables').tables;
    for (const table of G_TABLES) {
      assert.equal(tables.includes(table), false, `${table} should not exist yet`);
    }
    assert.equal(
      inspect(dbPath(), 'columns', ['--table=fee_remittances']).columns.includes('reversal_of_receipt_id'),
      false
    );
    const userColumns = inspect(dbPath(), 'columns', ['--table=users']).columns;
    assert.equal(userColumns.includes('can_view_finance'), false);
    assert.equal(userColumns.includes('can_confirm_remittances'), false);
    const propertyColumns = inspect(dbPath(), 'columns', ['--table=properties']).columns;
    assert.equal(propertyColumns.includes('landlord_contact_claimed'), false);
  });

  test('the dry run announces the missing tables and columns', () => {
    const dry = runPhpScript('php-backend/migrate.php', [], env(dbPath()));
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    for (const table of G_TABLES) {
      assert.match(dry.stdout, new RegExp(`CREATE TABLE ${table}`));
    }
    assert.match(dry.stdout, /ADD COLUMN reversal_of_receipt_id/);
    assert.match(dry.stdout, /ADD COLUMN can_view_finance/);
    assert.match(dry.stdout, /ADD COLUMN landlord_contact_claimed/);
    assert.match(dry.stdout, /Dry run complete/);
    // A dry run changes nothing.
    assert.equal(inspect(dbPath(), 'tables').tables.includes('remittance_submissions'), false);
  });

  test('--apply creates the five tables, their indexes and every merged column', () => {
    const applied = runPhpScript('php-backend/migrate.php', ['--apply'], env(dbPath()));
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
    assert.match(applied.stdout, /Migration completed successfully/);

    const tables = inspect(dbPath(), 'tables').tables;
    for (const table of G_TABLES) {
      assert.ok(tables.includes(table), `${table} was created`);
    }

    for (const [table, expected] of Object.entries(G_INDEXES)) {
      const indexes = inspect(dbPath(), 'indexes', [`--table=${table}`]).indexes;
      for (const index of expected) {
        assert.ok(indexes.includes(index), `${index} was created on ${table}`);
      }
    }

    // R3: the new reversal link exists.
    assert.ok(inspect(dbPath(), 'columns', ['--table=fee_remittances']).columns.includes('reversal_of_receipt_id'));

    // R2: BOTH halves of the old duplicate keys are applied, not just the last
    // one. Before the fix only `landlord_contact_claimed` would have been added
    // because it overwrote the whole `properties` entry.
    const propertyColumns = inspect(dbPath(), 'columns', ['--table=properties']).columns;
    for (const column of [
      'landlord_name',
      'landlord_company',
      'submitted_by_user_id',
      'submitted_by_role',
      'landlord_authority_state',
      'is_landlord_verified',
      'nearby_places',
      'availability',
      'featured',
      'landlord_contact_claimed',
      'updated_at',
    ]) {
      assert.ok(propertyColumns.includes(column), `properties.${column} exists after the migration`);
    }

    const viewingColumns = inspect(dbPath(), 'columns', ['--table=viewing_schedules']).columns;
    for (const column of [
      'tenant_email',
      'outcome_notes',
      'tenant_user_id',
      'agent_user_id',
      'landlord_user_id',
      'request_type',
      'preferred_date',
      'preferred_time',
      'confirmed_at',
      'confirmed_by',
      'cancel_reason',
      'cancelled_by',
      'cancelled_at',
      'completed_at',
      'completed_by',
      'agent_notes',
      'updated_at',
    ]) {
      assert.ok(viewingColumns.includes(column), `viewing_schedules.${column} exists after the migration`);
    }
  });

  test('existing records are untouched by the upgrade', () => {
    // Written after the schema upgrade so the insert uses the migrated table.
    inspect(dbPath(), 'exec', [
      `--sql=INSERT INTO users (id, email, name, role, created_at) VALUES ('u-legacy-1', 'legacy@example.com', 'Legacy User', 'tenant', '2026-01-01 00:00:00')`,
    ]);
    inspect(dbPath(), 'exec', [
      `--sql=INSERT INTO fee_remittances (id, viewing_fee_record_id, amount_ghs, received_at, entry_type) VALUES ('frm-legacy-1', 'vfr-legacy-1', 40, '2026-01-02', 'receipt')`,
    ]);

    const rerun = runPhpScript('php-backend/migrate.php', ['--apply'], env(dbPath()));
    assert.equal(rerun.status, 0, rerun.stdout + rerun.stderr);
    assert.match(rerun.stdout, /Schema is already up to date/);

    const rows = inspect(dbPath(), 'query', [
      `--sql=SELECT id, email, name FROM users WHERE id = 'u-legacy-1'`,
    ]).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'legacy@example.com');

    const receipts = inspect(dbPath(), 'query', [
      `--sql=SELECT id, amount_ghs FROM fee_remittances WHERE id = 'frm-legacy-1'`,
    ]).rows;
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].amount_ghs, 40);
  });

  test('old reversal rows are linked to the receipt they reverse (R3 backfill)', () => {
    inspect(dbPath(), 'exec', [
      `--sql=INSERT INTO financial_adjustments (id, subject_type, subject_id, kind, amount_ghs, reason, created_by, created_at) VALUES ('fadj-legacy-1', 'viewing_fee_remittance', 'frm-legacy-1', 'reversal', -10, 'Legacy reversal', 'admin-1', '2026-02-01 00:00:00')`,
    ]);
    inspect(dbPath(), 'exec', [
      `--sql=INSERT INTO fee_remittances (id, viewing_fee_record_id, amount_ghs, received_at, entry_type, adjustment_id) VALUES ('frm-legacy-rev-1', 'vfr-legacy-1', -10, '2026-02-01', 'reversal', 'fadj-legacy-1')`,
    ]);

    const before = inspect(dbPath(), 'query', [
      `--sql=SELECT reversal_of_receipt_id FROM fee_remittances WHERE id = 'frm-legacy-rev-1'`,
    ]).rows;
    assert.equal(before[0].reversal_of_receipt_id, null, 'the legacy row starts unlinked');

    const applied = runPhpScript('php-backend/migrate.php', ['--apply'], env(dbPath()));
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
    assert.match(applied.stdout, /link existing reversal rows to the receipt they reverse/i);

    const after = inspect(dbPath(), 'query', [
      `--sql=SELECT reversal_of_receipt_id FROM fee_remittances WHERE id = 'frm-legacy-rev-1'`,
    ]).rows;
    assert.equal(after[0].reversal_of_receipt_id, 'frm-legacy-1');

    // The backfill is idempotent: a third run has nothing left to do.
    const again = runPhpScript('php-backend/migrate.php', ['--apply'], env(dbPath()));
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /Nothing to do/);
  });
});

describe('The MySQL migration plan is complete and duplicate-free (static check)', () => {
  const migrateSource = fs.readFileSync(path.join(projectRoot, 'php-backend', 'migrate.php'), 'utf8');
  const mysqlSource = fs.readFileSync(path.join(projectRoot, 'php-backend', 'database.sql'), 'utf8');
  const columnsBlock = migrateSource.slice(
    migrateSource.indexOf('$requiredColumns = ['),
    migrateSource.indexOf('$requiredTables = [')
  );

  test('every Increment G table is in $requiredTables', () => {
    const tablesBlock = migrateSource.slice(
      migrateSource.indexOf('$requiredTables = ['),
      migrateSource.indexOf('function existing_tables')
    );
    for (const table of G_TABLES) {
      assert.match(tablesBlock, new RegExp(`'${table}'`), `${table} must be listed in $requiredTables`);
    }
  });

  test('each G table also exists in database.sql with its definition', () => {
    for (const table of G_TABLES) {
      assert.match(
        mysqlSource,
        new RegExp('CREATE TABLE IF NOT EXISTS `' + table + '`'),
        `${table} needs a definition in database.sql`
      );
    }
  });

  test('no table appears twice in $requiredColumns', () => {
    const keys = [...columnsBlock.matchAll(/^\s{4}'([a-z_]+)' => \[/gm)].map((m) => m[1]);
    const seen = new Map();
    for (const key of keys) {
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
    assert.deepEqual(duplicates, [], `duplicate table keys in $requiredColumns: ${JSON.stringify(duplicates)}`);
  });

  test('the merged entries keep every column from both former blocks', () => {
    const entry = (table) => {
      const start = columnsBlock.indexOf(`    '${table}' => [`);
      assert.ok(start >= 0, `${table} entry exists`);
      const end = columnsBlock.indexOf('\n    ],', start);
      return columnsBlock.slice(start, end);
    };

    const properties = entry('properties');
    for (const column of [
      'landlord_name',
      'landlord_company',
      'submitted_by_user_id',
      'submitted_by_role',
      'landlord_authority_state',
      'is_landlord_verified',
      'nearby_places',
      'availability',
      'featured',
      'landlord_contact_claimed',
      'updated_at',
    ]) {
      assert.match(properties, new RegExp(`'${column}'\\s*=>`), `properties.${column} kept`);
    }

    const viewings = entry('viewing_schedules');
    for (const column of ['tenant_email', 'outcome_notes', 'tenant_user_id', 'agent_user_id', 'request_type', 'updated_at']) {
      assert.match(viewings, new RegExp(`'${column}'\\s*=>`), `viewing_schedules.${column} kept`);
    }

    const remittances = entry('fee_remittances');
    assert.match(remittances, /'reversal_of_receipt_id'\s*=>/, 'the reversal link is in the MySQL plan');
  });
});
