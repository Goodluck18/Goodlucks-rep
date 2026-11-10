/**
 * Goodlucks Homes — Upgrade 2 · Phase 1 security fix
 * Tenant contact disclosure: a tenant's phone number and email address are not
 * handed to the agent or the landlord until an administrator approves sharing.
 *
 * This suite is deliberately adversarial: it walks every viewing endpoint that a
 * non-staff account can reach and asserts the contact fields are empty — and that
 * the bare strings do not appear anywhere in the raw response body either.
 *
 * What is covered:
 *   - agent list, agent detail, agent lifecycle responses  → withheld
 *   - landlord list                                        → withheld
 *   - tenant list and detail (their own record)            → visible
 *   - staff list and staff detail                          → visible
 *   - the state is explained, not just blanked
 *   - no email queued to an agent/landlord carries the contact
 *
 * The approval workflow itself (request → review → approve → revoke) ships in
 * Phase 5; until then nothing is approved for anybody, which is what these
 * assertions pin down.
 *
 *   node --test tests/tenant-contact.test.mjs
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
const stamp = `${process.pid}-${Date.now()}`;
const dbPath = path.join(dataDir, `tenant-contact-${stamp}.sqlite`);
const privateDir = path.join(dataDir, `tenant-contact-private-${stamp}`);
const port = 9000 + Math.floor(Math.random() * 90);

const ADMIN_EMAIL = 'contact.admin@test.local';
const ADMIN_PASSWORD = 'Contact-Admin-Password-123';
const ADMIN_ACCESS_KEY = 'tenant-contact-test-key';

const TENANT_PHONE = '+233 24 777 8888';
const TENANT_EMAIL = 'contact-tenant@example.com';

let server;
let baseUrl;
let admin;
let agent;
let landlord;
let tenant;
const state = {};

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(privateDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }

  const env = {
    DB_DRIVER: 'sqlite',
    DB_SQLITE_PATH: dbPath,
    APP_ENV: 'development',
    ADMIN_ACCESS_KEY,
    OFFICIAL_EMAIL: 'rentals@goodlucks.co',
    EMAIL_TRANSPORT: 'none',
    PRIVATE_UPLOAD_DIR: privateDir,
    IDENTITY_DATA_KEY: Buffer.alloc(32, 7).toString('base64'),
    REGISTER_RATE_LIMIT_PER_HOUR: '60',
    VIEWING_RATE_LIMIT_PER_HOUR: '200',
  };
  state.testEnv = env;

  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Contact Admin'],
    env
  );
  assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);

  admin = new ApiClient(baseUrl);
  agent = new ApiClient(baseUrl);
  landlord = new ApiClient(baseUrl);
  tenant = new ApiClient(baseUrl);

  const adminLogin = await admin.post('/api/auth/admin-login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    accessKey: ADMIN_ACCESS_KEY,
  });
  assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));

  const landlordRegister = await landlord.post('/api/auth/register', {
    email: `contact-landlord-${stamp}@example.com`,
    password: 'Landlord-Password-123',
    name: 'Contact Landlord',
    phone: '+233 20 111 2222',
    role: 'landlord',
  });
  assert.equal(landlordRegister.status, 201, JSON.stringify(landlordRegister.body));
  state.landlordId = landlordRegister.body.user.id;

  const agentRegister = await agent.post('/api/auth/register', {
    email: `contact-agent-${stamp}@example.com`,
    password: 'Agent-Password-123',
    name: 'Contact Agent',
    phone: '+233 20 333 4444',
    role: 'agent',
    agencyName: 'Contact Agency',
    operatingCity: 'Accra',
  });
  assert.equal(agentRegister.status, 201, JSON.stringify(agentRegister.body));
  state.agentId = agentRegister.body.user.id;

  const tenantRegister = await tenant.post('/api/auth/register', {
    email: TENANT_EMAIL,
    password: 'Tenant-Password-123',
    name: 'Contact Tenant',
    phone: TENANT_PHONE,
    role: 'tenant',
  });
  assert.equal(tenantRegister.status, 201, JSON.stringify(tenantRegister.body));
  state.tenantId = tenantRegister.body.user.id;

  // A landlord-owned listing, so the landlord has real access to the viewing.
  const property = await admin.post('/api/properties', {
    title: 'Contact Privacy Test Apartment',
    location: 'Labone, Accra',
    city: 'Accra',
    rentGhs: 4200,
    bedrooms: 2,
    bathrooms: 2,
    propertyType: 'Apartment',
    description: 'A listing created to prove that tenant contact details stay private until staff approve sharing.',
    images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
    amenities: ['Gated Security'],
    landlordId: state.landlordId,
  });
  assert.equal(property.status, 201, JSON.stringify(property.body));
  state.propertyId = property.body.property.id;

  // Approve the listing so it is visible/bookable, and activate the agent so the
  // viewing can be assigned to it (an inactive agent's viewing tools are closed).
  const approveProperty = await admin.post(`/api/properties/${state.propertyId}/status`, { status: 'active' });
  assert.equal(approveProperty.status, 200, JSON.stringify(approveProperty.body));

  const activateAgent = await admin.post(`/api/admin/agents/${state.agentId}/status`, {
    accountStatus: 'active',
    canSubmitListings: true,
  });
  assert.equal(activateAgent.status, 200, JSON.stringify(activateAgent.body));
});

after(() => {
  server?.stop();
});

describe('tenant contact is withheld from providers', () => {
  test('a tenant can request a viewing on the listing', async () => {
    const res = await tenant.post('/api/viewings', {
      propertyId: state.propertyId,
      tenantName: 'Contact Tenant',
      tenantPhone: TENANT_PHONE,
      tenantEmail: TENANT_EMAIL,
      date: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10),
      time: '10:00 AM',
      notes: 'Would like to see the apartment.',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    state.viewingId = res.body.viewingId;

    // The confirmation echoes the details the tenant just typed in this same
    // request — nothing is being disclosed to them.
    assert.equal(res.body.viewing.tenantPhone, TENANT_PHONE);
    assert.equal(res.body.viewing.tenantEmail, TENANT_EMAIL);

    // Reading the record back afterwards is the gated path, and the tenant is
    // always entitled to their own.
    const readBack = await tenant.get(`/api/viewings/${res.body.viewingId}`);
    assert.equal(readBack.status, 200, JSON.stringify(readBack.body));
    assert.equal(readBack.body.viewing.tenantContactVisible, true);
    assert.equal(readBack.body.viewing.tenantContactState, 'own_record');
  });

  test('staff assign the request to the agent', async () => {
    const res = await admin.post(`/api/admin/viewings/${state.viewingId}/assign-agent`, {
      agentUserId: state.agentId,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  test('the agent list shows the request without the contact details', async () => {
    const res = await agent.get('/api/viewings');
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const viewing = res.body.viewings.find((row) => row.id === state.viewingId);
    assert.ok(viewing, 'the assigned viewing is visible to the agent');

    assert.equal(viewing.tenantPhone, '');
    assert.equal(viewing.tenantEmail, '');
    assert.equal(viewing.tenantContactVisible, false);
    assert.equal(viewing.tenantContactState, 'withheld_pending_approval');
    assert.match(viewing.tenantContactReason, /administrator approves/i);

    // Nothing in the raw payload may contain the number or the address.
    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes('777 8888'), 'the phone number must not appear in the agent payload');
    assert.ok(!raw.includes('247778888'), 'the normalised phone number must not appear either');
    assert.ok(!raw.toLowerCase().includes(TENANT_EMAIL.toLowerCase()), 'the email must not appear');
  });

  test('the agent detail view is withheld too, and the name is still there', async () => {
    const res = await agent.get(`/api/viewings/${state.viewingId}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));

    assert.equal(res.body.viewing.tenantName, 'Contact Tenant');
    assert.equal(res.body.viewing.tenantPhone, '');
    assert.equal(res.body.viewing.tenantEmail, '');
    assert.equal(res.body.viewing.tenantContactVisible, false);

    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes('777 8888'));
    assert.ok(!raw.toLowerCase().includes(TENANT_EMAIL.toLowerCase()));
  });

  test('a lifecycle action the agent is allowed to take cannot leak the contact', async () => {
    const res = await agent.post(`/api/viewings/${state.viewingId}/propose`, {
      date: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10),
      time: '2:00 PM',
      note: 'Proposing an afternoon slot.',
    });
    // Whether or not the transition is permitted in this state, the payload must
    // never carry the tenant's contact details.
    if (res.body && res.body.viewing) {
      assert.equal(res.body.viewing.tenantPhone, '');
      assert.equal(res.body.viewing.tenantEmail, '');
      assert.equal(res.body.viewing.tenantContactVisible, false);
    }
    const raw = JSON.stringify(res.body ?? {});
    assert.ok(!raw.includes('777 8888'));
  });

  test('the landlord sees the viewing but not the tenant contact', async () => {
    const res = await landlord.get('/api/viewings');
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const viewing = res.body.viewings.find((row) => row.id === state.viewingId);
    assert.ok(viewing, 'the landlord sees viewings on their own listing');
    assert.equal(viewing.tenantPhone, '');
    assert.equal(viewing.tenantEmail, '');
    assert.equal(viewing.tenantContactVisible, false);
    assert.equal(viewing.tenantContactState, 'withheld_pending_approval');

    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes('777 8888'));
    assert.ok(!raw.toLowerCase().includes(TENANT_EMAIL.toLowerCase()));
  });
});

describe('staff and the tenant keep full visibility', () => {
  test('the tenant sees their own contact details in the list and the detail view', async () => {
    const list = await tenant.get('/api/viewings');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const mine = list.body.viewings.find((row) => row.id === state.viewingId);
    assert.ok(mine);
    assert.equal(mine.tenantPhone, TENANT_PHONE);
    assert.equal(mine.tenantEmail, TENANT_EMAIL);
    assert.equal(mine.tenantContactVisible, true);

    const detail = await tenant.get(`/api/viewings/${state.viewingId}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.viewing.tenantPhone, TENANT_PHONE);
    assert.equal(detail.body.viewing.tenantContactVisible, true);
  });

  test('staff see the contact details, because arranging the viewing needs them', async () => {
    const list = await admin.get('/api/admin/viewings');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const row = list.body.viewings.find((item) => item.id === state.viewingId);
    assert.ok(row);
    assert.equal(row.tenantPhone, TENANT_PHONE);
    assert.equal(row.tenantEmail, TENANT_EMAIL);
    assert.equal(row.tenantContactVisible, true);
    assert.equal(row.tenantContactState, 'staff');

    const detail = await admin.get(`/api/admin/viewings/${state.viewingId}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.viewing.tenantPhone, TENANT_PHONE);
  });

  test('an unrelated account cannot read the viewing at all', async () => {
    const stranger = new ApiClient(baseUrl);
    const register = await stranger.post('/api/auth/register', {
      email: `stranger-${stamp}@example.com`,
      password: 'Stranger-Password-123',
      name: 'Stranger Account',
      phone: '+233 20 999 0000',
      role: 'tenant',
    });
    assert.equal(register.status, 201, JSON.stringify(register.body));

    const res = await stranger.get(`/api/viewings/${state.viewingId}`);
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.ok(!JSON.stringify(res.body).includes('777 8888'));
  });
});

describe('no email to a provider carries the tenant contact', () => {
  test('every queued body addressed to the agent or landlord is free of the tenant contact', async () => {
    // Read the queue directly: the assertion is about what would actually be
    // delivered, body included, not just who it is addressed to.
    const dump = runPhpScript(
      'tests/sqlite-tool.php',
      [
        `--path=${dbPath}`,
        '--mode=query',
        '--sql=SELECT recipient_email, subject, body_html FROM email_outbox',
      ],
      state.testEnv
    );
    assert.equal(dump.status, 0, dump.stdout + dump.stderr);
    const parsed = JSON.parse(dump.stdout.trim().split('\n').pop());
    assert.equal(parsed.ok, true, dump.stdout);
    const rows = parsed.rows ?? [];
    assert.ok(rows.length >= 1, 'the viewing request queued at least one email');

    const providerPrefixes = [`contact-agent-${stamp}`, `contact-landlord-${stamp}`];
    const providerRows = rows.filter((row) =>
      providerPrefixes.some((prefix) => String(row.recipient_email ?? '').toLowerCase().startsWith(prefix))
    );

    // Whatever the providers did receive must not contain the tenant's details.
    for (const row of providerRows) {
      const body = String(row.body_html ?? '');
      assert.ok(!body.includes('777 8888'), `phone number leaked in: ${row.subject}`);
      assert.ok(!body.includes('247778888'), `normalised phone number leaked in: ${row.subject}`);
      assert.ok(
        !body.toLowerCase().includes(TENANT_EMAIL.toLowerCase()),
        `tenant email leaked in: ${row.subject}`
      );
    }

    // The staff notification keeps the contact (arranging the viewing needs it),
    // and it goes to the platform inbox, never to the provider.
    const staffRows = rows.filter((row) => /rentals@goodlucks\.co$/i.test(String(row.recipient_email ?? '')));
    assert.ok(staffRows.length >= 1, 'the viewing desk was notified');
    assert.ok(
      staffRows.some((row) => String(row.body_html ?? '').includes('777 8888')),
      'the staff notification still carries the contact it needs'
    );
  });
});
