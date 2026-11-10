import React from 'react';
import { Property } from '../types';
import { PropertyCard } from './PropertyCard';

interface PropertyCardGridProps {
  properties: Property[];
  onRequestViewing?: (property: Property) => void;
  /**
   * The grid classes for this page. The default is the catalogue grid every
   * listing page has always used — two cards per row on a phone, up to four on
   * a large desktop.
   */
  gridClassName?: string;
  /** Accessible name for the list (used by tests and screen readers). */
  label: string;
  /**
   * Optional wrapper (the tenant dashboard puts a match badge over the card).
   * It is called once per property and must return the card; the grid supplies
   * the key, so nothing here can escape the layout.
   */
  renderCard?: (property: Property) => React.ReactNode;
}

/**
 * The listing grid used by every page that shows properties: the home page, the
 * browse page, a listing's "similar properties" and the tenant dashboard.
 *
 * It is deliberately a grid and nothing else. Property cards on these pages are
 * ordinary vertical cards at every screen size — that is the layout the site is
 * built around and the one the business asked to keep.
 *
 * The compact, swipeable, single-row presentation exists, but it belongs to the
 * blog article showcase (`BlogPropertyShowcase`), where several listings have to
 * sit inside an article without taking over the page. In Upgrade 2 the horizontal
 * mobile strip was applied here instead, which quietly replaced the catalogue
 * layout on every listing page; this component no longer has that mode, so the
 * mistake cannot come back by accident.
 */
export const PropertyCardGrid: React.FC<PropertyCardGridProps> = ({
  properties,
  onRequestViewing,
  gridClassName = 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6',
  label,
  renderCard,
}) => {
  const render = (property: Property): React.ReactNode =>
    renderCard ? (
      renderCard(property)
    ) : (
      <PropertyCard property={property} onRequestViewing={onRequestViewing} />
    );

  return (
    <div role="list" aria-label={label} data-property-grid="" className={`grid ${gridClassName}`}>
      {properties.map((property) => (
        <React.Fragment key={property.id}>{render(property)}</React.Fragment>
      ))}
    </div>
  );
};

export default PropertyCardGrid;
