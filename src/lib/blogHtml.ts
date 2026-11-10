/**
 * Structural helpers for article HTML (Upgrade 2, A2).
 *
 * Why this module exists
 * ----------------------
 * An article can hold a YouTube video AND the live property showcase. The two
 * used to fight each other because the showcase was located by an exact string
 * match — `<div class="gl-showcase"></div>` — and the browser pads an empty
 * `<div>` inside a `contentEditable` with `<br>`. Once the browser had added
 * that padding, the marker stopped matching, the cards disappeared from the
 * article, and inserting a video made it worse (browsers treat an `<iframe>` as
 * an atomic control and normalise the surrounding markup).
 *
 * The rule here is deliberately tolerant: any `<div>` whose class list CONTAINS
 * `gl-showcase` is the showcase, whatever padding, whitespace or children it has
 * picked up. The server normalises the same block back to the canonical empty
 * div on save (`blog_normalize_showcase_blocks()` in
 * php-backend/lib/blog_content.php), so both sides agree.
 *
 * Nothing here parses HTML into a tree, trusts it, or sanitises it: the server's
 * `blog_sanitize_html()` remains the only guard. These functions only decide
 * where the cards sit and how many embed blocks an article contains.
 */

/** The class the server and the editor both use for the showcase marker. */
export const SHOWCASE_CLASS = 'gl-showcase';

/** The class the server gives a canonical YouTube embed. */
export const VIDEO_CLASS = 'gl-video-frame';

export interface ShowcaseSplit {
  /** Article HTML before the showcase block. */
  before: string;
  /** Article HTML after the showcase block. */
  after: string;
  /** True when the article contains a showcase marker. */
  hasShowcase: boolean;
  /** What sat inside the block (browser padding, usually `<br>`). */
  inner: string;
}

/** An embed the server produced from a YouTube link (or a bare iframe). */
const VIDEO_BLOCK = /<iframe\b[^>]*\bsrc\s*=\s*"[^"]*"[^>]*>[\s\S]*?<\/iframe\s*>/i;

/** Class list of an opening `<div>` tag, lower-cased. */
function divClasses(tag: string): string[] {
  const match = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
  const value = match ? match[1] || match[2] || '' : '';
  return value.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Locate the first showcase block and its matching `</div>`.
 *
 * The tag walk counts nested `<div>`s, so a block with children is removed
 * whole rather than only up to its first inner close tag — the same rule the
 * server applies in `blog_showcase_block_spans()`.
 */
function findShowcaseBlock(html: string): { start: number; end: number; inner: string } | null {
  const opener = /<div\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(html)) !== null) {
    if (!divClasses(match[0]).includes(SHOWCASE_CLASS)) continue;

    const openEnd = match.index + match[0].length;
    const tag = /<div\b[^>]*>|<\/div\s*>/gi;
    tag.lastIndex = openEnd;

    let depth = 1;
    let innerEnd = html.length;
    let end = html.length;
    let found: RegExpExecArray | null;
    while (depth > 0 && (found = tag.exec(html)) !== null) {
      if (/^<\/div/i.test(found[0])) {
        depth -= 1;
        if (depth === 0) {
          innerEnd = found.index;
          end = found.index + found[0].length;
        }
      } else {
        depth += 1;
      }
    }

    return { start: match.index, end, inner: html.slice(openEnd, innerEnd) };
  }

  return null;
}

/** Find the first showcase block, however the browser padded it. */
function findShowcase(
  html: string,
  placeholder?: string
): { start: number; end: number; inner: string } | null {
  // The exact placeholder the editor inserted is still the cheapest match when
  // the browser has not rewritten it — only its own block is acceptable there.
  if (placeholder) {
    const exact = html.indexOf(placeholder);
    if (exact >= 0) {
      return { start: exact, end: exact + placeholder.length, inner: '' };
    }
  }

  return findShowcaseBlock(html);
}

/**
 * Split an article body around its property showcase.
 *
 * A second showcase block (possible in hand-edited HTML) is dropped from the
 * rendered text: an article has one showcase, and the server keeps only the
 * first on save.
 */
export function splitShowcase(html: string, placeholder?: string): ShowcaseSplit {
  const found = findShowcase(html, placeholder);
  if (!found) return { before: html, after: '', hasShowcase: false, inner: '' };

  return {
    before: html.slice(0, found.start),
    after: stripShowcase(html.slice(found.end)),
    hasShowcase: true,
    inner: found.inner,
  };
}

/** Remove every showcase block from an article body (used when re-inserting). */
export function stripShowcase(html: string): string {
  let next = html;
  // A fixed number of passes keeps this O(1) in practice while handling the
  // (rare) duplicated marker; `splitShowcase` already tolerates leftovers.
  for (let index = 0; index < 20; index += 1) {
    const found = findShowcaseBlock(next);
    if (!found) break;
    next = next.slice(0, found.start) + next.slice(found.end);
  }
  return next;
}

/**
 * The embed blocks in an article body, in order.
 *
 * Used by the editor's structure hint ("Video: 1 · Showcase: 1") so an
 * administrator can see that both blocks are present without hunting through
 * the markup. Counts only — nothing is inferred about what the reader sees.
 */
export function embedCounts(html: string): { video: number; showcase: number } {
  const videoMatches = html.match(new RegExp(VIDEO_BLOCK.source, 'gi')) ?? [];
  // A hand-typed `<iframe>` is still one embed even before the server
  // canonicalises it, so fall back to any iframe when no canonical one exists.
  const video = videoMatches.length > 0 ? videoMatches.length : (html.match(/<iframe\b/gi) ?? []).length;

  return {
    video,
    showcase: countShowcase(html),
  };
}

function countShowcase(html: string): number {
  let rest = html;
  let count = 0;
  for (let index = 0; index < 20; index += 1) {
    const found = findShowcaseBlock(rest);
    if (!found) break;
    count += 1;
    rest = rest.slice(found.end);
  }
  return count;
}

/**
 * Append a block to the end of an article body.
 *
 * Deterministic by design (Upgrade 2, A2): inserting at the caret meant a video
 * could land inside the showcase div, or the showcase inside the video, and both
 * then failed to render. Blocks are appended at the end of the article body, in
 * the order the administrator adds them, and the editor states that plainly.
 */
export function appendBlock(html: string, block: string): string {
  const trimmed = html.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n${block}` : block;
}

/** True when the body already contains a video embed. */
export function hasVideo(html: string): boolean {
  return /<iframe\b/i.test(html);
}
