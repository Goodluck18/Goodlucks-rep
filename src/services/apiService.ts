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
  AdminAgentAccount,
  AgentProfile,
  AgentTierState,
  FeePolicy,
  FeePolicyEvent,
  FeePolicyInput,
  FeePolicyOverview,
  FeePolicySnapshot,
  IdentityVerification,
  ProfessionalAuthorisation,
  VerificationDecisionEntry,
  VerificationDocument,
  VerificationQueueItem,
  VerificationReviewerDetail,
  VerificationSummary,
  AnalyticsStats,
  Enquiry,
  EmailLog,
  EmailOutboxSummary,
  NotificationItem,
  Property,
  PropertyStatus,
  PropertyViewingTerms,
  ViewingTermsChange,
  ViewingTermsValues,
  RentReceipt,
  SearchAlertSubscription,
  FeePolicyStatus,
  TenantRequest,
  User,
  ViewingFeeRecord,
  ViewingFeeSummary,
  AgentFinanceOverview,
  RemittanceSubmission,
  RentalCommission,
  FinancialAdjustment,
  FinanceReconciliationSummary,
  RentalCommissionStatus,
  LandlordPolicy,
  LandlordFeeSummary,
  ViewingAction,
  ViewingDetail,
  ViewingHistoryEvent,
  ViewingSchedule,
  ViewingCounts,
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
  /**
   * Agent submissions only (Increment F): who the agent says the landlord is.
   * The server resolves the reference without telling the caller whether an
   * account matched, and the agent never becomes the owner.
   */
  landlordName?: string;
  landlordEmail?: string;
  landlordPhone?: string;
  landlordId?: string;
  /**
   * Task 03: the property's own viewing fee and viewing terms. Required for an
   * agent submission — the server refuses a listing without them and there is no
   * platform-wide default. A landlord listing may include them.
   */
  viewingFeeGhs?: number;
  viewingTerms?: ViewingTermsValues;
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
  /** The tenant's *preferred* slot. The agent may propose another one. */
  date: string;
  time: string;
  /** 'viewing' (default) or a plain 'enquiry' about the property. */
  requestType?: 'viewing' | 'enquiry';
  message?: string;
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

  login: (email: string, password: string, role?: 'tenant' | 'landlord' | 'agent') =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: { email, password, role } }),

  adminLogin: (email: string, password: string, accessKey: string) =>
    request<{ user: User }>('/auth/admin-login', { method: 'POST', body: { email, password, accessKey } }),

  register: (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: 'tenant' | 'landlord' | 'agent';
    /** Optional city/town. Contact information only — never identity data. */
    city?: string;
    /** Agent only: agency/business name, if there is one (Increment C). */
    agencyName?: string;
    /** Agent only: the city the agent works from, not a home address. */
    operatingCity?: string;
    /** Task 03: Tenant, or Landlord / Agent. Must agree with `role`. */
    providerCategory?: 'tenant' | 'landlord' | 'agent';
    /** Task 03: the official name on the Ghana Card (a claim, not a check). */
    officialName?: string;
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
  // Account settings (password change, profile picture)
  //
  // Both act on the signed-in account only: the session decides whose record is
  // touched, never a field in the request.
  // -------------------------------------------------------------------------
  changePassword: (data: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
    request<{ success: boolean; message: string }>('/account/password', { method: 'POST', body: data }),

  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return request<{ avatar: string; user: User }>('/account/avatar', { method: 'POST', formData: form });
  },

  removeAvatar: () => request<{ user: User }>('/account/avatar', { method: 'DELETE' }),

  // -------------------------------------------------------------------------
  // Agent account (Increment C)
  // -------------------------------------------------------------------------
  /** The signed-in agent's own profile. Status fields are read-only here. */
  getAgentProfile: () =>
    request<{ profile: AgentProfile }>('/agent/profile'),

  updateAgentProfile: (data: { agencyName?: string; operatingCity?: string }) =>
    request<{ profile: AgentProfile }>('/agent/profile', { method: 'PATCH', body: data }),

  // -------------------------------------------------------------------------
  // Verification & private documents (Increment D)
  // -------------------------------------------------------------------------
  /** The signed-in agent's or landlord's own verification state. */
  getVerification: () => request<{ verification: VerificationSummary }>('/verification'),

  /** Upload one private document; returns metadata only, never a public URL. */
  uploadVerificationDocument: (file: File, kind: string, scope?: string) => {
    const form = new FormData();
    form.append('kind', kind);
    if (scope) form.append('scope', scope);
    form.append('file', file);
    return request<{ document: VerificationDocument }>('/verification/documents', {
      method: 'POST',
      formData: form,
    });
  },

  submitIdentityVerification: (data: {
    legalName: string;
    documentType: string;
    documentNumber: string;
    documentIds: string[];
  }) => request<{ identity: IdentityVerification }>('/verification/identity', { method: 'POST', body: data }),

  submitProfessionalAuthorisation: (data: {
    licenceNumber: string;
    issuingAuthority: string;
    licenceCategory?: string;
    issueDate?: string;
    expiryDate?: string;
    documentIds: string[];
  }) =>
    request<{ professional: ProfessionalAuthorisation }>('/verification/professional', {
      method: 'POST',
      body: data,
    }),

  deleteVerificationDocument: (id: string) =>
    request<{ success: boolean }>(`/verification-documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /**
   * Task 03: record one document's outcome (accept / reject). Requires the
   * reviewer capability; it does not change the overall verification status.
   */
  reviewVerificationDocument: (id: string, decision: 'accept' | 'reject' | 'pending', note = '') =>
    request<{ success: boolean; document: VerificationDocument }>(
      `/admin/verifications/documents/${encodeURIComponent(id)}/review`,
      { method: 'POST', body: { decision, note } }
    ),

  // --- Staff: verification review (Increment D; capability-gated) -----------
  listVerifications: (params: { status?: string; scope?: string } = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    const query = search.toString();
    return request<{ verifications: VerificationQueueItem[]; count: number }>(
      `/admin/verifications${query ? `?${query}` : ''}`
    );
  },

  getVerificationDetail: (userId: string) =>
    request<{ verification: VerificationReviewerDetail }>(
      `/admin/verifications/${encodeURIComponent(userId)}`
    ),

  decideIdentityVerification: (
    userId: string,
    data: { decision: 'start_review' | 'approve' | 'reject' | 'request_resubmission'; note?: string }
  ) =>
    request<{ identity: IdentityVerification; history: VerificationDecisionEntry[] }>(
      `/admin/verifications/${encodeURIComponent(userId)}/identity/decision`,
      { method: 'POST', body: data }
    ),

  decideProfessionalAuthorisation: (
    userId: string,
    data: {
      decision: 'start_review' | 'approve' | 'reject' | 'request_resubmission' | 'mark_expired';
      note?: string;
    }
  ) =>
    request<{ professional: ProfessionalAuthorisation; history: VerificationDecisionEntry[] }>(
      `/admin/verifications/${encodeURIComponent(userId)}/professional/decision`,
      { method: 'POST', body: data }
    ),

  // --- Staff: agent account review (Increment C) -----------------------------
  listAgents: () => request<{ agents: AdminAgentAccount[]; count: number }>('/admin/agents'),

  /**
   * Approve, suspend or return an agent account to review. `canSubmitListings`
   * is only honoured for an active account.
   */
  setAgentStatus: (
    userId: string,
    data: { accountStatus: 'pending_review' | 'active' | 'suspended'; canSubmitListings?: boolean; note?: string }
  ) =>
    request<{ profile: AgentProfile }>(`/admin/agents/${encodeURIComponent(userId)}/status`, {
      method: 'POST',
      body: data,
    }),

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

  /**
   * Task 03: propose a viewing fee / viewing terms change. Staff decide; the
   * approved fee keeps applying until they do.
   */
  requestViewingTerms: (id: string, data: { viewingFeeGhs: number; viewingTerms: ViewingTermsValues; note?: string }) =>
    request<{ success: boolean; message: string; viewingTermsChange: ViewingTermsChange; property: Property | null }>(
      `/properties/${encodeURIComponent(id)}/viewing-terms`,
      { method: 'POST', body: data }
    ),
  viewingTermsHistory: (id: string) =>
    request<{
      success: boolean;
      propertyId: string;
      current: PropertyViewingTerms;
      changes: ViewingTermsChange[];
    }>(`/properties/${encodeURIComponent(id)}/viewing-terms/history`),
  /** Staff: the viewing fee / terms change queue. */
  adminViewingTermChanges: (status: 'pending_review' | 'approved' | 'rejected' | '' = 'pending_review') =>
    request<{ success: boolean; changes: ViewingTermsChange[]; count: number }>(
      `/admin/viewing-terms/changes${status ? `?status=${status}` : ''}`
    ),
  adminDecideViewingTermChange: (id: string, decision: 'approve' | 'reject', note = '') =>
    request<{
      success: boolean;
      message: string;
      viewingTermsChange: ViewingTermsChange;
      property: Property | null;
    }>(`/admin/viewing-terms/changes/${encodeURIComponent(id)}/decision`, {
      method: 'POST',
      body: { decision, note },
    }),

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
  /**
   * A viewing REQUEST. It is not an appointment: the agent has to propose a
   * time and somebody has to agree to it (Increment F).
   */
  createViewing: (data: ViewingInput) =>
    request<{
      viewingId: string;
      viewing: ViewingSchedule;
      message: string;
      feeAmountGhs: number;
      awaitingAgent: boolean;
      duplicate?: boolean;
    }>('/viewings', { method: 'POST', body: data }),

  listViewings: () => request<{ viewings: ViewingSchedule[] }>('/viewings'),

  listAllViewings: (params: { status?: string; propertyId?: string; agentUserId?: string; tenantUserId?: string } = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    const query = search.toString();
    return request<{
      viewings: ViewingSchedule[];
      counts?: ViewingCounts;
      capabilities?: { viewingCorrections: boolean };
    }>(`/admin/viewings${query ? `?${query}` : ''}`);
  },

  getViewing: (id: string) => request<ViewingDetail>(`/viewings/${encodeURIComponent(id)}`),

  getAdminViewing: (id: string) =>
    request<ViewingDetail & { landlordUserId: string }>(`/admin/viewings/${encodeURIComponent(id)}`),

  /** One endpoint per lifecycle action; each is validated on the server. */
  viewingAction: (
    id: string,
    action: ViewingAction | 'reschedule' | 'request-reschedule' | 'no-show' | 'could-not-proceed',
    body: { date?: string; time?: string; note?: string; reason?: string; who?: 'tenant' | 'agent' } = {}
  ) =>
    request<{ viewing: ViewingSchedule; message: string }>(
      `/viewings/${encodeURIComponent(id)}/${action}`,
      { method: 'POST', body }
    ),

  correctViewing: (id: string, data: { status: ViewingSchedule['status']; reason: string }) =>
    request<{ viewing: ViewingSchedule; message: string }>(
      `/admin/viewings/${encodeURIComponent(id)}/correction`,
      { method: 'POST', body: data }
    ),

  assignViewingAgent: (id: string, agentUserId: string) =>
    request<{ viewing: ViewingSchedule; message: string }>(
      `/admin/viewings/${encodeURIComponent(id)}/assign-agent`,
      { method: 'POST', body: { agentUserId } }
    ),

  /** Legacy back-office update. Kept for the fee checkbox; lifecycle changes use the actions above. */
  updateViewing: (id: string, data: { status?: string; viewingFeePaid?: boolean; outcomeNotes?: string; note?: string }) =>
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
  // Rent payment records
  // -------------------------------------------------------------------------
  /**
   * Rent payment records. `issuingEnabled` is false while the server has
   * receipt issuing switched off (the truthful payment model ships later).
   */
  listReceipts: () =>
    request<{ receipts: RentReceipt[]; issuingEnabled?: boolean }>('/receipts'),

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

  // -------------------------------------------------------------------------
  // Viewing-fee ledger (Increment B)
  // Agent-collected money, the share owed to Goodlucks, and remittances that
  // Goodlucks has actually received. No percentage is ever applied here.
  // -------------------------------------------------------------------------
  listViewingFees: () =>
    request<{
      records: ViewingFeeRecord[];
      summary: ViewingFeeSummary;
      policy: FeePolicyStatus;
    }>('/admin/viewing-fees'),

  feePolicy: () => request<{ policy: FeePolicyStatus }>('/admin/viewing-fees/policy'),

  setViewingFeeShare: (id: string, data: { amountGhs: number; note?: string }) =>
    request<{ record: ViewingFeeRecord }>(
      `/admin/viewing-fees/${encodeURIComponent(id)}/share`,
      { method: 'POST', body: data }
    ),

  addFeeRemittance: (
    id: string,
    data: { amountGhs: number; method?: string; reference?: string; receivedAt?: string; notes?: string }
  ) =>
    request<{ record: ViewingFeeRecord; remittanceId: string }>(
      `/admin/viewing-fees/${encodeURIComponent(id)}/remittances`,
      { method: 'POST', body: data }
    ),

  setViewingFeeState: (id: string, data: { state: ViewingFeeRecord['collectionState']; note?: string }) =>
    request<{ record: ViewingFeeRecord }>(
      `/admin/viewing-fees/${encodeURIComponent(id)}/state`,
      { method: 'POST', body: data }
    ),

  // ---------------------------------------------------------------------------
  // Agent remittances, reconciliation & rental commissions (Increment G)
  //
  // An agent submits a claim; only a staff member holding `financeConfirm` can
  // turn it into a recorded receipt. Every call below is re-checked on the
  // server, so hiding a button is never the security boundary.
  // ---------------------------------------------------------------------------
  agentFinance: () => request<{ finance: AgentFinanceOverview }>('/agent/finance'),

  submitRemittance: (data: {
    amountGhs: number;
    method: string;
    paidAt: string;
    paymentReference?: string;
    evidenceReference?: string;
    note?: string;
    allocations?: { viewingFeeRecordId: string; amountGhs: number }[];
  }) =>
    request<{ remittance: RemittanceSubmission; message: string }>('/agent/remittances', {
      method: 'POST',
      body: data,
    }),

  agentRemittance: (id: string) =>
    request<{ remittance: RemittanceSubmission }>(`/agent/remittances/${encodeURIComponent(id)}`),

  financeSummary: () =>
    request<{
      summary: FinanceReconciliationSummary;
      policy: FeePolicyStatus;
      capabilities: { financeView: boolean; financeConfirm: boolean };
    }>('/admin/finance/summary'),

  listRemittances: (params: { status?: string; agentUserId?: string; from?: string; to?: string } = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    const query = search.toString();
    return request<{
      remittances: RemittanceSubmission[];
      capabilities: { financeView: boolean; financeConfirm: boolean };
    }>(`/admin/finance/remittances${query ? `?${query}` : ''}`);
  },

  remittance: (id: string) =>
    request<{ remittance: RemittanceSubmission }>(`/admin/finance/remittances/${encodeURIComponent(id)}`),

  confirmRemittance: (
    id: string,
    data: { allocations: { viewingFeeRecordId: string; amountGhs: number }[]; note?: string }
  ) =>
    request<{ remittance: RemittanceSubmission; message: string }>(
      `/admin/finance/remittances/${encodeURIComponent(id)}/confirm`,
      { method: 'POST', body: data }
    ),

  decideRemittance: (id: string, data: { status: 'rejected' | 'disputed'; reason: string }) =>
    request<{ remittance: RemittanceSubmission }>(
      `/admin/finance/remittances/${encodeURIComponent(id)}/decision`,
      { method: 'POST', body: data }
    ),

  reverseReceipt: (receiptId: string, data: { amountGhs: number; reason: string; supportReference?: string }) =>
    request<{ adjustment: FinancialAdjustment }>(
      `/admin/finance/receipts/${encodeURIComponent(receiptId)}/reverse`,
      { method: 'POST', body: data }
    ),

  adminAgentFinance: (agentUserId: string) =>
    request<{
      agent: {
        agentUserId: string;
        name: string;
        email: string;
        accountStatus: string;
        totals: AgentFinanceOverview['totals'];
        recentSubmissions: RemittanceSubmission[];
        feeRecords: ViewingFeeRecord[];
        commissions: RentalCommission[];
      };
    }>(`/admin/finance/agents/${encodeURIComponent(agentUserId)}`),

  listFinancialAdjustments: (params: { subjectType?: string; subjectId?: string } = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    const query = search.toString();
    return request<{ adjustments: FinancialAdjustment[] }>(
      `/admin/finance/adjustments${query ? `?${query}` : ''}`
    );
  },

  listCommissions: (params: { status?: string; agentUserId?: string; propertyId?: string } = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    const query = search.toString();
    return request<{
      commissions: RentalCommission[];
      statuses: RentalCommissionStatus[];
      capabilities: { financeView: boolean; financeConfirm: boolean };
    }>(`/admin/finance/commissions${query ? `?${query}` : ''}`);
  },

  createCommission: (data: {
    propertyId: string;
    amountGhs?: number;
    agentUserId?: string;
    tenantUserId?: string;
    tenantName?: string;
    rentalReference?: string;
    dueDate?: string;
    basis?: 'manual_agreement' | 'policy_snapshot';
    policyId?: string;
    notes?: string;
  }) => request<{ commission: RentalCommission }>('/admin/finance/commissions', { method: 'POST', body: data }),

  commission: (id: string) =>
    request<{ commission: RentalCommission }>(`/admin/finance/commissions/${encodeURIComponent(id)}`),

  updateCommission: (
    id: string,
    data: {
      amountGhs?: number;
      dueDate?: string | null;
      rentalReference?: string;
      tenantName?: string;
      notes?: string;
    }
  ) =>
    request<{ commission: RentalCommission }>(`/admin/finance/commissions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: data,
    }),

  setCommissionStatus: (id: string, data: { status: RentalCommissionStatus; reason?: string }) =>
    request<{ commission: RentalCommission }>(
      `/admin/finance/commissions/${encodeURIComponent(id)}/status`,
      { method: 'POST', body: data }
    ),

  addCommissionPayment: (
    id: string,
    data: { amountGhs: number; receivedAt: string; method?: string; reference?: string; notes?: string }
  ) =>
    request<{ commission: RentalCommission }>(
      `/admin/finance/commissions/${encodeURIComponent(id)}/payments`,
      { method: 'POST', body: data }
    ),

  adjustCommission: (
    id: string,
    data: { kind: 'reversal' | 'correction'; amountGhs: number; reason: string; supportReference?: string }
  ) =>
    request<{ adjustment: FinancialAdjustment }>(
      `/admin/finance/commissions/${encodeURIComponent(id)}/adjustments`,
      { method: 'POST', body: data }
    ),

  // ---------------------------------------------------------------------------
  // Landlord fee policy (Task 03 update)
  //
  // One general viewing fee, set by an administrator, plus the 8% platform fee
  // on rent actually paid for landlord-submitted listings. Landlords receive
  // neither, and no agent tier is ever applied to either.
  // ---------------------------------------------------------------------------
  landlordPolicy: () => request<{ policy: LandlordPolicy }>('/admin/landlord-policy'),

  setLandlordViewingFee: (amountGhs: number | string) =>
    request<{ policy: LandlordPolicy; message: string; listingsUpdated: number }>(
      '/admin/landlord-policy/viewing-fee',
      { method: 'PUT', body: { amountGhs } }
    ),

  landlordPlatformFees: () =>
    request<{
      fees: RentalCommission[];
      summary: LandlordFeeSummary;
      policy: LandlordPolicy['platformFee'];
    }>('/admin/finance/landlord-platform-fees'),

  createLandlordPlatformFee: (data: {
    propertyId: string;
    rentAmountGhs: number;
    rentPaymentReference: string;
    tenantName?: string;
    dueDate?: string;
    notes?: string;
  }) =>
    request<{ fee: RentalCommission; message: string }>('/admin/finance/landlord-platform-fees', {
      method: 'POST',
      body: data,
    }),

  landlordViewingFees: () =>
    request<{
      records: ViewingFeeRecord[];
      summary: LandlordFeeSummary;
      policy: LandlordPolicy['viewingFee'];
    }>('/admin/finance/landlord-viewing-fees'),

  recordLandlordViewingFee: (data: {
    viewingId: string;
    method?: string;
    reference?: string;
    receivedAt?: string;
    notes?: string;
  }) =>
    request<{ record: ViewingFeeRecord; message: string }>('/admin/finance/landlord-viewing-fees', {
      method: 'POST',
      body: data,
    }),

  // ---------------------------------------------------------------------------
  // Fee policies & agent tiers (Increment E)
  //
  // Listing and reading need either financial capability; creating/editing
  // needs the manager capability and approving/activating the approver one. The
  // server enforces that — the UI only hides what an account cannot use.
  // ---------------------------------------------------------------------------
  listFeePolicies: (params: { status?: string; category?: string; agentTier?: string } = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    const query = search.toString();
    return request<FeePolicyOverview>(`/admin/fee-policies${query ? `?${query}` : ''}`);
  },

  getFeePolicy: (id: string) =>
    request<{ policy: FeePolicy; history: FeePolicyEvent[] }>(
      `/admin/fee-policies/${encodeURIComponent(id)}`
    ),

  createFeePolicy: (data: FeePolicyInput) =>
    request<{ policy: FeePolicy }>('/admin/fee-policies', { method: 'POST', body: data }),

  updateFeePolicy: (id: string, data: FeePolicyInput) =>
    request<{ policy: FeePolicy }>(`/admin/fee-policies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: data,
    }),

  submitFeePolicy: (id: string, note?: string) =>
    request<{ policy: FeePolicy }>(`/admin/fee-policies/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: { note },
    }),

  approveFeePolicy: (id: string, note: string) =>
    request<{ policy: FeePolicy }>(`/admin/fee-policies/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: { note },
    }),

  rejectFeePolicy: (id: string, reason: string) =>
    request<{ policy: FeePolicy }>(`/admin/fee-policies/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: { reason },
    }),

  activateFeePolicy: (id: string, note?: string) =>
    request<{ policy: FeePolicy }>(`/admin/fee-policies/${encodeURIComponent(id)}/activate`, {
      method: 'POST',
      body: { note },
    }),

  deactivateFeePolicy: (id: string, reason: string) =>
    request<{ policy: FeePolicy }>(`/admin/fee-policies/${encodeURIComponent(id)}/deactivate`, {
      method: 'POST',
      body: { reason },
    }),

  getAgentTier: (userId: string) =>
    request<{ agent: { userId: string; name: string; email: string }; tier: AgentTierState }>(
      `/admin/agents/${encodeURIComponent(userId)}/tier`
    ),

  linkViewingFeeAgent: (id: string, agentUserId: string) =>
    request<{ record: ViewingFeeRecord; agentTier?: AgentTierState }>(
      `/admin/viewing-fees/${encodeURIComponent(id)}/agent`,
      { method: 'POST', body: { agentUserId } }
    ),

  applyFeePolicy: (id: string, policyId?: string) =>
    request<{ record: ViewingFeeRecord; snapshot: FeePolicySnapshot; agentTier: AgentTierState }>(
      `/admin/viewing-fees/${encodeURIComponent(id)}/apply-policy`,
      { method: 'POST', body: policyId ? { policyId } : {} }
    ),

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
