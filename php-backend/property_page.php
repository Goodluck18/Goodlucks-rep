<?php
/**
 * Server-rendered property page entry point.
 *
 * Why this file exists
 * --------------------
 * The site is a single-page application, so before this file existed every URL
 * returned the same `index.html` and the property's title, price and photograph
 * were only added to the document by JavaScript. WhatsApp, Facebook, X,
 * LinkedIn, Slack, Telegram and search-engine crawlers do not run that
 * JavaScript, so a shared listing fell back to the generic site preview (and
 * often to no image at all).
 *
 * Apache sends `/property/...` here instead of straight to `index.html`
 * (see `public/.htaccess`). This script:
 *
 *   1. resolves the listing from the segment — the stable id, or a slug that
 *      ends in it (the id is the identifier, never the words in front of it);
 *   2. redirects (301) `…/property/prop-1` and any older slug to the current
 *      canonical `/property/{title}-{location}-{id}` URL;
 *   3. answers 404 for a listing that does not exist or is not published, and
 *      sends `noindex` so a removed listing never competes in search;
 *   4. otherwise returns the normal SPA shell with the property's own
 *      Open Graph / Twitter / canonical metadata already in the `<head>`.
 *
 * The React application still boots and renders the full property page for
 * human visitors; nothing about the client-side experience changes.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
// The request/response helpers shared with api/short_link.php.
require_once __DIR__ . '/lib/property_serve.php';

$path = property_request_path();

// Not a property URL: let the normal SPA fallback handle it.
if (!preg_match('#^/property/([^/]+)$#', $path, $matches)) {
    property_send(property_missing_meta_html(), 404);
    exit;
}

$segment = (string)$matches[1];
$property = property_resolve_segment($segment);

// Unknown, unpublished or deleted: answer 404 and never reveal that a hidden
// listing exists. The SPA's own "no longer available" screen is still served.
if (!$property || !property_is_public($property)) {
    property_send(property_missing_meta_html(), 404);
    exit;
}

$canonicalPath = property_path($property);

// Old id-only links, outdated slugs and hand-typed variants all collapse onto
// the one canonical URL. The redirect is relative, so it keeps whichever host
// the visitor is actually using (the testing domain or the permanent one).
if (strtolower($path) !== strtolower($canonicalPath)) {
    property_redirect($canonicalPath);
    exit;
}

property_send(property_share_meta_html($property), 200);
