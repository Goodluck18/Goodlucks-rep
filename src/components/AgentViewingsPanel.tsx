import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import type { ViewingAction, ViewingDetail, ViewingSchedule, ViewingStatus } from '../types';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock3,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';

/**
 * The agent's viewing queue (Increment F).
 *
 * Every button here maps to one server-validated lifecycle action. The server
 * decides what is legal for this agent, on this record, right now; this screen
 * only offers what the server said it would accept, and shows the refusal
 * message when it says no.
 *
 * Nothing on this screen records money. A viewing that happened is not a fee
 * that was paid.
 */

const money = (value: number | null): string =>
  value === null ? '—' : `GH₵ ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusTone: Record<ViewingStatus, string> = {
  enquiry_received: 'bg-line/20 text-ink border-line',
  viewing_requested: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  awaiting_agent: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  proposed: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
  confirmed: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  reschedule_requested: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  rescheduled: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  cancelled: 'bg-line/20 text-ink/70 border-line',
  completed: 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20',
  tenant_no_show: 'bg-accent/15 text-ink border-accent/30',
  agent_no_show: 'bg-accent/15 text-ink border-accent/30',
  could_not_proceed: 'bg-accent/10 text-ink border-accent/20',
};

const daysFromNow = (days: number): string =>
  new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

type ActionKey = 'propose' | 'confirm' | 'reschedule' | 'cancel' | 'complete' | 'no-show' | 'could-not-proceed';

const actionForAllowed = (allowed: ViewingAction[]): ActionKey[] => {
  const map: ActionKey[] = [];
  if (allowed.includes('propose')) map.push('propose');
  if (allowed.includes('reschedule')) map.push('reschedule');
  if (allowed.includes('confirm')) map.push('confirm');
  if (allowed.includes('complete')) map.push('complete');
  if (allowed.includes('tenant_no_show') || allowed.includes('agent_no_show')) map.push('no-show');
  if (allowed.includes('could_not_proceed')) map.push('could-not-proceed');
  if (allowed.includes('cancel')) map.push('cancel');
  return map;
};

const ACTION_LABELS: Record<ActionKey, string> = {
  propose: 'Propose a time',
  confirm: 'Confirm agreed time',
  reschedule: 'Reschedule',
  cancel: 'Cancel viewing',
  complete: 'Mark completed',
  'no-show': 'Tenant did not attend',
  'could-not-proceed': 'Could not proceed',
};

const ViewingCard: React.FC<{ viewing: ViewingSchedule }> = ({ viewing }) => {
  const { runViewingAction, refreshViewings, showErrorToast } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ViewingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [date, setDate] = useState(viewing.date || daysFromNow(2));
  const [time, setTime] = useState(viewing.time || '11:00 AM');
  const [note, setNote] = useState('');

  const open = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    setIsLoading(true);
    try {
      const result = await api.getViewing(viewing.id);
      setDetail(result);
    } catch (err) {
      showErrorToast('Could not load the viewing', messageForError(err));
    } finally {
      setIsLoading(false);
    }
  }, [expanded, viewing.id, showErrorToast]);

  const run = async (action: ActionKey) => {
    if ((action === 'propose' || action === 'reschedule') && (!date || !time)) {
      showErrorToast('Choose a date and time', 'An appointment needs a slot.');
      return;
    }
    if ((action === 'cancel' || action === 'could-not-proceed') && note.trim() === '') {
      showErrorToast('A reason is needed', 'Record why before closing the viewing.');
      return;
    }
    setBusy(action);
    const body =
      action === 'no-show'
        ? { who: 'tenant' as const, note: note || undefined }
        : action === 'confirm' || action === 'complete'
          ? { note: note || undefined }
          : action === 'cancel' || action === 'could-not-proceed'
            ? { reason: note, note }
            : { date, time, note: note || undefined, reason: note || undefined };

    const result = await runViewingAction(viewing.id, action, body);
    setBusy(null);
    if (!result.ok) {
      showErrorToast('The server refused that change', result.error || 'Please try again.');
      return;
    }
    setNote('');
    const refreshed = await api.getViewing(viewing.id).catch(() => null);
    if (refreshed) setDetail(refreshed);
    await refreshViewings();
  };

  const allowed = detail ? actionForAllowed(detail.allowedActions) : [];
  const slotPassed = (() => {
    if (!viewing.date) return false;
    const parsed = Date.parse(`${viewing.date} ${viewing.time || '23:59'}`);
    return Number.isFinite(parsed) ? parsed <= Date.now() : false;
  })();

  return (
    <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-ink">{viewing.propertyTitle}</h3>
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusTone[viewing.status]}`}>
              {viewing.statusLabel}
            </span>
            {viewing.overdue && (
              <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold bg-accent/15 text-ink border-accent/30">
                Overdue
              </span>
            )}
          </div>
          <p className="text-[11px] text-ink/70 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {viewing.propertyLocation}
          </p>
          <p className="text-[11px] text-ink/70">
            {viewing.tenantName}
            {viewing.tenantContactVisible !== false && viewing.tenantPhone ? ` · ${viewing.tenantPhone}` : ''}
            {viewing.tenantContactVisible !== false && viewing.tenantEmail ? ` · ${viewing.tenantEmail}` : ''}
          </p>
          {viewing.tenantContactVisible === false && (
            <p className="text-[10px] text-ink/70 flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              Contact details are shared by Goodlucks only after an administrator approves it.
            </p>
          )}
          <p className="text-[11px] text-ink/70 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {viewing.isConfirmed ? 'Agreed slot' : 'Requested slot'}:{' '}
            <span className="text-ink font-semibold">
              {viewing.date || '—'} {viewing.time ? `at ${viewing.time}` : ''}
            </span>
          </p>
          {!viewing.isConfirmed && (
            <p className="text-[10px] text-amber-700/90">
              Not confirmed. Nothing is booked until an agreed time is recorded.
            </p>
          )}
        </div>

        <button
          onClick={() => void open()}
          className="px-3 py-1.5 rounded-lg bg-page hover:bg-line text-ink text-[11px] font-bold shrink-0"
        >
          {expanded ? 'Close' : 'Open'}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-line pt-3">
          {isLoading && (
            <p className="text-[11px] text-ink/70 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading the record…
            </p>
          )}

          {detail && (
            <>
              {detail.viewing.cancelReason && (
                <p className="text-[11px] text-ink">Cancellation: {detail.viewing.cancelReason}</p>
              )}
              {detail.viewing.agentNotes && (
                <p className="text-[11px] text-ink/70">Your note: {detail.viewing.agentNotes}</p>
              )}

              <div className="bg-surface border border-line rounded-xl p-3 text-[10px] text-ink/70">
                <p className="flex items-center gap-1.5 text-ink font-bold">
                  <Info className="w-3 h-3" /> Money
                </p>
                <p className="mt-1">{detail.financial.note}</p>
                {detail.financial.feeRecorded && (
                  <p className="mt-1">
                    Recorded collection: {money(detail.financial.collectedGhs)} · state{' '}
                    {detail.financial.collectionState.replace(/_/g, ' ')} · Goodlucks share{' '}
                    {money(detail.financial.goodlucksShareGhs)}
                  </p>
                )}
                <p className="mt-1 text-ink/70">
                  Marking a viewing complete never records a payment. The office records what you collected, if anything.
                </p>
              </div>

              {allowed.length > 0 ? (
                <div className="space-y-2">
                  {(allowed.includes('propose') || allowed.includes('reschedule')) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={date}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(event) => setDate(event.target.value)}
                        className="bg-page border border-line rounded-lg px-2 py-1.5 text-[11px] text-ink"
                      />
                      <input
                        type="time"
                        value={time}
                        onChange={(event) => setTime(event.target.value)}
                        className="bg-page border border-line rounded-lg px-2 py-1.5 text-[11px] text-ink"
                      />
                    </div>
                  )}

                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Note or reason (required to cancel or to say a viewing could not proceed)"
                    className="w-full bg-page border border-line rounded-lg px-2 py-1.5 text-[11px] text-ink"
                  />

                  <div className="flex flex-wrap gap-1.5">
                    {allowed.map((action) => (
                      <button
                        key={action}
                        disabled={busy !== null || ((action === 'complete' || action === 'no-show') && !slotPassed)}
                        title={
                          (action === 'complete' || action === 'no-show') && !slotPassed
                            ? 'The appointment time has not passed yet.'
                            : undefined
                        }
                        onClick={() => void run(action)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold disabled:opacity-40 ${
                          action === 'cancel' || action === 'could-not-proceed' || action === 'no-show'
                            ? 'bg-accent/15 text-ink hover:bg-accent/25'
                            : action === 'complete' || action === 'confirm'
                              ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25'
                              : 'bg-interactive/15 text-ink hover:bg-interactive/25'
                        }`}
                      >
                        {busy === action ? 'Working…' : ACTION_LABELS[action]}
                      </button>
                    ))}
                  </div>
                  {(allowed.includes('complete') || allowed.includes('no-show')) && !slotPassed && (
                    <p className="text-[10px] text-ink/70 flex items-center gap-1">
                      <Clock3 className="w-3 h-3" /> Completion and no-shows unlock after the appointment time.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-ink/70">
                  {detail.viewing.isTerminal
                    ? 'This viewing is closed. An administrator can correct it with a written reason.'
                    : 'No actions are available to you on this record.'}
                </p>
              )}

              {detail.history.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-ink/70 mb-1">History</p>
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {detail.history.map((event) => (
                      <li key={event.id} className="text-[10px] text-ink/70 bg-surface rounded px-2 py-1">
                        <span className="text-ink font-semibold">{event.action.replace('viewing.', '')}</span>{' '}
                        {event.fromStatus && event.toStatus ? `${event.fromStatus} → ${event.toStatus}` : ''} ·{' '}
                        {event.actorRole || 'system'} · {new Date(event.at).toLocaleString()}
                        {event.note ? ` · ${event.note}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const AgentViewingsPanel: React.FC<{ operational: boolean }> = ({ operational }) => {
  const { viewingSchedules, refreshViewings } = useApp();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (operational) {
      void refreshViewings();
    }
  }, [operational, refreshViewings]);

  if (!operational) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-2">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <XCircle className="w-4 h-4 text-amber-700" /> Viewing enquiries
        </h2>
        <p className="text-xs text-ink/70">
          Viewing tools are closed while your account is not active. Your past viewings are kept — an administrator can
          still see them — but you cannot open or change them from here.
        </p>
      </div>
    );
  }

  const open = viewingSchedules.filter((v) => !v.isTerminal);
  const closed = viewingSchedules.filter((v) => v.isTerminal);

  return (
    <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-ink" />
          <h2 className="text-sm font-bold">Viewing enquiries</h2>
        </div>
        <button
          onClick={async () => {
            setIsRefreshing(true);
            await refreshViewings();
            setIsRefreshing(false);
          }}
          className="px-2.5 py-1 rounded-lg bg-page hover:bg-line text-[11px] font-bold flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <p className="text-[11px] text-ink/70">
        Requests for the listings you submitted, plus any an administrator assigned to you. A request is not a booking:
        propose a time, then record it as agreed once the tenant accepts. {open.length} open · {closed.length} closed.
      </p>

      {viewingSchedules.length === 0 ? (
        <p className="text-xs text-ink/70 bg-surface border border-line rounded-2xl p-4">
          No viewing enquiries yet. When a tenant asks to see one of your listings it appears here.
        </p>
      ) : (
        <div className="space-y-3">
          {[...open, ...closed].map((viewing) => (
            <ViewingCard key={viewing.id} viewing={viewing} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-ink/70 flex items-start gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Agents only see the viewings assigned to them. A suspended account keeps its history but loses these tools.
      </p>
      <p className="text-[10px] text-ink/70 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        A viewing fee, if one applies, is collected by you on site and recorded by the office afterwards. Recording a
        collection here is not possible, and it is never Goodlucks revenue on its own.
      </p>
      <p className="text-[10px] text-ink/70 flex items-start gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Confirmed here means a time has been agreed, not that anyone has paid.
      </p>
    </div>
  );
};
