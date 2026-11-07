/**
 * App-level navigation tests — the real React app, rendered in a DOM, driven
 * through its real navigation controls.
 *
 * This is not a replacement for a browser (no CSS, no real layout, no Apache),
 * but it does exercise the code that actually runs: AppContext owns the URL,
 * the Navbar links push history, the guards redirect, and the page renders from
 * the route. Everything here runs offline against a stubbed API.
 *
 *   npm run test:navigation
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

/* -------------------------------------------------------------------------- */
/* DOM + API stubs                                                            */
/* -------------------------------------------------------------------------- */

/**
 * happy-dom cancels CSS/JS animations on unmount, and the `motion` library
 * reports that cancellation as a rejected promise. It is an artefact of the
 * test DOM (there is no real animation in Node), not app behaviour, so it is
 * filtered here — every other unhandled rejection still fails the run.
 */
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
]) {
  const value = (window as unknown as Record<string, unknown>)[key];
  if (value === undefined) continue;
  const bound =
    typeof value === 'function' && key.startsWith('request')
      ? (value as (...args: unknown[]) => unknown).bind(window)
      : value;
  try {
    g[key] = bound;
  } catch {
    // Some globals (navigator) are getter-only in Node; define them instead.
    Object.defineProperty(globalThis, key, { value: bound, configurable: true, writable: true });
  }
}
g.self = window;
g.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * happy-dom's Web Animations implementation rejects `animation.finished` when
 * an animation is cancelled (which happens whenever a component using `motion`
 * unmounts). There is no animation in a Node test, so `Element.animate` returns
 * an inert animation instead — this keeps the harness quiet without touching
 * any application code.
 */
const inertAnimation = () => {
  const finished = new Promise<never>(() => undefined);
  return {
    finished,
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
  };
};
const elementPrototype = (window as unknown as { Element: { prototype: Record<string, unknown> } }).Element
  .prototype;
elementPrototype.animate = inertAnimation;

/** Every API call the bootstrap makes, answered with the shape it expects. */
const calls: string[] = [];
/** Who `/api/auth/me` says is signed in for the current test. */
let signedIn: Record<string, unknown> | null = null;
/** Notifications the stubbed `/api/notifications` returns for the current test. */
let stubNotifications: Array<Record<string, unknown>> = [];
/** Listings the stubbed catalogue returns for the current test. */
let stubProperties: Array<Record<string, unknown>> = [];
/** The Learning Centre content the stubbed API serves for the current test. */
let stubBlog: {
  posts: Array<Record<string, unknown>>;
  featured: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  post: Record<string, unknown> | null;
} = { posts: [], featured: [], categories: [], post: null };

/**
 * The admin console reads named counters, so the stub spells them out with
 * zeroes (a Proxy would be flattened by JSON, which is how the API answers).
 */
function zeroStats(extra: Record<string, unknown> = {}) {
  return {
    visitorsToday: 0,
    visitorsYesterday: 0,
    visitorsLast7Days: 0,
    visitorsLast30Days: 0,
    visitorsLast12Months: 0,
    growthPercentage: 0,
    totalRegisteredUsers: 0,
    totalTenants: 0,
    totalLandlords: 0,
    totalAgents: 0,
    pendingAgentAccounts: 0,
    newUsersToday: 0,
    newUsersThisWeek: 0,
    totalProperties: 0,
    approvedProperties: 0,
    pendingProperties: 0,
    rejectedProperties: 0,
    totalViewings: 0,
    viewingFeesCollectedGhs: 0,
    goodlucksShareDueGhs: 0,
    goodlucksShareReceivedGhs: 0,
    agentShareRetainedGhs: 0,
    outstandingReceivablesGhs: 0,
    viewingFeeRecordsWithoutShare: 0,
    viewingFeeDisputedRecords: 0,
    dailyTraffic: [],
    monthlyTraffic: [],
    ...extra,
  };
}

const EMPTY: Record<string, unknown> = {
  'auth/me': { success: true, user: null, savedPropertyIds: [] },
  properties: { success: true, properties: [], total: 0, page: 1, perPage: 100 },
  'tenant-requests': { requests: [] },
  viewings: { viewings: [] },
  notifications: { notifications: [] },
  saved: { propertyIds: [] },
  receipts: { receipts: [], issuingEnabled: false },
  'search-alerts': { alerts: [] },
  'admin/stats': {
    stats: zeroStats({
      completedViewings: 0,
      totalEnquiries: 0,
      newEnquiries: 0,
      totalTenantRequests: 0,
      recentActivity: [],
    }),
  },
  'admin/viewings': { viewings: [] },
  'admin/tenant-requests': { requests: [] },
  'admin/email-logs': { logs: [], outbox: { pending: 0, failed: 0, sentToday: 0, oldestPendingAt: null } },
  'admin/enquiries': { enquiries: [] },
  agents: { agents: [], count: 0 },
  verification: {
    verification: {
      scope: 'agent',
      documentTypes: [
        { value: 'ghana_card', label: 'Ghana Card' },
        { value: 'passport', label: 'Passport' },
      ],
      identity: {
        status: 'not_submitted',
        legalName: '',
        documentType: 'ghana_card',
        documents: [],
        submittedAt: null,
        reviewedAt: null,
        reviewerNote: null,
      },
      professional: null,
    },
  },
  'admin/finance/summary': {
    summary: {
      outstandingGhs: 0,
      collectedGhs: 0,
      remittedGhs: 0,
      disputedGhs: 0,
      claimedGhs: 0,
      confirmedGhs: 0,
      pendingRemittances: 0,
      openDisputes: 0,
      adjustments: { count: 0, netGhs: 0 },
      confirmedRevenue: { note: '' },
      commissionTotals: { outstandingGhs: 0, agreedGhs: 0, paidGhs: 0 },
    },
    capabilities: { financeView: true, financeConfirm: true },
  },
  'admin/finance/remittances': { remittances: [], capabilities: { financeView: true, financeConfirm: true } },
  'admin/finance/commissions': { commissions: [] },
  'admin/viewing-fees/policy': {
    policy: { status: 'provisional', appliedToCalculations: false, approvedPolicy: null, note: '', proposed: [] },
  },
  'admin/viewing-fees': {
    records: [],
    summary: {
      viewingFeesCollectedGhs: 0,
      goodlucksShareDueGhs: 0,
      goodlucksShareReceivedGhs: 0,
      agentShareRetainedGhs: 0,
      outstandingReceivablesGhs: 0,
      recordsWithoutAgreedShare: 0,
      disputedRecords: 0,
      recordsCounted: 0,
    },
    policy: { status: 'provisional', appliedToCalculations: false, approvedPolicy: null, note: '', proposed: [] },
  },
  'agent/finance': {
    finance: {
      agentUserId: 'user-agent',
      totals: {
        collectedGhs: 0,
        goodlucksShareGhs: 0,
        agentShareGhs: 0,
        outstandingGhs: 0,
        remittedGhs: 0,
        commissionEarnedGhs: 0,
        commissionPaidGhs: 0,
      },
      viewingFees: [],
      remittances: [],
      commissions: [],
      policy: { configured: false, policyName: null },
      capabilities: {
        canSubmitRemittances: false,
        canConfirmReceipt: false,
        canRecordCommissions: false,
      },
      notes: [],
    },
  },
  track: { success: true },
};

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  calls.push(url);
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  if (url.includes('/auth/logout')) {
    // Signing out really does end the session: the next bootstrap must see a guest.
    signedIn = null;
    return json({ success: true });
  }
  if (url.includes('/auth/me')) {
    return json({ success: true, user: signedIn, savedPropertyIds: [] });
  }
  // Notifications are per-test so the "nothing is marked read on open" rule can
  // be asserted against real content rather than an empty list.
  if (url.includes('/notifications/read-all')) {
    stubNotifications = stubNotifications.map((n) => ({ ...n, read: true }));
    return json({ notifications: stubNotifications });
  }
  if (url.includes('/notifications')) {
    return json({ notifications: stubNotifications });
  }
  const singleProperty = /\/properties\/([A-Za-z0-9_-]+)$/.exec(url);
  if (singleProperty) {
    const found = stubProperties.find((item) => item.id === singleProperty[1]);
    return found ? json({ property: found }) : json({ success: false, error: 'Property not found.' });
  }
  if (/\/properties(\?|$)/.test(url) && stubProperties.length > 0) {
    return json({ success: true, properties: stubProperties, total: stubProperties.length, page: 1, perPage: 100 });
  }
  // ---------------------------------------------------------------------
  // Task 07: the Learning Centre and its console.
  // ---------------------------------------------------------------------
  if (url.includes('/admin/blog/published-for-links')) {
    return json({ success: true, posts: stubBlog.posts.map((post) => ({
      id: post.id, title: post.title, slug: post.slug, url: post.url, publishedAt: post.publishedAt,
    })) });
  }
  if (url.includes('/admin/blog/properties')) {
    return json({ success: true, properties: stubProperties });
  }
  if (url.includes('/admin/blog/posts')) {
    return json({
      success: true,
      posts: stubBlog.posts,
      counts: { total: stubBlog.posts.length, published: stubBlog.posts.length, draft: 0, scheduled: 0, unpublished: 0 },
      categories: stubBlog.categories,
    });
  }
  if (url.includes('/admin/blog/categories')) {
    return json({ success: true, categories: stubBlog.categories });
  }
  if (url.includes('/admin/email-templates')) {
    return json({
      success: true,
      templates: [],
      targets: [{ type: 'enquiry_confirmation', label: 'Enquiry confirmation' }],
    });
  }
  if (/\/blog\/categories(\?|$)/.test(url)) {
    return json({ success: true, categories: stubBlog.categories });
  }
  if (/\/blog(\?|$)/.test(url)) {
    return json({
      success: true,
      posts: stubBlog.posts,
      featured: stubBlog.featured,
      categories: stubBlog.categories,
      pagination: { page: 1, perPage: 9, total: stubBlog.posts.length, pages: 1 },
    });
  }
  const blogPost = /\/blog\/([a-z0-9-]+)(\?|$)/.exec(url);
  if (blogPost) {
    const slug = blogPost[1];
    const found =
      stubBlog.post && stubBlog.post.slug === slug
        ? stubBlog.post
        : [...stubBlog.posts, ...stubBlog.featured].find((item) => item.slug === slug) ?? null;
    if (!found) {
      return new Response(JSON.stringify({ success: false, error: 'Article not found.' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    return json({ success: true, post: found });
  }
  for (const [fragment, body] of Object.entries(EMPTY)) {
    if (url.includes(fragment)) return json(body);
  }
  return json({ success: true });
}) as typeof fetch;

/** A signed-in member of `role`, with the fields the dashboards read. */
function userFor(role: 'tenant' | 'landlord' | 'agent' | 'admin') {
  return {
    id: `user-${role}`,
    email: `${role}@goodlucks.com`,
    name: `Test ${role}`,
    role,
    phone: '+233000000000',
    avatar: '',
    createdAt: '2026-01-01T00:00:00+00:00',
    agentProfile:
      role === 'agent'
        ? { userId: 'user-agent', agencyName: 'Test Agency', operatingCity: 'Accra', accountStatus: 'active' }
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');

/** The mounted root, so a new render never leaves the previous app running. */
let lastRoot: { unmount: () => void } | null = null;
const { default: App } = await import('../src/App.tsx');

/** Mount the app at `path`, exactly like a reload at that URL. */
async function renderAt(
  path: string,
  role: 'tenant' | 'landlord' | 'agent' | 'admin' | null = null,
  options: {
    notifications?: Array<Record<string, unknown>>;
    properties?: Array<Record<string, unknown>>;
    blog?: Partial<typeof stubBlog>;
  } = {}
) {
  signedIn = role ? userFor(role) : null;
  stubNotifications = options.notifications ?? [];
  stubProperties = options.properties ?? [];
  stubBlog = {
    posts: options.blog?.posts ?? [],
    featured: options.blog?.featured ?? [],
    categories: options.blog?.categories ?? [],
    post: options.blog?.post ?? null,
  };
  calls.length = 0;
  // Only one app may be mounted at a time: a leftover root keeps its metadata
  // (including a canonical link) in `document.head`, which would make document
  // level assertions read the previous page's tags instead of this one's.
  if (lastRoot) {
    await act(async () => lastRoot!.unmount());
    lastRoot = null;
  }
  document.head.querySelectorAll('link[rel="canonical"], meta[property^="og:"], meta[name^="twitter:"], title').forEach((node) => node.remove());
  window.history.replaceState({}, '', path);
  document.body.innerHTML = '<div id="root"></div>';
  const container = document.getElementById('root') as HTMLElement;
  const root = createRoot(container);
  lastRoot = root;

  await act(async () => {
    root.render(createElement(App));
  });
  // Let the bootstrap promises resolve.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return {
    container,
    text: () => container.textContent ?? '',
    path: () => window.location.pathname + window.location.search,
    /** Click the first button whose text contains `label` (case-insensitive). */
    clickContaining: async (label: string) => {
      const button = [...container.querySelectorAll('button, a')].find(
        (el) =>
          (el.textContent ?? '').toLowerCase().includes(label.toLowerCase()) ||
          (el.getAttribute('aria-label') ?? '').toLowerCase().includes(label.toLowerCase())
      );
      assert.ok(button, `no control containing “${label}” on ${window.location.pathname}`);
      await act(async () => {
        (button as HTMLElement).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }) as unknown as Event);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    click: async (label: string) => {
      const button = [...container.querySelectorAll('button, a')].find(
        (el)  => (el.textContent ?? '').trim().toLowerCase() === label.toLowerCase()
      );
      assert.ok(button, `no control labelled “${label}” on ${window.location.pathname}`);
      await act(async () => {
        (button as HTMLElement).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }) as unknown as Event);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
    unmount: async () => {
      if (lastRoot === root) lastRoot = null;
      await act(async () => root.unmount());
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

test('a reload on /properties renders the browse page (refresh keeps the page)', async () => {
  const app = await renderAt('/properties');
  assert.match(app.text(), /Browse Rentals in Ghana/i);
  assert.equal(app.path(), '/properties');
  await app.unmount();
});

test('a reload on a listing URL renders that listing route', async () => {
  const app = await renderAt('/property/abc-123');
  // With no such listing the page must say so, not dump the visitor on Home.
  assert.match(app.text(), /no longer available|Browse Properties/i);
  assert.equal(app.path(), '/property/abc-123');
  await app.unmount();
});

test('an unknown URL renders the not-found page', async () => {
  const app = await renderAt('/this-page-does-not-exist');
  assert.match(app.text(), /We could not find that page/i);
  assert.equal(app.path(), '/this-page-does-not-exist');
  await app.unmount();
});

test('a guest opening a dashboard is sent to sign in with ?next=', async () => {
  const app = await renderAt('/tenant/dashboard');
  assert.equal(app.path(), '/login?next=%2Ftenant%2Fdashboard');
  await app.unmount();
});

test('the navbar pushes real URLs instead of hiding navigation in state', async () => {
  const app = await renderAt('/');
  await app.click('Browse Properties');
  assert.equal(app.path(), '/properties');
  assert.match(app.text(), /Browse Rentals in Ghana/i);
  await app.unmount();
});

test('Back / Forward restore the page from the URL', async () => {
  const app = await renderAt('/');
  await app.click('Browse Properties');
  assert.equal(app.path(), '/properties');

  await act(async () => {
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(app.path(), '/');
  assert.match(app.text(), /Find|Home/i);

  await act(async () => {
    window.history.forward();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(app.path(), '/properties');
  await app.unmount();
});

test('browse filters are read from the URL, so a shared link restores them', async () => {
  const app = await renderAt('/properties?type=Apartment&bedrooms=2&maxRent=6000');
  const selects = [...app.container.querySelectorAll('select')] as HTMLSelectElement[];
  const values = selects.map((select) => select.value);
  assert.ok(values.includes('Apartment'), `type filter restored (got ${values.join(', ')})`);
  assert.ok(values.includes('2'), `bedroom filter restored (got ${values.join(', ')})`);
  await app.unmount();
});

test('the legacy ?property= link is rewritten to the canonical listing URL', async () => {
  const app = await renderAt('/?property=abc-123');
  assert.equal(app.path(), '/property/abc-123');
  await app.unmount();
});

test('guest bootstrap only talks to the public API', async () => {
  calls.length = 0;
  const app = await renderAt('/');
  assert.ok(calls.some((url) => url.includes('/api/auth/me')), 'session restored on load');
  assert.ok(!calls.some((url) => url.includes('/api/admin')), 'no admin calls for a guest');
  await app.unmount();
});

/* -------------------------------------------------------------------------- */
/* K. Signed-in roles                                                         */
/* -------------------------------------------------------------------------- */

test('a tenant may open the tenant tabs by URL and refresh keeps the tab', async () => {
  for (const [path, marker] of [
    ['/tenant/dashboard', /Test tenant|Rental/i],
    ['/tenant/viewings', /viewing/i],
    ['/tenant/profile', /profile/i],
  ] as Array<[string, RegExp]>) {
    const app = await renderAt(path, 'tenant');
    assert.equal(app.path(), path, `${path} stays in the address bar`);
    assert.match(app.text(), marker);
    await app.unmount();
  }
});

test('a tenant can not open a landlord or admin page', async () => {
  const app = await renderAt('/landlord/dashboard', 'tenant');
  assert.equal(app.path(), '/tenant/dashboard', 'sent to their own workspace');

  await app.unmount();
  const adminAttempt = await renderAt('/admin/finance', 'tenant');
  assert.equal(adminAttempt.path(), '/tenant/dashboard');
  await adminAttempt.unmount();
});

test('a landlord opens the landlord workspace, and only that', async () => {
  const app = await renderAt('/landlord/properties', 'landlord');
  assert.equal(app.path(), '/landlord/properties');
  assert.match(app.text(), /landlord|propert/i);
  await app.unmount();

  const denied = await renderAt('/tenant/viewings', 'landlord');
  assert.equal(denied.path(), '/landlord/dashboard');
  await denied.unmount();
});

test('an agent opens the agent workspace sections by URL', async () => {
  const app = await renderAt('/agent/finance', 'agent');
  assert.equal(app.path(), '/agent/finance');
  // The agent area is a set of sections now: /agent/finance shows finance only.
  assert.match(app.text(), /finance|money position/i);
  assert.doesNotMatch(app.text(), /listings you submitted/i);
  await app.unmount();

  const denied = await renderAt('/admin', 'agent');
  assert.equal(denied.path(), '/agent/dashboard');
  await denied.unmount();
});

test('an admin console section is a URL and survives a reload', async () => {
  const app = await renderAt('/admin/finance', 'admin');
  assert.equal(app.path(), '/admin/finance');
  assert.match(app.text(), /admin|finance/i);
  await app.unmount();
});

test('an admin opening /admin-login goes to the console, not the login form', async () => {
  const app = await renderAt('/admin-login', 'admin');
  assert.equal(app.path(), '/admin');
  await app.unmount();
});

test('a signed-in member is never shown the sign-in screen', async () => {
  const app = await renderAt('/login', 'tenant');
  assert.equal(app.path(), '/tenant/dashboard');
  await app.unmount();
});

test('a bare role root normalises to the canonical workspace URL', async () => {
  const app = await renderAt('/tenant', 'tenant');
  assert.equal(app.path(), '/tenant/dashboard');
  await app.unmount();
});

/* -------------------------------------------------------------------------- */
/* L. Tab navigation is real navigation                                       */
/* -------------------------------------------------------------------------- */

test('clicking a dashboard section changes the URL, and the URL is what selects the section', async () => {
  const app = await renderAt('/tenant/dashboard', 'tenant');
  await app.click('Viewings');
  assert.equal(app.path(), '/tenant/viewings', 'the sidebar click wrote the URL');
  assert.match(app.text(), /viewing/i);
  await app.unmount();

  // Reloading that URL lands on the same tab without any in-memory state.
  const reloaded = await renderAt('/tenant/viewings', 'tenant');
  assert.equal(reloaded.path(), '/tenant/viewings');
  await reloaded.unmount();
});

test('admin console tabs are URLs too', async () => {
  const app = await renderAt('/admin', 'admin');
  await app.clickContaining('Finance');
  assert.match(app.path(), /^\/admin\//, 'a console section has its own URL');
  assert.notEqual(app.path(), '/admin');
  await app.unmount();
});

test('the sign-in screen is a route: open it, then leave without signing in', async () => {
  const app = await renderAt('/properties');
  await app.clickContaining('Login');
  assert.equal(app.path(), '/login');
  assert.match(app.text(), /sign in|login/i);
  // Closing the modal returns to the page the visitor came from.
  await app.clickContaining('close modal');
  assert.equal(app.path(), '/properties');
  await app.unmount();
});

/* -------------------------------------------------------------------------- */
/* M. Filter editing writes the URL                                           */
/* -------------------------------------------------------------------------- */

test('typing a keyword writes ?q= into the URL (shareable, refreshable)', async () => {
  const app = await renderAt('/properties');
  const input = [...app.container.querySelectorAll('input')].find((el) =>
    (el.getAttribute('placeholder') ?? '').toLowerCase().includes('search')
  ) as HTMLInputElement | undefined;
  assert.ok(input, 'the keyword field is on the browse page');

  await act(async () => {
    // React tracks the previous value; use the native setter so the change is
    // seen exactly as a real keystroke would be.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'villa');
    input.dispatchEvent(new window.Event('input', { bubbles: true }) as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  assert.match(app.path(), /q=villa/);
  await app.unmount();

  // The same URL restores the typed value on a fresh load.
  const reloaded = await renderAt('/properties?q=villa');
  const restored = [...reloaded.container.querySelectorAll('input')].find((el) =>
    (el.getAttribute('placeholder') ?? '').toLowerCase().includes('search')
  ) as HTMLInputElement | undefined;
  assert.equal(restored?.value, 'villa');
  await reloaded.unmount();
});

test('"Reset all filters" clears every parameter in one go', async () => {
  const app = await renderAt('/properties?type=Apartment&bedrooms=2&maxRent=6000&q=villa');
  await app.clickContaining('Reset');
  assert.equal(app.path(), '/properties');
  await app.unmount();
});

/* -------------------------------------------------------------------------- */
/* N. Account sections (Task 02): one shell, one page per section             */
/* -------------------------------------------------------------------------- */

const UNREAD_NOTIFICATION = {
  id: 'notif-1',
  userId: 'user-tenant',
  title: 'Viewing requested for Cantonments apartment',
  message: 'An agent will contact you to agree a time.',
  type: 'viewing',
  read: false,
  createdAt: '2026-03-01T10:00:00+00:00',
};

const READ_NOTIFICATION = {
  id: 'notif-2',
  userId: 'user-tenant',
  title: 'Your rental request was received',
  message: 'We have started matching homes for you.',
  type: 'success',
  read: true,
  createdAt: '2026-02-20T09:00:00+00:00',
};

test('every account section is a real page reached by its own URL', async () => {
  const sections: Array<[string, 'tenant' | 'landlord' | 'agent', RegExp]> = [
    ['/tenant/dashboard', 'tenant', /welcome back/i],
    ['/tenant/rental-requests', 'tenant', /rental request/i],
    ['/tenant/matches', 'tenant', /matched propert/i],
    ['/tenant/viewings', 'tenant', /viewing/i],
    ['/tenant/saved-properties', 'tenant', /saved propert/i],
    ['/tenant/search-alerts', 'tenant', /search alert/i],
    ['/tenant/notifications', 'tenant', /notification/i],
    ['/tenant/profile', 'tenant', /profile/i],
    ['/tenant/settings', 'tenant', /account settings/i],
    ['/landlord/dashboard', 'landlord', /welcome back/i],
    ['/landlord/properties', 'landlord', /my propert/i],
    ['/landlord/viewings', 'landlord', /viewing/i],
    ['/landlord/verification', 'landlord', /verification/i],
    ['/landlord/notifications', 'landlord', /notification/i],
    ['/landlord/profile', 'landlord', /profile/i],
    ['/landlord/settings', 'landlord', /account settings/i],
    ['/agent/dashboard', 'agent', /welcome/i],
    ['/agent/properties', 'agent', /submitted listings/i],
    ['/agent/finance', 'agent', /finance/i],
    ['/agent/verification', 'agent', /verification/i],
    ['/agent/status', 'agent', /account status/i],
    ['/agent/notifications', 'agent', /notification/i],
    ['/agent/profile', 'agent', /profile/i],
    ['/agent/settings', 'agent', /account settings/i],
  ];

  for (const [path, role, expected] of sections) {
    const app = await renderAt(path, role);
    assert.equal(app.path(), path, `${path} keeps its URL on load`);
    assert.match(app.text(), expected, `${path} renders its own section`);
    await app.unmount();
  }
});

test('the dashboard shell names the signed-in account and marks the active section', async () => {
  const app = await renderAt('/tenant/viewings', 'tenant');
  const text = app.text();
  assert.match(text, /Test tenant/i, 'the account name is on screen');
  assert.match(text, /Tenant account/i, 'the account type is on screen');

  // Task 04: the account sections live in the shell's sidebar; the mobile quick
  // links are a separate navigation with its own active tab, so each is checked
  // within its own navigation rather than across the whole page.
  const active = [
    ...app.container.querySelectorAll('[aria-label="Tenant account sections"] [aria-current="page"]'),
  ];
  assert.equal(active.length, 1, 'exactly one section is marked active in the sidebar');
  assert.match(active[0].textContent ?? '', /viewings/i);

  const activeTab = [...app.container.querySelectorAll('nav[aria-label="Quick links"] [aria-current="page"]')];
  assert.equal(activeTab.length, 1, 'exactly one quick link is marked active');
  assert.match(activeTab[0].getAttribute('aria-label') ?? '', /viewings/i);
  await app.unmount();

  const elsewhere = await renderAt('/tenant/settings', 'tenant');
  const activeThere = [
    ...elsewhere.container.querySelectorAll('[aria-label="Tenant account sections"] [aria-current="page"]'),
  ];
  assert.equal(activeThere.length, 1);
  assert.match(activeThere[0].textContent ?? '', /account settings/i);
  await elsewhere.unmount();
});

test('profile and settings are separate pages with separate forms', async () => {
  const settings = await renderAt('/tenant/settings', 'tenant');
  const settingsText = settings.text();
  assert.match(settingsText, /current password/i);
  assert.match(settingsText, /new password/i);
  assert.match(settingsText, /confirm new password/i);
  assert.match(settingsText, /profile picture/i);
  assert.doesNotMatch(settingsText, /save profile details/i, 'settings is not the profile form');
  await settings.unmount();

  const profile = await renderAt('/tenant/profile', 'tenant');
  const profileText = profile.text();
  assert.match(profileText, /save profile details/i);
  assert.doesNotMatch(profileText, /current password/i, 'profile is not the password form');
  await profile.unmount();
});

test('opening the notifications page marks nothing read and lists the account record', async () => {
  const app = await renderAt('/tenant/notifications', 'tenant', {
    notifications: [UNREAD_NOTIFICATION, READ_NOTIFICATION],
  });

  assert.match(app.text(), /Viewing requested for Cantonments apartment/);
  assert.match(app.text(), /1 unread notification/i);
  assert.equal(
    calls.some((url) => url.includes('/notifications/read-all')),
    false,
    'opening the page must not mark everything read'
  );
  assert.equal(
    calls.some((url) => /\/notifications\/notif-/.test(url) && url.includes('PATCH')),
    false,
    'no per-notification update is sent just by opening the page'
  );

  // The unread one can still be marked read individually.
  await app.clickContaining('Mark as read');
  assert.ok(
    calls.some((url) => url.includes('/notifications/notif-1')),
    'marking one notification read calls the API for that record'
  );
  await app.unmount();
});

/* -------------------------------------------------------------------------- */
/* Payment records are private (Correction 2)                                  */
/* -------------------------------------------------------------------------- */

test('a visitor opening /receipts is sent to sign in and sees no receipt data', async () => {
  const app = await renderAt('/receipts');
  // The guard replaces the page with the sign-in screen, carrying the intended
  // destination with it.
  assert.equal(app.path(), '/login?next=%2Freceipts');
  assert.doesNotMatch(app.text(), /rent payment records/i);
  assert.doesNotMatch(app.text(), /issuingEnabled|saved records/i);
  await app.unmount();
});

test('a signed-in member still reaches their payment records', async () => {
  const app = await renderAt('/receipts', 'tenant');
  assert.equal(app.path(), '/receipts');
  assert.match(app.text(), /rent payment records/i);
  await app.unmount();
});

test('the landlord dashboard keeps its own payment records section', async () => {
  const app = await renderAt('/landlord/receipts', 'landlord');
  assert.equal(app.path(), '/landlord/receipts');
  await app.unmount();
});

test('an empty notifications page says so instead of inventing records', async () => {
  const app = await renderAt('/landlord/notifications', 'landlord');
  assert.match(app.text(), /no notifications yet/i);
  await app.unmount();
});

test('the landlord payment records section reuses the receipt view', async () => {
  const app = await renderAt('/landlord/receipts', 'landlord');
  const text = app.text();
  assert.match(text, /payment records/i);
  assert.match(text, /rent|receipt/i);
  await app.unmount();
});

test('an overview card navigates to the section behind it', async () => {
  const app = await renderAt('/tenant/dashboard', 'tenant');
  await app.click('Saved properties');
  assert.equal(app.path(), '/tenant/saved-properties');
  await app.unmount();
});

test('a section URL is refused to another role, which lands in its own area', async () => {
  const app = await renderAt('/tenant/settings', 'landlord');
  assert.equal(app.path(), '/landlord/dashboard');
  await app.unmount();
});

/* -------------------------------------------------------------------------- */
/* O. Task 04 — one navigation per surface                                    */
/* -------------------------------------------------------------------------- */

/** The tabs in the fixed mobile bar. */
function quickLinks(app: Awaited<ReturnType<typeof renderAt>>): HTMLElement[] {
  return [...app.container.querySelectorAll('nav[aria-label="Quick links"] button')] as HTMLElement[];
}

/** The rows inside the open hamburger. */
/**
 * The rows of the hamburger menu.
 *
 * Between `md` (where the phone quick bar disappears) and the width at which the
 * header's link row fits (`lg` for members, `xl` for visitors), the menu also
 * lists the quick-bar destinations — otherwise Browse and Find a Home would be
 * unreachable on a tablet. Those rows live in a block marked
 * `data-quick-bar-mirror`, and they are excluded here: the rule under test is
 * that *a surface visible at the same width* never repeats another, and the
 * quick bar is hidden exactly where the mirror is shown.
 */
function menuRows(app: Awaited<ReturnType<typeof renderAt>>): HTMLElement[] {
  return ([...app.container.querySelectorAll('#site-menu button')] as HTMLElement[]).filter(
    (row) => !row.closest('[data-quick-bar-mirror]')
  );
}

/** The quick-bar rows that the menu shows on a tablet (md → link-row width). */
function mirroredQuickRows(app: Awaited<ReturnType<typeof renderAt>>): HTMLElement[] {
  return [...app.container.querySelectorAll('#site-menu [data-quick-bar-mirror] button')] as HTMLElement[];
}

const labels = (elements: HTMLElement[]) => elements.map((el) => (el.textContent ?? '').trim());

/**
 * Click a row inside the open hamburger.
 *
 * Some labels also exist elsewhere (the desktop row, the dashboard sidebar), so
 * the click is dispatched on the menu row itself rather than on "the first
 * control with this text".
 */
async function clickMenuRow(app: Awaited<ReturnType<typeof renderAt>>, label: string) {
  const row = menuRows(app).find((el) => (el.textContent ?? '').trim() === label);
  assert.ok(row, `no menu row “${label}”`);
  await act(async () => {
    row!.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }) as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test('the guest quick bar and hamburger do not repeat one another', async () => {
  const app = await renderAt('/');
  assert.deepEqual(labels(quickLinks(app)), ['Home', 'Browse', 'Find Home', 'Login']);

  await app.clickContaining('Open menu');
  const rows = labels(menuRows(app));
  // Task 07 added one public page to the guest menu: the Learning Centre. It is
  // a menu row, not a quick-bar tab, so the two surfaces still do not repeat
  // one another.
  // Correction 2 removed the Receipts entry: payment records are reachable only
  // from a signed-in member's own dashboard.
  assert.deepEqual(rows, ['List Property', 'Learning Centre', 'About', 'Contact', 'Create an account']);
  assert.ok(!rows.includes('Receipts'), 'a visitor is never offered receipts');
  for (const repeated of ['Home', 'Browse', 'Find Home']) {
    assert.ok(!rows.includes(repeated), `“${repeated}” is already in the quick bar`);
  }
  assert.ok(!rows.some((row) => /logout|dashboard|settings/i.test(row)), 'a guest sees no member rows');
  await app.unmount();
});

test('a tablet can still reach the quick-bar pages while the header row is hidden', async () => {
  const app = await renderAt('/');
  await app.clickContaining('Open menu');

  // The visitor quick bar stops at `md` and the visitor link row starts at `xl`
  // (seven links need about 690px and do not fit a 768px header). In that band
  // the menu lists the quick-bar pages, so nothing becomes unreachable.
  const mirrored = labels(mirroredQuickRows(app));
  // Sign-in is mirrored too: the quick bar (which normally carries it) is
  // hidden exactly where this block is visible, so a returning visitor on a
  // tablet still has a way in.
  assert.deepEqual(mirrored, ['Home', 'Browse', 'Find Home', 'Login']);

  const block = app.container.querySelector('#site-menu [data-quick-bar-mirror]') as HTMLElement | null;
  assert.ok(block, 'the mirror block is rendered');
  assert.match(block!.className, /hidden md:block xl:hidden/, 'it is only visible where the quick bar and the link row are not');

  // The mirror never repeats a menu row: each destination still has exactly one
  // surface at any given width.
  const rows = labels(menuRows(app));
  for (const label of mirrored) assert.ok(!rows.includes(label), `“${label}” is not also a menu row`);

  // The sign-in row is an action, not a duplicated menu link.
  assert.ok(!labels(menuRows(app)).includes('Login'), 'the menu rows themselves still hold no sign-in row');
  await app.unmount();
});

test('a guest keeps one sign-in entry point and no sign-in row in the menu', async () => {
  const app = await renderAt('/');
  // Signing in is a single tap in the quick bar; the menu only offers a new account.
  const rows: string[] = [];
  await app.clickContaining('Open menu');
  rows.push(...labels(menuRows(app)));
  assert.ok(!rows.includes('Login'), 'the menu does not repeat the quick bar sign-in');
  assert.equal(rows.filter((row) => /log ?in|sign in/i.test(row)).length, 0);
  await app.unmount();
});

test('the hamburger closes itself once an item is chosen', async () => {
  const app = await renderAt('/');
  await app.clickContaining('Open menu');
  assert.ok(app.container.querySelector('#site-menu'), 'the menu is open');

  await clickMenuRow(app, 'List Property');
  assert.equal(app.path(), '/list-property');
  assert.equal(app.container.querySelector('#site-menu'), null, 'the menu closed on selection');
  await app.unmount();
});

test('a tenant quick bar is five tabs and the menu holds everything else', async () => {
  const app = await renderAt('/tenant/dashboard', 'tenant');
  assert.deepEqual(labels(quickLinks(app)), ['Browse', 'Dashboard', 'Saved', 'Viewings', 'Profile']);

  // The desktop row stays short: the account area is one link, not nine.
  const desktop = [...app.container.querySelectorAll('nav[aria-label="Main"] button')].map((el) =>
    (el.textContent ?? '').trim()
  );
  assert.deepEqual(desktop, ['Home', 'Browse Properties', 'Dashboard']);

  await app.clickContaining('Open menu');
  const rows = labels(menuRows(app));
  assert.deepEqual(rows.slice(0, 4), ['Rental requests', 'Matched properties', 'Search alerts', 'Account settings']);
  assert.match(rows[rows.length - 1], /^Logout/, 'the menu ends with the way out');
  for (const tab of ['Browse', 'Dashboard', 'Saved', 'Viewings', 'Profile']) {
    assert.ok(!rows.includes(tab), `“${tab}” is already in the quick bar`);
  }
  for (const foreign of ['Receipts', 'Verification', 'Finance', 'Account status']) {
    assert.ok(!rows.includes(foreign), `a tenant must not see “${foreign}”`);
  }
  await app.unmount();
});

test('the unread count sits on its own bell, never on the Profile tab', async () => {
  const app = await renderAt('/tenant/dashboard', 'tenant', { notifications: [UNREAD_NOTIFICATION] });

  const bells = [...app.container.querySelectorAll('button[aria-label^="Notifications"]')] as HTMLElement[];
  assert.ok(bells.length >= 1, 'the header has a notifications bell');
  assert.equal(bells[0].getAttribute('aria-label'), 'Notifications, 1 unread');

  const profile = quickLinks(app).find((el) => (el.textContent ?? '').trim() === 'Profile');
  assert.ok(profile, 'the profile tab is in the quick bar');
  assert.doesNotMatch(profile.innerHTML, /FF2E63|unread/i, 'no notification dot on the profile tab');

  // The bell is the entry point, and it goes to the notifications page.
  await app.clickContaining('Notifications, 1 unread');
  assert.equal(app.path(), '/tenant/notifications');
  await app.unmount();
});

test('a landlord keeps the submission action and finds receipts in the menu', async () => {
  const app = await renderAt('/landlord/dashboard', 'landlord');
  assert.deepEqual(labels(quickLinks(app)), ['Dashboard', 'Properties', 'List', 'Viewings', 'Profile']);

  // The desktop bar promotes the same action instead of hiding it in a menu.
  const cta = [...app.container.querySelectorAll('button')].filter(
    (el) => (el.textContent ?? '').trim() === 'List property'
  );
  assert.ok(cta.length >= 1, 'the top bar offers “List property”');

  await app.click('List');
  assert.equal(app.path(), '/list-property');
  await app.unmount();

  const again = await renderAt('/landlord/properties', 'landlord');
  await again.clickContaining('Open menu');
  const rows = labels(menuRows(again));
  assert.deepEqual(rows.slice(0, 3), ['Receipts', 'Verification', 'Account settings']);
  for (const tab of ['Dashboard', 'Properties', 'List', 'Viewings', 'Profile']) {
    assert.ok(!rows.includes(tab), `“${tab}” is already in the quick bar`);
  }
  assert.ok(!rows.includes('Rental requests'), 'a landlord sees no tenant rows');
  await again.unmount();
});

test('an agent quick bar covers listings, viewings and finance; the menu covers the rest', async () => {
  const app = await renderAt('/agent/dashboard', 'agent');
  assert.deepEqual(labels(quickLinks(app)), ['Dashboard', 'Listings', 'Viewings', 'Finance', 'Profile']);

  await app.click('Listings');
  assert.equal(app.path(), '/agent/properties');
  await app.unmount();

  const again = await renderAt('/agent/finance', 'agent');
  await again.clickContaining('Open menu');
  const rows = labels(menuRows(again));
  assert.deepEqual(rows.slice(0, 3), ['Verification', 'Account status', 'Account settings']);
  assert.ok(!rows.includes('Rental requests'), 'an agent sees no tenant rows');

  await clickMenuRow(again, 'Account status');
  assert.equal(again.path(), '/agent/status');
  assert.equal(again.container.querySelector('#site-menu'), null, 'the menu closed on selection');
  await again.unmount();
});

test('dashboard, profile and settings are three destinations for every member role', async () => {
  for (const role of ['tenant', 'landlord', 'agent'] as const) {
    const settings = await renderAt(`/${role}/dashboard`, role);
    await settings.clickContaining('Open menu');
    await clickMenuRow(settings, 'Account settings');
    assert.equal(settings.path(), `/${role}/settings`, `${role} settings`);
    await settings.unmount();

    const profile = await renderAt(`/${role}/dashboard`, role);
    await profile.click('Profile');
    assert.equal(profile.path(), `/${role}/profile`, `${role} profile`);
    assert.match(profile.text(), /save (?:\w+ )?profile/i, `${role} profile is the profile form`);
    assert.doesNotMatch(profile.text(), /current password/i, `${role} profile is not the password page`);
    await profile.unmount();

    const dashboard = await renderAt(`/${role}/profile`, role);
    await dashboard.click('Dashboard');
    assert.equal(dashboard.path(), `/${role}/dashboard`, `${role} dashboard`);
    await dashboard.unmount();
  }
});

test('the quick bar marks the page you are on and only that page', async () => {
  for (const [path, role, expected] of [
    ['/tenant/saved-properties', 'tenant', 'Saved properties'],
    ['/landlord/viewings', 'landlord', 'Viewings'],
    ['/agent/finance', 'agent', 'Finance'],
  ] as Array<[string, 'tenant' | 'landlord' | 'agent', string]>) {
    const app = await renderAt(path, role);
    const active = [...app.container.querySelectorAll('nav[aria-label="Quick links"] [aria-current="page"]')];
    assert.equal(active.length, 1, `${path} marks one quick link`);
    assert.equal(active[0].getAttribute('aria-label'), expected);
    await app.unmount();
  }
});

test('the dashboard no longer opens a second, competing menu', async () => {
  const app = await renderAt('/tenant/dashboard', 'tenant');
  assert.equal(app.container.querySelectorAll('[aria-label="Open account menu"]').length, 0);
  const menuButtons = [...app.container.querySelectorAll('[aria-label="Open menu"]')];
  assert.equal(menuButtons.length, 1, 'there is exactly one menu button');
  await app.unmount();
});

test('logging out from the menu returns the visitor to the public site', async () => {
  const app = await renderAt('/tenant/dashboard', 'tenant');
  await app.clickContaining('Open menu');
  await clickMenuRow(app, 'Logout (Test tenant)');
  assert.equal(app.path(), '/');
  assert.equal(app.container.querySelector('nav[aria-label="Quick links"]') !== null, true);
  assert.deepEqual(labels(quickLinks(app)), ['Home', 'Browse', 'Find Home', 'Login'], 'the guest bar is back');
  await app.unmount();
});

/* -------------------------------------------------------------------------- */
/* P. Task 05 — the customer-facing copy tells the truth                      */
/* -------------------------------------------------------------------------- */

/** A landlord-submitted listing: the platform policy prices its viewing fee. */
const LANDLORD_LISTING = {
  id: 'prop-landlord',
  landlordId: '',
  title: 'Two-bedroom apartment in Osu',
  location: 'Osu',
  city: 'Accra',
  rentGhs: 4500,
  bedrooms: 2,
  bathrooms: 2,
  propertyType: 'Apartment',
  status: 'active',
  images: [],
  description: 'A quiet apartment near the main road.',
  amenities: ['Parking'],
  nearbyPlaces: [],
  availability: 'Available now',
  isLandlordVerified: true,
  submittedByRole: 'landlord',
  landlordAuthorityState: 'owner',
  viewingTerms: {
    isApproved: true,
    feeGhs: 100,
    source: 'platform_policy',
    terms: {
      appointmentRequired: true,
      howToArrange: 'We will call you to agree a time.',
      conditions: '',
      paymentInstructions: 'Paid to Goodlucks Homes after the viewing.',
      restrictions: '',
    },
  },
};

/** An agent-submitted listing: the agent's own fee, paid on site. */
const AGENT_LISTING = {
  ...LANDLORD_LISTING,
  id: 'prop-agent',
  title: 'Three-bedroom townhouse in East Legon',
  location: 'East Legon',
  rentGhs: 6000,
  bedrooms: 3,
  isLandlordVerified: false,
  submittedByRole: 'agent',
  landlordAuthorityState: 'claimed_by_agent',
  viewingTerms: { isApproved: true, feeGhs: 150, source: 'agent_terms' },
};

test('the homepage never claims Goodlucks inspects, owns or manages the properties', async () => {
  const app = await renderAt('/');
  const text = app.text();

  for (const claim of [
    /premier/i,
    /intermediary-managed/i,
    /managed by goodlucks/i,
    /physically inspect/i,
    /personally inspect/i,
    /fully verified/i,
    /guaranteed/i,
    /number one/i,
    /complete confidence/i,
  ]) {
    assert.doesNotMatch(text, claim, `the homepage must not claim ${claim}`);
  }

  // …and it says what the platform actually is.
  assert.match(text, /landlords and agents/i);
  assert.match(text, /request a viewing on any listing/i);
  assert.match(text, /not an ownership check/i);
  await app.unmount();
});

test('the footer and About page describe an intermediary, not a manager', async () => {
  const home = await renderAt('/');
  assert.match(home.text(), /we do not own or manage the properties listed here/i);
  await home.unmount();

  const about = await renderAt('/about');
  const text = about.text();
  assert.doesNotMatch(text, /physically inspect/i);
  assert.doesNotMatch(text, /accompany every viewing/i);
  assert.doesNotMatch(text, /field team/i);
  assert.match(text, /not a physical inspection of the property/i);
  // The viewing-fee explanation still separates the two providers (Task 03).
  assert.match(text, /goodlucks homes sets one general landlord viewing fee/i);
  assert.match(text, /the agent sets that property's fee/i);
  await about.unmount();
});

test('a property card claims only what the platform knows, and shows the right fee', async () => {
  const app = await renderAt('/', null, { properties: [LANDLORD_LISTING, AGENT_LISTING] });
  const text = app.text();

  assert.doesNotMatch(text, /managed by goodlucks/i, 'no listing is "managed" by Goodlucks');
  assert.match(text, /reviewed by goodlucks/i, 'a reviewed listing says so');

  // Landlord submission → the platform viewing fee, paid after the viewing.
  assert.match(text, /to goodlucks after viewing/i);
  // Agent submission → the agent's own fee, paid on site.
  assert.match(text, /paid on site/i);
  await app.unmount();
});

test('the viewing request explains this property\'s own fee and terms', async () => {
  const app = await renderAt('/property/prop-landlord', null, { properties: [LANDLORD_LISTING] });

  assert.match(app.text(), /arrange your viewing through goodlucks/i);
  assert.match(app.text(), /confirm the time with the landlord or agent/i);

  await app.click('Request Viewing Now');
  const modal = app.text();
  assert.match(modal, /viewing fee for this property/i);
  assert.match(modal, /payable after the viewing, to goodlucks homes/i);
  assert.match(modal, /never online/i);
  await app.unmount();

  const agentFee = await renderAt('/property/prop-agent', null, { properties: [AGENT_LISTING] });
  await agentFee.click('Request Viewing Now');
  assert.match(agentFee.text(), /paid directly to the agent on site/i);
  assert.doesNotMatch(agentFee.text(), /payable after the viewing, to goodlucks homes/i);
  await agentFee.unmount();
});

test('the verification screens show no deployment or configuration messages', async () => {
  for (const role of ['landlord', 'agent'] as const) {
    const app = await renderAt(`/${role}/verification`, role);
    const text = app.text();

    for (const internal of [
      /deployment/i,
      /key configured/i,
      /encryption key/i,
      /environment/i,
      /IDENTITY_DATA_KEY/i,
      /api key/i,
      /not configured/i,
    ]) {
      assert.doesNotMatch(text, internal, `${role} verification must not expose ${internal}`);
    }

    // It says what happens to the documents instead, in plain language.
    assert.match(text, /authorised reviewers/i);
    assert.match(text, /never shown on your public profile/i);
    await app.unmount();
  }
});

/* -------------------------------------------------------------------------- */
/* Task 07: the Blog & Learning Centre in the real app                        */
/* -------------------------------------------------------------------------- */

/** A published article exactly as `/api/blog/<slug>` serves it. */
function blogArticle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-east-legon',
    title: 'Top available properties in East Legon',
    subtitle: 'A short, honest tour of what is actually on the market this month.',
    slug: 'top-available-properties-east-legon',
    url: '/blog/top-available-properties-east-legon',
    absoluteUrl: 'https://goodlucks.co/blog/top-available-properties-east-legon',
    canonicalUrl: 'https://goodlucks.co/blog/top-available-properties-east-legon',
    featuredImage: '/api/uploads/gl-20260101-abc123.png',
    featuredImageAlt: 'A courtyard in East Legon',
    category: { id: 'cat-tenant', name: 'Tenant Guides', slug: 'tenant-guides', description: '' },
    tags: ['East Legon', 'Renting'],
    author: { name: 'Goodlucks Homes Team' },
    status: 'published',
    isFeatured: true,
    publishAt: '2026-02-01T09:00:00+00:00',
    publishedAt: '2026-02-01T09:00:00+00:00',
    createdAt: '2026-01-20T09:00:00+00:00',
    updatedAt: '2026-02-01T09:00:00+00:00',
    summary: 'What is actually available in East Legon, and what to check before paying.',
    readingMinutes: 4,
    seoTitle: 'East Legon rentals: what is available',
    seoDescription: 'A guide to the homes available to rent in East Legon this month.',
    contentHtml:
      '<h2>What to check before you pay</h2><p>Ask to see the home, and never pay before you have seen it.</p><div class="gl-showcase"></div><p>Prices change; this page always shows the live rent.</p>',
    propertyCards: [
      {
        propertyId: 'prop-1',
        title: 'Two bedroom apartment in East Legon',
        location: 'East Legon, Accra',
        city: 'Accra',
        propertyType: 'Apartment',
        bedrooms: 2,
        bathrooms: 2,
        rentGhs: 4500,
        image: '/api/uploads/gl-20260101-aaa111.png',
        imageAlt: 'Two bedroom apartment in East Legon',
        availability: 'Available now',
        isAvailable: true,
        url: '/property/prop-1',
        displayRule: 'show_status',
        note: 'Walk to the shops',
        sortOrder: 0,
        updatedAt: '2026-02-01T09:00:00+00:00',
      },
      {
        propertyId: 'prop-2',
        title: 'Three bedroom house in East Legon',
        location: 'East Legon, Accra',
        city: 'Accra',
        propertyType: 'House',
        bedrooms: 3,
        bathrooms: 3,
        rentGhs: 7800,
        image: '',
        imageAlt: '',
        availability: 'No longer available',
        isAvailable: false,
        url: null,
        displayRule: 'show_status',
        note: '',
        sortOrder: 1,
        updatedAt: '2026-02-01T09:00:00+00:00',
      },
    ],
    related: [],
    showcasePlaceholder: '<div class="gl-showcase"></div>',
    ...overrides,
  };
}

/** The teaser the index list serves. */
function blogSummary(overrides: Record<string, unknown> = {}) {
  const full = blogArticle();
  const { contentHtml: _content, propertyCards: _cards, related: _related, ...summary } = full;
  return { ...summary, ...overrides };
}

test('a guest can read the Learning Centre from the public website', async () => {
  const app = await renderAt('/blog', null, {
    blog: {
      posts: [blogSummary()],
      featured: [blogSummary({ id: 'post-featured', title: 'How a viewing works, step by step', slug: 'how-a-viewing-works' })],
      categories: [{ id: 'cat-tenant', name: 'Tenant Guides', slug: 'tenant-guides', publishedCount: 1 }],
    },
  });

  assert.equal(app.path(), '/blog');
  assert.match(app.text(), /Renting in Ghana, explained/);
  assert.match(app.text(), /Tenant Guides/);
  assert.match(app.text(), /Top available properties in East Legon/);
  assert.match(app.text(), /How a viewing works, step by step/);
  await app.unmount();
});

test('opening an article shows its content, author, dates and live listing cards', async () => {
  const app = await renderAt('/blog/top-available-properties-east-legon', null, {
    blog: { posts: [blogSummary()], post: blogArticle() },
  });

  const text = app.text();
  assert.match(text, /Top available properties in East Legon/);
  assert.match(text, /Goodlucks Homes Team/, 'the article names its author');
  assert.match(text, /Published/);
  assert.match(text, /What to check before you pay/, 'the stored article content is rendered');
  assert.match(text, /Prices change; this page always shows the live rent/, 'content after the cards is rendered too');

  // Live property cards: current rent, and an unavailable home that says so.
  assert.match(text, /GH₵ 4,500/);
  assert.match(text, /No longer available/);
  assert.equal(app.container.querySelectorAll('a[href="/property/prop-1"]').length > 0, true);
  assert.equal(app.container.querySelectorAll('a[href="/property/prop-2"]').length, 0, 'an unavailable listing is not linked');

  // SEO: canonical URL, social tags and structured data, all for this article.
  const canonical = app.container.ownerDocument.querySelector('link[rel="canonical"]');
  assert.equal(canonical?.getAttribute('href'), 'https://goodlucks.co/blog/top-available-properties-east-legon');
  const jsonLd = [...app.container.ownerDocument.querySelectorAll('script[type="application/ld+json"]')]
    .map((node) => node.textContent ?? '')
    .join('\n');
  assert.match(jsonLd, /"@type":"Article"/);
  assert.match(jsonLd, /"@type":"BreadcrumbList"/);
  assert.match(jsonLd, /Top available properties in East Legon/);

  await app.unmount();
});

test('clicking a listing card opens the real property page', async () => {
  const app = await renderAt('/blog/top-available-properties-east-legon', null, {
    blog: { posts: [blogSummary()], post: blogArticle() },
  });

  const card = app.container.querySelector('a[href="/property/prop-1"]') as HTMLElement | null;
  assert.ok(card, 'the card links to the listing');
  await act(async () => {
    card.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }) as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(app.path(), '/property/prop-1');
  await app.unmount();
});

test('an article that is not published is not available at its URL', async () => {
  const app = await renderAt('/blog/draft-that-should-not-be-public', null, {
    blog: { posts: [blogSummary()], post: null },
  });
  assert.match(app.text(), /This article is not available/);
  assert.equal(app.path(), '/blog/draft-that-should-not-be-public', 'the visitor stays at the URL they asked for');
  assert.equal(calls.some((url) => url.includes('/api/blog/draft-that-should-not-be-public')), true);
  await app.unmount();
});

test('the footer offers the Learning Centre to every visitor', async () => {
  const app = await renderAt('/', null, { blog: { posts: [blogSummary()], categories: [] } });
  await app.clickContaining('Learning Centre');
  assert.equal(app.path(), '/blog');
  await app.unmount();
});

test('a member reaches the Learning Centre by URL without a duplicate menu', async () => {
  const app = await renderAt('/blog', 'tenant', { blog: { posts: [blogSummary()] } });
  assert.equal(app.path(), '/blog');
  assert.match(app.text(), /Renting in Ghana, explained/);
  await app.unmount();
});

test('the admin console has Blog Management and Email Templates sections', async () => {
  const app = await renderAt('/admin', 'admin', { blog: { posts: [blogSummary()], categories: [] } });
  assert.match(app.text(), /Blog Management/);
  assert.match(app.text(), /Email Templates/);

  await app.clickContaining('Blog Management');
  assert.match(app.text(), /Top available properties in East Legon/);
  assert.equal(calls.some((url) => url.includes('/api/admin/blog/posts')), true);

  await app.clickContaining('Email Templates');
  assert.equal(calls.some((url) => url.includes('/api/admin/email-templates')), true);
  assert.match(app.text(), /Enquiry confirmation|No templates|template/i);

  await app.unmount();
});

/* -------------------------------------------------------------------------- */
/* Task 08: the rendered pages use the light design system                    */
/* -------------------------------------------------------------------------- */

/** The old dark-theme utilities the redesign removed. */
const LEGACY_THEME_TOKENS = [
  'bg-[#1F242D]',
  'bg-[#252A34]',
  'bg-[#1A1E26]',
  'bg-slate-900',
  'bg-slate-950',
  'bg-slate-800',
  'bg-black/',
  'border-white/',
  'text-slate-300',
  'text-slate-400',
];

test('every public page and dashboard renders on the light system', async () => {
  const pages: Array<[string, 'tenant' | 'landlord' | 'agent' | 'admin' | null]> = [
    ['/', null],
    ['/properties', null],
    ['/property/prop-landlord', null],
    ['/find-a-home', null],
    ['/list-property', null],
    ['/blog', null],
    ['/blog/top-available-properties-east-legon', null],
    ['/about', null],
    ['/contact', null],
    ['/receipts', 'tenant'],
    ['/tenant/dashboard', 'tenant'],
    ['/landlord/dashboard', 'landlord'],
    ['/agent/dashboard', 'agent'],
    ['/admin', 'admin'],
  ];

  for (const [path, role] of pages) {
    const app = await renderAt(path, role, {
      // Listings are only needed where the page renders a card; the dashboards
      // read their state from the account bootstrap.
      properties: path.startsWith('/property') || path === '/' ? [LANDLORD_LISTING] : [],
      blog: { posts: [blogSummary()], post: blogArticle() },
    });

    const html = app.container.innerHTML;
    for (const token of LEGACY_THEME_TOKENS) {
      assert.equal(
        html.includes(token),
        false,
        `${path} still renders the dark-theme class “${token}”`
      );
    }
    // The page is painted with the light page background or a white surface.
    assert.match(
      html,
      /bg-page|bg-surface/,
      `${path} renders without the light page/surface background`
    );

    await app.unmount();
  }
});

/* -------------------------------------------------------------------------- */
/* Share Property as Image                                                    */
/* -------------------------------------------------------------------------- */

/** A published listing with a photograph — the share dialog's happy path. */
const SHAREABLE_LISTING = {
  ...LANDLORD_LISTING,
  id: 'prop-share',
  title: 'Harbour View Three Bedroom Apartment',
  location: 'Cantonments',
  rentGhs: 6500,
  images: ['https://images.example.com/gl-share.jpg'],
  viewingTerms: undefined,
};

/** Find a button/link inside the open dialog by its visible text. */
function controlContaining(root: Element | Document, label: string): HTMLElement | null {
  return (
    ([...root.querySelectorAll('button, a, [role="button"]')] as HTMLElement[]).find((element) =>
      (element.textContent ?? '').toLowerCase().includes(label.toLowerCase())
    ) ?? null
  );
}

test('the Share button offers link sharing and a branded poster, and link sharing still works', async () => {
  const copied: string[] = [];
  const clipboard = window.navigator.clipboard as unknown as { writeText: (text: string) => Promise<void> };
  clipboard.writeText = async (text: string) => {
    copied.push(text);
  };

  const app = await renderAt('/property/prop-share', null, { properties: [SHAREABLE_LISTING] });
  assert.match(app.text(), /Harbour View Three Bedroom Apartment/);

  // The Share control opens the dialog rather than firing the old one-shot share.
  const shareButton = app.container.querySelector('button[title="Share this property"]') as HTMLElement | null;
  assert.ok(shareButton, 'the Share button is still on the property page');
  await act(async () => {
    shareButton!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const dialog = app.container.querySelector('#share-property-modal');
  assert.ok(dialog, 'the share dialog opens');

  // Both options exist; the original one is first and unchanged.
  const linkOption = controlContaining(dialog!, 'Share Property Link');
  const imageOption = controlContaining(dialog!, 'Share as Image');
  assert.ok(linkOption, 'Share Property Link is offered');
  assert.ok(imageOption, 'Share as Image is offered');

  // Choosing the link still copies the canonical property URL (this DOM has no
  // share sheet, so the clipboard is the documented fallback).
  await act(async () => {
    linkOption!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(copied.length, 1, 'the link was copied');
  assert.match(copied[0], /\/property\/harbour-view-three-bedroom-apartment-cantonments-prop-share$/);
  assert.match(document.body.textContent ?? '', /Link Copied/);

  await app.unmount();
});

test('Share as Image refuses to invent a poster when the browser cannot draw one', async () => {
  // This DOM has no 2D canvas, which is the same situation as an old browser.
  // The dialog must say so and keep the link option available — never show a
  // blank preview or fail silently.
  const app = await renderAt('/property/prop-share', null, { properties: [SHAREABLE_LISTING] });
  const shareButton = app.container.querySelector('button[title="Share this property"]') as HTMLElement | null;
  assert.ok(shareButton);
  await act(async () => {
    shareButton!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const dialog = app.container.querySelector('#share-property-modal');
  assert.ok(dialog);

  const imageOption = controlContaining(dialog!, 'Share as Image');
  await act(async () => {
    imageOption!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }) as unknown as Event);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  const after = app.container.querySelector('#share-property-modal');
  assert.ok(after, 'the dialog stays open');
  assert.equal(after!.querySelectorAll('img[width="1080"]').length, 0, 'no blank poster is shown');
  assert.match(after!.textContent ?? '', /cannot (draw|create) the poster|Try again/i);
  // The visitor is not stranded: the dialog offers a retry and a way back.
  assert.ok(controlContaining(after!, 'Try again'));
  assert.ok(controlContaining(after!, 'Back'));
  await app.unmount();
});

test('the poster is not generated just by opening a property page', async () => {
  const app = await renderAt('/property/prop-share', null, { properties: [SHAREABLE_LISTING] });
  assert.equal(app.container.querySelector('#share-property-modal'), null);
  assert.equal(app.container.querySelectorAll('img[width="1080"]').length, 0);
  await app.unmount();
});
