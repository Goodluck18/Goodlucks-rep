# Financial system audit corrections (R1–R4)

**Scope:** four findings from the financial-system audit, fixed on top of `main`
(`105aae75d9836aa5477d02c7de47dcff9a352b68`), without rebuilding Increment G or
changing its architecture.

| Finding | Where the fix lives |
| --- | --- |
| **R1** — the MySQL migration never created the five Increment G tables | `php-backend/migrate.php` |
| **R2** — duplicate `$requiredColumns` keys silently dropped columns | `php-backend/migrate.php` |
| **R3** — a reversal was measured against the whole obligation, so reversing one receipt blocked another | `php-backend/lib/finance.php`, `php-backend/lib/repository.php`, schemas, `src/types.ts`, `src/components/AdminFeeLedger.tsx` |
| **R4** — financial state was validated *before* the transaction, not inside it | `php-backend/lib/db.php`, `php-backend/lib/finance.php`, `php-backend/lib/api.php` |

Nothing in this change alters a business rule, a percentage, a capability or a
user-visible policy. "Unconfirmed ≠ revenue", "confirmed = applied +
unallocated", separate view/confirm powers, agent privacy and audit history all
behave exactly as they did.

---

## 1. R1 — the Increment G tables were missing from `$requiredTables`

`database.sql` has always contained the five Increment G tables, so a **fresh**
installation was complete. `migrate.php` only creates the tables it lists in
`$requiredTables`, and those five were never added — an **existing** installation
upgrading through `migrate.php` never received them, and no error was raised.

**Fix**

* `remittance_submissions`, `remittance_allocations`, `rental_commissions`,
  `commission_payments` and `financial_adjustments` are now listed and are
  created from their authoritative definitions in `database.sql`.
* The SQLite path of `migrate.php` — which used to print "created complete from
  schema.sqlite.sql" and exit — now performs a real upgrade plan built from
  `schema.sqlite.sql`: missing tables, missing columns and the indexes that
  belong to a newly created table.
* Every statement is idempotent (tables only when absent, columns only when
  `SHOW COLUMNS`/`PRAGMA table_info` says they are missing), so a second run
  reports "Schema is already up to date" and changes nothing.
* MySQL commits DDL implicitly, so the old code's `beginTransaction()` around
  `CREATE TABLE`/`ALTER TABLE` could never have rolled anything back. The runner
  now executes one statement at a time, records what was applied, and — if one
  fails — prints exactly which statement stopped the run and what is already
  applied, instead of implying an atomicity that does not exist.
* A `AFTER <column>` clause that references a column the installation never had
  is retried without the position clause rather than leaving the database
  half-upgraded.

Verified by `tests/migration.test.mjs`, which builds a real pre-Increment-G
SQLite database, runs `migrate.php` against it and inspects the result.

## 2. R2 — duplicate keys in `$requiredColumns`

The array had two `'properties'` entries and two `'viewing_schedules'` entries.
PHP keeps only the last one, so on an existing installation the migration added
`landlord_contact_claimed` but never `landlord_name`, `submitted_by_user_id`,
`landlord_authority_state`, `is_landlord_verified`, `nearby_places`,
`availability`, `featured`, `updated_at`, … and, for viewings, never
`tenant_email` or `outcome_notes`.

**Fix:** both pairs are merged into single entries that keep **every** column
from both halves, in dependency order. The whole array was then scanned
programmatically for further duplicates — there are none, and
`tests/migration.test.mjs` now fails if one is ever introduced, or if a column
from either former block goes missing.

## 3. R3 — reversals are now per receipt

`reverse_viewing_fee_remittance()` summed every reversal on the **obligation**
(`WHERE viewing_fee_record_id = …`) and compared that to *this* receipt's amount.
With two receipts of GH₵25 and GH₵15 against one GH₵40 obligation, fully
reversing the GH₵25 receipt made the GH₵15 receipt look "already fully reversed"
and it could never be reversed at all.

**Fix**

* New nullable column `fee_remittances.reversal_of_receipt_id` (both schemas,
  plus `migrate.php` for existing installations).
* Each reversal row stores the receipt it reverses; the remaining reversible
  amount is `receipt.amount − SUM(reversals of that receipt)`.
* Over-amount reversals are refused with the exact remaining balance;
  a fully reversed receipt is refused as such; partial reversals accumulate;
  the original rows are never edited or deleted and every reversal is its own
  `financial_adjustments` row.
* `migrate.php` backfills existing reversal rows from
  `financial_adjustments.subject_id` (which is the original receipt id), so
  installations that already have reversals behave identically to new ones. The
  backfill is idempotent.
* `list_fee_remittances()` exposes `reversalOfReceiptId`; the admin fee ledger
  shows "reverses receipt …" next to a reversal. No layout or flow changed.
* New helper `receipt_reversible_balance()` for future screens that need the
  per-receipt balance.

Totals, outstanding balances and the reconciliation summary are all derived
from the ledger rows, so they follow automatically (asserted in the tests).

## 4. R4 — financial decisions are taken inside the transaction

Every money-moving function used to read state, validate, and then write in a
separate transaction (or with no transaction at all). Two simultaneous requests
could both pass validation and both write.

**Fix**

* `db_transaction_immediate()` (new): `BEGIN IMMEDIATE` on SQLite — taking the
  write lock up front instead of upgrading a read lock — and a normal
  `beginTransaction()` on MySQL.
* `db_lock_row()` (new): `SELECT … FOR UPDATE` on MySQL/InnoDB; a plain read on
  SQLite, where `BEGIN IMMEDIATE` already excludes other writers.
* The state that the decision depends on is re-read **under that lock**, and the
  write is a conditional `UPDATE … WHERE status IN (…)` whose affected-row count
  is checked. Three independent layers, so a missed lock cannot silently
  double-apply.
* Unique constraints (`remittance_allocations (submission_id,
  viewing_fee_record_id)`) are treated as a guard, not an accident: a violation
  becomes a 409 with an explanation.
* A shutdown guard rolls back any transaction still open when a request exits
  early through `error_response()`, so no partial financial write survives.
* A database that is momentarily locked by another writer (`SQLITE_BUSY`, MySQL
  lock-wait timeout, deadlock) now returns **409 "Another payment is being
  recorded right now. Nothing was changed — please try again."** instead of a 500.

Hardened paths: remittance confirm, remittance reject/dispute, commission
payment, commission reversal/correction, commission status transition,
commission edit, viewing-fee reversal.

No SQLite-only assumption is used anywhere: `FOR UPDATE`, `BEGIN IMMEDIATE` and
`PRAGMA table_info` are each selected by driver, and all statements use named
parameters only (PDO cannot mix named and positional parameters per driver).

---

## 5. Tests

`npm run test:api` → **204 tests / 33 suites, all passing** (was 175/29; no
existing test was removed or weakened).

* **14 new HTTP tests** (`tests/api.test.mjs`, suite *Receipt-specific
  reversals and concurrency (audit R3/R4)*): two receipts on one obligation;
  full reversal of A; reversal of B afterwards; partial reversal; remainder;
  over-amount refusal; duplicate full reversal refusal; totals/outstanding and
  summary correctness; unrelated receipts unaffected; originals unedited and
  reversal rows naming their receipt; plus four pairs of simultaneous HTTP
  requests (double confirm, competing allocations, two commission payments,
  two full reversals, duplicate status decision) and a rollback test.
* **9 migration tests** (`tests/migration.test.mjs`): a real legacy SQLite
  database, dry run, `--apply`, indexes, every merged column, data preservation,
  a second run that changes nothing, the reversal backfill, plus static checks
  of the MySQL plan (all five tables listed, every G table defined in
  `database.sql`, no duplicate keys, no lost columns).
* **6 concurrency tests** (`tests/concurrency.test.mjs`): two **separate OS
  processes** start the same financial operation against the same SQLite file at
  the same moment — confirm, competing allocations, reversal, commission
  payment, rejection — then the database is inspected: one winner, one clear
  refusal, one row written, balances consistent, no partial records.

## 6. MySQL / MariaDB — not executed here (limitation, stated plainly)

No MySQL or MariaDB server could be obtained in this environment:

* `mysql`, `mysqld`, `mariadb` and `docker` are not installed;
* the Debian mirror available to the sandbox is trimmed and contains no
  `mariadb-server` / `mysql-server` package;
* the npm package `mysql-memory-server` installs, but its binary download from
  `cdn.mysql.com` is blocked by the sandbox's egress allowlist.

**Therefore the MySQL migration and the MySQL concurrency paths were not run.**
What was done instead:

* the SQLite upgrade path was executed for real, against a genuinely old
  database (same shared schema file, same backfill SQL);
* the MySQL plan was checked statically (required tables, duplicate keys,
  merged columns, definitions present in `database.sql`);
* the code is driver-neutral by construction (named parameters only, no
  SQLite-only syntax, `FOR UPDATE`/`BEGIN IMMEDIATE`/`PRAGMA`/`SHOW` chosen per
  driver, affected-row checks avoided where MySQL reports unchanged rows as 0).

The first real MySQL run is still outstanding and must happen before anyone
calls this production-ready.

## 7. Remaining limitations

* MySQL execution (above).
* No screen-level/browser pass; the frontend change is one line of display text
  in the admin fee ledger.
* `receipt_reversible_balance()` is not yet shown anywhere; the admin UI still
  shows per-obligation figures with the reversal's receipt named.
* Unallocated funds still have no re-allocation screen (unchanged from Increment G).
* Older installs keep legacy default values (`is_landlord_verified`,
  `assigned_agent`) — the migration does not rewrite existing rows.
* Ghana rental-commission licensing/tax treatment remains unreviewed.
