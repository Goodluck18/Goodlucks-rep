# Increment A — retire tenancy-agreement functionality

**Status:** implemented on branch `arena/a67485fb-goodlucks-rep`, working tree only.
**No commit, no push, no deployment.** HEAD is `43b410f` plus uncommitted Increment A changes.

---

## 0. Workflow note (read first)

While working, the sandbox's local git state was restored to `cbd5ced` and the local objects for
`bb36206` / `43b410f` disappeared; the remote still had them. The working tree (Increment 0 + Increment A)
was intact. I fetched `origin/arena/a67485fb-goodlucks-rep` and moved the local branch pointer back with
`git reset --mixed 43b410f`, which changes the index/HEAD only and never touches working-tree files
(a tar backup of the tree was taken first at `/tmp/worktree-backup.tgz`).

Result: HEAD is `43b410f`, and `git status` now shows **only** the Increment A changes. Nothing was lost,
no commit was created, nothing was pushed. Increment 0 remains exactly as previously reported.

---

## 1. Summary of changes

1. **The tenancy-agreement feature is gone from the product.** All five agreement API routes and their
   handlers were deleted, and the 1,334-line agreement/receipt component was replaced by a receipts-only
   view. There is no create, sign, email, print or "vault" path for agreements anywhere in the UI.
2. **Receipts survived the split** — records can still be listed, opened and printed, and access stays
   scoped to the tenant, the landlord on the record, and staff.
3. **Unsafe receipt issuing is switched off** server-side (`RECEIPT_ISSUING_ENABLED`, default `false`;
   `POST /api/receipts` returns 503) and restricted to staff when it is ever turned back on. Landlords can
   no longer issue Goodlucks-branded records at all.
4. **The printed record no longer claims Goodlucks received money.** The false "PAID / GOODLUCKS VERIFIED"
   stamp, "Verified Goodlucks Homes Intermediary Stamp" and "Authorized Finance Officer" sign-off were
   removed, and the document now states who actually received the money and that Goodlucks did not.
5. **Tenant registration stays simple** — no identity documents — and gained one optional field, city/town.
6. **Agreement promotional copy removed/rewritten** on the home, about and list-property pages and in the
   README; the dashboard income card no longer calls agent-collected fees "revenue".

What this increment did **not** do: no new financial model, no agent role, no verification workflow, no
schema changes, no data deletion, no deployment.

---

## 2. Files changed and why

### Backend

| File | Change |
| --- | --- |
| `php-backend/lib/api.php` | Removed the five agreement routes and the five agreement handlers. Receipt handlers kept; `handle_list_receipts()` now returns `issuingEnabled`; `handle_create_receipt()` requires `admin` and returns **503** while issuing is disabled. Registration accepts an optional `city` (stored on the existing `users.address`). Stale comments updated. |
| `php-backend/lib/repository.php` | Removed ten agreement-only functions (`create_agreement`, `sign_agreement_by_id`, `list_agreements`, `find_agreement`, `shape_agreement`, `user_is_agreement_landlord/_tenant`, `user_can_read_agreement`, `user_can_sign_agreement`, `owned_property_ids`). **Fixed a real access bug** in `user_can_read_receipt()` (see §4). `mask_identity_number()` kept, documented, for the future identity work. |
| `php-backend/config.php` | New `RECEIPT_ISSUING_ENABLED` flag (default **false**). |
| `php-backend/lib/audit.php`, `php-backend/lib/mailer.php` | Comment/docblock references to agreements removed. No behaviour change. |
| `php-backend/database.sql`, `php-backend/schema.sqlite.sql` | Comment above `tenancy_agreements` marking it retired. **No DDL change**; the table definition is kept. |

### Frontend

| File | Change |
| --- | --- |
| `src/components/TenancyAgreementView.tsx` | **Deleted** (agreement generator + mixed vault). |
| `src/components/ReceiptsView.tsx` | **New** — receipts only: record form (disabled while issuing is off), printable record, saved-records list. Truthful recipient statement. |
| `src/App.tsx` | Agreement routes removed; `receipts` → `ReceiptsView`. |
| `src/components/Navbar.tsx` | Three "Agreements & Receipts" nav entries → "Receipts". |
| `src/components/TenantDashboard.tsx`, `LandlordDashboard.tsx`, `AdminDashboard.tsx` | Buttons relabelled to payment records; admin income card relabelled ("Viewing Fees Recorded On Site", with a note that it is agent-collected, not Goodlucks revenue). |
| `src/context/AppContext.tsx` | Agreement state, loaders and actions removed; `receiptIssuingEnabled` exposed to the UI. |
| `src/services/apiService.ts` | Five agreement methods removed; `listReceipts()` returns `issuingEnabled`. |
| `src/types.ts` | `TenancyAgreement` interface removed. |
| `src/components/AuthModal.tsx` | Optional "City / Town" field at registration → `city` in the payload. |
| `src/components/HomeView.tsx`, `AboutView.tsx`, `ListPropertyView.tsx` | Agreement/service claims rewritten to match the intermediary model. |

### Tests, docs

| File | Change |
| --- | --- |
| `tests/api.test.mjs` | Two agreement suites replaced by a retirement suite and a receipt-access suite (details in §5). |
| `tests/create-receipt.php` | **New** helper that inserts a payment record directly, so scoping can be tested while HTTP issuing is disabled. |
| `README.md` | Product description and endpoint list corrected. |
| `docs/INCREMENT_A_REPORT.md` | This report. |

---

## 3. Agreement routes, screens and operations removed

| Removed | Was |
| --- | --- |
| `GET /api/agreements` | list agreements |
| `POST /api/agreements` | create/generate an agreement |
| `GET /api/agreements/{id}` | single agreement (identity fields revealed) |
| `POST /api/agreements/{id}/sign` | e-signature as landlord/tenant |
| `POST /api/agreements/{id}/email` | email the agreement |
| `/agreements`, `/agreement-generator` views | agreement generator tab, agreement vault |
| Nav entries (desktop, tablet, mobile) | "Agreements & Receipts" |
| Dashboard actions | tenant "My Agreements & Receipts", landlord "Agreements & Receipts", admin vault button |
| Agreement actions in `AppContext` | `createAgreement`, `signAgreement` |
| Agreement API client methods | `listAgreements`, `getAgreement`, `createAgreement`, `signAgreement`, `emailAgreement` |
| Agreement type/state | `TenancyAgreement`, agreement list state, agreement preview + staff hydration effect |

All five routes now return the router's standard **404**. Verified live:

```
GET  /api/agreements            → 404
POST /api/agreements            → 404
POST /api/agreements/x/sign     → 404
POST /api/agreements/x/email    → 404
GET  /api/agreements/x          → 404
```

**Not removed (deliberately):** the `tenancy_agreements` table and its columns (schema files + `migrate.php`
entries), the `audit_logs` table, `lib/audit.php`, `lib/private_storage.php`, the `/receipts` endpoints and the
scoped-read rules. None of these are agreement-specific except the table, which is left in place so that no
destructive migration is required.

---

## 4. Receipts preserved; unsafe issuing restricted

**Preserved:** list, single read (scoped), print/PDF, saved-records search, record references, staff
visibility, tenant/landlord visibility of their own records.

**Restricted:**
- `POST /api/receipts` is now **admin-only** (landlords previously could issue Goodlucks-branded receipts for
  any tenant and amount — that path is closed).
- Issuing is **disabled by default** (`RECEIPT_ISSUING_ENABLED=false`). Staff get `503` with an explicit
  message; the UI disables the submit button and explains why. Reads and printing of existing records still
  work.
- The **misleading document** was corrected in the parts that are still reachable:
  - removed the "PAID / GOODLUCKS VERIFIED" stamp, "Verified Goodlucks Homes Intermediary Stamp",
    "Authorized Finance Officer" label and "TOTAL PAID" wording;
  - "RECEIVED FROM (TENANT)" → "PAID BY (TENANT)", "ISSUED ON BEHALF OF (LANDLORD)" → "PAID TO (LANDLORD)";
  - the masthead no longer claims the company received anything; a prominent box states that the landlord
    received the money, that Goodlucks acted as intermediary, and that the document is a payment record, not
    a Goodlucks receipt;
  - the saved-records badge changed from "PAID & VERIFIED" to "RECORDED".

**Bug found and fixed while doing this:** `user_can_read_receipt()` returned `false` for a landlord whenever
a tenant was also linked to the record (it returned early on the tenant link), so `GET /receipts/{id}` 404'd
for the landlord it concerned. It now checks both party links, refuses weaker fallbacks for linked records,
and never matches legacy records by name. The new receipt-access test caught this; it is covered now.

**Not fixed here (Increment B):** the record model still has no payer/recipient distinction, no
"reported vs confirmed vs received" state, and `physicalRevenueGhs` still computes 100% of recorded viewing
fees. Only the label was corrected.

---

## 5. Tests run and actual results

```
$ npm run test:api
# tests 87
# suites 21
# pass 87
# fail 0
# cancelled 0
# skipped 0
# duration_ms 44377

$ npm run lint      → tsc --noEmit, no output (clean)
$ npm run build     → vite build ✓ built in 3.45s; dist/server.cjs 3.9kb
```

Suite changes (93 → 87 tests, suites unchanged at 21):

| Removed | Replaced by |
| --- | --- |
| "agreement is created with a verification code and can be signed" | "every tenancy-agreement endpoint has been removed" (5 assertions, all 404) |
| "an agreement copy can be emailed" | "receipt issuing is disabled and limited to staff" (401 guest / 403 tenant / 403 landlord / 503 admin / `issuingEnabled:false`) |
| "agreement list is scoped", "identity numbers masked", "single agreement read", "only a party can sign", "agreement emails limited", "landlord cannot attach another landlord's property" | removed with the feature |
| — | "receipt lists are scoped to the people concerned" |
| — | "a single receipt is only readable by its parties and staff" (party 200, landlord 200, strangers 404, guest 401, unknown 404) |
| — | "the audit trail is admin-only and carries no identity numbers" |
| — | "private documents are not reachable through the public uploads route" (kept) |

Live smoke test on the local dev server (`npm run dev`, SQLite, demo seeds):

```
GET  /api/health                    → 200 {"status":"ok","database_connected":true,"properties_count":4}
GET  /api/agreements                → 404
GET  /api/receipts (guest)          → 401
GET  /api/receipts (admin)          → 200 {"receipts":[],"issuingEnabled":false}
POST /api/receipts (admin)          → 503 "Receipt issuing is disabled while the payment-record model is corrected."
GET  / (web)                        → 200
POST /api/auth/register (+city)     → 201, user.address = "Tema, Community 25"
POST /api/auth/register (no city)   → 201, user.address = ""
```

No browser-driven end-to-end run was performed (no headless browser in this environment); UI verification is
limited to TypeScript compilation, the production build and the API contracts above.

---

## 6. Database and migration effects

**None.** Increment A changes no table, column, index or row.

- `tenancy_agreements` remains exactly as shipped (columns, indexes, `landlord_user_id`/`tenant_user_id`),
  with a comment marking it retired. Nothing writes to it; nothing reads it.
- `rent_receipts` is unchanged; only the code path that creates rows is gated.
- `audit_logs` unchanged.
- `migrate.php` is unchanged — it still lists `tenancy_agreements` and `audit_logs` as required, so a
  deployment performs exactly what it performed before. **No new migration is required for Increment A.**
- Re-enabling receipt issuing later is a configuration change (`RECEIPT_ISSUING_ENABLED=true`), not a
  migration. Doing that before Increment B would restore a misleading document and is not recommended.

**Rollback:** revert the deploy (or `git checkout .` on this branch). No data to restore, because nothing was
deleted or rewritten.

---

## 7. Existing records, sample data and seed data discovered

| Checked | Result |
| --- | --- |
| Local SQLite databases in the workspace | none present (`.data/`, `local-dev.sqlite` absent) |
| `php-backend/schema.sqlite.sql` seed rows | 4 demo **users** and 4 demo **properties** only |
| `INSERT INTO tenancy_agreements` / `rent_receipts` anywhere in the repo | none |
| `dev_accounts.php` | only sets passwords on the seeded demo accounts |
| Agreement or receipt rows in any checked environment | **none** |

So there were no agreement or receipt records of any kind to inspect, migrate or clean up. No cleanup
decision is needed; if the live database turns out to contain rows (I cannot see it), they remain untouched
and are now unreachable by the application.

---

## 8. Remaining security issues (not fixed in Increment A)

1. **Private document storage is still not wired.** No upload route, no review screen, no download route,
   no ownership rule, no retention. The helpers and directory exist and are unused.
2. **`php-backend/.htaccess` does not deny `storage/`.** The private directory relies solely on its own
   `.htaccess`, which depends on `AllowOverride` on the host. One-word hardening for a later increment.
3. **No least-privilege for identity data** — a single `admin` role; the planned reviewer role does not exist.
4. **No encryption at rest** for any field, and no key management.
5. **`physicalRevenueGhs` is still wrong arithmetically** (100% of recorded fees); only the label changed.
6. **`users.is_verified` is auto-set to 1 for landlords** at registration and exposed as `isVerified`; it
   still means nothing.
7. **`properties.is_landlord_verified`** is still an evidence-free admin badge, auto-set for admin-created
   listings.
8. **Audit trail** has no retention/rotation and no admin UI (API only).
9. **Agents still cannot be represented** (`assigned_agent` remains free text), so authority to market a
   property cannot be checked.
10. **Legacy `POST /api/receipts` code remains behind the flag**; it must not be re-enabled before
    Increment B replaces both the template and the accounting.

---

## 9. Proposed Increment B — truthful receipts, transaction records, accurate revenue

**Goal:** Goodlucks records money accurately and only ever issues a receipt for money it actually received.

### B.1 Data model (additive only)

`transaction_records`

| Column | Purpose |
| --- | --- |
| `id`, `reference` | primary key + human reference |
| `category` | `viewing_fee_agent_collected`, `viewing_fee_agent_share_due`, `viewing_fee_remitted_to_goodlucks`, `rent_paid_to_landlord`, `rental_commission_due`, `rental_commission_received`, `other_received_by_goodlucks` |
| `payer_type` / `payer_user_id` / `payer_name` | tenant, agent, landlord |
| `recipient_type` / `recipient_user_id` / `recipient_name` | who actually got the money |
| `amount_ghs`, `currency`, `paid_at` | amount and date |
| `property_id`, `viewing_id`, `agent_id` | links where they exist (nullable) |
| `state` | `reported`, `tenant_confirmed`, `disputed`, `received_by_goodlucks`, `reconciled`, `void` |
| `rate_snapshot_json`, `share_ghs` | frozen split at the time of the transaction |
| `reported_by`, `reported_at`, `confirmed_by`, `confirmed_at`, `notes` | provenance |
| `legacy_receipt_id` | back-link for any historical `rent_receipts` row |

`rent_receipts` stays as-is for history; it is **not** deleted.

### B.2 Receipts

- A **Goodlucks receipt** may only be issued for `viewing_fee_remitted_to_goodlucks`,
  `rental_commission_received` and `other_received_by_goodlucks`; it names Goodlucks as recipient.
- A rent payment to a landlord produces a **transaction record / payment report**, never a Goodlucks
  receipt. If a landlord confirmation is printed it is headed "Landlord payment confirmation", names the
  landlord as recipient, and carries no Goodlucks "verified/paid" seal.
- Every printed document states payer, recipient, amount, date, purpose and reference.

### B.3 Revenue reporting

- Replace `physicalRevenueGhs` with three figures: **fees recorded** (agent-collected), **Goodlucks share
  due**, **Goodlucks share received**; keep the field name only if a compatibility alias is needed.
- No fee is counted as Goodlucks revenue until a remittance is recorded.
- Rental commissions are a separate line and never derived from viewing-fee percentages.

### B.4 Acceptance criteria

1. A rent payment recorded as paid to a landlord cannot produce a Goodlucks-branded receipt (API + UI).
2. A Goodlucks receipt cannot be created without a recorded receipt of funds by Goodlucks.
3. Dashboard totals = recorded / due / received, all reconciling to `transaction_records`.
4. Each record keeps the rate snapshot; changing a policy never alters a past record.
5. Confirmation and dispute flows write audit rows; a disputed record cannot be marked reconciled.
6. Legacy `rent_receipts` rows render with a clear "legacy record" notice.
7. MySQL + SQLite schemas and `migrate.php` updated together; migration is additive and reversible.
8. Tests: issuing rules, recipient correctness, totals arithmetic, permission matrix, audit trail.

### B.5 Risks / dependencies

- Wording of any financial document needs your sign-off (legal/tax, §H of the assessment).
- `migrate.php` cannot seed rows; a reviewed seeding script is needed for default policy rows.
- Historical receipts stay misleading unless annotated on render — decided in B.

---

## 10. Proposed later sequence (not started)

| Increment | Scope | Key dependencies |
| --- | --- | --- |
| **C — Agent account (Stage A)** | `agent` role, agent registration (name, email, phone, password, agency name), `agent_profiles`, default **no** operational permissions, admin agent list | Increment B's permission vocabulary; role/registration copy |
| **D — Verification & authorisation** | separate identity / professional-authorisation / internal-approval statuses; private upload + reviewer-only download (wire `private_storage`); audit on every access; retention; least-privilege reviewer role | Legal sign-off on Ghana Card handling, retention period and reviewer access |
| **E — Viewing-fee policy** | administrator-configurable fee + tier shares (60/40, 70/30 provisional), per-transaction snapshots, no self-assignment, `VIEWING_FEE_GHS` retired from the six call sites into one settings source | Approved rates from you; seeding script |
| **F — Agent-led viewing lifecycle** | assignment to real agent users, agent confirmation, Goodlucks confirmation, fee reporting, tenant confirm/dispute, receivable, remittance, reconciliation, event history | C, D, E, B |
| **G — Rental commissions** | commission terms and records, separate from viewing fees | Legal review of commission arrangements |

Landlord work (optional registration, landlord residence vs property location, agent-submitted listings
with documented authority) spans C–D and should be planned together with them; the specific changes needed
are listed in `docs/BUSINESS_MODEL_ASSESSMENT.md` §C–D.

---

*No deployment, commit or push was performed. Awaiting review before Increment B.*
