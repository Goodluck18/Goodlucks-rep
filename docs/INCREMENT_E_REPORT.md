# Increment E — Fee Policies and Agent Tiers

Branch: `arena/a67485fb-goodlucks-rep` (working tree, uncommitted)
Scope: Increment E only. Increments A–D are preserved; Increment F was not started.

---

## 0. What this increment is, and what it deliberately is not

Increment B built a ledger in which an agent's collected viewing fee is **not** Goodlucks revenue: the
Goodlucks share stays `NULL` until a person records an explicit agreement, and revenue is recognised only
from a remittance. Increment E answers the question that ledger left open — *who is entitled to what, and
who is allowed to decide it* — without answering it by accident.

It adds three things:

1. **Two agent tiers, derived not stored.** `standard` and `professional`, worked out from the Increment D
   verification records every time they are read. A tier is a fact about verification; it is never a field
   an agent, an admin or an API client can set.
2. **Fee policies as governed artefacts.** A policy has a name, a category, a tier, a calculation method,
   shares that must total 100%, an effective window, a lifecycle (`draft → pending_approval → approved →
   active`, with `rejected` and `deactivated` off-ramps) and an append-only event trail. Drafting and
   approving are separate capabilities, and the same administrator can never do both.
3. **Immutable transaction snapshots.** When an authorised administrator applies an approved, active,
   in-window policy to an existing viewing-fee record, the exact terms are frozen into
   `fee_policy_snapshots` with a SHA-256 hash of the canonical payload. Later tier changes, policy edits,
   expiry or withdrawal never re-price that record.

What it does **not** do: it does not activate the proposed 60/40 or 70/30 arrangements, does not compute a
share automatically, does not create a single approved policy row, does not mark any money received, does
not run a remittance workflow, and does not create a viewing lifecycle, appointments, receipts or
tenancies.

---

## 1. The tier system

### 1.1 Definitions (`php-backend/lib/fee_policies.php`)

| Tier key | Label | Requirement |
| --- | --- | --- |
| `standard` | Standard agent | Account registered **and** the identity verification decision is `approved`. |
| `professional` | Professionally authorised agent | The above **and** the professional-authorisation decision is `approved`. |

`agent_tier_state($userId)` is the single source of truth. It reads `identity_verifications` and
`professional_authorisations` and returns:

```
userId, tier, tierLabel,
eligibleStandard, eligibleProfessional,
identityStatus, identityApproved,
professionalStoredStatus, professionalStatus, professionalSubmitted,
professionalApproved, professionalExpired, professionalRejected,
note
```

Everything disqualifying is explicit: `expired`, `rejected`, `resubmission_required`, `pending_review`,
`under_review`, `not_submitted` never yield eligibility for their tier. A stored `approved` row whose
`expires_at` has passed is reported as `expired` — the decision is not rewritten, it simply stops counting.

### 1.2 Where the tier surfaces

- `shape_agent_profile()` in `lib/repository.php` now derives `identityVerified`,
  `professionalAuthorisationVerified`, `agentTier`, `agentTierLabel` and `tierEligibility{…}`. Before this
  increment those two booleans were hardcoded `false`.
- `verification_summary()` returns `agentTier` (agents only, `null` for landlords).
- New route `GET /api/admin/agents/{id}/tier`.
- The agent's own verification panel shows the tier and states that it is calculated, cannot be set, and
  never changes a fee that was already priced.
- The admin agent list shows a tier badge plus the underlying verification statuses, with a line saying the
  account status does not set the tier.

### 1.3 Rules that hold

- Registering, uploading a licence, or getting a document reviewed does not upgrade anyone. Only the
  reviewer decision does, and only the professional decision reaches the higher tier.
- An approved identity alone is a Standard agent. That is asserted, not assumed (test 8/9).
- Losing or expiring professional authorisation immediately removes *future* higher-tier eligibility; no
  historical record is touched (test 10).
- No historical viewing-fee record carries a mutable tier. Policy-priced fees store
  `agent_tier_at_snapshot` and the full snapshot; manual agreements have no tier at all.

---

## 2. Fee-policy architecture

### 2.1 Vocabulary (all server-side constants, not scattered `if`s)

```
AGENT_TIERS                  standard | professional
FEE_POLICY_CATEGORIES        viewing_fee | rental_commission | other_service_fee
FEE_POLICY_CALCULATION_METHODS  percentage | fixed
FEE_POLICY_STATUSES          draft | pending_approval | approved | active | rejected | deactivated
                             (+ derived `expired`, never stored)
FEE_POLICY_CURRENCY          GHS
```

The category vocabulary already contains `rental_commission` and `other_service_fee`, and the calculation
method already contains `fixed`, so later increments can use them without a schema rewrite. Neither is
wired to anything today: nothing computes a rental commission, and no fixed-fee policy exists.

### 2.2 Validation (`validate_fee_policy_input()`)

Rejected with HTTP 422 and a `fields` map:

- name shorter than 3 characters; unknown category, tier or method; non-`GHS` currency;
- percentages below 0 or above 100;
- percentages that do not sum to exactly 100 (tolerance 0.005, so `99.999` is refused);
- fixed amounts below 0, or a fixed total of 0;
- missing `effectiveFrom`, or `effectiveTo` earlier than `effectiveFrom`.

There is no "negative means refund" convention and no silent rounding of an invalid split. The split
rounding that does exist happens only at snapshot time and sends the remainder to the agent
(`fee_policy_split()`).

### 2.3 Lifecycle

| Action | Capability | Guard |
| --- | --- | --- |
| Create draft (v1) | manager | validation |
| Edit | manager | **draft only** — an approved policy is history |
| Submit for approval | manager | draft only |
| Approve | approver | `pending_approval` only, approver ≠ creator, note required |
| Reject | approver | `pending_approval` only, reason required |
| Activate | approver | `approved` + start date reached + not past end date + no overlapping active policy for the same tier + category + currency (409 with `fields.conflictPolicyId`) |
| Deactivate | approver | `active` only, reason required; snapshots untouched |

Every transition also appends to `fee_policy_events` (append-only: action, from/to status, note, actor id,
actor name, timestamp). Version numbers increment when a policy is replaced rather than edited
(`supersedes_policy_id`), so a version is never silently mutated.

---

## 3. Creation and approval permissions

Two capabilities on `users`, both defaulting to `0` for every existing and future administrator:

```
can_manage_fee_policies    create / edit drafts / submit
can_approve_fee_policies   approve / reject / activate / deactivate
```

They are granted only from the server console:

```
php php-backend/grant_finance.php --email=admin@example.com --manage=1
php php-backend/grant_finance.php --email=admin@example.com --approve=1
php php-backend/grant_finance.php --email=admin@example.com --manage=0 --approve=0
php php-backend/grant_finance.php --list
```

Each run is audited as `finance.capability_changed`, and an administrator cannot grant themselves
anything through the web application because no route exists for it.

`is_fee_policy_manager()` / `is_fee_policy_approver()` require `role = 'admin'` **and** the column.
`require_fee_policy_manager()` / `require_fee_policy_approver()` return 403 with a plain message. Reading
policies needs either capability; a plain administrator sees a locked panel that explains why, and the
endpoints refuse them independently of the UI.

Separation of duties is enforced on the server, not merely suggested in the UI: approving a policy you
created returns 422 (`An administrator cannot approve a policy they created`). The tests use three
distinct accounts (manager, approver, plain admin) so this is exercised, not assumed.

---

## 4. Status of the 60/40 and 70/30 arrangements

**Inactive. Provisional. Shown as proposals and nothing else.**

- The percentages live as display constants (`PROPOSED_STANDARD_AGENT_SHARE_PCT = 60`,
  `PROPOSED_STANDARD_GOODLUCKS_SHARE_PCT = 40`, `PROPOSED_VERIFIED_AGENT_SHARE_PCT = 70`,
  `PROPOSED_VERIFIED_GOODLUCKS_SHARE_PCT = 30`) and are read only by `fee_policy_overview()`.
- The overview returns them under `proposed[]` with `status: 'provisional'` and
  `appliedToCalculations: false`, and the whole response carries `appliedToCalculations: false`.
- **No seed row exists.** `migrate.php` can only `CREATE TABLE` and `ALTER TABLE … ADD COLUMN`; it cannot
  insert a row, and nothing was added to bypass that. The database ships with zero policies.
- No code path turns a proposal into a split. `fee_policy_split()` only runs for a policy row that has been
  approved, activated, and explicitly applied by an approver.
- The UI labels the block "Proposed arrangements — inactive" and says the numbers are never used in a
  calculation and leave no database record.
- Test 4 asserts both proposals remain `provisional`, `appliedToCalculations === false`, and that creating
  a policy still leaves `counts.active === 0`.

Activating 60/40 or 70/30 now requires an owner decision, then a manager drafting, an approver approving,
and an approver activating after the effective date. That is a deliberate product decision left to the
owner, not to this increment.

---

## 5. How snapshots preserve historical terms

`apply_fee_policy_to_viewing_fee()` runs inside `db_transaction()` and refuses unless **all** of the
following hold:

- the record exists, is not `void` or `disputed`, has no share recorded yet (`share_basis = 'not_set'`), and
  has no snapshot already;
- the record is linked to an agent (`agent_user_id`), because a tier is a property of an agent account;
- the policy is `active`, `approved`, its category is `viewing_fee`, its tier equals the agent's *current*
  tier, and today is inside `[effective_from, effective_to]`;
- the Goodlucks entitlement does not exceed what has already been remitted (a policy can never make
  Goodlucks "owed" less than it has received, which would imply a refund path that does not exist yet).

On success it writes one `fee_policy_snapshots` row and updates the record with
`share_basis = 'policy_snapshot'`, `policy_id`, `policy_snapshot_id`, `agent_tier_at_snapshot`,
`goodlucks_share_ghs`, `agent_share_ghs`. The snapshot stores:

policy id · policy name · policy version · policy category · agent tier at the time · subject user ·
transaction type + id · currency · calculation method · fee total · agent share % · Goodlucks share % ·
fixed amounts (if any) · agent entitlement · Goodlucks entitlement · policy status at use · policy
effective from/to · who approved the policy and when · transaction timestamp · snapshot timestamp · who
applied it · `snapshot_hash`.

`snapshot_hash` is `sha256` of the key-sorted canonical JSON of the priced fields. `shape_fee_snapshot()`
recomputes it on **every read** and returns `integrityOk`; the UI shows a red warning if it ever fails.

Immutability is structural, not a promise:

- `fee_policy_snapshots` has a unique index on `(transaction_type, transaction_id)` — one snapshot per
  transaction, ever;
- no route updates or deletes a snapshot (asserted: `PATCH`/`DELETE` on a snapshot id return 404);
- a second apply is refused, including with a different policy (422);
- the snapshot copies the policy's values rather than referencing them, so editing the policy row (which is
  itself refused once approved) could not change a frozen record even if it happened;
- deactivating, expiring, or losing the authorisation that produced a snapshot changes nothing.

Test 9 hashes the snapshot, changes things around it, and re-reads; test 10 takes the agent through a
licence lapse and the policy through deactivation and shows the frozen terms are byte-identical.

---

## 6. Integration with the viewing-fee ledger (Increment B)

- Existing records are untouched: every pre-existing fee keeps `share_basis = 'not_set'` and
  `goodlucks_share_ghs = NULL` until a person acts. A backdated fee is never re-priced by a policy whose
  window happens to contain its date — applying a policy is always an explicit admin act (test 6/7).
- Manual agreements remain visually and structurally distinct: `snapshotKind` is `manual_agreement` vs
  `policy`, and only the policy path has a snapshot. Test 11 asserts a manual agreement survives every
  policy event unchanged.
- Agent collections are still not revenue. `fee_total_ghs` is what the agent collected; the Goodlucks
  **entitlement** is what the policy (or the agreement) says Goodlucks is owed. Revenue is still counted
  only from `fee_remittances`. Test 12 applies a policy and asserts totals stay zero.
- Nothing here introduces a remittance workflow, a refund path, a receipt or a settlement. Increment G owns
  remittance.

---

## 7. Database changes and migration details

Additive only. Three files are kept in parity: `php-backend/database.sql` (MySQL),
`php-backend/schema.sqlite.sql` (SQLite), `php-backend/migrate.php` (existing MySQL installs).

### 7.1 `users` — 2 columns

| Column | Type (MySQL) | Default |
| --- | --- | --- |
| `can_manage_fee_policies` | `TINYINT(1) NOT NULL` | `0` |
| `can_approve_fee_policies` | `TINYINT(1) NOT NULL` | `0` |

### 7.2 `fee_policies` — extended (the table itself came from Increment B)

Added: `name`, `description`, `category`, `calculation_method`, `currency`, `agent_share_fixed_ghs`,
`goodlucks_share_fixed_ghs`, `version`, `supersedes_policy_id`, `effective_to`, `created_by`,
`submitted_by`, `submitted_at`, `rejected_by`, `rejected_at`, `rejection_reason`, `activated_by`,
`activated_at`, `deactivated_by`, `deactivated_at`, `deactivation_reason`, `updated_at`.
Existing rows keep their stored values; a legacy pre-E row cannot price anything because it has no
approval evidence and no `approved_by`.

Indexes: `idx_fee_policy_status (status, tier)`,
`idx_fee_policy_tier_category (tier, category, status)`, `idx_fee_policy_dates (effective_from,
effective_to)`.

### 7.3 `fee_policy_snapshots` (new)

25 columns as listed in §5. Indexes: `idx_fps_transaction` **unique** on
`(transaction_type, transaction_id)`, `idx_fps_policy (policy_id)`, `idx_fps_subject (subject_user_id)`.
Rows are never updated or deleted by application code.

### 7.4 `fee_policy_events` (new, append-only)

`id`, `policy_id`, `action`, `from_status`, `to_status`, `note`, `actor_id`, `actor_name`, `created_at`.
Index `idx_fpe_policy (policy_id, created_at)`.

### 7.5 `viewing_fee_records` — 3 columns

`policy_id`, `policy_snapshot_id`, `agent_tier_at_snapshot` (all nullable; existing rows stay `NULL`).

### 7.6 Migration tool limits, stated plainly

`migrate.php` performs `CREATE TABLE` and `ALTER TABLE … ADD COLUMN` only, is dry-run by default, and
applies transactionally with `--apply`. **It cannot insert data rows, and it was not extended to.** Two
consequences:

1. No approved policy, and nothing resembling one, can be seeded. The 60/40 and 70/30 proposal constants
   exist only in code and appear only as labelled read-only proposals.
2. **Required administrative setup** (documented rather than automated):
   1. apply the migration (`php php-backend/migrate.php --apply`) — this creates empty tables and columns;
   2. grant `can_manage_fee_policies` to the administrator(s) who will draft policies;
   3. grant `can_approve_fee_policies` to a *different* administrator;
   4. have the drafter create the policy, submit it, and have the approver approve it;
   5. only then, once the effective date has arrived and the policy is activated, may an approver apply it
      to an individual fee record.

Rollback is the reverse of the above: the new tables and columns are additive, so older code keeps working
with them present; dropping them is a destructive operation that must be scheduled, never improvised.

**MySQL testing status:** the MySQL DDL is written and reviewed, but there is no MySQL server in this
environment, so it has **not** been executed. Per §10 of the brief, MySQL verification is deferred until
after Increment G. SQLite is what the whole test suite runs on.

---

## 8. Financial integrity and audit protections

| Requirement | How it is enforced |
| --- | --- |
| Unauthorised creation | `require_fee_policy_manager()`, 403, tested against a plain admin and an approver |
| Unauthorised approval/activation | `require_fee_policy_approver()`, 403, tested against a manager and a plain admin (including `activate` specifically) |
| Self-approval | 422 when approver id equals creator id |
| Agents changing their own tier | No route accepts a tier from a client; the tier is computed from verification rows, and agents have no verification-decision route (Increment D) |
| Agents reading other agents' finances | Ledger and policy endpoints are admin-only; test 13 asserts an agent gets 403 and that a second agent cannot read the first's records |
| Immutable snapshots | Unique index, no update/delete route, hash verified on read, second apply refused |
| Audit trail | `fee_policy.created|updated|submitted|approved|rejected|activated|deactivated`, `viewing_fee.policy_applied`, `viewing_fee.agent_linked`, plus the existing `finance.capability_changed`; each records the responsible admin |
| No partial financial writes | `apply_fee_policy_to_viewing_fee()` runs inside `db_transaction()`; the only other multi-write path (policy transition + event) is also wrapped |
| Duplicate overlapping active policies | Activation refuses with 409 and `fields.conflictPolicyId` when another active policy covers the same tier + category + currency and the windows intersect |
| No sensitive admin data for ordinary users | Every policy route and `apply-policy` are admin + capability gated; the viewing-fee ledger stays admin-only exactly as Increment B left it; agents get 403 on all of it |
| No invented financial records | Nothing marks a fee paid, remitted, confirmed or receipted as a side effect of any policy action |

---

## 9. API surface added

| Method | Path | Capability |
| --- | --- | --- |
| GET | `/api/admin/fee-policies` | manage or approve |
| POST | `/api/admin/fee-policies` | manage |
| GET | `/api/admin/fee-policies/{id}` | manage or approve |
| PATCH | `/api/admin/fee-policies/{id}` | manage (draft only) |
| POST | `/api/admin/fee-policies/{id}/submit` | manage |
| POST | `/api/admin/fee-policies/{id}/approve` | approve |
| POST | `/api/admin/fee-policies/{id}/reject` | approve |
| POST | `/api/admin/fee-policies/{id}/activate` | approve |
| POST | `/api/admin/fee-policies/{id}/deactivate` | approve |
| POST | `/api/admin/viewing-fees/{id}/apply-policy` | approve |
| POST | `/api/admin/viewing-fees/{id}/agent` | manage or approve |
| GET | `/api/admin/agents/{id}/tier` | admin |

Error shapes are consistent: `422` carries `fields` keyed by input name; `409` on overlap carries
`fields.conflictPolicyId`; `403` carries a plain-language message rather than a stack trace.

---

## 10. Tests and actual results

Command: `npm run test:api`

```
# tests 142
# suites 27
# pass 142
# fail 0
```

Increment E contributes 14 tests in the suite `Fee policies & agent tiers (Increment E)`:

1. `a manager can draft a fee policy, and a draft is not approved or applicable`
2. `unauthorised users cannot create, edit, approve or activate policies`
3. `approval needs the approver capability, and the creator can never approve their own policy`
4. `the proposed 60/40 and 70/30 arrangements stay inactive and unapplied`
5. `invalid percentage and amount combinations are rejected`
6. `a policy cannot be applied before its effective date`
7. `expired, deactivated and unapproved policies cannot price a transaction`
8. `a standard agent cannot qualify for the higher tier without a professional authorisation`
9. `applying an approved policy freezes the exact terms in an immutable snapshot`
10. `historical snapshots survive a tier change and policy deactivation`
11. `existing manual agreements are never re-priced by a policy`
12. `a policy entitlement is money owed, never money received`
13. `every policy action is audited, and agents cannot see each other financially`
14. `Increments A, B, C and D still behave`

Acceptance-criteria coverage (§12 of the brief):

| # | Criterion | Test(s) |
| --- | --- | --- |
| 1 | Authorised users can create drafts | 1 |
| 2 | Unauthorised cannot create/modify | 2 |
| 3 | Unauthorised cannot approve/activate | 2, 3 |
| 4 | 60/40 and 70/30 remain inactive | 4 |
| 5 | Invalid percentage combinations rejected | 5 |
| 6 | Not applicable before the effective date | 6 |
| 7 | Expired/inactive policies not applicable | 7 |
| 8 | Standard agent cannot reach the higher tier | 8 |
| 9 | Identity approval alone does not qualify | 8 |
| 10 | Expired authorisation removes future eligibility | 8, 10 |
| 11 | Snapshots unchanged on tier change | 10 |
| 12 | Snapshots unchanged on policy edit/deactivation | 3 (approved edit refused), 10 |
| 13 | Existing manual-agreement records intact | 11 |
| 14 | Agent collections not counted as revenue | 12 |
| 15 | Creation/approval/activation audited | 13 |
| 16 | A/B/C/D still pass | 14 + the whole suite |

Other checks actually run in this increment:

| Check | Command | Result |
| --- | --- | --- |
| Type-check | `npx tsc --noEmit` (with `@types/react@19`, `@types/react-dom@19` installed `--no-save`) | exit 0, no output |
| Production build | `npm run build` (final run after the last front-end edit) | `✓ built in 4.41s`, `dist/server.cjs 3.9kb` |
| PHP syntax | `php-wasm-cli -l` over all 36 `.php` files in `php-backend/`, `tests/`, `scripts/` | no syntax errors in any file |
| Route wiring smoke | `npm run dev`, then `GET /` → 200, `GET /api/admin/fee-policies` unauthenticated → 401, authenticated as the demo admin → 403 with the capability message | as expected |
| MySQL DDL | not run — no MySQL server available | **unverified**, deferred per §10 |

No test was reported as passing without being run. The two failures encountered during development were
fixed rather than skipped: an Increment B assertion still used the legacy tier vocabulary `verified`
(now `professional`), and a rate limit of 12 viewing requests per hour throttled the new suite (now
`VIEWING_RATE_LIMIT_PER_HOUR`, default 12, raised only in the test environment).

---

## 11. Front end

Deliberately incremental — existing screens were extended, not redesigned.

- **New tab "Fee Policies"** in the existing admin console, beside Agent Accounts. Shows the proposals as
  inactive, the caller's own capabilities, counts, the policy list with status chips, a draft form
  (percentage or fixed), and per-policy actions limited to what that administrator may actually do.
  History opens in a modal showing the append-only event trail.
- **Accounts without either capability see a locked panel** naming the capability and the CLI command,
  rather than an empty table.
- **Fee ledger (`AdminFeeLedger.tsx`)**: shows "policy" vs "agreed by staff" under the Goodlucks share;
  adds *Link agent* when a fee has no agent account, and *Apply policy* only when the server says the
  record is eligible and the caller can approve. A policy-priced row expands to show the frozen terms,
  entitlements, the approval reference and the integrity result.
- **Agent verification panel**: shows the derived tier and the two eligibility lines, with a note that the
  tier is not settable and never rewrites history.
- **Admin agent list**: tier badge plus the underlying identity/professional statuses.

No colours, layout system or navigation outside the admin console were altered; no page was rebuilt.

---

## 12. Files created and modified

Created:

- `php-backend/lib/fee_policies.php` — tiers, capabilities, validation, lifecycle, snapshots, overview
- `php-backend/grant_finance.php` — CLI capability grant/revoke/list (audited)
- `tests/finance-fixtures.php` — test-only time travel (backdates fee records / policy windows); never
  called by application code
- `src/components/AdminFeePolicies.tsx` — policy administration screen
- `docs/INCREMENT_E_REPORT.md` — this report

Modified:

- `php-backend/config.php` — loads `fee_policies.php`; adds `VIEWING_RATE_LIMIT_PER_HOUR`
- `php-backend/lib/db.php` — `db_transaction(callable)`
- `php-backend/lib/auth.php` — session/user payload carries the two financial capabilities
- `php-backend/lib/verification.php` — `agentTier` in the verification summary
- `php-backend/lib/repository.php` — derived tier in `shape_agent_profile()`, ledger shaping additions
  (`snapshotKind`, `policyId`, `agentTierAtSnapshot`, `policySnapshot`, `policyApplicability`), ledger
  capability guard
- `php-backend/lib/api.php` — 12 routes and handlers (§9), audit calls
- `php-backend/database.sql`, `php-backend/schema.sqlite.sql`, `php-backend/migrate.php` — E DDL in parity
- `tests/api.test.mjs` — new E suite; legacy tier vocabulary in the B suite corrected to `professional`
- `src/types.ts` — `AgentTier`, `AgentTierState`, `FeePolicy`, `FeePolicyEvent`, `FeePolicyOverview`,
  `FeePolicySnapshot`, `FeePolicyApplicability`, `FeePolicyInput`; ledger/capability/agent-profile fields
- `src/services/apiService.ts` — 12 client methods
- `src/components/AdminDashboard.tsx` — the Fee Policies tab
- `src/components/AdminFeeLedger.tsx` — pricing basis, link agent, apply policy, frozen-terms panel
- `src/components/VerificationPanel.tsx` — agent tier card
- `src/components/AdminAgentAccounts.tsx` — tier badge and eligibility line

`AdminAgentAccounts.tsx`, `AdminFeeLedger.tsx` and `VerificationPanel.tsx` are still untracked files from
Increment D (they were added there and never committed); this increment edited them in place. Nothing from
Increments A–D was reverted, and no working-tree change was discarded.

---

## 13. Remaining limitations and dependencies for Increment F

1. **The 60/40 and 70/30 split is not decided.** Activating either requires the owner to say so; the
   platform now supports doing it safely (draft → approve → activate after the effective date), and that is
   all it does.
2. **No automatic pricing.** Every policy application is a deliberate administrator act on one fee record.
   Automatic pricing at the moment a fee is reported is a product decision (and would need a rule for fees
   reported late), not an implementation detail.
3. **No remittance, refund or settlement flow.** Goodlucks revenue still depends entirely on Increment G.
   A policy asserts an entitlement; only a remittance moves money.
4. **Fixed-fee policies are modelled but unused.** `calculation_method = 'fixed'` validates and snapshots,
   but no fee category currently uses it; the UI exposes it so the choice does not need a migration later.
5. **Policy priority is undefined.** Overlapping active policies for the same tier + category are blocked
   outright rather than ordered by a priority rule. If Goodlucks later needs seasonal or promotional
   policies, a priority field and a documented precedence rule will be needed.
6. **Versioning is manual.** `version` and `supersedes_policy_id` exist so a replacement can be created
   without editing an approved policy, but nothing auto-creates a successor when one is deactivated.
7. **Rental-commission and other-service categories are empty scaffolding.** No collection, settlement or
   calculation exists for them.
8. **MySQL is unverified** (§7.6). Every schema change was written for both engines and kept in parity, but
   only SQLite has been executed. This must be verified before any MySQL deployment, and per the brief that
   verification is deferred until after Increment G.
9. **Increment F dependencies:** the agent-led viewing lifecycle needs to know *which* agent owns a viewing
   before a fee can be linked automatically; today linking is manual. Scheduling also determines the
   "transaction timestamp" that snapshots record, so F should pass the viewing's own timestamp rather than
   the moment a record was edited.
10. **No notification is sent when a policy is approved, refused, activated or deactivated.** The audit
    trail and the policy history record it; emailing the parties is deliberately out of scope here.

---

## 14. Confirmations

- **No production database was accessed or modified.** All work ran against the local SQLite development
  database and per-run temporary test databases.
- **No deployment was performed.**
- **Nothing was committed or pushed.** The branch `arena/a67485fb-goodlucks-rep` carries the changes in the
  working tree, with Increments A–D intact.
- **No fee policy exists in the database as a result of this work**, approved or otherwise; no financial
  transaction was invented, confirmed or receipted.
- **Increment F was not started.**
