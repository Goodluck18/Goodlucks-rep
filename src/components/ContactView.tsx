import React, { useState } from 'react';
import { Mail, Phone, MapPin, Building2, Send, CheckCircle2, Share2, Instagram, Linkedin, Twitter, Facebook, Music2, AlertCircle } from 'lucide-react';
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
    <div className="min-h-screen bg-page text-ink py-12 px-4 sm:px-6 lg:px-8">
      <SEOHead
        title="Contact Goodlucks Homes - Accra Rental Support & Inquiries"
        description="Contact Goodlucks Homes in Ridge, Accra for help with viewings, listings or rental enquiries."
      />
      <div className="max-w-4xl mx-auto space-y-10 animate-fadeIn">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl sm:text-4xl font-black text-ink">Contact Goodlucks Homes</h1>
          <p className="text-sm text-ink/70 max-w-md mx-auto leading-relaxed">
            Our property team in Accra is available 6 days a week to assist with viewings, listings, and rental enquiries.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Direct Contact Info */}
          <div className="bg-surface p-8 rounded-2xl border border-line space-y-6">
            <h2 className="text-xl font-bold text-ink flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Goodlucks Platforms Headquarters
            </h2>

            <div className="space-y-4 text-sm text-ink">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-ink shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-ink">Office Address</div>
                  <div className="text-xs text-ink/70">Goodlucks Tower, Ridge Diplomatic Precinct, Accra, Ghana</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-ink shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-ink">Email Address</div>
                  <div className="text-xs text-ink/70">rentals@goodlucks.co</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-ink shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-ink">Telephone Support</div>
                  <div className="text-xs text-ink/70">+233 23 769 0080</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Share2 className="w-5 h-5 text-ink shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-ink">Social Media</div>
                  <div className="text-xs text-ink font-semibold mb-1">@GoodlucksHomes on all platforms</div>
                  <div className="flex items-center gap-2 pt-1 text-ink/70">
                    <a href="https://www.instagram.com/GoodlucksHomes" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-surface hover:text-ink transition-colors" title="Instagram">
                      <Instagram className="w-4 h-4" />
                    </a>
                    <a href="https://www.tiktok.com/@GoodlucksHomes" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-surface hover:text-ink transition-colors" title="TikTok @GoodlucksHomes">
                      <Music2 className="w-4 h-4" />
                    </a>
                    <a href="https://www.linkedin.com/company/GoodlucksHomes" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-surface hover:text-ink transition-colors" title="LinkedIn">
                      <Linkedin className="w-4 h-4" />
                    </a>
                    <a href="https://x.com/GoodlucksHomes" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-surface hover:text-ink transition-colors" title="X / Twitter">
                      <Twitter className="w-4 h-4" />
                    </a>
                    <a href="https://www.facebook.com/GoodlucksHomes" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-surface hover:text-ink transition-colors" title="Facebook">
                      <Facebook className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-line text-xs text-ink/70">
              Operating Hours: Mon - Sat: 8:00 AM - 6:00 PM GMT
            </div>
          </div>

          {/* Form */}
          <div className="bg-surface p-8 rounded-2xl border border-line shadow-lg">
            {!sent ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h2 className="text-xl font-bold text-ink">Send Direct Message</h2>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Phone Number <span className="text-ink/70 font-normal">(optional)</span></label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+233 24 000 0000"
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">Message / Question</label>
                  <textarea
                    rows={4}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="How can Goodlucks Homes assist you today?"
                    className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink focus:outline-none focus:border-interactive"
                  />
                </div>

                {error && (
                  <div role="alert" className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="gl-btn gl-btn-primary w-full"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
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
                <CheckCircle2 className="w-12 h-12 text-ink mx-auto" />
                <h3 className="text-xl font-bold text-ink">Message Delivered</h3>
                <p className="text-xs text-ink/70">Thank you for reaching out. A Goodlucks Homes specialist will reply via email shortly.</p>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
