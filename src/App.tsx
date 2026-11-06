import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { MobileBottomNav } from './components/MobileBottomNav';
import { AuthModal } from './components/AuthModal';
import { ResetPasswordView } from './components/ResetPasswordView';
import { HomeView } from './components/HomeView';
import { NotFoundView } from './components/NotFoundView';
import { accessDecision } from './routing/routes';
import { UserRole } from './types';

// Everything below the home page is split into its own chunk: the landing view
// stays instantly interactive while dashboards (the heaviest screens) load on
// demand instead of bloating the initial bundle.
const BrowseView = lazy(() => import('./components/BrowseView').then((m) => ({ default: m.BrowseView })));
const PropertyDetailView = lazy(() => import('./components/PropertyDetailView').then((m) => ({ default: m.PropertyDetailView })));
const FindAHomeView = lazy(() => import('./components/FindAHomeView').then((m) => ({ default: m.FindAHomeView })));
const ListPropertyView = lazy(() => import('./components/ListPropertyView').then((m) => ({ default: m.ListPropertyView })));
const TenantDashboard = lazy(() => import('./components/TenantDashboard').then((m) => ({ default: m.TenantDashboard })));
const LandlordDashboard = lazy(() => import('./components/LandlordDashboard').then((m) => ({ default: m.LandlordDashboard })));
const AgentDashboard = lazy(() => import('./components/AgentDashboard').then((m) => ({ default: m.AgentDashboard })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminLoginView = lazy(() => import('./components/AdminLoginView').then((m) => ({ default: m.AdminLoginView })));
const AboutView = lazy(() => import('./components/AboutView').then((m) => ({ default: m.AboutView })));
const ContactView = lazy(() => import('./components/ContactView').then((m) => ({ default: m.ContactView })));
const ReceiptsView = lazy(() => import('./components/ReceiptsView').then((m) => ({ default: m.ReceiptsView })));
const BlogView = lazy(() => import('./components/BlogView').then((m) => ({ default: m.BlogView })));
const BlogPostView = lazy(() => import('./components/BlogPostView').then((m) => ({ default: m.BlogPostView })));

/** Lightweight placeholder shown while a lazy view chunk downloads. */
const ViewFallback: React.FC = () => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center px-6">
    <span className="w-8 h-8 border-2 border-[#08D9D6]/30 border-t-[#08D9D6] rounded-full animate-spin" />
    <p className="text-xs text-slate-400">Loading…</p>
  </div>
);

const AppContent: React.FC = () => {
  const {
    route,
    currentRole,
    currentView,
    navigate,
    isBooting,
    bootError,
    retryBootstrap,
    currentUser,
  } = useApp();

  const [authInitialRole, setAuthInitialRole] = useState<'tenant' | 'landlord' | 'agent'>('tenant');
  // Where the auth modal was opened from, so closing it returns the visitor to
  // the page they were reading instead of dumping them on the home page.
  const authReturnTo = useRef<string | null>(null);

  const isAuthRoute = route.name === 'login' || route.name === 'register';

  // Task 02: opening the notifications page no longer marks everything read.
  // A notification stays unread until the member marks it (or all of them) read.

  /**
   * Authentication lives at real URLs now (`/login`, `/register`), so a sign-in
   * screen can be linked, bookmarked and reloaded. The modal is still the same
   * component; it is simply driven by the route instead of local state.
   */
  const handleOpenAuth = (
    mode: 'login' | 'register' = 'login',
    role: 'tenant' | 'landlord' | 'agent' = 'tenant'
  ) => {
    setAuthInitialRole(role);
    if (!isAuthRoute) authReturnTo.current = route.path;
    navigate(mode === 'register' ? '/register' : '/login');
  };

  const closeAuth = () => {
    // If signing in already navigated (to `?next=` or the role dashboard),
    // leave that destination alone.
    if (route.name !== 'login' && route.name !== 'register') return;
    navigate(authReturnTo.current ?? '/', { replace: true });
  };

  const switchAuthMode = (mode: 'login' | 'register' | 'forgot') => {
    // The reset request is a panel inside the same modal and has no page of its
    // own, so only sign-in and registration get their own URL.
    if (mode === 'forgot') return;
    const target = mode === 'register' ? '/register' : '/login';
    if (route.path !== target) navigate(target, { replace: true });
  };

  /** The component for the current route (or null when a guard is redirecting). */
  const renderRoute = (): React.ReactNode => {
    switch (route.name) {
      case 'home':
        return <HomeView />;
      case 'browse':
        return <BrowseView />;
      case 'property-detail':
        return <PropertyDetailView />;
      case 'find-home':
        return <FindAHomeView onOpenAuth={(mode) => handleOpenAuth(mode || 'login')} />;
      case 'list-property':
        return (
          <ListPropertyView
            onOpenAuth={(mode, role) => handleOpenAuth(mode || 'login', role || 'landlord')}
          />
        );
      case 'about':
        return <AboutView />;
      case 'contact':
        return <ContactView />;
      case 'blog':
        return <BlogView />;
      case 'blog-post':
        return <BlogPostView />;
      case 'receipts':
        return <ReceiptsView />;
      case 'login':
      case 'register':
        // The sign-in screen is a modal over the landing page.
        return <HomeView />;
      case 'admin-login':
        return currentRole === 'admin' ? <AdminDashboard /> : <AdminLoginView />;
      case 'admin':
        return <AdminDashboard />;
      case 'tenant':
        return <TenantDashboard />;
      case 'landlord':
        return <LandlordDashboard />;
      case 'agent':
        return <AgentDashboard />;
      case 'not-found':
      default:
        return <NotFoundView path={route.path} />;
    }
  };

  // Emailed reset links land on /reset-password?token=…; that screen replaces
  // the whole site (it is used before anyone is signed in).
  if (route.name === 'reset-password') {
    return (
      <ResetPasswordView
        token={route.query.token ?? ''}
        onDone={() => navigate('/', { replace: true })}
      />
    );
  }

  if (isBooting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#252A34] text-[#EAEAEA] px-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#08D9D6]/15 border border-[#08D9D6]/30 text-[#08D9D6] flex items-center justify-center">
          <span className="w-6 h-6 border-2 border-[#08D9D6]/30 border-t-[#08D9D6] rounded-full animate-spin" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold text-white">Loading Goodlucks Homes</p>
          <p className="text-xs text-slate-400">Loading listings and your account…</p>
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

  // A guard is about to send this visitor somewhere they are allowed to be
  // (login with `?next=`, their own dashboard, or the admin console). Showing
  // the protected screen for one frame would leak its layout, so show the
  // ordinary loading placeholder instead.
  const decision = accessDecision(route, currentRole as UserRole, route.path);
  const isRedirecting = decision.action !== 'allow';

  const hideChrome = currentRole === 'admin' || route.name === 'admin-login' || route.name === 'admin';

  return (
    <div className="min-h-screen flex flex-col bg-[#252A34] text-[#EAEAEA] font-sans antialiased selection:bg-[#08D9D6] selection:text-[#252A34]">

      {/* Header Navbar */}
      <Navbar onOpenAuth={handleOpenAuth} />

      {/* Main Content Area — reserves room for the fixed mobile bottom bar so
          the last row of content is never hidden behind it (Task 04). */}
      <main
        className={`flex-grow ${
          hideChrome ? 'pb-12' : 'pb-[calc(76px+env(safe-area-inset-bottom))] md:pb-0'
        }`}
      >
        <Suspense fallback={<ViewFallback />}>
          {isRedirecting ? <ViewFallback /> : renderRoute()}
        </Suspense>
      </main>

      {/* Footer (Clean & minimal per specs) */}
      {!hideChrome && <Footer />}

      {/* Mobile Bottom Bar for native app feel */}
      {!hideChrome && <MobileBottomNav onOpenAuth={() => handleOpenAuth('login')} />}

      {/* Authentication Modal — presence follows the URL */}
      {isAuthRoute && (
        <AuthModal
          key={route.name}
          initialMode={route.name === 'register' ? 'register' : 'login'}
          initialRole={authInitialRole}
          onClose={closeAuth}
          onModeChange={switchAuthMode}
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
