import React from 'react';
import { Property } from '../types';
import { PropertyCard } from './PropertyCard';

interface PropertyCardGridProps {
  properties: Property[];
  onRequestViewing?: (property: Property) => void;
  /**
   * The desktop/large-phone grid, exactly as the calling page had it before
   * (Upgrade 2, A4 keeps every `sm+` layout unchanged). The strip below `sm`
   * renders itself.
   */
  gridClassName?: string;
  /** Accessible name for the mobile strip and the grid. */
  label: string;
  /**
   * Optional wrapper (the tenant dashboard puts a match badge over the card).
   * It receives the layout the current breakpoint needs, so the badge sits on
   * the compact card in the strip and on the full card in the grid.
   */
  renderCard?: (property: Property, layout: 'vertical' | 'horizontal') => React.ReactNode;
}

/**
 * The listing grid, with a mobile swipe strip (Upgrade 2, A4).
 *
 * Why
 * ---
 * On a phone the grid cards were full-width vertical cards: two per row, tall,
 * and every listing competed for the same screen height. On a phone the cards
 * are now SMALLER and HORIZONTAL (a compact photograph on the left, the details
 * on the right) and they sit in one horizontal row that the reader swipes to see
 * the next listing — the strip scrolls leftwards, one card at a time, with the
 * snap points lining each card up with the edge.
 *
 * From `sm` upwards nothing changes: the same grid classes the page already used
 * are applied, so tablet and desktop layouts are exactly as before.
 *
 * It is one component rather than five copies, so the mobile behaviour cannot
 * drift between the home page, the browse page, a listing page, the tenant
 * dashboard and the saved list.
 *
 * Accessibility: the strip is a real scroll container (not a hidden overflow on
 * the page), it has a name, each card is a list item, and the same cards are
 * reachable in the grid above `sm` — nothing is only available by swiping.
 */
export const PropertyCardGrid: React.FC<PropertyCardGridProps> = ({
  properties,
  onRequestViewing,
  gridClassName = 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6',
  label,
  renderCard,
}) => {
  const card = (property: Property, layout: 'vertical' | 'horizontal') => (
    <PropertyCard
      key={property.id}
      property={property}
      layout={layout}
      onRequestViewing={onRequestViewing}
    />
  );

  const render = (property: Property, layout: 'vertical' | 'horizontal') =>
    renderCard ? renderCard(property, layout) : card(property, layout);

  return (
    <>
      {/* Below `sm`: one row of compact horizontal cards, swipeable. */}
      <div
        role="list"
        aria-label={`${label} — swipe sideways for more`}
        data-property-strip=""
        className="gl-property-strip -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:hidden"
      >
        {properties.map((property) => (
          <div
            key={property.id}
            role="listitem"
            className="w-[78%] max-w-[320px] shrink-0 snap-start"
          >
            {render(property, 'horizontal')}
          </div>
        ))}
      </div>

      {/* `sm` and above: the grid the page already had. */}
      <div className={`hidden sm:grid ${gridClassName}`}>
        {properties.map((property) => render(property, 'vertical'))}
      </div>
    </>
  );
};

export default PropertyCardGrid;
