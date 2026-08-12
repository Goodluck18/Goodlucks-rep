import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Home, 
  Search, 
  PlusCircle, 
  User as UserIcon, 
  Bell, 
  LogOut, 
  Menu, 
  X, 
  ShieldCheck, 
  Building2, 
  Heart,
  SlidersHorizontal,
  Compass
} from 'lucide-react';

interface NavbarProps {
  onOpenAuth: (initialMode?: 'login' | 'register') => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth }) => {
  const { 
    currentUser, 
    currentRole, 
    currentView, 
    setCurrentView, 
    logout, 
    notifications
  } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleNavClick = (view: string) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#252A34]/95 border-b border-white/10 text-[#EAEAEA] transition-all duration-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        
        {/* Brand Logo */}
        <button 
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-2.5 group text-left focus:outline-none"
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

        {/* Desktop Navigation - Strictly Role Based */}
        <nav className="hidden md:flex items-center space-x-1 lg:space-x-2 text-sm font-medium">
          {/* Public / Unauthenticated Nav */}
          {currentRole === 'guest' && (
            <>
              <button 
                onClick={() => handleNavClick('home')}
                className={`px-3.5 py-2 rounded-lg transition-all ${currentView === 'home' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Home
              </button>
              <button 
                onClick={() => handleNavClick('browse')}
                className={`px-3.5 py-2 rounded-lg transition-all ${currentView === 'browse' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Browse Properties
              </button>
              <button 
                onClick={() => handleNavClick('find-home')}
                className={`px-3.5 py-2 rounded-lg transition-all ${currentView === 'find-home' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Find a Home
              </button>
              <button 
                onClick={() => handleNavClick('list-property')}
                className={`px-3.5 py-2 rounded-lg transition-all ${currentView === 'list-property' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                List Property
              </button>
              <button 
                onClick={() => handleNavClick('agreements')}
                className={`px-3.5 py-2 rounded-lg transition-all ${currentView === 'agreements' || currentView === 'agreement-generator' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Agreements & Receipts
              </button>
              <button 
                onClick={() => handleNavClick('about')}
                className={`px-3.5 py-2 rounded-lg transition-all ${currentView === 'about' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                About
              </button>
              <button 
                onClick={() => handleNavClick('contact')}
                className={`px-3.5 py-2 rounded-lg transition-all ${currentView === 'contact' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Contact
              </button>
            </>
          )}

          {/* Tenant Nav */}
          {currentRole === 'tenant' && (
            <>
              <button 
                onClick={() => handleNavClick('home')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'home' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Home
              </button>
              <button 
                onClick={() => handleNavClick('browse')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'browse' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Browse Properties
              </button>
              <button 
                onClick={() => handleNavClick('find-home')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'find-home' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Find a Home
              </button>
              <button 
                onClick={() => handleNavClick('agreements')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'agreements' || currentView === 'agreement-generator' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Agreements & Receipts
              </button>
              <button 
                onClick={() => handleNavClick('dashboard')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'dashboard' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => handleNavClick('profile')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'profile' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Profile
              </button>
              <button 
                onClick={() => handleNavClick('notifications')}
                className={`relative px-3 py-2 rounded-lg transition-all ${currentView === 'notifications' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Notifications
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1 w-2 h-2 rounded-full bg-[#FF2E63] animate-pulse" />
                )}
              </button>
            </>
          )}

          {/* Landlord Nav */}
          {currentRole === 'landlord' && (
            <>
              <button 
                onClick={() => handleNavClick('home')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'home' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Home
              </button>
              <button 
                onClick={() => handleNavClick('browse')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'browse' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Browse Properties
              </button>
              <button 
                onClick={() => handleNavClick('list-property')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'list-property' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                List Property
              </button>
              <button 
                onClick={() => handleNavClick('dashboard')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'dashboard' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Dashboard
              </button>
              <button 
                onClick={() => handleNavClick('my-properties')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'my-properties' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                My Properties
              </button>
              <button 
                onClick={() => handleNavClick('agreements')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'agreements' || currentView === 'agreement-generator' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Agreements & Receipts
              </button>
              <button 
                onClick={() => handleNavClick('profile')}
                className={`px-3 py-2 rounded-lg transition-all ${currentView === 'profile' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Profile
              </button>
            </>
          )}

          {/* Admin Nav Header */}
          {currentRole === 'admin' && (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#FF2E63]/20 text-[#FF2E63] border border-[#FF2E63]/30 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Goodlucks SaaS Admin
              </span>
              <button 
                onClick={() => handleNavClick('dashboard')}
                className={`px-3.5 py-2 rounded-lg transition-all ${currentView === 'dashboard' ? 'text-[#08D9D6] bg-white/5 font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Admin Workspace
              </button>
            </div>
          )}
        </nav>

        {/* Right CTA / Auth Controls */}
        <div className="hidden md:flex items-center space-x-3">
          {currentRole === 'guest' ? (
            <div className="flex items-center gap-2">
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
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 pl-3 border-l border-white/10">
                <img 
                  src={currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'} 
                  alt={currentUser?.name}
                  className="w-9 h-9 rounded-full object-cover border-2 border-[#08D9D6]/50 shadow-sm" 
                />
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-white leading-tight">
                    {currentUser?.name}
                  </span>
                  <span className="text-[10px] text-[#08D9D6] capitalize font-medium">
                    {currentRole} Account
                  </span>
                </div>
              </div>
              <button
                onClick={logout}
                title="Logout"
                className="p-2 rounded-xl text-slate-400 hover:text-[#FF2E63] hover:bg-white/5 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex md:hidden items-center gap-2">
          {currentRole === 'guest' && (
            <button
              onClick={() => onOpenAuth('login')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#08D9D6] text-[#252A34]"
            >
              Login
            </button>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2.5 rounded-xl bg-white/5 text-slate-200 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#252A34] border-b border-white/10 px-4 pt-3 pb-6 space-y-2 animate-fadeIn">
          {currentRole === 'guest' && (
            <>
              <button 
                onClick={() => handleNavClick('home')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 hover:text-[#08D9D6] font-medium"
              >
                Home
              </button>
              <button 
                onClick={() => handleNavClick('browse')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 hover:text-[#08D9D6] font-medium"
              >
                Browse Properties
              </button>
              <button 
                onClick={() => handleNavClick('find-home')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 hover:text-[#08D9D6] font-medium"
              >
                Find a Home
              </button>
              <button 
                onClick={() => handleNavClick('list-property')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 hover:text-[#08D9D6] font-medium"
              >
                List Property
              </button>
              <button 
                onClick={() => handleNavClick('about')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 hover:text-[#08D9D6] font-medium"
              >
                About
              </button>
              <button 
                onClick={() => handleNavClick('contact')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 hover:text-[#08D9D6] font-medium"
              >
                Contact
              </button>
              <div className="pt-3 border-t border-white/10 flex gap-2">
                <button
                  onClick={() => { setMobileMenuOpen(false); onOpenAuth('login'); }}
                  className="flex-1 py-2.5 rounded-xl border border-white/20 text-center text-sm font-semibold text-white"
                >
                  Login
                </button>
                <button
                  onClick={() => { setMobileMenuOpen(false); onOpenAuth('register'); }}
                  className="flex-1 py-2.5 rounded-xl bg-[#08D9D6] text-center text-sm font-semibold text-[#252A34]"
                >
                  Register
                </button>
              </div>
            </>
          )}

          {currentRole === 'tenant' && (
            <>
              <button 
                onClick={() => handleNavClick('home')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                Home
              </button>
              <button 
                onClick={() => handleNavClick('browse')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                Browse Properties
              </button>
              <button 
                onClick={() => handleNavClick('find-home')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                Find a Home
              </button>
              <button 
                onClick={() => handleNavClick('dashboard')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                Dashboard
              </button>
              <button 
                onClick={() => handleNavClick('profile')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                Profile
              </button>
              <button 
                onClick={() => handleNavClick('notifications')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium flex justify-between items-center"
              >
                Notifications
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#FF2E63] text-white text-xs font-bold">
                    {unreadCount}
                  </span>
                )}
              </button>
              <div className="pt-3 border-t border-white/10">
                <button 
                  onClick={logout}
                  className="w-full py-2.5 text-center text-sm font-semibold text-[#FF2E63] bg-[#FF2E63]/10 rounded-xl"
                >
                  Logout ({currentUser?.name})
                </button>
              </div>
            </>
          )}

          {currentRole === 'landlord' && (
            <>
              <button 
                onClick={() => handleNavClick('home')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                Home
              </button>
              <button 
                onClick={() => handleNavClick('browse')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                Browse Properties
              </button>
              <button 
                onClick={() => handleNavClick('list-property')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                List Property
              </button>
              <button 
                onClick={() => handleNavClick('dashboard')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                Dashboard
              </button>
              <button 
                onClick={() => handleNavClick('my-properties')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                My Properties
              </button>
              <button 
                onClick={() => handleNavClick('profile')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                Profile
              </button>
              <div className="pt-3 border-t border-white/10">
                <button 
                  onClick={logout}
                  className="w-full py-2.5 text-center text-sm font-semibold text-[#FF2E63] bg-[#FF2E63]/10 rounded-xl"
                >
                  Logout ({currentUser?.name})
                </button>
              </div>
            </>
          )}

          {currentRole === 'admin' && (
            <>
              <button 
                onClick={() => handleNavClick('dashboard')}
                className="w-full text-left px-4 py-2.5 rounded-xl text-slate-200 hover:bg-white/5 font-medium"
              >
                Admin Dashboard
              </button>
              <div className="pt-3 border-t border-white/10">
                <button 
                  onClick={logout}
                  className="w-full py-2.5 text-center text-sm font-semibold text-[#FF2E63] bg-[#FF2E63]/10 rounded-xl"
                >
                  Logout Admin
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
};
