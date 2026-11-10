import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ApiError, PropertyMatch, api, messageForError } from '../services/apiService';
import AdminAreaAdjacency from './AdminAreaAdjacency';
import AdminContactDisclosures from './AdminContactDisclosures';
import { AdminActivityEntry, Property, TenantRequest } from '../types';
import { AdminFeeLedger } from './AdminFeeLedger';
import { AdminAgentAccounts } from './AdminAgentAccounts';
import { AdminManageListings } from './AdminManageListings';
import { AdminEnquiries } from './AdminEnquiries';
import { AdminUserManagement } from './AdminUserManagement';
import { AdminBulkEmail } from './AdminBulkEmail';
import { AdminActivityFeed } from './AdminActivityFeed';
import { AdminFeePolicies } from './AdminFeePolicies';
import { AdminFinancePanel } from './AdminFinancePanel';
import { AdminViewingsPanel } from './AdminViewingsPanel';
import { AdminViewingTermsQueue } from './AdminViewingTermsQueue';
import { AdminLandlordFeePolicy } from './AdminLandlordFeePolicy';
import { AdminBlogPanel } from './AdminBlogPanel';
import { AdminEmailTemplates } from './AdminEmailTemplates';
import { 
  ShieldCheck, 
  TrendingUp, 
  Users, 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  Mail, 
  BookOpen,
  Sparkles, 
  Search, 
  DollarSign, 
  Wallet,
  Eye, 
  BarChart2, 
  Compass, 
  Bell, 
  FileText, 
  Settings, 
  UserCheck, 
  Clock, 
  AlertCircle,
  Phone,
  MapPin,
  X,
  Database,
  Download,
  ImagePlus,
  Trash2,
  Send
} from 'lucide-react';
import { IMAGE_MAX_BYTES, formatBytes, validateImageFile } from '../lib/uploads';

export const AdminDashboard: React.FC = () => {
  const { 
    currentUser,
    properties, 
    tenantRequests, 
    viewingSchedules, 
    emailLogs,
    emailOutbox,
    runEmailOutbox, 
    enquiries,
    analytics, 
    setCurrentView,
    sectionTab,
    setSectionTab,
    updatePropertyStatus, 
    updateTenantRequestStatus, 
    scheduleViewing, 
    deleteProperty,
    toggleFeatured,
    verifyProperty,
    setEnquiryStatus,
    updateProperty,
    showSuccessToast,
    showErrorToast,
    showInfoToast
  } = useApp();

  // Prevent search engine indexing on the admin dashboard
  useEffect(() => {
    document.title = "Admin Management Console - Goodlucks";

    let metaRobots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    let created = false;
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.name = 'robots';
      document.head.appendChild(metaRobots);
      created = true;
    }
    const previousContent = metaRobots.getAttribute('content');
    metaRobots.setAttribute('content', 'noindex, nofollow, noarchive, nosnippet, noimageindex');

    return () => {
      document.title = "Goodlucks Homes - Rentals & Real Estate";
      if (created && metaRobots && metaRobots.parentNode) {
        metaRobots.parentNode.removeChild(metaRobots);
      } else if (metaRobots) {
        if (previousContent) {
          metaRobots.setAttribute('content', previousContent);
        } else {
          metaRobots.removeAttribute('content');
        }
      }
    };
  }, []);

  // The console section is a URL (/admin/approval-queue, /admin/finance…): the
  // address bar says which screen is open, and reloading keeps it.
  const activeAdminTab = (sectionTab || 'analytics') as
    | 'analytics'
    | 'approval-queue'
    | 'manage'
    | 'matching'
    | 'viewings'
    | 'enquiries'
    | 'email-logs'
    | 'agents'
    | 'fee-policies'
    | 'finance'
    // Task 07: Blog Management and the email-template editor live in the same
    // console, as two more sections of it.
    | 'blog'
    | 'email-templates'
    // Upgrade 2 Phase 3: the user directory and bulk email are their own
    // console sections, reachable at /admin/users and /admin/bulk-email.
    | 'users'
    | 'bulk-email';
  const setActiveAdminTab = setSectionTab;

  // Real data export: CSV of the listings currently loaded from the API.
  const handleExportCsv = () => {
    const columns = [
      'id',
      'title',
      'location',
      'city',
      'propertyType',
      'bedrooms',
      'bathrooms',
      'rentGhs',
      'status',
      'availability',
      'landlordName',
      'viewsCount',
      'enquiriesCount',
      'createdAt',
    ] as const;

    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = properties.map((property) =>
      columns
        .map((column) => escape((property as unknown as Record<string, unknown>)[column]))
        .join(',')
    );
    const csv = [columns.join(','), ...rows].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `goodlucks-listings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // New Viewing Modal State inside Admin
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [viewPropertyModal, setViewPropertyModal] = useState<Property | null>(null);
  const [activeModalImage, setActiveModalImage] = useState<number>(0);
  /**
   * Tenant matching search + stage filter (Upgrade 2, A7).
   *
   * `matchingRequests` is what the matching tab shows: the server's answer to
   * the search and stage, not a client-side filter over a downloaded page. It
   * starts as the session's own list so the tab is populated immediately, then
   * follows the filters.
   */
  const [matchingQuery, setMatchingQuery] = useState('');
  const [matchingStage, setMatchingStage] = useState<'' | 'pending' | 'approved' | 'viewing_scheduled'>('');
  const [matchingRequests, setMatchingRequests] = useState<TenantRequest[]>(tenantRequests);
  const [matchingCounts, setMatchingCounts] = useState<Record<string, number>>({});
  const [matchingLoading, setMatchingLoading] = useState(false);

  const [selectedReqId, setSelectedReqId] = useState(tenantRequests[0]?.id || '');
  const [selectedPropId, setSelectedPropId] = useState(properties[0]?.id || '');
  const [viewDate, setViewDate] = useState(() => new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10));
  const [viewTime, setViewTime] = useState('11:00 AM');
  // No invented staff name (finding D12): the field starts with whoever is
  // signed in, and stays empty for a staff member whose name is not on the
  // session. It is the person logging the request, not a "lead agent".
  const [assignedAgent, setAssignedAgent] = useState(currentUser?.name ?? '');

  const pendingProps = properties.filter(p => p.status === 'pending');
  const activeProps = properties.filter(p => p.status === 'active');

  const [isRunningAlerts, setIsRunningAlerts] = useState(false);
  // Real match scores per tenant request, fetched from the backend so the
  // console shows the same numbers the tenant sees.
  const [requestMatches, setRequestMatches] = useState<Record<string, PropertyMatch[]>>({});
  // Upgrade 2 (B3): the staff shortlist is built deliberately and saved in one
  // go, because the server accepts 3–6 live listings and nothing else.
  const [shortlists, setShortlists] = useState<Record<string, string[]>>({});
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  // Image URLs the listing already had when the editor was opened. They are
  // shown as "Saved" and are kept unless the admin removes a tile; anything
  // uploaded from this form is shown as "New". Removing a tile takes the image
  // out of the listing — it never deletes the stored file.
  const [editSavedImages, setEditSavedImages] = useState<string[]>([]);
  const [editUploadingImages, setEditUploadingImages] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (action: () => Promise<void>, fallbackMessage: string) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : fallbackMessage;
      setActionError(message);
      showErrorToast('Action failed', message);
    }
  };

  const handleApproveProperty = (id: string) => {
    void runAction(() => updatePropertyStatus(id, 'active'), 'Could not approve the listing.');
  };

  const handleRejectProperty = (id: string) => {
    void runAction(() => updatePropertyStatus(id, 'rejected'), 'Could not reject the listing.');
  };

  const toggleChosen = (reqId: string, propId: string) => {
    setShortlists((prev) => {
      const current = prev[reqId] ?? [];
      return {
        ...prev,
        [reqId]: current.includes(propId) ? current.filter((id) => id !== propId) : [...current, propId],
      };
    });
  };

  const handleSaveShortlist = (reqId: string) => {
    const chosen = shortlists[reqId] ?? [];
    if (chosen.length === 0 || chosen.length > 6) {
      showErrorToast(
        'Choose up to 6 properties',
        'A shortlist is a recommendation, not a search result: pick at most six live listings.'
      );
      return;
    }
    void runAction(
      async () => {
        await updateTenantRequestStatus(reqId, 'matched', chosen);
        await Promise.all(
          matchingRequests.map(async (req) => {
            if (req.id !== reqId) return;
            const result = await api.matches(req.id).catch(() => ({ matches: [] as PropertyMatch[] }));
            setRequestMatches((prev) => ({ ...prev, [req.id]: result.matches }));
          })
        );
      },
      'Could not save the shortlist.'
    );
  };

  const handleRunAlertDigest = async () => {
    setIsRunningAlerts(true);
    setActionError(null);
    try {
      const result = await api.runAlertDigest();
      showSuccessToast('Alert digests sent', result.message);
    } catch (error) {
      const message = messageForError(error);
      setActionError(message);
      showErrorToast('Could not send alerts', message);
    } finally {
      setIsRunningAlerts(false);
    }
  };

  /** Adds images to the editor from a file picker (validated, then uploaded). */
  const addEditImages = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const problems: string[] = [];
    const accepted: File[] = [];
    Array.from(fileList).forEach((file) => {
      const problem = validateImageFile(file, IMAGE_MAX_BYTES);
      if (problem) problems.push(problem);
      else accepted.push(file);
    });
    if (problems.length > 0) showErrorToast('Some images were not added', problems[0]);
    if (accepted.length === 0) return;

    setEditUploadingImages(true);
    try {
      const result = await api.uploadImages(accepted);
      setEditForm((prev) => {
        const current = String(prev.images || '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        return { ...prev, images: [...current, ...result.urls].join('\n') };
      });
      showSuccessToast(
        'Images added',
        `${result.urls.length} new ${result.urls.length === 1 ? 'image' : 'images'} will be saved with the listing. The existing images are untouched.`
      );
    } catch (error) {
      showErrorToast('Could not upload images', messageForError(error));
    } finally {
      setEditUploadingImages(false);
    }
  };

  const openEditProperty = (property: Property) => {
    setEditProperty(property);
    setEditForm({
      title: property.title,
      location: property.location,
      city: property.city,
      rentGhs: property.rentGhs,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      propertyType: property.propertyType,
      description: property.description,
      availability: property.availability,
      featured: !!property.featured,
      images: property.images.join('\n'),
    });
    setEditSavedImages(property.images);
  };

  // A7: the matching tab reads the server's filtered list.
  useEffect(() => {
    if (activeAdminTab !== 'matching') return;

    let cancelled = false;
    setMatchingLoading(true);
    api
      .listAllTenantRequests({ q: matchingQuery.trim(), stage: matchingStage })
      .then((result) => {
        if (cancelled) return;
        setMatchingRequests(result.requests ?? []);
        setMatchingCounts(result.stageCounts ?? {});
      })
      .catch((error) => {
        if (!cancelled) setActionError(messageForError(error));
      })
      .finally(() => {
        if (!cancelled) setMatchingLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `tenantRequests` is a dependency so approving a request (which updates the
    // session's list) immediately re-reads the filtered list — an approved
    // request therefore appears in the Approved stage without a manual refresh.
  }, [activeAdminTab, matchingQuery, matchingStage, tenantRequests]);

  useEffect(() => {
    if (activeAdminTab !== 'matching' || matchingRequests.length === 0) return;

    let cancelled = false;
    setMatchesLoading(true);

    Promise.all(
      matchingRequests.slice(0, 20).map(req =>
        api.matches(req.id)
          .then(result => [req.id, result.matches] as const)
          .catch(() => [req.id, [] as PropertyMatch[]] as const)
      )
    )
      .then(entries => {
        if (!cancelled) setRequestMatches(Object.fromEntries(entries));
      })
      .finally(() => {
        if (!cancelled) setMatchesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeAdminTab, matchingRequests]);

  const handleSavePropertyEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProperty) return;
    setIsSavingEdit(true);
    try {
      const images = String(editForm.images || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      await updateProperty(editProperty.id, {
        // Optimistic concurrency: send the version this form was built from.
        updatedAt: editProperty.updatedAt,
        title: editForm.title,
        location: editForm.location,
        city: editForm.city,
        rentGhs: Number(editForm.rentGhs),
        bedrooms: Number(editForm.bedrooms),
        bathrooms: Number(editForm.bathrooms),
        propertyType: editForm.propertyType,
        description: editForm.description,
        availability: editForm.availability,
        images,
      });
      setEditProperty(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // The listing changed under us; close the stale form so reopening it
        // loads the version that actually won.
        setEditProperty(null);
        showErrorToast(
          'Listing changed while you were editing',
          'Someone else saved this listing first. The latest version has been loaded - reopen the editor to continue.'
        );
      } else {
        showErrorToast('Could not save changes', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleScheduleViewingAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const req = tenantRequests.find(r => r.id === selectedReqId) || tenantRequests[0];
    const prop = properties.find(p => p.id === selectedPropId) || properties[0];

    if (!prop) {
      setActionError('Select a property to schedule a viewing.');
      return;
    }
    if (!req) {
      setActionError('A tenant request is required to schedule a viewing for a tenant.');
      return;
    }

    try {
      await scheduleViewing({
        tenantName: req.tenantName,
        tenantPhone: req.tenantPhone,
        tenantEmail: req.tenantEmail,
        propertyId: prop.id,
        date: viewDate,
        time: viewTime,
        notes: `Request logged by ${assignedAgent || 'Goodlucks staff'} on the tenant's behalf. Not yet confirmed.`,
      });
      // The tenant-request pipeline records that a viewing has been requested.
      // The appointment itself only counts as agreed once the viewing says so.
      await updateTenantRequestStatus(req.id, 'viewing_scheduled');
      setShowScheduleModal(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not schedule the viewing.');
    }
  };

  return (
    <div className="min-h-screen bg-page text-ink py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8 animate-fadeIn">
        
        {/* SaaS Header */}
        <div className="gl-card p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-interactive text-ink flex items-center justify-center font-bold text-xl">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-ink tracking-tight">Goodlucks Admin SaaS Control Panel</h1>
                <span className="gl-badge gl-badge-danger">
                  Live Operations
                </span>
              </div>
              <p className="text-xs text-ink/70">Intermediary Rental Management, AI Match Scoring & Physical Viewing Operations</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={handleExportCsv}
              className="gl-btn gl-btn-secondary px-3.5 text-xs"
              title="Download every listing as a CSV spreadsheet"
            >
              <Database className="w-4 h-4 text-ink" />
              <Download className="w-3.5 h-3.5 text-ink/70" />
              <span>Export Listings (CSV)</span>
            </button>

            <button
              onClick={() => void handleRunAlertDigest()}
              disabled={isRunningAlerts}
              className="gl-btn gl-btn-secondary px-3.5 text-xs"
              title="Email saved searches that match a new listing"
            >
              <Bell className="w-4 h-4 text-ink" />
              <span>{isRunningAlerts ? 'Sending…' : 'Send Alert Digests'}</span>
            </button>

            <button 
              onClick={() => setShowScheduleModal(true)}
              className="gl-btn gl-btn-primary px-4 text-xs"
            >
              <Calendar className="w-4 h-4" /> Schedule Physical Viewing
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-line">
          <button
            onClick={() => setActiveAdminTab('analytics')}
            className={`gl-tab ${activeAdminTab === 'analytics' ? 'gl-tab-active' : ''}`}
          >
            <BarChart2 className="w-4 h-4" /> Analytics Dashboard
          </button>

          <button
            onClick={() => setActiveAdminTab('approval-queue')}
            className={`gl-tab ${activeAdminTab === 'approval-queue' ? 'gl-tab-active' : ''}`}
          >
            <Building2 className="w-4 h-4" /> Property Approval Queue ({pendingProps.length})
          </button>

          <button
            onClick={() => setActiveAdminTab('manage')}
            className={`gl-tab ${activeAdminTab === 'manage' ? 'gl-tab-active' : ''}`}
          >
            <Building2 className="w-4 h-4" /> Manage All Listings ({properties.length})
          </button>

          <button
            onClick={() => setActiveAdminTab('matching')}
            className={`gl-tab ${activeAdminTab === 'matching' ? 'gl-tab-active' : ''}`}
          >
            <Sparkles className="w-4 h-4" /> Tenant AI Matching ({tenantRequests.length})
          </button>

          <button
            onClick={() => setActiveAdminTab('viewings')}
            className={`gl-tab ${activeAdminTab === 'viewings' ? 'gl-tab-active' : ''}`}
          >
            <Calendar className="w-4 h-4" /> Viewing requests &amp; appointments ({viewingSchedules.length})
          </button>

          <button
            onClick={() => setActiveAdminTab('agents')}
            className={`gl-tab ${activeAdminTab === 'agents' ? 'gl-tab-active' : ''}`}
          >
            <UserCheck className="w-4 h-4" /> Agent Accounts
          </button>

          <button
            onClick={() => setActiveAdminTab('users')}
            className={`gl-tab ${activeAdminTab === 'users' ? 'gl-tab-active' : ''}`}
          >
            <Users className="w-4 h-4" /> User Management
          </button>

          <button
            onClick={() => setActiveAdminTab('fee-policies')}
            className={`gl-tab ${activeAdminTab === 'fee-policies' ? 'gl-tab-active' : ''}`}
          >
            <DollarSign className="w-4 h-4" /> Fee Policies
          </button>

          <button
            onClick={() => setActiveAdminTab('finance')}
            className={`gl-tab ${activeAdminTab === 'finance' ? 'gl-tab-active' : ''}`}
          >
            <Wallet className="w-4 h-4" /> Finance
          </button>

          <button
            onClick={() => setActiveAdminTab('enquiries')}
            className={`gl-tab ${activeAdminTab === 'enquiries' ? 'gl-tab-active' : ''}`}
          >
            <FileText className="w-4 h-4" /> Website Enquiries ({enquiries.length})
          </button>

          <button
            onClick={() => setActiveAdminTab('email-logs')}
            className={`gl-tab ${activeAdminTab === 'email-logs' ? 'gl-tab-active' : ''}`}
          >
            <Mail className="w-4 h-4" /> Transactional Emails ({emailLogs.length})
          </button>

          <button
            onClick={() => setActiveAdminTab('blog')}
            className={`gl-tab ${activeAdminTab === 'blog' ? 'gl-tab-active' : ''}`}
          >
            <BookOpen className="w-4 h-4" /> Blog Management
          </button>

          <button
            onClick={() => setActiveAdminTab('email-templates')}
            className={`gl-tab ${activeAdminTab === 'email-templates' ? 'gl-tab-active' : ''}`}
          >
            <Mail className="w-4 h-4" /> Email Templates
          </button>

          <button
            onClick={() => setActiveAdminTab('bulk-email')}
            className={`gl-tab ${activeAdminTab === 'bulk-email' ? 'gl-tab-active' : ''}`}
          >
            <Send className="w-4 h-4" /> Bulk Email
          </button>

          <button
            onClick={() => setCurrentView('receipts')}
            className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 bg-interactive/10 text-ink border border-interactive/30 hover:bg-interactive/20"
          >
            <FileText className="w-4 h-4 text-ink" /> Payment Records
          </button>
        </div>

        {actionError && (
          <div role="alert" className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{actionError}</span>
            <button type="button" onClick={() => setActionError(null)} className="font-bold">
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: Advanced Analytics Dashboard */}
        {activeAdminTab === 'analytics' && (
          <div className="space-y-8">

            {/* Recent activity (Upgrade 2, A14): the newest real records. */}
            <AdminActivityFeed
              onOpen={(entry: AdminActivityEntry) => {
                const property = properties.find((candidate) => candidate.id === entry.id);
                if (entry.kind === 'property' && property) {
                  setViewPropertyModal(property);
                  return;
                }
                setActiveAdminTab(entry.tab as typeof activeAdminTab);
              }}
            />

            {/* Visitor Statistics Header Cards */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-ink" /> Website Traffic & Visitor Analytics
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                <div className="bg-surface p-4 rounded-2xl border border-line space-y-1">
                  <div className="text-[11px] text-ink/70 font-semibold">Today</div>
                  <div className="text-xl font-black text-ink">{analytics.visitorsToday.toLocaleString()}</div>
                  <div className="text-[10px] text-emerald-700 font-bold">+14% vs yesterday</div>
                </div>

                <div className="bg-surface p-4 rounded-2xl border border-line space-y-1">
                  <div className="text-[11px] text-ink/70 font-semibold">Yesterday</div>
                  <div className="text-xl font-black text-ink">{analytics.visitorsYesterday.toLocaleString()}</div>
                  <div className="text-[10px] text-ink/70 font-medium">Recorded</div>
                </div>

                <div className="bg-surface p-4 rounded-2xl border border-line space-y-1">
                  <div className="text-[11px] text-ink/70 font-semibold">Last 7 Days</div>
                  <div className="text-xl font-black text-ink">{analytics.visitorsLast7Days.toLocaleString()}</div>
                  <div className="text-[10px] text-emerald-700 font-bold">+18.5% Growth</div>
                </div>

                <div className="bg-surface p-4 rounded-2xl border border-line space-y-1">
                  <div className="text-[11px] text-ink/70 font-semibold">Last 30 Days</div>
                  <div className="text-xl font-black text-ink">{analytics.visitorsLast30Days.toLocaleString()}</div>
                  <div className="text-[10px] text-ink font-bold">104k Page views</div>
                </div>

                <div className="bg-surface p-4 rounded-2xl border border-line space-y-1 col-span-2 sm:col-span-1">
                  <div className="text-[11px] text-ink/70 font-semibold">Last 12 Months</div>
                  <div className="text-xl font-black text-ink">{analytics.visitorsLast12Months.toLocaleString()}</div>
                  <div className="text-[10px] text-ink/70 font-medium">Cumulative Traffic</div>
                </div>
              </div>
            </div>

            {/* Interactive SVG Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Daily Traffic Chart */}
              <div className="bg-surface p-6 rounded-2xl border border-line space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-base text-ink">Weekly Traffic Trends</h3>
                    <p className="text-xs text-ink/70">Daily unique visitors over the last 7 days</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-500/20 px-2.5 py-1 rounded-full border border-emerald-500/30">
                    +18.5%
                  </span>
                </div>

                {/* SVG Visualizer */}
                <div className="h-48 w-full flex items-end gap-2 pt-6 pb-2 border-b border-line">
                  {analytics.dailyTraffic.map((pt, i) => {
                    const heightPercent = Math.min((pt.visitors / 1600) * 100, 100);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-ink">
                          {pt.visitors}
                        </div>
                        <div 
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-gradient-to-t from-interactive/30 to-interactive rounded-t-lg transition-all group-hover:brightness-125"
                        />
                        <span className="text-[10px] text-ink/70 font-semibold">{pt.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Monthly Growth Chart */}
              <div className="bg-surface p-6 rounded-2xl border border-line space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-base text-ink">Monthly Platform Visitors</h3>
                    <p className="text-xs text-ink/70">6-Month growth trajectory in Ghana</p>
                  </div>
                  <span className="text-xs font-bold text-ink bg-interactive/20 px-2.5 py-1 rounded-full border border-interactive/30">
                    32,500 Current Mo.
                  </span>
                </div>

                {/* SVG Visualizer */}
                <div className="h-48 w-full flex items-end gap-3 pt-6 pb-2 border-b border-line">
                  {analytics.monthlyTraffic.map((pt, i) => {
                    const heightPercent = Math.min((pt.visitors / 35000) * 100, 100);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-accent">
                          {(pt.visitors / 1000).toFixed(1)}k
                        </div>
                        <div 
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-gradient-to-t from-accent/30 to-accent rounded-t-lg transition-all group-hover:brightness-125"
                        />
                        <span className="text-[10px] text-ink/70 font-semibold">{pt.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Platform Metrics Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-surface p-5 rounded-2xl border border-line">
                <div className="text-xs text-ink/70 font-medium">Registered Users</div>
                <div className="text-2xl font-extrabold text-ink">{analytics.totalRegisteredUsers}</div>
                <div className="text-[10px] text-ink/70">
                  {analytics.totalTenants} Tenants / {analytics.totalLandlords} Landlords / {analytics.totalAgents ?? 0} Agents
                </div>
              </div>

              <div className="bg-surface p-5 rounded-2xl border border-line">
                <div className="text-xs text-ink/70 font-medium">Physical Viewings Scheduled</div>
                <div className="text-2xl font-extrabold text-ink">{analytics.totalViewings}</div>
                <div className="text-[10px] text-ink">{analytics.completedViewings} completed · reported by staff</div>
              </div>

              <div className="bg-surface p-5 rounded-2xl border border-line">
                <div className="text-xs text-ink/70 font-medium">Viewing Fees Recorded</div>
                <div className="text-2xl font-extrabold text-ink">GH₵ {analytics.viewingFeesCollectedGhs.toLocaleString()}</div>
                <div className="text-[10px] text-ink/70">
                  Agent collections and landlord fees — reconciled in the ledger below
                </div>
              </div>

              <div className="bg-surface p-5 rounded-2xl border border-line">
                <div className="text-xs text-ink/70 font-medium">Approved Active Listings</div>
                <div className="text-2xl font-extrabold text-ink">{activeProps.length} Properties</div>
                <div className="text-[10px] text-amber-700">{pendingProps.length} Pending Review</div>
              </div>
            </div>

            <AdminFeeLedger />
          </div>
        )}

        {/* TAB 2: Property Approval Queue */}
        {activeAdminTab === 'approval-queue' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-ink">Pending Landlord Property Approvals</h2>
                <p className="text-xs text-ink/70">Review documents and details before making listings public on Goodlucks Homes</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-700 text-xs font-bold border border-amber-500/30">
                {pendingProps.length} Action Required
              </span>
            </div>

            {pendingProps.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {pendingProps.map(prop => (
                  <div key={prop.id} className="bg-surface p-5 rounded-2xl border border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <img src={prop.images[0]} alt="" loading="lazy" decoding="async" className="w-20 h-20 rounded-xl object-cover border border-line shrink-0" />
                      <div>
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Pending Review</span>
                        <h3 className="font-bold text-base text-ink">{prop.title}</h3>
                        <p className="text-xs text-ink/70">{prop.location} • GH₵ {prop.rentGhs.toLocaleString()}/mo • {prop.bedrooms} Bed / {prop.bathrooms} Bath</p>
                        <p className="text-[11px] text-ink/70 mt-1">Landlord ID: {prop.landlordId}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => {
                          setViewPropertyModal(prop);
                          setActiveModalImage(0);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-interactive/10 text-ink border border-interactive/30 font-bold text-xs hover:bg-interactive/20 transition-colors flex items-center gap-1.5"
                      >
                        <Eye className="w-4 h-4" /> View Property
                      </button>
                      <button
                        onClick={() => handleApproveProperty(prop.id)}
                        className="px-4 py-2 rounded-xl bg-emerald-500 text-ink font-bold text-xs hover:bg-emerald-400 transition-colors flex items-center gap-1 shadow-md"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Approve Listing
                      </button>
                      <button
                        onClick={() => handleRejectProperty(prop.id)}
                        className="px-4 py-2 rounded-xl bg-accent/20 text-accent font-bold text-xs hover:bg-accent/30 transition-colors flex items-center gap-1"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-surface/40 rounded-2xl border border-line">
                <CheckCircle2 className="w-12 h-12 text-emerald-700 mx-auto mb-3" />
                <div className="text-base font-bold text-ink">Queue Clear!</div>
                <p className="text-xs text-ink/70">All submitted properties have been reviewed by Goodlucks Homes.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2b: Manage all listings (edit / publish / archive / delete) */}
        {activeAdminTab === 'manage' && (
          <div className="space-y-4">
            {/* Task 03: viewing fee / terms changes waiting on staff. Part of the
                existing review area — approving a pending listing applies the
                fee and terms submitted with it. */}
            <AdminViewingTermsQueue />

            {/* Manage Listings (Upgrade 2, A6): search, filters, sorting and
                paging run against the real table on the server, so a search
                covers every listing, not just the ones already downloaded. */}
            <AdminManageListings onEdit={openEditProperty} />
          </div>
        )}

        {/* TAB 2c: Website enquiries */}
        {activeAdminTab === 'agents' && <AdminAgentAccounts />}

        {/* TAB: Fee policies & agent tiers (Increment E) */}
        {activeAdminTab === 'fee-policies' && (
          <div className="space-y-4">
            {/* Task 03 update: the ONE administrator-set viewing fee for every
                landlord-submitted property. Landlords cannot change it. */}
            <AdminLandlordFeePolicy />
            <AdminFeePolicies />
          </div>
        )}
        {activeAdminTab === 'finance' && <AdminFinancePanel />}

        {activeAdminTab === 'enquiries' && <AdminEnquiries />}

        {/* TAB 3: AI Tenant Matching System */}
        {activeAdminTab === 'matching' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-ink">Tenant Request & AI Matching Matrix</h2>
              <p className="text-xs text-ink/70">
                Match tenant requests with active properties and calculate Match Scores. Search by the tenant&rsquo;s name,
                phone number or email address; the stages below are the request&rsquo;s real status.
              </p>
            </div>

            {/* A7: search + stage filters, answered by the server. */}
            <div className="bg-surface border border-line rounded-2xl p-3 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink/60" />
                <input
                  type="search"
                  value={matchingQuery}
                  onChange={(event) => setMatchingQuery(event.target.value)}
                  placeholder="Search tenant name, phone or email…"
                  aria-label="Search tenant requests"
                  className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-ink"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {([
                  { value: '', label: 'All requests' },
                  { value: 'pending', label: `Pending (${matchingCounts.pending ?? 0})` },
                  { value: 'approved', label: `Approved (${matchingCounts.approved ?? 0})` },
                  { value: 'viewing_scheduled', label: `Viewing scheduled (${matchingCounts.viewing_scheduled ?? 0})` },
                ] as const).map((option) => (
                  <button
                    key={option.value || 'all'}
                    type="button"
                    onClick={() => setMatchingStage(option.value)}
                    aria-pressed={matchingStage === option.value}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                      matchingStage === option.value
                        ? 'bg-interactive text-ink border-interactive'
                        : 'bg-page text-ink border-line'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-ink/70">
                {matchingLoading
                  ? 'Searching the requests…'
                  : matchingRequests.length === 0
                    ? 'No rental request matches this search and stage.'
                    : `${matchingRequests.length} ${matchingRequests.length === 1 ? 'request' : 'requests'} shown. An approved request moves into the Approved stage as soon as staff approve its matches.`}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {matchingRequests.map(req => (
                <div key={req.id} className="bg-surface p-6 rounded-2xl border border-line space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-ink">Tenant Enquiry #{req.id}</span>
                      <h3 className="text-lg font-bold text-ink">{req.tenantName} ({req.tenantPhone})</h3>
                      <p className="text-xs text-ink/70">
                        Locations: <strong>{req.preferredLocations.join(', ')}</strong> • Budget: <strong>GH₵ {req.budgetMin} - GH₵ {req.budgetMax}/mo</strong> • {req.bedrooms} Beds
                      </p>
                    </div>

                    <span
                      className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-interactive/20 text-ink border border-interactive/30 shrink-0"
                      title={`Stored status: ${req.status}`}
                    >
                      {(req.stage ?? req.status).replace('_', ' ')}
                    </span>
                  </div>

                  {/* Available Active Properties & Match Suggestions */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-ink/70 uppercase tracking-wider">Top AI Property Matches for {req.tenantName}:</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(requestMatches[req.id] ?? []).slice(0, 2).map(({ property: prop, score, reason, curated }) => (
                        <div key={prop.id} className="bg-surface p-4 rounded-2xl border border-line flex items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span
                                title={reason}
                                className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                  curated ? 'bg-interactive text-ink' : 'bg-emerald-500 text-ink'
                                }`}
                              >
                                {curated ? 'Chosen' : `${score}% match`}
                              </span>
                              <span className="text-xs font-bold text-ink">{prop.title}</span>
                            </div>
                            <div className="text-[11px] text-ink/70 mt-1">
                              {prop.location} • GH₵ {prop.rentGhs.toLocaleString()}/mo
                            </div>
                          </div>

                          <button
                            onClick={() => toggleChosen(req.id, prop.id)}
                            aria-pressed={(shortlists[req.id] ?? []).includes(prop.id)}
                            disabled={curated}
                            className={`px-3 py-1.5 text-xs shrink-0 rounded-lg border font-bold ${
                              curated
                                ? 'bg-interactive/20 text-ink border-interactive/40'
                                : (shortlists[req.id] ?? []).includes(prop.id)
                                  ? 'bg-interactive text-ink border-interactive'
                                  : 'bg-page text-ink border-line'
                            }`}
                          >
                            {curated ? 'In the shortlist' : (shortlists[req.id] ?? []).includes(prop.id) ? 'Chosen' : 'Choose'}
                          </button>
                        </div>
                      ))}
                      {!matchesLoading && (requestMatches[req.id] ?? []).length === 0 && (
                        <p className="text-[11px] text-ink/70 bg-surface border border-line rounded-2xl p-4">
                          No live listing scores against this request yet — the tenant will see new homes as soon as they pass verification.
                        </p>
                      )}
                      {matchesLoading && (requestMatches[req.id] ?? []).length === 0 && (
                        <p className="text-[11px] text-ink/70 bg-surface border border-line rounded-2xl p-4">
                          Scoring live listings…
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-line pt-3">
                    <p className="text-[11px] text-ink/70">
                      Chosen for this tenant:{' '}
                      <span className="font-bold text-ink">{(shortlists[req.id] ?? []).length}</span> of up to 6.
                      {(shortlists[req.id] ?? []).length > 0 && (shortlists[req.id] ?? []).length < 3
                        ? ' Choose at least three so the shortlist reads as a recommendation.'
                        : ''}
                    </p>
                    <button
                      onClick={() => handleSaveShortlist(req.id)}
                      disabled={
                        (shortlists[req.id] ?? []).length === 0 || (shortlists[req.id] ?? []).length > 6
                      }
                      className="gl-btn gl-btn-primary px-3 py-1.5 text-xs shrink-0 disabled:opacity-50"
                    >
                      Save shortlist for {req.tenantName}
                    </button>
                  </div>

                </div>
              ))}
            </div>

            <AdminAreaAdjacency />
          </div>
        )}

        {/* TAB 4: Viewing requests, appointments and history (Increment F) */}
        {activeAdminTab === 'viewings' && (
          <div className="space-y-4">
            <AdminContactDisclosures />
            <AdminViewingsPanel />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-surface border border-line rounded-2xl p-4">
              <p className="text-[11px] text-ink/70 max-w-xl">
                Need to log a viewing that was arranged by phone? Create it as a request. It will not be shown as a
                confirmed appointment until the tenant and agent have agreed a time.
              </p>
              <button
                onClick={() => setShowScheduleModal(true)}
                className="gl-btn gl-btn-primary px-4 py-2 text-xs shrink-0"
              >
                Log a phone request
              </button>
            </div>
          </div>
        )}

        {/* TAB: Blog Management (Task 07) */}
        {activeAdminTab === 'blog' && (
          <AdminBlogPanel />
        )}

        {/* TAB: Email templates (Task 07) */}
        {activeAdminTab === 'email-templates' && (
          <AdminEmailTemplates
            notify={(kind, title, message) => {
              if (kind === 'success') showSuccessToast(title, message);
              else if (kind === 'error') showErrorToast(title, message);
              else showInfoToast(title, message);
            }}
          />
        )}

        {/* TAB: User Management (Upgrade 2, A11 + A13) */}
        {activeAdminTab === 'users' && (
          <AdminUserManagement />
        )}

        {/* TAB: Bulk Email (Upgrade 2, A12) */}
        {activeAdminTab === 'bulk-email' && (
          <AdminBulkEmail />
        )}

        {/* TAB 5: Email Transactional Logs */}
        {activeAdminTab === 'email-logs' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-ink">Transactional Email Audit Logs</h2>
                <p className="text-xs text-ink/70 mt-1">
                  Mail is queued during the request and delivered after it, so a slow mail provider never delays a submit.
                </p>
              </div>
              <button
                onClick={() => void runEmailOutbox().catch(error => showErrorToast('Could not process the queue', messageForError(error)))}
                className="gl-btn gl-btn-primary px-4 py-2.5 text-xs shrink-0"
              >
                Send queued email now
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-surface border border-line rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-ink/70">Queued</div>
                <div className="text-xl font-black text-amber-700">{emailOutbox.pending}</div>
              </div>
              <div className="bg-surface border border-line rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-ink/70">Failed</div>
                <div className="text-xl font-black text-ink">{emailOutbox.failed}</div>
              </div>
              <div className="bg-surface border border-line rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-ink/70">Sent today</div>
                <div className="text-xl font-black text-emerald-700">{emailOutbox.sentToday}</div>
              </div>
              <div className="bg-surface border border-line rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-ink/70">Oldest waiting</div>
                <div className="text-xs font-bold text-ink mt-1">
                  {emailOutbox.oldestPendingAt ? new Date(emailOutbox.oldestPendingAt).toLocaleString() : '—'}
                </div>
              </div>
            </div>
            <div className="bg-surface rounded-2xl border border-line overflow-hidden">
              <div className="divide-y divide-line text-xs">
                {emailLogs.map(log => (
                  <div key={log.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-interactive/20 text-ink font-bold text-[10px] uppercase">
                          {log.type}
                        </span>
                        <span className="font-bold text-ink">{log.subject}</span>
                      </div>
                      <p className="text-ink/70 mt-1">{log.bodyPreview}</p>
                      <span className="text-[10px] text-ink/70">To: {log.recipientName} ({log.recipientEmail}) • Sent: {new Date(log.sentAt).toLocaleString()}</span>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                        log.status === 'delivered'
                          ? 'bg-emerald-500/20 text-emerald-700'
                          : log.status === 'failed'
                            ? 'bg-accent/20 text-ink'
                            : 'bg-amber-500/20 text-amber-700'
                      }`}
                    >
                      {log.status === 'delivered' ? 'Delivered' : log.status === 'failed' ? 'Failed' : 'Queued'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Admin Schedule Viewing Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-start sm:items-center justify-center">
          <div 
            className="bg-surface border border-line rounded-2xl sm:rounded-2xl p-4 sm:p-6 max-w-lg w-full space-y-4 text-ink shadow-lg my-auto max-h-[88dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg sm:text-xl font-bold text-ink">Log a viewing request (Goodlucks intermediary)</h3>
            <p className="text-[11px] text-amber-700/90">
              This records a request on the tenant&apos;s behalf. It is not a confirmed appointment: the tenant and the
              agent must agree the time before it is shown as agreed, and nothing here records a payment.
            </p>

            <form onSubmit={handleScheduleViewingAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1">Select Tenant Request</label>
                <select
                  value={selectedReqId}
                  onChange={(e) => setSelectedReqId(e.target.value)}
                  className="w-full bg-page border border-line rounded-xl p-3 text-xs sm:text-sm text-ink"
                >
                  {tenantRequests.map(r => (
                    <option key={r.id} value={r.id}>{r.tenantName} ({r.preferredLocations.join(', ')})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1">Select Property</label>
                <select
                  value={selectedPropId}
                  onChange={(e) => setSelectedPropId(e.target.value)}
                  className="w-full bg-page border border-line rounded-xl p-3 text-xs sm:text-sm text-ink"
                >
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.title} ({p.location}) - GH₵ {p.rentGhs}/mo</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Viewing Date</label>
                  <input
                    type="date"
                    required
                    value={viewDate}
                    onChange={(e) => setViewDate(e.target.value)}
                    className="w-full bg-page border border-line rounded-xl p-3 text-xs sm:text-sm text-ink"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Time Slot</label>
                  <select
                    value={viewTime}
                    onChange={(e) => setViewTime(e.target.value)}
                    className="w-full bg-page border border-line rounded-xl p-3 text-xs sm:text-sm text-ink"
                  >
                    <option value="09:00 AM">09:00 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                    <option value="02:00 PM">02:00 PM</option>
                    <option value="04:00 PM">04:00 PM</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1">Viewing agent</label>
                <input
                  type="text"
                  required
                  value={assignedAgent}
                  onChange={(e) => setAssignedAgent(e.target.value)}
                  placeholder="Name of the staff member logging this request"
                  className="w-full bg-page border border-line rounded-xl p-3 text-xs sm:text-sm text-ink"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 py-3 rounded-xl bg-surface text-ink/70 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gl-btn gl-btn-primary flex-1 py-3 text-xs"
                >
                  Send viewing request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Property Inspection & Authenticity Modal */}
      {viewPropertyModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-start sm:items-center justify-center">
          <div 
            className="bg-surface border border-line rounded-2xl sm:rounded-2xl p-4 sm:p-8 max-w-3xl w-full text-ink shadow-lg my-auto max-h-[88dvh] overflow-y-auto space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-line pb-4 gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-700 text-xs font-bold border border-amber-500/30 mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  Admin Authenticity & Compliance Inspection
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-ink">{viewPropertyModal.title}</h3>
                <p className="text-xs text-ink/70 mt-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-ink" /> {viewPropertyModal.location} ({viewPropertyModal.city})
                </p>
              </div>
              <button
                onClick={() => setViewPropertyModal(null)}
                className="p-2 rounded-xl bg-page hover:bg-line text-ink/70 hover:text-ink transition-colors"
                aria-label="Close property inspection modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photo Gallery Grid */}
            <div className="space-y-3">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-surface border border-line">
                <img 
                  src={viewPropertyModal.images[activeModalImage] || viewPropertyModal.images[0]} 
                  alt={viewPropertyModal.title} 
                  loading="lazy"
                  decoding="async" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-3 right-3 bg-surface/95 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-semibold text-ink shadow-sm">
                  Photo {activeModalImage + 1} of {viewPropertyModal.images.length}
                </div>
              </div>

              {viewPropertyModal.images.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {viewPropertyModal.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveModalImage(idx)}
                      className={`w-20 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                        activeModalImage === idx ? 'border-interactive scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Property Specs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface p-4 rounded-2xl border border-line">
              <div>
                <span className="text-[10px] font-bold text-ink/70 uppercase">Monthly Rent</span>
                <div className="text-base font-black text-ink">GH₵ {viewPropertyModal.rentGhs.toLocaleString()}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-ink/70 uppercase">Property Type</span>
                <div className="text-sm font-bold text-ink">{viewPropertyModal.propertyType}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-ink/70 uppercase">Bedrooms / Baths</span>
                <div className="text-sm font-bold text-ink">{viewPropertyModal.bedrooms} Bed / {viewPropertyModal.bathrooms} Bath</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-ink/70 uppercase">Availability</span>
                <div className="text-sm font-bold text-emerald-700">{viewPropertyModal.availability}</div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2 bg-surface p-4 rounded-2xl border border-line">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink/70">Description & Overview</h4>
              <p className="text-xs text-ink/70 leading-relaxed whitespace-pre-line">{viewPropertyModal.description}</p>
            </div>

            {/* Amenities & Verification Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 bg-surface p-4 rounded-2xl border border-line">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink/70">Amenities ({viewPropertyModal.amenities.length})</h4>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {viewPropertyModal.amenities.map((a, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-page text-[11px] font-medium text-ink/70 border border-line">
                      ✓ {a}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2 bg-surface p-4 rounded-2xl border border-line">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink/70">Verification Checklist</h4>
                <div className="text-xs space-y-1.5 text-ink/70">
                  <div>Landlord Account ID: <strong className="text-ink">{viewPropertyModal.landlordId}</strong></div>
                  <div>Submission Date: <strong className="text-ink">{new Date(viewPropertyModal.createdAt).toLocaleDateString()}</strong></div>
                  <div className="text-emerald-700 font-semibold flex items-center gap-1.5 pt-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" /> Check for duplicate images & location authenticity
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-line">
              <button
                onClick={() => setViewPropertyModal(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-surface text-ink/70 font-semibold text-xs hover:bg-line transition-colors"
              >
                Close Inspection
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => {
                    handleRejectProperty(viewPropertyModal.id);
                    setViewPropertyModal(null);
                  }}
                  className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-accent/20 text-accent font-bold text-xs hover:bg-accent/30 transition-colors flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" /> Reject Listing
                </button>

                <button
                  onClick={() => {
                    handleApproveProperty(viewPropertyModal.id);
                    setViewPropertyModal(null);
                  }}
                  className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-emerald-500 text-ink font-extrabold text-xs hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve Listing
                </button>
              </div>
            </div>

          </div>
        </div>
      )}


      {/* EDIT LISTING MODAL */}
      {editProperty && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
          <form
            onSubmit={handleSavePropertyEdit}
            className="w-full max-w-2xl bg-surface border border-line rounded-2xl p-5 sm:p-6 space-y-4 my-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-ink">Edit Listing</h3>
                <p className="text-[11px] text-ink/70 font-mono">{editProperty.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditProperty(null)}
                className="p-2 rounded-xl bg-page hover:bg-page text-ink/70"
                aria-label="Close editor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] font-bold text-ink/70">Title</span>
                <input
                  required
                  value={editForm.title || ''}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-interactive"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-bold text-ink/70">Location</span>
                <input
                  required
                  value={editForm.location || ''}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-interactive"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-bold text-ink/70">City</span>
                <input
                  required
                  value={editForm.city || ''}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="w-full bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-interactive"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-bold text-ink/70">Monthly rent (GH₵)</span>
                <input
                  type="number"
                  min={1}
                  required
                  value={editForm.rentGhs ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, rentGhs: e.target.value })}
                  className="w-full bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-interactive"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-bold text-ink/70">Property type</span>
                <input
                  required
                  value={editForm.propertyType || ''}
                  onChange={(e) => setEditForm({ ...editForm, propertyType: e.target.value })}
                  className="w-full bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-interactive"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-bold text-ink/70">Bedrooms</span>
                <input
                  type="number"
                  min={0}
                  required
                  value={editForm.bedrooms ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, bedrooms: e.target.value })}
                  className="w-full bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-interactive"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-bold text-ink/70">Bathrooms</span>
                <input
                  type="number"
                  min={0}
                  required
                  value={editForm.bathrooms ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, bathrooms: e.target.value })}
                  className="w-full bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-interactive"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-bold text-ink/70">Availability</span>
                <select
                  value={editForm.availability || 'available'}
                  onChange={(e) => setEditForm({ ...editForm, availability: e.target.value })}
                  className="w-full bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-interactive"
                >
                  <option value="available">Available</option>
                  <option value="occupied">Occupied</option>
                  <option value="coming_soon">Coming soon</option>
                </select>
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="text-[11px] font-bold text-ink/70">Description</span>
                <textarea
                  rows={3}
                  required
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-interactive"
                />
              </label>

              <div className="space-y-2 sm:col-span-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[11px] font-bold text-ink/70">Listing images</span>
                  <span className="text-[10px] text-ink/70">
                    {(() => {
                      const list = String(editForm.images || '')
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean);
                      const fresh = list.filter((url) => !editSavedImages.includes(url)).length;
                      return `${list.length} image${list.length === 1 ? '' : 's'} · ${fresh} new`;
                    })()}
                  </span>
                </div>

                <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {String(editForm.images || '')
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((url, index) => {
                      const isSaved = editSavedImages.includes(url);
                      return (
                        <li key={`${url}-${index}`} className="relative rounded-xl border border-line overflow-hidden bg-page">
                          <div className="relative aspect-[4/3]">
                            <img src={url} alt={`Listing image ${index + 1}`} className="w-full h-full object-cover" />
                            <span
                              className={`absolute top-1 left-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                                isSaved ? 'bg-surface/95 text-ink/70 border-line' : 'bg-interactive text-ink border-interactive/40'
                              }`}
                            >
                              {isSaved ? 'Saved' : 'New'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const list = String(editForm.images || '')
                                  .split('\n')
                                  .map((value) => value.trim())
                                  .filter(Boolean)
                                  .filter((value, position) => position !== index);
                                setEditForm({ ...editForm, images: list.join('\n') });
                              }}
                              aria-label={`Remove image ${index + 1} from this listing`}
                              className="absolute top-1 right-1 p-1.5 rounded-full bg-surface/95 text-ink shadow-sm hover:bg-accent hover:text-white transition-colors min-h-[26px] min-w-[26px] flex items-center justify-center"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="px-1.5 py-1 text-[9px] text-ink/70 truncate" title={url}>
                            {isSaved ? 'Already on this listing' : 'Added now'}
                          </p>
                        </li>
                      );
                    })}
                </ul>

                <p className="text-[10px] text-ink/70 leading-snug">
                  Removing a tile takes that image out of the listing; the stored file is not deleted. Up to{' '}
                  {formatBytes(IMAGE_MAX_BYTES)} per file.
                </p>

                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-page border border-line text-[11px] font-bold text-ink cursor-pointer hover:border-interactive min-h-[40px]">
                  {editUploadingImages ? (
                    <span className="w-3.5 h-3.5 border-2 border-interactive/30 border-t-interactive rounded-full animate-spin" />
                  ) : (
                    <ImagePlus className="w-3.5 h-3.5" />
                  )}
                  {editUploadingImages ? 'Uploading…' : 'Add images from this device'}
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={editUploadingImages}
                    onChange={(event) => {
                      void addEditImages(event.target.files);
                      event.target.value = '';
                    }}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditProperty(null)}
                className="px-4 py-2.5 rounded-xl bg-surface text-ink/70 font-semibold text-xs hover:bg-line"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingEdit}
                className="gl-btn gl-btn-primary px-5 py-2.5 text-xs flex"
              >
                {isSavingEdit && <span className="w-3.5 h-3.5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
