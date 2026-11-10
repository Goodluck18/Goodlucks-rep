/**
 * Legal pages, footer and registration consent — the real React components in a
 * DOM, driven through their real controls.
 *
 *   npm run test:legal-ui
 *
 * What this covers (and what it does NOT):
 *
 *   * the Terms and Privacy pages render the content the API serves, at their
 *     real URLs, with the footer and no sign-in;
 *   * the footer carries exactly the five required links, styled by the
 *     footer-scoped rules, with no bright teal link text and no bright pink
 *     default;
 *   * the property page offers "Share this property" below the gallery, and the
 *     old top-bar control is gone (Save stays);
 *   * the register form requires the consent checkbox, blocks the Create Account
 *     action with a clear message, links the two documents in a new tab, and
 *     sends both flags to the server;
 *   * the Legal Pages console shows the editor only to an administrator the
 *     server says may edit, and never offers Publish to one who may not.
 *
 * This is happy-dom: no CSS layout, no browser, no device. Widths and real
 * rendering are checked manually (see the phase report).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';

const projectRoot = path.resolve(import.meta.dirname, '..');
const read = (relative: string) => readFileSync(path.join(projectRoot, relative), 'utf8');

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (/animation was canceled/i.test(message)) return;
  throw reason;
});

const window = new Window({
  url: 'https://goodlucks.co/',
  settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true },
});

const g = globalThis as unknown as Record<string, unknown>;
for (const key of [
  'window',
  'document',
  'navigator',
  'history',
  'location',
  'localStorage',
  'sessionStorage',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'matchMedia',
  'IntersectionObserver',
  'ResizeObserver',
  'MutationObserver',
  'DOMParser',
  'Image',
  'SVGElement',
  'FormData',
  'File',
]) {
  const value = (window as unknown as Record<string, unknown>)[key];
  if (value === undefined) continue;
  try {
    g[key] = value;
  } catch {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
}
g.self = window;
g.IS_REACT_ACT_ENVIRONMENT = true;

const inertAnimation = () => ({
  finished: new Promise<never>(() => undefined),
  currentTime: 0,
  playState: 'running',
  startTime: 0,
  playbackRate: 1,
  id: '',
  effect: null,
  timeline: null,
  onfinish: null,
  oncancel: null,
  pending: false,
  replaceState: 'auto',
  cancel() {},
  play() {},
  pause() {},
  finish() {},
  reverse() {},
  persist() {},
  commitStyles() {},
  updatePlaybackRate() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
});
(window as unknown as { Element: { prototype: Record<string, unknown> } }).Element.prototype.animate = inertAnimation;

/* -------------------------------------------------------------------------- */
/* API stub                                                                   */
/* -------------------------------------------------------------------------- */

const TERMS_HTML =
  '<p>These Terms govern your use of Goodlucks Homes.</p>' +
  '<h2>1. Introduction and acceptance</h2><p>Read these Terms before you register.</p>' +
  '<h2>2. Eligibility and registration</h2><ul><li>You must be 18 or older.</li></ul>' +
  '<h2>18. Contact us</h2><p>Email rentals@goodlucks.co.</p>';

const PRIVACY_HTML =
  '<p>This Privacy Policy explains what we collect.</p>' +
  '<h2>1. Introduction and who we are</h2><p>We are the data controller under Act 843.</p>' +
  '<h2>15. Cookies and local storage</h2><p>The session cookie keeps you signed in.</p>';

type Doc = {
  type: string;
  slug: string;
  title: string;
  summary: string;
  version: number;
  effectiveAt: string;
  publishedAt?: string;
  updatedAt?: string;
  contentHtml: string;
};

const documents: Record<string, Doc> = {
  terms: {
    type: 'terms',
    slug: 'terms-and-conditions',
    title: 'Terms and Conditions',
    summary: 'The rules that apply when you use Goodlucks Homes.',
    version: 3,
    effectiveAt: '2026-11-01T00:00:00+00:00',
    publishedAt: '2026-11-01T00:00:00+00:00',
    updatedAt: '2026-11-01T00:00:00+00:00',
    contentHtml: TERMS_HTML,
  },
  privacy: {
    type: 'privacy',
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    summary: 'What personal information Goodlucks Homes collects.',
    version: 1,
    effectiveAt: '2026-10-01T00:00:00+00:00',
    publishedAt: '2026-10-01T00:00:00+00:00',
    updatedAt: '2026-10-01T00:00:00+00:00',
    contentHtml: PRIVACY_HTML,
  },
};

let signedIn: Record<string, unknown> | null = null;
/** What /auth/me reports about this account's legal acceptances. */
let legalState: Record<string, unknown> | null = null;
/**
 * What the stubbed server answers for a registration. The default is the happy
 * path; the consent test uses a refusal so the modal stays open and the request
 * body can be inspected without the whole signed-in bootstrap running.
 */
let registerOutcome: { status: number; body: Record<string, unknown> } = {
  status: 201,
  body: { success: true, user: { id: 'user-new', name: 'New Tenant', email: 'new@example.com', role: 'tenant' } },
};
let legalCapabilities = { manageLegal: true, publishLegal: true };
let registrationBodies: Array<Record<string, unknown>> = [];
const calls: string[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  calls.push(`${init?.method ?? 'GET'} ${url}`);

  if (url.includes('/auth/me')) {
    return json({
      success: true,
      user: signedIn,
      role: signedIn ? signedIn.role : 'guest',
      savedPropertyIds: [],
      legal: legalState,
    });
  }
  if (url.includes('/auth/register')) {
    registrationBodies.push(JSON.parse(String(init?.body ?? '{}')));
    return json(registerOutcome.body, registerOutcome.status);
  }
  if (/\/properties\/prop-share-ui$/.test(url)) return json({ property: LISTING });
  if (/\/properties(\?|$)/.test(url)) {
    return json({ success: true, properties: [LISTING], total: 1, page: 1, perPage: 100 });
  }
  if (url.includes('/legal/terms-and-conditions')) return json({ success: true, document: documents.terms });
  if (url.includes('/legal/privacy-policy')) return json({ success: true, document: documents.privacy });
  if (/\/api\/legal$/.test(url)) return json({ success: true, documents: [documents.terms, documents.privacy] });
  if (url.includes('/admin/legal/terms')) {
    return json({
      success: true,
      document: {
        type: 'terms',
        slug: 'terms-and-conditions',
        title: 'Terms and Conditions',
        summary: '',
        updatedAt: documents.terms.updatedAt,
        published: { ...documents.terms, id: 'v3', status: 'published', changeNote: '', createdByName: 'Admin', publishedByName: 'Admin' },
        draft: null,
        versions: [
          { id: 'v3', version: 3, status: 'published', title: 'Terms', changeNote: '', effectiveAt: '2026-11-01T00:00:00+00:00', createdAt: '2026-11-01T00:00:00+00:00', createdByName: 'Admin', publishedAt: '2026-11-01T00:00:00+00:00', publishedByName: 'Admin', restoredFromVersion: null },
          { id: 'v2', version: 2, status: 'superseded', title: 'Terms', changeNote: 'Older', effectiveAt: '2026-10-01T00:00:00+00:00', createdAt: '2026-10-01T00:00:00+00:00', createdByName: 'Admin', publishedAt: '2026-10-01T00:00:00+00:00', publishedByName: 'Admin', restoredFromVersion: null },
        ],
        historyCount: 2,
      },
    });
  }
  if (url.includes('/admin/legal')) {
    return json({
      success: true,
      documents: [
        { type: 'terms', slug: 'terms-and-conditions', title: 'Terms and Conditions', summary: '', published: { version: 3 }, hasDraft: false, draftUpdatedAt: null, versionCount: 3 },
        { type: 'privacy', slug: 'privacy-policy', title: 'Privacy Policy', summary: '', published: { version: 1 }, hasDraft: false, draftUpdatedAt: null, versionCount: 1 },
      ],
      capabilities: legalCapabilities,
      reacceptanceRequired: false,
    });
  }

  // A bag of the empty shapes the dashboards bootstrap expects. Anything not
  // named above simply gets empty data, which is what a quiet account looks like.
  return json({
    success: true,
    properties: [],
    total: 0,
    page: 1,
    perPage: 100,
    requests: [],
    viewings: [],
    notifications: [],
    propertyIds: [],
    alerts: [],
    logs: [],
    outbox: { pending: 0, failed: 0, sentToday: 0, oldestPendingAt: null },
    enquiries: [],
    agents: [],
    posts: [],
    featured: [],
    categories: [],
    stats: {},
    items: [],
    rows: [],
  });
}) as unknown as typeof fetch;

/* -------------------------------------------------------------------------- */
/* Render harness                                                             */
/* -------------------------------------------------------------------------- */

const React = await import('react');
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { AppProvider } = await import('../src/context/AppContext');
const { Footer } = await import('../src/components/Footer');
const { AuthModal } = await import('../src/components/AuthModal');
const { LegalPageView } = await import('../src/components/LegalPageView');
const { AdminLegalPages } = await import('../src/components/AdminLegalPages');
const { LegalReacceptancePrompt } = await import('../src/components/LegalReacceptancePrompt');
const { default: App } = await import('../src/App');

const { createElement } = React;

let lastRoot: ReturnType<typeof createRoot> | null = null;

async function renderElement(element: unknown, url = '/') {
  if (lastRoot) {
    await act(async () => lastRoot!.unmount());
    lastRoot = null;
  }
  window.history.replaceState({}, '', url);
  document.body.innerHTML = '<div id="root"></div>';
  const container = document.getElementById('root') as HTMLElement;
  const root = createRoot(container);
  lastRoot = root;
  await act(async () => {
    root.render(createElement(AppProvider, null, element as never));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  return {
    container,
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      lastRoot = null;
    },
  };
}

const click = async (element: Element | null) => {
  assert.ok(element, 'the control exists');
  await act(async () => {
    element!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
};

/* -------------------------------------------------------------------------- */
/* 1. The public legal pages                                                  */
/* -------------------------------------------------------------------------- */

test('the Terms page renders the content the API serves, at its own URL, with the footer', async () => {
  signedIn = null;
  const app = await renderElement(createElement(LegalPageView, { documentType: 'terms' }), '/terms-and-conditions');

  assert.match(app.text(), /Terms and Conditions/);
  assert.match(app.text(), /These Terms govern your use of Goodlucks Homes\./);
  assert.match(app.text(), /Introduction and acceptance/);
  assert.match(app.text(), /Version 3/, 'the version is shown');
  assert.match(app.text(), /Effective 1 November 2026/, 'the effective date is shown');
  assert.ok(!app.text().includes('Sign in'), 'no sign-in is required');

  // The body is rendered from the API's HTML, not from a hardcoded copy.
  const article = app.container.querySelector('.gl-legal');
  assert.ok(article, 'the document body is rendered');
  assert.match(article!.innerHTML, /<h2>1\. Introduction and acceptance<\/h2>/);

  // The page has a clear way back to the site.
  const back = [...app.container.querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes('Back to Goodlucks Homes')
  );
  assert.ok(back, 'a way back to the main site is offered');

  // SEO: a real title and canonical for the page.
  assert.match(document.title, /Terms and Conditions \| Goodlucks Homes/);
  const canonical = document.head.querySelector('link[rel="canonical"]');
  assert.equal(canonical?.getAttribute('href'), 'https://goodlucks.co/terms-and-conditions');

  await app.unmount();
});

test('the Privacy Policy page renders at its own URL too', async () => {
  signedIn = null;
  const app = await renderElement(createElement(LegalPageView, { documentType: 'privacy' }), '/privacy-policy');
  assert.match(app.text(), /Privacy Policy/);
  assert.match(app.text(), /We are the data controller under Act 843/);
  assert.match(app.text(), /Version 1/);
  assert.match(document.title, /Privacy Policy \| Goodlucks Homes/);
  await app.unmount();
});

/* -------------------------------------------------------------------------- */
/* 2. Footer                                                                  */
/* -------------------------------------------------------------------------- */

test('the footer carries exactly the five required links, each to a real route', async () => {
  signedIn = null;
  const app = await renderElement(createElement(Footer), '/');
  const links = [...app.container.querySelectorAll('[data-footer-link]')];
  const byId = Object.fromEntries(links.map((link) => [link.getAttribute('data-footer-link'), link.textContent ?? '']));

  assert.equal(byId.guides, 'Renting Guides & How Goodlucks Homes Works');
  assert.equal(byId.terms, 'Terms and Conditions');
  assert.equal(byId.privacy, 'Privacy Policy');
  assert.equal(byId.about, 'About Goodlucks Homes');
  assert.equal(byId.contact, 'Contact Us');

  // Contact details and social accounts are kept.
  assert.match(app.container.textContent ?? '', /rentals@goodlucks\.co/);
  assert.ok(app.container.querySelectorAll('a[href^="https://www."]').length >= 4, 'the social accounts are kept');

  // Every footer link is styled by the footer class, not the global link class.
  for (const link of links) {
    assert.ok(link.className.includes('gl-footer-link'), 'footer links use the footer-scoped class');
    assert.ok(!link.className.includes('gl-link'), 'the global teal-underline link is not used in the footer');
  }

  await app.unmount();
});

test('a footer link navigates without a full page reload', async () => {
  signedIn = null;
  const app = await renderElement(createElement(Footer), '/');
  const terms = app.container.querySelector('[data-footer-link="terms"]');
  await click(terms);
  assert.equal(window.location.pathname, '/terms-and-conditions');
  await app.unmount();
});

test('the footer CSS is footer-scoped: charcoal links, grey hover, no teal link text', () => {
  const css = read('src/index.css');
  const block = css.slice(css.indexOf('.gl-footer-link {'), css.indexOf('.gl-footer-social {'));

  assert.match(block, /\.gl-footer-link \{[\s\S]*?color: #252a34/, 'the default link text is dark charcoal');
  assert.match(block, /\.gl-footer-link:hover \{[\s\S]*?background-color: rgba\(37, 42, 52, 0\.06\)/, 'hover is a subtle grey');
  assert.ok(!/#08d9d6/.test(block), 'no bright teal in the footer link treatment');
  assert.ok(!/text-decoration:\s*underline/.test(block), 'no heavy underline on footer links');

  // The global link treatment is untouched for the rest of the site.
  assert.match(
    css,
    /\.gl-link \{[^}]*text-decoration-color: var\(--color-interactive\)/,
    'the global .gl-link rule still exists, unchanged, for the rest of the site'
  );
});

/* -------------------------------------------------------------------------- */
/* 3. Property page: the share button                                         */
/* -------------------------------------------------------------------------- */

const LISTING = {
  id: 'prop-share-ui',
  title: 'Harbour View Three Bedroom Apartment',
  location: 'Cantonments, Accra',
  city: 'Accra',
  rentGhs: 6500,
  bedrooms: 3,
  bathrooms: 2,
  propertyType: 'Apartment',
  description: 'A three bedroom apartment used by the legal-pages UI suite.',
  images: ['https://example.com/one.jpg', 'https://example.com/two.jpg'],
  amenities: [],
  status: 'active',
  availability: 'Available Now',
  landlordId: 'user-landlord-1',
  landlordName: 'Abena Osei',
  landlordCompany: 'Prime Haven Properties Ltd',
  featured: false,
  viewsCount: 0,
  enquiriesCount: 0,
  createdAt: '2026-10-01T00:00:00+00:00',
};

test('“Share this property” sits below the gallery, and the top bar keeps only Back and Save', async () => {
  signedIn = null;
  const app = await renderElement(createElement(App), `/property/${LISTING.id}`);

  const share = app.container.querySelector('[data-testid="share-property-button"]');
  assert.ok(share, 'the labelled share button exists');
  assert.equal((share!.textContent ?? '').trim(), 'Share this property', 'the label is explicit');
  assert.equal(share!.getAttribute('title'), 'Share this property');
  assert.ok((share!.className ?? '').includes('w-full'), 'it is full width, so it is easy to tap on a phone');
  assert.ok((share!.className ?? '').includes('sm:w-auto'), 'and sized to its label on a wider screen');

  // It comes after the gallery and its thumbnails in document order.
  const images = [...app.container.querySelectorAll('img')];
  const mainImage = images[0];
  assert.ok(mainImage, 'the gallery rendered');
  const order = mainImage.compareDocumentPosition(share!) & window.Node.DOCUMENT_POSITION_FOLLOWING;
  assert.ok(order, 'the share button follows the gallery');

  // The old top-bar control is gone: exactly one share control remains on the page.
  const shareControls = app.container.querySelectorAll('button[title="Share this property"]');
  assert.equal(shareControls.length, 1, 'sharing is offered once, in one place');

  // Save is still in the top bar, and Back to Properties is still there.
  assert.ok(app.container.querySelector('button[title="Save property"]'), 'Save is unchanged');
  const back = [...app.container.querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes('Back to Properties')
  );
  assert.ok(back, 'Back to Properties is unchanged');

  await app.unmount();
});

test('the moved share button still opens the existing share dialog', async () => {
  signedIn = null;
  const app = await renderElement(createElement(App), `/property/${LISTING.id}`);
  await click(app.container.querySelector('[data-testid="share-property-button"]'));
  const dialog = app.container.querySelector('#share-property-modal');
  assert.ok(dialog, 'the same share dialog opens');
  assert.match(dialog!.textContent ?? '', /Share Property Link/);
  assert.match(dialog!.textContent ?? '', /Share as Image/);
  await app.unmount();
});

/* -------------------------------------------------------------------------- */
/* 4. Registration consent                                                    */
/* -------------------------------------------------------------------------- */

test('the register form has the exact consent wording, unchecked, with two new-tab links', async () => {
  signedIn = null;
  registrationBodies = [];
  const app = await renderElement(createElement(AuthModal, { initialMode: 'register', onClose: () => {} }), '/register');

  const checkbox = app.container.querySelector('#legal-consent') as HTMLInputElement | null;
  assert.ok(checkbox, 'the consent checkbox exists');
  assert.equal(checkbox!.checked, false, 'it is unchecked by default');

  const label = checkbox!.closest('label')!;
  const wording = (label.textContent ?? '').replace(/\s+/g, ' ').trim();
  assert.match(
    wording,
    /^I have read and agree to the Terms and Conditions and acknowledge the Privacy Policy\.$/,
    `the wording is exact (got: ${wording})`
  );

  const terms = label.querySelector('a[href="/terms-and-conditions"]') as HTMLAnchorElement | null;
  const privacy = label.querySelector('a[href="/privacy-policy"]') as HTMLAnchorElement | null;
  assert.ok(terms, 'the Terms link points at the real page');
  assert.ok(privacy, 'the Privacy link points at the real page');
  for (const link of [terms!, privacy!]) {
    assert.equal(link.target, '_blank', 'the link opens in a new tab');
    assert.match(link.rel, /noopener/, 'and cannot reach back into this page');
  }

  await app.unmount();
});

test('Create Account is blocked with a clear message until the box is ticked', async () => {
  signedIn = null;
  registrationBodies = [];
  // A refusal keeps the form open, so the request body can be inspected without
  // the signed-in bootstrap running in this isolated harness.
  registerOutcome = {
    status: 409,
    body: { success: false, error: 'An account with this email already exists.', fields: { email: 'Already registered.' } },
  };
  const app = await renderElement(createElement(AuthModal, { initialMode: 'register', onClose: () => {} }), '/register');

  // Fill the form so only the consent is missing.
  const setValue = async (selector: string, value: string) => {
    const input = app.container.querySelector(selector) as HTMLInputElement | null;
    assert.ok(input, `${selector} exists`);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input!.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
    });
  };
  await setValue('input[placeholder="e.g. Abena Mensah"]', 'Consent Tester');
  await setValue('input[type="email"]', 'consent-ui@example.com');
  await setValue('input[type="tel"]', '+233 24 000 0000');
  await setValue('input[type="password"]', 'Strong-Password-1');

  const submit = [...app.container.querySelectorAll('button[type="submit"]')][0];
  assert.ok(submit, 'the Create Account button exists');
  await click(submit);

  assert.match(app.text(), /accept the Terms and Conditions/i, 'a clear validation message is shown');
  assert.equal(registrationBodies.length, 0, 'nothing was sent to the server');

  // Tick it: the message clears and the request now carries both flags.
  const checkbox = app.container.querySelector('#legal-consent') as HTMLInputElement;
  await act(async () => {
    checkbox.click();
  });
  await click(submit);

  assert.equal(registrationBodies.length, 1, 'the registration was sent');
  assert.equal(registrationBodies[0].termsAccepted, true);
  assert.equal(registrationBodies[0].privacyAcknowledged, true);
  assert.ok(!app.text().includes('Tick the box to confirm'), 'the validation message is gone');
  assert.match(app.text(), /already exists/i, 'the server error is shown, not swallowed');
  registerOutcome = {
    status: 201,
    body: { success: true, user: { id: 'user-new', name: 'New Tenant', email: 'new@example.com', role: 'tenant' } },
  };

  await app.unmount();
});

/* -------------------------------------------------------------------------- */
/* 5. Admin console                                                           */
/* -------------------------------------------------------------------------- */

test('an administrator the server says may not edit sees a restricted panel, not an editor', async () => {
  signedIn = { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin', capabilities: {} };
  legalCapabilities = { manageLegal: false, publishLegal: false };
  const app = await renderElement(createElement(AdminLegalPages), '/admin/legal');
  assert.match(app.text(), /Legal Pages is restricted/);
  assert.equal(app.container.querySelector('[data-testid="legal-editor"]'), null, 'no editor is offered');
  await app.unmount();
});

test('an editor may edit and preview, and Publish stays disabled without the publish capability', async () => {
  signedIn = { id: 'admin-2', name: 'Editor', email: 'editor@example.com', role: 'admin', capabilities: { manageLegal: true } };
  legalCapabilities = { manageLegal: true, publishLegal: false };
  const app = await renderElement(createElement(AdminLegalPages), '/admin/legal');

  assert.ok(app.container.querySelector('[data-testid="legal-editor"]'), 'the editor is available');
  const buttons = [...app.container.querySelectorAll('button')];
  const save = buttons.find((button) => (button.textContent ?? '').includes('Save Draft'));
  const preview = buttons.find((button) => (button.textContent ?? '').includes('Preview'));
  const publish = buttons.find((button) => (button.textContent ?? '').trim() === 'Publish');
  assert.ok(save, 'Save Draft is offered');
  assert.ok(preview, 'Preview is offered');
  assert.ok(publish, 'Publish exists but is disabled');
  assert.ok((publish as HTMLButtonElement).disabled, 'publishing needs the separate capability');
  assert.match(app.text(), /Cannot publish/);
  await app.unmount();
});

test('signing in does not ask for the consent, and does not require it', async () => {
  signedIn = null;
  const app = await renderElement(createElement(AuthModal, { initialMode: 'login', onClose: () => {} }), '/login');
  assert.equal(app.container.querySelector('#legal-consent'), null, 'no consent checkbox on the sign-in form');
  assert.ok(app.container.querySelector('button[type="submit"]'), 'the sign-in action is available');
  await app.unmount();
});

test('the re-acceptance prompt appears only when the server says it must', async () => {
  signedIn = { id: 'tenant-1', name: 'Tenant', email: 'tenant@example.com', role: 'tenant' };
  legalState = {
    reacceptanceRequired: false,
    terms: { currentVersion: 4, acceptedVersion: 1, acceptedAt: '2026-10-01T00:00:00+00:00', needsAcceptance: true },
    privacy: { currentVersion: 1, acceptedVersion: 1, acceptedAt: '2026-10-01T00:00:00+00:00', needsAcceptance: false },
  };
  let app = await renderElement(createElement(LegalReacceptancePrompt), '/');
  assert.equal(app.container.querySelector('[role="dialog"]'), null, 'no prompt while the administrator has it switched off');
  await app.unmount();

  legalState = { ...legalState, reacceptanceRequired: true };
  app = await renderElement(createElement(LegalReacceptancePrompt), '/');
  const dialog = app.container.querySelector('[role="dialog"]');
  assert.ok(dialog, 'the prompt appears once it is switched on');
  assert.match(dialog!.textContent ?? '', /The Terms and Conditions have been updated/);
  assert.match(dialog!.textContent ?? '', /version 4/);
  const readLink = dialog!.querySelector('a[href="/terms-and-conditions"]') as HTMLAnchorElement | null;
  assert.ok(readLink, 'the account can read the new version first');
  assert.equal(readLink!.target, '_blank', 'reading does not lose the session');
  assert.match(dialog!.textContent ?? '', /Sign out instead/, 'an account that does not accept is not trapped');
  await app.unmount();

  legalState = null;
  signedIn = null;
});

test('the real app shows the footer on a legal page, with no sign-in and no modal', async () => {
  signedIn = null;
  legalState = null;
  const app = await renderElement(createElement(App), '/terms-and-conditions');
  assert.match(app.text(), /These Terms govern your use of Goodlucks Homes\./);
  assert.ok(app.container.querySelector('[data-footer-link="terms"]'), 'the footer is present');
  assert.ok(app.container.querySelector('[data-footer-link="privacy"]'), 'the footer links to the other document');
  assert.equal(app.container.querySelector('#legal-consent'), null, 'no registration form is forced on the visitor');
  assert.equal(document.title, 'Terms and Conditions | Goodlucks Homes');
  await app.unmount();
});
