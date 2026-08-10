import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { PropertyCard } from './PropertyCard';
import { 
  User, 
  Clock, 
  CheckCircle2, 
  MapPin, 
  Calendar, 
  Heart, 
  Bell, 
  ShieldCheck, 
  ChevronRight,
  Sparkles,
  Phone,
  Mail,
  Edit,
  Plus,
  Activity,
  Search,
  Check
} from 'lucide-react';

export const TenantDashboard: React.FC = () => {
  const { 
    currentUser, 
    tenantRequests, 
    properties, 
    viewingSchedules, 
    savedPropertyIds, 
    notifications,
    setCurrentView,
    updateUserProfile,
    navigateToProperty
  } = useApp();

  const [activeTab, setActiveTab] = useState<'requests' | 'matches' | 'viewings' | 'saved' | 'profile'>('requests');
  const [profileName, setProfileName] = useState(currentUser?.name || 'Kofi Mensah');
  const [profilePhone, setProfilePhone] = useState(currentUser?.phone || '+233 24 412 3456');
  const [profileEmail, setProfileEmail] = useState(currentUser?.email || 'tenant@goodlucks.com');
  const [profileAddress, setProfileAddress] = useState(currentUser?.address || 'Cantonments, Accra');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const myRequests = tenantRequests.filter(r => r.tenantId === currentUser?.id || r.tenantEmail === currentUser?.email) || tenantRequests;
  const activeRequest = myRequests[0] || tenantRequests[0];

  const myViewings = viewingSchedules.filter(v => v.tenantName === currentUser?.name || v.tenantPhone === currentUser?.phone) || viewingSchedules;
  const savedProps = properties.filter(p => savedPropertyIds.includes(p.id));

  // Determine Matched Properties
  const matchedProps = properties.filter(p => activeRequest?.matchedPropertyIds?.includes(p.id)) || [properties[0], properties[2]];

  // Timeline Steps
  const TIMELINE_STEPS = [
    { key: 'submitted', label: 'Request Submitted', desc: 'Received by Goodlucks' },
    { key: 'searching', label: 'Searching', desc: 'AI matching properties' },
    { key: 'matched', label: 'Property Found', desc: 'Matches verified' },
    { key: 'viewing_scheduled', label: 'Viewing Scheduled', desc: 'Agent assigned' },
    { key: 'completed', label: 'Completed', desc: 'Keys handed over' },
  ];

  const getStepStatus = (stepKey: string) => {
    const currentStatus = activeRequest?.status || 'submitted';
    const stepOrder = ['submitted', 'searching', 'matched', 'viewing_scheduled', 'completed'];
    const currentIndex = stepOrder.indexOf(currentStatus);
    const stepIndex = stepOrder.indexOf(stepKey);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserProfile({
      name: profileName,
      phone: profilePhone,
      email: profileEmail,
      address: profileAddress,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const myNotifications = notifications.slice(0, 3);

  return (
    <div className="min-h-screen bg-[#1F242D] text-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
        
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] text-xs font-bold border border-[#08D9D6]/20 mb-1">
              <Activity className="w-3.5 h-3.5" />
              Tenant Operations Hub
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Welcome back, {currentUser?.name?.split(' ')[0] || 'Kofi'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Verified Tenant Account
            </span>
          </div>
        </div>

        {/* ================= BENTO GRID LEVEL 1: TOP 3 DISTINCT GLASSMORPHIC CARDS ================= */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6">
          
          {/* Bento Card 1: Profile Glassmorphic Card (Col 6) */}
          <div className="md:col-span-6 bg-[#252A34]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl hover:border-white/20 transition-all flex flex-col justify-between space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img 
                    src={currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'} 
                    alt={currentUser?.name}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-[#08D9D6] shadow-xl" 
                  />
                  <div className="absolute -bottom-1 -right-1 bg-[#08D9D6] text-[#252A34] p-1 rounded-lg text-[10px] font-black">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-white">{currentUser?.name || 'Kofi Mensah'}</h2>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-[#08D9D6]/20 text-[#08D9D6] border border-[#08D9D6]/30">
                      Tenant
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#08D9D6]" /> {currentUser?.address || 'Cantonments, Accra'}
                  </p>

                  <div className="text-xs text-slate-400 flex flex-wrap gap-3 pt-1">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-[#08D9D6]" /> {currentUser?.phone}</span>
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-[#08D9D6]" /> {currentUser?.email}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-300">
              <span className="text-slate-400">Intermediary Preference: <strong className="text-white">Accra Suburbs</strong></span>
              <button
                onClick={() => setActiveTab('profile')}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors flex items-center gap-1.5"
              >
                <Edit className="w-3.5 h-3.5 text-[#08D9D6]" />
                <span>Edit Profile</span>
              </button>
            </div>
          </div>

          {/* Bento Card 2: Primary Actions Glassmorphic Card (Col 3) */}
          <div className="md:col-span-3 bg-[#252A34]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col justify-between space-y-4 hover:border-white/20 transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#08D9D6]">Quick Actions</span>
                <Sparkles className="w-4 h-4 text-[#08D9D6]" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Find Your Next Home</h3>
              <p className="text-xs text-slate-400">Submit a matching request or explore verified listings.</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setCurrentView('find-home')}
                className="w-full py-2.5 px-3 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-extrabold hover:bg-[#08D9D6]/90 transition-all shadow-lg shadow-[#08D9D6]/20 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>New Rental Request</span>
              </button>

              <button
                onClick={() => setCurrentView('browse')}
                className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-white text-xs font-semibold border border-white/10 transition-colors flex items-center justify-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5 text-[#08D9D6]" />
                <span>Browse All Properties</span>
              </button>
            </div>
          </div>

          {/* Bento Card 3: Notifications Glassmorphic Card (Col 3) */}
          <div className="md:col-span-3 bg-[#252A34]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col justify-between space-y-3 hover:border-white/20 transition-all">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#08D9D6]" />
                  <span className="text-xs font-bold text-white">Activity Feed</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#08D9D6]/20 text-[#08D9D6]">
                  {notifications.length} New
                </span>
              </div>

              <div className="space-y-2 max-h-[120px] overflow-y-auto pr-1">
                {myNotifications.map((notif, idx) => (
                  <div key={idx} className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 space-y-0.5">
                    <div className="text-[11px] font-bold text-white truncate">{notif.title}</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">{notif.message}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Auto-Resend Email Enabled</span>
              <span className="text-emerald-400 font-bold">Active</span>
            </div>
          </div>

        </div>

        {/* ================= BENTO GRID LEVEL 2: 4 STATS & HIGHLIGHT GLASS TILES ================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          <button
            onClick={() => setActiveTab('requests')}
            className={`p-5 rounded-2xl border text-left transition-all ${
              activeTab === 'requests'
                ? 'bg-[#08D9D6]/15 border-[#08D9D6] shadow-lg shadow-[#08D9D6]/10'
                : 'bg-[#252A34]/70 backdrop-blur-xl border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">Rental Request</span>
              <Clock className="w-4 h-4 text-[#08D9D6]" />
            </div>
            <div className="text-lg font-black text-white capitalize truncate">
              {activeRequest?.status?.replace('_', ' ') || 'Submitted'}
            </div>
            <div className="text-[11px] text-[#08D9D6] font-semibold mt-1 flex items-center gap-1">
              <span>GH₵ {activeRequest?.budgetMin?.toLocaleString()} - {activeRequest?.budgetMax?.toLocaleString()}</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </button>

          <button
            onClick={() => setActiveTab('matches')}
            className={`p-5 rounded-2xl border text-left transition-all ${
              activeTab === 'matches'
                ? 'bg-[#08D9D6]/15 border-[#08D9D6] shadow-lg shadow-[#08D9D6]/10'
                : 'bg-[#252A34]/70 backdrop-blur-xl border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">AI Matches</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">{matchedProps.length}</div>
            <div className="text-[11px] text-slate-300 font-semibold mt-1 flex items-center gap-1">
              <span>96% Top Match Score</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </button>

          <button
            onClick={() => setActiveTab('viewings')}
            className={`p-5 rounded-2xl border text-left transition-all ${
              activeTab === 'viewings'
                ? 'bg-[#08D9D6]/15 border-[#08D9D6] shadow-lg shadow-[#08D9D6]/10'
                : 'bg-[#252A34]/70 backdrop-blur-xl border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">Scheduled Viewings</span>
              <Calendar className="w-4 h-4 text-[#08D9D6]" />
            </div>
            <div className="text-2xl font-black text-white">{myViewings.length}</div>
            <div className="text-[11px] text-[#08D9D6] font-semibold mt-1 flex items-center gap-1">
              <span>Verified Agent Tours</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </button>

          <button
            onClick={() => setActiveTab('saved')}
            className={`p-5 rounded-2xl border text-left transition-all ${
              activeTab === 'saved'
                ? 'bg-[#08D9D6]/15 border-[#08D9D6] shadow-lg shadow-[#08D9D6]/10'
                : 'bg-[#252A34]/70 backdrop-blur-xl border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">Saved Homes</span>
              <Heart className="w-4 h-4 text-[#FF2E63]" />
            </div>
            <div className="text-2xl font-black text-[#FF2E63]">{savedProps.length}</div>
            <div className="text-[11px] text-slate-300 font-semibold mt-1 flex items-center gap-1">
              <span>Favorite Properties</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </button>

        </div>

        {/* ================= BENTO GRID LEVEL 3: MAIN DYNAMIC WORKSPACE CARD ================= */}
        <div className="bg-[#252A34]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
          
          {/* Navigation Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/10">
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'requests' ? 'bg-[#08D9D6] text-[#252A34] shadow-md' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Clock className="w-4 h-4" /> Request Tracker
            </button>

            <button
              onClick={() => setActiveTab('matches')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'matches' ? 'bg-[#08D9D6] text-[#252A34] shadow-md' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Sparkles className="w-4 h-4" /> Matched Properties ({matchedProps.length})
            </button>

            <button
              onClick={() => setActiveTab('viewings')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'viewings' ? 'bg-[#08D9D6] text-[#252A34] shadow-md' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Calendar className="w-4 h-4" /> Viewing Schedule ({myViewings.length})
            </button>

            <button
              onClick={() => setActiveTab('saved')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'saved' ? 'bg-[#08D9D6] text-[#252A34] shadow-md' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Heart className="w-4 h-4" /> Saved Homes ({savedProps.length})
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'profile' ? 'bg-[#08D9D6] text-[#252A34] shadow-md' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <User className="w-4 h-4" /> Profile Management
            </button>
          </div>

          {/* Tab 1: Request Progress Timeline */}
          {activeTab === 'requests' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-[#08D9D6] uppercase tracking-wider">Active Search Criteria</div>
                  <h2 className="text-xl font-bold text-white mt-0.5">
                    Target Areas: {activeRequest?.preferredLocations?.join(', ') || 'Cantonments, East Legon'}
                  </h2>
                </div>
                <div className="text-xs bg-slate-900/90 px-3.5 py-2 rounded-xl border border-white/10 text-slate-300 self-start sm:self-auto">
                  Budget: <strong className="text-[#08D9D6]">GH₵ {activeRequest?.budgetMin?.toLocaleString()} - GH₵ {activeRequest?.budgetMax?.toLocaleString()} / mo</strong>
                </div>
              </div>

              {/* Status Timeline Bar */}
              <div className="pt-2">
                <div className="text-xs font-semibold text-slate-400 mb-4">Goodlucks Verification & Match Pipeline</div>
                
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  {TIMELINE_STEPS.map((step, idx) => {
                    const status = getStepStatus(step.key);
                    return (
                      <div 
                        key={step.key} 
                        className={`p-4 rounded-2xl border transition-all ${
                          status === 'completed'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : status === 'current'
                            ? 'bg-[#08D9D6]/20 border-[#08D9D6] text-[#08D9D6] shadow-lg shadow-[#08D9D6]/10'
                            : 'bg-slate-900/50 border-white/5 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider">Step 0{idx + 1}</span>
                          {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                          {status === 'current' && <Clock className="w-4 h-4 text-[#08D9D6] animate-pulse" />}
                        </div>
                        <div className="font-bold text-xs text-white">{step.label}</div>
                        <div className="text-[10px] text-slate-400 mt-1">{step.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Intermediary Note */}
              <div className="bg-[#08D9D6]/10 border border-[#08D9D6]/30 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-200">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-[#08D9D6] shrink-0" />
                  <span>Assigned Field Intermediary: <strong className="text-white">{activeRequest?.assignedAgent || 'Michael Quarshie (Goodlucks Lead Agent)'}</strong></span>
                </div>
                <button 
                  onClick={() => setActiveTab('matches')}
                  className="text-[#08D9D6] font-bold underline hover:text-white shrink-0"
                >
                  Explore Matched Homes →
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Matched Properties */}
          {activeTab === 'matches' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">AI Matched Properties for You</h2>
                  <p className="text-xs text-slate-400">Verified homes matching your target location and budget</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#08D9D6]/20 text-[#08D9D6] text-xs font-bold border border-[#08D9D6]/30">
                  {matchedProps.length} Verified Matches
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
                {matchedProps.map(property => (
                  <div key={property.id} className="relative">
                    <div className="absolute top-3 left-3 z-20 bg-emerald-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-md shadow-md flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      96% AI Match
                    </div>
                    <PropertyCard property={property} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: Viewing Schedule */}
          {activeTab === 'viewings' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white">Scheduled Physical Viewings</h2>

              {myViewings.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myViewings.map(v => (
                    <div key={v.id} className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-3 shadow-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-[#08D9D6] tracking-wider">Scheduled Viewing</span>
                          <h3 className="text-base font-bold text-white">{v.propertyTitle}</h3>
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-[#08D9D6]" /> {v.propertyLocation}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {v.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/80 p-3 rounded-xl border border-white/5">
                        <div>
                          <div className="text-slate-400">Date & Time</div>
                          <div className="font-bold text-white">{v.date} at {v.time}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Viewing Fee (GH₵ 100)</div>
                          <div className="font-bold text-[#08D9D6]">
                            {v.viewingFeePaid ? 'Paid On Site' : 'Pay On Site to Agent'}
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-slate-300 flex items-center justify-between pt-1">
                        <span>Agent: <strong className="text-white">{v.assignedAgent}</strong></span>
                        <button 
                          onClick={() => navigateToProperty(v.propertyId)}
                          className="text-[#08D9D6] font-semibold hover:underline"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-slate-900/50 rounded-3xl border border-white/10">
                  <Calendar className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                  <div className="text-base font-bold text-white">No Scheduled Viewings Yet</div>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">Browse properties and click "Request Viewing" to book a physical tour.</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Saved Properties */}
          {activeTab === 'saved' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white">Saved Favorite Properties</h2>
              {savedProps.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
                  {savedProps.map(property => (
                    <PropertyCard key={property.id} property={property} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-slate-900/50 rounded-3xl border border-white/10">
                  <Heart className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                  <div className="text-base font-bold text-white">No Saved Properties</div>
                  <p className="text-xs text-slate-400 mt-1">Click the heart icon on any property card to save it here.</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 5: Profile Management */}
          {activeTab === 'profile' && (
            <div className="max-w-2xl bg-slate-900/80 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-[#08D9D6]" />
                  Tenant Profile Management
                </h2>
                {saveSuccess && (
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Saved & Resend Email Sent
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Phone Number</label>
                    <input
                      type="tel"
                      required
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                    <input
                      type="email"
                      required
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Current Address in Ghana</label>
                  <input
                    type="text"
                    value={profileAddress}
                    onChange={(e) => setProfileAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-sm hover:bg-[#08D9D6]/90 transition-all shadow-lg shadow-[#08D9D6]/20"
                >
                  Save Profile Details
                </button>
              </form>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

