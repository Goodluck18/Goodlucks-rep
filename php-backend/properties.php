<?php
/**
 * Goodlucks Homes - Properties REST API Endpoint
 * 
 * Supports:
 * - GET: List active properties, filter by query, or get single property by ?id=
 * - POST: Add a new property listing (Landlords / Admin)
 * - PUT: Update property details, status, or views count
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = getDBConnection();

// --------------------------------------------------------
// GET: Fetch Properties or Single Property
// --------------------------------------------------------
if ($method === 'GET') {
    // 1. Single Property by ID
    if (!empty($_GET['id'])) {
        $stmt = $pdo->prepare("SELECT * FROM properties WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $_GET['id']]);
        $prop = $stmt->fetch();

        if (!$prop) {
            sendJsonResponse(['error' => 'Property not found'], 404);
        }

        // Increment views counter
        $inc = $pdo->prepare("UPDATE properties SET views_count = views_count + 1 WHERE id = :id");
        $inc->execute([':id' => $_GET['id']]);
        $prop['views_count'] = (int)$prop['views_count'] + 1;

        $prop = formatProperty($prop);
        sendJsonResponse(['success' => true, 'property' => $prop]);
    }

    // 2. Filtered or All Properties
    $where = ["status = 'active'"];
    $params = [];

    if (!empty($_GET['city'])) {
        $where[] = "city LIKE :city";
        $params[':city'] = '%' . trim($_GET['city']) . '%';
    }

    if (!empty($_GET['location'])) {
        $where[] = "location LIKE :location";
        $params[':location'] = '%' . trim($_GET['location']) . '%';
    }

    if (!empty($_GET['type']) && $_GET['type'] !== 'All') {
        $where[] = "property_type = :type";
        $params[':type'] = trim($_GET['type']);
    }

    if (!empty($_GET['bedrooms']) && $_GET['bedrooms'] !== 'All') {
        $where[] = "bedrooms >= :bedrooms";
        $params[':bedrooms'] = (int)$_GET['bedrooms'];
    }

    if (!empty($_GET['maxRent'])) {
        $where[] = "rent_ghs <= :maxRent";
        $params[':maxRent'] = (float)$_GET['maxRent'];
    }

    $sql = "SELECT * FROM properties WHERE " . implode(" AND ", $where) . " ORDER BY featured DESC, created_at DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    $properties = array_map('formatProperty', $rows);

    sendJsonResponse([
        'success' => true,
        'count' => count($properties),
        'properties' => $properties
    ]);
}

// --------------------------------------------------------
// POST: Create New Property
// --------------------------------------------------------
if ($method === 'POST') {
    $data = getJsonInput();

    if (empty($data['title']) || empty($data['location']) || empty($data['rentGhs'])) {
        sendJsonResponse(['error' => 'Missing required fields: title, location, rentGhs'], 400);
    }

    $id = !empty($data['id']) ? $data['id'] : 'prop-' . time() . '-' . substr(md5(uniqid()), 0, 4);

    $sql = "INSERT INTO properties (
        id, landlord_id, landlord_name, landlord_company, title, location, city, rent_ghs,
        bedrooms, bathrooms, property_type, status, images, description, amenities,
        nearby_places, availability, featured
    ) VALUES (
        :id, :landlord_id, :landlord_name, :landlord_company, :title, :location, :city, :rent_ghs,
        :bedrooms, :bathrooms, :property_type, :status, :images, :description, :amenities,
        :nearby_places, :availability, :featured
    )";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':id' => $id,
        ':landlord_id' => $data['landlordId'] ?? 'user-landlord-1',
        ':landlord_name' => $data['landlordName'] ?? 'Verified Landlord',
        ':landlord_company' => $data['landlordCompany'] ?? 'Goodlucks Partner Developer',
        ':title' => trim($data['title']),
        ':location' => trim($data['location']),
        ':city' => trim($data['city'] ?? 'Accra'),
        ':rent_ghs' => (float)$data['rentGhs'],
        ':bedrooms' => (int)($data['bedrooms'] ?? 1),
        ':bathrooms' => (int)($data['bathrooms'] ?? 1),
        ':property_type' => $data['propertyType'] ?? 'Apartment',
        ':status' => $data['status'] ?? 'active',
        ':images' => json_encode($data['images'] ?? []),
        ':description' => $data['description'] ?? '',
        ':amenities' => json_encode($data['amenities'] ?? []),
        ':nearby_places' => json_encode($data['nearbyPlaces'] ?? []),
        ':availability' => $data['availability'] ?? 'Available Now',
        ':featured' => !empty($data['featured']) ? 1 : 0
    ]);

    sendJsonResponse([
        'success' => true,
        'message' => 'Property successfully created in database',
        'propertyId' => $id
    ], 201);
}

// --------------------------------------------------------
// PUT: Update Property Details or Status
// --------------------------------------------------------
if ($method === 'PUT') {
    $data = getJsonInput();
    if (empty($data['id'])) {
        sendJsonResponse(['error' => 'Property ID is required for update'], 400);
    }

    $fields = [];
    $params = [':id' => $data['id']];

    if (isset($data['status'])) {
        $fields[] = "status = :status";
        $params[':status'] = $data['status'];
    }
    if (isset($data['rentGhs'])) {
        $fields[] = "rent_ghs = :rent_ghs";
        $params[':rent_ghs'] = (float)$data['rentGhs'];
    }
    if (isset($data['title'])) {
        $fields[] = "title = :title";
        $params[':title'] = $data['title'];
    }

    if (empty($fields)) {
        sendJsonResponse(['error' => 'No valid fields provided to update'], 400);
    }

    $sql = "UPDATE properties SET " . implode(", ", $fields) . " WHERE id = :id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    sendJsonResponse(['success' => true, 'message' => 'Property updated successfully']);
}

/**
 * Format property record from MySQL into standard JSON API structure
 */
function formatProperty($row) {
    return [
        'id' => $row['id'],
        'landlordId' => $row['landlord_id'],
        'landlordName' => $row['landlord_name'] ?? 'Goodlucks Partner Landlord',
        'landlordCompany' => $row['landlord_company'] ?? '',
        'isLandlordVerified' => true,
        'title' => $row['title'],
        'location' => $row['location'],
        'city' => $row['city'],
        'rentGhs' => (float)$row['rent_ghs'],
        'bedrooms' => (int)$row['bedrooms'],
        'bathrooms' => (int)$row['bathrooms'],
        'propertyType' => $row['property_type'],
        'status' => $row['status'],
        'images' => json_decode($row['images'] ?? '[]', true) ?: [],
        'description' => $row['description'],
        'amenities' => json_decode($row['amenities'] ?? '[]', true) ?: [],
        'nearbyPlaces' => json_decode($row['nearby_places'] ?? '[]', true) ?: [],
        'availability' => $row['availability'],
        'featured' => (bool)$row['featured'],
        'viewsCount' => (int)$row['views_count'],
        'enquiriesCount' => (int)$row['enquiries_count'],
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at']
    ];
}
