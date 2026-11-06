import React from 'react';
import { useApp } from '../context/AppContext';
import { BlogPropertyCard } from './BlogPropertyCard';
import type { BlogPropertyCard as BlogPropertyCardData } from '../types';
import { Building2 } from 'lucide-react';

interface Props {
  /** Sanitised article HTML from the server. */
  html: string;
  /** The placeholder the editor inserts where the property cards belong. */
  placeholder?: string;
  cards: BlogPropertyCardData[];
  /** Heading shown above the cards. */
  showcaseHeading?: string;
  /** Copy under the cards (the honesty note about live listing data). */
  showcaseHint?: string;
  className?: string;
}

/**
 * Renders an article body and its live property showcase.
 *
 * The body is HTML the SERVER already sanitised (php-backend/lib/blog_content.php
 * keeps a small allowlist, rewrites YouTube links into a canonical no-cookie
 * embed and drops everything else). Nothing is trusted here, and nothing is
 * re-parsed: the split only decides where the property cards sit, so editorial
 * text can come before and after them.
 *
 * Internal links inside the article are handed to the router so a reader stays
 * in the single-page app instead of triggering a full reload.
 */
export const BlogArticleBody: React.FC<Props> = ({
  html,
  placeholder,
  cards,
  showcaseHeading = 'Available to rent now',
  showcaseHint = 'These cards read the live listings: prices, photos and availability are current as of this page view.',
  className = '',
}) => {
  const { navigate } = useApp();
  const marker = placeholder || '<div class="gl-showcase"></div>';

  const index = html.indexOf(marker);
  const before = index >= 0 ? html.slice(0, index) : html;
  const after = index >= 0 ? html.slice(index + marker.length) : '';

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest?.('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (!href.startsWith('/') || href.startsWith('//')) return;
    if (anchor.getAttribute('target') === '_blank') return;
    event.preventDefault();
    navigate(href);
  };

  const showcase = cards.length > 0 ? (
    <section className="my-8 space-y-3" aria-label="Listings mentioned in this article">
      <div className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-2">
        <h2 className="text-lg sm:text-xl font-black text-white">{showcaseHeading}</h2>
        <span className="text-[10px] uppercase tracking-wider text-slate-400">Live listings</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((card) => (
          <BlogPropertyCard key={card.propertyId} card={card} />
        ))}
      </div>
      <p className="text-[11px] text-slate-400 leading-snug">{showcaseHint}</p>
    </section>
  ) : null;

  return (
    <div className={className}>
      <div className="gl-article" onClick={handleClick} dangerouslySetInnerHTML={{ __html: before }} />
      {showcase}
      {after ? (
        <div className="gl-article" onClick={handleClick} dangerouslySetInnerHTML={{ __html: after }} />
      ) : null}
      {cards.length === 0 && index >= 0 ? (
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          No listings are attached to this article right now.
        </p>
      ) : null}
    </div>
  );
};

export default BlogArticleBody;
