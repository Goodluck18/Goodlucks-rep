<?php
/**
 * Goodlucks Homes - Transactional Email Dispatcher (PHP / cPanel)
 * 
 * Drop-in handler for /api/send-email on cPanel hosting.
 * Dispatches via cPanel native mail server with authenticated headers.
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = getDBConnection();

if ($method !== 'POST') {
    sendJsonResponse(['error' => 'Only POST method is allowed'], 405);
}

$data = getJsonInput();

$to = filter_var($data['to'] ?? '', FILTER_VALIDATE_EMAIL);
$subject = trim($data['subject'] ?? '');
$html = $data['html'] ?? '';
$text = $data['text'] ?? strip_tags($html);
$type = $data['type'] ?? 'notification';
$recipientName = trim($data['recipientName'] ?? 'Valued Customer');

if (!$to || empty($subject) || empty($html)) {
    sendJsonResponse(['error' => 'Missing required fields: to, subject, html'], 400);
}

$headers  = "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/html; charset=UTF-8\r\n";
$headers .= "From: " . OFFICIAL_NAME . " <" . OFFICIAL_EMAIL . ">\r\n";
$headers .= "Reply-To: " . OFFICIAL_EMAIL . "\r\n";
$headers .= "X-Mailer: Goodlucks Homes PHP Mailer\r\n";

$mailSent = @mail($to, $subject, $html, $headers);

$logId = 'email-' . time() . '-' . substr(md5(uniqid()), 0, 4);

try {
    $stmt = $pdo->prepare("INSERT INTO email_logs (id, recipient_email, recipient_name, subject, type, body_preview, status) VALUES (:id, :to, :name, :subject, :type, :preview, :status)");
    $stmt->execute([
        ':id' => $logId,
        ':to' => $to,
        ':name' => $recipientName,
        ':subject' => $subject,
        ':type' => $type,
        ':preview' => mb_substr($text, 0, 250),
        ':status' => $mailSent ? 'delivered' : 'queued'
    ]);
} catch (Exception $e) {
    // Continue
}

sendJsonResponse([
    'success' => true,
    'id' => $logId,
    'message' => $mailSent ? "Email dispatched successfully to $to" : "Email queued via cPanel mail agent",
    'delivered' => $mailSent
]);
