import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { PropertyCard } from './PropertyCard';
import { PropertyCardGrid } from './PropertyCardGrid';
import { ViewingRequestModal } from './ViewingRequestModal';
import { GetNotifiedModal } from './GetNotifiedModal';
import { SEOHead } from './SEOHead';
import { SITE_ORIGIN } from '../config/site';
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
    "@type": "Organization",
    "name": "Goodlucks Homes",
    "url": `${SITE_ORIGIN}/`,
    "logo": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80",
    "description": "Property discovery and rental intermediary connecting tenants with landlords and agents in Greater Accra, Ghana.",
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
        title="Goodlucks Homes - Rentals & Real Estate in Greater Accra, Ghana"
        description="Find rental apartments, houses and commercial property in Accra, Ghana. Listings are submitted by registered landlords and agents, reviewed before publishing, and viewings are arranged through Goodlucks Homes."
        keywords="rentals Accra, homes for rent Ghana, East Legon apartments, Cantonments luxury homes, Airport Residential rental, Goodlucks Homes"
        jsonLd={homeJsonLd}
      />
      
      {/* 1. HERO SECTION */}
      <section className="relative pt-12 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        
        {/* Glow backdrop */}
        <div className="relative text-center max-w-3xl mx-auto space-y-6">
          
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface border border-line text-xs font-semibold text-ink/80">
            <span className="w-2 h-2 rounded-full bg-interactive" />
            Property discovery and viewing arrangements · Accra
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-ink tracking-tight leading-tight">
            Find Your <span className="text-accent">Perfect Home</span>
          </h1>

          <p className="text-sm sm:text-base text-ink/70 max-w-xl mx-auto leading-relaxed">
            Goodlucks Homes connects people looking for a home with the landlords and agents who list them. Browse the catalogue, request a viewing, and agree a time with the landlord or agent. Your tenancy agreement is completed directly with them.
          </p>

          {/* Search Control Bar */}
          <div className="bg-surface border border-line p-2 sm:p-3 rounded-2xl sm:rounded-2xl shadow-lg backdrop-blur-xl space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2 text-left">
            
            {/* Search Input */}
            <div className="flex-1 flex items-center gap-2 bg-surface rounded-xl sm:rounded-2xl px-3.5 py-3 border border-line focus-within:border-interactive">
              <Search className="w-5 h-5 text-ink shrink-0" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Cantonments, East Legon, Airport..."
                className="w-full bg-transparent text-sm text-ink placeholder-ink/50 focus:outline-none font-medium"
              />
            </div>

            {/* Location Selector */}
            <div className="flex items-center gap-2 bg-surface rounded-xl sm:rounded-2xl px-3.5 py-3 border border-line">
              <MapPin className="w-4 h-4 text-ink shrink-0" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-transparent text-xs sm:text-sm font-semibold text-ink focus:outline-none cursor-pointer"
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
              className="gl-btn gl-btn-primary w-full sm:w-auto shrink-0"
            >
              <span>Explore</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setCurrentView('browse')}
              className="gl-btn gl-btn-secondary px-5 text-xs"
            >
              <Building2 className="w-4 h-4 text-ink" /> Browse Properties
            </button>
            <button
              onClick={() => setIsNotifiedModalOpen(true)}
              className="gl-btn gl-btn-secondary px-5 text-xs"
            >
              <BellRing className="w-4 h-4" /> Get Search Alerts
            </button>
            <button
              onClick={() => setCurrentView('find-home')}
              className="gl-btn gl-btn-secondary px-5 text-xs"
            >
              <Compass className="w-4 h-4 text-ink" /> Find a Home (matched for you)
            </button>
          </div>

        </div>
      </section>


      {/* 2. FEATURED PROPERTIES (2-CARDS PER ROW ON MOBILE) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-line pb-4">
          <div>
            <div className="text-xs font-extrabold text-ink uppercase tracking-wider">
              Submitted by registered landlords and agents
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-ink">
              Featured properties
            </h2>
          </div>

          <button
            onClick={() => setCurrentView('browse')}
            className="gl-link text-xs font-bold flex items-center gap-1"
          >
            <span>View All ({activeProperties.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* PROPERTY LIST (Upgrade 2, A4): compact horizontal cards in a swipeable
            row on a phone, the existing grid from `sm` upwards. */}
        <PropertyCardGrid
          properties={filteredProperties.slice(0, 8)}
          label="Featured rentals"
          onRequestViewing={(p) => setSelectedViewingProp(p)}
        />

      </section>


      {/* 3. HOW IT WORKS (SIMPLE 3 STEPS) */}
      <section className="bg-surface py-14 px-4 sm:px-6 lg:px-8 border-y border-line">
        <div className="max-w-5xl mx-auto space-y-10 text-center">
          
          <div className="space-y-2">
            <span className="text-xs font-extrabold uppercase text-ink tracking-widest">
              Simple 3-Step Process
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-ink">
              How Goodlucks Homes Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Step 1 */}
            <div className="gl-card gl-card-interactive p-6 text-center space-y-3 relative group">
              <div className="w-12 h-12 rounded-2xl bg-interactive/10 text-ink border border-interactive/20 flex items-center justify-center mx-auto text-xl font-bold">
                <Search className="w-6 h-6" />
              </div>
              <div className="text-xs font-bold text-ink uppercase tracking-wider">Step 1</div>
              <h3 className="text-lg font-bold text-ink">Search</h3>
              <p className="text-xs text-ink/70 leading-relaxed">
                Browse the live listings, or tell us your preferred area, budget and number of bedrooms and we will suggest homes that fit.
              </p>
            </div>

            {/* Step 2 */}
            <div className="gl-card gl-card-interactive p-6 text-center space-y-3 relative group">
              <div className="w-12 h-12 rounded-2xl bg-interactive/10 text-ink border border-interactive/20 flex items-center justify-center mx-auto text-xl font-bold">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="text-xs font-bold text-ink uppercase tracking-wider">Step 2</div>
              <h3 className="text-lg font-bold text-ink">Schedule Viewing</h3>
              <p className="text-xs text-ink/70 leading-relaxed">
                Request a viewing on any listing. The request goes to the landlord or agent responsible for it, and they contact you to agree a time. Nothing is confirmed until you have both agreed.
              </p>
            </div>

            {/* Step 3 */}
            <div className="gl-card gl-card-interactive p-6 text-center space-y-3 relative group">
              <div className="w-12 h-12 rounded-2xl bg-interactive/10 text-ink border border-interactive/20 flex items-center justify-center mx-auto text-xl font-bold">
                <Key className="w-6 h-6" />
              </div>
              <div className="text-xs font-bold text-ink uppercase tracking-wider">Step 3</div>
              <h3 className="text-lg font-bold text-ink">Move In</h3>
              <p className="text-xs text-ink/70 leading-relaxed">
                After the viewing, any viewing fee is paid as the listing states — never online. Your tenancy agreement is completed directly with the landlord or agent, outside the platform.
              </p>
            </div>

          </div>

        </div>
      </section>


      {/* 4. WHY GOODLUCKS HOMES (SHORT POINTS ONLY) */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center space-y-2">
          <span className="text-xs font-extrabold uppercase text-ink tracking-widest">
            The Intermediary Advantage
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-ink">
            Why Choose Goodlucks Homes
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          <div className="gl-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-ink font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>Staff-reviewed listings</span>
            </div>
            <p className="text-xs text-ink/70 leading-relaxed">
              Every listing is checked by Goodlucks staff before it goes live. That check covers the
              listing details and photos only: it is not an ownership check, an inspection of the property
              or a guarantee of its condition.
            </p>
          </div>

          <div className="gl-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-ink font-bold text-sm">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <span>One place to sort it out</span>
            </div>
            <p className="text-xs text-ink/70 leading-relaxed">
              Enquiries, viewing requests and their records stay with Goodlucks Homes, so you are not passed around between unknown contacts.
            </p>
          </div>

          <div className="gl-card p-5 space-y-2">
            <div className="flex items-center gap-2 text-ink font-bold text-sm">
              <Sparkles className="w-5 h-5 shrink-0" />
              <span>Viewing guidance</span>
            </div>
            <p className="text-xs text-ink/70 leading-relaxed">
              Agree the time before you travel, meet the landlord or agent at the property, and view it before you commit to anything. A viewing fee, where one applies, is paid after the viewing — never online.
            </p>
          </div>

        </div>
      </section>


      {/* 5. CALL TO ACTION */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="gl-card border-interactive/60 p-8 sm:p-12 text-center space-y-6 relative overflow-hidden">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-ink tracking-tight">
            Looking for a home? Let us help you.
          </h2>

          <p className="text-sm text-ink/70 max-w-lg mx-auto leading-relaxed">
            Send us your requirements, or call our team in Accra and we will help you find a home that fits.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button
              onClick={() => setCurrentView('find-home')}
              className="gl-btn gl-btn-primary px-8"
            >
              Submit Rental Request
            </button>
            <button
              onClick={() => setCurrentView('browse')}
              className="gl-btn gl-btn-secondary px-8"
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
