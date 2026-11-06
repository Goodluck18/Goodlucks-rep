export type UserRole = 'tenant' | 'landlord' | 'agent' | 'admin' | 'guest';

export type AgentAccountStatus = 'pending_review' | 'active' | 'suspended';

/**
 * An agent's own account profile (Increment C).
 *
 * `accountStatus` is an internal review state, and `identityVerified` /
 * `professionalAuthorisationVerified` are false for every agent in this release:
 * no identity document, licence or regulatory check has been performed. Never
 * render them as a badge without a real check behind them.
 */
export interface AgentProfile {
  id: string;
  userId: string;
  agencyName: string;
  /** The city the agent works from — not a home address and not coverage. */
  operatingCity: string;
  accountStatus: AgentAccountStatus;
  canSubmitListings: boolean;
  statusNote?: string;
  reviewedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  identityVerified: boolean;
  professionalAuthorisationVerified: boolean;
  /** Derived from the verification records (Increment E); never client-set. */
  agentTier?: AgentTier;
  agentTierLabel?: string;
  tierEligibility?: {
    eligibleStandard: boolean;
    eligibleProfessional: boolean;
    identityStatus: string;
    professionalStatus: string;
  };
  serviceAreas: string[];
}

/**
 * Staff view of an agent account (Increment C). Adds the contact details the
 * review queue needs to the agent's own profile shape. `contactAddress` is the
 * agent's own address and is deliberately separate from `operatingCity`.
 */
export interface AdminAgentAccount extends AgentProfile {
  name: string;
  email: string;
  phone: string;
  contactAddress: string;
  registeredAt?: string | null;
}

// ---------------------------------------------------------------------------
// Verification (Increment D)
// ---------------------------------------------------------------------------

export type IdentityVerificationStatus =
  | 'not_submitted'
  | 'pending_review'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'resubmission_required';

export type ProfessionalAuthorisationStatus = IdentityVerificationStatus | 'expired';

export type VerificationDocumentScope = 'identity' | 'professional';

/** Metadata for a private document. Contents are only ever streamed by the API. */
export interface VerificationDocument {
  id: string;
  scope: VerificationDocumentScope;
  kind: string;
  kindLabel: string;
  mimeType: string;
  bytes: number;
  uploadedAt: string;
  /** Present only when the caller may actually download the file. */
  downloadUrl: string | null;
  /**
   * Task 03: the reviewer's outcome for this document. It is recorded per
   * document and never changes the verification status on its own.
   */
  reviewStatus?: 'pending' | 'accepted' | 'rejected' | string;
  reviewNote?: string;
  reviewedAt?: string | null;
}

/**
 * Identity verification. `documentNumber` is only populated for a reviewer
 * holding the identity-document capability; everyone else sees the masked value.
 * Nothing here establishes property ownership.
 */
export interface IdentityVerification {
  scope: 'identity';
  status: IdentityVerificationStatus;
  legalName: string;
  documentType: string;
  documentTypeLabel: string;
  documentNumberMasked: string;
  documentNumber: string | null;
  /** Whether the server still holds the full number (encrypted) at all. */
  numberRetained: boolean;
  submittedAt: string;
  reviewedAt: string;
  decisionNote: string;
  retentionPurgeAfter: string;
  userId: string;
  /** Always false: identity is not ownership or authority. */
  establishesOwnership: boolean;
  documents: VerificationDocument[];
}

/**
 * Professional authorisation. Separate from identity on purpose: an agent can be
 * identity-verified without being authorised to practise.
 */
export interface ProfessionalAuthorisation {
  scope: 'professional';
  status: ProfessionalAuthorisationStatus;
  storedStatus: string;
  expired: boolean;
  licenceNumber: string | null;
  licenceNumberMasked: string;
  issuingAuthority: string;
  licenceCategory: string;
  issueDate: string;
  expiryDate: string;
  submittedAt: string;
  reviewedAt: string;
  decisionNote: string;
  /** Always false in this release: no external registry is consulted. */
  registryChecked: boolean;
  establishesLegalAuthorisation: boolean;
  userId: string;
  documents: VerificationDocument[];
}

export interface VerificationSummary {
  identity: IdentityVerification;
  professional: ProfessionalAuthorisation | null;
  identityVerified: boolean;
  professionallyAuthorised: boolean;
  /** Agents only (Increment E). Derived from the two decisions above — not a setting. */
  agentTier?: AgentTierState | null;
  /** Task 03: the Ghana Card name given at registration (a claim, not a check). */
  officialName?: string;
  role?: string;
  encryptionActive: boolean;
  retentionDays: number;
  documentTypes: Array<{ value: string; label: string }>;
  documentKinds: Array<{ value: string; label: string }>;
}

export interface VerificationDecisionEntry {
  id: string;
  scope: VerificationDocumentScope;
  decision: string;
  fromStatus: string;
  toStatus: string;
  note: string;
  reviewerName: string;
  decidedAt: string;
}

export interface VerificationQueueItem {
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  agencyName: string;
  operatingCity: string;
  agentAccountStatus: string;
  identity: {
    status: IdentityVerificationStatus;
    submittedAt: string;
    reviewedAt: string;
    documentCount: number;
  };
  professional: {
    status: ProfessionalAuthorisationStatus;
    expiryDate: string;
    submittedAt: string;
    reviewedAt: string;
    documentCount: number;
  };
}

export interface VerificationReviewerDetail {
  subject: {
    userId: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    createdAt: string;
  };
  identity: IdentityVerification;
  professional: ProfessionalAuthorisation;
  history: VerificationDecisionEntry[];
  notes: {
    identityEstablishesOwnership: boolean;
    identityImpliesLicence: boolean;
    registryIntegration: boolean;
  };
  capabilities: { identityDocumentAccess: boolean };
}

/** Staff capabilities. All default to false; granted only from the server console. */
export interface StaffCapabilities {
  verificationReviewer: boolean;
  identityDocumentAccess: boolean;
  /** Create/edit/submit fee policies (Increment E). */
  feePolicyManage?: boolean;
  /** Approve/reject/activate/deactivate fee policies (Increment E). */
  feePolicyApprove?: boolean;
  /** Correct a closed viewing record with an audited reason (Increment F). */
  viewingCorrections?: boolean;
  /** Read the money ledger, remittances and commissions (Increment G). */
  financeView?: boolean;
  /**
   * Confirm that money actually arrived, allocate it, reject/return it, reverse
   * it and run the rental-commission workflow (Increment G). Deliberately NOT
   * implied by `financeView`: reading money is not the power to move it.
   */
  financeConfirm?: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string;
  avatar: string;
  address?: string;
  bio?: string;
  company?: string;
  /** Internal flag only: NOT an identity or authorisation check (Increment B). */
  isVerified?: boolean;
  preferredLocations?: string[];
  budgetMin?: number;
  budgetMax?: number;
  preferredBedrooms?: number;
  additionalNotes?: string;
  createdAt: string;
  /** Present only on agent accounts (Increment C). */
  agentProfile?: AgentProfile | null;
  /** Present only on administrator accounts (Increment D). */
  capabilities?: StaffCapabilities;
}

export type PropertyStatus = 'active' | 'pending' | 'rejected' | 'rented' | 'deactivated';

export type PropertyType = 
  | 'Apartment' 
  | 'Luxury Villa' 
  | 'Townhouse' 
  | 'Studio' 
  | 'Duplex' 
  | 'Penthouse' 
  | 'Commercial';

export interface NearbyPlace {
  name: string;
  type: string;
  distance: string;
}

export interface LandlordVerificationInfo {
  isVerified: boolean;
  landlordName?: string;
  landlordCompany?: string;
  landlordAvatar?: string;
  landlordPhone?: string;
  verificationLevel?: 'verified' | 'gold' | 'institutional';
  ghanaCardVerified?: boolean;
  titleDeedVerified?: boolean;
  physicalInspected?: boolean;
  verifiedSince?: string;
  responseRate?: string;
}

export interface Property {
  id: string;
  /**
   * Empty unless the caller is the landlord themselves or an administrator.
   * Increment F stopped returning landlord account ids to the public catalogue
   * and to agents, so this cannot be used to enumerate landlord accounts.
   */
  landlordId: string;
  /** Staff-only: the landlord contact an agent claimed when none matched. */
  landlordContactClaimed?: string;
  isLandlordVerified?: boolean;
  /**
   * Who submitted the listing (Increment C). For an agent submission the owner
   * is still `landlordId`; the agent is only the submitter.
   */
  submittedByUserId?: string;
  submittedByRole?: UserRole | string;
  /**
   * `owner` = the listing came from the owner's own account,
   * `claimed_by_agent` = an agent declared they act for the owner (unverified),
   * `recorded_by_staff` = staff entered it,
   * `not_applicable` = legacy row.
   */
  landlordAuthorityState?: 'owner' | 'claimed_by_agent' | 'recorded_by_staff' | 'not_applicable' | string;
  landlordName?: string;
  landlordCompany?: string;
  landlordVerificationDetails?: LandlordVerificationInfo;
  title: string;
  location: string;
  city: string;
  rentGhs: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: PropertyType;
  status: PropertyStatus;
  images: string[];
  description: string;
  amenities: string[];
  nearbyPlaces: NearbyPlace[];
  availability: string;
  featured?: boolean;
  viewsCount: number;
  enquiriesCount: number;
  /**
   * Task 03: this property's own viewing fee and viewing terms.
   * `feeGhs`/`terms` are the APPROVED values and are the only ones the public
   * sees. `state`/`pendingChange` are returned only to the owner, the submitting
   * agent and staff.
   */
  viewingTerms?: PropertyViewingTerms;
  createdAt: string;
  updatedAt: string;
}

/** The structured viewing terms an agent sets per property (Task 03). */
export interface ViewingTermsValues {
  appointmentRequired: boolean;
  howToArrange: string;
  conditions?: string;
  paymentInstructions: string;
  restrictions?: string;
}

export interface ViewingTermsChange {
  id: string;
  propertyId: string;
  requestedBy: string;
  requestedByRole: string;
  proposedFeeGhs: number | null;
  proposedTerms: ViewingTermsValues | Record<string, never>;
  previousFeeGhs: number | null;
  previousTerms: ViewingTermsValues | null;
  status: 'pending_review' | 'approved' | 'rejected' | string;
  statusLabel: string;
  note: string;
  decisionNote: string;
  reviewedAt: string | null;
  appliedAt: string | null;
  createdAt: string | null;
  propertyTitle?: string;
  propertyStatus?: string;
}

export interface PropertyViewingTerms {
  /** Approved viewing fee, or null when no fee is approved for this property. */
  feeGhs: number | null;
  terms: ViewingTermsValues | null;
  isApproved: boolean;
  appliesToRole?: string;
  /** Owner/agent/staff only. */
  state?: 'not_set' | 'pending_review' | 'approved' | 'rejected' | string;
  stateLabel?: string;
  updatedAt?: string | null;
  pendingChange?: ViewingTermsChange | null;
}

export type RequestProgressStatus = 
  | 'submitted' 
  | 'searching' 
  | 'matched' 
  | 'viewing_scheduled' 
  | 'completed' 
  | 'cancelled';

export interface TenantRequest {
  id: string;
  tenantId: string;
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
  status: RequestProgressStatus;
  matchedPropertyIds?: string[];
  assignedAgent?: string;
  notes?: string;
  createdAt: string;
}

export interface MatchResult {
  id: string;
  tenantRequestId: string;
  propertyId: string;
  propertyTitle: string;
  propertyLocation: string;
  rentGhs: number;
  matchScore: number;
  aiMatchReason: string;
  status: 'suggested' | 'confirmed' | 'rejected';
  createdAt: string;
}

/** The Increment F lifecycle vocabulary. `scheduled` is a legacy value only. */
export type ViewingStatus =
  | 'enquiry_received'
  | 'viewing_requested'
  | 'awaiting_agent'
  | 'proposed'
  | 'confirmed'
  | 'reschedule_requested'
  | 'rescheduled'
  | 'cancelled'
  | 'completed'
  | 'tenant_no_show'
  | 'agent_no_show'
  | 'could_not_proceed';

export type ViewingAction =
  | 'propose'
  | 'confirm'
  | 'reschedule'
  | 'request_reschedule'
  | 'cancel'
  | 'complete'
  | 'tenant_no_show'
  | 'agent_no_show'
  | 'could_not_proceed';

export interface ViewingSchedule {
  id: string;
  tenantRequestId: string;
  tenantName: string;
  tenantPhone: string;
  tenantEmail?: string;
  /** The tenant account, when the request came from a signed-in tenant. */
  tenantUserId: string;
  /** The agent responsible. Set from the listing's submitter, or by staff. */
  agentUserId: string;
  propertyId: string;
  propertyTitle: string;
  propertyLocation: string;
  /** The current (proposed or agreed) slot. */
  date: string;
  time: string;
  preferredDate: string;
  preferredTime: string;
  requestType: 'viewing' | 'enquiry';
  assignedAgent: string;
  status: ViewingStatus;
  /** What the database literally holds; `scheduled` reads as `confirmed`. */
  storedStatus: string;
  statusLabel: string;
  /** True only when an appointment has actually been agreed. */
  isConfirmed: boolean;
  isTerminal: boolean;
  overdue: boolean;
  confirmedAt: string;
  confirmedBy: string;
  cancelReason: string;
  cancelledAt: string;
  completedAt: string;
  agentNotes: string;
  viewingFeePaid: boolean;
  feeAmountGhs: number;
  outcomeNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ViewingHistoryEvent {
  id: string;
  viewingId: string;
  action: string;
  fromStatus: ViewingStatus;
  toStatus: ViewingStatus;
  previousDate: string;
  previousTime: string;
  newDate: string;
  newTime: string;
  note: string;
  actorId: string;
  actorRole: string;
  actorName: string;
  at: string;
}

export interface ViewingFinancialState {
  feeRecorded: boolean;
  feeRecordId: string;
  collectedGhs: number | null;
  collectionState: string;
  goodlucksShareGhs: number | null;
  note: string;
}

export interface ViewingDetail {
  viewing: ViewingSchedule;
  history: ViewingHistoryEvent[];
  access: { role: 'tenant' | 'agent' | 'landlord' | 'admin' | 'none'; canAct: boolean };
  allowedActions: ViewingAction[];
  financial: ViewingFinancialState;
  capabilities?: StaffCapabilities;
  landlordUserId?: string;
}

export interface ViewingCounts {
  total: number;
  overdue: number;
  unresolved: number;
  confirmed: number;
  completed: number;
  cancelled: number;
}

export interface SearchAlertSubscription {
  id: string;
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
  createdAt: string;
  active: boolean;
}

export interface EmailLog {
  id: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  type: 
    | 'registration' 
    | 'login' 
    | 'property_submission' 
    | 'tenant_request' 
    | 'property_approval' 
    | 'property_rejection' 
    | 'viewing_scheduled' 
    | 'viewing_reminder' 
    | 'match_found'
    | 'alert_subscription';
  bodyPreview: string;
  sentAt: string;
  /** `queued` = waiting for the outbox worker, `failed` = gave up after retries. */
  status: 'queued' | 'delivered' | 'failed';
}

export interface EmailOutboxSummary {
  pending: number;
  failed: number;
  sentToday: number;
  oldestPendingAt: string | null;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'viewing';
  read: boolean;
  createdAt: string;
}

export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

export interface TrafficDataPoint {
  label: string;
  visitors: number;
  pageViews: number;
}

export interface AnalyticsStats {
  visitorsToday: number;
  visitorsYesterday: number;
  visitorsLast7Days: number;
  visitorsLast30Days: number;
  visitorsLast12Months: number;
  growthPercentage: number;
  totalRegisteredUsers: number;
  totalTenants: number;
  totalLandlords: number;
  /** Agent accounts (Increment C). */
  totalAgents: number;
  /** Agent accounts still awaiting a staff decision. */
  pendingAgentAccounts: number;
  newUsersToday: number;
  newUsersThisWeek: number;
  totalProperties: number;
  approvedProperties: number;
  pendingProperties: number;
  rejectedProperties: number;
  totalViewings: number;
  // Increment B: viewing-fee money is reported in separate figures and never as
  // one "revenue" number. Only `goodlucksShareReceivedGhs` is Goodlucks money.
  viewingFeesCollectedGhs: number;
  goodlucksShareDueGhs: number;
  goodlucksShareReceivedGhs: number;
  agentShareRetainedGhs: number;
  outstandingReceivablesGhs: number;
  viewingFeeRecordsWithoutShare: number;
  viewingFeeDisputedRecords: number;
  dailyTraffic: TrafficDataPoint[];
  monthlyTraffic: TrafficDataPoint[];
}

export interface RentReceipt {
  id: string;
  receiptNo: string;
  propertyTitle: string;
  propertyAddress: string;
  tenantName: string;
  tenantPhone: string;
  landlordName: string;
  amountGhs: number;
  amountInWords: string;
  paymentPurpose: string;
  paymentMethod: 'MTN MoMo' | 'Telecel Cash' | 'Bank Transfer' | 'Card' | 'Cash';
  transactionRef: string;
  paymentDate: string;
  issuedBy: string;
  verificationCode: string;
  /** Every stored rent record is a staff-entered claim, not a verified payment. */
  recordState?: 'reported';
  recordStateLabel?: string;
  recipient?: { type: 'landlord'; name: string; verified: boolean };
  goodlucksIsRecipient?: boolean;
  /** True for references issued before Increment B ("VERIFIED-REC-..." prefix). */
  legacyReference?: boolean;
  createdAt: string;
}

/** One viewing fee in the Increment B ledger. */
export interface ViewingFeeRecord {
  id: string;
  reference: string;
  viewingId: string;
  propertyId: string;
  propertyTitle: string;
  agentName: string;
  agentUserId: string;
  /** Money the agent collected from the tenant. NOT Goodlucks revenue. */
  feeTotalGhs: number | null;
  collectionState: 'reported' | 'confirmed_by_staff' | 'disputed' | 'void';
  shareBasis: 'not_set' | 'manual_agreement' | 'policy_snapshot';
  /** How the fee was priced: by a person, by an approved policy, or not yet. */
  snapshotKind: 'none' | 'manual_agreement' | 'policy';
  policyId: string;
  agentTierAtSnapshot: 'standard' | 'professional' | '';
  policySnapshot: FeePolicySnapshot | null;
  policyApplicability: FeePolicyApplicability | null;
  /** Money owed to Goodlucks. Null until an amount is explicitly agreed. */
  goodlucksShareGhs: number | null;
  agentShareGhs: number | null;
  remittedGhs: number;
  outstandingGhs: number | null;
  settled: boolean;
  countsInTotals: boolean;
  recordedBy: string;
  recordedAt: string;
  notes: string;
  remittances: FeeRemittance[];
}

export interface FeeRemittance {
  id: string;
  amountGhs: number;
  method: string;
  reference: string;
  receivedAt: string;
  recordedBy: string;
  notes: string;
  /** 'receipt' for money received, 'reversal' for a linked negative adjustment. */
  entryType?: 'receipt' | 'reversal';
  submissionId?: string;
  adjustmentId?: string;
  /**
   * For a reversal row: the receipt it reverses. Reversals are counted against
   * that receipt only, so two receipts on one obligation can be reversed
   * independently.
   */
  reversalOfReceiptId?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Increment G — agent remittances, reconciliation and rental commissions
// ---------------------------------------------------------------------------

/**
 * An agent's claim that they sent money to Goodlucks.
 *
 * `status` is the claim's state: `submitted` and `disputed` are NOT revenue.
 * `confirmedGhs` stays null until an administrator with the confirmation
 * capability has checked that the money actually arrived.
 */
export interface RemittanceSubmission {
  id: string;
  reference: string;
  agentUserId: string;
  agentName: string;
  amountGhs: number;
  currency: string;
  method: string;
  paymentReference: string;
  paidAt: string;
  evidenceReference: string;
  status: 'submitted' | 'confirmed' | 'rejected' | 'disputed';
  statusLabel: string;
  confirmedGhs: number | null;
  isConfirmed: boolean;
  allocatedGhs: number;
  /** Confirmed money not yet attached to an obligation (held, counted once). */
  unallocatedGhs: number | null;
  confirmedBy: string;
  confirmedAt: string | null;
  decisionReason: string;
  note: string;
  requestedAllocations: { viewingFeeRecordId: string; amountGhs: number }[];
  allocations: {
    id: string;
    viewingFeeRecordId: string;
    amountGhs: number;
    reference: string;
    propertyTitle: string;
    createdAt: string;
  }[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AgentFinanceTotals {
  /** What the agent says they collected from tenants. Not Goodlucks revenue. */
  collectedGhs: number;
  /** What Goodlucks is entitled to under an explicit agreement or approved policy. */
  payableToGoodlucksGhs: number;
  /** Money Goodlucks has confirmed receiving against those obligations. */
  confirmedReceivedGhs: number;
  outstandingGhs: number;
  /** Claims submitted but not yet confirmed by finance. */
  awaitingConfirmationGhs: number;
  disputedRecords: number;
  rejectedRemittances: number;
  disputedRemittances: number;
}

export interface AgentFinanceOverview {
  agentUserId: string;
  totals: AgentFinanceTotals;
  viewingFees: ViewingFeeRecord[];
  remittances: RemittanceSubmission[];
  commissions: RentalCommission[];
  policy: FeePolicyStatus;
  capabilities: {
    canSubmitRemittances: boolean;
    canConfirmReceipt: boolean;
    canRecordCommissions: boolean;
  };
  notes: string[];
}

export type RentalCommissionStatus =
  | 'draft'
  | 'awaiting_agreement'
  | 'agreed'
  | 'due'
  | 'partially_paid'
  | 'paid'
  | 'disputed'
  | 'cancelled'
  | 'corrected';

export interface CommissionPayment {
  id: string;
  amountGhs: number;
  method: string;
  reference: string;
  receivedAt: string;
  recordedBy: string;
  entryType: 'receipt' | 'reversal';
  adjustmentId: string;
  notes: string;
  createdAt: string | null;
}

/**
 * A rental commission. Separate from viewing fees on purpose: Goodlucks is not
 * entitled to a commission because a property was rented — a named person has to
 * record the agreement first, and the platform never invents a percentage.
 */
export interface RentalCommission {
  id: string;
  reference: string;
  propertyId: string;
  propertyTitle: string;
  tenantName: string;
  tenantUserId: string;
  landlordName: string;
  landlordUserId: string;
  agentUserId: string;
  agentName: string;
  rentalReference: string;
  amountGhs: number | null;
  currency: string;
  basis: 'manual_agreement' | 'policy_snapshot';
  policyId: string;
  policySnapshot: (Record<string, unknown> & { hashValid?: boolean }) | null;
  dueDate: string;
  status: RentalCommissionStatus;
  statusLabel: string;
  receivedGhs: number;
  outstandingGhs: number | null;
  isSettled: boolean;
  notes: string;
  cancelReason: string;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
  payments: CommissionPayment[];
  countsAsRevenue: boolean;
  /**
   * Task 03: the tier split frozen when this commission was priced. Read from
   * the stored record — an old commission keeps the percentages it was agreed
   * under, even after the agent's verification changes.
   */
  agentTier?: string;
  agentSharePercent?: number | null;
  goodlucksSharePercent?: number | null;
  agentShareGhs?: number | null;
  goodlucksShareGhs?: number | null;
  splitSnapshot?: (Record<string, unknown> & { hashValid?: boolean }) | null;
  splitFrozenAt?: string | null;
}

export interface FinancialAdjustment {
  id: string;
  subjectType: 'viewing_fee_remittance' | 'rental_commission';
  subjectId: string;
  kind: 'reversal' | 'correction';
  amountGhs: number;
  reason: string;
  supportReference: string;
  meta: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string | null;
}

export interface FinanceReconciliationSummary {
  currency: string;
  viewingFees: {
    collectedGhs: number;
    entitledGhs: number;
    receivedGhs: number;
    outstandingGhs: number;
    recordsWithoutAgreedShare: number;
    disputedRecords: number;
  };
  remittances: {
    reportedAwaitingConfirmationGhs: number;
    awaitingConfirmationCount: number;
    confirmedReceivedGhs: number;
    appliedToObligationsGhs: number;
    unallocatedGhs: number;
    rejectedCount: number;
    disputedCount: number;
  };
  rentalCommissions: {
    agreedGhs: number;
    dueGhs: number;
    receivedGhs: number;
    outstandingGhs: number;
    disputedCount: number;
    byStatus: Record<string, number>;
    records: number;
  };
  adjustments: {
    count: number;
    netGhs: number;
    recent: FinancialAdjustment[];
  };
  /** Only confirmed money appears here, in two separate lines. */
  confirmedRevenue: {
    viewingFeeRemittancesGhs: number;
    rentalCommissionsGhs: number;
    note: string;
  };
  counts: { feeRecords: number; submissions: number; commissions: number };
}

export interface ViewingFeeSummary {
  viewingFeesCollectedGhs: number;
  goodlucksShareDueGhs: number;
  goodlucksShareReceivedGhs: number;
  agentShareRetainedGhs: number;
  outstandingReceivablesGhs: number;
  recordsWithoutAgreedShare: number;
  disputedRecords: number;
  recordsCounted: number;
}

export interface FeePolicyStatus {
  status: 'provisional' | 'approved';
  appliedToCalculations: false;
  approvedPolicy: {
    id: string;
    tier: string;
    agentSharePercent: number;
    goodlucksSharePercent: number;
    approvedBy: string;
    approvedAt: string | null;
    effectiveFrom: string;
  } | null;
  proposed: Array<{
    tier: string;
    label: string;
    agentSharePercent: number;
    goodlucksSharePercent: number;
    status: 'provisional';
  }>;
  note: string;
}

/** Increment E — derived agent tier (never set by a client). */
export type AgentTier = 'standard' | 'professional';

export interface AgentTierState {
  userId: string;
  tier: AgentTier;
  tierLabel: string;
  eligibleStandard: boolean;
  eligibleProfessional: boolean;
  /** Task 03: the commission tier derived from the verified records. */
  commissionTier?: 'tier_a' | 'higher' | 'none' | string;
  commissionTierLabel?: string;
  commissionPercent?: number;
  goodlucksPercent?: number;
  commissionEligible?: boolean;
  commissionBasis?: string;
  basicTierPercent?: number;
  basicTierRequires?: string;
  higherTierPercent?: number;
  higherTierRequires?: string;
  identityStatus: string;
  identityApproved: boolean;
  professionalStoredStatus: string;
  professionalStatus: string;
  professionalSubmitted: boolean;
  professionalApproved: boolean;
  professionalExpired: boolean;
  professionalRejected: boolean;
  note: string;
}

export type FeePolicyStatusKind =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'active'
  | 'rejected'
  | 'deactivated'
  | 'expired';

export interface FeePolicy {
  id: string;
  name: string;
  description: string;
  agentTier: AgentTier;
  agentTierLabel: string;
  category: 'viewing_fee' | 'rental_commission' | 'other_service_fee';
  categoryLabel: string;
  calculationMethod: 'percentage' | 'fixed';
  calculationMethodLabel: string;
  currency: string;
  agentSharePercent: number;
  goodlucksSharePercent: number;
  agentShareFixedGhs: number | null;
  goodlucksShareFixedGhs: number | null;
  totalFixedGhs: number | null;
  status: FeePolicyStatusKind;
  storedStatus: FeePolicyStatusKind;
  expired: boolean;
  statusLabel: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedBy: string;
  submittedAt: string;
  approvedBy: string;
  approvedAt: string;
  rejectedBy: string;
  rejectedAt: string;
  rejectionReason: string;
  activatedBy: string;
  activatedAt: string;
  deactivatedBy: string;
  deactivatedAt: string;
  deactivationReason: string;
  notes: string;
  supersedesPolicyId: string;
  approved: boolean;
  applicable: boolean;
}

export interface FeePolicyEvent {
  id: string;
  action: string;
  fromStatus: FeePolicyStatusKind;
  toStatus: FeePolicyStatusKind;
  note: string;
  actorId: string;
  actorName: string;
  at: string;
}

export interface FeePolicyOverview {
  success: boolean;
  policies: FeePolicy[];
  activePolicies: FeePolicy[];
  counts: Record<string, number>;
  tiers: Array<{ value: AgentTier; label: string; description: string }>;
  categories: Array<{ value: FeePolicy['category']; label: string }>;
  calculationMethods: Array<{ value: 'percentage' | 'fixed'; label: string }>;
  statuses: FeePolicyStatusKind[];
  currency: string;
  proposed: Array<{
    agentTier: AgentTier;
    label: string;
    agentSharePercent: number;
    goodlucksSharePercent: number;
    status: 'provisional';
    appliedToCalculations: false;
  }>;
  appliedToCalculations: false;
  note: string;
  /** Echoed by the server so the screen can show what the session actually holds. */
  capabilities?: StaffCapabilities;
}

export interface FeePolicyInput {
  name: string;
  description?: string;
  category: FeePolicy['category'];
  agentTier: AgentTier;
  calculationMethod: 'percentage' | 'fixed';
  agentSharePercent?: number;
  goodlucksSharePercent?: number;
  agentShareFixedGhs?: number;
  goodlucksShareFixedGhs?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  currency?: string;
  notes?: string;
}

/** Immutable financial terms frozen at the moment a policy priced a fee. */
export interface FeePolicySnapshot {
  id: string;
  policyId: string;
  policyName: string;
  policyVersion: number;
  policyCategory: string;
  agentTier: AgentTier;
  subjectUserId: string;
  transactionType: string;
  transactionId: string;
  currency: string;
  calculationMethod: 'percentage' | 'fixed';
  feeTotalGhs: number;
  agentSharePercent: number;
  goodlucksSharePercent: number;
  agentShareFixedGhs: number | null;
  goodlucksShareFixedGhs: number | null;
  agentEntitlementGhs: number;
  goodlucksEntitlementGhs: number;
  policyStatusAtUse: string;
  policyEffectiveFrom: string;
  policyEffectiveTo: string;
  policyApprovedBy: string;
  policyApprovedAt: string;
  transactionAt: string;
  snapshotAt: string;
  createdBy: string;
  snapshotHash: string;
  /** Recomputed from the stored payload on every read; false means tampering. */
  integrityOk: boolean;
}

export interface FeePolicyApplicability {
  applies: boolean;
  policyId?: string;
  policyName?: string;
  agentTier?: AgentTier;
  reason: string;
}

export interface Enquiry {
  id: string;
  propertyId: string;
  propertyTitle: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  source: 'contact_form' | 'property_page' | string;
  status: 'new' | 'contacted' | 'closed';
  createdAt: string;
}

export interface PriceDropAlert {
  id: string;
  propertyId: string;
  propertyTitle: string;
  propertyLocation: string;
  currentRentGhs: number;
  targetRentGhs?: number;
  email: string;
  name?: string;
  phone?: string;
  notifyOnAnyDrop: boolean;
  createdAt: string;
  active: boolean;
}
