# Goodlucks Homes — Agent Platform Programme: Phase 1 Audit

**Status:** read-only audit. No application code was modified.
**Baseline:** `main` @ `cbd5ced` (PR #2 merged). 84 API tests / 20 suites passing; `tsc --noEmit` clean; `npm run build` green.
**Scope:** the full repository as it exists today, measured against the agent/verification/viewing-fee programme (your Phases 2–13).

---

## 1. What the repository is today

| Layer | Reality |
| --- | --- |
| Frontend | React 19 + TS + Vite 6 + Tailwind 4. Single-page app, view state in `AppContext` (not a router), lazy-loaded views, `SEOHead` for meta. |
| Backend | PHP 8.1+, no framework. `php-backend/index.php` → `lib/api.php` router (regex table) → handlers. |
| Data | MySQL/MariaDB in production, SQLite for dev/tests. PDO only, no ORM, no foreign keys, no transactions. |
| Auth | Session tokens stored hashed, HttpOnly + SameSite cookies; `require_auth([roles])`, `is_admin`, `can_manage_property`. |
| Async | `cron.php` (CLI): search-alert digest, email outbox, retention. No queue service. |
| Email | `email_outbox` (durable) + Resend/PHP mail; `send_email()` queues. |
| Tests | `node --test` against a live PHP API on a throwaway SQLite DB, 84 cases. |

**Roles today:** `tenant`, `landlord`, `admin` only (`lib/validate.php:18`). Registration silently coerces anything else — `one_of($input['role'] ?? 'tenant', ['tenant','landlord'], 'tenant')` (`lib/api.php:184`, `:273`).

---

## 2. Verified findings (each checked in source, not inferred)

### 2.1 Security — present today, independent of the agent programme

| # | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| S1 | **Any authenticated tenant or landlord can read every tenancy agreement**, including both parties' Ghana Card numbers (`landlordGhanaCard`, `tenantGhanaCard`), phone numbers and rent. | `handle_list_agreements()` → `list_agreements(200)` unscoped (`lib/api.php:1741-1745`, `lib/repository.php:906-910`); PII in `shape_agreement()` (`repository.php:120,123`) | **Critical** (cross-customer PII) |
| S2 | **Any authenticated tenant or landlord can read every rent receipt**, including tenant phone and payment references. | `handle_list_receipts()` (`lib/api.php:1860-1864`), `list_receipts()` unscoped (`repository.php:968-972`), PII in `shape_receipt()` (`repository.php:151`) | **Critical** |
| S3 | **Agreement signatures are not bound to the agreement.** Any landlord can sign any agreement "as landlord"; an admin can sign as either party; no ownership check, no evidence (IP/UA/document hash). | `handle_sign_agreement()` checks only `$user['role'] !== $role` (`lib/api.php:1801-1816`) | **High** |
| S4 | **Any authenticated tenant/landlord can email any agreement by id.** | `handle_email_agreement()` loads by id after a role check only (`lib/api.php:1822-1832`) | **High** |
| S5 | **Ghana Card numbers stored in plaintext** in `tenancy_agreements.landlord_ghana_card` / `tenant_ghana_card`. | `database.sql:230,233` | **High** (data protection) |
| S6 | **No audit trail anywhere.** No table, no writes; "audit log" in the code means `email_logs`. | no `audit*` table in `database.sql` | **High** (your Phase 12 requires it) |
| S7 | Uploads land in a **publicly served** directory ( `/api/uploads/<file>` is served directly by Apache). Fine for listing photos, unusable for identity documents. | `php-backend/.htaccess` rule 2; `UPLOAD_DIR` | **High** for Phase 2 |

Existing controls worth keeping: hashed session tokens, `require_trusted_origin()` on all non-GET, database-backed rate limits (`enforce_rate_limit`), server-side validation on every handler, uploads restricted to landlord/admin by MIME + `getimagesize`.

### 2.2 Viewing flow — contradicts your Phase 5

- `handle_create_viewing()` writes `status => 'scheduled'`, `assigned_agent => 'Goodlucks Field Agent'` (a **string**, not a user), and emails the tenant **"Your viewing request is confirmed"** on submit (`lib/api.php:1442-1474`). This is exactly the "confirmed merely because a tenant submitted a request" behaviour Phase 5 forbids.
- Status vocabulary is three values: `['scheduled','completed','cancelled']` (`lib/validate.php:17`) — no assignment, no agent confirmation, no tenant confirmation, no dispute/no-show.
- `viewing_schedules` has **no agent id**, no reference number, no reschedule history, no confirmation timestamps (`database.sql:124-145`).

### 2.3 Money — contradicts Phases 6 & 7

- One global constant `VIEWING_FEE_GHS` (`config.php:131`) is used at 6 sites; the schema default is `fee_amount_ghs DECIMAL(10,2) DEFAULT 100.00` (`database.sql:138`). Changing the env var therefore **retroactively changes how historical viewings are reported**, because analytics recomputes `physicalRevenueGhs = paidViewings * VIEWING_FEE_GHS` (`repository.php:1139`).
- A single boolean `viewing_fee_paid` conflates three different facts: tenant paid the agent, agent owes Goodlucks, agent remitted. There is no ledger, no receivable, no remittance table.

### 2.4 Data integrity

- **No foreign keys anywhere**, only indexes/unique keys: `properties.landlord_id`, `viewing_schedules.property_id`, `tenant_requests.tenant_id`, `tenancy_agreements.property_id` are unenforced strings. Deleting a property orphans agreements, viewings and receipts (verified: `handle_delete_property` only flips status, which limits the damage, but nothing prevents dangling ids).
- **No transactions** around multi-table writes (property create + notification + alert dispatch; enquiry + counter increment).
- `can_manage_property()` (`lib/auth.php:232-238`) is the single ownership gate for listings and is admin/owner only — it has no notion of an agent acting for a landlord.

### 2.5 Migration machinery

`migrate.php` is additive by design and safe to extend:
- `$requiredTables` → `CREATE TABLE` for missing tables (`migrate.php:94`).
- `$requiredColumns[table][column] => "DDL"` → `ALTER TABLE … ADD COLUMN` for missing columns (`migrate.php:63-92`).
- **MySQL-only** (`SHOW TABLES`, `SHOW COLUMNS`): SQLite dev/test databases are created from `schema.sqlite.sql`, so every new table/column must be added in **three** places (MySQL DDL, SQLite DDL, `migrate.php`).
- No column/index removals, no data rewrites — matches your "never destructive" rule.

### 2.6 Reusable infrastructure (do not rebuild)

| Capability | Where | Reuse for |
| --- | --- | --- |
| Notifications (in-app + badge) | `create_notification`, `notifications` table, `read-all` | Phase 10 entirely |
| Durable email | `lib/outbox.php`, `email_html_template`, `send_internal_notification` | every new email |
| Rate limiting | `enforce_rate_limit(scope, max, seconds, suffix)` | verification submissions, remittance posts |
| Validation | `Validator`, `valid_money`, `valid_email`, `one_of` | new payloads |
| Idempotency | `submission_fingerprint` / `recent_submission` | remittance double-submit, viewing requests |
| Optimistic locking | `updatedAt` → 409 on property PUT | agent profile / listing assignment edits |
| Admin console patterns | tabs, action runner, `ApiError` handling | agent, verification, settlement sections |
| Test harness | `tests/helpers.mjs`, CLI PHP harnesses (`tests/reset-token.php`, `tests/outbox.php`) | new suites |

---

## 3. File-by-file impact

Legend: **R** reuse as-is · **E** extend · **N** new · **C** change required

### Backend

| File | | Impact |
| --- | --- | --- |
| `php-backend/lib/validate.php` | C | `USER_ROLES` gains `agent`; new status vocabularies (agent, verification, viewing, remittance, dispute); money helpers for minor units. |
| `php-backend/lib/auth.php` | E | Agent registration path; `can_manage_property()` replaced by an authorisation function that understands agent assignments; verification gate helper. |
| `php-backend/lib/api.php` (2,304 lines) | E | ~30 new routes; `handle_create_viewing` rewritten (Phase 5); agreement/receipt scoping + ownership (S1–S4); fee removal. Recommend splitting new domains into `lib/api-agents.php`, `lib/api-viewings.php`, `lib/api-finance.php` required from `api.php` to stop the file growing past 3k lines. |
| `php-backend/lib/repository.php` (1,146) | E | Scoped listings for agreements/receipts; agent/profile/verification/assignment/ledger/remittance/audit CRUD; `shape_*` for new entities; analytics rewritten from the ledger. |
| `php-backend/lib/outbox.php` | R | No change. All new notifications queue through it. |
| `php-backend/lib/alerts.php` | C | Price-drop copy hardcodes "GH₵ 100 viewing fee" (`alerts.php:116`) — must read the configured fee or drop the claim. |
| `php-backend/lib/http.php` | R/E | Reuse; add a private-file streaming helper for verification documents (S7). |
| `php-backend/lib/mailer.php` | R | Reuse templates; add templates for the new lifecycle events. |
| `php-backend/config.php` | C | `VIEWING_FEE_GHS` becomes a fallback default only; add commission defaults, verification-provider keys, private upload dir. |
| `php-backend/migrate.php` | E | New tables + additive columns (never destructive). |
| `php-backend/database.sql` / `schema.sqlite.sql` | E | ~12 new tables, new columns on `users`/`properties`/`viewing_schedules`. |
| `php-backend/cron.php` | E | Remittance-due / overdue notices; viewing reminders; retention for audit + documents. |
| `php-backend/.env.example` | E | New keys (below). |

### Frontend (24 components today; none knows about agents)

| File | | Impact |
| --- | --- | --- |
| `src/types.ts` | E | `UserRole` gains `agent`; agent, verification, viewing lifecycle, ledger, remittance, dispute, audit types. |
| `src/services/apiService.ts` | E | ~30 methods; keep the single `request()` wrapper and `ApiError` semantics. |
| `src/context/AppContext.tsx` (1,052) | E | agent in role switch, agent dataset load, new actions. Watch: the file is already at the edge of comfortable size — consider `useAgentData` hook for the new state. |
| `src/components/AuthModal.tsx` | E | Third role tab; agency name on register. |
| `src/components/Navbar.tsx`, `MobileBottomNav.tsx` | E | Agent nav (server-role driven). |
| `src/components/AgentDashboard.tsx` | N | Phase 9 agent console, reusing existing card/tab styling. |
| `src/components/LandlordDashboard.tsx` | E | Agent authorisation, viewing activity, availability. |
| `src/components/TenantDashboard.tsx` | E | Appointment tracking, confirmations, dispute entry. |
| `src/components/AdminDashboard.tsx` (1,300+) | E | 8 new tabs. **Recommend splitting** into `admin/AgentAdminTab`, `admin/ViewingAdminTab`, `admin/FinanceAdminTab`, `admin/AuditTab` before adding more. |
| `src/components/ViewingRequestModal.tsx` | C | Copy must stop promising a confirmed appointment; show the request reference and "awaiting assignment". |
| `src/components/TenancyAgreementView.tsx` | C | Currently filters agreements client-side (`:266`) because the API returns all — server scoping changes the dataset; the vault must request its own rows only. |
| `src/components/PropertyDetailView.tsx` | E | Show assigned agent (name only — never a private phone, per Phase 5). |

---

## 4. Proposed data model (Phases 2–8, 11)

Additive only; every table gets an `id VARCHAR(64)`, `created_at`, and indexes on its query paths. MySQL + SQLite definitions mirrored.

**Identity & agent**
- `agent_profiles` — `user_id` (unique), legal_name, agency_name, region, city, communities (JSON), years_experience, professional_licence_no, regulator, regulator_status, account_tier, tier_approved_by, tier_approved_at, operational_status, `updated_at`.
- `agent_verifications` — user_id, kind (`identity` | `credential` | `regulatory`), status, provider, provider_reference, submitted_at, reviewed_by, reviewed_at, reviewer_notes, `document_id` (nullable). *Never* store full Ghana Card numbers/images in the main database.
- `verification_documents` — id, user_id, kind, original_name, mime, size, sha256, storage_path (private, outside the web root), uploaded_at, retained_until.
- `commission_policies` — id, name, scope (`viewing_fee`), agent_tier, agent_percent, goodlucks_percent, effective_from, effective_to, created_by. Admin-editable, default seeded 60/40 and 70/30, must sum to 100.
- `audit_logs` — id, actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, ip, user_agent, created_at.

**Property ↔ agent**
- `property_agents` — property_id, agent_id, role (`listing_agent`), authorised_by_user_id, authorisation_note, authorised_at, status. Unique (property_id, agent_id).
- `properties`: add `owner_user_id`, `submitted_by_user_id`, `submission_type` (`landlord` | `agent`), `agent_authorisation_document_id`, `inspected_at`, `inspected_by`. (Existing `landlord_id` retained for compatibility.)

**Viewings (Phase 5)**
- `viewing_schedules`: add `reference` (unique, human-readable e.g. `GL-VW-2F7K`), `tenant_user_id`, `agent_id`, `fee_amount_ghs`, `fee_policy_source`, `assigned_by`, `assigned_at`, `agent_responded_at`, `proposed_date`, `proposed_time`, `confirmed_at`, `completed_at`, `tenant_confirmed_at`, `dispute_id`. Status vocabulary expands to the 11 values you listed.
- `viewing_events` — append-only timeline (status_from, status_to, actor, reason, created_at). Makes the flow auditable and drives reminders.
- `viewing_fee_settings` — id, amount_ghs, effective_from, created_by (per-appointment fee copies the value at assignment time).

**Money (Phases 6–7)**
- `commission_ledger` — viewing_id (unique per declaration), agent_id, gross_fee_pesewas, agent_percent, goodlucks_percent, agent_share_pesewas, goodlucks_share_pesewas, policy_id, collected_on, payment_method, transaction_ref, tenant_confirmation_status, created_by, created_at. Amounts stored in **integer pesewas** and computed server-side only.
- `remittances` — id, agent_id, period_start/end, amount_pesewas, method, transaction_ref, evidence_document_id, status (`submitted` | `confirmed` | `rejected`), reviewed_by, reviewed_at, rejection_reason. Unique constraint on (agent_id, transaction_ref) to block duplicates.
- `remittance_items` — remittance_id, ledger_id (unique) — prevents double-counting a viewing in two settlements.
- `tenant_confirmations` — viewing_id (unique), tenant_user_id, occurred (`yes`/`no`), paid_amount_pesewas, amount_matched, issue_type, notes, created_at.
- `disputes` — id, viewing_id, opened_by, category, description, status (`open` | `investigating` | `resolved` | `rejected`), resolution, resolved_by, resolved_at.

---

## 5. API surface to add (server-authoritative)

**Agent**
- `POST /auth/register` (extended, `role=agent`)
- `GET|PUT /agent/profile`
- `POST /agent/verifications` (identity / credential / regulatory, optional docs)
- `GET /agent/verifications`, `GET /agent/earnings`, `GET /agent/remittances`
- `POST /agent/remittances`, `GET /agent/viewings`

**Admin**
- `GET /admin/agents`, `PATCH /admin/agents/{id}` (operational status, tier)
- `GET /admin/agents/{id}/verifications`, `PATCH /admin/verifications/{id}` (approve/reject)
- `GET /admin/verification-documents/{id}` (authenticated stream, audited)
- `GET|POST /admin/commission-policies`
- `GET|POST /admin/viewing-fee-settings`
- `GET /admin/viewings`, `POST /admin/viewings/{id}/assign`, `POST /admin/viewings/{id}/confirm`
- `GET /admin/ledger`, `GET /admin/remittances`, `PATCH /admin/remittances/{id}`
- `GET /admin/disputes`, `PATCH /admin/disputes/{id}`
- `GET /admin/audit-logs`

**Tenant**
- `POST /viewing-requests` (returns reference + "awaiting assignment", never "confirmed")
- `GET /viewings` (own only), `POST /viewings/{id}/confirm` (tenant confirmation; agent impersonation rejected)
- `POST /disputes`

**Agent-facing viewing transitions**
- `POST /viewings/{id}/agent-response` (`accept` | `reject` | `suggest`)

Every one of these resolves the actor's permissions from the session — no role, tier, fee or percentage is ever read from the request body.

---

## 6. Bugs and gaps that must be fixed *before* the agent programme lands

These are prerequisites, not nice-to-haves:

1. **S1/S2** — scope agreements and receipts to the parties involved (owner/tenant/admin); today the vault relies on client-side filtering.
2. **S3** — bind signatures to the signing party; record evidence; block admin-as-party signing.
3. **S4** — email only to the agreement's own parties.
4. **S5** — stop returning Ghana Card numbers in API payloads; mask at rest and in responses.
5. **S6** — create `audit_logs` and write to it for every sensitive mutation (introducing it now means the new agent/finance flows are audited from day one).
6. **S7** — private document storage + authenticated streaming for verification evidence.
7. **Fee retroactivity** — per-appointment fee snapshot; analytics from the ledger, not `paidViewings × global constant`.

---

## 7. Migration risks

| Risk | Mitigation |
| --- | --- |
| `migrate.php` is MySQL-only; SQLite dev DBs boot from `schema.sqlite.sql` | Keep the three DDL locations in lockstep; add a test that boots the API against a **pre-agent** SQLite file and migrates. |
| New `NOT NULL` columns on populated tables | Add nullable, backfill by migration where needed, then rely on app defaults — never a blocking `NOT NULL` add. |
| Enum/status expansion on `viewing_schedules` | Widen the column, keep legacy rows readable (`scheduled` → mapped to `awaiting_agent_assignment` in `shape_viewing`, no destructive UPDATE). |
| Commission defaults hardcoded in code | Seed policies in migration with `effective_from = now`, read percentages from the policy row, store the applied policy on each ledger row. |
| Production data | No rewrite of existing rows in the migration path; new behaviour behind `FEATURE_*` config where it changes a live flow (agents, regulated activity, settlement). |

---

## 8. Testing plan (extends the existing 84 / 20)

New suites, each mirroring the existing style (register → act → assert → negative cases):

`Agent registration & roles` · `Agent verification lifecycle` · `Commission policies & tier changes` · `Property submission by agents + landlord authorisation` · `Viewing appointment lifecycle (11 states + events)` · `Viewing fee settings & snapshots` · `Commission ledger maths` · `Remittances & reconciliation` · `Tenant confirmation & disputes` · `Audit trail` · `Permission matrix (every new endpoint × 4 roles)` · `Migration safety (old DB → migrated)`.

Mandatory in every suite: unauthorised access attempts return 401/403; a client-supplied role/tier/percentage is ignored; duplicate submits are idempotent.

---

## 9. Deployment considerations (cPanel, unchanged model)

- Same static `dist/` + `api/` layout; no new services, no queue daemon.
- New env: `VERIFICATION_PROVIDER`, `VERIFICATION_API_KEY`, `PRIVATE_UPLOAD_DIR` (outside `public_html`), `FEATURE_AGENTS`, `FEATURE_REGULATED_ACTIVITY`, `DEFAULT_VIEWING_FEE_GHS`, `SETTLEMENT_PERIOD_DAYS`.
- `.htaccess`: private upload dir must be unreachable over HTTP (defence in depth even though it lives outside the web root).
- `cron.php` gains reminder/overdue steps — no new cron entries required.
- Deploy order: `migrate.php --apply` → upload `api/` → upload `dist/`.

---

## 10. Legal / compliance blockers (cannot be coded away)

1. **Regulated activity gate.** Registration + identity verification ≠ permission to act as a real-estate agent. The system will separate `account_status`, `identity_status`, `credential_status`, `regulatory_status` and `operational_status`, and default `operational_status` to a non-operating value. Enabling regulated activity requires a decision recorded with REAC/legal counsel; the code will ship it behind `FEATURE_REGULATED_ACTIVITY=off`.
2. **Ghana Card handling.** Do not store images or full numbers. Plan: use a verification provider's reference, store only last 4 digits + provider verdict, keep documents (if any) in private storage with a retention window. This needs your decision on which provider (or a manual-review-only fallback).
3. **Viewing-fee split.** 60/40 and 70/30 are recorded as *configurable policy defaults* for viewing fees only. They will not be applied to rental transaction commissions, which need their own policy and legal review.
4. **Money handling.** Tenant pays the agent directly; Goodlucks records a receivable and a remittance. No online collection in this model — the ledger must never imply Goodlucks received tenant funds.

---

## 11. Recommended build order

Chosen so each increment is independently shippable and testable, and so no live flow is left half-changed:

| Increment | Contents | Why first |
| --- | --- | --- |
| **0** | S1–S7 security fixes + `audit_logs` + agreement/receipt scoping + masked Ghana Card | Severe, small, unblocks everything (agents will make these paths hotter) |
| **1** | Schema foundation: agent tables, `commission_policies`, `viewing_fee_settings`, `audit_logs`, additive columns; migration safety test | Everything else builds on it |
| **2** | Agent role: registration, profile, tier plumbing, admin agent list, AuthModal + role plumbing, `AgentDashboard` shell | First visible feature; no money, no regulated activity |
| **3** | Verification workflow + private document storage + admin review | Unlocks professional credential status (still no regulated activity) |
| **4** | Viewing lifecycle rework (11 statuses, assignment, agent response, confirmations, events) + tenant-facing tracking | Replaces the auto-confirm behaviour; the highest-risk change |
| **5** | Fee settings, per-appointment snapshots, commission ledger, agent earnings view | Money maths with a single source of truth |
| **6** | Remittances, settlements, reconciliation, statements | Depends on the ledger |
| **7** | Tenant confirmations, disputes, reminders via cron | Completes the loop and the audit trail |
| **8** | Dashboard completion + admin sections + final QA/report | Phase 9 + 14 |

Each increment: `npm run lint` → `npm run test:api` → `npm run build`, plus new tests, committed separately with its own migration note.

---

## 12. What I need from you before coding

1. **Verification provider** — do you have one (Smile ID / Dojah / Verify.gh), or should increment 3 ship manual review with private document upload and no third-party call?
2. **Operational status default** — confirm agents register into `operational_status = 'not_authorised'` (my reading of your compliance rule) so no agent can act until explicitly enabled.
3. **Settlement cadence** — weekly default for the remittance summary, configurable; confirm.
4. **Build order** — my recommendation is increment 0 (security) first, then 1→8. Say the word and I start with increment 0.
