/**
 * Deployment-level constants for the public site.
 *
 * The canonical origin has to be a fixed value, not `window.location.href`: a
 * page opened with a tracking parameter, over `http`, or from a preview host
 * otherwise advertises a different canonical URL than the one a crawler should
 * index. The backend uses the same value (`SITE_URL`) for article URLs and the
 * sitemap, so an email link and a canonical tag never disagree.
 */
export const SITE_ORIGIN = 'https://rent.goodlucks.co';

/** Absolute URL for a site-relative path (`/blog/x` → `https://…/blog/x`). */
export function absoluteUrl(path: string): string {
  if (!path) return SITE_ORIGIN;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
