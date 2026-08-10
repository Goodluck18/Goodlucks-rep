import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ViewingRequestModal } from './ViewingRequestModal';
import { PropertyCard } from './PropertyCard';
import { SEOHead } from './SEOHead';
import { 
  Bed, 
  Bath, 
  MapPin, 
  Calendar, 
  CheckCircle2, 
  ShieldCheck, 
  Phone, 
  Mail, 
  ChevronLeft, 
  ChevronRight,
  Share2, 
  Heart, 
  Sparkles,
  Map,
  Compass,
  Building2,
  CalendarCheck
} from 'lucide-react';

export const PropertyDetailView: React.FC = () => {
  const { 
    selectedPropertyId, 
    properties, 
    setCurrentView, 
    savedPropertyIds, 
    toggleSaveProperty, 
    incrementPropertyViews,
    showSuccessToast,
    navigateToProperty
  } = useApp();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showViewingModal, setShowViewingModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const property = properties.find(p => p.id === selectedPropertyId) || properties[0];

  useEffect(() => {
    if (property) {
      incrementPropertyViews(property.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setActiveImageIndex(0);
    }
  }, [property?.id]);

  if (!property) return null;

  const isSaved = savedPropertyIds.includes(property.id);

  const pageTitle = `${property.title} in ${property.location} (GH₵ ${property.rentGhs.toLocaleString()}/mo) | Goodlucks Homes`;
  const metaDescription = `${property.bedrooms} Bed, ${property.bathrooms} Bath ${property.propertyType} for rent in ${property.location}, ${property.city}. Rent: GH₵ ${property.rentGhs.toLocaleString()}/mo. Verified listing on Goodlucks Homes Ghana.`;
  const metaKeywords = `${property.title}, ${property.location} apartment for rent, real estate ${property.city}, rent in ${property.location}, ${property.bedrooms} bedroom house Accra, Goodlucks Homes Ghana`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "name": property.title,
    "description": property.description,
    "url": typeof window !== 'undefined' ? window.location.href : `https://goodluckshomes.com/?property=${property.id}`,
    "image": property.images,
    "datePosted": property.createdAt || "2026-08-01T00:00:00Z",
    "offers": {
      "@type": "Offer",
      "price": property.rentGhs,
      "priceCurrency": "GHS",
      "priceSpecification": {
        "@type": "UnitPriceSpecification",
        "price": property.rentGhs,
        "priceCurrency": "GHS",
        "unitCode": "MON"
      },
      "availability": property.status === 'active' ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
    },
    "itemOffered": {
      "@type": property.propertyType.toLowerCase().includes('apartment') ? "Apartment" : "SingleFamilyResidence",
      "name": property.title,
      "description": property.description,
      "numberOfBedrooms": property.bedrooms,
      "numberOfBathroomsTotal": property.bathrooms,
      "address": {
        "@type": "PostalAddress",
        "addressLocality": property.location,
        "addressRegion": property.city || "Greater Accra",
        "addressCountry": "GH"
      },
      "amenityFeature": (property.amenities || []).map(amenity => ({
        "@type": "LocationFeatureSpecification",
        "name": amenity,
        "value": true
      }))
    }
  };

  // Native Web Share API + Clipboard fallback
  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareData = {
      title: property.title,
      text: `Check out this rental property on Goodlucks Homes: ${property.title} in ${property.location} (GH₵ ${property.rentGhs.toLocaleString()}/mo)`,
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        showSuccessToast('Shared Successfully', 'Property link shared with your contacts!');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          copyToClipboard(shareUrl);
        }
      }
    } else {
      copyToClipboard(shareUrl);
    }
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      showSuccessToast('Link Copied', 'Property link copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Find similar properties in same city/location, budget range or property type
  const similarProperties = properties.filter(p => {
    if (p.id === property.id || p.status !== 'active') return false;
    const sameCity = p.city?.toLowerCase() === property.city?.toLowerCase();
    const sameLoc = p.location.toLowerCase().includes(property.location.split(',')[0].toLowerCase());
    const sameType = p.propertyType === property.propertyType;
    const priceDiff = Math.abs(p.rentGhs - property.rentGhs);
    const similarPrice = priceDiff <= property.rentGhs * 0.45;
    return sameCity || sameLoc || sameType || similarPrice;
  }).slice(0, 4);

  return (
    <div className="min-h-screen bg-[#252A34] text-white pb-20 animate-fadeIn">
      <SEOHead
        title={pageTitle}
        description={metaDescription}
        keywords={metaKeywords}
        ogType="real_estate:property"
        ogImage={property.images[0]}
        priceGhs={property.rentGhs}
        jsonLd={jsonLd}
      />
      
      {/* Top Header Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between">
        <button
          onClick={() => setCurrentView('browse')}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors text-sm font-semibold"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Properties
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors text-sm flex items-center gap-1.5"
            title="Share listing via Web Share"
          >
            <Share2 className="w-4 h-4 text-[#08D9D6]" />
            <span className="hidden sm:inline text-xs font-semibold">{copied ? 'Copied Link!' : 'Share'}</span>
          </button>

          <button
            onClick={() => toggleSaveProperty(property.id)}
            className={`p-2.5 rounded-xl transition-all ${
              isSaved ? 'bg-[#FF2E63] text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
            title="Save property"
          >
            <Heart className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Title & Price Bar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-[#08D9D6] text-[#252A34]">
                {property.propertyType}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {property.availability}
              </span>
              {property.featured && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Featured Luxury
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight">
              {property.title}
            </h1>

            <div className="flex items-center gap-1.5 text-slate-300 text-sm font-medium">
              <MapPin className="w-4 h-4 text-[#08D9D6]" />
              <span>{property.location}</span>
            </div>
          </div>

          <div className="bg-slate-800/80 p-4 rounded-2xl border border-white/10 flex items-baseline gap-2 shrink-0">
            <span className="text-3xl font-extrabold text-[#08D9D6]">
              GH₵ {property.rentGhs.toLocaleString()}
            </span>
            <span className="text-sm font-medium text-slate-400">/ month</span>
          </div>
        </div>

        {/* Photo Gallery Grid */}
        <div className="space-y-3">
          <div className="relative aspect-[16/9] md:aspect-[21/9] rounded-3xl overflow-hidden bg-slate-800 border border-white/10 shadow-2xl">
            <img 
              src={property.images[activeImageIndex] || property.images[0]} 
              alt={property.title}
              className="w-full h-full object-cover transition-all duration-300"
            />
            <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-semibold text-white">
              Photo {activeImageIndex + 1} of {property.images.length}
            </div>
          </div>

          {/* Thumbnails */}
          {property.images.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {property.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative w-24 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                    activeImageIndex === idx ? 'border-[#08D9D6] scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main 2-Column Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column (Specs, Description, Amenities, Nearby Places, Map) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Quick Specs Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-800/60 p-5 rounded-2xl border border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#08D9D6]/10 text-[#08D9D6] flex items-center justify-center">
                  <Bed className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 font-medium">Bedrooms</div>
                  <div className="text-base font-bold text-white">{property.bedrooms} Beds</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#08D9D6]/10 text-[#08D9D6] flex items-center justify-center">
                  <Bath className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 font-medium">Bathrooms</div>
                  <div className="text-base font-bold text-white">{property.bathrooms} Baths</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#08D9D6]/10 text-[#08D9D6] flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 font-medium">Type</div>
                  <div className="text-base font-bold text-white">{property.propertyType}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#08D9D6]/10 text-[#08D9D6] flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 font-medium">Availability</div>
                  <div className="text-sm font-bold text-emerald-400">{property.availability}</div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-3 bg-slate-800/40 p-6 rounded-2xl border border-white/10">
              <h2 className="text-xl font-bold text-white">Property Overview</h2>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {property.description}
              </p>
            </div>

            {/* Amenities */}
            <div className="space-y-4 bg-slate-800/40 p-6 rounded-2xl border border-white/10">
              <h2 className="text-xl font-bold text-white">Luxury Amenities & Features</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {property.amenities.map((amenity, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-[#08D9D6] shrink-0" />
                    <span>{amenity}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Nearby Places */}
            {property.nearbyPlaces && property.nearbyPlaces.length > 0 && (
              <div className="space-y-4 bg-slate-800/40 p-6 rounded-2xl border border-white/10">
                <h2 className="text-xl font-bold text-white">Nearby Landmarks & Transit</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {property.nearbyPlaces.map((place, idx) => (
                    <div key={idx} className="bg-slate-800 p-3 rounded-xl border border-white/5 space-y-1">
                      <div className="text-xs font-semibold text-[#08D9D6] uppercase tracking-wider">{place.type}</div>
                      <div className="text-sm font-bold text-white">{place.name}</div>
                      <div className="text-xs text-slate-400">{place.distance} away</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Map Placeholder */}
            <div className="space-y-3 bg-slate-800/40 p-6 rounded-2xl border border-white/10">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Location Map</h2>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Map className="w-4 h-4 text-[#08D9D6]" /> {property.location}
                </span>
              </div>
              <div className="h-48 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col items-center justify-center text-center p-4 space-y-2">
                <Compass className="w-10 h-10 text-[#08D9D6] animate-pulse" />
                <div className="text-sm font-semibold text-white">Interactive Location Map Preview</div>
                <div className="text-xs text-slate-400 max-w-sm">
                  {property.location} - Exact street address provided upon scheduling a viewing with Goodlucks Homes.
                </div>
              </div>
            </div>

          </div>

          {/* Right Column (Intermediary Box & Viewing Action CTA) */}
          <div className="space-y-6">
            
            {/* Strict Intermediary Box */}
            <div className="bg-gradient-to-b from-[#252A34] to-[#1A1E26] p-6 rounded-3xl border border-[#08D9D6]/30 shadow-xl space-y-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#08D9D6]/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center gap-2 text-[#08D9D6] font-bold text-sm">
                <ShieldCheck className="w-5 h-5" />
                Goodlucks Intermediary Service
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-extrabold text-white">
                  Rent Safely & Directly Through Goodlucks
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  All property enquiries, physical viewings, background checks, and tenancy contracts are handled strictly by Goodlucks Homes as your trusted intermediary.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  onClick={() => setShowViewingModal(true)}
                  className="w-full py-3.5 px-4 rounded-2xl bg-[#08D9D6] text-[#252A34] font-extrabold text-sm hover:bg-[#08D9D6]/90 transition-all shadow-lg shadow-[#08D9D6]/20 flex items-center justify-center gap-2 active:scale-95"
                >
                  <CalendarCheck className="w-5 h-5" />
                  Request Viewing Now
                </button>

                <a
                  href="tel:+233302998800"
                  className="w-full py-3.5 px-4 rounded-2xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all flex items-center justify-center gap-2 text-center"
                >
                  <Phone className="w-4 h-4 text-[#08D9D6]" />
                  Call Goodlucks Homes (+233 30 299 8800)
                </a>
              </div>

              <div className="pt-4 border-t border-white/10 space-y-2 text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#08D9D6]" />
                  <span>Viewing Fee: <strong className="text-white">GH₵ 100</strong> (Paid physically on site)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#08D9D6]" />
                  <span>Zero Direct Landlord Solicitations</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#08D9D6]" />
                  <span>100% Verified Property Documentation</span>
                </div>
              </div>

            </div>

            {/* Quick Contact Card */}
            <div className="bg-slate-800/40 p-5 rounded-2xl border border-white/10 space-y-3 text-xs text-slate-300">
              <div className="font-bold text-white text-sm">Have Questions About This Property?</div>
              <p>Speak directly to our dedicated property specialist team in Accra.</p>
              <div className="space-y-1.5 font-medium text-white">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#08D9D6]" />
                  enquiries@goodluckshomes.com
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#08D9D6]" />
                  +233 30 299 8800 / +233 24 412 3456
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Similar Properties Section */}
        {similarProperties.length > 0 && (
          <div className="pt-10 border-t border-white/10 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#08D9D6]/10 text-[#08D9D6] border border-[#08D9D6]/20">
                  Recommended Matches
                </span>
                <h2 className="text-2xl font-black text-white mt-1">
                  Similar Properties in {property.city || 'Accra'}
                </h2>
                <p className="text-xs text-slate-300">
                  Explore other verified properties with matching locations, budgets, or features.
                </p>
              </div>

              <button
                onClick={() => setCurrentView('browse')}
                className="self-start sm:self-auto text-xs font-bold text-[#08D9D6] hover:underline flex items-center gap-1"
              >
                <span>View All Listings</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-6">
              {similarProperties.map(simProp => (
                <PropertyCard
                  key={simProp.id}
                  property={simProp}
                  onRequestViewing={() => {
                    navigateToProperty(simProp.id);
                    setShowViewingModal(true);
                  }}
                />
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Viewing Modal */}
      {showViewingModal && (
        <ViewingRequestModal 
          property={property} 
          onClose={() => setShowViewingModal(false)} 
        />
      )}

    </div>
  );
};
