<?php
declare(strict_types=1);

/**
 * Increment G — HTTP handlers for remittances, reconciliation and rental
 * commissions.
 *
 * Permission model, enforced on every request (never in the client):
 *
 *   GET  finance reads        can_view_finance (or a legacy policy capability)
 *   POST money movements      can_confirm_remittances — strictly separate
 *   agent reads/submissions   own records only
 *
 * Agents can submit a claim and read their own position. They can never confirm
 * a receipt, never allocate money, never record a commission and never see
 * another agent's figures.
 */

// ---------------------------------------------------------------------------
// Agent endpoints
// ---------------------------------------------------------------------------

/** GET /api/agent/finance — the agent's own money position. */
function handle_agent_finance(): void
{
    $user = require_auth(['agent']);
    $agentUserId = finance_agent_scope($user);
    if ($agentUserId === '') {
        error_response('No agent account is associated with this session.', 403);
    }

    json_response([
        'success' => true,
        'finance' => agent_finance_overview($agentUserId),
    ]);
}

/** POST /api/agent/remittances — report money sent to Goodlucks (a claim). */
function handle_agent_submit_remittance(): void
{
    $user = require_auth(['agent']);
    $input = request_json();
    $submission = create_remittance_submission($input, $user);

    json_response([
        'success' => true,
        'remittance' => $submission,
        'message' => 'Remittance submitted. It counts as received only after Goodlucks finance confirms it.',
    ], 201);
}

/** GET /api/agent/remittances/{id} — own submission only. */
function handle_agent_remittance_show(array $params): void
{
    $user = require_auth(['agent']);
    $id = (string)($params[0] ?? '');
    $submission = find_remittance_submission($id);

    // Another agent's remittance is reported as not found so the endpoint never
    // reveals that it exists.
    if ($submission === null || (string)$submission['agent_user_id'] !== (string)($user['id'] ?? '')) {
        error_response('Remittance not found.', 404);
    }

    json_response(['success' => true, 'remittance' => shape_remittance_submission($submission)]);
}


// ---------------------------------------------------------------------------
// Admin reconciliation
// ---------------------------------------------------------------------------

function handle_admin_finance_summary(): void
{
    $user = require_finance_view();
    json_response([
        'success'      => true,
        'summary'      => finance_reconciliation_summary(),
        'policy'       => fee_policy_status(),
        'capabilities' => finance_ledger_capabilities($user),
    ]);
}

function handle_admin_finance_remittances(): void
{
    $user = require_finance_view();
    $filters = [];
    $status = clean_string(query_param('status', ''), 24);
    if ($status !== '') {
        if (!in_array($status, REMITTANCE_STATUSES, true)) {
            error_response('Unknown remittance status filter.', 422);
        }
        $filters['status'] = $status;
    }
    foreach (['agentUserId' => 'agentUserId', 'from' => 'from', 'to' => 'to'] as $key => $target) {
        $value = clean_string(query_param($key, ''), 32);
        if ($value !== '') {
            $filters[$target] = $value;
        }
    }

    json_response([
        'success'      => true,
        'remittances'  => list_remittance_submissions($filters),
        'capital'      => null,
        'capabilities' => finance_ledger_capabilities($user),
    ]);
}

function handle_admin_finance_remittance_show(array $params): void
{
    require_finance_view();
    $submission = find_remittance_submission((string)($params[0] ?? ''));
    if ($submission === null) {
        error_response('Remittance not found.', 404);
    }
    json_response(['success' => true, 'remittance' => shape_remittance_submission($submission)]);
}

/**
 * POST /api/admin/finance/remittances/{id}/confirm
 * Body: { allocations: [{viewingFeeRecordId, amountGhs}], note }
 *
 * The only route by which a claimed remittance becomes confirmed money. Without
 * the confirmation capability this is a 403 even for an administrator.
 */
function handle_admin_confirm_remittance(array $params): void
{
    $user = require_finance_confirm();
    $input = request_json();
    $allocations = isset($input['allocations']) && is_array($input['allocations']) ? $input['allocations'] : [];
    $note = clean_text($input['note'] ?? '', 1000);

    $submission = confirm_remittance((string)($params[0] ?? ''), $allocations, $user, $note);

    json_response([
        'success'    => true,
        'remittance' => $submission,
        'message'    => 'Receipt confirmed and recorded in the viewing-fee ledger.',
    ]);
}

/** POST /api/admin/finance/remittances/{id}/decision — reject or dispute. */
function handle_admin_decide_remittance(array $params): void
{
    $user = require_finance_confirm();
    $input = request_json();
    $submission = decide_remittance(
        (string)($params[0] ?? ''),
        (string)($input['status'] ?? ''),
        (string)($input['reason'] ?? ''),
        $user
    );
    json_response(['success' => true, 'remittance' => $submission]);
}

/** POST /api/admin/finance/receipts/{id}/reverse — linked reversal, never an edit. */
function handle_admin_reverse_receipt(array $params): void
{
    $user = require_finance_confirm();
    $input = request_json();

    $amount = valid_money($input['amountGhs'] ?? null, 0);
    if ($amount === null || $amount <= 0) {
        error_response('Enter the amount to reverse.', 422, ['amountGhs' => 'Enter an amount above zero.']);
    }
    $reason = clean_text($input['reason'] ?? '', 1000);
    if (trim($reason) === '') {
        error_response('Record why the receipt is being reversed.', 422, ['reason' => 'A reversal needs a reason.']);
    }

    $adjustment = reverse_viewing_fee_remittance(
        (string)($params[0] ?? ''),
        (float)$amount,
        $reason,
        clean_string($input['supportReference'] ?? '', 255),
        $user
    );

    json_response(['success' => true, 'adjustment' => $adjustment], 201);
}

function handle_admin_finance_agent(array $params): void
{
    require_finance_view();
    $agentId = (string)($params[0] ?? '');
    $user = find_user_by_id($agentId);
    if ($user === null || (string)($user['role'] ?? '') !== 'agent') {
        error_response('Agent not found.', 404);
    }
    json_response(['success' => true, 'agent' => finance_agent_summary($agentId)]);
}

function handle_admin_finance_adjustments(): void
{
    require_finance_view();
    $filters = [];
    foreach (['subjectType', 'subjectId'] as $key) {
        $value = clean_string(query_param($key, ''), 64);
        if ($value !== '') {
            $filters[$key] = $value;
        }
    }
    json_response(['success' => true, 'adjustments' => list_financial_adjustments($filters)]);
}


// ---------------------------------------------------------------------------
// Rental commissions
// ---------------------------------------------------------------------------

function handle_admin_commissions(): void
{
    $user = require_finance_view();
    $filters = [];
    foreach (['status', 'agentUserId', 'propertyId'] as $key) {
        $value = clean_string(query_param($key, ''), 64);
        if ($value !== '') {
            $filters[$key] = $value;
        }
    }
    if (isset($filters['status']) && !in_array($filters['status'], COMMISSION_STATUSES, true)) {
        error_response('Unknown commission status filter.', 422);
    }

    json_response([
        'success'      => true,
        'commissions'  => list_rental_commissions($filters),
        'statuses'     => COMMISSION_STATUSES,
        'capabilities' => finance_ledger_capabilities($user),
    ]);
}

function handle_admin_create_commission(): void
{
    $user = require_finance_confirm();
    $commission = create_rental_commission(request_json(), $user);
    json_response(['success' => true, 'commission' => $commission], 201);
}

function handle_admin_commission_show(array $params): void
{
    require_finance_view();
    $commission = find_rental_commission((string)($params[0] ?? ''));
    if ($commission === null) {
        error_response('Commission not found.', 404);
    }
    json_response(['success' => true, 'commission' => shape_rental_commission($commission)]);
}

function handle_admin_update_commission(array $params): void
{
    $user = require_finance_confirm();
    $commission = update_rental_commission((string)($params[0] ?? ''), request_json(), $user);
    json_response(['success' => true, 'commission' => $commission]);
}

function handle_admin_commission_status(array $params): void
{
    $user = require_finance_confirm();
    $input = request_json();
    $commission = set_commission_status(
        (string)($params[0] ?? ''),
        (string)($input['status'] ?? ''),
        $user,
        (string)($input['reason'] ?? ($input['note'] ?? ''))
    );
    json_response(['success' => true, 'commission' => $commission]);
}

function handle_admin_commission_payment(array $params): void
{
    $user = require_finance_confirm();
    $commission = add_commission_payment((string)($params[0] ?? ''), request_json(), $user);
    json_response(['success' => true, 'commission' => $commission], 201);
}

function handle_admin_commission_adjust(array $params): void
{
    $user = require_finance_confirm();
    $input = request_json();

    $kind = clean_string($input['kind'] ?? '', 24);
    if (!in_array($kind, ['reversal', 'correction'], true)) {
        error_response('Choose reversal or correction.', 422, ['kind' => 'An adjustment is a reversal or correction.']);
    }
    $amount = valid_money($input['amountGhs'] ?? null, 0);
    if ($amount === null || abs((float)$amount) < 0.005) {
        error_response('Enter the adjustment amount.', 422, ['amountGhs' => 'Enter a non-zero amount.']);
    }
    $reason = clean_text($input['reason'] ?? '', 1000);
    if (trim($reason) === '') {
        error_response('Record why the commission is being adjusted.', 422, ['reason' => 'An adjustment needs a reason.']);
    }

    $adjustment = adjust_rental_commission(
        (string)($params[0] ?? ''),
        $kind,
        (float)$amount,
        $reason,
        clean_string($input['supportReference'] ?? '', 255),
        $user
    );

    json_response(['success' => true, 'adjustment' => $adjustment], 201);
}

// ===========================================================================
// Landlord money (Task 03 update)
// ===========================================================================
/**
 * Landlord platform fees (8% of rent actually paid) and the landlord viewing-fee
 * payments, kept apart from the agent ledger and the agent commissions.
 *
 * Reading needs `can_view_finance`; recording money needs the confirm
 * capability, exactly like every other financial write.
 */
function handle_admin_landlord_platform_fees(): void
{
    require_finance_view();
    json_response([
        'success'  => true,
        'fees'     => list_landlord_platform_fees(200),
        'summary'  => landlord_platform_fee_summary(),
        'policy'   => landlord_policy_summary()['platformFee'],
    ]);
}

function handle_admin_create_landlord_platform_fee(): void
{
    $user = require_finance_confirm();
    $fee = create_landlord_platform_fee(request_json(), $user);
    json_response([
        'success' => true,
        'fee'     => $fee,
        'message' => 'Platform fee recorded: ' . number_format((float)($fee['platformFeePercent'] ?? 0), 2)
            . '% of the rent paid, payable to Goodlucks Homes. The landlord receives no commission.',
    ], 201);
}

function handle_admin_landlord_viewing_fees(): void
{
    require_finance_view();
    json_response([
        'success' => true,
        'records' => list_landlord_viewing_fees(200),
        'summary' => landlord_viewing_fee_payment_summary(),
        'policy'  => landlord_policy_summary()['viewingFee'],
    ]);
}

function handle_admin_record_landlord_viewing_fee(): void
{
    $user = require_finance_confirm();
    $record = record_landlord_viewing_fee_payment(request_json(), $user);
    json_response([
        'success' => true,
        'record'  => $record,
        'message' => 'Landlord viewing fee recorded as received by Goodlucks Homes.',
    ], 201);
}

