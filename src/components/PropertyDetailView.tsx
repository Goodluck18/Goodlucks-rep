import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ViewingRequestModal } from './ViewingRequestModal';
import { PriceDropModal } from './PriceDropModal';
import { PropertyCard } from './PropertyCard';
import { PropertyCardGrid } from './PropertyCardGrid';
import { SEOHead } from './SEOHead';
import {
  moneyLabel,
  propertyCanonicalUrl,
  propertyMainImage,
  propertyPath,
  propertyShareDescription,
  rentPeriodLabel,
} from '../routing/propertyUrl';
import { SharePropertyModal } from './SharePropertyModal';
import { 
  Bed, 
  Bath, 
  Home,
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
    selectedProperty,
    properties, 
    setCurrentView, 
    savedPropertyIds, 
    toggleSaveProperty, 
    incrementPropertyViews,
    navigateToProperty,
    route,
    navigate
  } = useApp();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showViewingModal, setShowViewingModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPriceDropModal, setShowPriceDropModal] = useState(false);

  const property =
    selectedProperty ??
    (selectedPropertyId ? properties.find((p) => p.id === selectedPropertyId) : undefined) ??
    null;

  /**
   * Correction 4: one listing, one URL.
   *
   * `/property/prop-1` and any older slug both render this listing, then the
   * address bar is replaced with the canonical
   * `/property/{title}-{location}-{id}` without adding a history entry. The
   * production server already 301s these (api/property_page.php); this keeps
   * the URL correct in the client too, so copy/share never propagates the old
   * form.
   */
  const canonicalPath = property ? propertyPath(property) : null;
  useEffect(() => {
    if (!canonicalPath || !route || route.name !== 'property-detail') return;
    if (route.path.toLowerCase() === canonicalPath.toLowerCase()) return;
    navigate(`${canonicalPath}${window.location.search}`, { replace: true });
  }, [canonicalPath, route, navigate]);

  useEffect(() => {
    if (property) {
      incrementPropertyViews(property.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setActiveImageIndex(0);
    }
  }, [property?.id]);

  if (!property) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-surface text-ink">
        <div className="max-w-md w-full bg-surface border border-line rounded-2xl p-8 text-center space-y-4 animate-fadeIn">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-700 flex items-center justify-center mx-auto">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black text-ink">This property is no longer available</h1>
          <p className="text-xs text-ink/70 leading-relaxed">
            The listing you are looking for may have been rented or removed by the agent or landlord.
            Browse our current available rentals, or ask us to find a similar home for you.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <button
              onClick={() => setCurrentView('browse')}
              className="gl-btn gl-btn-primary px-5 py-2.5 text-xs"
            >
              Browse Properties
            </button>
            <button
              onClick={() => setCurrentView('find-home')}
              className="px-5 py-2.5 rounded-xl bg-page hover:bg-line text-ink font-semibold text-xs border border-line"
            >
              Find a Home for Me
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isSaved = savedPropertyIds.includes(property.id);

  const agentWhatsappNumber = "233237690080";
  // Correction 6: every share path uses the canonical descriptive URL for the
  // listing that is on screen — never `window.location.href` (which may still be
  // an old id URL, or carry a tracking parameter) and never a hardcoded domain.
  const shareUrl = propertyCanonicalUrl(property);
  const shareSummary = propertyShareDescription(property);

  const whatsappText = encodeURIComponent(
    `Hello Goodlucks Homes! I am interested in this listing:\n\n` +
    `*${property.title}*\n` +
    `📍 Location: ${property.location} (${property.city})\n` +
    `💰 Price: ${moneyLabel(property.rentGhs)}${rentPeriodLabel(property)}\n` +
    `🏠 Type: ${property.bedrooms} Bed / ${property.bathrooms} Bath ${property.propertyType}\n` +
    `🔗 ${shareUrl}\n\n` +
    `Is this property currently available for a physical viewing?`
  );
  const whatsappUrl = `https://wa.me/${agentWhatsappNumber}?text=${whatsappText}`;

  const pageTitle = `${property.title} (${moneyLabel(property.rentGhs)}${rentPeriodLabel(property)}) | Goodlucks Homes`;
  // The share description is the concise price/location line, exactly as the
  // server-rendered card has it. No "verified" claim: a listing review is not an
  // ownership check or an inspection.
  const metaDescription = shareSummary;
  const metaKeywords = `${property.title}, ${property.location} apartment for rent, real estate ${property.city}, rent in ${property.location}, ${property.bedrooms} bedroom house Accra, Goodlucks Homes Ghana`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "name": property.title,
    "description": property.description,
    "url": shareUrl,
    "image": property.images.map((image) => propertyMainImage({ images: [image] })),
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
      "amenityFeature": (property.amenityLabels && property.amenityLabels.length > 0
        ? property.amenityLabels
        : property.amenities || []).map(amenity => ({
        "@type": "LocationFeatureSpecification",
        "name": amenity,
        "value": true
      }))
    }
  };

  // Sharing lives in one dialog now: the original link sharing is the first
  // option there, and the branded poster is the second. Opening a dialog instead
  // of sharing immediately is what makes both paths discoverable without
  // changing what the link option does.
  const handleShare = () => setShowShareModal(true);

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
    <div className="min-h-screen bg-page text-ink pb-20 animate-fadeIn">
      <SEOHead
        title={pageTitle}
        description={metaDescription}
        keywords={metaKeywords}
        canonicalUrl={shareUrl}
        ogType="real_estate:property"
        ogImage={propertyMainImage(property)}
        priceGhs={property.rentGhs}
        jsonLd={jsonLd}
      />
      
      {/* Top Header Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between">
        <button
          onClick={() => setCurrentView('browse')}
          className="gl-btn gl-btn-secondary text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Properties
        </button>

        {/* Sharing deliberately no longer sits here: it has its own clearly
            labelled button below the gallery, where a visitor has just seen the
            property. The top bar keeps Back and Save only. */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleSaveProperty(property.id)}
            className={`p-2.5 rounded-xl transition-all ${
              isSaved ? 'bg-accent text-white' : 'bg-page text-ink/70 hover:bg-page'
            }`}
            title="Save property"
          >
            <Heart className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Title & Price Bar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-4 border-b border-line">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-interactive text-ink">
                {property.propertyType}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-700 border border-emerald-500/30">
                {property.availability}
              </span>
              {property.featured && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-700 border border-amber-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Featured listing
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-ink tracking-tight break-words">
              {property.title}
            </h1>

            <div className="flex items-center gap-1.5 text-ink/70 text-sm font-medium">
              <MapPin className="w-4 h-4 text-ink" />
              <span>{property.location}</span>
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2.5 shrink-0">
            <div className="gl-card p-4 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-accent-text">
                GH₵ {property.rentGhs.toLocaleString()}
              </span>
              <span className="text-sm font-medium text-ink/70">/ month</span>
            </div>

            <button
              id="notify-price-drop-btn-header"
              onClick={() => setShowPriceDropModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-page hover:bg-page border border-line hover:border-interactive/40 text-ink hover:text-ink transition-all text-xs font-semibold cursor-pointer shadow-sm active:scale-95"
              title="Get email alerts if this property's rent drops"
            >
              <Bell className="w-3.5 h-3.5 text-ink" />
              <span>Notify me if price drops</span>
            </button>
          </div>
        </div>

        {/* Photo Gallery Grid */}
        <div className="space-y-3">
          <div className="relative aspect-[16/9] md:aspect-[21/9] rounded-2xl overflow-hidden bg-page border border-line">
            <img 
              src={property.images[activeImageIndex] || property.images[0]} 
              alt={property.title}
              fetchPriority="high"
              decoding="async"
              className="w-full h-full object-cover transition-all duration-300"
            />
            <div className="absolute bottom-4 right-4 bg-surface/95 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-semibold text-ink shadow-sm">
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
                    activeImageIndex === idx ? 'border-interactive scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Share this property — directly below the gallery and its thumbnails.
            Full width on a phone (easy to tap), sized to its label on a larger
            screen. It opens the same share dialog as before: nothing about the
            sharing workflow changed, only where it is offered. */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleShare}
            title="Share this property"
            aria-haspopup="dialog"
            data-testid="share-property-button"
            className="gl-btn gl-btn-secondary w-full sm:w-auto justify-center text-sm font-semibold"
          >
            <Share2 className="w-4 h-4" />
            Share this property
          </button>
        </div>

        {/* Main 2-Column Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column (Specs, Description, Amenities, Nearby Places, Map) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Quick Specs Bar */}
            <div className="gl-card grid grid-cols-2 sm:grid-cols-4 gap-4 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-interactive/10 text-ink flex items-center justify-center">
                  <Bed className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-ink/70 font-medium">Bedrooms</div>
                  <div className="text-base font-bold text-ink">{property.bedrooms} Beds</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-interactive/10 text-ink flex items-center justify-center">
                  <Bath className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-ink/70 font-medium">Bathrooms</div>
                  <div className="text-base font-bold text-ink">{property.bathrooms} Baths</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-interactive/10 text-ink flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-ink/70 font-medium">Type</div>
                  <div className="text-base font-bold text-ink">{property.propertyType}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-interactive/10 text-ink flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-ink/70 font-medium">Availability</div>
                  <div className="text-sm font-bold text-emerald-700">{property.availability}</div>
                </div>
              </div>

              {property.toilets !== null && property.toilets !== undefined && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-interactive/10 text-ink flex items-center justify-center">
                    <Bath className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-ink/70 font-medium">Toilets</div>
                    <div className="text-base font-bold text-ink">{property.toilets}</div>
                  </div>
                </div>
              )}

              {property.kitchens !== null && property.kitchens !== undefined && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-interactive/10 text-ink flex items-center justify-center">
                    <Home className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-ink/70 font-medium">Kitchens</div>
                    <div className="text-base font-bold text-ink">{property.kitchens}</div>
                  </div>
                </div>
              )}

              {property.furnishingLabel && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-interactive/10 text-ink flex items-center justify-center">
                    <Home className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-ink/70 font-medium">Furnishing</div>
                    <div className="text-base font-bold text-ink">{property.furnishingLabel}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-3 bg-surface/40 p-6 rounded-2xl border border-line">
              <h2 className="text-xl font-bold text-ink">Property Overview</h2>
              <p className="text-sm text-ink/70 leading-relaxed whitespace-pre-line">
                {property.description}
              </p>
            </div>

            {/* Amenities */}
            <div className="space-y-4 bg-surface/40 p-6 rounded-2xl border border-line">
              <h2 className="text-xl font-bold text-ink">Luxury Amenities & Features</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(property.amenityLabels && property.amenityLabels.length > 0
                  ? property.amenityLabels
                  : property.amenities
                ).map((amenity, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-ink">
                    <CheckCircle2 className="w-4 h-4 text-ink shrink-0" />
                    <span>{amenity}</span>
                  </div>
                ))}
              </div>
              {property.amenitiesNote && (
                <p className="text-xs text-ink/70 leading-relaxed">{property.amenitiesNote}</p>
              )}
            </div>

            {/* Video (Upgrade 2, C4): only a provider we recognise, rendered
                from the embed URL the server built itself. */}
            {property.video && property.video.embedUrl && (
              <div className="space-y-3 bg-surface/40 p-6 rounded-2xl border border-line">
                <h2 className="text-xl font-bold text-ink">Video walkthrough</h2>
                <div className="relative w-full overflow-hidden rounded-xl border border-line bg-page">
                  <div className="relative w-full pt-[56.25%]">
                    <iframe
                      src={property.video.embedUrl}
                      title={`Walkthrough video for ${property.title}`}
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-ink/60">
                  Hosted on {property.video.provider === 'youtube' ? 'YouTube' : property.video.provider === 'tiktok' ? 'TikTok' : 'Facebook'}.
                  Goodlucks does not host or endorse the video.
                </p>
              </div>
            )}

            {/* Provider expectation (Upgrade 2, C6). Staff and the provider are
                the only accounts the API gives this to, so this block is never
                shown to a tenant. */}
            {property.providerCommission &&
              (property.providerCommission.percent !== null ||
                property.providerCommission.note !== '') && (
                <div className="space-y-2 bg-page p-4 rounded-2xl border border-line">
                  <h2 className="text-sm font-bold text-ink">Provider's commission expectation</h2>
                  <p className="text-xs text-ink/70 leading-relaxed">
                    {property.providerCommission.percent !== null
                      ? `${property.providerCommission.percent}% `
                      : ''}
                    {property.providerCommission.note}
                  </p>
                  <p className="text-[11px] text-ink/60">
                    This is the provider's expectation from the property owner. It is not a Goodlucks fee and
                    nothing is calculated from it on this platform.
                  </p>
                </div>
              )}

            {/* Nearby Places */}
            {property.nearbyPlaces && property.nearbyPlaces.length > 0 && (
              <div className="space-y-4 bg-surface/40 p-6 rounded-2xl border border-line">
                <h2 className="text-xl font-bold text-ink">Nearby Landmarks & Transit</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {property.nearbyPlaces.map((place, idx) => (
                    <div key={idx} className="bg-surface p-3 rounded-xl border border-line space-y-1">
                      <div className="text-xs font-semibold text-ink uppercase tracking-wider">{place.type}</div>
                      <div className="text-sm font-bold text-ink">{place.name}</div>
                      <div className="text-xs text-ink/70">{place.distance} away</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Map Placeholder */}
            <div className="space-y-3 bg-surface/40 p-6 rounded-2xl border border-line">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-ink">Location Map</h2>
                <span className="text-xs text-ink/70 flex items-center gap-1">
                  <Map className="w-4 h-4 text-ink" /> {property.location}
                </span>
              </div>
              <div className="h-48 rounded-xl bg-surface border border-line flex flex-col items-center justify-center text-center p-4 space-y-2">
                <Compass className="w-10 h-10 text-ink" />
                <div className="text-sm font-semibold text-ink">Interactive Location Map Preview</div>
                <div className="text-xs text-ink/70 max-w-sm">
                  {property.location} - Exact street address provided upon scheduling a viewing with Goodlucks Homes.
                </div>
              </div>
            </div>

          </div>

          {/* Right Column (Intermediary Box & Viewing Action CTA) */}
          <div className="space-y-6">
            
            {/* Strict Intermediary Box */}
            <div className="gl-card border-interactive/60 p-6 space-y-5 relative overflow-hidden">

              <div className="flex items-center gap-2 text-ink font-bold text-sm">
                <ShieldCheck className="w-5 h-5" />
                Goodlucks Intermediary Service
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-extrabold text-ink">
                  Arrange Your Viewing Through Goodlucks
                </h3>
                <p className="text-xs text-ink/70 leading-relaxed">
                  Goodlucks Homes facilitates property enquiries and viewing coordination between tenants, authorised agents and landlords. Any tenancy agreement is arranged directly between the tenant and landlord, outside the platform.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  onClick={() => setShowViewingModal(true)}
                  className="gl-btn gl-btn-primary w-full"
                >
                  <CalendarCheck className="w-5 h-5" />
                  Request Viewing Now
                </button>

                <button
                  id="notify-price-drop-btn-sidebar"
                  onClick={() => setShowPriceDropModal(true)}
                  className="gl-btn gl-btn-secondary w-full text-xs"
                >
                  <TrendingDown className="w-4 h-4" />
                  <span>Notify Me If Price Drops</span>
                </button>

                <a
                  href="tel:+233237690080"
                  className="gl-btn gl-btn-secondary w-full"
                >
                  <Phone className="w-4 h-4 text-ink" />
                  Call Goodlucks Homes (+233 23 769 0080)
                </a>
              </div>

              <div className="pt-4 border-t border-line space-y-2 text-[11px] text-ink/70">
                {/* Task 03: the fee belongs to THIS property and is the approved
                    one. There is no platform-wide fee any more, so a property
                    without an approved fee says so instead of inventing GH₵ 100. */}
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-interactive mt-1.5" />
                  {property.viewingTerms?.isApproved && property.viewingTerms.feeGhs ? (
                    property.viewingTerms.source === 'platform_policy' ? (
                      <span>
                        Viewing fee:{' '}
                        <strong className="text-ink">GH₵ {property.viewingTerms.feeGhs.toLocaleString()}</strong>, payable
                        after the viewing to <strong className="text-ink">Goodlucks Homes</strong> — never online, and
                        never to the landlord
                      </span>
                    ) : (
                      <span>
                        Viewing Fee for this property:{' '}
                        <strong className="text-ink">GH₵ {property.viewingTerms.feeGhs.toLocaleString()}</strong>{' '}
                        (paid on site, never online)
                      </span>
                    )
                  ) : property.viewingTerms?.source === 'platform_policy' ? (
                    <span>No viewing fee is set for this property yet. Goodlucks Homes will confirm it before you travel.</span>
                  ) : (
                    <span>No viewing fee has been approved for this property. Ask the agent before you travel.</span>
                  )}
                </div>
                {property.viewingTerms?.isApproved && property.viewingTerms.terms && (
                  <div className="rounded-xl border border-line bg-surface p-3 space-y-1.5">
                    <p className="text-[11px] font-bold text-ink">Viewing terms for this property</p>
                    <p className="text-[11px] text-ink/70">
                      {property.viewingTerms.terms.appointmentRequired
                        ? 'An appointment is required.'
                        : 'No appointment is required.'}{' '}
                      {property.viewingTerms.terms.howToArrange}
                    </p>
                    {property.viewingTerms.terms.conditions && (
                      <p className="text-[11px] text-ink/70">
                        <span className="font-semibold text-ink/70">Conditions:</span>{' '}
                        {property.viewingTerms.terms.conditions}
                      </p>
                    )}
                    <p className="text-[11px] text-ink/70">
                      <span className="font-semibold text-ink/70">Paying the fee:</span>{' '}
                      {property.viewingTerms.terms.paymentInstructions}
                    </p>
                    {property.viewingTerms.terms.restrictions && (
                      <p className="text-[11px] text-ink/70">
                        <span className="font-semibold text-ink/70">Restrictions:</span>{' '}
                        {property.viewingTerms.terms.restrictions}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-interactive mt-1.5" />
                  <span>
                    Confirm the time with the agent or landlord before you travel, meet them at the property, view it
                    before you commit, and pay any viewing fee as the terms above state — never online.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${property.isLandlordVerified ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  />
                  <span>
                    {property.isLandlordVerified
                      ? 'Listing details reviewed by our team (not an ownership check)'
                      : 'Listing not yet reviewed by our team'}
                  </span>
                </div>
              </div>

            </div>

            {/* Quick Contact Card */}
            <div className="bg-surface/40 p-5 rounded-2xl border border-line space-y-3 text-xs text-ink/70">
              <div className="font-bold text-ink text-sm">Have Questions About This Property?</div>
              <p>Speak directly to our dedicated property specialist team in Accra.</p>
              <div className="space-y-1.5 font-medium text-ink">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-ink" />
                  rentals@goodlucks.co
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-ink" />
                  +233 23 769 0080
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Similar Properties Section */}
        {similarProperties.length > 0 && (
          <div className="pt-10 border-t border-line space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-interactive/10 text-ink border border-interactive/20">
                  Recommended Matches
                </span>
                <h2 className="text-2xl font-black text-ink mt-1">
                  Similar Properties in {property.city || 'Accra'}
                </h2>
                <p className="text-xs text-ink/70">
                  Explore other listings with matching locations, budgets, or features.
                </p>
              </div>

              <button
                onClick={() => setCurrentView('browse')}
                className="self-start sm:self-auto text-xs font-bold text-ink hover:underline flex items-center gap-1"
              >
                <span>View All Listings</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Similar listings — the two-column grid this page has always used,
                at every screen size. The horizontal card row is the blog
                article's showcase, not a listing page's. */}
            <PropertyCardGrid
              properties={similarProperties}
              label="Similar listings"
              gridClassName="grid-cols-2 gap-3 sm:gap-6"
              onRequestViewing={(simProp) => {
                navigateToProperty(simProp.id);
                setShowViewingModal(true);
              }}
            />
          </div>
        )}

      </div>

      {/* Floating WhatsApp Action Button */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-20 right-4 sm:bottom-8 sm:right-8 z-40 group flex items-center gap-3 bg-[#25D366] hover:bg-[#20ba5a] text-white p-3.5 sm:px-5 sm:py-3.5 rounded-full shadow-lg shadow-[#25D366]/40 transition-all duration-300 hover:scale-105 active:scale-95 border border-emerald-300/40 cursor-pointer"
        title="Message Agent on WhatsApp"
        aria-label="Message Agent on WhatsApp"
      >
        <div className="relative flex items-center justify-center">
          <WhatsAppIcon className="w-6 h-6 fill-ink shrink-0" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
          </span>
        </div>
        <div className="hidden sm:flex flex-col text-left pr-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 leading-none">Quick Inquiry</span>
          <span className="text-xs font-black tracking-tight leading-tight">Message on WhatsApp</span>
        </div>
      </a>

      {/* Share dialog: link sharing and the branded poster */}
      <SharePropertyModal
        property={property}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />

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
