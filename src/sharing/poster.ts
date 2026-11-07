/**
 * The property poster: layout only, no drawing.
 *
 * The poster is 1080 × 1350 (4:5 — the portrait size WhatsApp status, an
 * Instagram feed post and a Facebook post all accept). It is described here as
 * a list of primitive instructions — rectangles, lines and text runs at absolute
 * coordinates — and executed by `posterRenderer.ts` on a canvas.
 *
 * Why split it: the layout is the part that has to be *right* (the title must
 * not overflow, the price and the period must be the listing's own, the footer
 * must carry the real wordmark, handle and domain). Keeping it pure means the
 * tests can check every string, every coordinate and every overflow rule without
 * a browser, and the renderer has nothing left to decide.
 *
 * The design brief: the photograph is the advertisement (70% of the height), the
 * information block underneath is quiet and precise — price first, then the
 * title, then the location — and the brand strip closes the poster with the
 * wordmark (HOMES in pink), the call to action, the social handle and the
 * domain. No text is placed over the photograph.
 */

import { BRAND_HANDLE, BRAND_PALETTE, BRAND_SOCIALS, POSTER_CALL_TO_ACTION, WORDMARK } from '../config/brand';

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;
/** The photograph band. 945 / 1350 = 70% of the poster height. */
export const POSTER_PHOTO_HEIGHT = 945;

/** Left and right margin of the information block. */
export const PADDING = 64;
/** The hairline between the information block and the brand strip. */
export const DIVIDER_Y = 1216;
/** Nothing may be drawn below this line (a quiet 20px margin at the bottom). */
export const BOTTOM_LIMIT = POSTER_HEIGHT - 20;

export const WORDMARK_BASELINE = 1256;
export const CTA_BASELINE = 1288;
export const SOCIAL_BASELINE = 1316;

/** The font stack the site itself uses (`src/index.css`, `body`). */
export const POSTER_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export type PosterFontWeight = 400 | 500 | 600 | 700 | 800 | 900;

export interface PosterFont {
  size: number;
  weight: PosterFontWeight;
}

/** Width of `text` in this font. `letterSpacing` is extra space added per gap. */
export type MeasureText = (text: string, font: PosterFont, letterSpacing?: number) => number;

export interface PosterInput {
  /** The listing's own title. */
  title: string;
  /** `East Legon` */
  location: string;
  /** `Accra` */
  city: string;
  /** `GH₵ 6,500` — already formatted with the site's money rules. */
  rentLabel: string;
  /** `/month` — derived from the listing, never assumed. */
  periodLabel: string;
  /** `goodlucks.co` — the active site host, from configuration. */
  host: string;
  /** False renders the designed "no photograph" panel instead of a photo. */
  hasPhoto: boolean;
}

export interface PosterRectOp {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export interface PosterLineOp {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  width: number;
}

export interface PosterTextOp {
  kind: 'text';
  text: string;
  /** Left edge, right edge or centre, depending on `align`. */
  x: number;
  /** Baseline of the text. */
  y: number;
  font: PosterFont;
  colour: string;
  align: 'left' | 'right' | 'center';
  letterSpacing?: number;
  /** The width this run was fitted to (tests use it to prove nothing overflows). */
  maxWidth: number;
}

export type PosterOp = PosterRectOp | PosterLineOp | PosterTextOp;

export interface PosterPlan {
  width: number;
  height: number;
  /** Where the photograph (or its placeholder) goes. */
  photo: { x: number; y: number; w: number; h: number };
  ops: PosterOp[];
}

const PRICE_FONT: PosterFont = { size: 64, weight: 800 };
const PERIOD_FONT: PosterFont = { size: 30, weight: 600 };
const LOCATION_FONT: PosterFont = { size: 28, weight: 500 };
const WORDMARK_FONT: PosterFont = { size: 40, weight: 800 };
const DOMAIN_FONT: PosterFont = { size: 26, weight: 700 };
const CTA_FONT: PosterFont = { size: 17, weight: 700 };
const SOCIAL_FONT: PosterFont = { size: 17, weight: 500 };

/** Title sizes tried, largest first, until the block fits above the divider. */
const TITLE_SIZES = [40, 36, 32] as const;

const BAND_TOP = POSTER_PHOTO_HEIGHT + 20;
const BAND_BOTTOM = DIVIDER_Y - 24;

const lineHeightFor = (size: number) => Math.round(size * 1.18);
const baselineOffset = (font: PosterFont) => Math.round(font.size * 0.78);
const descenderOffset = (font: PosterFont) => Math.round(font.size * 0.22);

/**
 * Break `text` into at most `maxLines` lines that fit `maxWidth`.
 *
 * A word longer than the line on its own is broken mid-word rather than allowed
 * to overflow. When even `maxLines` lines are not enough, the last line is cut
 * and ends in an ellipsis, so a 120-character title still produces a tidy poster
 * instead of spilling over the price or the wordmark.
 */
export function wrapText(
  text: string,
  font: PosterFont,
  maxWidth: number,
  measure: MeasureText,
  maxLines = 2,
  letterSpacing = 0
): string[] {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const fits = (value: string) => measure(value, font, letterSpacing) <= maxWidth;
  const lines: string[] = [];
  let current = '';

  for (const word of clean.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }
    if (fits(word)) {
      current = word;
      continue;
    }
    // One word wider than the whole line: break it character by character.
    let chunk = '';
    for (const character of word) {
      const next = chunk + character;
      if (fits(next)) {
        chunk = next;
      } else {
        if (chunk) lines.push(chunk);
        chunk = character;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && !fits(`${last}…`)) {
    last = last.slice(0, -1).trimEnd();
  }
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/** One line, shortened with an ellipsis if it does not fit. */
export function fitLine(
  text: string,
  font: PosterFont,
  maxWidth: number,
  measure: MeasureText,
  letterSpacing = 0
): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (measure(clean, font, letterSpacing) <= maxWidth) return clean;
  let value = clean;
  while (value.length > 1 && measure(`${value}…`, font, letterSpacing) > maxWidth) {
    value = value.slice(0, -1).trimEnd();
  }
  return `${value}…`;
}

/** `Cantonments, Accra` — never `Accra, Accra`, never `, Accra`. */
export function posterPlace(input: Pick<PosterInput, 'location' | 'city'>): string {
  const location = (input.location ?? '').trim();
  const city = (input.city ?? '').trim();
  if (!location && !city) return 'Ghana';
  if (city && !location.toLowerCase().includes(city.toLowerCase())) {
    return location ? `${location}, ${city}` : city;
  }
  return location || city;
}

/**
 * Build the whole poster as drawing instructions.
 *
 * `measure` comes from the rendering context (canvas `measureText`, or a stub in
 * tests), so every decision that depends on text width happens here and can be
 * asserted without pixels.
 */
export function buildPosterPlan(input: PosterInput, measure: MeasureText): PosterPlan {
  const width = POSTER_WIDTH;
  const contentWidth = width - PADDING * 2;
  const ops: PosterOp[] = [];

  // -- Information block background -----------------------------------------
  ops.push({
    kind: 'rect',
    x: 0,
    y: POSTER_PHOTO_HEIGHT,
    w: width,
    h: POSTER_HEIGHT - POSTER_PHOTO_HEIGHT,
    fill: BRAND_PALETTE.surface,
  });

  // -- Title: choose the largest size that still fits the block --------------
  const place = posterPlace(input);
  const maxBlock = BAND_BOTTOM - BAND_TOP;

  let titleFont: PosterFont = { size: TITLE_SIZES[TITLE_SIZES.length - 1], weight: 700 };
  let titleLines: string[] = [];
  let blockHeight = 0;

  const priceBlockHeight = 6 + 12 + baselineOffset(PRICE_FONT) + 16; // rule, gap, price, descender
  for (const size of TITLE_SIZES) {
    const candidate: PosterFont = { size, weight: 700 };
    const lines = wrapText(input.title, candidate, contentWidth, measure, 2);
    const height =
      priceBlockHeight +
      10 +
      lines.length * lineHeightFor(size) +
      12 +
      LOCATION_FONT.size +
      descenderOffset(LOCATION_FONT);
    titleFont = candidate;
    titleLines = lines;
    blockHeight = height;
    if (height <= maxBlock) break;
  }

  // Centre the block in the white band: a one-line title then sits in the
  // middle of the space instead of hugging the photograph.
  const startY = BAND_TOP + Math.max(8, Math.round((maxBlock - blockHeight) / 2));

  // -- Price and period ------------------------------------------------------
  // A short pink rule above the price is the only decoration on the poster: a
  // brand highlight rather than an ornament.
  const accentY = startY;
  ops.push({ kind: 'rect', x: PADDING, y: accentY, w: 56, h: 6, fill: BRAND_PALETTE.pink });

  const priceBaseline = accentY + 6 + 12 + baselineOffset(PRICE_FONT);
  const priceText = (input.rentLabel ?? '').trim();
  ops.push({
    kind: 'text',
    text: priceText,
    x: PADDING,
    y: priceBaseline,
    font: PRICE_FONT,
    colour: BRAND_PALETTE.ink,
    align: 'left',
    maxWidth: contentWidth,
  });

  // The period sits on the price baseline, after it, in the quieter grey so the
  // amount stays the loudest thing in the block.
  const priceWidth = measure(priceText, PRICE_FONT);
  ops.push({
    kind: 'text',
    text: (input.periodLabel ?? '').trim(),
    x: PADDING + priceWidth + 10,
    y: priceBaseline,
    font: PERIOD_FONT,
    colour: BRAND_PALETTE.muted,
    align: 'left',
    maxWidth: Math.max(0, contentWidth - priceWidth - 10),
  });

  // -- Title -----------------------------------------------------------------
  let cursor = priceBaseline + 16 + 10;
  const titleLineHeight = lineHeightFor(titleFont.size);
  for (const line of titleLines) {
    cursor += titleLineHeight;
    ops.push({
      kind: 'text',
      text: line,
      x: PADDING,
      y: cursor - descenderOffset(titleFont),
      font: titleFont,
      colour: BRAND_PALETTE.ink,
      align: 'left',
      maxWidth: contentWidth,
    });
  }

  // -- Location --------------------------------------------------------------
  const locationText = fitLine(place, LOCATION_FONT, contentWidth, measure);
  ops.push({
    kind: 'text',
    text: locationText,
    x: PADDING,
    y: cursor + 12 + baselineOffset(LOCATION_FONT),
    font: LOCATION_FONT,
    colour: BRAND_PALETTE.muted,
    align: 'left',
    maxWidth: contentWidth,
  });

  // -- Brand strip -----------------------------------------------------------
  ops.push({
    kind: 'line',
    x1: PADDING,
    y1: DIVIDER_Y,
    x2: width - PADDING,
    y2: DIVIDER_Y,
    stroke: BRAND_PALETTE.line,
    width: 2,
  });

  const firstPart = WORDMARK.first.text;
  ops.push({
    kind: 'text',
    text: firstPart,
    x: PADDING,
    y: WORDMARK_BASELINE,
    font: WORDMARK_FONT,
    colour: WORDMARK.first.colour,
    align: 'left',
    maxWidth: contentWidth,
  });
  ops.push({
    kind: 'text',
    // The leading space separates the two words; the colour change is what
    // makes HOMES pink.
    text: ` ${WORDMARK.second.text}`,
    x: PADDING + measure(firstPart, WORDMARK_FONT),
    y: WORDMARK_BASELINE,
    font: WORDMARK_FONT,
    colour: WORDMARK.second.colour,
    align: 'left',
    maxWidth: contentWidth,
  });

  ops.push({
    kind: 'text',
    text: fitLine(input.host, DOMAIN_FONT, contentWidth / 2, measure),
    x: width - PADDING,
    y: WORDMARK_BASELINE,
    font: DOMAIN_FONT,
    colour: BRAND_PALETTE.ink,
    align: 'right',
    maxWidth: contentWidth / 2,
  });

  ops.push({
    kind: 'text',
    text: POSTER_CALL_TO_ACTION,
    x: PADDING,
    y: CTA_BASELINE,
    font: CTA_FONT,
    colour: BRAND_PALETTE.ink,
    align: 'left',
    letterSpacing: 1.4,
    maxWidth: contentWidth,
  });

  const socials = `${BRAND_SOCIALS.map((social) => social.name).join(' · ')} · ${BRAND_HANDLE}`;
  ops.push({
    kind: 'text',
    text: fitLine(socials, SOCIAL_FONT, contentWidth, measure),
    x: PADDING,
    y: SOCIAL_BASELINE,
    font: SOCIAL_FONT,
    colour: BRAND_PALETTE.muted,
    align: 'left',
    maxWidth: contentWidth,
  });

  return {
    width,
    height: POSTER_HEIGHT,
    photo: { x: 0, y: 0, w: width, h: POSTER_PHOTO_HEIGHT },
    ops,
  };
}

/** Every text run in the plan, in drawing order. */
export function planTextLines(plan: PosterPlan): string[] {
  return plan.ops.filter((op): op is PosterTextOp => op.kind === 'text').map((op) => op.text);
}

/**
 * The design invariants the tests enforce: nothing on the photograph, nothing
 * below the safe bottom margin, nothing off-canvas.
 */
export function planProblems(plan: PosterPlan): string[] {
  const problems: string[] = [];
  for (const op of plan.ops) {
    if (op.kind === 'text') {
      if (op.y > BOTTOM_LIMIT) problems.push(`text below the safe area: "${op.text}" @ ${op.y}`);
      if (op.y < POSTER_PHOTO_HEIGHT) problems.push(`text over the photograph: "${op.text}" @ ${op.y}`);
      if (op.x < 0 || op.x > plan.width) problems.push(`text off-canvas: "${op.text}" @ ${op.x}`);
    }
    if (op.kind === 'rect' && (op.x < 0 || op.y < 0 || op.x + op.w > plan.width || op.y + op.h > plan.height)) {
      problems.push(`rect outside the canvas at ${op.x},${op.y}`);
    }
  }
  return problems;
}
