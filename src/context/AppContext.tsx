import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  User, 
  Property, 
  TenantRequest, 
  ViewingSchedule, 
  EmailLog, 
  NotificationItem, 
  AnalyticsStats, 
  PropertyStatus,
  UserRole,
  ToastNotification,
  TenancyAgreement,
  RentReceipt,
  SearchAlertSubscription
} from '../types';
import { 
  INITIAL_USERS, 
  INITIAL_PROPERTIES, 
  INITIAL_TENANT_REQUESTS, 
  INITIAL_VIEWING_SCHEDULES, 
  INITIAL_EMAIL_LOGS, 
  INITIAL_NOTIFICATIONS, 
  INITIAL_ANALYTICS,
  INITIAL_AGREEMENTS,
  INITIAL_RECEIPTS
} from '../data/mockData';
import { ToastContainer } from '../components/ToastContainer';
import { sendEmailViaResend } from '../services/emailService';

interface AppContextType {
  currentUser: User | null;
  currentRole: UserRole;
  properties: Property[];
  tenantRequests: TenantRequest[];
  viewingSchedules: ViewingSchedule[];
  emailLogs: EmailLog[];
  agreements: TenancyAgreement[];
  receipts: RentReceipt[];
  notifications: NotificationItem[];
  analytics: AnalyticsStats;
  savedPropertyIds: string[];
  searchAlerts: SearchAlertSubscription[];
  currentView: string;
  selectedPropertyId: string | null;
  toasts: ToastNotification[];
  
  // Toast Actions
  showToast: (toast: Omit<ToastNotification, 'id'>) => void;
  showSuccessToast: (title: string, message?: string) => void;
  showErrorToast: (title: string, message?: string) => void;
  showInfoToast: (title: string, message?: string) => void;
  dismissToast: (id: string) => void;

  // Search Alert Actions
  subscribeToSearchAlerts: (subData: Omit<SearchAlertSubscription, 'id' | 'createdAt' | 'active'>) => SearchAlertSubscription;
  unsubscribeFromSearchAlerts: (id: string) => void;

  // Navigation & View Actions
  setCurrentView: (view: string) => void;
  navigateToProperty: (propertyId: string) => void;
  
  // Auth Actions
  loginAsRole: (role: 'tenant' | 'landlord' | 'admin') => void;
  logout: () => void;
  updateUserProfile: (data: Partial<User>) => void;
  
  // Property Actions
  addProperty: (propertyData: Omit<Property, 'id' | 'createdAt' | 'updatedAt' | 'viewsCount' | 'enquiriesCount'>) => Property;
  updateProperty: (id: string, propertyData: Partial<Property>) => void;
  updatePropertyStatus: (id: string, status: PropertyStatus) => void;
  deleteProperty: (id: string) => void;
  toggleSaveProperty: (id: string) => void;
  incrementPropertyViews: (id: string) => void;
  
  // Tenant Request Actions
  submitTenantRequest: (requestData: Omit<TenantRequest, 'id' | 'createdAt' | 'status' | 'tenantId'>) => TenantRequest;
  updateTenantRequestStatus: (id: string, status: TenantRequest['status'], matchedPropertyIds?: string[]) => void;
  
  // Viewing Actions
  scheduleViewing: (viewingData: Omit<ViewingSchedule, 'id' | 'createdAt'>) => void;
  updateViewingStatus: (id: string, status: ViewingSchedule['status'], feePaid?: boolean, notes?: string) => void;
  
  // Tenancy Agreement & Receipt Actions
  createAgreement: (agreementData: Omit<TenancyAgreement, 'id' | 'createdAt' | 'verificationCode'>) => TenancyAgreement;
  signAgreement: (id: string, role: 'landlord' | 'tenant') => void;
  createReceipt: (receiptData: Omit<RentReceipt, 'id' | 'createdAt' | 'receiptNo' | 'verificationCode'>) => RentReceipt;

  // Helper
  sendSimulatedEmail: (type: EmailLog['type'], recipientEmail: string, recipientName: string, subject: string, bodyPreview: string) => void;
  markNotificationRead: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY_USER = 'goodlucks_user';
const STORAGE_KEY_PROPERTIES = 'goodlucks_properties';
const STORAGE_KEY_REQUESTS = 'goodlucks_requests';
const STORAGE_KEY_VIEWINGS = 'goodlucks_viewings';
const STORAGE_KEY_SAVED = 'goodlucks_saved';
const STORAGE_KEY_EMAILS = 'goodlucks_emails';
const STORAGE_KEY_NOTIFS = 'goodlucks_notifs';
const STORAGE_KEY_AGREEMENTS = 'goodlucks_agreements';
const STORAGE_KEY_RECEIPTS = 'goodlucks_receipts';
const STORAGE_KEY_SEARCH_ALERTS = 'goodlucks_search_alerts';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load from local storage or fallback to initial defaults
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_USER);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return null; // Guest by default, user can log in as Tenant, Landlord or Admin easily
  });

  const [properties, setProperties] = useState<Property[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PROPERTIES);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return INITIAL_PROPERTIES;
  });

  const [tenantRequests, setTenantRequests] = useState<TenantRequest[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_REQUESTS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return INITIAL_TENANT_REQUESTS;
  });

  const [viewingSchedules, setViewingSchedules] = useState<ViewingSchedule[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VIEWINGS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return INITIAL_VIEWING_SCHEDULES;
  });

  const [savedPropertyIds, setSavedPropertyIds] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SAVED);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return ['prop-1', 'prop-3'];
  });

  const [emailLogs, setEmailLogs] = useState<EmailLog[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_EMAILS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return INITIAL_EMAIL_LOGS;
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_NOTIFS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return INITIAL_NOTIFICATIONS;
  });

  const [agreements, setAgreements] = useState<TenancyAgreement[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_AGREEMENTS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return INITIAL_AGREEMENTS;
  });

  const [receipts, setReceipts] = useState<RentReceipt[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_RECEIPTS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return INITIAL_RECEIPTS;
  });

  const [searchAlerts, setSearchAlerts] = useState<SearchAlertSubscription[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SEARCH_ALERTS);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return [];
  });

  const [analytics] = useState<AnalyticsStats>(INITIAL_ANALYTICS);
  const [currentView, setCurrentViewState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
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
    }
    return 'home';
  });
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Toast Notification State
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const showToast = (toast: Omit<ToastNotification, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts(prev => [...prev, { ...toast, id }]);
  };

  const showSuccessToast = (title: string, message?: string) => {
    showToast({ type: 'success', title, message });
  };

  const showErrorToast = (title: string, message?: string) => {
    showToast({ type: 'error', title, message });
  };

  const showInfoToast = (title: string, message?: string) => {
    showToast({ type: 'info', title, message });
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Sync /admin-login path & hash & property deep-linking query parameters
  useEffect(() => {
    const checkPath = () => {
      if (typeof window === 'undefined') return;
      const pathname = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      const search = window.location.search.toLowerCase();
      
      const urlParams = new URLSearchParams(window.location.search);
      const propertyParam = urlParams.get('property') || urlParams.get('p');

      if (propertyParam) {
        setSelectedPropertyId(propertyParam);
        setCurrentViewState('property-detail');
        return;
      }

      if (
        pathname.includes('/admin-login') || 
        pathname.includes('/admin') ||
        hash.includes('admin-login') || 
        hash.includes('admin') ||
        search.includes('admin=1') ||
        search.includes('admin=true')
      ) {
        setCurrentViewState('admin-login');
      }
    };
    checkPath();
    window.addEventListener('popstate', checkPath);
    window.addEventListener('hashchange', checkPath);
    return () => {
      window.removeEventListener('popstate', checkPath);
      window.removeEventListener('hashchange', checkPath);
    };
  }, []);

  // Sync to local storage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROPERTIES, JSON.stringify(properties));
  }, [properties]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_REQUESTS, JSON.stringify(tenantRequests));
  }, [tenantRequests]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VIEWINGS, JSON.stringify(viewingSchedules));
  }, [viewingSchedules]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(savedPropertyIds));
  }, [savedPropertyIds]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_EMAILS, JSON.stringify(emailLogs));
  }, [emailLogs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_AGREEMENTS, JSON.stringify(agreements));
  }, [agreements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RECEIPTS, JSON.stringify(receipts));
  }, [receipts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SEARCH_ALERTS, JSON.stringify(searchAlerts));
  }, [searchAlerts]);

  const currentRole: UserRole = currentUser ? currentUser.role : 'guest';

  const setCurrentView = (view: string) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'admin-login') {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/admin-login')) {
        try {
          window.history.pushState({}, '', '/admin-login');
        } catch (e) {
          window.location.hash = '#/admin-login';
        }
      }
    } else {
      if (typeof window !== 'undefined' && window.location.pathname.includes('/admin-login')) {
        try {
          window.history.pushState({}, '', '/');
        } catch (e) {
          window.location.hash = '#/';
        }
      }
    }
    setCurrentViewState(view);
  };

  const navigateToProperty = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('property', propertyId);
        window.history.pushState({}, '', url.toString());
      } catch (e) {
        window.location.hash = `#/property/${propertyId}`;
      }
    }
    setCurrentView('property-detail');
  };

  const loginAsRole = (role: 'tenant' | 'landlord' | 'admin') => {
    const found = INITIAL_USERS.find(u => u.role === role);
    if (found) {
      setCurrentUser(found);
      showSuccessToast('Welcome Back!', `Signed in as ${found.name} (${found.role.toUpperCase()})`);
      sendSimulatedEmail(
        'login',
        found.email,
        found.name,
        `Welcome Back to Goodlucks Homes, ${found.name}`,
        `Successful login detected into Goodlucks Homes platform as ${found.role.toUpperCase()}.`
      );
      if (role === 'admin') {
        setCurrentView('dashboard');
      } else {
        setCurrentView('dashboard');
      }
    }
  };

  const logout = () => {
    setCurrentUser(null);
    showInfoToast('Signed Out', 'You have been logged out of Goodlucks Homes.');
    setCurrentView('home');
  };

  const updateUserProfile = (data: Partial<User>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...data };
    setCurrentUser(updated);
    showSuccessToast('Account Details Updated', 'Your profile information has been saved successfully.');

    // Automated Resend Email Confirmation
    sendEmailViaResend({
      to: updated.email,
      recipientName: updated.name,
      subject: 'Account Details Updated - Goodlucks Homes',
      type: 'account_update',
      data: {
        updatedAt: new Date().toISOString(),
      },
    });
  };

  const sendSimulatedEmail = (
    type: EmailLog['type'],
    recipientEmail: string,
    recipientName: string,
    subject: string,
    bodyPreview: string
  ) => {
    const newLog: EmailLog = {
      id: `email-${Date.now()}`,
      recipientEmail,
      recipientName,
      subject,
      type,
      bodyPreview,
      sentAt: new Date().toISOString(),
      status: 'delivered',
    };
    setEmailLogs(prev => [newLog, ...prev]);
  };

  const addProperty = (propertyData: Omit<Property, 'id' | 'createdAt' | 'updatedAt' | 'viewsCount' | 'enquiriesCount'>): Property => {
    const newProp: Property = {
      ...propertyData,
      id: `prop-${Date.now()}`,
      viewsCount: 0,
      enquiriesCount: 0,
      status: 'pending', // Landlord submissions default to Pending Approval
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setProperties(prev => [newProp, ...prev]);

    showSuccessToast('Property Successfully Listed', `"${newProp.title}" submitted for Goodlucks Homes verification.`);

    // Send email notification to landlord and notification to admin
    if (currentUser) {
      sendSimulatedEmail(
        'property_submission',
        currentUser.email,
        currentUser.name,
        `Property Submission Received: ${newProp.title}`,
        `Your listing "${newProp.title}" in ${newProp.location} has been submitted for Goodlucks Homes approval.`
      );

      // Automated Resend Email Confirmation
      sendEmailViaResend({
        to: currentUser.email,
        recipientName: currentUser.name,
        subject: `Property Submission Confirmed: ${newProp.title}`,
        type: 'property_listing',
        data: {
          propertyTitle: newProp.title,
          location: newProp.location,
          rentGhs: newProp.rentGhs,
        },
      });
    }
    return newProp;
  };

  const updateProperty = (id: string, propertyData: Partial<Property>) => {
    setProperties(prev => prev.map(p => p.id === id ? { ...p, ...propertyData, updatedAt: new Date().toISOString() } : p));
    showSuccessToast('Property Listing Updated', 'Changes to the property details were saved.');
  };

  const updatePropertyStatus = (id: string, status: PropertyStatus) => {
    setProperties(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p, status, updatedAt: new Date().toISOString() };
        // Trigger email notification
        const landlord = INITIAL_USERS.find(u => u.id === p.landlordId) || currentUser;
        if (landlord) {
          if (status === 'active') {
            sendSimulatedEmail(
              'property_approval',
              landlord.email,
              landlord.name,
              `Property Approved: ${p.title}`,
              `Good news! Your listing "${p.title}" is now APPROVED and live on Goodlucks Homes.`
            );
          } else if (status === 'rejected') {
            sendSimulatedEmail(
              'property_rejection',
              landlord.email,
              landlord.name,
              `Property Status Update: ${p.title}`,
              `Your listing "${p.title}" requires modifications before approval on Goodlucks Homes.`
            );
          }
        }
        return updated;
      }
      return p;
    }));
    showSuccessToast('Listing Status Updated', `Property status updated to ${status.toUpperCase()}.`);
  };

  const deleteProperty = (id: string) => {
    setProperties(prev => prev.filter(p => p.id !== id));
    showInfoToast('Property Deleted', 'The property listing has been removed.');
  };

  const toggleSaveProperty = (id: string) => {
    setSavedPropertyIds(prev => {
      const exists = prev.includes(id);
      if (exists) {
        showInfoToast('Property Removed', 'Removed from your saved properties list.');
        return prev.filter(i => i !== id);
      } else {
        showSuccessToast('Property Saved', 'Added to your saved property collection.');
        return [...prev, id];
      }
    });
  };

  const incrementPropertyViews = (id: string) => {
    setProperties(prev => prev.map(p => p.id === id ? { ...p, viewsCount: p.viewsCount + 1 } : p));
  };

  const submitTenantRequest = (requestData: Omit<TenantRequest, 'id' | 'createdAt' | 'status' | 'tenantId'>): TenantRequest => {
    const newReq: TenantRequest = {
      ...requestData,
      id: `req-${Date.now()}`,
      tenantId: currentUser?.id || 'guest-tenant',
      status: 'submitted',
      createdAt: new Date().toISOString(),
    };
    setTenantRequests(prev => [newReq, ...prev]);

    showSuccessToast('Property Request Submitted', 'Our matching team is searching for homes matching your location & budget.');

    // Send confirmation email
    sendSimulatedEmail(
      'tenant_request',
      newReq.tenantEmail,
      newReq.tenantName,
      'Rental Enquiry Received - Goodlucks Homes',
      `Dear ${newReq.tenantName}, your rental enquiry for ${newReq.preferredLocations.join(', ')} (Budget GH₵ ${newReq.budgetMin} - GH₵ ${newReq.budgetMax}) has been received. Our team is matching properties now.`
    );

    // Automated Resend Email Confirmation
    sendEmailViaResend({
      to: newReq.tenantEmail,
      recipientName: newReq.tenantName,
      subject: 'Property Matching Request Received - Goodlucks Homes',
      type: 'rental_request',
      data: {
        locations: newReq.preferredLocations.join(', '),
        budgetMin: newReq.budgetMin,
        budgetMax: newReq.budgetMax,
        bedrooms: newReq.bedrooms,
        propertyType: newReq.propertyType,
      },
    });

    return newReq;
  };

  const updateTenantRequestStatus = (id: string, status: TenantRequest['status'], matchedPropertyIds?: string[]) => {
    setTenantRequests(prev => prev.map(r => {
      if (r.id === id) {
        const updated = { 
          ...r, 
          status, 
          matchedPropertyIds: matchedPropertyIds || r.matchedPropertyIds 
        };
        if (status === 'matched') {
          sendSimulatedEmail(
            'match_found',
            r.tenantEmail,
            r.tenantName,
            'Goodlucks Homes Matched Your Rental Request!',
            `Great news ${r.tenantName}! We found matching luxury properties for your request. View them in your Tenant Dashboard now.`
          );
        }
        return updated;
      }
      return r;
    }));
    showSuccessToast('Tenant Request Status Updated', `Request status set to ${status}.`);
  };

  const scheduleViewing = (viewingData: Omit<ViewingSchedule, 'id' | 'createdAt'>) => {
    const newViewing: ViewingSchedule = {
      ...viewingData,
      id: `view-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setViewingSchedules(prev => [newViewing, ...prev]);

    showSuccessToast(
      'Viewing Request Sent', 
      `Viewing for "${newViewing.propertyTitle}" scheduled for ${newViewing.date} at ${newViewing.time}.`
    );

    // Add notification
    const newNotif: NotificationItem = {
      id: `notif-${Date.now()}`,
      userId: currentUser?.id || 'user-tenant-1',
      title: 'Viewing Scheduled',
      message: `Your viewing for "${newViewing.propertyTitle}" is set for ${newViewing.date} at ${newViewing.time}. Fee paid physically to staff.`,
      type: 'viewing',
      read: false,
      createdAt: new Date().toISOString(),
    };
    setNotifications(prev => [newNotif, ...prev]);

    const recipientEmail = currentUser?.email || 'tenant@goodlucks.com';

    // Send Email
    sendSimulatedEmail(
      'viewing_scheduled',
      recipientEmail,
      newViewing.tenantName,
      `Viewing Scheduled: ${newViewing.propertyTitle}`,
      `Your viewing with Agent ${newViewing.assignedAgent} is confirmed for ${newViewing.date} at ${newViewing.time}. Note: Viewing fees are paid physically to Goodlucks staff.`
    );

    // Automated Resend Email Confirmation
    sendEmailViaResend({
      to: recipientEmail,
      recipientName: newViewing.tenantName,
      subject: `Viewing Schedule Confirmation: ${newViewing.propertyTitle}`,
      type: 'viewing_schedule',
      data: {
        propertyTitle: newViewing.propertyTitle,
        date: newViewing.date,
        time: newViewing.time,
        location: newViewing.propertyTitle,
      },
    });
  };

  const updateViewingStatus = (id: string, status: ViewingSchedule['status'], feePaid?: boolean, notes?: string) => {
    setViewingSchedules(prev => prev.map(v => {
      if (v.id === id) {
        return {
          ...v,
          status,
          viewingFeePaid: feePaid !== undefined ? feePaid : v.viewingFeePaid,
          outcomeNotes: notes !== undefined ? notes : v.outcomeNotes,
        };
      }
      return v;
    }));
    showSuccessToast('Viewing Status Updated', `Viewing status set to ${status.toUpperCase()}.`);
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const createAgreement = (agreementData: Omit<TenancyAgreement, 'id' | 'createdAt' | 'verificationCode'>) => {
    const code = `GHL-AGR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newAgreement: TenancyAgreement = {
      ...agreementData,
      id: `agr-${Date.now()}`,
      verificationCode: code,
      createdAt: new Date().toISOString(),
    };
    setAgreements(prev => [newAgreement, ...prev]);
    showSuccessToast('Tenancy Agreement Created', `Agreement generated with verification code ${code}`);
    return newAgreement;
  };

  const signAgreement = (id: string, role: 'landlord' | 'tenant') => {
    const now = new Date().toISOString();
    setAgreements(prev => prev.map(a => {
      if (a.id === id) {
        const updated = {
          ...a,
          landlordSigned: role === 'landlord' ? true : a.landlordSigned,
          tenantSigned: role === 'tenant' ? true : a.tenantSigned,
          landlordSignatureDate: role === 'landlord' ? now : a.landlordSignatureDate,
          tenantSignatureDate: role === 'tenant' ? now : a.tenantSignatureDate,
        };
        if (updated.landlordSigned && updated.tenantSigned) {
          updated.status = 'active';
        }
        return updated;
      }
      return a;
    }));
    showSuccessToast('Agreement Electronically Signed', `Signed as ${role === 'landlord' ? 'Landlord' : 'Tenant'}.`);
  };

  const createReceipt = (receiptData: Omit<RentReceipt, 'id' | 'createdAt' | 'receiptNo' | 'verificationCode'>) => {
    const receiptNo = `GHL-REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const verificationCode = `VERIFIED-REC-${Math.floor(1000 + Math.random() * 9000)}`;
    const newReceipt: RentReceipt = {
      ...receiptData,
      id: `rec-${Date.now()}`,
      receiptNo,
      verificationCode,
      createdAt: new Date().toISOString(),
    };
    setReceipts(prev => [newReceipt, ...prev]);
    showSuccessToast('Official Receipt Issued', `Receipt No. ${receiptNo} issued successfully.`);
    return newReceipt;
  };

  const subscribeToSearchAlerts = (subData: Omit<SearchAlertSubscription, 'id' | 'createdAt' | 'active'>) => {
    const newSubscription: SearchAlertSubscription = {
      ...subData,
      id: `alert-${Date.now()}`,
      createdAt: new Date().toISOString(),
      active: true,
    };

    setSearchAlerts(prev => [newSubscription, ...prev]);

    // Create Email Log for subscriber
    const newEmailLog: EmailLog = {
      id: `email-${Date.now()}`,
      recipientEmail: subData.email,
      recipientName: subData.name || subData.email.split('@')[0],
      subject: `🔔 Goodlucks Search Alert Active: ${subData.location || 'Accra'} Listings`,
      type: 'alert_subscription',
      bodyPreview: `Listing alert activated for ${subData.location} (${subData.propertyType}) up to GH₵ ${subData.maxRentGhs.toLocaleString()}/mo.`,
      sentAt: new Date().toISOString(),
      status: 'delivered',
    };
    setEmailLogs(prev => [newEmailLog, ...prev]);

    // Send real email via Resend / endpoint
    sendEmailViaResend({
      to: subData.email,
      recipientName: subData.name || subData.email.split('@')[0],
      subject: `🔔 Goodlucks Search Alert Active: ${subData.location || 'Accra'} Listings`,
      type: 'alert_subscription',
      data: {
        location: subData.location,
        propertyType: subData.propertyType,
        maxRentGhs: subData.maxRentGhs,
        bedrooms: subData.bedrooms,
        frequency: subData.frequency,
      },
    });

    // Push notification item
    const notifItem: NotificationItem = {
      id: `notif-${Date.now()}`,
      userId: currentUser?.id || 'guest',
      title: 'Search Alert Subscribed',
      message: `You will receive ${subData.frequency} alerts for listings in ${subData.location || 'Accra'}.`,
      type: 'success',
      read: false,
      createdAt: new Date().toISOString(),
    };
    setNotifications(prev => [notifItem, ...prev]);

    showSuccessToast(
      'Search Alert Activated!', 
      `Alerts will be sent to ${subData.email} for matching listings.`
    );

    return newSubscription;
  };

  const unsubscribeFromSearchAlerts = (id: string) => {
    setSearchAlerts(prev => prev.filter(s => s.id !== id));
    showInfoToast('Alert Subscription Removed', 'You will no longer receive alerts for this search.');
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        currentRole,
        properties,
        tenantRequests,
        viewingSchedules,
        emailLogs,
        agreements,
        receipts,
        searchAlerts,
        notifications,
        analytics,
        savedPropertyIds,
        currentView,
        selectedPropertyId,
        toasts,
        showToast,
        showSuccessToast,
        showErrorToast,
        showInfoToast,
        dismissToast,
        subscribeToSearchAlerts,
        unsubscribeFromSearchAlerts,
        setCurrentView,
        navigateToProperty,
        loginAsRole,
        logout,
        updateUserProfile,
        addProperty,
        updateProperty,
        updatePropertyStatus,
        deleteProperty,
        toggleSaveProperty,
        incrementPropertyViews,
        submitTenantRequest,
        updateTenantRequestStatus,
        scheduleViewing,
        updateViewingStatus,
        createAgreement,
        signAgreement,
        createReceipt,
        sendSimulatedEmail,
        markNotificationRead,
      }}
    >
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
