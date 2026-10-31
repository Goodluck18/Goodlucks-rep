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

  const clearTokenFromUrl = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('reset');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
    } catch {
      /* ignore — cosmetic only */
    }
    onDone();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#252A34] text-[#EAEAEA] px-4 py-10">
      <div className="w-full max-w-md bg-[#252A34] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#08D9D6] mx-auto flex items-center justify-center text-[#252A34] shadow-lg shadow-[#08D9D6]/20">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Set a New Password</h1>
          <p className="text-xs text-slate-400">Goodlucks Homes Intermediary Rental Platform</p>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#08D9D6]/10 border border-[#08D9D6]/30 text-xs text-slate-200 space-y-2">
              <div className="font-bold text-[#08D9D6] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Password updated
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">{success}</p>
            </div>
            <button
              onClick={clearTokenFromUrl}
              className="w-full py-3 rounded-2xl bg-[#08D9D6] text-[#252A34] font-black hover:bg-[#08D9D6]/90 transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              Continue to Sign In <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="bg-slate-800/80 p-3 rounded-2xl border border-white/10 text-xs text-slate-300 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-[#08D9D6]" /> One-time secure link
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                This link can only be used once and expires an hour after it was requested. Setting a new
                password signs you out of every other device.
              </p>
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-xl bg-[#FF2E63]/15 border border-[#FF2E63]/30 text-[#FF8FA8] text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="reset-password">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="reset-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>
                {fieldErrors.password ? (
                  <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors.password}</p>
                ) : (
                  <p className="text-[10px] text-slate-500 mt-1">Use at least 8 characters.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor="reset-password-confirm">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="reset-password-confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors.confirmPassword}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-2xl bg-[#08D9D6] text-[#252A34] font-black hover:bg-[#08D9D6]/90 transition-all text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#08D9D6]/20 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-[#252A34]/30 border-t-[#252A34] rounded-full animate-spin" />
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

            <div className="text-center text-xs text-slate-400 pt-2 border-t border-white/10">
              <button onClick={clearTokenFromUrl} className="text-[#08D9D6] font-bold hover:underline cursor-pointer">
                Back to the website
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
