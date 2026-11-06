import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useModalA11y } from '../hooks/useModalA11y';
import { api } from '../services/apiService';
import { X, Building2, ShieldCheck, User, Mail, Lock, Phone, MapPin, ArrowRight, MailCheck } from 'lucide-react';

interface AuthModalProps {
  initialMode?: 'login' | 'register';
  initialRole?: 'tenant' | 'landlord' | 'agent';
  onClose: () => void;
  /**
   * Told whenever the visitor switches between signing in and registering, so
   * the address bar can follow the screen (/login ↔ /register).
   */
  onModeChange?: (mode: 'login' | 'register' | 'forgot') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ initialMode = 'login', initialRole = 'tenant', onClose, onModeChange }) => {
  const { login, register } = useApp();
  const [mode, setModeState] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const setMode = (next: 'login' | 'register' | 'forgot') => {
    setModeState(next);
    onModeChange?.(next);
  };
  const [resetSent, setResetSent] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogProps = useModalA11y(dialogRef, onClose);
  const [selectedRole, setSelectedRole] = useState<'tenant' | 'landlord' | 'agent'>(initialRole);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // Optional city/town. Ordinary contact information, not identity verification.
  const [city, setCity] = useState('');
  // Agent only: agency/business name (optional) — basic registration detail.
  const [agencyName, setAgencyName] = useState('');
  // Task 03: the official name on the Ghana Card. It is recorded as a claim;
  // it never counts as a verification check.
  const [officialName, setOfficialName] = useState('');

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
            // For an agent the city is the operating base, sent as its own field
            // so it is never confused with a home address.
            city: selectedRole === 'agent' ? undefined : city.trim(),
            operatingCity: selectedRole === 'agent' ? city.trim() : undefined,
            agencyName: selectedRole === 'agent' ? agencyName.trim() : undefined,
            password,
            role: selectedRole,
            // The group the visitor picked (Tenant, or a property provider).
            // The server refuses a category that disagrees with the role.
            providerCategory: selectedRole,
            officialName: selectedRole === 'tenant' ? undefined : officialName.trim() || undefined,
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-start sm:items-center justify-center">
      <div 
        ref={dialogRef}
        {...dialogProps}
        aria-labelledby="auth-modal-title"
        className="relative w-full max-w-md bg-surface border border-line rounded-2xl sm:rounded-2xl p-4 sm:p-6 shadow-lg text-ink max-h-[85vh] overflow-y-auto flex flex-col my-auto focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-page hover:bg-page text-ink/70 hover:text-ink transition-colors z-10"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4 pt-1 pb-1">

          {/* Brand Header */}
          <div className="text-center space-y-1.5 pt-2">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-interactive p-0.5 mx-auto flex items-center justify-center text-ink shadow-lg shadow-ink/10 font-extrabold">
              <Building2 className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <h2 id="auth-modal-title" className="text-xl sm:text-2xl font-black text-ink tracking-tight">
              {mode === 'login' ? 'Welcome Back' : mode === 'register' ? 'Create Goodlucks Account' : 'Reset Your Password'}
            </h2>
            <p className="text-xs text-ink/70">
              Property discovery and viewing arrangements
            </p>
          </div>

          {/* Role Selector — Task 03: two groups only. A property provider must
              then say whether they are a Landlord or an Agent; that choice is
              final for the account and cannot be swapped by registering again. */}
          <div className={`space-y-2 ${mode === 'forgot' ? 'hidden' : ''}`}>
            <label className="block text-xs font-semibold text-ink/70">Account group:</label>
            <div className="grid grid-cols-2 gap-1.5 bg-surface p-1 rounded-2xl border border-line text-xs">
              <button
                type="button"
                onClick={() => setSelectedRole('tenant')}
                className={`py-2 rounded-xl font-bold transition-all ${
                  selectedRole === 'tenant' ? 'bg-interactive text-ink shadow-md' : 'text-ink/70 hover:text-ink'
                }`}
              >
                Tenant
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole(selectedRole === 'tenant' ? 'landlord' : selectedRole)}
                className={`py-2 rounded-xl font-bold transition-all ${
                  selectedRole !== 'tenant' ? 'bg-interactive text-ink shadow-md' : 'text-ink/70 hover:text-ink'
                }`}
              >
                Agent / Landlord
              </button>
            </div>

            {selectedRole !== 'tenant' && (
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-ink/70">
                  Property provider type <span className="text-ink">*</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-surface p-1 rounded-2xl border border-line text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('landlord')}
                    className={`py-1.5 rounded-xl font-bold transition-all ${
                      selectedRole === 'landlord' ? 'bg-line text-ink' : 'text-ink/70 hover:text-ink'
                    }`}
                  >
                    Landlord (I own property)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole('agent')}
                    className={`py-1.5 rounded-xl font-bold transition-all ${
                      selectedRole === 'agent' ? 'bg-line text-ink' : 'text-ink/70 hover:text-ink'
                    }`}
                  >
                    Agent (I act for landlords)
                  </button>
                </div>
                <p className="text-[10px] text-ink/70">
                  This choice is fixed for the account. Goodlucks keeps landlord and agent accounts separate, and moving
                  between them is a staff-reviewed change, not a second sign-up.
                </p>
                {(fieldErrors.providerCategory || fieldErrors.role) && (
                  <p className="text-[11px] text-ink">
                    {fieldErrors.providerCategory || fieldErrors.role}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Secure access notice */}
          <div className="bg-surface p-3 rounded-2xl border border-line text-xs text-ink/70 space-y-1.5">
            <div className="font-bold text-ink flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-ink" />
              {mode === 'forgot'
                ? 'Password reset link'
                : `${selectedRole === 'tenant' ? 'Tenant' : selectedRole === 'landlord' ? 'Landlord' : 'Agent'} ${
                    mode === 'login' ? 'sign-in' : 'registration'
                  }`}
            </div>
            <p className="text-[11px] text-ink/70 leading-tight">
              {mode === 'forgot'
                ? 'Enter your account email and we will send a single-use link. It expires in one hour.'
                : selectedRole === 'agent'
                  ? 'Agent accounts are reviewed before listing submissions open. Registering does not verify your identity, ' +
                    'your licence or your authority to act for a landlord.'
                  : 'We use your details to run your account and, for providers, for the checks shown on your dashboard. ' +
                    'Sign in to manage' +
                    (selectedRole === 'landlord'
                      ? ' your listings and viewing requests.'
                      : ' saved homes, viewings and rental requests.')}
            </p>
          </div>

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs">
              {error}
            </div>
          )}

          {resetSent && (
            <div className="p-3 rounded-xl bg-interactive/10 border border-interactive/30 text-xs text-ink space-y-1.5">
              <div className="font-bold text-ink flex items-center gap-1.5">
                <MailCheck className="w-4 h-4" /> Check your inbox
              </div>
              <p className="text-[11px] text-ink/70 leading-snug">{resetSent}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3 pt-1">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-3 text-ink/70" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Abena Mensah"
                      className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                    />
                  </div>
                  {fieldErrors.name && <p className="text-[11px] font-semibold text-accent-text mt-1">{fieldErrors.name}</p>}
                </div>

                {selectedRole !== 'tenant' && (
                  <div>
                    <label className="block text-xs font-semibold text-ink/70 mb-1">
                      Official name on your Ghana Card{' '}
                      <span className="text-ink/70 font-normal">(as printed)</span>
                    </label>
                    <div className="relative">
                      <ShieldCheck className="w-4 h-4 absolute left-3 top-3 text-ink/70" />
                      <input
                        type="text"
                        value={officialName}
                        onChange={(e) => setOfficialName(e.target.value)}
                        placeholder="e.g. Abena Mensah Boateng"
                        className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                      />
                    </div>
                    {fieldErrors.officialName && (
                      <p className="text-[11px] font-semibold text-accent-text mt-1">{fieldErrors.officialName}</p>
                    )}
                    <p className="text-[10px] text-ink/70 mt-1">
                      This is recorded but never treated as a verification. Only a reviewer who checks both sides of the
                      card can mark your identity verified.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-3 text-ink/70" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+233 24 000 0000"
                      className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                    />
                  </div>
                  {fieldErrors.phone && <p className="text-[11px] font-semibold text-accent-text mt-1">{fieldErrors.phone}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">
                    {selectedRole === 'agent' ? 'Operating City / Base' : 'City / Town'}{' '}
                    {selectedRole === 'agent' ? (
                      <span className="text-ink/70 font-normal">(where you work)</span>
                    ) : (
                      <span className="text-ink/70 font-normal">(optional)</span>
                    )}
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 absolute left-3 top-3 text-ink/70" />
                    <input
                      type="text"
                      required={selectedRole === 'agent'}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. East Legon, Accra"
                      className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                    />
                  </div>
                  {fieldErrors.operatingCity && (
                    <p className="text-[11px] font-semibold text-accent-text mt-1">{fieldErrors.operatingCity}</p>
                  )}
                  {fieldErrors.city && <p className="text-[11px] font-semibold text-accent-text mt-1">{fieldErrors.city}</p>}
                  {selectedRole === 'agent' && (
                    <p className="text-[10px] text-ink/70 mt-1">
                      Your base, not your home address, and not a claim of coverage.
                    </p>
                  )}
                </div>

                {selectedRole === 'agent' && (
                  <div>
                    <label className="block text-xs font-semibold text-ink/70 mb-1">
                      Agency / Business Name <span className="text-ink/70 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 absolute left-3 top-3 text-ink/70" />
                      <input
                        type="text"
                        value={agencyName}
                        onChange={(e) => setAgencyName(e.target.value)}
                        placeholder="e.g. Mensah Property Partners"
                        className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                      />
                    </div>
                    {fieldErrors.agencyName && (
                      <p className="text-[11px] font-semibold text-accent-text mt-1">{fieldErrors.agencyName}</p>
                    )}
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-ink/70 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-ink/70" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                />
              </div>
              {fieldErrors.email && <p className="text-[11px] font-semibold text-accent-text mt-1">{fieldErrors.email}</p>}
            </div>

            {mode !== 'forgot' && (
            <div>
              <label className="block text-xs font-semibold text-ink/70 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-ink/70" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                />
              </div>
              {fieldErrors.password && <p className="text-[11px] font-semibold text-accent-text mt-1">{fieldErrors.password}</p>}
              {mode === 'register' && !fieldErrors.password && (
                <p className="text-[10px] text-ink/70 mt-1">Use at least 8 characters.</p>
              )}
              {mode === 'login' && (
                <div className="text-right mt-1">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(null); setFieldErrors({}); setResetSent(null); }}
                    className="text-[11px] text-ink/70 hover:text-ink font-semibold cursor-pointer"
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
              className="gl-btn gl-btn-primary w-full"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
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
          <div className="flex flex-col items-center gap-2 text-center text-xs text-ink/70 pt-2 border-t border-line">
            {mode === 'forgot' ? (
              <span>
                Remembered it?{' '}
                <button onClick={() => { setMode('login'); setError(null); setResetSent(null); }} className="text-ink font-bold hover:underline cursor-pointer">
                  Back to Sign In
                </button>
              </span>
            ) : mode === 'login' ? (
              <span>
                Don't have an account?{' '}
                <button onClick={() => { setMode('register'); setError(null); }} className="text-ink font-bold hover:underline cursor-pointer">
                  Register Now
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); setError(null); }} className="text-ink font-bold hover:underline cursor-pointer">
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
