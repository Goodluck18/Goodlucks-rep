# Upgrade 2 — Phase 5 report (tenant experience)

**Date:** 2026-11-10
**Branch:** `arena/1dbf260c-goodlucks-rep`
**Base commit:** `5316609` (Phase 4)
**Scope:** B1 move-in date · B2 real match scores + administrator area adjacency · B3 chosen-for-you vs similar matches · B4/B5 viewing lifecycle with tenant acceptance · B6 controlled tenant-contact disclosure · D1 three-request cap

Nothing was deployed. No production database was touched. Every schema change is additive.

---

## 1. What was required, and what was delivered

| Ref | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| B1 | Remove the fabricated move-in date; ask for it and require it | **Done** | `FindAHomeView.tsx` starts empty, blocks submit, `type="date" required`; server rejects with `422` + `fields.moveInDate` |
| B2 | Real match scores, not a decorated constant | **Done** | `lib/matching.php`: documented 100-point weighted sum, per-factor breakdown, explicit "no proximity recorded" detail |
| B2 | Proximity from administrator-maintained area adjacency | **Done** | `area_adjacency` table + 3 admin routes + `AdminAreaAdjacency.tsx`; undirected, normalised keys |
| B3 | Administrator-chosen properties shown separately and first | **Done** | `/api/matches` returns `curatedForYou` and `similarMatches`; dashboard renders "Chosen for you" above "See similar matches" |
| B4/B5 | Viewing lifecycle with tenant acceptance | **Done** | Transition matrix in `viewings.php`; `accept-reschedule` / `decline-reschedule`; provider reschedule requires a reason |
| B6 | Close the tenant-contact leak, then build request → review → approve → revoke | **Done** | `lib/contact_disclosure.php`, `contact_disclosures` table, 7 routes, staff queue, provider request button, tenant "Who has your contact details" panel |
| D1 | At most three rental requests in progress; fourth blocked server-side | **Done** | `TENANT_REQUEST_PENDING_LIMIT = 3`; `409` on the fourth; unblocked when one leaves the counting statuses |

### B1 — the move-in date is a real answer

`FindAHomeView.tsx` previously seeded `useState(new Date(Date.now() + 7 days).toISOString().slice(0, 10))`, so every
tenant silently sent a date they never chose. That default is gone: the field starts empty, submission is blocked with
an explicit message, and the input is `type="date" required aria-required="true"`.

The server is the backstop: `handle_create_tenant_request` runs `valid_date_iso()` and answers
`422 {"fields":{"moveInDate":"Choose a valid move-in date."}}`. September 2026 requests already in the database were
left untouched — only the form default was removed, per the approved decision on historical records.

### B2 — the score means something

`MATCH_WEIGHTS` (the single place the numbers live):

| Factor | Max | What it measures |
| --- | --- | --- |
| budget | 35 | rent inside the stated range (75% credit when below the range) |
| location | 20 | listing is in one of the preferred areas |
| proximity | 15 | listing is in, or adjacent to, a preferred area |
| type | 10 | property type matches |
| bedrooms | 10 | at least the requested bedrooms |
| bathrooms | 10 | at least the requested bathrooms |

Total 100. Every row returns `reason`, `breakdown[{factor,label,points,max,detail}]` and a `band`
(strong ≥ 85, good ≥ 65, possible ≥ 45). The breakdown sums to the score — asserted in the test suite rather than
assumed.

**Proximity before coordinates.** The platform has no geocoded listings, so proximity is read from an
administrator-maintained `area_adjacency` table (band 1 = next to, band 2 = same district). Keys are normalised
(lower-case, punctuation stripped, trailing `" accra"` removed, sorted) so the pair is undirected and cannot be
duplicated by re-entering it the other way round. When an area has no recorded relationship, proximity scores **0**
and the detail says *"no proximity is recorded for this area"* — the number never pretends to know a distance.
`properties.latitude/longitude` exist as nullable columns for a future geocoding step; nothing writes them.

### B3 — two promises, two lists

`/api/matches` returns:

* `curatedForYou` — the administrator's shortlist, in the order they chose it, validated (live listings only, no
  duplicates, at most 6).
* `similarMatches` — everything else, ordered by score, top 12. A shortlisted property is never repeated here.
* `curationWarning` — non-null when the shortlist has 1–2 properties, so a thin list is labelled rather than dressed
  up as a considered recommendation.

Design decision recorded here: three is the point at which a shortlist reads as a recommendation, and the console
nudges staff towards it ("Choose at least three so the shortlist reads as a recommendation"), but it is **not** a hard
floor. A single-property match is a legitimate record that has always existed (and is still produced by
`tests/api.test.mjs`), so the server accepts 1–6 and labels anything below three. More than six is refused with `422`
— that is a search result, not a recommendation.

The tenant dashboard shows "Chosen for you" first (interactive border, count, warning when present), then "See similar
matches" with a `${band} · ${score}%` badge and a `Why these scores?` disclosure listing each factor's points and
detail.

### B4/B5 — the tenant decides whether an agreed appointment moves

The lifecycle is a validated matrix, not a pile of `if`s:

* `enquiry_received → viewing_requested` (tenant, admin)
* request-ish states → `proposed | viewing_requested | awaiting_agent` (agent, landlord, admin); `cancelled` (all four
  roles); `could_not_proceed` (providers)
* `proposed → confirmed` (all four roles)
* `confirmed → reschedule_requested | cancelled` (all four); `completed | tenant_no_show | agent_no_show |
  could_not_proceed` (providers, with `agent_no_show` also available to the tenant)
* `reschedule_requested → rescheduled | confirmed` — **tenant and administrator only**
* `rescheduled` behaves like `confirmed`; every terminal state has no exits (an administrator must correct it, with a
  reason, through the audited path)

So an agent or landlord can no longer move an agreed appointment on their own. `reschedule` now requires a written
reason (`422` with `fields.reason` otherwise), sets `reschedule_requested` for everyone except an administrator, and
leaves the standing slot in place until the tenant accepts. `accept-reschedule` applies the **stored**
`preferredDate`/`preferredTime`; `decline-reschedule` returns to `confirmed` with the original slot. Both are refused
for providers (`403`), which the behavioural suite asserts by having the landlord attempt an acceptance.

The tenant card shows the proposed slot, "Accept the new time" and "Keep the agreed time"; the agent panel states
*"The tenant sees your reason and must accept the new time"* and blocks a reschedule with an empty note.

### B6 — tenant contact is withheld until staff approve it

The leak is closed first: `viewing_tenant_contact_state()` is the single place that decides, and
`viewing_for_viewer()` blanks `tenantPhone`/`tenantEmail` for anyone who is not the tenant themselves or staff.
Providers get `tenantContactVisible: false` and a state such as `withheld_pending_approval` with a reason they can
read. Nothing in `viewing_notify()` interpolates the tenant's phone or email, so viewing emails cannot carry it.

On top of that:

* `contact_disclosures` — one row per (viewing, provider).
* `POST /viewings/:id/request-contact` — provider only, must be the provider responsible for that viewing, needs a
  non-empty reason; asking again while pending/approved is `409`; a re-request after rejected/revoked/expired reuses
  the row.
* `POST /admin/contact-disclosures/:id/decision` — staff only; `approve`/`reject` from pending, `revoke` from approved;
  reject and revoke require a note; approval expires after 30 days.
* `GET /admin/contact-disclosures` (queue), `GET /contact-disclosures` (the tenant's own record).
* Audit entries `contact_disclosure.requested|approved|rejected|revoked`, an email to the official desk on request, a
  notification + email to the provider on the decision, and a notification to the tenant when details are shared or
  withdrawn.

Approval is per viewing, not per provider: approving one viewing never opens another, which the suite proves by
assigning the same agent to a second viewing and checking the contact is still withheld.

### D1 — three rental requests in progress

`TENANT_REQUEST_PENDING_LIMIT = 3`, counted only over the statuses that mean "in progress"; `matched`, `completed`
and `cancelled` free the slot. A fourth is `409` with a message naming the limit, and the response carries
`limit: 3`. Rental requests and viewing requests are counted separately — the cap never looks at viewings.

---

## 2. Files changed

**New (6)**

| File | Purpose |
| --- | --- |
| `php-backend/lib/matching.php` | Weights, scoring, area normalisation, adjacency CRUD, bands |
| `php-backend/lib/contact_disclosure.php` | Request → review → approve → revoke, expiry, serialisation helpers |
| `src/components/AdminAreaAdjacency.tsx` | Staff panel for recording area relationships |
| `src/components/AdminContactDisclosures.tsx` | Staff queue for tenant-contact requests |
| `tests/tenant-experience.test.mjs` | 11 behavioural tests (B1, B2, B3, B5, B6, D1) |
| `tests/admin-console-phase5.test.mts` | 19 source invariants |

**Modified (16)**

`php-backend/config.php` (require the two libraries) · `php-backend/database.sql`,
`php-backend/schema.sqlite.sql` (`contact_disclosures`, `area_adjacency`, `properties.latitude/longitude`) ·
`php-backend/migrate.php` (both tables in `$requiredTables`, nullable coordinates) · `php-backend/lib/api.php`
(routes + handlers: adjacency, disclosures, curated matches, accept/decline, D1 cap) ·
`php-backend/lib/validate.php` (the limit) · `php-backend/lib/viewings.php` (matrix, contact state, notifications) ·
`src/types.ts`, `src/services/apiService.ts` (surface) · `src/context/AppContext.tsx` (action union) ·
`src/components/FindAHomeView.tsx` (B1) · `src/components/TenantDashboard.tsx` (curated/similar, reschedule
accept/decline, disclosure panel) · `src/components/AdminDashboard.tsx` (shortlist chooser, both new panels) ·
`src/components/AgentViewingsPanel.tsx` (reschedule reason, contact request) · `tests/api.test.mjs` (legacy
expectations updated to the new lifecycle) · `package.json` (two test scripts).

---

## 3. Test results (all executed on this branch, this commit)

| Suite | Result |
| --- | --- |
| `tests/tenant-experience.test.mjs` (new) | **11 / 11** |
| `tests/admin-console-phase5.test.mts` (new) | **19 / 19** |
| `tests/api.test.mjs` — suites 1–29 | **177 / 177** |
| `tests/api.test.mjs` — suite 30 (concurrency/rollback) | **14 / 14** |
| `tests/account-settings.test.mjs` | 7 / 7 |
| `tests/tenant-contact.test.mjs` | 10 / 10 |
| `tests/admin-console-api.test.mjs` | 9 / 9 |
| `tests/user-management.test.mjs` | 15 / 15 |
| `tests/bulk-email.test.mjs` | 14 / 14 |
| `tests/primary-admin.test.mjs` | 16 / 16 |
| `tests/migration.test.mjs` | 14 / 14 |
| `tests/concurrency.test.mjs` | 6 / 6 |
| `tests/task03.test.mjs` | 50 / 50 |
| `tests/access-control.test.mjs` | 13 / 13 |
| `tests/routing.test.mts` | 50 / 50 |
| `tests/app-navigation.test.mts` | 61 / 61 |
| `tests/blog.test.mjs` | 45 / 45 |
| `tests/sharing.test.mts` | 36 / 36 |
| `tests/property-seo.test.mts` | 23 / 23 |
| `tests/uploads.test.mts` | 20 / 20 |
| `tests/responsive.test.mts` | 18 / 18 |
| `tests/blog-html.test.mts` | 16 / 16 |
| `tests/admin-console.test.mts` | 16 / 16 |
| `tests/design-tokens.test.mjs` | 14 / 14 |
| `tests/content.test.mjs` | 4 / 4 |
| `tests/email-footer.test.mjs` | 3 / 3 |
| `tests/admin-console-phase3.test.mts` | 11 / 11 |
| `tests/admin-console-phase4.test.mts` | 12 / 12 |
| `tests/fee-policies-phase4.test.mjs` | 12 / 12 |
| **Total** | **716 / 716, 0 failures** |

Other gates: `tsc --noEmit` clean; `npm run build` ✓ (5.20 s, 506 kB main chunk); `php-wasm-cli -l` clean on all eight
touched PHP files.

### The one test-harness problem, and how it was handled

`npm run test:api` runs `tests/api.test.mjs` in a single PHP-WASM server process, and that server **stops answering
after ~1014 requests** (measured directly: a probe of 1,100 `GET /api/health` calls died on request 1014; a full run
wedged at the same request count, always in the last suite's `POST /admin/finance/remittances/:id/confirm`, which
then failed as `fetch failed` after the 300 s undici headers timeout). The same file passes standalone in 13 s, and
the suite that "failed" is untouched by Phase 5 — it is a ceiling in the dev tool, not in app code. It was
reproducible at Phase 4 too once enough requests were made in one session (`docs/TASK_CORRECTIONS_2026-11-06.md`
records the same symptom being worked around before).

Rather than report a false failure, the file was run in two server sessions — suites 1–29, then suite 30 — and both
slices are reported above. **Every one of the 191 tests in that file executed and passed**; nothing was skipped.
`npm run test:api` will still wedge on a machine with the WASM runtime and no native PHP; with native PHP the ceiling
does not apply.

---

## 4. Security, privacy and data integrity review

* **Tenant contact** — only the tenant themselves, staff, or a provider holding an unexpired approval can receive
  `tenantPhone`/`tenantEmail`. The check is centralised (`viewing_tenant_contact_state`) so a new endpoint cannot
  accidentally bypass it; a test asserts the serialised values are empty strings, not merely hidden in the UI.
* **Provider contact** — unchanged: never exposed publicly by Phase 5.
* **Authorisation** — every Phase 5 route is role-guarded (`require_auth(['admin'])` for staff routes; provider routes
  additionally verify the caller is responsible for *that* viewing). Tests cover tenant→admin queue (`403`), provider
  accepting on the tenant's behalf (`403`), and an unrelated agent requesting contact (`403`).
* **Audit trail** — every disclosure decision and agent assignment is audited; viewing events record actor, previous
  slot and new slot.
* **Migrations** — additive only: two new tables and two nullable columns. `migrate.php` lists the new tables in
  `$requiredTables` so an existing database is upgraded in place without touching existing rows.
* **Rate limits** — `request-contact` and the decision endpoint sit behind the existing `viewing-action` limiter;
  adjacency writes behind an `area-adjacency` limiter (120/hour).
* **No simulated data** — adjacency rows are administrator input; scores are computed from stored listing and request
  fields; missing data scores zero and says so.

---

## 5. Outstanding items / known limitations

1. **`npm run test:api` cannot finish in this sandbox** for the PHP-WASM reason above. It is a harness limitation;
   the tests pass when the file is run in two sessions.
2. **No coordinates.** Proximity is adjacency-only until listings are geocoded; the columns exist but are never
   written. This matches the approved decision.
3. **Shortlist floor is a nudge, not a rule** (1–6 accepted, <3 labelled, >6 refused). Recorded in §1 B3.
4. **Approval expiry is 30 days** and is evaluated at read time; an expired approval is reported as `expired` and no
   scheduled job is needed. A cron sweep is not required for correctness.
5. **No browser/visual check** was possible here (no Chrome/Playwright in the sandbox). UI claims in this report are
   based on the source and on `tsc`/build passing, not on rendering.

---

## 6. Deployment steps for this phase

1. Upload the changed `php-backend/` files (including the two new `lib/` files).
2. Run the migrator once against the production database **when deployment is authorised**:
   `php php-backend/migrate.php` — it creates `contact_disclosures` and `area_adjacency` and adds the two nullable
   `properties` columns. No existing row is modified.
3. No configuration change is required. `OFFICIAL_EMAIL` continues to receive the disclosure desk email.
4. Nothing else is needed: the SPA picks up the new endpoints from the same build.

Deployment was **not** performed and remains unauthorised.
