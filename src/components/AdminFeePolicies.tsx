import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import type { FeePolicy, FeePolicyEvent, FeePolicyInput, FeePolicyOverview, FeePolicyStatusKind } from '../types';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  History,
  Info,
  Loader2,
  Lock,
  Pencil,
  PlayCircle,
  PlusCircle,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  StopCircle,
  XCircle,
} from 'lucide-react';

/**
 * Fee-policy administration (Increment E).
 *
 * The screen is deliberately blunt about what each step means:
 *   draft → (manager) → pending approval → (a DIFFERENT approver) → approved
 *         → (approver, once the start date has arrived) → active
 *
 * The proposed 60/40 and 70/30 arrangements are shown as *proposals* with no
 * effect. Nothing here computes a share, and no policy is seeded with the code.
 */

const money = (value: number | null): string =>
  value === null ? '—' : `GH₵ ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusStyles: Record<FeePolicyStatusKind, string> = {
  draft: 'bg-line/20 text-ink border-line',
  pending_approval: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  approved: 'bg-sky-500/10 text-sky-700 border-sky-500/30',
  active: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  rejected: 'bg-accent/15 text-ink border-accent/30',
  deactivated: 'bg-line/20 text-ink/70 border-line',
  expired: 'bg-accent/10 text-ink border-accent/20',
};

const emptyForm = (): FeePolicyInput => ({
  name: '',
  description: '',
  category: 'viewing_fee',
  agentTier: 'standard',
  calculationMethod: 'percentage',
  agentSharePercent: 0,
  goodlucksSharePercent: 0,
  agentShareFixedGhs: 0,
  goodlucksShareFixedGhs: 0,
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: '',
  currency: 'GHS',
  notes: '',
});

const FeePolicyForm: React.FC<{
  initial: FeePolicyInput;
  editing: boolean;
  categories: FeePolicyOverview['categories'];
  tiers: FeePolicyOverview['tiers'];
  saving: boolean;
  errors: Record<string, string>;
  onCancel: () => void;
  onSubmit: (data: FeePolicyInput) => void;
}> = ({ initial, editing, categories, tiers, saving, errors, onCancel, onSubmit }) => {
  const [form, setForm] = useState<FeePolicyInput>(initial);

  const set = <K extends keyof FeePolicyInput>(key: K, value: FeePolicyInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const percentage = form.calculationMethod === 'percentage';

  return (
    <form
      className="bg-surface border border-line rounded-2xl p-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          ...form,
          agentSharePercent: percentage ? Number(form.agentSharePercent) : 0,
          goodlucksSharePercent: percentage ? Number(form.goodlucksSharePercent) : 0,
          agentShareFixedGhs: percentage ? undefined : Number(form.agentShareFixedGhs),
          goodlucksShareFixedGhs: percentage ? undefined : Number(form.goodlucksShareFixedGhs),
          effectiveTo: form.effectiveTo || undefined,
        });
      }}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-ink flex items-center gap-2">
          {editing ? <Pencil className="w-3.5 h-3.5" /> : <PlusCircle className="w-3.5 h-3.5" />}
          {editing ? 'Edit draft policy' : 'Create a draft policy'}
        </h4>
        <span className="text-[10px] text-ink/70">
          A draft is not approved, not active and applies to nothing.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-[11px] font-semibold text-ink/70">
          Policy name
          <input
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
            placeholder="e.g. Standard viewing fee share (from Jan 2027)"
          />
          {errors.name && <span className="text-[10px] text-ink">{errors.name}</span>}
        </label>

        <label className="block text-[11px] font-semibold text-ink/70">
          Fee category
          <select
            value={form.category}
            onChange={(e) => set('category', e.target.value as FeePolicyInput['category'])}
            className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
          >
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[11px] font-semibold text-ink/70">
          Agent tier
          <select
            value={form.agentTier}
            onChange={(e) => set('agentTier', e.target.value as FeePolicyInput['agentTier'])}
            className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
          >
            {tiers.map((tier) => (
              <option key={tier.value} value={tier.value}>
                {tier.label}
              </option>
            ))}
          </select>
          {errors.agentTier && <span className="text-[10px] text-ink">{errors.agentTier}</span>}
        </label>

        <label className="block text-[11px] font-semibold text-ink/70">
          Calculation method
          <select
            value={form.calculationMethod}
            onChange={(e) => set('calculationMethod', e.target.value as 'percentage' | 'fixed')}
            className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
          >
            <option value="percentage">Percentage of the fee</option>
            <option value="fixed">Fixed amounts</option>
          </select>
        </label>

        {percentage ? (
          <>
            <label className="block text-[11px] font-semibold text-ink/70">
              Agent share (%)
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.agentSharePercent ?? 0}
                onChange={(e) => set('agentSharePercent', Number(e.target.value))}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              />
              {errors.agentSharePercent && <span className="text-[10px] text-ink">{errors.agentSharePercent}</span>}
            </label>
            <label className="block text-[11px] font-semibold text-ink/70">
              Goodlucks share (%)
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.goodlucksSharePercent ?? 0}
                onChange={(e) => set('goodlucksSharePercent', Number(e.target.value))}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              />
              {errors.goodlucksSharePercent && (
                <span className="text-[10px] text-ink">{errors.goodlucksSharePercent}</span>
              )}
            </label>
            <p className="text-[10px] text-ink/70 sm:col-span-2">
              The two shares must add up to exactly 100%. The server rejects anything else.
            </p>
          </>
        ) : (
          <>
            <label className="block text-[11px] font-semibold text-ink/70">
              Agent entitlement (GH₵)
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.agentShareFixedGhs ?? 0}
                onChange={(e) => set('agentShareFixedGhs', Number(e.target.value))}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              />
              {errors.agentShareFixedGhs && (
                <span className="text-[10px] text-ink">{errors.agentShareFixedGhs}</span>
              )}
            </label>
            <label className="block text-[11px] font-semibold text-ink/70">
              Goodlucks entitlement (GH₵)
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.goodlucksShareFixedGhs ?? 0}
                onChange={(e) => set('goodlucksShareFixedGhs', Number(e.target.value))}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              />
              {errors.goodlucksShareFixedGhs && (
                <span className="text-[10px] text-ink">{errors.goodlucksShareFixedGhs}</span>
              )}
            </label>
          </>
        )}

        <label className="block text-[11px] font-semibold text-ink/70">
          Effective from
          <input
            type="date"
            required
            value={form.effectiveFrom}
            onChange={(e) => set('effectiveFrom', e.target.value)}
            className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
          />
          {errors.effectiveFrom && <span className="text-[10px] text-ink">{errors.effectiveFrom}</span>}
        </label>

        <label className="block text-[11px] font-semibold text-ink/70">
          Effective to (optional)
          <input
            type="date"
            value={form.effectiveTo ?? ''}
            onChange={(e) => set('effectiveTo', e.target.value)}
            className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
          />
          {errors.effectiveTo && <span className="text-[10px] text-ink">{errors.effectiveTo}</span>}
        </label>

        <label className="block text-[11px] font-semibold text-ink/70 sm:col-span-2">
          Description / notes for the approver
          <textarea
            rows={2}
            value={form.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
            className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
            placeholder="Why this policy exists, what it covers, and anything the approver should check."
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="gl-btn gl-btn-primary px-4 py-2 text-xs"
        >
          {saving ? 'Saving…' : editing ? 'Save draft' : 'Save as draft'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl bg-page text-ink text-xs font-semibold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export const AdminFeePolicies: React.FC = () => {
  const { currentUser, refreshSession, showSuccessToast, showErrorToast } = useApp();
  const capabilities = currentUser?.capabilities;
  const canManage = Boolean(capabilities?.feePolicyManage);
  const canApprove = Boolean(capabilities?.feePolicyApprove);
  // True for the primary platform administrator only. The server enforces it;
  // this only decides which explanatory sentence is shown.
  const canSelfApprove = Boolean(capabilities?.feePolicySelfApprove);
  const canRead = canManage || canApprove;

  const [overview, setOverview] = useState<FeePolicyOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FeePolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<{ policy: FeePolicy; events: FeePolicyEvent[] } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.listFeePolicies();
      setOverview(result);
      setError(null);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canRead) {
      void load();
    } else {
      setIsLoading(false);
    }
  }, [canRead, load]);

  const initialForm = useMemo<FeePolicyInput>(() => {
    if (!editing) return emptyForm();
    return {
      name: editing.name,
      description: editing.description,
      category: editing.category,
      agentTier: editing.agentTier,
      calculationMethod: editing.calculationMethod,
      agentSharePercent: editing.agentSharePercent,
      goodlucksSharePercent: editing.goodlucksSharePercent,
      agentShareFixedGhs: editing.agentShareFixedGhs ?? 0,
      goodlucksShareFixedGhs: editing.goodlucksShareFixedGhs ?? 0,
      effectiveFrom: editing.effectiveFrom,
      effectiveTo: editing.effectiveTo || '',
      currency: editing.currency,
      notes: editing.notes,
    };
  }, [editing]);

  const save = async (data: FeePolicyInput) => {
    setSaving(true);
    setFieldErrors({});
    try {
      if (editing) {
        await api.updateFeePolicy(editing.id, data);
        showSuccessToast('Draft updated', 'The policy is still a draft and applies to nothing.');
      } else {
        await api.createFeePolicy(data);
        showSuccessToast('Draft created', 'Nothing is approved or active yet.');
      }
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (err) {
      const apiError = err as { fields?: Record<string, string> };
      setFieldErrors(apiError.fields ?? {});
      showErrorToast('Could not save the policy', messageForError(err));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    policy: FeePolicy,
    action: 'submit' | 'approve' | 'reject' | 'activate' | 'deactivate'
  ) => {
    const text = note.trim();
    if ((action === 'approve' || action === 'reject' || action === 'deactivate') && text === '') {
      showErrorToast('A note is required', 'Record what you checked, or why the policy is being stopped.');
      return;
    }

    setBusyId(policy.id);
    try {
      if (action === 'submit') await api.submitFeePolicy(policy.id, text);
      if (action === 'approve') await api.approveFeePolicy(policy.id, text);
      if (action === 'reject') await api.rejectFeePolicy(policy.id, text);
      if (action === 'activate') await api.activateFeePolicy(policy.id, text);
      if (action === 'deactivate') await api.deactivateFeePolicy(policy.id, text);
      showSuccessToast('Policy updated', `${policy.name}: ${action} recorded.`);
      setNote('');
      await load();
    } catch (err) {
      showErrorToast('Action refused', messageForError(err));
    } finally {
      setBusyId(null);
    }
  };

  const openHistory = async (policy: FeePolicy) => {
    try {
      const result = await api.getFeePolicy(policy.id);
      setHistory({ policy: result.policy, events: result.history });
    } catch (err) {
      showErrorToast('Could not load the history', messageForError(err));
    }
  };

  if (!canRead) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-3">
        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-700" /> Fee policies
        </h3>
        <p className="text-xs text-ink/70 max-w-2xl">
          Financial policy is not an administrator default. This account holds neither the fee-policy manager nor
          the approver capability, so the policies, their percentages and the approval actions stay closed.
        </p>
        <p className="text-[11px] text-ink/70">
          A server administrator grants either capability with{' '}
          <code className="text-ink">php php-backend/grant_finance.php --email=… --manage=1</code> (or{' '}
          <code className="text-ink">--approve=1</code>). Every endpoint re-checks it.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-surface p-6 rounded-2xl border border-line flex items-center gap-3 text-xs text-ink/70">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading fee policies…
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="bg-surface p-6 rounded-2xl border border-accent/30 text-xs text-ink flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> {error || 'Fee policies are unavailable.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-ink" /> Fee policies & agent tiers
          </h3>
          <p className="text-[11px] text-ink/70 max-w-2xl">
            Creating a policy, approving it and switching it on are three separate acts. Approval must come from a
            different administrator from the one who drafted it, and nothing is applied to a fee unless an authorised
            administrator applies it explicitly.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={async () => {
              await refreshSession();
              await load();
            }}
            className="px-3 py-1.5 rounded-lg bg-page hover:bg-line text-ink text-[11px] font-bold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {canManage && (
            <button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-interactive text-ink text-[11px] font-extrabold flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" /> New draft
            </button>
          )}
        </div>
      </div>

      {/* Proposals: labelled, inactive, never computed with. */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-[11px] text-amber-800 space-y-1">
          <p className="font-bold">Proposed arrangements — inactive</p>
          <p className="text-amber-800/90">
            {overview.proposed
              .map((p) => `${p.label}: agent ${p.agentSharePercent}% / Goodlucks ${p.goodlucksSharePercent}%`)
              .join(' · ')}
          </p>
          <p className="text-amber-800/70">
            These percentages are proposals only. They are never used in a calculation, they are not policies, and no
            record of them exists in the database. Only a policy you approve and activate below can price a fee.
          </p>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-4 text-[11px] text-ink/70 space-y-1">
        <p className="font-bold text-ink flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-ink" /> Your capabilities
        </p>
        <p>
          Create / edit: <span className="font-bold">{canManage ? 'yes' : 'no'}</span> · Approve / activate:{' '}
          <span className="font-bold">{canApprove ? 'yes' : 'no'}</span>
          {canApprove && !canManage && ' — you can approve policies, but not draft them.'}
          {canManage && !canApprove && ' — you can draft policies, but not approve them.'}
        </p>
        {canSelfApprove ? (
          <p className="text-ink">
            This is the <span className="font-bold">primary administrator</span> account: it may approve a policy it
            created itself. The approval is recorded as a self-approval, and every other administrator still needs a
            different administrator to approve theirs.
          </p>
        ) : (
          <p className="text-ink/70">
            A policy is approved by a different administrator from the one who created it. Only the primary platform
            administrator may approve its own.
          </p>
        )}
        <p className="text-ink/70">
          Active policies: {overview.counts.active ?? 0} · awaiting approval: {overview.counts.pending_approval ?? 0} ·
          drafts: {overview.counts.draft ?? 0}
        </p>
      </div>

      {(showForm || editing) && canManage && (
        <FeePolicyForm
          key={editing?.id ?? 'new'}
          initial={initialForm}
          editing={Boolean(editing)}
          categories={overview.categories}
          tiers={overview.tiers}
          saving={saving}
          errors={fieldErrors}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
            setFieldErrors({});
          }}
          onSubmit={save}
        />
      )}

      {overview.policies.length === 0 ? (
        <div className="bg-surface p-6 rounded-2xl border border-line text-xs text-ink/70">
          No fee policy exists. That is the shipped state: every fee is priced by an explicit agreement or not at all.
        </div>
      ) : (
        <div className="space-y-3">
          {overview.policies.map((policy) => (
            <div key={policy.id} className="bg-surface border border-line rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-ink">{policy.name}</h4>
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusStyles[policy.status]}`}>
                      {policy.statusLabel}
                    </span>
                    {policy.expired && (
                      <span className="text-[10px] text-ink">
                        (stored decision: {policy.storedStatus.replace('_', ' ')})
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink/70 mt-1">
                    {policy.agentTierLabel} · {policy.categoryLabel} ·{' '}
                    {policy.calculationMethod === 'percentage'
                      ? `agent ${policy.agentSharePercent}% / Goodlucks ${policy.goodlucksSharePercent}%`
                      : `agent ${money(policy.agentShareFixedGhs)} / Goodlucks ${money(policy.goodlucksShareFixedGhs)}`}
                  </p>
                  <p className="text-[10px] text-ink/70">
                    Effective {policy.effectiveFrom || '—'}
                    {policy.effectiveTo ? ` → ${policy.effectiveTo}` : ' (no end date)'} · version {policy.version}
                    {policy.approved && policy.approvedAt ? ` · approved ${new Date(policy.approvedAt).toLocaleDateString()}` : ' · not approved'}
                  </p>
                  {policy.selfApproved && (
                    <p className="text-[10px] text-ink flex items-start gap-1">
                      <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0" />
                      Approved by the primary administrator, who also drafted it. Recorded on the
                      policy and in the audit trail; other administrators still need a second person.
                    </p>
                  )}
                  {policy.rejectionReason && (
                    <p className="text-[10px] text-ink">Rejected: {policy.rejectionReason}</p>
                  )}
                  {policy.deactivationReason && (
                    <p className="text-[10px] text-ink/70">Deactivated: {policy.deactivationReason}</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {canManage && policy.status === 'draft' && (
                    <>
                      <button
                        onClick={() => {
                          setEditing(policy);
                          setShowForm(false);
                        }}
                        className="px-2.5 py-1 rounded-md bg-page hover:bg-line text-ink text-[11px] flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                      <button
                        disabled={busyId === policy.id}
                        onClick={() => void runAction(policy, 'submit')}
                        className="px-2.5 py-1 rounded-md bg-interactive/15 text-ink hover:bg-interactive/25 text-[11px] disabled:opacity-50 flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" /> Submit for approval
                      </button>
                    </>
                  )}
                  {canApprove && policy.status === 'pending_approval' && (
                    <>
                      <button
                        disabled={busyId === policy.id}
                        onClick={() => void runAction(policy, 'approve')}
                        className="px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 text-[11px] disabled:opacity-50 flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Approve
                      </button>
                      <button
                        disabled={busyId === policy.id}
                        onClick={() => void runAction(policy, 'reject')}
                        className="px-2.5 py-1 rounded-md bg-accent/15 text-ink hover:bg-accent/25 text-[11px] disabled:opacity-50 flex items-center gap-1"
                      >
                        <XCircle className="w-3 h-3" /> Reject
                      </button>
                    </>
                  )}
                  {canApprove && policy.status === 'approved' && (
                    <button
                      disabled={busyId === policy.id}
                      onClick={() => void runAction(policy, 'activate')}
                      className="px-2.5 py-1 rounded-md bg-interactive text-ink text-[11px] font-bold disabled:opacity-50 flex items-center gap-1"
                      title="Activation is refused before the start date and while another policy overlaps."
                    >
                      <PlayCircle className="w-3 h-3" /> Activate
                    </button>
                  )}
                  {canApprove && policy.status === 'active' && (
                    <button
                      disabled={busyId === policy.id}
                      onClick={() => void runAction(policy, 'deactivate')}
                      className="px-2.5 py-1 rounded-md bg-line text-ink hover:bg-line text-[11px] disabled:opacity-50 flex items-center gap-1"
                    >
                      <StopCircle className="w-3 h-3" /> Deactivate
                    </button>
                  )}
                  <button
                    onClick={() => void openHistory(policy)}
                    className="px-2.5 py-1 rounded-md bg-page hover:bg-line text-ink text-[11px] flex items-center gap-1"
                  >
                    <History className="w-3 h-3" /> History
                  </button>
                </div>
              </div>

              {(canApprove || canManage) && ['pending_approval', 'approved', 'active'].includes(policy.status) && (
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note for this action (required to approve, reject or deactivate)"
                  className="w-full bg-page border border-line rounded-xl px-3 py-2 text-[11px] text-ink"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-ink/70 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Approving a policy does not move money and does not mark anything received. Applying a policy to a viewing fee
        freezes its terms in a snapshot; Goodlucks revenue is only recognised when a remittance is recorded in the
        ledger.
      </p>

      {history && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm p-2 sm:p-6 overflow-y-auto">
          <div className="max-w-2xl mx-auto bg-surface border border-line rounded-2xl p-5 space-y-4 my-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-ink">{history.policy.name} — history</h4>
                <p className="text-[11px] text-ink/70">
                  Append-only. Approvals and activations cannot be erased.
                </p>
              </div>
              <button
                onClick={() => setHistory(null)}
                className="px-3 py-1.5 rounded-lg bg-surface text-ink/70 text-[11px] font-bold"
              >
                Close
              </button>
            </div>
            <ul className="space-y-1.5">
              {history.events.map((event) => (
                <li key={event.id} className="text-[11px] bg-surface border border-line rounded-lg px-3 py-2 text-ink/70">
                  <span className="font-bold text-ink">{event.action}</span>{' '}
                  <span className="text-ink/70">
                    {event.fromStatus} → {event.toStatus}
                  </span>
                  <span className="text-ink/70">
                    {' '}
                    · {event.actorName || 'system'} · {new Date(event.at).toLocaleString()}
                  </span>
                  {event.note && <p className="text-ink/70 mt-1">{event.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
