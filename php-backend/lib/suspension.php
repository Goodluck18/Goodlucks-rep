<?php
/**
 * Goodlucks Homes - provider (Agent or Landlord) account suspension.
 *
 * Suspension is an *account* state and lives on `users.account_status`, so the
 * same rule covers both classifications. It is deliberately separate from
 * identity verification: `users.account_status = 'suspended'` blocks listing
 * even when the identity verification is `approved`, and reinstatement restores
 * the approved verification untouched (it never re-verifies, and never revokes).
 *
 * `agent_profiles.account_status` keeps its original meaning — the review state
 * of an agent profile — and also counts as a suspension source so historical
 * records keep working.
 *
 * What suspension does NOT do: delete anything. The account can still sign in,
 * read its dashboard, see its records and withdraw listings. Listings are moved
 * to the `suspended` property status (not `deactivated`) so the console can tell
 * "we unpublished this" apart from "the provider withdrew this".
 */

declare(strict_types=1);

const ACCOUNT_STATUSES = ['active', 'suspended'];

/** Read the suspension record of an account row (or of an id). */
function user_suspension_state(?array $user): array
{
    if ($user === null) {
        return [
            'suspended'    => false,
            'status'       => 'active',
            'reason'       => '',
            'suspendedAt'  => '',
            'suspendedBy'  => '',
            'reinstatedAt' => '',
            'reinstatedBy' => '',
        ];
    }

    $status = (string)($user['account_status'] ?? 'active');
    $status = in_array($status, ACCOUNT_STATUSES, true) ? $status : 'active';

    // Historical agent profiles carry their own suspension flag; it still counts.
    if ($status !== 'suspended' && (string)($user['role'] ?? '') === 'agent') {
        $profile = find_agent_profile_by_user((string)($user['id'] ?? ''));
        if ($profile !== null && (string)($profile['account_status'] ?? '') === 'suspended') {
            $status = 'suspended';
        }
    }

    return [
        'suspended'    => $status === 'suspended',
        'status'       => $status,
        'reason'       => (string)($user['suspension_reason'] ?? ''),
        'suspendedAt'  => to_iso($user['suspended_at'] ?? null),
        'suspendedBy'  => user_display_name((string)($user['suspended_by'] ?? '')),
        'reinstatedAt' => to_iso($user['reinstated_at'] ?? null),
        'reinstatedBy' => user_display_name((string)($user['reinstated_by'] ?? '')),
    ];
}

/** A stored administrator id, in the words the console shows. */
function user_display_name(string $userId): string
{
    $userId = trim($userId);
    if ($userId === '') {
        return '';
    }
    $row = find_user_by_id($userId);
    return $row !== null ? (string)($row['name'] ?? '') : '';
}

function user_is_suspended(?array $user): bool
{
    return user_suspension_state($user)['suspended'];
}

/**
 * Suspend an Agent or Landlord account.
 *
 * The reason is mandatory: the provider sees it, and the console records it.
 * Every listing the account currently advertises is unpublished immediately —
 * "suspension removes active properties from public visibility" is not
 * something that waits for the scheduled job.
 *
 * @return array{ok: bool, error?: string, fields?: array, user?: array, unpublished?: int}
 */
function suspend_provider(array $target, array $admin, string $reason): array
{
    $reason = trim($reason);
    $role = (string)($target['role'] ?? '');
    if ($role !== 'agent' && $role !== 'landlord') {
        return [
            'ok'     => false,
            'error'  => 'Only an Agent or Landlord account can be suspended here.',
            'fields' => ['role' => 'Tenant and administrator accounts are not provider accounts.'],
        ];
    }
    if (mb_strlen($reason) < 10) {
        return [
            'ok'     => false,
            'error'  => 'Record the reason for the suspension (at least 10 characters). The provider is shown this.',
            'fields' => ['reason' => 'Explain why the account is being suspended.'],
        ];
    }
    if ((string)($target['id'] ?? '') === (string)($admin['id'] ?? '')) {
        return [
            'ok'     => false,
            'error'  => 'An administrator cannot suspend their own account.',
            'fields' => ['account' => 'Choose another account.'],
        ];
    }
    if (user_is_suspended($target)) {
        return [
            'ok'     => false,
            'error'  => 'This account is already suspended.',
            'fields' => ['account' => 'Reinstate it first if the suspension should change.'],
        ];
    }

    $userId = (string)$target['id'];
    db_exec(
        'UPDATE users
            SET account_status = :status, suspension_reason = :reason, suspended_at = :at,
                suspended_by = :by, reinstated_at = NULL, reinstated_by = NULL, updated_at = :updated
          WHERE id = :id',
        [
            ':status'  => 'suspended',
            ':reason'  => clean_string($reason, 500),
            ':at'      => db_now(),
            ':by'      => (string)($admin['id'] ?? ''),
            ':updated' => db_now(),
            ':id'      => $userId,
        ]
    );

    // The agent profile carries the same flag for the screens that read it.
    if ($role === 'agent') {
        $profile = find_agent_profile_by_user($userId);
        if ($profile !== null) {
            db_exec(
                'UPDATE agent_profiles SET account_status = :status, updated_at = :updated WHERE user_id = :id',
                [':status' => 'suspended', ':updated' => db_now(), ':id' => $userId]
            );
        }
    }

    $unpublished = unpublish_provider_listings($target, $admin, $reason);

    $fresh = find_user_by_id($userId) ?? $target;
    $identityRow = find_identity_verification($userId);
    $identityStatus = $identityRow !== null ? (string)($identityRow['status'] ?? 'none') : 'none';

    audit_log('provider.suspended', 'user', $userId, [
        'reason'           => clean_string($reason, 500),
        'listingsUnpublished' => $unpublished,
        'identityVerification' => (string)($identityStatus ?? 'none'),
    ], $admin);

    notify_suspended_provider($fresh, $reason);
    notify_provider_suspension_staff($fresh, 'suspended', $reason, $unpublished);

    return ['ok' => true, 'user' => $fresh, 'unpublished' => $unpublished];
}

/**
 * Unpublish everything the account advertises.
 *
 * The property status becomes `suspended` (not `deactivated`, not `expired`), so
 * the record shows why it left public view and reinstatement can find it again.
 */
function unpublish_provider_listings(array $provider, array $admin, string $reason): int
{
    $userId = (string)$provider['id'];
    $rows = db_all(
        "SELECT * FROM properties WHERE (landlord_id = :id OR submitted_by_user_id = :id) AND status = 'active'",
        [':id' => $userId]
    );

    $count = 0;
    foreach ($rows as $row) {
        db_exec(
            "UPDATE properties SET status = 'suspended', updated_at = :updated WHERE id = :id AND status = 'active'",
            [':updated' => db_now(), ':id' => (string)$row['id']]
        );
        record_property_availability_event(
            (string)$row['id'],
            'suspended_by_admin',
            ['role' => 'admin', 'id' => (string)($admin['id'] ?? ''), 'name' => (string)($admin['name'] ?? '')],
            'admin_console',
            $reason,
            availability_cycle_key($row)
        );
        audit_log('property.availability_unpublished_suspension', 'property', (string)$row['id'], [
            'provider' => $userId,
            'reason'   => clean_string($reason, 500),
        ], $admin);
        $count++;
    }

    return $count;
}

/**
 * Reinstate a suspended account.
 *
 * Verification is left exactly as it was (approved stays approved, revoked stays
 * revoked). Listings that suspension unpublished are handed back to the provider
 * as `expired` — "Availability confirmation required" — because a reinstated
 * provider must confirm each one before it becomes public again. Nothing is
 * republished automatically.
 *
 * @return array{ok: bool, error?: string, fields?: array, user?: array, awaitingConfirmation?: int}
 */
function reinstate_provider(array $target, array $admin, string $reason): array
{
    $reason = trim($reason);
    $role = (string)($target['role'] ?? '');
    if ($role !== 'agent' && $role !== 'landlord') {
        return [
            'ok'     => false,
            'error'  => 'Only an Agent or Landlord account can be reinstated here.',
            'fields' => ['role' => 'This account is not a provider account.'],
        ];
    }
    if (mb_strlen($reason) < 10) {
        return [
            'ok'     => false,
            'error'  => 'Record the reason for the reinstatement (at least 10 characters).',
            'fields' => ['reason' => 'Explain what changed.'],
        ];
    }
    if (!user_is_suspended($target)) {
        return [
            'ok'     => false,
            'error'  => 'This account is not suspended.',
            'fields' => ['account' => 'There is no suspension to lift.'],
        ];
    }

    $userId = (string)$target['id'];
    db_exec(
        'UPDATE users
            SET account_status = :status, reinstated_at = :at, reinstated_by = :by, updated_at = :updated
          WHERE id = :id',
        [
            ':status'  => 'active',
            ':at'      => db_now(),
            ':by'      => (string)($admin['id'] ?? ''),
            ':updated' => db_now(),
            ':id'      => $userId,
        ]
    );

    if ($role === 'agent') {
        db_exec(
            "UPDATE agent_profiles SET account_status = 'approved', updated_at = :updated WHERE user_id = :id",
            [':updated' => db_now(), ':id' => $userId]
        );
    }

    // Suspension-unpublished listings go back to the provider, one confirmation
    // each. They are NOT republished here: the business rule is explicit that a
    // reinstatement never restores public visibility on its own.
    $rows = db_all(
        "SELECT * FROM properties WHERE (landlord_id = :id OR submitted_by_user_id = :id) AND status = 'suspended'",
        [':id' => $userId]
    );
    foreach ($rows as $row) {
        db_exec(
            "UPDATE properties SET status = 'expired', updated_at = :updated WHERE id = :id AND status = 'suspended'",
            [':updated' => db_now(), ':id' => (string)$row['id']]
        );
        record_property_availability_event(
            (string)$row['id'],
            'reopened_after_reinstatement',
            ['role' => 'admin', 'id' => (string)($admin['id'] ?? ''), 'name' => (string)($admin['name'] ?? '')],
            'admin_console',
            $reason,
            availability_cycle_key($row) . ':' . gmdate('Y-m-d H:i:s')
        );
        audit_log('property.availability_reopened', 'property', (string)$row['id'], [
            'provider' => $userId,
            'note'     => 'Reinstatement does not republish; the provider must confirm availability.',
        ], $admin);
    }

    $fresh = find_user_by_id($userId) ?? $target;
    $identityRow = find_identity_verification($userId);
    $identityStatus = $identityRow !== null ? (string)($identityRow['status'] ?? 'none') : 'none';

    audit_log('provider.reinstated', 'user', $userId, [
        'reason'                  => clean_string($reason, 500),
        'listingsAwaitingConfirmation' => count($rows),
        'identityVerificationKept' => $identityStatus,
    ], $admin);

    notify_suspended_provider($fresh, '', true);
    notify_provider_suspension_staff($fresh, 'reinstated', $reason, count($rows));

    return ['ok' => true, 'user' => $fresh, 'awaitingConfirmation' => count($rows)];
}

/** The suspension notice itself: in-app, and one email per suspension event. */
function notify_suspended_provider(array $provider, string $reason, bool $reinstated = false): void
{
    $userId = (string)$provider['id'];
    $cycle = ($reinstated ? 'reinstated' : 'suspended') . ':' . gmdate('Y-m-d H:i:s');

    if ($reinstated) {
        create_notification(
            $userId,
            'Account reinstated',
            'Your account has been reinstated. You can list again. Each listing that was unpublished needs a fresh availability confirmation before it is public.',
            'success'
        );
        $email = (string)($provider['email'] ?? '');
        if ($email !== '' && valid_email($email) !== null
            && claim_alert_delivery('suspension_email', $userId, $userId, $cycle, $email)) {
            $body = '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e((string)($provider['name'] ?: 'there')) . ',</p>'
                . '<p style="color:#CBD5E1;font-size:14px;">Your Goodlucks Homes account has been reinstated. You can sign in and list properties again.</p>'
                . '<p style="color:#CBD5E1;font-size:14px;">Listings that were unpublished while your account was suspended are not public yet: open your dashboard and confirm each one is still available.</p>';
            send_email($email, (string)($provider['name'] ?? ''), 'Your Goodlucks Homes account has been reinstated', email_html_template('Account reinstated', $body), 'suspension_notice');
        }
        return;
    }

    create_notification(
        $userId,
        'Account suspended',
        'Your account has been suspended: ' . $reason . '. You can still sign in and see your records. Listings cannot be published while the suspension is in place.',
        'warning'
    );
    $email = (string)($provider['email'] ?? '');
    if ($email !== '' && valid_email($email) !== null
        && claim_alert_delivery('suspension_email', $userId, $userId, $cycle, $email)) {
        $body = '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e((string)($provider['name'] ?: 'there')) . ',</p>'
            . '<div style="background:#252A34;padding:16px;border-radius:8px;border-left:4px solid #FF2E63;margin:16px 0;">'
            . '<strong style="color:#FFFFFF;">Account suspended</strong><br>'
            . '<span style="color:#94A3B8;font-size:13px;">' . e($reason) . '</span>'
            . '</div>'
            . '<p style="color:#CBD5E1;font-size:14px;">Your listings have been removed from public view. Your records, photographs and history are kept. You can still sign in to view your account; contact Goodlucks Homes to resolve this.</p>';
        send_email($email, (string)($provider['name'] ?? ''), 'Your Goodlucks Homes account has been suspended', email_html_template('Account suspended', $body), 'suspension_notice');
    }
}

/** Administrators are told when a provider is suspended or reinstated. */
function notify_provider_suspension_staff(array $provider, string $event, string $reason, int $listings): void
{
    $userId = (string)$provider['id'];
    if (!claim_alert_delivery('suspension_staff', 'staff', $userId, $event . ':' . gmdate('Y-m-d H:i:s'), '')) {
        return;
    }
    $name = (string)($provider['name'] ?? 'A provider');
    $message = $event === 'suspended'
        ? $name . ' (' . strtoupper((string)$provider['role']) . ') was suspended. ' . $listings . ' live listing(s) were removed from public view.'
        : $name . ' (' . strtoupper((string)$provider['role']) . ') was reinstated. ' . $listings . ' listing(s) await a fresh availability confirmation.';
    foreach (db_all("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC" . db_limit_clause(20, 0)) as $adminRow) {
        create_notification((string)$adminRow['id'], 'Provider account ' . $event, $message, $event === 'suspended' ? 'warning' : 'success');
    }
}
