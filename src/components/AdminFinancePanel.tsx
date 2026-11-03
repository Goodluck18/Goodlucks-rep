import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  FileWarning,
  Loader2,
  Plus,
  Receipt,
  RotateCcw,
  Scale,
  ShieldAlert,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import type {
  FinanceReconciliationSummary,
  RentalCommission,
  RentalCommissionStatus,
  RemittanceSubmission,
  ViewingFeeRecord,
} from '../types';

/**
 * Admin finance panel (Increment G).
 *
 * The panel is careful about one thing above all: a claim is not money.
 *   1. what agents report collecting      → reported, never revenue
 *   2. what Goodlucks is owed             → entitlement
 *   3. what agents say they sent          → a claim, awaiting confirmation
 *   4. what Goodlucks has confirmed       → the only figure that is revenue
 *
 * Confirmation buttons only exist for an account holding `financeConfirm`. An
 * account with `financeView` alone sees everything and can change nothing; the
 * server enforces that even if the button is forced.
 */

const money = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? '—'
    : `GH₵ ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const remittanceStyles: Record<RemittanceSubmission['status'], string> = {
  submitted: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  confirmed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-[#FF2E63]/15 text-[#FF8FA8] border-[#FF2E63]/30',
  disputed: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
};

const commissionStyles: Record<RentalCommissionStatus, string> = {
  draft: 'bg-slate-500/20 text-slate-300 border-white/10',
  awaiting_agreement: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  agreed: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  due: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  partially_paid: 'bg-[#08D9D6]/15 text-[#08D9D6] border-[#08D9D6]/30',
  paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  disputed: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  cancelled: 'bg-slate-500/20 text-slate-400 border-white/10',
  corrected: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
};

type Tab = 'remittances' | 'commissions' | 'adjustments';

export const AdminFinancePanel: React.FC = () => {
  const { currentUser, showSuccessToast, showErrorToast, properties } = useApp();
  const canConfirm = Boolean(currentUser?.capabilities?.financeConfirm);

  const [tab, setTab] = useState<Tab>('remittances');
  const [summary, setSummary] = useState<FinanceReconciliationSummary | null>(null);
  const [remittances, setRemittances] = useState<RemittanceSubmission[]>([]);
  const [commissions, setCommissions] = useState<RentalCommission[]>([]);
  const [feeRecords, setFeeRecords] = useState<ViewingFeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Confirm form state, keyed by submission id.
  const [allocations, setAllocations] = useState<Record<string, { viewingFeeRecordId: string; amountGhs: string }[]>>({});
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});

  // Commission create form.
  const [showCreate, setShowCreate] = useState(false);
  const [newCommission, setNewCommission] = useState({
    propertyId: '',
    amountGhs: '',
    agentUserId: '',
    rentalReference: '',
    dueDate: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, remittanceRes, commissionRes, ledgerRes] = await Promise.all([
        api.financeSummary(),
        api.listRemittances(),
        api.listCommissions(),
        api.listViewingFees(),
      ]);
      setSummary(summaryRes.summary);
      setRemittances(remittanceRes.remittances);
      setCommissions(commissionRes.commissions);
      setFeeRecords(ledgerRes.records);
    } catch (error) {
      showErrorToast(messageForError(error));
    } finally {
      setLoading(false);
    }
  }, [showErrorToast]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Obligations this agent still owes money on — the only eligible allocation targets. */
  const eligibleRecords = useCallback(
    (agentUserId: string) =>
      feeRecords.filter(
        (record) =>
          record.agentUserId === agentUserId && record.goodlucksShareGhs !== null && (record.outstandingGhs ?? 0) > 0
      ),
    [feeRecords]
  );

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
      await load();
    } catch (error) {
      showErrorToast(messageForError(error));
    } finally {
      setBusy(null);
    }
  };

  const confirmRemittance = (submission: RemittanceSubmission) => {
    const rows = (allocations[submission.id] ?? []).filter((row) => row.viewingFeeRecordId && Number(row.amountGhs) > 0);
    void runAction(`confirm-${submission.id}`, async () => {
      await api.confirmRemittance(submission.id, {
        allocations: rows.map((row) => ({
          viewingFeeRecordId: row.viewingFeeRecordId,
          amountGhs: Number(row.amountGhs),
        })),
        note: decisionReason[submission.id] || undefined,
      });
      showSuccessToast(`Remittance ${submission.reference} confirmed and recorded in the ledger.`);
      setAllocations((prev) => ({ ...prev, [submission.id]: [] }));
      setDecisionReason((prev) => ({ ...prev, [submission.id]: '' }));
    });
  };

  const decide = (submission: RemittanceSubmission, status: 'rejected' | 'disputed') => {
    void runAction(`${status}-${submission.id}`, async () => {
      await api.decideRemittance(submission.id, {
        status,
        reason: decisionReason[submission.id] ?? '',
      });
      showSuccessToast(`Remittance ${submission.reference} marked ${status}.`);
    });
  };

  const commissionTotals = summary?.rentalCommissions;
  const totals = summary?.viewingFees;
  const claims = summary?.remittances;

  const propertiesById = useMemo(() => {
    const map = new Map<string, string>();
    properties.forEach((property) => map.set(property.id, property.title));
    return map;
  }, [properties]);

  if (loading && !summary) {
    return (
      <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the money position…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!canConfirm && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-200 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            You can read financial records but not confirm money. Confirming receipt, allocating it,
            rejecting, reversing and running commissions need the remittance-confirmation capability,
            which is granted from the server console.
          </span>
        </div>
      )}

      {/* Reconciliation summary */}
      <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-[#08D9D6]" />
          <h2 className="text-sm font-bold">Reconciliation</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-[11px] text-slate-400">Collected by agents</p>
            <p className="text-lg font-bold text-white">{money(totals?.collectedGhs)}</p>
            <p className="text-[10px] text-slate-500">Reported by agents. Not revenue.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
            <p className="text-[11px] text-slate-400">Owed to Goodlucks</p>
            <p className="text-lg font-bold text-[#08D9D6]">{money(totals?.entitledGhs)}</p>
            <p className="text-[10px] text-slate-500">Under explicit agreements or approved policies.</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-[11px] text-emerald-200/80">Confirmed receipts</p>
            <p className="text-lg font-bold text-emerald-300">{money(totals?.receivedGhs)}</p>
            <p className="text-[10px] text-emerald-200/60">Money Goodlucks has actually received.</p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-[11px] text-amber-200/80">Outstanding viewings</p>
            <p className="text-lg font-bold text-amber-300">{money(totals?.outstandingGhs)}</p>
            <p className="text-[10px] text-amber-200/60">Still owed on agreed shares.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-[11px]">
          <div className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
            <span className="text-slate-400">Claims awaiting confirmation</span>
            <div className="flex items-baseline justify-between">
              <span className="font-bold text-amber-300">{money(claims?.reportedAwaitingConfirmationGhs)}</span>
              <span className="text-slate-500">{claims?.awaitingConfirmationCount ?? 0} claims</span>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
            <span className="text-slate-400">Applied to obligations</span>
            <p className="font-bold text-white">{money(claims?.appliedToObligationsGhs)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
            <span className="text-slate-400">Confirmed, not yet allocated</span>
            <p className="font-bold text-[#08D9D6]">{money(claims?.unallocatedGhs)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
            <span className="text-slate-400">Rejected / disputed claims</span>
            <p className="font-bold text-[#FF8FA8]">
              {claims?.rejectedCount ?? 0} / {claims?.disputedCount ?? 0}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-[11px]">
          <div className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
            <span className="text-slate-400">Commissions agreed</span>
            <p className="font-bold text-white">{money(commissionTotals?.agreedGhs)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
            <span className="text-slate-400">Commission received</span>
            <p className="font-bold text-emerald-300">{money(commissionTotals?.receivedGhs)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
            <span className="text-slate-400">Commission outstanding</span>
            <p className="font-bold text-amber-300">{money(commissionTotals?.outstandingGhs)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2">
            <span className="text-slate-400">Adjustments / reversals</span>
            <p className="font-bold text-purple-300">
              {summary?.adjustments.count ?? 0} · {money(summary?.adjustments.netGhs)}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 leading-snug">
          {summary?.confirmedRevenue.note ??
            'Only confirmed money counts as revenue. Reported collections and unconfirmed claims never do.'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['remittances', 'Remittances'],
            ['commissions', 'Rental commissions'],
            ['adjustments', 'Adjustments & reversals'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border ${
              tab === key
                ? 'bg-[#08D9D6] text-[#252A34] border-[#08D9D6]'
                : 'bg-slate-800 text-slate-300 border-white/10 hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'remittances' && (
        <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-[#08D9D6]" />
            <h2 className="text-sm font-bold">Remittance claims</h2>
            <span className="text-[11px] text-slate-500 ml-auto">{remittances.length} total</span>
          </div>

          {remittances.length === 0 ? (
            <p className="text-xs text-slate-400">No agent has submitted a remittance yet.</p>
          ) : (
            <ul className="space-y-3">
              {remittances.map((submission) => {
                const rows = allocations[submission.id] ?? [];
                const eligible = eligibleRecords(submission.agentUserId);
                const open = submission.status === 'submitted' || submission.status === 'disputed';
                return (
                  <li key={submission.id} className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-300">{submission.reference}</span>
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] ${remittanceStyles[submission.status]}`}>
                        {submission.statusLabel}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {submission.agentName} · sent {submission.paidAt} · {submission.method.replace('_', ' ')}
                        {submission.paymentReference ? ` · ${submission.paymentReference}` : ''}
                      </span>
                      <span className="text-sm font-bold text-white ml-auto">{money(submission.amountGhs)}</span>
                    </div>

                    {submission.status === 'confirmed' && (
                      <p className="text-[11px] text-emerald-300 flex flex-wrap items-center gap-2">
                        <CheckCircle2 className="w-3 h-3" />
                        Confirmed {money(submission.confirmedGhs)} received · applied{' '}
                        {money(submission.allocatedGhs)}
                        {submission.unallocatedGhs ? ` · unmatched ${money(submission.unallocatedGhs)}` : ''}
                      </p>
                    )}

                    {submission.decisionReason && (
                      <p className="text-[11px] text-slate-400">Note / reason: {submission.decisionReason}</p>
                    )}

                    {submission.allocations.length > 0 && (
                      <ul className="text-[10px] text-slate-500 space-y-0.5">
                        {submission.allocations.map((allocation) => (
                          <li key={allocation.id}>
                            Applied {money(allocation.amountGhs)} to {allocation.reference}{' '}
                            {allocation.propertyTitle ? `(${allocation.propertyTitle})` : ''}
                          </li>
                        ))}
                      </ul>
                    )}

                    {open && canConfirm && (
                      <div className="space-y-2 border-t border-white/5 pt-3">
                        <p className="text-[11px] text-slate-400">
                          Allocate the money to what this agent owes. Anything left over stays visible as
                          unmatched funds — it is never attached to an obligation twice.
                        </p>
                        {eligible.length === 0 && (
                          <p className="text-[11px] text-amber-300 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> No outstanding obligation to allocate to.
                            You can still confirm receipt; the money will show as unmatched.
                          </p>
                        )}
                        {rows.map((row, index) => (
                          <div key={index} className="flex flex-wrap gap-2 items-center">
                            <select
                              value={row.viewingFeeRecordId}
                              onChange={(event) => {
                                const next = [...rows];
                                next[index] = { ...next[index], viewingFeeRecordId: event.target.value };
                                setAllocations((prev) => ({ ...prev, [submission.id]: next }));
                              }}
                              className="rounded-lg bg-slate-900/60 border border-white/10 px-2 py-1 text-[11px] text-white"
                            >
                              <option value="">Choose an obligation…</option>
                              {eligible.map((record) => (
                                <option key={record.id} value={record.id}>
                                  {record.reference} · outstanding {record.outstandingGhs?.toFixed(2)}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.amountGhs}
                              onChange={(event) => {
                                const next = [...rows];
                                next[index] = { ...next[index], amountGhs: event.target.value };
                                setAllocations((prev) => ({ ...prev, [submission.id]: next }));
                              }}
                              className="w-24 rounded-lg bg-slate-900/60 border border-white/10 px-2 py-1 text-[11px] text-white"
                              placeholder="Amount"
                            />
                            <button
                              onClick={() => {
                                const next = rows.filter((_, i) => i !== index);
                                setAllocations((prev) => ({ ...prev, [submission.id]: next }));
                              }}
                              className="text-[10px] text-slate-400 hover:text-white"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2 items-center">
                          <button
                            onClick={() => setAllocations((prev) => ({
                              ...prev,
                              [submission.id]: [...rows, { viewingFeeRecordId: '', amountGhs: '' }],
                            }))}
                            className="text-[11px] text-[#08D9D6] inline-flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add allocation
                          </button>
                          <input
                            type="text"
                            value={decisionReason[submission.id] ?? ''}
                            onChange={(event) =>
                              setDecisionReason((prev) => ({ ...prev, [submission.id]: event.target.value }))
                            }
                            className="flex-1 min-w-[180px] rounded-lg bg-slate-900/60 border border-white/10 px-2 py-1 text-[11px] text-white"
                            placeholder="Note or reason (required to reject or dispute)"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => confirmRemittance(submission)}
                            disabled={busy === `confirm-${submission.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-[11px] font-bold text-emerald-200 disabled:opacity-50"
                          >
                            {busy === `confirm-${submission.id}` ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <BadgeCheck className="w-3 h-3" />
                            )}
                            Confirm money received
                          </button>
                          <button
                            onClick={() => decide(submission, 'disputed')}
                            disabled={busy === `disputed-${submission.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/15 border border-orange-500/40 px-3 py-1.5 text-[11px] font-bold text-orange-200 disabled:opacity-50"
                          >
                            <FileWarning className="w-3 h-3" /> Dispute
                          </button>
                          <button
                            onClick={() => decide(submission, 'rejected')}
                            disabled={busy === `rejected-${submission.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF2E63]/15 border border-[#FF2E63]/40 px-3 py-1.5 text-[11px] font-bold text-[#FF8FA8] disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === 'commissions' && (
        <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[#08D9D6]" />
            <h2 className="text-sm font-bold">Rental commissions</h2>
            {canConfirm && (
              <button
                onClick={() => setShowCreate((value) => !value)}
                className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[#08D9D6] px-3 py-1.5 text-[11px] font-bold text-[#252A34]"
              >
                <Plus className="w-3 h-3" /> Record agreement
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-500 leading-snug">
            A commission exists only because someone recorded an actual agreement. Nothing here is
            generated from a rental, a viewing or a listing, and no percentage is applied unless an
            approved policy prices it. Ghana tax and licensing treatment of these arrangements still
            needs professional review.
          </p>

          {showCreate && canConfirm && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-2">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <select
                  value={newCommission.propertyId}
                  onChange={(event) => setNewCommission((prev) => ({ ...prev, propertyId: event.target.value }))}
                  className="rounded-lg bg-slate-900/60 border border-white/10 px-2 py-1.5 text-[11px] text-white"
                >
                  <option value="">Property…</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {propertiesById.get(property.id) ?? property.title}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Agreed commission (GHS)"
                  value={newCommission.amountGhs}
                  onChange={(event) => setNewCommission((prev) => ({ ...prev, amountGhs: event.target.value }))}
                  className="rounded-lg bg-slate-900/60 border border-white/10 px-2 py-1.5 text-[11px] text-white"
                />
                <input
                  type="text"
                  placeholder="Rental agreement reference"
                  value={newCommission.rentalReference}
                  onChange={(event) => setNewCommission((prev) => ({ ...prev, rentalReference: event.target.value }))}
                  className="rounded-lg bg-slate-900/60 border border-white/10 px-2 py-1.5 text-[11px] text-white"
                />
                <input
                  type="date"
                  value={newCommission.dueDate}
                  onChange={(event) => setNewCommission((prev) => ({ ...prev, dueDate: event.target.value }))}
                  className="rounded-lg bg-slate-900/60 border border-white/10 px-2 py-1.5 text-[11px] text-white"
                />
                <input
                  type="text"
                  placeholder="Notes: who agreed, on what basis"
                  value={newCommission.notes}
                  onChange={(event) => setNewCommission((prev) => ({ ...prev, notes: event.target.value }))}
                  className="rounded-lg bg-slate-900/60 border border-white/10 px-2 py-1.5 text-[11px] text-white sm:col-span-2"
                />
              </div>
              <button
                onClick={() =>
                  runAction('create-commission', async () => {
                    await api.createCommission({
                      propertyId: newCommission.propertyId,
                      amountGhs: newCommission.amountGhs ? Number(newCommission.amountGhs) : undefined,
                      rentalReference: newCommission.rentalReference || undefined,
                      dueDate: newCommission.dueDate || undefined,
                      notes: newCommission.notes || undefined,
                    });
                    showSuccessToast('Commission drafted. It stays out of revenue until money is received.');
                    setShowCreate(false);
                    setNewCommission({ propertyId: '', amountGhs: '', agentUserId: '', rentalReference: '', dueDate: '', notes: '' });
                  })
                }
                className="rounded-lg bg-[#08D9D6] px-3 py-1.5 text-[11px] font-bold text-[#252A34]"
              >
                Create draft commission
              </button>
            </div>
          )}

          {commissions.length === 0 ? (
            <p className="text-xs text-slate-400">No rental commission has been recorded.</p>
          ) : (
            <ul className="space-y-3">
              {commissions.map((commission) => (
                <li key={commission.id} className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-300">{commission.reference}</span>
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] ${commissionStyles[commission.status]}`}>
                      {commission.statusLabel}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {commission.propertyTitle || 'Property'} · {commission.rentalReference || 'no agreement reference yet'}
                    </span>
                    <span className="text-sm font-bold text-white ml-auto">{money(commission.amountGhs)}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Received {money(commission.receivedGhs)} · outstanding {money(commission.outstandingGhs)} ·
                    basis {commission.basis === 'policy_snapshot' ? 'approved policy snapshot' : 'recorded agreement'}
                  </p>
                  {commission.payments.length > 0 && (
                    <ul className="text-[10px] text-slate-500 space-y-0.5">
                      {commission.payments.map((payment) => (
                        <li key={payment.id}>
                          {payment.entryType === 'reversal' ? 'Reversal' : 'Receipt'} {money(payment.amountGhs)} on{' '}
                          {payment.receivedAt}
                        </li>
                      ))}
                    </ul>
                  )}

                  {canConfirm && (
                    <div className="flex flex-wrap gap-2 border-t border-white/5 pt-2">
                      {(['awaiting_agreement', 'agreed', 'due'] as RentalCommissionStatus[])
                        .filter((status) => status !== commission.status)
                        .map((status) => (
                          <button
                            key={status}
                            onClick={() =>
                              runAction(`status-${commission.id}-${status}`, async () => {
                                await api.setCommissionStatus(commission.id, {
                                  status,
                                  reason: decisionReason[commission.id] || undefined,
                                });
                                showSuccessToast(`Commission moved to ${status.replace('_', ' ')}.`);
                              })
                            }
                            className="rounded-lg bg-slate-800 border border-white/10 px-2 py-1 text-[10px] text-slate-300"
                          >
                            Mark {status.replace('_', ' ')}
                          </button>
                        ))}
                      <button
                        onClick={() =>
                          runAction(`pay-${commission.id}`, async () => {
                            const amount = Number(
                              window.prompt(`Amount received against ${commission.reference} (GHS)`) ?? ''
                            );
                            if (!Number.isFinite(amount) || amount <= 0) return;
                            await api.addCommissionPayment(commission.id, {
                              amountGhs: amount,
                              receivedAt: new Date().toISOString().slice(0, 10),
                              method: 'bank_transfer',
                            });
                            showSuccessToast('Commission payment recorded against the agreement.');
                          })
                        }
                        className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2 py-1 text-[10px] text-emerald-200"
                      >
                        Record payment
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'adjustments' && (
        <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-[#08D9D6]" />
            <h2 className="text-sm font-bold">Adjustments and reversals</h2>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            A confirmed receipt is never edited or deleted. A correction is a new record linked to the
            original, with the amount, the reason and the person who authorised it.
          </p>
          {(summary?.adjustments.recent.length ?? 0) === 0 ? (
            <p className="text-xs text-slate-400">No financial adjustment has been recorded.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {summary?.adjustments.recent.map((adjustment) => (
                <li key={adjustment.id} className="py-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-mono text-slate-400">{adjustment.subjectType}</span>
                  <span className="text-slate-500">{adjustment.kind}</span>
                  <span className={`font-bold ${adjustment.amountGhs < 0 ? 'text-[#FF8FA8]' : 'text-emerald-300'}`}>
                    {money(adjustment.amountGhs)}
                  </span>
                  <span className="text-slate-400 flex-1 min-w-[200px]">{adjustment.reason}</span>
                  <span className="text-slate-500">{adjustment.createdAt?.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-2">
        <div className="flex items-center gap-2">
          <Banknote className="w-4 h-4 text-[#08D9D6]" />
          <h2 className="text-sm font-bold">Where the numbers come from</h2>
        </div>
        <ul className="text-[11px] text-slate-400 space-y-1 list-disc pl-4">
          <li>Collected: what agents reported taking from tenants. Never revenue.</li>
          <li>Owed: the Goodlucks share set by an explicit agreement or an approved policy snapshot.</li>
          <li>Claimed: what an agent says they sent. Not money until confirmed.</li>
          <li>Confirmed: what finance has verified in the account. The only revenue figure.</li>
          <li>Commissions: recorded separately from viewing fees, never generated automatically.</li>
        </ul>
      </div>
    </div>
  );
};
