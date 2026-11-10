/**
 * Article-HMTL helpers — unit + structural tests (Upgrade 2, A2).
 *
 * The published article finds its property showcase STRUCTURALLY. The reader and
 * the editor share these functions, so the rule is tested once:
 *
 *   - a browser-padded marker (`<div class="gl-showcase"><br></div>`) is still
 *     found, and an exact-string marker is not required;
 *   - text before and after the marker stays on the correct side;
 *   - a duplicated marker is rendered once and stripped in one call;
 *   - a video and the showcase are counted independently, so the two can be
 *     present in one article (they used to displace each other).
 *
 * The component checks are structural: happy-dom has no layout engine and no
 * rich-text editing, so a real "click the button and look at the article" check
 * needs a browser.
 *
 *   npm run test:blog
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  appendBlock,
  embedCounts,
  hasVideo,
  splitShowcase,
  stripShowcase,
} from '../src/lib/blogHtml.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const showcase = '<div class="gl-showcase"></div>';
const video = '<iframe class="gl-video-frame" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>';

/* -------------------------------------------------------------------------- */
/* 1. Finding the showcase                                                     */
/* -------------------------------------------------------------------------- */

test('an exact marker splits the article', () => {
  const split = splitShowcase(`<p>Before.</p>${showcase}<p>After.</p>`);
  assert.equal(split.hasShowcase, true);
  assert.equal(split.before, '<p>Before.</p>');
  assert.equal(split.after, '<p>After.</p>');
});

test('a browser-padded marker is still found', () => {
  // This is the exact normalisation that used to break the cards.
  const split = splitShowcase('<p>Before.</p><div class="gl-showcase"><br></div><p>After.</p>');
  assert.equal(split.hasShowcase, true);
  assert.equal(split.before, '<p>Before.</p>');
  assert.equal(split.after, '<p>After.</p>');
  assert.match(split.inner, /<br>/);
});

test('a marker with extra classes or children is found and removed whole', () => {
  const split = splitShowcase(
    '<p>Before.</p><div class="gl-showcase extra"><div class="card">x</div></div><p>After.</p>'
  );
  assert.equal(split.hasShowcase, true);
  assert.equal(split.before, '<p>Before.</p>');
  assert.equal(split.after, '<p>After.</p>');
  assert.doesNotMatch(split.after + split.before, /gl-showcase/);
});

test('a single-quoted class attribute is accepted as well', () => {
  const split = splitShowcase("<p>Before.</p><div class='gl-showcase'></div><p>After.</p>");
  assert.equal(split.hasShowcase, true);
  assert.equal(split.after, '<p>After.</p>');
});

test('a duplicated marker renders the cards once', () => {
  const split = splitShowcase(`${showcase}<p>Mid.</p><div class="gl-showcase"><br></div>`);
  assert.equal(split.hasShowcase, true);
  assert.equal(split.before, '');
  assert.equal(split.after, '<p>Mid.</p>');
  assert.doesNotMatch(split.after, /gl-showcase/);
});

test('an article without a marker is left untouched', () => {
  const split = splitShowcase('<p>Editorial only.</p>');
  assert.equal(split.hasShowcase, false);
  assert.equal(split.before, '<p>Editorial only.</p>');
  assert.equal(split.after, '');
});

test('the editor-supplied placeholder is honoured when it is present', () => {
  const custom = '<div class="gl-showcase"></div>';
  const split = splitShowcase(`<p>A.</p>${custom}<p>B.</p>`, custom);
  assert.equal(split.hasShowcase, true);
  assert.equal(split.before, '<p>A.</p>');
  assert.equal(split.after, '<p>B.</p>');
});

/* -------------------------------------------------------------------------- */
/* 2. Inserting and stripping blocks                                           */
/* -------------------------------------------------------------------------- */

test('stripping removes every marker', () => {
  const stripped = stripShowcase(`<p>A.</p>${showcase}<p>B.</p><div class="gl-showcase"><br></div>`);
  assert.equal(stripped, '<p>A.</p><p>B.</p>');
});

test('a block is appended at the end of the article', () => {
  assert.equal(appendBlock('<p>A.</p>', showcase), `<p>A.</p>\n${showcase}`);
  assert.equal(appendBlock('', showcase), showcase);
  assert.equal(appendBlock('<p>A.</p>\n\n', showcase), `<p>A.</p>\n${showcase}`);
});

test('a video and a showcase can both be present, in either order', () => {
  const videoThenShowcase = appendBlock(appendBlock('<p>Intro.</p>', video), showcase);
  const showcaseThenVideo = appendBlock(`${showcase}`, video);

  for (const html of [videoThenShowcase, showcaseThenVideo]) {
    const counts = embedCounts(html);
    assert.equal(counts.video, 1);
    assert.equal(counts.showcase, 1);

    const split = splitShowcase(html);
    assert.equal(split.hasShowcase, true);
    // The video survives the split, whichever side of the cards it sits on.
    assert.match(split.before + split.after, /gl-video-frame/);
  }
});

test('the counts are honest about what is missing', () => {
  assert.deepEqual(embedCounts('<p>Plain.</p>'), { video: 0, showcase: 0 });
  assert.deepEqual(embedCounts(`<p>A.</p>${video}`), { video: 1, showcase: 0 });
  assert.deepEqual(embedCounts(`<p>A.</p>${showcase}`), { video: 0, showcase: 1 });
  // A hand-typed iframe the server has not canonicalised yet still counts.
  assert.equal(embedCounts('<iframe src="https://youtu.be/dQw4w9WgXcQ"></iframe>').video, 1);
});

test('hasVideo answers for both canonical and hand-typed embeds', () => {
  assert.equal(hasVideo(video), true);
  assert.equal(hasVideo('<iframe src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></iframe>'), true);
  assert.equal(hasVideo('<p>No video.</p>'), false);
});

/* -------------------------------------------------------------------------- */
/* 3. The shipped components use these rules                                   */
/* -------------------------------------------------------------------------- */

const reader = read('src/components/BlogArticleBody.tsx');
const editor = read('src/components/AdminBlogEditor.tsx');

test('the reader splits structurally instead of matching one exact string', () => {
  assert.match(reader, /splitShowcase\(html, placeholder\)/);
  assert.doesNotMatch(reader, /html\.indexOf\(marker\)/);
  assert.match(reader, /hasShowcase/);
});

test('the editor appends the video and showcase blocks instead of inserting at the caret', () => {
  const youtube = editor.slice(editor.indexOf('const insertYoutube'));
  const showcaseBlock = editor.slice(editor.indexOf('const insertShowcase'));
  assert.match(youtube, /writeContent\(appendBlock/, 'the video is appended deterministically');
  assert.match(showcaseBlock, /stripShowcase\(existing\)/, 'an existing showcase is replaced, not nested');
  assert.match(showcaseBlock, /appendBlock/, 'the showcase is appended deterministically');
  // Neither block may go back through caret-based insertion.
  assert.doesNotMatch(youtube.slice(0, youtube.indexOf('const insertCallout')), /insertHtml\(/);
  assert.doesNotMatch(showcaseBlock.slice(0, showcaseBlock.indexOf('const uploadFeaturedImage')), /insertHtml\(/);
});

test('the editor shows how many of each embed the article holds', () => {
  assert.match(editor, /embedCounts\(content\)/);
  assert.match(editor, /Video: \{embeds\.video\}/);
  assert.match(editor, /Showcase: \{embeds\.showcase\}/);
});

test('ordinary text editing still uses the caret', () => {
  // Bold/italic/lists/links must keep working normally.
  assert.match(editor, /const exec = \(command: string, value\?: string\)/);
  assert.match(editor, /document\.execCommand\(command/);
  assert.match(editor, /const insertHtml = \(html: string\)/);
});
