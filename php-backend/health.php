<?php
/**
 * Goodlucks Homes - API & Database Health Check Endpoint
 * 
 * Visit https://yourdomain.com/api/health.php to verify:
 * - PHP version
 * - MySQL connection via PDO
 * - Tables loaded in database
 */

require_once __DIR__ . '/config.php';

try {
    $pdo = getDBConnection();
    $stmt = $pdo->query("SELECT COUNT(*) as prop_count FROM properties");
    $props = $stmt->fetch();

    $tablesStmt = $pdo->query("SHOW TABLES");
    $tables = $tablesStmt->fetchAll(PDO::FETCH_COLUMN);

    sendJsonResponse([
        'status' => 'ok',
        'platform' => 'Goodlucks Homes cPanel PHP Backend',
        'php_version' => phpversion(),
        'database_connected' => true,
        'properties_count' => (int)($props['prop_count'] ?? 0),
        'tables' => $tables,
        'timestamp' => date('c')
    ]);
} catch (Exception $e) {
    sendJsonResponse([
        'status' => 'error',
        'database_connected' => false,
        'message' => $e->getMessage()
    ], 500);
}
