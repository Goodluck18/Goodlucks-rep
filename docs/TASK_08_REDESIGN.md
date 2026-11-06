# Task 08 — Website-wide colour and visual redesign

Status: implemented on `arena/993d019a-goodlucks-rep`, based on `main` @ `09d6cbd`
(the Task 07 merge). **Visual only.** No route, permission, API, database, email,
fee, commission, verification, blog or SEO behaviour changed.

The site previously used the approved brand colours on a **dark** interface: pages
and cards were `#1F242D` / `#252A34`, text was white or light slate, and borders
were `rgba(255,255,255,0.1)`. Task 08 moves the whole product to the light, bright
system the palette describes: light grey pages, white surfaces, charcoal type,
soft grey rules, pink primary actions and teal interactive/selected states.

---

## 1. The palette, exactly

| Colour | Hex | Role in the product |
| --- | --- | --- |
| Light grey | `#EAEAEA` | `--color-page` — the dominant page background |
| White | `#FFFFFF` | `--color-surface` — cards, forms, panels, dialogs, tables |
| Pink | `#FF2E63` | `--color-accent` — primary buttons and important highlights |
| Teal | `#08D9D6` | `--color-interactive` — links, hover/focus rings, selected states, chips |
| Charcoal | `#252A34` | `--color-ink` — headings, body text, icons |
| Soft grey | `#D6D6D6` | `--color-line` — borders, separators, outlines |

Three derived shades exist only so that a hover or a small label stays readable;
they are shades of the two accents, not new brand colours:

| Token | Value | Why |
| --- | --- | --- |
| `--color-interactive-dark` | `#06C4C1` | teal hover fill (a teal button darkens instead of glowing) |
| `--color-interactive-text` | `#0A6B6A` | teal-tinted label/icon on white (5.9:1) |
| `--color-accent-text` | `#C9143F` | pink label/price/error text on white (5.6:1) |

Functional status colours (green = done/active, amber = waiting, red = failed) are
retained as restrained tints with dark labels. They are the only non-palette
colours on the site; without them "approved" and "rejected" would look the same.
The WhatsApp button keeps WhatsApp's own green, with a white label.

### Contrast (measured, `tests/design-tokens.test.mjs`)

| Pairing | Ratio | Verdict |
| --- | --- | --- |
| charcoal on light grey page | 12.4:1 | AAA |
| charcoal on white card | 14.6:1 | AAA |
| 70% charcoal (muted) on white | 7.3:1 | AAA |
| charcoal on a teal fill | 8.2:1 | AAA — every teal fill carries charcoal text |
| teal-tinted label on white | 5.9:1 | AA |
| pink label on white | 5.6:1 | AA |
| white on pink button | 3.6:1 | AA for large/bold only — **see the limitation below** |

**Teal as text is not used.** `#08D9D6` on white measures 1.8:1, which is not
readable. Teal therefore appears as a fill, border, focus ring, underline,
selected-state background and chip tint — never as small text on a light surface.
Links are charcoal type with a 2px teal underline that thickens on hover, so the
teal still marks every interactive element while the words stay legible.

**Pink buttons.** No foreground in this palette reaches 4.5:1 on `#FF2E63`
(white is 3.6:1, charcoal 4.0:1). The brief specifies white text on pink, so
primary buttons use a white **bold** label on a 44px-tall control. This is the one
pairing that does not clear AA for small text; it is a property of the palette and
is recorded here rather than hidden.

---

## 2. The central design system

`src/index.css` is now the single source of colour, surface, control and elevation
styling. Tailwind v4 `@theme` exposes the tokens as utilities
(`bg-page`, `bg-surface`, `text-ink`, `border-line`, `bg-accent`,
`bg-interactive`, `text-ink/70`, …), and `@layer base` + `@layer components`
define the shared building blocks:

* **Base** — page background and text colour, `::selection`, one `:focus-visible`
  ring (2px teal outline, 2px offset), palette accent for native checkboxes, range
  inputs and progress bars, `overflow-x: hidden` so a single long row can never
  make the page scroll sideways on a phone.
* **Surfaces** — `.gl-card`, `.gl-card-interactive` (hover changes only the border
  and elevation, so nothing shifts), `.gl-panel`, `.gl-divider`.
* **Buttons** — `.gl-btn` plus `.gl-btn-primary` (pink / white), `.gl-btn-secondary`
  (white / charcoal / soft grey border), `.gl-btn-accent` (teal / charcoal),
  `.gl-btn-ghost`, `.gl-btn-danger`. One height (44px), one radius, one set of
  hover/active/disabled states.
* **Links** — `.gl-link`: charcoal text, teal underline, teal-tinted hover.
* **Form controls** — `.gl-input`, `.gl-select`, `.gl-textarea`, `.gl-label`,
  `.gl-help`: white field with a soft grey border, grey fill on disabled, charcoal
  focus border plus a teal focus ring, and a pink outline for `aria-invalid`.
* **Status** — `.gl-badge` with `.gl-badge-success`, `.gl-badge-warning`,
  `.gl-badge-danger`, `.gl-badge-info`.
* **Selection** — `.gl-tab` / `.gl-tab-active`: the teal fill + charcoal label used
  for every selected tab, filter and navigation item.
* **Messages** — `.gl-alert`, `.gl-alert-error`, `.gl-alert-success`,
  `.gl-alert-info`.
* **Tables** — `.gl-table` with a grey header row, soft grey rules and a light
  hover row.
* **Elevation and shape** — `--radius-card: 1rem`, `--radius-control: 0.75rem`,
  `--shadow-card`, `--shadow-raised`. Heavy `shadow-xl`/`shadow-2xl` were removed
  in favour of these two.

All 58 edited component files were migrated to these tokens: the only literal
colour left anywhere in `src/**` is WhatsApp's `#25D366`/`#20BA5A` on the contact
button. The design test asserts that, so a future edit cannot quietly reintroduce a
hardcoded brand colour.

---

## 3. What changed visually

**Global**

* Dark page/section backgrounds (`#1F242D`, `#1A1E26`, `#12161F`, `slate-900/950`)
  → light grey page or white surface.
* White/`slate-100…400` text → charcoal, with 70% charcoal for secondary text.
* `border-white/10` and `border-slate-800` → soft grey `#D6D6D6`; `divide-white/5`
  → grey rules.
* `bg-white/5` and `bg-white/10` tints → light grey fills on white surfaces.
* Modal scrims: black → charcoal at 60% opacity.
* Decorative teal/pink glow gradients, blurred circles and pulse animations
  removed from the home hero, browse banner, listing sidebar, admin login and the
  listing/card photo overlays.
* Gradient text, gradient panels and the dark hero bands replaced with flat
  surfaces and type.
* Radii unified (`rounded-3xl` → `rounded-2xl`); shadows reduced two steps.
* Oversized hero heading reduced from `text-6xl` to `text-3xl → 5xl`.

**Header, navigation and footer** (architecture untouched — Task 04's single
data-driven menu, the same links, the same destinations)

* White sticky header with a soft grey hairline, charcoal links, and a teal fill
  for the current page (desktop row, hamburger rows and the notification bell).
* "Register" and the role call-to-action are pink primary buttons; "Login" is a
  quiet text button.
* The brand lockup is preserved: charcoal "Goodlucks", **pink "Homes"** (it was
  teal under the old build, which contradicted the brand rule), the teal house
  mark, and the unchanged slogan "FIND. VIEW. RENT.".
* Mobile bottom bar: white with a grey hairline; the current tab gets a teal tint
  instead of only bolder text.
* Footer: white surface, grey top rule, teal-tinted contact icons, outlined social
  buttons, and the Learning Centre link kept.

**Public pages** — home, browse/search, property cards, property details,
find-a-home, list-property, auth, reset password, about, contact, receipts,
privacy/404, blog index and blog article.

* Cards: white, one border, one radius, one shadow; hover changes the border to
  teal. Rent is the pink highlight; property metadata is charcoal with teal-tinted
  bed/bath icons.
* Forms: grey fields on white cards, charcoal labels, pink-only primary submit
  buttons, consistent 44px heights, pink inline field errors.
* Blog: white article card on the grey page, charcoal article typography, teal
  link underlines, teal category chips, teal-filled selected category, pink-tinted
  alerts; the live property cards inside an article use the same card system.

**Tenant / landlord / agent dashboards**

* `DashboardShell` is unchanged in structure (sidebar + content, mobile top bar,
  no second drawer). Sidebar cards are white, the active section is a teal fill
  with a charcoal label, summary cards are white with a teal hover border, empty
  states and loading states use the shared components.
* Section bodies: every dark panel converted; forms use the grey field; "Save",
  "Submit for review", "Start a rental request" and similar primary actions are
  pink; the notification list uses a white row for unread and a grey row for read.

**Admin console**

* The console header is a white card with a pink "Live Operations" badge; export
  and alert-digest actions are secondary buttons; "Schedule Physical Viewing" is
  the pink primary.
* The twelve section tabs share `.gl-tab`, so the selected section is teal
  everywhere.
* Every panel (analytics, approval queue, listings, matching, viewings, agents,
  fee policies, finance, enquiries, email logs, **Blog Management**, **article
  editor**, **Email Templates**) was migrated: white panels, grey table headers,
  charcoal text, pink primary actions, teal selected controls, functional status
  tints retained.
* Tables scroll horizontally inside their own container; nothing forces the page
  wide.

---

## 4. Files

**Design system**

* `src/index.css` — rewritten: `@theme` tokens, base layer, all `.gl-*`
  components, and the article typography block (`gl-article`) recoloured for the
  light theme.
* `index.html` — `theme-color` white, `color-scheme: light` (was charcoal).

**Components (58 files touched)** — every file under `src/components/`, including
`Navbar`, `Footer`, `MobileBottomNav`, `HomeView`, `BrowseView`, `PropertyCard`,
`PropertyDetailView`, `FindAHomeView`, `ListPropertyView`, `AuthModal`,
`ResetPasswordView`, `AboutView`, `ContactView`, `ReceiptsView`, `NotFoundView`,
`Blog*`, `Admin*`, `TenantDashboard`, `LandlordDashboard`, `AgentDashboard`,
`VerificationPanel`, `Skeleton`, `ToastContainer`, the `dashboard/` views and
`App.tsx` shells.

**Tests and CI**

* `tests/design-tokens.test.mjs` (new, 14 tests) — palette exactness, derived-token
  containment, no legacy dark utilities, no hardcoded palette hexes, white-text
  containment, measured contrast, light page shells, the shared control set, the
  focus treatment and the brand lockup.
* `tests/app-navigation.test.mts` — one new test that renders 14 real pages
  (public + all four dashboards) and asserts none of them emits a dark-theme
  class and each paints a light page background.
* `package.json` — `test:design`; `.github/workflows/ci.yml` — runs it.

No existing test was weakened: the routing, navigation, content, blog, API,
account-settings, Task 03 and migration suites are unchanged.

---

## 5. Deliberately unchanged

* **Navigation architecture** (Task 04): same data-driven menus, same links, same
  destinations, same mobile drawer + bottom bar. Only colours and states.
* **Logo and slogan**: the house mark, "Goodlucks" charcoal / "Homes" pink, and
  "FIND. VIEW. RENT." are preserved. The slogan's source text is still
  `Find. View. Rent.` rendered uppercase, as before.
* **Every business rule**: permissions, viewing fees, the 8% platform fee, agent
  commission tiers, verification workflow, receipts, blog publishing and the live
  property showcase. No handler, model, query or migration was touched — the diff
  is limited to `src/`, `index.html`, tests, CI and this document.
* **Status semantics**: green/amber/red tints are kept (darkened for light
  surfaces) because colour is doing real work there.
* No database migration was needed or written.

---

## 6. Tests executed

```
npm run lint            # tsc --noEmit                                  → clean
npm run test:design     # palette, contrast, shells, controls           → 14 pass, 0 fail
npm run test:routing    # URLs, guards, dashboard sections              → 47 pass, 0 fail
npm run test:navigation # real app rendered in happy-dom (54 tests)      → 54 pass, 0 fail
npm run test:content    # wording/claims rules                          →  4 pass, 0 fail
npm run test:blog       # Blog & Learning Centre, PHP + SQLite          → 35 pass, 0 fail
npm run test:api        # full backend suite, 44 suites                 → 266 pass, 0 fail
node --test tests/migration.test.mjs   # migrations, SQLite + MySQL SQL   → 14 pass, 0 fail
npm run build           # production bundle                             → OK
```

Every suite ends at the same count and pass/fail as before the redesign, so the
500+ assertions that cover routing, permissions, fees, commissions, verification,
receipts, blog publishing and migrations still hold. The only test changes are
additive: `tests/design-tokens.test.mjs` and one extra render test in
`tests/app-navigation.test.mts`.

`test:navigation` now includes the rendered-page check: `/`, `/properties`,
`/property/:id`, `/find-a-home`, `/list-property`, `/blog`, `/blog/:slug`,
`/about`, `/contact`, `/receipts`, `/tenant/dashboard`, `/landlord/dashboard`,
`/agent/dashboard` and `/admin` each render with the light system and no legacy
dark class.

---

## 7. Browser testing

**No real browser was used, and none is claimed.** This sandbox has no browser
binary and cannot download one (Playwright's Chromium download fails; only the
package registry is reachable). The evidence here is:

* the app rendered in **happy-dom** at the 14 routes above (DOM assertions, not
  pixels);
* the production **CSS compiled** and the token utilities are present
  (`bg-page`, `text-ink`, `text-ink/70`, `.gl-btn-primary`, …);
* measured colour contrast;
* line-by-line review of every edited file.

What was therefore **not** checked visually: actual pixel layout, image cropping,
hover feel, table overflow on a small phone, and the admin console at tablet
widths. Before launch, someone with a browser should walk the pages listed below
at 360px, 768px, 1280px and check for overflow, clipped buttons and card spacing.

**Pages to check manually** (all built from the same system): home, browse,
property detail, find-a-home, list-property, login/register modal, reset password,
about, contact, receipts, blog index, a blog article, tenant overview + each
tenant section, landlord overview + property management + submission form +
viewings + receipts + verification, agent overview + listings + finance +
verification + status, admin overview + every admin tab, and the print/receipt
preview.

---

## 8. Git

* Branch: `arena/993d019a-goodlucks-rep`
* Commit: recorded in the pull request
* PR into `main`: see the report
* Merge: see the report

---

## 9. Remaining issues

1. **White on pink is 3.6:1** — a property of `#FF2E63`, mitigated with bold labels
   and 44px controls. If AA for all text sizes is mandatory, the shortest fix is a
   darker pink for button fills, which would need an approval change to the palette.
2. **No browser pass** (see §7). The layout is unchanged structurally, so risk is
   concentrated in the few containers whose background changed from dark to light.
3. **Status colours are not brand colours.** Kept deliberately: removing them would
   make approved, pending and rejected indistinguishable.
4. The site is still **not launch-ready** (this task is a visual pass, not a launch
   review), and Task 09 has not been started.
