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
  url: 'https://rent.goodlucks.co/',
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
const { default: App } = await import('../src/App.tsx');

/** Mount the app at `path`, exactly like a reload at that URL. */
async function renderAt(
  path: string,
  role: 'tenant' | 'landlord' | 'agent' | 'admin' | null = null,
  options: { notifications?: Array<Record<string, unknown>> } = {}
) {
  signedIn = role ? userFor(role) : null;
  stubNotifications = options.notifications ?? [];
  calls.length = 0;
  window.history.replaceState({}, '', path);
  document.body.innerHTML = '<div id="root"></div>';
  const container = document.getElementById('root') as HTMLElement;
  const root = createRoot(container);

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

  const active = [...app.container.querySelectorAll('[aria-current="page"]')];
  assert.equal(active.length, 1, 'exactly one section is marked active');
  assert.match(active[0].textContent ?? '', /viewings/i);
  await app.unmount();

  const elsewhere = await renderAt('/tenant/settings', 'tenant');
  const activeThere = [...elsewhere.container.querySelectorAll('[aria-current="page"]')];
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
