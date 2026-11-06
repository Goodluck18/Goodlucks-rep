<?php
/**
 * Test fixture: set an APPROVED viewing fee and terms on seeded demo listings.
 *
 * Task 03 removed the platform-wide GHS 100 viewing fee. A viewing fee now
 * belongs to a property and has to be approved for it, so a test that books a
 * viewing and expects a GH₵ 100 ledger row has to say where that 100 came from.
 * This script writes it the same way a reviewer's approval would (approved
 * values on the property row), and nothing else.
 *
 * It is a TEST fixture, not an application endpoint: there is deliberately no
 * HTTP route that sets an approved fee directly — staff approve a proposal
 * through `POST /admin/viewing-terms/changes/{id}/decision`.
 *
 *   php tests/set-viewing-fee.php --property=prop-1 --fee=100
 *   php tests/set-viewing-fee.php --all-active --fee=100
 */

require_once __DIR__ . '/../php-backend/config.php';

$options = getopt('', ['property::', 'all-active', 'fee::', 'note::']);

$fee = $options['fee'] ?? '100';
if (!is_numeric($fee) || (float)$fee <= 0) {
    fwrite(STDERR, "fee must be a positive number\n");
    exit(2);
}
$fee = round((float)$fee, 2);

$terms = [
    'appointmentRequired' => true,
    'howToArrange'        => 'Contact the Goodlucks agent to arrange the viewing; a slot is confirmed by the agent.',
    'conditions'          => 'Bring a valid ID. Access is by appointment only.',
    'paymentInstructions' => 'The viewing fee is paid in cash to the agent on site after the viewing, never online.',
    'restrictions'        => 'No interior photography without the agent present.',
];

$ids = [];
if (isset($options['property']) && $options['property'] !== '') {
    $ids[] = (string)$options['property'];
} elseif (isset($options['all-active'])) {
    foreach (db_all("SELECT id FROM properties WHERE status = 'active'") as $row) {
        $ids[] = (string)$row['id'];
    }
} else {
    fwrite(STDERR, "Pass --property=<id> or --all-active\n");
    exit(2);
}

$updated = 0;
foreach ($ids as $id) {
    $property = find_property($id);
    if ($property === null) {
        fwrite(STDERR, "property {$id} not found\n");
        exit(3);
    }
    db_exec(
        'UPDATE properties
            SET viewing_fee_ghs = :fee, viewing_terms_json = :terms,
                viewing_terms_state = :state, viewing_terms_updated_at = :now,
                updated_at = :now
          WHERE id = :id',
        [
            ':fee'   => $fee,
            ':terms' => json_encode($terms, JSON_UNESCAPED_SLASHES),
            ':state' => 'approved',
            ':now'   => db_now(),
            ':id'    => $id,
        ]
    );
    $updated++;
}

echo json_encode(['ok' => true, 'updated' => $updated, 'feeGhs' => $fee]) . "\n";
