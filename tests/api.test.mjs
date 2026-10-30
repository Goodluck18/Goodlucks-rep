/**
 * Goodlucks Homes - API integration tests
 *
 * Runs the real PHP backend (SQLite driver) and exercises every endpoint the
 * website depends on: authentication, property CRUD + moderation, uploads,
 * enquiries, viewings, tenant requests, alerts, saved properties, agreements,
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
const port = 8300 + Math.floor(Math.random() * 500);
const ADMIN_EMAIL = 'admin@test.local';
const ADMIN_PASSWORD = 'Admin-Test-Password-123';
const ADMIN_ACCESS_KEY = 'test-access-key';

let server;
let baseUrl;
let admin;
let landlord;
let tenant;
let guest;
const state = {};

const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;

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
    OFFICIAL_EMAIL: 'rentals@goodlucks.co',
  };
  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Test Admin'],
    env
  );
  assert.equal(bootstrap.status, 0, `admin bootstrap failed: ${bootstrap.stdout} ${bootstrap.stderr}`);

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
    const revenueBefore = before.body.stats.physicalRevenueGhs;

    const update = await admin.patch(`/api/viewings/${state.viewingId}`, {
      status: 'completed',
      viewingFeePaid: true,
    });
    assert.equal(update.status, 200);
    assert.equal(update.body.viewing.status, 'completed');
    assert.equal(update.body.viewing.viewingFeePaid, true);

    const after = await admin.get('/api/admin/stats');
    assert.equal(after.body.stats.physicalRevenueGhs, revenueBefore + 100);
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
describe('Agreements & receipts', () => {
  test('tenancy agreement is created with a verification code and can be signed', async () => {
    const res = await tenant.post('/api/agreements', {
      propertyTitle: 'The Pearl Executive 3-Bedroom Apartment',
      propertyAddress: 'Cantonments, Accra',
      landlordName: 'Abena Osei',
      landlordPhone: '+233 20 899 7711',
      tenantName: 'Test Tenant',
      tenantPhone: '+233 24 123 4567',
      monthlyRentGhs: 6500,
      durationMonths: 12,
      securityDepositGhs: 6500,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10),
    });
    assert.equal(res.status, 201);
    assert.match(res.body.agreement.verificationCode, /^GHL-AGR-/);
    assert.equal(res.body.agreement.totalRentGhs, 78000);
    state.agreementId = res.body.agreement.id;

    const signed = await tenant.post(`/api/agreements/${state.agreementId}/sign`, { role: 'tenant' });
    assert.equal(signed.status, 200);
    assert.equal(signed.body.agreement.tenantSigned, true);

    const wrongRole = await tenant.post(`/api/agreements/${state.agreementId}/sign`, { role: 'landlord' });
    assert.equal(wrongRole.status, 403);

    const list = await admin.get('/api/agreements');
    assert.ok(list.body.agreements.some((a) => a.id === state.agreementId));
  });

  test('an agreement copy can be emailed to the signed-in party', async () => {
    const res = await tenant.post(`/api/agreements/${state.agreementId}/email`, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const anonymous = await guest.post(`/api/agreements/${state.agreementId}/email`, {});
    assert.equal(anonymous.status, 401);

    const missing = await tenant.post('/api/agreements/does-not-exist/email', {});
    assert.equal(missing.status, 404);
  });

  test('rent receipt is issued with a reference number', async () => {
    const res = await admin.post('/api/receipts', {
      propertyTitle: 'The Pearl Executive 3-Bedroom Apartment',
      propertyAddress: 'Cantonments, Accra',
      tenantName: 'Test Tenant',
      tenantPhone: '+233 24 123 4567',
      landlordName: 'Abena Osei',
      amountGhs: 6500,
      amountInWords: 'Six thousand five hundred Ghana cedis',
      paymentPurpose: 'Monthly rent',
      paymentMethod: 'MTN MoMo',
      transactionRef: 'MOMO-TEST-001',
      paymentDate: new Date().toISOString().slice(0, 10),
    });
    assert.equal(res.status, 201);
    assert.match(res.body.receipt.receiptNo, /^GHL-REC-/);
    assert.match(res.body.receipt.verificationCode, /^VERIFIED-REC-/);
  });
});

// ---------------------------------------------------------------------------
describe('Notifications & analytics', () => {
  test('page views are recorded and exposed as real analytics', async () => {
    for (const page of ['/', '/browse', '/about']) {
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
