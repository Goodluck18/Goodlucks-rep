/**
 * Goodlucks Homes — Upgrade 2 · Phase 3
 * Bulk email campaigns (A12).
 *
 * What this suite proves, and how
 * -------------------------------
 * The endpoint is only half the promise, so the tests read the rows the queue
 * actually wrote:
 *
 *   - a three-recipient audience produces three outbox rows, one address each;
 *   - no message contains another recipient's address (read from the stored
 *     bodies, not from the API's word for it);
 *   - every message carries a working preferences link;
 *   - marketing only reaches addresses that opted in, and opting out removes an
 *     address immediately;
 *   - a failed message can be retried without re-sending the ones that worked;
 *   - the capability is enforced server-side.
 *
 *   node --test tests/bulk-email.test.mjs
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
const dbPath = path.join(dataDir, `bulk-${stamp}.sqlite`);
const privateDir = path.join(dataDir, `bulk-private-${stamp}`);
const port = 9300 + Math.floor(Math.random() * 90);

const ADMIN_EMAIL = 'bulk.admin@test.local';
const ADMIN_PASSWORD = 'Bulk-Admin-Password-123';
const NO_CAP_ADMIN_EMAIL = 'bulk.nocap@test.local';
const NO_CAP_ADMIN_PASSWORD = 'Bulk-NoCap-Password-123';
const ADMIN_ACCESS_KEY = 'bulk-test-key';

let server;
let baseUrl;
const state = {};

const uniqueEmail = (prefix) => `${prefix}-${stamp}@example.com`;

const fixture = (args) => {
  const result = runPhpScript('tests/campaign-fixtures.php', args, state.env);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result;
};

const parseDump = (campaignId) => {
  const result = fixture([`--dump=${campaignId}`]);
  const line = result.stdout.trim().split('\n').pop();
  return JSON.parse(line);
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
    EMAIL_TRANSPORT: 'none',
    PRIVATE_UPLOAD_DIR: privateDir,
    IDENTITY_DATA_KEY: Buffer.alloc(32, 7).toString('base64'),
    REGISTER_RATE_LIMIT_PER_HOUR: '60',
  };
  state.env = env;

  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  for (const [email, password, name] of [
    [ADMIN_EMAIL, ADMIN_PASSWORD, 'Bulk Admin'],
    [NO_CAP_ADMIN_EMAIL, NO_CAP_ADMIN_PASSWORD, 'No Cap Admin'],
  ]) {
    const bootstrap = runPhpScript(
      'php-backend/admin_bootstrap.php',
      [`--email=${email}`, `--password=${password}`, `--name=${name}`],
      env
    );
    assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);
  }

  const grant = runPhpScript('php-backend/grant_directory.php', [`--email=${ADMIN_EMAIL}`, '--bulk=1'], env);
  assert.equal(grant.status, 0, grant.stdout + grant.stderr);
  assert.match(grant.stdout, /Bulk mail:\s*granted/i);

  state.admin = new ApiClient(baseUrl);
  state.noCapAdmin = new ApiClient(baseUrl);
  state.guest = new ApiClient(baseUrl);
  state.tenant = new ApiClient(baseUrl);

  for (const [client, email, password] of [
    [state.admin, ADMIN_EMAIL, ADMIN_PASSWORD],
    [state.noCapAdmin, NO_CAP_ADMIN_EMAIL, NO_CAP_ADMIN_PASSWORD],
  ]) {
    const login = await client.post('/api/auth/admin-login', { email, password, accessKey: ADMIN_ACCESS_KEY });
    assert.equal(login.status, 200, JSON.stringify(login.body));
  }

  state.optedIn = [uniqueEmail('bulk-a'), uniqueEmail('bulk-b'), uniqueEmail('bulk-c')];
  state.notOptedIn = uniqueEmail('bulk-d');

  for (const [index, email] of [...state.optedIn, state.notOptedIn].entries()) {
    const script = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, '--password=Bulk-Recipient-Pass-1', `--name=Recipient ${index + 1}`, '--role=tenant'],
      env
    );
    assert.equal(script.status, 0, script.stdout + script.stderr);
  }

  const tenantLogin = await state.tenant.post('/api/auth/login', {
    email: state.optedIn[0],
    password: 'Bulk-Recipient-Pass-1',
  });
  assert.equal(tenantLogin.status, 200, JSON.stringify(tenantLogin.body));

  // Exactly three addresses opt in; the fourth does not.
  fixture(state.optedIn.map((email) => `--opt-in=${email}`));
});

after(() => {
  server?.stop();
});

describe('A12: audiences and opt-in', () => {
  test('marketing reaches only the addresses that opted in', async () => {
    const res = await state.admin.get('/api/admin/campaigns/preview?audience=all&kind=marketing');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.total, 3, `expected the three opted-in addresses, got ${res.body.total}`);
    assert.ok(res.body.excludedUnsubscribed >= 1);

    const listed = res.body.recipients.map((recipient) => recipient.email);
    for (const email of state.optedIn) assert.ok(listed.includes(email));
    assert.ok(!listed.includes(state.notOptedIn));
  });

  test('a service notice reaches every account in the audience', async () => {
    const res = await state.admin.get('/api/admin/campaigns/preview?audience=all&kind=service');
    assert.equal(res.status, 200);
    assert.ok(res.body.total >= 4, `expected every account, got ${res.body.total}`);
  });

  test('an empty draft is refused with per-field messages', async () => {
    const res = await state.admin.post('/api/admin/campaigns', {
      subject: '',
      body: '   ',
      audience: 'nobody',
      kind: 'marketing',
    });
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.subject);
    assert.ok(res.body.fields.body);
    assert.ok(res.body.fields.audience.includes('all'));
  });

  test('a draft saves exactly as written, sanitised', async () => {
    const res = await state.admin.post('/api/admin/campaigns', {
      subject: 'Three new homes in East Legon',
      body: '<p>Hello {{name}},</p><p>Look at <a href="/properties">the new listings</a>.</p><script>alert(1)</script>',
      audience: 'all',
      kind: 'marketing',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.campaign.status, 'draft');
    assert.equal(res.body.campaign.recipientTotal, 0);
    assert.ok(!res.body.campaign.bodyHtml.includes('<script'), 'the stored body must not keep a script tag');
    assert.ok(res.body.campaign.bodyHtml.includes('{{name}}'));
    state.draftId = res.body.campaign.id;
  });
});

describe('A12: queueing produces one message per recipient', () => {
  test('queueing writes one outbox row per opted-in address', async () => {
    const res = await state.admin.post(`/api/admin/campaigns/${state.draftId}/queue`, {});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.campaign.status, 'queued');
    assert.equal(res.body.counts.total, 3);
    assert.ok(res.body.message.includes('3'));

    const dump = parseDump(state.draftId);
    assert.equal(dump.recipients.length, 3);

    for (const row of dump.recipients) {
      assert.ok(row.outbox_id, 'each recipient must point at its own outbox row');
      assert.equal(row.outbox_status, 'pending');
      // The request's shutdown flush may already have tried once (transport is
      // disabled here, so the message stays pending with attempts >= 0).
      assert.ok(Number(row.attempts) >= 0);
      assert.equal(row.subject, 'Three new homes in East Legon');
      // One address per message: never a comma-separated list, never a Bcc.
      assert.ok(!row.recipient_email.includes(','));
      assert.ok(!/[,;\s]/.test(row.recipient_email.trim()), 'the address must be a single address');
    }
  });

  test('no message carries another recipient\'s address', async () => {
    const dump = parseDump(state.draftId);
    const addresses = dump.recipients.map((row) => row.recipient_email.toLowerCase());

    for (const row of dump.recipients) {
      const body = row.body_html.toLowerCase();
      for (const other of addresses) {
        if (other === row.recipient_email.toLowerCase()) continue;
        assert.ok(!body.includes(other), `${row.recipient_email} can see ${other}`);
      }
    }
  });

  test('every message carries a working preferences link', async () => {
    const dump = parseDump(state.draftId);
    assert.ok(dump.preferences.length >= 3, 'each opted-in address has a preference row');

    for (const row of dump.recipients) {
      const match = row.body_html.match(/\/email\/preferences\?token=([a-f0-9]{16,})/);
      assert.ok(match, 'the message must link to the preferences page');
      const token = match[1];

      const page = await state.guest.get(`/api/email/preferences?token=${token}`, { raw: true });
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /Email preferences/i);
      // The page names the address with its middle hidden.
      assert.ok(!html.includes(row.recipient_email), 'the page must mask the address');
    }
  });

  test('a queued campaign cannot be queued twice', async () => {
    const again = await state.admin.post(`/api/admin/campaigns/${state.draftId}/queue`, {});
    assert.equal(again.status, 409);
  });

  test('a failed message can be retried without touching the others', async () => {
    fixture([`--fail-outbox=${state.draftId}`]);

    const afterFailure = await state.admin.get(`/api/admin/campaigns/${state.draftId}`);
    assert.equal(afterFailure.status, 200);
    assert.equal(afterFailure.body.counts.failed, 1);
    assert.equal(afterFailure.body.counts.pending, 2);

    const retried = await state.admin.post(`/api/admin/campaigns/${state.draftId}/retry`, {});
    assert.equal(retried.status, 200, JSON.stringify(retried.body));
    assert.equal(retried.body.counts.failed, 0);
    assert.equal(retried.body.counts.pending, 3);

    const dump = parseDump(state.draftId);
    for (const row of dump.recipients) {
      assert.equal(row.outbox_status, 'pending');
      assert.equal(row.recipient_status, 'queued');
      // The attempt counter restarted (the fallback message is failure #1, not
      // the parked #6), so the message really is back in the queue.
      assert.ok(Number(row.attempts) < 6, 'a retried message starts its attempts again');
    }
  });
});

describe('A12: opting out takes effect immediately', () => {
  test('the preferences page can stop marketing email', async () => {
    const dump = parseDump(state.draftId);
    const token = dump.preferences.find(
      (row) => row.email === state.optedIn[2] && Number(row.marketing_opt_in) === 1
    )?.unsubscribe_token;
    assert.ok(token, 'the third address should hold an opt-in token');

    const res = await state.guest.post('/api/email/preferences', { token, optIn: false });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.preferences.optIn, false);
    assert.ok(!res.body.preferences.email.includes(state.optedIn[2]), 'the response must mask the address');

    const preview = await state.admin.get('/api/admin/campaigns/preview?audience=all&kind=marketing');
    assert.equal(preview.body.total, 2, 'the opted-out address must leave the audience at once');

    const back = await state.guest.post('/api/email/preferences', { token, optIn: true });
    assert.equal(back.body.preferences.optIn, true);
  });

  test('an unknown preferences token is refused', async () => {
    const page = await state.guest.get('/api/email/preferences?token=deadbeef', { raw: true });
    assert.equal(page.status, 404);
    const post = await state.guest.post('/api/email/preferences', { token: 'deadbeef', optIn: true });
    assert.equal(post.status, 404);
  });
});

describe('A12: the capability is enforced on the server', () => {
  test('an administrator without the bulk-email capability is refused', async () => {
    assert.equal((await state.noCapAdmin.get('/api/admin/campaigns')).status, 403);
    assert.equal((await state.noCapAdmin.get('/api/admin/campaigns/preview?audience=all')).status, 403);
    assert.equal((await state.noCapAdmin.get(`/api/admin/campaigns/${state.draftId}`)).status, 403);
    const create = await state.noCapAdmin.post('/api/admin/campaigns', {
      subject: 'Not allowed',
      body: '<p>Not allowed</p>',
      audience: 'all',
      kind: 'marketing',
    });
    assert.equal(create.status, 403);
  });

  test('an ordinary account and a visitor are refused', async () => {
    assert.equal((await state.tenant.get('/api/admin/campaigns')).status, 403);
    assert.equal((await state.guest.get('/api/admin/campaigns')).status, 401);
  });

  test('a campaign never sends itself', async () => {
    // Queueing writes rows; delivery belongs to the outbox worker. With the
    // transport disabled nothing was delivered, which is what the states show.
    const summary = await state.admin.get(`/api/admin/campaigns/${state.draftId}`);
    assert.equal(summary.body.counts.sent, 0);
    assert.ok(summary.body.counts.pending > 0);
  });
});
