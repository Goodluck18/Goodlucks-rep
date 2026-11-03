<?php
/**
 * Test helper: insert a rent payment record row directly.
 *
 * Receipt issuing is disabled over HTTP (Increment A/B), so the access-control
 * tests plant rows the same way the backend does and then exercise the real read
 * endpoints against them.
 *
 *   php tests/create-receipt.php --tenant-user=<id> --landlord-user=<id> \
 *       [--amount=4200] [--tenant-name="Access Tenant A"] \
 *       [--landlord-name="Access Landlord A"] [--tenant-phone="+233 ..."]
 *
 *   php tests/create-receipt.php --legacy --tenant-name="..." --tenant-phone="..." \
 *       [--legacy-reference]
 *
 * `--legacy` plants a pre-Increment-A style row with no user links, which is the
 * only kind of row the phone-matching rules apply to. `--legacy-reference` gives
 * it the old "VERIFIED-REC-..." reference so the annotation can be tested.
 */

require_once __DIR__ . '/../php-backend/config.php';

$options = getopt('', [
    'tenant-user::',
    'landlord-user::',
    'amount::',
    'tenant-name::',
    'landlord-name::',
    'tenant-phone::',
    'legacy',
    'legacy-reference',
]);

$tenantUser = (string)($options['tenant-user'] ?? '');
$landlordUser = (string)($options['landlord-user'] ?? '');
$legacy = array_key_exists('legacy', $options);
$legacyReference = array_key_exists('legacy-reference', $options);
$amount = (float)($options['amount'] ?? 4200);
$tenantName = (string)($options['tenant-name'] ?? 'Access Tenant A');
$landlordName = (string)($options['landlord-name'] ?? 'Access Landlord A');
$tenantPhone = (string)($options['tenant-phone'] ?? '');

if (!$legacy && ($tenantUser === '' || $landlordUser === '')) {
    fwrite(STDERR, "Usage: php tests/create-receipt.php --tenant-user=<id> --landlord-user=<id> [--legacy]\n");
    exit(2);
}

$receipt = create_receipt([
    'property_title'   => 'Access Control Test Apartment',
    'property_address' => 'Osu, Accra',
    'tenant_name'      => $tenantName,
    'tenant_phone'     => $tenantPhone,
    'landlord_name'    => $landlordName,
    'amount_ghs'       => $amount,
    'payment_purpose'  => 'Monthly rent',
    'payment_method'   => 'MTN MoMo',
    'transaction_ref'  => 'TEST-' . strtoupper(bin2hex(random_bytes(3))),
    'payment_date'     => gmdate('Y-m-d'),
    'issued_by'        => 'Test Staff',
    'landlord_user_id' => $legacy ? null : $landlordUser,
    'tenant_user_id'   => $legacy ? null : $tenantUser,
]);

if ($legacyReference && !empty($receipt['id'])) {
    // Simulate a row carried over from the pre-Increment-B template. Only the
    // reference is changed; the amount and parties stay exactly as written.
    db_exec(
        'UPDATE rent_receipts SET verification_code = :code WHERE id = :id',
        [':code' => 'VERIFIED-REC-' . strtoupper(bin2hex(random_bytes(3))), ':id' => $receipt['id']]
    );
    $receipt = shape_receipt(find_receipt((string)$receipt['id']) ?? []);
}

echo json_encode(['id' => $receipt['id'] ?? '', 'receiptNo' => $receipt['receiptNo'] ?? '']) . "\n";
