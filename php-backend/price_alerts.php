<?php
/**
 * Goodlucks Homes - Price Drop Alert Subscription Endpoint
 * 
 * Handles:
 * - POST: Subscribes user email for price drop alerts on a property
 * - GET: List active alerts (for admin reporting)
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = getDBConnection();

if ($method === 'POST') {
    $data = getJsonInput();

    $email = filter_var($data['email'] ?? '', FILTER_VALIDATE_EMAIL);
    $propertyId = trim($data['propertyId'] ?? '');

    if (!$email || empty($propertyId)) {
        sendJsonResponse(['error' => 'Valid email address and property ID are required'], 400);
    }

    $id = 'alert-' . time() . '-' . substr(md5(uniqid()), 0, 5);
    $propertyTitle = trim($data['propertyTitle'] ?? 'Goodlucks Homes Rental Property');
    $propertyLocation = trim($data['propertyLocation'] ?? 'Accra, Ghana');
    $currentRentGhs = (float)($data['currentRentGhs'] ?? 0);
    $targetRentGhs = !empty($data['targetRentGhs']) ? (float)$data['targetRentGhs'] : null;
    $name = trim($data['name'] ?? '');
    $notifyOnAnyDrop = !empty($data['notifyOnAnyDrop']) ? 1 : 0;

    // Check if alert already registered
    $check = $pdo->prepare("SELECT id FROM price_drop_alerts WHERE property_id = :prop_id AND email = :email LIMIT 1");
    $check->execute([':prop_id' => $propertyId, ':email' => $email]);
    $existing = $check->fetch();

    if ($existing) {
        // Update existing alert
        $update = $pdo->prepare("UPDATE price_drop_alerts SET target_rent_ghs = :target, current_rent_ghs = :current, notify_on_any_drop = :any_drop, active = 1 WHERE id = :id");
        $update->execute([
            ':target' => $targetRentGhs,
            ':current' => $currentRentGhs,
            ':any_drop' => $notifyOnAnyDrop,
            ':id' => $existing['id']
        ]);
        $alertId = $existing['id'];
    } else {
        // Insert new alert
        $sql = "INSERT INTO price_drop_alerts (
            id, property_id, property_title, property_location, current_rent_ghs,
            target_rent_ghs, email, name, notify_on_any_drop, active
        ) VALUES (
            :id, :property_id, :property_title, :property_location, :current_rent_ghs,
            :target_rent_ghs, :email, :name, :notify_on_any_drop, 1
        )";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':id' => $id,
            ':property_id' => $propertyId,
            ':property_title' => $propertyTitle,
            ':property_location' => $propertyLocation,
            ':current_rent_ghs' => $currentRentGhs,
            ':target_rent_ghs' => $targetRentGhs,
            ':email' => $email,
            ':name' => $name,
            ':notify_on_any_drop' => $notifyOnAnyDrop
        ]);
        $alertId = $id;
    }

    // Send confirmation email via native cPanel PHP mail()
    $formattedThreshold = $targetRentGhs 
        ? "GH₵ " . number_format($targetRentGhs, 2) . "/month"
        : "any rental reduction";

    $subject = "Price Drop Alert Set: " . $propertyTitle;
    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: " . OFFICIAL_NAME . " <" . OFFICIAL_EMAIL . ">\r\n";
    $headers .= "Reply-To: " . OFFICIAL_EMAIL . "\r\n";
    $headers .= "X-Mailer: PHP/" . phpversion();

    $emailBody = '
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>' . htmlspecialchars($subject) . '</title></head>
    <body style="font-family: Arial, sans-serif; background-color: #252A34; color: #EAEAEA; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #1A1D24; border-radius: 12px; padding: 24px; border: 1px solid #2E3542;">
        <h2 style="color: #08D9D6; margin-top: 0;">Goodlucks Homes</h2>
        <p style="font-size: 13px; color: #94A3B8;">Accra, Ghana &bull; Trusted Rental Intermediary</p>
        <hr style="border: 0; border-top: 1px solid #2E3542; margin: 20px 0;">
        <h3 style="color: #FFFFFF;">Price Drop Alert Activated</h3>
        <p>Hello ' . htmlspecialchars($name ?: 'there') . ',</p>
        <p>You have successfully registered for a price drop notification on:</p>
        <div style="background-color: #252A34; padding: 16px; border-radius: 8px; border-left: 4px solid #08D9D6; margin: 15px 0;">
          <strong style="font-size: 16px; color: #FFFFFF;">' . htmlspecialchars($propertyTitle) . '</strong><br>
          <span style="color: #94A3B8; font-size: 13px;">📍 ' . htmlspecialchars($propertyLocation) . '</span><br>
          <span style="color: #08D9D6; font-weight: bold;">Current Rent: GH₵ ' . number_format($currentRentGhs, 2) . '/month</span><br>
          <span style="color: #38BDF8; font-size: 13px;">Alert Threshold: Below ' . htmlspecialchars($formattedThreshold) . '</span>
        </div>
        <p style="color: #CBD5E1; font-size: 13px; line-height: 1.5;">
          Our system checks listings daily. When this property rent decreases, you will be notified immediately at this email address. All physical viewings and tenancy agreements remain protected through Goodlucks Homes.
        </p>
        <hr style="border: 0; border-top: 1px solid #2E3542; margin: 20px 0;">
        <p style="font-size: 11px; color: #64748B; text-align: center;">
          Goodlucks Homes Intermediary Ltd &bull; East Legon &amp; Ridge, Accra &bull; +233 23 769 0080 &bull; rentals@goodlucks.co
        </p>
      </div>
    </body>
    </html>';

    // Attempt to send email using PHP mail()
    @mail($email, $subject, $emailBody, $headers);

    // Also record in email_logs
    try {
        $logStmt = $pdo->prepare("INSERT INTO email_logs (id, recipient_email, recipient_name, subject, type, body_preview) VALUES (:id, :to, :name, :subject, 'price_alert', :preview)");
        $logStmt->execute([
            ':id' => 'log-' . time() . '-' . substr(md5(uniqid()), 0, 4),
            ':to' => $email,
            ':name' => $name ?: 'Subscriber',
            ':subject' => $subject,
            ':preview' => 'Price drop alert confirmed for ' . $propertyTitle
        ]);
    } catch (Exception $e) {
        // Continue silently
    }

    sendJsonResponse([
        'success' => true,
        'message' => 'Price drop alert registered successfully',
        'alertId' => $alertId,
        'email' => $email
    ]);
}

if ($method === 'GET') {
    $stmt = $pdo->query("SELECT * FROM price_drop_alerts ORDER BY created_at DESC LIMIT 100");
    $alerts = $stmt->fetchAll();
    sendJsonResponse(['success' => true, 'alerts' => $alerts]);
}
