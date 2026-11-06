import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock3, Loader2, X } from 'lucide-react';
import type { ViewingTermsChange } from '../types';
import { api, messageForError } from '../services/apiService';
import { useApp } from '../context/AppContext';

/**
 * Task 03: staff review of viewing fee / viewing terms changes.
 *
 * This is part of the EXISTING property approval area, not a second approval
 * system: approving a pending listing applies the fee and terms submitted with
 * it, and this queue handles later changes to listings that are already live.
 *
 * The approved values are never replaced until a reviewer clicks Approve here,
 * and a rejection always carries a reason the owner/agent can read.
 */
export const AdminViewingTermsQueue: React.FC = () => {
  const { currentUser } = useApp();
  const [changes, setChanges] = useState<ViewingTermsChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.adminViewingTermChanges('pending_review');
      setChanges(result.changes ?? []);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      void load();
    }
  }, [currentUser?.role, load]);

  const decide = async (change: ViewingTermsChange, decision: 'approve' | 'reject') => {
    const note = (reasons[change.id] ?? '').trim();
    if (decision === 'reject' && note.length < 5) {
      setError('Give a reason so the agent knows what to change.');
      return;
    }
    setBusyId(change.id);
    setError(null);
    try {
      const result = await api.adminDecideViewingTermChange(change.id, decision, note);
      setNotice(result.message);
      setChanges((prev) => prev.filter((row) => row.id !== change.id));
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusyId(null);
    }
  };

  if (currentUser?.role !== 'admin') return null;

  return (
    <div className="bg-surface rounded-2xl border border-line p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <Clock3 className="w-4 h-4 text-ink" /> Viewing fee &amp; terms changes
          </h3>
          <p className="text-[11px] text-ink/70">
            A change waits here until it is approved. Until then the listing keeps the fee and terms that are already
            approved, and those are the only values tenants see.
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-surface border border-line text-[11px] text-ink/70 shrink-0">
          {changes.length} pending
        </span>
      </div>

      {error && (
        <div role="alert" className="p-2 rounded-lg bg-accent/15 border border-accent/30 text-[11px] text-ink flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-800">
          {notice}
        </div>
      )}

      {loading && changes.length === 0 && (
        <p className="text-[11px] text-ink/70 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </p>
      )}

      {!loading && changes.length === 0 && (
        <p className="text-[11px] text-ink/70">No viewing fee or terms changes are waiting for review.</p>
      )}

      <ul className="divide-y divide-line">
        {changes.map((change) => (
          <li key={change.id} className="py-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-bold text-ink">{change.propertyTitle || change.propertyId}</span>
              <span className="px-2 py-0.5 rounded bg-surface border border-line text-ink/70">
                {change.propertyStatus || 'unknown status'}
              </span>
              <span className="text-ink/70">
                proposed <strong className="text-ink">GH₵ {change.proposedFeeGhs?.toLocaleString()}</strong>
                {change.previousFeeGhs !== null && change.previousFeeGhs !== undefined
                  ? ` (currently GH₵ ${change.previousFeeGhs.toLocaleString()})`
                  : ' (no fee approved yet)'}
              </span>
              <span className="text-ink/70">by {change.requestedByRole || 'owner'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-ink/70">
              <div className="rounded-lg bg-surface border border-line p-2 space-y-1">
                <p className="font-semibold text-ink">Proposed terms</p>
                <p>{change.proposedTerms.appointmentRequired ? 'Appointment required' : 'No appointment needed'}</p>
                <p>{change.proposedTerms.howToArrange}</p>
                {change.proposedTerms.conditions && <p className="text-ink/70">{change.proposedTerms.conditions}</p>}
                <p className="text-ink/70">{change.proposedTerms.paymentInstructions}</p>
                {change.proposedTerms.restrictions && (
                  <p className="text-ink/70">{change.proposedTerms.restrictions}</p>
                )}
              </div>
              <div className="space-y-2">
                <input
                  value={reasons[change.id] ?? ''}
                  onChange={(event) => setReasons((prev) => ({ ...prev, [change.id]: event.target.value }))}
                  placeholder="Reason (required to reject)"
                  className="w-full bg-page border border-line rounded-lg px-2 py-1.5 text-[11px] text-ink"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void decide(change, 'approve')}
                    disabled={busyId === change.id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30 font-bold text-[11px] inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button
                    onClick={() => void decide(change, 'reject')}
                    disabled={busyId === change.id}
                    className="px-3 py-1.5 rounded-lg bg-accent/20 text-ink hover:bg-accent/30 font-bold text-[11px] inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AdminViewingTermsQueue;
