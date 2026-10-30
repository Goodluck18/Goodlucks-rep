<?php
/**
 * Legacy endpoint shim for /api/tenant_requests.php
 *
 * The whole API is implemented once in index.php + lib/api.php.
 * This file exists so previously published links keep working.
 */

declare(strict_types=1);

require_once __DIR__ . '/index.php';
