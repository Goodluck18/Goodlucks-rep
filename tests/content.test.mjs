/**
 * Customer-facing copy guards (Task 05).
 *
 * The trust problems this task fixed were all *text*: a homepage that said
 * properties were inspected and "managed", cards that said "Managed by Goodlucks
 * Intermediary", emails that called an approved listing "verified", and a
 * verification screen that printed the server's key configuration to the member.
 * Text drifts back; these checks run over the files themselves, so a sentence
 * that overstates what the platform does cannot be reintroduced quietly.
 *
 * They are deliberately blunt substring checks rather than a content system: the
 * point is to make an unsupported claim fail a test rather than live on a page.
 *
 *   npm run test:content
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** Every file whose text a customer can end up reading. */
function customerFacingFiles() {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(tsx|ts)$/.test(name)) files.push(full);
    }
  };
  walk(join(ROOT, 'src'));
  files.push(join(ROOT, 'index.html'));
  for (const name of readdirSync(join(ROOT, 'php-backend', 'lib'))) {
    if (name.endsWith('.php')) files.push(join(ROOT, 'php-backend', 'lib', name));
  }
  return files;
}

const FILES = customerFacingFiles();

/**
 * Claims the platform's actual processes do not support. These are checked in
 * every file that produces customer copy, including the PHP email/notification
 * bodies.
 */
const CLAIMS = [
  { pattern: /premier/i, because: 'unsupported superlative' },
  { pattern: /number one rental|#1 rental|ghana’s best|ghana's best/i, because: 'unsupported ranking claim' },
  { pattern: /intermediary-managed/i, because: 'Goodlucks does not manage the listings' },
  { pattern: /managed by goodlucks/i, because: 'Goodlucks does not manage the listings' },
  { pattern: /physically inspect/i, because: 'no inspection process exists for every property' },
  { pattern: /physically verify the property/i, because: 'no physical verification process exists' },
  { pattern: /personally inspected/i, because: 'no inspection process exists for every property' },
  { pattern: /fully verified propert|guaranteed safe|guaranteed propert/i, because: 'no such guarantee exists' },
  { pattern: /accompany every viewing|staff accompany/i, because: 'Goodlucks staff do not attend viewings' },
  { pattern: /field team/i, because: 'there is no field team in the implemented flow' },
  { pattern: /verified and is now live/i, because: 'a listing is approved, not verified' },
  { pattern: /supervised physical viewings|hassle-free management/i, because: 'overstates the service' },
];

/**
 * Server internals that must never reach a browser bundle. The PHP sources name
 * these variables on purpose (that is where they are read and logged); the
 * frontend and the served HTML must not.
 */
const INTERNAL = [
  { pattern: /identity-encryption key configured|deployment has no|key not configured/i, because: 'internal configuration detail' },
  { pattern: /IDENTITY_DATA_KEY|GEMINI_API_KEY|DB_DRIVER|APP_ENV/, because: 'internal configuration name' },
];

const isFrontend = (file) => !file.endsWith('.php');

test('no customer-facing file carries an unsupported claim', () => {
  const offenders = [];
  const scan = (file, rules) => {
    const text = readFileSync(file, 'utf8');
    for (const { pattern, because } of rules) {
      const match = pattern.exec(text);
      if (!match) continue;
      // Line of the first match, so the failure points at the sentence.
      const line = text.slice(0, match.index).split('\n').length;
      offenders.push(`${relative(ROOT, file)}:${line} — “${match[0]}” (${because})`);
    }
  };

  for (const file of FILES) {
    scan(file, CLAIMS);
    if (isFrontend(file)) scan(file, INTERNAL);
  }
  assert.deepEqual(offenders, [], `misleading copy found:\n${offenders.join('\n')}`);
});

test('the honest description of the platform is actually present', () => {
  const read = (path) => readFileSync(join(ROOT, path), 'utf8');

  const home = read('src/components/HomeView.tsx');
  // Correction: Agent first wherever both are named.
  assert.match(home, /agents and landlords who list them/i, 'the homepage says who submits the listings');
  assert.match(home, /not an ownership check/i, 'the homepage says what the listing review is not');

  const footer = read('src/components/Footer.tsx');
  assert.match(footer, /we do not own or manage the properties/i, 'the footer states the platform role');

  const about = read('src/components/AboutView.tsx');
  assert.match(about, /not a physical inspection of the property/i, 'the About page is explicit about inspections');

  const verification = read('src/components/VerificationPanel.tsx');
  assert.match(verification, /authorised reviewers/i, 'the verification screen explains who can open documents');
});

test('the verification screen keeps the document handling notes, without server detail', () => {
  const text = readFileSync(join(ROOT, 'src/components/VerificationPanel.tsx'), 'utf8');
  assert.match(text, /never shown on your public profile/i);
  assert.match(text, /retention/i);
  assert.doesNotMatch(text, /process\.env|config\.php|storage_id/i);
});

test('financial wording still separates the landlord and agent viewing fees', () => {
  const card = readFileSync(join(ROOT, 'src/components/PropertyCard.tsx'), 'utf8');
  assert.match(card, /to Goodlucks after viewing/, 'a landlord-submitted fee is paid to Goodlucks after the viewing');
  assert.match(card, /paid on site/, 'an agent-submitted fee is paid on site');

  const about = readFileSync(join(ROOT, 'src/components/AboutView.tsx'), 'utf8');
  assert.match(about, /goodlucks homes sets one general landlord viewing fee/i);
  assert.match(about, /the agent sets that property/i);

  // The 8% platform fee and the agent commission tiers are backend rules; the
  // copy must not invent different numbers.
  const policy = readFileSync(join(ROOT, 'php-backend/lib/landlord_policy.php'), 'utf8');
  assert.match(policy, /8\.0/, 'the platform fee percentage is unchanged');
  const verification = readFileSync(join(ROOT, 'src/components/VerificationPanel.tsx'), 'utf8');
  assert.match(verification, /60/, 'agent tier A percentage is still 60%');
  assert.match(verification, /70/, 'the higher agent tier is still 70%');
});
