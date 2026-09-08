<?php
/**
 * Goodlucks Homes - Tenant Request & Matching Endpoint
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = getDBConnection();

if ($method === 'POST') {
    $data = getJsonInput();

    $tenantName = trim($data['tenantName'] ?? '');
    $tenantPhone = trim($data['tenantPhone'] ?? '');
    $tenantEmail = filter_var($data['tenantEmail'] ?? '', FILTER_VALIDATE_EMAIL) ?: 'tenant@goodlucks.co';

    if (empty($tenantName) || empty($tenantPhone)) {
        sendJsonResponse(['error' => 'Tenant name and phone number are required'], 400);
    }

    $id = 'req-' . time() . '-' . substr(md5(uniqid()), 0, 4);
    $locations = is_array($data['preferredLocations'] ?? null) 
        ? json_encode($data['preferredLocations']) 
        : json_encode([$data['preferredLocations'] ?? 'Accra']);
    
    $budgetMin = (float)($data['budgetMin'] ?? 1000);
    $budgetMax = (float)($data['budgetMax'] ?? 10000);
    $bedrooms = (int)($data['bedrooms'] ?? 2);
    $bathrooms = (int)($data['bathrooms'] ?? 2);
    $propertyType = trim($data['propertyType'] ?? 'Apartment');
    $moveInDate = trim($data['moveInDate'] ?? date('Y-m-d', strtotime('+14 days')));
    $notes = trim($data['notes'] ?? '');

    $sql = "INSERT INTO tenant_requests (
        id, tenant_name, tenant_phone, tenant_email, preferred_locations,
        budget_min, budget_max, bedrooms, bathrooms, property_type,
        move_in_date, status, notes
    ) VALUES (
        :id, :name, :phone, :email, :locations,
        :b_min, :b_max, :beds, :baths, :type,
        :move_date, 'submitted', :notes
    )";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':id' => $id,
        ':name' => $tenantName,
        ':phone' => $tenantPhone,
        ':email' => $tenantEmail,
        ':locations' => $locations,
        ':b_min' => $budgetMin,
        ':b_max' => $budgetMax,
        ':beds' => $bedrooms,
        ':baths' => $bathrooms,
        ':type' => $propertyType,
        ':move_date' => $moveInDate,
        ':notes' => $notes
    ]);

    sendJsonResponse([
        'success' => true,
        'message' => 'Tenant rental request received. Goodlucks agents will begin matching properties.',
        'requestId' => $id
    ], 201);
}

if ($method === 'GET') {
    $stmt = $pdo->query("SELECT * FROM tenant_requests ORDER BY created_at DESC LIMIT 100");
    $requests = $stmt->fetchAll();
    foreach ($requests as &$req) {
        $req['preferred_locations'] = json_decode($req['preferred_locations'] ?? '[]', true);
        $req['matched_property_ids'] = json_decode($req['matched_property_ids'] ?? '[]', true);
    }
    sendJsonResponse(['success' => true, 'requests' => $requests]);
}
