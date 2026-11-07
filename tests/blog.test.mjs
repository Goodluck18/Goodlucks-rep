/**
 * Goodlucks Homes - Blog & Learning Centre integration tests (Task 07)
 *
 * Runs the real PHP backend (SQLite driver) and exercises the publishing rules,
 * the content sanitiser, the live property showcase and the email integration
 * through the same HTTP API the website uses:
 *
 *   - a draft / scheduled / unpublished article is never public;
 *   - a scheduled article becomes public once its time has passed;
 *   - the sanitiser keeps the article allowlist and nothing else;
 *   - a showcase card reads the LIVE listing (price change, rented, deleted);
 *   - only published articles can be linked from an email template, and a
 *     template whose article is later unpublished is skipped, not sent broken;
 *   - every admin endpoint refuses a tenant, landlord or agent.
 *
 *   npm run test:blog
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { startApiServer, runPhpScript } from '../scripts/php.mjs';
import { ApiClient, createPng } from './helpers.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(projectRoot, '.data');
const uploadDir = path.join(dataDir, `blog-uploads-${process.pid}-${Date.now()}`);
const dbPath = path.join(dataDir, `blog-${process.pid}-${Date.now()}.sqlite`);
const port = 8800 + Math.floor(Math.random() * 500);
const ADMIN_EMAIL = 'admin@blog.test';
const ADMIN_PASSWORD = 'Admin-Test-Password-123';
const ADMIN_ACCESS_KEY = 'test-access-key';

let server;
let admin;
let tenant;
let landlord;
let guest;
const state = {};

const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;

/** Run one of the test-only fixtures. */
const fixture = (args) => {
  const result = runPhpScript('tests/blog-fixtures.php', args, state.testEnv);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
};

/** Create a draft through the API and return it. */
const createPost = async (overrides = {}) => {
  const res = await admin.post('/api/admin/blog/posts', {
    title: `Test article ${Math.random().toString(36).slice(2, 8)}`,
    subtitle: 'A short introduction.',
    contentHtml: '<h2>Heading</h2><p>Body text.</p>',
    ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.post;
};

/** Publish a post and return it. */
const publish = async (id) => {
  const res = await admin.post(`/api/admin/blog/posts/${id}/status`, { status: 'published' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.post;
};

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }

  fs.mkdirSync(uploadDir, { recursive: true });

  const env = {
    DB_DRIVER: 'sqlite',
    DB_SQLITE_PATH: dbPath,
    APP_ENV: 'development',
    ADMIN_ACCESS_KEY,
    OFFICIAL_EMAIL: 'rentals@goodlucks.co',
    EMAIL_TRANSPORT: 'none',
    EMAIL_OUTBOX_NO_FLUSH: '1',
    REGISTER_RATE_LIMIT_PER_HOUR: '60',
    IDENTITY_DATA_KEY: Buffer.alloc(32, 7).toString('base64'),
    // Keep this run's uploads out of the repository tree.
    PRIVATE_UPLOAD_DIR: uploadDir,
  };

  server = await startApiServer({ port, env, quiet: true });
  state.testEnv = env;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=Blog Editor'],
    env
  );
  assert.equal(bootstrap.status, 0, bootstrap.stdout + bootstrap.stderr);

  admin = new ApiClient(server.baseUrl);
  tenant = new ApiClient(server.baseUrl);
  landlord = new ApiClient(server.baseUrl);
  guest = new ApiClient(server.baseUrl);

  const login = await admin.post('/api/auth/admin-login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    accessKey: ADMIN_ACCESS_KEY,
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));

  const tenantReg = await tenant.post('/api/auth/register', {
    name: 'Test Tenant',
    email: uniqueEmail('tenant'),
    phone: '+233201234567',
    password: 'Tenant-Password-123',
    role: 'tenant',
  });
  assert.ok([200, 201].includes(tenantReg.status), JSON.stringify(tenantReg.body));

  const landlordReg = await landlord.post('/api/auth/register', {
    name: 'Test Landlord',
    email: uniqueEmail('landlord'),
    phone: '+233201234568',
    password: 'Landlord-Password-123',
    role: 'landlord',
  });
  assert.ok([200, 201].includes(landlordReg.status), JSON.stringify(landlordReg.body));
});

after(() => {
  server?.stop();
});

/* ========================================================================== */
/* A. Public reads and authorisation                                          */
/* ========================================================================== */

describe('Blog: public reads and admin-only management', () => {
  test('a fresh site has an empty Learning Centre, not an error', async () => {
    const res = await guest.get('/api/blog');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.posts, []);
    assert.deepEqual(res.body.featured, []);
    assert.deepEqual(res.body.categories, []);
  });

  test('a guest, a tenant and a landlord cannot read or write articles', async () => {
    for (const [label, client] of [
      ['guest', guest],
      ['tenant', tenant],
      ['landlord', landlord],
    ]) {
      const list = await client.get('/api/admin/blog/posts');
      assert.ok([401, 403].includes(list.status), `${label} listing returned ${list.status}`);

      const create = await client.post('/api/admin/blog/posts', { title: 'Sneaky article' });
      assert.ok([401, 403].includes(create.status), `${label} create returned ${create.status}`);

      const category = await client.post('/api/admin/blog/categories', { name: 'Sneaky category' });
      assert.ok([401, 403].includes(category.status), `${label} category returned ${category.status}`);
    }
  });

  test('an administrator creates an article as a draft, with no invented author', async () => {
    const post = await createPost({ title: 'How renting works in Ghana' });
    assert.equal(post.status, 'draft');
    assert.equal(post.slug, 'how-renting-works-in-ghana');
    assert.equal(post.author.name, 'Blog Editor');
    assert.equal(post.publishedAt, '');
    assert.equal(post.url, '/blog/how-renting-works-in-ghana');
  });

  test('a draft is not public, not in the index and not in the sitemap', async () => {
    const post = await createPost({ title: 'Secret draft guide' });

    const direct = await guest.get(`/api/blog/${post.slug}`);
    assert.equal(direct.status, 404, 'a draft must answer 404');

    const index = await guest.get('/api/blog');
    assert.equal(index.body.posts.some((item) => item.id === post.id), false);

    const sitemap = await guest.get('/api/sitemap.xml', { raw: true });
    const xml = await sitemap.text();
    assert.equal(xml.includes(`/blog/${post.slug}`), false, 'a draft must not be advertised to crawlers');
  });

  test('editing a saved article keeps the content it already had', async () => {
    const post = await createPost({
      title: 'Editing keeps content',
      contentHtml: '<h2>Keep me</h2><p>This paragraph must survive a title change.</p><ul><li>one</li><li>two</li></ul>',
    });
    const patched = await admin.patch(`/api/admin/blog/posts/${post.id}`, { title: 'Edited title' });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));

    const reloaded = await admin.get(`/api/admin/blog/posts/${post.id}`);
    assert.equal(reloaded.body.post.title, 'Edited title');
    assert.match(reloaded.body.post.contentHtml, /This paragraph must survive a title change\./);
    assert.match(reloaded.body.post.contentHtml, /<h2>Keep me<\/h2>/);
    assert.match(reloaded.body.post.contentHtml, /<li>two<\/li>/);
  });
});

/* ========================================================================== */
/* B. Publication lifecycle                                                   */
/* ========================================================================== */

describe('Blog: draft, publish, schedule, unpublish', () => {
  test('publishing makes the article public and puts it in the sitemap', async () => {
    const post = await createPost({
      title: 'Publishing works',
      contentHtml: '<h2>Live</h2><p>This article is public.</p>',
      seoTitle: 'Publishing works | Test',
      seoDescription: 'The meta description an editor wrote.',
    });
    const published = await publish(post.id);
    assert.equal(published.status, 'published');
    assert.ok(published.publishedAt, 'a published article records when it went live');

    const publicPost = await guest.get(`/api/blog/${post.slug}`);
    assert.equal(publicPost.status, 200);
    assert.equal(publicPost.body.post.title, 'Publishing works');
    assert.match(publicPost.body.post.contentHtml, /This article is public\./);
    assert.equal(publicPost.body.post.canonicalUrl, `https://goodlucks.co/blog/${post.slug}`);
    assert.equal(publicPost.body.post.seoDescription, 'The meta description an editor wrote.');

    const index = await guest.get('/api/blog');
    assert.ok(index.body.posts.some((item) => item.id === post.id), 'a published article is in the index');

    const sitemap = await guest.get('/api/sitemap.xml', { raw: true });
    const xml = await sitemap.text();
    assert.ok(xml.includes(`/blog/${post.slug}`), 'a published article is in the sitemap');
    assert.ok(xml.includes('<loc>https://goodlucks.co/blog</loc>'), 'the Learning Centre itself is in the sitemap');
  });

  test('an empty article cannot be published', async () => {
    const post = await createPost({ title: 'Nothing in it', contentHtml: '' });
    const res = await admin.post(`/api/admin/blog/posts/${post.id}/status`, { status: 'published' });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.match(res.body.error, /content/i);
  });

  test('a scheduled article stays private until its time, then publishes itself', async () => {
    const post = await createPost({ title: 'Scheduled article', contentHtml: '<p>Not yet.</p>' });
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const scheduled = await admin.post(`/api/admin/blog/posts/${post.id}/status`, {
      status: 'scheduled',
      publishAt: future,
    });
    assert.equal(scheduled.status, 200, JSON.stringify(scheduled.body));
    assert.equal(scheduled.body.post.status, 'scheduled');

    const before = await guest.get(`/api/blog/${post.slug}`);
    assert.equal(before.status, 404, 'a future article is not public');

    // Move its publication time into the past; the normal read path promotes it.
    fixture([`--publish-at-past=${post.slug}`]);

    const after = await guest.get(`/api/blog/${post.slug}`);
    assert.equal(after.status, 200, 'a due scheduled article is public');

    const reloaded = await admin.get(`/api/admin/blog/posts/${post.id}`);
    assert.equal(reloaded.body.post.status, 'published');
    assert.ok(reloaded.body.post.publishedAt, 'promotion records the publication time');
  });

  test('a scheduled article cannot be set in the past', async () => {
    const post = await createPost({ title: 'Bad schedule' });
    const res = await admin.post(`/api/admin/blog/posts/${post.id}/status`, {
      status: 'scheduled',
      publishAt: new Date(Date.now() - 60_000).toISOString(),
    });
    assert.equal(res.status, 422);
  });

  test('unpublishing withdraws the article immediately', async () => {
    const post = await createPost({ title: 'Withdrawn later', contentHtml: '<p>Taken down.</p>' });
    await publish(post.id);

    const unpublish = await admin.post(`/api/admin/blog/posts/${post.id}/status`, { status: 'unpublished' });
    assert.equal(unpublish.status, 200);

    const direct = await guest.get(`/api/blog/${post.slug}`);
    assert.equal(direct.status, 404, 'an unpublished article must not resolve');

    const sitemap = await guest.get('/api/sitemap.xml', { raw: true });
    const xml = await sitemap.text();
    assert.equal(xml.includes(`/blog/${post.slug}`), false, 'an unpublished article leaves the sitemap');
  });

  test('deleting requires confirmation and then stops the URL working', async () => {
    const post = await createPost({ title: 'Delete me', contentHtml: '<p>Bye.</p>' });
    await publish(post.id);

    const noConfirm = await admin.delete(`/api/admin/blog/posts/${post.id}`);
    assert.equal(noConfirm.status, 400, 'a delete without confirmation is refused');

    const confirmed = await admin.delete(`/api/admin/blog/posts/${post.id}?confirm=1`);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));

    const gone = await guest.get(`/api/blog/${post.slug}`);
    assert.equal(gone.status, 404);
  });
});

/* ========================================================================== */
/* C. Content safety                                                          */
/* ========================================================================== */

describe('Blog: article HTML is sanitised on save', () => {
  test('scripts, event handlers and unsafe links never reach the stored article', async () => {
    const post = await createPost({
      title: 'Unsafe content',
      contentHtml: [
        '<p onclick="alert(1)">Tap me</p>',
        '<script>window.stolen = 1</script>',
        '<p><a href="javascript:alert(1)">bad link</a></p>',
        '<img src="x" onerror="alert(1)">',
        '<style>body{display:none}</style>',
        '<iframe src="https://evil.example/embed"></iframe>',
      ].join(''),
    });

    const html = post.contentHtml;
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /onclick/i);
    assert.doesNotMatch(html, /onerror/i);
    assert.doesNotMatch(html, /javascript:/i);
    assert.doesNotMatch(html, /<style/i);
    assert.doesNotMatch(html, /evil\.example/i);
    assert.match(html, /Tap me/, 'the text itself is kept');
  });

  test('a YouTube link becomes a responsive, cookie-free embed', async () => {
    const post = await createPost({
      title: 'Video article',
      contentHtml:
        '<p>Watch this.</p><iframe src="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42"></iframe>' +
        '<iframe src="https://youtu.be/aBcDeFgHiJk"></iframe>',
    });

    assert.match(post.contentHtml, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ"/);
    assert.match(post.contentHtml, /src="https:\/\/www\.youtube-nocookie\.com\/embed\/aBcDeFgHiJk"/);
    assert.match(post.contentHtml, /loading="lazy"/);
    // Only the two canonical embeds exist: the raw YouTube URLs are gone.
    assert.equal((post.contentHtml.match(/<iframe/g) ?? []).length, 2);
    assert.doesNotMatch(post.contentHtml, /youtube\.com\/watch/);
  });

  test('the showcase placeholder survives sanitising, so cards can sit mid-article', async () => {
    const post = await createPost({
      title: 'Placeholder article',
      contentHtml: '<p>Before.</p><div class="gl-showcase"></div><p>After.</p>',
    });
    assert.match(post.contentHtml, /<div class="gl-showcase"><\/div>/);
    assert.match(post.contentHtml, /<p>Before\.<\/p>/);
    assert.match(post.contentHtml, /<p>After\.<\/p>/);
  });

  test('a callout block survives and an arbitrary div does not', async () => {
    const post = await createPost({
      title: 'Callout article',
      contentHtml: '<aside class="gl-callout">A fee is paid only after the viewing.</aside><div class="spoof">nope</div>',
    });
    assert.match(post.contentHtml, /<aside class="gl-callout">/);
    assert.doesNotMatch(post.contentHtml, /class="spoof"/);
  });
});

/* ========================================================================== */
/* D. Property showcase (live references)                                     */
/* ========================================================================== */

describe('Blog: the property showcase reads live listings', () => {
  let post;
  let activePropertyId;

  before(async () => {
    const catalogue = await guest.get('/api/properties?perPage=5');
    const items = catalogue.body.properties ?? [];
    assert.ok(items.length >= 2, 'the seeded catalogue needs at least two listings');
    activePropertyId = items[0].id;
    state.secondPropertyId = items[1].id;

    post = await createPost({ title: 'Top available properties', contentHtml: '<p>Editorial before.</p><div class="gl-showcase"></div><p>Editorial after.</p>' });
    await publish(post.id);
  });

  test('selected listings become cards with live data and the right link', async () => {
    const res = await admin.post(`/api/admin/blog/posts/${post.id}/properties`, {
      items: [{ propertyId: activePropertyId, displayRule: 'show_status', note: 'Walk to the shops' }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const publicPost = await guest.get(`/api/blog/${post.slug}`);
    const cards = publicPost.body.post.propertyCards;
    assert.equal(cards.length, 1);
    assert.equal(cards[0].propertyId, activePropertyId);
    assert.equal(cards[0].url, `/property/${activePropertyId}`);
    assert.equal(cards[0].isAvailable, true);
    assert.equal(cards[0].note, 'Walk to the shops');
    assert.equal(typeof cards[0].rentGhs, 'number');
    // A public card never carries internal moderation state or contact data.
    assert.equal('status' in cards[0], false);
    assert.equal('landlordId' in cards[0], false);
  });

  test('a price change shows on the card without touching the article', async () => {
    const before = await guest.get(`/api/blog/${post.slug}`);
    const oldRent = before.body.post.propertyCards[0].rentGhs;

    const update = await admin.put(`/api/properties/${activePropertyId}`, { rentGhs: oldRent + 750 });
    assert.equal(update.status, 200, JSON.stringify(update.body));

    const after = await guest.get(`/api/blog/${post.slug}`);
    assert.equal(after.body.post.propertyCards[0].rentGhs, oldRent + 750, 'the card follows the listing');

    // Put it back so later tests read a predictable catalogue.
    await admin.put(`/api/properties/${activePropertyId}`, { rentGhs: oldRent });
  });

  test('a listing that becomes unavailable is shown as such or hidden, per its rule', async () => {
    const rentedId = state.secondPropertyId;
    const rent = await admin.post(`/api/properties/${rentedId}/status`, { status: 'rented' });
    assert.equal(rent.status, 200, JSON.stringify(rent.body));

    // Rule 1: show it, with an accurate status and no link.
    await admin.post(`/api/admin/blog/posts/${post.id}/properties`, {
      items: [{ propertyId: rentedId, displayRule: 'show_status' }],
    });
    const shown = await guest.get(`/api/blog/${post.slug}`);
    assert.equal(shown.body.post.propertyCards.length, 1);
    assert.equal(shown.body.post.propertyCards[0].isAvailable, false);
    assert.equal(shown.body.post.propertyCards[0].availability, 'No longer available');
    assert.equal(shown.body.post.propertyCards[0].url, null, 'an unavailable listing has no page to open');
    assert.doesNotMatch(JSON.stringify(shown.body.post.propertyCards[0]), /rented/, 'internal status is not exposed');

    // Rule 2: hide it entirely.
    await admin.post(`/api/admin/blog/posts/${post.id}/properties`, {
      items: [{ propertyId: rentedId, displayRule: 'hide_unavailable' }],
    });
    const hidden = await guest.get(`/api/blog/${post.slug}`);
    assert.equal(hidden.body.post.propertyCards.length, 0, 'hide_unavailable keeps it off the page');

    await admin.post(`/api/properties/${rentedId}/status`, { status: 'active' });
  });

  test('a deleted listing is never presented as available', async () => {
    const temp = await createPost({ title: 'Temp property', contentHtml: '<p>x</p><div class="gl-showcase"></div>' });
    const created = await admin.post('/api/properties', {
      title: 'Temporary listing for the showcase test',
      location: 'Osu, Accra',
      city: 'Accra',
      rentGhs: 4200,
      bedrooms: 2,
      bathrooms: 2,
      propertyType: 'Apartment',
      description: 'Created by the blog test suite.',
      images: ['https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80'],
      amenities: ['Parking'],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const newId = created.body.property.id;

    const attach = await admin.post(`/api/admin/blog/posts/${temp.id}/properties`, {
      items: [{ propertyId: newId, displayRule: 'show_status' }],
    });
    assert.equal(attach.status, 200);

    // A soft delete keeps the listing record but takes it off the market. The
    // card must then say so and stop linking to it - never "available".
    const deleted = await admin.delete(`/api/properties/${newId}`);
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));

    await publish(temp.id);
    const softDeleted = await guest.get(`/api/blog/${temp.slug}`);
    assert.equal(softDeleted.status, 200);
    assert.equal(softDeleted.body.post.propertyCards.length, 1);
    assert.equal(softDeleted.body.post.propertyCards[0].isAvailable, false);
    assert.equal(softDeleted.body.post.propertyCards[0].url, null);
    assert.equal(softDeleted.body.post.propertyCards[0].availability, 'No longer available');

    // A purge removes the record outright: the card leaves the public article.
    const purged = await admin.delete(`/api/properties/${newId}?purge=1`);
    assert.equal(purged.status, 200, JSON.stringify(purged.body));

    const publicPost = await guest.get(`/api/blog/${temp.slug}`);
    assert.deepEqual(publicPost.body.post.propertyCards, [], 'a deleted listing leaves the article');

    // The console still shows the dead reference so an editor can fix it.
    const adminView = await admin.get(`/api/admin/blog/posts/${temp.id}`);
    assert.equal(adminView.body.post.propertyCards.length, 1);
    assert.equal(adminView.body.post.propertyCards[0].missing, true);
    assert.equal(adminView.body.post.propertyCards[0].status, 'deleted');
    assert.equal(adminView.body.post.propertyCards[0].isAvailable, false);
  });

  test('the administrator decides the order and it is what readers get', async () => {
    const catalogue = await guest.get('/api/properties?perPage=4');
    const ids = (catalogue.body.properties ?? []).map((item) => item.id);
    assert.ok(ids.length >= 2);

    await admin.post(`/api/admin/blog/posts/${post.id}/properties`, {
      items: [{ propertyId: ids[1] }, { propertyId: ids[0] }],
    });
    const reordered = await guest.get(`/api/blog/${post.slug}`);
    assert.deepEqual(
      reordered.body.post.propertyCards.map((card) => card.propertyId),
      [ids[1], ids[0]],
      'the stored order is the display order'
    );

    // A duplicate is collapsed, not duplicated.
    await admin.post(`/api/admin/blog/posts/${post.id}/properties`, {
      items: [{ propertyId: ids[0] }, { propertyId: ids[0] }],
    });
    const deduped = await guest.get(`/api/blog/${post.slug}`);
    assert.equal(deduped.body.post.propertyCards.length, 1);
  });

  test('an unknown property id is refused rather than stored', async () => {
    const res = await admin.post(`/api/admin/blog/posts/${post.id}/properties`, {
      items: [{ propertyId: 'prop-does-not-exist' }],
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
  });
});

/* ========================================================================== */
/* D2. Featured image, tags and SEO metadata                                  */
/* ========================================================================== */

describe('Blog: featured image, tags and SEO metadata', () => {
  test('an uploaded image becomes the featured image and is served back', async () => {
    const form = new FormData();
    form.append('file', new Blob([createPng(200, 120)], { type: 'image/png' }), 'learning-centre.png');
    const upload = await admin.request('POST', '/api/uploads', { body: form });
    assert.equal(upload.status, 201, JSON.stringify(upload.body));
    const imageUrl = upload.body.urls[0];
    assert.match(imageUrl, /^\/api\/uploads\/gl-\d{8}-[a-f0-9]+\.png$/);

    const post = await createPost({
      title: 'Article with a picture',
      contentHtml: '<p>Some words.</p>',
      featuredImage: imageUrl,
      featuredImageAlt: 'A sunlit courtyard in East Legon',
      tags: ['Renting', 'East Legon'],
      seoTitle: 'A custom search title',
      seoDescription: 'A custom search description for the article.',
    });
    await publish(post.id);

    const publicPost = await guest.get(`/api/blog/${post.slug}`);
    assert.equal(publicPost.body.post.featuredImage, imageUrl);
    assert.equal(publicPost.body.post.featuredImageAlt, 'A sunlit courtyard in East Legon');
    assert.deepEqual(publicPost.body.post.tags, ['Renting', 'East Legon']);
    assert.equal(publicPost.body.post.seoTitle, 'A custom search title');
    assert.equal(publicPost.body.post.seoDescription, 'A custom search description for the article.');
    assert.equal(publicPost.body.post.canonicalUrl, `https://goodlucks.co/blog/${post.slug}`);

    const served = await guest.get(imageUrl, { raw: true });
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');

    const featured = await guest.get('/api/blog');
    const card = featured.body.posts.find((item) => item.id === post.id);
    assert.equal(card.featuredImage, imageUrl, 'the index card uses the featured image');
    assert.ok(card.summary.length > 0, 'the index card carries a summary');
    assert.ok(card.readingMinutes >= 1);
  });

  test('a non-image cannot be uploaded for an article', async () => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('<svg onload="alert(1)">')], { type: 'image/svg+xml' }), 'x.svg');
    const res = await admin.request('POST', '/api/uploads', { body: form });
    assert.equal(res.status, 422, 'only real raster images are accepted');
  });

  test('internal links between articles are kept as written', async () => {
    const post = await createPost({
      title: 'Linking article',
      contentHtml:
        '<p>See <a href="/blog/another-article">another article</a> and <a href="https://goodlucks.co/properties">the listings</a>.</p>',
    });
    assert.match(post.contentHtml, /href="\/blog\/another-article"/);
    assert.match(post.contentHtml, /href="https:\/\/goodlucks.co\/properties"/);
  });
});

/* ========================================================================== */
/* E. Categories                                                              */
/* ========================================================================== */

describe('Blog: categories are data, not code', () => {
  test('an administrator creates, edits and reuses a category', async () => {
    const created = await admin.post('/api/admin/blog/categories', {
      name: 'Agent Training',
      description: 'Onboarding and conduct for agents.',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const category = created.body.category;
    assert.equal(category.slug, 'agent-training');

    const duplicate = await admin.post('/api/admin/blog/categories', { name: 'Agent Training' });
    assert.equal(duplicate.status, 422, 'a duplicate slug is refused');

    const renamed = await admin.patch(`/api/admin/blog/categories/${category.id}`, {
      name: 'Agent Training and Conduct',
    });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.equal(renamed.body.category.slug, 'agent-training', 'the slug is stable unless changed');

    const post = await createPost({ title: 'Agent guide', categoryId: category.id, contentHtml: '<p>Be early.</p>' });
    const published = await publish(post.id);
    assert.equal(published.category.id, category.id);

    const publicCategories = await guest.get('/api/blog/categories');
    const listed = publicCategories.body.categories.find((item) => item.slug === 'agent-training');
    assert.ok(listed, 'a category with a published article is public');
    assert.equal(listed.publishedCount, 1);

    const index = await guest.get('/api/blog?category=agent-training');
    assert.deepEqual(index.body.posts.map((item) => item.id), [post.id], 'filtering by category works');

    const inUse = await admin.delete(`/api/admin/blog/categories/${category.id}?confirm=1`);
    assert.equal(inUse.status, 409, 'a category with articles is not deleted');

    await admin.post(`/api/admin/blog/posts/${post.id}/status`, { status: 'draft' });
    const afterUnpublish = await guest.get('/api/blog/categories');
    assert.equal(
      afterUnpublish.body.categories.some((item) => item.slug === 'agent-training'),
      false,
      'a category with no published article drops off the public filter bar'
    );
  });

  test('the seeded categories the brief asks for can all be created', async () => {
    const names = [
      'Landlord Guides',
      'Tenant Guides',
      'How Goodlucks Homes Works',
      'Commission and Payments',
      'Rental Advice',
    ];
    for (const name of names) {
      const res = await admin.post('/api/admin/blog/categories', { name });
      assert.equal(res.status, 201, `${name}: ${JSON.stringify(res.body)}`);
    }
    const all = await admin.get('/api/admin/blog/categories');
    const slugs = all.body.categories.map((category) => category.slug);
    for (const expected of ['agent-training', 'landlord-guides', 'tenant-guides', 'how-goodlucks-homes-works', 'commission-and-payments', 'rental-advice']) {
      assert.ok(slugs.includes(expected), `${expected} should exist`);
    }
  });
});

/* ========================================================================== */
/* F. Email template integration                                              */
/* ========================================================================== */

describe('Blog: email templates link to published articles only', () => {
  let article;

  before(async () => {
    article = await createPost({
      title: 'Renting guide for email links',
      contentHtml: '<p>Everything a tenant should check.</p>',
    });
    await publish(article.id);
  });

  test('the template editor only offers published articles', async () => {
    const draft = await createPost({ title: 'Draft that must not be linkable' });

    const res = await admin.get('/api/admin/blog/published-for-links');
    assert.equal(res.status, 200);
    const slugs = res.body.posts.map((item) => item.slug);
    assert.ok(slugs.includes(article.slug), 'the published article is offered');
    assert.equal(slugs.includes(draft.slug), false, 'a draft is never offered');
    assert.match(res.body.posts.find((item) => item.slug === article.slug).url, /^https:\/\/goodlucks\.co\/blog\//);
  });

  test('a template with a published article link saves and reaches the real email', async () => {
    const created = await admin.post('/api/admin/email-templates', {
      name: 'Renting guide in enquiry replies',
      targetType: 'enquiry_confirmation',
      bodyHtml: `<p>Read our <a href="https://goodlucks.co/blog/${article.slug}">guide to renting in Ghana</a>.</p>`,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const template = created.body.template;
    assert.equal(template.needsAttention, false);
    assert.equal(template.links[0].status, 'published');

    // Trigger a real enquiry: the visitor confirmation email is the target.
    const enquiry = await guest.post('/api/enquiries', {
      name: 'Ama Mensah',
      email: uniqueEmail('enquiry'),
      phone: '+233201112223',
      message: 'Is this apartment still available?',
      source: 'property_page',
    });
    assert.ok([200, 201].includes(enquiry.status), JSON.stringify(enquiry.body));

    const outbox = fixture(['--outbox=12']);
    const confirmation = outbox.messages.find((message) => message.type === 'enquiry_confirmation');
    assert.ok(confirmation, 'the confirmation email was queued');
    assert.match(confirmation.body, new RegExp(`/blog/${article.slug}`), 'the article link is in the sent email');
    assert.match(confirmation.body, /guide to renting in Ghana/, 'the link text is the one the editor chose');
    // The email's own content is still there.
    assert.match(confirmation.body, /Ama/, 'the email still greets the recipient by name');

    state.templateId = template.id;
  });

  test('a template that links to a draft is refused', async () => {
    const draft = await createPost({ title: 'Not published yet', contentHtml: '<p>Secret.</p>' });
    const res = await admin.post('/api/admin/email-templates', {
      name: 'Broken link attempt',
      targetType: 'enquiry_confirmation',
      bodyHtml: `<p><a href="/blog/${draft.slug}">Read this</a></p>`,
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
    assert.match(res.body.error, /not published/i);
  });

  test('an article unpublished later is reported and the block is skipped, not sent broken', async () => {
    await admin.post(`/api/admin/blog/posts/${article.id}/status`, { status: 'unpublished' });

    const list = await admin.get('/api/admin/email-templates');
    const template = list.body.templates.find((item) => item.id === state.templateId);
    assert.equal(template.needsAttention, true, 'the editor is warned');
    assert.equal(template.brokenLinks[0].status, 'unpublished');

    const enquiry = await guest.post('/api/enquiries', {
      name: 'Kofi Boateng',
      email: uniqueEmail('enquiry2'),
      phone: '+233201112224',
      message: 'Second enquiry while the article is down.',
      source: 'contact_form',
    });
    assert.ok([200, 201].includes(enquiry.status), JSON.stringify(enquiry.body));

    const outbox = fixture(['--outbox=6']);
    const latest = outbox.messages.find((message) => message.type === 'enquiry_confirmation');
    assert.ok(latest, 'the email still went out');
    assert.equal(latest.body.includes(`/blog/${article.slug}`), false, 'the dead link was not appended');
    assert.match(latest.body, /Kofi/, 'the email itself is untouched');

    // Put it back for later tests.
    await admin.post(`/api/admin/blog/posts/${article.id}/status`, { status: 'published' });
  });

  test('a template cannot be edited into pointing at a draft', async () => {
    const draft = await createPost({ title: 'Still a draft' });
    const res = await admin.patch(`/api/admin/email-templates/${state.templateId}`, {
      bodyHtml: `<p><a href="/blog/${draft.slug}">draft link</a></p>`,
    });
    assert.equal(res.status, 422, JSON.stringify(res.body));
  });

  test('email template management is admin-only', async () => {
    for (const [label, client] of [['guest', guest], ['tenant', tenant], ['landlord', landlord]]) {
      const list = await client.get('/api/admin/email-templates');
      assert.ok([401, 403].includes(list.status), `${label} read ${list.status}`);
      const create = await client.post('/api/admin/email-templates', {
        name: 'x',
        targetType: 'enquiry_confirmation',
        bodyHtml: '<p>x</p>',
      });
      assert.ok([401, 403].includes(create.status), `${label} create ${create.status}`);
    }
  });

  test('the existing email pipeline still works with no template attached', async () => {
    const res = await admin.get('/api/admin/email-logs');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.logs));
    assert.ok(res.body.logs.length > 0, 'the emails sent above are logged');
    for (const log of res.body.logs.slice(0, 5)) {
      assert.ok(log.type, 'every log row still carries its type');
      assert.ok(log.subject, 'every log row still carries its subject');
    }
  });
});

/* ========================================================================== */
/* G. Console listing                                                          */
/* ========================================================================== */

describe('Blog: the console view', () => {
  test('the admin list shows every status with real counts', async () => {
    const res = await admin.get('/api/admin/blog/posts?perPage=100');
    assert.equal(res.status, 200);
    const statuses = new Set(res.body.posts.map((post) => post.status));
    assert.ok(statuses.size >= 2, 'the list is not filtered to one status');
    assert.equal(res.body.counts.total, res.body.posts.length);
    assert.ok(res.body.categories.length >= 6);

    const drafts = await admin.get('/api/admin/blog/posts?status=draft');
    assert.ok(drafts.body.posts.every((post) => post.status === 'draft'));
  });

  test('a draft is readable in the console for editing and preview', async () => {
    const post = await createPost({ title: 'Console draft', contentHtml: '<p>Only the console sees this.</p>' });
    const res = await admin.get(`/api/admin/blog/posts/${post.id}`);
    assert.equal(res.status, 200);
    assert.match(res.body.post.contentHtml, /Only the console sees this/);
    assert.equal(res.body.post.publicUrl, `https://goodlucks.co/blog/${post.slug}`);
  });
});
