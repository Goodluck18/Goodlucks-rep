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

if ($uri !== '/'
    && !is_dir($candidate)
    && is_file($candidate)
    && basename($candidate) !== 'index.php'
    && !str_ends_with($candidate, '.php')) {
    return false; // let the built-in server stream the file
}

require __DIR__ . '/index.php';
