import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  EmailLog,
  Enquiry,
  NotificationItem,
  Property,
  PropertyStatus,
  RentReceipt,
  SearchAlertSubscription,
  TenancyAgreement,
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
  newUsersToday: 0,
  newUsersThisWeek: 0,
  totalProperties: 0,
  approvedProperties: 0,
  pendingProperties: 0,
  rejectedProperties: 0,
  totalViewings: 0,
  completedViewings: 0,
  physicalRevenueGhs: 0,
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
  agreements: TenancyAgreement[];
  receipts: RentReceipt[];
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
  login: (email: string, password: string, role?: 'tenant' | 'landlord') => Promise<SignInResult>;
  register: (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: 'tenant' | 'landlord';
  }) => Promise<SignInResult>;
  adminLogin: (email: string, password: string, accessKey: string) => Promise<SignInResult>;
  logout: () => Promise<void>;
  updateUserProfile: (data: Partial<User> & { password?: string }) => Promise<SignInResult>;

  // Properties
  addProperty: (data: PropertyInput) => Promise<Property>;
  updateProperty: (id: string, data: Partial<PropertyInput>) => Promise<void>;
  updatePropertyStatus: (id: string, status: PropertyStatus) => Promise<void>;
  deleteProperty: (id: string) => Promise<void>;
  toggleFeatured: (id: string, featured: boolean) => Promise<void>;
  toggleSaveProperty: (id: string) => Promise<void>;
  incrementPropertyViews: (id: string) => void;
  refreshProperties: () => Promise<void>;

  // Requests & viewings
  submitTenantRequest: (data: TenantRequestInput) => Promise<void>;
  updateTenantRequestStatus: (id: string, status: string, matchedPropertyIds?: string[]) => Promise<void>;
  scheduleViewing: (data: ViewingInput) => Promise<ViewingSchedule>;
  updateViewingStatus: (id: string, status: ViewingSchedule['status'], feePaid?: boolean, notes?: string) => Promise<void>;

  // Agreements & receipts
  createAgreement: (data: Record<string, unknown>) => Promise<TenancyAgreement>;
  signAgreement: (id: string, role: 'landlord' | 'tenant') => Promise<void>;
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
  refreshAdminData: () => Promise<void>;
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
  const [agreements, setAgreements] = useState<TenancyAgreement[]>([]);
  const [receipts, setReceipts] = useState<RentReceipt[]>([]);
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

    if (user?.role === 'landlord') {
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
      setAgreements([]);
      setReceipts([]);
      setEmailLogs([]);
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
      setEnquiries(enquiryResult.enquiries);
      setSearchAlerts(alerts.alerts);
      const [agreementResult, receiptResult] = await Promise.all([
        api.listAgreements().catch(() => ({ agreements: [] })),
        api.listReceipts().catch(() => ({ receipts: [] })),
      ]);
      setAgreements(agreementResult.agreements);
      setReceipts(receiptResult.receipts);
      return;
    }

    if (user.role === 'landlord') {
      const [viewings, notificationsResult, savedResult, agreementResult, receiptResult] = await Promise.all([
        api.listViewings().catch(() => ({ viewings: [] })),
        api.listNotifications().catch(() => ({ notifications: [] })),
        api.listSaved().catch(() => ({ propertyIds: [] })),
        api.listAgreements().catch(() => ({ agreements: [] })),
        api.listReceipts().catch(() => ({ receipts: [] })),
      ]);
      setViewingSchedules(viewings.viewings);
      setNotifications(notificationsResult.notifications);
      setSavedPropertyIds(savedResult.propertyIds);
      setAgreements(agreementResult.agreements);
      setReceipts(receiptResult.receipts);
      setTenantRequests([]);
      return;
    }

    const [requests, viewings, notificationsResult, alerts, savedResult, agreementResult] = await Promise.all([
      api.listTenantRequests().catch(() => ({ requests: [] })),
      api.listViewings().catch(() => ({ viewings: [] })),
      api.listNotifications().catch(() => ({ notifications: [] })),
      api.listSearchAlerts().catch(() => ({ alerts: [] })),
      api.listSaved().catch(() => ({ propertyIds: [] })),
      api.listAgreements().catch(() => ({ agreements: [] })),
    ]);
    setTenantRequests(requests.requests);
    setViewingSchedules(viewings.viewings);
    setNotifications(notificationsResult.notifications);
    setSearchAlerts(alerts.alerts);
    setSavedPropertyIds(savedResult.propertyIds);
    setAgreements(agreementResult.agreements);
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
      } else if (window.location.pathname.includes('/admin-login')) {
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
          const url = new URL(window.location.href);
          url.searchParams.set('property', propertyId);
          window.history.pushState({}, '', url.toString());
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
    async (email: string, password: string, role?: 'tenant' | 'landlord'): Promise<SignInResult> => {
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
      role: 'tenant' | 'landlord';
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
    async (id: string, data: Partial<PropertyInput>) => {
      const result = await api.updateProperty(id, data);
      setProperties((prev) => prev.map((p) => (p.id === id ? result.property : p)));
      if (selectedProperty?.id === id) setSelectedProperty(result.property);
      showSuccessToast('Property Listing Updated', 'Changes to the property details were saved.');
    },
    [selectedProperty, showSuccessToast]
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
        'Viewing Request Sent',
        `Viewing for "${result.viewing.propertyTitle}" scheduled for ${result.viewing.date} at ${result.viewing.time}.`
      );
      return result.viewing;
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
  // Agreements & receipts
  // -------------------------------------------------------------------------
  const createAgreement = useCallback(
    async (data: Record<string, unknown>) => {
      const result = await api.createAgreement(data);
      setAgreements((prev) => [result.agreement, ...prev]);
      showSuccessToast(
        'Tenancy Agreement Created',
        `Agreement generated with verification code ${result.agreement.verificationCode}`
      );
      return result.agreement;
    },
    [showSuccessToast]
  );

  const signAgreement = useCallback(
    async (id: string, role: 'landlord' | 'tenant') => {
      const result = await api.signAgreement(id, role);
      setAgreements((prev) => prev.map((a) => (a.id === id ? result.agreement : a)));
      showSuccessToast('Agreement Electronically Signed', `Signed as ${role === 'landlord' ? 'Landlord' : 'Tenant'}.`);
    },
    [showSuccessToast]
  );

  const createReceipt = useCallback(
    async (data: Record<string, unknown>) => {
      const result = await api.createReceipt(data);
      setReceipts((prev) => [result.receipt, ...prev]);
      showSuccessToast('Official Receipt Issued', `Receipt No. ${result.receipt.receiptNo} issued successfully.`);
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

  const refreshAdminData = useCallback(async () => {
    if (!user_is_admin(currentUser)) return;
    await loadAccountData(currentUser);
    await loadProperties(currentUser);
  }, [currentUser, loadAccountData, loadProperties]);

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
      agreements,
      receipts,
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
      toggleSaveProperty,
      incrementPropertyViews,
      refreshProperties,
      submitTenantRequest,
      updateTenantRequestStatus,
      scheduleViewing,
      updateViewingStatus,
      createAgreement,
      signAgreement,
      createReceipt,
      subscribeToSearchAlerts,
      unsubscribeFromSearchAlerts,
      sendEnquiry,
      markNotificationRead,
      refreshAdminData,
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
      agreements,
      receipts,
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
      toggleSaveProperty,
      incrementPropertyViews,
      refreshProperties,
      submitTenantRequest,
      updateTenantRequestStatus,
      scheduleViewing,
      updateViewingStatus,
      createAgreement,
      signAgreement,
      createReceipt,
      subscribeToSearchAlerts,
      unsubscribeFromSearchAlerts,
      sendEnquiry,
      markNotificationRead,
      refreshAdminData,
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
