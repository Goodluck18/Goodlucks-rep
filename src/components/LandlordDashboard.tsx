import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import type { IdentityVerification } from '../types';
import {
  Building2,
  PlusCircle,
  CheckCircle2,
  Trash2,
  Power,
  Calendar,
  User,
  Phone,
  Mail,
  ShieldCheck,
  AlertTriangle,
  Bell,
  ChevronRight,
  Check,
  ArrowRight,
  Ban,
  Clock,
} from 'lucide-react';
import { VerificationPanel } from './VerificationPanel';
import {
  Avatar,
  DashboardShell,
  EmptyState,
  SectionHeader,
  SummaryCard,
  dashboardNav,
} from './dashboard/DashboardShell';
import { NotificationsView } from './dashboard/NotificationsView';
import { AccountSettingsView } from './dashboard/AccountSettingsView';

const PROPERTY_STATUS_LABEL: Record<string, string> = {
  active: 'Approved & live',
  pending: 'Pending review',
  rejected: 'Rejected',
  rented: 'Rented',
  deactivated: 'Deactivated',
};

const PROPERTY_STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30',
  pending: 'bg-amber-500/20 text-amber-700 border border-amber-500/30',
  rejected: 'bg-accent/20 text-ink border border-accent/30',
  rented: 'bg-blue-500/20 text-blue-700 border border-blue-500/30',
  deactivated: 'bg-line text-ink/70',
};

const VERIFICATION_LABEL: Record<string, string> = {
  not_submitted: 'Not submitted',
  pending_review: 'Submitted — awaiting review',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  resubmission_required: 'More information needed',
};

/** Section keys this dashboard understands (kept in sync with routes.ts). */
const LANDLORD_SECTIONS = [
  'overview',
  'my-properties',
  'viewings',
  'identity',
  'notifications',
  'profile',
  'settings',
] as const;

export const LandlordDashboard: React.FC = () => {
  const {
    currentUser,
    properties,
    updatePropertyStatus,
    deleteProperty,
    setCurrentView,
    sectionTab,
    navigate,
    updateUserProfile,
    viewingSchedules,
    notifications,
    showErrorToast,
    showSuccessToast,
  } = useApp();

  // Section state comes from the URL (/landlord/properties, /landlord/viewings,
  // /landlord/settings) so it survives a refresh and Back.
  const activeSection = (sectionTab || 'overview') as (typeof LANDLORD_SECTIONS)[number];

  const [deleteModalPropId, setDeleteModalPropId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Landlord profile form
  const [profileName, setProfileName] = useState(currentUser?.name || '');
  const [profileCompany, setProfileCompany] = useState(currentUser?.company || '');
  const [profilePhone, setProfilePhone] = useState(currentUser?.phone || '');
  const [profileBio, setProfileBio] = useState(currentUser?.bio || '');

  // Keep the profile form in sync with the record returned by the API.
  useEffect(() => {
    if (!currentUser) return;
    setProfileName(currentUser.name || '');
    setProfileCompany(currentUser.company || '');
    setProfilePhone(currentUser.phone || '');
    setProfileBio(currentUser.bio || '');
  }, [currentUser]);

  // My properties — only the listings this landlord owns. The catalogue itself
  // is already scoped by the server; this extra filter keeps the rule obvious.
  const myProperties = currentUser ? properties.filter((p) => p.landlordId === currentUser.id) : [];
  const approvedProperties = myProperties.filter((p) => p.status === 'active');
  const pendingProperties = myProperties.filter((p) => p.status === 'pending');
  const rejectedProperties = myProperties.filter((p) => p.status === 'rejected');
  const totalViews = myProperties.reduce((acc, p) => acc + (p.viewsCount || 0), 0);

  // Viewings arrive from `GET /viewings`, which is scoped server-side to this
  // landlord's own properties.
  const upcomingViewings = viewingSchedules
    .filter((v) => !v.isTerminal && (v.isConfirmed || v.status === 'viewing_requested' || v.status === 'proposed'))
    .slice(0, 4);

  const unreadNotifications = notifications.filter((n) => !n.read).length;

  // Identity verification state (optional for landlords; never proof of ownership).
  const [identityStatus, setIdentityStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'landlord') return;
    let cancelled = false;
    api
      .getVerification()
      .then((result) => {
        if (!cancelled) setIdentityStatus((result.verification.identity as IdentityVerification)?.status || null);
      })
      .catch(() => {
        if (!cancelled) setIdentityStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const handleDeleteConfirm = async () => {
    if (!deleteModalPropId) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await deleteProperty(deleteModalPropId);
      setDeleteModalPropId(null);
    } catch (error) {
      setActionError(messageForError(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (id: string, status: 'active' | 'deactivated' | 'rented') => {
    setActionError(null);
    try {
      await updatePropertyStatus(id, status);
    } catch (error) {
      setActionError(messageForError(error));
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setActionError(null);
    // The email address is shown on the profile but is not part of the server's
    // profile allow-list; it is changed through support, never here.
    const result = await updateUserProfile({
      name: profileName,
      company: profileCompany,
      phone: profilePhone,
      bio: profileBio,
    });
    setIsSavingProfile(false);
    if (!result.ok) {
      showErrorToast('Profile not saved', result.error || 'Please check your details and try again.');
      return;
    }
    setSaveSuccess(true);
    showSuccessToast('Profile updated', 'Your contact details were saved.');
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const navItems = dashboardNav('landlord', { unreadNotifications });

  return (
    <DashboardShell role="landlord" active={activeSection} items={navItems}>
      {actionError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* ============================= OVERVIEW =========================== */}
      {activeSection === 'overview' && (
        <div className="space-y-5 animate-fadeIn">
          <SectionHeader
            title={`Welcome back, ${currentUser?.name?.split(' ')[0] || 'there'}`}
            description="Your listings, their review status, upcoming viewings and payment records — each on its own page."
            actions={
              <button
                type="button"
                onClick={() => setCurrentView('list-property')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-interactive text-ink text-xs font-extrabold hover:bg-interactive/90 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                List a property
              </button>
            }
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <SummaryCard
              label="Total listings"
              value={myProperties.length}
              hint={`${totalViews.toLocaleString()} views recorded`}
              icon={Building2}
              onClick={() => navigate('/landlord/properties')}
            />
            <SummaryCard
              label="Approved & live"
              value={approvedProperties.length}
              hint="Visible on the public site"
              icon={CheckCircle2}
              tone="positive"
              onClick={() => navigate('/landlord/properties')}
            />
            <SummaryCard
              label="Pending approval"
              value={pendingProperties.length}
              hint="In the review queue"
              icon={Clock}
              tone="warning"
              onClick={() => navigate('/landlord/properties')}
            />
            <SummaryCard
              label="Rejected"
              value={rejectedProperties.length}
              hint={rejectedProperties.length > 0 ? 'Open the listing for the reason' : 'None'}
              icon={Ban}
              tone={rejectedProperties.length > 0 ? 'rose' : 'default'}
              onClick={() => navigate('/landlord/properties')}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Upcoming viewings */}
            <section className="lg:col-span-2 bg-surface border border-line rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink">Upcoming viewings</h2>
                <button
                  type="button"
                  onClick={() => navigate('/landlord/viewings')}
                  className="text-[11px] font-bold text-ink/70 hover:text-ink flex items-center gap-1"
                >
                  All viewings <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              {upcomingViewings.length === 0 ? (
                <p className="text-[11px] text-ink/70 leading-relaxed">
                  No viewing has been requested for your listings yet. Requests appear here once a tenant asks for one.
                </p>
              ) : (
                <ul className="space-y-2">
                  {upcomingViewings.map((v) => (
                    <li key={v.id} className="bg-surface border border-line rounded-xl px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-ink truncate">{v.propertyTitle}</p>
                          <p className="text-[11px] text-ink/70">
                            {v.isConfirmed ? 'Agreed for' : 'Requested for'} {v.date || 'date to agree'}
                            {v.time ? ` at ${v.time}` : ''} · {v.statusLabel}
                          </p>
                        </div>
                        <span className="text-[10px] text-ink/70 shrink-0">
                          {v.assignedAgent || 'No agent assigned'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Notifications + verification status */}
            <div className="space-y-4">
              <section className="bg-surface border border-line rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-ink" />
                    <h2 className="text-xs font-bold text-ink">Notifications</h2>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-interactive/20 text-ink">
                    {unreadNotifications} unread
                  </span>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-[11px] text-ink/70 leading-relaxed">
                    Nothing yet. Listing reviews and viewing updates will appear here.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {notifications.slice(0, 2).map((n) => (
                      <li key={n.id} className="text-[11px] text-ink/70 truncate">
                        <span className={n.read ? '' : 'text-ink font-bold'}>{n.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => navigate('/landlord/notifications')}
                  className="text-[11px] font-bold text-ink hover:underline"
                >
                  View all notifications
                </button>
              </section>

              <section className="bg-surface border border-line rounded-2xl p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-ink" />
                  <h2 className="text-xs font-bold text-ink">Verification</h2>
                </div>
                <p className="text-xs font-bold text-ink">
                  Identity: {identityStatus ? VERIFICATION_LABEL[identityStatus] || identityStatus : 'Not submitted'}
                </p>
                <p className="text-[11px] text-ink/70 leading-relaxed">
                  Optional. Verifying your identity does not prove that you own a particular property, and no listing
                  is marked verified because of it.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/landlord/verification')}
                  className="text-[11px] font-bold text-ink hover:underline"
                >
                  Open verification
                </button>
              </section>
            </div>
          </div>

          {/* Quick links */}
          <section className="bg-surface border border-line rounded-2xl p-5 space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink">Quick links</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => navigate('/landlord/profile')}
                className="px-3 py-2.5 rounded-xl bg-surface border border-line text-xs font-bold text-ink hover:border-interactive/40 transition-colors flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5 text-ink" /> Profile
              </button>
              <button
                type="button"
                onClick={() => navigate('/landlord/settings')}
                className="px-3 py-2.5 rounded-xl bg-surface border border-line text-xs font-bold text-ink hover:border-interactive/40 transition-colors flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-ink" /> Password & picture
              </button>
            </div>
          </section>
        </div>
      )}

      {/* =========================== MY PROPERTIES ======================== */}
      {activeSection === 'my-properties' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader
            title="My properties"
            description="Every listing you own and its current review status. Approval is decided by Goodlucks staff."
            actions={
              <button
                type="button"
                onClick={() => setCurrentView('list-property')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-interactive text-ink text-xs font-extrabold hover:bg-interactive/90 transition-colors"
              >
                <PlusCircle className="w-4 h-4" /> Add listing
              </button>
            }
          />

          {myProperties.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No properties yet"
              description="List your first property. It receives a review before it appears publicly."
              action={
                <button
                  type="button"
                  onClick={() => setCurrentView('list-property')}
                  className="px-5 py-2.5 rounded-xl bg-interactive text-ink text-xs font-black"
                >
                  List a property
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {myProperties.map((prop) => (
                <div
                  key={prop.id}
                  className="bg-surface border border-line rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                    {prop.images?.[0] ? (
                      <img
                        src={prop.images[0]}
                        alt={prop.title}
                        loading="lazy"
                        decoding="async"
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-line shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-surface border border-line flex items-center justify-center shrink-0">
                        <Building2 className="w-6 h-6 text-ink/70" />
                      </div>
                    )}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            PROPERTY_STATUS_TONE[prop.status] || PROPERTY_STATUS_TONE.deactivated
                          }`}
                        >
                          {PROPERTY_STATUS_LABEL[prop.status] || prop.status}
                        </span>
                        <span className="text-[11px] text-ink/70 font-medium">{prop.propertyType}</span>
                      </div>
                      <h3 className="font-bold text-sm sm:text-base text-ink break-words">{prop.title}</h3>
                      <div className="text-xs text-ink/70 font-medium">
                        {prop.location} ·{' '}
                        <strong className="text-ink">GH₵ {prop.rentGhs.toLocaleString()}/mo</strong>
                      </div>
                      {/* Task 03 update: the viewing fee is set by Goodlucks Homes, not
                          by the landlord. Shown read-only so nothing suggests otherwise. */}
                      <p className="text-[11px] text-ink/70 leading-relaxed">
                        Viewing fee:{' '}
                        {prop.viewingTerms?.feeGhs ? (
                          <>
                            <strong className="text-ink">GH₵ {prop.viewingTerms.feeGhs.toLocaleString()}</strong> — set by
                            Goodlucks Homes and paid to Goodlucks after the viewing. You don't receive it and you can't
                            change it.
                          </>
                        ) : (
                          <>not set yet — Goodlucks Homes sets the viewing fee for every landlord listing.</>
                        )}
                      </p>
                      {prop.status === 'rejected' && prop.rejectionReason && (
                        <p className="text-[11px] text-ink leading-relaxed break-words">
                          Reason given: {prop.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-line">
                    {prop.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(prop.id, 'deactivated')}
                        className="px-3 py-1.5 rounded-lg bg-surface text-ink/70 hover:text-ink text-xs font-semibold flex items-center gap-1 border border-line"
                      >
                        <Power className="w-3.5 h-3.5" /> Deactivate
                      </button>
                    ) : prop.status === 'deactivated' ? (
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(prop.id, 'active')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30 text-xs font-semibold flex items-center gap-1 border border-emerald-500/30"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Reactivate
                      </button>
                    ) : (
                      <span className="text-[11px] text-ink/70">
                        {prop.status === 'pending' ? 'Waiting for review' : 'Not currently live'}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleStatusChange(prop.id, 'rented')}
                      className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-700 hover:bg-blue-500/30 text-xs font-semibold flex items-center gap-1 border border-blue-500/30"
                    >
                      Mark rented
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteModalPropId(prop.id)}
                      className="px-3 py-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 text-xs font-semibold flex items-center gap-1 border border-accent/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================= VIEWINGS =========================== */}
      {activeSection === 'viewings' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader
            title="Viewings"
            description="Viewings arranged for your properties. A request is not a booking until a time is agreed."
          />
          {viewingSchedules.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No viewings yet"
              description="When a tenant requests a viewing for one of your properties, it appears here."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {viewingSchedules.map((v) => (
                <div key={v.id} className="bg-surface p-5 rounded-2xl border border-line space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-ink truncate">{v.propertyTitle}</div>
                      <div className="text-xs text-ink/70 font-medium">
                        {v.isConfirmed ? 'Agreed for' : 'Requested for'}: {v.date || '—'} {v.time ? `at ${v.time}` : ''}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-page text-ink border border-line shrink-0">
                      {v.statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-ink/70 leading-relaxed">
                    Viewing agent: <strong className="text-ink">{v.assignedAgent || 'not yet assigned'}</strong>.{' '}
                    {v.isConfirmed ? 'A time has been agreed.' : 'No time has been agreed yet.'}{' '}
                    {v.feeSource === 'platform_policy' ? (
                      <>
                        Viewing fee:{' '}
                        <strong className="text-emerald-700">
                          {v.feeAmountGhs > 0 ? `GH₵ ${v.feeAmountGhs.toLocaleString()}` : 'none'}
                        </strong>
                        , set by Goodlucks Homes and paid to Goodlucks after the viewing —{' '}
                        {v.viewingFeePaid ? 'recorded as received.' : 'not yet recorded.'} You don't receive it.
                      </>
                    ) : (
                      <>
                        Viewing fee:{' '}
                        <strong className="text-emerald-700">
                          {v.viewingFeePaid ? 'recorded as collected on site by the agent' : 'not recorded'}
                        </strong>
                        . Goodlucks did not take this payment.
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================== VERIFICATION ========================= */}
      {activeSection === 'identity' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader
            title="Verification"
            description="Identity verification is optional for landlords."
          />
          <div className="bg-surface border border-line rounded-2xl p-4">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-ink" /> Identity verification is optional
            </h2>
            <p className="text-[11px] text-ink/70 mt-1 leading-relaxed">
              You can register and list properties without it. Verifying your identity does not verify that you own or
              may let any particular property — ownership is a separate question and no listing is marked verified
              because of this check.
            </p>
          </div>
          <VerificationPanel scope="landlord" />
        </div>
      )}

      {/* ========================== NOTIFICATIONS ========================= */}
      {activeSection === 'notifications' && <NotificationsView role="landlord" />}

      {/* ============================= PROFILE ============================ */}
      {activeSection === 'profile' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader
            title="Profile"
            description="How you appear to Goodlucks staff and, where relevant, to tenants viewing your listings. Your picture and password are on Account settings."
            actions={
              <button
                type="button"
                onClick={() => navigate('/landlord/settings')}
                className="px-3.5 py-2 rounded-xl bg-page border border-line text-xs font-bold text-ink hover:text-ink hover:bg-page transition-colors"
              >
                Account settings
              </button>
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-surface border border-line rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <User className="w-4 h-4 text-ink" /> Your details
                </h2>
                {saveSuccess && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label htmlFor="landlord-profile-name" className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Full name
                  </label>
                  <input
                    id="landlord-profile-name"
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>

                <div>
                  <label htmlFor="landlord-profile-company" className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Company / agency name (optional)
                  </label>
                  <input
                    id="landlord-profile-company"
                    type="text"
                    value={profileCompany}
                    onChange={(e) => setProfileCompany(e.target.value)}
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="landlord-profile-phone" className="block text-xs font-semibold text-ink/70 mb-1.5">
                      Phone number
                    </label>
                    <input
                      id="landlord-profile-phone"
                      type="tel"
                      required
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                    />
                  </div>

                  <div>
                    <label htmlFor="landlord-profile-email" className="block text-xs font-semibold text-ink/70 mb-1.5">
                      Email address
                    </label>
                    <input
                      id="landlord-profile-email"
                      type="email"
                      value={currentUser?.email || ''}
                      readOnly
                      aria-describedby="landlord-profile-email-hint"
                      className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink/70 cursor-not-allowed"
                    />
                    <p id="landlord-profile-email-hint" className="text-[10px] text-ink/70 mt-1">
                      Contact Goodlucks Homes support to change the email on your account.
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="landlord-profile-bio" className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Landlord bio / overview
                  </label>
                  <textarea
                    id="landlord-profile-bio"
                    rows={3}
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="gl-btn gl-btn-primary w-full sm:w-auto px-5 py-2.5 text-sm"
                >
                  {isSavingProfile ? 'Saving…' : 'Save profile'}
                </button>
              </form>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 space-y-3">
              <Avatar name={currentUser?.name} src={currentUser?.avatar} size="lg" />
              <div>
                <p className="text-sm font-bold text-ink truncate">{currentUser?.name}</p>
                <p className="text-[11px] text-ink font-semibold">{currentUser?.company || 'Landlord account'}</p>
              </div>
              <div className="text-[11px] text-ink/70 space-y-1">
                <p className="flex items-center gap-1.5 break-all">
                  <Mail className="w-3 h-3 shrink-0" /> {currentUser?.email}
                </p>
                <p className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3 shrink-0" /> {currentUser?.phone || 'No phone saved'}
                </p>
              </div>
              <p className="text-[11px] text-ink/70 leading-relaxed">
                Your profile picture is used next to your name. Change it, or your password, in Account settings.
              </p>
              <button
                type="button"
                onClick={() => navigate('/landlord/settings')}
                className="w-full px-3 py-2 rounded-xl bg-page border border-line text-xs font-bold text-ink hover:text-ink hover:bg-page transition-colors"
              >
                Open account settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================ SETTINGS ============================ */}
      {activeSection === 'settings' && <AccountSettingsView role="landlord" />}

      {!LANDLORD_SECTIONS.includes(activeSection) && (
        <EmptyState
          icon={ChevronRight}
          title="This section does not exist"
          action={
            <button
              type="button"
              onClick={() => navigate('/landlord/dashboard')}
              className="text-xs font-bold text-ink hover:underline"
            >
              Back to overview
            </button>
          }
        />
      )}

      {/* Delete confirmation */}
      {deleteModalPropId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-start sm:items-center justify-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete property listing"
            className="bg-surface border border-accent/40 rounded-2xl sm:rounded-2xl p-5 sm:p-6 max-w-md w-full text-center space-y-4 shadow-lg my-auto max-h-[88dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-accent/20 text-accent border border-accent/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-ink">Delete this listing?</h3>
            <p className="text-xs text-ink/70 leading-relaxed">
              This removes the listing from Goodlucks Homes. It cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalPropId(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface text-ink/70 font-semibold text-xs hover:bg-line"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteConfirm()}
                disabled={isDeleting}
                className="flex-1 gl-btn gl-btn-primary text-xs"
              >
                {isDeleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
};
