import React from 'react';
import { Property } from '../types';
import { useApp } from '../context/AppContext';
import { propertyCanonicalUrl, propertyPath } from '../routing/propertyUrl';
import { Bed, Bath, MapPin, Eye, Heart, CalendarCheck, Sparkles, ShieldCheck } from 'lucide-react';

interface PropertyCardProps {
  property: Property;
  onRequestViewing?: (property: Property) => void;
  /**
   * `vertical` (default) is the card used in every grid: a photograph on top and
   * the details underneath. `horizontal` is the compact form used inside the
   * mobile swipe strip (Upgrade 2, A4): a smaller photograph on the left and the
   * details on the right. Both read the same listing and the same handlers, so
   * the two can never disagree about a price or a fee.
   */
  layout?: 'vertical' | 'horizontal';
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  onRequestViewing,
  layout = 'vertical',
}) => {
  const { navigateToProperty, savedPropertyIds, toggleSaveProperty } = useApp();
  const isSaved = savedPropertyIds.includes(property.id);
  const horizontal = layout === 'horizontal';

  return (
    <article
      itemScope
      itemType="https://schema.org/RealEstateListing"
      className={`group relative gl-card gl-card-interactive overflow-hidden h-full ${
        horizontal ? 'flex flex-row' : 'flex flex-col'
      }`}
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
        className={`relative overflow-hidden bg-page cursor-pointer block ${
          horizontal ? 'w-28 min-[380px]:w-32 shrink-0' : 'aspect-[4/3] sm:aspect-[16/10]'
        }`}
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
          {horizontal ? null : (
            <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-interactive text-ink shadow-md backdrop-blur-md">
              {property.propertyType}
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleSaveProperty(property.id);
            }}
            className={`backdrop-blur-md transition-transform duration-200 active:scale-125 shrink-0 ${
              horizontal ? 'ml-auto p-1' : 'p-1.5 sm:p-2'
            } rounded-full ${isSaved ? 'bg-accent text-white' : 'bg-surface text-ink hover:bg-surface'}`}
            title={isSaved ? 'Saved' : 'Save property'}
          >
            <Heart
              className={`${horizontal ? 'w-3 h-3' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'} ${isSaved ? 'fill-current' : ''}`}
            />
          </button>
        </div>

        {/* Featured Tag if applicable */}
        {property.featured && !horizontal && (
          <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1 bg-amber-500/90 backdrop-blur-md text-ink font-bold text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider">
            <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            Featured
          </div>
        )}

        {/* Rent Tag — on the photograph in the grid card, in the body of the
            compact card where there is no room for it over a small picture. */}
        {horizontal ? null : (
          <div
            itemProp="offers"
            itemScope
            itemType="https://schema.org/Offer"
            className="absolute bottom-2 right-2 z-10 font-bold text-xs sm:text-sm md:text-base text-accent bg-surface px-2.5 py-1 rounded-lg border border-line"
          >
            <meta itemProp="priceCurrency" content="GHS" />
            <meta itemProp="price" content={property.rentGhs.toString()} />
            GH₵ {property.rentGhs.toLocaleString()}{' '}
            <span className="text-[10px] sm:text-xs font-normal text-ink/70">/mo</span>
          </div>
        )}
      </a>

      {/* Content Area */}
      <div
        className={
          horizontal
            ? 'p-2 flex flex-col flex-1 min-w-0 justify-between gap-1'
            : 'p-2.5 sm:p-4 flex flex-col flex-grow justify-between space-y-2 sm:space-y-3'
        }
      >
        <div className={horizontal ? 'space-y-0.5' : 'space-y-1'}>
          {horizontal ? (
            <div
              itemProp="offers"
              itemScope
              itemType="https://schema.org/Offer"
              className="font-bold text-[11px] text-accent flex items-baseline gap-1"
            >
              <meta itemProp="priceCurrency" content="GHS" />
              <meta itemProp="price" content={property.rentGhs.toString()} />
              GH₵ {property.rentGhs.toLocaleString()}
              <span className="text-[9px] font-normal text-ink/70">/mo</span>
              {property.featured ? <Sparkles className="w-2.5 h-2.5 text-amber-600" aria-label="Featured" /> : null}
            </div>
          ) : null}

          {/* Location */}
          <div
            className={`flex items-center gap-1 text-ink/70 font-medium ${
              horizontal ? 'text-[9px]' : 'text-[10px] sm:text-xs'
            }`}
          >
            <MapPin className={`${horizontal ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-interactive-text shrink-0`} />
            <span className="truncate">{property.location}</span>
          </div>

          {/* Title */}
          <h3
            className={`font-bold text-ink line-clamp-2 hover:text-ink transition-colors leading-tight sm:leading-snug ${
              horizontal ? 'text-[11px]' : 'text-xs sm:text-sm'
            }`}
          >
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
        <div
          className={`flex items-center justify-between font-semibold text-ink/70 border-t border-line ${
            horizontal ? 'text-[9px] pt-1' : 'text-[10px] sm:text-xs pt-1.5 sm:pt-2'
          }`}
        >
          <div className="flex items-center gap-1">
            <Bed className={`${horizontal ? 'w-2.5 h-2.5' : 'w-3 h-3 sm:w-4 sm:h-4'} text-interactive-text`} />
            <span>{property.bedrooms} Bed</span>
          </div>
          <div className="flex items-center gap-1">
            <Bath className={`${horizontal ? 'w-2.5 h-2.5' : 'w-3 h-3 sm:w-4 sm:h-4'} text-interactive-text`} />
            <span>{property.bathrooms} Bath</span>
          </div>
          <div
            className={`text-[10px] text-emerald-700 font-medium truncate ${
              horizontal ? 'text-[9px] max-w-[64px]' : 'max-w-[80px] sm:max-w-none'
            }`}
          >
            {property.availability}
          </div>
        </div>

        {/* Task 03 update: the viewing fee that actually applies to this listing.
            A landlord listing's fee is set by Goodlucks Homes and paid to
            Goodlucks after the viewing; an agent listing's fee is the agent's own.
            Nothing is shown when no fee has been approved — no default is invented. */}
        {property.viewingTerms?.feeGhs ? (
          <div
            className={`font-medium text-ink/70 flex items-center gap-1 ${
              horizontal ? 'text-[9px] flex-wrap' : 'text-[9px] sm:text-[10px]'
            }`}
          >
            <span>Viewing fee</span>
            <strong className="text-ink">GH₵ {property.viewingTerms.feeGhs.toLocaleString()}</strong>
            <span className="text-ink/70 truncate">
              {property.viewingTerms.source === 'platform_policy' ? '· to Goodlucks after viewing' : '· paid on site'}
            </span>
          </div>
        ) : null}

        {/* Task 05: a card states only what the platform actually knows. A listing
            Goodlucks staff have reviewed says so; nothing claims the property is
            owned, managed or inspected by Goodlucks, and an unreviewed listing
            makes no claim at all. */}
        {property.isLandlordVerified ? (
          <div
            className={`text-emerald-700 bg-emerald-500/10 px-2 py-1 rounded-md text-center border border-emerald-500/20 font-semibold flex items-center justify-center gap-1 ${
              horizontal ? 'text-[8px]' : 'text-[9px] sm:text-[10px]'
            }`}
          >
            <ShieldCheck className="w-3 h-3" /> Reviewed by Goodlucks
          </div>
        ) : null}

        {/* Actions */}
        <div className={`grid grid-cols-2 gap-1.5 ${horizontal ? 'pt-0.5' : 'pt-1'}`}>
          <button
            onClick={() => navigateToProperty(property.id)}
            className={`px-1.5 rounded-xl font-semibold bg-page text-ink hover:bg-line transition-colors flex items-center justify-center gap-1 ${
              horizontal ? 'py-1 text-[9px]' : 'py-1.5 sm:py-2 px-2 text-[10px] sm:text-xs'
            }`}
          >
            <Eye className="w-3 h-3 text-ink" />
            <span>Details</span>
          </button>

          <button
            onClick={() => (onRequestViewing ? onRequestViewing(property) : navigateToProperty(property.id))}
            className={`px-1.5 rounded-xl font-semibold bg-interactive text-ink hover:bg-interactive/90 transition-all shadow-md shadow-ink/10 flex items-center justify-center gap-1 active:scale-95 ${
              horizontal ? 'py-1 text-[9px]' : 'py-1.5 sm:py-2 px-2 text-[10px] sm:text-xs'
            }`}
          >
            <CalendarCheck className="w-3 h-3" />
            <span>Viewing</span>
          </button>
        </div>
      </div>
    </article>
  );
};
