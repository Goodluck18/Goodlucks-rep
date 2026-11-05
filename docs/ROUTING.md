# URL routing and navigation

**Scope:** Task 01 — website-wide URL routing and navigation correction.
This document is the reference for how the address bar, the pages and the
role permissions fit together. It replaces nothing else in the repo; the
business logic (dashboards, receipts, verification, finance) is unchanged.

---

## 1. The rule

> The browser URL is the only source of truth for which page is open.

Nothing in the app keeps a second copy of "where am I". `AppContext` parses the
URL into a `RouteState` and re-parses it on `popstate` / `hashchange`. Every
navigation control — navbar, mobile bottom bar, hamburger menu, dashboard tabs,
property cards, login/logout, admin console, in-page cross-links — calls the one
`navigate()` function, which writes the URL and updates the rendered page
together. Refresh, Back, Forward, bookmarks and shared links therefore all work,
and two competing navigators cannot disagree.

| Concern | Before | Now |
| --- | --- | --- |
| Current page | `useState('home')` | derived from `window.location` |
| Changing page | `setCurrentView('browse')` | `navigate('/properties')` |
| Refresh | returned to the homepage | returns to the same page |
| Back / Forward | partial (property + admin only) | every route |
| Shared link | only property links | every route, including tabs and filters |
| Tabs | component state | URL section (`/tenant/viewings`) |
| Filters | component state | query string (`/properties?type=Apartment`) |

`setCurrentView('browse')` still exists as a **compatibility shim** in
`AppContext`: it maps the old view name to a real route via
`pathForView()` and delegates to `navigate()`. It is not a second router — it has
no state and cannot disagree with the URL. New code should call
`navigate('/path')`.

No routing library was added: the project has no `react-router-dom`, the app is a
single-page customer site with a small, explicit page set, and a 200-line typed
route table (`src/routing/routes.ts`) gives exact control over the role guards
that a generic router would still have to be taught.

---

## 2. Files

| File | Role |
| --- | --- |
| `src/routing/routes.ts` | The route table: parse URL → route, build URL ← route, role guards, legacy-link redirects, view-name mapping. Pure functions, no React, no DOM. |
| `src/context/AppContext.tsx` | Owns `route`, implements `navigate()`, listens to `popstate`/`hashchange`, applies guards, sends people to the right place after login/logout. |
| `src/App.tsx` | Renders the component for `route.name`; hosts the auth modal on `/login` and `/register`; renders `NotFoundView` for unknown URLs. |
| `src/components/NotFoundView.tsx` | The not-found page. |
| `src/components/Navbar.tsx`, `MobileBottomNav.tsx` | Every control navigates to a real path. |
| `src/components/{Tenant,Landlord,Admin}Dashboard.tsx` | Their tab state is read from the URL (`sectionTab`) and written back with `setSectionTab()`. |
| `src/components/AgentDashboard.tsx` | Single-page workspace; the URL section scrolls to the matching panel. |
| `src/components/BrowseView.tsx` | Search filters live in the query string. |
| `public/.htaccess` | Serves `index.html` for every unknown path so direct links and refreshes reach the app. |
| `tests/routing.test.mts` | 35 unit tests for the route table and guards. |
| `tests/app-navigation.test.mts` | 22 DOM tests that render the real app and drive it (refresh, Back/Forward, guards, tabs, filters). |

---

## 3. Routes

### Public

| Path | Page |
| --- | --- |
| `/` | Home |
| `/properties` | Browse listings (filters in the query string) |
| `/find-a-home` | "Find a home for me" request form |
| `/property/:id` | Listing detail |
| `/list-property` | Property submission |
| `/about`, `/contact` | Informational pages |
| `/receipts` | Rent receipt lookup |
| `/login`, `/register` | Sign-in / registration (the existing modal, on its own URL) |
| `/reset-password?token=…` | Set a new password from an emailed link |
| `/admin-login` | Staff sign-in |

### Tenant — `/tenant/…`

`dashboard` (rental requests) · `matches` · `viewings` · `saved-properties` ·
`search-alerts` · `profile` · `notifications` (the workspace's Activity Feed)

Accepted aliases (`/tenant/rental-requests`, `/tenant/saved`, `/tenant/alerts`)
resolve to the same tab; each tab has exactly one canonical URL, which is what
tab clicks produce.

### Landlord — `/landlord/…`

`dashboard` · `properties` · `viewings` · `profile` · `verification` ·
`notifications`

### Agent — `/agent/…`

`dashboard` · `profile` · `properties` · `viewings` · `finance` ·
`verification` · `notifications`

The agent workspace is one scrolling page, so these URLs select the matching
panel rather than swapping the layout.

### Admin — `/admin/…`

`analytics` (also `/admin`) · `approval-queue` · `manage` · `matching` ·
`viewings` · `enquiries` · `email-logs` · `agents` · `fee-policies` · `finance`

### Pages that deliberately have **no** route

| Requested example | Why it has no route |
| --- | --- |
| `/blog`, `/blog/:slug` | No blog exists in this codebase. Adding a route would mean inventing a page. |
| `/forgot-password` | The reset request is a panel inside the sign-in modal, not a page. The URL stays `/login`. |
| `/verify-account` | There is no self-service account verification screen; identity/professional verification is `/landlord/verification` and `/agent/verification`. |
| `/tenant/rental-requests/:id` etc. | The dashboards have no per-record detail pages; records are shown in the tab. |
| `/landlord/submit-property` | Property submission is one page for everybody at `/list-property`; a second URL for the same screen was not added. |

Unknown paths render `NotFoundView` (`/no-such-page`), they are not redirected to
the homepage — that would hide broken links instead of surfacing them.

---

## 4. Authentication and permissions

`accessDecision(route, role)` returns one of:

| Decision | When | What happens |
| --- | --- | --- |
| `allow` | public page, or the page belongs to this role | render |
| `login` | guest on a protected page | `→ /login?next=<path>` |
| `forbidden` | signed in, but the page belongs to another role | message + `→` their own dashboard |
| `redirect` | bare role root (`/tenant`), signed-in user on `/login`/`/register`, admin on `/admin-login` | `→` the canonical page |

* Roles are **not** additive: a landlord cannot open `/tenant/…` or `/admin`, an
  agent cannot open `/admin`, and so on (tests cover every role × every area).
* `?next=` is honoured only when the freshly authenticated role may actually open
  that path (`isSafeRedirect`): no external URLs, no `//host`, no
  `javascript:`, no backtrack to the auth screens, no cross-role jump.
* The guard runs **after** session restoration, so a refresh never logs anybody
  out and never changes their role.
* The guard only decides which screen to show. Every permission is still
  enforced by the PHP API, which trusts the session — never a value from the
  page — so hiding or revealing a route is a usability decision, not a security
  boundary.
* `/admin` and its sections are also excluded from the page-view analytics call
  server-side (`handle_track_pageview`).

---

## 5. Search filters

`/properties` reflects the filters that already existed — no new ones:

| Query key | Filter |
| --- | --- |
| `q` | keyword |
| `location` | area (`All` when absent) |
| `type` | property type (`Apartment`, `Luxury Villa`, …) |
| `bedrooms` | number of bedrooms (`All` when absent) |
| `maxRent` | maximum rent in GHS (default ceiling 25,000) |

Defaults are omitted so `/properties` stays clean; filter changes use
`history.replaceState` (so a slider drag does not fill the Back stack) and no
page-view is recorded for a filter tweak. There is no sorting or pagination in
this catalogue, so none was invented. The URL never carries credentials, tokens
or session material.

---

## 6. Backwards compatibility

Old links keep working — they are rewritten to the canonical URL with
`replaceState` (no extra history entry):

| Old URL | New URL |
| --- | --- |
| `/?property=<id>` | `/property/<id>` |
| `/?p=<id>` | `/property/<id>` |
| `/#/property/<id>` | `/property/<id>` |
| `/?reset=<token>` | `/reset-password?token=<token>` |
| `/Properties` (any mixed case) | `/properties` |

Alert emails now link to `/property/<id>` directly, and `sitemap.xml` lists the
real routes (`/properties`, `/find-a-home`, `/list-property`, `/about`,
`/contact`, `/property/<id>`) instead of `/browse` and `/find-home`, which the
site never served.

---

## 7. Server

`public/.htaccess` already had the correct order and was not rewritten:

1. `/api/…` → the PHP front controller (never rewritten to the SPA),
2. `/sitemap.xml` → `api/index.php`,
3. real files and directories (JS, CSS, images, uploads) → served as-is,
4. everything else → `index.html`, where the router takes over.

`server.ts` (dev/preview) and Vite (`appType: 'spa'`) do the same. The document
is always served with HTTP 200 for a client-side route, which is how single-page
applications behave; the not-found **page** is rendered by the app, not by
Apache. Returning a per-route 404 status would require server-side rendering,
which is out of scope for this task.

---

## 8. Tests

```
npm run test:routing      # 35 unit tests: parse, build, guards, legacy links
npm run test:navigation   # 22 DOM tests: real app, real clicks, real history
npm run lint              # tsc --noEmit
npm run build             # production build
npm run test:api          # PHP API / migration / concurrency suite
```

`test:navigation` uses `happy-dom` (a dev-only dependency) to mount the real
`App`, stub `/api/auth/me` and `/api/properties`, and assert the address bar
after real clicks. It is not a browser: no CSS, no layout, no Apache. Browser
checks that remain manual are listed in the task report.
