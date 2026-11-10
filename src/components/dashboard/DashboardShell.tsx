import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  Building2,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  Heart,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { UserRole } from '../../types';

/** The three account areas this shell serves. Administrators keep the console. */
export type DashboardRole = 'tenant' | 'landlord' | 'agent';

export interface DashboardNavItem {
  /** Section key, matching the route section (`sectionTab`). */
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  /** Optional one-line description shown on the section header. */
  description?: string;
  /** Shown as a count badge when greater than zero. */
  badge?: number;
}

interface DashboardShellProps {
  role: DashboardRole;
  /** Active section key (from the URL). */
  active: string;
  items: DashboardNavItem[];
  children: React.ReactNode;
}

const ROLE_LABEL: Record<DashboardRole, string> = {
  tenant: 'Tenant account',
  landlord: 'Landlord account',
  agent: 'Agent account',
};

/**
 * Initials stand-in for an account with no picture.
 *
 * Deliberately not a stock portrait: a photo that belongs to somebody else must
 * never be shown as if it were this member's own face.
 */
export const Avatar: React.FC<{ name?: string | null; src?: string | null; size?: 'sm' | 'md' | 'lg' }> = ({
  name,
  src,
  size = 'md',
}) => {
  const [failed, setFailed] = useState(false);
  const initials = (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const dimension = size === 'lg' ? 'w-20 h-20 text-2xl' : size === 'sm' ? 'w-9 h-9 text-xs' : 'w-12 h-12 text-sm';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name ? `${name}'s profile picture` : 'Profile picture'}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`${dimension} rounded-2xl object-cover border border-line bg-surface shrink-0`}
      />
    );
  }

  return (
    <div
      aria-hidden={initials ? undefined : true}
      className={`${dimension} rounded-2xl border border-line bg-page text-ink font-black flex items-center justify-center shrink-0`}
    >
      {initials || <UserRound className="w-1/2 h-1/2" />}
    </div>
  );
};

/** Consistent page title block for every dashboard section. */
export const SectionHeader: React.FC<{
  title: string;
  description?: string;
  actions?: React.ReactNode;
}> = ({ title, description, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-line pb-4">
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight">{title}</h1>
      {description && <p className="text-xs sm:text-sm text-ink/70 mt-1 max-w-2xl leading-relaxed">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
  </div>
);

/** A single figure on an overview page, linking to the section behind it. */
export const SummaryCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: 'default' | 'positive' | 'warning' | 'rose';
}> = ({ label, value, hint, icon: Icon, onClick, tone = 'default' }) => {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'rose'
          ? 'text-accent'
          : 'text-ink';

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left bg-surface border border-line rounded-2xl p-4 sm:p-5 hover:border-interactive transition-colors"
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[11px] sm:text-xs font-bold text-ink/70 uppercase tracking-wide">{label}</span>
        <Icon className={`w-4 h-4 ${toneClass}`} />
      </div>
      <div className={`text-xl sm:text-2xl font-black ${toneClass} truncate`}>{value}</div>
      {hint && (
        <div className="text-[11px] text-ink/70 mt-1 flex items-center gap-1">
          <span className="truncate">{hint}</span>
          <ChevronRight className="w-3 h-3 shrink-0 opacity-60 group-hover:opacity-100" />
        </div>
      )}
    </button>
  );
};

/** Consistent empty state. */
export const EmptyState: React.FC<{
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon: Icon, title, description, action }) => (
  <div className="text-center py-12 px-4 bg-surface rounded-2xl border border-line space-y-3">
    <Icon className="w-10 h-10 text-ink/70 mx-auto" />
    <div className="text-base font-bold text-ink">{title}</div>
    {description && <p className="text-xs text-ink/70 max-w-sm mx-auto leading-relaxed">{description}</p>}
    {action}
  </div>
);

/** Loading placeholder used while a dashboard section fetches its data. */
export const SectionLoading: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="flex items-center gap-3 text-xs text-ink/70 py-8 justify-center">
    <span className="w-4 h-4 border-2 border-interactive/30 border-t-interactive rounded-full animate-spin" />
    {label}
  </div>
);

/**
 * The account shell shared by the tenant, landlord and agent dashboards.
 *
 * One layout, three role-specific navigation sets: a sidebar on desktop, the
 * signed-in account always on screen, and the active section taken from the URL
 * (never from local state, so refresh and Back keep working).
 *
 * The section list is the desktop sidebar's. On a phone the same destinations
 * are reached through the site's own navigation (the bottom bar plus the single
 * hamburger in the header), so this shell no longer opens a second, competing
 * menu — Task 04 removed that duplicate drawer.
 */
export const DashboardShell: React.FC<DashboardShellProps> = ({ role, active, items, children }) => {
  const { currentUser, logout, navigate } = useApp();
  const activeItem = items.find((item) => item.key === active) ?? items[0];

  const navList = (
    <nav aria-label={`${ROLE_LABEL[role]} sections`} className="space-y-1">
      {items.map((item) => {
        const isActive = item.key === activeItem?.key;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => navigate(item.path)}
            aria-current={isActive ? 'page' : undefined}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-colors min-h-[44px] ${
              isActive
                ? 'bg-interactive text-ink shadow-md shadow-ink/10'
                : 'text-ink/70 hover:text-ink hover:bg-page'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  isActive ? 'bg-ink text-white' : 'bg-accent text-white'
                }`}
              >
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const accountCard = (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar name={currentUser?.name} src={currentUser?.avatar} />
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink truncate">{currentUser?.name || 'Your account'}</p>
        <p className="text-[11px] text-ink/70 font-semibold capitalize">{ROLE_LABEL[role]}</p>
        <p className="text-[11px] text-ink/70 truncate">{currentUser?.email}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-page text-ink">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-16 z-30 bg-surface/95 backdrop-blur-md border-b border-line">
        <div className="px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar name={currentUser?.name} src={currentUser?.avatar} size="sm" />
            <div className="min-w-0">
              <p className="text-[11px] text-ink/70 leading-tight">Signed in as</p>
              <p className="text-xs font-bold text-ink truncate">{currentUser?.name || 'Your account'}</p>
            </div>
          </div>
        </div>
        {/* The section you are on stays visible on small screens */}
        <div className="px-4 pb-2 -mt-0.5">
          <p className="text-[11px] text-interactive-text font-bold uppercase tracking-wider">{activeItem?.label}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 flex gap-6 lg:gap-8">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-60 xl:w-64 shrink-0">
          <div className="sticky top-24 space-y-4">
            <div className="gl-panel p-4">{accountCard}</div>
            <div className="gl-panel p-2">{navList}</div>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-ink/70 hover:text-ink hover:bg-page transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Section content */}
        {/* The page reserves room for the fixed mobile bottom bar; this only
            keeps the last card off the very edge. */}
        <main className="flex-1 min-w-0 space-y-5 pb-4 lg:pb-0">{children}</main>
      </div>
    </div>
  );
};

/** Navigation for each account area. Order is the order shown to the member. */
export function dashboardNav(
  role: DashboardRole,
  counts: { unreadNotifications?: number } = {}
): DashboardNavItem[] {
  const unread = counts.unreadNotifications ?? 0;

  if (role === 'tenant') {
    return [
      { key: 'overview', label: 'Overview', path: '/tenant/dashboard', icon: LayoutDashboard },
      { key: 'requests', label: 'Rental request', path: '/tenant/rental-requests', icon: ClipboardList },
      { key: 'matches', label: 'Matched properties', path: '/tenant/matches', icon: Sparkles },
      { key: 'viewings', label: 'Viewings', path: '/tenant/viewings', icon: CalendarCheck },
      { key: 'saved', label: 'Saved properties', path: '/tenant/saved-properties', icon: Heart },
      { key: 'alerts', label: 'Search alerts', path: '/tenant/search-alerts', icon: BellRing },
      { key: 'notifications', label: 'Notifications', path: '/tenant/notifications', icon: Bell, badge: unread },
      { key: 'profile', label: 'Profile', path: '/tenant/profile', icon: UserRound },
      { key: 'settings', label: 'Account settings', path: '/tenant/settings', icon: Settings },
    ];
  }

  if (role === 'landlord') {
    return [
      { key: 'overview', label: 'Overview', path: '/landlord/dashboard', icon: LayoutDashboard },
      { key: 'my-properties', label: 'My properties', path: '/landlord/properties', icon: Building2 },
      { key: 'viewings', label: 'Viewings', path: '/landlord/viewings', icon: CalendarCheck },
      { key: 'identity', label: 'Verification', path: '/landlord/verification', icon: ShieldCheck },
      { key: 'notifications', label: 'Notifications', path: '/landlord/notifications', icon: Bell, badge: unread },
      { key: 'profile', label: 'Profile', path: '/landlord/profile', icon: UserRound },
      { key: 'settings', label: 'Account settings', path: '/landlord/settings', icon: Settings },
    ];
  }

  return [
    { key: 'overview', label: 'Overview', path: '/agent/dashboard', icon: LayoutDashboard },
    { key: 'properties', label: 'Submitted listings', path: '/agent/properties', icon: Building2 },
    { key: 'viewings', label: 'Viewings', path: '/agent/viewings', icon: CalendarCheck },
    { key: 'finance', label: 'Finance', path: '/agent/finance', icon: ReceiptText },
    { key: 'verification', label: 'Verification', path: '/agent/verification', icon: ShieldCheck },
    { key: 'status', label: 'Account status', path: '/agent/status', icon: UserRound },
    { key: 'notifications', label: 'Notifications', path: '/agent/notifications', icon: Bell, badge: unread },
    { key: 'profile', label: 'Profile', path: '/agent/profile', icon: UserRound },
    { key: 'settings', label: 'Account settings', path: '/agent/settings', icon: Settings },
  ];
}

/** True when the signed-in role owns the given dashboard area. */
export function ownsArea(role: UserRole, area: DashboardRole): boolean {
  return role === area;
}
