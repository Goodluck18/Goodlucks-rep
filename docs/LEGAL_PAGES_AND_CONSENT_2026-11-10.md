# Property page share button, legal pages, admin management, registration consent and footer

**Date:** 10 November 2026
**Branch:** `arena/40f19dd4-goodlucks-rep`
**Commit:** see section 10 (recorded after the final commit)
**Scope:** Tasks 1–8 of "Property page, sharing, legal pages, admin management, registration and footer improvements".

Nothing in this phase changes a role, a verification rule, the seven-day availability rule, viewing fees,
financial records or an administrator permission. No production database was touched and nothing was deployed.

---

## 1. Files changed

### Backend (PHP)

| File | Change |
| --- | --- |
| `php-backend/lib/legal_content.php` | **New.** The FIRST published version of each document (Terms, 18 sections; Privacy, 17 sections), the document labels/slugs and the seed renderer. Used once, when a database has no published document; after that the database owns the text. |
| `php-backend/lib/legal.php` | **New.** The document model (documents, versions, acceptances), the dirty-word-free HTML sanitiser reuse, the capability checks, publish/restore/discard, the public and admin handlers, and the registration consent check. |
| `php-backend/lib/api.php` | `handle_register()` now refuses a registration without valid consent and records both acceptances; `/auth/me` reports the account's legal state; 12 new routes (public + admin + account acceptance). |
| `php-backend/lib/auth.php` | `public_user()` adds `manageLegal` / `publishLegal` to the capability hint for administrators. |
| `php-backend/config.php` | Loads `legal_content.php` and `legal.php`. |
| `php-backend/migrate.php` | Adds `users.can_manage_legal`, `users.can_publish_legal` and the three new tables (`legal_documents`, `legal_document_versions`, `legal_acceptances`) to the additive upgrade plan. |
| `php-backend/schema.sqlite.sql`, `php-backend/database.sql` | The three tables (with indexes), the two capability columns, and the comments that explain the status model. |
| `php-backend/grant_legal.php` | **New.** CLI-only grant/revoke of the two capabilities (`--manage`, `--publish`, `--list`). No HTTP route grants them. |

### Frontend (React/TypeScript)

| File | Change |
| --- | --- |
| `src/components/PropertyDetailView.tsx` | Share removed from the top bar (Back to Properties + Save stay); a full-width, clearly labelled **Share this property** button with the share icon added directly below the gallery and thumbnails. The existing share dialog is untouched. |
| `src/components/LegalPageView.tsx` | **New.** Public renderer for both documents: reads the latest published version, shows version/effective/last-updated, SEO metadata + canonical + JSON-LD, loading and failure states, way back to the site and a link to the other document. |
| `src/components/AdminLegalPages.tsx` | **New.** Admin → Legal Pages: Terms tab, Privacy tab, Version History tab, rich-text editor (headings, bold/italic, lists, links), Save Draft, Preview, Publish (with confirmation, change note and effective date), View Published Version, Discard Draft, per-version review and Restore, and the re-acceptance switch. |
| `src/components/LegalReacceptancePrompt.tsx` | **New.** The re-acceptance dialog. Only appears when an administrator has switched the prompt on *and* the account's acceptance is older than the published Terms. |
| `src/components/Footer.tsx` | Redesigned: brand + role statement + contact, "Goodlucks Homes" column (Renting Guides & How Goodlucks Homes Works, About Goodlucks Homes, Contact Us), "Legal" column (Terms and Conditions, Privacy Policy), social accounts, bottom bar. |
| `src/index.css` | Footer-scoped `.gl-footer-*` rules (charcoal links, light-grey hover, restrained pink heading accent) and `.gl-legal` typography. The global `.gl-link` treatment is unchanged. |
| `src/components/AuthModal.tsx` | Consent checkbox above Create Account with the exact required wording and two new-tab links; unchecked by default; submission blocked with a clear message; both flags sent to the server. |
| `src/components/AdminDashboard.tsx` | **Legal Pages** tab and panel. |
| `src/routing/routes.ts` | Two public routes (`/terms-and-conditions`, `/privacy-policy`) and the `/admin/legal` console section. |
| `src/App.tsx` | Renders `LegalPageView` for both routes (footer visible, no sign-in) and mounts the re-acceptance prompt. |
| `src/context/AppContext.tsx` | Keeps the account's legal state from `/auth/me`, exposes `legalAcceptance` and `acceptLegalDocuments`, and passes the consent flags through `register()`. |
| `src/services/apiService.ts` | `getLegalIndex`, `getLegalDocument`, `acceptLegalDocuments`, the seven admin legal calls, and the consent fields on `register`. |
| `src/types.ts` | Legal document/version/acceptance types and the two new staff capabilities. |

### Tests and tooling

| File | Change |
| --- | --- |
| `tests/legal-pages.test.mjs` | **New.** 29 API tests (public pages, consent, permissions, drafts, publishing, restoring, sanitising, re-acceptance, migration). |
| `tests/legal-ui.test.mts` | **New.** 14 DOM tests (legal pages, footer, share button, register consent, admin panel, re-acceptance prompt). |
| `tests/legal-query.php` | **New.** Read-only SQLite helper (base64 SQL + bound parameters) used to prove what the API deliberately does not expose. |
| `tests/helpers.mjs` | `ApiClient.post()` adds the consent the register form collects, so pre-existing fixtures still describe a valid registration. Tests that check the refusal path pass their own fields. |
| `tests/api.test.mjs` | One expectation updated: the exact capability object now includes `manageLegal: false` and `publishLegal: false`. Nothing was removed or weakened; the assertion is still "every capability is default-deny". |
| `package.json` | `test:legal`, `test:legal-ui`, and `legal-pages.test.mjs` added to `test:api`. |

---

## 2. New public routes

| URL | Route name | Behaviour |
| --- | --- | --- |
| `/terms-and-conditions` | `terms-and-conditions` | Public page, no sign-in, footer visible, content = latest **published** Terms version. |
| `/privacy-policy` | `privacy-policy` | Public page, no sign-in, footer visible, content = latest **published** Privacy version. |

Both are in `PUBLIC_PATHS`, so `parseLocation()`, `accessDecision()`, the router tests and the footer links agree.
Direct open and refresh both work: the SPA fallback serves the shell for any path, and the page then reads
`GET /api/legal/{slug}`. Titles, descriptions, canonical URLs and JSON-LD are set with `SEOHead`.

The content is **not** hardcoded: the page renders `document.contentHtml` returned by the API, which serves only the
version referenced by `legal_documents.current_version_id` with `status = 'published'`.

---

## 3. Content summary

### Terms and Conditions (18 sections)

1. Introduction and acceptance · 2. Eligibility and registration · 3. Tenant responsibilities ·
4. Agent and landlord responsibilities · 5. Listing accuracy and availability · 6. Identity verification and its
limits · 7. Viewing arrangements · 8. Viewing fees and payment · 9. Our role as an intermediary · 10. Rental
agreements between tenants and landlords · 11. Prohibited conduct, fraud and misleading listings ·
12. Suspension, restriction and termination · 13. Availability confirmation and listing expiry ·
14. Intellectual property · 15. Platform availability and limitation of liability · 16. Disputes and Ghanaian law ·
17. Changes to these Terms · 18. Contact us.

The document states exactly what the platform does and does not do: Goodlucks Homes connects tenants with agents and
landlords and coordinates enquiries and viewings; it does not own, manage, inspect or let property; identity
verification is **not** a physical inspection and **not** a title/ownership check; tenants should view before
committing; a tenancy is a direct agreement between tenant and landlord, off the platform; a viewing fee applies only
where it is displayed for that property, and the platform is not a party to that payment; every published listing must
be reconfirmed every seven days or it is automatically unpublished (and is retained, not deleted). No guarantee,
refund or service is described that the platform does not implement.

### Privacy Policy (17 sections, aligned to the Data Protection Act, 2012 — Act 843)

1. Introduction and who we are · 2. Information we collect when you register · 3. Information we collect from tenants ·
4. Information we collect from agents and landlords · 5. Ghana Card and identity verification data · 6. Listing and
viewing request data · 7. Saved properties, notifications and activity · 8. How we use your information · 9. When we
share information · 10. Email communications · 11. How we protect your information · 12. Retention and deletion ·
13. Your rights of access and correction · 14. Complaints and contact · 15. Cookies and local storage ·
16. Changes to this policy · 17. Contact us.

It describes what the code actually does: name/email/phone, hashed password, account type and city; tenant
preferences, requests, viewings, saved properties and alerts; provider classification, listing data and verification
status; identity documents in private storage outside the public site, opened only by authorised reviewers with an
audit trail; tenant contact details withheld from providers except through the expiring, administrator-approved
disclosure for a specific viewing; first-party page counting, no third-party advertising/analytics cookies; the
session cookie and the guest's local-storage saved list; audit logs; the Data Protection Commission as the complaints
route. It makes **no** claim of encryption, automatic deletion or "never shared", and it says explicitly that a new
Privacy version is not acceptance of it.

---

## 4. Backend consent enforcement and storage

Registration (`POST /api/auth/register`):

* `legal_registration_acceptance()` runs **before** any account is created. It requires strict truthy
  `termsAccepted` **and** `privacyAcknowledged`; a missing or false value is a `422` naming the field
  (`termsAccepted` / `privacyAcknowledged`) and no account is created. `'no'`, `0`, `false`, `null` are all refused.
* If the client states which version it displayed (`termsVersion` / `privacyVersion`) and that version is no longer
  the published one, the registration is refused with `409` and a "the legal documents changed" message, so an
  acceptance can never be recorded against the wrong text.
* If no document is published (a database that has not been migrated/seeded), registration fails closed with `503`
  rather than creating an account without a record.
* After `create_user()`, **two** rows are written: `terms` (source `registration`) and `privacy` (source
  `registration`), each naming the exact `version_id`, `version_number`, the account and the timestamp. If either
  write fails, the just-created account and its partial records are removed and the request returns `500` — an
  account without its consent record cannot exist.
* `audit_log('legal.accepted', 'user', <id>, {source, terms_version, privacy_version})` records the event.

Storage (`legal_acceptances`): `user_id`, `document_type`, `version_id`, `version_number`, `source`, `accepted_at`.
Nothing else — no IP, no user agent, no extra personal data. A unique index on
`(user_id, document_type, version_number)` makes a retried request idempotent and guarantees an existing record is
never overwritten. There is **no backfill**: accounts that existed before this phase have no rows, and the API never
marks anyone as having accepted anything.

Re-acceptance (a separate, explicitly designed process):

* `POST /account/legal-acceptance` records a fresh acceptance for the signed-in account against the currently
  published version, with source `reacceptance`. Terms and Privacy stay separate: accepting one never records the
  other.
* Publishing a new version does **not** prompt anyone. The prompt is switched on deliberately in the console
  (`PUT /admin/legal/reacceptance`, requires the publish capability, stored as
  `platform_settings.legal_terms_reacceptance = 'required'`). When it is on, `/auth/me` reports
  `legal.reacceptanceRequired = true` and `needsAcceptance` per document, and the client shows
  `LegalReacceptancePrompt`. Switching it off hides the prompt without touching a single record.

---

## 5. How an administrator edits, previews, saves and publishes

Admin → **Legal Pages** (`/admin/legal`), visible to administrators holding a legal capability (the panel itself
explains the requirement to anyone else).

1. **Choose the document** — Terms and Conditions / Privacy Policy / Version History.
2. **Edit** in the rich-text surface: section heading (H2), sub-heading (H3), bold, italic, bulleted list, numbered
   list, link. There is no HTML source box and no file to edit; the console is the only way in.
3. **Save Draft** — writes the single draft row. The public page is untouched; the tab shows an unpublished-changes
   dot, and the button is disabled until something changed.
4. **Preview** — `POST /admin/legal/{type}/preview` sanitises the body server-side and returns exactly what the public
   page would render. Previewing saves nothing.
5. **Publish** — opens a confirmation dialog (optional change note, optional effective date; a future date is
   refused because publishing is immediate). `POST /admin/legal/{type}/publish` requires `confirm: true`, the
   `can_publish_legal` capability, a draft that exists and non-empty content.
6. **View Published Version** opens the real public URL in a new tab.
7. **Discard Draft** removes only the draft, after confirmation.
8. **Version History** lists every version with status, effective date, publisher, time and note; **View** opens any
   stored version whole; **Restore** republishes an older one (see section 7).

Publishing is atomic (`db_transaction_immediate`): the previous version is only superseded, the draft only becomes
published, and the document pointer only moves, all inside one transaction. A failure rolls back and the live
document is byte-for-byte what it was.

---

## 6. Migrations and tables

`php php-backend/migrate.php` (dry run) then `php php-backend/migrate.php --apply`:

```
ALTER TABLE users ADD COLUMN can_manage_legal     (TINYINT(1) NOT NULL DEFAULT 0)
ALTER TABLE users ADD COLUMN can_publish_legal    (TINYINT(1) NOT NULL DEFAULT 0)
CREATE TABLE legal_documents
CREATE TABLE legal_document_versions
CREATE TABLE legal_acceptances
CREATE INDEX uniq_legal_version, idx_legal_version_status
CREATE UNIQUE INDEX uniq_legal_acceptance, idx_legal_acceptance_document
```

| Table | Purpose |
| --- | --- |
| `legal_documents` | One row per document type: `document_type` (`terms`/`privacy`, unique), `slug` (unique), `title`, `summary`, `current_version_id` (the version the public sees). |
| `legal_document_versions` | Every version, append-only: `version_number`, `status` (`draft`/`published`/`superseded`), sanitised `content_html`, `change_note`, `effective_at`, `created_by(_name)`, `published_at/by(_name)`, `restored_from_version`. Unique `(document_id, version_number)`. |
| `legal_acceptances` | One row per account, document and version: `version_id`, `version_number`, `source`, `accepted_at`. Unique `(user_id, document_type, version_number)`. |

The migration is additive and idempotent; a second run reports "already up to date". A new legal document in future
is a new `document_type` value plus its seed entry — no schema redesign.

**First-run seeding:** `legal_ensure_documents()` runs once per database (cheap `COUNT` afterwards) and writes one
published version per document from `legal_content.php`. It never touches an existing version, so an administrator's
edits are never overwritten.

---

## 7. Version history and audit trail

* A publication marks the current version `superseded` and publishes the draft **in place**, so the version number an
  acceptance points at stays valid forever, and it moves `legal_documents.current_version_id`.
* **Restore** never rewinds: it creates a *new* version (next number) that copies the older body, records
  `restored_from_version`, and publishes it. The earlier rows keep their status, timestamps and text.
* Restoring is refused (`409`) while an unpublished draft exists, so a draft is never silently destroyed by a
  restore.
* Audit entries (written through the existing `audit_log()`): `legal.draft_saved`, `legal.published`,
  `legal.draft_discarded`, `legal.accepted`, `legal.reacceptance_setting_changed`, each with the actor, the document,
  the version and the time. The publish entry names the administrator and the version; the console shows the same
  facts.
* Public endpoints never expose drafts, `change_note`, publisher identity or history — `GET /api/legal/{slug}` returns
  only the live version's title, summary, version, dates and sanitised body.

---

## 8. Tests executed — exact results

All commands were run in this workspace on 10 November 2026.

| Suite | Command | Result |
| --- | --- | --- |
| New legal API suite | `node --test --test-concurrency=1 tests/legal-pages.test.mjs` | **29 / 29 pass** |
| New legal UI suite | `node --import tsx --test tests/legal-ui.test.mts` | **14 / 14 pass** |
| Full API battery (batch 1) | `api`, `account-settings`, `task03`, `migration`, `concurrency`, `access-control`, `primary-admin`, `tenant-contact` | **299 / 299 pass** |
| Full API battery (batch 2) | `admin-console-api`, `user-management`, `bulk-email`, `provider-classification`, `listing-verification`, `property-availability`, `legal-pages` | **133 / 133 pass** |
| API total | 432 tests across 15 files | **432 / 432 pass, 0 fail** |
| Routing / navigation / design / content / email-footer / responsive | `node --import tsx --test tests/routing.test.mts tests/app-navigation.test.mts tests/design-tokens.test.mjs tests/content.test.mjs tests/email-footer.test.mjs tests/responsive.test.mts` | **155 / 155 pass** |
| Sharing / property SEO / uploads / blog-HTML / admin console phases 1–5 / legal UI | 9 files | **165 / 165 pass** |
| Blog / tenant experience / fee policies / provider phase 6 / receipts removed | 5 files | **99 / 99 pass** |
| TypeScript | `npx tsc --noEmit` | **clean** |
| Production build | `npm run build` | **OK** — `index-BA91ixVf.js` 513.95 kB (149.60 kB gzip), CSS 90.37 kB (15.14 kB gzip), `LegalPageView` split into its own 4.83 kB chunk |
| PHP syntax | `php -l` (PHP-WASM 8.5.10) on `legal.php`, `legal_content.php`, `api.php`, `auth.php`, `config.php`, `migrate.php`, `grant_legal.php`, `tests/legal-query.php` | **no syntax errors** |

Notes on the two existing tests touched:

* `tests/api.test.mjs` asserted the exact capability object. It now also expects `manageLegal: false` and
  `publishLegal: false`. The test still asserts that **every** capability is default-deny for a new administrator.
* `tests/helpers.mjs` adds the consent flags to registration fixtures. Tests that check the refusal path post their
  own body (or explicitly override the flags), so the server-side rule is still exercised negatively as well.

Two earlier full-run artefacts worth recording honestly: a single run of all 15 API files in one process produced
failures in `admin-console-api` and `user-management` from a killed PHP-WASM subprocess (`status: null`), and the
same suites pass in isolation and in the two batches above. That is an environment limit of running one very long
process under PHP-WASM, not a code failure; every suite is green in the recorded runs.

---

## 9. Outstanding legal / technical limitations

**Legal (must be reviewed before launch — none of this is legal advice):**

1. Both documents were written for this platform and **must be reviewed by a qualified Ghanaian legal
   professional**, in particular: the wording of the intermediary/agency disclaimer, the liability cap in Terms §15,
   the refund position for viewing fees in §8, the retention periods described in Privacy §12, and the lawful basis
   for processing identity documents.
2. The documents name `rentals@goodlucks.co` and `+233 23 769 0080` (from configuration). A dedicated privacy contact
   and a postal address for notices should be chosen before launch.
3. The Privacy Policy names the Data Protection Commission of Ghana as the complaints route but does not yet state a
   registration/notification status of Goodlucks Homes under Act 843 — that depends on the company's filings.

**Technical:**

1. No browser is available in this environment, so **no visual or device-width check has been performed**. Section
   11 lists the exact manual steps.
2. Rich text is sanitised with the existing allow-list (`blog_sanitize_html`, media disabled). It keeps headings,
   paragraphs, emphasis, lists and links; it strips scripts, styles, event handlers, `javascript:` URLs, images and
   iframes. Nested-tag oddities are repaired by that sanitiser, not by a full HTML parser; a document pasted from a
   word processor may lose styling it never should have kept.
3. The editor uses `document.execCommand`, matching the existing blog editor. It is deprecated in browsers but works
   in all current ones; replacing it would be a separate, wider change.
4. `legal_ensure_documents()` seeds on first use, so a fresh MySQL installation serves the pages immediately without a
   data import. It requires the three tables; if the migration has not been run, registration fails closed with a
   clear 503 and the public page reports the document as unavailable (by design — never an empty policy).
5. The re-acceptance prompt is switched **off** by default. Turning it on affects every account whose acceptance is
   older than the published Terms; that is a business decision, and it is the only mechanism that blocks a signed-in
   account.
6. Restore is refused while a draft exists (deliberate). An administrator must publish or discard the draft first.

---

## 10. Commit and branch

* Branch: `arena/40f19dd4-goodlucks-rep` (pushed to `origin`)
* Commit: **`96d18b8`** — "Add public legal pages, admin legal console, and mandatory registration consent"
* `main` is untouched (`9d318ba`); nothing has been merged or deployed.

---

## 11. Screenshots / browser evidence — and how to capture it

**Not captured here.** This environment has no browser (no Chrome/Playwright), so no screenshot, visual check or
device-width measurement was produced, and none is claimed. The DOM tests above exercise the real components (layout
classes, document order, labels, disabled states) but do not render pixels.

Manual steps, once a browser is available:

1. `npm run dev`, then open `http://localhost:43131`.
2. **Property page** at 360 px, 375 px, 390 px, 768 px and 1440 px wide: `/property/<any published listing>`.
   Confirm the share button sits below the thumbnails, is full width on the phone widths and auto-width on desktop,
   the label reads "Share this property", the top bar shows only Back to Properties and Save, there is no horizontal
   scrollbar, and tapping it opens the dialog with "Share Property Link" and "Share as Image".
3. **Legal pages**: open `/terms-and-conditions` and `/privacy-policy` directly (and refresh). Confirm the footer is
   present, no sign-in is required, headings and lists are readable, the version and effective date are shown, and
   the footer links reach the pages.
4. **Registration**: `/register`, tab to the consent checkbox, confirm it is unchecked, click Create Account and see
   the message, then tick it and confirm the account is created. Click both legal links and confirm they open in a
   new tab with the form still filled in.
5. **Admin**: sign in at `/admin-login`, open Legal Pages, edit, Save Draft, Preview, Publish (confirm), check the
   public page, then Version History → View an old version → Restore and confirm a new version appears.
6. **Footer**: confirm no teal link text, no heavy teal underline, a light-grey hover, wrapping labels on a 360 px
   screen, and working social/contact links.

---

## 12. Evidence that unauthorised users cannot edit or publish

Proven by `tests/legal-pages.test.mjs`, "editing and publishing are separate capabilities":

| Actor | `GET /api/admin/legal` | `PUT …/draft` | `POST …/publish` |
| --- | --- | --- | --- |
| Signed-out visitor | `401` | — | — |
| Signed-in tenant | `403` | — | — |
| Administrator with neither capability | `403` | `403` | — |
| Administrator with `can_manage_legal` only | `200` | `200` (and preview `200`) | **`403`** — "Publishing a legal document requires the legal-publish capability" |
| Administrator with `can_publish_legal` only | `403` | **`403`** | permitted |

Also proven in the same suite:

* a draft is invisible on the public endpoint while the published version is unchanged, and the console is the only
  place it appears;
* publish without `confirm: true` is refused (`422`) and nothing changes;
* publish with no draft is refused (`409`) and the live document is byte-for-byte unchanged;
* restore is refused while a draft exists (`409`), and a restore that does run creates a new version and leaves every
  earlier version — including its publication timestamp — untouched;
* the audit log records the publishing administrator's id, the version number and the time;
* hostile rich text (`<script>`, `onclick`, `onerror`, `javascript:` URL, `<img>`, `<iframe>`, `<style>`) is stripped
  before storage and is absent from the public body;
* the capabilities themselves are granted only from the server console (`grant_legal.php`); there is no HTTP route
  that grants them, and `role = 'admin'` grants neither.
