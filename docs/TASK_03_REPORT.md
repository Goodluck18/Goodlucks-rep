# Task 03 — Provider Registration, Identity Verification, Professional Verification, Commission Tiers and Property Viewing Fees

Status: **implemented and tested on the API + build level; not launched, not browser-verified, not MySQL-verified.**
This report covers **Number 3 only**. Numbers 4–8 of the brief were **not** implemented (see point 20).

Branch: `arena/3cb95f8c-goodlucks-rep`, branched from `main` at `070ddf4` (Task 02 merge).

---

## 1. Registration changes

- The existing single registration endpoint (`POST /api/auth/register`) was extended, not duplicated.
- Two user groups are offered: **Tenant** and **Agent/Landlord**. A provider **must** choose **Landlord** or **Agent**; the value is validated server-side (`providerCategory` must be `landlord` or `agent` — anything else is a `422` on `providerCategory`).
- Providers also supply `officialName` — the name printed on their Ghana Card — which is stored in the new `users.official_name` column and used as the legal name for identity verification.
- Tenant registration is unchanged: no category, no legal name, no verification obligation.
- Existing (pre-Task-03) accounts keep working: `official_name` is nullable, `provider_category` falls back to the existing `role`, and no account is asked for a Ghana Card it never supplied.
- Backend roles `landlord` and `agent` remain **separate**. The category a person picks at registration only fixes which provider role their one account uses; **one account per person**.

## 2. Landlord vs Agent distinction

- `providerCategory` is enforced at registration and stored on the user; it is never read from a request to decide anything later — the server looks at `users.role`.
- No silent landlord↔agent switching: the category is fixed for the life of the account (`PATCH /api/admin/users/{id}` style change only by an admin, and even that is a deliberate admin action, not a self-service toggle). Attempts to send a different category through profile/settings updates are ignored.
- Landlords are exempt from agent professional verification and from agent commission tiers; landlord listings keep their existing ownership/submission/viewing path.
- No existing accounts are merged, relabelled or deleted.

## 3. Ghana Card identity verification

- Required for **both** landlords and agents; not for tenants.
- Fields: legal name (`officialName`) + card **front** + card **back**, all tied to the authenticated account (`verification_documents.user_id`).
- Statuses: `not_submitted → pending_review → approved | rejected | resubmission_required`. Uploading only ever produces `pending_review`; **only an admin approval marks a user verified**.
- Admin can open each stored image (protected download endpoint), approve, reject with a reason, or request resubmission. Every action is written to the audit log.
- Security: documents live outside the public tree in private storage under server-generated names; access requires an admin reviewer (or the owner for their own document); a guest gets `401` and an unrelated user `403`. Documents are never exposed on property pages, never in public API payloads, and no document bytes or private paths appear in logs or audit entries. Uploads are MIME- and content-checked, size-limited, name-generated server-side and path-traversal safe.
- No claim of encryption at rest is made anywhere in the UI or the code.
- Per-document review (added in this task) lets an admin accept or reject each side of the card with a note, while the overall verification status remains a separate, explicit decision.

## 4. Professional / regulatory verification (agents)

- **Optional** and **separate** from identity. Landlords are never asked for it.
- Multi-document: an agent can upload several documents of different kinds (licence, registration certificate, regulatory body letter, etc.) instead of one fixed certificate.
- Each document carries its own review state; the overall professional state is computed from those documents plus an explicit admin decision.
- **Uploading never upgrades anything**: no tier change, no status change, no notification claiming approval. Only admin approval moves the professional record to `approved`.
- Rejection carries a reason and the agent can resubmit.

## 5. Admin interface

- Extended the existing admin dashboard and verification queue — no second admin system.
- `AdminVerificationQueue`: identity and professional queues, per-document Accept/Reject with note and status pill, overall approve/reject/resubmission decisions with reason, protected image viewing.
- `AdminViewingTermsQueue` (new component, rendered inside the existing admin *manage* tab): pending fee/terms change requests with approve/reject.
- Admin finance panel shows the applied commission tier, why it applies, the percentages, and the stored split per transaction.
- Admin can see the tier; there is **no unrestricted manual tier override** — the tier is derived from approved records.

## 6. Commission tier implementation

- **Tier A** = identity approved → agent share **60%**.
- **Higher tier** = identity **and** professional approved → agent share **70%**.
- The percentages are applied to the **commission amount already agreed under the existing arrangement**; the platform's total commission rate was not invented, replaced or redefined.
- The tier is computed **server-side** in `agent_tier_state()` from verified records; a tier or percentage sent from the frontend is ignored.
- The server computes the agent share and the Goodlucks share and stores the applied tier, both percentages and both amounts on the transaction (`rental_commissions.agent_tier | agent_share_percent | goodlucks_share_percent | agent_share_ghs | goodlucks_share_ghs`).
- Property viewing fees are **never** run through the 60/70% split.

## 7. Historical split preservation

- Each commission carries a frozen snapshot: agent id, tier, agent %, platform %, commission amount, agent share, Goodlucks share, date and payment reference, plus a snapshot hash.
- New transactions are priced with the current approved tier; **old transactions are never recalculated** when a tier changes later.
- The admin and agent finance panels read the stored snapshot rather than recomputing, so a historical split always shows what was actually applied.

## 8. Property-specific viewing fee

- Every agent listing carries its own `viewing_fee_ghs`, entered at submission, validated as a positive GHS amount (no negatives, no strings, no missing value).
- The old hardcoded **GH₵ 100** default was removed: `VIEWING_FEE_GHS` now defaults to `0` in `config.php`, the `.env.example` entry was deleted, and the literal in `PropertyDetailView.tsx` was replaced with the property's approved fee.
- A viewing fee is not rental commission and not a platform share; the 60/70% tiers never touch it.
- The fee and terms appear on the published listing and inside the viewing-request flow (`feeAmountGhs` + `viewingTerms` in the viewings API).
- An agent cannot read or change another agent's property fee: the endpoints check owner/submitter server-side and return `403`.

## 9. Viewing terms

- Per property: appointment required?, how to arrange, conditions, payment instructions, restrictions — all required text fields, validated together with a per-field error map (`viewingTerms.<field>`).
- A listing is not public until its fee and terms are approved (`viewing_terms_state = pending_review` before that).
- Unpublished or rejected terms are never shown on public pages.
- Changes to an approved property's fee or terms become a **proposal** (`202` + `viewingTermsChange`); the previously approved values stay live until an admin approves the change. Every proposal keeps its own history (`property_viewing_fee_changes`), viewable at `/api/properties/{id}/viewing-terms/history`.
- The approved fee and terms are snapshotted onto the viewing appointment (`viewing_schedules.fee_amount_ghs` + `viewing_terms_snapshot_json`) so later edits do not rewrite history.

## 10. Ownership and attribution

- `landlordId`, `submittedByUserId`, `submittedByRole` and `landlordAuthorityState` are preserved exactly as before.
- An agent submitting on a landlord's behalf never acquires ownership; the authority state and its checks are unchanged and still server-enforced.
- Nothing in this task merges, deletes or reassigns an owner or a submitter.

## 11. Property approval workflow

- The existing admin review was extended, not replaced: validate → `pending` → approve/reject with a reason → only approved listings are public.
- Approval now also activates the submitted fee/terms (and approves a pending fee-only change); rejection notifies the agent and leaves the previous approved values in force.
- Admin approval of a *pending change* and admin approval of the *listing* are handled by the same decision path, so an admin cannot approve one and forget the other.

## 12. Notifications

- Reuses the existing notification infrastructure and unread/read behaviour, with no duplicates on refresh and no fake email/SMS claims.
- Emitted for: identity submitted/approved/rejected, professional submitted/documents approved/rejected, higher tier granted, property submitted/approved/rejected, and viewing fee/terms change submitted/approved/rejected.
- Each notification links to the relevant dashboard area.

## 13. Endpoints added or extended

New/extended, all reusing existing handlers where one existed:

- `POST /api/auth/register` — accepts `providerCategory` + `officialName` (validated).
- `GET /api/verification` — summary now includes `officialName`, `role` and per-document review state.
- `POST /api/admin/verifications/documents/{id}/review` — **new**; `{decision: accept|reject|pending, note}`; reviewer capability required, self-review `403`, reject without a ≥5-character reason `422`, never changes the overall verification status.
- `POST /api/properties` — agents must send `viewingFeeGhs` (> 0) and a complete `viewingTerms` object.
- `PUT /api/properties/{id}` — a fee/terms edit becomes a proposal (`202`).
- `POST /api/properties/{id}/viewing-terms` — **new**; submit a fee/terms change (`202`), `403` unless owner/submitter.
- `GET /api/properties/{id}/viewing-terms/history` — **new**; `{current, changes}`.
- `GET /api/admin/viewing-terms/changes?status=pending_review` — **new**.
- `POST /api/admin/viewing-terms/changes/{id}/decision` — **new**; `{decision: approve|reject, note}`, a second decision is `409`.
- `POST /api/properties/{id}/status` — admin approve/reject also settles a pending fee change and notifies the agent.
- `POST /api/viewings` — returns `feeAmountGhs` (`null` when none) and `viewingTerms`, and snapshots them.
- `GET /api/viewings/{id}` — `200` for the responsible agent or staff, `401` for a guest, `403` for an unrelated user.

## 14. Database and migrations

All changes are additive, MySQL- **and** SQLite-compatible, and repeated in `database.sql`, `schema.sqlite.sql` and `migrate.php`:

- `users.official_name`
- `properties.viewing_fee_ghs | viewing_terms_json | viewing_terms_state (default 'not_set') | viewing_terms_updated_at | viewing_terms_approved_by`
- `viewing_schedules.fee_amount_ghs` (default `0.00`) + `viewing_terms_snapshot_json`
- `rental_commissions.agent_tier | agent_share_percent | goodlucks_share_percent | agent_share_ghs | goodlucks_share_ghs | split_snapshot_json | split_snapshot_hash | split_frozen_at`
- `verification_documents.review_status (default 'pending') | review_note | reviewed_by | reviewed_at`
- New table `property_viewing_fee_changes` (+2 indexes)

No table or column was dropped, renamed or reset; no user, property, role or financial record was deleted; existing rows get backward-compatible defaults and a null `official_name` is handled everywhere.

## 15. Security

- Every decision is server-side: role, category, verification state, tier, percentages, shares, ownership, attribution, fee updates, change approval and document access.
- Identity and professional documents are private, admin/owner-only, MIME- and content-validated, size-limited, server-named, traversal-safe and excluded from logs — with no claim that they are encrypted.
- Frontend values for tier, percentage, fee and ownership are ignored by the API.
- The new review endpoint blocks self-review and requires a reason to reject.

## 16. Files changed

Backend: `php-backend/config.php`, `.env.example`, `database.sql`, `schema.sqlite.sql`, `migrate.php`, `lib/api.php`, `lib/repository.php`, `lib/verification.php`, `lib/viewing_terms.php` (new), `lib/fee_policies.php`, `lib/finance.php`, `lib/alerts.php`.

Frontend: `src/types.ts`, `src/services/apiService.ts`, `src/context/AppContext.tsx`, `src/components/{AuthModal, AgentListingForm, AgentDashboard, AgentViewingTermsPanel (new), ViewingTermsFields (new), PropertyDetailView, ViewingRequestModal, AboutView, VerificationPanel, AdminDashboard, AdminViewingTermsQueue (new), AdminVerificationQueue, AdminFinancePanel, AgentFinancePanel}.tsx`.

Tests: `tests/task03.test.mjs` (new, 38 tests), `tests/set-viewing-fee.php` (new test fixture), `tests/api.test.mjs` (extended), `package.json` (`test:api` now includes `task03`).

Docs: this report.

## 17. Actual test results (executed, on this machine)

| Suite | Result |
|---|---|
| `tests/api.test.mjs` | **189 pass / 0 fail** |
| `tests/task03.test.mjs` | **38 pass / 0 fail** |
| `tests/account-settings.test.mjs` + `tests/migration.test.mjs` + `tests/concurrency.test.mjs` | **22 pass / 0 fail** |
| `npm run test:routing` | **38 pass / 0 fail** |
| `npm run test:navigation` | **30 pass / 0 fail** |
| `npm run lint` (`tsc --noEmit`) | clean |
| `npm run build` | success |
| `php-wasm-cli -l` on changed PHP files | no syntax errors |

PHP was executed through `@php-wasm/cli` with `DB_DRIVER=sqlite`. **MySQL was not executed**, no web server (Apache/PHP-FPM) was exercised, and **no real browser or mobile device was used** — the frontend was verified by type-checking, build and the routing/navigation tests only.

## 18. Git

- Branch: `arena/3cb95f8c-goodlucks-rep`, created from `main` @ `070ddf4` (Task 02 merge).
- Task 03 committed on that branch and merged back into `main` with `--merge` (commit hash recorded in the pull request).
- No force-push, no history rewrite, no unrelated files in the commit.

## 19. Outstanding / manual verification

1. **MySQL run** — the migrations and the new columns/indexes have only been exercised on SQLite. Run `migrate.php` against a MySQL copy and re-run the API suite with `DB_DRIVER=mysql`.
2. **Browser pass** — registration (both groups), Ghana Card upload on a phone, admin document review, agent fee/terms submission and admin approval, notification links, finance split display. Not run here.
3. **Real upload limits** — confirm the host's `upload_max_filesize`/`post_max_size` against the app's own limit.
4. **Landlord viewing-fee policy — deliberately unresolved.** The brief does not say whether landlords should carry a per-property viewing fee and terms at all. Landlord listings keep their existing submission and viewing flow, are exempt from agent fee/commission/professional rules, and no landlord fee policy was invented. **This needs a product decision before landlord listings display a viewing fee.**
5. Release remains explicitly **not launch-ready**.

## 20. Confirmation that Numbers 4–8 were not implemented

Only **Number 3** of the brief was implemented. Nothing from Numbers 4–8 (including the website-wide colour redesign asked for as Number 8) was built. The existing visual style was kept.
