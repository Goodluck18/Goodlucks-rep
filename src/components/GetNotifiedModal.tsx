import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      subscribeToSearchAlerts({
        email,
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

      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 600);
  };

  const formattedLocationStr = location === 'All' ? 'All Suburbs in Greater Accra' : location;
  const formattedTypeStr = propertyType === 'All' ? 'All Property Types' : propertyType;
  const formattedBedStr = bedrooms === 'All' ? 'Any Bedrooms' : `${bedrooms} Bed`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-start sm:items-center justify-center">
      <div 
        className="bg-[#1F242D] border border-white/10 rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[88dvh] flex flex-col p-4 sm:p-6 shadow-2xl relative text-white text-left my-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pr-8 shrink-0 pb-3 border-b border-white/10 relative">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-[#08D9D6]/15 border border-[#08D9D6]/30 text-[#08D9D6] shrink-0">
              <Bell className="w-5 h-5 sm:w-6 sm:h-6 animate-bounce" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] text-[11px] font-bold border border-[#08D9D6]/20 mb-1">
                <Sparkles className="w-3 h-3" />
                Automated Listing Alerts
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                Get Notified for New Listings
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Subscribe to email or WhatsApp alerts whenever a matching home is verified.
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-0 right-0 w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-slate-300 hover:text-white transition-colors shrink-0"
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
            <div className="bg-[#252A34] border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-white/10 pb-2">
                <span className="flex items-center gap-1.5 text-[#08D9D6]">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Subscribed Search Criteria
                </span>
                <span className="text-[10px] text-slate-400">Pre-filled from search</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                {/* Location Select */}
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold mb-1">SUBURB / LOCATION</label>
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-xs font-semibold text-white focus:outline-none focus:border-[#08D9D6] cursor-pointer"
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
                  <label className="block text-[10px] text-slate-400 font-bold mb-1">PROPERTY TYPE</label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-xs font-semibold text-white focus:outline-none focus:border-[#08D9D6] cursor-pointer"
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
                  <label className="block text-[10px] text-slate-400 font-bold mb-1">BEDROOMS</label>
                  <select
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value === 'All' ? 'All' : Number(e.target.value))}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-xs font-semibold text-white focus:outline-none focus:border-[#08D9D6] cursor-pointer"
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
                  <label className="block text-[10px] text-slate-400 font-bold mb-1">MAX RENT BUDGET</label>
                  <select
                    value={maxRent}
                    onChange={(e) => setMaxRent(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-xs font-semibold text-[#08D9D6] focus:outline-none focus:border-[#08D9D6] cursor-pointer"
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
                <label className="block text-[10px] text-slate-400 font-bold mb-1">OPTIONAL KEYWORDS</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Swimming pool, furnished, balcony..."
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                />
              </div>
            </div>

            {/* Subscriber Contact Details */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-white">Your Contact Information</label>
              
              <div className="space-y-2">
                {/* Email Address */}
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-[#08D9D6]" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address *"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#08D9D6]"
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
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#08D9D6]"
                    />
                  </div>

                  {/* Phone / WhatsApp */}
                  <div>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="WhatsApp No. (e.g. +233...)"
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#08D9D6]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Alert Channels & Frequency */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              
              {/* Delivery Channels */}
              <div className="bg-[#252A34] border border-white/10 p-3 rounded-2xl space-y-2">
                <label className="block text-[11px] font-bold text-slate-300">ALERT CHANNELS</label>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => toggleChannel('email')}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      channels.includes('email')
                        ? 'bg-[#08D9D6]/15 border-[#08D9D6]/40 text-white'
                        : 'bg-slate-950 text-slate-400 border-white/10'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-[#08D9D6]" /> Email Alerts
                    </span>
                    {channels.includes('email') && <Check className="w-3.5 h-3.5 text-[#08D9D6]" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleChannel('whatsapp')}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      channels.includes('whatsapp')
                        ? 'bg-[#08D9D6]/15 border-[#08D9D6]/40 text-white'
                        : 'bg-slate-950 text-slate-400 border-white/10'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp Alerts
                    </span>
                    {channels.includes('whatsapp') && <Check className="w-3.5 h-3.5 text-[#08D9D6]" />}
                  </button>
                </div>
              </div>

              {/* Frequency */}
              <div className="bg-[#252A34] border border-white/10 p-3 rounded-2xl space-y-2">
                <label className="block text-[11px] font-bold text-slate-300">FREQUENCY</label>
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
                          ? 'bg-[#08D9D6]/15 border-[#08D9D6]/40 text-[#08D9D6]'
                          : 'bg-slate-950 text-slate-400 border-white/10'
                      }`}
                    >
                      <span>{item.label}</span>
                      {frequency === item.id && <span className="w-2 h-2 rounded-full bg-[#08D9D6]" />}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* Error Message if any */}
            {errorMsg && (
              <p className="text-xs font-bold text-[#FF2E63] bg-[#FF2E63]/10 border border-[#FF2E63]/20 p-2.5 rounded-xl">
                {errorMsg}
              </p>
            )}

            {/* Live Summary Callout */}
            <div className="p-3 rounded-xl bg-[#08D9D6]/10 border border-[#08D9D6]/20 text-xs text-slate-200 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#08D9D6] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white">Summary: </span>
                You will receive <strong className="text-[#08D9D6]">{frequency}</strong> alerts for <strong className="text-white">{formattedTypeStr}</strong> in <strong className="text-white">{formattedLocationStr}</strong> under <strong className="text-[#08D9D6]">GH₵ {maxRent.toLocaleString()}/mo</strong>.
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl font-black text-xs text-[#252A34] bg-[#08D9D6] hover:bg-[#08D9D6]/90 transition-all shadow-lg shadow-[#08D9D6]/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#252A34] border-t-transparent rounded-full animate-spin" />
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
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-xl">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-white">Subscription Active!</h3>
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                We have registered your search alert. A confirmation email has been logged to <strong className="text-[#08D9D6]">{email}</strong>.
              </p>
            </div>

            <div className="p-4 bg-[#252A34] rounded-2xl border border-white/10 text-xs space-y-2 text-left max-w-sm mx-auto">
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Target Location:</span>
                <span className="font-bold text-white">{formattedLocationStr}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Property Category:</span>
                <span className="font-bold text-white">{formattedTypeStr}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Max Budget:</span>
                <span className="font-bold text-[#08D9D6]">GH₵ {maxRent.toLocaleString()}/mo</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span className="text-slate-400">Alert Cadence:</span>
                <span className="font-bold text-[#08D9D6] capitalize">{frequency}</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-extrabold shadow-lg hover:bg-[#08D9D6]/90 transition-colors"
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
