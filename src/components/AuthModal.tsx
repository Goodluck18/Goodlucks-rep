import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useModalA11y } from '../hooks/useModalA11y';
import { api } from '../services/apiService';
import { X, Building2, ShieldCheck, User, Mail, Lock, Phone, ArrowRight, MailCheck } from 'lucide-react';

interface AuthModalProps {
  initialMode?: 'login' | 'register';
  initialRole?: 'tenant' | 'landlord';
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ initialMode = 'login', initialRole = 'tenant', onClose }) => {
  const { login, register } = useApp();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [resetSent, setResetSent] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogProps = useModalA11y(dialogRef, onClose);
  const [selectedRole, setSelectedRole] = useState<'tenant' | 'landlord'>(initialRole);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    if (mode === 'forgot') {
      const response = await api.requestPasswordReset(email.trim()).catch((err: unknown) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : 'Could not send the reset link.',
      }));
      setIsSubmitting(false);
      if ('ok' in response) {
        setError(response.error || 'Could not send the reset link.');
        return;
      }
      setResetSent(response.message);
      return;
    }

    const result =
      mode === 'login'
        ? await login(email.trim(), password, selectedRole)
        : await register({
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            password,
            role: selectedRole,
          });

    setIsSubmitting(false);

    if (result.ok) {
      onClose();
      return;
    }
    setError(result.error || 'Sign in failed. Please try again.');
    setFieldErrors(result.fields || {});
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-start sm:items-center justify-center">
      <div 
        ref={dialogRef}
        {...dialogProps}
        aria-labelledby="auth-modal-title"
        className="relative w-full max-w-md bg-[#252A34] border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl text-white max-h-[85vh] overflow-y-auto flex flex-col my-auto focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors z-10"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4 pt-1 pb-1">

          {/* Brand Header */}
          <div className="text-center space-y-1.5 pt-2">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#08D9D6] p-0.5 mx-auto flex items-center justify-center text-[#252A34] shadow-lg shadow-[#08D9D6]/20 font-extrabold">
              <Building2 className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <h2 id="auth-modal-title" className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {mode === 'login' ? 'Welcome Back' : mode === 'register' ? 'Create Goodlucks Account' : 'Reset Your Password'}
            </h2>
            <p className="text-xs text-slate-400">
              Goodlucks Homes Intermediary Rental Platform
            </p>
          </div>

          {/* Role Selector Tabs */}
          <div className={`space-y-1.5 ${mode === 'forgot' ? 'hidden' : ''}`}>
            <label className="block text-xs font-semibold text-slate-300">Select Account Role:</label>
            <div className="grid grid-cols-2 gap-1.5 bg-slate-900/80 p-1 rounded-2xl border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setSelectedRole('tenant')}
                className={`py-2 rounded-xl font-bold transition-all ${
                  selectedRole === 'tenant' ? 'bg-[#08D9D6] text-[#252A34] shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tenant
              </button>

              <button
                type="button"
                onClick={() => setSelectedRole('landlord')}
                className={`py-2 rounded-xl font-bold transition-all ${
                  selectedRole === 'landlord' ? 'bg-[#08D9D6] text-[#252A34] shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Landlord
              </button>
            </div>
          </div>

          {/* Secure access notice */}
          <div className="bg-slate-800/80 p-3 rounded-2xl border border-white/10 text-xs text-slate-300 space-y-1.5">
            <div className="font-bold text-white flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-[#08D9D6]" />
              {mode === 'forgot'
                ? 'Secure password reset'
                : `Secure ${selectedRole} ${mode === 'login' ? 'sign-in' : 'registration'}`}
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              {mode === 'forgot'
                ? 'Enter your account email and we will send a single-use link. It expires in one hour.'
                : 'Your account is protected by Goodlucks Homes. Sign in to manage' +
                  (selectedRole === 'landlord'
                    ? ' your listings and viewing requests.'
                    : ' saved homes, viewings and rental requests.')}
            </p>
          </div>

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-[#FF2E63]/15 border border-[#FF2E63]/30 text-[#FF8FA8] text-xs">
              {error}
            </div>
          )}

          {resetSent && (
            <div className="p-3 rounded-xl bg-[#08D9D6]/10 border border-[#08D9D6]/30 text-xs text-slate-200 space-y-1.5">
              <div className="font-bold text-[#08D9D6] flex items-center gap-1.5">
                <MailCheck className="w-4 h-4" /> Check your inbox
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">{resetSent}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3 pt-1">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Abena Mensah"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                    />
                  </div>
                  {fieldErrors.name && <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+233 24 000 0000"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                    />
                  </div>
                  {fieldErrors.phone && <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors.phone}</p>}
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                />
              </div>
              {fieldErrors.email && <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors.email}</p>}
            </div>

            {mode !== 'forgot' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                />
              </div>
              {fieldErrors.password && <p className="text-[11px] text-[#FF8FA8] mt-1">{fieldErrors.password}</p>}
              {mode === 'register' && !fieldErrors.password && (
                <p className="text-[10px] text-slate-500 mt-1">Use at least 8 characters.</p>
              )}
              {mode === 'login' && (
                <div className="text-right mt-1">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(null); setFieldErrors({}); setResetSent(null); }}
                    className="text-[11px] text-slate-400 hover:text-[#08D9D6] font-semibold cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-2xl bg-[#08D9D6] text-[#252A34] font-black hover:bg-[#08D9D6]/90 transition-all text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#08D9D6]/20 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[#252A34]/30 border-t-[#252A34] rounded-full animate-spin" />
                  <span>{mode === 'login' ? 'Signing In...' : mode === 'register' ? 'Creating Account...' : 'Sending Link...'}</span>
                </>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle Mode */}
          <div className="flex flex-col items-center gap-2 text-center text-xs text-slate-400 pt-2 border-t border-white/10">
            {mode === 'forgot' ? (
              <span>
                Remembered it?{' '}
                <button onClick={() => { setMode('login'); setError(null); setResetSent(null); }} className="text-[#08D9D6] font-bold hover:underline cursor-pointer">
                  Back to Sign In
                </button>
              </span>
            ) : mode === 'login' ? (
              <span>
                Don't have an account?{' '}
                <button onClick={() => { setMode('register'); setError(null); }} className="text-[#08D9D6] font-bold hover:underline cursor-pointer">
                  Register Now
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); setError(null); }} className="text-[#08D9D6] font-bold hover:underline cursor-pointer">
                  Sign In
                </button>
              </span>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
