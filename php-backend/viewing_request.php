<?php
/**
 * Goodlucks Homes - Viewing Request Endpoint
 * 
 * Handles:
 * - POST: Schedule physical viewing for a rental property with Goodlucks Agent
 * - GET: List scheduled viewings
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = getDBConnection();

if ($method === 'POST') {
    $data = getJsonInput();

    $tenantName = trim($data['tenantName'] ?? '');
    $tenantPhone = trim($data['tenantPhone'] ?? '');
    $tenantEmail = filter_var($data['tenantEmail'] ?? '', FILTER_VALIDATE_EMAIL) ?: 'tenant@goodlucks.co';
    $propertyId = trim($data['propertyId'] ?? '');
    $propertyTitle = trim($data['propertyTitle'] ?? 'Goodlucks Homes Rental');
    $propertyLocation = trim($data['propertyLocation'] ?? 'Accra, Ghana');
    $viewingDate = trim($data['date'] ?? date('Y-m-d', strtotime('+2 days')));
    $viewingTime = trim($data['time'] ?? '11:00 AM');
    $notes = trim($data['notes'] ?? '');

    if (empty($tenantName) || empty($tenantPhone) || empty($propertyId)) {
        sendJsonResponse(['error' => 'Tenant name, phone number, and property ID are required'], 400);
    }

    $viewingId = 'view-' . time() . '-' . substr(md5(uniqid()), 0, 4);

    $sql = "INSERT INTO viewing_schedules (
        id, tenant_name, tenant_phone, property_id, property_title, property_location,
        date, time, assigned_agent, status, viewing_fee_paid, fee_amount_ghs, outcome_notes
    ) VALUES (
        :id, :name, :phone, :prop_id, :title, :loc,
        :date, :time, 'Goodlucks Field Agent', 'scheduled', 0, 100.00, :notes
    )";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':id' => $viewingId,
        ':name' => $tenantName,
        ':phone' => $tenantPhone,
        ':prop_id' => $propertyId,
        ':title' => $propertyTitle,
        ':loc' => $propertyLocation,
        ':date' => $viewingDate,
        ':time' => $viewingTime,
        ':notes' => $notes ?: 'Scheduled via Goodlucks Homes web platform'
    ]);

    // Send confirmation email to tenant
    $subject = "Viewing Scheduled: " . $propertyTitle . " (" . $viewingDate . " at " . $viewingTime . ")";
    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: " . OFFICIAL_NAME . " <" . OFFICIAL_EMAIL . ">\r\n";
    $headers .= "Reply-To: " . OFFICIAL_EMAIL . "\r\n";
    $headers .= "X-Mailer: PHP/" . phpversion();

    $emailBody = '
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Viewing Scheduled</title></head>
    <body style="font-family: Arial, sans-serif; background-color: #252A34; color: #EAEAEA; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #1A1D24; border-radius: 12px; padding: 24px; border: 1px solid #2E3542;">
        <h2 style="color: #08D9D6; margin-top: 0;">Goodlucks Homes</h2>
        <p style="font-size: 13px; color: #94A3B8;">Physical Viewing Confirmation &bull; Ref: ' . $viewingId . '</p>
        <hr style="border: 0; border-top: 1px solid #2E3542; margin: 20px 0;">
        <h3 style="color: #FFFFFF;">Your Property Viewing is Confirmed</h3>
        <p>Dear ' . htmlspecialchars($tenantName) . ',</p>
        <p>A dedicated Goodlucks Homes verification agent has been assigned to guide your private inspection:</p>
        <div style="background-color: #252A34; padding: 16px; border-radius: 8px; border-left: 4px solid #08D9D6; margin: 15px 0;">
          <strong style="color: #FFFFFF; font-size: 16px;">' . htmlspecialchars($propertyTitle) . '</strong><br>
          <span style="color: #94A3B8; font-size: 13px;">📍 ' . htmlspecialchars($propertyLocation) . '</span><br><br>
          <span style="color: #38BDF8; font-weight: bold;">📅 Date: ' . htmlspecialchars($viewingDate) . ' at ' . htmlspecialchars($viewingTime) . '</span><br>
          <span style="color: #E2E8F0; font-size: 13px;">💵 Viewing Fee: GH₵ 100.00 (Payable physically on site upon arrival)</span>
        </div>
        <p style="color: #CBD5E1; font-size: 13px; line-height: 1.5;">
          Our agent will contact you via WhatsApp or phone (' . htmlspecialchars($tenantPhone) . ') 2 hours prior to confirm the meeting point. For urgent inquiries, call +233 23 769 0080.
        </p>
        <hr style="border: 0; border-top: 1px solid #2E3542; margin: 20px 0;">
        <p style="font-size: 11px; color: #64748B; text-align: center;">
          Goodlucks Homes Intermediary &bull; rentals@goodlucks.co &bull; Accra, Ghana
        </p>
      </div>
    </body>
    </html>';

    @mail($tenantEmail, $subject, $emailBody, $headers);

    // Also notify internal agency team
    $agencySubject = "[NEW VIEWING REQUEST] " . $propertyTitle . " by " . $tenantName;
    $agencyBody = "A new viewing was booked:\n"
                . "Property: $propertyTitle\n"
                . "Location: $propertyLocation\n"
                . "Tenant: $tenantName ($tenantPhone / $tenantEmail)\n"
                . "Requested Time: $viewingDate at $viewingTime\n"
                . "Ref ID: $viewingId\n";
    @mail(OFFICIAL_EMAIL, $agencySubject, $agencyBody);

    sendJsonResponse([
        'success' => true,
        'message' => 'Viewing scheduled successfully',
        'viewingId' => $viewingId,
        'feeAmountGhs' => 100.00
    ], 201);
}

if ($method === 'GET') {
    $stmt = $pdo->query("SELECT * FROM viewing_schedules ORDER BY created_at DESC LIMIT 100");
    $viewings = $stmt->fetchAll();
    sendJsonResponse(['success' => true, 'viewings' => $viewings]);
}
