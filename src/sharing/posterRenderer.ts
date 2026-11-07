/**
 * Draws the property poster onto a canvas and exports it as a PNG.
 *
 * `poster.ts` decides the layout; this file only executes it. Everything that
 * touches the browser (canvas, images, fonts) is behind an injectable boundary
 * so the whole pipeline can be exercised in the test runner, which has no
 * canvas implementation.
 *
 * Three things this file is careful about, because they are the ways a generated
 * image usually goes wrong:
 *
 * 1. **Blank exports.** The photograph is fetched with `crossOrigin =
 *    "anonymous"` and awaited before anything is drawn; fonts are awaited; and a
 *    failure to load the photo is not an error — it falls back to the designed
 *    placeholder panel. The export never starts on an empty canvas.
 * 2. **Tainted canvases.** Only `http(s)` image URLs are ever drawn. A
 *    `data:`, `blob:` (other than our own) or `javascript:` value in a listing
 *    record cannot be injected into a poster that we then hand to `toBlob`.
 * 3. **Leaks.** The caller revokes the object URL when the preview closes; this
 *    module only creates it.
 */

import type { Property } from '../types';
import { BRAND_PALETTE } from '../config/brand';
import {
  POSTER_FONT_STACK,
  POSTER_HEIGHT,
  POSTER_PHOTO_HEIGHT,
  POSTER_WIDTH,
  buildPosterPlan,
  type MeasureText,
  type PosterFont,
  type PosterPlan,
  type PosterTextOp,
} from './poster';
import { moneyLabel, propertyPrimaryPhoto, rentPeriodLabel } from '../routing/propertyUrl';
import { siteHost } from '../config/site';

/** The subset of `CanvasRenderingContext2D` this file uses. */
export interface PosterContext2D {
  font: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  textAlign: 'left' | 'right' | 'center';
  textBaseline: 'alphabetic' | 'middle' | 'top';
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}

/** The subset of `HTMLCanvasElement` this file uses. */
export interface PosterCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): PosterContext2D | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

export interface PosterRenderDeps {
  /** Creates a canvas of exactly this size. Defaults to `document.createElement`. */
  createCanvas?: (width: number, height: number) => PosterCanvas;
  /** Loads an image. Defaults to an `<img>` with CORS. Resolves `null` on failure. */
  loadImage?: (src: string) => Promise<unknown | null>;
  /** Waits for the page's fonts. Defaults to `document.fonts.ready` (bounded). */
  waitForFonts?: () => Promise<void>;
}

export type PosterErrorCode = 'no-canvas' | 'export-failed';

export class PosterError extends Error {
  code: PosterErrorCode;
  constructor(code: PosterErrorCode, message: string) {
    super(message);
    this.name = 'PosterError';
    this.code = code;
  }
}

export interface PosterArtifact {
  blob: Blob;
  /** `image/png` */
  type: string;
  width: number;
  height: number;
  /** A safe, descriptive download name. */
  fileName: string;
  /** `URL.createObjectURL(blob)` — the caller must revoke it. */
  objectUrl: string;
  /** The photograph was missing or unusable: the placeholder panel was drawn. */
  usedPlaceholder: boolean;
  /** The exact layout that was drawn (handy for tests and debugging). */
  plan: PosterPlan;
}

const IMAGE_TIMEOUT_MS = 10_000;
const FONT_TIMEOUT_MS = 2_500;

/** `700 40px ui-sans-serif, …` — the string canvas expects. */
export function posterFontString(font: PosterFont): string {
  return `${font.weight} ${font.size}px ${POSTER_FONT_STACK}`;
}

/** Only absolute http(s) images are ever drawn. */
export function isSafeImageUrl(url: string): boolean {
  const value = (url ?? '').trim();
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  // A site-relative upload path is resolved by propertyMainImage() before it
  // reaches us; anything else (data:, blob:, javascript:) is refused.
  return value.startsWith('/') && !value.startsWith('//');
}

/** `goodlucks-homes-prop-1-poster.png` */
export function posterFileName(property: { id: string }): string {
  const safeId = (property.id ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `goodlucks-homes-${safeId || 'property'}-poster.png`;
}

/** The canvas text measurer, including letter spacing. */
export function contextMeasure(ctx: PosterContext2D): MeasureText {
  return (text, font, letterSpacing = 0) => {
    ctx.font = posterFontString(font);
    const width = ctx.measureText(text).width;
    return width + Math.max(0, text.length - 1) * letterSpacing;
  };
}

/** Draw one text run, honouring the plan's alignment and letter spacing. */
export function drawTextRun(
  ctx: PosterContext2D,
  op: PosterTextOp,
  measure: MeasureText
): void {
  ctx.font = posterFontString(op.font);
  ctx.fillStyle = op.colour;
  ctx.textBaseline = 'alphabetic';

  const spacing = op.letterSpacing ?? 0;
  if (spacing <= 0) {
    ctx.textAlign = op.align;
    ctx.fillText(op.text, op.x, op.y);
    return;
  }

  // Letter-spaced text (the call to action) is drawn per character: canvas has
  // no portable letterSpacing, and the look depends on it.
  const total = measure(op.text, op.font, spacing);
  let x = op.align === 'right' ? op.x - total : op.align === 'center' ? op.x - total / 2 : op.x;
  ctx.textAlign = 'left';
  for (const character of op.text) {
    ctx.fillText(character, x, op.y);
    x += measure(character, op.font) + spacing;
  }
}

/** Draw the photograph with a centre-cover crop — never stretched. */
export function drawCoverImage(
  ctx: PosterContext2D,
  image: { width: number; height: number },
  rect: { x: number; y: number; w: number; h: number }
): void {
  const imageWidth = Number(image.width) || rect.w;
  const imageHeight = Number(image.height) || rect.h;
  const scale = Math.max(rect.w / imageWidth, rect.h / imageHeight);
  const sourceWidth = rect.w / scale;
  const sourceHeight = rect.h / scale;
  const sourceX = Math.max(0, (imageWidth - sourceWidth) / 2);
  const sourceY = Math.max(0, (imageHeight - sourceHeight) / 2);
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    rect.x,
    rect.y,
    rect.w,
    rect.h
  );
}

/**
 * The designed stand-in when a listing has no usable photograph.
 *
 * Deliberately not a stock photo and not another listing's picture: a calm grey
 * panel with the brand rule and a plain statement. The rest of the poster (price,
 * title, location, wordmark, domain) is unchanged, so the poster is still
 * shareable and still says what it is.
 */
export function drawPhotoPlaceholder(ctx: PosterContext2D, measure: MeasureText): void {
  const w = POSTER_WIDTH;
  const h = POSTER_PHOTO_HEIGHT;
  ctx.fillStyle = BRAND_PALETTE.page;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = BRAND_PALETTE.line;
  ctx.fillRect(0, h - 4, w, 4);

  const centreX = w / 2;
  const centreY = h / 2;
  ctx.fillStyle = BRAND_PALETTE.teal;
  ctx.fillRect(centreX - 32, centreY - 66, 64, 6);

  const font: PosterFont = { size: 30, weight: 600 };
  drawTextRun(
    ctx,
    {
      kind: 'text',
      text: 'Photograph coming soon',
      x: centreX,
      y: centreY - 6,
      font,
      colour: BRAND_PALETTE.ink,
      align: 'center',
      maxWidth: w - 160,
    },
    measure
  );

  drawTextRun(
    ctx,
    {
      kind: 'text',
      text: 'GOODLUCKS HOMES',
      x: centreX,
      y: centreY + 44,
      font: { size: 18, weight: 700 },
      colour: BRAND_PALETTE.muted,
      align: 'center',
      letterSpacing: 3,
      maxWidth: w - 160,
    },
    measure
  );
}

/** Draw a completed plan onto a 2D context. */
export function drawPosterPlan(
  ctx: PosterContext2D,
  plan: PosterPlan,
  image: { width: number; height: number } | null,
  measure: MeasureText
): { usedPlaceholder: boolean } {
  ctx.fillStyle = BRAND_PALETTE.surface;
  ctx.fillRect(0, 0, plan.width, plan.height);

  const usedPlaceholder = !image;
  if (image) {
    drawCoverImage(ctx, image, plan.photo);
  } else {
    drawPhotoPlaceholder(ctx, measure);
  }

  for (const op of plan.ops) {
    if (op.kind === 'rect') {
      ctx.fillStyle = op.fill;
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.kind === 'line') {
      ctx.strokeStyle = op.stroke;
      ctx.lineWidth = op.width;
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y1);
      ctx.lineTo(op.x2, op.y2);
      ctx.stroke();
    } else {
      drawTextRun(ctx, op, measure);
    }
  }

  return { usedPlaceholder };
}

/* -------------------------------------------------------------------------- */
/* Browser defaults                                                           */
/* -------------------------------------------------------------------------- */

function defaultCreateCanvas(width: number, height: number): PosterCanvas {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas as unknown as PosterCanvas;
}

function defaultLoadImage(src: string): Promise<unknown | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    let settled = false;
    const finish = (value: unknown | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), IMAGE_TIMEOUT_MS);
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    try {
      image.src = src;
    } catch {
      finish(null);
    }
  });
}

async function defaultWaitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.ready?.then !== 'function') {
    return;
  }
  await Promise.race([
    document.fonts.ready,
    new Promise<void>((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS)),
  ]);
}

function canvasToBlob(canvas: PosterCanvas): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new PosterError('export-failed', 'The poster could not be exported as a PNG.'));
      }, 'image/png');
    } catch (error) {
      reject(error instanceof Error ? error : new PosterError('export-failed', 'The poster could not be exported.'));
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Public entry point                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Everything the poster needs, read from the listing the page is already
 * showing. Nothing is fetched from the network here beyond the photograph.
 */
export function posterInputFor(property: Property, host = siteHost()) {
  return {
    title: property.title,
    location: property.location,
    city: property.city,
    rentLabel: moneyLabel(property.rentGhs),
    periodLabel: rentPeriodLabel(property),
    host,
    hasPhoto: true,
  };
}

/**
 * Generate the 1080 × 1350 PNG for one listing.
 *
 * Rejects only when the browser cannot produce a canvas or the PNG export
 * fails; a missing or unfetchable photograph is handled by the placeholder.
 */
export async function generatePropertyPoster(
  property: Property,
  deps: PosterRenderDeps = {},
  host = siteHost()
): Promise<PosterArtifact> {
  const createCanvas = deps.createCanvas ?? defaultCreateCanvas;
  const loadImage = deps.loadImage ?? defaultLoadImage;
  const waitForFonts = deps.waitForFonts ?? defaultWaitForFonts;

  await waitForFonts();

  let canvas: PosterCanvas;
  try {
    canvas = createCanvas(POSTER_WIDTH, POSTER_HEIGHT);
  } catch {
    throw new PosterError('no-canvas', 'This browser cannot create the poster.');
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new PosterError('no-canvas', 'This browser cannot draw the poster.');
  }

  const measure = contextMeasure(ctx);

  // The listing's own primary photograph — the same first usable image the
  // property page shows. A listing with no usable photo reports `null` and gets
  // the designed panel; the site's default share card is never passed off as a
  // photograph of this property.
  const primary = propertyPrimaryPhoto(property) ?? '';
  const candidate = isSafeImageUrl(primary) ? primary : '';

  let image: { width: number; height: number } | null = null;
  if (candidate) {
    const loaded = await loadImage(candidate);
    if (loaded && typeof loaded === 'object') {
      image = loaded as { width: number; height: number };
    }
  }

  const plan = buildPosterPlan({ ...posterInputFor(property, host), hasPhoto: image !== null }, measure);
  const { usedPlaceholder } = drawPosterPlan(ctx, plan, image, measure);

  const blob = await canvasToBlob(canvas);

  return {
    blob,
    type: blob.type || 'image/png',
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    fileName: posterFileName(property),
    objectUrl: URL.createObjectURL(blob),
    usedPlaceholder,
    plan,
  };
}
