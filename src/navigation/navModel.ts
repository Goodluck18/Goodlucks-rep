/**
 * Goodlucks Homes — one description of the site navigation.
 *
 * Task 04 removed the duplication that had built up in three places: the navbar
 * hand-wrote one link list per role for the desktop bar *and* a second, different
 * list per role for its mobile drawer, while the mobile bottom bar and the
 * dashboard shell each computed their own destinations again. The result was
 * that the same page could be reached from two or three places with three
 * different labels, and some destinations (Settings, Verification, Receipts…)
 * were reachable from one surface but not another.
 *
 * Everything a member can reach from the global chrome is described here, once,
 * per role:
 *
 *   `desktop` — links inside the top bar (only rendered at `md` and up);
 *   `bottom`  — the five quick tabs in the mobile bottom bar;
 *   `menu`    — the hamburger's secondary/account links (rendered at every
 *               width below `md`, plus the desktop account area);
 *   `cta`     — the single highlighted primary action for the role (desktop).
 *
 * The rules the data below is written to keep:
 *
 *  - a destination appears in `bottom` *or* in `menu`, never in both;
 *  - a destination that has its own tab (Notifications) is not repeated as a
 *    menu row — the bell in the header carries the unread count instead;
 *  - Dashboard, Profile and Settings are three separate pages and three
 *    separate entries;
 *  - a role never sees another role's entries.
 *
 * Paths come from the central route table (`tabPath`) so a URL can only be
 * invented in one place, and they are the same URLs the dashboard sidebar uses.
 */

import {
  BellRing,
  BookOpen,
  Building2,
  CalendarCheck,
  ClipboardList,
  Compass,
  Heart,
  Home,
  Info,
  LayoutDashboard,
  Mail,
  PlusCircle,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { tabPath } from '../routing/routes';
import type { UserRole } from '../types';

/** The canonical public URLs (see the route table in `src/routing/routes.ts`). */
const PUBLIC = {
  home: '/',
  browse: '/properties',
  findHome: '/find-a-home',
  listProperty: '/list-property',
  about: '/about',
  contact: '/contact',
  // Task 07: the Blog & Learning Centre is a public page, so it belongs in the
  // same public list as the others — not in a second menu of its own.
  blog: '/blog',
} as const;

/** The account areas that use the member dashboard shell. */
type MemberRole = 'tenant' | 'landlord' | 'agent';

export interface NavItem {
  /** Stable identifier (used as the React key and by the tests). */
  id: string;
  /** Visible label. Kept short in the bottom bar, spelled out in menus. */
  label: string;
  /** Spelled-out name for screen readers when `label` is abbreviated. */
  description?: string;
  path: string;
  icon: LucideIcon;
  /**
   * Extra URL prefixes that should light this item up (the item's own `path` is
   * always one). Used for "Browse", which also owns `/property/<id>`.
   */
  activeFor?: string[];
  /** Rendered as the highlighted primary action. */
  emphasis?: boolean;
}

/** A bottom-bar tab that opens the sign-in screen instead of navigating. */
export interface NavAction {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  kind: 'login';
}

export type BottomTab = NavItem | NavAction;

export interface RoleNav {
  /** Links in the top bar (desktop only). */
  desktop: NavItem[];
  /** Quick tabs in the mobile bottom bar — at most five. */
  bottom: BottomTab[];
  /** Secondary / account links in the hamburger menu (no logout row here). */
  menu: NavItem[];
  /** The single highlighted primary action for this role, if it has one. */
  cta: NavItem | null;
  /** Where the account pages live (used by the bell, avatar and menus). */
  account: { dashboard: string; profile: string; notifications: string; settings: string };
}

const isNavAction = (tab: BottomTab): tab is NavAction => 'kind' in tab;

export { isNavAction };

/** A path is active when it (or one of its prefixes) is the current page. */
export function matchesPath(prefix: string, currentPath: string): boolean {
  if (prefix === '/') return currentPath === '/';
  if (currentPath === prefix) return true;
  const withSlash = prefix.endsWith('/') ? prefix : `${prefix}/`;
  return currentPath.startsWith(withSlash);
}

/**
 * The one item in a list that should be highlighted for `currentPath`.
 *
 * The most specific match wins, so `/tenant/saved-properties` highlights "Saved"
 * rather than a broader entry that also happens to contain it.
 */
export function activeItemId<T extends { id: string; path: string; activeFor?: string[] }>(
  items: T[],
  currentPath: string
): string | null {
  let best: { id: string; length: number } | null = null;
  for (const item of items) {
    for (const prefix of item.activeFor ?? [item.path]) {
      if (!matchesPath(prefix, currentPath)) continue;
      if (!best || prefix.length > best.length) best = { id: item.id, length: prefix.length };
    }
  }
  return best?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/* Guest experience                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Visitors keep every useful public page. The bottom bar carries the three
 * things a visitor actually does (home, browse, find a home) plus sign-in; the
 * hamburger carries the pages *behind* those (list a property, about, contact)
 * so the two surfaces never repeat one another.
 *
 * Rent receipts are deliberately absent (Correction 2, completed by Upgrade 2
 * E1): the feature was removed outright, so there is no destination, no route
 * and no API for it. The stored history is untouched.
*/
const GUEST_NAV: RoleNav = {
  desktop: [
    { id: 'home', label: 'Home', path: PUBLIC.home, icon: Home },
    { id: 'browse', label: 'Browse Properties', path: PUBLIC.browse, activeFor: [PUBLIC.browse, '/property/'], icon: Search },
    { id: 'find-home', label: 'Find a Home', path: PUBLIC.findHome, icon: Compass },
    { id: 'list-property', label: 'List Property', path: PUBLIC.listProperty, icon: PlusCircle },
    { id: 'about', label: 'About', path: PUBLIC.about, icon: Info },
    { id: 'blog', label: 'Learning Centre', path: PUBLIC.blog, icon: BookOpen },
    { id: 'contact', label: 'Contact', path: PUBLIC.contact, icon: Mail },
  ],
  bottom: [
    { id: 'home', label: 'Home', path: PUBLIC.home, icon: Home },
    { id: 'browse', label: 'Browse', description: 'Browse properties', path: PUBLIC.browse, activeFor: [PUBLIC.browse, '/property/'], icon: Search },
    { id: 'find-home', label: 'Find Home', description: 'Find a home', path: PUBLIC.findHome, icon: Compass },
    { id: 'login', label: 'Login', description: 'Log in or register', icon: UserRound, kind: 'login' },
  ],
  menu: [
    { id: 'list-property', label: 'List Property', path: PUBLIC.listProperty, icon: PlusCircle },
    { id: 'blog', label: 'Learning Centre', path: PUBLIC.blog, icon: BookOpen },
    { id: 'about', label: 'About', path: PUBLIC.about, icon: Info },
    { id: 'contact', label: 'Contact', path: PUBLIC.contact, icon: Mail },
  ],
  cta: null,
  account: { dashboard: '/login', profile: '/login', notifications: '/login', settings: '/login' },
};

/* -------------------------------------------------------------------------- */
/* Member areas                                                               */
/* -------------------------------------------------------------------------- */

/** Where a member's own pages are; every URL comes from the route table. */
function accountFor(role: MemberRole): RoleNav['account'] {
  return {
    dashboard: tabPath(role, 'overview'),
    profile: tabPath(role, 'profile'),
    notifications: tabPath(role, 'notifications'),
    settings: tabPath(role, 'settings'),
  };
}

/** The two links every member keeps in the top bar. */
function memberDesktop(role: MemberRole): NavItem[] {
  const account = accountFor(role);
  return [
    { id: 'home', label: 'Home', path: PUBLIC.home, icon: Home },
    { id: 'browse', label: 'Browse Properties', path: PUBLIC.browse, activeFor: [PUBLIC.browse, '/property/'], icon: Search },
    { id: 'dashboard', label: 'Dashboard', path: account.dashboard, icon: LayoutDashboard },
  ];
}

/**
 * Tenant: the three things a renter does every day (search, saved shortlist,
 * viewings) plus their dashboard and profile. Everything else — the request
 * tracker, matches, alerts and settings — lives one tap away in the menu.
 */
function tenantNav(): RoleNav {
  const account = accountFor('tenant');
  return {
    desktop: memberDesktop('tenant'),
    bottom: [
      { id: 'browse', label: 'Browse', description: 'Browse properties', path: PUBLIC.browse, activeFor: [PUBLIC.browse, '/property/'], icon: Search },
      { id: 'dashboard', label: 'Dashboard', path: account.dashboard, icon: LayoutDashboard },
      { id: 'saved', label: 'Saved', description: 'Saved properties', path: tabPath('tenant', 'saved'), icon: Heart },
      { id: 'viewings', label: 'Viewings', path: tabPath('tenant', 'viewings'), icon: CalendarCheck },
      { id: 'profile', label: 'Profile', path: account.profile, icon: UserRound },
    ],
    menu: [
      { id: 'requests', label: 'Rental requests', path: tabPath('tenant', 'requests'), icon: ClipboardList },
      { id: 'matches', label: 'Matched properties', path: tabPath('tenant', 'matches'), icon: Sparkles },
      { id: 'alerts', label: 'Search alerts', path: tabPath('tenant', 'alerts'), icon: BellRing },
      { id: 'settings', label: 'Account settings', path: account.settings, icon: Settings },
    ],
    cta: null,
    account,
  };
}

/**
 * Landlord: the property portfolio, the submission action and the viewings that
 * need answering. Verification and settings are account business and
 * sit in the menu.
 */
function landlordNav(): RoleNav {
  const account = accountFor('landlord');
  return {
    desktop: memberDesktop('landlord'),
    bottom: [
      { id: 'dashboard', label: 'Dashboard', path: account.dashboard, icon: LayoutDashboard },
      { id: 'properties', label: 'Properties', description: 'My properties', path: tabPath('landlord', 'my-properties'), icon: Building2 },
      { id: 'list', label: 'List', description: 'List a property', path: PUBLIC.listProperty, icon: PlusCircle, emphasis: true },
      { id: 'viewings', label: 'Viewings', path: tabPath('landlord', 'viewings'), icon: CalendarCheck },
      { id: 'profile', label: 'Profile', path: account.profile, icon: UserRound },
    ],
    menu: [
      { id: 'verification', label: 'Verification', path: tabPath('landlord', 'identity'), icon: ShieldCheck },
      { id: 'settings', label: 'Account settings', path: account.settings, icon: Settings },
    ],
    // The same submission action, promoted as a button in the desktop top bar.
    cta: { id: 'list', label: 'List property', path: PUBLIC.listProperty, icon: PlusCircle },
    account,
  };
}

/**
 * Agent: submissions, viewings and finance are the working day. Verification and
 * account status are one-off checks, so they live in the menu.
 */
function agentNav(): RoleNav {
  const account = accountFor('agent');
  return {
    desktop: memberDesktop('agent'),
    bottom: [
      { id: 'dashboard', label: 'Dashboard', path: account.dashboard, icon: LayoutDashboard },
      { id: 'properties', label: 'Listings', description: 'Submitted listings', path: tabPath('agent', 'properties'), icon: Building2 },
      { id: 'viewings', label: 'Viewings', path: tabPath('agent', 'viewings'), icon: CalendarCheck },
      { id: 'finance', label: 'Finance', path: tabPath('agent', 'finance'), icon: Wallet },
      { id: 'profile', label: 'Profile', path: account.profile, icon: UserRound },
    ],
    menu: [
      { id: 'verification', label: 'Verification', path: tabPath('agent', 'verification'), icon: ShieldCheck },
      { id: 'status', label: 'Account status', path: tabPath('agent', 'status'), icon: UserRound },
      { id: 'settings', label: 'Account settings', path: account.settings, icon: Settings },
    ],
    cta: null,
    account,
  };
}

/**
 * Administrator: the console owns its own navigation, so the top bar only offers
 * the way back to it. The console is never given the member bottom bar.
 */
const ADMIN_NAV: RoleNav = {
  desktop: [{ id: 'workspace', label: 'Admin Workspace', path: '/admin', icon: ShieldCheck }],
  bottom: [],
  menu: [{ id: 'workspace', label: 'Admin Workspace', path: '/admin', icon: ShieldCheck }],
  cta: null,
  account: { dashboard: '/admin', profile: '/admin', notifications: '/admin', settings: '/admin' },
};

const NAV_BY_ROLE: Record<UserRole, RoleNav> = {
  guest: GUEST_NAV,
  tenant: tenantNav(),
  landlord: landlordNav(),
  agent: agentNav(),
  admin: ADMIN_NAV,
};

/** Everything the chrome needs to render this role's navigation. */
export function navForRole(role: UserRole | string): RoleNav {
  if (role === 'tenant' || role === 'landlord' || role === 'agent' || role === 'admin') {
    return NAV_BY_ROLE[role];
  }
  return NAV_BY_ROLE.guest;
}

/** True when the role signs in to an account area (and so has a bell + profile). */
export function isMemberRole(role: UserRole | string): role is MemberRole {
  return role === 'tenant' || role === 'landlord' || role === 'agent';
}
