# Increment G — Agent Remittances, Financial Reconciliation and Rental Commissions

**Status:** implemented, tested at the API and contract level, committed and pushed.
**Date:** 3 November 2026
**Branch:** `arena/a67485fb-goodlucks-rep` → merged into `main`
**Scope:** extend the Increment B ledger and the Increment E policy engine — no parallel financial system, no new role model, no redesign.

---

## 1. What this increment is for

Before G the platform could record that an agent *collected* a viewing fee and that Goodlucks was *owed* a share, and an administrator could type "we received GH₵ X" straight into `fee_remittances`. Three things were missing, and they are the whole of this increment:

1. **A claim is not a receipt.** There was no object representing "the agent says they sent money". `fee_remittances` had `recorded_by` and `received_at` but no state, so the moment a row existed it counted as revenue.
2. **Money could not be applied to obligations.** The ledger knew a total received figure per record, but nothing linked a payment to the specific obligation it settles, so partial settlement, over-payment and unmatched funds were invisible.
3. **Rental commissions did not exist at all.** There was only a `rental_commission` *policy category label*; no table, no workflow, no record of an actual agreement.

G adds exactly those three things and nothing else.

---

## 2. The five figures, and why they never merge

Every screen and every endpoint keeps these apart. This is the single most important design rule in the increment:

| Figure | Where it comes from | Is it revenue? |
| --- | --- | --- |
| **Collected** — what the agent says they took from the tenant | `viewing_fee_records.fee_total_ghs` | **No.** It is the agent's report about someone else's money. |
| **Owed** — what Goodlucks is entitled to | `goodlucks_share_ghs`, set by a manual agreement or a frozen approved-policy snapshot | **No.** An entitlement is not a receipt. |
| **Reported** — what the agent says they sent | `remittance_submissions` with status `submitted` | **No.** A claim. |
| **Confirmed** — money Goodlucks verified arrived | `remittance_submissions.confirmed_ghs`, mirrored into `fee_remittances` | **Yes**, and only this. |
| **Outstanding** — what is still owed | `goodlucks_share_ghs − Σ fee_remittances` | No. It is a receivable. |

The worked example from the brief is a test:

> collect 200, owe 80, remit 50, confirm 50 → **collected 200 / owed 80 / received 50 / outstanding 30**

`tests/api.test.mjs` proves the same arithmetic with the suite's own numbers (collected 100, owed 40, claim 25, confirm 25 → received 25, outstanding 15), and separately proves that a *submitted but unconfirmed* claim moves none of those figures.

---

## 3. Data model

All changes are **additive**: new tables, new nullable/defaulted columns, no destructive ALTER, no data rewrite. Rollback is "drop the five new tables and the added columns"; nothing else changes.

### 3.1 New tables

| Table | Purpose |
| --- | --- |
| `remittance_submissions` | One agent claim: amount, currency, method, payment reference, paid date, evidence reference, note, optional requested allocations, `status`, `confirmed_ghs`, `confirmed_by/at`, `decision_reason`. |
| `remittance_allocations` | Applies part of a confirmed remittance to one `viewing_fee_records` row. **Unique on `(submission_id, viewing_fee_record_id)`** so one confirmation cannot allocate to the same obligation twice. |
| `rental_commissions` | One recorded rental agreement: property, tenant, landlord, agent, rental reference, amount, currency, basis, policy snapshot + hash, due date, status, notes, cancel reason. |
| `commission_payments` | Money received against a commission (`entry_type = receipt`) or a linked reversal (`entry_type = reversal`). |
| `financial_adjustments` | The audit record behind every reversal or correction: subject, kind, signed amount, reason, support reference, `meta_json`, actor. |

### 3.2 Added columns

| Table | Column | Notes |
| --- | --- | --- |
| `users` | `can_view_finance`, `can_confirm_remittances` | `TINYINT(1) NOT NULL DEFAULT 0` / `INTEGER NOT NULL DEFAULT 0`. Default deny. |
| `fee_remittances` | `submission_id`, `allocation_id`, `entry_type` (`receipt`/`reversal`), `adjustment_id` | Lets the Increment B ledger point at the claim that produced a receipt and hold negative reversal rows without editing originals. |
| `remittance_submissions` | `requested_allocations_json` | Optional hint from the agent about which viewings the money covers. Staff decide what is actually allocated. |

### 3.3 Engines

- `php-backend/schema.sqlite.sql` — the SQLite dev/test schema, created whole for a new database.
- `php-backend/database.sql` — the MySQL/MariaDB schema, parsed by `migrate.php` for missing tables.
- `php-backend/migrate.php` — `$requiredColumns` gained the four `fee_remittances` columns, the two `users` columns and `requested_allocations_json`, so an **existing** MySQL installation is upgraded in place.

**Honest status:** the MySQL DDL has never been executed. This sandbox has no MySQL/MariaDB server and no Docker. See §10.

---

## 4. Remittance workflow

```
agent ──POST /api/agent/remittances──▶ submitted ──┐
                                                   ├─ confirm (financeConfirm) ─▶ confirmed
                                                   ├─ reject  (financeConfirm) ─▶ rejected
                                                   └─ dispute (financeConfirm) ─▶ disputed
                                                                                    │
                                                        still decidable ────────────┘
```

- **Only `submitted` and `disputed` are decidable.** `confirmed`, `rejected` and a second confirmation attempt return **409**, so a claim cannot be double-counted or silently flipped.
- **Confirmation is the only path from claim to money.** It requires `can_confirm_remittances`; an agent calling it gets **403**; an administrator with only `can_view_finance` gets **403**.
- Confirmation accepts a list of allocations. Each one is validated server-side:
  - the fee record must exist (**404** otherwise);
  - it must belong to **the same agent** as the submission (**403** — an agent cannot settle another agent's debt);
  - it must not be `void`;
  - the record must have an agreed share — money cannot be "applied" to a fee nobody priced (**422**);
  - the allocation may not exceed that record's **outstanding** balance (**422**);
  - the same record may not appear twice in one confirmation (**422**);
  - allocations may not total more than the claimed amount (**422**).
- Confirmation is one database transaction: the submission flips to `confirmed`, one `remittance_allocations` row and one positive `fee_remittances` row are written per allocation, and an audit entry is recorded. A failure anywhere rolls the whole thing back.
- **Confirmed but unallocated money is a first-class number** (`remittances.unallocatedGhs`) and is reported separately. It is counted once: `confirmedReceivedGhs = appliedToObligationsGhs + unallocatedGhs`, asserted in the suite.
- Rejection and dispute require a written reason (**422** without one), keep the row, notify the agent, and audit.

### 4.1 Reversals

A confirmed receipt is **never edited or deleted**. `POST /api/admin/finance/receipts/{receiptId}/reverse` writes:

1. a `financial_adjustments` row (`kind = reversal`, negative amount, reason, support reference, actor), and
2. a negative `fee_remittances` row with `entry_type = 'reversal'` and `adjustment_id` set.

`fee_remitted_total()` sums the column, so the obligation's outstanding balance rises again automatically. Guards: only a `receipt` row can be reversed, the amount must be > 0 and ≤ the original, and a receipt cannot be reversed beyond its own value (**409**).

---

## 5. Rental commissions — a separate workflow

Nothing generates a commission. Not a property becoming rented, not a completed viewing, not a listing. A person records an agreement; the suite asserts that creating a commission adds exactly one row and that no other event creates any.

**Statuses:** `draft → awaiting_agreement → agreed → due → partially_paid → paid`, plus `disputed`, `cancelled`, `corrected`.

**Transitions** are an explicit allow-list (`COMMISSION_TRANSITIONS`); anything else is **422**. `cancelled` and `corrected` are terminal for the workflow.

**Before `agreed`** the record must have:
- an amount above zero,
- a **rental agreement reference** (`rentalReference`) — the record of the actual agreement,
- for a manual basis, written terms in `notes` or in the transition reason.

That is the code-level expression of "a commission must be based on an actual recorded agreement".

**Pricing:** `basis = manual_agreement` (a typed amount someone is accountable for) or `basis = policy_snapshot`. The snapshot path refuses anything that is not an **active, approved** `rental_commission` policy covering the due date and matching the agent's tier, and stores a frozen JSON snapshot plus `fee_snapshot_hash`. Later policy changes cannot alter a past obligation; the panel recomputes and verifies the hash (`hashValid`).

**Payments:** only against `agreed`, `due` or `partially_paid`. Amount > 0, a real date, no future dates, and **no over-receipt** (422). Status is then derived from the money actually received: `paid` when the total is met, `partially_paid` when something is received, back to `due`/`agreed` if a reversal removes it.

**Adjustments:** `reversal` (negative `commission_payments` row + `financial_adjustments`) and `correction` (changes the agreed amount by a signed delta, recorded with `fromGhs`/`toGhs`, refused if it would go below what has already been received).

**Legal caution:** the platform's treatment of Ghana rental-commission licensing and tax is unreviewed. Nothing in the UI or the API describes an arrangement as legally approved; the panel says so explicitly.

---

## 6. Permissions

Four independent, default-deny capabilities, all granted only from the server console:

| Capability | Grants | Column |
| --- | --- | --- |
| `financeView` | read the ledger, remittances, commissions, adjustments, summaries | `users.can_view_finance` |
| `financeConfirm` | confirm receipt, allocate, reject, dispute, reverse, run commissions | `users.can_confirm_remittances` |
| `feePolicyManage` (E) | draft/edit/submit a fee policy | `users.can_manage_fee_policies` |
| `feePolicyApprove` (E) | approve/reject/activate a policy | `users.can_approve_fee_policies` |

CLI:

```bash
php php-backend/grant_finance.php --email=clerk@goodlucks.co   --view=1
php php-backend/grant_finance.php --email=cashier@goodlucks.co --confirm=1
php php-backend/grant_finance.php --list          # manage / approve / view / confirm
```

There is still **no HTTP route that grants a capability** — a stolen admin session cannot widen its own financial authority.

**Behaviour change, deliberate:** since G, `GET /api/admin/viewing-fees` and `GET /api/admin/viewing-fees/policy` require `financeView` instead of accepting any administrator. Policy managers and approvers keep that right implicitly (`finance_can_view` honours the E capabilities), but a verification reviewer no longer reads the money ledger. The F test that asserted 200 there now asserts 403, with a comment explaining why.

Agents: `GET /api/agent/finance` and `POST /api/agent/remittances` are scoped to `auth_user()['id']`; a foreign remittance id is reported as **404** (not 403) so the endpoint never confirms that someone else's claim exists. An agent has **no** route that can confirm, allocate, reverse or record a commission.

Suspended agents: they keep read access to their history (`canSubmitRemittances: false`) and are refused new submissions with **403**.

---

## 7. API surface

| Method | Path | Capability |
| --- | --- | --- |
| GET | `/api/agent/finance` | agent (own records) |
| POST | `/api/agent/remittances` | agent (own, active account) |
| GET | `/api/agent/remittances/{id}` | agent (own only, else 404) |
| GET | `/api/admin/finance/summary` | financeView |
| GET | `/api/admin/finance/remittances?status=&agentUserId=&from=&to=` | financeView |
| GET | `/api/admin/finance/remittances/{id}` | financeView |
| POST | `/api/admin/finance/remittances/{id}/confirm` | financeConfirm |
| POST | `/api/admin/finance/remittances/{id}/decision` | financeConfirm |
| POST | `/api/admin/finance/receipts/{id}/reverse` | financeConfirm |
| GET | `/api/admin/finance/agents/{agentUserId}` | financeView |
| GET | `/api/admin/finance/adjustments` | financeView |
| GET/POST | `/api/admin/finance/commissions` | financeView / financeConfirm |
| GET/PATCH | `/api/admin/finance/commissions/{id}` | financeView / financeConfirm |
| POST | `/api/admin/finance/commissions/{id}/status` | financeConfirm |
| POST | `/api/admin/finance/commissions/{id}/payments` | financeConfirm |
| POST | `/api/admin/finance/commissions/{id}/adjustments` | financeConfirm |

The reconciliation summary returns, separately: `viewingFees` (collected / entitled / received / outstanding / records without an agreed share / disputed), `remittances` (reported-awaiting, confirmed, applied, unallocated, rejected, disputed), `rentalCommissions` (agreed / due / received / outstanding / disputed / by status), `adjustments` (count, net, recent), and `confirmedRevenue` with exactly two lines — viewing-fee remittances and rental commissions — and a note stating that reported collections and unconfirmed claims are excluded by design.

---

## 8. Interface

- **`src/components/AgentFinancePanel.tsx`** (new) — mounted in `AgentDashboard`. Own totals (collected / payable / confirmed / outstanding / awaiting / rejected / disputed), the obligations table, a remittance submission form (amount, method, date, transfer reference, evidence reference, note, with server field errors shown inline), the claim history with status, confirmed amounts, unmatched remainders, decision reasons and per-obligation allocations, and read-only commission information. It contains **no confirmation control** at all.
- **`src/components/AdminFinancePanel.tsx`** (new) — mounted as the **Finance** tab in `AdminDashboard`. Reconciliation header, then three tabs: remittances (allocate + confirm, dispute, reject with a required reason), commissions (record an agreement, move statuses, record payments, see receipts and reversals), and adjustments. Confirmation controls render only when `currentUser.capabilities.financeConfirm` is true, and a banner explains the read-only state otherwise.
- `src/types.ts` gained `RemittanceSubmission`, `AgentFinanceOverview`, `AgentFinanceTotals`, `RentalCommission`, `CommissionPayment`, `FinancialAdjustment`, `FinanceReconciliationSummary`, `RentalCommissionStatus`, plus `entryType`/`submissionId`/`adjustmentId` on `FeeRemittance` and the two new flags on `StaffCapabilities`.
- `src/services/apiService.ts` gained the fifteen calls above, following the existing `request<T>()` conventions.

---

## 9. Outstanding A–F findings addressed

| Finding | Action |
| --- | --- |
| **D10** (403 vs 404 documentation) | `INCREMENT_F_REPORT.md` §7 and §11 corrected to state the measured behaviour (403 for an existing record, 404 for an unknown id). Code unchanged. |
| **D11** (cancellation reason missing from notifications) | Fixed in `viewing_apply_transition()`: an empty `note` no longer suppresses `reason`. The F test that pinned the old behaviour now asserts the reason appears. |
| **D12** (fictitious "Michael Quarshie (Goodlucks Lead Agent)") | Removed. `TenantDashboard` falls back to "No named agent assigned yet"; the admin scheduling modal defaults to the signed-in user's name and an honest placeholder. |
| **D13** (legacy `'Goodlucks Field Agent'` default) | Removed from both schemas and from `create_viewing()`; an unassigned viewing has an empty agent name. Existing rows in a deployed database are untouched. |
| **D5** ("verified listings/properties" marketing copy) | Swept: 20+ claims across `index.html`, `HomeView`, `BrowseView`, `AboutView`, `FindAHomeView`, `GetNotifiedModal`, `PropertyDetailView`, `TenantDashboard`, `AgentDashboard` now say what the system actually does (staff review before publication) and explicitly deny that review is a title or condition guarantee. |
| `awaiting_agent` (D3) | Not changed — still defined and never assigned. Documented, not silently "fixed". |

---

## 10. Verification actually performed

| Check | Command | Result |
| --- | --- | --- |
| Full API suite | `npm run test:api` | **175/175 pass, 29 suites, exit 0** (`/tmp/g-suite-6.log`) — 163 from 0/A–F plus 12 new G tests |
| TypeScript | `npx tsc --noEmit` (= `npm run lint`) | exit 0 |
| Production build | `npm run build` | exit 0; both new panels present in `dist/assets/AgentDashboard-*.js` and `AdminDashboard-*.js` |
| PHP syntax | `php-wasm-cli -l` on every changed file | no syntax errors (`finance.php`, `finance_api.php`, `api.php`, `repository.php`, `fee_policies.php`, `viewings.php`, `config.php`, `migrate.php`, `grant_finance.php`) |
| Live smoke (separate stack, disposable DB `.data/dev-g.sqlite`) | `/tmp/g-smoke.mjs` | **39/39 assertions** before the suite was written |
| Dev app + proxy | `curl` on the running dev stack | app 200, `/api/health` 200, new module served |
| MySQL / MariaDB | — | **not executed** (no server available) |
| Browser / mobile | — | **not executed** (no browser in the sandbox) |

### What the new tests assert

12 tests in `Agent remittances, reconciliation and rental commissions (Increment G)`:

1. view-only staff read everything and change nothing that moves money; a plain administrator is refused everywhere;
2. an agent's claim changes no revenue figure, and the agent cannot confirm it;
3. an agent cannot read another agent's finance, and a foreign claim id is 404;
4. confirmation applies money once, updates the obligation and the summary, is not repeatable, and is audited;
5. over-allocation, duplicate allocation, cross-agent allocation and allocations above the claimed amount are all refused;
6. submissions are validated server-side (zero amount, future date, missing transfer reference) and a client cannot set `status`/`confirmedGhs`;
7. a rejection keeps its reason, cannot be confirmed later, and raises the rejected count without touching revenue;
8. a confirmed receipt is reversed by a linked row, never edited, with the ledger net and outstanding moving correctly;
9. a commission needs a property, an agreement reference and terms; it is never auto-generated; payments produce `partially_paid`; over-receipt is refused; reversal restores the balance; the agent sees it read-only;
10. a policy-priced commission needs a real approved policy, and every stored snapshot's hash verifies;
11. the summary never counts a collection or a claim as revenue, and `confirmed = applied + unallocated`;
12. a suspended agent keeps history but cannot submit.

---

## 11. Limitations

1. **No browser verification.** The panels compile, build and bundle, and their endpoints are exercised end-to-end over HTTP, but nobody has looked at them on a screen. Screen-level and mobile checks remain outstanding.
2. **No MySQL/MariaDB execution.** The DDL and the `migrate.php` additions are written but unexecuted. See the server-testing procedure in `FINAL_INTEGRATION_REPORT.md` §13.
3. **Partial confirmation is not modelled.** A remittance is confirmed for its full claimed amount; if only part arrived, the correct action is reject-and-resubmit or a documented reversal. This is deliberate (simpler invariant) but is a business decision worth revisiting.
4. **No receipt document is issued** for a confirmed remittance. §3.7 says receipts only follow authorised confirmation; the existing receipt feature remains separate and unchanged, and no new receipt type was added.
5. **Unmatched funds have no allocation UI for later application** beyond re-opening the obligation list for a *new* claim — held money is visible but not re-appliable after the fact. Documented, not hidden.
6. **Rental commission legal/tax treatment is unreviewed.** The workflow records agreements; it does not assert that Goodlucks is entitled to a commission under Ghanaian law.
7. **`is_landlord_verified` still defaults to 1** on legacy rows, so an old property can display "Reviewed by Goodlucks" without a recorded check. The wording is now honest about what review means, but the underlying flag still needs a data decision.
8. **No notification to finance by email** — submissions raise an in-app notification for administrators holding `financeConfirm` only.
