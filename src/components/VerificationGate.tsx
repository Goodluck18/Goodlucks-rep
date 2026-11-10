import React from 'react';
import { useApp } from '../context/AppContext';
import { ShieldAlert, ArrowRight } from 'lucide-react';

/**
 * The one sentence the business uses when listing is closed.
 *
 * It is repeated verbatim on the listing page, in the dashboards and in the API
 * error, so a member sees the same instruction wherever they hit the rule.
 */
export const VERIFICATION_REQUIRED_MESSAGE =
  'Complete your identity verification to start listing properties on Goodlucks Homes.';

/** Where an Agent/Landlord account completes its verification. */
export const verificationPath = (role: string | undefined): string =>
  role === 'landlord' ? '/landlord/verification' : '/agent/verification';

/**
 * The notice shown wherever a property action is blocked by verification.
 *
 * It renders nothing when the account is allowed to list, so it is safe to place
 * above a listing form. It states the rule, the current state and the next step;
 * it does not explain what is optional, because verification is not.
 */
export const VerificationRequiredNotice: React.FC<{
  className?: string;
  /** Overrides the generic sentence with the server's own reason. */
  message?: string;
  /** Hide the "go to verification" button (e.g. when already on that page). */
  showAction?: boolean;
}> = ({ className = '', message, showAction = true }) => {
  const { currentUser, navigate } = useApp();

  if (!currentUser || currentUser.canListProperties !== false) return null;

  const blockedReason = currentUser.listingBlockedReason ?? '';
  const status = currentUser.identityVerificationStatus ?? 'not_submitted';

  const detail =
    message ||
    (blockedReason === 'classification_required'
      ? 'Choose whether you are an Agent or a Landlord first — it is the first step of verification.'
      : blockedReason === 'suspended'
        ? 'This account is suspended, so listing submissions are closed. Contact Goodlucks Homes.'
        : status === 'pending_review' || status === 'under_review'
          ? 'Your identity verification is waiting for review. Listing opens as soon as it is approved.'
          : status === 'rejected' || status === 'resubmission_required'
            ? 'Your identity verification was not approved. Correct it and resubmit to start listing.'
            : VERIFICATION_REQUIRED_MESSAGE);

  return (
    <div
      role="status"
      className={`rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${className}`}
    >
      <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-ink">Verification required before listing</p>
        <p className="text-[11px] text-ink/80 leading-relaxed mt-0.5">{detail}</p>
      </div>
      {showAction && (
        <button
          type="button"
          onClick={() => navigate(verificationPath(currentUser.role))}
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-interactive text-ink text-[11px] font-extrabold hover:bg-interactive/90 transition-colors"
        >
          Go to verification
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
