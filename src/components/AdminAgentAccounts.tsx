import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { api, messageForError } from '../services/apiService';
import { AdminAgentAccount } from '../types';
import { useApp } from '../context/AppContext';
import { AdminVerificationQueue } from './AdminVerificationQueue';

/**
 * Staff review queue for agent accounts (Increment C).
 *
 * This approves an *account* for listing submissions. It is not an identity
 * check, a licence check or proof that the agent may act for any landlord, and
 * the copy on screen says so. No documents are requested or shown: document
 * verification belongs to a later increment.
 */
export const AdminAgentAccounts: React.FC = () => {
  const { currentUser, showSuccessToast, showErrorToast } = useApp();
  // Increment D: the review queue lives beside the account list, not on a new page.
  const [tab, setTab] = useState<'accounts' | 'verification'>('accounts');
  const [agents, setAgents] = useState<AdminAgentAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listAgents();
      setAgents(result.agents);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyStatus = async (
    agent: AdminAgentAccount,
    accountStatus: 'active' | 'suspended' | 'pending_review',
    canSubmitListings: boolean
  ) => {
    setBusyId(agent.userId);
    try {
      const result = await api.setAgentStatus(agent.userId, { accountStatus, canSubmitListings });
      setAgents((list) =>
        list.map((item) => (item.userId === agent.userId ? { ...item, ...result.profile } : item))
      );
      showSuccessToast('Agent account updated', `${agent.name} is now ${result.profile.accountStatus.replace('_', ' ')}.`);
    } catch (err) {
      showErrorToast('Agent account not updated', messageForError(err));
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = agents.filter((agent) => agent.accountStatus === 'pending_review').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setTab('accounts')}
          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 ${
            tab === 'accounts' ? 'bg-interactive text-ink' : 'bg-surface text-ink/70 hover:bg-line'
          }`}
        >
          Agent accounts
        </button>
        <button
          type="button"
          onClick={() => setTab('verification')}
          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 flex items-center gap-1.5 ${
            tab === 'verification' ? 'bg-interactive text-ink' : 'bg-surface text-ink/70 hover:bg-line'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> Verification review
        </button>
        {!currentUser?.capabilities?.verificationReviewer && (
          <span className="text-[10px] text-ink/70 shrink-0">
            (reviewer capability not granted to this account)
          </span>
        )}
      </div>

      {tab === 'verification' && <AdminVerificationQueue />}

      {tab === 'accounts' && (
        <div className="space-y-4">
      <div className="bg-surface border border-line rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink">Agent accounts</h2>
            <p className="text-[11px] text-ink/70 mt-1">
              {agents.length} agent {agents.length === 1 ? 'account' : 'accounts'} · {pendingCount} pending review
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface text-ink/70 text-[11px] font-bold hover:bg-line"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <p className="text-[11px] text-ink/70 leading-snug flex items-start gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-700" />
          Approving an account only opens listing submissions. No identity document, licence or
          landlord authority has been checked, and nothing here marks an agent or landlord as verified.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-ink/70">Loading agent accounts…</p>
      ) : agents.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl p-5">
          <p className="text-xs text-ink/70">No agent accounts have been registered yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {agents.map((agent) => {
            const isBusy = busyId === agent.userId;
            return (
              <li key={agent.id} className="bg-surface border border-line rounded-2xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-ink">{agent.name}</h3>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                          agent.accountStatus === 'active'
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700'
                            : agent.accountStatus === 'suspended'
                              ? 'bg-accent/15 border-accent/30 text-ink'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-700'
                        }`}
                      >
                        {agent.accountStatus === 'active' ? <CheckCircle2 className="w-3 h-3" /> : agent.accountStatus === 'suspended' ? <XCircle className="w-3 h-3" /> : <Clock3 className="w-3 h-3" />}
                        {agent.accountStatus.replace('_', ' ')}
                      </span>
                      {agent.canSubmitListings && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-interactive/10 border border-interactive/30 text-ink">
                          Can submit listings
                        </span>
                      )}
                      {agent.agentTierLabel && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-500/10 border border-violet-500/30 text-violet-700">
                          {agent.agentTierLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-ink/70">
                      {agent.email}
                      {agent.phone ? ` · ${agent.phone}` : ''}
                    </p>
                    <p className="text-[11px] text-ink/70">
                      {agent.agencyName || 'Independent agent'} · operating from{' '}
                      {agent.operatingCity || 'not stated'}
                    </p>
                    {agent.contactAddress && (
                      <p className="text-[10px] text-ink/70">Contact address: {agent.contactAddress}</p>
                    )}
                    {agent.tierEligibility && (
                      <p className="text-[10px] text-ink/70">
                        Tier read from verification: identity {agent.tierEligibility.identityStatus.replace(/_/g, ' ')},
                        professional authorisation{' '}
                        {agent.tierEligibility.professionalStatus.replace(/_/g, ' ')} — account status above does not
                        set it.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void applyStatus(agent, 'active', true)}
                      className="px-3 py-1.5 rounded-xl bg-interactive text-ink text-[11px] font-extrabold disabled:opacity-60"
                    >
                      Approve for listings
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void applyStatus(agent, 'active', false)}
                      className="px-3 py-1.5 rounded-xl bg-surface text-ink text-[11px] font-bold hover:bg-line disabled:opacity-60"
                    >
                      Approve without listings
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void applyStatus(agent, 'suspended', false)}
                      className="px-3 py-1.5 rounded-xl bg-accent/15 border border-accent/30 text-ink text-[11px] font-bold disabled:opacity-60"
                    >
                      Suspend
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void applyStatus(agent, 'pending_review', false)}
                      className="px-3 py-1.5 rounded-xl bg-surface text-ink text-[11px] font-bold hover:bg-line disabled:opacity-60"
                    >
                      Return to review
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-ink/70">
                  Identity: not checked · Licence: not checked · {agent.reviewedAt ? `Last reviewed ${new Date(agent.reviewedAt).toLocaleDateString()}` : 'Never reviewed'}
                </p>
              </li>
            );
          })}
        </ul>
      )}
        </div>
      )}
    </div>
  );
};
