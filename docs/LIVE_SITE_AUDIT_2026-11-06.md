# goodlucks.net — live site audit
>
> **Domain update (2026-11-07).** The official Goodlucks Homes domain is now
> **`goodlucks.co`**; `rent.goodlucks.co` is retired. References to the old domain
> below are kept as the record of what the live site served on the date of this
> audit. Nothing in the application is pinned to a domain — it is configured
> through `APP_URL`, so the testing deployment keeps its own domain.

**Date:** 6 November 2026 · **Checked:** https://goodlucks.net (live), plus DNS, `robots.txt`, `sitemap.xml` and page metadata.
**Method:** pages fetched and rendered server-side (HTML + rendered DOM), DNS/records queried directly, metadata read from the live DOM. **No browser was available in this environment** — see §6 for what that means.

Severity: **P0** = losing money or breaking the product today · **P1** = trust/reputation · **P2** = search visibility · **P3** = conversion/UX · **P4** = hygiene.

---

## P0 — Three things are broken right now

### 1. Your published email address cannot receive mail

`rentals@goodlucks.co` is printed on the contact page, the footer, every property page, the admin login, the crash screen, and the site's structured data — **70 references in the codebase**.

But `goodlucks.co` is a **parked domain**:

```
NS  goodlucks.co → ns1.lander.d.parity.domains   (parking nameservers)
A   goodlucks.co → 104.219.250.37, 2.59.170.20   (same IPs as rent.goodlucks.co)
MX  goodlucks.co → (none — NODATA)
```

No MX records means **nothing can deliver to that address**. Every enquiry, callback request and "email us" click is going into a void.

`goodlucks.net` **does** have working mail: `MX 10 mail.goodlucks.net`, and an SPF record.

**Fix:** publish `rentals@goodlucks.net` (or actually set up a mailbox on goodlucks.co if you own it) and update every occurrence. Files found in this repo:

| File | Line |
| --- | --- |
| `src/components/Footer.tsx` | 47, 51 |
| `src/components/ContactView.tsx` | 69 |
| `src/App.tsx` | 170 (crash screen) |
| `src/components/AdminLoginView.tsx` | 152, 222 |
| `index.html` | 55 (JSON-LD `email`) |
| `php-backend/config.php` | 108 (`OFFICIAL_EMAIL` default) |

Also update the CLI examples in `php-backend/admin_bootstrap.php`, `grant_*.php` docs and any live admin accounts created as `@goodlucks.co` (they'd never receive a reset mail).

### 2. Canonical, sitemap, robots and every email link point to a dead host

The site's own identity is set to `https://rent.goodlucks.co`, which **refuses connections** (`net::ERR_CONNECTION_CLOSED`) because `rent.goodlucks.co` resolves to the same parked IPs as `goodlucks.co`.

Consequences, all verified live:

| Surface | What it currently says | Result |
| --- | --- | --- |
| `<link rel="canonical">` on `/` | `https://rent.goodlucks.co/` | Google is told the real page lives on a parked domain — goodlucks.net may not be indexed at all |
| `og:url`, `og:image`, `twitter:image` | `rent.goodlucks.co/…` | Shared links have **no preview image** (confirmed: `og:image` is null in the rendered DOM on `/`, `/properties` and `/blog`). For a rentals business shared over WhatsApp, this is the single biggest lost-click cause |
| `robots.txt` | `Sitemap: https://rent.goodlucks.co/sitemap.xml` | The sitemap is never read |
| `sitemap.xml` | all 11 `<loc>` entries on `rent.goodlucks.co` | Submitting this sitemap would point Google at a dead host |
| Password reset | `SITE_URL . '/?reset=' . token` (`php-backend/lib/api.php:592`) | **Users who forget their password get a dead link** — a support burden and a lockout |
| Property / alert / digest emails | `SITE_URL . '/property/…'` (`lib/alerts.php:117,199`, `lib/blog.php`, `lib/blog_api.php`) | Every link in every email is dead |

**Fix (one setting, then three files):**

1. Set `APP_URL=https://goodlucks.net` in the production config (`php-backend/config.php:118` reads it; the default is the parked host).
2. Replace the hardcoded `rent.goodlucks.co` in `index.html` lines 12, 29, 32, 41, 50–52.
3. Add a real social image at `https://goodlucks.net/og-image.jpg` (1200×630). Right now that URL returns nothing, so previews are blank even after the domain is fixed.
4. Re-submit `https://goodlucks.net/sitemap.xml` in Search Console afterwards.

### 3. There is no privacy policy and no terms page

`/privacy` → 404. `/terms` → 404.

The site collects names, emails and phone numbers (contact form, viewing requests, search alerts), and the platform handles identity documents for verification. The contact form has no consent line at all.

This is a legal exposure under Ghana's Data Protection Act (Act 843), and a practical blocker: no payment provider, app store listing or corporate landlord will sign without a privacy notice.

**Fix:** publish two short, honest pages — `/privacy` (what you collect, why, how long, who you share it with, how to request deletion, contact for data requests) and `/terms` (intermediary model, we never hold rent, viewing fee rules, listing review ≠ inspection ≠ ownership). Link both in the footer and under the contact form.

---

## P1 — Contradictions that damage trust

### 4. "Every listing is reviewed before it's published" vs "Listing not yet reviewed by our team"

Homepage: *"Every listing is checked by Goodlucks staff before it goes live."* About page: *"with every listing reviewed before it is published."*

Every listing detail page — I checked `prop-1` and `prop-2`, both of them — says the opposite: **"Listing not yet reviewed by our team"**, while the same listing carries a **"Featured listing"** badge on the homepage.

So the site simultaneously claims a review gate and displays unreviewed listings, and features them. Either the review gate isn't enforced in production (then the claim is false advertising under Ghana's consumer rules) or the badge is mis-set. Pick one and make it true.

### 5. The four listings are stock photos with unsellable marketing copy

All catalogue photos are **Unsplash stock images** of homes that are not in Ghana (`images.unsplash.com/photo-1545324418…`). Copy includes *"masterpiece of modern West African architecture"*, *"elite diplomatic precinct"*, *"olympic-size swimming pool"*, *"24/7 armed private security guards"*, *"opulent"*, *"imported marble flooring"*.

These are unverifiable claims about specific properties — exactly what the platform's own wording rules forbid — and stock photography for a real listing is a misrepresentation.

**Fix:** real photos from the landlord/agent, neutral descriptive copy ("3-bedroom apartment, en-suite, standby generator, pool"), or label them clearly as sample listings until real inventory exists. Never publish stock images as a specific property.

### 6. `/receipts` shows internal project status to customers

The page is public and says:

> *"Recording new payments is temporarily switched off. The old receipt template could imply that Goodlucks received money that was paid straight to a landlord. Recording reopens with the corrected payment and commission model."*

…above a fully greyed-out form. That is internal engineering/roadmap language on a customer-facing URL (and it isn't in the sitemap, so it's a surprise for anyone who lands there). Hide the route until the model ships; keep the print view for existing records if any customers hold them.

### 7. Viewing-fee wording reads like an internal note

> *"No viewing fee has been approved for this property. Ask the agent before you travel."*

Two problems: it sounds like staff workflow, and it tells the tenant to ask the agent — while the rest of the page says all arrangements go through Goodlucks.

**Fix:** *"No viewing fee applies to this property."* — and one consistent instruction for what to do next.

### 8. Placeholder-feeling sections

* **"Interactive Location Map Preview"** — there is no map. Either embed one or rename it "Area".
* **"Available from Sept 1"** — no year, and 1 September 2026 has passed. Show "Available from 1 September 2026" and expire past dates automatically.
* **`@GoodlucksHomes` on all platforms** + **"Goodlucks Tower, Ridge Diplomatic Precinct"** — I could not verify either (social platforms block automated checks). Click all five links and confirm the office address is real; dead handles and an invented HQ are instant trust killers.

---

## P2 — Search visibility

| # | Issue | Evidence | Fix |
| --- | --- | --- | --- |
| 9 | **Soft 404s** — unknown URLs return HTTP 200 with the homepage title | `/no-such-page-xyz`, `/browse`, `/this-page-does-not-exist-abc123` all → `statusCode 200` | Return a real 404 status for unknown paths, and `noindex` the not-found view |
| 10 | **One title/description for all routes** — the served HTML is a ~1.1 KB shell; per-page meta is applied by JavaScript | `h1` differs per page, but the static `<title>`/description is the homepage's on every URL | Prerender meta for `/properties`, `/property/:id`, `/blog/:slug` (or have PHP inject the head) — WhatsApp/Slack/X and most crawlers never run the JS |
| 11 | **robots.txt is stale** | Calls itself "Goodlucks Housing Portal"; allows `/browse` and `/find-home`, which are both 404 today (`/properties`, `/find-a-home` are the live routes) | Correct the paths and the sitemap host |
| 12 | **Blog is empty but promoted everywhere** | `/blog` → *"0 articles … Nothing here yet"*; it's in the nav, the footer, the homepage and the sitemap | Publish the guides that already exist in the repo, or hide the nav entry until populated |
| 13 | **Filters don't match inventory** | Suburb list: Cantonments, East Legon, Airport Residential, Osu, Labone, Spintex, Ahodwo. `prop-4` is in **Dzorwulu** (not filterable); four listed areas have zero listings. The select says "All Ghana Locations" but everything is Accra | Build the filter list from live listings, add Dzorwulu/Ridge, label it "All Accra areas" |
| 14 | **Two sitemap URLs are login walls** (`/find-a-home`, `/list-property`) | Both render "Log In to …" with no product content | Show the form and the explanation; gate only the submit |
| 15 | No structured data verified for listings | JSON-LD on `/` is `Organization`-ish and its `url`/`image`/`logo` are on the parked host | Add `RealEstateListing`/`Product` markup with price, area, availability |

---

## P3 — Conversion and usability

16. **Homepage hero H1** is "Find Your Perfect Home". Add the market: "Find your perfect home in Accra" — it matches how people search and reads less generic.
17. **Browse page leads with an email-capture block** ("Never Miss a Listing in Greater Accra…") *above* the results. On a phone this pushes the entire catalogue below the fold. Move it under the results, or collapse it to one line.
18. **Two price controls for one filter**: a slider ("Up to GH₵ 25,000/mo") *and* chips ("< 3k / < 5k / < 10k / < 15k / Any budget"). Keep one; the duplicate makes the filter feel broken.
19. **Property page has four competing CTAs** — Request Viewing, Notify Me If Price Drops, Call, WhatsApp — plus two long guidance paragraphs. Make "Request viewing" unmistakably primary; move the rest to a quiet row.
20. **No social proof anywhere.** For a brand-new intermediary whose entire proposition is "we are the safe middleman", the absence of any real testimonial, review count or team photo is the biggest single conversion gap. Add real, permissioned ones — never invented.
21. **Category/type counts read oddly**: "Luxury Villas 0, Duplexes 0, Penthouses 0, Commercial 0" displayed as filter chips alongside real counts. Showing zeros advertises an empty catalogue; hide empty categories.

---

## P4 — Technical hygiene

| # | Item | Finding |
| --- | --- | --- |
| 22 | **No DMARC record** | `_dmarc.goodlucks.net` → NXDOMAIN, while SPF exists (`v=spf1 a mx ip4:67.217.62.48 include:relay.mailbaby.net ~all`). Gmail/Yahoo now require DMARC for bulk senders — your alerts and password resets are likely going to spam. Publish `v=DMARC1; p=none; rua=mailto:…` first, tighten to `quarantine` once reports look clean. |
| 23 | **Missing security headers** | Present: `x-frame-options: SAMEORIGIN`, `x-content-type-options: nosniff`, `referrer-policy`. Missing: `strict-transport-security`, `content-security-policy`, `permissions-policy`. Add HSTS (`max-age=15552000; includeSubDomains`) — it's one line and it's what protects users on café Wi-Fi. |
| 24 | **Gallery images have empty alt text** | Thumbnails render as `<img alt="">`; only the main image carries the listing title. Add descriptive alt and `width`/`height` (prevents layout shift). |
| 25 | **Photos are hot-linked from Unsplash's CDN** | A third-party uptime and privacy dependency for your core product imagery — and the images aren't the properties. Host uploads yourself. |
| 26 | **Performance unmeasured** | My Lighthouse run timed out at 29 s. A 1.1 KB HTML shell implies a large JS bundle for a marketing page; prerendering the public pages would fix SEO and first paint together. Run PageSpeed Insights on mobile yourself. |

---

## 6. What I could **not** check (please don't assume these are fine)

* **No browser was available here**, so: no pixel/layout check, no mobile or tablet rendering, no hover/focus states, no JS console errors, no form submissions, no click-through of the viewing-request flow.
* **I could not confirm which theme is deployed** — colours aren't visible to me from HTML. Note this branch of the repo does not contain the light-palette redesign commit, so if the live site still looks dark, that work hasn't shipped here.
* **Social handles and the office address** are unverified (Facebook/Instagram/X block automated checks).
* **Performance / Lighthouse scores**: unavailable (no browser; Google's API quota was exhausted).
* **Real HTTP status codes** for the 404 check were read via a rendering proxy (it reported 200) — confirm in Search Console or `curl -I`.
* Checked pages: `/`, `/properties`, `/property/prop-1`, `/property/prop-2`, `/property/prop-99`, `/find-a-home`, `/list-property`, `/about`, `/contact`, `/receipts`, `/blog`, `/privacy`, `/terms`, `/browse`, `/admin`, two junk URLs, `robots.txt`, `sitemap.xml`. Dashboards and the admin console were not audited (login required, and this is a live production system).

---

## 7. Fix order (highest value per hour, first)

1. **Set `APP_URL=https://goodlucks.net`** and replace the hardcoded `rent.goodlucks.co` in `index.html`. *Half a day; unblocks indexing, all email links and password resets.*
2. **Switch the public email to `rentals@goodlucks.net`** and add a real `og-image.jpg`. *Two hours; stops losing enquiries.*
3. **Publish `/privacy` and `/terms`.** *A day; removes the biggest compliance blocker.*
4. **Make the review claim true** — either gate unreviewed listings or stop featuring them, and fix the badge logic. *Depends on backend policy.*
5. **Replace stock photos / neutralise the superlative copy** or label the catalogue as samples.
6. **Decide the receipts page's fate** (hide until the payment model ships).
7. Then SEO groundwork: real 404 status, per-route meta, correct robots, publish the blog or hide it, filter list from live data.
8. Then conversion work: one primary CTA on the property page, alerts block below results, single price control, real testimonials.

The site is **not launch-ready** with items 1–3 open, and item 4 is the one I would not ship publicly at all: a visible "not yet reviewed" badge next to "every listing is reviewed" is the kind of contradiction a tenant screenshots.
