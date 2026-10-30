import React, { useState, useEffect } from 'react';
import { Property, PriceDropAlert } from '../types';
import { useApp } from '../context/AppContext';
import { 
  Bell, 
  TrendingDown, 
  Mail, 
  X, 
  CheckCircle2, 
  ShieldCheck, 
  Sparkles,
  User,
  ArrowRight
} from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import { api, messageForError } from '../services/apiService';

interface PriceDropModalProps {
  property: Property | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PriceDropModal: React.FC<PriceDropModalProps> = ({
  property,
  isOpen,
  onClose,
}) => {
  const { currentUser, showSuccessToast } = useApp();

  const [email, setEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [dropPreference, setDropPreference] = useState<'any' | '5percent' | '10percent' | 'custom'>('any');
  const [customTargetRent, setCustomTargetRent] = useState<number | ''>('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize with user profile if logged in
  useEffect(() => {
    if (isOpen) {
      if (currentUser?.email) {
        setEmail(currentUser.email);
      }
      if (currentUser?.name) {
        setUserName(currentUser.name);
      }
      setSubmitted(false);
      setIsSubmitting(false);
      setError(null);
      if (property) {
        setCustomTargetRent(Math.round(property.rentGhs * 0.9));
      }
    }
  }, [isOpen, currentUser, property]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !property) return null;

  const currentRent = property.rentGhs;
  const rent5PercentDrop = Math.round(currentRent * 0.95);
  const rent10PercentDrop = Math.round(currentRent * 0.9);

  const getComputedTargetRent = (): number | undefined => {
    if (dropPreference === '5percent') return rent5PercentDrop;
    if (dropPreference === '10percent') return rent10PercentDrop;
    if (dropPreference === 'custom' && typeof customTargetRent === 'number' && customTargetRent > 0) {
      return customTargetRent;
    }
    return undefined; // Any price reduction
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) return;

    setIsSubmitting(true);

    const targetRent = getComputedTargetRent();

    // The alert is stored in the database by the API, which also sends the
    // confirmation email. Nothing is written to browser storage.
    try {
      await api.createPriceAlert({
        email: email.trim(),
        propertyId: property.id,
        name: userName.trim() || undefined,
        targetRentGhs: targetRent,
        notifyOnAnyDrop: dropPreference === 'any',
      });
      setSubmitted(true);
      showSuccessToast(
        'Price Alert Active',
        `We'll email ${email.trim()} if the rent drops for ${property.title}!`
      );
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="price-drop-modal-title"
    >
      <div 
        id="price-drop-modal-container"
        className="relative w-full max-w-md bg-[#252A34] border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl text-white my-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-[#08D9D6]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button 
          id="price-drop-modal-close-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors z-10 cursor-pointer"
          aria-label="Close price drop alert modal"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          /* Success Screen */
          <div className="py-4 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <span className="px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-[#08D9D6]/10 text-[#08D9D6] border border-[#08D9D6]/20 uppercase tracking-wider">
                Alert Created
              </span>
              <h3 id="price-drop-modal-title" className="text-xl font-bold text-white">
                You're All Set!
              </h3>
              <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                We will monitor <strong className="text-white">{property.title}</strong> and email <strong className="text-[#08D9D6]">{email}</strong> immediately if the price drops.
              </p>
            </div>

            <div className="bg-slate-900/80 p-3.5 rounded-xl border border-white/10 text-left space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Current Monthly Rent:</span>
                <span className="font-bold text-white">GH₵ {currentRent.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Alert Trigger:</span>
                <span className="font-bold text-emerald-400">
                  {dropPreference === 'any' ? 'Any price drop' : `Below GH₵ ${getComputedTargetRent()?.toLocaleString()}`}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Notification Channel:</span>
                <span className="font-medium text-white">{email}</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                id="price-drop-done-btn"
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs hover:bg-[#08D9D6]/90 transition-all shadow-md shadow-[#08D9D6]/20 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Subscription Form */
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#08D9D6]/10 border border-[#08D9D6]/20 text-[#08D9D6] flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 id="price-drop-modal-title" className="text-lg font-black text-white tracking-tight flex items-center gap-1.5">
                  Notify Me If Price Drops
                </h3>
                <p className="text-xs text-slate-400">
                  Receive an instant alert the moment this listing becomes cheaper.
                </p>
              </div>
            </div>

            {/* Property Snippet Card */}
            <div className="flex items-center gap-3 bg-slate-900/80 p-3 rounded-xl border border-white/10">
              <img 
                src={property.images[0]} 
                alt={property.title} 
                className="w-14 h-14 rounded-lg object-cover shrink-0 border border-white/5" 
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate">{property.title}</div>
                <div className="text-[11px] text-slate-400 truncate">{property.location}</div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xs font-extrabold text-[#08D9D6]">
                    GH₵ {currentRent.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-400">/ month</span>
                </div>
              </div>
            </div>

            {/* Alert Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* User Email Field */}
              <div className="space-y-1">
                <label htmlFor="price-alert-email" className="block text-xs font-semibold text-slate-300">
                  Your Email Address <span className="text-[#FF2E63]">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="price-alert-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. kwame@example.com"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6] transition-colors"
                  />
                </div>
              </div>

              {/* User Name Field (Optional) */}
              <div className="space-y-1">
                <label htmlFor="price-alert-name" className="block text-xs font-semibold text-slate-300">
                  Your Name <span className="text-[11px] text-slate-500 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="price-alert-name"
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="e.g. Kwame Mensah"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6] transition-colors"
                  />
                </div>
              </div>

              {/* Alert Threshold Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  When should we notify you?
                </label>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setDropPreference('any')}
                    className={`py-2 px-2.5 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                      dropPreference === 'any'
                        ? 'bg-[#08D9D6]/10 border-[#08D9D6] text-[#08D9D6] font-bold'
                        : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <span>Any price drop</span>
                    <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDropPreference('5percent')}
                    className={`py-2 px-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-center ${
                      dropPreference === '5percent'
                        ? 'bg-[#08D9D6]/10 border-[#08D9D6] text-[#08D9D6] font-bold'
                        : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <span>5% or more</span>
                    <span className="text-[10px] text-slate-400 font-normal">≤ GH₵ {rent5PercentDrop.toLocaleString()}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDropPreference('10percent')}
                    className={`py-2 px-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-center ${
                      dropPreference === '10percent'
                        ? 'bg-[#08D9D6]/10 border-[#08D9D6] text-[#08D9D6] font-bold'
                        : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <span>10% or more</span>
                    <span className="text-[10px] text-slate-400 font-normal">≤ GH₵ {rent10PercentDrop.toLocaleString()}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDropPreference('custom')}
                    className={`py-2 px-2.5 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                      dropPreference === 'custom'
                        ? 'bg-[#08D9D6]/10 border-[#08D9D6] text-[#08D9D6] font-bold'
                        : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <span>Custom Target</span>
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>

                {/* Custom Target Input */}
                {dropPreference === 'custom' && (
                  <div className="pt-1">
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">GH₵</span>
                      <input
                        type="number"
                        min={100}
                        max={currentRent - 1}
                        value={customTargetRent}
                        onChange={(e) => setCustomTargetRent(e.target.value ? Number(e.target.value) : '')}
                        placeholder={`Target rent (less than ${currentRent})`}
                        className="w-full bg-slate-900 border border-[#08D9D6]/50 rounded-xl pl-11 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Notify me if rent drops to this amount or lower.
                    </div>
                  </div>
                )}
              </div>

              {/* Intermediary Guarantee Note */}
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/50 border border-white/5 text-[11px] text-slate-400">
                <ShieldCheck className="w-4 h-4 text-[#08D9D6] shrink-0" />
                <span>No spam. We only send notifications if this specific listing drops in price.</span>
              </div>

              {error && (
                <div role="alert" className="p-3 rounded-xl bg-[#FF2E63]/15 border border-[#FF2E63]/30 text-[#FF8FA8] text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit CTA */}
              <button
                id="price-drop-submit-btn"
                type="submit"
                disabled={isSubmitting || !email.trim()}
                className="w-full py-3 rounded-xl bg-[#08D9D6] text-[#252A34] font-black text-xs hover:bg-[#08D9D6]/90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#08D9D6]/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span>Setting Alert...</span>
                ) : (
                  <>
                    <span>Set Price Drop Alert</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
