import React, { useState } from 'react';
import { Building2, Lock, ShieldCheck, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, fieldErrorsFor, messageForError } from '../services/apiService';

interface ResetPasswordViewProps {
  token: string;
  onDone: () => void;
}

/**
 * Standalone view for `/?reset=<token>` links sent by the forgot-password email.
 *
 * It deliberately sits outside the router/dashboard so the link works for signed
 * out users, and it can be closed without touching any other app state.
 */
export const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({ token, onDone }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Both passwords must match.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.confirmPasswordReset(token, password);
      setSuccess(response.message);
    } catch (err) {
      setError(messageForError(err));
      setFieldErrors(fieldErrorsFor(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * The router owns the address bar: `onDone()` moves the visitor off
   * /reset-password?token=… (replacing the entry), so the one-time token does
   * not stay in the URL or in the Back history.
   */
  const clearTokenFromUrl = () => {
    onDone();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-page text-ink px-4 py-10">
      <div className="w-full max-w-md bg-surface border border-line rounded-2xl p-6 sm:p-8 shadow-lg space-y-5">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-interactive mx-auto flex items-center justify-center text-ink shadow-lg shadow-ink/10">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight">Set a New Password</h1>
          <p className="text-xs text-ink/70">Goodlucks Homes Intermediary Rental Platform</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-interactive/10 border border-interactive/30 text-xs text-ink space-y-2">
              <div className="font-bold text-ink flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Password updated
              </div>
              <p className="text-[11px] text-ink/70 leading-snug">{success}</p>
            </div>
            <button
              onClick={clearTokenFromUrl}
              className="gl-btn gl-btn-primary w-full py-3 text-xs flex"
            >
              Continue to Sign In <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="bg-surface p-3 rounded-2xl border border-line text-xs text-ink/70 space-y-1.5">
              <div className="font-bold text-ink flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-ink" /> One-time secure link
              </div>
              <p className="text-[11px] text-ink/70 leading-tight">
                This link can only be used once and expires an hour after it was requested. Setting a new
                password signs you out of every other device.
              </p>
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1" htmlFor="reset-password">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-ink/70" />
                  <input
                    id="reset-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                  />
                </div>
                {fieldErrors.password ? (
                  <p className="text-[11px] font-semibold text-accent-text mt-1">{fieldErrors.password}</p>
                ) : (
                  <p className="text-[10px] text-ink/70 mt-1">Use at least 8 characters.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1" htmlFor="reset-password-confirm">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-ink/70" />
                  <input
                    id="reset-password-confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                  />
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="text-[11px] font-semibold text-accent-text mt-1">{fieldErrors.confirmPassword}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="gl-btn gl-btn-primary w-full py-3 text-xs flex"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                    <span>Updating…</span>
                  </>
                ) : (
                  <>
                    <span>Update Password</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="text-center text-xs text-ink/70 pt-2 border-t border-line">
              <button onClick={clearTokenFromUrl} className="text-ink font-bold hover:underline cursor-pointer">
                Back to the website
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
