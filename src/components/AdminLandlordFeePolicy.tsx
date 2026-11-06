import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Landmark, Save, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import type { LandlordPolicy } from '../types';

/**
 * The general landlord viewing fee (Task 03 update).
 *
 * ONE amount, set here, applies to every landlord-submitted property. A landlord
 * never types it, never sees an editor for it and cannot change it. The whole fee
 * belongs to Goodlucks Homes and the tenant pays it after viewing, so the screen
 * says that rather than implying the landlord is the recipient.
 *
 * The amount is never defaulted: until an administrator saves one, this card
 * says the fee is not configured and the dashboard says so too.
 */
const money = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? '—'
    : `GH₵ ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AdminLandlordFeePolicy: React.FC = () => {
  const { currentUser, showSuccessToast, showErrorToast } = useApp();
  const [policy, setPolicy] = useState<LandlordPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await api.landlordPolicy();
      setPolicy(response.policy);
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

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await api.setLandlordViewingFee(amount.trim());
      setPolicy(response.policy);
      setAmount('');
      showSuccessToast(response.message);
      void load();
    } catch (err) {
      const message = messageForError(err);
      setError(message);
      showErrorToast(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800/60 border border-white/10 rounded-2xl p-5 flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the landlord fee policy…
      </div>
    );
  }

  if (error && !policy) {
    return (
      <div className="bg-[#FF2E63]/10 border border-[#FF2E63]/30 rounded-2xl p-5 text-xs text-[#FF8FA8]">
        {error}
      </div>
    );
  }

  const viewingFee = policy?.viewingFee;
  const platformFee = policy?.platformFee;
  const isAdmin = currentUser?.role === 'admin';

  return (
    <section className="bg-slate-800/60 border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Landmark className="w-4 h-4 text-[#08D9D6]" /> General landlord viewing fee
          </h2>
          <p className="text-[11px] text-slate-400 mt-1 max-w-2xl leading-relaxed">
            One amount for every landlord-submitted property. Landlords cannot set or change it. The tenant pays it to
            Goodlucks Homes after viewing the property, and the landlord receives none of it.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Current fee</div>
          <div className={`text-2xl font-extrabold ${viewingFee?.configured ? 'text-[#08D9D6]' : 'text-amber-400'}`}>
            {viewingFee?.configured ? money(viewingFee.amountGhs) : 'Not configured'}
          </div>
          <div className="text-[10px] text-slate-400">
            {viewingFee?.updatedAt
              ? `Last updated ${new Date(viewingFee.updatedAt).toLocaleString()}${
                  viewingFee.updatedByName ? ` by ${viewingFee.updatedByName}` : ''
                }`
              : 'No administrator has set this fee yet'}
          </div>
        </div>
      </div>

      {!viewingFee?.configured && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Configuration required.</strong> Until this fee is set, landlord listings have{' '}
            <strong>no viewing fee</strong> — the platform never invents an amount. Set it below and every live or
            pending landlord listing picks it up.
          </span>
        </div>
      )}

      {isAdmin ? (
        <form onSubmit={save} className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label htmlFor="landlord-viewing-fee" className="block text-[11px] font-bold text-slate-300 mb-1">
              New general landlord viewing fee (GHS)
            </label>
            <input
              id="landlord-viewing-fee"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={viewingFee?.amountGhs !== null && viewingFee?.amountGhs !== undefined ? String(viewingFee.amountGhs) : 'e.g. 50'}
              className="w-full px-3 py-2 rounded-xl bg-slate-900/70 border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#08D9D6]/60"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              A non-negative amount. Recorded viewings and payments keep the fee they were made with.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving || amount.trim() === ''}
            className="px-4 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-extrabold hover:bg-[#08D9D6]/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {viewingFee?.configured ? 'Update fee' : 'Set fee'}
          </button>
        </form>
      ) : (
        <p className="text-[11px] text-slate-400">Only an administrator can change this fee.</p>
      )}

      {error && policy && <p className="text-[11px] text-[#FF8FA8]">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3 space-y-1">
          <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#08D9D6]" />
            {platformFee?.label ?? 'Platform fee on rent'}
          </div>
          <p className="text-[11px] text-slate-300">
            <strong className="text-[#08D9D6]">{platformFee?.percent ?? 8}%</strong> of the total rent actually paid by
            the tenant, calculated on the server and paid to Goodlucks Homes.
          </p>
          <p className="text-[10px] text-slate-400">
            Landlord commission: <strong className="text-white">0%</strong>. No agent tier is ever applied to a landlord
            listing.
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3 space-y-1">
          <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[#08D9D6]" />
            Agent policy (unchanged)
          </div>
          <p className="text-[11px] text-slate-300">{policy?.agentPolicy.note}</p>
          <p className="text-[10px] text-slate-400">
            Agent listings keep their own per-property viewing fee and viewing terms, approved with the listing.
          </p>
        </div>
      </div>
    </section>
  );
};
