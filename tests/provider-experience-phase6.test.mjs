/**
 * Upgrade 2 — Phase 6: the provider experience (C1–C8, E2).
 *
 * The parts of this suite that need a backend run against the real PHP server on
 * SQLite, exactly like the other API suites. The parts that are about what the
 * screens say are static checks over the source, because there is no browser in
 * this environment — and a check of the source is honest about what it proves.
 *
 * What is asserted here:
 *   C3  one image widget, used by both listing paths, with device uploads
 *   C4  video: three providers accepted, everything else refused
 *   C5  amenities normalised to canonical keys, unknown words preserved
 *   C6  provider commission visible to the provider, absent for a tenant,
 *       and never presented as a Goodlucks fee
 *   C7  a save notifies the responsible provider, once per day, with no tenant
 *       identity anywhere in the message
 *   C8  verification decisions email the account holder with the reason
 *   E2  classification is corrected only by staff, only with a reason, never
 *       for an administrator
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
const dbPath = path.join(dataDir, `phase6-${process.pid}-${Date.now()}.sqlite`);
const port = 8900 + Math.floor(Math.random() * 400);
const ADMIN_EMAIL = 'admin@phase6.local';
const ADMIN_PASSWORD = 'Admin-Test-Password-123';
const ADMIN_ACCESS_KEY = 'phase6-access-key';
const PASSWORD = 'Member-Test-Password-123';

const read = (relative) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

const VIEWING_TERMS = {
  appointmentRequired: true,
  howToArrange: 'Contact the agent through Goodlucks to agree a slot.',
  conditions: 'Bring a valid ID.',
  paymentInstructions: 'The viewing fee is paid in cash to the agent on site.',
  restrictions: 'No interior photography without the agent present.',
};

let server;
let baseUrl;
let admin;
const created = {};
const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;

const register = async (body) => {
  const client = new ApiClient(baseUrl);
  const res = await client.post('/api/auth/register', body);
  return { client, res };
};

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });

  const env = {
    DB_DRIVER: 'sqlite',
    DB_SQLITE_PATH: dbPath,
    APP_ENV: 'development',
    ADMIN_ACCESS_KEY,
    OFFICIAL_EMAIL: 'rentals@goodlucks.co',
    EMAIL_TRANSPORT: 'none',
    REGISTER_RATE_LIMIT_PER_HOUR: '60',
    TENANT_REQUEST_RATE_LIMIT_PER_HOUR: '200',
    VIEWING_RATE_LIMIT_PER_HOUR: '200',
    PRESIGNED_TOKEN_KEY: Buffer.alloc(32, 3).toString('base64'),
    PRIVATE_UPLOAD_DIR: path.join(dataDir, `phase6-private-${process.pid}-${Date.now()}`),
  };
  fs.mkdirSync(env.PRIVATE_UPLOAD_DIR, { recursive: true });

  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Phase 6 Admin'],
    env
  );
  assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);

  // E2's correction control is a user-directory capability (Phase 3), granted
  // only from the console — never over HTTP. Grant it to this run's admin.
  const grant = runPhpScript('php-backend/grant_directory.php', [`--email=${ADMIN_EMAIL}`, '--users=1', '--activity=1'], env);
  assert.equal(grant.status, 0, grant.stdout + grant.stderr);

  admin = new ApiClient(baseUrl);
  const login = await admin.post('/api/auth/admin-login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    accessKey: ADMIN_ACCESS_KEY,
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));

  const agent = await register({
    name: 'Phase 6 Agent',
    email: uniqueEmail('phase6-agent'),
    phone: '+233 20 555 0601',
    password: PASSWORD,
    role: 'agent',
    providerCategory: 'agent',
    operatingCity: 'Accra',
    agencyName: 'Phase 6 Agency',
  });
  assert.equal(agent.res.status, 201, JSON.stringify(agent.res.body));
  created.agent = agent.client;
  created.agentId = agent.res.body.user.id;

  // An agent may only list once staff have approved the account (Increment F).
  const approvedAgent = await admin.post(`/api/admin/agents/${created.agentId}/status`, {
    accountStatus: 'active',
    canSubmitListings: true,
  });
  assert.equal(approvedAgent.status, 200, JSON.stringify(approvedAgent.body));

  const tenant = await register({
    name: 'Phase 6 Tenant',
    email: uniqueEmail('phase6-tenant'),
    phone: '+233 20 555 0602',
    password: PASSWORD,
    role: 'tenant',
  });
  assert.equal(tenant.res.status, 201, JSON.stringify(tenant.res.body));
  created.tenant = tenant.client;
  created.tenantEmail = tenant.res.body.user.email;

  const tenant2 = await register({
    name: 'Phase 6 Second Tenant',
    email: uniqueEmail('phase6-tenant-two'),
    phone: '+233 20 555 0603',
    password: PASSWORD,
    role: 'tenant',
  });
  assert.equal(tenant2.res.status, 201, JSON.stringify(tenant2.res.body));
  created.tenant2 = tenant2.client;

  const landlord = await register({
    name: 'Phase 6 Landlord',
    email: uniqueEmail('phase6-landlord'),
    phone: '+233 20 555 0604',
    password: PASSWORD,
    role: 'landlord',
    providerCategory: 'landlord',
    city: 'Accra',
  });
  assert.equal(landlord.res.status, 201, JSON.stringify(landlord.res.body));
  created.landlord = landlord.client;
  created.landlordId = landlord.res.body.user.id;
});

after(() => {
  server?.stop();
});

// ---------------------------------------------------------------------------
describe('C4/C5/C6 — the listing payload carries real facts', () => {
  test('a listing keeps toilets, kitchens, furnishing and canonical amenity keys', async () => {
    const res = await created.agent.post('/api/properties', {
      title: 'Phase 6 amenities listing',
      location: 'East Legon, Accra',
      city: 'Accra',
      rentGhs: 6400,
      bedrooms: 3,
      bathrooms: 2,
      propertyType: 'Semi-detached',
      description: 'A listing that exercises the Upgrade 2 listing facts.',
      images: ['https://example.com/front.jpg'],
      toilets: 3,
      kitchens: 1,
      furnishing: 'semi_furnished',
      amenities: ['Swimming pool', 'Backup power', 'Gated community'],
      amenitiesNote: 'Rooftop terrace is shared with the adjoining unit.',
      viewingFeeGhs: 120,
      viewingTerms: VIEWING_TERMS,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const property = res.body.property;
    created.propertyId = property.id;

    assert.equal(property.toilets, 3);
    assert.equal(property.kitchens, 1);
    assert.equal(property.furnishing, 'semi_furnished');
    assert.match(property.furnishingLabel, /furnished/i);

    // Canonical keys, not the words the form happened to send.
    for (const key of property.amenities) {
      assert.match(key, /^[a-z0-9_]+$/, `amenity "${key}" must be a canonical key`);
    }
    assert.equal(property.amenities.length, 3);
    assert.equal(property.amenityLabels.length, 3);
    assert.match(property.amenitiesNote, /Rooftop terrace/);

    // C1 still holds on the same listing.
    assert.equal(property.landlordId, '');
    assert.equal(property.submittedByRole, 'agent');
  });

  test('an amenity the platform does not know is kept word for word, not dropped', async () => {
    const res = await created.agent.post('/api/properties', {
      title: 'Phase 6 unusual amenity',
      location: 'Tema, Accra',
      city: 'Accra',
      rentGhs: 3100,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: 'Apartment',
      description: 'A listing with an amenity outside the standard list.',
      images: ['https://example.com/tema.jpg'],
      amenities: ['Swimming pool', 'Private rooftop aviary'],
      viewingFeeGhs: 90,
      viewingTerms: VIEWING_TERMS,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const property = await admin.get(`/api/properties/${res.body.property.id}`);
    assert.equal(property.status, 200, JSON.stringify(property.body));
    const shaped = property.body.property;
    assert.deepEqual(shaped.amenities, ['pool']);
    assert.match(shaped.amenitiesNote, /Private rooftop aviary/);
  });

  test('a YouTube, TikTok or Facebook link becomes an embed; anything else is refused', async () => {
    const accepted = [
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
      ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
      ['https://www.tiktok.com/@goodlucks/video/7234567890123456789', 'tiktok'],
      ['https://www.facebook.com/goodlucks/videos/123456789012345', 'facebook'],
    ];
    for (const [url, provider] of accepted) {
      const res = await created.agent.post('/api/properties', {
        title: `Phase 6 video ${provider}`,
        location: 'Cantonments, Accra',
        city: 'Accra',
        rentGhs: 7200,
        bedrooms: 3,
        bathrooms: 2,
        propertyType: 'Apartment',
        description: 'A listing with a walkthrough video.',
        images: ['https://example.com/video.jpg'],
        videoUrl: url,
        viewingFeeGhs: 150,
        viewingTerms: VIEWING_TERMS,
      });
      assert.equal(res.status, 201, `${url} -> ${JSON.stringify(res.body)}`);
      const property = await admin.get(`/api/properties/${res.body.property.id}`);
      const shaped = property.body.property;
      assert.equal(shaped.videoProvider, provider, url);
      assert.equal(shaped.video.provider, provider);
      assert.match(shaped.video.embedUrl, /^https:\/\//);
      assert.notEqual(shaped.video.embedUrl, url, 'an embed URL is built, not the raw link');
      if (provider === 'youtube') assert.match(shaped.video.embedUrl, /youtube-nocookie\.com\/embed\//);
    }

    const refused = [
      'https://vm.tiktok.com/ZMabcdefg/',
      'https://www.tiktok.com/t/ZMabcdefg/',
      'https://fb.watch/abcdefg/',
      'https://vimeo.com/123456789',
      'https://example.com/video.mp4',
      'javascript:alert(1)',
    ];
    for (const url of refused) {
      const res = await created.agent.post('/api/properties', {
        title: 'Phase 6 refused video',
        location: 'Osu, Accra',
        city: 'Accra',
        rentGhs: 5000,
        bedrooms: 2,
        bathrooms: 1,
        propertyType: 'Apartment',
        description: 'A listing whose video must be refused.',
        images: ['https://example.com/nope.jpg'],
        videoUrl: url,
        viewingFeeGhs: 100,
        viewingTerms: VIEWING_TERMS,
      });
      assert.equal(res.status, 422, `${url} must be refused, got ${JSON.stringify(res.body)}`);
      assert.ok(res.body.fields?.videoUrl, `${url} must be reported on videoUrl`);
    }
  });

  test('the provider commission is visible to its provider and invisible to a tenant', async () => {
    const created_ = await created.agent.post('/api/properties', {
      title: 'Phase 6 commission listing',
      location: 'Airport Residential, Accra',
      city: 'Accra',
      rentGhs: 9000,
      bedrooms: 4,
      bathrooms: 3,
      propertyType: 'Duplex',
      description: 'A listing that states the provider commission expectation.',
      images: ['https://example.com/duplex.jpg'],
      providerCommissionPercent: 10,
      providerCommissionNote: "One month's rent, agreed with the owner.",
      viewingFeeGhs: 200,
      viewingTerms: VIEWING_TERMS,
    });
    assert.equal(created_.status, 201, JSON.stringify(created_.body));
    const propertyId = created_.body.property.id;

    const approved = await admin.post(`/api/properties/${propertyId}/status`, { status: 'active' });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const providerView = await created.agent.get(`/api/properties/${propertyId}`);
    assert.equal(providerView.status, 200);
    assert.equal(providerView.body.property.providerCommission.percent, 10);
    assert.match(providerView.body.property.providerCommission.note, /month/i);
    assert.equal(providerView.body.property.providerCommission.isPlatformFee, false);

    const tenantView = await created.tenant.get(`/api/properties/${propertyId}`);
    assert.equal(tenantView.status, 200);
    assert.equal(tenantView.body.property.providerCommission.percent, null);
    assert.equal(tenantView.body.property.providerCommission.note, '');
    assert.equal(tenantView.body.property.providerCommission.isPlatformFee, false);

    const publicView = await new ApiClient(baseUrl).get(`/api/properties/${propertyId}`);
    assert.equal(publicView.body.property.providerCommission.percent, null);
  });

  test('a percentage outside 0–100 is refused rather than clamped', async () => {
    const res = await created.agent.post('/api/properties', {
      title: 'Phase 6 bad commission',
      location: 'Osu, Accra',
      city: 'Accra',
      rentGhs: 4000,
      bedrooms: 1,
      bathrooms: 1,
      propertyType: 'Studio',
      description: 'A listing with an impossible commission figure.',
      images: ['https://example.com/bad.jpg'],
      providerCommissionPercent: 140,
      viewingFeeGhs: 100,
      viewingTerms: VIEWING_TERMS,
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
  });
});

// ---------------------------------------------------------------------------
describe('C7 — providers hear about real interest, without tenant details', () => {
  const notificationsFor = async (client) => {
    const res = await client.get('/api/notifications');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.notifications;
  };

  test('saving a listing notifies its provider in the app', async () => {
    const before = await notificationsFor(created.agent);
    const saved = await created.tenant.post('/api/saved-properties', { propertyId: created.propertyId });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    const after = await notificationsFor(created.agent);
    assert.ok(after.length > before.length, 'the provider must receive a notification');

    const fresh = after.filter((notice) => !before.some((old) => old.id === notice.id));
    const notice = fresh.find((entry) => /interest|saved|saving/i.test(`${entry.title} ${entry.message}`));
    assert.ok(notice, `no provider-interest notification among ${JSON.stringify(fresh)}`);
    const text = `${notice.title} ${notice.message}`;
    assert.match(text, /interest|saved|saving/i);

    // The whole point of C7: the provider learns *that*, never *who*.
    assert.ok(!text.includes(created.tenantEmail), 'the tenant email must not appear');
    assert.ok(!/\+233 20 555 0602/.test(text), 'the tenant phone must not appear');
    assert.ok(!/Phase 6 Tenant/.test(text), 'the tenant name must not appear');
    assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text), 'no email address of any kind');
  });

  test('a second save on the same day does not send a second notification', async () => {
    const before = await notificationsFor(created.agent);
    const saved = await created.tenant2.post('/api/saved-properties', { propertyId: created.propertyId });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const after = await notificationsFor(created.agent);
    assert.equal(after.length, before.length, 'one notification per property per provider per day');
  });

  test('the provider is not notified about their own save', async () => {
    const ownPropertyId = created.propertyId;
    const before = await notificationsFor(created.agent);
    const saved = await created.agent.post('/api/saved-properties', { propertyId: ownPropertyId });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const after = await notificationsFor(created.agent);
    assert.equal(after.length, before.length);
  });
});

// ---------------------------------------------------------------------------
describe('E2 — the classification is final, until an administrator corrects it', () => {
  test('a member cannot change their own account type', async () => {
    const res = await created.tenant.put('/api/profile', {
      name: 'Phase 6 Tenant',
      phone: '+233 20 555 0602',
      role: 'landlord',
    });
    // The field is not accepted at all: the account stays a tenant.
    assert.ok([200, 422].includes(res.status), JSON.stringify(res.body));
    const me = await created.tenant.get('/api/auth/me');
    assert.equal(me.body.user.role, 'tenant');
  });

  test('a non-administrator cannot use the correction endpoint', async () => {
    const res = await created.tenant.post(`/api/admin/users/${created.landlordId}/role`, {
      role: 'agent',
      reason: 'Testing whether a tenant can reclassify an account.',
    });
    assert.ok([401, 403].includes(res.status), JSON.stringify(res.body));
  });

  test('a correction without a reason is refused', async () => {
    const res = await admin.post(`/api/admin/users/${created.landlordId}/role`, {
      role: 'agent',
      reason: 'short',
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.ok(res.body.fields?.reason);
  });

  test('an administrator cannot be reclassified through this endpoint', async () => {
    const me = await admin.get('/api/auth/me');
    const adminId = me.body.user.id;
    const res = await admin.post(`/api/admin/users/${adminId}/role`, {
      role: 'agent',
      reason: 'Attempting to demote an administrator account.',
    });
    assert.ok([403, 422].includes(res.status), JSON.stringify(res.body));
  });

  test('an authorised administrator corrects it, and the change is audited', async () => {
    const res = await admin.post(`/api/admin/users/${created.landlordId}/role`, {
      role: 'agent',
      reason: 'Registered as a landlord but is the letting agent for these flats.',
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.corrected.from, 'landlord');
    assert.equal(res.body.corrected.to, 'agent');
    assert.equal(res.body.user.role, 'agent');

    const profile = await admin.get(`/api/admin/users/${created.landlordId}`);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.user.role, 'agent');
    assert.equal(profile.body.canCorrectClassification, true);

    const activity = await admin.get(`/api/admin/users/${created.landlordId}/activity`);
    assert.equal(activity.status, 200);
    const entry = (activity.body.activity || []).find((row) =>
      /role|classification/i.test(`${row.title} ${row.status}`)
    );
    assert.ok(entry, 'the correction must appear in the account history');

    const notice = await created.landlord.get('/api/notifications');
    const text = JSON.stringify(notice.body.notifications);
    assert.match(text, /corrected/i, 'the account holder must be told');
  });

  test('the corrected account really is treated as an agent from now on', async () => {
    const me = await created.landlord.get('/api/auth/me');
    assert.equal(me.body.user.role, 'agent');

    // It now needs agent-account approval like any other agent: a correction
    // never hands out listing permission by itself.
    const beforeApproval = await created.landlord.post('/api/properties', {
      title: 'Phase 6 premature listing',
      location: 'Labone, Accra',
      city: 'Accra',
      rentGhs: 5100,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: 'Apartment',
      description: 'A listing attempted before agent approval.',
      images: ['https://example.com/early.jpg'],
      viewingFeeGhs: 100,
      viewingTerms: VIEWING_TERMS,
    });
    assert.equal(beforeApproval.status, 403, JSON.stringify(beforeApproval.body));

    const approved = await admin.post(`/api/admin/agents/${created.landlordId}/status`, {
      accountStatus: 'active',
      canSubmitListings: true,
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));

    const created2 = await created.landlord.post('/api/properties', {
      title: 'Phase 6 reclassified listing',
      location: 'Labone, Accra',
      city: 'Accra',
      rentGhs: 5100,
      bedrooms: 2,
      bathrooms: 1,
      propertyType: 'Apartment',
      description: 'A listing submitted by the corrected account.',
      images: ['https://example.com/labone.jpg'],
      viewingFeeGhs: 100,
      viewingTerms: VIEWING_TERMS,
      // The stale landlord reference is ignored for an agent listing (C1).
      landlordId: created.landlordId,
    });
    assert.equal(created2.status, 201, JSON.stringify(created2.body));
    assert.equal(created2.body.property.submittedByRole, 'agent');
    assert.equal(created2.body.property.landlordId, '');
  });
});

// ---------------------------------------------------------------------------
describe('Static — the screens and modules say what they must', () => {
  const listProperty = read('src/components/ListPropertyView.tsx');
  const agentForm = read('src/components/AgentListingForm.tsx');
  const picker = read('src/components/PropertyImagePicker.tsx');
  const detail = read('src/components/PropertyDetailView.tsx');
  const providerAlerts = read('php-backend/lib/provider_alerts.php');
  const templates = read('php-backend/lib/email_templates.php');

  test('C3: both listing paths use the one image picker', () => {
    assert.match(picker, /export const PropertyImagePicker/);
    assert.match(picker, /accept=\{IMAGE_ACCEPT\}/);
    assert.match(picker, /validateImageFile\(file, IMAGE_MAX_BYTES\)/);
    assert.match(picker, /dedupeFiles\(/);
    assert.match(picker, /api\.uploadImages\(accepted\)/);
    assert.match(picker, /aria-label=\{`Remove \$\{image\.name\}`\}/);
    assert.match(picker, /title=\{image\.name\}/);
    assert.match(picker, /No images selected yet/);

    for (const [name, source] of [['ListPropertyView', listProperty], ['AgentListingForm', agentForm]]) {
      assert.match(source, /<PropertyImagePicker/, `${name} must use the shared picker`);
      assert.ok(
        !/api\.uploadImages\(/.test(source),
        `${name} must not upload images itself — one implementation only`
      );
    }

    // The agent form's old single text field is gone.
    assert.ok(!/Image links \(one per line\)/.test(agentForm), 'the agent form no longer asks for one URL string');
    assert.match(agentForm, /images,\n/, 'the agent payload sends the URL list');
  });

  test('C1: neither listing form asks for a landlord reference', () => {
    for (const [name, source] of [['ListPropertyView', listProperty], ['AgentListingForm', agentForm]]) {
      assert.ok(!/landlordId/.test(source), `${name} must not offer a landlord reference field`);
      assert.ok(!/landlordName|landlordEmail|landlordPhone/.test(source), `${name} must not ask for owner details`);
    }
  });

  test('C4: the video is rendered from the server-built embed, never the raw link', () => {
    assert.match(detail, /property\.video\.embedUrl/);
    assert.ok(!/src=\{property\.videoUrl\}/.test(detail), 'the raw link must never be an iframe src');
    assert.match(detail, /referrerPolicy="strict-origin-when-cross-origin"/);
    assert.match(detail, /allowFullScreen/);
    assert.match(detail, /Goodlucks does not host or endorse the video/);
  });

  test('C5: amenities render as words, with the free note kept', () => {
    assert.match(detail, /property\.amenityLabels && property\.amenityLabels\.length > 0/);
    assert.match(detail, /property\.amenitiesNote/);
  });

  test('C6: the commission block is labelled as the provider\'s, not a Goodlucks fee', () => {
    assert.match(detail, /Provider's commission expectation/);
    assert.match(detail, /not a Goodlucks fee/);
    assert.match(detail, /nothing is calculated from it/);
  });

  test('C7: the provider module has no tenant parameter to leak', () => {
    assert.match(providerAlerts, /function notify_provider_property_interest\(array \$propertyRow, string \$event, array \$extra = \[\]\): bool/);
    assert.match(providerAlerts, /claim_alert_delivery\('provider_interest'/);
    assert.match(providerAlerts, /provider_interest_save_count/);
    // The count is a COUNT(*), never a list of who saved it.
    assert.match(providerAlerts, /SELECT COUNT\(\*\) FROM saved_properties WHERE property_id = :pid/);
    assert.ok(!/saved_properties WHERE property_id = :pid[^']*SELECT/i.test(providerAlerts));
    assert.ok(!/SELECT user_id FROM saved_properties/i.test(providerAlerts), 'no row-level tenant data');
    assert.match(providerAlerts, /Goodlucks does not pass viewer names, email addresses or phone/);
  });

  test('C8: verification decisions have their own email targets', () => {
    assert.match(templates, /'verification_approved'\s*=>/);
    assert.match(templates, /'verification_attention'\s*=>/);
    assert.match(templates, /'provider_interest'\s*=>/);
    const verification = read('php-backend/lib/verification.php');
    assert.match(verification, /function send_verification_decision_email/);
    assert.match(verification, /Reason given by the reviewer/);
    assert.match(verification, /'verification_approved' : 'verification_attention'/);
  });

  test('E2: the correction control is staff-only and asks for a reason', () => {
    const profile = read('src/components/AdminUserProfile.tsx');
    assert.match(profile, /canCorrectClassification/);
    assert.match(profile, /Correct the account type/);
    assert.match(profile, /reason\.trim\(\)\.length < 10/);
    const api = read('php-backend/lib/api.php');
    assert.match(api, /handle_admin_correct_user_role/);
    assert.match(api, /Administrator accounts cannot be reclassified here/);
    assert.match(api, /user\.role_corrected/);
  });
});
