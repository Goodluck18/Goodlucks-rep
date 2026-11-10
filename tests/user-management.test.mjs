/**
 * Goodlucks Homes — Upgrade 2 · Phase 3
 * Administrator user directory, profiles and activity (A11, A13, A14).
 *
 * The console is only as truthful as the endpoints behind it, so this suite
 * drives the API directly and asserts the things the screen claims:
 *
 *   - every account is findable by name, email address and phone number;
 *   - the role and verification filters return exactly the matching rows;
 *   - a profile shows that person's real listings, favourites, requests and
 *     viewings — and never a password hash or a document reference;
 *   - the activity feed is built from stored records with timestamps;
 *   - the capabilities are enforced server-side and stay separate: an
 *     administrator with the directory but not the activity capability can open
 *     a profile and does not receive the history.
 *
 *   node --test tests/user-management.test.mjs
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
const dbPath = path.join(dataDir, `users-${stamp}.sqlite`);
const privateDir = path.join(dataDir, `users-private-${stamp}`);
const port = 9200 + Math.floor(Math.random() * 90);

const ADMIN_EMAIL = 'directory.admin@test.local';
const ADMIN_PASSWORD = 'Directory-Admin-Password-123';
const ADMIN_ACCESS_KEY = 'directory-test-key';
const OTHER_ADMIN_EMAIL = 'directory.other@test.local';
const OTHER_ADMIN_PASSWORD = 'Directory-Other-Password-123';
const LIMITED_ADMIN_EMAIL = 'directory.limited@test.local';
const LIMITED_ADMIN_PASSWORD = 'Directory-Limited-Password-123';

const TENANT_PHONE = '+233 24 555 1234';
const TENANT_NAME = 'Directory Tenant';
const LANDLORD_NAME = 'Directory Landlord';
const AGENT_NAME = 'Directory Agent';

let server;
let baseUrl;
const state = {};

const uniqueEmail = (prefix) => `${prefix}-${stamp}@example.com`;

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
    TENANT_REQUEST_RATE_LIMIT_PER_HOUR: '200',
  };
  state.env = env;

  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  for (const [email, password, name] of [
    [ADMIN_EMAIL, ADMIN_PASSWORD, 'Directory Admin'],
    [OTHER_ADMIN_EMAIL, OTHER_ADMIN_PASSWORD, 'Other Admin'],
    [LIMITED_ADMIN_EMAIL, LIMITED_ADMIN_PASSWORD, 'Limited Admin'],
  ]) {
    const bootstrap = runPhpScript(
      'php-backend/admin_bootstrap.php',
      [`--email=${email}`, `--password=${password}`, `--name=${name}`],
      env
    );
    assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);
  }

  // The working administrator holds both Phase 3 directory capabilities.
  const grant = runPhpScript(
    'php-backend/grant_directory.php',
    [`--email=${ADMIN_EMAIL}`, '--users=1', '--activity=1'],
    env
  );
  assert.equal(grant.status, 0, grant.stdout + grant.stderr);
  assert.match(grant.stdout, /Users\s*:\s*granted/i);

  // A second administrator holds the directory but NOT the activity history,
  // so the separation between the two powers can be proven.
  const limitedGrant = runPhpScript(
    'php-backend/grant_directory.php',
    [`--email=${LIMITED_ADMIN_EMAIL}`, '--users=1', '--activity=0'],
    env
  );
  assert.equal(limitedGrant.status, 0, limitedGrant.stdout + limitedGrant.stderr);

  state.admin = new ApiClient(baseUrl);
  state.otherAdmin = new ApiClient(baseUrl);
  state.limitedAdmin = new ApiClient(baseUrl);
  state.guest = new ApiClient(baseUrl);
  state.tenant = new ApiClient(baseUrl);
  state.landlord = new ApiClient(baseUrl);
  state.agent = new ApiClient(baseUrl);

  for (const [client, email, password] of [
    [state.admin, ADMIN_EMAIL, ADMIN_PASSWORD],
    [state.otherAdmin, OTHER_ADMIN_EMAIL, OTHER_ADMIN_PASSWORD],
    [state.limitedAdmin, LIMITED_ADMIN_EMAIL, LIMITED_ADMIN_PASSWORD],
  ]) {
    const login = await client.post('/api/auth/admin-login', {
      email,
      password,
      accessKey: ADMIN_ACCESS_KEY,
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
  }

  const createUser = (email, password, name, role, phone = '') => {
    const args = [`--email=${email}`, `--password=${password}`, `--name=${name}`, `--role=${role}`];
    if (phone !== '') args.push(`--phone=${phone}`);
    const script = runPhpScript('tests/create-user.php', args, env);
    assert.equal(script.status, 0, script.stdout + script.stderr);
  };

  state.tenantEmail = uniqueEmail('directory-tenant');
  state.landlordEmail = uniqueEmail('directory-landlord');
  state.agentEmail = uniqueEmail('directory-agent');

  createUser(state.tenantEmail, 'Tenant-Password-123', TENANT_NAME, 'tenant', TENANT_PHONE);
  createUser(state.landlordEmail, 'Landlord-Password-123', LANDLORD_NAME, 'landlord', '+233 20 999 0001');
  createUser(state.agentEmail, 'Agent-Password-123', AGENT_NAME, 'agent', '+233 20 999 0002');

  for (const [client, email, password] of [
    [state.tenant, state.tenantEmail, 'Tenant-Password-123'],
    [state.landlord, state.landlordEmail, 'Landlord-Password-123'],
    [state.agent, state.agentEmail, 'Agent-Password-123'],
  ]) {
    const login = await client.post('/api/auth/login', { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
  }

  const me = await state.tenant.get('/api/auth/me');
  assert.equal(me.status, 200);
  state.tenantId = me.body.user.id;

  const landlordMe = await state.landlord.get('/api/auth/me');
  state.landlordId = landlordMe.body.user.id;

  const agentMe = await state.agent.get('/api/auth/me');
  state.agentId = agentMe.body.user.id;

  // Two real listings, so the profile's counts and the feed have something to
  // count. They start pending, exactly as a landlord's submission does.
  for (const title of ['Directory Listing One', 'Directory Listing Two']) {
    const created = await state.landlord.post('/api/properties', {
      title,
      location: 'East Legon, Accra',
      city: 'Accra',
      rentGhs: 5000,
      bedrooms: 3,
      bathrooms: 2,
      propertyType: 'Townhouse',
      description: 'A listing created so the administrator directory has real records to show.',
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
      availability: 'Available Now',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    if (!state.propertyId) state.propertyId = created.body.property.id;
  }

  // The first listing is published, so it can be saved and enquired about the
  // way a real visitor would (a pending listing is correctly invisible).
  const approved = await state.admin.post(`/api/properties/${state.propertyId}/status`, { status: 'active' });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));

  // A favourite, a rental request and a web enquiry, all belonging to the tenant.
  const saved = await state.tenant.post('/api/saved-properties', { propertyId: state.propertyId });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  const request = await state.tenant.post('/api/tenant-requests', {
    tenantName: TENANT_NAME,
    tenantPhone: TENANT_PHONE,
    tenantEmail: state.tenantEmail,
    preferredLocations: ['East Legon'],
    budgetMin: 3000,
    budgetMax: 8000,
    bedrooms: 2,
    bathrooms: 2,
    propertyType: 'Apartment',
    moveInDate: new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10),
    notes: 'Directory suite fixture.',
  });
  assert.equal(request.status, 201, JSON.stringify(request.body));
  state.requestId = request.body.requestId;

  const enquiry = await state.guest.post('/api/enquiries', {
    name: TENANT_NAME,
    email: state.tenantEmail,
    phone: TENANT_PHONE,
    message: 'Please tell me more about the East Legon listing in your directory.',
    propertyId: state.propertyId,
  });
  assert.equal(enquiry.status, 201, JSON.stringify(enquiry.body));
});

after(() => {
  server?.stop();
});

describe('A11: the user directory searches real accounts', () => {
  test('every seeded account is in the directory', async () => {
    const res = await state.admin.get('/api/admin/users?perPage=100');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.total >= 6, `expected at least 6 accounts, got ${res.body.total}`);

    const emails = res.body.users.map((user) => user.email.toLowerCase());
    for (const email of [ADMIN_EMAIL, state.tenantEmail, state.landlordEmail, state.agentEmail]) {
      assert.ok(emails.includes(email.toLowerCase()), `${email} should be listed`);
    }
  });

  test('search matches a name, an email address and a phone number', async () => {
    const byName = await state.admin.get('/api/admin/users?q=Directory%20Landlord');
    assert.equal(byName.status, 200);
    assert.ok(byName.body.users.every((user) => /directory landlord/i.test(user.name)));
    assert.ok(byName.body.users.some((user) => user.email === state.landlordEmail));

    const byEmail = await state.admin.get(`/api/admin/users?q=${encodeURIComponent(state.landlordEmail)}`);
    assert.equal(byEmail.body.total, 1);
    assert.equal(byEmail.body.users[0].email, state.landlordEmail);

    // Phone numbers are stored with spaces and a country code; the search
    // compares digits, so the raw digits must find the account.
    const digits = TENANT_PHONE.replace(/\D+/g, '');
    const byPhone = await state.admin.get(`/api/admin/users?q=${digits}`);
    assert.equal(byPhone.status, 200);
    assert.ok(
      byPhone.body.users.some((user) => user.email === state.tenantEmail),
      `expected the tenant for phone ${digits}`
    );

    const nothing = await state.admin.get('/api/admin/users?q=no-such-person-anywhere');
    assert.equal(nothing.body.total, 0);
    assert.deepEqual(nothing.body.users, []);
  });

  test('role and verification filters return exactly the matching rows', async () => {
    const tenants = await state.admin.get('/api/admin/users?role=tenant&perPage=100');
    assert.equal(tenants.status, 200);
    assert.ok(tenants.body.users.length >= 1);
    assert.ok(tenants.body.users.every((user) => user.role === 'tenant'));
    assert.ok(tenants.body.users.some((user) => user.email === state.tenantEmail));

    const agents = await state.admin.get('/api/admin/users?role=agent&perPage=100');
    assert.ok(agents.body.users.every((user) => user.role === 'agent'));
    assert.ok(agents.body.users.some((user) => user.email === state.agentEmail));

    // Accounts created by the fixture script are not verified, so the verified
    // filter must not contain them and the unverified filter must.
    const verified = await state.admin.get('/api/admin/users?status=verified&perPage=100');
    assert.ok(verified.body.users.every((user) => user.isVerified === true));
    assert.ok(!verified.body.users.some((user) => user.email === state.tenantEmail));

    const unverified = await state.admin.get('/api/admin/users?status=unverified&perPage=100');
    assert.ok(unverified.body.users.every((user) => user.isVerified === false));
    assert.ok(unverified.body.users.some((user) => user.email === state.tenantEmail));
  });

  test('an unknown filter is refused instead of silently ignored', async () => {
    const res = await state.admin.get('/api/admin/users?status=suspended');
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.status.includes('verified'));
  });

  test('paging walks the directory without gaps or repeats', async () => {
    const first = await state.admin.get('/api/admin/users?perPage=2&page=1');
    const second = await state.admin.get('/api/admin/users?perPage=2&page=2');
    assert.equal(first.status, 200);
    assert.equal(first.body.users.length, 2);
    assert.equal(second.body.page, 2);
    assert.equal(first.body.total, second.body.total);

    const overlap = first.body.users.filter((user) =>
      second.body.users.some((other) => other.id === user.id)
    );
    assert.deepEqual(overlap, []);
  });

  test('no account row ever carries a password hash', async () => {
    const res = await state.admin.get('/api/admin/users?perPage=100');
    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes('password_hash'));
    assert.ok(!raw.includes('passwordHash'));
    assert.ok(!/\$2y\$\d\d\$/.test(raw), 'a bcrypt hash appeared in the directory response');
  });
});

describe('A13: a profile shows that person\'s real records', () => {
  test('the tenant profile counts the listings, favourite, request and enquiry', async () => {
    const res = await state.admin.get(`/api/admin/users/${state.tenantId}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const user = res.body.user;
    assert.equal(user.email, state.tenantEmail);
    assert.equal(user.role, 'tenant');
    assert.equal(user.counts.saved, 1);
    assert.equal(user.counts.requests, 1);
    assert.equal(user.counts.enquiries, 1);

    const raw = JSON.stringify(res.body);
    assert.ok(!raw.includes('password_hash'));
    assert.ok(!raw.includes('storage/private'), 'a private storage path appeared in the profile');
  });

  test('the landlord profile counts both listings and shows their state', async () => {
    const res = await state.admin.get(`/api/admin/users/${state.landlordId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.counts.properties, 2);
    assert.equal(res.body.user.landlordState.listings, 2);
    assert.equal(res.body.user.landlordState.activeListings, 1);
    assert.equal(res.body.user.landlordState.pendingListings, 1);
  });

  test('the history is made of stored records with timestamps', async () => {
    const res = await state.admin.get(`/api/admin/users/${state.tenantId}/activity`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const kinds = res.body.activity.map((entry) => entry.kind);
    assert.ok(kinds.includes('saved'), 'the favourite should be in the history');
    assert.ok(kinds.includes('request'), 'the rental request should be in the history');
    assert.ok(kinds.includes('enquiry'), 'the web enquiry should be in the history');

    for (const entry of res.body.activity) {
      assert.ok(entry.title.length > 0);
      assert.ok(!Number.isNaN(new Date(entry.at).getTime()), `bad timestamp: ${entry.at}`);
    }
  });

  test('an unknown account is a 404, not an empty profile', async () => {
    const res = await state.admin.get('/api/admin/users/user-does-not-exist');
    assert.equal(res.status, 404);
  });
});

describe('A14: the activity feed is built from real records', () => {
  test('the feed lists recent registrations, listings, requests and enquiries', async () => {
    const res = await state.admin.get('/api/admin/activity?limit=40');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.activity.length > 0);

    const titles = res.body.activity.map((entry) => entry.title).join(' | ');
    assert.ok(/registered as/i.test(titles), 'a registration should be in the feed');
    assert.ok(/Directory Listing One/.test(titles), 'a new listing should be in the feed');
    assert.ok(/Rental request from Directory Tenant/i.test(titles), 'a rental request should be in the feed');
    assert.ok(/Web inquiry from Directory Tenant/i.test(titles), 'a web enquiry should be in the feed');

    for (const entry of res.body.activity) {
      assert.ok(!Number.isNaN(new Date(entry.at).getTime()));
      assert.ok(typeof entry.tab === 'string' && entry.tab.length > 0, 'each entry names its console tab');
    }

    // Newest first.
    const times = res.body.activity.map((entry) => new Date(entry.at).getTime());
    for (let index = 1; index < times.length; index++) {
      assert.ok(times[index - 1] >= times[index], 'the feed is not ordered newest first');
    }
  });
});

describe('Capabilities are enforced on the server and stay separate', () => {
  test('an administrator without the capability cannot open the directory', async () => {
    const list = await state.otherAdmin.get('/api/admin/users');
    assert.equal(list.status, 403);
    const profile = await state.otherAdmin.get(`/api/admin/users/${state.tenantId}`);
    assert.equal(profile.status, 403);
    const feed = await state.otherAdmin.get('/api/admin/activity');
    assert.equal(feed.status, 403);
  });

  test('the directory capability does not carry the activity capability', async () => {
    const list = await state.limitedAdmin.get('/api/admin/users');
    assert.equal(list.status, 200);

    const profile = await state.limitedAdmin.get(`/api/admin/users/${state.tenantId}`);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.canViewActivity, false);
    assert.deepEqual(profile.body.activity, [], 'the history must not be sent without the capability');

    const activity = await state.limitedAdmin.get(`/api/admin/users/${state.tenantId}/activity`);
    assert.equal(activity.status, 403);

    const feed = await state.limitedAdmin.get('/api/admin/activity');
    assert.equal(feed.status, 403);
  });

  test('an ordinary account and a visitor are refused', async () => {
    assert.equal((await state.tenant.get('/api/admin/users')).status, 403);
    assert.equal((await state.tenant.get('/api/admin/activity')).status, 403);
    assert.equal((await state.guest.get('/api/admin/users')).status, 401);
    assert.equal((await state.guest.get('/api/admin/activity')).status, 401);
  });

  test('/auth/me tells the console what it may show', async () => {
    const mine = await state.admin.get('/api/auth/me');
    assert.equal(mine.status, 200);
    assert.equal(mine.body.user.capabilities.manageUsers, true);
    assert.equal(mine.body.user.capabilities.viewUserActivity, true);
    assert.equal(mine.body.user.capabilities.sendBulkEmail, false);

    const limited = await state.limitedAdmin.get('/api/auth/me');
    assert.equal(limited.body.user.capabilities.manageUsers, true);
    assert.equal(limited.body.user.capabilities.viewUserActivity, false);
  });
});
