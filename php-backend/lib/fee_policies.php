<?php
/**
 * Goodlucks Homes — agent tiers, fee policies and transaction snapshots
 * (Increment E).
 *
 * Three ideas live here, deliberately kept apart:
 *
 *  1. AGENT TIER — a *derived* classification, computed from the Increment D
 *     verification records. Nothing is stored, so a tier can never drift out of
 *     step with the identity/authorisation records it depends on, and an agent
 *     cannot write it (there is no endpoint that assigns a tier).
 *
 *  2. FEE POLICY — an administrative, versioned agreement about how a fee
 *     category is shared between the agent and Goodlucks. Creating one is not
 *     approving it; approving it is not activating it. The proposed 60/40 and
 *     70/30 splits are NOT policies: they live only as PROPOSED_* constants in
 *     config.php, are never read here, and no policy row ships with the code.
 *
 *  3. TRANSACTION SNAPSHOT — the frozen financial terms of one transaction.
 *     Append-only: written once when a policy is explicitly applied, never
 *     updated, never deleted, and carries a hash so later tampering is visible.
 *     A snapshot keeps its own copy of every figure, so editing, expiring or
 *     deactivating the policy (or the agent changing tier) cannot rewrite it.
 *
 * Financial rules restated (Increment B, unchanged):
 *   * money an agent collected is NOT Goodlucks revenue;
 *   * a share owed is NOT money received;
 *   * only a recorded remittance counts as Goodlucks revenue.
 * Nothing in this file creates a remittance, marks money received or invents a
 * payment. Remittance processing stays in Increment G.
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Vocabulary (single source of truth — no scattered string literals)
// ---------------------------------------------------------------------------

/** Agent tiers. `professional` is the higher tier; both are labels, not permissions. */
const AGENT_TIERS = [
    'standard'     => 'Standard agent',
    'professional' => 'Professionally authorised agent',
];

/**
 * Task 03: the share of an agreed commission that belongs to the agent.
 *
 * These percentages are a share OF THE COMMISSION ALREADY AGREED for the
 * transaction — they are not the platform's total commission rate, and nothing
 * here invents one. The remainder of the commission is Goodlucks' share.
 *
 *   Tier A (Basic)       Ghana Card identity approved ............ 60%
 *   Higher tier          identity + professional approved ....... 70%
 *
 * An agent without an approved identity verification has no entitlement yet
 * (0%), so no share is ever created from an unverified claim.
 *
 * A VIEWING FEE IS NOT A COMMISSION: no tier percentage is ever applied to a
 * viewing fee.
 */
const AGENT_TIER_COMMISSION = [
    'standard' => [
        'tierCode'    => 'tier_a',
        'shortLabel'  => 'Tier A — Basic',
        'percent'     => 60.0,
        'requires'    => 'an approved Ghana Card identity verification',
        'description' => 'Identity verified. The agent receives 60% of the agreed commission; Goodlucks receives the remaining 40%.',
    ],
    'professional' => [
        'tierCode'    => 'higher',
        'shortLabel'  => 'Higher tier',
        'percent'     => 70.0,
        'requires'    => 'an approved identity verification AND at least one approved professional authorisation',
        'description' => 'Identity and professional authorisation both approved. The agent receives 70% of the agreed commission; Goodlucks receives the remaining 30%.',
    ],
];

/** The share that applies when no tier has been earned yet. */
const AGENT_NO_TIER_PERCENT = 0.0;

/**
 * What each tier requires. Read by `agent_tier_state()` only.
 *
 * `requires` checks the *effective* verification status (so a licence that has
 * passed its expiry date does not count), and `excludes` lists statuses that
 * disqualify the tier outright. Keeping the rules here means a future tier
 * change is a one-line data edit, not a hunt through if-statements.
 */
const AGENT_TIER_RULES = [
    'standard' => [
        'label'       => 'Standard agent',
        'requires'    => [],
        'excludes'    => [],
        'description' => 'A registered agent account (and any identity check that has been completed) without an approved professional authorisation.',
    ],
    'professional' => [
        'label'    => 'Professionally authorised agent',
        'requires' => [
            'identity'     => 'approved',
            'professional' => 'approved',
        ],
        'excludes' => ['expired', 'rejected', 'resubmission_required', 'pending_review', 'under_review', 'not_submitted'],
        'description' => 'Identity approved AND a current professional authorisation approved by a reviewer. Never inferred from registration or from uploading a document.',
    ],
];

/** Fee categories a policy may cover. */
const FEE_POLICY_CATEGORIES = [
    'viewing_fee'       => 'Physical viewing fee',
    'rental_commission' => 'Rental commission',
    'other_service_fee' => 'Other service fee',
];

/**
 * Policy lifecycle.
 *
 *   draft ──submit──▶ pending_approval ──approve──▶ approved ──activate──▶ active
 *                          │                          │                    │
 *                          └────reject──▶ rejected   │                    └─deactivate─▶ deactivated
 *                                                     └─(stays approved until a date qualifies)
 *
 * `expired` is derived (an `active` policy whose end date has passed) and is
 * never written to the row, so the recorded decisions stay exactly as made.
 */
const FEE_POLICY_STATUSES = ['draft', 'pending_approval', 'approved', 'active', 'rejected', 'deactivated'];

/** Statuses that may never price a transaction. */
const FEE_POLICY_NON_APPLICABLE_STATUSES = ['draft', 'pending_approval', 'rejected', 'deactivated'];

const FEE_POLICY_CALCULATION_METHODS = ['percentage' => 'Percentage of the fee', 'fixed' => 'Fixed amounts'];

/** Only cedi accounting exists in this release. */
const FEE_POLICY_CURRENCY = 'GHS';

// ---------------------------------------------------------------------------
// Capabilities (least privilege; granted only from the server console)
// ---------------------------------------------------------------------------

function is_fee_policy_manager(?array $user = null): bool
{
    $user = $user ?? auth_user();
    // Upgrade 2: the primary platform administrator holds every staff
    // capability without needing a separate grant. No other administrator is
    // affected: their stored flag is still the only thing that counts.
    if (is_primary_admin($user)) {
        return true;
    }
    return $user !== null
        && (string)($user['role'] ?? '') === 'admin'
        && (int)($user['can_manage_fee_policies'] ?? 0) === 1;
}

function is_fee_policy_approver(?array $user = null): bool
{
    $user = $user ?? auth_user();
    if (is_primary_admin($user)) {
        return true;
    }
    return $user !== null
        && (string)($user['role'] ?? '') === 'admin'
        && (int)($user['can_approve_fee_policies'] ?? 0) === 1;
}

/**
 * True only for the primary administrator (Upgrade 2).
 *
 * Approving your own policy is a separation-of-duties exception, so it is
 * granted to exactly one named account rather than to "administrators" as a
 * class. Everything that depends on it (the approval guard, the capability hint
 * in the console) reads this function, so the rule cannot drift.
 */
function is_fee_policy_self_approver(?array $user = null): bool
{
    return is_primary_admin($user);
}

function require_fee_policy_manager(): array
{
    $user = require_auth(['admin']);
    if (!is_fee_policy_manager($user)) {
        error_response(
            'Creating or editing fee policies requires the fee-policy manager capability. Ask a server administrator to grant it.',
            403
        );
    }
    return $user;
}

function require_fee_policy_approver(): array
{
    $user = require_auth(['admin']);
    if (!is_fee_policy_approver($user)) {
        error_response(
            'Approving, activating or deactivating fee policies requires the fee-policy approver capability.',
            403
        );
    }
    return $user;
}

/** Anyone with either financial capability may read policies and tiers. */
function require_fee_policy_staff(): array
{
    $user = require_auth(['admin']);
    if (!is_fee_policy_manager($user) && !is_fee_policy_approver($user)) {
        error_response(
            'Reading fee policies requires a fee-policy capability. Ask a server administrator to grant one.',
            403
        );
    }
    return $user;
}

/** Financial capabilities as exposed to the signed-in staff member (their own only). */
function finance_capabilities(array $user): array
{
    return [
        'feePolicyManage'  => is_fee_policy_manager($user),
        'feePolicyApprove' => is_fee_policy_approver($user),
        // Increment G: reading money records vs moving money. Distinct flags;
        // neither is implied by ordinary administration.
        'financeView'      => function_exists('finance_can_view') && finance_can_view($user),
        'financeConfirm'   => function_exists('finance_can_confirm') && finance_can_confirm($user),
        // Upgrade 2: true for the primary administrator only. It says that this
        // account may approve a policy it created itself; every other
        // administrator still needs a different administrator to approve.
        'feePolicySelfApprove' => is_fee_policy_self_approver($user),
    ];
}

function set_finance_capabilities(string $userId, bool $manage, bool $approve): void
{
    db_exec(
        'UPDATE users SET can_manage_fee_policies = :manage, can_approve_fee_policies = :approve,
                          updated_at = :updated
          WHERE id = :id AND role = :role',
        [
            ':manage'  => $manage ? 1 : 0,
            ':approve' => $approve ? 1 : 0,
            ':updated' => db_now(),
            ':id'      => $userId,
            ':role'    => 'admin',
        ]
    );
}

// ---------------------------------------------------------------------------
// Agent tiers (derived — never stored, never client-supplied)
// ---------------------------------------------------------------------------

/**
 * The full eligibility picture for one agent.
 *
 * Every input comes from the verification tables; nothing here reads a request
 * body. `tier` is the highest tier the agent currently qualifies for, and
 * `eligibleProfessional` is the single boolean a future transaction would use.
 */
function agent_tier_state(string $userId): array
{
    $identityRow = find_identity_verification($userId);
    $professionalRow = find_professional_authorisation($userId);

    $identityStatus = $identityRow ? (string)$identityRow['status'] : 'not_submitted';
    $professionalStored = $professionalRow ? (string)$professionalRow['status'] : 'not_submitted';
    $professionalEffective = $professionalRow ? effective_professional_status($professionalRow) : 'not_submitted';

    $input = [
        'identity'     => $identityStatus,
        'professional' => $professionalEffective,
    ];

    $rules = AGENT_TIER_RULES['professional'];
    $eligibleProfessional = true;
    foreach ($rules['requires'] as $field => $required) {
        if (($input[$field] ?? '') !== $required) {
            $eligibleProfessional = false;
        }
    }
    if (in_array($professionalEffective, $rules['excludes'], true)) {
        $eligibleProfessional = false;
    }

    // A registered agent account always qualifies for `standard`; the tier is a
    // label describing verification, not a permission.
    $eligibleStandard = true;
    $tier = $eligibleProfessional ? 'professional' : 'standard';

    // Task 03: the tier only earns a commission share once the identity check
    // is approved. `tier` stays the same label it always was (it describes
    // account standing); `commissionTier` is what money is derived from.
    $identityApproved = $identityStatus === 'approved';
    if ($tier === 'professional') {
        $commissionKey = 'professional';
    } elseif ($identityApproved) {
        $commissionKey = 'standard';
    } else {
        $commissionKey = null;
    }
    $commission = $commissionKey !== null ? AGENT_TIER_COMMISSION[$commissionKey] : null;
    $commissionPercent = $commission !== null ? (float)$commission['percent'] : AGENT_NO_TIER_PERCENT;

    return [
        'userId'                => $userId,
        'tier'                  => $tier,
        'tierLabel'             => AGENT_TIERS[$tier],
        'eligibleStandard'      => $eligibleStandard,
        'eligibleProfessional'  => $eligibleProfessional,
        // Task 03 commission tier, derived from the verified records above.
        'commissionTier'        => $commission['tierCode'] ?? 'none',
        'commissionTierLabel'   => $commission['shortLabel'] ?? 'No commission tier yet',
        'commissionPercent'     => $commissionPercent,
        'goodlucksPercent'      => $commission !== null ? round(100 - $commissionPercent, 2) : 100.0,
        'commissionEligible'    => $commission !== null,
        'commissionBasis'       => $commission !== null
            ? $commission['description']
            : 'No commission share applies until a Ghana Card identity verification has been approved.',
        'higherTierPercent'     => (float)AGENT_TIER_COMMISSION['professional']['percent'],
        'higherTierRequires'    => AGENT_TIER_COMMISSION['professional']['requires'],
        'basicTierPercent'      => (float)AGENT_TIER_COMMISSION['standard']['percent'],
        'basicTierRequires'     => AGENT_TIER_COMMISSION['standard']['requires'],
        'identityStatus'        => $identityStatus,
        'identityApproved'      => $identityApproved,
        'professionalStoredStatus' => $professionalStored,
        'professionalStatus'    => $professionalEffective,
        'professionalSubmitted' => in_array($professionalStored, ['pending_review', 'under_review', 'approved', 'rejected', 'resubmission_required'], true),
        'professionalApproved'  => $professionalEffective === 'approved',
        'professionalExpired'   => $professionalEffective === 'expired',
        'professionalRejected'  => $professionalEffective === 'rejected',
        'rules'                 => array_keys($rules['requires']),
        'note'                  => $eligibleProfessional
            ? 'Identity and professional authorisation are both approved and current.'
            : 'Professional authorisation is not approved and current, so this agent is a Standard agent for future transactions.',
    ];
}

/** Short label for listings that only need the tier name. */
function agent_tier_label(string $userId): string
{
    return AGENT_TIERS[agent_tier_state($userId)['tier']];
}

/**
 * Task 03: split an agreed commission between the agent and Goodlucks.
 *
 * The tier is read from the agent's verified records here — never from a
 * request — and the percentage comes from AGENT_TIER_COMMISSION. The amount
 * passed in is the commission that has already been agreed for the
 * transaction; these percentages do not set that amount.
 *
 * @return array{tier: string, tierLabel: string, agentPercent: float,
 *               goodlucksPercent: float, agentShareGhs: float,
 *               goodlucksShareGhs: float, eligible: bool, note: string}
 */
function agent_commission_split(string $agentUserId, float $commissionAmount): array
{
    $state = agent_tier_state($agentUserId);
    $agentPercent = (float)$state['commissionPercent'];
    $goodlucksPercent = round(100.0 - $agentPercent, 2);
    $total = round($commissionAmount, 2);
    $agentShare = round($total * $agentPercent / 100, 2);
    $goodlucksShare = round($total - $agentShare, 2);

    return [
        'tier'              => (string)$state['tier'],
        'tierCode'          => (string)$state['commissionTier'],
        'tierLabel'         => (string)$state['commissionTierLabel'],
        'agentPercent'      => $agentPercent,
        'goodlucksPercent'  => $goodlucksPercent,
        'commissionAmountGhs' => $total,
        'agentShareGhs'     => $agentShare,
        'goodlucksShareGhs' => $goodlucksShare,
        'eligible'          => (bool)$state['commissionEligible'],
        'identityStatus'    => (string)$state['identityStatus'],
        'professionalStatus'=> (string)$state['professionalStatus'],
        'note'              => (string)$state['commissionBasis'],
    ];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Normalise a stored policy status. Legacy rows (Increment B shipped the table
 * with a `proposed` default) are read as drafts: a legacy row can never be
 * active, and it is never rewritten by a migration.
 */
function fee_policy_normalise_status(?string $status): string
{
    $status = (string)$status;
    if (in_array($status, ['proposed', 'provisional', ''], true)) {
        return 'draft';
    }
    return in_array($status, FEE_POLICY_STATUSES, true) || $status === 'expired' ? $status : 'draft';
}

/** Derived status: an active policy whose end date has passed reads `expired`. */
function effective_fee_policy_status(?array $row): string
{
    $status = fee_policy_normalise_status((string)($row['status'] ?? ''));
    if ($status === 'active') {
        $to = (string)($row['effective_to'] ?? '');
        if ($to !== '' && $to < gmdate('Y-m-d')) {
            return 'expired';
        }
    }
    return $status;
}

/**
 * Validate a policy payload.
 *
 * @return array{0: array<string,mixed>, 1: array<string,string>} [clean data, field errors]
 */
function validate_fee_policy_input(array $input, ?array $existing = null): array
{
    $errors = [];
    $data = [];

    $name = clean_string($input['name'] ?? '', 160);
    if (strlen($name) < 3) {
        $errors['name'] = 'Give the policy a name of at least 3 characters.';
    }
    $data['name'] = $name;

    $data['description'] = clean_string($input['description'] ?? '', 1000);

    $category = (string)($input['category'] ?? '');
    if (!isset(FEE_POLICY_CATEGORIES[$category])) {
        $errors['category'] = 'Choose a fee category from the list.';
    }
    $data['category'] = $category;

    $tier = (string)($input['agentTier'] ?? '');
    if (!isset(AGENT_TIERS[$tier])) {
        $errors['agentTier'] = 'Choose an agent tier from the list.';
    }
    $data['agent_tier'] = $tier;

    $method = (string)($input['calculationMethod'] ?? 'percentage');
    if (!isset(FEE_POLICY_CALCULATION_METHODS[$method])) {
        $errors['calculationMethod'] = 'Choose a calculation method.';
    }
    $data['calculation_method'] = $method;

    $currency = strtoupper(clean_string($input['currency'] ?? FEE_POLICY_CURRENCY, 8));
    if ($currency !== FEE_POLICY_CURRENCY) {
        $errors['currency'] = 'Only GHS policies are supported.';
    }
    $data['currency'] = $currency;

    $agentPercent = 0.0;
    $goodlucksPercent = 0.0;
    $agentFixed = null;
    $goodlucksFixed = null;

    if ($method === 'percentage') {
        $agentRaw = $input['agentSharePercent'] ?? null;
        $goodlucksRaw = $input['goodlucksSharePercent'] ?? null;
        $agentPercent = is_numeric($agentRaw) ? (float)$agentRaw : NAN;
        $goodlucksPercent = is_numeric($goodlucksRaw) ? (float)$goodlucksRaw : NAN;

        if (!is_finite($agentPercent)) {
            $errors['agentSharePercent'] = 'Enter the agent share as a percentage.';
        } elseif ($agentPercent < 0 || $agentPercent > 100) {
            $errors['agentSharePercent'] = 'The agent share must be between 0% and 100%.';
        }

        if (!is_finite($goodlucksPercent)) {
            $errors['goodlucksSharePercent'] = 'Enter the Goodlucks share as a percentage.';
        } elseif ($goodlucksPercent < 0 || $goodlucksPercent > 100) {
            $errors['goodlucksSharePercent'] = 'The Goodlucks share must be between 0% and 100%.';
        }

        if (is_finite($agentPercent) && is_finite($goodlucksPercent)
            && !isset($errors['agentSharePercent'], $errors['goodlucksSharePercent'])) {
            $sum = round($agentPercent + $goodlucksPercent, 4);
            if (abs($sum - 100.0) > 0.005) {
                $errors['agentSharePercent'] = 'The agent and Goodlucks shares must add up to exactly 100% (they add up to ' . rtrim(rtrim(number_format($sum, 2, '.', ''), '0'), '.') . '%).';
            }
        }

        // Percentage policies carry no fixed amounts.
        $agentFixed = null;
        $goodlucksFixed = null;
    } else {
        $agentRaw = $input['agentShareFixedGhs'] ?? null;
        $goodlucksRaw = $input['goodlucksShareFixedGhs'] ?? null;
        $agentFixed = is_numeric($agentRaw) ? round((float)$agentRaw, 2) : null;
        $goodlucksFixed = is_numeric($goodlucksRaw) ? round((float)$goodlucksRaw, 2) : null;

        if ($agentFixed === null || $agentFixed < 0) {
            $errors['agentShareFixedGhs'] = 'Enter the agent entitlement in cedis (0 or more).';
        }
        if ($goodlucksFixed === null || $goodlucksFixed < 0) {
            $errors['goodlucksShareFixedGhs'] = 'Enter the Goodlucks entitlement in cedis (0 or more).';
        }
        if (!isset($errors['agentShareFixedGhs'], $errors['goodlucksShareFixedGhs'])
            && $agentFixed + $goodlucksFixed <= 0) {
            $errors['goodlucksShareFixedGhs'] = 'A fixed-amount policy must be worth more than zero.';
        }

        $agentPercent = 0.0;
        $goodlucksPercent = 0.0;
    }

    $data['agent_share_percent'] = round($agentPercent, 2);
    $data['goodlucks_share_percent'] = round($goodlucksPercent, 2);
    $data['agent_share_fixed_ghs'] = $agentFixed;
    $data['goodlucks_share_fixed_ghs'] = $goodlucksFixed;

    $effectiveFrom = valid_date_iso($input['effectiveFrom'] ?? null);
    if ($effectiveFrom === null) {
        $errors['effectiveFrom'] = 'Enter the date this policy starts.';
    }
    $data['effective_from'] = $effectiveFrom;

    $effectiveTo = null;
    if (($input['effectiveTo'] ?? '') !== '' && $input['effectiveTo'] !== null) {
        $effectiveTo = valid_date_iso($input['effectiveTo']);
        if ($effectiveTo === null) {
            $errors['effectiveTo'] = 'Enter a valid end date, or leave it empty for no end date.';
        } elseif ($effectiveFrom !== null && $effectiveTo < $effectiveFrom) {
            $errors['effectiveTo'] = 'The end date cannot be before the start date.';
        }
    }
    $data['effective_to'] = $effectiveTo;

    $data['notes'] = clean_string($input['notes'] ?? '', 1000);

    return [$data, $errors];
}

// ---------------------------------------------------------------------------
// Reading policies
// ---------------------------------------------------------------------------

function find_fee_policy(string $id): ?array
{
    if ($id === '') {
        return null;
    }
    return db_one('SELECT * FROM fee_policies WHERE id = :id LIMIT 1', [':id' => $id]);
}

/** Does this policy's date window cover the given date? */
function fee_policy_covers_date(array $row, string $date): bool
{
    $from = (string)($row['effective_from'] ?? '');
    $to = (string)($row['effective_to'] ?? '');
    if ($from !== '' && $date < $from) {
        return false;
    }
    if ($to !== '' && $date > $to) {
        return false;
    }
    return true;
}

/**
 * The policy that would price a transaction of this category for this tier on
 * this date — or null, which is the honest answer when none applies.
 *
 * Requires status `active` AND being inside the window AND approval evidence
 * (`approved_by` + `approved_at`). A legacy `proposed` row never qualifies.
 */
function find_applicable_fee_policy(string $tier, string $category, string $date): ?array
{
    if (!isset(AGENT_TIERS[$tier]) || !isset(FEE_POLICY_CATEGORIES[$category])) {
        return null;
    }
    $rows = db_all(
        "SELECT * FROM fee_policies
          WHERE status = 'active' AND tier = :tier AND category = :category
          ORDER BY effective_from DESC, approved_at DESC, created_at DESC",
        [':tier' => $tier, ':category' => $category]
    );

    foreach ($rows as $row) {
        if (effective_fee_policy_status($row) !== 'active') {
            continue;
        }
        if (empty($row['approved_by']) || empty($row['approved_at'])) {
            continue; // approval evidence missing: never applicable
        }
        if (!fee_policy_covers_date($row, $date)) {
            continue;
        }
        return $row;
    }

    return null;
}

/** Why no policy applies — a sentence a human can act on. */
function fee_policy_non_applicability_reason(string $tier, string $category, string $date): string
{
    $rows = db_all(
        'SELECT * FROM fee_policies WHERE tier = :tier AND category = :category',
        [':tier' => $tier, ':category' => $category]
    );
    if (!$rows) {
        return 'No fee policy exists for ' . AGENT_TIERS[$tier] . ' / ' . FEE_POLICY_CATEGORIES[$category] . '. No share is recorded.';
    }
    foreach ($rows as $row) {
        $status = effective_fee_policy_status($row);
        if (in_array($status, ['active', 'approved'], true) && !fee_policy_covers_date($row, $date)) {
            return 'A policy exists but was not in effect on ' . $date . '. No share is recorded.';
        }
    }
    return 'No approved, active fee policy covers ' . AGENT_TIERS[$tier] . ' / ' . FEE_POLICY_CATEGORIES[$category] . ' on ' . $date . '. No share is recorded.';
}

/** Public shape of a policy row. */
function shape_fee_policy(array $row): array
{
    $status = effective_fee_policy_status($row);
    $method = (string)($row['calculation_method'] ?? 'percentage');
    $agentPercent = (float)($row['agent_share_percent'] ?? 0);
    $goodlucksPercent = (float)($row['goodlucks_share_percent'] ?? 0);
    $agentFixed = $row['agent_share_fixed_ghs'] === null ? null : round((float)$row['agent_share_fixed_ghs'], 2);
    $goodlucksFixed = $row['goodlucks_share_fixed_ghs'] === null ? null : round((float)$row['goodlucks_share_fixed_ghs'], 2);

    return [
        'id'          => (string)$row['id'],
        'name'        => (string)($row['name'] ?? '') !== '' ? (string)$row['name'] : 'Untitled policy ' . (string)$row['id'],
        'description' => (string)($row['description'] ?? ''),
        'agentTier'   => (string)$row['tier'],
        'agentTierLabel' => AGENT_TIERS[(string)$row['tier']] ?? 'Unknown tier',
        'category'    => (string)$row['category'],
        'categoryLabel' => FEE_POLICY_CATEGORIES[(string)$row['category']] ?? 'Unknown category',
        'calculationMethod' => $method,
        'calculationMethodLabel' => FEE_POLICY_CALCULATION_METHODS[$method] ?? $method,
        'currency'    => (string)($row['currency'] ?? FEE_POLICY_CURRENCY),
        'agentSharePercent' => $agentPercent,
        'goodlucksSharePercent' => $goodlucksPercent,
        'agentShareFixedGhs' => $agentFixed,
        'goodlucksShareFixedGhs' => $goodlucksFixed,
        'totalFixedGhs' => $method === 'fixed' && $agentFixed !== null && $goodlucksFixed !== null
            ? round($agentFixed + $goodlucksFixed, 2)
            : null,
        // Stored status and derived status are both exposed so an expired policy
        // is visible without pretending the approval never happened.
        'status'      => $status,
        'storedStatus'=> fee_policy_normalise_status((string)($row['status'] ?? '')),
        'expired'     => $status === 'expired',
        'statusLabel' => ucfirst(str_replace('_', ' ', $status)),
        'version'     => (int)($row['version'] ?? 1),
        'effectiveFrom' => (string)($row['effective_from'] ?? ''),
        'effectiveTo'   => (string)($row['effective_to'] ?? ''),
        'createdBy'   => (string)($row['created_by'] ?? ''),
        'createdAt'   => to_iso($row['created_at'] ?? null),
        'updatedAt'   => to_iso($row['updated_at'] ?? null),
        'submittedBy' => (string)($row['submitted_by'] ?? ''),
        'submittedAt' => to_iso($row['submitted_at'] ?? null),
        'approvedBy'  => (string)($row['approved_by'] ?? ''),
        'approvedAt'  => to_iso($row['approved_at'] ?? null),
        // Upgrade 2: true only where the primary administrator approved its own
        // policy. Shaped as a fact, not as a permission.
        'selfApproved'   => (int)($row['self_approved'] ?? 0) === 1,
        'selfApprovedAt' => to_iso($row['self_approved_at'] ?? null),
        'rejectedBy'  => (string)($row['rejected_by'] ?? ''),
        'rejectedAt'  => to_iso($row['rejected_at'] ?? null),
        'rejectionReason' => (string)($row['rejection_reason'] ?? ''),
        'activatedBy' => (string)($row['activated_by'] ?? ''),
        'activatedAt' => to_iso($row['activated_at'] ?? null),
        'deactivatedBy' => (string)($row['deactivated_by'] ?? ''),
        'deactivatedAt' => to_iso($row['deactivated_at'] ?? null),
        'deactivationReason' => (string)($row['deactivation_reason'] ?? ''),
        'notes'       => (string)($row['notes'] ?? ''),
        'supersedesPolicyId' => (string)($row['supersedes_policy_id'] ?? ''),
        // Never true for a policy that has not been through approval.
        'approved'    => !empty($row['approved_by']) && !empty($row['approved_at']),
        'applicable'  => $status === 'active' && !empty($row['approved_by']) && !empty($row['approved_at']),
    ];
}

function list_fee_policies(array $filters = [], int $limit = 200): array
{
    $sql = 'SELECT * FROM fee_policies WHERE 1 = 1';
    $params = [];

    if (!empty($filters['status'])) {
        $status = (string)$filters['status'];
        if (in_array($status, FEE_POLICY_STATUSES, true)) {
            $sql .= ' AND status = :status';
            $params[':status'] = $status;
        }
    }
    if (!empty($filters['category']) && isset(FEE_POLICY_CATEGORIES[(string)$filters['category']])) {
        $sql .= ' AND category = :category';
        $params[':category'] = (string)$filters['category'];
    }
    if (!empty($filters['agentTier']) && isset(AGENT_TIERS[(string)$filters['agentTier']])) {
        $sql .= ' AND tier = :tier';
        $params[':tier'] = (string)$filters['agentTier'];
    }

    $sql .= ' ORDER BY created_at DESC, id DESC' . db_limit_clause($limit, 0);

    return array_map('shape_fee_policy', db_all($sql, $params));
}

// ---------------------------------------------------------------------------
// Policy history (append-only)
// ---------------------------------------------------------------------------

function record_fee_policy_event(array $policy, string $action, ?array $actor, string $note = '', ?string $fromStatus = null, ?string $toStatus = null): void
{
    db_exec(
        'INSERT INTO fee_policy_events (id, policy_id, action, from_status, to_status, note,
                                        actor_id, actor_name, created_at)
         VALUES (:id, :policy_id, :action, :from_status, :to_status, :note,
                 :actor_id, :actor_name, :created_at)',
        [
            ':id'          => new_id('fpe'),
            ':policy_id'   => (string)$policy['id'],
            ':action'      => $action,
            ':from_status' => $fromStatus ?? fee_policy_normalise_status((string)($policy['status'] ?? '')),
            ':to_status'   => $toStatus ?? fee_policy_normalise_status((string)($policy['status'] ?? '')),
            ':note'        => clean_string($note, 1000),
            ':actor_id'    => (string)($actor['id'] ?? ''),
            ':actor_name'  => clean_string($actor['name'] ?? 'system', 200),
            ':created_at'  => db_now_precise(),
        ]
    );
}

function list_fee_policy_events(string $policyId, int $limit = 100): array
{
    $rows = db_all(
        'SELECT * FROM fee_policy_events WHERE policy_id = :pid ORDER BY created_at ASC, id ASC' . db_limit_clause($limit, 0),
        [':pid' => $policyId]
    );

    return array_map(static fn(array $row): array => [
        'id'        => (string)$row['id'],
        'action'    => (string)$row['action'],
        'fromStatus'=> fee_policy_normalise_status((string)($row['from_status'] ?? '')),
        'toStatus'  => fee_policy_normalise_status((string)($row['to_status'] ?? '')),
        'note'      => (string)($row['note'] ?? ''),
        'actorId'   => (string)($row['actor_id'] ?? ''),
        'actorName' => (string)($row['actor_name'] ?? ''),
        'at'        => to_iso($row['created_at'] ?? null),
    ], $rows);
}

// ---------------------------------------------------------------------------
// Policy lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a DRAFT policy. Nothing is approved or applied by creating one.
 *
 * @throws InvalidArgumentException with a `fields` payload attached by the caller
 */
function create_fee_policy(array $input, array $actor): array
{
    [$data, $errors] = validate_fee_policy_input($input);
    if ($errors) {
        throw new FeePolicyValidationException($errors);
    }

    $id = new_id('fp');
    $now = db_now();

    db_exec(
        'INSERT INTO fee_policies (id, name, description, tier, category, calculation_method,
                                   currency, agent_share_percent, goodlucks_share_percent,
                                   agent_share_fixed_ghs, goodlucks_share_fixed_ghs,
                                   status, version, effective_from, effective_to,
                                   created_by, created_at, notes)
         VALUES (:id, :name, :description, :tier, :category, :method,
                 :currency, :agent_pct, :goodlucks_pct,
                 :agent_fixed, :goodlucks_fixed,
                 :status, 1, :effective_from, :effective_to,
                 :created_by, :created_at, :notes)',
        [
            ':id'            => $id,
            ':name'          => $data['name'],
            ':description'   => $data['description'],
            ':tier'          => $data['agent_tier'],
            ':category'      => $data['category'],
            ':method'        => $data['calculation_method'],
            ':currency'      => $data['currency'],
            ':agent_pct'     => $data['agent_share_percent'],
            ':goodlucks_pct' => $data['goodlucks_share_percent'],
            ':agent_fixed'   => $data['agent_share_fixed_ghs'],
            ':goodlucks_fixed' => $data['goodlucks_share_fixed_ghs'],
            ':status'        => 'draft',
            ':effective_from' => $data['effective_from'],
            ':effective_to'  => $data['effective_to'],
            ':created_by'    => (string)$actor['id'],
            ':created_at'    => $now,
            ':notes'         => $data['notes'],
        ]
    );

    $policy = find_fee_policy($id) ?? [];
    record_fee_policy_event($policy, 'created', $actor, 'Draft created. Not approved, not applied.', 'draft', 'draft');

    return $policy;
}

/** Edit a DRAFT policy. Approved/active rows are immutable; create a new version instead. */
function update_fee_policy(string $id, array $input, array $actor): array
{
    $row = find_fee_policy($id);
    if (!$row) {
        throw new InvalidArgumentException('Fee policy not found.');
    }
    $status = fee_policy_normalise_status((string)$row['status']);
    if ($status !== 'draft') {
        throw new InvalidArgumentException('Only a draft policy can be edited. Approved policies are history: create a new version instead.');
    }

    [$data, $errors] = validate_fee_policy_input($input, $row);
    if ($errors) {
        throw new FeePolicyValidationException($errors);
    }

    db_exec(
        'UPDATE fee_policies
            SET name = :name, description = :description, tier = :tier, category = :category,
                calculation_method = :method, currency = :currency,
                agent_share_percent = :agent_pct, goodlucks_share_percent = :goodlucks_pct,
                agent_share_fixed_ghs = :agent_fixed, goodlucks_share_fixed_ghs = :goodlucks_fixed,
                effective_from = :effective_from, effective_to = :effective_to,
                notes = :notes, updated_at = :updated
          WHERE id = :id AND status = :draft_status',
        [
            ':name'          => $data['name'],
            ':description'   => $data['description'],
            ':tier'          => $data['agent_tier'],
            ':category'      => $data['category'],
            ':method'        => $data['calculation_method'],
            ':currency'      => $data['currency'],
            ':agent_pct'     => $data['agent_share_percent'],
            ':goodlucks_pct' => $data['goodlucks_share_percent'],
            ':agent_fixed'   => $data['agent_share_fixed_ghs'],
            ':goodlucks_fixed' => $data['goodlucks_share_fixed_ghs'],
            ':effective_from' => $data['effective_from'],
            ':effective_to'  => $data['effective_to'],
            ':notes'         => $data['notes'],
            ':updated'       => db_now(),
            ':id'            => $id,
            ':draft_status'  => 'draft',
        ]
    );

    $updated = find_fee_policy($id) ?? [];
    record_fee_policy_event($updated, 'updated', $actor, 'Draft edited.', 'draft', 'draft');

    return $updated;
}

function submit_fee_policy(string $id, array $actor, string $note = ''): array
{
    $row = find_fee_policy($id);
    if (!$row) {
        throw new InvalidArgumentException('Fee policy not found.');
    }
    if (fee_policy_normalise_status((string)$row['status']) !== 'draft') {
        throw new InvalidArgumentException('Only a draft policy can be submitted for approval.');
    }

    db_exec(
        'UPDATE fee_policies
            SET status = :status, submitted_by = :by, submitted_at = :at, updated_at = :updated
          WHERE id = :id AND status = :draft_status',
        [
            ':status'       => 'pending_approval',
            ':by'           => (string)$actor['id'],
            ':at'           => db_now(),
            ':updated'      => db_now(),
            ':id'           => $id,
            ':draft_status' => 'draft',
        ]
    );

    $updated = find_fee_policy($id) ?? [];
    record_fee_policy_event($updated, 'submitted', $actor, $note, 'draft', 'pending_approval');
    return $updated;
}

function approve_fee_policy(string $id, array $actor, string $note = ''): array
{
    $row = find_fee_policy($id);
    if (!$row) {
        throw new InvalidArgumentException('Fee policy not found.');
    }
    if (fee_policy_normalise_status((string)$row['status']) !== 'pending_approval') {
        throw new InvalidArgumentException('Only a policy awaiting approval can be approved.');
    }
    $selfApproval = (string)($row['created_by'] ?? '') === (string)$actor['id'];
    // Separation of duties: the person who drafted the financial terms cannot be
    // the person who approves them, even when they hold both capabilities.
    //
    // Upgrade 2 exception: the PRIMARY administrator may approve a policy it
    // created itself (the platform's fee terms are that account's decision to
    // make). The exception is recorded on the row and in the event trail, and it
    // never reaches an ordinary administrator — `is_fee_policy_self_approver()`
    // is true only for the primary account.
    if ($selfApproval && !is_fee_policy_self_approver($actor)) {
        throw new InvalidArgumentException('A policy must be approved by a different administrator from the one who created it.');
    }
    if ($note === '') {
        throw new InvalidArgumentException('Record what you checked before approving this policy.');
    }

    db_exec(
        'UPDATE fee_policies
            SET status = :status, approved_by = :by, approved_at = :at,
                self_approved = :self_approved, self_approved_at = :self_approved_at,
                updated_at = :updated
          WHERE id = :id AND status = :pending',
        [
            ':status'  => 'approved',
            ':by'      => (string)$actor['id'],
            ':at'      => db_now(),
            ':self_approved'    => $selfApproval ? 1 : 0,
            ':self_approved_at' => $selfApproval ? db_now() : null,
            ':updated' => db_now(),
            ':id'      => $id,
            ':pending' => 'pending_approval',
        ]
    );

    $updated = find_fee_policy($id) ?? [];
    record_fee_policy_event(
        $updated,
        $selfApproval ? 'approved_by_creator' : 'approved',
        $actor,
        $selfApproval ? ('Primary administrator self-approval. ' . $note) : $note,
        'pending_approval',
        'approved'
    );
    return $updated;
}

function reject_fee_policy(string $id, array $actor, string $reason): array
{
    $row = find_fee_policy($id);
    if (!$row) {
        throw new InvalidArgumentException('Fee policy not found.');
    }
    if (fee_policy_normalise_status((string)$row['status']) !== 'pending_approval') {
        throw new InvalidArgumentException('Only a policy awaiting approval can be rejected.');
    }
    if (trim($reason) === '') {
        throw new InvalidArgumentException('Give a reason for rejecting the policy.');
    }

    db_exec(
        'UPDATE fee_policies
            SET status = :status, rejected_by = :by, rejected_at = :at, rejection_reason = :reason,
                updated_at = :updated
          WHERE id = :id AND status = :pending',
        [
            ':status'  => 'rejected',
            ':by'      => (string)$actor['id'],
            ':at'      => db_now(),
            ':reason'  => clean_string($reason, 1000),
            ':updated' => db_now(),
            ':id'      => $id,
            ':pending' => 'pending_approval',
        ]
    );

    $updated = find_fee_policy($id) ?? [];
    record_fee_policy_event($updated, 'rejected', $actor, $reason, 'pending_approval', 'rejected');
    return $updated;
}

/**
 * Activate an approved policy.
 *
 * Conditions (all enforced, none inferred): approval evidence exists, the start
 * date has arrived, the end date (if any) has not passed, and no other active
 * policy already covers the same tier + category + currency over an overlapping
 * window. Overlapping policies would make "which share applies?" ambiguous, so
 * the second activation is refused rather than silently prioritised.
 */
function activate_fee_policy(string $id, array $actor, string $note = ''): array
{
    $row = find_fee_policy($id);
    if (!$row) {
        throw new InvalidArgumentException('Fee policy not found.');
    }
    $status = fee_policy_normalise_status((string)$row['status']);
    if ($status !== 'approved') {
        throw new InvalidArgumentException('Only an approved policy can be activated.');
    }
    if (empty($row['approved_by']) || empty($row['approved_at'])) {
        throw new InvalidArgumentException('This policy has no approval on record and cannot be activated.');
    }

    $today = gmdate('Y-m-d');
    $from = (string)($row['effective_from'] ?? '');
    $to = (string)($row['effective_to'] ?? '');

    if ($from !== '' && $from > $today) {
        throw new InvalidArgumentException('This policy starts on ' . $from . ' and cannot be activated before then.');
    }
    if ($to !== '' && $to < $today) {
        throw new InvalidArgumentException('This policy ended on ' . $to . ' and can no longer be activated.');
    }

    $conflict = overlapping_active_policy($row);
    if ($conflict !== null) {
        throw new FeePolicyConflictException(
            'Another active policy (' . (string)$conflict['name'] . ') already covers '
            . AGENT_TIERS[(string)$row['tier']] . ' / ' . FEE_POLICY_CATEGORIES[(string)$row['category']]
            . ' for an overlapping period. Deactivate it first.',
            (string)$conflict['id']
        );
    }

    db_exec(
        'UPDATE fee_policies
            SET status = :status, activated_by = :by, activated_at = :at,
                deactivated_by = NULL, deactivated_at = NULL, deactivation_reason = NULL,
                updated_at = :updated
          WHERE id = :id AND status = :approved',
        [
            ':status'   => 'active',
            ':by'       => (string)$actor['id'],
            ':at'       => db_now(),
            ':updated'  => db_now(),
            ':id'       => $id,
            ':approved' => 'approved',
        ]
    );

    $updated = find_fee_policy($id) ?? [];
    record_fee_policy_event($updated, 'activated', $actor, $note, 'approved', 'active');
    return $updated;
}

/** Any other active policy for the same tier/category/currency whose window overlaps. */
function overlapping_active_policy(array $row): ?array
{
    $from = (string)($row['effective_from'] ?? '');
    $to = (string)($row['effective_to'] ?? '');

    $rows = db_all(
        "SELECT * FROM fee_policies
          WHERE status = 'active'
            AND tier = :tier
            AND category = :category
            AND currency = :currency
            AND id <> :id",
        [
            ':tier'     => (string)$row['tier'],
            ':category' => (string)$row['category'],
            ':currency' => (string)($row['currency'] ?? FEE_POLICY_CURRENCY),
            ':id'       => (string)$row['id'],
        ]
    );

    foreach ($rows as $other) {
        if (effective_fee_policy_status($other) !== 'active') {
            continue;
        }
        $otherFrom = (string)($other['effective_from'] ?? '');
        $otherTo = (string)($other['effective_to'] ?? '');
        // Two open-ended or partly open windows overlap unless one ends before
        // the other begins.
        $endsBeforeStart = ($to !== '' && $otherFrom !== '' && $to < $otherFrom);
        $otherEndsBeforeStart = ($otherTo !== '' && $from !== '' && $otherTo < $from);
        if (!$endsBeforeStart && !$otherEndsBeforeStart) {
            return $other;
        }
    }

    return null;
}

function deactivate_fee_policy(string $id, array $actor, string $reason): array
{
    $row = find_fee_policy($id);
    if (!$row) {
        throw new InvalidArgumentException('Fee policy not found.');
    }
    if (fee_policy_normalise_status((string)$row['status']) !== 'active') {
        throw new InvalidArgumentException('Only an active policy can be deactivated.');
    }
    if (trim($reason) === '') {
        throw new InvalidArgumentException('Give a reason for deactivating the policy.');
    }

    db_exec(
        'UPDATE fee_policies
            SET status = :status, deactivated_by = :by, deactivated_at = :at,
                deactivation_reason = :reason, updated_at = :updated
          WHERE id = :id AND status = :active',
        [
            ':status'   => 'deactivated',
            ':by'       => (string)$actor['id'],
            ':at'       => db_now(),
            ':reason'   => clean_string($reason, 1000),
            ':updated'  => db_now(),
            ':id'       => $id,
            ':active'   => 'active',
        ]
    );

    $updated = find_fee_policy($id) ?? [];
    record_fee_policy_event($updated, 'deactivated', $actor, $reason, 'active', 'deactivated');

    // Existing transaction snapshots are deliberately untouched: a policy going
    // away cannot re-price a fee that was agreed under it.
    return $updated;
}

// ---------------------------------------------------------------------------
// Transaction snapshots (append-only, immutable)
// ---------------------------------------------------------------------------

/** Stable hash of a snapshot payload so later edits to the row are detectable. */
function fee_snapshot_hash(array $payload): string
{
    $canonical = [];
    foreach ($payload as $key => $value) {
        if ($key === 'snapshotHash') {
            continue;
        }
        $canonical[$key] = $value;
    }
    ksort($canonical);
    return hash('sha256', json_encode($canonical, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

/**
 * Compute the monetary split a policy produces for a total fee.
 *
 * Percentages are rounded to the cent and the *remainder always goes to the
 * agent*, so the two entitlements add up exactly to the collected total (no lost
 * or invented pesewa).
 *
 * @return array{agent: float, goodlucks: float, agentPercent: float, goodlucksPercent: float, method: string}
 */
function fee_policy_split(array $policy, float $feeTotal): array
{
    $method = (string)($policy['calculation_method'] ?? 'percentage');

    if ($method === 'fixed') {
        $agent = round((float)($policy['agent_share_fixed_ghs'] ?? 0), 2);
        $goodlucks = round((float)($policy['goodlucks_share_fixed_ghs'] ?? 0), 2);
        return [
            'agent'            => $agent,
            'goodlucks'        => $goodlucks,
            'agentPercent'     => 0.0,
            'goodlucksPercent' => 0.0,
            'method'           => 'fixed',
        ];
    }

    $goodlucksPercent = round((float)($policy['goodlucks_share_percent'] ?? 0), 2);
    $agentPercent = round((float)($policy['agent_share_percent'] ?? 0), 2);
    $goodlucks = round($feeTotal * $goodlucksPercent / 100, 2);
    $agent = round($feeTotal - $goodlucks, 2);

    return [
        'agent'            => $agent,
        'goodlucks'        => $goodlucks,
        'agentPercent'     => $agentPercent,
        'goodlucksPercent' => $goodlucksPercent,
        'method'           => 'percentage',
    ];
}

function find_fee_snapshot(string $id): ?array
{
    if ($id === '') {
        return null;
    }
    return db_one('SELECT * FROM fee_policy_snapshots WHERE id = :id LIMIT 1', [':id' => $id]);
}

function find_fee_snapshot_for_transaction(string $transactionType, string $transactionId): ?array
{
    return db_one(
        'SELECT * FROM fee_policy_snapshots
          WHERE transaction_type = :type AND transaction_id = :tid LIMIT 1',
        [':type' => $transactionType, ':tid' => $transactionId]
    );
}

/** Public shape of a snapshot, with a live integrity check against its hash. */
function shape_fee_snapshot(array $row): array
{
    $payload = [
        'policyId'              => (string)$row['policy_id'],
        'policyName'            => (string)($row['policy_name'] ?? ''),
        'policyVersion'         => (int)($row['policy_version'] ?? 1),
        'policyCategory'        => (string)($row['policy_category'] ?? ''),
        // Snapshot table column (fee_policy_snapshots.agent_tier) — the tier at
        // the moment the terms were frozen, not the agent's current tier.
        'agentTier'             => (string)($row['agent_tier'] ?? ''),
        'subjectUserId'         => (string)($row['subject_user_id'] ?? ''),
        'transactionType'       => (string)$row['transaction_type'],
        'transactionId'         => (string)$row['transaction_id'],
        'currency'              => (string)($row['currency'] ?? FEE_POLICY_CURRENCY),
        'calculationMethod'     => (string)($row['calculation_method'] ?? 'percentage'),
        'feeTotalGhs'           => round((float)$row['fee_total_ghs'], 2),
        'agentSharePercent'     => round((float)$row['agent_share_percent'], 2),
        'goodlucksSharePercent' => round((float)$row['goodlucks_share_percent'], 2),
        'agentShareFixedGhs'    => $row['agent_share_fixed_ghs'] === null ? null : round((float)$row['agent_share_fixed_ghs'], 2),
        'goodlucksShareFixedGhs'=> $row['goodlucks_share_fixed_ghs'] === null ? null : round((float)$row['goodlucks_share_fixed_ghs'], 2),
        'agentEntitlementGhs'   => round((float)$row['agent_entitlement_ghs'], 2),
        'goodlucksEntitlementGhs' => round((float)$row['goodlucks_entitlement_ghs'], 2),
        'policyStatusAtUse'     => (string)($row['policy_status_at_use'] ?? ''),
        'policyEffectiveFrom'   => (string)($row['policy_effective_from'] ?? ''),
        'policyEffectiveTo'     => (string)($row['policy_effective_to'] ?? ''),
        'policyApprovedBy'      => (string)($row['policy_approved_by'] ?? ''),
        'policyApprovedAt'      => (string)($row['policy_approved_at'] ?? ''),
        'transactionAt'         => (string)($row['transaction_at'] ?? ''),
    ];

    $expected = fee_snapshot_hash($payload);
    $recorded = (string)($row['snapshot_hash'] ?? '');

    return $payload + [
        'id'           => (string)$row['id'],
        'snapshotAt'   => to_iso($row['snapshot_at'] ?? null),
        'createdBy'    => (string)($row['created_by'] ?? ''),
        'snapshotHash' => $recorded,
        'integrityOk'  => $recorded !== '' && hash_equals($recorded, $expected),
    ];
}

/**
 * Apply an approved, active policy to one viewing-fee record and freeze the
 * resulting terms in an immutable snapshot.
 *
 * Refusals are deliberate and explicit:
 *  - the fee must be linked to an agent account (the tier is derived from that
 *    account's verification records, never from the request);
 *  - the agent's tier must be the policy's tier;
 *  - the policy must be active, approved and in effect on the fee's date;
 *  - the policy may not be applied to a fee collected before it took effect;
 *  - a fee that already carries a share (agreed or policy-based) is never
 *    re-priced;
 *  - a Goodlucks entitlement below what has already been remitted is refused.
 */
function apply_fee_policy_to_viewing_fee(string $recordId, ?string $policyId, array $actor): array
{
    $record = find_viewing_fee_record($recordId);
    if (!$record) {
        throw new InvalidArgumentException('Viewing fee record not found.');
    }
    $state = (string)$record['collection_state'];
    if (in_array($state, ['void', 'disputed'], true)) {
        throw new InvalidArgumentException('A void or disputed fee cannot be priced.');
    }
    if (($record['share_basis'] ?? 'not_set') !== 'not_set' || $record['goodlucks_share_ghs'] !== null) {
        throw new InvalidArgumentException('This fee already carries an agreed share. Historical terms are never re-priced.');
    }
    if (find_fee_snapshot_for_transaction('viewing_fee', $recordId) !== null) {
        throw new InvalidArgumentException('A policy snapshot already exists for this fee and cannot be replaced.');
    }

    $agentUserId = (string)($record['agent_user_id'] ?? '');
    if ($agentUserId === '') {
        throw new InvalidArgumentException('Link this fee to an agent account before a tier-based policy can be applied.');
    }

    $tierState = agent_tier_state($agentUserId);
    $transactionAt = (string)($record['recorded_at'] ?? db_now());
    $transactionDate = substr($transactionAt, 0, 10);

    $policy = null;
    if ($policyId !== null && $policyId !== '') {
        $policy = find_fee_policy($policyId);
        if (!$policy) {
            throw new InvalidArgumentException('Fee policy not found.');
        }
    } else {
        $policy = find_applicable_fee_policy($tierState['tier'], 'viewing_fee', $transactionDate);
        if ($policy === null) {
            throw new FeePolicyNotApplicableException(
                fee_policy_non_applicability_reason($tierState['tier'], 'viewing_fee', $transactionDate)
            );
        }
    }

    $status = effective_fee_policy_status($policy);
    if ($status !== 'active') {
        throw new InvalidArgumentException('Only an active, approved policy can be applied. This policy is ' . str_replace('_', ' ', $status) . '.');
    }
    if (empty($policy['approved_by']) || empty($policy['approved_at'])) {
        throw new InvalidArgumentException('This policy has no approval on record and cannot be applied.');
    }
    if ((string)$policy['category'] !== 'viewing_fee') {
        throw new InvalidArgumentException('This policy covers ' . (FEE_POLICY_CATEGORIES[(string)$policy['category']] ?? 'another category') . ', which has no transaction ledger in this release.');
    }
    if ((string)$policy['tier'] !== $tierState['tier']) {
        throw new FeePolicyTierMismatchException(
            'This policy is for ' . (AGENT_TIERS[(string)$policy['tier']] ?? 'another tier')
            . ', but the linked agent is currently a ' . $tierState['tierLabel'] . '.'
        );
    }
    if ((string)$policy['currency'] !== FEE_POLICY_CURRENCY) {
        throw new InvalidArgumentException('Only GHS policies can be applied.');
    }
    if (!fee_policy_covers_date($policy, $transactionDate)) {
        throw new InvalidArgumentException('This policy was not in effect on ' . $transactionDate . ' (the date this fee was collected). History is never re-priced by a later policy.');
    }

    $feeTotal = round((float)($record['fee_total_ghs'] ?? 0), 2);
    if ($feeTotal <= 0) {
        throw new InvalidArgumentException('This fee has no collected amount to split.');
    }

    $split = fee_policy_split($policy, $feeTotal);
    $remitted = fee_remitted_total($recordId);
    if ($split['goodlucks'] + 0.005 < $remitted) {
        throw new InvalidArgumentException('The policy entitlement is lower than the amount already remitted for this fee.');
    }

    $payload = [
        'policyId'              => (string)$policy['id'],
        'policyName'            => (string)($policy['name'] ?? ''),
        'policyVersion'         => (int)($policy['version'] ?? 1),
        'policyCategory'        => (string)$policy['category'],
        'agentTier'             => $tierState['tier'],
        'subjectUserId'         => $agentUserId,
        'transactionType'       => 'viewing_fee',
        'transactionId'         => $recordId,
        'currency'              => FEE_POLICY_CURRENCY,
        'calculationMethod'     => $split['method'],
        'feeTotalGhs'           => $feeTotal,
        'agentSharePercent'     => $split['agentPercent'],
        'goodlucksSharePercent' => $split['goodlucksPercent'],
        'agentShareFixedGhs'    => $policy['agent_share_fixed_ghs'] === null ? null : round((float)$policy['agent_share_fixed_ghs'], 2),
        'goodlucksShareFixedGhs'=> $policy['goodlucks_share_fixed_ghs'] === null ? null : round((float)$policy['goodlucks_share_fixed_ghs'], 2),
        'agentEntitlementGhs'   => $split['agent'],
        'goodlucksEntitlementGhs' => $split['goodlucks'],
        'policyStatusAtUse'     => 'active',
        'policyEffectiveFrom'   => (string)($policy['effective_from'] ?? ''),
        'policyEffectiveTo'     => (string)($policy['effective_to'] ?? ''),
        'policyApprovedBy'      => (string)($policy['approved_by'] ?? ''),
        'policyApprovedAt'      => (string)($policy['approved_at'] ?? ''),
        'transactionAt'         => $transactionAt,
    ];
    $hash = fee_snapshot_hash($payload);
    $snapshotId = new_id('fps');

    db_transaction(static function () use ($payload, $hash, $snapshotId, $recordId, $policy, $tierState, $split, $actor): void {
        db_exec(
            'INSERT INTO fee_policy_snapshots (id, policy_id, policy_name, policy_version, policy_category,
                                               agent_tier, subject_user_id, transaction_type, transaction_id,
                                               currency, calculation_method, fee_total_ghs,
                                               agent_share_percent, goodlucks_share_percent,
                                               agent_share_fixed_ghs, goodlucks_share_fixed_ghs,
                                               agent_entitlement_ghs, goodlucks_entitlement_ghs,
                                               policy_status_at_use, policy_effective_from, policy_effective_to,
                                               policy_approved_by, policy_approved_at, transaction_at,
                                               snapshot_hash, snapshot_at, created_by)
             VALUES (:id, :policy_id, :policy_name, :policy_version, :policy_category,
                     :agent_tier, :subject_user_id, :transaction_type, :transaction_id,
                     :currency, :method, :fee_total,
                     :agent_pct, :goodlucks_pct,
                     :agent_fixed, :goodlucks_fixed,
                     :agent_entitlement, :goodlucks_entitlement,
                     :status_at_use, :effective_from, :effective_to,
                     :approved_by, :approved_at, :transaction_at,
                     :hash, :snapshot_at, :created_by)',
            [
                ':id'               => $snapshotId,
                ':policy_id'        => $payload['policyId'],
                ':policy_name'      => $payload['policyName'],
                ':policy_version'   => $payload['policyVersion'],
                ':policy_category'  => $payload['policyCategory'],
                ':agent_tier'       => $payload['agentTier'],
                ':subject_user_id'  => $payload['subjectUserId'],
                ':transaction_type' => $payload['transactionType'],
                ':transaction_id'   => $payload['transactionId'],
                ':currency'         => $payload['currency'],
                ':method'           => $payload['calculationMethod'],
                ':fee_total'        => $payload['feeTotalGhs'],
                ':agent_pct'        => $payload['agentSharePercent'],
                ':goodlucks_pct'    => $payload['goodlucksSharePercent'],
                ':agent_fixed'      => $payload['agentShareFixedGhs'],
                ':goodlucks_fixed'  => $payload['goodlucksShareFixedGhs'],
                ':agent_entitlement' => $payload['agentEntitlementGhs'],
                ':goodlucks_entitlement' => $payload['goodlucksEntitlementGhs'],
                ':status_at_use'    => $payload['policyStatusAtUse'],
                ':effective_from'   => $payload['policyEffectiveFrom'],
                ':effective_to'     => $payload['policyEffectiveTo'],
                ':approved_by'      => $payload['policyApprovedBy'],
                ':approved_at'      => $payload['policyApprovedAt'],
                ':transaction_at'   => $payload['transactionAt'],
                ':hash'             => $hash,
                ':snapshot_at'      => db_now_precise(),
                ':created_by'       => (string)$actor['id'],
            ]
        );

        db_exec(
            'UPDATE viewing_fee_records
                SET goodlucks_share_ghs = :share, agent_share_ghs = :agent_share,
                    share_basis = :basis, policy_id = :policy_id, policy_snapshot_id = :snapshot_id,
                    agent_tier_at_snapshot = :tier, policy_snapshot_json = :snapshot_json,
                    updated_at = :updated
              WHERE id = :id AND share_basis = :not_set',
            [
                ':share'        => $split['goodlucks'],
                ':agent_share'  => $split['agent'],
                ':basis'        => 'policy_snapshot',
                ':policy_id'    => $payload['policyId'],
                ':snapshot_id'  => $snapshotId,
                ':tier'         => $tierState['tier'],
                ':snapshot_json'=> json_encode(['basis' => 'policy_snapshot', 'snapshotId' => $snapshotId, 'policyId' => $payload['policyId'], 'policyApplied' => true]),
                ':updated'      => db_now(),
                ':id'           => $recordId,
                ':not_set'      => 'not_set',
            ]
        );
    });

    return [
        'snapshot' => find_fee_snapshot($snapshotId) ?? [],
        'record'   => find_viewing_fee_record($recordId) ?? [],
        'policy'   => $policy,
        'tier'     => $tierState,
    ];
}

/** Read-only snapshot for a transaction, if one exists. */
function fee_snapshot_for_viewing_fee(array $record): ?array
{
    $id = (string)($record['policy_snapshot_id'] ?? '');
    if ($id !== '') {
        $row = find_fee_snapshot($id);
        if ($row) {
            return $row;
        }
    }
    return find_fee_snapshot_for_transaction('viewing_fee', (string)($record['id'] ?? ''));
}

// ---------------------------------------------------------------------------
// Overview for the admin console
// ---------------------------------------------------------------------------

/**
 * The whole financial-policy picture, including the untouched 60/40 and 70/30
 * proposals. `appliedToCalculations` stays false because nothing here computes
 * a share: only an explicitly applied policy snapshot prices a transaction.
 */
function fee_policy_overview(): array
{
    $policies = list_fee_policies([], 200);
    $active = array_values(array_filter($policies, static fn(array $p) => $p['status'] === 'active'));

    return [
        'policies'            => $policies,
        'activePolicies'      => $active,
        'counts'              => [
            'draft'            => count(array_filter($policies, static fn($p) => $p['status'] === 'draft')),
            'pending_approval' => count(array_filter($policies, static fn($p) => $p['status'] === 'pending_approval')),
            'approved'         => count(array_filter($policies, static fn($p) => $p['status'] === 'approved')),
            'active'           => count($active),
            'rejected'         => count(array_filter($policies, static fn($p) => $p['status'] === 'rejected')),
            'deactivated'      => count(array_filter($policies, static fn($p) => $p['status'] === 'deactivated')),
        ],
        'tiers'        => array_map(
            static fn(string $key, string $label): array => [
                'value'       => $key,
                'label'       => $label,
                'description' => AGENT_TIER_RULES[$key]['description'] ?? '',
            ],
            array_keys(AGENT_TIERS),
            array_values(AGENT_TIERS)
        ),
        'categories'   => array_map(
            static fn(string $key, string $label): array => ['value' => $key, 'label' => $label],
            array_keys(FEE_POLICY_CATEGORIES),
            array_values(FEE_POLICY_CATEGORIES)
        ),
        'calculationMethods' => array_map(
            static fn(string $key, string $label): array => ['value' => $key, 'label' => $label],
            array_keys(FEE_POLICY_CALCULATION_METHODS),
            array_values(FEE_POLICY_CALCULATION_METHODS)
        ),
        'statuses'     => FEE_POLICY_STATUSES,
        'currency'     => FEE_POLICY_CURRENCY,
        // The proposals are shown, labelled, and never computed with.
        'proposed'     => [
            [
                'agentTier'             => 'standard',
                'label'                 => 'Standard agent (proposal only)',
                'agentSharePercent'     => PROPOSED_STANDARD_AGENT_SHARE_PCT,
                'goodlucksSharePercent' => PROPOSED_STANDARD_GOODLUCKS_SHARE_PCT,
                'status'                => 'provisional',
                'appliedToCalculations' => false,
            ],
            [
                'agentTier'             => 'professional',
                'label'                 => 'Professionally authorised agent (proposal only)',
                'agentSharePercent'     => PROPOSED_VERIFIED_AGENT_SHARE_PCT,
                'goodlucksSharePercent' => PROPOSED_VERIFIED_GOODLUCKS_SHARE_PCT,
                'status'                => 'provisional',
                'appliedToCalculations' => false,
            ],
        ],
        'appliedToCalculations' => false,
        'note' => $active
            ? 'An active policy exists. It prices a fee only when an administrator explicitly applies it, and every applied fee keeps its own frozen snapshot.'
            : 'No active fee policy exists. The 60/40 and 70/30 splits are proposals only: they are never used in a calculation, and every fee is priced by an explicit agreement or not priced at all.',
    ];
}

/** Validation failure that carries per-field errors for the HTTP handler. */
class FeePolicyValidationException extends InvalidArgumentException
{
    /** @var array<string,string> */
    public array $fields;

    /** @param array<string,string> $fields */
    public function __construct(array $fields)
    {
        parent::__construct('The fee policy could not be saved. Check the highlighted fields.');
        $this->fields = $fields;
    }
}

/** A policy cannot price this transaction because none applies. */
class FeePolicyNotApplicableException extends InvalidArgumentException
{
}

/** The linked agent's current tier does not match the policy's tier. */
class FeePolicyTierMismatchException extends InvalidArgumentException
{
}

/** Another active policy already covers the same tier, category and period. */
class FeePolicyConflictException extends InvalidArgumentException
{
    public string $conflictPolicyId;

    public function __construct(string $message, string $conflictPolicyId)
    {
        parent::__construct($message);
        $this->conflictPolicyId = $conflictPolicyId;
    }
}
