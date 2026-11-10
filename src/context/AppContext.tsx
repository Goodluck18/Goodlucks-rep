import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentProfile,
  EmailLog,
  EmailOutboxSummary,
  Enquiry,
  NotificationItem,
  Property,
  PropertyStatus,
  SearchAlertSubscription,
  TenantRequest,
  ToastNotification,
  User,
  UserRole,
  ViewingSchedule,
} from '../types';
import { ToastContainer } from '../components/ToastContainer';
import {
  RouteState,
  accessDecision,
  dashboardPath,
  isSafeRedirect,
  legacyRedirect,
  parseLocation,
  pathForView,
  tabForRoute,
  tabPath,
  viewForRoute,
} from '../routing/routes';
import { propertyForSegment, propertyIdFromSegment, propertyPath } from '../routing/propertyUrl';
import {
  AdminStats,
  PropertyInput,
  SearchAlertInput,
  TenantRequestInput,
  ViewingInput,
  ApiError,
  api,
  messageForError,
} from '../services/apiService';

const GUEST_SAVED_KEY = 'goodlucks_guest_saved_properties';

const EMPTY_STATS: AdminStats = {
  visitorsToday: 0,
  visitorsYesterday: 0,
  visitorsLast7Days: 0,
  visitorsLast30Days: 0,
  visitorsLast12Months: 0,
  growthPercentage: 0,
  totalRegisteredUsers: 0,
  totalTenants: 0,
  totalLandlords: 0,
  totalAgents: 0,
  pendingAgentAccounts: 0,
  newUsersToday: 0,
  newUsersThisWeek: 0,
  totalProperties: 0,
  approvedProperties: 0,
  pendingProperties: 0,
  rejectedProperties: 0,
  totalViewings: 0,
  completedViewings: 0,
  viewingFeesCollectedGhs: 0,
  goodlucksShareDueGhs: 0,
  goodlucksShareReceivedGhs: 0,
  agentShareRetainedGhs: 0,
  outstandingReceivablesGhs: 0,
  viewingFeeRecordsWithoutShare: 0,
  viewingFeeDisputedRecords: 0,
  totalEnquiries: 0,
  newEnquiries: 0,
  totalTenantRequests: 0,
  dailyTraffic: Array.from({ length: 7 }, () => ({ label: '-', visitors: 0, pageViews: 0 })),
  monthlyTraffic: Array.from({ length: 6 }, () => ({ label: '-', visitors: 0, pageViews: 0 })),
};

interface SignInResult {
  ok: boolean;
  error?: string;
  fields?: Record<string, string>;
}

interface AppContextType {
  // Session state
  currentUser: User | null;
  currentRole: UserRole;
  isBooting: boolean;
  bootError: string | null;
  retryBootstrap: () => void;

  // Data
  properties: Property[];
  selectedProperty: Property | null;
  tenantRequests: TenantRequest[];
  viewingSchedules: ViewingSchedule[];
  emailLogs: EmailLog[];
  emailOutbox: EmailOutboxSummary;
  notifications: NotificationItem[];
  enquiries: Enquiry[];
  analytics: AdminStats;
  savedPropertyIds: string[];
  searchAlerts: SearchAlertSubscription[];

  // Navigation — the URL is the source of truth
  /** The route parsed from the browser URL (never stored separately). */
  route: RouteState;
  currentView: string;
  selectedPropertyId: string | null;
  /** Dashboard section (tab id) taken from the URL. */
  sectionTab: string;
  /** Go to a path; every navigation control in the app funnels through this. */
  navigate: (path: string, options?: { replace?: boolean; scroll?: boolean }) => void;
  /** Switch dashboard tab → updates the URL. */
  setSectionTab: (tab: string) => void;
  /** @deprecated legacy view names — resolved to real routes; prefer `navigate()`. */
  setCurrentView: (view: string) => void;
  navigateToProperty: (propertyId: string) => void;

  // Toasts
  toasts: ToastNotification[];
  showToast: (toast: Omit<ToastNotification, 'id'>) => void;
  showSuccessToast: (title: string, message?: string) => void;
  showErrorToast: (title: string, message?: string) => void;
  showInfoToast: (title: string, message?: string) => void;
  dismissToast: (id: string) => void;

  // Auth
  login: (email: string, password: string, role?: 'tenant' | 'landlord' | 'agent') => Promise<SignInResult>;
  register: (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: 'tenant' | 'landlord' | 'agent';
    /** Optional city/town (contact information, not identity data). */
    city?: string;
    /** Agent only: agency/business name, if any (Increment C). */
    agencyName?: string;
    /** Agent only: the city the agent works from, not their home address. */
    operatingCity?: string;
    /**
     * Task 03: the registration group the account belongs to. It must agree with
     * `role`; the server refuses a mismatch rather than converting an account.
     */
    providerCategory?: 'tenant' | 'landlord' | 'agent';
    /** Task 03: the official name on the Ghana Card (a claim, not a check). */
    officialName?: string;
  }) => Promise<SignInResult>;
  adminLogin: (email: string, password: string, accessKey: string) => Promise<SignInResult>;
  logout: () => Promise<void>;
  updateUserProfile: (data: Partial<User> & { password?: string }) => Promise<SignInResult>;
  /** Update the signed-in agent's own profile (agency name, operating city). */
  updateAgentProfile: (data: { agencyName?: string; operatingCity?: string }) => Promise<SignInResult>;
  /**
   * Change the signed-in account's own password. The server re-verifies the
   * current password; nothing here is trusted on its own.
   */
  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<SignInResult>;
  /** Upload a new profile picture for the signed-in account. */
  uploadAvatar: (file: File) => Promise<SignInResult>;
  /** Remove the signed-in account's profile picture. */
  removeAvatar: () => Promise<SignInResult>;

  // Properties
  addProperty: (data: PropertyInput) => Promise<Property>;
  updateProperty: (id: string, data: Partial<PropertyInput> & { updatedAt?: string }) => Promise<void>;
  updatePropertyStatus: (id: string, status: PropertyStatus) => Promise<void>;
  deleteProperty: (id: string) => Promise<void>;
  toggleFeatured: (id: string, featured: boolean) => Promise<void>;
  verifyProperty: (id: string, verified: boolean) => Promise<void>;
  toggleSaveProperty: (id: string) => Promise<void>;
  incrementPropertyViews: (id: string) => void;
  refreshProperties: () => Promise<void>;

  // Requests & viewings
  submitTenantRequest: (data: TenantRequestInput) => Promise<void>;
  updateTenantRequestStatus: (id: string, status: string, matchedPropertyIds?: string[]) => Promise<void>;
  setEnquiryStatus: (id: string, status: Enquiry['status']) => Promise<void>;
  scheduleViewing: (data: ViewingInput) => Promise<ViewingSchedule>;
  updateViewingStatus: (id: string, status: ViewingSchedule['status'], feePaid?: boolean, notes?: string) => Promise<void>;
  /** Run a lifecycle action (propose, confirm, reschedule, cancel, complete…) and refresh. */
  runViewingAction: (
    id: string,
    action: 'propose' | 'confirm' | 'reschedule' | 'request-reschedule' | 'accept-reschedule' | 'decline-reschedule' | 'cancel' | 'complete' | 'no-show' | 'could-not-proceed',
    body?: { date?: string; time?: string; note?: string; reason?: string; who?: 'tenant' | 'agent' }
  ) => Promise<{ ok: boolean; error?: string; fields?: Record<string, string> }>;
  refreshViewings: () => Promise<void>;

  // Rent payment records

  // Alerts & enquiries
  subscribeToSearchAlerts: (data: SearchAlertInput) => Promise<SearchAlertSubscription>;
  unsubscribeFromSearchAlerts: (id: string) => Promise<void>;
  sendEnquiry: (data: {
    name: string;
    email: string;
    phone?: string;
    message: string;
    propertyId?: string;
    source?: string;
  }) => Promise<void>;

  // Misc
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  runEmailOutbox: () => Promise<void>;
  refreshAdminData: () => Promise<void>;
  /**
   * Re-read the signed-in account from the server (Increment D).
   *
   * Staff capabilities and the agent profile live on the session user, and a
   * server-side change (a reviewer grant, an agent approval) must not require a
   * full page reload before the console reflects it. The UI value is only a hint:
   * every endpoint re-checks the capability.
   */
  refreshSession: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function readGuestSaved(): string[] {
  try {
    const raw = localStorage.getItem(GUEST_SAVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeGuestSaved(ids: string[]) {
  try {
    localStorage.setItem(GUEST_SAVED_KEY, JSON.stringify(ids));
  } catch {
    /* storage may be unavailable (private mode) - non critical */
  }
}

/** The address bar exactly as it is right now (path + query + hash). */
function currentLocation(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * The route the browser is on at first paint.
 *
 * Older links (`?property=<id>`, `#/property/<id>`, `?reset=<token>`, mixed-case
 * paths) are rewritten to their canonical URL with `replaceState` so the app
 * starts on the address the rest of the session will use — no extra history
 * entry, and the shared link keeps working.
 */
function initialRoute(): RouteState {
  if (typeof window === 'undefined') return parseLocation('/');
  const legacy = legacyRedirect(currentLocation());
  if (legacy) {
    try {
      window.history.replaceState({}, '', legacy);
    } catch {
      /* a blocked history API still leaves the parsed route usable */
    }
    return parseLocation(legacy);
  }
  return parseLocation(currentLocation());
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);

  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [tenantRequests, setTenantRequests] = useState<TenantRequest[]>([]);
  const [viewingSchedules, setViewingSchedules] = useState<ViewingSchedule[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [emailOutbox, setEmailOutbox] = useState<EmailOutboxSummary>({
    pending: 0,
    failed: 0,
    sentToday: 0,
    oldestPendingAt: null,
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [analytics, setAnalytics] = useState<AdminStats>(EMPTY_STATS);
  const [searchAlerts, setSearchAlerts] = useState<SearchAlertSubscription[]>([]);
  const [savedPropertyIds, setSavedPropertyIds] = useState<string[]>(() => readGuestSaved());

  // The browser URL is the only source of truth for "which page am I on".
  // `currentView` (below) is derived from it for the existing components that
  // compare view names; nothing else stores a copy of the current page.
  const [route, setRoute] = useState<RouteState>(() => initialRoute());
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const viewedPropertyIds = useRef<Set<string>>(new Set());

  const currentRole: UserRole = currentUser ? currentUser.role : 'guest';

  // Derived, never stored: both values come from the URL.
  const currentView = viewForRoute(route);
  /**
   * The URL segment (`prop-1` or `3-bedroom-apartment-east-legon-prop-1`) and
   * the stable id behind it. The id is what the API is asked for; the segment
   * only ever describes the listing.
   */
  const propertySegment = route.name === 'property-detail' ? (route.params.id ?? null) : null;
  const selectedPropertyId = propertySegment
    ? propertyIdFromSegment(propertySegment, properties.map((p) => p.id))
    : null;
  /** Tab id of the dashboard section in the URL (dashboards read this). */
  const sectionTab = tabForRoute(route);

  // -------------------------------------------------------------------------
  // Toasts
  // -------------------------------------------------------------------------
  const showToast = useCallback((toast: Omit<ToastNotification, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const showSuccessToast = useCallback(
    (title: string, message?: string) => showToast({ type: 'success', title, message }),
    [showToast]
  );
  const showErrorToast = useCallback(
    (title: string, message?: string) => showToast({ type: 'error', title, message }),
    [showToast]
  );
  const showInfoToast = useCallback(
    (title: string, message?: string) => showToast({ type: 'info', title, message }),
    [showToast]
  );
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------
  const loadProperties = useCallback(async (user: User | null) => {
    if (user?.role === 'admin') {
      const result = await api.adminProperties({ perPage: 100 });
      setProperties(result.properties);
      return;
    }

    const result = await api.listProperties({ perPage: 100 });
    let list = result.properties;

    if (user?.role === 'landlord' || user?.role === 'agent') {
      // Landlords see what they own; agents see what they submitted. The server
      // decides which, from the session role.
      const mine = await api.listProperties({ mine: 1, perPage: 100 });
      const seen = new Set(list.map((p) => p.id));
      list = [...list, ...mine.properties.filter((p) => !seen.has(p.id))];
    }
    setProperties(list);
  }, []);

  const loadAccountData = useCallback(async (user: User | null) => {
    if (!user) {
      setTenantRequests([]);
      setViewingSchedules([]);
      setNotifications([]);
      setSearchAlerts([]);
      setEmailLogs([]);
      setEmailOutbox({ pending: 0, failed: 0, sentToday: 0, oldestPendingAt: null });
      setEnquiries([]);
      setAnalytics(EMPTY_STATS);
      return;
    }

    if (user.role === 'admin') {
      const [stats, viewings, requests, logs, enquiryResult, alerts] = await Promise.all([
        api.adminStats(),
        api.listAllViewings(),
        api.listAllTenantRequests(),
        api.adminEmailLogs(),
        api.listEnquiries(),
        api.listSearchAlerts().catch(() => ({ alerts: [] })),
      ]);
      setAnalytics(stats.stats);
      setViewingSchedules(viewings.viewings);
      setTenantRequests(requests.requests);
      setEmailLogs(logs.logs);
      setEmailOutbox(logs.outbox);
      setEnquiries(enquiryResult.enquiries);
      setSearchAlerts(alerts.alerts);
      return;
    }

    if (user.role === 'agent') {
      // Agents have no receipts, tenant requests or staff tools. They get their
      // own viewing queue (Increment F), notifications and saved listings; their
      // submissions arrive with the property catalogue.
      const [notificationsResult, savedResult, viewings] = await Promise.all([
        api.listNotifications().catch(() => ({ notifications: [] })),
        api.listSaved().catch(() => ({ propertyIds: [] })),
        api.listViewings().catch(() => ({ viewings: [] })),
      ]);
      setNotifications(notificationsResult.notifications);
      setSavedPropertyIds(savedResult.propertyIds);
      setViewingSchedules(viewings.viewings);
      setTenantRequests([]);
      setSearchAlerts([]);
      return;
    }

    if (user.role === 'landlord') {
      const [viewings, notificationsResult, savedResult] = await Promise.all([
        api.listViewings().catch(() => ({ viewings: [] })),
        api.listNotifications().catch(() => ({ notifications: [] })),
        api.listSaved().catch(() => ({ propertyIds: [] })),
      ]);
      setViewingSchedules(viewings.viewings);
      setNotifications(notificationsResult.notifications);
      setSavedPropertyIds(savedResult.propertyIds);
      setTenantRequests([]);
      return;
    }

    // Upgrade 2 (E1): rent receipts were removed from the product, so no branch
    // here asks for them any more. The stored history is untouched.
    const [requests, viewings, notificationsResult, alerts, savedResult] = await Promise.all([
      api.listTenantRequests().catch(() => ({ requests: [] })),
      api.listViewings().catch(() => ({ viewings: [] })),
      api.listNotifications().catch(() => ({ notifications: [] })),
      api.listSearchAlerts().catch(() => ({ alerts: [] })),
      api.listSaved().catch(() => ({ propertyIds: [] })),
    ]);
    setTenantRequests(requests.requests);
    setViewingSchedules(viewings.viewings);
    setNotifications(notificationsResult.notifications);
    setSearchAlerts(alerts.alerts);
    setSavedPropertyIds(savedResult.propertyIds);
  }, []);

  const refreshAll = useCallback(
    async (user: User | null) => {
      await Promise.all([loadProperties(user), loadAccountData(user)]);
    },
    [loadProperties, loadAccountData]
  );

  // -------------------------------------------------------------------------
  // Bootstrap
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsBooting(true);
      setBootError(null);
      try {
        const session = await api.me();
        if (cancelled) return;
        setCurrentUser(session.user);
        if (session.user) {
          setSavedPropertyIds(session.savedPropertyIds);
        }
        await refreshAll(session.user);
      } catch (error) {
        if (!cancelled) {
          setBootError(messageForError(error));
        }
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootAttempt, refreshAll]);

  const retryBootstrap = useCallback(() => setBootAttempt((n) => n + 1), []);

  // -------------------------------------------------------------------------
  // URL → application state (refresh, deep links, Back / Forward)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const syncFromBrowser = () => {
      const legacy = legacyRedirect(currentLocation());
      if (legacy) {
        try {
          window.history.replaceState({}, '', legacy);
        } catch {
          /* ignore a blocked history API */
        }
        setRoute(parseLocation(legacy));
        return;
      }
      setRoute(parseLocation(currentLocation()));
    };

    // The initial render already parsed the URL; this also catches the case
    // where the location changed between render and effect.
    syncFromBrowser();
    window.addEventListener('popstate', syncFromBrowser);
    window.addEventListener('hashchange', syncFromBrowser);
    return () => {
      window.removeEventListener('popstate', syncFromBrowser);
      window.removeEventListener('hashchange', syncFromBrowser);
    };
  }, []);

  // Keep the selected property in sync with the catalogue / deep links
  useEffect(() => {
    if (!selectedPropertyId) {
      setSelectedProperty(null);
      return;
    }
    // A descriptive slug resolves to its listing without a round trip; a bare
    // id (or a slug for a listing not in the loaded catalogue) goes to the API.
    const local =
      propertyForSegment(propertySegment ?? '', properties) ??
      properties.find((p) => p.id === selectedPropertyId);
    if (local) {
      setSelectedProperty(local);
      return;
    }

    let cancelled = false;
    api
      .getProperty(selectedPropertyId)
      .then((result) => {
        if (!cancelled) setSelectedProperty(result.property);
      })
      .catch(() => {
        if (!cancelled) setSelectedProperty(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPropertyId, propertySegment, properties]);

  // -------------------------------------------------------------------------
  // Navigation — one function, one source of truth (the address bar)
  // -------------------------------------------------------------------------
  /**
   * Move to `path`, updating the browser URL and the rendered page together.
   *
   *   replace  true → replace the history entry (filters, redirects, guards)
   *   scroll   false → keep the scroll position (typing in a search field)
   */
  const navigate = useCallback(
    (target: string, options: { replace?: boolean; scroll?: boolean } = {}) => {
      if (typeof window === 'undefined') return;
      const path = target.startsWith('/') ? target : `/${target}`;
      const here = currentLocation();
      const sameUrl = path === here;

      if (!sameUrl) {
        try {
          if (options.replace) window.history.replaceState({}, '', path);
          else window.history.pushState({}, '', path);
        } catch {
          // A blocked history API (sandboxed iframe) still navigates; the URL
          // just falls back to the hash form the old build used.
          window.location.hash = `#${path}`;
        }
      }

      const next = parseLocation(path);
      setRoute(next);
      if (options.scroll !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
      // Analytics counts pages, not filter or tab tweaks on the same page.
      if (!sameUrl && parseLocation(here).path !== next.path) void api.trackPageView(next.path);
    },
    []
  );

  /**
   * Compatibility shim for the pre-routing call sites (`setCurrentView('browse')`).
   * It resolves the view name to a real route and delegates to `navigate`, so
   * every existing navigation control updates the URL. New code should call
   * `navigate('/path')` directly.
   */
  const setCurrentView = useCallback(
    (view: string) => {
      navigate(pathForView(view, currentRole, route));
    },
    [navigate, currentRole, route]
  );

  const navigateToProperty = useCallback(
    (propertyId: string) => {
      const local = properties.find((p) => p.id === propertyId);
      if (local) setSelectedProperty(local);
      // Correction 4: link to the descriptive canonical URL when the listing is
      // known; fall back to the id form (the server redirects it) when it is not.
      navigate(local ? propertyPath(local) : `/property/${encodeURIComponent(propertyId)}`);
    },
    [properties, navigate]
  );

  /** Switch the dashboard section (dashboards call this from their tab bars). */
  const setSectionTab = useCallback(
    (tab: string) => {
      if (currentRole !== 'tenant' && currentRole !== 'landlord' && currentRole !== 'agent' && currentRole !== 'admin') {
        return;
      }
      navigate(tabPath(currentRole, tab));
    },
    [currentRole, navigate]
  );

  /**
   * Where to go once authentication succeeds.
   *
   * A protected URL that redirected a signed-out visitor here carries `?next=`,
   * and the destination is only honoured when the new account is actually
   * allowed to open it (no open redirect, no cross-role jump).
   */
  const destinationAfterAuth = useCallback((role: UserRole): string => {
    if (typeof window === 'undefined') return dashboardPath(role);
    const next = parseLocation(currentLocation()).query.next;
    return isSafeRedirect(next, role) ? next : dashboardPath(role);
  }, []);

  /**
   * Route guards.
   *
   * Runs once the session has been restored (so a refresh never bounces a
   * signed-in member to the login screen). The server still enforces every
   * permission; this only decides which screen is shown and where to send the
   * visitor when the page is not theirs.
   */
  useEffect(() => {
    if (isBooting) return;
    const decision = accessDecision(route, currentRole, route.path);
    if (decision.action === 'allow') return;

    if (decision.action === 'forbidden') {
      showInfoToast(
        'Not available for this account',
        'That page belongs to a different account type. You have been taken to your own dashboard.'
      );
    }
    navigate(decision.to, { replace: true });
  }, [route, currentRole, isBooting, navigate, showInfoToast]);

  // -------------------------------------------------------------------------
  // Auth actions
  // -------------------------------------------------------------------------
  const handleSignIn = useCallback(
    async (user: User) => {
      setCurrentUser(user);
      await refreshAll(user);
    },
    [refreshAll]
  );

  const login = useCallback(
    async (email: string, password: string, role?: 'tenant' | 'landlord' | 'agent'): Promise<SignInResult> => {
      try {
        const result = await api.login(email, password, role);
        await handleSignIn(result.user);
        showSuccessToast('Welcome Back!', `Signed in as ${result.user.name}`);
        // Back to the page they were sent away from, or their own dashboard.
        navigate(destinationAfterAuth(result.user.role), { replace: true });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: messageForError(error), fields: (error as any)?.fields || {} };
      }
    },
    [handleSignIn, navigate, destinationAfterAuth, showSuccessToast]
  );

  const register = useCallback(
    async (data: {
      name: string;
      email: string;
      phone: string;
      password: string;
      role: 'tenant' | 'landlord' | 'agent';
      city?: string;
      agencyName?: string;
      operatingCity?: string;
      providerCategory?: 'tenant' | 'landlord' | 'agent';
      officialName?: string;
    }): Promise<SignInResult> => {
      try {
        const result = await api.register(data);
        await handleSignIn(result.user);
        showSuccessToast('Account Created', `Welcome to Goodlucks Homes, ${result.user.name}!`);
        navigate(destinationAfterAuth(result.user.role), { replace: true });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: messageForError(error), fields: (error as any)?.fields || {} };
      }
    },
    [handleSignIn, navigate, destinationAfterAuth, showSuccessToast]
  );

  const adminLogin = useCallback(
    async (email: string, password: string, accessKey: string): Promise<SignInResult> => {
      try {
        const result = await api.adminLogin(email, password, accessKey);
        await handleSignIn(result.user);
        showSuccessToast('Authentication Granted', 'Welcome to the Goodlucks admin console.');
        navigate('/admin', { replace: true });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: messageForError(error), fields: (error as any)?.fields || {} };
      }
    },
    [handleSignIn, navigate, showSuccessToast]
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* the local session is cleared regardless */
    }
    setCurrentUser(null);
    setSelectedProperty(null);
    setProperties([]);
    setBootAttempt((n) => n + 1);
    showInfoToast('Signed Out', 'You have been logged out of Goodlucks Homes.');
    navigate('/', { replace: true });
  }, [showInfoToast, navigate]);

  const updateUserProfile = useCallback(
    async (data: Partial<User> & { password?: string }): Promise<SignInResult> => {
      if (!currentUser) return { ok: false, error: 'Please sign in first.' };
      try {
        const result = await api.updateProfile(data);
        setCurrentUser(result.user);
        showSuccessToast('Account Details Updated', 'Your profile information has been saved.');
        return { ok: true };
      } catch (error) {
        return { ok: false, error: messageForError(error), fields: (error as any)?.fields || {} };
      }
    },
    [currentUser, showSuccessToast]
  );

  const updateAgentProfile = useCallback(
    async (data: { agencyName?: string; operatingCity?: string }): Promise<SignInResult> => {
      if (!currentUser) return { ok: false, error: 'Please sign in first.' };
      try {
        const result = await api.updateAgentProfile(data);
        // The profile lives beside the user record; refresh ours so every view
        // reads the same values the server just stored.
        setCurrentUser((user) => (user ? { ...user, agentProfile: result.profile } : user));
        showSuccessToast('Agent Profile Updated', 'Your operating details have been saved.');
        return { ok: true };
      } catch (error) {
        return { ok: false, error: messageForError(error), fields: (error as any)?.fields || {} };
      }
    },
    [currentUser, showSuccessToast]
  );

  /**
   * Account settings: password change and profile picture.
   *
   * Both are server-first: the response replaces the local session user, and a
   * failure is reported back to the form instead of being swallowed. Neither
   * can name another account — the session decides whose record changes.
   */
  const changePassword = useCallback(
    async (data: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<SignInResult> => {
      try {
        const result = await api.changePassword(data);
        showSuccessToast('Password changed', result.message || 'Your password has been updated.');
        return { ok: true };
      } catch (error) {
        return { ok: false, error: messageForError(error), fields: (error as any)?.fields || {} };
      }
    },
    [showSuccessToast]
  );

  const uploadAvatar = useCallback(
    async (file: File): Promise<SignInResult> => {
      try {
        const result = await api.uploadAvatar(file);
        if (result.user) setCurrentUser(result.user);
        showSuccessToast('Profile picture updated', 'Your new picture is now used across your account.');
        return { ok: true };
      } catch (error) {
        return { ok: false, error: messageForError(error), fields: (error as any)?.fields || {} };
      }
    },
    [showSuccessToast]
  );

  const removeAvatar = useCallback(async (): Promise<SignInResult> => {
    try {
      const result = await api.removeAvatar();
      if (result.user) setCurrentUser(result.user);
      showInfoToast('Profile picture removed', 'Your account now shows your initials.');
      return { ok: true };
    } catch (error) {
      return { ok: false, error: messageForError(error), fields: (error as any)?.fields || {} };
    }
  }, [showInfoToast]);

  // -------------------------------------------------------------------------
  // Properties
  // -------------------------------------------------------------------------
  const refreshProperties = useCallback(async () => {
    try {
      await loadProperties(currentUser);
    } catch (error) {
      showErrorToast('Could not refresh listings', messageForError(error));
    }
  }, [currentUser, loadProperties, showErrorToast]);

  const addProperty = useCallback(
    async (data: PropertyInput): Promise<Property> => {
      const result = await api.createProperty(data);
      await loadProperties(currentUser);
      showSuccessToast(
        'Property Successfully Listed',
        `"${result.property.title}" submitted for Goodlucks Homes verification.`
      );
      return result.property;
    },
    [currentUser, loadProperties, showSuccessToast]
  );

  const updateProperty = useCallback(
    async (id: string, data: Partial<PropertyInput> & { updatedAt?: string }) => {
      try {
        const result = await api.updateProperty(id, data);
        setProperties((prev) => prev.map((p) => (p.id === id ? result.property : p)));
        if (selectedProperty?.id === id) setSelectedProperty(result.property);
        showSuccessToast('Property Listing Updated', 'Changes to the property details were saved.');
      } catch (error) {
        // 409 = someone else edited this listing first. Pull the current version
        // so the caller can show what changed instead of clobbering it.
        if (error instanceof ApiError && error.status === 409) {
          await loadProperties(currentUser).catch(() => undefined);
        }
        throw error;
      }
    },
    [currentUser, loadProperties, selectedProperty, showSuccessToast]
  );

  const updatePropertyStatus = useCallback(
    async (id: string, status: PropertyStatus) => {
      const result = await api.setPropertyStatus(id, status);
      setProperties((prev) => prev.map((p) => (p.id === id ? result.property : p)));
      if (user_is_admin(currentUser)) {
        await loadAccountData(currentUser);
      }
      showSuccessToast('Listing Status Updated', `Property status updated to ${status.toUpperCase()}.`);
    },
    [currentUser, loadAccountData, showSuccessToast]
  );

  const deleteProperty = useCallback(
    async (id: string) => {
      await api.deleteProperty(id);
      setProperties((prev) => prev.filter((p) => p.id !== id));
      showInfoToast('Property Deleted', 'The property listing has been removed from public view.');
    },
    [showInfoToast]
  );

  const toggleFeatured = useCallback(
    async (id: string, featured: boolean) => {
      const result = await api.toggleFeatured(id, featured);
      setProperties((prev) => prev.map((p) => (p.id === id ? result.property : p)));
      showSuccessToast('Listing Updated', featured ? 'Listing is now featured.' : 'Listing is no longer featured.');
    },
    [showSuccessToast]
  );

  const verifyProperty = useCallback(
    async (id: string, verified: boolean) => {
      const result = await api.verifyProperty(id, verified);
      setProperties((prev) => prev.map((p) => (p.id === id ? result.property : p)));
      setSelectedProperty((prev) => (prev && prev.id === id ? result.property : prev));
      showSuccessToast(
        verified ? 'Landlord Verified' : 'Verification Removed',
        verified ? 'This listing now shows the verified badge.' : 'The verified badge was removed from this listing.'
      );
    },
    [showSuccessToast]
  );

  const setEnquiryStatus = useCallback(
    async (id: string, status: Enquiry['status']) => {
      const result = await api.updateEnquiryStatus(id, status);
      setEnquiries((prev) => prev.map((item) => (item.id === id ? result.enquiry : item)));

      // Keep the dashboard KPI ("new enquiries") honest after triage.
      try {
        const stats = await api.adminStats();
        setAnalytics(stats.stats);
      } catch {
        /* the status change itself already succeeded */
      }

      showSuccessToast('Enquiry Updated', result.message);
    },
    [showSuccessToast]
  );

  const toggleSaveProperty = useCallback(
    async (id: string) => {
      const isSaved = savedPropertyIds.includes(id);

      if (!currentUser) {
        // Guests keep a lightweight local preference (not business data).
        const next = isSaved ? savedPropertyIds.filter((item) => item !== id) : [...savedPropertyIds, id];
        setSavedPropertyIds(next);
        writeGuestSaved(next);
        if (isSaved) showInfoToast('Property Removed', 'Removed from your saved properties list.');
        else showSuccessToast('Property Saved', 'Added to your saved property collection.');
        return;
      }

      try {
        const result = isSaved ? await api.unsaveProperty(id) : await api.saveProperty(id);
        setSavedPropertyIds(result.propertyIds);
        if (isSaved) showInfoToast('Property Removed', 'Removed from your saved properties list.');
        else showSuccessToast('Property Saved', 'Added to your saved property collection.');
      } catch (error) {
        showErrorToast('Could not update saved properties', messageForError(error));
      }
    },
    [currentUser, savedPropertyIds, showErrorToast, showInfoToast, showSuccessToast]
  );

  const incrementPropertyViews = useCallback((id: string) => {
    if (viewedPropertyIds.current.has(id)) return;
    viewedPropertyIds.current.add(id);
    api
      .getProperty(id)
      .then((result) => {
        setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, viewsCount: result.property.viewsCount } : p)));
      })
      .catch(() => {
        /* view counting is non critical */
      });
  }, []);

  // -------------------------------------------------------------------------
  // Requests, viewings
  // -------------------------------------------------------------------------
  const submitTenantRequest = useCallback(
    async (data: TenantRequestInput) => {
      await api.createTenantRequest(data);
      showSuccessToast(
        'Property Request Submitted',
        'Our matching team is searching for homes matching your location & budget.'
      );
      if (currentUser) {
        const result = await api.listTenantRequests().catch(() => ({ requests: [] }));
        setTenantRequests(result.requests);
      }
    },
    [currentUser, showSuccessToast]
  );

  const updateTenantRequestStatus = useCallback(
    async (id: string, status: string, matchedPropertyIds?: string[]) => {
      const result = await api.updateTenantRequest(id, { status, matchedPropertyIds });
      setTenantRequests((prev) => prev.map((r) => (r.id === id ? result.request : r)));
      showSuccessToast('Tenant Request Updated', `Request status set to ${status}.`);
    },
    [showSuccessToast]
  );

  const scheduleViewing = useCallback(
    async (data: ViewingInput): Promise<ViewingSchedule> => {
      const result = await api.createViewing(data);
      setViewingSchedules((prev) => [result.viewing, ...prev.filter((v) => v.id !== result.viewing.id)]);
      if (currentUser) {
        const notificationsResult = await api.listNotifications().catch(() => ({ notifications: [] }));
        setNotifications(notificationsResult.notifications);
      }
      showSuccessToast(
        'Viewing request sent',
        `${result.viewing.propertyTitle}: your request is with ${result.viewing.assignedAgent}. It is not confirmed until a time is agreed.`
      );
      return result.viewing;
    },
    [currentUser, showSuccessToast]
  );

  const refreshViewings = useCallback(async () => {
    const result = await api.listViewings().catch(() => ({ viewings: [] as ViewingSchedule[] }));
    setViewingSchedules(result.viewings);
  }, []);

  const runViewingAction = useCallback(
    async (
      id: string,
      action: 'propose' | 'confirm' | 'reschedule' | 'request-reschedule' | 'accept-reschedule' | 'decline-reschedule' | 'cancel' | 'complete' | 'no-show' | 'could-not-proceed',
      body: { date?: string; time?: string; note?: string; reason?: string; who?: 'tenant' | 'agent' } = {}
    ) => {
      try {
        const result = await api.viewingAction(id, action, body);
        setViewingSchedules((prev) => {
          const next = prev.some((v) => v.id === id)
            ? prev.map((v) => (v.id === id ? result.viewing : v))
            : [result.viewing, ...prev];
          return next;
        });
        showSuccessToast('Viewing updated', result.message);
        if (user_is_admin(currentUser)) {
          const refreshed = await api.listAllViewings().catch(() => null);
          if (refreshed) setViewingSchedules(refreshed.viewings);
        }
        return { ok: true };
      } catch (err) {
        const apiError = err as { fields?: Record<string, string> };
        return { ok: false, error: messageForError(err), fields: apiError.fields ?? {} };
      }
    },
    [currentUser, showSuccessToast]
  );

  const updateViewingStatus = useCallback(
    async (id: string, status: ViewingSchedule['status'], feePaid?: boolean, notes?: string) => {
      const result = await api.updateViewing(id, {
        status,
        viewingFeePaid: feePaid,
        outcomeNotes: notes,
      });
      setViewingSchedules((prev) => prev.map((v) => (v.id === id ? result.viewing : v)));
      if (user_is_admin(currentUser)) {
        const stats = await api.adminStats().catch(() => null);
        if (stats) setAnalytics(stats.stats);
      }
      showSuccessToast('Viewing Status Updated', `Viewing status set to ${status.toUpperCase()}.`);
    },
    [currentUser, showSuccessToast]
  );

  // -------------------------------------------------------------------------
  // Alerts & enquiries
  // -------------------------------------------------------------------------
  const subscribeToSearchAlerts = useCallback(
    async (data: SearchAlertInput) => {
      const result = await api.createSearchAlert(data);
      setSearchAlerts((prev) => [result.alert, ...prev]);
      showSuccessToast('Search Alert Activated!', `Alerts will be sent to ${data.email} for matching listings.`);
      return result.alert;
    },
    [showSuccessToast]
  );

  const unsubscribeFromSearchAlerts = useCallback(
    async (id: string) => {
      await api.deleteSearchAlert(id);
      setSearchAlerts((prev) => prev.filter((alert) => alert.id !== id));
      showInfoToast('Alert Subscription Removed', 'You will no longer receive alerts for this search.');
    },
    [showInfoToast]
  );

  const sendEnquiry = useCallback(
    async (data: {
      name: string;
      email: string;
      phone?: string;
      message: string;
      propertyId?: string;
      source?: string;
    }) => {
      await api.createEnquiry(data);
      if (data.propertyId) {
        setProperties((prev) =>
          prev.map((p) => (p.id === data.propertyId ? { ...p, enquiriesCount: p.enquiriesCount + 1 } : p))
        );
      }
      showSuccessToast('Message Sent', 'A Goodlucks Homes specialist will be in touch shortly.');
    },
    [showSuccessToast]
  );

  // -------------------------------------------------------------------------
  // Misc
  // -------------------------------------------------------------------------
  const markNotificationRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await api.markNotificationRead(id).catch(() => {
      /* optimistic update is reverted on next refresh if the call failed */
    });
  }, []);

  /**
   * Drain the email outbox on demand (no shell cron on shared hosting).
   * Refreshes the audit log afterwards so statuses flip from queued to sent.
   */
  const runEmailOutbox = useCallback(async () => {
    const result = await api.runEmailOutbox();
    setEmailOutbox(result.outbox);
    const logs = await api.adminEmailLogs().catch(() => null);
    if (logs) {
      setEmailLogs(logs.logs);
      setEmailOutbox(logs.outbox);
    }
    showSuccessToast('Email queue processed', result.message);
  }, [showSuccessToast]);

  const markAllNotificationsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const result = await api.markAllNotificationsRead().catch(() => null);
    if (result) {
      setNotifications(result.notifications);
    }
  }, []);

  const refreshAdminData = useCallback(async () => {
    if (!user_is_admin(currentUser)) return;
    await loadAccountData(currentUser);
    await loadProperties(currentUser);
  }, [currentUser, loadAccountData, loadProperties]);

  const refreshSession = useCallback(async () => {
    try {
      const session = await api.me();
      setCurrentUser(session.user);
      if (session.user) {
        setSavedPropertyIds(session.savedPropertyIds);
      }
    } catch {
      // A failed refresh leaves the current view as-is; the affected screen shows
      // its own error and the next request re-checks permissions server-side.
    }
  }, []);

  const value = useMemo<AppContextType>(
    () => ({
      currentUser,
      currentRole,
      isBooting,
      bootError,
      retryBootstrap,
      properties,
      selectedProperty,
      tenantRequests,
      viewingSchedules,
      emailLogs,
      notifications,
      enquiries,
      analytics,
      savedPropertyIds,
      searchAlerts,
      route,
      currentView,
      selectedPropertyId,
      sectionTab,
      navigate,
      setSectionTab,
      setCurrentView,
      navigateToProperty,
      toasts,
      showToast,
      showSuccessToast,
      showErrorToast,
      showInfoToast,
      dismissToast,
      login,
      register,
      adminLogin,
      logout,
      updateUserProfile,
      updateAgentProfile,
      changePassword,
      uploadAvatar,
      removeAvatar,
      addProperty,
      updateProperty,
      updatePropertyStatus,
      deleteProperty,
      toggleFeatured,
      verifyProperty,
      toggleSaveProperty,
      incrementPropertyViews,
      refreshProperties,
      submitTenantRequest,
      updateTenantRequestStatus,
      setEnquiryStatus,
      scheduleViewing,
      runViewingAction,
      refreshViewings,
      updateViewingStatus,
      subscribeToSearchAlerts,
      unsubscribeFromSearchAlerts,
      sendEnquiry,
      markNotificationRead,
      markAllNotificationsRead,
      emailOutbox,
      runEmailOutbox,
      refreshAdminData,
      refreshSession,
    }),
    [
      currentUser,
      currentRole,
      isBooting,
      bootError,
      retryBootstrap,
      properties,
      selectedProperty,
      tenantRequests,
      viewingSchedules,
      emailLogs,
      notifications,
      enquiries,
      analytics,
      savedPropertyIds,
      searchAlerts,
      route,
      currentView,
      selectedPropertyId,
      sectionTab,
      navigate,
      setSectionTab,
      setCurrentView,
      navigateToProperty,
      toasts,
      showToast,
      showSuccessToast,
      showErrorToast,
      showInfoToast,
      dismissToast,
      login,
      register,
      adminLogin,
      logout,
      updateUserProfile,
      updateAgentProfile,
      changePassword,
      uploadAvatar,
      removeAvatar,
      addProperty,
      updateProperty,
      updatePropertyStatus,
      deleteProperty,
      toggleFeatured,
      verifyProperty,
      toggleSaveProperty,
      incrementPropertyViews,
      refreshProperties,
      submitTenantRequest,
      updateTenantRequestStatus,
      setEnquiryStatus,
      scheduleViewing,
      runViewingAction,
      refreshViewings,
      updateViewingStatus,
      subscribeToSearchAlerts,
      unsubscribeFromSearchAlerts,
      sendEnquiry,
      markNotificationRead,
      markAllNotificationsRead,
      emailOutbox,
      runEmailOutbox,
      refreshAdminData,
      refreshSession,
    ]
  );

  return (
    <AppContext.Provider value={value}>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {children}
    </AppContext.Provider>
  );
};

function user_is_admin(user: User | null): boolean {
  return user?.role === 'admin';
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
