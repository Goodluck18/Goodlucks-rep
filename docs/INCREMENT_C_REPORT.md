# Increment C — Agent Account Foundation

Scope: give agents a real, first-class account on Goodlucks Homes — registration,
profile, account status, permissions and the *foundation* for submitting listings
on a landlord's behalf — without implementing any identity/licence verification,
viewing-fee workflow or commission logic.

Nothing was deployed, no production database was touched, and no commit or push
was made. All work is in the working tree on `arena/a67485fb-goodlucks-rep`.

---

## 1. What was implemented

### 1.1 A distinct `agent` role

`agent` is now part of the role vocabulary everywhere a role is validated or
interpreted:

* `php-backend/lib/validate.php` — `USER_ROLES = ['tenant', 'landlord', 'agent', 'admin']`.
* `php-backend/lib/api.php` — self-service registration accepts exactly
  `tenant | landlord | agent`. Anything else (notably `admin`) is refused with a
  422 and **no account is created**; it is never silently coerced to a tenant.
* Login accepts the role tab `agent` and enforces that the tab matches the
  account, so an agent cannot be nudged into a tenant session (or vice-versa) by
  the sign-in form.
* `src/types.ts` — `UserRole` gained `'agent'`; new `AgentProfile` /
  `AgentAccountStatus` / `AdminAgentAccount` types.
* `src/context/AppContext.tsx`, `src/services/apiService.ts` — `login`/`register`
  accept the agent role, plus a new `updateAgentProfile` action.
* `src/components/AuthModal.tsx` — a third **Agent** tab.
* `src/components/Navbar.tsx` — agent navigation (home, browse, agent dashboard,
  notifications) on desktop and mobile.
* `src/App.tsx` — `dashboard` / `profile` / `notifications` render the new
  `AgentDashboard` for agents.

Existing tenant, landlord and admin accounts are untouched: no data migration
rewrites `users.role`, and nothing in the code path changes what those roles can
do. Registration and sign-in for them still behave exactly as before (proved by
tests, see §6).

### 1.2 Agent registration (basic information only)

The Agent tab collects: full name, email, phone, password, **operating city
(required)** and **agency/business name (optional)**. That is all.

* `operatingCity` is required for agents and is stored in
  `agent_profiles.operating_city` — the city the agent *works from*.
* `users.address` (the "contact address" field) is **not** filled from the
  operating city for agents. The two concepts stay separate in the database and
  in the admin UI, which labels the operating base and the contact address
  differently.
* No Ghana Card, ID number, licence, certificate or any document upload is
  requested or accepted. There is no document table, no private-storage write and
  no verification record created.
* The welcome email says the agent account is **pending review** and that listing
  submissions open only after approval — it never claims the agent is verified or
  authorised.

An unrecognised `role` (e.g. `role: "admin"`) is refused with a field-level error
and no account is created. Extra client-supplied fields (`isVerified`,
`agentProfile`, `submittedByRole`, …) are ignored by the server.

### 1.3 Agent profile

New `agent_profiles` table, one row per agent, holding only what is needed to
distinguish an agent from any other account:

| field | purpose |
| --- | --- |
| `agency_name` | optional business name; "Independent agent" is shown when empty |
| `operating_city` | where the agent works (not a home address, not coverage) |
| `account_status` | `pending_review` \| `active` \| `suspended` (default `pending_review`) |
| `can_submit_listings` | 0/1, default `0`; only meaningful when the account is `active` |
| `status_note`, `reviewed_by`, `reviewed_at` | staff decision record |

Personal/contact details (name, email, phone, contact address) stay on `users`;
nothing is duplicated into the agent profile.

There is **no service-area system**. `shape_agent_profile()` returns
`serviceAreas: []` as a deliberately empty placeholder so a later increment can
add coverage without reshaping the API; nothing is computed from it.

**Screen:** `src/components/AgentDashboard.tsx` — account status, an explicit
"what has *not* been verified" panel, an editable agency name / operating city,
and the agent's own submitted listings. Agency name and operating city are the
only editable fields; status and permissions are never editable by the agent.

### 1.4 Status and permissions (deny by default)

* Registration creates the profile with `account_status = 'pending_review'` and
  `can_submit_listings = 0`. This is enforced in `create_agent_profile()`, not in
  the client, and the column defaults encode the same rule.
* `agent_can_submit_listings()` requires **both** `active` status and
  `can_submit_listings = 1`. A pending, suspended or merely "active but not
  permitted" agent cannot submit.
* Suspending an account forces `can_submit_listings = 0` in the same statement,
  so a suspension cannot leave a permission behind.
* Staff cannot hand listing permission to a non-active account: the API refuses
  the combination with a 422 (in addition to silently coercing it to `false`).
* Every agent-facing response states the truth: `identityVerified: false`,
  `professionalAuthorisationVerified: false`, `canModerate: false`. No badge,
  "licensed", "verified agent" or tier language exists anywhere.
* Agents get no admin access: `/admin/*` routes remain `require_auth(['admin'])`
  (verified by tests). Agents also cannot read receipts (`/api/receipts` is
  tenant/landlord/admin only) — the Increment B receipt restriction is unchanged.
* Registration/approval of an *account* is deliberately separate from any
  verification. Nothing in this increment writes `users.is_verified`,
  `properties.is_landlord_verified` or any verification record.

New endpoints:

| method | path | who |
| --- | --- | --- |
| `GET` | `/api/agent/profile` | the signed-in agent — own profile only |
| `PATCH` | `/api/agent/profile` | the signed-in agent — `agencyName`, `operatingCity` only |
| `GET` | `/api/admin/agents` | admin — review queue |
| `POST` | `/api/admin/agents/{userId}/status` | admin — approve / suspend / return to review |

The agent profile is always resolved from the session (`require_auth(['agent'])`
then `find_agent_profile_by_user($user['id'])`). No request field can select
whose profile is read or written — the ownership check is structural, not a
comparison that could be bypassed. Status changes are audited
(`agent.status_changed`) with `identityChecked: false` and `licenceChecked: false`
recorded explicitly so the audit trail cannot later be read as a verification.

**Screen:** `src/components/AdminAgentAccounts.tsx`, reachable from a new "Agent
Accounts" tab in the admin console.

### 1.5 Property submission foundation

The four actors are now stored separately on a listing:

* **submitting agent** → `properties.submitted_by_user_id` + `submitted_by_role = 'agent'`
* **landlord/owner** → `properties.landlord_id` (always a real landlord account)
* **property** → `properties.id`
* **approving moderator** → the existing moderation fields (`status`, admin
  actions), unchanged

Behaviour of `POST /api/properties` for an agent:

1. Requires an account that `agent_can_submit_listings()`; otherwise `403`.
2. Requires an explicit `landlordId` naming an existing **landlord** account;
   missing/unknown/non-landlord ids are `422`. The old "`landlord_name` = the
   creating user" behaviour is **not** applied to agents — an agent can never
   become the owner of the property by submitting it.
3. Copies `landlord_name` / `landlord_company` from the landlord account.
4. Records `submitted_by_role = 'agent'` and
   `landlord_authority_state = 'claimed_by_agent'` — a declaration that has not
   been checked.
5. Forces `status = 'pending'` and `is_landlord_verified = 0`. Client-supplied
   `status`, `isLandlordVerified`, `landlordAuthorityState` and `submittedByRole`
   are ignored.
6. Emails the agent (submitter) and the admins, with wording that the authority
   is a declaration Goodlucks has not yet verified.

`landlord_authority_state` values: `owner` (landlord submitted their own
listing), `claimed_by_agent` (agent declaration), `recorded_by_staff` (admin
created it), `not_applicable` (legacy rows and defaults).

Listing ownership rules (`can_manage_property`):

* admin → any listing;
* landlord → listings where `landlord_id` is their own id;
* agent → **only** listings where `submitted_by_user_id` is their own id;
* everyone else → none.

`GET /api/properties?mine=1` returns what the caller owns for landlords and what
they **submitted** for agents (via the new `submittedByUserId` filter). Agents can
edit/delete only their own submissions and cannot approve, verify or feature
anything.

`GET /api/properties` (public) is unchanged; a pending agent submission is not
public until an admin approves it, exactly like a landlord's.

---

## 2. Database changes

All additive. No table, column or row was dropped or rewritten; existing
tenant/landlord/admin records and all listings are untouched.

### `properties` (3 columns + 1 index)

| column | definition | notes |
| --- | --- | --- |
| `submitted_by_user_id` | `VARCHAR(64) NULL` | who actually submitted the listing |
| `submitted_by_role` | `VARCHAR(32) NULL` | `landlord` \| `agent` \| `admin` at submission time |
| `landlord_authority_state` | `VARCHAR(32) NOT NULL DEFAULT 'not_applicable'` | `owner` / `claimed_by_agent` / `recorded_by_staff` / `not_applicable` |

Index: `idx_prop_submitted_by (submitted_by_user_id)` (SQLite:
`CREATE INDEX IF NOT EXISTS`).

Legacy rows keep `NULL` / `'not_applicable'` — no backfill is attempted, because
guessing who submitted an old listing would be inventing history.

### `agent_profiles` (new table)

`id`, `user_id` (UNIQUE, `idx_agent_user`), `agency_name`, `operating_city`,
`account_status` (default `pending_review`, `idx_agent_status`),
`can_submit_listings` (default `0`), `status_note`, `reviewed_by`, `reviewed_at`,
`created_at`, `updated_at`.

No foreign key to `users` is declared (the schema does not use FKs anywhere);
the unique `user_id` index plus application-level checks enforce one profile per
agent. Deleting a user row is not part of any flow in this release.

### Where each change lives

1. `php-backend/database.sql` — MySQL install schema (authoritative).
2. `php-backend/schema.sqlite.sql` — SQLite schema used by the API and the test
   suite (three columns on `properties`, index, and the `agent_profiles` table).
3. `php-backend/migrate.php` — additive `ALTER TABLE ... ADD COLUMN` for existing
   MySQL installs, plus `agent_profiles` added to `$requiredTables`; `--apply`
   creates it from the `database.sql` definition inside a transaction and rolls
   back on failure. Dry-run by default; nothing destructive.

Also changed in `schema.sqlite.sql` for parity with MySQL:
`properties.is_landlord_verified` now defaults to `0` instead of `1`. Every insert
supplies the value explicitly, and MySQL already defaulted to `0`, so this only
removes a fresh-SQLite-only inconsistency where a forgotten value would have
looked verified.

---

## 3. Role and permission protection (security summary)

* All authorisation is server-side (`require_auth([...])`, `is_admin()`,
  `can_manage_property()`); the frontend only decides what to render.
* Role is never taken from the request on `/auth/me`, `/profile`, `/agent/profile`
  or any property route. `PUT /api/profile` cannot change `role` or `isVerified`.
* Registering with `role: "admin"` (or any other unknown value) is refused and
  creates nothing — proven by a test that then fails to log in with those
  credentials.
* Agent profile reads/writes resolve the profile from the session; passing another
  agent's `userId`/`profileId` in the body changes nothing (proven by test).
* Admin-only surfaces (`/admin/stats`, `/admin/agents`, agent status changes,
  `/admin/audit-logs`, `/admin/viewing-fees`) reject agents, tenants and
  landlords.
* Agents cannot read receipts or other tenants' data, and listings they do not
  submit are not visible to them in `mine=1` and not editable/deletable through
  the property routes.
* No sensitive data added to any public response: `public_user()` exposes the
  caller's **own** `agentProfile` only; `admin` fields (`reviewed_by`, contact
  address) appear only in the admin queue.
* No fake verification: no seed agent accounts exist (`dev_accounts.php` still
  seeds only admin/landlord/tenant), and no verification rows are created
  anywhere.

---

## 4. Agent ↔ landlord ↔ property relationship

The model this increment establishes, stated plainly:

```
users (role=agent) 1───1 agent_profiles        account status + listing permission
users (role=landlord) 1───* properties         ownership (landlord_id)
users (role=agent) 1───* properties            submission (submitted_by_user_id)
properties.landlord_authority_state            what has been established about authority
admin                                          approves the listing (status) and the account
```

Consequences, which are intentional:

* Submitting is **not** ownership. `landlord_id` is always the landlord account.
* Approving an agent account is **not** verification of the agent, and it is not
  evidence about any particular landlord.
* `claimed_by_agent` is stored as a claim. There is no consent capture, no
  landlord confirmation and no document check in this release, so nothing may
  display it as verified authority.
* A landlord whose account is named on an agent submission sees the listing in
  their own `mine=1` list (they own it), and their `landlord_name` is used on the
  listing — the agent's name never replaces it.

---

## 5. How agent registration works, step by step

1. Visitor opens **Sign in / Register → Agent** and submits name, email, phone,
   password, operating city, optional agency name.
2. `POST /api/auth/register` validates the fields server-side (including
   "operating city is required for agents"), refuses unknown roles, hashes the
   password, and creates the `users` row with `role='agent'`,
   `is_verified=0`.
3. In the same request `create_agent_profile()` inserts the profile with
   `pending_review` / `can_submit_listings = 0`. If that insert fails the user row
   is removed again so no half-registered agent exists.
4. `audit_log('agent.registered', …)` records the city presence and whether an
   agency name was given.
5. The session is issued; the response includes `agentProfile`, so the client can
   show "pending review" immediately. The welcome email says the same.
6. The agent lands on the Agent Dashboard, can complete agency name / operating
   city, and cannot submit listings until an admin approves the account.

---

## 6. Tests and actual results

Command: `npm run test:api` → **111 tests, 25 suites, 111 pass, 0 fail** (run after
all changes; `REGISTER_RATE_LIMIT_PER_HOUR` raised for the suite only).

The eight required cases, and where they are covered
(`tests/api.test.mjs` → `Agent accounts (Increment C)`):

| # | requirement | test |
| --- | --- | --- |
| 1 | an agent registers with the correct role | *an agent registers with the agent role and keeps it* — response, `/auth/me` and a fresh login all report `agent` |
| 2 | an agent is not silently converted | same test (role survives sign-in) + *a privileged role is refused instead of being coerced to a tenant* (registration suite) for arbitrary roles |
| 3 | a tenant cannot gain agent permissions by manipulation | *a tenant cannot gain agent permissions by manipulation* — `role`/`isVerified`/`agentProfile` in the request body are ignored; `/agent/profile`, `mine=1`, property creation and admin status changes all return 403 |
| 4 | an agent cannot access another agent's private profile | *an agent cannot read or edit another agent profile* — endpoint always returns the session's profile; body `userId`/`profileId` ignored; `/admin/agents` 403 |
| 5 | a new agent is not auto-verified/authorised | *a new agent is never auto-verified or auto-authorised* — `isVerified:false`, `pending_review`, `canSubmitListings:false`, `identityVerified:false`, `professionalAuthorisationVerified:false`, listing attempt 403 |
| 6 | existing tenant + landlord registration still works | *existing tenant and landlord registration keeps working* — both roles, no agent profile, landlord still creates a self-owned listing (`submittedByRole='landlord'`, `landlordAuthorityState='owner'`, pending, unverified) |
| 7 | existing auth and admin permissions intact | *existing admin and authentication rules are unchanged* + the pre-existing suites — admin stats/audit work, agents/tenants blocked from admin routes, anonymous `/auth/me` returns `null`, `agent.status_changed` is audited |
| 8 | submission relationships do not falsely establish ownership/verification | *agent submission is recorded separately from ownership and verification* and *an agent submission requires a real landlord and cannot skip it* — owner is the landlord, submitter is the agent, `claimed_by_agent`, `isLandlordVerified:false`, `status:'pending'`, self-approve/self-verify 403, another agent cannot see/edit/delete it |

Additional coverage: suspension closes submissions again, contradictory
"active=false + canSubmit=true" combinations are refused, and invalid status
strings are rejected.

Other verification, all run after the final change:

| check | result |
| --- | --- |
| `npm run lint` (`tsc --noEmit`) | pass, 0 errors |
| `tsc --noEmit` with `@types/react` installed locally (`--no-save`, not in `package.json`) — JSX is actually type-checked | pass, 0 errors |
| `npm run build` (production bundle) | pass (vite build + esbuild server bundle) |
| `php-wasm-cli -l` on every file under `php-backend/` | pass, no syntax errors |
| Fresh SQLite database booted from `schema.sqlite.sql` (inside the test run) | pass — new columns, index and table created |
| MySQL DDL / `migrate.php --apply` | **not verified** — no MySQL server in this environment (see §8) |

Not run: browser end-to-end click-through of the new screens (no browser in this
environment), and any MySQL execution.

---

## 7. Files changed in this increment

Modified:

* `php-backend/database.sql` — `properties` columns + index, `agent_profiles` table
* `php-backend/schema.sqlite.sql` — same changes for SQLite; `is_landlord_verified` default parity
* `php-backend/migrate.php` — additive column migrations, `$requiredTables` entry
* `php-backend/lib/validate.php` — `agent` in `USER_ROLES`
* `php-backend/lib/auth.php` — `public_user()` exposes the caller's own `agentProfile`; `can_manage_property()` handles agent submissions
* `php-backend/lib/repository.php` — agent profile read/create/update/status functions, `shape_agent_profile()`, `agent_can_submit_listings()`, `list_agent_profiles()`, `create_property()` provenance columns, `shape_property()` provenance fields, `query_properties()` `submittedByUserId` filter, agent counters in `analytics_stats()`
* `php-backend/lib/api.php` — agent registration, login role enforcement, agent/admin agent routes, agent-aware property create/update/delete/upload/list, submission emails
* `src/types.ts` — `agent` role, `AgentProfile`, `AdminAgentAccount`, property provenance fields, agent analytics counters
* `src/services/apiService.ts` — agent registration fields, `getAgentProfile`, `updateAgentProfile`, `listAgents`, `setAgentStatus`
* `src/context/AppContext.tsx` — register/login signatures, `updateAgentProfile`, agent data bootstrap, `mine=1` for agents
* `src/App.tsx` — `AgentDashboard` route
* `src/components/AuthModal.tsx` — Agent tab, operating city / agency name fields, honest notice
* `src/components/Navbar.tsx` — agent navigation (desktop + mobile)
* `src/components/AdminDashboard.tsx` — "Agent Accounts" tab + agent count in the user summary
* `tests/api.test.mjs` — agent suite; the old "agent accounts are not available" test became "a privileged role is refused"

Created:

* `src/components/AgentDashboard.tsx`
* `src/components/AdminAgentAccounts.tsx`
* `docs/INCREMENT_C_REPORT.md` (this file)

No other page was redesigned, no existing feature was removed, and no
package dependency was added (`@types/react` was installed with `--no-save` for
local type-checking only; `package.json`/`package-lock.json` are unchanged).

---

## 8. Limitations and Increment D dependencies

Deliberate limitations of this increment:

1. **No identity or licence verification.** `identityVerified` and
   `professionalAuthorisationVerified` are hard-coded `false`. Increment D must
   add the document model, private storage, review queue and real states —
   including a way to revoke. Until then no UI may imply verification.
2. **Landlord authority is only a claim.** `claimed_by_agent` is stored but never
   confirmed. A consent/authority step (landlord confirms the agent, or staff
   checks a signed authority) is a follow-up; it is *not* implemented here and
   must not be displayed as if it were.
3. **An agent can only list for a landlord who already has an account.** Free-text
   owners (an owner without a Goodlucks account) are not modelled yet, because
   that would require an owner record and an authority claim with no way to check
   it. This is the main reason the agent submission form is not exposed in the UI.
4. **The agent UI cannot submit a listing yet.** The backend path is complete and
   tested, but the frontend would have to let an agent type or pick a landlord
   account id. Exposing that without owner records/consent (item 3) would encourage
   unverified declarations, and an "enter the landlord's email" lookup would leak
   whether an address has a landlord account. The Agent Dashboard says so
   explicitly instead of offering a broken form. Wiring the form is expected in
   the increment that introduces owner records + consent.
5. **No service areas, tiers, fees, viewings or commissions.** `serviceAreas` is an
   empty placeholder. Viewing fees, 60/40 and 70/30 remain provisional and are
   still applied nowhere; agents cannot create fee records or view the ledger.
6. **Receipts unchanged.** Agents cannot see or issue receipts; receipt issuing is
   still disabled. No tenancy-agreement functionality was reintroduced.
7. **No agent-specific notifications/email beyond the existing welcome and
   submission emails** — for example there is no "your account was approved"
   email yet; the status is visible in the dashboard. Small follow-up.
8. **MySQL is unverified.** No MySQL/MariaDB server is available in this
   environment, so the MySQL DDL and `migrate.php --apply` have only been reviewed,
   not executed. The SQLite path is executed by the entire test suite. Final
   testing on a MySQL copy is required before these changes are applied to
   production, and `migrate.php` should be run as a dry run first.
9. **Legacy listings have no provenance.** Rows created before this increment keep
   `submitted_by_user_id = NULL` and `landlord_authority_state = 'not_applicable'`;
   they are not backfilled on purpose.
10. **`can_manage_property` for agents is submission-based, not authority-based.**
    If a landlord later disputes an agent, staff must suspend the account (which
    closes submissions) — there is no per-listing revocation yet.

Confirmations required by the brief:

* No deployment, no production database access or modification, no commit and no
  push were performed for this increment.
* Increment A/B work (agreements retired, receipt issuing restriction, viewing-fee
  ledger, business-model assessment) is preserved unchanged.
* No business policy was invented: 60/40 and 70/30 are still provisional and used
  in no calculation; no fee, commission or payment behaviour was added.
