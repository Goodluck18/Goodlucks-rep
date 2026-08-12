import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { PropertyCard } from './PropertyCard';
import { ViewingRequestModal } from './ViewingRequestModal';
import { GetNotifiedModal } from './GetNotifiedModal';
import { SEOHead } from './SEOHead';
import { Property } from '../types';
import { 
  Search, 
  MapPin, 
  Compass, 
  ShieldCheck, 
  Calendar, 
  Key, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles,
  Building2,
  SlidersHorizontal,
  BellRing
} from 'lucide-react';

export const HomeView: React.FC = () => {
  const { properties, setCurrentView, navigateToProperty } = useApp();
  
  const [selectedLocation, setSelectedLocation] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedViewingProp, setSelectedViewingProp] = useState<Property | null>(null);
  const [isNotifiedModalOpen, setIsNotifiedModalOpen] = useState(false);

  const activeProperties = properties.filter(p => p.status === 'active');

  const homeJsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    "name": "Goodlucks Homes",
    "url": typeof window !== 'undefined' ? window.location.origin : "https://rent.goodlucks.co",
    "logo": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80",
    "description": "Ghana's premier property matching and verified rental platform in Greater Accra.",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Accra",
      "addressRegion": "Greater Accra",
      "addressCountry": "GH"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 5.6037,
      "longitude": -0.1870
    },
    "telephone": "+233237690080",
    "priceRange": "GH₵ 1000 - 25000"
  };

  // Filter properties for homepage featured grid
  const filteredProperties = activeProperties.filter(p => {
    const matchesLoc = selectedLocation === 'All' || p.location.toLowerCase().includes(selectedLocation.toLowerCase());
    const matchesType = selectedType === 'All' || p.propertyType === selectedType;
    const matchesSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase()) || p.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLoc && matchesType && matchesSearch;
  });

  return (
    <div className="space-y-16 pb-12 animate-fadeIn">
      <SEOHead
        title="Goodlucks Homes - Verified Rentals & Real Estate in Greater Accra, Ghana"
        description="Find 100% verified rental apartments, luxury houses, and commercial properties in Accra, Ghana. Zero fake listings, direct landlord connections & transparent viewing scheduling."
        keywords="rentals Accra, homes for rent Ghana, East Legon apartments, Cantonments luxury homes, Airport Residential rental, Goodlucks Homes"
        jsonLd={homeJsonLd}
      />
      
      {/* 1. HERO SECTION */}
      <section className="relative pt-12 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        
        {/* Glow backdrop */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[600px] h-[300px] sm:h-[400px] bg-gradient-to-tr from-[#08D9D6]/20 to-[#FF2E63]/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative text-center max-w-3xl mx-auto space-y-6">
          
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md text-xs font-semibold text-slate-200">
            <span className="w-2 h-2 rounded-full bg-[#08D9D6] animate-pulse" />
            Ghana’s Premier Intermediary Rental Platform
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.1]">
            Find Your <span className="bg-gradient-to-r from-[#08D9D6] via-teal-200 to-white bg-clip-text text-transparent">Perfect Home</span>
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
            Goodlucks Homes coordinates every enquiry, physical viewing, and tenancy agreement. Rent luxury apartments, villas, and studios in Accra and Kumasi with complete confidence.
          </p>

          {/* Search Control Bar */}
          <div className="bg-[#252A34]/90 border border-white/10 p-2 sm:p-3 rounded-2xl sm:rounded-3xl shadow-2xl backdrop-blur-xl space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2 text-left">
            
            {/* Search Input */}
            <div className="flex-1 flex items-center gap-2 bg-slate-900/90 rounded-xl sm:rounded-2xl px-3.5 py-3 border border-white/5 focus-within:border-[#08D9D6]">
              <Search className="w-5 h-5 text-[#08D9D6] shrink-0" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Cantonments, East Legon, Airport..."
                className="w-full bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none font-medium"
              />
            </div>

            {/* Location Selector */}
            <div className="flex items-center gap-2 bg-slate-900/90 rounded-xl sm:rounded-2xl px-3.5 py-3 border border-white/5">
              <MapPin className="w-4 h-4 text-[#08D9D6] shrink-0" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-transparent text-xs sm:text-sm font-semibold text-white focus:outline-none cursor-pointer"
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

            {/* Search Submit CTA */}
            <button
              onClick={() => setCurrentView('browse')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl sm:rounded-2xl bg-[#08D9D6] text-[#252A34] font-extrabold text-sm hover:bg-[#08D9D6]/90 transition-all shadow-lg shadow-[#08D9D6]/20 flex items-center justify-center gap-2 shrink-0 active:scale-95"
            >
              <span>Explore</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setCurrentView('browse')}
              className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer"
            >
              <Building2 className="w-4 h-4 text-[#08D9D6]" /> Browse Properties
            </button>
            <button
              onClick={() => setIsNotifiedModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-black transition-all shadow-md shadow-[#08D9D6]/20 hover:bg-[#08D9D6]/90 flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <BellRing className="w-4 h-4 animate-pulse" /> Get Search Alerts
            </button>
            <button
              onClick={() => setCurrentView('find-home')}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#08D9D6]/20 to-[#FF2E63]/20 hover:from-[#08D9D6]/30 hover:to-[#FF2E63]/30 text-xs font-bold text-white transition-all border border-[#08D9D6]/30 flex items-center gap-1.5 cursor-pointer"
            >
              <Compass className="w-4 h-4 text-[#08D9D6]" /> Find a Home (AI Match)
            </button>
          </div>

        </div>
      </section>


      {/* 2. FEATURED PROPERTIES (2-CARDS PER ROW ON MOBILE) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <div className="text-xs font-extrabold text-[#08D9D6] uppercase tracking-wider">
              Verified Intermediary Listings
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Featured Luxury Properties
            </h2>
          </div>

          <button
            onClick={() => setCurrentView('browse')}
            className="text-xs font-bold text-[#08D9D6] hover:underline flex items-center gap-1"
          >
            <span>View All ({activeProperties.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* PROPERTY GRID - MUST BE 2 CARDS PER ROW ON MOBILE */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {filteredProperties.slice(0, 8).map(property => (
            <PropertyCard 
              key={property.id} 
              property={property}
              onRequestViewing={(p) => setSelectedViewingProp(p)}
            />
          ))}
        </div>

      </section>


      {/* 3. HOW IT WORKS (SIMPLE 3 STEPS) */}
      <section className="bg-[#1A1E26] py-14 px-4 sm:px-6 lg:px-8 border-y border-white/10">
        <div className="max-w-5xl mx-auto space-y-10 text-center">
          
          <div className="space-y-2">
            <span className="text-xs font-extrabold uppercase text-[#08D9D6] tracking-widest">
              Simple 3-Step Process
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              How Goodlucks Homes Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Step 1 */}
            <div className="bg-[#252A34] p-6 rounded-3xl border border-white/10 text-center space-y-3 relative group hover:border-[#08D9D6]/50 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-[#08D9D6]/10 text-[#08D9D6] border border-[#08D9D6]/20 flex items-center justify-center mx-auto text-xl font-bold">
                <Search className="w-6 h-6" />
              </div>
              <div className="text-xs font-bold text-[#08D9D6] uppercase tracking-wider">Step 1</div>
              <h3 className="text-lg font-bold text-white">Search</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Explore our curated luxury listings or submit your location and budget preferences for AI property matching.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-[#252A34] p-6 rounded-3xl border border-white/10 text-center space-y-3 relative group hover:border-[#08D9D6]/50 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-[#08D9D6]/10 text-[#08D9D6] border border-[#08D9D6]/20 flex items-center justify-center mx-auto text-xl font-bold">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="text-xs font-bold text-[#08D9D6] uppercase tracking-wider">Step 2</div>
              <h3 className="text-lg font-bold text-white">Schedule Viewing</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Goodlucks Homes schedules a guided physical viewing with assigned staff. Viewing fee is paid physically on site.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-[#252A34] p-6 rounded-3xl border border-white/10 text-center space-y-3 relative group hover:border-[#08D9D6]/50 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-[#08D9D6]/10 text-[#08D9D6] border border-[#08D9D6]/20 flex items-center justify-center mx-auto text-xl font-bold">
                <Key className="w-6 h-6" />
              </div>
              <div className="text-xs font-bold text-[#08D9D6] uppercase tracking-wider">Step 3</div>
              <h3 className="text-lg font-bold text-white">Move In</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                We handle the tenancy contract, key transfer, and landlord relationship so you can move into your dream home safely.
              </p>
            </div>

          </div>

        </div>
      </section>


      {/* 4. WHY GOODLUCKS HOMES (SHORT POINTS ONLY) */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-2">
          <span className="text-xs font-extrabold uppercase text-[#08D9D6] tracking-widest">
            The Intermediary Advantage
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-white">
            Why Choose Goodlucks Homes
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          <div className="bg-[#252A34] p-5 rounded-2xl border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-[#08D9D6] font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>Verified Properties</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every listing is inspected for physical quality, power backup, security, and valid documentation.
            </p>
          </div>

          <div className="bg-[#252A34] p-5 rounded-2xl border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-[#08D9D6] font-bold text-sm">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <span>Trusted Assistance</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              We own the customer relationship, ensuring tenants and property owners have a secure, professional experience.
            </p>
          </div>

          <div className="bg-[#252A34] p-5 rounded-2xl border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-[#08D9D6] font-bold text-sm">
              <Sparkles className="w-5 h-5 shrink-0" />
              <span>Easy Viewing Process</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Book tours conveniently with assigned Goodlucks agents. Physical viewing fees are paid directly to staff on site.
            </p>
          </div>

        </div>
      </section>


      {/* 5. CALL TO ACTION */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-[#252A34] via-[#1A1E26] to-[#252A34] border border-[#08D9D6]/30 p-8 sm:p-12 rounded-3xl text-center space-y-6 relative overflow-hidden shadow-2xl">
          <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-[#08D9D6]/10 rounded-full blur-3xl" />

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Looking for a home? Let us help you.
          </h2>

          <p className="text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
            Submit your rental requirements today or speak directly to a Goodlucks Homes property specialist in Accra.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button
              onClick={() => setCurrentView('find-home')}
              className="px-8 py-3.5 rounded-2xl bg-[#08D9D6] text-[#252A34] font-extrabold text-sm hover:bg-[#08D9D6]/90 transition-all shadow-xl shadow-[#08D9D6]/20 active:scale-95"
            >
              Submit Rental Request
            </button>
            <button
              onClick={() => setCurrentView('browse')}
              className="px-8 py-3.5 rounded-2xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all"
            >
              Browse Properties
            </button>
          </div>
        </div>
      </section>

      {/* Viewing Modal */}
      {selectedViewingProp && (
        <ViewingRequestModal 
          property={selectedViewingProp} 
          onClose={() => setSelectedViewingProp(null)} 
        />
      )}

      {/* Get Notified Search Alerts Modal */}
      {isNotifiedModalOpen && (
        <GetNotifiedModal
          onClose={() => setIsNotifiedModalOpen(false)}
          initialFilters={{
            location: selectedLocation,
            propertyType: selectedType,
            searchQuery: searchQuery,
          }}
        />
      )}

    </div>
  );
};
