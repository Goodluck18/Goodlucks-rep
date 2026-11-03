<?php
declare(strict_types=1);

/**
 * Increment G — agent remittances, financial reconciliation and rental
 * commissions.
 *
 * The whole point of this file is that four numbers stay four numbers:
 *
 *   1. what an agent says they collected        (a claim)
 *   2. what is contractually owed to Goodlucks  (an entitlement)
 *   3. what an agent says they remitted         (a claim)
 *   4. what Goodlucks confirms it received      (money)
 *
 * Nothing here promotes 1 into 2, 3 into 4, or either into revenue. Only an
 * administrator holding the confirmation capability can move a figure from
 * "claimed" to "received", and every such move writes an immutable row plus an
 * audit entry.
 *
 * The Increment B ledger remains the single source of truth for viewing-fee
 * money: `viewing_fee_records` holds the collection and the agreed share, and
 * `fee_remittances` holds confirmed receipts (positive) and linked reversals
 * (negative). This file adds submissions and allocations around that ledger
 * rather than re-implementing it.
 *
 * Rental commissions deliberately live in their own tables. Goodlucks is not
 * entitled to a commission because a property was rented; a named person must
 * record the agreement first, and the platform never invents a percentage.
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const FINANCE_METHODS = ['cash', 'momo', 'bank_transfer', 'cheque', 'other'];

const REMITTANCE_STATUSES = ['submitted', 'confirmed', 'rejected', 'disputed'];

const REMITTANCE_DECIDABLE_STATUSES = ['submitted', 'disputed'];

const COMMISSION_STATUSES = [
    'draft', 'awaiting_agreement', 'agreed', 'due',
    'partially_paid', 'paid', 'disputed', 'cancelled', 'corrected',
];

const COMMISSION_LABELS = [
    'draft'            => 'Draft',
    'awaiting_agreement' => 'Awaiting agreement',
    'agreed'           => 'Agreed',
    'due'              => 'Due',
    'partially_paid'   => 'Partially paid',
    'paid'             => 'Paid',
    'disputed'         => 'Disputed',
    'cancelled'        => 'Cancelled',
    'corrected'        => 'Corrected',
];

/** Statuses in which a payment may be recorded against a commission. */
const COMMISSION_PAYABLE_STATUSES = ['agreed', 'due', 'partially_paid'];

const COMMISSION_TRANSITIONS = [
    'draft'              => ['awaiting_agreement', 'cancelled'],
    'awaiting_agreement' => ['agreed', 'cancelled', 'disputed'],
    'agreed'             => ['due', 'cancelled', 'disputed'],
    'due'                => ['disputed', 'cancelled'],
    'partially_paid'     => ['disputed'],
    'paid'               => [],
    'disputed'           => ['agreed', 'due', 'cancelled'],
    'cancelled'          => [],
    'corrected'          => [],
];


// ---------------------------------------------------------------------------
// Capabilities — viewing money and moving money are different powers
// ---------------------------------------------------------------------------

function finance_can_view(?array $user = null): bool
{
    $user = $user ?? auth_user();
    if ($user === null || (string)($user['role'] ?? '') !== 'admin') {
        return false;
    }
    // The Increment E policy capabilities already implied sight of the ledger,
    // so they keep that meaning; `can_view_finance` is the explicit read-only
    // grant for staff who should not be able to change anything.
    return (int)($user['can_view_finance'] ?? 0) === 1
        || (int)($user['can_manage_fee_policies'] ?? 0) === 1
        || (int)($user['can_approve_fee_policies'] ?? 0) === 1;
}

function finance_can_confirm(?array $user = null): bool
{
    $user = $user ?? auth_user();
    return $user !== null
        && (string)($user['role'] ?? '') === 'admin'
        && (int)($user['can_confirm_remittances'] ?? 0) === 1;
}

function require_finance_view(): array
{
    $user = require_auth(['admin']);
    if (!finance_can_view($user)) {
        error_response(
            'Reading financial records requires the finance-view capability. Ask a server administrator to grant it.',
            403
        );
    }
    return $user;
}

function require_finance_confirm(): array
{
    $user = require_auth(['admin']);
    if (!finance_can_confirm($user)) {
        error_response(
            'Confirming money, recording commission payments and adjusting financial records require the remittance-confirmation capability. Reading records does not grant it.',
            403
        );
    }
    return $user;
}

/** Capability hint for the console; every endpoint re-checks it. */
function finance_ledger_capabilities(array $user): array
{
    return [
        'financeView'    => finance_can_view($user),
        'financeConfirm' => finance_can_confirm($user),
    ];
}

function set_finance_ledger_capabilities(string $userId, bool $view, bool $confirm): void
{
    db_exec(
        'UPDATE users SET can_view_finance = :view, can_confirm_remittances = :confirm, updated_at = :now
          WHERE id = :id AND role = :role',
        [
            ':view'    => $view ? 1 : 0,
            ':confirm' => $confirm ? 1 : 0,
            ':now'     => db_now(),
            ':id'      => $userId,
            ':role'    => 'admin',
        ]
    );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function finance_money($value): ?float
{
    if ($value === null || $value === '') {
        return null;
    }
    return round((float)$value, 2);
}

function finance_reference(string $prefix): string
{
    return $prefix . '-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

function finance_actor_context(?array $actor): array
{
    return [
        'id'   => (string)($actor['id'] ?? ''),
        'role' => (string)($actor['role'] ?? ''),
        'name' => (string)($actor['name'] ?? ''),
    ];
}

function finance_today(): string
{
    return gmdate('Y-m-d');
}

/** Which agent does this user act as? Empty for anyone who is not an agent. */
function finance_agent_scope(?array $user): string
{
    if ($user === null || (string)($user['role'] ?? '') !== 'agent') {
        return '';
    }
    return (string)($user['id'] ?? '');
}

function finance_agent_is_operational(string $agentUserId): bool
{
    $user = find_user_by_id($agentUserId);
    return viewing_agent_operational($user);
}


// ---------------------------------------------------------------------------
// Remittance submissions (the agent's claim)
// ---------------------------------------------------------------------------

/**
 * An agent reports money they have remitted to Goodlucks.
 *
 * This writes a claim, not revenue. `confirmed_ghs` stays NULL until an
 * administrator with the confirmation capability records what actually landed.
 *
 * @return array the shaped submission
 */
function create_remittance_submission(array $input, array $agent): array
{
    $agentUserId = (string)($agent['id'] ?? '');
    if ($agentUserId === '') {
        error_response('Only a signed-in agent can submit a remittance.', 403);
    }
    if (!finance_agent_is_operational($agentUserId)) {
        error_response(
            'Your agent account is not active, so remittances cannot be submitted. Existing records are kept and can still be read.',
            403
        );
    }

    $amount = finance_money($input['amountGhs'] ?? $input['amount'] ?? null);
    $fields = [];
    if ($amount === null || $amount <= 0) {
        $fields['amountGhs'] = 'Enter the amount remitted, greater than zero.';
    } elseif ($amount > 1000000) {
        $fields['amountGhs'] = 'That amount looks wrong. Contact Goodlucks finance directly.';
    }

    $method = one_of(strtolower(trim((string)($input['method'] ?? 'unknown'))), FINANCE_METHODS, null);
    if ($method === null) {
        $fields['method'] = 'Choose how the money was sent: ' . implode(', ', FINANCE_METHODS) . '.';
    }

    $paidAt = valid_date_iso($input['paidAt'] ?? $input['remittedAt'] ?? null);
    if ($paidAt === null) {
        $fields['paidAt'] = 'Give the date the money left your hands.';
    } elseif ($paidAt > finance_today()) {
        $fields['paidAt'] = 'A remittance cannot be dated in the future.';
    }

    $paymentReference = clean_string($input['paymentReference'] ?? $input['reference'] ?? '', 128);
    if ($method !== null && $method !== 'cash' && strlen($paymentReference) < 3) {
        $fields['paymentReference'] = 'Give the transfer, cheque or mobile-money reference.';
    }

    $evidence = clean_string($input['evidenceReference'] ?? '', 255);
    $note = clean_text($input['note'] ?? '', 1000);

    // Optional: the agent may say which viewings the money covers. Staff decide
    // what actually gets allocated when they confirm.
    $requested = [];
    if (isset($input['allocations']) && is_array($input['allocations'])) {
        foreach ($input['allocations'] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $recordId = clean_string($row['viewingFeeRecordId'] ?? $row['recordId'] ?? '', 64);
            $rowAmount = finance_money($row['amountGhs'] ?? $row['amount'] ?? null);
            if ($recordId === '' || $rowAmount === null || $rowAmount <= 0) {
                continue;
            }
            $requested[] = ['viewingFeeRecordId' => $recordId, 'amountGhs' => $rowAmount];
        }
    }

    if ($fields !== []) {
        error_response('Please correct the highlighted fields.', 422, $fields);
    }

    $id = new_id('rem');
    $reference = finance_reference('REM');
    db_exec(
        'INSERT INTO remittance_submissions
            (id, reference, agent_user_id, agent_name, amount_ghs, currency, method, payment_reference,
             paid_at, evidence_reference, status, requested_allocations_json, note, created_at)
         VALUES
            (:id, :reference, :agent, :name, :amount, :currency, :method, :payref,
             :paid_at, :evidence, :status, :requested, :note, :now)',
        [
            ':id'         => $id,
            ':reference'  => $reference,
            ':agent'      => $agentUserId,
            ':name'       => (string)($agent['name'] ?? ''),
            ':amount'     => $amount,
            ':currency'   => 'GHS',
            ':method'     => $method,
            ':payref'     => $paymentReference,
            ':paid_at'    => $paidAt,
            ':evidence'   => $evidence,
            ':status'     => 'submitted',
            ':requested'  => $requested === [] ? null : json_encode($requested),
            ':note'       => $note !== '' ? $note : null,
            ':now'        => db_now(),
        ]
    );

    audit_log('finance.remittance_submitted', 'remittance', $id, [
        'agentUserId' => $agentUserId,
        'amountGhs'   => $amount,
        'method'      => $method,
        'paidAt'      => $paidAt,
        'reference'   => $reference,
        // A submission is a claim: say so in the audit trail too.
        'state'       => 'claimed_not_received',
    ]);

    $financeDesk = finance_desk_user_ids();
    foreach ($financeDesk as $adminId) {
        create_notification(
            $adminId,
            'Remittance submitted: ' . $reference,
            ((string)($agent['name'] ?? 'An agent')) . ' reports sending GH₵ ' . number_format($amount, 2)
                . '. Nothing is confirmed until finance checks it.',
            'finance'
        );
    }

    $submission = find_remittance_submission($id);
    if ($submission === null) {
        error_response('The remittance could not be read back.', 500);
    }
    return shape_remittance_submission($submission);
}

function find_remittance_submission(string $id): ?array
{
    if ($id === '') {
        return null;
    }
    return db_one('SELECT * FROM remittance_submissions WHERE id = :id LIMIT 1', [':id' => $id]);
}

function find_remittance_submission_by_reference(string $reference): ?array
{
    return db_one('SELECT * FROM remittance_submissions WHERE reference = :r LIMIT 1', [':r' => $reference]);
}

/** Administrators who can act on a submission (used for internal notices). */
function finance_desk_user_ids(): array
{
    $rows = db_all(
        'SELECT id FROM users WHERE role = :role AND can_confirm_remittances = 1 ORDER BY email ASC',
        [':role' => 'admin']
    );
    return array_map(static fn($row) => (string)$row['id'], $rows);
}

function list_remittance_allocations(string $submissionId): array
{
    $rows = db_all(
        'SELECT * FROM remittance_allocations WHERE submission_id = :id ORDER BY created_at ASC',
        [':id' => $submissionId]
    );

    $out = [];
    foreach ($rows as $row) {
        $record = find_viewing_fee_record((string)$row['viewing_fee_record_id']);
        $out[] = [
            'id'                 => (string)$row['id'],
            'viewingFeeRecordId' => (string)$row['viewing_fee_record_id'],
            'amountGhs'          => finance_money($row['amount_ghs']),
            'reference'          => $record ? (string)$record['reference'] : '',
            'propertyTitle'      => $record ? (string)$record['property_title'] : '',
            'createdAt'          => to_iso($row['created_at'] ?? null),
        ];
    }
    return $out;
}

function remittance_allocated_total(string $submissionId): float
{
    return round((float)db_value(
        'SELECT COALESCE(SUM(amount_ghs), 0) FROM remittance_allocations WHERE submission_id = :id',
        [':id' => $submissionId]
    ), 2);
}

function shape_remittance_submission(array $row): array
{
    $id = (string)$row['id'];
    $status = (string)$row['status'];
    $amount = finance_money($row['amount_ghs']);
    $confirmed = finance_money($row['confirmed_ghs']);
    $allocated = $status === 'confirmed' ? remittance_allocated_total($id) : 0.0;

    $requested = [];
    if (!empty($row['requested_allocations_json'])) {
        $decoded = json_decode((string)$row['requested_allocations_json'], true);
        if (is_array($decoded)) {
            $requested = $decoded;
        }
    }

    return [
        'id'               => $id,
        'reference'        => (string)$row['reference'],
        'agentUserId'      => (string)$row['agent_user_id'],
        'agentName'        => (string)($row['agent_name'] ?? ''),
        'amountGhs'        => $amount,
        'currency'         => (string)($row['currency'] ?? 'GHS'),
        'method'           => (string)($row['method'] ?? ''),
        'paymentReference' => (string)($row['payment_reference'] ?? ''),
        'paidAt'           => (string)$row['paid_at'],
        'evidenceReference'=> (string)($row['evidence_reference'] ?? ''),
        'status'           => $status,
        'statusLabel'      => ucfirst($status),
        // A submitted amount is a claim. It only becomes `confirmedGhs` when a
        // human confirms the money arrived.
        'confirmedGhs'     => $confirmed,
        'isConfirmed'      => $status === 'confirmed',
        'allocatedGhs'     => $allocated,
        'unallocatedGhs'   => $confirmed === null ? null : round(max(0.0, $confirmed - $allocated), 2),
        'confirmedBy'      => (string)($row['confirmed_by'] ?? ''),
        'confirmedAt'      => to_iso($row['confirmed_at'] ?? null),
        'decisionReason'   => (string)($row['decision_reason'] ?? ''),
        'note'             => (string)($row['note'] ?? ''),
        'requestedAllocations' => $requested,
        'allocations'      => list_remittance_allocations($id),
        'createdAt'        => to_iso($row['created_at'] ?? null),
        'updatedAt'        => to_iso($row['updated_at'] ?? null),
    ];
}

function list_remittance_submissions(array $filters = [], int $limit = 200): array
{
    $where = [];
    $params = [];
    if (!empty($filters['agentUserId'])) {
        $where[] = 'agent_user_id = :agent';
        $params[':agent'] = (string)$filters['agentUserId'];
    }
    if (!empty($filters['status'])) {
        $where[] = 'status = :status';
        $params[':status'] = (string)$filters['status'];
    }
    if (!empty($filters['from'])) {
        $where[] = 'paid_at >= :from';
        $params[':from'] = (string)$filters['from'];
    }
    if (!empty($filters['to'])) {
        $where[] = 'paid_at <= :to';
        $params[':to'] = (string)$filters['to'];
    }
    $sql = 'SELECT * FROM remittance_submissions'
        . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where))
        . ' ORDER BY created_at DESC' . db_limit_clause($limit, 0);

    return array_map('shape_remittance_submission', db_all($sql, $params));
}


// ---------------------------------------------------------------------------
// Confirmation — the only path from "claimed" to "received"
// ---------------------------------------------------------------------------

/**
 * Confirm that Goodlucks actually received a submitted remittance, and apply
 * the money to specific viewing-fee obligations.
 *
 * Rules enforced here, not in the client:
 *   - the submission must be awaiting a decision;
 *   - the caller must hold the confirmation capability;
 *   - an allocation may only target a fee record belonging to the same agent;
 *   - an allocation may not exceed that obligation's outstanding balance;
 *   - allocations may not exceed the confirmed amount;
 *   - the same fee record may not be allocated twice in one confirmation.
 *
 * Money that is confirmed but not allocated is held as unmatched funds: it is
 * visible, it is not attached to an obligation, and it is counted once.
 */
function confirm_remittance(string $id, array $allocations, array $actor, string $note = ''): array
{
    $amount = 0.0;
    $agentUserId = '';

    /*
     * Everything that decides whether this remittance may be confirmed happens
     * inside one write-locked transaction (audit finding R4). Reading the
     * submission before the transaction and then updating it unconditionally is
     * the classic double-confirm bug: two administrators both see `submitted`,
     * both write `confirmed`, and the ledger receives the money twice.
     *
     * The three layers here are intentional:
     *   1. BEGIN IMMEDIATE (SQLite) / row locks (MySQL) keep other writers out.
     *   2. The status is re-read under that lock.
     *   3. The UPDATE is conditional on the status it read, and its affected-row
     *      count is checked — if anything slipped past 1 and 2, this still fails.
     */
    $confirmed = db_transaction_immediate(static function () use ($id, $allocations, $actor, $note, &$amount, &$agentUserId): array {
        $submission = db_lock_row('remittance_submissions', $id);
        if ($submission === null) {
            error_response('Remittance not found.', 404);
        }
        if (!in_array((string)$submission['status'], REMITTANCE_DECIDABLE_STATUSES, true)) {
            error_response(
                'This remittance is already ' . (string)$submission['status'] . ' and cannot be confirmed again.',
                409
            );
        }

        $submissionAmount = round((float)$submission['amount_ghs'], 2);
        $agentUserId = (string)$submission['agent_user_id'];

        $validated = [];
        $total = 0.0;
        foreach ($allocations as $row) {
            if (!is_array($row)) {
                continue;
            }
            $recordId = clean_string($row['viewingFeeRecordId'] ?? $row['recordId'] ?? '', 64);
            $rowAmount = finance_money($row['amountGhs'] ?? $row['amount'] ?? null);
            if ($recordId === '' || $rowAmount === null || $rowAmount <= 0) {
                error_response('Each allocation needs a viewing-fee record and an amount above zero.', 422, [
                    'allocations' => 'Choose a record and an amount for every allocation.',
                ]);
            }
            $rowAmount = round($rowAmount, 2);
            if (isset($validated[$recordId])) {
                error_response('The same viewing-fee record is allocated twice in one remittance.', 422, [
                    'allocations' => 'Each obligation may appear once per confirmation.',
                ]);
            }

            // Lock the obligation too: its outstanding balance is what the
            // allocation is measured against, and a concurrent confirmation for
            // another remittance could otherwise consume the same headroom.
            $record = db_lock_row('viewing_fee_records', $recordId);
            if ($record === null) {
                error_response('Viewing-fee record not found: ' . $recordId, 404);
            }
            if ((string)($record['agent_user_id'] ?? '') !== $agentUserId) {
                error_response(
                    'A remittance can only be applied to fee records belonging to the agent who submitted it.',
                    403
                );
            }
            if ((string)$record['collection_state'] === 'void') {
                error_response('That fee record has been voided and cannot receive money.', 409);
            }

            $shaped = shape_viewing_fee_record($record);
            if ($shaped['goodlucksShareGhs'] === null) {
                error_response(
                    'No amount is owed on ' . (string)$record['reference'] . ' yet, so money cannot be allocated to it.',
                    422
                );
            }
            $outstanding = (float)$shaped['outstandingGhs'];
            if ($rowAmount > $outstanding + 0.005) {
                error_response(
                    'The allocation for ' . (string)$record['reference'] . ' exceeds its outstanding balance of GH₵ '
                        . number_format($outstanding, 2) . '.',
                    422
                );
            }

            $validated[$recordId] = ['record' => $record, 'amount' => $rowAmount];
            $total += $rowAmount;
        }

        if ($total > $submissionAmount + 0.005) {
            error_response(
                'The allocations total GH₵ ' . number_format($total, 2)
                    . ', which is more than the remittance of GH₵ ' . number_format($submissionAmount, 2) . '.',
                422
            );
        }

        $now = db_now();
        // Named placeholders only: PDO cannot mix positional and named
        // parameters in one statement, and it is not portable across drivers.
        $decidable = [];
        $decidableParams = [];
        foreach (array_values(REMITTANCE_DECIDABLE_STATUSES) as $i => $state) {
            $decidable[] = ':state' . $i;
            $decidableParams[':state' . $i] = $state;
        }
        $moved = db_exec(
            'UPDATE remittance_submissions
                SET status = :status, confirmed_ghs = :confirmed, confirmed_by = :by,
                    confirmed_at = :at, decision_reason = :reason, updated_at = :at
              WHERE id = :id AND status IN (' . implode(', ', $decidable) . ')',
            array_merge(
                [
                    ':status'    => 'confirmed',
                    ':confirmed' => $submissionAmount,
                    ':by'        => (string)($actor['id'] ?? ''),
                    ':at'        => $now,
                    ':reason'    => $note !== '' ? $note : null,
                    ':id'        => $id,
                ],
                $decidableParams
            )
        );
        if ($moved !== 1) {
            error_response('This remittance was already decided by another request. Reload and try again.', 409);
        }

        foreach ($validated as $recordId => $entry) {
            $allocationId = new_id('ral');
            try {
                db_exec(
                    'INSERT INTO remittance_allocations
                        (id, submission_id, viewing_fee_record_id, agent_user_id, amount_ghs, created_by, created_at)
                     VALUES (:id, :submission, :record, :agent, :amount, :by, :now)',
                    [
                        ':id'         => $allocationId,
                        ':submission' => $id,
                        ':record'     => $recordId,
                        ':agent'      => $agentUserId,
                        ':amount'     => $entry['amount'],
                        ':by'         => (string)($actor['id'] ?? ''),
                        ':now'        => $now,
                    ]
                );
            } catch (Throwable $e) {
                // The unique (submission_id, viewing_fee_record_id) index is the
                // last line of defence against a duplicated allocation.
                if (db_is_unique_violation($e)) {
                    error_response('That obligation has already been allocated from this remittance.', 409);
                }
                throw $e;
            }
            // The Increment B ledger stays the source of truth for received money.
            db_exec(
                'INSERT INTO fee_remittances
                    (id, viewing_fee_record_id, amount_ghs, method, reference, received_at, recorded_by,
                     notes, submission_id, allocation_id, entry_type, created_at)
                 VALUES (:id, :record, :amount, :method, :reference, :received, :by,
                     :notes, :submission, :allocation, :entry, :now)',
                [
                    ':id'         => new_id('frm'),
                    ':record'     => $recordId,
                    ':amount'     => $entry['amount'],
                    ':method'     => (string)$submission['method'],
                    ':reference'  => (string)($submission['payment_reference'] ?? ''),
                    ':received'   => (string)$submission['paid_at'],
                    ':by'         => (string)($actor['id'] ?? ''),
                    ':notes'      => 'Confirmed against remittance ' . (string)$submission['reference'],
                    ':submission' => $id,
                    ':allocation' => $allocationId,
                    ':entry'      => 'receipt',
                    ':now'        => $now,
                ]
            );
        }

        audit_log('finance.remittance_confirmed', 'remittance', $id, [
            'reference'     => (string)$submission['reference'],
            'agentUserId'   => $agentUserId,
            'confirmedGhs'  => $submissionAmount,
            'allocatedGhs'  => round(array_sum(array_column($validated, 'amount')), 2),
            'records'       => array_keys($validated),
            'note'          => $note,
        ]);

        $amount = $submissionAmount;
        return ['amount' => $submissionAmount, 'agentUserId' => $agentUserId];
    });

    $amount = $confirmed['amount'];
    $agentUserId = $confirmed['agentUserId'];

    create_notification(
        $agentUserId,
        'Remittance confirmed: GH₵ ' . number_format($amount, 2),
        'Goodlucks confirmed receiving your remittance' . ($note !== '' ? ' — ' . $note : '') . '.',
        'finance'
    );

    $updated = find_remittance_submission($id);
    if ($updated === null) {
        error_response('The remittance could not be read back.', 500);
    }
    return shape_remittance_submission($updated);
}

/** Reject or dispute a submission. Never deletes it. */
function decide_remittance(string $id, string $status, string $reason, array $actor): array
{
    $status = strtolower(trim($status));
    $reason = trim($reason);
    if (!in_array($status, ['rejected', 'disputed'], true)) {
        error_response('Choose reject or dispute.', 422, ['status' => 'A decision is reject or dispute.']);
    }
    if ($reason === '') {
        error_response('Record why the remittance is being ' . $status . '.', 422, [
            'reason' => 'A decision needs a reason.',
        ]);
    }

    // The decision is taken against a re-read, locked row so two administrators
    // cannot reject a remittance that another request has just confirmed.
    $agentUserId = db_transaction_immediate(static function () use ($id, $status, $reason, $actor): string {
        $submission = db_lock_row('remittance_submissions', $id);
        if ($submission === null) {
            error_response('Remittance not found.', 404);
        }
        if (!in_array((string)$submission['status'], REMITTANCE_DECIDABLE_STATUSES, true)) {
            error_response('This remittance is already ' . (string)$submission['status'] . '.', 409);
        }

        $decidable = [];
        $decidableParams = [];
        foreach (array_values(REMITTANCE_DECIDABLE_STATUSES) as $i => $state) {
            $decidable[] = ':state' . $i;
            $decidableParams[':state' . $i] = $state;
        }
        $now = db_now();
        $moved = db_exec(
            'UPDATE remittance_submissions
                SET status = :status, decision_reason = :reason, confirmed_by = :by,
                    confirmed_at = :at, updated_at = :at
              WHERE id = :id AND status IN (' . implode(', ', $decidable) . ')',
            array_merge(
                [
                    ':status' => $status,
                    ':reason' => $reason,
                    ':by'     => (string)($actor['id'] ?? ''),
                    ':at'     => $now,
                    ':id'     => $id,
                ],
                $decidableParams
            )
        );
        if ($moved !== 1) {
            error_response('This remittance was already decided by another request. Reload and try again.', 409);
        }

        audit_log('finance.remittance_' . $status, 'remittance', $id, [
            'agentUserId' => (string)$submission['agent_user_id'],
            'amountGhs'   => (float)$submission['amount_ghs'],
            'reason'      => $reason,
        ]);

        return (string)$submission['agent_user_id'];
    });

    create_notification(
        $agentUserId,
        'Remittance ' . $status . ': ' . $id,
        'Reason: ' . $reason,
        'finance'
    );

    $updated = find_remittance_submission($id);
    if ($updated === null) {
        error_response('The remittance could not be read back.', 500);
    }
    return shape_remittance_submission($updated);
}


// ---------------------------------------------------------------------------
// Agent-facing view of their own money
// ---------------------------------------------------------------------------

/** Fees this agent reported collecting, with what is owed and what is settled. */
function agent_viewing_fee_records(string $agentUserId, int $limit = 300): array
{
    $rows = db_all(
        'SELECT * FROM viewing_fee_records WHERE agent_user_id = :agent ORDER BY recorded_at DESC'
            . db_limit_clause($limit, 0),
        [':agent' => $agentUserId]
    );
    return array_map('shape_viewing_fee_record', $rows);
}

function agent_finance_overview(string $agentUserId): array
{
    $records = agent_viewing_fee_records($agentUserId);
    $submissions = list_remittance_submissions(['agentUserId' => $agentUserId], 300);

    $collected = 0.0;
    $entitled = 0.0;
    $received = 0.0;
    $outstanding = 0.0;
    $disputedRecords = 0;
    foreach ($records as $record) {
        if (!($record['countsInTotals'] ?? true)) {
            continue;
        }
        $collected += (float)($record['feeTotalGhs'] ?? 0);
        $received += (float)($record['remittedGhs'] ?? 0);
        if (($record['collectionState'] ?? '') === 'disputed') {
            $disputedRecords++;
        }
        if ($record['goodlucksShareGhs'] !== null) {
            $entitled += (float)$record['goodlucksShareGhs'];
            $outstanding += (float)($record['outstandingGhs'] ?? 0);
        }
    }

    $pending = 0.0;
    $confirmedRemittances = 0.0;
    $rejected = 0;
    $disputedRemittances = 0;
    foreach ($submissions as $submission) {
        if ($submission['status'] === 'submitted') {
            $pending += (float)$submission['amountGhs'];
        } elseif ($submission['status'] === 'confirmed') {
            $confirmedRemittances += (float)($submission['confirmedGhs'] ?? 0);
        } elseif ($submission['status'] === 'rejected') {
            $rejected++;
        } elseif ($submission['status'] === 'disputed') {
            $disputedRemittances++;
        }
    }

    $commissions = array_map('shape_rental_commission', db_all(
        'SELECT * FROM rental_commissions WHERE agent_user_id = :agent ORDER BY created_at DESC'
            . db_limit_clause(100, 0),
        [':agent' => $agentUserId]
    ));

    return [
        'agentUserId' => $agentUserId,
        'totals' => [
            // What the agent says they collected from tenants.
            'collectedGhs'          => round($collected, 2),
            // What Goodlucks is entitled to under an explicit agreement.
            'payableToGoodlucksGhs' => round($entitled, 2),
            // What Goodlucks has confirmed receiving.
            'confirmedReceivedGhs'  => round($received, 2),
            'outstandingGhs'        => round($outstanding, 2),
            // Reported but not yet confirmed by finance.
            'awaitingConfirmationGhs' => round($pending, 2),
            'disputedRecords'       => $disputedRecords,
            'rejectedRemittances'   => $rejected,
            'disputedRemittances'   => $disputedRemittances,
        ],
        'viewingFees' => $records,
        'remittances' => $submissions,
        'commissions' => $commissions,
        'policy' => fee_policy_overview(),
        'capabilities' => [
            'canSubmitRemittances' => finance_agent_is_operational($agentUserId),
            'canConfirmReceipt'    => false,
            'canRecordCommissions' => false,
        ],
        'notes' => [
            'A remittance you submit is a claim until finance confirms it. Nothing you submit counts as revenue by itself.',
            'Amounts payable to Goodlucks only exist where an administrator has agreed a share or applied an approved policy.',
        ],
    ];
}


// ---------------------------------------------------------------------------
// Rental commissions — a separate workflow, never auto-generated
// ---------------------------------------------------------------------------

function commission_received_total(string $commissionId): float
{
    return round((float)db_value(
        'SELECT COALESCE(SUM(amount_ghs), 0) FROM commission_payments WHERE commission_id = :id',
        [':id' => $commissionId]
    ), 2);
}

function list_commission_payments(string $commissionId): array
{
    $rows = db_all(
        'SELECT * FROM commission_payments WHERE commission_id = :id ORDER BY received_at ASC, created_at ASC',
        [':id' => $commissionId]
    );
    return array_map(static fn($row) => [
        'id'         => (string)$row['id'],
        'amountGhs'  => finance_money($row['amount_ghs']),
        'method'     => (string)($row['method'] ?? ''),
        'reference'  => (string)($row['reference'] ?? ''),
        'receivedAt' => (string)$row['received_at'],
        'recordedBy' => (string)($row['recorded_by'] ?? ''),
        'entryType'  => (string)($row['entry_type'] ?? 'receipt'),
        'adjustmentId' => (string)($row['adjustment_id'] ?? ''),
        'notes'      => (string)($row['notes'] ?? ''),
        'createdAt'  => to_iso($row['created_at'] ?? null),
    ], $rows);
}

function shape_rental_commission(array $row): array
{
    $id = (string)$row['id'];
    $amount = finance_money($row['commission_amount_ghs']);
    $received = commission_received_total($id);
    $outstanding = $amount === null ? null : round(max(0.0, $amount - $received), 2);
    $status = (string)$row['status'];

    $snapshot = null;
    if (!empty($row['policy_snapshot_json'])) {
        $decoded = json_decode((string)$row['policy_snapshot_json'], true);
        if (is_array($decoded)) {
            $snapshot = $decoded;
            $snapshot['hashValid'] = hash_equals(
                (string)($row['policy_snapshot_hash'] ?? ''),
                fee_snapshot_hash($decoded)
            );
        }
    }

    return [
        'id'               => $id,
        'reference'        => (string)$row['reference'],
        'propertyId'       => (string)($row['property_id'] ?? ''),
        'propertyTitle'    => (string)($row['property_title'] ?? ''),
        'tenantName'       => (string)($row['tenant_name'] ?? ''),
        'tenantUserId'     => (string)($row['tenant_user_id'] ?? ''),
        'landlordName'     => (string)($row['landlord_name'] ?? ''),
        'landlordUserId'   => (string)($row['landlord_user_id'] ?? ''),
        'agentUserId'      => (string)($row['agent_user_id'] ?? ''),
        'agentName'        => (string)($row['agent_name'] ?? ''),
        'rentalReference'  => (string)($row['rental_reference'] ?? ''),
        'amountGhs'        => $amount,
        'currency'         => (string)($row['currency'] ?? 'GHS'),
        'basis'            => (string)($row['basis'] ?? 'manual_agreement'),
        'policyId'         => (string)($row['policy_id'] ?? ''),
        'policySnapshot'   => $snapshot,
        'dueDate'          => (string)($row['due_date'] ?? ''),
        'status'           => $status,
        'statusLabel'      => COMMISSION_LABELS[$status] ?? ucfirst($status),
        'receivedGhs'      => $received,
        'outstandingGhs'   => $outstanding,
        'isSettled'        => $amount !== null && $received + 0.005 >= $amount,
        'notes'            => (string)($row['notes'] ?? ''),
        'cancelReason'     => (string)($row['cancel_reason'] ?? ''),
        'createdBy'        => (string)($row['created_by'] ?? ''),
        'createdAt'        => to_iso($row['created_at'] ?? null),
        'updatedAt'        => to_iso($row['updated_at'] ?? null),
        'payments'         => list_commission_payments($id),
        // A commission is an obligation, not revenue, until money is received.
        'countsAsRevenue'  => false,
    ];
}

/**
 * Build the immutable snapshot for a commission priced by an approved policy.
 * Refuses anything that is not approved, active and in force on the due date.
 */
function commission_policy_snapshot(string $policyId, float $baseAmount, string $onDate, string $tier): array
{
    $policy = find_fee_policy($policyId);
    if ($policy === null) {
        error_response('Fee policy not found.', 404);
    }
    if ((string)$policy['category'] !== 'rental_commission') {
        error_response('That policy is not a rental-commission policy.', 422);
    }
    $status = effective_fee_policy_status($policy);
    if ($status !== 'active') {
        error_response('Only an active, approved policy can price a commission. This one is ' . $status . '.', 422);
    }
    if (!$policy_covers = fee_policy_covers_date($policy, $onDate)) {
        error_response('The policy does not cover ' . $onDate . '.', 422);
    }
    if ((string)($policy['tier'] ?? '') !== $tier) {
        error_response(
            'The policy applies to the ' . (string)($policy['tier'] ?? '') . ' tier, not ' . $tier . '.',
            422
        );
    }

    $split = fee_policy_split($policy, $baseAmount);
    $payload = [
        'snapshotKind'      => 'rental_commission_policy',
        'policyId'          => (string)$policy['id'],
        'policyName'        => (string)($policy['name'] ?? ''),
        'policyVersion'     => (int)($policy['version'] ?? 1),
        'policyCategory'    => (string)$policy['category'],
        'policyTier'        => (string)$policy['tier'],
        'calculationMethod' => (string)($policy['calculation_method'] ?? 'percentage'),
        'agentSharePercent' => $split['agentPercent'],
        'goodlucksSharePercent' => $split['goodlucksPercent'],
        'baseAmountGhs'     => round($baseAmount, 2),
        'commissionGhs'     => $split['goodlucks'],
        'agentShareGhs'     => $split['agent'],
        'effectiveFrom'     => (string)($policy['effective_from'] ?? ''),
        'effectiveTo'       => (string)($policy['effective_to'] ?? ''),
        'transactionAt'     => $onDate,
        'frozenAt'          => db_now(),
    ];
    $payload['snapshotHash'] = fee_snapshot_hash($payload);
    return $payload;
}

/**
 * Create a commission record. A draft may have no amount yet; the amount and the
 * rental reference are required before it can be marked agreed.
 */
function create_rental_commission(array $input, array $actor): array
{
    $propertyId = clean_string($input['propertyId'] ?? '', 64);
    $property = $propertyId !== '' ? find_property($propertyId) : null;
    if ($property === null) {
        error_response('Choose the property this commission relates to.', 422, [
            'propertyId' => 'A commission must name a real property.',
        ]);
    }

    $amount = finance_money($input['amountGhs'] ?? $input['commissionAmountGhs'] ?? null);
    if ($amount !== null && $amount <= 0) {
        error_response('A commission amount must be greater than zero.', 422, ['amountGhs' => 'Enter an amount above zero.']);
    }

    $dueDate = null;
    if (isset($input['dueDate']) && $input['dueDate'] !== '') {
        $dueDate = valid_date_iso($input['dueDate']);
        if ($dueDate === null) {
            error_response('Use a real calendar date for the due date.', 422, ['dueDate' => 'Use a real date.']);
        }
    }

    $agentUserId = clean_string($input['agentUserId'] ?? ($property['submitted_by_user_id'] ?? ''), 64);
    if ($agentUserId !== '') {
        $agentUser = find_user_by_id($agentUserId);
        if ($agentUser === null || (string)($agentUser['role'] ?? '') !== 'agent') {
            error_response('The responsible agent must be a real agent account.', 422, [
                'agentUserId' => 'Choose an agent account.',
            ]);
        }
    }

    $basis = one_of(strtolower(trim((string)($input['basis'] ?? 'manual_agreement'))), ['manual_agreement', 'policy_snapshot'], 'manual_agreement');
    $snapshot = null;
    $policyId = '';
    if ($basis === 'policy_snapshot') {
        $policyId = clean_string($input['policyId'] ?? '', 64);
        if ($policyId === '') {
            error_response('Choose the approved policy that prices this commission.', 422, [
                'policyId' => 'A policy-priced commission needs a policy.',
            ]);
        }
        if ($amount === null) {
            error_response('Enter the rent the policy should be applied to.', 422, ['amountGhs' => 'Enter the base amount.']);
        }
        $tier = $agentUserId !== '' ? agent_tier_state($agentUserId)['tier'] : 'standard';
        $snapshot = commission_policy_snapshot($policyId, (float)$amount, $dueDate ?? finance_today(), $tier);
        // The policy decides the commission; the operator does not type it.
        $amount = (float)$snapshot['commissionGhs'];
    }

    $id = new_id('com');
    $reference = finance_reference('COM');
    db_exec(
        'INSERT INTO rental_commissions
            (id, reference, property_id, property_title, tenant_user_id, tenant_name,
             landlord_user_id, landlord_name, agent_user_id, agent_name, rental_reference,
             commission_amount_ghs, currency, basis, policy_id, policy_snapshot_json,
             policy_snapshot_hash, due_date, status, notes, created_by, created_at)
         VALUES
            (:id, :reference, :property, :title, :tenant, :tenant_name,
             :landlord, :landlord_name, :agent, :agent_name, :rental_ref,
             :amount, :currency, :basis, :policy, :snapshot,
             :hash, :due, :status, :notes, :by, :now)',
        [
            ':id'          => $id,
            ':reference'   => $reference,
            ':property'    => $propertyId,
            ':title'       => (string)($property['title'] ?? ''),
            ':tenant'      => clean_string($input['tenantUserId'] ?? '', 64),
            ':tenant_name' => clean_string($input['tenantName'] ?? '', 255),
            ':landlord'    => (string)($property['landlord_id'] ?? ''),
            ':landlord_name' => (string)($property['landlord_name'] ?? ''),
            ':agent'       => $agentUserId,
            ':agent_name'  => $agentUserId !== '' ? (string)(find_user_by_id($agentUserId)['name'] ?? '') : '',
            ':rental_ref'  => clean_string($input['rentalReference'] ?? '', 128),
            ':amount'      => $amount,
            ':currency'    => 'GHS',
            ':basis'       => $basis,
            ':policy'      => $policyId !== '' ? $policyId : null,
            ':snapshot'    => $snapshot === null ? null : json_encode($snapshot, JSON_UNESCAPED_SLASHES),
            ':hash'        => $snapshot['snapshotHash'] ?? null,
            ':due'         => $dueDate,
            ':status'      => 'draft',
            ':notes'       => clean_text($input['notes'] ?? '', 2000) ?: null,
            ':by'          => (string)($actor['id'] ?? ''),
            ':now'         => db_now(),
        ]
    );

    audit_log('finance.commission_created', 'commission', $id, [
        'propertyId' => $propertyId,
        'agentUserId' => $agentUserId,
        'amountGhs'  => $amount,
        'basis'      => $basis,
        'policyId'   => $policyId,
        'status'     => 'draft',
    ]);

    $created = find_rental_commission($id);
    if ($created === null) {
        error_response('The commission could not be read back.', 500);
    }
    return shape_rental_commission($created);
}

function find_rental_commission(string $id): ?array
{
    if ($id === '') {
        return null;
    }
    return db_one('SELECT * FROM rental_commissions WHERE id = :id LIMIT 1', [':id' => $id]);
}

function list_rental_commissions(array $filters = [], int $limit = 200): array
{
    $where = [];
    $params = [];
    foreach (['status' => 'status', 'agentUserId' => 'agent_user_id', 'propertyId' => 'property_id'] as $key => $column) {
        if (!empty($filters[$key])) {
            $where[] = $column . ' = :' . $key;
            $params[':' . $key] = (string)$filters[$key];
        }
    }
    if (!empty($filters['from'])) {
        $where[] = 'created_at >= :from';
        $params[':from'] = (string)$filters['from'];
    }
    if (!empty($filters['to'])) {
        $where[] = 'created_at <= :to';
        $params[':to'] = (string)$filters['to'];
    }

    $sql = 'SELECT * FROM rental_commissions'
        . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where))
        . ' ORDER BY created_at DESC' . db_limit_clause($limit, 0);

    return array_map('shape_rental_commission', db_all($sql, $params));
}

/** Move a commission through its workflow. Nothing here is automatic. */
function set_commission_status(string $id, string $status, array $actor, string $reason = ''): array
{
    $commission = find_rental_commission($id);
    if ($commission === null) {
        error_response('Commission not found.', 404);
    }
    $status = strtolower(trim($status));
    if (!in_array($status, COMMISSION_STATUSES, true)) {
        error_response('That is not a commission status.', 422, ['status' => 'Choose a known status.']);
    }
    $current = (string)$commission['status'];
    if ($current === $status) {
        error_response('The commission is already ' . $status . '.', 409);
    }
    if (!in_array($status, COMMISSION_TRANSITIONS[$current] ?? [], true)) {
        error_response('A ' . $current . ' commission cannot be moved to ' . $status . '.', 422);
    }

    $reason = clean_text($reason, 1000);
    if (in_array($status, ['cancelled', 'disputed'], true) && trim($reason) === '') {
        error_response('Record why the commission is being ' . $status . '.', 422, [
            'reason' => 'A ' . $status . ' commission needs a reason.',
        ]);
    }

    $amount = finance_money($commission['commission_amount_ghs']);
    if ($status === 'agreed') {
        if ($amount === null || $amount <= 0) {
            error_response('Set the agreed commission amount before marking it agreed.', 422, [
                'amountGhs' => 'A commission needs an amount.',
            ]);
        }
        if (trim((string)($commission['rental_reference'] ?? '')) === '') {
            error_response(
                'Record the rental agreement reference first. A commission must be based on an actual agreement.',
                422,
                ['rentalReference' => 'Give the agreement or receipt reference.']
            );
        }
        if ((string)$commission['basis'] === 'manual_agreement' && trim((string)($commission['notes'] ?? '')) === '' && trim($reason) === '') {
            error_response(
                'Record the agreed terms (who agreed, on what basis). A manual commission cannot be asserted without them.',
                422,
                ['notes' => 'Describe the agreement.']
            );
        }
    }

    // Conditional on the status the decision was based on: if a concurrent
    // request already moved this commission, the update matches no row and the
    // caller is told to reload instead of overwriting the other decision.
    $moved = db_transaction_immediate(static fn(): int => db_exec(
        'UPDATE rental_commissions
            SET status = :status, cancel_reason = :reason, updated_at = :now
          WHERE id = :id AND status = :expected',
        [
            ':status'   => $status,
            ':reason'   => in_array($status, ['cancelled', 'disputed'], true) ? $reason : ($commission['cancel_reason'] ?? null),
            ':now'      => db_now(),
            ':id'       => $id,
            ':expected' => $current,
        ]
    ));
    if ($moved !== 1) {
        error_response('This commission changed while you were deciding. Reload and try again.', 409);
    }

    audit_log('finance.commission_status', 'commission', $id, [
        'from'       => $current,
        'to'         => $status,
        'reason'     => $reason,
        'agentUserId' => (string)($commission['agent_user_id'] ?? ''),
    ]);

    $updated = find_rental_commission($id);
    if ($updated === null) {
        error_response('The commission could not be read back.', 500);
    }
    return shape_rental_commission($updated);
}

/** Update the editable fields of a commission that has not been agreed yet. */
function update_rental_commission(string $id, array $input, array $actor): array
{
    /*
     * The read, the status check and the write happen in one write-locked
     * transaction (audit finding R4). Read-then-write across two statements is
     * how a commission that another administrator has just agreed gets edited
     * anyway, leaving an "agreed" commission with new terms and no record of
     * the change.
     *
     * An affected-row check is not used here: writing unchanged values also
     * reports zero affected rows on MySQL, which would turn a legitimate no-op
     * edit into a false conflict. The lock plus the re-read is the guard.
     */
    db_transaction_immediate(static function () use ($id, $input, $actor): void {
        $commission = db_lock_row('rental_commissions', $id);
        if ($commission === null) {
            error_response('Commission not found.', 404);
        }
        $status = (string)$commission['status'];
        if (!in_array($status, ['draft', 'awaiting_agreement'], true)) {
            error_response('Only a draft or awaiting-agreement commission can be edited. Use an adjustment afterwards.', 409);
        }

        $amount = finance_money($input['amountGhs'] ?? $input['commissionAmountGhs'] ?? $commission['commission_amount_ghs']);
        if ($amount !== null && $amount <= 0) {
            error_response('A commission amount must be greater than zero.', 422, ['amountGhs' => 'Enter an amount above zero.']);
        }
        $dueDate = $commission['due_date'];
        if (array_key_exists('dueDate', $input)) {
            $dueDate = $input['dueDate'] === '' || $input['dueDate'] === null ? null : valid_date_iso($input['dueDate']);
            if ($input['dueDate'] !== null && $input['dueDate'] !== '' && $dueDate === null) {
                error_response('Use a real calendar date for the due date.', 422, ['dueDate' => 'Use a real date.']);
            }
        }

        $fields = [];
        if (array_key_exists('notes', $input)) {
            $fields['notes'] = clean_text($input['notes'], 2000) ?: null;
        }
        if (array_key_exists('rentalReference', $input)) {
            $fields['rental_reference'] = clean_string($input['rentalReference'], 128);
        }
        if (array_key_exists('tenantName', $input)) {
            $fields['tenant_name'] = clean_string($input['tenantName'], 255);
        }

        db_exec(
            'UPDATE rental_commissions
                SET commission_amount_ghs = :amount, due_date = :due'
            . ($fields === [] ? '' : ', ' . implode(', ', array_map(static fn($k) => $k . ' = :' . $k, array_keys($fields))))
            . ', updated_at = :now WHERE id = :id',
            array_merge([
                ':amount' => $amount,
                ':due'    => $dueDate,
                ':now'    => db_now(),
                ':id'     => $id,
            ], array_combine(array_map(static fn($k) => ':' . $k, array_keys($fields)), array_values($fields)))
        );

        audit_log('finance.commission_updated', 'commission', $id, [
            'status' => $status,
            'amountGhs' => $amount,
            'dueDate' => $dueDate,
        ]);
    });

    $updated = find_rental_commission($id);
    if ($updated === null) {
        error_response('The commission could not be read back.', 500);
    }
    return shape_rental_commission($updated);
}

/**
 * Record money actually received against a commission.
 *
 * The commission total and everything already received are re-read under a row
 * lock inside the transaction (audit finding R4). Reading them outside is how a
 * doubled click used to record the same payment twice, or how two payments
 * could each pass the "would this exceed the total" check and then both be
 * written, over-receiving the commission.
 */
function add_commission_payment(string $id, array $input, array $actor): array
{
    $amount = finance_money($input['amountGhs'] ?? $input['amount'] ?? null);
    if ($amount === null || $amount <= 0) {
        error_response('Enter the amount received, greater than zero.', 422, ['amountGhs' => 'Enter an amount above zero.']);
    }
    $amount = round($amount, 2);
    $receivedAt = valid_date_iso($input['receivedAt'] ?? null);
    if ($receivedAt === null) {
        error_response('Give the date the money was received.', 422, ['receivedAt' => 'Use a real date.']);
    }
    if ($receivedAt > finance_today()) {
        error_response('A receipt cannot be dated in the future.', 422, ['receivedAt' => 'Choose today or earlier.']);
    }
    $method = one_of(strtolower(trim((string)($input['method'] ?? 'unknown'))), FINANCE_METHODS, 'unknown');

    $paymentId = new_id('cpay');

    db_transaction_immediate(static function () use ($id, $paymentId, $amount, $receivedAt, $method, $input, $actor) {
        $commission = db_lock_row('rental_commissions', $id);
        if ($commission === null) {
            error_response('Commission not found.', 404);
        }
        if (!in_array((string)$commission['status'], COMMISSION_PAYABLE_STATUSES, true)) {
            error_response(
                'Payments can only be recorded against an agreed, due or partially paid commission. This one is '
                    . (string)$commission['status'] . '.',
                409
            );
        }

        $total = finance_money($commission['commission_amount_ghs']);
        if ($total === null) {
            error_response('Set the commission amount before recording a payment.', 422);
        }
        $received = commission_received_total($id);
        if ($received + $amount > $total + 0.005) {
            error_response(
                'That payment would exceed the agreed commission. Record an adjustment instead of over-receiving.',
                422
            );
        }

        db_exec(
            'INSERT INTO commission_payments
                (id, commission_id, amount_ghs, method, reference, received_at, recorded_by, entry_type, notes, created_at)
             VALUES (:id, :commission, :amount, :method, :reference, :received, :by, :entry, :notes, :now)',
            [
                ':id'         => $paymentId,
                ':commission' => $id,
                ':amount'     => $amount,
                ':method'     => $method,
                ':reference'  => clean_string($input['reference'] ?? '', 128),
                ':received'   => $receivedAt,
                ':by'         => (string)($actor['id'] ?? ''),
                ':entry'      => 'receipt',
                ':notes'      => clean_text($input['notes'] ?? '', 1000) ?: null,
                ':now'        => db_now(),
            ]
        );
        audit_log('finance.commission_payment', 'commission', $id, [
            'paymentId'  => $paymentId,
            'amountGhs'  => $amount,
            'receivedAt' => $receivedAt,
        ]);

        // Derived inside the same transaction, so the summary can never be read
        // in a state where the payment exists but the status does not reflect it.
        finance_recompute_commission_status($id, $actor);
    });

    $updated = find_rental_commission($id);
    if ($updated === null) {
        error_response('The commission could not be read back.', 500);
    }
    return shape_rental_commission($updated);
}

/** Derive paid / partially paid / due from the money actually received. */
function finance_recompute_commission_status(string $id, array $actor): void
{
    $commission = find_rental_commission($id);
    if ($commission === null) {
        return;
    }
    $current = (string)$commission['status'];
    if (in_array($current, ['cancelled', 'corrected', 'disputed', 'draft', 'awaiting_agreement'], true)) {
        return;
    }
    $amount = finance_money($commission['commission_amount_ghs']);
    if ($amount === null) {
        return;
    }
    $received = commission_received_total($id);
    if ($received + 0.005 >= $amount) {
        $next = 'paid';
    } elseif ($received > 0) {
        $next = 'partially_paid';
    } else {
        $next = (string)($commission['due_date'] ?? '') !== '' && (string)$commission['due_date'] <= finance_today()
            ? 'due'
            : 'agreed';
    }
    if ($next === $current) {
        return;
    }

    db_exec(
        'UPDATE rental_commissions SET status = :status, updated_at = :now WHERE id = :id',
        [':status' => $next, ':now' => db_now(), ':id' => $id]
    );
    audit_log('finance.commission_status', 'commission', $id, [
        'from'   => $current,
        'to'     => $next,
        'reason' => 'Derived from the payments received.',
    ]);
}


// ---------------------------------------------------------------------------
// Adjustments and reversals — corrections without rewriting history
// ---------------------------------------------------------------------------

function find_financial_adjustment(string $id): ?array
{
    if ($id === '') {
        return null;
    }
    return db_one('SELECT * FROM financial_adjustments WHERE id = :id LIMIT 1', [':id' => $id]);
}

function shape_financial_adjustment(array $row): array
{
    return [
        'id'          => (string)$row['id'],
        'subjectType' => (string)$row['subject_type'],
        'subjectId'   => (string)$row['subject_id'],
        'kind'        => (string)$row['kind'],
        'amountGhs'   => finance_money($row['amount_ghs']),
        'reason'      => (string)$row['reason'],
        'supportReference' => (string)($row['support_reference'] ?? ''),
        'meta'        => !empty($row['meta_json']) ? json_decode((string)$row['meta_json'], true) : null,
        'createdBy'   => (string)($row['created_by'] ?? ''),
        'createdAt'   => to_iso($row['created_at'] ?? null),
    ];
}

function list_financial_adjustments(array $filters = [], int $limit = 200): array
{
    $where = [];
    $params = [];
    if (!empty($filters['subjectType'])) {
        $where[] = 'subject_type = :type';
        $params[':type'] = (string)$filters['subjectType'];
    }
    if (!empty($filters['subjectId'])) {
        $where[] = 'subject_id = :sid';
        $params[':sid'] = (string)$filters['subjectId'];
    }
    $sql = 'SELECT * FROM financial_adjustments'
        . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where))
        . ' ORDER BY created_at DESC' . db_limit_clause($limit, 0);
    return array_map('shape_financial_adjustment', db_all($sql, $params));
}

/**
 * Reverse a confirmed viewing-fee receipt.
 *
 * The original receipt row is never edited: a negative `fee_remittances` row is
 * written with entry_type='reversal' and linked to the adjustment, so the
 * ledger net, the obligation's outstanding balance and the history all stay
 * consistent.
 */
function reverse_viewing_fee_remittance(string $remittanceId, float $amount, string $reason, string $supportReference, array $actor): array
{
    $amount = round($amount, 2);
    $reason = trim($reason);
    if ($amount <= 0) {
        error_response('The reversal must be above zero.', 422, ['amountGhs' => 'Enter an amount above zero.']);
    }
    if ($reason === '') {
        error_response('Record why the receipt is being reversed.', 422, ['reason' => 'A reversal needs a reason.']);
    }

    // The whole decision is taken under the write lock: the receipt is re-read,
    // its own reversal history is re-summed, and the reversal is written, all
    // before another writer can look at the same receipt.
    $adjustmentId = db_transaction_immediate(static function () use ($remittanceId, $amount, $reason, $supportReference, $actor): string {
        $receipt = db_lock_row('fee_remittances', $remittanceId);
        if ($receipt === null) {
            error_response('That receipt does not exist.', 404);
        }
        if ((string)($receipt['entry_type'] ?? 'receipt') !== 'receipt') {
            error_response('Only a receipt can be reversed.', 409);
        }

        $original = round((float)$receipt['amount_ghs'], 2);
        if ($original <= 0) {
            error_response('That ledger row is not a receipt with money to reverse.', 409);
        }

        // Cumulative reversals are measured against THIS receipt only. Two
        // receipts on the same obligation keep independent headroom, so fully
        // reversing one never consumes another's (audit finding R3).
        $alreadyReversed = round(abs((float)db_value(
            "SELECT COALESCE(SUM(amount_ghs), 0) FROM fee_remittances
              WHERE reversal_of_receipt_id = :receipt AND entry_type = 'reversal'",
            [':receipt' => (string)$receipt['id']]
        )), 2);

        $reversible = round($original - $alreadyReversed, 2);
        if ($reversible <= 0.004) {
            error_response('That receipt has already been fully reversed.', 409, [
                'amountGhs' => 'Nothing remains to reverse on this receipt.',
            ]);
        }
        if ($amount > $reversible + 0.005) {
            error_response(
                'The reversal is larger than what is left on this receipt (GH₵ ' . number_format($reversible, 2) . ').',
                422,
                ['amountGhs' => 'Enter an amount up to GH₵ ' . number_format($reversible, 2) . '.']
            );
        }

        $recordId = (string)$receipt['viewing_fee_record_id'];
        $newAdjustmentId = new_id('fadj');

        db_exec(
            'INSERT INTO financial_adjustments
                (id, subject_type, subject_id, kind, amount_ghs, reason, support_reference, meta_json, created_by, created_at)
             VALUES (:id, :type, :subject, :kind, :amount, :reason, :support, :meta, :by, :now)',
            [
                ':id'      => $newAdjustmentId,
                ':type'    => 'viewing_fee_remittance',
                ':subject' => (string)$receipt['id'],
                ':kind'    => 'reversal',
                ':amount'  => -$amount,
                ':reason'  => $reason,
                ':support' => $supportReference,
                ':meta'    => json_encode([
                    'viewingFeeRecordId'   => $recordId,
                    'originalReceiptGhs'   => $original,
                    'previouslyReversedGhs'=> $alreadyReversed,
                    'reversalGhs'          => $amount,
                ]),
                ':by'      => (string)($actor['id'] ?? ''),
                ':now'     => db_now(),
            ]
        );
        db_exec(
            'INSERT INTO fee_remittances
                (id, viewing_fee_record_id, amount_ghs, method, reference, received_at, recorded_by,
                 notes, submission_id, allocation_id, entry_type, adjustment_id, reversal_of_receipt_id, created_at)
             VALUES (:id, :record, :amount, :method, :reference, :received, :by,
                 :notes, NULL, NULL, :entry, :adjustment, :reversed_receipt, :now)',
            [
                ':id'               => new_id('frm'),
                ':record'           => $recordId,
                ':amount'           => -$amount,
                ':method'           => (string)($receipt['method'] ?? 'unknown'),
                ':reference'        => (string)($receipt['reference'] ?? ''),
                ':received'         => finance_today(),
                ':by'               => (string)($actor['id'] ?? ''),
                ':notes'            => 'Reversal of receipt ' . (string)$receipt['id'] . ': ' . $reason,
                ':entry'            => 'reversal',
                ':adjustment'       => $newAdjustmentId,
                ':reversed_receipt' => (string)$receipt['id'],
                ':now'              => db_now(),
            ]
        );
        audit_log('finance.remittance_reversed', 'remittance', (string)$receipt['id'], [
            'viewingFeeRecordId'    => $recordId,
            'reversalGhs'           => $amount,
            'previouslyReversedGhs' => $alreadyReversed,
            'reason'                => $reason,
            'adjustmentId'          => $newAdjustmentId,
        ]);

        return $newAdjustmentId;
    });

    $created = find_financial_adjustment($adjustmentId);
    if ($created === null) {
        error_response('The adjustment could not be read back.', 500);
    }
    return shape_financial_adjustment($created);
}

/** How much of a receipt is still reversible (0 when fully reversed). */
function receipt_reversible_balance(string $receiptId): float
{
    $receipt = db_one('SELECT * FROM fee_remittances WHERE id = :id LIMIT 1', [':id' => $receiptId]);
    if ($receipt === null || (string)($receipt['entry_type'] ?? 'receipt') !== 'receipt') {
        return 0.0;
    }
    $reversed = abs((float)db_value(
        "SELECT COALESCE(SUM(amount_ghs), 0) FROM fee_remittances
          WHERE reversal_of_receipt_id = :receipt AND entry_type = 'reversal'",
        [':receipt' => $receiptId]
    ));
    return round(max(0.0, (float)$receipt['amount_ghs'] - $reversed), 2);
}

/**
 * Adjust a commission: reverse money that was recorded received, or correct the
 * agreed amount. Both keep the original rows and add a linked record.
 */
function adjust_rental_commission(string $commissionId, string $kind, float $amount, string $reason, string $supportReference, array $actor): array
{
    if (!in_array($kind, ['reversal', 'correction'], true)) {
        error_response('Choose reversal or correction.', 422, ['kind' => 'An adjustment is a reversal or a correction.']);
    }
    $amount = round($amount, 2);
    $reason = trim($reason);
    if ($reason === '') {
        error_response('Record why the commission is being adjusted.', 422, ['reason' => 'An adjustment needs a reason.']);
    }

    $adjustmentId = new_id('fadj');

    // Both branches take the commission row lock and re-measure the money that
    // has actually been received inside the transaction. Two simultaneous
    // reversals can therefore never take back more than was received, and a
    // correction can never drop the commission below what is already paid.
    db_transaction_immediate(static function () use ($adjustmentId, $commissionId, $kind, $amount, $reason, $supportReference, $actor) {
        $commission = db_lock_row('rental_commissions', $commissionId);
        if ($commission === null) {
            error_response('Commission not found.', 404);
        }

        if ($kind === 'reversal') {
            if ($amount <= 0) {
                error_response('The reversal must be above zero.', 422, [
                    'amountGhs' => 'Enter an amount above zero.',
                ]);
            }
            $received = commission_received_total($commissionId);
            if ($amount > $received + 0.005) {
                error_response('The reversal must be above zero and no more than the amount received.', 422, [
                    'amountGhs' => 'Enter an amount up to GH₵ ' . number_format($received, 2) . '.',
                ]);
            }

            db_exec(
                'INSERT INTO financial_adjustments
                    (id, subject_type, subject_id, kind, amount_ghs, reason, support_reference, meta_json, created_by, created_at)
                 VALUES (:id, :type, :subject, :kind, :amount, :reason, :support, :meta, :by, :now)',
                [
                    ':id'      => $adjustmentId,
                    ':type'    => 'rental_commission',
                    ':subject' => $commissionId,
                    ':kind'    => 'reversal',
                    ':amount'  => -$amount,
                    ':reason'  => $reason,
                    ':support' => $supportReference,
                    ':meta'    => json_encode(['reversalGhs' => $amount, 'receivedBeforeGhs' => $received]),
                    ':by'      => (string)($actor['id'] ?? ''),
                    ':now'     => db_now(),
                ]
            );
            db_exec(
                'INSERT INTO commission_payments
                    (id, commission_id, amount_ghs, method, reference, received_at, recorded_by, adjustment_id, entry_type, notes, created_at)
                 VALUES (:id, :commission, :amount, :method, :reference, :received, :by, :adjustment, :entry, :notes, :now)',
                [
                    ':id'         => new_id('cpay'),
                    ':commission' => $commissionId,
                    ':amount'     => -$amount,
                    ':method'     => 'adjustment',
                    ':reference'  => $supportReference,
                    ':received'   => finance_today(),
                    ':by'         => (string)($actor['id'] ?? ''),
                    ':adjustment' => $adjustmentId,
                    ':entry'      => 'reversal',
                    ':notes'      => 'Reversal: ' . $reason,
                    ':now'        => db_now(),
                ]
            );
            audit_log('finance.commission_reversed', 'commission', $commissionId, [
                'reversalGhs'   => $amount,
                'receivedBeforeGhs' => $received,
                'reason'        => $reason,
                'adjustmentId'  => $adjustmentId,
            ]);
        } else {
            $currentAmount = finance_money($commission['commission_amount_ghs']);
            if ($currentAmount === null) {
                error_response('Set the commission amount before correcting it.', 422);
            }
            if (abs($amount) < 0.005) {
                error_response('A correction needs a non-zero amount.', 422);
            }
            $newAmount = round($currentAmount + $amount, 2);
            $received = commission_received_total($commissionId);
            if ($newAmount <= 0) {
                error_response('A correction cannot take the commission to zero or below.', 422);
            }
            if ($newAmount + 0.005 < $received) {
                error_response('A correction cannot put the commission below the amount already received.', 422);
            }

            db_exec(
                'INSERT INTO financial_adjustments
                    (id, subject_type, subject_id, kind, amount_ghs, reason, support_reference, meta_json, created_by, created_at)
                 VALUES (:id, :type, :subject, :kind, :amount, :reason, :support, :meta, :by, :now)',
                [
                    ':id'      => $adjustmentId,
                    ':type'    => 'rental_commission',
                    ':subject' => $commissionId,
                    ':kind'    => 'correction',
                    ':amount'  => $amount,
                    ':reason'  => $reason,
                    ':support' => $supportReference,
                    ':meta'    => json_encode(['fromGhs' => $currentAmount, 'toGhs' => $newAmount]),
                    ':by'      => (string)($actor['id'] ?? ''),
                    ':now'     => db_now(),
                ]
            );
            db_exec(
                'UPDATE rental_commissions SET commission_amount_ghs = :amount, updated_at = :now WHERE id = :id',
                [':amount' => $newAmount, ':now' => db_now(), ':id' => $commissionId]
            );
            audit_log('finance.commission_corrected', 'commission', $commissionId, [
                'fromGhs'      => $currentAmount,
                'toGhs'        => $newAmount,
                'reason'       => $reason,
                'adjustmentId' => $adjustmentId,
            ]);
        }

        finance_recompute_commission_status($commissionId, $actor);
    });

    $created = find_financial_adjustment($adjustmentId);
    if ($created === null) {
        error_response('The adjustment could not be read back.', 500);
    }
    return shape_financial_adjustment($created);
}


// ---------------------------------------------------------------------------
// Reconciliation reporting
// ---------------------------------------------------------------------------

/**
 * One place that states, separately and without double counting:
 * what agents collected, what Goodlucks is owed, what was reported, what was
 * confirmed, what is still outstanding, and what the commission workflow holds.
 */
function finance_reconciliation_summary(): array
{
    $feeRecords = list_viewing_fee_records(5000);
    $viewing = viewing_fee_summary($feeRecords);

    $submissions = list_remittance_submissions([], 5000);
    $reportedOpen = 0.0;
    $confirmed = 0.0;
    $allocated = 0.0;
    $rejected = 0;
    $disputed = 0;
    $unconfirmedCount = 0;
    foreach ($submissions as $submission) {
        if ($submission['status'] === 'submitted') {
            $reportedOpen += (float)$submission['amountGhs'];
            $unconfirmedCount++;
        } elseif ($submission['status'] === 'confirmed') {
            $confirmed += (float)($submission['confirmedGhs'] ?? 0);
            $allocated += (float)($submission['allocatedGhs'] ?? 0);
        } elseif ($submission['status'] === 'rejected') {
            $rejected++;
        } elseif ($submission['status'] === 'disputed') {
            $disputed++;
        }
    }

    $commissions = list_rental_commissions([], 5000);
    $commissionAgreed = 0.0;
    $commissionDue = 0.0;
    $commissionReceived = 0.0;
    $commissionOutstanding = 0.0;
    $commissionDisputed = 0;
    $commissionByStatus = [];
    foreach ($commissions as $commission) {
        $status = $commission['status'];
        $commissionByStatus[$status] = ($commissionByStatus[$status] ?? 0) + 1;
        if (in_array($status, ['agreed', 'due', 'partially_paid', 'paid'], true)) {
            $commissionAgreed += (float)($commission['amountGhs'] ?? 0);
        }
        if (in_array($status, ['due', 'partially_paid'], true)) {
            $commissionDue += (float)($commission['outstandingGhs'] ?? 0);
        }
        if ($status === 'disputed') {
            $commissionDisputed++;
        }
        $commissionReceived += (float)($commission['receivedGhs'] ?? 0);
        if ($status !== 'cancelled' && $status !== 'draft' && $status !== 'awaiting_agreement') {
            $commissionOutstanding += (float)($commission['outstandingGhs'] ?? 0);
        }
    }

    $adjustments = list_financial_adjustments([], 5000);
    $adjustmentTotal = 0.0;
    foreach ($adjustments as $adjustment) {
        $adjustmentTotal += (float)$adjustment['amountGhs'];
    }

    return [
        'currency' => 'GHS',
        'viewingFees' => [
            // Claimed by agents; not Goodlucks money.
            'collectedGhs'            => $viewing['viewingFeesCollectedGhs'],
            // Contractually owed under explicit agreements/policies.
            'entitledGhs'             => $viewing['goodlucksShareDueGhs'],
            // Confirmed receipts applied to obligations (Increment B ledger).
            'receivedGhs'             => $viewing['goodlucksShareReceivedGhs'],
            'outstandingGhs'          => $viewing['outstandingReceivablesGhs'],
            'recordsWithoutAgreedShare' => $viewing['recordsWithoutAgreedShare'],
            'disputedRecords'         => $viewing['disputedRecords'],
        ],
        'remittances' => [
            'reportedAwaitingConfirmationGhs' => round($reportedOpen, 2),
            'awaitingConfirmationCount'       => $unconfirmedCount,
            'confirmedReceivedGhs'            => round($confirmed, 2),
            'appliedToObligationsGhs'         => round($allocated, 2),
            // Money confirmed as received that is not yet attached to an
            // obligation. Counted once, here, and never as revenue twice.
            'unallocatedGhs'                  => round(max(0.0, $confirmed - $allocated), 2),
            'rejectedCount'                   => $rejected,
            'disputedCount'                   => $disputed,
        ],
        'rentalCommissions' => [
            'agreedGhs'      => round($commissionAgreed, 2),
            'dueGhs'         => round($commissionDue, 2),
            'receivedGhs'    => round($commissionReceived, 2),
            'outstandingGhs' => round($commissionOutstanding, 2),
            'disputedCount'  => $commissionDisputed,
            'byStatus'       => $commissionByStatus,
            'records'        => count($commissions),
        ],
        'adjustments' => [
            'count'    => count($adjustments),
            'netGhs'   => round($adjustmentTotal, 2),
            'recent'   => array_slice($adjustments, 0, 20),
        ],
        // Deliberately two separate revenue lines. Agent collections never
        // appear here, and nothing is summed into one "total made" figure.
        'confirmedRevenue' => [
            'viewingFeeRemittancesGhs' => $viewing['goodlucksShareReceivedGhs'],
            'rentalCommissionsGhs'     => round($commissionReceived, 2),
            'note'                     => 'Only confirmed receipts appear here. Reported collections and unconfirmed remittances are excluded by design.',
        ],
        'counts' => [
            'feeRecords'   => count($feeRecords),
            'submissions'  => count($submissions),
            'commissions'  => count($commissions),
        ],
    ];
}

/** Per-agent reconciliation for the admin drill-down. */
function finance_agent_summary(string $agentUserId): array
{
    $overview = agent_finance_overview($agentUserId);
    $user = find_user_by_id($agentUserId);
    $profile = find_agent_profile_by_user($agentUserId);

    return [
        'agentUserId' => $agentUserId,
        'name'        => (string)($user['name'] ?? ''),
        'email'       => (string)($user['email'] ?? ''),
        'accountStatus' => (string)($profile['account_status'] ?? 'unknown'),
        'totals'      => $overview['totals'],
        'recentSubmissions' => array_slice($overview['remittances'], 0, 10),
        'feeRecords'  => $overview['viewingFees'],
        'commissions' => $overview['commissions'],
    ];
}
