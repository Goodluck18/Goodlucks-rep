/**
 * Share Property as Image — poster, sharing and short-link tests.
 *
 * The poster is generated with the browser Canvas API, which the test runner does
 * not have. Everything is therefore behind the seam these tests use: the layout
 * is a pure function (`buildPosterPlan`), the renderer takes its canvas, image
 * loader and font waiter as dependencies, and the sharing helpers take the
 * navigator and document. So this file exercises the *real* code paths — the same
 * layout maths, the same drawing calls, the same share/copy/download decisions —
 * with a recording canvas and a stub navigator.
 *
 * What this file cannot prove: how the finished PNG looks, and how WhatsApp,
 * Facebook or Instagram render it. Those need a browser and a real share target;
 * see the implementation report.
 *
 *   npm run test:sharing
 */

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { runPhpScript } from '../scripts/php.mjs';
import {
  moneyLabel,
  rentPeriodLabel,
  propertyShortPath,
  propertyShortUrl,
  propertyCanonicalUrl,
  propertyIsShareable,
  propertyPrimaryPhoto,
} from '../src/routing/propertyUrl.ts';
import { SITE_ORIGIN, siteHost } from '../src/config/site.ts';
import {
  BRAND_HANDLE,
  BRAND_PALETTE,
  BRAND_SOCIALS,
  POSTER_CALL_TO_ACTION,
  WORDMARK,
} from '../src/config/brand.ts';
import {
  POSTER_HEIGHT,
  POSTER_PHOTO_HEIGHT,
  POSTER_WIDTH,
  buildPosterPlan,
  fitLine,
  planProblems,
  planTextLines,
  posterPlace,
  wrapText,
  type MeasureText,
  type PosterFont,
} from '../src/sharing/poster.ts';
import {
  PosterError,
  drawPosterPlan,
  generatePropertyPoster,
  isSafeImageUrl,
  posterFileName,
  type PosterCanvas,
  type PosterContext2D,
} from '../src/sharing/posterRenderer.ts';
import {
  SHARE_CAPTION,
  canSharePosterFile,
  copyToClipboard,
  downloadBlob,
  sharePoster,
  sharePropertyLink,
  shareText,
} from '../src/sharing/shareActions.ts';
import type { Property } from '../src/types.ts';

const projectRoot = path.resolve(import.meta.dirname, '..');

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** A rough but stable text measurer: no font engine, just proportions. */
const stubMeasure: MeasureText = (text, font, letterSpacing = 0) =>
  text.length * font.size * (font.weight >= 700 ? 0.56 : 0.5) + Math.max(0, text.length - 1) * letterSpacing;

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: 'prop-1',
    landlordId: '',
    title: 'Pearl Executive 3-Bedroom Apartment',
    location: 'Cantonments',
    city: 'Accra',
    rentGhs: 6500,
    bedrooms: 3,
    bathrooms: 2,
    propertyType: 'Apartment',
    status: 'active',
    images: ['https://images.example.com/gl-1.jpg'],
    description: '',
    amenities: [],
    nearbyPlaces: [],
    availability: 'Available Now',
    viewsCount: 0,
    enquiriesCount: 0,
    ...overrides,
  } as Property;
}

function planFor(overrides: Partial<Property> = {}) {
  const value = property(overrides);
  return buildPosterPlan(
    {
      title: value.title,
      location: value.location,
      city: value.city,
      rentLabel: moneyLabel(value.rentGhs),
      periodLabel: rentPeriodLabel(value),
      host: siteHost(),
      hasPhoto: true,
    },
    stubMeasure
  );
}

/** A canvas that records every call, so the renderer can be inspected. */
function recordingCanvas(size: { width?: number; height?: number } = {}) {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const context: PosterContext2D = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: (...args) => calls.push({ op: 'fillRect', args }),
    beginPath: () => calls.push({ op: 'beginPath', args: [] }),
    moveTo: (...args) => calls.push({ op: 'moveTo', args }),
    lineTo: (...args) => calls.push({ op: 'lineTo', args }),
    stroke: () => calls.push({ op: 'stroke', args: [] }),
    fillText: (text, x, y) => calls.push({ op: 'fillText', args: [text, x, y] }),
    measureText: (text) => ({ width: stubMeasure(text, fontFrom(context.font)) }),
    drawImage: (...args) => calls.push({ op: 'drawImage', args }),
  };

  const canvas: PosterCanvas = {
    width: size.width ?? POSTER_WIDTH,
    height: size.height ?? POSTER_HEIGHT,
    getContext: () => context,
    toBlob: (callback, type) => {
      calls.push({ op: 'toBlob', args: [type] });
      callback(new Blob(['poster'], { type: type || 'image/png' }));
    },
  };
  return { canvas, context, calls };
}

function fontFrom(font: string): PosterFont {
  const match = /(\d00)\s+(\d+)px/.exec(font);
  return { weight: (match ? Number(match[1]) : 700) as PosterFont['weight'], size: match ? Number(match[2]) : 32 };
}

const textsOf = (calls: Array<{ op: string; args: unknown[] }>) =>
  calls.filter((call) => call.op === 'fillText').map((call) => String(call.args[0]));

/* -------------------------------------------------------------------------- */
/* Poster layout                                                              */
/* -------------------------------------------------------------------------- */

describe('poster layout', () => {
  test('is 1080 × 1350 with the photograph occupying 70% of the height', () => {
    const plan = planFor();
    assert.equal(plan.width, 1080);
    assert.equal(plan.height, 1350);
    assert.equal(POSTER_PHOTO_HEIGHT, 945);
    assert.deepEqual(plan.photo, { x: 0, y: 0, w: 1080, h: 945 });
    const ratio = POSTER_PHOTO_HEIGHT / POSTER_HEIGHT;
    assert.ok(ratio >= 0.7 && ratio <= 0.75, `photograph band is ${(ratio * 100).toFixed(1)}%`);
  });

  test('carries the listing’s own title, price, period and location', () => {
    const lines = planTextLines(planFor());
    assert.ok(lines.includes('Pearl Executive 3-Bedroom Apartment'), lines.join(' | '));
    assert.ok(lines.includes('GH₵ 6,500'));
    assert.ok(lines.includes('/month'));
    assert.ok(lines.includes('Cantonments, Accra'));
  });

  test('an updated price changes the poster', () => {
    const before = planTextLines(planFor({ rentGhs: 6500 }));
    const after = planTextLines(planFor({ rentGhs: 8200 }));
    assert.ok(before.includes('GH₵ 6,500'));
    assert.ok(after.includes('GH₵ 8,200'));
    assert.ok(!after.includes('GH₵ 6,500'), 'the old price must not survive');
  });

  test('prints the payment period the listing carries, not a hardcoded month', () => {
    assert.equal(rentPeriodLabel(property()), '/month');
    assert.equal(rentPeriodLabel(property({ rentPeriod: 'year' })), '/year');
    assert.equal(rentPeriodLabel(property({ rentPeriod: 'week' })), '/week');
    assert.equal(rentPeriodLabel(property({ rentPeriod: 'day' })), '/day');
    // An unknown value must not invent a period.
    assert.equal(rentPeriodLabel(property({ rentPeriod: 'fortnight' })), '/month');

    const yearly = planTextLines(planFor({ rentPeriod: 'year', rentGhs: 72000 }));
    assert.ok(yearly.includes('/year'), 'a yearly listing prints /year');
    assert.ok(!yearly.includes('/month'), 'a yearly listing is never labelled monthly');
  });

  test('branding footer: wordmark with HOMES in pink, CTA, handle, socials and domain', () => {
    const plan = planFor();
    const lines = planTextLines(plan);
    assert.ok(lines.includes(WORDMARK.first.text), 'GOODLUCKS half of the wordmark');
    assert.ok(lines.includes(` ${WORDMARK.second.text}`), 'HOMES half of the wordmark');
    assert.ok(lines.includes(POSTER_CALL_TO_ACTION));
    const socials = lines.find((line) => line.includes(BRAND_HANDLE)) ?? '';
    for (const social of BRAND_SOCIALS) {
      assert.ok(socials.includes(social.name), `${social.name} must appear in the footer`);
    }
    assert.ok(lines.includes(siteHost()), 'the active domain is on the poster');
    assert.equal(WORDMARK.second.colour, BRAND_PALETTE.pink, 'HOMES is pink');

    const wordmarkOps = plan.ops.filter(
      (op) => op.kind === 'text' && (op.text === WORDMARK.first.text || op.text === ` ${WORDMARK.second.text}`)
    );
    assert.equal(wordmarkOps.length, 2);
    const pink = wordmarkOps.find((op) => op.kind === 'text' && op.text === ` ${WORDMARK.second.text}`);
    const ink = wordmarkOps.find((op) => op.kind === 'text' && op.text === WORDMARK.first.text);
    assert.equal(pink && pink.kind === 'text' ? pink.colour : null, BRAND_PALETTE.pink);
    assert.equal(ink && ink.kind === 'text' ? ink.colour : null, BRAND_PALETTE.ink);
  });

  test('keeps text off the photograph and inside the safe area', () => {
    assert.deepEqual(planProblems(planFor()), []);
    for (const op of planFor().ops) {
      if (op.kind !== 'text') continue;
      assert.ok(op.y >= POSTER_PHOTO_HEIGHT, `"${op.text}" is drawn over the photo`);
      assert.ok(op.y <= POSTER_HEIGHT - 20, `"${op.text}" is below the safe area`);
      assert.ok(stubMeasure(op.text, op.font, op.letterSpacing ?? 0) <= op.maxWidth + 0.001, `"${op.text}" overflows`);
    }
  });

  test('a very long title wraps to two lines and is ellipsised, never overflowing', () => {
    const long = landProperty();
    const plan = buildPosterPlan(
      {
        title: long.title,
        location: long.location,
        city: long.city,
        rentLabel: moneyLabel(long.rentGhs),
        periodLabel: '/month',
        host: 'goodlucks.co',
        hasPhoto: true,
      },
      stubMeasure
    );
    const lines = planTextLines(plan);
    const titleRuns = plan.ops.filter(
      (op) => op.kind === 'text' && (op.text.includes('Harbour') || op.text.includes('…'))
    );
    assert.ok(titleRuns.length >= 1 && titleRuns.length <= 2, `title used ${titleRuns.length} lines`);
    assert.ok(lines.some((line) => line.endsWith('…')), 'a 120-character title is ellipsised');
    assert.deepEqual(planProblems(plan), []);
    for (const op of plan.ops) {
      if (op.kind === 'text') {
        assert.ok(stubMeasure(op.text, op.font, op.letterSpacing ?? 0) <= op.maxWidth + 0.001, `overflow: ${op.text}`);
      }
    }
  });

  test('a long location is shortened to one line that fits', () => {
    const value = property({ location: 'East Legon Hills, Adjacent To The New Junction, Near The Mall' });
    const plan = planFor({ location: value.location });
    const location = plan.ops.find((op) => op.kind === 'text' && op.text.includes('East Legon Hills'));
    assert.ok(location && location.kind === 'text');
    assert.equal(location.align, 'left');
    assert.ok(stubMeasure(location.text, location.font) <= location.maxWidth);
  });

  test('every title length produces a valid plan', () => {
    const titles = [
      'Flat',
      'Two bedroom apartment',
      'Modern 3-Bedroom House',
      'Spacious Family Home With A Large Garden And A Private Driveway',
      'A'.repeat(60),
      'Three bedroom apartment with a balcony overlooking the community park and a dedicated parking space',
      'Executive 4 bedroom townhouse with staff quarters, borehole water and standby generator installed',
      'x'.repeat(200),
    ];
    for (const title of titles) {
      const plan = planFor({ title });
      assert.deepEqual(planProblems(plan), [], `problems for title: ${title}`);
    }
  });

  test('long location names and missing fields never leave the place blank', () => {
    assert.equal(posterPlace({ location: 'Cantonments', city: 'Accra' }), 'Cantonments, Accra');
    assert.equal(posterPlace({ location: 'Accra', city: 'Accra' }), 'Accra');
    assert.equal(posterPlace({ location: '', city: 'Accra' }), 'Accra');
    assert.equal(posterPlace({ location: '', city: '' }), 'Ghana');
  });

  test('wrapText and fitLine behave under pressure', () => {
    const font: PosterFont = { size: 40, weight: 700 };
    const lines = wrapText('one two three four five six seven eight nine ten', font, 300, stubMeasure, 2);
    assert.equal(lines.length, 2);
    assert.ok(lines[1].endsWith('…'));
    const broken = wrapText('Supercalifragilisticexpialidocious', font, 120, stubMeasure, 1);
    assert.equal(broken.length, 1);
    assert.ok(stubMeasure(broken[0], font) <= 120);
    assert.equal(fitLine('short', font, 1000, stubMeasure), 'short');
    assert.ok(fitLine('a very long location name indeed', font, 200, stubMeasure).endsWith('…'));
  });
});

/** A deliberately awkward listing used by several tests. */
function landProperty(): Property {
  return property({
    id: 'prop-long',
    title: 'Executive 4 Bedroom Townhouse With Staff Quarters, Borehole Water And Standby Generator Installed',
    location: 'East Legon Hills',
    city: 'Accra',
    rentGhs: 12500,
  });
}

/* -------------------------------------------------------------------------- */
/* Renderer                                                                   */
/* -------------------------------------------------------------------------- */

describe('poster renderer', () => {
  const stubImage = { width: 2000, height: 1000, src: 'x' };

  const renderDeps = (overrides: Record<string, unknown> = {}) => ({
    createCanvas: () => recordingCanvas().canvas,
    loadImage: async () => stubImage,
    waitForFonts: async () => undefined,
    ...overrides,
  });

  test('creates a 1080 × 1350 canvas and exports a PNG', async () => {
    const created: Array<{ w: number; h: number }> = [];
    const recorded = recordingCanvas();
    const artifact = await generatePropertyPoster(
      property(),
      renderDeps({
        createCanvas: (w: number, h: number) => {
          created.push({ w, h });
          return recorded.canvas;
        },
      }),
      'goodlucks.co'
    );
    assert.deepEqual(created, [{ w: 1080, h: 1350 }]);
    assert.equal(artifact.width, 1080);
    assert.equal(artifact.height, 1350);
    assert.equal(artifact.type, 'image/png');
    assert.equal(artifact.usedPlaceholder, false);
    assert.ok(recorded.calls.some((call) => call.op === 'toBlob' && call.args[0] === 'image/png'));
  });

  test('draws the photograph with a centre-cover crop, never stretched', async () => {
    const recorded = recordingCanvas();
    await generatePropertyPoster(
      property(),
      renderDeps({ createCanvas: () => recorded.canvas }),
      'goodlucks.co'
    );
    const draw = recorded.calls.find((call) => call.op === 'drawImage');
    assert.ok(draw, 'the photograph is drawn');
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = draw!.args as number[];
    assert.deepEqual([dx, dy, dw, dh], [0, 0, 1080, 945]);
    // 2000×1000 into a 1080×945 box: the height decides the scale, so the crop
    // keeps the full height and takes a 1143-wide slice from the centre.
    assert.ok(Math.abs(sh - 1000) < 0.001, `source height ${sh}`);
    assert.ok(Math.abs(sw - (1000 * 1080) / 945) < 0.001, `source width ${sw}`);
    assert.ok(Math.abs(sx - (2000 - sw) / 2) < 0.001, 'crop is centred');
    assert.ok(Math.abs(sy) < 0.001);
  });

  test('uses the listing’s first usable photograph', async () => {
    const requested: string[] = [];
    await generatePropertyPoster(
      property({ images: ['', '//cdn.example.com/x.jpg', 'https://images.example.com/second.jpg'] }),
      renderDeps({
        loadImage: async (src: string) => {
          requested.push(src);
          return stubImage;
        },
      }),
      'goodlucks.co'
    );
    assert.deepEqual(requested, ['https://images.example.com/second.jpg']);
  });

  test('a listing without a photograph gets the designed placeholder, not another property’s image', async () => {
    const recorded = recordingCanvas();
    let loadCalls = 0;
    const artifact = await generatePropertyPoster(
      property({ images: [] }),
      renderDeps({
        createCanvas: () => recorded.canvas,
        loadImage: async () => {
          loadCalls += 1;
          return stubImage;
        },
      }),
      'goodlucks.co'
    );
    assert.equal(loadCalls, 0, 'nothing is fetched when there is no image');
    assert.equal(artifact.usedPlaceholder, true);
    assert.equal(recorded.calls.filter((call) => call.op === 'drawImage').length, 0);
    assert.ok(textsOf(recorded.calls).includes('Photograph coming soon'));
    // The poster still carries the real listing information.
    assert.ok(textsOf(recorded.calls).includes('Pearl Executive 3-Bedroom Apartment'));
  });

  test('a photograph that fails to load falls back to the placeholder instead of failing', async () => {
    const artifact = await generatePropertyPoster(
      property(),
      renderDeps({ loadImage: async () => null }),
      'goodlucks.co'
    );
    assert.equal(artifact.usedPlaceholder, true);
    assert.ok(artifact.blob.size > 0);
  });

  test('refuses unsafe image values (no arbitrary URL injection)', async () => {
    let loadCalls = 0;
    const artifact = await generatePropertyPoster(
      property({ images: ['data:image/svg+xml;base64,AAAA', 'javascript:alert(1)'] }),
      renderDeps({
        loadImage: async () => {
          loadCalls += 1;
          return stubImage;
        },
      }),
      'goodlucks.co'
    );
    assert.equal(loadCalls, 0);
    assert.equal(artifact.usedPlaceholder, true);
    assert.equal(isSafeImageUrl('https://images.example.com/a.jpg'), true);
    assert.equal(isSafeImageUrl('/api/uploads/a.jpg'), true);
    assert.equal(isSafeImageUrl('data:image/png;base64,AAAA'), false);
    assert.equal(isSafeImageUrl('javascript:alert(1)'), false);
  });

  test('reports a browser that cannot draw instead of exporting a blank image', async () => {
    await assert.rejects(
      () =>
        generatePropertyPoster(
          property(),
          renderDeps({
            createCanvas: () =>
              ({
                width: 1080,
                height: 1350,
                getContext: () => null,
                toBlob: () => undefined,
              }) as unknown as PosterCanvas,
          }),
          'goodlucks.co'
        ),
      (error: unknown) => error instanceof PosterError && error.code === 'no-canvas'
    );
  });

  test('reports a failed PNG export', async () => {
    const canvas = recordingCanvas().canvas;
    await assert.rejects(
      () =>
        generatePropertyPoster(
          property(),
          renderDeps({
            createCanvas: () =>
              ({
                ...canvas,
                toBlob: (callback: (blob: Blob | null) => void) => callback(null),
              }) as unknown as PosterCanvas,
          }),
          'goodlucks.co'
        ),
      (error: unknown) => error instanceof PosterError && error.code === 'export-failed'
    );
  });

  test('names the file after the property', () => {
    assert.equal(posterFileName({ id: 'prop-1' }), 'goodlucks-homes-prop-1-poster.png');
    assert.equal(posterFileName({ id: 'PROP/../../etc' }), 'goodlucks-homes-prop-etc-poster.png');
  });

  test('drawPosterPlan paints the brand strip, the price and the full wordmark', () => {
    const recorded = recordingCanvas();
    const plan = planFor();
    const measure = (text: string, font: PosterFont, spacing = 0) =>
      stubMeasure(text, font, spacing);
    drawPosterPlan(recorded.context, plan, stubImage, measure);
    const texts = textsOf(recorded.calls);
    for (const expected of ['GH₵ 6,500', '/month', 'Cantonments, Accra', siteHost()]) {
      assert.ok(texts.includes(expected), `missing "${expected}"`);
    }
    // Letter-spaced runs (the call to action) are drawn character by character,
    // so they appear as their individual characters in drawing order.
    const singleCharacters = texts.filter((text) => text.length === 1).join('');
    assert.ok(singleCharacters.includes(POSTER_CALL_TO_ACTION), 'the call to action is drawn');
    const filled = recorded.calls.filter((call) => call.op === 'fillRect').length;
    assert.ok(filled >= 2, 'background, block and accent rule are filled');
  });
});

/* -------------------------------------------------------------------------- */
/* Sharing                                                                    */
/* -------------------------------------------------------------------------- */

describe('sharing', () => {
  const shortUrl = propertyShortUrl(property());

  test('the caption is one neutral line and the link — nothing else', () => {
    assert.equal(SHARE_CAPTION, 'View this property here:');
    assert.equal(shareText(shortUrl), `View this property here:\n${shortUrl}`);
    assert.ok(!/[!]{2,}|hashtag|#\w+/.test(shareText(shortUrl)), 'no hashtags or sales copy');
  });

  test('a file-capable browser gets the image, the title and the short link', async () => {
    const shared: any[] = [];
    const nav = {
      canShare: (data: { files?: unknown[] }) => Array.isArray(data.files) && data.files.length === 1,
      share: async (data: any) => {
        shared.push(data);
      },
    };
    const result = await sharePoster({
      nav,
      createFile: () => ({ name: 'poster.png' }),
      fileName: 'poster.png',
      title: 'Pearl Executive 3-Bedroom Apartment',
      shortUrl,
    });
    assert.equal(result.outcome, 'shared');
    assert.equal(result.fileAttached, true);
    assert.equal(shared.length, 1);
    assert.equal(shared[0].files.length, 1);
    assert.equal(shared[0].title, 'Pearl Executive 3-Bedroom Apartment');
    assert.equal(shared[0].text, `View this property here:\n${shortUrl}`);
  });

  test('a browser without file sharing reports "unsupported" instead of failing silently', async () => {
    let shareCalls = 0;
    const nav = { canShare: () => false, share: async () => void (shareCalls += 1) };
    const result = await sharePoster({
      nav,
      createFile: () => ({}),
      fileName: 'poster.png',
      title: 'x',
      shortUrl,
    });
    assert.equal(result.outcome, 'unsupported');
    assert.equal(shareCalls, 0);

    const noApi = await sharePoster({
      nav: {},
      createFile: () => ({}),
      fileName: 'poster.png',
      title: 'x',
      shortUrl,
    });
    assert.equal(noApi.outcome, 'unsupported');
    assert.equal(canSharePosterFile({ canShare: () => { throw new Error('boom'); } }, {}), false);
  });

  test('a cancelled share sheet is not an error', async () => {
    const nav = {
      canShare: () => true,
      share: async () => {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        throw error;
      },
    };
    const result = await sharePoster({
      nav,
      createFile: () => ({}),
      fileName: 'poster.png',
      title: 'x',
      shortUrl,
    });
    assert.equal(result.outcome, 'cancelled');
  });

  test('a share that throws for another reason is reported as failed', async () => {
    const nav = {
      canShare: () => true,
      share: async () => {
        throw new Error('device busy');
      },
    };
    const result = await sharePoster({
      nav,
      createFile: () => ({}),
      fileName: 'poster.png',
      title: 'x',
      shortUrl,
    });
    assert.equal(result.outcome, 'failed');
  });

  test('sharing the property link keeps the original behaviour', async () => {
    const canonical = propertyCanonicalUrl(property());
    const shared: any[] = [];
    const withShare = await sharePropertyLink(
      { nav: { share: async (data: any) => void shared.push(data) }, title: 'T', text: 'X', url: canonical },
      async () => false
    );
    assert.equal(withShare, 'shared');
    assert.equal(shared[0].url, canonical);

    const cancelled = await sharePropertyLink(
      {
        nav: {
          share: async () => {
            const error = new Error('cancel');
            error.name = 'AbortError';
            throw error;
          },
        },
        title: 'T',
        text: 'X',
        url: canonical,
      },
      async () => true
    );
    assert.equal(cancelled, 'cancelled');

    const copied = await sharePropertyLink({ nav: {}, title: 'T', text: 'X', url: canonical }, async () => true);
    assert.equal(copied, 'copied');

    const failed = await sharePropertyLink({ nav: {}, title: 'T', text: 'X', url: canonical }, async () => false);
    assert.equal(failed, 'failed');

    const afterError = await sharePropertyLink(
      {
        nav: {
          share: async () => {
            throw new Error('no target');
          },
        },
        title: 'T',
        text: 'X',
        url: canonical,
      },
      async () => true
    );
    assert.equal(afterError, 'copied', 'a thrown share falls back to the clipboard');
  });

  test('copying a link uses the clipboard when it can and a text area when it cannot', async () => {
    const written: string[] = [];
    assert.equal(
      await copyToClipboard('https://goodlucks.co/p/prop-1', { clipboard: { writeText: async (t) => void written.push(t) } }, undefined),
      true
    );
    assert.deepEqual(written, ['https://goodlucks.co/p/prop-1']);

    const appended: string[] = [];
    const fakeDoc = {
      body: {
        appendChild: (node: any) => appended.push(node.value),
        removeChild: () => undefined,
      },
      createElement: () => ({ style: {}, setAttribute: () => undefined, select: () => undefined, value: '' }),
      execCommand: (command: string) => command === 'copy',
    } as unknown as Document;
    assert.equal(await copyToClipboard('short', {}, fakeDoc), true);

    const brokenDoc = {
      body: { appendChild: () => { throw new Error('nope'); }, removeChild: () => undefined },
      createElement: () => ({}),
    } as unknown as Document;
    assert.equal(await copyToClipboard('short', {}, brokenDoc), false);
    assert.equal(await copyToClipboard('short', {}, undefined), false);
  });

  test('downloading saves the PNG under its own name and cleans the URL up', async () => {
    const clicked: Array<{ href: string; download: string }> = [];
    const revoked: string[] = [];
    const fakeDoc = {
      body: { appendChild: () => undefined, removeChild: () => undefined },
      createElement: () => ({
        set href(value: string) {
          this._href = value;
        },
        get href() {
          return this._href;
        },
        set download(value: string) {
          this._download = value;
        },
        get download() {
          return this._download;
        },
        rel: '',
        click() {
          clicked.push({ href: this._href, download: this._download });
        },
        _href: '',
        _download: '',
      }),
    } as unknown as Document;

    const blob = new Blob(['png'], { type: 'image/png' });
    const saved = downloadBlob(blob, 'goodlucks-homes-prop-1-poster.png', fakeDoc, () => 'blob:poster', (url) => revoked.push(url));
    assert.equal(saved, true);
    assert.deepEqual(clicked, [{ href: 'blob:poster', download: 'goodlucks-homes-prop-1-poster.png' }]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(revoked, ['blob:poster'], 'the object URL is revoked after the download starts');

    assert.equal(downloadBlob(blob, 'x.png', undefined), false);
    assert.equal(
      downloadBlob(blob, 'x.png', fakeDoc, () => {
        throw new Error('no blob support');
      }),
      false
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Short links                                                                */
/* -------------------------------------------------------------------------- */

describe('short property links', () => {
  test('use the stable id, not the slug, so a retitle cannot break them', () => {
    const original = property();
    const retitled = property({ title: 'Completely Different Title', rentGhs: 9000, location: 'East Legon' });
    assert.equal(propertyShortPath(original), '/p/prop-1');
    assert.equal(propertyShortPath(retitled), '/p/prop-1');
    assert.equal(propertyShortUrl(original), `${SITE_ORIGIN}/p/prop-1`);
    assert.notEqual(propertyCanonicalUrl(original), propertyCanonicalUrl(retitled), 'the canonical URL follows the title');
  });

  test('only a published listing is shareable', () => {
    assert.equal(propertyIsShareable(property()), true);
    for (const status of ['pending', 'rented', 'archived', 'rejected', '']) {
      assert.equal(propertyIsShareable(property({ status } as Partial<Property>)), false, status);
    }
  });

  test('the main photograph is the first usable one, and the site default is not a photograph', () => {
    assert.equal(propertyPrimaryPhoto(property()), 'https://images.example.com/gl-1.jpg');
    assert.equal(propertyPrimaryPhoto(property({ images: [] })), null);
    assert.equal(propertyPrimaryPhoto(property({ images: [] })), null);
  });

  test('PHP builds the same short link, and reads the payment period the same way', () => {
    const fixtures = [
      { id: 'prop-1', title: 'Pearl Executive 3-Bedroom Apartment', location: 'Cantonments', city: 'Accra', rent_ghs: 6500, images: [] },
      { id: 'prop-abc123', title: 'Two Bedroom Flat', location: 'East Legon', city: 'Accra', rent_ghs: 3200, images: [] },
      { id: 'prop-year', title: 'Family House', location: 'Adenta', city: 'Accra', rent_ghs: 48000, rent_period: 'year', images: [] },
      { id: 'prop-odd', title: 'Studio', location: 'Osu', city: 'Accra', rent_ghs: 2500, rent_period: 'fortnight', images: [] },
    ];
    const file = path.join(projectRoot, '.data', `sharing-fixtures-${process.pid}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(fixtures));

    const result = runPhpScript('tests/property-slug.php', [file], {});
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.length, fixtures.length);

    for (const [index, row] of fixtures.entries()) {
      const php = output[index];
      const local = { id: row.id } as { id: string };
      assert.equal(php.short_path, propertyShortPath(local), `short path differs for ${row.id}`);
      assert.equal(php.short_url, propertyShortUrl(local), `short URL differs for ${row.id}`);
      const expectedPeriod = ['month', 'year', 'week', 'day'].includes(String(row.rent_period))
        ? `/${row.rent_period}`
        : '/month';
      assert.equal(php.rent_period, expectedPeriod, `period differs for ${row.id}`);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Brand + domain configuration                                               */
/* -------------------------------------------------------------------------- */

describe('brand and domain configuration', () => {
  test('the poster palette is the site design system, not a second one', () => {
    const css = fs.readFileSync(path.join(projectRoot, 'src', 'index.css'), 'utf8');
    const token = (name: string) => {
      const match = new RegExp(`--color-brand-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
      return match ? match[1].toUpperCase() : null;
    };
    assert.equal(BRAND_PALETTE.pink.toUpperCase(), token('pink'));
    assert.equal(BRAND_PALETTE.teal.toUpperCase(), token('teal'));
    assert.equal(BRAND_PALETTE.ink.toUpperCase(), token('ink'));
    assert.equal(BRAND_PALETTE.line.toUpperCase(), token('line'));
    assert.equal(BRAND_PALETTE.surface.toUpperCase(), token('surface'));
    assert.equal(BRAND_PALETTE.page.toUpperCase(), token('page'));
    assert.deepEqual(Object.values(WORDMARK).map((part) => part.colour.toUpperCase()), [
      BRAND_PALETTE.ink.toUpperCase(),
      BRAND_PALETTE.pink.toUpperCase(),
    ]);
  });

  test('the official production domain is goodlucks.co and nothing hardcodes it into the poster', () => {
    assert.equal(SITE_ORIGIN, 'https://goodlucks.co');
    assert.equal(siteHost(), 'goodlucks.co');
    // Comments may mention the domain; a *string literal* must not exist in
    // either the layout or the renderer — the host always arrives as a value.
    const literal = /['"`]https?:\/\/goodlucks\.(co|net)/;
    for (const file of ['src/sharing/poster.ts', 'src/sharing/posterRenderer.ts', 'src/sharing/shareActions.ts']) {
      const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
      assert.ok(!literal.test(source), `${file} hardcodes a domain`);
    }
  });

  test('no configuration still advertises the retired domain', () => {
    const files = [
      'index.html',
      'public/robots.txt',
      'php-backend/config.php',
      'php-backend/.env.example',
      'src/config/site.ts',
    ];
    for (const relative of files) {
      const content = fs.readFileSync(path.join(projectRoot, relative), 'utf8');
      assert.ok(!content.includes('rent.goodlucks.co'), `${relative} still names the old domain`);
    }
  });
});
