export type UserRole = 'tenant' | 'landlord' | 'agent' | 'admin' | 'guest';

/**
 * The account group a visitor picks on the sign-in / registration screen.
 *
 * There are exactly two: a Tenant, and ONE Agent/Landlord account. 'provider' is
 * never stored on an account — an Agent/Landlord account is stored as 'agent' or
 * 'landlord' once it has chosen its classification during verification.
 */
export type AccountGroup = 'tenant' | 'provider' | 'agent' | 'landlord';

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
/**
 * The console's view of an agent account (Upgrade 2, A8).
 *
 * `pending` / `approved_for_listing` / `suspended` describe the LISTING
 * authorisation decision. Identity verification (`identityVerified`) is a
 * different decision and is never implied by this one.
 */
export type AgentAccountStage = 'pending' | 'approved_for_listing' | 'suspended';

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
  /**
   * Upgrade 2 correction: 'agent' or 'landlord' once chosen, else 'pending' while
   * the account still has to say which it is. That choice is step one here.
   */
  providerCategory?: 'agent' | 'landlord' | 'pending' | null;
  classificationRequired?: boolean;
  /** The account's professional classification, derived from the stored choice. */
  classification?: 'agent' | 'landlord' | 'pending' | null;
  /** True for a landlord account, so the form can ask for an operating location. */
  isLandlord?: boolean;
  /** The city or area the account operates from (prefills a landlord's verification). */
  operatingLocation?: string;
  /**
   * The listing rule, straight from the server: verification is mandatory before
   * a property can be submitted.
   */
  listing?: {
    canList: boolean;
    reason: string | null;
    message: string;
    identityStatus: string;
    identityApproved: boolean;
    verifiedLabel: string | null;
  };
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
  /**
   * Approve a fee policy this same account created. True for the primary
   * platform administrator only; every other administrator needs a second
   * administrator, and the server enforces it.
   */
  feePolicySelfApprove?: boolean;
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
  /**
   * Agent/Landlord accounts only: the professional classification.
   * `'pending'` means the account registered through the Agent/Landlord group
   * and has not chosen Agent or Landlord yet (Upgrade 2 correction).
   */
  providerCategory?: 'agent' | 'landlord' | 'pending' | null;
  /** True while an Agent/Landlord account still has to choose its classification. */
  classificationRequired?: boolean;
  /**
   * Whether this Agent/Landlord account may submit listings. Verification is
   * mandatory, so this is true only once an identity verification has been
   * approved (and the account is not suspended). Server-derived.
   */
  canListProperties?: boolean;
  /** Why listing is closed: classification_required | identity_* | suspended. */
  listingBlockedReason?: string | null;
  /** 'not_submitted' | 'pending_review' | 'under_review' | 'approved' | ... */
  identityVerificationStatus?: string;
  /** 'Verified Landlord' | 'Verified Agent Tier 1' | 'Verified Agent Tier 2' | null. */
  verifiedLabel?: string | null;
  /** Present only on agent accounts (Increment C). */
  agentProfile?: AgentProfile | null;
  /** Present only on administrator accounts (Increment D). */
  capabilities?: StaffCapabilities;
  /**
   * True for the primary platform administrator account only. It is assigned
   * from the server console, never by the application.
   */
  isPrimaryAdmin?: boolean;
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
  /**
   * The period `rentGhs` is quoted in (`month` today, on every listing — the
   * catalogue stores a monthly rent). It is carried on the record so a yearly,
   * weekly or daily listing would print its own period rather than being
   * labelled monthly; see `rentPeriodLabel()` in `src/routing/propertyUrl.ts`.
   */
  rentPeriod?: string;
  /** Optional: the short sharing address (`/p/{id}`) as the API builds it. */
  shortPath?: string;
  /** Optional: the absolute short sharing URL as the API builds it. */
  shortUrl?: string;
  bedrooms: number;
  bathrooms: number;
  propertyType: PropertyType;
  status: PropertyStatus;
  images: string[];
  description: string;
  /**
   * Upgrade 2 (C5): canonical amenity keys, plus the human labels and whatever
   * free text could not be mapped (kept so nothing a listing said is lost).
   */
  amenities: string[];
  amenityLabels?: string[];
  amenitiesNote?: string;
  /** Upgrade 2 (C5): structured specs. Null means the listing did not say. */
  toilets?: number | null;
  kitchens?: number | null;
  furnishing?: string;
  furnishingLabel?: string;
  /** Upgrade 2 (C4): an approved YouTube/TikTok/Facebook video, or null. */
  video?: { provider: string; url: string; embedUrl: string } | null;
  videoProvider?: string;
  videoUrl?: string;
  /**
   * Upgrade 2 (C6): the provider's own expectation. This is NOT a platform fee:
   * `isPlatformFee` is always false and nothing is calculated from it.
   */
  providerCommission?: { percent: number | null; note: string; isPlatformFee: boolean };
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
  /**
   * Task 03 update: whose policy set the fee.
   *  - `platform_policy`: the administrator's general landlord viewing fee
   *  - `property`: the agent's own per-property fee
   *  - `none`: nothing approved yet (no amount is invented)
   */
  source?: 'platform_policy' | 'property' | 'none';
  setBy?: string;
  payableAfterViewing?: boolean;
  paidTo?: string;
  /** A landlord never receives a viewing fee. */
  landlordShareGhs?: number | null;
  /** Staff/owner only: has the general landlord viewing fee been configured? */
  platformFeeConfigured?: boolean;
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
  /**
   * The administrator's view of the same lifecycle (Upgrade 2, A7):
   * pending (submitted/searching) · approved (matched) · viewing_scheduled ·
   * completed · cancelled. Derived on the server; it never overrides `status`.
   */
  stage?: 'pending' | 'approved' | 'viewing_scheduled' | 'completed' | 'cancelled';
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
  | 'accept_reschedule'
  | 'decline_reschedule'
  | 'cancel'
  | 'complete'
  | 'tenant_no_show'
  | 'agent_no_show'
  | 'could_not_proceed';

export interface ViewingSchedule {
  id: string;
  tenantRequestId: string;
  tenantName: string;
  /**
   * Empty when the viewer is not entitled to it. An agent or landlord sees a
   * tenant's phone number and email address only after an administrator approves
   * sharing (`tenantContactVisible`); staff and the tenant always see them.
   */
  tenantPhone: string;
  tenantEmail?: string;
  /** True when this viewer may see the tenant's contact details. */
  tenantContactVisible?: boolean;
  /**
   * `staff` | `own_record` (visible) · `withheld_pending_approval` | `withheld`
   * (not visible). The full approval workflow arrives with the disclosure queue.
   */
  tenantContactState?: string;
  /** The provider's own request: pending/approved/rejected/revoked/expired. */
  contactDisclosure?: ContactDisclosure | null;
  /** Plain-language explanation shown in place of the withheld details. */
  tenantContactReason?: string;
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
  /** Task 03 update: where the recorded fee came from and who it is paid to. */
  feeSource?: 'platform_policy' | 'property' | '';
  feePaidTo?: string;
  feePayableAfterViewing?: boolean;
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
  shareBasis: 'not_set' | 'manual_agreement' | 'policy_snapshot' | 'platform_policy';
  /** How the fee was priced: by a person, by an approved policy, or not yet. */
  snapshotKind: 'none' | 'manual_agreement' | 'policy' | 'platform_policy';
  /**
   * Task 03 update: an agent collection or a landlord viewing fee paid straight
   * to Goodlucks. A landlord fee is never shared with an agent.
   */
  feeSource?: 'agent_collection' | 'landlord_platform_fee';
  feeSourceLabel?: string;
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
  /**
   * Task 03 update: which policy priced this record.
   *  - `agent_commission`: an agent listing's commission, split 60/70 by tier
   *  - `landlord_platform_fee`: 8% of the rent a tenant actually paid on a
   *    landlord listing, belonging entirely to Goodlucks Homes
   */
  policyType?: 'agent_commission' | 'landlord_platform_fee';
  policyTypeLabel?: string;
  isLandlordPlatformFee?: boolean;
  /** Landlord platform fee only: the rent paid (basis) and the percentage used. */
  rentAmountGhs?: number | null;
  platformFeePercent?: number | null;
  /** Landlords receive no commission and no share of the platform fee. */
  landlordShareGhs?: number | null;
}

/** The administrator-controlled general landlord viewing fee (Task 03 update). */
export interface LandlordViewingFeeSetting {
  configured: boolean;
  amountGhs: number | null;
  updatedAt: string | null;
  updatedBy: string;
  updatedByName: string;
  label: string;
  payableBy: string;
  paidTo: string;
  landlordShare: number;
  appliesTo: string;
}

export interface LandlordPlatformFeePolicy {
  percent: number;
  label: string;
  basis: string;
  paidTo: string;
  landlordSharePercent: number;
  agentSharePercent: number;
  appliesTo: string;
}

export interface LandlordPolicy {
  viewingFee: LandlordViewingFeeSetting;
  platformFee: LandlordPlatformFeePolicy;
  agentPolicy: { label: string; appliesTo: string; note: string };
}

export interface LandlordFeeSummary {
  records: number;
  rentBasisGhs?: number;
  platformFeesGhs?: number;
  feesGhs?: number;
  receivedGhs: number;
  outstandingGhs: number;
  landlordCommissionGhs?: number;
  landlordShareGhs?: number;
  agentShareGhs?: number;
  percent?: number;
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
  /**
   * True only when the primary administrator approved a policy it created
   * itself. Shown as a fact in the console so the exception is visible.
   */
  selfApproved?: boolean;
  selfApprovedAt?: string;
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

/** One line of the documented match score (Upgrade 2, B2). */
export interface MatchFactor {
  factor: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface MatchBand {
  label: string;
  band: 'strong' | 'good' | 'possible' | 'weak' | string;
}

/** A tenant's contact details, and who may see them (Upgrade 2, B6). */
export interface ContactDisclosure {
  id: string;
  viewingId: string;
  propertyId: string;
  propertyTitle: string;
  providerUserId: string;
  providerName: string;
  tenantUserId: string;
  tenantName: string;
  requestedBy: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired';
  storedStatus: string;
  statusLabel: string;
  active: boolean;
  decidedBy: string;
  decidedAt: string;
  decisionNote: string;
  expiresAt: string;
  requestedAt: string;
  updatedAt: string;
}

/** Administrator-maintained proximity between two areas (Upgrade 2, B2). */
export interface AreaAdjacency {
  id: string;
  areaA: string;
  areaB: string;
  band: number;
  bandLabel: string;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface FeePolicyEventChange {
  field: string;
  label: string;
  from: string | number | boolean | null;
  to: string | number | boolean | null;
}

export interface FeePolicyEvent {
  id: string;
  action: string;
  fromStatus: FeePolicyStatusKind;
  toStatus: FeePolicyStatusKind;
  note: string;
  /** Phase 4: what changed, field by field. Empty for events written earlier. */
  changes: FeePolicyEventChange[];
  actorId: string;
  actorName: string;
  at: string;
}

/**
 * Every agent with the commission tier their verification currently earns.
 * There is no endpoint that sets a tier by hand.
 */
export interface AdminAgentTierRow {
  userId: string;
  name: string;
  email: string;
  agencyName: string;
  accountStatus: string;
  canSubmitListings: boolean;
  tier: AgentTier;
  tierLabel: string;
  commissionTier: string;
  commissionTierLabel: string;
  commissionPercent: number;
  goodlucksPercent: number;
  commissionEligible: boolean;
  identityStatus: string;
  professionalStatus: string;
  createdAt: string;
}

export interface AdminAgentTiers {
  success: boolean;
  agents: AdminAgentTierRow[];
  counts: { standard: number; professional: number; no_commission_tier: number; total: number };
  rules: Record<string, { label: string; percent: number; requires: string } | number>;
  derived: boolean;
  note: string;
  capabilities?: StaffCapabilities;
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
  /**
   * The enquiry lifecycle (Upgrade 2, A10): new → received → contacted →
   * replied → closed. `received` means an administrator took it on;
   * `replied` means an answer was sent. Both are real stored values.
   */
  status: 'new' | 'received' | 'contacted' | 'replied' | 'closed';
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

/* -------------------------------------------------------------------------- */
/* Blog & Learning Centre (Task 07)                                           */
/* -------------------------------------------------------------------------- */

export type BlogPostStatus = 'draft' | 'scheduled' | 'published' | 'unpublished';

/** How an article treats a listing that is no longer available. */
export type BlogPropertyDisplayRule = 'show_status' | 'hide_unavailable';

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  /** Absolute URL of the filtered Learning Centre index. */
  url: string;
  /** Published articles in this category (public reads). */
  publishedCount?: number;
  /** All articles, every status (admin reads). */
  postCount?: number;
}

export interface BlogPostSummary {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  /** Relative path, e.g. `/blog/how-renting-works`. */
  url: string;
  absoluteUrl: string;
  featuredImage: string;
  featuredImageAlt: string;
  category: BlogCategory | null;
  tags: string[];
  author: { name: string };
  status: BlogPostStatus;
  isFeatured: boolean;
  publishAt: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  readingMinutes: number;
  seoTitle: string;
  seoDescription: string;
}

/**
 * One live listing shown inside an article. These values come from the property
 * record on every read — nothing here is a stored copy of a listing.
 */
export interface BlogPropertyCard {
  propertyId: string;
  title: string;
  location: string;
  city: string;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  rentGhs: number;
  image: string;
  imageAlt: string;
  /** "Available Now", the listing's own availability, or "No longer available". */
  availability: string;
  isAvailable: boolean;
  /** Only an available listing has an openable page; otherwise null. */
  url: string | null;
  displayRule: BlogPropertyDisplayRule;
  note: string;
  sortOrder: number;
  updatedAt: string;
  /** Admin reads only. */
  status?: string;
  missing?: boolean;
}

export interface BlogBreadcrumb {
  name: string;
  url: string;
}

export interface BlogPost extends BlogPostSummary {
  contentHtml: string;
  propertyCards: BlogPropertyCard[];
  related: BlogPostSummary[];
  showcasePlaceholder?: string;
  canonicalUrl?: string;
  breadcrumbs?: BlogBreadcrumb[];
  publicUrl?: string;
}

export interface BlogIndexResponse {
  success: boolean;
  categories: BlogCategory[];
  featured: BlogPostSummary[];
  posts: BlogPostSummary[];
  pagination: { page: number; perPage: number; total: number; pages: number };
}

export interface BlogAdminResponse {
  success: boolean;
  posts: BlogPostSummary[];
  total: number;
  counts: Record<string, number>;
  categories: BlogCategory[];
}

/** A link found inside an email template body. */
export interface EmailTemplateLink {
  url: string;
  slug: string;
  /** published | draft | scheduled | unpublished | missing */
  status: string;
  title: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  targetType: string;
  targetLabel: string;
  bodyHtml: string;
  status: 'active' | 'inactive';
  links: EmailTemplateLink[];
  brokenLinks: EmailTemplateLink[];
  needsAttention: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateTarget {
  type: string;
  label: string;
}

/* -------------------------------------------------------------------------- */
/* Administrator: user directory, activity and bulk email (Upgrade 2, Phase 3) */
/* -------------------------------------------------------------------------- */

/** One account in the administrator directory (A11). Never a password hash. */
export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'tenant' | 'landlord' | 'agent' | 'admin';
  /**
   * An Agent/Landlord account's classification: 'pending' until the account
   * chooses Agent or Landlord during verification (Upgrade 2 correction).
   */
  providerCategory?: 'agent' | 'landlord' | 'pending' | null;
  isVerified: boolean;
  createdAt: string;
  counts: {
    properties: number;
    saved: number;
    requests: number;
    viewings: number;
    enquiries: number;
  };
  /** Documents are a count only: this screen never receives a file reference. */
  verification: {
    identityStatus: string | null;
    documentsOnFile: number;
  };
  agentProfile: { accountStatus: string; canSubmitListings: boolean } | null;
  company?: string;
  address?: string;
  lastActiveAt?: string | null;
  landlordState?: {
    listings: number;
    activeListings: number;
    pendingListings: number;
  };
}

/** One stored event in a person's history (A13). */
export interface AdminUserActivityEntry {
  kind: 'property' | 'saved' | 'request' | 'viewing' | 'enquiry' | 'action';
  id: string;
  title: string;
  status: string;
  at: string;
}

/** One entry in the platform activity feed (A14). */
export interface AdminActivityEntry {
  kind: string;
  id: string;
  title: string;
  detail: string;
  actor: string;
  /** Console tab that owns the record, so the feed can open it. */
  tab: string;
  at: string;
}

/** A bulk email campaign (A12). */
export interface AdminCampaign {
  id: string;
  subject: string;
  bodyHtml: string;
  audience: string;
  audienceLabel: string;
  kind: 'marketing' | 'service';
  status: 'draft' | 'queued' | 'sent' | 'partly_failed';
  createdBy: string;
  createdAt: string;
  queuedAt: string | null;
  completedAt: string | null;
  recipientTotal: number;
  skippedUnsubscribed: number;
}

/** Delivery state, read back from the outbox rows. */
export interface AdminCampaignSummary {
  campaign: AdminCampaign;
  counts: { total: number; queued: number; sent: number; failed: number; pending: number };
  /** Computed from the outbox rows, so it cannot drift from reality. */
  deliveryStatus: 'pending' | 'delivered' | 'partly_failed' | 'failed';
  recipients: Array<{
    email: string;
    name: string;
    status: 'sent' | 'failed' | 'pending';
    attempts: number;
    error: string;
    sentAt: string | null;
  }>;
}
