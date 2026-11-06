/**
 * Routing tests — the executable contract for src/routing/routes.ts.
 *
 * These run in plain Node (no browser, no DOM), which is exactly what makes
 * them useful in CI: they prove the URL ↔ page mapping, the role guards and the
 * legacy-link compatibility for every route in the table.
 *
 *   npm run test:routing
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUBLIC_ROUTES,
  ROLE_SECTIONS,
  accessDecision,
  buildQuery,
  dashboardPath,
  isSafeRedirect,
  legacyRedirect,
  normalisePath,
  parseLocation,
  parseQuery,
  pathForView,
  sectionForTab,
  tabForRoute,
  tabPath,
  viewForRoute,
  type RouteState,
} from '../src/routing/routes.ts';
import type { UserRole } from '../src/types.ts';

const ROLES: UserRole[] = ['guest', 'tenant', 'landlord', 'agent', 'admin'];

/* -------------------------------------------------------------------------- */
/* A. URL parsing — public pages                                              */
/* -------------------------------------------------------------------------- */

test('public pages parse to their routes', () => {
  const cases: Array<[string, RouteState['name']]> = [
    ['/', 'home'],
    ['/properties', 'browse'],
    ['/find-a-home', 'find-home'],
    ['/about', 'about'],
    ['/contact', 'contact'],
    ['/receipts', 'receipts'],
    ['/list-property', 'list-property'],
    ['/login', 'login'],
    ['/register', 'register'],
    ['/reset-password', 'reset-password'],
    ['/admin-login', 'admin-login'],
  ];
  for (const [url, name] of cases) {
    const route = parseLocation(url);
    assert.equal(route.name, name, `${url} → ${name}`);
    assert.equal(route.isKnown, true, `${url} should be a known route`);
    assert.equal(route.path, url);
  }
});

test('the public route table and the parser agree', () => {
  for (const path of PUBLIC_ROUTES) {
    assert.equal(parseLocation(path).isKnown, true, `public route ${path} must parse`);
  }
});

test('the home page is the only zero-segment route', () => {
  assert.equal(parseLocation('/').name, 'home');
  assert.equal(parseLocation('').name, 'home');
});

test('query strings are parsed, not swallowed', () => {
  const route = parseLocation('/properties?location=East%20Legon&bedrooms=2&q=villa+with+pool');
  assert.equal(route.query.location, 'East Legon');
  assert.equal(route.query.bedrooms, '2');
  assert.equal(route.query.q, 'villa with pool');
});

test('duplicate slashes, trailing slashes and absolute URLs normalise', () => {
  assert.equal(normalisePath('//properties//'), '/properties');
  assert.equal(normalisePath('/'), '/');
  assert.equal(parseLocation('https://rent.goodlucks.co/properties').name, 'browse');
  assert.equal(parseLocation('/properties/').path, '/properties');
});

/* -------------------------------------------------------------------------- */
/* B. Property detail                                                         */
/* -------------------------------------------------------------------------- */

test('/property/:id exposes the id and keeps its canonical path', () => {
  const route = parseLocation('/property/abc-123');
  assert.equal(route.name, 'property-detail');
  assert.equal(route.params.id, 'abc-123');
  assert.equal(route.path, '/property/abc-123');
});

test('unusable property ids fall through to not-found instead of a broken page', () => {
  for (const url of ['/property/', '/property/abc/extra', '/property/' + 'x'.repeat(80), '/property/a b']) {
    const route = parseLocation(url);
    assert.equal(route.isKnown, false, `${url} should not be a known route`);
    assert.equal(route.name, 'not-found');
  }
});

test('a property page cannot be reached by a role section shortcut', () => {
  assert.equal(parseLocation('/properties/abc').isKnown, false);
});

/* -------------------------------------------------------------------------- */
/* C. Legacy / pre-routing URLs keep working                                  */
/* -------------------------------------------------------------------------- */

test('old ?property= links redirect to the canonical listing URL', () => {
  assert.equal(legacyRedirect('/?property=abc-123'), '/property/abc-123');
  assert.equal(legacyRedirect('/?p=abc-123'), '/property/abc-123');
  assert.equal(
    legacyRedirect('/?property=abc-123&utm_source=whatsapp'),
    '/property/abc-123?utm_source=whatsapp'
  );
});

test('old hash links and mixed-case paths redirect', () => {
  assert.equal(legacyRedirect('/#/property/abc-123'), '/property/abc-123');
  assert.equal(legacyRedirect('/#property/abc-123'), '/property/abc-123');
  assert.equal(legacyRedirect('/Properties'), '/properties');
  assert.equal(legacyRedirect('/About?x=1'), '/about?x=1');
});

test('emailed password reset links move to their own route', () => {
  assert.equal(legacyRedirect('/?reset=tok_123'), '/reset-password?token=tok_123');
  const route = parseLocation('/reset-password?token=tok_123');
  assert.equal(route.name, 'reset-password');
  assert.equal(route.query.token, 'tok_123');
});

test('canonical URLs are left alone (no redirect loop)', () => {
  for (const url of ['/', '/properties', '/property/abc-123', '/tenant/dashboard', '/admin']) {
    assert.equal(legacyRedirect(url), null, `${url} must not redirect`);
  }
});

/* -------------------------------------------------------------------------- */
/* D. Dashboard sections                                                      */
/* -------------------------------------------------------------------------- */

test('every dashboard section in the table parses to its role', () => {
  for (const role of ['tenant', 'landlord', 'agent', 'admin'] as const) {
    for (const section of Object.keys(ROLE_SECTIONS[role].accepted)) {
      const route = parseLocation(`/${role}/${section}`);
      assert.equal(route.name, role);
      assert.equal(route.section, section);
      assert.equal(route.isKnown, true);
    }
  }
});

test('unknown dashboard sections are not found, not silently ignored', () => {
  assert.equal(parseLocation('/tenant/nonsense').name, 'not-found');
  assert.equal(parseLocation('/admin/nonsense').name, 'not-found');
  assert.equal(parseLocation('/tenant/dashboard/extra').name, 'not-found');
});

test('every tab has exactly one canonical URL that parses back to that tab', () => {
  for (const role of ['tenant', 'landlord', 'agent', 'admin'] as const) {
    const tabs = Object.keys(ROLE_SECTIONS[role].canonical);
    assert.ok(tabs.length > 0, `${role} should have tabs`);
    for (const tab of tabs) {
      const path = tabPath(role, tab);
      const route = parseLocation(path);
      assert.equal(route.name, role, `${path} should be a ${role} route`);
      assert.equal(route.isKnown, true);
      assert.equal(tabForRoute(route), tab, `${path} should resolve to tab ${tab}`);
      const canonicalSection = path.split('/')[2] ?? ROLE_SECTIONS[role].fallback;
      assert.equal(sectionForTab(role, tab), canonicalSection, `${role}/${tab} canonical section`);
    }
  }
});

test('aliases resolve to a real tab', () => {
  assert.equal(tabForRoute(parseLocation('/tenant/rental-requests')), 'requests');
  assert.equal(tabForRoute(parseLocation('/tenant/saved')), 'saved');
  // Task 02: notifications is a page of its own, not the request tracker.
  assert.equal(tabForRoute(parseLocation('/tenant/notifications')), 'notifications');
  assert.equal(tabForRoute(parseLocation('/tenant/settings')), 'settings');
  assert.equal(tabForRoute(parseLocation('/landlord/identity')), 'identity');
  assert.equal(tabForRoute(parseLocation('/landlord/verification')), 'identity');
  assert.equal(tabForRoute(parseLocation('/landlord/notifications')), 'notifications');
  assert.equal(tabForRoute(parseLocation('/landlord/settings')), 'settings');
  assert.equal(tabForRoute(parseLocation('/agent/status')), 'status');
  assert.equal(tabForRoute(parseLocation('/agent/settings')), 'settings');
  assert.equal(tabForRoute(parseLocation('/landlord/dashboard')), 'overview');
  assert.equal(tabForRoute(parseLocation('/admin/dashboard')), 'analytics');
});

/* -------------------------------------------------------------------------- */
/* Task 02: every dashboard section is its own address                        */
/* -------------------------------------------------------------------------- */

test('each dashboard section has its own URL, and the overview is not a tab list', () => {
  const expected: Array<[ 'tenant' | 'landlord' | 'agent', string, string]> = [
    ['tenant', 'overview', '/tenant/dashboard'],
    ['tenant', 'requests', '/tenant/rental-requests'],
    ['tenant', 'matches', '/tenant/matches'],
    ['tenant', 'viewings', '/tenant/viewings'],
    ['tenant', 'saved', '/tenant/saved-properties'],
    ['tenant', 'alerts', '/tenant/search-alerts'],
    ['tenant', 'notifications', '/tenant/notifications'],
    ['tenant', 'profile', '/tenant/profile'],
    ['tenant', 'settings', '/tenant/settings'],
    ['landlord', 'overview', '/landlord/dashboard'],
    ['landlord', 'my-properties', '/landlord/properties'],
    ['landlord', 'viewings', '/landlord/viewings'],
    ['landlord', 'receipts', '/landlord/receipts'],
    ['landlord', 'identity', '/landlord/verification'],
    ['landlord', 'notifications', '/landlord/notifications'],
    ['landlord', 'profile', '/landlord/profile'],
    ['landlord', 'settings', '/landlord/settings'],
    ['agent', 'overview', '/agent/dashboard'],
    ['agent', 'properties', '/agent/properties'],
    ['agent', 'viewings', '/agent/viewings'],
    ['agent', 'finance', '/agent/finance'],
    ['agent', 'verification', '/agent/verification'],
    ['agent', 'status', '/agent/status'],
    ['agent', 'notifications', '/agent/notifications'],
    ['agent', 'profile', '/agent/profile'],
    ['agent', 'settings', '/agent/settings'],
  ];

  for (const [role, tab, path] of expected) {
    assert.equal(tabPath(role, tab), path, `${role}/${tab} path`);
    const route = parseLocation(path);
    assert.equal(route.name, role, `${path} belongs to ${role}`);
    assert.equal(route.isKnown, true, `${path} is known`);
    assert.equal(tabForRoute(route), tab, `${path} resolves to ${tab}`);
  }
});

test('profile and settings are different pages for every account type', () => {
  for (const role of ['tenant', 'landlord', 'agent'] as const) {
    assert.notEqual(tabPath(role, 'profile'), tabPath(role, 'settings'));
    assert.equal(parseLocation(tabPath(role, 'profile')).section, 'profile');
    assert.equal(parseLocation(tabPath(role, 'settings')).section, 'settings');
  }
});

test('a section URL is refused to the wrong role even when it exists for another', () => {
  const tenantSettings = parseLocation('/tenant/settings');
  assert.equal(accessDecision(tenantSettings, 'landlord', tenantSettings.path).action, 'forbidden');
  assert.equal(accessDecision(tenantSettings, 'admin', tenantSettings.path).action, 'forbidden');

  const landlordReceipts = parseLocation('/landlord/receipts');
  assert.equal(accessDecision(landlordReceipts, 'tenant', landlordReceipts.path).action, 'forbidden');

  const agentStatus = parseLocation('/agent/status');
  assert.equal(accessDecision(agentStatus, 'landlord', agentStatus.path).action, 'forbidden');
});

test('a bare role root is recognised (and the guard normalises it)', () => {
  const route = parseLocation('/tenant');
  assert.equal(route.name, 'tenant');
  assert.equal(route.isKnown, true);
  const decision = accessDecision(route, 'tenant', route.path);
  assert.deepEqual(decision, { action: 'redirect', to: '/tenant/dashboard' });
});

/* -------------------------------------------------------------------------- */
/* E. Role permissions                                                        */
/* -------------------------------------------------------------------------- */

test('each role may open its own workspace and nothing else', () => {
  const own: Record<string, RouteState> = {
    tenant: parseLocation('/tenant/viewings'),
    landlord: parseLocation('/landlord/properties'),
    agent: parseLocation('/agent/finance'),
    admin: parseLocation('/admin/finance'),
  };
  for (const role of ['tenant', 'landlord', 'agent', 'admin'] as UserRole[]) {
    for (const [owner, route] of Object.entries(own)) {
      const decision = accessDecision(route, role, route.path);
      if (owner === role) {
        assert.equal(decision.action, 'allow', `${role} should open ${route.path}`);
      } else {
        assert.equal(decision.action, 'forbidden', `${role} must not open ${route.path}`);
        assert.equal(
          (decision as { to: string }).to,
          dashboardPath(role),
          `${role} should be sent to its own dashboard, not the other role's`
        );
      }
    }
  }
});

test('roles are not additive: no role inherits another role\'s pages', () => {
  for (const role of ['tenant', 'landlord', 'agent', 'admin'] as UserRole[]) {
    const others = (['tenant', 'landlord', 'agent', 'admin'] as UserRole[]).filter((r) => r !== role);
    for (const other of others) {
      const route = parseLocation(dashboardPath(other));
      assert.notEqual(accessDecision(route, role, route.path).action, 'allow');
    }
  }
});

test('guests are sent to the login page with the intended destination', () => {
  const route = parseLocation('/tenant/saved-properties');
  const decision = accessDecision(route, 'guest', route.path);
  assert.equal(decision.action, 'login');
  assert.equal(
    (decision as { to: string }).to,
    '/login?next=%2Ftenant%2Fsaved-properties',
    'the intended destination travels in ?next='
  );
  assert.equal((decision as { next: string }).next, '/tenant/saved-properties');
  // And it survives the round trip through the URL.
  assert.equal(parseLocation((decision as { to: string }).to).query.next, '/tenant/saved-properties');
});

test('public pages stay public for every role', () => {
  for (const path of ['/', '/properties', '/find-a-home', '/about', '/contact', '/receipts', '/list-property']) {
    const route = parseLocation(path);
    for (const role of ROLES) {
      assert.equal(accessDecision(route, role, route.path).action, 'allow', `${role} → ${path}`);
    }
  }
});

test('a signed-in member never sees the sign-in screens again', () => {
  for (const role of ['tenant', 'landlord', 'agent', 'admin'] as UserRole[]) {
    for (const path of ['/login', '/register']) {
      const route = parseLocation(path);
      const decision = accessDecision(route, role, route.path);
      assert.equal(decision.action, 'redirect');
      assert.equal((decision as { to: string }).to, dashboardPath(role));
    }
  }
});

test('an admin opening /admin-login goes straight to the console', () => {
  const route = parseLocation('/admin-login');
  assert.deepEqual(accessDecision(route, 'admin', route.path), { action: 'redirect', to: '/admin' });
  assert.equal(accessDecision(route, 'guest', route.path).action, 'allow');
  assert.equal(accessDecision(route, 'tenant', route.path).action, 'allow');
});

test('unknown URLs are shown as not-found rather than redirected or blocked', () => {
  const route = parseLocation('/no-such-page');
  assert.equal(route.isKnown, false);
  for (const role of ROLES) {
    assert.equal(accessDecision(route, role, route.path).action, 'allow');
  }
});

/* -------------------------------------------------------------------------- */
/* F. Post-login redirect safety                                              */
/* -------------------------------------------------------------------------- */

test('?next= is honoured only when the role may open it', () => {
  assert.equal(isSafeRedirect('/tenant/viewings', 'tenant'), true);
  assert.equal(isSafeRedirect('/tenant/viewings', 'landlord'), false);
  assert.equal(isSafeRedirect('/admin', 'admin'), true);
  assert.equal(isSafeRedirect('/admin', 'tenant'), false);
  assert.equal(isSafeRedirect('/properties', 'agent'), true);
});

test('?next= can not be used as an open redirect or a login loop', () => {
  const rejected = [
    'https://evil.example.com',
    '//evil.example.com',
    'javascript:alert(1)',
    '/\\evil.com',
    '/login',
    '/register',
    '/reset-password',
    '/admin-login',
    '/no-such-page',
    '',
    null,
    undefined,
  ];
  for (const value of rejected) {
    assert.equal(isSafeRedirect(value, 'tenant'), false, `${String(value)} must be rejected`);
  }
});

/* -------------------------------------------------------------------------- */
/* G. Helpers used by the components                                          */
/* -------------------------------------------------------------------------- */

test('dashboardPath sends each role to its own workspace', () => {
  assert.equal(dashboardPath('tenant'), '/tenant/dashboard');
  assert.equal(dashboardPath('landlord'), '/landlord/dashboard');
  assert.equal(dashboardPath('agent'), '/agent/dashboard');
  assert.equal(dashboardPath('admin'), '/admin');
  assert.equal(dashboardPath('guest'), '/login');
});

test('legacy view names still resolve to real routes', () => {
  const here = parseLocation('/');
  assert.equal(pathForView('browse', 'guest', here), '/properties');
  assert.equal(pathForView('find-home', 'guest', here), '/find-a-home');
  assert.equal(pathForView('dashboard', 'tenant', here), '/tenant/dashboard');
  assert.equal(pathForView('dashboard', 'admin', here), '/admin');
  assert.equal(pathForView('profile', 'landlord', here), '/landlord/profile');
  assert.equal(pathForView('notifications', 'agent', here), '/agent/notifications');
  assert.equal(pathForView('my-properties', 'landlord', here), '/landlord/properties');
  // A guest asking for a dashboard is sent to sign in, not to a broken page.
  assert.equal(pathForView('dashboard', 'guest', here), '/login');
});

test('view names are derived from the route, never stored', () => {
  assert.equal(viewForRoute(parseLocation('/')), 'home');
  assert.equal(viewForRoute(parseLocation('/properties')), 'browse');
  assert.equal(viewForRoute(parseLocation('/property/abc')), 'property-detail');
  assert.equal(viewForRoute(parseLocation('/find-a-home')), 'find-home');
  assert.equal(viewForRoute(parseLocation('/list-property')), 'list-property');
  assert.equal(viewForRoute(parseLocation('/tenant/viewings')), 'dashboard');
  assert.equal(viewForRoute(parseLocation('/tenant/notifications')), 'notifications');
  assert.equal(viewForRoute(parseLocation('/admin/finance')), 'admin');
  assert.equal(viewForRoute(parseLocation('/nope')), 'not-found');
});

/* -------------------------------------------------------------------------- */
/* H. Search filters in the URL                                               */
/* -------------------------------------------------------------------------- */

test('filter query strings are built and read back unchanged', () => {
  const query = buildQuery({
    q: 'villa with pool',
    location: 'East Legon',
    type: 'Luxury Villa',
    bedrooms: 2,
    maxRent: 8000,
    empty: '',
    missing: undefined,
  });
  assert.equal(query, '?q=villa%20with%20pool&location=East%20Legon&type=Luxury%20Villa&bedrooms=2&maxRent=8000');
  const route = parseLocation(`/properties${query}`);
  assert.deepEqual(route.query, {
    q: 'villa with pool',
    location: 'East Legon',
    type: 'Luxury Villa',
    bedrooms: '2',
    maxRent: '8000',
  });
});

test('the URL carries no credentials or session material', () => {
  const sensitive = ['token', 'password', 'session', 'secret', 'apikey'];
  for (const path of PUBLIC_ROUTES) {
    const route = parseLocation(path);
    for (const key of Object.keys(route.query)) {
      assert.ok(!sensitive.includes(key.toLowerCase()), `${path} carries a ${key} parameter`);
    }
  }
  assert.deepEqual(parseQuery(''), {});
});

/* -------------------------------------------------------------------------- */
/* I. Round trip: every canonical path parses back to itself                  */
/* -------------------------------------------------------------------------- */

test('canonical URLs round-trip through the parser', () => {
  const paths = [
    ...PUBLIC_ROUTES,
    '/property/abc-123',
    '/tenant/dashboard',
    '/tenant/notifications',
    '/landlord/properties',
    '/agent/finance',
    '/admin/approval-queue',
    '/admin',
  ];
  for (const path of paths) {
    const route = parseLocation(path);
    assert.equal(route.isKnown, true, `${path} should be known`);
    assert.equal(route.path, path, `${path} should be its own canonical path`);
    assert.equal(legacyRedirect(path), null, `${path} should not redirect`);
    assert.equal(route.path, parseLocation(route.path).path);
  }
});

/* -------------------------------------------------------------------------- */
/* J. Guard chains terminate (no redirect loops)                              */
/* -------------------------------------------------------------------------- */

/** Follow guard decisions the way AppContext does, and fail if it never settles. */
function settle(start: string, role: UserRole): string[] {
  const visited: string[] = [];
  let current = start;
  for (let step = 0; step < 5; step += 1) {
    visited.push(current);
    const route = parseLocation(current);
    const decision = accessDecision(route, role, route.path);
    if (decision.action === 'allow') return visited;
    if (decision.action === 'forbidden') {
      // AppContext also shows a message and then navigates to the dashboard.
      current = decision.to;
      continue;
    }
    current = decision.to;
  }
  throw new Error(`guard chain did not settle from ${start} as ${role}: ${visited.join(' → ')}`);
}

test('every route settles for every role within a couple of redirects', () => {
  const paths = [
    ...PUBLIC_ROUTES,
    '/property/abc-123',
    '/tenant',
    '/landlord',
    '/agent',
    '/admin',
    '/tenant/dashboard',
    '/tenant/viewings',
    '/landlord/properties',
    '/landlord/verification',
    '/agent/finance',
    '/admin/finance',
    '/no-such-page',
  ];
  for (const path of paths) {
    for (const role of ROLES) {
      const trail = settle(path, role);
      assert.ok(trail.length <= 3, `${role} ${path} took ${trail.join(' → ')}`);
      const landed = parseLocation(trail[trail.length - 1]);
      assert.equal(
        accessDecision(landed, role, landed.path).action,
        'allow',
        `${role} did not land on a page it may open (${trail.join(' → ')})`
      );
    }
  }
});

test('a guest who signs in reaches the page they originally asked for', () => {
  const wanted = '/tenant/saved-properties';
  const route = parseLocation(wanted);
  const decision = accessDecision(route, 'guest', route.path);
  assert.equal(decision.action, 'login');

  // After signing in as a tenant, AppContext reads ?next= from the login URL.
  const loginRoute = parseLocation((decision as { to: string }).to);
  const next = loginRoute.query.next;
  assert.equal(next, wanted);
  assert.equal(isSafeRedirect(next, 'tenant'), true);
  assert.equal(parseLocation(next as string).name, 'tenant');
});

test('a guest who signs in as the wrong role is sent to their own workspace', () => {
  const wanted = '/admin';
  const decision = accessDecision(parseLocation(wanted), 'guest', wanted);
  const next = parseLocation((decision as { to: string }).to).query.next;
  assert.equal(next, wanted);
  // A tenant may not follow through to /admin …
  assert.equal(isSafeRedirect(next, 'tenant'), false);
  // … and accessDecision says where they should go instead.
  assert.deepEqual(accessDecision(parseLocation(wanted), 'tenant', wanted), {
    action: 'forbidden',
    to: '/tenant/dashboard',
  });
});

/* -------------------------------------------------------------------------- */
/* N. Navigation model (Task 04)                                              */
/* -------------------------------------------------------------------------- */

/**
 * The chrome reads its links from src/navigation/navModel.ts. These checks keep
 * the model honest: a URL must still be a real route, the member must be allowed
 * to open it, and no destination may be listed twice.
 */
test('every navigation link is a real, allowed URL', async () => {
  const { navForRole } = await import('../src/navigation/navModel.ts');

  for (const role of ROLES) {
    const nav = navForRole(role);
    const items = [...nav.desktop, ...nav.menu, ...(nav.cta ? [nav.cta] : [])];
    for (const item of items) {
      const route = parseLocation(item.path);
      assert.equal(route.isKnown, true, `${role}: ${item.label} → ${item.path} is a real page`);
      assert.equal(
        accessDecision(route, role, route.path).action,
        'allow',
        `${role} may open ${item.path}`
      );
    }
    for (const tab of nav.bottom) {
      if ('kind' in tab) continue;
      const route = parseLocation(tab.path);
      assert.equal(route.isKnown, true, `${role}: ${tab.label} → ${tab.path} is a real page`);
      assert.equal(
        accessDecision(route, role, route.path).action,
        'allow',
        `${role} may open ${tab.path}`
      );
    }
  }
});

test('the bottom bar lists at most five destinations and never repeats the menu', async () => {
  const { navForRole, isMemberRole } = await import('../src/navigation/navModel.ts');

  for (const role of ROLES) {
    const nav = navForRole(role);
    assert.ok(nav.bottom.length <= 5, `${role}: ${nav.bottom.length} quick links`);

    // The quick bar and the hamburger are on screen together, so a destination
    // may only appear in one of them.
    const bottomPaths = nav.bottom.filter((tab) => !('kind' in tab)).map((tab) => (tab as { path: string }).path);
    for (const item of nav.menu) {
      assert.ok(!bottomPaths.includes(item.path), `${role}: ${item.path} is in both the quick bar and the menu`);
    }

    // Within a single surface no link is repeated either.
    assert.equal(new Set(nav.menu.map((item) => item.path)).size, nav.menu.length, `${role}: menu repeats a link`);
    assert.equal(
      new Set(nav.desktop.map((item) => item.path)).size,
      nav.desktop.length,
      `${role}: the top bar repeats a link`
    );
    assert.equal(new Set(bottomPaths).size, bottomPaths.length, `${role}: the quick bar repeats a link`);

    // A member's top bar and menu are shown in the same header area, so they do
    // not overlap. (A visitor's menu only renders below `md`, where the desktop
    // row is hidden, so the public pages may appear in both.)
    if (isMemberRole(role)) {
      for (const item of nav.menu) {
        assert.ok(
          !nav.desktop.some((link) => link.path === item.path),
          `${role}: ${item.path} is in both the top bar and the menu`
        );
      }
      assert.ok(nav.desktop.length <= 4, `${role}: the top bar carries ${nav.desktop.length} links`);
    }
  }
});

test('an account area never links to another role’s pages', async () => {
  const { navForRole } = await import('../src/navigation/navModel.ts');

  for (const role of ['tenant', 'landlord', 'agent'] as const) {
    const nav = navForRole(role);
    const paths = [
      ...nav.desktop.map((item) => item.path),
      ...nav.menu.map((item) => item.path),
      ...nav.bottom.filter((tab) => !('kind' in tab)).map((tab) => (tab as { path: string }).path),
    ];
    for (const other of ['tenant', 'landlord', 'agent', 'admin']) {
      if (other === role) continue;
      assert.ok(
        !paths.some((path) => path === `/${other}` || path.startsWith(`/${other}/`)),
        `${role} must not link into /${other}`
      );
    }
  }
});

test('dashboard, profile and settings stay three different URLs for every member', async () => {
  const { navForRole } = await import('../src/navigation/navModel.ts');

  for (const role of ['tenant', 'landlord', 'agent'] as const) {
    const nav = navForRole(role);
    const { dashboard, profile, notifications, settings } = nav.account;
    assert.equal(dashboard, `/${role}/dashboard`);
    assert.equal(profile, `/${role}/profile`);
    assert.equal(settings, `/${role}/settings`);
    assert.equal(notifications, `/${role}/notifications`);
    assert.equal(new Set([dashboard, profile, settings, notifications]).size, 4, `${role} pages are distinct`);
    // The avatar opens Profile; the menu owns Settings. Neither is the dashboard.
    assert.notEqual(profile, dashboard);
    assert.notEqual(settings, profile);
  }
});

/* -------------------------------------------------------------------------- */
/* Task 07: the Learning Centre URLs, and its console section                 */
/* -------------------------------------------------------------------------- */

test('the Learning Centre and each article have their own clean URL', () => {
  const index = parseLocation('/blog');
  assert.equal(index.name, 'blog');
  assert.equal(index.isKnown, true);
  assert.equal(index.path, '/blog');

  const article = parseLocation('/blog/top-available-properties-east-legon');
  assert.equal(article.name, 'blog-post');
  assert.equal(article.params.slug, 'top-available-properties-east-legon');
  assert.equal(article.path, '/blog/top-available-properties-east-legon');
  assert.equal(article.isKnown, true);
  assert.equal(parseLocation('/blog/top-available-properties-east-legon/').name, 'blog-post');

  // Same page, one address: the trailing slash is not a second URL.
  assert.equal(parseLocation('/blog/top-available-properties-east-legon/').path, article.path);
});

test('a filtered or paged Learning Centre keeps its filters in the URL', () => {
  const route = parseLocation('/blog?category=tenant-guides&page=2&q=viewing');
  assert.equal(route.name, 'blog');
  assert.equal(route.query.category, 'tenant-guides');
  assert.equal(route.query.page, '2');
  assert.equal(route.query.q, 'viewing');
});

test('a malformed article URL is a not-found page, not a wildcard', () => {
  for (const url of [
    '/blog/Not A Slug',
    '/blog/TWO-Segments/extra',
    '/blog/UPPERCASE-SLUG',
    '/blog/slug_with_underscores',
  ]) {
    const route = parseLocation(url);
    assert.equal(route.name, 'not-found', `${url} must not resolve to an article`);
    assert.equal(route.isKnown, false);
  }
});

test('Blog Management and Email Templates are console sections with their own URLs', () => {
  for (const [tab, section] of [
    ['blog', 'blog'],
    ['email-templates', 'email-templates'],
  ] as const) {
    assert.equal(sectionForTab('admin', tab), section);
    assert.equal(tabPath('admin', tab), `/admin/${section}`);
    assert.equal(tabForRoute(parseLocation(`/admin/${section}`)), tab);
  }
  // They are administrator-only: no other role can reach the console at all.
  for (const role of ['guest', 'tenant', 'landlord', 'agent'] as UserRole[]) {
    const route = parseLocation('/admin/blog');
    assert.notEqual(accessDecision(route, role, route.path).action, 'allow');
  }
  assert.equal(accessDecision(parseLocation('/admin/blog'), 'admin', '/admin/blog').action, 'allow');
});

test('the public Learning Centre stays open to guests and members alike', () => {
  for (const role of ROLES) {
    for (const url of ['/blog', '/blog/top-available-properties-east-legon']) {
      const route = parseLocation(url);
      assert.equal(accessDecision(route, role, route.path).action, 'allow', `${role} may read ${url}`);
    }
  }
});
