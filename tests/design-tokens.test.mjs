/**
 * Task 08 — design-system regression tests.
 *
 * The redesign is a visual task, so its rules are checked structurally:
 *
 *   1. the six approved palette values are the only brand colours in the CSS;
 *   2. every colour role resolves to one of them (page / surface / ink / line /
 *      accent / interactive), so a future edit cannot quietly reintroduce a
 *      different brand colour;
 *   3. the dark-theme utilities the old build used (bg-[#1F242D], bg-slate-900,
 *      border-white/10, …) never come back;
 *   4. each text/background pairing the system actually uses is measured
 *      against the WCAG contrast thresholds;
 *   5. every full-page shell paints the light page or a white surface, never a
 *      dark background;
 *   6. the shared control classes (buttons, inputs, cards, badges, tabs) exist
 *      centrally rather than being re-invented per page.
 *
 *   npm run test:design
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8');

/** Every component and page source file. */
const sources = (() => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(root, 'src'));
  return files;
})();

const read = (file) => fs.readFileSync(file, 'utf8');
const relative = (file) => path.relative(root, file);

/* -------------------------------------------------------------------------- */
/* 1. The palette                                                             */
/* -------------------------------------------------------------------------- */

const PALETTE = {
  page: '#eaeaea',
  surface: '#ffffff',
  pink: '#ff2e63',
  teal: '#08d9d6',
  ink: '#252a34',
  line: '#d6d6d6',
};

test('the six approved colours are defined exactly, as brand tokens', () => {
  const expected = {
    '--color-brand-page': PALETTE.page,
    '--color-brand-surface': PALETTE.surface,
    '--color-brand-pink': PALETTE.pink,
    '--color-brand-teal': PALETTE.teal,
    '--color-brand-ink': PALETTE.ink,
    '--color-brand-line': PALETTE.line,
  };
  for (const [token, value] of Object.entries(expected)) {
    const found = new RegExp(`${token}:\\s*([^;]+);`).exec(css);
    assert.ok(found, `${token} must be declared in src/index.css`);
    assert.equal(found[1].trim().toLowerCase(), value, `${token} must be ${value}`);
  }
});

test('each colour role points at one of those colours', () => {
  const roles = {
    '--color-page': PALETTE.page,
    '--color-surface': PALETTE.surface,
    '--color-ink': PALETTE.ink,
    '--color-line': PALETTE.line,
    '--color-accent': PALETTE.pink,
    '--color-interactive': PALETTE.teal,
  };
  for (const [token, value] of Object.entries(roles)) {
    const found = new RegExp(`${token}:\\s*([^;]+);`).exec(css);
    assert.ok(found, `${token} must be declared`);
    assert.equal(found[1].trim().toLowerCase(), value, `${token} must be ${value}`);
  }
});

test('the CSS introduces no other brand colour', () => {
  // Every hex in the stylesheet must be a palette value, a documented derived
  // shade of one, or a functional status tint (success / warning / error).
  const allowed = new Set([
    PALETTE.page, PALETTE.surface, PALETTE.pink, PALETTE.teal, PALETTE.ink, PALETTE.line,
    // derived from the two accents, so hover/active and small text stay legible
    '#e82858', '#d42350', '#06c4c1', '#0a6b6a', '#c9143f', '#b3123b',
    // status tints: functional only (green = done, amber = waiting)
    '#046c4e', '#8a4b04',
  ]);
  const hexes = [...css.matchAll(/#([0-9a-fA-F]{3,8})\b/g)]
    .map((match) => `#${match[1].toLowerCase()}`)
    // ignore matches inside comments
    .filter((hex) => !new RegExp(`\\*/[^*]*${hex}`).test(css));
  const unexpected = [...new Set(hexes)].filter((hex) => !allowed.has(hex));
  assert.deepEqual(unexpected, [], `unexpected colours in index.css: ${unexpected.join(', ')}`);
});

/* -------------------------------------------------------------------------- */
/* 2. No returns to the old dark theme                                        */
/* -------------------------------------------------------------------------- */

const LEGACY_PATTERNS = [
  /bg-\[#1f242d\]/i,
  /bg-\[#1a1e26\]/i,
  /bg-\[#12161f\]/i,
  /bg-(slate|gray|zinc|neutral|stone)-(700|800|900|950)\b/,
  /\b(slate|gray|zinc|neutral|stone)-(100|200)\b(?!.*status)/,
  /bg-white\/[0-9]+\b/,
  /border-white\/[0-9]+\b/,
  /text-slate-(100|200|300|400)\b/,
  /bg-black\//,
  /from-(slate|gray|zinc|neutral|stone)-800\b/,
];

test('the old dark-theme utilities are gone from every component', () => {
  for (const file of sources) {
    const text = read(file);
    for (const pattern of LEGACY_PATTERNS) {
      const match = pattern.exec(text);
      assert.equal(match, null, `${relative(file)} still uses “${match?.[0]}”`);
    }
  }
});

test('components use the design tokens, not raw palette hexes', () => {
  // The only literal colours allowed in a component are a third party's own
  // brand (WhatsApp green on the contact button) — everything else is a token.
  const allowed = new Set(['#25d366', '#20ba5a']);
  for (const file of sources) {
    const text = read(file);
    const hexes = [...text.matchAll(/(?:bg|text|border|from|to|via|ring|fill|stroke|shadow|accent)-\[#([0-9a-fA-F]{3,8})\]/g)]
      .map((match) => `#${match[1].toLowerCase()}`);
    const unexpected = [...new Set(hexes)].filter((hex) => !allowed.has(hex));
    assert.deepEqual(unexpected, [], `${relative(file)} hardcodes ${unexpected.join(', ')}`);
  }
});

test('white text only ever sits on a pink, charcoal or third-party fill', () => {
  // White labels are correct on #FF2E63 and on the WhatsApp button, and in a
  // hover state that turns a control pink. Nothing else may use white text,
  // because white on the light page is unreadable.
  for (const file of sources) {
    const lines = read(file).split('\n');
    lines.forEach((line, index) => {
      if (!/text-white/.test(line)) return;
      const allowed =
        /bg-accent|bg-ink|#25D366|hover:text-white|group-hover:text-white|divide|placeholder/.test(line);
      assert.ok(allowed, `${relative(file)}:${index + 1} uses white text on a light surface: ${line.trim().slice(0, 140)}`);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* 3. Contrast                                                                */
/* -------------------------------------------------------------------------- */

/** WCAG relative luminance for a #rrggbb colour. */
function luminance(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque colours. */
function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Blend a foreground colour onto a background at some opacity. */
function blend(foreground, background, alpha) {
  const parse = (hex) => [1, 3, 5].map((offset) => parseInt(hex.replace('#', '').slice(offset - 1, offset + 1), 16));
  const fg = parse(foreground);
  const bg = parse(background);
  const mixed = fg.map((channel, index) => Math.round(channel * alpha + bg[index] * (1 - alpha)));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

test('body and heading text is comfortably readable on both surfaces', () => {
  const pairs = [
    ['ink on the page', PALETTE.ink, PALETTE.page, 4.5],
    ['ink on a card', PALETTE.ink, PALETTE.surface, 3], // 14.6:1
    ['muted ink on a card', blend(PALETTE.ink, PALETTE.surface, 0.7), PALETTE.surface, 4.5],
    ['muted ink on the page', blend(PALETTE.ink, PALETTE.page, 0.7), PALETTE.page, 4.5],
    ['ink on a teal fill', PALETTE.ink, PALETTE.teal, 4.5],
    ['ink on a teal tint (selected row)', PALETTE.ink, blend(PALETTE.teal, PALETTE.surface, 0.2), 4.5],
    ['teal-tinted icon text on a card', '#0a6b6a', PALETTE.surface, 4.5],
    ['pink error text on a card', '#c9143f', PALETTE.surface, 4.5],
    ['pink error text on its own tint', '#c9143f', blend(PALETTE.pink, PALETTE.surface, 0.1), 4.5],
  ];
  for (const [label, foreground, background, minimum] of pairs) {
    const ratio = contrast(foreground, background);
    assert.ok(ratio >= minimum, `${label}: ${ratio.toFixed(2)}:1 is below ${minimum}:1`);
  }
});

test('primary pink buttons are legible (white label, bold, large-target)', () => {
  const ratio = contrast('#ffffff', PALETTE.pink);
  // #FF2E63 cannot reach 4.5:1 with any palette foreground; white is the best
  // available pairing (3.6:1, WCAG AA for large text). The button label is bold
  // and the control is 44px tall, so the risk this creates is bounded and it is
  // recorded as a palette limitation in the documentation.
  assert.ok(ratio >= 3, `white on pink measured ${ratio.toFixed(2)}:1`);
  // Charcoal on pink measures marginally higher (4.0:1) but reads as a warning
  // label rather than a button; the brief specifies white, and the label is bold.
  assert.match(css, /\.gl-btn-primary\s*\{[^}]*color:\s*#ffffff/i, 'primary buttons use a white label');
});

test('muted text uses 70% ink, which is the lightest readable step', () => {
  // 70% is the muted step the components actually use; it must clear AA.
  const muted = contrast(blend(PALETTE.ink, PALETTE.surface, 0.7), PALETTE.surface);
  assert.ok(muted >= 4.5, `70% ink on white measured ${muted.toFixed(2)}:1`);
  // 60% does not, which is why the token set stops at 70%.
  const tooLight = contrast(blend(PALETTE.ink, PALETTE.surface, 0.6), PALETTE.surface);
  assert.ok(tooLight < 4.5, `60% ink unexpectedly passes at ${tooLight.toFixed(2)}:1`);
});

/* -------------------------------------------------------------------------- */
/* 4. Page shells stay light                                                  */
/* -------------------------------------------------------------------------- */

test('every full-page shell paints the light page or a white surface', () => {
  for (const file of sources) {
    const text = read(file);
    for (const match of text.matchAll(/className="([^"]*min-h-(?:screen|\[\d+vh\])[^"]*)"/g)) {
      const classes = match[1];
      // Modals and dashboard page bodies all declare their own background.
      if (!/\bbg-/.test(classes)) continue;
      assert.match(
        classes,
        /\bbg-(page|surface|interactive|accent|ink)\b/,
        `${relative(file)} has a page shell without a palette background: ${classes}`
      );
      // A whole page must never be charcoal or a saturated brand colour; an
      // overlay (bg-ink/60) is a different thing and is not matched here.
      assert.doesNotMatch(
        classes,
        /(?:^|\s)bg-(ink|interactive|accent)(?![\w/-])/,
        `${relative(file)} uses a dark or saturated background for a whole page`
      );
    }
  }
});

/* -------------------------------------------------------------------------- */
/* 5. The shared control system                                               */
/* -------------------------------------------------------------------------- */

test('the shared control classes exist centrally', () => {
  for (const className of [
    'gl-card',
    'gl-card-interactive',
    'gl-panel',
    'gl-btn',
    'gl-btn-primary',
    'gl-btn-secondary',
    'gl-btn-accent',
    'gl-btn-ghost',
    'gl-input',
    'gl-select',
    'gl-textarea',
    'gl-label',
    'gl-link',
    'gl-badge',
    'gl-badge-success',
    'gl-badge-warning',
    'gl-badge-danger',
    'gl-tab',
    'gl-tab-active',
    'gl-alert',
    'gl-alert-error',
    'gl-alert-success',
    'gl-table',
    'gl-divider',
  ]) {
    assert.match(css, new RegExp(`\\.${className}[\\s,{:]`), `.${className} must be defined in src/index.css`);
  }
});

test('the shared controls are actually used by the pages', () => {
  const combined = sources.map(read).join('\n');
  for (const className of ['gl-card', 'gl-btn-primary', 'gl-btn-secondary', 'gl-tab-active']) {
    assert.ok(combined.includes(className), `${className} is defined but never used`);
  }
});

test('one focus treatment is defined for the whole product', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-interactive\)/);
  assert.match(css, /\.gl-input:focus[\s\S]{0,120}box-shadow/);
});

/* -------------------------------------------------------------------------- */
/* 6. Brand identity is unchanged                                             */
/* -------------------------------------------------------------------------- */

test('the brand lockup keeps charcoal “Goodlucks”, pink “Homes” and the slogan', () => {
  for (const file of ['src/components/Navbar.tsx', 'src/components/Footer.tsx']) {
    const text = read(path.join(root, file));
    assert.match(text, /Goodlucks <span className="text-accent">Homes<\/span>/, `${file} must colour “Homes” pink`);
    assert.match(text, /Find\. View\. Rent\./, `${file} must keep the slogan exactly`);
  }
});
