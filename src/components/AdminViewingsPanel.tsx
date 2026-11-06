import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import type {
  AdminAgentAccount,
  ViewingCounts,
  ViewingDetail,
  ViewingSchedule,
  ViewingStatus,
} from '../types';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';

/**
 * Administrator viewing oversight (Increment F).
 *
 * Reading viewings and filtering them is ordinary administration. Two things
 * are not: *correcting* a closed record, and standing in for the agent. The
 * correction capability is off by default and granted from the server console;
 * the endpoint re-checks it whatever this screen shows.
 *
 * The physical fee toggle is Increment B's: it records what the agent collected.
 * It is never triggered by a status change, and it never counts as Goodlucks
 * revenue.
 */

const money = (value: number | null): string =>
  value === null ? '—' : `GH₵ ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TONES: Record<ViewingStatus, string> = {
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

const STATUS_FILTERS: Array<{ value: '' | ViewingStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'viewing_requested', label: 'Awaiting the agent' },
  { value: 'proposed', label: 'Proposed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'reschedule_requested', label: 'Reschedule requested' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'tenant_no_show', label: 'Tenant did not attend' },
  { value: 'agent_no_show', label: 'Agent did not attend' },
  { value: 'could_not_proceed', label: 'Could not proceed' },
];

const DetailPanel: React.FC<{ viewingId: string; onClose: () => void; onChanged: () => void }> = ({
  viewingId,
  onClose,
  onChanged,
}) => {
  const { showSuccessToast, showErrorToast } = useApp();
  const [detail, setDetail] = useState<ViewingDetail | null>(null);
  const [agents, setAgents] = useState<AdminAgentAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [correctionStatus, setCorrectionStatus] = useState<ViewingStatus>('cancelled');
  const [reason, setReason] = useState('');
  const [agentUserId, setAgentUserId] = useState('');
  const [feePaid, setFeePaid] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.getAdminViewing(viewingId);
      setDetail(result);
      setFeePaid(result.viewing.viewingFeePaid);
      setAgentUserId(result.viewing.agentUserId);
    } catch (err) {
      showErrorToast('Could not load the viewing', messageForError(err));
    } finally {
      setIsLoading(false);
    }
  }, [viewingId, showErrorToast]);

  useEffect(() => {
    void load();
    api.listAgents().then((result) => setAgents(result.agents)).catch(() => setAgents([]));
  }, [load]);

  const canCorrect = Boolean(detail?.capabilities?.viewingCorrections);

  const correct = async () => {
    setBusy(true);
    try {
      const result = await api.correctViewing(viewingId, { status: correctionStatus, reason });
      showSuccessToast('Correction recorded', result.message);
      setReason('');
      await load();
      onChanged();
    } catch (err) {
      showErrorToast('Correction refused', messageForError(err));
    } finally {
      setBusy(false);
    }
  };

  const assign = async () => {
    if (!agentUserId) return;
    setBusy(true);
    try {
      const result = await api.assignViewingAgent(viewingId, agentUserId);
      showSuccessToast('Viewing assigned', result.message);
      await load();
      onChanged();
    } catch (err) {
      showErrorToast('Could not assign the agent', messageForError(err));
    } finally {
      setBusy(false);
    }
  };

  const setFee = async (next: boolean) => {
    setBusy(true);
    try {
      const result = await api.updateViewing(viewingId, { viewingFeePaid: next });
      setFeePaid(result.viewing.viewingFeePaid);
      showSuccessToast(
        next ? 'Fee collection recorded' : 'Fee record removed',
        next
          ? 'This records what the agent collected. It is not Goodlucks revenue until a remittance is recorded.'
          : 'The ledger row was voided; nothing was received.'
      );
      await load();
      onChanged();
    } catch (err) {
      showErrorToast('Could not update the fee record', messageForError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-2 sm:p-6 overflow-y-auto">
      <div className="max-w-3xl mx-auto bg-[#252A34] border border-white/10 rounded-3xl p-5 space-y-4 my-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">{detail?.viewing.propertyTitle ?? 'Viewing record'}</h3>
            <p className="text-[11px] text-slate-400">
              {detail ? detail.viewing.statusLabel : 'Loading…'}
              {detail?.viewing.overdue ? ' · overdue' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-bold flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Close
          </button>
        </div>

        {isLoading && (
          <p className="text-xs text-slate-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </p>
        )}

        {detail && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 space-y-1">
                <p className="font-bold text-white">Tenant</p>
                <p className="text-slate-300">
                  {detail.viewing.tenantName} · {detail.viewing.tenantPhone}
                </p>
                <p className="text-slate-400">{detail.viewing.tenantEmail || 'no email on file'}</p>
                <p className="text-slate-500">
                  Account: {detail.viewing.tenantUserId ? 'linked' : 'guest request (no account)'}
                </p>
              </div>
              <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 space-y-1">
                <p className="font-bold text-white">Appointment</p>
                <p className="text-slate-300">
                  {detail.viewing.isConfirmed ? 'Agreed' : 'Requested'}: {detail.viewing.date || '—'}{' '}
                  {detail.viewing.time ? `at ${detail.viewing.time}` : ''}
                </p>
                <p className="text-slate-400">
                  {detail.viewing.isConfirmed
                    ? `Confirmed ${detail.viewing.confirmedAt ? new Date(detail.viewing.confirmedAt).toLocaleString() : ''}`
                    : 'Not confirmed yet'}
                </p>
                <p className="text-slate-500">Agent: {detail.viewing.assignedAgent || 'unassigned'}</p>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 text-[11px] space-y-1">
              <p className="font-bold text-white flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-300" /> Money
              </p>
              <p className="text-slate-300">{detail.financial.note}</p>
              {detail.financial.feeRecorded && (
                <p className="text-slate-300">
                  Collected {money(detail.financial.collectedGhs)} · state{' '}
                  {detail.financial.collectionState.replace(/_/g, ' ')} · Goodlucks share{' '}
                  {money(detail.financial.goodlucksShareGhs)}
                </p>
              )}
              {detail.viewing.feeSource === 'platform_policy' ? (
                <>
                  <p className="text-slate-400">
                    This is a landlord listing: the viewing fee is set by Goodlucks Homes and paid to Goodlucks after the
                    viewing. Record it under Finance → Landlord fees once the viewing is complete — it is never an agent
                    collection.
                  </p>
                  <p className="text-slate-500">
                    Fee on this viewing: {detail.viewing.feeAmountGhs > 0 ? money(detail.viewing.feeAmountGhs) : 'none'} ·{' '}
                    {detail.viewing.viewingFeePaid ? 'recorded as received' : 'not yet recorded'}
                  </p>
                </>
              ) : (
                <>
                  <label className="flex items-center gap-2 pt-1 text-slate-300">
                    <input
                      type="checkbox"
                      checked={feePaid}
                      disabled={busy}
                      onChange={(event) => void setFee(event.target.checked)}
                    />
                    Staff recorded a viewing fee collected by the agent on site
                  </label>
                  <p className="text-slate-500">
                    This is a record of a collection, not a payment to Goodlucks and not revenue.
                  </p>
                </>
              )}
            </div>

            <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 text-[11px] space-y-2">
              <p className="font-bold text-white flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-[#08D9D6]" /> Responsible agent
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <select
                  value={agentUserId}
                  onChange={(event) => setAgentUserId(event.target.value)}
                  className="flex-1 min-w-[200px] bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-white"
                >
                  <option value="">Choose an active agent…</option>
                  {agents.map((agent) => (
                    <option key={agent.userId} value={agent.userId}>
                      {agent.name} · {agent.agentTierLabel ?? 'Standard agent'} · {agent.accountStatus}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => void assign()}
                  disabled={busy || !agentUserId}
                  className="px-3 py-1.5 rounded-lg bg-[#08D9D6] text-[#252A34] font-bold disabled:opacity-50"
                >
                  Assign
                </button>
              </div>
              <p className="text-slate-500">
                Only an active agent account can be assigned. Reassigning is audited and never rewrites past financial
                records.
              </p>
            </div>

            <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 text-[11px] space-y-2">
              <p className="font-bold text-white flex items-center gap-1.5">
                {canCorrect ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> : <Lock className="w-3.5 h-3.5 text-amber-300" />}
                Correct this record
              </p>
              {canCorrect ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={correctionStatus}
                      onChange={(event) => setCorrectionStatus(event.target.value as ViewingStatus)}
                      className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-white"
                    >
                      {[
                        'cancelled',
                        'completed',
                        'tenant_no_show',
                        'agent_no_show',
                        'could_not_proceed',
                        'confirmed',
                        'viewing_requested',
                      ].map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why is this record being corrected? At least 10 characters; it goes in the audit trail."
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-white"
                  />
                  <button
                    onClick={() => void correct()}
                    disabled={busy || reason.trim().length < 10}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-200 font-bold disabled:opacity-50"
                  >
                    Record correction
                  </button>
                </>
              ) : (
                <p className="text-slate-400">
                  Correcting a viewing is an exceptional action and needs the viewing-correction capability. Ask a server
                  administrator to grant it with{' '}
                  <code className="text-[#08D9D6]">php php-backend/grant_viewing.php --email=… --correct=1</code>.
                </p>
              )}
            </div>

            <div>
              <p className="text-[11px] font-bold text-white mb-1 flex items-center gap-1.5">
                <Clock3 className="w-3.5 h-3.5" /> History
              </p>
              <ul className="space-y-1 max-h-64 overflow-y-auto">
                {detail.history.map((event) => (
                  <li key={event.id} className="text-[10px] text-slate-300 bg-slate-900/70 rounded-lg px-2 py-1.5">
                    <span className="font-bold text-white">{event.action.replace('viewing.', '')}</span>{' '}
                    {event.fromStatus && event.toStatus ? `${event.fromStatus} → ${event.toStatus}` : ''}
                    <span className="text-slate-500">
                      {' '}
                      · {event.actorRole || 'system'}
                      {event.actorName ? ` (${event.actorName})` : ''} · {new Date(event.at).toLocaleString()}
                    </span>
                    {(event.previousDate || event.newDate) && (
                      <span className="text-slate-400">
                        {' '}
                        · {event.previousDate || '—'} → {event.newDate || '—'}
                      </span>
                    )}
                    {event.note && <p className="text-slate-400 mt-0.5">{event.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const AdminViewingsPanel: React.FC = () => {
  const { showErrorToast } = useApp();
  const [viewings, setViewings] = useState<ViewingSchedule[]>([]);
  const [counts, setCounts] = useState<ViewingCounts | null>(null);
  const [status, setStatus] = useState<'' | ViewingStatus>('');
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.listAllViewings(status ? { status } : {});
      setViewings(result.viewings);
      setCounts(result.counts ?? null);
    } catch (err) {
      showErrorToast('Could not load viewings', messageForError(err));
    } finally {
      setIsLoading(false);
    }
  }, [status, showErrorToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return viewings.filter((viewing) => {
      if (overdueOnly && !viewing.overdue) return false;
      if (!term) return true;
      return (
        viewing.propertyTitle.toLowerCase().includes(term) ||
        viewing.tenantName.toLowerCase().includes(term) ||
        viewing.tenantPhone.toLowerCase().includes(term) ||
        viewing.assignedAgent.toLowerCase().includes(term)
      );
    });
  }, [viewings, search, overdueOnly]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Viewing operations</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Requests, agreed appointments and their history. Confirmed means a time was agreed — it does not mean anyone
            paid, and completing a viewing records no money.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: 'Total', value: counts?.total ?? visible.length },
          { label: 'Awaiting', value: counts?.unresolved ?? 0 },
          { label: 'Confirmed', value: counts?.confirmed ?? 0 },
          { label: 'Completed', value: counts?.completed ?? 0 },
          { label: 'Cancelled', value: counts?.cancelled ?? 0 },
          { label: 'Overdue', value: counts?.overdue ?? 0 },
        ].map((card) => (
          <div key={card.label} className="bg-slate-800 border border-white/10 rounded-2xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">{card.label}</div>
            <div className={`text-xl font-black ${card.label === 'Overdue' && card.value > 0 ? 'text-[#FF8FA8]' : 'text-white'}`}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search property, tenant, phone or agent"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-xs text-white"
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as '' | ViewingStatus)}
          className="px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-xs text-white"
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-white/10 text-xs text-slate-300">
          <input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />
          Overdue only
        </label>
      </div>

      {isLoading && viewings.length === 0 ? (
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading viewings…
        </p>
      ) : visible.length === 0 ? (
        <div className="bg-slate-800/60 border border-white/10 rounded-2xl p-6 text-xs text-slate-400">
          No viewings match this filter.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((viewing) => (
            <div
              key={viewing.id}
              className="bg-slate-800 border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#08D9D6] truncate">{viewing.propertyTitle}</span>
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${TONES[viewing.status]}`}>
                    {viewing.statusLabel}
                  </span>
                  {viewing.overdue && (
                    <span className="px-2 py-0.5 rounded-full border text-[10px] font-bold bg-[#FF2E63]/15 text-[#FF8FA8] border-[#FF2E63]/30">
                      Overdue
                    </span>
                  )}
                  {viewing.requestType === 'enquiry' && (
                    <span className="text-[10px] text-slate-400">enquiry</span>
                  )}
                </div>
                <p className="text-xs text-white">
                  {viewing.tenantName} · {viewing.tenantPhone}
                </p>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 flex-wrap">
                  <MapPin className="w-3 h-3" /> {viewing.propertyLocation}
                  <span className="text-slate-600">|</span>
                  <Calendar className="w-3 h-3" /> {viewing.date || 'no slot'} {viewing.time ? `at ${viewing.time}` : ''}
                  <span className="text-slate-600">|</span>
                  agent: {viewing.assignedAgent || 'unassigned'}
                </p>
                <p className="text-[10px] text-slate-500">
                  {viewing.isConfirmed
                    ? 'Agreed appointment'
                    : 'Not confirmed — a request only'}
                  {viewing.viewingFeePaid ? ' · fee collection recorded' : ' · no fee recorded'}
                </p>
              </div>

              <button
                onClick={() => setOpenId(viewing.id)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold flex items-center gap-1.5 shrink-0 self-start sm:self-center"
              >
                <Eye className="w-3.5 h-3.5" /> Open
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-500 flex items-start gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Administrators can read every viewing. Correcting one is a separate, audited capability, and a suspended
        agent&apos;s records stay here even though the agent can no longer open them.
      </p>

      {openId && (
        <DetailPanel
          viewingId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
};
