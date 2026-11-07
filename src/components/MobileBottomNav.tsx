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
        className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-0.5 py-2 my-1 min-h-[56px] rounded-xl transition-colors ${
          isActive
            ? 'bg-interactive/20 text-ink'
            : isEmphasis
              ? 'text-ink hover:bg-page'
              : 'text-ink/70 hover:text-ink hover:bg-page'
        }`}
      >
        <Icon className="w-[22px] h-[22px]" />
        <span className={`text-[10px] leading-none max-w-full truncate ${isActive ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
      </button>
    );
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]">
      <nav aria-label="Quick links" className="flex items-stretch justify-around px-1">
        {tabs.map(renderTab)}
      </nav>
    </div>
  );
};
