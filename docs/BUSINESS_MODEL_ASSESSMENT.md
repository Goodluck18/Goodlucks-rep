# Goodlucks Home — business-model reconciliation assessment

> **Status: assessment only.** No code, schema, data or configuration was changed. No commit or push was made.
> Branch `arena/a67485fb-goodlucks-rep`, HEAD `43b410f`, working tree clean.
> Written 2026-10-31. Every claim below was checked in the working tree during this session; anything that
> could not be checked is listed as such in §A.4 and §H.

---

## A. Current repository state

### A.1 Branch and history

| Item | Verified value |
| --- | --- |
| Branch | `arena/a67485fb-goodlucks-rep` (active) |
| HEAD | `43b410f` — "Close the Phase 1 security findings (Increment 0)" |
| Parent | `bb36206` — "Add the Phase 1 audit for the agent platform programme" |
| Before that | `cbd5ced` — merge of PR #2 (outbox/reliability work) |
| Working tree | clean (`git status --short` empty) |
| Remote | `origin/arena/a67485fb-goodlucks-rep` exists and is at `43b410f` |
| `43b410f` in history | yes (`git branch --contains 43b410f --all` returns the branch and its remote) |

### A.2 Increment 0 — claimed vs present (spot-checked in source, not trusted from the report)

| Claimed | Verified in code |
| --- | --- |
| Agreement/receipt reads scoped server-side | `list_agreements(?array $user, int $limit)` and `list_receipts(?array $user, int $limit)` in `lib/repository.php`; handlers pass `require_auth()` user (`lib/api.php`) |
| Party-membership checks on read/sign/email | `user_can_read_agreement()`, `user_can_sign_agreement()` (admins refused), `user_can_read_receipt()`; `handle_sign_agreement()` and `handle_email_agreement()` call them |
| Ghana Card masking | `mask_identity_number()` + `idsMasked` in `shape_agreement()`; phone-key matching in `phone_key()` / `find_user_by_phone()` |
| Audit trail | `audit_logs` present in `database.sql`, `schema.sqlite.sql`, `migrate.php`; `lib/audit.php` (writer, redaction, reader); `GET /admin/audit-logs` (admin-only) |
| Private document storage | `lib/private_storage.php`, `PRIVATE_UPLOAD_DIR` in `config.php`, `php-backend/storage/private/{.htaccess,.gitignore}` |
| Additive columns, both dialects | `landlord_user_id` / `tenant_user_id` on `tenancy_agreements` and `rent_receipts` in all three schema surfaces |
| Upload containment | `handle_serve_upload()` resolves `realpath()` and requires the file to sit inside `UPLOAD_DIR` |
| Tests | 93 tests / 21 suites, including the `Agreement & receipt access control` suite |

**Important verified finding:** the private-storage helpers are **not connected to any route**.
`store_private_document()` / `serve_private_document()` are never called from `lib/api.php` or `router.php`;
there is no upload endpoint, no review screen, no download endpoint. The Increment 0 report said this
explicitly ("foundation, no route wired"); it remains true. Nothing in the platform currently accepts,
stores, reviews or serves an identity document.

### A.3 Checks re-run in this session (not replayed from the earlier report)

```
$ npm run test:api   → # tests 93  # suites 21  # pass 93  # fail 0
$ npm run lint       → tsc --noEmit, no output (clean)
$ npm run build      → vite build ✓, dist/server.cjs 3.9kb
```

### A.4 What could not be verified here

- **MySQL behaviour.** No MySQL server in this environment. `migrate.php` uses `SHOW TABLES` / `SHOW COLUMNS`
  and is MySQL-only; the MySQL DDL and the migration path have been reviewed and the table-extraction regex
  was checked against `database.sql`, but **no statement has been executed against MySQL**.
- **Production data.** No access to the production database: the number of historical agreements, receipts
  actually printed and handed out, or identity data held is unknown.
- **Live host behaviour.** Whether Apache honours `AllowOverride` for `php-backend/storage/private/.htaccess`,
  and whether the site forces HTTPS/HSTS, cannot be checked from the repository.

---

## B. Tenant registration

### B.1 What exists today

`handle_register()` (`lib/api.php:174`) requires exactly: `name` (min 2), `email`, `phone`, `password`
(min 8). Optional: `preferredLocations[]`, `budgetMin`, `budgetMax`, `preferredBedrooms`.
`role` is coerced to `tenant` unless `landlord` is requested (`one_of($input['role'] ?? 'tenant', ['tenant','landlord'], 'tenant')`).

The UI (`src/components/AuthModal.tsx`) shows: role toggle (Tenant / Landlord), full name, phone, email,
password. Nothing else.

**Conclusion: tenants are already not asked for Ghana Card, passport, bank statements, employment records or
any document at registration.** The requirement "do not require identity documents at tenant registration"
is satisfied today, at both API and UI level.

### B.2 Fields held on `users` and which are essential

| Column | Used for | Assessment |
| --- | --- | --- |
| `id, email, name, role, phone, password_hash` | authentication/identity of the account | essential |
| `address` | free text "location", shown on tenant profile | **essential but mis-modelled** — it is the only place a tenant's city/town can go; currently optional and not requested at registration |
| `preferred_locations` (JSON) | tenant areas of interest | essential to the model; not collected at registration |
| `budget_min/max`, `preferred_bedrooms`, `additional_notes` | matching | optional, appropriate |
| `bio`, `company` | profile text | optional; `company` is landlord/agency oriented, harmless for tenants |
| `avatar` | profile image (URL or `/api/uploads/...`) | optional |
| `is_verified` | "verified" badge exposure via `public_user()` | **inappropriate as-is** — auto-set to `1` for every landlord at creation (`create_user()`), never set for tenants by any process, no UI to change it |
| password reset / sessions | `auth_sessions`, `password_resets` | unaffected |

There is no email-verification or phone-verification mechanism anywhere in the code: no token table, no
verification endpoint, no verified-at timestamp. Contact verification (requirement §4) does not exist yet.

### B.3 Recommended changes

1. **No schema change needed to satisfy the tenant requirement.** Keep the API contract; add an optional
   `city`/`town` field at registration (either a new nullable `users.city` or documented use of `address`
   as "city/town"). A new column is cleaner and additive; reusing `address` avoids a migration but keeps the
   mis-modelling.
2. **Do not require** `budgetMin/budgetMax/preferredBedrooms` at registration; keep them optional (already true).
3. **Contact verification (email and/or phone) is a separate increment** and needs: a token table, a mail/SMS
   path, a `contacts_verified_at` column, and UI. It must be described as *contact* control, never identity.
4. **Stop exposing `isVerified`** as if it meant anything (see §D.3).

**Files affected (proposed, not done):** `lib/api.php` (register/profile handlers), `lib/repository.php`
(`create_user`, `public_user`), `src/components/AuthModal.tsx`, `src/context/AppContext.tsx`, `src/types.ts`,
`database.sql` + `schema.sqlite.sql` + `migrate.php` if a `city` column is added.

**Compatibility:** all changes additive and nullable; existing tenants keep working; no authentication or
password field touched.

---

## C. Agent verification

### C.1 What exists

- **No agent role.** `USER_ROLES = ['tenant', 'landlord', 'admin']` (`lib/validate.php:18`). Registration
  silently coerces `agent` → `tenant`; there is no agent profile, dashboard or permission.
- **"Agent" is a string.** `viewing_schedules.assigned_agent` and `tenant_requests.assigned_agent` are
  `VARCHAR` free text defaulting to `'Goodlucks Field Agent'` / `'Goodlucks Intermediary Desk'`
  (`database.sql:113,135`). `handle_create_viewing()` hardcodes `'assigned_agent' => 'Goodlucks Field Agent'`
  (`lib/api.php:1482`). Only an admin can change it, and only to another free-text string.
- **No commission, tier or share logic anywhere.** `commission`, `tier`, `share`, `remittance`, `settlement`
  and `ledger` do not appear in the schema. The only money configuration is
  `define('VIEWING_FEE_GHS', (float)cfg('VIEWING_FEE_GHS', 100))` (`config.php:138`).
- **Per-viewing fee amount is stored** (`viewing_schedules.fee_amount_ghs`, `viewing_fee_paid`) — a useful
  starting point, but there is no rate snapshot, no split, no payer/recipient distinction.
- **No identity-document capability.** The helpers exist but are unwired (§A.2); nothing writes to
  `PRIVATE_UPLOAD_DIR`.
- **No admin review surface.** Admin tabs are `analytics | approval-queue | manage | matching | viewings |
  enquiries | email-logs` (`AdminDashboard.tsx:87`). There is no user/agent list, no verification queue.
- **No authorisation concept.** Nothing in the schema distinguishes identity, professional authorisation,
  internal approval or account status.

### C.2 What the corrected model requires (gap list)

| Requirement | Gap |
| --- | --- |
| Stage A account registration (name, email, phone, password, agency name) | agent role does not exist |
| Stage B identity vs professional authorisation, separate statuses | no status fields, no verification case model |
| Document upload + review + decision trail | no route, no table, no screen (helpers only) |
| Default permissions that deny operational activity until approved | no permission model; property creation is landlord/admin only today |
| Tier (Standard 60/40, Professionally Verified 70/30) configurable by admins | no settings table; rates must not be hardcoded |
| Per-transaction rate snapshot for historical accuracy | not implemented |
| Agent must not set their own tier/share | nothing exists to protect yet |

### C.3 Whether the 60/40 and 70/30 rates are present

They are **not** in the code. No CSV, config, seed or SQL contains them. `VIEWING_FEE_GHS` (GH₵100) is the
only fee constant, and it is used in six places (`config.php:138`, `lib/api.php:1435,1504,1535`,
`lib/repository.php:88,847`, `lib/alerts.php:116`, `repository.php:1421`) — i.e. exactly the "hardcoded in
several places" pattern the requirement warns against.

---

## D. Optional landlord registration

### D.1 Current onboarding

Landlords self-select "Landlord" at registration (`AuthModal`), then may create listings
(`handle_create_property()` requires role `landlord` or `admin`, `lib/api.php:651`). Every landlord listing is
forced to `status='pending'` and appears in the admin approval queue. `landlord_id` on the property is forced
to the creating user; `landlord_name` is forced to the creator's name (`lib/api.php:664-670`).

**Consequence:** an agent (or anyone) cannot submit a listing *on behalf of* a landlord. Since the corrected
model makes agent-submitted listings a first-class path, this is a real gap: it must become an explicit,
permissioned flow ("acting for landlord X with documented authority") rather than a silently renamed field.

### D.2 Location modelling

| Concept required | Where it lives today |
| --- | --- |
| Landlord contact/residential location | `users.address` (single free text, optional, never requested at registration) |
| Property location/address | `properties.location` + `properties.city` — correct and separate |
| Agent contact/residential location | does not exist |
| Agent operational base | does not exist |
| Communities/areas an agent serves | does not exist (`users.preferred_locations` is a *tenant* preference list) |

So the landlord-residence vs property-location distinction is **structurally supported** (two different
tables) but the landlord residence is not collected and there is no separate "location of each property
owned or managed" beyond the listing itself. Agent locations have no home at all.

### D.3 Verification and ownership

- `properties.is_landlord_verified` is toggled by an admin (`AdminDashboard.tsx:736`,
  `POST /properties/{id}/verify`). It is a badge with **no evidence record**: no document, no reviewer, no
  date, no note. Admin-created listings are auto-set to `1` at creation (`lib/api.php:672`).
- `users.is_verified` is auto-set to `1` for every landlord at registration (`create_user()`), and exposed to
  the client as `isVerified`. It therefore does not mean anything.
- There is **no ownership or authority evidence** concept (no title, no mandate, no letter of authority).
- The landlord submission email promises "Our team will physically verify the property before it goes live"
  (`lib/api.php:698`) — a process claim the code does not support beyond a manual badge.

**Required changes:** separate `identity_status` / `ownership_or_authority_status` / `internal_approval_status`;
evidence records; admin decision with audit; stop auto-verifying landlords at registration; make the badge
truthful or remove it.

---

## E. Agreements and receipts

### E.1 Agreement surface — complete inventory (verified by grep, both ends)

| Layer | Items |
| --- | --- |
| Routes (5) | `GET /agreements/{id}`, `GET/POST /agreements`, `POST /agreements/{id}/sign`, `POST /agreements/{id}/email` (`lib/api.php`) |
| Backend | `handle_list_agreements`, `handle_create_agreement`, `handle_get_agreement`, `handle_sign_agreement`, `handle_email_agreement`; `create_agreement`, `sign_agreement_by_id`, `find_agreement`, `list_agreements`, `user_can_read_agreement`, `user_can_sign_agreement`, `user_is_agreement_*` |
| Database | `tenancy_agreements` (with `landlord_ghana_card`, `tenant_ghana_card`, signatures, `verification_code`); `migrate.php` required columns |
| UI | `src/components/TenancyAgreementView.tsx` (1,334 lines, tab 1 = agreement generator, tab 3 = mixed vault); nav entry "Agreements & Receipts" in **three** Navbar variants; `TenantDashboard` button; `LandlordDashboard` button; `AdminDashboard` "Vault" button |
| State/services | `AppContext` (state, loaders in 3 role branches, create/sign/email actions), `apiService` (5 methods), `types.TenancyAgreement` |
| Tests | 2 suites (`Agreements & receipts`, `Agreement & receipt access control`), 62 mentions |
| Copy/docs | `README.md` (2 places), `HomeView`, `AboutView`, `ListPropertyView`, `FindAHomeView`, backend emails, `docs/SECURITY_INCREMENT_0.md`, `docs/AGENT_PLATFORM_AUDIT.md` |

**Dependencies that matter for retirement:**

- **No foreign keys or id references** from receipts, properties, viewings or enquiries point at
  `tenancy_agreements`. There is no `agreement_id` anywhere. Historical agreements are self-contained rows.
- **The receipts feature shares the same component and the same nav entry.** Removing "Agreements" without
  splitting this component would delete the receipts UI too.
- Audit actions (`agreement.*`) will simply stop being written once the routes are retired; existing rows stay.

**Recommended retirement (per your instruction: recommend, do not delete):**

1. **Retire the user-facing agreement workflow now** — no create, sign, email or generator UI; remove the nav
   entry in all three variants, the two dashboard buttons and the admin vault button; split receipts into
   their own view.
2. **Keep the tables, rows and private data untouched** until a retention/archival decision is approved.
3. **Keep read-only admin access** (list + single read) behind an explicit flag until archival — but stop all
   write paths (`create`, `sign`, `email`). Retiring writes is a code change with no data migration.
4. **Update the copy** that advertises document drafting/signing (marketing pages, README, audit doc) and the
   legal-sounding claims in About/ListProperty ("execute secure tenancy contracts").
5. **Do not** drop columns/tables in the same increment. A later, separately approved increment can archive
   the rows to an export and then drop.

**Risk of retiring:** any live user mid-flow loses the feature; staff may still rely on the digital documents.
This is a business decision, not a technical one (see §H).

### E.2 Receipts — what is actually there and what is wrong

Current behaviour:

- `POST /receipts` (admin or landlord) writes `rent_receipts`: property, tenant name/phone, landlord name,
  amount, purpose, method, transaction ref, payment date, `issued_by`, verification code.
- The printed document (`TenancyAgreementView.tsx`, receipt tab) carries the **Goodlucks Homes** masthead with
  the registered-company line, a **"PAID / GOODLUCKS VERIFIED"** stamp, "RECEIVED FROM (TENANT)",
  "ISSUED ON BEHALF OF (LANDLORD)", "Verified Goodlucks Homes Intermediary Stamp" and a signature block
  labelled **"Authorized Finance Officer"** — and "TOTAL PAID".
- `physicalRevenueGhs` = `paid viewings × VIEWING_FEE_GHS` (`lib/repository.php:1421`), rendered in the admin
  dashboard as **"Physical Viewing Fee Revenue"** (`AdminDashboard.tsx:564`), and the test suite asserts it
  increases by the full GH₵100.

**Why this contradicts the corrected model**

1. A receipt in Goodlucks' name is generated for **rent paid directly to a landlord**. Goodlucks did not
   receive that money, yet the document states Goodlucks verified and received it.
2. Viewing fees are **collected in cash by the agent**, but the dashboard books **100% as Goodlucks revenue**
   and the schema has no split, no receivable and no remittance — so the 60/40 and 70/30 model is invisible
   and the numbers presented are overstated.
3. There is no distinction between "reported", "confirmed" and "received"; anyone with the landlord role can
   print a Goodlucks-stamped receipt for any tenant name/amount (the receipt row is not tied to a property
   record or a booking).
4. There is no receipt-side authorisation evidence beyond `issued_by` text.

**What stays useful:** the receipt numbering (`GHL-REC-…`), verification code, print layout, scoped reads
(Increment 0), audit rows, per-record amounts and dates, and the landlord/tenant/property fields.

**What must change:** who the document says received the money; what it may be issued *for*; separate
categories for viewing fees vs rent vs commissions; confirmation/dispute state; and the revenue arithmetic.

**Proposed category model (7 categories from your brief)** — one `transaction_records` table with a
`category` enum, `payer_type/payer_id`, `recipient_type/recipient_id`, `amount_ghs`, `currency`,
`property_id`, `agent_id` (nullable), `reported_by`, `reported_at`, `confirmation_state`
(`reported|tenant_confirmed|disputed|goodlucks_received|reconciled`), `rate_snapshot_json`, `external_ref`.
Goodlucks issues a **receipt** only for categories 3, 6 and 7 (money it actually received). Categories 1, 4
and 5 produce **records**, not Goodlucks receipts; a landlord/agent confirmation is labelled as such.

**Legacy `rent_receipts`:** keep the table and rows, mark the document as a legacy record on render, and
stop creating new Goodlucks-branded rent receipts. Do not delete.

---

## F. Security and migrations

### F.1 Increment 0 controls that remain useful (keep)

| Control | Why it still matters |
| --- | --- |
| `audit_logs` + `lib/audit.php` (redaction, admin-only reader) | the verification, financial and remittance flows will need exactly this |
| Viewer-scoped reads (`list_receipts`, `user_can_read_receipt`) | applies directly to the new transaction/receipt model |
| Party-membership rules (`user_can_*`) | reusable for verification documents and transaction confirmations |
| Ghana Card masking + `idsMasked` | still relevant while legacy agreements exist and for future identity data |
| `handle_serve_upload()` path containment | protects the public image path |
| Additive, nullable columns + three-surface schema discipline | the only safe way to migrate a live DB |
| `find_agreement` / `find_receipt` scoped single reads | small, reusable patterns |

### F.2 Controls that apply only to the legacy agreement workflow (freeze, then retire with it)

Sign/email/identity-view audit actions, `user_can_sign_agreement()`, agreement JSON shapes with Ghana Card
fields, `idsMasked` hydration in `TenancyAgreementView`, the agreement-specific test suites.

### F.3 Controls that still need implementation (gaps)

1. **Private storage is not wired to anything.** No upload route, no review screen, no download route, no
   ownership rule, no retention. It is a safe *location*, not a working control.
2. **Deployment hardening gap:** `php-backend/.htaccess` denies `^(lib|logs)/` and `.sql|.md|.log` but **not
   `storage/`**. The private directory currently depends entirely on the inner `.htaccess` being honoured
   (`AllowOverride`), which cannot be verified from here. `CPANEL_DEPLOYMENT_GUIDE.md` does not mention
   `storage/` at all (only `api/uploads/`).
3. **No least privilege for identity data.** There is one `admin` role; any admin sees any document when a
   download route exists. Requirement §7 explicitly asks not to expose full identity data to all admins.
4. **No encryption at rest** and no key management. Nothing in the code encrypts any field.
5. **No retention/deletion policy** for identity documents, agreements or receipts (only `email_outbox`
   pruning exists, 14 days).
6. **No admin UI for the audit trail** (API only), and no retention/rotation for `audit_logs`.
7. **No separation of duties on money:** any admin can create receipts and flip `viewingFeePaid`; a landlord
   can create receipts for arbitrary tenants. Only a post-hoc audit row exists.
8. **`is_verified` auto-set for landlords** (see §D.3) — a truthful-status problem, not just cosmetic.

### F.4 Sensitive-data exposure / unauthorised financial actions found (beyond Increment 0)

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| N1 | Receipts assert Goodlucks received money it did not receive | **High** (misleading financial record) | open — §E.2 |
| N2 | Dashboard reports 100% of viewing fees as Goodlucks revenue | **High** (financial misstatement) | open — §E.2 |
| N3 | Landlord role can issue Goodlucks-branded receipts for arbitrary tenant/amount, unlinked to a booking | **High** (fraud surface) | open |
| N4 | `users.is_verified` auto-1 for landlords, exposed as `isVerified` | Medium (misleading badge) | open |
| N5 | `properties.is_landlord_verified` set by admin with no evidence and auto-set for admin-created listings | Medium | open |
| N6 | Private store reachable in deployment only via inner `.htaccess`; not denied by the main `.htaccess` | Medium (config-dependent) | open (no doc is stored yet) |
| N7 | Agent cannot be represented as a real entity, so authority to market a property cannot be checked | Medium (model gap) | open — §C |

### F.5 MySQL, SQLite and migration risk

- Three surfaces must stay in step: `database.sql` (MySQL), `schema.sqlite.sql` (SQLite dev/test),
  `migrate.php` (`$requiredTables` / `$requiredColumns`). SQLite databases boot from the schema file; they do
  **not** run `migrate.php` (it is MySQL-only: `SHOW TABLES`, `SHOW COLUMNS`).
- Any new table must be added to `$requiredTables` **and** have a `CREATE TABLE IF NOT EXISTS` block that the
  migration regex can extract from `database.sql`; any new column to `$requiredColumns`.
- MySQL `ALTER TABLE … ADD COLUMN` with `AFTER …` is used today; new nullable columns are safe and reversible.
- **Data backfills** (e.g. creating a default fee policy row, or marking legacy receipts) are *not* covered by
  the current migration mechanism at all — it only handles tables/columns. That is a real limitation to plan
  around before increment E.
- Cannot be executed here (no MySQL) — see §A.4. Run `php php-backend/migrate.php` (dry run) against staging
  before any `--apply`.

---

## G. Proposed implementation plan

Ordered so the **product stops advertising and performing the retired workflow first**, then makes the money
records truthful, then adds agent capability. Each increment is independently shippable and reversible. **None
of these have been started.**

### Increment A — Retire the agreement workflow from the active product (no schema change)

- **Scope:** remove the agreement tab, generator, sign/email actions and the "Agreements & Receipts" nav
  entries (3 Navbar variants, tenant/landlord/admin dashboard buttons); split the receipts UI into its own
  `ReceiptsView`; stop loading agreements in `AppContext` for tenants/landlords; keep admin read-only access
  to historical agreements behind `FEATURE_LEGACY_AGREEMENTS=off` (default off for writes, on for admin
  archive reads); reframe copy in Home/About/ListProperty/FindAHome/README; freeze `POST /agreements`,
  `…/sign`, `…/email` (410 with a clear message) while keeping `GET` for archive.
- **Files:** `src/components/TenancyAgreementView.tsx` (split), `src/components/Navbar.tsx`,
  `TenantDashboard.tsx`, `LandlordDashboard.tsx`, `AdminDashboard.tsx`, `src/App.tsx`,
  `src/context/AppContext.tsx`, `src/services/apiService.ts`, `src/types.ts`, `lib/api.php`,
  `tests/api.test.mjs`, `README.md`, marketing views.
- **DB:** none. No data deleted.
- **Tests/acceptance:** nav has no agreements entry for any role; create/sign/email return 410; admin can
  still read historical agreements; receipts still create/list/print; `npm run test:api` green after the two
  agreement suites are converted to retirement assertions; lint/build clean.
- **Rollback:** redeploy the previous build (no data touched).
- **Risks / decisions:** the receipts UI shares the component (must be split, not deleted); staff may still
  need the digital documents (archive read covers it); open question on how long the archive stays.

### Increment B — Truthful receipts and transaction records

- **Scope:** add `transaction_records` with the 7 categories and confirmation states; make Goodlucks receipts
  issuable only for money Goodlucks actually received (categories 3, 6, 7); relabel the existing rent document
  as a legacy/landlord record; remove the "PAID / GOODLUCKS VERIFIED / Authorized Finance Officer" claims for
  third-party money; replace `physicalRevenueGhs` with (a) viewing fees *recorded* and (b) Goodlucks' share
  *receivable/received*; add audit writes on issue/confirm/dispute; landlord receipt creation restricted to
  records for their own properties.
- **Files:** `lib/api.php` (receipt handlers → transaction handlers), `lib/repository.php` (`shape_receipt`,
  new repository functions, stats), `database.sql`, `schema.sqlite.sql`, `migrate.php`, `TenancyAgreementView`
  (receipts part), `AdminDashboard` stats card, `tests/api.test.mjs` (the revenue assertion must change).
- **DB:** one new table + nullable columns on `rent_receipts` (`recipient_type`, `legacy_flag`,
  `transaction_id`). Additive; no deletes.
- **Acceptance:** a rent payment to a landlord can be recorded and never produces a Goodlucks receipt; a
  viewing fee can be reported by an agent and confirmed/disputed; totals shown as "recorded" vs "received";
  legacy receipts render with a clear legacy label; audit rows present.
- **Rollback:** new table unused by old UI; columns nullable; revert deploy.
- **Risks:** wording is legally sensitive — needs your sign-off (§H); historical receipts stay in the DB and
  remain misleading unless annotated on render.

### Increment C — Agent account (Stage A only)

- **Scope:** add `agent` to `USER_ROLES`; allow agent registration (name, email, phone, password, agency name)
  with **no** operational permissions; `agent_profiles` (agency name, base location optional, areas served,
  contact location); default `account_status = 'registered'`; admin agent list (read-only) + audit; explicit
  denial of property creation, viewings assignment and fee reporting until approved.
- **Files:** `lib/validate.php`, `lib/api.php`, `lib/repository.php`, `AuthModal`, new `AgentDashboard` shell,
  `Users` admin tab (minimal), schemas, tests.
- **DB:** `agent_profiles` + optional `users.account_status`; additive.
- **Acceptance:** agent can register and log in; every restricted endpoint returns 403 for an unapproved
  agent; admin list shows agents; existing tenant/landlord flows unchanged.
- **Risks:** role/registration copy changes; must not let agents into the property queue accidentally.

### Increment D — Verification and authorisation workflow, private documents wired

- **Scope:** `verification_cases` (subject, identity status, authorisation status, internal approval status,
  decision, reviewer, decided_at) + `verification_documents` (case, kind, private store id, checksum, size,
  uploaded_by); authenticated upload route (owner + agent/landlord only), reviewer-only download, audit for
  every access and decision, retention window config + purge job; add `^(lib|logs|storage)/` deny + deploy
  guide update; least-privilege reviewer access (explicit reviewer capability, not "all admins").
- **Files:** new `lib/verification.php`, `lib/api.php` routes, `lib/private_storage.php` (wire), `config.php`,
  `AdminDashboard` review tab, agent dashboard upload UI, schemas/migration, `.htaccess`,
  `CPANEL_DEPLOYMENT_GUIDE.md`, tests.
- **Acceptance:** documents land outside the public dir; unauthenticated/unauthorised download 404; reviewer
  decisions audited and immutable; rejected files/mime/size refused; retention purge is dry-runnable.
- **Risks:** personal-data handling needs your legal input on retention and access; cannot claim encryption.

### Increment E — Fee policy, tiers, snapshots

- **Scope:** `viewing_fee_policies` (tier, agent %, Goodlucks %, effective_from, created_by) seeded via an
  explicit, reviewed data step; `agent_tier_assignments` (admin-only, audited); snapshot the applied rate into
  the transaction at creation; agent UI is read-only; validation that percentages sum to 100.
- **Files:** new settings module + admin settings tab, transaction creation path, schemas, tests.
- **Acceptance:** changing a policy never alters past records; an agent cannot change their tier; totals
  reconcile to the snapshot; both dialects migrate.
- **Risks:** the current migration tool cannot seed rows — needs a small, reviewed seeding script.

### Increment F — Agent-led viewing lifecycle

- **Scope:** statuses (requested → agent assigned → agent confirmed/proposed time → Goodlucks confirms →
  completed / no-show / cancelled → fee reported → tenant confirms or disputes → receivable → remitted →
  reconciled), event history table, assignment to real agent users, agent fee reporting, tenant confirmation
  and dispute endpoints, duplicate-report guard, audit; remove the "your viewing request is confirmed" email
  at submission.
- **Files:** `lib/api.php` viewing handlers, `lib/repository.php`, `lib/alerts.php`, `ViewingRequestModal`,
  admin viewings tab, agent dashboard, schemas, tests.
- **Acceptance:** a tenant submission does not create a confirmed appointment; only the assigned agent (or an
  admin) can report a fee; a tenant can dispute; every transition is logged.
- **Risks:** highest-complexity increment; existing tests assume `scheduled|completed|cancelled`.

### Increment G — Remittances and rental commissions (deferred, legal review)

- Remittance records against receivables, reconciliation, statements; a separate rental-commission category
  with its own approved terms. Not to be built until §H items are settled.

### Cross-cutting (any increment)

`docs/AGENT_PLATFORM_AUDIT.md` §11 needs revision: its increments 2–6 were written before the business model
was corrected and still assume agreement-driven flows. Do not rewrite it until you approve the plan above.

---

## H. Legal and compliance assumptions needing confirmation

These are outside what code review can settle. None of them should be treated as satisfied by internal
badges, uploaded files or this report.

1. **Agent licensing / permitted activities.** Whether, and under what conditions, an agent may market a
   property, conduct viewings and collect a viewing fee in Ghana — and what evidence counts (REAC registration,
   agency licence, landlord mandate). Internal "verified" status must never be presented as legal authority.
2. **Agent classification.** Employee vs independent contractor, and whether Goodlucks may collect or hold
   viewing fees on the agent's behalf. The current design has the tenant paying the agent directly; that
   assumption should be confirmed in writing.
3. **Identity-document handling.** Lawful basis, retention period, access rules and security measures for
   Ghana Card copies (Ghana's Data Protection Act, 2012 (Act 843) obligations — to be confirmed with counsel).
   This determines the Increment D retention window and reviewer access model.
4. **Receipt and invoicing language.** What Goodlucks may lawfully print for money it did not receive, what a
   commission invoice must contain, and what records must be retained for tax. **Increment B's wording must
   not ship without this sign-off.**
5. **Rental commission arrangements.** Whether Goodlucks may charge a rental commission, at what rate, and on
   what contractual basis — separate from viewing fees (as you specified).
6. **Tax treatment** (VAT/levies on viewing fees and commissions) and whether agent shares are expenses,
   payouts or revenue splits.
7. **Tenancy agreements.** Confirming in product copy that Goodlucks does not draft, review or store tenancy
   agreements, and how long any historical digital copy may be retained before archival/deletion.
8. **Existing unvalidated badges.** Whether landlord accounts currently flagged verified, and properties with
   `is_landlord_verified = 1`, should be re-reviewed or relabelled once the status model exists.

---

## Decisions needed from you before increment A starts

1. Confirm **agreements are retired from the UI now**, with admin read-only archive until a retention plan
   exists (or specify an earlier cut-off).
2. Confirm **receipts survive** as a separate feature and that legacy rent receipts will be relabelled (not
   deleted) — and whether they should stay visible to landlords/tenants at all.
3. Confirm the **agent tier criteria** ("professionally verified") and whether 60/40 and 70/30 are approved
   policy numbers or placeholders.
4. Confirm **who may review identity documents** (a dedicated reviewer role vs all admins) and the intended
   retention period.
5. Confirm whether **existing "verified" flags** may be relabelled/reset as part of the status-model work.

*End of assessment. No files were changed, no commit was created, nothing was pushed or deployed.*
