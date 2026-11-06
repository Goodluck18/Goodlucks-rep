import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import { AlertTriangle, Building2, Info, Loader2, PlusCircle } from 'lucide-react';
import {
  ViewingTermsFields,
  emptyViewingTermsForm,
  viewingTermsPayload,
  type ViewingTermsFormState,
} from './ViewingTermsFields';

/**
 * The agent-facing listing submission form (Increment F).
 *
 * The backend for this shipped in Increment C but had no honest interface: the
 * old screen said submission "is not open yet". It is open now, with two rules
 * stated plainly on the form:
 *
 *   1. The agent names the landlord they act for. That is a declaration, not
 *      proof, and the platform never presents it as ownership verification.
 *   2. The landlord reference is resolved by the server. The screen is told the
 *      same thing whether or not the landlord has an account — there is no
 *      landlord picker and no "account not found" message to probe with.
 */

const PROPERTY_TYPES = ['Apartment', 'House', 'Townhouse', 'Studio', 'Duplex', 'Self-contained'];

const emptyForm = {
  title: '',
  location: '',
  city: 'Accra',
  rentGhs: '',
  bedrooms: '1',
  bathrooms: '1',
  propertyType: 'Apartment',
  description: '',
  images: '',
  landlordName: '',
  landlordEmail: '',
  landlordPhone: '',
};

export const AgentListingForm: React.FC<{ canSubmit: boolean }> = ({ canSubmit }) => {
  const { refreshProperties, showSuccessToast, showErrorToast } = useApp();
  const [form, setForm] = useState(emptyForm);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submittedTitle, setSubmittedTitle] = useState<string | null>(null);
  // Task 03: the property's own viewing fee and viewing terms. Deliberately
  // blank — there is no default fee to pre-fill.
  const [viewingTerms, setViewingTerms] = useState<ViewingTermsFormState>(emptyViewingTermsForm);

  const set = (key: keyof typeof emptyForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFields({});

    if (!form.landlordName.trim() || (!form.landlordEmail.trim() && !form.landlordPhone.trim())) {
      setError('Name the landlord and give at least one way to reach them (email or phone).');
      return;
    }

    const fee = Number(viewingTerms.feeGhs);
    if (!viewingTerms.feeGhs.trim() || !Number.isFinite(fee) || fee <= 0) {
      setError('Set this property\'s viewing fee in GHS. Every property has its own fee — there is no standard amount.');
      return;
    }
    if (viewingTerms.howToArrange.trim().length < 5 || viewingTerms.paymentInstructions.trim().length < 5) {
      setError('Say how a tenant arranges the viewing and how the viewing fee is paid.');
      return;
    }

    setSaving(true);
    try {
      const property = await api.createProperty({
        title: form.title.trim(),
        location: form.location.trim(),
        city: form.city.trim(),
        rentGhs: Number(form.rentGhs),
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        propertyType: form.propertyType,
        description: form.description.trim(),
        images: form.images
          .split(/[\n,]/)
          .map((value) => value.trim())
          .filter(Boolean),
        landlordName: form.landlordName.trim(),
        landlordEmail: form.landlordEmail.trim() || undefined,
        landlordPhone: form.landlordPhone.trim() || undefined,
        viewingFeeGhs: fee,
        viewingTerms: viewingTermsPayload(viewingTerms),
      });
      setSubmittedTitle(property.property.title);
      setForm(emptyForm);
      setViewingTerms(emptyViewingTermsForm);
      showSuccessToast(
        'Listing submitted for review',
        'Goodlucks staff will review it before it goes live. Your declaration of authority is recorded as unverified.'
      );
      await refreshProperties();
    } catch (err) {
      const apiError = err as { fields?: Record<string, string> };
      setFields(apiError.fields ?? {});
      setError(messageForError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!canSubmit) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-2">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Building2 className="w-4 h-4 text-amber-700" /> Submit a listing
        </h2>
        <p className="text-xs text-ink/70">
          Listing submissions open once an administrator approves your agent account. Pending and suspended accounts
          cannot submit.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <PlusCircle className="w-4 h-4 text-ink" /> Submit a listing for a landlord
        </h2>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-[11px] text-amber-800 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          You are declaring that this landlord has asked you to list the property. Goodlucks records that declaration
          and does <strong>not</strong> verify ownership or legal authority on this screen. Your own account is never
          recorded as the owner, and the listing stays in review until staff approve it.
        </span>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-[11px] font-semibold text-ink/70">
            Listing title
            <input
              required
              value={form.title}
              onChange={(event) => set('title', event.target.value)}
              className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              placeholder="e.g. 2-bedroom apartment in Osu"
            />
            {fields.title && <span className="text-[10px] text-ink">{fields.title}</span>}
          </label>

          <label className="block text-[11px] font-semibold text-ink/70">
            Area / neighbourhood
            <input
              required
              value={form.location}
              onChange={(event) => set('location', event.target.value)}
              className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              placeholder="e.g. Osu, Accra"
            />
            {fields.location && <span className="text-[10px] text-ink">{fields.location}</span>}
          </label>

          <label className="block text-[11px] font-semibold text-ink/70">
            City
            <input
              required
              value={form.city}
              onChange={(event) => set('city', event.target.value)}
              className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
            />
          </label>

          <label className="block text-[11px] font-semibold text-ink/70">
            Annual rent (GH₵)
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.rentGhs}
              onChange={(event) => set('rentGhs', event.target.value)}
              className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
            />
            {fields.rentGhs && <span className="text-[10px] text-ink">{fields.rentGhs}</span>}
          </label>

          <label className="block text-[11px] font-semibold text-ink/70">
            Bedrooms
            <input
              type="number"
              min="0"
              value={form.bedrooms}
              onChange={(event) => set('bedrooms', event.target.value)}
              className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
            />
          </label>

          <label className="block text-[11px] font-semibold text-ink/70">
            Bathrooms
            <input
              type="number"
              min="0"
              value={form.bathrooms}
              onChange={(event) => set('bathrooms', event.target.value)}
              className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
            />
          </label>

          <label className="block text-[11px] font-semibold text-ink/70">
            Property type
            <select
              value={form.propertyType}
              onChange={(event) => set('propertyType', event.target.value)}
              className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
            >
              {PROPERTY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-[11px] font-semibold text-ink/70">
            Image links (one per line)
            <input
              value={form.images}
              onChange={(event) => set('images', event.target.value)}
              className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              placeholder="https://…"
            />
            {fields.images && <span className="text-[10px] text-ink">{fields.images}</span>}
          </label>
        </div>

        <label className="block text-[11px] font-semibold text-ink/70">
          Description
          <textarea
            required
            rows={3}
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
            placeholder="What the property offers, its condition, and anything a viewer should know."
          />
          {fields.description && <span className="text-[10px] text-ink">{fields.description}</span>}
        </label>

        <div className="border-t border-line pt-3 space-y-3">
          <p className="text-xs font-bold text-ink flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-ink" /> Viewing fee &amp; viewing terms for this property
          </p>
          <ViewingTermsFields form={viewingTerms} onChange={setViewingTerms} errors={fields} idPrefix="listing" />
        </div>

        <div className="border-t border-line pt-3 space-y-3">
          <p className="text-xs font-bold text-ink flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-ink" /> The landlord you are acting for
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block text-[11px] font-semibold text-ink/70">
              Landlord name
              <input
                required
                value={form.landlordName}
                onChange={(event) => set('landlordName', event.target.value)}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              />
            </label>
            <label className="block text-[11px] font-semibold text-ink/70">
              Landlord email
              <input
                type="email"
                value={form.landlordEmail}
                onChange={(event) => set('landlordEmail', event.target.value)}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              />
            </label>
            <label className="block text-[11px] font-semibold text-ink/70">
              Landlord phone
              <input
                value={form.landlordPhone}
                onChange={(event) => set('landlordPhone', event.target.value)}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              />
            </label>
          </div>
          {fields.landlordId && <p className="text-[10px] text-ink">{fields.landlordId}</p>}
          <p className="text-[10px] text-ink/70">
            Give us the landlord&apos;s own contact details. Staff will use them to confirm the relationship; the form
            will not tell you whether the landlord already has a Goodlucks account.
          </p>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-[11px] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {submittedTitle && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-800">
            “{submittedTitle}” was submitted for review. It is not live yet.
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="gl-btn gl-btn-primary px-5 py-2.5 text-xs flex"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saving ? 'Submitting…' : 'Submit listing for review'}
        </button>
      </form>
    </div>
  );
};
