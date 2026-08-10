import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { PropertyCard } from './PropertyCard';
import { ViewingRequestModal } from './ViewingRequestModal';
import { SEOHead } from './SEOHead';
import { Property, PropertyType } from '../types';
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
  Banknote
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

export const BrowseView: React.FC = () => {
  const { properties } = useApp();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [selectedBedrooms, setSelectedBedrooms] = useState<number | 'All'>('All');
  const [maxRent, setMaxRent] = useState(25000);
  const [selectedViewingProp, setSelectedViewingProp] = useState<Property | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activeProperties = properties.filter(p => p.status === 'active');

  const browseJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Verified Rental Properties in Greater Accra",
    "description": "Active real estate listings for apartments, houses, studios, and luxury rentals in Accra.",
    "numberOfItems": activeProperties.length,
    "itemListElement": activeProperties.map((p, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "RealEstateListing",
        "name": p.title,
        "description": p.description,
        "url": typeof window !== 'undefined' ? `${window.location.origin}/?property=${p.id}` : `https://goodluckshomes.com/?property=${p.id}`,
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
    <div className="min-h-screen bg-[#1F242D] text-white py-8 px-4 sm:px-6 lg:px-8">
      <SEOHead
        title="Browse Verified Properties & Rentals in Accra, Ghana | Goodlucks Homes"
        description="Explore verified 1, 2, 3, and 4-bedroom apartments, townhouses, and luxury homes for rent in East Legon, Cantonments, Osu, Airport, and Labone."
        keywords="browse rentals Accra, East Legon apartments, Cantonments rentals, Accra real estate listings, Goodlucks Homes properties"
        jsonLd={browseJsonLd}
      />
      <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] text-xs font-bold border border-[#08D9D6]/20 mb-1">
              <Building2 className="w-3.5 h-3.5" />
              Verified Ghana Real Estate Catalog
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Browse Verified Rentals in Ghana
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Intermediary Listings Managed Exclusively by Goodlucks Homes
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <span className="text-xs font-bold text-[#08D9D6] bg-[#08D9D6]/10 px-3.5 py-1.5 rounded-full border border-[#08D9D6]/30">
              Showing {filteredProperties.length} Properties
            </span>
            {isFiltered && (
              <button
                onClick={() => {
                  setSelectedType('All');
                  setSelectedLocation('All');
                  setSelectedBedrooms('All');
                  setSearchQuery('');
                  setMaxRent(25000);
                }}
                className="text-xs font-semibold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3 text-[#08D9D6]" /> Reset
              </button>
            )}
          </div>
        </div>

        {/* ================= CATEGORY SCROLL PILLS COMPONENT ================= */}
        <div className="relative group">
          {/* Left Navigation Arrow */}
          <button
            onClick={scrollLeft}
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-slate-900/90 border border-white/20 text-white items-center justify-center shadow-xl opacity-80 hover:opacity-100 hover:scale-110 transition-all -ml-3"
            aria-label="Scroll left categories"
          >
            <ChevronLeft className="w-4 h-4 text-[#08D9D6]" />
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
                      ? 'bg-[#08D9D6] text-[#252A34] border-[#08D9D6] shadow-[#08D9D6]/25 shadow-md scale-102'
                      : 'bg-[#252A34]/80 backdrop-blur-md text-slate-200 border-white/10 hover:border-white/25 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-[#252A34]' : 'text-[#08D9D6]'}`} />
                  <span className="whitespace-nowrap">{cat.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      isSelected
                        ? 'bg-[#252A34]/20 text-[#252A34]'
                        : 'bg-white/10 text-slate-300'
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
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-slate-900/90 border border-white/20 text-white items-center justify-center shadow-xl opacity-80 hover:opacity-100 hover:scale-110 transition-all -mr-3"
            aria-label="Scroll right categories"
          >
            <ChevronRight className="w-4 h-4 text-[#08D9D6]" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-[#252A34]/80 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-xl space-y-3">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-[#08D9D6]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Cantonments, East Legon..."
                className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#08D9D6]"
              />
            </div>

            {/* Location */}
            <div className="relative">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-[#08D9D6] cursor-pointer"
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
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-[#08D9D6] cursor-pointer"
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
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-xs text-white focus:outline-none focus:border-[#08D9D6] cursor-pointer"
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
          <div className="pt-3 border-t border-white/10 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#08D9D6]" />
                <span className="text-xs font-bold text-white">Monthly Rent Budget</span>
                <span className="text-xs text-[#08D9D6] font-extrabold bg-[#08D9D6]/10 px-2.5 py-0.5 rounded-full border border-[#08D9D6]/20">
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
                        ? 'bg-[#08D9D6] text-[#252A34] border-[#08D9D6] shadow-md shadow-[#08D9D6]/20'
                        : 'bg-slate-950/80 text-slate-300 border-white/10 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Slider Track */}
            <div className="relative flex items-center gap-3 pt-1">
              <span className="text-[11px] font-bold text-slate-400 shrink-0">GH₵ 1,000</span>
              <div className="relative w-full flex items-center">
                <input
                  type="range"
                  min={1000}
                  max={25000}
                  step={500}
                  value={maxRent}
                  onChange={(e) => setMaxRent(Number(e.target.value))}
                  className="w-full h-2.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-[#08D9D6] focus:outline-none border border-white/10"
                />
              </div>
              <span className="text-[11px] font-bold text-slate-400 shrink-0">GH₵ 25,000+</span>
            </div>
          </div>

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
          <div className="text-center py-16 bg-[#252A34]/50 backdrop-blur-xl rounded-3xl border border-white/10 space-y-3">
            <Building2 className="w-12 h-12 text-slate-500 mx-auto" />
            <div className="text-lg font-bold text-white">No Properties Matched Your Filter</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">Try resetting location or budget filters to explore active listings in Greater Accra.</p>
            <button
              onClick={() => { setSelectedLocation('All'); setSelectedType('All'); setSearchQuery(''); setSelectedBedrooms('All'); setMaxRent(25000); }}
              className="px-4 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-extrabold shadow-lg"
            >
              Reset All Filters
            </button>
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

    </div>
  );
};

