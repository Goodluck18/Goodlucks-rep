<?php
/**
 * Test-only fixture helper for the Increment E financial rules.
 *
 * Time travel is the only way to prove that a policy which is *effective now*
 * refuses to price a fee that was collected *before it existed*, and that an
 * active policy whose end date has passed is treated as expired. Nothing in the
 * application can do this, and nothing in application code calls this script —
 * it exists so the automated suite can simulate the passage of time without
 * waiting for it.
 *
 *   php tests/finance-fixtures.php --fee-reference=VFR-2026-AB12CD --fee-days-ago=45
 *   php tests/finance-fixtures.php --policy-id=fp_xxx --policy-effective-to=2026-01-01
 *   php tests/finance-fixtures.php --policy-id=fp_xxx --policy-effective-from=2026-12-01
 *   php tests/finance-fixtures.php --viewing-id=view_xxx --viewing-days-ago=2
 *
 * Increment F adds the viewing case: an appointment can only be completed after
 * its slot, so a test that wants to exercise completion has to let the slot
 * pass. Nothing in application code reads or writes these values.
 *
 * Every change is printed as JSON so the suite can assert on it.
 */

require_once __DIR__ . '/../php-backend/config.php';

$options = getopt('', [
    'fee-reference::', 'fee-days-ago::',
    'policy-id::', 'policy-effective-from::', 'policy-effective-to::',
    'viewing-id::', 'viewing-days-ago::',
]);

$changed = [];

if (($options['fee-reference'] ?? '') !== '' && ($options['fee-days-ago'] ?? '') !== '') {
    $reference = (string)$options['fee-reference'];
    $days = (int)$options['fee-days-ago'];
    if ($days < 0) {
        fwrite(STDERR, "--fee-days-ago must be 0 or more\n");
        exit(2);
    }
    $row = db_one('SELECT * FROM viewing_fee_records WHERE reference = :ref LIMIT 1', [':ref' => $reference]);
    if (!$row) {
        fwrite(STDERR, "No viewing fee record with that reference\n");
        exit(3);
    }
    $recordedAt = gmdate('Y-m-d H:i:s', time() - $days * 86400);
    db_exec(
        'UPDATE viewing_fee_records SET recorded_at = :at, updated_at = :updated WHERE id = :id',
        [':at' => $recordedAt, ':updated' => db_now(), ':id' => (string)$row['id']]
    );
    $changed['fee'] = [
        'id'         => (string)$row['id'],
        'reference'  => $reference,
        'recordedAt' => $recordedAt,
        'daysAgo'    => $days,
    ];
}

if (($options['policy-id'] ?? '') !== '') {
    $policyId = (string)$options['policy-id'];
    $policy = db_one('SELECT * FROM fee_policies WHERE id = :id LIMIT 1', [':id' => $policyId]);
    if (!$policy) {
        fwrite(STDERR, "No fee policy with that id\n");
        exit(3);
    }

    $set = [];
    $params = [':id' => $policyId, ':updated' => db_now()];
    if (($options['policy-effective-from'] ?? '') !== '') {
        $from = valid_date_iso((string)$options['policy-effective-from']);
        if ($from === null) {
            fwrite(STDERR, "Invalid --policy-effective-from\n");
            exit(2);
        }
        $set[] = 'effective_from = :from';
        $params[':from'] = $from;
        $changed['effectiveFrom'] = $from;
    }
    if (($options['policy-effective-to'] ?? '') !== '') {
        $to = valid_date_iso((string)$options['policy-effective-to']);
        if ($to === null) {
            fwrite(STDERR, "Invalid --policy-effective-to\n");
            exit(2);
        }
        $set[] = 'effective_to = :to';
        $params[':to'] = $to;
        $changed['effectiveTo'] = $to;
    }

    if ($set) {
        $set[] = 'updated_at = :updated';
        db_exec('UPDATE fee_policies SET ' . implode(', ', $set) . ' WHERE id = :id', $params);
    }
    $changed['policy'] = ['id' => $policyId] + $changed;
    unset($changed['effectiveFrom'], $changed['effectiveTo']);
}

if (($options['viewing-id'] ?? '') !== '' && ($options['viewing-days-ago'] ?? '') !== '') {
    $viewingId = (string)$options['viewing-id'];
    $days = (int)$options['viewing-days-ago'];
    if ($days < 0) {
        fwrite(STDERR, "--viewing-days-ago must be 0 or more\n");
        exit(2);
    }
    $viewing = db_one('SELECT * FROM viewing_schedules WHERE id = :id LIMIT 1', [':id' => $viewingId]);
    if (!$viewing) {
        fwrite(STDERR, "No viewing with that id\n");
        exit(3);
    }
    $date = gmdate('Y-m-d', time() - $days * 86400);
    db_exec(
        'UPDATE viewing_schedules SET date = :date, updated_at = :updated WHERE id = :id',
        [':date' => $date, ':updated' => db_now(), ':id' => $viewingId]
    );
    $changed['viewing'] = [
        'id'      => $viewingId,
        'date'    => $date,
        'daysAgo' => $days,
    ];
}

if (!$changed) {
    fwrite(STDERR, "Nothing to do. See the header of this file for usage.\n");
    exit(2);
}

echo json_encode(['success' => true, 'changed' => $changed], JSON_UNESCAPED_SLASHES) . "\n";
