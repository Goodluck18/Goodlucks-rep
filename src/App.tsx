import React, { useState } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { MobileBottomNav } from './components/MobileBottomNav';
import { HomeView } from './components/HomeView';
import { BrowseView } from './components/BrowseView';
import { PropertyDetailView } from './components/PropertyDetailView';
import { FindAHomeView } from './components/FindAHomeView';
import { ListPropertyView } from './components/ListPropertyView';
import { TenantDashboard } from './components/TenantDashboard';
import { LandlordDashboard } from './components/LandlordDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLoginView } from './components/AdminLoginView';
import { AboutView } from './components/AboutView';
import { ContactView } from './components/ContactView';
import { TenancyAgreementView } from './components/TenancyAgreementView';
import { AuthModal } from './components/AuthModal';

const AppContent: React.FC = () => {
  const { currentRole, currentView, isBooting, bootError, retryBootstrap } = useApp();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');
  const [authInitialRole, setAuthInitialRole] = useState<'tenant' | 'landlord'>('tenant');

  const handleOpenAuth = (mode: 'login' | 'register' = 'login', role: 'tenant' | 'landlord' = 'tenant') => {
    setAuthInitialMode(mode);
    setAuthInitialRole(role);
    setAuthModalOpen(true);
  };

  // Render current view component
  const renderView = () => {
    switch (currentView) {
      case 'admin-login':
        // An authenticated admin who reloads /admin goes straight to the console.
        return currentRole === 'admin' ? <AdminDashboard /> : <AdminLoginView />;
      case 'home':
        return <HomeView />;
      case 'browse':
        return <BrowseView />;
      case 'property-detail':
        return <PropertyDetailView />;
      case 'find-home':
        return <FindAHomeView onOpenAuth={() => handleOpenAuth('login')} />;
      case 'list-property':
        return <ListPropertyView onOpenAuth={(mode, role) => handleOpenAuth(mode || 'login', role || 'landlord')} />;
      case 'about':
        return <AboutView />;
      case 'contact':
        return <ContactView />;
      case 'agreement-generator':
      case 'agreements':
      case 'receipts':
        return <TenancyAgreementView />;
      case 'my-properties':
        return <LandlordDashboard />;
      case 'profile':
      case 'notifications':
      case 'dashboard':
        if (currentRole === 'tenant') return <TenantDashboard />;
        if (currentRole === 'landlord') return <LandlordDashboard />;
        if (currentRole === 'admin') return <AdminDashboard />;
        // If guest clicks dashboard, prompt auth
        return (
          <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
            <h2 className="text-2xl font-bold text-white">Please Sign In to Access Your Dashboard</h2>
            <p className="text-xs text-slate-400 max-w-sm">Sign in as a Tenant or Landlord to manage your rental requests and property listings.</p>
            <button
              onClick={() => handleOpenAuth('login')}
              className="px-6 py-3 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-sm shadow-lg shadow-[#08D9D6]/20"
            >
              Sign In / Register
            </button>
          </div>
        );
      default:
        return <HomeView />;
    }
  };

  if (isBooting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#252A34] text-[#EAEAEA] px-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#08D9D6]/15 border border-[#08D9D6]/30 text-[#08D9D6] flex items-center justify-center">
          <span className="w-6 h-6 border-2 border-[#08D9D6]/30 border-t-[#08D9D6] rounded-full animate-spin" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-white">Loading Goodlucks Homes</p>
          <p className="text-xs text-slate-400">Fetching verified listings and your account…</p>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#252A34] text-[#EAEAEA] px-4">
        <div className="max-w-md w-full bg-slate-800/90 border border-[#FF2E63]/30 rounded-3xl p-8 text-center space-y-4">
          <h1 className="text-xl font-black text-white">We could not load the website</h1>
          <p className="text-xs text-slate-300 leading-relaxed">{bootError}</p>
          <p className="text-[11px] text-slate-400">
            If this persists, please call +233 23 769 0080 or email rentals@goodlucks.co.
          </p>
          <button
            onClick={retryBootstrap}
            className="px-6 py-3 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-sm shadow-lg shadow-[#08D9D6]/20"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#252A34] text-[#EAEAEA] font-sans antialiased selection:bg-[#08D9D6] selection:text-[#252A34]">
      
      {/* Header Navbar */}
      <Navbar onOpenAuth={handleOpenAuth} />

      {/* Main Content Area */}
      <main className="flex-grow pb-12 md:pb-0">
        {renderView()}
      </main>

      {/* Footer (Clean & minimal per specs) */}
      {currentRole !== 'admin' && currentView !== 'admin-login' && <Footer />}

      {/* Mobile Bottom Bar for native app feel */}
      {currentRole !== 'admin' && currentView !== 'admin-login' && (
        <MobileBottomNav onOpenAuth={() => handleOpenAuth('login')} />
      )}

      {/* Authentication Modal */}
      {authModalOpen && (
        <AuthModal 
          initialMode={authInitialMode}
          initialRole={authInitialRole}
          onClose={() => setAuthModalOpen(false)} 
        />
      )}

    </div>
  );
};

export default function App() {
  return (
    <HelmetProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </HelmetProvider>
  );
}
