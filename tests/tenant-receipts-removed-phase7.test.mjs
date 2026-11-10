/**
 * Upgrade 2 — Phase 7: rent receipts removed (E1).
 *
 * The Phase 0 audit (§5.10) separates two things that share the word "receipt":
 *
 *   1. **Tenant rent receipts** — the feature the business asked to remove. Its
 *      routes, handlers, screen, menus, client state, API methods and types are
 *      all gone.
 *   2. **Fee-ledger receipts** — money Goodlucks actually received (viewing
 *      fees, commissions) and the reversals that adjust them. That is the audit
 *      trail of platform money and E1 forbids breaking it.
 *
 * The stored history of (1) is preserved: `rent_receipts` is never dropped and no
 * row is deleted. This suite proves all three facts against a real server, and
 * checks the source for the pieces that must no longer exist.
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { startApiServer, runPhpScript } from '../scripts/php.mjs';
import { ApiClient } from './helpers.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(projectRoot, '.data');
const dbPath = path.join(dataDir, `phase7-${process.pid}-${Date.now()}.sqlite`);
const port = 9300 + Math.floor(Math.random() * 400);
const ADMIN_EMAIL = 'admin@phase7.local';
const ADMIN_PASSWORD = 'Admin-Test-Password-123';
const ADMIN_ACCESS_KEY = 'phase7-access-key';
const PASSWORD = 'Member-Test-Password-123';

const read = (relative) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(projectRoot, relative));
const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;

let server;
let baseUrl;
let env;
let admin;
let tenant;
let landlord;
const state = {};

const register = async (body) => {
  const client = new ApiClient(baseUrl);
  const res = await client.post('/api/auth/register', body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { client, user: res.body.user };
};

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });

  env = {
    DB_DRIVER: 'sqlite',
    DB_SQLITE_PATH: dbPath,
    APP_ENV: 'development',
    ADMIN_ACCESS_KEY,
    OFFICIAL_EMAIL: 'rentals@goodlucks.co',
    EMAIL_TRANSPORT: 'none',
    REGISTER_RATE_LIMIT_PER_HOUR: '60',
    PRIVATE_UPLOAD_DIR: path.join(dataDir, `phase7-private-${process.pid}-${Date.now()}`),
  };
  fs.mkdirSync(env.PRIVATE_UPLOAD_DIR, { recursive: true });

  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Phase 7 Admin'],
    env
  );
  assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);

  // The E1 contract includes "the money ledger still works", so this run's
  // administrator is granted the finance capabilities it needs to prove that.
  const financeGrant = runPhpScript(
    'php-backend/grant_finance.php',
    [`--email=${ADMIN_EMAIL}`, '--view=1', '--confirm=1'],
    env
  );
  assert.equal(financeGrant.status, 0, financeGrant.stdout + financeGrant.stderr);

  admin = new ApiClient(baseUrl);
  const login = await admin.post('/api/auth/admin-login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    accessKey: ADMIN_ACCESS_KEY,
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));

  tenant = await register({
    name: 'Phase 7 Tenant',
    email: uniqueEmail('phase7-tenant'),
    phone: '+233 20 555 0701',
    password: PASSWORD,
    role: 'tenant',
  });
  landlord = await register({
    name: 'Phase 7 Landlord',
    email: uniqueEmail('phase7-landlord'),
    phone: '+233 20 555 0703',
    password: PASSWORD,
    role: 'landlord',
    providerCategory: 'landlord',
    city: 'Accra',
  });

  state.tenantId = tenant.user.id;
  state.landlordId = landlord.user.id;
});

after(() => {
  server?.stop();
});

// ---------------------------------------------------------------------------
describe('E1 — the rent-receipt endpoints are gone, not restricted', () => {
  test('every role gets 404 on the list, a single record and creation', async () => {
    const guest = new ApiClient(baseUrl);
    const roles = [
      ['guest', guest],
      ['tenant', tenant.client],
      ['landlord', landlord.client],
      ['admin', admin],
    ];
    for (const [label, client] of roles) {
      assert.equal((await client.get('/api/receipts')).status, 404, `${label}: list`);
      assert.equal((await client.get('/api/receipts/rec-anything')).status, 404, `${label}: single`);
      assert.equal((await client.post('/api/receipts', {})).status, 404, `${label}: create`);
    }
  });

  test('a removed endpoint answers like any unknown endpoint', async () => {
    const unknown = await tenant.client.get('/api/this-route-never-existed');
    const receipts = await tenant.client.get('/api/receipts');
    assert.equal(receipts.status, unknown.status);
    assert.match(String(receipts.body.error), /not found/i);
  });
});

// ---------------------------------------------------------------------------
describe('E1 — the stored history is preserved', () => {
  test('a receipt row written to the table is still there, untouched', async () => {
    const planted = runPhpScript(
      'tests/create-receipt.php',
      [
        `--tenant-user=${state.tenantId}`,
        `--landlord-user=${state.landlordId}`,
        '--tenant-name=Phase 7 Tenant',
        '--landlord-name=Phase 7 Landlord',
        '--tenant-phone=+233 20 555 0701',
        '--amount=4800',
      ],
      env
    );
    assert.equal(planted.status, 0, planted.stdout + planted.stderr);
    state.receiptId = JSON.parse(planted.stdout.trim()).id;
    assert.ok(state.receiptId);

    const inspected = runPhpScript(
      'tests/sqlite-tool.php',
      [
        `--path=${dbPath}`,
        '--mode=query',
        `--sql=SELECT id, amount_ghs, tenant_name, landlord_user_id FROM rent_receipts WHERE id = '${state.receiptId}'`,
      ],
      env
    );
    assert.equal(inspected.status, 0, inspected.stdout + inspected.stderr);
    const rows = JSON.parse(inspected.stdout.trim()).rows;
    assert.equal(rows.length, 1, 'the record is still stored');
    assert.equal(Number(rows[0].amount_ghs), 4800);
    assert.equal(rows[0].tenant_name, 'Phase 7 Tenant');
    assert.equal(rows[0].landlord_user_id, state.landlordId, 'the link to the landlord is untouched');
  });

  test('the table is still part of the schema and was never dropped', async () => {
    const tables = runPhpScript('tests/sqlite-tool.php', [`--path=${dbPath}`, '--mode=tables'], env);
    assert.equal(tables.status, 0, tables.stdout + tables.stderr);
    const names = JSON.parse(tables.stdout.trim()).tables;
    for (const table of ['rent_receipts', 'fee_remittances', 'fee_policies', 'rental_commissions']) {
      assert.ok(names.includes(table), `${table} must still exist`);
    }

    // No migration in this phase removes anything: the upgrade is additive only.
    const migrate = read('php-backend/migrate.php');
    assert.ok(!/DROP\s+TABLE/i.test(migrate), 'no destructive migration exists');
    assert.ok(!/DELETE\s+FROM\s+rent_receipts/i.test(migrate.replace(/\s+/g, ' ')));
  });

  test('the fee ledger, its reversals and the fee policies still work', async () => {
    const remittances = await admin.get('/api/admin/finance/remittances');
    assert.equal(remittances.status, 200, JSON.stringify(remittances.body));

    const fees = await admin.get('/api/admin/viewing-fees');
    assert.equal(fees.status, 200, JSON.stringify(fees.body));

    const policies = await admin.get('/api/admin/fee-policies');
    assert.ok([200, 403].includes(policies.status), JSON.stringify(policies.body));

    // The reversal endpoint belongs to the fee ledger and must still be routed.
    // An unknown record is refused *by the handler*, which is the distinction
    // that matters: the router must not be what answers.
    const reverse = await admin.post('/api/admin/finance/receipts/does-not-exist/reverse', {
      amountGhs: 10,
      reason: 'Checking the reversal route survived the rent-receipt removal.',
    });
    assert.doesNotMatch(String(reverse.body.error), /endpoint not found/i, 'the router did not reject the path');
    assert.match(String(reverse.body.error), /does not exist|not found/i, JSON.stringify(reverse.body));
  });
});

// ---------------------------------------------------------------------------
describe('E1 — the client no longer has the feature', () => {
  test('the receipt screen and its route are deleted', () => {
    assert.equal(exists('src/components/ReceiptsView.tsx'), false, 'ReceiptsView is gone');

    const routes = read('src/routing/routes.ts');
    assert.ok(!/['"]receipts['"]/.test(routes), 'no receipts route name');
    assert.ok(!/\/receipts/.test(routes), 'no /receipts path');

    const app = read('src/App.tsx');
    assert.ok(!/ReceiptsView/.test(app), 'the view is not imported or rendered');
  });

  test('no menu, dashboard or shell offers a receipt destination', () => {
    const files = [
      'src/navigation/navModel.ts',
      'src/components/dashboard/DashboardShell.tsx',
      'src/components/LandlordDashboard.tsx',
      'src/components/TenantDashboard.tsx',
      'src/components/AdminDashboard.tsx',
    ];
    for (const file of files) {
      const source = read(file);
      assert.ok(!/\/landlord\/receipts|\/receipts/.test(source), `${file} links to no receipt page`);
      assert.ok(!/ReceiptsView/.test(source), `${file} does not render the receipt view`);
    }
    assert.ok(!/Payment records/i.test(read('src/components/TenantDashboard.tsx')));
    assert.ok(!/Payment records/i.test(read('src/components/dashboard/DashboardShell.tsx')));
  });

  test('the client has no receipt state, API method or type', () => {
    const context = read('src/context/AppContext.tsx');
    assert.ok(!/listReceipts|createReceipt|receiptIssuingEnabled/.test(context), 'no receipt state');

    const api = read('src/services/apiService.ts');
    assert.ok(!/listReceipts|createReceipt\(/.test(api), 'no receipt client methods');
    // The fee-ledger reversal call is a different system and stays.
    assert.match(api, /reverseReceipt/);

    const types = read('src/types.ts');
    assert.ok(!/RentReceipt/.test(types), 'the RentReceipt type is gone');
  });

  test('the server has no issuing switch left to flip', () => {
    const config = read('php-backend/config.php');
    assert.ok(!/RECEIPT_ISSUING_ENABLED/.test(config), 'the switch was removed with the feature');
    const api = read('php-backend/lib/api.php');
    assert.ok(!/handle_list_receipts|handle_get_receipt|handle_create_receipt/.test(api));
    const repo = read('php-backend/lib/repository.php');
    assert.ok(!/function (create_receipt|list_receipts|find_receipt|shape_receipt|user_can_read_receipt)\(/.test(repo));
  });
});
