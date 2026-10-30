import React, { useState } from 'react';
import { Mail, Phone, MapPin, Building2, Send, CheckCircle2, Share2, Instagram, Linkedin, Twitter, Facebook, AlertCircle } from 'lucide-react';
import { SEOHead } from './SEOHead';
import { useApp } from '../context/AppContext';
import { messageForError } from '../services/apiService';

export const ContactView: React.FC = () => {
  const { sendEnquiry } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await sendEnquiry({ name: name.trim(), email: email.trim(), phone: phone.trim(), message: message.trim(), source: 'contact_form' });
      setSent(true);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#252A34] text-white py-12 px-4 sm:px-6 lg:px-8">
      <SEOHead
        title="Contact Goodlucks Homes - Accra Rental Support & Inquiries"
        description="Get in touch with Goodlucks Homes in Ridge, Accra. Speak with our rental agents for property viewing bookings, listings support, or general enquiries."
      />
      <div className="max-w-4xl mx-auto space-y-10 animate-fadeIn">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl sm:text-4xl font-black text-white">Contact Goodlucks Homes</h1>
          <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
            Our property team in Accra is available 6 days a week to assist with viewings, listings, and rental enquiries.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Direct Contact Info */}
          <div className="bg-slate-800/80 p-8 rounded-3xl border border-white/10 space-y-6">
            <h2 className="text-xl font-bold text-[#08D9D6] flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Goodlucks Platforms Headquarters
            </h2>

            <div className="space-y-4 text-sm text-slate-200">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#08D9D6] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white">Office Address</div>
                  <div className="text-xs text-slate-400">Goodlucks Tower, Ridge Diplomatic Precinct, Accra, Ghana</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-[#08D9D6] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white">Email Address</div>
                  <div className="text-xs text-slate-400">rentals@goodlucks.co</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-[#08D9D6] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white">Telephone Support</div>
                  <div className="text-xs text-slate-400">+233 23 769 0080</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Share2 className="w-5 h-5 text-[#08D9D6] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white">Social Media</div>
                  <div className="text-xs text-[#08D9D6] font-semibold mb-1">@GoodlucksHomes on all platforms</div>
                  <div className="flex items-center gap-2 pt-1 text-slate-300">
                    <a href="https://instagram.com/GoodlucksHomes" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-slate-900 hover:text-[#08D9D6] transition-colors" title="Instagram">
                      <Instagram className="w-4 h-4" />
                    </a>
                    <a href="https://linkedin.com/company/GoodlucksHomes" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-slate-900 hover:text-[#08D9D6] transition-colors" title="LinkedIn">
                      <Linkedin className="w-4 h-4" />
                    </a>
                    <a href="https://x.com/GoodlucksHomes" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-slate-900 hover:text-[#08D9D6] transition-colors" title="X / Twitter">
                      <Twitter className="w-4 h-4" />
                    </a>
                    <a href="https://facebook.com/GoodlucksHomes" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-slate-900 hover:text-[#08D9D6] transition-colors" title="Facebook">
                      <Facebook className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 text-xs text-slate-400">
              Operating Hours: Mon - Sat: 8:00 AM - 6:00 PM GMT
            </div>
          </div>

          {/* Form */}
          <div className="bg-slate-800/80 p-8 rounded-3xl border border-white/10 shadow-xl">
            {!sent ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h2 className="text-xl font-bold text-white">Send Direct Message</h2>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number <span className="text-slate-500 font-normal">(optional)</span></label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+233 24 000 0000"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Message / Question</label>
                  <textarea
                    rows={4}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="How can Goodlucks Homes assist you today?"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                {error && (
                  <div role="alert" className="p-3 rounded-xl bg-[#FF2E63]/15 border border-[#FF2E63]/30 text-[#FF8FA8] text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-bold text-sm hover:bg-[#08D9D6]/90 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-[#252A34]/30 border-t-[#252A34] rounded-full animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Send Enquiry
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="text-center py-10 space-y-4">
                <CheckCircle2 className="w-12 h-12 text-[#08D9D6] mx-auto" />
                <h3 className="text-xl font-bold text-white">Message Delivered</h3>
                <p className="text-xs text-slate-300">Thank you for reaching out. A Goodlucks Homes specialist will reply via email shortly.</p>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
