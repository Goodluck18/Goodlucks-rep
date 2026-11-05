/**
 * Goodlucks Homes — central route table.
 *
 * This module is the single source of truth for the relationship between a
 * browser URL and an application page. It is deliberately pure: it takes a URL
 * string and returns a route description, and it builds URLs from route names.
 * Nothing here touches React, the DOM or the API, which is what makes the
 * routing rules testable without a browser (tests/routing.test.mts).
 *
 * The application's `AppContext` owns the *current* route and keeps it in step
 * with the address bar (pushState, popstate, refresh). Components ask for a
 * route by name; they never calculate paths themselves and they never keep a
 * private copy of the current page.
 */

import type { UserRole } from '../types';

export interface RouteState {
  /** Which page the URL points at. */
  name: RouteName;
  /** Canonical path, always with a leading slash and no trailing slash. */
  path: string;
  /** Path parameters (`/property/:id` → `{ id }`). */
  params: Record<string, string>;
  /** Query string as a plain map; repeated keys keep the last value. */
  query: Record<string, string>;
  /** Dashboard sub-section, when the route has one. */
  section?: string;
  /** True when the URL matched a real route (false → the not-found page). */
  isKnown: boolean;
}

export type RouteName =
  | 'home'
  | 'browse'
  | 'find-home'
  | 'property-detail'
  | 'about'
  | 'contact'
  | 'receipts'
  | 'list-property'
  | 'login'
  | 'register'
  | 'reset-password'
  | 'admin-login'
  | 'admin'
  | 'tenant'
  | 'landlord'
  | 'agent'
  | 'not-found';

/** Roles that may open a protected page. */
const ACCOUNT_ROLES: Record<string, UserRole[]> = {
  admin: ['admin'],
  tenant: ['tenant'],
  landlord: ['landlord'],
  agent: ['agent'],
};

/**
 * Dashboard sections that really exist in the components.
 *
 * The left-hand value is the URL segment, the right-hand value is the section
 * identifier the component uses for its tabs. Several URL names can point at the
 * same tab (the descriptions the business uses and the short names the UI uses);
 * each tab keeps exactly one canonical URL through `canonicalSection()`.
 */
export interface SectionMap {
  /** URL segments that are accepted for this role → tab id inside the component. */
  accepted: Record<string, string>;
  /** Tab id → the canonical URL segment. */
  canonical: Record<string, string>;
  /** Section used when the URL only names the role (e.g. /tenant). */
  fallback: string;
}

export const ROLE_SECTIONS: Record<'tenant' | 'landlord' | 'agent' | 'admin', SectionMap> = {
  tenant: {
    accepted: {
      dashboard: 'requests',
      'rental-requests': 'requests',
      requests: 'requests',
      matches: 'matches',
      viewings: 'viewings',
      'saved-properties': 'saved',
      saved: 'saved',
      'search-alerts': 'alerts',
      alerts: 'alerts',
      profile: 'profile',
      // There is no separate notifications screen: the dashboard's Activity
      // Feed is the notification surface, so this URL focuses it and marks it
      // read. It is kept because the header bell has always linked to it.
      notifications: 'requests',
    },
    canonical: {
      requests: 'dashboard',
      matches: 'matches',
      viewings: 'viewings',
      saved: 'saved-properties',
      alerts: 'search-alerts',
      profile: 'profile',
    },
    fallback: 'dashboard',
  },
  landlord: {
    accepted: {
      dashboard: 'my-properties',
      properties: 'my-properties',
      'my-properties': 'my-properties',
      viewings: 'viewings',
      profile: 'profile',
      verification: 'identity',
      identity: 'identity',
      notifications: 'my-properties',
    },
    canonical: {
      'my-properties': 'properties',
      viewings: 'viewings',
      profile: 'profile',
      identity: 'verification',
    },
    fallback: 'dashboard',
  },
  agent: {
    accepted: {
      dashboard: 'overview',
      overview: 'overview',
      profile: 'profile',
      properties: 'properties',
      viewings: 'viewings',
      finance: 'finance',
      verification: 'verification',
      notifications: 'overview',
    },
    canonical: {
      overview: 'dashboard',
      profile: 'profile',
      properties: 'properties',
      viewings: 'viewings',
      finance: 'finance',
      verification: 'verification',
    },
    fallback: 'dashboard',
  },
  admin: {
    accepted: {
      analytics: 'analytics',
      dashboard: 'analytics',
      'approval-queue': 'approval-queue',
      manage: 'manage',
      matching: 'matching',
      viewings: 'viewings',
      enquiries: 'enquiries',
      'email-logs': 'email-logs',
      agents: 'agents',
      'fee-policies': 'fee-policies',
      finance: 'finance',
    },
    canonical: {
      analytics: 'analytics',
      'approval-queue': 'approval-queue',
      manage: 'manage',
      matching: 'matching',
      viewings: 'viewings',
      enquiries: 'enquiries',
      'email-logs': 'email-logs',
      agents: 'agents',
      'fee-policies': 'fee-policies',
      finance: 'finance',
    },
    fallback: 'analytics',
  },
};

/** Top-level public pages: path → route name. */
const PUBLIC_PATHS: Record<string, RouteName> = {
  '/': 'home',
  '/properties': 'browse',
  '/find-a-home': 'find-home',
  '/about': 'about',
  '/contact': 'contact',
  '/receipts': 'receipts',
  '/list-property': 'list-property',
  '/login': 'login',
  '/register': 'register',
  '/reset-password': 'reset-password',
  '/admin-login': 'admin-login',
};

const ROLE_ROOTS = new Set(['tenant', 'landlord', 'agent', 'admin']);

const PROPERTY_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Normalise a URL or path into `{ pathname, search, hash }`. */
export function splitUrl(rawUrl: string): { pathname: string; search: string; hash: string } {
  let value = (rawUrl || '/').trim();
  // Accept absolute URLs (the tests use them; the browser passes relative ones).
  const absolute = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.exec(value);
  if (absolute) value = value.slice(absolute[0].length) || '/';
  if (!value.startsWith('/')) value = '/' + value;

  const hashIndex = value.indexOf('#');
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
  if (hashIndex >= 0) value = value.slice(0, hashIndex);

  const queryIndex = value.indexOf('?');
  const search = queryIndex >= 0 ? value.slice(queryIndex) : '';
  if (queryIndex >= 0) value = value.slice(0, queryIndex);

  return { pathname: normalisePath(value), search, hash };
}

/** Collapse duplicate slashes and drop a trailing slash (except for `/`). */
export function normalisePath(pathname: string): string {
  let path = (pathname || '/').replace(/\/{2,}/g, '/');
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path === '' ? '/' : path;
}

/** Parse a query string into a plain map (last value wins for repeated keys). */
export function parseQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) return out;
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decodeURIComponent((eq >= 0 ? pair.slice(0, eq) : pair).replace(/\+/g, ' '));
    const value = eq >= 0 ? decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' ')) : '';
    if (key) out[key] = value;
  }
  return out;
}

/** Build a query string from a map, dropping empty values. */
export function buildQuery(query: Record<string, string | number | null | undefined>): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(query)) {
    if (raw === null || raw === undefined) continue;
    const value = String(raw);
    if (value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** The canonical path of a role's workspace. */
export function dashboardPath(role: UserRole | string): string {
  if (role === 'admin') return '/admin';
  if (role === 'tenant' || role === 'landlord' || role === 'agent') return `/${role}/dashboard`;
  return '/login';
}

/** The role that owns a protected account area, or null for public pages. */
export function roleForSection(name: string): 'tenant' | 'landlord' | 'agent' | 'admin' | null {
  if (name === 'admin' || name === 'admin-login') return 'admin';
  if (name === 'tenant' || name === 'landlord' || name === 'agent') return name;
  return null;
}

/** The tab id a component should show for a dashboard route. */
export function tabForRoute(route: RouteState): string {
  if (route.name === 'tenant' || route.name === 'landlord' || route.name === 'agent' || route.name === 'admin') {
    const map = ROLE_SECTIONS[route.name];
    const key = route.section ?? map.fallback;
    return map.accepted[key] ?? map.accepted[map.fallback] ?? map.fallback;
  }
  return '';
}

/** The canonical URL segment for a tab id (so tab clicks never invent URLs). */
export function sectionForTab(
  role: 'tenant' | 'landlord' | 'agent' | 'admin',
  tab: string
): string {
  const map = ROLE_SECTIONS[role];
  return map.canonical[tab] ?? map.fallback;
}

/** Path for a dashboard tab. */
export function tabPath(role: 'tenant' | 'landlord' | 'agent' | 'admin', tab: string): string {
  const section = sectionForTab(role, tab);
  if (role === 'admin' && section === 'analytics') return '/admin';
  if (role !== 'admin' && section === 'dashboard') return `/${role}/dashboard`;
  return `/${role}/${section}`;
}

/**
 * Parse any URL into the route it describes.
 *
 * Unknown paths return `{ name: 'not-found', isKnown: false }` so the app can
 * render its own not-found page instead of a blank screen.
 */
export function parseLocation(rawUrl: string): RouteState {
  const { pathname, search } = splitUrl(rawUrl);
  const query = parseQuery(search);
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { name: 'home', path: '/', params: {}, query, isKnown: true };
  }

  // /property/<id> — the individual listing page.
  if (segments[0] === 'property' && segments.length === 2) {
    const id = segments[1];
    if (PROPERTY_ID.test(id)) {
      return {
        name: 'property-detail',
        path: `/property/${id}`,
        params: { id },
        query,
        isKnown: true,
      };
    }
    return { name: 'not-found', path: pathname, params: {}, query, isKnown: false };
  }

  // /<role>/<section?>
  if (ROLE_ROOTS.has(segments[0]) && segments.length <= 2) {
    const role = segments[0] as 'tenant' | 'landlord' | 'agent' | 'admin';
    const map = ROLE_SECTIONS[role];
    const rawSection = segments[1];
    if (rawSection === undefined) {
      // A bare role root redirects to its canonical workspace URL, so the same
      // page never has two URLs.
      return {
        name: role,
        path: `/${role}`,
        params: {},
        query,
        section: map.fallback,
        isKnown: true,
      };
    }
    if (!(rawSection in map.accepted)) {
      return { name: 'not-found', path: pathname, params: {}, query, isKnown: false };
    }
    return {
      name: role,
      path: `/${role}/${rawSection}`,
      params: {},
      query,
      section: rawSection,
      isKnown: true,
    };
  }

  const publicName = PUBLIC_PATHS[pathname];
  if (publicName) {
    return { name: publicName, path: pathname, params: {}, query, isKnown: true };
  }

  return { name: 'not-found', path: pathname, params: {}, query, isKnown: false };
}

/**
 * Where a URL the old build used to emit should go now.
 *
 * The pre-routing site produced `?property=<id>`, `#/property/<id>`,
 * `?reset=<token>` and mixed-case paths. Those links are in emails, WhatsApp
 * messages and people's bookmarks, so they must keep working: each one is
 * mapped to its canonical URL instead of being treated as unknown.
 */
export function legacyRedirect(rawUrl: string): string | null {
  const { pathname, search, hash } = splitUrl(rawUrl);
  const query = parseQuery(search);

  const hashProperty = /#\/?property\/([A-Za-z0-9_-]{1,64})/.exec(hash);
  if (hashProperty) return `/property/${hashProperty[1]}`;

  if (query.property && PROPERTY_ID.test(query.property)) {
    const rest = { ...query };
    delete rest.property;
    delete rest.p;
    return `/property/${query.property}${buildQuery(rest)}`;
  }
  if (query.p && PROPERTY_ID.test(query.p)) {
    const rest = { ...query };
    delete rest.p;
    delete rest.property;
    return `/property/${query.p}${buildQuery(rest)}`;
  }

  if (query.reset) {
    const rest = { ...query };
    const token = rest.reset;
    delete rest.reset;
    return `/reset-password${buildQuery({ ...rest, token })}`;
  }

  const lower = pathname.toLowerCase();
  if (lower !== pathname) {
    return lower + (search || '');
  }

  return null;
}

export type AccessDecision =
  | { action: 'allow' }
  | { action: 'login'; to: string; next: string }
  | { action: 'forbidden'; to: string }
  | { action: 'redirect'; to: string };

/**
 * Decide whether `role` may see `route`.
 *
 * This is a *presentation* guard: it decides which screen to show. The server
 * remains the authority for every piece of data — the API refuses requests from
 * a role that is not permitted, so hiding a page here is never the only
 * protection.
 */
export function accessDecision(route: RouteState, role: UserRole, currentPath: string): AccessDecision {
  if (!route.isKnown) {
    return { action: 'allow' };
  }

  // A bare role root always redirects to the canonical workspace URL.
  if (
    (route.name === 'tenant' || route.name === 'landlord' || route.name === 'agent' || route.name === 'admin') &&
    route.path === `/${route.name}`
  ) {
    const section = ROLE_SECTIONS[route.name].fallback;
    const to = route.name === 'admin' ? '/admin' : `/${route.name}/${section}`;
    if (to !== route.path) return { action: 'redirect', to };
  }

  // A signed-in member has no use for the sign-in screens: send them onwards
  // instead of letting them open a second, conflicting session flow.
  if ((route.name === 'login' || route.name === 'register') && role !== 'guest') {
    return { action: 'redirect', to: dashboardPath(role) };
  }

  if (route.name === 'admin-login') {
    // An admin who opens the admin login screen is already signed in: send them
    // to the console instead of asking for the access key again.
    if (role === 'admin') return { action: 'redirect', to: '/admin' };
    return { action: 'allow' };
  }

  const owner = roleForSection(route.name);
  if (!owner) return { action: 'allow' };

  const allowed = ACCOUNT_ROLES[owner] ?? [];
  if (allowed.includes(role)) return { action: 'allow' };

  if (role === 'guest') {
    return { action: 'login', to: `/login${buildQuery({ next: route.path })}`, next: route.path };
  }

  // Signed in, but this area belongs to another role. Send them somewhere real
  // and useful rather than showing another account's workspace.
  return { action: 'forbidden', to: dashboardPath(role) };
}

/**
 * The legacy `currentView` name for a route.
 *
 * Existing components compare `currentView` for highlighting and for a couple of
 * side effects (marking the activity feed read). Those comparisons keep working
 * because the view name is *derived* from the route — it is never stored.
 */
export function viewForRoute(route: RouteState): string {
  switch (route.name) {
    case 'home':
      return 'home';
    case 'browse':
      return 'browse';
    case 'find-home':
      return 'find-home';
    case 'property-detail':
      return 'property-detail';
    case 'about':
      return 'about';
    case 'contact':
      return 'contact';
    case 'receipts':
      return 'receipts';
    case 'list-property':
      return 'list-property';
    case 'login':
      return 'home';
    case 'register':
      return 'home';
    case 'reset-password':
      return 'reset-password';
    case 'admin-login':
      return 'admin-login';
    case 'admin':
      return 'admin';
    case 'tenant':
    case 'landlord':
    case 'agent':
      return route.section === 'notifications' ? 'notifications' : 'dashboard';
    default:
      return 'not-found';
  }
}

/** Can `path` be used as a post-login destination for `role`? */
export function isSafeRedirect(path: string | null | undefined, role: UserRole): boolean {
  if (!path) return false;
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (/[\\\s]/.test(path)) return false;
  const route = parseLocation(path);
  if (!route.isKnown) return false;
  if (route.name === 'login' || route.name === 'register' || route.name === 'reset-password' || route.name === 'admin-login') {
    return false;
  }
  return accessDecision(route, role, route.path).action === 'allow';
}

/**
 * Path for a legacy view name, used by the `setCurrentView()` compatibility
 * helper so that every existing navigation call keeps working (and now updates
 * the URL). New code should call `navigate()` with a real path instead.
 */
export function pathForView(view: string, role: UserRole, current: RouteState): string {
  switch (view) {
    case 'home':
      return '/';
    case 'browse':
      return '/properties';
    case 'find-home':
      return '/find-a-home';
    case 'about':
      return '/about';
    case 'contact':
      return '/contact';
    case 'receipts':
      return '/receipts';
    case 'list-property':
      return '/list-property';
    case 'admin-login':
      return '/admin-login';
    case 'property-detail':
      return current.name === 'property-detail' ? current.path : '/properties';
    case 'dashboard':
      return dashboardPath(role);
    case 'my-properties':
      return role === 'landlord' ? '/landlord/properties' : dashboardPath(role);
    case 'profile':
      if (role === 'admin') return '/admin';
      if (role === 'tenant' || role === 'landlord' || role === 'agent') return `/${role}/profile`;
      return '/login';
    case 'notifications':
      if (role === 'admin') return '/admin';
      if (role === 'tenant' || role === 'landlord' || role === 'agent') return `/${role}/notifications`;
      return '/login';
    default:
      return dashboardPath(role);
  }
}

/** Every canonical public path (used by the routing tests as a completeness check). */
export const PUBLIC_ROUTES: string[] = Object.keys(PUBLIC_PATHS);
