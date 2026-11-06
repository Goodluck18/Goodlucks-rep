import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Building2, Landmark, Loader2, PlusCircle, Receipt } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import type { LandlordFeeSummary, LandlordPolicy, RentalCommission, ViewingFeeRecord, ViewingSchedule } from '../types';

/**
 * Landlord money (Task 03 update).
 *
 * Two separate things, kept away from the agent ledger and the agent commission
 * workflow:
 *
 *   1. the 8% platform fee on the rent a tenant actually paid for a
 *      landlord-submitted property, and
 *   2. the viewing fee a tenant paid Goodlucks after viewing such a property.
 *
 * Both belong entirely to Goodlucks Homes. The landlord receives no commission
 * and no share of either, and no agent tier is applied.
 */
const money = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? '—'
    : `GH₵ ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const today = (): string => new Date().toISOString().slice(0, 10);

export const AdminLandlordFinance: React.FC = () => {
  const { properties, showSuccessToast, showErrorToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fees, setFees] = useState<RentalCommission[]>([]);
  const [feeSummary, setFeeSummary] = useState<LandlordFeeSummary | null>(null);
  const [feePolicy, setFeePolicy] = useState<LandlordPolicy['platformFee'] | null>(null);
  const [viewingRecords, setViewingRecords] = useState<ViewingFeeRecord[]>([]);
  const [viewingSummary, setViewingSummary] = useState<LandlordFeeSummary | null>(null);
  const [viewingPolicy, setViewingPolicy] = useState<LandlordPolicy['viewingFee'] | null>(null);
  const [viewings, setViewings] = useState<ViewingSchedule[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // New platform-fee form.
  const [propertyId, setPropertyId] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [rentReference, setRentReference] = useState('');
  const [tenantName, setTenantName] = useState('');

  // Payment forms, keyed by record id.
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [viewingPaymentId, setViewingPaymentId] = useState('');

  const landlordProperties = useMemo(
    () => properties.filter((property) => property.submittedByRole === 'landlord'),
    [properties]
  );

  const load = useCallback(async () => {
    try {
      const [platform, viewingFees, list] = await Promise.all([
        api.landlordPlatformFees(),
        api.landlordViewingFees(),
        api.listViewings().catch(() => ({ viewings: [] as ViewingSchedule[] })),
      ]);
      setFees(platform.fees ?? []);
      setFeeSummary(platform.summary);
      setFeePolicy(platform.policy);
      setViewingRecords(viewingFees.records ?? []);
      setViewingSummary(viewingFees.summary);
      setViewingPolicy(viewingFees.policy);
      setViewings(list.viewings ?? []);
      setError('');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Completed landlord viewings whose fee has not been recorded yet. */
  const pendingViewingFees = useMemo(
    () =>
      viewings.filter(
        (viewing) =>
          viewing.feeSource === 'platform_policy' &&
          viewing.status === 'completed' &&
          !viewing.viewingFeePaid &&
          viewing.feeAmountGhs > 0
      ),
    [viewings]
  );

  const createFee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!propertyId) {
      showErrorToast('Choose the landlord property this platform fee is for.');
      return;
    }
    setBusy('create');
    try {
      const response = await api.createLandlordPlatformFee({
        propertyId,
        rentAmountGhs: Number(rentAmount),
        rentPaymentReference: rentReference.trim(),
        tenantName: tenantName.trim() || undefined,
      });
      showSuccessToast(response.message);
      setRentAmount('');
      setRentReference('');
      setTenantName('');
      await load();
    } catch (err) {
      showErrorToast(messageForError(err));
    } finally {
      setBusy(null);
    }
  };

  const recordFeePayment = async (fee: RentalCommission) => {
    const value = paymentAmounts[fee.id] ?? String(fee.outstandingGhs ?? '');
    setBusy(fee.id);
    try {
      await api.addCommissionPayment(fee.id, {
        amountGhs: Number(value),
        method: 'bank_transfer',
        reference: '',
        receivedAt: today(),
      });
      showSuccessToast('Payment recorded against the platform fee.');
      await load();
    } catch (err) {
      showErrorToast(messageForError(err));
    } finally {
      setBusy(null);
    }
  };

  const recordViewingFee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!viewingPaymentId) {
      showErrorToast('Choose the completed viewing whose fee Goodlucks received.');
      return;
    }
    setBusy('viewing-fee');
    try {
      const response = await api.recordLandlordViewingFee({ viewingId: viewingPaymentId, receivedAt: today() });
      showSuccessToast(response.message);
      setViewingPaymentId('');
      await load();
    } catch (err) {
      showErrorToast(messageForError(err));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800/60 border border-white/10 rounded-2xl p-5 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading landlord fee records…
      </div>
    );
  }

  if (error) {
    return <div className="bg-[#FF2E63]/10 border border-[#FF2E63]/30 rounded-2xl p-5 text-xs text-[#FF8FA8]">{error}</div>;
  }

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------- */}
      {/* Platform fee on rent                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-slate-800/60 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Banknote className="w-4 h-4 text-[#08D9D6]" /> Landlord platform fee on rent ({feePolicy?.percent ?? 8}%)
            </h2>
            <p className="text-[11px] text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Calculated on the server from the total rent the tenant actually paid, and paid to Goodlucks Homes. The
              landlord receives no commission. Agent-submitted listings never use this policy.
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-300">
            <div>
              Rent basis: <strong className="text-white">{money(feeSummary?.rentBasisGhs ?? 0)}</strong>
            </div>
            <div>
              Platform fees: <strong className="text-[#08D9D6]">{money(feeSummary?.platformFeesGhs ?? 0)}</strong>
            </div>
            <div>
              Received: <strong className="text-emerald-300">{money(feeSummary?.receivedGhs ?? 0)}</strong>
            </div>
            <div>
              Landlord commission: <strong className="text-white">{money(feeSummary?.landlordCommissionGhs ?? 0)}</strong>
            </div>
          </div>
        </div>

        <form onSubmit={createFee} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-bold text-slate-300 mb-1" htmlFor="landlord-fee-property">
              Landlord listing
            </label>
            <select
              id="landlord-fee-property"
              value={propertyId}
              onChange={(event) => setPropertyId(event.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900/70 border border-white/10 text-xs text-white focus:outline-none focus:border-[#08D9D6]/60"
            >
              <option value="">Choose a landlord-submitted property…</option>
              {landlordProperties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.title} — {property.location}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-300 mb-1" htmlFor="landlord-fee-rent">
              Total rent paid (GHS)
            </label>
            <input
              id="landlord-fee-rent"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={rentAmount}
              onChange={(event) => setRentAmount(event.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900/70 border border-white/10 text-xs text-white focus:outline-none focus:border-[#08D9D6]/60"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-300 mb-1" htmlFor="landlord-fee-ref">
              Rent payment reference
            </label>
            <input
              id="landlord-fee-ref"
              value={rentReference}
              onChange={(event) => setRentReference(event.target.value)}
              placeholder="MoMo / bank / receipt ref"
              className="w-full px-3 py-2 rounded-xl bg-slate-900/70 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#08D9D6]/60"
            />
          </div>
          <button
            type="submit"
            disabled={busy === 'create'}
            className="px-3 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-extrabold hover:bg-[#08D9D6]/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy === 'create' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
            Record fee
          </button>
        </form>
        <p className="text-[10px] text-slate-500">
          The fee is calculated here, not typed in. One platform fee can be recorded per rent payment reference.
        </p>

        <div className="space-y-2">
          {fees.length === 0 && <p className="text-[11px] text-slate-400">No landlord platform fees recorded yet.</p>}
          {fees.map((fee) => (
            <div key={fee.id} className="rounded-xl border border-white/10 bg-slate-900/50 p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">{fee.propertyTitle || fee.propertyId}</div>
                  <div className="text-[10px] text-slate-400">
                    {fee.reference} · rent {money(fee.rentAmountGhs)} · {fee.platformFeePercent ?? 8}% · paid to Goodlucks
                    Homes
                  </div>
                </div>
                <div className="text-right text-[11px]">
                  <div className="font-extrabold text-[#08D9D6]">{money(fee.amountGhs)}</div>
                  <div className="text-slate-400">
                    received {money(fee.receivedGhs)} · outstanding {money(fee.outstandingGhs)}
                  </div>
                </div>
              </div>
              {!fee.isSettled && (
                <div className="flex items-end gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={paymentAmounts[fee.id] ?? String(fee.outstandingGhs ?? '')}
                    onChange={(event) =>
                      setPaymentAmounts((current) => ({ ...current, [fee.id]: event.target.value }))
                    }
                    className="w-32 px-2 py-1.5 rounded-lg bg-slate-950/60 border border-white/10 text-[11px] text-white"
                  />
                  <button
                    type="button"
                    onClick={() => void recordFeePayment(fee)}
                    disabled={busy === fee.id}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold disabled:opacity-50"
                  >
                    Record payment received
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Landlord viewing fees                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-slate-800/60 border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Landmark className="w-4 h-4 text-[#08D9D6]" /> Landlord viewing fees received
            </h2>
            <p className="text-[11px] text-slate-400 mt-1 max-w-2xl leading-relaxed">
              The tenant pays the general landlord viewing fee to Goodlucks Homes after the viewing. The amount is the
              fee recorded on the viewing — it is never retyped here, and the landlord receives none of it.
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-300">
            <div>
              General fee: <strong className="text-[#08D9D6]">{money(viewingPolicy?.amountGhs ?? null)}</strong>
            </div>
            <div>
              Fees recorded: <strong className="text-white">{money(viewingSummary?.feesGhs ?? 0)}</strong>
            </div>
            <div>
              Received: <strong className="text-emerald-300">{money(viewingSummary?.receivedGhs ?? 0)}</strong>
            </div>
            <div>
              Landlord share: <strong className="text-white">{money(viewingSummary?.landlordShareGhs ?? 0)}</strong>
            </div>
          </div>
        </div>

        <form onSubmit={recordViewingFee} className="flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-slate-300 mb-1" htmlFor="landlord-viewing-fee-record">
              Completed landlord viewings awaiting the fee
            </label>
            <select
              id="landlord-viewing-fee-record"
              value={viewingPaymentId}
              onChange={(event) => setViewingPaymentId(event.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900/70 border border-white/10 text-xs text-white focus:outline-none focus:border-[#08D9D6]/60"
            >
              <option value="">
                {pendingViewingFees.length === 0
                  ? 'No completed landlord viewing is waiting for a fee'
                  : 'Choose a viewing…'}
              </option>
              {pendingViewingFees.map((viewing) => (
                <option key={viewing.id} value={viewing.id}>
                  {viewing.propertyTitle} · {viewing.tenantName} · {money(viewing.feeAmountGhs)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={busy === 'viewing-fee' || pendingViewingFees.length === 0}
            className="px-3 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-extrabold hover:bg-[#08D9D6]/90 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy === 'viewing-fee' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
            Record fee received
          </button>
        </form>

        <div className="space-y-2">
          {viewingRecords.length === 0 && (
            <p className="text-[11px] text-slate-400">No landlord viewing fees recorded yet.</p>
          )}
          {viewingRecords.map((record) => (
            <div key={record.id} className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">{record.propertyTitle || record.propertyId}</div>
                  <div className="text-[10px] text-slate-400">
                    {record.reference} · paid to Goodlucks Homes · agent share {money(record.agentShareGhs)}
                  </div>
                </div>
                <div className="text-right text-[11px]">
                  <div className="font-extrabold text-[#08D9D6]">{money(record.feeTotalGhs)}</div>
                  <div className="text-slate-400">
                    received {money(record.remittedGhs)} · {record.settled ? 'settled' : 'outstanding'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {landlordProperties.length === 0 && (
          <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> No landlord-submitted listing is loaded, so no platform fee can be
            recorded yet.
          </p>
        )}
      </section>
    </div>
  );
};
