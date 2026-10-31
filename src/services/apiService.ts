/**
 * Goodlucks Homes - API client
 *
 * Every read and write in the application goes through this module. There is a
 * single source of truth for data: the server. Nothing critical is cached in
 * localStorage (only a guest's "saved properties" preference is kept locally).
 *
 * Errors are surfaced as ApiError so the UI can show real failure messages
 * instead of pretending a write succeeded.
 */

import type {
  AnalyticsStats,
  Enquiry,
  EmailLog,
  EmailOutboxSummary,
  NotificationItem,
  Property,
  PropertyStatus,
  RentReceipt,
  SearchAlertSubscription,
  TenancyAgreement,
  TenantRequest,
  User,
  ViewingSchedule,
} from '../types';

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;

  constructor(message: string, status = 0, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Raw FormData payload for uploads */
  formData?: FormData;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, formData, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;

  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw error;
    }
    throw new ApiError('Could not reach the server. Please check your connection and try again.', 0);
  }

  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data.error === 'string' && data.error) ||
      (response.status === 401
        ? 'Please sign in to continue.'
        : response.status === 403
          ? 'You do not have permission to do that.'
          : response.status === 404
            ? 'That record could not be found.'
            : response.status === 429
              ? 'Too many attempts. Please wait a moment and try again.'
              : 'Something went wrong. Please try again.');
    throw new ApiError(message, response.status, (data && data.fields) || {});
  }

  return (data ?? ({} as T)) as T;
}

// ---------------------------------------------------------------------------
// Errors -> user-facing messages
// ---------------------------------------------------------------------------
export function messageForError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function fieldErrorsFor(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}

// ---------------------------------------------------------------------------
// Types returned by the API
// ---------------------------------------------------------------------------
export interface SessionInfo {
  user: User | null;
  role: string;
  savedPropertyIds: string[];
}

export interface AdminStats extends AnalyticsStats {
  completedViewings: number;
  totalEnquiries: number;
  newEnquiries: number;
  totalTenantRequests: number;
}

export interface PropertyMatch {
  property: Property;
  score: number;
  reason: string;
  curated: boolean;
}

export interface PropertyInput {
  title: string;
  location: string;
  city: string;
  rentGhs: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  description: string;
  availability?: string;
  images: string[];
  amenities?: string[];
  nearbyPlaces?: { name: string; type: string; distance: string }[];
  featured?: boolean;
  status?: PropertyStatus;
}

export interface TenantRequestInput {
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  preferredLocations: string[];
  budgetMin: number;
  budgetMax: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  moveInDate: string;
  notes?: string;
}

export interface ViewingInput {
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  propertyId: string;
  date: string;
  time: string;
  notes?: string;
  tenantRequestId?: string;
}

export interface SearchAlertInput {
  email: string;
  name?: string;
  phone?: string;
  location: string;
  propertyType: string;
  bedrooms: number | 'All';
  maxRentGhs: number;
  searchQuery?: string;
  frequency: 'instant' | 'daily' | 'weekly';
  channels: ('email' | 'whatsapp')[];
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------
export const api = {
  health: () => request<{ status: string }>('/health'),

  trackPageView: (path: string) =>
    request<{ success: boolean }>('/track/pageview', { method: 'POST', body: { path } }).catch(() => ({
      success: false,
    })),

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  me: () => request<SessionInfo & { success: boolean }>('/auth/me'),

  login: (email: string, password: string, role?: 'tenant' | 'landlord') =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: { email, password, role } }),

  adminLogin: (email: string, password: string, accessKey: string) =>
    request<{ user: User }>('/auth/admin-login', { method: 'POST', body: { email, password, accessKey } }),

  register: (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: 'tenant' | 'landlord';
  }) => request<{ user: User }>('/auth/register', { method: 'POST', body: data }),

  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  requestPasswordReset: (email: string) =>
    request<{ success: boolean; message: string }>('/auth/password-reset/request', {
      method: 'POST',
      body: { email },
    }),

  confirmPasswordReset: (token: string, password: string) =>
    request<{ success: boolean; message: string }>('/auth/password-reset/confirm', {
      method: 'POST',
      body: { token, password },
    }),

  updateProfile: (data: Partial<User> & { password?: string }) =>
    request<{ user: User }>('/profile', { method: 'PUT', body: data }),

  // -------------------------------------------------------------------------
  // Properties
  // -------------------------------------------------------------------------
  listProperties: (params: Record<string, string | number | undefined> = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== 'All') {
        search.set(key, String(value));
      }
    });
    const query = search.toString();
    return request<{ properties: Property[]; total: number; count: number }>(
      `/properties${query ? `?${query}` : ''}`
    );
  },

  adminProperties: (params: Record<string, string | number | undefined> = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    const query = search.toString();
    return request<{ properties: Property[]; total: number }>(`/admin/properties${query ? `?${query}` : ''}`);
  },

  getProperty: (id: string) => request<{ property: Property }>(`/properties/${encodeURIComponent(id)}`),

  createProperty: (data: PropertyInput) =>
    request<{ property: Property; message: string }>('/properties', { method: 'POST', body: data }),

  updateProperty: (id: string, data: Partial<PropertyInput> & { updatedAt?: string }) =>
    request<{ property: Property }>(`/properties/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),

  deleteProperty: (id: string) =>
    request<{ success: boolean }>(`/properties/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  setPropertyStatus: (id: string, status: PropertyStatus) =>
    request<{ property: Property }>(`/properties/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: { status },
    }),

  verifyProperty: (id: string, verified: boolean) =>
    request<{ property: Property; message: string }>(`/properties/${encodeURIComponent(id)}/verify`, {
      method: 'POST',
      body: { verified },
    }),

  toggleFeatured: (id: string, featured: boolean) =>
    request<{ property: Property }>(`/properties/${encodeURIComponent(id)}/feature`, {
      method: 'POST',
      body: { featured },
    }),

  uploadImages: (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append('file', file, file.name));
    return request<{ urls: string[]; warnings?: string[] }>('/uploads', { method: 'POST', formData: form });
  },

  // -------------------------------------------------------------------------
  // Enquiries
  // -------------------------------------------------------------------------
  createEnquiry: (data: { name: string; email: string; phone?: string; message: string; propertyId?: string; source?: string }) =>
    request<{ success: boolean; message: string; enquiryId: string }>('/enquiries', { method: 'POST', body: data }),

  listEnquiries: () => request<{ enquiries: Enquiry[] }>('/admin/enquiries'),

  updateEnquiryStatus: (id: string, status: Enquiry['status']) =>
    request<{ enquiry: Enquiry; message: string }>(`/admin/enquiries/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { status },
    }),

  runAlertDigest: () =>
    request<{ success: boolean; properties: number; emails: number; message: string }>('/admin/alerts/run', {
      method: 'POST',
      body: {},
    }),

  // -------------------------------------------------------------------------
  // Tenant requests
  // -------------------------------------------------------------------------
  createTenantRequest: (data: TenantRequestInput) =>
    request<{ requestId: string; message: string }>('/tenant-requests', { method: 'POST', body: data }),

  listTenantRequests: () => request<{ requests: TenantRequest[] }>('/tenant-requests'),

  listAllTenantRequests: () => request<{ requests: TenantRequest[] }>('/admin/tenant-requests'),

  updateTenantRequest: (id: string, data: { status?: string; matchedPropertyIds?: string[] }) =>
    request<{ request: TenantRequest }>(`/tenant-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),

  // -------------------------------------------------------------------------
  // Viewings
  // -------------------------------------------------------------------------
  createViewing: (data: ViewingInput) =>
    request<{ viewingId: string; viewing: ViewingSchedule; message: string; feeAmountGhs: number }>(
      '/viewing-requests',
      { method: 'POST', body: data }
    ),

  listViewings: () => request<{ viewings: ViewingSchedule[] }>('/viewings'),

  listAllViewings: () => request<{ viewings: ViewingSchedule[] }>('/admin/viewings'),

  updateViewing: (id: string, data: { status?: string; viewingFeePaid?: boolean; outcomeNotes?: string }) =>
    request<{ viewing: ViewingSchedule }>(`/viewings/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),

  // -------------------------------------------------------------------------
  // Alerts
  // -------------------------------------------------------------------------
  createPriceAlert: (data: {
    email: string;
    propertyId: string;
    name?: string;
    targetRentGhs?: number;
    notifyOnAnyDrop?: boolean;
  }) => request<{ alertId: string; message: string }>('/price-alerts', { method: 'POST', body: data }),

  createSearchAlert: (data: SearchAlertInput) =>
    request<{ alert: SearchAlertSubscription }>('/search-alerts', { method: 'POST', body: data }),

  listSearchAlerts: () => request<{ alerts: SearchAlertSubscription[] }>('/search-alerts'),

  deleteSearchAlert: (id: string) =>
    request<{ success: boolean }>(`/search-alerts/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // -------------------------------------------------------------------------
  // Saved properties
  // -------------------------------------------------------------------------
  listSaved: () => request<{ propertyIds: string[] }>('/saved-properties'),

  saveProperty: (propertyId: string) =>
    request<{ propertyIds: string[] }>('/saved-properties', { method: 'POST', body: { propertyId } }),

  unsaveProperty: (propertyId: string) =>
    request<{ propertyIds: string[] }>(`/saved-properties/${encodeURIComponent(propertyId)}`, {
      method: 'DELETE',
    }),

  // -------------------------------------------------------------------------
  // Agreements & receipts
  // -------------------------------------------------------------------------
  listAgreements: () => request<{ agreements: TenancyAgreement[] }>('/agreements'),

  /**
   * Single agreement, including identity numbers. Staff reads are audited
   * server-side, so this is only fetched when a staff member opens a document
   * that the list response returned with masked identity fields.
   */
  getAgreement: (id: string) =>
    request<{ agreement: TenancyAgreement }>(`/agreements/${encodeURIComponent(id)}`),

  createAgreement: (data: Record<string, unknown>) =>
    request<{ agreement: TenancyAgreement }>('/agreements', { method: 'POST', body: data }),

  signAgreement: (id: string, role: 'landlord' | 'tenant') =>
    request<{ agreement: TenancyAgreement }>(`/agreements/${encodeURIComponent(id)}/sign`, {
      method: 'POST',
      body: { role },
    }),

  emailAgreement: (id: string) =>
    request<{ success: boolean; message: string }>(`/agreements/${encodeURIComponent(id)}/email`, {
      method: 'POST',
      body: {},
    }),

  listReceipts: () => request<{ receipts: RentReceipt[] }>('/receipts'),

  createReceipt: (data: Record<string, unknown>) =>
    request<{ receipt: RentReceipt }>('/receipts', { method: 'POST', body: data }),

  // -------------------------------------------------------------------------
  // Notifications & admin
  // -------------------------------------------------------------------------
  listNotifications: () => request<{ notifications: NotificationItem[] }>('/notifications'),

  markNotificationRead: (id: string) =>
    request<{ success: boolean }>(`/notifications/${encodeURIComponent(id)}`, { method: 'PATCH', body: {} }),

  markAllNotificationsRead: () =>
    request<{ success: boolean; updated: number; notifications: NotificationItem[] }>('/notifications/read-all', {
      method: 'POST',
      body: {},
    }),

  adminStats: () => request<{ stats: AdminStats }>('/admin/stats'),

  adminEmailLogs: () =>
    request<{ logs: EmailLog[]; outbox: EmailOutboxSummary }>('/admin/email-logs'),

  // Delivers queued mail now instead of waiting for cron.php.
  runEmailOutbox: () =>
    request<{
      success: boolean;
      result: { checked: number; sent: number; retried: number; failed: number; skipped: number };
      outbox: EmailOutboxSummary;
      message: string;
    }>('/admin/emails/run', { method: 'POST', body: {} }),

  // -------------------------------------------------------------------------
  // AI helpers
  // -------------------------------------------------------------------------
  aiDescribe: (data: {
    title: string;
    location: string;
    propertyType: string;
    bedrooms: number;
    rentGhs: number;
    amenities: string[];
  }) => request<{ description: string; ai: boolean }>('/ai/describe', { method: 'POST', body: data }),

  // Scored shortlist from the backend (same engine as /ai/match).
  matches: (requestId?: string) =>
    request<{ success: boolean; requestId: string | null; topScore?: number; matches: PropertyMatch[] }>(
      requestId ? `/matches?requestId=${encodeURIComponent(requestId)}` : '/matches'
    ),

  aiMatch: (tenantRequest: Partial<TenantRequest>, property: Partial<Property>) =>
    request<{ matchScore: number; aiMatchReason: string }>('/ai/match', {
      method: 'POST',
      body: { tenantRequest, property },
    }),
};

export default api;
