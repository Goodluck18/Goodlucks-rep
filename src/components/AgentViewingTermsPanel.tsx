import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Pencil, XCircle } from 'lucide-react';
import type { Property } from '../types';
import { api, messageForError } from '../services/apiService';
import {
  ViewingTermsFields,
  emptyViewingTermsForm,
  viewingTermsPayload,
  viewingTermsToForm,
  type ViewingTermsFormState,
} from './ViewingTermsFields';

/**
 * Task 03: the viewing fee and viewing terms for ONE listing.
 *
 * Shown inside the agent's own listings list. It states the approved fee plainly
 * and, when the agent proposes a change to a live listing, says that the change
 * waits for review and that the current fee still applies. Nothing here can
 * change an approved fee by itself.
 */
export const AgentViewingTermsPanel: React.FC<{
  property: Property;
  onUpdated?: () => void | Promise<void>;
}> = ({ property, onUpdated }) => {
  const terms = property.viewingTerms;
  const approved = terms?.isApproved ? terms : null;
  const pending = terms?.pendingChange ?? null;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ViewingTermsFormState>(() =>
    viewingTermsToForm(terms?.feeGhs ?? null, terms?.terms ?? null)
  );
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const startEdit = () => {
    setForm(viewingTermsToForm(approved?.feeGhs ?? null, approved?.terms ?? null));
    setError(null);
    setNotice(null);
    setEditing(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFields({});
    const fee = Number(form.feeGhs);
    if (!form.feeGhs.trim() || !Number.isFinite(fee) || fee <= 0) {
      setError('Enter this property’s viewing fee in GHS. There is no standard amount.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.requestViewingTerms(property.id, {
        viewingFeeGhs: fee,
        viewingTerms: viewingTermsPayload(form),
      });
      setNotice(result.message);
      setEditing(false);
      await onUpdated?.();
    } catch (err) {
      const apiError = err as { fields?: Record<string, string> };
      setFields(apiError.fields ?? {});
      setError(messageForError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-line bg-surface p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-ink/70">Viewing fee:</span>
        {approved ? (
          <span className="px-2 py-0.5 rounded-md bg-interactive/15 border border-interactive/30 text-ink font-bold">
            GH₵ {approved.feeGhs?.toLocaleString()}
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-800">
            Not approved yet
          </span>
        )}
        {terms?.state === 'pending_review' && (
          <span className="px-2 py-0.5 rounded-md bg-surface border border-line text-ink/70 inline-flex items-center gap-1">
            <Clock3 className="w-3 h-3" /> Waiting for review
          </span>
        )}
        {terms?.state === 'rejected' && (
          <span className="px-2 py-0.5 rounded-md bg-accent/10 border border-accent/30 text-ink inline-flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Last change was rejected
          </span>
        )}
        {terms?.state === 'approved' && (
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Approved
          </span>
        )}
        <button
          type="button"
          onClick={startEdit}
          className="ml-auto px-2.5 py-1 rounded-lg bg-page hover:bg-page border border-line text-ink inline-flex items-center gap-1"
        >
          <Pencil className="w-3 h-3" /> {approved ? 'Change fee & terms' : 'Set fee & terms'}
        </button>
      </div>

      {approved?.terms && (
        <p className="text-[11px] text-ink/70 leading-snug">
          {approved.terms.appointmentRequired ? 'Appointment required' : 'No appointment needed'}
          {' · '}
          {approved.terms.howToArrange}
        </p>
      )}

      {pending && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-800">
          A change to GH₵ {pending.proposedFeeGhs?.toLocaleString()} is waiting for review. The approved fee above
          stays in place until staff decide.
        </div>
      )}

      {terms?.state === 'rejected' && !pending && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 p-2 text-[11px] text-ink">
          The last proposal was not approved, so the fee above still applies. Read the reason in the notification and
          submit a corrected fee and terms.
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-interactive/30 bg-interactive/10 p-2 text-[11px] text-ink">
          {notice}
        </div>
      )}

      {editing && (
        <form onSubmit={submit} className="space-y-3 pt-1">
          <ViewingTermsFields form={form} onChange={setForm} errors={fields} idPrefix={`terms-${property.id}`} />
          {error && (
            <div role="alert" className="p-2 rounded-lg bg-accent/15 border border-accent/30 text-[11px] text-ink flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="gl-btn gl-btn-primary px-3 py-1.5 text-[11px]"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {saving ? 'Sending…' : 'Send for review'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 rounded-lg bg-page border border-line text-ink/70 text-[11px]"
            >
              Cancel
            </button>
            <span className="text-[10px] text-ink/70">
              Changes to a live listing are reviewed before they take effect.
            </span>
          </div>
        </form>
      )}
    </div>
  );
};

export default AgentViewingTermsPanel;
