import React from 'react';
import { BlogPropertyCard } from './BlogPropertyCard';
import type { BlogPropertyCard as BlogPropertyCardData } from '../types';

interface Props {
  cards: BlogPropertyCardData[];
  /** Heading shown above the row. */
  heading?: string;
  /** Copy under the row (the honesty note about live listing data). */
  hint?: string;
  className?: string;
}

/**
 * The property showcase inside a blog article.
 *
 * Why this is its own component
 * -----------------------------
 * An article can mention four or five homes. A normal grid would push the rest
 * of the article off the screen — four cards at three-across on a desktop is two
 * tall rows, and on a phone it is four full-width cards stacked. So inside an
 * article the cards are compact and sit in ONE horizontal row that the reader
 * scrolls sideways; the article itself keeps its own vertical rhythm.
 *
 * This is the only horizontal card scroller in the product. The catalogue pages
 * (home, browse, listing, tenant dashboard) use `PropertyCardGrid`, which is a
 * plain grid at every screen size: the two use cases are deliberately different
 * components rather than one component with a mode, so a change here can never
 * rearrange a listing page again.
 *
 * Layout rules it guarantees
 * --------------------------
 *  - one row: `flex` with `shrink-0` cards, so nothing wraps to a second line;
 *  - the scroll box is the row, not the page: `overflow-x-auto` lives here, so
 *    the article never gains a horizontal scrollbar;
 *  - fixed card width and gap, so every card is the same shape and the row reads
 *    as a set rather than a pile;
 *  - the next card always peeks in from the right, which is what tells a reader
 *    the row continues;
 *  - `tabIndex={0}` plus a label, so a keyboard user can tab into the row and
 *    arrow through it — nothing is reachable only by swiping.
 *
 * Nothing about the listings is copied or stored here: each card reads the live
 * property record, exactly as `BlogPropertyCard` documents.
 */
export const BlogPropertyShowcase: React.FC<Props> = ({
  cards,
  heading = 'Available to rent now',
  hint,
  className = '',
}) => {
  if (cards.length === 0) return null;

  return (
    <section
      className={`my-8 space-y-3 ${className}`.trim()}
      aria-label="Listings mentioned in this article"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <h2 className="text-lg sm:text-xl font-black text-ink">{heading}</h2>
        <span className="text-[10px] uppercase tracking-wider text-ink/70">Live listings</span>
      </div>

      <div
        role="list"
        aria-label={`${heading} — scroll sideways for more`}
        data-blog-showcase=""
        tabIndex={0}
        className="gl-blog-showcase flex gap-3 overflow-x-auto pb-2"
      >
        {cards.map((card) => (
          <div
            key={card.propertyId}
            role="listitem"
            className="w-[248px] shrink-0 snap-start sm:w-[268px]"
          >
            <BlogPropertyCard card={card} dense />
          </div>
        ))}
      </div>

      {hint ? <p className="text-[11px] text-ink/70 leading-snug">{hint}</p> : null}
    </section>
  );
};

export default BlogPropertyShowcase;
