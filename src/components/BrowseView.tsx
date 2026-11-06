import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { PropertyCard } from './PropertyCard';
import { ViewingRequestModal } from './ViewingRequestModal';
import { GetNotifiedModal } from './GetNotifiedModal';
import { SEOHead } from './SEOHead';
import { Property, PropertyType } from '../types';
import { buildQuery, parseQuery } from '../routing/routes';
import { 
  Search, 
  MapPin, 
  Building2, 
  Building, 
  Home, 
  LayoutGrid, 
  Layers, 
  Sparkles, 
  Briefcase, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  Check,
  RotateCcw,
  SlidersHorizontal,
  Banknote,
  ShieldCheck,
  Bell,
  BellRing,
  Mail
} from 'lucide-react';

interface CategoryItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const CATEGORIES: CategoryItem[] = [
  { id: 'All', label: 'All Properties', icon: Building2 },
  { id: 'Apartment', label: 'Apartments', icon: Building },
  { id: 'Luxury Villa', label: 'Luxury Villas', icon: Home },
  { id: 'Townhouse', label: 'Townhouses', icon: Home },
  { id: 'Studio', label: 'Studios', icon: LayoutGrid },
  { id: 'Duplex', label: 'Duplexes', icon: Layers },
  { id: 'Penthouse', label: 'Penthouses', icon: Sparkles },
  { id: 'Commercial', label: 'Commercial', icon: Briefcase },
];

const MAX_RENT = 25000;

export const BrowseView: React.FC = () => {
  const { properties, searchAlerts, route, navigate } = useApp();

  /**
   * Search filters live in the URL (/properties?q=villa&location=East+Legon&
   * type=Apartment&bedrooms=2&maxRent=8000). Refreshing, sharing the link and
   * using Back therefore all restore exactly the same result set, and no
   * secrets or tokens are involved — these are the values already on screen.
   */
  const applyFilters = (patch: Record<string, string | number | null>) => {
    // Compose against the live URL, not the value captured by this render:
    // "Reset all filters" changes five values in one click.
    const base = parseQuery(typeof window === 'undefined' ? '' : window.location.search);
    const next: Record<string, string | number | null | undefined> = { ...base, ...patch };
    Object.keys(next).forEach((key) => {
      const value = next[key];
      if (value === null || value === undefined || value === '') delete next[key];
    });
    // Defaults are dropped so `/properties` stays the canonical, clean URL.
    if (next.location === 'All') delete next.location;
    if (next.type === 'All') delete next.type;
    if (Number(next.maxRent) >= MAX_RENT) delete next.maxRent;
    navigate(`/properties${buildQuery(next)}`, { replace: true, scroll: false });
  };

  const searchQuery = route.query.q ?? '';
  const selectedLocation = route.query.location ?? 'All';
  const selectedType = route.query.type ?? 'All';
  const bedroomParam = Number(route.query.bedrooms);
  const selectedBedrooms: number | 'All' =
    Number.isFinite(bedroomParam) && bedroomParam > 0 ? bedroomParam : 'All';
  const rentParam = Number(route.query.maxRent);
  const maxRent = Number.isFinite(rentParam) && rentParam > 0 ? Math.min(rentParam, MAX_RENT) : MAX_RENT;

  const setSearchQuery = (value: string) => applyFilters({ q: value });
  const setSelectedLocation = (value: string) => applyFilters({ location: value === 'All' ? null : value });
  const setSelectedType = (value: string) => applyFilters({ type: value === 'All' ? null : value });
  const setSelectedBedrooms = (value: number | 'All') =>
    applyFilters({ bedrooms: value === 'All' ? null : String(value) });
  const setMaxRent = (value: number) => applyFilters({ maxRent: value >= MAX_RENT ? null : String(value) });

  /** Clear every filter in one navigation (one history entry, one render). */
  const resetFilters = () =>
    applyFilters({ q: null, location: null, type: null, bedrooms: null, maxRent: null });

  const [selectedViewingProp, setSelectedViewingProp] = useState<Property | null>(null);
  const [isNotifiedModalOpen, setIsNotifiedModalOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activeProperties = properties.filter(p => p.status === 'active');

  const browseJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Rental Properties in Greater Accra",
    "description": "Active real estate listings for apartments, houses, studios, and luxury rentals in Accra.",
    "numberOfItems": activeProperties.length,
    "itemListElement": activeProperties.map((p, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "RealEstateListing",
        "name": p.title,
        "description": p.description,
        "url": typeof window !== 'undefined' ? `${window.location.origin}/property/${p.id}` : `https://rent.goodlucks.co/property/${p.id}`,
        "offers": {
          "@type": "Offer",
          "price": p.rentGhs,
          "priceCurrency": "GHS"
        }
      }
    }))
  };

  // Count properties per category
  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    if (cat.id === 'All') {
      acc[cat.id] = activeProperties.length;
    } else {
      acc[cat.id] = activeProperties.filter(p => p.propertyType === cat.id).length;
    }
    return acc;
  }, {} as Record<string, number>);

  const filteredProperties = activeProperties.filter(p => {
    const matchesLoc = selectedLocation === 'All' || p.location.toLowerCase().includes(selectedLocation.toLowerCase());
    const matchesType = selectedType === 'All' || p.propertyType === selectedType;
    const matchesBed = selectedBedrooms === 'All' || p.bedrooms === Number(selectedBedrooms);
    const matchesRent = p.rentGhs <= maxRent;
    const matchesSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase()) || p.location.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLoc && matchesType && matchesBed && matchesRent && matchesSearch;
  });

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -220, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 220, behavior: 'smooth' });
    }
  };

  const isFiltered = selectedType !== 'All' || selectedLocation !== 'All' || selectedBedrooms !== 'All' || searchQuery !== '' || maxRent < 25000;

  return (
    <div className="min-h-screen bg-page text-ink py-8 px-4 sm:px-6 lg:px-8">
      <SEOHead
        title="Browse Properties & Rentals in Accra, Ghana | Goodlucks Homes"
        description="Explore 1, 2, 3, and 4-bedroom apartments, townhouses and homes for rent in East Legon, Cantonments, Osu, Airport and Labone. Listings come from registered landlords and agents and are reviewed before they appear."
        keywords="browse rentals Accra, East Legon apartments, Cantonments rentals, Accra real estate listings, Goodlucks Homes properties"
        jsonLd={browseJsonLd}
      />
      <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-interactive/10 text-ink text-xs font-bold border border-interactive/20 mb-1">
              <Building2 className="w-3.5 h-3.5" />
              Ghana Real Estate Catalogue
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Browse Rentals in Ghana
            </h1>
            <p className="text-xs sm:text-sm text-ink/70 mt-0.5">
              Listings submitted by registered landlords and agents
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            <button
              onClick={() => setIsNotifiedModalOpen(true)}
              className="text-xs font-black text-ink bg-interactive hover:bg-interactive/90 px-3.5 py-1.5 rounded-full transition-all shadow-md shadow-ink/10 flex items-center gap-1.5 active:scale-95 cursor-pointer"
              title="Subscribe to email alerts for new listings matching these search filters"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>Get Notified</span>
            </button>
            <span className="text-xs font-bold text-ink bg-interactive/10 px-3.5 py-1.5 rounded-full border border-interactive/30">
              Showing {filteredProperties.length} Properties
            </span>
            {isFiltered && (
              <button
                onClick={resetFilters}
                className="text-xs font-semibold text-ink/70 hover:text-ink bg-page hover:bg-line px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3 text-ink" /> Reset
              </button>
            )}
          </div>
        </div>

        {/* ================= CATEGORY SCROLL PILLS COMPONENT ================= */}
        <div className="relative group">
          {/* Left Navigation Arrow */}
          <button
            onClick={scrollLeft}
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-surface border border-line text-ink items-center justify-center shadow-lg opacity-80 hover:opacity-100 hover:scale-110 transition-all -ml-3"
            aria-label="Scroll left categories"
          >
            <ChevronLeft className="w-4 h-4 text-ink" />
          </button>

          {/* Scrollable Container */}
          <div
            ref={scrollContainerRef}
            className="flex items-center gap-2.5 overflow-x-auto no-scrollbar scroll-smooth py-2 px-1 scrollbar-none"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedType === cat.id;
              const count = categoryCounts[cat.id] || 0;

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedType(cat.id)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold transition-all duration-200 shrink-0 flex items-center gap-2.5 border shadow-lg cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'bg-interactive text-ink border-interactive shadow-ink/10 shadow-md scale-102'
                      : 'bg-surface backdrop-blur-md text-ink border-line hover:border-line hover:bg-surface hover:text-ink'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-ink' : 'text-ink'}`} />
                  <span className="whitespace-nowrap">{cat.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      isSelected
                        ? 'bg-surface/20 text-ink'
                        : 'bg-page text-ink/70'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Navigation Arrow */}
          <button
            onClick={scrollRight}
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-surface border border-line text-ink items-center justify-center shadow-lg opacity-80 hover:opacity-100 hover:scale-110 transition-all -mr-3"
            aria-label="Scroll right categories"
          >
            <ChevronRight className="w-4 h-4 text-ink" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-surface backdrop-blur-xl border border-line p-4 rounded-2xl shadow-lg space-y-3">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-ink" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Cantonments, East Legon..."
                className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
              />
            </div>

            {/* Location */}
            <div className="relative">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full bg-page border border-line rounded-xl p-2 text-xs text-ink focus:outline-none focus:border-interactive cursor-pointer"
              >
                <option value="All">All Suburbs</option>
                <option value="Cantonments">Cantonments</option>
                <option value="East Legon">East Legon</option>
                <option value="Airport">Airport Residential</option>
                <option value="Osu">Osu</option>
                <option value="Labone">Labone</option>
                <option value="Spintex">Spintex</option>
                <option value="Ahodwo">Ahodwo (Kumasi)</option>
              </select>
            </div>

            {/* Property Type Dropdown (synced with Pills) */}
            <div className="relative">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full bg-page border border-line rounded-xl p-2 text-xs text-ink focus:outline-none focus:border-interactive cursor-pointer"
              >
                <option value="All">All Property Types</option>
                <option value="Apartment">Apartment</option>
                <option value="Luxury Villa">Luxury Villa</option>
                <option value="Townhouse">Townhouse</option>
                <option value="Studio">Studio</option>
                <option value="Duplex">Duplex</option>
                <option value="Penthouse">Penthouse</option>
                <option value="Commercial">Commercial</option>
              </select>
            </div>

            {/* Bedrooms */}
            <div className="relative">
              <select
                value={selectedBedrooms}
                onChange={(e) => setSelectedBedrooms(e.target.value === 'All' ? 'All' : Number(e.target.value))}
                className="w-full bg-page border border-line rounded-xl p-2 text-xs text-ink focus:outline-none focus:border-interactive cursor-pointer"
              >
                <option value="All">Any Bedrooms</option>
                <option value="1">1 Bedroom</option>
                <option value="2">2 Bedrooms</option>
                <option value="3">3 Bedrooms</option>
                <option value="4">4+ Bedrooms</option>
              </select>
            </div>

          </div>

          {/* ================= PRICE RANGE SLIDER FILTER ================= */}
          <div className="pt-3 border-t border-line space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <SlidersHorizontal className="w-4 h-4 text-ink" />
                <span className="text-xs font-bold text-ink">Monthly Rent Budget</span>
                <span className="text-xs text-ink font-extrabold bg-interactive/10 px-2.5 py-0.5 rounded-full border border-interactive/20">
                  Up to GH₵ {maxRent.toLocaleString()}/mo
                </span>
              </div>

              {/* Quick Budget Preset Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {[
                  { label: '< 3k', val: 3000 },
                  { label: '< 5k', val: 5000 },
                  { label: '< 10k', val: 10000 },
                  { label: '< 15k', val: 15000 },
                  { label: 'Any Budget', val: 25000 },
                ].map((preset) => (
                  <button
                    key={preset.val}
                    onClick={() => setMaxRent(preset.val)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap border ${
                      maxRent === preset.val
                        ? 'bg-interactive text-ink border-interactive shadow-md shadow-ink/10'
                        : 'bg-surface text-ink/70 border-line hover:border-line hover:text-ink'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Slider Track */}
            <div className="relative flex items-center gap-3 pt-1">
              <span className="text-[11px] font-bold text-ink/70 shrink-0">GH₵ 1,000</span>
              <div className="relative w-full flex items-center">
                <input
                  type="range"
                  min={1000}
                  max={25000}
                  step={500}
                  value={maxRent}
                  onChange={(e) => setMaxRent(Number(e.target.value))}
                  className="w-full h-2.5 bg-page rounded-lg appearance-none cursor-pointer accent-interactive focus:outline-none border border-line"
                />
              </div>
              <span className="text-[11px] font-bold text-ink/70 shrink-0">GH₵ 25,000+</span>
            </div>
          </div>

        </div>

        {/* ================= GET NOTIFIED CALLOUT BANNER ================= */}
        <div className="gl-panel border-interactive/60 p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative overflow-hidden">
          <div className="flex items-start sm:items-center gap-3 relative z-10">
            <div className="p-2.5 rounded-xl bg-interactive/15 border border-interactive/30 text-ink shrink-0">
              <Bell className="w-5 h-5 text-ink" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-ink">Never Miss a Listing in Greater Accra</span>
                {searchAlerts.length > 0 && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                    <Check className="w-3 h-3" /> {searchAlerts.length} Active Alert{searchAlerts.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-ink/70 mt-0.5">
                Get instant email or WhatsApp alerts when a matching <strong className="text-ink">{selectedType === 'All' ? 'Property' : selectedType}</strong> in <strong className="text-ink">{selectedLocation === 'All' ? 'Accra' : selectedLocation}</strong> (under GH₵ {maxRent.toLocaleString()}/mo) goes live.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsNotifiedModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2 rounded-xl font-extrabold text-xs text-ink bg-interactive hover:bg-interactive/90 transition-all shadow-md shadow-ink/10 flex items-center justify-center gap-1.5 shrink-0 active:scale-95 cursor-pointer relative z-10"
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>Get Email Alerts</span>
          </button>
        </div>

        {/* PROPERTY GRID - STRICT REQUIREMENT: 2 CARDS PER ROW ON MOBILE */}
        {filteredProperties.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
            {filteredProperties.map(property => (
              <PropertyCard 
                key={property.id} 
                property={property} 
                onRequestViewing={(p) => setSelectedViewingProp(p)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-surface/50 backdrop-blur-xl rounded-2xl border border-line space-y-4 px-4">
            <Building2 className="w-12 h-12 text-ink/70 mx-auto" />
            <div className="space-y-1">
              <div className="text-lg font-bold text-ink">No Properties Matched Your Search</div>
              <p className="text-xs text-ink/70 max-w-md mx-auto">
                No active listings match your criteria right now. Subscribe to instant alerts and we'll notify you as soon as a matching home is listed.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setIsNotifiedModalOpen(true)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-interactive text-ink text-xs font-black shadow-lg hover:bg-interactive/90 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                <span>Get Notified When Listed</span>
              </button>
              <button
                onClick={resetFilters}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-page hover:bg-line text-ink text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-ink" /> Reset All Filters
              </button>
            </div>
          </div>
        )}

      </div>

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
            bedrooms: selectedBedrooms,
            maxRent: maxRent,
            searchQuery: searchQuery,
          }}
        />
      )}

    </div>
  );
};

