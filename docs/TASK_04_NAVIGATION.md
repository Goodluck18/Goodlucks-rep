# Task 04 — One navigation per surface

Status: implemented on `arena/5048b032-goodlucks-rep`, based on `main` @ `708d914`
(Task 03 landlord-policy update). No backend, database or route changes.

The brief: *every action has one clear entry point; no destination repeated across
navigation areas without a reason; simple, useful mobile navigation; the
hamburger is secondary/account navigation; the bottom bar is quick access to the
most important sections; each role sees only its own items; Dashboard, Profile
and Settings stay separate.*

---

## 1. The duplication that was there

| Surface | Before |
| --- | --- |
| `Navbar` desktop row | Seven hand-written links for a guest, seven different ones for a tenant, four for an agent, seven for a landlord, one for an admin — written out inline, per role. |
| `Navbar` mobile drawer | A **second**, hand-written list per role, and it had drifted from the desktop row: landlords lost Viewings/Receipts/Verification/Notifications/Settings, tenants lost Rental requests/Matches/Saved/Search alerts/Settings, agents lost Properties/Finance/Verification/Status/Profile/Settings, and an admin got only "Admin Dashboard" + "Logout Admin". |
| Auth entry points | A guest had **three**: the desktop `Login` button, the mobile header `Login` pill and the drawer's `Login` row (plus `Register` in two places). |
| `Navbar` | Also computed `dashboardPath` / `profilePath` / `notificationsPath` itself. |
| `MobileBottomNav` | Computed the same three paths again, showed Home/Browse/role-third/Dashboard/Profile, had **no** notifications tab, and drew the **unread dot on the Profile icon** — so the button looked like notifications and opened the profile. `Settings` had no global entry point at all. |
| `MobileBottomNav` + drawer | Repeated Home / Browse / Find a Home (guests) and Home / Browse / Dashboard (members) on both surfaces at once. |
| `DashboardShell` | A third copy of the same destinations (`dashboardNav`), plus its own mobile **"Menu" drawer** — so on a phone the account area had two hamburgers. |
| Guest | `Receipts` was exposed to visitors in the primary row. |

## 2. What replaced it

A single module, `src/navigation/navModel.ts`, now describes the chrome once per
role:

```
navForRole(role) → {
  desktop: NavItem[]   // top bar, md and up
  bottom:  BottomTab[] // mobile quick bar, max 5 (may contain the Login action)
  menu:    NavItem[]   // hamburger: secondary + account, never a bottom-bar item
  cta:     NavItem|null// the one promoted primary action (landlord)
  account: { dashboard, profile, notifications, settings }
}
```

* Every path is built by the route table (`tabPath`), so a URL can only be
  invented in one place and it is the same URL the dashboard sidebar uses.
* `Navbar`, `MobileBottomNav` and the app chrome consume the model; none of them
  computes a path of its own any more.
* `activeItemId()` marks the current page (longest match wins), so
  `/tenant/saved-properties` highlights "Saved", not "Dashboard".

The invariants are enforced by tests (`tests/routing.test.mts`, section N): every
link parses to a real route, the role is allowed to open it, no item appears in
both the quick bar and the menu, no surface repeats a link internally, no role
links into another role's area, and dashboard/profile/settings/notifications are
four distinct URLs.

## 3. The result, per state

### Guest (unchanged public reach, one sign-in path)

* Top bar (`md+`): Home · Browse Properties · Find a Home · List Property ·
  Receipts · About · Contact, then `Login` + `Register`.
* Quick bar (mobile): Home · Browse · Find Home · **Login**.
* Hamburger: List Property · Receipts · About · Contact · Create an account.
* One login entry per breakpoint (desktop row / quick bar). Nothing repeated
  across the two mobile surfaces.

### Tenant

* Top bar: Home · Browse Properties · Dashboard, plus the bell, the avatar
  (→ Profile) and logout.
* Quick bar: Browse · Dashboard · Saved · Viewings · Profile.
* Hamburger: Rental requests · Matched properties · Search alerts · Account
  settings · Logout.
* Notifications: the header bell, with the unread count.

### Landlord

* Top bar: Home · Browse Properties · Dashboard, a highlighted **List property**
  button, the bell, the avatar, logout.
* Quick bar: Dashboard · Properties · **List** (highlighted) · Viewings · Profile.
* Hamburger: Receipts · Verification · Account settings · Logout.
* The submission action is never buried: top-bar button, quick-bar tab, the
  dashboard's "List a property" and the "Add listing" button on My Properties.

### Agent

* Top bar: Home · Browse Properties · Dashboard, the bell, the avatar, logout.
* Quick bar: Dashboard · Listings · Viewings · Finance · Profile.
* Hamburger: Verification · Account status · Account settings · Logout.
* Submitting a property happens on the Listings page (`/agent/properties`),
  which the quick bar owns — no duplicate submission link.

### Admin

Unchanged: the console keeps its own navigation; the top bar still shows the
admin badge and "Admin Workspace", and the console is not given the member
bottom bar.

## 4. The bottom bar

At most five tabs, one icon size (22px), 56px touch targets, safe-area padding,
`aria-current="page"` on the tab you are on, and a short label with a spelled-out
`aria-label` (e.g. "Properties" → "My properties"). The page reserves
`76px + env(safe-area-inset-bottom)` below the content, so nothing hides behind
it.

**Notifications have their own entry point**: the labelled bell in the header
(`Notifications, 3 unread`). The dot is no longer drawn on Profile, and the bell
is not repeated as a menu row.

## 5. The hamburger

One menu, one button (`Open menu` / `Close menu`, with `aria-expanded` and
`aria-controls`). It adapts to the role, closes when an item is chosen, when the
route changes (Back/Forward) and on Escape, highlights the current page, never
offers Login/Register to a signed-in member, always ends with Logout, and never
shows another role's destinations.

The account area's own mobile drawer was removed (`DashboardShell`): with the
global hamburger listing every section that is not in the quick bar, that drawer
was a second, competing menu. The **desktop dashboard sidebar is unchanged** and
remains the section navigation on large screens.

## 6. Dashboard / Profile / Settings

Still three separate pages with three separate entry points: the Dashboard link
(top bar + quick bar), the avatar and the quick bar's Profile tab (→ Profile),
and the menu's "Account settings" (→ Settings). No shared component renders more
than one of them, and their forms are unchanged.

## 7. Testing

| Command | Result |
| --- | --- |
| `npm run test:routing` | 42 tests, 0 failures (38 existing + 4 navigation-model) |
| `npm run test:navigation` | 41 tests, 0 failures (30 existing, 11 Task 04) |
| `npm run test:api` | 261 tests, 0 failures |
| `npx tsc --noEmit` (`npm run lint`) | 0 errors |
| `npm run build` | success |

One existing assertion was updated: "the dashboard shell … marks the active
section" now looks for the active section inside the sidebar's own navigation
(`[aria-label="Tenant account sections"]`) because the quick bar legitimately has
its own active tab. New assertions cover the reverse case too.

Not performed: no real browser, no device/emulator, no visual QA, no
screen-reader pass, no MySQL run. The DOM harness has no CSS, so spacing,
overlap and touch-target sizes were reasoned about, not observed.
