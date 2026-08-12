import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { X, Building2, ShieldCheck, User, Mail, Lock, Phone, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  initialMode?: 'login' | 'register';
  initialRole?: 'tenant' | 'landlord';
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ initialMode = 'login', initialRole = 'tenant', onClose }) => {
  const { loginAsRole } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [selectedRole, setSelectedRole] = useState<'tenant' | 'landlord'>(initialRole);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginAsRole(selectedRole);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-start sm:items-center justify-center">
      <div 
        className="relative w-full max-w-md bg-[#252A34] border border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl text-white max-h-[85vh] overflow-y-auto flex flex-col my-auto"
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
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {mode === 'login' ? 'Welcome Back' : 'Create Goodlucks Account'}
            </h2>
            <p className="text-xs text-slate-400">
              Goodlucks Homes Intermediary Rental Platform
            </p>
          </div>

          {/* Role Selector Tabs */}
          <div className="space-y-1.5">
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

          {/* Quick Role Demo Login Bar */}
          <div className="bg-slate-800/80 p-3 rounded-2xl border border-white/10 text-xs text-slate-300 space-y-2">
            <div className="font-bold text-white flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-[#08D9D6]" />
              Quick Demo Auto-Login as <span className="text-[#08D9D6] uppercase font-bold">{selectedRole}</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Click below to instantly sign in with full {selectedRole} privileges and sample data.
            </p>
            <button
              type="button"
              onClick={() => { loginAsRole(selectedRole); onClose(); }}
              className="w-full py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs hover:bg-[#08D9D6]/90 transition-all shadow-md shadow-[#08D9D6]/20 cursor-pointer"
            >
              Sign In As {selectedRole.toUpperCase()} Demo
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-3 pt-1">
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
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-[#08D9D6] text-[#252A34] font-black hover:bg-[#08D9D6]/90 transition-all text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#08D9D6]/20"
            >
              <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Toggle Mode */}
          <div className="flex flex-col items-center gap-2 text-center text-xs text-slate-400 pt-2 border-t border-white/10">
            {mode === 'login' ? (
              <span>
                Don't have an account?{' '}
                <button onClick={() => setMode('register')} className="text-[#08D9D6] font-bold hover:underline cursor-pointer">
                  Register Now
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button onClick={() => setMode('login')} className="text-[#08D9D6] font-bold hover:underline cursor-pointer">
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
