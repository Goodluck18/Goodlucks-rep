# Upgrade 2 — Phase 3 report (user management, activity and bulk email)

Date: 2026-11-10
Branch: `arena/1dbf260c-goodlucks-rep`
Base: `47cea1f` (Upgrade 2 Phase 2)
Scope: A11, A13, A14 and A12 from the approved Phase 0 audit.
Nothing was deployed. `main` was not modified. No production database was touched.

---

## 1. What was built

### A11 — User Management

- `GET /api/admin/users` — search (`q`) over **name, email address and phone
  number** (the phone comparison strips spaces, dashes and `+`, so `0245551234`
  finds `+233 24 555 1234`), filters `role` (tenant, landlord, agent, admin) and
  `status` (verified, unverified), returns
  `{ success, count, total, page, perPage, users, roles, statuses, capabilities }`.
- `GET /api/admin/users/:id` — one profile summary: contact, role, verification,
  counts of listings, favourites, rental requests, viewings and enquiries, the
  agent or landlord state derived from real records, and the last staff action.
- The counts for a whole page are fetched in five grouped queries, not five per
  row, so a page of 100 costs what a page of 5 costs. A listing owned *and*
  submitted by the same person is counted once.
- `src/components/AdminUserManagement.tsx` — search, role chips, verification
  chips, a table, and paging that asks the server (no browser-side slicing).
- **Never returned:** `password_hash` (queries name their columns), identity
  documents (a count only).

### A13 — Profiles and real activity history

- `GET /api/admin/users/:id/activity` — that person's stored listings,
  favourites, rental requests, viewings, web enquiries and audited actions, each
  with its own timestamp, newest first.
- `src/components/AdminUserProfile.tsx` — the profile and its timeline.
  Documents appear as “Documents on file: N” with a pointer to the audited
  verification screen. The component never receives a file name or a storage
  path from the server, so it could not link one even if it tried.

### A14 — Recent activity on the dashboard

- `GET /api/admin/activity?limit=` — the newest rows of `users`, `properties`,
  `enquiries`, `tenant_requests`, `viewing_schedules` and `audit_logs`, merged and
  ordered by their own timestamps. Each entry carries a title, a detail line, the
  actor where there is one, the time, and the console tab that owns the record.
- `src/components/AdminActivityFeed.tsx` — the feed on the Analytics tab; opening
  an entry opens the listing or switches to the owning console section.
- No invented metric: the “+14% vs yesterday” style tiles elsewhere on that tab
  were already there before this phase and were left untouched.

### A12 — Bulk email

Data: `email_campaigns`, `email_campaign_recipients`, `email_preferences`
(additive; both engines).

- `GET /api/admin/campaigns` — recent campaigns.
- `GET /api/admin/campaigns/preview?audience=&kind=` — who would receive a
  campaign and how many addresses are excluded, computed **before** anything is
  written.
- `POST /api/admin/campaigns` — validated draft (subject required, body required
  and sanitised through the same allowlist as the blog and email templates),
  audited.
- `POST /api/admin/campaigns/:id/queue` — one `email_outbox` row **per
  recipient**, one address per message, plus one `email_campaign_recipients` row
  pointing at it. Refuses a second queue (409) and refuses an empty audience with
  a message that says why.
- `GET /api/admin/campaigns/:id` — per-recipient state read back from the outbox
  (`sent`, `pending`, `failed`, attempts, last error) plus a `deliveryStatus`
  computed from those rows.
- `POST /api/admin/campaigns/:id/retry` — puts failed messages back in the queue
  with a fresh attempt count; delivered messages are never re-sent.
- `GET/POST /api/email/preferences?token=` — the public preferences page linked
  from every campaign email. It masks the address, explains the difference
  between marketing and account mail, and can stop or resume marketing email.
- `src/components/AdminBulkEmail.tsx` — audience and type, subject, HTML body
  with `{{name}}`, a link/listing/article inserter that searches the real
  listings and published articles, a live recipient count, draft/queue, and a
  delivery table with a retry button.

**One message per recipient, never a list.** There is no `To:`/`Bcc:` list
anywhere: each recipient has their own outbox row, so no recipient can see
another's address and a failure is per recipient. The suite proves this by reading
the stored bodies.

**Marketing is opt-in.** A marketing campaign reaches only addresses whose
`email_preferences.marketing_opt_in = 1`; a *service notice* (account, security,
policy) may reach every account in the audience and still carries the preferences
link. This follows the approved decision that marketing mail is opt-in by default
and transactional mail is separate and non-optional.

### Capabilities

Three new, default-deny, server-checked capabilities: `can_manage_users`,
`can_view_user_activity`, `can_send_bulk_email`. They are granted **only** from
the server console (`php-backend/grant_directory.php --users/--activity/--bulk`),
never over HTTP, and `role = 'admin'` implies none of them. The primary
administrator holds them without a grant. `/api/auth/me` exposes them so the
console can hide screens it cannot use — hiding is a courtesy, every endpoint
re-checks.

Deviation from the audit's §7.1 list, stated plainly: the audit planned six
capability columns in Phase 1. Phase 1 added only `is_primary_admin`; the three
above are added here, when they are actually used. `can_approve_contact_disclosure`
arrives with the disclosure workflow (Phase 5). No permission bit exists on this
branch that nothing enforces.

---

## 2. Files

New: `php-backend/lib/users_admin.php`, `php-backend/lib/campaigns.php`,
`php-backend/grant_directory.php`, `src/components/AdminUserManagement.tsx`,
`src/components/AdminUserProfile.tsx`, `src/components/AdminBulkEmail.tsx`,
`src/components/AdminActivityFeed.tsx`, `tests/user-management.test.mjs`,
`tests/bulk-email.test.mjs`, `tests/admin-console-phase3.test.mts`,
`tests/campaign-fixtures.php`.

Modified: `php-backend/schema.sqlite.sql`, `php-backend/database.sql`,
`php-backend/migrate.php` (three columns), `php-backend/config.php` (loads the two
new libraries), `php-backend/lib/api.php` (routes + handlers),
`php-backend/lib/auth.php` (capability union), `src/types.ts`,
`src/services/apiService.ts`, `src/components/AdminDashboard.tsx` (two tabs and
the feed), `src/routing/routes.ts` (`/admin/users`, `/admin/bulk-email`),
`package.json`, and `tests/api.test.mjs` (the expected capability map of a new
administrator now includes the three default-deny flags).

---

## 3. Test results (all executed here)

| Suite | Result |
| --- | --- |
| `npm run test:api` (11 files) | **345 / 345 pass**, 0 fail, exit 0 |
| `npm run test:user-management` | **15 / 15 pass** |
| `npm run test:bulk-email` | **14 / 14 pass** |
| `npm run test:admin-console-phase3` | **11 / 11 pass** |
| `npm run test:navigation` | 61 / 61 |
| `npm run test:routing` | 50 / 50 |
| `npm run test:blog` | 45 / 45 |
| `npm run test:sharing` | 36 / 36 |
| `npm run test:property` | 23 / 23 |
| `npm run test:uploads` | 20 / 20 |
| `npm run test:responsive` | 18 / 18 |
| `npm run test:blog-html` | 16 / 16 |
| `npm run test:admin-console` | 16 / 16 |
| `npm run test:design` | 14 / 14 |
| `npm run test:access` | 13 / 13 |
| `npm run test:content` | 4 / 4 |
| `npm run test:email-footer` | 3 / 3 |
| `tsc --noEmit` | exit 0 |
| `npm run build` | 2156 modules, built cleanly |
| `php-wasm-cli -l` on every touched PHP file | clean |

The new suites run against a real PHP backend and a real SQLite database; they do
not mock the thing they are testing.

---

## 4. Outstanding / limitations

1. **Delivery is queued, not proven here.** The sandbox has no mail transport
   (`EMAIL_TRANSPORT=none`), so the suite proves queueing, one-address-per-message,
   the preferences link, the failure state and the retry — not a real delivery.
   A live send needs the deployment's Resend key and should be checked once there.
2. **Opt-in is strict.** A brand-new installation has nobody opted in, so the
   composer will say so and refuse to queue a *marketing* campaign until addresses
   opt in; *service* notices still reach everyone. This is the conservative
   reading of the approved decision.
3. **No recipient import.** Audiences come from existing accounts only; there is
   no CSV import, by design.
4. **Campaign status is stored, delivery state is derived.** The stored campaign
   row stays `queued`; the console shows a `deliveryStatus` computed from the
   outbox rows on every read, so a reconciliation job is not needed for it to be
   accurate.
5. **The activity feed is capped** (default 20, max 100 entries) and is not paged
   or filterable yet; the profile history is capped at 50 per kind.

---

## 5. Repository status

- Branch `arena/1dbf260c-goodlucks-rep`, based on `47cea1f`; `main` untouched.
- Schema changes are additive: three columns and three tables, no drops, no
  rewrites of stored values. `migrate.php` applies them idempotently for both
  engines.
- Phase 1 and Phase 2 behaviour is preserved: the primary administrator's
  authority and the tenant-contact privacy suites still pass inside `test:api`.
