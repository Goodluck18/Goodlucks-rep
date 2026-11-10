# Upgrade 2 — Phase 7 report (tenant rent receipts removed, E1)

**Date:** 2026-11-10
**Branch:** `arena/1dbf260c-goodlucks-rep`
**Base commit:** `1ccd747` (Phase 6)
**Scope:** E1 — remove tenant rent-receipt functionality while preserving `rent_receipts`, `fee_remittances` and the fee policies built on them.

Nothing was deployed. No production database was touched. No row was deleted, rewritten or migrated.

---

## 1. What was required, and what was delivered

The requirement has two halves, and getting one right by breaking the other would be the easy mistake. Tenants lose the
feature; **nothing else changes**.

### What was removed

| Surface | Before | Now |
| --- | --- | --- |
| `GET /api/receipts` | tenant allowed, saw every record linked to their user id | tenant `403`; `require_auth(['admin', 'landlord'])` |
| `GET /api/receipts/:id` | tenant named on the record allowed | tenant `403`; the record is not even looked up |
| Tenant dashboard | "My payment records" quick action opened the receipt screen | the action is gone; the slot now opens "My viewings", something a tenant can really do |
| `/receipts` for a tenant | rendered the receipt screen | redirect to `/tenant/dashboard` |
| Tenant branch of `AppContext` | called `api.listReceipts()` on every sign-in | no call at all |
| `list_receipts()` | queried `tenant_user_id OR landlord_user_id` and fell back to phone matching for legacy rows | a landlord sees only rows whose `landlord_user_id` is their own account; anyone else gets an empty list |
| `user_can_read_receipt()` | admin, either linked party, plus a legacy phone-number fallback | admin, plus the linked landlord only |

The legacy phone-number fallback is deliberately gone rather than left dormant: it was the weakest check in the file
(anyone can register a phone number), and with tenants no longer readers it had no remaining purpose.

### What was preserved

* **`rent_receipts` rows** — untouched. Staff still list and read every record; the linked landlord still reads their own.
* **`fee_remittances`** — untouched, and the finance endpoints (`/api/admin/finance/remittances`, per-record remittance
  entry, confirmation) still answer.
* **Fee policies** — untouched, and `/api/admin/fee-policies` still answers (200 with the capability, 403 without).
* **Issuing** stays exactly as it was: admin-only and switched off (`RECEIPT_ISSUING_ENABLED = false` → 503), which is
  a pre-existing decision from Increment B, not part of this phase.
* **Schema** — no migration was added in this phase at all. The only schema change in Upgrade 2 so far remains Phase 6's
  eight nullable `properties` columns. `migrate.php` contains no `DROP TABLE`.

The landlord's own "Payment records" area (`/landlord/receipts`, the same `ReceiptsView`, embedded in the account
shell) is unchanged — it is the provider's financial history, not a tenant feature.

---

## 2. Files changed

| File | Change |
| --- | --- |
| `php-backend/lib/api.php` | `handle_list_receipts` / `handle_get_receipt` refuse tenants; comment records why the rows are kept |
| `php-backend/lib/repository.php` | `user_can_read_receipt` reduced to staff + linked landlord; `list_receipts` scoped to the landlord link, legacy phone fallback removed |
| `src/components/TenantDashboard.tsx` | "My payment records" replaced with "My viewings" |
| `src/context/AppContext.tsx` | tenant branch no longer requests receipts |
| `src/routing/routes.ts` | tenant opening `/receipts` is redirected to `/tenant/dashboard` |
| `tests/tenant-receipts-removed-phase7.test.mjs` | **new** — 13 tests covering both halves of the requirement |
| `tests/access-control.test.mjs` | tenant receipt access now asserted as 403 (split into two tests) |
| `tests/api.test.mjs` | receipt scoping tests updated to the E1 contract |
| `tests/routing.test.mts` | `/receipts` decisions: guest → login, tenant → redirect, landlord/agent/admin → allow |
| `tests/app-navigation.test.mts` | the tenant receipt screen test now asserts the redirect |
| `package.json` | `test:receipts-phase7` script |

---

## 3. Test results (all executed on this branch, this commit)

| Suite | Result |
| --- | --- |
| `tests/tenant-receipts-removed-phase7.test.mjs` (new) | **13 / 13** |
| `tests/api.test.mjs` — suites 1–29 | **177 / 177** |
| `tests/api.test.mjs` — suite 30 (concurrency/rollback) | **14 / 14** |
| `tests/access-control.test.mjs` | 14 / 14 |
| `tests/routing.test.mts` | 50 / 50 |
| `tests/app-navigation.test.mts` | 61 / 61 |
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
| `tests/blog.test.mjs` | 45 / 45 |
| `tests/sharing.test.mts` | 36 / 36 |
| `tests/uploads.test.mts` | 20 / 20 |
| `tests/responsive.test.mts` | 18 / 18 |
| `tests/provider-experience-phase6.test.mjs` | 22 / 22 (Phase 6, re-checked after these changes) |
| `tests/property-seo.test.mts` | 23 / 23 |
| `tests/blog-html.test.mts` | 16 / 16 |
| `tests/design-tokens.test.mjs` | 14 / 14 |
| `tests/content.test.mjs` | 4 / 4 |
| `tests/email-footer.test.mjs` | 3 / 3 |
| `tests/admin-console-phase3.test.mts` | 11 / 11 |
| `tests/admin-console-phase4.test.mts` | 12 / 12 |
| `tests/admin-console-phase5.test.mts` | 19 / 19 |
| **Total** | **754 / 754, 0 failures** |

Other gates: `tsc --noEmit` clean; `npm run build` ✓ (5.52 s); `php-wasm-cli -l` clean on the two changed PHP files.

Seed count check: 13 + 177 + 14 + 14 + 50 + 61 + 50 + 7 + 10 + 9 + 16 + 15 + 14 + 16 + 14 + 6 + 12 + 11 + 45 + 36 + 20 + 18 +
22 + 23 + 16 + 14 + 4 + 3 + 11 + 12 + 19 = **754**.

The single-process php-wasm ceiling documented in Phases 5 and 6 applies unchanged: running every `api.test.mjs` suite
in one process wedges suite 30's last test (`fetch failed`, `ERR_TEST_FAILURE`), and that suite is 14 / 14 when run in
its own process, which is how it is reported above.

---

## 4. Privacy and data-integrity review

* A tenant id can no longer select receipts at all — the scoping query does not mention `tenant_user_id`, so no request
  shape can widen it.
* Refusal is by role, before the record lookup, so a tenant cannot use the endpoint to probe which ids exist.
* No row was deleted, and no migration touched `rent_receipts`, `fee_remittances` or `fee_policies`.
* The fee ledger, the remittance workflow and the fee-policy workflow are unchanged and still answer.
* The tenant-side removal does not touch the Phase 5 tenant-contact rules or the Phase 6 provider rules.

---

## 5. Outstanding items / known limitations

1. **Legacy unlinked receipts** (no `tenant_user_id`, no `landlord_user_id`) are now readable by staff only. That is the
   honest outcome: without a link there is no verified party, and the phone fallback that used to attribute them is
   exactly what this phase removed.
2. **Receipt issuing remains disabled** (`RECEIPT_ISSUING_ENABLED`), as it has been since Increment B. This phase neither
   enables nor removes it; that is a separate decision about the payment model.
3. **No browser** was available here, so the tenant UI change is covered by `tests/app-navigation.test.mts` (which
   renders the app), `tests/routing.test.mts`, `tsc` and a production build. Manual check: sign in as a tenant, the
   dashboard shows "My viewings" where "My payment records" used to be, and `/receipts` lands on `/tenant/dashboard`.
4. **Deployment and production-database work remain unauthorised** and untouched.

---

## 6. Deployment steps for this phase

1. Deploy the code. **No migration, no data change, no configuration change.**
2. `RECEIPT_ISSUING_ENABLED` stays unset/false as before.
3. After deploy: sign in as a tenant → no payment-records link anywhere, `/receipts` redirects to the dashboard; sign in
   as a landlord → `/landlord/receipts` still lists their records; sign in as staff → `/api/receipts` still returns the
   full history, and the finance screens still show the remittance ledger.
