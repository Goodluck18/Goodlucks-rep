import React from 'react';
import { Property } from '../types';
import { useApp } from '../context/AppContext';
import { Bed, Bath, MapPin, Eye, Heart, CalendarCheck, Sparkles } from 'lucide-react';

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
      className="group relative bg-[#252A34]/90 rounded-2xl border border-white/10 overflow-hidden shadow-lg hover:border-[#08D9D6]/50 hover:shadow-2xl hover:shadow-[#08D9D6]/10 transition-all duration-300 flex flex-col h-full active:scale-[0.99]"
    >
      <meta itemProp="url" content={`${typeof window !== 'undefined' ? window.location.origin : ''}/?property=${property.id}`} />
      <meta itemProp="name" content={property.title} />
      <meta itemProp="description" content={property.description} />
      
      {/* Property Image Container */}
      <a 
        href={`/?property=${property.id}`}
        onClick={(e) => {
          e.preventDefault();
          navigateToProperty(property.id);
        }}
        className="relative aspect-[4/3] sm:aspect-[16/10] overflow-hidden bg-slate-800 cursor-pointer block"
      >
        <img 
          itemProp="image"
          src={property.images[0] || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80'} 
          alt={`${property.title} in ${property.location}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" 
        />
        
        {/* Dark overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#252A34] via-transparent to-black/30 opacity-80" />

        {/* Top Badges */}
        <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-10">
          <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-[#08D9D6] text-[#252A34] shadow-md backdrop-blur-md">
            {property.propertyType}
          </span>

          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleSaveProperty(property.id);
            }}
            className={`p-1.5 sm:p-2 rounded-full backdrop-blur-md transition-transform duration-200 active:scale-125 ${
              isSaved 
                ? 'bg-[#FF2E63] text-white' 
                : 'bg-black/40 text-white hover:bg-black/60'
            }`}
            title={isSaved ? "Saved" : "Save property"}
          >
            <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSaved ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Featured Tag if applicable */}
        {property.featured && (
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 bg-amber-500/90 backdrop-blur-md text-slate-950 font-bold text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider">
            <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            Featured
          </div>
        )}

        {/* Rent Tag */}
        <div 
          itemProp="offers" 
          itemScope 
          itemType="https://schema.org/Offer"
          className="absolute bottom-2 right-2 z-10 font-bold text-xs sm:text-sm md:text-base text-white bg-[#252A34]/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10"
        >
          <meta itemProp="priceCurrency" content="GHS" />
          <meta itemProp="price" content={property.rentGhs.toString()} />
          GH₵ {property.rentGhs.toLocaleString()} <span className="text-[10px] sm:text-xs font-normal text-slate-300">/mo</span>
        </div>
      </a>

      {/* Content Area */}
      <div className="p-2.5 sm:p-4 flex flex-col flex-grow justify-between space-y-2 sm:space-y-3">
        
        <div className="space-y-1">
          {/* Location */}
          <div className="flex items-center gap-1 text-slate-400 text-[10px] sm:text-xs font-medium">
            <MapPin className="w-3 h-3 text-[#08D9D6] shrink-0" />
            <span className="truncate">{property.location}</span>
          </div>

          {/* Title */}
          <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-2 hover:text-[#08D9D6] transition-colors leading-tight sm:leading-snug">
            <a 
              href={`/?property=${property.id}`}
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
        <div className="flex items-center justify-between text-[10px] sm:text-xs font-semibold text-slate-300 pt-1.5 sm:pt-2 border-t border-white/10">
          <div className="flex items-center gap-1">
            <Bed className="w-3 h-3 sm:w-4 sm:h-4 text-[#08D9D6]" />
            <span>{property.bedrooms} Bed</span>
          </div>
          <div className="flex items-center gap-1">
            <Bath className="w-3 h-3 sm:w-4 sm:h-4 text-[#08D9D6]" />
            <span>{property.bathrooms} Bath</span>
          </div>
          <div className="text-[10px] text-emerald-400 font-medium truncate max-w-[80px] sm:max-w-none">
            {property.availability}
          </div>
        </div>

        {/* Intermediary Guarantee Notice */}
        <div className="text-[9px] sm:text-[10px] text-slate-400 bg-white/5 px-2 py-1 rounded-md text-center border border-white/5 font-medium">
          Verified Intermediary Listing
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <button
            onClick={() => navigateToProperty(property.id)}
            className="py-1.5 sm:py-2 px-2 rounded-xl text-[10px] sm:text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors flex items-center justify-center gap-1"
          >
            <Eye className="w-3 h-3 text-[#08D9D6]" />
            <span>Details</span>
          </button>

          <button
            onClick={() => onRequestViewing ? onRequestViewing(property) : navigateToProperty(property.id)}
            className="py-1.5 sm:py-2 px-2 rounded-xl text-[10px] sm:text-xs font-semibold bg-[#08D9D6] text-[#252A34] hover:bg-[#08D9D6]/90 transition-all shadow-md shadow-[#08D9D6]/20 flex items-center justify-center gap-1 active:scale-95"
          >
            <CalendarCheck className="w-3 h-3" />
            <span>View</span>
          </button>
        </div>

      </div>

    </article>
  );
};
