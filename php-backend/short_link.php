<?php
/**
 * The short sharing link: `/p/{property-id}` → the canonical property page.
 *
 * Why this exists
 * ---------------
 * The canonical listing URL is descriptive on purpose
 * (`/property/pearl-executive-3-bedroom-apartment-cantonments-accra-prop-…`),
 * which is right for a search result and wrong for a caption under a photograph
 * someone is sharing. The short form keeps only the property's own stable
 * identifier, so it is:
 *
 *   - short enough to type, read aloud or paste under a poster;
 *   - permanent — the id never changes when the title, price or location is
 *     corrected, which is exactly why the slug is *not* used here;
 *   - resolved by the same visibility rule as the property page, so an
 *     unpublished or deleted listing cannot be reached through it.
 *
 * The redirect is relative with the query string preserved, so the visitor stays
 * on whichever host they used (the testing domain or the production domain) and
 * `?utm_source=…` survives. Nothing about the domain is hardcoded.
 *
 * Apache routes `/p/...` here (`public/.htaccess` rule 2d); `router.php` does the
 * same for the development server.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/property_serve.php';

$path = property_request_path();

// Not a short link: let the normal SPA fallback handle it.
if (!preg_match('#^/p/([^/]+)$#', $path, $matches)) {
    property_send(property_missing_meta_html(), 404);
    exit;
}

$code = (string)$matches[1];
$property = property_resolve_short_code($code);

// Unknown or unpublished: answer 404 with noindex, and never reveal that a
// hidden listing exists. The SPA's own "no longer available" screen is served.
if (!$property || !property_is_public($property)) {
    property_send(property_missing_meta_html(), 404);
    exit;
}

// 301 to the one canonical address, keeping the query string.
property_redirect(property_path($property));
