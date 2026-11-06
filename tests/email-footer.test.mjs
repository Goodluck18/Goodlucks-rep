import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mailer = fs.readFileSync(path.join(root, 'php-backend/lib/mailer.php'), 'utf8');

test('transactional email social footer uses real PNG logos, not text glyphs', () => {
  assert.match(mailer, /<img src="' \. e\(\$src\)/);
  assert.match(mailer, /alt="' \. e\(\$label\)/);
  assert.match(mailer, /width="22" height="22"/);
  assert.match(mailer, /table role="presentation"/);
  assert.doesNotMatch(mailer, /email_social_icon\('Facebook', 'f'/);
  assert.doesNotMatch(mailer, /email_social_icon\('Instagram', '◎'/);
  assert.doesNotMatch(mailer, /email_social_icon\('TikTok', '♪'/);
});

test('all five configured social destinations remain attached to their matching logos', () => {
  for (const [label, key, asset] of [
    ['Facebook', 'SOCIAL_FACEBOOK_URL', 'facebook'],
    ['Instagram', 'SOCIAL_INSTAGRAM_URL', 'instagram'],
    ['TikTok', 'SOCIAL_TIKTOK_URL', 'tiktok'],
    ['X', 'SOCIAL_X_URL', 'x'],
    ['LinkedIn', 'SOCIAL_LINKEDIN_URL', 'linkedin'],
  ]) {
    assert.match(mailer, new RegExp(`email_social_icon\\('${label}', trim\\(\\(string\\)cfg\\('${key}'`));
    assert.match(mailer, new RegExp(`'${asset}'\\)`));
  }
});

test('email icon image URLs use PNG assets and have descriptive alt text', () => {
  for (const asset of ['facebook-new.png', 'instagram-new.png', 'tiktok.png', 'x.png', 'linkedin.png']) {
    assert.ok(mailer.includes(asset), `missing PNG logo URL: ${asset}`);
  }
  assert.match(mailer, /alt="' \. e\(\$label\)/);
});
