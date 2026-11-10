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
import { PropertyImagePicker } from './PropertyImagePicker';

/**
 * The agent-facing listing submission form (Increment F).
 *
 * The backend for this shipped in Increment C but had no honest interface: the
 * old screen said submission "is not open yet". It is open now.
 *
 * Upgrade 2 (C1): agents are independent providers. There is no landlord
 * reference to supply and no owner account to attach — the agent's own account
 * is the provider for the listing, and the platform claims no ownership or
 * legal authority on anyone's behalf. What the form therefore has to be honest
 * about is that the viewing fee and terms are the agent's own, and that the
 * listing stays in review until staff approve it.
 */

const PROPERTY_TYPES = ['Apartment', 'House', 'Townhouse', 'Studio', 'Duplex', 'Self-contained', 'Flat', 'Detached', 'Semi-detached'];

// The labels the server maps onto its canonical amenity keys (C5). Sending the
// words keeps this list readable; the server is what decides the key.
const AMENITY_CHOICES = [
  'Air conditioning',
  'Backup power',
  'Balcony',
  'Borehole water',
  'CCTV',
  'Elevator',
  'Fenced compound',
  'Fitted kitchen',
  'Furnished',
  'Gated community',
  'Gym',
  'Internet ready',
  'Parking',
  'Pet friendly',
  'Swimming pool',
  'Security guard',
  'Solar power',
  'Staff quarters',
  'Water storage tank',
];

const emptyForm = {
  title: '',
  location: '',
  city: 'Accra',
  rentGhs: '',
  bedrooms: '1',
  bathrooms: '1',
  propertyType: 'Apartment',
  description: '',
  videoUrl: '',
  toilets: '',
  kitchens: '',
  furnishing: '',
  amenitiesNote: '',
  commissionPercent: '',
  commissionNote: '',
};

export const AgentListingForm: React.FC<{ canSubmit: boolean }> = ({ canSubmit }) => {
  const { refreshProperties, showSuccessToast, showErrorToast } = useApp();
  const [form, setForm] = useState(emptyForm);
  const [images, setImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [amenities, setAmenities] = useState<string[]>([]);
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
        images,
        amenities,
        toilets: form.toilets.trim() === '' ? null : Number(form.toilets),
        kitchens: form.kitchens.trim() === '' ? null : Number(form.kitchens),
        furnishing: form.furnishing || undefined,
        videoUrl: form.videoUrl.trim() || undefined,
        amenitiesNote: form.amenitiesNote.trim() || undefined,
        providerCommissionPercent:
          form.commissionPercent.trim() === '' ? null : Number(form.commissionPercent),
        providerCommissionNote: form.commissionNote.trim() || undefined,
        viewingFeeGhs: fee,
        viewingTerms: viewingTermsPayload(viewingTerms),
      });
      setSubmittedTitle(property.property.title);
      setForm(emptyForm);
      setImages([]);
      setAmenities([]);
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
          Listing submissions open once your identity verification has been approved. An account that is unverified or
          suspended cannot submit properties.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <PlusCircle className="w-4 h-4 text-ink" /> List a property
        </h2>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-[11px] text-amber-800 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          You are listing this property as an independent Goodlucks agent. No landlord account is attached to the
          listing and no ownership claim is made — you are the provider, so the viewing fee and terms you set here are
          yours. The listing stays in review until staff approve it.
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

        </div>

        <PropertyImagePicker
          images={images}
          onChange={setImages}
          onBusyChange={setIsUploading}
          disabled={saving}
          idPrefix="agent-listing"
        />

        <div className="border-t border-line pt-3 space-y-3">
          <p className="text-xs font-bold text-ink flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-ink" /> Specs, amenities and video
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block text-[11px] font-semibold text-ink/70">
              Toilets
              <input
                inputMode="numeric"
                value={form.toilets}
                onChange={(event) => set('toilets', event.target.value)}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
                placeholder="2"
              />
            </label>
            <label className="block text-[11px] font-semibold text-ink/70">
              Kitchens
              <input
                inputMode="numeric"
                value={form.kitchens}
                onChange={(event) => set('kitchens', event.target.value)}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
                placeholder="1"
              />
            </label>
            <label className="col-span-2 block text-[11px] font-semibold text-ink/70">
              Furnishing
              <select
                value={form.furnishing}
                onChange={(event) => set('furnishing', event.target.value)}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              >
                <option value="">Not stated</option>
                <option value="unfurnished">Unfurnished</option>
                <option value="semi_furnished">Semi-furnished</option>
                <option value="furnished">Furnished</option>
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="text-[11px] font-semibold text-ink/70">Amenities</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {AMENITY_CHOICES.map((amenity) => {
                const selected = amenities.includes(amenity);
                return (
                  <button
                    type="button"
                    key={amenity}
                    aria-pressed={selected}
                    onClick={() =>
                      setAmenities((prev) =>
                        prev.includes(amenity) ? prev.filter((value) => value !== amenity) : [...prev, amenity]
                      )
                    }
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      selected ? 'bg-interactive/15 border-interactive/40 text-ink' : 'bg-page border-line text-ink/70'
                    }`}
                  >
                    {amenity}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block text-[11px] font-semibold text-ink/70">
            Other amenities (free text)
            <input
              value={form.amenitiesNote}
              onChange={(event) => set('amenitiesNote', event.target.value)}
              className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              placeholder="Anything not listed above — it is kept word for word"
            />
          </label>

          <label className="block text-[11px] font-semibold text-ink/70">
            Video link (YouTube, TikTok or Facebook)
            <input
              type="url"
              value={form.videoUrl}
              onChange={(event) => set('videoUrl', event.target.value)}
              className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              placeholder="https://www.youtube.com/watch?v=…"
            />
            {fields.videoUrl && <span className="text-[10px] text-accent">{fields.videoUrl}</span>}
            <span className="mt-1 block text-[10px] text-ink/60">
              Only YouTube, TikTok and Facebook are accepted. Short links (vm.tiktok.com, fb.watch) are refused
              because they cannot be verified without opening them.
            </span>
          </label>
        </div>

        <div className="border-t border-line pt-3 space-y-2">
          <p className="text-xs font-bold text-ink flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-ink" /> Your commission expectation (optional)
          </p>
          <p className="text-[10px] text-ink/70">
            What you expect from the property owner. This is <strong>your expectation</strong> — it is not a Goodlucks
            fee, it is not charged by Goodlucks, and nothing on the platform is calculated from it.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block text-[11px] font-semibold text-ink/70">
              Percent
              <input
                inputMode="decimal"
                value={form.commissionPercent}
                onChange={(event) => set('commissionPercent', event.target.value)}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
                placeholder="10"
              />
            </label>
            <label className="col-span-2 block text-[11px] font-semibold text-ink/70">
              Note
              <input
                value={form.commissionNote}
                onChange={(event) => set('commissionNote', event.target.value)}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
                placeholder="e.g. one month's rent, agreed with the owner"
              />
            </label>
          </div>
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

        <div className="border-t border-line pt-3 space-y-2">
          <p className="text-xs font-bold text-ink flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-ink" /> You are listing this property yourself
          </p>
          <p className="text-[10px] text-ink/70">
            Goodlucks agents list independently — there is no landlord reference to give and no owner account
            attached to this listing. You are the provider responsible for it: the viewing fee and terms above are
            yours, and tenants reach you through Goodlucks.
          </p>
        </div>

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
