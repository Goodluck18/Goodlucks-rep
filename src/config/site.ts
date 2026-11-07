/**
 * Deployment-level constants for the public site.
 *
 * The canonical origin is a *configured* value, not `window.location.href`: a
 * page opened with a tracking parameter, over `http`, or from a preview host
 * otherwise advertises a different canonical URL than the one a crawler should
 * index. The backend uses the same value (`SITE_URL`, from `APP_URL` in the
 * environment) for article URLs, property share cards and the sitemap, so an
 * email link and a canonical tag never disagree.
 *
 * Which value is used, in order:
 *
 *   1. `VITE_SITE_URL` — set it at build time for a specific deployment
 *      (`VITE_SITE_URL=https://goodlucks.net npm run build`). Nothing else
 *      needs to change between the testing domain and the permanent one.
 *   2. The origin the page is actually served from, when it is a real host.
 *      This keeps the testing deployment (`goodlucks.net`) sharing and
 *      canonicalising its own domain instead of the permanent one, without a
 *      second build.
 *   3. The permanent domain, as a last-resort default for local/offline runs.
 *
 * The permanent-domain strategy itself is unchanged: `rent.goodlucks.co`
 * remains the default and the intended home of the site.
 */
const PERMANENT_ORIGIN = 'https://rent.goodlucks.co';

/** Hosts that are never a canonical origin (local dev, file previews). */
const LOCAL_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?$/i;

function resolveSiteOrigin(): string {
  const configured = (import.meta.env?.VITE_SITE_URL as string | undefined)?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (/^https?:\/\//i.test(origin) && !LOCAL_ORIGIN.test(origin)) {
      return origin.replace(/\/+$/, '');
    }
  }
  return PERMANENT_ORIGIN;
}

export const SITE_ORIGIN = resolveSiteOrigin();

/** The host shown to users and in share cards (`rent.goodlucks.co`). */
export function siteHost(): string {
  try {
    return new URL(SITE_ORIGIN).host;
  } catch {
    return 'rent.goodlucks.co';
  }
}

/** Absolute URL for a site-relative path (`/blog/x` → `https://…/blog/x`). */
export function absoluteUrl(path: string): string {
  if (!path) return SITE_ORIGIN;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
