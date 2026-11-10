import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SEOHead } from './SEOHead';
import { Building2, Home, ShieldCheck, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';

/**
 * The one-time professional classification of an Agent/Landlord account.
 *
 * The website offers two account groups: Tenant, and ONE Agent/Landlord account.
 * An Agent and a Landlord are not separate accounts and there is no separate
 * registration or sign-in for either: this page is where the same signed-in
 * account says which of the two it is, as the first step of verification.
 *
 * The choice is made once. If it is genuinely wrong afterwards, Goodlucks staff
 * correct it from the admin console — the account holder cannot reclassify
 * themselves, and cannot create a second account to get the other label.
 */
export const ProviderClassificationView: React.FC = () => {
  const { currentUser, chooseProviderCategory, logout, setCurrentView } = useApp();
  const [choice, setChoice] = useState<'agent' | 'landlord' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!choice || saving) return;
    setSaving(true);
    setError('');
    const result = await chooseProviderCategory(choice);
    setSaving(false);
    if (!result.ok) {
      setError(result.error || 'We could not save your choice. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-page text-ink py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <SEOHead
        title="Agent or Landlord - Account Classification | Goodlucks Homes"
        description="Choose whether your Goodlucks Homes Agent/Landlord account is verified as an Agent or as a Landlord. This is the first step of verification."
      />

      <div className="max-w-2xl w-full space-y-6">
        <div className="bg-surface border border-line rounded-2xl p-6 sm:p-8 shadow-lg space-y-6">
          <div className="space-y-2 text-center">
            <div className="w-16 h-16 rounded-2xl bg-interactive/20 text-ink border border-interactive/30 flex items-center justify-center mx-auto shadow-inner">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <span className="inline-block px-3.5 py-1 rounded-full text-[11px] font-extrabold bg-interactive/10 text-ink border border-interactive/20 uppercase tracking-wider">
              Step 1 of verification
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Are you an Agent or a Landlord?
            </h1>
            <p className="text-xs sm:text-sm text-ink/70 leading-relaxed max-w-lg mx-auto">
              You registered an <strong>Agent/Landlord account</strong>
              {currentUser?.name ? `, ${currentUser.name}` : ''}. Tell us which one you are, then complete the Ghana Card
              verification that follows. Listing properties opens once staff approve it — it is not a new sign-up, and
              you stay signed in.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" role="radiogroup" aria-label="Account classification">
            <button
              type="button"
              role="radio"
              aria-checked={choice === 'agent'}
              onClick={() => setChoice('agent')}
              className={`text-left rounded-2xl border p-5 transition-colors ${
                choice === 'agent'
                  ? 'border-interactive bg-interactive/10'
                  : 'border-line bg-surface hover:border-interactive/60'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="w-10 h-10 rounded-xl bg-interactive/20 border border-interactive/30 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </span>
                {choice === 'agent' && <CheckCircle2 className="w-5 h-5 text-interactive-text" />}
              </div>
              <div className="font-black text-ink">Agent</div>
              <p className="text-xs text-ink/70 leading-relaxed mt-1">
                You list properties for other people, with or without an agency. You complete your agent profile and
                professional authorisation during verification.
              </p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={choice === 'landlord'}
              onClick={() => setChoice('landlord')}
              className={`text-left rounded-2xl border p-5 transition-colors ${
                choice === 'landlord'
                  ? 'border-interactive bg-interactive/10'
                  : 'border-line bg-surface hover:border-interactive/60'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="w-10 h-10 rounded-xl bg-interactive/20 border border-interactive/30 flex items-center justify-center">
                  <Home className="w-5 h-5" />
                </span>
                {choice === 'landlord' && <CheckCircle2 className="w-5 h-5 text-interactive-text" />}
              </div>
              <div className="font-black text-ink">Landlord</div>
              <p className="text-xs text-ink/70 leading-relaxed mt-1">
                You list property you own or manage yourself. You verify your identity, and no agent profile is needed.
              </p>
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 text-xs text-accent-text">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!choice || saving}
            className="gl-btn-primary w-full py-3 rounded-xl font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : choice === 'landlord' ? 'Continue as a Landlord' : 'Continue as an Agent'}
          </button>

          <p className="text-[11px] text-ink/60 text-center leading-relaxed">
            This choice is made once and sets how the account is verified. If it later turns out to be wrong, Goodlucks
            staff can correct it — you do not need a second account.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-ink/70">
          <button type="button" onClick={() => setCurrentView('home')} className="hover:text-ink underline">
            Back to the website
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={() => void logout()} className="inline-flex items-center gap-1 hover:text-ink underline">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
