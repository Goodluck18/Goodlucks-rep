import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  ShieldAlert, 
  Lock, 
  Key, 
  Mail, 
  ArrowRight, 
  ShieldCheck, 
  AlertTriangle, 
  Terminal, 
  ArrowLeft,
  CheckCircle2,
  Building2
} from 'lucide-react';

export const AdminLoginView: React.FC = () => {
  const { adminLogin, setCurrentView } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [success, setSuccess] = useState(false);

  // Prevent search engines from indexing the admin login page
  useEffect(() => {
    document.title = "Admin Access Portal - Goodlucks";
    
    let metaRobots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    let created = false;
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.name = 'robots';
      document.head.appendChild(metaRobots);
      created = true;
    }
    const previousContent = metaRobots.getAttribute('content');
    metaRobots.setAttribute('content', 'noindex, nofollow, noarchive, nosnippet, noimageindex');

    return () => {
      document.title = "Goodlucks Homes - Rentals & Real Estate";
      if (created && metaRobots && metaRobots.parentNode) {
        metaRobots.parentNode.removeChild(metaRobots);
      } else if (metaRobots) {
        if (previousContent) {
          metaRobots.setAttribute('content', previousContent);
        } else {
          metaRobots.removeAttribute('content');
        }
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!email.trim() || !password) {
      setError('Please enter your administrator email address and password.');
      return;
    }

    setIsAuthenticating(true);
    const result = await adminLogin(email.trim(), password, securityCode.trim());
    setIsAuthenticating(false);

    if (result.ok) {
      setSuccess(true);
      return;
    }

    setError(result.error || 'Authentication failed. Please check your credentials and try again.');
    setPassword('');
  };

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden select-none">
      {/* Header Back Button */}
      <div className="absolute top-6 left-6 z-10">
        <button
          onClick={() => setCurrentView('home')}
          className="gl-btn gl-btn-secondary text-xs"
        >
          <ArrowLeft className="w-4 h-4 text-ink" />
          <span>Return to Public Site</span>
        </button>
      </div>

      {/* Main Login Card */}
      <div className="gl-card w-full max-w-md p-6 sm:p-8 relative z-10">
        
        {/* Top Restricted Access Badge */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-line">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest text-red-700 uppercase font-bold block">
                Restricted Endpoint
              </span>
              <h1 className="text-sm font-extrabold text-ink">Goodlucks Admin Console</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-page border border-line text-[10px] font-mono text-ink/70">
            <Terminal className="w-3 h-3 text-ink" />
            <span>/admin-login</span>
          </div>
        </div>

        {/* Security Alert Banner */}
        <div className="mb-6 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700/90 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="leading-snug text-[11px] text-ink">
            <strong>Authorized Personnel Only.</strong> All login attempts, IP addresses, and device signatures on this secret endpoint are audited.
          </p>
        </div>

        {/* Success Feedback Banner */}
        {success && (
          <div className="mb-6 p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 text-xs flex items-center gap-2.5 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
            <div>
              <p className="font-bold">Authentication Granted</p>
              <p className="text-[10px] opacity-90">Redirecting to Admin Dashboard...</p>
            </div>
          </div>
        )}

        {/* Error Feedback */}
        {error && (
          <div className="mb-6 p-3 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-700 text-xs">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-ink/70 mb-1.5">
              Admin Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-ink/70" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@goodlucks.co"
                autoComplete="username"
                className="w-full bg-page border border-line rounded-xl pl-10 pr-3 py-2.5 text-sm text-ink placeholder-ink/50 focus:outline-none focus:border-interactive focus:ring-1 focus:ring-interactive font-mono transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink/70 mb-1.5">
              Master Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-ink/70" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-page border border-line rounded-xl pl-10 pr-3 py-2.5 text-sm text-ink placeholder-ink/50 focus:outline-none focus:border-interactive focus:ring-1 focus:ring-interactive font-mono transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink/70 mb-1.5 flex items-center justify-between">
              <span>Security Token / Access Key</span>
              <span className="text-[10px] text-ink/70 font-normal">MFA Token</span>
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3.5 top-3.5 text-ink/70" />
              <input
                type="text"
                value={securityCode}
                onChange={(e) => setSecurityCode(e.target.value)}
                placeholder="ADM-XXXX-GL"
                className="w-full bg-page border border-line rounded-xl pl-10 pr-3 py-2.5 text-sm text-ink placeholder-ink/50 focus:outline-none focus:border-interactive focus:ring-1 focus:ring-interactive font-mono tracking-wider transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isAuthenticating}
            className="gl-btn gl-btn-primary w-full mt-2"
          >
            {isAuthenticating ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-line border-t-white rounded-full animate-spin" />
                <span>Authenticating Credentials...</span>
              </span>
            ) : (
              <>
                <span>Sign In to Admin Portal</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Security Notice */}
        <div className="mt-6 pt-5 border-t border-line/80">
          <div className="p-3.5 rounded-2xl bg-surface border border-line text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-xs text-ink/70 font-semibold">
              <ShieldCheck className="w-4 h-4 text-ink" />
              <span>Restricted Administrator Access</span>
            </div>
            <p className="text-[11px] text-ink/70 leading-snug">
              Administrator accounts are verified on the server and cannot be created from this page.
              If you need admin access, contact Goodlucks Homes IT at rentals@goodlucks.co.
            </p>
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-ink/70 font-mono pt-1">
              <Building2 className="w-3 h-3" />
              <span>Server-side session • rate limited • audited</span>
            </div>
          </div>
        </div>

      </div>

      {/* Footer Branding */}
      <div className="mt-8 text-center text-xs text-ink/70 font-mono relative z-10">
        Goodlucks Homes Security System v2.4 • Confidential Administrative Environment
      </div>
    </div>
  );
};
