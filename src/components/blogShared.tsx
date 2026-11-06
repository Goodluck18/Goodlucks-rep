import React from 'react';

/**
 * Small pieces shared by the Learning Centre pages.
 *
 * Kept in one place so the index, an article, the related-article strip and the
 * administrator's preview all format a date the same way and offer the same
 * share links — no second set of rules to drift.
 */

/** "6 November 2026" from an ISO timestamp; empty when there is no date. */
export function formatBlogDate(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** True when the article has been edited after it was first published. */
export function wasUpdatedAfterPublication(publishedAt?: string | null, updatedAt?: string | null): boolean {
  if (!publishedAt || !updatedAt) return false;
  const published = new Date(publishedAt).getTime();
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(published) || Number.isNaN(updated)) return false;
  // A minute of slack: saving and publishing in the same breath is not an update.
  return updated - published > 60_000;
}

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.063 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347z" />
    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.119.554 4.11 1.524 5.845L.05 23.55l5.856-1.503A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.83 0-3.556-.489-5.056-1.343l-.362-.208-3.473.891.91-3.385-.228-.363A9.957 9.957 0 012 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z" />
  </svg>
);

interface ShareProps {
  /** Absolute URL of the article. */
  url: string;
  title: string;
  onCopied?: () => void;
}

/**
 * Social sharing for an article.
 *
 * Plain links to the networks' own share endpoints plus a copy button: no
 * third-party script is loaded, so nothing tracks the reader unless they choose
 * to share.
 */
export const BlogShareButtons: React.FC<ShareProps> = ({ url, title, onCopied }) => {
  const [copied, setCopied] = React.useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const copy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const itemClass =
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-slate-200 hover:bg-white/10 transition-colors';

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Share this article">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Share</span>
      <a
        className={itemClass}
        href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <WhatsAppIcon /> WhatsApp
      </a>
      <a
        className={itemClass}
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Facebook
      </a>
      <a
        className={itemClass}
        href={`https://x.com/intent/post?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        X
      </a>
      <a className={itemClass} href={`mailto:?subject=${encodedTitle}&body=${encodedUrl}`}>
        Email
      </a>
      <button type="button" onClick={() => void copy()} className={itemClass}>
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );
};

/** The article's category chip, used on cards and at the top of an article. */
export const BlogCategoryChip: React.FC<{ name: string; slug?: string; onSelect?: (slug: string) => void }> = ({
  name,
  slug,
  onSelect,
}) => {
  const className =
    'inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#08D9D6]/10 text-[#08D9D6] border border-[#08D9D6]/25';
  if (!slug || !onSelect) {
    return <span className={className}>{name}</span>;
  }
  return (
    <button type="button" onClick={() => onSelect(slug)} className={`${className} hover:bg-[#08D9D6]/20`}>
      {name}
    </button>
  );
};
