import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, messageForError, PropertyMatch } from '../services/apiService';
import type { ViewingSchedule } from '../types';
import { PropertyCard } from './PropertyCard';
import {
  User,
  Clock,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Calendar,
  Heart,
  Bell,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Phone,
  Mail,
  Edit,
  Plus,
  Search,
  Check,
  FileCheck,
  ArrowRight,
} from 'lucide-react';
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

const VIEWING_TONES: Record<ViewingSchedule['status'], string> = {
  enquiry_received: 'bg-slate-500/20 text-slate-200 border-white/10',
  viewing_requested: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  awaiting_agent: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  proposed: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  confirmed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  reschedule_requested: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rescheduled: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-slate-600/20 text-slate-300 border-white/10',
  completed: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20',
  tenant_no_show: 'bg-[#FF2E63]/15 text-[#FF8FA8] border-[#FF2E63]/30',
  agent_no_show: 'bg-[#FF2E63]/15 text-[#FF8FA8] border-[#FF2E63]/30',
  could_not_proceed: 'bg-[#FF2E63]/10 text-[#FF8FA8] border-[#FF2E63]/20',
};

/**
 * One viewing request, from the tenant's side.
 *
 * The wording matters: a request is not a booking, "confirmed" means a time was
 * agreed, and a fee is only ever shown as recorded by staff — never as paid by
 * the tenant through the platform.
 */
const TenantViewingCard: React.FC<{ viewing: ViewingSchedule; onOpenProperty: (id: string) => void }> = ({
  viewing,
  onOpenProperty,
}) => {
  const { runViewingAction, refreshViewings, showErrorToast } = useApp();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(viewing.preferredDate || viewing.date);
  const [time, setTime] = useState(viewing.preferredTime || viewing.time);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (action: 'cancel' | 'request-reschedule' | 'confirm' | 'no-show') => {
    setBusy(action);
    const result = await runViewingAction(
      viewing.id,
      action,
      action === 'cancel'
        ? { reason: note || 'Cancelled by the tenant', note: note || undefined }
        : action === 'request-reschedule'
          ? { date, time, note: note || undefined }
          : action === 'no-show'
            ? { who: 'agent', note: note || undefined }
            : { note: note || undefined }
    );
    setBusy(null);
    if (!result.ok) {
      showErrorToast('That did not go through', result.error || 'Please try again.');
      return;
    }
    setNote('');
    setOpen(false);
    await refreshViewings();
  };

  return (
    <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-3 shadow-lg">
      <div className="flex justify-between items-start gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
            {viewing.requestType === 'enquiry' ? 'Property enquiry' : 'Viewing request'}
          </span>
          <h3 className="text-base font-bold text-white">{viewing.propertyTitle}</h3>
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
            <MapPin className="w-3.5 h-3.5 text-[#08D9D6]" /> {viewing.propertyLocation}
          </p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${VIEWING_TONES[viewing.status]}`}>
          {viewing.statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-950/80 p-3 rounded-xl border border-white/5">
        <div>
          <div className="text-slate-400">{viewing.isConfirmed ? 'Agreed date & time' : 'Requested date & time'}</div>
          <div className="font-bold text-white">
            {viewing.date || '—'} {viewing.time ? `at ${viewing.time}` : ''}
          </div>
        </div>
        <div>
          <div className="text-slate-400">Agent</div>
          <div className="font-bold text-white">{viewing.assignedAgent || 'No named agent assigned yet'}</div>
        </div>
      </div>

      {!viewing.isConfirmed && !viewing.isTerminal && (
        <p className="text-[11px] text-amber-300/90">
          Not confirmed yet. The agent will contact you to agree a time; until then nothing is booked.
        </p>
      )}
      {viewing.cancelReason && (
        <p className="text-[11px] text-[#FF8FA8]">Cancellation reason: {viewing.cancelReason}</p>
      )}
      <p className="text-[11px] text-slate-500">
        {viewing.viewingFeePaid
          ? 'Staff have recorded a viewing fee collected by the agent on site. Goodlucks did not take this payment.'
          : 'No viewing fee has been recorded. Any fee is agreed with the agent and paid on site.'}
      </p>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={() => onOpenProperty(viewing.propertyId)}
          className="text-[#08D9D6] font-semibold text-xs hover:underline"
        >
          View property
        </button>
        {!viewing.isTerminal && (
          <button
            onClick={() => setOpen((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold"
          >
            {open ? 'Close' : 'Change or cancel'}
          </button>
        )}
      </div>

      {open && !viewing.isTerminal && (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setDate(event.target.value)}
              className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white"
            />
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white"
            />
          </div>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add a note (e.g. why the time no longer works)"
            className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white"
          />
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy !== null}
              onClick={() => void run('request-reschedule')}
              className="px-3 py-1.5 rounded-lg bg-[#08D9D6]/15 text-[#08D9D6] text-[11px] font-bold disabled:opacity-50"
            >
              {busy === 'request-reschedule' ? 'Sending…' : 'Ask for another time'}
            </button>
            {viewing.status === 'proposed' && (
              <button
                disabled={busy !== null}
                onClick={() => void run('confirm')}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 text-[11px] font-bold disabled:opacity-50"
              >
                Accept this time
              </button>
            )}
            {viewing.isConfirmed && (
              <button
                disabled={busy !== null}
                onClick={() => void run('no-show')}
                className="px-3 py-1.5 rounded-lg bg-[#FF2E63]/15 text-[#FF8FA8] text-[11px] font-bold disabled:opacity-50"
              >
                The agent did not attend
              </button>
            )}
            <button
              disabled={busy !== null}
              onClick={() => void run('cancel')}
              className="px-3 py-1.5 rounded-lg bg-[#FF2E63]/15 text-[#FF8FA8] text-[11px] font-bold disabled:opacity-50"
            >
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel request'}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            Asking for another time does not move the appointment. It stays where it is until the agent proposes a new
            slot and it is agreed.
          </p>
        </div>
      )}
    </div>
  );
};

export const TenantDashboard: React.FC = () => {
  const {
    currentUser,
    tenantRequests,
    properties,
    viewingSchedules,
    savedPropertyIds,
    searchAlerts,
    unsubscribeFromSearchAlerts,
    notifications,
    setCurrentView,
    sectionTab,
    navigate,
    updateUserProfile,
    navigateToProperty,
    showErrorToast,
    showSuccessToast,
  } = useApp();

  // The active section lives in the URL (/tenant/viewings, /tenant/settings…),
  // so a refresh, a shared link and Back all return to the same place.
  const activeSection = (sectionTab || 'overview') as
    | 'overview'
    | 'requests'
    | 'matches'
    | 'viewings'
    | 'saved'
    | 'alerts'
    | 'notifications'
    | 'profile'
    | 'settings';

  const [profileName, setProfileName] = useState(currentUser?.name || '');
  const [profilePhone, setProfilePhone] = useState(currentUser?.phone || '');
  const [profileAddress, setProfileAddress] = useState(currentUser?.address || '');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    setProfileName(currentUser.name || '');
    setProfilePhone(currentUser.phone || '');
    setProfileAddress(currentUser.address || '');
  }, [currentUser]);

  const myRequests = tenantRequests.filter(
    (r) => r.tenantId === currentUser?.id || (!!currentUser?.email && r.tenantEmail === currentUser.email)
  );
  const activeRequest = myRequests[0];

  const myViewings = viewingSchedules.filter((v) => v.tenantName === currentUser?.name || v.tenantPhone === currentUser?.phone);
  const savedProps = properties.filter((p) => savedPropertyIds.includes(p.id));
  const unreadNotifications = notifications.filter((n) => !n.read).length;

  // Real match scores from the backend (the same engine the listing page uses),
  // so this dashboard never invents a percentage. Staff-curated matches come
  // back first, then the best-scoring live listings.
  const [matches, setMatches] = useState<PropertyMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setMatches([]);
      setMatchesLoading(false);
      return;
    }

    let cancelled = false;
    setMatchesLoading(true);
    api
      .matches()
      .then((result) => {
        if (!cancelled) setMatches(result.matches ?? []);
      })
      .catch(() => {
        if (!cancelled) setMatches([]);
      })
      .finally(() => {
        if (!cancelled) setMatchesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, activeRequest?.id]);

  const matchedProps = matches.map((match) => match.property);
  const topMatchScore = matches[0]?.score ?? 0;

  const TIMELINE_STEPS = [
    { key: 'submitted', label: 'Request submitted', desc: 'Received by Goodlucks' },
    { key: 'searching', label: 'Searching', desc: 'Matching properties' },
    { key: 'matched', label: 'Property found', desc: 'Matches proposed' },
    { key: 'viewing_scheduled', label: 'Viewing requested', desc: 'Waiting for the agent to agree a time' },
    { key: 'completed', label: 'Completed', desc: 'Tenancy arranged outside Goodlucks' },
  ];

  const getStepStatus = (stepKey: string) => {
    const currentStatus = activeRequest?.status || 'submitted';
    const stepOrder = ['submitted', 'searching', 'matched', 'viewing_scheduled', 'completed'];
    const currentIndex = stepOrder.indexOf(currentStatus);
    const stepIndex = stepOrder.indexOf(stepKey);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setActionError(null);
    // Email is not part of the server's profile allow-list: it is shown on the
    // profile page but changed through support, never silently edited here.
    const result = await updateUserProfile({
      name: profileName,
      phone: profilePhone,
      address: profileAddress,
    });
    setIsSavingProfile(false);
    if (!result.ok) {
      setActionError(result.error || 'Could not save your profile.');
      showErrorToast('Profile not saved', result.error || 'Please check your details and try again.');
      return;
    }
    setSaveSuccess(true);
    showSuccessToast('Profile updated', 'Your contact details were saved.');
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleUnsubscribe = async (alertId: string) => {
    setActionError(null);
    try {
      await unsubscribeFromSearchAlerts(alertId);
    } catch (error) {
      const message = messageForError(error);
      setActionError(message);
      showErrorToast('Could not remove alert', message);
    }
  };

  const navItems = dashboardNav('tenant', { unreadNotifications });

  return (
    <DashboardShell role="tenant" active={activeSection} items={navItems}>
      {actionError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-[#FF2E63]/15 border border-[#FF2E63]/30 text-[#FF8FA8] text-xs flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* ============================ OVERVIEW ============================ */}
      {activeSection === 'overview' && (
        <div className="space-y-5 animate-fadeIn">
          <SectionHeader
            title={`Welcome back, ${currentUser?.name?.split(' ')[0] || 'there'}`}
            description="Your rental request, matched homes, viewings and saved properties — each section has its own page."
            actions={
              <button
                type="button"
                onClick={() => setCurrentView('find-home')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-extrabold hover:bg-[#08D9D6]/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New rental request
              </button>
            }
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <SummaryCard
              label="Rental request"
              value={activeRequest ? activeRequest.status.replace('_', ' ') : 'None yet'}
              hint={activeRequest ? 'Open the request tracker' : 'Tell us what you need'}
              icon={Clock}
              onClick={() => navigate('/tenant/rental-requests')}
            />
            <SummaryCard
              label="Matched properties"
              value={matchedProps.length}
              hint={matchesLoading ? 'Scoring homes…' : topMatchScore > 0 ? `Top score ${topMatchScore}%` : 'No matches yet'}
              icon={Sparkles}
              onClick={() => navigate('/tenant/matches')}
            />
            <SummaryCard
              label="Viewing requests"
              value={myViewings.length}
              hint={myViewings.length > 0 ? 'See where each one stands' : 'None requested yet'}
              icon={Calendar}
              onClick={() => navigate('/tenant/viewings')}
            />
            <SummaryCard
              label="Saved properties"
              value={savedProps.length}
              hint="Homes you kept"
              icon={Heart}
              onClick={() => navigate('/tenant/saved-properties')}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Account card */}
            <section className="lg:col-span-2 bg-[#252A34]/70 border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-start gap-4">
                <Avatar name={currentUser?.name} src={currentUser?.avatar} size="lg" />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black text-white truncate">{currentUser?.name || 'Your account'}</h2>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-[#08D9D6]/20 text-[#08D9D6] border border-[#08D9D6]/30">
                      Tenant
                    </span>
                  </div>
                  {currentUser?.address && (
                    <p className="text-xs text-slate-300 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#08D9D6]" /> {currentUser.address}
                    </p>
                  )}
                  <div className="text-xs text-slate-400 flex flex-wrap gap-3 pt-1">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-[#08D9D6]" /> {currentUser?.phone || 'No phone saved'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3 text-[#08D9D6]" /> {currentUser?.email}
                    </span>
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">Profile and account settings are separate pages.</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/tenant/profile')}
                    className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors flex items-center gap-1.5"
                  >
                    <Edit className="w-3.5 h-3.5 text-[#08D9D6]" />
                    Edit profile
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/tenant/settings')}
                    className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 font-bold text-xs transition-colors"
                  >
                    Settings
                  </button>
                </div>
              </div>
            </section>

            {/* Recent notifications — nothing is marked read by viewing this. */}
            <section className="bg-[#252A34]/70 border border-white/10 rounded-2xl p-5 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#08D9D6]" />
                    <h2 className="text-xs font-bold text-white">Notifications</h2>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#08D9D6]/20 text-[#08D9D6]">
                    {unreadNotifications} unread
                  </span>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    No notifications yet. Viewing updates and account changes will appear here.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-[132px] overflow-y-auto pr-1">
                    {notifications.slice(0, 3).map((notif) => (
                      <li key={notif.id} className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 space-y-0.5">
                        <div className="text-[11px] font-bold text-white truncate">{notif.title}</div>
                        <div className="text-[10px] text-slate-400 line-clamp-1">{notif.message}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={() => navigate('/tenant/notifications')}
                className="text-[11px] font-bold text-[#08D9D6] hover:underline flex items-center gap-1 self-start"
              >
                View all notifications <ArrowRight className="w-3 h-3" />
              </button>
            </section>
          </div>

          {/* Quick actions */}
          <section className="bg-[#252A34]/70 border border-white/10 rounded-2xl p-5 space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#08D9D6]">Quick actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => navigate('/tenant/search-alerts')}
                className="px-3 py-2.5 rounded-xl bg-slate-900/70 border border-white/10 text-xs font-bold text-white hover:border-[#08D9D6]/40 transition-colors flex items-center justify-between gap-2"
              >
                <span className="flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-[#08D9D6]" /> Search alerts
                </span>
                <span className="text-slate-500">{searchAlerts.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('browse')}
                className="px-3 py-2.5 rounded-xl bg-slate-900/70 border border-white/10 text-xs font-bold text-white hover:border-[#08D9D6]/40 transition-colors flex items-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5 text-[#08D9D6]" /> Browse properties
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('receipts')}
                className="px-3 py-2.5 rounded-xl bg-slate-900/70 border border-white/10 text-xs font-bold text-white hover:border-[#08D9D6]/40 transition-colors flex items-center gap-1.5"
              >
                <FileCheck className="w-3.5 h-3.5 text-[#08D9D6]" /> My payment records
              </button>
            </div>
          </section>
        </div>
      )}

      {/* ======================== RENTAL REQUEST ========================= */}
      {activeSection === 'requests' && (
        <div className="space-y-5 animate-fadeIn">
          <SectionHeader
            title="Rental request"
            description="Your active search criteria and where the request currently stands."
          />

          {!activeRequest ? (
            <EmptyState
              icon={Clock}
              title="No rental request yet"
              description="Tell us your budget, preferred areas and bedrooms, and we will match live listings against your request."
              action={
                <button
                  type="button"
                  onClick={() => setCurrentView('find-home')}
                  className="px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs"
                >
                  Start a rental request
                </button>
              }
            />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#08D9D6] uppercase tracking-wider">Search criteria</div>
                  <h2 className="text-lg font-bold text-white mt-0.5 break-words">
                    Target areas: {activeRequest.preferredLocations?.join(', ') || 'Not stated'}
                  </h2>
                </div>
                <div className="text-xs bg-slate-900/90 px-3.5 py-2 rounded-xl border border-white/10 text-slate-300 shrink-0">
                  Budget:{' '}
                  <strong className="text-[#08D9D6]">
                    GH₵ {activeRequest.budgetMin?.toLocaleString()} – GH₵ {activeRequest.budgetMax?.toLocaleString()} / mo
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {TIMELINE_STEPS.map((step, idx) => {
                  const status = getStepStatus(step.key);
                  return (
                    <div
                      key={step.key}
                      className={`p-4 rounded-2xl border ${
                        status === 'completed'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : status === 'current'
                            ? 'bg-[#08D9D6]/20 border-[#08D9D6] text-[#08D9D6]'
                            : 'bg-slate-900/50 border-white/5 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Step 0{idx + 1}</span>
                        {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {status === 'current' && <Clock className="w-4 h-4 text-[#08D9D6] animate-pulse" />}
                      </div>
                      <div className="font-bold text-xs text-white">{step.label}</div>
                      <div className="text-[10px] text-slate-400 mt-1">{step.desc}</div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-[#08D9D6]/10 border border-[#08D9D6]/30 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-200">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-[#08D9D6] shrink-0" />
                  <span>
                    Assigned agent: <strong className="text-white">{activeRequest.assignedAgent || 'No named agent assigned yet'}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/tenant/matches')}
                  className="text-[#08D9D6] font-bold underline hover:text-white shrink-0"
                >
                  Explore matched homes →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================ MATCHES ============================ */}
      {activeSection === 'matches' && (
        <div className="space-y-5 animate-fadeIn">
          <SectionHeader
            title="Matched properties"
            description="Live listings scored against your request's budget, bedrooms and preferred areas."
            actions={
              <span className="px-3 py-1 rounded-full bg-[#08D9D6]/20 text-[#08D9D6] text-xs font-bold border border-[#08D9D6]/30">
                {matchedProps.length} {matchedProps.length === 1 ? 'match' : 'matches'}
              </span>
            }
          />

          {matches.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
              {matches.map(({ property, score, reason, curated }) => (
                <div key={property.id} className="relative">
                  <div
                    title={reason}
                    className={`absolute top-3 left-3 z-20 font-black text-[10px] px-2 py-0.5 rounded-md shadow-md flex items-center gap-1 ${
                      curated ? 'bg-[#08D9D6] text-[#252A34]' : 'bg-emerald-500 text-slate-950'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    {curated ? 'Chosen for you' : `${score}% match`}
                  </div>
                  <PropertyCard property={property} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Sparkles}
              title={matchesLoading ? 'Scoring listings…' : 'No matches to show yet'}
              description={
                activeRequest
                  ? 'We score every live listing against your budget, bedrooms and preferred areas. Check back soon.'
                  : 'Tell us your budget, preferred areas and bedrooms and we will score every live listing against your request.'
              }
              action={
                !activeRequest ? (
                  <button
                    type="button"
                    onClick={() => setCurrentView('find-home')}
                    className="px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs"
                  >
                    Start a rental request
                  </button>
                ) : undefined
              }
            />
          )}
        </div>
      )}

      {/* ============================ VIEWINGS =========================== */}
      {activeSection === 'viewings' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader
            title="Viewings"
            description="A request is not a booking. It becomes a confirmed appointment when you and the agent agree a time."
          />

          {myViewings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myViewings.map((v) => (
                <TenantViewingCard key={v.id} viewing={v} onOpenProperty={navigateToProperty} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title="No viewing requests yet"
              description='Browse properties and choose "Request viewing" to ask an agent for a physical viewing.'
              action={
                <button
                  type="button"
                  onClick={() => setCurrentView('browse')}
                  className="px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs"
                >
                  Browse properties
                </button>
              }
            />
          )}
        </div>
      )}

      {/* ============================= SAVED ============================= */}
      {activeSection === 'saved' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader title="Saved properties" description="Homes you kept for later." />
          {savedProps.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
              {savedProps.map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Heart}
              title="No saved properties"
              description="Use the heart on any property card to keep it here."
            />
          )}
        </div>
      )}

      {/* ========================= SEARCH ALERTS ========================= */}
      {activeSection === 'alerts' && (
        <div className="space-y-5 animate-fadeIn">
          <SectionHeader
            title="Search alerts"
            description="Active email subscriptions you have set up for new listings."
            actions={
              <button
                type="button"
                onClick={() => setCurrentView('browse')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-black hover:bg-[#08D9D6]/90 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add search alert
              </button>
            }
          />

          {searchAlerts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {searchAlerts.map((alert) => (
                <div key={alert.id} className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-[#08D9D6]/15 text-[#08D9D6] border border-[#08D9D6]/30 shrink-0">
                        <Bell className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-white truncate">
                          {alert.location === 'All' ? 'Greater Accra' : alert.location} ({alert.propertyType})
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 truncate">
                          Alert sent to: <strong className="text-slate-200">{alert.email}</strong>
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                      Active
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-[#252A34] p-3 rounded-xl border border-white/5">
                    <div>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase">Max rent budget</span>
                      <span className="font-extrabold text-[#08D9D6]">GH₵ {alert.maxRentGhs.toLocaleString()}/mo</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase">Bedrooms</span>
                      <span className="font-bold text-white">
                        {alert.bedrooms === 'All' ? 'Any bedrooms' : `${alert.bedrooms} bed`}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase">Frequency</span>
                      <span className="font-bold text-slate-200 capitalize">{alert.frequency}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase">Subscribed on</span>
                      <span className="font-bold text-slate-300">{new Date(alert.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-[#08D9D6]" /> Email alerts active
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleUnsubscribe(alert.id)}
                      className="text-xs font-bold text-[#FF2E63] hover:underline"
                    >
                      Remove alert
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Bell}
              title="No search alerts"
              description="Create an alert from the Browse properties page to be emailed when new matching listings appear."
              action={
                <button
                  type="button"
                  onClick={() => setCurrentView('browse')}
                  className="px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-black"
                >
                  Browse properties
                </button>
              }
            />
          )}
        </div>
      )}

      {/* =========================== NOTIFICATIONS ======================= */}
      {activeSection === 'notifications' && <NotificationsView role="tenant" />}

      {/* ============================= PROFILE =========================== */}
      {activeSection === 'profile' && (
        <div className="space-y-5 animate-fadeIn">
          <SectionHeader
            title="Profile"
            description="The name and contact details attached to your account. Your picture and password are on Account settings."
            actions={
              <button
                type="button"
                onClick={() => navigate('/tenant/settings')}
                className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
              >
                Account settings
              </button>
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-slate-900/60 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-[#08D9D6]" /> Your details
                </h2>
                {saveSuccess && (
                  <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label htmlFor="tenant-profile-name" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Full name
                  </label>
                  <input
                    id="tenant-profile-name"
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="tenant-profile-phone" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Phone number
                    </label>
                    <input
                      id="tenant-profile-phone"
                      type="tel"
                      required
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                    />
                  </div>

                  <div>
                    <label htmlFor="tenant-profile-email" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Email address
                    </label>
                    <input
                      id="tenant-profile-email"
                      type="email"
                      value={currentUser?.email || ''}
                      readOnly
                      aria-describedby="tenant-profile-email-hint"
                      className="w-full bg-slate-950/60 border border-white/10 rounded-xl p-3 text-sm text-slate-400 cursor-not-allowed"
                    />
                    <p id="tenant-profile-email-hint" className="text-[10px] text-slate-500 mt-1">
                      Contact Goodlucks Homes support to change the email on your account.
                    </p>
                  </div>
                </div>

                <div>
                  <label htmlFor="tenant-profile-address" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Current address in Ghana
                  </label>
                  <input
                    id="tenant-profile-address"
                    type="text"
                    value={profileAddress}
                    onChange={(e) => setProfileAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-sm hover:bg-[#08D9D6]/90 disabled:opacity-60 transition-colors"
                >
                  {isSavingProfile ? 'Saving…' : 'Save profile details'}
                </button>
              </form>
            </div>

            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-3">
              <Avatar name={currentUser?.name} src={currentUser?.avatar} size="lg" />
              <div>
                <p className="text-sm font-bold text-white truncate">{currentUser?.name}</p>
                <p className="text-[11px] text-slate-400 break-words">{currentUser?.email}</p>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Your profile picture is used next to your name across your account. Change it, or your password, in
                Account settings.
              </p>
              <button
                type="button"
                onClick={() => navigate('/tenant/settings')}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
              >
                Open account settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================ SETTINGS =========================== */}
      {activeSection === 'settings' && <AccountSettingsView role="tenant" />}

      {/* Unknown section inside the tenant area falls back to the overview. */}
      {!['overview', 'requests', 'matches', 'viewings', 'saved', 'alerts', 'notifications', 'profile', 'settings'].includes(
        activeSection
      ) && (
        <EmptyState
          icon={ChevronRight}
          title="This section does not exist"
          action={
            <button
              type="button"
              onClick={() => navigate('/tenant/dashboard')}
              className="text-xs font-bold text-[#08D9D6] hover:underline"
            >
              Back to overview
            </button>
          }
        />
      )}
    </DashboardShell>
  );
};
