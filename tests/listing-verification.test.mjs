/**
 * Mandatory verification and the listing gate (Upgrade 2 correction).
 *
 * What this suite proves over the real HTTP API (SQLite, PHP-WASM):
 *
 *   1. There are exactly two registration groups. The Agent/Landlord group makes
 *      ONE shared account that is neither classified nor verified by registering.
 *   2. Property listing is closed to every Agent/Landlord account until its
 *      Ghana Card identity has been submitted AND approved — enforced by the
 *      server, not by hiding a button.
 *   3. The order is: registration → classification → identity → approval →
 *      listing. An unclassified account cannot even start verification.
 *   4. A Landlord verification needs the Ghana Card, the official name and the
 *      operating location, and needs no agent licensing.
 *   5. An approved Agent identity is Agent Tier 1 (60/40); the professional
 *      authorisation is Agent Tier 2 (70/30) and only an administrator's decision
 *      creates it.
 *   6. Tenants, existing verified accounts, administrators and the financial
 *      records are untouched by the rule.
 *
 *   node --test --test-concurrency=1 tests/listing-verification.test.mjs
 *
 * NOT covered (and never claimed): a browser, MySQL, a device. Those steps are
 * listed in the task report for manual verification.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { runPhpScript, startApiServer } from '../scripts/php.mjs';
import { ApiClient, createPng } from './helpers.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(projectRoot, '.data');
const stamp = `${process.pid}-${Date.now()}`;
const dbPath = path.join(dataDir, `listing-verification-${stamp}.sqlite`);
const port = 9400 + Math.floor(Math.random() * 200);

const ADMIN_ACCESS_KEY = 'listing-gate-access-key';
const ADMIN_EMAIL = `gate-admin-${stamp}@example.com`;
const ADMIN_PASSWORD = 'Gate-Admin-Password-1';
const PASSWORD = 'Listing-Gate-Pass-1';

/** The one sentence the business uses when listing is closed. */
const LISTING_MESSAGE = 'Complete your identity verification to start listing properties on Goodlucks Homes.';

const env = {
  DB_DRIVER: 'sqlite',
  DB_SQLITE_PATH: dbPath,
  APP_ENV: 'development',
  ADMIN_ACCESS_KEY,
  OFFICIAL_EMAIL: 'rentals@goodlucks.co',
  EMAIL_TRANSPORT: 'none',
  REGISTER_RATE_LIMIT_PER_HOUR: '100',
  IDENTITY_DATA_KEY: Buffer.alloc(32, 11).toString('base64'),
  VERIFICATION_RETENTION_DAYS: '365',
  PRIVATE_UPLOAD_DIR: path.join(dataDir, `listing-gate-private-${stamp}`),
  UPLOAD_DIR: path.join(dataDir, `listing-gate-uploads-${stamp}`),
  UPLOAD_URL_PATH: '/api/uploads',
};

let server;
let baseUrl;
let admin;
let reviewer;
let finance;
const state = {};

const uniqueEmail = (prefix) => `${prefix}-${stamp}-${Math.floor(Math.random() * 100000)}@example.com`;

const newListing = (overrides = {}) => ({
  title: 'Listing gate test apartment',
  location: 'East Legon',
  city: 'Accra',
  rentGhs: 4200,
  bedrooms: 2,
  bathrooms: 2,
  propertyType: 'Apartment',
  description: 'A two-bedroom apartment used by the listing-gate suite to exercise the verification rule.',
  images: ['https://example.com/listing-gate.jpg'],
  viewingFeeGhs: 150,
  viewingTerms: {
    appointmentRequired: true,
    howToArrange: 'Contact Goodlucks to arrange a viewing date.',
    conditions: 'Bring a valid ID to the viewing.',
    paymentInstructions: 'The fee is paid after the viewing, to Goodlucks Homes.',
    restrictions: 'No interior photography without the provider present.',
  },
  ...overrides,
});

/** Register through the website's Agent/Landlord group: no classification yet. */
const registerProvider = async (label, extra = {}) => {
  const client = new ApiClient(baseUrl);
  const email = uniqueEmail(`gate-provider-${label}`);
  const res = await client.post('/api/auth/register', {
    name: `Gate Provider ${label}`,
    email,
    phone: '+233 20 555 0900',
    password: PASSWORD,
    role: 'provider',
    operatingCity: 'Accra',
    agencyName: 'Listing Gate Agency',
    officialName: `Gate Provider ${label} Official`,
    ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { client, email, id: res.body.user.id, user: res.body.user };
};

/** Register through the group and make the Agent-or-Landlord choice. */
const registerClassified = async (label, category) => {
  const account = await registerProvider(label);
  const chosen = await account.client.post('/api/account/classification', { category });
  assert.equal(chosen.status, 200, JSON.stringify(chosen.body));
  return { ...account, role: category };
};

const uploadDocument = async (client, kind) => {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', new Blob([createPng(160, 100)], { type: 'image/png' }), `${kind}.png`);
  const res = await client.request('POST', '/api/verification/documents', { body: form });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.document.id;
};

/** Submit a Ghana Card identity the way the panel does (both sides on file). */
const submitIdentity = async (client, overrides = {}) => {
  const front = await uploadDocument(client, 'document_front');
  const back = await uploadDocument(client, 'document_back');
  return client.post('/api/verification/identity', {
    legalName: 'Gate Test Provider',
    documentType: 'ghana_card',
    documentNumber: 'GHA-111222333-4',
    documentIds: [front, back],
    ...overrides,
  });
};

const decideIdentity = (userId, decision, note) =>
  reviewer.client.post(`/api/admin/verifications/${userId}/identity/decision`, { decision, note });

const decideProfessional = (userId, decision, note) =>
  reviewer.client.post(`/api/admin/verifications/${userId}/professional/decision`, { decision, note });

const adminClient = async (email, password) => {
  const client = new ApiClient(baseUrl);
  const login = await client.post('/api/auth/admin-login', { email, password, accessKey: ADMIN_ACCESS_KEY });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { client, id: login.body.user.id, email };
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
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Gate Admin'],
    env
  );
  assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);
  admin = await adminClient(ADMIN_EMAIL, ADMIN_PASSWORD);

  const reviewerEmail = uniqueEmail('gate-reviewer');
  const reviewerPassword = 'Gate-Reviewer-Pass-1';
  const createdReviewer = runPhpScript(
    'tests/create-user.php',
    [`--email=${reviewerEmail}`, `--password=${reviewerPassword}`, '--name=Gate Reviewer', '--role=admin'],
    env
  );
  assert.equal(createdReviewer.status, 0, createdReviewer.stdout + createdReviewer.stderr);
  const granted = runPhpScript(
    'php-backend/grant_reviewer.php',
    [`--email=${reviewerEmail}`, '--reviewer=1', '--documents=1'],
    env
  );
  assert.equal(granted.status, 0, granted.stdout + granted.stderr);
  reviewer = await adminClient(reviewerEmail, reviewerPassword);

  const financeEmail = uniqueEmail('gate-finance');
  const financePassword = 'Gate-Finance-Pass-1';
  const createdFinance = runPhpScript(
    'tests/create-user.php',
    [`--email=${financeEmail}`, `--password=${financePassword}`, '--name=Gate Finance', '--role=admin'],
    env
  );
  assert.equal(createdFinance.status, 0, createdFinance.stdout + createdFinance.stderr);
  const financeGrant = runPhpScript(
    'php-backend/grant_finance.php',
    [`--email=${financeEmail}`, '--view=1', '--confirm=1'],
    env
  );
  assert.equal(financeGrant.status, 0, financeGrant.stdout + financeGrant.stderr);
  finance = await adminClient(financeEmail, financePassword);

  state.seeded = (await new ApiClient(baseUrl).get('/api/properties?perPage=1')).body.properties[0];
});

after(() => {
  server?.stop();
  fs.rmSync(env.PRIVATE_UPLOAD_DIR, { recursive: true, force: true });
  fs.rmSync(env.UPLOAD_DIR, { recursive: true, force: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
});

/* ------------------------------------------------------------------ cases 1-3 */

describe('Registration: two groups, and neither of them is a verified provider', () => {
  test('1. a tenant registers, signs in and gets the tenant experience with no verification duty', async () => {
    const client = new ApiClient(baseUrl);
    const email = uniqueEmail('gate-tenant');
    const res = await client.post('/api/auth/register', {
      name: 'Gate Tenant',
      email,
      phone: '+233 24 555 0101',
      password: 'Gate-Tenant-Pass-1',
      role: 'tenant',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.user.role, 'tenant');
    // A tenant is not a provider: the classification prompt and the provider
    // listing gate do not apply, so neither field is attached to the account.
    assert.equal(res.body.user.classificationRequired, undefined);
    assert.equal(res.body.user.canListProperties, undefined);

    const me = await client.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.role, 'tenant');

    const listing = await client.post('/api/properties', newListing({ title: 'Tenant attempt' }));
    assert.equal(listing.status, 403, JSON.stringify(listing.body));
  });

  test('2. the Agent/Landlord group creates ONE shared account, not an Agent and not a Landlord', async () => {
    const account = await registerProvider('shared');
    state.shared = account;

    const user = account.user;
    assert.notEqual(user.role, 'landlord', 'registering must never create a Landlord');
    assert.equal(user.providerCategory, 'pending');
    assert.equal(user.classificationRequired, true);
    assert.equal(user.agentProfile, null);
    assert.equal(user.isVerified, false);
    assert.equal(user.canListProperties, false);

    // The same credentials sign in on the Agent/Landlord tab, proving it is one account.
    const again = new ApiClient(baseUrl);
    const login = await again.post('/api/auth/login', { email: account.email, password: PASSWORD, role: 'provider' });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.user.providerCategory, 'pending');
  });

  test('3. registration alone grants no verification, no label and no listing access', async () => {
    const account = state.shared;
    assert.equal(account.user.verifiedLabel, null);
    assert.equal(account.user.listingBlockedReason, 'classification_required');
    assert.equal(account.user.identityVerificationStatus, 'not_submitted');

    const blocked = await account.client.post('/api/properties', newListing({ title: 'Before classification' }));
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
    assert.equal(blocked.body.fields.verificationRequired, LISTING_MESSAGE);
    assert.ok(blocked.body.fields.classificationRequired);
  });
});

/* --------------------------------------------------------------- cases 4-6 */

describe('The listing gate is enforced by the server', () => {
  test('4. verification cannot start until the account chooses Agent or Landlord', async () => {
    const account = state.shared;
    const summary = await account.client.get('/api/verification');
    assert.equal(summary.status, 200, JSON.stringify(summary.body));
    assert.equal(summary.body.verification.classificationRequired, true);
    assert.equal(summary.body.verification.listing.canList, false);
    assert.equal(summary.body.verification.listing.reason, 'classification_required');

    const form = new FormData();
    form.append('kind', 'document_front');
    form.append('file', new Blob([createPng(80, 80)], { type: 'image/png' }), 'card.png');
    const upload = await account.client.request('POST', '/api/verification/documents', { body: form });
    assert.equal(upload.status, 409, JSON.stringify(upload.body));
    assert.ok(upload.body.fields.classificationRequired);
  });

  test('5. an unclassified or unverified account cannot create a listing', async () => {
    const classified = await registerClassified('unverified-landlord', 'landlord');
    state.unverifiedLandlord = classified;

    const blocked = await classified.client.post('/api/properties', newListing({ title: 'Unverified landlord attempt' }));
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
    assert.equal(blocked.body.fields.verificationRequired, LISTING_MESSAGE);
    assert.equal(blocked.body.fields.verificationStatus, 'not_submitted');
    assert.equal(blocked.body.fields.classificationRequired, undefined, 'the choice is already made');

    const me = await classified.client.get('/api/auth/me');
    assert.equal(me.body.user.canListProperties, false);
    assert.equal(me.body.user.listingBlockedReason, 'identity_not_submitted');
  });

  test('6. no alternate route or client-controlled field bypasses the restriction', async () => {
    const client = state.unverifiedLandlord.client;

    // a) Asking for a live status in the create payload changes nothing.
    const live = await client.post('/api/properties', newListing({ title: 'Self-published attempt', status: 'active' }));
    assert.equal(live.status, 403, JSON.stringify(live.body));

    // b) Role and permission decorations in the payload are ignored.
    const decorated = await client.post(
      '/api/properties',
      newListing({
        title: 'Decorated attempt',
        role: 'admin',
        submittedByRole: 'admin',
        isVerified: true,
        canListProperties: true,
        providerCategory: 'landlord',
        accountStatus: 'active',
      })
    );
    assert.equal(decorated.status, 403, JSON.stringify(decorated.body));

    // c) Editing or publishing somebody else's listing is refused too.
    const edit = await client.put(`/api/properties/${state.seeded.id}`, { rentGhs: 1 });
    assert.equal(edit.status, 403, JSON.stringify(edit.body));
    const publish = await client.post(`/api/properties/${state.seeded.id}/status`, { status: 'active' });
    assert.equal(publish.status, 403, JSON.stringify(publish.body));

    // d) The blocked attempts created nothing.
    const mine = await client.get('/api/properties?mine=1');
    assert.equal(mine.status, 200);
    assert.equal(mine.body.properties.length, 0, 'refused submissions must not be stored');
  });
});

/* --------------------------------------------------------------- cases 7-8 */

describe('Landlord: Ghana Card, official name, operating location, then listing', () => {
  test('7. a landlord verification requires the Ghana Card, the official name and the location', async () => {
    // A landlord account with no city stored at registration: the operating
    // location has to come from the verification form.
    const client = new ApiClient(baseUrl);
    const email = uniqueEmail('gate-nocity-landlord');
    const signup = await client.post('/api/auth/register', {
      name: 'No City Landlord',
      email,
      phone: '+233 20 555 0950',
      password: 'Gate-NoCity-Pass-1',
      role: 'landlord',
    });
    assert.equal(signup.status, 201, JSON.stringify(signup.body));
    assert.equal(signup.body.user.address, '', 'the city stays optional at registration');
    state.noCityLandlord = { client, id: signup.body.user.id, email };

    const noName = await submitIdentity(client, { legalName: '' });
    assert.equal(noName.status, 422, JSON.stringify(noName.body));
    assert.ok(noName.body.fields.legalName, 'the official name as printed is required');

    const noLocation = await submitIdentity(client);
    assert.equal(noLocation.status, 422, JSON.stringify(noLocation.body));
    assert.match(String(noLocation.body.fields.operatingLocation), /area you let property/i);

    const singleSide = await client.post('/api/verification/identity', {
      legalName: 'Gate Test Landlord',
      documentType: 'ghana_card',
      documentNumber: 'GHA-111222333-4',
      operatingLocation: 'East Legon, Accra',
      documentIds: [],
    });
    assert.equal(singleSide.status, 422, JSON.stringify(singleSide.body));
    assert.ok(singleSide.body.fields.documents, 'a Ghana Card needs both sides');

    // No licensing is asked of a landlord at all.
    const professional = await client.post('/api/verification/professional', {
      licenceNumber: 'NOT-REQUIRED',
      issuingAuthority: 'Not applicable',
    });
    assert.equal(professional.status, 403, JSON.stringify(professional.body));

    const submitted = await submitIdentity(client, {
      legalName: 'Gate Test Landlord',
      operatingLocation: 'East Legon, Accra',
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(submitted.body.identity.status, 'pending_review');

    // The location is recorded on the account and reported in the summary.
    const summary = await client.get('/api/verification');
    assert.equal(summary.body.verification.operatingLocation, 'East Legon, Accra');

    // Submitted is not approved: listing is still closed.
    const stillBlocked = await client.post('/api/properties', newListing({ title: 'Awaiting review' }));
    assert.equal(stillBlocked.status, 403, JSON.stringify(stillBlocked.body));
    assert.equal(stillBlocked.body.fields.verificationStatus, 'pending_review');
  });

  test('8. an approved landlord can list and is a Verified Landlord', async () => {
    const landlord = state.unverifiedLandlord;
    // The city given at registration (Accra) is the operating location here, so
    // the form does not ask for it twice.
    const submitted = await submitIdentity(landlord.client, { legalName: 'Gate Test Landlord' });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));

    const approved = await decideIdentity(landlord.id, 'approve', 'Ghana Card, official name and area checked.');
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const summary = await landlord.client.get('/api/verification');
    assert.equal(summary.body.verification.listing.canList, true);
    assert.equal(summary.body.verification.listing.verifiedLabel, 'Verified Landlord');
    assert.equal(summary.body.verification.isLandlord, true);
    assert.equal(summary.body.verification.operatingLocation, 'Accra', 'the city given at registration is kept');

    const me = await landlord.client.get('/api/auth/me');
    assert.equal(me.body.user.role, 'landlord', 'the approved classification is the stored role');
    assert.equal(me.body.user.canListProperties, true);
    assert.equal(me.body.user.verifiedLabel, 'Verified Landlord');

    const created = await landlord.client.post('/api/properties', newListing({ title: 'Approved landlord listing' }));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.property.status, 'pending', 'listing still waits for staff approval');
    assert.equal(created.body.property.submittedByRole, 'landlord');
    state.landlordProperty = created.body.property;
  });
});

/* -------------------------------------------------------------- cases 9-12 */

describe('Agent: Tier 1 identity, then the optional Tier 2 authorisation', () => {
  test('9. an approved agent identity is Agent Tier 1 with listing access', async () => {
    const agent = await registerClassified('tier-one', 'agent');
    state.tierAgent = agent;

    const before = await agent.client.get('/api/verification');
    assert.equal(before.body.verification.listing.canList, false);

    const submitted = await submitIdentity(agent.client, { legalName: 'Gate Test Agent' });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));

    const approved = await decideIdentity(agent.id, 'approve', 'Ghana Card checked for the Tier 1 test.');
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const after = await agent.client.get('/api/verification');
    assert.equal(after.body.verification.agentTier.tier, 'standard');
    assert.equal(after.body.verification.agentTier.commissionTier, 'tier_a');
    assert.equal(after.body.verification.agentTier.commissionPercent, 60);
    assert.equal(after.body.verification.agentTier.goodlucksPercent, 40);
    assert.equal(after.body.verification.listing.canList, true);
    assert.equal(after.body.verification.listing.verifiedLabel, 'Verified Agent Tier 1');

    // The agent profile was opened by the approval, not by registering.
    const profile = await agent.client.get('/api/agent/profile');
    assert.equal(profile.status, 200, JSON.stringify(profile.body));
    assert.equal(profile.body.profile.accountStatus, 'active');
    assert.equal(profile.body.permissions.canSubmitListings, true);
  });

  test('10. Agent Tier 1 can list, and its commission split is 60/40', async () => {
    const agent = state.tierAgent;
    const created = await agent.client.post('/api/properties', newListing({ title: 'Tier 1 agent listing' }));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    state.tierProperty = created.body.property;

    const commission = await finance.client.post('/api/admin/finance/commissions', {
      propertyId: created.body.property.id,
      agentUserId: agent.id,
      amountGhs: 1000,
      dueDate: '2027-01-15',
    });
    assert.equal(commission.status, 201, JSON.stringify(commission.body));
    assert.equal(commission.body.commission.agentTier, 'standard');
    assert.equal(commission.body.commission.agentSharePercent, 60);
    assert.equal(commission.body.commission.goodlucksSharePercent, 40);
    assert.equal(commission.body.commission.agentShareGhs, 600);
    assert.equal(commission.body.commission.goodlucksShareGhs, 400);
  });

  test('11. a Tier 2 submission waits for review and changes no split by itself', async () => {
    const agent = state.tierAgent;
    const licence = await uploadDocument(agent.client, 'licence');
    const submitted = await agent.client.post('/api/verification/professional', {
      licenceNumber: 'REAC-GATE-0001',
      issuingAuthority: 'Real Estate Agency Council (test value)',
      licenceCategory: 'Agency',
      issueDate: '2026-01-05',
      expiryDate: '2027-01-05',
      documentIds: [licence],
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(submitted.body.professional.status, 'pending_review');

    const own = await agent.client.get('/api/verification');
    assert.equal(own.body.verification.agentTier.commissionPercent, 60, 'uploading is never an upgrade');
    assert.equal(own.body.verification.listing.verifiedLabel, 'Verified Agent Tier 1');
    assert.equal(own.body.verification.agentTier.commissionTier, 'tier_a');
  });

  test('12. only an administrator approval creates Agent Tier 2, and it carries 70/30', async () => {
    const agent = state.tierAgent;
    const approved = await decideProfessional(agent.id, 'approve', 'Licence number and document checked.');
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const own = await agent.client.get('/api/verification');
    assert.equal(own.body.verification.agentTier.commissionTier, 'higher');
    assert.equal(own.body.verification.agentTier.commissionPercent, 70);
    assert.equal(own.body.verification.agentTier.goodlucksPercent, 30);
    assert.equal(own.body.verification.listing.canList, true, 'Tier 2 keeps listing access');
    assert.equal(own.body.verification.listing.verifiedLabel, 'Verified Agent Tier 2');

    const commission = await finance.client.post('/api/admin/finance/commissions', {
      propertyId: state.tierProperty.id,
      agentUserId: agent.id,
      amountGhs: 1000,
      dueDate: '2027-02-15',
    });
    assert.equal(commission.status, 201, JSON.stringify(commission.body));
    assert.equal(commission.body.commission.agentTier, 'professional');
    assert.equal(commission.body.commission.agentSharePercent, 70);
    assert.equal(commission.body.commission.goodlucksSharePercent, 30);
    assert.equal(commission.body.commission.agentShareGhs, 700);
    assert.equal(commission.body.commission.goodlucksShareGhs, 300);
  });
});

/* ------------------------------------------------------------- cases 13-15 */

describe('Existing accounts and administrators are preserved', () => {
  test('13. an existing verified account keeps its access without re-verifying', async () => {
    // A pre-existing record: the account and its approved identity already exist,
    // as they would for a provider verified before this correction shipped.
    const email = uniqueEmail('gate-legacy-landlord');
    const password = 'Gate-Legacy-Pass-1';
    const created = runPhpScript(
      'tests/create-user.php',
      [`--email=${email}`, `--password=${password}`, '--name=Legacy Landlord', '--role=landlord'],
      env
    );
    assert.equal(created.status, 0, created.stdout + created.stderr);
    const seeded = runPhpScript('tests/approve-verification.php', [`--email=${email}`], env);
    assert.equal(seeded.status, 0, seeded.stdout + seeded.stderr);
    assert.equal(JSON.parse(seeded.stdout.trim().split('\n').pop()).identityStatus, 'approved');

    const client = new ApiClient(baseUrl);
    const login = await client.post('/api/auth/login', { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.user.role, 'landlord');
    assert.equal(login.body.user.canListProperties, true);
    assert.equal(login.body.user.verifiedLabel, 'Verified Landlord');

    const created2 = await client.post('/api/properties', newListing({ title: 'Legacy landlord listing' }));
    assert.equal(created2.status, 201, JSON.stringify(created2.body));

    // The existing verification record is not reset or rewritten by signing in.
    const summary = await client.get('/api/verification');
    assert.equal(summary.body.verification.identity.status, 'approved');
    assert.equal(summary.body.verification.identity.establishesOwnership, false, 'identity is not ownership');
  });

  test('14. the commission split follows the verified tier for both tiers', async () => {
    const tierOne = await registerClassified('commission-t1', 'agent');
    assert.equal((await submitIdentity(tierOne.client, { legalName: 'Gate Commission One' })).status, 201);
    assert.equal((await decideIdentity(tierOne.id, 'approve', 'Tier 1 commission fixture.')).status, 200);
    const oneProperty = await tierOne.client.post('/api/properties', newListing({ title: 'Tier 1 commission listing' }));
    assert.equal(oneProperty.status, 201, JSON.stringify(oneProperty.body));

    const tierTwo = await registerClassified('commission-t2', 'agent');
    assert.equal((await submitIdentity(tierTwo.client, { legalName: 'Gate Commission Two' })).status, 201);
    assert.equal((await decideIdentity(tierTwo.id, 'approve', 'Tier 2 commission fixture.')).status, 200);
    const licence = await uploadDocument(tierTwo.client, 'licence');
    assert.equal(
      (
        await tierTwo.client.post('/api/verification/professional', {
          licenceNumber: 'REAC-GATE-0002',
          issuingAuthority: 'Real Estate Agency Council (test value)',
          licenceCategory: 'Agency',
          issueDate: '2026-02-01',
          expiryDate: '2027-02-01',
          documentIds: [licence],
        })
      ).status,
      201
    );
    assert.equal((await decideProfessional(tierTwo.id, 'approve', 'Tier 2 licence checked.')).status, 200);
    const twoProperty = await tierTwo.client.post('/api/properties', newListing({ title: 'Tier 2 commission listing' }));
    assert.equal(twoProperty.status, 201, JSON.stringify(twoProperty.body));

    const one = await finance.client.post('/api/admin/finance/commissions', {
      propertyId: oneProperty.body.property.id,
      agentUserId: tierOne.id,
      amountGhs: 2000,
      dueDate: '2027-03-01',
    });
    const two = await finance.client.post('/api/admin/finance/commissions', {
      propertyId: twoProperty.body.property.id,
      agentUserId: tierTwo.id,
      amountGhs: 2000,
      dueDate: '2027-03-01',
    });
    assert.equal(one.status, 201, JSON.stringify(one.body));
    assert.equal(two.status, 201, JSON.stringify(two.body));
    assert.deepEqual(
      [one.body.commission.agentShareGhs, one.body.commission.goodlucksShareGhs],
      [1200, 800],
      'Tier 1: 60% to the agent, 40% to Goodlucks'
    );
    assert.deepEqual(
      [two.body.commission.agentShareGhs, two.body.commission.goodlucksShareGhs],
      [1400, 600],
      'Tier 2: 70% to the agent, 30% to Goodlucks'
    );
  });

  test('15. administrators keep full property management while the gate applies to providers', async () => {
    // The administrator is exempt from the provider gate and can still moderate.
    const stats = await admin.client.get('/api/admin/stats');
    assert.equal(stats.status, 200, JSON.stringify(stats.body));

    const pending = state.landlordProperty;
    const published = await admin.client.post(`/api/properties/${pending.id}/status`, { status: 'active' });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.property.status, 'active');

    const featured = await admin.client.post(`/api/properties/${pending.id}/feature`, { featured: true });
    assert.equal(featured.status, 200, JSON.stringify(featured.body));

    const list = await admin.client.get('/api/admin/properties?perPage=100');
    assert.equal(list.status, 200);
    assert.ok(list.body.properties.some((row) => row.id === pending.id));

    // The gate itself is untouched by administrator activity: a brand-new
    // provider account still cannot list, and the database still holds every
    // listing and commission the run created.
    const fresh = await registerClassified('admin-check', 'landlord');
    const blocked = await fresh.client.post('/api/properties', newListing({ title: 'Still blocked' }));
    assert.equal(blocked.status, 403, JSON.stringify(blocked.body));

    const ledger = await finance.client.get('/api/admin/finance/commissions');
    assert.equal(ledger.status, 200, JSON.stringify(ledger.body));
    assert.ok(ledger.body.commissions.length >= 3, 'the commissions recorded above still exist');
  });

  test('15b. editing a listing is gated too, so a suspended provider cannot rewrite its advert', async () => {
    const agent = await registerClassified('edit-gate', 'agent');
    assert.equal((await submitIdentity(agent.client, { legalName: 'Gate Edit Agent' })).status, 201);
    assert.equal((await decideIdentity(agent.id, 'approve', 'Gate edit fixture.')).status, 200);
    const created = await agent.client.post('/api/properties', newListing({ title: 'Edit gate listing' }));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const propertyId = created.body.property.id;

    // A verified provider may edit its own listing.
    const edited = await agent.client.put(`/api/properties/${propertyId}`, { rentGhs: 4500 });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));

    // Suspension closes listing, and that includes editing what already exists.
    const suspended = await admin.client.post(`/api/admin/agents/${agent.id}/status`, {
      accountStatus: 'suspended',
      canSubmitListings: false,
      note: 'Suspended while testing the edit gate.',
    });
    assert.equal(suspended.status, 200, JSON.stringify(suspended.body));

    const blockedEdit = await agent.client.put(`/api/properties/${propertyId}`, { rentGhs: 9999 });
    assert.equal(blockedEdit.status, 403, JSON.stringify(blockedEdit.body));
    assert.equal(blockedEdit.body.fields?.verificationStatus, 'approved');
    assert.match(String(blockedEdit.body.error), /suspended/i);

    // The record is intact and staff management still works on it.
    const asAdmin = await admin.client.get(`/api/properties/${propertyId}`);
    assert.equal(asAdmin.status, 200);
    assert.equal(asAdmin.body.property.rentGhs, 4500, 'the refused edit changed nothing');
  });
});
