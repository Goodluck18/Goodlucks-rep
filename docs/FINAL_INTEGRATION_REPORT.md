# Final Integration Report — Goodlucks Homes

**Repository:** `Goodluck18/Goodlucks-rep`
**Release:** Increments 0, A–G plus the non-numbered improvements, committed and pushed to `main`
**Date:** 3 November 2026
**Deployment:** **none.** Nothing was deployed, no hosting configuration was changed, no production database was read or written.

This report distinguishes three states throughout:

- **Implemented** — the code exists in this repository.
- **Tested** — a named command was actually executed and produced the stated result.
- **Independently verified** — a human or an external system confirmed the behaviour outside this sandbox. **Almost nothing in this project is in that third category**, and where it is not, this report says so.

---

## 1. Increments 0 and A–G

| Increment | What it delivered | State |
| --- | --- | --- |
| **0 — Security & privacy hardening** | The seven audit findings S1–S7: server-side authorisation on every write, no client-supplied roles, sanitised errors, rate limits, hashed passwords, protected uploads, audit logging. | Implemented, tested |
| **A — Retire tenancy agreements** | Removed the tenancy-agreement feature the platform could not lawfully or practically support; receipts and payment records kept. | Implemented, tested |
| **B — Truthful viewing-fee accounting** | The `viewing_fee_records` / `fee_remittances` ledger. An agent's collected fee is **not** revenue; the Goodlucks share stays `NULL` until someone explicitly agrees it. Honest receipts. | Implemented, tested |
| **C — Agent account foundation** | Agent registration, profile, account status (`pending_review` → `active` / `suspended`), least-privilege capabilities, listing submission on a landlord's behalf with the declaration recorded as a *claim*, never as proof. | Implemented, tested |
| **D — Agent verification & professional authorisation** | Identity and professional documents in a private store (outside the public uploads directory), AES encryption for identity numbers, masked reads, reviewer console, retention job, separate `can_review_verifications` / `can_access_identity_documents`. | Implemented, tested |
| **E — Fee policies & agent tiers** | A versioned policy engine: draft → pending approval → approved → active → deactivated, with a two-person rule (the creator can never approve their own policy), immutable per-transaction snapshots with hashes, and Standard/Professional tiers. The 60/40 and 70/30 splits remain **provisional and inactive**; no policy exists in the database. | Implemented, tested |
| **F — Agent-led viewing lifecycle** | Twelve-state viewing lifecycle (request → slot proposal → confirmation → reschedule/cancel/complete/no-show), agent queue, tenant and landlord visibility, audited admin corrections behind a separate capability. Completing a viewing records **no money**. | Implemented, tested |
| **G — Remittances, reconciliation, rental commissions** | Claims vs receipts, allocation to obligations, partial settlement, unmatched funds, reversals, a separate rental-commission workflow, and two new finance capabilities. See `docs/INCREMENT_G_REPORT.md`. | Implemented, tested |

### Non-numbered work included in this release

- The landing, browse, property-detail, "find a home", about and notification interfaces, brought in line with what the backend actually does.
- Removing the tenancy-agreement screen and its routes (Increment A).
- Marketing copy that claimed verification the platform does not perform — corrected in 20+ places (§6).
- `scripts/dev.mjs`, `scripts/php.mjs` (a PHP-WASM fallback so the app runs without a system PHP), `.github/workflows/ci.yml` (verification only — **no deploy step**), `CPANEL_DEPLOYMENT_GUIDE.md`, `.env.example`.
- Test tooling: `tests/create-user.php`, `tests/create-receipt.php`, `tests/finance-fixtures.php`, `tests/read-verification.php`, `tests/helpers.mjs`.

---

## 2. Major functionality

**Public:** property catalogue with filters/search/sort/pagination, property detail with view counting, enquiry and viewing-request submission, alerts, SEO metadata.

**Tenant:** own viewings and their lifecycle, saved properties, receipts, notifications, verification-free access to nothing private.

**Landlord:** own listings, moderation state, viewings on their own properties only.

**Agent:** account profile and operating base, listings submitted for a named landlord (declared, not proven), identity and professional document upload and review state, own viewing queue and lifecycle actions, and — since G — their own money position and the ability to *claim* a remittance.

**Administrator:** approval queue, listing management, agent accounts, viewing console with audited corrections, verification queue with masked data, fee policies (capability-gated), the fee ledger, and — since G — reconciliation, confirmation of receipt, commission workflow and adjustments.

**System:** outbox-backed transactional email, in-app notifications, append-only audit log, retention job, rate limiting, CSRF-safe same-site session cookies.

---

## 3. Database changes and migrations

| Area | Change | Engines |
| --- | --- | --- |
| 0–C | Baseline 9 tables plus users/properties/agent profiles/identity tables; additive columns only | SQLite + MySQL |
| D | `identity_verifications`, `professional_authorisations`, verification documents, reviewer capabilities | SQLite + MySQL |
| E | `fee_policies`, `fee_policy_snapshots`, `fee_policy_events`, two policy capabilities | SQLite + MySQL |
| F | Viewing lifecycle columns and history, `can_correct_viewings` | SQLite + MySQL |
| G | Five new tables (`remittance_submissions`, `remittance_allocations`, `rental_commissions`, `commission_payments`, `financial_adjustments`), four `fee_remittances` columns, two `users` capabilities, one submission column | SQLite + MySQL |

`php-backend/schema.sqlite.sql` is complete and current. `php-backend/database.sql` is the MySQL schema, and `php-backend/migrate.php --apply` upgrades an **existing** MySQL installation: it creates missing tables (parsed from `database.sql`), adds missing columns from `$requiredColumns`, and adds missing indexes. Every change is additive; no row is rewritten and nothing is dropped.

Handling an existing SQLite file is unchanged and still limited: `migrate.php` refuses to upgrade one in place and prints the `sqlite3 … < schema.sqlite.sql` command instead. That is why a new dev database file is created for each run rather than reusing `.data/dev.sqlite`, which remains untouched.

---

## 4. API and frontend integration

- One client module (`src/services/apiService.ts`) is the only path to the server; nothing critical is cached client-side.
- Every panel renders server state; there is no optimistic "pretend it worked" write anywhere in the finance surfaces.
- Since G the frontend also carries the capability flags (`financeView`, `financeConfirm`) so controls can be hidden — but the server re-checks every call, so hiding a button is never the boundary.
- Errors carry field maps (`{fields: {amountGhs: "…"}}`), which the new forms display inline.

---

## 5. Security and permissions

| Control | Implementation |
| --- | --- |
| Authentication | Server sessions, HTTP-only cookies, hashed passwords, admin console behind a separate login plus an access key when configured |
| Authorisation | `require_auth([...roles])` plus capability checks on every sensitive route; no role, tier or amount is ever taken from the client |
| Capability model | Verification review, identity-document access, viewing corrections, fee-policy manage, fee-policy approve, **finance view**, **finance confirm** — seven independent flags, all default deny, all granted only from the server console |
| Agent isolation | Every agent endpoint derives the agent from the session; a foreign id is a 404, not a 403 |
| Identity documents | Private store outside the web root, `.htaccess` denial, encryption for identity numbers, masked reads without the document capability, retention purge |
| Financial integrity | Confirmation only by `financeConfirm`; allocations validated against ownership, outstanding balance and the claimed amount; unique index prevents duplicate allocation; corrections only as linked records |
| Audit | Every financial action, verification decision, capability change and viewing correction writes an append-only audit row |
| Rate limits | Registration, viewing creation and viewing actions in separate buckets |
| Marketing honesty | No property is described as "verified" unless the system actually verified it |

**Deliberate behaviour changes shipped in this release** (each with a test): an administrator without `financeView` can no longer read the fee ledger; a verification reviewer loses that read too; an empty viewing cancel `note` no longer suppresses the reason in notifications; the invented agent names are gone.

---

## 6. Financial accounting design

The invariant is one sentence: **a collection is a report, an entitlement is an agreement, a remittance is a claim, and only a confirmation is money.**

- The Increment B ledger (`viewing_fee_records` + `fee_remittances`) remains the single source of truth for money applied to viewing fees. G adds claims and allocations *around* it rather than a second set of books.
- `fee_remittances` holds positive rows for confirmed receipts and negative rows for reversals; nothing is ever edited or deleted.
- `confirmed = applied + unallocated`, asserted in the suite, so nothing is counted twice.
- Revenue reporting has exactly two lines (viewing-fee remittances, rental commissions). Agent collections and unconfirmed claims never appear in it.
- Rental commissions live in their own tables, are never generated by an event, and cannot be priced by an unapproved policy.

---

## 7. Automated tests actually executed

| Command | Result | Log |
| --- | --- | --- |
| `npm run test:api` | **175 tests, 175 pass, 0 fail, 29 suites, exit 0** | `/tmp/g-suite-6.log` |
| `npx tsc --noEmit` (also `npm run lint`) | exit 0 | — |
| `npm run build` | exit 0; new panels present in the emitted bundles | `/tmp/g-build2.log` |
| `php-wasm-cli -l` on every changed PHP file | no syntax errors | — |
| Live smoke script against a disposable dev DB | 39/39 assertions | `/tmp/g-smoke.mjs` |

The 175 tests include the 163 from increments 0/A–F (unchanged except the three deliberate assertions listed in §5) and 12 new Increment G tests. They cover auth and permissions, tenant/agent/admin workflows, the viewing lifecycle, receipts and audit, fee policies and tiers, financial reconciliation, commission arithmetic, and the regression surface of every earlier increment.

---

## 8. Browser and mobile verification

**Not performed.** This sandbox has no browser (no Chromium, Chrome, Firefox, Playwright or Puppeteer), so nobody has looked at the new agent finance panel, the admin finance tab, or any other screen at any viewport width.

What *was* verified: the components type-check, the production bundle builds and contains both panels, the dev server serves the app and proxies `/api`, and every endpoint the panels call was exercised over real HTTP with real sessions.

**This is the largest outstanding gap in the release.** Do not read this report as saying the interface was seen working.

---

## 9. MySQL / MariaDB status

**Not executed.** No MySQL or MariaDB server and no Docker are available here, so `database.sql` and the `migrate.php` additions have never been run. Nothing in this release should be described as MySQL-compatible on the strength of reading the DDL.

The DDL was written to the same conventions as the increments that came before it (InnoDB, `utf8mb4`, `VARCHAR(64)` ids, `DECIMAL(10,2)` money, explicit keys, no destructive statements), and `migrate.php` runs in dry-run mode by default. That is a design argument, not evidence.

---

## 10. Outstanding limitations

1. No screen-level verification (§8).
2. No MySQL/MariaDB execution (§9).
3. Partial confirmation of a remittance is not modelled — confirm in full, or reject and resubmit.
4. Confirmed-but-unallocated money is visible but has no follow-up allocation screen; it must be re-applied through a new claim.
5. No receipt document is issued for a confirmed remittance.
6. `is_landlord_verified` still defaults to 1 on legacy rows; the wording is now honest, the data flag still needs a business decision.
7. `awaiting_agent` remains defined and never assigned (Increment F finding D3) — documented, not silently changed.
8. Ghana rental-commission licensing and tax treatment is unreviewed; the platform nowhere claims the arrangement is legally approved.
9. Email delivery depends on a configured provider; without one, mail is queued in the outbox and never sent. No SMS or WhatsApp integration exists and none is claimed.
10. Rate limits are per-IP and in-memory, so a multi-instance deployment would need a shared store.

---

## 11. Required server configuration

```ini
APP_ENV=production
APP_URL=https://<your-host>
ALLOWED_ORIGINS=            # optional, comma separated

DB_DRIVER=mysql
DB_HOST=localhost
DB_NAME=<cpanel-prefixed database>
DB_USER=<user>
DB_PASS=<password>

ADMIN_ACCESS_KEY=<long random string>     # protects the admin console login
IDENTITY_DATA_KEY=<base64 32-byte key>    # encrypts identity numbers
RESEND_API_KEY=<key>                      # optional; without it mail is queued only
RESEND_FROM_EMAIL=rentals@goodlucks.co
VERIFICATION_RETENTION_DAYS=365
```

Keep `.env` out of the repository (it is git-ignored). Grant capabilities only from the console:

```bash
php php-backend/admin_bootstrap.php --email=you@example.com --password='…' --name='…'
php php-backend/grant_reviewer.php --email=… --reviewer=1 [--documents=1]
php php-backend/grant_viewing.php  --email=… --correct=1
php php-backend/grant_finance.php  --email=… [--manage=1] [--approve=1] [--view=1] [--confirm=1]
```

`CI` (`.github/workflows/ci.yml`) is verification only: `npm ci`, `npm run lint`, `npm run test:api`, `npm run build`, and an artefact smoke test. It contains no deploy step and touches no production database.

---

## 12. Recommended server testing procedure

1. **Back up** the production database with `mysqldump` (or the cPanel export) and store it off-server.
2. Run `php php-backend/migrate.php` (dry run) against a **copy** of the production database. Read the plan. Nothing is written in this mode.
3. Run `php php-backend/migrate.php --apply` against that copy, then `SHOW TABLES` and `DESCRIBE` the five G tables plus `fee_remittances` and `users`; confirm the new columns exist and no existing column changed.
4. Point the API at the copy and run the suite's smoke script. In particular: submit a remittance as an agent, confirm it as a `financeConfirm` administrator, and check `GET /api/admin/finance/summary` shows `confirmed = applied + unallocated`.
5. Repeat for a policy-priced commission once an approved `rental_commission` policy exists — do **not** create one merely to test.
6. Exercise the interface in a real browser at 360 px, 768 px and 1280 px: agent finance panel, admin finance tab, the confirm/reject flow, and a commission payment.
7. Only then apply the migration to production, during a quiet window, with the backup in hand.

---

## 13. What is *not* claimed

- Not launch-ready: no browser pass, no MySQL execution, no production data check.
- No deployment was performed and none is authorised by this release.
- No production database was read or modified.
- No legal or tax review of the commission arrangements has taken place.

---

## 14. Commit and release details

See `docs/RELEASE_NOTES.md` for the exact commits, the branch/merge result and the remote verification recorded at release time.
