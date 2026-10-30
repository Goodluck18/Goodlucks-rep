# Goodlucks Homes — cPanel Deployment Guide

This guide deploys the **React website** and the **PHP + MySQL API** to a standard
cPanel account (phpMyAdmin available). It matches what is actually in the
repository today — there is no Node server in production.

---

## 1. Architecture

| Layer | Technology | Where it runs |
| --- | --- | --- |
| Frontend | React 19 + Vite + Tailwind, compiled to static files | `public_html/` |
| API | PHP 8.1+ front controller (`api/index.php`) | `public_html/api/` |
| Database | MySQL 8 / MariaDB via PDO | cPanel MySQL |
| Routing | Apache `mod_rewrite` (`.htaccess`) | `public_html/` and `public_html/api/` |
| Uploads | Images written to `api/uploads/` (never executed) | file system |
| Email | Resend API, falling back to PHP `mail()` | outbound |

The browser only talks to `/api/...` on the same domain. There is no CORS
wildcard, no API key in the frontend bundle and no business data in
`localStorage` — the database is the single source of truth.

**Requirements:** PHP 8.1+ with `pdo_mysql`, `openssl`, `curl`, `fileinfo`,
`mbstring`; Apache with `mod_rewrite`; HTTPS (free AutoSSL is fine).

---

## 2. Repository → server mapping

```text
public_html/                 <- contents of dist/ after `npm run build`
├── index.html
├── .htaccess                <- from public/.htaccess
├── assets/                  <- hashed JS/CSS
├── favicon.svg, robots.txt
└── api/                     <- entire php-backend/ folder
    ├── index.php            <- front controller (all routes)
    ├── .htaccess            <- rewrite + hardening
    ├── .env                 <- YOUR secrets (never committed)
    ├── config.php           <- reads .env / config.local.php
    ├── lib/                 <- http, db, auth, validate, repository, mailer, api
    ├── database.sql         <- MySQL schema (idempotent)
    ├── admin_bootstrap.php  <- CLI: create/reset the admin user
    ├── migrate.php          <- CLI: additive schema upgrade
    ├── uploads/             <- writable, 0755
    └── logs/                <- writable, 0755 (php-error.log)
```

The legacy files `properties.php`, `tenant_requests.php`, `price_alerts.php`,
`viewing_request.php`, `send_email.php`, `health.php` are 4-line shims that
require `index.php`; old links keep working but there is only one router.

---

## 3. Step 1 — Database

1. cPanel → **MySQL® Databases** → create a database, e.g. `goodlucks`
   (full name `cpuser_goodlucks`).
2. Create a user with a strong password and grant **ALL PRIVILEGES** on it.
3. Open **phpMyAdmin** → select the database → **Import** → choose
   `php-backend/database.sql` → **Go**.

`database.sql` is idempotent (`CREATE TABLE IF NOT EXISTS` + guarded seeds), so
re-importing it after an update is safe. It creates every table the app uses
(users, sessions, properties, enquiries, tenant_requests, viewings, agreements,
receipts, alerts, notifications, page_views, email_logs, rate_limits, uploads)
and seeds a demo landlord, a demo tenant and properties `prop-1` … `prop-4`.

> Upgrading an older install? Run `php api/migrate.php` (dry run) and then
> `php api/migrate.php --apply` from cPanel → Terminal. It only adds what is
> missing and never drops data.

---

## 4. Step 2 — Configure the API

Copy `php-backend/.env.example` to `public_html/api/.env` and fill in:

```ini
APP_ENV=production
APP_URL=https://rent.goodlucks.co

DB_DRIVER=mysql
DB_HOST=localhost
DB_NAME=cpuser_goodlucks
DB_USER=cpuser_gluser
DB_PASS=<your strong password>

RESEND_API_KEY=re_xxx            # recommended, enables reliable email
RESEND_FROM_EMAIL=rentals@goodlucks.co
OFFICIAL_EMAIL=rentals@goodlucks.co

GEMINI_API_KEY=                  # optional: AI descriptions & match scores
ADMIN_ACCESS_KEY=<long random>   # required second factor for the admin login
```

Notes:

* `.env` must not be web-accessible — the shipped `.htaccess` blocks dotfiles.
* Instead of `.env` you can use `api/config.local.php` returning an array:
  `<?php return ['DB_NAME' => '…', 'DB_PASS' => '…'];`
* Empty `RESEND_API_KEY` simply falls back to PHP `mail()`; the attempt is
  still recorded in the admin email log.

---

## 5. Step 3 — Build the frontend

On your computer:

```bash
npm install
npm run build          # writes dist/
```

`npm run build` also compiles `server.ts` to `dist/server.cjs`; that file is only
used for local/Node hosting and is **not** uploaded to cPanel. Upload:

* everything inside `dist/` **except** `server.cjs` / `server.cjs.map`, to `public_html/`
* `public/.htaccess` to `public_html/.htaccess`

Keep `index.html` and `assets/` at the same level; the HTML requests
`/assets/…` with a hashed name, so it is safe to cache them for a year.

---

## 6. Step 4 — Upload the API

1. Upload the whole `php-backend/` folder as `public_html/api/`.
2. Do **not** upload `admin_bootstrap.php`, `migrate.php`, or `*.sql` to a
   public folder if your host does not honour `.htaccess` denies; keep them
   outside `public_html` and run them with an absolute path in that case.
3. Set permissions:
   ```text
   api/            0755
   api/uploads/    0755  (must be writable by PHP)
   api/logs/       0755  (must be writable by PHP)
   api/.env        0600
   ```
4. Make sure the uploads folder cannot execute PHP — `api/uploads/.htaccess`
   already removes PHP handlers and denies script extensions.

---

## 7. Step 5 — Create the admin user

The schema seeds `admin@goodlucks.com`, `landlord@goodlucks.com` and
`tenant@goodlucks.com` as **passwordless rows**: they exist so demo listings have
an owner, but nobody can sign in to them. That is intentional — a known password
for an account that owns listings would be a security hole. Do not add one.

There is no default admin and no "bypass" button. Create a real admin from
**cPanel → Terminal** (or SSH):

```bash
cd ~/public_html/api
php admin_bootstrap.php --email=admin@goodlucks.co --name="Goodlucks Admin" --phone=+233237690080
```

You will be prompted for a password (minimum 10 characters) — or set
`ADMIN_INITIAL_PASSWORD` in `.env` before running so it can be scripted:

```bash
ADMIN_INITIAL_PASSWORD='Str0ng-Admin-Pass' php admin_bootstrap.php --email=admin@goodlucks.co
```

The script prints whether `ADMIN_ACCESS_KEY` is configured. Admin sign-in uses
`/api/auth/admin-login` and needs **email + password + access key**; admins
cannot sign in through the public login form, and tenants cannot enter the
admin console.

Running it again for the same email rotates the password, which is how you
recover a lost admin login. If the command exits immediately with
"Could not connect to the database", the `DB_*` values in `api/.env` are wrong —
the message now says so instead of failing silently.

---

## 8. Step 6 — Verify the deployment

```bash
# 1. API + database connectivity
curl -s https://rent.goodlucks.co/api/health | jq

# 2. Public listing feed
curl -s "https://rent.goodlucks.co/api/properties?limit=2" | jq '.total'

# 3. Admin routes must be closed without a session
curl -s -o /dev/null -w "%{http_code}\n" https://rent.goodlucks.co/api/admin/stats   # 401

# 4. Deep link must return the SPA, not a 404
curl -s -o /dev/null -w "%{http_code}\n" https://rent.goodlucks.co/browse            # 200
```

Then in the browser:

1. Browse listings — cards come from `prop-1`…`prop-4`.
2. Submit a viewing request → check `viewing_schedules` in phpMyAdmin.
3. Register a landlord, list a property with photos → status must be `pending`.
4. Sign in to `/admin` → approve the listing → it appears on the public site and
   the landlord gets a notification + email log entry.
5. Submit the contact form → the message appears in **Admin → Website Enquiries**.

---

## 9. Local development

```bash
npm install
npm run dev        # PHP API on :8090 (SQLite) + Vite host on :3000 proxying /api
npm run api:dev    # PHP API only
npm run test:api   # 55 API tests against a throwaway SQLite database
npm run build      # production bundle
```

`npm run dev` needs PHP 8.1+ on your PATH; without it the bundled
`@php-wasm/cli` dev dependency is used, so no PHP install is strictly required.
Local data lives in `.data/dev.sqlite` (git-ignored) and is seeded from
`php-backend/schema.sqlite.sql` on first run.

---

## 10. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `/api/health` returns HTML | `public_html/api/.htaccess` missing or `mod_rewrite` off — the SPA fallback caught the request. |
| `500` on every API call | PHP 8.0 or missing `pdo_mysql`; check `api/logs/php-error.log`. |
| `500` mentioning `php_flag` | Host runs PHP-FPM; the shipped `.htaccess` already wraps `php_flag` in `<IfModule mod_php.c>`. |
| API says "Database is not configured" | `DB_NAME` / `DB_USER` empty in `.env`, or `.env` not readable by PHP. |
| Images upload but show a broken icon | `api/uploads/` is not writable (needs 0755, owner = PHP user). |
| "Origin not allowed" (403) | `APP_URL` does not match the domain you browse. Set it exactly, e.g. `https://rent.goodlucks.co`. |
| Admin login says "access key required" | `ADMIN_ACCESS_KEY` is set in `.env`; the console requires it as the third field. |
| Emails never arrive | No `RESEND_API_KEY` and the server's `mail()` is blocked. Add a Resend key and a verified sender domain. |
| Refresh on `/browse` gives 404 | Root `.htaccess` missing — upload `public/.htaccess`. |
| "Too many attempts" after failed logins | Database-backed rate limit; wait for the window or clear `rate_limits`. |

---

## 11. Security checklist

- [ ] HTTPS enforced (uncomment the redirect in `public/.htaccess`).
- [ ] `ADMIN_ACCESS_KEY` set to a long random value.
- [ ] `api/.env` (or `config.local.php`) present, `0600`, and not downloadable.
- [ ] `api/logs/` and `api/uploads/` not browsable (`Options -Indexes`).
- [ ] `database.sql` not reachable from the web.
- [ ] Resend domain verified so email passes SPF/DKIM.
- [ ] Admin password rotated after first sign-in (`admin_bootstrap.php --reset`).

---

## 12. Updating a live site

1. `npm run build` locally.
2. Upload the new `assets/` folder and `index.html` (the old hashed bundles can
   be deleted afterwards).
3. Replace `public_html/api/lib/` and `public_html/api/index.php`.
4. If `database.sql` changed, run `php api/migrate.php` and then
   `php api/migrate.php --apply`.
5. Re-run the four `curl` checks in section 8.
