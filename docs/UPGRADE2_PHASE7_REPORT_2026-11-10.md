# Upgrade 2 — Phase 7 report (tenant rent receipts removed, E1)

**Date:** 2026-11-10
**Branch:** `arena/1dbf260c-goodlucks-rep`
**Base commit:** `61736ac` (Phase 7, first pass — tenant-facing restriction only)
**Scope:** E1 — remove the rent-receipt feature while preserving `rent_receipts` data, `fee_remittances`, the fee policies
built on them, and the fee-ledger reversal workflow.

Nothing was deployed. No production database was touched. No row was deleted, rewritten or migrated.

---

## 0. Why this report replaces the first Phase 7 pass

The first Phase 7 commit (`61736ac`) read E1 as "tenants lose access": tenants got `403`, `/receipts` redirected them to
their dashboard, and the landlord's `ReceiptsView` stayed. Re-reading the Phase 0 audit (§5.10 and requirement row E1)
shows the requirement is the whole feature, not one audience:

> "Remove the tenant rent-receipt feature: delete the `/receipts` routes and handlers, `ReceiptsView`, its nav entries,
> its routes, its `AppContext` state and callbacks, its `apiService` methods, its `types.RentReceipt`, and the
> `tests/create-receipt.php` receipt-POST fixture. **Keep** the `rent_receipts` table and its rows, and keep
> `POST /api/admin/finance/receipts/:id/reverse`."

Every one of those items is now done. The preserved-data promise is unchanged and is still proved by tests.

---

## 1. What was required, and what was delivered

### What was removed

| Surface | Before | Now |
| --- | --- | --- |
| `GET /api/receipts` | listed receipts for admin, the linked landlord and the linked tenant | route deleted — `404` for every role |
| `GET /api/receipts/:id` | single record, with a legacy phone-number fallback | route deleted — `404` for every role |
| `POST /api/receipts` | admin-only issuing, behind `RECEIPT_ISSUING_ENABLED` (`503` when off) | route deleted — `404` for every role |
| `php-backend/lib/repository.php` | `create_receipt`, `find_receipt`, `list_receipts`, `shape_receipt`, `user_can_read_receipt`, `phone_shared_by_multiple_accounts` | all six functions deleted (−194 lines) |
| `php-backend/config.php` | `RECEIPT_ISSUING_ENABLED` switch | deleted — there is no issuing path left to switch |
| `src/components/ReceiptsView.tsx` | 772-line screen, used by `/receipts` and `/landlord/receipts` | file deleted |
| `src/routing/routes.ts` | `/receipts` and `/landlord/receipts` routes | both removed; the paths now resolve to the normal not-found screen |
| `src/navigation/navModel.ts` | `receipts` entries in the tenant and landlord menus | removed |
| `src/components/dashboard/DashboardShell.tsx` | tenant "Payment records" section link | removed |
| `src/components/AdminDashboard.tsx` | "Payment Records" action button | removed |
| `src/components/LandlordDashboard.tsx` | `receipts` section, its route and its quick link | removed |
| `src/context/AppContext.tsx` | `receipts`, `receiptIssuingEnabled`, `createReceipt`, and their dependencies in the provider value | removed |
| `src/services/apiService.ts` | `listReceipts`, `getReceipt`, `createReceipt` | removed |
| `src/types.ts` | `RentReceipt` | removed |
| `tests/*` | receipt assertions across the API, access-control, routing and navigation suites | rewritten to the removal contract |

The **fee-ledger** reversal call in `apiService.ts` (`reverseReceipt`, `POST /api/admin/finance/receipts/:id/reverse`) is
a different system, is what E1 tells us to keep, and was left untouched.

### What was preserved

* **`rent_receipts` table and every row.** No migration was added in Phase 7 at all, so nothing could drop the table or
  rewrite it. `migrate.php` contains no `DROP TABLE` and no `DELETE FROM rent_receipts` (asserted in the new suite).
* **`fee_remittances`, `remittance_allocations`, `remittance_submissions`, `fee_policies`** — untouched, and the finance
  endpoints still answer `200` for an administrator holding the finance-view capability.
* **`POST /api/admin/finance/receipts/:id/reverse`** — still routed. It is refused only for a record that does not exist,
  and the refusal comes from the handler ("That receipt does not exist."), not from the router.
* **`AdminFeeLedger.tsx`** — the platform's fee ledger (viewing fees, commissions, remittances) is a separate feature and
  is unchanged. Its footnote already told staff that nothing on that screen is a Goodlucks receipt.
* **Historical rows remain queryable by staff**, through the database and the fee-ledger screens, which is what an audit
  trail needs. No UI reads `rent_receipts` any more, so the data is inert but intact.

### One deliberate deviation

E1 says "delete `tests/create-receipt.php`". It was **rewritten** instead, as a fixture that inserts a row with direct
SQL (the receipt-creation code it used to call no longer exists). The new suite needs a way to plant a historical record
in order to prove it survives, and hand-writing SQL in the test file would be less readable than one fixture. The file is
a fixture, never product code. This is recorded here rather than quietly done.

---

## 2. Files changed

| File | Change |
| --- | --- |
| `php-backend/lib/api.php` | receipt handlers and their three routes removed; a comment records why the rows stay (−120 lines) |
| `php-backend/lib/repository.php` | six receipt functions removed (−194 lines) |
| `php-backend/config.php` | `RECEIPT_ISSUING_ENABLED` removed |
| `src/components/ReceiptsView.tsx` | **deleted** |
| `src/App.tsx` | view import and render branch removed |
| `src/routing/routes.ts` | both receipt routes removed |
| `src/navigation/navModel.ts` | receipt menu entries removed |
| `src/components/dashboard/DashboardShell.tsx` | tenant receipt section removed |
| `src/components/AdminDashboard.tsx` | "Payment Records" button removed |
| `src/components/LandlordDashboard.tsx` | receipts section, route, quick link removed |
| `src/context/AppContext.tsx` | receipt state, callback and effect removed |
| `src/services/apiService.ts` | three receipt methods removed |
| `src/types.ts` | `RentReceipt` removed |
| `tests/tenant-receipts-removed-phase7.test.mjs` | rewritten: 9 tests covering endpoints, preserved rows, fee ledger, and the absence of the feature in source |
| `tests/create-receipt.php` | rewritten as a direct-SQL fixture that plants one historical row |
| `tests/api.test.mjs` | receipt suites rewritten; planted-row survival test; 503 assertions became 404 |
| `tests/access-control.test.mjs` | receipt describe rewritten for all five roles + row survival |
| `tests/routing.test.mts` | receipt route rows removed; both paths asserted to be unknown for every role |
| `tests/app-navigation.test.mts` | receipt tests removed; "gone for every role" and "no tenant receipt action" added |

---

## 3. Test results (all executed on this branch, at this commit)

| Suite | Result |
| --- | --- |
| `tests/tenant-receipts-removed-phase7.test.mjs` | **9 / 9** |
| `tests/api.test.mjs` — suites 1–29 | **185 / 185** |
| `tests/api.test.mjs` — suite 30 (finance reversals and concurrency) | **14 / 14** |
| `tests/access-control.test.mjs` | 11 / 11 |
| `tests/routing.test.mts` | 50 / 50 |
| `tests/app-navigation.test.mts` | 59 / 59 |
| `tests/task03.test.mjs` | 50 / 50 |
| `tests/account-settings.test.mjs` | 7 / 7 |
| `tests/tenant-contact.test.mjs` | 10 / 10 |
| `tests/admin-console-api.test.mjs` | 9 / 9 |
| `tests/admin-console.test.mts` | 16 / 16 |
| `tests/user-management.test.mjs` | 15 / 15 |
| `tests/bulk-email.test.mjs` | 14 / 14 |
| `tests/primary-admin.test.mjs` | 16 / 16 |
| `tests/migration.test.mjs` | 14 / 14 |
| `tests/concurrency.test.mjs` | 6 / 6 |
| `tests/fee-policies-phase4.test.mjs` | 12 / 12 |
| `tests/tenant-experience.test.mjs` | 11 / 11 |
| `tests/provider-experience-phase6.test.mjs` | 22 / 22 (Phase 6, re-checked after these changes) |
| `tests/blog.test.mjs` | 45 / 45 |
| `tests/sharing.test.mts` | 36 / 36 |
| `tests/uploads.test.mts` | 20 / 20 |
| `tests/responsive.test.mts` | 18 / 18 |
| `tests/property-seo.test.mts` | 23 / 23 |
| `tests/blog-html.test.mts` | 16 / 16 |
| `tests/design-tokens.test.mjs` | 14 / 14 |
| `tests/content.test.mjs` | 4 / 4 |
| `tests/email-footer.test.mjs` | 3 / 3 |
| `tests/admin-console-phase3.test.mts` | 11 / 11 |
| `tests/admin-console-phase4.test.mts` | 12 / 12 |
| `tests/admin-console-phase5.test.mts` | 19 / 19 |
| **Total** | **751 / 751, 0 failures** |

Seed check: 9 + 185 + 14 + 11 + 50 + 59 + 50 + 7 + 10 + 9 + 16 + 15 + 14 + 16 + 14 + 6 + 12 + 11 + 22 + 45 + 36 + 20 +
18 + 23 + 16 + 14 + 4 + 3 + 11 + 12 + 19 = **751**.

The total fell from 754 because the receipt feature's own tests were deleted along with it, not because coverage was
dropped: the four suites that describe removal are the new suite plus rewritten API, access-control, routing and
navigation cases.

Other gates: `tsc --noEmit` clean; `npm run build` ✓ (4.88 s); `php-wasm-cli -l` clean on **all 67** PHP files in
`php-backend/` and `tests/`.

The single-process php-wasm ceiling documented in Phases 5 and 6 applies unchanged: running every `api.test.mjs` suite in
one process eventually wedges, so suite 30 is run in its own process, which is how it is reported above.

---

## 4. Privacy and data-integrity review

* The receipt endpoints no longer exist, so no request shape can reach receipt data — the strongest possible form of the
  "tenants must not read receipts" rule. All four roles plus a guest were asserted to get `404`.
* A removed endpoint is indistinguishable from any unknown endpoint (asserted by comparing the response with a
  deliberately non-existent route), so the removal leaks nothing about what used to exist.
* No row was deleted and no migration was added; `rent_receipts`, `fee_remittances`, `fee_policies` and
  `rental_commissions` are all still present in the schema (asserted against the live SQLite database).
* A planted receipt row keeps its amount, tenant name and `landlord_user_id` link after the feature is gone (asserted).
* The fee ledger, its reversal route, the remittance workflow and the fee-policy workflow still answer.
* Nothing in Phase 5 (tenant contact disclosure) or Phase 6 (provider experience) was touched, and both suites still pass.

---

## 5. Outstanding items / known limitations

1. **Historical receipts have no screen.** That is the point of the removal, but it means a staff member who wants to see
   an old record must query the database. If the business later wants that history visible, the honest way is a
   read-only export report under the fee ledger — a new requirement, not something this phase should have improvised.
2. **`find_user_by_phone()` is now unused.** It is a generic lookup helper that the receipt code was the only caller of.
   It was left in place: it is harmless, and deleting general helpers is not part of E1.
3. **`rent_receipts` is required by `migrate.php:226`** (the migration that adds a column to it), so the table cannot be
   dropped even if the data were ever archived.
4. **No browser** was available here. The UI removal is covered by rendering tests (`app-navigation`, 59 tests that mount
   the app and assert menus and sections per role), the routing suite (both paths are unknown for all roles), `tsc` and a
   production build. Manual check: sign in as each of tenant, landlord, agent and admin — no "Payment records" /
   "Receipts" link anywhere — and open `/receipts` and `/landlord/receipts`, which render the not-found screen.
5. **Deployment and production-database work remain unauthorised** and untouched.

---

## 6. Deployment steps for this phase

1. Deploy the code. **No migration, no data change, no configuration change.** The old `RECEIPT_ISSUING_ENABLED`
   environment variable, if one was ever set on the server, simply becomes unused and can be removed at leisure.
2. Because no endpoint is removed from a public contract that other systems call (the receipt API was internal to this
   app), there is no deprecation window to manage.
3. After deploy: sign in as tenant, landlord, agent and staff — no receipt link or screen; `/receipts` and
   `/landlord/receipts` show not-found; the admin fee ledger, remittances and fee policies still work; the reversal
   endpoint still answers for a real id.
