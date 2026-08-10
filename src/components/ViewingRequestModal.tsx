import React, { useState } from 'react';
import { Property } from '../types';
import { useApp } from '../context/AppContext';
import { Calendar, Clock, User, Phone, Mail, ShieldCheck, CheckCircle2, X, AlertCircle, ShieldAlert } from 'lucide-react';

interface ViewingRequestModalProps {
  property: Property | null;
  onClose: () => void;
}

export const ViewingRequestModal: React.FC<ViewingRequestModalProps> = ({ property, onClose }) => {
  const { currentUser, scheduleViewing, submitTenantRequest, setCurrentView } = useApp();
  
  const [date, setDate] = useState('2026-08-16');
  const [time, setTime] = useState('11:00 AM');
  const [tenantName, setTenantName] = useState(currentUser?.name || '');
  const [tenantPhone, setTenantPhone] = useState(currentUser?.phone || '');
  const [tenantEmail, setTenantEmail] = useState(currentUser?.email || '');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!property) return null;

  const isLandlord = currentUser?.role === 'landlord';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLandlord) return;
    if (!tenantName || !tenantPhone) return;

    // First ensure a tenant request exists or create one
    const tenantReq = submitTenantRequest({
      tenantName,
      tenantPhone,
      tenantEmail: tenantEmail || 'tenant@goodlucks.com',
      preferredLocations: [property.location],
      budgetMin: property.rentGhs - 500,
      budgetMax: property.rentGhs + 1000,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      propertyType: property.propertyType,
      moveInDate: date,
      notes: notes || `Interested in viewing ${property.title}`,
    });

    scheduleViewing({
      tenantRequestId: tenantReq.id,
      tenantName,
      tenantPhone,
      propertyId: property.id,
      propertyTitle: property.title,
      propertyLocation: property.location,
      date,
      time,
      assignedAgent: 'Goodlucks Field Agent',
      status: 'scheduled',
      viewingFeePaid: false, // Physical payment on site
      feeAmountGhs: 100,
      outcomeNotes: 'Viewing scheduled through Goodlucks Homes platform.',
    });

    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#252A34] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl text-white overflow-hidden">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {isLandlord ? (
          <div className="text-center py-4 space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-300 border border-amber-500/20 uppercase tracking-wider">
                Landlord Account Detected
              </span>
              <h3 className="text-xl font-bold text-white">Viewing Requests Restricted</h3>
              <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                You are currently logged in as a <strong>Landlord</strong>. Landlords manage property listings, while scheduling viewings and matching properties are reserved for prospective <strong>Tenants</strong>.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-center">
              <button
                onClick={() => { onClose(); setCurrentView('dashboard'); }}
                className="px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-bold text-xs"
              >
                Go to Landlord Dashboard
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700"
              >
                Close Window
              </button>
            </div>
          </div>
        ) : !submitted ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] text-xs font-semibold mb-2">
                <ShieldCheck className="w-4 h-4" />
                Goodlucks Intermediary Service
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Request Property Viewing
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Viewing for <span className="font-semibold text-white">{property.title}</span> in {property.location}
              </p>
            </div>

            {/* Physical Fee Intermediary Alert */}
            <div className="bg-[#08D9D6]/10 border border-[#08D9D6]/30 rounded-2xl p-3.5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#08D9D6] shrink-0 mt-0.5" />
              <div className="text-xs text-slate-200 leading-relaxed">
                <span className="font-bold text-[#08D9D6]">Viewing Fee Notice:</span> Standard viewing fee is <span className="font-bold text-white">GH₵ 100</span>. Fees are paid <span className="underline font-semibold">physically to Goodlucks Homes staff</span> during the property viewing. We never ask for online viewing fee payments.
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-slate-800/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="tel"
                      required
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(e.target.value)}
                      placeholder="+233 24 000 0000"
                      className="w-full bg-slate-800/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={tenantEmail}
                      onChange={(e) => setTenantEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full bg-slate-800/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Preferred Date
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full bg-slate-800/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Preferred Time Slot
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <select
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full bg-slate-800/80 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
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
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Special Notes or Questions
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Need to move in within 2 weeks"
                  className="w-full bg-slate-800/80 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-[#08D9D6] text-[#252A34] font-bold hover:bg-[#08D9D6]/90 transition-all shadow-lg shadow-[#08D9D6]/20 text-center"
            >
              Confirm Viewing Request
            </button>
          </form>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-white">Viewing Scheduled!</h3>
            <p className="text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
              Your viewing request for <span className="text-white font-semibold">{property.title}</span> on <span className="text-[#08D9D6] font-semibold">{date} at {time}</span> has been logged with Goodlucks Homes.
            </p>
            <div className="bg-white/5 p-4 rounded-2xl text-xs text-slate-300 text-left space-y-1">
              <div>• Assigned Agent: <span className="font-semibold text-white">Goodlucks Field Agent</span></div>
              <div>• Viewing Fee: <span className="font-semibold text-white">GH₵ 100</span> (Payable physically on site)</div>
              <div>• Intermediary Status: <span className="font-semibold text-[#08D9D6]">Active</span></div>
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-bold text-sm"
            >
              Done & Return
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
