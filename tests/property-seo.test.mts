/**
 * Property URLs, social-share metadata and the sitemap — end-to-end tests.
 *
 * These tests talk to the real PHP backend over HTTP and read the **raw HTML**
 * that the server returns, not what a browser would show after React runs. That
 * is the only way to prove the thing this task is about: WhatsApp, Facebook, X
 * and LinkedIn receive the listing's own title, price, location and photograph
 * in the first response.
 *
 * Covered:
 *   - `/property/{title}-{location}-{id}` returns 200 with property metadata
 *   - `/property/{id}` and stale slugs 301 to the canonical URL (query kept)
 *   - unknown / unpublished listings return 404 and `noindex`
 *   - the main photograph is used, with the site default when there is none
 *   - the sitemap lists canonical property URLs only, with no duplicates
 *   - PHP and TypeScript build identical slugs (parity against the fixtures)
 *
 *   npm run test:property
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { startApiServer, runPhpScript } from '../scripts/php.mjs';
import { ApiClient } from './helpers.mjs';
import {
  moneyLabel,
  propertyCanonicalUrl,
  propertyMainImage,
  propertyPath,
  propertyShareDescription,
  propertySlug,
} from '../src/routing/propertyUrl.ts';

const projectRoot = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(projectRoot, '.data');
const dbPath = path.join(dataDir, `property-seo-${process.pid}-${Date.now()}.sqlite`);
const port = 8300 + Math.floor(Math.random() * 500);

// The configured base URL for this run. Everything the server emits — canonical,
// og:url, og:image, sitemap — must be built from it, which is exactly how the
// testing domain and the permanent domain differ in production.
const APP_URL = 'https://goodlucks.test';
const ADMIN_EMAIL = 'seo-admin@test.local';
const ADMIN_PASSWORD = 'Seo-Admin-Password-123';
const ADMIN_ACCESS_KEY = 'test-access-key';

let server;
let baseUrl;
let admin;
let guest;
const state: Record<string, any> = { main: null, noImage: null };

/** The `<meta>` / `<link>` content for `name` or `property`. */
function metaContent(html, key) {
  const attribute = key.startsWith('og:') || key.startsWith('article:') ? 'property' : 'name';
  const match = new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="([^"]*)"`, 'i').exec(html);
  return match ? match[1] : null;
}

/** Count how many times a tag with this name/property appears (duplicates = bug). */
function metaCount(html, key) {
  const attribute = key.startsWith('og:') ? 'property' : 'name';
  return (html.match(new RegExp(`<meta\\s+${attribute}="${key}"`, 'gi')) || []).length;
}

function canonicalHref(html) {
  const match = /<link\s+rel="canonical"\s+href="([^"]*)"/i.exec(html);
  return match ? match[1] : null;
}

function titleTag(html) {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return match ? match[1] : null;
}

const uniqueTitle = (suffix) => `Harbour View ${suffix} Apartment`;

async function createProperty(property) {
  const res = await admin.post('/api/properties', {
    city: 'Accra',
    propertyType: 'Apartment',
    bedrooms: 2,
    bathrooms: 2,
    description: 'Listing created by the property SEO test suite.',
    amenities: ['Standby generator'],
    status: 'active',
    ...property,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.property;
}

before(async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }

  const env = {
    DB_DRIVER: 'sqlite',
    DB_SQLITE_PATH: dbPath,
    APP_ENV: 'development',
    APP_URL,
    ADMIN_ACCESS_KEY,
    EMAIL_TRANSPORT: 'none',
    REGISTER_RATE_LIMIT_PER_HOUR: '60',
    PROPERTY_RATE_LIMIT_PER_HOUR: '200',
    PROPERTY_CREATE_RATE_LIMIT_PER_HOUR: '200',
    IDENTITY_DATA_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  state.testEnv = env;
  server = await startApiServer({ port, env, quiet: true });
  baseUrl = server.baseUrl;

  const bootstrap = runPhpScript(
    'php-backend/admin_bootstrap.php',
    [`--email=${ADMIN_EMAIL}`, `--password=${ADMIN_PASSWORD}`, '--name=SEO Admin'],
    env
  );
  assert.equal(bootstrap.status, 0, `admin bootstrap failed: ${bootstrap.stdout} ${bootstrap.stderr}`);

  admin = new ApiClient(baseUrl);
  guest = new ApiClient(baseUrl);
  // Administrators sign in through the console endpoint (email + password +
  // access key); the public login form refuses them by design.
  const login = await admin.post('/api/auth/admin-login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    accessKey: ADMIN_ACCESS_KEY,
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));

  // A listing with a real photograph path (as the uploader stores it).
  state.main = await createProperty({
    title: uniqueTitle('Main'),
    location: 'East Legon',
    rentGhs: 4500,
    images: ['/api/uploads/gl-20260101-abcdef0123456789.jpg', '/api/uploads/second.jpg'],
  });

  // A listing whose photograph is already a full https URL (a landlord who
  // hosted it themselves): it must be used unchanged, not prefixed twice.
  state.absoluteImage = await createProperty({
    title: 'Hosted Elsewhere Apartment',
    location: 'Cantonments',
    rentGhs: 7000,
    images: ['https://cdn.example.com/listing/main.jpg'],
  });

  // Two listings whose titles are almost identical: the id, not the words,
  // decides which listing a URL points at.
  state.twinA = await createProperty({
    title: 'Cedar Court Apartment',
    location: 'Osu',
    rentGhs: 3200,
    images: ['/api/uploads/cedar-a.jpg'],
  });
  state.twinB = await createProperty({
    title: 'Cedar Court Apartment',
    location: 'Osu',
    rentGhs: 3300,
    images: ['/api/uploads/cedar-b.jpg'],
  });

  // A listing with no photograph at all (legacy data — the API refuses to create
  // one) → the site default image must be used.
  state.noImage = await createProperty({
    title: 'Legacy Listing Without Photo',
    location: 'Labone',
    rentGhs: 1800,
    images: ['/api/uploads/temporary.jpg'],
  });
  const blanked = runPhpScript('tests/blank-property-images.php', [`--id=${state.noImage.id}`], env);
  assert.equal(blanked.status, 0, blanked.stdout + blanked.stderr);
});

after(() => {
  server?.stop();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
});

/* -------------------------------------------------------------------------- */
/* Slugs                                                                      */
/* -------------------------------------------------------------------------- */

describe('Descriptive property URLs', () => {
  test('the slug is {title}-{location}-{id} and the id is the identifier', () => {
    assert.equal(
      propertySlug({ id: 'prop-1', title: '3-Bedroom Apartment in East Legon', location: 'East Legon' }),
      '3-bedroom-apartment-east-legon-prop-1',
      'the shape the brief asks for, word for word'
    );
    // Redundant location words are not repeated.
    assert.ok(propertySlug({ id: 'prop-1', title: '3-Bedroom Apartment in East Legon', location: 'East Legon' })
      .startsWith('3-bedroom-apartment-east-legon-'));
    // Special characters, punctuation and accents all collapse; the connector
    // "and" is a stopword, so it does not survive into the URL.
    assert.equal(
      propertySlug({ id: 'prop-9', title: '  Café   "Résidence" & Suites!! ', location: 'Airport Residential Area' }),
      'cafe-residence-suites-airport-residential-area-prop-9'
    );
    // An id always terminates the slug, so the id can always be recovered.
    assert.ok(propertySlug({ id: 'prop-9', title: 'Anything', location: 'Anywhere' }).endsWith('-prop-9'));
  });

  test('similar titles never collide — the id keeps them apart', () => {
    assert.equal(propertySlug({ id: state.twinA.id, title: state.twinA.title, location: state.twinA.location }),
      propertySlug({ id: state.twinB.id, title: state.twinB.title, location: state.twinB.location }).replace(state.twinB.id, state.twinA.id));
    assert.notEqual(propertyPath(state.twinA), propertyPath(state.twinB));
    assert.ok(propertyPath(state.twinA).endsWith(`-${state.twinA.id}`));
    assert.ok(propertyPath(state.twinB).endsWith(`-${state.twinB.id}`));
  });

  test('the API payload carries the canonical URL for every listing', async () => {
    const res = await guest.get('/api/properties?perPage=50');
    assert.equal(res.status, 200);
    const found = res.body.properties.find((p) => p.id === state.main.id);
    assert.ok(found, 'the listing we created must be in the catalogue');
    assert.equal(found.path, propertyPath(found));
    assert.equal(found.slug, propertySlug(found));
    assert.equal(found.url, `${APP_URL}${propertyPath(found)}`);
  });

  test('the API resolves a descriptive slug as well as a bare id', async () => {
    const byId = await guest.get(`/api/properties/${state.main.id}`);
    assert.equal(byId.status, 200);

    const slug = propertySlug(state.main);
    const bySlug = await guest.get(`/api/properties/${slug}`);
    assert.equal(bySlug.status, 200);
    assert.equal(bySlug.body.property.id, state.main.id);
    assert.equal(bySlug.body.property.title, state.main.title);

    // A slug belonging to nobody is a 404, not another listing.
    const missing = await guest.get(`/api/properties/not-a-real-listing-prop-zzz`);
    assert.equal(missing.status, 404);
  });
});

/* -------------------------------------------------------------------------- */
/* Server-rendered metadata                                                   */
/* -------------------------------------------------------------------------- */

describe('Property social preview (raw HTML, no JavaScript)', () => {
  test('the initial HTML carries the property’s own title, price, location and photo', async () => {
    const slug = propertySlug(state.main);
    const res = await guest.request('GET', `/property/${slug}`, { raw: true });
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.equal(metaContent(html, 'og:title'), state.main.title);
    assert.equal(
      metaContent(html, 'og:description'),
      `GH₵ 4,500/month · East Legon, Accra`,
      'price, period and location on one line — nothing else'
    );
    assert.equal(metaContent(html, 'og:url'), `${APP_URL}/property/${slug}`);
    assert.equal(metaContent(html, 'og:image'), `${APP_URL}/api/uploads/gl-20260101-abcdef0123456789.jpg`);
    assert.equal(metaContent(html, 'og:type'), 'website');
    assert.equal(metaContent(html, 'og:site_name'), 'Goodlucks Homes');

    assert.equal(metaContent(html, 'twitter:card'), 'summary_large_image');
    assert.equal(metaContent(html, 'twitter:title'), state.main.title);
    assert.equal(metaContent(html, 'twitter:description'), 'GH₵ 4,500/month · East Legon, Accra');
    assert.equal(metaContent(html, 'twitter:image'), `${APP_URL}/api/uploads/gl-20260101-abcdef0123456789.jpg`);

    assert.equal(canonicalHref(html), `${APP_URL}/property/${slug}`);
    assert.match(titleTag(html) ?? '', new RegExp(state.main.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('the response contains exactly one of each share tag', async () => {
    const res = await guest.request('GET', `/property/${propertySlug(state.main)}`, { raw: true });
    const html = await res.text();
    for (const key of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:title', 'twitter:image']) {
      assert.equal(metaCount(html, key), 1, `${key} must appear once, not be duplicated`);
    }
    assert.equal((html.match(/rel="canonical"/gi) || []).length, 1, 'one canonical tag');
    assert.equal((html.match(/<title>/gi) || []).length, 1, 'one title tag');
    // The generic site description must have been replaced, not appended.
    assert.ok(!/Goo?dlucks Homes - Rentals & Real Estate/.test(metaContent(html, 'og:title') ?? ''));
  });

  test('another listing gets its own metadata — never a copy of the first', async () => {
    const res = await guest.request('GET', `/property/${propertySlug(state.twinB)}`, { raw: true });
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.equal(metaContent(html, 'og:title'), state.twinB.title);
    assert.equal(metaContent(html, 'og:description'), 'GH₵ 3,300/month · Osu, Accra');
    assert.equal(metaContent(html, 'og:url'), `${APP_URL}/property/${propertySlug(state.twinB)}`);
    assert.ok(!html.includes(state.twinA.id), 'listing B must not mention listing A');
    assert.ok(!html.includes(String(state.main.id)));
  });

  test('a listing with no photograph falls back to the site default image', async () => {
    const res = await guest.request('GET', `/property/${propertySlug(state.noImage)}`, { raw: true });
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.equal(metaContent(html, 'og:image'), `${APP_URL}/og-image.jpg`);
    assert.equal(metaContent(html, 'twitter:image'), `${APP_URL}/og-image.jpg`);
  });

  test('a photograph hosted on another domain is used unchanged', async () => {
    const res = await guest.request('GET', `/property/${propertySlug(state.absoluteImage)}`, { raw: true });
    const html = await res.text();
    assert.equal(res.status, 200);
    // Never double-prefixed with the site URL, and never swapped for the default.
    assert.equal(metaContent(html, 'og:image'), 'https://cdn.example.com/listing/main.jpg');
  });

  test('nothing private or relative can leak into the share card', async () => {
    const res = await guest.request('GET', `/property/${propertySlug(state.main)}`, { raw: true });
    const html = await res.text();
    assert.ok(!html.includes('storage/private'), 'the private document store is never referenced');
    assert.ok(!/og:image"\s+content="\/api\//.test(html), 'og:image must be absolute, never site-relative');
  });
});

/* -------------------------------------------------------------------------- */
/* Canonical redirects                                                        */
/* -------------------------------------------------------------------------- */

describe('Old URLs redirect to the canonical URL', () => {
  test('/property/{id} redirects 301 to the descriptive URL', async () => {
    const res = await guest.request('GET', `/property/${state.main.id}`, { raw: true });
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), propertyPath(state.main));
  });

  test('a stale slug redirects 301 to the current one, keeping the query', async () => {
    // Retitle the listing: the slug changes, the id does not.
    const retitled = await admin.put(`/api/properties/${state.main.id}`, {
      title: 'Harbour View Renamed Apartment',
      location: 'East Legon',
      rentGhs: 4500,
      images: state.main.images,
      description: state.main.description,
    });
    assert.equal(retitled.status, 200, JSON.stringify(retitled.body));
    const currentSlug = propertySlug(retitled.body.property);
    assert.notEqual(currentSlug, propertySlug(state.main));

    const oldSlug = propertySlug(state.main);
    const res = await guest.request('GET', `/property/${oldSlug}?utm_source=whatsapp&utm_medium=chat`, { raw: true });
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), `${propertyPath(retitled.body.property)}?utm_source=whatsapp&utm_medium=chat`);

    // The canonical URL itself is served, not redirected again.
    const direct = await guest.request('GET', propertyPath(retitled.body.property), { raw: true });
    assert.equal(direct.status, 200);
  });

  test('an unknown listing is a real 404 and is not indexed', async () => {
    const res = await guest.request('GET', '/property/removed-listing-prop-zzzz', { raw: true });
    assert.equal(res.status, 404);
    const html = await res.text();
    assert.equal(metaContent(html, 'robots'), 'noindex, follow');
    assert.match(titleTag(html) ?? '', /not available/i);
    // It must not borrow another listing's image or title.
    assert.equal(metaContent(html, 'og:image'), `${APP_URL}/og-image.jpg`);
  });

  test('an unpublished listing is not previewed', async () => {
    const pending = await createProperty({
      title: 'Pending Review Apartment',
      location: 'Spintex',
      rentGhs: 2500,
      images: ['/api/uploads/pending.jpg'],
      status: 'pending',
    });
    const res = await guest.request('GET', `/property/${propertySlug(pending)}`, { raw: true });
    assert.equal(res.status, 404);
  });
});

/* -------------------------------------------------------------------------- */
/* Sitemap                                                                    */
/* -------------------------------------------------------------------------- */

describe('Sitemap uses the canonical property URLs', () => {
  test('published listings appear once, in canonical form', async () => {
    const res = await guest.request('GET', '/sitemap.xml', { raw: true });
    assert.equal(res.status, 200);
    const xml = await res.text();

    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.ok(locations.length > 0);

    // Every property URL is the descriptive form and ends in its own id.
    const propertyUrls = locations.filter((url) => url.includes('/property/'));
    assert.ok(propertyUrls.length >= 3);
    for (const url of propertyUrls) {
      const slug = url.split('/property/')[1];
      assert.match(slug, /-[A-Za-z0-9_-]+$/, `${slug} must end with a property id`);
      assert.ok(slug.includes('-'), `${slug} must be descriptive, not a bare id`);
    }

    // No duplicates, in any form.
    assert.equal(new Set(locations).size, locations.length, 'no duplicate <loc> entries');

    // A pending listing is excluded.
    assert.ok(!xml.includes('pending-review-apartment'), 'unpublished listings stay out of the sitemap');
    // Core pages are still there.
    for (const page of ['/properties', '/about', '/contact', '/blog']) {
      assert.ok(locations.includes(`${APP_URL}${page}`), `${page} is still listed`);
    }
  });

  test('requesting the bare id URL never appears in the sitemap', async () => {
    const res = await guest.request('GET', '/sitemap.xml', { raw: true });
    const xml = await res.text();
    for (const property of [state.main, state.twinA, state.twinB]) {
      assert.ok(!new RegExp(`<loc>[^<]+/property/${property.id}</loc>`).test(xml), 'id-only URL must not be listed');
    }
  });
});

/* -------------------------------------------------------------------------- */
/* PHP / TypeScript parity                                                    */
/* -------------------------------------------------------------------------- */

describe('The server and the browser agree on every slug', () => {
  test('PHP and TypeScript produce identical slugs, descriptions and images', () => {
    const fixtures = [
      { id: 'prop-1', title: '3-Bedroom Apartment in East Legon', location: 'East Legon', city: 'Accra', rent_ghs: 4500, images: ['/api/uploads/a.jpg'] },
      { id: 'prop-10', title: 'Café "Résidence" & Suites!!', location: 'Airport Residential Area', city: 'Accra', rent_ghs: 6500.5, images: [] },
      { id: 'prop-2b', title: 'THE  Pearl — Executive', location: 'Cantonments', city: 'Accra', rent_ghs: 9000, images: ['https://cdn.example.com/x.jpg'] },
      { id: 'x-9', title: 'A', location: '', city: 'Kumasi', rent_ghs: 1200, images: ['../secret.jpg'] },
      { id: 'weird--id', title: 'Studio / Self-contained', location: 'Osu', city: 'Accra', rent_ghs: 0, images: [] },
    ];

    const fixtureFile = path.join(os.tmpdir(), `property-slug-${process.pid}.json`);
    fs.writeFileSync(fixtureFile, JSON.stringify(fixtures));
    const result = runPhpScript('tests/property-slug.php', [fixtureFile], state.testEnv);
    fs.rmSync(fixtureFile, { force: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);

    const phpRows = JSON.parse(result.stdout);
    assert.equal(phpRows.length, fixtures.length);

    for (const [index, fixture] of fixtures.entries()) {
      const php = phpRows[index];
      const tsProperty = {
        id: fixture.id,
        title: fixture.title,
        location: fixture.location,
        city: fixture.city,
        rentGhs: fixture.rent_ghs,
        images: fixture.images,
      };

      assert.equal(php.slug, propertySlug(tsProperty), `slug differs for ${fixture.id}`);
      assert.equal(php.path, propertyPath(tsProperty), `path differs for ${fixture.id}`);
      // The server builds the absolute URL from its configured base URL
      // (APP_URL); the browser builds it from its own configured origin. The
      // path is what must match — and the host must be the configured one.
      assert.equal(php.url, `${APP_URL}${propertyPath(tsProperty)}`, `url differs for ${fixture.id}`);
      assert.ok(
        propertyCanonicalUrl(tsProperty).endsWith(propertyPath(tsProperty)),
        `the browser's absolute URL must end in the same path (${fixture.id})`
      );
      assert.equal(php.description, propertyShareDescription(tsProperty), `description differs for ${fixture.id}`);
      // Same reasoning as the URL: the browser resolves a relative upload path
      // against its configured origin, the server against APP_URL. The *path*,
      // and whether the image is absolute already, must agree.
      const tsImage = propertyMainImage(tsProperty);
      const firstImage = fixture.images[0] ?? '';
      if (/^https?:\/\//i.test(firstImage)) {
        assert.equal(php.image, firstImage, `absolute image must be used unchanged (${fixture.id})`);
        assert.equal(php.image, tsImage, `image differs for ${fixture.id}`);
      } else if (firstImage && !firstImage.includes('..')) {
        assert.equal(php.image, `${APP_URL}${firstImage}`, `relative image must be absolute (${fixture.id})`);
        assert.ok(tsImage.endsWith(firstImage), `the browser must use the same path (${fixture.id})`);
      } else {
        assert.equal(php.image, `${APP_URL}/og-image.jpg`, `fallback image expected (${fixture.id})`);
        assert.ok(tsImage.endsWith('/og-image.jpg'), `the browser must fall back too (${fixture.id})`);
      }
      assert.equal(php.title, fixture.title.trim());
    }
  });

  test('money is formatted the same way on both sides', () => {
    assert.equal(moneyLabel(4500), 'GH₵ 4,500');
    assert.equal(moneyLabel(6500.5), 'GH₵ 6,500.50');
    assert.equal(moneyLabel(0), 'GH₵ 0');
    assert.equal(moneyLabel(1250000), 'GH₵ 1,250,000');

    const fixtureFile = path.join(os.tmpdir(), `property-money-${process.pid}.json`);
    fs.writeFileSync(
      fixtureFile,
      JSON.stringify([
        { id: 'p1', title: 'A', location: 'Osu', city: 'Accra', rent_ghs: 4500, images: [] },
        { id: 'p2', title: 'B', location: 'Osu', city: 'Accra', rent_ghs: 6500.5, images: [] },
        { id: 'p3', title: 'C', location: 'Osu', city: 'Accra', rent_ghs: 1250000, images: [] },
      ])
    );
    const result = runPhpScript('tests/property-slug.php', [fixtureFile], state.testEnv);
    fs.rmSync(fixtureFile, { force: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const rows = JSON.parse(result.stdout);
    assert.equal(rows[0].description, 'GH₵ 4,500/month · Osu, Accra');
    assert.equal(rows[1].description, 'GH₵ 6,500.50/month · Osu, Accra');
    assert.equal(rows[2].description, 'GH₵ 1,250,000/month · Osu, Accra');
  });
});
