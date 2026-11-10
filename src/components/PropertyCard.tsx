import React from 'react';
import { Property } from '../types';
import { useApp } from '../context/AppContext';
import { propertyCanonicalUrl, propertyPath } from '../routing/propertyUrl';
import { Bed, Bath, MapPin, Eye, Heart, CalendarCheck, Sparkles, ShieldCheck } from 'lucide-react';

interface PropertyCardProps {
  property: Property;
  onRequestViewing?: (property: Property) => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({ property, onRequestViewing }) => {
  const { navigateToProperty, savedPropertyIds, toggleSaveProperty } = useApp();
  const isSaved = savedPropertyIds.includes(property.id);

  return (
    <article 
      itemScope 
      itemType="https://schema.org/RealEstateListing"
      className="group relative gl-card gl-card-interactive overflow-hidden flex flex-col h-full"
    >
      {/* Correction 4/7: the card advertises the listing's canonical URL, not
          the bare id, so crawlers and "copy link" agree with the sitemap. */}
      <meta itemProp="url" content={propertyCanonicalUrl(property)} />
      <meta itemProp="name" content={property.title} />
      <meta itemProp="description" content={property.description} />
      
      {/* Property Image Container */}
      <a 
        href={propertyPath(property)}
        onClick={(e) => {
          e.preventDefault();
          navigateToProperty(property.id);
        }}
        className="relative aspect-[4/3] sm:aspect-[16/10] overflow-hidden bg-page cursor-pointer block"
      >
        <img 
          itemProp="image"
          src={property.images[0] || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80'} 
          alt={`${property.title} in ${property.location}`}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" 
        />
        

        {/* Top Badges */}
        <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-10 gap-1">
          <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-interactive text-ink shadow-md backdrop-blur-md">
            {property.propertyType}
          </span>

          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleSaveProperty(property.id);
            }}
            className={`p-1.5 sm:p-2 rounded-full backdrop-blur-md transition-transform duration-200 active:scale-125 shrink-0 ${
              isSaved 
                ? 'bg-accent text-white' 
                : 'bg-surface text-ink hover:bg-surface'
            }`}
            title={isSaved ? "Saved" : "Save property"}
          >
            <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSaved ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Featured Tag if applicable */}
        {property.featured && (
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 bg-amber-500/90 backdrop-blur-md text-ink font-bold text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider">
            <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            Featured
          </div>
        )}

        {/* Rent Tag */}
        <div 
          itemProp="offers" 
          itemScope 
          itemType="https://schema.org/Offer"
          className="absolute bottom-2 right-2 z-10 font-bold text-xs sm:text-sm md:text-base text-accent bg-surface px-2.5 py-1 rounded-lg border border-line"
        >
          <meta itemProp="priceCurrency" content="GHS" />
          <meta itemProp="price" content={property.rentGhs.toString()} />
          GH₵ {property.rentGhs.toLocaleString()} <span className="text-[10px] sm:text-xs font-normal text-ink/70">/mo</span>
        </div>
      </a>

      {/* Content Area */}
      <div className="p-2.5 sm:p-4 flex flex-col flex-grow justify-between space-y-2 sm:space-y-3">
        
        <div className="space-y-1">
          {/* Location */}
          <div className="flex items-center gap-1 text-ink/70 text-[10px] sm:text-xs font-medium">
            <MapPin className="w-3 h-3 text-interactive-text shrink-0" />
            <span className="truncate">{property.location}</span>
          </div>

          {/* Title */}
          <h3 className="text-xs sm:text-sm font-bold text-ink line-clamp-2 hover:text-ink transition-colors leading-tight sm:leading-snug">
            <a 
              href={propertyPath(property)}
              onClick={(e) => {
                e.preventDefault();
                navigateToProperty(property.id);
              }}
              className="hover:underline"
            >
              {property.title}
            </a>
          </h3>
        </div>

        {/* Key Features Icons: Beds, Baths */}
        <div className="flex items-center justify-between text-[10px] sm:text-xs font-semibold text-ink/70 pt-1.5 sm:pt-2 border-t border-line">
          <div className="flex items-center gap-1">
            <Bed className="w-3 h-3 sm:w-4 sm:h-4 text-interactive-text" />
            <span>{property.bedrooms} Bed</span>
          </div>
          <div className="flex items-center gap-1">
            <Bath className="w-3 h-3 sm:w-4 sm:h-4 text-interactive-text" />
            <span>{property.bathrooms} Bath</span>
          </div>
          <div className="text-[10px] text-emerald-700 font-medium truncate max-w-[80px] sm:max-w-none">
            {property.availability}
          </div>
        </div>

        {/* Task 03 update: the viewing fee that actually applies to this listing.
            A landlord listing's fee is set by Goodlucks Homes and paid to
            Goodlucks after the viewing; an agent listing's fee is the agent's own.
            Nothing is shown when no fee has been approved — no default is invented. */}
        {property.viewingTerms?.feeGhs ? (
          <div className="text-[9px] sm:text-[10px] font-medium text-ink/70 flex items-center gap-1">
            <span>Viewing fee</span>
            <strong className="text-ink">GH₵ {property.viewingTerms.feeGhs.toLocaleString()}</strong>
            <span className="text-ink/70 truncate">
              {property.viewingTerms.source === 'platform_policy'
                ? '· to Goodlucks after viewing'
                : '· paid on site'}
            </span>
          </div>
        ) : null}

        {/* Task 05: a card states only what the platform actually knows. A listing
            Goodlucks staff have reviewed says so; nothing claims the property is
            owned, managed or inspected by Goodlucks, and an unreviewed listing
            makes no claim at all. */}
        {property.isLandlordVerified ? (
          <div className="text-[9px] sm:text-[10px] text-emerald-700 bg-emerald-500/10 px-2 py-1 rounded-md text-center border border-emerald-500/20 font-semibold flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Reviewed by Goodlucks
          </div>
        ) : null}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <button
            onClick={() => navigateToProperty(property.id)}
            className="py-1.5 sm:py-2 px-2 rounded-xl text-[10px] sm:text-xs font-semibold bg-page text-ink hover:bg-line transition-colors flex items-center justify-center gap-1"
          >
            <Eye className="w-3 h-3 text-ink" />
            <span>Details</span>
          </button>

          <button
            onClick={() => onRequestViewing ? onRequestViewing(property) : navigateToProperty(property.id)}
            className="py-1.5 sm:py-2 px-2 rounded-xl text-[10px] sm:text-xs font-semibold bg-interactive text-ink hover:bg-interactive/90 transition-all shadow-md shadow-ink/10 flex items-center justify-center gap-1 active:scale-95"
          >
            <CalendarCheck className="w-3 h-3" />
            <span>Viewing</span>
          </button>
        </div>

      </div>

    </article>
  );
};
