/**
 * Administrator console — user directory, activity and bulk email
 * (Upgrade 2 Phase 3: A11, A13, A14, A12).
 *
 * No browser runs in this environment, so this file pins the properties of the
 * shipped source that make the new console sections real:
 *
 *   - the sections exist, are routed, and are reachable at their own URLs;
 *   - every screen calls the server rather than filtering or inventing data;
 *   - the profile screen has no way to link to a private document;
 *   - the capability gates are server-side, not just hidden tabs;
 *   - the schema carries the new tables and columns in both database engines.
 *
 * The HTTP behaviour behind them is asserted against a real database in
 * `tests/user-management.test.mjs` and `tests/bulk-email.test.mjs`.
 *
 *   npm run test:admin-console-phase3
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const dashboard = read('src/components/AdminDashboard.tsx');
const routes = read('src/routing/routes.ts');
const userManagement = read('src/components/AdminUserManagement.tsx');
const userProfile = read('src/components/AdminUserProfile.tsx');
const bulkEmail = read('src/components/AdminBulkEmail.tsx');
const activityFeed = read('src/components/AdminActivityFeed.tsx');
const apiClient = read('src/services/apiService.ts');
const apiPhp = read('php-backend/lib/api.php');
const usersPhp = read('php-backend/lib/users_admin.php');
const campaignsPhp = read('php-backend/lib/campaigns.php');
const schemaSqlite = read('php-backend/schema.sqlite.sql');
const databaseSql = read('php-backend/database.sql');
const grantScript = read('php-backend/grant_directory.php');

/* -------------------------------------------------------------------------- */
/* A11 — User Management                                                      */
/* -------------------------------------------------------------------------- */

test('A11: the console has a User Management section and a route for it', () => {
  assert.match(dashboard, /import \{ AdminUserManagement \} from '\.\/AdminUserManagement'/);
  assert.match(dashboard, /activeAdminTab === 'users' && \(\s*<AdminUserManagement \/>/);
  assert.match(dashboard, /setActiveAdminTab\('users'\)/);
  assert.match(routes, /users: 'users'/);
});

test('A11: the directory searches and filters on the server', () => {
  assert.match(userManagement, /api\.listAdminUsers\(\{ q: query\.trim\(\), role, status, page, perPage: PAGE_SIZE \}\)/);
  // Roles and verification are offered as controls.
  for (const role of ['tenant', 'landlord', 'agent', 'admin']) {
    assert.ok(userManagement.includes(`value: '${role}'`), `role filter missing: ${role}`);
  }
  assert.ok(userManagement.includes("value: 'verified'"));
  assert.ok(userManagement.includes("value: 'unverified'"));
  // Paging goes to the server, never a slice of a downloaded array.
  assert.match(userManagement, /page, perPage: PAGE_SIZE/);
  assert.ok(!/\.slice\(/.test(userManagement), 'the screen must not paginate in the browser');
});

test('A11: the endpoint requires its capability and never selects a password hash', () => {
  assert.match(apiPhp, /function handle_admin_users\(\): void[\s\S]{0,240}can_manage_users\(\$admin\)/);
  assert.match(usersPhp, /SELECT id, name, email, phone, role, is_verified, created_at FROM users/);
  assert.ok(!/'SELECT \*'/.test(usersPhp), 'the directory must never select every column');
  // The word may appear in a comment explaining the rule; the SQL must not
  // name the column.
  assert.ok(!/SELECT[\s\S]{0,400}password_hash/i.test(usersPhp), 'a query must not read password_hash');
  assert.ok(!/passwordHash/i.test(usersPhp));
});

/* -------------------------------------------------------------------------- */
/* A13 — Profiles and activity history                                        */
/* -------------------------------------------------------------------------- */

test('A13: the profile reads real records and cannot link to a private document', () => {
  assert.match(userProfile, /api\.getAdminUser\(userId\)/);
  // Documents are a count; no URL, path or file name is ever rendered.
  assert.match(userProfile, /Documents on file/);
  assert.ok(!/\/verification-documents\//.test(userProfile), 'the profile must not link a document endpoint');
  assert.ok(!/storage\/private/.test(userProfile));
  // The history is described from the stored rows.
  for (const kind of ['property', 'saved', 'request', 'viewing', 'enquiry', 'action']) {
    assert.ok(userProfile.includes(`${kind}: {`), `history kind missing: ${kind}`);
  }
});

test('A13: the activity endpoint is gated by its own capability', () => {
  assert.match(apiPhp, /function handle_admin_user_activity\(array \$params\): void[\s\S]{0,260}can_view_user_activity\(\$admin\)/);
  assert.match(apiPhp, /function handle_admin_user_profile\(array \$params\): void[\s\S]{0,260}can_manage_users\(\$admin\)/);
});

/* -------------------------------------------------------------------------- */
/* A14 — Activity feed                                                        */
/* -------------------------------------------------------------------------- */

test('A14: the dashboard shows a feed built from stored records', () => {
  assert.match(dashboard, /<AdminActivityFeed/);
  assert.match(activityFeed, /api\.getAdminActivity\(20\)/);
  assert.match(usersPhp, /function admin_activity_feed\(int \$limit = 20\): array/);
  // Every source is a real table, never an invented metric.
  for (const table of ['FROM users', 'FROM properties', 'FROM enquiries', 'FROM tenant_requests', 'FROM viewing_schedules', 'FROM audit_logs']) {
    assert.ok(usersPhp.includes(table), `the feed should read ${table}`);
  }
});

/* -------------------------------------------------------------------------- */
/* A12 — Bulk email                                                           */
/* -------------------------------------------------------------------------- */

test('A12: the console has a Bulk Email section wired to the campaign endpoints', () => {
  assert.match(dashboard, /import \{ AdminBulkEmail \} from '\.\/AdminBulkEmail'/);
  assert.match(dashboard, /activeAdminTab === 'bulk-email' && \(\s*<AdminBulkEmail \/>/);
  assert.match(routes, /'bulk-email': 'bulk-email'/);
  for (const call of ['previewCampaign', 'createCampaign', 'queueCampaign', 'retryCampaign', 'listCampaigns', 'getCampaign']) {
    assert.ok(apiClient.includes(`${call}:`), `apiService is missing ${call}`);
  }
});

test('A12: campaigns are one message per recipient and carry a preferences link', () => {
  // Comments are stripped first: the file explains *why* it never uses Bcc, and
  // that explanation must not be mistaken for the code it warns about.
  const campaignCode = campaignsPhp
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*\*.*$/gm, '');
  assert.ok(!/bcc/i.test(campaignCode), 'bulk mail must not use Bcc');
  assert.match(campaignsPhp, /queue_email\(\s*\$row\['email'\]/);
  assert.match(campaignsPhp, /campaign_preferences_url\(\$token\)/);
  assert.match(campaignsPhp, /Manage your email preferences/);
  // Marketing is opt-in, and the audience query honours that.
  assert.match(campaignsPhp, /marketing_opt_in/);
  assert.match(campaignsPhp, /if \(\$kind === 'marketing' && !\$optedIn\)/);
});

test('A12: the capability is checked server-side on every campaign endpoint', () => {
  for (const handler of [
    'handle_list_campaigns',
    'handle_campaign_preview',
    'handle_create_campaign',
    'handle_campaign_show',
    'handle_queue_campaign',
    'handle_retry_campaign',
  ]) {
    const pattern = new RegExp(`function ${handler}\\([^)]*\\): void[\\s\\S]{0,260}can_send_bulk_email\\(\\$admin\\)`);
    assert.match(apiPhp, pattern, `${handler} must check can_send_bulk_email`);
  }
});

/* -------------------------------------------------------------------------- */
/* Schema and capability grants                                               */
/* -------------------------------------------------------------------------- */

test('Phase 3 schema is additive and present in both engines', () => {
  for (const schema of [schemaSqlite, databaseSql]) {
    for (const table of ['email_campaigns', 'email_campaign_recipients', 'email_preferences']) {
      assert.ok(schema.includes(table), `missing table ${table}`);
    }
    for (const column of ['can_manage_users', 'can_view_user_activity', 'can_send_bulk_email']) {
      assert.ok(schema.includes(column), `missing column ${column}`);
    }
  }
  // Additive only: nothing is dropped.
  assert.ok(!/DROP TABLE/i.test(schemaSqlite));
  assert.ok(!/DROP COLUMN/i.test(databaseSql));
});

test('Phase 3 capabilities are granted only from the console', () => {
  assert.match(grantScript, /--users/);
  assert.match(grantScript, /--activity/);
  assert.match(grantScript, /--bulk/);
  assert.match(grantScript, /PHP_SAPI !== 'cli'/);
  // No HTTP route may set a capability: no route pattern mentions one.
  assert.ok(!/'#\^\/[^']*capabilit/i.test(apiPhp), 'no route may grant capabilities');
  assert.ok(!/\$_(POST|GET)\['can_(manage_users|view_user_activity|send_bulk_email)'\]/.test(apiPhp));
});
