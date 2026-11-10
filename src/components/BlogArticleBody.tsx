import React from 'react';
import { useApp } from '../context/AppContext';
import { BlogPropertyShowcase } from './BlogPropertyShowcase';
import type { BlogPropertyCard as BlogPropertyCardData } from '../types';
import { Building2 } from 'lucide-react';
import { splitShowcase } from '../lib/blogHtml';

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
  // Located structurally, not by an exact string (Upgrade 2, A2): a browser pads
  // an empty `<div class="gl-showcase">` inside a contentEditable with `<br>`,
  // and an exact match then lost the cards. `splitShowcase` accepts any `<div>`
  // whose class list contains `gl-showcase`, and drops a duplicated marker.
  const { before, after, hasShowcase } = splitShowcase(html, placeholder);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest?.('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (!href.startsWith('/') || href.startsWith('//')) return;
    if (anchor.getAttribute('target') === '_blank') return;
    event.preventDefault();
    navigate(href);
  };

  // The cards sit in one compact, swipeable row (BlogPropertyShowcase) rather
  // than a grid: a grid of live listings inside an article pushed the rest of
  // the article off the screen.
  const showcase = cards.length > 0 ? (
    <BlogPropertyShowcase cards={cards} heading={showcaseHeading} hint={showcaseHint} />
  ) : null;

  return (
    <div className={className}>
      <div className="gl-article" onClick={handleClick} dangerouslySetInnerHTML={{ __html: before }} />
      {showcase}
      {after ? (
        <div className="gl-article" onClick={handleClick} dangerouslySetInnerHTML={{ __html: after }} />
      ) : null}
      {cards.length === 0 && hasShowcase ? (
        <p className="text-xs text-ink/70 flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          No listings are attached to this article right now.
        </p>
      ) : null}
    </div>
  );
};

export default BlogArticleBody;
