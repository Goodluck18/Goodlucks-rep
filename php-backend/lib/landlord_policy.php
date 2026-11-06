<?php
/**
 * Goodlucks Homes - landlord fee policy (Task 03 update).
 *
 * Two SEPARATE landlord rules live here, and neither of them is the agent
 * rule:
 *
 *  1. GENERAL LANDLORD VIEWING FEE
 *     One amount, set by an administrator and stored in `platform_settings`
 *     under `landlord_viewing_fee_ghs`. It is NOT typed by a landlord, it is
 *     NOT per property, and there is NO built-in default: until an
 *     administrator sets it the fee is genuinely unconfigured and the
 *     application says so rather than inventing an amount.
 *
 *     The fee belongs entirely to Goodlucks Homes. The tenant pays it AFTER
 *     viewing, directly to Goodlucks. The landlord never receives it and it is
 *     never run through an agent commission split.
 *
 *  2. LANDLORD PLATFORM FEE ON RENT
 *     For a landlord-submitted property, Goodlucks receives a platform fee of
 *     LANDLORD_PLATFORM_FEE_PERCENT of the total rent actually paid by the
 *     tenant. It is computed on the server from the recorded rent payment, and
 *     the percentage and the amount are stored on the transaction. The
 *     landlord receives no agency commission and no share of it.
 *
 * WHICH POLICY APPLIES is decided from how the listing was SUBMITTED
 * (`submitted_by_role` / `submitted_by_user_id`), not from who owns the
 * property: an agent submitting for a landlord is still an agent listing, and
 * a landlord listing their own property is a landlord listing.
 *
 * Nothing here recalculates a historical record. A new setting applies to
 * future submissions, future viewing records and the fee shown on landlord
 * listings; recorded viewings and payments keep the figures they were created
 * with.
 */

declare(strict_types=1);

/** The platform-settings table (one row per administrator-controlled setting). */
const PLATFORM_SETTINGS_TABLE = 'platform_settings';

/** Setting key for the one general landlord viewing fee. */
const LANDLORD_VIEWING_FEE_KEY = 'landlord_viewing_fee_ghs';

/**
 * The landlord platform fee, as a percentage of the total rent the tenant
 * actually paid. This is the agreed business rule, not a per-property value and
 * not something a client may send: every transaction stores the percentage that
 * was applied, so a future change of this constant never rewrites history.
 */
const LANDLORD_PLATFORM_FEE_PERCENT = 8.0;

/** Bounds for the general landlord viewing fee (a non-negative money amount). */
const LANDLORD_VIEWING_FEE_MIN_GHS = 0.0;
const LANDLORD_VIEWING_FEE_MAX_GHS = 10000.0;

/** Policy labels used by the API and the dashboards. */
const LANDLORD_POLICY_LABELS = [
    'viewing_fee'    => 'General landlord viewing fee',
    'platform_fee'   => 'Platform fee on rent (landlord listings)',
    'agent_tier'     => 'Agent commission tier split',
];

// ---------------------------------------------------------------------------
// Platform settings storage
// ---------------------------------------------------------------------------

/** One settings row, or null when the setting has never been set. */
function platform_setting_row(string $key): ?array
{
    if ($key === '') {
        return null;
    }
    return db_one(
        'SELECT * FROM ' . PLATFORM_SETTINGS_TABLE . ' WHERE setting_key = :key LIMIT 1',
        [':key' => $key]
    );
}

/**
 * Write (or replace) one setting. Callers must validate the value first; this
 * function only stores text.
 */
function platform_setting_write(string $key, string $value, string $type, ?array $actor): void
{
    $existing = platform_setting_row($key);
    $now = db_now();
    if ($existing !== null) {
        db_exec(
            'UPDATE ' . PLATFORM_SETTINGS_TABLE . '
                SET setting_value = :value, value_type = :type,
                    updated_by = :by, updated_at = :now
              WHERE id = :id',
            [
                ':value' => $value,
                ':type'  => $type,
                ':by'    => (string)($actor['id'] ?? ''),
                ':now'   => $now,
                ':id'    => (string)$existing['id'],
            ]
        );
        return;
    }

    db_exec(
        'INSERT INTO ' . PLATFORM_SETTINGS_TABLE . '
            (id, setting_key, setting_value, value_type, updated_by, updated_at, created_at)
         VALUES (:id, :key, :value, :type, :by, :now, :created)',
        [
            ':id'      => new_id('pset'),
            ':key'     => $key,
            ':value'   => $value,
            ':type'    => $type,
            ':by'      => (string)($actor['id'] ?? ''),
            ':now'     => $now,
            ':created' => $now,
        ]
    );
}

/** Public shape of one settings row (never exposes anything but the value). */
function shape_platform_setting(?array $row): array
{
    if ($row === null) {
        return [
            'configured'  => false,
            'amountGhs'   => null,
            'value'       => null,
            'updatedAt'   => null,
            'updatedBy'   => '',
            'updatedByName' => '',
        ];
    }

    $value = (string)($row['setting_value'] ?? '');
    $amount = is_numeric($value) ? round((float)$value, 2) : null;
    $updater = (string)($row['updated_by'] ?? '') !== '' ? find_user_by_id((string)$row['updated_by']) : null;

    return [
        'configured'    => $amount !== null,
        'amountGhs'     => $amount,
        'value'         => $amount === null ? $value : $amount,
        'updatedAt'     => to_iso($row['updated_at'] ?? null),
        // Who last changed it, and when. Never an email address or a password.
        'updatedBy'     => (string)($row['updated_by'] ?? ''),
        'updatedByName' => $updater !== null ? (string)($updater['name'] ?? '') : '',
    ];
}

// ---------------------------------------------------------------------------
// 1. The general landlord viewing fee
// ---------------------------------------------------------------------------

/** The configured general landlord viewing fee, or null when unconfigured. */
function landlord_viewing_fee(): ?float
{
    $row = platform_setting_row(LANDLORD_VIEWING_FEE_KEY);
    if ($row === null) {
        return null;
    }
    $raw = trim((string)($row['setting_value'] ?? ''));
    if ($raw === '' || !is_numeric($raw)) {
        return null;
    }
    $amount = (float)$raw;
    if (!is_finite($amount) || $amount < 0) {
        return null;
    }
    return round($amount, 2);
}

/** True when an administrator has actually set the fee (even to zero). */
function landlord_viewing_fee_is_configured(): bool
{
    return platform_setting_row(LANDLORD_VIEWING_FEE_KEY) !== null;
}

/** Everything the admin screen needs to show the setting and its history. */
function landlord_policy_summary(): array
{
    $row = platform_setting_row(LANDLORD_VIEWING_FEE_KEY);
    $setting = shape_platform_setting($row);
    $fee = landlord_viewing_fee();

    return [
        'viewingFee' => [
            'configured'  => $setting['configured'],
            'amountGhs'   => $fee,
            'updatedAt'   => $setting['updatedAt'],
            'updatedBy'   => $setting['updatedBy'],
            'updatedByName' => $setting['updatedByName'],
            'label'       => LANDLORD_POLICY_LABELS['viewing_fee'],
            // Stated plainly so the admin screen cannot imply anything else.
            'payableBy'   => 'the tenant, after viewing the property',
            'paidTo'      => 'Goodlucks Homes',
            'landlordShare' => 0.0,
            'appliesTo'   => 'every landlord-submitted property',
        ],
        'platformFee' => [
            'percent'     => LANDLORD_PLATFORM_FEE_PERCENT,
            'label'       => LANDLORD_POLICY_LABELS['platform_fee'],
            'basis'       => 'the total rent actually paid by the tenant',
            'paidTo'      => 'Goodlucks Homes',
            'landlordSharePercent' => 0.0,
            'agentSharePercent'    => 0.0,
            'appliesTo'   => 'landlord-submitted properties only',
        ],
        'agentPolicy' => [
            'label'       => LANDLORD_POLICY_LABELS['agent_tier'],
            'appliesTo'   => 'agent-submitted properties only',
            'note'        => 'Unchanged: identity approved 60%, identity and professional approved 70%, '
                . 'applied to the agreed commission. Never applied to a landlord listing or to a viewing fee.',
        ],
    ];
}

/**
 * Set the general landlord viewing fee. Administrator-only (the caller checks
 * the role); this function validates the amount and audits the change.
 *
 * Landlord listings that are live or waiting for review take the new amount so
 * that what a tenant is shown matches what a future viewing will record.
 * Recorded viewings and recorded payments are never touched.
 */
function set_landlord_viewing_fee($value, array $actor): array
{
    $amount = valid_money($value, LANDLORD_VIEWING_FEE_MIN_GHS, LANDLORD_VIEWING_FEE_MAX_GHS);
    if ($amount === null) {
        error_response(
            'Enter the general landlord viewing fee in GHS as a number between '
            . number_format(LANDLORD_VIEWING_FEE_MIN_GHS, 2) . ' and '
            . number_format(LANDLORD_VIEWING_FEE_MAX_GHS, 2) . '.',
            422,
            ['amountGhs' => 'Enter a valid non-negative amount.']
        );
    }

    $before = platform_setting_row(LANDLORD_VIEWING_FEE_KEY);
    $previous = landlord_viewing_fee();

    platform_setting_write(LANDLORD_VIEWING_FEE_KEY, number_format($amount, 2, '.', ''), 'money', $actor);

    audit_log('landlord_policy.viewing_fee_changed', 'platform_setting', LANDLORD_VIEWING_FEE_KEY, [
        'previousAmountGhs' => $previous,
        'newAmountGhs'      => $amount,
        'wasConfigured'     => $before !== null,
        'paidTo'            => 'Goodlucks Homes',
    ], $actor);

    $refreshed = refresh_landlord_listing_fees($amount, $actor);

    // Future viewings take the new amount because the listing now carries it.
    // Recorded viewings keep their own snapshot, which is never rewritten.
    return [
        'policy'    => landlord_policy_summary(),
        'listingsUpdated' => $refreshed,
    ];
}

/**
 * Copy the general fee onto every landlord-submitted listing that is still
 * waiting for review or live.
 *
 * This is the ONLY place an existing listing's viewing fee is rewritten, and it
 * happens because an administrator changed the platform-wide fee — never
 * because a landlord asked. `viewing_schedules` rows are not touched: each
 * viewing keeps the fee it was requested with.
 */
function refresh_landlord_listing_fees(float $amount, array $actor): int
{
    $terms = json_encode(landlord_viewing_terms_values(), JSON_UNESCAPED_SLASHES);
    $now = db_now();

    $rows = db_all(
        "SELECT id FROM properties
          WHERE submitted_by_role = 'landlord'
            AND status IN ('pending', 'active', 'rented')",
        []
    );

    foreach ($rows as $row) {
        db_exec(
            "UPDATE properties
                SET viewing_fee_ghs = :fee, viewing_terms_json = :terms,
                    viewing_terms_state = 'approved', viewing_terms_updated_at = :now,
                    viewing_terms_approved_by = NULL, updated_at = :now
              WHERE id = :id",
            [
                ':fee'   => $amount,
                ':terms' => $terms,
                ':now'   => $now,
                ':id'    => (string)$row['id'],
            ]
        );
    }

    if ($rows !== []) {
        audit_log('landlord_policy.fee_applied_to_listings', 'platform_setting', LANDLORD_VIEWING_FEE_KEY, [
            'amountGhs' => $amount,
            'listings'  => count($rows),
        ], $actor);
    }

    return count($rows);
}

/**
 * The standard viewing terms that accompany the general landlord viewing fee.
 *
 * A landlord does not write these and cannot change them: the fee arrives after
 * the viewing and goes to Goodlucks Homes, and the terms say exactly that.
 */
function landlord_viewing_terms_values(): array
{
    return [
        'appointmentRequired'  => true,
        'howToArrange'         => 'Request the viewing on Goodlucks Homes and the Goodlucks viewing desk agrees a time with you before you travel.',
        'conditions'           => 'The viewing fee is collected by Goodlucks Homes after the viewing. It is not rent, not a holding deposit and not part of any tenancy.',
        'paymentInstructions'  => 'Pay the viewing fee to Goodlucks Homes after you have viewed the property. Goodlucks never asks for this fee online or before the viewing.',
        'restrictions'         => 'The fee covers the viewing only. The landlord does not receive it and it is never credited against rent.',
    ];
}

// ---------------------------------------------------------------------------
// Which policy applies to a listing
// ---------------------------------------------------------------------------

/**
 * Which policy governs a listing, decided from the SUBMISSION attribution.
 *
 *   'landlord'  the landlord listed it themselves
 *   'agent'     an agent submitted it (the property may still belong to a
 *               landlord — ownership and submission are different questions)
 *   'staff'     staff created it; neither the landlord nor the agent policy is
 *               assumed for a record a member of staff entered
 *
 * Older rows may carry an empty `submitted_by_role`. Those are treated as
 * landlord listings only when the owner and the submitter are the same person,
 * which is what the pre-Task-03 create path produced.
 */
function listing_policy_owner(array $property): string
{
    $role = strtolower(trim((string)($property['submitted_by_role'] ?? '')));
    if ($role === 'agent') {
        return 'agent';
    }
    if ($role === 'admin') {
        return 'staff';
    }
    if ($role === 'landlord') {
        return 'landlord';
    }

    // Legacy rows with no attribution: the owner is the submitter.
    $landlordId = (string)($property['landlord_id'] ?? '');
    $submitterId = (string)($property['submitted_by_user_id'] ?? '');
    if ($landlordId !== '' && $landlordId === $submitterId) {
        return 'landlord';
    }

    return 'staff';
}

/** True when the landlord viewing-fee / platform-fee policy governs this row. */
function is_landlord_listing(array $property): bool
{
    return listing_policy_owner($property) === 'landlord';
}

/** True when the agent commission-tier policy governs this row. */
function is_agent_listing(array $property): bool
{
    return listing_policy_owner($property) === 'agent';
}

/**
 * Give a landlord listing the general viewing fee, if one is configured.
 *
 * Called when a landlord submits a listing and again when staff approve it, so
 * a listing can never go public without the administrator's fee attached (and
 * a listing submitted before the fee was configured still gets it). Returns the
 * amount applied, or null when nothing is configured.
 */
function apply_landlord_viewing_fee_to_property(array $property, array $actor): ?float
{
    $propertyId = (string)($property['id'] ?? '');
    if ($propertyId === '' || !is_landlord_listing($property)) {
        return null;
    }

    $fee = landlord_viewing_fee();
    if ($fee === null) {
        // Deliberately NOT inventing an amount: the listing stays without a
        // viewing fee and staff are told configuration is required.
        audit_log('landlord_policy.viewing_fee_missing', 'property', $propertyId, [
            'reason' => 'The general landlord viewing fee has not been configured.',
        ], $actor);
        return null;
    }

    $terms = json_encode(landlord_viewing_terms_values(), JSON_UNESCAPED_SLASHES);
    $now = db_now();
    db_exec(
        "UPDATE properties
            SET viewing_fee_ghs = :fee, viewing_terms_json = :terms,
                viewing_terms_state = 'approved', viewing_terms_updated_at = :now,
                viewing_terms_approved_by = NULL, updated_at = :now
          WHERE id = :id",
        [
            ':fee'   => $fee,
            ':terms' => $terms,
            ':now'   => $now,
            ':id'    => $propertyId,
        ]
    );

    audit_log('landlord_policy.viewing_fee_applied', 'property', $propertyId, [
        'amountGhs' => $fee,
        'source'    => 'platform_policy',
        'paidTo'    => 'Goodlucks Homes',
    ], $actor);

    return $fee;
}

// ---------------------------------------------------------------------------
// 2. The landlord platform fee on rent
// ---------------------------------------------------------------------------

/**
 * Price the landlord platform fee for a rent payment.
 *
 * The rent amount is the basis; the percentage is the agreed policy. The result
 * is rounded to the cedi, half-up, which is how the business reads an 8% fee on
 * a whole-cedi rent (e.g. 12,000.00 → 960.00). Nothing here reads a client's
 * idea of what the fee should be.
 */
function landlord_platform_fee_split(float $rentAmount): array
{
    $rent = round($rentAmount, 2);
    $percent = LANDLORD_PLATFORM_FEE_PERCENT;
    // round() is half-away-from-zero, which is the intent for money.
    $fee = round($rent * ($percent / 100), 2);

    return [
        'rentAmountGhs'     => $rent,
        'percent'           => $percent,
        'platformFeeGhs'    => $fee,
        // The landlord receives no commission and no share of the platform fee.
        'landlordShareGhs'  => 0.0,
        'agentShareGhs'     => 0.0,
        'goodlucksShareGhs' => $fee,
    ];
}

/**
 * The dedupe key that stops one rent payment being charged the platform fee
 * twice. Built from the property and the recorded rent payment reference.
 */
function landlord_platform_fee_dedupe_key(string $propertyId, string $rentPaymentReference): string
{
    $normalised = strtolower(preg_replace('/[^a-z0-9]+/i', '', $rentPaymentReference) ?? '');
    return 'landlord_platform_fee:' . $propertyId . ':' . $normalised;
}

// ---------------------------------------------------------------------------
// Shared vocabulary for the two commission policies
// ---------------------------------------------------------------------------

/**
 * `rental_commissions.policy_type`. One row is priced by exactly ONE of these:
 * an agent commission can never also carry the landlord platform fee, and a
 * landlord platform fee never carries an agent tier.
 */
const COMMISSION_POLICY_AGENT = 'agent_commission';
const COMMISSION_POLICY_LANDLORD = 'landlord_platform_fee';

const COMMISSION_POLICY_LABELS = [
    COMMISSION_POLICY_AGENT    => 'Agent commission (60% / 70% tier split)',
    COMMISSION_POLICY_LANDLORD => 'Landlord platform fee (8% of rent paid)',
];
