# Task 03 update — landlord viewing fee, platform fee and rental commission policy

Status: **implemented and tested at the API + build level. Not launched, not browser-verified, not MySQL-verified.**
This update changes only the landlord half of the fee policy. The completed Task 03 work (registration,
verification, agent tiers, agent viewing fees) is untouched — see `docs/TASK_03_REPORT.md`.

## 1. The rule implemented

**Landlord-submitted listings**

| Item | Who sets it | Who pays it | Who receives it |
|---|---|---|---|
| Viewing fee | Goodlucks Homes (one general amount, admin-configured) | the tenant, **after** the viewing | Goodlucks Homes (100%) |
| Platform fee on rent | the policy (8% of rent actually paid) | the tenant | Goodlucks Homes (100%) |
| Agency commission | — | — | **none** (the landlord gets no commission) |

**Agent-submitted listings** — unchanged: the agent sets that property's own viewing fee and viewing terms
(admin-approved), and the commission split stays 60% (identity approved) / 70% (identity + professional
approved) of the agreed commission.

Which policy applies is decided from the **submission attribution** (`submitted_by_role` /
`submitted_by_user_id`), never from who owns the property, so an agent submitting for a landlord is still an
agent listing.

## 2. Where the administrator sets the general landlord viewing fee

Admin dashboard → **Fee Policies** → card **“General landlord viewing fee”**
(`src/components/AdminLandlordFeePolicy.tsx`).

- Shows the current amount, when it was last changed and by whom.
- A non-negative money amount is validated on the server (`0` – `10,000 GHS`).
- Until it is set, the card, and the notification sent to admins when a landlord lists, say
  **configuration required**; no amount is ever invented.
- Only an `admin` account may read or change it; landlords, agents and tenants get `403`, guests `401`.
- Every change is written to the audit log (`landlord_policy.viewing_fee_changed`) with the previous value.

API: `GET /api/admin/landlord-policy`, `PUT /api/admin/landlord-policy/viewing-fee` `{ amountGhs }`.

Storage: **`platform_settings`**, key `landlord_viewing_fee_ghs`. There is no default row, so “unconfigured”
is a real state rather than a fallback number.

## 3. How landlord listings receive the fee

1. On submission (`POST /api/properties`), the server copies the configured amount and the standard landlord
   viewing terms onto the listing (`properties.viewing_fee_ghs`, `viewing_terms_json`,
   `viewing_terms_state = approved`). Any fee or terms a landlord sends are ignored and audited.
2. On admin approval the same apply step runs again, so a listing submitted before the fee existed still
   gets it when it goes live.
3. When the administrator changes the general fee, every landlord listing that is `pending`, `active` or
   `rented` takes the new amount, so what a tenant is quoted matches what the next viewing will record.
4. **Recorded viewings are never rewritten.** Each viewing stores `fee_amount_ghs` plus a snapshot
   (`viewing_terms_snapshot_json`) containing the fee, the terms, `source = platform_policy`,
   `paidTo = Goodlucks Homes` and `payableAfterViewing = true`.
5. A landlord cannot change the fee on any route: `PUT /api/properties/{id}` and
   `POST /api/properties/{id}/viewing-terms` answer `403` for a landlord listing.

## 4. How tenants are told it is payable after viewing

- Property detail: “Viewing fee: GH₵ X, payable after the viewing to Goodlucks Homes — never online, and
  never to the landlord.”
- Property cards: the fee with “to Goodlucks after viewing”.
- Viewing request modal: the fee, “payable after the viewing, to Goodlucks Homes”.
- Tenants dashboard: “GH₵ X, payable to Goodlucks Homes after the viewing.”
- The email sent when a viewing is requested says the fee is paid to Goodlucks after the viewing.
- Agent listings keep their existing wording (“paid on site to the agent”).

## 5. The 8% platform fee on rent

API: `POST /api/admin/finance/landlord-platform-fees` `{ propertyId, rentAmountGhs, rentPaymentReference,
tenantName?, dueDate?, notes? }`; `GET` the same path to read the transactions and totals.

- The **rent the tenant actually paid** is the basis staff record, with the payment reference. The **fee is
  never accepted from a client**: `amountGhs`, `platformFeeGhs`, `platformFeePercent` and any share values in
  the request are ignored.
- The percentage is `LANDLORD_PLATFORM_FEE_PERCENT = 8.0` in `lib/landlord_policy.php`. It is stored on every
  row (`platform_fee_percent`), together with the basis (`rent_amount_ghs`), the fee (`commission_amount_ghs`),
  `goodlucks_share_percent = 100`, `goodlucks_share_ghs = fee`, `agent_share_percent = 0`,
  `agent_share_ghs = 0` and an immutable snapshot with a hash. A future policy change therefore cannot rewrite
  an old transaction.
- Rounding: `round(rent * 8 / 100, 2)`, half away from zero — e.g. GH₵ 12,000.00 → GH₵ 960.00;
  GH₵ 12,345.67 → GH₵ 987.65.
- Duplicate protection: a normalised `dedupe_key` per (property, rent payment reference), checked in code
  **and** enforced by a UNIQUE index (`uniq_commission_dedupe`), so a retry or a race cannot charge twice.
- Money received is recorded with the existing commission-payment route
  (`/api/admin/finance/commissions/{id}/payments`); a fee owed is not revenue until a receipt exists.

## 6. The two policies can never mix

| Attempt | Result |
|---|---|
| Agent commission on a landlord listing (`POST /admin/finance/commissions`) | `422` |
| Landlord platform fee on an agent listing (`POST /admin/finance/landlord-platform-fees`) | `422` |
| Landlord viewing fee recorded through the agent ledger | `422` |
| Landlord viewing fee recorded through the old “agent collected on site” checkbox | `422` |
| A landlord platform fee row carrying an agent tier | impossible: `agent_tier` NULL, `agent_share_percent = 0` |

`rental_commissions.policy_type` (`agent_commission` | `landlord_platform_fee`) is decided server-side. The
finance reconciliation summary now counts **agent commissions only** in `rentalCommissions` and reports
`landlordPlatformFees` on its own line.

## 7. Viewing-fee payments (Goodlucks money)

API: `POST /api/admin/finance/landlord-viewing-fees` `{ viewingId, method?, reference?, receivedAt?, notes? }`;
`GET` the same path for the records and totals.

- The viewing must belong to a landlord listing **and be completed** — the fee is payable after the viewing.
- The amount is the fee already snapshotted on the viewing; it is never retyped and a later change to the
  general fee does not alter it.
- The ledger row (`viewing_fee_records`, `fee_source = landlord_platform_fee`,
  `share_basis = platform_policy`) records 100% Goodlucks, 0 agent share, 0 landlord share, and a
  `fee_remittances` receipt — that receipt is the only reason the money counts as received.
- One fee record per viewing (`UNIQUE viewing_id`); a second attempt returns `409`.
- The ledger UI labels these rows “Goodlucks — landlord listing”, so they are never read as an agent
  collection.

## 8. Database changes (additive, MySQL + SQLite)

| Object | Change |
|---|---|
| `platform_settings` | **new table** (`setting_key` unique, `setting_value`, `value_type`, `updated_by`, `updated_at`) |
| `rental_commissions` | `policy_type` (default `agent_commission`), `rent_amount_ghs`, `platform_fee_percent`, `dedupe_key` + `uniq_commission_dedupe` |
| `viewing_fee_records` | `fee_source` (default `agent_collection`) |

Mirrored in `database.sql` (MySQL), `schema.sqlite.sql` and `migrate.php`. Nothing is dropped, renamed or
reset; existing rows take the defaults that mean exactly what they did before.

## 9. Tests executed (actual results)

| Suite | Result |
|---|---|
| `tests/api.test.mjs` | **189 pass / 0 fail** |
| `tests/task03.test.mjs` (was 38, +12 new) | **50 pass / 0 fail** |
| `tests/account-settings` + `migration` + `concurrency` | **22 pass / 0 fail** |
| `npm run test:routing` | **38 pass / 0 fail** |
| `npm run test:navigation` | **30 pass / 0 fail** |
| `npm run lint` (`tsc --noEmit`) | clean |
| `npm run build` | success |
| `php -l` on every changed PHP file | no syntax errors |

The new tests cover: 1) an admin can configure the fee, 2) nobody else can, 3) a landlord listing receives it
automatically, 4) a landlord cannot override it, 5) a new amount applies to future listings/viewings, 6) a
recorded viewing keeps its fee, 7) the fee is 100% Goodlucks, 8) the payment is stored against the viewing and
property, 9) 8% of the rent actually paid, 10) the landlord gets no commission, 11) landlord rows never enter
the agent commission workflow, 12) agent per-property fees still work, 13) the 60/70 tier split is unchanged,
14) attribution decides the policy, 15) duplicate fees are refused, 16) manipulated client amounts are
ignored, 17) admin/landlord/agent/tenant permissions hold.

Also verified by hand: `migrate.php` upgrades a database that lacks the new columns/tables (dry run and
`--apply` on a SQLite copy).

## 10. Limitations and what was NOT verified

1. **MySQL was not executed.** No MySQL server exists in this environment. The migration statements are
   written for MySQL (`ALTER TABLE ... ADD COLUMN ... UNIQUE` for `dedupe_key`, `SHOW COLUMNS`-based
   planning) but have only been applied to SQLite. Run `php php-backend/migrate.php --apply` against a
   phpMyAdmin export before deploying and check the log.
2. **No browser or mobile testing.** The dashboards and tenant screens were verified by type-check, build and
   the routing/navigation suites only.
3. **The rent amount is recorded, not processed.** The platform does not take rent payments online, so staff
   enter the rent that was actually paid together with its reference. “Calculated from the rent actually
   paid” therefore means “calculated from the recorded rent payment”, which is the same basis every other
   financial record in this codebase uses.
4. **A SQLite database upgraded in place does not get the `uniq_commission_dedupe` index** (SQLite cannot add
   a UNIQUE column or index to an existing table in this migration path). The duplicate check in code still
   applies; a fresh install has the index. MySQL upgrades do get it.
5. **Fee-change history** is in the audit log (`audit_logs`); the admin card shows only the latest change.
6. Release remains explicitly **not launch-ready**.
