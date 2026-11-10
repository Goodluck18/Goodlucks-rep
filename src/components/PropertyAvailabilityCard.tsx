import React, { useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Loader2 } from 'lucide-react';
import type { Property } from '../types';
import { api } from '../services/apiService';
import { useApp } from '../context/AppContext';

/**
 * The seven-day availability confirmation, in the provider's own words.
 *
 * Every published listing has to be reconfirmed every seven days. This card is
 * where an Agent or Landlord answers that question. It is presentation only: the
 * server decides whether a listing is public (`availabilityRenewal.publiclyVisible`)
 * and refuses a confirmation that is not allowed — there is no timer here and
 * nothing in the browser can keep a listing live.
 */
interface PropertyAvailabilityCardProps {
  property: Property;
  /** Called after a successful answer so the dashboard can refresh its data. */
  onUpdated?: () => void | Promise<void>;
}

const formatDeadline = (value: string): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const timeLeft = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return '';
  if (seconds <= 0) return 'The deadline has passed.';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} left`;
  return 'Less than an hour left';
};

export const PropertyAvailabilityCard: React.FC<PropertyAvailabilityCardProps> = ({ property, onUpdated }) => {
  const { showErrorToast, showSuccessToast } = useApp();
  const [busy, setBusy] = useState<'confirm' | 'decline' | null>(null);

  const renewal = property.availabilityRenewal;
  if (!renewal) return null;

  const needsAnswer = renewal.awaitingProvider || renewal.state === 'expired';
  const isExpired = renewal.state === 'expired' || renewal.state === 'unavailable';

  const answer = async (kind: 'confirm' | 'decline') => {
    setBusy(kind);
    try {
      if (kind === 'confirm') {
        const result = await api.confirmPropertyAvailability(property.id);
        showSuccessToast('Availability confirmed', result.message);
      } else {
        const result = await api.declinePropertyAvailability(property.id);
        showSuccessToast('Marked as no longer available', result.message);
      }
      await onUpdated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      showErrorToast(kind === 'confirm' ? 'Could not confirm availability' : 'Could not update the listing', message);
    } finally {
      setBusy(null);
    }
  };

  if (!needsAnswer) {
    return (
      <p className="text-[11px] text-ink/70 flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5 shrink-0 text-interactive-text" />
        {renewal.dueAt
          ? `Availability confirmed. Next confirmation due ${formatDeadline(renewal.dueAt)}.`
          : `Availability confirmed. ${renewal.explanation ?? ''}`}
      </p>
    );
  }

  return (
    <div
      className={`mt-2 rounded-xl border p-3 space-y-2 ${
        isExpired ? 'border-amber-300 bg-amber-50' : 'border-interactive/40 bg-interactive/5'
      }`}
    >
      <p className="text-[11px] font-bold text-ink flex items-center gap-1.5">
        <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${isExpired ? 'text-amber-700' : 'text-interactive-text'}`} />
        {renewal.label}
      </p>
      <p className="text-[11px] text-ink/70 leading-snug">{renewal.explanation}</p>
      {renewal.dueAt && (
        <p className="text-[11px] text-ink/70">
          {isExpired ? 'Missed deadline: ' : 'Confirm before: '}
          <span className="font-semibold text-ink">{formatDeadline(renewal.dueAt)}</span>
          {!isExpired && timeLeft(renewal.dueInSeconds) && ` · ${timeLeft(renewal.dueInSeconds)}`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => answer('confirm')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-interactive text-ink text-[11px] font-bold disabled:opacity-60"
        >
          {busy === 'confirm' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Confirm Property Availability
        </button>
        <button
          type="button"
          onClick={() => answer('decline')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface text-ink text-[11px] font-semibold disabled:opacity-60"
        >
          {busy === 'decline' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Mark as no longer available
        </button>
      </div>
      <p className="text-[10px] text-ink/60 leading-snug">
        Confirming keeps this listing advertised for another seven days. If you mark it unavailable, it is removed from
        public view and your record, photographs and history are kept.
      </p>
    </div>
  );
};

export default PropertyAvailabilityCard;
