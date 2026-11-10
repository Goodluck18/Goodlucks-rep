import React, { useRef, useState } from 'react';
import { Property } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';
import { useApp } from '../context/AppContext';
import { Calendar, Clock, User, Phone, Mail, ShieldCheck, CheckCircle2, X, AlertCircle, ShieldAlert } from 'lucide-react';
import { messageForError } from '../services/apiService';

interface ViewingRequestModalProps {
  property: Property | null;
  onClose: () => void;
}

export const ViewingRequestModal: React.FC<ViewingRequestModalProps> = ({ property, onClose }) => {
  const { currentUser, scheduleViewing, setCurrentView } = useApp();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogProps = useModalA11y(dialogRef, onClose);
  
  const defaultViewingDate = (() => {
    const d = new Date(Date.now() + 2 * 86400_000);
    return d.toISOString().slice(0, 10);
  })();
  const [date, setDate] = useState(defaultViewingDate);
  const [time, setTime] = useState('11:00 AM');
  const [tenantName, setTenantName] = useState(currentUser?.name || '');
  const [tenantPhone, setTenantPhone] = useState(currentUser?.phone || '');
  const [tenantEmail, setTenantEmail] = useState(currentUser?.email || '');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState<null | { agent: string; date: string; time: string; reference: string }>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!property) return null;

  // Agents and Landlords are the one provider account, and neither requests a
  // viewing as a tenant.
  const isProvider = currentUser?.role === 'landlord' || currentUser?.role === 'agent';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isProvider) return;

    if (!tenantName.trim() || !tenantPhone.trim()) {
      setError('Please add your name and phone number so our agent can reach you.');
      return;
    }
    if (!tenantEmail.trim()) {
      setError('Please add an email address for your viewing confirmation.');
      return;
    }

    setIsSubmitting(true);
    try {
      const viewing = await scheduleViewing({
        tenantName: tenantName.trim(),
        tenantPhone: tenantPhone.trim(),
        tenantEmail: tenantEmail.trim(),
        propertyId: property.id,
        requestType: 'viewing',
        date,
        time,
        message: notes || `Interested in viewing ${property.title}`,
      });
      setSubmitted({
        agent: viewing.assignedAgent || 'the Goodlucks viewing desk',
        date: viewing.date,
        time: viewing.time,
        reference: viewing.id,
      });
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-start sm:items-center justify-center">
      <div 
        ref={dialogRef}
        {...dialogProps}
        aria-labelledby="viewing-modal-title"
        className="relative w-full max-w-lg bg-surface border border-line rounded-2xl sm:rounded-2xl p-4 sm:p-6 shadow-lg text-ink max-h-[88dvh] flex flex-col overflow-hidden my-auto focus:outline-none"
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
          {isProvider ? (
          <div className="text-center py-4 space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-700 border border-amber-500/30 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-700 border border-amber-500/20 uppercase tracking-wider">
                Agent/Landlord Account Detected
              </span>
              <h3 className="text-xl font-bold text-ink">Viewing Requests Restricted</h3>
              <p className="text-xs text-ink/70 max-w-sm mx-auto leading-relaxed">
                You are signed in with an <strong>Agent/Landlord</strong> account. That account lists properties and answers viewing requests; requesting a viewing and matching homes are reserved for prospective <strong>Tenants</strong>.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-center">
              <button
                onClick={() => { onClose(); setCurrentView('dashboard'); }}
                className="gl-btn gl-btn-primary px-5 py-2.5 text-xs"
              >
                Go to Your Dashboard
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-surface text-ink/70 font-semibold text-xs hover:bg-line"
              >
                Close Window
              </button>
            </div>
          </div>
        ) : !submitted ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-interactive/10 text-ink text-xs font-semibold mb-2">
                <ShieldCheck className="w-4 h-4" />
                Goodlucks Intermediary Service
              </div>
              <h2 id="viewing-modal-title" className="text-xl sm:text-2xl font-bold text-ink">
                Request Property Viewing
              </h2>
              <p className="text-xs sm:text-sm text-ink/70 mt-1">
                Viewing for <span className="font-semibold text-ink">{property.title}</span> in {property.location}
              </p>
            </div>

            {/* Task 03: this property's own fee and viewing terms, exactly as
                approved for it. Nothing is assumed and nothing is defaulted. */}
            <div className="bg-interactive/10 border border-interactive/30 rounded-2xl p-3.5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-ink shrink-0 mt-0.5" />
              <div className="text-xs text-ink leading-relaxed space-y-1.5">
                <div>
                  <span className="font-bold text-ink">Viewing fee for this property:</span>{' '}
                  {property.viewingTerms?.isApproved && property.viewingTerms.feeGhs ? (
                    <span className="font-semibold text-ink">GH₵ {property.viewingTerms.feeGhs.toLocaleString()}</span>
                  ) : property.viewingTerms?.source === 'platform_policy' ? (
                    <span className="font-semibold text-ink">not set yet — Goodlucks Homes sets it before viewings</span>
                  ) : (
                    <span className="font-semibold text-ink">none approved — the agent will tell you before you travel</span>
                  )}
                  .{' '}
                  {property.viewingTerms?.source === 'platform_policy' ? (
                    <>
                      It is <span className="underline font-semibold">payable after the viewing, to Goodlucks Homes</span> —
                      never online, and never to the landlord. Goodlucks doesn't ask for a viewing fee before you view, and
                      no payment is taken or confirmed by this form.
                    </>
                  ) : (
                    <>
                      It is paid <span className="underline font-semibold">directly to the agent on site</span>; Goodlucks
                      never asks for a viewing fee online, and no payment is taken or confirmed by this form.
                    </>
                  )}
                </div>
                {property.viewingTerms?.isApproved && property.viewingTerms.terms && (
                  <div className="text-[11px] text-ink/70 space-y-1 border-t border-line pt-1.5">
                    <div>
                      <span className="font-semibold text-ink">
                        {property.viewingTerms.terms.appointmentRequired ? 'Appointment required:' : 'No appointment needed:'}
                      </span>{' '}
                      {property.viewingTerms.terms.howToArrange}
                    </div>
                    {property.viewingTerms.terms.conditions && (
                      <div>
                        <span className="font-semibold text-ink">Conditions:</span>{' '}
                        {property.viewingTerms.terms.conditions}
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-ink">Paying the fee:</span>{' '}
                      {property.viewingTerms.terms.paymentInstructions}
                    </div>
                    {property.viewingTerms.terms.restrictions && (
                      <div>
                        <span className="font-semibold text-ink">Restrictions:</span>{' '}
                        {property.viewingTerms.terms.restrictions}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-3 text-ink/70" />
                  <input
                    type="text"
                    required
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-page border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3.5 top-3 text-ink/70" />
                    <input
                      type="tel"
                      required
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(e.target.value)}
                      placeholder="+233 24 000 0000"
                      className="w-full bg-page border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3 text-ink/70" />
                    <input
                      type="email"
                      required
                      value={tenantEmail}
                      onChange={(e) => setTenantEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full bg-page border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Preferred Date
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3.5 top-3 text-ink/70" />
                    <input
                      type="date"
                      required
                      min={new Date().toISOString().slice(0, 10)}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-page border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink focus:outline-none focus:border-interactive"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                    Preferred Time Slot
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 absolute left-3.5 top-3 text-ink/70" />
                    <select
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full bg-page border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink focus:outline-none focus:border-interactive"
                    >
                      <option value="09:00 AM">09:00 AM</option>
                      <option value="11:00 AM">11:00 AM</option>
                      <option value="02:00 PM">02:00 PM</option>
                      <option value="04:00 PM">04:00 PM</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink/70 mb-1.5">
                  Special Notes or Questions
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Need to move in within 2 weeks"
                  className="w-full bg-page border border-line rounded-xl p-3 text-sm text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                />
              </div>
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
                  Sending request...
                </>
              ) : (
                'Send viewing request'
              )}
            </button>
          </form>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-interactive/15 text-ink border border-interactive/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-ink">Request sent</h3>
            <p className="text-sm text-ink/70 max-w-sm mx-auto leading-relaxed">
              Your request to view <span className="text-ink font-semibold">{property.title}</span> is with{' '}
              <span className="text-ink font-semibold">{submitted.agent}</span>.
            </p>
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl text-xs text-amber-800 text-left space-y-1">
              <div className="font-bold">This is not a confirmed appointment yet.</div>
              <div>
                You asked for {submitted.date} at {submitted.time}. The agent will contact you to agree a time;
                the request becomes confirmed when a slot is accepted.
              </div>
            </div>
            <div className="bg-page p-4 rounded-2xl text-xs text-ink/70 text-left space-y-1">
              <div>• Reference: <span className="font-mono font-semibold text-ink">{submitted.reference}</span></div>
              <div>
                • Viewing fee:{' '}
                <span className="font-semibold text-ink">
                  {property.viewingTerms?.source === 'platform_policy'
                    ? `${
                        property.viewingTerms.feeGhs
                          ? `GH₵ ${property.viewingTerms.feeGhs.toLocaleString()} `
                          : ''
                      }paid to Goodlucks Homes after the viewing, if one applies`
                    : 'paid on site to the agent after the viewing, if one applies'}
                </span>
              </div>
              <div>• Payment status: <span className="font-semibold text-ink">nothing has been paid or recorded</span></div>
            </div>
            <button
              onClick={onClose}
              className="gl-btn gl-btn-primary px-6 py-2.5 text-sm"
            >
              Done
            </button>
          </div>
        )}
        </div>

      </div>
    </div>
  );
};
