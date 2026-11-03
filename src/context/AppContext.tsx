import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentProfile,
  EmailLog,
  EmailOutboxSummary,
  Enquiry,
  NotificationItem,
  Property,
  PropertyStatus,
  RentReceipt,
  SearchAlertSubscription,
  TenantRequest,
  ToastNotification,
  User,
  UserRole,
  ViewingSchedule,
} from '../types';
import { ToastContainer } from '../components/ToastContainer';
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
  receipts: RentReceipt[];
  /** False while receipt issuing is disabled server-side (Increment B pending). */
  receiptIssuingEnabled: boolean;
  notifications: NotificationItem[];
  enquiries: Enquiry[];
  analytics: AdminStats;
  savedPropertyIds: string[];
  searchAlerts: SearchAlertSubscription[];

  // Navigation
  currentView: string;
  selectedPropertyId: string | null;
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
  }) => Promise<SignInResult>;
  adminLogin: (email: string, password: string, accessKey: string) => Promise<SignInResult>;
  logout: () => Promise<void>;
  updateUserProfile: (data: Partial<User> & { password?: string }) => Promise<SignInResult>;
  /** Update the signed-in agent's own profile (agency name, operating city). */
  updateAgentProfile: (data: { agencyName?: string; operatingCity?: string }) => Promise<SignInResult>;

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
    action: 'propose' | 'confirm' | 'reschedule' | 'request-reschedule' | 'cancel' | 'complete' | 'no-show' | 'could-not-proceed',
    body?: { date?: string; time?: string; note?: string; reason?: string; who?: 'tenant' | 'agent' }
  ) => Promise<{ ok: boolean; error?: string; fields?: Record<string, string> }>;
  refreshViewings: () => Promise<void>;

  // Rent payment records
  createReceipt: (data: Record<string, unknown>) => Promise<RentReceipt>;

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

function initialView(): string {
  if (typeof window === 'undefined') return 'home';
  const pathname = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = window.location.search.toLowerCase();
  if (/^\/property\//.test(pathname) || hash.includes('/property/')) {
    return 'property-detail';
  }
  if (
    pathname.includes('/admin-login') ||
    pathname.includes('/admin') ||
    hash.includes('admin-login') ||
    hash.includes('admin') ||
    search.includes('admin=1') ||
    search.includes('admin=true')
  ) {
    return 'admin-login';
  }
  return 'home';
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
  const [receipts, setReceipts] = useState<RentReceipt[]>([]);
  const [receiptIssuingEnabled, setReceiptIssuingEnabled] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [analytics, setAnalytics] = useState<AdminStats>(EMPTY_STATS);
  const [searchAlerts, setSearchAlerts] = useState<SearchAlertSubscription[]>([]);
  const [savedPropertyIds, setSavedPropertyIds] = useState<string[]>(() => readGuestSaved());

  const [currentView, setCurrentViewState] = useState<string>(() => initialView());
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('property') || params.get('p') || null;
  });
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const viewedPropertyIds = useRef<Set<string>>(new Set());

  const currentRole: UserRole = currentUser ? currentUser.role : 'guest';

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
      setReceipts([]);
      setReceiptIssuingEnabled(false);
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
      const receiptResult = await api.listReceipts().catch(() => ({ receipts: [], issuingEnabled: false }));
      setReceipts(receiptResult.receipts);
      setReceiptIssuingEnabled(Boolean(receiptResult.issuingEnabled));
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
      setReceipts([]);
      setReceiptIssuingEnabled(false);
      return;
    }

    if (user.role === 'landlord') {
      const [viewings, notificationsResult, savedResult, receiptResult] = await Promise.all([
        api.listViewings().catch(() => ({ viewings: [] })),
        api.listNotifications().catch(() => ({ notifications: [] })),
        api.listSaved().catch(() => ({ propertyIds: [] })),
        api.listReceipts().catch(() => ({ receipts: [], issuingEnabled: false })),
      ]);
      setViewingSchedules(viewings.viewings);
      setNotifications(notificationsResult.notifications);
      setSavedPropertyIds(savedResult.propertyIds);
      setReceipts(receiptResult.receipts);
      setReceiptIssuingEnabled(Boolean(receiptResult.issuingEnabled));
      setTenantRequests([]);
      return;
    }

    const [requests, viewings, notificationsResult, alerts, savedResult, receiptResult] = await Promise.all([
      api.listTenantRequests().catch(() => ({ requests: [] })),
      api.listViewings().catch(() => ({ viewings: [] })),
      api.listNotifications().catch(() => ({ notifications: [] })),
      api.listSearchAlerts().catch(() => ({ alerts: [] })),
      api.listSaved().catch(() => ({ propertyIds: [] })),
      api.listReceipts().catch(() => ({ receipts: [], issuingEnabled: false })),
    ]);
    setTenantRequests(requests.requests);
    setViewingSchedules(viewings.viewings);
    setNotifications(notificationsResult.notifications);
    setSearchAlerts(alerts.alerts);
    setSavedPropertyIds(savedResult.propertyIds);
    setReceipts(receiptResult.receipts);
    setReceiptIssuingEnabled(Boolean(receiptResult.issuingEnabled));
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
  // Deep links (?property=...), admin paths, and back/forward navigation
  // -------------------------------------------------------------------------
  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const propertyParam = params.get('property') || params.get('p');
      if (propertyParam) {
        setSelectedPropertyId(propertyParam);
        setCurrentViewState('property-detail');
        return;
      }
      const pathname = window.location.pathname.toLowerCase();
      // Clean, shareable listing URLs: /property/<id>
      const pathMatch = pathname.match(/^\/property\/([a-z0-9\-_]+)/);
      if (pathMatch) {
        setSelectedPropertyId(pathMatch[1]);
        setCurrentViewState('property-detail');
        return;
      }
      if (pathname.includes('/admin-login') || pathname.includes('/admin')) {
        setCurrentViewState('admin-login');
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('hashchange', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('hashchange', syncFromUrl);
    };
  }, []);

  // Keep the selected property in sync with the catalogue / deep links
  useEffect(() => {
    if (!selectedPropertyId) {
      setSelectedProperty(null);
      return;
    }
    const local = properties.find((p) => p.id === selectedPropertyId);
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
  }, [selectedPropertyId, properties]);

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------
  const setCurrentView = useCallback((view: string) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (typeof window !== 'undefined') {
      if (view === 'admin-login') {
        if (!window.location.pathname.includes('/admin-login')) {
          try {
            window.history.pushState({}, '', '/admin-login');
          } catch {
            window.location.hash = '#/admin-login';
          }
        }
      } else if (
        window.location.pathname.includes('/admin-login') ||
        window.location.pathname.toLowerCase().startsWith('/property/')
      ) {
        try {
          window.history.pushState({}, '', '/');
        } catch {
          window.location.hash = '#/';
        }
      }
    }
    setCurrentViewState(view);
    void api.trackPageView(view);
  }, []);

  const navigateToProperty = useCallback(
    (propertyId: string) => {
      setSelectedPropertyId(propertyId);
      const local = properties.find((p) => p.id === propertyId);
      if (local) setSelectedProperty(local);
      if (typeof window !== 'undefined') {
        try {
          window.history.pushState({}, '', `/property/${encodeURIComponent(propertyId)}`);
        } catch {
          window.location.hash = `#/property/${propertyId}`;
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setCurrentViewState('property-detail');
    },
    [properties]
  );

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
        setCurrentView('dashboard');
        return { ok: true };
      } catch (error) {
        return { ok: false, error: messageForError(error), fields: (error as any)?.fields || {} };
      }
    },
    [handleSignIn, setCurrentView, showSuccessToast]
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
    }): Promise<SignInResult> => {
      try {
        const result = await api.register(data);
        await handleSignIn(result.user);
        showSuccessToast('Account Created', `Welcome to Goodlucks Homes, ${result.user.name}!`);
        setCurrentView('dashboard');
        return { ok: true };
      } catch (error) {
        return { ok: false, error: messageForError(error), fields: (error as any)?.fields || {} };
      }
    },
    [handleSignIn, setCurrentView, showSuccessToast]
  );

  const adminLogin = useCallback(
    async (email: string, password: string, accessKey: string): Promise<SignInResult> => {
      try {
        const result = await api.adminLogin(email, password, accessKey);
        await handleSignIn(result.user);
        showSuccessToast('Authentication Granted', 'Welcome to the Goodlucks admin console.');
        setCurrentViewState('dashboard');
        return { ok: true };
      } catch (error) {
        return { ok: false, error: messageForError(error), fields: (error as any)?.fields || {} };
      }
    },
    [handleSignIn, showSuccessToast]
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
    setCurrentViewState('home');
  }, [showInfoToast]);

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
      action: 'propose' | 'confirm' | 'reschedule' | 'request-reschedule' | 'cancel' | 'complete' | 'no-show' | 'could-not-proceed',
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
  // Rent payment records
  // -------------------------------------------------------------------------
  const createReceipt = useCallback(
    async (data: Record<string, unknown>) => {
      const result = await api.createReceipt(data);
      setReceipts((prev) => [result.receipt, ...prev]);
      showSuccessToast('Payment record saved', `Record ${result.receipt.receiptNo} saved.`);
      return result.receipt;
    },
    [showSuccessToast]
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
   * Clear the unread badge. Called when the notifications view opens, so the
   * bell stops advertising alerts the member has already looked at.
   */
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
      receipts,
      receiptIssuingEnabled,
      notifications,
      enquiries,
      analytics,
      savedPropertyIds,
      searchAlerts,
      currentView,
      selectedPropertyId,
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
      createReceipt,
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
      receipts,
      receiptIssuingEnabled,
      notifications,
      enquiries,
      analytics,
      savedPropertyIds,
      searchAlerts,
      currentView,
      selectedPropertyId,
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
      createReceipt,
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
