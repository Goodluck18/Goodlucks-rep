# Seven-Day Property Availability Renewal, Admin Activity Monitoring and Provider Suspension

**Date:** 10 November 2026
**Branch:** `arena/40f19dd4-goodlucks-rep`
**Scope:** every published listing must be reconfirmed every seven days; Admin and system activity around that rule; formal suspension for **both** Agent and Landlord accounts.

---

## 1. Existing architecture and findings

The repository is a React (Vite) single-page app with a hand-written PHP API (`php-backend/`), no framework and no ORM. The relevant existing pieces were read before anything was changed:

| Concern | Where it already lived | What it did |
| --- | --- | --- |
| Listing lifecycle | `php-backend/lib/validate.php` (`PROPERTY_STATUSES`) | `active`, `pending`, `rejected`, `rented`, `deactivated` |
| Approval funnel | `php-backend/lib/api.php` → `handle_property_status()` | the **only** admin approve/reject path; applied the landlord viewing fee, viewing-terms approval and saved-search alerts |
| Public catalogue | `repository.php` → `query_properties()` | `status = 'active'` was the whole definition of "public" |
| Property payload | `repository.php` → `shape_property()` | camelCase shape with `$exposeProviderDetail` / `$exposeLandlordId` gating |
| Listing gate | `verification.php` → `provider_listing_state()` | classification chosen + identity `approved` (+ a legacy agent-profile suspension flag) |
| Scheduled work | `php-backend/cron.php` | CLI-only, numbered, idempotent steps (saved-search digest, blog scheduling, outbox, retention) |
| Once-only delivery | `alerts.php` → `claim_alert_delivery()` + `alert_deliveries` unique key | used by search/price alerts and provider interest alerts |
| Notifications | `repository.php` → `create_notification()`, `mailer.php` → `send_email()`, `email_html_template()` | in-app + email, one transport |
| Audit | `audit.php` → `audit_log()` | dotted actions, redaction, actor id/role |
| Admin activity | `users_admin.php` → `admin_activity_feed()`, `activity_action_title()` | feed built from real records plus the audit trail |
| Admin console | `AdminDashboard.tsx` + `routes.ts` (`admin.accepted` / `admin.canonical`) | URL-driven tabs; adding a section means a key in both maps, a tab button and a JSX branch |

Two facts shaped the design:

1. **There was no notion of availability time.** A listing approved once stayed public until a human changed its status. Nothing distinguished "the provider withdrew it" from "nobody said anything".
2. **Suspension existed only as `agent_profiles.account_status`.** Landlords had no suspension at all, and an agent's suspension was not consulted by the landlord code paths.

---

## 2. Root cause of the limitations

* `properties` had no publication timestamp and no deadline, so "seven days" could not be computed, let alone enforced.
* Because public visibility was literally `status = 'active'`, a stale listing could only be removed by a human; there was no way for the system to do it, and no way for a provider to confirm.
* `handle_update_property()` silently dropped `status` for non-admins, so the dashboards' "Deactivate"/"Reactivate" buttons were cosmetic for providers — a listing's public state could not be changed by the person responsible for it, only by staff.
* Suspension had no home: it was an agent-profile review flag, so (a) a landlord could not be suspended, and (b) nothing checked it when a listing was approved.

---

## 3. Seven-day renewal implementation

**Schema (extended, not duplicated).** No new `properties.status` value was invented for availability; three timestamp columns carry the cycle:

* `properties.published_at` — first publication (never overwritten, so history survives an expiry),
* `properties.availability_confirmed_at` — the last confirmation,
* `properties.availability_due_at` — the next deadline.

Two lifecycle values were added to the **existing** status vocabulary, because "expired automatically" and "unpublished by suspension" are genuinely different facts from "the provider withdrew it":

* `expired` — no confirmation received; unpublished by the system,
* `suspended` — unpublished because the account is suspended.

`deactivated` keeps its original meaning: the provider said the property is no longer available.

**One derived answer.** `php-backend/lib/availability.php` → `property_availability_state()` maps a row to one of
`not_published`, `active_confirmed`, `due_soon`, `awaiting_confirmation`, `expired`, `unavailable`, `suspended`, `rented`, and returns the labels, the dates, `publiclyVisible`, `canConfirm` and `canDeclareUnavailable`. The provider dashboard, the admin console and the API shapes all read this one function, so they cannot disagree.

**Publication starts the clock.** `start_property_availability_cycle()` writes `published_at` (first time only), `availability_confirmed_at = now`, `availability_due_at = now + 7 days` and records a `published` event. It is called from the two places a listing becomes public: `handle_property_status()` when `status` becomes `active` and the row was not active before, and staff-created listings that start life active.

**Confirming** (`confirm_property_availability()`):

* published → `availability_confirmed_at = now`, `availability_due_at = now + 604800`, event `confirmed`, confirmation notification to the provider;
* `expired` or `deactivated` → republished through the same gates as a new listing (account may list, identity approved, account not suspended), landlord viewing fee re-applied, then a fresh seven-day cycle, event `reactivated_by_provider`, notification.

**Declaring unavailable** (`withdraw_property_availability()`) sets `deactivated`, records `declared_unavailable`, notifies the provider, and deletes nothing.

**Time arithmetic.** Every stored timestamp is UTC (`db_now()` is `gmdate('Y-m-d H:i:s')`) and is parsed as UTC (`availability_timestamp()` appends `Z`/`UTC` before `strtotime`), so seven days is exactly 604 800 seconds regardless of the server's timezone. The constant `AVAILABILITY_PERIOD_SECONDS` is the single definition.

---

## 4. Notifications and scheduling

All messages use the existing infrastructure: `create_notification()` for in-app and `send_email()` + `email_html_template()` for email. Nothing new was built.

| Event | In-app | Email | When |
| --- | --- | --- | --- |
| `reminder` | × | × | 24 hours before the deadline |
| `request` | × | × | at the deadline |
| `expired` | × | × | when the job unpublishes the listing |
| `renewed` | × | × | when the provider confirms |
| `reactivated` | × | × | when the provider republishes |
| `reactivated_by_admin` | × | × | when staff republish |
| `unavailable` | × | × | when the provider declines |
| staff notice | × | — | on automatic expiry, and on provider/admin reactivation |

Each message names the property (title and location) and the deadline, and carries the dashboard path (`/agent/properties` or `/landlord/properties`) both in the in-app text and as a link in the email.

**No duplicates.** Two different guards are used for two different jobs:

* `property_availability_events` has `UNIQUE (property_id, action, cycle_key)` — one reminder, one expiry, one confirmation per seven-day cycle, even across retried or overlapping cron runs;
* `alert_deliveries` (already the exactly-once table) claims the in-app message and the email separately, so a retry of either channel cannot send twice.

**Scheduling.** `cron.php` gained one numbered step (`4. Seven-day availability renewal`) calling `run_property_availability_maintenance($dryRun)`. It is safe to run every 15 minutes and catches up after downtime:

1. deadline inside 24 h → reminder (never extends the deadline);
2. deadline reached (within a one-hour grace window) → confirmation request;
3. still unanswered after the grace window → `expired`, notifications, audit.

A live listing with no deadline (a row created before this upgrade) is given a full period from now on the first pass rather than expired on sight.

---

## 5. Auto-expiry and reactivation

**Expiry never waits for cron to be safe.** `property_is_publicly_visible()` and `availability_public_where_sql()` are the enforcement used by the public paths, so an unconfirmed listing is invisible the moment its deadline passes, whatever the scheduler is doing:

* `GET /properties` (public catalogue) — `availabilityCurrent` filter;
* `GET /properties/{id}` — a non-public listing answers 404 to anyone except staff and the owner;
* `/sitemap.xml`, `/p/{id}` share previews (`property_is_public`), saved-search digest and dispatch (`alerts.php`), tenant matches/recommendations (`/matches`) and the blog property showcase.

**Expiry is a status write, not a delete.** `expire_property_availability()` guards the transition with `WHERE status = 'active'`, records an `expired` event with `actor_role = 'system'`, audits `property.availability_expired` (`automated: true`) and notifies both the provider and staff. Photographs, description, viewing terms, fee history and the original `published_at` are untouched.

**Reactivating.** Two routes, both recorded:

* **Provider** — `POST /properties/{id}/availability/confirm` (the "Confirm Property Availability" button). It re-checks the account gate for the responsible account, so a suspended or unverified provider cannot restore visibility.
* **Admin** — `POST /admin/properties/{id}/availability/reactivate`, which requires a reason (≥10 characters) **and** a stated source of the confirmation ("how was availability established"). It refuses while the responsible account cannot list, records `admin_rejected_reactivation` when it refuses, and on success records `reactivated_by_admin` with the admin, the reason, the source and a new seven-day deadline.

`deactivated` (deliberate withdrawal) is deliberately *not* auto-restored: the provider republishes it through the same confirmation, which is what the Landlord dashboard's "Confirm availability" button does.

---

## 6. Admin activity monitoring

**Availability console** — `GET /admin/property-availability` (+ `adminPropertyAvailability()`), rendered by the new **Property Availability** tab (`/admin/availability`). Each row shows the listing title, its id, the responsible provider (with a `suspended` marker), last confirmation, next deadline, stored status and the most recent availability action (label, actor or "system-generated", note, timestamp).

Filters, with counts computed over the whole catalogue: **All · Active · Confirmation due soon · Awaiting confirmation · Expired · Draft/not approved · Unavailable · Reactivated**, plus a text search over title, location, provider and listing id.

**Activity** — `GET /admin/property-availability/activity` returns one stream with timestamp, actor (name, or `system: true`), event type, affected property/account and detail (reason, note, source), filterable by *confirmations & declines · automatic expiry · reactivations · suspensions & reinstatements* and searchable.

The general admin activity feed (`admin_activity_feed()`) also picks the new audit actions up, now carrying a `system` flag so a cron action is never presented as an administrator's work. New titles were added to `activity_action_title()` for all nine actions.

Events covered: publication, reminder sent, confirmation requested, provider confirmation, unavailable declaration, automatic expiry, provider reactivation, admin reactivation, refused reactivation, suspension-unpublish, reopening after reinstatement, provider suspension and reinstatement.

---

## 7. Landlord suspension

Landlords had no suspension path before. Suspension now lives on the account row, so both classifications share it:

`users.account_status` (`active` | `suspended`), `suspension_reason`, `suspended_at`, `suspended_by`, `reinstated_at`, `reinstated_by`.

`POST /admin/users/{id}/suspension` → `suspend_provider()`:

* Agent **and** Landlord (tenant and admin accounts are refused);
* reason mandatory (≥10 characters) and shown to the provider;
* sets the account row, mirrors the flag onto `agent_profiles` for historical agent screens;
* unpublishes every live listing the account owns or submitted (`status = 'suspended'`, one `suspended_by_admin` event and audit row each), so public visibility ends immediately rather than at the next cron;
* notifies the provider (in-app + email) and every administrator;
* audits `provider.suspended` with the reason, the number of listings unpublished and the identity-verification status at that moment.

What suspension does **not** do: it deletes nothing, it does not touch verification records, fee ledgers, remittances, tenancies or viewing records, and it does not sign the provider out — they keep the dashboard, their records and the ability to withdraw a listing.

---

## 8. Agent suspension integration

`provider_listing_state()` (the single listing gate) now reads **two** sources and treats suspension as outranking verification:

```php
$suspension = user_suspension_state($user);   // users.account_status + legacy agent profile flag
$reason = … 'suspended' … ;                   // checked before identity_approved
```

Consequences, all backend-enforced:

* `POST /properties` (create) → 403 with `fields.accountSuspended` **and** `fields.verificationStatus: "approved"` — the two facts are reported separately so the UI never implies that verifying again would help;
* `PUT /properties/{id}` (edit) uses the same gate;
* `POST /properties/{id}/availability/confirm` (reactivation) → 403 while suspended;
* `POST /properties/{id}/status` (staff approval) refuses to publish a listing whose responsible account is suspended (409) — an administrator cannot approve around a suspension either.

`GET /auth/me` and the verification payload expose `accountStatus` and the suspension record (reason, who, when), and the provider dashboards render `ProviderSuspensionNotice`.

**Reinstatement** (`POST /admin/users/{id}/reinstatement` → `reinstate_provider()`): reason mandatory, clears the account status, records who and when, restores the approved verification and classification untouched (it is never re-run and never revoked), tells the provider and staff — and **republishes nothing**. Every listing suspension unpublished becomes `expired` ("Availability confirmation required") with a `reopened_after_reinstatement` event, so each one needs a fresh confirmation before it is public again.

---

## 9. Database changes and migrations

Additive only; no destructive statement, no column dropped, no data rewritten.

**`users`** (both SQLite and MySQL schemas)

```
account_status    TEXT/VARCHAR(20) NOT NULL DEFAULT 'active'
suspension_reason TEXT/VARCHAR(500)
suspended_at      TEXT/DATETIME
suspended_by      TEXT/VARCHAR(64)
reinstated_at     TEXT/DATETIME
reinstated_by     TEXT/VARCHAR(64)
```

**`properties`** (both schemas)

```
published_at               TEXT/DATETIME
availability_confirmed_at  TEXT/DATETIME
availability_due_at        TEXT/DATETIME     + KEY idx_prop_availability_due (MySQL)
```

**`property_availability_events`** (new, both schemas)

```
id, property_id, action, actor_role (provider|admin|system), actor_id, actor_name,
source, note, cycle_key, due_at, created_at
UNIQUE (property_id, action, cycle_key)
INDEX (property_id), INDEX (created_at)
```

**`migrate.php`** — the six `users` columns, the three `properties` columns and the new table are registered in `$requiredColumns` / `$requiredTables`, plus one idempotent data backfill:

> *"start the seven-day availability clock for listings that are already live"* — for `status = 'active'` rows with a NULL deadline, `published_at` is seeded from `created_at`, `availability_confirmed_at` from `created_at`, and `availability_due_at` from **now + 7 days**.

The backfill never expires or deletes an existing listing: nothing is hidden by shipping this change. `migrate.php` gained support for bound parameters in backfills (needed for "seven days from now").

Verified: dry run lists exactly that one statement; `--apply` reported `(4 rows)` on a seeded database; a second dry run reports *"Schema is already up to date. Nothing to do."*

---

## 10. API and frontend changes

**Endpoints added**

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/api/properties/{id}/availability/confirm` | owner / submitting agent / admin | "still available" — renew, or republish after expiry |
| POST | `/api/properties/{id}/availability/decline` | owner / submitting agent / admin | "no longer available" |
| GET | `/api/properties/{id}/availability/history` | owner / submitting agent / admin | the recorded cycle history |
| GET | `/api/admin/property-availability` | admin | the console, filters + counts |
| GET | `/api/admin/property-availability/activity` | admin | the activity stream |
| POST | `/api/admin/properties/{id}/availability/reactivate` | admin | reactivate with reason + source |
| POST | `/api/admin/users/{id}/suspension` | admin | suspend an Agent or Landlord |
| POST | `/api/admin/users/{id}/reinstatement` | admin | reinstate (never republishes) |

**Shapes.** `shape_property()` gains `availabilityRenewal` (state, label, explanation, dates, `publiclyVisible`, `canConfirm`, `canDeclareUnavailable`, `periodDays`); the detailed block is only returned to the owner, submitting agent and staff. `public_user()` gains `accountStatus` and, for accounts that have one, `suspension`. Directory and profile rows carry `accountStatus` + `suspension`.

**Frontend**

* `src/components/PropertyAvailabilityCard.tsx` — the provider's card: state, deadline, "Confirm Property Availability" and "Mark as no longer available". Used on both the Agent and Landlord listings screens. Presentation only; the server decides visibility.
* `src/components/ProviderSuspensionNotice.tsx` — the suspension notice on both dashboards.
* `src/components/AdminPropertyAvailability.tsx` — the console section: filters with counts, search, rows with provider/deadline/last action, the reactivation dialog (reason + source are mandatory) and the activity panel with system-generated labels.
* `AdminDashboard.tsx` — new `availability` tab; `routes.ts` — `availability` added to `admin.accepted` and `admin.canonical` (`/admin/availability`); `AdminManageListings.tsx` — status filter gains *Expired (no confirmation)* and *Provider suspended*; `AdminUserProfile.tsx` — a suspension/reinstatement panel with a mandatory reason.
* `LandlordDashboard.tsx` — "Deactivate"/"Reactivate" replaced by "Mark unavailable"/"Confirm availability" (the old buttons changed a status field the server ignored for providers), plus state labels for `expired` and `suspended`.
* `apiService.ts` / `types.ts` — the eight methods and the new types (`PropertyAvailabilityRenewal`, `PropertyAvailabilityEvent`, `AdminAvailabilityRow`, `AvailabilityState`; `PropertyStatus` extended).

No frontend timer, no polling and no client-side enforcement is involved anywhere.

---

## 11. Tests executed and actual results

All commands run in this sandbox (SQLite + PHP-WASM; no MySQL, no browser, no real mail).

| Suite | Command | Result |
| --- | --- | --- |
| API (all) | `npm run test:api` | **403 / 403 pass** |
| New availability suite | `node --test --test-concurrency=1 tests/property-availability.test.mjs` | **38 / 38 pass** |
| Listing verification | in `test:api` | 16 / 16 |
| Provider classification | in `test:api` | pass |
| Routing | `npm run test:routing` | 50 / 50 |
| Navigation | `npm run test:navigation` | 64 / 64 |
| Admin console (static) | `npm run test:admin-console` | 16 / 16 |
| Admin console phase 3 | `npm run test:admin-console-phase3` | 11 / 11 |
| Admin console phase 4 | `npm run test:admin-console-phase4` | 12 / 12 |
| Admin console phase 5 | `npm run test:admin-console-phase5` | 19 / 19 |
| Responsive | `npm run test:responsive` | 20 / 20 |
| Design tokens | `npm run test:design` | 14 / 14 |
| Content | `npm run test:content` | 4 / 4 |
| Property SEO | `npm run test:property` | 23 / 23 |
| Sharing | `npm run test:sharing` | 36 / 36 |
| Blog | `npm run test:blog` | 45 / 45 |
| Blog HTML | `npm run test:blog-html` | 16 / 16 |
| Uploads | `npm run test:uploads` | 20 / 20 |
| Email footer | `npm run test:email-footer` | 3 / 3 |
| Tenant experience | `npm run test:tenant-experience` | 11 / 11 |
| Fee policies phase 4 | `npm run test:fee-policies-phase4` | 12 / 12 |
| Provider experience phase 6 | `npm run test:provider-phase6` | 22 / 22 |
| Receipts removed phase 7 | `npm run test:receipts-removed-phase7` | 9 / 9 |
| TypeScript | `npx tsc --noEmit` | clean |
| Production build | `npm run build` | OK (505.59 kB / 147.61 kB gzip) |
| PHP lint | `php-wasm-cli -l` on every changed PHP file | no syntax errors |
| Migration | `migrate.php --dry-run` / `--apply` / `--dry-run` | 1 statement planned → applied (4 rows) → "already up to date" |
| Cron | `cron.php --dry-run` and `cron.php` twice on the dev DB | availability step present, second run a no-op, catalogue intact |

**Named cases in `tests/property-availability.test.mjs` (38):**

1. a newly published listing gets a seven-day confirmation deadline
2. the provider sees the deadline on their own dashboard listing
3. confirming before the deadline renews it for another seven days
4. a second confirmation in the same cycle does not create a second history entry
5. another provider cannot confirm a listing they do not own
6. a listing past its deadline disappears from the public catalogue before the job runs
7. its public detail page is gone and its sitemap entry is gone
8. the provider dashboard still shows the overdue listing
9. the saved-search alert path does not announce an unconfirmed listing
10. a listing due tomorrow gets a reminder and is not expired
11. a reminder never extends the deadline
12. running the job twice sends no duplicate reminder
13. a listing that reaches its deadline is unpublished by the job, with its record intact
14. the expired listing keeps every photograph and its history
15. an expired listing is absent from the public catalogue, matching and recommendations
16. a dry run changes nothing
17. declaring "no longer available" unpublishes without deleting
18. a withdrawn listing stays distinguishable from an automatic expiry
19. a provider can bring an expired listing back by confirming availability
20. staff see awaiting-confirmation, expired and due-soon states with counts
21. each console row names the responsible provider, the deadline and the last action
22. administrative reactivation requires a reason and a confirmation source
23. administrative reactivation records the reason, the source and a new seven-day period
24. the activity console shows automatic events as system-generated
25. a suspended agent cannot publish or submit a listing
26. suspension removes the live listing from public view immediately
27. a suspended landlord cannot publish either, and the rule is the same one
28. the suspended provider can still sign in, read the dashboard and withdraw
29. suspension keeps the property record, its photographs and the financial records
30. reinstatement restores access but republishes nothing
31. the reinstated provider republishes only by confirming availability
32. administrative reactivation is refused while the provider is suspended
33. a suspended provider is refused when it tries to reactivate its own expired listing
34. suspension is recorded with the administrator, the reason and the date
35. tenants still register, sign in and browse
36. the provider whose account was never touched keeps working normally
37. a suspended provider cannot approve-publication through the admin status endpoint
38. a landlord republishes a withdrawn listing only by confirming availability

Date-boundary and timezone coverage is by construction rather than by sleeping: the fixtures move the stored deadline to `-30 s`, `-60 s`, `-2 h`, `+1 h` and `+2 h` relative to the real clock, and every comparison is done in UTC, which is what makes cases 6, 10, 13, 16 and 20 deterministic. Concurrency is covered by re-running the job and by submitting two confirmations back to back (cases 4, 12).

**Live smoke test** (dev server `PORT=43131`, PHP API on 8091, seeded SQLite):
`GET /api/properties` → 200, 4 listings, `availabilityRenewal` present; `GET /api/admin/property-availability` unauthenticated → 401, authenticated → 200 with counts `{all:4, active:4, …}`; `/api/admin/property-availability/activity` → 200; `/api/properties/prop-1/availability/history` → 200; `GET /auth/me` → `accountStatus: "active"`; `cron.php` stamped the four legacy listings then reported no work on a second run; the public catalogue remained at 4.

**Not executed, and therefore not claimed:** no browser or device check (no Chrome/Playwright in this sandbox), no MySQL run, no real email delivery. Manual steps are in section 13.

---

## 12. Git

* Branch: `arena/40f19dd4-goodlucks-rep` (the authorised branch). No other branch was created, switched to or pushed.
* No reset, no force-push, no revert, no history rewrite; the previous work (`6ba5ff3`, `a26eb47`) is intact and this commit sits on top of it.
* Nothing was deployed and no production database was touched.

Files changed: 23 modified, 7 added —

```
php-backend/lib/availability.php              (new)
php-backend/lib/suspension.php                (new)
php-backend/lib/api.php                       (handlers + routes + listing gate)
php-backend/lib/repository.php                (shape_property, query_properties, create/update)
php-backend/lib/verification.php              (suspension joins the listing gate)
php-backend/lib/users_admin.php               (directory profile + activity titles)
php-backend/lib/alerts.php                    (public visibility in alerts)
php-backend/lib/blog.php                      (showcase availability)
php-backend/lib/property_url.php              (share preview availability)
php-backend/lib/auth.php                      (public_user: accountStatus/suspension)
php-backend/lib/validate.php                  (status vocabulary)
php-backend/config.php                        (loads the two new libraries)
php-backend/cron.php                          (availability step)
php-backend/migrate.php                       (columns, table, backfill, bound params)
php-backend/schema.sqlite.sql                 (columns + table)
php-backend/database.sql                      (columns + table, MySQL)
src/components/PropertyAvailabilityCard.tsx    (new)
src/components/ProviderSuspensionNotice.tsx    (new)
src/components/AdminPropertyAvailability.tsx   (new)
src/components/AdminDashboard.tsx              (availability tab)
src/components/AdminUserProfile.tsx            (suspend/reinstate panel)
src/components/AdminManageListings.tsx         (status filter)
src/components/AgentDashboard.tsx              (availability card + notice)
src/components/LandlordDashboard.tsx           (availability card, answers, notice)
src/routing/routes.ts                          (admin.accepted / canonical)
src/services/apiService.ts                     (8 methods)
src/types.ts                                   (statuses, availability, suspension types)
tests/property-availability.test.mjs           (new, 38 cases)
tests/set-availability.php                     (new test fixture)
package.json                                   (test:availability + suite registration)
docs/PROPERTY_AVAILABILITY_AND_PROVIDER_SUSPENSION_2026-11-10.md (this report)
```

Commit: **`6d2ba24`** — *"Seven-day property availability renewal, activity monitoring and provider suspension"*,
pushed to `origin/arena/40f19dd4-goodlucks-rep` (`a26eb47..6d2ba24`).

---

## 13. Remaining limitations and deployment requirements

**Deployment (in this order):**

1. `php /path/to/api/migrate.php --dry-run` → read the one planned statement → `--apply`. It adds the columns and the table and gives existing live listings a fresh seven-day clock; it hides and deletes nothing.
2. Leave the existing cron entry in place (every 15 minutes). The availability step is appended to it; no new cron line is needed. Confirm by running `php api/cron.php --dry-run` once — it must print an `Availability:` line.
3. No cache or asset step beyond the normal build (`npm run build`), which was run here.
4. Nothing else: no new environment variables, no new dependency, no new service.

**Known limitations and honest caveats:**

* **A null deadline is treated as "public".** Rows created before this upgrade have no deadline until the migration or the first cron pass stamps them. That is deliberate — otherwise every existing listing would vanish the moment this ships — but it means the cron job should be confirmed running immediately after deployment. Once stamped, the rule is absolute.
* **Expiry status write has a one-hour grace window** (`AVAILABILITY_EXPIRY_GRACE_SECONDS`). Public visibility ends at the deadline itself (enforced in the queries); the status write happens up to an hour later so a provider confirming at the deadline renews rather than resurrects. This is visible in the code and in case 13/6 of the suite.
* **No browser or device check was possible here** (no Chrome/Playwright). Manual checks to run on a real deployment: open `/provider` dashboards at 360 px and 1280 px and confirm the availability card and suspension notice layout; open `/admin/availability` and exercise each filter, the search, the reactivation dialog (including the disabled state until a reason and source are entered) and the activity panel; confirm a mobile view of the provider card does not overflow.
* **No MySQL run.** The MySQL schema was updated to match, but the migration was only executed against SQLite here; run `migrate.php --dry-run` on staging MySQL first.
* **No real email was sent.** Delivery uses the existing `send_email()` path with `EMAIL_TRANSPORT=none` in tests; verify one reminder lands in a real inbox after deployment.
* **The landlord "Mark rented" button still changes a status the server ignores for providers** (pre-existing behaviour, unrelated to this task and left untouched to avoid changing an approval-adjacent rule without a decision).
* **Landlord fee policy on reactivation:** republishing a landlord listing re-applies the administrator's general viewing fee, exactly as publication does. If no fee is configured, the listing is still republished without a fee, as before.
