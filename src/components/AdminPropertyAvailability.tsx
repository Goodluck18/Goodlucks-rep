import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  TimerOff,
} from 'lucide-react';
import type { AdminAvailabilityRow } from '../types';
import { api, messageForError } from '../services/apiService';

/**
 * Admin → Property availability.
 *
 * The seven-day confirmation rule, seen from the console: which listings are
 * waiting for an answer, which are due soon, which expired without one, which the
 * provider withdrew, and what happened most recently to each. Reactivation is
 * here too, and it refuses to proceed without a reason and a stated source of the
 * availability confirmation — the record has to say who established the fact and
 * how.
 *
 * Nothing on this screen decides visibility: the server already hides an
 * unconfirmed listing from the public. This is the operator's view of that rule.
 */

const FILTERS: Array<{ key: string; label: string; countKey?: string }> = [
  { key: 'all', label: 'All listings', countKey: 'all' },
  { key: 'active', label: 'Active', countKey: 'active' },
  { key: 'due_soon', label: 'Confirmation due soon', countKey: 'due_soon' },
  { key: 'awaiting', label: 'Awaiting confirmation', countKey: 'awaiting' },
  { key: 'expired', label: 'Expired (auto-unpublished)', countKey: 'expired' },
  { key: 'draft', label: 'Draft / not approved', countKey: 'draft' },
  { key: 'unavailable', label: 'Unavailable', countKey: 'unavailable' },
  { key: 'reactivated', label: 'Reactivated', countKey: 'reactivated' },
];

const ACTIVITY_KINDS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All activity' },
  { key: 'confirmations', label: 'Confirmations & declines' },
  { key: 'expiry', label: 'Automatic expiry' },
  { key: 'reactivations', label: 'Reactivations' },
  { key: 'suspension', label: 'Suspensions & reinstatements' },
];

const formatDate = (value: string): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const stateTone = (state: string): string => {
  switch (state) {
    case 'active_confirmed':
      return 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30';
    case 'due_soon':
      return 'bg-amber-500/15 text-amber-700 border border-amber-500/30';
    case 'awaiting_confirmation':
      return 'bg-amber-500/20 text-amber-700 border border-amber-500/30';
    case 'expired':
      return 'bg-accent/15 text-ink border border-accent/30';
    case 'unavailable':
      return 'bg-line text-ink/70';
    case 'suspended':
      return 'bg-line text-ink/70';
    default:
      return 'bg-surface text-ink/70 border border-line';
  }
};

export const AdminPropertyAvailability: React.FC = () => {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [rows, setRows] = useState<AdminAvailabilityRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reactivating, setReactivating] = useState<AdminAvailabilityRow | null>(null);
  const [reason, setReason] = useState('');
  const [confirmedWith, setConfirmedWith] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [showActivity, setShowActivity] = useState(false);
  const [activityKind, setActivityKind] = useState('');
  const [activity, setActivity] = useState<
    Array<{
      id: string;
      at: string;
      action: string;
      label: string;
      actorRole: string;
      actorName: string;
      system: boolean;
      property: { id: string; title: string; location: string } | null;
      account: { id: string; name: string; role: string } | null;
      detail: { reason: string; note: string; source: string; automated: boolean };
    }>
  >([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.adminPropertyAvailability({ filter, q: appliedQuery, perPage: 100 });
      setRows(result.items);
      setCounts(result.counts);
      setTotal(result.total);
    } catch (loadError) {
      setError(messageForError(loadError));
    } finally {
      setLoading(false);
    }
  }, [filter, appliedQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const result = await api.adminPropertyAvailabilityActivity({ kind: activityKind, perPage: 100 });
      setActivity(result.items);
    } catch (activityLoadError) {
      setActivityError(messageForError(activityLoadError));
    } finally {
      setActivityLoading(false);
    }
  }, [activityKind]);

  useEffect(() => {
    if (showActivity) void loadActivity();
  }, [showActivity, loadActivity]);

  const openReactivation = (row: AdminAvailabilityRow) => {
    setReactivating(row);
    setReason('');
    setConfirmedWith('');
    setNote('');
    setDialogError(null);
  };

  const submitReactivation = async () => {
    if (!reactivating) return;
    setBusy(true);
    setDialogError(null);
    try {
      const result = await api.adminReactivatePropertyAvailability(reactivating.id, { reason, confirmedWith, note });
      setFlash(result.message);
      setReactivating(null);
      await load();
      if (showActivity) await loadActivity();
    } catch (submitError) {
      setDialogError(
        (submitError as { fields?: Record<string, string> })?.fields?.reason ||
          (submitError as { fields?: Record<string, string> })?.fields?.confirmedWith ||
          messageForError(submitError)
      );
    } finally {
      setBusy(false);
    }
  };

  const visibleRows = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <Clock3 className="w-5 h-5 text-interactive-text" /> Property availability
          </h2>
          <p className="text-xs text-ink/70 leading-relaxed max-w-2xl">
            Every published listing must be reconfirmed as still available every seven days. A listing that is not
            confirmed is unpublished automatically, without being deleted; the provider republishes it by confirming.
            This screen shows that cycle and its history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowActivity((open) => !open)}
            className={`gl-btn gl-btn-secondary px-3 text-xs ${showActivity ? 'ring-1 ring-interactive' : ''}`}
          >
            <History className="w-4 h-4" /> {showActivity ? 'Hide activity' : 'Availability activity'}
          </button>
          <button type="button" onClick={() => void load()} className="gl-btn gl-btn-secondary px-3 text-xs" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {flash && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-ink text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span className="flex-1">{flash}</span>
          <button type="button" className="font-bold" onClick={() => setFlash(null)}>
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const count = option.countKey ? counts[option.countKey] : undefined;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-colors ${
                filter === option.key
                  ? 'bg-ink text-white border-ink'
                  : 'bg-surface text-ink/70 border-line hover:text-ink'
              }`}
            >
              {option.label}
              {count !== undefined && <span className="ml-1.5 opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedQuery(query.trim());
        }}
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink/50" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, location, provider or listing id"
            className="gl-input pl-9 text-xs w-full"
            aria-label="Search listings by title, location, provider or id"
          />
        </div>
        <button type="submit" className="gl-btn gl-btn-primary px-4 text-xs">
          Search
        </button>
        {appliedQuery && (
          <button
            type="button"
            className="gl-btn gl-btn-secondary px-3 text-xs"
            onClick={() => {
              setQuery('');
              setAppliedQuery('');
            }}
          >
            Clear
          </button>
        )}
      </form>

      <p className="text-[11px] text-ink/70">
        {loading ? 'Loading…' : `${visibleRows.length} of ${total} listing(s) shown`}
      </p>

      {/* Rows */}
      <div className="space-y-2">
        {!loading && visibleRows.length === 0 && (
          <div className="bg-surface border border-line rounded-2xl p-6 text-center">
            <p className="text-sm font-bold text-ink">Nothing in this filter</p>
            <p className="text-xs text-ink/70 mt-1">
              No listing currently matches. Switch the filter or clear the search to see the whole catalogue.
            </p>
          </div>
        )}

        {visibleRows.map((row) => (
          <div key={row.id} className="bg-surface border border-line rounded-2xl p-4 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${stateTone(row.availability.state)}`}>
                    {row.availability.label}
                  </span>
                  <span className="text-[10px] font-mono text-ink/50">{row.id}</span>
                </div>
                <p className="text-sm font-bold text-ink mt-1 break-words">{row.title}</p>
                <p className="text-[11px] text-ink/70">
                  {row.location} · provider:{' '}
                  <span className="font-semibold text-ink">{row.provider.name || 'not recorded'}</span>
                  {row.provider.role ? ` (${row.provider.role})` : ''}
                  {row.provider.accountStatus === 'suspended' && (
                    <span className="ml-2 inline-flex items-center gap-1 text-accent-text font-bold">
                      <ShieldAlert className="w-3 h-3" /> suspended
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {row.canReactivate && (
                  <button
                    type="button"
                    onClick={() => openReactivation(row)}
                    disabled={row.provider.accountStatus === 'suspended'}
                    title={
                      row.provider.accountStatus === 'suspended'
                        ? 'A suspended provider cannot be republished. Reinstate the account first.'
                        : 'Reactivate with a recorded reason'
                    }
                    className="px-3 py-1.5 rounded-lg bg-interactive text-ink text-[11px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reactivate
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-ink/70 pt-1 border-t border-line">
              <p>
                <span className="font-semibold text-ink">Last confirmed: </span>
                {formatDate(row.availability.confirmedAt)}
              </p>
              <p>
                <span className="font-semibold text-ink">Next deadline: </span>
                {formatDate(row.availability.dueAt)}
              </p>
              <p>
                <span className="font-semibold text-ink">Status: </span>
                {row.status}
              </p>
            </div>

            <p className="text-[11px] text-ink/70 leading-snug">
              <span className="font-semibold text-ink">Most recent action: </span>
              {row.lastAction.label || 'No availability action recorded yet'}
              {row.lastAction.at ? ` · ${formatDate(row.lastAction.at)}` : ''}
              {row.lastAction.action
                ? ` · ${row.lastAction.system ? 'system-generated' : row.lastAction.actorName || row.lastAction.actorRole}`
                : ''}
              {row.lastAction.note ? ` · “${row.lastAction.note}”` : ''}
            </p>
          </div>
        ))}
      </div>

      {/* Activity */}
      {showActivity && (
        <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <History className="w-4 h-4 text-interactive-text" /> Availability &amp; suspension activity
            </h3>
            <select
              value={activityKind}
              onChange={(event) => setActivityKind(event.target.value)}
              className="gl-input text-xs"
              aria-label="Filter activity by type"
            >
              {ACTIVITY_KINDS.map((kind) => (
                <option key={kind.key || 'all'} value={kind.key}>
                  {kind.label}
                </option>
              ))}
            </select>
          </div>

          {activityError && <p className="text-xs text-accent-text">{activityError}</p>}
          {activityLoading ? (
            <p className="text-xs text-ink/70 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading activity…
            </p>
          ) : activity.length === 0 ? (
            <p className="text-xs text-ink/70">No activity recorded for this filter yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((entry) => (
                <li key={entry.id} className="py-2 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-ink break-words">{entry.label}</p>
                    <p className="text-[11px] text-ink/70">
                      {entry.property ? `${entry.property.title} (${entry.property.id})` : entry.account?.name || entry.entityId}
                      {entry.detail.reason ? ` · reason: ${entry.detail.reason}` : ''}
                      {entry.detail.source ? ` · source: ${entry.detail.source}` : ''}
                    </p>
                  </div>
                  <div className="text-[11px] text-ink/70 sm:text-right shrink-0">
                    <p>{formatDate(entry.at)}</p>
                    <p className={entry.system ? 'inline-flex items-center gap-1 font-semibold' : ''}>
                      {entry.system ? (
                        <>
                          <TimerOff className="w-3 h-3" /> system-generated
                        </>
                      ) : (
                        entry.actorName || entry.actorRole
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Reactivation dialog */}
      {reactivating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50" role="dialog" aria-modal="true">
          <div className="bg-surface rounded-2xl border border-line shadow-xl max-w-lg w-full p-5 space-y-3">
            <h3 className="text-sm font-bold text-ink">Reactivate “{reactivating.title}”</h3>
            <p className="text-[11px] text-ink/70 leading-relaxed">
              Republishing asserts that the property is still available. Record why, and how that was established. The
              listing restarts a fresh seven-day confirmation period. Suspension, identity verification and moderation
              still apply and are checked by the server.
            </p>

            <label className="block text-[11px] font-bold text-ink">
              Reason (recorded in the audit trail)
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                className="gl-input text-xs mt-1 w-full"
                placeholder="For example: agent confirmed on a recorded call that the flat is still vacant."
                required
              />
            </label>

            <label className="block text-[11px] font-bold text-ink">
              How availability was confirmed
              <input
                value={confirmedWith}
                onChange={(event) => setConfirmedWith(event.target.value)}
                className="gl-input text-xs mt-1 w-full"
                placeholder="For example: telephone call with the agent, 30 Oct"
                required
              />
            </label>

            <label className="block text-[11px] font-bold text-ink">
              Internal note (optional)
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="gl-input text-xs mt-1 w-full"
                placeholder="Anything the next reviewer should know"
              />
            </label>

            {dialogError && <p className="text-xs text-accent-text">{dialogError}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className="gl-btn gl-btn-secondary px-3 text-xs"
                onClick={() => setReactivating(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gl-btn gl-btn-primary px-4 text-xs"
                onClick={() => void submitReactivation()}
                disabled={busy || reason.trim().length < 10 || confirmedWith.trim() === ''}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Reactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPropertyAvailability;
