<?php
/**
 * Request/response helpers shared by the two server-rendered entry points:
 * `api/property_page.php` (the listing page and its 301s) and
 * `api/short_link.php` (the `/p/{id}` short link).
 *
 * Both answer in the same shape — the SPA shell with a `<head>` block already
 * filled in — so the helpers that read the request, send the shell and issue a
 * redirect live here instead of being copied into each file. `property_slug()`'s
 * docblock explains why the metadata is rendered in PHP at all.
 */

declare(strict_types=1);

/** The request path without the query string, decoded and normalised. */
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
