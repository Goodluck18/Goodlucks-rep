<?php
/**
 * Goodlucks Homes - PHP MySQL Database Configuration
 * 
 * Update the database credentials below to match your cPanel MySQL setup:
 * 1. Log in to cPanel
 * 2. Click "MySQL Databases" or "MySQL Database Wizard"
 * 3. Create a database (e.g. youruser_goodlucks)
 * 4. Create a user (e.g. youruser_dbuser) and assign ALL PRIVILEGES
 * 5. Paste the details below:
 */

define('DB_HOST', 'localhost'); // Default on cPanel
define('DB_NAME', 'goodlucks_db'); // Change to your cPanel database name (e.g. cpaneluser_goodlucks)
define('DB_USER', 'goodlucks_user'); // Change to your cPanel database user
define('DB_PASS', 'your_secure_password'); // Change to your database password
define('DB_CHARSET', 'utf8mb4');

// Official email for notifications & transactional alerts
define('OFFICIAL_EMAIL', 'rentals@goodlucks.co');
define('OFFICIAL_NAME', 'Goodlucks Homes Intermediary');

/**
 * Establish a PDO MySQL Database Connection
 */
function getDBConnection() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        return $pdo;
    } catch (PDOException $e) {
        sendJsonResponse([
            'error' => 'Database connection failed',
            'details' => 'Please verify your cPanel database credentials in config.php. Error: ' . $e->getMessage()
        ], 500);
        exit;
    }
}

/**
 * Standardized JSON API Response Helper
 */
function sendJsonResponse($data, $statusCode = 200) {
    // Clean any prior buffer output
    if (ob_get_length()) ob_clean();

    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Handle HTTP Preflight OPTIONS request
 */
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    http_response_code(200);
    exit;
}

/**
 * Get Decoded JSON Request Body
 */
function getJsonInput() {
    $raw = file_get_contents('php://input');
    if (empty($raw)) {
        return $_POST;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}
