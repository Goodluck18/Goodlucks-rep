# Technical corrections, security fixes and property URL / social sharing

**Date:** 2026-11-06
**Branch:** `arena/77e46f19-goodlucks-rep` (not merged to `main`)
> **Domain update (2026-11-07).** The official domain is now **`goodlucks.co`**
> (previously `rent.goodlucks.co`). The configuration described in this report —
> `APP_URL` / `SITE_URL` / `VITE_SITE_URL` — is unchanged; only the default value
> moved. See `docs/TASK_SHARE_AS_IMAGE_2026-11-07.md`.

**Scope:** the eight corrections in the brief. No redesign, no new features, no
dependency or infrastructure changes, no DNS / email / hosting changes.

Companion document: `docs/LIVE_SITE_AUDIT_2026-11-06.md` (what the live site at
`goodlucks.net` actually served before this work — that audit is the "before"
evidence for corrections 3, 4, 6 and 7).

---

## 0. Bottom line

| # | Correction | State | Evidence |
|---|-----------|-------|----------|
| 1 | Rent requests are tenant-only (server-checked) | Done | `tests/access-control.test.mjs` (role matrix), `tests/api.test.mjs` |
| 2 | Public receipts access removed | Done | `tests/access-control.test.mjs` (401/403/200), `tests/app-navigation.test.mts`, `tests/routing.test.mts` |
| 3 | Property Open Graph/Twitter metadata in the initial HTML | Done | `tests/property-seo.test.mts`, built-site `curl` run (below) |
| 4 | Descriptive `/property/{title}-{location}-{id}` + 301 from old URLs | Done | `tests/property-slug.php`, `tests/routing.test.mts`, built-site `curl` run |
| 5 | Main-property-image selection verified independently | Done | `tests/property-seo.test.mts` (fixture with blank / blanked / duplicate images) |
| 6 | All sharing uses the canonical URL and the real title | Done | code + `tests/property-seo.test.mts` URL parity assertions |
| 7 | Sitemap and internal links use canonical URLs, no duplicates | Done | `tests/api.test.mjs` (sitemap), `tests/routing.test.mts` |
| 8 | Verification | Done — see §7, including what was **not** verified |

Database schema: **unchanged**. Every correction reuses existing tables and
columns; no migration is needed and none was added. Existing properties, rent
requests and receipts are untouched.

---

## 1. What was wrong, and what changed

### Correction 1 — rent requests were open to any signed-in role

**What was wrong.** `POST /api/rental-requests` (the "Find a home" matching
request) was reachable by any authenticated user. Nothing on the server looked at
the caller's role, so a landlord, an agent or an administrator could create a
tenant matching request by posting the endpoint directly — the role was only
enforced by which screen the UI happened to show. A guest was rejected, but for
the wrong reason (no session) rather than an explicit role rule.

**What changed.**

* `php-backend/lib/api.php` — the handler now calls
  `require_auth(['tenant'])`; the role comes from the user row loaded from the
  session, never from the request body. A `role` in the body is ignored.
* `php-backend/config.php` — the per-IP limit is now a named, configurable value:
  `TENANT_REQUEST_RATE_LIMIT_PER_HOUR` (default `10`, unchanged behaviour).
  Environment overrides it; the test harness sets it to `200` so a long suite
  cannot rate-limit itself.
* `src/components/FindAHomeView.tsx` — the form is hidden for anyone who is not a
  tenant, with role-appropriate copy (landlord / agent / administrator), and the
  submit handler refuses to send as a second line of defence.
* Existing rent requests and their records are read and written exactly as
  before; nothing was deleted or migrated.

Result: tenant → `201`; landlord / agent / admin → `403`; guest → `401`; a forged
`role: "tenant"` in the body from a landlord still → `403` and no row is written.

### Correction 2 — receipts were public

**What was wrong.** `Receipts` was a public navigation entry (desktop and mobile
hamburger), `/receipts` was a public route, and the receipt API endpoints did not
require a session. Anyone with the URL reached the receipts screen.

**What changed.**

* `src/navigation/navModel.ts` — the public nav entry is gone from both the
  desktop list and the mobile menu.
* `src/routing/routes.ts` — `/receipts` now requires a session: a guest is sent to
  `/login?next=%2Freceipts`, so they come back where they intended.
* `src/context/AppContext.tsx`, `src/components/ReceiptsView.tsx` — the screen is
  only rendered for a signed-in user.
* `php-backend/lib/api.php` — `GET /receipts`, `POST /receipts` and
  `GET /receipts/{id}` all require authentication; a guest gets `401`, a role
  without access gets `403`.
* The receipt *handlers themselves* were not touched: tenants, landlords,
  administrators and the counterparty of a record keep exactly the access they
  had, and every existing row is still readable by its parties.

### Correction 3 — the shared link showed a generic card

**What was wrong.** The site is a single-page application, so every URL returned
the same `index.html`. A property's title, price, photograph and canonical URL
were only added to the document by JavaScript, which WhatsApp, Facebook, X,
LinkedIn, Slack and search crawlers do not run. The live audit recorded the
consequence: `/properties` and `/blog` returned the identical 1106-byte shell
with `canonical: null` and `ogimg: null`, and a shared listing fell back to the
generic site card (or no image at all).

**What changed.** New `php-backend/property_page.php` + `php-backend/lib/property_url.php`
render the `<head>` on the server:

* `og:title`, `og:description`, `og:image`, `og:url`, `og:type`
  (`real_estate:property`), `og:site_name`, `og:locale` (`en_GH`);
* `twitter:card` = `summary_large_image` plus `twitter:title`,
  `twitter:description`, `twitter:image`;
* `<link rel="canonical">` and a `<title>` carrying the listing's own title;
* `<meta name="robots" content="noindex, follow">` on the 404 path.

Values: title = the listing title; description = `GH₵ 6,500/month · Cantonments, Accra`
(actual price, actual period, actual location, never `Accra, Accra`); image = the
listing's main photograph (see correction 5) falling back to the existing
`/og-image.jpg`; canonical = the configured base URL + the canonical path.

The document is then handed to the unchanged React app, which renders the page
for human visitors. `src/components/SEOHead.tsx` was aligned so the client keeps
the same canonical URL and the same first-image choice when it re-writes tags
during navigation.

Domain handling: every URL is derived from the configured base URL
(`APP_URL` → `SITE_URL` in PHP, `src/config/site.ts` for the client). Nothing is
hardcoded, so `APP_URL=https://goodlucks.net` and
`APP_URL=https://rent.goodlucks.co` both produce correct metadata with no code
change and no rebuild. `index.html` keeps the permanent domain only as the
static fallback for pages that do not compute their own metadata.

### Correction 4 — property URLs were bare ids

**What was wrong.** `/property/prop-1` carries no meaning for a person reading
the link, a chat preview or a search result, and an id-only URL is what got
shared.

**What changed.** Canonical form `/property/{title}-{location}-{id}`, e.g.
`/property/pearl-executive-3-bedroom-apartment-cantonments-accra-prop-1`:

* lowercase, hyphens, accents transliterated via an explicit map (no `iconv`
  dependency), stopwords removed, `&` → `and`;
* the location is appended only when it is not already in the title;
* the **id suffix is the identifier** — resolution always matches on the id, so
  the words in front can change without breaking a link;
* `/property/prop-1` and any stale slug answer `301` to the current canonical
  URL, preserving the query string (`?utm_source=…`, `?ref=…` keep working);
* unknown or unpublished listing → `404` + `noindex, follow`;
* the client replaces the address bar with the canonical path (no history entry)
  so copying from a page that was reached by an old URL still yields the
  canonical one.

Server routing: `public/.htaccess` rule `2c` and `php-backend/router.php` send
`/property/<segment>` to `api/property_page.php`; the router used by the tests
and the dev server does the same.

### Correction 5 — which photograph is "the" image

**What was wrong / at risk.** Nothing selected the main image for metadata; the
JSON-LD used the raw stored paths and the client used `images[0]` unchecked, so a
blank first entry, a protocol-relative path or a traversal-looking value could
produce a broken or unwanted card, and mixing up rows would leak another
listing's photograph.

**What changed.** One function, used by the server and mirrored in
`src/routing/propertyUrl.ts`:

* it reads only the row it was given (the fixture suite plants a second listing
  and asserts the first listing's image and URL never appear in the other's
  metadata → no cross-property leakage);
* the first usable entry wins; empty strings, non-strings, `//`-prefixed and
  `..`-containing values are skipped;
* absolute `http(s)` values are kept as-is, relative values are made absolute
  against the configured base URL;
* if nothing is usable, the existing default social image is used. No overlay
  text or logo is drawn on the photograph.

### Correction 6 — sharing

**What was wrong.** The share button used `window.location.href` — which could
still be an old id URL, a URL with someone else's tracking parameters, or the
current host — and the text hardcoded a price string.

**What changed.** `src/components/PropertyDetailView.tsx`: Web Share, the
clipboard fallback and the WhatsApp enquiry text all use
`propertyCanonicalUrl(property)` and the listing's real title / price / location.
The canonical URL is built from the configured base URL, so the shared link is
correct on both the testing and the permanent domain. Tracking parameters a
visitor arrives with survive the canonical redirect and the client-side URL
replacement, so attribution is not lost.

### Correction 7 — sitemap and internal links

**What was wrong.** The sitemap and internal links pointed at
`/property/<id>` (and the sitemap could list a listing twice: once under the old
id URL and once under the new one).

**What changed.** `php-backend/lib/repository.php` returns `slug`, `path` and
`url` on every shaped property and builds `sitemap.xml` from the canonical
`path`; listings that are not public (unpublished / removed) are excluded.
`src/components/{PropertyCard,BrowseView,HomeView}.tsx` and the property detail
view navigate to the canonical path. The sitemap test asserts the old bare-id
URL never appears and that a published listing appears exactly once.

---

## 2. Files

**New**

| File | Purpose |
|---|---|
| `php-backend/property_page.php` | `/property/…` entry point: resolve, 301, 404, inject server-side metadata, return the SPA shell |
| `php-backend/lib/property_url.php` | slug / canonical path / resolve / share description / main image / meta HTML |
| `src/routing/propertyUrl.ts` | TypeScript mirror of the same helpers (client) |
| `src/vite-env.d.ts` | typing for `VITE_SITE_URL` |
| `tests/property-slug.php`, `tests/property-seo.test.mts` | slug rules + raw-HTML metadata suite (18 tests) |
| `tests/access-control.test.mjs` | corrections 1 and 2 (13 tests, own PHP server / DB) |
| `tests/blank-property-images.php` | fixture helper: blank a listing's images |

**Changed**

`php-backend/config.php`, `php-backend/lib/api.php`, `php-backend/lib/repository.php`,
`php-backend/router.php`, `php-backend/.env.example`, `public/.htaccess`,
`index.html` (comment only), `src/config/site.ts`, `src/routing/routes.ts`,
`src/navigation/navModel.ts`, `src/context/AppContext.tsx`,
`src/components/PropertyDetailView.tsx`, `PropertyCard.tsx`, `BrowseView.tsx`,
`HomeView.tsx`, `SEOHead.tsx`, `ReceiptsView.tsx`, `FindAHomeView.tsx`,
`tests/api.test.mjs`, `tests/routing.test.mts`, `tests/app-navigation.test.mts`,
`package.json`, `.github/workflows/ci.yml`, `CPANEL_DEPLOYMENT_GUIDE.md`, this report.

---

## 3. Database changes

**None.** No table, column or index was added, changed or removed, so there is
nothing to apply through phpMyAdmin and `database.sql` must not be re-imported.
All eight corrections read and write the tables that already exist
(`properties`, `rental_requests`, `receipts`, `users`, …). Row ids are unchanged
and no data was deleted.

One **configuration** value was added (not a database change):

```ini
# api/.env — optional, default 10
TENANT_REQUEST_RATE_LIMIT_PER_HOUR=10
```

---

## 4. Tests

| Command | Result |
|---|---|
| `npm run test:api` (6 files, includes access-control) | **279 / 279 pass** |
| `npm run test:access` | **13 / 13 pass** |
| `npm run test:property` | **18 / 18 pass** |
| `npm run test:routing` | **49 / 49 pass** |
| `npm run test:navigation` | **57 / 57 pass** |
| `npm run test:content` | 4 / 4 pass |
| `npm run test:blog` | 35 / 35 pass |
| `npm run test:design` | 14 / 14 pass |
| `npm run test:email-footer` | 3 / 3 pass |
| `node --test tests/migration.test.mjs` (migration/backfill; MySQL parts checked statically) | 14 / 14 pass |
| `npm run lint` (`tsc --noEmit`) | clean |
| `npm run build` | succeeds |

Correction 1 assertions: tenant `201`; landlord `403`; agent `403`; admin `403`;
guest `401`; a body-supplied `role` ignored; no record written on rejection; an
existing tenant request is still readable and editable by its owner.

Correction 2 assertions: guest `401` on list / read / create; an agent `403`;
tenant, landlord, admin and the counterparty `200`; `issuingEnabled:false` for a
role that may not issue; a receipt planted directly in the database before the
change is still readable after it.

Correction 3–7 assertions: slug rules (length cap, stopwords, accents, `&`,
id-suffix resolution, unique-per-listing); 301 from the bare id and from a stale
slug while keeping the query string; 404 + `noindex` for an unknown or
unpublished listing; exactly one `<title>`, canonical, the seven `og:*` tags,
`twitter:card=summary_large_image` and the three twitter tags in the raw
response; image is absolute, belongs to the listing, falls back to
`/og-image.jpg` when blank; server and client helpers agree on path, URL and
image; sitemap contains canonical URLs only and no duplicates.

### A failure found and fixed during verification

The full `test:api` run failed once at "a rollback leaves no partial financial
records behind" (`fetch failed` after ~306 s), while passing standalone. The
cause was the PHP test server being saturated by the role-matrix block sharing a
process with the rest of `api.test.mjs`: that block registers five users and
issues a burst of requests, on top of a 4–7 minute suite. The block was moved to
its own file with its own server and database (`tests/access-control.test.mjs`);
the same full run now completes with 279/279 in ~259 s and the failure has not
recurred.

---

## 5. Raw-HTML verification against a built site

`npm run build` output plus `php-backend/` as `dist/api/` were served through a
router that mimics `public/.htaccess` rule `2c`, and checked with `curl` (no
browser, no JavaScript — this is what a crawler sees):

* `/property/prop-1` → `301` with `Location: /property/pearl-executive-3-bedroom-apartment-cantonments-accra-prop-1`
* the canonical URL → `200`, `Cache-Control: no-cache, must-revalidate`, exactly
  one `<title>`, one canonical link, `og:title/description/image/url/type/site_name/locale`,
  `twitter:card=summary_large_image`, and the app's script tag still present
  (so a human gets the React page).
* the `og:image` value is the listing's own photograph on the configured domain
  (absolute, public).
* `/sitemap.xml` lists canonical property URLs on the configured domain.
* an unknown property slug → `404` with `noindex, follow`.

---

## 6. Configuration and manual steps

Nothing here was deployed. Everything below is what an operator does on the
server, in this order.

1. **Deploy** `dist/*` (except `server.cjs*`) to `public_html/`, `public/.htaccess`
   to `public_html/.htaccess`, and the whole `php-backend/` folder to
   `public_html/api/` — `property_page.php` and `lib/property_url.php` are inside
   that folder, so the existing upload step covers them. No migration to run.
2. **Set the base URL** in `public_html/api/.env`:
   * testing: `APP_URL=https://goodlucks.net`
   * permanent: `APP_URL=https://rent.goodlucks.co`
   This one value drives canonical URLs, share cards, the sitemap and alert
   emails. (Optional `VITE_SITE_URL` only matters if you rebuild the frontend for
   a different origin.)
3. **Confirm the server sees a listing** (from any machine with `curl` and `jq`):

   ```bash
   curl -s https://<site>/api/properties?limit=1 | jq -r '.properties[0].path'
   curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://<site>/property/prop-1
   curl -s "https://<site>$(curl -s https://<site>/api/properties?limit=1 | jq -r '.properties[0].path')" \
     | grep -E 'og:title|og:image|og:url|rel="canonical"'
   curl -s https://<site>/sitemap.xml | grep -c '<loc>'
   ```
4. **Re-scrape existing shared links** if a link was already shared: Facebook /
   WhatsApp cache the old card. Facebook: *Sharing Debugger* → paste the URL →
   *Scrape Again*. WhatsApp has no public tool; a fresh link (or a new chat) picks
   up the new card.
5. **Re-check after a price or photograph change** — the response is
   `no-cache, must-revalidate`, so the crawler's next fetch is current; cached
   copies at the social network still need the re-scrape above.

No DNS, nameserver, email or permanent-domain change is part of this work.

---

## 7. What was verified, and what was not

**Verified by execution:** every test suite listed in §4, the TypeScript build,
the production build, and the raw-HTML behaviour in §5 (status codes, redirect,
tags, sitemap, image URLs) against the built output served the way production
serves it.

**Not verified — do not treat as tested:**

* A real WhatsApp, Facebook, X or LinkedIn preview rendered in the browser or on a
  phone. This environment has no social crawler; the evidence is the raw HTML a
  crawler is served (§5). The re-scrape step in §6 is how you confirm the actual
  card.
* MySQL. The suites run against SQLite (the project's test database). The
  queries used here are portable and the migration script's MySQL plan is
  checked statically by `tests/migration.test.mjs`, but no MySQL server was
  available in this environment, so a real MySQL run is unconfirmed.
* Anything on the live hosts: nothing was deployed, and `goodlucks.net` /
  `rent.goodlucks.co` still serve the old output until §6 is carried out.

---

## 8. Git

Branch `arena/77e46f19-goodlucks-rep`, based on `main` at
`2b967fe23153e8ce78d7806a9d6bb0aa3c55fda8`. Not merged, not pushed to `main`.
`main` is unchanged.

---

## 9. Outstanding items (outside these eight corrections)

Carried forward from `docs/LIVE_SITE_AUDIT_2026-11-06.md`; listed here so they are
not mistaken for completed work:

* nav links to `/privacy` and `/terms`, which do not exist (soft-404s), and the
  soft-404 response pattern generally;
* `robots.txt` still advertising the permanent domain from the testing host;
* `rentals@goodlucks.co` has no MX record and `goodlucks.net` has no DMARC;
* "Featured listing" copy vs. "not yet reviewed by our team" on listing pages;
* `prop-4` location/city mismatch in the live data;
* stock (Unsplash) photography on the live listings;
* blog has zero articles.
