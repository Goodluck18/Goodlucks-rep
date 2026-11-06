import React, { useRef, useState, useEffect } from 'react';
import { Property, PriceDropAlert } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogProps = useModalA11y(dialogRef, onClose, isOpen);

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
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        ref={dialogRef}
        {...dialogProps}
        id="price-drop-modal-container"
        aria-labelledby="price-drop-modal-title"
        className="relative w-full max-w-md bg-surface border border-line rounded-2xl sm:rounded-2xl p-5 sm:p-6 shadow-lg text-ink my-auto overflow-hidden focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle decorative glow */}

        {/* Close Button */}
        <button 
          id="price-drop-modal-close-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-page hover:bg-page text-ink/70 hover:text-ink transition-colors z-10 cursor-pointer"
          aria-label="Close price drop alert modal"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          /* Success Screen */
          <div className="py-4 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <span className="px-3 py-0.5 rounded-full text-[10px] font-extrabold bg-interactive/10 text-ink border border-interactive/20 uppercase tracking-wider">
                Alert Created
              </span>
              <h3 id="price-drop-modal-title" className="text-xl font-bold text-ink">
                You're All Set!
              </h3>
              <p className="text-xs text-ink/70 max-w-sm mx-auto leading-relaxed">
                We will monitor <strong className="text-ink">{property.title}</strong> and email <strong className="text-ink">{email}</strong> immediately if the price drops.
              </p>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-line text-left space-y-1.5 text-xs text-ink/70">
              <div className="flex justify-between items-center">
                <span className="text-ink/70">Current Monthly Rent:</span>
                <span className="font-bold text-ink">GH₵ {currentRent.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink/70">Alert Trigger:</span>
                <span className="font-bold text-emerald-700">
                  {dropPreference === 'any' ? 'Any price drop' : `Below GH₵ ${getComputedTargetRent()?.toLocaleString()}`}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink/70">Notification Channel:</span>
                <span className="font-medium text-ink">{email}</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                id="price-drop-done-btn"
                onClick={onClose}
                className="gl-btn gl-btn-primary w-full py-3 text-xs"
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
              <div className="w-11 h-11 rounded-2xl bg-interactive/10 border border-interactive/20 text-ink flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 id="price-drop-modal-title" className="text-lg font-black text-ink tracking-tight flex items-center gap-1.5">
                  Notify Me If Price Drops
                </h3>
                <p className="text-xs text-ink/70">
                  Receive an instant alert the moment this listing becomes cheaper.
                </p>
              </div>
            </div>

            {/* Property Snippet Card */}
            <div className="flex items-center gap-3 bg-surface p-3 rounded-xl border border-line">
              <img 
                src={property.images[0]} 
                alt={property.title} 
                loading="lazy"
                decoding="async"
                className="w-14 h-14 rounded-lg object-cover shrink-0 border border-line" 
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-ink truncate">{property.title}</div>
                <div className="text-[11px] text-ink/70 truncate">{property.location}</div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xs font-extrabold text-ink">
                    GH₵ {currentRent.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-ink/70">/ month</span>
                </div>
              </div>
            </div>

            {/* Alert Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* User Email Field */}
              <div className="space-y-1">
                <label htmlFor="price-alert-email" className="block text-xs font-semibold text-ink/70">
                  Your Email Address <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-ink/70" />
                  <input
                    id="price-alert-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. kwame@example.com"
                    className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive transition-colors"
                  />
                </div>
              </div>

              {/* User Name Field (Optional) */}
              <div className="space-y-1">
                <label htmlFor="price-alert-name" className="block text-xs font-semibold text-ink/70">
                  Your Name <span className="text-[11px] text-ink/70 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-ink/70" />
                  <input
                    id="price-alert-name"
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="e.g. Kwame Mensah"
                    className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive transition-colors"
                  />
                </div>
              </div>

              {/* Alert Threshold Selector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink/70">
                  When should we notify you?
                </label>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setDropPreference('any')}
                    className={`py-2 px-2.5 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                      dropPreference === 'any'
                        ? 'bg-interactive/10 border-interactive text-ink font-bold'
                        : 'bg-surface border-line text-ink/70 hover:border-line'
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
                        ? 'bg-interactive/10 border-interactive text-ink font-bold'
                        : 'bg-surface border-line text-ink/70 hover:border-line'
                    }`}
                  >
                    <span>5% or more</span>
                    <span className="text-[10px] text-ink/70 font-normal">≤ GH₵ {rent5PercentDrop.toLocaleString()}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDropPreference('10percent')}
                    className={`py-2 px-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-center ${
                      dropPreference === '10percent'
                        ? 'bg-interactive/10 border-interactive text-ink font-bold'
                        : 'bg-surface border-line text-ink/70 hover:border-line'
                    }`}
                  >
                    <span>10% or more</span>
                    <span className="text-[10px] text-ink/70 font-normal">≤ GH₵ {rent10PercentDrop.toLocaleString()}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDropPreference('custom')}
                    className={`py-2 px-2.5 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                      dropPreference === 'custom'
                        ? 'bg-interactive/10 border-interactive text-ink font-bold'
                        : 'bg-surface border-line text-ink/70 hover:border-line'
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
                      <span className="absolute left-3 top-2.5 text-xs text-ink/70 font-bold">GH₵</span>
                      <input
                        type="number"
                        min={100}
                        max={currentRent - 1}
                        value={customTargetRent}
                        onChange={(e) => setCustomTargetRent(e.target.value ? Number(e.target.value) : '')}
                        placeholder={`Target rent (less than ${currentRent})`}
                        className="w-full bg-page border border-interactive/50 rounded-xl pl-11 pr-3 py-2 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                      />
                    </div>
                    <div className="text-[10px] text-ink/70 mt-1">
                      Notify me if rent drops to this amount or lower.
                    </div>
                  </div>
                )}
              </div>

              {/* Intermediary Guarantee Note */}
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-surface border border-line text-[11px] text-ink/70">
                <ShieldCheck className="w-4 h-4 text-ink shrink-0" />
                <span>No spam. We only send notifications if this specific listing drops in price.</span>
              </div>

              {error && (
                <div role="alert" className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit CTA */}
              <button
                id="price-drop-submit-btn"
                type="submit"
                disabled={isSubmitting || !email.trim()}
                className="gl-btn gl-btn-primary w-full"
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
