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
| `npm run test:api` | 74 API tests against a throwaway SQLite database |
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

Two features are email-driven and must be scheduled, or they deliver nothing:

| Job | What it does | Trigger |
| --- | --- | --- |
| Saved-search matching | Emails subscribers when a listing that matches their search goes live | Runs automatically when a listing is approved; `cron.php` catches anything else |
| Retention pruning | Trims `page_views`, `email_logs`, expired sessions and stale rate-limit rows | `cron.php` |

```bash
# every 15 minutes on cPanel
*/15 * * * * /usr/local/bin/php /home/cpuser/public_html/api/cron.php >/dev/null 2>&1

# see what it would do
php php-backend/cron.php --dry-run
```

Admins can also deliver pending matches on demand from the console
("Send Alert Digests"), which helps when shell cron is unavailable.

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
(+ `/{id}/sign`, `/{id}/email`) · `receipts` · `notifications` ·
`admin/{stats,properties,enquiries,tenant-requests,viewings,price-alerts,email-logs,alerts/run}` ·
`track/pageview` · `ai/{describe,match}`

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
npm run test:api     # 74 tests / 18 suites
npm run lint
npm run build
```

The suite boots the real PHP API on a random port with a throwaway SQLite file,
so it exercises the same handlers the production site uses.

---

## Deployment

See [`CPANEL_DEPLOYMENT_GUIDE.md`](./CPANEL_DEPLOYMENT_GUIDE.md) for the full
walkthrough: database, configuration, upload layout, admin bootstrap, smoke
tests, troubleshooting and the security checklist.
