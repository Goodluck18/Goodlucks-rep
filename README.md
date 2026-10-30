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
| `npm run test:api` | 55 API tests against a throwaway SQLite database |
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

### Creating the admin user

There is no default admin account:

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

### Business rules encoded in the API

- Landlord submissions are created as `pending`; only an admin can approve or
  reject them, and the landlord is notified + emailed either way.
- `DELETE /api/properties/{id}` deactivates a listing (`?purge=1`, admin only,
  hard-deletes).
- Viewings are scheduled by Goodlucks staff; the GH₵ 100 viewing fee is paid in
  cash on site and recorded, never charged online.
- Price-drop alerts are unique per property + email; search alerts belong to the
  signed-in user and can be removed.
- Property views and visitor analytics are recorded from real requests, not
  generated numbers.

### API surface (all under `/api`)

`health` · `auth/{register,login,admin-login,logout,me}` · `profile` ·
`properties` (+ `/{id}`, `/{id}/status`, `/{id}/feature`) · `uploads` ·
`enquiries` · `tenant-requests` · `viewing-requests` · `viewings` ·
`price-alerts` · `search-alerts` · `saved-properties` · `agreements`
(+ `/{id}/sign`, `/{id}/email`) · `receipts` · `notifications` ·
`admin/{stats,properties,enquiries,tenant-requests,viewings,price-alerts,email-logs}` ·
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
npm run test:api     # 55 tests / 12 suites
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
