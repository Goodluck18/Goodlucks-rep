import React from 'react';
import { useApp } from '../context/AppContext';
import { Home, Search, PlusCircle, LayoutDashboard, User as UserIcon, Bell, Compass } from 'lucide-react';

interface MobileBottomNavProps {
  onOpenAuth: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ onOpenAuth }) => {
  const { currentRole, currentView, setCurrentView, notifications } = useApp();

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#252A34]/95 backdrop-blur-lg border-t border-white/10 px-2 py-1.5 shadow-2xl">
      <div className="flex items-center justify-around text-slate-400">
        
        {/* Home */}
        <button
          onClick={() => setCurrentView('home')}
          className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
            currentView === 'home' ? 'text-[#08D9D6] font-bold scale-105' : 'hover:text-white'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Home</span>
        </button>

        {/* Browse */}
        <button
          onClick={() => setCurrentView('browse')}
          className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
            currentView === 'browse' ? 'text-[#08D9D6] font-bold scale-105' : 'hover:text-white'
          }`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Browse</span>
        </button>

        {/* Role Specific Action */}
        {currentRole === 'guest' && (
          <button
            onClick={() => setCurrentView('find-home')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
              currentView === 'find-home' ? 'text-[#08D9D6] font-bold scale-105' : 'hover:text-white'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Find Home</span>
          </button>
        )}

        {currentRole === 'tenant' && (
          <button
            onClick={() => setCurrentView('find-home')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
              currentView === 'find-home' ? 'text-[#08D9D6] font-bold scale-105' : 'hover:text-white'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Find Home</span>
          </button>
        )}

        {currentRole === 'landlord' && (
          <button
            onClick={() => setCurrentView('list-property')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
              currentView === 'list-property' ? 'text-[#08D9D6] font-bold scale-105' : 'hover:text-white'
            }`}
          >
            <PlusCircle className="w-5 h-5 text-[#08D9D6]" />
            <span className="text-[10px] mt-0.5 text-[#08D9D6] font-semibold">List</span>
          </button>
        )}

        {/* Dashboard / Profile */}
        {currentRole === 'guest' ? (
          <button
            onClick={onOpenAuth}
            className="flex flex-col items-center py-1 px-3 rounded-xl text-[#08D9D6] hover:text-white"
          >
            <UserIcon className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Login</span>
          </button>
        ) : (
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
              currentView === 'dashboard' ? 'text-[#08D9D6] font-bold scale-105' : 'hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Dashboard</span>
          </button>
        )}

        {/* Profile / Notifications */}
        {currentRole !== 'guest' && (
          <button
            onClick={() => setCurrentView('profile')}
            className={`relative flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
              currentView === 'profile' ? 'text-[#08D9D6] font-bold scale-105' : 'hover:text-white'
            }`}
          >
            <UserIcon className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Profile</span>
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-2 w-2 h-2 rounded-full bg-[#FF2E63] animate-pulse" />
            )}
          </button>
        )}

      </div>
    </div>
  );
};
