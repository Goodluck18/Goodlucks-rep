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
import { AuthModal } from './components/AuthModal';

const AppContent: React.FC = () => {
  const { currentRole, currentView, setCurrentView } = useApp();
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
    // ADMIN ROLE FORCE VIEW OVERRIDE
    if (currentRole === 'admin') {
      return <AdminDashboard />;
    }

    switch (currentView) {
      case 'admin-login':
        return <AdminLoginView />;
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

  if (currentView === 'admin-login' && currentRole !== 'admin') {
    return <AdminLoginView />;
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
