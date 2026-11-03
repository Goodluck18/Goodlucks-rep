# Increment D — Agent Verification and Professional Authorisation

**Status:** implemented, tested, not deployed.
**Scope:** agent identity verification, agent professional authorisation, optional landlord
identity verification, secure private document storage, and the staff review console.
**Out of scope (unchanged):** fee sharing, agent tiers, viewing-fee collection, remittance,
commissions, the agent-led viewing lifecycle, tenancy agreements, receipt issuing.

**Nothing in this increment deploys, touches a production database, commits or pushes.**
Section 14 records the confirmations.

---

## 0. What existed before, and what this increment added

Increment C gave agents an account, a profile and a way to submit listings "on behalf of"
a landlord, with `landlord_authority_state = 'declared_unverified'` and no verification of
anybody. Increment D adds the checks themselves, and — just as importantly — the limits on
what those checks mean:

| Question | Answered by | What it does **not** mean |
| --- | --- | --- |
| Is this person who they say they are? | `identity_verifications` | Not a licence, not ownership, not authority over a listing |
| May this agent legally practise? | `professional_authorisations` | Not checked against any regulator's register (no integration exists) |
| Does this agent represent this landlord? | The per-listing declaration (Increment C) | Still unverified; uploading a document does not prove it |
| Is this landlord's identity known? | Optional `identity_verifications` row | **Never** proof of ownership or of a right to let the property |
| Is the listing accurate? | Staff property moderation (earlier increments) | Unrelated to any of the above |

The three verification records are deliberately separate tables. Approving one never writes
to another: the test suite asserts this in both directions (identity → professional, and
landlord identity → property).

---

## 1. Agent identity verification

### 1.1 What an agent submits

A single structured submission (`POST /api/verification/identity`), not a free-text message:

- `legalName` — full legal name as printed on the document (2–200 characters).
- `documentType` — one of `ghana_card`, `passport`, `drivers_licence`, `voter_id`, `other`.
  The list is a fixed allow-list in `lib/verification.php`; the client cannot invent a type.
- `documentNumber` — the printed number, stored only as described in §1.4.
- `documentIds` — ids of files already uploaded to the private store (§3). At most six.
- The server records `submittedAt`, `status`, `subjectRole`, and the reviewer columns.

### 1.2 Statuses

`not_submitted → pending_review → under_review → approved | rejected | resubmission_required`

- A submission **always** lands in `pending_review`. There is no code path that sets
  `approved` other than a reviewer decision (test: *"an agent can submit identity
  verification, which stops at pending review"* and *"an agent cannot approve their own
  verification"*).
- `approved` and `rejected` are final from the applicant's side: resubmitting an approved
  record returns **409** rather than silently reopening it.
- `request_resubmission` returns the record to the applicant with a required reason.
- Every transition is written to `verification_decisions` (§7) as an append-only row.

### 1.3 Decisions

`POST /api/admin/verifications/{userId}/identity/decision` accepts `start_review`
(`under_review`), `approve`, `reject`, `request_resubmission`. `reject` and
`request_resubmission` require a note; `approve` is allowed only from `pending_review` or
`under_review`. The note is shown to the applicant and kept in the history.

### 1.4 Ghana Card numbers: masking, encryption, retention

This is the most sensitive data the platform now holds, so the handling is explicit:

- **Ordinary responses never contain the full number.** The verification summary, the
  review queue and the audit trail carry `documentNumberMasked` (`•••••••••3210`) and, for
  the owner, nothing more. The queue endpoint is asserted to contain neither the number nor
  its digits (test: *"the full identity number is never stored in plain text"*, and the
  queue-level assertion inside the review test).
- **The full number is only ever revealed to a reviewer holding the second capability**
  (`can_access_identity_documents`); that response is the single place the plaintext
  appears, and every such read is audited.
- **At rest**, the number is encrypted with AES-256-GCM (`openssl_encrypt`, 12-byte IV,
  16-byte tag, key from `IDENTITY_DATA_KEY`). The key lives **only** in the deployment's
  environment / `config.local.php` — never in the repository, never in a default.
- **If no key is configured, the full number is not stored at all.** The platform keeps
  the masked value and sets `document_number_retained = 0`; it does **not** fall back to
  plain text. The UI states this plainly rather than pretending encryption is active.
  There is no claim of encryption anywhere that the code does not actually perform.
- **Retention.** A final decision sets `retention_purge_after`. The job
  `php-backend/verification_retention.php` (dry-run by default, `--apply` to act) deletes
  the files, the encrypted number, the masked number and the copied legal name once the
  window passes, while keeping the decision history so the platform can still explain
  *that* a check happened. Licence certificates on a finalised authorisation follow the
  same window. The default (`VERIFICATION_RETENTION_DAYS = 365`) is a **placeholder
  pending Ghanaian legal advice**, not an agreed statutory period.

### 1.5 Duplicate and abuse handling

- One verification row per user (`UNIQUE(user_id)`).
- Duplicate submissions of the same number by a *different* account are detectable through
  a keyed hash of the compact form (no plaintext comparison stored).
- Uploads are limited to 40/hour per IP and 6 files per scope; decisions to 200/hour.

---

## 2. Professional authorisation (agents only)

A separate record in a separate table, with its own status and its own reviewer decision
(`POST /api/admin/verifications/{userId}/professional/decision`).

### 2.1 Fields

`licenceNumber`, `issuingAuthority`, `licenceCategory` (free text — see §2.4),
`issueDate`, `expiryDate`, supporting document(s), `status`, `reviewedBy`, `reviewedAt`,
`decisionNote`, and `registryChecked` (always `0`).

### 2.2 Rules enforced in code

- **A submitted number is not an authorisation.** Submitting creates `pending_review` and
  nothing else; `professionallyAuthorised` stays `false` until a reviewer approves
  (test: *"a submitted licence number does not make an agent professionally authorised"*).
- **Identity approval and authorisation approval are independent** (test in both
  directions). The UI shows two separate badges and refuses to render one from the other.
- **Expiry is derived, not rewritten.** A stored `approved` authorisation whose
  `expiry_date` has passed reads as `status: expired`, `storedStatus: approved`,
  `expired: true`, `professionallyAuthorised: false`, with the reason in the notes. Nothing
  silently edits the historical decision (test: *"expired and rejected authorisations are
  represented accurately"*).
- **Approving a lapsed licence is refused.** `approve` on a record past its expiry returns
  **422** ("…expired on YYYY-MM-DD…"); the reviewer can `mark_expired` or `reject` instead.
  This prevents a badge that says "authorised" on a licence that has already lapsed.
- **No registry integration.** `registry_checked` stays `0`, the column exists so a future
  integration has somewhere honest to write, and the reviewer screen says "no external
  registry integration exists". Nothing claims a regulator was contacted.

### 2.3 Decision history

Same append-only `verification_decisions` table with `scope = 'professional'`, and the same
microsecond-precision `decided_at` so two decisions in the same second keep their order.

### 2.4 Legal questions for Ghanaian counsel (not answered here)

The implementation deliberately does **not invented** categories or thresholds. Open
questions, to be answered before the platform makes any claim about licensing:

1. Under the Real Estate Agency Act, 2020 (Act 1047) and the Real Estate Agency Council's
   rules, which categories of licence/registration exist, and what may a licensed agent do
   that an unlicensed person may not?
2. Does the platform need to verify a licence against the Council's register before
   displaying any "authorised" state, and is there a lawful way to do so (API, written
   permission, periodic file)?
3. What is the lawful retention period for copies of Ghana Card images and numbers under
   the Data Protection Act, 2012 (Act 843), and is a document image of a Ghana Card
   necessary at all, or would a verified number plus an attestation suffice?
4. May a private platform hold Ghana Card images at all without NIA authorisation, and if
   so under what conditions (storage location, access log, retention, deletion proof)?
5. Are landlords required to verify identity to let property, and does displaying "identity
   verified" create any implied warranty of ownership or authority?
6. Is any wording used on the site ("verified agent", "authorised agent") a regulated
   representation, and what must accompany it?

Until these are answered, the UI says "identity reviewed by Goodlucks", never "verified
professional", and the licence badge is driven only by a human decision.

---

## 3. Landlord identity verification (optional foundation)

- The same `identity_verifications` table with `subject_role = 'landlord'`; the panel is
  reachable from a landlord dashboard tab labelled **"Identity (optional)"**.
- Registration, listing and tenancy inquiries never require it. **A Ghana Card is never
  compulsory for tenant registration** — tenants cannot even reach the endpoint
  (`require_auth(['agent', 'landlord'])` + role checks; test: *"a landlord can submit
  optional identity verification (tenants cannot)"* and *"tenants still register without
  identity documents"*).
- **Identity ≠ ownership.** Approving a landlord's identity does not touch
  `properties.landlord_authority_state`, does not set `is_landlord_verified`, and the
  property stays exactly as staff left it (test: *"landlord identity approval does not
  verify property ownership"*). The landlord panel repeats this in copy.

---

## 4. Private document storage — implementation and limits

`lib/private_storage.php` existed as an unwired helper; this increment wires it and hardens
it. Summary of what is actually enforced:

| Control | Implementation |
| --- | --- |
| Location | `PRIVATE_UPLOAD_DIR`, default `php-backend/storage/private`, **outside** `UPLOAD_DIR` (`/api/uploads`) |
| Filenames | Server-generated `doc_<24 hex>`, plus a sidecar `<id>.json` metadata file; the client's filename is neither stored nor echoed |
| Permissions | Directory created `0700`; files written `0600` |
| Type check | `finfo` MIME detection on content, allow-list `application/pdf`, `image/jpeg`, `image/png`; extension is ignored; a PDF must start with `%PDF-`, an image must pass `getimagesize` |
| Size | `IDENTITY_DOCUMENT_MAX_BYTES` (5 MB); PHP's own `upload_max_filesize`/`post_max_size` rejections are mapped to a clear size message, not "upload failed" |
| Path traversal | ids are `[a-z0-9_-]` only, filenames rebuilt server-side, and the resolved path is checked with `realpath()` containment before any read |
| Serving | Never by public URL: `GET /api/verification-documents/{id}` requires a session, verifies ownership (or the document capability) and streams with `Content-Disposition: attachment` and the stored MIME type |
| Web-server guard | `php-backend/.htaccess` denies `^(lib|logs|storage)/` and `doc_[a-f0-9]{24}\.(pdf\|jpe?g\|png\|json)`; the storage directory carries its own `Require all denied` / `Deny from all` |
| Executables | PHP, HTML and arbitrary types are never accepted or served with a sniffable type; `.htaccess` in `uploads/` already strips PHP handlers |

### 4.1 The hosting limitation, stated plainly

On shared cPanel hosting the API lives in `public_html/api/`, so the default private
directory is **inside the web root**. Access then depends on Apache honouring
`AllowOverride` for that directory. That is *not* something the application can guarantee.
Therefore:

- The code never relies on the `.htaccess` alone for authorisation: every read goes through
  the authenticated route.
- The deployment guide instructs setting `PRIVATE_UPLOAD_DIR` to a path **outside**
  `public_html` (`/home/cpuser/private-documents`, `0700`) and verifying with a `curl` probe.
- If a host offers no writable location outside the web root *and* ignores `.htaccess`,
  the correct answer is a safe alternative (move the API, or do not collect documents).
  **No insecure workaround was added**, and this limitation is repeated in
  `docs/INCREMENT_D_REPORT.md`, `CPANEL_DEPLOYMENT_GUIDE.md` and `.env.example`.

### 4.2 Deletion

Owners can delete an unsubmitted or non-approved document (`DELETE
/api/verification-documents/{id}`); an approved identity's documents are locked (409) to
prevent destroying the evidence behind a decision. Deletion removes the file and the sidecar
and marks the row `deleted_at` so the audit trail still records that a document existed.

---

## 5. Reviewer permissions and the admin console

### 5.1 Two capabilities, both default 0

| Column | Grants |
| --- | --- |
| `users.can_review_verifications` | See the queue, read masked data, record decisions |
| `users.can_access_identity_documents` | Open the uploaded files and see the full number (requires the first) |

- **Being an administrator grants neither.** This was a real bug earlier in the increment
  (`user_can_read_private_document()` originally allowed any admin) and is now narrowed and
  covered by a test.
- Capabilities are granted only from the server console:
  `php php-backend/grant_reviewer.php --email=… --reviewer=1 [--documents=1]`, which refuses
  to grant document access without reviewer access, prints what changed, and writes
  `reviewer.capability_changed` to the audit log.
- The UI hides what the account cannot use, and `GET /api/auth/me` carries the capability
  flags so the console can do that — but **every endpoint re-checks server-side**; hiding is
  cosmetic. Reviewer endpoints return 403 without the capability.

### 5.2 Console (extends the existing admin agent screen)

- `AdminAgentAccounts` gained tabs: **Agent accounts** (Increment C, unchanged) and
  **Verification review** (`AdminVerificationQueue`).
- Queue rows show name, role, agency, email/phone, both statuses and document counts — never
  numbers or filenames.
- The detail drawer shows identity and authorisation as two separate sections, each with its
  own decisions, plus the append-only history. Document links appear only with the document
  capability; without it the row reads "Access restricted" and the drawer says so.
- Rejection, resubmission and expiry require a note, so an applicant is told what to fix.
- Nothing in the console can delete or rewrite a past decision.

### 5.3 Applicant UI

- `VerificationPanel` (shared by agent and landlord surfaces): status, masked number,
  reviewer notes, private upload/download, submission forms, and copy that states the limits
  (no registry check, identity ≠ licence, identity ≠ ownership, refusal to claim encryption
  when no key is configured).
- The agent dashboard's old static "Verification: not checked" card was replaced with an
  accurate explanation and the real panel; the landlord dashboard gained an optional
  identity tab.

---

## 6. API surface added

| Method & path | Who | Notes |
| --- | --- | --- |
| `GET /api/verification` | agent, landlord | Own summary; masked number only |
| `POST /api/verification/documents` | agent, landlord | multipart `kind`, optional `scope`, `file`; returns metadata, never a URL |
| `POST /api/verification/identity` | agent, landlord | Always `pending_review`; 409 once approved |
| `POST /api/verification/professional` | agent | Always `pending_review`; rejected for landlords (404) |
| `GET /api/verification-documents/{id}` | owner or document-capable reviewer | Streams the file; 404 (not 403) when unreadable, so nothing leaks |
| `DELETE /api/verification-documents/{id}` | owner | 409 for an approved identity document |
| `GET /api/admin/verifications[?status=&scope=]` | reviewer | Queue; no numbers |
| `GET /api/admin/verifications/{userId}` | reviewer | Detail; full number/doc links only with document access |
| `GET /api/admin/verifications/{userId}/history?scope=` | reviewer | Append-only history |
| `POST /api/admin/verifications/{userId}/identity/decision` | reviewer | `start_review`, `approve`, `reject`, `request_resubmission` |
| `POST /api/admin/verifications/{userId}/professional/decision` | reviewer | Same plus `mark_expired` |

---

## 7. Database changes

Additive only; no existing row is deleted or rewritten, and every original account, agent,
listing, receipt and notification is untouched.

### 7.1 `users` — 2 columns

```sql
can_review_verifications      TINYINT(1) NOT NULL DEFAULT 0   -- reviewer capability
can_access_identity_documents TINYINT(1) NOT NULL DEFAULT 0   -- sensitive document access
```

Default 0 for every existing and new account, including seeded admins.

### 7.2 `identity_verifications` (new)

`id`, `user_id` (UNIQUE, FK → `users`, `ON DELETE RESTRICT`), `subject_role`, `legal_name`,
`document_type`, `document_number_masked`, `document_number_encrypted`, `document_number_retained`,
`status`, `submitted_at`, `reviewed_by`, `reviewed_at`, `decision_note`,
`retention_purge_after`, `created_at`, `updated_at`. Index `idx_identity_status (status)`.

### 7.3 `professional_authorisations` (new)

`id`, `user_id` (UNIQUE, FK → `users`), `licence_number`, `issuing_authority`,
`licence_category`, `issue_date`, `expiry_date`, `status`, `registry_checked`, `submitted_at`,
`reviewed_by`, `reviewed_at`, `decision_note`, `created_at`, `updated_at`.
Index `idx_professional_status (status)`.

### 7.4 `verification_documents` (new)

`id`, `user_id` (FK → `users`), `scope`, `kind`, `storage_id` (UNIQUE), `mime_type`, `bytes`,
`checksum_sha256`, `uploaded_by`, `created_at`, `deleted_at`. Indexes `idx_vdoc_user (user_id)`,
`idx_vdoc_scope (user_id, scope)`; the file itself lives only in the private store.

### 7.5 `verification_decisions` (new, append-only)

`id`, `user_id` (FK → `users`), `scope`, `decision`, `from_status`, `to_status`, `note`,
`reviewer_id`, `reviewer_name`, `decided_at DATETIME(6)`. Index
`idx_vdecision_user (user_id, scope)`. The application never updates or deletes these rows.

### 7.6 Where each change lives (kept in parity)

- `php-backend/database.sql` — MySQL definitions plus explanatory comments.
- `php-backend/schema.sqlite.sql` — SQLite equivalents (TEXT timestamps, `CHECK`-free
  statuses, same indexes).
- `php-backend/migrate.php` — detects the two missing columns and four missing tables;
  `--apply` adds them. The four tables are also in `$requiredTables` so a fresh install is
  verified.

### 7.7 Migration and rollback guidance

Forward:

```bash
php php-backend/migrate.php          # report only (default)
php php-backend/migrate.php --apply  # after a phpMyAdmin export
```

Rollback (documented in `migrate.php`'s header):

```sql
DROP TABLE verification_decisions;
DROP TABLE verification_documents;
DROP TABLE professional_authorisations;
DROP TABLE identity_verifications;
ALTER TABLE users DROP COLUMN can_access_identity_documents;
ALTER TABLE users DROP COLUMN can_review_verifications;
```

Then delete the files in `PRIVATE_UPLOAD_DIR` (rollback of the code does not delete them) and
re-deploy the previous release. Dropping the tables loses only verification records — no
listing, account, receipt or enquiry is affected.

**Honest limitation:** the sandbox has no MySQL or Docker, so the MySQL DDL and
`migrate.php --apply` are **not executed here**. They are written to the same pattern as the
already-deployed increments and kept in parity with the SQLite schema, which *is* exercised
by every test run. Final MySQL verification is deferred (§12).

---

## 8. Audit logging

`lib/audit.php` gained redaction keys so any accidental context field carrying an identity or
licence value is masked before storage. Actions recorded:

| Action | When |
| --- | --- |
| `document.uploaded` | A private document is accepted (scope, kind, bytes — never the name or contents) |
| `document.viewed` | A document is streamed to its owner or a reviewer |
| `document.deleted` | Owner deletion or retention purge |
| `verification.identity_submitted` | Applicant submits identity |
| `verification.professional_submitted` | Agent submits an authorisation |
| `verification.identity_decided` | Reviewer decision (from → to, note, reviewer) |
| `verification.professional_decided` | Reviewer decision |
| `verification.purged` / `verification.professional_purged` | Retention job removed data |
| `reviewer.capability_changed` | CLI grant/revoke |

No log line contains a Ghana Card number, a document body or a stored filename; the audit
tests assert the absence of the test numbers across the admin audit feed.

---

## 9. Tests and actual results

All commands were run in this workspace; the numbers below are the real output.

### 9.1 API suite

```
npm run test:api
# tests 128
# suites 26
# pass 128
# fail 0
# duration_ms 93194
```

`node --check tests/api.test.mjs` → clean.

The Increment D suite (`describe('Identity verification & professional authorisation
(Increment D)')`) contains 17 tests — the 111 tests of Increment C plus these make the
128 — and covers the 15 mandated checks plus two of its own:

1. an agent can submit identity verification, which stops at pending review
2. the full identity number is never stored in plain text
3. invalid file types and oversized uploads are rejected
4. path traversal and malicious filenames cannot reach the private store
5. a private document is unreachable from any public URL
6. an agent cannot view another agent's documents, and cannot access the review queue
7. an agent cannot approve their own verification
8. an administrator without the capability cannot read identity documents
9. a submitted licence number does not make an agent professionally authorised
10. a landlord can submit optional identity verification (tenants cannot)
11. identity approval does not approve professional authorisation
12. landlord identity approval does not verify property ownership
13. expired and rejected authorisations are represented accurately
14. verification decisions are audited without the identity number
15. tenants still register without identity documents
16. Increments A, B and C still behave
17. the retention job reports first and only deletes when applied

The suite runs against SQLite in a temporary folder, with a **test-only** encryption key
generated in-process and a `PRIVATE_UPLOAD_DIR` redirected into `.data/` so no identity file
is ever written into the repository.

### 9.2 Frontend and PHP checks

```
npx tsc --noEmit      → clean (with @types/react 19 installed)
npm run build         → built in 4.26s, dist/server.cjs written
php -l (17 files)     → "No syntax errors detected" for every changed PHP file
```

### 9.3 Manual end-to-end run through the real dev stack

`npm run dev` (PHP API + Vite host + `/api` proxy), then a scripted session:

```
upload identity doc          201 vdoc-…
upload licence doc           201 vdoc-…
identity submit              201 pending_review •••••••••3210   (no digits leaked in the body)
professional submit          201 pending_review ••••••••0042
admin queue row              pending_review / pending_review, 1 doc, no number in payload
reviewer document download   200 (bytes)
approve identity             200 approved
after approval               identity approved | professional pending_review | history 1
agent's own view             identity approved, professional pending_review, authorised false
cross-account document read  404
agent hitting reviewer queue 403
```

In that run `IDENTITY_DATA_KEY` was unset, so `documentNumber` came back `null` and
`numberRetained` was `false` — the documented no-key behaviour, verified rather than assumed.

---

## 10. Files changed / created in this increment

**Created**

- `php-backend/lib/crypto.php` — AES-256-GCM encrypt/decrypt, masking, keyed hashing, honest nulls without a key.
- `php-backend/lib/verification.php` — identity/professional lifecycle, statuses, capabilities, decisions, queue/detail shapes, retention purge.
- `php-backend/grant_reviewer.php` — CLI to grant/revoke/list reviewer capabilities (audited).
- `php-backend/verification_retention.php` — retention job (dry-run default, `--apply`).
- `src/components/VerificationPanel.tsx` — applicant identity/authorisation panel.
- `src/components/AdminVerificationQueue.tsx` — reviewer queue and detail drawer.
- `tests/read-verification.php` — test helper to inspect verification state.
- `docs/INCREMENT_D_REPORT.md` — this report.

**Modified**

- `php-backend/config.php` — `IDENTITY_DOCUMENT_MAX_BYTES`, `VERIFICATION_RETENTION_DAYS`, `IDENTITY_DATA_KEY`.
- `php-backend/lib/api.php` — 10 routes and their handlers.
- `php-backend/lib/private_storage.php` — content validation, size mapping, containment, audited streaming.
- `php-backend/lib/db.php` — `db_now_precise()` (microsecond UTC timestamps).
- `php-backend/lib/auth.php` — capability flags on `public_user()`.
- `php-backend/lib/audit.php` — identity/licence redaction keys.
- `php-backend/database.sql`, `php-backend/schema.sqlite.sql`, `php-backend/migrate.php` — DDL, indexes, required tables, rollback note.
- `php-backend/.htaccess` — deny `storage/` and `doc_<24hex>` paths.
- `php-backend/.env.example` — new settings, with the "leave empty for no retention" note.
- `src/types.ts` — verification types and `User.capabilities`.
- `src/services/apiService.ts` — the 10 calls (multipart uploads via `formData`).
- `src/context/AppContext.tsx` — `refreshSession()` so a capability grant shows without a reload.
- `src/components/AgentDashboard.tsx` — real verification section replaces the static "not checked" card.
- `src/components/LandlordDashboard.tsx` — optional identity tab, with the ownership disclaimer.
- `src/components/AdminAgentAccounts.tsx` — tabs, reviewer panel, capability notice.
- `tests/api.test.mjs` — 17 tests, per-run private upload dir, test-only key.
- `tests/create-user.php` — role/capability fixtures used by the suite.
- `README.md`, `CPANEL_DEPLOYMENT_GUIDE.md` — behaviour, storage, key, retention and grant instructions.

Earlier increments' files (Increments A/B/C) were preserved; no legacy feature was removed.

---

## 11. Remaining security and legal concerns

1. **Shared-hosting storage.** Until `PRIVATE_UPLOAD_DIR` is moved outside `public_html`
   and verified, protection rests on Apache `.htaccess`, which the app cannot guarantee.
2. **Key management.** `IDENTITY_DATA_KEY` is only as good as its custody: no rotation
   tooling yet, and losing it makes retained numbers unreadable (by design). Rotation would
   need a re-encrypt migration.
3. **Retention is a placeholder.** 365 days is not legal advice; a lawful period and a
   deletion-evidence process are required. Deletion happens only when the cron job runs.
4. **No registry integration.** A human decision based on documents is the whole check; a
   forged certificate can pass. The UI says "reviewed by Goodlucks", not "licensed".
5. **No independent identity check.** Nothing contacts NIA or any verification service; a
   good forgery of a Ghana Card image can pass a human review.
6. **Document authenticity tooling.** No EXIF stripping, PDF sanitisation or malware scan.
   Files are type-validated and served as attachments, which is the minimum, not the ideal.
7. **Reviewer concentration.** Few staff will hold document access; there is no
   two-person rule for approvals yet.
8. **Audit retention.** Audit rows are permanent; the audit log itself therefore grows and
   may eventually hold personal data (ids, notes) that needs its own retention policy.
9. **Legal questions in §2.4 remain open** and gate any public wording about licensed agents.
10. **MySQL parity.** Not executed here (§7.7); must be verified on a real MySQL before
    deployment.
11. **Pre-existing warning.** `lib/outbox.php:284` logs an undefined `$retentionDays`
    notice. It is outside this increment and was left untouched.

---

## 12. Dependencies for Increment E

Increment E (agent-led viewing lifecycle) should build on, not duplicate, the following:

- **Identity/authorisation state** is readable as `verification_summary_for_user()` /
  `verification_queue()`; do not re-derive status from documents.
- **`landlord_authority_state`** remains `declared_unverified`. E may record *evidence* of
  authority per listing, but a separate record from identity/licence documents, and a
  declaration must never be converted into proof.
- **Capabilities** (`can_review_verifications`, `can_access_identity_documents`) are the
  pattern to follow for any new sensitive power: default 0, CLI-granted, audited.
- **The private store** is generic enough for viewing evidence (e.g. proof of attendance),
  but each new document class needs its own scope, retention decision and legality check.
- **Still reserved:** fee-sharing percentages, tiers, 60/40 and 70/30, fee-policy activation,
  transaction snapshots, viewing-fee collection, remittance, commissions, tenancy agreements,
  receipt issuing.

---

## 13. What this increment deliberately does not claim

- It does not claim the Ghana Card number is encrypted unless `IDENTITY_DATA_KEY` is set; in
  that case the number simply is not retained.
- It does not claim documents are safe because a helper exists; the wiring, the access check
  and the hosting caveat are all documented.
- It does not claim any regulatory approval, registry lookup or licensing verification.
- It does not claim identity verification means ownership, authority, or a verified listing.

---

## 14. Confirmations

- **No deployment** was performed.
- **No production database** was accessed or modified; every run used a temporary SQLite file.
- **No commit and no push** were made; the work sits in the working tree of
  `arena/a67485fb-goodlucks-rep`.
- **No destructive migration** was written; the schema changes are additive and the rollback
  path is documented in §7.7.
- **No secrets** were committed: the test key is generated per run and the production key is
  supplied only through the environment.
- **Increment E was not started.**
