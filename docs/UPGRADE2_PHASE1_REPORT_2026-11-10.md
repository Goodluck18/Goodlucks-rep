# GOODLUCKS HOMES — UPGRADE 2
## Phase 1 report — primary administrator authority + tenant-contact privacy fix

| | |
|---|---|
| **Phase** | 1 of 8 (implementation) |
| **Branch** | `arena/1dbf260c-goodlucks-rep` |
| **Base** | `ad2bb0a` (= `origin/main`, PR #18 merge) |
| **Report date** | 2026-11-10 |
| **Deployed** | **No.** Nothing was deployed and no production database was touched. |
| **`main` modified** | **No.** |
| **Scope guard** | Only the two approved items: §3.1/§3.2 primary administrator authority, and the urgent tenant-contact redaction. No other phase was started. |

---

## A. Completed work

### A.1 Primary administrator authority (§3.1, §3.2)

1. **One named account holds platform-wide administrative authority.** A new `users.is_primary_admin` flag marks exactly one account. It is **not** implied by `role = 'admin'`, is never set by any HTTP route, and is assigned only from the server console:

   ```
   php php-backend/assign_primary_admin.php --email=goodlucksonly@gmail.com --confirm=1
   ```
   The script refuses to run without `--confirm`, refuses a non-administrator target, never creates or promotes an account, keeps at most one holder (assigning a second account clears the first), can clear the flag (`--confirm=0`), lists holders (`--list`), and audits both assignment and clearing.

2. **Capabilities are a union for that account only.** `is_primary_admin()` short-circuits each existing predicate — fee-policy manage/approve, finance view/confirm, verification review, identity-document access, viewing corrections — so the primary administrator needs no separate grants. Every other administrator keeps exactly the flags they were granted; nothing was made permissive by default.

3. **Self-approval is allowed for that account and no other.** `approve_fee_policy()` now distinguishes creator = approver:
   - primary administrator → approved, `fee_policies.self_approved = 1`, `self_approved_at` stamped, event recorded as `approved_by_creator` with the phrase "Primary administrator self-approval" plus the approver's own note;
   - any other administrator → unchanged 422 "A policy must be approved by a different administrator from the one who created it."

4. **The console tells the truth about it.** `/auth/me` returns `isPrimaryAdmin` and a new `capabilities.feePolicySelfApprove` (true for the primary account only). The fee-policy screen shows either "this is the primary administrator account: it may approve a policy it created itself" or "a policy is approved by a different administrator", and a self-approved policy carries a visible badge with the reason.

5. **Nothing historical is rewritten.** Activation still writes its snapshot; no existing policy, remittance or commission row is updated by approval/activation. The suite asserts the activated policy's stored state is byte-identical before and after a later policy read, and that the ledger still reads.

### A.2 Urgent tenant-contact disclosure leak (first half of B6, pulled forward as instructed)

The audit found that `shape_viewing()` handed a tenant's **phone number and email address** to any agent or landlord who could read the viewing — before any approval. That is now closed at the serialisation boundary:

- **Withheld by default.** `viewing_for_viewer()` blanks `tenantPhone` and `tenantEmail` and adds `tenantContactVisible`, `tenantContactState` (`withheld_pending_approval` / `withheld` / `own_record` / `staff`) and a plain-language `tenantContactReason`.
- **Visible only where it must be.** The tenant on their own record, and Goodlucks staff (who arrange the viewing). Every other viewer — agent, landlord, stranger — gets nothing.
- **Every API path is covered**, not just the obvious one: the agent list, the landlord list, the tenant list, the detail view, the admin list/detail, and **all ten lifecycle-action responses** (`propose`, `confirm`, `reschedule`, `request-reschedule`, `cancel`, `complete`, `no-show`, `could-not-proceed`, correction, legacy update). A new endpoint cannot forget, because the payload helper is the only way a viewing leaves the API.
- **The agent screen explains the gap** instead of rendering a dangling separator: "Contact details are shared by Goodlucks only after an administrator approves it."
- **Emails:** the only message that carries tenant contact is the internal notification to the Goodlucks inbox (`rentals@goodlucks.co`), which is staff — verified by reading the actual queued bodies out of `email_outbox`. No email to an agent or landlord contains the phone number or address.
- **Guest confirmation:** the response to the person who just submitted the request echoes the details they typed in that same call (nothing is disclosed to them). Every subsequent read is gated.

The full request → review → approve → revoke workflow, with its admin queue and tenant notification, remains Phase 5 as agreed.

---

## B. Technical changes

### B.1 Files changed

| File | Change |
|---|---|
| `php-backend/database.sql` | `users.is_primary_admin`; `fee_policies.self_approved`, `self_approved_at` (MySQL DDL, commented) |
| `php-backend/schema.sqlite.sql` | The same three columns (SQLite mirror) |
| `php-backend/migrate.php` | The same three columns as additive, idempotent upgrades |
| `php-backend/lib/auth.php` | `is_primary_admin()`; `isPrimaryAdmin` exposed in `public_user()` |
| `php-backend/lib/fee_policies.php` | Capability union, `is_fee_policy_self_approver()`, the approval exception + recorded exception, `selfApproved`/`selfApprovedAt` in the shaped policy |
| `php-backend/lib/finance.php` | `finance_can_view` / `finance_can_confirm` union |
| `php-backend/lib/verification.php` | Reviewer + identity-document union |
| `php-backend/lib/viewings.php` | `viewing_tenant_contact_state()`, `viewing_for_viewer()`, viewing-corrector union |
| `php-backend/lib/api.php` | `viewing_payload()` / `viewing_payload_list()` applied to every viewing response |
| `php-backend/assign_primary_admin.php` | **New** CLI: assign / clear / list, with audit rows |
| `php-backend/grant_finance.php` | Header note corrected (the exception exists, and this script cannot create it) |
| `src/types.ts` | `User.isPrimaryAdmin`, `StaffCapabilities.feePolicySelfApprove`, `FeePolicy.selfApproved(At)`, `ViewingSchedule.tenantContact*` |
| `src/components/AdminFeePolicies.tsx` | Primary-account explanation, self-approval badge |
| `src/components/AgentViewingsPanel.tsx` | Withheld-contact notice instead of an empty field |
| `tests/primary-admin.test.mjs` | **New** — 16 tests |
| `tests/tenant-contact.test.mjs` | **New** — 10 tests |
| `tests/api.test.mjs` | One exact-shape assertion updated for the new capability key (see D.1) |
| `package.json` | The two new suites added to `test:api` |
| `docs/UPGRADE2_PHASE0_AUDIT_2026-11-10.md` | One sentence corrected: the CLI sets the flag only (no duplicated capability bits) |

### B.2 Endpoints

- **No new HTTP endpoints.** The `/api/auth/me` payload gains `isPrimaryAdmin` and `capabilities.feePolicySelfApprove`.
- **Every viewing endpoint keeps its contract**, with three added keys and two contact fields that are empty for agents/landlords.
- `POST /api/admin/fee-policies/:id/approve` now succeeds (200) for the primary administrator on its own policy; unchanged (422) for everyone else.

### B.3 Permissions

| Account | Before | After |
|---|---|---|
| Primary administrator (`is_primary_admin = 1`) | same as any admin, capped by grants; could not approve own policy | union of all staff capabilities; may approve its own policy (recorded) |
| Ordinary administrator | flags as granted | **unchanged** — still 422 on self-approval, still needs each grant |
| Agent / landlord | saw the tenant's phone + email on every viewing | see neither until an administrator approves (Phase 5) |
| Tenant | own record | own record (unchanged) |

### B.4 Migrations

Three additive columns, applied by `migrate.php` (dry-run by default, `--apply` writes). Proven on SQLite by dropping the columns from a seeded database and re-running the migration — see C.3. MySQL DDL is written in the same style as the existing columns but **was not executed here** (no MySQL in this environment); it will run through the same script on the server.

---

## C. Testing

### C.1 Automated — final results (all run in this session, on this tree)

| Suite | Result |
|---|---|
| `npm run test:api` (api, account-settings, task03, migration, concurrency, access-control, **primary-admin**, **tenant-contact**) | **305 tests · 305 pass · 0 fail** · exit 0 · 235 s |
| `test:uploads` | 18 pass / 0 fail |
| `test:responsive` | 14 / 0 |
| `test:navigation` | 61 / 0 |
| `test:routing` | 50 / 0 |
| `test:content` | 4 / 0 |
| `test:property` | 23 / 0 |
| `test:sharing` | 36 / 0 |
| `test:blog` | 35 / 0 |
| `test:design` | 14 / 0 |
| `test:email-footer` | 3 / 0 |
| `test:access` | 13 / 0 |
| `npm run lint` (`tsc --noEmit`) | **clean**, exit 0 |
| `npm run build` (vite + esbuild) | **exit 0**, built in 3.9 s |
| PHP syntax (`php-wasm-cli -l`) on every touched PHP file | no syntax errors |

The two new suites specifically:

- **`primary-admin.test.mjs` — 16/16.** Proves (a) before the flag, an admin with both capabilities still gets 422 on its own policy; (b) the flag is CLI-only and no HTTP shape moves it; (c) the script refuses missing `--confirm` and non-admin targets; (d) the flag yields every capability with no grants; (e) **§3.2 end to end**: create → change agent share 70→62 → submit → approve with the same account (200, `selfApproved: true`) → activate → the live values are 62/38; (f) the trail records `approved_by_creator` naming the same account; (g) an ordinary admin still can't self-approve; (h) a second administrator can still approve the primary's policy, and the primary approving someone else's is *not* flagged as self-approval; (i) earlier policies and the ledger are unchanged; (j) clearing the flag removes the union.
- **`tenant-contact.test.mjs` — 10/10.** Asserts the agent list, agent detail, agent lifecycle response, landlord list, tenant list/detail, staff list/detail and a stranger's attempt; checks both the fields **and** the raw response text for the phone digits (spaced and normalised) and the email; and reads `email_outbox` directly to prove no message addressed to the agent or landlord contains the tenant's details while the staff notification still does.

### C.2 §3.2 acceptance test — verbatim result

```
create → change the agent share → submit → approve (same account) → activate ... ok
the approval is recorded in the event trail with the exception named .......... ok
an ordinary administrator cannot self-approve after the flag exists ........... ok
# tests 16 # pass 16 # fail 0
```

### C.3 Migration proof (SQLite)

```
before: users.is_primary_admin = true, fee_policies.self_approved = true
DROP the three columns (simulating an older installation)
dry run:  1. ALTER TABLE users ADD COLUMN is_primary_admin
          2. ALTER TABLE fee_policies ADD COLUMN self_approved
          3. ALTER TABLE fee_policies ADD COLUMN self_approved_at
--apply : added users.is_primary_admin, fee_policies.self_approved, fee_policies.self_approved_at
second --apply: "Schema is already up to date. Nothing to do."
```

### C.4 What could not be tested here (manual steps for you)

| Not verifiable in this sandbox | How to check | When |
|---|---|---|
| MySQL execution of the three DDL statements | Run `php php-backend/migrate.php` (dry run) on the server, read the three planned `ALTER TABLE` lines, then `--apply`. Take a database export first. | Before the account is assigned in production |
| The real account becoming primary | `php php-backend/assign_primary_admin.php --list` → confirm one `YES`; then sign in as `goodlucksonly@gmail.com` and check Admin → Fee policies shows the primary-administrator sentence | After deploy + migration |
| Browser rendering of the two new notices | Sign in as an agent with an assigned viewing → the panel should read "Contact details are shared by Goodlucks only after an administrator approves it"; as the primary admin → the fee-policy screen shows the primary sentence and a self-approved badge | After deploy |
| Apache/production behaviour (unrelated to this phase, noted for Phase 2) | — | Phase 2 |

---

## D. Outstanding issues

1. **`/auth/me` capability shape changed.** `tests/api.test.mjs` asserted an exact object for a default-deny administrator; the new `feePolicySelfApprove: false` key made it fail. The assertion was updated (not weakened) to include the key. No behavioural change was hidden by it.
2. **Agents and landlords currently see *no* tenant contact at all**, because no approval path exists until Phase 5. That is the intended interim state and the UI says so — but it means a viewing cannot be arranged between tenant and agent except through Goodlucks staff until Phase 5 ships.
3. **`.` is only assigned from the server console.** In production the flag does nothing until someone runs `assign_primary_admin.php` on the server after deploying. Until then every administrator behaves exactly as before (which is the safe default).
4. **MySQL DDL not executed here** (no MySQL in the sandbox). The statements are simple additive `ALTER TABLE … ADD COLUMN` matching the existing style, and the SQLite proof exercises the same migration code path.
5. **Phase 5 will extend, not replace, the redaction**: `viewing_tenant_contact_state()` already returns a state string, so the disclosure workflow plugs into one function rather than rewriting the call sites.
6. `docs/UPGRADE2_PHASE0_AUDIT_2026-11-10.md` had one sentence stating that the CLI would also set the individual capability flags; the implementation deliberately stores **only** the flag so the two can never disagree. That sentence was corrected in place.

---

## E. Repository status

| Item | Value |
|---|---|
| Branch | `arena/1dbf260c-goodlucks-rep` (the session's bound branch) |
| Base commit | `ad2bb0a` — `main` untouched, not modified, not force-pushed |
| Commit | see the commit created with this report (`git log -1`) |
| Files | 15 modified, 3 added (the two test suites, the CLI script) + this report and the Phase 0 audit |
| Deployed | **No** |
| Production database | **Untouched** |
| Live website | **Untouched** |
| Working tree after the commit | clean |

**Phase 1 is complete and stopping here for your review.** Phase 2 (admin console fixes A1–A8, A10) has not been started.
