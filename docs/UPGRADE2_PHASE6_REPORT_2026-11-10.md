# Upgrade 2 — Phase 6 report (provider experience)

**Date:** 2026-11-10
**Branch:** `arena/1dbf260c-goodlucks-rep`
**Base commit:** `fed5ac8` (Phase 5)
**Scope:** C1 independent agent listings · C2 provider-contact privacy · C3 device uploads on both listing paths · C4 video embeds · C5 amenities and specs · C6 provider commission expectation · C7 property-interest notifications · C8 event-driven email · E2 provider subtype fixed after verification

Nothing was deployed. No production database was touched. Every schema change is additive.

---

## 1. What was required, and what was delivered

### C1 — an agent listing has no landlord party

An agent is an independent provider. Their listings carry **no** landlord reference: `landlord_id` stays `NULL`,
`landlordId`, `landlordName`, `landlordCompany` and `landlordContactClaimed` come back empty, and
`landlordAuthorityState` is `'not_applicable'`. `submittedByRole` is `'agent'` and `submittedByUserId` is the agent
who submitted it. Stale `landlordId` / `landlordName` / `landlordEmail` / `landlordPhone` values in a request body are
accepted by the validator for backward compatibility and then discarded — the field is gone from both listing forms.
The responsible account for a listing is computed in one place, `property_provider_user_id()`: the owner if there is
one, otherwise the submitter.

### C2 — provider contact is not in the public payload

Who submitted a listing, and who owns it, are account facts, not catalogue copy. `shape_property()` returns
`submittedByUserId`, `submittedByRole`, `landlordCompany` and `landlordAuthorityState` **only** to staff, the owning
landlord and the submitting account; everybody else gets empty values. `landlordContactClaimed` stays staff-only, as
before.

### C3 — one upload widget, both listing paths

The device-upload widget that only the landlord form had is now `src/components/PropertyImagePicker.tsx`, and both
`ListPropertyView` and `AgentListingForm` use it. The agent form's single comma-separated "Image links (one per line)"
text field is gone. The picker keeps every behaviour the landlord form already had, because those were the right ones:
`validateImageFile` before any network call, `dedupeFiles` for repeats, one batch upload via `api.uploadImages`,
partial-failure reporting, a labelled tile per image with a remove button, and URLs only — never base64 in the browser.
Linking an already-hosted image still works, one `http(s)` link at a time. There is exactly one implementation: the
tests assert neither form calls `api.uploadImages` itself.

### C4 — video embeds from three providers, and no others

`videoUrl` is parsed server-side into `{provider, url, embedUrl}`. Accepted: YouTube (`watch?v=`, `youtu.be`,
`/shorts/`, `/embed/`, `/live/`), TikTok (`/@user/video/<id>`), Facebook (`/videos/…` or `?v=`). Refused with a 422 on
`videoUrl`: `vm.tiktok.com` and `/t/…` short links, `fb.watch`, and everything else. The refusal is deliberate — a short
link cannot be resolved without opening it, so the server will not pretend it verified one. The embed URL is built by
the server (`youtube-nocookie.com/embed/…`, `tiktok.com/player/v1/…`, `plugins/video.php?href=…`); the listing page
renders `property.video.embedUrl` in an iframe with `referrerPolicy="strict-origin-when-cross-origin"` and never the raw
link. A stored pair is only served back when the stored provider is one we recognise and still re-parses to the same
provider.

### C5 — amenities and specs that survive old and new listings

`amenities` are stored as canonical keys (`pool`, `backup_power`, `fitted_kitchen`, …) from a fixed vocabulary, and the
words a listing actually used are preserved: unknown phrases are folded into `amenitiesNote` verbatim rather than
dropped, and `amenityLabels` gives the readable words back. Legacy free-text rows are re-normalised on read, so an old
listing shows words instead of disappearing. `toilets`, `kitchens` and `furnishing`
(`unfurnished|semi_furnished|furnished`, with `furnishingLabel`) are new nullable columns, validated 0–50 and against
the vocabulary. The property type list gained `Flat`, `Detached`, `Semi-detached`, `Self-contained`, `House`; the
original seven still validate.

### C6 — the provider's expectation is visibly not a platform fee

`providerCommissionPercent` (0–100) and `providerCommissionNote` are stored and returned as
`providerCommission { percent, note, isPlatformFee: false }`. Nothing on the platform is calculated from them — no
invoice, no ledger row, no matching weight. They are **business between the provider and the owner**, so only the
provider and staff receive the figure; a tenant and the public get the shape with nothing in it. Both forms label the
block "Your commission expectation … not a Goodlucks fee", and the listing page shows it only to those who may see it,
under "Provider's commission expectation … not a Goodlucks fee and nothing is calculated from it".

### C7 — providers hear about real interest, without tenant details

Saving a listing notifies the responsible provider in the app and by queued email, and a price drop tells them how many
watchers were emailed. New module `php-backend/lib/provider_alerts.php`:

* the provider is the owner if there is one, else the submitter; an inactive or unemailable account is skipped;
* the message carries the listing and a **count** (`SELECT COUNT(*) …`), never a row of who saved it — the function has
  no tenant parameter, so there is nothing to leak by accident;
* at most one notification per property per provider per day per event, claimed through the existing
  `alert_deliveries` unique key (`provider_interest`, provider, property, `event:YYYY-MM-DD`);
* a provider saving their own listing is not notified.

### C8 — email only from real events, with the reason

`verification_approved` and `verification_attention` were missing from the template targets and verification decisions
sent no email at all. Both now exist, are sent from `record_verification_decision()` — the one place a decision is
recorded — and include the reviewer's note. "Started review" stays in-app: it is progress, not news. The
`provider_interest` target is added for C7. No email is sent from a path that is not an event.

### E2 — the classification is chosen at registration and final after that

> **Superseded in part (Agent-first correction, 2026-10-30).** The classification is no longer chosen at registration.
> The website offers two account groups — Tenant, and one Agent/Landlord account — and the Agent-or-Landlord choice is
> made once, at verification. The staff correction endpoint described below is unchanged, and is now also the only way
> to change a classification after it is made. See `docs/AGENT_FIRST_CORRECTION_2026-10-30.md`.

Registration already offers tenant, landlord and agent, with no "agent acting for a landlord" language left anywhere in
the codebase. What was missing was the **only** legitimate way to fix a genuine mistake. Added
`POST /api/admin/users/:id/role`:

* staff only, and only an administrator holding the user-directory capability (or the primary administrator);
* the target may not be an administrator, the new role may not be `admin`, the role must actually change, and the
  caller cannot reclassify themselves;
* a written reason of at least 10 characters is required and stored with the change;
* the change is audited as `user.role_corrected` with from/to/reason, and appears in **that account's** own history as
  well as the administrator's;
* the account holder is told in the app;
* correcting someone *to* agent creates the agent profile in the normal pending state — a correction never hands out
  listing permission, so staff still approve the account through Agent Accounts;
* `update_user()`'s column whitelist still excludes `role`, so a profile edit can never touch it.

The profile screen (`AdminUserProfile`) shows the control only when the server says
`canCorrectClassification`.

---

## 2. Files changed

**New**

| File | Purpose |
| --- | --- |
| `php-backend/lib/property_media.php` | amenity vocabulary + normalisation, furnishing states, video parsing |
| `php-backend/lib/provider_alerts.php` | C7 provider notifications (no tenant data, daily dedupe) |
| `src/components/PropertyImagePicker.tsx` | C3 the shared image upload widget |
| `tests/provider-experience-phase6.test.mjs` | 22 tests for C4–C8 and E2 |

**Modified**

| File | Change |
| --- | --- |
| `php-backend/config.php` | require `property_media.php`, `provider_alerts.php` |
| `php-backend/lib/api.php` | listing payload fields (C4/C5/C6), provider-interest hooks (C7), role correction endpoint (E2), `canCorrectClassification` |
| `php-backend/lib/repository.php` | create/update/shape for the eight new columns, provider-commission visibility gate, `set_user_role()` |
| `php-backend/lib/validate.php` | `PROPERTY_TYPES` extended |
| `php-backend/lib/verification.php` | `send_verification_decision_email()` (C8) |
| `php-backend/lib/email_templates.php` | `verification_approved`, `verification_attention`, `provider_interest` targets |
| `php-backend/lib/users_admin.php` | history includes staff actions about the account; `user.role_corrected` label |
| `php-backend/lib/contact_disclosure.php` | C2 provider-detail gating (from the C1/C2 increment) |
| `php-backend/schema.sqlite.sql`, `php-backend/database.sql`, `php-backend/migrate.php` | 8 nullable columns on `properties` |
| `src/components/ListPropertyView.tsx` | uses the shared picker; specs, video, commission fields |
| `src/components/AgentListingForm.tsx` | uses the shared picker; amenities, video, specs, commission; no landlord reference |
| `src/components/PropertyDetailView.tsx` | amenity labels + note, video embed, toilets/kitchens/furnishing, commission block |
| `src/components/AdminUserProfile.tsx` | classification correction panel (E2) |
| `src/services/apiService.ts` | `PropertyInput` fields, `correctUserRole()`, `canCorrectClassification` |
| `src/types.ts` | `Property` fields |
| `tests/api.test.mjs`, `tests/task03.test.mjs` | C1/C2 expectations (`not_applicable`, `landlordId ''`), landlord-owned fixture for the legacy viewing cancellation |
| `tests/uploads.test.mts`, `tests/responsive.test.mts` | assertions moved to the shared picker, plus "both forms use it" |
| `package.json` | `test:provider-phase6` script |

---

## 3. Test results (all executed on this branch, this commit)

| Suite | Result |
| --- | --- |
| `tests/provider-experience-phase6.test.mjs` (new) | **22 / 22** |
| `tests/api.test.mjs` — suites 1–29 | **177 / 177** |
| `tests/api.test.mjs` — suite 30 (concurrency/rollback) | **14 / 14** |
| `tests/task03.test.mjs` | 50 / 50 |
| `tests/account-settings.test.mjs` | 7 / 7 |
| `tests/tenant-contact.test.mjs` | 10 / 10 |
| `tests/admin-console-api.test.mjs` | 9 / 9 |
| `tests/user-management.test.mjs` | 15 / 15 |
| `tests/bulk-email.test.mjs` | 14 / 14 |
| `tests/primary-admin.test.mjs` | 16 / 16 |
| `tests/migration.test.mjs` | 14 / 14 |
| `tests/concurrency.test.mjs` | 6 / 6 |
| `tests/access-control.test.mjs` | 13 / 13 |
| `tests/fee-policies-phase4.test.mjs` | 12 / 12 |
| `tests/tenant-experience.test.mjs` | 11 / 11 |
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
| `tests/admin-console-phase5.test.mts` | 19 / 19 |
| **Total** | **738 / 738, 0 failures** |

Other gates: `tsc --noEmit` clean; `npm run build` ✓ (5.43 s); `php-wasm-cli -l` clean on every file in
`php-backend/` and `php-backend/lib/`; dev server booted on a spare port and answered `/`, `/admin/users` and
`/api/health` with 200.

### The one test-harness problem, and how it was handled

The php-wasm server stops answering after roughly 1014 requests in a single process (documented in the Phase 5 report).
Running every `api.test.mjs` suite in one process therefore wedges the last suite: in this phase's single-process run,
suite 30 (`Receipt-specific reversals and concurrency`) failed its 14th test with `fetch failed` after 301 s while the
other 190 passed. Run in its own process — the same method used in Phases 3–5 — the suite is **14 / 14 green**. This is
a harness ceiling, not a product failure; native PHP has no such limit.

---

## 4. Security, privacy and data integrity review

* **Provider contact** never appears in a public or tenant payload; C2's gate is on the server, not the client.
* **Tenant identity in provider alerts**: the notification text is built from the listing row plus a `COUNT(*)`. The
  test asserts no tenant email, phone, name or any email-shaped string appears in the provider's notification.
* **Provider commission** is withheld from tenants and the public by the same audience gate, and is never fed to a
  calculation.
* **Video**: only a server-built embed URL reaches the DOM; short links are refused rather than resolved; the iframe
  carries `referrerPolicy` and an explicit `allow` list.
* **Role changes**: the correction endpoint is admin-only, cannot target or create an administrator, cannot be used on
  oneself, requires a written reason, and is audited with from/to/reason. `update_user()` still refuses `role`.
  Capability boundaries from Phase 3 are respected — the admin needs the user-directory capability, and the grant is a
  console-only script with no HTTP route.
* **Uploads** remain `landlord|agent|admin` and rate-limited; the picker validates type and size client-side and the
  server re-validates.
* **Migrations** are additive: eight nullable columns, no data rewritten, legacy amenity text re-read rather than
  overwritten.

---

## 5. Outstanding items / known limitations

1. **Provider alerts are email + in-app only.** There is no SMS channel anywhere in the product, and none was invented.
2. **Price-drop provider notice** fires only when at least one watcher was actually emailed, so no empty mail is sent.
3. **Correcting an account to agent does not auto-approve it** — that is deliberate, and staff approve it in Agent
   Accounts as they would a new sign-up.
4. **Amenity vocabulary is fixed at 20 keys.** A provider can always write their own words in the free-text note, and
   those words are preserved; extending the vocabulary is a code change in `property_media.php`.
5. **No browser was available** in this environment, so the UI is covered by the static assertions in
   `tests/provider-experience-phase6.test.mjs`, the existing upload/responsive suites, `tsc` and a production build.
   Manual check: `/list-property` and `/agent/listings` should each show the same upload dropzone; `/property/<id>` with
   a YouTube link should show an embedded player; `/admin/users/<id>` should show the correction panel only for an
   administrator who holds the directory capability.
6. **Deployment and production-database work remain unauthorised** and untouched.

---

## 6. Deployment steps for this phase

1. Apply the additive migration (eight nullable columns on `properties`). `php-backend/migrate.php` does this
   automatically on boot; never import `database.sql` over an existing database.
2. No new environment variables, no new cron job, no configuration change.
3. After deploy: open one existing listing and confirm its amenity words still render (legacy text is re-read); add a
   YouTube link to one listing and confirm the player appears; save a listing from a test tenant and confirm the
   provider gets one notification and one queued email, with no tenant details in either.
