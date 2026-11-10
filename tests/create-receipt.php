<?php
/**
 * Test helper: insert a rent payment record row directly.
 *
 * Upgrade 2 (E1) removed the rent-receipt feature — its endpoints, its screen and
 * its repository helpers are gone — but the `rent_receipts` table and its rows
 * are preserved history. This helper therefore writes the row with plain SQL, so
 * the tests can prove that (a) nothing serves it over HTTP any more and (b) the
 * stored record itself is still intact.
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

$id = 'rec-test-' . strtoupper(bin2hex(random_bytes(6)));
$receiptNo = 'GHL-REC-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(3)));
$verificationCode = 'REF-REC-' . strtoupper(bin2hex(random_bytes(4)));

db_exec(
    'INSERT INTO rent_receipts (id, receipt_no, property_title, property_address, tenant_name, tenant_phone,
                                landlord_name, amount_ghs, payment_purpose, payment_method, transaction_ref,
                                payment_date, issued_by, verification_code, created_at, landlord_user_id, tenant_user_id)
     VALUES (:id, :no, :title, :address, :tenant, :phone, :landlord, :amount, :purpose, :method, :ref, :date,
             :issued, :code, :created, :landlord_user, :tenant_user)',
    [
        ':id'            => $id,
        ':no'            => $receiptNo,
        ':title'         => 'Access Control Test Apartment',
        ':address'       => 'Osu, Accra',
        ':tenant'        => $tenantName,
        ':phone'         => $tenantPhone,
        ':landlord'      => $landlordName,
        ':amount'        => $amount,
        ':purpose'       => 'Monthly rent',
        ':method'        => 'MTN MoMo',
        ':ref'           => 'TEST-' . strtoupper(bin2hex(random_bytes(3))),
        ':date'          => gmdate('Y-m-d'),
        ':issued'        => 'Test Staff',
        ':code'          => $verificationCode,
        ':created'       => db_now(),
        ':landlord_user' => $legacy ? null : ($landlordUser !== '' ? $landlordUser : null),
        ':tenant_user'   => $legacy ? null : ($tenantUser !== '' ? $tenantUser : null),
    ]
);

if ($legacyReference) {
    // Simulate a row carried over from the pre-Increment-B template. Only the
    // reference is changed; the amount and parties stay exactly as written.
    db_exec(
        'UPDATE rent_receipts SET verification_code = :code WHERE id = :id',
        [':code' => 'VERIFIED-REC-' . strtoupper(bin2hex(random_bytes(3))), ':id' => $id]
    );
}

echo json_encode(['id' => $id, 'receiptNo' => $receiptNo]) . "\n";
