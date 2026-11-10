/**
 * Agent-first correction tests — the two account groups and the one-time
 * Agent-or-Landlord classification.
 *
 * What this suite proves over the real HTTP API (SQLite, PHP-WASM):
 *
 *   1. Registration offers exactly two groups. 'provider' (the website's
 *      Agent/Landlord account) is accepted and stored as a provider account in a
 *      'pending' classification state — never as a third account type.
 *   2. A pending Agent/Landlord account can sign in, but cannot submit a listing
 *      and cannot start verification until it has chosen Agent or Landlord.
 *   3. The choice is made once, in the same account, with no second registration
 *      or second login: choosing Landlord turns the account into a landlord and
 *      choosing Agent creates the usual pending agent profile.
 *   4. It cannot be repeated by the account holder; staff correction remains the
 *      only way to change it afterwards, and it keeps `provider_category` in step.
 *   5. Existing behaviour is unchanged: a landlord or agent that registers with
 *      its role directly is classified at registration exactly as before.
 *
 *   node --test --test-concurrency=1 tests/provider-classification.test.mjs
 *
 * NOT covered (and never claimed): a MySQL server, a browser, a device.
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
const dbPath = path.join(dataDir, `provider-classification-${stamp}.sqlite`);
const port = 9200 + Math.floor(Math.random() * 200);

const ADMIN_ACCESS_KEY = 'classification-access-key';
const PASSWORD = 'Classification-Pass-123';

const env = {
  DB_DRIVER: 'sqlite',
  DB_SQLITE_PATH: dbPath,
  APP_ENV: 'development',
  ADMIN_ACCESS_KEY,
  OFFICIAL_EMAIL: 'rentals@goodlucks.co',
  EMAIL_TRANSPORT: 'none',
  REGISTER_RATE_LIMIT_PER_HOUR: '80',
  IDENTITY_DATA_KEY: Buffer.alloc(32, 7).toString('base64'),
  PRIVATE_UPLOAD_DIR: path.join(dataDir, `classification-private-${stamp}`),
  UPLOAD_DIR: path.join(dataDir, `classification-uploads-${stamp}`),
  UPLOAD_URL_PATH: '/api/uploads',
};

let server;
let baseUrl;

const uniqueEmail = (prefix) => `${prefix}-${stamp}-${Math.floor(Math.random() * 100000)}@example.com`;

/** Register through the website's Agent/Landlord group (no Agent/Landlord choice). */
const registerProvider = async (label, extra = {}) => {
  const client = new ApiClient(baseUrl);
  const email = uniqueEmail(`provider-${label}`);
  const res = await client.post('/api/auth/register', {
    name: `Provider ${label}`,
    email,
    phone: '+233 20 555 0777',
    password: PASSWORD,
    role: 'provider',
    operatingCity: 'Accra',
    agencyName: 'Classification Test Agency',
    officialName: `Provider ${label} Official`,
    ...extra,
  });
  return { client, res, email };
};

const newListing = (overrides = {}) => ({
  title: 'Classification test apartment',
  location: 'East Legon',
  city: 'Accra',
  rentGhs: 3900,
  bedrooms: 2,
  bathrooms: 2,
  propertyType: 'Apartment',
  description: 'A two-bedroom apartment used by the classification suite to exercise listing rules.',
  images: ['https://example.com/classification.jpg'],
  landlordName: 'Owner Named By Provider',
  landlordEmail: `owner-${stamp}@example.com`,
  viewingFeeGhs: 150,
  viewingTerms: {
    howToArrange: 'Contact Goodlucks to arrange a viewing date.',
    feeTerms: 'The fee is paid after the viewing, to Goodlucks Homes.',
    payer: 'tenant',
  },
  ...overrides,
});

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(env.PRIVATE_UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;
});

after(() => {
  server?.stop();
  fs.rmSync(env.PRIVATE_UPLOAD_DIR, { recursive: true, force: true });
  fs.rmSync(env.UPLOAD_DIR, { recursive: true, force: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
});

describe('The Agent/Landlord account group', () => {
  test('the website group registers one account that is not yet Agent or Landlord', async () => {
    const { client, res } = await registerProvider('new');
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const user = res.body.user;
    // Stored as a provider account, on the agent role, with no classification yet.
    assert.equal(user.role, 'agent');
    assert.equal(user.providerCategory, 'pending');
    assert.equal(user.classificationRequired, true);
    // Nothing is granted at registration: the choice comes first.
    assert.equal(user.agentProfile, null);

    const me = await client.get('/api/auth/me');
    assert.equal(me.body.user.providerCategory, 'pending');
    assert.equal(me.body.user.classificationRequired, true);
  });

  test('the Agent/Landlord tab signs in and the Tenant tab refuses the same account', async () => {
    const { email } = await registerProvider('login');

    const providerTab = new ApiClient(baseUrl);
    const ok = await providerTab.post('/api/auth/login', { email, password: PASSWORD, role: 'provider' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.user.role, 'agent');

    const tenantTab = new ApiClient(baseUrl);
    const refused = await tenantTab.post('/api/auth/login', { email, password: PASSWORD, role: 'tenant' });
    assert.equal(refused.status, 403, JSON.stringify(refused.body));
    // The account is an Agent/Landlord account, so the guidance names that tab.
    assert.match(refused.body.error, /an Agent\/Landlord account/);
    assert.match(refused.body.error, /Agent\/Landlord tab/);
  });

  test('a pending account cannot submit a listing before it has chosen', async () => {
    const { client } = await registerProvider('nolisting');
    const created = await client.post('/api/properties', newListing({ title: 'Too early' }));
    assert.equal(created.status, 409, JSON.stringify(created.body));
    assert.ok(created.body.fields.classificationRequired);
  });

  test('a pending account cannot start verification before it has chosen', async () => {
    const { client } = await registerProvider('noverify');
    const summary = await client.get('/api/verification');
    assert.equal(summary.status, 200, JSON.stringify(summary.body));
    assert.equal(summary.body.verification.classificationRequired, true);

    const form = new FormData();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    form.append('kind', 'document_front');
    form.append('file', new Blob([png], { type: 'image/png' }), 'card-front.png');
    const upload = await client.request('POST', '/api/verification/documents', { body: form });
    assert.equal(upload.status, 409, JSON.stringify(upload.body));
    assert.ok(upload.body.fields.classificationRequired);
  });
});

describe('Choosing Agent or Landlord', () => {
  test('choosing Landlord reclassifies the same account and grants nothing else', async () => {
    const { client, res } = await registerProvider('as-landlord');
    const id = res.body.user.id;

    const chosen = await client.post('/api/account/classification', { category: 'landlord' });
    assert.equal(chosen.status, 200, JSON.stringify(chosen.body));
    assert.equal(chosen.body.user.id, id, 'the same account, not a second one');
    assert.equal(chosen.body.user.role, 'landlord');
    assert.equal(chosen.body.user.providerCategory, 'landlord');
    assert.equal(chosen.body.user.classificationRequired, false);

    // A landlord needs no agent profile, and a listing still waits for review.
    const me = await client.get('/api/auth/me');
    assert.equal(me.body.user.agentProfile, undefined);

    const listed = await client.post('/api/properties', newListing({ title: 'Landlord after choosing' }));
    assert.equal(listed.status, 201, JSON.stringify(listed.body));
    assert.equal(listed.body.property.status, 'pending');
  });

  test('choosing Agent creates the normal pending agent profile', async () => {
    const { client } = await registerProvider('as-agent');
    const chosen = await client.post('/api/account/classification', { category: 'agent' });
    assert.equal(chosen.status, 200, JSON.stringify(chosen.body));
    assert.equal(chosen.body.user.role, 'agent');
    assert.equal(chosen.body.user.providerCategory, 'agent');
    assert.equal(chosen.body.user.classificationRequired, false);

    const profile = chosen.body.user.agentProfile;
    assert.ok(profile, 'the agent profile is created by the choice');
    assert.equal(profile.accountStatus, 'pending_review');
    assert.equal(profile.canSubmitListings, false);
    // The base and the business name given at registration are carried over,
    // not asked for twice.
    assert.equal(profile.operatingCity, 'Accra');
    assert.equal(profile.agencyName, 'Classification Test Agency');

    const blocked = await client.post('/api/properties', newListing({ title: 'Unapproved agent listing' }));
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
  });

  test('the choice is available once and only on an Agent/Landlord account', async () => {
    const { client } = await registerProvider('once');
    const first = await client.post('/api/account/classification', { category: 'landlord' });
    assert.equal(first.status, 200, JSON.stringify(first.body));

    const second = await client.post('/api/account/classification', { category: 'agent' });
    assert.equal(second.status, 409, JSON.stringify(second.body));
    assert.match(second.body.error, /already has a classification/i);

    // The input is still validated first: an unknown label is refused either way.
    const invalid = await client.post('/api/account/classification', { category: 'both' });
    assert.equal(invalid.status, 422, JSON.stringify(invalid.body));
    assert.ok(invalid.body.fields.category);

    const tenant = new ApiClient(baseUrl);
    const registered = await tenant.post('/api/auth/register', {
      name: 'Tenant Without Choice',
      email: uniqueEmail('tenant-choice'),
      phone: '+233 20 555 0888',
      password: PASSWORD,
      role: 'tenant',
    });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    const refused = await tenant.post('/api/account/classification', { category: 'agent' });
    assert.equal(refused.status, 403, JSON.stringify(refused.body));
  });

  test('an invalid category is refused on a pending account', async () => {
    const { client } = await registerProvider('invalid');
    const res = await client.post('/api/account/classification', { category: 'supervisor' });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.ok(res.body.fields.category);
  });
});

describe('Staff correction keeps the classification in step', () => {
  test('staff can correct a classified account and the stored category follows', async () => {
    const adminEmail = uniqueEmail('admin-classification');
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${adminEmail}`, `--password=${PASSWORD}`, '--name=Classification Admin', '--role=admin'],
      env
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);

    // Correcting an account classification is a directory capability.
    const granted = runPhpScript(
      'php-backend/grant_directory.php',
      [`--email=${adminEmail}`, '--users=1', '--activity=0'],
      env
    );
    assert.equal(granted.status, 0, granted.stdout + granted.stderr);

    const admin = new ApiClient(baseUrl);
    const login = await admin.post('/api/auth/admin-login', {
      email: adminEmail,
      password: PASSWORD,
      accessKey: ADMIN_ACCESS_KEY,
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));

    const { client, res } = await registerProvider('corrected');
    const id = res.body.user.id;
    const chosen = await client.post('/api/account/classification', { category: 'landlord' });
    assert.equal(chosen.status, 200, JSON.stringify(chosen.body));

    const corrected = await admin.post(`/api/admin/users/${id}/role`, {
      role: 'agent',
      reason: 'Registered as a landlord but acts for the owner of these flats.',
    });
    assert.equal(corrected.status, 200, JSON.stringify(corrected.body));

    const me = await client.get('/api/auth/me');
    assert.equal(me.body.user.role, 'agent');
    assert.equal(me.body.user.providerCategory, 'agent', 'the stored classification follows the correction');
    assert.equal(me.body.user.classificationRequired, false, 'a corrected account is not asked to choose again');
  });
});

describe('Existing registrations are unchanged', () => {
  test('a landlord that registers as a landlord is classified at registration', async () => {
    const client = new ApiClient(baseUrl);
    const res = await client.post('/api/auth/register', {
      name: 'Direct Landlord',
      email: uniqueEmail('direct-landlord'),
      phone: '+233 20 555 0999',
      password: PASSWORD,
      role: 'landlord',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.user.role, 'landlord');
    assert.equal(res.body.user.providerCategory, 'landlord');
    assert.equal(res.body.user.classificationRequired, false);
  });

  test('an agent that registers as an agent keeps its profile and stays pending', async () => {
    const client = new ApiClient(baseUrl);
    const res = await client.post('/api/auth/register', {
      name: 'Direct Agent',
      email: uniqueEmail('direct-agent'),
      phone: '+233 20 555 0111',
      password: PASSWORD,
      role: 'agent',
      operatingCity: 'Kumasi',
      agencyName: 'Direct Agency',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.user.role, 'agent');
    assert.equal(res.body.user.providerCategory, 'agent');
    assert.equal(res.body.user.classificationRequired, false);
    assert.equal(res.body.user.agentProfile.accountStatus, 'pending_review');
  });

  test('a tenant is never asked to classify', async () => {
    const client = new ApiClient(baseUrl);
    const res = await client.post('/api/auth/register', {
      name: 'Plain Tenant',
      email: uniqueEmail('plain-tenant'),
      phone: '+233 20 555 0222',
      password: PASSWORD,
      role: 'tenant',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.user.role, 'tenant');
    assert.equal(res.body.user.providerCategory, undefined);
    assert.equal(res.body.user.classificationRequired, undefined);
  });
});
