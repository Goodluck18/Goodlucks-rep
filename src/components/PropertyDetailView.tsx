import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ViewingRequestModal } from './ViewingRequestModal';
import { PriceDropModal } from './PriceDropModal';
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
  CalendarCheck,
  Bell,
  TrendingDown
} from 'lucide-react';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.063 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347z"/>
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.119.554 4.11 1.524 5.845L.05 23.55l5.856-1.503A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.83 0-3.556-.489-5.056-1.343l-.362-.208-3.473.891.91-3.385-.228-.363A9.957 9.957 0 012 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z"/>
  </svg>
);

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
  const [showPriceDropModal, setShowPriceDropModal] = useState(false);
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

  const agentWhatsappNumber = "233237690080";
  const whatsappText = encodeURIComponent(
    `Hello Goodlucks Homes! I am interested in this listing:\n\n` +
    `*${property.title}*\n` +
    `📍 Location: ${property.location} (${property.city})\n` +
    `💰 Price: GH₵ ${property.rentGhs.toLocaleString()}/mo\n` +
    `🏠 Type: ${property.bedrooms} Bed / ${property.bathrooms} Bath ${property.propertyType}\n` +
    `🆔 Ref: ${property.id}\n\n` +
    `Is this property currently available for a physical viewing?`
  );
  const whatsappUrl = `https://wa.me/${agentWhatsappNumber}?text=${whatsappText}`;

  const pageTitle = `${property.title} in ${property.location} (GH₵ ${property.rentGhs.toLocaleString()}/mo) | Goodlucks Homes`;
  const metaDescription = `${property.bedrooms} Bed, ${property.bathrooms} Bath ${property.propertyType} for rent in ${property.location}, ${property.city}. Rent: GH₵ ${property.rentGhs.toLocaleString()}/mo. Verified listing on Goodlucks Homes Ghana.`;
  const metaKeywords = `${property.title}, ${property.location} apartment for rent, real estate ${property.city}, rent in ${property.location}, ${property.bedrooms} bedroom house Accra, Goodlucks Homes Ghana`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "name": property.title,
    "description": property.description,
    "url": typeof window !== 'undefined' ? window.location.href : `https://rent.goodlucks.co/?property=${property.id}`,
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

          <div className="flex flex-col items-start md:items-end gap-2.5 shrink-0">
            <div className="bg-slate-800/80 p-4 rounded-2xl border border-white/10 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#08D9D6]">
                GH₵ {property.rentGhs.toLocaleString()}
              </span>
              <span className="text-sm font-medium text-slate-400">/ month</span>
            </div>

            <button
              id="notify-price-drop-btn-header"
              onClick={() => setShowPriceDropModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#08D9D6]/40 text-slate-200 hover:text-[#08D9D6] transition-all text-xs font-semibold cursor-pointer shadow-sm active:scale-95"
              title="Get email alerts if this property's rent drops"
            >
              <Bell className="w-3.5 h-3.5 text-[#08D9D6]" />
              <span>Notify me if price drops</span>
            </button>
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

                <button
                  id="notify-price-drop-btn-sidebar"
                  onClick={() => setShowPriceDropModal(true)}
                  className="w-full py-3 px-4 rounded-2xl bg-[#08D9D6]/10 hover:bg-[#08D9D6]/20 border border-[#08D9D6]/30 hover:border-[#08D9D6]/60 text-[#08D9D6] hover:text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <TrendingDown className="w-4 h-4" />
                  <span>Notify Me If Price Drops</span>
                </button>

                <a
                  href="tel:+233237690080"
                  className="w-full py-3.5 px-4 rounded-2xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-all flex items-center justify-center gap-2 text-center"
                >
                  <Phone className="w-4 h-4 text-[#08D9D6]" />
                  Call Goodlucks Homes (+233 23 769 0080)
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
                  rentals@goodlucks.co
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-[#08D9D6]" />
                  +233 23 769 0080
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

      {/* Floating WhatsApp Action Button */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-20 right-4 sm:bottom-8 sm:right-8 z-40 group flex items-center gap-3 bg-[#25D366] hover:bg-[#20ba5a] text-white p-3.5 sm:px-5 sm:py-3.5 rounded-full shadow-2xl shadow-[#25D366]/40 transition-all duration-300 hover:scale-105 active:scale-95 border border-emerald-300/40 cursor-pointer"
        title="Message Agent on WhatsApp"
        aria-label="Message Agent on WhatsApp"
      >
        <div className="relative flex items-center justify-center">
          <WhatsAppIcon className="w-6 h-6 fill-white shrink-0" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
          </span>
        </div>
        <div className="hidden sm:flex flex-col text-left pr-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-100 leading-none">Quick Inquiry</span>
          <span className="text-xs font-black tracking-tight leading-tight">Message on WhatsApp</span>
        </div>
      </a>

      {/* Viewing Modal */}
      {showViewingModal && (
        <ViewingRequestModal 
          property={property} 
          onClose={() => setShowViewingModal(false)} 
        />
      )}

      {/* Price Drop Alert Modal */}
      <PriceDropModal
        property={property}
        isOpen={showPriceDropModal}
        onClose={() => setShowPriceDropModal(false)}
      />

    </div>
  );
};
