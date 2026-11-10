<?php
/**
 * Router for PHP's built-in development server.
 *
 *   php -S 0.0.0.0:8080 -t php-backend php-backend/router.php
 *
 * Existing static files (uploaded images) are served by the built-in server;
 * everything else is handled by the API front controller.
 */

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$candidate = __DIR__ . $uri;

// Property pages are rendered by their own entry point (metadata + canonical
// redirects), exactly as the production .htaccess routes them.
if (preg_match('#^/property/[A-Za-z0-9._-]+/?$#', $uri)) {
    require __DIR__ . '/property_page.php';
    exit;
}

// The short sharing link resolves to the canonical property page, exactly as
// the production .htaccess routes it (rule 2d).
if (preg_match('#^/p/[A-Za-z0-9_-]+/?$#', $uri)) {
    require __DIR__ . '/short_link.php';
    exit;
}

// The Learning Centre index and every article are rendered by their own entry
// point so the first HTML response already carries the article's own share
// metadata (Upgrade 2, A3). This mirrors rules 2e in public/.htaccess.
if (preg_match('#^/blog/?$#', $uri) || preg_match('#^/blog/[A-Za-z0-9._-]+/?$#', $uri)) {
    require __DIR__ . '/blog_page.php';
    exit;
}

if ($uri !== '/'
    && !is_dir($candidate)
    && is_file($candidate)
    && basename($candidate) !== 'index.php'
    && !str_ends_with($candidate, '.php')) {
    return false; // let the built-in server stream the file
}

require __DIR__ . '/index.php';
