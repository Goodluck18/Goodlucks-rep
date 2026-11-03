# Increment 0 — Security & privacy hardening

**Status:** implemented on branch `arena/a67485fb-goodlucks-rep`, **not deployed**.
**Scope:** only the seven findings from `docs/AGENT_PLATFORM_AUDIT.md` (S1–S7).
No agent registration, commission tiers, viewing workflow or new agent tables were touched.

---

## 1. What was fixed, finding by finding

| # | Finding | Fix | Where |
| --- | --- | --- | --- |
| S1 | `GET /agreements` returned every agreement to every user | List is built from the viewer: a tenant sees their own rows, a landlord the rows they own or are a party to, an admin all of them. Scoping happens in SQL for linked rows and in PHP for legacy rows (property ownership, then phone number). Never by name. | `lib/api.php` `handle_list_agreements()`, `lib/repository.php` `list_agreements()`, `user_can_read_agreement()` |
| S2 | `GET /receipts` returned every receipt to every user | Same viewer-scoped list. Tenants see receipts linked to them (or, for legacy rows, carrying their own phone); landlords see receipts they issued or are linked to; admins see all. | `lib/api.php` `handle_list_receipts()`, `lib/repository.php` `list_receipts()`, `user_can_read_receipt()` |
| S3 | Signatures were role-only; a landlord could sign another landlord's agreement and an admin could sign as either party | Signing now requires the caller to be *the named party* on that agreement. Administrators are explicitly refused. | `user_can_sign_agreement()`, `handle_sign_agreement()` |
| S4 | Any user could email any agreement by id | Email requires `user_can_read_agreement()`; unauthorised callers get 403, unknown ids 404 (checked first, so ids are not probed by status code). | `handle_email_agreement()` |
| S5 | Ghana Card numbers returned in every payload | Agreement responses are viewer-aware: identity numbers are shown to the two parties, masked (`••••••••0001`) everywhere else, including admin **lists**. Full values for staff come only from the new single-record read, which writes an audit entry. | `shape_agreement()`, `mask_identity_number()`, `handle_get_agreement()` |
| S6 | No audit trail | New `audit_logs` table plus `lib/audit.php`; writes on agreement create/sign/email/identity-view, receipt issue, property status/feature/verification/deletion, enquiry status change and outbox runs. Context is redacted (identity numbers, passwords, tokens) before storage. Admin-only read endpoint. | `lib/audit.php`, `database.sql`, `migrate.php`, `GET /api/admin/audit-logs` |
| S7 | Uploads only ever land in the publicly served directory | Private document store (`PRIVATE_UPLOAD_DIR`, default `php-backend/storage/private`) outside the public uploads dir, with a deny guard file, `0600` files, and `store_private_document()` / `serve_private_document()` helpers that require an authenticated, authorised caller. `handle_serve_upload()` now resolves and confirms the path really sits inside `UPLOAD_DIR` before streaming. | `lib/private_storage.php`, `config.php`, `handle_serve_upload()` |

### Also fixed while in the same handlers

- **Agreement creation ownership.** A landlord attaching a `propertyId` they do not own now gets 403 instead of silently linking to someone else's listing; other roles keep the free-text address and get no property link.
- **Party linking.** Agreements and receipts now store `landlord_user_id` / `tenant_user_id`. The creator is linked when they are a party; otherwise the server links a unique **role-qualified phone match**. This is what makes server-side scoping possible.
- **Receipt-by-id.** The audit asked for a review. There was no receipt-by-id route at all. One now exists (`GET /receipts/{id}`) and is scoped: strangers receive **404**, so receipt ids cannot be probed.

---

## 2. Schema changes (additive only, reversible)

| Table | Change |
| --- | --- |
| `tenancy_agreements` | `+ landlord_user_id VARCHAR(64) NULL`, `+ tenant_user_id VARCHAR(64) NULL` |
| `rent_receipts` | `+ landlord_user_id VARCHAR(64) NULL`, `+ tenant_user_id VARCHAR(64) NULL` |
| `audit_logs` | new table (id, actor_id, actor_role, action, entity_type, entity_id, context_json, ip_address, user_agent, created_at + indexes) |

Applied to **all three schema surfaces**: `database.sql` (MySQL), `schema.sqlite.sql` (dev/test), `migrate.php` (`$requiredTables` / `$requiredColumns`). Column order is identical between a fresh install and a migrated one.

- **Nothing is dropped, renamed or rewritten.** Existing rows simply keep `NULL` links.
- **Rollback:** `ALTER TABLE … DROP COLUMN landlord_user_id, DROP COLUMN tenant_user_id` and `DROP TABLE audit_logs`. No data restoration is needed because no existing column was modified.
- Applying the migration:
  - MySQL: `php api/migrate.php` (dry run), then `php api/migrate.php --apply`.
  - SQLite (dev/test): `schema.sqlite.sql` is authoritative; recreate the local DB.

---

## 3. Behaviour changes and risk assessment

You asked to be told before anything that breaks a legitimate workflow or needs a destructive migration. **There is no destructive migration.** These are the user-visible behaviour changes, each with its risk and mitigation:

1. **Administrators can no longer sign agreements.** Previously an admin could sign "as landlord" or "as tenant"; that is impersonation and is now refused. *Risk:* if staff were using it to unblock a deal, that flow stops. *Mitigation:* the parties sign; no existing test or UI path depended on admin signing. If you want an administrative override later, it should be a separate, dual-controlled action with its own audit event — not a signature.

2. **Staff agreement lists now show masked identity numbers.** *Risk:* the admin "vault" print preview would have lost the Ghana Card fields. *Mitigation:* the new single-record read returns full values to staff and writes an audit row; the frontend fetches it automatically when a staff member opens a document that arrived masked (`TenancyAgreementView`, guarded by a per-document ref so it fires once). Parties are unaffected — they still see their own document in full from the list.

3. **Legacy receipts whose landlord never had a linked account are visible to admins only.** Receipts carry no property id and no landlord phone, so the only way to match a legacy receipt to a landlord account is by *name* — which anyone can register under. I chose not to use name matching. *Risk:* a landlord may no longer see receipts issued before this change for them. *Mitigation:* the issuing landlord is linked from now on; tenants still see legacy receipts by phone match. **Recommended follow-up:** add `landlordPhone` to the receipt form (one small increment) so admins can link historical receipts deterministically; I did not add a name-based backfill.

4. **One audit row per staff document open.** *Risk:* noise in a table that has no retention policy yet. *Mitigation:* the read is one extra request per document, and the frontend fires it once per agreement id.

5. **Landlords attaching someone else's `propertyId` now get 403** instead of a silently mis-linked agreement.

Tenant, landlord and admin dashboards keep working: admins still see every record, parties still see their own, and every previously passing test still passes (see §5).

---

## 4. New / changed API surface

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/agreements/{id}` | party or admin | Full document; staff reads audited (`agreement.identity_viewed`) |
| `GET` | `/api/receipts/{id}` | party or admin | 404 for anyone else |
| `GET` | `/api/admin/audit-logs` | admin | Filters: `entityType`, `entityId`, `action`, `actorId`, `limit` (1–500) |

Unchanged contracts: `GET/POST /agreements`, `POST /agreements/{id}/sign`, `POST /agreements/{id}/email`, `GET/POST /receipts` keep their payload shape; `shape_agreement()` gains one field, `idsMasked`.

Audited actions: `agreement.created`, `agreement.signed`, `agreement.emailed`, `agreement.identity_viewed`, `receipt.issued`, `property.status_changed`, `property.featured_changed`, `property.verification_changed`, `property.deleted`, `enquiry.status_changed`, `email_outbox.run`, `document.uploaded`, `document.viewed`.

---

## 5. Verification actually run

```
$ npm run test:api
# tests 93
# suites 21
# pass 93
# fail 0
# cancelled 0
# skipped 0
# duration_ms 45914.102303
```
(the suite grew from 84 tests / 20 suites to 93 tests / 21 suites)

```
$ npm run lint      → tsc --noEmit, no output (clean)
$ npx tsc --noEmit  → clean
$ npm run build     → vite build ✓ built in 4.20s; dist/server.cjs 3.9kb
```

New regression coverage (`Agreement & receipt access control`, 8 tests):

- agreement list scoped to parties + staff; strangers' lists exclude the record;
- identity numbers masked in staff lists, full for parties, `idsMasked` flag honest;
- single-agreement read: party 200, stranger tenant 403, stranger landlord 403, guest 401, unknown id 404, staff 200 with full identity fields;
- signing: wrong landlord 403, wrong tenant 403, admin as tenant 403, admin as landlord 403, then tenant 200 and landlord 200 → status `active`;
- email: strangers 403, party 200, staff 200;
- landlord cannot attach another landlord's property to an agreement (403);
- receipts scoped per tenant / issuing landlord / staff, receipt-by-id 404 for strangers, 200 for party and staff;
- audit trail contains the expected actions, does **not** contain the raw Ghana Card numbers, and is admin-only (landlord 403, guest 401);
- a private document placed in the private store is **not** reachable via `/api/uploads/…`, and traversal attempts 404.

The suite's extra accounts are created by `tests/create-user.php` and then signed in normally:
creating them over HTTP would have pushed the run past the per-IP registration limit
(10/hour, counted before validation), which made two unrelated suites fail with 429→401.

**Mutation check** (to prove the new tests bite, then reverted): restoring the old role-only signature rule makes *"only a named party can sign"* fail; restoring the unscoped list makes *"the agreement list is scoped"* fail. Both mutations were reverted and the full suite re-run green.

---

## 6. Files changed

| File | Change |
| --- | --- |
| `php-backend/lib/audit.php` | **new** — audit writer, redaction, admin reader |
| `php-backend/lib/private_storage.php` | **new** — private document store + authorised streaming |
| `php-backend/lib/repository.php` | viewer-scoped agreement/receipt lists, party/ownership rules, masking, `find_agreement()`/`find_receipt()`, party linking on create, viewer-aware signing |
| `php-backend/lib/api.php` | new routes/handlers, sign/email/read authorization, audit wiring, upload path containment |
| `php-backend/config.php` | `PRIVATE_UPLOAD_DIR`, requires for the new libs |
| `php-backend/database.sql` | two nullable link columns per table, `audit_logs` |
| `php-backend/schema.sqlite.sql` | same, SQLite dialect |
| `php-backend/migrate.php` | required table + columns |
| `php-backend/storage/private/.htaccess`, `.gitignore` | deny-by-default guard for the private store |
| `src/components/TenancyAgreementView.tsx` | staff detail hydration for masked documents |
| `src/services/apiService.ts` | `getAgreement()` |
| `src/types.ts` | `idsMasked` flag |
| `tests/api.test.mjs` | new access-control suite |
| `tests/create-user.php` | **new** — test helper that inserts isolated accounts directly (keeps the suite inside the 10/hour per-IP registration limit) |
| `docs/AGENT_PLATFORM_AUDIT.md` | finding status after Increment 0 |
| `.gitignore` | keep stored private documents out of Git |

---

## 7. Remaining limitations

1. **Identity numbers are still stored in plaintext.** Masking is presentation-layer. Field-level encryption needs a key-management decision (where the key lives, rotation, backups) — deliberately not guessed at here. Until then, database access still exposes Ghana Card numbers.
2. **Legacy receipts for landlords need a phone field** to be linkable (see §3.3). No backfill was performed, by design.
3. **`audit_logs` is append-only in intent only.** No retention policy, no hash chaining, no tamper evidence, no admin UI (JSON endpoint only). Worth a follow-up before regulated activity.
4. **No cryptographic signature evidence.** The audit row records actor, IP and user agent for the sign action, but no document hash. Adding a hash of the rendered contract would strengthen dispute handling.
5. **Private document helpers are unused by any route** — the platform still accepts no identity documents. They exist so verification uploads cannot land in the public folder when Increment 3 adds them. `php-backend/.htaccess` cannot protect the private dir on nginx; a `location` deny is needed there.
6. **Scoping is bounded:** lists return up to 200 rows, legacy (unlinked) scan is bounded to 500 rows. Fine at current volumes, not at scale.
7. **MySQL was not executed.** This environment has no MySQL server; the MySQL DDL and `migrate.php --apply` were reviewed and the table-extraction regex was verified against `database.sql`, but only SQLite was actually run. Run `php api/migrate.php` (dry run) against staging before applying.
8. **No rate-limit changes** beyond existing ones; the new detail endpoint relies on authentication plus the audit trail.
9. **Admin agreement creation returns masked identity fields** in the create response (the creator is not a party). The UI hydrates on open; a direct API consumer must call `GET /agreements/{id}` for the full record.

---

## 8. Not done (per your instruction)

No deploy, no PR merge, no Increment 1, no agent tables, no tiers, no viewing-workflow changes, no commission logic.
