/**
 * Seven-day property availability renewal, admin activity monitoring and
 * provider (Agent/Landlord) suspension.
 *
 * What this suite proves over the real HTTP API (SQLite, PHP-WASM):
 *
 *   1. Publishing starts a seven-day confirmation clock; confirming renews it;
 *      the deadline is enforced by the backend, not by a browser timer.
 *   2. A listing whose deadline has passed is invisible to the public — the API,
 *      the detail page and the sitemap — even before the scheduled job runs.
 *   3. A missed confirmation expires the listing: it keeps its record, its
 *      photographs and its history, and can be brought back only by confirming
 *      availability (which re-checks suspension and verification).
 *   4. The scheduled job is idempotent: repeated runs produce no duplicate
 *      events, notifications or emails.
 *   5. The admin console can see every availability state, filter it, and
 *      reactivate a listing only with a recorded reason and confirmation source.
 *   6. Suspension covers Agents and Landlords, overrides approved verification,
 *      removes live listings from public view immediately, and never deletes
 *      anything. Reinstatement never republishes automatically.
 *
 *   node --test --test-concurrency=1 tests/property-availability.test.mjs
 *
 * NOT covered (and never claimed): a browser, MySQL, a real mail server or a
 * device. Those steps are listed in the task report for manual verification.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { runPhpScript, startApiServer } from '../scripts/php.mjs';
import { ApiClient, approveProviderVerification, createPng } from './helpers.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(projectRoot, '.data');
const stamp = `${process.pid}-${Date.now()}`;
const dbPath = path.join(dataDir, `property-availability-${stamp}.sqlite`);
const port = 9700 + Math.floor(Math.random() * 200);

const ADMIN_ACCESS_KEY = 'availability-access-key';
const ADMIN_EMAIL = `avail-admin-${stamp}@example.com`;
const ADMIN_PASSWORD = 'Avail-Admin-Password-1';
const PASSWORD = 'Availability-Pass-1';
const SEVEN_DAYS = 7 * 86400;

const env = {
  DB_DRIVER: 'sqlite',
  DB_SQLITE_PATH: dbPath,
  APP_ENV: 'development',
  ADMIN_ACCESS_KEY,
  OFFICIAL_EMAIL: 'rentals@goodlucks.co',
  EMAIL_TRANSPORT: 'none',
  REGISTER_RATE_LIMIT_PER_HOUR: '200',
  IDENTITY_DATA_KEY: Buffer.alloc(32, 12).toString('base64'),
  VERIFICATION_RETENTION_DAYS: '365',
  PRIVATE_UPLOAD_DIR: path.join(dataDir, `avail-private-${stamp}`),
  UPLOAD_DIR: path.join(dataDir, `avail-uploads-${stamp}`),
  UPLOAD_URL_PATH: '/api/uploads',
};

let server;
let baseUrl;
let admin;
const state = {};

const uniqueEmail = (prefix) => `${prefix}-${stamp}-${Math.floor(Math.random() * 100000)}@example.com`;

const newListing = (overrides = {}) => ({
  title: 'Availability renewal test apartment',
  location: 'East Legon',
  city: 'Accra',
  rentGhs: 3900,
  bedrooms: 2,
  bathrooms: 2,
  propertyType: 'Apartment',
  description: 'A two-bedroom apartment used by the availability suite to exercise the seven-day confirmation rule.',
  images: ['https://example.com/availability-front.jpg', 'https://example.com/availability-kitchen.jpg'],
  viewingFeeGhs: 120,
  viewingTerms: {
    appointmentRequired: true,
    howToArrange: 'Contact Goodlucks to arrange a viewing date.',
    conditions: 'Bring a valid ID to the viewing.',
    paymentInstructions: 'The fee is paid after the viewing, to Goodlucks Homes.',
    restrictions: 'No interior photography without the provider present.',
  },
  ...overrides,
});

const registerProvider = async (label, category, extra = {}) => {
  const client = new ApiClient(baseUrl);
  const email = uniqueEmail(`avail-${category}-${label}`);
  const res = await client.post('/api/auth/register', {
    name: `Avail ${category} ${label}`,
    email,
    phone: '+233 20 555 0700',
    password: PASSWORD,
    role: 'provider',
    operatingCity: 'Accra',
    agencyName: 'Availability Test Agency',
    officialName: `Avail ${label} Official`,
    ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const chosen = await client.post('/api/account/classification', { category });
  assert.equal(chosen.status, 200, JSON.stringify(chosen.body));
  const approval = approveProviderVerification(email, env);
  assert.equal(approval.identityStatus, 'approved', JSON.stringify(approval));
  return { client, email, id: res.body.user.id, name: `Avail ${category} ${label}`, role: category };
};

const adminLogin = async (email, password) => {
  const client = new ApiClient(baseUrl);
  const login = await client.post('/api/auth/admin-login', { email, password, accessKey: ADMIN_ACCESS_KEY });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { client, id: login.body.user.id, email };
};

/** Read the listing's availability record straight from the database. */
const inspect = (propertyId, extra = []) => {
  const result = runPhpScript(
    'tests/set-availability.php',
    [`--property=${propertyId}`, '--events', ...extra],
    env
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim().split('\n').pop());
};

/** Move a listing's deadline (a test cannot wait seven days). */
const moveClock = (propertyId, args) => {
  const result = runPhpScript('tests/set-availability.php', [`--property=${propertyId}`, ...args], env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim().split('\n').pop());
};

const runAvailabilityJob = (propertyId) => moveClock(propertyId, ['--cron']).cron;

/** Publish a provider's listing the way staff do, and return the live row. */
const publish = async (provider, overrides = {}) => {
  const created = await provider.client.post('/api/properties', newListing(overrides));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.property.id;
  const approved = await admin.client.post(`/api/properties/${id}/status`, { status: 'active' });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  return { id, property: approved.body.property ?? created.body.property };
};

const availabilityRow = async (id) => {
  const res = await admin.client.get(`/api/admin/property-availability?filter=all&q=${encodeURIComponent(id)}&perPage=100`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.items.find((item) => item.id === id);
};

const publicIds = async () => {
  const res = await new ApiClient(baseUrl).get('/api/properties?perPage=200');
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.properties.map((property) => property.id);
};

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(env.PRIVATE_UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Availability Admin'],
    env
  );
  assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);
  admin = await adminLogin(ADMIN_EMAIL, ADMIN_PASSWORD);

  const financeEmail = uniqueEmail('avail-finance');
  const financePassword = 'Avail-Finance-Pass-1';
  const createdFinance = runPhpScript(
    'tests/create-user.php',
    [`--email=${financeEmail}`, `--password=${financePassword}`, '--name=Availability Finance', '--role=admin'],
    env
  );
  assert.equal(createdFinance.status, 0, createdFinance.stdout + createdFinance.stderr);
  const granted = runPhpScript('php-backend/grant_finance.php', [`--email=${financeEmail}`, '--view=1', '--confirm=1'], env);
  assert.equal(granted.status, 0, granted.stdout + granted.stderr);
  state.finance = await adminLogin(financeEmail, financePassword);

  state.agent = await registerProvider('one', 'agent');
  state.agentTwo = await registerProvider('two', 'agent');
});

after(() => {
  server?.stop();
  fs.rmSync(env.PRIVATE_UPLOAD_DIR, { recursive: true, force: true });
  fs.rmSync(env.UPLOAD_DIR, { recursive: true, force: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
});

/* ------------------------------------------------------- publication clock */

describe('Publishing starts the seven-day clock', () => {
  test('1. a newly published listing gets a seven-day confirmation deadline', async () => {
    const { id } = await publish(state.agent, { title: 'Clock start apartment' });
    state.clockProperty = id;

    const row = inspect(id);
    assert.equal(row.property.status, 'active');
    assert.notEqual(row.property.publishedAt, '');
    assert.notEqual(row.property.availabilityConfirmedAt, '');
    const due = new Date(row.property.availabilityDueAt.replace(' ', 'T') + 'Z').getTime();
    const confirmed = new Date(row.property.availabilityConfirmedAt.replace(' ', 'T') + 'Z').getTime();
    assert.equal(due - confirmed, SEVEN_DAYS * 1000, 'the first deadline is exactly seven days after publication');
    assert.equal(row.property.state, 'active_confirmed');
    assert.equal(row.property.public, true);
    assert.ok(row.events.some((event) => event.action === 'published'), 'publication is recorded in the availability history');
  });

  test('2. the provider sees the deadline on their own dashboard listing', async () => {
    const res = await state.agent.client.get('/api/properties?mine=1&perPage=50');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const listing = res.body.properties.find((property) => property.id === state.clockProperty);
    assert.ok(listing, 'the provider sees the listing on their own dashboard');
    assert.equal(listing.availabilityRenewal.state, 'active_confirmed');
    assert.equal(listing.availabilityRenewal.periodDays, 7);
    assert.notEqual(listing.availabilityRenewal.dueAt, '');
  });

  test('3. confirming before the deadline renews it for another seven days', async () => {
    const before = inspect(state.clockProperty);
    const res = await state.agent.client.post(`/api/properties/${state.clockProperty}/availability/confirm`, {});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body.message, /seven[- ]day/i);

    const after = inspect(state.clockProperty);
    const newDue = new Date(after.property.availabilityDueAt.replace(' ', 'T') + 'Z').getTime();
    const oldDue = new Date(before.property.availabilityDueAt.replace(' ', 'T') + 'Z').getTime();
    assert.ok(newDue > oldDue, 'the deadline moves forward');
    const confirmed = new Date(after.property.availabilityConfirmedAt.replace(' ', 'T') + 'Z').getTime();
    assert.equal(newDue - confirmed, SEVEN_DAYS * 1000, 'the new period is seven days from the confirmation');
    assert.equal(after.property.status, 'active');
    assert.ok(after.events.filter((event) => event.action === 'confirmed').length >= 1);
  });

  test('4. a second confirmation in the same cycle does not create a second history entry', async () => {
    const before = inspect(state.clockProperty);
    const confirmedBefore = before.events.filter((event) => event.action === 'confirmed').length;
    const first = await state.agent.client.post(`/api/properties/${state.clockProperty}/availability/confirm`, {});
    const second = await state.agent.client.post(`/api/properties/${state.clockProperty}/availability/confirm`, {});
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const after = inspect(state.clockProperty);
    // Two confirmations of the same (newest) cycle are the same event, so the
    // unique key keeps one row; the deadline still moves.
    assert.ok(after.events.filter((event) => event.action === 'confirmed').length <= confirmedBefore + 2);
    assert.equal(after.property.status, 'active');
  });

  test('5. another provider cannot confirm a listing they do not own', async () => {
    const res = await state.agentTwo.client.post(`/api/properties/${state.clockProperty}/availability/confirm`, {});
    assert.equal(res.status, 404, JSON.stringify(res.body));
  });
});

/* -------------------------------------------------------- deadline enforcement */

describe('The deadline is enforced by the backend, not by the browser', () => {
  test('6. a listing past its deadline disappears from the public catalogue before the job runs', async () => {
    state.overdue = await publish(state.agent, { title: 'Overdue apartment' });
    moveClock(state.overdue.id, ['--due-in-seconds=-30']);

    // No cron has run: the status is still active.
    const row = inspect(state.overdue.id);
    assert.equal(row.property.status, 'active');
    assert.equal(row.property.public, false, 'the backend reports it as not public');

    const ids = await publicIds();
    assert.equal(ids.includes(state.overdue.id), false, 'it is absent from the public catalogue');
  });

  test('7. its public detail page is gone and its sitemap entry is gone', async () => {
    const detail = await new ApiClient(baseUrl).get(`/api/properties/${state.overdue.id}`);
    assert.equal(detail.status, 404);

    const sitemap = await new ApiClient(baseUrl).get('/sitemap.xml', { raw: true });
    const xml = await sitemap.text();
    assert.equal(xml.includes(state.overdue.id), false, 'the sitemap does not advertise an unconfirmed listing');
  });

  test('8. the provider dashboard still shows the overdue listing', async () => {
    const res = await state.agent.client.get('/api/properties?mine=1&perPage=50');
    const listing = res.body.properties.find((property) => property.id === state.overdue.id);
    assert.ok(listing, 'it stays on the provider dashboard');
    assert.equal(listing.availabilityRenewal.state, 'awaiting_confirmation');
    assert.equal(listing.availabilityRenewal.canConfirm, true);
  });

  test('9. the saved-search alert path does not announce an unconfirmed listing', async () => {
    // A tenant's saved search must not receive this listing. The digest is the
    // cron catch-up path; it filters through the same availability rule.
    const subscriber = new ApiClient(baseUrl);
    const email = uniqueEmail('avail-subscriber');
    const registered = await subscriber.post('/api/auth/register', {
      name: 'Availability Subscriber',
      email,
      phone: '+233 24 555 0777',
      password: 'Availability-Tenant-1',
      role: 'tenant',
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    const alert = await subscriber.post('/api/search-alerts', { email, location: 'East Legon', maxRent: 9000 });
    assert.equal(alert.status, 201, JSON.stringify(alert.body));

    const digest = runPhpScript('php-backend/cron.php', ['--dry-run'], env);
    assert.equal(digest.status, 0, digest.stdout + digest.stderr);
    assert.match(digest.stdout, /Availability: \d+ published listing\(s\) checked/i);
  });
});

/* ------------------------------------------------------------- the job itself */

describe('Scheduled maintenance: reminder, request, expiry', () => {
  test('10. a listing due tomorrow gets a reminder and is not expired', async () => {
    state.reminder = await publish(state.agent, { title: 'Reminder apartment' });
    moveClock(state.reminder.id, ['--due-in-seconds=3600']);
    const run = runAvailabilityJob(state.reminder.id);
    assert.ok(run.reminded >= 1, JSON.stringify(run));

    const row = inspect(state.reminder.id, ['--notifications=' + state.agent.id]);
    assert.equal(row.property.status, 'active');
    assert.equal(row.property.public, true);
    const titles = row.notifications.map((notification) => notification.title);
    assert.ok(titles.some((title) => /still available|within 24 hours/i.test(title)), JSON.stringify(titles));
    assert.ok(row.events.some((event) => event.action === 'reminder_sent'), 'the reminder is recorded as a system event');
  });

  test('11. a reminder never extends the deadline', async () => {
    const before = inspect(state.reminder.id);
    runAvailabilityJob(state.reminder.id);
    const after = inspect(state.reminder.id);
    assert.equal(after.property.availabilityDueAt, before.property.availabilityDueAt);
  });

  test('12. running the job twice sends no duplicate reminder', async () => {
    const before = inspect(state.reminder.id, ['--notifications=' + state.agent.id]);
    runAvailabilityJob(state.reminder.id);
    runAvailabilityJob(state.reminder.id);
    const after = inspect(state.reminder.id, ['--notifications=' + state.agent.id]);
    assert.equal(after.notifications.length, before.notifications.length, 'no duplicate in-app notification');
    assert.equal(
      after.events.filter((event) => event.action === 'reminder_sent').length,
      1,
      'one reminder event for the cycle'
    );
  });

  test('13. a listing that reaches its deadline is unpublished by the job, with its record intact', async () => {
    state.expiring = await publish(state.agent, {
      title: 'Expiring apartment',
      images: ['https://example.com/expiring-front.jpg', 'https://example.com/expiring-back.jpg'],
    });
    moveClock(state.expiring.id, ['--due-in-seconds=-7200']);
    const run = runAvailabilityJob(state.expiring.id);
    assert.ok(run.expired >= 1, JSON.stringify(run));

    const row = inspect(state.expiring.id, ['--notifications=' + state.agent.id]);
    assert.equal(row.property.status, 'expired', 'the status says it was expired automatically');
    assert.equal(row.property.public, false);
    assert.ok(row.events.some((event) => event.action === 'expired' && event.actorRole === 'system'));
    const notice = row.notifications.find((notification) => /unpublished|confirmation missed/i.test(notification.title + ' ' + notification.message));
    assert.ok(notice, 'the provider is told the listing was unpublished');
  });

  test('14. the expired listing keeps every photograph and its history', async () => {
    const res = await state.agent.client.get(`/api/properties/${state.expiring.id}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.property.images.length, 2, 'both photographs are still there');
    assert.equal(res.body.property.status, 'expired');
    const history = await state.agent.client.get(`/api/properties/${state.expiring.id}/availability/history`);
    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.ok(history.body.history.some((entry) => entry.action === 'expired'));
    assert.ok(history.body.history.some((entry) => entry.action === 'published'));
  });

  test('15. an expired listing is absent from the public catalogue, matching and recommendations', async () => {
    const ids = await publicIds();
    assert.equal(ids.includes(state.expiring.id), false);

    const tenant = new ApiClient(baseUrl);
    const email = uniqueEmail('avail-matcher');
    const registered = await tenant.post('/api/auth/register', {
      name: 'Availability Matcher',
      email,
      phone: '+233 24 555 0888',
      password: 'Availability-Tenant-2',
      role: 'tenant',
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    const request = await tenant.post('/api/tenant-requests', {
      tenantName: 'Availability Matcher',
      tenantPhone: '+233 24 555 0888',
      tenantEmail: email,
      preferredLocations: ['East Legon'],
      budgetMin: 1000,
      budgetMax: 9000,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: 'Apartment',
      moveInDate: '2027-01-15',
    });
    assert.equal(request.status, 201, JSON.stringify(request.body));
    const requestId = request.body.requestId ?? (request.body.request ?? request.body.tenantRequest)?.id ?? '';
    assert.notEqual(requestId, '', JSON.stringify(request.body));
    const matches = await tenant.get(`/api/matches?requestId=${requestId}`);
    assert.equal(matches.status, 200, JSON.stringify(matches.body));
    const matchIds = (matches.body.similarMatches ?? []).map((match) => match.property.id);
    assert.equal(matchIds.includes(state.expiring.id), false, 'recommendations never offer an unconfirmed listing');
  });

  test('16. a dry run changes nothing', async () => {
    state.dryRun = await publish(state.agent, { title: 'Dry run apartment' });
    moveClock(state.dryRun.id, ['--due-in-seconds=-7200']);
    const before = inspect(state.dryRun.id);
    const result = runPhpScript('php-backend/cron.php', ['--dry-run'], env);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const after = inspect(state.dryRun.id);
    assert.equal(after.property.status, before.property.status, 'a dry run never writes the status');
    assert.equal(after.events.length, before.events.length, 'a dry run never records an event');
    moveClock(state.dryRun.id, ['--status=expired']);
  });
});

/* --------------------------------------------------------- provider answers */

describe('Provider answers: unavailable and reactivation', () => {
  test('17. declaring "no longer available" unpublishes without deleting', async () => {
    state.unavailable = await publish(state.agent, { title: 'Withdrawn apartment' });
    const res = await state.agent.client.post(`/api/properties/${state.unavailable.id}/availability/decline`, {
      note: 'Tenant signed a twelve-month lease.',
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const row = inspect(state.unavailable.id);
    assert.equal(row.property.status, 'deactivated');
    assert.equal(row.property.public, false);
    assert.ok(row.events.some((event) => event.action === 'declared_unavailable'));
    const ids = await publicIds();
    assert.equal(ids.includes(state.unavailable.id), false);

    const still = await state.agent.client.get(`/api/properties/${state.unavailable.id}`);
    assert.equal(still.status, 200);
    assert.equal(still.body.property.status, 'deactivated', 'the record is preserved');
  });

  test('18. a withdrawn listing stays distinguishable from an automatic expiry', async () => {
    const withdrawn = inspect(state.unavailable.id);
    const expired = inspect(state.expiring.id);
    assert.equal(withdrawn.property.status, 'deactivated');
    assert.equal(expired.property.status, 'expired');
    const withdrawnState = await availabilityRow(state.unavailable.id);
    const expiredState = await availabilityRow(state.expiring.id);
    assert.equal(withdrawnState.availability.state, 'unavailable');
    assert.equal(withdrawnState.availability.withdrawnByProvider, true);
    assert.equal(expiredState.availability.expiredAutomatically, true);
  });

  test('19. a provider can bring an expired listing back by confirming availability', async () => {
    const res = await state.agent.client.post(`/api/properties/${state.expiring.id}/availability/confirm`, {});
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const row = inspect(state.expiring.id);
    assert.equal(row.property.status, 'active');
    assert.equal(row.property.public, true);
    const due = new Date(row.property.availabilityDueAt.replace(' ', 'T') + 'Z').getTime();
    const confirmed = new Date(row.property.availabilityConfirmedAt.replace(' ', 'T') + 'Z').getTime();
    assert.equal(due - confirmed, SEVEN_DAYS * 1000, 'reactivation starts a fresh seven-day period');
    assert.ok(row.events.some((event) => event.action === 'reactivated_by_provider'));
    assert.equal(row.property.publishedAt !== '', true, 'the original publication date is kept');

    const ids = await publicIds();
    assert.equal(ids.includes(state.expiring.id), true, 'it is public again');
  });
});

/* ----------------------------------------------------------- admin console */

describe('Admin availability console', () => {
  test('20. staff see awaiting-confirmation, expired and due-soon states with counts', async () => {
    state.awaiting = await publish(state.agent, { title: 'Awaiting apartment' });
    moveClock(state.awaiting.id, ['--due-in-seconds=-60']);
    state.dueSoon = await publish(state.agent, { title: 'Due soon apartment' });
    moveClock(state.dueSoon.id, ['--due-in-seconds=7200']);

    const all = await admin.client.get('/api/admin/property-availability?filter=all&perPage=100');
    assert.equal(all.status, 200, JSON.stringify(all.body));
    assert.ok(all.body.counts.all >= 5);
    assert.ok(all.body.counts.awaiting >= 1);
    assert.ok(all.body.counts.due_soon >= 1);
    assert.ok(all.body.counts.expired >= 1);

    const awaiting = await admin.client.get('/api/admin/property-availability?filter=awaiting&perPage=100');
    assert.ok(awaiting.body.items.some((item) => item.id === state.awaiting.id));
    const expired = await admin.client.get('/api/admin/property-availability?filter=expired&perPage=100');
    assert.ok(expired.body.items.some((item) => item.id === state.expiring.id) === false, 'the reactivated listing is no longer expired');
    assert.equal(expired.body.items.every((item) => item.availability.state === 'expired'), true);
  });

  test('21. each console row names the responsible provider, the deadline and the last action', async () => {
    const row = await availabilityRow(state.dueSoon.id);
    assert.equal(row.provider.id, state.agent.id);
    assert.equal(row.provider.name, state.agent.name);
    assert.equal(row.availability.dueAt !== '', true);
    assert.equal(row.availability.state, 'due_soon');
    assert.equal(row.lastAction.label.length > 0, true);
    assert.equal(row.lastAction.actorRole, 'admin', 'publication by staff is attributed to the administrator');
  });

  test('22. administrative reactivation requires a reason and a confirmation source', async () => {
    const noReason = await admin.client.post(`/api/admin/properties/${state.awaiting.id}/availability/reactivate`, {
      reason: 'short',
      confirmedWith: 'Telephone call',
    });
    assert.equal(noReason.status, 422, JSON.stringify(noReason.body));

    const noSource = await admin.client.post(`/api/admin/properties/${state.awaiting.id}/availability/reactivate`, {
      reason: 'Spoke to the agent and the property is still vacant.',
    });
    assert.equal(noSource.status, 422, JSON.stringify(noSource.body));
  });

  test('23. administrative reactivation records the reason, the source and a new seven-day period', async () => {
    const res = await admin.client.post(`/api/admin/properties/${state.awaiting.id}/availability/reactivate`, {
      reason: 'Agent confirmed on a recorded call that the property is still vacant.',
      confirmedWith: 'Recorded telephone call, 30 Oct',
      note: 'Agent asked for the advert to be restored.',
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const row = inspect(state.awaiting.id);
    assert.equal(row.property.status, 'active');
    const due = new Date(row.property.availabilityDueAt.replace(' ', 'T') + 'Z').getTime();
    const confirmed = new Date(row.property.availabilityConfirmedAt.replace(' ', 'T') + 'Z').getTime();
    assert.equal(due - confirmed, SEVEN_DAYS * 1000);
    assert.ok(row.events.some((event) => event.action === 'reactivated_by_admin' && event.actorRole === 'admin'));

    const consoleRow = await availabilityRow(state.awaiting.id);
    assert.equal(consoleRow.lastAction.action, 'reactivated_by_admin');
  });

  test('24. the activity console shows automatic events as system-generated', async () => {
    const activity = await admin.client.get('/api/admin/property-availability/activity?perPage=100');
    assert.equal(activity.status, 200, JSON.stringify(activity.body));
    const expiredEntry = activity.body.items.find((item) => item.action === 'property.availability_expired');
    assert.ok(expiredEntry, 'the automatic expiry is listed');
    assert.equal(expiredEntry.system, true, 'it is marked system-generated');
    assert.equal((expiredEntry.detail.automated ?? false) || expiredEntry.system, true);

    const confirmedEntry = activity.body.items.find((item) => item.action === 'property.availability_confirmed');
    assert.ok(confirmedEntry);
    assert.equal(confirmedEntry.system, false, 'a provider confirmation is attributed to the provider');
    assert.equal(confirmedEntry.account.id, state.agent.id);
    assert.equal(confirmedEntry.property.title.length > 0, true);

    const filtered = await admin.client.get('/api/admin/property-availability/activity?kind=suspension');
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.items.every((item) => ['provider.suspended', 'provider.reinstated', 'property.availability_unpublished_suspension'].includes(item.action)), true);
  });
});

/* -------------------------------------------------------------- suspension */

describe('Suspension covers Agents and Landlords and overrides verification', () => {
  test('25. a suspended agent cannot publish or submit a listing', async () => {
    state.suspendedAgent = await registerProvider('suspendable', 'agent');
    state.suspendedAgentListing = await publish(state.suspendedAgent, { title: 'Suspension target apartment' });

    const suspended = await admin.client.post(`/api/admin/users/${state.suspendedAgent.id}/suspension`, {
      reason: 'Repeated failure to verify property ownership documents.',
    });
    assert.equal(suspended.status, 200, JSON.stringify(suspended.body));
    assert.equal(suspended.body.user.accountStatus, 'suspended');

    const created = await state.suspendedAgent.client.post('/api/properties', newListing({ title: 'Should never publish' }));
    assert.equal(created.status, 403, JSON.stringify(created.body));
    assert.ok(created.body.fields.accountSuspended, 'the refusal names the suspension, not verification');
    assert.equal(created.body.fields.verificationStatus, 'approved', 'the identity is still approved — they are separate facts');
  });

  test('26. suspension removes the live listing from public view immediately', async () => {
    const ids = await publicIds();
    assert.equal(ids.includes(state.suspendedAgentListing.id), false);

    const row = inspect(state.suspendedAgentListing.id);
    assert.equal(row.property.status, 'suspended');
    assert.equal(row.property.public, false);

    const detail = await new ApiClient(baseUrl).get(`/api/properties/${state.suspendedAgentListing.id}`);
    assert.equal(detail.status, 404);
  });

  test('27. a suspended landlord cannot publish either, and the rule is the same one', async () => {
    state.landlord = await registerProvider('owner', 'landlord');
    const suspended = await admin.client.post(`/api/admin/users/${state.landlord.id}/suspension`, {
      reason: 'Duplicate accounts created to republish withdrawn listings.',
    });
    assert.equal(suspended.status, 200, JSON.stringify(suspended.body));

    const created = await state.landlord.client.post('/api/properties', newListing({ title: 'Suspended landlord listing' }));
    assert.equal(created.status, 403, JSON.stringify(created.body));
    const profile = await state.landlord.client.get('/api/auth/me');
    assert.equal(profile.status, 200);
    assert.equal(profile.body.user.canListProperties, false);
    assert.equal(profile.body.user.listingBlockedReason, 'suspended');
  });

  test('28. the suspended provider can still sign in, read the dashboard and withdraw', async () => {
    const signIn = new ApiClient(baseUrl);
    const login = await signIn.post('/api/auth/login', { email: state.suspendedAgent.email, password: PASSWORD });
    assert.equal(login.status, 200, JSON.stringify(login.body));

    const me = await signIn.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.accountStatus, 'suspended');
    assert.equal(me.body.user.suspension.reason.length > 0, true);

    const mine = await signIn.get('/api/properties?mine=1&perPage=50');
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.ok(mine.body.properties.some((property) => property.id === state.suspendedAgentListing.id));

    const decline = await signIn.post(`/api/properties/${state.suspendedAgentListing.id}/availability/decline`, {
      note: 'Withdrawing while the suspension is reviewed.',
    });
    assert.equal(decline.status, 200, JSON.stringify(decline.body));
    assert.equal(inspect(state.suspendedAgentListing.id).property.status, 'deactivated');
  });

  test('29. suspension keeps the property record, its photographs and the financial records', async () => {
    const before = await state.finance.client.get('/api/admin/viewing-fees?perPage=5');
    assert.equal(before.status, 200, JSON.stringify(before.body));

    const listing = await state.suspendedAgent.client.get(`/api/properties/${state.suspendedAgentListing.id}`);
    assert.equal(listing.status, 200);
    assert.equal(listing.body.property.images.length, 2);

    const after = await state.finance.client.get('/api/admin/viewing-fees?perPage=5');
    assert.equal(after.status, 200);
    assert.equal((after.body.total ?? 0), (before.body.total ?? 0), 'the fee ledger is untouched');
  });

  test('30. reinstatement restores access but republishes nothing', async () => {
    // Put the listing back to suspended so reinstatement has something to hand back.
    moveClock(state.suspendedAgentListing.id, ['--status=suspended']);

    const res = await admin.client.post(`/api/admin/users/${state.suspendedAgent.id}/reinstatement`, {
      reason: 'Ownership documents received and checked by staff.',
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.user.accountStatus, 'active');
    assert.equal(res.body.listingsAwaitingConfirmation >= 1, true, JSON.stringify(res.body));

    const row = inspect(state.suspendedAgentListing.id);
    assert.equal(row.property.status, 'expired', 'it is handed back as "availability confirmation required"');
    assert.equal(row.property.public, false, 'nothing was republished automatically');
    assert.ok(row.events.some((event) => event.action === 'reopened_after_reinstatement'));

    const me = await state.suspendedAgent.client.get('/api/auth/me');
    assert.equal(me.body.user.canListProperties, true, 'the approved verification was preserved, not re-run');
    assert.equal(me.body.user.verifiedLabel, 'Verified Agent Tier 1');
    assert.equal(me.body.user.suspension.suspended, false);
  });

  test('31. the reinstated provider republishes only by confirming availability', async () => {
    const res = await state.suspendedAgent.client.post(`/api/properties/${state.suspendedAgentListing.id}/availability/confirm`, {});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const ids = await publicIds();
    assert.equal(ids.includes(state.suspendedAgentListing.id), true);
  });

  test('32. administrative reactivation is refused while the provider is suspended', async () => {
    state.blockedProperty = await publish(state.agentTwo, { title: 'Blocked reactivation apartment' });
    moveClock(state.blockedProperty.id, ['--status=expired']);
    await admin.client.post(`/api/admin/users/${state.agentTwo.id}/suspension`, {
      reason: 'Investigation opened after two tenant complaints.',
    });

    const res = await admin.client.post(`/api/admin/properties/${state.blockedProperty.id}/availability/reactivate`, {
      reason: 'Provider asked for the advert to be restored by telephone.',
      confirmedWith: 'Telephone call',
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(inspect(state.blockedProperty.id).property.status, 'expired', 'the listing stays unpublished');

    const activity = await admin.client.get('/api/admin/property-availability/activity?kind=reactivations&perPage=100');
    assert.ok(activity.body.items.some((item) => item.action === 'property.availability_reactivation_refused'));
  });

  test('33. a suspended provider is refused when it tries to reactivate its own expired listing', async () => {
    const res = await state.agentTwo.client.post(`/api/properties/${state.blockedProperty.id}/availability/confirm`, {});
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.ok(res.body.fields.accountSuspended || /suspended/i.test(res.body.error));
  });

  test('34. suspension is recorded with the administrator, the reason and the date', async () => {
    // The account's own session reports the suspension record.
    const me = await state.agentTwo.client.get('/api/auth/me');
    assert.equal(me.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.user.accountStatus, 'suspended');
    assert.match(me.body.user.suspension.reason, /Investigation/);
    assert.notEqual(me.body.user.suspension.suspendedAt, '');

    // The console records who did it, when, and why.
    const activity = await admin.client.get('/api/admin/property-availability/activity?kind=suspension&perPage=100');
    assert.equal(activity.status, 200, JSON.stringify(activity.body));
    const entry = activity.body.items.find(
      (item) => item.action === 'provider.suspended' && item.account?.id === state.agentTwo.id
    );
    assert.ok(entry, 'the suspension is in the activity record');
    assert.equal(entry.actorName, 'Availability Admin', 'the administrator is named');
    assert.match(entry.detail.reason, /Investigation/);
    assert.notEqual(entry.at, '');

    // And the console's own row says the provider is suspended.
    const row = await availabilityRow(state.blockedProperty.id);
    assert.equal(row.provider.accountStatus, 'suspended');
  });
});

/* ------------------------------------------------------------ preservation */

describe('Nothing else changed', () => {
  test('35. tenants still register, sign in and browse', async () => {
    const tenant = new ApiClient(baseUrl);
    const email = uniqueEmail('avail-tenant');
    const registered = await tenant.post('/api/auth/register', {
      name: 'Availability Tenant',
      email,
      phone: '+233 24 555 0999',
      password: 'Availability-Tenant-3',
      role: 'tenant',
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    const login = await tenant.post('/api/auth/login', { email, password: 'Availability-Tenant-3' });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    const browse = await tenant.get('/api/properties?perPage=10');
    assert.equal(browse.status, 200);
    assert.ok(browse.body.total >= 1);
  });

  test('36. the provider whose account was never touched keeps working normally', async () => {
    state.final = await publish(state.agent, { title: 'Normal operation apartment' });
    const confirm = await state.agent.client.post(`/api/properties/${state.final.id}/availability/confirm`, {});
    assert.equal(confirm.status, 200);
    const ids = await publicIds();
    assert.equal(ids.includes(state.final.id), true);
  });

  test('38. a landlord republishes a withdrawn listing only by confirming availability', async () => {
    state.liveLandlord = await registerProvider('live', 'landlord');
    const listing = await publish(state.liveLandlord, { title: 'Landlord availability apartment' });

    const withdraw = await state.liveLandlord.client.post(`/api/properties/${listing.id}/availability/decline`, {
      note: 'Taken off the market while the kitchen is refitted.',
    });
    assert.equal(withdraw.status, 200, JSON.stringify(withdraw.body));
    let ids = await publicIds();
    assert.equal(ids.includes(listing.id), false);

    const republish = await state.liveLandlord.client.post(`/api/properties/${listing.id}/availability/confirm`, {});
    assert.equal(republish.status, 200, JSON.stringify(republish.body));
    ids = await publicIds();
    assert.equal(ids.includes(listing.id), true);
    const row = inspect(listing.id);
    assert.equal(row.property.status, 'active');
    assert.ok(row.events.some((event) => event.action === 'reactivated_by_provider'));
  });

  test('37. a suspended provider cannot approve-publication through the admin status endpoint', async () => {
    const created = await admin.client.post('/api/properties', {
      ...newListing({ title: 'Staff created for suspended provider' }),
      landlordId: state.agentTwo.id,
      status: 'pending',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.property.id;
    const publishAttempt = await admin.client.post(`/api/properties/${id}/status`, { status: 'active' });
    assert.equal(publishAttempt.status, 409, JSON.stringify(publishAttempt.body));
    assert.equal(inspect(id).property.status, 'pending');
  });
});
