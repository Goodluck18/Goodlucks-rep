import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SEOHead } from './SEOHead';
import { Compass, MapPin, DollarSign, Bed, Calendar, ShieldCheck, CheckCircle2, Sparkles, ArrowRight, ShieldAlert, Building2, PlusCircle, LogIn, UserCheck } from 'lucide-react';

interface FindAHomeViewProps {
  onOpenAuth?: (mode?: 'login' | 'register') => void;
}

export const FindAHomeView: React.FC<FindAHomeViewProps> = ({ onOpenAuth }) => {
  const { currentUser, currentRole, submitTenantRequest, setCurrentView, loginAsRole } = useApp();

  // Guard Condition 1: User is NOT logged in (guest / no account)
  if (!currentUser || currentRole === 'guest') {
    return (
      <div className="min-h-screen bg-[#252A34] text-white py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <SEOHead
          title="Find a Rental Home - Custom Matching Service | Goodlucks Homes"
          description="Submit your location, budget, bedroom requirements, and move-in date. Goodlucks Homes matches you with 100% verified rentals in Accra."
        />
        <div className="max-w-xl w-full bg-slate-800/90 border border-[#08D9D6]/30 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-6 animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-[#08D9D6]/20 text-[#08D9D6] border border-[#08D9D6]/30 flex items-center justify-center mx-auto shadow-inner">
            <LogIn className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="px-3.5 py-1 rounded-full text-[11px] font-extrabold bg-[#08D9D6]/10 text-[#08D9D6] border border-[#08D9D6]/20 uppercase tracking-wider">
              Tenant Sign In Required
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Log In to Match Properties
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
              You are currently not signed in. To submit your location and budget preferences for Goodlucks Homes property matching, please <strong>log in as a Tenant</strong>.
            </p>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-2xl border border-white/5 text-xs text-slate-400 space-y-2.5 text-left">
            <div className="font-bold text-slate-200">Why Log In as a Tenant?</div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-[#08D9D6]" />
              <span>Receive verified AI property matches based on your budget in GH₵</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-[#08D9D6]" />
              <span>Track physical viewing schedules & match updates on your tenant dashboard</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-[#08D9D6]" />
              <span>Direct access to Goodlucks senior verification intermediaries</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              onClick={() => {
                if (onOpenAuth) {
                  onOpenAuth('login');
                } else {
                  loginAsRole('tenant');
                }
              }}
              className="px-6 py-3.5 rounded-2xl bg-[#08D9D6] text-[#252A34] font-black text-xs sm:text-sm hover:bg-[#08D9D6]/90 transition-all shadow-lg shadow-[#08D9D6]/20 flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              Log In as Tenant to Match Property
            </button>
            <button
              onClick={() => setCurrentView('home')}
              className="px-6 py-3.5 rounded-2xl bg-white/10 text-white font-bold text-xs sm:text-sm hover:bg-white/20 transition-all border border-white/10"
            >
              Browse Properties
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Guard Condition 2: User IS logged in, but as a LANDLORD
  if (currentRole === 'landlord') {
    return (
      <div className="min-h-screen bg-[#252A34] text-white py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-xl w-full bg-slate-800/90 border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-6 animate-fadeIn">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto shadow-inner">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="px-3.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-500/10 text-amber-300 border border-amber-500/20 uppercase tracking-wider">
              Landlord Account Detected
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Property Matching Reserved for Tenants
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
              You are currently logged in as a <strong>Landlord</strong>. Landlords list properties and manage viewings. To submit property matching requests, please log in with a <strong>Tenant Account</strong>.
            </p>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-2xl border border-white/5 text-xs text-slate-400 space-y-2.5 text-left">
            <div className="font-bold text-slate-200">Account Role Permissions:</div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span><strong>Tenant:</strong> Access property matching requests and AI matches</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span><strong>Landlord:</strong> Manage property listings and viewing approvals</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              onClick={() => {
                if (onOpenAuth) {
                  onOpenAuth('login');
                } else {
                  loginAsRole('tenant');
                }
              }}
              className="px-6 py-3 rounded-2xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs sm:text-sm hover:bg-[#08D9D6]/90 transition-all shadow-lg shadow-[#08D9D6]/20 flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              Log In as Tenant
            </button>
            <button
              onClick={() => setCurrentView('dashboard')}
              className="px-6 py-3 rounded-2xl bg-white/10 text-white font-bold text-xs sm:text-sm hover:bg-white/20 transition-all border border-white/10 flex items-center justify-center gap-2"
            >
              <Building2 className="w-4 h-4 text-[#08D9D6]" />
              Go to Landlord Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const [tenantName, setTenantName] = useState(currentUser?.name || '');
  const [tenantPhone, setTenantPhone] = useState(currentUser?.phone || '');
  const [tenantEmail, setTenantEmail] = useState(currentUser?.email || '');
  
  const [budgetMin, setBudgetMin] = useState(3000);
  const [budgetMax, setBudgetMax] = useState(8000);
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(2);
  const [propertyType, setPropertyType] = useState('Apartment');
  const [moveInDate, setMoveInDate] = useState('2026-09-01');
  const [selectedLocations, setSelectedLocations] = useState<string[]>(['Cantonments', 'East Legon']);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const GHANA_LOCATIONS = [
    'Cantonments', 'East Legon', 'Airport Residential', 'Osu', 'Labone', 
    'Spintex', 'Ridge', 'Airport City', 'Ahodwo (Kumasi)', 'Takoradi'
  ];

  const toggleLocation = (loc: string) => {
    if (selectedLocations.includes(loc)) {
      if (selectedLocations.length > 1) {
        setSelectedLocations(selectedLocations.filter(l => l !== loc));
      }
    } else {
      setSelectedLocations([...selectedLocations, loc]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantName || !tenantPhone || selectedLocations.length === 0) return;

    submitTenantRequest({
      tenantName,
      tenantPhone,
      tenantEmail: tenantEmail || 'tenant@goodlucks.com',
      preferredLocations: selectedLocations,
      budgetMin,
      budgetMax,
      bedrooms,
      bathrooms,
      propertyType,
      moveInDate,
      notes,
    });

    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#252A34] text-white py-10 px-4 sm:px-6 lg:px-8">
      <SEOHead
        title="Find a Rental Home - Property Matching Service | Goodlucks Homes Ghana"
        description="Submit your target location, budget, bedroom requirements, and move-in date. Goodlucks Homes matches you with 100% verified rentals in Accra."
      />
      <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn">
        
        {/* Header Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] text-xs font-bold border border-[#08D9D6]/20">
            <Sparkles className="w-4 h-4" />
            AI-Powered Goodlucks Matching
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Find Your Ideal Rental Home
          </h1>
          <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            Tell us your exact budget and location requirements. Goodlucks Homes acts as your personal property agent to find, verify, and match you with premium homes in Ghana.
          </p>
        </div>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="bg-slate-800/80 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            
            {/* Contact Details */}
            <div className="space-y-4 pb-6 border-b border-white/10">
              <h2 className="text-lg font-bold text-[#08D9D6] flex items-center gap-2">
                <Compass className="w-5 h-5" />
                1. Tenant Contact Information
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Your Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="e.g. Kofi Mensah"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={tenantPhone}
                    onChange={(e) => setTenantPhone(e.target.value)}
                    placeholder="+233 24 000 0000"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={tenantEmail}
                    onChange={(e) => setTenantEmail(e.target.value)}
                    placeholder="tenant@example.com"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>
              </div>
            </div>

            {/* Location Preference */}
            <div className="space-y-3 pb-6 border-b border-white/10">
              <h2 className="text-lg font-bold text-[#08D9D6] flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                2. Preferred Locations in Ghana
              </h2>
              <p className="text-xs text-slate-400">Select one or more target areas:</p>

              <div className="flex flex-wrap gap-2 pt-1">
                {GHANA_LOCATIONS.map(loc => {
                  const isSelected = selectedLocations.includes(loc);
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => toggleLocation(loc)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isSelected 
                          ? 'bg-[#08D9D6] text-[#252A34] shadow-md shadow-[#08D9D6]/20' 
                          : 'bg-slate-900 text-slate-300 border border-white/10 hover:border-white/30'
                      }`}
                    >
                      {isSelected ? '✓ ' : '+ '}{loc}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Budget & Property Specs */}
            <div className="space-y-4 pb-6 border-b border-white/10">
              <h2 className="text-lg font-bold text-[#08D9D6] flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                3. Budget & Property Specifications
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Monthly Budget Range (GHS)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step={500}
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                    />
                    <span className="text-slate-400 text-xs">to</span>
                    <input
                      type="number"
                      step={500}
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Property Type
                  </label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  >
                    <option value="Apartment">Apartment</option>
                    <option value="Luxury Villa">Luxury Villa</option>
                    <option value="Townhouse">Townhouse</option>
                    <option value="Studio">Studio</option>
                    <option value="Duplex">Duplex</option>
                    <option value="Penthouse">Penthouse</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Bedrooms Required
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={bedrooms}
                    onChange={(e) => setBedrooms(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Bathrooms Required
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={bathrooms}
                    onChange={(e) => setBathrooms(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Expected Move-in Date
                  </label>
                  <input
                    type="date"
                    value={moveInDate}
                    onChange={(e) => setMoveInDate(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Special Requirements or Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Must have 24/7 standby generator, swimming pool, pet friendly."
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-4 rounded-2xl bg-[#08D9D6] text-[#252A34] font-extrabold text-base hover:bg-[#08D9D6]/90 transition-all shadow-xl shadow-[#08D9D6]/20 flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              <span>Submit Rental Request & Match Properties</span>
              <ArrowRight className="w-5 h-5" />
            </button>

          </form>
        ) : (
          <div className="bg-slate-800/90 border border-[#08D9D6]/40 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-[#08D9D6]/20 text-[#08D9D6] border border-[#08D9D6]/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                Request Submitted Successfully!
              </h2>
              <p className="text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
                Goodlucks Homes AI Matching Engine is actively comparing your request against our verified property inventory in Ghana.
              </p>
            </div>

            <div className="bg-slate-900 p-5 rounded-2xl text-xs text-left max-w-md mx-auto space-y-2 border border-white/10">
              <div className="text-[#08D9D6] font-bold uppercase tracking-wider">Your Request Progress</div>
              <div className="flex items-center justify-between text-white font-medium pt-1">
                <span>Locations: {selectedLocations.join(', ')}</span>
              </div>
              <div className="text-slate-400">
                Budget: GH₵ {budgetMin.toLocaleString()} - GH₵ {budgetMax.toLocaleString()} / mo
              </div>
              <div className="text-slate-400">
                Move-in Target: {moveInDate}
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => setCurrentView('dashboard')}
                className="px-6 py-3 rounded-xl bg-[#08D9D6] text-[#252A34] font-bold text-sm shadow-md"
              >
                Go to Tenant Dashboard
              </button>
              <button
                onClick={() => setCurrentView('browse')}
                className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm"
              >
                Browse All Properties
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
