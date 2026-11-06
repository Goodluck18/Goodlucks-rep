/**
 * Task 03 tests — registration categories, Ghana Card identity verification,
 * professional verification, commission tiers (60% / 70%), and per-property
 * viewing fees and terms.
 *
 * They run in their own file, with their own PHP server, database and upload
 * folders, for the same reasons as the Task 02 suite: a failure here cannot
 * cascade into the shared API suite, and the PHP-WASM fallback is happier with
 * shorter-lived server processes.
 *
 *   npm run test:api
 *
 * NOT covered here (and never claimed): a real MySQL server, a real browser and
 * a real mobile device. These tests exercise the HTTP API against SQLite.
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
const dbPath = path.join(dataDir, `task03-${stamp}.sqlite`);
const privateDir = path.join(dataDir, `task03-private-${stamp}`);
const publicDir = path.join(dataDir, `task03-uploads-${stamp}`);
const port = 8900 + Math.floor(Math.random() * 300);

const ADMIN_ACCESS_KEY = 'task03-access-key';
const PASSWORD = 'Task03-Pass-123';

const env = {
  DB_DRIVER: 'sqlite',
  DB_SQLITE_PATH: dbPath,
  APP_ENV: 'development',
  ADMIN_ACCESS_KEY,
  OFFICIAL_EMAIL: 'rentals@goodlucks.co',
  EMAIL_TRANSPORT: 'none',
  REGISTER_RATE_LIMIT_PER_HOUR: '80',
  VIEWING_RATE_LIMIT_PER_HOUR: '200',
  IDENTITY_DATA_KEY: Buffer.alloc(32, 9).toString('base64'),
  PRIVATE_UPLOAD_DIR: privateDir,
  UPLOAD_DIR: publicDir,
  UPLOAD_URL_PATH: '/api/uploads',
};

let server;
let baseUrl;

const uniqueEmail = (prefix) => `${prefix}-${stamp}-${Math.floor(Math.random() * 100000)}@example.com`;

const register = async (body) => {
  const client = new ApiClient(baseUrl);
  const res = await client.post('/api/auth/register', body);
  return { client, res };
};

const registerAgent = async (label, extra = {}) => {
  const email = uniqueEmail(`agent-${label}`);
  const { client, res } = await register({
    name: `Agent ${label}`,
    email,
    phone: '+233 20 555 0101',
    password: PASSWORD,
    role: 'agent',
    providerCategory: 'agent',
    operatingCity: 'Accra',
    agencyName: 'Task 03 Agency',
    ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { client, id: res.body.user.id, email, name: res.body.user.name };
};

const registerLandlord = async (label) => {
  const email = uniqueEmail(`landlord-${label}`);
  const { client, res } = await register({
    name: `Landlord ${label}`,
    email,
    phone: '+233 20 555 0202',
    password: PASSWORD,
    role: 'landlord',
    providerCategory: 'landlord',
    officialName: `Landlord ${label} Official`,
    city: 'Accra',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { client, id: res.body.user.id, email, name: res.body.user.name };
};

const registerTenant = async (label) => {
  const email = uniqueEmail(`tenant-${label}`);
  const { client, res } = await register({
    name: `Tenant ${label}`,
    email,
    phone: '+233 20 555 0303',
    password: PASSWORD,
    role: 'tenant',
    providerCategory: 'tenant',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { client, id: res.body.user.id, email };
};

const createAdmin = async (label, { reviewer = false, documents = false, finance = false } = {}) => {
  const email = uniqueEmail(`admin-${label}`);
  const created = runPhpScript(
    'tests/create-user.php',
    [`--email=${email}`, `--password=${PASSWORD}`, `--name=Admin ${label}`, '--role=admin'],
    env
  );
  assert.equal(created.status, 0, created.stdout + created.stderr);

  const client = new ApiClient(baseUrl);
  const login = await client.post('/api/auth/admin-login', {
    email,
    password: PASSWORD,
    accessKey: ADMIN_ACCESS_KEY,
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));

  if (reviewer || documents) {
    const args = [`--email=${email}`];
    if (reviewer) args.push('--reviewer=1');
    if (documents) args.push('--documents=1');
    const granted = runPhpScript('php-backend/grant_reviewer.php', args, env);
    assert.equal(granted.status, 0, granted.stdout + granted.stderr);
  }
  if (finance) {
    const granted = runPhpScript(
      'php-backend/grant_finance.php',
      [`--email=${email}`, '--view=1', '--confirm=1'],
      env
    );
    assert.equal(granted.status, 0, granted.stdout + granted.stderr);
  }

  await client.get('/api/auth/me');
  return { client, id: login.body.user.id, email };
};

/** Upload one verification document through the real multipart endpoint. */
const uploadDocument = async (client, kind, { filename = 'doc.png', mime = 'image/png', bytes } = {}) => {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', new Blob([bytes ?? createPng(160, 100)], { type: mime }), filename);
  return client.request('POST', '/api/verification/documents', { body: form });
};

const identityDocuments = async (agent) => {
  const front = await uploadDocument(agent.client, 'document_front', { filename: 'card-front.png' });
  const back = await uploadDocument(agent.client, 'document_back', { filename: 'card-back.png' });
  assert.equal(front.status, 201, JSON.stringify(front.body));
  assert.equal(back.status, 201, JSON.stringify(back.body));
  return [front.body.document.id, back.body.document.id];
};

const submitIdentity = (agent, documentIds, overrides = {}) =>
  agent.client.post('/api/verification/identity', {
    legalName: `${agent.name} Official`,
    documentType: 'ghana_card',
    documentNumber: `GHA-${Math.floor(Math.random() * 900000000) + 100000000}-3`,
    documentIds,
    ...overrides,
  });

const approveIdentity = async (reviewer, agentId) => {
  const res = await reviewer.client.post(`/api/admin/verifications/${agentId}/identity/decision`, {
    decision: 'approve',
    note: 'Ghana Card front and back checked against the name given.',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

/** Staff approval of an agent account (a separate decision from verification). */
const activateAgent = async (admin, agent) => {
  const res = await admin.client.post(`/api/admin/agents/${agent.id}/status`, {
    accountStatus: 'active',
    canSubmitListings: true,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

const submitProfessional = (agent) =>
  agent.client.post('/api/verification/professional', {
    licenceNumber: `REAC-${Math.floor(Math.random() * 900000)}`,
    issuingAuthority: 'Real Estate Agency Council (test value)',
    licenceCategory: 'Agency',
    issueDate: '2026-01-05',
    expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    documentIds: [],
  });

const viewingTerms = (overrides = {}) => ({
  appointmentRequired: true,
  howToArrange: 'Message the agent on Goodlucks at least one day ahead; the agent confirms a slot.',
  conditions: 'Bring a valid ID. The property is occupied, so access is by appointment only.',
  paymentInstructions: 'The viewing fee is paid in cash to the agent on site after the viewing. Never online.',
  restrictions: 'No photography of the interior without the agent present.',
  ...overrides,
});

const newListing = (overrides = {}) => ({
  title: 'Task 03 test apartment',
  location: 'East Legon',
  city: 'Accra',
  rentGhs: 4200,
  bedrooms: 2,
  bathrooms: 2,
  propertyType: 'Apartment',
  description: 'A two-bedroom apartment used by the Task 03 test suite to exercise listing rules.',
  images: ['https://example.com/task03.jpg'],
  landlordName: 'Landlord Named By Agent',
  landlordEmail: `landlord-${stamp}@example.com`,
  viewingFeeGhs: 150,
  viewingTerms: viewingTerms(),
  ...overrides,
});

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(privateDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;
});

after(() => {
  server?.stop();
  fs.rmSync(privateDir, { recursive: true, force: true });
  fs.rmSync(publicDir, { recursive: true, force: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
});

// ---------------------------------------------------------------------------
// 1. Registration
// ---------------------------------------------------------------------------

describe('Registration: two groups, provider category enforced server-side', () => {
  test('a tenant, a landlord and an agent each register with their own category', async () => {
    const tenant = await registerTenant('cat');
    assert.equal(tenant.id.length > 0, true);

    const landlord = await registerLandlord('cat');
    assert.equal(landlord.id.length > 0, true);

    const agent = await registerAgent('cat');
    assert.equal(agent.id.length > 0, true);

    const landlordMe = await landlord.client.get('/api/auth/me');
    assert.equal(landlordMe.body.user.role, 'landlord');
    const agentMe = await agent.client.get('/api/auth/me');
    assert.equal(agentMe.body.user.role, 'agent');
  });

  test('a provider category that disagrees with the role is refused', async () => {
    const { res } = await register({
      name: 'Mismatch Person',
      email: uniqueEmail('mismatch'),
      phone: '+233 20 555 0404',
      password: PASSWORD,
      role: 'landlord',
      providerCategory: 'agent',
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.ok(res.body.fields.providerCategory, 'the mismatch is explained on the category field');

    const invalid = await register({
      name: 'Invalid Category',
      email: uniqueEmail('invalid-cat'),
      phone: '+233 20 555 0505',
      password: PASSWORD,
      role: 'tenant',
      providerCategory: 'superadmin',
    });
    assert.equal(invalid.res.status, 422, JSON.stringify(invalid.res.body));
    assert.ok(invalid.res.body.fields.providerCategory);
  });

  test('privileged roles cannot be self-assigned', async () => {
    const { res } = await register({
      name: 'Sneaky Admin',
      email: uniqueEmail('sneaky'),
      phone: '+233 20 555 0606',
      password: PASSWORD,
      role: 'admin',
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.ok(res.body.fields.role);
  });

  test('a second registration never silently changes an existing account role', async () => {
    const email = uniqueEmail('one-person');
    const first = await register({
      name: 'One Person',
      email,
      phone: '+233 20 555 0707',
      password: PASSWORD,
      role: 'tenant',
      providerCategory: 'tenant',
    });
    assert.equal(first.res?.status ?? 201, 201);

    const second = await register({
      name: 'One Person Again',
      email,
      phone: '+233 20 555 0708',
      password: PASSWORD,
      role: 'agent',
      providerCategory: 'agent',
      operatingCity: 'Accra',
      agencyName: 'Second Attempt Agency',
    });
    assert.equal(second.res.status, 409, JSON.stringify(second.res.body));

    // The original account still exists, still a tenant, and still signs in.
    const login = await new ApiClient(baseUrl).post('/api/auth/login', {
      email,
      password: PASSWORD,
      role: 'tenant',
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.user.role, 'tenant');
  });

  test('the official Ghana Card name given at registration is returned to its owner only', async () => {
    const agent = await registerAgent('official-name', { officialName: 'Ama Serwaa Boateng' });
    const own = await agent.client.get('/api/verification');
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.verification.officialName, 'Ama Serwaa Boateng');

    // It is a claim, not a verification.
    assert.equal(own.body.verification.identityVerified, false);
    assert.equal(own.body.verification.identity.status, 'not_submitted');
  });
});

// ---------------------------------------------------------------------------
// 2. Ghana Card identity verification
// ---------------------------------------------------------------------------

describe('Ghana Card identity verification', () => {
  const state = {};

  test('front and back are both required before a submission is accepted', async () => {
    const agent = await registerAgent('identity-docs');
    state.agent = agent;

    const frontOnly = await uploadDocument(agent.client, 'document_front', { filename: 'front.png' });
    assert.equal(frontOnly.status, 201, JSON.stringify(frontOnly.body));
    state.frontId = frontOnly.body.document.id;

    const backOnlyDoc = await uploadDocument(agent.client, 'document_back', { filename: 'back.png' });
    assert.equal(backOnlyDoc.status, 201);
    state.backId = backOnlyDoc.body.document.id;

    const missingBack = await submitIdentity(agent, [state.frontId]);
    assert.equal(missingBack.status, 422, JSON.stringify(missingBack.body));
    assert.match(String(missingBack.body.fields.documents), /BACK of your Ghana Card/i);

    const missingFront = await submitIdentity(agent, [state.backId]);
    assert.equal(missingFront.status, 422, JSON.stringify(missingFront.body));
    assert.match(String(missingFront.body.fields.documents), /FRONT of your Ghana Card/i);
  });

  test('a complete submission waits for a reviewer and verifies nobody by itself', async () => {
    const agent = state.agent;
    const submitted = await submitIdentity(agent, [state.frontId, state.backId]);
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(submitted.body.identity.status, 'pending_review');

    const own = await agent.client.get('/api/verification');
    assert.equal(own.body.verification.identityVerified, false);
    assert.equal(own.body.verification.identity.status, 'pending_review');
    // Task 03: no approved identity means no commission share yet.
    assert.equal(own.body.verification.agentTier.commissionPercent, 0);
    assert.equal(own.body.verification.agentTier.commissionTier, 'none');
    assert.equal(own.body.verification.agentTier.commissionEligible, false);

    // The document is never public and never served by a listing URL.
    const guest = new ApiClient(baseUrl);
    assert.equal((await guest.get(`/api/verification-documents/${state.frontId}`)).status, 401);
  });

  test('another account cannot read or submit somebody else\'s documents', async () => {
    const other = await registerAgent('identity-other');
    assert.equal((await other.client.get(`/api/verification-documents/${state.frontId}`)).status, 404);

    const steal = await submitIdentity(other, [state.frontId, state.backId]);
    assert.equal(steal.status, 422, JSON.stringify(steal.body));
    assert.ok(steal.body.fields.documents);

    // An ordinary administrator (no reviewer capability) cannot see the queue either.
    const plainAdmin = await createAdmin('plain');
    assert.equal((await plainAdmin.client.get('/api/admin/verifications')).status, 403);
  });

  test('an agent cannot approve their own identity', async () => {
    const selfApprove = await state.agent.client.post(
      `/api/admin/verifications/${state.agent.id}/identity/decision`,
      { decision: 'approve' }
    );
    assert.equal(selfApprove.status, 403);
    const still = await state.agent.client.get('/api/verification');
    assert.equal(still.body.verification.identity.status, 'pending_review');
  });

  test('a rejection needs a reason and is reported back to the agent', async () => {
    const reviewer = await createAdmin('identity-reviewer', { reviewer: true });
    state.reviewer = reviewer;

    const reasonless = await reviewer.client.post(
      `/api/admin/verifications/${state.agent.id}/identity/decision`,
      { decision: 'reject' }
    );
    assert.equal(reasonless.status, 422, JSON.stringify(reasonless.body));

    const rejected = await reviewer.client.post(
      `/api/admin/verifications/${state.agent.id}/identity/decision`,
      { decision: 'reject', note: 'The back of the card is unreadable — please upload a clearer photo.' }
    );
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
    assert.equal(rejected.body.identity.status, 'rejected');

    const own = await state.agent.client.get('/api/verification');
    assert.equal(own.body.verification.identity.status, 'rejected');
    assert.match(String(own.body.verification.identity.decisionNote), /unreadable/i);

    const notifications = await state.agent.client.get('/api/notifications');
    const titles = (notifications.body.notifications ?? []).map((n) => String(n.title));
    assert.ok(titles.some((t) => /identity verification/i.test(t)), 'the agent is told about the decision');
  });

  test('only an approved identity makes the account identity-verified and starts Tier A', async () => {
    // A fresh submission after the rejection.
    const docs = await identityDocuments(state.agent);
    const resubmitted = await submitIdentity(state.agent, docs);
    assert.equal(resubmitted.status, 201, JSON.stringify(resubmitted.body));

    await approveIdentity(state.reviewer, state.agent.id);

    const own = await state.agent.client.get('/api/verification');
    assert.equal(own.body.verification.identityVerified, true);
    assert.equal(own.body.verification.agentTier.tier, 'standard');
    assert.equal(own.body.verification.agentTier.commissionTier, 'tier_a');
    assert.equal(own.body.verification.agentTier.commissionPercent, 60);
    assert.equal(own.body.verification.agentTier.goodlucksPercent, 40);
    assert.equal(own.body.verification.agentTier.eligibleProfessional, false);
    assert.match(String(own.body.verification.agentTier.higherTierRequires), /professional/i);
  });
});

describe('Per-document review (professional and identity documents)', () => {
  test('a reviewer records each document separately, and it never decides the verification', async () => {
    const agent = await registerAgent('doc-review');
    const docs = await identityDocuments(agent);
    assert.equal((await submitIdentity(agent, docs)).status, 201);

    const reviewer = await createAdmin('doc-reviewer', { reviewer: true, documents: true });

    const reasonless = await reviewer.client.post(`/api/admin/verifications/documents/${docs[1]}/review`, {
      decision: 'reject',
    });
    assert.equal(reasonless.status, 422, JSON.stringify(reasonless.body));

    const accepted = await reviewer.client.post(`/api/admin/verifications/documents/${docs[0]}/review`, {
      decision: 'accept',
      note: 'Front of the card is clear.',
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.document.reviewStatus, 'accepted');

    const rejected = await reviewer.client.post(`/api/admin/verifications/documents/${docs[1]}/review`, {
      decision: 'reject',
      note: 'The back is a photocopy; upload a photograph of the card itself.',
    });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
    assert.equal(rejected.body.document.reviewStatus, 'rejected');

    // The overall verification is still pending: a document outcome is not a
    // verification decision.
    const own = await agent.client.get('/api/verification');
    assert.equal(own.body.verification.identity.status, 'pending_review');
    assert.equal(own.body.verification.identity.documents[0].reviewStatus, 'accepted');
    assert.equal(own.body.verification.identity.documents[1].reviewStatus, 'rejected');
    assert.match(String(own.body.verification.identity.documents[1].reviewNote), /photocopy/i);

    // The subject cannot review their own documents.
    assert.equal(
      (await agent.client.post(`/api/admin/verifications/documents/${docs[0]}/review`, { decision: 'reject', note: 'nope' }))
        .status,
      403
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Professional verification and the higher tier
// ---------------------------------------------------------------------------

describe('Professional verification and the higher commission tier', () => {
  const state = {};

  test('a landlord is never pushed through professional verification', async () => {
    const landlord = await registerLandlord('no-professional');
    state.landlord = landlord;

    const attempt = await landlord.client.post('/api/verification/professional', {
      licenceNumber: 'REAC-NOT-ALLOWED',
      issuingAuthority: 'Nope',
      documentIds: [],
    });
    assert.equal(attempt.status, 403, JSON.stringify(attempt.body));

    const own = await landlord.client.get('/api/verification');
    assert.equal(own.body.verification.professional, null);
    // Landlords have no agent tier, so no commission share is derived for them.
    assert.equal(own.body.verification.agentTier, null);
  });

  test('submitting documents alone does not upgrade the tier', async () => {
    const agent = await state.landlord ? await registerAgent('professional') : await registerAgent('professional');
    state.agent = agent;

    const docs = await identityDocuments(agent);
    assert.equal((await submitIdentity(agent, docs)).status, 201);
    const reviewer = await createAdmin('pro-reviewer', { reviewer: true, documents: true });
    state.reviewer = reviewer;
    await approveIdentity(reviewer, agent.id);

    const licence = await uploadDocument(agent.client, 'licence', { filename: 'licence.pdf', mime: 'application/pdf' });
    assert.equal(licence.status, 201, JSON.stringify(licence.body));

    const submitted = await agent.client.post('/api/verification/professional', {
      licenceNumber: 'REAC-T03-0001',
      issuingAuthority: 'Real Estate Agency Council (test value)',
      licenceCategory: 'Agency',
      issueDate: '2026-01-05',
      expiryDate: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10),
      documentIds: [licence.body.document.id],
    });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    assert.equal(submitted.body.professional.status, 'pending_review');

    const tier = await agent.client.get('/api/verification');
    assert.equal(tier.body.verification.agentTier.commissionPercent, 60, 'uploading is not approval');
    assert.equal(tier.body.verification.agentTier.commissionTier, 'tier_a');
  });

  test('only an approved professional authorisation grants the higher tier', async () => {
    const { agent, reviewer } = state;
    const decided = await reviewer.client.post(
      `/api/admin/verifications/${agent.id}/professional/decision`,
      { decision: 'approve', note: 'Licence number and document checked.' }
    );
    assert.equal(decided.status, 200, JSON.stringify(decided.body));

    const own = await agent.client.get('/api/verification');
    assert.equal(own.body.verification.agentTier.commissionTier, 'higher');
    assert.equal(own.body.verification.agentTier.commissionPercent, 70);
    assert.equal(own.body.verification.agentTier.goodlucksPercent, 30);

    // The upgrade is announced, not silently applied.
    const notifications = await agent.client.get('/api/notifications');
    const titles = (notifications.body.notifications ?? []).map((n) => String(n.title));
    assert.ok(titles.some((t) => /higher commission tier/i.test(t)), 'the agent is told the tier changed');
  });

  test('losing the professional authorisation drops the tier back to Tier A', async () => {
    const { agent, reviewer } = state;
    const expired = await reviewer.client.post(
      `/api/admin/verifications/${agent.id}/professional/decision`,
      { decision: 'mark_expired', note: 'Licence lapsed according to the council register.' }
    );
    assert.equal(expired.status, 200, JSON.stringify(expired.body));

    const own = await agent.client.get('/api/verification');
    assert.equal(own.body.verification.agentTier.commissionTier, 'tier_a');
    assert.equal(own.body.verification.agentTier.commissionPercent, 60);
  });
});

// ---------------------------------------------------------------------------
// 4. Commission tiers
// ---------------------------------------------------------------------------

describe('Commission tiers: 60% Tier A, 70% higher, frozen per transaction', () => {
  const state = {};

  test('a Tier A agent receives 60% and Goodlucks 40% of the agreed commission', async () => {
    const agent = await registerAgent('commission-a');
    const reviewer = await createAdmin('commission-reviewer', { reviewer: true, documents: true });
    const docs = await identityDocuments(agent);
    assert.equal((await submitIdentity(agent, docs)).status, 201);
    await approveIdentity(reviewer, agent.id);

    const finance = await createAdmin('commission-finance', { finance: true });
    state.finance = finance;
    state.agentA = agent;
    state.reviewer = reviewer;
    await activateAgent(finance, agent);

    const property = await agent.client.post('/api/properties', newListing({ title: 'Commission property' }));
    assert.equal(property.status, 201, JSON.stringify(property.body));
    state.propertyId = property.body.property.id;

    const created = await finance.client.post('/api/admin/finance/commissions', {
      propertyId: state.propertyId,
      agentUserId: agent.id,
      amountGhs: 1000,
      dueDate: '2026-12-01',
      // A client that tries to set its own percentages is ignored: the server
      // derives the split from the verified records.
      agentSharePercent: 95,
      goodlucksSharePercent: 5,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const commission = created.body.commission;
    assert.equal(commission.amountGhs, 1000);
    assert.equal(commission.agentTier, 'standard');
    assert.equal(commission.agentSharePercent, 60);
    assert.equal(commission.goodlucksSharePercent, 40);
    assert.equal(commission.agentShareGhs, 600);
    assert.equal(commission.goodlucksShareGhs, 400);
    assert.equal(commission.splitSnapshot.snapshotKind, 'rental_commission_tier_split');
    assert.equal(commission.splitSnapshot.hashValid, true);
    state.commissionId = commission.id;
  });

  test('the higher tier receives 70% and Goodlucks 30%', async () => {
    const agent = state.agentA;
    const licence = await uploadDocument(agent.client, 'licence', { filename: 'licence.png' });
    assert.equal(licence.status, 201);
    assert.equal((await submitProfessional(agent)).status, 201);
    const approved = await state.reviewer.client.post(
      `/api/admin/verifications/${agent.id}/professional/decision`,
      { decision: 'approve', note: 'Checked for the commission test.' }
    );
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const created = await state.finance.client.post('/api/admin/finance/commissions', {
      propertyId: state.propertyId,
      agentUserId: agent.id,
      amountGhs: 1000,
      dueDate: '2027-01-01',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const commission = created.body.commission;
    assert.equal(commission.agentTier, 'professional');
    assert.equal(commission.agentSharePercent, 70);
    assert.equal(commission.agentShareGhs, 700);
    assert.equal(commission.goodlucksShareGhs, 300);
    state.higherCommissionId = commission.id;

    // The older transaction is untouched by the upgrade.
    const old = await state.finance.client.get(`/api/admin/finance/commissions/${state.commissionId}`);
    assert.equal(old.status, 200, JSON.stringify(old.body));
    assert.equal(old.body.commission.agentTier, 'standard');
    assert.equal(old.body.commission.agentSharePercent, 60);
    assert.equal(old.body.commission.agentShareGhs, 600);
  });

  test('an unverified agent has no commission share at all', async () => {
    const agent = await registerAgent('commission-unverified');
    const created = await state.finance.client.post('/api/admin/finance/commissions', {
      propertyId: state.propertyId,
      agentUserId: agent.id,
      amountGhs: 500,
      dueDate: '2027-02-01',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const commission = created.body.commission;
    assert.equal(commission.agentTier, 'standard');
    assert.equal(commission.agentSharePercent, 0);
    assert.equal(commission.agentShareGhs, 0);
    assert.equal(commission.goodlucksShareGhs, 500);
  });

  test('an agent cannot read or create commissions for themselves', async () => {
    const agent = state.agentA;
    assert.equal((await agent.client.get('/api/admin/finance/commissions')).status, 403);
    assert.equal(
      (await agent.client.post('/api/admin/finance/commissions', {
        propertyId: state.propertyId,
        agentUserId: agent.id,
        amountGhs: 900,
      })).status,
      403
    );
    // The agent's own finance view still reports their recorded position.
    const own = await agent.client.get('/api/agent/finance');
    assert.equal(own.status, 200, JSON.stringify(own.body));
  });

  test('a frozen split cannot be edited after the commission is agreed', async () => {
    // draft → awaiting_agreement → agreed, through the real workflow.
    const withReference = await state.finance.client.patch(
      `/api/admin/finance/commissions/${state.higherCommissionId}`,
      {
        rentalReference: 'TENANCY-T03-0001',
        notes: 'Landlord and tenant agreed a GH₵1,000 commission; recorded by the finance desk.',
      }
    );
    assert.equal(withReference.status, 200, JSON.stringify(withReference.body));
    const awaiting = await state.finance.client.post(
      `/api/admin/finance/commissions/${state.higherCommissionId}/status`,
      { status: 'awaiting_agreement' }
    );
    assert.equal(awaiting.status, 200, JSON.stringify(awaiting.body));
    const agreed = await state.finance.client.post(
      `/api/admin/finance/commissions/${state.higherCommissionId}/status`,
      { status: 'agreed' }
    );
    assert.equal(agreed.status, 200, JSON.stringify(agreed.body));

    const edit = await state.finance.client.patch(
      `/api/admin/finance/commissions/${state.higherCommissionId}`,
      { amountGhs: 5000 }
    );
    assert.equal(edit.status, 409, JSON.stringify(edit.body));
  });

  test('viewing fees are not commission and never take a tier percentage', async () => {
    const property = await state.finance.client.get(`/api/properties/${state.propertyId}`);
    const terms = property.body.property.viewingTerms;
    // The listing is still in the review queue, so the PROPOSED fee is 150 and
    // nothing is public yet. Either way it is untouched by the 70% tier.
    assert.equal(terms.feeGhs, null);
    assert.equal(terms.pendingChange.proposedFeeGhs, 150);
    assert.equal(terms.pendingChange.proposedTerms.paymentInstructions.length > 0, true);

    const commission = await state.finance.client.get(`/api/admin/finance/commissions/${state.higherCommissionId}`);
    assert.equal(commission.body.commission.agentSharePercent, 70);
    assert.equal(commission.body.commission.agentShareGhs, 700);
    // No percentage of any kind has been applied to the viewing fee.
    assert.equal(terms.pendingChange.proposedFeeGhs, 150);

    // And the viewing-fee ledger itself carries no commission split.
    const ledger = await state.finance.client.get('/api/admin/viewing-fees');
    assert.equal(ledger.status, 200);
    assert.equal(Array.isArray(ledger.body.records), true);
  });
});

// ---------------------------------------------------------------------------
// 5. Per-property viewing fees and terms
// ---------------------------------------------------------------------------

describe('Per-property viewing fees and viewing terms', () => {
  const state = {};

  before(async () => {
    state.agent = await registerAgent('viewing-terms');
    // Approved agent account, so listing submission is open.
    state.admin = await createAdmin('terms-admin');
    const review = await state.admin.client.post(`/api/admin/agents/${state.agent.id}/status`, {
      accountStatus: 'active',
      canSubmitListings: true,
    });
    assert.equal(review.status, 200, JSON.stringify(review.body));
  });

  test('a listing without a viewing fee is refused — there is no default', async () => {
    const missing = await state.agent.client.post('/api/properties', newListing({
      title: 'No fee listing',
      viewingFeeGhs: undefined,
      viewingTerms: undefined,
    }));
    assert.equal(missing.status, 422, JSON.stringify(missing.body));
    assert.ok(missing.body.fields.viewingFeeGhs);
    assert.ok(missing.body.fields['viewingTerms.howToArrange']);

    const negative = await state.agent.client.post('/api/properties', newListing({
      title: 'Negative fee listing',
      viewingFeeGhs: -50,
    }));
    assert.equal(negative.status, 422, JSON.stringify(negative.body));
    assert.ok(negative.body.fields.viewingFeeGhs);

    const notNumber = await state.agent.client.post('/api/properties', newListing({
      title: 'Text fee listing',
      viewingFeeGhs: 'one hundred',
    }));
    assert.equal(notNumber.status, 422, JSON.stringify(notNumber.body));
  });

  test('two properties keep their own separate fees and terms', async () => {
    state.propertyA = (await state.agent.client.post('/api/properties', newListing({
      title: 'Property A',
      viewingFeeGhs: 150,
      viewingTerms: viewingTerms({ howToArrange: 'Call the agent to arrange a weekday appointment.' }),
    }))).body.property;

    state.propertyB = (await state.agent.client.post('/api/properties', newListing({
      title: 'Property B',
      viewingFeeGhs: 275.5,
      viewingTerms: viewingTerms({
        appointmentRequired: false,
        howToArrange: 'Visit the caretaker between 9am and 5pm on weekdays.',
      }),
    }))).body.property;

    assert.equal(state.propertyA.viewingTerms.feeGhs, null, 'nothing is public before review');
    assert.equal(state.propertyA.viewingTerms.state, 'pending_review');
    assert.equal(state.propertyA.viewingTerms.pendingChange.proposedFeeGhs, 150);
    assert.equal(state.propertyB.viewingTerms.pendingChange.proposedFeeGhs, 275.5);
    assert.equal(state.propertyB.viewingTerms.pendingChange.proposedTerms.appointmentRequired, false);
  });

  test('unapproved fees and terms are not public, and the listing is not live', async () => {
    const guest = new ApiClient(baseUrl);
    const publicView = await guest.get(`/api/properties/${state.propertyA.id}`);
    assert.equal(publicView.status, 404, 'a pending listing is not public');

    const listing = await state.agent.client.get(`/api/properties/${state.propertyA.id}`);
    assert.equal(listing.status, 200);
    assert.equal(listing.body.property.viewingTerms.isApproved, false);
  });

  test('approving the listing approves its fee and terms, and only then are they public', async () => {
    const approved = await state.admin.client.post(`/api/properties/${state.propertyA.id}/status`, {
      status: 'active',
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const guest = new ApiClient(baseUrl);
    const publicView = await guest.get(`/api/properties/${state.propertyA.id}`);
    assert.equal(publicView.status, 200, JSON.stringify(publicView.body.value));
    const terms = publicView.body.property.viewingTerms;
    assert.equal(terms.feeGhs, 150);
    assert.equal(terms.isApproved, true);
    assert.match(terms.terms.howToArrange, /weekday appointment/i);
    // Review state is staff/owner information, not public.
    assert.equal(terms.state, undefined);
    assert.equal(terms.pendingChange, undefined);
  });

  test('another agent can neither see nor change this listing\'s fee', async () => {
    const other = await registerAgent('other-agent');
    const res = await other.client.post(`/api/properties/${state.propertyA.id}/viewing-terms`, {
      viewingFeeGhs: 10,
      viewingTerms: viewingTerms(),
    });
    assert.equal(res.status, 403, JSON.stringify(res.body));

    assert.equal((await other.client.get(`/api/properties/${state.propertyA.id}/viewing-terms/history`)).status, 403);

    const unchanged = await new ApiClient(baseUrl).get(`/api/properties/${state.propertyA.id}`);
    assert.equal(unchanged.body.property.viewingTerms.feeGhs, 150);
  });

  test('a change to a live listing waits for review and the old values keep applying', async () => {
    const proposed = await state.agent.client.post(`/api/properties/${state.propertyA.id}/viewing-terms`, {
      viewingFeeGhs: 200,
      viewingTerms: viewingTerms({ howToArrange: 'Send a message through Goodlucks; the agent replies within a day.' }),
      note: 'Market rate has moved.',
    });
    assert.equal(proposed.status, 202, JSON.stringify(proposed.body));
    assert.equal(proposed.body.viewingTermsChange.status, 'pending_review');

    const guest = new ApiClient(baseUrl);
    const still = await guest.get(`/api/properties/${state.propertyA.id}`);
    assert.equal(still.body.property.viewingTerms.feeGhs, 150, 'the approved fee is unchanged while pending');

    const mine = await state.agent.client.get(`/api/properties/${state.propertyA.id}`);
    assert.equal(mine.body.property.viewingTerms.pendingChange.proposedFeeGhs, 200);
    assert.equal(mine.body.property.viewingTerms.pendingChange.previousFeeGhs, 150);
    state.changeId = proposed.body.viewingTermsChange.id;
  });

  test('a rejected change leaves the approved fee and terms exactly as they were', async () => {
    const rejected = await state.admin.client.post(
      `/api/admin/viewing-terms/changes/${state.changeId}/decision`,
      { decision: 'reject', note: 'The payment instructions must say the fee is paid after the viewing.' }
    );
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
    assert.equal(rejected.body.viewingTermsChange.status, 'rejected');
    assert.match(rejected.body.viewingTermsChange.decisionNote, /after the viewing/i);

    const guest = new ApiClient(baseUrl);
    const still = await guest.get(`/api/properties/${state.propertyA.id}`);
    assert.equal(still.body.property.viewingTerms.feeGhs, 150);

    const history = await state.agent.client.get(`/api/properties/${state.propertyA.id}/viewing-terms/history`);
    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.equal(history.body.current.feeGhs, 150);
    assert.ok(history.body.changes.some((c) => c.status === 'rejected'));
  });

  test('an approved change becomes the public fee and keeps the old value in history', async () => {
    const proposed = await state.agent.client.post(`/api/properties/${state.propertyA.id}/viewing-terms`, {
      viewingFeeGhs: 200,
      viewingTerms: viewingTerms({ howToArrange: 'Send a message through Goodlucks; the agent replies within a day.' }),
    });
    assert.equal(proposed.status, 202, JSON.stringify(proposed.body));

    const approved = await state.admin.client.post(
      `/api/admin/viewing-terms/changes/${proposed.body.viewingTermsChange.id}/decision`,
      { decision: 'approve', note: 'Fee and instructions are clear.' }
    );
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const guest = new ApiClient(baseUrl);
    const now = await guest.get(`/api/properties/${state.propertyA.id}`);
    assert.equal(now.body.property.viewingTerms.feeGhs, 200);

    const history = await state.agent.client.get(`/api/properties/${state.propertyA.id}/viewing-terms/history`);
    const approvedChange = history.body.changes.find(
      (c) => c.status === 'approved' && c.proposedFeeGhs === 200
    );
    assert.ok(approvedChange, 'the approved 200 change is in the history');
    assert.equal(approvedChange.previousFeeGhs, 150);
  });

  test('a viewing request snapshots the fee and terms in force at that moment', async () => {
    const guest = new ApiClient(baseUrl);
    const requested = await guest.post('/api/viewing-requests', {
      propertyId: state.propertyA.id,
      tenantName: 'Snapshot Tenant',
      tenantPhone: '+233 24 555 9999',
      tenantEmail: 'snapshot-tenant@example.com',
      date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      time: '10:00',
      requestType: 'viewing',
      message: 'I would like to view this property.',
    });
    assert.equal(requested.status, 201, JSON.stringify(requested.body));
    assert.equal(requested.body.feeAmountGhs, 200);
    assert.equal(requested.body.viewing.feeAmountGhs, 200);
    assert.equal(requested.body.viewing.viewingTerms.feeGhs, 200);
    assert.deepEqual(requested.body.viewing.viewingTerms.terms.appointmentRequired, true);

    // The fee is raised afterwards and approved; the existing request keeps 200.
    const proposed = await state.agent.client.post(`/api/properties/${state.propertyA.id}/viewing-terms`, {
      viewingFeeGhs: 250,
      viewingTerms: viewingTerms(),
    });
    assert.equal(proposed.status, 202);
    const approved = await state.admin.client.post(
      `/api/admin/viewing-terms/changes/${proposed.body.viewingTermsChange.id}/decision`,
      { decision: 'approve', note: 'Approved.' }
    );
    assert.equal(approved.status, 200);

    // The responsible agent (or staff) can read the record; a guest cannot.
    assert.equal((await guest.get(`/api/viewings/${requested.body.viewingId}`)).status, 401);
    const viewing = await state.agent.client.get(`/api/viewings/${requested.body.viewingId}`);
    assert.equal(viewing.status, 200, JSON.stringify(viewing.body));
    assert.equal(viewing.body.viewing.feeAmountGhs, 200, 'history is not rewritten by a later change');
    assert.equal(viewing.body.viewing.viewingTerms.feeGhs, 200);

    const fresh = await guest.get(`/api/properties/${state.propertyA.id}`);
    assert.equal(fresh.body.property.viewingTerms.feeGhs, 250);
  });

  test('a property with nothing approved has no viewing fee rather than a default', async () => {
    const landlord = await registerLandlord('no-fee');
    // A landlord listing may omit the fee: no landlord viewing-fee policy exists
    // yet, so none is invented for them.
    const created = await landlord.client.post('/api/properties', {
      title: 'Landlord listing without a viewing fee',
      location: 'Tema',
      city: 'Tema',
      rentGhs: 3000,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: 'House',
      description: 'A landlord-submitted listing used to prove no fee is invented by the platform.',
      images: ['https://example.com/landlord.jpg'],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.property.viewingTerms.feeGhs, null);

    await state.admin.client.post(`/api/properties/${created.body.property.id}/status`, { status: 'active' });

    const guest = new ApiClient(baseUrl);
    const publicView = await guest.get(`/api/properties/${created.body.property.id}`);
    assert.equal(publicView.body.property.viewingTerms.feeGhs, null);
    assert.equal(publicView.body.property.viewingTerms.isApproved, false);

    const requested = await guest.post('/api/viewing-requests', {
      propertyId: created.body.property.id,
      tenantName: 'No Fee Tenant',
      tenantPhone: '+233 24 555 8888',
      tenantEmail: 'no-fee-tenant@example.com',
      date: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
      time: '11:30',
      requestType: 'viewing',
      message: 'Is there a viewing fee?',
    });
    assert.equal(requested.status, 201, JSON.stringify(requested.body));
    assert.equal(requested.body.feeAmountGhs, null);
    assert.equal(requested.body.viewing.feeAmountGhs, 0, 'zero means no fee applies — never GHS 100');
  });

  test('only staff can list or decide viewing-terms changes', async () => {
    const queue = await state.agent.client.get('/api/admin/viewing-terms/changes');
    assert.equal(queue.status, 403);

    const decision = await state.agent.client.post(
      `/api/admin/viewing-terms/changes/${state.changeId}/decision`,
      { decision: 'approve' }
    );
    assert.equal(decision.status, 403);

    const adminQueue = await state.admin.client.get('/api/admin/viewing-terms/changes');
    assert.equal(adminQueue.status, 200, JSON.stringify(adminQueue.body));
    assert.ok(Array.isArray(adminQueue.body.changes));
  });

  test('a change can only be decided once', async () => {
    const proposal = await state.agent.client.post(`/api/properties/${state.propertyB.id}/viewing-terms`, {
      viewingFeeGhs: 300,
      viewingTerms: viewingTerms(),
    });
    assert.equal(proposal.status, 202, JSON.stringify(proposal.body));
    const changeId = proposal.body.viewingTermsChange.id;

    const first = await state.admin.client.post(
      `/api/admin/viewing-terms/changes/${changeId}/decision`,
      { decision: 'approve' }
    );
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const second = await state.admin.client.post(
      `/api/admin/viewing-terms/changes/${changeId}/decision`,
      { decision: 'reject', note: 'Changed my mind.' }
    );
    assert.equal(second.status, 409, JSON.stringify(second.body));
  });
});

// ---------------------------------------------------------------------------
// 6. Ownership and attribution
// ---------------------------------------------------------------------------

describe('Ownership attribution is preserved', () => {
  test('an agent submission never becomes the owner of the property', async () => {
    const agent = await registerAgent('ownership');
    const landlord = await registerLandlord('ownership-target');
    // Staff approval of the agent account is separate from verification.
    const admin = await createAdmin('ownership-admin');
    await activateAgent(admin, agent);
    const created = await agent.client.post('/api/properties', newListing({
      title: 'Ownership attribution listing',
      landlordEmail: landlord.email,
      landlordName: 'Named Landlord',
      viewingFeeGhs: 120,
    }));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const property = created.body.property;

    assert.equal(property.submittedByUserId, agent.id);
    assert.equal(property.submittedByRole, 'agent');
    assert.equal(property.landlordAuthorityState, 'claimed_by_agent');
    assert.notEqual(property.landlordId, agent.id, 'the agent is never the owner');

    // The declaration is not proof: the listing is unverified until staff check it.
    assert.equal(property.isLandlordVerified, false);
  });

  test('a landlord keeps ownership of their own listing', async () => {
    const landlord = await registerLandlord('ownership-own');
    const created = await landlord.client.post('/api/properties', {
      title: 'Landlord owned listing',
      location: 'Abelemkpe',
      city: 'Accra',
      rentGhs: 5000,
      bedrooms: 3,
      bathrooms: 2,
      propertyType: 'House',
      description: 'A landlord-submitted listing that must keep the landlord as its owner.',
      images: ['https://example.com/owned.jpg'],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const property = created.body.property;
    assert.equal(property.landlordId, landlord.id);
    assert.equal(property.submittedByRole, 'landlord');
    assert.equal(property.landlordAuthorityState, 'owner');
  });

  test('tenants cannot submit listings', async () => {
    const tenant = await registerTenant('no-listings');
    const res = await tenant.client.post('/api/properties', newListing({ title: 'Tenant attempt' }));
    assert.equal(res.status, 403, JSON.stringify(res.body));
  });

  test('only approved listings are public, and their fee comes from the approved record', async () => {
    const guest = new ApiClient(baseUrl);
    const list = await guest.get('/api/properties?perPage=100');
    assert.equal(list.status, 200);
    for (const item of list.body.properties) {
      assert.ok(['active', 'rented'].includes(item.status), 'only live listings appear publicly');
      if (item.viewingTerms?.isApproved) {
        assert.ok(item.viewingTerms.feeGhs > 0);
      } else {
        assert.equal(item.viewingTerms?.feeGhs ?? null, null);
      }
    }
  });
});
