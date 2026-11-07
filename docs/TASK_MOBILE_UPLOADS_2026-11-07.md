# Mobile responsiveness fixes + image/document selection corrections

**Date:** 2026-11-07
**Branch:** `arena/f9328584-goodlucks-rep` (based on `main` @ `88d34c1`, the merge of PR #17)
**Scope:** two targeted corrections — horizontal overflow on small screens, and the
image/document pickers (no preselected files, both Ghana Card sides previewed).

No redesign, no new dependencies, no backend rule changed, no deployment, no merge
into `main`.

---

## 1. Problems found

Every item below was found by reading the shipped source, not by assuming. Where a
width claim is made, the arithmetic is in the comment next to the fix.

**Mobile / horizontal overflow**

1. **The header was wider than the screen on tablets and small laptops.** The link
   row appeared at `md` for every role. A visitor's row is seven links
   (Home, Browse Properties, Find a Home, List Property, About, Learning Centre,
   Contact) and needs roughly 660px on its own; with a ~215px brand, the
   Login/Register pair and the page padding the header needed ~1070px inside a
   `max-w-7xl` column that is only 976px wide at 1024px and 720px at 768px. The
   seven links could therefore not fit anywhere between 768px and ~1150px, and the
   row silently spilled out of the header.
2. **The overflow was hidden, not fixed.** `src/index.css` had
   `body { overflow-x: hidden }` with a comment calling it protection. That does not
   reclaim the overflow in a `position: sticky`/`fixed` header, it clips content
   that has no other way to be reached, and it is why the page still felt like it
   moved sideways while parts of the UI were quietly cut off.
3. **The 320px header did not fit either.** The brand mark was `shrink-0`
   (40px) + "Goodlucks Homes" at `text-lg` (~150px) + the bell and menu buttons
   (2 × 44px) — about 296px of content inside 288px of usable width. The brand could
   not shrink, so the row pushed past the viewport on the narrowest phones.
4. **`min-h-screen` page shells, oversized `min-w-[Npx]` flex children, wide
   archive tables and unbreakable strings** were the other structural suspects. They
   were audited one by one: the tables were already inside `overflow-x-auto`, the
   `min-w-[Npx]` children were all inside `flex-wrap` rows, and no component asks for
   a fixed width above 320px. The real remaining risk was long unbreakable text
   (e-mail addresses, addresses, filenames, stored URLs) which has no `break-*`
   anywhere by default.
5. **Verification "Documents on file" rows** put a label, a size and two buttons on
   one line; at 320px the row needed ~285px inside ~240px of card, so it overflowed.

**Image selection**

6. **`ListPropertyView` pre-loaded two Unsplash photographs into `images`.** A
   brand-new "List your property" form reported "2 images selected" before the
   landlord had picked anything, and those stock photos were submitted as the
   listing's own pictures if the landlord did not notice.
7. The same form had **no filename, no per-image status and no duplicate
   protection**: a double tap on the picker queued the same file twice, and the
   counter was the only feedback while an upload was in flight.
8. **The admin listing editor** exposed images as a raw "URLs, one per line"
   textarea: no thumbnails, no distinction between a stored image and a new one, no
   file picker at all.

**Verification previews**

9. **`VerificationPanel` uploaded a document the instant it was chosen** and then
   cleared the native input. Consequences: no thumbnail, no filename, no way to
   cancel, no per-side state, and front and back were indistinguishable — the only
   evidence of either was one shared `pendingDocs` list showing "uploaded".
10. **The back of the Ghana Card was labelled "(optional)"** while the server
    (`php-backend/lib/verification.php`) refuses a Ghana Card submission that does
    not include `document_front` **and** `document_back`. The form let a member press
    Submit for a pair the server would always reject.
11. One shared `busy` flag drove every control, so the whole panel (including the
    Remove buttons for already-stored documents) froze during any single request,
    and a double tap could start a second submission.

---

## 2. Pages and components fixed (mobile)

| Surface | What changed |
| --- | --- |
| Header (every page) | Link row now appears at `xl` for visitors (7 links) and `lg` for members (3 links + at most one action), which is where each row actually fits; the hamburger and the account cluster follow the same breakpoint; brand mark and name may shrink/truncate (`min-w-0`, `truncate`, `text-base` on the smallest phones); gap tightened at `base`. |
| Header, tablet band | Between `md` (where the phone quick bar stops) and the link row, the hamburger now lists the quick-bar destinations — including the sign-in row — so nothing becomes unreachable on a tablet. The block is marked `data-quick-bar-mirror` and only renders where the quick bar is hidden. |
| Phone quick bar | Tabs can shrink (`min-w-0`) and truncate their labels instead of forcing five tabs wider than 320px. |
| Property detail | Long titles/addresses wrap (`break-words`) rather than stretching the column; the tab strip and gallery already scrolled locally. |
| Listings / browse | Cards, price tags and grids already collapsed to two columns; no fixed widths found. |
| Property submission form | Image grid is 1 column under 380px, 2 up to `sm`; long filenames truncate with a `title`; inputs are capped at their column. |
| Verification panel | Two document fields side by side from `sm`, stacked below; "Documents on file" rows wrap onto a second line; every long label breaks. |
| Admin (agents, finance, fee ledger, viewings, blog, e-mail templates) | All `min-w-[Npx]` flex children confirmed inside `flex-wrap` parents; agent e-mail/address columns can now shrink (`min-w-0`) and wrap. |
| Admin listing editor | Thumbnail grid (2 columns on a phone) instead of a textarea of URLs. |
| Global CSS | Removed `body { overflow-x: hidden }`; added `overflow-wrap: break-word` on `body`, `max-width: 100%` for images/svg/video/canvas/**iframe** and for `input/select/textarea`. No `overflow-x` is hidden on `html`/`body` anywhere. |

**Explicitly not changed:** the design system, palette, typography scale, page
layouts above `xl`, the bottom bar's five tabs, and the route/navigation model
(`src/navigation/navModel.ts` is untouched — the header only changes *where* each
list is rendered).

---

## 3. Upload interfaces audited

| Interface | File input | State before | Now |
| --- | --- | --- | --- |
| Property images (landlord) | `ListPropertyView.tsx` | Seeded with 2 stock photos | Empty on mount; validated; filename + status + remove |
| Identity documents (agent/landlord) | `VerificationPanel.tsx` | Uploaded on selection, input cleared | Held locally, previewed, uploaded on submit |
| Professional certificate (agent) | `VerificationPanel.tsx` | Uploaded on selection | Same pending-selection model |
| Profile picture | `AccountSettingsView.tsx` | Already correct (preview + Cancel + Save) | Unchanged |
| Blog featured image (admin) | `AdminBlogEditor.tsx` | Already correct (preview + alt text) | Unchanged |
| Listing edit images (admin) | `AdminDashboard.tsx` | URL textarea | Thumbnails with Saved/New badges + file picker |
| Agent listing images | `AgentListingForm.tsx` | URL text field (no picker) | **Unchanged — reported, see §9** |

Validation limits were taken from the server, not invented:
listing images 8 MB and JPG/PNG/WEBP/GIF; private documents 5 MB and PDF/JPG/PNG
(`php-backend/lib/private_storage.php`, `IDENTITY_DOCUMENT_MAX_BYTES`).

---

## 4. How preselection was eliminated

* `ListPropertyView` initialises `images` to `[]`. The only way an image enters the
  list is `handleFileUpload`, which is fed by the member's own file picker.
* Every candidate is validated (`validateImageFile`) and de-duplicated
  (`dedupeFiles`) before it is uploaded, so re-picking the same file cannot add a
  second copy.
* The header of the image block now reads **"No images selected"** with a dashed
  dropzone and the sentence "No images selected yet. A listing needs at least one
  photograph…". An empty form cannot be mistaken for a filled one.
* Each uploaded tile is labelled **New** with its original filename and size, and
  has a Remove control.
* The admin editor keeps the listing's stored images, badges each one **Saved**, and
  badges anything uploaded in the editor **New**; removing a tile takes the image out
  of the save payload only — the stored file is never deleted.
* Nothing is stored in `localStorage`, so remounting the form (navigating away and
  back) starts empty again.

---

## 5. How the verification previews work

* Two independent fields, always rendered together: `Ghana Card — front` and
  `Ghana Card — back` (the labels come from `identityDocumentSlots(documentType)`,
  the same helper that decides which side is required).
* Choosing a file runs `selectIdentityDocument(slot, file)`: it validates type/size,
  creates an object URL for images, and stores `{file, previewUrl, status}` in that
  slot only. **No network request happens on selection.**
* Each filled field shows: thumbnail (or a document icon for a PDF), filename,
  size, a status line (`Ready — uploads when you submit` → `Uploading…` →
  `Uploaded — attached to this submission` / `Upload failed — press Submit again to
  retry`), **Replace** and **Remove**.
* Empty fields are dashed and read "Choose a file — none selected".
* On submit the form uploads each pending side once (`uploadIdentitySlot`), keeps
  the returned document id on the selection, then calls
  `submitIdentityVerification` with the stored ids plus the new ones. A re-try after
  a failure reuses the ids, so a file is never uploaded twice.
* `identitySubmissionProblem()` mirrors the server's rule before the request is
  made: a Ghana Card needs both sides (including sides already on file); other
  document types need the front. The message is the server's own wording.
* `submittingRef` + `disabled` prevent a double submission. A failed submission
  keeps every selection and any uploaded id, so nothing has to be re-chosen.
* The same model is used for the professional certificate (`licence`).
* Existing stored documents are still listed under "Documents on file" with Open /
  Remove; nothing is deleted as part of a submission.

---

## 6. Files changed

```
src/index.css                             base rules: no global overflow hiding, break-word, control/media max-width
src/lib/uploads.ts                        NEW — validation + identity-slot + dedupe rules (pure, unit-tested)
src/components/Navbar.tsx                 header breakpoints, brand shrink, quick-bar mirror for tablets
src/components/MobileBottomNav.tsx        tabs may shrink/truncate
src/components/ListPropertyView.tsx       empty image list, validated upload, filename/status/remove tiles
src/components/VerificationPanel.tsx      pending-selection document fields, both Ghana Card sides, guarded submit
src/components/PropertyDetailView.tsx     long titles wrap
src/components/AdminDashboard.tsx         listing editor: saved/new thumbnails + file picker
src/components/AdminAgentAccounts.tsx     shrinkable text column, wrapping address
tests/uploads.test.mts                    NEW — 18 tests
tests/responsive.test.mts                 NEW — 14 tests
tests/app-navigation.test.mts             menu-row helper scoped to the quick-bar mirror + 1 new test
package.json                              test:uploads, test:responsive scripts
.github/workflows/ci.yml                  both suites run in CI
docs/TASK_MOBILE_UPLOADS_2026-11-07.md    this document
```

No PHP file was changed. No dependency was added.

---

## 7. Tests

| Suite | Result |
| --- | --- |
| `npm run test:api` | **279 / 279 pass** |
| `npm run test:navigation` | **61 / 61 pass** (was 60; one new test) |
| `npm run test:routing` | **50 / 50 pass** |
| `npm run test:content` | **4 / 4 pass** |
| `npm run test:property` | **23 / 23 pass** |
| `npm run test:sharing` | **36 / 36 pass** |
| `npm run test:blog` | **35 / 35 pass** |
| `npm run test:design` | **14 / 14 pass** |
| `npm run test:email-footer` | **3 / 3 pass** |
| `npm run test:access` | **13 / 13 pass** |
| `npm run test:uploads` (new) | **18 / 18 pass** |
| `npm run test:responsive` (new) | **14 / 14 pass** |

What the two new suites actually assert:

* **`tests/uploads.test.mts`** — the pure rules (`validateImageFile`,
  `validateDocumentFile`, `formatBytes`, `fileNameFromUrl`, `dedupeFiles`,
  `identityDocumentSlots`, `identitySubmissionProblem`, `identitySelectionProblem`)
  are exercised directly with real inputs; the components are then checked
  structurally (initial state is `[]`, no stock photos in any form, selection never
  calls the upload API, both slots rendered, status strings present, upload happens
  only in the submit handler, ids reused on retry, double-submit guard present,
  saved images not deleted in the admin editor).
* **`tests/responsive.test.mts`** — viewport meta still allows pinch-zoom; no
  `overflow-x: hidden`/`clip` on `html`/`body`; `overflow-wrap: break-word` and the
  media/control `max-width` rules present; no fixed width above 320px and no
  `w-screen`/`100vw` in any component; every `<table>` inside an `overflow-x-auto`
  container; no `whitespace-nowrap` on a long dynamic field; the header breakpoints,
  brand shrink and tablet mirror as described above.

**What is not covered by an automated test:** actual pixel layout, sideways
scrolling, pinch-zoom behaviour and the visual result in a browser. There is no
Playwright/Chromium and no real device available in this environment, and
happy-dom has no layout engine (no `scrollWidth`, no CSS). See §9 for the manual
procedure.

---

## 8. Lint and build

* `npm run lint` (`tsc --noEmit`) — **clean**, no errors.
* `npm run build` — **succeeds**; the generated stylesheet contains
  `min-width:380px`, `.lg\:flex`, `.xl\:flex`, `.xl\:hidden` and `.md\:block`,
  confirming the new responsive utilities are emitted and not purged.

---

## 9. Limitations and what was deliberately not done

1. **No browser or device was available**, so no screenshot, no `scrollWidth`
   measurement and no pinch-zoom observation could be produced. Layout correctness is
   argued from the CSS/Tailwind source and guarded by the structural tests above.
   Manual procedure to confirm on a device:

   *iPhone/Android, Chrome or Safari* — open DevTools → device toolbar, then repeat
   at 320, 360, 375, 390, 414, 768, 1024 and 1440px:
   1. Load `/`, `/properties`, `/property/<id>`, `/blog`, `/about`, `/contact`.
   2. Confirm no horizontal panning at any width (`document.documentElement.scrollWidth === window.innerWidth`).
   3. Confirm pinch-zoom still zooms (two-finger gesture, or `meta viewport` shows no `maximum-scale`).
   4. Sign in as each role and check the dashboard, verification page, receipts and
      the admin workspace.
   5. Open the hamburger at 320px and at 900px — every destination reachable, no
      clipped labels.
   6. Open each modal (share, viewing request, auth, get-notified) at 320px and 390px.
   7. Pinch-zoom while a modal is open; the dialog must stay centred and scrollable.
2. **The tablet band now uses the hamburger.** At 768–1279px a visitor sees the
   brand, the hamburger and (in the menu) every page. This is a visible change from
   the previous behaviour, where the link row rendered wider than the screen and was
   clipped. It is the only way to keep all seven destinations reachable without
   shrinking the type below the design system's scale.
3. **`AgentListingForm` still takes image URLs as text.** It starts empty (no
   preselection) and works, so it was left alone; converting it to the same picker
   would be a behaviour change to the agent submission flow.
4. **Two stock-photo fallbacks remain** and were intentionally not touched:
   `PropertyCard`/`AdminDashboard` show an Unsplash image when a listing genuinely
   has no stored image (a display fallback, not a form selection), and
   `HomeView`'s JSON-LD `logo` points at the same service. Both are display/SEO
   concerns outside this task's scope; the JSON-LD one is worth a separate fix.
5. **Currency/date formatting and other unrelated UI** were not touched.
6. The verification form's `documentType` for non-Ghana-Card types still requires a
   front image (the server only requires *one* document); this is stricter than the
   server and matches the "front of your document" wording the server itself uses.

---

## 10. Confirmation

* `main` was **not** modified; this work is on `arena/f9328584-goodlucks-rep`,
  branched from `main` @ `88d34c1`.
* **Nothing was deployed**; no hosting, DNS, e-mail or `.env` change was made.
* No database migration, no PHP change, no new dependency.
* No secrets, uploads or database files are part of the change.
