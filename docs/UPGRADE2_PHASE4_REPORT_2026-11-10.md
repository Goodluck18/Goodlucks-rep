# Upgrade 2 — Phase 4 Report (A9: fee policies and provider tiers)

**Date:** 2026-11-10
**Branch:** `arena/1dbf260c-goodlucks-rep`
**Scope:** Phase 4 of the approved Phase 0 audit — complete A9 (fee policies and
agent/provider tiers), on top of the authority model delivered in Phase 1.

---

## 1. What Phase 4 had to finish

From the Phase 0 audit (§6.1 and §6.2, row A9) and the Phase 4 acceptance line:

> "Every policy verb works for the primary admin, tiers are visible per agent,
> and no historical transaction changes when a policy activates."

Inspection at the start of the phase found a mature policy engine already in
place: draft → pending approval → approved → active → deactivated/rejected,
snapshot-based pricing, an append-only `fee_policy_events` trail, capability
gating (`can_manage_fee_policies` / `can_approve_fee_policies`), the primary
administrator's self-approval exception, and `GET /admin/agents/:id/tier`.
There was **no delete verb**, the trail recorded *that* something changed but not
*what*, and there was **no way to see every agent's tier** in one place.

Phase 4 therefore finished exactly those gaps, and re-proved the surrounding
rules end to end.

## 2. Work done

### 2.1 The trail now records old → new values

- `fee_policy_events.changes_json` added (nullable) in **both** schema files and
  in `migrate.php` as an additive column — existing events keep `NULL`, which the
  console reads as "no field changes recorded". No historical row is rewritten.
- `record_fee_policy_event()` accepts an optional `$changes` payload.
- `fee_policy_changes_between()` diffs the shaped before/after policy across the
  twelve tracked fields (name, description, tier, category, method, both
  percentages, both fixed amounts, both effective dates, internal notes), and
  only reports fields that actually changed. Numeric columns from PDO are
  compared numerically so `"60"` and `60.0` are not reported as an edit.
- A save that changes nothing writes the note *"Draft saved without changing any
  value."* with an empty change list, rather than inventing an edit.
- `fee_policy_event_changes()` decodes the payload into
  `{field, label, from, to}` entries for the API.

### 2.2 Deleting a policy, without deleting history

- `DELETE /api/admin/fee-policies/:id` — gated by `require_fee_policy_manager()`
  and rate-limited on the same `fee-policy-write` budget as drafting.
- `delete_fee_policy()` allows only a **draft** that never priced a transaction
  and never reached a decision. It checks usage (`fee_policy_snapshots`),
  lifecycle events (`submitted|approved|activated|deactivated`) and then deletes
  with `... AND status = 'draft'` so a concurrent transition cannot slip through.
- Refusals are `409` with `code: "policy_is_history"` and a message that names
  the correct action ("deactivate it instead…"). A missing policy is `404`; a
  caller without the capability is `403`.
- Every deletion writes `audit_log('fee_policy.deleted', …)` with the policy's
  id, name, tier, category, status and the operator's reason **before** the rows
  are removed.

### 2.3 Provider tiers, visible and never assigned

- `GET /api/admin/agent-tiers` (fee-policy staff) returns every agent with:
  name, email, agency, account status, listing authorisation, `tier`,
  `tierLabel`, `commissionTier`, `commissionPercent` / `goodlucksPercent`,
  `commissionEligible`, identity and professional status.
- Counts: `standard`, `professional`, `no_commission_tier`, `total`; plus the
  two commission rules (60/40 and 70/30) read from `AGENT_TIER_COMMISSION`, so
  the screen cannot drift from the engine.
- `derived: true` and a note saying a tier follows **approved verification**, not
  a dropdown, and naming where to change it (the audited verification decision).
- There is deliberately **no** endpoint that assigns a tier; the suite proves
  `POST`/`PATCH` on the collection, on a member, and `POST /agents/:id/tier` all
  fail while `GET` succeeds.

### 2.4 Console

- `AdminAgentTiers.tsx` (new): tier overview with counts, agent search, per-agent
  identity/professional status and honest percentages, stating that a tier is
  earned by verification.
- `AdminFeePolicies.tsx`: delete flow (draft only) with a required reason and a
  `409` message rendered verbatim; history now shows humanised action labels
  (including "Approved by its own creator (primary administrator)") and a
  field-by-field `old → new` list; the tier panel is mounted on the same screen;
  the intro copy no longer claims a second administrator is *always* required
  (the primary administrator exception is stated).
- `apiService.deleteFeePolicy()`, `apiService.adminAgentTiers()`, and the types
  `FeePolicyEventChange`, `AdminAgentTiers`, `AdminAgentTierRow`.

## 3. Files changed

| File | Change |
|---|---|
| `php-backend/database.sql` | `changes_json` on `fee_policy_events` |
| `php-backend/schema.sqlite.sql` | same column, SQLite |
| `php-backend/migrate.php` | additive migration entry for the column |
| `php-backend/lib/fee_policies.php` | change diffing/decoding, usage check, guarded `delete_fee_policy()`, `admin_agent_tier_overview()` |
| `php-backend/lib/api.php` | `DELETE /admin/fee-policies/:id`, `GET /admin/agent-tiers` |
| `src/components/AdminAgentTiers.tsx` | **new** tier panel |
| `src/components/AdminFeePolicies.tsx` | delete flow, readable history, tier panel, corrected copy |
| `src/services/apiService.ts` | `deleteFeePolicy`, `adminAgentTiers` |
| `src/types.ts` | `FeePolicyEventChange`, `AdminAgentTiers`, `AdminAgentTierRow`, `changes` on `FeePolicyEvent` |
| `tests/fee-policies-phase4.test.mjs` | **new** — 12 behavioural tests |
| `tests/admin-console-phase4.test.mts` | **new** — 12 invariant tests |
| `package.json` | `test:fee-policies-phase4`, `test:admin-console-phase4` |
| `docs/UPGRADE2_RECOVERY_REPORT_2026-11-10.md` | session-recovery record |

## 4. Test results (all executed this session)

| Suite | Result |
|---|---|
| `npm run test:api` (11 files, includes Increment E fee-policy and Increment F viewing suites) | **345 / 345 pass, 0 fail**, EXIT=0 |
| `npm run test:fee-policies-phase4` | **12 / 12 pass, 0 fail** |
| `npm run test:admin-console-phase4` | **12 / 12 pass, 0 fail** |
| `npm run test:user-management` | 15 / 15 |
| `npm run test:bulk-email` | 14 / 14 |
| `npm run test:admin-console-phase3` | 11 / 11 |
| `node --test tests/primary-admin.test.mjs` | 16 / 16 |
| `node --test tests/migration.test.mjs` | 14 / 14 |
| `navigation` 61 · `routing` 50 · `blog` 45 · `sharing` 36 · `property` 23 · `uploads` 20 · `responsive` 18 · `blog-html` 16 · `admin-console` 16 · `design` 14 · `access` 13 · `content` 4 · `email-footer` 3 | all fail 0 |
| `tsc --noEmit` | 0 errors |
| `npm run build` | ✓ built (2156 modules) |
| PHP lint (`php-wasm-cli -l`) on `fee_policies.php`, `api.php`, `migrate.php` | no syntax errors |

### What the Phase 4 tests actually prove

`tests/fee-policies-phase4.test.mjs` drives the real API on a fresh SQLite
database:

1. **Delete** — a draft is deleted and then 404s; a submitted policy is refused
   with `409 policy_is_history` and its trail survives; an approved+activated
   policy is refused with a message naming deactivation, and deactivating it
   still does not make it deletable; an administrator without the capability gets
   `403` and the policy remains.
2. **History** — changing 60/40 to 65/35 records `agentSharePercent 60 → 65`,
   `goodlucksSharePercent 40 → 35` and the renamed title, while unchanged fields
   are absent; an unchanged save records no change and says so.
3. **Tiers** — the overview lists a verified professional agent at 70/30 and an
   unverified agent as standard with no commission; counts and rules agree; no
   write endpoint exists; the endpoint is capability-gated.
4. **Primary administrator** — creates, submits, approves and activates one
   policy from one account, the trail records `approved_by_creator`, and an
   ordinary administrator who holds *both* capabilities still gets `422` when
   approving its own draft.
5. **Acceptance, historical money** — a real viewing fee (GH₵ 200) is recorded
   through the normal flow, linked to the professional agent, and priced by an
   active policy (70/30). Every `fee_policy_snapshots`, `fee_remittances`,
   `rental_commissions` and `viewing_fee_records` row is then read **byte-exact
   from the database**, a second policy is approved and activated, and all four
   result sets are identical. Re-pricing the frozen fee with the new policy is
   refused.

`tests/admin-console-phase4.test.mts` (12 tests) pins the invariants a refactor
could silently remove: the column exists in both engines and the migration; the
diff/record/handling functions are wired; the delete handler is capability-gated
and its SQL still conditional; the refusal code exists; **no** tier-assignment
route, client call or UI control exists; the console renders changes and offers
delete for drafts only.

## 5. Business rules checked in this phase

- Primary administrator authority unchanged: self-approval is recorded as such,
  and remains exclusive to `is_primary_admin` (§3.1/§3.2).
- Commission tiers remain derived from approved verification; no hand assignment
  path was added, so a tier still cannot be bought or edited into place.
- Historical records preserved: policies that reached a decision cannot be
  deleted; snapshots, remittances and commissions are frozen; migrations are
  additive and nullable.
- Capability separation intact: drafting/editing/deleting needs the manager
  capability, approving/activating/deactivating needs the approver capability,
  and neither is granted by being an administrator.

## 6. Outstanding items

1. **Browser verification not performed** — no Chrome/Playwright in this
   environment. The tier panel, the delete dialog and the history change list are
   verified structurally (source tests) and through the API, not visually.
2. **Deletion is intentionally narrower than "delete anything".** Only drafts
   qualify. Rejected and approved policies stay as history and are deactivated or
   superseded instead. Making rejected policies deletable would erase the record
   of a decision, which the standing instruction forbids.
3. **MySQL not executed here.** The migration was linted and the SQLite path
   exercised end to end (`tests/migration.test.mjs` covers the plan's
   completeness); the MySQL `ALTER TABLE` should be run once against a staging
   copy before deployment (not authorised in this session).
4. **Tier changes still happen through verification.** This is deliberate; if the
   business later wants a manual override, it must be an audited correction with
   a reason, not a dropdown, and is not part of A9 as approved.
5. **`notes` and effective-date edits** appear in the change list by design; the
   console shows them as plain text.

## 7. Repository status

- Branch `arena/1dbf260c-goodlucks-rep`; Phase 4 committed on top of `7815628`
  and pushed to `origin`.
- `main` untouched at `ad2bb0a`; nothing deployed; no production database
  accessed; no secrets, uploads or databases committed.
- Next phase: **Phase 5 — B1–B6 and D1** (tenant experience, matching scores,
  curated properties, viewing lifecycle with tenant acceptance, contact
  disclosure workflow).
