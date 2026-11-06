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
          ? 'text-[#08D9D6] bg-[#08D9D6]/10'
          : 'text-slate-300 hover:text-white hover:bg-white/5'
      }`}
    >
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#FF2E63] text-white text-[10px] font-black leading-4 text-center">
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
            ? 'text-[#08D9D6] bg-white/5 font-semibold'
            : 'text-slate-300 hover:text-white hover:bg-white/5'
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
          isActive ? 'bg-[#08D9D6]/15 text-[#08D9D6]' : 'text-slate-200 hover:bg-white/5 hover:text-white'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#252A34]/95 border-b border-white/10 text-[#EAEAEA] transition-all duration-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-3">
        {/* Brand */}
        <button
          onClick={() => handleNavClick('/')}
          className="flex items-center gap-2.5 group text-left focus:outline-none shrink-0"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#08D9D6] to-[#08D9D6]/70 p-0.5 shadow-md shadow-[#08D9D6]/20 group-hover:scale-105 transition-transform duration-200">
            <div className="w-full h-full bg-[#252A34] rounded-[10px] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[#08D9D6]" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg sm:text-xl tracking-tight text-white flex items-center gap-1.5">
              Goodlucks <span className="text-[#08D9D6]">Homes</span>
            </span>
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">
              Find. View. Rent.
            </span>
          </div>
        </button>

        {/* Desktop links — role correct, never another role's destinations */}
        <nav aria-label="Main" className="hidden md:flex items-center space-x-1 text-sm font-medium">
          {currentRole === 'admin' && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#FF2E63]/20 text-[#FF2E63] border border-[#FF2E63]/30 flex items-center gap-1">
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
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white hover:text-[#08D9D6] transition-colors"
                >
                  Login
                </button>
                <button
                  onClick={() => onOpenAuth('register')}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#08D9D6] text-[#252A34] hover:bg-[#08D9D6]/90 transition-all shadow-md shadow-[#08D9D6]/20 active:scale-95"
                >
                  Register
                </button>
              </>
            )}

            {nav.cta && ctaIcon && (
              <button
                onClick={() => handleNavClick(nav.cta!.path)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#08D9D6] text-[#252A34] hover:bg-[#08D9D6]/90 transition-all shadow-md shadow-[#08D9D6]/20 active:scale-95"
              >
                {React.createElement(ctaIcon, { className: 'w-4 h-4' })}
                {nav.cta.label}
              </button>
            )}

            {isMemberRole(currentRole) && (
              <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                {bell}
                <button
                  onClick={() => handleNavClick(nav.account.profile)}
                  title="Your profile"
                  className="flex items-center gap-2.5 rounded-xl px-1 py-1 hover:bg-white/5 transition-colors"
                >
                  <Avatar name={currentUser?.name} src={currentUser?.avatar} size="sm" />
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-semibold text-white leading-tight max-w-[9rem] truncate">
                      {currentUser?.name}
                    </span>
                    <span className="text-[10px] text-[#08D9D6] capitalize font-medium">
                      {currentRole} Account
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => void logout()}
                  title="Logout"
                  aria-label="Logout"
                  className="p-2.5 rounded-xl text-slate-400 hover:text-[#FF2E63] hover:bg-white/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
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
                className="p-2.5 rounded-xl text-slate-400 hover:text-[#FF2E63] hover:bg-white/5 transition-colors"
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
              className="p-2.5 rounded-xl bg-white/5 text-slate-200 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
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
          className="md:hidden bg-[#252A34] border-b border-white/10 px-4 pt-3 pb-4 space-y-1 max-h-[calc(100vh-4rem)] overflow-y-auto animate-fadeIn"
        >
          {isMemberRole(currentRole) && (
            <div className="flex items-center gap-3 pb-3 mb-1 border-b border-white/10">
              <Avatar name={currentUser?.name} src={currentUser?.avatar} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{currentUser?.name || 'Your account'}</p>
                <p className="text-[11px] text-[#08D9D6] capitalize font-semibold">{currentRole} account</p>
              </div>
            </div>
          )}

          {nav.menu.map(menuLink)}

          <div className="pt-3 mt-2 border-t border-white/10 space-y-2">
            {currentRole === 'guest' ? (
              <>
                {/* Signing in lives in the bottom bar (one tap); the menu only
                    offers the account a visitor has not created yet. */}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenAuth('register');
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#08D9D6] text-center text-sm font-semibold text-[#252A34] min-h-[44px]"
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
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-[#FF8FA8] bg-[#FF2E63]/10 hover:bg-[#FF2E63]/20 min-h-[44px]"
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
