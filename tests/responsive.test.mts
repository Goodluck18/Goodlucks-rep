/**
 * Mobile layout regression tests — the structural half of "the page must not
 * move sideways".
 *
 * There is no browser in CI (and none in this workspace), so nothing here can
 * measure a scrollWidth. What it *can* do is fail if any of the properties that
 * make horizontal overflow impossible are undone:
 *
 *   1. the viewport meta still allows pinch-zoom (never user-scalable=no);
 *   2. the page is not fixed by hiding the symptom (no body overflow-x: hidden)
 *      and long words wrap instead of widening the page;
 *   3. media and form controls are capped at 100% of their column;
 *   4. no element asks for a width wider than the smallest phone we support;
 *   5. archive tables scroll inside their own container;
 *   6. the header fits: the link row only appears at a breakpoint where its
 *      role's links actually fit, and the brand may shrink;
 *   7. the bottom bar's five tabs may shrink and truncate.
 *
 * The manual half (real devices at 320/360/375/390/414px, pinch-zoom) is listed
 * in docs/TASK_MOBILE_UPLOADS_2026-11-07.md — it cannot be claimed by a test.
 *
 *   npm run test:responsive
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

const componentFiles: string[] = [];
const walk = (dir: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(entry.name)) componentFiles.push(full);
  }
};
walk(path.join(root, 'src'));

const sources = componentFiles.map((file) => ({
  path: path.relative(root, file).replace(/\\/g, '/'),
  text: fs.readFileSync(file, 'utf8'),
}));

const css = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8');
/** Comments explain the old bug; they must not satisfy or trip the assertions. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const byPath = (relative: string) => sources.find((source) => source.path === relative)?.text ?? '';

/* -------------------------------------------------------------------------- */
/* 1. The viewport must stay zoomable                                         */
/* -------------------------------------------------------------------------- */

test('pinch-to-zoom is not disabled', () => {
  const viewport = /<meta\s+name="viewport"[^>]*>/i.exec(html)?.[0] ?? '';
  assert.ok(viewport, 'index.html must declare a viewport');
  assert.match(viewport, /width=device-width/);
  assert.match(viewport, /initial-scale=1/);
  assert.ok(!/user-scalable\s*=\s*no/i.test(viewport), 'user-scalable=no breaks accessibility');
  assert.ok(!/maximum-scale\s*=\s*1(\.0)?["'\s>]/i.test(viewport), 'maximum-scale=1 blocks pinch-zoom');
});

/* -------------------------------------------------------------------------- */
/* 2. The symptom must not be hidden globally                                 */
/* -------------------------------------------------------------------------- */

test('the page is not made "responsive" by hiding the overflow', () => {
  const body = /body\s*\{[^}]*\}/.exec(cssCode)?.[0] ?? '';
  assert.ok(body, 'the base layer must style body');
  assert.ok(
    !/overflow-x\s*:\s*hidden/.test(body),
    'body { overflow-x: hidden } hides a layout bug instead of fixing it'
  );
  assert.ok(
    !/overflow\s*:\s*hidden/.test(body),
    'body { overflow: hidden } would also clip fixed overlays'
  );
  // `overflow-x: clip` on html/body is the same trick with a newer name.
  assert.ok(!/html\s*\{[^}]*overflow-x\s*:\s*(hidden|clip)/.test(cssCode));
  assert.ok(!/body\s*\{[^}]*overflow-x\s*:\s*(hidden|clip)/.test(cssCode));
});

test('long words, addresses and URLs wrap instead of widening the page', () => {
  assert.match(css, /overflow-wrap:\s*break-word/);
});

test('media and form controls cannot exceed their column', () => {
  assert.match(css, /img,\s*\n\s*svg,\s*\n\s*video,\s*\n\s*canvas,\s*\n\s*iframe\s*\{\s*\n\s*max-width:\s*100%;/);
  assert.match(css, /input,\s*\n\s*select,\s*\n\s*textarea\s*\{\s*\n\s*max-width:\s*100%;/);
});

/* -------------------------------------------------------------------------- */
/* 3. Nothing asks for more width than a 320px phone has                      */
/* -------------------------------------------------------------------------- */

test('no component requests a fixed width wider than a phone', () => {
  const offenders: string[] = [];
  for (const source of sources) {
    for (const match of source.text.matchAll(/(?<![\w-])(?:min-)?w-\[(\d+)px\]/g)) {
      const width = Number(match[1]);
      if (width > 320) offenders.push(`${source.path}: w-[${width}px]`);
    }
  }
  assert.deepEqual(offenders, [], 'a fixed width above 320px overflows the smallest phone');
});

test('the viewport unit is never used as an element width', () => {
  const offenders: string[] = [];
  for (const source of sources) {
    for (const match of source.text.matchAll(/(?<![\w-])(w-screen|h-screen)\b/g)) {
      offenders.push(`${source.path}: ${match[1]}`);
    }
    if (/\b100vw\b/.test(source.text)) offenders.push(`${source.path}: 100vw`);
  }
  assert.deepEqual(offenders, [], 'use w-full; 100vw includes the scrollbar and can overflow');
});

test('every archive table scrolls inside its own box', () => {
  const offenders: string[] = [];
  for (const source of sources) {
    const lines = source.text.split('\n');
    lines.forEach((line, index) => {
      if (!/<table/.test(line)) return;
      const context = lines.slice(Math.max(0, index - 8), index + 1).join('\n');
      if (!/overflow-x-auto/.test(context)) offenders.push(`${source.path}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, [], 'a wide table must scroll locally, not move the whole page');
});

test('nowrap is never applied to a long dynamic field', () => {
  const offenders: string[] = [];
  for (const source of sources) {
    for (const line of source.text.split('\n')) {
      if (!/whitespace-nowrap/.test(line)) continue;
      if (/\{(?:[a-zA-Z]+\.)*(title|location|address|description|url|email|name)\}/.test(line)) {
        offenders.push(`${source.path}: ${line.trim().slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'a long title or address must be allowed to wrap');
});

test('flex rows that can hold a long value give it somewhere to shrink', () => {
  // The admin agent list puts an e-mail address beside a column of buttons; the
  // text column must be allowed to shrink and the address must wrap.
  const agentAccounts = byPath('src/components/AdminAgentAccounts.tsx');
  assert.match(agentAccounts, /className="min-w-0 space-y-1"/);
  assert.match(agentAccounts, /text-ink\/70 break-words/);

  // Document/verification rows wrap onto a second line instead of forcing the
  // card wider than the phone.
  const verificationPanel = byPath('src/components/VerificationPanel.tsx');
  assert.match(verificationPanel, /flex flex-wrap items-center justify-between gap-x-2 gap-y-1/);

  // A long property title on the detail page wraps.
  assert.match(byPath('src/components/PropertyDetailView.tsx'), /tracking-tight break-words/);
});

/* -------------------------------------------------------------------------- */
/* 4. The header                                                             */
/* -------------------------------------------------------------------------- */

test('the header link row only appears where its links fit', () => {
  const navbar = byPath('src/components/Navbar.tsx');
  // Visitors have seven links; members have three plus at most one action.
  assert.match(navbar, /const wideLinkRow = nav\.desktop\.length > 4;/);
  assert.match(navbar, /const linkRowClass = wideLinkRow \? 'hidden xl:flex' : 'hidden lg:flex';/);
  // The hamburger takes over exactly where the row stops.
  assert.match(navbar, /const compactHeaderClass = wideLinkRow \? 'xl:hidden' : 'lg:hidden';/);
  assert.ok(
    !/<nav aria-label="Main"[^>]*hidden md:flex/.test(navbar),
    'the seven-link row cannot start at md — it does not fit 768px'
  );
  assert.ok(!/"md:hidden/.test(navbar), 'the hamburger must not disappear while the link row is hidden');
});

test('the brand shrinks instead of pushing the header wider', () => {
  const navbar = byPath('src/components/Navbar.tsx');
  assert.match(navbar, /group text-left focus:outline-none min-w-0/);
  assert.match(navbar, /flex flex-col min-w-0/);
  assert.match(navbar, /tracking-tight text-ink truncate">\s*Goodlucks <span className="text-accent">Homes<\/span>/);
});

test('a tablet between the bottom bar and the link row can still reach every page', () => {
  const navbar = byPath('src/components/Navbar.tsx');
  // The bottom bar stops at md, the row starts at lg/xl; in between the menu
  // must carry the bottom-bar destinations.
  assert.match(navbar, /const bottomLinksInMenuClass = wideLinkRow \? 'hidden md:block xl:hidden' : 'hidden md:block lg:hidden';/);
  // Every quick-bar tab is listed there — links navigate, the sign-in tab opens
  // the auth modal, exactly as the quick bar does.
  assert.match(navbar, /nav\.bottom\.map\(\(tab\) => \{/);
  assert.match(navbar, /data-quick-bar-mirror="true"/);
});

test('the bottom bar tabs may shrink and truncate', () => {
  const bottomNav = byPath('src/components/MobileBottomNav.tsx');
  assert.match(bottomNav, /flex-1 min-w-0 flex flex-col/);
  assert.match(bottomNav, /max-w-full truncate/);
});

/* -------------------------------------------------------------------------- */
/* 5. Upload previews are phone-sized                                         */
/* -------------------------------------------------------------------------- */

test('image preview grids collapse to one or two columns on a small phone', () => {
  // Upgrade 2 (C3): the preview grid lives in the shared image picker.
  const imagePicker = byPath('src/components/PropertyImagePicker.tsx');
  assert.match(imagePicker, /grid grid-cols-1 min-\[380px\]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3/);

  const verificationPanel = byPath('src/components/VerificationPanel.tsx');
  assert.match(verificationPanel, /grid grid-cols-1 sm:grid-cols-2 gap-3/);
});

/* -------------------------------------------------------------------------- */
/* 6. Mobile listing strip (Upgrade 2, A4)                                    */
/* -------------------------------------------------------------------------- */

test('a phone gets a swipeable row of compact horizontal listing cards', () => {
  const grid = byPath('src/components/PropertyCardGrid.tsx');
  const card = byPath('src/components/PropertyCard.tsx');

  // The strip is a real scroll container with snap points, hidden below `sm`.
  assert.match(grid, /role="list"/);
  assert.match(grid, /sm:hidden/);
  assert.match(grid, /flex snap-x snap-mandatory gap-3 overflow-x-auto/);
  assert.match(grid, /snap-start/);
  // Each card takes most of the screen but never more than a phone's width, so
  // the next card is always peeking in from the right.
  assert.match(grid, /w-\[78%\] max-w-\[320px\] shrink-0/);

  // The compact card is a row, not a column: picture left, details right.
  assert.match(card, /horizontal \? 'flex flex-row' : 'flex flex-col'/);
  assert.match(card, /horizontal \? 'w-28 min-\[380px\]:w-32 shrink-0'/);
  assert.match(card, /layout\?: 'vertical' \| 'horizontal'/);
});

test('tablet and desktop keep the existing grid', () => {
  const grid = byPath('src/components/PropertyCardGrid.tsx');
  // The desktop grid is hidden below `sm` and uses the same column classes the
  // pages had; the default is the four-step catalogue grid.
  assert.match(grid, /hidden sm:grid \$\{gridClassName\}/);
  assert.match(grid, /sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6/);
});

test('every page that lists properties uses the shared grid', () => {
  for (const page of [
    'src/components/BrowseView.tsx',
    'src/components/HomeView.tsx',
    'src/components/PropertyDetailView.tsx',
    'src/components/TenantDashboard.tsx',
  ]) {
    assert.match(byPath(page), /<PropertyCardGrid/, `${page} must use the shared grid`);
    assert.ok(
      !/<div className="grid grid-cols-2 sm:grid-cols-2/.test(byPath(page)),
      `${page} must not keep a private mobile grid`
    );
  }
});

test('the strip scrolls inside its own box and hides only its scrollbar', () => {
  assert.match(cssCode, /\.gl-property-strip \{[\s\S]*?scroll-snap-type: x mandatory/);
  assert.match(cssCode, /\.gl-property-strip \{[\s\S]*?overscroll-behavior-x: contain/);
  assert.match(cssCode, /\.gl-property-strip::-webkit-scrollbar \{\s*display: none;/);
  // Hiding the page's overflow is still forbidden: the strip is the container.
  assert.ok(!/html\s*\{[^}]*overflow-x\s*:\s*hidden/.test(cssCode));
  assert.ok(!/body\s*\{[^}]*overflow-x\s*:\s*hidden/.test(cssCode));
});
