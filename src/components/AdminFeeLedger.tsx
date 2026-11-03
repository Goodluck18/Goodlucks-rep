import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import type {
  AdminAgentAccount,
  FeePolicyStatus,
  ViewingFeeRecord,
  ViewingFeeSummary,
} from '../types';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Info,
  Link2,
  Loader2,
  Receipt,
  ShieldCheck,
  ShieldQuestion,
  Wallet,
} from 'lucide-react';

/**
 * Admin viewing-fee ledger (Increment B).
 *
 * Three different sums are shown side by side and never merged:
 *   1. what agents collected from tenants on site (not Goodlucks money),
 *   2. what Goodlucks is owed under an explicitly agreed share,
 *   3. what Goodlucks has actually received (remittances).
 *
 * No fee-sharing percentage is applied anywhere. The 60/40 and 70/30 proposals
 * are provisional and no approved policy exists, so the share for each fee is
 * typed in by an administrator as an explicit agreement.
 */

const money = (value: number | null): string =>
  value === null ? '—' : `GH₵ ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const stateStyles: Record<ViewingFeeRecord['collectionState'], string> = {
  reported: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  confirmed_by_staff: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  disputed: 'bg-[#FF2E63]/15 text-[#FF8FA8] border-[#FF2E63]/30',
  void: 'bg-slate-500/20 text-slate-300 border-white/10',
};

const stateLabels: Record<ViewingFeeRecord['collectionState'], string> = {
  reported: 'Reported',
  confirmed_by_staff: 'Confirmed by staff',
  disputed: 'Disputed',
  void: 'Void',
};

export const AdminFeeLedger: React.FC = () => {
  const { currentUser, showSuccessToast, showErrorToast } = useApp();
  // Applying a policy commits financial terms, so it needs the approver
  // capability (Increment E). Linking a fee to an agent account is data entry
  // that either financial capability can do.
  const canApplyPolicy = Boolean(currentUser?.capabilities?.feePolicyApprove);
  const canLinkAgent = Boolean(
    currentUser?.capabilities?.feePolicyManage || currentUser?.capabilities?.feePolicyApprove
  );

  const [records, setRecords] = useState<ViewingFeeRecord[]>([]);
  const [summary, setSummary] = useState<ViewingFeeSummary | null>(null);
  const [policy, setPolicy] = useState<FeePolicyStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [action, setAction] = useState<{ id: string; kind: 'share' | 'remittance' } | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Mobile money');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [agents, setAgents] = useState<AdminAgentAccount[]>([]);
  const [agentPickerFor, setAgentPickerFor] = useState<string | null>(null);
  const [policyBusyId, setPolicyBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.listViewingFees();
      setRecords(result.records);
      setSummary(result.summary);
      setPolicy(result.policy);
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

  const resetForm = () => {
    setAction(null);
    setAmount('');
    setReference('');
    setNote('');
    setMethod('Mobile money');
  };

  const submit = async (record: ViewingFeeRecord) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      showErrorToast('Enter an amount', 'The amount must be greater than zero.');
      return;
    }

    setIsSaving(true);
    try {
      if (action?.kind === 'share') {
        await api.setViewingFeeShare(record.id, { amountGhs: value, note: note.trim() });
        showSuccessToast('Share agreed', `Goodlucks share set to GH₵ ${value.toLocaleString()} for ${record.reference}.`);
      } else {
        await api.addFeeRemittance(record.id, {
          amountGhs: value,
          method: method.trim() || 'unknown',
          reference: reference.trim(),
          receivedAt: new Date().toISOString().slice(0, 10),
          notes: note.trim(),
        });
        showSuccessToast('Remittance recorded', `GH₵ ${value.toLocaleString()} received by Goodlucks.`);
      }
      resetForm();
      await load();
    } catch (err) {
      showErrorToast('Could not save', messageForError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const openAgentPicker = async (record: ViewingFeeRecord) => {
    setAgentPickerFor(record.id);
    if (agents.length > 0) return;
    try {
      const result = await api.listAgents();
      setAgents(result.agents);
    } catch (err) {
      showErrorToast('Could not load agents', messageForError(err));
    }
  };

  const linkAgent = async (record: ViewingFeeRecord, agentUserId: string) => {
    if (!agentUserId) return;
    setPolicyBusyId(record.id);
    try {
      const result = await api.linkViewingFeeAgent(record.id, agentUserId);
      showSuccessToast(
        'Fee linked to an agent',
        result.agentTier
          ? `Current tier: ${result.agentTier.tierLabel}. That tier comes from the agent's verification records.`
          : 'Linked.'
      );
      setAgentPickerFor(null);
      await load();
    } catch (err) {
      showErrorToast('Could not link the agent', messageForError(err));
    } finally {
      setPolicyBusyId(null);
    }
  };

  const applyPolicy = async (record: ViewingFeeRecord) => {
    setPolicyBusyId(record.id);
    try {
      const result = await api.applyFeePolicy(record.id, record.policyApplicability?.policyId || undefined);
      showSuccessToast(
        'Policy terms frozen',
        `${result.snapshot.policyName}: Goodlucks ${money(result.snapshot.goodlucksEntitlementGhs)}, agent ${money(result.snapshot.agentEntitlementGhs)}. Nothing has been received yet.`
      );
      await load();
    } catch (err) {
      showErrorToast('Policy not applied', messageForError(err));
    } finally {
      setPolicyBusyId(null);
    }
  };

  const changeState = async (record: ViewingFeeRecord, state: ViewingFeeRecord['collectionState']) => {
    try {
      await api.setViewingFeeState(record.id, {
        state,
        note: state === 'disputed' ? 'Marked disputed in the admin console' : 'Updated in the admin console',
      });
      showSuccessToast('Ledger updated', `${record.reference} is now ${stateLabels[state].toLowerCase()}.`);
      await load();
    } catch (err) {
      showErrorToast('Could not update', messageForError(err));
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-800/60 p-6 rounded-2xl border border-white/10 flex items-center gap-3 text-xs text-slate-300">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the viewing-fee ledger…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800/60 p-6 rounded-2xl border border-[#FF2E63]/30 text-xs text-[#FF8FA8] flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Banknote className="w-4 h-4 text-[#08D9D6]" /> Agent viewing-fee ledger
          </h3>
          <p className="text-[11px] text-slate-400 max-w-2xl">
            Money collected on site by agents, the share agreed for Goodlucks, and what Goodlucks has actually
            received are separate figures. A fee only becomes Goodlucks revenue when a remittance is recorded here.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold shrink-0"
        >
          Refresh
        </button>
      </div>

      {/* Policy state — explicit, never silently applied */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
        <ShieldQuestion className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
        <div className="text-[11px] text-amber-100 space-y-1">
          <p className="font-bold">
            Fee-sharing policy: {policy?.status === 'approved' ? 'approved' : 'provisional — not applied'}
          </p>
          <p className="text-amber-200/90">{policy?.note}</p>
          {policy && (
            <p className="text-amber-200/70">
              Proposals on record:{' '}
              {policy.proposed
                .map((tier) => `${tier.label} ${tier.agentSharePercent}/${tier.goodlucksSharePercent}`)
                .join(' · ')}{' '}
              (agent/Goodlucks). These percentages are not used in any calculation.
            </p>
          )}
        </div>
      </div>

      {/* Four separate figures */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-800/60 p-4 rounded-2xl border border-white/10">
            <div className="text-[11px] text-slate-400 font-medium">Collected by agents</div>
            <div className="text-lg font-extrabold text-[#08D9D6]">{money(summary.viewingFeesCollectedGhs)}</div>
            <div className="text-[10px] text-slate-400">Not Goodlucks revenue</div>
          </div>
          <div className="bg-slate-800/60 p-4 rounded-2xl border border-white/10">
            <div className="text-[11px] text-slate-400 font-medium">Owed to Goodlucks</div>
            <div className="text-lg font-extrabold text-white">{money(summary.goodlucksShareDueGhs)}</div>
            <div className="text-[10px] text-slate-400">
              {summary.recordsWithoutAgreedShare > 0
                ? `${summary.recordsWithoutAgreedShare} fee(s) with no agreed share`
                : 'Agreed shares only'}
            </div>
          </div>
          <div className="bg-slate-800/60 p-4 rounded-2xl border border-emerald-500/30">
            <div className="text-[11px] text-slate-400 font-medium">Received by Goodlucks</div>
            <div className="text-lg font-extrabold text-emerald-400">{money(summary.goodlucksShareReceivedGhs)}</div>
            <div className="text-[10px] text-emerald-400/80">Confirmed remittances only</div>
          </div>
          <div className="bg-slate-800/60 p-4 rounded-2xl border border-white/10">
            <div className="text-[11px] text-slate-400 font-medium">Outstanding</div>
            <div className="text-lg font-extrabold text-amber-300">{money(summary.outstandingReceivablesGhs)}</div>
            <div className="text-[10px] text-slate-400">
              Agents retain {money(summary.agentShareRetainedGhs)}
            </div>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div className="bg-slate-800/60 p-6 rounded-2xl border border-white/10 text-xs text-slate-400">
          No viewing fees have been reported yet. Marking a viewing as paid creates a ledger entry here.
        </div>
      ) : (
        <div className="bg-slate-800/60 rounded-2xl border border-white/10 overflow-x-auto">
          <table className="w-full text-[11px] text-left">
            <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3">Fee record</th>
                <th className="p-3">Agent</th>
                <th className="p-3 text-right">Collected</th>
                <th className="p-3 text-right">Goodlucks share</th>
                <th className="p-3 text-right">Remitted</th>
                <th className="p-3 text-right">Outstanding</th>
                <th className="p-3">State</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {records.map((record) => (
                <React.Fragment key={record.id}>
                  <tr className="text-slate-200 align-top">
                    <td className="p-3">
                      <div className="font-mono font-bold text-[#08D9D6]">{record.reference}</div>
                      <div className="text-[10px] text-slate-400">{record.propertyTitle || '—'}</div>
                    </td>
                    <td className="p-3">{record.agentName || '—'}</td>
                    <td className="p-3 text-right">{money(record.feeTotalGhs)}</td>
                    <td className="p-3 text-right">
                      {money(record.goodlucksShareGhs)}
                      {record.shareBasis === 'not_set' && (
                        <div className="text-[10px] text-amber-300">not priced</div>
                      )}
                      {record.snapshotKind === 'policy' && (
                        <div className="text-[10px] text-emerald-300 flex items-center justify-end gap-1">
                          <ShieldCheck className="w-3 h-3" /> policy
                        </div>
                      )}
                      {record.snapshotKind === 'manual_agreement' && (
                        <div className="text-[10px] text-slate-400">agreed by staff</div>
                      )}
                    </td>
                    <td className="p-3 text-right text-emerald-300">{money(record.remittedGhs)}</td>
                    <td className="p-3 text-right">{money(record.outstandingGhs)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${stateStyles[record.collectionState]}`}>
                        {stateLabels[record.collectionState]}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {record.countsInTotals && (
                          <>
                            <button
                              onClick={() => {
                                setAction({ id: record.id, kind: 'share' });
                                setAmount(record.goodlucksShareGhs !== null ? String(record.goodlucksShareGhs) : '');
                              }}
                              className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white"
                            >
                              Agree share
                            </button>
                            <button
                              onClick={() => {
                                setAction({ id: record.id, kind: 'remittance' });
                                setAmount(record.outstandingGhs !== null && record.outstandingGhs > 0 ? String(record.outstandingGhs) : '');
                              }}
                              disabled={record.shareBasis === 'not_set'}
                              className="px-2 py-1 rounded-md bg-[#08D9D6]/15 text-[#08D9D6] hover:bg-[#08D9D6]/25 disabled:opacity-40 disabled:cursor-not-allowed"
                              title={record.shareBasis === 'not_set' ? 'Agree the Goodlucks share first' : 'Record money received by Goodlucks'}
                            >
                              Remittance
                            </button>
                            {record.collectionState === 'reported' && (
                              <button
                                onClick={() => void changeState(record, 'confirmed_by_staff')}
                                className="px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                              >
                                Confirm
                              </button>
                            )}
                            {record.collectionState !== 'disputed' && (
                              <button
                                onClick={() => void changeState(record, 'disputed')}
                                className="px-2 py-1 rounded-md bg-[#FF2E63]/15 text-[#FF8FA8] hover:bg-[#FF2E63]/25"
                              >
                                Dispute
                              </button>
                            )}
                            {canLinkAgent && !record.agentUserId && (
                              <button
                                onClick={() => void openAgentPicker(record)}
                                className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white flex items-center gap-1"
                                title="A tier comes from an agent account, so link the fee to one before a policy can price it"
                              >
                                <Link2 className="w-3 h-3" /> Link agent
                              </button>
                            )}
                            {canApplyPolicy && record.shareBasis === 'not_set' && record.policyApplicability?.applies && (
                              <button
                                onClick={() => void applyPolicy(record)}
                                disabled={policyBusyId === record.id}
                                className="px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                              >
                                Apply policy
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {agentPickerFor === record.id && (
                    <tr>
                      <td colSpan={8} className="p-3 bg-slate-900/40">
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex-1 min-w-[220px]">
                            <label className="block text-[10px] text-slate-400 mb-1">
                              Agent account (the tier is read from its verification records)
                            </label>
                            <select
                              defaultValue=""
                              onChange={(event) => void linkAgent(record, event.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-white text-xs"
                            >
                              <option value="">Choose an agent…</option>
                              {agents.map((agent) => (
                                <option key={agent.userId} value={agent.userId}>
                                  {agent.name} · {agent.agentTierLabel ?? 'Standard agent'} · {agent.email}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => setAgentPickerFor(null)}
                            className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {(record.policySnapshot || (record.shareBasis === 'not_set' && record.policyApplicability)) && (
                    <tr>
                      <td colSpan={8} className="px-3 pb-3 pt-0">
                        {record.policySnapshot ? (
                          <div className="text-[10px] text-slate-300 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2 space-y-1">
                            <p className="flex items-center gap-1.5 text-emerald-300 font-bold">
                              <ShieldCheck className="w-3 h-3" /> Frozen policy terms — {record.policySnapshot.policyName}{' '}
                              v{record.policySnapshot.policyVersion} · {record.policySnapshot.agentTier} tier · agent{' '}
                              {record.policySnapshot.agentSharePercent}% / Goodlucks{' '}
                              {record.policySnapshot.goodlucksSharePercent}%
                            </p>
                            <p>
                              Goodlucks entitlement {money(record.policySnapshot.goodlucksEntitlementGhs)} · agent{' '}
                              {money(record.policySnapshot.agentEntitlementGhs)} of {money(record.policySnapshot.feeTotalGhs)}{' '}
                              · frozen{' '}
                              {record.policySnapshot.snapshotAt
                                ? new Date(record.policySnapshot.snapshotAt).toLocaleString()
                                : '—'}
                            </p>
                            <p className={record.policySnapshot.integrityOk ? 'text-emerald-400/80' : 'text-[#FF8FA8]'}>
                              {record.policySnapshot.integrityOk
                                ? 'Integrity check passed: the stored terms still match their hash.'
                                : 'Integrity check FAILED — the stored terms no longer match their hash. Investigate before relying on this figure.'}
                            </p>
                            <p className="text-slate-500">
                              These are entitlements, not receipts. Later tier changes, policy edits or withdrawal of the
                              policy do not re-price this record.
                            </p>
                          </div>
                        ) : (
                          <p className="text-[10px] text-amber-300/90 flex items-start gap-1.5">
                            <Info className="w-3 h-3 mt-0.5 shrink-0" />
                            {record.policyApplicability?.reason}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}

                  {action?.id === record.id && (
                    <tr>
                      <td colSpan={8} className="p-3 bg-slate-900/40">
                        <div className="flex flex-wrap items-end gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-1">
                              {action.kind === 'share' ? 'Goodlucks share (GH₵)' : 'Amount received (GH₵)'}
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                              className="w-32 px-2 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-white text-xs"
                            />
                          </div>

                          {action.kind === 'remittance' && (
                            <>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">Method</label>
                                <input
                                  value={method}
                                  onChange={(e) => setMethod(e.target.value)}
                                  className="w-36 px-2 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-white text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-1">Reference</label>
                                <input
                                  value={reference}
                                  onChange={(e) => setReference(e.target.value)}
                                  className="w-40 px-2 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-white text-xs"
                                />
                              </div>
                            </>
                          )}

                          <div className="flex-1 min-w-[180px]">
                            <label className="block text-[10px] text-slate-400 mb-1">Note</label>
                            <input
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder={action.kind === 'share' ? 'e.g. agreed with the agent on site' : 'e.g. mobile money transfer'}
                              className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-white text-xs"
                            />
                          </div>

                          <button
                            onClick={() => void submit(record)}
                            disabled={isSaving}
                            className="px-3 py-1.5 rounded-lg bg-[#08D9D6] text-[#252A34] font-extrabold text-xs disabled:opacity-50"
                          >
                            {isSaving ? 'Saving…' : action.kind === 'share' ? 'Save share' : 'Record remittance'}
                          </button>
                          <button
                            onClick={resetForm}
                            className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold"
                          >
                            Cancel
                          </button>
                        </div>

                        {action.kind === 'remittance' && (
                          <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                            <Info className="w-3 h-3" />
                            Only record money Goodlucks has actually received. Outstanding for this fee:{' '}
                            {money(record.outstandingGhs)}.
                          </p>
                        )}
                      </td>
                    </tr>
                  )}

                  {record.remittances.length > 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 pb-3 pt-0">
                        <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-3">
                          <span className="flex items-center gap-1 text-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> Received by Goodlucks:
                          </span>
                          {record.remittances.map((remittance) => (
                            <span key={remittance.id} className="flex items-center gap-1 text-slate-300">
                              <Wallet className="w-3 h-3 text-slate-400" />
                              {money(remittance.amountGhs)} · {remittance.method || 'unknown'} · {remittance.receivedAt}
                              {remittance.reference ? ` · ${remittance.reference}` : ''}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-500 flex items-start gap-1.5">
        <Receipt className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Rental commissions and viewing fees are separate accounting categories. Nothing on this screen is a
        Goodlucks receipt: rent paid to a landlord is recorded as a payment between tenant and landlord.
      </p>
    </div>
  );
};
