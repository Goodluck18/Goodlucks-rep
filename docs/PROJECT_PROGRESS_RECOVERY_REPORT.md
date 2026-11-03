# Project Progress Recovery Report

**Repository:** `Goodluck18/Goodlucks-rep`
**Branch:** `arena/a67485fb-goodlucks-rep`
**HEAD:** `cbd5ceda34d4b02d487bff2dbd931df4b5b198c5` ("Merge pull request #2 …") — the only commit reachable from this branch
**Working tree:** dirty, 58 entries (31 modified, 1 deleted, 26 untracked)
**Stash:** none
**Assessment date:** 3 November 2026
**Purpose:** establish where the project actually stands after the network interruption — from the repository, not from conversation history.

---

## 0. How to read this report

Four words are used precisely, and nothing is graded above the evidence it has:

| Term | Means |
| --- | --- |
| **Documented** | A report in `docs/` describes it. Says nothing about whether the code has it. |
| **Implemented** | I found the code in the working tree, by inspection, today. |
| **Tested** | An automated check covering it was **executed in my presence** during this assessment, or the test exists and ran green in the suite I re-ran. |
| **Verified** | Implemented *and* tested *and* exercised in a real running environment (browser or live HTTP against a current database). |

Only the last of these supports the claim "it works". Most of this project reaches **tested**, not **verified** — the gap is spelled out in §5 and §6 rather than papered over.

**Inspections performed for this report** (all read-only unless noted):

- read all seven increment/audit documents in `docs/` in full or in substantive part;
- `git status`, `git log`, `git branch -vv`, `git stash list`, `git diff --numstat`;
- source inspection of `php-backend/lib/{viewings,api,repository,auth,db,validate}.php`, the three schema/migration files, and the F frontend components;
- `npm run test:api` → **161 tests / 28 suites / 161 pass / 0 fail / 0 skipped** (exit 0);
- `npx tsc --noEmit` → clean (exit 0);
- `npm run build` → success;
- `php-wasm-cli -l` on `viewings.php`, `api.php`, `config.php`, `grant_viewing.php` → all clean;
- a live dev-stack probe (`node scripts/dev.mjs` on port 8123): `GET /api/health` 200, demo login 200, `GET /api/viewings` **500** — see finding D1;
- direct read of `.data/dev.sqlite` to compare its schema against `schema.sqlite.sql`.

Two small writes happened as a side effect of the live probe: a login session row and a log line in the local, git-ignored `.data/` SQLite file. No repository file, no tracked database and no production database was touched.

> **Update — 3 November 2026, later the same day:** the Increment F closure pass has since run. It resolves several of the gaps below (F1, F3, F4) without altering any product behaviour, and adds four findings of its own. Read **§11** for what changed; §5 and §6 are left as written so the record of what was known at assessment time stays intact.

---

## 1. Repository state — what survived the interruption

Everything did. Nothing was lost, reset, stashed or reverted.

```
$ git rev-parse --abbrev-ref HEAD        arena/a67485fb-goodlucks-rep
$ git rev-parse HEAD                     cbd5ceda34d4b02d487bff2dbd931df4b5b198c5
$ git log --oneline -1                   cbd5ced Merge pull request #2 from Goodluck18/arena/30323d3b-goodlucks-rep
$ git branch -vv                         * arena/a67485fb-goodlucks-rep cbd5ced   (main also cbd5ced, tracking origin/main)
$ git stash list                         (empty)
$ git diff --stat                        32 files changed, 9597 insertions(+), 2679 deletions(-)
```

**Untracked (26):**

```
docs/                                    (10 files: the whole documentation set)
php-backend/grant_finance.php  grant_reviewer.php  grant_viewing.php
php-backend/lib/audit.php  crypto.php  fee_policies.php  private_storage.php
                verification.php  viewings.php
php-backend/storage/                     (only .gitignore + .htaccess; ignored contents clean)
php-backend/verification_retention.php
src/components/AdminAgentAccounts.tsx  AdminFeeLedger.tsx  AdminFeePolicies.tsx
                AdminVerificationQueue.tsx  AdminViewingsPanel.tsx  AgentDashboard.tsx
                AgentListingForm.tsx  AgentViewingsPanel.tsx  ReceiptsView.tsx
                VerificationPanel.tsx
tests/create-receipt.php  create-user.php  finance-fixtures.php  read-verification.php
```

**Modified (31) / Deleted (1):** `php-backend/{config,database.sql,schema.sqlite.sql,migrate.php,.htaccess,.env.example}`, `php-backend/lib/{api,auth,db,mailer,repository,validate}.php`, `src/{App.tsx,types.ts,services/apiService.ts,context/AppContext.tsx}`, 12 components, `tests/api.test.mjs`, `README.md`, `CPANEL_DEPLOYMENT_GUIDE.md`, `.gitignore`; deleted `src/components/TenancyAgreementView.tsx`.

**Interpretation:** the entire A–F body of work exists only as uncommitted working-tree changes on one branch. That is intentional per the standing instruction not to commit or push — but it also means **a single careless `git checkout`/`clean`/reset would destroy the whole project's history of work.** That risk is the single biggest finding of this assessment, above any code issue.

---

## 2. Documentation inventory

| File | Lines | Purpose | Highest status reached |
| --- | --- | --- | --- |
| `docs/BUSINESS_MODEL_ASSESSMENT.md` | 496 | Product/business model assessment; source of the language and fee-boundary rules | Analysis only |
| `docs/AGENT_PLATFORM_AUDIT.md` | 269 | Phase 1 audit of the existing platform | Analysis only |
| `docs/SECURITY_INCREMENT_0.md` | 158 | Security/privacy hardening pass, before the numbered increments | Documented, implemented, tested (93 at the time) |
| `docs/INCREMENT_A_REPORT.md` | 320 | Retire tenancy agreements | Documented, implemented, tested (87) |
| `docs/INCREMENT_B_REPORT.md` | 237 | Truthful viewing-fee accounting, honest receipts, safer registration | Documented, implemented, tested (102) |
| `docs/INCREMENT_C_REPORT.md` | 419 | Agent account foundation | Documented, implemented, tested (111) |
| `docs/INCREMENT_D_REPORT.md` | 566 | Agent identity verification & professional authorisation | Documented, implemented, tested (128) |
| `docs/INCREMENT_E_REPORT.md` | 517 | Fee policies and agent tiers | Documented, implemented, tested (142) |
| `docs/INCREMENT_F_REPORT.md` | 331 | Agent-led viewing lifecycle | Documented, implemented, tested (161), **not fully verified** |

All nine documents are present, non-empty and mutually consistent on the sequence A → B → C → D → E → F. There is no G document, and every report states that G was not started — which the code confirms (§4).

---

## 3. Increment-by-increment assessment

### Increment 0 — Security & privacy hardening
**Documented:** yes (`SECURITY_INCREMENT_0.md`). **Implemented:** yes — private upload storage and `.htaccess` denial exist (`php-backend/.htaccess` denies `storage/`), audit logging exists (`lib/audit.php`), identity masking exists (`mask_identity_number()`), and the receipts/upload access checks are in `repository.php`. **Tested:** yes, as part of the current 161-test suite ("private documents are not reachable through the public uploads route", "the audit trail is admin-only and carries no identity numbers"). **Verified:** partly — API-level only.

### Increment A — Retire tenancy agreements
**Documented:** yes. **Implemented:** yes, independently confirmed:
- `grep agreements php-backend/lib/api.php` finds only comments plus the retirement note at line ~2898 — no agreement routes or handlers;
- `src/components/TenancyAgreementView.tsx` is deleted (`git status` shows `D`);
- `src/components/ReceiptsView.tsx` exists and is routed (`src/App.tsx:25,90`);
- `RECEIPT_ISSUING_ENABLED` defaults to `false` (`config.php:195`) and `POST /api/receipts` returns 503 while it is off (`api.php:2937`).

**Tested:** yes — the suite asserts all five agreement endpoints return 404 and that receipt issuing is disabled. **Verified:** API-level; no browser run.

### Increment B — Truthful viewing-fee accounting
**Documented:** yes. **Implemented:** yes — `viewing_fee_records`, `fee_remittances`, `fee_policies` appear in all three schema/migration files; `physicalRevenueGhs` is absent from the codebase (`grep` returns nothing); the ledger functions are marked `Increment B` in `repository.php`. **Tested:** yes — the Increment B ledger suite runs green inside the 161. **Verified:** dev DB confirms `fee_policies`, `fee_remittances`, `viewing_fee_records` tables exist; **0 policy rows**, matching the report's "ships empty".

### Increment C — Agent account foundation
**Documented:** yes. **Implemented:** yes — `USER_ROLES = ['tenant','landlord','agent','admin']` (`validate.php:18`); `agent_profiles` table in all three files; property provenance columns `submitted_by_user_id`, `submitted_by_role`, `landlord_id`, `landlord_authority_state`, `landlord_contact_claimed` present in `schema.sqlite.sql` (lines 54–58) with `idx_prop_submitted_by`; `src/components/AgentDashboard.tsx` exists; agent tab in `AuthModal`, agent nav in `Navbar`, agent routing in `App.tsx`. **Tested:** yes — 8 mandated agent cases plus suspension coverage inside the current suite. **Verified:** API-level plus the dev DB's `agent_profiles` table.

### Increment D — Agent verification & professional authorisation
**Documented:** yes. **Implemented:** yes — `identity_verifications`, `professional_authorisations`, `verification_documents`, `verification_decisions` in the schema; `lib/verification.php`, `lib/private_storage.php`, `lib/crypto.php`; capability helpers `can_review_verifications()` / `can_access_identity_documents()` (default 0 in both engines, `schema.sqlite.sql:26–32`); CLI `grant_reviewer.php`; `verification_retention.php`; frontend `VerificationPanel` mounted for agent *and* landlord, `AdminVerificationQueue` mounted inside `AdminAgentAccounts`. **Tested:** yes — 17 D tests, all green now. **Verified:** API-level; identity document access checked through HTTP in tests, not through a browser.

### Increment E — Fee policies & agent tiers
**Documented:** yes. **Implemented:** yes — `fee_policies` (extended), `fee_policy_snapshots`, `fee_policy_events`; `lib/fee_policies.php` with the tier derivation and lifecycle; policy endpoints at `api.php:164–171`; `AdminFeePolicies` + `AdminFeeLedger` mounted in the admin console (`AdminDashboard.tsx:604,808`); capabilities `can_manage_fee_policies` / `can_approve_fee_policies`. **Tested:** yes — 14 E tests green, including "the proposed 60/40 and 70/30 arrangements stay inactive and unapplied". **Verified:** the dev DB contains **zero** rows in `fee_policies` and `fee_policy_snapshots`, which independently corroborates "no approved policy exists".

### Increment F — Agent-led viewing lifecycle
Implemented and tested, but with residual verification gaps. Detailed in §4–§6.

---

## 4. Increment F — what actually exists in the code

### 4.1 Backend (implemented, tested, green)

| Piece | Evidence |
| --- | --- |
| Lifecycle module | `php-backend/lib/viewings.php`, 999 lines, new/untracked. Contains the 12-status vocabulary (lines 37–48), labels (52–63), terminal set (68–72), `VIEWING_APPOINTMENT_STATUSES = ['confirmed','rescheduled']` (76), the transition matrix (114–155), role resolution (172–212), agent-operational check (218–228), access/overdue/slot helpers, history (352–430), read-only financial state (432–465), notifications (467–510), transitions (569–756), corrections (758–829), assignment (831–890), capability (892–927). |
| Routes | `php-backend/lib/api.php:112–123` — create (`/viewings` plus three legacy aliases), list, admin list, admin detail, correction, assign-agent, action, get, legacy PATCH. |
| Guards verified by reading the code | completion and both no-shows refuse before the slot passes (`viewings.php:613–625`); correction requires ≥10 characters (`VIEWING_CORRECTION_REASONS_MIN`, line 78); `confirm` cannot skip `proposed` (not in the matrix); tenant cannot complete or self-no-show (`completed`/`tenant_no_show` are agent/admin only); landlord may only cancel (enforced again in `handle_update_viewing`). |
| Schema | `schema.sqlite.sql:105–160` — new `viewing_schedules` columns (`tenant_user_id`, `agent_user_id`, `landlord_user_id`, `request_type`, `preferred_*`, `confirmed_*`, `cancel*`, `completed_*`, `agent_notes`, `updated_at`) plus three indexes; new append-only `viewing_events` (147+). Mirrored in `database.sql` and `migrate.php`. |
| Capability | `can_correct_viewings` defaults to 0 in both engines (`schema.sqlite.sql:32`, `database.sql:49`); granted by `grant_viewing.php`. |
| Agent listing submission | `api.php:1255–1330`: landlord resolved by id → email → phone, **only** `role='landlord'`; matched and unmatched both yield `landlord_authority_state='claimed_by_agent'` and no landlord id in the agent's response; the claim is retained in `landlord_contact_claimed` for staff only. |
| Notifications | On creation the responsible agent gets an in-app notification and the tenant gets an email (`api.php:2215–2250`); every transition and correction calls `viewing_notify()` (`viewings.php:749, 815`), which writes in-app rows and queues email. |

### 4.2 Frontend (implemented, type-checked, built, **not** exercised in a browser)

| Component | Lines | Wired at |
| --- | --- | --- |
| `src/components/AgentViewingsPanel.tsx` | 384 | `AgentDashboard.tsx:15,173` |
| `src/components/AgentListingForm.tsx` | 298 | `AgentDashboard.tsx:16,176` |
| `src/components/AdminViewingsPanel.tsx` | 530 | `AdminDashboard.tsx:8,979` |
| `TenantViewingCard` inside `TenantDashboard.tsx` | — | `TenantDashboard.tsx:50,770` |
| Context/api plumbing | — | `AppContext.tsx:847,852` (`refreshViewings`, `runViewingAction`); `apiService.ts:504–539` |

`npx tsc --noEmit` is clean and `npm run build` succeeds, which proves the components compile and every import resolves. It does **not** prove any of them renders correctly, behaves correctly on a phone, or talks successfully to a current backend — see §5.

### 4.3 Tests (executed today, in this assessment)

```
$ npm run test:api
# tests 161   # suites 28   # pass 161   # fail 0   # cancelled 0   # skipped 0
```

The Increment F suite is the last of the 28 and reports `1..19`, matching the 19 tests named in `INCREMENT_F_REPORT.md` §12 one-for-one (I compared the names). The 142 A–E tests all still pass, including the regression test "Increments A-E still behave with the new lifecycle in place".

**Conclusion for F:** the *implementation* described in the F report is present in the working tree, is syntactically valid, compiles, builds, and its automated suite passes on a freshly built database. **F is not "verified" in the sense defined in §0.**

---

## 5. F tasks: complete vs incomplete

### Complete (implemented + tested)

1. Status model, server-side transition matrix, role enforcement.
2. Request-creation flow that never presents itself as a confirmed appointment.
3. Enquiry-vs-viewing distinction with a conversion path.
4. Agent queue with propose / confirm / reschedule / request-reschedule / cancel / complete / no-show / could-not-proceed.
5. Append-only history with actor, timestamp, previous and new status and slot.
6. Cancellation reasons and who cancelled them.
7. Completion/no-show time gating; terminal states closed to normal transitions.
8. Admin oversight list with status/property/agent/tenant filters, counts and overdue detection.
9. Audited admin correction behind a default-off capability.
10. Agent reassignment (active agents only), audited.
11. Suspended agent loses operational access while history survives.
12. Fee ledger untouched by every lifecycle action; legacy PATCH preserved with its 409 remittance guard.
13. Agent listing submission UI plus the non-disclosing landlord reference resolution.
14. Honest tenant/agent/admin wording across the four screens and the request email.

### Incomplete or unverified (all are verification/documentation gaps, not missing features)

| # | Item | Why it matters | Evidence |
| --- | --- | --- | --- |
| F1 | **The local dev database is stale; the F screens have never been run against a working backend** | Every UI claim rests on `tsc` + `build`. A dev run currently 500s on viewing reads. | `.data/dev.sqlite` (mtime 07:33) predates the F schema (07:45–08:34); `PRAGMA table_info(viewing_schedules)` lacks every F column and `viewing_events` does not exist; live probe: `GET /api/viewings` → **500**, log: `no such column: tenant_user_id`. |
| F2 | No browser/mobile pass of the four F surfaces | The brief required mobile testing; nothing in the tree shows it was done. | No browser available in this sandbox; F report §12 says so explicitly. |
| F3 | **`landlordEmail` / `landlordPhone` resolution is untested** | The oracle-proofing argument in F §8 rests on code paths no test exercises. Only the `landlordId` path is covered (matched landlord, non-landlord id, missing reference). | `grep "landlordEmail:" tests/api.test.mjs` → no request body ever sends it; the only `landlordPhone` occurrence is an unrelated agreement payload at line 820. |
| F4 | Lifecycle notifications are not asserted by any test | F §9 claims request/receipt/proposal/confirmation/reschedule/cancel/complete notifications. They are wired in code, but the F suite contains no notification assertion. | `grep notification` within the F suite → nothing; `viewings.php:749,815` shows the calls exist. |
| F5 | `awaiting_agent` is a defined status that nothing ever sets | Harmless, but F §6 lists it as part of the model without saying it is unused, so readers will assume it occurs. | It appears only in the vocabulary, the label map and the transition matrix (`viewings.php:39,54,141`); creation sets `viewing_requested` or `enquiry_received` (`api.php:2171`). |
| F6 | MySQL DDL still unexecuted | Standing rule: MySQL correctness may only be claimed after checking MySQL. | F report §13.1 states it; no MySQL server in this environment (confirmed again today). |
| F7 | `migrate.php` cannot upgrade an existing SQLite database | Anyone following "run migrate.php" on SQLite gets a message telling them to rebuild the file instead; the stale dev DB is exactly this case. | `migrate.php:58–61`; `db.php:41–48` only initialises a *new* file. |
| F8 | Documentation omissions | Minor but real: the F endpoint table lists only `/api/viewings` although three legacy aliases are also registered; `awaiting_agent` is not marked unused; the report does not mention that the dev SQLite DB is stale. | `api.php:112–115`; see F5. |

---

## 6. Discrepancies between documentation and source code

I found **no case where a document claims a feature that is missing from the code**. The discrepancies run the other way — documentation that is silent or slightly stale about what the code does.

| # | Discrepancy | Severity | Detail |
| --- | --- | --- | --- |
| D1 | `.data/dev.sqlite` cannot serve the F API | **High for verification, none for code** | The dev DB predates every F change; `GET /api/viewings` returns 500 with `no such column: tenant_user_id`. No document mentions this. The automated tests are unaffected (fresh DB per run). |
| D2 | `docs/INCREMENT_D_REPORT.md` §12 calls the next increment "Increment E (agent-led viewing lifecycle)" | Low | The numbering shifted: E became fee policies/tiers, F became the viewing lifecycle. A reader following D's forward reference will look for the wrong thing. |
| D3 | `awaiting_agent` presented as a live status | Low | Defined, labelled and in the matrix; never assigned by any code path. |
| D4 | F endpoint table omits the three legacy create aliases (`/api/viewing-requests`, `/viewing-request`, `/viewing_request`) | Low | They exist at `api.php:112–114` for backwards compatibility. |
| D5 | Docs claim the frontend "avoids misleading terms", but pre-existing marketing copy still says "verified listings" / "verified properties" in at least 11 places | Medium — **pre-existing, not introduced by F** | Already logged as item 10 in `INCREMENT_B_REPORT.md` §8 and left to an owner/legal decision: `AboutView.tsx:23,75,89`, `BrowseView.tsx:122`, `FindAHomeView.tsx:442`, `HomeView.tsx:273`, `ListPropertyView.tsx:209`, `PropertyDetailView.tsx:532`, `TenantDashboard.tsx:434`, `App.tsx:130`, and the match-ready email in `api.php:2069` ("We have verified properties that match your request"). F did not touch these; they still conflict with the standing language rules. |
| D6 | `@types/react` / `@types/react-dom` are installed with `--no-save` | Low, environmental | They are in `node_modules` (so `tsc` genuinely type-checks JSX today) but absent from `package.json`, so a fresh `npm install` silently downgrades type-checking to "no JSX checks". All reports cite `tsc` as evidence; that evidence is environment-dependent. |
| D7 | Test runs append to the shared `php-backend/logs/` and leave ~40 SQLite files plus private-document directories in `.data/` | Low, hygiene | All git-ignored, so nothing leaks into the repository, but the directory is noisy and contains generated (fake) identity documents from test fixtures. |
| D8 | `lib/outbox.php:284` logs `Undefined variable $retentionDays` | Low, pre-existing | Already noted in D report §11.11; still present in today's log. |
| D9 | `lib/api.php:1382–1383` emit "array offset on null" warnings | Low | Visible in `php-error.log` around the same runs. Not investigated further, outside this assessment's scope, but it should be tracked. |

---

## 7. Outstanding issues inherited from A–E that affect the remaining work

1. **Everything is uncommitted** (§1). This is the largest practical risk to the project.
2. **MySQL has never been executed** (A–F all say so). Every schema change since B must be validated on a real MySQL copy before deployment, and `migrate.php --apply` has never run anywhere.
3. **Receipt issuing remains disabled** by design; `POST /api/receipts` is a 503. Nothing may re-enable it before the receipt model is corrected (B).
4. **`is_verified` / `is_landlord_verified` are still evidence-free flags** carried in the schema and UI vocabulary; the reports say so, but any new screen must keep treating them as meaningless.
5. **60/40 and 70/30 remain inactive, with zero policy rows** — confirmed again today in the dev DB and by the E test that runs in the current suite. Nothing in F changed this.
6. **No remittance/settlement flow exists** (that is G). F correctly creates no fee rows.
7. **Marketing "verified" copy** (D5) remains the biggest language-rule violation in the product, pre-dating F.
8. **`php-backend/storage/private` protection depends on Apache `AllowOverride`** unless `PRIVATE_UPLOAD_DIR` is moved outside the web root (D §11.1).
9. **The pre-existing PHP warnings** (D8, D9) will keep polluting logs and could mask genuine F-era errors during a manual run.

None of these blocks continuing work on F's verification; items 2 and 3 are hard gates before any deployment, and item 1 is a gate on *everything*.

---

## 8. Direct answers to the eight questions

**1. Which increments have been completed and documented?**
Increment 0 and Increments A, B, C, D, E are documented and, per their reports, complete. F is documented.

**2. Which increments are implemented and verified in the actual source code?**
Implemented: 0, A, B, C, D, E, F — all confirmed present in the working tree by direct inspection today. Tested: all seven, via the 161-test suite that passes now. Verified in a running environment: none beyond API-level HTTP for the backend. Frontend work across A–F compiles and builds but has never been clicked through.

**3. Is Increment F in progress, partially completed, or completed?**
**Functionally complete, and its tests pass — but not closed.** It sits one step short of "done": the implementation and automated coverage are there, while the running-environment verification (D1/F1/F2) and two small test gaps (F3/F4) remain. It is not "partially implemented" in any meaningful sense — I searched for missing F features and found none.

**4. Which parts of F were already implemented before the interruption?**
All of it, as far as the repository can tell: the lifecycle module, routes, schema, migration entries, capability and CLI, agent/tenant/admin frontend, the agent listing form, the test suite, and the report. The newest artefacts (08:34–08:46) are the frontend components and the F report itself, i.e. the interruption landed after the last edit and not in the middle of one.

**5. Which parts of F remain unfinished?**
Only verification and documentation tasks: F1–F8 in §5. No code is missing.

**6. Are there discrepancies between documentation and the source code?**
Yes — nine, listed in §6. None is "documented but not built". The most consequential is D1 (stale dev database), then D5 (pre-existing "verified" copy), then the two test gaps F3/F4 and the stale D→E numbering.

**7. What is the exact next task?**
**Not more feature code.** The next task is the F closure pass, in the order given in §9, starting with rebuilding the local SQLite dev database so the F screens can be exercised at all.

**8. Are there issues from A–E that could affect the remaining work?**
Yes, and two are material: (a) nothing is committed, so all A–F work is one accidental command away from loss; (b) MySQL is unexecuted, so the F DDL cannot be called deployable. The rest (§7 items 3–9) are constraints to respect rather than blockers.

---

## 9. Recommended next step and exact resume point

**Resume point: end of Increment F implementation — begin the F verification-and-closure pass. Do not start Increment G. Do not add features.**

In order, each small and each ending with evidence:

1. **Rebuild the local SQLite dev database from `schema.sqlite.sql`** so the F schema is actually present (`.data/dev.sqlite` is disposable dev data with zero viewing rows; this needs your go-ahead because it is a delete-and-recreate of a local file). Without this, no manual test of F is possible — `GET /api/viewings` 500s today.
2. **Manual smoke pass of the four F surfaces** against the running dev stack: tenant request → status wording; agent queue → propose → confirm → reschedule → complete; admin panel → filters, history, correction (with the capability granted to one admin), reassignment; agent listing form → submit for a landlord by email and by phone, confirming the response is identical whether or not the account exists.
3. **Close the two test gaps**: add coverage for `landlordEmail`/`landlordPhone` resolution and its non-disclosure property (F3); add an assertion that lifecycle transitions create notifications (F4). Re-run the full suite and report the count.
4. **Resolve `awaiting_agent`** (use it at creation, or remove it from the vocabulary) and correct the small documentation omissions (D3, D4, F7, F8) without rewriting the existing reports — an addendum section is the honest way to do it.
5. **Decide about D5** (marketing "verified" copy): it is an owner/legal call, not an implementation detail; it has been open since B.
6. **Only then** append the closure evidence to the F work and stop for your review of G.

**Explicitly not next:** committing, pushing, deploying, touching production, redesigning anything, activating fee policies, or building remittance/commission flows.

---

## 10. Restrictions honoured in this exercise

- No feature was implemented; no increment was continued; Increment G was not started.
- No commit, push or deployment; `git log` is unchanged at `cbd5ced`.
- No reset, clean, checkout or revert; the stash list is still empty; `git status` reports the same 58 entries before and after this assessment.
- No existing increment report was modified, and no new documentation besides this recovery report was created.
- No production database was accessed. The only database writes were an auth session row and a log line in the local, git-ignored `.data/dev.sqlite` created by the dev-stack probe.
- Nothing in this report is marked "tested" or "verified" without a command I actually ran during this assessment; the commands and their outputs are quoted in §0 and §4.3.

---

## 11. Addendum — Increment F closure pass (3 November 2026)

Recorded after the authorised development-verification pass. Sections 3–6 above remain as written; this addendum says what has changed since, and what has not. Full detail lives in **`docs/INCREMENT_F_REPORT.md` §16**.

### 11.1 What the closure pass did

| Item | Before | After |
| --- | --- | --- |
| Stale dev database (**F1**, **D1**) | `.data/dev.sqlite` predates the F schema; `GET /api/viewings` → 500 | **Mitigated without touching it.** A SHA-256-verified backup was taken (`.data/backups/dev.sqlite.20261103T090558Z.bak`), the original was left byte-for-byte unchanged, and a separate `.data/dev-closure.sqlite` was created from `schema.sqlite.sql` for the pass. **The default dev database is still stale** — recreating it remains an owner decision. |
| Landlord email/phone privacy (**F3**, **D2-family**) | Untested code paths | **Closed.** A new suite test submits by real email, unknown email, real phone, unknown phone and a tenant's email, and asserts identical status/message/key-sets with `landlordId: ''` every time, while staff alone see the match. |
| Lifecycle notifications (**F4**) | Wired but unasserted | **Closed.** A new suite test asserts notifications for request, proposal, confirmation, reschedule, completion and both cancellation directions, and asserts **no** notification for refused actions. |
| Live interface exercise (**F2**, §4 of the F brief) | Never done | **Done at API and contract level**: 87 live assertions against a real backend, plus 103 data-contract fields confirmed against the responses the components read. |
| Browser / mobile rendering | Never done | **Still open.** No browser exists in this environment. This is the one part of the F brief that remains unverified, and it is now stated as such rather than implied. |
| Automated tests | 161 | **163, all passing** (`# tests 163 / # pass 163 / # fail 0 / # suites 28`), run in this pass. |
| MySQL (**F6**) | Unexecuted | **Still unexecuted.** No MySQL server available. |

### 11.2 New findings (numbered to follow §6; none were fixed)

| # | Finding | Compared with the assessment |
| --- | --- | --- |
| D10 | **Denial codes differ by record existence**: an existing viewing the caller may not see returns **403**, a nonexistent id returns **404**. The F report's §7 claims 404 for non-participants. IDs are 20-hex random, so this is a weak existence oracle, not an exploitable IDOR — but the documentation is wrong. | New. Documentation-vs-code mismatch, low–medium. |
| D11 | **A cancellation reason is stored on the record and shown in history, but omitted from the notification body** (`$note ?? $reason` receives an empty string). A one-line fix, not applied during a verification-only pass; the new test pins current behaviour so a future change is deliberate. | New. Low. |
| D12 | **A hard-coded person's name is shown to tenants**: `src/components/TenantDashboard.tsx:690` falls back to "Michael Quarshie (Goodlucks Lead Agent)" when no agent is assigned. That is invented data presented as real, against the project's own rules. Pre-existing, outside Increment F, untouched. | New, and arguably the most important finding of the pass. |
| D13 | The `assigned_agent` column still defaults to `'Goodlucks Field Agent'` in both schema files and in `create_viewing()`'s fallback, so pre-F rows still display that phrase. | New, low (legacy rows only). |

`awaiting_agent` (D3) is unchanged and still never assigned. The documentation omissions D4 and D7 are addressed in `INCREMENT_F_REPORT.md` §16 and §14. The pre-existing "verified listings" marketing copy (D5) is **still untouched** — it remains an owner/legal decision.

### 11.3 Revised position

- **Increments 0 and A–E:** unchanged — implemented, tested, green, uncommitted.
- **Increment F:** now **implemented, tested (163/163) and verified at the API and interface-contract level against a real running backend**. It is *not* verified at screen level (no browser) and not verified on MySQL.
- **Increment G:** still not started, and no G-shaped work was added — no remittance, settlement, payout, gateway or agreement functionality.
- **Repository:** still branch `arena/a67485fb-goodlucks-rep`, HEAD `cbd5ced`, tree dirty, nothing committed or pushed. The only file changed by the closure pass is `tests/api.test.mjs`; the rest of the change is documentation.

### 11.4 Recommended next action

Unchanged in substance: before G, obtain a screen-level pass in a real browser (the four F surfaces plus mobile), decide D10 (403 vs 404) and D11 (reason in notifications), and fix D12. None of those is large; all are decisions as much as they are code.

---

## 12. Addendum — Increment G and the final release (3 November 2026)

**What changed since the §11 addendum.** Increment G was authorised, implemented, tested and — together with every earlier increment — committed and pushed to `main`. The update below supersedes §11.3 and §11.4.

### 12.1 Increment G, in one paragraph

Agents can now *claim* a remittance; only a staff member holding the new `can_confirm_remittances` capability can confirm that money actually arrived, and allocation applies confirmed money to specific viewing-fee obligations. Rental commissions became a separate, manually-recorded workflow. The Increment B ledger remains the only ledger; G adds claims, allocations and adjustments around it. Full detail in `docs/INCREMENT_G_REPORT.md`.

### 12.2 Findings D10–D13 and D5

| # | Status |
| --- | --- |
| D10 (403 vs 404) | **Closed as a documentation fix.** `INCREMENT_F_REPORT.md` §7 and §11 now state the measured behaviour: 403 for an existing record the caller may not see, 404 for an unknown id. The code was left alone. |
| D11 (cancel reason missing from notifications) | **Fixed.** `viewing_apply_transition()` no longer lets an empty `note` suppress `reason`; the F test that pinned the old behaviour now asserts the reason appears. |
| D12 (fictitious "Michael Quarshie (Goodlucks Lead Agent)") | **Fixed.** Tenant fallback is now "No named agent assigned yet"; the admin scheduling field defaults to the signed-in user's name with an honest placeholder. |
| D13 (`'Goodlucks Field Agent'` default) | **Fixed in code and schema.** New rows have no invented agent name; existing rows in a deployed database are untouched. |
| D5 ("verified listings" marketing copy) | **Swept.** 20+ claims across nine files now describe staff review honestly and state that review is not a title or condition guarantee. |

`awaiting_agent` (D3) is still defined and never assigned. It is documented rather than silently changed.

### 12.3 Where the project stands now

| Area | Status |
| --- | --- |
| Increments 0, A–G | Implemented, tested, committed, pushed |
| Automated tests | **175/175 pass, 29 suites**, exit 0 |
| TypeScript / lint | exit 0 |
| Production build | exit 0 |
| PHP syntax | all changed files clean |
| Browser / mobile | **not verified** — no browser available |
| MySQL / MariaDB | **not executed** — no server available |
| Production database | not read, not written |
| Deployment | none, and none authorised |

### 12.4 Next actions, in order

1. A real browser pass (desktop and 360 px mobile) of the agent finance panel and the admin finance tab.
2. Execute `migrate.php` and the five G tables against a **copy** of the production MySQL database, following `FINAL_INTEGRATION_REPORT.md` §12.
3. A business/legal decision on Ghana rental-commission licensing and tax before any commission is actually asserted against an agent.
4. Decide what "reviewed" should mean for legacy properties whose `is_landlord_verified` flag defaults to 1.
5. Only then consider deployment. Nothing in this release authorises it.
