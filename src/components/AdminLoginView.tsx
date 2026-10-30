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
      document.title = "Goodlucks Homes - Verified Rentals & Real Estate";
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
    <div className="min-h-screen bg-[#12161f] text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden select-none">
      {/* Background Decorative Security Elements */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-[#08D9D6]/10 via-[#FF2E63]/5 to-transparent blur-3xl pointer-events-none" />
      
      {/* Header Back Button */}
      <div className="absolute top-6 left-6 z-10">
        <button
          onClick={() => setCurrentView('home')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-500 transition-all text-xs font-semibold backdrop-blur-md shadow-lg"
        >
          <ArrowLeft className="w-4 h-4 text-[#08D9D6]" />
          <span>Return to Public Site</span>
        </button>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 backdrop-blur-xl relative z-10">
        
        {/* Top Restricted Access Badge */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-widest text-red-400 uppercase font-bold block">
                Restricted Endpoint
              </span>
              <h1 className="text-sm font-extrabold text-white">Goodlucks Admin Console</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-400">
            <Terminal className="w-3 h-3 text-[#08D9D6]" />
            <span>/admin-login</span>
          </div>
        </div>

        {/* Security Alert Banner */}
        <div className="mb-6 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300/90 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-snug text-[11px]">
            <strong>Authorized Personnel Only.</strong> All login attempts, IP addresses, and device signatures on this secret endpoint are audited.
          </p>
        </div>

        {/* Success Feedback Banner */}
        {success && (
          <div className="mb-6 p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="font-bold">Authentication Granted</p>
              <p className="text-[10px] opacity-90">Redirecting to Admin Dashboard...</p>
            </div>
          </div>
        )}

        {/* Error Feedback */}
        {error && (
          <div className="mb-6 p-3 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Admin Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@goodlucks.co"
                autoComplete="username"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#08D9D6] focus:ring-1 focus:ring-[#08D9D6] font-mono transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Master Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#08D9D6] focus:ring-1 focus:ring-[#08D9D6] font-mono transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Security Token / Access Key</span>
              <span className="text-[10px] text-slate-500 font-normal">MFA Token</span>
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-500" />
              <input
                type="text"
                value={securityCode}
                onChange={(e) => setSecurityCode(e.target.value)}
                placeholder="ADM-XXXX-GL"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#08D9D6] focus:ring-1 focus:ring-[#08D9D6] font-mono tracking-wider transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isAuthenticating}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FF2E63] to-[#ff527b] text-white font-extrabold text-sm hover:opacity-95 transition-all shadow-lg shadow-[#FF2E63]/25 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {isAuthenticating ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-300 font-semibold">
              <ShieldCheck className="w-4 h-4 text-[#08D9D6]" />
              <span>Restricted Administrator Access</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Administrator accounts are verified on the server and cannot be created from this page.
              If you need admin access, contact Goodlucks Homes IT at rentals@goodlucks.co.
            </p>
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono pt-1">
              <Building2 className="w-3 h-3" />
              <span>Server-side session • rate limited • audited</span>
            </div>
          </div>
        </div>

      </div>

      {/* Footer Branding */}
      <div className="mt-8 text-center text-xs text-slate-500 font-mono relative z-10">
        Goodlucks Homes Security System v2.4 • Confidential Administrative Environment
      </div>
    </div>
  );
};
