<?php
/**
 * Goodlucks Homes API - front controller.
 *
 * Every /api/* request is handled here (see lib/api.php for the route table).
 * Under Apache on cPanel this file is reached through the rewrite rules in
 * .htaccess; for local development it is reached through router.php.
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

dispatch_api_request();
