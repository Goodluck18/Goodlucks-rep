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

/**
 * The request path without the query string, decoded and normalised.
 */
function property_request_path(): string
{
    $uri = (string)($_SERVER['REQUEST_URI'] ?? '/');
    $path = parse_url($uri, PHP_URL_PATH);
    if (!is_string($path) || $path === '') {
        return '/';
    }
    $path = rawurldecode($path);
    if (strlen($path) > 1 && str_ends_with($path, '/')) {
        $path = rtrim($path, '/');
    }
    return $path;
}

/** The query string of the current request, including the leading `?`. */
function property_request_query(): string
{
    $query = (string)($_SERVER['QUERY_STRING'] ?? '');
    return $query === '' ? '' : '?' . $query;
}

/** Send the shell with the given head block and status code. */
function property_send(string $metaHtml, int $status): void
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    // Metadata must never be served from a stale cache: a price or title can
    // change at any time and the share card has to follow it.
    header('Cache-Control: no-cache, must-revalidate');
    header('X-Content-Type-Options: nosniff');
    echo property_render_shell($metaHtml);
}

/** 301 to the canonical path, keeping the query string (utm_*, ?ref=…). */
function property_redirect(string $to): void
{
    http_response_code(301);
    header('Location: ' . $to . property_request_query(), true, 301);
    header('Cache-Control: public, max-age=300');
}

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
