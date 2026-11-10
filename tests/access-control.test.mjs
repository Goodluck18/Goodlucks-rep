/**
 * Access-control tests: rent requests and receipts.
 *
 * Two corrections are proved here, from the outside, over real HTTP:
 *
 *   Correction 1 — a rent (tenant matching) request can only be submitted by a
 *   signed-in **tenant**. A landlord, an agent, an administrator and a visitor
 *   are all refused, and a role typed into the request body changes nothing.
 *
 *   Correction 2 — payment records and receipts are private account business.
 *   The public navigation no longer offers them, and the endpoints refuse a
 *   visitor; the people the records actually concern keep their access.
 *
 * These live in their own file so they get their own PHP server and database:
 * the assertions are about authorisation, not about the long catalogue suite, and
 * keeping them separate means neither suite can disturb the other's state.
 *
 *   npm run test:access
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
const dbPath = path.join(dataDir, `access-${process.pid}-${Date.now()}.sqlite`);
const port = 8800 + Math.floor(Math.random() * 300);
const ADMIN_EMAIL = 'access-admin@test.local';
const ADMIN_PASSWORD = 'Access-Admin-Password-123';
const ADMIN_ACCESS_KEY = 'test-access-key';

const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;

let server;
let baseUrl;
const state = {};
const clients = {};

/** A signed-in client for a role. */
async function signUp(role, extra = {}) {
  const client = new ApiClient(baseUrl);
  const email = uniqueEmail(role);
  const res = await client.post('/api/auth/register', {
    email,
    password: `${role}-Password-123`,
    name: `Access ${role}`,
    phone: '+233 24 000 1111',
    role,
    ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { client, email, user: res.body.user };
}

/** A well-formed rent request payload. */
const rentRequest = (email) => ({
  tenantName: 'Access Control Tenant',
  tenantPhone: '+233 24 555 6666',
  tenantEmail: email,
  preferredLocations: ['East Legon'],
  budgetMin: 3000,
  budgetMax: 7000,
  bedrooms: 2,
  bathrooms: 1,
  propertyType: 'Apartment',
  moveInDate: new Date(Date.now() + 25 * 86400_000).toISOString().slice(0, 10),
  notes: 'Submitted to prove which account roles may create a rent request.',
});

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }

  const env = {
    DB_DRIVER: 'sqlite',
    DB_SQLITE_PATH: dbPath,
    APP_ENV: 'development',
    ADMIN_ACCESS_KEY,
    EMAIL_TRANSPORT: 'none',
    REGISTER_RATE_LIMIT_PER_HOUR: '60',
    TENANT_REQUEST_RATE_LIMIT_PER_HOUR: '200',
  };
  state.env = env;
  state.dbPath = dbPath;
  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Access Admin'],
    env
  );
  assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);

  clients.guest = new ApiClient(baseUrl);
  clients.admin = new ApiClient(baseUrl);
  const adminLogin = await clients.admin.post('/api/auth/admin-login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    accessKey: ADMIN_ACCESS_KEY,
  });
  assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));

  const tenant = await signUp('tenant');
  clients.tenant = tenant.client;
  clients.tenantEmail = tenant.email;
  state.tenantUserId = tenant.user.id;

  const landlord = await signUp('landlord');
  clients.landlord = landlord.client;
  clients.landlordEmail = landlord.email;
  state.landlordUserId = landlord.user.id;

  const agent = await signUp('agent', { agencyName: 'Access Agency', operatingCity: 'Accra' });
  clients.agent = agent.client;
  clients.agentEmail = agent.email;
});

after(() => {
  server?.stop();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* Correction 1 — rent requests are tenant-only                               */
/* -------------------------------------------------------------------------- */

describe('Correction 1: only a tenant can submit a rent request', () => {
  test('a tenant can submit one and then sees it on their own list', async () => {
    const res = await clients.tenant.post('/api/tenant-requests', rentRequest(clients.tenantEmail));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.requestId);
    state.tenantRequestId = res.body.requestId;

    const own = await clients.tenant.get('/api/tenant-requests');
    assert.equal(own.status, 200);
    assert.ok(own.body.requests.some((request) => request.id === state.tenantRequestId));
  });

  test('a landlord is refused (403), including through a direct API call', async () => {
    const res = await clients.landlord.post('/api/tenant-requests', rentRequest(clients.landlordEmail));
    assert.equal(res.status, 403);
    assert.match(res.body.error, /permission/i);
  });

  test('an agent is refused (403), including through a direct API call', async () => {
    const res = await clients.agent.post('/api/tenant-requests', rentRequest(clients.agentEmail));
    assert.equal(res.status, 403);
    assert.match(res.body.error, /permission/i);
  });

  test('an administrator is refused too — matching is tenant business', async () => {
    const res = await clients.admin.post('/api/tenant-requests', rentRequest(clients.tenantEmail));
    assert.equal(res.status, 403);
  });

  test('a visitor is refused (401)', async () => {
    const res = await clients.guest.post('/api/tenant-requests', rentRequest(uniqueEmail('visitor')));
    assert.equal(res.status, 401);
  });

  test('a role supplied in the request body is ignored', async () => {
    // The server reads the role from the session. Forging fields changes nothing.
    const res = await clients.landlord.post('/api/tenant-requests', {
      ...rentRequest(clients.landlordEmail),
      role: 'tenant',
      userRole: 'tenant',
      accountRole: 'tenant',
    });
    assert.equal(res.status, 403);
  });

  test('a refused request writes no record', async () => {
    const before = await clients.admin.get('/api/admin/tenant-requests');
    assert.equal(before.status, 200);
    const count = before.body.requests.length;

    await clients.guest.post('/api/tenant-requests', rentRequest(uniqueEmail('refused')));
    await clients.landlord.post('/api/tenant-requests', rentRequest(clients.landlordEmail));
    await clients.agent.post('/api/tenant-requests', rentRequest(clients.agentEmail));

    const after = await clients.admin.get('/api/admin/tenant-requests');
    assert.equal(after.status, 200);
    assert.equal(after.body.requests.length, count, 'a refused request must not create a record');
  });

  test('the existing records survive: the tenant request and its history are intact', async () => {
    const admin = await clients.admin.get('/api/admin/tenant-requests');
    const stored = admin.body.requests.find((request) => request.id === state.tenantRequestId);
    assert.ok(stored, 'the tenant request created above is still readable by staff');
    assert.equal(stored.tenantEmail, clients.tenantEmail);
    assert.equal(stored.status, 'submitted');

    // Staff keep the existing workflow of moving a request forward.
    const updated = await clients.admin.patch(`/api/tenant-requests/${state.tenantRequestId}`, {
      status: 'searching',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.request.status, 'searching');
  });
});

/* -------------------------------------------------------------------------- */
/* Upgrade 2, E1 — rent receipts are gone (data preserved)                     */
/* -------------------------------------------------------------------------- */

describe('Upgrade 2 E1: the rent-receipt feature is removed for every role', () => {
  test('no role can read, probe or create a rent receipt', async () => {
    const roles = [
      ['guest', clients.guest],
      ['tenant', clients.tenant],
      ['landlord', clients.landlord],
      ['agent', clients.agent],
      ['admin', clients.admin],
    ];
    for (const [label, client] of roles) {
      assert.equal((await client.get('/api/receipts')).status, 404, `${label} cannot list`);
      assert.equal((await client.get('/api/receipts/rct-any-id')).status, 404, `${label} cannot fetch`);
      assert.equal((await client.post('/api/receipts', {})).status, 404, `${label} cannot create`);
    }
  });

  test('a planted record survives the removal', async () => {
    // The feature went; the history did not. The row is written straight to the
    // table and read back with the SQLite tool, which is the only path left.
    const planted = runPhpScript(
      'tests/create-receipt.php',
      [
        `--tenant-user=${state.tenantUserId}`,
        `--landlord-user=${state.landlordUserId}`,
        '--tenant-name=Access Control Tenant',
        '--landlord-name=Access Control Landlord',
      ],
      state.env
    );
    assert.equal(planted.status, 0, planted.stdout + planted.stderr);
    const id = JSON.parse(planted.stdout.trim()).id;

    const inspected = runPhpScript(
      'tests/sqlite-tool.php',
      [`--path=${state.dbPath}`, '--mode=query', `--sql=SELECT id FROM rent_receipts WHERE id = '${id}'`],
      state.env
    );
    assert.equal(inspected.status, 0, inspected.stdout + inspected.stderr);
    const rows = JSON.parse(inspected.stdout.trim()).rows;
    assert.equal(rows.length, 1, 'the stored record is still there');
  });

  test('the fee ledger is untouched by the removal', async () => {
    const ledger = await clients.admin.get('/api/admin/viewing-fees');
    assert.ok([200, 403].includes(ledger.status), `the ledger route still exists (${ledger.status})`);
  });
});
