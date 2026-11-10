import React, { useState } from 'react';
import { FileText, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * The re-acceptance prompt.
 *
 * It appears ONLY when both of these are true:
 *   1. an administrator has switched the prompt on in Admin → Legal Pages, and
 *   2. the signed-in account's latest acceptance is older than the published
 *      Terms.
 *
 * That is deliberate. Publishing a new version must never silently change what an
 * existing account is allowed to do, and an existing account is never marked as
 * having accepted anything it did not accept. Switching the prompt on is the
 * separate, explicitly designed process; switching it off hides this dialog
 * again without touching a single acceptance record.
 */
export const LegalReacceptancePrompt: React.FC = () => {
  const { currentUser, legalAcceptance, acceptLegalDocuments, logout } = useApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!currentUser || !legalAcceptance) return null;
  if (!legalAcceptance.reacceptanceRequired) return null;
  if (!legalAcceptance.terms.needsAcceptance) return null;

  const accept = async () => {
    setSaving(true);
    setError(null);
    try {
      await acceptLegalDocuments({ termsAccepted: true, privacyAcknowledged: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your acceptance.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-ink/60 backdrop-blur-sm p-4 overflow-y-auto flex items-start sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-reacceptance-title"
    >
      <div className="w-full max-w-lg bg-surface border border-line rounded-2xl shadow-lg p-5 sm:p-6 my-8">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-interactive/15 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-ink" />
          </div>
          <div>
            <h2 id="legal-reacceptance-title" className="text-base font-black text-ink">
              The Terms and Conditions have been updated
            </h2>
            <p className="text-sm text-ink/70 mt-1 leading-relaxed">
              We have published version {legalAcceptance.terms.currentVersion} of the Terms and Conditions. Please read
              it and accept it to continue using your account. Your earlier acceptance is kept as it was recorded.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/terms-and-conditions"
            target="_blank"
            rel="noopener noreferrer"
            className="gl-btn gl-btn-secondary text-sm"
          >
            <FileText className="w-4 h-4" /> Read the Terms and Conditions
          </a>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs font-semibold text-accent-text">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink/60 hover:text-ink px-2 py-1 rounded-lg hover:bg-page"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out instead
          </button>
          <button type="button" onClick={accept} disabled={saving} className="gl-btn gl-btn-primary text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            I accept the current Terms
          </button>
        </div>
      </div>
    </div>
  );
};
