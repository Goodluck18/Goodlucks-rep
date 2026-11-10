# GOODLUCKS HOMES — UPGRADE 2
## Final report — Phase 8 (comprehensive review of Phases 1–8)

| | |
|---|---|
| **Date** | 2026-11-10 |
| **Branch** | `arena/1dbf260c-goodlucks-rep` |
| **Head at the time of this review** | `a68f729` (Phase 7, complete) — this report is committed on top of it |
| **Base of the whole upgrade** | `ad2bb0a` (= `origin/main`, merge of PR #18) |
| **`main` modified** | **No.** |
| **Deployed** | **No.** Nothing was deployed. No production database was touched or migrated. |
| **Verdict** | **Ready to deploy, subject to your authorisation** — with the limitations in §8 that you should read before you give it. |

---

## 1. Executive summary

Every requirement row of the Phase 0 audit is implemented and covered by tests: the primary-administrator
authority model (§3), the admin console (A1–A14), the tenant experience (B1–B6), the agent and landlord experience
(C1–C8), the three-request cap (D1), the removal of rent receipts (E1), and the post-verification provider type (E2).
Eight phases were delivered in order, each with its own report and its own commit.

**The state of the code, measured today at `a68f729`:**

| Gate | Result |
|---|---|
| Test suites | **751 / 751 passing, 0 failures**, across 30 files (31 runs — the API file is split, see §4) |
| TypeScript | `tsc --noEmit` clean |
| Production build | ✓ 4.9 s; 37 assets, entry 505 kB (147 kB gzipped), admin console split into its own 287 kB chunk |
| PHP lint | 67 / 67 files clean (`php-wasm-cli -l`) |
| Schema | 47 tables (+5), 16 new columns, **0 removed**, MySQL and SQLite in step |
| Migration | additive only; fresh database reaches 42 `properties` columns; second run reports "already up to date" |
| Dependency audit | `npm audit --omit=dev` → 0 vulnerabilities |
| Runtime smoke (dev server) | 6 pages `200`, `/api/health` ok (PHP 8.5.10, sqlite, 4 properties), `GET /api/receipts` → `404`, foreign `Origin` on `POST /api/auth/login` → `403` |

**Two things you should know before reading the detail.** First, Phase 7's first commit (`61736ac`) implemented E1 too
narrowly — it removed tenants' access but kept the feature; this was caught during Phase 8, and the full removal is
`a68f729`, with the Phase 7 report rewritten to say so. Second, three requirements (A1's live cause, MySQL DDL, and
anything visual) cannot be fully proven in this sandbox; §8 says exactly what a human must check on the server.

---

## 2. Requirement coverage against the Phase 0 audit

Status verbs: **Done** = implemented, committed and covered by an executing test. **Done (verify on host)** = implemented
and tested as far as the sandbox allows, with a named manual check. Nothing below is marked done on the strength of code
existing alone.

### 2.1 §3 — Primary administrator authority

| Item | Status | Evidence |
|---|---|---|
| Authority belongs to `goodlucksonly@gmail.com` and no other account | **Done** | `users.is_primary_admin`; single resolver `php-backend/lib/auth.php:244`; assignment only through `assign_primary_admin.php` (CLI, `--confirm`), **no HTTP route exists** |
| Primary admin may create, submit, approve and activate a fee policy from one account | **Done** | `tests/primary-admin.test.mjs` 16/16 — create → edit share → submit → self-approve `200` → activate, split equals the new values |
| The self-approval exception must not extend to ordinary administrators | **Done** | same suite: ordinary admin still gets `422`; the exception is recorded as `self_approved` + `fee_policy.self_approved` |
| Lifecycle verbs, tiers, percentage invariants (100 %), snapshots, audit trail | **Done** | `tests/fee-policies-phase4.test.mjs` 12/12, `tests/admin-console-phase4.test.mts` 12/12 |
| Historical transactions never rewritten | **Done** | regression assertion in the Phase 4 suite: activating a policy leaves existing `fee_remittances` untouched |

### 2.2 A — Administrator console

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| A1 | Blog featured-image upload works | **Done (verify on host)** | trailing-slash POST + rewrite-first fix; `tests/blog.test.mjs` 45/45, `uploads` 20/20. The deployed host's 301 cause can only be confirmed in its DevTools — §8 |
| A2 | YouTube video **and** property cards in one post | Done | tolerant marker split + server normalisation; `blog` suite + `blog-html` 16/16 |
| A3 | Blog link previews (OG/Twitter/JSON-LD) | Done | `blog_page.php`, `blog_serve.php`, rewrite rules; `property-seo` 23/23 + `blog-html` |
| A4 | Mobile property cards horizontal, desktop unchanged | Done | `PropertyCard` `layout="horizontal"` inside a snap strip below `sm`; `responsive` 18/18 (structural) |
| A5 | Email template editor saves content | Done | controlled body + remount key; `admin-console` 16/16 |
| A6 | Manage listings: search, location/date/price/status, sort, paging | Done | server `createdFrom/createdTo` + UI wired to the API; `admin-console-api` 9/9, `admin-console-phase3` 11/11 |
| A7 | Tenant matching: search name/phone, status filters, auto-appear when approved | Done | `q` + `status[]` on the request list; display-only status mapping (no destructive rewrite) |
| A8 | Agent accounts: search + pending/approved/suspended, verification ≠ authorisation | Done | two-axis badges; `admin-console-phase3` |
| A9 | Fee policies and agent tiers | Done | Phase 4 (see §2.1) |
| A10 | Web inquiries: search + 5 statuses | Done | `new, received, contacted, replied, closed`; legacy rows keep their value |
| A11 | User Management: search, type/status filters, profiles | Done | `GET /api/admin/users`, `feature-only` fields; `user-management` 15/15 |
| A12 | Bulk email: audiences, dedupe, queued sending, per-recipient records, retries, preferences | Done | campaign layer on the existing outbox, one address per message, signed unsubscribe; `bulk-email` 14/14 |
| A13 | User profiles with real activity, ID documents protected | Done | aggregated from real rows; documents shown as "on file" with no URL |
| A14 | Dashboard recent-activity feed from real records | Done | reads `audit_logs` + recent viewings/requests/enquiries; no invented metrics |

### 2.3 B — Tenant experience

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| B1 | Move-in date mandatory, no silent default | Done | default removed from `FindAHomeView`; `tenant-experience` 11/11 |
| B2 | Real matching scores: budget, location, proximity, type, beds, baths | Done | weighted sum 35/20/15/10/10/10 with `matchBreakdown`; `area_adjacency` maintained by admins; monotonicity asserted |
| B3 | "Chosen for you" (admin-picked, ≥3, first, distinct) vs "similar matches" | Done | separate arrays + shortlist floor warning; `tenant-experience` |
| B4 | Request viewing → notification → tracked status | Done | existing flow reused on property pages and match cards |
| B5 | Approve · reschedule **with tenant acceptance** · cancel with reason · history | Done | `reschedule_requested` requires date, time and reason; only the tenant moves it to `confirmed`; history from `viewing_events` |
| B6 | Controlled contact disclosure (8 steps) | Done | `contact_disclosures` state machine + admin queue; approvals expire after 30 days; `tenant-contact` 10/10, `admin-console-phase5` 19/19 |
| D1 | Max three pending rental requests, server-side | Done | `409` with the limit, inside the same transaction; `tenant-experience` |

### 2.4 C — Agent and landlord experience

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| C1 | Agents independent: no landlord reference, no ownership or authority claim | Done | `landlord_id` NULL, six landlord fields blank, `landlordAuthorityState: not_applicable`; `provider-experience-phase6` 22/22 |
| C2 | Provider contact never public (API, HTML, metadata, previews, cards) | Done | redaction of residual fields + a scanner test over every public surface; `sharing` 36/36, `property-seo` 23/23 |
| C3 | Device image uploads on **both** listing paths | Done | `PropertyImagePicker` used by `ListPropertyView` and `AgentListingForm`; link support preserved; `uploads` 20/20 |
| C4 | Video embeds: YouTube / TikTok / Facebook only, validated | Done | server allowlist → canonical embed URLs, raw HTML never rendered |
| C5 | Amenities + structured specs, backward compatible | Done | 20 canonical keys, free text preserved in `amenities_note`, new `toilets`/`kitchens`/`furnishing`; legacy listings unchanged |
| C6 | Provider commission expectation, distinct from platform fees | Done | `provider_commission_*` labelled "not a platform fee", never used in calculations |
| C7 | Property-interest notices to the responsible provider, no tenant data | Done | `notify_provider_property_interest()` — property + watcher count only; dedupe |
| C8 | Transactional email on real events only | Done | 17 targets incl. `verification_approved`, `verification_attention`, `provider_interest`; every send is event-driven |

### 2.5 E — Removal and provider type

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| E1 | Rent receipts removed; fee ledger, reversals and history preserved | **Done** (`a68f729`) | 3 routes and 6 repository functions deleted; `ReceiptsView`, 2 routes, menus, shell section, context state, 3 API methods and `RentReceipt` removed; `rent_receipts` rows and the reversal endpoint kept; `tenant-receipts-removed-phase7` 9/9 |
| E2 | Tenant/agent/landlord at registration; agent-vs-landlord fixed at verification; no "agent for a landlord" | Done | `POST /api/admin/users/:id/role` requires a 10-character reason, is audited, and refuses self/self-elevation; `user-management` + `provider-experience-phase6` |

**Coverage: every row of the audit's §6 tables (A1–A14, B1–B6, C1–C8, D1, E1, E2) and every row of the §3
authority block is implemented; nothing is outstanding.**

---

## 3. Phase-by-phase results

| Phase | Commit | Delivered | Tests as the phase report states them | Report |
|---|---|---|---|---|
| 0 | (on `main`) | audit and plan | – | `UPGRADE2_PHASE0_AUDIT` |
| 1 | `880fdc4` | primary-admin authority + urgent tenant-contact redaction | `test:api` group 305 + `uploads` 18 | `UPGRADE2_PHASE1_REPORT` |
| 2 | `47cea1f` | A1–A8, A10 (console, blog, mobile cards) | `test:api` group 316 | `UPGRADE2_PHASE2_REPORT` |
| 3 | `7815628` | A11, A12, A13, A14 (users, activity, bulk email) | `test:api` group 345 | `UPGRADE2_PHASE3_REPORT` |
| 4 | `5316609` | A9 (fee policies and tiers) | `test:api` group 345 + 12 + 12 | `UPGRADE2_PHASE4_REPORT` |
| 5 | `fed5ac8` | B1–B6, D1 (tenant experience) | full matrix 716 / 716 | `UPGRADE2_PHASE5_REPORT` |
| 6 | `1ccd747` | C1–C8, E2 (provider experience) | full matrix 738 / 738 | `UPGRADE2_PHASE6_REPORT` |
| 7 | `61736ac`, `a68f729` | E1 (rent receipts) — first pass too narrow, completed in `a68f729` | full matrix 754 → **751** | `UPGRADE2_PHASE7_REPORT` |
| 8 | this commit | review, regression, final report | full matrix **751 / 751** | this document |

Phases 1–4 reported the grouped `test:api` run they had at the time; from Phase 5 onwards the whole matrix is reported.
The figures in the last column are quoted from each phase report, not recomputed, so they describe the code as it stood
at that commit.

Commit graph: `ad2bb0a` → `880fdc4` → `47cea1f` → `7815628` → `5316609` → `fed5ac8` → `1ccd747` → `61736ac` → `a68f729`
→ final report commit. `main` is still `ad2bb0a`.

The test total moved from 754 to 751 because Phase 7 deleted the receipt feature's own tests along with the feature —
coverage of *behaviour* did not drop, but a smaller number is the honest one.

---

## 4. Regression — the numbers, and how they were obtained

Every figure below was produced in this session against `a68f729` with the commands quoted. The API file is run in two
processes because a single PHP-WASM process wedges after roughly a thousand requests (a limitation of the sandbox
runtime, documented since Phase 5, not of the product).

| Suite | Run with | Result |
|---|---|---|
| `tests/api.test.mjs` — suites 1–29 | `node --test --test-concurrency=1 --test-name-pattern="<29 describes>"` | **185 / 185** |
| `tests/api.test.mjs` — suite 30 (finance reversals, concurrency) | same file, only that describe | **14 / 14** |
| `tests/access-control.test.mjs` | `node --test --test-concurrency=1` | 11 / 11 |
| `tests/tenant-receipts-removed-phase7.test.mjs` | same | 9 / 9 |
| `tests/tenant-contact.test.mjs` | same | 10 / 10 |
| `tests/tenant-experience.test.mjs` | same | 11 / 11 |
| `tests/provider-experience-phase6.test.mjs` | same | 22 / 22 |
| `tests/fee-policies-phase4.test.mjs` | same | 12 / 12 |
| `tests/primary-admin.test.mjs` | same | 16 / 16 |
| `tests/user-management.test.mjs` | same | 15 / 15 |
| `tests/bulk-email.test.mjs` | same | 14 / 14 |
| `tests/admin-console-api.test.mjs` | same | 9 / 9 |
| `tests/migration.test.mjs` | same | 14 / 14 |
| `tests/concurrency.test.mjs` | same | 6 / 6 |
| `tests/account-settings.test.mjs` | same | 7 / 7 |
| `tests/task03.test.mjs` | same | 50 / 50 |
| `tests/blog.test.mjs` | same | 45 / 45 |
| `tests/content.test.mjs` | `node --test` | 4 / 4 |
| `tests/design-tokens.test.mjs` | `node --test` | 14 / 14 |
| `tests/email-footer.test.mjs` | `node --test` | 3 / 3 |
| `tests/routing.test.mts` | `node --import tsx --test` | 50 / 50 |
| `tests/app-navigation.test.mts` | same | 59 / 59 |
| `tests/sharing.test.mts` | same | 36 / 36 |
| `tests/uploads.test.mts` | same | 20 / 20 |
| `tests/responsive.test.mts` | same | 18 / 18 |
| `tests/property-seo.test.mts` | same | 23 / 23 |
| `tests/blog-html.test.mts` | same | 16 / 16 |
| `tests/admin-console.test.mts` | same | 16 / 16 |
| `tests/admin-console-phase3.test.mts` | same | 11 / 11 |
| `tests/admin-console-phase4.test.mts` | same | 12 / 12 |
| `tests/admin-console-phase5.test.mts` | same | 19 / 19 |
| **Total** | 30 files, 31 runs | **751 pass / 0 fail** |

Arithmetic: 185+14 = 199 (API) + 11+9+10+11+22+12+16+15+14+9+14+6+7+50+45+4+14+3 = 272 → 471; + 50+59+36+20+18+23+16+16+11+12+19 = 280 → **751**.

**Defects found and fixed during Phase 8** (all in the upgrade's own code, none in production behaviour):

1. **Phase 7 was incomplete** — E1 had been read as "tenants lose access" rather than "the feature is deleted". Fixed in
   `a68f729` with the full removal and a rewritten report. This is the single most important finding of Phase 8.
2. **Two test-harness bugs in the new Phase 7 tests** — iterating a client map that held strings, and assuming
   `sqlite-tool.php` prints a bare array when it prints `{ok, mode, rows}`. Both fixed; the assertions were corrected to
   the real shapes, not weakened.
3. **One assertion that could not distinguish "route removed" from "record missing"** — a `404` from the reversal handler
   looked identical to a `404` from the router. It now asserts on the handler's own message.

---

## 5. Build, type, lint, schema and migration readiness

| Check | Command | Result |
|---|---|---|
| Types | `tsc --noEmit` | clean, no errors |
| Build | `npm run build` | ✓ 4.9 s; entry `index-*.js` 505,043 B (147,328 B gzip); `AdminDashboard` 286,765 B; 37 assets in total |
| PHP syntax | `php-wasm-cli -l` over all 67 `.php` files | 67 / 67 clean |
| Dev runtime | `npm run dev`, `curl /api/health` | `200`, `{"status":"ok","php_version":"8.5.10","driver":"sqlite","database_connected":true,"properties_count":4}` |
| Pages | `/`, `/properties`, `/find-home`, `/blog`, `/admin-login`, `/landlord/dashboard` | all `200` |
| Schema parity | `php-backend/database.sql` vs `php-backend/schema.sqlite.sql` | identical table sets (47) and identical new columns |
| Migration idempotent | `migrate.php --apply` twice on one database | first run creates to schema, second prints "Schema is already up to date" |
| Migration additive | diff `ad2bb0a` → `a68f729` | **5 new tables, 16 new columns, 0 dropped tables, 0 dropped columns** |
| Upgrade path with data | `tests/migration.test.mjs` | 14 / 14 — existing rows preserved while columns are added |

**The complete migration register** (this is the whole of what deployment will change in the schema):

*New tables (5):* `area_adjacency`, `contact_disclosures`, `email_campaigns`, `email_campaign_recipients`,
`email_preferences`.

*New columns (16):* `users`: `is_primary_admin`, `can_manage_users`, `can_view_user_activity`, `can_send_bulk_email` ·
`fee_policies`: `self_approved`, `self_approved_at` · `fee_policy_events`: `changes_json` · `properties`: `latitude`,
`longitude`, `toilets`, `kitchens`, `furnishing`, `amenities_note`, `video_provider`, `video_url`,
`provider_commission_percent`, `provider_commission_note`.

Every one is nullable or defaulted, so existing rows stay valid. Nothing is renamed, narrowed, or dropped. `rent_receipts`
and its rows are untouched, and no migration deletes data.

---

## 6. Security and privacy findings

### 6.1 Authentication

* Passwords are bcrypt (`password_hash(..., PASSWORD_BCRYPT)`) and verified with `password_verify` against a dummy hash
  when the account does not exist, so a failed sign-in does not reveal whether an address is registered.
* Sessions are bearer tokens in `auth_sessions`; administrators must sign in through `POST /api/auth/admin-login`, which
  additionally requires `ADMIN_ACCESS_KEY`.
* Rate limits are enforced per IP and per identity: login 60/15 min per IP and 12/15 min per address; admin login
  40/15 min per IP and 6/15 min per address; registration is capped by `REGISTER_RATE_LIMIT_PER_HOUR`.
* **CSRF/origin:** `require_trusted_origin()` rejects a foreign origin on a state-changing request. Verified live in this
  session: `POST /api/auth/login` with `Origin: https://evil.example` → **403**.

### 6.2 Authorisation

* One capability resolver in `php-backend/lib/auth.php`; `is_primary_admin` is the union of capabilities and **cannot be
  granted over HTTP** — there is no route that writes it, only the CLI script (verified: `grep is_primary_admin
  php-backend/lib/api.php` → no match).
* Role changes (E2) are capability-gated, audited, require a written reason of at least 10 characters, and refuse
  self-targeting and self-elevation.
* Administrator endpoints are gated by role and, where a specific function is guarded, by the capability for that
  function; `tests/access-control.test.mjs` exercises the anonymous, tenant, landlord, agent and admin cases, and the
  Phase 4/5 console suites exercise the capability-by-capability refusals.

### 6.3 Privacy — the two rules that matter most

* **Provider contact is never public.** Phase 6 removed the residual `landlordName` / `landlordCompany` /
  `submittedByUserId` leaks from public shapes, and a scanner test walks the public API, property HTML, blog HTML,
  sitemap and share cards and fails on any non-company phone, email or WhatsApp value. `sharing` 36/36 and
  `property-seo` 23/23 pass.
* **Tenant contact only after administrator approval.** `contact_disclosures` is the only path by which a tenant's
  details reach a provider; viewing-request mail and provider alert payloads carry property and count, never identity.
  `tenant-contact` 10/10 and the C7 assertions in `provider-experience-phase6` prove it.
* **Identity documents** live outside the web root; the stored flag is `R` (private) and the console shows "on file,
  gated" with no URL. No code path returns a document path.

### 6.4 Repository and runtime hygiene

| Check | Result |
|---|---|
| Secrets, `.env`, databases, uploads in Git | none tracked (`php-backend/storage/private/.gitignore` only) |
| Hardcoded API keys / private keys | none found |
| `var_dump` / `print_r` / `error_log` in production code | none |
| `display_errors` | forced `off` in `php-backend/.htaccess` |
| Upload directory | `Options -Indexes -ExecCGI`, handlers removed, `php|phtml|phar|cgi|pl|sh` denied |
| `npm audit --omit=dev` | 0 vulnerabilities |

### 6.5 Findings that need action on the host, not in the code

1. **`ADMIN_ACCESS_KEY` must be set in production.** It is unset locally (the dev server says so), which is right for a
   laptop and wrong for a server.
2. **HTTPS headers.** The live site sends `x-frame-options` and `referrer-policy` but **no HSTS and no CSP**. This upgrade
   did not change that; if you want them, they belong in the server config, and a CSP must first be scoped to the video
   embeds Phase 6 added.
3. **`goodlucks.co` has no MX record** while the product sends transactional email from `goodlucks.co`. Deliverability —
   not code — depends on that DNS gap and on SPF/DKIM for the sending domain. Worth fixing before the bulk-email console
   is used for real.
4. **PHP version.** Everything here ran on PHP 8.5.10, and no 8.x-only syntax was introduced on purpose — the new code
   follows the existing style. Even so, confirm the host's PHP version and deploy to staging first; a version mismatch is
   the one thing this sandbox cannot rule out.

---

## 7. Workflow verification

| Workflow | How it was verified | Result |
|---|---|---|
| Registration (tenant / agent / landlord) | API suite + `user-management` | provider types offered at registration; `canSubmitListings` still gates listing without being a verification substitute |
| Listing submission (landlord path) | API suite, `provider-experience-phase6` | fee, terms, media, video, amenities, provider commission all accepted and echoed |
| Listing submission (agent path, C1) | `provider-experience-phase6` | no landlord reference required; landlord fields blank; `landlord_id` NULL |
| Verification | `admin-console-phase3/4`, `user-management` | approve/reject with note; new `verification_approved` / `verification_attention` emails fire from the decision, not from a timer |
| Viewing lifecycle (B5) | `tenant-experience`, `api` suite 30 | propose → confirm → reschedule **request** (date+time+reason) → tenant accepts → complete; landlord can now do all but accept |
| Rental request cap (D1) | `tenant-experience` | 3 succeed, 4th → `409`, slot frees when one leaves pending |
| Matching (B2/B3) | `tenant-experience` | scores move in the right direction as budget/location/proximity/type/beds/baths improve; curated block ≥3 first, then similar |
| Contact disclosure (B6) | `tenant-contact`, `admin-console-phase5` | request → queue → approve/reject with reason → reveal to that provider only → expiry → audit |
| Financial: fee policies (A9) | `fee-policies-phase4`, `primary-admin` | create → submit → approve (self-approval for the primary admin only) → activate → snapshot; history immutable |
| Financial: viewing fees and commissions | `api` suite 30, `admin-console-api` | ledger, remittances, allocations and reversals all answer; reversal route preserved after E1 |
| Bulk email (A12) | `bulk-email` | queue, one address per message, dedupe, failure state, retry, unsubscribe link; **no transport here**, so real delivery is untested (see §8) |
| Transactional email (C8) | `bulk-email`, `admin-console-phase3`, `email-footer` | all 17 targets render with the branded footer; no email is sent from a non-event path |
| Search and filters (A6/A7/A8/A10/A11) | API + console suites | every filter round-trips to the server; no client-side filtering of a partial page |
| Responsive layouts | `responsive` 18/18, `design-tokens` 14/14 | mobile card strip, dashboard shells, admin tables; **structural** assertions only (§8) |
| Removal (E1) | `tenant-receipts-removed-phase7`, routing, app-navigation | 404 for all roles, no screen or menu anywhere, data and fee ledger intact |

---

## 8. Remaining limitations, outstanding bugs, and deployment readiness

### 8.1 Outstanding bugs

**None known in the shipped code.** Everything that failed during Phase 8 was fixed in this branch and is listed in §4.
Three items are open *by design or by environment*, not defects:

1. **A1's root cause was never observed on the live host.** The fix is defensive at both layers (rewrite order and
   router), so it holds whichever cause the host had — but only the host's DevTools can confirm the original 301.
2. **`find_user_by_phone()` is now unused** after Phase 7 removed its only caller. Left in place deliberately; it is not
   dead product behaviour, just an unused helper.
3. **`rent_receipts` has no screen any more.** Staff who need an old record must query the database. If the business wants
   that history visible, it should be a read-only report under the fee ledger — a new requirement, not a regression.

### 8.2 Limitations of what could be verified here

| Limitation | Consequence | Manual step for you |
|---|---|---|
| No Chrome / Playwright in the sandbox | No visual or click-through verification; all UI claims rest on rendering tests, source assertions, `tsc` and the build | Click through: admin console tabs, `/list-property` and `/agent/listings` upload, `/find-home` match panel, `/tenant/dashboard`, `/landlord/dashboard`, `/receipts` (should be not-found), blog editor with video **and** property cards, and a phone-width view of `/properties` |
| No mail transport (`EMAIL_TRANSPORT=none`) | Queueing, dedupe, retry and unsubscribe are proved; **real delivery is not** | On the host, register a test account and send one campaign to it; check the Resend dashboard and the `email_outbox` rows |
| No MySQL server | SQLite exercises the same migration code path, and the MySQL DDL is additive `ALTER TABLE … ADD COLUMN`; the MySQL statements themselves were never executed | Run `php-backend/migrate.php --plan` against a **staging** copy, read the plan, then `--apply` there before production |
| PHP 8.5.10 only | A syntax feature newer than the host's PHP would only show at runtime | Deploy to staging first and hit `/api/health` plus one page per role |
| Single PHP-WASM process wedges near ~1000 requests | `npm run test:api` cannot finish in one process here | Irrelevant on a real server; locally, run the two halves as in §4 |
| No production database, no deployment | Nothing here proves the production state | Follow §8.3 |

### 8.3 Deployment readiness

**Assessment: ready, additive, and reversible by redeploying the previous code.** No data migration is destructive, no
endpoint that an external system calls was removed, and `main` is untouched.

Recommended order, when you authorise it:

1. **Back up the database** (standard practice; nothing in this upgrade requires a restore).
2. Copy the files. Do **not** import `database.sql` over the existing database — that file is for a fresh install.
3. Run `php-backend/migrate.php --plan` (read-only) and check that it proposes only the 5 tables and 16 columns in §5.
4. Run `php-backend/migrate.php --apply`.
5. Set `ADMIN_ACCESS_KEY` if it is not already set, and confirm the mail and upload paths.
6. Run `php-backend/assign_primary_admin.php --email=goodlucksonly@gmail.com --confirm` **once**. Until this runs, the
   primary administrator behaves exactly like any other administrator (the safe default); A9's self-approval exception
   stays dormant.
7. If the host is Apache, confirm the `.htaccess` rules for blog links and `php-backend/uploads` took effect; the PHP
   router fallback covers other servers either way.
8. Smoke test, in this order: `/api/health` → sign in as tenant (no receipt screen, match panel) → as landlord (listings,
   viewings) → as agent (independent listing, no landlord fields) → as admin (console tabs, user management, fee policies)
   → `/property/<id>` in a link preview → `/blog/<slug>` in a link preview.
9. Optional, on the first quiet hour: one test bulk campaign and one transactional registration email.

**Rollback:** redeploy the previous release. The schema additions are nullable and unused by old code, so the previous
version runs against the migrated database without complaint. Nothing needs to be dropped.

---

## 9. Git history of Upgrade 2

| Commit | Phase | Summary |
|---|---|---|
| `880fdc4` | 1 | primary-administrator authority + tenant-contact redaction |
| `47cea1f` | 2 | admin console, blog and mobile cards (A1–A8, A10) |
| `7815628` | 3 | user management, activity feed, bulk email (A11–A14) |
| `5316609` | 4 | fee policies and provider tiers (A9) |
| `fed5ac8` | 5 | tenant experience (B1–B6, D1) |
| `1ccd747` | 6 | provider experience (C1–C8, E2) |
| `61736ac` | 7 | rent receipts, first pass (too narrow) |
| `a68f729` | 7 | rent receipts, complete removal (E1) |
| this commit | 8 | final review and this report |

All of it is on `arena/1dbf260c-goodlucks-rep` and pushed to origin. `main` remains `ad2bb0a`.

---

## 10. What I need from you

1. **Deployment authorisation**, when you are ready — deployment itself was never authorised in this session and has not
   happened.
2. A decision on **A1's live cause** only if the fix does not hold on the host (unlikely; it is defensive).
3. A decision on **historical rent receipts**: leave them database-only (current state) or build a read-only report later.

Nothing else in the requirement set is outstanding.
