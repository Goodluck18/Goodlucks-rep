# Upgrade 2 — correction: property-card layouts (catalogue grid vs article showcase)

**Date:** 2026-11-10
**Branch:** `arena/afc06ebe-goodlucks-rep` (branched from `main` at `bf7f9a8`)
**Introduced by:** `47cea1f` — "Upgrade 2 Phase 2" (requirement A4 in the Phase 0 audit)
**Scope:** one corrective change. Nothing else was touched, and no other feature was reverted.

---

## 1. What was wrong

Two different property-card presentations had been merged into one.

| Use case | Should be | Was |
| --- | --- | --- |
| Home page, browse page, listing page, tenant dashboard | The catalogue grid: vertical cards, two per row on a phone, up to four on a desktop | Compact **horizontal** cards in a **sideways-swiping strip** on every screen below `sm` |
| Properties inside a blog article | Compact cards in one horizontally scrolling row | A plain responsive **grid** (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) that wrapped onto several rows |

So the two halves were exactly swapped relative to the requirement.

### How it happened

`47cea1f` implemented A4 ("mobile property cards: smaller, horizontal, scroll right → left, desktop unchanged") as a
change to the **shared listing grid**:

* `src/components/PropertyCard.tsx` gained a `layout?: 'vertical' | 'horizontal'` prop, turning the single card into two
  cards with two sets of paddings, type sizes and icon sizes.
* A new `src/components/PropertyCardGrid.tsx` rendered **both** layouts: a `sm:hidden` snap-scrolling strip of
  horizontal cards, plus the ordinary grid hidden below `sm`.
* All four listing pages were moved onto it, so the swap applied everywhere at once.

The blog showcase was written in a different phase of the same commit and simply used a grid, so it inherited none of it.

Because the strip replaced the grid *below* `sm` only, nothing looked wrong on a desktop, and no test failed: the tests
asserted that the strip existed on those pages, which was the intention at the time. The mistake was in the
requirement, not in the code's faithfulness to it.

---

## 2. What was changed

| File | Change |
| --- | --- |
| `src/components/PropertyCard.tsx` | Restored to the pre-upgrade card — byte-identical to `ad2bb0a`. The `layout` prop, the `horizontal` branches and the compact card are gone. |
| `src/components/PropertyCardGrid.tsx` | Now a plain CSS grid (`grid ${gridClassName}`) at every screen size: no strip, no `sm:` layout swap, no `renderCard(property, layout)` second argument. Keeps the shared grid classes, the `data-property-grid` hook and the optional `renderCard` wrapper used by the tenant dashboard's match badges. |
| `src/components/BlogPropertyShowcase.tsx` | **New.** One horizontal row of compact `BlogPropertyCard`s: `flex` + `overflow-x-auto` + `snap-x`, fixed `w-[248px]` (`sm:w-[268px]`) cards with `shrink-0`, `role="list"`, `tabIndex={0}` so a keyboard user can scroll it. |
| `src/components/BlogArticleBody.tsx` | Renders `<BlogPropertyShowcase>` where it used to render a card grid. The empty-showcase note and the structural `splitShowcase` behaviour are unchanged. |
| `src/index.css` | `.gl-property-strip` (the listing-page strip) removed; `.gl-blog-showcase` added with snap, `overscroll-behavior-x: contain` and a slim scrollbar. |
| `src/components/{HomeView,BrowseView,PropertyDetailView,TenantDashboard}.tsx` | Only the comments that described the removed strip, plus the two tenant-dashboard `renderCard` callbacks that no longer receive a `layout`. Their markup and behaviour are otherwise untouched. |

### Why the component was refactored rather than deleted

`PropertyCardGrid` still earns its place: it holds one definition of the catalogue grid so the four pages cannot drift,
and it carries the badge wrapper hook. The wrong behaviour was a *mode* inside it, so the mode went and the component
stayed. Likewise the card itself keeps one presentation rather than a switch that can be set wrongly.

### Separation

The two use cases are now two components with no shared switch:

* `PropertyCardGrid` → vertical cards, wrapping grid, at every breakpoint. Cannot scroll sideways.
* `BlogPropertyShowcase` → compact cards, single row, horizontal scroll. Used only by `BlogArticleBody`.

Neither imports the other; the article body imports only the showcase, and no listing page imports the showcase.

---

## 3. Tests

Seven tests were added or rewritten; none were weakened.

* `tests/responsive.test.mts` (18 → 20): the catalogue grid is a plain grid with no `overflow-x`, no `sm:hidden` and no
  snap; the shared card has no compact mode; every listing page uses the shared grid and none imports the article
  showcase; the showcase is one non-wrapping scroll row with fixed-width cards; the article body uses the showcase rather
  than a grid; `.gl-blog-showcase` carries the scroll rules and `.gl-property-strip` is gone.
* `tests/app-navigation.test.mts` (59 → 64): the real app, mounted in happy-dom, is checked page by page — home, browse,
  listing and tenant saved-properties each render their cards inside `[data-property-grid]` and never inside
  `[data-blog-showcase]`; a blog article renders exactly one showcase row whose direct children are the fixed-width
  cards, with the live rent and the property link intact, and no catalogue grid anywhere on the page.

**Mutation check:** putting `overflow-x-auto` back on the catalogue grid fails both the home-page and the browse-page DOM
tests and the structural grid test; removing it restores green. The tests are not vacuous.

Full suite at this commit: **758 / 758 pass, 0 failures** (30 files, 31 runs — `api.test.mjs` is split because a single
PHP-WASM process wedges near ~1,000 requests). `tsc --noEmit` clean. `npm run build` ✓, and the built stylesheet was
checked to contain the rules the new layout depends on (`.w-\[248px\]`, `.sm\:w-\[268px\]`, `.shrink-0`, `.snap-start`,
`.overflow-x-auto`, `.gl-blog-showcase`) — an arbitrary-value class that Tailwind silently dropped would otherwise leave
the cards with no width.

---

## 4. Visual verification

There is no browser in this environment (no Chrome, Chromium, Firefox or Playwright), so **no pixel-level check was
made by me and none is claimed**. What was done instead:

* the real components were mounted in a DOM and their structure, classes, links and content asserted (above);
* the compiled CSS was inspected to prove the utilities exist;
* a live article with four property cards was created in the **local development** database so the result can be looked
  at in a browser: `/blog/four-homes-available-in-accra`, alongside `/` and `/properties` for comparison.

The development database is local and git-ignored; nothing was written to production.

---

## 5. Deployment

No migration, no configuration change, no data change. Deploy the files as usual. After deploy: a listing page shows the
catalogue grid at every width; a blog article shows one horizontal card row that scrolls inside itself.
