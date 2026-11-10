/**
 * Goodlucks Homes — Upgrade 2 · Phase 5
 * Tenant experience: B1 move-in date, B2 real match scores, B3 chosen-for-you vs
 * similar matches, B5 viewing lifecycle with tenant acceptance, B6 controlled
 * contact disclosure, D1 the three-request cap.
 *
 * Everything here drives the real API against a real SQLite database, because
 * the point of the phase is that the numbers and the permissions are true.
 *
 *   node --test tests/tenant-experience.test.mjs
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
const dbPath = path.join(dataDir, `tenant-experience-${stamp}.sqlite`);
const privateDir = path.join(dataDir, `tenant-experience-private-${stamp}`);
const port = 9600 + Math.floor(Math.random() * 90);

const ADMIN_EMAIL = 'phase5.admin@test.local';
const ADMIN_PASSWORD = 'Phase5-Admin-Password-123';
const ADMIN_ACCESS_KEY = 'phase5-test-key';
const LANDLORD_EMAIL = `phase5.landlord-${stamp}@example.com`;
const TENANT_EMAIL = `phase5.tenant-${stamp}@example.com`;
const AGENT_EMAIL = `phase5.agent-${stamp}@example.com`;
const TENANT_PHONE = '+233 24 501 9911';

let server;
let baseUrl;
const state = { env: {}, properties: {}, viewings: {} };

const daysFromNow = (days) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

/** Read rows straight from the test database. */
const dbRows = (sql) => {
  const result = runPhpScript('tests/sqlite-tool.php', [`--path=${dbPath}`, '--mode=query', `--sql=${sql}`], {
    DB_DRIVER: 'sqlite',
    DB_SQLITE_PATH: dbPath,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim()).rows;
};

const createListing = async (client, overrides = {}) => {
  const res = await client.post('/api/properties', {
    title: overrides.title ?? 'Phase 5 listing',
    location: overrides.location ?? 'East Legon, Accra',
    city: 'Accra',
    rentGhs: overrides.rentGhs ?? 5000,
    bedrooms: overrides.bedrooms ?? 3,
    bathrooms: overrides.bathrooms ?? 2,
    propertyType: overrides.propertyType ?? 'Apartment',
    description: 'A listing created for the Phase 5 tenant-experience suite so the scorer has real rows.',
    images: ['https://images.unsplash.com/photo-1502672260266-1c1ef2d93688'],
    availability: 'Available Now',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.property.id;
};

const rentalRequest = (overrides = {}) => ({
  tenantName: 'Phase Five Tenant',
  tenantPhone: TENANT_PHONE,
  tenantEmail: TENANT_EMAIL,
  preferredLocations: ['East Legon'],
  budgetMin: 4000,
  budgetMax: 6000,
  bedrooms: 3,
  bathrooms: 2,
  propertyType: 'Apartment',
  moveInDate: daysFromNow(30),
  notes: 'Looking for a family home in East Legon.',
  ...overrides,
});

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(privateDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });

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
    VIEWING_RATE_LIMIT_PER_HOUR: '200',
    VIEWING_ACTION_RATE_LIMIT_PER_HOUR: '2000',
  };
  state.env = env;

  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Phase Five Admin'],
    env
  );
  assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);

  for (const [email, password, name, role] of [
    [LANDLORD_EMAIL, 'Phase5-Landlord-Password-1', 'Phase Five Landlord', 'landlord'],
    [TENANT_EMAIL, 'Phase5-Tenant-Password-1', 'Phase Five Tenant', 'tenant'],
  ]) {
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${password}`, `--name=${name}`, `--role=${role}`],
      env
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);
  }

  state.admin = new ApiClient(baseUrl);
  state.landlord = new ApiClient(baseUrl);
  state.tenant = new ApiClient(baseUrl);
  state.agent = new ApiClient(baseUrl);

  const adminLogin = await state.admin.post('/api/auth/admin-login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    accessKey: ADMIN_ACCESS_KEY,
  });
  assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.body));

  for (const [client, email, password] of [
    [state.landlord, LANDLORD_EMAIL, 'Phase5-Landlord-Password-1'],
    [state.tenant, TENANT_EMAIL, 'Phase5-Tenant-Password-1'],
  ]) {
    const login = await client.post('/api/auth/login', { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
  }

  state.tenantId = (await state.tenant.get('/api/auth/me')).body.user.id;

  // An agent exists through registration (the profile is created pending
  // review) and only becomes usable once an administrator activates it — the
  // same path a real agency takes.
  const agentClient = new ApiClient(baseUrl);
  const registered = await agentClient.post('/api/auth/register', {
    name: 'Phase Five Agent',
    email: AGENT_EMAIL,
    phone: '+233 20 555 0505',
    password: 'Phase5-Agent-Password-1',
    role: 'agent',
    operatingCity: 'Accra',
    agencyName: 'Phase Five Agency',
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  state.agentId = registered.body.user.id;
  const activated = await state.admin.post(`/api/admin/agents/${state.agentId}/status`, {
    accountStatus: 'active',
    canSubmitListings: true,
  });
  assert.equal(activated.status, 200, JSON.stringify(activated.body));

  const agentLogin = await state.agent.post('/api/auth/login', {
    email: AGENT_EMAIL,
    password: 'Phase5-Agent-Password-1',
  });
  assert.equal(agentLogin.status, 200, JSON.stringify(agentLogin.body));

  // Four real listings, so the scorer has something to rank honestly.
  state.properties.perfect = await createListing(state.landlord, {
    title: 'Phase 5 perfect fit',
    location: 'East Legon, Accra',
    rentGhs: 5200,
    bedrooms: 3,
    bathrooms: 2,
    propertyType: 'Apartment',
  });
  state.properties.poor = await createListing(state.landlord, {
    title: 'Phase 5 over budget',
    location: 'East Legon, Accra',
    rentGhs: 12000,
    bedrooms: 2,
    bathrooms: 1,
    propertyType: 'Townhouse',
  });
  state.properties.neighbour = await createListing(state.landlord, {
    title: 'Phase 5 neighbouring area',
    location: 'Cantonments, Accra',
    rentGhs: 5200,
    bedrooms: 3,
    bathrooms: 2,
    propertyType: 'Apartment',
  });
  state.properties.unrelated = await createListing(state.landlord, {
    title: 'Phase 5 unrecorded area',
    location: 'Osu, Accra',
    rentGhs: 5200,
    bedrooms: 3,
    bathrooms: 2,
    propertyType: 'Apartment',
  });

  for (const id of Object.values(state.properties)) {
    const published = await state.admin.post(`/api/properties/${id}/status`, { status: 'active' });
    assert.equal(published.status, 200, JSON.stringify(published.body));
  }
});

after(async () => {
  if (server) await server.stop();
});

const matchesFor = async (requestId) => {
  const res = await state.tenant.get(`/api/matches?requestId=${encodeURIComponent(requestId)}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

describe('B1 — the move-in date is a real answer, not a default', () => {
  test('a rental request without a move-in date is refused with a field error', async () => {
    const res = await state.tenant.post('/api/tenant-requests', rentalRequest({ moveInDate: '' }));
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.ok(res.body.fields?.moveInDate, 'the error names the missing field');

    const missing = await state.tenant.post('/api/tenant-requests', (() => {
      const body = rentalRequest();
      delete body.moveInDate;
      return body;
    })());
    assert.equal(missing.status, 422);
  });
});

describe('D1 — at most three rental requests in progress', () => {
  test('the fourth open request is refused, and unblocked when one moves on', async () => {
    state.requestIds = [];
    for (let index = 0; index < 3; index += 1) {
      const res = await state.tenant.post(
        '/api/tenant-requests',
        rentalRequest({ budgetMin: 4000 + index * 100, budgetMax: 6000 + index * 100 })
      );
      assert.equal(res.status, 201, JSON.stringify(res.body));
      state.requestIds.push(res.body.requestId);
    }

    const fourth = await state.tenant.post(
      '/api/tenant-requests',
      rentalRequest({ budgetMin: 4000, budgetMax: 9000, notes: 'The fourth open request should be refused.' })
    );
    assert.equal(fourth.status, 409, JSON.stringify(fourth.body));
    assert.match(fourth.body.error, /3 rental requests/i);

    // Moving one on (staff approve matches) frees a slot immediately.
    const moved = await state.admin.patch(`/api/tenant-requests/${state.requestIds[2]}`, { status: 'searching' });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));

    const stillBlocked = await state.tenant.post(
      '/api/tenant-requests',
      rentalRequest({ budgetMin: 4000, budgetMax: 9100, notes: 'Still three in progress.' })
    );
    assert.equal(stillBlocked.status, 409, 'a request that is still in progress keeps the cap');

    const matched = await state.admin.patch(`/api/tenant-requests/${state.requestIds[2]}`, { status: 'matched' });
    assert.equal(matched.status, 200, JSON.stringify(matched.body));

    const allowed = await state.tenant.post(
      '/api/tenant-requests',
      rentalRequest({ budgetMin: 4000, budgetMax: 9200, notes: 'One request moved on, so this is allowed.' })
    );
    assert.equal(allowed.status, 201, JSON.stringify(allowed.body));
    state.requestIds.push(allowed.body.requestId);
  });
});

describe('B2 — match scores are a documented weighted sum', () => {
  test('every match explains itself with six weighted factors', async () => {
    const result = await matchesFor(state.requestIds[0]);
    assert.ok(result.matches.length >= 4, 'all four listings are scored');

    for (const entry of result.matches) {
      assert.equal(typeof entry.score, 'number');
      assert.ok(entry.score >= 0 && entry.score <= 100, `score ${entry.score} is a percentage`);
      assert.equal(entry.breakdown.length, 6);
      const total = entry.breakdown.reduce((sum, factor) => sum + factor.points, 0);
      assert.equal(total, entry.score, 'the breakdown adds up to the score');
      const maxima = Object.fromEntries(entry.breakdown.map((factor) => [factor.factor, factor.max]));
      assert.deepEqual(maxima, {
        budget: 35,
        location: 20,
        proximity: 15,
        type: 10,
        bedrooms: 10,
        bathrooms: 10,
      });
      for (const factor of entry.breakdown) {
        assert.ok(factor.points <= factor.max);
        assert.ok(factor.detail.length > 0, 'every factor says why');
      }
      assert.ok(entry.reason.length > 0);
    }
  });

  test('a better fit scores higher, and proximity counts only when recorded', async () => {
    const before = await matchesFor(state.requestIds[0]);
    const scoreOf = (result, id) => {
      const entry = result.matches.find((row) => row.property.id === id);
      assert.ok(entry, `listing ${id} is scored`);
      return entry;
    };

    const perfect = scoreOf(before, state.properties.perfect);
    const poor = scoreOf(before, state.properties.poor);
    assert.ok(perfect.score > poor.score, 'a fit inside budget beats an over-budget townhouse');
    assert.equal(perfect.breakdown.find((f) => f.factor === 'budget').points, 35);
    assert.ok(poor.breakdown.find((f) => f.factor === 'budget').points < 35);

    // With nothing recorded, the two non-preferred areas are treated the same.
    const neighbourBefore = scoreOf(before, state.properties.neighbour);
    const unrelatedBefore = scoreOf(before, state.properties.unrelated);
    assert.equal(neighbourBefore.breakdown.find((f) => f.factor === 'proximity').points, 0);
    assert.equal(unrelatedBefore.breakdown.find((f) => f.factor === 'proximity').points, 0);
    assert.match(
      neighbourBefore.breakdown.find((f) => f.factor === 'proximity').detail,
      /no proximity is recorded/i
    );

    // Staff record that Cantonments is next to East Legon.
    const saved = await state.admin.post('/api/admin/area-adjacency', {
      areaA: 'East Legon',
      areaB: 'Cantonments',
      band: 1,
      note: 'Walkable via the Lagos Avenue end.',
    });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    state.adjacencyId = saved.body.adjacency.id;

    const after = await matchesFor(state.requestIds[0]);
    const neighbourAfter = scoreOf(after, state.properties.neighbour);
    const unrelatedAfter = scoreOf(after, state.properties.unrelated);

    assert.equal(neighbourAfter.breakdown.find((f) => f.factor === 'proximity').points, 15);
    assert.equal(unrelatedAfter.breakdown.find((f) => f.factor === 'proximity').points, 0);
    assert.equal(neighbourAfter.score, neighbourBefore.score + 15);
    assert.equal(unrelatedAfter.score, unrelatedBefore.score);
    assert.ok(neighbourAfter.score > unrelatedAfter.score, 'the recorded neighbour now ranks higher');

    // The pair is undirected: asking the other way round finds the same row.
    const second = await state.admin.post('/api/admin/area-adjacency', {
      areaA: 'Cantonments',
      areaB: 'east legon',
      band: 2,
    });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(second.body.adjacency.id, state.adjacencyId, 'the same pair is updated, never duplicated');
    assert.equal(second.body.adjacency.band, 2);

    const listed = await state.admin.get('/api/admin/area-adjacency');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.adjacencies.length, 1);
    assert.ok(listed.body.areas.includes('East Legon'));

    // Removing the judgement removes its effect — the score is derived, not stored.
    const removed = await state.admin.request('DELETE', `/api/admin/area-adjacency/${state.adjacencyId}`);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    const gone = await matchesFor(state.requestIds[0]);
    assert.equal(scoreOf(gone, state.properties.neighbour).breakdown.find((f) => f.factor === 'proximity').points, 0);
    assert.equal(
      (await state.admin.request('DELETE', `/api/admin/area-adjacency/${state.adjacencyId}`)).status,
      404,
      'deleting it twice is a 404, not a silent success'
    );

    // A non-administrator cannot edit the judgement behind a score.
    assert.equal((await state.tenant.get('/api/admin/area-adjacency')).status, 403);
    assert.equal(
      (await state.tenant.request('DELETE', `/api/admin/area-adjacency/${state.adjacencyId}`)).status,
      403
    );
  });
});

describe('B3 — chosen for you is separate from similar matches', () => {
  test('the shortlist is a validated set, and it comes first', async () => {
    const chosen = [state.properties.perfect, state.properties.neighbour, state.properties.unrelated];

    const saved = await state.admin.patch(`/api/tenant-requests/${state.requestIds[0]}`, {
      status: 'matched',
      matchedPropertyIds: chosen,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    const result = await matchesFor(state.requestIds[0]);
    assert.deepEqual(result.curatedForYou.map((row) => row.property.id), chosen, 'the staff order is preserved');
    assert.equal(result.curatedCount, 3);
    assert.equal(result.curatedMinimum, 3);
    assert.equal(result.curationWarning, null);
    const similarIds = result.similarMatches.map((row) => row.property.id);
    assert.ok(similarIds.length >= 1, 'there are still other matches to browse');
    assert.equal(
      similarIds.filter((id) => chosen.includes(id)).length,
      0,
      'the shortlist never appears twice'
    );
    assert.ok(similarIds.includes(state.properties.poor), 'the over-budget listing is still offered honestly');

    // More than six, or a listing that is not live: refused.
    const tooMany = await state.admin.patch(`/api/tenant-requests/${state.requestIds[0]}`, {
      matchedPropertyIds: [chosen[0], chosen[1], chosen[2], state.properties.poor, 'prop-1', 'prop-2', 'prop-3'],
    });
    assert.equal(tooMany.status, 422, JSON.stringify(tooMany.body));
    assert.match(tooMany.body.error, /at most 6/i);

    const pendingListing = await createListing(state.landlord, {
      title: 'Phase 5 unpublished listing',
      location: 'East Legon, Accra',
    });
    const notLive = await state.admin.patch(`/api/tenant-requests/${state.requestIds[0]}`, {
      matchedPropertyIds: [chosen[0], chosen[1], pendingListing],
    });
    assert.equal(notLive.status, 422, JSON.stringify(notLive.body));
    assert.match(notLive.body.error, /not a live listing/i);
  });

  test('a thin shortlist is accepted, but labelled — it never poses as a recommendation', async () => {
    // A single-property match is a legitimate record and has always existed, so
    // it is stored rather than refused; the tenant is simply told it is thin.
    const thin = await state.admin.patch(`/api/tenant-requests/${state.requestIds[1]}`, {
      matchedPropertyIds: [state.properties.perfect, state.properties.neighbour],
    });
    assert.equal(thin.status, 200, JSON.stringify(thin.body));

    const result = await matchesFor(state.requestIds[1]);
    assert.equal(result.curatedCount, 2);
    assert.match(result.curationWarning, /at least 3/i);
    assert.deepEqual(result.curatedForYou.map((row) => row.property.id), [
      state.properties.perfect,
      state.properties.neighbour,
    ]);

    const single = await state.admin.patch(`/api/tenant-requests/${state.requestIds[1]}`, {
      matchedPropertyIds: [state.properties.perfect],
    });
    assert.equal(single.status, 200, JSON.stringify(single.body));
    const one = await matchesFor(state.requestIds[1]);
    assert.equal(one.curatedCount, 1);
    assert.ok(one.curationWarning);

    // An empty set clears the shortlist instead of warning about it.
    const cleared = await state.admin.patch(`/api/tenant-requests/${state.requestIds[1]}`, {
      matchedPropertyIds: [],
    });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    const none = await matchesFor(state.requestIds[1]);
    assert.equal(none.curatedCount, 0);
    assert.equal(none.curationWarning, null);
  });
});

describe('B5 — the tenant decides whether a new time happens', () => {
  test('landlord proposes, tenant confirms, a reschedule needs a reason and the tenant’s acceptance', async () => {
    const booked = await state.tenant.post('/api/viewing-requests', {
      tenantName: 'Phase Five Tenant',
      tenantPhone: TENANT_PHONE,
      tenantEmail: TENANT_EMAIL,
      propertyId: state.properties.perfect,
      date: daysFromNow(3),
      time: '10:00 AM',
    });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    state.viewings.primary = booked.body.viewingId;

    const proposed = await state.landlord.post(`/api/viewings/${state.viewings.primary}/propose`, {
      date: daysFromNow(4),
      time: '11:00 AM',
      note: 'I can show you the house myself.',
    });
    assert.equal(proposed.status, 200, JSON.stringify(proposed.body));

    const confirmed = await state.tenant.post(`/api/viewings/${state.viewings.primary}/confirm`, {
      note: 'That works.',
    });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const agreedDate = confirmed.body.viewing.date;
    assert.equal(confirmed.body.viewing.status, 'confirmed');

    const withoutReason = await state.landlord.post(`/api/viewings/${state.viewings.primary}/reschedule`, {
      date: daysFromNow(6),
      time: '2:00 PM',
    });
    assert.equal(withoutReason.status, 422, 'a reschedule must say why');
    assert.ok(withoutReason.body.fields?.reason);

    const requested = await state.landlord.post(`/api/viewings/${state.viewings.primary}/reschedule`, {
      date: daysFromNow(6),
      time: '2:00 PM',
      reason: 'A family viewing is booked at the original time.',
    });
    assert.equal(requested.status, 200, JSON.stringify(requested.body));
    assert.equal(requested.body.viewing.status, 'reschedule_requested');
    assert.equal(requested.body.viewing.date, agreedDate, 'the appointment does not move until it is accepted');
    assert.equal(requested.body.viewing.preferredDate, daysFromNow(6));

    // The provider cannot accept on the tenant's behalf.
    const providerAccept = await state.landlord.post(`/api/viewings/${state.viewings.primary}/accept-reschedule`, {});
    assert.equal(providerAccept.status, 403);

    const accepted = await state.tenant.post(`/api/viewings/${state.viewings.primary}/accept-reschedule`, {
      note: 'The new time works.',
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.viewing.status, 'rescheduled');
    assert.equal(accepted.body.viewing.date, daysFromNow(6));
    assert.equal(accepted.body.viewing.time, '2:00 PM');

    const detail = await state.tenant.get(`/api/viewings/${state.viewings.primary}`);
    assert.equal(detail.status, 200);
    const actions = detail.body.history.map((event) => event.action);
    assert.ok(actions.includes('viewing.reschedule_requested') || actions.includes('viewing.proposed'), actions.join(','));
    assert.ok(detail.body.history.length >= 4, 'the whole exchange is in the history');
  });
});

describe('B6 — tenant contact is withheld until an administrator approves it', () => {
  test('an assigned agent sees the viewing but not the tenant’s phone or email', async () => {
    const assigned = await state.admin.post(`/api/admin/viewings/${state.viewings.primary}/assign-agent`, {
      agentUserId: state.agentId,
    });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));

    const seen = await state.agent.get(`/api/viewings/${state.viewings.primary}`);
    assert.equal(seen.status, 200, JSON.stringify(seen.body));
    assert.equal(seen.body.viewing.tenantPhone, '');
    assert.equal(seen.body.viewing.tenantEmail, '');
    assert.equal(seen.body.viewing.tenantContactVisible, false);
    assert.match(seen.body.viewing.tenantContactState, /withheld/);

    // Nothing sent to a provider leaked it either. (The tenant's own copy and
    // the staff desk's copy may carry the number — they are the people who
    // already know it.)
    const queued = dbRows('SELECT recipient_email, subject, body_html FROM email_outbox');
    const providerLeaks = queued.filter(
      (row) =>
        [AGENT_EMAIL, LANDLORD_EMAIL].includes(String(row.recipient_email)) &&
        String(row.body_html).includes(TENANT_PHONE)
    );
    assert.deepEqual(
      providerLeaks.map((row) => `${row.recipient_email}: ${row.subject}`),
      [],
      'no email to the agent or landlord carries the tenant phone before approval'
    );
  });

  test('request → approve → visible → revoke → hidden, with the tenant told', async () => {
    const requested = await state.agent.post(`/api/viewings/${state.viewings.primary}/request-contact`, {
      reason: 'The tenant asked me to call about the tenancy agreement.',
    });
    assert.equal(requested.status, 201, JSON.stringify(requested.body));
    assert.equal(requested.body.disclosure.status, 'pending');
    state.disclosureId = requested.body.disclosure.id;

    // Still withheld while pending.
    const pendingView = await state.agent.get(`/api/viewings/${state.viewings.primary}`);
    assert.equal(pendingView.body.viewing.tenantPhone, '');
    assert.equal(pendingView.body.viewing.contactDisclosure.status, 'pending');

    // Asking twice is a conflict, not a duplicate.
    const again = await state.agent.post(`/api/viewings/${state.viewings.primary}/request-contact`, {
      reason: 'Asking again.',
    });
    assert.equal(again.status, 409, JSON.stringify(again.body));

    // The queue is staff-only.
    assert.equal((await state.tenant.get('/api/admin/contact-disclosures')).status, 403);
    const queue = await state.admin.get('/api/admin/contact-disclosures');
    assert.equal(queue.status, 200, JSON.stringify(queue.body));
    assert.equal(queue.body.counts.pending, 1);

    const approved = await state.admin.post(`/api/admin/contact-disclosures/${state.disclosureId}/decision`, {
      decision: 'approve',
      note: 'The tenant confirmed the call in writing.',
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.disclosure.status, 'approved');
    assert.ok(approved.body.disclosure.expiresAt, 'an approval has an expiry');

    const shared = await state.agent.get(`/api/viewings/${state.viewings.primary}`);
    assert.equal(shared.body.viewing.tenantPhone, TENANT_PHONE);
    assert.equal(shared.body.viewing.tenantEmail, TENANT_EMAIL);
    assert.equal(shared.body.viewing.tenantContactVisible, true);
    assert.equal(shared.body.viewing.tenantContactState, 'approved_disclosure');

    // The tenant is told, and can see the record.
    const notifications = await state.tenant.get('/api/notifications');
    assert.equal(notifications.status, 200);
    assert.ok(
      notifications.body.notifications.some((note) => /contact details shared/i.test(note.title)),
      'the tenant is notified when their details are shared'
    );
    const mine = await state.tenant.get('/api/contact-disclosures');
    assert.equal(mine.status, 200);
    const record = mine.body.disclosures.find((row) => row.id === state.disclosureId);
    assert.ok(record, 'the tenant can see who received their details');
    assert.equal(record.status, 'approved');

    const revoked = await state.admin.post(`/api/admin/contact-disclosures/${state.disclosureId}/decision`, {
      decision: 'revoke',
      note: 'The viewing was rearranged; the agent can ask again then.',
    });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.body));

    const hiddenAgain = await state.agent.get(`/api/viewings/${state.viewings.primary}`);
    assert.equal(hiddenAgain.body.viewing.tenantPhone, '');
    assert.equal(hiddenAgain.body.viewing.tenantContactState, 'withheld_revoked');

    // A refusal keeps the door shut, and a refusal needs a reason.
    const noReason = await state.admin.post(`/api/admin/contact-disclosures/${state.disclosureId}/decision`, {
      decision: 'reject',
    });
    assert.equal(noReason.status, 422);
  });

  test('approval is per viewing, not per provider', async () => {
    const second = await state.tenant.post('/api/viewing-requests', {
      tenantName: 'Phase Five Tenant',
      tenantPhone: TENANT_PHONE,
      tenantEmail: TENANT_EMAIL,
      propertyId: state.properties.neighbour,
      date: daysFromNow(5),
      time: '9:00 AM',
    });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    state.viewings.second = second.body.viewingId;

    const assigned = await state.admin.post(`/api/admin/viewings/${state.viewings.second}/assign-agent`, {
      agentUserId: state.agentId,
    });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));

    const seen = await state.agent.get(`/api/viewings/${state.viewings.second}`);
    assert.equal(seen.body.viewing.tenantPhone, '', 'approval on one viewing does not open another');
    assert.equal(seen.body.viewing.tenantContactVisible, false);
  });

  test('a provider who is not responsible for the viewing cannot ask', async () => {
    const other = new ApiClient(baseUrl);
    const otherEmail = `phase5.other-agent-${stamp}@example.com`;
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${otherEmail}`, '--password=Phase5-Other-Password-1', '--name=Other Agent', '--role=agent'],
      state.env
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);
    assert.equal((await other.post('/api/auth/login', { email: otherEmail, password: 'Phase5-Other-Password-1' })).status, 200);

    const attempted = await other.post(`/api/viewings/${state.viewings.primary}/request-contact`, {
      reason: 'I want the contact too.',
    });
    assert.equal(attempted.status, 403, JSON.stringify(attempted.body));
  });
});
