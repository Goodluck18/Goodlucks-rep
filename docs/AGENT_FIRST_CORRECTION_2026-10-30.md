# Agent-first correction — two account groups and one verification choice

**Date:** 2026-10-30
**Scope:** account terminology, registration, verification, listing access and every user-facing surface that named an
account type. No redesign, no new dependencies, no destructive migration, and no second authentication system.

## The rule this implements

1. There are exactly **two** account groups: **Tenant** and **Agent/Landlord**. An Agent and a Landlord are one
   account, not two registration types and not two sign-in flows.
2. An Agent/Landlord account says which it is **once, during verification**. That choice decides whether the account
   is verified as an Agent or as a Landlord, inside the same account, with no second registration or login.
3. Wherever the two are named together, **Agent comes first**: `Agent/Landlord`, `Agents and landlords`. `Landlord/Agent`
   does not appear anywhere in the product.
4. Existing authentication, verification, permissions and account data are untouched. Existing agent and landlord
   accounts keep working exactly as they did.

## What was wrong before

| Surface | Before | After |
| --- | --- | --- |
| Registration | Two groups, but a **mandatory third choice** ("Property provider type": Landlord / Agent) at sign-up | Tenant / Agent/Landlord only. The Agent-or-Landlord choice moved to verification |
| Registration copy | "This choice is fixed for the account… landlord and agent accounts separate" | "One account for Agents and Landlords… verification asks whether you are an Agent or a Landlord" |
| Login tab error | "This email is registered as a Landlord account. Please sign in using the Landlord tab." | Group-aware: "…as an Agent/Landlord account. Please sign in using the Agent/Landlord tab." |
| List Property (guest) | "Landlord Login Required", "Log In as Landlord to List", "Existing Landlord Sign-In", "Register New Account" | "Agent/Landlord Sign-In Required", "Log In as Agent/Landlord to List", "Existing Agent/Landlord Sign-In", "Register as Agent/Landlord" |
| List Property (signed in) | Agents were **refused**: the guard only allowed the `landlord` role | Agents and Landlords both reach the form; the server still decides per account |
| Viewing request | Provider block only detected the `landlord` role | Detects the Agent/Landlord account, wording "Agent/Landlord" |
| Find a Home | "Landlord / Agent" (wrong order) | "Agent/Landlord" |
| Dashboards | "Landlord account" / "Agent account" | "Agent/Landlord account" |
| About / Home / Browse / Footer / Blog / Property detail | "landlords and agents", "the landlord or agent" | "agents and landlords", "the agent or landlord" |
| Welcome email | "Your Landlord account is ready" / role-specific next steps | "Your Agent/Landlord account is ready" + the verification step |

## What the server does now

**Schema.** `users.provider_category` (nullable, `VARCHAR(16)`), added additively by `migrate.php`:

* `NULL` — classified by `role` (every existing account; no row is rewritten, nothing is re-asked);
* `'pending'` — an Agent/Landlord account that has not chosen yet;
* `'agent'` / `'landlord'` — the stored classification.

**Registration (`POST /api/auth/register`).** `role` is now an account *group*:

* `tenant` → a tenant account;
* `provider` (the website's Agent/Landlord account) → stored on the `agent` role with
  `provider_category = 'pending'`. It gets no agent profile and no permissions: with no approved profile an agent can
  do nothing, so a fresh account cannot act before it has chosen;
* `agent` / `landlord` (older clients) → read as having classified at registration, stored exactly as before.

The city and agency name given at registration are kept on the account (`users.address`, `users.company`) so the agent
profile created at the classification step uses them instead of asking twice.

**Classification (`POST /api/account/classification`).** Available once, to an Agent/Landlord account only:

* `agent` → role becomes `agent`, the usual deny-by-default agent profile is created (`pending_review`,
  `can_submit_listings = 0`), and staff approve it on the Agent Accounts screen;
* `landlord` → role becomes `landlord`, no agent profile;
* a second attempt is refused with 409. A genuine mistake is fixed by **staff** through the existing, audited
  `POST /api/admin/users/:id/role`, which now also keeps `provider_category` in step.

**Gates.** While an account is `pending` it can sign in, read its dashboard-free pages and nothing else:

* `POST /api/properties` → 409 with `fields.classificationRequired`;
* identity documents, identity submission and professional submission → 409 with `fields.classificationRequired`;
* `GET /api/verification` reports `providerCategory` and `classificationRequired` so the panel can lead with the
  question.

**Login (`POST /api/auth/login`).** `role` is the account group: `provider` matches an agent or a landlord account;
`tenant` matches a tenant. Messages name the group ("Agent/Landlord tab"), with correct articles.

**Admin surfaces.** The user directory and the user profile now report `providerCategory`, so staff can see an account
that has not chosen yet ("Has not chosen Agent or Landlord yet") instead of mistaking it for an agent. The correction
dropdown lists Agent first.

## Client changes

* `AuthModal` — two groups only; the mandatory third step is gone; a short note explains the verification question.
* `ProviderClassificationView` (`/verify/classification`) — the one-time Agent-or-Landlord page, Agent first, with a
  plain statement that it is not a second sign-up.
* `AppContext` — `login`/`register` take the account group; `chooseProviderCategory()` refreshes the account and moves
  to the dashboard that now applies. A pending account lands on the classification page after signing in and is
  redirected there from any dashboard route.
* `VerificationPanel` — a "Step 1 of verification" card for the same question, for an account that reaches the panel
  directly.
* `ListPropertyView` — providers only, with a "Choose Agent or Landlord" state instead of a form a pending account
  cannot submit; guest copy is Agent/Landlord throughout.
* `ViewingRequestModal`, `FindAHomeView`, `DashboardShell`, `AccountSettingsView`, `AboutView`, `HomeView`,
  `BrowseView`, `Footer`, `BlogView`, `PropertyDetailView`, `AdminUserProfile` — terminology.

## Tests

| Suite | Result |
| --- | --- |
| `tests/provider-classification.test.mjs` (new, 12 tests) | pass |
| `npm run test:api` (12 files, incl. the new one) | pass, 0 failures |
| `test:routing` 50 · `test:navigation` 64 · `test:content` 4 · `test:blog` 45 · `test:design` 14 | pass |
| `test:property` 23 · `test:sharing` 36 · `test:uploads` 20 · `test:responsive` 20 · `test:blog-html` 16 | pass |
| `test:admin-console` 16 · `phase3` 11 · `phase4` 12 · `phase5` 19 · `test:tenant-experience` 11 | pass |
| `test:fee-policies-phase4` 12 · `test:receipts-removed-phase7` 9 · `test:email-footer` 3 | pass |
| `tsc --noEmit` | clean |
| PHP lint, all 54 files | clean |
| `npm run build` | ok, entry 504.33 kB (147.47 kB gzip) |

Two copy assertions were updated because the requirement changed the wording they encoded
(`landlords and agents` → `agents and landlords`, `the landlord or agent` → `the agent or landlord`).

## What is still not verified here

* **No browser run** in this environment: the new page and the redirects are covered by `tsc`, the build and the API
  tests, not by a rendered screen. Manual check: open `/register` → Agent/Landlord → complete the form → you land on
  `/verify/classification`; choose Agent → `/agent/dashboard`; choose Landlord → `/landlord/dashboard`; reload
  `/agent/dashboard` on a still-pending account → you are taken back to the classification page.
* **MySQL not executed** — the migration is additive and was proven against SQLite only; the MySQL plan was checked
  statically. Run `php php-backend/migrate.php` (dry run) then `--apply` against the production backup before deploy.
* **Email not sent** — `EMAIL_TRANSPORT=none` in every test; the welcome-email wording is not delivery-tested.
* **Product decision left open:** an Agent/Landlord account that has not chosen still occupies the `agent` role
  internally (that is what makes it inert). If a future requirement needs a neutral stored role, that is a schema and
  permissions change, not a copy change, and it must not create a third account type.
