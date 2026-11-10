/**
 * Goodlucks Homes — Upgrade 2 · Phase 4
 * Fee policies & provider (agent) tiers (A9) — the parts added in this phase.
 *
 * The Phase 1–2 suites already prove that a policy is drafted, approved,
 * activated and applied, and that only the primary administrator may approve its
 * own. This suite pins what A9 still lacked:
 *
 *   - a policy that never went through approval can be deleted, and one that
 *     went through approval cannot (the decision is history; deactivate instead);
 *   - the append-only trail records WHICH values changed, old → new, not merely
 *     that someone edited the draft;
 *   - every agent's commission tier is a fact derived from approved
 *     verification, exposed read-only, with no endpoint that assigns one;
 *   - the primary administrator can still draft, approve and activate alone.
 *
 *   node --test tests/fee-policies-phase4.test.mjs
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { startApiServer, runPhpScript } from '../scripts/php.mjs';
import { ApiClient, createPng } from './helpers.mjs';

/** Read rows straight from the test database, so "unchanged" is byte-exact. */
const dbRows = (sql) => {
  const result = runPhpScript('tests/sqlite-tool.php', [`--path=${dbPath}`, '--mode=query', `--sql=${sql}`], {
    DB_DRIVER: 'sqlite',
    DB_SQLITE_PATH: dbPath,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim()).rows;
};

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(projectRoot, '.data');
const stamp = `${process.pid}-${Date.now()}`;
const dbPath = path.join(dataDir, `fee-policies-p4-${stamp}.sqlite`);
const privateDir = path.join(dataDir, `fee-policies-p4-private-${stamp}`);
const port = 9400 + Math.floor(Math.random() * 90);

const ADMIN_ACCESS_KEY = 'fee-policy-p4-key';
const MANAGER_EMAIL = 'p4.manager@test.local';
const MANAGER_PASSWORD = 'P4-Manager-Password-123';
const PLAIN_EMAIL = 'p4.plain@test.local';
const PLAIN_PASSWORD = 'P4-Plain-Password-123';
const PRIMARY_EMAIL = 'p4.primary@test.local';
const PRIMARY_PASSWORD = 'P4-Primary-Password-123';

let server;
let baseUrl;
const state = { env: {}, agents: {} };

const today = () => new Date().toISOString().slice(0, 10);
const daysFromNow = (days) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
const uniqueEmail = (prefix) => `${prefix}-${stamp}@example.com`;

const policyPayload = (overrides = {}) => ({
  name: 'Phase 4 viewing fee share',
  description: 'Draft test policy for the Phase 4 suite.',
  category: 'viewing_fee',
  agentTier: 'standard',
  calculationMethod: 'percentage',
  agentSharePercent: 60,
  goodlucksSharePercent: 40,
  effectiveFrom: today(),
  currency: 'GHS',
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
  };
  state.env = env;

  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  for (const [email, password, name] of [
    [MANAGER_EMAIL, MANAGER_PASSWORD, 'P4 Manager'],
    [PLAIN_EMAIL, PLAIN_PASSWORD, 'P4 Plain Admin'],
    [PRIMARY_EMAIL, PRIMARY_PASSWORD, 'P4 Primary Admin'],
  ]) {
    const bootstrap = runPhpScript(
      'php-backend/admin_bootstrap.php',
      [`--email=${email}`, `--password=${password}`, `--name=${name}`],
      env
    );
    assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);
  }

  // Drafting and approving are separate powers; the manager holds only the first.
  const grant = runPhpScript(
    'php-backend/grant_finance.php',
    [`--email=${MANAGER_EMAIL}`, '--manage=1', '--approve=1'],
    env
  );
  assert.equal(grant.status, 0, grant.stdout + grant.stderr);

  const primary = runPhpScript(
    'php-backend/assign_primary_admin.php',
    [`--email=${PRIMARY_EMAIL}`, '--confirm=1'],
    env
  );
  assert.equal(primary.status, 0, primary.stdout + primary.stderr);

  state.manager = new ApiClient(baseUrl);
  state.plain = new ApiClient(baseUrl);
  state.primary = new ApiClient(baseUrl);

  for (const [client, email, password] of [
    [state.manager, MANAGER_EMAIL, MANAGER_PASSWORD],
    [state.plain, PLAIN_EMAIL, PLAIN_PASSWORD],
    [state.primary, PRIMARY_EMAIL, PRIMARY_PASSWORD],
  ]) {
    const login = await client.post('/api/auth/admin-login', { email, password, accessKey: ADMIN_ACCESS_KEY });
    assert.equal(login.status, 200, JSON.stringify(login.body));
  }

  state.primaryId = (await state.primary.get('/api/auth/me')).body.user.id;

  // Two agents: one with no verification at all, one verified right through to
  // a professional authorisation.
  const registerAgent = async (key) => {
    const client = new ApiClient(baseUrl);
    const email = uniqueEmail(`p4-agent-${key}`);
    const password = 'P4-Agent-Password-123';
    const res = await client.post('/api/auth/register', {
      name: `P4 Agent ${key}`,
      email,
      phone: '+233 20 700 0123',
      password,
      role: 'agent',
      operatingCity: 'Accra',
      agencyName: 'Phase Four Agency',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    state.agents[key] = { client, id: res.body.user.id, email, password };
    return state.agents[key];
  };

  state.agents.unverified = await registerAgent('unverified');
  state.agents.verified = await registerAgent('verified');

  // Identity: both sides of the Ghana Card, decided by the primary administrator.
  const agent = state.agents.verified;
  const documentIds = [];
  for (const kind of ['document_front', 'document_back']) {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', new Blob([createPng(120, 80)], { type: 'image/png' }), `${kind}.png`);
    const uploaded = await agent.client.request('POST', '/api/verification/documents', { body: form });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    documentIds.push(uploaded.body.document.id);
  }

  const identity = await agent.client.post('/api/verification/identity', {
    legalName: 'Phase Four Verified Agent',
    documentType: 'ghana_card',
    documentNumber: `GHA-${Math.floor(Math.random() * 900000000) + 100000000}-1`,
    documentIds,
  });
  assert.equal(identity.status, 201, JSON.stringify(identity.body));

  const identityDecision = await state.primary.post(`/api/admin/verifications/${agent.id}/identity/decision`, {
    decision: 'approve',
    note: 'Identity checked for the Phase 4 tier tests.',
  });
  assert.equal(identityDecision.status, 200, JSON.stringify(identityDecision.body));

  const professional = await agent.client.post('/api/verification/professional', {
    licenceNumber: `REAC-P4-${Math.floor(Math.random() * 100000)}`,
    issuingAuthority: 'Real Estate Agency Council (test value)',
    licenceCategory: 'Agency',
    issueDate: '2026-01-10',
    expiryDate: daysFromNow(300),
    documentIds: [],
  });
  assert.equal(professional.status, 201, JSON.stringify(professional.body));

  const professionalDecision = await state.primary.post(
    `/api/admin/verifications/${agent.id}/professional/decision`,
    { decision: 'approve', note: 'Licence checked for the Phase 4 tier tests.' }
  );
  assert.equal(professionalDecision.status, 200, JSON.stringify(professionalDecision.body));

  // A real viewing fee, collected the way the platform records one: the seeded
  // demo listing carries an approved fee, a visitor books, the viewing takes
  // place, and staff record that the agent collected the fee. The ledger row is
  // produced by the application, not written by the test.
  const seededFee = runPhpScript('tests/set-viewing-fee.php', ['--property=prop-1', '--fee=200'], env);
  assert.equal(seededFee.status, 0, seededFee.stdout + seededFee.stderr);

  const viewingProperty = await state.primary.get('/api/properties/prop-1');
  assert.equal(viewingProperty.status, 200, JSON.stringify(viewingProperty.body));

  const guest = new ApiClient(baseUrl);
  const booked = await guest.post('/api/viewing-requests', {
    tenantName: 'Phase 4 Viewer',
    tenantPhone: '+233 24 700 0456',
    tenantEmail: uniqueEmail('p4-viewer'),
    propertyId: 'prop-1',
    date: daysFromNow(2),
    time: '11:00 AM',
  });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  const viewingId = booked.body.viewingId;

  assert.equal(
    (await state.primary.post(`/api/viewings/${viewingId}/propose`, {
      date: daysFromNow(2),
      time: '11:00 AM',
      note: 'Slot proposed while preparing the fixture.',
    })).status,
    200
  );
  assert.equal(
    (await state.primary.post(`/api/viewings/${viewingId}/confirm`, { note: 'Slot agreed.' })).status,
    200
  );

  // Move the viewing into the past: a viewing can only be completed after it
  // was due, so the fixture states the fact rather than pretending.
  const past = runPhpScript(
    'tests/finance-fixtures.php',
    [`--viewing-id=${viewingId}`, '--viewing-days-ago=1'],
    env
  );
  assert.equal(past.status, 0, past.stdout + past.stderr);

  const completed = await state.primary.post(`/api/viewings/${viewingId}/complete`, {
    note: 'The viewing took place.',
  });
  assert.equal(completed.status, 200, JSON.stringify(completed.body));

  const paidRes = await state.primary.patch(`/api/viewings/${viewingId}`, { viewingFeePaid: true });
  assert.equal(paidRes.status, 200, JSON.stringify(paidRes.body));

  const ledger = await state.primary.get('/api/admin/viewing-fees');
  assert.equal(ledger.status, 200, JSON.stringify(ledger.body));
  const feeRecord = ledger.body.records.find((row) => row.viewingId === viewingId);
  assert.ok(feeRecord, 'a fee record exists for the paid viewing');
  assert.equal(feeRecord.feeTotalGhs, 200);
  state.feeRecord = feeRecord;

  // The verified agent is the one whose professional tier a policy can price.
  const linked = await state.primary.post(`/api/admin/viewing-fees/${feeRecord.id}/agent`, {
    agentUserId: state.agents.verified.id,
  });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  assert.equal(linked.body.agentTier.tier, 'professional');
});

after(async () => {
  if (server) await server.stop();
});

const createPolicy = async (overrides = {}) => {
  const res = await state.manager.post('/api/admin/fee-policies', policyPayload(overrides));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.policy;
};

const policyDetail = (id) => state.manager.get(`/api/admin/fee-policies/${id}`);

describe('Fee policy deletion (A9)', () => {
  test('a draft that never left the desk can be deleted, and is then gone', async () => {
    const policy = await createPolicy({ name: 'Draft to delete' });

    const deleted = await state.manager.request('DELETE', `/api/admin/fee-policies/${policy.id}`, { body: {
      reason: 'Created by mistake while testing the editor.',
    } });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    assert.equal(deleted.body.deleted.id, policy.id);
    assert.equal(deleted.body.deleted.status, 'draft');

    assert.equal((await policyDetail(policy.id)).status, 404);
    // Deleting twice is not silently "successful".
    const again = await state.manager.request('DELETE', `/api/admin/fee-policies/${policy.id}`, { body: { reason: 'again' } });
    assert.equal(again.status, 404);
  });

  test('a policy that was submitted cannot be deleted, even while awaiting approval', async () => {
    const policy = await createPolicy({ name: 'Submitted, not deleted' });
    const submitted = await state.manager.post(`/api/admin/fee-policies/${policy.id}/submit`, {
      note: 'Ready for review.',
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));

    const deleted = await state.manager.request('DELETE', `/api/admin/fee-policies/${policy.id}`, { body: {
      reason: 'Changed my mind.',
    } });
    assert.equal(deleted.status, 409, JSON.stringify(deleted.body));
    assert.equal(deleted.body.code, 'policy_is_history');

    const detail = await policyDetail(policy.id);
    assert.equal(detail.status, 200, 'the policy and its trail survive a refused delete');
    assert.equal(detail.body.policy.status, 'pending_approval');
    assert.deepEqual(detail.body.history.map((event) => event.action), ['created', 'submitted']);
  });

  test('an approved or active policy cannot be deleted; it is deactivated instead', async () => {
    const policy = await createPolicy({ name: 'Approved, never deleted' });
    assert.equal((await state.manager.post(`/api/admin/fee-policies/${policy.id}/submit`, {})).status, 200);
    // The manager drafted it, so a second administrator approves it — the
    // primary administrator may approve anything, including its own.
    assert.equal(
      (await state.primary.post(`/api/admin/fee-policies/${policy.id}/approve`, {
        note: 'Percentages checked.',
      })).status,
      200
    );
    assert.equal(
      (await state.manager.post(`/api/admin/fee-policies/${policy.id}/activate`, { note: 'In force.' })).status,
      200
    );

    const deleted = await state.manager.request('DELETE', `/api/admin/fee-policies/${policy.id}`, { body: { reason: 'tidy up' } });
    assert.equal(deleted.status, 409, JSON.stringify(deleted.body));
    assert.match(deleted.body.error, /deactivate/i, 'the refusal names the correct action');

    const stopped = await state.manager.post(`/api/admin/fee-policies/${policy.id}/deactivate`, {
      reason: 'Superseded by a later decision.',
    });
    assert.equal(stopped.status, 200, JSON.stringify(stopped.body));

    // Deactivating does not make it deletable: it has been decided on.
    const stillThere = await state.manager.request('DELETE', `/api/admin/fee-policies/${policy.id}`, { body: { reason: 'now?' } });
    assert.equal(stillThere.status, 409);
    assert.equal((await policyDetail(policy.id)).status, 200);
  });

  test('an administrator without the manager capability cannot delete anything', async () => {
    const policy = await createPolicy({ name: 'Only a manager may remove this' });
    const refused = await state.plain.request('DELETE', `/api/admin/fee-policies/${policy.id}`, { body: { reason: 'not mine' } });
    assert.equal(refused.status, 403);
    assert.equal((await policyDetail(policy.id)).status, 200);
  });
});

describe('Fee policy history records what changed (A9)', () => {
  test('an edit records each changed field with its old and new value', async () => {
    const policy = await createPolicy({ name: 'History of one edit' });

    const edited = await state.manager.patch(`/api/admin/fee-policies/${policy.id}`, {
      ...policyPayload({
        name: 'History of one edit (revised)',
        agentSharePercent: 65,
        goodlucksSharePercent: 35,
      }),
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));

    const detail = await policyDetail(policy.id);
    const update = detail.body.history.find((event) => event.action === 'updated');
    assert.ok(update, 'the edit is in the trail');

    const byField = Object.fromEntries(update.changes.map((change) => [change.field, change]));
    assert.equal(byField.agentSharePercent.from, 60);
    assert.equal(byField.agentSharePercent.to, 65);
    assert.equal(byField.goodlucksSharePercent.from, 40);
    assert.equal(byField.goodlucksSharePercent.to, 35);
    assert.equal(byField.name.to, 'History of one edit (revised)');
    assert.ok(!byField.effectiveFrom, 'unchanged fields are not reported as edits');
  });

  test('saving a draft without changing anything claims no edit', async () => {
    const policy = await createPolicy({ name: 'Untouched draft' });
    const saved = await state.manager.patch(`/api/admin/fee-policies/${policy.id}`, policyPayload({ name: 'Untouched draft' }));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    const detail = await policyDetail(policy.id);
    const update = detail.body.history.find((event) => event.action === 'updated');
    assert.ok(update);
    assert.deepEqual(update.changes, []);
    assert.match(update.note, /without changing any value/i);
  });
});

describe('Agent tiers are derived, never assigned (A9)', () => {
  test('the overview lists every agent with the tier verification earns it', async () => {
    const res = await state.manager.get('/api/admin/agent-tiers');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.derived, true);
    assert.match(res.body.note, /verification/i);

    const rows = res.body.agents;
    assert.ok(rows.length >= 2);

    const unverified = rows.find((row) => row.userId === state.agents.unverified.id);
    assert.ok(unverified, 'an agent with no verification is still listed');
    assert.equal(unverified.tier, 'standard');
    assert.equal(unverified.commissionEligible, false);
    assert.equal(unverified.identityStatus !== 'approved', true);

    const verified = rows.find((row) => row.userId === state.agents.verified.id);
    assert.equal(verified.tier, 'professional');
    assert.equal(verified.commissionEligible, true);
    assert.equal(verified.commissionPercent, 70);
    assert.equal(verified.goodlucksPercent, 30);

    assert.equal(res.body.counts.total, rows.filter((row) => row.userId).length);
    assert.ok(res.body.counts.professional >= 1);
    assert.ok(res.body.counts.no_commission_tier >= 1);
    assert.equal(res.body.rules.standard.percent, 60);
    assert.equal(res.body.rules.professional.percent, 70);
  });

  test('no endpoint assigns a tier, so the dropdown cannot exist', async () => {
    const agentId = state.agents.unverified.id;

    // Creating, replacing and patching the collection are all unrouted.
    assert.equal((await state.manager.post('/api/admin/agent-tiers', { tier: 'professional' })).status >= 400, true);
    assert.equal((await state.manager.patch('/api/admin/agent-tiers', { tier: 'professional' })).status >= 400, true);
    assert.equal(
      (await state.manager.patch(`/api/admin/agent-tiers/${agentId}`, { tier: 'professional' })).status >= 400,
      true
    );
    assert.equal(
      (await state.manager.post(`/api/admin/agents/${agentId}/tier`, { tier: 'professional' })).status >= 400,
      true
    );

    // The single-agent view is read-only and unchanged by any of that.
    const one = await state.manager.get(`/api/admin/agents/${agentId}/tier`);
    assert.equal(one.status, 200, JSON.stringify(one.body));
    assert.equal(one.body.tier.tier, 'standard');
    assert.equal(one.body.tier.commissionEligible, false);
  });

  test('the tier overview is capability-gated', async () => {
    const refused = await state.plain.get('/api/admin/agent-tiers');
    assert.equal(refused.status, 403);
    const refusedOne = await state.plain.get(`/api/admin/agents/${state.agents.unverified.id}/tier`);
    assert.equal(refusedOne.status, 403);
  });
});

describe('Activating a policy leaves recorded money alone (Phase 4 acceptance)', () => {
  test('a priced fee keeps its frozen split when another policy is activated', async () => {
    // A professional-tier policy prices the viewing fee.
    const pricing = await createPolicy({
      name: 'Professional viewing fee share',
      agentTier: 'professional',
      agentSharePercent: 70,
      goodlucksSharePercent: 30,
    });
    assert.equal((await state.manager.post(`/api/admin/fee-policies/${pricing.id}/submit`, {})).status, 200);
    assert.equal(
      (await state.primary.post(`/api/admin/fee-policies/${pricing.id}/approve`, {
        note: 'Split and tier checked.',
      })).status,
      200
    );
    assert.equal(
      (await state.primary.post(`/api/admin/fee-policies/${pricing.id}/activate`, { note: 'In force.' })).status,
      200
    );

    const applied = await state.primary.post(`/api/admin/viewing-fees/${state.feeRecord.id}/apply-policy`, {
      policyId: pricing.id,
    });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    assert.equal(applied.body.snapshot.agentSharePercent, 70);
    assert.equal(applied.body.snapshot.goodlucksSharePercent, 30);
    state.snapshotMoney = applied.body.snapshot;

    const snapshotsBefore = dbRows('SELECT * FROM fee_policy_snapshots ORDER BY id');
    const remittancesBefore = dbRows('SELECT * FROM fee_remittances ORDER BY id');
    const commissionsBefore = dbRows('SELECT * FROM rental_commissions ORDER BY id');
    assert.equal(snapshotsBefore.length, 1, 'the priced fee has one frozen snapshot');

    const recordBefore = dbRows(
      `SELECT * FROM viewing_fee_records WHERE id = '${state.feeRecord.id}'`
    );
    assert.equal(recordBefore.length, 1);
    assert.equal(Number(recordBefore[0].agent_share_ghs) > 0, true, 'a real share was frozen');

    // A second, unrelated policy goes live while that fee is already priced.
    const later = await createPolicy({
      name: 'Later service fee share',
      category: 'other_service_fee',
      agentTier: 'standard',
    });
    assert.equal((await state.manager.post(`/api/admin/fee-policies/${later.id}/submit`, {})).status, 200);
    assert.equal(
      (await state.primary.post(`/api/admin/fee-policies/${later.id}/approve`, { note: 'Checked.' })).status,
      200
    );
    assert.equal(
      (await state.primary.post(`/api/admin/fee-policies/${later.id}/activate`, { note: 'In force.' })).status,
      200
    );

    // Nothing historical moved — not the snapshot, not the ledger, not the fee.
    assert.deepEqual(dbRows('SELECT * FROM fee_policy_snapshots ORDER BY id'), snapshotsBefore);
    assert.deepEqual(dbRows('SELECT * FROM fee_remittances ORDER BY id'), remittancesBefore);
    assert.deepEqual(dbRows('SELECT * FROM rental_commissions ORDER BY id'), commissionsBefore);
    assert.deepEqual(
      dbRows(`SELECT * FROM viewing_fee_records WHERE id = '${state.feeRecord.id}'`),
      recordBefore
    );

    // And re-pricing it with the new policy is refused outright.
    const repriced = await state.primary.post(`/api/admin/viewing-fees/${state.feeRecord.id}/apply-policy`, {
      policyId: later.id,
    });
    assert.ok(repriced.status >= 400, 'a priced fee is never re-priced');
  });
});

describe('Primary administrator (Phase 1 safeguard, re-checked)', () => {
  test('drafts, submits, approves and activates alone, recorded as a self-approval', async () => {
    const created = await state.primary.post('/api/admin/fee-policies', policyPayload({ name: 'Primary admin policy' }));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const policy = created.body.policy;
    assert.equal(policy.createdBy, state.primaryId);

    assert.equal((await state.primary.post(`/api/admin/fee-policies/${policy.id}/submit`, {})).status, 200);

    const approved = await state.primary.post(`/api/admin/fee-policies/${policy.id}/approve`, {
      note: 'The platform fee terms are this account’s decision.',
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.policy.selfApproved, true);

    const activated = await state.primary.post(`/api/admin/fee-policies/${policy.id}/activate`, {
      note: 'In force from today.',
    });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));
    assert.equal(activated.body.policy.status, 'active');

    const detail = await state.primary.get(`/api/admin/fee-policies/${policy.id}`);
    assert.deepEqual(
      detail.body.history.map((event) => event.action),
      ['created', 'submitted', 'approved_by_creator', 'activated'],
      'a self-approval is recorded as such, never as an ordinary approval'
    );
    assert.equal(detail.body.history[2].actorId, state.primaryId);
  });

  test('an ordinary administrator still cannot approve a policy it drafted', async () => {
    // The manager holds both capabilities, so only the separation rule can
    // refuse this: it is not the primary administrator.
    const policy = await createPolicy({ name: 'Ordinary admin self-approval' });
    assert.equal((await state.manager.post(`/api/admin/fee-policies/${policy.id}/submit`, {})).status, 200);
    const approved = await state.manager.post(`/api/admin/fee-policies/${policy.id}/approve`, {
      note: 'Trying to approve my own draft.',
    });
    assert.equal(approved.status, 422, JSON.stringify(approved.body));
    assert.match(approved.body.error, /different administrator/i);
  });
});
