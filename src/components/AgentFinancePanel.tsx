import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock3,
  Info,
  Loader2,
  Receipt,
  Send,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import type { AgentFinanceOverview, RemittanceSubmission } from '../types';

/**
 * Agent finance panel (Increment G).
 *
 * Four numbers are shown side by side and never merged:
 *   1. what the agent says they collected from tenants (not Goodlucks revenue),
 *   2. what Goodlucks is entitled to under an explicit agreement,
 *   3. what the agent says they have sent (a claim, not a receipt),
 *   4. what Goodlucks has confirmed receiving.
 *
 * An agent can submit a remittance but can never confirm one. The panel has no
 * confirmation control at all, and the server refuses the call regardless of
 * what the browser sends.
 */

const money = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? '—'
    : `GH₵ ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusStyles: Record<RemittanceSubmission['status'], string> = {
  submitted: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  confirmed: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  rejected: 'bg-accent/15 text-ink border-accent/30',
  disputed: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
};

const statusLabels: Record<RemittanceSubmission['status'], string> = {
  submitted: 'Awaiting confirmation',
  confirmed: 'Confirmed received',
  rejected: 'Rejected',
  disputed: 'Disputed',
};

const METHODS = [
  { value: 'momo', label: 'Mobile money' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash handed over' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

export const AgentFinancePanel: React.FC<{ operational?: boolean }> = ({ operational = true }) => {
  const { showSuccessToast, showErrorToast } = useApp();
  const [finance, setFinance] = useState<AgentFinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('momo');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [paymentReference, setPaymentReference] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.agentFinance();
      setFinance(res.finance);
    } catch (error) {
      showErrorToast(messageForError(error));
    } finally {
      setLoading(false);
    }
  }, [showErrorToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const obligations = useMemo(
    () => (finance?.viewingFees ?? []).filter((record) => record.countsInTotals),
    [finance]
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFieldErrors({ amountGhs: 'Enter the amount you sent, greater than zero.' });
      return;
    }

    setSaving(true);
    try {
      const res = await api.submitRemittance({
        amountGhs: parsed,
        method,
        paidAt,
        paymentReference: paymentReference.trim() || undefined,
        evidenceReference: evidenceReference.trim() || undefined,
        note: note.trim() || undefined,
      });
      showSuccessToast(
        `Remittance ${res.remittance.reference} submitted. It counts as received only after Goodlucks finance confirms it.`
      );
      setAmount('');
      setPaymentReference('');
      setEvidenceReference('');
      setNote('');
      await load();
    } catch (error) {
      const apiError = error as { fields?: Record<string, string> };
      setFieldErrors(apiError?.fields ?? {});
      setFormError(messageForError(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !finance) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-6 flex items-center gap-2 text-xs text-ink/70">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your money records…
      </div>
    );
  }

  const totals = finance?.totals;
  const canSubmit = Boolean(finance?.capabilities.canSubmitRemittances) && operational;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-ink" />
            <h2 className="text-sm font-bold">Your money position</h2>
          </div>
          <span className="text-[11px] text-ink/70">All amounts in GHS</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[11px] text-ink/70">Collected from tenants</p>
            <p className="text-lg font-bold text-ink">{money(totals?.collectedGhs)}</p>
            <p className="text-[10px] text-ink/70 leading-snug mt-1">
              What you reported collecting. Not Goodlucks revenue.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[11px] text-ink/70">Payable to Goodlucks</p>
            <p className="text-lg font-bold text-ink">{money(totals?.payableToGoodlucksGhs)}</p>
            <p className="text-[10px] text-ink/70 leading-snug mt-1">
              Only where a share has been explicitly agreed or an approved policy applies.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-[11px] text-emerald-800/80">Confirmed received</p>
            <p className="text-lg font-bold text-emerald-700">{money(totals?.confirmedReceivedGhs)}</p>
            <p className="text-[10px] text-emerald-800/60 leading-snug mt-1">
              Money Goodlucks finance has actually confirmed receiving from you.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-[11px] text-amber-800/80">Outstanding</p>
            <p className="text-lg font-bold text-amber-700">{money(totals?.outstandingGhs)}</p>
            <p className="text-[10px] text-amber-800/60 leading-snug mt-1">
              Still owed on agreed shares after confirmed receipts.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 text-[11px]">
          <div className="rounded-xl border border-line bg-surface px-3 py-2 flex items-center gap-2">
            <Clock3 className="w-3.5 h-3.5 text-amber-700" />
            <span className="text-ink/70">Awaiting confirmation</span>
            <span className="ml-auto font-bold text-amber-700">{money(totals?.awaitingConfirmationGhs)}</span>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-2 flex items-center gap-2">
            <XCircle className="w-3.5 h-3.5 text-ink" />
            <span className="text-ink/70">Rejected claims</span>
            <span className="ml-auto font-bold text-ink">{totals?.rejectedRemittances ?? 0}</span>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-700" />
            <span className="text-ink/70">Disputed claims</span>
            <span className="ml-auto font-bold text-orange-700">{totals?.disputedRemittances ?? 0}</span>
          </div>
        </div>

        <p className="text-[11px] text-ink/70 leading-snug flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ink/70" />
          Submitting a remittance is a claim. Nothing you submit becomes revenue until a Goodlucks
          administrator confirms the money arrived. You cannot confirm your own remittance and you
          cannot see another agent's figures.
        </p>
      </div>

      {/* Submit a remittance */}
      <form
        onSubmit={submit}
        className="bg-surface border border-line rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-ink" />
          <h2 className="text-sm font-bold">Report a remittance</h2>
        </div>

        {!canSubmit && (
          <p className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
            Your agent account is not active, so new remittances cannot be submitted. Your existing
            records stay visible.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-[11px] text-ink/70 space-y-1">
            Amount sent (GHS)
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-page border border-line px-3 py-2 text-sm text-ink disabled:opacity-50"
              placeholder="0.00"
            />
            {fieldErrors.amountGhs && <span className="block text-[10px] text-ink">{fieldErrors.amountGhs}</span>}
          </label>

          <label className="text-[11px] text-ink/70 space-y-1">
            How it was sent
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-page border border-line px-3 py-2 text-sm text-ink disabled:opacity-50"
            >
              {METHODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[11px] text-ink/70 space-y-1">
            Date sent
            <input
              type="date"
              value={paidAt}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setPaidAt(event.target.value)}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-page border border-line px-3 py-2 text-sm text-ink disabled:opacity-50"
            />
            {fieldErrors.paidAt && <span className="block text-[10px] text-ink">{fieldErrors.paidAt}</span>}
          </label>

          <label className="text-[11px] text-ink/70 space-y-1">
            Transfer / cheque reference
            <input
              type="text"
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-page border border-line px-3 py-2 text-sm text-ink disabled:opacity-50"
              placeholder="e.g. MoMo transaction id"
            />
            {fieldErrors.paymentReference && (
              <span className="block text-[10px] text-ink">{fieldErrors.paymentReference}</span>
            )}
          </label>

          <label className="text-[11px] text-ink/70 space-y-1">
            Evidence reference (optional)
            <input
              type="text"
              value={evidenceReference}
              onChange={(event) => setEvidenceReference(event.target.value)}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-page border border-line px-3 py-2 text-sm text-ink disabled:opacity-50"
              placeholder="Receipt or slip reference held by you"
            />
          </label>

          <label className="text-[11px] text-ink/70 space-y-1">
            Note (optional)
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={!canSubmit}
              className="w-full rounded-xl bg-page border border-line px-3 py-2 text-sm text-ink disabled:opacity-50"
              placeholder="Which viewings this covers"
            />
          </label>
        </div>

        {formError && <p className="text-[11px] text-ink">{formError}</p>}

        <button
          type="submit"
          disabled={!canSubmit || saving}
          className="gl-btn gl-btn-primary px-4 py-2 text-xs"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Submit remittance claim
        </button>
      </form>

      {/* Obligations */}
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Banknote className="w-4 h-4 text-ink" />
          <h2 className="text-sm font-bold">Viewing-fee obligations</h2>
        </div>

        {obligations.length === 0 ? (
          <p className="text-xs text-ink/70">No viewing fees have been recorded for you yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-ink/70 text-left">
                <tr>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">Property</th>
                  <th className="py-2 pr-3">Collected</th>
                  <th className="py-2 pr-3">Owed to Goodlucks</th>
                  <th className="py-2 pr-3">Confirmed received</th>
                  <th className="py-2 pr-3">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {obligations.map((record) => (
                  <tr key={record.id}>
                    <td className="py-2 pr-3 font-mono text-ink/70">{record.reference}</td>
                    <td className="py-2 pr-3 text-ink/70">{record.propertyTitle || '—'}</td>
                    <td className="py-2 pr-3">{money(record.feeTotalGhs)}</td>
                    <td className="py-2 pr-3">{money(record.goodlucksShareGhs)}</td>
                    <td className="py-2 pr-3 text-emerald-700">{money(record.remittedGhs)}</td>
                    <td className="py-2 pr-3 text-amber-700">{money(record.outstandingGhs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-ink/70">
          "Owed to Goodlucks" appears only where a share was agreed explicitly or an approved policy
          applied. A dash means no arrangement exists yet — it is not zero.
        </p>
      </div>

      {/* History */}
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-ink" />
          <h2 className="text-sm font-bold">Remittance history</h2>
        </div>

        {(finance?.remittances.length ?? 0) === 0 ? (
          <p className="text-xs text-ink/70">You have not submitted a remittance yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {finance?.remittances.map((remittance) => (
              <li key={remittance.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-ink/70">{remittance.reference}</span>
                  <span
                    className={`px-2 py-0.5 rounded-md border text-[10px] ${statusStyles[remittance.status]}`}
                  >
                    {statusLabels[remittance.status]}
                  </span>
                  <span className="text-xs font-bold text-ink ml-auto">{money(remittance.amountGhs)}</span>
                </div>
                <p className="text-[11px] text-ink/70">
                  Sent {remittance.paidAt} · {remittance.method.replace('_', ' ')}
                  {remittance.paymentReference ? ` · ${remittance.paymentReference}` : ''}
                </p>
                {remittance.status === 'confirmed' && (
                  <p className="text-[11px] text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Confirmed {money(remittance.confirmedGhs)} received
                    {remittance.unallocatedGhs ? ` · ${money(remittance.unallocatedGhs)} not yet allocated` : ''}
                  </p>
                )}
                {remittance.decisionReason && remittance.status !== 'confirmed' && (
                  <p className="text-[11px] text-ink">Reason: {remittance.decisionReason}</p>
                )}
                {remittance.allocations.length > 0 && (
                  <ul className="text-[10px] text-ink/70 space-y-0.5 pl-3 list-disc">
                    {remittance.allocations.map((allocation) => (
                      <li key={allocation.id}>
                        {allocation.reference} · {money(allocation.amountGhs)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Commissions */}
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-ink" />
          <h2 className="text-sm font-bold">Rental commissions</h2>
        </div>
        {(finance?.commissions.length ?? 0) === 0 ? (
          <p className="text-xs text-ink/70">
            No rental commission has been recorded for you. Commissions are never created
            automatically — a Goodlucks administrator records each agreement individually.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {finance?.commissions.map((commission) => (
              <li key={commission.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-ink/70">{commission.reference}</span>
                  <span className="px-2 py-0.5 rounded-md bg-surface border border-line text-[10px] text-ink/70">
                    {commission.statusLabel}
                  </span>
                  <span className="text-xs font-bold text-ink ml-auto">{money(commission.amountGhs)}</span>
                </div>
                <p className="text-[11px] text-ink/70">
                  {commission.propertyTitle || 'Property'} · received {money(commission.receivedGhs)} ·
                  outstanding {money(commission.outstandingGhs)}
                </p>
                {commission.agentSharePercent !== null && commission.agentSharePercent !== undefined && (
                  <p className="text-[11px] text-ink/70">
                    Your share:{' '}
                    <span className="font-bold text-ink">
                      {commission.agentSharePercent}% · {money(commission.agentShareGhs ?? null)}
                    </span>{' '}
                    of the agreed commission (Goodlucks {commission.goodlucksSharePercent}%). Recorded when this
                    commission was priced; a later tier change does not alter it.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
