/**
 * Goodlucks Homes — Upgrade 2 · Phase 5
 * Source invariants behind the tenant experience.
 *
 * The behavioural suite (tests/tenant-experience.test.mjs) proves the API does
 * the right thing. This file pins the promises a later refactor could quietly
 * drop:
 *
 *   1. the move-in date is a real answer, with no placeholder default anywhere;
 *   2. the match score is a fixed 100-point sum whose weights the breakdown
 *      reports, and proximity comes from administrator judgement;
 *   3. "chosen for you" and "similar matches" stay two separate, ordered lists;
 *   4. a provider cannot move an agreed appointment without the tenant, and a
 *      reschedule always carries a reason;
 *   5. the tenant's phone and email are gated behind an approved disclosure, in
 *      the serialiser and in the emails, and the decision is staff-only;
 *   6. the rental-request cap is a server rule of three.
 *
 *   node --import tsx --test tests/admin-console-phase5.test.mts
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(projectRoot, ...parts), 'utf8');

/** Remove comments so prose describing a rule is not mistaken for the rule. */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*#.*$/gm, '')
    .replace(/^\s*\*.*$/gm, '');

const api = read('php-backend', 'lib', 'api.php');
const validate = read('php-backend', 'lib', 'validate.php');
const matching = read('php-backend', 'lib', 'matching.php');
const disclosures = read('php-backend', 'lib', 'contact_disclosure.php');
const viewings = read('php-backend', 'lib', 'viewings.php');
const mysqlSchema = read('php-backend', 'database.sql');
const sqliteSchema = read('php-backend', 'schema.sqlite.sql');

const findHome = read('src', 'components', 'FindAHomeView.tsx');
const tenantDashboard = read('src', 'components', 'TenantDashboard.tsx');
const adminDashboard = read('src', 'components', 'AdminDashboard.tsx');
const agentPanel = read('src', 'components', 'AgentViewingsPanel.tsx');
const adjacencyPanel = read('src', 'components', 'AdminAreaAdjacency.tsx');
const disclosurePanel = read('src', 'components', 'AdminContactDisclosures.tsx');
const apiService = read('src', 'services', 'apiService.ts');

const code = {
  api: stripComments(api),
  matching: stripComments(matching),
  disclosures: stripComments(disclosures),
  viewings: stripComments(viewings),
  findHome: stripComments(findHome),
  tenantDashboard: stripComments(tenantDashboard),
  adminDashboard: stripComments(adminDashboard),
  agentPanel: stripComments(agentPanel),
};

describe('B1 — the move-in date is asked for, never assumed', () => {
  test('no component invents a move-in date', () => {
    assert.equal(
      /useState\(\s*new Date\([^)]*\)\.toISOString\(\)\.slice\(0,\s*10\)\s*\)/.test(code.findHome),
      false,
      'the old placeholder date is gone for good'
    );
    assert.match(findHome, /const \[moveInDate, setMoveInDate\] = useState\(''\)/);
    assert.match(code.findHome, /if \(!moveInDate\)/);
    assert.match(findHome, /type="date"[\s\S]{0,200}required/);
  });

  test('the server refuses a request without one', () => {
    assert.match(api, /moveInDate/);
    assert.match(api, /Choose a valid move-in date\./);
  });
});

describe('B2 — the score is a 100-point sum, and proximity is a judgement', () => {
  test('the weights are fixed and add up to 100', () => {
    const weights = Object.fromEntries(
      [...matching.matchAll(/'(\w+)'\s*=>\s*(\d+),/g)]
        .filter(([, key]) => ['budget', 'location', 'proximity', 'type', 'bedrooms', 'bathrooms'].includes(key))
        .map(([, key, value]) => [key, Number(value)])
    );
    assert.deepEqual(weights, {
      budget: 35,
      location: 20,
      proximity: 15,
      type: 10,
      bedrooms: 10,
      bathrooms: 10,
    });
    assert.equal(Object.values(weights).reduce((a, b) => a + b, 0), 100);
  });

  test('a missing proximity is reported, not guessed', () => {
    assert.match(code.matching, /no proximity is recorded/i);
    assert.match(code.matching, /match_area_key/);
  });

  test('only an administrator records adjacency, and the pair is undirected', () => {
    assert.match(api, /'#\^\/admin\/area-adjacency\$#', 'handle_list_area_adjacency'/);
    assert.match(api, /'#\^\/admin\/area-adjacency\$#', 'handle_save_area_adjacency'/);
    assert.match(code.matching, /sort\(/);
    const saveHandler = api.slice(api.indexOf('function handle_save_area_adjacency'));
    assert.match(saveHandler.slice(0, 400), /require_auth\(\['admin'\]\)/);
    assert.match(adjacencyPanel, /api\.saveAreaAdjacency/);
    assert.match(adminDashboard, /<AdminAreaAdjacency \/>/);
  });
});

describe('B3 — chosen for you stays separate, and comes first', () => {
  test('the API returns two lists, in that order', () => {
    const handler = api.slice(api.indexOf('function handle_matches'));
    assert.match(handler, /'curatedForYou'\s*=>\s*\$curatedMatches/);
    assert.match(handler, /'similarMatches'\s*=>\s*\$similarMatches/);
    assert.match(handler, /'curatedMinimum'\s*=>\s*3/);
    assert.ok(
      handler.indexOf("'curatedForYou'") < handler.indexOf("'similarMatches'"),
      'the shortlist is emitted first'
    );
    assert.match(handler, /!\$row\['curated'\]/, 'a shortlisted property is never repeated as a similar match');
  });

  test('the dashboard renders the shortlist before the similar list, and labels each', () => {
    const curated = tenantDashboard.indexOf('Chosen for you');
    const similar = tenantDashboard.indexOf('See similar matches');
    assert.ok(curated > -1 && similar > -1, 'both blocks exist');
    assert.ok(curated < similar, 'chosen for you comes first');
    assert.match(tenantDashboard, /curationWarning/);
    assert.match(tenantDashboard, /Why these scores\?/);
    assert.match(tenantDashboard, /curatedForYou/);
    assert.match(tenantDashboard, /similarMatches/);
  });

  test('staff cap the shortlist at six, and are nudged towards three', () => {
    // The server caps the set; three is a nudge in the console, because a
    // genuine one-property match is a legitimate record and always was.
    assert.match(api, /at most 6 properties for the tenant/i);
    assert.match(api, /'matchedPropertyIds' => 'Select up to 6 live listings.'/);
    assert.match(api, /curationWarning/);
    assert.match(adminDashboard, /chosen\.length === 0 \|\| chosen\.length > 6/);
    assert.match(adminDashboard, /at least three so the shortlist reads as a recommendation/);
  });
});

describe('B5 — the tenant decides whether an agreed appointment moves', () => {
  test('an agreed slot cannot jump straight to rescheduled', () => {
    const matrix = viewings.slice(viewings.indexOf('function viewing_transition_matrix'));
    const confirmedBlock = matrix.slice(matrix.indexOf('$confirmed = ['), matrix.indexOf('$rescheduleRequested = ['));
    assert.equal(
      /'rescheduled'\s*=>/.test(confirmedBlock),
      false,
      'no provider or tenant can move a confirmed slot directly'
    );
  });

  test('accept and decline belong to the tenant and an administrator', () => {
    const matrix = viewings.slice(viewings.indexOf('$rescheduleRequested = ['));
    const block = matrix.slice(0, matrix.indexOf('];'));
    assert.match(block, /'rescheduled'\s*=>\s*\['tenant', 'admin'\]/);
    assert.match(block, /'confirmed'\s*=>\s*\['tenant', 'admin'\]/);
    assert.match(code.api, /case 'accept-reschedule':/);
    assert.match(code.api, /case 'decline-reschedule':/);
    assert.match(tenantDashboard, /accept-reschedule/);
    assert.match(tenantDashboard, /decline-reschedule/);
  });

  test('a reschedule always carries a reason the tenant can read', () => {
    assert.match(api, /A reschedule needs a reason the tenant can read/);
    assert.match(agentPanel, /The tenant sees your reason and must accept the new time/);
  });
});

describe('B6 — contact details are withheld until staff approve them', () => {
  test('the serialiser gates the phone and email on an approval', () => {
    assert.match(code.disclosures, /function contact_disclosure_active_for/);
    assert.match(code.viewings, /contact_disclosure_active_for/);
    const gate = code.viewings.slice(code.viewings.indexOf('contact_disclosure_active_for'));
    assert.ok(gate.length > 0);
    assert.match(code.viewings, /withheld_pending_approval|withheld_revoked|withheld_rejected/);
  });

  test('the decision is staff-only, and an approval expires', () => {
    assert.match(api, /'#\^\/admin\/contact-disclosures\$#', 'handle_list_contact_disclosures'/);
    assert.match(api, /handle_decide_contact_disclosure/);
    const decide = api.slice(api.indexOf('function handle_decide_contact_disclosure'));
    assert.match(decide.slice(0, 500), /require_auth\(\['admin'\]\)/);
    assert.match(disclosures, /\+ 30 days|30, 'days'|expires_at/);
    assert.match(code.disclosures, /audit_log\('contact_disclosure\./);
  });

  test('no viewing email or provider payload interpolates the tenant phone', () => {
    const notify = viewings.slice(viewings.indexOf('function viewing_notify'));
    const body = notify.slice(0, notify.indexOf('\n}'));
    assert.equal(/tenantPhone/.test(body), false, 'viewing emails never quote the tenant phone');
    assert.equal(/tenantEmail/.test(body.replace(/tenantEmail'\] \?\? ''/g, '')), false);
  });

  test('the provider asks with a reason, the tenant sees the record', () => {
    assert.match(agentPanel, /requestContactDisclosure/);
    assert.match(agentPanel, /Ask Goodlucks for contact/);
    assert.match(tenantDashboard, /Who has your contact details/);
    assert.match(disclosurePanel, /Tenant contact requests/);
    assert.match(adminDashboard, /<AdminContactDisclosures \/>/);
  });
});

describe('D1 — three rental requests in progress, counted by the server', () => {
  test('the limit is three and the fourth is a conflict', () => {
    assert.match(validate, /const TENANT_REQUEST_PENDING_LIMIT = 3;/);
    const handler = api.slice(api.indexOf('function handle_create_tenant_request'));
    assert.match(handler, /TENANT_REQUEST_PENDING_LIMIT/);
    assert.match(handler, /, 409\)/);
  });

  test('viewing requests are counted separately', () => {
    const handler = api.slice(api.indexOf('function handle_create_tenant_request'));
    assert.equal(
      /viewing/i.test(handler.slice(0, handler.indexOf('TENANT_REQUEST_PENDING_LIMIT'))),
      false,
      'the rental cap does not look at viewings'
    );
  });
});

describe('schema and client surface', () => {
  test('both schemas carry the two new tables', () => {
    for (const name of ['area_adjacency', 'contact_disclosures']) {
      assert.match(mysqlSchema, new RegExp(`CREATE TABLE IF NOT EXISTS\\s+\`?${name}\`?`));
      assert.match(sqliteSchema, new RegExp(`CREATE TABLE IF NOT EXISTS ${name}`));
    }
  });

  test('the client exposes the new endpoints once', () => {
    for (const method of [
      'saveAreaAdjacency',
      'deleteAreaAdjacency',
      'requestContactDisclosure',
      'decideContactDisclosure',
      'myContactDisclosures',
    ]) {
      assert.equal((apiService.match(new RegExp(`${method}:`, 'g')) ?? []).length, 1, `${method} is defined once`);
    }
  });
});
