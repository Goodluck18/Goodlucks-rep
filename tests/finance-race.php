<?php
/**
 * Test-only race harness for the financial transaction boundaries (R4).
 *
 * The API's built-in PHP server handles one request at a time, so firing two
 * HTTP requests "at once" from the test suite does not prove anything about
 * concurrent writers. This script runs one financial operation per process, so
 * two copies started together are two real, independent writers against the
 * same database — which is exactly the situation the row locks and conditional
 * updates exist for.
 *
 * It is called only from the automated test suite and never from application
 * code. It cannot grant capabilities, create users or bypass a rule: it calls
 * the same engine functions the HTTP handlers call, with an actor that the test
 * passes in.
 *
 *   php tests/finance-race.php --kind=confirm --submission=<id> --allocations=<json> --actor=<userId>
 *   php tests/finance-race.php --kind=reverse --receipt=<id> --amount=10 --reason=Race --actor=<userId>
 *   php tests/finance-race.php --kind=payment --commission=<id> --amount=60 --actor=<userId>
 *   php tests/finance-race.php --kind=decision --submission=<id> --status=rejected --reason=Race --actor=<userId>
 *
 * Prints one JSON object: {"ok":true,...} or {"success":false,"error":"..."}.
 */

require_once __DIR__ . '/../php-backend/config.php';

$options = getopt('', [
    'kind:', 'submission::', 'allocations::', 'receipt::', 'amount::',
    'reason::', 'status::', 'commission::', 'actor::',
]);

$kind = (string)($options['kind'] ?? '');
$actorId = (string)($options['actor'] ?? 'race-harness');
$actor = ['id' => $actorId, 'role' => 'admin', 'name' => 'Race Harness'];

/** Fail loudly, but as JSON, so the caller can classify the outcome. */
function race_fail(string $message, int $code = 2): void
{
    fwrite(STDERR, $message . "\n");
    echo json_encode(['ok' => false, 'error' => $message]) . "\n";
    exit($code);
}

try {
    switch ($kind) {
        case 'confirm':
            $submission = (string)($options['submission'] ?? '');
            if ($submission === '') {
                race_fail('--submission is required');
            }
            $allocations = json_decode((string)($options['allocations'] ?? '[]'), true);
            if (!is_array($allocations)) {
                race_fail('--allocations must be a JSON array');
            }
            $result = confirm_remittance($submission, $allocations, $actor, 'Race harness');
            echo json_encode([
                'ok'       => true,
                'status'   => $result['status'] ?? null,
                'confirmedGhs' => $result['confirmedGhs'] ?? null,
            ]) . "\n";
            break;

        case 'decision':
            $submission = (string)($options['submission'] ?? '');
            $result = decide_remittance(
                $submission,
                (string)($options['status'] ?? 'rejected'),
                (string)($options['reason'] ?? 'Race harness'),
                $actor
            );
            echo json_encode(['ok' => true, 'status' => $result['status'] ?? null]) . "\n";
            break;

        case 'reverse':
            $receipt = (string)($options['receipt'] ?? '');
            $amount = (float)($options['amount'] ?? 0);
            $result = reverse_viewing_fee_remittance(
                $receipt,
                $amount,
                (string)($options['reason'] ?? 'Race harness'),
                'RACE',
                $actor
            );
            echo json_encode(['ok' => true, 'adjustmentId' => $result['id'] ?? null]) . "\n";
            break;

        case 'payment':
            $commission = (string)($options['commission'] ?? '');
            $result = add_commission_payment(
                $commission,
                [
                    'amountGhs'  => (float)($options['amount'] ?? 0),
                    'receivedAt' => gmdate('Y-m-d'),
                    'method'     => 'cash',
                    'reference'  => 'RACE-PAY',
                ],
                $actor
            );
            echo json_encode([
                'ok'          => true,
                'receivedGhs' => $result['receivedGhs'] ?? null,
            ]) . "\n";
            break;

        default:
            race_fail('Unknown --kind (confirm, decision, reverse, payment)');
    }
} catch (Throwable $e) {
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]) . "\n";
    exit(1);
}
