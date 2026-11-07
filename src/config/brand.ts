/**
 * Goodlucks Homes brand facts, in one place.
 *
 * These are the values the website already shows (navbar wordmark, footer
 * handles, contact block). They are gathered here because the property poster
 * has to draw them onto a canvas, where Tailwind classes and CSS variables are
 * not available. The footer reads the social accounts, the handle and the contact
 * details from this module, so an account can never be renamed in one place and
 * not the other. The *wordmark markup* stays in the navbar and footer (the "HOMES
 * is pink" rule is asserted against that markup by
 * `tests/design-tokens.test.mjs`); `WORDMARK` below is the poster's mirror of it.
 *
 * Colour values are the approved palette from `src/index.css` (`@theme`):
 *   page #EAEAEA · surface #FFFFFF · pink #FF2E63 · teal #08D9D6
 *   ink #252A34 · line #D6D6D6
 * Canvas cannot read CSS custom properties, so the same six values are repeated
 * here as literals. `tests/poster.test.mts` asserts they still match the tokens
 * in `index.css`, so the two can never silently diverge.
 */

export const BRAND_NAME = 'Goodlucks Homes';

/**
 * The wordmark, split where the colour changes.
 *
 * GOODLUCKS is charcoal and HOMES is pink — that arrangement is the brand's and
 * must not be swapped or "harmonised" to teal. The case matches the website
 * wordmark exactly (`Goodlucks Homes`), so the poster and the navbar show the
 * same name.
 */
export const WORDMARK = {
  first: { text: 'Goodlucks', colour: '#252A34' },
  second: { text: 'Homes', colour: '#FF2E63' },
} as const;

/** The line that sits under the wordmark in the site header and footer. */
export const BRAND_TAGLINE = 'FIND. VIEW. RENT.';

/** The single, approved call to action on the poster. */
export const POSTER_CALL_TO_ACTION = 'VISIT OUR WEBSITE FOR MORE DETAILS';

export const BRAND_PALETTE = {
  page: '#EAEAEA',
  surface: '#FFFFFF',
  pink: '#FF2E63',
  teal: '#08D9D6',
  ink: '#252A34',
  line: '#D6D6D6',
  /**
   * Secondary text on white. Not a new brand colour: it is the ink that
   * `text-ink/70` produces on a white surface, written out because canvas needs
   * an opaque value (3.6:1 on white at large sizes, 4.9:1 for body sizes).
   */
  muted: '#5B616D',
} as const;

/**
 * Social accounts, exactly as the footer links them.
 *
 * `handle` is the one account name the brand uses everywhere; it is displayed
 * as `@GoodlucksHomes` on the poster. Do not add an account here without the
 * corresponding live profile — an invented handle sends buyers nowhere.
 */
export interface BrandSocial {
  name: string;
  handle: string;
  url: string;
}

export const BRAND_SOCIALS: BrandSocial[] = [
  { name: 'Instagram', handle: '@GoodlucksHomes', url: 'https://www.instagram.com/GoodlucksHomes' },
  { name: 'TikTok', handle: '@GoodlucksHomes', url: 'https://www.tiktok.com/@GoodlucksHomes' },
  { name: 'LinkedIn', handle: '@GoodlucksHomes', url: 'https://www.linkedin.com/company/GoodlucksHomes' },
  { name: 'X', handle: '@GoodlucksHomes', url: 'https://x.com/GoodlucksHomes' },
  { name: 'Facebook', handle: '@GoodlucksHomes', url: 'https://www.facebook.com/GoodlucksHomes' },
];

/** The one handle shown on the poster, without repeating it five times. */
export const BRAND_HANDLE = '@GoodlucksHomes';

export const BRAND_CONTACT = {
  email: 'rentals@goodlucks.co',
  phone: '+233 23 769 0080',
  phoneHref: 'tel:+233237690080',
} as const;
