import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Info,
  MapPin,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VerificationPanel } from './VerificationPanel';
import { AgentViewingsPanel } from './AgentViewingsPanel';
import { AgentListingForm } from './AgentListingForm';
import { AgentFinancePanel } from './AgentFinancePanel';

/**
 * Agent workspace (Increment C).
 *
 * Deliberately narrow. An agent can see who they are on the platform, the city
 * they operate from, the review state of their account and the listings they
 * have submitted. Nothing here claims identity verification, licensing or a
 * landlord relationship that has not been checked — those checks do not exist
 * yet, so every card says so explicitly.
 */
export const AgentDashboard: React.FC = () => {
  const { currentUser, properties, updateAgentProfile, sectionTab, showErrorToast, showSuccessToast } = useApp();

  const profile = currentUser?.agentProfile ?? null;
  const [agencyName, setAgencyName] = useState(profile?.agencyName ?? '');
  const [operatingCity, setOperatingCity] = useState(profile?.operatingCity ?? '');
  const [cityError, setCityError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Keep the form in step with the account record after a save or a refresh.
  useEffect(() => {
    setAgencyName(profile?.agencyName ?? '');
    setOperatingCity(profile?.operatingCity ?? '');
  }, [profile?.agencyName, profile?.operatingCity]);

  /**
   * The agent workspace is one page of panels, not a tabbed dashboard. The URL
   * section (/agent/verification, /agent/finance…) scrolls to the matching
   * panel so the address still identifies what the agent is looking at.
   */
  useEffect(() => {
    if (!sectionTab || sectionTab === 'overview') return;
    const target = document.getElementById(`agent-section-${sectionTab}`);
    if (!target) return;
    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sectionTab]);

  const submissions = properties.filter(
    (property) => property.submittedByUserId && property.submittedByUserId === currentUser?.id
  );

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

  return (
    <div className="min-h-screen bg-[#1F242D] text-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] text-xs font-bold border border-[#08D9D6]/20 mb-1">
              <Activity className="w-3.5 h-3.5" />
              Agent workspace
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Welcome, {currentUser?.name?.split(' ')[0] || 'Agent'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {profile?.agencyName ? profile.agencyName : 'Independent agent'}
              {profile?.operatingCity ? ` · operating from ${profile.operatingCity}` : ''}
            </p>
          </div>

          <span className="inline-flex items-center gap-1.5 text-xs text-[#08D9D6] bg-[#08D9D6]/10 px-3 py-1.5 rounded-full border border-[#08D9D6]/30 font-bold self-start sm:self-auto">
            <Building2 className="w-3.5 h-3.5" />
            Agent account
          </span>
        </div>

        {/* Account status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-3">
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
            {profile?.reviewedAt && (
              <p className="text-[11px] text-slate-500">Last reviewed: {new Date(profile.reviewedAt).toLocaleDateString()}</p>
            )}
          </div>

          {/* Verification lives in its own panel below: real statuses, real
              reviewer notes, and no badge that the platform has not earned. */}
          <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-3">
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
            <p className="text-[11px] text-slate-500 leading-snug">
              Submit and track both checks in the verification section below.
            </p>
          </div>
        </div>

        {/* Identity verification and professional authorisation (Increment D) */}
        <div id="agent-section-verification" className="scroll-mt-24">
          <VerificationPanel scope="agent" />
        </div>

        {/* Viewing enquiries and appointments assigned to this agent (Increment F) */}
        <div id="agent-section-viewings" className="scroll-mt-24">
          <AgentViewingsPanel operational={status === 'active'} />
        </div>

        {/* Own money position: collections, what is owed, claims and confirmed receipts (Increment G) */}
        <div id="agent-section-finance" className="scroll-mt-24">
          <AgentFinancePanel operational={status === 'active'} />
        </div>

        {/* Listing submission on a landlord's behalf (Increment C backend, F interface) */}
        <div id="agent-section-properties" className="scroll-mt-24">
          <AgentListingForm canSubmit={Boolean(profile?.canSubmitListings) && status === 'active'} />
        </div>

        {/* Profile: personal/contact vs operating base, kept separate */}
        <form
          id="agent-section-profile"
          onSubmit={handleSaveProfile}
          className="scroll-mt-24 bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#08D9D6]" />
            <h2 className="text-sm font-bold">Agent profile</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Agency / business name <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={agencyName}
                onChange={(event) => setAgencyName(event.target.value)}
                placeholder="e.g. Mensah Property Partners"
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Operating city / base <span className="text-slate-500 font-normal">(where you work)</span>
              </label>
              <input
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
              <p className="mt-1">{currentUser?.email}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-300">Contact phone</span>
              <p className="mt-1">{currentUser?.phone || 'Not provided'}</p>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-snug flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Your operating base is where you work. It is not your home address and it is not a claim
            about the areas you cover.
          </p>

          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs hover:bg-[#08D9D6]/90 transition-all disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : 'Save agent profile'}
          </button>
        </form>

        {/* Submissions */}
        <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-4">
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
                Use the submission form above. You name the landlord you act for; Goodlucks records
                that as your declaration, not as proof of ownership, and staff review every listing
                before it goes live.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {submissions.map((property) => (
                <li key={property.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-white">{property.title}</p>
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
                  <div className="flex items-center gap-2 text-[11px]">
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
    </div>
  );
};
