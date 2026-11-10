# GOODLUCKS HOMES — UPGRADE 2
## Phase 0: Codebase audit and implementation plan

| | |
|---|---|
| **Document** | `docs/UPGRADE2_PHASE0_AUDIT_2026-11-10.md` |
| **Programme** | Upgrade 2 (admin, tenant, agent/landlord, receipts removal, fee-policy authority) |
| **Phase** | **0 — audit and plan only. No feature code has been written.** |
| **Audit date** | 2026-11-10 |
| **Repository** | `Goodluck18/Goodlucks-rep` |
| **Branch audited** | `arena/1dbf260c-goodlucks-rep` at `ad2bb0a` (= `origin/main`, merge of PR #18) |
| **Production touched** | **No.** No deployment, no live database, no `main` change. |
| **Evidence basis** | Source reading at exact files/lines + live HTTP probes against throwaway SQLite databases in `.data/` (git-ignored) |

---

## 0. How to read this document

Every statement is marked by its evidence class:

- **[CODE]** — read directly from the repository at the file/line cited.
- **[PROBE]** — observed from a real HTTP request against a freshly created SQLite database through the repository's own server harness (`scripts/php.mjs`, `tests/helpers.mjs`).
- **[HYPOTHESIS]** — a plausible cause that **cannot** be confirmed in this sandbox (no browser, no Apache, no MySQL, no access to the live host). It is labelled as such and each one has a "confirm by" step in Phase 1.

Nothing in this document is a claim that a browser flow, a visual layout, or a live deployment behaves a certain way. Where such a claim would be needed, the manual verification step is written out explicitly.

**Execution rule in force:** this phase ends with this document. No requirement is implemented until you approve a phase.

---

## 1. Method, and the limits of this audit

### 1.1 What was done

1. Full read of the API route table (`php-backend/lib/api.php`, 4,642 lines) and the library modules that own the behaviour under review (`finance`, `fee_policies`, `viewings`, `viewing_terms`, `verification`, `blog`, `blog_content`, `blog_api`, `email_templates`, `outbox`, `repository`, `landlord_policy`, `alerts`, `property_serve`, `property_url`).
2. Full read of the admin, tenant, agent and landlord components in `src/components` (line counts in §3.3) plus `src/services/apiService.ts`, `src/context/AppContext.tsx`, `src/navigation/navModel.ts`, `src/routing/routes.ts`.
3. Schema review of all **43 tables** in `php-backend/database.sql`, their SQLite mirror (`schema.sqlite.sql`) and the additive-migration mechanism (`migrate.php`, 692 lines).
4. Live probes (three throwaway scripts in `/tmp`, databases under `.data/`, both git-ignored) exercising: admin bootstrap and login, image upload, fee-policy create/submit/approve, email-template create/update, blog post create + property cards + publish + public fetch, and the four "missing" admin endpoints. Results in §4.
5. A sanitizer probe run through the repository's own PHP runtime to confirm exactly what `blog_sanitize_html()` keeps and rewrites (§7.3).

### 1.2 What could not be done here (and will not be claimed)

| Not available | Consequence |
|---|---|
| A browser (no Chrome, no Playwright) | No visual/layout claim. Mobile card behaviour (A4), `contentEditable` behaviour (A2) and click-through flows are verified structurally and by DOM assertions, and require your manual check for final sign-off. |
| MySQL / system PHP | PHP executes only through `php-wasm`; the database is SQLite. All SQL in the plan is written for **both** dialects and each migration is proven on SQLite, with the MySQL DDL reviewed by hand. |
| Apache / the live host | The production `.htaccess` behaviour of one specific path (`/api/uploads`) cannot be reproduced. A1 is therefore split into what is proven and what must be confirmed on the deployed site. |
| The live database | No claim about existing production rows. Every migration in this plan is additive and preserves records; anything that would rewrite history is refused and reported instead. |

### 1.3 Baseline health (carried forward, unchanged by this phase)

Last full run before this audit, on the same tree: **api 279 · navigation 61 · routing 50 · content 4 · property 23 · sharing 36 · blog 35 · design 14 · email-footer 3 · access 13 · uploads 18 · responsive 14 — 0 failures**, `tsc --noEmit` clean, production build exit 0. This phase changed no code, so that baseline still stands; it is the regression gate for every later phase.

---

## 2. Blocking administrative issue: the designated branch does not exist

Your instructions name the working branch `arena/a67485fb-goodlucks-rep`. That branch **does not exist** in this repository:

```
$ git branch -a
* arena/1dbf260c-goodlucks-rep
  main
  remotes/origin/main
```

This session is bound to **`arena/1dbf260c-goodlucks-rep`**, branched from `ad2bb0a` (the PR #18 merge, which is `origin/main`). I did not create a branch named `a67485fb` and did not switch branches: creating an unrequested branch would silently divorce the work from this session's tracking, and pushing anywhere else is prohibited by the standing rules.

**Decision needed from you (one line in your reply):** continue on `arena/1dbf260c-goodlucks-rep` (recommended — it already contains everything `main` has), or tell me explicitly that you want a differently-named branch created and this work moved there. Everything below assumes the current branch.

---

## 3. What exists today

### 3.1 Stack and shape

- **Frontend:** React + TypeScript + Vite, Tailwind-style utility classes with the six-colour Goodlucks palette, a single-page router (`src/routing/routes.ts`) with role guards, one API client (`src/services/apiService.ts`) whose only transport is `request<T>() → fetch('/api' + path)` with `credentials: 'same-origin'`.
- **Backend:** PHP 8 front controller (`php-backend/index.php` → `dispatch_api_request()`), 22,028 lines across `php-backend/lib/`, PDO over MySQL **or** SQLite, additive migrations in `migrate.php` (dry-run by default, `--apply` to execute).
- **Auth:** session cookies (`auth_sessions`), four roles: `tenant`, `landlord`, `agent`, `admin`. Seven boolean capability flags on `users`; **granting is CLI-only** (`admin_bootstrap.php`, `grant_reviewer.php`, `grant_finance.php`, `grant_viewing.php`) — there is deliberately no HTTP grant endpoint.
- **Email:** `send_email()` → `queue_email()` → `email_outbox` (retry with backoff, `email_logs` mirror) drained by `cron.php` and by a request-shutdown flush.

### 3.2 Admin console today (12 tabs, `src/components/AdminDashboard.tsx`)

| Tab id | Label in UI | Component | Search | Filters | Sorting | Server pagination |
|---|---|---|---|---|---|---|
| `analytics` | Overview | inline (1,657-line parent) | – | – | – | – |
| `approval-queue` | Approval queue | inline | – | – | – | – |
| `manage` | Manage listings | inline | **no** | **no** | **no** | no (fetches, then filters in JS) |
| `matching` | Tenant matching | inline | **no** | **no** | **no** | no |
| `viewings` | Viewings | `AdminViewingsPanel` (546) | **yes** (viewings only, line 403) | partial | no | no |
| `agents` | Agent accounts | `AdminAgentAccounts` (…) | **no** | **no** | **no** | no |
| `fee-policies` | Fee policies | `AdminFeePolicies` (688) | – | – | – | – |
| `finance` | Finance | `AdminFinancePanel` (708) | – | – | – | – |
| `enquiries` | Enquiries | inline | **no** | **no** (3 statuses as buttons) | no | no |
| `email-logs` | Email logs | inline | – | – | – | – |
| `blog` | Blog | `AdminBlogPanel` (393) → `AdminBlogEditor` (844) | – | – | – | – |
| `email-templates` | Email templates | `AdminEmailTemplates` (548) | – | – | – | – |

Absent entirely: **User Management**, **Bulk Email**, **contact-disclosure approval**, **per-user profile with activity**, **global recent-activity feed**.

### 3.3 Component inventory (lines, current tree)

`AdminDashboard` 1657 · `VerificationPanel` 1066 · `TenantDashboard` 991 · `AdminBlogEditor` 844 · `LandlordDashboard` 820 · `ReceiptsView` 772 · `AdminFinancePanel` 708 · `ListPropertyView` 694 · `AdminFeePolicies` 688 · `PropertyDetailView` 671 · `AdminFeeLedger` 596 · `AdminVerificationQueue` 591 · `AdminEmailTemplates` 548 · `AdminViewingsPanel` 546 · `AgentDashboard` 530 · `FindAHomeView` 499 · `BrowseView` 485 · `AuthModal` 450 · `GetNotifiedModal` 439 · `AdminLandlordFinance` 403 · `AdminBlogPanel` 393 · `AgentViewingsPanel` 384 · `Navbar` 382 · `AccountSettingsView` 332 · `DashboardShell` 328 · `AgentListingForm` 327 · `NotificationsView` 180.

### 3.4 Test suite that gates every later phase

`tests/api.test.mjs` (279 assertions, ~283 s), `uploads` 18, `responsive` 14, `navigation` 61, `routing` 50, `content` 4, `property` 23, `sharing` 36, `blog` 35, `design` 14, `email-footer` 3, `access` 13, plus `concurrency`, `migration`, `finance-race.php`. Harness: `tests/helpers.mjs` (`ApiClient` with cookie jar + `FormData`, `createPng`), `scripts/php.mjs` (`startApiServer`, `runPhpScript`).

---

## 4. Live probe results (evidence table)

Server: fresh SQLite database per run, `ADMIN_ACCESS_KEY=audit-access-key`, admin bootstrapped through `php-backend/admin_bootstrap.php`, cookie session, `EMAIL_TRANSPORT=none`.

| # | Probe | Result | Reading |
|---|---|---|---|
| 1 | `POST /api/uploads` (admin session, PNG 120×90, field `file`) | **201** `{"urls":["/api/uploads/gl-20261110-7e64ba07d49c4611b30c.png"],"count":1,"warnings":[]}` | The upload endpoint exists and works server-side. A1 is not a missing route. |
| 2 | `POST /api/uploads/` (trailing slash) | **201**, identical shape | Both spellings are routed. |
| 3 | `GET /api/admin/blog/posts` | 200, `posts: []` | Blog module live; nothing pre-seeded. |
| 4 | `GET /api/admin/email-templates` | 200, `templates: []`, `targets: [14 entries]` | 14 canonical target keys exist. |
| 5 | `POST /api/admin/fee-policies` without capability | **403** "…requires the fee-policy manager capability." | Capability gate works. |
| 6 | `grant_finance.php --manage=1 --approve=1 --view=1 --confirm=1`, then create `rental_commission/standard/61+39` | **201** `fp-…` | Create works with capability. |
| 7 | `POST /api/admin/fee-policies/<id>/submit` | 200 → `pending_approval` | Lifecycle works. |
| 8 | `POST /api/admin/fee-policies/<id>/approve` **as the creator** | **422** "A policy must be approved by a different administrator from the one who created it." | §3.1 guard exists exactly as described — this is the string the primary admin must stop seeing. |
| 9 | `POST /api/admin/email-templates` (paragraph / link / untagged text) | **201** each; link canonicalised to `<a … target="_blank" rel="noopener noreferrer">` | Server accepts all three shapes; "No content" is not the sanitizer. |
| 10 | `PATCH /api/admin/email-templates/<id>` | 200 | Update path works. |
| 11 | `GET /api/admin/users` | **404** "Endpoint not found." | A11 has no backend at all. |
| 12 | `GET /api/admin/bulk-email` | **404** | A12 has no backend at all. |
| 13 | `GET /api/admin/activity` | **404** | A14 has no backend at all. |
| 14 | `GET /api/admin/contact-disclosures` | **404** | B6 approval queue has no backend. |
| 15 | `GET /api/admin/enquiries` | 200 `{enquiries: []}` | A10 backend exists; only statuses/filters are missing. |
| 16 | `GET /api/receipts` | 200 `{receipts: [], issuingEnabled: false}` | Receipts exist but issue nothing. |
| 17 | `GET /api/auth/me` after grants | `feePolicyManage/Approve`, `financeView/Confirm` = true; `verificationReviewer`, `identityDocumentAccess`, `viewingCorrections` = false | Capability map is per-account and truthful. |
| 18 | Blog post with **video only** `[PROBE]` | 201; stored `<iframe class="gl-video-frame" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" …>` | Canonicalised, no-cookie embed; survives save. |
| 19 | Blog post with **showcase only** `[PROBE]` | 201; stored `<div class="gl-showcase"></div>` byte-exact | Placeholder survives save when posted through the API. |
| 20 | Blog post with **video then showcase** `[PROBE]` | 201; stored **both**, in order | One article can hold both — the server has no conflict. |
| 21 | Blog post with **showcase then video** `[PROBE]` | 201; stored **both**, in order | Same. |
| 22 | `blog_sanitize_html($html, ['allow_media'=>false])` `[PROBE]` | `<p>`, `<a>` (+ `target`/`rel`), bare text, bare URLs and `\n` all preserved; nothing dropped | A5's empty body is client-side. |
| 23 | Missing `moveInDate` on `POST /tenant-requests` `[CODE]` | 422 "Choose a valid move-in date." | Backend already requires it; B1 is a frontend default, not a missing rule. |

---

## 5. Root-cause findings for the reported defects

These are the concrete diagnoses. Each is either **[CODE]** (certain from source) or **[HYPOTHESIS]** (needs confirmation in the environment named).

### 5.1 A1 — "Endpoint not found" when uploading a blog featured image

**Proven:**
- The client calls `api.uploadImages()` → `POST /api/uploads` with `FormData` field `file` (`src/services/apiService.ts:538-542`). **[CODE]**
- The endpoint returns 201 for exactly that request (§4 rows 1–2). **[PROBE]**
- The client shows the server's own `error` string verbatim on any non-2xx (`apiService.ts:126-141`); `"Endpoint not found."` is the front controller's own 404 text, so the request that failed was **not matched to a route** — i.e. it hit something other than the PHP router. **[CODE]**

**Therefore the failure is environmental, not logical.** Two candidates, both consistent with every observation:

1. **A stale deployed bundle** (`dist/`) still calling an older path, while the server has only `/api/uploads`. Confirm by loading the deployed site, opening DevTools → Network, and reading the exact request URL/method on a failed upload.
2. **Apache trailing-slash redirect on the real upload directory.** In production, `public_html/api/uploads/` is a **real directory**. The API `.htaccess` rewrites unmatched paths to `index.php`, but `mod_dir` may still answer `POST /api/uploads` (no trailing slash) with a `301` to `/api/uploads/`. Browsers re-issue a 301 POST as a **GET**, which then reaches `index.php` as `GET /api/uploads/` → 404 "Endpoint not found." This cannot happen under the dev server (`router.php`), which is why the test harness passes. **[HYPOTHESIS — must be confirmed with the Network panel on the live host; the fix below is harmless either way.]**

**Fix planned (Phase 2, small):**
- Post to `/api/uploads/` (explicit trailing slash) from `apiService.uploadImages`; keep both server routes.
- Add an explicit, order-first rewrite in `php-backend/.htaccess` so the bare directory path can never be answered by `mod_dir`: `RewriteRule ^uploads/?$ index.php [L,QSA]`.
- Keep `uploads/.htaccess` as-is (static files only, no execution).
- Regression test: upload through the widget path in `uploads.test.mjs`, asserting 201 on **both** spellings, and that a non-image is refused with a field error.
- Manual confirmation step for you after deploy (exact clicks listed in Phase 2's report).

### 5.2 A2 — YouTube video and property cards cannot coexist in one post

**Proven:** the **server** keeps both, in either order (§4 rows 20–21), and canonicalises the video. So the conflict is entirely inside the editor/renderer. **[PROBE/CODE]**

**Root cause, two mechanisms:**

1. **Exact-string matching of a browser-normalised DOM.** `AdminBlogEditor` is a `contentEditable` and inserts markup with `document.execCommand('insertHTML', …)` (`AdminBlogEditor.tsx:142-146`). Inserting an *empty* `<div class="gl-showcase"></div>` into a contentEditable is normalised by browsers to `<div class="gl-showcase"><br></div>` (the emptiness is padded). `BlogArticleBody` finds the showcase by `html.indexOf('<div class="gl-showcase"></div>')` (`BlogArticleBody.tsx:41-44`); once a `<br>` appears, `indexOf` fails, `cards` are never rendered, and the reader sees an empty block. Editing around an `<iframe>` (which browsers treat as an atomic control) makes that normalisation more likely — which matches "adding a video breaks the cards". **[CODE + HYPOTHESIS on the exact DOM the browser produces]**
2. **Caret-dependent insertion.** Both inserts happen at the caret (`execCommand('insertHTML')`). If the caret is inside the showcase `<div>`, the iframe is inserted *inside* it and the marker stops matching; if the caret is inside the video figure, the showcase goes inside the figure. There is no guard for either case (the only guard is `content.includes('gl-showcase')` for the showcase button, `AdminBlogEditor.tsx:194-199`). **[CODE]**

**Fix planned (Phase 2):**
- Split on a **structure-tolerant** rule, not a byte-exact string: a regex that matches any `<div>` whose class list contains `gl-showcase`, together with its children (`/\<div[^>]*class="[^"]*\bgl-showcase\b[^"]*"[^>]*>[\s\S]*?\<\/div>/`), so `<br>` padding and stray children cannot defeat it.
- Normalise on the server too: `blog_sanitize_html` collapses the showcase block to the canonical empty div on save, so stored HTML is always clean for every consumer (server-rendered cards, share cards, exports).
- Replace `execCommand` insertion for these two block types with a deterministic "append block at the end of the body" action (buttons read "Add video", "Add property showcase"), each of which replaces an existing block of the same type instead of nesting it. Ordinary text formatting stays on `execCommand`.
- Editor shows a live structure hint: "Video: 1 · Showcase: 1".
- Tests (jsdom-level, `blog.test.mjs` + a new `blog-editor.test.mjs`): tolerant split with `<br>` padding, children, and both orders; server normalisation idempotent; sanitizer still refuses non-YouTube iframes and `javascript:` URLs.
- Manual step for you: one post with both embeds, published, checked on desktop and mobile.

### 5.3 A3 — Blog link previews are not working

**Proven:** property pages get server-rendered share metadata — `public/.htaccess` rule 2c routes `/property/…` to `api/property_page.php`, which emits the listing's own title/description/price/photo and canonical URL before React boots. **`/blog` and `/blog/<slug>` have no such rule**: they fall through rule 4 to `index.html`, whose `<head>` carries only the generic site card (`og:url` = `https://goodlucks.co/`, `og:title` = "Goodlucks Homes - Rentals & Real Estate in Accra", `og:image` = `/og-image.jpg`). **[CODE: `public/.htaccess`, `index.html:7-52`, `php-backend/router.php`]**

Consequence: WhatsApp/Facebook/X/LinkedIn show the generic site preview for every article, and no article image or title. This is the most probable meaning of "blog link previews are not working"; the secondary meaning (the editor's own **Preview** panel, `AdminBlogEditor.tsx:384/681`) is broken by the *same* DOM problem as A2, because it renders `editorRef.current.innerHTML`.

**Fix planned (Phase 2):**
- New `php-backend/blog_page.php` + `lib/blog_serve.php` modelled exactly on `property_serve.php`: fetch the published post by slug, emit title, description (excerpt), canonical `/blog/<slug>`, `og:type=article`, `og:image` (featured image), `article:published_time`, Twitter card, and JSON-LD `Article`; 404 page for drafts/unknown slugs (drafts must stay indistinguishable from missing).
- Extend the `/blog` index the same way with a site-level card and the first N published titles.
- Add `/blog/([A-Za-z0-9._-]+)/?$` and `^blog/?(\?.*)?$` rules to `public/.htaccess` **before** the SPA fallback, and mirror the routing in `php-backend/router.php` so the dev server behaves identically.
- Tests: `sharing.test.mjs` additions asserting the meta tags for a published post, absence of tenant/agent contact data in the HTML, and 404 for a draft slug; `sitemap` already lists posts — assert consistency.
- Manual step: one article pasted into a WhatsApp chat after deploy.

### 5.4 A5 — Email template editor saves "No content"

**Proven, exactly, in the client:**

```ts
// src/components/AdminEmailTemplates.tsx:99-102
const bodyValue = (): string => {
  if (editing === 'new') return '';                       // ← always empty for a NEW template
  return bodyRef.current?.value ?? (editing?.bodyHtml ?? '');
};
```

and the editor body is an **uncontrolled** textarea:

```tsx
// src/components/AdminEmailTemplates.tsx:309-316
<textarea
  ref={bodyRef}
  defaultValue={editing === 'new' ? '' : editing.bodyHtml}   // no key → value only applied at mount
  …
```

Two defects follow:
1. **Creating a template can never save a body.** For `editing === 'new'`, `bodyValue()` returns `''` unconditionally, whatever the admin typed → `POST /admin/email-templates` with `bodyHtml: ''` → server 422 "The template has no content." (The server is correct: §4 rows 9–10 show the API accepts real bodies, and the sanitizer preserves text, links and paragraphs.)
2. **Editing can show the wrong body.** Because the textarea has no `key`, React sets `defaultValue` only on mount. Selecting a second template while the form is open leaves the previous body in the DOM, and `bodyValue()` reads the DOM — so saving template B can store template A's text, or an empty field if the form was opened on "New" first.

**Fix planned (Phase 2, ~1 hour + tests):**
- Make the body a controlled value (`const [body, setBody] = useState(...)`), initialised from the selected template, with `key={editing === 'new' ? 'new' : editing.id}` on the wrapper as a belt-and-braces remount.
- `bodyValue()` returns the state; `wrapSelection()` updates both state and `selectionStart`.
- Keep the link checker and the blog-link picker working against the same state.
- Tests (new `email-templates.test.mjs` + `api.test.mjs` additions): create with paragraph HTML; create with a link; create with untagged text; edit an existing template and change only the name (body preserved); empty body still rejected 422 with the field message; `<script>` stripped.

### 5.5 B1 — move-in date is silently defaulted

**Proven:**
- `src/components/FindAHomeView.tsx:150` — `const [moveInDate, setMoveInDate] = useState('2026-09-01')`. That is the September default you described. **[CODE]**
- Backend already rejects a missing/invalid date: `api.php:2595-2598` → 422 "Choose a valid move-in date." **[CODE + PROBE row 23]**
- `tenant_requests.move_in_date` is `VARCHAR(64) DEFAULT NULL` — historical rows may already hold that fake September date and must not be mass-edited. **[CODE]**

**Fix planned (Phase 5, small):**
- Remove the default (`useState('')`), mark the field required with a visible hint, disable submit until chosen, and show the message inline and in the server's field-error map.
- Send `moveInDate` explicitly; add a client-side guard so the form cannot be submitted with `''`.
- Tests: form validation (empty → blocked, message shown), API 422 mapping, and a regression test that no literal `2026-09-01` remains in `src/`.
- Data question for you (see §12): existing requests that carry the placeholder date — leave untouched (recommended) or flag them for the admin to re-confirm? I will not rewrite them silently.

### 5.6 B6 — tenant contact details are already visible to agents/landlords

**Proven, and this is the most serious privacy finding of the audit:**

- `shape_viewing()` returns `tenantName`, `tenantPhone`, `tenantEmail` for **every** viewing row with no relationship between the viewer and an approval (`php-backend/lib/repository.php:144-147`). Any agent or landlord with access to a viewing therefore receives the tenant's phone number and email **before** any administrator has approved disclosure. **[CODE]**
- The UI displays them: `AgentViewingsPanel.tsx:160`, `AdminViewingsPanel.tsx:189/503`, `TenantDashboard`/`AdminDashboard` request lists. **[CODE]**
- The viewing-request email sent to the agent embeds the tenant's phone and email in the body: `api.php:2917` `e($viewing['tenantPhone']) . ' / ' . e($viewing['tenantEmail'])`. **[CODE]**

So B6 is not "build a disclosure feature": it is **close an existing leak, then build the approved chain on top**. Any implementation that only adds a queue without redacting these three places would leave the rule broken.

**Fix planned (Phase 5, medium; must be its own reviewable change):**
- `shape_viewing()` returns `tenantPhone`/`tenantEmail` only when: the viewer is the tenant themselves, an admin, or an **approved** `contact_disclosures` row exists for that viewing and viewer, and it has not expired/been revoked. Otherwise the fields are `''` and a `contactDisclosure: {state, requestedAt, decidedAt}` object is returned.
- Email bodies are built from the redacted shape; the agent's "you have a viewing request" email contains the property, the date/time and the tenant's first name only.
- New `contact_disclosures` table + admin queue + audit events; tenant is notified when disclosure is approved (so they know what was shared with whom).
- Tests: 403/empty-field matrix (tenant+agent+landlord+admin × disclosed/not/excluded), no contact data in any public or agent-facing JSON before approval, email body scan, and a "revoked hides it again" test.

### 5.7 C1 — agents currently *cannot* list without a landlord reference

**Proven:** `handle_create_property()` refuses an agent submission unless `landlordId`, `landlordEmail`, or `landlordPhone` is present:

```php
// php-backend/lib/api.php:1593-1600
if ($landlordId === '' && $landlordEmail === '' && $landlordPhone === '') {
    error_response('Provide the landlord this listing is for.', 422, […]);
}
```

The agent form enforces the same client-side (`AgentListingForm.tsx:61`), shows "The landlord you are acting for" (`:266`), and the agent dashboard states the declaration is unverified (`AgentDashboard.tsx:120/301`). The listing carries `landlord_authority_state` and `landlord_contact_claimed` columns, and 38 references across `lib/` implement the authority model. **[CODE]**

So "agents and landlords are independent" is **blocked today**: an independent agent cannot publish. This is the largest behavioural change in C, and it touches the approval queue, the property shape, verification copy and the property tests.

**Fix planned (Phase 6):**
- Agents submit without any landlord reference. Keep the columns (no destructive migration) but write `landlord_authority_state = 'not_required'` for agent submissions and stop returning `landlordName`/`landlord_contact_claimed` to anyone but staff.
- Remove the landlord block from the agent form and the "acting for a landlord" copy from the agent dashboard, verification, and the listing email templates.
- Existing listings keep their stored values and continue to render (backward compatibility asserted by test).
- Optional, staff-only: an "owner reference (optional, private)" field that is never shown anywhere else — off by default; see §12 for your call.

### 5.8 E2 — provider type is chosen at registration, not at verification

**Proven:** `AuthModal.tsx:179` offers "Agent (I act for landlords)", `:183` states "This choice is fixed for the account", and registration already accepts `tenant|landlord|agent` with a `providerCategory` agreement check (`api.php:341-367`). No role change exists anywhere (`users.role` is only rewritten by `admin_bootstrap.php`). `identity_verifications.subject_role` already stores the role with each verification, so an irreversible choice made at verification is easy to record. **[CODE]**

**Fix planned (Phase 6):**
- Registration: **Tenant** or **Property provider** (two groups). The provider record is created as `landlord` pending verification with a `provider_type = 'undecided'` state (new nullable column on `agent_profiles` or a small `provider_profiles` view — decision in §12).
- At the first verification submission the provider picks **Agent** or **Landlord**, once; the API stores it on the verification and locks it (subsequent attempts 409 with "already fixed"). Admin can correct it only through an audited staff action.
- Remove every "agent acting for a landlord" phrase; add a copy test that greps the built bundle for the removed strings.

### 5.9 A6/A7/A8/A10 — the searches and filters do not exist; the backend mostly does

**Proven:** none of the four admin lists has a search input or status filter; `AdminDashboard` fetches everything and filters in JavaScript (`AdminAgentAccounts.tsx` has no search state at all). But the backend is closer than it looks:

| Need | Existing backend | Gap |
|---|---|---|
| A6 listings: search, location, date, price, status, sort, across pages | `GET /admin/properties` forwards `status`, `q`, `sort`, `page`, `perPage` (`api.php:2254-2274`); `query_properties()` supports `q`, `location`, `city`, `type`, `bedrooms`, `minRent`, `maxRent`, `status[]`, `sort ∈ {newest,oldest,price_asc,price_desc,popular}`, `page`, `perPage ≤ 100` (`repository.php:546-650`) | no `from`/`to` date filter; the UI passes none of it and paginates client-side, so with more than 100 listings results are silently incomplete |
| A7 tenant matching: search name/phone, status filters | `GET /admin/tenant-requests` → `list_tenant_requests()`; matches endpoint already returns real scores + `curated` | UI has no search/filter; `REQUEST_STATUSES = submitted/searching/matched/viewing_scheduled/completed/cancelled` ≠ the pending/approved/viewing-scheduled vocabulary you asked for |
| A8 agent accounts: search name/email/location, pending/approved-for-listing/suspended | `GET /admin/agents`, `POST /admin/agents/:id/status` (+ `AGENT_ACCOUNT_STATUSES`) | no search/filter; verification state and listing authorisation are shown but not filterable separately |
| A10 enquiries: search name/email/phone, 5 statuses | `GET /admin/enquiries`, `PATCH /admin/enquiries/:id`; `ENQUIRY_STATUSES = ['new','contacted','closed']` (`validate.php:15`) | two statuses missing (`received`, `replied`), no search, no filters |

### 5.10 E1 — "receipts" is two different things; only one may be removed

**Proven:** the word covers two unrelated systems:

| System | Tables | Where | Verdict |
|---|---|---|---|
| **Tenant rent receipts** (the feature you want gone) | `rent_receipts` (isolated: no foreign keys point at it; `reversal_of_receipt_id` belongs to `fee_remittances`, not here) | `GET/POST /receipts`, `GET /receipts/:id`, `ReceiptsView` (772), `navModel` landlord tab, `DashboardShell` "Payment records", `AppContext` (34 references), `apiService` (`listReceipts`/`createReceipt`), `types.RentReceipt`, `tests/create-receipt.php`, `tests/api.test.mjs` (132 mentions) | **Remove** (pages, menus, buttons, forms, endpoints, client state, tests). Data preserved: the table is **not dropped** in the same phase. |
| **Fee-ledger "receipts"** (money Goodlucks received: viewing fees, commissions) | `fee_remittances` (positive rows) + linked `reversal` rows | `POST /admin/finance/receipts/:id/reverse` → `handle_admin_reverse_receipt()` (`finance_api.php:157+`), `AdminFeeLedger` | **Keep.** This is the audit trail of platform money; deleting it would break fee policies, commissions and audit, which E1 forbids. The route *name* is confusing but changing it is an unrelated refactor — I recommend a comment plus a doc note, not a rename. |

`rent_receipts` also has a `migrate.php` column-upgrade entry, so removal must touch schema files carefully; and since `issuingEnabled` is already `false` (§4 row 16), no new rows are being created — which makes removal low-risk.

---

## 6. Requirement-by-requirement audit

Legend for **Complexity**: S ≤ 0.5 day · M 1–2 days · L 3–5 days · XL > 5 days (one developer, including tests).

### 6.1 §3 — Primary administrator authority (A9 depends on it)

| Item | Evidence | Gap | Plan | Data | Complexity |
|---|---|---|---|---|---|
| Authority belongs to `goodlucksonly@gmail.com` specifically | `users` has 7 boolean capability flags, all default 0; granting is CLI-only (`grant_finance.php` etc.); **no primary-admin marker exists** | No way to express "this account and no other" | Add `users.is_primary_admin TINYINT(1) NOT NULL DEFAULT 0`; capability resolution treats it as the union of all capabilities (single source of truth in `auth.php`); a dedicated CLI `assign_primary_admin.php --email=… --confirm` (no HTTP path, matching existing design) sets **only** the flag, and never stores duplicate capability bits that could drift from it | 1 column + index; `migrate.php` + both schema files | M |
| **Self-approval allowed for the primary admin only** | `fee_policies.php:856-890` raises 422 when creator = approver | Guard must exempt exactly one account | Pass the acting user into the approval check; allow when `is_primary_admin = 1`; every other admin keeps the 422. The approval record stores `self_approved = 1` and an audit event `fee_policy.self_approved` so the exception is visible in the trail | `fee_policy_events` (existing) + `fee_policies.self_approved` | S–M |
| Create / edit / approve / reject / activate / deactivate / delete | Lifecycle `draft → pending_approval → approved → active → deactivated/rejected` with notes, `fee_policy_snapshots` on apply | Delete exists? (verify in Phase 4) and "reject with reason" copy | Complete the missing verbs, all audited; deleting a policy that priced a transaction is refused (history preserved) | – | M |
| Percentages: agent share, platform share, viewing fee, agent tiers | `AGENT_TIERS = {standard, professional}`; shares must total exactly 100; `FEE_POLICY_CATEGORIES = {viewing_fee, rental_commission, other_service_fee}`; GHS only | Tier *arrangements* (A9) need per-tier visibility and a per-agent assignment UI (assignment endpoint exists: `POST /admin/agents/:id/tier`) | Build the tier overview + bulk view; keep the 100 % invariant and the snapshot rule | maybe `fee_policy_tiers` if per-tier rows are needed — decide after reading the existing tier fields in Phase 4 | M–L |
| Audit trail: creator, editor, approver, time, activation date, old/new values, actions | `fee_policy_events`, `fee_policy_snapshots`, `audit_logs` (`actor_id`, `action`, `entity_type`, `context_json`) | Trail exists; needs the self-approval distinction and a readable UI | Extend the events UI to show before/after and who acted | – | S |
| Never rewrite historical transactions | Redemptions reference `fee_policy_snapshots` | – | Add a regression test: activating a new policy leaves existing `fee_remittances`/`rental_commissions` rows byte-identical | – | S |
| **Acceptance test §3.2** | 422 reproduced (§4 row 8) | – | Automate: primary admin create → change agent share → submit → approve (same account, 200) → activate → the applied split equals the new values; plus ordinary admin still 422; plus a second admin approving the primary's policy still works | – | S |

> **Design note:** the primary flag must not be a capability someone can grant over HTTP. Keeping assignment CLI-only is consistent with `grant_*.php` and satisfies "privileges must NOT extend to other admins".

### 6.2 A — Admin console

| ID | Requirement | Current state (evidence) | Gap | Plan | Complexity |
|---|---|---|---|---|---|
| **A1** | Blog featured-image upload works | endpoint OK **[PROBE]**; client OK **[CODE]**; failure is environmental (§5.1) | production path | Trailing-slash POST, order-first rewrite, uploads tests, manual confirmation | S |
| **A2** | YouTube + property cards in one post | server keeps both **[PROBE]**; renderer needs an exact marker and editor inserts via `execCommand` **[CODE]** | structural fix | Tolerant split + server normalisation + deterministic block insertion + editor counters | M |
| **A3** | Blog link previews | property pages have server meta; blog does not **[CODE]** | missing renderer | `blog_page.php` + `blog_serve.php` + `.htaccess`/`router.php` rules + OG/Twitter/JSON-LD + 404 for drafts | M |
| **A4** | Mobile property cards: smaller, horizontal, scroll right→left, desktop unchanged | `PropertyCard` is a vertical card in `grid-cols-1 sm:grid-cols-2 md:grid-cols-4` (`BrowseView.tsx:269`, `PropertyCard.tsx:20-98`) | no horizontal variant, no snap strip | New `layout="horizontal"` variant (image left, compact body) rendered inside a `flex overflow-x-auto snap-x` strip below `sm`, existing grid at `sm+`; same component everywhere it is used so the change is consistent | M |
| **A5** | Email template editor saves content | two client defects (§5.4) | controlled body + remount key | §5.4 | S |
| **A6** | Manage listings: search, location/date/price/status filters, sorting, across pages | server filters exist, UI has none, `perPage ≤ 100` (§5.9) | wiring + date range + real pagination | Server: add `createdFrom`/`createdTo`; UI: search box, filter row, sort select, page controls, "showing X of Y"; every filter round-trips to the API (no client-side filtering) | M |
| **A7** | Tenant matching: search name/phone + status filters; auto-appear in approved section | list + matches endpoints exist; UI has neither | search/filters + status vocabulary | Server: `q` (name/phone/email) + `status[]` on `list_tenant_requests`; map legacy statuses to `pending / approved / viewing_scheduled / …` with a display-only mapping (no destructive rewrite); UI sections | M |
| **A8** | Agent accounts: search name/email/location + pending / approved-for-listing / suspended; keep verification ≠ listing authorisation | `AGENT_ACCOUNT_STATUSES`, `can_submit_listings`, verification tables exist; UI has no search | search/filter + two-axis display | Server: `q` + `status[]` + `canSubmit` filter; UI shows two badges per account (Identity verified / Listing approved) with separate explanations | M |
| **A9** | Fee policies and agent tiers | full policy engine, lifecycle, snapshots, tier assignment endpoint | needs §3 authority + tier overview + complete verbs | Phase 4 | L |
| **A10** | Web inquiries: search name/email/phone + 5 statuses | 3 statuses, no search (§5.9) | expand + search | Expand `ENQUIRY_STATUSES` to `new, received, contacted, replied, closed`; additive mapping for legacy rows (`new` stays `new`); UI filter chips + search; audit event on each change | M |
| **A11** | User Management: search name/email/phone, filter type + status, open profiles; landlord statuses | **no endpoint, no component** (§4 rows 11) | everything | New `GET /admin/users` (paged, search, role + status filters, safe fields only — never password hashes, never documents), `GET /admin/users/:id` (profile summary), UI tab with table + filters; agent rows link to Agent accounts for verification, landlord statuses derived from verification + listing authorisation | L |
| **A12** | Bulk email: audiences, subject, editor, link/property/blog insertion, validation, dedupe, queued sending, per-recipient records, summary, retries, preferences/unsubscribe, no address leakage | `queue_email` + `email_outbox` (retry/backoff) + `email_logs` + `cron.php` exist; **no campaign concept, no preferences, no endpoint, no UI** (§4 row 12) | campaign layer + segmentation + unsubscribe | New `email_campaigns` + `email_campaign_recipients` (unique per campaign+email), `email_preferences` + signed unsubscribe token in every bulk email footer; send through the existing outbox in batches (never SMTP-per-recipient in the request); admin UI with recipient preview, per-recipient status, retry-failed, and a summary; **BCC/one-recipient-per-message only — no `To:` list** | XL |
| **A13** | Individual user profiles + real activity history (properties, favourites, rental requests, viewings), ID documents protected | data exists (`properties`, `saved_properties`, `tenant_requests`, `viewing_schedules`); `verification_documents.flags = R` in `storage/private`; `audit_logs` | no endpoint/UI | `GET /admin/users/:id/activity` aggregated from real rows with timestamps and links; documents shown only as "on file, gated by `can_access_identity_documents`" with no URL — never a link into `storage/` | L |
| **A14** | Dashboard recent-activity overview, real records only, linkable | `analytics` tab shows traffic/visitor charts; `audit_logs` has `actor`, `action`, `entity`, `created_at`, indexed | no activity feed | `GET /admin/activity?limit=…` reading `audit_logs` (+ recent viewings/requests/enquiries), each entry with a title, actor, timestamp and a link to the record; no invented metrics | M |

### 6.3 B — Tenant experience

| ID | Requirement | Current state | Gap | Plan | Complexity |
|---|---|---|---|---|---|
| **B1** | Move-in date mandatory, no auto-default | fake default `2026-09-01` (`FindAHomeView.tsx:150`); server already requires it | client default + UX | §5.5 | S |
| **B2** | Real matching scores: location + nearby proximity, budget, type, beds, baths; sort by score | `match_score()` (`api.php:4435-4471`) = base 70 + budget 20 + beds 8 + location substring 5 + type 4, clamped 40–98; **no bathrooms, no proximity**; sorted by score already | add two dimensions honestly; **no coordinates exist in the schema** | Add `latitude`/`longitude` (nullable) to `properties` **and** an admin-maintained `area_adjacency` table (neighbouring areas with a distance band) so proximity works with no third-party geocoder; scoring becomes a documented weighted sum (budget 35, location 20, proximity 15, type 10, beds 10, baths 10) with a `matchBreakdown` array in the response so the UI can explain the number; listings without coordinates fall back to area adjacency only and the score says so. Test with a fixture matrix that asserts monotonicity (closer/cheaper/more suitable scores higher) | L |
| **B3** | "Chosen for You" (admin-selected, ≥3, first, visually distinct) vs "See Similar Matches" | `curated` flag + curated-first sort exist (`handle_matches`), one combined list; curation is set through `updateTenantRequestStatus(..., matchedPropertyIds)` | split UI + ≥3 rule + dedicated curation UI | Server: `curatedForYou` and `similarMatches` as separate arrays, warning when curated < 3; curation endpoint validated (3–6, live listings only); UI: distinct panel first, then "See similar matches" with scores and reasons, clearly labelled as not staff-selected | M |
| **B4** | Tenant "Request viewing" action + notification + status | `ViewingRequestModal`, `POST /viewings`, `viewing_notify()` (in-app + email) exist | verify the button exists on the property page and every match card | Reuse; ensure the action appears on property pages and match cards, confirmation shows the tracked status | S |
| **B5** | Agent/landlord approve · reschedule (alt date+time+reason, tenant must accept) · cancel with reason; full history | rich lifecycle + transition matrix + `viewing_events`; **landlord may only cancel**; `confirmed → rescheduled` is agent/admin and bypasses tenant acceptance | role matrix + acceptance step + reason requirement | Landlord gains propose/confirm/reschedule_request/complete on their own listings; agent/landlord "reschedule" becomes `reschedule_requested` (date+time+**reason required**) and only the tenant can move it to `confirmed`/`rescheduled` — enforce "tenant must explicitly accept" server-side; keep admin correction path; UI shows the history timeline from `viewing_events` | L |
| **B6** | Controlled contact disclosure after admin approval (8-step chain) | **leak today** (§5.6) | redact, then build the chain | Phase 5 as §5.6 + admin queue tab + tenant visibility notice; the 8 steps become states: request → queued → admin reviews → approved/rejected (reason) → reveal to that provider only → revoke/expire → audit | L |

### 6.4 C — Agent / landlord experience

| ID | Requirement | Current state | Gap | Plan | Complexity |
|---|---|---|---|---|---|
| **C1** | Agents and landlords independent; no landlord info/permission/ownership/legal-authority for agent listings | agent submission **blocked** without a landlord reference (`api.php:1593`), form + 38 library references | remove the requirement, keep verification + approval | §5.7 | L |
| **C2** | Never expose provider contact publicly (APIs, HTML, metadata, search results, share previews, embedded cards) | public property shape exposes `landlordName`, `landlordCompany`, `submittedByUserId`, `submittedByRole`, `landlordAuthorityState` (`repository.php:29-60`); the property CTA uses the **company** WhatsApp number (fine); no agent phone/email in any public JSON today | remove/redact the residual fields; prove it with a scanner | Return `landlordName`/`landlordCompany`/`submittedByUserId` only to staff/owner; keep `landlordId` as-is (already gated); add a **privacy test** that walks every public endpoint + server-rendered page and fails on any `phone|email|whatsapp|contact` value that is not the company's own; include `/api/properties`, `/api/properties/:id`, `/property/…` HTML, `/blog/…` HTML, sitemap, share cards | M |
| **C3** | Direct device image uploads (multi, preview, remove, replace, validate, correct association, keep link support) | `ListPropertyView` does all of it (`:87-142`, `:440` remove; `/api/uploads` validation is server-side) — but `AgentListingForm` still has a **single URL text field** (`:235`) | two listing forms, one crippled | Converge: agent dashboard uses the same upload widget (extract it to `src/components/PropertyImagePicker.tsx` reused by `ListPropertyView` and `AgentListingForm`); association stays `properties.images` (URL list) so link support is preserved; tests for multi/partial-failure/remove/replace | M |
| **C4** | Property video embeds — YouTube/TikTok/Facebook only, validated | **none** for listings (blog has YouTube only) | new field + validator + player | Add `video_provider` + `video_url` (nullable); server-side allowlist parsing to canonical embed URLs (`youtube-nocookie` embed, TikTok `player/v1`, Facebook `plugins/video.php`); reject everything else, never render raw HTML; listing form field with preview thumbnail; CSP-friendly iframe attributes; tests per provider + rejection matrix | M |
| **C5** | Amenities + structured specs with backward compatibility | `amenities` and `nearby_places` are free-text LONGTEXT; `PROPERTY_TYPES = Apartment, Luxury Villa, Townhouse, Studio, Duplex, Penthouse, Commercial`; no toilets/kitchens/furnishing columns | canonical amenity keys, extra specs, type additions | Add `toilets`, `kitchens`, `furnishing` (nullable ints/string); extend `PROPERTY_TYPES` with `Flat`, `Detached`, `Semi-detached` (+ keep legacy values valid); store amenities as a JSON array of canonical keys with a migration that **maps** known free-text values and leaves unknown text in a `amenities_note` so nothing is lost; public filters read the canonical keys; tests: legacy listing renders unchanged, old values still searchable | L |
| **C6** | Provider-set viewing fees/conditions/terms/commission expectations, distinct from platform fees | `properties.viewing_fee_ghs`, `viewing_terms_json`, `viewing_terms_state`, `ViewingTermsFields`, `AgentViewingTermsPanel`, admin approval of changes (`property_viewing_fee_changes`) all exist; platform fee lives in `platform_settings`/`fee_policies` | commission *expectation* has no field | Add `provider_commission_percent`/`provider_commission_note` (nullable) to `properties`, displayed as "Provider's expectation — not a platform fee", never used in calculations; UI copy test asserting the distinction appears next to both numbers | M |
| **C7** | Property-interest notifications (favourite, price alert) to the responsible agent/landlord without exposing tenant contacts | `saved_properties`, `price_drop_alerts`, `alert_deliveries`, `notifications` exist; `alerts.php` emails the **saved-search owner**, not the provider | provider never notified; and a naive implementation would leak the tenant | New notification path: on save/price-drop, notify the listing's responsible account (agent, else landlord) with property + count, no tenant identity; dedupe (max 1/day per property per provider); in-app + queued email; tests that no tenant field appears in the provider payload | M |
| **C8** | Transactional emails on real events only: registration, verification success, verification needing attention, viewing requests, property approval, property rejection, price alerts | 14 template targets incl. `registration`, `viewing_requested`, `viewing_update`, `property_approval`, `property_rejection`, `price_drop_alert`; outbox with retries | verification success / needs-attention targets missing; reasons may not be included | Add `verification_approved` and `verification_attention` targets (both schema-free: the target list is a function), include the reviewer's note where present, and audit-scan that no email is sent from a non-event path; test each event once | M |

### 6.5 D and E

| ID | Requirement | Current state | Gap | Plan | Complexity |
|---|---|---|---|---|---|
| **D1** | Max three pending rental requests; fourth blocked server-side; unblocked when one leaves pending; distinct from viewing requests | no cap anywhere in `handle_create_tenant_request` (`api.php:2560-2648`); request and viewing are already separate tables/flows | the rule | Count `tenant_requests` with `tenant_id = session user` and status in the pending set inside the same transaction as the insert (SQLite `BEGIN IMMEDIATE`, MySQL row lock) → 409 "You already have three rental requests in progress."; define the pending set explicitly (`submitted`, `searching`, `pending`); the counter is reset automatically when a request moves on; tests: 3 succeed, 4th 409, after moving one to `matched` a new one succeeds, concurrency test (two parallel creates cannot exceed 3) | M |
| **E1** | Remove receipts entirely without breaking viewing/fees/commissions/audit | §5.10 | see plan | Phase 7: delete `/receipts` routes + handlers, `ReceiptsView`, nav entries (`navModel` landlord tab, `DashboardShell`), routes, `AppContext` state/callbacks, `apiService` methods, `types.RentReceipt`, `tests/create-receipt.php` + receipt assertions in `api`/`access`/`concurrency`/`migration` tests; **keep** `rent_receipts` table and rows (no destructive migration); keep `POST /admin/finance/receipts/:id/reverse` (fee ledger) with a clarifying comment; `npm` dependency check for anything only receipts used | M |
| **E2** | Registration offers tenant/agent/landlord; agent-vs-landlord chosen during verification, then fixed; remove "agent acting for a landlord" | §5.8 | provider subtype at verification + wording | §5.8 | M–L |

---

## 7. Cross-cutting designs

### 7.1 Permission model (single source of truth)

Today: seven boolean flags; four CLI grant scripts; `require_admin()` plus flag checks. Plan:

1. `users.is_primary_admin` — one column, CLI-assigned only (`assign_primary_admin.php --email=goodlucksonly@gmail.com --confirm`).
2. `gl_capabilities(array $user): array` in `auth.php` returns the effective map, computed as `explicit flag OR is_primary_admin`. Both `/auth/me` and every server check use it, so the UI can never disagree with enforcement.
3. New capabilities (each its own column, default 0, so they are grantable per account and **not** implied by `admin`):
   `can_manage_users`, `can_send_bulk_email`, `can_approve_contact_disclosure`, `can_view_user_activity`, `can_manage_blog` (existing admin-only behaviour, made explicit), `can_manage_email_templates`.
4. `grant_admin.php` (CLI) extended with the new flags; the primary admin also receives them explicitly so the stored state is legible.
5. Tests: capability matrix per role; primary admin can do everything; a second admin still cannot self-approve or grant themselves anything over HTTP.

### 7.2 Migration discipline

- Every change is **additive**: new nullable columns, new tables, new indexes. No column drops, no rewrites of existing values.
- All DDL is written once in `php-backend/database.sql` (MySQL) **and** `php-backend/schema.sqlite.sql`, and additionally applied defensively by `migrate.php` (idempotent, dry-run by default). `tests/migration.test.mjs` proves the SQLite path.
- Value-vocabulary changes (enquiry statuses, request statuses) are **display mappings first**, with the stored value untouched; only a new status is ever written.
- `rent_receipts`, `landlord_contact_claimed`, `landlord_authority_state` stay in the schema even when unused, so no data is destroyed.

### 7.3 Sanitisation contract (A2/A5/A3 depend on it)

`blog_sanitize_html($html, ['allow_media' => bool])` and `blog_youtube_embed()` are the only HTML trust boundary. Verified behaviour **[PROBE]**: keeps `<p>`, `<a>`, `<ul>/<li>`, `<strong>/<em>`, `<aside class="gl-callout…">`, `<figure class="gl-video">`, `<div class="gl-showcase">`; canonicalises YouTube to `https://www.youtube-nocookie.com/embed/<id>`; rewrites links to `target="_blank" rel="noopener noreferrer"`; preserves bare text and newlines; drops scripts/handlers and unknown tags. Email templates pass `allow_media = false` and additionally reject links to unpublished articles (422).

Planned additions, all inside this boundary: normalise the showcase block; add the property-video providers for listings in a **separate** validator (`property_video_url()`) that never touches blog HTML; keep `<iframe>` allowed **only** from the canonicaliser.

### 7.4 Privacy contract

Three rules that must hold after Upgrade 2 and are tested as such:

1. No agent/landlord contact detail (phone, email, WhatsApp, address, account id) in any public response, server-rendered page, share card, sitemap or search result. The company's own contacts (`+233 23 769 0080`, `rentals@goodlucks.co`, `@GoodlucksHomes`) are the only ones that appear.
2. A tenant's contact detail reaches an agent/landlord **only** after an approved, unrevoked, unexpired `contact_disclosures` row, and never in an email body before that.
3. Identity documents are reachable only through `can_access_identity_documents`, only from `storage/private`, never by URL, and every read is audited.

---

## 8. Data-model change register

| # | Change | Type | Tables/files | Phase | Reversible |
|---|---|---|---|---|---|
| 1 | `users.is_primary_admin` + index | add column | `database.sql`, `schema.sqlite.sql`, `migrate.php` | 1 | yes (flag only) |
| 2 | Six new capability columns | add columns | same | 1 | yes |
| 3 | `fee_policies.self_approved`, `self_approved_at` | add columns | same | 1 | yes |
| 4 | `email_campaigns`, `email_campaign_recipients` | new tables | same | 3 | yes (empty) |
| 5 | `email_preferences` (opt-out + token) | new table | same | 3 | yes |
| 6 | `contact_disclosures` | new table | same | 5 | yes |
| 7 | `properties.latitude`, `longitude` (nullable) | add columns | same | 5 | yes |
| 8 | `area_adjacency` (admin-maintained proximity) | new table | same | 5 | yes |
| 9 | `tenant_requests` pending-count index (`tenant_id`, `status`) | index | same | 5 | yes |
| 10 | `properties.video_provider`, `video_url` | add columns | same | 6 | yes |
| 11 | `properties.toilets`, `kitchens`, `furnishing` | add columns | same | 6 | yes |
| 12 | `properties.provider_commission_percent`, `provider_commission_note` | add columns | same | 6 | yes |
| 13 | Amenity canonicalisation (JSON keys + `amenities_note` fallback) | add column + data mapping (non-destructive) | same | 6 | yes |
| 14 | `agent_profiles.provider_type` (`undecided|agent|landlord`) | add column | same | 6 | yes |
| 15 | Enquiry / request status vocabularies | **no DDL** — display mapping + new values only | `validate.php` | 2 | yes |
| 16 | `rent_receipts` | **no DDL** — feature removed, table and rows retained | – | 7 | n/a |

No migration in this plan drops a table, drops a column, or rewrites a stored value. Anything that would need to is listed in §12 as a question for you.

---

## 9. Security and privacy findings register

| # | Finding | Severity | Evidence | Fixed in |
|---|---|---|---|---|
| S1 | Tenant phone/email returned to agents/landlords before any approval | **High** | `repository.php:144-145`; `AgentViewingsPanel.tsx:160` | Phase 5 (B6) |
| S2 | Tenant phone/email embedded in the agent's viewing-request email | **High** | `api.php:2917` | Phase 5 (B6) |
| S3 | `submittedByUserId` (an account id) and `landlordName`/`landlordCompany` returned in public property JSON | Medium | `repository.php:29-60` | Phase 6 (C2) |
| S4 | No unsubscribe/preference mechanism for any bulk mail (would breach consent rules once A12 ships) | Medium (becomes High with A12) | no `unsubscribe` anywhere in `lib/` | Phase 3 (A12) |
| S5 | Upload endpoint may be defeated by an Apache trailing-slash redirect in production (A1) | Medium | §5.1 | Phase 2 |
| S6 | `execCommand`-based editor can silently drop or nest an embed; the placeholder is matched byte-exactly | Medium (content integrity) | `AdminBlogEditor.tsx:142-146`, `BlogArticleBody.tsx:41-44` | Phase 2 (A2) |
| S7 | Blog and listing-type share previews render the generic site card (no per-article metadata) | Low (messaging/SEO) | `public/.htaccess`, `index.html` | Phase 2 (A3) |
| S8 | Receipt endpoints still exist and are reachable although issuing is disabled | Low | §4 row 16 | Phase 7 (E1) |
| S9 | Two listing forms exist; the agent one accepts an image **URL string** with no validation of type/size (the endpoint validates, the form does not) | Low–Medium | `AgentListingForm.tsx:235` | Phase 6 (C3) |

No secrets, `.env` files, uploads, databases or deployment configuration are referenced by any change in this plan.

---

## 10. Phase plan

Sequencing is driven by dependency, not by the order of the requirement list. Each phase ends with its own report (completed work · technical changes · tests · outstanding issues · repository status) and stops for approval.

| Phase | Scope | Why here | Est. | Risk |
|---|---|---|---|---|
| **1** | Primary administrator authority (**§3.1/§3.2**, part of **A9**) | Everything financial depends on it; smallest possible blast radius; immediately testable | 2–3 d | Medium (permissions) |
| **2** | Admin console correctness: **A1, A2, A3, A4, A5, A6, A7, A8, A10** | All are self-contained, user-visible defects/gaps on existing endpoints | 6–8 d | Low–Medium |
| **3** | **A11** user management, **A13** profiles/activity, **A14** activity feed, **A12** bulk email | New read models first (they are reused by A12's audience picker), then the campaign layer | 9–12 d | Medium–High (A12) |
| **4** | **A9** fee policies and agent tiers (completion) | After Phase 1's authority exists; needs Phase 3's profile views for agent tiers | 3–4 d | Medium |
| **5** | Tenant experience: **B1–B6**, **D1** | B6 is the security fix and is sequenced before any provider-side work | 8–11 d | High (B6, B2) |
| **6** | Provider experience: **C1–C8**, **E2** | Depends on Phase 5's disclosure model and on the converged listing form (C1+C3 together) | 9–12 d | High (C1, C5) |
| **7** | **E1** receipts removal | Last, so no other phase touches code that is about to disappear | 1–2 d | Low |
| **8** | Full regression, docs refresh, release-readiness checklist | – | 2 d | Low |

Total: roughly **40–54 working days** of implementation plus review. Client-visible value arrives in Phase 2 (bug fixes) and Phase 3 (new admin power), which is intentional.

### 10.1 Acceptance criteria per phase (all must pass before its report is written)

**Phase 1** — as the primary admin: create policy → change an agent's sharing % → submit → **approve with the same account (200, no 422)** → activate → the applied split equals the new values; as an ordinary admin: the same flow still ends in 422; activating a new policy leaves every existing `fee_remittances`/`rental_commissions` row unchanged (byte comparison); audit rows show creator, approver, `self_approved = 1`, timestamps and old/new values.

**Phase 2** — upload a featured image through the widget (201, image visible); a post with a video **and** a showcase renders both, in both orders, on mobile and desktop; a published article's URL returns its own `<title>`/`og:*`; a draft slug 404s; the email-template editor saves a new template with a paragraph, with a link, and with plain text, and edits an existing one without losing its body; Manage listings returns correct results for every filter combination with more than 100 listings; Tenant matching, Agent accounts and Enquiries each search and filter on real server data.

**Phase 3** — every user is findable by name/email/phone; role and status filters return exactly the matching rows; a profile shows the real properties/favourites/requests/viewings for that user and no document URL; a bulk email to a 3-recipient test audience creates 3 outbox rows, each with one recipient, an unsubscribe link, deduplicated by address, with per-recipient success/failure and a working retry; no recipient sees another's address.

**Phase 4** — every policy verb works for the primary admin, tiers are visible per agent, and no historical transaction changes when a policy activates.

**Phase 5** — the move-in date cannot be submitted empty, with the message shown; a 4th pending request is refused with a clear message and unblocked when one leaves pending (including under two concurrent submits); scores respond to budget/beds/baths/type/location/proximity as documented and are explained in the UI; "Chosen for you" (≥3) is separate and first; a viewing can be proposed, accepted, rescheduled with a reason, accepted again and cancelled with a reason, with full history; **no tenant contact reaches an agent until an admin approves it** (verified in JSON and email).

**Phase 6** — an independent agent can publish a listing with no landlord information; no public page/API/share card contains a provider contact; images upload from a device on **both** listing paths; a listing accepts YouTube/TikTok/Facebook video and rejects anything else; amenities/specs render for old and new listings; provider commission expectation is visibly distinct from the platform fee; favourites/price drops notify the responsible provider with no tenant data; each C8 email fires only from its real event.

**Phase 7** — no receipt page, menu item, button, form, endpoint, type, client call or test remains; `/api/receipts` 404s; fee policies, commissions, viewing fees and the audit log all still work; `fee_remittances` reversal still works; `rent_receipts` rows still exist in the database.

### 10.2 Regression gate for every phase

`npm run build` (exit 0), `./node_modules/.bin/tsc --noEmit` (clean), PHP lint of every touched file via `php-wasm-cli -l`, and the full test suite (api, uploads, navigation, routing, content, property, sharing, blog, design, email-footer, access, responsive, concurrency, migration, finance-race) with **0 failures**, reported with the actual numbers.

---

## 11. Test strategy

| Layer | Approach | Notes |
|---|---|---|
| API behaviour | Extend `tests/api.test.mjs` and siblings against a temp SQLite DB per run (`tests/helpers.mjs`) | ~4.7 min today; new suites will be split (`admin-users`, `bulk-email`, `disclosure`, `campaigns`) and run in parallel-safe temp DBs |
| Migrations | `tests/migration.test.mjs`: fresh install, then `migrate.php` on an existing DB, then idempotent re-run | Proves "safe migration" and "existing records preserved" |
| Permissions | New `tests/capabilities.test.mjs`: role × capability matrix, primary admin, second admin self-approval refusal, no HTTP grant path | Includes a negative test that `POST`ing a capability does nothing |
| Privacy | New `tests/privacy.test.mjs`: public endpoints and server-rendered HTML scanned for contact patterns; disclosure matrix; email body scan | Fails the build if a phone/email leaks |
| Editor structure | New `tests/blog-editor.test.mjs` (jsdom): tolerant showcase split, `<br>` padding, nesting, both orders, idempotent normalisation | No browser needed |
| UI structure | Existing `responsive`, `navigation`, `routing`, `design` suites extended for new tabs, the mobile card strip and the removed receipts entries | Structural assertions only |
| Manual (you) | Upload on the live host with the Network panel; one WhatsApp share of an article; one mobile swipe through cards; one bulk-email dry run to your own address | Listed per phase, since no browser exists here |

**Honesty rule:** any test that cannot run in this sandbox (anything requiring Apache, MySQL, SMTP or a real browser) is listed as a manual step in the phase report, never reported as passed.

---

## 12. Decisions I need from you before Phase 1

1. **Branch** (§2): continue on `arena/1dbf260c-goodlucks-rep`?
2. **Legacy move-in dates**: leave the existing placeholder-dated requests untouched (recommended), or flag them in the admin matching list for re-confirmation?
3. **Proximity for B2**: admin-maintained area adjacency (recommended, no external service, no cost) or adding coordinates only, or both? Coordinates alone cannot score "nearby" without a geocoder.
4. **Bulk email (A12)**: is a per-recipient send through the existing outbox acceptable (recommended: privacy + retry + records), and should marketing mail be opt-out by default while transactional mail stays non-optional?
5. **Provider subtype at verification (E2)**: should a landlord account be able to become an agent later through an audited staff action, or is the choice absolutely final for the life of the account?
6. **Agent "owner reference" field (C1)**: after independence, do you want an **optional, staff-only, private** owner reference on agent listings (useful for dispute resolution), or no field at all?
7. **Phase order**: proceed 1 → 2 → 3 → 4 → 5 → 6 → 7 as above, or would you rather Phase 2 (visible bug fixes) come first?

I will not start Phase 1 until you answer these (or explicitly say "use your judgement on 2–7 and start Phase 1").

---

## 13. Repository status at the end of Phase 0

| Item | Value |
|---|---|
| Branch | `arena/1dbf260c-goodlucks-rep` (unchanged; created from `ad2bb0a`) |
| Latest commit on `main` | `ad2bb0a` — "Merge pull request #18 …" (untouched by this phase) |
| Files changed by this phase | **This document only** |
| Feature code written | **None** |
| Database migrated | **No** (no production database touched) |
| Deployed | **No** |
| Test suite run this phase | Not re-run (no code changed); baseline in §1.3 stands |
| Artefacts outside the repo | `/tmp/audit-probe*.mjs`, throwaway SQLite DBs under `.data/` (git-ignored) |

**Phase 0 is complete.** No implementation will begin until you approve a phase.

---

## Appendix A — Probe script inventory

| Script | Purpose | Notable output |
|---|---|---|
| `/tmp/audit-probe.mjs` | Bootstrap admin on a temp SQLite DB; login; upload PNG; list blog posts/templates; create fee policy without capability; probe the four "missing" admin endpoints | §4 rows 1–5, 11–16 |
| `/tmp/audit-probe2.mjs` | Grant finance capabilities via `grant_finance.php`; full policy lifecycle incl. self-approval; email-template create/patch with three body shapes; `/auth/me` capability map | §4 rows 6–10, 17 |
| `/tmp/audit-probe3.mjs` | Blog embeds: video only, showcase only, both orders, figure variant; publish; fetch public post; card attachment | §4 rows 18–21 |
| inline `.data/sanitize-probe-*.php` (run via `runPhpScript`, then deleted) | `blog_sanitize_html(..., allow_media=false)` output inspection | §4 row 22, §7.3 |

All databases written under `.data/`, which is git-ignored; nothing was written into the repository tree.

## Appendix B — file:line index for the findings

| Finding | Location |
|---|---|
| Upload client | `src/services/apiService.ts:538-542` |
| 404 message surfaced verbatim | `src/services/apiService.ts:126-141` |
| Production API rewrites | `php-backend/.htaccess` (rules 1–4), `public/.htaccess` (rules 2c/2d/4) |
| Blog editor insertion | `src/components/AdminBlogEditor.tsx:142-146, 179-200, 202-215` |
| Showcase matching | `src/components/BlogArticleBody.tsx:40-44` |
| Showcase placeholder | `php-backend/lib/blog_content.php` (`blog_showcase_placeholder`), `blog_allowed_class()` |
| Article head metadata | `index.html:7-52`; `php-backend/property_page.php`; `php-backend/lib/property_serve.php` |
| Email template body bug | `src/components/AdminEmailTemplates.tsx:99-102, 309-316` |
| Template sanitising | `php-backend/lib/email_templates.php` (`email_template_clean_body`) |
| Move-in default | `src/components/FindAHomeView.tsx:150`; requirement at `php-backend/lib/api.php:2595-2598` |
| Tenant contact in viewings | `php-backend/lib/repository.php:144-147`; `api.php:2917`; `AgentViewingsPanel.tsx:160` |
| Agent landlord-reference block | `php-backend/lib/api.php:1578-1600`; `AgentListingForm.tsx:61, 266` |
| Fee-policy self-approval guard | `php-backend/lib/fee_policies.php:856-890` |
| Fee-policy capabilities | `php-backend/lib/fee_policies.php:147-190`; `php-backend/grant_finance.php` |
| Match scoring | `php-backend/lib/api.php:4435-4471, 4486-4560` |
| Viewing lifecycle + matrix | `php-backend/lib/viewings.php:40-160, 172-263, 596-660` |
| Property query filters | `php-backend/lib/repository.php:546-650`; `api.php:2254-2274` |
| Enquiry statuses | `php-backend/lib/validate.php:15`; `api.php:2434-2437` |
| Registration roles | `php-backend/lib/api.php:341-367`; `src/components/AuthModal.tsx:139-213` |
| Receipt surfaces | `api.php:168-170, 212`; `src/components/ReceiptsView.tsx`; `src/context/AppContext.tsx`; `src/navigation/navModel.ts:47, 65, 259`; `src/routing/routes.ts:42, 118, 129, 207, 522, 573-574, 656-657`; `src/services/apiService.ts:678-684, 800-802`; `tests/create-receipt.php` |
| Fee-ledger reversal (keep) | `php-backend/lib/finance_api.php:157+`; `php-backend/lib/finance.php:1985-2080` |
