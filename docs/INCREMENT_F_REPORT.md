# Increment F — Agent-Led Viewing Lifecycle

**Repository:** `Goodluck18/Goodlucks-rep`
**Branch:** `arena/a67485fb-goodlucks-rep`
**HEAD at the time of writing:** `cbd5ced` (merge of PR #2) — Increments A–F are **uncommitted working-tree changes** on top of it
**Working tree:** dirty (expected — nothing was committed, pushed or deployed)
**Production database:** not touched. No destructive statement was run. SQLite is the only engine available in this sandbox.
**Increment G:** **not started.** No remittance processing, no commission settlement, no automatic payouts, no new payment gateway, no tenancy-agreement signing.
**Closure pass:** completed on 3 November 2026 against a running dev stack and a current database — see **§16**. Test total is now **163/163 green**.

---

## 1. What this increment does

Before F, a "viewing" in this product was a single row that appeared the moment a tenant asked for one, carrying the status `scheduled`. That word was a lie: nobody had agreed a time, no agent had responded, and the tenant was shown a green "Viewing Scheduled" badge for an appointment that did not exist.

Increment F turns that row into a **lifecycle**:

```
tenant finds a property
      │
      ├─ enquiry only ────────────────► enquiry_received
      │
      └─ requests a viewing ──────────► viewing_requested / awaiting_agent
                                              │
                                    agent proposes a slot
                                              ▼
                                          proposed ──► tenant asks for another time
                                              │              │
                                    tenant (or agent)        ▼
                                     confirms the slot   reschedule_requested
                                              ▼              │
                                          confirmed ◄──────── agent reschedules
                                              │              (rescheduled)
              ┌───────────────┬───────────────┼───────────────┬────────────────┐
              ▼               ▼               ▼               ▼                ▼
         completed     tenant_no_show   agent_no_show   could_not_proceed   cancelled
```

The rule that drives the whole increment: **a row is a request until `confirmed_at` is set, and "confirmed" only ever means "a time was agreed".** It never means anybody paid.

---

## 2. Existing functionality reused (nothing rebuilt)

| Area | Reused |
| --- | --- |
| Property submission & ownership model | Increment C's `submitted_by_user_id` / `submitted_by_role` / `landlord_id` columns and the `claimed_by_agent` authority state. F adds **no** ownership table and **no** ownership verification. |
| Identity & professional authorisation | Increment D's `verification.php`, capabilities, private document storage. F consumes "is this agent active" and never exposes identity data. |
| Fee ledger | Increment B's `viewing_fee_records`, `fee_remittances`, `fee_total_ghs`, `goodlucks_share_ghs`, collection states. F reads it; never writes it from a lifecycle change. |
| Fee policies | Increment E's policies, snapshots and tiers — untouched, still `provisional`, `appliedToCalculations: false`. |
| Notifications | The existing in-app `notifications` table, the existing `send_email()` queue and `email_html_template()`. No paid provider was added. |
| Audit | The existing `audit_log` (`lib/audit.php`). Every lifecycle action and every admin correction writes an audit row. |
| Admin capabilities | The D/E capability model inside `lib/auth.php`. **No new role system**; one new capability was added: `can_correct_viewings`. |
| Sessions/CSRF/rate limiting | The existing middleware and the existing per-action rate-limit helper (with its own bucket for lifecycle actions). |

---

## 3. Files changed for Increment F

New:

- `php-backend/lib/viewings.php` — the whole lifecycle: status model, transition matrix, access resolution, history, corrections, agent assignment, capabilities.
- `php-backend/grant_viewing.php` — CLI to grant/revoke the viewing-correction capability (`--email= --correct=1|0 --list`).
- `src/components/AgentViewingsPanel.tsx` — the agent's queue and action surface.
- `src/components/AgentListingForm.tsx` — the agent listing-submission interface (Increment C's backend had no UI; the old screen said "not open yet").
- `src/components/AdminViewingsPanel.tsx` — admin oversight: filters, detail, history, correction, reassignment, fee-record toggle.
- `docs/INCREMENT_F_REPORT.md` (this file).

Modified:

- `php-backend/lib/api.php` — viewing routes and handlers (`handle_create_viewing`, `handle_list_viewings`, `handle_get_viewing`, `handle_viewing_action`, `handle_admin_viewing_detail`, `handle_correct_viewing`, `handle_assign_viewing_agent`; `handle_update_viewing` kept for the Increment B fee checkbox).
- `php-backend/lib/repository.php` — `shape_viewing()`, `create_viewing()`, `update_viewing()` extended for the new columns; `shape_property()` disclosure rules (`landlordId` only for that landlord or an admin; `landlordContactClaimed` admin-only).
- `php-backend/config.php` — requires `lib/viewings.php`; `VIEWING_RATE_LIMIT_PER_HOUR` (requests) and `VIEWING_ACTION_RATE_LIMIT_PER_HOUR` (lifecycle actions).
- `php-backend/lib/auth.php` — viewing capability lookup.
- `php-backend/database.sql`, `php-backend/schema.sqlite.sql`, `php-backend/migrate.php` — the F schema in all three, additively.
- `tests/api.test.mjs` — `completeViewingAs` helper, legacy viewing tests converted to the lifecycle, and a 19-test `Increment F` block.
- `tests/finance-fixtures.php` — `--viewing-id=` and `--viewing-days-ago=` so a completed viewing can be backdated.
- `src/types.ts` — 12-status `ViewingStatus`, `ViewingAction`, expanded `ViewingSchedule`, `ViewingHistoryEvent`, `ViewingDetail`, `ViewingFinancialState`, `ViewingCounts`, `StaffCapabilities.viewingCorrections`.
- `src/services/apiService.ts` — `createViewing` → `POST /viewings`, plus `listViewings`, `listAllViewings`, `getViewing`, `getAdminViewing`, `viewingAction`, `correctViewing`, `assignViewingAgent`.
- `src/context/AppContext.tsx` — `refreshViewings`, `runViewingAction`; the agent login branch now loads its own queue instead of clearing it; the request toast says the request is *not confirmed*.
- `src/components/ViewingRequestModal.tsx` — success step states plainly that nothing is booked and nothing was paid.
- `src/components/TenantDashboard.tsx` — viewings tab rewritten around the lifecycle (status, "requested" vs "agreed" slot, cancel, ask for another time, accept a proposed time, report an agent no-show); tenant pipeline wording corrected.
- `src/components/AgentDashboard.tsx` — mounts the viewing queue and the submission form.
- `src/components/AdminDashboard.tsx` — viewings tab replaced with `AdminViewingsPanel`; the "Mark Completed & Paid" button (which confirmed money on completion) is gone; the phone-request modal no longer pretends to schedule.
- `src/components/LandlordDashboard.tsx` — "Goodlucks Field Agent" / "Paid On Site" replaced with "viewing agent" and "recorded as collected on site by the agent … Goodlucks did not take this payment".

**No existing work was discarded.** Nothing was reset, cleaned, stashed or reverted; A–E's files remain exactly as they were except where F had to extend them.

---

## 4. Database

### New table: `viewing_events` (append-only history)

| Column | Notes |
| --- | --- |
| `id` | PK |
| `viewing_id` | the viewing this history row belongs to (indexed with `created_at`) |
| `action` | e.g. `viewing.proposed`, `viewing.corrected` |
| `from_status`, `to_status` | previous and new status |
| `previous_date`, `previous_time`, `new_date`, `new_time` | the slot before and after, so a reschedule preserves the old appointment |
| `note` | free text (for cancellations, this falls back to the reason) |
| `actor_id`, `actor_role`, `actor_name` | who did it |
| `created_at` | when |

Rows are never updated or deleted. There is no FK constraint because the existing schema does not use them consistently; the index and the application-level guard are what the architecture supports today.

### Changed table: `viewing_schedules`

Added, all nullable/defaulted so existing rows stay valid:

`tenant_user_id`, `agent_user_id`, `landlord_user_id`, `request_type` (`viewing` | `enquiry`), `preferred_date`, `preferred_time`, `confirmed_at`, `confirmed_by`, `cancel_reason`, `cancelled_by`, `cancelled_at`, `completed_at`, `completed_by`, `agent_notes`, `updated_at`.

Indexes: `idx_vs_agent (agent_user_id, status)`, `idx_vs_tenant (tenant_user_id)`, `idx_vs_slot (date, status)`.

**Legacy rows are never rewritten.** Their `status = 'scheduled'` is normalised to `confirmed` *for reading only* (`viewing_normalise_status()`), because those rows came from a system where a slot was imposed by staff. Nothing is silently converted on disk.

### Migration

`php-backend/migrate.php` gained the additive statements for both engines. It is a dry run by default and only executes with `--apply`; it cannot insert data rows, so the capability grant is a separate manual step (§11).

**MySQL correctness of the new DDL is documented but unverified** — this sandbox has no MySQL server and no Docker. The SQLite DDL was applied and exercised by the whole test suite. The MySQL statements use backticked identifiers, `AUTO_INCREMENT`-free `TEXT` primaries like the rest of the schema, and `INTEGER` booleans — consistent with the existing MySQL file, but **not executed**.

---

## 5. Endpoints and permissions

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/viewings` | anyone (tenant or guest), rate-limited 12/hour/IP | Creates a **request**. Identical payloads inside the window return `200 {duplicate:true}` instead of a second row. Never returns "confirmed". |
| `GET` | `/api/viewings` | signed-in tenant / agent / landlord | Tenant sees their own; agent sees the ones assigned to them; landlord sees their property's. |
| `GET` | `/api/viewings/{id}` | participant (tenant, responsible agent, landlord, admin) | Includes `history`, `financial`, `allowedActions`. |
| `POST` | `/api/viewings/{id}/{action}` | participant, per the transition matrix | `propose`, `confirm`, `reschedule`, `request-reschedule`, `cancel`, `complete`, `no-show`, `could-not-proceed`. Rate-limited in its own bucket. |
| `PATCH` | `/api/viewings/{id}` | admin/staff | Increment B's fee-record toggle, unchanged; returns `409` once a remittance exists. |
| `GET` | `/api/admin/viewings` | admin | Filters: `status`, `propertyId`, `agentUserId`, `tenantUserId`. Returns `counts` and `capabilities`. |
| `GET` | `/api/admin/viewings/{id}` | admin | Full detail with history and financial state. |
| `POST` | `/api/admin/viewings/{id}/correction` | admin **with** `can_correct_viewings` | Requires a reason of at least 10 characters. Audited as `viewing.corrected`. |
| `POST` | `/api/admin/viewings/{id}/assign-agent` | admin | Only an **active** agent account can be assigned; audited. |

Every handler re-authenticates and re-derives the caller's relationship to the record. No route trusts a role, status, agent id or fee value supplied by the client.

---

## 6. Statuses and the allowed transitions

Statuses: `enquiry_received`, `viewing_requested`, `awaiting_agent`, `proposed`, `confirmed`, `reschedule_requested`, `rescheduled`, `cancelled`, `completed`, `tenant_no_show`, `agent_no_show`, `could_not_proceed`.

Terminal: `cancelled`, `completed`, `tenant_no_show`, `agent_no_show`, `could_not_proceed`. **Normal transitions out of a terminal state do not exist**; the only exit is an audited administrator correction.

The matrix (role → permitted target), enforced in `viewing_transition_allowed()` on the server:

| From | Allowed targets (role) |
| --- | --- |
| `enquiry_received` | `viewing_requested` (tenant, admin); `proposed` (agent, admin); `could_not_proceed` (agent, admin); `cancelled` (tenant, agent, landlord, admin) |
| `viewing_requested` / `awaiting_agent` | same set as above |
| `proposed` | `confirmed` (tenant, agent, admin); `proposed` (agent, admin); `reschedule_requested` (tenant, agent, admin); `could_not_proceed` (agent, admin); `cancelled` (tenant, agent, landlord, admin) |
| `confirmed` | `reschedule_requested` (tenant, agent, admin); `rescheduled` (agent, admin); `completed` (agent, admin); `tenant_no_show` (agent, admin); `agent_no_show` (tenant, admin); `could_not_proceed` (agent, admin); `cancelled` (tenant, agent, landlord, admin) |
| `reschedule_requested` | same as `proposed` — the appointment does **not** move until a new slot is proposed and agreed |
| `rescheduled` | same as `confirmed` |
| any terminal | nothing |

Additional server-side rules, each covered by a test:

- **Confirmation requires a proposed slot.** `confirm` from a request state is rejected `422`.
- **Completion requires the slot to have passed.** `complete` (and both no-shows) before the appointment time returns `422` — including for agents and admins. The only way to close such a record is the audited correction.
- **A tenant cannot complete**, and cannot record a no-show against themselves; they may record `agent_no_show` after the slot.
- **Cancellation requires a reason**, and records `cancelled_by` / `cancelled_at`.
- **Rescheduling preserves the previous appointment** in `viewing_events.previous_date` / `previous_time`.
- **`request-reschedule` does not move the appointment.** It flips the status to `reschedule_requested` and keeps the agreed slot.
- **A suspended or de-permissioned agent** loses every operational action on their rows; the rows and their history stay, and admins still see them.
- `viewing_appointment_is_confirmed()` is the single definition: `confirmed_at` is set **and** status is `confirmed` or `rescheduled`. The UI's "confirmed" badge comes from that flag, never from a string comparison of its own.

Every change runs inside a transaction: update the row → insert the `viewing_events` row → insert the `audit_log` row → commit → notify. A notification failure cannot roll back a committed state change, and a state change that fails leaves no notification claiming success.

---

## 7. How access is enforced

`viewing_actor_role($viewing, $user)` derives the caller's relationship on every request, from the record itself:

- **admin** — a staff session with viewing access;
- **agent** — `agent_user_id` equals the caller's id (the responsible agent, resolved from the property's submitting agent at creation, or set by an admin assignment);
- **tenant** — `tenant_user_id` equals the caller's id, or the request's email matches the tenant account's email;
- **landlord** — `landlord_user_id` equals the caller's id, or the viewing's property has this landlord as `landlord_id`;
- **none** otherwise → **`403`** when the viewing exists, **`404`** when the id does not.
  (Corrected in Increment G, finding D10: this section previously claimed `404`
  in both cases. The measured behaviour — recorded in §16 C1 — is that an
  existing record the caller has no relationship with returns `403`, and an
  unknown id returns `404`. Viewing ids are 20-character random strings, so the
  distinction is not a practical enumeration oracle; the documentation now
  matches the code rather than the other way round.)

Consequences that matter:

- An agent can only ever see and act on their own queue. Cross-agent reads and writes are refused with `403` (existing record) or `404` (unknown id).
- A tenant can only see their own requests; another tenant's id is refused with `403`/`404` on the same rule.
- A landlord sees the viewings on their own properties only.
- Viewing endpoints **never** return Ghana Card numbers, identity documents, verification records, landlord email/phone, or whether a given contact belongs to a registered landlord.
- The property response hides `landlordId` from everyone except that landlord and admins, and `landlordContactClaimed` from everyone except admins.

---

## 8. Agent submission of listings on a landlord's behalf

Increment C's backend existed; the interface said submission was "not open yet". F adds the interface, with the declaration kept honest:

- The agent must name the landlord and give **at least one** contact route (`landlordEmail` or `landlordPhone`).
- The server resolves the landlord by id → email → phone, and only matches accounts whose role is `landlord`.
- A match sets `landlord_id`. No match leaves it `NULL` and sets `landlord_contact_claimed`.
- **The response is identical either way** (201, `landlordAuthorityState = 'claimed_by_agent'`, `landlordId = ''`), so the endpoint cannot be used to test whether a phone number belongs to a landlord. The old "unknown landlord account could not be found" `422` was deliberately removed for the same reason.
- The agent's own account is never recorded as the owner. The listing goes into the existing review queue.
- The form states on screen that the agent is declaring authority, that Goodlucks does not verify ownership here, and that the agent is not the owner.

A missing landlord reference returns `422` with `fields.landlordId` — the field name is generic on purpose.

---

## 9. Notifications

Notifications reuse the existing architecture: an in-app `notifications` row plus an email through the existing outbox/`send_email()` queue. No paid provider, no SMS claim, no WhatsApp claim.

Created on: request received (tenant confirmation copy), agent receipt, proposal, confirmation, reschedule request, reschedule, cancellation, completion, and both no-show outcomes. Each one restates the **current record** ("Status: …", "Appointment: …", plus the note). The email body repeats that a viewing fee is paid on site and Goodlucks never asks for it online.

**Limitations, stated honestly:**

- Email is queued and delivered after the request completes; delivery depends on the operator having configured SMTP, and there is no read receipt, no delivery webhook and no retry beyond the existing outbox processor.
- There is **no SMS and no WhatsApp** channel. Nothing in the UI or the emails suggests otherwise.
- A guest viewing request (no tenant account) can only be reached by email if the tenant supplied one; there is no in-app notification for a guest.
- Notifications are fired after commit and their failure is not surfaced to the actor as a state failure — the state change stands, the notification may not.

---

## 10. Relationship to the fee ledger (Increment B) and policies (Increment E)

- `POST /api/viewings`, `confirm`, `reschedule`, `complete` and every no-show/cancel **create no fee record and change no amount**. The test "viewing requests never create money, and completion is not a payment" asserts the ledger is byte-for-byte unchanged across a full lifecycle.
- `viewing_financial_state()` is read-only: it reports whether a fee record exists, what the agent is recorded as having collected, the collection state (`reported` / `confirmed_by_staff` / `disputed` / `void`), and the Goodlucks share if one was agreed.
- The existing staff checkbox (`PATCH /api/viewings/{id}`) still records **what the agent reported collecting**. It is worded that way in the admin panel and it cannot be reached from any lifecycle action. It returns `409` once a remittance has been recorded, so a settled record cannot be voided.
- Linking an appointment to the ledger changes no financial meaning: `fee_total_ghs` remains agent-collected money, `goodlucks_share_ghs` remains unset until agreed, and only `fee_remittances` count as Goodlucks revenue.
- 60/40 and 70/30 remain **inactive and unapplied**. No approved policy rows exist; policies stay `provisional` with `appliedToCalculations: false`; no share is auto-computed; no remittance or settlement path was added.

---

## 11. Security measures

- Server-side authentication and authorisation on every viewing route; the client's idea of the caller's role is never accepted.
- Ownership re-derived per request (`viewing_actor_role`), so it is IDOR-proof by construction; non-participants are refused with `403` for an existing record and `404` for an unknown id (finding D10).
- Role and status are never mass-assignable. `handle_viewing_action` accepts a date, a time, a note, a reason and a no-show subject — nothing else — and the target status is derived from the action plus the current state.
- All input validated and length-capped server-side; dates must parse and slots must be in the future where the transition requires it.
- Rate limits: request creation 12/hour/IP; lifecycle actions in a separate bucket so an agent working a queue is never blocked by the tenant-facing limit.
- Multi-write paths (status + event + audit) run in a transaction.
- Admin corrections require both the capability and a written reason of ≥10 characters, are recorded as `viewing.corrected` in `viewing_events`, and are written to `audit_log`. The capability is granted out-of-band (`grant_viewing.php`) and is **not** part of general admin rights.
- Error responses carry a message and a field map; no SQL, no stack traces, no internal ids.
- No identity documents, Ghana Card numbers or verification records appear in any viewing response.
- Login/session and CSRF handling are the existing ones; no new authentication path was introduced.

---

## 12. Tests actually executed

**Command:** `npm run test:api` (PHP-WASM server + SQLite, full suite)
**Result at the end of the build described in this report:**

```
# tests 161
# suites 28
# pass 161
# fail 0
# cancelled 0
# skipped 0
```

> **Updated by the closure pass (§16.5):** the suite now contains **163** tests — the 161 above plus the landlord-reference privacy test and the notification test — and runs **163 pass / 0 fail**. The 19 Increment F tests listed below are unchanged.

142 of those are the existing A–E regression tests (unchanged in intent, several converted to the lifecycle where they used to assert the old `scheduled` behaviour); 19 are new in Increment F:

1. a tenant request is a request, not an appointment
2. an enquiry is recorded separately and can become a viewing request
3. agents only see the viewings assigned to them, and tenants only their own
4. an appointment cannot be confirmed before a time is proposed
5. an agent proposes a slot and the tenant confirms it
6. a tenant cannot propose a time, complete a viewing, or mark a no-show on itself
7. a reschedule keeps the previous appointment in the history
8. the tenant can ask for a different time without moving the appointment
9. cancelling requires a reason from the agent and records who cancelled
10. a viewing cannot be completed before it happens, and completion is final
11. no-shows are recorded after the slot, by the other party
12. a viewing that could not proceed needs a reason and closes the record
13. a suspended agent loses the viewing tools but not the history
14. administrators can inspect, filter and see overdue work
15. only an administrator with the correction capability can correct a closed record
16. an administrator can reassign a viewing to another active agent
17. viewing requests never create money, and completion is not a payment
18. the legacy viewing endpoint still works and is audited as a correction
19. Increments A–E still behave with the new lifecycle in place

Coverage mapping to the brief: **permissions** (3, 6, 13, 15, plus the Increment C submission tests), **enquiries** (1, 2), **lifecycle** (1, 4–12), **admin** (14–16), **financial** (17, 18, plus E's "policies stay provisional" tests).

**Other checks executed:**

- `npx tsc --noEmit` → clean (no output).
- `npm run build` → succeeds; `dist/assets/TenantDashboard-*.js`, `AgentDashboard-*.js`, `AdminDashboard-*.js` all emitted.
- `php-wasm-cli -l` syntax check on every PHP file touched (`viewings.php`, `api.php`, `config.php`, `auth.php`, `repository.php`, `migrate.php`, `grant_viewing.php`).
- Migration dry run on SQLite; the schema's `CREATE TABLE`/`ALTER` statements were applied to the test database by the suite itself.

**Not executed, and therefore not claimed:** MySQL migration execution, MySQL query correctness, a real SMTP delivery, any browser-driven end-to-end test, and any load or penetration test.

---

## 13. Known limitations and unresolved issues

1. **MySQL is unverified.** No MySQL server is available here; the DDL mirrors the SQLite one by hand. This must be run against a real MySQL instance before any deployment.
2. **No FK constraints** on the new columns. The existing schema does not use them consistently, so the guard is application-level. Adding them is a schema-wide decision, not an F decision.
3. **`viewing_events` grows without bound.** There is no archival job. Retention should be decided with the audit-log retention work, not bolted on here.
4. **Guest requests** have no tenant account to notify in-app; they are email-only, and only if an email was supplied.
5. **The agent listing form takes image URLs**, not uploads. The upload pipeline exists (Increment C) but wiring it into this form is a separate piece of work; the form says "image links" rather than pretending otherwise.
6. **The tenant-request pipeline key `viewing_scheduled`** still exists as a stored value in `tenant_requests`. Its *label* is now "Viewing Requested", but the key would need a data migration to rename, which F did not do.
7. **Demo data** created by the test suite uses the legacy `assigned_agent` display name; new records carry `agent_user_id`. Nothing breaks, but the two coexist.
8. **The seeded demo accounts** (`admin@goodlucks.com` etc.) do not have `can_correct_viewings`; that is deliberate, and the admin screen explains how to grant it.
9. **Legacy rows** show as `confirmed` because of read-time normalisation while their stored status stays `scheduled`. Any query written directly against the DB must apply the same normalisation (`viewing_normalise_status()`).

---

## 14. Manual setup required later

1. Run `php-backend/migrate.php` (dry run first, then `--apply`) against the target database — **never** against production without a backup. The MySQL path has not been executed anywhere yet.
   - **Local SQLite note (closure pass):** `migrate.php` cannot upgrade an existing SQLite file — it prints the `sqlite3 … < schema.sqlite.sql` instructions instead. The default dev database `.data/dev.sqlite` was created before the F schema and still lacks it; a fresh one is created only when the file does not exist. Decide separately whether to recreate it (a checksum-verified backup was taken at `.data/backups/dev.sqlite.20261103T090558Z.bak`) or to keep using the closure database `.data/dev-closure.sqlite`.
2. Grant the viewing-correction capability to the specific administrators who need it:
   `php php-backend/grant_viewing.php --email=<admin> --correct=1` (and `--correct=0` to revoke; `--list` to see who has it).
3. Confirm SMTP settings if viewing emails are expected to leave the server; otherwise the outbox will queue and never deliver.
4. Optionally backfill `agent_user_id` on historical rows if any older record needs to appear in an agent's queue. No such backfill was run — historical rows are intentionally left as they are.

---

## 15. Confirmations

- **Increment G has not been started.** No remittance processing, no remittance reconciliation, no rental commission settlement, no automatic payout, no new payment gateway, no tenancy-agreement creation or signing, no ownership/licence integration.
- **Nothing was committed, pushed or deployed.** The branch is still `arena/a67485fb-goodlucks-rep`, HEAD is still `cbd5ced`, and the tree is dirty by design.
- **No production database was touched**, and no destructive database operation was run.
- **No existing work was discarded.** Increments A–E remain in the working tree exactly as they were, except where F had to extend them to keep the product honest.
- **No test is reported as passing unless it was executed** — see §12 for the exact commands and counts, and the explicit list of what was *not* executed.

---

## 16. Closure verification (3 November 2026)

This section records a **development verification pass only**. Its purpose was to close the two gaps the recovery assessment left open: the stale development database, and the absence of any live exercise of the new interfaces. No feature was added, no behaviour was changed, and Increment G was not started.

**Result in one line:** F is verified against a real running backend at the API and interface-contract level (87 live assertions, 103 contract fields, 163/163 automated tests); **screen-level interaction in a browser remains unverified** because no browser exists in this environment.

### 16.1 The development database — investigated, then preserved

Investigated before anything was touched:

| Question | Finding |
| --- | --- |
| Exists / size | `.data/dev.sqlite`, 438,272 bytes, last written 08:59 on 3 Nov (by the recovery probe's own login, not by F work) |
| Age vs the F schema | Created 07:32; `schema.sqlite.sql` updated 07:45; `lib/viewings.php` 08:34 — **entirely pre-F** |
| Schema difference | Missing `users.can_correct_viewings`, `properties.landlord_contact_claimed`, 15 `viewing_schedules` columns and the whole `viewing_events` table |
| Contents | 3 demo users, 4 demo properties, 3 auth sessions, 1 rate-limit row; **0 viewings, 0 fee records, 0 policies, 0 receipts, 0 verifications** |
| In use? | No process held it (no `lsof`/`fuser` available; no PHP/node process running) |
| Backup existed? | No |

What was done — **nothing destructive**:

1. A checksum-verified backup was taken: `.data/backups/dev.sqlite.20261103T090558Z.bak`, SHA-256 `bba3f0816735e54053a4ca9bb8f2f230674fba0b086f1377d47829c1d3db85c0` — identical to the original, opens cleanly, row counts match. A second verification at the end of the pass confirms the original file is byte-for-byte unchanged.
2. The original was **not** deleted, replaced, migrated or patched.
3. A **separate** database, `.data/dev-closure.sqlite`, was created from `schema.sqlite.sql` by pointing `DB_SQLITE_PATH` at it for this pass only. It carries the full F schema (`viewing_schedules` 31 columns, `viewing_events` present, `users.can_correct_viewings` present).

Dev stack used for every check below (rate limits raised for the pass only, exactly as the test suite does):

```
API_PORT=8123 DB_SQLITE_PATH=$PWD/.data/dev-closure.sqlite \
REGISTER_RATE_LIMIT_PER_HOUR=200 VIEWING_RATE_LIMIT_PER_HOUR=200 \
VIEWING_ACTION_RATE_LIMIT_PER_HOUR=2000 node scripts/dev.mjs
```

`npm run dev` still defaults to the stale `.data/dev.sqlite`; recreating it is an owner decision, documented in §14.

### 16.2 Live end-to-end exercise — 87 assertions, 0 failures

Driven over real HTTP against the running PHP API and the fresh SQLite database (script kept outside the repository; every line below is an observed response).

| Area | Verified live |
| --- | --- |
| Setup | demo admin/tenant/landlord login; three agent registrations (one left unapproved); a second tenant |
| Agent listing submission | submitted for the **existing demo landlord by email** → 201, `landlordId` hidden, `landlordAuthorityState: claimed_by_agent`, `isLandlordVerified: false`; admin then publishes it |
| Tenant — enquiry | `requestType: enquiry` → 201 `enquiry_received`, `isConfirmed: false` |
| Tenant — request | 201 `viewing_requested`, label "Viewing requested", routed to the submitting agent |
| Tenant — visibility | own list returns both records; a second tenant sees neither (denied) and zero rows |
| Agent — queue | assigned requests visible; the **unapproved** agent is refused (403) |
| Agent — propose / confirm | confirm before propose → 422; propose → `proposed`, still `isConfirmed: false`; tenant accepts → `confirmed` with `confirmedAt` |
| Agent — reschedule | reschedules a confirmed appointment → `rescheduled`; history keeps `previousDate` |
| Tenant — ask for another time | status `reschedule_requested`, **appointment does not move**; a direct agent `reschedule` from that state is refused (422, by design — the agent proposes instead); agent proposes, tenant confirms |
| Cancellation | agent cancel without a reason → 422; with reason → `cancelled`, reason stored; tenant cancels their own request → `cancelled` |
| Tenant permissions | cannot complete (403), cannot self-report a no-show (403), cannot propose (403) |
| Completion gating | agent cannot complete before the slot (422) |
| Post-slot | complete → `completed` + `completedAt`; agent records tenant no-show → `tenant_no_show`; tenant records agent no-show → `agent_no_show`; "could not proceed" closes with a reason; completed record cannot be cancelled or completed twice (409) |
| Cross-agent | another agent cannot read or act on a foreign viewing; their queue is empty |
| Admin — oversight | list with counts; filters by status, property, agent and tenant; the agent filter reflects a reassignment (1 row) |
| Admin — history | detail carries full history (4+ events) and honest financial state |
| Admin — reassignment | reassigned to another active agent → old agent loses access, new agent gains it; a non-active agent cannot be assigned (422) |
| Admin — correction | without the capability → 403; capability granted via `grant_viewing.php` → console shows `viewingCorrections: true`; reason shorter than 10 characters → 422; valid correction of a terminal record → 200 with a `viewing.corrected` history event and an audit-log row; capability revoked afterwards and confirmed off |

### 16.3 Interface contract check — 103 fields, 0 missing

Because there is no browser, the data contract was verified instead: every property the F components dereference was confirmed present in the live responses — 25 `ViewingSchedule` fields (list, detail and tenant list), 10 history-event fields, 5 financial-state fields, the `capabilities.viewingCorrections` flag, `allowedActions`, the six admin `counts`, and the fee-ledger `summary` fields used alongside the viewing screens.

### 16.4 Frontend evidence actually obtained

- The Vite dev server compiles each new component and serves the transformed module (200): `AgentViewingsPanel.tsx` 69,558 B, `AgentListingForm.tsx` 54,746 B, `AdminViewingsPanel.tsx` 99,782 B.
- `AgentDashboard.tsx` serves a module that imports both agent components (the wiring is real, not just an import in source).
- SPA routes `/`, `/browse`, `/agent-dashboard`, `/admin`, `/property/prop-1` all return `200 text/html`.
- `npm run build` succeeds; the shipped bundles contain the F copy ("Viewing enquiries", "Submit listing for review", "Correct this record", "My viewing requests", "Not confirmed yet", "Asking for another time does not move the appointment") and **none** of the retired strings ("Mark Completed & Paid", "Paid Physically to Staff", "Goodlucks Field Agent", "Viewing Scheduled").
- `npx tsc --noEmit` is clean (with `@types/react`/`@types/react-dom` present in `node_modules`).

**Not obtained:** actual rendering, click-through, responsive/mobile layout, or client-side state transitions in a browser. A successful build and a matching data contract are strong evidence, but they are not the same thing, and this report does not claim they are.

### 16.5 Automated tests added (161 → 163, both green)

1. **`an agent landlord reference is resolved without disclosing whether the account exists`** — submits listings referencing a landlord by a real email, an unknown email, a real phone, an unknown phone, and a tenant's email. Asserts: identical status code and message for matched vs unmatched, identical response key sets, `landlordId: ''` every time, `landlordAuthorityState: claimed_by_agent` every time, and that the agent's response never echoes the landlord account — while staff (and only staff) can see the matched `landlordId` or the `landlordContactClaimed` string. This closes the F3 gap from the recovery report and covers the email/phone lookup branches that no test previously exercised.
2. **`lifecycle events notify the right people, and refused actions notify nobody`** — asserts a notification for the agent on request creation ("Nothing is confirmed yet"), for the tenant on proposal, for the agent on confirmation, for the tenant on reschedule and on completion, and for the counterparty on both cancellation directions. Negative cases assert **no** notification is created for: confirming before a proposal (422), completing before the slot (422), and an unauthorised agent attempting a cancellation. This closes the F4 gap.

Suite result after the additions:

```
$ npm run test:api
# tests 163   # suites 28   # pass 163   # fail 0   # cancelled 0   # skipped 0
```

### 16.6 Findings raised during closure — recorded, not fixed

This pass was verification-only, so nothing below was changed. Each is a candidate for a decision, not a silent edit.

| # | Finding | Severity | Detail |
| --- | --- | --- | --- |
| C1 | **Denial code differs for existing vs missing records** (§7 of this report says non-participants get 404) | Low–Medium | Measured live: a foreign existing viewing → **403**, a nonexistent id → **404**. IDs are 20-hex random, so it is not practically enumerable, but it is a weak existence oracle and the documented claim is wrong. Either the documentation should say 403, or the handlers should return 404 for both. Not changed. |
| C2 | **A cancellation reason is not echoed in the notification** | Low | The reason is stored on the record, appears in the history and in the agent/admin screens, but the notification body says only "Status: Cancelled / Appointment: …". Cause: `viewing_apply_transition()` passes `$note ?? $reason`, and cancel passes an empty-string `note`, which is not null. A one-line fix, deliberately not applied during a verification pass; the new test pins the current behaviour so any change is intentional. |
| C3 | `awaiting_agent` remains a defined but never-assigned status | Cosmetic | Unchanged from the recovery assessment. |
| C4 | Legacy DB default `assigned_agent = 'Goodlucks Field Agent'` | Low | Still present in both schema files and in `create_viewing()`'s fallback. New rows pass an explicit name, so this only affects rows created before F; those rows display the old phrase. |
| C5 | Hard-coded invented agent name in the tenant dashboard | **Medium (pre-existing, outside F)** | `src/components/TenantDashboard.tsx:690` shows "Michael Quarshie (Goodlucks Lead Agent)" when no agent is assigned to a tenant request. That is fiction presented as a real person, and it conflicts with the project's no-fake-data rule. It predates F and was not touched; it should be fixed in a later pass. |
| C6 | No browser-level verification | Known | Stated in §16.4; mobile layout remains untested. |

### 16.7 Financial boundaries re-confirmed live

After a full request → proposal → confirmation → reschedule → completion → correction sequence against the live API:

| Check | Result |
| --- | --- |
| "Mark Completed & Paid" behaviour | absent from source and from the shipped bundles; no UI path marks a fee |
| Fee records created by the lifecycle | **0** — the ledger stayed empty throughout |
| `viewingFeesCollectedGhs` / `goodlucksShareReceivedGhs` / `outstandingReceivablesGhs` | all **0** |
| Completed viewing's financial state | `feeRecorded: false`, `collectedGhs: null`, `collectionState: "none"`, note "No fee has been recorded. A completed viewing does not create one." |
| 60/40 and 70/30 | still `provisional`, `appliedToCalculations: false`, both listed as "proposal only" |
| Approved policy rows | **0** |
| Remittance / commission settlement | none introduced; `rental_commission` exists only as an unused fee category label |

### 16.8 Confirmations for the closure pass

- Increment G **was not started**; no remittance, settlement, payout, gateway or agreement work was added.
- **Nothing was committed, pushed or deployed.** HEAD is still `cbd5ced`; the only file changed by this pass is `tests/api.test.mjs` (plus this documentation).
- The protected `.data/dev.sqlite` was **not** deleted, replaced or modified — its SHA-256 is unchanged and a verified backup exists.
- No production database was touched; the only database written was the disposable `.data/dev-closure.sqlite` created for this pass.
- No existing work was discarded, and no behaviour was altered: the two code-level findings (C1, C2) were recorded instead of changed.
