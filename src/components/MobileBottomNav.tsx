import React from 'react';
import { useApp } from '../context/AppContext';
import { activeItemId, isNavAction, navForRole, type BottomTab } from '../navigation/navModel';

interface MobileBottomNavProps {
  onOpenAuth: () => void;
}

/**
 * The mobile bottom bar: at most five quick tabs, one per role.
 *
 * Task 04 changes:
 *   • the links come from `navForRole(role).bottom` (src/navigation/navModel.ts)
 *     instead of being written out here, so the bar and the navbar can no longer
 *     drift apart;
 *   • the unread-notifications dot is **gone**. It used to sit on the Profile
 *     icon, which made the button look like it opened notifications while it
 *     opened the profile. Notifications now have their own entry point — the
 *     labelled bell in the header, which carries the count;
 *   • every tab is a 44px-high touch target with one icon size, and the tab that
 *     matches the current URL is marked `aria-current="page"` for assistive tech.
 *
 * Guests get Home / Browse / Find Home / Login; members get the four sections
 * they use most plus Profile. Anything else is one tap away in the hamburger.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onOpenAuth }) => {
  const { currentRole, route, navigate } = useApp();
  const nav = navForRole(currentRole);
  const tabs = nav.bottom;

  if (tabs.length === 0) return null;

  const activeId = activeItemId(
    tabs.filter((tab) => !isNavAction(tab)) as Array<{ id: string; path: string; activeFor?: string[] }>,
    route.path
  );

  const renderTab = (tab: BottomTab) => {
    const Icon = tab.icon;
    const isActive = !isNavAction(tab) && tab.id === activeId;
    const isEmphasis = !isNavAction(tab) && tab.emphasis;
    const onClick = isNavAction(tab) ? onOpenAuth : () => navigate(tab.path);

    return (
      <button
        key={tab.id}
        type="button"
        onClick={onClick}
        aria-current={isActive ? 'page' : undefined}
        aria-label={tab.description ?? tab.label}
        title={tab.description ?? tab.label}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] rounded-lg transition-colors ${
          isActive
            ? 'text-[#08D9D6]'
            : isEmphasis
              ? 'text-[#08D9D6]/90'
              : 'text-slate-400 hover:text-white'
        }`}
      >
        <Icon className={`w-[22px] h-[22px] ${isActive || isEmphasis ? 'text-[#08D9D6]' : ''}`} />
        <span className={`text-[10px] leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
      </button>
    );
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#252A34]/95 backdrop-blur-lg border-t border-white/10 shadow-2xl pb-[env(safe-area-inset-bottom)]">
      <nav aria-label="Quick links" className="flex items-stretch justify-around px-1">
        {tabs.map(renderTab)}
      </nav>
    </div>
  );
};
