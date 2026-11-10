# Upgrade 2 — Phase 2 report (administrator console, blog and mobile cards)

Date: 2026-11-10
Branch: `arena/1dbf260c-goodlucks-rep`
Base: `880fdc4` (Upgrade 2 Phase 1)
Scope: A1, A2, A3, A4, A5, A6, A7, A8, A10 from the approved Phase 0 audit.
Nothing was deployed. `main` was not modified. No production database was touched.

---

## 1. What was fixed

### A1 — Blog featured-image upload ("Endpoint not found")

The blog editor uploads its featured image through the same handler as the listing
forms, but it posted to `api/uploads/` (trailing slash) while the deployed host has
a real `api/uploads` directory. Apache's `mod_dir` answered the un-slashed request
with a redirect that the browser re-sent as a `GET`, so the editor showed
`Endpoint not found` although nothing was wrong with the image.

- `src/services/apiService.ts` — uploads now go to one canonical path, and both
  spellings are accepted by the backend rather than being rewritten by Apache.
- `php-backend/router.php` — the router treats `/api/uploads` and `/api/uploads/`
  as the same endpoint before any file-system lookup happens.
- `php-backend/.htaccess`, `public/.htaccess` — `DirectorySlash Off` for the API
  path plus an explicit rewrite, so a directory of the same name can never answer
  the upload POST.
- Tests: `tests/api.test.mjs` ("the upload endpoint answers on both spellings of
  its path", "a refused upload on the slashed path reports the field") and
  `tests/uploads.test.mts` section 4.

**Honest limitation:** the live symptom was reported from the deployed site's
Developer Tools. The sandbox has no Apache and no browser, so the cause above is
the reproduced mechanism in this repository (a `301` from `mod_dir` followed by a
`GET`), proven at the routing layer, not observed on the live host.

### A2 — A YouTube video and a property showcase in one article

The blog renderer used to keep only one embedded block per article, so adding a
video displaced the property showcase (or the reverse).

- `src/lib/blogHtml.ts` (new) — a single deterministic HTML builder used by both
  the React renderer and the server-rendered page. A video becomes one
  `gl-video-frame` iframe (`youtube-nocookie`), and any number of property
  showcases become `gl-showcase` blocks; both are kept, in author order.
- `src/components/BlogArticleBody.tsx` — renders the built HTML instead of
  replacing blocks.
- `src/components/AdminBlogEditor.tsx` — the editor no longer clears the showcase
  when a video is inserted.
- `php-backend/lib/blog_content.php` — the PHP side produces the same markup
  (`BLOG_SHOWCASE_CLASS`), so the public page and the editor preview agree.
- Tests: `tests/blog-html.test.mts` (16 tests), plus C2 in `tests/blog.test.mjs`.

### A3 — Blog link previews

- `php-backend/lib/blog_serve.php` (new) — `blog_share_meta_html`,
  `blog_index_meta_html` and `blog_missing_meta_html` emit `og:`, `twitter:` and
  canonical tags in the first HTML response, with a 640×360 card image.
- `php-backend/blog_page.php` (new) — the server-rendered article page; an
  uppercase slug is retried in lower case and then `301`s to the canonical URL,
  because `blog_valid_slug()` accepts lower case only.
- Missing articles answer `404` with `noindex`.
- Tests: section J of `tests/blog.test.mjs`, `tests/blog-html.test.mts`.

### A4 — Mobile property cards

- `src/components/PropertyCard.tsx` — a `horizontal` shape (`w-28` thumbnail,
  `flex-row`) for the mobile strip; the existing desktop shape is unchanged.
- `src/components/PropertyCardGrid.tsx` (new) — renders the scrollable strip
  (`role="list"`, `snap-x`, `sm:hidden`) plus the existing grid (`hidden sm:grid`),
  so each breakpoint gets exactly one of them.
- `src/index.css` — `.gl-property-strip` (right-to-left swipe, hidden scrollbar).
- Wired into `BrowseView`, `HomeView`, `PropertyDetailView` and `TenantDashboard`.
- Tests: `tests/responsive.test.mts` (18 tests).

**Honest limitation:** there is no browser or device in this environment. The
layout claims are structural (class names, element order, `sm:` breakpoints) and
proven by tests over the shipped source; they were not observed on a phone.

### A5 — Email template editor showed "No content"

The editor saved the template body but re-read it from the wrong key, so a saved
body came back empty and the panel displayed `No content`.

- `src/components/AdminEmailTemplates.tsx` — saves and reads the same field,
  trims only on save, keeps the caret, shows the saved body immediately, and
  reports a real error instead of an empty success.
- Tests: `tests/admin-console.test.mts`.

### A6 — Manage Listings (search, filters, sorting, pagination)

- `GET /api/admin/properties` now returns
  `{ success, count, total, page, perPage, properties }` and accepts `q`, `status`
  (comma list), `location`, `city`, `type`, `bedrooms`, `minRent`, `maxRent`,
  `createdFrom`, `createdTo`, `sort`, `page`, `perPage`.
- Dates are validated (`YYYY-MM-DD`), `createdTo` is inclusive, a malformed date is
  ignored rather than turned into an empty result, and the filter runs in SQL over
  every listing — not over one downloaded page.
- `src/components/AdminManageListings.tsx` (new) — the console: debounced search,
  status chips with counts, location/price/date controls, five sorts, 20 per page.
- Tests: A6 tests in the administrator suite (see §3).

### A7 — Tenant Matching (search, stages, approved section)

- `GET /api/admin/tenant-requests` returns `{ success, requests, stageCounts }` and
  accepts `q` (name, phone, email) and `stage`
  (`pending`, `approved`, `viewing_scheduled`, `completed`, `cancelled`; an unknown
  stage is a `422` that names the allowed values).
- Stage mapping is derived from the stored request: `submitted`/`searching` →
  `pending`, `matched` → `approved`, the rest pass through. An approved request
  therefore appears in the approved section because of its real status, not
  because the browser moved it.
- `src/components/AdminDashboard.tsx` — search box, stage chips with counts, and
  the badge reads the stage.

### A8 — Agent Accounts (search and filters, verification kept separate)

- `GET /api/admin/agents` returns `{ success, count, agents, stageCounts }` and
  accepts `q` (name, email, location), `stage`
  (`pending` / `approved_for_listing` / `suspended`), `verification`, `listing` and
  `accountStatus`.
- `suspended` takes precedence over `approved_for_listing`, which takes precedence
  over `pending`. **Identity verification is never inferred from listing
  authorisation** and vice versa: the two remain separate fields and separate
  filters.
- `src/components/AdminAgentAccounts.tsx` — debounced search, stage and
  verification filters, counts, empty states.

### A10 — Web Inquiries

- `GET /api/admin/enquiries` returns `{ success, count, enquiries, statusCounts }`
  and accepts `q` (name, email, or at least three digits of a phone number, with
  punctuation stripped) and `status`, a comma list of
  `new | received | contacted | replied | closed`. An unknown status is a `422`
  naming the lifecycle.
- `php-backend/lib/validate.php` — `ENQUIRY_STATUSES` is the single source of the
  lifecycle, used by validation and by the console.
- `src/components/AdminEnquiries.tsx` (new) — a real console, not only tests:
  debounced search, status chips with server-side counts, ten per page, per-row
  lifecycle actions through the existing audited endpoint, `mailto:` reply, empty
  and error states. `replied` is only ever set by a person: nothing marks it
  automatically.
- Wired into `AdminDashboard` as its own tab.

---

## 2. Files changed

New:

| File | Purpose |
| --- | --- |
| `src/lib/blogHtml.ts` | One HTML builder for article bodies (A2) |
| `src/components/PropertyCardGrid.tsx` | Mobile strip + desktop grid (A4) |
| `src/components/AdminManageListings.tsx` | Manage Listings console (A6) |
| `src/components/AdminEnquiries.tsx` | Web Inquiries console (A10) |
| `php-backend/lib/blog_serve.php` | Share/canonical metadata (A3) |
| `php-backend/blog_page.php` | Server-rendered article page (A3) |
| `tests/blog-html.test.mts` | 16 tests for the article HTML builder (A2) |
| `tests/admin-console.test.mts` | 16 tests over the shipped console source (A5/A1/A6/A7/A8/A10) |
| `tests/admin-console-api.test.mjs` | 9 end-to-end tests for A6/A7/A8/A10 |

Modified (25 files, +1632 / −424): `package.json`, `php-backend/.htaccess`,
`php-backend/lib/{api,blog_content,repository,validate}.php`, `php-backend/router.php`,
`public/.htaccess`, five components for the card strip, `AdminDashboard`,
`AdminBlogEditor`, `AdminEmailTemplates`, `AdminAgentAccounts`, `BlogArticleBody`,
`src/index.css`, `src/services/apiService.ts`, `src/types.ts`, and the four test
files (`api`, `blog`, `responsive`, `uploads`).

---

## 3. Test results (all executed in this environment)

| Suite | Result |
| --- | --- |
| `npm run test:api` (9 files, incl. new `admin-console-api`) | **316 / 316 pass**, 0 fail, exit 0 |
| `npm run test:admin-console-api` | **9 / 9 pass** |
| `npm run test:admin-console` | **16 / 16 pass** |
| `npm run test:blog-html` | **16 / 16 pass** |
| `npm run test:blog` | **45 / 45 pass** |
| `npm run test:uploads` | **20 / 20 pass** |
| `npm run test:responsive` | **18 / 18 pass** |
| `npm run test:navigation` | **61 / 61 pass** |
| `npm run test:routing` | **50 / 50 pass** |
| `npm run test:sharing` | **36 / 36 pass** |
| `npm run test:property` | **23 / 23 pass** |
| `npm run test:access` | **13 / 13 pass** |
| `npm run test:design` | **14 / 14 pass** |
| `npm run test:content` | **4 / 4 pass** |
| `npm run test:email-footer` | **3 / 3 pass** |
| `tsc --noEmit` | **exit 0** |
| `npm run build` (Vite) | **built in 4.40 s**, no errors |
| `php-wasm-cli -l` on every touched PHP file | **clean** |

The API suites use SQLite and the PHP-WASM fallback, because the sandbox has no
system PHP, MySQL or browser.

### A note on one flaky run

Twice, the whole `npm run test:api` run wedged after ~30 suites: a login request
hung and the file reported 307 pass / 9 cancelled. A health probe during the hang
showed the PHP built-in server no longer answering, while it kept logging
`Failed to accept a client (reason: Invalid argument)`. Isolating the console
suite into its own file — its own server, its own database, its own fixtures — made
the failure disappear: it passes on its own in 7.7 s and the full nine-file run
passed afterwards with 316/316. The console suite now depends on no other suite's
state, which is how the finance suites are written too. The server-side wedge was
not fully explained; it is a test-harness issue (PHP-WASM built-in server), not a
product fault, since no endpoint is involved.

---

## 4. Outstanding and limitations

1. **A1 cause not seen live.** The `mod_dir`/301 mechanism is reproduced at the
   routing layer in this repo; confirming it in the deployed host's DevTools is
   still needed. The fix is defensive on both sides (router and rewrite), so it
   holds even if the deployed cause differs.
2. **Layout checks are structural.** A4's mobile behaviour is asserted against the
   shipped source (shapes, `sm:` breakpoints, strip semantics). No browser or
   device was available to eyeball it.
3. **PHP-WASM server flakiness** as described above; the suites were restructured
   so a wedge cannot silently cancel another suite's tests.
4. Nothing in this phase deploys; the `.htaccess` changes are Apache-only and must
   be verified on the host at deployment time (the router fallback covers PHP's
   built-in server and stays in place either way).

---

## 5. Repository status

- Branch `arena/1dbf260c-goodlucks-rep`, based on `880fdc4`; `main` untouched.
- Phase 2 is committed and pushed. No deployment, no production database access.
- Phase 1 behaviour is preserved: the primary administrator keeps full authority
  (including self-approval of its own fee policy) and tenant contact details still
  never reach providers or provider emails — the Phase 1 suites
  (`primary-admin`, `tenant-contact`) still pass inside `test:api`.
