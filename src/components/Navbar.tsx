import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Bell, Building2, ChevronRight, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { Avatar } from './dashboard/DashboardShell';
import { activeItemId, isMemberRole, navForRole, type NavItem } from '../navigation/navModel';

interface NavbarProps {
  onOpenAuth: (initialMode?: 'login' | 'register') => void;
}

/**
 * The site header.
 *
 * Task 04: the header is now a single data-driven surface. It no longer carries
 * one hand-written link list per role for desktop and a second, different one
 * for the mobile drawer — both read `navForRole(role)` (src/navigation/navModel.ts).
 *
 * The header holds:
 *   • the brand (always links home);
 *   • the desktop link row (`md` and up): Home / Browse / Dashboard, or the
 *     visitor's public pages;
 *   • the account cluster: the notifications bell (with its unread count), the
 *     avatar (a shortcut to Profile), and logout;
 *   • the hamburger (`md` and below) with the secondary/account links that are
 *     *not* already in the bottom bar, plus the way out (login/register/logout).
 *
 * Dashboard, Profile and Settings remain three separate pages: the avatar opens
 * Profile, the menu has its own Account settings row, and the Dashboard link
 * opens the dashboard. Nothing here points two different labels at one page.
 */
export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth }) => {
  const { currentUser, currentRole, route, navigate, logout, notifications } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = navForRole(currentRole);
  const unreadCount = notifications.filter((n) => !n.read).length;
  const member = isMemberRole(currentRole);

  const ctaIcon = nav.cta ? nav.cta.icon : null;
  const desktopActiveId = activeItemId(nav.desktop, route.path);
  const menuActiveId = activeItemId(nav.menu, route.path);

  // Selecting anything closes the drawer, including a link that happens to be
  // the page you are already on (nothing should stay covering the content).
  const handleNavClick = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  // Any route change closes it too — Back/Forward must never leave a menu open.
  useEffect(() => {
    setMenuOpen(false);
  }, [route.path]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  /** The bell: the single notifications entry point, with the unread count. */
  const bell = member ? (
    <button
      type="button"
      onClick={() => handleNavClick(nav.account.notifications)}
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : 'Notifications'
      }
      aria-current={route.path === nav.account.notifications ? 'page' : undefined}
      className={`relative p-2.5 rounded-xl transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${
        route.path === nav.account.notifications
          ? 'bg-interactive text-ink'
          : 'text-ink/70 hover:text-ink hover:bg-page'
      }`}
    >
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-black leading-4 text-center">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  ) : null;

  /** One row in the desktop link row. */
  const desktopLink = (item: NavItem) => {
    const isActive = item.id === desktopActiveId;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleNavClick(item.path)}
        aria-current={isActive ? 'page' : undefined}
        className={`px-3.5 py-2 rounded-lg transition-all ${
          isActive
            ? 'bg-interactive text-ink font-bold'
            : 'text-ink/70 hover:text-ink hover:bg-page'
        }`}
      >
        {item.label}
      </button>
    );
  };

  /** One row in the hamburger. */
  const menuLink = (item: NavItem) => {
    const isActive = item.id === menuActiveId;
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleNavClick(item.path)}
        aria-current={isActive ? 'page' : undefined}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm font-semibold transition-colors min-h-[44px] ${
          isActive ? 'bg-interactive text-ink' : 'text-ink/80 hover:bg-page hover:text-ink'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        <ChevronRight className="w-4 h-4 text-ink/70 shrink-0" />
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-surface/95 backdrop-blur-md border-b border-line text-ink">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-3">
        {/* Brand */}
        <button
          onClick={() => handleNavClick('/')}
          className="flex items-center gap-2.5 group text-left focus:outline-none shrink-0"
        >
          <div className="w-10 h-10 rounded-xl bg-interactive p-0.5 shadow-sm group-hover:scale-105 transition-transform duration-200">
            <div className="w-full h-full bg-surface rounded-[10px] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-ink" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg sm:text-xl tracking-tight text-ink flex items-center gap-1.5">
              Goodlucks <span className="text-accent">Homes</span>
            </span>
            <span className="text-[10px] uppercase tracking-widest text-ink/70 font-medium">
              Find. View. Rent.
            </span>
          </div>
        </button>

        {/* Desktop links — role correct, never another role's destinations */}
        <nav aria-label="Main" className="hidden md:flex items-center space-x-1 text-sm font-medium">
          {currentRole === 'admin' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-accent/10 text-accent-text border border-accent/40 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Goodlucks SaaS Admin
            </span>
          )}
          {nav.desktop.map(desktopLink)}
        </nav>

        {/* Right-hand account controls */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Desktop cluster */}
          <div className="hidden md:flex items-center gap-2">
            {currentRole === 'guest' && (
              <>
                <button
                  onClick={() => onOpenAuth('login')}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-ink/80 hover:text-ink hover:bg-page transition-colors"
                >
                  Login
                </button>
                <button
                  onClick={() => onOpenAuth('register')}
                  className="gl-btn gl-btn-primary px-4 text-sm"
                >
                  Register
                </button>
              </>
            )}

            {nav.cta && ctaIcon && (
              <button
                onClick={() => handleNavClick(nav.cta!.path)}
                className="gl-btn gl-btn-primary px-4 text-sm"
              >
                {React.createElement(ctaIcon, { className: 'w-4 h-4' })}
                {nav.cta.label}
              </button>
            )}

            {isMemberRole(currentRole) && (
              <div className="flex items-center gap-2 pl-2 border-l border-line">
                {bell}
                <button
                  onClick={() => handleNavClick(nav.account.profile)}
                  title="Your profile"
                  className="flex items-center gap-2.5 rounded-xl px-1 py-1 hover:bg-page transition-colors"
                >
                  <Avatar name={currentUser?.name} src={currentUser?.avatar} size="sm" />
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-semibold text-ink leading-tight max-w-[9rem] truncate">
                      {currentUser?.name}
                    </span>
                    <span className="text-[10px] text-ink/70 capitalize font-semibold">
                      {currentRole} Account
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => void logout()}
                  title="Logout"
                  aria-label="Logout"
                  className="p-2.5 rounded-xl text-ink/70 hover:text-accent hover:bg-page transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}

            {currentRole === 'admin' && (
              <button
                onClick={() => void logout()}
                title="Logout"
                aria-label="Logout"
                className="p-2.5 rounded-xl text-ink/70 hover:text-accent hover:bg-page transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Mobile cluster: the bell and the one menu. */}
          <div className="flex md:hidden items-center gap-1">
            {bell}
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="site-menu"
              className="p-2.5 rounded-xl bg-page text-ink border border-line hover:bg-interactive min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* The hamburger: secondary and account navigation only. */}
      {menuOpen && (
        <div
          id="site-menu"
          className="md:hidden bg-surface border-b border-line px-4 pt-3 pb-4 space-y-1 max-h-[calc(100vh-4rem)] overflow-y-auto"
        >
          {isMemberRole(currentRole) && (
            <div className="flex items-center gap-3 pb-3 mb-1 border-b border-line">
              <Avatar name={currentUser?.name} src={currentUser?.avatar} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink truncate">{currentUser?.name || 'Your account'}</p>
                <p className="text-[11px] text-ink/70 capitalize font-semibold">{currentRole} account</p>
              </div>
            </div>
          )}

          {nav.menu.map(menuLink)}

          <div className="pt-3 mt-2 border-t border-line space-y-2">
            {currentRole === 'guest' ? (
              <>
                {/* Signing in lives in the bottom bar (one tap); the menu only
                    offers the account a visitor has not created yet. */}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenAuth('register');
                  }}
                  className="w-full py-2.5 rounded-xl bg-interactive text-center text-sm font-semibold text-ink min-h-[44px]"
                >
                  Create an account
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-ink bg-accent/10 hover:bg-accent/20 min-h-[44px]"
              >
                <LogOut className="w-4 h-4" />
                Logout{currentUser?.name ? ` (${currentUser.name})` : ''}
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
