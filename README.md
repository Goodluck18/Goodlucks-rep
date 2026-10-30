# Goodlucks Homes

A rental intermediary platform for Accra, Ghana: tenants find verified homes,
landlords list property, and Goodlucks staff approve listings, arrange physical
viewings and issue tenancy agreements and rent receipts.

Every screen is backed by a real API and a real database — there are no demo
logins, no simulated emails and no business data kept in the browser.

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 6, TypeScript, Tailwind CSS 4 |
| API | PHP 8.1+ (front controller + router), PDO |
| Database | MySQL 8 / MariaDB in production, SQLite for local dev & tests |
| Hosting | Any cPanel account — Apache serves the static build and `/api` (see `CPANEL_DEPLOYMENT_GUIDE.md`) |
| Email | Resend HTTP API, falling back to PHP `mail()`; every send is logged |
| Images | Uploaded to `php-backend/uploads/`, MIME-validated, never executable |

---

## Quick start

```bash
npm install
npm run dev          # PHP API on :8090 (SQLite) + Vite host on :3000
```

Open <http://localhost:3000>. The first run creates `.data/dev.sqlite` and seeds
a few sample listings. No PHP install is required: if no `php` binary is found,
the bundled `@php-wasm/cli` dev dependency is used.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | PHP API + Vite host (proxies `/api` to PHP) |
| `npm run api:dev` | PHP API only, on `API_PORT` (default 8090) |
| `npm run test:api` | 84 API tests against a throwaway SQLite database |
| `npm run build` | Production bundle in `dist/` |
| `npm run lint` | `tsc --noEmit` |

### Configuration

Copy `php-backend/.env.example` to `php-backend/.env`:

```ini
APP_ENV=development
APP_URL=http://localhost:3000
DB_DRIVER=sqlite            # mysql in production
DB_SQLITE_PATH=.data/dev.sqlite

RESEND_API_KEY=             # optional locally; email is logged either way
GEMINI_API_KEY=             # optional; deterministic fallbacks are used
ADMIN_ACCESS_KEY=           # second factor for /api/auth/admin-login
```

Nothing secret is committed. Real environment variables always take precedence
over `.env`, and `.env` is git-ignored.

### Demo accounts (local only)

The schema seeds a tenant, a landlord and an admin so there is something to look
at. **Those rows deliberately ship without a password** — publishing one for an
account that owns listings would be a security hole on a live site. `npm run dev`
runs `php-backend/dev_accounts.php`, which sets a local password and prints:

```text
admin@goodlucks.com     / Goodlucks-Dev-123   →  /admin-login
landlord@goodlucks.com  / Goodlucks-Dev-123
tenant@goodlucks.com    / Goodlucks-Dev-123
```

The helper refuses to run unless `APP_ENV=development` **and** `DB_DRIVER=sqlite`,
so it can never touch production.

### Creating the admin user

There is no default admin account on a real deployment:

```bash
npm run api:dev -- --help                     # or, directly:
node_modules/.bin/php-wasm-cli php-backend/admin_bootstrap.php \
  --email=admin@goodlucks.co --name="Goodlucks Admin" --phone=+233237690080
```

With a native PHP binary simply run `php php-backend/admin_bootstrap.php …`.
Use `--reset` to rotate a password. The admin console requires
**email + password + `ADMIN_ACCESS_KEY`**; tenants cannot enter it, and admins
cannot use the public login form.

---

## How it is put together

```text
src/
├── services/apiService.ts   typed client for every API route (single fetch entry point)
├── context/AppContext.tsx   server-backed state: boot, auth, listings, dashboards
├── components/              views (public site, tenant/landlord dashboards, admin console)
└── types.ts                 shared domain types

php-backend/
├── index.php                front controller for /api/*
├── lib/api.php              route table + handlers for all endpoints
├── lib/{http,db,validate,auth,mailer,repository}.php
├── database.sql             authoritative MySQL schema (idempotent, seeded)
├── schema.sqlite.sql        SQLite mirror used by dev & tests
├── admin_bootstrap.php      CLI: create / reset the admin user
└── migrate.php              CLI: additive upgrade of an older install

tests/api.test.mjs           end-to-end API tests (node:test)
scripts/{php,dev,api-dev}.mjs  run the PHP API, locally or in CI
server.ts                    dev-only static host that proxies /api to PHP
```

### Background work (cron)

Scheduled work — if cron is not running, saved searches and queued mail deliver
nothing:

| Job | What it does | Trigger |
| --- | --- | --- |
| Saved-search matching | Emails subscribers when a listing that matches their search goes live | Runs automatically when a listing is approved; `cron.php` catches anything else |
| Email outbox | Delivers queued mail and retries failures with backoff (1m, 5m, 15m, 1h, 4h, 12h; parked as `failed` after 6 attempts) | After every response, then `cron.php` |
| Retention pruning | Trims `page_views`, `email_logs`, delivered outbox rows, expired sessions and stale rate-limit rows | `cron.php` |

```bash
# every 15 minutes on cPanel
*/15 * * * * /usr/local/bin/php /home/cpuser/public_html/api/cron.php >/dev/null 2>&1

# see what it would do
php php-backend/cron.php --dry-run
```

Admins can also deliver pending matches on demand from the console
("Send Alert Digests"), and push queued mail with "Send queued email now" on the
Transactional Emails tab — both help when shell cron is unavailable.

### Email delivery

No request ever blocks on the mail provider. `send_email()` writes the message to
`email_outbox` and returns immediately; a shutdown hook calls
`fastcgi_finish_request()` (when the SAPI supports it) and only then talks to
Resend, so a 15-second provider stall can no longer become a 15-second enquiry
submit. Anything that fails is retried by `cron.php` with exponential backoff and
parked as `failed` after six attempts, with the reason recorded in
`email_outbox.last_error` and on the `email_logs` row (which now shows queued /
delivered / failed instead of always "delivered"). Rows are claimed with a
conditional `UPDATE`, so the shutdown flush and cron can never double-send.

Set `EMAIL_TRANSPORT=auto` (default: Resend then PHP `mail()`), `resend`, `mail`,
or `none` to disable delivery while still queueing and logging (tests, staging).

Price-drop emails fire when a listing's rent is reduced through the API — one
email per new price, never a duplicate for the same value. Both alert types
record every send in `alert_deliveries` (unique key), so repeated runs, retries
and concurrent requests are all idempotent.

### Business rules encoded in the API

- Landlord submissions are created as `pending` and **unverified**; only an
  admin can approve or reject them, and the landlord is notified + emailed
  either way. The "verified landlord" badge is earned through a staff
  inspection (`POST /properties/{id}/verify`), never assumed.
- Enquiries move through `new → contacted → closed`, so the dashboard's "new
  enquiries" figure is a real work queue rather than a synonym for the total.
- `DELETE /api/properties/{id}` deactivates a listing (`?purge=1`, admin only,
  hard-deletes).
- Viewings are scheduled by Goodlucks staff; the GH₵ 100 viewing fee is paid in
  cash on site and recorded, never charged online.
- Price-drop alerts are unique per property + email; search alerts belong to the
  signed-in user and can be removed.
- Property views and visitor analytics are recorded from real requests, not
  generated numbers.
- Double submits (double clicks, retried fetches) are collapsed: an enquiry,
  viewing request or rental request that repeats an identical payload from the
  same device within two minutes returns the original record with `duplicate: true`
  instead of creating a second one.
- Listing edits are optimistic: the client sends the `updatedAt` it loaded, and a
  stale write is refused with HTTP 409 (`code: "stale_property"`) carrying the
  current listing, so two people editing one advert can never silently overwrite
  each other. `updated_at` has one-second resolution on MySQL, so edits made in
  the same second as another save are not distinguished.
- Match scores are real. `GET /api/matches` scores every live listing against
  the signed-in tenant's rental request with the same engine `/ai/match` uses;
  staff-curated picks (set on the request) sort first, then best score. The
  dashboard shows "Chosen for you" or the actual percentage — never a fixed 96%.
  Admins can score any request with `?requestId=`.
- The unread badge clears: opening the notifications view calls
  `POST /api/notifications/read-all` once, so the bell stops counting alerts the
  member has already seen.
- Password reset: `/api/auth/password-reset/request` always answers with the same
  generic message (no account enumeration), stores only a SHA-256 hash of a
  single-use token that expires after 60 minutes, and
  `/api/auth/password-reset/confirm` sets the new password and signs out every
  other session. The emailed link is `/?reset=<token>`, which opens a dedicated
  reset screen in the SPA.

### API surface (all under `/api`)

`health` · `auth/{register,login,admin-login,logout,me,password-reset/request,password-reset/confirm}` · `profile` ·
`properties` (+ `/{id}`, `/{id}/status`, `/{id}/feature`) · `uploads` ·
`enquiries` · `tenant-requests` · `viewing-requests` · `viewings` ·
`price-alerts` · `search-alerts` · `saved-properties` · `agreements`
(+ `/{id}/sign`, `/{id}/email`) · `receipts` · `notifications`
(+ `/read-all`) · `matches` ·
`admin/{stats,properties,enquiries,tenant-requests,viewings,price-alerts,email-logs,alerts/run,emails/run}` ·
`track/pageview` · `ai/{describe,match}` · `sitemap.xml` (XML, not JSON)

### Security notes

- Sessions: hashed tokens in the database, `HttpOnly` + `SameSite=Lax` cookies,
  7-day expiry, rotation on login.
- Failed logins are rate limited in the database (HTTP 429).
- All mutations validate input server-side; errors never leak SQL or stack traces.
- Admin-only routes require an admin session; uploads are validated by MIME and
  `getimagesize`, renamed randomly, and can never be executed.
- Cross-origin requests are restricted to the site's own origin.

---

## Testing

```bash
npm run test:api     # 84 tests / 20 suites
npm run lint
npm run build
```

The suite boots the real PHP API on a random port with a throwaway SQLite file,
so it exercises the same handlers the production site uses.

### Performance & SEO

- Views are code-split (`React.lazy`): the landing page ships ~135 kB gzipped of
  app code, and dashboards load as separate chunks (the admin console alone is
  48 kB that guests never download).
- Catalogue images below the fold are `loading="lazy" decoding="async"`; the
  property hero image is marked `fetchPriority="high"` as the LCP candidate.
- Modals trap focus, close on Escape and restore focus to their trigger
  (`src/hooks/useModalA11y.ts`).
- `index.html` carries static Open Graph/Twitter tags, a favicon set, a web
  manifest and `RealEstateAgent` JSON-LD, so link previews work for crawlers
  that never run JavaScript. `SEOHead` still injects per-page values.
- `/sitemap.xml` is generated from the live database (core pages plus every
  published listing, with real `lastmod` values); `robots.txt` points at the
  absolute URL. Listing links are clean paths: `/property/<id>`.

---

## Deployment

See [`CPANEL_DEPLOYMENT_GUIDE.md`](./CPANEL_DEPLOYMENT_GUIDE.md) for the full
walkthrough: database, configuration, upload layout, admin bootstrap, smoke
tests, troubleshooting and the security checklist.
