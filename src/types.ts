export type UserRole = 'tenant' | 'landlord' | 'admin' | 'guest';

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
  isVerified?: boolean;
  preferredLocations?: string[];
  budgetMin?: number;
  budgetMax?: number;
  preferredBedrooms?: number;
  additionalNotes?: string;
  createdAt: string;
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
  landlordId: string;
  isLandlordVerified?: boolean;
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
  createdAt: string;
  updatedAt: string;
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

export interface ViewingSchedule {
  id: string;
  tenantRequestId: string;
  tenantName: string;
  tenantPhone: string;
  propertyId: string;
  propertyTitle: string;
  propertyLocation: string;
  date: string;
  time: string;
  assignedAgent: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  viewingFeePaid: boolean;
  feeAmountGhs: number;
  outcomeNotes?: string;
  createdAt: string;
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
  newUsersToday: number;
  newUsersThisWeek: number;
  totalProperties: number;
  approvedProperties: number;
  pendingProperties: number;
  rejectedProperties: number;
  totalViewings: number;
  physicalRevenueGhs: number;
  dailyTraffic: TrafficDataPoint[];
  monthlyTraffic: TrafficDataPoint[];
}

export interface TenancyAgreement {
  id: string;
  propertyId?: string;
  propertyTitle: string;
  propertyAddress: string;
  city: string;
  landlordName: string;
  landlordPhone: string;
  landlordGhanaCard: string;
  tenantName: string;
  tenantPhone: string;
  tenantGhanaCard: string;
  monthlyRentGhs: number;
  durationMonths: number;
  totalRentGhs: number;
  securityDepositGhs: number;
  startDate: string;
  endDate: string;
  noticePeriodMonths: number;
  utilitiesResponsibility: string;
  landlordSigned: boolean;
  tenantSigned: boolean;
  landlordSignatureDate?: string;
  tenantSignatureDate?: string;
  witnessName?: string;
  status: 'draft' | 'pending_signatures' | 'active' | 'expired';
  verificationCode: string;
  createdAt: string;
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
  createdAt: string;
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
