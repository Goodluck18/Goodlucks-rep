import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  Clock3,
  Info,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  User,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VerificationPanel } from './VerificationPanel';
import { AgentViewingsPanel } from './AgentViewingsPanel';
import { AgentListingForm } from './AgentListingForm';
import { AgentFinancePanel } from './AgentFinancePanel';
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

/** Section keys this dashboard understands (kept in sync with routes.ts). */
const AGENT_SECTIONS = [
  'overview',
  'properties',
  'viewings',
  'finance',
  'verification',
  'status',
  'notifications',
  'profile',
  'settings',
] as const;

/**
 * Agent workspace (Increment C; re-organised into separate pages in Task 02).
 *
 * Deliberately narrow. An agent can see who they are on the platform, the city
 * they operate from, the review state of their account and the listings they
 * have submitted. Nothing here claims identity verification, licensing or a
 * landlord relationship that has not been checked — those checks do not exist
 * yet, so every card says so explicitly.
 */
export const AgentDashboard: React.FC = () => {
  const {
    currentUser,
    properties,
    updateAgentProfile,
    sectionTab,
    navigate,
    notifications,
    viewingSchedules,
    showErrorToast,
    showSuccessToast,
  } = useApp();

  const profile = currentUser?.agentProfile ?? null;

  // Each section is its own routed page now (/agent/finance, /agent/settings…),
  // so the URL alone decides what is on screen.
  const activeSection = (sectionTab || 'overview') as (typeof AGENT_SECTIONS)[number];

  const [agencyName, setAgencyName] = useState(profile?.agencyName ?? '');
  const [operatingCity, setOperatingCity] = useState(profile?.operatingCity ?? '');
  const [cityError, setCityError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Keep the form in step with the account record after a save or a refresh.
  useEffect(() => {
    setAgencyName(profile?.agencyName ?? '');
    setOperatingCity(profile?.operatingCity ?? '');
  }, [profile?.agencyName, profile?.operatingCity]);

  const submissions = properties.filter(
    (property) => property.submittedByUserId && property.submittedByUserId === currentUser?.id
  );

  const unreadNotifications = notifications.filter((n) => !n.read).length;

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const city = operatingCity.trim();
    if (!city) {
      setCityError('Enter the city you operate from.');
      return;
    }

    setCityError(null);
    setIsSaving(true);
    const result = await updateAgentProfile({ agencyName: agencyName.trim(), operatingCity: city });
    setIsSaving(false);

    if (!result.ok) {
      showErrorToast('Profile not saved', result.error || 'Please check your details and try again.');
      setCityError(result.fields?.operatingCity ?? null);
      return;
    }
    showSuccessToast('Agent profile updated', 'Your operating details were saved.');
  };

  const status = profile?.accountStatus ?? 'pending_review';
  const statusCopy =
    status === 'active'
      ? {
          label: 'Approved for listing submissions',
          tone: 'emerald',
          blurb:
            'Goodlucks has approved this account to submit listings for landlords. That is an account permission, not a verification of your identity, licence or authority to act for an owner.',
        }
      : status === 'suspended'
        ? {
            label: 'Account suspended',
            tone: 'rose',
            blurb:
              'Listing submissions are closed for this account. Contact Goodlucks if you believe this is a mistake.',
          }
        : {
            label: 'Pending review',
            tone: 'amber',
            blurb:
              'Your account is registered but not yet reviewed. Listing submissions stay closed until an administrator approves the account.',
          };

  const toneClasses =
    statusCopy.tone === 'emerald'
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
      : statusCopy.tone === 'rose'
        ? 'bg-[#FF2E63]/10 border-[#FF2E63]/30 text-[#FF8FA8]'
        : 'bg-amber-500/10 border-amber-500/30 text-amber-300';

  const navItems = dashboardNav('agent', { unreadNotifications });

  return (
    <DashboardShell role="agent" active={activeSection} items={navItems}>
      {/* ============================= OVERVIEW =========================== */}
      {activeSection === 'overview' && (
        <div className="space-y-5 animate-fadeIn">
          <SectionHeader
            title={`Welcome, ${currentUser?.name?.split(' ')[0] || 'Agent'}`}
            description={
              profile?.agencyName
                ? `${profile.agencyName}${profile.operatingCity ? ` · operating from ${profile.operatingCity}` : ''}`
                : 'Independent agent'
            }
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <SummaryCard
              label="Submitted listings"
              value={submissions.length}
              hint="Listings you submitted"
              icon={Building2}
              onClick={() => navigate('/agent/properties')}
            />
            <SummaryCard
              label="Account status"
              value={status === 'active' ? 'Approved' : status === 'suspended' ? 'Suspended' : 'Pending'}
              hint="Open account status"
              icon={status === 'active' ? CheckCircle2 : Clock3}
              tone={status === 'active' ? 'positive' : status === 'suspended' ? 'rose' : 'warning'}
              onClick={() => navigate('/agent/status')}
            />
            <SummaryCard
              label="Viewings"
              value={viewingSchedules.length}
              hint="Requests assigned to you"
              icon={Activity}
              onClick={() => navigate('/agent/viewings')}
            />
            <SummaryCard
              label="Notifications"
              value={unreadNotifications}
              hint={unreadNotifications > 0 ? 'Unread' : 'Nothing unread'}
              icon={Bell}
              onClick={() => navigate('/agent/notifications')}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <section className="lg:col-span-2 bg-[#252A34]/70 border border-white/10 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#08D9D6]" />
                <h2 className="text-sm font-bold">Account status</h2>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${toneClasses}`}>
                {status === 'active' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock3 className="w-3.5 h-3.5" />}
                {statusCopy.label}
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">{statusCopy.blurb}</p>
              {profile?.statusNote && (
                <p className="text-[11px] text-slate-500">Note from Goodlucks: {profile.statusNote}</p>
              )}
            </section>

            <section className="bg-[#252A34]/70 border border-white/10 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-300" />
                <h2 className="text-sm font-bold">Verification</h2>
              </div>
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0" />
                  Identity and professional authorisation are reviewed separately.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0" />
                  A verified identity never means an agent is licensed.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0" />
                  Authority to act for a landlord is declared per listing and stays unverified.
                </li>
              </ul>
              <button
                type="button"
                onClick={() => navigate('/agent/verification')}
                className="text-[11px] font-bold text-[#08D9D6] hover:underline flex items-center gap-1"
              >
                Open verification <ArrowRight className="w-3 h-3" />
              </button>
            </section>
          </div>

          <section className="bg-[#252A34]/70 border border-white/10 rounded-2xl p-5 space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#08D9D6]">Sections</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { label: 'Submitted listings', path: '/agent/properties', icon: Building2 },
                { label: 'Viewings', path: '/agent/viewings', icon: Activity },
                { label: 'Finance & commissions', path: '/agent/finance', icon: ShieldCheck },
                { label: 'Account status', path: '/agent/status', icon: User },
                { label: 'Profile', path: '/agent/profile', icon: User },
                { label: 'Password & picture', path: '/agent/settings', icon: ShieldCheck },
              ].map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="px-3 py-2.5 rounded-xl bg-slate-900/70 border border-white/10 text-xs font-bold text-white hover:border-[#08D9D6]/40 transition-colors flex items-center gap-1.5 text-left"
                >
                  <item.icon className="w-3.5 h-3.5 text-[#08D9D6] shrink-0" /> {item.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ========================== SUBMITTED LISTINGS ==================== */}
      {activeSection === 'properties' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader
            title="Submitted listings"
            description="Listings you submitted on a landlord's behalf. The landlord keeps their own record; your submission never transfers ownership."
          />

          <AgentListingForm canSubmit={Boolean(profile?.canSubmitListings) && status === 'active'} />

          <div className="bg-[#252A34]/70 border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#08D9D6]" />
                <h2 className="text-sm font-bold">Listings you submitted</h2>
              </div>
              <span className="text-[11px] text-slate-500">{submissions.length} total</span>
            </div>

            {submissions.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-2">
                <p className="text-xs text-slate-400">No submissions yet.</p>
                <p className="text-[11px] text-slate-500 leading-snug flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-300" />
                  Use the submission form above. You name the landlord you act for; Goodlucks records that as your
                  declaration, not as proof of ownership, and staff review every listing before it goes live.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {submissions.map((property) => (
                  <li key={property.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white break-words">{property.title}</p>
                      <p className="text-[11px] text-slate-400">
                        {property.location}
                        {property.landlordName ? ` · owner: ${property.landlordName}` : ''}
                      </p>
                      {property.landlordAuthorityState === 'claimed_by_agent' && (
                        <p className="text-[11px] text-amber-300/80">
                          Your declaration only — landlord authority is unverified
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/10 text-slate-300 capitalize">
                        {property.status}
                      </span>
                      {property.isLandlordVerified ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                          Reviewed by Goodlucks
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-white/10 text-slate-400">
                          Unverified
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ============================= VIEWINGS =========================== */}
      {activeSection === 'viewings' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader
            title="Viewings"
            description="Viewing enquiries and appointments assigned to you. A request is not a booking until a time is agreed."
          />
          {status === 'active' ? (
            <AgentViewingsPanel operational />
          ) : (
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 space-y-2">
              <p className="text-sm font-bold text-white flex items-center gap-2">
                <Clock3 className="w-4 h-4 text-amber-300" /> Viewing tools are closed
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your agent account is not approved yet, so viewing tools stay closed. Existing records are kept and
                appear once the account is approved.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ============================== FINANCE =========================== */}
      {activeSection === 'finance' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader
            title="Finance & commissions"
            description="Your own money position as recorded by Goodlucks staff. No figure on this page is estimated."
          />
          <AgentFinancePanel operational={status === 'active'} />
        </div>
      )}

      {/* =========================== VERIFICATION ========================= */}
      {activeSection === 'verification' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader
            title="Verification"
            description="Identity and professional authorisation are reviewed separately, and neither one makes you licensed or proves you may act for a landlord."
          />
          <VerificationPanel scope="agent" />
        </div>
      )}

      {/* =========================== ACCOUNT STATUS ======================= */}
      {activeSection === 'status' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader title="Account status" description="What your account may currently do on Goodlucks Homes." />
          <div className="bg-[#252A34]/70 border border-white/10 rounded-2xl p-5 space-y-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${toneClasses}`}>
              {status === 'active' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock3 className="w-3.5 h-3.5" />}
              {statusCopy.label}
            </span>
            <p className="text-xs text-slate-400 leading-relaxed">{statusCopy.blurb}</p>
            {profile?.statusNote && (
              <p className="text-[11px] text-slate-500">Note from Goodlucks: {profile.statusNote}</p>
            )}
            {profile?.reviewedAt && (
              <p className="text-[11px] text-slate-500">
                Last reviewed: {new Date(profile.reviewedAt).toLocaleDateString()}
              </p>
            )}
            <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400 space-y-1">
              <p>Listing submissions: {profile?.canSubmitListings && status === 'active' ? 'open' : 'closed'}</p>
              <p>Viewing tools: {status === 'active' ? 'open' : 'closed'}</p>
            </div>
          </div>
        </div>
      )}

      {/* ========================== NOTIFICATIONS ========================= */}
      {activeSection === 'notifications' && <NotificationsView role="agent" />}

      {/* ============================= PROFILE ============================ */}
      {activeSection === 'profile' && (
        <div className="space-y-4 animate-fadeIn">
          <SectionHeader
            title="Profile"
            description="Your operating details and contact information. Your picture and password are on Account settings."
            actions={
              <button
                type="button"
                onClick={() => navigate('/agent/settings')}
                className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
              >
                Account settings
              </button>
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <form
              onSubmit={handleSaveProfile}
              className="lg:col-span-2 bg-[#252A34]/70 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#08D9D6]" />
                <h2 className="text-sm font-bold">Agent profile</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="agent-agency-name" className="block text-xs font-semibold text-slate-300">
                    Agency / business name <span className="text-slate-500 font-normal">(optional)</span>
                  </label>
                  <input
                    id="agent-agency-name"
                    type="text"
                    value={agencyName}
                    onChange={(event) => setAgencyName(event.target.value)}
                    placeholder="e.g. Mensah Property Partners"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="agent-operating-city" className="block text-xs font-semibold text-slate-300">
                    Operating city / base <span className="text-slate-500 font-normal">(where you work)</span>
                  </label>
                  <input
                    id="agent-operating-city"
                    type="text"
                    required
                    value={operatingCity}
                    onChange={(event) => setOperatingCity(event.target.value)}
                    placeholder="e.g. Accra"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                  />
                  {cityError && <p className="text-[11px] text-[#FF8FA8]">{cityError}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-400">
                <div>
                  <span className="font-semibold text-slate-300">Contact email</span>
                  <p className="mt-1 break-all">{currentUser?.email}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-300">Contact phone</span>
                  <p className="mt-1">{currentUser?.phone || 'Not provided'}</p>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-snug flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Your operating base is where you work. It is not your home address and it is not a claim about the
                areas you cover.
              </p>

              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs hover:bg-[#08D9D6]/90 transition-all disabled:opacity-60"
              >
                {isSaving ? 'Saving…' : 'Save agent profile'}
              </button>
            </form>

            <div className="bg-[#252A34]/70 border border-white/10 rounded-2xl p-5 space-y-3">
              <Avatar name={currentUser?.name} src={currentUser?.avatar} size="lg" />
              <div>
                <p className="text-sm font-bold text-white truncate">{currentUser?.name}</p>
                <p className="text-[11px] text-[#08D9D6] font-semibold">
                  {profile?.agencyName || 'Independent agent'}
                </p>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Your profile picture appears next to your name. Change it, or your password, in Account settings.
              </p>
              <button
                type="button"
                onClick={() => navigate('/agent/settings')}
                className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
              >
                Open account settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================ SETTINGS ============================ */}
      {activeSection === 'settings' && <AccountSettingsView role="agent" />}

      {!AGENT_SECTIONS.includes(activeSection) && (
        <EmptyState
          icon={ArrowRight}
          title="This section does not exist"
          action={
            <button
              type="button"
              onClick={() => navigate('/agent/dashboard')}
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
