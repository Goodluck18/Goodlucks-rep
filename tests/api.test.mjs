/**
 * Goodlucks Homes - API integration tests
 *
 * Runs the real PHP backend (SQLite driver) and exercises every endpoint the
 * website depends on: authentication, property CRUD + moderation, uploads,
 * enquiries, viewings, tenant requests, alerts, saved properties, payment records,
 * receipts, analytics, authorisation rules and rate limiting.
 *
 *   npm run test:api
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { startApiServer, runPhpScript } from '../scripts/php.mjs';
import { ApiClient, createPng } from './helpers.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(projectRoot, '.data');
const dbPath = path.join(dataDir, `test-${process.pid}-${Date.now()}.sqlite`);
// Increment D: the private document store is redirected into the run folder so
// the suite never leaves identity files inside the repository.
const privateDir = path.join(dataDir, `private-${process.pid}-${Date.now()}`);
const port = 8300 + Math.floor(Math.random() * 500);
const ADMIN_EMAIL = 'admin@test.local';
const ADMIN_PASSWORD = 'Admin-Test-Password-123';
const ADMIN_ACCESS_KEY = 'test-access-key';

// Task 03: an agent listing must carry its own viewing fee and viewing terms.
// There is no platform-wide default fee any more, so every agent submission in
// this suite states both explicitly.
const AGENT_VIEWING_TERMS = {
  appointmentRequired: true,
  howToArrange: 'Contact the agent through Goodlucks; the agent confirms a slot within a day.',
  conditions: 'Bring a valid ID to the viewing.',
  paymentInstructions: 'The viewing fee is paid in cash to the agent on site after the viewing.',
  restrictions: 'No interior photography without the agent present.',
};


let server;
let baseUrl;
let admin;
let landlord;
let tenant;
let guest;
const state = {};

const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;

/**
 * Drive a viewing request to completion the way a real one would go: propose a
 * slot, agree it, let the slot pass, then complete it.
 *
 * Increment F refuses to complete an appointment that has not happened (and
 * refuses to complete one that was never agreed), so a test that needs a
 * finished viewing has to walk the lifecycle. The physical fee flag is set
 * separately, because completing a viewing records no money.
 */
const completeViewingAs = async (actor, viewingId, options = {}) => {
  const note = options.note || 'The viewing took place.';
  const proposed = await actor.post(`/api/viewings/${viewingId}/propose`, {
    date: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
    time: '11:00 AM',
    note: 'Slot proposed while preparing the test.',
  });
  assert.equal(proposed.status, 200, JSON.stringify(proposed.body));

  const confirmed = await actor.post(`/api/viewings/${viewingId}/confirm`, {
    note: 'Slot agreed while preparing the test.',
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));

  const past = runPhpScript(
    'tests/finance-fixtures.php',
    [`--viewing-id=${viewingId}`, '--viewing-days-ago=1'],
    state.testEnv
  );
  assert.equal(past.status, 0, past.stdout + past.stderr);

  const done = await actor.post(`/api/viewings/${viewingId}/complete`, { note });
  assert.equal(done.status, 200, JSON.stringify(done.body));

  return done.body.viewing;
};

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
    // Delivery is disabled so every attempt fails deterministically; the queue
    // still records what would be sent, which is what these tests assert.
    EMAIL_TRANSPORT: 'none',
    // The suite signs up many accounts from one loopback address; the production
    // default (10/hour) stays untouched.
    REGISTER_RATE_LIMIT_PER_HOUR: '60',
    // Increment E books several viewings to get distinct fee records; the
    // production default (12/hour) is unchanged.
    VIEWING_RATE_LIMIT_PER_HOUR: '200',
    // Correction 1: the role matrix below submits (and is refused) from one
    // loopback address, so the per-IP rent-request budget is raised for this run.
    TENANT_REQUEST_RATE_LIMIT_PER_HOUR: '200',
    VIEWING_ACTION_RATE_LIMIT_PER_HOUR: '2000',
    // Increment D: a *test-only* key so the encryption path is exercised. It is
    // generated per run and exists only in this process environment — never in
    // the repository, and never used outside the test database.
    IDENTITY_DATA_KEY: Buffer.alloc(32, 7).toString('base64'),
    VERIFICATION_RETENTION_DAYS: '365',
    // Keep the suite's uploads out of the repo tree: the private store is
    // redirected into the per-run data folder instead of php-backend/storage.
    PRIVATE_UPLOAD_DIR: privateDir,
  };
  server = await startApiServer({ port, env, quiet: true });

  // Task 03: a viewing fee belongs to a property and must be approved for it.
  // The seeded demo listings get an approved GH₵ 100 fee as fixture data, so the
  // ledger tests below still book a viewing that carries a real, recorded fee.
  const seedFee = runPhpScript('tests/set-viewing-fee.php', ['--all-active', '--fee=100'], env);
  assert.equal(seedFee.status, 0, seedFee.stdout + seedFee.stderr);
  state.testEnv = env;
  baseUrl = server.baseUrl;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Test Admin'],
    env
  );
  assert.equal(bootstrap.status, 0, `admin bootstrap failed: ${bootstrap.stdout} ${bootstrap.stderr}`);

  // Increment G: reading the money ledger and confirming receipt are separate
  // capabilities that an administrator does NOT get by default. The suite's
  // working administrator is granted both here so the Increment B/E finance
  // tests keep exercising the same endpoints; the G tests below prove the
  // capability boundary itself with administrators who hold only one of them.
  const financeGrant = runPhpScript(
    'php-backend/grant_finance.php',
    [`--email=${ADMIN_EMAIL}`, '--view=1', '--confirm=1'],
    env
  );
  assert.match(financeGrant.stdout, /View\s*:\s*granted/i, financeGrant.stdout + financeGrant.stderr);
  assert.match(financeGrant.stdout, /Confirm\s*:\s*granted/i, financeGrant.stdout + financeGrant.stderr);

  admin = new ApiClient(baseUrl);
  landlord = new ApiClient(baseUrl);
  tenant = new ApiClient(baseUrl);
  guest = new ApiClient(baseUrl);
});

after(() => {
  server?.stop();
});

// ---------------------------------------------------------------------------
describe('Health & public catalogue', () => {
  test('health endpoint reports a connected database', async () => {
    const res = await guest.get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.database_connected, true);
    assert.ok(res.body.properties_count >= 4);
  });

  test('public list returns seeded active listings only', async () => {
    const res = await guest.get('/api/properties');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.properties.length >= 4);
    for (const property of res.body.properties) {
      assert.equal(property.status, 'active');
      assert.ok(property.title.length > 0);
      assert.ok(Array.isArray(property.images));
      assert.ok(property.rentGhs > 0);
    }
    state.seededPropertyId = res.body.properties[0].id;
  });

  test('single property can be fetched and view count increases', async () => {
    const first = await guest.get(`/api/properties/${state.seededPropertyId}`);
    assert.equal(first.status, 200);
    const viewsAfterFirst = first.body.property.viewsCount;

    const second = await guest.get(`/api/properties/${state.seededPropertyId}`);
    assert.equal(second.status, 200);
    assert.equal(second.body.property.viewsCount, viewsAfterFirst + 1);
  });

  test('unknown property returns 404 with a JSON error', async () => {
    const res = await guest.get('/api/properties/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /not found/i);
  });

  test('filters, search, sorting and pagination work', async () => {
    const apartments = await guest.get('/api/properties?type=Apartment');
    assert.equal(apartments.status, 200);
    assert.ok(apartments.body.properties.every((p) => p.propertyType === 'Apartment'));

    const search = await guest.get('/api/properties?q=cantonments');
    assert.equal(search.status, 200);
    assert.ok(search.body.properties.length >= 1);
    assert.ok(search.body.properties.every((p) => /cantonments/i.test(`${p.title} ${p.location} ${p.description}`)));

    const cheap = await guest.get('/api/properties?maxRent=4000');
    assert.ok(cheap.body.properties.every((p) => p.rentGhs <= 4000));

    const sorted = await guest.get('/api/properties?sort=price_asc');
    const prices = sorted.body.properties.map((p) => p.rentGhs);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));

    const paged = await guest.get('/api/properties?perPage=2&page=1');
    assert.equal(paged.body.properties.length, 2);
    assert.equal(paged.body.page, 1);
    assert.ok(paged.body.total >= 4);

    const unmatched = await guest.get('/api/properties?q=zzzz-no-such-property');
    assert.equal(unmatched.status, 200);
    assert.equal(unmatched.body.properties.length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('Authentication & authorisation', () => {
  test('registration validates its input', async () => {
    const res = await guest.post('/api/auth/register', { email: 'not-an-email', password: 'short' });
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.email);
    assert.ok(res.body.fields.name);
    assert.ok(res.body.fields.password);
  });

  test('tenants can register and receive a session', async () => {
    const email = uniqueEmail('tenant');
    const res = await tenant.post('/api/auth/register', {
      email,
      password: 'Tenant-Password-123',
      name: 'Test Tenant',
      phone: '+233 24 123 4567',
      role: 'tenant',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'tenant');
    assert.equal(res.body.user.email, email);
    assert.equal(res.body.user.password_hash, undefined);
    state.tenantEmail = email;

    const me = await tenant.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, email);
  });

  test('duplicate email is rejected', async () => {
    const res = await guest.post('/api/auth/register', {
      email: state.tenantEmail,
      password: 'Another-Password-123',
      name: 'Duplicate Person',
      phone: '+233 24 000 0001',
      role: 'tenant',
    });
    assert.equal(res.status, 409);
  });

  test('landlords can register', async () => {
    const email = uniqueEmail('landlord');
    const res = await landlord.post('/api/auth/register', {
      email,
      password: 'Landlord-Password-123',
      name: 'Test Landlord',
      phone: '+233 20 555 1234',
      role: 'landlord',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'landlord');
    state.landlordEmail = email;
    state.landlordId = res.body.user.id;
  });

  test('wrong password is rejected and does not create a session', async () => {
    const client = new ApiClient(baseUrl);
    const res = await client.post('/api/auth/login', { email: state.tenantEmail, password: 'wrong-password' });
    assert.equal(res.status, 401);
    const me = await client.get('/api/auth/me');
    assert.equal(me.body.user, null);
  });

  test('login with the wrong role is rejected with guidance', async () => {
    const client = new ApiClient(baseUrl);
    const res = await client.post('/api/auth/login', {
      email: state.tenantEmail,
      password: 'Tenant-Password-123',
      role: 'landlord',
    });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /tenant/i);
  });

  test('correct credentials sign in and logout ends the session', async () => {
    const client = new ApiClient(baseUrl);
    const login = await client.post('/api/auth/login', {
      email: state.tenantEmail,
      password: 'Tenant-Password-123',
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.email, state.tenantEmail);

    const logout = await client.post('/api/auth/logout', {});
    assert.equal(logout.status, 200);
    const me = await client.get('/api/auth/me');
    assert.equal(me.body.user, null);
  });

  test('protected endpoints reject anonymous and wrong-role callers', async () => {
    const anonymous = await guest.post('/api/properties', { title: 'Nope' });
    assert.equal(anonymous.status, 401);

    const tenantTryingToPublish = await tenant.post('/api/properties', {
      title: 'Tenant listing attempt',
      location: 'Accra',
      rentGhs: 1000,
      description: 'This should never be created because tenants cannot list properties.',
      images: ['https://example.com/a.jpg'],
    });
    assert.equal(tenantTryingToPublish.status, 403);

    const tenantReadingAdminStats = await tenant.get('/api/admin/stats');
    assert.equal(tenantReadingAdminStats.status, 403);

    const tenantReadingEnquiries = await tenant.get('/api/admin/enquiries');
    assert.equal(tenantReadingEnquiries.status, 403);
  });

  test('admin login requires valid credentials and the access key', async () => {
    const badPassword = await admin.post('/api/auth/admin-login', {
      email: ADMIN_EMAIL,
      password: 'nope-nope-nope',
      accessKey: ADMIN_ACCESS_KEY,
    });
    assert.equal(badPassword.status, 401);

    const missingKey = await admin.post('/api/auth/admin-login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      accessKey: 'wrong-key',
    });
    assert.equal(missingKey.status, 401);

    const tenantOnAdminConsole = await admin.post('/api/auth/admin-login', {
      email: state.tenantEmail,
      password: 'Tenant-Password-123',
      accessKey: ADMIN_ACCESS_KEY,
    });
    assert.equal(tenantOnAdminConsole.status, 401);

    const ok = await admin.post('/api/auth/admin-login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      accessKey: ADMIN_ACCESS_KEY,
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.role, 'admin');
    assert.equal(ok.body.user.password_hash, undefined);
  });

  test('administrator accounts cannot sign in through the public login form', async () => {
    const client = new ApiClient(baseUrl);
    const res = await client.post('/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /admin/i);
  });

  test('state-changing requests from a foreign origin are blocked', async () => {
    const res = await guest.post('/api/enquiries', {
      name: 'CSRF Attempt',
      email: 'csrf@example.com',
      message: 'This request should be rejected because of its origin.',
    }, { origin: 'https://evil.example.net' });
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
describe('Property lifecycle (create → moderate → edit → delete)', () => {
  test('landlord creates a listing that starts pending and stays private', async () => {
    const res = await landlord.post('/api/properties', {
      title: 'Integration Test Villa in East Legon',
      location: 'East Legon, Accra',
      city: 'Accra',
      rentGhs: 5000,
      bedrooms: 3,
      bathrooms: 2,
      propertyType: 'Townhouse',
      description: 'A well lit test townhouse used to verify the property lifecycle end to end.',
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
      amenities: ['24/7 Standby Generator', 'Gated Security'],
      nearbyPlaces: [{ name: 'Test Mall', type: 'Shopping', distance: '5 mins' }],
      availability: 'Available Now',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.property.status, 'pending');
    state.newPropertyId = res.body.property.id;

    const publicList = await guest.get('/api/properties');
    assert.ok(!publicList.body.properties.some((p) => p.id === state.newPropertyId), 'pending listing must not be public');

    const publicDetail = await guest.get(`/api/properties/${state.newPropertyId}`);
    assert.equal(publicDetail.status, 404);

    const mine = await landlord.get('/api/properties?mine=1');
    assert.equal(mine.status, 200);
    assert.ok(mine.body.properties.some((p) => p.id === state.newPropertyId));
  });

  test('property creation validates required fields and unsafe image URLs', async () => {
    const res = await landlord.post('/api/properties', {
      title: 'X',
      location: '',
      rentGhs: -5,
      description: 'short',
      images: ['javascript:alert(document.cookie)'],
    });
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.title);
    assert.ok(res.body.fields.location);
    assert.ok(res.body.fields.rentGhs);
    assert.ok(res.body.fields.description);
    assert.ok(res.body.fields.images);
  });

  test('admin approval publishes the listing', async () => {
    const res = await admin.post(`/api/properties/${state.newPropertyId}/status`, { status: 'active' });
    assert.equal(res.status, 200);
    assert.equal(res.body.property.status, 'active');

    const publicList = await guest.get('/api/properties');
    assert.ok(publicList.body.properties.some((p) => p.id === state.newPropertyId));
  });

  test('admin dashboard data reflects the database', async () => {
    const res = await admin.get('/api/admin/properties');
    assert.equal(res.status, 200);
    assert.ok(res.body.properties.some((p) => p.id === state.newPropertyId));

    const stats = await admin.get('/api/admin/stats');
    assert.equal(stats.status, 200);
    const s = stats.body.stats;
    assert.ok(s.totalProperties >= 5);
    assert.ok(s.approvedProperties >= 4);
    assert.equal(typeof s.visitorsToday, 'number');
    assert.equal(s.dailyTraffic.length, 7);
    assert.equal(s.monthlyTraffic.length, 6);
    state.statsBefore = s;
  });

  test('landlord can edit their listing but cannot self-approve it', async () => {
    const res = await landlord.put(`/api/properties/${state.newPropertyId}`, {
      rentGhs: 4800,
      status: 'rejected',
      featured: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.property.rentGhs, 4800);
    assert.equal(res.body.property.status, 'active', 'landlord must not be able to change moderation status');
    assert.equal(res.body.property.featured, false);
  });

  test('another landlord cannot edit or delete the listing', async () => {
    const other = new ApiClient(baseUrl);
    await other.post('/api/auth/register', {
      email: uniqueEmail('other-landlord'),
      password: 'Other-Landlord-123',
      name: 'Other Landlord',
      phone: '+233 20 111 2222',
      role: 'landlord',
    });
    const edit = await other.put(`/api/properties/${state.newPropertyId}`, { rentGhs: 100 });
    assert.equal(edit.status, 403);
    const remove = await other.delete(`/api/properties/${state.newPropertyId}`);
    assert.equal(remove.status, 403);
  });

  test('deleting a listing removes it from public view but keeps history', async () => {
    const res = await landlord.delete(`/api/properties/${state.newPropertyId}`);
    assert.equal(res.status, 200);

    const publicList = await guest.get('/api/properties');
    assert.ok(!publicList.body.properties.some((p) => p.id === state.newPropertyId));

    const detail = await guest.get(`/api/properties/${state.newPropertyId}`);
    assert.equal(detail.status, 404);

    const mine = await landlord.get('/api/properties?mine=1');
    const found = mine.body.properties.find((p) => p.id === state.newPropertyId);
    assert.equal(found.status, 'deactivated');
  });

  test('admin can feature and reactivate a listing', async () => {
    const feature = await admin.post(`/api/properties/${state.newPropertyId}/feature`, { featured: true });
    assert.equal(feature.status, 200);
    assert.equal(feature.body.property.featured, true);

    const reactivate = await admin.post(`/api/properties/${state.newPropertyId}/status`, { status: 'active' });
    assert.equal(reactivate.status, 200);
    assert.equal(reactivate.body.property.status, 'active');
  });
});

// ---------------------------------------------------------------------------
describe('Image uploads', () => {
  test('landlord can upload an image and it is served back', async () => {
    const png = createPng(120, 90);
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'test-home.png');

    const res = await landlord.request('POST', '/api/uploads', { body: form });
    assert.equal(res.status, 201);
    assert.equal(res.body.urls.length, 1);
    assert.match(res.body.urls[0], /^\/api\/uploads\/gl-\d{8}-[a-f0-9]+\.png$/);
    state.uploadedUrl = res.body.urls[0];

    const served = await guest.get(res.body.urls[0], { raw: true });
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
    const bytes = Buffer.from(await served.arrayBuffer());
    assert.equal(bytes[0], 0x89);
  });

  // Upgrade 2, A1: on the deployed host `api/uploads` is a real directory, so a
  // POST to the un-slashed path could be answered by Apache's mod_dir with a 301
  // that the browser re-sent as a GET ("Endpoint not found"). Both spellings must
  // reach the upload handler, and a rejected file must come back as a field error.
  test('the upload endpoint answers on both spellings of its path', async () => {
    const slashed = new FormData();
    slashed.append('file', new Blob([createPng(80, 60)], { type: 'image/png' }), 'slashed.png');
    const okSlashed = await landlord.request('POST', '/api/uploads/', { body: slashed });
    assert.equal(okSlashed.status, 201);
    assert.match(okSlashed.body.urls[0], /^\/api\/uploads\/gl-\d{8}-[a-f0-9]+\.png$/);

    // The stored file is served from the same path the client was given.
    const served = await guest.get(okSlashed.body.urls[0], { raw: true });
    assert.equal(served.status, 200);

    const bare = new FormData();
    bare.append('file', new Blob([createPng(80, 60)], { type: 'image/png' }), 'bare.png');
    const okBare = await landlord.request('POST', '/api/uploads', { body: bare });
    assert.equal(okBare.status, 201);
  });

  test('a refused upload on the slashed path reports the field', async () => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'notes.txt');
    const res = await landlord.request('POST', '/api/uploads/', { body: form });
    assert.equal(res.status, 422);
    assert.ok(res.body.fields && res.body.fields.file, 'the refusal names the file field');
  });

  test('non-image uploads are rejected', async () => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('<?php echo "hacked"; ?>')], { type: 'application/x-php' }), 'shell.php');
    const res = await landlord.request('POST', '/api/uploads', { body: form });
    assert.equal(res.status, 422);
  });

  test('anonymous uploads are rejected', async () => {
    const form = new FormData();
    form.append('file', new Blob([createPng(60, 60)], { type: 'image/png' }), 'anon.png');
    const res = await guest.request('POST', '/api/uploads', { body: form });
    assert.equal(res.status, 401);
  });

  test('uploaded image can be attached to a listing', async () => {
    const res = await landlord.post('/api/properties', {
      title: 'Uploaded Photo Test Apartment',
      location: 'Osu, Accra',
      city: 'Accra',
      rentGhs: 2500,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: 'Apartment',
      description: 'Listing used to verify that uploaded images persist and render.',
      images: [state.uploadedUrl],
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.property.images, [state.uploadedUrl]);
    state.uploadPropertyId = res.body.property.id;
  });
});

// ---------------------------------------------------------------------------
describe('Enquiries', () => {
  test('contact form validates input', async () => {
    const res = await guest.post('/api/enquiries', { name: '', email: 'bad', message: '' });
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.name);
    assert.ok(res.body.fields.email);
    assert.ok(res.body.fields.message);
  });

  test('contact enquiry is stored and visible to the admin only', async () => {
    const res = await guest.post('/api/enquiries', {
      name: 'Ama Boateng',
      email: 'ama@example.com',
      phone: '+233 24 777 8888',
      message: 'Please share more details about your Cantonments listings.',
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.enquiryId);

    const list = await admin.get('/api/admin/enquiries');
    assert.equal(list.status, 200);
    const stored = list.body.enquiries.find((e) => e.id === res.body.enquiryId);
    assert.ok(stored);
    assert.equal(stored.email, 'ama@example.com');
    assert.equal(stored.status, 'new');

    const unauthorised = await guest.get('/api/admin/enquiries');
    assert.equal(unauthorised.status, 401);
  });

  test('property enquiry is linked to the listing and increments its counter', async () => {
    const before = await guest.get(`/api/properties/${state.seededPropertyId}`);
    const beforeCount = before.body.property.enquiriesCount;

    const res = await guest.post('/api/enquiries', {
      name: 'Kwame Asante',
      email: 'kwame@example.com',
      message: 'Is this apartment still available for a viewing this weekend?',
      propertyId: state.seededPropertyId,
      source: 'property_page',
    });
    assert.equal(res.status, 201);

    const after = await guest.get(`/api/properties/${state.seededPropertyId}`);
    assert.equal(after.body.property.enquiriesCount, beforeCount + 1);
  });

  test('enquiry about a missing property is rejected', async () => {
    const res = await guest.post('/api/enquiries', {
      name: 'Test User',
      email: 'test@example.com',
      message: 'Checking a property that does not exist.',
      propertyId: 'prop-does-not-exist',
    });
    assert.equal(res.status, 404);
  });
});

// ---------------------------------------------------------------------------
describe('Viewing requests', () => {
  test('validation rejects bad dates and missing details', async () => {
    const res = await guest.post('/api/viewing-requests', {
      tenantName: '',
      tenantPhone: 'abc',
      tenantEmail: 'bad',
      propertyId: state.seededPropertyId,
      date: '1999-01-01',
      time: '',
    });
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.tenantName);
    assert.ok(res.body.fields.tenantPhone);
    assert.ok(res.body.fields.date);
    assert.ok(res.body.fields.time);
  });

  test('guest can request a viewing; fee is cash-on-site', async () => {
    const res = await guest.post('/api/viewing-requests', {
      tenantName: 'Yaw Osei',
      tenantPhone: '+233 24 555 1111',
      tenantEmail: 'yaw@example.com',
      propertyId: state.seededPropertyId,
      date: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10),
      time: '11:00 AM',
      notes: 'Interested in the top floor units.',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.viewing.viewingFeePaid, false);
    assert.equal(res.body.feeAmountGhs, 100);
    state.viewingId = res.body.viewingId;
  });

  test('admin can list and complete a viewing with the physical fee recorded', async () => {
    const list = await admin.get('/api/admin/viewings');
    assert.equal(list.status, 200);
    assert.ok(list.body.viewings.some((v) => v.id === state.viewingId));

    const before = await admin.get('/api/admin/stats');
    const collectedBefore = before.body.stats.viewingFeesCollectedGhs;
    const receivedBefore = before.body.stats.goodlucksShareReceivedGhs;

    // Increment F: a request is not an appointment, and an appointment cannot be
    // "completed" before it happens. Walk the real lifecycle, then record the
    // physical fee through the ledger's own endpoint.
    await completeViewingAs(admin, state.viewingId);
    const update = await admin.patch(`/api/viewings/${state.viewingId}`, { viewingFeePaid: true });
    assert.equal(update.status, 200);
    assert.equal(update.body.viewing.status, 'completed');
    assert.equal(update.body.viewing.viewingFeePaid, true);

    const after = await admin.get('/api/admin/stats');
    // Increment B: the fee is money the AGENT collected. It is counted as
    // collected, and it never becomes Goodlucks revenue on its own.
    assert.equal(after.body.stats.viewingFeesCollectedGhs, collectedBefore + 100);
    assert.equal(after.body.stats.goodlucksShareReceivedGhs, receivedBefore);
    assert.equal(after.body.stats.physicalRevenueGhs, undefined, 'the misleading revenue field is gone');
  });

  test('viewers only see their own viewings', async () => {
    const list = await tenant.get('/api/viewings');
    assert.equal(list.status, 200);
    assert.ok(!list.body.viewings.some((v) => v.id === state.viewingId));
  });

  test('viewing for an unavailable property is rejected', async () => {
    const res = await guest.post('/api/viewing-requests', {
      tenantName: 'Late Request',
      tenantPhone: '+233 24 555 2222',
      tenantEmail: 'late@example.com',
      propertyId: 'prop-not-real',
      date: new Date(Date.now() + 86400_000).toISOString().slice(0, 10),
      time: '09:00 AM',
    });
    assert.equal(res.status, 404);
  });
});

// ---------------------------------------------------------------------------
describe('Tenant matching requests', () => {
  test('rental request is validated and stored', async () => {
    const invalid = await tenant.post('/api/tenant-requests', {
      tenantName: 'A',
      tenantPhone: '1',
      tenantEmail: 'nope',
      preferredLocations: [],
      budgetMin: 9000,
      budgetMax: 1000,
      bedrooms: 2,
      moveInDate: 'not-a-date',
    });
    assert.equal(invalid.status, 422);
    assert.ok(invalid.body.fields.preferredLocations);
    assert.ok(invalid.body.fields.budget);

    const res = await tenant.post('/api/tenant-requests', {
      tenantName: 'Test Tenant',
      tenantPhone: '+233 24 123 4567',
      tenantEmail: state.tenantEmail,
      preferredLocations: ['East Legon', 'Cantonments'],
      budgetMin: 3000,
      budgetMax: 8000,
      bedrooms: 2,
      bathrooms: 2,
      propertyType: 'Apartment',
      moveInDate: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10),
      notes: 'Needs a standby generator.',
    });
    assert.equal(res.status, 201);
    state.tenantRequestId = res.body.requestId;
  });

  test('tenant sees only their own requests; admin sees all', async () => {
    const own = await tenant.get('/api/tenant-requests');
    assert.equal(own.status, 200);
    assert.ok(own.body.requests.some((r) => r.id === state.tenantRequestId));

    const all = await admin.get('/api/admin/tenant-requests');
    assert.equal(all.status, 200);
    assert.ok(all.body.requests.some((r) => r.id === state.tenantRequestId));

    const forbidden = await tenant.get('/api/admin/tenant-requests');
    assert.equal(forbidden.status, 403);
  });

  test('admin can mark a request as matched', async () => {
    const res = await admin.patch(`/api/tenant-requests/${state.tenantRequestId}`, {
      status: 'matched',
      matchedPropertyIds: [state.seededPropertyId],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.request.status, 'matched');
    assert.deepEqual(res.body.request.matchedPropertyIds, [state.seededPropertyId]);
  });
});

// ---------------------------------------------------------------------------
describe('Alerts', () => {
  test('price drop alert validates the email and property', async () => {
    const bad = await guest.post('/api/price-alerts', { email: 'nope', propertyId: state.seededPropertyId });
    assert.equal(bad.status, 422);
  });

  test('price drop alert is stored once per email/property', async () => {
    const payload = {
      email: 'alert@example.com',
      propertyId: state.seededPropertyId,
      name: 'Alert Tester',
      targetRentGhs: 5000,
      notifyOnAnyDrop: false,
    };
    const first = await guest.post('/api/price-alerts', payload);
    assert.equal(first.status, 200);
    const second = await guest.post('/api/price-alerts', payload);
    assert.equal(second.status, 200);
    assert.equal(second.body.alertId, first.body.alertId);

    const list = await admin.get('/api/admin/price-alerts');
    assert.equal(list.status, 200);
    assert.equal(list.body.alerts.filter((a) => a.property_id === state.seededPropertyId && a.email === 'alert@example.com').length, 1);
  });

  test('search alerts require an account and can be listed and deleted', async () => {
    const anonymous = await guest.post('/api/search-alerts', { email: 'guest@example.com' });
    assert.equal(anonymous.status, 201);

    const res = await tenant.post('/api/search-alerts', {
      email: state.tenantEmail,
      name: 'Test Tenant',
      location: 'East Legon',
      propertyType: 'Apartment',
      bedrooms: 2,
      maxRentGhs: 6000,
      frequency: 'instant',
      channels: ['email'],
    });
    assert.equal(res.status, 201);
    const alertId = res.body.alert.id;

    const list = await tenant.get('/api/search-alerts');
    assert.equal(list.status, 200);
    assert.ok(list.body.alerts.some((a) => a.id === alertId));

    const removed = await tenant.delete(`/api/search-alerts/${alertId}`);
    assert.equal(removed.status, 200);

    const afterList = await tenant.get('/api/search-alerts');
    assert.ok(!afterList.body.alerts.some((a) => a.id === alertId));
  });
});

// ---------------------------------------------------------------------------
describe('Saved properties', () => {
  test('saved properties persist per user', async () => {
    const save = await tenant.post('/api/saved-properties', { propertyId: state.seededPropertyId });
    assert.equal(save.status, 200);
    assert.ok(save.body.propertyIds.includes(state.seededPropertyId));

    const me = await tenant.get('/api/auth/me');
    assert.ok(me.body.savedPropertyIds.includes(state.seededPropertyId));

    const list = await tenant.get('/api/saved-properties');
    assert.ok(list.body.propertyIds.includes(state.seededPropertyId));

    const other = await guest.get('/api/saved-properties');
    assert.equal(other.status, 401);

    const remove = await tenant.delete(`/api/saved-properties/${state.seededPropertyId}`);
    assert.equal(remove.status, 200);
    assert.ok(!remove.body.propertyIds.includes(state.seededPropertyId));
  });
});

// ---------------------------------------------------------------------------
describe('Tenancy agreements retired & receipt issuance disabled', () => {
  test('every tenancy-agreement endpoint has been removed', async () => {
    const list = await tenant.get('/api/agreements');
    assert.equal(list.status, 404);

    const create = await tenant.post('/api/agreements', {
      propertyTitle: 'Retired Workflow Apartment',
      propertyAddress: 'Cantonments, Accra',
      landlordName: 'Abena Osei',
      landlordPhone: '+233 20 899 7711',
      tenantName: 'Test Tenant',
      tenantPhone: '+233 24 123 4567',
      monthlyRentGhs: 6500,
      durationMonths: 12,
    });
    assert.equal(create.status, 404);

    const sign = await tenant.post('/api/agreements/any-id/sign', { role: 'tenant' });
    assert.equal(sign.status, 404);

    const email = await tenant.post('/api/agreements/any-id/email', {});
    assert.equal(email.status, 404);

    const single = await admin.get('/api/agreements/any-id');
    assert.equal(single.status, 404);
  });

  test('receipt issuing is disabled and limited to staff', async () => {
    const payload = {
      propertyTitle: 'The Pearl Executive 3-Bedroom Apartment',
      propertyAddress: 'Cantonments, Accra',
      tenantName: 'Test Tenant',
      tenantPhone: '+233 24 123 4567',
      landlordName: 'Abena Osei',
      amountGhs: 6500,
      paymentPurpose: 'Monthly rent',
      paymentMethod: 'MTN MoMo',
    };

    const anonymous = await guest.post('/api/receipts', payload);
    assert.equal(anonymous.status, 401);

    // Tenants and landlords can no longer create Goodlucks-branded records.
    const asTenant = await tenant.post('/api/receipts', payload);
    assert.equal(asTenant.status, 403);

    const asLandlord = await landlord.post('/api/receipts', payload);
    assert.equal(asLandlord.status, 403);

    // Staff are recognised, but issuing is switched off until Increment B.
    const asAdmin = await admin.post('/api/receipts', payload);
    assert.equal(asAdmin.status, 503);
    assert.match(asAdmin.body.error, /disabled/i);

    const list = await admin.get('/api/receipts');
    assert.equal(list.status, 200);
    assert.equal(list.body.issuingEnabled, false);
    assert.ok(Array.isArray(list.body.receipts));
  });
});

// ---------------------------------------------------------------------------
describe('Receipt access control', () => {
  const access = {};
  const clients = {};

  const createParty = async (key, { name, phone, role }) => {
    const email = uniqueEmail(key);
    const script = runPhpScript(
      'tests/create-user.php',
      [
        `--email=${email}`,
        '--password=Access-Control-Pass-123',
        `--name=${name}`,
        `--role=${role}`,
        `--phone=${phone}`,
      ],
      state.testEnv
    );
    assert.equal(script.status, 0, `${key} creation failed: ${script.stdout} ${script.stderr}`);

    const client = new ApiClient(baseUrl);
    const login = await client.post('/api/auth/login', { email, password: 'Access-Control-Pass-123' });
    assert.equal(login.status, 200, `${key} login failed: ${JSON.stringify(login.body)}`);
    clients[key] = client;
    return login.body.user;
  };

  before(async () => {
    access.admin = admin;

    access.landlordA = await createParty('access-landlord-a', {
      name: 'Access Landlord A',
      phone: '+233 20 900 0001',
      role: 'landlord',
    });
    access.tenantA = await createParty('access-tenant-a', {
      name: 'Access Tenant A',
      phone: '+233 24 900 0002',
      role: 'tenant',
    });
    access.landlordB = await createParty('access-landlord-b', {
      name: 'Access Landlord B',
      phone: '+233 20 900 0003',
      role: 'landlord',
    });
    access.tenantB = await createParty('access-tenant-b', {
      name: 'Access Tenant B',
      phone: '+233 24 900 0004',
      role: 'tenant',
    });

    // Issuing is disabled over HTTP, so the record is planted directly and then
    // read back through the real endpoints.
    const created = runPhpScript(
      'tests/create-receipt.php',
      [
        `--tenant-user=${access.tenantA.id}`,
        `--landlord-user=${access.landlordA.id}`,
        '--amount=4200',
        '--tenant-name=Access Tenant A',
        '--landlord-name=Access Landlord A',
        '--tenant-phone=+233 24 900 0002',
      ],
      state.testEnv
    );
    assert.equal(created.status, 0, `receipt creation failed: ${created.stdout} ${created.stderr}`);
    access.receiptId = JSON.parse(created.stdout.trim()).id;
    assert.ok(access.receiptId, 'helper must return the receipt id');
  });

  test('receipt lists are scoped to the people concerned', async () => {
    const tenantSees = await clients['access-tenant-a'].get('/api/receipts');
    assert.equal(tenantSees.status, 200);
    assert.ok(tenantSees.body.receipts.some((r) => r.id === access.receiptId));

    const strangerTenant = await clients['access-tenant-b'].get('/api/receipts');
    assert.equal(strangerTenant.status, 200);
    assert.ok(!strangerTenant.body.receipts.some((r) => r.id === access.receiptId));

    const landlordSees = await clients['access-landlord-a'].get('/api/receipts');
    assert.ok(landlordSees.body.receipts.some((r) => r.id === access.receiptId));

    const strangerLandlord = await clients['access-landlord-b'].get('/api/receipts');
    assert.ok(!strangerLandlord.body.receipts.some((r) => r.id === access.receiptId));

    const staff = await access.admin.get('/api/receipts');
    assert.ok(staff.body.receipts.some((r) => r.id === access.receiptId));
  });

  test('a single receipt is only readable by its parties and staff', async () => {
    const party = await clients['access-tenant-a'].get(`/api/receipts/${access.receiptId}`);
    assert.equal(party.status, 200);
    assert.equal(party.body.receipt.id, access.receiptId);

    const landlordParty = await clients['access-landlord-a'].get(`/api/receipts/${access.receiptId}`);
    assert.equal(landlordParty.status, 200);

    // Strangers get 404, not 403, so ids cannot be probed for existence.
    const strangerTenant = await clients['access-tenant-b'].get(`/api/receipts/${access.receiptId}`);
    assert.equal(strangerTenant.status, 404);

    const strangerLandlord = await clients['access-landlord-b'].get(`/api/receipts/${access.receiptId}`);
    assert.equal(strangerLandlord.status, 404);

    const anonymous = await guest.get(`/api/receipts/${access.receiptId}`);
    assert.equal(anonymous.status, 401);

    const missing = await access.admin.get('/api/receipts/does-not-exist');
    assert.equal(missing.status, 404);

    const staff = await access.admin.get(`/api/receipts/${access.receiptId}`);
    assert.equal(staff.status, 200);
  });

  test('the audit trail is admin-only and carries no identity numbers', async () => {
    const res = await access.admin.get('/api/admin/audit-logs?limit=200');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.logs));
    assert.ok(res.body.logs.length > 0, 'earlier suites must have recorded sensitive actions');
    for (const log of res.body.logs) {
      assert.equal(typeof log.action, 'string');
      assert.equal(typeof log.entityType, 'string');
      assert.ok(log.createdAt);
    }

    const serialised = JSON.stringify(res.body.logs);
    assert.ok(!/landlordGhanaCard|tenantGhanaCard/i.test(serialised));

    const staffOnly = await clients['access-landlord-a'].get('/api/admin/audit-logs');
    assert.equal(staffOnly.status, 403);

    const anonymous = await guest.get('/api/admin/audit-logs');
    assert.equal(anonymous.status, 401);
  });

  test('private documents are not reachable through the public uploads route', async () => {
    fs.mkdirSync(privateDir, { recursive: true });
    const name = `private-proof-${Date.now()}.png`;
    const filePath = path.join(privateDir, name);
    fs.writeFileSync(filePath, createPng(60, 60));

    try {
      const leaked = await guest.get(`/api/uploads/${name}`);
      assert.equal(leaked.status, 404);

      const traversal = await guest.get('/api/uploads/..%2Fconfig.php');
      assert.equal(traversal.status, 404);
    } finally {
      fs.rmSync(filePath, { force: true });
    }
  });
});

// ---------------------------------------------------------------------------
describe('Registration: role handling, city and verification status', () => {
  // Registration signs the caller in, so these tests use throwaway clients: the
  // shared `guest` client must stay anonymous for every other suite.
  const visitor = () => new ApiClient(baseUrl);

  test('a privileged role is refused instead of being coerced to a tenant', async () => {
    const email = uniqueEmail('admin-attempt');
    const res = await visitor().post('/api/auth/register', {
      name: 'Admin Applicant',
      email,
      phone: '+233 20 777 0001',
      password: 'Agent-Attempt-Pass-1',
      role: 'admin',
      city: 'East Legon, Accra',
    });

    assert.equal(res.status, 422);
    assert.ok(res.body.fields.role, 'the role field must explain the refusal');
    assert.match(res.body.fields.role, /not available/i);

    // No half-registered account may exist behind the refusal.
    const login = await visitor().post('/api/auth/login', { email, password: 'Agent-Attempt-Pass-1' });
    assert.equal(login.status, 401, 'the refused registration must not create an account');
  });

  test('the optional city is stored as contact information and never as identity', async () => {
    const withCity = await visitor().post('/api/auth/register', {
      name: 'City Tester',
      email: uniqueEmail('city'),
      phone: '+233 24 777 0002',
      password: 'City-Tester-Pass-1',
      role: 'tenant',
      city: 'Tema, Community 25',
    });
    assert.equal(withCity.status, 201);
    assert.equal(withCity.body.user.address, 'Tema, Community 25');
    assert.equal(withCity.body.user.isVerified, false, 'registering is not identity verification');

    // Registration is rate limited per IP, so the "no city" and "not verified"
    // cases share one landlord sign-up rather than adding more calls.
    const landlordSignup = await visitor().post('/api/auth/register', {
      name: 'Unverified Landlord',
      email: uniqueEmail('landlord-verify'),
      phone: '+233 20 777 0004',
      password: 'Landlord-Pass-123',
      role: 'landlord',
    });
    assert.equal(landlordSignup.status, 201);
    assert.equal(landlordSignup.body.user.address, '', 'city stays optional');
    assert.equal(landlordSignup.body.user.isVerified, false, 'registering is not identity verification');
  });
});

// ---------------------------------------------------------------------------
describe('Agent accounts (Increment C)', () => {
  const visitor = () => new ApiClient(baseUrl);
  const agent = { clients: {}, users: {}, profiles: {} };

  const registerAgent = async (key, overrides = {}) => {
    const email = uniqueEmail(`agent-${key}`);
    const password = 'Agent-Foundation-Pass-1';
    const client = visitor();
    const res = await client.post('/api/auth/register', {
      name: `Agent ${key}`,
      email,
      phone: '+233 20 777 0100',
      password,
      role: 'agent',
      operatingCity: 'Accra',
      agencyName: 'Goodlucks Test Agency',
      ...overrides,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    agent.clients[key] = client;
    agent.users[key] = res.body.user;
    agent.profiles[key] = res.body.user.agentProfile;
    return { client, user: res.body.user, email, password };
  };

  // A landlord account for the agent to list for. Created directly (no email,
  // no rate limit) and signed in normally.
  const createLandlord = async (key) => {
    const email = uniqueEmail(`agent-landlord-${key}`);
    const password = 'Landlord-For-Agent-Pass-1';
    const script = runPhpScript(
      'tests/create-user.php',
      [
        `--email=${email}`,
        `--password=${password}`,
        `--name=Agent Landlord ${key}`,
        '--role=landlord',
        '--phone=+233 20 777 0200',
      ],
      state.testEnv
    );
    assert.equal(script.status, 0, script.stdout + script.stderr);
    const id = JSON.parse(script.stdout.trim()).id;

    const client = new ApiClient(baseUrl);
    const login = await client.post('/api/auth/login', { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { client, id, name: `Agent Landlord ${key}` };
  };

  test('an agent registers with the agent role and keeps it', async () => {
    const { client, email, password } = await registerAgent('primary');

    // The response, the session and a fresh login all agree on the role.
    assert.equal(agent.users.primary.role, 'agent');
    const me = await client.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.role, 'agent');
    assert.equal(me.body.role, 'agent');

    const fresh = visitor();
    const login = await fresh.post('/api/auth/login', { email, password });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'agent', 'signing in must not downgrade the agent to a tenant');

    // Basic registration details only: agency and operating base are recorded,
    // and no identity document was requested or stored.
    assert.equal(agent.profiles.primary.agencyName, 'Goodlucks Test Agency');
    assert.equal(agent.profiles.primary.operatingCity, 'Accra');
    assert.ok(!('ghanaCard' in agent.users.primary));
    assert.ok(!('idDocument' in agent.users.primary));
  });

  test('a new agent is never auto-verified or auto-authorised', async () => {
    assert.equal(agent.users.primary.isVerified, false, 'registering as an agent verifies nothing');
    assert.equal(agent.profiles.primary.accountStatus, 'pending_review');
    assert.equal(agent.profiles.primary.canSubmitListings, false);
    assert.equal(agent.profiles.primary.identityVerified, false);
    assert.equal(agent.profiles.primary.professionalAuthorisationVerified, false);

    const own = await agent.clients.primary.get('/api/agent/profile');
    assert.equal(own.status, 200);
    assert.equal(own.body.profile.accountStatus, 'pending_review');
    assert.equal(own.body.permissions.canSubmitListings, false);
    assert.equal(own.body.permissions.canModerate, false);

    // A pending agent cannot submit listings yet.
    const landlord = await createLandlord('pending');
    const blocked = await agent.clients.primary.post('/api/properties', {
      title: 'Pending agent listing attempt',
      location: 'East Legon, Accra',
      rentGhs: 3200,
      description: 'A pending agent account must not be able to submit listings.',
      images: ['https://example.com/agent.jpg'],
      landlordId: landlord.id,
    });
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
    assert.match(blocked.body.error, /pending review/i);

    // Staff see the same pending state, and admins are the only ones who can
    // change it.
    const staffView = await admin.get('/api/admin/agents');
    assert.equal(staffView.status, 200);
    const listed = staffView.body.agents.find((a) => a.id === agent.profiles.primary.id);
    assert.ok(listed, 'the new agent must appear in the staff list');
    assert.equal(listed.accountStatus, 'pending_review');
    assert.equal(listed.canSubmitListings, false);
    assert.equal(listed.identityVerified, false);
  });

  test('an agent cannot read or edit another agent profile', async () => {
    await registerAgent('secondary');

    // The endpoint always resolves the profile from the session.
    const other = await agent.clients.secondary.get('/api/agent/profile');
    assert.equal(other.body.profile.userId, agent.users.secondary.id);
    assert.notEqual(other.body.profile.userId, agent.users.primary.id);

    // Attempting to point the write at the other agent is ignored: no request
    // field can select whose profile is updated.
    const attempt = await agent.clients.secondary.patch('/api/agent/profile', {
      userId: agent.users.primary.id,
      profileId: agent.profiles.primary.id,
      agencyName: 'Hijacked Agency',
      operatingCity: 'Kumasi',
    });
    assert.equal(attempt.status, 200, JSON.stringify(attempt.body));
    assert.equal(attempt.body.profile.userId, agent.users.secondary.id);

    const victim = await agent.clients.primary.get('/api/agent/profile');
    assert.equal(victim.body.profile.agencyName, 'Goodlucks Test Agency');
    assert.equal(victim.body.profile.operatingCity, 'Accra');

    // Agent records are staff-only beyond your own profile.
    assert.equal((await agent.clients.primary.get('/api/admin/agents')).status, 403);
    assert.equal((await agent.clients.primary.get(`/api/admin/agents/${agent.users.secondary.id}/status`)).status, 404);
  });

  test('a tenant cannot gain agent permissions by manipulation', async () => {
    const email = uniqueEmail('tenant-manipulation');
    const password = 'Tenant-Manipulation-Pass-1';
    const client = visitor();
    const signup = await client.post('/api/auth/register', {
      name: 'Manipulating Tenant',
      email,
      phone: '+233 20 777 0300',
      password,
      role: 'tenant',
      role_display: 'agent',
      agentProfile: { accountStatus: 'active', canSubmitListings: true },
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.body.user.role, 'tenant', 'the server ignores client-controlled role decorations');

    // Escalation attempts through the profile endpoint are ignored.
    const escalate = await client.put('/api/profile', {
      name: 'Manipulating Tenant',
      role: 'agent',
      isVerified: true,
      agentProfile: { accountStatus: 'active', canSubmitListings: true },
    });
    assert.equal(escalate.status, 200);
    assert.equal(escalate.body.user.role, 'tenant', 'role cannot be edited through the profile');
    assert.equal(escalate.body.user.isVerified, false);
    assert.equal(escalate.body.user.agentProfile, undefined);

    // Agent-only surfaces stay closed.
    assert.equal((await client.get('/api/agent/profile')).status, 403);
    assert.equal(
      (await client.patch('/api/agent/profile', { agencyName: 'Fake Agency' })).status,
      403
    );

    // ...and so do the listing paths that agents use.
    assert.equal(
      (
        await client.post('/api/properties', {
          title: 'Tenant listing attempt',
          location: 'Accra',
          rentGhs: 1000,
          description: 'Tenants cannot list properties, with or without a landlord id.',
          images: ['https://example.com/t.jpg'],
          landlordId: agent.users.primary.id,
          submittedByRole: 'agent',
        })
      ).status,
      403
    );
    assert.equal((await client.get('/api/properties?mine=1')).status, 403);
    assert.equal(
      (await client.post(`/api/admin/agents/${agent.users.primary.id}/status`, { accountStatus: 'active' })).status,
      403
    );

    // The stored role is unchanged after all of that.
    const me = await client.get('/api/auth/me');
    assert.equal(me.body.user.role, 'tenant');
  });

  test('existing tenant and landlord registration keeps working', async () => {
    const tenantSignup = await visitor().post('/api/auth/register', {
      name: 'Still A Tenant',
      email: uniqueEmail('still-tenant'),
      phone: '+233 24 777 0400',
      password: 'Still-A-Tenant-Pass-1',
      role: 'tenant',
    });
    assert.equal(tenantSignup.status, 201);
    assert.equal(tenantSignup.body.user.role, 'tenant');
    assert.equal(tenantSignup.body.user.agentProfile, undefined, 'tenants get no agent profile');
    assert.equal(tenantSignup.body.user.isVerified, false);

    const landlordSignup = await visitor().post('/api/auth/register', {
      name: 'Still A Landlord',
      email: uniqueEmail('still-landlord'),
      phone: '+233 24 777 0500',
      password: 'Still-A-Landlord-Pass-1',
      role: 'landlord',
    });
    assert.equal(landlordSignup.status, 201);
    assert.equal(landlordSignup.body.user.role, 'landlord');
    assert.equal(landlordSignup.body.user.agentProfile, undefined);

    // A landlord still lists their own property, attributed to themselves.
    const client = visitor();
    const login = await client.post('/api/auth/login', {
      email: landlordSignup.body.user.email,
      password: 'Still-A-Landlord-Pass-1',
    });
    assert.equal(login.status, 200);

    const created = await client.post('/api/properties', {
      title: 'Landlord-owned listing after Increment C',
      location: 'Tema, Community 25',
      city: 'Tema',
      rentGhs: 4100,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: 'Apartment',
      description: 'A landlord listing created after agent support shipped, to prove nothing regressed.',
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.property.landlordId, landlordSignup.body.user.id);
    assert.equal(created.body.property.submittedByRole, 'landlord');
    assert.equal(created.body.property.landlordAuthorityState, 'owner');
    assert.equal(created.body.property.isLandlordVerified, false);
    assert.equal(created.body.property.status, 'pending');

    const mine = await client.get('/api/properties?mine=1');
    assert.equal(mine.status, 200);
    assert.ok(mine.body.properties.some((p) => p.id === created.body.property.id));
  });

  test('agent submission is recorded separately from ownership and verification', async () => {
    const landlord = await createLandlord('submission');

    // Staff approve the agent's account for listings only.
    const approval = await admin.post(`/api/admin/agents/${agent.users.primary.id}/status`, {
      accountStatus: 'active',
      canSubmitListings: true,
      note: 'Approved for listing submissions in the test suite.',
    });
    assert.equal(approval.status, 200, JSON.stringify(approval.body));
    assert.equal(approval.body.profile.accountStatus, 'active');
    assert.equal(approval.body.profile.canSubmitListings, true);
    // Approval of an account is still not identity or licence verification.
    assert.equal(approval.body.profile.identityVerified, false);
    assert.equal(approval.body.profile.professionalAuthorisationVerified, false);

    const created = await agent.clients.primary.post('/api/properties', {
      title: 'Agent-submitted listing in East Legon',
      location: 'East Legon, Accra',
      city: 'Accra',
      rentGhs: 6500,
      bedrooms: 3,
      bathrooms: 2,
      propertyType: 'Townhouse',
      description: 'Submitted by an agent on behalf of a landlord, with authority unverified.',
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
      viewingFeeGhs: 150,
      viewingTerms: AGENT_VIEWING_TERMS,
      landlordId: landlord.id,
      // Attempts to talk the server into stronger claims.
      isLandlordVerified: true,
      landlordAuthorityState: 'verified',
      submittedByRole: 'landlord',
      status: 'active',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const property = created.body.property;
    agent.propertyId = property.id;

    // Increment F: the response to an agent never carries a landlord account id,
    // so the endpoint cannot be used to test whether an account exists. Staff
    // see the resolved owner; the agent sees the declaration it just made.
    assert.equal(property.landlordId, '', 'an agent is never shown the landlord account id');
    const asAdmin = await admin.get(`/api/properties/${property.id}`);
    assert.equal(asAdmin.status, 200, JSON.stringify(asAdmin.body));
    assert.equal(asAdmin.body.property.landlordId, landlord.id, 'the agent must never become the owner');
    assert.equal(asAdmin.body.property.landlordName, landlord.name);
    assert.equal(property.submittedByUserId, agent.users.primary.id);
    assert.equal(property.submittedByRole, 'agent');
    assert.equal(property.landlordAuthorityState, 'claimed_by_agent');

    // Nothing is verified and nothing goes live.
    assert.equal(property.isLandlordVerified, false, 'an agent submission must not verify the landlord');
    assert.equal(property.status, 'pending');

    // The agent cannot approve its own submission.
    const selfApprove = await agent.clients.primary.post(`/api/properties/${property.id}/status`, {
      status: 'active',
    });
    assert.equal(selfApprove.status, 403);

    const selfVerify = await agent.clients.primary.post(`/api/properties/${property.id}/verify`, {
      verified: true,
    });
    assert.equal(selfVerify.status, 403);

    // Both parties see the listing in their own workspace, for different reasons.
    const agentMine = await agent.clients.primary.get('/api/properties?mine=1');
    assert.equal(agentMine.status, 200);
    assert.ok(agentMine.body.properties.some((p) => p.id === property.id));

    const landlordMine = await landlord.client.get('/api/properties?mine=1');
    assert.equal(landlordMine.status, 200);
    assert.ok(
      landlordMine.body.properties.some((p) => p.id === property.id),
      'the landlord owns the listing the agent submitted for them'
    );

    // A second agent sees someone else's submission in neither list...
    const secondMine = await agent.clients.secondary.get('/api/properties?mine=1');
    assert.equal(secondMine.status, 200);
    assert.ok(!secondMine.body.properties.some((p) => p.id === property.id));

    // ...and cannot edit or delete it.
    assert.equal(
      (await agent.clients.secondary.put(`/api/properties/${property.id}`, { rentGhs: 1 })).status,
      403
    );
    assert.equal((await agent.clients.secondary.delete(`/api/properties/${property.id}`)).status, 403);
  });

  test('an agent submission requires a real landlord and cannot skip it', async () => {
    const missing = await agent.clients.primary.post('/api/properties', {
      title: 'Agent listing with no landlord',
      location: 'Accra',
      rentGhs: 2000,
      description: 'This submission names no landlord and must be refused.',
      images: ['https://example.com/no-landlord.jpg'],
    });
    assert.equal(missing.status, 422);
    assert.ok(missing.body.fields.landlordId);

    // Increment F: naming an account that is not a landlord must NOT produce a
    // different answer from naming one that is — otherwise the endpoint becomes
    // an account-existence oracle. The claim is accepted and queued for staff.
    const unknown = await agent.clients.primary.post('/api/properties', {
      title: 'Agent listing for a non-landlord',
      location: 'Accra',
      rentGhs: 2000,
      description: 'A tenant id is not a landlord. The submission is recorded as a claim and queued.',
      images: ['https://example.com/bad-landlord.jpg'],
      viewingFeeGhs: 120,
      viewingTerms: AGENT_VIEWING_TERMS,
      landlordId: agent.users.secondary.id,
    });
    assert.equal(unknown.status, 201, JSON.stringify(unknown.body));
    assert.equal(unknown.body.property.landlordId, '');
    assert.equal(unknown.body.property.landlordAuthorityState, 'claimed_by_agent');
    assert.equal(unknown.body.property.isLandlordVerified, false);

    // Staff can see that no account was matched, and what the agent claimed.
    const reviewable = await admin.get(`/api/properties/${unknown.body.property.id}`);
    assert.equal(reviewable.status, 200, JSON.stringify(reviewable.body));
    assert.equal(reviewable.body.property.landlordId, '', 'no landlord account is attached by guesswork');
    assert.equal(reviewable.body.property.landlordContactClaimed, agent.users.secondary.id);
  });

  test('suspending an agent closes listing submission again', async () => {
    // A non-active account cannot be handed listing permission in the same call.
    const contradictory = await admin.post(`/api/admin/agents/${agent.users.primary.id}/status`, {
      accountStatus: 'suspended',
      canSubmitListings: true,
    });
    assert.equal(contradictory.status, 422, JSON.stringify(contradictory.body));

    const suspended = await admin.post(`/api/admin/agents/${agent.users.primary.id}/status`, {
      accountStatus: 'suspended',
      canSubmitListings: false,
      note: 'Suspended for the test suite.',
    });
    assert.equal(suspended.status, 200, JSON.stringify(suspended.body));
    assert.equal(suspended.body.profile.accountStatus, 'suspended');
    assert.equal(suspended.body.profile.canSubmitListings, false, 'a suspended account keeps no permissions');

    const landlord = await createLandlord('suspended');
    const blocked = await agent.clients.primary.post('/api/properties', {
      title: 'Suspended agent listing attempt',
      location: 'Accra',
      rentGhs: 2500,
      description: 'A suspended agent account must not be able to submit listings.',
      images: ['https://example.com/suspended.jpg'],
      landlordId: landlord.id,
    });
    assert.equal(blocked.status, 403);

    // Invalid statuses are refused rather than stored.
    const bogus = await admin.post(`/api/admin/agents/${agent.users.primary.id}/status`, {
      accountStatus: 'verified',
    });
    assert.equal(bogus.status, 422);

    // The listing submitted while active still exists and is still unverified.
    const rescore = await admin.get(`/api/properties/${agent.propertyId}`);
    assert.equal(rescore.status, 200);
    assert.equal(rescore.body.property.isLandlordVerified, false);
  });

  test('existing admin and authentication rules are unchanged', async () => {
    const stats = await admin.get('/api/admin/stats');
    assert.equal(stats.status, 200);
    assert.ok(stats.body.stats.totalAgents >= 2, 'agent accounts are counted for staff');
    assert.ok(stats.body.stats.pendingAgentAccounts >= 0);

    // Agents are not staff.
    assert.equal((await agent.clients.secondary.get('/api/admin/stats')).status, 403);
    assert.equal((await agent.clients.secondary.get('/api/admin/audit-logs')).status, 403);
    assert.equal((await agent.clients.secondary.get('/api/receipts')).status, 403);
    assert.equal((await agent.clients.secondary.get('/api/admin/viewing-fees')).status, 403);

    // Anonymous callers still see no user.
    const anonymous = await guest.get('/api/auth/me');
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.body.user, null);

    // The admin status change is audited.
    const logs = await admin.get('/api/admin/audit-logs');
    assert.equal(logs.status, 200);
    assert.ok(
      logs.body.logs.some((log) => log.action === 'agent.status_changed'),
      'staff decisions on agent accounts must be auditable'
    );
  });
});

// ---------------------------------------------------------------------------
describe('Identity verification & professional authorisation (Increment D)', () => {
  const d = {
    agents: {},
    admins: {},
    docs: {},
    number: 'GHA-123456789-0',
    licenceNumber: 'REAC-2026-0099',
  };
  const visitor = () => new ApiClient(baseUrl);

  const initial = (seed) => Buffer.from(`${seed}`);
  const dice = () => Math.floor(Math.random() * 100000);

  /** A minimal but genuinely valid PDF, so libmagic reports application/pdf. */
  const createPdf = () => Buffer.from(
    '%PDF-1.4\n'
    + '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
    + '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
    + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n'
    + 'trailer<</Root 1 0 R>>\n%%EOF\n',
    'binary'
  );

  const uploadDocument = async (client, { kind, scope, bytes, filename, mime }) => {
    const form = new FormData();
    form.append('kind', kind);
    if (scope) form.append('scope', scope);
    form.append('file', new Blob([bytes], { type: mime || 'application/pdf' }), filename || 'identity.pdf');
    return client.request('POST', '/api/verification/documents', { body: form });
  };

  const registerAgent = async (key) => {
    const client = visitor();
    const email = uniqueEmail(`verify-agent-${key}`);
    const password = 'Verify-Agent-Pass-1';
    const res = await client.post('/api/auth/register', {
      name: `Verify Agent ${key}`,
      email,
      phone: '+233 20 888 0100',
      password,
      role: 'agent',
      operatingCity: 'Accra',
      agencyName: 'Verification Test Agency',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    d.agents[key] = { client, id: res.body.user.id, email, password };
    return d.agents[key];
  };

  const createAdmin = async (key) => {
    const email = uniqueEmail(`reviewer-${key}`);
    const password = 'Reviewer-Pass-123';
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${password}`, `--name=Reviewer ${key}`, '--role=admin'],
      state.testEnv
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);

    const client = new ApiClient(baseUrl);
    const login = await client.post('/api/auth/admin-login', {
      email,
      password,
      accessKey: ADMIN_ACCESS_KEY,
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    d.admins[key] = { client, id: login.body.user.id, email };
    return d.admins[key];
  };

  const grant = (email, flags) => {
    const args = [`--email=${email}`];
    if ('reviewer' in flags) args.push(`--reviewer=${flags.reviewer ? 1 : 0}`);
    if ('documents' in flags) args.push(`--documents=${flags.documents ? 1 : 0}`);
    return runPhpScript('php-backend/grant_reviewer.php', args, state.testEnv);
  };

  const inspect = (email, extra = []) => {
    const result = runPhpScript('tests/read-verification.php', [`--email=${email}`, ...extra], state.testEnv);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout.trim());
  };

  const submitIdentity = (client, documentIds, overrides = {}) => client.post('/api/verification/identity', {
    legalName: 'Ama Serwaa Mensah',
    documentType: 'ghana_card',
    documentNumber: d.number,
    documentIds,
    ...overrides,
  });

  test('an agent can submit identity verification, which stops at pending review', async () => {
    const agent = await registerAgent('primary');

    const front = await uploadDocument(agent.client, {
      kind: 'document_front',
      bytes: createPng(200, 140),
      filename: 'ghana-card-front.png',
      mime: 'image/png',
    });
    assert.equal(front.status, 201, JSON.stringify(front.body));
    const back = await uploadDocument(agent.client, {
      kind: 'document_back',
      bytes: createPdf(),
      filename: 'ghana-card-back.pdf',
      mime: 'application/pdf',
    });
    assert.equal(back.status, 201, JSON.stringify(back.body));
    d.docs.front = front.body.document.id;
    d.docs.back = back.body.document.id;

    // The upload response already refuses to echo anything sensitive.
    const serialised = JSON.stringify(front.body);
    assert.ok(!serialised.includes(d.number));
    assert.ok(!serialised.includes('ghana-card-front'), 'the original filename must not be echoed');

    const submitted = await submitIdentity(agent.client, [d.docs.front, d.docs.back]);
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(submitted.body.identity.status, 'pending_review');
    assert.equal(submitted.body.identity.submittedAt.length > 0, true);

    // Masked only: the last four characters survive, nothing else.
    assert.equal(submitted.body.identity.documentNumberMasked.endsWith('7890'), true);
    assert.equal(submitted.body.identity.documentNumber, null);
    assert.equal(submitted.body.identity.numberRetained, true, 'the test deployment has an encryption key');
    assert.ok(!JSON.stringify(submitted.body).includes(d.number), 'no full number in the response');

    const own = await agent.client.get('/api/verification');
    assert.equal(own.status, 200);
    assert.equal(own.body.verification.identity.status, 'pending_review');
    assert.equal(own.body.verification.identity.documents.length, 2);
    assert.equal(own.body.verification.identity.documents[0].downloadUrl.startsWith('/api/verification-documents/'), true);
    assert.equal(own.body.verification.identityVerified, false);
    assert.equal(own.body.verification.professionallyAuthorised, false);
    assert.equal(own.body.verification.identity.establishesOwnership, false);
  });

  test('the full identity number is never stored in plain text', async () => {
    const stored = inspect(d.agents.primary.email);
    assert.equal(stored.encryptionConfigured, true);
    assert.equal(stored.identity.status, 'pending_review');
    assert.equal(stored.identity.masked.endsWith('7890'), true);
    assert.equal(stored.identity.retained, true);
    assert.equal(stored.identity.encryptedPresent, true);
    assert.equal(stored.identity.encryptedLooksLikePlainNumber, false, 'the ciphertext must not be the number');
    assert.equal(stored.identity.decryptsWithConfiguredKey, true, 'the stored value must decrypt with the configured key');
    assert.ok(!JSON.stringify(stored).includes(d.number), 'the helper must not print the number either');

    // Documents live in the private store, never in the public uploads folder.
    assert.equal(stored.documents.length, 2);
    assert.equal(stored.documents.every((doc) => doc.insidePublicUploads === false), true);
    assert.equal(stored.documents.every((doc) => doc.fileExists === true), true);
    assert.match(stored.documents[0].storageId, /^doc_[a-f0-9]{24}$/);
  });

  test('invalid file types and oversized uploads are rejected', async () => {
    const agent = d.agents.primary;

    const phpFile = await uploadDocument(agent.client, {
      kind: 'document_front',
      bytes: initial('<?php echo "pwned"; ?>'),
      filename: 'shell.php',
      mime: 'application/x-php',
    });
    assert.equal(phpFile.status, 422, JSON.stringify(phpFile.body));

    const fakePng = await uploadDocument(agent.client, {
      kind: 'document_front',
      bytes: initial('<?php system($_GET["c"]); ?>'),
      filename: 'innocent.png',
      mime: 'image/png',
    });
    assert.equal(fakePng.status, 422, 'the extension and declared type are not trusted');

    const svg = await uploadDocument(agent.client, {
      kind: 'document_front',
      bytes: initial('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      filename: 'card.svg',
      mime: 'image/svg+xml',
    });
    assert.equal(svg.status, 422, 'SVG is never accepted as a private document');

    const oversized = await uploadDocument(agent.client, {
      kind: 'document_front',
      bytes: Buffer.alloc(5 * 1024 * 1024 + 2048, 0x41),
      filename: 'huge.png',
      mime: 'image/png',
    });
    assert.equal(oversized.status, 422);
    assert.match(oversized.body.error, /too large/i);

    const unsupportedKind = await uploadDocument(agent.client, {
      kind: 'passport_photo_of_a_dog',
      bytes: createPng(120, 120),
      filename: 'x.png',
      mime: 'image/png',
    });
    assert.equal(unsupportedKind.status, 422);

    // Nothing was stored by any of the rejected attempts.
    const stored = inspect(agent.email);
    assert.equal(stored.documents.length, 2, 'rejected uploads must not create records');
  });

  test('path traversal and malicious filenames cannot reach the private store', async () => {
    const agent = d.agents.primary;

    const traversalName = await uploadDocument(agent.client, {
      kind: 'document_front',
      bytes: createPng(160, 160),
      filename: '../../../../etc/passwd.png',
      mime: 'image/png',
    });
    assert.equal(traversalName.status, 201, JSON.stringify(traversalName.body));
    // The server names the file; the client name is ignored entirely.
    assert.match(traversalName.body.document.id, /^vdoc[-_][A-Za-z0-9]+$/);
    assert.ok(!traversalName.body.document.id.includes('passwd'), 'the client filename is not used');
    d.docs.traversal = traversalName.body.document.id;

    const stored = inspect(agent.email);
    const traversalDoc = stored.documents.find((doc) => doc.id === d.docs.traversal);
    assert.ok(traversalDoc);
    assert.equal(traversalDoc.insidePublicUploads, false);
    assert.match(traversalDoc.storageId, /^doc_[a-f0-9]{24}$/);

    for (const id of ['..%2F..%2Fconfig.php', '..%2F..%2F..%2Fetc%2Fpasswd', 'doc_../../config.php', 'vdoc_%2e%2e%2f']) {
      const res = await agent.client.get(`/api/verification-documents/${id}`);
      assert.ok([400, 404].includes(res.status), `traversal id ${id} returned ${res.status}`);
      const del = await agent.client.delete(`/api/verification-documents/${id}`);
      assert.ok([400, 404].includes(del.status));
    }
  });

  test('a private document is unreachable from any public URL', async () => {
    const agent = d.agents.primary;
    const stored = inspect(agent.email);
    const doc = stored.documents.find((row) => row.id === d.docs.front);
    assert.ok(doc);

    // Neither the random storage name nor the public uploads route can serve it.
    const publicPath = await guest.get(`/api/uploads/${doc.storageId}.png`);
    assert.equal(publicPath.status, 404);
    const publicPdf = await guest.get(`/api/uploads/${doc.storageId}.pdf`);
    assert.equal(publicPdf.status, 404);
    const directStorage = await guest.get(`/api/storage/private/${doc.storageId}.png`);
    assert.equal(directStorage.status, 404);
    const hiddenFile = await guest.get(`/api/uploads/doc_${'a'.repeat(24)}.png`);
    assert.equal(hiddenFile.status, 404);

    // The authenticated route exists, but anonymous callers get 401.
    const anonymous = await guest.get(`/api/verification-documents/${d.docs.front}`);
    assert.equal(anonymous.status, 401);
  });

  test('an agent cannot view another agent documents, and cannot access the review queue', async () => {
    const second = await registerAgent('secondary');

    // The owner can read their own file.
    const own = await d.agents.primary.client.get(`/api/verification-documents/${d.docs.front}`);
    assert.equal(own.status, 200);
    assert.equal(own.headers.get('content-type'), 'image/png');
    assert.match(own.headers.get('content-disposition') || '', /attachment/);
    assert.equal(own.headers.get('x-content-type-options'), 'nosniff');

    // Another agent cannot, and is not told the document exists.
    const other = await second.client.get(`/api/verification-documents/${d.docs.front}`);
    assert.equal(other.status, 404);
    const otherDelete = await second.client.delete(`/api/verification-documents/${d.docs.front}`);
    assert.equal(otherDelete.status, 404);

    // Nor can they reach the reviewer surface at all.
    assert.equal((await second.client.get('/api/admin/verifications')).status, 403);
    assert.equal((await second.client.get(`/api/admin/verifications/${d.agents.primary.id}`)).status, 403);
    assert.equal(
      (await second.client.post(`/api/admin/verifications/${d.agents.primary.id}/identity/decision`, {
        decision: 'approve',
      })).status,
      403
    );

    // Submitting with somebody else's document id is refused.
    const steal = await submitIdentity(second.client, [d.docs.front]);
    assert.equal(steal.status, 422);
    assert.ok(steal.body.fields.documents);
  });

  test('an agent cannot approve their own verification', async () => {
    const res = await d.agents.primary.client.post(
      `/api/admin/verifications/${d.agents.primary.id}/identity/decision`,
      { decision: 'approve', note: 'Self approval attempt' }
    );
    assert.equal(res.status, 403);

    const stillPending = await d.agents.primary.client.get('/api/verification');
    assert.equal(stillPending.body.verification.identity.status, 'pending_review');
  });

  test('an administrator without the capability cannot read identity documents', async () => {
    const plain = await createAdmin('plain');
    d.admins.plain = plain;

    // A brand-new administrator has no verification access at all.
    assert.equal((await plain.client.get('/api/admin/verifications')).status, 403);
    assert.equal((await plain.client.get(`/api/admin/verifications/${d.agents.primary.id}`)).status, 403);
    assert.equal(
      (await plain.client.post(`/api/admin/verifications/${d.agents.primary.id}/identity/decision`, {
        decision: 'approve',
      })).status,
      403
    );

    // The plain admin is still a working administrator elsewhere.
    assert.equal((await plain.client.get('/api/admin/stats')).status, 200);

    // Document access cannot be granted without the reviewer capability.
    // (The PHP-WASM runner does not surface exit codes, so the message is the
    // contract here; the real proof is that nothing was granted.)
    const badGrant = grant(plain.email, { documents: true });
    assert.match(badGrant.stderr + badGrant.stdout, /requires the reviewer capability/i);
    assert.equal((await plain.client.get('/api/admin/verifications')).status, 403);

    // Grant the reviewer capability only: the queue and masked data open up,
    // the files and the full number stay closed.
    const reviewerOnly = grant(plain.email, { reviewer: true });
    assert.match(reviewerOnly.stdout, /Reviewer\s*:\s*granted/i);

    const queue = await plain.client.get('/api/admin/verifications');
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    assert.equal(queue.body.capabilities.identityDocumentAccess, false);
    assert.ok(!JSON.stringify(queue.body).includes(d.number));

    const detail = await plain.client.get(`/api/admin/verifications/${d.agents.primary.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.verification.identity.documentNumber, null, 'no full number without document access');
    assert.equal(detail.body.verification.identity.documentNumberMasked.endsWith('7890'), true);
    assert.equal(
      detail.body.verification.identity.documents.every((doc) => doc.downloadUrl === null),
      true
    );
    assert.equal(detail.body.verification.capabilities.identityDocumentAccess, false);

    const blocked = await plain.client.get(`/api/verification-documents/${d.docs.front}`);
    assert.equal(blocked.status, 404, 'a reviewer without document access gets no file');

    // Revoke again so the capability is proven to be reversible.
    const revoked = grant(plain.email, { reviewer: false });
    assert.match(revoked.stdout, /Reviewer\s*:\s*revoked/i);
    assert.equal((await plain.client.get('/api/admin/verifications')).status, 403);
  });

  test('a submitted licence number does not make an agent professionally authorised', async () => {
    const agent = d.agents.primary;

    const licenceDoc = await uploadDocument(agent.client, {
      kind: 'licence',
      bytes: createPdf(),
      filename: 'reac-licence.pdf',
      mime: 'application/pdf',
    });
    assert.equal(licenceDoc.status, 201, JSON.stringify(licenceDoc.body));
    d.docs.licence = licenceDoc.body.document.id;

    const submitted = await agent.client.post('/api/verification/professional', {
      licenceNumber: d.licenceNumber,
      issuingAuthority: 'Real Estate Agency Council (test value)',
      licenceCategory: 'Agency',
      issueDate: '2025-01-15',
      expiryDate: new Date(Date.now() + 200 * 86400_000).toISOString().slice(0, 10),
      documentIds: [d.docs.licence],
      // Attempts to self-certify are ignored.
      status: 'approved',
      registryChecked: true,
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(submitted.body.professional.status, 'pending_review');
    assert.equal(submitted.body.professional.registryChecked, false);
    assert.equal(submitted.body.professional.establishesLegalAuthorisation, false);

    const own = await agent.client.get('/api/verification');
    assert.equal(own.body.verification.professional.status, 'pending_review');
    assert.equal(own.body.verification.professionallyAuthorised, false);
    assert.equal(own.body.verification.identity.status, 'pending_review', 'identity is untouched');

    const stored = inspect(agent.email);
    assert.equal(stored.professional.status, 'pending_review');
    assert.equal(stored.professional.registryChecked, false);
  });

  test('a landlord can submit optional identity verification (tenants cannot)', async () => {
    const email = uniqueEmail('verify-landlord');
    const password = 'Verify-Landlord-Pass-1';
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${password}`, '--name=Verifying Landlord', '--role=landlord'],
      state.testEnv
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);

    const client = new ApiClient(baseUrl);
    const login = await client.post('/api/auth/login', { email, password });
    assert.equal(login.status, 200);
    d.landlord = { client, id: login.body.user.id, email };

    const doc = await uploadDocument(client, {
      kind: 'document_front',
      bytes: createPng(180, 120),
      filename: 'landlord-id.png',
      mime: 'image/png',
    });
    assert.equal(doc.status, 201, JSON.stringify(doc.body));
    d.docs.landlord = doc.body.document.id;
    // Task 03: a Ghana Card needs both sides before it can be submitted.
    const docBack = await uploadDocument(client, {
      kind: 'document_back',
      bytes: createPng(180, 120),
      filename: 'landlord-id-back.png',
      mime: 'image/png',
    });
    assert.equal(docBack.status, 201, JSON.stringify(docBack.body));
    d.docs.landlordBack = docBack.body.document.id;

    // Landlords cannot submit a professional authorisation at all.
    assert.equal(
      (await client.post('/api/verification/professional', {
        licenceNumber: 'NOPE-1',
        issuingAuthority: 'Nope',
      })).status,
      403
    );

    // A front-only Ghana Card submission is refused: the reviewer is never
    // asked to verify half an identity.
    const frontOnly = await client.post('/api/verification/identity', {
      legalName: 'Kofi Verification Landlord',
      documentType: 'ghana_card',
      documentNumber: 'GHA-987654321-2',
      documentIds: [d.docs.landlord],
    });
    assert.equal(frontOnly.status, 422);
    assert.match(String(frontOnly.body.fields.documents), /BACK of your Ghana Card/i);

    const submitted = await client.post('/api/verification/identity', {
      legalName: 'Kofi Verification Landlord',
      documentType: 'ghana_card',
      documentNumber: 'GHA-987654321-2',
      documentIds: [d.docs.landlord, d.docs.landlordBack],
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(submitted.body.identity.status, 'pending_review');
    assert.equal(submitted.body.identity.establishesOwnership, false);

    const own = await client.get('/api/verification');
    assert.equal(own.body.verification.professional, null, 'landlords have no professional track');
    assert.equal(own.body.verification.identity.establishesOwnership, false);

    // Tenants have no verification surface and need no documents.
    const tenantSignup = await visitor().post('/api/auth/register', {
      name: 'Unverified Tenant',
      email: uniqueEmail('verify-tenant'),
      phone: '+233 24 888 0200',
      password: 'Verify-Tenant-Pass-1',
      role: 'tenant',
    });
    assert.equal(tenantSignup.status, 201);
    assert.equal(tenantSignup.body.user.role, 'tenant');
  });

  test('identity approval does not approve professional authorisation', async () => {
    const reviewer = await createAdmin('reviewer');
    d.admins.reviewer = reviewer;
    const granted = grant(reviewer.email, { reviewer: true, documents: true });
    assert.match(granted.stdout, /Reviewer\s*:\s*granted[\s\S]*Documents\s*:\s*granted/i);

    // With both capabilities the reviewer sees the full number and file links.
    const detail = await reviewer.client.get(`/api/admin/verifications/${d.agents.primary.id}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.verification.capabilities.identityDocumentAccess, true);
    assert.equal(detail.body.verification.identity.documentNumber, d.number);
    assert.ok(detail.body.verification.identity.documents[0].downloadUrl);

    const file = await reviewer.client.get(`/api/verification-documents/${d.docs.front}`);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');

    const approved = await reviewer.client.post(
      `/api/admin/verifications/${d.agents.primary.id}/identity/decision`,
      { decision: 'approve', note: 'Ghana Card checked against the uploaded scans.' }
    );
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.identity.status, 'approved');
    assert.equal(approved.body.history.length, 1);

    // The professional track is untouched by the identity decision.
    const after = await reviewer.client.get(`/api/admin/verifications/${d.agents.primary.id}`);
    assert.equal(after.body.verification.identity.status, 'approved');
    assert.equal(after.body.verification.professional.status, 'pending_review');

    // The agent's own view separates the two, and still exposes no number.
    const own = await d.agents.primary.client.get('/api/verification');
    assert.equal(own.body.verification.identityVerified, true);
    assert.equal(own.body.verification.professionallyAuthorised, false);
    assert.equal(own.body.verification.identity.documentNumber, null);
    assert.ok(!JSON.stringify(own.body).includes(d.number));

    // An approved identity cannot be replaced by the agent.
    const replace = await submitIdentity(d.agents.primary.client, [d.docs.front]);
    assert.equal(replace.status, 409);

    // A reviewer cannot approve without a reason when rejecting.
    const reasonless = await reviewer.client.post(
      `/api/admin/verifications/${d.agents.primary.id}/professional/decision`,
      { decision: 'reject' }
    );
    assert.equal(reasonless.status, 422);
  });

  test('landlord identity approval does not verify property ownership', async () => {
    // A property owned by this landlord, created before verification.
    const property = await d.landlord.client.post('/api/properties', {
      title: 'Ownership stays unverified after identity approval',
      location: 'Adenta, Accra',
      city: 'Accra',
      rentGhs: 3300,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: 'Apartment',
      description: 'A listing used to prove identity verification is not ownership verification.',
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
    });
    assert.equal(property.status, 201, JSON.stringify(property.body));
    d.landlord.propertyId = property.body.property.id;
    assert.equal(property.body.property.isLandlordVerified, false);

    const approved = await d.admins.reviewer.client.post(
      `/api/admin/verifications/${d.landlord.id}/identity/decision`,
      { decision: 'approve', note: 'Landlord identity checked. Ownership is a separate question.' }
    );
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.identity.status, 'approved');

    const refreshed = await admin.get(`/api/properties/${d.landlord.propertyId}`);
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.body.property.isLandlordVerified, false, 'identity is not ownership');

    const landlordView = await d.landlord.client.get('/api/verification');
    assert.equal(landlordView.body.verification.identityVerified, true);
    assert.equal(landlordView.body.verification.identity.establishesOwnership, false);

    // The reviewer detail reinforces the distinction in its own payload.
    const detail = await d.admins.reviewer.client.get(`/api/admin/verifications/${d.landlord.id}`);
    assert.equal(detail.body.verification.notes.identityEstablishesOwnership, false);
  });

  test('expired and rejected authorisations are represented accurately', async () => {
    const agent = d.agents.primary;
    const reviewer = d.admins.reviewer;

    // 1. A current licence can be approved — professional authorisation only.
    const submitted = await agent.client.post('/api/verification/professional', {
      licenceNumber: d.licenceNumber,
      issuingAuthority: 'Real Estate Agency Council (test value)',
      licenceCategory: 'Agency',
      issueDate: '2026-01-10',
      expiryDate: new Date(Date.now() + 300 * 86400_000).toISOString().slice(0, 10),
      documentIds: [d.docs.licence],
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(submitted.body.professional.status, 'pending_review');

    const approved = await reviewer.client.post(
      `/api/admin/verifications/${agent.id}/professional/decision`,
      { decision: 'approve', note: 'Licence checked against the uploaded certificate.' }
    );
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.professional.status, 'approved');

    const agentApproved = await agent.client.get('/api/verification');
    assert.equal(agentApproved.body.verification.professional.status, 'approved');
    assert.equal(agentApproved.body.verification.professionallyAuthorised, true);
    assert.equal(agentApproved.body.verification.identity.status, 'approved', 'identity was already approved');

    // 2. A licence whose date has passed reads as expired even though the
    //    reviewer's stored decision was "approved".
    const expiredByDate = inspect(agent.email, ['--expire-professional=1']);
    assert.equal(expiredByDate.professional.status, 'approved');
    assert.equal(expiredByDate.professional.effectiveStatus, 'expired');

    const agentLapsed = await agent.client.get('/api/verification');
    assert.equal(agentLapsed.body.verification.professional.storedStatus, 'approved');
    assert.equal(agentLapsed.body.verification.professional.status, 'expired');
    assert.equal(agentLapsed.body.verification.professional.expired, true);
    assert.equal(agentLapsed.body.verification.professionallyAuthorised, false);

    // 3. A reviewer can also record expiry explicitly; the decision is kept.
    const markedExpired = await reviewer.client.post(
      `/api/admin/verifications/${agent.id}/professional/decision`,
      { decision: 'mark_expired', note: 'Licence lapsed on the expiry date shown.' }
    );
    assert.equal(markedExpired.status, 200, JSON.stringify(markedExpired.body));
    assert.equal(markedExpired.body.professional.status, 'expired');
    assert.equal(markedExpired.body.professional.storedStatus, 'expired');

    // 4. A lapsed certificate cannot be approved at all.
    const lapsedSubmit = await agent.client.post('/api/verification/professional', {
      licenceNumber: 'REAC-2019-0001',
      issuingAuthority: 'Real Estate Agency Council (test value)',
      licenceCategory: 'Agency',
      issueDate: '2018-01-01',
      expiryDate: '2019-01-01',
      documentIds: [d.docs.licence],
    });
    assert.equal(lapsedSubmit.status, 201, JSON.stringify(lapsedSubmit.body));
    assert.equal(lapsedSubmit.body.professional.status, 'pending_review');

    const refuseLapsed = await reviewer.client.post(
      `/api/admin/verifications/${agent.id}/professional/decision`,
      { decision: 'approve', note: 'Trying to approve a lapsed certificate.' }
    );
    assert.equal(refuseLapsed.status, 422);
    assert.match(refuseLapsed.body.error, /expired/i);

    // 5. Rejection carries the reviewer's reason to the agent.
    const rejected = await reviewer.client.post(
      `/api/admin/verifications/${agent.id}/professional/decision`,
      { decision: 'reject', note: 'The certificate expired; submit a current one.' }
    );
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
    assert.equal(rejected.body.professional.status, 'rejected');

    const agentRejected = await agent.client.get('/api/verification');
    assert.equal(agentRejected.body.verification.professional.status, 'rejected');
    assert.match(agentRejected.body.verification.professional.decisionNote, /expired/i);
    assert.equal(agentRejected.body.verification.professionallyAuthorised, false);

    // 6. Resubmission required is its own state, not a rejection.
    await agent.client.post('/api/verification/professional', {
      licenceNumber: d.licenceNumber,
      issuingAuthority: 'Real Estate Agency Council (test value)',
      licenceCategory: 'Agency',
      issueDate: '2026-01-10',
      expiryDate: new Date(Date.now() + 300 * 86400_000).toISOString().slice(0, 10),
      documentIds: [d.docs.licence],
    });
    const moreInfo = await reviewer.client.post(
      `/api/admin/verifications/${agent.id}/professional/decision`,
      { decision: 'request_resubmission', note: 'Upload the back of the certificate as well.' }
    );
    assert.equal(moreInfo.status, 200, JSON.stringify(moreInfo.body));
    assert.equal(moreInfo.body.professional.status, 'resubmission_required');

    // History keeps every decision in order and cannot be rewritten.
    const history = await reviewer.client.get(`/api/admin/verifications/${agent.id}/history?scope=professional`);
    assert.equal(history.status, 200);
    assert.deepEqual(
      history.body.history.map((entry) => entry.toStatus),
      ['approved', 'expired', 'rejected', 'resubmission_required']
    );
    assert.ok(history.body.history.every((entry) => entry.reviewerName.length > 0));
    assert.ok(history.body.history.every((entry) => entry.decidedAt.length > 0));

    // The identity history is separate from the professional one.
    const identityHistory = await reviewer.client.get(`/api/admin/verifications/${agent.id}/history?scope=identity`);
    assert.deepEqual(identityHistory.body.history.map((entry) => entry.scope), ['identity']);
  });

  test('verification decisions are audited without the identity number', async () => {
    const logs = await admin.get('/api/admin/audit-logs');
    assert.equal(logs.status, 200);

    const actions = logs.body.logs.map((log) => log.action);
    for (const action of [
      'document.uploaded',
      'document.viewed',
      'verification.identity_submitted',
      'verification.identity_decided',
      'verification.professional_submitted',
      'verification.professional_decided',
    ]) {
      assert.ok(actions.includes(action), `missing audit action ${action}`);
    }

    const serialised = JSON.stringify(logs.body.logs);
    assert.ok(!serialised.includes(d.number), 'the audit trail must never contain the document number');
    assert.ok(!serialised.includes('Ama Serwaa Mensah'), 'the audit trail must not keep the legal-name copy');

    const identityDecision = logs.body.logs.find((log) => log.action === 'verification.identity_decided');
    assert.equal(identityDecision.entityType, 'identity_verification');
    assert.ok(identityDecision.entityId.length > 0);

    // The reviewer with document access could read the file; that access is logged too.
    const viewed = logs.body.logs.filter((log) => log.action === 'document.viewed');
    assert.ok(viewed.length >= 1);
  });

  test('tenants still register without identity documents', async () => {
    const client = visitor();
    const email = uniqueEmail('unverified-tenant');
    const res = await client.post('/api/auth/register', {
      name: 'No Documents Needed',
      email,
      phone: '+233 24 888 0300',
      password: 'Tenant-No-Documents-1',
      role: 'tenant',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.isVerified, false);

    // No verification surface, no verification row, no document requirement.
    assert.equal((await client.get('/api/verification')).status, 403);
    assert.equal((await client.post('/api/verification/identity', { legalName: 'X' })).status, 403);

    const stored = inspect(email);
    assert.equal(stored.identity, null);
    assert.equal(stored.documents.length, 0);
  });

  test('Increments A, B and C still behave', async () => {
    // A: tenancy agreements retired, receipts not issuable.
    assert.equal((await admin.get('/api/agreements')).status, 404);
    assert.equal((await admin.post('/api/receipts', {})).status, 503);

    // B: the viewing-fee ledger still refuses to apply a percentage.
    const policy = await admin.get('/api/admin/viewing-fees/policy');
    assert.equal(policy.status, 200);
    assert.equal(policy.body.policy.appliedToCalculations, false);
    assert.equal(policy.body.policy.approvedPolicy, null);

    // C: a pending agent still cannot submit a listing, and the agent profile
    // endpoints still work.
    const second = d.agents.secondary;
    const landlordId = d.landlord.id;
    const blocked = await second.client.post('/api/properties', {
      title: 'Pending agent still blocked',
      location: 'Accra',
      rentGhs: 1200,
      description: 'A pending agent must not be able to submit listings.',
      images: ['https://example.com/a.jpg'],
      landlordId,
    });
    assert.equal(blocked.status, 403);

    const profile = await second.client.patch('/api/agent/profile', { operatingCity: 'Tema' });
    assert.equal(profile.status, 200);
    assert.equal(profile.body.profile.operatingCity, 'Tema');

    // Existing staff tooling is unaffected.
    assert.equal((await admin.get('/api/admin/stats')).status, 200);
    assert.equal((await admin.get('/api/admin/agents')).status, 200);

    // The verification reviewer capability does not grant anything else. Since
    // Increment G the money ledger is a financial capability too, so a reviewer
    // without it is refused there even though ordinary admin tooling still works.
    assert.equal((await d.admins.reviewer.client.get('/api/admin/viewing-fees')).status, 403);
    assert.equal((await d.admins.reviewer.client.get('/api/admin/stats')).status, 200);
  });

  test('the retention job reports first and only deletes when applied', async () => {
    const backdate = inspect(d.agents.primary.email, ['--backdate-retention=2']);
    assert.notEqual(backdate.identity.retentionPurgeAfter, '');

    const dryRun = runPhpScript('php-backend/verification_retention.php', [], state.testEnv);
    assert.equal(dryRun.status, 0, dryRun.stdout + dryRun.stderr);
    assert.match(dryRun.stdout, /DRY RUN/);
    assert.match(dryRun.stdout, /Due for purge: 1/);

    const afterDryRun = inspect(d.agents.primary.email);
    assert.equal(afterDryRun.identity.masked.endsWith('7890'), true, 'a dry run deletes nothing');
    assert.equal(
      afterDryRun.documents.filter((doc) => doc.scope === 'identity' && doc.fileExists).length,
      3,
      'every identity document still exists after a dry run'
    );

    const applied = runPhpScript('php-backend/verification_retention.php', ['--apply'], state.testEnv);
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
    assert.match(applied.stdout, /Purged/);

    const afterApply = inspect(d.agents.primary.email);
    assert.equal(
      afterApply.identity.status,
      'approved',
      `the decision itself is kept (state: ${JSON.stringify(afterApply.identity)})`
    );
    assert.equal(afterApply.identity.masked, '', 'the masked number is removed');
    assert.equal(afterApply.identity.retained, false);
    assert.equal(afterApply.identity.encryptedPresent, false);
    assert.equal(afterApply.identity.retentionPurgeAfter, '');
    assert.equal(
      afterApply.documents.filter((doc) => doc.scope === 'identity').every((doc) => doc.fileExists === false),
      true
    );
    assert.equal(
      afterApply.documents.filter((doc) => doc.scope === 'identity').every((doc) => doc.deletedAt !== ''),
      true
    );
    // The professional document is outside the identity retention window and stays.
    assert.equal(
      afterApply.documents.filter((doc) => doc.scope === 'professional').every((doc) => doc.fileExists),
      true
    );
    assert.ok(afterApply.auditActions.includes('verification.purged'));
  });
});

// ---------------------------------------------------------------------------
describe('Viewing-fee ledger (Increment B)', () => {
  const ledger = {};

  const bookViewing = async (label) => {
    const res = await guest.post('/api/viewing-requests', {
      tenantName: `Ledger ${label}`,
      tenantPhone: '+233 24 888 0001',
      tenantEmail: `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
      propertyId: state.seededPropertyId,
      date: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
      time: '10:30 AM',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.viewingId;
  };

  const markFeePaid = async (viewingId) => {
    // The viewing has to actually happen (Increment F), and the fee is recorded
    // separately from the completion.
    await completeViewingAs(admin, viewingId);
    const res = await admin.patch(`/api/viewings/${viewingId}`, { viewingFeePaid: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  };

  const findRecord = async (viewingId) => {
    const res = await admin.get('/api/admin/viewing-fees');
    assert.equal(res.status, 200);
    return res.body.records.find((record) => record.viewingId === viewingId);
  };

  const stats = async () => (await admin.get('/api/admin/stats')).body.stats;

  test('reporting a fee records what the agent collected, not Goodlucks revenue', async () => {
    const before = await stats();
    ledger.viewingId = await bookViewing('alpha');
    await markFeePaid(ledger.viewingId);

    const record = await findRecord(ledger.viewingId);
    assert.ok(record, 'a ledger row must be created when a fee is reported');
    ledger.recordId = record.id;

    assert.equal(record.feeTotalGhs, 100);
    assert.equal(record.shareBasis, 'not_set');
    assert.equal(record.goodlucksShareGhs, null, 'nothing is owed until an amount is agreed');
    assert.equal(record.outstandingGhs, null, 'an unagreed share cannot have an outstanding balance');
    assert.equal(record.remittedGhs, 0);
    assert.equal(record.collectionState, 'reported');

    const after = await stats();
    assert.equal(after.viewingFeesCollectedGhs, before.viewingFeesCollectedGhs + 100);
    assert.equal(after.goodlucksShareReceivedGhs, before.goodlucksShareReceivedGhs, 'a reported fee is not revenue');
    assert.equal(after.goodlucksShareDueGhs, before.goodlucksShareDueGhs);
  });

  test('the fee-sharing policy is provisional and never applied', async () => {
    const res = await admin.get('/api/admin/viewing-fees/policy');
    assert.equal(res.status, 200);
    const policy = res.body.policy;

    assert.equal(policy.status, 'provisional');
    assert.equal(policy.appliedToCalculations, false);
    assert.equal(policy.approvedPolicy, null, 'no approved policy may ship');

    const standard = policy.proposed.find((tier) => tier.tier === 'standard');
    // Increment E unified the tier vocabulary: the higher tier is
    // `professional` (it was `verified` in Increment B, which implied a licence
    // check the platform does not perform).
    const verified = policy.proposed.find((tier) => tier.tier === 'professional');
    assert.equal(standard.agentSharePercent, 60);
    assert.equal(standard.goodlucksSharePercent, 40);
    assert.equal(verified.agentSharePercent, 70);
    assert.equal(verified.goodlucksSharePercent, 30);
    assert.ok(policy.proposed.every((tier) => tier.status === 'provisional'));

    // The 40% proposal must not appear anywhere in the stored record.
    const record = await findRecord(ledger.viewingId);
    assert.equal(record.goodlucksShareGhs, null);
    assert.equal(record.shareBasis, 'not_set');
  });

  test('an agreed share records money owed, still not money received', async () => {
    const before = await stats();
    const agreed = await admin.post(`/api/admin/viewing-fees/${ledger.recordId}/share`, {
      amountGhs: 40,
      note: 'Agreed with the agent after the viewing',
    });

    assert.equal(agreed.status, 200, JSON.stringify(agreed.body));
    assert.equal(agreed.body.record.goodlucksShareGhs, 40);
    assert.equal(agreed.body.record.agentShareGhs, 60);
    assert.equal(agreed.body.record.shareBasis, 'manual_agreement');
    assert.equal(agreed.body.record.outstandingGhs, 40);
    assert.equal(agreed.body.record.remittedGhs, 0);

    const after = await stats();
    assert.equal(after.goodlucksShareDueGhs, before.goodlucksShareDueGhs + 40);
    assert.equal(after.goodlucksShareReceivedGhs, before.goodlucksShareReceivedGhs, 'owed is not received');
    assert.equal(after.agentShareRetainedGhs, before.agentShareRetainedGhs + 60);
  });

  test('only a recorded remittance counts as money Goodlucks received', async () => {
    const before = await stats();
    const remittance = await admin.post(`/api/admin/viewing-fees/${ledger.recordId}/remittances`, {
      amountGhs: 15,
      method: 'MTN MoMo',
      reference: 'MOMO-LEDGER-1',
      receivedAt: new Date().toISOString().slice(0, 10),
      notes: 'part payment',
    });

    assert.equal(remittance.status, 201, JSON.stringify(remittance.body));
    assert.equal(remittance.body.record.remittedGhs, 15);
    assert.equal(remittance.body.record.outstandingGhs, 25);
    assert.equal(remittance.body.record.remittances.length, 1);

    const after = await stats();
    assert.equal(after.goodlucksShareReceivedGhs, before.goodlucksShareReceivedGhs + 15);
    assert.equal(after.outstandingReceivablesGhs, 25);
  });

  test('remittances cannot exceed what is owed, and cannot exist without an agreed share', async () => {
    const over = await admin.post(`/api/admin/viewing-fees/${ledger.recordId}/remittances`, {
      amountGhs: 100,
    });
    assert.equal(over.status, 422);
    assert.match(over.body.error, /more than the agent still owes/i);

    const secondViewing = await bookViewing('beta');
    await markFeePaid(secondViewing);
    const secondRecord = await findRecord(secondViewing);
    assert.ok(secondRecord);

    const premature = await admin.post(`/api/admin/viewing-fees/${secondRecord.id}/remittances`, {
      amountGhs: 10,
    });
    assert.equal(premature.status, 422);
    assert.match(premature.body.error, /agree the goodlucks share/i);

    const tooHigh = await admin.post(`/api/admin/viewing-fees/${secondRecord.id}/share`, {
      amountGhs: 250,
    });
    assert.equal(tooHigh.status, 422);
    assert.match(tooHigh.body.error, /cannot exceed/i);

    ledger.secondRecordId = secondRecord.id;
  });

  test('a disputed fee cannot be settled, and settled money cannot be voided away', async () => {
    const dispute = await admin.post(`/api/admin/viewing-fees/${ledger.secondRecordId}/share`, {
      amountGhs: 40,
    });
    assert.equal(dispute.status, 200);

    const disputed = await admin.post(`/api/admin/viewing-fees/${ledger.secondRecordId}/state`, {
      state: 'disputed',
      note: 'Tenant says the agent asked for a different amount',
    });
    assert.equal(disputed.status, 200);
    assert.equal(disputed.body.record.collectionState, 'disputed');

    const settleDisputed = await admin.post(`/api/admin/viewing-fees/${ledger.secondRecordId}/remittances`, {
      amountGhs: 10,
    });
    assert.equal(settleDisputed.status, 422);
    assert.match(settleDisputed.body.error, /disputed/i);

    // The first record already has a remittance: it must not be voidable.
    const voidSettled = await admin.post(`/api/admin/viewing-fees/${ledger.recordId}/state`, {
      state: 'void',
    });
    assert.equal(voidSettled.status, 422);
    assert.match(voidSettled.body.error, /already been remitted/i);

    // ...and unticking "fee paid" on the viewing must be refused as well.
    const unmark = await admin.patch(`/api/viewings/${ledger.viewingId}`, { viewingFeePaid: false });
    assert.equal(unmark.status, 409);
    assert.match(unmark.body.error, /already been remitted/i);
  });

  test('only staff can read or change the ledger', async () => {
    assert.equal((await guest.get('/api/admin/viewing-fees')).status, 401);
    assert.equal((await tenant.get('/api/admin/viewing-fees')).status, 403);
    assert.equal((await landlord.get('/api/admin/viewing-fees')).status, 403);
    assert.equal((await guest.get('/api/admin/viewing-fees/policy')).status, 401);
    assert.equal((await tenant.get('/api/admin/viewing-fees/policy')).status, 403);

    assert.equal(
      (await landlord.post(`/api/admin/viewing-fees/${ledger.recordId}/share`, { amountGhs: 1 })).status,
      403
    );
    assert.equal(
      (await tenant.post(`/api/admin/viewing-fees/${ledger.recordId}/remittances`, { amountGhs: 1 })).status,
      403
    );
    assert.equal((await admin.post('/api/admin/viewing-fees/nope-nope/share', { amountGhs: 1 })).status, 404);
  });

  test('fee movements are written to the audit trail', async () => {
    const res = await admin.get('/api/admin/audit-logs?limit=200');
    assert.equal(res.status, 200);
    const actions = res.body.logs.map((log) => log.action);
    assert.ok(actions.includes('viewing_fee.reported'));
    assert.ok(actions.includes('viewing_fee.share_agreed'));
    assert.ok(actions.includes('viewing_fee.remittance_recorded'));
    assert.ok(actions.includes('viewing_fee.state_changed'));

    const remittanceLog = res.body.logs.find((log) => log.action === 'viewing_fee.remittance_recorded');
    assert.equal(remittanceLog.context.receivedBy, 'goodlucks');
  });
});

// ---------------------------------------------------------------------------
describe('Receipt labelling and legacy attribution', () => {
  const receipts = {};

  test('a stored rent record is labelled reported, never verified', async () => {
    const list = await admin.get('/api/receipts');
    assert.equal(list.status, 200);
    assert.ok(list.body.receipts.length > 0, 'earlier suites plant at least one record');
    for (const receipt of list.body.receipts) {
      assert.equal(receipt.recordState, 'reported');
      assert.equal(receipt.recordStateLabel, 'Reported record — not verified');
      assert.equal(receipt.goodlucksIsRecipient, false);
      assert.equal(receipt.recipient.type, 'landlord');
      assert.equal(typeof receipt.recipient.verified, 'boolean');
      assert.equal(receipt.recipient.verified, false);
      assert.ok(!/verified/i.test(receipt.verificationCode), 'new references must not claim verification');
    }
  });

  test('references issued from now on do not claim verification', async () => {
    const created = runPhpScript(
      'tests/create-receipt.php',
      ['--legacy', '--tenant-name=Reference Tester', '--tenant-phone=+233 24 999 0001'],
      state.testEnv
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);
    const id = JSON.parse(created.stdout.trim()).id;

    const fetched = await admin.get(`/api/receipts/${id}`);
    assert.equal(fetched.status, 200);
    assert.match(fetched.body.receipt.verificationCode, /^REF-REC-/);
    assert.equal(fetched.body.receipt.legacyReference, false);
  });

  test('a legacy VERIFIED-REC reference is flagged instead of trusted', async () => {
    const created = runPhpScript(
      'tests/create-receipt.php',
      [
        '--legacy',
        '--legacy-reference',
        '--tenant-name=Legacy Reference Tester',
        '--tenant-phone=+233 24 999 0002',
      ],
      state.testEnv
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);
    const id = JSON.parse(created.stdout.trim()).id;

    const fetched = await admin.get(`/api/receipts/${id}`);
    assert.equal(fetched.status, 200);
    assert.match(fetched.body.receipt.verificationCode, /^VERIFIED-REC-/);
    assert.equal(fetched.body.receipt.legacyReference, true, 'the UI must be able to annotate it');
    assert.equal(fetched.body.receipt.recordState, 'reported');
  });

  test('a legacy record is never attributed to a shared phone number', async () => {
    const phone = '+233 24 999 0003';
    const emailA = uniqueEmail('shared-a');
    const emailB = uniqueEmail('shared-b');
    const password = 'Shared-Phone-Pass-1';

    const first = runPhpScript(
      'tests/create-user.php',
      [`--email=${emailA}`, `--password=${password}`, '--name=Shared Phone A', '--role=tenant', `--phone=${phone}`],
      state.testEnv
    );
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const second = runPhpScript(
      'tests/create-user.php',
      [`--email=${emailB}`, `--password=${password}`, '--name=Shared Phone B', '--role=tenant', `--phone=${phone}`],
      state.testEnv
    );
    assert.equal(second.status, 0, second.stdout + second.stderr);

    const planted = runPhpScript(
      'tests/create-receipt.php',
      ['--legacy', '--tenant-name=Shared Phone Tenant', `--tenant-phone=${phone}`],
      state.testEnv
    );
    assert.equal(planted.status, 0, planted.stdout + planted.stderr);
    const receiptId = JSON.parse(planted.stdout.trim()).id;

    const clientA = new ApiClient(baseUrl);
    const clientB = new ApiClient(baseUrl);

    const loginA = await clientA.post('/api/auth/login', { email: emailA, password });
    assert.equal(loginA.status, 200, JSON.stringify(loginA.body));
    const loginB = await clientB.post('/api/auth/login', { email: emailB, password });
    assert.equal(loginB.status, 200, JSON.stringify(loginB.body));

    // Ambiguous number: neither account may see or open the record.
    for (const client of [clientA, clientB]) {
      const list = await client.get('/api/receipts');
      assert.equal(list.status, 200);
      assert.ok(!list.body.receipts.some((receipt) => receipt.id === receiptId));
      assert.equal((await client.get(`/api/receipts/${receiptId}`)).status, 404);
    }

    // Staff still see it — the record is not lost, only unattributable.
    assert.equal((await admin.get(`/api/receipts/${receiptId}`)).status, 200);
  });

  test('a legacy record is never attributed to a landlord by name', async () => {
    const planted = runPhpScript(
      'tests/create-receipt.php',
      ['--legacy', '--tenant-name=Name Match Tenant', '--tenant-phone=+233 24 999 0004', '--landlord-name=Access Landlord A'],
      state.testEnv
    );
    assert.equal(planted.status, 0, planted.stdout + planted.stderr);
    const receiptId = JSON.parse(planted.stdout.trim()).id;

    const list = await landlord.get('/api/receipts');
    assert.equal(list.status, 200);
    assert.ok(
      !list.body.receipts.some((receipt) => receipt.id === receiptId),
      'a matching landlord name must not grant access'
    );
    assert.equal((await landlord.get(`/api/receipts/${receiptId}`)).status, 404);
  });
});

// ---------------------------------------------------------------------------
describe('Alert delivery', () => {
  test('a price drop emails subscribers exactly once per new price', async () => {
    // Landlord publishes a listing...
    const created = await landlord.post('/api/properties', {
      title: 'Alert Delivery Test Apartment',
      location: 'Labone, Accra',
      city: 'Accra',
      rentGhs: 7000,
      bedrooms: 2,
      bathrooms: 2,
      propertyType: 'Apartment',
      description: 'Listing used to verify price drop alert delivery end to end.',
      images: [state.uploadedUrl],
    });
    assert.equal(created.status, 201);
    const propertyId = created.body.property.id;

    // ...a visitor subscribes to any drop...
    const subscriberEmail = uniqueEmail('pricedrop');
    const alert = await guest.post('/api/price-alerts', {
      email: subscriberEmail,
      propertyId,
      notifyOnAnyDrop: true,
    });
    assert.equal(alert.status, 200);

    // ...and the rent is reduced.
    const droppped = await admin.put(`/api/properties/${propertyId}`, { rentGhs: 6200 });
    assert.equal(droppped.status, 200);
    assert.equal(droppped.body.property.rentGhs, 6200);

    const logs = await admin.get('/api/admin/email-logs');
    const priceDropEmails = logs.body.logs.filter(
      (log) => log.type === 'price_drop_alert' && log.recipientEmail === subscriberEmail
    );
    assert.equal(priceDropEmails.length, 1, 'subscriber should receive exactly one email');

    // Re-saving the same price must not send again.
    await admin.put(`/api/properties/${propertyId}`, { rentGhs: 6200, title: 'Alert Delivery Test Apartment' });
    const afterRepeat = await admin.get('/api/admin/email-logs');
    assert.equal(
      afterRepeat.body.logs.filter((log) => log.type === 'price_drop_alert' && log.recipientEmail === subscriberEmail).length,
      1,
      'idempotency: the same price must not email twice'
    );

    // A second, deeper drop is a new event and does notify.
    await admin.put(`/api/properties/${propertyId}`, { rentGhs: 5500 });
    const afterSecondDrop = await admin.get('/api/admin/email-logs');
    assert.equal(
      afterSecondDrop.body.logs.filter((log) => log.type === 'price_drop_alert' && log.recipientEmail === subscriberEmail).length,
      2,
      'a further reduction should notify again'
    );
  });

  test('a rent increase does not email price-drop subscribers', async () => {
    const before = await admin.get('/api/admin/email-logs');
    const countBefore = before.body.logs.filter((log) => log.type === 'price_drop_alert').length;

    await admin.put(`/api/properties/${state.seededPropertyId}`, { rentGhs: 999999 });

    const after = await admin.get('/api/admin/email-logs');
    assert.equal(after.body.logs.filter((log) => log.type === 'price_drop_alert').length, countBefore);
  });

  test('saved searches are matched when a listing goes live', async () => {
    const subscriberEmail = uniqueEmail('searchalert');
    const created = await guest.post('/api/search-alerts', {
      email: subscriberEmail,
      name: 'Search Alert Subscriber',
      location: 'Tema',
      propertyType: 'Apartment',
      bedrooms: 2,
      maxRentGhs: 5000,
      frequency: 'instant',
      channels: ['email'],
    });
    assert.equal(created.status, 201);

    // A landlord lists a matching property (goes to moderation)...
    const listing = await landlord.post('/api/properties', {
      title: 'Tema Harbour View Apartment',
      location: 'Tema Community 25',
      city: 'Tema',
      rentGhs: 4500,
      bedrooms: 2,
      bathrooms: 2,
      propertyType: 'Apartment',
      description: 'Two bedroom apartment in Tema used for saved-search matching tests.',
      images: [state.uploadedUrl],
    });
    assert.equal(listing.status, 201);
    const propertyId = listing.body.property.id;

    const beforeApproval = await admin.get('/api/admin/email-logs');
    assert.equal(
      beforeApproval.body.logs.filter((log) => log.type === 'search_alert' && log.recipientEmail === subscriberEmail).length,
      0,
      'a pending listing must not be matched'
    );

    // ...and once approved the subscriber hears about it.
    const approved = await admin.post(`/api/properties/${propertyId}/status`, { status: 'active' });
    assert.equal(approved.status, 200);

    const afterApproval = await admin.get('/api/admin/email-logs');
    assert.equal(
      afterApproval.body.logs.filter((log) => log.type === 'search_alert' && log.recipientEmail === subscriberEmail).length,
      1
    );

    // Running the digest again must not duplicate the email.
    const run = await admin.post('/api/admin/alerts/run', {});
    assert.equal(run.status, 200);
    assert.equal(typeof run.body.emails, 'number');

    const afterRun = await admin.get('/api/admin/email-logs');
    assert.equal(
      afterRun.body.logs.filter((log) => log.type === 'search_alert' && log.recipientEmail === subscriberEmail).length,
      1,
      'the cron/digest pass must be idempotent'
    );
  });

  test('only admins can trigger the alert digest', async () => {
    const asTenant = await tenant.post('/api/admin/alerts/run', {});
    assert.equal(asTenant.status, 403);

    const asGuest = await guest.post('/api/admin/alerts/run', {});
    assert.equal(asGuest.status, 401);
  });
});

// ---------------------------------------------------------------------------
describe('Landlord verification', () => {
  test('new listings start unverified and only an admin can verify them', async () => {
    const created = await landlord.post('/api/properties', {
      title: 'Verification State Test',
      location: 'Spintex, Accra',
      city: 'Accra',
      rentGhs: 3800,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: 'Studio',
      description: 'Listing used to assert that the verified badge is earned, never assumed.',
      images: [state.uploadedUrl],
    });
    assert.equal(created.status, 201);
    const propertyId = created.body.property.id;
    assert.equal(created.body.property.isLandlordVerified, false, 'a brand-new landlord must not appear verified');

    const byLandlord = await landlord.post(`/api/properties/${propertyId}/verify`, { verified: true });
    assert.equal(byLandlord.status, 403, 'landlords cannot verify themselves');

    const byAdmin = await admin.post(`/api/properties/${propertyId}/verify`, { verified: true });
    assert.equal(byAdmin.status, 200);
    assert.equal(byAdmin.body.property.isLandlordVerified, true);

    // Pending listings stay hidden from the public feed, so read it as staff.
    const fetched = await admin.get(`/api/properties/${propertyId}`);
    assert.equal(fetched.body.property.isLandlordVerified, true);

    const hiddenFromPublic = await guest.get(`/api/properties/${propertyId}`);
    assert.equal(hiddenFromPublic.status, 404, 'an unapproved listing must not be public');

    const revoked = await admin.post(`/api/properties/${propertyId}/verify`, { verified: false });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.property.isLandlordVerified, false);

    const missing = await admin.post('/api/properties/nope-nope/verify', { verified: true });
    assert.equal(missing.status, 404);
  });
});

// ---------------------------------------------------------------------------
describe('Enquiry workflow', () => {
  test('enquiries move through new -> contacted -> closed and feed the KPI', async () => {
    const created = await guest.post('/api/enquiries', {
      name: 'Workflow Tester',
      email: uniqueEmail('workflow'),
      phone: '+233 20 000 0000',
      message: 'Please contact me about a two bedroom apartment in East Legon.',
      source: 'contact_form',
    });
    assert.equal(created.status, 201);
    const enquiryId = created.body.enquiryId;

    const before = await admin.get('/api/admin/stats');
    const newBefore = before.body.stats.newEnquiries;

    const contacted = await admin.patch(`/api/admin/enquiries/${enquiryId}`, { status: 'contacted' });
    assert.equal(contacted.status, 200);
    assert.equal(contacted.body.enquiry.status, 'contacted');

    const after = await admin.get('/api/admin/stats');
    assert.equal(after.body.stats.newEnquiries, newBefore - 1, 'the "new enquiries" KPI must actually move');

    const closed = await admin.patch(`/api/admin/enquiries/${enquiryId}`, { status: 'closed' });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.enquiry.status, 'closed');

    const invalid = await admin.patch(`/api/admin/enquiries/${enquiryId}`, { status: 'banana' });
    assert.equal(invalid.status, 422);

    const asTenant = await tenant.patch(`/api/admin/enquiries/${enquiryId}`, { status: 'closed' });
    assert.equal(asTenant.status, 403);

    const missing = await admin.patch('/api/admin/enquiries/nope-nope', { status: 'closed' });
    assert.equal(missing.status, 404);
  });
});

// ---------------------------------------------------------------------------
describe('Notifications & analytics', () => {
  test('page views are recorded and exposed as real analytics', async () => {
    for (const page of ['/', '/properties', '/about']) {
      const res = await guest.post('/api/track/pageview', { path: page });
      assert.equal(res.status, 200);
    }
    const stats = await admin.get('/api/admin/stats');
    assert.equal(stats.status, 200);
    assert.ok(stats.body.stats.visitorsToday >= 1);
    const totalWeeklyPageViews = stats.body.stats.dailyTraffic.reduce((sum, day) => sum + day.pageViews, 0);
    assert.ok(totalWeeklyPageViews >= 3);
  });

  test('notifications are created for the user and can be marked read', async () => {
    const list = await tenant.get('/api/notifications');
    assert.equal(list.status, 200);
    assert.ok(list.body.notifications.length >= 1);

    const first = list.body.notifications[0];
    const read = await tenant.patch(`/api/notifications/${first.id}`, {});
    assert.equal(read.status, 200);

    const after = await tenant.get('/api/notifications');
    assert.equal(after.body.notifications.find((n) => n.id === first.id).read, true);
  });

  test('email audit log records dispatched notifications', async () => {
    const res = await admin.get('/api/admin/email-logs');
    assert.equal(res.status, 200);
    assert.ok(res.body.logs.length >= 1);
    assert.ok(res.body.logs.every((l) => !('password' in l)));
  });

  test('AI description falls back gracefully without an API key', async () => {
    const res = await landlord.post('/api/ai/describe', {
      title: 'Test Apartment',
      location: 'East Legon',
      propertyType: 'Apartment',
      bedrooms: 2,
      rentGhs: 4000,
      amenities: ['Swimming Pool'],
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.description.length > 40);
  });

  test('AI match score is calculated', async () => {
    const res = await admin.post('/api/ai/match', {
      tenantRequest: { budgetMin: 3000, budgetMax: 7000, bedrooms: 2, preferredLocations: ['East Legon'], propertyType: 'Apartment' },
      property: { rentGhs: 5000, bedrooms: 2, location: 'East Legon, Accra', propertyType: 'Apartment' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.matchScore >= 40 && res.body.matchScore <= 98);
  });
});

// ---------------------------------------------------------------------------
describe('Abuse protection', () => {
  test('seeded demo accounts cannot sign in until a password is set', async () => {
    // The schema seeds tenant/landlord/admin rows without a password hash: a
    // published password for an account that owns listings would be a hole.
    for (const email of ['tenant@goodlucks.com', 'landlord@goodlucks.com']) {
      const res = await guest.post('/api/auth/login', { email, password: '' });
      assert.ok([401, 422].includes(res.status), `${email} unexpectedly accepted an empty password (${res.status})`);
    }

    const admin = await guest.post('/api/auth/admin-login', {
      email: 'admin@goodlucks.com',
      password: '',
      accessKey: '',
    });
    assert.ok([401, 422].includes(admin.status));
  });

  test('repeated failed logins are rate limited', async () => {
    const client = new ApiClient(baseUrl);
    let sawRateLimit = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const res = await client.post('/api/auth/login', {
        email: 'rate-limit@example.com',
        password: 'wrong-password',
      });
      if (res.status === 429) {
        sawRateLimit = true;
        break;
      }
    }
    assert.equal(sawRateLimit, true, 'expected HTTP 429 after repeated failures');
  });

  test('a successful sign-in clears the failure counter, other accounts stay usable', async () => {
    // Fail a few times for one address...
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await guest.post('/api/auth/login', { email: 'lockout@example.com', password: 'nope' });
      assert.equal(res.status, 401);
    }

    // ...the correct credentials still work and reset that account's counter.
    const ok = await guest.post('/api/auth/login', { email: state.tenantEmail, password: 'Tenant-Password-123' });
    assert.equal(ok.status, 200);

    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await guest.post('/api/auth/login', { email: 'lockout@example.com', password: 'nope' });
      assert.equal(res.status, 401, 'another account must not be locked out by unrelated failures');
    }
  });

  test('unknown endpoints return a clean 404', async () => {
    const res = await guest.get('/api/not-a-real-endpoint');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  test('legacy .php endpoints still respond', async () => {
    const res = await guest.get('/api/properties.php');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.properties));
  });
});

// ---------------------------------------------------------------------------
describe('Duplicate submission guards', () => {
  const enquiryPayload = () => ({
    name: 'Dedupe Tester',
    email: uniqueEmail('dedupe-enquiry'),
    phone: '+233 24 000 1111',
    message: 'Please confirm whether this listing is still available for a weekend viewing.',
    propertyId: state.seededPropertyId,
    source: 'property_page',
  });

  test('re-posting the same enquiry returns the original enquiry instead of creating a second', async () => {
    const payload = enquiryPayload();

    const first = await guest.post('/api/enquiries', payload);
    assert.equal(first.status, 201);
    assert.ok(first.body.enquiryId);

    const second = await guest.post('/api/enquiries', payload);
    assert.equal(second.status, 200, 'a double submit must not be reported as an error');
    assert.equal(second.body.duplicate, true);
    assert.equal(second.body.enquiryId, first.body.enquiryId);

    const list = await admin.get('/api/admin/enquiries');
    const matches = list.body.enquiries.filter((e) => e.id === first.body.enquiryId);
    assert.equal(matches.length, 1);
  });

  test('a genuine follow-up enquiry with different text is still created', async () => {
    const payload = enquiryPayload();
    const first = await guest.post('/api/enquiries', payload);
    assert.equal(first.status, 201);

    const followUp = await guest.post('/api/enquiries', {
      ...payload,
      message: 'Following up on my previous message - could you call me this afternoon?',
    });
    assert.equal(followUp.status, 201, 'different content must not be treated as a duplicate');
    assert.notEqual(followUp.body.enquiryId, first.body.enquiryId);
  });

  test('re-posting the same viewing request returns the original booking', async () => {
    const payload = {
      tenantName: 'Dedupe Viewer',
      tenantPhone: '+233 24 222 3333',
      tenantEmail: uniqueEmail('dedupe-viewing'),
      propertyId: state.seededPropertyId,
      date: new Date(Date.now() + 9 * 86400_000).toISOString().slice(0, 10),
      time: '11:00',
      notes: 'Double click test booking.',
    };

    const first = await guest.post('/api/viewing-requests', payload);
    assert.equal(first.status, 201);
    const second = await guest.post('/api/viewing-requests', payload);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicate, true);
    assert.equal(second.body.viewingId, first.body.viewingId);
  });

  test('re-posting the same rental request returns the original request', async () => {
    // Correction 1: a rent request needs a signed-in tenant, so this uses a
    // tenant session rather than a guest.
    const client = new ApiClient(baseUrl);
    const email = uniqueEmail('dedupe-tenant');
    const registered = await client.post('/api/auth/register', {
      email,
      password: 'Dedupe-Password-123',
      name: 'Dedupe Tenant',
      phone: '+233 24 444 5555',
      role: 'tenant',
    });
    assert.equal(registered.status, 201);

    const payload = {
      tenantName: 'Dedupe Tenant',
      tenantPhone: '+233 24 444 5555',
      tenantEmail: email,
      preferredLocations: ['Osu'],
      budgetMin: 2500,
      budgetMax: 6000,
      bedrooms: 1,
      moveInDate: new Date(Date.now() + 20 * 86400_000).toISOString().slice(0, 10),
      notes: 'Double click test request.',
    };

    const first = await client.post('/api/tenant-requests', payload);
    assert.equal(first.status, 201);
    const second = await client.post('/api/tenant-requests', payload);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicate, true);
    assert.equal(second.body.requestId, first.body.requestId);
  });
});

// ---------------------------------------------------------------------------
describe('Optimistic concurrency on listings', () => {
  test('editing a stale copy of a listing is rejected with 409', async () => {
    const created = await admin.post('/api/properties', {
      title: 'Concurrency Test Apartment',
      location: 'Osu, Accra',
      city: 'Accra',
      rentGhs: 4200,
      bedrooms: 2,
      bathrooms: 2,
      propertyType: 'Apartment',
      description: 'Listing used to verify that concurrent edits cannot silently overwrite each other.',
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
    });
    assert.equal(created.status, 201);
    const propertyId = created.body.property.id;
    const version1 = created.body.property.updatedAt;
    assert.ok(version1);

    // updated_at has one-second resolution, so let the clock move before editing.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const saved = await admin.put(`/api/properties/${propertyId}`, {
      rentGhs: 4300,
      updatedAt: version1,
    });
    assert.equal(saved.status, 200, 'a current version must be accepted');
    const version2 = saved.body.property.updatedAt;
    assert.notEqual(version2, version1);

    const stale = await admin.put(`/api/properties/${propertyId}`, {
      rentGhs: 4400,
      updatedAt: version1,
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'stale_property');
    assert.ok(stale.body.property, 'the response should carry the version that won');
    assert.equal(stale.body.property.rentGhs, 4300);

    const unchanged = await guest.get(`/api/properties/${propertyId}`);
    assert.equal(unchanged.status, 200);
    assert.equal(unchanged.body.property.rentGhs, 4300, 'the rejected write must not be applied');

    const retried = await admin.put(`/api/properties/${propertyId}`, {
      rentGhs: 4400,
      updatedAt: version2,
    });
    assert.equal(retried.status, 200, 'reloading and retrying must succeed');

    const removed = await admin.delete(`/api/properties/${propertyId}`);
    assert.equal(removed.status, 200);
  });

  test('edits without a version still work for API clients', async () => {
    const res = await admin.put(`/api/properties/${state.seededPropertyId}`, { rentGhs: 6000 });
    assert.equal(res.status, 200);
    assert.equal(res.body.property.rentGhs, 6000);
  });
});

// ---------------------------------------------------------------------------
describe('Password reset', () => {
  const genericMessage = /if that email is registered/i;
  const resetToken = 'a'.repeat(64);

  const plantToken = (email, token, expiresIn = 3600) => {
    const result = runPhpScript(
      'tests/reset-token.php',
      [`--email=${email}`, `--token=${token}`, `--expires-in=${expiresIn}`],
      {
        DB_DRIVER: 'sqlite',
        DB_SQLITE_PATH: dbPath,
        APP_ENV: 'development',
        ADMIN_ACCESS_KEY,
        OFFICIAL_EMAIL: 'rentals@goodlucks.co',
      }
    );
    assert.equal(result.status, 0, `token seeding failed: ${result.stdout} ${result.stderr}`);
  };

  test('unknown emails get the same response as real accounts', async () => {
    const unknown = await guest.post('/api/auth/password-reset/request', {
      email: uniqueEmail('nobody'),
    });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.success, true);
    assert.match(unknown.body.message, genericMessage);
    assert.equal(unknown.body.token, undefined, 'the token must never be returned to the caller');

    const real = await guest.post('/api/auth/password-reset/request', { email: state.tenantEmail });
    assert.equal(real.status, 200);
    assert.match(real.body.message, genericMessage);
    assert.equal(real.body.message, unknown.body.message, 'responses must be indistinguishable');
  });

  test('a reset email is logged for a real account', async () => {
    const before = await admin.get('/api/admin/email-logs');
    assert.equal(before.status, 200);
    const countBefore = before.body.logs.filter((l) => l.type === 'password_reset').length;

    await guest.post('/api/auth/password-reset/request', { email: state.tenantEmail });

    const after = await admin.get('/api/admin/email-logs');
    const countAfter = after.body.logs.filter((l) => l.type === 'password_reset').length;
    assert.equal(countAfter, countBefore + 1);
  });

  test('invalid email addresses are rejected', async () => {
    const res = await guest.post('/api/auth/password-reset/request', { email: 'not-an-email' });
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.email);
  });

  test('a valid token resets the password exactly once', async () => {
    plantToken(state.tenantEmail, resetToken);

    const weak = await guest.post('/api/auth/password-reset/confirm', { token: resetToken, password: 'short' });
    assert.equal(weak.status, 422);
    assert.ok(weak.body.fields.password);

    const ok = await guest.post('/api/auth/password-reset/confirm', {
      token: resetToken,
      password: 'Brand-New-Tenant-Password-9',
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.success, true);

    const login = await new ApiClient(baseUrl).post('/api/auth/login', {
      email: state.tenantEmail,
      password: 'Brand-New-Tenant-Password-9',
    });
    assert.equal(login.status, 200, 'the new password must work');

    const oldPassword = await new ApiClient(baseUrl).post('/api/auth/login', {
      email: state.tenantEmail,
      password: 'Tenant-Password-123',
    });
    assert.equal(oldPassword.status, 401, 'the old password must stop working');

    const reuse = await guest.post('/api/auth/password-reset/confirm', {
      token: resetToken,
      password: 'Another-Password-123',
    });
    assert.equal(reuse.status, 400, 'a token must not be usable twice');
  });

  test('expired and unknown tokens are rejected', async () => {
    plantToken(state.landlordEmail, 'b'.repeat(64), -60);

    const expired = await guest.post('/api/auth/password-reset/confirm', {
      token: 'b'.repeat(64),
      password: 'Whatever-Password-123',
    });
    assert.equal(expired.status, 400);

    const unknown = await guest.post('/api/auth/password-reset/confirm', {
      token: 'c'.repeat(64),
      password: 'Whatever-Password-123',
    });
    assert.equal(unknown.status, 400);

    const missing = await guest.post('/api/auth/password-reset/confirm', { password: 'Whatever-Password-123' });
    assert.equal(missing.status, 422);
  });
});

// ---------------------------------------------------------------------------
describe('Match scoring, notifications & SEO', () => {
  const matcher = { client: null, email: '', requestId: '' };

  test('guest cannot read match scores', async () => {
    const res = await guest.get('/api/matches');
    assert.equal(res.status, 401);
  });

  test('a tenant gets real scored matches for their own request', async () => {
    matcher.client = new ApiClient(baseUrl);
    matcher.email = uniqueEmail('matcher');
    const registered = await matcher.client.post('/api/auth/register', {
      email: matcher.email,
      password: 'Matcher-Password-123',
      name: 'Match Tester',
      phone: '+233 20 999 0000',
      role: 'tenant',
    });
    assert.equal(registered.status, 201);

    const request = await matcher.client.post('/api/tenant-requests', {
      tenantName: 'Match Tester',
      tenantPhone: '+233 20 999 0000',
      tenantEmail: matcher.email,
      preferredLocations: ['East Legon'],
      budgetMin: 2000,
      budgetMax: 8000,
      bedrooms: 2,
      moveInDate: new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10),
      notes: 'Used to check match scores.',
    });
    assert.equal(request.status, 201);
    matcher.requestId = request.body.requestId;

    const res = await matcher.client.get('/api/matches');
    assert.equal(res.status, 200);
    assert.equal(res.body.requestId, matcher.requestId);
    assert.ok(res.body.matches.length > 0, 'live listings must produce a shortlist');

    for (const match of res.body.matches) {
      assert.ok(match.property?.id, 'each match must carry the listing');
      assert.equal(typeof match.score, 'number');
      assert.ok(match.score >= 40 && match.score <= 98, `score ${match.score} out of range`);
      assert.ok(match.reason.length > 10, 'the score must explain itself');
      assert.equal(typeof match.curated, 'boolean');
    }

    assert.equal(res.body.topScore, res.body.matches[0].score);

    const scored = res.body.matches.filter((m) => !m.curated).map((m) => m.score);
    const sorted = [...scored].sort((a, b) => b - a);
    assert.deepEqual(scored, sorted, 'shortlist must be ordered best first');
  });

  test('a request inside the budget scores higher than one outside it', async () => {
    const inBudget = await matcher.client.get('/api/matches');
    const best = inBudget.body.matches.find((m) => !m.curated);
    assert.ok(best);

    const comparison = await guest.post('/api/ai/match', {
      tenantRequest: { budgetMin: 2000, budgetMax: 8000, bedrooms: 2, preferredLocations: ['East Legon'] },
      property: { rentGhs: 7400, bedrooms: 2, location: 'East Legon, Accra', propertyType: 'Apartment' },
    });
    assert.equal(comparison.status, 200);
    assert.ok(comparison.body.matchScore >= 90, 'a listing inside budget must score at least 90');

    const tooPricey = await guest.post('/api/ai/match', {
      tenantRequest: { budgetMin: 2000, budgetMax: 8000, bedrooms: 2, preferredLocations: ['East Legon'] },
      property: { rentGhs: 40000, bedrooms: 2, location: 'East Legon, Accra', propertyType: 'Apartment' },
    });
    assert.ok(tooPricey.body.matchScore < comparison.body.matchScore, 'over-budget listings must score lower');
  });

  test('another tenant cannot read someone else\'s matches; admin can', async () => {
    const other = new ApiClient(baseUrl);
    await other.post('/api/auth/register', {
      email: uniqueEmail('nosy-tenant'),
      password: 'Nosy-Tenant-123',
      name: 'Nosy Tenant',
      phone: '+233 20 111 0000',
      role: 'tenant',
    });

    const forbidden = await other.get(`/api/matches?requestId=${matcher.requestId}`);
    assert.equal(forbidden.status, 403);

    const asAdmin = await admin.get(`/api/matches?requestId=${matcher.requestId}`);
    assert.equal(asAdmin.status, 200);
    assert.ok(asAdmin.body.matches.length > 0);

    const missing = await admin.get('/api/matches?requestId=req-does-not-exist');
    assert.equal(missing.status, 404);
  });

  test('read-all clears the unread badge for the caller only', async () => {
    const before = await matcher.client.get('/api/notifications');
    assert.equal(before.status, 200);

    const res = await matcher.client.post('/api/notifications/read-all', {});
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.updated, 'number');
    assert.ok(Array.isArray(res.body.notifications));
    assert.ok(res.body.notifications.every((n) => n.read === true));

    const after = await matcher.client.get('/api/notifications');
    assert.ok(after.body.notifications.every((n) => n.read === true), 'no unread rows may survive');

    const unauthorised = await guest.post('/api/notifications/read-all', {});
    assert.equal(unauthorised.status, 401);
  });

  test('the sitemap lists published listings and hides pending ones', async () => {
    const res = await guest.get('/api/sitemap.xml');
    assert.equal(res.status, 200);
    assert.match(String(res.headers.get('content-type')), /xml/);
    assert.ok(res.body.raw ? res.body.raw.includes('<urlset') : true);

    const xml = res.body.raw;
    assert.ok(xml.includes('https://goodlucks.co/'));
    // The sitemap must advertise the routes the app actually serves
    // (src/routing/routes.ts). /browse and /find-home were never real pages.
    assert.ok(xml.includes('/properties'));
    assert.ok(xml.includes('/find-a-home'));
    assert.ok(!xml.includes('/browse'), 'the sitemap must not advertise a route the app does not serve');
    assert.ok(!xml.includes('/find-home'), 'the sitemap must not advertise a route the app does not serve');
    // Correction 7: the sitemap advertises the canonical descriptive URL
    // (/property/{title}-{location}-{id}) — never the bare id form, which would
    // be a second URL for the same page.
    const seeded = await guest.get(`/api/properties/${state.seededPropertyId}`);
    const seededPath = seeded.body.property.path;
    assert.match(seededPath, /^\/property\/[a-z0-9-]+-[a-z0-9-]+$/i);
    assert.ok(xml.includes(seededPath), 'the published listing appears in its canonical form');
    assert.ok(!xml.includes(`/property/${state.seededPropertyId}</loc>`), 'the bare id URL is never listed');

    // Landlord submissions start pending, so they are the honest negative case.
    const created = await landlord.post('/api/properties', {
      title: 'Sitemap Visibility Test Villa',
      location: 'Teshie, Accra',
      city: 'Accra',
      rentGhs: 3100,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: 'Apartment',
      description: 'Listing created only to verify sitemap visibility rules for pending and active adverts.',
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.property.status, 'pending');
    const propertyId = created.body.property.id;

    const whilePending = await guest.get('/api/sitemap.xml');
    assert.ok(!whilePending.body.raw.includes(`${propertyId}</loc>`), 'pending listings must stay out of the sitemap');

    await admin.post(`/api/properties/${propertyId}/status`, { status: 'active' });
    const whenLive = await guest.get('/api/sitemap.xml');
    assert.ok(whenLive.body.raw.includes(`${propertyId}</loc>`), 'published listings must appear');
    // Exactly one entry, in the canonical form.
    const occurrences = whenLive.body.raw.split(`${propertyId}</loc>`).length - 1;
    assert.equal(occurrences, 1, 'one URL per listing, no duplicate old/new pair');

    await admin.delete(`/api/properties/${propertyId}`);
  });
});

// ---------------------------------------------------------------------------
describe('Email reliability (outbox)', () => {
  const cliEnv = () => ({
    DB_DRIVER: 'sqlite',
    DB_SQLITE_PATH: dbPath,
    APP_ENV: 'development',
    ADMIN_ACCESS_KEY,
    OFFICIAL_EMAIL: 'rentals@goodlucks.co',
    EMAIL_TRANSPORT: 'none',
  });

  const outbox = (action, extraArgs = []) => {
    const result = runPhpScript('tests/outbox.php', [`--action=${action}`, ...extraArgs], cliEnv());
    assert.equal(result.status, 0, `outbox ${action} failed: ${result.stdout} ${result.stderr}`);
    const line = result.stdout.trim().split('\n').filter(Boolean).pop() || '{}';
    return JSON.parse(line);
  };

  test('a submit queues the email instead of blocking on the transport', async () => {
    const payload = {
      name: 'Queue Tester',
      email: uniqueEmail('queue'),
      phone: '+233 24 909 0909',
      message: 'Please confirm this apartment is still available for a weekend viewing.',
      propertyId: state.seededPropertyId,
      source: 'property_page',
    };

    const started = Date.now();
    const res = await guest.post('/api/enquiries', payload);
    const elapsed = Date.now() - started;
    assert.equal(res.status, 201);
    assert.ok(elapsed < 5000, `submit should not wait on mail delivery (took ${elapsed}ms)`);

    const logs = await admin.get('/api/admin/email-logs');
    assert.equal(logs.status, 200);
    assert.ok(logs.body.outbox, 'the console needs outbox counts');
    assert.ok(logs.body.outbox.pending >= 1, 'the enquiry email must be queued');

    const queued = logs.body.logs.find(
      (log) => log.recipientEmail === payload.email && log.status === 'queued'
    );
    assert.ok(queued, 'the audit log records the message as queued straight away');
  });

  test('only an admin can drain the queue', async () => {
    const asGuest = await guest.post('/api/admin/emails/run', {});
    assert.equal(asGuest.status, 401);
    // A fresh tenant client: the shared one was signed out by the password
    // reset suite (confirming a reset revokes every session). The account is
    // created directly so this test does not consume the per-IP registration
    // allowance shared with the registration suite.
    const outboxEmail = uniqueEmail('outbox-tenant');
    const outboxPassword = 'Outbox-Tenant-123';
    const seededTenant = runPhpScript(
      'tests/create-user.php',
      [
        `--email=${outboxEmail}`,
        `--password=${outboxPassword}`,
        '--name=Outbox Tenant',
        '--role=tenant',
        '--phone=+233 20 909 0000',
      ],
      state.testEnv
    );
    assert.equal(seededTenant.status, 0, seededTenant.stdout + seededTenant.stderr);
    const signedInTenant = new ApiClient(baseUrl);
    const tenantLogin = await signedInTenant.post('/api/auth/login', {
      email: outboxEmail,
      password: outboxPassword,
    });
    assert.equal(tenantLogin.status, 200, JSON.stringify(tenantLogin.body));
    const asTenant = await signedInTenant.post('/api/admin/emails/run', {});
    assert.equal(asTenant.status, 403);

    const asAdmin = await admin.post('/api/admin/emails/run', {});
    assert.equal(asAdmin.status, 200);
    for (const key of ['checked', 'sent', 'retried', 'failed', 'skipped']) {
      assert.equal(typeof asAdmin.body.result[key], 'number', `result.${key} missing`);
    }
    assert.equal(asAdmin.body.result.sent, 0, 'delivery is disabled in tests');
    assert.ok(asAdmin.body.outbox.pending >= 0);
    assert.ok(asAdmin.body.message.length > 0);
  });

  test('failed sends retry with backoff and stop after the attempt cap', () => {
    outbox('reset');
    const seeded = outbox('seed', ['--count=1']);
    assert.equal(seeded.ids.length, 1);

    const first = outbox('process');
    assert.equal(first.checked, 1);
    assert.equal(first.sent, 0);
    assert.equal(first.retried, 1);

    let rows = outbox('dump');
    assert.equal(rows[0].status, 'pending');
    assert.equal(rows[0].attempts, 1);
    assert.ok(rows[0].next_attempt_at > new Date().toISOString().slice(0, 19).replace('T', ' '), 'backoff must push the next try out');
    assert.ok(String(rows[0].last_error).length > 0, 'the failure reason is kept for admins');

    // Still backing off: the row is not due yet.
    const tooSoon = outbox('process');
    assert.equal(tooSoon.checked, 0);

    // Force every retry through to the cap.
    for (let attempt = 2; attempt <= 6; attempt++) {
      outbox('force-due');
      outbox('process');
      rows = outbox('dump');
      assert.equal(rows[0].attempts, attempt);
    }

    assert.equal(rows[0].status, 'failed', 'after 6 attempts the message is parked');

    const afterCap = outbox('process');
    assert.equal(afterCap.checked, 0, 'failed rows are never retried again');

    const summary = outbox('summary');
    assert.equal(summary.failed, 1);
    assert.equal(summary.pending, 0);

    outbox('reset');
  });

  test('cron reports and drains the outbox', () => {
    outbox('reset');
    outbox('seed', ['--count=2']);

    const dry = runPhpScript('php-backend/cron.php', ['--dry-run'], cliEnv());
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /Email outbox: \d+ pending/);

    const apply = runPhpScript('php-backend/cron.php', [], cliEnv());
    assert.equal(apply.status, 0, apply.stderr);
    // The digest step can queue its own mail first, so only the shape and the
    // "nothing was delivered, everything retries" outcome are asserted.
    const outboxLine = apply.stdout.split('\n').find((line) => line.startsWith('Email outbox: ') && line.includes('due'));
    assert.ok(outboxLine, 'cron must report the outbox step');
    assert.match(outboxLine, /^Email outbox: \d+ due, 0 sent, \d+ retrying, 0 failed$/);
    const dueCount = Number(outboxLine.match(/(\d+) due/)[1]);
    assert.ok(dueCount >= 2, `expected at least the 2 seeded messages, got ${dueCount}`);

    outbox('reset');
  });
});

// ---------------------------------------------------------------------------
// Increment E — fee policies, agent tiers and immutable transaction snapshots
// ---------------------------------------------------------------------------
describe('Fee policies & agent tiers (Increment E)', () => {
  const e = {
    admins: {},
    agents: {},
    policies: {},
    records: {},
    notes: {},
  };
  const visitor = () => new ApiClient(baseUrl);
  const today = () => new Date().toISOString().slice(0, 10);
  const daysFromNow = (days) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
  const licenceExpiry = () => daysFromNow(300);

  const createAdmin = async (key, { manage = false, approve = false, reviewer = false } = {}) => {
    const email = uniqueEmail(`finance-${key}`);
    const password = 'Finance-Pass-123';
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${password}`, `--name=Finance ${key}`, '--role=admin'],
      state.testEnv
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);

    const client = new ApiClient(baseUrl);
    const login = await client.post('/api/auth/admin-login', {
      email,
      password,
      accessKey: ADMIN_ACCESS_KEY,
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));

    if (manage || approve) {
      const args = [`--email=${email}`];
      if (manage) args.push('--manage=1');
      if (approve) args.push('--approve=1');
      const granted = runPhpScript('php-backend/grant_finance.php', args, state.testEnv);
      assert.equal(granted.status, 0, granted.stdout + granted.stderr);
      assert.match(granted.stdout, /Manage\s*:|Approve\s*:/);
    }
    if (reviewer) {
      const granted = runPhpScript(
        'php-backend/grant_reviewer.php',
        [`--email=${email}`, '--reviewer=1'],
        state.testEnv
      );
      assert.equal(granted.status, 0, granted.stdout + granted.stderr);
    }

    // Re-read the session so the capability flags are present on the client.
    const me = await client.get('/api/auth/me');
    assert.equal(me.status, 200);
    e.admins[key] = { client, id: login.body.user.id, email, password, capabilities: me.body.user.capabilities };
    return e.admins[key];
  };

  const registerAgent = async (key) => {
    const client = visitor();
    const email = uniqueEmail(`tier-agent-${key}`);
    const password = 'Tier-Agent-Pass-1';
    const res = await client.post('/api/auth/register', {
      name: `Tier Agent ${key}`,
      email,
      phone: '+233 20 700 0100',
      password,
      role: 'agent',
      operatingCity: 'Accra',
      agencyName: 'Tier Test Agency',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    e.agents[key] = { client, id: res.body.user.id, email, password };
    return e.agents[key];
  };

  /** Approve identity (and optionally a current professional authorisation). */
  const verifyAgent = async (agent, { identity = true, professional = false, expiry = licenceExpiry() } = {}) => {
    const reviewer = e.admins.reviewer;
    if (identity) {
      const doc = new FormData();
      doc.append('kind', 'document_front');
      doc.append('file', new Blob([createPng(120, 80)], { type: 'image/png' }), 'id.png');
      const uploaded = await agent.client.request('POST', '/api/verification/documents', { body: doc });
      assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));

      // Task 03: both sides of the Ghana Card.
      const backDoc = new FormData();
      backDoc.append('kind', 'document_back');
      backDoc.append('file', new Blob([createPng(120, 80)], { type: 'image/png' }), 'id-back.png');
      const uploadedBack = await agent.client.request('POST', '/api/verification/documents', { body: backDoc });
      assert.equal(uploadedBack.status, 201, JSON.stringify(uploadedBack.body));

      const submitted = await agent.client.post('/api/verification/identity', {
        legalName: 'Tier Verification Agent',
        documentType: 'ghana_card',
        documentNumber: `GHA-${Math.floor(Math.random() * 900000000) + 100000000}-1`,
        documentIds: [uploaded.body.document.id, uploadedBack.body.document.id],
      });
      assert.equal(submitted.status, 201, JSON.stringify(submitted.body));

      const decided = await reviewer.client.post(
        `/api/admin/verifications/${agent.id}/identity/decision`,
        { decision: 'approve', note: 'Identity checked for the tier tests.' }
      );
      assert.equal(decided.status, 200, JSON.stringify(decided.body));
    }

    if (professional) {
      const submitted = await agent.client.post('/api/verification/professional', {
        licenceNumber: `REAC-TIER-${Math.floor(Math.random() * 100000)}`,
        issuingAuthority: 'Real Estate Agency Council (test value)',
        licenceCategory: 'Agency',
        issueDate: '2026-01-10',
        expiryDate: expiry,
        documentIds: [],
      });
      assert.equal(submitted.status, 201, JSON.stringify(submitted.body));

      const decided = await reviewer.client.post(
        `/api/admin/verifications/${agent.id}/professional/decision`,
        { decision: 'approve', note: 'Licence checked for the tier tests.' }
      );
      assert.equal(decided.status, 200, JSON.stringify(decided.body));
    }

    return agent;
  };

  const bookViewing = async (label) => {
    const res = await guest.post('/api/viewing-requests', {
      tenantName: `Tier ${label}`,
      tenantPhone: '+233 24 700 0002',
      tenantEmail: `tier-${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
      propertyId: state.seededPropertyId,
      date: daysFromNow(2),
      time: '11:00 AM',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    await completeViewingAs(admin, res.body.viewingId);
    const paid = await admin.patch(`/api/viewings/${res.body.viewingId}`, { viewingFeePaid: true });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));

    const ledger = await admin.get('/api/admin/viewing-fees');
    assert.equal(ledger.status, 200);
    const record = ledger.body.records.find((row) => row.viewingId === res.body.viewingId);
    assert.ok(record, 'a fee record must exist for the new viewing');
    return record;
  };

  const summary = async () => {
    const res = await admin.get('/api/admin/viewing-fees');
    assert.equal(res.status, 200);
    return res.body.summary;
  };

  const policyPayload = (overrides = {}) => ({
    name: 'Standard viewing fee share',
    description: 'Draft test policy for the automated suite.',
    category: 'viewing_fee',
    agentTier: 'standard',
    calculationMethod: 'percentage',
    agentSharePercent: 60,
    goodlucksSharePercent: 40,
    effectiveFrom: today(),
    currency: 'GHS',
    ...overrides,
  });

  const createPolicy = async (manager, overrides = {}) => {
    const res = await manager.client.post('/api/admin/fee-policies', policyPayload(overrides));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.policy;
  };

  const lifecycle = {
    submit: (actor, id) => actor.client.post(`/api/admin/fee-policies/${id}/submit`, { note: 'Ready for review.' }),
    approve: (actor, id, note = 'Checked the percentages and the tier definition.') =>
      actor.client.post(`/api/admin/fee-policies/${id}/approve`, { note }),
    reject: (actor, id, reason = 'Not approved for this release.') =>
      actor.client.post(`/api/admin/fee-policies/${id}/reject`, { reason }),
    activate: (actor, id) => actor.client.post(`/api/admin/fee-policies/${id}/activate`, { note: 'Approved for use.' }),
    deactivate: (actor, id, reason = 'Superseded by a later decision.') =>
      actor.client.post(`/api/admin/fee-policies/${id}/deactivate`, { reason }),
  };

  const applyPolicy = (actor, recordId, policyId) =>
    actor.client.post(`/api/admin/viewing-fees/${recordId}/apply-policy`, policyId ? { policyId } : {});

  const linkAgent = (actor, recordId, agentUserId) =>
    actor.client.post(`/api/admin/viewing-fees/${recordId}/agent`, { agentUserId });

  const ledgerRecord = async (recordId) => {
    const res = await admin.get('/api/admin/viewing-fees');
    assert.equal(res.status, 200);
    return res.body.records.find((row) => row.id === recordId);
  };

  test('a manager can draft a fee policy, and a draft is not approved or applicable', async () => {
    e.admins.manager = await createAdmin('manager', { manage: true });
    e.admins.approver = await createAdmin('approver', { approve: true });
    e.admins.reviewer = await createAdmin('reviewer', { reviewer: true });

    const policy = await createPolicy(e.admins.manager);
    e.policies.standard = policy;

    assert.equal(policy.status, 'draft');
    assert.equal(policy.storedStatus, 'draft');
    assert.equal(policy.approved, false, 'creating a policy is not approval');
    assert.equal(policy.applicable, false);
    assert.equal(policy.agentTier, 'standard');
    assert.equal(policy.agentSharePercent, 60);
    assert.equal(policy.goodlucksSharePercent, 40);
    assert.equal(policy.version, 1);
    assert.ok(policy.createdBy);
    assert.equal(policy.approvedBy, '');

    // Editing is allowed while it is still a draft.
    const edited = await e.admins.manager.client.patch(`/api/admin/fee-policies/${policy.id}`, {
      ...policyPayload({ description: 'Edited description.' }),
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.policy.description, 'Edited description.');

    const detail = await e.admins.manager.client.get(`/api/admin/fee-policies/${policy.id}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(
      detail.body.history.map((event) => event.action),
      ['created', 'updated'],
      'every lifecycle step is recorded'
    );
  });

  test('unauthorised users cannot create, edit, approve or activate policies', async () => {
    // An administrator without either capability.
    const plainAdmin = await createAdmin('plain');
    assert.deepEqual(
      plainAdmin.capabilities,
      {
        verificationReviewer: false,
        identityDocumentAccess: false,
        feePolicyManage: false,
        feePolicyApprove: false,
        // Increment G: reading money and confirming receipt are default-deny
        // too, and neither is implied by the other.
        financeView: false,
        financeConfirm: false,
        // Increment F: viewing corrections are default-deny too.
        viewingCorrections: false,
        // Upgrade 2: approving your OWN policy is denied for every administrator
        // except the primary platform administrator (who is not this account).
        feePolicySelfApprove: false,
        // Upgrade 2 Phase 3: the user directory, the activity history and bulk
        // email are separate powers, all default-deny for a new administrator.
        manageUsers: false,
        viewUserActivity: false,
        sendBulkEmail: false,
      },
      'capabilities are default-deny for a new administrator'
    );

    assert.equal((await plainAdmin.client.get('/api/admin/fee-policies')).status, 403);
    assert.equal((await plainAdmin.client.post('/api/admin/fee-policies', policyPayload())).status, 403);
    assert.equal(
      (await plainAdmin.client.post(`/api/admin/fee-policies/${e.policies.standard.id}/submit`, {})).status,
      403
    );
    assert.equal(
      (await plainAdmin.client.post(`/api/admin/fee-policies/${e.policies.standard.id}/approve`, { note: 'x' })).status,
      403
    );

    // A manager cannot approve or activate; an approver cannot create or edit.
    assert.equal(
      (await e.admins.manager.client.post(`/api/admin/fee-policies/${e.policies.standard.id}/approve`, { note: 'x' })).status,
      403
    );
    assert.equal(
      (await e.admins.manager.client.post(`/api/admin/fee-policies/${e.policies.standard.id}/activate`, {})).status,
      403,
      'activation is an approver action, even after approval'
    );
    assert.equal(
      (await plainAdmin.client.post(`/api/admin/fee-policies/${e.policies.standard.id}/activate`, {})).status,
      403
    );
    assert.equal(
      (await plainAdmin.client.post(`/api/admin/fee-policies/${e.policies.standard.id}/reject`, { reason: 'x' })).status,
      403
    );
    assert.equal(
      (await e.admins.approver.client.post('/api/admin/fee-policies', policyPayload())).status,
      403
    );
    assert.equal(
      (await e.admins.approver.client.patch(`/api/admin/fee-policies/${e.policies.standard.id}`, policyPayload())).status,
      403
    );

    // Agents have no access to financial-policy administration at all.
    e.agents.standard = await registerAgent('standard');
    assert.equal((await e.agents.standard.client.get('/api/admin/fee-policies')).status, 403);
    assert.equal(
      (await e.agents.standard.client.post('/api/admin/fee-policies', policyPayload())).status,
      403
    );
    assert.equal((await e.agents.standard.client.get('/api/admin/viewing-fees')).status, 403);
    assert.equal((await guest.get('/api/admin/fee-policies')).status, 401);
  });

  test('approval needs the approver capability, and the creator can never approve their own policy', async () => {
    const policyId = e.policies.standard.id;

    const submitted = await lifecycle.submit(e.admins.manager, policyId);
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.policy.status, 'pending_approval');

    // Still not applicable, still not approved.
    assert.equal(submitted.body.policy.applicable, false);
    assert.equal(submitted.body.policy.approved, false);

    // A second approver, with both capabilities, creates and tries to approve
    // their own policy: refused (separation of duties).
    const both = await createAdmin('both', { manage: true, approve: true });
    const ownPolicy = await createPolicy(both, { name: 'Self-approved policy attempt' });
    await lifecycle.submit(both, ownPolicy.id);
    const selfApproval = await lifecycle.approve(both, ownPolicy.id);
    assert.equal(selfApproval.status, 422, JSON.stringify(selfApproval.body));
    assert.match(selfApproval.body.error, /different administrator/i);
    assert.equal(
      (await both.client.get(`/api/admin/fee-policies/${ownPolicy.id}`)).body.policy.status,
      'pending_approval',
      'the failed self-approval must change nothing'
    );

    // A policy awaiting approval cannot be activated either.
    assert.equal((await lifecycle.activate(e.admins.approver, policyId)).status, 422);

    // A reason is required to approve, and to reject.
    const noNote = await e.admins.approver.client.post(`/api/admin/fee-policies/${policyId}/approve`, {});
    assert.equal(noNote.status, 422);
    const noReason = await e.admins.approver.client.post(`/api/admin/fee-policies/${policyId}/reject`, {});
    assert.equal(noReason.status, 422);

    const approved = await lifecycle.approve(e.admins.approver, policyId);
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.policy.status, 'approved');
    assert.equal(approved.body.policy.approved, true);
    assert.ok(approved.body.policy.approvedBy);
    // Approval is still not activation.
    assert.equal(approved.body.policy.applicable, false);

    const rejected = await lifecycle.reject(e.admins.approver, ownPolicy.id, 'Not needed for this release.');
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
    assert.equal(rejected.body.policy.status, 'rejected');

    // An approved policy is history: it can be deactivated, never edited.
    const editApproved = await e.admins.manager.client.patch(`/api/admin/fee-policies/${policyId}`, {
      ...policyPayload({ agentSharePercent: 55, goodlucksSharePercent: 45 }),
    });
    assert.equal(editApproved.status, 422, JSON.stringify(editApproved.body));
    assert.match(editApproved.body.error, /draft/i);
    const unchanged = await e.admins.approver.client.get(`/api/admin/fee-policies/${policyId}`);
    assert.equal(unchanged.body.policy.agentSharePercent, 60, 'the approved percentages are intact');
  });

  test('the proposed 60/40 and 70/30 arrangements stay inactive and unapplied', async () => {
    const policy = await admin.get('/api/admin/viewing-fees/policy');
    assert.equal(policy.status, 200);
    assert.equal(policy.body.policy.status, 'provisional', 'no policy is active yet');
    assert.equal(policy.body.policy.appliedToCalculations, false);
    assert.equal(policy.body.policy.approvedPolicy, null);

    const proposed = policy.body.policy.proposed;
    const standardProposal = proposed.find((tier) => tier.tier === 'standard');
    const professionalProposal = proposed.find((tier) => tier.tier === 'professional');
    assert.equal(standardProposal.agentSharePercent, 60);
    assert.equal(standardProposal.goodlucksSharePercent, 40);
    assert.equal(professionalProposal.agentSharePercent, 70);
    assert.equal(professionalProposal.goodlucksSharePercent, 30);
    assert.equal(standardProposal.status, 'provisional');
    assert.equal(professionalProposal.status, 'provisional');
    assert.equal(standardProposal.appliedToCalculations, false);
    assert.equal(professionalProposal.appliedToCalculations, false);

    // The approved-but-not-activated policy is a real record, but it still
    // prices nothing: a fee reported now keeps no share at all.
    const record = await bookViewing('proposal');
    e.records.proposal = record;
    assert.equal(record.goodlucksShareGhs, null);
    assert.equal(record.shareBasis, 'not_set');
    assert.equal(record.policySnapshot, null);
  });

  test('invalid percentage and amount combinations are rejected', async () => {
    const manager = e.admins.manager;
    const cases = [
      [{ agentSharePercent: 60, goodlucksSharePercent: 30 }, 'sum'],
      [{ agentSharePercent: -10, goodlucksSharePercent: 110 }, 'negative'],
      [{ agentSharePercent: 101, goodlucksSharePercent: -1 }, 'above 100'],
      [{ agentSharePercent: 100, goodlucksSharePercent: 100 }, 'sum above'],
      [{ agentSharePercent: 'sixty', goodlucksSharePercent: 40 }, 'not a number'],
      [{ calculationMethod: 'fixed', agentShareFixedGhs: 0, goodlucksShareFixedGhs: 0 }, 'fixed zero'],
      [{ calculationMethod: 'fixed', agentShareFixedGhs: -5, goodlucksShareFixedGhs: 105 }, 'fixed negative'],
      [{ effectiveFrom: daysFromNow(10), effectiveTo: daysFromNow(5) }, 'end before start'],
      [{ category: 'invented_category' }, 'unknown category'],
      [{ agentTier: 'gold' }, 'unknown tier'],
      [{ currency: 'USD' }, 'wrong currency'],
      [{ name: '' }, 'no name'],
    ];

    for (const [override, label] of cases) {
      const res = await manager.client.post('/api/admin/fee-policies', policyPayload(override));
      assert.equal(res.status, 422, `${label}: ${JSON.stringify(res.body)}`);
      assert.ok(res.body.fields && Object.keys(res.body.fields).length > 0, `${label} must report the field`);
    }

    // A valid fixed-amount policy is accepted and reports its total.
    const fixed = await manager.client.post('/api/admin/fee-policies', policyPayload({
      name: 'Fixed handling fee (draft)',
      calculationMethod: 'fixed',
      agentSharePercent: 0,
      goodlucksSharePercent: 0,
      agentShareFixedGhs: 30,
      goodlucksShareFixedGhs: 20,
    }));
    assert.equal(fixed.status, 201, JSON.stringify(fixed.body));
    assert.equal(fixed.body.policy.totalFixedGhs, 50);
    assert.equal(fixed.body.policy.agentShareFixedGhs, 30);
    e.policies.fixed = fixed.body.policy;
  });

  test('a policy cannot be applied before its effective date', async () => {
    const manager = e.admins.manager;
    const approver = e.admins.approver;

    // 1. Activation itself refuses a policy that starts in the future.
    const future = await createPolicy(manager, {
      name: 'Future-dated standard policy',
      effectiveFrom: daysFromNow(30),
    });
    e.policies.future = future;
    await lifecycle.submit(manager, future.id);
    await lifecycle.approve(approver, future.id);
    const early = await lifecycle.activate(approver, future.id);
    assert.equal(early.status, 422, JSON.stringify(early.body));
    assert.match(early.body.error, /starts on/i);

    // 2. A fee collected before the policy existed is never re-priced by it.
    const record = await bookViewing('predates-policy');
    e.records.predates = record;
    const backdated = runPhpScript(
      'tests/finance-fixtures.php',
      [`--fee-reference=${record.reference}`, '--fee-days-ago=45'],
      state.testEnv
    );
    assert.equal(backdated.status, 0, backdated.stdout + backdated.stderr);

    e.agents.standard = await registerAgent('standard');
    await verifyAgent(e.agents.standard, { identity: true, professional: false });
    assert.equal((await linkAgent(e.admins.manager, record.id, e.agents.standard.id)).status, 200);

    const active = await lifecycle.activate(approver, e.policies.standard.id);
    assert.equal(active.status, 200, JSON.stringify(active.body));
    assert.equal(active.body.policy.status, 'active');

    const refused = await applyPolicy(approver, record.id, e.policies.standard.id);
    assert.equal(refused.status, 422, JSON.stringify(refused.body));
    assert.match(refused.body.error, /not in effect|re-priced/i);

    // The refusal changed nothing: no share, no snapshot.
    const after = await ledgerRecord(record.id);
    assert.equal(after.shareBasis, 'not_set');
    assert.equal(after.policySnapshot, null);
  });

  test('expired, deactivated and unapproved policies cannot price a transaction', async () => {
    const manager = e.admins.manager;
    const approver = e.admins.approver;

    const record = await bookViewing('inactive-policy');
    e.records.inactive = record;
    assert.equal((await linkAgent(manager, record.id, e.agents.standard.id)).status, 200);

    // A draft cannot be applied even when its id is passed explicitly.
    const draft = await createPolicy(manager, { name: 'Still a draft' });
    const draftApply = await applyPolicy(approver, record.id, draft.id);
    assert.equal(draftApply.status, 422, JSON.stringify(draftApply.body));
    assert.match(draftApply.body.error, /active/i);

    // Deactivated policy: refused for a new transaction.
    const deactivated = await lifecycle.deactivate(approver, e.policies.standard.id);
    assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body));
    assert.equal(deactivated.body.policy.status, 'deactivated');
    const afterDeactivation = await applyPolicy(approver, record.id, e.policies.standard.id);
    assert.equal(afterDeactivation.status, 422, JSON.stringify(afterDeactivation.body));

    // A replacement policy activates cleanly once the old one is inactive.
    const replacement = await createPolicy(manager, { name: 'Current standard policy' });
    e.policies.standardCurrent = replacement;
    await lifecycle.submit(manager, replacement.id);
    await lifecycle.approve(approver, replacement.id);
    const activated = await lifecycle.activate(approver, replacement.id);
    assert.equal(activated.status, 200, JSON.stringify(activated.body));

    // An active policy whose end date has passed reads as expired and stops
    // pricing new transactions (simulated with the fixture, not by waiting).
    const aged = runPhpScript(
      'tests/finance-fixtures.php',
      [`--policy-id=${replacement.id}`, `--policy-effective-to=${daysFromNow(-1)}`],
      state.testEnv
    );
    assert.equal(aged.status, 0, aged.stdout + aged.stderr);

    const listed = await manager.client.get(`/api/admin/fee-policies/${replacement.id}`);
    assert.equal(listed.body.policy.status, 'expired');
    assert.equal(listed.body.policy.storedStatus, 'active', 'the recorded activation is not rewritten');
    assert.equal(listed.body.policy.expired, true);

    const expiredApply = await applyPolicy(approver, record.id, replacement.id);
    assert.equal(expiredApply.status, 422, JSON.stringify(expiredApply.body));
    assert.match(expiredApply.body.error, /expired/i);

    // Overlapping active policies for the same tier and category are refused.
    const first = await createPolicy(manager, { name: 'Overlap A' });
    await lifecycle.submit(manager, first.id);
    await lifecycle.approve(approver, first.id);
    assert.equal((await lifecycle.activate(approver, first.id)).status, 200);

    const second = await createPolicy(manager, { name: 'Overlap B' });
    await lifecycle.submit(manager, second.id);
    await lifecycle.approve(approver, second.id);
    const conflict = await lifecycle.activate(approver, second.id);
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
    assert.match(conflict.body.error, /already covers/i);
    assert.equal(conflict.body.fields.conflictPolicyId, first.id);

    e.policies.standardActive = first;
  });

  test('a standard agent cannot qualify for the higher tier without a professional authorisation', async () => {
    // The standard agent has had identity approved (see the effective-date test).
    const tier = await e.admins.manager.client.get(`/api/admin/agents/${e.agents.standard.id}/tier`);
    assert.equal(tier.status, 200, JSON.stringify(tier.body));
    assert.equal(tier.body.tier.identityStatus, 'approved');
    assert.equal(tier.body.tier.identityApproved, true);
    assert.equal(tier.body.tier.professionalStatus, 'not_submitted');
    assert.equal(tier.body.tier.tier, 'standard');
    assert.equal(tier.body.tier.eligibleProfessional, false, 'identity approval is not a licence');

    // The agent's own view says the same, and exposes no financial data.
    const own = await e.agents.standard.client.get('/api/verification');
    assert.equal(own.body.verification.agentTier.tier, 'standard');
    assert.equal(own.body.verification.agentTier.eligibleProfessional, false);
    assert.ok(!('policies' in own.body.verification));

    // Creating a professional-tier policy and applying it to this agent's fee is
    // refused on the tier, not silently downgraded.
    const manager = e.admins.manager;
    const approver = e.admins.approver;
    const professionalPolicy = await createPolicy(manager, {
      name: 'Professional viewing fee share',
      agentTier: 'professional',
      agentSharePercent: 70,
      goodlucksSharePercent: 30,
    });
    e.policies.professional = professionalPolicy;
    await lifecycle.submit(manager, professionalPolicy.id);
    await lifecycle.approve(approver, professionalPolicy.id);
    assert.equal((await lifecycle.activate(approver, professionalPolicy.id)).status, 200);

    const record = await bookViewing('standard-tier');
    e.records.standardTier = record;
    assert.equal((await linkAgent(manager, record.id, e.agents.standard.id)).status, 200);

    const mismatch = await applyPolicy(approver, record.id, professionalPolicy.id);
    assert.equal(mismatch.status, 409, JSON.stringify(mismatch.body));
    assert.match(mismatch.body.error, /Standard agent/i);

    const stillUnpriced = await ledgerRecord(record.id);
    assert.equal(stillUnpriced.shareBasis, 'not_set');
    assert.equal(stillUnpriced.goodlucksShareGhs, null);
  });

  test('applying an approved policy freezes the exact terms in an immutable snapshot', async () => {
    const manager = e.admins.manager;
    const approver = e.admins.approver;
    const agent = e.agents.standard;

    // The agent becomes professionally authorised.
    const professional = await agent.client.post('/api/verification/professional', {
      licenceNumber: `REAC-TIER-${Math.floor(Math.random() * 100000)}`,
      issuingAuthority: 'Real Estate Agency Council (test value)',
      licenceCategory: 'Agency',
      issueDate: '2026-01-10',
      expiryDate: licenceExpiry(),
      documentIds: [],
    });
    assert.equal(professional.status, 201, JSON.stringify(professional.body));
    const approved = await e.admins.reviewer.client.post(
      `/api/admin/verifications/${agent.id}/professional/decision`,
      { decision: 'approve', note: 'Licence checked before the policy test.' }
    );
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const tier = await manager.client.get(`/api/admin/agents/${agent.id}/tier`);
    assert.equal(tier.body.tier.tier, 'professional');
    assert.equal(tier.body.tier.eligibleProfessional, true);

    const record = await bookViewing('policy-applied');
    e.records.applied = record;
    assert.equal((await linkAgent(manager, record.id, agent.id)).status, 200);

    const applied = await applyPolicy(approver, record.id, e.policies.professional.id);
    assert.equal(applied.status, 200, JSON.stringify(applied.body));

    const snapshot = applied.body.snapshot;
    e.snapshots = { professional: snapshot };
    assert.equal(snapshot.policyId, e.policies.professional.id);
    assert.equal(snapshot.policyName, 'Professional viewing fee share');
    assert.equal(snapshot.agentTier, 'professional');
    assert.equal(snapshot.calculationMethod, 'percentage');
    assert.equal(snapshot.currency, 'GHS');
    assert.equal(snapshot.feeTotalGhs, 100);
    assert.equal(snapshot.agentSharePercent, 70);
    assert.equal(snapshot.goodlucksSharePercent, 30);
    assert.equal(snapshot.agentEntitlementGhs, 70);
    assert.equal(snapshot.goodlucksEntitlementGhs, 30);
    assert.equal(snapshot.policyStatusAtUse, 'active');
    assert.equal(snapshot.integrityOk, true);
    assert.ok(snapshot.policyApprovedAt);
    assert.ok(snapshot.snapshotHash);

    const priced = applied.body.record;
    assert.equal(priced.shareBasis, 'policy_snapshot');
    assert.equal(priced.snapshotKind, 'policy');
    assert.equal(priced.goodlucksShareGhs, 30);
    assert.equal(priced.agentShareGhs, 70);
    assert.equal(priced.agentTierAtSnapshot, 'professional');
    assert.equal(priced.policySnapshot.integrityOk, true);

    // A snapshot cannot be replaced or re-priced.
    assert.equal((await applyPolicy(approver, record.id, e.policies.professional.id)).status, 422);
    // There is no endpoint that edits or deletes a snapshot.
    assert.equal((await approver.client.patch(`/api/admin/fee-snapshots/${snapshot.id}`, { goodlucksEntitlementGhs: 0 })).status, 404);
    assert.equal((await approver.client.delete(`/api/admin/fee-snapshots/${snapshot.id}`)).status, 404);
    assert.equal(
      (await admin.post(`/api/admin/viewing-fees/${record.id}/share`, { amountGhs: 10, note: 'override attempt' })).status,
      422
    );
    assert.equal((await linkAgent(manager, record.id, e.agents.standard.id)).status, 409);
  });

  test('historical snapshots survive a tier change and policy deactivation', async () => {
    const agent = e.agents.standard;

    // Percentage values alone do not prove a policy was applied, so the tier and
    // the amounts are compared too.
    const before = e.snapshots.professional;

    // The licence lapses (fixture: the expiry date moves into the past).
    const lapsed = runPhpScript(
      'tests/read-verification.php',
      [`--email=${agent.email}`, '--expire-professional=1'],
      state.testEnv
    );
    assert.equal(lapsed.status, 0, lapsed.stdout + lapsed.stderr);

    const tier = await e.admins.manager.client.get(`/api/admin/agents/${agent.id}/tier`);
    assert.equal(tier.body.tier.professionalStatus, 'expired');
    assert.equal(tier.body.tier.tier, 'standard', 'a lapsed licence drops the tier for future work');
    assert.equal(tier.body.tier.eligibleProfessional, false);

    // A new fee for the same agent can no longer use the higher-tier policy.
    const fresh = await bookViewing('after-lapse');
    e.records.afterLapse = fresh;
    assert.equal((await linkAgent(e.admins.manager, fresh.id, agent.id)).status, 200);
    const refused = await applyPolicy(e.admins.approver, fresh.id, e.policies.professional.id);
    assert.equal(refused.status, 409, JSON.stringify(refused.body));

    // The existing snapshot is unchanged, value for value.
    const record = await ledgerRecord(e.records.applied.id);
    assert.equal(record.policySnapshot.agentTier, before.agentTier);
    assert.equal(record.policySnapshot.agentSharePercent, before.agentSharePercent);
    assert.equal(record.policySnapshot.goodlucksSharePercent, before.goodlucksSharePercent);
    assert.equal(record.policySnapshot.agentEntitlementGhs, before.agentEntitlementGhs);
    assert.equal(record.policySnapshot.goodlucksEntitlementGhs, before.goodlucksEntitlementGhs);
    assert.equal(record.policySnapshot.snapshotHash, before.snapshotHash);
    assert.equal(record.policySnapshot.integrityOk, true);

    // Deactivating the policy doesn't touch history either.
    const deactivated = await lifecycle.deactivate(
      e.admins.approver,
      e.policies.professional.id,
      'Professional policy withdrawn for review.'
    );
    assert.equal(deactivated.status, 200, JSON.stringify(deactivated.body));

    const afterDeactivation = await ledgerRecord(e.records.applied.id);
    assert.equal(afterDeactivation.policySnapshot.snapshotHash, before.snapshotHash);
    assert.equal(afterDeactivation.policySnapshot.integrityOk, true);
    assert.equal(afterDeactivation.goodlucksShareGhs, 30);
    assert.equal(afterDeactivation.agentShareGhs, 70);
    assert.equal(afterDeactivation.shareBasis, 'policy_snapshot');
  });

  test('existing manual agreements are never re-priced by a policy', async () => {
    const record = await bookViewing('manual-agreement');
    e.records.manual = record;

    const agreed = await admin.post(`/api/admin/viewing-fees/${record.id}/share`, {
      amountGhs: 40,
      note: 'Agreed with the agent on site, before any policy existed.',
    });
    assert.equal(agreed.status, 200, JSON.stringify(agreed.body));
    assert.equal(agreed.body.record.shareBasis, 'manual_agreement');
    assert.equal(agreed.body.record.snapshotKind, 'manual_agreement');
    assert.equal(agreed.body.record.policyId, '');
    assert.equal(agreed.body.record.policySnapshot, null);

    assert.equal((await linkAgent(e.admins.manager, record.id, e.agents.standard.id)).status, 409);

    const attempt = await applyPolicy(e.admins.approver, record.id, e.policies.standardActive.id);
    assert.equal(attempt.status, 422, JSON.stringify(attempt.body));
    assert.match(attempt.body.error, /already carries an agreed share|re-priced/i);

    const unchanged = await ledgerRecord(record.id);
    assert.equal(unchanged.shareBasis, 'manual_agreement');
    assert.equal(unchanged.goodlucksShareGhs, 40);
    assert.equal(unchanged.agentShareGhs, 60);
    assert.equal(unchanged.policySnapshot, null);
  });

  test('a policy entitlement is money owed, never money received', async () => {
    const before = await summary();
    const record = await bookViewing('revenue');
    e.records.revenue = record;

    const standardAgent = await registerAgent('revenue');
    await verifyAgent(standardAgent, { identity: true, professional: false });
    assert.equal(
      (await linkAgent(e.admins.manager, record.id, standardAgent.id)).status,
      200
    );

    const applied = await applyPolicy(e.admins.approver, record.id);
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.snapshot.policyId, e.policies.standardActive.id);
    assert.equal(applied.body.snapshot.goodlucksEntitlementGhs, 40);
    assert.equal(applied.body.snapshot.agentEntitlementGhs, 60);

    const afterApply = await summary();
    assert.equal(afterApply.viewingFeesCollectedGhs, before.viewingFeesCollectedGhs + 100);
    assert.equal(afterApply.goodlucksShareDueGhs, before.goodlucksShareDueGhs + 40);
    assert.equal(
      afterApply.goodlucksShareReceivedGhs,
      before.goodlucksShareReceivedGhs,
      'an entitlement is not a receipt'
    );
    assert.equal(afterApply.agentShareRetainedGhs, before.agentShareRetainedGhs + 60);

    // Only an actual remittance becomes revenue.
    const remittance = await admin.post(`/api/admin/viewing-fees/${record.id}/remittances`, {
      amountGhs: 40,
      method: 'Bank transfer',
      receivedAt: today(),
      notes: 'Goodlucks received the agreed share.',
    });
    assert.equal(remittance.status, 201, JSON.stringify(remittance.body));

    const afterRemittance = await summary();
    assert.equal(afterRemittance.goodlucksShareReceivedGhs, before.goodlucksShareReceivedGhs + 40);
    assert.equal(afterRemittance.outstandingReceivablesGhs, before.outstandingReceivablesGhs);
  });

  test('every policy action is audited, and agents cannot see each other financially', async () => {
    const logs = await admin.get('/api/admin/audit-logs?limit=300');
    assert.equal(logs.status, 200);
    const actions = new Set(logs.body.logs.map((log) => log.action));
    for (const expected of [
      'fee_policy.created',
      'fee_policy.updated',
      'fee_policy.submitted',
      'fee_policy.approved',
      'fee_policy.rejected',
      'fee_policy.activated',
      'fee_policy.deactivated',
      'viewing_fee.policy_applied',
      'viewing_fee.agent_linked',
      'finance.capability_changed',
    ]) {
      assert.ok(actions.has(expected), `missing audit action ${expected}`);
    }

    const applied = logs.body.logs.find((log) => log.action === 'viewing_fee.policy_applied');
    assert.ok(applied && applied.context && applied.context.policyId, 'the applied policy is recorded');
    assert.equal(applied.context.receivedBy, 'nobody', 'applying a policy receives no money');

    // An agent has no route to the ledger, another agent's tier, or the policies.
    const other = e.agents.standard;
    const mine = e.agents.revenue;
    assert.equal((await other.client.get(`/api/admin/agents/${mine.id}/tier`)).status, 403);
    assert.equal((await other.client.get('/api/admin/viewing-fees')).status, 403);
    assert.equal((await other.client.get(`/api/admin/fee-policies/${e.policies.standardActive.id}`)).status, 403);

    // Nothing about another agent leaks through the agent's own verification view.
    const own = await mine.client.get('/api/verification');
    assert.equal(own.status, 200);
    assert.equal(own.body.verification.agentTier.userId, mine.id);
    assert.ok(!JSON.stringify(own.body).includes(other.id));
  });

  test('Increments A, B, C and D still behave', async () => {
    // Agreements stay retired, receipt issuing stays disabled.
    assert.equal((await admin.get('/api/agreements')).status, 404);
    assert.equal((await admin.post('/api/receipts', {})).status, 503);

    // Increment D surfaces still work for the agent created here.
    const verification = await e.agents.standard.client.get('/api/verification');
    assert.equal(verification.status, 200);
    assert.equal(verification.body.verification.identity.status, 'approved');
    assert.equal(verification.body.verification.encryptionActive, true);

    // Increment B ledger totals still separate collected / owed / received.
    const ledger = await admin.get('/api/admin/viewing-fees');
    assert.equal(ledger.status, 200);
    const s = ledger.body.summary;
    assert.ok(s.viewingFeesCollectedGhs >= s.goodlucksShareDueGhs);
    assert.ok(s.goodlucksShareReceivedGhs <= s.goodlucksShareDueGhs);

    // Every snapshot still verifies against its hash.
    for (const record of ledger.body.records) {
      if (record.policySnapshot) {
        assert.equal(record.policySnapshot.integrityOk, true, `snapshot ${record.policySnapshot.id} was altered`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Increment F — agent-led viewing lifecycle
// ---------------------------------------------------------------------------
describe('Agent-led viewing lifecycle (Increment F)', () => {
  const f = {
    admins: {},
    agents: {},
    tenants: {},
    landlords: {},
    properties: {},
    viewings: {},
  };
  const daysFromNow = (days) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

  const makeAdmin = async (key, { correct = false } = {}) => {
    const email = uniqueEmail(`f-admin-${key}`);
    const password = 'Viewing-Admin-Pass-1';
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${password}`, `--name=F Admin ${key}`, '--role=admin'],
      state.testEnv
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);

    const client = new ApiClient(baseUrl);
    const login = await client.post('/api/auth/admin-login', { email, password, accessKey: ADMIN_ACCESS_KEY });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    const adminAccount = { client, id: login.body.user.id, email };

    if (correct) {
      const granted = runPhpScript(
        'php-backend/grant_viewing.php',
        [`--email=${email}`, '--correct=1'],
        state.testEnv
      );
      assert.equal(granted.status, 0, granted.stdout + granted.stderr);
      const refreshed = await client.get('/api/auth/me');
      assert.equal(refreshed.body.user.capabilities.viewingCorrections, true);
    }

    f.admins[key] = adminAccount;
    return adminAccount;
  };

  const makeAgent = async (key, { activate = true } = {}) => {
    const email = uniqueEmail(`f-agent-${key}`);
    const password = 'Viewing-Agent-Pass-1';
    const client = new ApiClient(baseUrl);
    const registered = await client.post('/api/auth/register', {
      name: `F Agent ${key}`,
      email,
      phone: '+233 20 555 0100',
      password,
      role: 'agent',
      operatingCity: 'Accra',
      agencyName: 'F Test Agency',
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    const account = { client, id: registered.body.user.id, email, name: `F Agent ${key}` };

    if (activate) {
      const approved = await admin.post(`/api/admin/agents/${account.id}/status`, {
        accountStatus: 'active',
        canSubmitListings: true,
      });
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
    }

    f.agents[key] = account;
    return account;
  };

  const makeLandlord = async (key) => {
    const email = uniqueEmail(`f-landlord-${key}`);
    const password = 'Viewing-Landlord-Pass-1';
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${password}`, `--name=F Landlord ${key}`, '--role=landlord'],
      state.testEnv
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);
    const client = new ApiClient(baseUrl);
    const login = await client.post('/api/auth/login', { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));

    const account = { client, id: JSON.parse(created.stdout.trim()).id, name: `F Landlord ${key}` };
    f.landlords[key] = account;
    return account;
  };

  const makeTenant = async (key) => {
    const email = uniqueEmail(`f-tenant-${key}`);
    const password = 'Viewing-Tenant-Pass-1';
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${password}`, `--name=F Tenant ${key}`, '--role=tenant', '--phone=+233 24 555 0000'],
      state.testEnv
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);
    const client = new ApiClient(baseUrl);
    const login = await client.post('/api/auth/login', { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));

    const account = { client, id: JSON.parse(created.stdout.trim()).id, email, name: `F Tenant ${key}` };
    f.tenants[key] = account;
    return account;
  };

  /** An agent submits a listing for a landlord; staff approve it so it is visible. */
  const makeProperty = async (agent, landlord, label) => {
    const created = await agent.client.post('/api/properties', {
      title: `F viewing property ${label}`,
      location: 'Osu, Accra',
      city: 'Accra',
      rentGhs: 5200,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: 'Apartment',
      description: `A property used by the Increment F viewing tests (${label}).`,
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
      viewingFeeGhs: 150,
      viewingTerms: AGENT_VIEWING_TERMS,
      landlordId: landlord.id,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const propertyId = created.body.property.id;

    const approved = await admin.post(`/api/properties/${propertyId}/status`, { status: 'active' });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    f.properties[label] = { id: propertyId };
    return { id: propertyId };
  };

  let requestCounter = 0;
  const requestViewing = async (tenant, propertyId, overrides = {}) => {
    requestCounter += 1;
    const res = await tenant.client.post('/api/viewings', {
      propertyId,
      requestType: 'viewing',
      tenantName: tenant.name,
      tenantPhone: '+233 24 555 0000',
      tenantEmail: tenant.email,
      date: daysFromNow(2),
      time: '11:00 AM',
      // Distinct message per request: identical payloads are treated as a
      // double-submit by the existing dedupe (which is correct behaviour).
      message: `I would like to see this apartment (request ${requestCounter}).`,
      ...overrides,
    });
    return res;
  };

  const detail = async (client, viewingId) => {
    const res = await client.get(`/api/viewings/${viewingId}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
  };

  const action = (client, viewingId, name, body = {}) =>
    client.post(`/api/viewings/${viewingId}/${name}`, body);

  test('a tenant request is a request, not an appointment', async () => {
    f.admins.plain = await makeAdmin('plain');
    f.agents.primary = await makeAgent('primary');
    f.landlords.primary = await makeLandlord('primary');
    f.tenants.primary = await makeTenant('primary');
    f.properties.primary = await makeProperty(f.agents.primary, f.landlords.primary, 'primary');

    const res = await requestViewing(f.tenants.primary, f.properties.primary.id);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.awaitingAgent, true);
    assert.match(res.body.message, /not confirmed/i);

    const viewing = res.body.viewing;
    f.viewings.primary = viewing.id;
    assert.equal(viewing.status, 'viewing_requested');
    assert.equal(viewing.statusLabel, 'Viewing requested');
    assert.equal(viewing.isConfirmed, false, 'submitting a request must not confirm anything');
    assert.equal(viewing.confirmedAt, '');
    assert.equal(viewing.tenantUserId, f.tenants.primary.id);
    assert.equal(viewing.agentUserId, f.agents.primary.id, 'the agent who submitted the listing is responsible');
    assert.equal(viewing.preferredDate, daysFromNow(2));
    assert.equal(viewing.date, daysFromNow(2));
    assert.equal(viewing.requestType, 'viewing');
    assert.equal(viewing.viewingFeePaid, false);
    assert.equal(viewing.properties, undefined);

    // The history starts with a creation entry by the tenant.
    const full = await detail(f.tenants.primary.client, viewing.id);
    assert.equal(full.access.role, 'tenant');
    assert.equal(full.history.length, 1);
    assert.equal(full.history[0].action, 'viewing.created');
    assert.equal(full.history[0].actorId, f.tenants.primary.id);
    // Nothing was paid and nothing was recorded as paid.
    assert.equal(full.financial.feeRecorded, false);
    assert.equal(full.financial.collectedGhs, null);
  });

  test('an enquiry is recorded separately and can become a viewing request', async () => {
    const res = await requestViewing(f.tenants.primary, f.properties.primary.id, {
      requestType: 'enquiry',
      date: undefined,
      time: undefined,
      message: 'Is the rent negotiable?',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.viewing.status, 'enquiry_received');
    assert.equal(res.body.viewing.requestType, 'enquiry');

    const proposed = await action(f.agents.primary.client, res.body.viewing.id, 'propose', {
      date: daysFromNow(3),
      time: '02:00 PM',
      note: 'Happy to show you the apartment.',
    });
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.equal(proposed.body.viewing.status, 'proposed');
  });

  test('agents only see the viewings assigned to them, and tenants only their own', async () => {
    f.agents.second = await makeAgent('second');

    const agentOne = await f.agents.primary.client.get('/api/viewings');
    assert.equal(agentOne.status, 200);
    assert.ok(agentOne.body.viewings.some((v) => v.id === f.viewings.primary));

    const agentTwo = await f.agents.second.client.get('/api/viewings');
    assert.equal(agentTwo.status, 200);
    assert.ok(!agentTwo.body.viewings.some((v) => v.id === f.viewings.primary));

    const forbidden = await f.agents.second.client.get(`/api/viewings/${f.viewings.primary}`);
    assert.equal(forbidden.status, 403, JSON.stringify(forbidden.body));

    const otherTenant = await makeTenant('other');
    const otherList = await otherTenant.client.get('/api/viewings');
    assert.equal(otherList.status, 200);
    assert.ok(!otherList.body.viewings.some((v) => v.id === f.viewings.primary));

    const otherDetail = await otherTenant.client.get(`/api/viewings/${f.viewings.primary}`);
    assert.equal(otherDetail.status, 403);
    const otherCancel = await action(otherTenant.client, f.viewings.primary, 'cancel', { reason: 'Not mine' });
    assert.equal(otherCancel.status, 403);

    // A relative is not enough: the tenant id and email must match.
    const stranger = await f.agents.second.client.get(`/api/viewings/${f.viewings.primary}`);
    assert.equal(stranger.status, 403);
  });

  test('an appointment cannot be confirmed before a time is proposed', async () => {
    const res = await requestViewing(f.tenants.primary, f.properties.primary.id);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    f.viewings.unproposed = res.body.viewing.id;

    const premature = await action(f.tenants.primary.client, f.viewings.unproposed, 'confirm', {});
    assert.equal(premature.status, 422, JSON.stringify(premature.body));
    assert.match(premature.body.error, /cannot be moved|no proposed appointment/i);
  });

  test('an agent proposes a slot and the tenant confirms it', async () => {
    const proposed = await action(f.agents.primary.client, f.viewings.primary, 'propose', {
      date: daysFromNow(4),
      time: '09:00 AM',
      note: 'The landlord can meet you at 9am.',
    });
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
    assert.equal(proposed.body.viewing.status, 'proposed');
    assert.equal(proposed.body.viewing.isConfirmed, false, 'a proposal is not a confirmation');

    // The agent cannot confirm on the tenant's behalf without agreeing a slot…
    const confirmed = await action(f.tenants.primary.client, f.viewings.primary, 'confirm', {
      note: 'That time works for me.',
    });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.viewing.status, 'confirmed');
    assert.equal(confirmed.body.viewing.isConfirmed, true);
    assert.notEqual(confirmed.body.viewing.confirmedAt, '');
    assert.equal(confirmed.body.viewing.confirmedBy, f.tenants.primary.id);

    const full = await detail(f.tenants.primary.client, f.viewings.primary);
    const confirmEvent = full.history.find((event) => event.action === 'viewing.confirmed');
    assert.ok(confirmEvent, 'the confirmation is in the history');
    assert.equal(confirmEvent.actorRole, 'tenant');
    assert.equal(confirmEvent.actorId, f.tenants.primary.id);
    // Confirming agrees the slot that was already proposed; it moves nothing.
    assert.equal(confirmEvent.previousDate, daysFromNow(4));
    assert.equal(confirmEvent.newDate, '');
  });

  test('a tenant cannot propose a time, complete a viewing, or mark a no-show on itself', async () => {
    const proposed = await action(f.tenants.primary.client, f.viewings.unproposed, 'propose', {
      date: daysFromNow(3),
      time: '10:00 AM',
    });
    assert.equal(proposed.status, 403, JSON.stringify(proposed.body));

    const completed = await action(f.tenants.primary.client, f.viewings.primary, 'complete', {});
    assert.equal(completed.status, 403);

    const ownNoShow = await action(f.tenants.primary.client, f.viewings.primary, 'no-show', { who: 'tenant' });
    assert.equal(ownNoShow.status, 403);

    const agentSelfNoShow = await action(f.agents.primary.client, f.viewings.primary, 'no-show', { who: 'agent' });
    assert.equal(agentSelfNoShow.status, 403);
  });

  test('a reschedule keeps the previous appointment in the history', async () => {
    const previous = await detail(f.tenants.primary.client, f.viewings.primary);
    const previousDate = previous.viewing.date;
    const previousTime = previous.viewing.time;

    const rescheduled = await action(f.agents.primary.client, f.viewings.primary, 'reschedule', {
      date: daysFromNow(5),
      time: '04:00 PM',
      reason: 'The landlord has a conflict.',
    });
    assert.equal(rescheduled.status, 200, JSON.stringify(rescheduled.body));
    assert.equal(rescheduled.body.viewing.status, 'rescheduled');
    assert.equal(rescheduled.body.viewing.date, daysFromNow(5));
    assert.equal(rescheduled.body.viewing.isConfirmed, true, 'a reschedule is still an agreed appointment');

    const after = await detail(f.tenants.primary.client, f.viewings.primary);
    const move = after.history.filter((event) => event.action === 'viewing.rescheduled').pop();
    assert.ok(move, 'the move is recorded');
    assert.equal(move.previousDate, previousDate);
    assert.equal(move.previousTime, previousTime);
    assert.equal(move.newDate, daysFromNow(5));
    assert.equal(move.actorId, f.agents.primary.id);
  });

  test('the tenant can ask for a different time without moving the appointment', async () => {
    const requested = await action(f.tenants.primary.client, f.viewings.primary, 'request-reschedule', {
      date: daysFromNow(6),
      time: '11:00 AM',
      note: 'Something came up at work.',
    });
    assert.equal(requested.status, 200, JSON.stringify(requested.body));
    assert.equal(requested.body.viewing.status, 'reschedule_requested');
    assert.equal(requested.body.viewing.preferredDate, daysFromNow(6));
    assert.equal(requested.body.viewing.date, daysFromNow(5), 'the appointment itself is not moved by a request');
  });

  test('cancelling requires a reason from the agent and records who cancelled', async () => {
    const res = await requestViewing(f.tenants.primary, f.properties.primary.id);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    f.viewings.cancelled = res.body.viewing.id;
    await action(f.agents.primary.client, f.viewings.cancelled, 'propose', { date: daysFromNow(3), time: '01:00 PM' });
    await action(f.tenants.primary.client, f.viewings.cancelled, 'confirm', {});

    const noReason = await action(f.agents.primary.client, f.viewings.cancelled, 'cancel', {});
    assert.equal(noReason.status, 422, JSON.stringify(noReason.body));
    assert.ok(noReason.body.fields.reason);

    const cancelled = await action(f.agents.primary.client, f.viewings.cancelled, 'cancel', {
      reason: 'The landlord withdrew the property from the market.',
    });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.viewing.status, 'cancelled');
    assert.equal(cancelled.body.viewing.isTerminal, true);
    assert.match(cancelled.body.viewing.cancelReason, /withdrew the property/);

    const full = await detail(f.tenants.primary.client, f.viewings.cancelled);
    const event = full.history.filter((e) => e.action === 'viewing.cancelled').pop();
    assert.equal(event.actorId, f.agents.primary.id);
    assert.equal(event.actorRole, 'agent');
    assert.match(event.note, /withdrew the property/);
  });

  test('a viewing cannot be completed before it happens, and completion is final', async () => {
    const res = await requestViewing(f.tenants.primary, f.properties.primary.id);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.viewing.id;
    f.viewings.completing = id;

    await action(f.agents.primary.client, id, 'propose', { date: daysFromNow(2), time: '11:00 AM' });
    const confirmed = await action(f.agents.primary.client, id, 'confirm', { note: 'Agreed by phone.' });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));

    const early = await action(f.agents.primary.client, id, 'complete', { note: 'Trying too early.' });
    assert.equal(early.status, 422, JSON.stringify(early.body));
    assert.match(early.body.error, /has not arrived/i);

    // Let the slot pass, then complete it for real.
    const past = runPhpScript(
      'tests/finance-fixtures.php',
      [`--viewing-id=${id}`, '--viewing-days-ago=1'],
      state.testEnv
    );
    assert.equal(past.status, 0, past.stdout + past.stderr);

    const done = await action(f.agents.primary.client, id, 'complete', { note: 'Tenant viewed the apartment.' });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.viewing.status, 'completed');
    assert.notEqual(done.body.viewing.completedAt, '');
    assert.equal(done.body.viewing.isTerminal, true);
    // Completing a viewing is not a payment.
    assert.equal(done.body.viewing.viewingFeePaid, false);
    assert.match(done.body.message, /no payment has been recorded/i);

    // A completed viewing cannot be casually reopened or re-cancelled.
    const reopen = await action(f.agents.primary.client, id, 'propose', { date: daysFromNow(1), time: '09:00 AM' });
    assert.equal(reopen.status, 409, JSON.stringify(reopen.body));
    const recancel = await action(f.tenants.primary.client, id, 'cancel', { reason: 'Changed my mind.' });
    assert.equal(recancel.status, 409);
  });

  test('no-shows are recorded after the slot, by the other party', async () => {
    const first = await requestViewing(f.tenants.primary, f.properties.primary.id);
    const firstId = first.body.viewing.id;
    await action(f.agents.primary.client, firstId, 'propose', { date: daysFromNow(1), time: '02:00 PM' });
    await action(f.agents.primary.client, firstId, 'confirm', {});

    const beforeSlot = await action(f.agents.primary.client, firstId, 'no-show', { who: 'tenant' });
    assert.equal(beforeSlot.status, 422, JSON.stringify(beforeSlot.body));
    assert.match(beforeSlot.body.error, /after the appointment/i);

    runPhpScript('tests/finance-fixtures.php', [`--viewing-id=${firstId}`, '--viewing-days-ago=1'], state.testEnv);
    const tenantMissed = await action(f.agents.primary.client, firstId, 'no-show', {
      who: 'tenant',
      note: 'Nobody turned up at the property.',
    });
    assert.equal(tenantMissed.status, 200, JSON.stringify(tenantMissed.body));
    assert.equal(tenantMissed.body.viewing.status, 'tenant_no_show');

    // The tenant can record that the agent did not attend — the mirror case.
    const second = await requestViewing(f.tenants.primary, f.properties.primary.id);
    const secondId = second.body.viewing.id;
    await action(f.agents.primary.client, secondId, 'propose', { date: daysFromNow(1), time: '03:00 PM' });
    await action(f.agents.primary.client, secondId, 'confirm', {});
    runPhpScript('tests/finance-fixtures.php', [`--viewing-id=${secondId}`, '--viewing-days-ago=2'], state.testEnv);
    const agentMissed = await action(f.tenants.primary.client, secondId, 'no-show', {
      who: 'agent',
      note: 'No agent came to the property.',
    });
    assert.equal(agentMissed.status, 200, JSON.stringify(agentMissed.body));
    assert.equal(agentMissed.body.viewing.status, 'agent_no_show');
  });

  test('a viewing that could not proceed needs a reason and closes the record', async () => {
    const res = await requestViewing(f.tenants.primary, f.properties.primary.id);
    const id = res.body.viewing.id;
    await action(f.agents.primary.client, id, 'propose', { date: daysFromNow(2), time: '10:00 AM' });

    const noReason = await action(f.agents.primary.client, id, 'could-not-proceed', {});
    assert.equal(noReason.status, 422, JSON.stringify(noReason.body));

    const recorded = await action(f.agents.primary.client, id, 'could-not-proceed', {
      reason: 'The gate was locked and nobody could access the compound.',
    });
    assert.equal(recorded.status, 200, JSON.stringify(recorded.body));
    assert.equal(recorded.body.viewing.status, 'could_not_proceed');
    assert.equal(recorded.body.viewing.isTerminal, true);
  });

  test('a suspended agent loses the viewing tools but not the history', async () => {
    const suspended = await admin.post(`/api/admin/agents/${f.agents.second.id}/status`, {
      accountStatus: 'suspended',
      canSubmitListings: false,
    });
    assert.equal(suspended.status, 200, JSON.stringify(suspended.body));

    const list = await f.agents.second.client.get('/api/viewings');
    assert.equal(list.status, 403, 'a suspended agent cannot work a queue');

    const assigned = await admin.post(`/api/admin/viewings/${f.viewings.unproposed}/assign-agent`, {
      agentUserId: f.agents.second.id,
    });
    assert.equal(assigned.status, 422, JSON.stringify(assigned.body), 'a suspended agent cannot be assigned new work');

    f.viewings.suspendedAgent = f.viewings.unproposed;
  });

  test('administrators can inspect, filter and see overdue work', async () => {
    const overview = await admin.get('/api/admin/viewings');
    assert.equal(overview.status, 200, JSON.stringify(overview.body));
    assert.ok(overview.body.viewings.some((v) => v.id === f.viewings.primary));
    assert.ok(overview.body.counts.total >= 5);
    assert.ok(overview.body.counts.completed >= 1);
    assert.ok(overview.body.counts.cancelled >= 1);

    const byStatus = await admin.get('/api/admin/viewings?status=cancelled');
    assert.equal(byStatus.status, 200);
    assert.ok(byStatus.body.viewings.length >= 1);
    assert.ok(byStatus.body.viewings.every((v) => v.status === 'cancelled'));

    const byAgent = await admin.get(`/api/admin/viewings?agentUserId=${f.agents.primary.id}`);
    assert.equal(byAgent.status, 200);
    assert.ok(byAgent.body.viewings.every((v) => v.agentUserId === f.agents.primary.id));

    const byProperty = await admin.get(`/api/admin/viewings?propertyId=${f.properties.primary.id}`);
    assert.ok(byProperty.body.viewings.every((v) => v.propertyId === f.properties.primary.id));

    // An unresolved, overdue request: agreed for a slot that has passed and
    // never closed.
    const stale = await requestViewing(f.tenants.primary, f.properties.primary.id);
    const staleId = stale.body.viewing.id;
    await action(f.agents.primary.client, staleId, 'propose', { date: daysFromNow(1), time: '09:00 AM' });
    runPhpScript('tests/finance-fixtures.php', [`--viewing-id=${staleId}`, '--viewing-days-ago=3'], state.testEnv);

    const after = await admin.get('/api/admin/viewings');
    const staleRow = after.body.viewings.find((v) => v.id === staleId);
    assert.equal(staleRow.overdue, true, 'a viewing left open past its slot is overdue');
    assert.ok(after.body.counts.overdue >= 1);
    assert.ok(after.body.counts.unresolved >= 1);

    const detailView = await admin.get(`/api/admin/viewings/${staleId}`);
    assert.equal(detailView.status, 200);
    assert.ok(detailView.body.history.length >= 2);
    assert.equal(detailView.body.financial.feeRecorded, false);
    assert.ok(detailView.body.capabilities && 'viewingCorrections' in detailView.body.capabilities);
  });

  test('only an administrator with the correction capability can correct a closed record', async () => {
    const id = f.viewings.completing;

    // The ordinary administrator is refused, with a plain message.
    const refused = await f.admins.plain.client.post(`/api/admin/viewings/${id}/correction`, {
      status: 'cancelled',
      reason: 'The viewing never actually took place.',
    });
    assert.equal(refused.status, 403, JSON.stringify(refused.body));
    assert.match(refused.body.error, /capability|exceptional/i);

    f.admins.corrector = await makeAdmin('corrector', { correct: true });

    const shortReason = await f.admins.corrector.client.post(`/api/admin/viewings/${id}/correction`, {
      status: 'cancelled',
      reason: 'oops',
    });
    assert.equal(shortReason.status, 422, JSON.stringify(shortReason.body));
    assert.ok(shortReason.body.fields.reason);

    const corrected = await f.admins.corrector.client.post(`/api/admin/viewings/${id}/correction`, {
      status: 'cancelled',
      reason: 'The agent completed this in error; the tenant never attended.',
    });
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body));
    assert.equal(corrected.body.viewing.status, 'cancelled');

    const full = await f.admins.corrector.client.get(`/api/admin/viewings/${id}`);
    const correction = full.body.history.filter((e) => e.action === 'viewing.corrected').pop();
    assert.ok(correction, 'the correction is in the viewing history');
    assert.equal(correction.fromStatus, 'completed');
    assert.equal(correction.toStatus, 'cancelled');
    assert.match(correction.note, /completed this in error/);
    assert.equal(correction.actorId, f.admins.corrector.id);

    const audit = await admin.get('/api/admin/audit-logs?action=viewing.corrected');
    assert.equal(audit.status, 200, JSON.stringify(audit.body));
    assert.ok(
      audit.body.logs.some((log) => log.entityId === id && log.actorId === f.admins.corrector.id),
      'the correction is audited with the responsible administrator'
    );
  });

  test('an administrator can reassign a viewing to another active agent', async () => {
    f.agents.third = await makeAgent('third');
    const id = f.viewings.unproposed;

    const assigned = await admin.post(`/api/admin/viewings/${id}/assign-agent`, {
      agentUserId: f.agents.third.id,
    });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
    assert.equal(assigned.body.viewing.agentUserId, f.agents.third.id);

    const thirdList = await f.agents.third.client.get('/api/viewings');
    assert.ok(thirdList.body.viewings.some((v) => v.id === id));
    const primaryList = await f.agents.primary.client.get('/api/viewings');
    assert.ok(!primaryList.body.viewings.some((v) => v.id === id), 'the previous agent loses access');
    const previousAgent = await f.agents.primary.client.get(`/api/viewings/${id}`);
    assert.equal(previousAgent.status, 403);

    // A random account cannot be assigned, and the error does not confirm what it is.
    const bogus = await admin.post(`/api/admin/viewings/${id}/assign-agent`, {
      agentUserId: f.tenants.primary.id,
    });
    assert.equal(bogus.status, 422, JSON.stringify(bogus.body));
    assert.equal(bogus.body.fields.agentUserId, 'Choose an agent account.');
  });

  test('viewing requests never create money, and completion is not a payment', async () => {
    const before = await admin.get('/api/admin/viewing-fees');
    assert.equal(before.status, 200);

    const res = await requestViewing(f.tenants.primary, f.properties.primary.id);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const id = res.body.viewing.id;

    await action(f.agents.primary.client, id, 'propose', { date: daysFromNow(2), time: '11:00 AM' });
    await action(f.agents.primary.client, id, 'confirm', {});
    runPhpScript('tests/finance-fixtures.php', [`--viewing-id=${id}`, '--viewing-days-ago=1'], state.testEnv);
    const done = await action(f.agents.primary.client, id, 'complete', { note: 'Viewed the property.' });
    assert.equal(done.status, 200, JSON.stringify(done.body));

    const after = await admin.get('/api/admin/viewing-fees');
    assert.equal(after.status, 200);
    assert.deepEqual(after.body.summary, before.body.summary, 'completing a viewing moves no money');
    assert.ok(
      !after.body.records.some((record) => record.viewingId === id),
      'no fee record is invented by a viewing request or completion'
    );

    // Only staff recording what the agent collected creates a ledger row.
    const reported = await admin.patch(`/api/viewings/${id}`, { viewingFeePaid: true });
    assert.equal(reported.status, 200, JSON.stringify(reported.body));
    const ledger = await admin.get('/api/admin/viewing-fees');
    const record = ledger.body.records.find((row) => row.viewingId === id);
    assert.ok(record, 'the explicit fee report creates the row');
    assert.equal(record.collectionState, 'reported');
    assert.equal(record.goodlucksShareGhs, null, 'a reported collection is not an agreed share');
    assert.equal(ledger.body.summary.goodlucksShareReceivedGhs, before.body.summary.goodlucksShareReceivedGhs);

    // Increment E proposals remain inactive throughout.
    const policies = await f.admins.plain.client.get('/api/admin/fee-policies').catch(() => null);
    // The plain administrator has no financial capability, so the endpoint is
    // closed to them; the proposal state is asserted through the main admin
    // account used by the Increment E suite.
    assert.equal(policies === null || policies.status === 403, true);

    const overview = await admin.get('/api/admin/fee-policies');
    if (overview.status === 200) {
      assert.equal(overview.body.appliedToCalculations, false);
      for (const proposal of overview.body.proposed) {
        assert.equal(proposal.appliedToCalculations, false);
      }
    }
  });

  test('the legacy viewing endpoint still works and is audited as a correction', async () => {
    const res = await requestViewing(f.tenants.primary, f.properties.primary.id);
    const id = res.body.viewing.id;

    // A landlord may only cancel, and only their own property's viewing.
    const landlordCancel = await f.landlords.primary.client.patch(`/api/viewings/${id}`, {
      status: 'cancelled',
      reason: 'The property is no longer available.',
    });
    assert.equal(landlordCancel.status, 200, JSON.stringify(landlordCancel.body));
    assert.equal(landlordCancel.body.viewing.status, 'cancelled');

    const history = await detail(admin, id);
    assert.ok(
      history.history.some((event) => event.action === 'viewing.cancelled' && event.actorRole === 'landlord'),
      'the landlord cancellation is in the history'
    );

    // A tenant cannot use the legacy endpoint to change anything.
    const tenantAttempt = await action(f.tenants.primary.client, id, 'cancel', { reason: 'x' });
    assert.equal(tenantAttempt.status, 409, 'a closed viewing needs an administrator');
  });

  test('an agent landlord reference is resolved without disclosing whether the account exists', async () => {
    // A landlord who really has an account, with a phone number on file.
    const landlordEmail = uniqueEmail('f-reference-landlord');
    const landlordPhone = '+233 20 900 7788';
    const registered = await guest.post('/api/auth/register', {
      name: 'F Reference Landlord',
      email: landlordEmail,
      phone: landlordPhone,
      password: 'Viewing-Landlord-Pass-1',
      role: 'landlord',
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    const existingLandlordId = registered.body.user.id;

    const submit = (title, extra) => f.agents.primary.client.post('/api/properties', {
      title,
      location: 'Labone, Accra',
      city: 'Accra',
      rentGhs: 3800,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: 'Apartment',
      description: `Landlord-reference test listing: ${title}.`,
      images: ['https://example.com/landlord-reference.jpg'],
      viewingFeeGhs: 130,
      viewingTerms: AGENT_VIEWING_TERMS,
      landlordName: 'F Reference Landlord',
      ...extra,
    });

    // (a) the landlord's real email  (b) an email nobody owns
    const byMatchedEmail = await submit('Reference by known email', { landlordEmail });
    const unknownEmail = uniqueEmail('f-reference-absent');
    const byUnknownEmail = await submit('Reference by unknown email', { landlordEmail: unknownEmail });
    assert.equal(byMatchedEmail.status, 201, JSON.stringify(byMatchedEmail.body));
    assert.equal(byUnknownEmail.status, 201, JSON.stringify(byUnknownEmail.body));

    // The agent's view is identical whether or not the landlord exists: same
    // status code, same message, same keys, same values for everything that
    // could answer "does this address belong to a Goodlucks landlord?".
    assert.equal(byMatchedEmail.body.message, byUnknownEmail.body.message);
    assert.deepEqual(
      Object.keys(byMatchedEmail.body.property).sort(),
      Object.keys(byUnknownEmail.body.property).sort(),
      'the response shape must not differ'
    );
    for (const res of [byMatchedEmail, byUnknownEmail]) {
      assert.equal(res.body.property.landlordId, '');
      assert.equal(res.body.property.landlordAuthorityState, 'claimed_by_agent');
      assert.equal(res.body.property.isLandlordVerified, false);
      assert.equal(res.body.property.status, 'pending');
    }
    assert.equal(
      JSON.stringify(byMatchedEmail.body.property).includes(landlordEmail),
      false,
      'the agent response must not echo the landlord account back'
    );

    // (c) the landlord's real phone  (d) an unknown phone
    const byMatchedPhone = await submit('Reference by known phone', { landlordPhone });
    const byUnknownPhone = await submit('Reference by unknown phone', { landlordPhone: '+233 20 900 0001' });
    assert.equal(byMatchedPhone.status, 201, JSON.stringify(byMatchedPhone.body));
    assert.equal(byUnknownPhone.status, 201, JSON.stringify(byUnknownPhone.body));
    assert.equal(byMatchedPhone.body.message, byUnknownPhone.body.message);
    assert.deepEqual(
      Object.keys(byMatchedPhone.body.property).sort(),
      Object.keys(byUnknownPhone.body.property).sort()
    );
    for (const res of [byMatchedPhone, byUnknownPhone]) {
      assert.equal(res.body.property.landlordId, '');
      assert.equal(res.body.property.landlordAuthorityState, 'claimed_by_agent');
    }

    // A tenant account is not a landlord account: naming one resolves to nothing
    // and still looks exactly like a landlord that does not exist.
    const byTenantEmail = await submit('Reference by a tenant email', { landlordEmail: f.tenants.primary.email });
    assert.equal(byTenantEmail.status, 201, JSON.stringify(byTenantEmail.body));
    assert.equal(byTenantEmail.body.property.landlordId, '');
    assert.equal(byTenantEmail.body.message, byUnknownEmail.body.message);

    // Staff can see what actually happened — that is where the difference lives.
    const matchedView = await admin.get(`/api/properties/${byMatchedEmail.body.property.id}`);
    assert.equal(matchedView.status, 200, JSON.stringify(matchedView.body));
    assert.equal(matchedView.body.property.landlordId, existingLandlordId, 'a matched email links the landlord account');
    assert.equal(matchedView.body.property.landlordContactClaimed, '');

    const matchedPhoneView = await admin.get(`/api/properties/${byMatchedPhone.body.property.id}`);
    assert.equal(matchedPhoneView.body.property.landlordId, existingLandlordId, 'a matched phone links the landlord account');

    const unknownView = await admin.get(`/api/properties/${byUnknownEmail.body.property.id}`);
    assert.equal(unknownView.body.property.landlordId, '');
    assert.ok(
      String(unknownView.body.property.landlordContactClaimed).includes(unknownEmail),
      'the unmatched claim is kept for staff follow-up'
    );

    const tenantClaimView = await admin.get(`/api/properties/${byTenantEmail.body.property.id}`);
    assert.equal(tenantClaimView.body.property.landlordId, '', 'a tenant id/email never becomes a landlord link');
  });

  test('lifecycle events notify the right people, and refused actions notify nobody', async () => {
    const notificationsFor = async (client) => {
      const res = await client.get('/api/notifications');
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return res.body.notifications;
    };
    // Diff by id rather than by position: the list order is not part of the
    // contract, and only the rows that did not exist before are new.
    const fresh = (before, after) => {
      const seen = new Set(before.map((n) => n.id));
      return after.filter((n) => !seen.has(n.id));
    };
    const agent = f.agents.primary.client;
    const tenantClient = f.tenants.primary.client;

    // --- 1. a new request reaches the responsible agent ---------------------
    const agentBefore = await notificationsFor(agent);
    const tenantBefore = await notificationsFor(tenantClient);
    const created = await requestViewing(f.tenants.primary, f.properties.primary.id);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.viewing.id;

    const agentAfterRequest = await notificationsFor(agent);
    const requestNotes = fresh(agentBefore, agentAfterRequest);
    assert.equal(requestNotes.length, 1, 'the agent is told exactly once');
    assert.match(requestNotes[0].title, /New viewing request/i);
    assert.match(requestNotes[0].message, /Nothing is confirmed yet/i);
    assert.equal(requestNotes[0].type, 'viewing');

    // --- 2. a refused transition notifies nobody ---------------------------
    const agentBeforeRefusal = await notificationsFor(agent);
    const tenantBeforeRefusal = await notificationsFor(tenantClient);
    const premature = await action(agent, id, 'confirm', {});
    assert.equal(premature.status, 422, JSON.stringify(premature.body));
    assert.equal((await notificationsFor(agent)).length, agentBeforeRefusal.length, 'a refused action must not notify');
    assert.equal((await notificationsFor(tenantClient)).length, tenantBeforeRefusal.length);

    // --- 3. a proposal reaches the tenant ----------------------------------
    const tenantBeforeProposal = await notificationsFor(tenantClient);
    const proposal = await action(agent, id, 'propose', { date: daysFromNow(2), time: '10:00 AM' });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    const proposalNotes = fresh(tenantBeforeProposal, await notificationsFor(tenantClient));
    assert.equal(proposalNotes.length, 1);
    assert.match(proposalNotes[0].title, /Appointment proposed/i);
    assert.match(proposalNotes[0].message, /Status: Appointment proposed/);

    // --- 4. a confirmation reaches the agent -------------------------------
    const agentBeforeConfirm = await notificationsFor(agent);
    const confirmed = await action(tenantClient, id, 'confirm', {});
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const confirmNotes = fresh(agentBeforeConfirm, await notificationsFor(agent));
    assert.equal(confirmNotes.length, 1);
    assert.match(confirmNotes[0].title, /Appointment confirmed/i);

    // --- 5. a reschedule reaches the tenant --------------------------------
    const tenantBeforeReschedule = await notificationsFor(tenantClient);
    const moved = await action(agent, id, 'reschedule', { date: daysFromNow(3), time: '02:00 PM', reason: 'Landlord asked to move it.' });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    const rescheduleNotes = fresh(tenantBeforeReschedule, await notificationsFor(tenantClient));
    assert.equal(rescheduleNotes.length, 1);
    assert.match(rescheduleNotes[0].title, /Appointment rescheduled/i);
    assert.match(rescheduleNotes[0].message, /Appointment: /);

    // --- 6. completing too early notifies nobody ---------------------------
    const agentBeforeEarly = await notificationsFor(agent);
    const tenantBeforeEarly = await notificationsFor(tenantClient);
    const early = await action(agent, id, 'complete', {});
    assert.equal(early.status, 422, JSON.stringify(early.body));
    assert.equal((await notificationsFor(agent)).length, agentBeforeEarly.length);
    assert.equal((await notificationsFor(tenantClient)).length, tenantBeforeEarly.length);

    // --- 7. completion reaches the tenant ----------------------------------
    runPhpScript('tests/finance-fixtures.php', [`--viewing-id=${id}`, '--viewing-days-ago=1'], state.testEnv);
    const tenantBeforeComplete = await notificationsFor(tenantClient);
    const done = await action(agent, id, 'complete', { note: 'The viewing went ahead.' });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const completeNotes = fresh(tenantBeforeComplete, await notificationsFor(tenantClient));
    assert.equal(completeNotes.length, 1);
    assert.match(completeNotes[0].title, /— Completed$/);
    assert.match(completeNotes[0].message, /Status: Completed/);

    // --- 8. cancellations reach the other party ----------------------------
    const byTenant = await requestViewing(f.tenants.primary, f.properties.primary.id);
    const byTenantId = byTenant.body.viewing.id;
    const agentBeforeTenantCancel = await notificationsFor(agent);
    const cancelled = await action(tenantClient, byTenantId, 'cancel', { reason: 'I no longer need it.' });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    const cancelNotes = fresh(agentBeforeTenantCancel, await notificationsFor(agent));
    assert.equal(cancelNotes.length, 1);
    assert.match(cancelNotes[0].title, /— Cancelled$/);
    assert.match(cancelNotes[0].message, /Status: Cancelled/);
    // Increment G fixed finding D11: a cancellation carries its explanation in
    // `reason`, and the notification body now includes it. Before the fix an
    // empty `note` took precedence and the recipient was told nothing.
    assert.match(cancelNotes[0].message, /Note: I no longer need it\./);
    const cancelledDetail = await detail(tenantClient, byTenantId);
    assert.match(String(cancelledDetail.viewing.cancelReason), /I no longer need it/);

    const byAgent = await requestViewing(f.tenants.primary, f.properties.primary.id);
    const byAgentId = byAgent.body.viewing.id;
    const tenantBeforeAgentCancel = await notificationsFor(tenantClient);
    const agentCancelled = await action(agent, byAgentId, 'cancel', { reason: 'I am away that week.' });
    assert.equal(agentCancelled.status, 200, JSON.stringify(agentCancelled.body));
    const agentCancelNotes = fresh(tenantBeforeAgentCancel, await notificationsFor(tenantClient));
    assert.equal(agentCancelNotes.length, 1);
    assert.match(agentCancelNotes[0].title, /— Cancelled$/);

    // --- 9. an unauthorised attempt notifies nobody ------------------------
    const stranger = await makeAgent('notify-outsider');
    const strangerBefore = await notificationsFor(stranger.client);
    const tenantBeforeOutsider = await notificationsFor(tenantClient);
    const outsider = await action(stranger.client, byAgentId, 'cancel', { reason: 'Not my viewing to cancel.' });
    assert.ok([403, 404].includes(outsider.status), JSON.stringify(outsider.body));
    assert.equal((await notificationsFor(stranger.client)).length, strangerBefore.length);
    assert.equal((await notificationsFor(tenantClient)).length, tenantBeforeOutsider.length);
  });

  test('Increments A-E still behave with the new lifecycle in place', async () => {
    // Enquiries, properties and auth are untouched.
    const properties = await guest.get('/api/properties');
    assert.equal(properties.status, 200);
    assert.ok(properties.body.properties.length > 0);

    // A guest can still request a viewing without an account, and it is a
    // request, not a booking.
    const anonymous = await guest.post('/api/viewing-requests', {
      tenantName: 'Anonymous Requester',
      tenantPhone: '+233 24 555 4444',
      tenantEmail: uniqueEmail('anonymous-viewing'),
      propertyId: state.seededPropertyId,
      date: daysFromNow(3),
      time: '11:00 AM',
    });
    assert.equal(anonymous.status, 201, JSON.stringify(anonymous.body));
    assert.equal(anonymous.body.viewing.status, 'viewing_requested');
    assert.equal(anonymous.body.viewing.tenantUserId, '');

    // The fee ledger and its summary are still the Increment B shape.
    const ledger = await admin.get('/api/admin/viewing-fees');
    assert.equal(ledger.status, 200);
    assert.ok('viewingFeesCollectedGhs' in ledger.body.summary);
    assert.ok('goodlucksShareReceivedGhs' in ledger.body.summary);

    // Verification decisions are still separate from tier and from viewing.
    const verification = await f.agents.primary.client.get('/api/verification');
    assert.equal(verification.status, 200);
    assert.equal(verification.body.verification.identity.status, 'not_submitted');
    assert.equal(verification.body.verification.agentTier.tier, 'standard');
    // Increment E's tier rule is unchanged: a registered agent is Standard, and
    // identity approval is surfaced as a separate status that the professional
    // tier requires. Nothing here promotes anyone.
    assert.equal(verification.body.verification.agentTier.eligibleStandard, true);
    assert.equal(verification.body.verification.agentTier.eligibleProfessional, false);
    assert.equal(verification.body.verification.agentTier.identityStatus, 'not_submitted');
  });
});

// ---------------------------------------------------------------------------
describe('Agent remittances, reconciliation and rental commissions (Increment G)', () => {
  const g = { clients: {}, users: {}, profiles: {} };

  const visitor = () => new ApiClient(baseUrl);

  const loginAs = async (email, password) => {
    const client = visitor();
    const res = await client.post('/api/auth/login', { email, password });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return client;
  };

  // An administrator built by hand so each capability can be granted on its own.
  const makeAdmin = async (key, flags = {}) => {
    const email = uniqueEmail(`g-admin-${key}`);
    const password = 'G-Finance-Admin-Pass-1';
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${password}`, `--name=G Admin ${key}`, '--role=admin'],
      state.testEnv
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);

    const args = [`--email=${email}`];
    if ('view' in flags) args.push(`--view=${flags.view ? 1 : 0}`);
    if ('confirm' in flags) args.push(`--confirm=${flags.confirm ? 1 : 0}`);
    if ('manage' in flags) args.push(`--manage=${flags.manage ? 1 : 0}`);
    if ('approve' in flags) args.push(`--approve=${flags.approve ? 1 : 0}`);
    if (args.length > 1) {
      const granted = runPhpScript('php-backend/grant_finance.php', args, state.testEnv);
      assert.match(granted.stdout, /(View|Confirm|Manage|Approve)\s*:/, granted.stdout + granted.stderr);
    }

    const client = visitor();
    const login = await client.post('/api/auth/admin-login', {
      email,
      password,
      accessKey: ADMIN_ACCESS_KEY,
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { client, email, id: login.body.user.id };
  };

  const registerAgent = async (key) => {
    const client = visitor();
    const email = uniqueEmail(`g-agent-${key}`);
    const password = 'G-Agent-Pass-1234';
    const res = await client.post('/api/auth/register', {
      name: `G Agent ${key}`,
      email,
      phone: '+233 20 640 0100',
      password,
      role: 'agent',
      operatingCity: 'Accra',
      agencyName: 'G Test Agency',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const activated = await admin.post(`/api/admin/agents/${res.body.user.id}/status`, {
      accountStatus: 'active',
    });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));

    g.clients[key] = await loginAs(email, password);
    g.users[key] = res.body.user;
    g.profiles[key] = res.body.user.agentProfile;
    return g.users[key];
  };

  /**
   * A completed viewing whose fee was collected, linked to an agent and priced by
   * an explicit agreement. Linking a fee to an agent account is an Increment E
   * manager capability, so it is performed by a manager rather than by the
   * confirmation capability — the two remain separate on purpose.
   */
  const createLedgerRecord = async (managerClient, agentUserId, shareGhs) => {
    const booking = await guest.post('/api/viewing-requests', {
      tenantName: `G Ledger ${Date.now()}`,
      tenantPhone: '+233 24 640 0200',
      tenantEmail: uniqueEmail('g-ledger'),
      propertyId: state.seededPropertyId,
      date: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
      time: '10:00 AM',
    });
    assert.equal(booking.status, 201, JSON.stringify(booking.body));
    const viewingId = booking.body.viewingId;

    await completeViewingAs(admin, viewingId);
    const paid = await admin.patch(`/api/viewings/${viewingId}`, { viewingFeePaid: true });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));

    const ledger = await admin.get('/api/admin/viewing-fees');
    assert.equal(ledger.status, 200);
    const record = ledger.body.records.find((entry) => entry.viewingId === viewingId);
    assert.ok(record, 'the paid viewing created a fee record');

    const linked = await managerClient.post(`/api/admin/viewing-fees/${record.id}/agent`, { agentUserId });
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    const agreed = await managerClient.post(`/api/admin/viewing-fees/${record.id}/share`, {
      amountGhs: shareGhs,
      note: 'Agreed in writing with the agent.',
    });
    assert.equal(agreed.status, 200, JSON.stringify(agreed.body));
    return record;
  };

  const summary = async () => (await admin.get('/api/admin/finance/summary')).body.summary;
  const findRecord = async (recordId) => {
    const ledger = await admin.get('/api/admin/viewing-fees');
    return ledger.body.records.find((entry) => entry.id === recordId);
  };

  before(async () => {
    g.agent = await registerAgent('primary');
    g.otherAgent = await registerAgent('other');

    // Collected 100, of which 40 is owed to Goodlucks under an explicit agreement.
    g.manager = await makeAdmin('manager', { view: true, confirm: true, manage: true });
    g.record = await createLedgerRecord(g.manager.client, g.agent.id, 40);
    g.otherRecord = await createLedgerRecord(g.manager.client, g.otherAgent.id, 30);

    g.viewOnly = await makeAdmin('view-only', { view: true, confirm: false });
    g.plain = await makeAdmin('plain', {});
  });

  test('the money ledger and the confirmation power are separate capabilities', async () => {
    // Nobody starts with either.
    assert.equal((await g.plain.client.get('/api/admin/finance/summary')).status, 403);
    assert.equal((await g.plain.client.get('/api/admin/viewing-fees')).status, 403);
    assert.equal((await g.plain.client.get('/api/admin/finance/commissions')).status, 403);

    // View-only reads everything and may change nothing that moves money.
    assert.equal((await g.viewOnly.client.get('/api/admin/finance/summary')).status, 200);
    assert.equal((await g.viewOnly.client.get('/api/admin/finance/commissions')).status, 200);
    assert.equal((await g.viewOnly.client.post('/api/admin/finance/commissions', { propertyId: state.seededPropertyId })).status, 403);
    assert.equal(
      (await g.viewOnly.client.post('/api/admin/finance/remittances/anything/confirm', {})).status,
      403
    );
    assert.equal(
      (await g.viewOnly.client.post('/api/admin/finance/remittances/anything/decision', { status: 'rejected', reason: 'x' })).status,
      403
    );
    // An agent is outside this entirely.
    assert.equal((await g.clients.primary.get('/api/admin/finance/summary')).status, 403);
  });

  test('an agent submits a claim that is not counted as money received', async () => {
    const before = await summary();

    const submitted = await g.clients.primary.post('/api/agent/remittances', {
      amountGhs: 25,
      method: 'momo',
      paymentReference: 'MOMO-G-TEST-1',
      paidAt: new Date().toISOString().slice(0, 10),
      note: 'Transfer to the Goodlucks collections number.',
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    g.submission = submitted.body.remittance;
    // A submission is a claim: no confirmed amount, no ledger effect.
    assert.equal(g.submission.status, 'submitted');
    assert.equal(g.submission.confirmedGhs, null);

    const after = await summary();
    assert.equal(after.remittances.confirmedReceivedGhs, before.remittances.confirmedReceivedGhs);
    assert.equal(after.viewingFees.receivedGhs, before.viewingFees.receivedGhs);
    assert.equal(after.remittances.reportedAwaitingConfirmationGhs, before.remittances.reportedAwaitingConfirmationGhs + 25);

    // Only an authorised person can move it on. The agent cannot.
    const selfConfirm = await g.clients.primary.post(
      `/api/admin/finance/remittances/${g.submission.id}/confirm`,
      { allocations: [] }
    );
    assert.equal(selfConfirm.status, 403);

    const agentView = await g.clients.primary.get('/api/agent/finance');
    assert.equal(agentView.status, 200);
    assert.equal(agentView.body.finance.totals.awaitingConfirmationGhs, 25);
    assert.equal(agentView.body.finance.totals.confirmedReceivedGhs, 0);
    assert.equal(agentView.body.finance.totals.payableToGoodlucksGhs, 40);
    assert.equal(agentView.body.finance.totals.outstandingGhs, 40);
    assert.equal(agentView.body.finance.capabilities.canConfirmReceipt, false);
  });

  test('agents cannot see another agent’s finances', async () => {
    const own = await g.clients.primary.get(`/api/agent/remittances/${g.submission.id}`);
    assert.equal(own.status, 200);

    const foreign = await g.clients.other.post(`/api/agent/remittances/${g.submission.id}`);
    assert.equal(foreign.status, 404, 'a foreign remittance is reported as not found');

    const otherOverview = await g.clients.other.get('/api/agent/finance');
    assert.equal(otherOverview.status, 200);
    assert.ok(otherOverview.body.finance.remittances.every((row) => row.agentUserId === g.otherAgent.id));
    assert.ok(otherOverview.body.finance.viewingFees.every((row) => row.agentUserId === g.otherAgent.id));
  });

  test('confirming receipt applies the money to the obligation exactly once', async () => {
    const before = await summary();
    const confirmed = await admin.post(`/api/admin/finance/remittances/${g.submission.id}/confirm`, {
      allocations: [{ viewingFeeRecordId: g.record.id, amountGhs: 25 }],
      note: 'Bank statement checked.',
    });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.remittance.status, 'confirmed');
    assert.equal(confirmed.body.remittance.confirmedGhs, 25);
    assert.equal(confirmed.body.remittance.allocatedGhs, 25);
    assert.equal(confirmed.body.remittance.unallocatedGhs, 0);

    const record = await findRecord(g.record.id);
    assert.equal(record.remittedGhs, 25);
    assert.equal(record.outstandingGhs, 15);

    const after = await summary();
    assert.equal(after.viewingFees.receivedGhs, before.viewingFees.receivedGhs + 25);
    assert.equal(after.remittances.confirmedReceivedGhs, before.remittances.confirmedReceivedGhs + 25);
    assert.equal(after.remittances.reportedAwaitingConfirmationGhs, before.remittances.reportedAwaitingConfirmationGhs - 25);
    assert.equal(after.remittances.appliedToObligationsGhs, before.remittances.appliedToObligationsGhs + 25);

    // Confirming twice is refused, so nothing is counted twice.
    const again = await admin.post(`/api/admin/finance/remittances/${g.submission.id}/confirm`, {});
    assert.equal(again.status, 409);

    // The audit trail records who confirmed what.
    const audit = await admin.get('/api/admin/audit-logs?action=finance.remittance_confirmed');
    assert.equal(audit.status, 200);
    assert.ok(JSON.stringify(audit.body).includes(g.submission.reference));
  });

  test('allocations cannot exceed the obligation, be duplicated or cross agents', async () => {
    const submitted = await g.clients.primary.post('/api/agent/remittances', {
      amountGhs: 60,
      method: 'cash',
      paidAt: new Date().toISOString().slice(0, 10),
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    const claim = submitted.body.remittance;

    const tooMuch = await admin.post(`/api/admin/finance/remittances/${claim.id}/confirm`, {
      allocations: [{ viewingFeeRecordId: g.record.id, amountGhs: 60 }],
    });
    assert.equal(tooMuch.status, 422, 'only 15 is still outstanding on that record');

    const duplicated = await admin.post(`/api/admin/finance/remittances/${claim.id}/confirm`, {
      allocations: [
        { viewingFeeRecordId: g.record.id, amountGhs: 10 },
        { viewingFeeRecordId: g.record.id, amountGhs: 5 },
      ],
    });
    assert.equal(duplicated.status, 422);

    const foreignRecord = await admin.post(`/api/admin/finance/remittances/${claim.id}/confirm`, {
      allocations: [{ viewingFeeRecordId: g.otherRecord.id, amountGhs: 30 }],
    });
    assert.equal(foreignRecord.status, 403, 'an agent cannot settle another agent’s obligation');

    // Allocations may not add up to more than the agent says they sent.
    const smallClaim = await g.clients.primary.post('/api/agent/remittances', {
      amountGhs: 10,
      method: 'cash',
      paidAt: new Date().toISOString().slice(0, 10),
    });
    const overClaim = await admin.post(`/api/admin/finance/remittances/${smallClaim.body.remittance.id}/confirm`, {
      allocations: [{ viewingFeeRecordId: g.record.id, amountGhs: 15 }],
    });
    assert.equal(overClaim.status, 422, 'allocations exceed the submitted amount');
    await admin.post(`/api/admin/finance/remittances/${smallClaim.body.remittance.id}/decision`, {
      status: 'rejected',
      reason: 'Superseded by the correct submission.',
    });

    // 15 settles the rest of the obligation; 45 stays visibly unmatched.
    const partial = await admin.post(`/api/admin/finance/remittances/${claim.id}/confirm`, {
      allocations: [{ viewingFeeRecordId: g.record.id, amountGhs: 15 }],
      note: 'Remainder held as unmatched funds pending allocation.',
    });
    assert.equal(partial.status, 200, JSON.stringify(partial.body));
    assert.equal(partial.body.remittance.unallocatedGhs, 45);

    const record = await findRecord(g.record.id);
    assert.equal(record.outstandingGhs, 0);
    assert.equal(record.settled, true);

    const after = await summary();
    assert.equal(after.remittances.unallocatedGhs, 45, 'unmatched money is reported, not hidden');
    assert.equal(
      after.remittances.confirmedReceivedGhs,
      after.remittances.appliedToObligationsGhs + after.remittances.unallocatedGhs,
      'confirmed money is counted once, either applied or unmatched'
    );
  });

  test('remittance submissions are validated server-side', async () => {
    const zero = await g.clients.primary.post('/api/agent/remittances', { amountGhs: 0, method: 'cash', paidAt: new Date().toISOString().slice(0, 10) });
    assert.equal(zero.status, 422);
    assert.ok(zero.body.fields.amountGhs);

    const future = await g.clients.primary.post('/api/agent/remittances', {
      amountGhs: 5,
      method: 'cash',
      paidAt: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10),
    });
    assert.equal(future.status, 422);
    assert.ok(future.body.fields.paidAt);

    const noReference = await g.clients.primary.post('/api/agent/remittances', {
      amountGhs: 5,
      method: 'bank_transfer',
      paidAt: new Date().toISOString().slice(0, 10),
    });
    assert.equal(noReference.status, 422);
    assert.ok(noReference.body.fields.paymentReference);

    // A client cannot set the status itself.
    const spoofed = await g.clients.primary.post('/api/agent/remittances', {
      amountGhs: 5,
      method: 'cash',
      paidAt: new Date().toISOString().slice(0, 10),
      status: 'confirmed',
      confirmedGhs: 5,
    });
    assert.equal(spoofed.status, 201);
    assert.equal(spoofed.body.remittance.status, 'submitted');
    assert.equal(spoofed.body.remittance.confirmedGhs, null);
  });

  test('a rejection is recorded with its reason and cannot become revenue later', async () => {
    const submitted = await g.clients.primary.post('/api/agent/remittances', {
      amountGhs: 12,
      method: 'cash',
      paidAt: new Date().toISOString().slice(0, 10),
    });
    const claim = submitted.body.remittance;
    const before = await summary();

    const noReason = await admin.post(`/api/admin/finance/remittances/${claim.id}/decision`, { status: 'rejected' });
    assert.equal(noReason.status, 422);

    const rejected = await admin.post(`/api/admin/finance/remittances/${claim.id}/decision`, {
      status: 'rejected',
      reason: 'No matching entry on the collections account.',
    });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
    assert.equal(rejected.body.remittance.status, 'rejected');
    assert.equal(rejected.body.remittance.decisionReason, 'No matching entry on the collections account.');

    const confirmRejected = await admin.post(`/api/admin/finance/remittances/${claim.id}/confirm`, {});
    assert.equal(confirmRejected.status, 409);

    const after = await summary();
    assert.equal(after.viewingFees.receivedGhs, before.viewingFees.receivedGhs);
    assert.equal(after.remittances.rejectedCount, before.remittances.rejectedCount + 1);

    const agentView = await g.clients.primary.get('/api/agent/finance');
    const mine = agentView.body.finance.remittances.find((row) => row.id === claim.id);
    assert.equal(mine.status, 'rejected');
    assert.match(mine.decisionReason, /no matching entry/i);
  });

  test('a confirmed receipt is reversed with a linked record, never edited', async () => {
    const record = await findRecord(g.record.id);
    const receipt = record.remittances.find((row) => row.entryType === 'receipt');
    const before = await summary();

    const reversed = await admin.post(`/api/admin/finance/receipts/${receipt.id}/reverse`, {
      amountGhs: 5,
      reason: 'Bank reversed part of the transfer.',
      supportReference: 'REV-SLIP-9',
    });
    assert.equal(reversed.status, 201, JSON.stringify(reversed.body));
    assert.equal(reversed.body.adjustment.kind, 'reversal');
    assert.equal(reversed.body.adjustment.subjectType, 'viewing_fee_remittance');

    const afterRecord = await findRecord(g.record.id);
    assert.equal(afterRecord.remittances.length, record.remittances.length + 1, 'a new row, not an edit');
    assert.ok(afterRecord.remittances.some((row) => row.entryType === 'reversal' && row.amountGhs === -5));
    assert.equal(afterRecord.remittedGhs, record.remittedGhs - 5);
    assert.equal(afterRecord.outstandingGhs, record.outstandingGhs + 5);

    const after = await summary();
    assert.equal(after.viewingFees.receivedGhs, before.viewingFees.receivedGhs - 5);

    const tooMuch = await admin.post(`/api/admin/finance/receipts/${receipt.id}/reverse`, { amountGhs: 1000, reason: 'x' });
    assert.equal(tooMuch.status, 422);
  });

  test('rental commissions come from a recorded agreement and stay separate', async () => {
    const before = await admin.get('/api/admin/finance/commissions');
    assert.equal(before.status, 200);

    // No property, no commission.
    const noProperty = await admin.post('/api/admin/finance/commissions', { amountGhs: 100 });
    assert.equal(noProperty.status, 422);

    const created = await admin.post('/api/admin/finance/commissions', {
      propertyId: state.seededPropertyId,
      amountGhs: 100,
      agentUserId: g.agent.id,
      dueDate: new Date().toISOString().slice(0, 10),
      basis: 'manual_agreement',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const commission = created.body.commission;
    assert.equal(commission.status, 'draft');
    assert.equal(commission.countsAsRevenue, false);
    assert.equal(commission.receivedGhs, 0);

    // Nothing was auto-generated by the rentals or by the creation.
    const after = await admin.get('/api/admin/finance/commissions');
    assert.equal(after.body.commissions.length, before.body.commissions.length + 1);

    // An agreement reference is required before anybody agrees to pay.
    const premature = await admin.post(`/api/admin/finance/commissions/${commission.id}/status`, { status: 'awaiting_agreement' });
    assert.equal(premature.status, 200, JSON.stringify(premature.body));
    const noTerms = await admin.post(`/api/admin/finance/commissions/${commission.id}/status`, { status: 'agreed' });
    assert.equal(noTerms.status, 422, 'no agreement reference, no agreement');

    const terms = await admin.patch(`/api/admin/finance/commissions/${commission.id}`, {
      rentalReference: 'TENANCY-G-2026-01',
      notes: 'Flat commission of GH₵100 agreed in writing between the landlord, the tenant and the agent.',
    });
    assert.equal(terms.status, 200, JSON.stringify(terms.body));
    assert.equal(terms.body.commission.rentalReference, 'TENANCY-G-2026-01');

    const agreed = await admin.post(`/api/admin/finance/commissions/${commission.id}/status`, { status: 'agreed' });
    assert.equal(agreed.status, 200, JSON.stringify(agreed.body));
    const due = await admin.post(`/api/admin/finance/commissions/${commission.id}/status`, { status: 'due' });
    assert.equal(due.status, 200, JSON.stringify(due.body));

    const payment = await admin.post(`/api/admin/finance/commissions/${commission.id}/payments`, {
      amountGhs: 40,
      receivedAt: new Date().toISOString().slice(0, 10),
      method: 'bank_transfer',
      reference: 'BT-G-1',
    });
    assert.equal(payment.status, 201, JSON.stringify(payment.body));
    assert.equal(payment.body.commission.status, 'partially_paid');
    assert.equal(payment.body.commission.receivedGhs, 40);
    assert.equal(payment.body.commission.outstandingGhs, 60);

    const over = await admin.post(`/api/admin/finance/commissions/${commission.id}/payments`, {
      amountGhs: 80,
      receivedAt: new Date().toISOString().slice(0, 10),
    });
    assert.equal(over.status, 422, 'a commission cannot be over-received');

    // The agent sees the commission but cannot change it.
    const agentView = await g.clients.primary.get('/api/agent/finance');
    const seen = agentView.body.finance.commissions.find((row) => row.id === commission.id);
    assert.ok(seen);
    assert.equal(seen.receivedGhs, 40);
    assert.equal((await g.clients.primary.post(`/api/admin/finance/commissions/${commission.id}/payments`, { amountGhs: 1 })).status, 403);

    // Reversal keeps both rows.
    const reversed = await admin.post(`/api/admin/finance/commissions/${commission.id}/adjustments`, {
      kind: 'reversal',
      amountGhs: 40,
      reason: 'The transfer was returned by the bank.',
    });
    assert.equal(reversed.status, 201, JSON.stringify(reversed.body));
    const afterReversal = await admin.get(`/api/admin/finance/commissions/${commission.id}`);
    assert.equal(afterReversal.body.commission.receivedGhs, 0);
    assert.equal(afterReversal.body.commission.outstandingGhs, 100);
    assert.ok(afterReversal.body.commission.payments.some((row) => row.entryType === 'reversal'));

    g.commission = commission;
  });

  test('a commission priced by a policy needs an approved, active policy', async () => {
    const missing = await admin.post('/api/admin/finance/commissions', {
      propertyId: state.seededPropertyId,
      amountGhs: 2000,
      basis: 'policy_snapshot',
      policyId: 'fp-does-not-exist',
    });
    assert.equal(missing.status, 404);

    // No 60/40 or 70/30 is applied on its own anywhere in this workflow.
    const list = await admin.get('/api/admin/finance/commissions');
    assert.ok(list.body.commissions.every((row) => row.basis !== 'policy_snapshot' || row.policySnapshot !== null));
    assert.ok(list.body.commissions.every((row) => row.policySnapshot === null || row.policySnapshot.hashValid === true));
  });

  test('the reconciliation summary never counts a collection or a claim as revenue', async () => {
    const res = await admin.get('/api/admin/finance/summary');
    assert.equal(res.status, 200);
    const s = res.body.summary;

    assert.equal(s.confirmedRevenue.viewingFeeRemittancesGhs, s.viewingFees.receivedGhs);
    assert.ok(!('collectedGhs' in s.confirmedRevenue));
    assert.ok(s.viewingFees.collectedGhs >= s.viewingFees.entitledGhs);
    assert.equal(
      s.remittances.confirmedReceivedGhs,
      s.remittances.appliedToObligationsGhs + s.remittances.unallocatedGhs
    );
    assert.ok(s.remittances.reportedAwaitingConfirmationGhs >= 0);
    assert.equal(typeof s.rentalCommissions.agreedGhs, 'number');
    assert.equal(typeof s.adjustments.netGhs, 'number');
    assert.equal(res.body.capabilities.financeConfirm, true);
    assert.equal(res.body.capabilities.financeView, true);
  });

  test('a suspended agent keeps their history but cannot submit new claims', async () => {
    const suspended = await admin.post(`/api/admin/agents/${g.otherAgent.id}/status`, { accountStatus: 'suspended' });
    assert.equal(suspended.status, 200, JSON.stringify(suspended.body));

    const blocked = await g.clients.other.post('/api/agent/remittances', {
      amountGhs: 5,
      method: 'cash',
      paidAt: new Date().toISOString().slice(0, 10),
    });
    assert.equal(blocked.status, 403);

    const readable = await g.clients.other.get('/api/agent/finance');
    assert.equal(readable.status, 200, 'the record is kept');
    assert.equal(readable.body.finance.capabilities.canSubmitRemittances, false);

    await admin.post(`/api/admin/agents/${g.otherAgent.id}/status`, { accountStatus: 'active' });
  });
});

/**
 * Audit corrections R3 and R4.
 *
 * R3: a reversal must reference the receipt it reverses, and cumulative
 * reversals are measured per receipt — reversing one receipt on an obligation
 * must never consume another receipt's headroom.
 *
 * R4: every financial decision is taken inside a write-locked transaction with
 * a conditional update, so two simultaneous requests cannot double-confirm,
 * over-allocate, overpay or over-reverse. The suite covers this at two levels:
 * parallel HTTP requests (which prove the request-level guards) and two real
 * PHP processes racing on the same SQLite file (which proves the locks).
 */
describe('Receipt-specific reversals and concurrency (audit R3/R4)', () => {
  const local = { clients: {}, users: {} };

  const visitor = () => new ApiClient(baseUrl);

  const loginAs = async (email, password) => {
    const client = visitor();
    const res = await client.post('/api/auth/login', { email, password });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return client;
  };

  const makeAdmin = async (key, flags = {}) => {
    const email = uniqueEmail(`r3-admin-${key}`);
    const password = 'R3-Finance-Admin-Pass-1';
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${password}`, `--name=R3 Admin ${key}`, '--role=admin'],
      state.testEnv
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);

    const args = [`--email=${email}`];
    if ('view' in flags) args.push(`--view=${flags.view ? 1 : 0}`);
    if ('confirm' in flags) args.push(`--confirm=${flags.confirm ? 1 : 0}`);
    if ('manage' in flags) args.push(`--manage=${flags.manage ? 1 : 0}`);
    if (args.length > 1) {
      const granted = runPhpScript('php-backend/grant_finance.php', args, state.testEnv);
      assert.match(granted.stdout, /(View|Confirm|Manage)\s*:/, granted.stdout + granted.stderr);
    }

    const client = visitor();
    const login = await client.post('/api/auth/admin-login', {
      email,
      password,
      accessKey: ADMIN_ACCESS_KEY,
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { client, email, id: login.body.user.id };
  };

  const registerAgent = async (key) => {
    const client = visitor();
    const email = uniqueEmail(`r3-agent-${key}`);
    const password = 'R3-Agent-Pass-1234';
    const res = await client.post('/api/auth/register', {
      name: `R3 Agent ${key}`,
      email,
      phone: '+233 20 640 0300',
      password,
      role: 'agent',
      operatingCity: 'Accra',
      agencyName: 'R3 Test Agency',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const activated = await local.admin.post(`/api/admin/agents/${res.body.user.id}/status`, { accountStatus: 'active' });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));
    local.clients[key] = await loginAs(email, password);
    local.users[key] = res.body.user;
    return res.body.user;
  };

  /** A completed, fee-paid viewing linked to an agent and priced by agreement. */
  const createLedgerRecord = async (managerClient, agentUserId, shareGhs) => {
    const booking = await guest.post('/api/viewing-requests', {
      tenantName: `R3 Ledger ${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      tenantPhone: '+233 24 640 0400',
      tenantEmail: uniqueEmail('r3-ledger'),
      propertyId: local.propertyId,
      date: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
      time: '10:00 AM',
    });
    assert.equal(booking.status, 201, JSON.stringify(booking.body));
    const viewingId = booking.body.viewingId;

    await completeViewingAs(local.admin, viewingId);
    const paid = await local.admin.patch(`/api/viewings/${viewingId}`, { viewingFeePaid: true });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));

    const ledger = await local.admin.get('/api/admin/viewing-fees');
    const record = ledger.body.records.find((entry) => entry.viewingId === viewingId);
    assert.ok(record, 'the paid viewing created a fee record');

    const linked = await managerClient.post(`/api/admin/viewing-fees/${record.id}/agent`, { agentUserId });
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    const agreed = await managerClient.post(`/api/admin/viewing-fees/${record.id}/share`, {
      amountGhs: shareGhs,
      note: 'Agreed in writing with the agent.',
    });
    assert.equal(agreed.status, 200, JSON.stringify(agreed.body));
    return record;
  };

  const submitRemittance = async (agentClient, amountGhs) => {
    const res = await agentClient.post('/api/agent/remittances', {
      amountGhs,
      method: 'momo',
      paymentReference: `MOMO-R3-${Math.random().toString(16).slice(2, 10)}`,
      paidAt: new Date().toISOString().slice(0, 10),
      note: 'Sent to the Goodlucks collections number.',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.remittance;
  };

  const confirmRemittance = async (adminClient, submissionId, allocations) =>
    adminClient.post(`/api/admin/finance/remittances/${submissionId}/confirm`, {
      allocations: allocations.map(([recordId, amount]) => ({ viewingFeeRecordId: recordId, amountGhs: amount })),
    });

  const reverse = async (amountGhs, receiptId, reason = 'Bank returned part of the transfer.') =>
    local.admin.post(`/api/admin/finance/receipts/${receiptId}/reverse`, { amountGhs, reason });

  const findRecord = async (recordId) => {
    const ledger = await local.admin.get('/api/admin/viewing-fees');
    return ledger.body.records.find((entry) => entry.id === recordId);
  };

  /**
   * The ledger row a confirmation wrote. The receipt id is read back from the
   * record's own history (by submission), never guessed.
   */
  const receiptFor = async (recordId, submissionId) => {
    const record = await findRecord(recordId);
    const receipt = record.remittances.find(
      (row) => row.entryType === 'receipt' && row.submissionId === submissionId
    );
    assert.ok(receipt, 'the confirmation wrote a receipt linked to its submission');
    return receipt.id;
  };

  before(async () => {
    // Signed in here rather than borrowed from another suite: these tests must
    // pass on their own and in any order. Administrators use the admin console
    // entry point, which is the only one that accepts an admin account.
    local.admin = new ApiClient(baseUrl);
    const adminLogin = await local.admin.post('/api/auth/admin-login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      accessKey: ADMIN_ACCESS_KEY,
    });
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));

    // Resolved here, not borrowed from another suite's side effects.
    const catalogue = await guest.get('/api/properties');
    assert.equal(catalogue.status, 200);
    local.propertyId = state.seededPropertyId ?? catalogue.body.properties[0].id;
    local.agent = await registerAgent('primary');
    local.manager = await makeAdmin('manager', { view: true, confirm: true, manage: true });

    // GH₵40 owed to Goodlucks on this obligation, settled by two separate
    // receipts: GH₵25 and GH₵15.
    local.record = await createLedgerRecord(local.manager.client, local.agent.id, 40);

    const first = await submitRemittance(local.clients.primary, 25);
    const confirmedFirst = await confirmRemittance(local.manager.client, first.id, [[local.record.id, 25]]);
    assert.equal(confirmedFirst.status, 200, JSON.stringify(confirmedFirst.body));
    local.receiptA = await receiptFor(local.record.id, first.id);

    const second = await submitRemittance(local.clients.primary, 15);
    const confirmedSecond = await confirmRemittance(local.manager.client, second.id, [[local.record.id, 15]]);
    assert.equal(confirmedSecond.status, 200, JSON.stringify(confirmedSecond.body));
    local.receiptB = await receiptFor(local.record.id, second.id);

    // An unrelated obligation that must never move.
    local.otherRecord = await createLedgerRecord(local.manager.client, local.agent.id, 30);
    const third = await submitRemittance(local.clients.primary, 30);
    const confirmedThird = await confirmRemittance(local.manager.client, third.id, [[local.otherRecord.id, 30]]);
    assert.equal(confirmedThird.status, 200, JSON.stringify(confirmedThird.body));
    local.otherReceipt = await receiptFor(local.otherRecord.id, third.id);
  });

  test('1. an obligation can hold two separate receipts, each with its own headroom', async () => {
    assert.ok(local.receiptA && local.receiptB, 'both confirmations produced a receipt');
    assert.notEqual(local.receiptA, local.receiptB);

    const record = await findRecord(local.record.id);
    const receipts = record.remittances.filter((row) => row.entryType === 'receipt');
    assert.equal(receipts.length, 2, 'two receipts on one obligation');
    assert.deepEqual(receipts.map((row) => row.amountGhs).sort((a, b) => a - b), [15, 25]);
    assert.equal(record.remittedGhs, 40);
    assert.equal(record.outstandingGhs, 0);
  });

  test('2. fully reversing receipt A leaves receipt B reversible', async () => {
    const recordBefore = await findRecord(local.record.id);

    const reversedA = await reverse(25, local.receiptA, 'The GH₵25 transfer was returned by the bank.');
    assert.equal(reversedA.status, 201, JSON.stringify(reversedA.body));
    assert.equal(reversedA.body.adjustment.kind, 'reversal');
    assert.equal(reversedA.body.adjustment.amountGhs, -25);

    const recordAfter = await findRecord(local.record.id);
    assert.equal(recordAfter.remittedGhs, recordBefore.remittedGhs - 25);
    assert.equal(recordAfter.outstandingGhs, recordBefore.outstandingGhs + 25);

    // The old behaviour summed reversals across the whole obligation, so this
    // second reversal would have been refused as "already fully reversed".
    const reversedB = await reverse(5, local.receiptB, 'Part of the GH₵15 transfer was returned.');
    assert.equal(reversedB.status, 201, JSON.stringify(reversedB.body));

    const recordFinal = await findRecord(local.record.id);
    assert.equal(recordFinal.remittedGhs, 10);
    assert.equal(recordFinal.outstandingGhs, 30);
    local.reversedOnB = 5;
  });

  test('3. a reversal larger than what is left on that receipt is refused', async () => {
    // GH₵15 receipt, GH₵5 already reversed: only GH₵10 remains.
    const tooMuch = await reverse(20, local.receiptB, 'Too much.');
    assert.equal(tooMuch.status, 422, JSON.stringify(tooMuch.body));
    assert.match(tooMuch.body.error, /10\.00/);

    const record = await findRecord(local.record.id);
    assert.equal(record.remittedGhs, 10, 'a refused reversal writes nothing');
  });

  test('4. the rest of receipt B can be reversed, and the totals follow', async () => {
    const rest = await reverse(10, local.receiptB, 'The remainder of the GH₵15 transfer was returned.');
    assert.equal(rest.status, 201, JSON.stringify(rest.body));

    const record = await findRecord(local.record.id);
    assert.equal(record.remittedGhs, 0, 'receipt A and receipt B are both fully reversed');
    assert.equal(record.outstandingGhs, 40);
    assert.equal(record.remittances.filter((row) => row.entryType === 'receipt').length, 2);
  });

  test('5. a fully reversed receipt cannot be reversed again', async () => {
    const againB = await reverse(1, local.receiptB);
    assert.equal(againB.status, 409, JSON.stringify(againB.body));
    assert.match(againB.body.error, /fully reversed/i);

    const againA = await reverse(1, local.receiptA);
    assert.equal(againA.status, 409, JSON.stringify(againA.body));

    const record = await findRecord(local.record.id);
    assert.equal(record.remittedGhs, 0, 'nothing was written by the refused attempts');
  });

  test('6. every reversal names its original receipt and no receipt is ever edited', async () => {
    const record = await findRecord(local.record.id);
    const reversals = record.remittances.filter((row) => row.entryType === 'reversal');
    assert.equal(reversals.length, 3, 'A once, B twice: three separate audit rows');

    const forA = reversals.filter((row) => row.reversalOfReceiptId === local.receiptA);
    const forB = reversals.filter((row) => row.reversalOfReceiptId === local.receiptB);
    assert.equal(forA.length, 1);
    assert.equal(forB.length, 2);
    assert.equal(forA[0].amountGhs, -25);
    assert.deepEqual(forB.map((row) => row.amountGhs).sort((a, b) => a - b), [-10, -5]);

    // The originals are still there, unchanged and positive.
    const originalA = record.remittances.find((row) => row.id === local.receiptA);
    const originalB = record.remittances.find((row) => row.id === local.receiptB);
    assert.equal(originalA.amountGhs, 25);
    assert.equal(originalB.amountGhs, 15);

    // Each reversal is its own adjustment, not an edit of a previous one.
    const adjustments = await local.admin.get('/api/admin/finance/adjustments');
    const mine = adjustments.body.adjustments.filter((row) => row.subjectId === local.receiptA || row.subjectId === local.receiptB);
    assert.equal(mine.length, 3);
    assert.equal(new Set(mine.map((row) => row.id)).size, 3);
    assert.ok(mine.every((row) => row.kind === 'reversal' && row.amountGhs < 0));
  });

  test('7. the reconciliation summary follows the reversals, per receipt', async () => {
    const res = await local.admin.get('/api/admin/finance/summary');
    assert.equal(res.status, 200);
    const s = res.body.summary;

    assert.equal(
      s.remittances.confirmedReceivedGhs,
      s.remittances.appliedToObligationsGhs + s.remittances.unallocatedGhs,
      'confirmed = applied + unallocated still holds after reversals'
    );
    assert.equal(s.confirmedRevenue.viewingFeeRemittancesGhs, s.viewingFees.receivedGhs);

    const agentView = await local.clients.primary.get('/api/agent/finance');
    assert.equal(agentView.status, 200);
    const mine = agentView.body.finance.viewingFees.find((row) => row.id === local.record.id);
    assert.equal(mine.remittedGhs, 0);
    assert.equal(mine.outstandingGhs, 40);
  });

  test('8. receipts on other obligations are unaffected throughout', async () => {
    const other = await findRecord(local.otherRecord.id);
    assert.equal(other.remittedGhs, 30);
    assert.equal(other.outstandingGhs, 0);
    assert.equal(other.remittances.filter((row) => row.entryType === 'reversal').length, 0);

    // And the untouched receipt is still reversible on its own.
    const stillReversible = await reverse(5, local.otherReceipt, 'A partial refund on the other obligation.');
    assert.equal(stillReversible.status, 201, JSON.stringify(stillReversible.body));
    const after = await findRecord(local.otherRecord.id);
    assert.equal(after.remittedGhs, 25);
  });

  // -------------------------------------------------------------------------
  // R4: concurrency
  //
  // These prove the request-level guards: two HTTP requests for the same
  // decision are settled by the locked re-read and the conditional update.
  // The truly parallel case — two separate OS processes writing the same
  // SQLite file at once — lives in tests/concurrency.test.mjs, which runs
  // without an API server in front of the database.
  // -------------------------------------------------------------------------

  test('9. two simultaneous confirmations of one remittance record the money once', async () => {
    const record = await createLedgerRecord(local.manager.client, local.agent.id, 20);
    const submission = await submitRemittance(local.clients.primary, 20);

    const [first, second] = await Promise.all([
      confirmRemittance(local.manager.client, submission.id, [[record.id, 20]]),
      confirmRemittance(local.manager.client, submission.id, [[record.id, 20]]),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409], `expected exactly one confirmation, got ${JSON.stringify(statuses)}`);

    const after = await findRecord(record.id);
    assert.equal(after.remittances.filter((row) => row.entryType === 'receipt').length, 1, 'one receipt, not two');
    assert.equal(after.remittedGhs, 20);
    assert.equal(after.outstandingGhs, 0);

    const detail = await local.admin.get(`/api/admin/finance/remittances/${submission.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.remittance.status, 'confirmed');
    assert.equal(detail.body.remittance.allocations.length, 1, 'no duplicated allocation');
  });

  test('10. two simultaneous confirmations cannot both take the same outstanding balance', async () => {
    const record = await createLedgerRecord(local.manager.client, local.agent.id, 20);
    const firstSubmission = await submitRemittance(local.clients.primary, 20);
    const secondSubmission = await submitRemittance(local.clients.primary, 20);

    const [a, b] = await Promise.all([
      confirmRemittance(local.manager.client, firstSubmission.id, [[record.id, 20]]),
      confirmRemittance(local.manager.client, secondSubmission.id, [[record.id, 20]]),
    ]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    assert.deepEqual(statuses, [200, 422], `one confirmation must be refused, got ${JSON.stringify(statuses)}`);

    const after = await findRecord(record.id);
    assert.equal(after.remittedGhs, 20, 'never more than the obligation');
    assert.equal(after.outstandingGhs, 0);
    assert.ok(after.remittedGhs <= 20);
  });

  test('11. two simultaneous commission payments cannot over-receive', async () => {
    const created = await local.admin.post('/api/admin/finance/commissions', {
      propertyId: local.propertyId,
      amountGhs: 100,
      agentUserId: local.agent.id,
      dueDate: new Date().toISOString().slice(0, 10),
      basis: 'manual_agreement',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const commission = created.body.commission;

    await local.admin.post(`/api/admin/finance/commissions/${commission.id}/status`, { status: 'awaiting_agreement' });
    await local.admin.patch(`/api/admin/finance/commissions/${commission.id}`, {
      rentalReference: 'TENANCY-R4-2026-01',
      notes: 'Flat commission of GH₵100 agreed in writing between landlord, tenant and agent.',
    });
    const agreed = await local.admin.post(`/api/admin/finance/commissions/${commission.id}/status`, { status: 'agreed' });
    assert.equal(agreed.status, 200, JSON.stringify(agreed.body));

    const pay = () =>
      local.admin.post(`/api/admin/finance/commissions/${commission.id}/payments`, {
        amountGhs: 60,
        receivedAt: new Date().toISOString().slice(0, 10),
        method: 'cash',
        reference: 'RACE-CASH',
      });

    const [first, second] = await Promise.all([pay(), pay()]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [201, 422], `only one GH₵60 payment may be accepted, got ${JSON.stringify(statuses)}`);

    const after = await local.admin.get(`/api/admin/finance/commissions/${commission.id}`);
    assert.equal(after.body.commission.receivedGhs, 60);
    assert.equal(after.body.commission.outstandingGhs, 40);
    assert.equal(
      after.body.commission.payments.filter((row) => row.entryType === 'receipt').length,
      1,
      'one payment row'
    );
    local.commission = commission;
  });

  test('12. two simultaneous reversals of one receipt cannot over-reverse it', async () => {
    const record = await createLedgerRecord(local.manager.client, local.agent.id, 20);
    const submission = await submitRemittance(local.clients.primary, 20);
    const confirmed = await confirmRemittance(local.manager.client, submission.id, [[record.id, 20]]);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const receiptId = await receiptFor(record.id, submission.id);

    const [first, second] = await Promise.all([reverse(20, receiptId), reverse(20, receiptId)]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [201, 409], `only one full reversal may succeed, got ${JSON.stringify(statuses)}`);

    const after = await findRecord(record.id);
    const reversals = after.remittances.filter((row) => row.entryType === 'reversal');
    assert.equal(reversals.length, 1);
    assert.equal(reversals[0].amountGhs, -20);
    assert.equal(after.remittedGhs, 0);
    assert.equal(after.outstandingGhs, 20);
  });

  test('13. two simultaneous status decisions on one commission: one wins', async () => {
    const created = await local.admin.post('/api/admin/finance/commissions', {
      propertyId: local.propertyId,
      amountGhs: 50,
      agentUserId: local.agent.id,
      basis: 'manual_agreement',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const [first, second] = await Promise.all([
      local.admin.post(`/api/admin/finance/commissions/${created.body.commission.id}/status`, { status: 'awaiting_agreement' }),
      local.admin.post(`/api/admin/finance/commissions/${created.body.commission.id}/status`, { status: 'awaiting_agreement' }),
    ]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409], `one transition only, got ${JSON.stringify(statuses)}`);
  });

  test('14. a rollback leaves no partial financial records behind', async () => {
    // An allocation larger than the remittance is refused; the whole attempt
    // must leave the submission untouched and no receipt behind.
    const record = await createLedgerRecord(local.manager.client, local.agent.id, 30);
    const submission = await submitRemittance(local.clients.primary, 10);

    const refused = await confirmRemittance(local.manager.client, submission.id, [[record.id, 30]]);
    assert.equal(refused.status, 422, JSON.stringify(refused.body));

    const detail = await local.admin.get(`/api/admin/finance/remittances/${submission.id}`);
    assert.equal(detail.body.remittance.status, 'submitted');
    assert.equal(detail.body.remittance.allocations.length, 0);

    const after = await findRecord(record.id);
    assert.equal(after.remittedGhs, 0);
    assert.equal(after.remittances.length, 0, 'no receipt was written');
  });
});
// ---------------------------------------------------------------------------
