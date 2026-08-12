import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Building2, 
  PlusCircle, 
  Edit, 
  CheckCircle2, 
  Trash2, 
  Power, 
  Calendar, 
  User, 
  Phone, 
  Mail, 
  ShieldCheck, 
  AlertTriangle,
  Activity,
  Bell,
  Sparkles,
  ChevronRight,
  Check,
  FileCheck,
  FileText,
  Receipt
} from 'lucide-react';

export const LandlordDashboard: React.FC = () => {
  const { 
    currentUser, 
    properties, 
    updatePropertyStatus, 
    deleteProperty, 
    setCurrentView,
    updateUserProfile,
    viewingSchedules,
    notifications
  } = useApp();

  const [activeTab, setActiveTab] = useState<'my-properties' | 'viewings' | 'profile'>('my-properties');
  const [deleteModalPropId, setDeleteModalPropId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Landlord Profile Edit
  const [profileName, setProfileName] = useState(currentUser?.name || 'Abena Osei');
  const [profileCompany, setProfileCompany] = useState(currentUser?.company || 'Prime Haven Properties Ltd');
  const [profilePhone, setProfilePhone] = useState(currentUser?.phone || '+233 20 899 7711');
  const [profileEmail, setProfileEmail] = useState(currentUser?.email || 'landlord@goodlucks.com');
  const [profileBio, setProfileBio] = useState(currentUser?.bio || 'Premier luxury developer in Greater Accra.');

  // My Properties
  const myProperties = properties.filter(p => p.landlordId === currentUser?.id || currentUser?.role === 'landlord');

  const totalViews = myProperties.reduce((acc, p) => acc + (p.viewsCount || 0), 0);

  const handleDeleteConfirm = () => {
    if (deleteModalPropId) {
      deleteProperty(deleteModalPropId);
      setDeleteModalPropId(null);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserProfile({
      name: profileName,
      company: profileCompany,
      phone: profilePhone,
      email: profileEmail,
      bio: profileBio,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const landlordNotifications = notifications.slice(0, 3);

  return (
    <div className="min-h-screen bg-[#1F242D] text-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
        
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] text-xs font-bold border border-[#08D9D6]/20 mb-1">
              <Activity className="w-3.5 h-3.5" />
              Landlord Command Center
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Welcome back, {currentUser?.name?.split(' ')[0] || 'Abena'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-[#08D9D6] bg-[#08D9D6]/10 px-3 py-1.5 rounded-full border border-[#08D9D6]/30 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-[#08D9D6]" />
              Verified Landlord Partner
            </span>
          </div>
        </div>

        {/* ================= BENTO GRID LEVEL 1: TOP 3 DISTINCT GLASSMORPHIC CARDS ================= */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6">
          
          {/* Bento Card 1: Landlord Profile Glassmorphic Card (Col 6) */}
          <div className="md:col-span-6 bg-[#252A34]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl hover:border-white/20 transition-all flex flex-col justify-between space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <img 
                    src={currentUser?.avatar || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80'} 
                    alt={currentUser?.name}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-[#08D9D6] shadow-xl" 
                  />
                  <div className="absolute -bottom-1 -right-1 bg-[#08D9D6] text-[#252A34] p-1 rounded-lg text-[10px] font-black">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-white">{currentUser?.name || 'Abena Osei'}</h2>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Landlord
                    </span>
                  </div>

                  <p className="text-xs text-[#08D9D6] font-bold">
                    {currentUser?.company || 'Prime Haven Properties Ltd'}
                  </p>

                  <div className="text-xs text-slate-400 flex flex-wrap gap-3 pt-1">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-[#08D9D6]" /> {currentUser?.phone}</span>
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-[#08D9D6]" /> {currentUser?.email}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-300">
              <span className="text-slate-400 truncate max-w-[240px]">{currentUser?.bio || 'Premier luxury developer in Greater Accra.'}</span>
              <button
                onClick={() => setActiveTab('profile')}
                className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shrink-0"
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
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#08D9D6]">Primary Action</span>
                <Sparkles className="w-4 h-4 text-[#08D9D6]" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">List Property Listing</h3>
              <p className="text-xs text-slate-400">Add apartment, villa, or townhome with zero upfront fees.</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setCurrentView('list-property')}
                className="w-full py-2.5 px-3 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-extrabold hover:bg-[#08D9D6]/90 transition-all shadow-lg shadow-[#08D9D6]/20 flex items-center justify-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                <span>List New Property</span>
              </button>

              <button
                onClick={() => setCurrentView('browse')}
                className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-white text-xs font-semibold border border-white/10 transition-colors flex items-center justify-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5 text-[#08D9D6]" />
                <span>View Public Catalog</span>
              </button>

              <button
                onClick={() => setCurrentView('agreements')}
                className="w-full py-2 px-3 rounded-xl bg-[#08D9D6]/10 hover:bg-[#08D9D6]/20 text-[#08D9D6] text-xs font-extrabold border border-[#08D9D6]/30 transition-colors flex items-center justify-center gap-1.5"
              >
                <FileCheck className="w-3.5 h-3.5 text-[#08D9D6]" />
                <span>Agreements & Receipts</span>
              </button>
            </div>
          </div>

          {/* Bento Card 3: Notifications Glassmorphic Card (Col 3) */}
          <div className="md:col-span-3 bg-[#252A34]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col justify-between space-y-3 hover:border-white/20 transition-all">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#08D9D6]" />
                  <span className="text-xs font-bold text-white">Viewing Logs</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#08D9D6]/20 text-[#08D9D6]">
                  {viewingSchedules.length} Active
                </span>
              </div>

              <div className="space-y-2 max-h-[120px] overflow-y-auto pr-1">
                {landlordNotifications.map((notif, idx) => (
                  <div key={idx} className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 space-y-0.5">
                    <div className="text-[11px] font-bold text-white truncate">{notif.title}</div>
                    <div className="text-[10px] text-slate-400 line-clamp-1">{notif.message}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-white/10 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Goodlucks Intermediary</span>
              <span className="text-emerald-400 font-bold">Active</span>
            </div>
          </div>

        </div>

        {/* ================= BENTO GRID LEVEL 2: 4 STATS & HIGHLIGHT GLASS TILES ================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          <button
            onClick={() => setActiveTab('my-properties')}
            className={`p-5 rounded-2xl border text-left transition-all ${
              activeTab === 'my-properties'
                ? 'bg-[#08D9D6]/15 border-[#08D9D6] shadow-lg shadow-[#08D9D6]/10'
                : 'bg-[#252A34]/70 backdrop-blur-xl border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">Total Listings</span>
              <Building2 className="w-4 h-4 text-[#08D9D6]" />
            </div>
            <div className="text-2xl font-black text-white">{myProperties.length}</div>
            <div className="text-[11px] text-[#08D9D6] font-semibold mt-1 flex items-center gap-1">
              <span>Managed via Goodlucks</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </button>

          <button
            onClick={() => setActiveTab('my-properties')}
            className="p-5 rounded-2xl border bg-[#252A34]/70 backdrop-blur-xl border-white/10 hover:border-white/20 text-left transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">Approved & Active</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">
              {myProperties.filter(p => p.status === 'active').length}
            </div>
            <div className="text-[11px] text-emerald-400 font-semibold mt-1">Visible Publicly</div>
          </button>

          <button
            onClick={() => setActiveTab('my-properties')}
            className="p-5 rounded-2xl border bg-[#252A34]/70 backdrop-blur-xl border-white/10 hover:border-white/20 text-left transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">Pending Approval</span>
              <Calendar className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">
              {myProperties.filter(p => p.status === 'pending').length}
            </div>
            <div className="text-[11px] text-amber-400 font-semibold mt-1">Admin Queue</div>
          </button>

          <button
            onClick={() => setActiveTab('my-properties')}
            className="p-5 rounded-2xl border bg-[#252A34]/70 backdrop-blur-xl border-white/10 hover:border-white/20 text-left transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400">Tenant Views</span>
              <Activity className="w-4 h-4 text-[#08D9D6]" />
            </div>
            <div className="text-2xl font-black text-[#08D9D6]">{totalViews}</div>
            <div className="text-[11px] text-slate-300 font-semibold mt-1">Tenant Impressions</div>
          </button>

        </div>

        {/* ================= BENTO GRID LEVEL 3: MAIN DYNAMIC WORKSPACE CARD ================= */}
        <div className="bg-[#252A34]/70 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
          
          {/* Navigation Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/10">
            <button
              onClick={() => setActiveTab('my-properties')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'my-properties' ? 'bg-[#08D9D6] text-[#252A34] shadow-md' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Building2 className="w-4 h-4" /> My Properties ({myProperties.length})
            </button>

            <button
              onClick={() => setActiveTab('viewings')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'viewings' ? 'bg-[#08D9D6] text-[#252A34] shadow-md' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <Calendar className="w-4 h-4" /> Viewing Requests ({viewingSchedules.length})
            </button>

            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                activeTab === 'profile' ? 'bg-[#08D9D6] text-[#252A34] shadow-md' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <User className="w-4 h-4" /> Landlord Profile
            </button>
          </div>

          {/* Tab 1: My Properties Table / Cards */}
          {activeTab === 'my-properties' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Property Listings & Operations</h2>
                <button
                  onClick={() => setCurrentView('list-property')}
                  className="text-xs text-[#08D9D6] font-bold hover:underline flex items-center gap-1"
                >
                  <PlusCircle className="w-4 h-4" /> Add Listing
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {myProperties.map(prop => (
                  <div key={prop.id} className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
                    
                    <div className="flex items-center gap-4">
                      <img 
                        src={prop.images[0] || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=300&q=80'} 
                        alt={prop.title}
                        className="w-20 h-20 rounded-xl object-cover border border-white/10 shrink-0" 
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            prop.status === 'active' 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : prop.status === 'pending'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : prop.status === 'rented'
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-slate-700 text-slate-400'
                          }`}>
                            {prop.status === 'active' ? '● Active' : prop.status === 'pending' ? '⏳ Pending Approval' : prop.status === 'rented' ? '🏠 Rented' : '⏸ Deactivated'}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">{prop.propertyType}</span>
                        </div>

                        <h3 className="font-bold text-base text-white">{prop.title}</h3>
                        <div className="text-xs text-slate-300 font-medium">
                          {prop.location} • <strong className="text-[#08D9D6]">GH₵ {prop.rentGhs.toLocaleString()}/mo</strong>
                        </div>
                      </div>
                    </div>

                    {/* Actions Bar */}
                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-center w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-white/10">
                      {prop.status === 'active' ? (
                        <button
                          onClick={() => updatePropertyStatus(prop.id, 'deactivated')}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 border border-white/5"
                          title="Deactivate temporarily"
                        >
                          <Power className="w-3.5 h-3.5" /> Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => updatePropertyStatus(prop.id, 'active')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs font-semibold flex items-center gap-1 border border-emerald-500/30"
                          title="Reactivate listing"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Activate
                        </button>
                      )}

                      <button
                        onClick={() => updatePropertyStatus(prop.id, 'rented')}
                        className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-xs font-semibold flex items-center gap-1 border border-blue-500/30"
                      >
                        Mark Rented
                      </button>

                      <button
                        onClick={() => setDeleteModalPropId(prop.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#FF2E63]/20 text-[#FF2E63] hover:bg-[#FF2E63]/30 text-xs font-semibold flex items-center gap-1 border border-[#FF2E63]/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: Viewing Requests */}
          {activeTab === 'viewings' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white">Goodlucks Intermediary Viewing Logs</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {viewingSchedules.map(v => (
                  <div key={v.id} className="bg-slate-900/80 p-5 rounded-2xl border border-white/10 space-y-2 shadow-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-bold text-[#08D9D6]">{v.propertyTitle}</div>
                        <div className="text-xs text-slate-300 font-medium">Scheduled for: {v.date} at {v.time}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {v.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Handled by Goodlucks Field Agent: <strong className="text-white">{v.assignedAgent}</strong>. Physical viewing fee status: <strong className="text-emerald-400">{v.viewingFeePaid ? 'Paid On Site' : 'Pending Physical Payment'}</strong>.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: Profile */}
          {activeTab === 'profile' && (
            <div className="max-w-2xl bg-slate-900/80 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-[#08D9D6]" />
                  Landlord Profile Management
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

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Company / Agency Name (Optional)</label>
                  <input
                    type="text"
                    value={profileCompany}
                    onChange={(e) => setProfileCompany(e.target.value)}
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Landlord Bio / Overview</label>
                  <textarea
                    rows={3}
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-sm hover:bg-[#08D9D6]/90 transition-all shadow-lg shadow-[#08D9D6]/20"
                >
                  Save Landlord Profile
                </button>
              </form>
            </div>
          )}

        </div>

      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalPropId && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md animate-fadeIn p-2 sm:p-4 flex items-start sm:items-center justify-center">
          <div 
            className="bg-[#252A34] border border-[#FF2E63]/40 rounded-2xl sm:rounded-3xl p-5 sm:p-6 max-w-md w-full text-center space-y-4 shadow-2xl my-auto max-h-[88dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-[#FF2E63]/20 text-[#FF2E63] border border-[#FF2E63]/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Delete Property Listing?</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete this property? This action cannot be undone and will remove it from Goodlucks Homes platform.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeleteModalPropId(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="flex-1 py-2.5 rounded-xl bg-[#FF2E63] text-white font-bold text-xs hover:bg-[#FF2E63]/90 shadow-md"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

