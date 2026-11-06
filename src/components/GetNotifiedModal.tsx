import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useModalA11y } from '../hooks/useModalA11y';
import { messageForError } from '../services/apiService';
import { 
  Bell, 
  X, 
  Mail, 
  MapPin, 
  Building2, 
  SlidersHorizontal, 
  Check, 
  Sparkles, 
  Send,
  MessageSquare,
  Bed,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';

interface GetNotifiedModalProps {
  onClose: () => void;
  initialFilters?: {
    location?: string;
    propertyType?: string;
    bedrooms?: number | 'All';
    maxRent?: number;
    searchQuery?: string;
  };
}

export const GetNotifiedModal: React.FC<GetNotifiedModalProps> = ({
  onClose,
  initialFilters
}) => {
  const { currentUser, subscribeToSearchAlerts } = useApp();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogProps = useModalA11y(dialogRef, onClose);

  const initLocation = initialFilters?.location || 'All';
  const initType = initialFilters?.propertyType || 'All';
  const initBedrooms = initialFilters?.bedrooms ?? 'All';
  const initMaxRent = initialFilters?.maxRent || 25000;
  const initQuery = initialFilters?.searchQuery || '';

  // Form State
  const [location, setLocation] = useState<string>(initLocation);
  const [propertyType, setPropertyType] = useState<string>(initType);
  const [bedrooms, setBedrooms] = useState<number | 'All'>(initBedrooms);
  const [maxRent, setMaxRent] = useState<number>(initMaxRent);
  const [searchQuery, setSearchQuery] = useState<string>(initQuery);

  const [email, setEmail] = useState<string>(currentUser?.email || '');
  const [name, setName] = useState<string>(currentUser?.name || '');
  const [phone, setPhone] = useState<string>(currentUser?.phone || '');
  const [frequency, setFrequency] = useState<'instant' | 'daily' | 'weekly'>('instant');
  const [channels, setChannels] = useState<('email' | 'whatsapp')[]>(['email']);

  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const toggleChannel = (channel: 'email' | 'whatsapp') => {
    if (channels.includes(channel)) {
      if (channels.length === 1) return; // Keep at least 1 channel
      setChannels(channels.filter(c => c !== channel));
    } else {
      setChannels([...channels, channel]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await subscribeToSearchAlerts({
        email: email.trim(),
        name: name || email.split('@')[0],
        phone,
        location,
        propertyType,
        bedrooms,
        maxRentGhs: maxRent,
        searchQuery,
        frequency,
        channels,
      });
      setIsSubmitted(true);
    } catch (err) {
      setErrorMsg(messageForError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedLocationStr = location === 'All' ? 'All Suburbs in Greater Accra' : location;
  const formattedTypeStr = propertyType === 'All' ? 'All Property Types' : propertyType;
  const formattedBedStr = bedrooms === 'All' ? 'Any Bedrooms' : `${bedrooms} Bed`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-surface backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-start sm:items-center justify-center">
      <div 
        ref={dialogRef}
        {...dialogProps}
        aria-labelledby="get-notified-title"
        className="bg-page border border-line rounded-2xl sm:rounded-2xl max-w-lg w-full max-h-[88dvh] flex flex-col p-4 sm:p-6 shadow-lg relative text-ink text-left my-auto overflow-hidden focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pr-8 shrink-0 pb-3 border-b border-line relative">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-interactive/15 border border-interactive/30 text-ink shrink-0">
              <Bell className="w-5 h-5 sm:w-6 sm:h-6 animate-bounce" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-interactive/10 text-ink text-[11px] font-bold border border-interactive/20 mb-1">
                <Sparkles className="w-3 h-3" />
                Automated Listing Alerts
              </div>
              <h2 id="get-notified-title" className="text-lg sm:text-xl font-black text-ink tracking-tight">
                Get Notified for New Listings
              </h2>
              <p className="text-xs text-ink/70 mt-0.5">
                Subscribe to email alerts whenever a matching home is listed.
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-0 right-0 w-8 h-8 rounded-full bg-page hover:bg-line flex items-center justify-center text-ink/70 hover:text-ink transition-colors shrink-0"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto flex-1 pr-1 space-y-4 pt-3 pb-1">
          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Criteria Box */}
            <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-ink/70 border-b border-line pb-2">
                <span className="flex items-center gap-1.5 text-ink">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Subscribed Search Criteria
                </span>
                <span className="text-[10px] text-ink/70">Pre-filled from search</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                {/* Location Select */}
                <div>
                  <label className="block text-[10px] text-ink/70 font-bold mb-1">SUBURB / LOCATION</label>
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full bg-page border border-line rounded-xl p-2 text-xs font-semibold text-ink focus:outline-none focus:border-interactive cursor-pointer"
                  >
                    <option value="All">All Ghana Locations</option>
                    <option value="Cantonments">Cantonments</option>
                    <option value="East Legon">East Legon</option>
                    <option value="Airport">Airport Residential</option>
                    <option value="Osu">Osu</option>
                    <option value="Labone">Labone</option>
                    <option value="Spintex">Spintex</option>
                    <option value="Ahodwo">Ahodwo (Kumasi)</option>
                  </select>
                </div>

                {/* Property Type Select */}
                <div>
                  <label className="block text-[10px] text-ink/70 font-bold mb-1">PROPERTY TYPE</label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    className="w-full bg-page border border-line rounded-xl p-2 text-xs font-semibold text-ink focus:outline-none focus:border-interactive cursor-pointer"
                  >
                    <option value="All">All Property Types</option>
                    <option value="Apartment">Apartment</option>
                    <option value="Luxury Villa">Luxury Villa</option>
                    <option value="Townhouse">Townhouse</option>
                    <option value="Studio">Studio</option>
                    <option value="Duplex">Duplex</option>
                    <option value="Penthouse">Penthouse</option>
                    <option value="Commercial">Commercial</option>
                  </select>
                </div>

                {/* Bedrooms */}
                <div>
                  <label className="block text-[10px] text-ink/70 font-bold mb-1">BEDROOMS</label>
                  <select
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value === 'All' ? 'All' : Number(e.target.value))}
                    className="w-full bg-page border border-line rounded-xl p-2 text-xs font-semibold text-ink focus:outline-none focus:border-interactive cursor-pointer"
                  >
                    <option value="All">Any Bedrooms</option>
                    <option value="1">1 Bedroom</option>
                    <option value="2">2 Bedrooms</option>
                    <option value="3">3 Bedrooms</option>
                    <option value="4">4+ Bedrooms</option>
                  </select>
                </div>

                {/* Max Rent */}
                <div>
                  <label className="block text-[10px] text-ink/70 font-bold mb-1">MAX RENT BUDGET</label>
                  <select
                    value={maxRent}
                    onChange={(e) => setMaxRent(Number(e.target.value))}
                    className="w-full bg-page border border-line rounded-xl p-2 text-xs font-semibold text-ink focus:outline-none focus:border-interactive cursor-pointer"
                  >
                    <option value={3000}>Up to GH₵ 3,000/mo</option>
                    <option value={5000}>Up to GH₵ 5,000/mo</option>
                    <option value={10000}>Up to GH₵ 10,000/mo</option>
                    <option value={15000}>Up to GH₵ 15,000/mo</option>
                    <option value={25000}>Up to GH₵ 25,000+/mo</option>
                  </select>
                </div>
              </div>

              {/* Keywords optional */}
              <div>
                <label className="block text-[10px] text-ink/70 font-bold mb-1">OPTIONAL KEYWORDS</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Swimming pool, furnished, balcony..."
                  className="w-full bg-page border border-line rounded-xl p-2 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                />
              </div>
            </div>

            {/* Subscriber Contact Details */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-ink">Your Contact Information</label>
              
              <div className="space-y-2">
                {/* Email Address */}
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-ink" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address *"
                    className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2.5 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Full Name */}
                  <div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your Full Name (Optional)"
                      className="w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                    />
                  </div>

                  {/* Phone / WhatsApp */}
                  <div>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="WhatsApp No. (e.g. +233...)"
                      className="w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Alert Channels & Frequency */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              
              {/* Delivery Channels */}
              <div className="bg-surface border border-line p-3 rounded-2xl space-y-2">
                <label className="block text-[11px] font-bold text-ink/70">ALERT CHANNELS</label>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => toggleChannel('email')}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      channels.includes('email')
                        ? 'bg-interactive/15 border-interactive/40 text-ink'
                        : 'bg-surface text-ink/70 border-line'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-ink" /> Email Alerts
                    </span>
                    {channels.includes('email') && <Check className="w-3.5 h-3.5 text-ink" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleChannel('whatsapp')}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      channels.includes('whatsapp')
                        ? 'bg-interactive/15 border-interactive/40 text-ink'
                        : 'bg-surface text-ink/70 border-line'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-700" /> WhatsApp Alerts
                    </span>
                    {channels.includes('whatsapp') && <Check className="w-3.5 h-3.5 text-ink" />}
                  </button>
                </div>
              </div>

              {/* Frequency */}
              <div className="bg-surface border border-line p-3 rounded-2xl space-y-2">
                <label className="block text-[11px] font-bold text-ink/70">FREQUENCY</label>
                <div className="space-y-1.5">
                  {[
                    { id: 'instant', label: 'Instant (Real-time)' },
                    { id: 'daily', label: 'Daily Digest' },
                    { id: 'weekly', label: 'Weekly Summary' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFrequency(item.id as any)}
                      className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center justify-between ${
                        frequency === item.id
                          ? 'bg-interactive/15 border-interactive/40 text-ink'
                          : 'bg-surface text-ink/70 border-line'
                      }`}
                    >
                      <span>{item.label}</span>
                      {frequency === item.id && <span className="w-2 h-2 rounded-full bg-interactive" />}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* Error Message if any */}
            {errorMsg && (
              <p className="text-xs font-bold text-accent bg-accent/10 border border-accent/20 p-2.5 rounded-xl">
                {errorMsg}
              </p>
            )}

            {/* Live Summary Callout */}
            <div className="p-3 rounded-xl bg-interactive/10 border border-interactive/20 text-xs text-ink flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-ink shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-ink">Summary: </span>
                You will receive <strong className="text-ink">{frequency}</strong> alerts for <strong className="text-ink">{formattedTypeStr}</strong> in <strong className="text-ink">{formattedLocationStr}</strong> under <strong className="text-ink">GH₵ {maxRent.toLocaleString()}/mo</strong>.
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="gl-btn gl-btn-primary w-full"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
                  <span>Activating Subscription...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Activate Email Listing Alerts</span>
                </>
              )}
            </button>

          </form>
        ) : (
          /* Confirmation Success Screen */
          <div className="py-6 text-center space-y-4 animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-ink">Subscription Active!</h3>
              <p className="text-xs text-ink/70 max-w-sm mx-auto">
                We have registered your search alert. A confirmation email has been logged to <strong className="text-ink">{email}</strong>.
              </p>
            </div>

            <div className="p-4 bg-surface rounded-2xl border border-line text-xs space-y-2 text-left max-w-sm mx-auto">
              <div className="flex justify-between text-ink/70">
                <span className="text-ink/70">Target Location:</span>
                <span className="font-bold text-ink">{formattedLocationStr}</span>
              </div>
              <div className="flex justify-between text-ink/70">
                <span className="text-ink/70">Property Category:</span>
                <span className="font-bold text-ink">{formattedTypeStr}</span>
              </div>
              <div className="flex justify-between text-ink/70">
                <span className="text-ink/70">Max Budget:</span>
                <span className="font-bold text-ink">GH₵ {maxRent.toLocaleString()}/mo</span>
              </div>
              <div className="flex justify-between text-ink/70">
                <span className="text-ink/70">Alert Cadence:</span>
                <span className="font-bold text-ink capitalize">{frequency}</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-interactive text-ink text-xs font-extrabold shadow-lg hover:bg-interactive/90 transition-colors"
            >
              Return to Search Results
            </button>
          </div>
        )}
        </div>

      </div>
    </div>
  );
};
