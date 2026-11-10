/**
 * Upgrade 2 — Phase 7: tenant rent receipts removed (E1).
 *
 * The requirement is narrow and easy to get wrong in either direction: tenants
 * lose the rent-receipt feature, and **nothing else changes**. In particular the
 * stored rows (`rent_receipts`, `fee_remittances`) and the fee policies that were
 * built on top of them are financial history and must survive untouched.
 *
 * So this suite checks both halves:
 *   * a tenant cannot list receipts, read one, or reach the screen;
 *   * staff and the linked landlord can still read the records, the row is still
 *     in the database, and the fee-policy API still answers.
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
const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;

let server;
let baseUrl;
let env;
let admin;
let tenant;
let landlord;
let otherTenant;
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
  otherTenant = await register({
    name: 'Phase 7 Other Tenant',
    email: uniqueEmail('phase7-tenant-two'),
    phone: '+233 20 555 0702',
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

  // Plant a receipt the way the backend would, then never touch it again.
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
});

after(() => {
  server?.stop();
});

// ---------------------------------------------------------------------------
describe('E1 — a tenant has no rent-receipt surface', () => {
  test('the tenant receives 403 on the list, the record and a stranger\'s record', async () => {
    const list = await tenant.client.get('/api/receipts');
    assert.equal(list.status, 403, 'the tenant view is removed, not merely hidden');

    const one = await tenant.client.get(`/api/receipts/${state.receiptId}`);
    assert.equal(one.status, 403, 'the record names this tenant and is still not theirs to read');

    const stranger = await otherTenant.client.get('/api/receipts');
    assert.equal(stranger.status, 403);
  });

  test('a signed-out visitor is still asked to sign in, not shown a tenant screen', async () => {
    const guest = new ApiClient(baseUrl);
    assert.equal((await guest.get('/api/receipts')).status, 401);
  });

  test('a tenant still cannot create a record', async () => {
    const res = await tenant.client.post('/api/receipts', {});
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
describe('E1 — the history itself is preserved', () => {
  test('the row is still stored and staff still read it', async () => {
    const list = await admin.get('/api/receipts');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const ids = list.body.receipts.map((row) => row.id);
    assert.ok(ids.includes(state.receiptId), 'the record was kept, not deleted');

    const one = await admin.get(`/api/receipts/${state.receiptId}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.receipt.id, state.receiptId);
    // The stored facts are unchanged by the removal of the screen.
    assert.equal(Number(one.body.receipt.amountGhs), 4800);
  });

  test('the linked landlord still reads their own records and nobody else\'s', async () => {
    const mine = await landlord.client.get('/api/receipts');
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.ok(mine.body.receipts.some((row) => row.id === state.receiptId));

    const otherLandlord = await register({
      name: 'Phase 7 Other Landlord',
      email: uniqueEmail('phase7-landlord-two'),
      phone: '+233 20 555 0704',
      password: PASSWORD,
      role: 'landlord',
      providerCategory: 'landlord',
      city: 'Accra',
    });
    const theirs = await otherLandlord.client.get('/api/receipts');
    assert.equal(theirs.status, 200);
    assert.ok(!theirs.body.receipts.some((row) => row.id === state.receiptId));
  });

  test('the fee-policy API still answers after the removal', async () => {
    // 200 for an administrator holding the fee-policy capability, 403 for one
    // without it — the point is that the route exists and answers honestly.
    const res = await admin.get('/api/admin/fee-policies');
    assert.ok([200, 403].includes(res.status), JSON.stringify(res.body));
    if (res.status === 200) {
      assert.ok(Array.isArray(res.body.policies ?? res.body.feePolicies ?? []));
    }
  });

  test('the remittance ledger still answers', async () => {
    const res = await admin.get('/api/admin/finance/remittances');
    // 200 when the ledger is readable, 403 when this admin lacks the finance
    // capability — what must not happen is a 404/500 from a removed route.
    assert.ok([200, 403].includes(res.status), JSON.stringify(res.body));
  });
});

// ---------------------------------------------------------------------------
describe('E1 — the screens agree with the API', () => {
  const tenantDashboard = read('src/components/TenantDashboard.tsx');
  const navModel = read('src/navigation/navModel.ts');
  const context = read('src/context/AppContext.tsx');
  const routes = read('src/routing/routes.ts');
  const api = read('php-backend/lib/api.php');

  test('the tenant dashboard no longer offers a payment-records action', () => {
    assert.ok(!/setCurrentView\('receipts'\)/.test(tenantDashboard));
    assert.ok(!/My payment records/i.test(tenantDashboard));
    assert.match(tenantDashboard, /My viewings/, 'the slot is filled with something the tenant can really do');
  });

  test('the tenant menu has no receipts entry', () => {
    const tenantSection = navModel.slice(navModel.indexOf('function tenantNav'), navModel.indexOf('function landlordNav'));
    assert.ok(!/receipts/.test(tenantSection), 'no receipt destination in the tenant navigation');
    // The landlord keeps their own payment records.
    const landlordSection = navModel.slice(navModel.indexOf('function landlordNav'));
    assert.match(landlordSection, /receipts/);
  });

  test('a tenant opening /receipts is sent back to their dashboard', () => {
    assert.match(routes, /route\.name === 'receipts' && role === 'tenant'/);
    assert.match(routes, /return \{ action: 'redirect', to: dashboardPath\('tenant'\) \}/);
  });

  test('the tenant branch of the app does not request receipts', () => {
    const tenantBranch = context.slice(context.indexOf('api.listTenantRequests().catch'));
    const firstCall = tenantBranch.slice(0, tenantBranch.indexOf('}, []);'));
    assert.ok(!/listReceipts/.test(firstCall), 'no tenant request for a removed feature');
  });

  test('the API route table still refuses tenants on both handlers', () => {
    const listHandler = api.slice(api.indexOf('function handle_list_receipts'));
    assert.match(listHandler.slice(0, 400), /require_auth\(\['admin', 'landlord'\]\)/);
    const getHandler = api.slice(api.indexOf('function handle_get_receipt'));
    assert.match(getHandler.slice(0, 400), /require_auth\(\['admin', 'landlord'\]\)/);
  });

  test('the records, the ledger and the policies are untouched by the removal', () => {
    const schema = read('php-backend/schema.sqlite.sql');
    assert.match(schema, /CREATE TABLE IF NOT EXISTS `?rent_receipts`?/);
    assert.match(schema, /CREATE TABLE IF NOT EXISTS `?fee_remittances`?/);
    assert.match(schema, /CREATE TABLE IF NOT EXISTS `?fee_policies`?/);
    // No migration in this phase drops or rewrites anything.
    const migrate = read('php-backend/migrate.php');
    assert.ok(!/DROP TABLE/i.test(migrate), 'no destructive migration was added');
  });
});
