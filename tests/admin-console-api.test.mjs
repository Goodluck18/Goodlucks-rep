/**
 * Goodlucks Homes - administrator console search and filter tests (Upgrade 2)
 *
 * A6 Manage Listings, A7 Tenant Matching, A8 Agent Accounts and A10 Web
 * Inquiries are console features, but every assertion here is about the
 * SERVER: the controls must query the real records across the whole data set,
 * not filter one downloaded page. The suite therefore drives the API directly.
 *
 * It runs as its own file with its own database and its own API server, so it
 * is independent of the order the other suites run in and never borrows another
 * suite's session or fixtures.
 *
 *   npm run test:admin-console-api
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
const dbPath = path.join(dataDir, `console-${process.pid}-${Date.now()}.sqlite`);
const privateDir = path.join(dataDir, `console-private-${process.pid}-${Date.now()}`);
const port = 8900 + Math.floor(Math.random() * 90);
const ADMIN_EMAIL = 'console-admin@test.local';
const ADMIN_PASSWORD = 'Console-Admin-Password-123';
const ADMIN_ACCESS_KEY = 'console-access-key';

let server;
let baseUrl;
let testEnv;

const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(privateDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }

  testEnv = {
    DB_DRIVER: 'sqlite',
    DB_SQLITE_PATH: dbPath,
    APP_ENV: 'development',
    ADMIN_ACCESS_KEY,
    OFFICIAL_EMAIL: 'rentals@goodlucks.co',
    EMAIL_TRANSPORT: 'none',
    REGISTER_RATE_LIMIT_PER_HOUR: '60',
    VIEWING_RATE_LIMIT_PER_HOUR: '200',
    TENANT_REQUEST_RATE_LIMIT_PER_HOUR: '200',
    VIEWING_ACTION_RATE_LIMIT_PER_HOUR: '2000',
    IDENTITY_DATA_KEY: Buffer.alloc(32, 7).toString('base64'),
    VERIFICATION_RETENTION_DAYS: '365',
    PRIVATE_UPLOAD_DIR: privateDir,
  };

  server = await startApiServer({ port, env: testEnv, quiet: true });
  baseUrl = server.baseUrl;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Console Admin'],
    testEnv
  );
  assert.equal(bootstrap.status, 0, `admin bootstrap failed: ${bootstrap.stdout} ${bootstrap.stderr}`);
});

after(() => {
  server?.stop();
});

// ---------------------------------------------------------------------------
describe('Admin console search and filters (Upgrade 2, A6–A10)', () => {
  // Every assertion below is about the SERVER: the console's controls must run
  // over the real records, not over a page that happened to be downloaded.
  //
  // This suite signs in its own accounts rather than borrowing another suite's
  // session, so it passes on its own and in any order (the same rule the finance
  // suites follow).
  const c = { client: {}, listing: {}, request: {}, agents: {}, enquiry: {} };
  const consoleClient = () => new ApiClient(baseUrl);

  const createUser = async (email, password, name, role) => {
    const script = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${password}`, `--name=${name}`, `--role=${role}`],
      testEnv
    );
    assert.equal(script.status, 0, script.stdout + script.stderr);
    const client = consoleClient();
    const login = await client.post('/api/auth/login', { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return client;
  };

  before(async () => {
    c.client.admin = consoleClient();
    const adminLogin = await c.client.admin.post('/api/auth/admin-login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      accessKey: ADMIN_ACCESS_KEY,
    });
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));

    c.client.guest = consoleClient();
    c.client.landlord = await createUser(uniqueEmail('console-landlord'), 'Console-Landlord-Pass-1', 'Console Landlord', 'landlord');
    c.tenantEmail = uniqueEmail('console-tenant');
    c.client.tenant = await createUser(c.tenantEmail, 'Console-Tenant-Pass-1', 'Console Tenant', 'tenant');
  });

  const createListing = async (overrides = {}) => {
    const res = await c.client.landlord.post('/api/properties', {
      title: `Console listing ${Math.random().toString(36).slice(2, 8)}`,
      location: 'East Legon, Accra',
      city: 'Accra',
      rentGhs: 5000,
      bedrooms: 3,
      bathrooms: 2,
      propertyType: 'Townhouse',
      description: 'A listing created to exercise the administrator console filters end to end.',
      images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
      availability: 'Available Now',
      ...overrides,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.property;
  };

  before(async () => {
    // Three listings with deliberately different attributes, plus one that is
    // archived, so each filter has something real to exclude.
    c.listing.legon = await createListing({
      title: 'Console Filter House in East Legon',
      location: 'East Legon, Accra',
      rentGhs: 4200,
    });
    c.listing.osu = await createListing({
      title: 'Console Filter Apartment in Osu',
      location: 'Osu, Accra',
      city: 'Accra',
      rentGhs: 9500,
      bedrooms: 2,
      propertyType: 'Apartment',
    });
    c.listing.archived = await createListing({
      title: 'Console Filter Archived Cottage',
      location: 'Aburi, Eastern Region',
      city: 'Aburi',
      rentGhs: 1500,
      bedrooms: 1,
      propertyType: 'Apartment',
    });
    // Two published, one archived: a realistic mix for a status filter.
    for (const listing of [c.listing.legon, c.listing.osu]) {
      const published = await c.client.admin.post(`/api/properties/${listing.id}/status`, { status: 'active' });
      assert.equal(published.status, 200, JSON.stringify(published.body));
    }
    const archived = await c.client.admin.post(`/api/properties/${c.listing.archived.id}/status`, {
      status: 'deactivated',
    });
    assert.equal(archived.status, 200, JSON.stringify(archived.body));
  });

  /* ---------------------------------------------------------------- A6 ---- */
  test('A6: the listing search runs over every listing, not one page', async () => {
    const all = await c.client.admin.get('/api/admin/properties?perPage=1');
    assert.equal(all.status, 200);
    assert.equal(all.body.properties.length, 1, 'one row per page');
    assert.ok(all.body.total > 3, 'the total is the real number of listings');
    assert.equal(all.body.page, 1);
    assert.equal(all.body.perPage, 1);

    const search = await c.client.admin.get('/api/admin/properties?q=console%20filter');
    assert.equal(search.status, 200);
    assert.equal(search.body.total, 3, 'all three matches, even though a page holds fewer');

    const byArea = await c.client.admin.get('/api/admin/properties?q=osu');
    assert.equal(byArea.body.total, 1);
    assert.equal(byArea.body.properties[0].id, c.listing.osu.id);
  });

  test('A6: location, price, status and sort filters are applied by the server', async () => {
    const location = await c.client.admin.get('/api/admin/properties?location=aburi&q=console%20filter');
    assert.equal(location.body.total, 1);
    assert.equal(location.body.properties[0].id, c.listing.archived.id);

    const priced = await c.client.admin.get('/api/admin/properties?q=console%20filter&minRent=2000&maxRent=6000');
    assert.equal(priced.body.total, 1, 'only the GH₵4,200 house is in range');
    assert.equal(priced.body.properties[0].id, c.listing.legon.id);

    // Archived listings are excluded unless their status is asked for.
    const live = await c.client.admin.get('/api/admin/properties?q=console%20filter&status=active');
    assert.equal(live.body.total, 2);
    assert.ok(!live.body.properties.some((row) => row.id === c.listing.archived.id));

    const archivedOnly = await c.client.admin.get('/api/admin/properties?q=console%20filter&status=deactivated');
    assert.equal(archivedOnly.body.total, 1);
    assert.equal(archivedOnly.body.properties[0].id, c.listing.archived.id);

    // Two statuses at once (the console's multi-select form).
    const both = await c.client.admin.get('/api/admin/properties?q=console%20filter&status=active,deactivated');
    assert.equal(both.body.total, 3);

    const ascending = await c.client.admin.get('/api/admin/properties?q=console%20filter&sort=price_asc&perPage=50');
    const prices = ascending.body.properties.map((row) => row.rentGhs);
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'the server sorted by price');

    const descending = await c.client.admin.get('/api/admin/properties?q=console%20filter&sort=price_desc&perPage=50');
    const reversed = descending.body.properties.map((row) => row.rentGhs);
    assert.deepEqual(reversed, [...reversed].sort((a, b) => b - a));
  });

  test('A6: the listing date range is inclusive and bad dates are ignored', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

    const todayOnly = await c.client.admin.get(
      `/api/admin/properties?q=console%20filter&createdFrom=${today}&createdTo=${today}`
    );
    assert.equal(todayOnly.body.total, 3, 'all three were created today');

    const upToYesterday = await c.client.admin.get(`/api/admin/properties?q=console%20filter&createdTo=${yesterday}`);
    assert.equal(upToYesterday.body.total, 0, 'nothing existed yesterday');

    const fromTomorrow = await c.client.admin.get(`/api/admin/properties?q=console%20filter&createdFrom=${tomorrow}`);
    assert.equal(fromTomorrow.body.total, 0);

    const junk = await c.client.admin.get('/api/admin/properties?q=console%20filter&createdFrom=not-a-date');
    assert.equal(junk.body.total, 3, 'an unparseable date never hides records');
  });

  test('A6: paging walks the whole result set without gaps', async () => {
    const first = await c.client.admin.get('/api/admin/properties?q=console%20filter&sort=price_asc&perPage=2&page=1');
    const second = await c.client.admin.get('/api/admin/properties?q=console%20filter&sort=price_asc&perPage=2&page=2');
    assert.equal(first.body.properties.length, 2);
    assert.equal(second.body.properties.length, 1);
    assert.equal(first.body.total, 3);
    const ids = [...first.body.properties, ...second.body.properties].map((row) => row.id);
    assert.equal(new Set(ids).size, 3, 'no listing appears twice and none is missed');
  });

  /* ---------------------------------------------------------------- A7 ---- */
  test('A7: requests are searchable by name, phone and email', async () => {
    const created = await c.client.tenant.post('/api/tenant-requests', {
      tenantName: 'Console Search Tenant',
      tenantPhone: '+233 24 555 0199',
      tenantEmail: c.tenantEmail,
      preferredLocations: ['Osu'],
      budgetMin: 2000,
      budgetMax: 4500,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: 'Apartment',
      moveInDate: new Date(Date.now() + 20 * 86400_000).toISOString().slice(0, 10),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    c.request.searchable = created.body.requestId;

    const byName = await c.client.admin.get('/api/admin/tenant-requests?q=console%20search');
    assert.ok(byName.body.requests.some((row) => row.id === c.request.searchable));

    // The phone is stored with spaces and a +; the search uses the digits.
    const byPhone = await c.client.admin.get('/api/admin/tenant-requests?q=245550199');
    assert.ok(byPhone.body.requests.some((row) => row.id === c.request.searchable));

    const byEmail = await c.client.admin.get(`/api/admin/tenant-requests?q=${encodeURIComponent(c.tenantEmail)}`);
    assert.ok(byEmail.body.requests.some((row) => row.id === c.request.searchable));

    const noMatch = await c.client.admin.get('/api/admin/tenant-requests?q=nobody-by-this-name');
    assert.equal(noMatch.body.requests.length, 0);
  });

  test('A7: the pending / approved / viewing-scheduled stages are real statuses', async () => {
    const pending = await c.client.admin.get('/api/admin/tenant-requests?stage=pending');
    assert.equal(pending.status, 200);
    assert.ok(pending.body.requests.every((row) => ['submitted', 'searching'].includes(row.status)));
    assert.ok(pending.body.requests.some((row) => row.id === c.request.searchable));

    // Approving the request moves it into the approved list, with no extra flag.
    const matched = await c.client.admin.patch(`/api/tenant-requests/${c.request.searchable}`, {
      status: 'matched',
      matchedPropertyIds: [c.listing.legon.id],
    });
    assert.equal(matched.status, 200, JSON.stringify(matched.body));
    assert.equal(matched.body.request.stage, 'approved');

    const approved = await c.client.admin.get('/api/admin/tenant-requests?stage=approved');
    assert.ok(approved.body.requests.some((row) => row.id === c.request.searchable));
    assert.ok(approved.body.requests.every((row) => row.status === 'matched'));

    const notPending = await c.client.admin.get('/api/admin/tenant-requests?stage=pending');
    assert.ok(!notPending.body.requests.some((row) => row.id === c.request.searchable));

    const scheduled = await c.client.admin.patch(`/api/tenant-requests/${c.request.searchable}`, {
      status: 'viewing_scheduled',
    });
    assert.equal(scheduled.status, 200);
    const inScheduled = await c.client.admin.get('/api/admin/tenant-requests?stage=viewing_scheduled');
    assert.ok(inScheduled.body.requests.some((row) => row.id === c.request.searchable));

    // The chip counts cover every request, not the filtered page.
    assert.ok(inScheduled.body.stageCounts.viewing_scheduled >= 1);
    assert.ok(
      Object.values(inScheduled.body.stageCounts).reduce((sum, value) => sum + value, 0) >=
        inScheduled.body.requests.length
    );

    const badStage = await c.client.admin.get('/api/admin/tenant-requests?stage=approved_for_listing');
    assert.equal(badStage.status, 422);
  });

  /* ---------------------------------------------------------------- A8 ---- */
  test('A8: agent accounts are searchable and filterable by the listing decision', async () => {
    const makeAgent = async (name, city) => {
      const email = uniqueEmail('console-agent');
      const client = consoleClient();
      const res = await client.post('/api/auth/register', {
        name,
        email,
        phone: '+233 20 555 0100',
        password: 'Console-Agent-Pass-1',
        role: 'agent',
        operatingCity: city,
        agencyName: `${name} Agency`,
      });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return { client, user: res.body.user, email };
    };

    c.agents.tema = await makeAgent('Console Agent Tema', 'Tema');
    c.agents.kumasi = await makeAgent('Console Agent Kumasi', 'Kumasi');

    const byName = await c.client.admin.get('/api/admin/agents?q=console%20agent%20tema');
    assert.equal(byName.status, 200);
    assert.equal(byName.body.agents.length, 1);
    assert.equal(byName.body.agents[0].email, c.agents.tema.email);

    const byEmail = await c.client.admin.get(`/api/admin/agents?q=${encodeURIComponent(c.agents.kumasi.email)}`);
    assert.equal(byEmail.body.agents.length, 1);
    assert.equal(byEmail.body.agents[0].email, c.agents.kumasi.email);

    // A new account has no listing authorisation, so it is pending.
    const pending = await c.client.admin.get('/api/admin/agents?q=console%20agent&stage=pending');
    assert.equal(pending.body.agents.length, 2);
    assert.ok(pending.body.agents.every((agent) => agent.canSubmitListings === false));
    assert.ok(pending.body.stageCounts.pending >= 2);

    // Listing authorisation is granted (or withheld) on its own.
    const approved = await c.client.admin.post(`/api/admin/agents/${c.agents.tema.user.id}/status`, {
      accountStatus: 'active',
      canSubmitListings: true,
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const approvedForListing = await c.client.admin.get('/api/admin/agents?q=console%20agent&stage=approved_for_listing');
    assert.equal(approvedForListing.body.agents.length, 1);
    assert.equal(approvedForListing.body.agents[0].email, c.agents.tema.email);

    const suspended = await c.client.admin.post(`/api/admin/agents/${c.agents.kumasi.user.id}/status`, {
      accountStatus: 'suspended',
      canSubmitListings: false,
    });
    assert.equal(suspended.status, 200);

    const suspendedOnly = await c.client.admin.get('/api/admin/agents?q=console%20agent&stage=suspended');
    assert.equal(suspendedOnly.body.agents.length, 1);
    assert.equal(suspendedOnly.body.agents[0].email, c.agents.kumasi.email);

    // Verification is a DIFFERENT decision: neither agent has been verified, so
    // `verified` finds nothing and `unverified` finds both — even though one of
    // them may submit listings.
    const verified = await c.client.admin.get('/api/admin/agents?q=console%20agent&verification=verified');
    assert.equal(verified.body.agents.length, 0);
    const unverified = await c.client.admin.get('/api/admin/agents?q=console%20agent&verification=unverified');
    assert.equal(unverified.body.agents.length, 2);

    const badStage = await c.client.admin.get('/api/admin/agents?stage=approved');
    assert.equal(badStage.status, 422);
  });

  /* --------------------------------------------------------------- A10 ---- */
  test('A10: enquiries are searchable and every lifecycle status is accepted', async () => {
    const makeEnquiry = async (name, phone, message) => {
      const res = await c.client.guest.post('/api/enquiries', {
        name,
        email: `${name.toLowerCase().replace(/\s+/g, '.')}@console.test`,
        phone,
        message,
        source: 'contact_form',
      });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body.enquiryId;
    };

    c.enquiry.ama = await makeEnquiry(
      'Ama Console',
      '+233 27 111 2233',
      'Please confirm the Osu apartment is still available.'
    );
    c.enquiry.kofi = await makeEnquiry(
      'Kofi Console',
      '+233 55 444 5566',
      'Is a viewing possible this Saturday in East Legon?'
    );

    const byName = await c.client.admin.get('/api/admin/enquiries?q=ama%20console');
    assert.equal(byName.status, 200);
    assert.ok(byName.body.enquiries.some((row) => row.id === c.enquiry.ama));
    assert.ok(!byName.body.enquiries.some((row) => row.id === c.enquiry.kofi));

    // Phone search ignores spaces and the international prefix.
    const byPhone = await c.client.admin.get('/api/admin/enquiries?q=271112233');
    assert.ok(byPhone.body.enquiries.some((row) => row.id === c.enquiry.ama));

    const byEmail = await c.client.admin.get('/api/admin/enquiries?q=kofi.console%40console.test');
    assert.ok(byEmail.body.enquiries.some((row) => row.id === c.enquiry.kofi));

    const fresh = await c.client.admin.get('/api/admin/enquiries?status=new');
    assert.ok(fresh.body.enquiries.every((row) => row.status === 'new'));
    assert.ok(fresh.body.statusCounts.new >= 2, 'the chip counts every new enquiry');

    // Every status in the new lifecycle can be stored and filtered on.
    for (const status of ['received', 'contacted', 'replied']) {
      const moved = await c.client.admin.patch(`/api/admin/enquiries/${c.enquiry.ama}`, { status });
      assert.equal(moved.status, 200, JSON.stringify(moved.body));
      assert.equal(moved.body.enquiry.status, status);
      const filtered = await c.client.admin.get(`/api/admin/enquiries?status=${status}`);
      assert.ok(filtered.body.enquiries.some((row) => row.id === c.enquiry.ama), status);
    }

    const closed = await c.client.admin.patch(`/api/admin/enquiries/${c.enquiry.kofi}`, { status: 'closed' });
    assert.equal(closed.status, 200);
    const closedOnly = await c.client.admin.get('/api/admin/enquiries?status=closed');
    assert.ok(closedOnly.body.enquiries.every((row) => row.status === 'closed'));

    const unknown = await c.client.admin.patch(`/api/admin/enquiries/${c.enquiry.kofi}`, { status: 'archived' });
    assert.equal(unknown.status, 422, 'a status outside the lifecycle is refused');

    // The whole lifecycle is documented to the client in the refusal message.
    assert.match(unknown.body.fields.status, /received/);
    assert.match(unknown.body.fields.status, /replied/);

    // Two statuses at once.
    const two = await c.client.admin.get('/api/admin/enquiries?status=new,replied');
    assert.ok(two.body.enquiries.every((row) => ['new', 'replied'].includes(row.status)));
  });

  test('A10: enquiry search and filters are administrator-only', async () => {
    assert.equal((await c.client.tenant.get('/api/admin/enquiries?q=ama')).status, 403);
    assert.equal((await c.client.landlord.get('/api/admin/enquiries')).status, 403);
    assert.equal((await c.client.guest.get('/api/admin/enquiries')).status, 401);
    assert.equal((await c.client.tenant.get('/api/admin/agents?q=a')).status, 403);
    assert.equal((await c.client.tenant.get('/api/admin/properties?q=a')).status, 403);
    assert.equal((await c.client.tenant.get('/api/admin/tenant-requests?q=a')).status, 403);
  });
});

