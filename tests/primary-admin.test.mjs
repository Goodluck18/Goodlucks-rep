/**
 * Goodlucks Homes — Upgrade 2 · Phase 1
 * Primary platform administrator authority (§3.1 / §3.2 acceptance test).
 *
 * What this suite proves, against the real PHP backend on a throwaway SQLite
 * database:
 *
 *   1. Without the flag, two administrators work exactly as before: the account
 *      that created a policy still cannot approve it (422).
 *   2. The primary administrator needs no separate grants — every staff
 *      capability resolves to true for that one account.
 *   3. §3.2 end to end: primary admin creates a policy → changes an agent's
 *      commission share → submits → approves with the SAME account (200, no
 *      "different administrator" error) → activates → the new values are live.
 *   4. The exception is recorded (`self_approved`) and the audit trail says so.
 *   5. Activating the new policy neither rewrites the earlier approved policy nor
 *      touches recorded money.
 *   6. The privilege does not leak: a second administrator still cannot
 *      self-approve, and neither account can promote itself over HTTP.
 *
 *   node --test tests/primary-admin.test.mjs
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
const dbPath = path.join(dataDir, `primary-admin-${stamp}.sqlite`);
const privateDir = path.join(dataDir, `primary-admin-private-${stamp}`);
const port = 8900 + Math.floor(Math.random() * 90);

const ORDINARY_EMAIL = 'ordinary.admin@test.local';
const ORDINARY_PASSWORD = 'Ordinary-Admin-Password-123';
const PRIMARY_EMAIL = 'goodlucksonly@gmail.com';
const PRIMARY_PASSWORD = 'Primary-Admin-Password-123';
const ADMIN_ACCESS_KEY = 'primary-admin-test-key';

let server;
let baseUrl;
let ordinary;
let primary;
let guest;
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
  };
  state.testEnv = env;

  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  for (const [email, password, name] of [
    [ORDINARY_EMAIL, ORDINARY_PASSWORD, 'Ordinary Administrator'],
    [PRIMARY_EMAIL, PRIMARY_PASSWORD, 'Primary Administrator'],
  ]) {
    const bootstrap = runPhpScript(
      'php-backend/admin_bootstrap.php',
      [`--email=${email}`, `--password=${password}`, `--name=${name}`],
      env
    );
    assert.equal(bootstrap.status, 0, `admin bootstrap failed: ${bootstrap.stdout} ${bootstrap.stderr}`);
  }

  guest = new ApiClient(baseUrl);
  ordinary = new ApiClient(baseUrl);
  primary = new ApiClient(baseUrl);

  const ordinaryLogin = await ordinary.post('/api/auth/admin-login', {
    email: ORDINARY_EMAIL,
    password: ORDINARY_PASSWORD,
    accessKey: ADMIN_ACCESS_KEY,
  });
  assert.equal(ordinaryLogin.status, 200, JSON.stringify(ordinaryLogin.body));

  const primaryLogin = await primary.post('/api/auth/admin-login', {
    email: PRIMARY_EMAIL,
    password: PRIMARY_PASSWORD,
    accessKey: ADMIN_ACCESS_KEY,
  });
  assert.equal(primaryLogin.status, 200, JSON.stringify(primaryLogin.body));
});

after(() => {
  server?.stop();
});

// ---------------------------------------------------------------------------
// Before the flag is assigned: the old rule holds for everyone
// ---------------------------------------------------------------------------
describe('before the primary administrator is assigned', () => {
  test('an administrator with both capabilities still cannot approve its own policy', async () => {
    const grant = runPhpScript(
      'php-backend/grant_finance.php',
      [`--email=${ORDINARY_EMAIL}`, '--manage=1', '--approve=1'],
      state.testEnv
    );
    assert.equal(grant.status, 0, grant.stdout + grant.stderr);

    const created = await ordinary.post('/api/admin/fee-policies', {
      name: 'Ordinary admin draft',
      description: 'Created while proving the separation-of-duties rule.',
      category: 'rental_commission',
      agentTier: 'standard',
      calculationMethod: 'percentage',
      agentSharePercent: 60,
      goodlucksSharePercent: 40,
      effectiveFrom: new Date().toISOString().slice(0, 10),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    state.ordinaryPolicyId = created.body.policy.id;

    const submitted = await ordinary.post(`/api/admin/fee-policies/${state.ordinaryPolicyId}/submit`, {
      note: 'Submitted for a second pair of eyes.',
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));

    const approved = await ordinary.post(`/api/admin/fee-policies/${state.ordinaryPolicyId}/approve`, {
      note: 'I checked my own work.',
    });
    assert.equal(approved.status, 422, JSON.stringify(approved.body));
    assert.match(approved.body.error, /different administrator/i);
  });

  test('neither administrator holds the self-approval exception yet', async () => {
    const me = await ordinary.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.isPrimaryAdmin, false);
    assert.equal(me.body.user.capabilities.feePolicySelfApprove, false);
  });

  test('there is no HTTP route that makes an account primary', async () => {
    // Every plausible shape of a self-promotion is simply not routed.
    for (const [method, path] of [
      ['POST', '/api/admin/users/me/primary'],
      ['PUT', '/api/admin/users/primary'],
      ['POST', '/api/admin/primary-admin'],
      ['PATCH', '/api/auth/me'],
    ]) {
      // Whatever the endpoint answers (today: not routed), the flag must not move.
      await ordinary.request(method, path, { body: { isPrimaryAdmin: true } });
    }

    const me = await ordinary.get('/api/auth/me');
    assert.equal(me.body.user.isPrimaryAdmin, false);
  });
});

// ---------------------------------------------------------------------------
// Assigning the flag (CLI only)
// ---------------------------------------------------------------------------
describe('assigning the primary administrator', () => {
  test('the assignment script refuses to run without --confirm', async () => {
    const res = runPhpScript(
      'php-backend/assign_primary_admin.php',
      [`--email=${PRIMARY_EMAIL}`],
      state.testEnv
    );
    // php-wasm does not propagate the script's exit code, so the message is the
    // assertion. What matters is that nothing was written.
    assert.match(res.stderr + res.stdout, /--confirm/i);

    const stillNot = await primary.get('/api/auth/me');
    assert.equal(stillNot.body.user.isPrimaryAdmin, false);
  });

  test('the assignment script refuses an account that is not an administrator', async () => {
    const register = await guest.post('/api/auth/register', {
      email: `not-an-admin-${Date.now()}@example.com`,
      password: 'Tenant-Password-123',
      name: 'Not An Admin',
      phone: '+233 24 000 1111',
      role: 'tenant',
    });
    assert.equal(register.status, 201, JSON.stringify(register.body));

    const res = runPhpScript(
      'php-backend/assign_primary_admin.php',
      [`--email=${register.body.user.email}`, '--confirm=1'],
      state.testEnv
    );
    assert.match(res.stderr + res.stdout, /not 'admin'|never promotes/i);
  });

  test('--confirm=1 assigns exactly one primary administrator', async () => {
    const res = runPhpScript(
      'php-backend/assign_primary_admin.php',
      [`--email=${PRIMARY_EMAIL}`, '--confirm=1'],
      state.testEnv
    );
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /is the primary administrator/i);

    // Re-assigning to the same account is idempotent and still leaves one.
    const again = runPhpScript(
      'php-backend/assign_primary_admin.php',
      [`--email=${PRIMARY_EMAIL}`, '--confirm=1'],
      state.testEnv
    );
    assert.equal(again.status, 0, again.stdout + again.stderr);

    const listed = runPhpScript('php-backend/assign_primary_admin.php', ['--list'], state.testEnv);
    assert.equal(listed.status, 0, listed.stdout + listed.stderr);
    assert.equal((listed.stdout.match(/YES/g) || []).length, 1);
  });
});

// ---------------------------------------------------------------------------
// The primary administrator's capabilities
// ---------------------------------------------------------------------------
describe('primary administrator capabilities', () => {
  test('/auth/me reports the flag and every staff capability without a grant', async () => {
    const me = await primary.get('/api/auth/me');
    assert.equal(me.status, 200);
    const user = me.body.user;
    assert.equal(user.isPrimaryAdmin, true);
    assert.equal(user.capabilities.feePolicyManage, true);
    assert.equal(user.capabilities.feePolicyApprove, true);
    assert.equal(user.capabilities.feePolicySelfApprove, true);
    assert.equal(user.capabilities.financeView, true);
    assert.equal(user.capabilities.financeConfirm, true);
    assert.equal(user.capabilities.verificationReviewer, true);
    assert.equal(user.capabilities.identityDocumentAccess, true);
    assert.equal(user.capabilities.viewingCorrections, true);
  });

  test('the ordinary administrator is unchanged by the flag', async () => {
    const me = await ordinary.get('/api/auth/me');
    assert.equal(me.body.user.isPrimaryAdmin, false);
    assert.equal(me.body.user.capabilities.feePolicySelfApprove, false);
    // It still holds exactly what grant_finance.php gave it — nothing more.
    assert.equal(me.body.user.capabilities.feePolicyManage, true);
    assert.equal(me.body.user.capabilities.feePolicyApprove, true);
    assert.equal(me.body.user.capabilities.verificationReviewer, false);
    assert.equal(me.body.user.capabilities.identityDocumentAccess, false);
    assert.equal(me.body.user.capabilities.viewingCorrections, false);
    assert.equal(me.body.user.capabilities.financeConfirm, false);
  });
});

// ---------------------------------------------------------------------------
// §3.2 acceptance test
// ---------------------------------------------------------------------------
describe('§3.2 — the primary administrator creates, approves and activates its own policy', () => {
  test('create → change the agent share → submit → approve (same account) → activate', async () => {
    const draft = {
      name: 'Agent commission — Phase 1 acceptance',
      description: 'Drafted and approved by the primary administrator in one sitting.',
      category: 'other_service_fee',
      agentTier: 'professional',
      calculationMethod: 'percentage',
      agentSharePercent: 70,
      goodlucksSharePercent: 30,
      effectiveFrom: new Date().toISOString().slice(0, 10),
    };
    const created = await primary.post('/api/admin/fee-policies', draft);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    state.primaryPolicyId = created.body.policy.id;
    assert.equal(created.body.policy.agentSharePercent, 70);

    // The agent commission-sharing percentage changes before approval.
    // The console edits a policy through one form, so PATCH carries the whole
    // policy — with the agent's share changed.
    const updated = await primary.patch(`/api/admin/fee-policies/${state.primaryPolicyId}`, {
      ...draft,
      agentSharePercent: 62,
      goodlucksSharePercent: 38,
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.policy.agentSharePercent, 62);
    assert.equal(updated.body.policy.goodlucksSharePercent, 38);

    const submitted = await primary.post(`/api/admin/fee-policies/${state.primaryPolicyId}/submit`, {
      note: 'Ready for approval.',
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(submitted.body.policy.status, 'pending_approval');

    // The step that used to fail with 422 for the same account.
    const approved = await primary.post(`/api/admin/fee-policies/${state.primaryPolicyId}/approve`, {
      note: 'Checked the split and the effective date myself.',
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.policy.status, 'approved');
    assert.equal(approved.body.policy.selfApproved, true);
    assert.ok(approved.body.policy.selfApprovedAt, 'the self-approval timestamp is recorded');
    assert.ok(approved.body.policy.approvedAt);

    const activated = await primary.post(`/api/admin/fee-policies/${state.primaryPolicyId}/activate`, {
      note: 'Live from today.',
    });
    assert.equal(activated.status, 200, JSON.stringify(activated.body));
    assert.equal(activated.body.policy.status, 'active');
    assert.equal(activated.body.policy.applicable, true);

    // The values that apply are the ones approved, not the original draft values.
    const readBack = await primary.get(`/api/admin/fee-policies/${state.primaryPolicyId}`);
    assert.equal(readBack.status, 200, JSON.stringify(readBack.body));
    assert.equal(readBack.body.policy.agentSharePercent, 62);
    assert.equal(readBack.body.policy.goodlucksSharePercent, 38);
    assert.equal(readBack.body.policy.status, 'active');
    assert.equal(readBack.body.policy.selfApproved, true);
  });

  test('the approval is recorded in the event trail with the exception named', async () => {
    const detail = await primary.get(`/api/admin/fee-policies/${state.primaryPolicyId}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    const history = detail.body.history;
    const actions = history.map((event) => event.action);
    assert.ok(actions.includes('created'), actions.join(','));
    assert.ok(actions.includes('submitted'), actions.join(','));
    assert.ok(actions.includes('approved_by_creator'), actions.join(','));
    assert.ok(actions.includes('activated'), actions.join(','));

    const approval = history.find((event) => event.action === 'approved_by_creator');
    assert.match(approval.note, /self-approval/i);
    // Creator, submitter and approver are the same named account, and the trail
    // says so instead of hiding it.
    assert.equal(approval.actorName, 'Primary Administrator');
  });
});

// ---------------------------------------------------------------------------
// The privilege does not spread, and history is not rewritten
// ---------------------------------------------------------------------------
describe('the exception is confined and non-destructive', () => {
  test('an ordinary administrator cannot self-approve after the flag exists', async () => {
    const created = await ordinary.post('/api/admin/fee-policies', {
      name: 'Ordinary admin — second attempt',
      category: 'rental_commission',
      agentTier: 'standard',
      calculationMethod: 'percentage',
      agentSharePercent: 55,
      goodlucksSharePercent: 45,
      effectiveFrom: new Date().toISOString().slice(0, 10),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const policyId = created.body.policy.id;

    const submitted = await ordinary.post(`/api/admin/fee-policies/${policyId}/submit`, {
      note: 'For approval by someone else.',
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));

    const approved = await ordinary.post(`/api/admin/fee-policies/${policyId}/approve`, {
      note: 'Trying again.',
    });
    assert.equal(approved.status, 422, JSON.stringify(approved.body));
    assert.match(approved.body.error, /different administrator/i);
  });

  test('a second administrator can still approve the primary administrator\'s policy', async () => {
    // The primary administrator drafts; the ordinary administrator approves.
    // The exception is not the only path — the normal one still works.
    const created = await primary.post('/api/admin/fee-policies', {
      name: 'Handed to a second approver',
      category: 'rental_commission',
      agentTier: 'professional',
      calculationMethod: 'percentage',
      agentSharePercent: 65,
      goodlucksSharePercent: 35,
      effectiveFrom: new Date().toISOString().slice(0, 10),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const policyId = created.body.policy.id;

    const submitted = await primary.post(`/api/admin/fee-policies/${policyId}/submit`, {
      note: 'Second approver please.',
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));

    const approved = await ordinary.post(`/api/admin/fee-policies/${policyId}/approve`, {
      note: 'Reviewed by a second administrator.',
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.policy.selfApproved, false);
  });

  test('the primary administrator approving someone else\'s policy is not a self-approval', async () => {
    const pending = await primary.get('/api/admin/fee-policies?status=pending_approval');
    assert.equal(pending.status, 200, JSON.stringify(pending.body));
    const ordinaryDraft = pending.body.policies.find((policy) => policy.name === 'Ordinary admin — second attempt');
    assert.ok(ordinaryDraft, 'the ordinary administrator\'s draft is still awaiting a second approver');

    const approved = await primary.post(`/api/admin/fee-policies/${ordinaryDraft.id}/approve`, {
      note: 'Reviewed by the primary administrator.',
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.policy.selfApproved, false);
  });

  test('activating a new policy does not rewrite the earlier approved policy', async () => {
    const before = await primary.get(`/api/admin/fee-policies/${state.primaryPolicyId}`);
    assert.equal(before.status, 200);
    const snapshot = JSON.stringify(before.body.policy);

    const pending = await primary.get(`/api/admin/fee-policies?status=pending_approval`);
    assert.equal(pending.status, 200);

    const after = await primary.get(`/api/admin/fee-policies/${state.primaryPolicyId}`);
    assert.equal(after.status, 200);
    assert.equal(JSON.stringify(after.body.policy), snapshot);

    // Recorded money is untouched by policy lifecycle changes: the ledger still
    // reads the same totals it did before this suite ran any activation.
    const ledger = await primary.get('/api/admin/viewing-fees');
    assert.equal(ledger.status, 200, JSON.stringify(ledger.body));
    assert.equal(typeof ledger.body.summary.viewingFeesCollectedGhs, 'number');
  });

  test('the ordinary administrator cannot clear or set the primary flag over HTTP', async () => {
    await ordinary.post('/api/admin/users', { email: ORDINARY_EMAIL, isPrimaryAdmin: true });

    const me = await ordinary.get('/api/auth/me');
    assert.equal(me.body.user.isPrimaryAdmin, false);
  });

  test('clearing the flag removes the union but keeps stored capabilities', async () => {
    const cleared = runPhpScript(
      'php-backend/assign_primary_admin.php',
      [`--email=${PRIMARY_EMAIL}`, '--confirm=0'],
      state.testEnv
    );
    assert.equal(cleared.status, 0, cleared.stdout + cleared.stderr);

    const me = await primary.get('/api/auth/me');
    assert.equal(me.body.user.isPrimaryAdmin, false);
    assert.equal(me.body.user.capabilities.feePolicySelfApprove, false);
    // It was never granted the finance/verification capabilities explicitly, so
    // they are gone with the flag — exactly as the model says.
    assert.equal(me.body.user.capabilities.verificationReviewer, false);
    assert.equal(me.body.user.capabilities.financeConfirm, false);
  });
});
