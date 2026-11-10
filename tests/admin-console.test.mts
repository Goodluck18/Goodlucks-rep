/**
 * Administrator console — search, filters and sorting (Upgrade 2, A6–A10).
 *
 * There is no browser in CI, so this file checks the properties of the shipped
 * source that make the console correct:
 *
 *   - each of the four lists sends its search and filters to the SERVER (the
 *     console used to filter a downloaded page in memory, which silently hid
 *     every record past the page);
 *   - every status the requirements name exists and is selectable;
 *   - verification and listing authorisation stay separate controls on the
 *     agent screen;
 *   - the API's own status list matches what the screens offer.
 *
 * The matching HTTP behaviour is asserted in `api.test.mjs` ("Admin console
 * search and filters"), against a real database — that is where a filter is
 * proven to run in SQL over real rows.
 *
 *   npm run test:admin-console
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

const manageListings = read('src/components/AdminManageListings.tsx');
const dashboard = read('src/components/AdminDashboard.tsx');
const agentAccounts = read('src/components/AdminAgentAccounts.tsx');
const enquiries = read('src/components/AdminEnquiries.tsx');
const apiClient = read('src/services/apiService.ts');
const types = read('src/types.ts');
const validatePhp = read('php-backend/lib/validate.php');
const repositoryPhp = read('php-backend/lib/repository.php');
const apiPhp = read('php-backend/lib/api.php');

/* -------------------------------------------------------------------------- */
/* A6 — Manage Listings                                                       */
/* -------------------------------------------------------------------------- */

test('A6: the listing screen sends search, filters, sort and paging to the server', () => {
  assert.match(manageListings, /api\.adminProperties\(request\)/);
  for (const filter of [
    'q: filters.q',
    'status: filters.status',
    'location: filters.location',
    'minRent: filters.minRent',
    'maxRent: filters.maxRent',
    'createdFrom: filters.createdFrom',
    'createdTo: filters.createdTo',
    'sort: filters.sort',
    'page,',
    'perPage: PAGE_SIZE',
  ]) {
    assert.ok(manageListings.includes(filter), `the request must carry ${filter}`);
  }

  // The total is the server's number, and the page control walks it.
  assert.match(manageListings, /setTotal\(result\.total \?\? 0\)/);
  assert.match(manageListings, /Showing \$\{first\}–\$\{last\} of \$\{total\.toLocaleString\(\)\}/);
  assert.match(manageListings, /Math\.ceil\(total \/ PAGE_SIZE\)/);
});

test('A6: every listing status and sort order is offered', () => {
  for (const status of ['active', 'pending', 'rejected', 'deactivated', 'rented']) {
    assert.ok(manageListings.includes(`value: '${status}'`), `the status filter must offer ${status}`);
  }
  for (const sort of ['newest', 'oldest', 'price_asc', 'price_desc', 'popular']) {
    assert.ok(manageListings.includes(`value: '${sort}'`), `the sort control must offer ${sort}`);
  }
});

test('A6: the dashboard uses the server-backed list, not a local filter', () => {
  assert.match(dashboard, /<AdminManageListings onEdit=\{openEditProperty\} \/>/);
  assert.doesNotMatch(dashboard, /properties\.map\(\(property\) => \(/);
});

test('A6: the API accepts the date range and clamps the page size', () => {
  assert.match(apiPhp, /'createdFrom' => \$validDate\(query_param\('createdFrom'\)\)/);
  assert.match(apiPhp, /'createdTo'   => \$validDate\(query_param\('createdTo'\)\)/);
  assert.match(apiPhp, /'perPage'     => \(int\)query_param\('perPage', 20\)/);
  assert.match(repositoryPhp, /created_at >= :created_from/);
  assert.match(repositoryPhp, /created_at < :created_to/);
});

/* -------------------------------------------------------------------------- */
/* A7 — Tenant matching                                                       */
/* -------------------------------------------------------------------------- */

test('A7: the matching screen searches name/phone/email and filters by stage', () => {
  assert.match(dashboard, /api\s*\.listAllTenantRequests\(\{ q: matchingQuery\.trim\(\), stage: matchingStage \}\)/);
  assert.match(dashboard, /placeholder="Search tenant name, phone or email…"/);
  for (const stage of ['pending', 'approved', 'viewing_scheduled']) {
    assert.ok(dashboard.includes(`value: '${stage}'`), `the stage filter must offer ${stage}`);
  }
  // Counts come from the server, over every request.
  assert.match(dashboard, /setMatchingCounts\(result\.stageCounts \?\? \{\}\)/);
});

test('A7: an approved request moves into the approved stage without a second flag', () => {
  // The stage is derived from the stored status on the server…
  assert.match(repositoryPhp, /function tenant_request_stage\(string \$status\): string/);
  assert.match(repositoryPhp, /'submitted', 'searching' => 'pending'/);
  assert.match(repositoryPhp, /'matched'\s+=> 'approved'/);
  assert.match(repositoryPhp, /'viewing_scheduled'\s+=> 'viewing_scheduled'/);
  // …and the list re-reads itself after a status change, so the card moves.
  assert.match(dashboard, /\}, \[activeAdminTab, matchingQuery, matchingStage, tenantRequests\]\)/);
  assert.match(types, /stage\?: 'pending' \| 'approved' \| 'viewing_scheduled' \| 'completed' \| 'cancelled'/);
});

/* -------------------------------------------------------------------------- */
/* A8 — Agent accounts                                                        */
/* -------------------------------------------------------------------------- */

test('A8: the agent screen searches name/email/location and filters by stage', () => {
  assert.match(agentAccounts, /api\.listAgents\(\{/);
  assert.match(agentAccounts, /q: query\.trim\(\)/);
  assert.match(agentAccounts, /stage,/);
  assert.match(agentAccounts, /placeholder="Search name, email, agency, operating city or contact address…"/);
  for (const stage of ['pending', 'approved_for_listing', 'suspended']) {
    assert.ok(agentAccounts.includes(`value: '${stage}'`), `the filter must offer ${stage}`);
  }
});

test('A8: verification and listing authorisation remain separate controls', () => {
  // The screen has a second, independent verification filter…
  assert.match(agentAccounts, /value=\{verification\}/);
  assert.match(agentAccounts, /Listing authorisation and identity verification are separate decisions\./);
  assert.ok(agentAccounts.includes(`value="verified"`) && agentAccounts.includes(`value="unverified"`));

  // …and the server filters the two decisions separately.
  assert.match(repositoryPhp, /function agent_account_stage\(array \$profile\): string/);
  assert.match(repositoryPhp, /if \(\$verification === 'verified' && empty\(\$profile\['identityVerified'\]\)\)/);
  assert.match(repositoryPhp, /if \(\$listing === 'allowed' && empty\(\$profile\['canSubmitListings'\]\)\)/);
  assert.match(apiPhp, /'verification'  => strtolower\(trim\(\(string\)query_param\('verification', ''\)\)\)/);
});

/* -------------------------------------------------------------------------- */
/* A10 — Web enquiries                                                        */
/* -------------------------------------------------------------------------- */

test('A10: the enquiry screen has all five statuses, with real counts', () => {
  for (const status of ['new', 'received', 'contacted', 'replied', 'closed']) {
    assert.ok(enquiries.includes(`value: '${status}'`), `the status filter must offer ${status}`);
  }
  assert.match(enquiries, /api\.listEnquiries\(\{ q: query\.trim\(\), status \}\)/);
  assert.match(enquiries, /setStatusCounts\(result\.statusCounts \?\? \{\}\)/);
  assert.match(enquiries, /placeholder="Search by name, email or phone number…"/);
});

test('A10: the stored lifecycle matches the screens', () => {
  assert.match(validatePhp, /const ENQUIRY_STATUSES = \['new', 'received', 'contacted', 'replied', 'closed'\];/);
  assert.match(types, /status: 'new' \| 'received' \| 'contacted' \| 'replied' \| 'closed';/);
  // The status a person sets is written and audited, never inferred.
  assert.match(apiPhp, /audit_log\('enquiry\.status_changed'/);
  assert.match(enquiries, /void move\(enquiry, 'replied'\)/);
});

test('A10: searching an enquiry matches digits, not punctuation', () => {
  // The stored phone keeps whatever spacing the visitor typed; the query is
  // reduced to digits on both sides, so "024 123 4567" and "0241234567" match.
  assert.ok(
    repositoryPhp.includes(`REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE :phone_q`),
    'the phone column is stripped of punctuation before matching'
  );
  assert.ok(
    repositoryPhp.includes(`preg_replace('/\\D+/', '', $query)`),
    'the search term is reduced to digits'
  );
});

test('A10: the enquiry list is administrator-only', () => {
  assert.match(apiPhp, /function handle_admin_enquiries\(\): void\s*\{\s*require_admin\(\);/m);
});

/* -------------------------------------------------------------------------- */
/* A5 — Email template editor                                                 */
/* -------------------------------------------------------------------------- */

const emailTemplates = read('src/components/AdminEmailTemplates.tsx');

test('A5: the template body is controlled state, not a value read through a ref', () => {
  // The editor used to read the textarea through a ref at save time and return
  // an empty string for a new template, so saving reported "No content".
  assert.match(emailTemplates, /const \[body, setBody\] = useState\(''\)/);
  assert.match(emailTemplates, /const bodyValue = \(\): string => body;/);
  assert.match(emailTemplates, /value=\{body\}/);
  assert.match(emailTemplates, /onChange=\{\(event\) => setBody\(event\.target\.value\)\}/);
  assert.doesNotMatch(emailTemplates, /bodyRef\.current\?\.value \?\?/);
  assert.doesNotMatch(emailTemplates, /if \(editing === 'new'\) return '';/);
});

test('A5: opening a template loads its own body, and a new one starts empty', () => {
  assert.match(emailTemplates, /setBody\(template\.bodyHtml \?\? ''\)/);
  assert.match(emailTemplates, /setBody\(''\)/);
  // The textarea is keyed by the record so the previous body can never linger.
  assert.match(emailTemplates, /key=\{editing === 'new' \? 'new' : editing\.id\}/);
});

test('A5: inserting an article link or formatting edit the same state', () => {
  const insertPost = emailTemplates.slice(emailTemplates.indexOf('const insertPost'));
  assert.match(insertPost, /setBody\(\(current\) => current\.slice\(0, start\)/);
  const wrapSelection = emailTemplates.slice(emailTemplates.indexOf('const wrapSelection'));
  assert.match(wrapSelection, /setBody\(next\)/);
});

/* -------------------------------------------------------------------------- */
/* A1 — blog featured image upload path                                       */
/* -------------------------------------------------------------------------- */

test('A1: the upload client and the Apache rules agree on the slashed path', () => {
  assert.match(apiClient, /\}>\('\/uploads\/',/);
  const htaccess = read('php-backend/.htaccess');
  assert.match(htaccess, /RewriteRule \^uploads\/\?\$ index\.php \[L,QSA\]/);
});
