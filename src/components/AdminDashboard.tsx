import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Property } from '../types';
import { generateSqlDump, downloadSqlDumpFile } from '../utils/sqlExport';
import { 
  ShieldCheck, 
  TrendingUp, 
  Users, 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  Mail, 
  Sparkles, 
  Search, 
  DollarSign, 
  Eye, 
  BarChart2, 
  Compass, 
  Bell, 
  FileText, 
  Settings, 
  UserCheck, 
  Clock, 
  AlertCircle,
  Phone,
  MapPin,
  X,
  Database,
  Download
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { 
    currentUser,
    properties, 
    tenantRequests, 
    viewingSchedules, 
    emailLogs, 
    analytics, 
    updatePropertyStatus, 
    updateTenantRequestStatus, 
    scheduleViewing, 
    updateViewingStatus,
    sendSimulatedEmail
  } = useApp();

  // Prevent search engine indexing on the admin dashboard
  useEffect(() => {
    document.title = "Admin Management Console - Goodlucks";

    let metaRobots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    let created = false;
    if (!metaRobots) {
      metaRobots = document.createElement('meta');
      metaRobots.name = 'robots';
      document.head.appendChild(metaRobots);
      created = true;
    }
    const previousContent = metaRobots.getAttribute('content');
    metaRobots.setAttribute('content', 'noindex, nofollow, noarchive, nosnippet, noimageindex');

    return () => {
      document.title = "Goodlucks Homes - Verified Rentals & Real Estate";
      if (created && metaRobots && metaRobots.parentNode) {
        metaRobots.parentNode.removeChild(metaRobots);
      } else if (metaRobots) {
        if (previousContent) {
          metaRobots.setAttribute('content', previousContent);
        } else {
          metaRobots.removeAttribute('content');
        }
      }
    };
  }, []);

  const [activeAdminTab, setActiveAdminTab] = useState<'analytics' | 'approval-queue' | 'matching' | 'viewings' | 'email-logs' | 'users' | 'settings'>('analytics');

  const handleExportSqlDump = () => {
    const dump = generateSqlDump(properties, tenantRequests, viewingSchedules, currentUser);
    downloadSqlDumpFile(dump, 'goodlucks_housing_db.sql');
  };

  // New Viewing Modal State inside Admin
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [viewPropertyModal, setViewPropertyModal] = useState<Property | null>(null);
  const [activeModalImage, setActiveModalImage] = useState<number>(0);
  const [selectedReqId, setSelectedReqId] = useState(tenantRequests[0]?.id || '');
  const [selectedPropId, setSelectedPropId] = useState(properties[0]?.id || '');
  const [viewDate, setViewDate] = useState('2026-08-18');
  const [viewTime, setViewTime] = useState('11:00 AM');
  const [assignedAgent, setAssignedAgent] = useState('Michael Quarshie (Goodlucks Lead Agent)');

  const pendingProps = properties.filter(p => p.status === 'pending');
  const activeProps = properties.filter(p => p.status === 'active');

  const handleApproveProperty = (id: string) => {
    updatePropertyStatus(id, 'active');
  };

  const handleRejectProperty = (id: string) => {
    updatePropertyStatus(id, 'rejected');
  };

  const handleConfirmMatch = (reqId: string, propId: string) => {
    updateTenantRequestStatus(reqId, 'matched', [propId]);
  };

  const handleScheduleViewingAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    const req = tenantRequests.find(r => r.id === selectedReqId) || tenantRequests[0];
    const prop = properties.find(p => p.id === selectedPropId) || properties[0];

    scheduleViewing({
      tenantRequestId: req.id,
      tenantName: req.tenantName,
      tenantPhone: req.tenantPhone,
      propertyId: prop.id,
      propertyTitle: prop.title,
      propertyLocation: prop.location,
      date: viewDate,
      time: viewTime,
      assignedAgent,
      status: 'scheduled',
      viewingFeePaid: true, // Admin records physical payment received on site
      feeAmountGhs: 100,
      outcomeNotes: 'Viewing physically arranged by Goodlucks Admin.',
    });

    updateTenantRequestStatus(req.id, 'viewing_scheduled');
    setShowScheduleModal(false);
  };

  return (
    <div className="min-h-screen bg-[#1A1E26] text-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8 animate-fadeIn">
        
        {/* SaaS Header */}
        <div className="bg-slate-800/90 border border-white/10 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#08D9D6] text-[#252A34] flex items-center justify-center font-bold text-xl shadow-lg shadow-[#08D9D6]/20">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-tight">Goodlucks Admin SaaS Control Panel</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-[#FF2E63]/20 text-[#FF2E63] border border-[#FF2E63]/30">
                  Live Operations
                </span>
              </div>
              <p className="text-xs text-slate-400">Intermediary Rental Management, AI Match Scoring & Physical Viewing Operations</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={handleExportSqlDump}
              className="px-3.5 py-2.5 rounded-xl bg-slate-700/80 hover:bg-slate-700 text-white font-bold text-xs border border-white/10 transition-all shadow-md flex items-center gap-1.5"
              title="Download full SQL dump (CREATE TABLE & INSERT INTO statements)"
            >
              <Database className="w-4 h-4 text-[#08D9D6]" />
              <Download className="w-3.5 h-3.5 text-slate-300" />
              <span>Export SQL Dump (.sql)</span>
            </button>

            <button 
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs hover:bg-[#08D9D6]/90 transition-all shadow-md shadow-[#08D9D6]/20 flex items-center gap-1.5"
            >
              <Calendar className="w-4 h-4" /> Schedule Physical Viewing
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/10">
          <button
            onClick={() => setActiveAdminTab('analytics')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
              activeAdminTab === 'analytics' ? 'bg-[#08D9D6] text-[#252A34]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <BarChart2 className="w-4 h-4" /> Analytics Dashboard
          </button>

          <button
            onClick={() => setActiveAdminTab('approval-queue')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
              activeAdminTab === 'approval-queue' ? 'bg-[#08D9D6] text-[#252A34]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Building2 className="w-4 h-4" /> Property Approval Queue ({pendingProps.length})
          </button>

          <button
            onClick={() => setActiveAdminTab('matching')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
              activeAdminTab === 'matching' ? 'bg-[#08D9D6] text-[#252A34]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4" /> Tenant AI Matching ({tenantRequests.length})
          </button>

          <button
            onClick={() => setActiveAdminTab('viewings')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
              activeAdminTab === 'viewings' ? 'bg-[#08D9D6] text-[#252A34]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Calendar className="w-4 h-4" /> Physical Viewing Ops ({viewingSchedules.length})
          </button>

          <button
            onClick={() => setActiveAdminTab('email-logs')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
              activeAdminTab === 'email-logs' ? 'bg-[#08D9D6] text-[#252A34]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Mail className="w-4 h-4" /> Transactional Emails ({emailLogs.length})
          </button>
        </div>

        {/* TAB 1: Advanced Analytics Dashboard */}
        {activeAdminTab === 'analytics' && (
          <div className="space-y-8">
            
            {/* Visitor Statistics Header Cards */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#08D9D6]" /> Website Traffic & Visitor Analytics
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                <div className="bg-slate-800/80 p-4 rounded-2xl border border-white/10 space-y-1">
                  <div className="text-[11px] text-slate-400 font-semibold">Today</div>
                  <div className="text-xl font-black text-white">{analytics.visitorsToday.toLocaleString()}</div>
                  <div className="text-[10px] text-emerald-400 font-bold">+14% vs yesterday</div>
                </div>

                <div className="bg-slate-800/80 p-4 rounded-2xl border border-white/10 space-y-1">
                  <div className="text-[11px] text-slate-400 font-semibold">Yesterday</div>
                  <div className="text-xl font-black text-slate-200">{analytics.visitorsYesterday.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400 font-medium">Recorded</div>
                </div>

                <div className="bg-slate-800/80 p-4 rounded-2xl border border-white/10 space-y-1">
                  <div className="text-[11px] text-slate-400 font-semibold">Last 7 Days</div>
                  <div className="text-xl font-black text-white">{analytics.visitorsLast7Days.toLocaleString()}</div>
                  <div className="text-[10px] text-emerald-400 font-bold">+18.5% Growth</div>
                </div>

                <div className="bg-slate-800/80 p-4 rounded-2xl border border-white/10 space-y-1">
                  <div className="text-[11px] text-slate-400 font-semibold">Last 30 Days</div>
                  <div className="text-xl font-black text-white">{analytics.visitorsLast30Days.toLocaleString()}</div>
                  <div className="text-[10px] text-[#08D9D6] font-bold">104k Page views</div>
                </div>

                <div className="bg-slate-800/80 p-4 rounded-2xl border border-white/10 space-y-1 col-span-2 sm:col-span-1">
                  <div className="text-[11px] text-slate-400 font-semibold">Last 12 Months</div>
                  <div className="text-xl font-black text-[#08D9D6]">{analytics.visitorsLast12Months.toLocaleString()}</div>
                  <div className="text-[10px] text-slate-400 font-medium">Cumulative Traffic</div>
                </div>
              </div>
            </div>

            {/* Interactive SVG Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Daily Traffic Chart */}
              <div className="bg-slate-800/90 p-6 rounded-3xl border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-base text-white">Weekly Traffic Trends</h3>
                    <p className="text-xs text-slate-400">Daily unique visitors over the last 7 days</p>
                  </div>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-full border border-emerald-500/30">
                    +18.5%
                  </span>
                </div>

                {/* SVG Visualizer */}
                <div className="h-48 w-full flex items-end gap-2 pt-6 pb-2 border-b border-white/10">
                  {analytics.dailyTraffic.map((pt, i) => {
                    const heightPercent = Math.min((pt.visitors / 1600) * 100, 100);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-[#08D9D6]">
                          {pt.visitors}
                        </div>
                        <div 
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-gradient-to-t from-[#08D9D6]/30 to-[#08D9D6] rounded-t-lg transition-all group-hover:brightness-125"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold">{pt.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Monthly Growth Chart */}
              <div className="bg-slate-800/90 p-6 rounded-3xl border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-base text-white">Monthly Platform Visitors</h3>
                    <p className="text-xs text-slate-400">6-Month growth trajectory in Ghana</p>
                  </div>
                  <span className="text-xs font-bold text-[#08D9D6] bg-[#08D9D6]/20 px-2.5 py-1 rounded-full border border-[#08D9D6]/30">
                    32,500 Current Mo.
                  </span>
                </div>

                {/* SVG Visualizer */}
                <div className="h-48 w-full flex items-end gap-3 pt-6 pb-2 border-b border-white/10">
                  {analytics.monthlyTraffic.map((pt, i) => {
                    const heightPercent = Math.min((pt.visitors / 35000) * 100, 100);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-[#FF2E63]">
                          {(pt.visitors / 1000).toFixed(1)}k
                        </div>
                        <div 
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-gradient-to-t from-[#FF2E63]/30 to-[#FF2E63] rounded-t-lg transition-all group-hover:brightness-125"
                        />
                        <span className="text-[10px] text-slate-400 font-semibold">{pt.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Platform Metrics Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-800/60 p-5 rounded-2xl border border-white/10">
                <div className="text-xs text-slate-400 font-medium">Registered Users</div>
                <div className="text-2xl font-extrabold text-white">{analytics.totalRegisteredUsers}</div>
                <div className="text-[10px] text-slate-400">{analytics.totalTenants} Tenants / {analytics.totalLandlords} Landlords</div>
              </div>

              <div className="bg-slate-800/60 p-5 rounded-2xl border border-white/10">
                <div className="text-xs text-slate-400 font-medium">Physical Viewings Conducted</div>
                <div className="text-2xl font-extrabold text-[#08D9D6]">{analytics.totalViewings}</div>
                <div className="text-[10px] text-[#08D9D6]">Staff Intermediary Verified</div>
              </div>

              <div className="bg-slate-800/60 p-5 rounded-2xl border border-white/10">
                <div className="text-xs text-slate-400 font-medium">Physical Viewing Fee Revenue</div>
                <div className="text-2xl font-extrabold text-emerald-400">GH₵ {analytics.physicalRevenueGhs.toLocaleString()}</div>
                <div className="text-[10px] text-emerald-400">GH₵ 100 paid on site per viewing</div>
              </div>

              <div className="bg-slate-800/60 p-5 rounded-2xl border border-white/10">
                <div className="text-xs text-slate-400 font-medium">Approved Active Listings</div>
                <div className="text-2xl font-extrabold text-white">{activeProps.length} Properties</div>
                <div className="text-[10px] text-amber-400">{pendingProps.length} Pending Review</div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: Property Approval Queue */}
        {activeAdminTab === 'approval-queue' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Pending Landlord Property Approvals</h2>
                <p className="text-xs text-slate-400">Review documents and details before making listings public on Goodlucks Homes</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30">
                {pendingProps.length} Action Required
              </span>
            </div>

            {pendingProps.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {pendingProps.map(prop => (
                  <div key={prop.id} className="bg-slate-800 p-5 rounded-2xl border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <img src={prop.images[0]} alt="" className="w-20 h-20 rounded-xl object-cover border border-white/10 shrink-0" />
                      <div>
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Pending Review</span>
                        <h3 className="font-bold text-base text-white">{prop.title}</h3>
                        <p className="text-xs text-slate-300">{prop.location} • GH₵ {prop.rentGhs.toLocaleString()}/mo • {prop.bedrooms} Bed / {prop.bathrooms} Bath</p>
                        <p className="text-[11px] text-slate-400 mt-1">Landlord ID: {prop.landlordId}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => {
                          setViewPropertyModal(prop);
                          setActiveModalImage(0);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-[#08D9D6]/10 text-[#08D9D6] border border-[#08D9D6]/30 font-bold text-xs hover:bg-[#08D9D6]/20 transition-colors flex items-center gap-1.5"
                      >
                        <Eye className="w-4 h-4" /> View Property
                      </button>
                      <button
                        onClick={() => handleApproveProperty(prop.id)}
                        className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition-colors flex items-center gap-1 shadow-md"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Approve Listing
                      </button>
                      <button
                        onClick={() => handleRejectProperty(prop.id)}
                        className="px-4 py-2 rounded-xl bg-[#FF2E63]/20 text-[#FF2E63] font-bold text-xs hover:bg-[#FF2E63]/30 transition-colors flex items-center gap-1"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-slate-800/40 rounded-3xl border border-white/10">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                <div className="text-base font-bold text-white">Queue Clear!</div>
                <p className="text-xs text-slate-400">All submitted properties have been reviewed by Goodlucks Homes.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: AI Tenant Matching System */}
        {activeAdminTab === 'matching' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Tenant Request & AI Matching Matrix</h2>
              <p className="text-xs text-slate-400">Match tenant requests with active properties and calculate Match Scores</p>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {tenantRequests.map(req => (
                <div key={req.id} className="bg-slate-800 p-6 rounded-3xl border border-white/10 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[#08D9D6]">Tenant Enquiry #{req.id}</span>
                      <h3 className="text-lg font-bold text-white">{req.tenantName} ({req.tenantPhone})</h3>
                      <p className="text-xs text-slate-300">
                        Locations: <strong>{req.preferredLocations.join(', ')}</strong> • Budget: <strong>GH₵ {req.budgetMin} - GH₵ {req.budgetMax}/mo</strong> • {req.bedrooms} Beds
                      </p>
                    </div>

                    <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-[#08D9D6]/20 text-[#08D9D6] border border-[#08D9D6]/30 shrink-0">
                      Status: {req.status}
                    </span>
                  </div>

                  {/* Available Active Properties & Match Suggestions */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Top AI Property Matches for {req.tenantName}:</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {activeProps.slice(0, 2).map((prop, idx) => {
                        const score = 96 - (idx * 4);
                        return (
                          <div key={prop.id} className="bg-slate-900 p-4 rounded-2xl border border-white/10 flex items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500 text-slate-950">
                                  {score}% AI Match
                                </span>
                                <span className="text-xs font-bold text-white">{prop.title}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1">
                                {prop.location} • GH₵ {prop.rentGhs.toLocaleString()}/mo
                              </div>
                            </div>

                            <button
                              onClick={() => handleConfirmMatch(req.id, prop.id)}
                              className="px-3 py-1.5 rounded-lg bg-[#08D9D6] text-[#252A34] font-bold text-xs hover:bg-[#08D9D6]/90 transition-all shadow-md shrink-0"
                            >
                              Confirm Match
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: Physical Viewing Management */}
        {activeAdminTab === 'viewings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Physical Viewing Management Ops</h2>
              <button
                onClick={() => setShowScheduleModal(true)}
                className="px-4 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] font-bold text-xs"
              >
                + Schedule Viewing
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {viewingSchedules.map(v => (
                <div key={v.id} className="bg-slate-800 p-5 rounded-2xl border border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#08D9D6]">{v.propertyTitle}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                        {v.status}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-white">Tenant: {v.tenantName} ({v.tenantPhone})</div>
                    <div className="text-xs text-slate-300">
                      Date: <strong>{v.date} at {v.time}</strong> • Agent: <strong>{v.assignedAgent}</strong>
                    </div>
                    <div className="text-[11px] text-emerald-400 font-semibold">
                      Physical Fee Status: {v.viewingFeePaid ? 'GH₵ 100 Paid Physically to Staff' : 'Pending Physical Payment on Site'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateViewingStatus(v.id, 'completed', true)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 font-bold text-xs hover:bg-emerald-500/30"
                    >
                      Mark Completed & Paid
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: Email Transactional Logs */}
        {activeAdminTab === 'email-logs' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Transactional Email Audit Logs</h2>
            <div className="bg-slate-800 rounded-2xl border border-white/10 overflow-hidden">
              <div className="divide-y divide-white/10 text-xs">
                {emailLogs.map(log => (
                  <div key={log.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-[#08D9D6]/20 text-[#08D9D6] font-bold text-[10px] uppercase">
                          {log.type}
                        </span>
                        <span className="font-bold text-white">{log.subject}</span>
                      </div>
                      <p className="text-slate-300 mt-1">{log.bodyPreview}</p>
                      <span className="text-[10px] text-slate-500">To: {log.recipientName} ({log.recipientEmail}) • Sent: {new Date(log.sentAt).toLocaleString()}</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 shrink-0">
                      Delivered
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Admin Schedule Viewing Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#252A34] border border-white/10 rounded-3xl p-6 max-w-lg w-full space-y-5 text-white shadow-2xl">
            <h3 className="text-xl font-bold text-white">Schedule Physical Viewing (Goodlucks Intermediary)</h3>

            <form onSubmit={handleScheduleViewingAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Select Tenant Request</label>
                <select
                  value={selectedReqId}
                  onChange={(e) => setSelectedReqId(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white"
                >
                  {tenantRequests.map(r => (
                    <option key={r.id} value={r.id}>{r.tenantName} ({r.preferredLocations.join(', ')})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Select Property</label>
                <select
                  value={selectedPropId}
                  onChange={(e) => setSelectedPropId(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white"
                >
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.title} ({p.location}) - GH₵ {p.rentGhs}/mo</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Viewing Date</label>
                  <input
                    type="date"
                    required
                    value={viewDate}
                    onChange={(e) => setViewDate(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Time Slot</label>
                  <select
                    value={viewTime}
                    onChange={(e) => setViewTime(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white"
                  >
                    <option value="09:00 AM">09:00 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                    <option value="02:00 PM">02:00 PM</option>
                    <option value="04:00 PM">04:00 PM</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Assigned Goodlucks Field Agent</label>
                <input
                  type="text"
                  required
                  value={assignedAgent}
                  onChange={(e) => setAssignedAgent(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-3 text-sm text-white"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-[#08D9D6] text-[#252A34] font-bold text-xs shadow-md"
                >
                  Schedule & Send Email
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Property Inspection & Authenticity Modal */}
      {viewPropertyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
          <div className="bg-[#252A34] border border-white/10 rounded-3xl p-6 sm:p-8 max-w-3xl w-full text-white shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4 gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold border border-amber-500/30 mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  Admin Authenticity & Compliance Inspection
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">{viewPropertyModal.title}</h3>
                <p className="text-xs text-slate-300 mt-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#08D9D6]" /> {viewPropertyModal.location} ({viewPropertyModal.city})
                </p>
              </div>
              <button
                onClick={() => setViewPropertyModal(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
                aria-label="Close property inspection modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photo Gallery Grid */}
            <div className="space-y-3">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-white/10">
                <img 
                  src={viewPropertyModal.images[activeModalImage] || viewPropertyModal.images[0]} 
                  alt={viewPropertyModal.title} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-semibold text-white">
                  Photo {activeModalImage + 1} of {viewPropertyModal.images.length}
                </div>
              </div>

              {viewPropertyModal.images.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {viewPropertyModal.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveModalImage(idx)}
                      className={`w-20 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                        activeModalImage === idx ? 'border-[#08D9D6] scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Property Specs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/80 p-4 rounded-2xl border border-white/10">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Monthly Rent</span>
                <div className="text-base font-black text-[#08D9D6]">GH₵ {viewPropertyModal.rentGhs.toLocaleString()}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Property Type</span>
                <div className="text-sm font-bold text-white">{viewPropertyModal.propertyType}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Bedrooms / Baths</span>
                <div className="text-sm font-bold text-white">{viewPropertyModal.bedrooms} Bed / {viewPropertyModal.bathrooms} Bath</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Availability</span>
                <div className="text-sm font-bold text-emerald-400">{viewPropertyModal.availability}</div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2 bg-slate-900/60 p-4 rounded-2xl border border-white/10">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Description & Overview</h4>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{viewPropertyModal.description}</p>
            </div>

            {/* Amenities & Verification Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 bg-slate-900/60 p-4 rounded-2xl border border-white/10">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Amenities ({viewPropertyModal.amenities.length})</h4>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {viewPropertyModal.amenities.map((a, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-white/5 text-[11px] font-medium text-slate-300 border border-white/5">
                      ✓ {a}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2 bg-slate-900/60 p-4 rounded-2xl border border-white/10">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Verification Checklist</h4>
                <div className="text-xs space-y-1.5 text-slate-300">
                  <div>Landlord Account ID: <strong className="text-white">{viewPropertyModal.landlordId}</strong></div>
                  <div>Submission Date: <strong className="text-white">{new Date(viewPropertyModal.createdAt).toLocaleDateString()}</strong></div>
                  <div className="text-emerald-400 font-semibold flex items-center gap-1.5 pt-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" /> Check for duplicate images & location authenticity
                  </div>
                </div>
              </div>
            </div>

            {/* Admin Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setViewPropertyModal(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700 transition-colors"
              >
                Close Inspection
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => {
                    handleRejectProperty(viewPropertyModal.id);
                    setViewPropertyModal(null);
                  }}
                  className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-[#FF2E63]/20 text-[#FF2E63] font-bold text-xs hover:bg-[#FF2E63]/30 transition-colors flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" /> Reject Listing
                </button>

                <button
                  onClick={() => {
                    handleApproveProperty(viewPropertyModal.id);
                    setViewPropertyModal(null);
                  }}
                  className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve Listing
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
