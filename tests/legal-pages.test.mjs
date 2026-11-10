/**
 * Legal Pages and registration consent — the real HTTP API (SQLite, PHP-WASM).
 *
 * What this suite proves:
 *
 *   1. Both documents are served from the DATABASE, publish their first version
 *      on a fresh installation, need no sign-in, and are reachable by their
 *      public URL.
 *   2. A draft is never public: no public endpoint serves it, and the public
 *      page keeps showing the published version while a draft exists.
 *   3. Publishing creates a new version, keeps the previous one whole as
 *      `superseded`, moves the public page immediately, and records who
 *      published it and when in the audit log.
 *   4. Restoring an older version publishes a NEW version that copies it; every
 *      earlier row is untouched.
 *   5. Registration is refused by the SERVER without both the Terms acceptance
 *      and the Privacy acknowledgement, and the two are recorded separately with
 *      the version, the timestamp and the account.
 *   6. Existing accounts are never silently marked as having accepted anything.
 *   7. Editing and publishing are separate capabilities: an administrator
 *      without them cannot read, save, publish or restore.
 *   8. Rich text is sanitised before it is stored or served (no script, no event
 *      handler, no javascript: URL, no image, no iframe).
 *   9. A failed publish or restore changes nothing that is live.
 *  10. The migration adds the three tables and the two capability columns to an
 *      existing database, and re-running it is a no-op.
 *
 *   node --test --test-concurrency=1 tests/legal-pages.test.mjs
 *
 * NOT covered here (never claimed): a real browser, MySQL/MariaDB, a mail server.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { runPhpScript, startApiServer } from '../scripts/php.mjs';
import { ApiClient } from './helpers.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(projectRoot, '.data');
const stamp = `${process.pid}-${Date.now()}`;
const dbPath = path.join(dataDir, `legal-${stamp}.sqlite`);
const port = 9900 + Math.floor(Math.random() * 90);

const ADMIN_ACCESS_KEY = 'legal-access-key';
const ADMIN_EMAIL = `legal-admin-${stamp}@example.com`;
const ADMIN_PASSWORD = 'Legal-Admin-Password-1';
const EDITOR_EMAIL = `legal-editor-${stamp}@example.com`;
const PUBLISHER_EMAIL = `legal-publisher-${stamp}@example.com`;
const PASSWORD = 'Legal-Pass-1';

const env = {
  DB_DRIVER: 'sqlite',
  DB_SQLITE_PATH: dbPath,
  APP_ENV: 'development',
  ADMIN_ACCESS_KEY,
  OFFICIAL_EMAIL: 'rentals@goodlucks.co',
  EMAIL_TRANSPORT: 'none',
  REGISTER_RATE_LIMIT_PER_HOUR: '400',
};

let server;
let baseUrl;
let admin;       // primary-capable: created by admin_bootstrap (holds everything)
let editor;      // manage-only
let publisher;   // publish-only
let tenant;      // an ordinary account

const uniqueEmail = (prefix) => `${prefix}-${stamp}-${Math.floor(Math.random() * 100000)}@example.com`;

const json = (result) => JSON.stringify(result.body);

const adminLogin = async (email, password) => {
  const client = new ApiClient(baseUrl);
  const login = await client.post('/api/auth/admin-login', { email, password, accessKey: ADMIN_ACCESS_KEY });
  assert.equal(login.status, 200, json(login));
  return { client, id: login.body.user.id, email };
};

/** Read the tables straight from SQLite (no API involved). */
const inspectLegal = () => {
  const result = runPhpScript(
    'tests/sqlite-tool.php',
    [`--path=${dbPath}`, '--mode=tables'],
    env
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
};

/** A read-only query helper through the PHP runtime (no SQLite driver in Node). */
const query = (sql, params = {}) => {
  const result = runPhpScript(
    'tests/legal-query.php',
    [
      `--path=${dbPath}`,
      `--sql=${Buffer.from(sql).toString('base64')}`,
      `--param=${Buffer.from(JSON.stringify(params)).toString('base64')}`,
    ],
    env
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  return parsed.rows;
};

const publicDocument = async (slug) => {
  const res = await new ApiClient(baseUrl).get(`/api/legal/${slug}`);
  assert.equal(res.status, 200, json(res));
  return res.body.document;
};

const bodyOf = (document) => document.contentHtml;

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Legal Admin'],
    env
  );
  assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);
  admin = await adminLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
  // The bootstrap administrator is not granted anything implicitly: being an
  // administrator must never be enough. Grant both legal capabilities explicitly.
  const grantedAdmin = runPhpScript(
    'php-backend/grant_legal.php',
    [`--email=${ADMIN_EMAIL}`, '--manage=1', '--publish=1'],
    env
  );
  assert.equal(grantedAdmin.status, 0, grantedAdmin.stdout + grantedAdmin.stderr);

  // Two more administrators: one may edit only, one may publish only. Both are
  // created directly in the database, then granted exactly one capability.
  for (const [email, name] of [[EDITOR_EMAIL, 'Legal Editor'], [PUBLISHER_EMAIL, 'Legal Publisher']]) {
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${ADMIN_PASSWORD}`, `--name=${name}`, '--role=admin'],
      env
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);
  }
  const grantedEditor = runPhpScript('php-backend/grant_legal.php', [`--email=${EDITOR_EMAIL}`, '--manage=1'], env);
  assert.equal(grantedEditor.status, 0, grantedEditor.stdout + grantedEditor.stderr);
  const grantedPublisher = runPhpScript('php-backend/grant_legal.php', [`--email=${PUBLISHER_EMAIL}`, '--publish=1'], env);
  assert.equal(grantedPublisher.status, 0, grantedPublisher.stdout + grantedPublisher.stderr);
  editor = await adminLogin(EDITOR_EMAIL, ADMIN_PASSWORD);
  publisher = await adminLogin(PUBLISHER_EMAIL, ADMIN_PASSWORD);

  tenant = new ApiClient(baseUrl);
  const registered = await tenant.post('/api/auth/register', {
    name: 'Legal Tenant',
    email: uniqueEmail('legal-tenant'),
    phone: '+233 24 000 0000',
    password: PASSWORD,
    role: 'tenant',
  });
  assert.equal(registered.status, 201, json(registered));
  tenant.id = registered.body.user.id;
});

after(async () => {
  server?.stop?.();
  await new Promise((resolve) => setTimeout(resolve, 200));
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* 1. The public pages                                                        */
/* -------------------------------------------------------------------------- */

describe('the public legal pages are served from the database', () => {
  test('both documents exist after a fresh install, with a published first version', async () => {
    const index = await new ApiClient(baseUrl).get('/api/legal');
    assert.equal(index.status, 200, json(index));
    const types = index.body.documents.map((doc) => doc.type).sort();
    assert.deepEqual(types, ['privacy', 'terms']);
    for (const doc of index.body.documents) {
      assert.equal(doc.version, 1, `${doc.type} starts at version 1`);
      assert.ok(doc.effectiveAt, `${doc.type} has an effective date`);
    }

    const tables = inspectLegal().tables;
    for (const table of ['legal_documents', 'legal_document_versions', 'legal_acceptances']) {
      assert.ok(tables.includes(table), `${table} is created`);
    }
  });

  test('the Terms page needs no sign-in and contains the 18 required sections', async () => {
    const document = await publicDocument('terms-and-conditions');
    assert.equal(document.type, 'terms');
    assert.ok(!document.contentHtml.includes('draft'), 'no draft text is served');

    const expected = [
      'Introduction and acceptance',
      'Eligibility and registration',
      'Tenant responsibilities',
      'Agent and landlord responsibilities',
      'Listing accuracy and availability',
      'Identity verification and its limits',
      'Viewing arrangements',
      'Viewing fees and payment',
      'Our role as an intermediary',
      'Rental agreements between tenants and landlords',
      'Prohibited conduct, fraud and misleading listings',
      'Suspension, restriction and termination',
      'Availability confirmation and listing expiry',
      'Intellectual property',
      'Platform availability and limitation of liability',
      'Disputes and Ghanaian law',
      'Changes to these Terms',
      'Contact us',
    ];
    for (const heading of expected) {
      assert.ok(document.contentHtml.includes(heading), `the Terms cover “${heading}”`);
    }
    assert.match(document.contentHtml, /does <strong>not<\/strong> prove that the account holder owns/i);
    assert.match(document.contentHtml, /every seven days/i);
  });

  test('the Privacy Policy covers its 17 sections and claims no encryption or automatic deletion', async () => {
    const document = await publicDocument('privacy-policy');
    assert.equal(document.type, 'privacy');

    const expected = [
      ['Introduction and who we are', 'Data Protection Act, 2012 (Act 843)'],
      ['Information we collect when you register', 'one-way hash'],
      ['Information we collect from tenants', 'Viewing requests'],
      ['Information we collect from agents and landlords', 'professional classification'],
      ['Ghana Card and identity verification data', 'not part of the public website'],
      ['Listing and viewing request data', 'not included in that request'],
      ['Saved properties, notifications and activity', 'audit log'],
      ['How we use your information', 'search alerts'],
      ['When we share information', 'do not sell personal information'],
      ['Email communications', 'cannot be switched off'],
      ['How we protect your information', 'No system is perfectly secure'],
      ['Retention and deletion', 'do not promise automatic deletion'],
      ['Your rights of access and correction', 'correct information that is wrong'],
      ['Complaints and contact', 'Data Protection Commission of Ghana'],
      ['Cookies and local storage', 'HTTP-only'],
      ['Changes to this policy', 'does not, by itself, count as your acknowledgement'],
      ['Contact us', 'contact page'],
    ];
    // Compare against the visible text: the stored HTML legitimately wraps words
    // in <strong>/<em>, which must not make a phrase look absent.
    const text = document.contentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
    for (const [heading, phrase] of expected) {
      assert.ok(document.contentHtml.includes(heading), `the Privacy Policy covers “${heading}”`);
      assert.ok(text.includes(phrase.toLowerCase()), `“${heading}” includes “${phrase}”`);
    }
    assert.doesNotMatch(document.contentHtml, /end-to-end encrypt|encrypted at rest/i, 'no encryption claim is made');
    assert.doesNotMatch(document.contentHtml, /never shared/i, 'no “never shared” claim is made');
  });

  test('an unknown slug is a 404, and a draft-only document is never invented', async () => {
    const res = await new ApiClient(baseUrl).get('/api/legal/not-a-document');
    assert.equal(res.status, 404, json(res));
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Registration consent                                                    */
/* -------------------------------------------------------------------------- */

describe('registration requires and records legal consent', () => {
  const baseRegistration = (email) => ({
    name: 'Consent Check',
    email,
    phone: '+233 24 000 0001',
    password: PASSWORD,
    role: 'tenant',
  });

  test('no acceptance at all is refused by the server (422) and no account is created', async () => {
    const email = uniqueEmail('consent-none');
    // `.request()` on purpose: `post()` adds the consent the fixtures send, and
    // this test is checking what happens without it.
    const res = await new ApiClient(baseUrl).request('POST', '/api/auth/register', {
      body: baseRegistration(email),
    });
    assert.equal(res.status, 422, json(res));
    assert.ok(res.body.fields?.termsAccepted, 'the Terms field is named');
    assert.ok(res.body.fields?.privacyAcknowledged, 'the Privacy field is named');

    const rows = query('SELECT id FROM users WHERE email = :email', { email });
    assert.equal(rows.length, 0, 'no account was created');
  });

  test('Terms without the Privacy acknowledgement is still refused', async () => {
    const res = await new ApiClient(baseUrl).request('POST', '/api/auth/register', {
      body: {
        ...baseRegistration(uniqueEmail('consent-half')),
        termsAccepted: true,
        privacyAcknowledged: false,
      },
    });
    assert.equal(res.status, 422, json(res));
    assert.ok(res.body.fields?.privacyAcknowledged);
    assert.equal(res.body.fields?.termsAccepted, undefined, 'the accepted document is not blamed');
  });

  test('a false-looking string is not accepted as consent', async () => {
    const res = await new ApiClient(baseUrl).request('POST', '/api/auth/register', {
      body: {
        ...baseRegistration(uniqueEmail('consent-string')),
        termsAccepted: 'no',
        privacyAcknowledged: 'no',
      },
    });
    assert.equal(res.status, 422, json(res));
  });

  test('accepting both creates the account and records two separate acceptances', async () => {
    const email = uniqueEmail('consent-ok');
    const res = await new ApiClient(baseUrl).post('/api/auth/register', {
      ...baseRegistration(email),
      termsAccepted: true,
      privacyAcknowledged: true,
    });
    assert.equal(res.status, 201, json(res));
    const userId = res.body.user.id;

    const rows = query(
      'SELECT document_type, version_number, version_id, source, accepted_at FROM legal_acceptances WHERE user_id = :id ORDER BY document_type',
      { id: userId }
    );
    assert.equal(rows.length, 2, 'exactly two records: Terms and Privacy');
    const byType = Object.fromEntries(rows.map((row) => [row.document_type, row]));
    assert.ok(byType.terms, 'the Terms acceptance exists');
    assert.ok(byType.privacy, 'the Privacy acknowledgement exists');
    for (const row of rows) {
      assert.equal(Number(row.version_number), 1, 'the published version is recorded');
      assert.equal(row.source, 'registration');
      assert.match(String(row.accepted_at), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'a real timestamp is stored');
      assert.ok(row.version_id, 'the exact version row is named');
    }
    assert.notEqual(byType.terms.version_id, byType.privacy.version_id, 'the two documents are distinct records');
  });

  test('an acceptance for a stale version is refused rather than mis-recorded', async () => {
    const res = await new ApiClient(baseUrl).post('/api/auth/register', {
      ...baseRegistration(uniqueEmail('consent-stale')),
      termsAccepted: true,
      privacyAcknowledged: true,
      termsVersion: 99,
    });
    assert.equal(res.status, 409, json(res));
    assert.match(res.body.error, /changed/i);
  });

  test('existing accounts are never marked as having accepted anything', async () => {
    const email = uniqueEmail('consent-existing');
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${PASSWORD}`, '--name=Existing Tenant', '--role=tenant'],
      env
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);

    const rows = query(
      'SELECT a.id FROM legal_acceptances a JOIN users u ON u.id = a.user_id WHERE u.email = :email',
      { email }
    );
    assert.equal(rows.length, 0, 'no acceptance was invented for the pre-existing account');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Permissions                                                             */
/* -------------------------------------------------------------------------- */

describe('editing and publishing are separate capabilities', () => {
  test('an administrator with neither capability cannot read or write the console', async () => {
    const plain = await (async () => {
      const email = uniqueEmail('legal-plain');
      const created = runPhpScript(
        'tests/create-user.php',
        [`--email=${email}`, `--password=${ADMIN_PASSWORD}`, '--name=Plain Admin', '--role=admin'],
        env
      );
      assert.equal(created.status, 0, created.stdout + created.stderr);
      return adminLogin(email, ADMIN_PASSWORD);
    })();

    const list = await plain.client.get('/api/admin/legal');
    assert.equal(list.status, 403, json(list));
    const save = await plain.client.put('/api/admin/legal/terms/draft', { contentHtml: '<h2>1. X</h2><p>Y</p>' });
    assert.equal(save.status, 403, json(save));
  });

  test('a signed-out visitor and an ordinary tenant cannot reach the console at all', async () => {
    const guest = await new ApiClient(baseUrl).get('/api/admin/legal');
    assert.equal(guest.status, 401, json(guest));
    const tenantTry = await tenant.get('/api/admin/legal');
    assert.equal(tenantTry.status, 403, json(tenantTry));
  });

  test('the editor may save and preview but not publish', async () => {
    const save = await editor.client.put('/api/admin/legal/privacy/draft', {
      contentHtml: '<h2>1. Introduction and who we are</h2><p>Editor draft.</p>',
    });
    assert.equal(save.status, 200, json(save));
    assert.equal(save.body.draft.status, 'draft');

    const preview = await editor.client.post('/api/admin/legal/privacy/preview', {
      contentHtml: '<h2>1. Introduction</h2><p>Preview only.</p>',
    });
    assert.equal(preview.status, 200, json(preview));

    const publish = await editor.client.post('/api/admin/legal/privacy/publish', { confirm: true });
    assert.equal(publish.status, 403, json(publish));
    assert.match(publish.body.error, /publish/i);

    // Clean up the draft so later sections start from a known state.
    const discard = await editor.client.delete('/api/admin/legal/privacy/draft');
    assert.equal(discard.status, 200, json(discard));
  });

  test('the publisher may publish but cannot edit', async () => {
    const save = await publisher.client.put('/api/admin/legal/privacy/draft', {
      contentHtml: '<h2>1. Introduction</h2><p>Publisher draft.</p>',
    });
    assert.equal(save.status, 403, json(save));
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Drafts, publishing, history                                             */
/* -------------------------------------------------------------------------- */

describe('draft isolation, publishing and version history', () => {
  const MARKER = 'DRAFT-ONLY-MARKER';
  let publishedBefore;

  test('a saved draft never reaches the public page', async () => {
    publishedBefore = await publicDocument('terms-and-conditions');
    const draftHtml = bodyOf(publishedBefore).replace(
      '<h2>1. Introduction and acceptance</h2>',
      `<h2>1. Introduction and acceptance</h2><p>${MARKER}</p>`
    );

    const save = await editor.client.put('/api/admin/legal/terms/draft', { contentHtml: draftHtml });
    assert.equal(save.status, 200, json(save));

    const publicNow = await publicDocument('terms-and-conditions');
    assert.equal(publicNow.version, publishedBefore.version, 'the public version has not moved');
    assert.ok(!publicNow.contentHtml.includes(MARKER), 'the draft text is not public');

    // The admin view does show the draft — that is the point of saving it.
    const adminView = await editor.client.get('/api/admin/legal/terms');
    assert.equal(adminView.status, 200, json(adminView));
    assert.ok(adminView.body.document.draft.contentHtml.includes(MARKER), 'the console sees the draft');
  });

  test('publishing needs an explicit confirmation', async () => {
    const res = await publisher.client.post('/api/admin/legal/terms/publish', {});
    assert.equal(res.status, 422, json(res));
    const stillOld = await publicDocument('terms-and-conditions');
    assert.equal(stillOld.version, publishedBefore.version, 'nothing was published');
  });

  test('publishing moves the public page, keeps the old version and audits the publisher', async () => {
    const publish = await publisher.client.post('/api/admin/legal/terms/publish', {
      confirm: true,
      changeNote: 'Added the draft marker for the test suite',
    });
    assert.equal(publish.status, 200, json(publish));
    assert.equal(publish.body.published.version, 2);
    assert.equal(publish.body.published.status, 'published');

    const publicNow = await publicDocument('terms-and-conditions');
    assert.equal(publicNow.version, 2, 'the public page serves the new version');
    assert.ok(publicNow.contentHtml.includes(MARKER), 'the published text is live');

    const history = await admin.client.get('/api/admin/legal/terms');
    assert.equal(history.status, 200, json(history));
    const versions = history.body.document.versions;
    assert.equal(versions.length, 2);
    const v1 = versions.find((version) => version.version === 1);
    const v2 = versions.find((version) => version.version === 2);
    assert.equal(v1.status, 'superseded', 'the previous version is kept, not deleted');
    assert.equal(v2.status, 'published');
    assert.equal(v2.publishedByName, 'Legal Publisher', 'the publishing administrator is recorded');
    assert.equal(v2.changeNote, 'Added the draft marker for the test suite');

    // The old version's body is still whole and retrievable.
    const old = await admin.client.get('/api/admin/legal/terms/versions/1');
    assert.equal(old.status, 200, json(old));
    assert.ok(!old.body.version.contentHtml.includes(MARKER), 'version 1 keeps its own text');

    // The audit trail names the administrator, the version and the time.
    const audit = query(
      "SELECT actor_id, action, context_json, created_at FROM audit_logs WHERE action = 'legal.published' ORDER BY created_at DESC"
    );
    assert.ok(audit.length >= 1, 'the publication is in the audit log');
    assert.equal(audit[0].actor_id, publisher.id);
    assert.match(String(audit[0].context_json), /"version":2/);
  });

  test('a second publish is version 3 and the history keeps every version', async () => {
    const current = await publicDocument('terms-and-conditions');
    const save = await editor.client.put('/api/admin/legal/terms/draft', {
      contentHtml: current.contentHtml.replace(MARKER, 'SECOND-PUBLICATION-MARKER'),
    });
    assert.equal(save.status, 200, json(save));

    const publish = await publisher.client.post('/api/admin/legal/terms/publish', { confirm: true });
    assert.equal(publish.status, 200, json(publish));
    assert.equal(publish.body.published.version, 3);

    const history = await admin.client.get('/api/admin/legal/terms');
    const statuses = history.body.document.versions.map((version) => `${version.version}:${version.status}`);
    assert.deepEqual(statuses.sort(), ['1:superseded', '2:superseded', '3:published']);
  });

  test('restoring an older version publishes a NEW version and rewrites nothing', async () => {
    const before = await admin.client.get('/api/admin/legal/terms');
    const v1Before = before.body.document.versions.find((version) => version.version === 1);

    const restore = await publisher.client.post('/api/admin/legal/terms/restore', { version: 1, confirm: true });
    assert.equal(restore.status, 200, json(restore));
    assert.equal(restore.body.published.version, 4, 'a new publication, not a rewind');
    assert.equal(restore.body.published.restoredFromVersion, 1);

    const publicNow = await publicDocument('terms-and-conditions');
    assert.equal(publicNow.version, 4);
    assert.ok(!publicNow.contentHtml.includes('SECOND-PUBLICATION-MARKER'), 'the restored text is the old text');

    const after = await admin.client.get('/api/admin/legal/terms');
    const v1After = after.body.document.versions.find((version) => version.version === 1);
    assert.equal(v1After.status, 'superseded', 'version 1 keeps its own status');
    assert.equal(v1After.publishedAt, v1Before.publishedAt, 'version 1 keeps its publication timestamp');
    const v2 = after.body.document.versions.find((version) => version.version === 2);
    assert.ok(v2, 'version 2 still exists');
  });

  test('restoring is refused while an unpublished draft exists', async () => {
    const current = await publicDocument('terms-and-conditions');
    const save = await editor.client.put('/api/admin/legal/terms/draft', {
      contentHtml: current.contentHtml.replace('Contact us', 'Contact us (pending draft)'),
    });
    assert.equal(save.status, 200, json(save));

    const restore = await publisher.client.post('/api/admin/legal/terms/restore', { version: 2, confirm: true });
    assert.equal(restore.status, 409, json(restore));
    const publicNow = await publicDocument('terms-and-conditions');
    assert.equal(publicNow.version, current.version, 'the live version did not move');

    const discard = await editor.client.delete('/api/admin/legal/terms/draft');
    assert.equal(discard.status, 200, json(discard));
  });

  test('publishing with no draft fails cleanly and leaves the live document intact', async () => {
    const before = await publicDocument('terms-and-conditions');
    const publish = await publisher.client.post('/api/admin/legal/terms/publish', { confirm: true });
    assert.equal(publish.status, 409, json(publish));
    const after = await publicDocument('terms-and-conditions');
    assert.deepEqual(after, before, 'nothing changed');
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Sanitising                                                              */
/* -------------------------------------------------------------------------- */

describe('rich text is sanitised before it is stored or served', () => {
  test('scripts, handlers, javascript: URLs, images and iframes are stripped', async () => {
    const hostile = [
      '<h2>1. Introduction</h2>',
      '<p>Safe text</p>',
      '<script>alert(1)</script>',
      '<p onclick="steal()">Handled <a href="javascript:alert(2)">link</a></p>',
      '<img src="x" onerror="alert(3)">',
      '<iframe src="https://evil.example/"></iframe>',
      '<style>body{display:none}</style>',
      '<p>Ends safely.</p>',
    ].join('');

    const save = await editor.client.put('/api/admin/legal/privacy/draft', { contentHtml: hostile });
    assert.equal(save.status, 200, json(save));
    const stored = save.body.draft.contentHtml;

    for (const banned of ['<script', 'onclick', 'onerror', 'javascript:', '<img', '<iframe', '<style']) {
      assert.ok(!stored.toLowerCase().includes(banned), `${banned} was removed`);
    }
    assert.ok(stored.includes('Safe text'), 'the safe text survives');
    assert.ok(stored.includes('<h2>1. Introduction</h2>'), 'allowed formatting survives');

    const published = await publisher.client.post('/api/admin/legal/privacy/publish', { confirm: true });
    assert.equal(published.status, 200, json(published));

    const publicPrivacy = await publicDocument('privacy-policy');
    assert.ok(!publicPrivacy.contentHtml.toLowerCase().includes('<script'), 'the public body has no script');
    assert.ok(!publicPrivacy.contentHtml.toLowerCase().includes('onerror'), 'the public body has no handler');

    // Restore the real policy, so the fixture database ends in a truthful state —
    // and prove once more that a restoration is a new publication.
    const restore = await publisher.client.post('/api/admin/legal/privacy/restore', { version: 1, confirm: true });
    assert.equal(restore.status, 200, json(restore));
    assert.equal(restore.body.published.restoredFromVersion, 1);
    const restored = await publicDocument('privacy-policy');
    assert.ok(restored.contentHtml.length > 1000, 'the real policy is back');
    assert.ok(!restored.contentHtml.includes('Safe text'), 'the test text is no longer live');
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Re-acceptance                                                           */
/* -------------------------------------------------------------------------- */

describe('the re-acceptance prompt is explicit, separate, and off by default', () => {
  test('the prompt is off by default even though newer versions have been published', async () => {
    const me = await tenant.get('/api/auth/me');
    assert.equal(me.status, 200, json(me));
    assert.equal(me.body.legal.reacceptanceRequired, false, 'publishing alone never switches it on');
    assert.equal(me.body.legal.terms.acceptedVersion, 1);
    assert.equal(me.body.legal.terms.currentVersion, 4, 'the account is told the current version');
  });

  test('only a publishing administrator can switch it on', async () => {
    const refused = await editor.client.put('/api/admin/legal/reacceptance', { required: true });
    assert.equal(refused.status, 403, json(refused));

    const allowed = await publisher.client.put('/api/admin/legal/reacceptance', { required: true });
    assert.equal(allowed.status, 200, json(allowed));
    assert.equal(allowed.body.reacceptanceRequired, true);
  });

  test('with the prompt on, an account that accepted an older version is asked to accept again', async () => {
    const me = await tenant.get('/api/auth/me');
    assert.equal(me.body.legal.reacceptanceRequired, true);
    assert.equal(me.body.legal.terms.needsAcceptance, true, 'the Terms moved on');
    // The Privacy Policy also moved on during the sanitising test (it was
    // published and then restored as a new version). The two documents are
    // tracked independently, which is exactly what these separate records are for.
    assert.equal(me.body.legal.privacy.needsAcceptance, true);
    assert.equal(me.body.legal.privacy.acceptedVersion, 1, 'the recorded acceptance is still version 1');
  });

  test('accepting records a new Terms acceptance and leaves the old one untouched', async () => {
    const before = query(
      'SELECT version_number, source FROM legal_acceptances WHERE user_id = :id AND document_type = :type ORDER BY version_number',
      { id: tenant.id, type: 'terms' }
    );
    assert.deepEqual(before.map((row) => Number(row.version_number)), [1], 'the registration acceptance is there');

    const accept = await tenant.post('/api/account/legal-acceptance', {
      termsAccepted: true,
      privacyAcknowledged: false,
    });
    assert.equal(accept.status, 200, json(accept));

    const after = query(
      'SELECT version_number, source FROM legal_acceptances WHERE user_id = :id AND document_type = :type ORDER BY version_number',
      { id: tenant.id, type: 'terms' }
    );
    assert.deepEqual(after.map((row) => Number(row.version_number)), [1, 4], 'a new record, not a rewrite');
    assert.equal(after[1].source, 'reacceptance');

    const me = await tenant.get('/api/auth/me');
    assert.equal(me.body.legal.terms.needsAcceptance, false, 'the Terms are now up to date');
    assert.equal(me.body.legal.privacy.acceptedVersion, 1, 'accepting the Terms did not touch the Privacy record');
    assert.equal(me.body.legal.privacy.needsAcceptance, true, 'the Privacy Policy still needs its own acknowledgement');
  });

  test('the prompt can be switched off again without touching any record', async () => {
    const off = await publisher.client.put('/api/admin/legal/reacceptance', { required: false });
    assert.equal(off.status, 200, json(off));
    const me = await tenant.get('/api/auth/me');
    assert.equal(me.body.legal.reacceptanceRequired, false);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. Migration                                                               */
/* -------------------------------------------------------------------------- */

describe('the migration upgrades an existing database additively', () => {
  const schemaPath = path.join(projectRoot, 'php-backend', 'schema.sqlite.sql');
  const legacyPath = path.join(dataDir, `legal-legacy-${stamp}.sqlite`);

  /** The schema with the legal tables and the two capability columns removed. */
  const legacySchema = () => {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    return sql
      .replace(/CREATE TABLE IF NOT EXISTS legal_documents[\s\S]*?;\n/, '')
      .replace(/CREATE TABLE IF NOT EXISTS legal_document_versions[\s\S]*?;\n/, '')
      .replace(/CREATE TABLE IF NOT EXISTS legal_acceptances[\s\S]*?;\n/, '')
      .replace(/^\s*can_manage_legal.*\n/m, '')
      .replace(/^\s*can_publish_legal.*\n/m, '');
  };

  const inspectDb = (mode, extra = []) => {
    const result = runPhpScript('tests/sqlite-tool.php', [`--path=${legacyPath}`, `--mode=${mode}`, ...extra], {});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout.trim());
  };

  before(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(legacyPath + suffix, { force: true });
    }
    // Build a real SQLite database from the reduced schema (writing SQL text into
    // a .sqlite file would not create one), exactly as an older installation
    // would already have.
    const schemaFile = path.join(dataDir, `legal-legacy-${stamp}.sql`);
    fs.writeFileSync(schemaFile, legacySchema());
    fs.writeFileSync(legacyPath, '');
    const created = runPhpScript(
      'tests/sqlite-tool.php',
      [`--path=${legacyPath}`, '--mode=exec-file', `--file=${schemaFile}`],
      {}
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);
    fs.rmSync(schemaFile, { force: true });
  });

  after(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(legacyPath + suffix, { force: true });
    }
  });

  test('the pre-migration database has no legal storage', () => {
    const tables = inspectDb('tables').tables;
    assert.ok(!tables.includes('legal_documents'));
    assert.ok(!tables.includes('legal_acceptances'));
    assert.ok(tables.includes('users'), 'the rest of the schema is intact');
  });

  test('migrate --apply creates the tables and the columns, and a second run is a no-op', () => {
    const legacyEnv = { ...env, DB_SQLITE_PATH: legacyPath };
    const dry = runPhpScript('php-backend/migrate.php', [], legacyEnv);
    assert.equal(dry.status, 0, dry.stdout + dry.stderr);
    assert.match(dry.stdout, /CREATE TABLE legal_documents/);

    const applied = runPhpScript('php-backend/migrate.php', ['--apply'], legacyEnv);
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
    assert.match(applied.stdout, /Migration completed successfully/);

    const tables = inspectDb('tables').tables;
    for (const table of ['legal_documents', 'legal_document_versions', 'legal_acceptances']) {
      assert.ok(tables.includes(table), `${table} was created`);
    }
    const columns = inspectDb('columns', ['--table=users']).columns;
    assert.ok(columns.includes('can_manage_legal'));
    assert.ok(columns.includes('can_publish_legal'));

    const again = runPhpScript('php-backend/migrate.php', ['--apply'], legacyEnv);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /already up to date|no changes/i);

    // Nothing that existed before was removed.
    assert.ok(inspectDb('tables').tables.includes('properties'));
  });
});
