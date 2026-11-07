/**
 * Property URLs and share text — the browser's copy of the server rules.
 *
 * A listing has one public address:
 *
 *     /property/{title}-{location}-{id}
 *
 * e.g. `/property/3-bedroom-apartment-east-legon-prop-1`
 *
 * The **stable id at the end is the identifier**. The words in front of it are
 * for humans and search engines, and they are allowed to change: if a listing is
 * retitled, its new slug is used and the old one redirects to it.
 *
 * `php-backend/lib/property_url.php` implements exactly the same rules, because
 * the initial HTML (and therefore every social share card) is produced by PHP
 * while the running app builds links in TypeScript. `tests/property-seo.test.mjs`
 * asserts the two produce identical output for the same fixtures — if one side
 * is changed without the other, that test fails.
 */

import { SITE_ORIGIN } from '../config/site';

/** Words that add nothing to a URL and are dropped from the title slug. */
const STOPWORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'the', 'to', 'with']);

/** The site-wide fallback share image, used when a listing has no photo. */
export const DEFAULT_SHARE_IMAGE = `${SITE_ORIGIN}/og-image.jpg`;

/**
 * Lowercase, hyphenated, ASCII-safe form of a piece of text.
 *
 * Mirrors PHP's `property_slugify()`: transliterate accents, read `&` as "and",
 * turn every run of other characters into one hyphen and trim the ends.
 */
export function slugify(text: string): string {
  const value = (text ?? '').trim();
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** True when `needle` appears in `haystack` as whole hyphen-separated words. */
function slugContains(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return `-${haystack}-`.includes(`-${needle}-`);
}

export interface SlugSource {
  id: string;
  title: string;
  location: string;
}

/** The descriptive slug for a listing (no leading slash). */
export function propertySlug(property: SlugSource): string {
  const titleWords = slugify(property.title)
    .split('-')
    .filter((word) => word !== '' && !STOPWORDS.has(word));
  let titleSlug = titleWords.join('-') || 'property';

  const locationSlug = slugify(property.location);
  if (locationSlug && !slugContains(titleSlug, locationSlug)) {
    titleSlug = `${titleSlug}-${locationSlug}`;
  }

  const idSlug = slugify(property.id);
  return idSlug ? `${titleSlug}-${idSlug}` : titleSlug;
}

/** The site-relative path of a listing (`/property/{slug}`). */
export function propertyPath(property: SlugSource): string {
  return `/property/${propertySlug(property)}`;
}

/** The absolute canonical URL of a listing. */
export function propertyCanonicalUrl(property: SlugSource): string {
  return `${SITE_ORIGIN}${propertyPath(property)}`;
}

/**
 * The short, permanent sharing address of a listing: `/p/{id}`.
 *
 * The id is the property's own stable public identifier — the same value that
 * already sits at the end of the canonical slug. Reusing it (rather than
 * minting a second code) is what makes the short link survive a retitle, a
 * price change or a location correction, needs no extra column, and cannot
 * drift out of sync with the listing it points at. `php-backend/lib/property_url.php`
 * builds the identical path, and `api/short_link.php` resolves it server-side
 * with the same visibility rule as the property page.
 */
export function propertyShortPath(property: { id: string }): string {
  return `/p/${encodeURIComponent(property.id)}`;
}

/** The absolute short sharing URL of a listing (`https://…/p/prop-1`). */
export function propertyShortUrl(property: { id: string }): string {
  return `${SITE_ORIGIN}${propertyShortPath(property)}`;
}

/**
 * Whether a listing may be shared at all.
 *
 * Mirrors `property_is_public()` on the server: only a published listing has a
 * page, a share card or a poster. Anything else (pending review, archived,
 * deleted) must not be turned into an image or a link.
 */
export function propertyIsShareable(property: { status?: string }): boolean {
  return property.status === 'active';
}

/**
 * The listing a `/property/<segment>` URL points at.
 *
 * Accepts the bare id (`prop-1`) and any slug ending in it
 * (`…-east-legon-prop-1`). The longest matching id wins, so `prop-10` is not
 * mistaken for `prop-1`. Returns `undefined` when the loaded catalogue has no
 * such listing (the API is still the authority — this only avoids a round trip).
 */
export function propertyForSegment<T extends { id: string }>(
  segment: string,
  properties: T[]
): T | undefined {
  const value = (segment ?? '').trim();
  if (!value) return undefined;

  const exact = properties.find((p) => p.id === value);
  if (exact) return exact;

  const byLongestId = [...properties]
    .sort((a, b) => b.id.length - a.id.length)
    .find((p) => value.endsWith(`-${p.id}`));
  return byLongestId;
}

/**
 * The stable property id inside a URL segment, or the segment itself.
 *
 * Used before the catalogue has loaded: if the segment is already an id, the
 * API is asked for it directly; if it is a slug the API resolves it the same
 * way the property page does.
 */
export function propertyIdFromSegment(segment: string, knownIds: string[] = []): string {
  const value = (segment ?? '').trim();
  if (!value) return '';
  const sorted = [...knownIds].sort((a, b) => b.length - a.length);
  const match = sorted.find((id) => value === id || value.endsWith(`-${id}`));
  return match ?? value;
}

/** `GH₵ 6,500` — whole amounts without decimals, otherwise two decimal places. */
export function moneyLabel(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const rounded = Math.round(value * 100) / 100;
  const whole = Math.abs(rounded - Math.round(rounded)) < 0.005;
  const fixed = whole ? String(Math.round(rounded)) : rounded.toFixed(2);
  const [integer, decimals] = fixed.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `GH₵ ${decimals ? `${grouped}.${decimals}` : grouped}`;
}

/**
 * Payment periods, as the listing stores them.
 *
 * The catalogue keeps one number — `rentGhs` — and a period key. Today every
 * listing on the platform is quoted **per month**, which is why `RENT_PERIOD`
 * is the default; but the label is always derived from the record via
 * `rentPeriodLabel()` so a yearly, weekly or daily listing would print its own
 * period instead of being mislabelled as monthly. PHP mirrors this in
 * `property_rent_period()`.
 */
export const RENT_PERIOD_SUFFIX: Record<string, string> = {
  month: '/month',
  year: '/year',
  week: '/week',
  day: '/day',
};

/** The default period, used when a record carries none. */
export const RENT_PERIOD = RENT_PERIOD_SUFFIX.month;

/** `/month`, `/year`, … for this listing (never assumed from the price alone). */
export function rentPeriodLabel(property: { rentPeriod?: string }): string {
  const key = (property.rentPeriod ?? '').trim().toLowerCase();
  return RENT_PERIOD_SUFFIX[key] ?? RENT_PERIOD;
}

/**
 * The one-line share description used under the photograph:
 * `GH₵ 6,500/month · Cantonments, Accra`.
 */
export function propertyShareDescription(property: {
  rentGhs: number;
  location?: string;
  city?: string;
  rentPeriod?: string;
}): string {
  const location = (property.location ?? '').trim();
  const city = (property.city ?? '').trim();
  let place = location;
  if (city && !location.toLowerCase().includes(city.toLowerCase())) {
    place = location ? `${location}, ${city}` : city;
  }
  return `${moneyLabel(property.rentGhs)}${rentPeriodLabel(property)} · ${place || 'Ghana'}`;
}

/**
 * Absolute URL of a listing's main photograph, or the site default.
 *
 * Mirrors PHP's `property_main_image_url()`: the first usable image wins, a
 * relative upload path is made absolute against the site origin, and anything
 * unusable falls back to the default share image rather than emitting a broken
 * preview.
 */
export function propertyMainImage(property: { images?: string[] }): string {
  return propertyPrimaryPhoto(property) ?? DEFAULT_SHARE_IMAGE;
}

/**
 * The listing's own primary photograph as an absolute URL, or `null` when the
 * record has no usable image.
 *
 * Same selection rules as `propertyMainImage()` — first usable entry wins, a
 * relative upload path is made absolute, protocol-relative and traversal-looking
 * values are skipped — but a listing with no photograph reports the absence
 * instead of silently borrowing the site's default share card. The poster uses
 * this so a photoless listing gets the designed placeholder panel rather than a
 * different graphic that pretends to be the property.
 */
export function propertyPrimaryPhoto(property: { images?: string[] }): string | null {
  const images = Array.isArray(property.images) ? property.images : [];
  for (const candidate of images) {
    if (typeof candidate !== 'string') continue;
    const url = candidate.trim();
    if (!url || url.startsWith('//') || url.includes('..')) continue;
    if (/^https?:\/\//i.test(url)) return url;
    // Any other scheme (`data:`, `blob:`, `javascript:`, `file:`) is not a
    // photograph of this property and is never turned into a URL we then load.
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) continue;
    return `${SITE_ORIGIN}/${url.replace(/^\/+/, '')}`;
  }
  return null;
}
