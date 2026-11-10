<?php
/**
 * Goodlucks Homes - administrator user directory, profiles and activity
 * (Upgrade 2 Phase 3: A11, A13, A14).
 *
 * Three read models, all built from records that already exist:
 *
 *   A11  GET /api/admin/users           search by name/email/phone, filter by
 *                                       role and verification, paged.
 *        GET /api/admin/users/:id       one profile summary.
 *   A13  GET /api/admin/users/:id/activity
 *                                       the real properties, favourites, rental
 *                                       requests and viewings of that account.
 *   A14  GET /api/admin/activity        recent activity across the platform.
 *
 * Rules that are not negotiable here:
 *
 *   - Nothing in this file ever returns a password hash. The columns are listed
 *     explicitly rather than `SELECT *`.
 *   - Identity documents are reported as "on file, N" only. No file name, no
 *     storage path, no URL: reading an identity file needs its own capability
 *     and its own audited endpoint (Increment D).
 *   - Counts and feeds are real rows. Nothing is estimated, sampled or invented.
 *   - An account's contact details are visible here because this is the staff
 *     console, not a public or provider-facing response.
 */

declare(strict_types=1);

/** Roles an administrator may filter the directory by. */
const USER_DIRECTORY_ROLES = ['tenant', 'landlord', 'agent', 'admin'];

/** Verification states offered by the directory. */
const USER_DIRECTORY_STATUSES = ['verified', 'unverified'];

/** Most rows one page of the directory will return. */
const USER_DIRECTORY_MAX_PER_PAGE = 100;

/**
 * May this account open the user directory? (A11)
 *
 * Administrators holding `can_manage_users`, and the primary administrator.
 * The flag is granted only from the server console, exactly like the other
 * capabilities, so it cannot be self-assigned over HTTP.
 */
function can_manage_users(?array $user = null): bool
{
    $user = $user ?? auth_user();
    if ($user === null || (string)($user['role'] ?? '') !== 'admin') {
        return false;
    }
    if (is_primary_admin($user)) {
        return true;
    }

    return (int)($user['can_manage_users'] ?? 0) === 1;
}

/** May this account read a user's activity history? (A13) */
function can_view_user_activity(?array $user = null): bool
{
    $user = $user ?? auth_user();
    if ($user === null || (string)($user['role'] ?? '') !== 'admin') {
        return false;
    }
    if (is_primary_admin($user)) {
        return true;
    }

    return (int)($user['can_view_user_activity'] ?? 0) === 1;
}

/** The console hint for the two directory capabilities. Endpoints re-check. */
function directory_capabilities(array $user): array
{
    return [
        'manageUsers'      => can_manage_users($user),
        'viewUserActivity' => can_view_user_activity($user),
    ];
}

/** CLI-only: there is deliberately no HTTP route that grants this capability. */
function set_user_directory_capabilities(string $userId, bool $manage, bool $activity): void
{
    db_exec(
        'UPDATE users SET can_manage_users = :manage, can_view_user_activity = :activity,
                          updated_at = :now
          WHERE id = :id AND role = :role',
        [
            ':manage'   => $manage ? 1 : 0,
            ':activity' => $activity ? 1 : 0,
            ':now'      => db_now(),
            ':id'       => $userId,
            ':role'     => 'admin',
        ]
    );
}

/**
 * Search clause for name, email address or phone number.
 *
 * The phone number is compared with its separators removed, so `0249000002`
 * finds `+233 24 900 0002`. Percent and underscore are stripped from the term
 * rather than escaped, because SQLite and MySQL do not agree on LIKE escaping.
 *
 * @return array{0: string, 1: array<string, string>}
 */
function directory_search_clause(string $query): array
{
    $query = trim($query);
    if ($query === '') {
        return ['', []];
    }

    $term = str_replace(['%', '_'], '', $query);
    $like = '%' . $term . '%';

    $sql = '(name LIKE :dir_name OR email LIKE :dir_email';
    $params = [':dir_name' => $like, ':dir_email' => $like];

    $digits = preg_replace('/\D+/', '', $query) ?? '';
    if (strlen($digits) >= 3) {
        $sql .= " OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE :dir_phone";
        $params[':dir_phone'] = '%' . $digits . '%';
    }

    return [$sql . ')', $params];
}

/**
 * One page of the user directory.
 *
 * @param array{q?: string, roles?: string[], status?: string} $filters
 * @return array{rows: array<int, array>, total: int, page: int, perPage: int}
 */
function list_admin_users(array $filters, int $page, int $perPage): array
{
    $where = [];
    $params = [];

    [$searchSql, $searchParams] = directory_search_clause((string)($filters['q'] ?? ''));
    if ($searchSql !== '') {
        $where[] = $searchSql;
        $params += $searchParams;
    }

    $roles = array_values(array_intersect((array)($filters['roles'] ?? []), USER_DIRECTORY_ROLES));
    if ($roles !== []) {
        $placeholders = [];
        foreach ($roles as $index => $role) {
            $placeholders[] = ':dir_role_' . $index;
            $params[':dir_role_' . $index] = $role;
        }
        $where[] = 'role IN (' . implode(', ', $placeholders) . ')';
    }

    $status = (string)($filters['status'] ?? '');
    if ($status === 'verified') {
        $where[] = 'is_verified = 1';
    } elseif ($status === 'unverified') {
        $where[] = 'is_verified = 0';
    }

    $clause = $where === [] ? '' : ' WHERE ' . implode(' AND ', $where);

    $total = (int)db_value('SELECT COUNT(*) FROM users' . $clause, $params);

    $perPage = max(1, min(USER_DIRECTORY_MAX_PER_PAGE, $perPage));
    $offset = (max(1, $page) - 1) * $perPage;

    $rows = db_all(
        'SELECT id, name, email, phone, role, provider_category, is_verified, created_at FROM users'
        . $clause
        . ' ORDER BY created_at DESC, id DESC'
        . db_limit_clause($perPage, $offset),
        $params
    );

    return [
        'rows'    => shape_directory_rows($rows),
        'total'   => $total,
        'page'    => max(1, $page),
        'perPage' => $perPage,
    ];
}

/**
 * Turn user rows into the console shape, with their real record counts.
 *
 * The counts are fetched for the whole page at once (five queries, not five per
 * row), so a page of 100 accounts costs the same as a page of 5.
 *
 * @param array<int, array> $rows
 * @return array<int, array>
 */
function shape_directory_rows(array $rows): array
{
    if ($rows === []) {
        return [];
    }

    $ids = array_map(static fn(array $row): string => (string)$row['id'], $rows);
    $emails = array_map(static fn(array $row): string => strtolower((string)$row['email']), $rows);

    $idPlaceholders = [];
    $idParams = [];
    foreach ($ids as $index => $id) {
        $idPlaceholders[] = ':dir_id_' . $index;
        $idParams[':dir_id_' . $index] = $id;
    }
    $idList = implode(', ', $idPlaceholders);

    $emailPlaceholders = [];
    $emailParams = [];
    foreach ($emails as $index => $email) {
        $emailPlaceholders[] = ':dir_email_' . $index;
        $emailParams[':dir_email_' . $index] = $email;
    }
    $emailList = implode(', ', $emailPlaceholders);

    // A listing is counted once for the account that owns it or submitted it,
    // even when both columns name the same person (a landlord's own listing).
    $ownerPlaceholders = [];
    $ownerParams = [];
    foreach ($ids as $index => $id) {
        $ownerPlaceholders[] = ':dir_owner_' . $index;
        $ownerParams[':dir_owner_' . $index] = $id;
    }
    $ownerList = implode(', ', $ownerPlaceholders);
    $idSet = array_fill_keys($ids, true);
    $propertySets = [];
    foreach (db_all(
        "SELECT id, landlord_id, submitted_by_user_id FROM properties
          WHERE landlord_id IN ($ownerList) OR submitted_by_user_id IN ($ownerList)",
        $ownerParams
    ) as $row) {
        foreach (['landlord_id', 'submitted_by_user_id'] as $column) {
            $owner = (string)($row[$column] ?? '');
            if ($owner !== '' && isset($idSet[$owner])) {
                $propertySets[$owner][(string)$row['id']] = true;
            }
        }
    }
    $properties = [];
    foreach ($propertySets as $owner => $set) {
        $properties[$owner] = count($set);
    }
    $saved = keyed_counts(
        db_all("SELECT user_id AS owner, COUNT(*) AS total FROM saved_properties WHERE user_id IN ($idList) GROUP BY user_id", $idParams)
    );
    $requests = keyed_counts(
        db_all("SELECT tenant_id AS owner, COUNT(*) AS total FROM tenant_requests WHERE tenant_id IN ($idList) GROUP BY tenant_id", $idParams)
    );
    $viewings = keyed_counts(
        db_all("SELECT tenant_user_id AS owner, COUNT(*) AS total FROM viewing_schedules WHERE tenant_user_id IN ($idList) GROUP BY tenant_user_id", $idParams)
    );
    $enquiries = keyed_counts(
        db_all("SELECT LOWER(email) AS owner, COUNT(*) AS total FROM enquiries WHERE LOWER(email) IN ($emailList) GROUP BY LOWER(email)", $emailParams)
    );

    $identity = [];
    foreach (db_all("SELECT user_id, status FROM identity_verifications WHERE user_id IN ($idList)", $idParams) as $row) {
        $identity[(string)$row['user_id']] = (string)$row['status'];
    }

    $documents = keyed_counts(
        db_all("SELECT user_id AS owner, COUNT(*) AS total FROM verification_documents WHERE user_id IN ($idList) GROUP BY user_id", $idParams)
    );

    $agentProfiles = [];
    foreach (db_all("SELECT user_id, account_status, can_submit_listings FROM agent_profiles WHERE user_id IN ($idList)", $idParams) as $row) {
        $agentProfiles[(string)$row['user_id']] = [
            'accountStatus'      => (string)$row['account_status'],
            'canSubmitListings'  => (int)$row['can_submit_listings'] === 1,
        ];
    }

    $shaped = [];
    foreach ($rows as $row) {
        $id = (string)$row['id'];
        $email = strtolower((string)$row['email']);

        $shaped[] = [
            'id'         => $id,
            'name'       => (string)$row['name'],
            'email'      => (string)$row['email'],
            'phone'      => (string)($row['phone'] ?? ''),
            'role'       => (string)$row['role'],
            // 'pending' while an Agent/Landlord account has not yet said which
            // it is; otherwise the stored classification.
            'providerCategory' => provider_category_state($row),
            'isVerified' => (int)($row['is_verified'] ?? 0) === 1,
            'createdAt'  => to_iso($row['created_at'] ?? null),
            'counts'     => [
                'properties' => (int)($properties[$id] ?? 0),
                'saved'      => (int)($saved[$id] ?? 0),
                'requests'   => (int)($requests[$id] ?? 0),
                'viewings'   => (int)($viewings[$id] ?? 0),
                'enquiries'  => (int)($enquiries[$email] ?? 0),
            ],
            'verification' => [
                'identityStatus'   => $identity[$id] ?? null,
                'documentsOnFile'  => (int)($documents[$id] ?? 0),
            ],
            'agentProfile' => $agentProfiles[$id] ?? null,
        ];
    }

    return $shaped;
}

/**
 * @param array<int, array> $rows rows with `owner` and `total`
 * @return array<string, int>
 */
function keyed_counts(array $rows): array
{
    $map = [];
    foreach ($rows as $row) {
        $map[(string)$row['owner']] = (int)$row['total'];
    }

    return $map;
}

/**
 * One account, with the summary the profile screen shows.
 *
 * Returns null when the account does not exist. Never includes `password_hash`.
 */
function admin_user_summary(string $userId): ?array
{
    $row = db_one(
        'SELECT id, name, email, phone, role, provider_category, is_verified, company, address, created_at, updated_at
           FROM users WHERE id = :id',
        [':id' => $userId]
    );
    if ($row === null) {
        return null;
    }

    $shaped = shape_directory_rows([$row])[0];

    $lastActivity = db_one(
        'SELECT created_at FROM audit_logs WHERE actor_id = :id ORDER BY created_at DESC' . db_limit_clause(1, 0),
        [':id' => $userId]
    );

    $shaped['company'] = (string)($row['company'] ?? '');
    $shaped['address'] = (string)($row['address'] ?? '');
    $shaped['lastActiveAt'] = $lastActivity !== null ? to_iso($lastActivity['created_at']) : null;
    // Upgrade 2 correction: an Agent/Landlord account says which it is during
    // verification, so staff need to see 'pending' — an account that has not
    // chosen yet is not the same as one that chose Agent.
    $shaped['providerCategory'] = provider_category_state($row);

    // Landlord / provider state, derived from real records. "Listing approved"
    // and "identity verified" stay separate, exactly as in Agent Accounts.
    if ((string)$row['role'] === 'landlord') {
        $listing = db_one(
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
              FROM properties WHERE landlord_id = :id",
            [':id' => $userId]
        );
        $shaped['landlordState'] = [
            'listings'        => (int)($listing['total'] ?? 0),
            'activeListings'  => (int)($listing['active'] ?? 0),
            'pendingListings' => (int)($listing['pending'] ?? 0),
        ];
    }

    return $shaped;
}

/**
 * The real history of one account (A13).
 *
 * Every entry is a stored row with its own timestamp. Nothing is summarised
 * away and nothing is invented. Documents are a count only.
 *
 * @return array<int, array{kind: string, id: string, title: string, status: string, at: string}>
 */
function admin_user_activity(string $userId, int $limit = 50): array
{
    $limit = max(1, min(200, $limit));
    $email = (string)db_value('SELECT email FROM users WHERE id = :id', [':id' => $userId]);

    $entries = [];

    foreach (db_all(
        'SELECT id, title, status, created_at FROM properties
          WHERE landlord_id = :id OR submitted_by_user_id = :id
          ORDER BY created_at DESC' . db_limit_clause($limit, 0),
        [':id' => $userId]
    ) as $row) {
        $entries[] = [
            'kind'   => 'property',
            'id'     => (string)$row['id'],
            'title'  => (string)$row['title'],
            'status' => (string)$row['status'],
            'at'     => to_iso($row['created_at']),
        ];
    }

    foreach (db_all(
        'SELECT p.title AS title, s.created_at AS created_at
           FROM saved_properties s JOIN properties p ON p.id = s.property_id
          WHERE s.user_id = :id ORDER BY s.created_at DESC' . db_limit_clause($limit, 0),
        [':id' => $userId]
    ) as $row) {
        $entries[] = [
            'kind'   => 'saved',
            'id'     => '',
            'title'  => (string)$row['title'],
            'status' => 'saved',
            'at'     => to_iso($row['created_at']),
        ];
    }

    foreach (db_all(
        'SELECT id, preferred_locations, status, created_at FROM tenant_requests
          WHERE tenant_id = :id ORDER BY created_at DESC' . db_limit_clause($limit, 0),
        [':id' => $userId]
    ) as $row) {
        $locations = implode(', ', json_column($row['preferred_locations'] ?? null));
        $entries[] = [
            'kind'   => 'request',
            'id'     => (string)$row['id'],
            'title'  => $locations !== '' ? 'Rental request: ' . $locations : 'Rental request',
            'status' => (string)$row['status'],
            'at'     => to_iso($row['created_at']),
        ];
    }

    foreach (db_all(
        'SELECT id, property_title, date, status, created_at FROM viewing_schedules
          WHERE tenant_user_id = :id ORDER BY created_at DESC' . db_limit_clause($limit, 0),
        [':id' => $userId]
    ) as $row) {
        $entries[] = [
            'kind'   => 'viewing',
            'id'     => (string)$row['id'],
            'title'  => 'Viewing: ' . (string)$row['property_title'] . ' on ' . (string)$row['date'],
            'status' => (string)$row['status'],
            'at'     => to_iso($row['created_at']),
        ];
    }

    if ($email !== '') {
        foreach (db_all(
            'SELECT id, COALESCE(property_title, "Website enquiry") AS title, status, created_at
               FROM enquiries WHERE LOWER(email) = :email ORDER BY created_at DESC' . db_limit_clause($limit, 0),
            [':email' => strtolower($email)]
        ) as $row) {
            $entries[] = [
                'kind'   => 'enquiry',
                'id'     => (string)$row['id'],
                'title'  => (string)$row['title'],
                'status' => (string)$row['status'],
                'at'     => to_iso($row['created_at']),
            ];
        }
    }

    // Upgrade 2 (E2): staff actions *about* this account belong in its history
    // too, not only the actions it performed. A correction of someone's
    // classification is exactly the kind of decision a reviewer later needs to
    // see next to the account it changed.
    foreach (db_all(
        'SELECT id, action, entity_type, entity_id, created_at FROM audit_logs
          WHERE actor_id = :id
             OR (entity_type = :user_entity AND entity_id = :id)
          ORDER BY created_at DESC' . db_limit_clause($limit * 2, 0),
        [':id' => $userId, ':user_entity' => 'user']
    ) as $row) {
        $entries[] = [
            'kind'   => 'action',
            'id'     => (string)($row['entity_id'] ?? ''),
            'title'  => activity_action_title((string)$row['action'], (string)$row['entity_type']),
            'status' => (string)$row['action'],
            'at'     => to_iso($row['created_at']),
        ];
    }

    usort($entries, static fn(array $a, array $b): int => strcmp($b['at'], $a['at']));

    return array_slice($entries, 0, $limit);
}

/**
 * Recent platform activity for the dashboard (A14).
 *
 * Built from the records themselves — registrations, listings, enquiries,
 * rental requests, viewings — plus the audit trail for staff decisions. Each
 * entry names the console tab it belongs to, so it can be opened.
 *
 * @return array<int, array>
 */
function admin_activity_feed(int $limit = 20): array
{
    $limit = max(1, min(100, $limit));
    $entries = [];

    foreach (db_all('SELECT id, name, role, created_at FROM users ORDER BY created_at DESC' . db_limit_clause($limit, 0)) as $row) {
        $entries[] = [
            'kind'   => 'user',
            'id'     => (string)$row['id'],
            'title'  => (string)$row['name'] . ' registered as ' . (string)$row['role'],
            'detail' => '',
            'actor'  => (string)$row['name'],
            'tab'    => 'users',
            'at'     => to_iso($row['created_at']),
        ];
    }

    foreach (db_all('SELECT id, title, status, location, created_at FROM properties ORDER BY created_at DESC' . db_limit_clause($limit, 0)) as $row) {
        $entries[] = [
            'kind'   => 'property',
            'id'     => (string)$row['id'],
            'title'  => 'Listing submitted: ' . (string)$row['title'],
            'detail' => (string)$row['location'] . ' · ' . (string)$row['status'],
            'actor'  => '',
            'tab'    => 'listings',
            'at'     => to_iso($row['created_at']),
        ];
    }

    foreach (db_all('SELECT id, name, COALESCE(property_title, "Website enquiry") AS subject, status, created_at FROM enquiries ORDER BY created_at DESC' . db_limit_clause($limit, 0)) as $row) {
        $entries[] = [
            'kind'   => 'enquiry',
            'id'     => (string)$row['id'],
            'title'  => 'Web inquiry from ' . (string)$row['name'],
            'detail' => (string)$row['subject'] . ' · ' . (string)$row['status'],
            'actor'  => (string)$row['name'],
            'tab'    => 'enquiries',
            'at'     => to_iso($row['created_at']),
        ];
    }

    foreach (db_all('SELECT id, tenant_name, preferred_locations, status, created_at FROM tenant_requests ORDER BY created_at DESC' . db_limit_clause($limit, 0)) as $row) {
        $locations = implode(', ', json_column($row['preferred_locations'] ?? null));
        $entries[] = [
            'kind'   => 'request',
            'id'     => (string)$row['id'],
            'title'  => 'Rental request from ' . (string)$row['tenant_name'],
            'detail' => ($locations !== '' ? $locations . ' · ' : '') . (string)$row['status'],
            'actor'  => (string)$row['tenant_name'],
            'tab'    => 'matching',
            'at'     => to_iso($row['created_at']),
        ];
    }

    foreach (db_all('SELECT id, tenant_name, property_title, date, status, created_at FROM viewing_schedules ORDER BY created_at DESC' . db_limit_clause($limit, 0)) as $row) {
        $entries[] = [
            'kind'   => 'viewing',
            'id'     => (string)$row['id'],
            'title'  => 'Viewing requested: ' . (string)$row['property_title'],
            'detail' => (string)$row['date'] . ' · ' . (string)$row['status'],
            'actor'  => (string)$row['tenant_name'],
            'tab'    => 'viewings',
            'at'     => to_iso($row['created_at']),
        ];
    }

    foreach (db_all(
        'SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at, u.name AS actor_name
           FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
          ORDER BY a.created_at DESC' . db_limit_clause($limit, 0)
    ) as $row) {
        $entries[] = [
            'kind'   => 'action',
            'id'     => (string)($row['entity_id'] ?? ''),
            'title'  => activity_action_title((string)$row['action'], (string)$row['entity_type']),
            'detail' => (string)($row['actor_name'] ?? 'System'),
            'actor'  => (string)($row['actor_name'] ?? ''),
            'tab'    => activity_tab_for_entity((string)$row['entity_type']),
            'at'     => to_iso($row['created_at']),
        ];
    }

    usort($entries, static fn(array $a, array $b): int => strcmp($b['at'], $a['at']));

    return array_slice($entries, 0, $limit);
}

/** A readable sentence for a dotted audit action. */
function activity_action_title(string $action, string $entityType): string
{
    $labels = [
        'property.status_changed'        => 'Listing status changed',
        'property.featured_changed'      => 'Listing featured or unfeatured',
        'property.verification_changed'  => 'Listing verification changed',
        'property.agent_submitted'       => 'Agent submitted a listing',
        'property.deleted'               => 'Listing deleted',
        'viewing.agent_assigned'         => 'Viewing assigned to an agent',
        'viewing.corrected'              => 'Viewing corrected',
        'enquiry.status_changed'         => 'Inquiry status changed',
        'agent.status_changed'           => 'Agent account decision',
        'agent.registered'               => 'Agent registered',
        'agent.profile_updated'          => 'Agent profile updated',
        'verification.identity_decided'  => 'Identity verification decided',
        'verification.professional_decided' => 'Professional authorisation decided',
        'verification.document_reviewed' => 'Verification document reviewed',
        'document.uploaded'              => 'Document uploaded',
        'document.viewed'                => 'Identity document opened',
        'document.deleted'               => 'Document deleted',
        'finance.remittance_confirmed'   => 'Remittance confirmed',
        'finance.remittance_reversed'    => 'Remittance reversed',
        'finance.commission_created'     => 'Commission recorded',
        'finance.commission_paid'        => 'Commission paid',
        'blog.post_created'              => 'Blog post created',
        'blog.post_updated'              => 'Blog post updated',
        'blog.post_status_changed'       => 'Blog post status changed',
        'email_template.updated'         => 'Email template updated',
        'campaign.created'               => 'Bulk email drafted',
        'campaign.queued'                => 'Bulk email queued',
        'user.capabilities_changed'      => 'Staff capabilities changed',
        'user.role_corrected'            => 'Account type corrected by staff',
    ];

    if (isset($labels[$action])) {
        return $labels[$action];
    }

    $readable = str_replace(['.', '_'], ' ', $action);

    return ucfirst($readable !== '' ? $readable : $entityType . ' activity');
}

/** Which console tab owns an entity type. */
function activity_tab_for_entity(string $entityType): string
{
    return match ($entityType) {
        'property'               => 'listings',
        'enquiry'                => 'enquiries',
        'viewing', 'viewing_fee' => 'viewings',
        'agent_profile', 'agent' => 'agents',
        'identity_verification', 'verification_document', 'professional_authorisation' => 'verification',
        'fee_policy', 'remittance', 'commission' => 'finance',
        'blog_post', 'blog_category' => 'blog',
        'email_template'         => 'emailTemplates',
        'campaign'               => 'bulkEmail',
        'user'                   => 'users',
        default                  => 'dashboard',
    };
}
