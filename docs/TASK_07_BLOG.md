# Task 07 — Blog & Learning Centre

Status: implemented on `arena/17903d01-goodlucks-rep`, based on `main` @ `c68ca0e`
(the Task 05 merge). Additive only: no existing table, route, page, dashboard
section, email or design token was replaced.

The brief's scope: a Blog & Learning Centre **inside** the existing website, with
administrator content management in the existing admin console, live property
cards that read real listings, SEO, and an "Insert Blog Post" option in the email
template area — plus tests for all of it.

---

## 1. Existing infrastructure reused

| Area | What already existed | What Task 07 does with it |
| --- | --- | --- |
| Routing | `src/routing/routes.ts` parses the URL into a route; `App.tsx` renders a view per route. No React Router. | Two new route names (`blog`, `blog-post`) and two views, added to the same parser and the same `switch`. |
| Navigation | `src/navigation/navModel.ts`, `Navbar`, `Footer`. | One guest entry ("Learning Centre") and one footer link. Member menus are deliberately unchanged (see §6). |
| Admin console | `AdminDashboard.tsx` with `activeAdminTab` and a tab strip. | Two more tabs: **Blog Management** and **Email Templates**. |
| Design system | `#1F242D` / `#252A34` / `#08D9D6` on white-on-dark, `index.css` utilities. | The same palette and the same card/badge/button shapes. No colour change, no redesign. |
| API | `php-backend/lib/api.php` route table, `json_response`/`error_response`, `require_admin`, `validate.php`, `audit_log`. | New handlers in `lib/blog_api.php` registered in the same table; the same helpers. |
| Data layer | `db_all`/`db_one`/`db_exec`/`db_value`, `db_transaction`, MySQL + SQLite drivers. | Used unchanged; the new SQL is written for both. |
| Uploads | `POST /api/uploads` (MIME sniffing, extension, size limits, random names) + `/api/uploads/<file>`. | The blog editor calls the same endpoint; no second upload path. |
| Email | `lib/mailer.php` queues every message in `email_outbox`, logs it in `email_logs`, and sends via the configured transport. | A template's content is **appended** to an email that is still composed and delivered by the existing code. |
| Sitemap | `/api/sitemap.xml` built in `lib/api.php`. | Published articles are appended; the index page is always there. |
| Migrations | `php-backend/migrate.php` + `database.sql` + `schema.sqlite.sql`. | Four additive tables, no column changes to anything existing. |
| Tests | `tests/*.test.mjs|mts`, `scripts/php.mjs` (PHP-WASM), `tests/helpers.mjs`. | New suites reuse the same harness. |

There was **no existing email template editor** — the only email mechanism was the
transactional code in `lib/mailer.php`. Task 07 therefore adds a small, additive
template layer that appends administrator-written content to those same emails. It
does not introduce a second delivery path, a second queue, or a second log.

---

## 2. New functionality

### 2.1 Public pages

* `GET /blog` → `BlogView` — intro, featured article(s), latest articles, category
  filter bar (with counts), search, pagination. Filters live in the URL
  (`/blog?category=tenant-guides&page=2&q=viewing`), so a filtered view is
  shareable and survives a reload.
* `GET /blog/<slug>` → `BlogPostView` — title, subtitle, featured image, author,
  published date, "updated" date (only when the article was edited after
  publication), body, live property cards, related articles, internal next-step
  links, and sharing buttons (copy link, WhatsApp, X, Facebook, email).
* Anything that is not published returns `404` from the API and the page says
  "This article is not available" — it does not redirect home and does not
  disclose whether the slug exists.

### 2.2 Admin console

**Blog Management** (`/admin/blog`)

* Counts row (all / published / scheduled / draft / unpublished) as clickable
  filters, search, status filter, and a table: title (opens the editor), slug,
  status badge, category, published or scheduled date, last updated, edit and
  preview.
* Inline category manager: list with usage counts, create, delete (refused while
  an article uses it), all without a code change.
* "New article" creates a **draft**; publishing is a separate, explicit action.

**Article editor**

* Fields: title, subtitle/intro, editable slug (with a keep-or-change choice),
  featured image + alt text, body, category, tags, author (**the signed-in
  administrator's account**, never an invented name), status, publication date,
  SEO title, SEO description, featured flag, and read-only created/updated dates.
* Rich text via `contentEditable` + `document.execCommand` (no new dependency):
  H2/H3, paragraph, bold, italic, ordered and unordered lists, blockquote, inline
  link, inline image (uploaded through `/api/uploads`), YouTube embed, callout
  block, and the `gl-showcase` placeholder that marks where the property cards go.
* Live preview using the same `BlogArticleBody` component the public page uses.
* Status actions: **Publish**, **Unpublish**, **Schedule** (date + time),
  **Delete** (with confirmation). Autosave is deliberately absent; the article is
  saved when the administrator presses Save.
* Property picker: search the live catalogue, add a listing, choose the display
  rule (`show_status` or `hide_unavailable`), add a short note, reorder, remove.

**Email Templates**

* List of templates (name, target email, active/inactive, checks) and an editor
  (name, target email, body with bold/italic/list/link helpers).
* **Insert Blog Post** opens a picker fed only by published articles, inserts the
  permanent public URL, and lets the administrator set the link text/CTA.
* "Check article links" reports any link whose article is no longer published.
* Saves through the existing API conventions and appends to existing emails.

### 2.3 Publishing rules

| Status | Public API | `/blog/<slug>` | Sitemap | Email picker |
| --- | --- | --- | --- | --- |
| `draft` | no | 404 | no | no |
| `scheduled` (future) | no | 404 | no | no |
| `scheduled` (due) | yes, after promotion | 200 | yes | yes |
| `published` | yes | 200 | yes | yes |
| `unpublished` | no | 404 | removed | no (and templates are flagged) |

A due `scheduled` article is promoted to `published` on the next read of the blog
(a small `UPDATE … WHERE status='scheduled' AND publish_at <= now`), and also by
`cron.php` if cron is configured. `published_at` records when it actually went
live, not the schedule time.

### 2.4 Property showcase

* The article stores **references only**: `blog_post_properties(post_id,
  property_id, sort_order, display_rule, note)`. No title, rent, photo or status
  is copied, so a card can never drift from the listing.
* Every read joins the live `properties` row: title, location, city, type,
  bedrooms, bathrooms, rent, first image, availability.
* `show_status` (default): an unavailable listing stays on the page with
  "No longer available", no rent, no link. `hide_unavailable`: it disappears.
* Only `active` listings link to `/property/:id`. A soft-deleted listing has no
  page to open, so the card stops linking.
* A purged listing leaves the public article entirely; the console still shows the
  dead reference (`missing: true`) so an editor can remove it.
* Cards expose only public fields — never the moderation status string, landlord
  contact state, or any other admin-only value.
* Order is whatever the administrator chose; duplicates are collapsed.

### 2.5 Content safety

`lib/blog_content.php` is a server-side sanitiser for the article body:

* allowlist of tags (headings, paragraphs, emphasis, lists, links, images,
  blockquote, `hr`, `code`/`pre`, `aside.gl-callout`, `div.gl-showcase`, tables are
  not allowed) and a per-tag attribute allowlist;
* `script`, `style`, `embed`, `object` and friends are removed **with their
  content**, not just their tags;
* every `on*` handler and `javascript:`/`data:` URL is dropped;
* `<iframe>` is only accepted for a YouTube video id, rewritten to
  `https://www.youtube-nocookie.com/embed/<id>` with `loading="lazy"`,
  `allowfullscreen` and no other attributes — arbitrary iframes never survive;
* YouTube URL forms recognised: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/
  embed/`, `youtube.com/shorts/`, `m./music.` hosts, with extra query parameters
  discarded;
* internal links (`/blog/...`, `/properties`, `/property/...`) are kept as written
  and are handled by the SPA router so they do not cause a full reload.

Uploads keep the existing `/api/uploads` validation (real image content sniffed
from bytes, MIME + extension agreement, size limit, random filename). SVG is not
accepted.

### 2.6 SEO

* Clean URLs: `/blog` and `/blog/<slug>` (lowercase `[a-z0-9-]`), one address per
  article; a trailing slash resolves to the same route.
* `SEOHead` receives a per-article title (SEO title if set, otherwise the
  article title), the SEO description, the canonical absolute URL, Open Graph
  (`og:type=article`, image = featured image), Twitter card, and JSON-LD:
  `Article` (headline, description, image, dates, author, publisher) and
  `BreadcrumbList` (Home → Learning Centre → article).
* Sitemap: `/blog` always, each published article with its `lastmod`; drafts,
  scheduled and unpublished articles are absent.
* Heading hierarchy: the page has one `h1` (article title); the body starts at
  `h2`. Featured images require alt text (the editor prompts for it, and the
  server stores what was entered, defaulting the display alt to the title).
* This makes the articles *indexable and correctly described*. It does not and
  cannot promise a ranking.

---

## 3. Database changes

Four new tables. Nothing existing was dropped, renamed or rewritten.

```sql
blog_categories (id, name, slug UNIQUE, description, sort_order,
                 created_by, created_at, updated_at)

blog_posts (id, title, subtitle, slug UNIQUE, featured_image, featured_image_alt,
            content_html LONGTEXT, category_id, tags, tags_search,
            author_user_id, author_name,
            status ENUM/VARCHAR(draft|scheduled|published|unpublished),
            publish_at, published_at, seo_title, seo_description, is_featured,
            created_at, updated_at)

blog_post_properties (id, post_id, property_id, sort_order,
                      display_rule(show_status|hide_unavailable), note,
                      created_at, UNIQUE(post_id, property_id))

email_templates (id, name, target_type, body_html LONGTEXT,
                 status(active|inactive), created_by, updated_by,
                 created_at, updated_at)
```

Indexes: `idx_blog_post_status`, `idx_blog_post_category`, `idx_blog_post_featured`,
`idx_blog_post_author`, `uniq_blog_post_property`,
`idx_blog_post_property_order`, `idx_blog_post_property_property`,
`idx_email_template_type`, `idx_email_template_status`.

Both dialects are defined: `php-backend/database.sql` (MySQL) and
`php-backend/schema.sqlite.sql` (SQLite). `migrate.php` lists all four in
`$requiredTables`, so an existing installation gains them on
`php migrate.php --apply`. The relationship table stores ids only and has no
copied listing data.

---

## 4. API

Public:

* `GET /api/blog` — published only; `?category=`, `?tag=`, `?q=`, `?page=`, `?perPage=`
* `GET /api/blog/categories` — categories with at least one published article
* `GET /api/blog/<slug>` — one published article with live cards and related posts
* `GET /api/sitemap.xml` — now includes the Learning Centre and published articles

Administrator only:

* `GET|POST /api/admin/blog/posts`
* `GET|PATCH|DELETE /api/admin/blog/posts/<id>` (delete needs `?confirm=1`)
* `POST /api/admin/blog/posts/<id>/status` — publish / unpublish / schedule / draft
* `POST /api/admin/blog/posts/<id>/properties` — replace the ordered card list
* `GET /api/admin/blog/properties?q=` — live listing search for the picker
* `GET /api/admin/blog/published-for-links?q=` — published articles only
* `GET|POST /api/admin/blog/categories`, `PATCH|DELETE /api/admin/blog/categories/<id>`
* `GET|POST /api/admin/email-templates`, `PATCH|DELETE /api/admin/email-templates/<id>`
* `POST /api/admin/email-templates/check-links`

Every admin route runs through `require_admin()`; a guest gets `401`, a signed-in
tenant, landlord or agent gets `403`. Article and category writes are validated
server-side (lengths, slug shape, category existence, property existence, status
transitions, schedule in the future, non-empty content before publishing) and
logged with `audit_log`. Multi-row card replacement runs inside a transaction.

---

## 5. Files

Created:

* `php-backend/lib/blog_content.php` — sanitiser + YouTube normalisation
* `php-backend/lib/blog.php` — data layer, publishing rules, live cards, slugs
* `php-backend/lib/blog_api.php` — HTTP handlers
* `php-backend/lib/email_templates.php` — template storage, link checking, append
* `src/components/BlogView.tsx`, `BlogPostView.tsx`, `BlogPostCard.tsx`,
  `BlogPropertyCard.tsx`, `BlogArticleBody.tsx`, `blogShared.tsx`
* `src/config/site.ts` — the canonical origin used for absolute URLs
* `src/components/AdminBlogPanel.tsx`, `AdminBlogEditor.tsx`, `AdminEmailTemplates.tsx`
* `tests/blog.test.mjs`, `tests/blog-fixtures.php`
* `docs/TASK_07_BLOG.md` (this file)

Modified:

* `php-backend/config.php` (requires), `lib/api.php` (routes + sitemap),
  `lib/mailer.php` (appends template content), `cron.php` (scheduled promotion),
  `migrate.php` (`$requiredTables`), `database.sql`, `schema.sqlite.sql`
* `src/App.tsx` (two lazy views + two cases), `src/routing/routes.ts`,
  `src/navigation/navModel.ts`, `src/components/Footer.tsx`,
  `src/components/AdminDashboard.tsx`, `src/index.css` (`.gl-article` typography),
  `src/services/apiService.ts`, `src/types.ts`
* `tests/app-navigation.test.mts` (guest menu expectation, new DOM tests),
  `tests/routing.test.mts` (new URL tests), `tests/migration.test.mjs` (new tables)
* `package.json` (`test:blog`), `.github/workflows/ci.yml` (runs it)

No existing test was weakened. One expectation *changed on purpose*: the guest
account menu now lists **Learning Centre** between Receipts and About, because the
menu is the public site's own navigation. The assertion was updated to the new
exact row list rather than loosened.

---

## 6. Decisions and limitations

**Navigation.** Guests get "Learning Centre" in the desktop row (after About) and
in the menu (after Receipts). Members do **not** get a new menu row: their menus
are asserted row-by-row as the account area, and inserting a public link in them
broke the "member menus lead into my account" rule. Members reach the Learning
Centre through the footer link, which is on every page for every role, and by URL.

**Editor formatting** uses `document.execCommand`. It is deprecated but universal,
needs no dependency, and the output is normalised by the server sanitiser anyway.
A future editor can be swapped in without touching the storage format.

**Email templates are appended, not substituted.** A template adds a bordered block
before `</body>` of an existing email. The transactional content is never editable
from the console. If a template links to an article that is no longer published,
the block is skipped and a warning is logged — the email still goes out, without
the dead link. Saving such a link is refused with `422`.

**Not verified in this environment**

* **MySQL was not executed.** There is no MySQL server in this sandbox. The MySQL
  DDL and the migration entry are reviewed and statically tested, but only the
  SQLite path was run end to end. Run `php php-backend/migrate.php --apply` and
  then the blog suite against MySQL before launch.
* **No browser was used.** The PHP API was exercised over HTTP and the React app
  was rendered in happy-dom (no CSS, no layout, no real click geometry). The rich
  text toolbar itself cannot be exercised there (`execCommand` is not
  implemented), so formatting is verified by what the server stores and serves.
* **No email was delivered.** There is no `mail`/`imap` in this environment;
  every message is queued with `delivered: false`. The outbox was inspected
  directly to prove the template block and its absence.
* **Cron was not scheduled.** The scheduled-publication test moves the publication
  time into the past and reads the article, which is the same promotion code cron
  calls. Confirm the cron entry exists on the server.
* Images, uploads and the dev SQLite database are not committed.

**Outstanding, deliberately not in this task**

* Search-engine submission, analytics and ranking — structural SEO only.
* Article revision history and multi-author roles: the author is the admin account
  that created the article.
* The showcase placeholder appears once per article; more than one showcase block
  would need a second placeholder syntax.
* Task 08 (the visual refresh) was not started; no colour or layout token changed.

---

## 7. Tests

```
npm run lint            # tsc --noEmit              → clean
npm run test:routing    # URL parsing + role guards → 47 pass, 0 fail
npm run test:navigation # real app in happy-dom     → 53 pass, 0 fail
npm run test:content    # wording rules             →  4 pass, 0 fail
npm run test:api        # existing + Task 03/07 DB   → 266 pass, 0 fail
npm run test:blog       # Task 07                   → 35 pass, 0 fail
npm run build           # production bundle          → OK
```

`test:blog` covers, in order: public index/profile of an empty site; guest/tenant/
landlord refusal on every admin route; draft creation with a real author; draft
404 + absent from index and sitemap; edits preserve content; publish → public +
sitemap + canonical; empty article cannot be published; schedule → private, then
public when due (and `published_at` recorded); schedule in the past refused;
unpublish withdraws immediately and leaves the sitemap; delete needs confirmation;
sanitiser (scripts, handlers, `javascript:`, style, external iframe); YouTube
canonical no-cookie embed; showcase placeholder; callout kept / spoof div removed;
live cards with public fields only; price change reflected; rented shown per rule;
soft-deleted listing shown as unavailable and unlinked; purged listing removed from
the public page but flagged in the console; reorder and de-duplicate; unknown
property id refused; category create/edit/duplicate/delete-in-use and public
counts; the six requested categories; published-only email picker; template saved
and its block present in the real queued email; draft link refused; article
unpublished later → template flagged and block skipped; existing email logs still
intact; console counts and filters; draft readable in the console.

`tests/migration.test.mjs` gained five tests: an older database without the four
tables gains them (with indexes), nothing existing is dropped, a rebuild is a
no-op, the relationship table copies no listing fields, and the MySQL plan lists
the same tables.
