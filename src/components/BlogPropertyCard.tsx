import React from 'react';
import { Bed, Bath, MapPin, ArrowRight, Building2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { BlogPropertyCard as BlogPropertyCardData } from '../types';

interface Props {
  card: BlogPropertyCardData;
  /** Compact form inside the editor's preview and the picker list. */
  dense?: boolean;
}

/**
 * A live listing inside an article.
 *
 * Everything shown comes from the property record at the moment the article is
 * read: the rent, the photos and whether the home can still be rented. Nothing
 * is stored on the article, so a price change or a rented listing shows up the
 * next time the page is opened.
 *
 * An unavailable listing is never dressed up as available — the rent is replaced
 * by a plain "No longer available" line and the card stops linking anywhere,
 * because the property page itself would not resolve.
 */
export const BlogPropertyCard: React.FC<Props> = ({ card, dense = false }) => {
  const { navigate } = useApp();
  const available = card.isAvailable && Boolean(card.url);

  const media = (
    <div className={`relative ${dense ? 'aspect-[16/10]' : 'aspect-[4/3] sm:aspect-[16/10]'} overflow-hidden bg-surface`}>
      {card.image ? (
        <img
          src={card.image}
          alt={card.imageAlt || `${card.title} in ${card.location}`}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-page text-ink/70">
          <Building2 className="w-8 h-8" />
        </div>
      )}
      <div className="absolute top-2 left-2 right-2 flex justify-between items-start gap-1">
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-interactive text-ink">
          {card.propertyType}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-md ${
            available
              ? 'bg-emerald-500/20 text-emerald-800 border-emerald-400/30'
              : 'bg-surface text-ink/70 border-line'
          }`}
        >
          {available ? card.availability : 'No longer available'}
        </span>
      </div>
    </div>
  );

  const body = (
    <div className={`${dense ? 'p-3' : 'p-4'} space-y-1.5`}>
      <h3 className={`${dense ? 'text-sm' : 'text-base'} font-bold text-ink leading-snug line-clamp-2`}>
        {card.title}
      </h3>
      <p className="text-[11px] text-ink/70 flex items-center gap-1">
        <MapPin className="w-3 h-3 shrink-0" />
        {card.location}
      </p>
      <div className="flex items-center gap-3 text-[11px] text-ink/70">
        <span className="flex items-center gap-1">
          <Bed className="w-3 h-3" /> {card.bedrooms}
        </span>
        <span className="flex items-center gap-1">
          <Bath className="w-3 h-3" /> {card.bathrooms}
        </span>
      </div>
      {available ? (
        <div className="pt-1 flex items-end justify-between gap-2">
          <span className="text-sm font-extrabold text-accent">
            GH₵ {card.rentGhs.toLocaleString()}
            <span className="text-[10px] font-medium text-ink/70"> /month</span>
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ink">
            View listing <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      ) : (
        <p className="pt-1 text-[11px] text-ink/70 leading-snug">
          This home is no longer listed as available. The rest of the article stays as it was written.
        </p>
      )}
      {card.note ? <p className="text-[11px] text-ink/70 italic">{card.note}</p> : null}
    </div>
  );

  if (!available) {
    return (
      <article className="gl-card overflow-hidden flex flex-col h-full opacity-90">
        {media}
        {body}
      </article>
    );
  }

  return (
    <a
      href={card.url ?? '#'}
      onClick={(event) => {
        event.preventDefault();
        if (card.url) navigate(card.url);
      }}
      className="group gl-card gl-card-interactive overflow-hidden flex flex-col h-full"
    >
      {media}
      {body}
    </a>
  );
};

export default BlogPropertyCard;
