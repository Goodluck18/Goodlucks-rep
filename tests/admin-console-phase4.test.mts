/**
 * Goodlucks Homes — Upgrade 2 · Phase 4 (A9)
 * Source checks that keep the fee-policy and provider-tier promises from eroding.
 *
 * The behavioural suite (tests/fee-policies-phase4.test.mjs) drives the API; this
 * file pins the invariants that a careless refactor could quietly remove:
 *
 *   1. an event carries what changed, and both schemas + the migration agree;
 *   2. deletion is capability-gated, arithmetically guarded and audited;
 *   3. there is no route, client call or control that assigns an agent tier;
 *   4. the console shows the trail readably and offers delete only for drafts.
 *
 *   node --import tsx --test tests/admin-console-phase4.test.mts
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(projectRoot, ...parts), 'utf8');

/** Remove PHP/TSX comments so prose about a rule is not mistaken for the rule. */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*\*.*$/gm, '');

const feeLib = read('php-backend', 'lib', 'fee_policies.php');
const api = read('php-backend', 'lib', 'api.php');
const mysqlSchema = read('php-backend', 'database.sql');
const sqliteSchema = read('php-backend', 'schema.sqlite.sql');
const migrate = read('php-backend', 'migrate.php');
const component = read('src', 'components', 'AdminFeePolicies.tsx');
const tiersComponent = read('src', 'components', 'AdminAgentTiers.tsx');
const apiService = read('src', 'services', 'apiService.ts');

describe('Policy history records values, not just events (A9)', () => {
  test('the event table stores a change payload in both engines and in the migration', () => {
    assert.match(mysqlSchema, /`changes_json` LONGTEXT DEFAULT NULL/);
    assert.match(sqliteSchema, /changes_json TEXT/);
    assert.match(migrate, /'fee_policy_events' => \[[\s\S]{0,300}changes_json/);
  });

  test('an edit is diffed field by field and stored with the event', () => {
    assert.match(feeLib, /function fee_policy_changes_between\(array \$before, array \$after\): array/);
    assert.match(feeLib, /fee_policy_changes_between\(\$row, \$updated\)/);
    assert.match(feeLib, /record_fee_policy_event\(\s*\$updated,\s*'updated'/);
    assert.match(feeLib, /const FEE_POLICY_TRACKED_FIELDS = \[/);
    // The API surfaces the decoded changes to the console.
    assert.match(feeLib, /'changes'\s*=> fee_policy_event_changes\(/);
  });

  test('an unchanged draft says so instead of inventing an edit', () => {
    assert.match(feeLib, /Draft saved without changing any value\./);
  });
});

describe('Deleting a policy is guarded (A9)', () => {
  test('the route is capability-gated and exists exactly once', () => {
    const routes = stripComments(api).match(/\[.DELETE.,\s*'#\^\/admin\/fee-policies\/\(\[A-Za-z0-9/);
    assert.ok(routes, 'the DELETE route exists');
    assert.equal(stripComments(api).match(/handle_delete_fee_policy'\]/g)?.length, 1);

    const handlerStart = api.indexOf('function handle_delete_fee_policy');
    assert.ok(handlerStart > 0);
    const handler = api.slice(handlerStart, api.indexOf('function handle_admin_agent_tier_overview'));
    assert.match(handler, /require_fee_policy_manager\(\)/, 'deleting needs the manager capability');
    assert.match(handler, /enforce_rate_limit\('fee-policy-write'/);
  });

  test('only a draft that never reached a decision can be deleted', () => {
    const body = stripComments(feeLib).slice(
      stripComments(feeLib).indexOf('function delete_fee_policy'),
      stripComments(feeLib).indexOf('function admin_agent_tier_overview')
    );
    assert.match(body, /if \(\$status !== 'draft'\)/);
    assert.match(body, /fee_policy_usage\(\$id\)/, 'a policy that priced a transaction is refused');
    assert.match(body, /action IN \('submitted', 'approved', 'activated', 'deactivated'\)/);
    assert.match(body, /DELETE FROM fee_policies WHERE id = :id AND status = 'draft'/, 'the delete is still conditional');
    assert.match(body, /audit_log\('fee_policy\.deleted'/, 'the deletion is audited');
  });

  test('the conflict is a 409 with a machine-readable reason', () => {
    assert.match(api, /'code'\s*=> 'policy_is_history'/);
    assert.match(api, /409/);
  });
});

describe('Agent tiers are derived, never assigned (A9)', () => {
  test('no route accepts a tier as input', () => {
    const code = stripComments(api);
    const tierRoutes = code.match(/\[.(POST|PUT|PATCH).,\s*'#\^\/admin\/(agent-tiers|agents\/[^']*tier)/g) ?? [];
    assert.deepEqual(tierRoutes, [], 'tiers may only be read');
    assert.match(code, /\['GET',\s*'#\^\/admin\/agent-tiers\$#'/);
  });

  test('the overview derives each tier from verification and says so', () => {
    const body = feeLib.slice(feeLib.indexOf('function admin_agent_tier_overview'));
    assert.match(body, /agent_tier_state\(\(string\)\$agent\['id'\]\)/);
    assert.match(body, /'derived' => true/);
    assert.match(body, /NOT assigned by hand|not assigned by hand/);
    assert.match(body, /'note' =>/);
  });

  test('the console has no control that sets a tier and the client has no such call', () => {
    const ui = stripComments(component) + stripComments(tiersComponent);
    assert.doesNotMatch(ui, /setAgentTier|updateAgentTier|assignTier/i);
    assert.doesNotMatch(stripComments(apiService), /setAgentTier|updateAgentTier|assignTier/i);
    assert.match(apiService, /adminAgentTiers: \(\) => request<AdminAgentTiers>\('\/admin\/agent-tiers'\)/);
  });
});

describe('The console tells the truth about the new actions (A9)', () => {
  test('history renders the field changes and names the self-approval', () => {
    assert.match(component, /event\.changes/);
    assert.match(component, /readableValue\(change\.from\)/);
    assert.match(component, /approved_by_creator:/);
  });

  test('delete is offered for drafts only and asks for a reason', () => {
    assert.match(component, /canManage && policy\.status === 'draft' &&/);
    assert.match(component, /deleteFeePolicy\(policy\.id, reason\)/);
    assert.match(component, /deleteError/);
    assert.doesNotMatch(component, /policy\.status === 'rejected'\)/);
  });

  test('the tier panel is on the fee-policy screen and states the split honestly', () => {
    assert.match(component, /<AdminAgentTiers \/>/);
    assert.match(tiersComponent, /derived|not assigned/i);
    assert.match(tiersComponent, /goodlucksPercent/);
  });
});
