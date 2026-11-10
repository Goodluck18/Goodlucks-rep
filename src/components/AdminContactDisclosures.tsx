import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, messageForError } from '../services/apiService';
import type { ContactDisclosure } from '../types';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  RefreshCw,
  ShieldOff,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * Tenant contact disclosure queue (Upgrade 2, B6).
 *
 * Nothing here shows the tenant's number or email: the queue is about *whether*
 * to share them with one provider on one viewing. Approving reveals them to that
 * provider alone, for a limited time, and tells the tenant who received them.
 */

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  rejected: 'bg-accent/15 text-ink border-accent/30',
  revoked: 'bg-line/20 text-ink/70 border-line',
  expired: 'bg-line/20 text-ink/70 border-line',
};

const AdminContactDisclosures: React.FC = () => {
  const { showSuccessToast, showErrorToast } = useApp();
  const [disclosures, setDisclosures] = useState<ContactDisclosure[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [validDays, setValidDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.adminContactDisclosures();
      setDisclosures(result.disclosures);
      setCounts(result.counts);
      setValidDays(result.validDays);
      setError(null);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(
    () => (filter === '' ? disclosures : disclosures.filter((row) => row.status === filter)),
    [disclosures, filter]
  );

  const decide = async (disclosure: ContactDisclosure, decision: 'approve' | 'reject' | 'revoke') => {
    const note = (notes[disclosure.id] ?? '').trim();
    if (decision !== 'approve' && note === '') {
      showErrorToast('A reason is required', 'Say why the tenant’s contact is not being shared (or is being withdrawn).');
      return;
    }

    setBusyId(disclosure.id);
    try {
      await api.decideContactDisclosure(disclosure.id, decision, note);
      showSuccessToast(
        'Decision recorded',
        decision === 'approve'
          ? `Shared with ${disclosure.providerName || 'the provider'} for ${validDays} days. The tenant has been told.`
          : decision === 'reject'
            ? 'The request was refused and the provider was told why.'
            : 'The shared contact details were withdrawn.'
      );
      setNotes((prev) => ({ ...prev, [disclosure.id]: '' }));
      await load();
    } catch (err) {
      showErrorToast('Could not record the decision', messageForError(err));
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading && disclosures.length === 0) {
    return (
      <div className="bg-surface p-6 rounded-2xl border border-line flex items-center gap-3 text-xs text-ink/70">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading contact requests…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface p-6 rounded-2xl border border-accent/30 text-xs text-ink flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> {error}
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <Lock className="w-4 h-4 text-ink" /> Tenant contact requests
          </h3>
          <p className="text-[11px] text-ink/70 max-w-2xl mt-1">
            A tenant&rsquo;s phone number and email address stay hidden until an administrator approves sharing them
            with one provider for one viewing. An approval lasts {validDays} days and the tenant is told who received
            their details.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-lg bg-page hover:bg-line text-ink text-[11px] font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          { value: '', label: `All (${disclosures.length})` },
          { value: 'pending', label: `Awaiting review (${counts.pending ?? 0})` },
          { value: 'approved', label: `Approved (${counts.approved ?? 0})` },
          { value: 'rejected', label: `Refused (${counts.rejected ?? 0})` },
          { value: 'revoked', label: `Revoked (${counts.revoked ?? 0})` },
        ].map((option) => (
          <button
            key={option.value || 'all'}
            type="button"
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
              filter === option.value ? 'bg-interactive text-ink border-interactive' : 'bg-page text-ink border-line'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-[11px] text-ink/70">
          {disclosures.length === 0
            ? 'No provider has asked for a tenant’s contact details.'
            : 'No request in this state.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((row) => (
            <li key={row.id} className="border border-line rounded-xl p-3 space-y-2 bg-page/40">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-ink">
                    {row.providerName || 'Provider'} · {row.propertyTitle || 'a viewing'}
                  </p>
                  <p className="text-[10px] text-ink/70">
                    Tenant: {row.tenantName || 'unnamed'} · requested{' '}
                    {row.requestedAt ? new Date(row.requestedAt).toLocaleString() : '—'}
                  </p>
                  <p className="text-[11px] text-ink/70 mt-1">
                    <span className="font-semibold text-ink">Reason given:</span> {row.reason || '—'}
                  </p>
                  {row.decisionNote && (
                    <p className="text-[10px] text-ink/70">
                      Decision note: {row.decisionNote}
                      {row.decidedAt ? ` · ${new Date(row.decidedAt).toLocaleString()}` : ''}
                    </p>
                  )}
                  {row.status === 'approved' && row.expiresAt && (
                    <p className="text-[10px] text-ink/70">
                      Shared until {new Date(row.expiresAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${statusStyles[row.status] ?? statusStyles.pending}`}>
                  {row.statusLabel}
                </span>
              </div>

              {(row.status === 'pending' || row.status === 'approved') && (
                <div className="space-y-1.5">
                  <input
                    value={notes[row.id] ?? ''}
                    onChange={(event) => setNotes((prev) => ({ ...prev, [row.id]: event.target.value }))}
                    placeholder={row.status === 'pending' ? 'Note for the decision (required to refuse)' : 'Why is the contact being withdrawn? (required)'}
                    className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-[11px] text-ink"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {row.status === 'pending' && (
                      <>
                        <button
                          disabled={busyId === row.id}
                          onClick={() => void decide(row, 'approve')}
                          className="px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 text-[11px] font-bold disabled:opacity-50 flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Share contact
                        </button>
                        <button
                          disabled={busyId === row.id}
                          onClick={() => void decide(row, 'reject')}
                          className="px-2.5 py-1 rounded-md bg-accent/15 text-ink hover:bg-accent/25 text-[11px] disabled:opacity-50 flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" /> Refuse
                        </button>
                      </>
                    )}
                    {row.status === 'approved' && (
                      <button
                        disabled={busyId === row.id}
                        onClick={() => void decide(row, 'revoke')}
                        className="px-2.5 py-1 rounded-md bg-line text-ink hover:bg-line text-[11px] disabled:opacity-50 flex items-center gap-1"
                      >
                        <ShieldOff className="w-3 h-3" /> Withdraw contact
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminContactDisclosures;
