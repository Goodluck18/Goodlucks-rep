# Increment B — truthful viewing-fee accounting, honest payment records, safer registration

**Branch:** `arena/a67485fb-goodlucks-rep` (HEAD `43b410f`, Increment A preserved in the working tree)
**Status:** implemented, tested, **uncommitted / undeployed**. No production database was touched.
**Date:** 1 November 2026

---

## 1. The two copy corrections (Part 1)

| # | File | Before | After |
| --- | --- | --- | --- |
| 1 | `src/components/HomeView.tsx` (line 247, “Step 3 — Move In”) | “We handle the tenancy contract, key transfer, and landlord relationship so you can move into your dream home safely.” | **“We connect you with the landlord or authorised agent and coordinate your enquiries and viewing appointments. Your tenancy agreement is completed directly with the landlord, outside the platform.”** |
| 2 | `src/components/PropertyDetailView.tsx` (line 446, “Rent Safely & Directly Through Goodlucks”) | “All property enquiries, physical viewings, background checks, and tenancy contracts are handled strictly by Goodlucks Homes as your trusted intermediary.” | **“Goodlucks Homes facilitates property enquiries and viewing coordination between tenants, landlords and authorised agents. Any tenancy agreement is arranged directly between the tenant and landlord, outside the platform.”** |

Layout, styling, markup and surrounding content are untouched — only the sentence in each block changed.

Three further copy corrections were made under the Increment B rules (“do not claim background checks, ownership verification or regulated professional services”), each a single sentence/string:

- `src/components/LandlordDashboard.tsx` — the badge shown to **every** landlord, “Verified Landlord Partner”, is now “Landlord account”.
- `src/components/AboutView.tsx` FAQ 1 — removed “licensed”, “certified Goodlucks field agents” and “facilitate secure tenancy documentation”; it now describes review, viewing coordination and the fact that agreements happen off-platform.
- `src/components/AboutView.tsx` pillar — “100% Verified … document verification and physical inspection” is now “Listings reviewed”, stating explicitly that the review is **not** an ownership or identity check.

---

## 2. Increment B summary

| Area | What changed |
| --- | --- |
| **Viewing-fee ledger** | New additive tables `viewing_fee_records` and `fee_remittances`. Marking a viewing fee as paid creates a ledger row. Collected / owed / received / outstanding are four separate figures, never merged. |
| **Policy** | `fee_policies` table ships **empty**; `active_fee_policy()` returns `null`. The 60/40 and 70/30 splits live only as `PROPOSED_*` constants and are read by no calculation. `GET /admin/viewing-fees/policy` reports `status: "provisional"`, `appliedToCalculations: false`. |
| **Revenue analytics** | `physicalRevenueGhs` (100 % of recorded fees) is deleted. `/admin/stats` now returns `viewingFeesCollectedGhs`, `goodlucksShareDueGhs`, `goodlucksShareReceivedGhs`, `agentShareRetainedGhs`, `outstandingReceivablesGhs`, `viewingFeeRecordsWithoutShare`, `viewingFeeDisputedRecords`. |
| **Admin UI** | New `AdminFeeLedger` panel in the analytics tab: four totals, per-fee rows, “Agree share”, “Record remittance”, “Confirm”, “Dispute”, and a visible policy notice. |
| **Receipts** | Issuing stays disabled. The document no longer asserts that a landlord received money; it states the record is *reported, not verified*. New references use `REF-REC-…` instead of `VERIFIED-REC-…`; legacy ones are flagged. |
| **Receipt access** | Legacy rows are no longer attributable to a phone number shared by more than one account. Staff-created rows without a landlord link stay staff-only (documented safeguard, tested). |
| **Registration** | An unsupported role (e.g. `agent`) is refused with 422 instead of being silently coerced into a tenant. Registering no longer marks anyone verified. |
| **Listing verification** | Admin-created listings are no longer auto-verified; the public badge is relabelled so it no longer claims identity or ownership verification. |
| **Hardening** | `.htaccess` now denies `storage/`; five new admin actions are audited; a registration rate-limit knob was added (production default unchanged). |
| **Frontend typing** | `city?: string` added to both `register` signatures; new types for the ledger and policy. |

---

## 3. Viewing-fee accounting — the rules implemented

Implemented in `php-backend/lib/repository.php` (functions marked `Increment B`) and enforced again in the handlers.

1. **`fee_total_ghs`** — what the *agent* collected from the tenant on site. Creating this row never changes any revenue figure.
2. **`goodlucks_share_ghs`** — what Goodlucks is *owed*. `NULL` until an administrator records an explicit agreement (`share_basis = manual_agreement`, with `policy_snapshot_json` = basis, amount, who, when, `policyApplied: false`). It can never exceed the collected amount, and can never be lowered below what has already been remitted.
3. **`agent_share_ghs`** — `fee_total − goodlucks_share`; `NULL` while no share is agreed.
4. **Remittances** (`fee_remittances`) — money Goodlucks **actually received**. `Σ remittances` is the only viewing-fee figure reported as Goodlucks revenue. A remittance requires an agreed share, must be > 0, and cannot exceed the remaining balance.
5. **`outstanding` = share owed − remitted**, floored at 0; `NULL` (not 0) when no share has been agreed, because nothing is “owed” yet.
6. **States** — `reported` → `confirmed_by_staff` / `disputed` / `void`. Nothing is ever deleted: a mistake is voided, and a record with any remittance cannot be voided. A disputed record cannot be settled.
7. **No rewriting** — re-reporting a fee returns the existing row untouched; unticking “fee paid” on a viewing that already has a remittance is refused with **409**.
8. **Categories stay separate** — viewing fees, rental commissions and Goodlucks revenue are distinct lines; nothing here derives a commission from a viewing-fee percentage.

### Percentages: still provisional, still unapplied

`php-backend/config.php`:

```php
define('PROPOSED_FEE_POLICY_STATUS', 'provisional');
define('PROPOSED_STANDARD_AGENT_SHARE_PCT', 60.0);
define('PROPOSED_STANDARD_GOODLUCKS_SHARE_PCT', 40.0);
define('PROPOSED_VERIFIED_AGENT_SHARE_PCT', 70.0);
define('PROPOSED_VERIFIED_GOODLUCKS_SHARE_PCT', 30.0);
```

These constants are **not referenced by any calculation** (verified by grep and by a test that asserts a freshly reported fee keeps `goodlucksShareGhs: null` and `shareBasis: "not_set"`). Activation requires, in this order:

1. written approval of the percentages and of what “Standard” and “Professionally Verified” mean;
2. a reviewed `fee_policies` row with `status = 'approved'`, `approved_by`, `effective_from` (seeding is manual — `migrate.php` never inserts rows);
3. confirmation that a policy change can never rewrite history (already satisfied: each fee keeps its own snapshot);
4. explicit confirmation that a fee becomes revenue only on remittance (already implemented).

Until then, every fee records a **manually agreed** share, which is a documented agreement rather than an inferred policy.

---

## 4. Receipts — status and payment claims

- **Issuing remains disabled.** `RECEIPT_ISSUING_ENABLED` still defaults to `false` and was not flipped. `POST /api/receipts` remains admin-only and returns **503** while disabled; reads and printing still work.
- **No claim that Goodlucks received money.** The printed document states that Goodlucks did **not** receive the payment and that the document is not a receipt for money Goodlucks received.
- **No unverified claim that the landlord received money.** The old sentence “the landlord named above received the amount recorded here” is replaced by: *“Record status: reported, not verified… typed into the platform by [issuer] from information supplied to Goodlucks. Neither the tenant nor the landlord has confirmed it here, and Goodlucks has not verified that any money changed hands”*, followed by *“the payer reported paying the landlord named above”*.
- **Three states are now distinguishable in the API and the UI:** `reported` (everything currently stored), with `recipient.verified: false` and `goodlucksIsRecipient: false`; “verified” and “received by Goodlucks” **cannot** be produced by any endpoint in this release, so the UI never implies them.
- **Reference wording.** New rows are issued as `REF-REC-XXXXXX` (was `VERIFIED-REC-XXXXXX`). Historical codes are **not rewritten**; `legacyReference: true` is returned and the UI prints “Legacy reference from an earlier template. The ‘VERIFIED’ wording in it never meant the payment was checked.”
- **Recipient rule preserved.** A payment to a landlord is never presented as Goodlucks money, and this release produces no Goodlucks-branded money document for a rent payment at all.
- **Latent issues reviewed:**
  - `landlord_user_id` stays `NULL` for staff-issued rows — deliberate. Linking by typed name/phone would create exactly the incorrect association we are trying to prevent, so such rows are staff- and tenant-visible only; documented in code and covered by a test asserting a landlord cannot read an unlinked row even when the stored name matches.
  - Legacy phone matching is now **fail-closed on ambiguity**: if more than one account shares the phone key, the record is attributed to nobody (staff only). Covered by a test with two accounts sharing one number.

---

## 5. Registration, verification and security

| Change | Detail |
| --- | --- |
| Agent coercion removed | `role: "agent"` (or any unknown role) → **422** with a `role` field explaining that agent accounts do not exist yet. No account is created. |
| No false verification | `create_user()` no longer sets `is_verified = 1` for landlords; `public_user()` still exposes the raw flag but it means nothing, and registration tests assert `isVerified: false`. |
| No auto-verified listings | `handle_create_property()` no longer marks admin-created listings verified. The public badge now reads “Listing reviewed” / “Listing details reviewed by our team (not an ownership check)”. |
| Identity ≠ professional authorisation | No document upload, review or download route was created. `lib/private_storage.php` remains **unwired**, and this is stated rather than implied as secure. |
| Private storage hardening | `php-backend/.htaccess` now refuses `^(lib|logs|storage)/` outright (previously `storage/` was protected only by the directory's own `.htaccess`). |
| Auditing | `viewing_fee.reported`, `viewing_fee.share_agreed`, `viewing_fee.remittance_recorded`, `viewing_fee.state_changed`, `viewing_fee.voided` all write audit rows (actor, amounts, `policyApplied: false`, `receivedBy: goodlucks`); the admin ledger endpoints are admin-only (401 guest / 403 tenant or landlord / 404 unknown id). |
| City field | `city?: string` added to `register` in `apiService.ts` and `AppContext.tsx`; still optional, still stored on `users.address`, still never identity data. |
| Print fix | “Print / Export PDF” no longer prints a blank page: it switches to the tab that contains the document, waits for the render, and is disabled when there is nothing to print. |

**Distinct location concepts** (landlord residence, property location, agent residence, agent base, agent service areas) are still **not representable** — there is no agent account or agent profile in this increment, so nothing was invented for them. Documented in §8.

---

## 6. Migration and rollback

**Additive only. Three new tables, no changed columns, no dropped tables, no rewritten rows.**

| Driver | How to apply |
| --- | --- |
| MySQL | `php php-backend/migrate.php` (dry run, lists 3 `CREATE TABLE` steps) → then `php php-backend/migrate.php --apply`. `migrate.php` executes the `CREATE TABLE IF NOT EXISTS` definitions copied verbatim from `database.sql`, inside a transaction. Take a phpMyAdmin export first, as always. |
| SQLite (dev/tests) | A fresh database is created complete from `schema.sqlite.sql`. An existing dev database needs the three `CREATE TABLE` statements; the file is disposable. |
| Rollback | `DROP TABLE fee_remittances; DROP TABLE viewing_fee_records; DROP TABLE fee_policies;` — **only if no ledger rows exist** (otherwise export them first; dropping would destroy remittance history). No other table is touched, and `rent_receipts`/`tenancy_agreements` are untouched by this increment. |

New optional environment variable: `REGISTER_RATE_LIMIT_PER_HOUR` (default **10**, the previous hard-coded value). No behaviour change unless it is set.

---

## 7. Tests actually run

```
$ npm run test:api
# tests 102   # suites 24   # pass 102   # fail 0
# cancelled 0 # skipped 0

$ npm run lint      → tsc --noEmit, no output (exit 0)
$ npm run build     → vite build ✓ built in 3.58s; dist/server.cjs 3.9kb (exit 0)
$ php-wasm-cli -l   → no syntax errors in config.php, lib/api.php, lib/repository.php,
                      lib/audit.php, lib/mailer.php, migrate.php,
                      tests/create-receipt.php, tests/create-user.php
```

Real HTTP against the real PHP backend (SQLite driver). Suites added/changed in this increment:

| Suite | New/changed assertions |
| --- | --- |
| Viewing requests | The old “revenue +100” assertion is replaced: a reported fee raises `viewingFeesCollectedGhs` by 100 and leaves `goodlucksShareReceivedGhs` unchanged; `physicalRevenueGhs` no longer exists. |
| **Viewing-fee ledger (Increment B)** (new, 8 tests) | Reported fee creates a row with no share; policy is provisional with `appliedToCalculations: false` and no approved row; agreeing a share records what is owed but not received; only remittances count as received; over-remittance and remittance-without-share are refused; share > collected refused; disputed fees cannot be settled; a remitted fee cannot be voided or un-marked (409); admin-only access matrix; audit rows written. |
| **Registration: role handling, city and verification status** (new, 2 tests) | `role: "agent"` → 422 and no account created; city stored, optional, and `isVerified: false` for both tenant and landlord sign-ups. |
| **Receipt labelling and legacy attribution** (new, 5 tests) | Every stored record is `recordState: "reported"`, `recipient.verified: false`, `goodlucksIsRecipient: false`; new references match `/^REF-REC-/`; legacy `VERIFIED-REC-` rows are flagged; a shared phone number yields no attribution to either account; a matching landlord name grants nothing. |
| Landlord verification, receipts, audit, uploads | Unchanged and still green. |

**Not run — no environment for it:**

- **No browser-driven end-to-end test** (no headless browser in this sandbox). The admin ledger panel, the receipt wording and the print fix are verified by TypeScript compilation, the production build, and the API contracts only — not by clicking through a real browser.
- **No MySQL execution.** No MySQL client/server here, so the three `CREATE TABLE` statements and `migrate.php --apply` are **unverified against MySQL**; they were designed to the same conventions as the existing tables (nullable, `IF NOT EXISTS`, no driver-specific functions), but that is a design argument, not a test result.
- **`tsc` does not type-check React component props or the context**: `@types/react` is not installed (`react@19` ships no types), so `useApp()` is effectively `any`. `npm run lint` therefore catches plain TS errors, not JSX/context misuse. This is pre-existing and is why the build — which does resolve every import and export — is the stronger signal here.

---

## 8. Remaining risks and unfinished work

1. **Fee ledger is not wired to real agents.** `agent_user_id` is reserved and always `NULL`; `agent_name` is free text from the viewing. Assignment, agent self-reporting and tenant confirmation arrive with agent accounts (Increment C) and the viewing lifecycle (Increment F).
2. **No approved policy, therefore no automatic share.** By design each fee needs an administrator to agree an amount. If the owner approves 60/40 and 70/30, Increment E must add policy rows, tiers, snapshots and a migration path for existing rows.
3. **Ledger scale.** `viewing_fee_summary()` loads up to 5,000 records and issues one remittance query per record. Fine at current volume, needs aggregation SQL before it grows.
4. **Receipt issuing still disabled**, and the legacy `POST /api/receipts` handler is still present behind the flag. It must not be enabled: it still cannot distinguish reported/verified/received, and it writes no remittance.
5. **Staff-issued receipts are invisible to the landlord concerned** (`landlord_user_id` deliberately `NULL`). This is a safety trade-off, not an oversight; a future increment must add a confirmed recipient link, not a name match.
6. **Legacy receipts with a shared phone number are now unattributable** to the tenant. Staff can still see them; the tenant must contact support. This is deliberate fail-closed behaviour.
7. **`is_verified` / `is_landlord_verified` remain evidence-free flags.** Present in the schema and still settable by staff toggles; real identity, authorisation and ownership checks do not exist. Existing rows are **not** rewritten — historical flags keep their old (unevidenced) values, and the UI no longer describes them as identity verification.
8. **Private document storage still unwired** — helpers and a directory exist and are unused; there is no upload, review, download, retention or encryption, and no least-privilege reviewer role. `.htaccess` now blocks the path, which is defence in depth, not a working document feature.
9. **No agent concept at all yet**: no agent role, no agent profile, no distinction between agent residence, agent base and service areas, and no way to submit a listing on a landlord's behalf (`landlord_name` is still the creating user).
10. **Marketing copy still contains “verified listings” claims** (Home, Browse, Find a Home, About, Get Notified). Listing review does exist, so these are defensible but broad; a full copy review is an owner/legal decision, not something to change unilaterally.
11. **`REGISTER_RATE_LIMIT_PER_HOUR`** is now configurable; a misconfiguration could weaken signup protection.
12. **No receipts for commissions**: rental commissions remain unmodelled (Increment G).

---

## 9. Questions needing Ghanaian legal / accounting review

Framed as questions — no requirements were invented, and nothing was implemented on the assumption of an answer.

1. **Licensing.** Does Goodlucks, or its field agents, require a licence under the Real Estate Agency Act 2020 (Act 1047)? Does a “professionally verified agent” tier imply licensing, and can the word “verified” appear next to an agent without implying a licence?
2. **Fee sharing.** Is collecting a viewing fee from a tenant and splitting it with an agent lawful, and must the split be disclosed to the tenant?
3. **Receipting and tax.** Who must issue the receipt for a viewing fee — the agent who took the cash, or Goodlucks? How should Goodlucks' share be documented (invoice? commission note?) for VAT/levies and income tax? Does a remittance record need to be a formal tax document?
4. **Employment status.** Are field agents employees, commission agents or independent contractors? Does a percentage share create an employment relationship?
5. **Holding money.** Should Goodlucks ever hold tenant money, or must the fee always go straight to the agent (the current workflow)? What happens when an agent collects and never remits?
6. **Identity data.** Under the Data Protection Act 2012 (Act 843): what is the lawful basis for holding Ghana Card copies, how long may they be retained, and what must the privacy notice say? (Nothing is collected today.)
7. **Rent advances and commissions.** Are there limits on the rental commission Goodlucks may take, and how do they interact with existing rent-advance rules?
8. **“Verified” wording.** Could “listing reviewed” or “verified agent” badge wording create a misrepresentation risk if a dispute arises?

---

## 10. Changed and created files

**Modified (Increment B; Increment A files also listed as still modified):**

```
README.md
php-backend/.htaccess                 storage/ now denied outright
php-backend/config.php                provisional policy constants, register rate-limit knob
php-backend/database.sql              3 additive tables (+ Increment A comment)
php-backend/schema.sqlite.sql         3 additive tables (+ Increment A comment)
php-backend/migrate.php               the 3 tables added to the required list
php-backend/lib/api.php               ledger routes/handlers, role refusal, fee hook, audit
php-backend/lib/repository.php        ledger functions, analytics, receipts shape/ref, phone guard, no auto-verify
src/types.ts                          ledger/policy/receipt types; revenue fields replaced
src/services/apiService.ts            5 fee endpoints, city typing
src/context/AppContext.tsx            empty-stats fields, city typing
src/components/AdminDashboard.tsx     truthful fee card, ledger panel, viewings label
src/components/AdminFeeLedger.tsx     NEW (see below)
src/components/ReceiptsView.tsx       reported-not-verified wording, legacy reference note, print fix
src/components/HomeView.tsx           Part 1 correction 1
src/components/PropertyDetailView.tsx Part 1 correction 2 + badge wording
src/components/PropertyCard.tsx       badge wording
src/components/LandlordDashboard.tsx  badge wording
src/components/AboutView.tsx          licensing/certification claims removed
tests/api.test.mjs                    3 new suites, 1 updated, helper reuse
tests/create-receipt.php              --legacy / --legacy-reference support
```

**Created in this increment:**

```
src/components/AdminFeeLedger.tsx
docs/INCREMENT_B_REPORT.md            (this file)
```

**Created earlier, still untracked:** `docs/BUSINESS_MODEL_ASSESSMENT.md`, `docs/INCREMENT_A_REPORT.md`, `src/components/ReceiptsView.tsx`.

**Deleted earlier (Increment A):** `src/components/TenancyAgreementView.tsx`.

---

## 11. Boundaries respected

- **No commit and no push.** HEAD is still `43b410f`; everything above is in the working tree on `arena/a67485fb-goodlucks-rep`.
- **No deployment.**
- **No production database access, migration or data change.** Only local SQLite files created by the test harness and the dev server were used.
- **No agreement functionality reintroduced** — all five agreement endpoints remain 404.
- **Receipt issuing not re-enabled.**
- **No fake records, verification statuses or payment confirmations** were created; the ledger starts empty and only ever contains what an administrator explicitly records.
- **No historical financial row was deleted or rewritten** (receipts keep their stored values, including legacy references; ledger rows are voided, never removed).
