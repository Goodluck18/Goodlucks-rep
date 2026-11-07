# Share Property as Image + short property links + official domain change

**Date:** 2026-11-07
**Branch:** `arena/cb80845e-goodlucks-rep` (based on `main` @ `bedece8`, the merge of PR #16)
**Scope:** the approved "Share Property as Image" feature, the `/p/{id}` short link
it shares, and the domain correction to `goodlucks.co`.

No deployment, no hosting change, no merge into `main`.

---

## 1. Summary of what now works

On any published property page the existing **Share** button opens one dialog with
two options:

1. **Share Property Link** — the previous behaviour, unchanged: the device share
   sheet when the browser has one, otherwise the clipboard, with the same toasts.
   (The button no longer flips to "Copied Link!" for two seconds — the copy now
   happens inside the dialog, which closes on success and shows the same toast.)
2. **Share as Image** — builds a 1080 × 1350 (4:5) PNG poster from the listing the
   page is already showing, shows it for approval, and offers **Share Image**,
   **Download Image**, **Copy Property Link** and **Close**.

The poster uses the real primary photograph (first usable image of that listing),
the real title, price, payment period and location, and the real brand strip:
`Goodlucks` in charcoal + `Homes` in pink, the call to action, all five social
accounts with `@GoodlucksHomes`, and the **active** domain from configuration.
`Share Image` attaches the PNG to the device share sheet and puts one short,
neutral caption in it: `View this property here:` + the short link.

Every listing has a short link: `https://<active-domain>/p/<property-id>`, which
301s to the canonical property page and 404s for anything not published.

The official production domain is now **`goodlucks.co`** everywhere it is
configured; the testing deployment keeps its own domain through `APP_URL`.

---

## 2. Files created

| File | Purpose |
|---|---|
| `src/config/brand.ts` | The brand facts the poster draws (wordmark halves and their colours, CTA, palette, social accounts, handle, contact). The footer now reads its socials/handle/contact from here so the site and the poster cannot disagree. |
| `src/sharing/poster.ts` | The poster layout as a pure function: 1080 × 1350, 945px photo band, price/title/location block, brand strip, text wrapping and ellipsis, overflow checks. |
| `src/sharing/posterRenderer.ts` | Draws a plan on a canvas and exports the PNG: CORS image loading with timeout, centre-cover crop, font waiting, designed "no photograph" panel, `no-canvas` / `export-failed` errors, file naming. |
| `src/sharing/shareActions.ts` | Sharing and file actions with explicit outcomes: `sharePoster` (Web Share with files, `canShare` check, cancel/failure/unsupported), `sharePropertyLink` (unchanged behaviour), `copyToClipboard` (clipboard + legacy fallback), `downloadBlob`. |
| `src/components/SharePropertyModal.tsx` | The dialog: menu → generating → preview → error, poster preview, the four actions, fallback guidance, focus trap and Escape (existing `useModalA11y`), object-URL revocation on close. |
| `php-backend/short_link.php` | `/p/{id}` entry point: resolve the id, require the same public visibility as the property page, 301 to the canonical URL with the query string preserved, otherwise 404 + `noindex`. |
| `php-backend/lib/property_serve.php` | The request/response helpers (`property_request_path`, `property_request_query`, `property_send`, `property_redirect`) moved out of `property_page.php` so both entry points share them. |
| `tests/sharing.test.mts` | 36 tests: poster layout, overflow, brand/content, renderer with a recording canvas, share/copy/download outcomes, short-link parity with PHP, palette and domain guards. |
| `docs/TASK_SHARE_AS_IMAGE_2026-11-07.md` | This report. |

## 3. Files modified

`src/components/PropertyDetailView.tsx` (Share opens the dialog; period-aware
price text), `src/components/Footer.tsx` (socials/handle/contact from
`brand.ts`), `src/routing/propertyUrl.ts` (short path/URL, period label,
`propertyIsShareable`, `propertyPrimaryPhoto`), `src/routing/routes.ts`
(`/p/<id>` parses as the property page), `src/types.ts` (optional `rentPeriod`,
`shortPath`, `shortUrl`), `src/config/site.ts` (official domain `goodlucks.co`),
`src/components/AdminEmailTemplates.tsx` (example URL),
`php-backend/lib/property_url.php` (short path/URL, resolver, period map,
scheme-safe image selection), `php-backend/lib/repository.php` (`shortPath`,
`shortUrl`, `rentPeriod` on every listing), `php-backend/property_page.php`
(uses the shared helpers), `php-backend/router.php` + `public/.htaccess`
(`/p/` rule `2d`), `php-backend/config.php` + `php-backend/.env.example`
(default `APP_URL`), `public/robots.txt` (`Allow: /p/`, sitemap host),
`index.html` (canonical/OG/Twitter/JSON-LD default host), `package.json`
(`test:sharing`), `.github/workflows/ci.yml`, `CPANEL_DEPLOYMENT_GUIDE.md`
(§5.2, troubleshooting), `tests/property-seo.test.mts` (+5 short-link tests,
parity additions), `tests/routing.test.mts` (`/p/` route), 
`tests/app-navigation.test.mts` (3 dialog tests), `tests/property-slug.php`
(short path/URL/period output), `tests/api.test.mjs`, `tests/blog.test.mjs`
(domain), and the two earlier reports (domain note).

---

## 4. Short-link implementation

**Decision: reuse the property id — `/p/{id}` — instead of minting a code.**

The brief allowed this ("if a suitable stable public identifier already exists,
reuse it") and warned against duplicating identifiers. `prop-…` is already the
public identifier at the end of the canonical slug, so:

* the link is permanent through a retitle, a price change or a location fix;
* there is no second identifier to keep in sync, no code table, **no migration**
  and no collision handling;
* resolution is a primary-key lookup, and it applies exactly the same visibility
  rule as the property page (`property_is_public()` → `active`/`rented`);
* an unpublished or deleted listing therefore 404s with `noindex, follow`, and
  the response never borrows another listing's metadata.

Server: `api/short_link.php`, routed by `.htaccess` rule `2d`
(`^p/([A-Za-z0-9_-]+)/?$`) and by `router.php` for the dev/test server. The
redirect is **relative** with the query string preserved, so `?utm_source=…`
survives and the visitor is never bounced to a hardcoded host.

API: every listing now carries `shortPath`, `shortUrl` and `rentPeriod`, built
from the configured base URL — the client never assembles a domain itself.

App: `/p/<id>` also parses as the property route, so a client-side navigation or
a host without the rewrite still lands on the listing, which then replaces the
address bar with the canonical URL.

---

## 5. Poster generation

**Canvas 2D, no new dependency, nothing stored.** SVG rendering was rejected
because rasterising it faithfully needs an extra library or embedded fonts;
`html2canvas`-style libraries would add a dependency and a font/CSS fidelity
risk. Drawing directly gives exact 1080 × 1350 output and full control.

Pipeline (`generatePropertyPoster`):

1. wait for fonts (bounded at 2.5s) so the poster never exports in a fallback face;
2. load the listing's **first usable** photograph with `crossOrigin="anonymous"`,
   a 10s timeout, and only for `http(s)` URLs — a `data:`, `blob:` or
   `javascript:` value in a record is refused, not drawn;
3. build the layout with the canvas's own `measureText` (title shrinks from 40 →
   36 → 32px, then ellipsises at two lines; the location is fitted to one line);
4. draw: white ground, centre-cover photograph (never stretched), pink accent
   rule, price + period, title, location, hairline, wordmark, CTA, domain, socials;
5. `canvas.toBlob('image/png')` → `PosterArtifact` with a `File`-ready blob, a
   suggested filename (`goodlucks-homes-<id>-poster.png`) and an object URL.

Missing or unloadable photograph → the designed panel (grey ground, teal rule,
"Photograph coming soon", small wordmark) with the rest of the poster intact — no
stock photo and never another listing's picture.

The poster is generated **only** when the visitor chooses Share as Image; opening
a property page renders nothing. A ref guards duplicate clicks, the previous
artifact's object URL is revoked before a regeneration, and everything is revoked
when the dialog closes.

Rent period: the label comes from the record (`rentPeriod`), and the layout prints
whatever it says — `/month`, `/year`, `/week`, `/day`. Today every listing is
monthly because that is what the catalogue stores (`rent_ghs` is a monthly rent);
the code path for other periods is in place and tested, but **no listing in the
database carries another period yet**, so a yearly listing would have to be added
through the same field before it could be seen.

---

## 6. Sharing behaviour and its limits

| Situation | What happens |
|---|---|
| Browser supports files in Web Share (`navigator.canShare({files})`) | The PNG is attached, `title` is the listing title, `text` is `View this property here:` + the short link. |
| `canShare` returns false, or `share` is missing | The dialog says the image cannot be attached and points at **Download Image** + **Copy Property Link**; nothing fails silently. |
| The visitor cancels the sheet | Treated as a cancel, not an error. |
| Sharing throws for another reason | Error toast + the same download/copy guidance. |
| WhatsApp | Native file sharing where supported; the caption carries the link. WhatsApp **Status** drops a caption from an image, so the dialog keeps Copy link beside it and says so. |
| Facebook / Instagram | Download and upload; the link is copied separately. No claim is made that a caption stays clickable on an image post. |
| Download | Anchor with `download`, object URL revoked on the next tick. |

The caption is exactly one line plus the link. No description, no hashtags, no
sales copy, and the property's own description is never used as a caption.

---

## 7. Domain change

The official production domain is now **`goodlucks.co`**. Changed in:
`php-backend/config.php` (the `SITE_URL` default), `php-backend/.env.example`,
`src/config/site.ts` (`PERMANENT_ORIGIN`), `index.html` (canonical, `og:url`,
`og:image`, `twitter:image`, JSON-LD), `public/robots.txt` (sitemap),
`src/components/AdminEmailTemplates.tsx`, `CPANEL_DEPLOYMENT_GUIDE.md`, and the
tests that assert those values.

Nothing is hardcoded in a shared component: the backend builds every absolute URL
from `APP_URL` → `SITE_URL`, and the browser from `VITE_SITE_URL` → its own
served origin → `https://goodlucks.co` as the last-resort default. The **testing
deployment is unaffected**: it sets its own `APP_URL` (and `VITE_SITE_URL` if the
frontend is rebuilt for it) exactly as before, and the poster prints whatever
host is active at runtime. `tests/sharing.test.mts` asserts that neither
`poster.ts`, `posterRenderer.ts` nor `shareActions.ts` contains a domain string
literal, and that no configuration file still names the retired domain.

---

## 8. Tests executed and results

| Command | Result |
|---|---|
| `npm run test:sharing` (**new**) | **36 / 36 pass** |
| `npm run test:property` (5 new short-link tests) | **23 / 23 pass** |
| `npm run test:navigation` (3 new dialog tests) | **60 / 60 pass** |
| `npm run test:routing` (new `/p/` test) | **50 / 50 pass** |
| `npm run test:api` (6 files) | **279 / 279 pass** |
| `npm run test:access` | 13 / 13 pass |
| `npm run test:blog` | 35 / 35 pass |
| `npm run test:content` | 4 / 4 pass |
| `npm run test:design` | 14 / 14 pass |
| `npm run test:email-footer` | 3 / 3 pass |
| `node --test tests/migration.test.mjs` | 14 / 14 pass |
| `npm run lint` (`tsc --noEmit`) | clean |
| `npm run build` | succeeds; `dist/.htaccess` carries rule `2d` |

Coverage against the brief's list: one photograph, several photographs (first
usable wins), very long title (wrapping, ellipsis, no overflow — plus a fuzz list
of eight title shapes), long location, different payment periods, missing
photograph, failed photograph load, updated price, unpublished/unknown listing,
existing link sharing (shared / cancelled / copied / failed), poster preview,
PNG download, copy link, native image sharing supported / unsupported / cancelled
/ failed, image + short link in the caption, WhatsApp/Status/Facebook/Instagram
fallbacks, short-link uniqueness and redirect, resolution after a retitle,
unpublished listing through a short link, malformed code, and both domain
configurations.

### End-to-end check against a running server (not a browser)

A PHP server was started on the real backend with `APP_URL=https://goodlucks.co`,
an administrator and one published listing were created through the API, and the
results were read with `curl`:

```
POST /api/properties            → path      /property/sim-three-bedroom-apartment-cantonments-prop-c06e54738c3ffb63
                                  shortPath /p/prop-c06e54738c3ffb63
                                  shortUrl  https://goodlucks.co/p/prop-c06e54738c3ffb63
                                  rentPeriod month
GET  /p/<id>?utm_source=poster&ref=whatsapp
                                → 301  Location: /property/sim-…-prop-c06e54738c3ffb63?utm_source=poster&ref=whatsapp
GET  /p/no-such-listing         → 404  <meta name="robots" content="noindex, follow">
GET  /property/…-prop-c06e54738c3ffb63
                                → <title>Sim Three Bedroom Apartment · GH₵ 6,500/month · Cantonments, Accra | Goodlucks Homes</title>
                                  og:url   https://goodlucks.co/property/sim-…-prop-c06e54738c3ffb63
                                  og:image https://goodlucks.co/api/uploads/sim.jpg
```

---

## 9. What was **not** verified — do not treat these as tested

* **The poster as pixels.** There is no browser and no canvas in this
  environment (`happy-dom` has none), so the drawing is proven by the recording
  canvas: exact canvas size, centre-cover crop maths, every text run, the
  placeholder, the export call. **How the finished PNG looks has not been seen.**
  Before announcing the feature, open a property page in Chrome and in a phone
  browser, tap Share → Share as Image, and look at the poster: title on two lines,
  price, period, wordmark colours, handle line, domain, and the placeholder on a
  listing with no photo.
* **A real WhatsApp / Facebook / Instagram share.** No share sheet, no crawler and
  no social app here. The tests prove the payload handed to `navigator.share`
  (file, title, caption) and every fallback decision. Whether WhatsApp keeps the
  caption with the image, and whether a Status post keeps a clickable link, must be
  checked on a real phone — that is also why Copy Link sits next to the action.
* **Android Chrome / iOS Safari rendering.** Untested here for the same reason.
* **MySQL.** The suites run on SQLite; the MySQL schema path is checked statically
  by `tests/migration.test.mjs`. No MySQL server was available.
* **Anything on the live hosts.** Nothing was deployed; `goodlucks.net` still runs
  the old build until the deployment steps are carried out.

---

## 10. Lint and build

* `npm run lint` → `tsc --noEmit`, no output, exit 0.
* `npm run build` → Vite build succeeds (`dist/` written, `dist/server.cjs`
  emitted for Node hosting only, not uploaded to cPanel).

## 11. Remaining limitations

* Every listing is monthly today; other periods are supported by the code and by
  the `rentPeriod` field but no row uses them.
* A listing whose photograph is hosted elsewhere needs that host to allow
  cross-origin reads, otherwise the poster uses the placeholder. Photos served
  from `api/uploads/` are unaffected.
* The short link is the property id (`/p/prop-…`), not a 5-character code. That is
  deliberate (see §4) and it is shorter than the canonical URL, but it is not as
  short as an invented code would be.
* Poster typography uses the system UI font stack, the same as the site. It is not
  a bundled brand typeface, because the site does not use one.

## 12. Deployment

**No deployment was performed.** Steps, if and when approved, are in
`CPANEL_DEPLOYMENT_GUIDE.md` §5.1–5.2: upload `dist/*` + `public/.htaccess` +
`php-backend/` as `api/` (the new `short_link.php` and `lib/property_serve.php`
are inside that folder), set `APP_URL` for the deployment, and run the `curl`
checks. No migration is needed.

## 13. Git

Branch `arena/cb80845e-goodlucks-rep`, based on `main` @ `bedece8`. **`main` was
not modified and nothing was merged.** Everything is committed on the branch for
review.
