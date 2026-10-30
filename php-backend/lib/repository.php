<?php
/**
 * Goodlucks Homes - Data access layer & API shaping
 *
 * Every query uses PDO prepared statements. The SQL is kept to a portable
 * subset so the same code runs against MySQL (production) and SQLite (tests).
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Shaping: database rows -> JSON shapes consumed by the React client
// ---------------------------------------------------------------------------

function shape_property(array $row): array
{
    $landlordName = trim((string)($row['landlord_name'] ?? ''));
    if ($landlordName === '') {
        $landlordName = 'Goodlucks Partner Landlord';
    }

    return [
        'id'                      => (string)$row['id'],
        'landlordId'              => (string)($row['landlord_id'] ?? ''),
        'isLandlordVerified'      => (bool)($row['is_landlord_verified'] ?? true),
        'landlordName'            => $landlordName,
        'landlordCompany'         => (string)($row['landlord_company'] ?? ''),
        'title'                   => (string)$row['title'],
        'location'                => (string)$row['location'],
        'city'                    => (string)($row['city'] ?? 'Accra'),
        'rentGhs'                 => (float)$row['rent_ghs'],
        'bedrooms'                => (int)$row['bedrooms'],
        'bathrooms'               => (int)$row['bathrooms'],
        'propertyType'            => (string)$row['property_type'],
        'status'                  => (string)$row['status'],
        'images'                  => json_column($row['images'] ?? null),
        'description'             => (string)($row['description'] ?? ''),
        'amenities'               => json_column($row['amenities'] ?? null),
        'nearbyPlaces'            => json_column($row['nearby_places'] ?? null),
        'availability'            => (string)($row['availability'] ?? 'Available Now'),
        'featured'                => (bool)($row['featured'] ?? false),
        'viewsCount'              => (int)($row['views_count'] ?? 0),
        'enquiriesCount'          => (int)($row['enquiries_count'] ?? 0),
        'createdAt'               => to_iso($row['created_at'] ?? null),
        'updatedAt'               => to_iso($row['updated_at'] ?? null),
    ];
}

function shape_tenant_request(array $row): array
{
    return [
        'id'                   => (string)$row['id'],
        'tenantId'             => (string)($row['tenant_id'] ?? ''),
        'tenantName'           => (string)$row['tenant_name'],
        'tenantPhone'          => (string)$row['tenant_phone'],
        'tenantEmail'          => (string)$row['tenant_email'],
        'preferredLocations'   => json_column($row['preferred_locations'] ?? null),
        'budgetMin'            => (float)$row['budget_min'],
        'budgetMax'            => (float)$row['budget_max'],
        'bedrooms'             => (int)$row['bedrooms'],
        'bathrooms'            => (int)$row['bathrooms'],
        'propertyType'         => (string)$row['property_type'],
        'moveInDate'           => (string)($row['move_in_date'] ?? ''),
        'status'               => (string)$row['status'],
        'matchedPropertyIds'   => json_column($row['matched_property_ids'] ?? null),
        'assignedAgent'        => (string)($row['assigned_agent'] ?? ''),
        'notes'                => (string)($row['notes'] ?? ''),
        'createdAt'            => to_iso($row['created_at'] ?? null),
    ];
}

function shape_viewing(array $row): array
{
    return [
        'id'               => (string)$row['id'],
        'tenantRequestId'  => (string)($row['tenant_request_id'] ?? ''),
        'tenantName'       => (string)$row['tenant_name'],
        'tenantPhone'      => (string)$row['tenant_phone'],
        'tenantEmail'      => (string)($row['tenant_email'] ?? ''),
        'propertyId'       => (string)($row['property_id'] ?? ''),
        'propertyTitle'    => (string)$row['property_title'],
        'propertyLocation' => (string)$row['property_location'],
        'date'             => (string)$row['date'],
        'time'             => (string)$row['time'],
        'assignedAgent'    => (string)($row['assigned_agent'] ?? ''),
        'status'           => (string)$row['status'],
        'viewingFeePaid'   => (bool)($row['viewing_fee_paid'] ?? false),
        'feeAmountGhs'     => (float)($row['fee_amount_ghs'] ?? VIEWING_FEE_GHS),
        'outcomeNotes'     => (string)($row['outcome_notes'] ?? ''),
        'createdAt'        => to_iso($row['created_at'] ?? null),
    ];
}

function shape_enquiry(array $row): array
{
    return [
        'id'           => (string)$row['id'],
        'propertyId'   => (string)($row['property_id'] ?? ''),
        'propertyTitle'=> (string)($row['property_title'] ?? ''),
        'name'         => (string)$row['name'],
        'email'        => (string)$row['email'],
        'phone'        => (string)($row['phone'] ?? ''),
        'message'      => (string)$row['message'],
        'source'       => (string)($row['source'] ?? 'contact_form'),
        'status'       => (string)($row['status'] ?? 'new'),
        'createdAt'    => to_iso($row['created_at'] ?? null),
    ];
}

function shape_agreement(array $row): array
{
    return [
        'id'                     => (string)$row['id'],
        'propertyId'             => (string)($row['property_id'] ?? ''),
        'propertyTitle'          => (string)$row['property_title'],
        'propertyAddress'        => (string)$row['property_address'],
        'city'                   => (string)($row['city'] ?? 'Accra'),
        'landlordName'           => (string)$row['landlord_name'],
        'landlordPhone'          => (string)$row['landlord_phone'],
        'landlordGhanaCard'      => (string)($row['landlord_ghana_card'] ?? ''),
        'tenantName'             => (string)$row['tenant_name'],
        'tenantPhone'            => (string)$row['tenant_phone'],
        'tenantGhanaCard'        => (string)($row['tenant_ghana_card'] ?? ''),
        'monthlyRentGhs'         => (float)$row['monthly_rent_ghs'],
        'durationMonths'         => (int)$row['duration_months'],
        'totalRentGhs'           => (float)$row['total_rent_ghs'],
        'securityDepositGhs'     => (float)$row['security_deposit_ghs'],
        'startDate'              => (string)$row['start_date'],
        'endDate'                => (string)$row['end_date'],
        'noticePeriodMonths'     => (int)$row['notice_period_months'],
        'utilitiesResponsibility'=> (string)($row['utilities_responsibility'] ?? ''),
        'landlordSigned'         => (bool)$row['landlord_signed'],
        'tenantSigned'           => (bool)$row['tenant_signed'],
        'landlordSignatureDate'  => (string)($row['landlord_signature_date'] ?? ''),
        'tenantSignatureDate'    => (string)($row['tenant_signature_date'] ?? ''),
        'witnessName'            => (string)($row['witness_name'] ?? ''),
        'status'                 => (string)$row['status'],
        'verificationCode'       => (string)$row['verification_code'],
        'createdAt'              => to_iso($row['created_at'] ?? null),
    ];
}

function shape_receipt(array $row): array
{
    return [
        'id'               => (string)$row['id'],
        'receiptNo'        => (string)$row['receipt_no'],
        'propertyTitle'    => (string)$row['property_title'],
        'propertyAddress'  => (string)$row['property_address'],
        'tenantName'       => (string)$row['tenant_name'],
        'tenantPhone'      => (string)($row['tenant_phone'] ?? ''),
        'landlordName'     => (string)$row['landlord_name'],
        'amountGhs'        => (float)$row['amount_ghs'],
        'amountInWords'    => (string)($row['amount_in_words'] ?? ''),
        'paymentPurpose'   => (string)($row['payment_purpose'] ?? ''),
        'paymentMethod'    => (string)($row['payment_method'] ?? 'Cash'),
        'transactionRef'   => (string)($row['transaction_ref'] ?? ''),
        'paymentDate'      => (string)$row['payment_date'],
        'issuedBy'         => (string)($row['issued_by'] ?? ''),
        'verificationCode' => (string)$row['verification_code'],
        'createdAt'        => to_iso($row['created_at'] ?? null),
    ];
}

function shape_search_alert(array $row): array
{
    return [
        'id'           => (string)$row['id'],
        'email'        => (string)$row['email'],
        'name'         => (string)($row['name'] ?? ''),
        'phone'        => (string)($row['phone'] ?? ''),
        'location'     => (string)($row['location'] ?? 'All'),
        'propertyType' => (string)($row['property_type'] ?? 'All'),
        'bedrooms'     => $row['bedrooms'] === null ? 'All' : (int)$row['bedrooms'],
        'maxRentGhs'   => (float)$row['max_rent_ghs'],
        'searchQuery'  => (string)($row['search_query'] ?? ''),
        'frequency'    => (string)$row['frequency'],
        'channels'     => json_column($row['channels'] ?? null),
        'active'       => (bool)$row['active'],
        'createdAt'    => to_iso($row['created_at'] ?? null),
    ];
}

function shape_notification(array $row): array
{
    return [
        'id'        => (string)$row['id'],
        'userId'    => (string)($row['user_id'] ?? ''),
        'title'     => (string)$row['title'],
        'message'   => (string)$row['message'],
        'type'      => (string)($row['type'] ?? 'info'),
        'read'      => (bool)($row['is_read'] ?? false),
        'createdAt' => to_iso($row['created_at'] ?? null),
    ];
}

function shape_email_log(array $row): array
{
    return [
        'id'             => (string)$row['id'],
        'recipientEmail' => (string)$row['recipient_email'],
        'recipientName'  => (string)($row['recipient_name'] ?? ''),
        'subject'        => (string)$row['subject'],
        'type'           => (string)$row['type'],
        'bodyPreview'    => (string)($row['body_preview'] ?? ''),
        'sentAt'         => to_iso($row['sent_at'] ?? null),
        'status'         => (string)($row['status'] ?? 'queued'),
    ];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
function create_notification(string $userId, string $title, string $message, string $type = 'info'): void
{
    try {
        db_exec(
            'INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
             VALUES (:id, :user_id, :title, :message, :type, 0, :created)',
            [
                ':id'      => new_id('notif'),
                ':user_id' => $userId,
                ':title'   => clean_string($title, 200),
                ':message' => clean_text($message, 800),
                ':type'    => one_of($type, ['info', 'success', 'warning', 'viewing'], 'info'),
                ':created' => db_now(),
            ]
        );
    } catch (Throwable $e) {
        gl_log('error', 'Failed to create notification: ' . $e->getMessage());
    }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
function find_user_by_email(string $email): ?array
{
    return db_one('SELECT * FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1', [':email' => $email]);
}

function find_user_by_id(string $id): ?array
{
    return db_one('SELECT * FROM users WHERE id = :id LIMIT 1', [':id' => $id]);
}

function create_user(array $data): array
{
    $id = new_id('user');
    db_exec(
        'INSERT INTO users (id, email, name, role, phone, password_hash, avatar, address, company, bio,
                            is_verified, preferred_locations, budget_min, budget_max, preferred_bedrooms,
                            additional_notes, created_at, updated_at)
         VALUES (:id, :email, :name, :role, :phone, :password_hash, :avatar, :address, :company, :bio,
                 :verified, :locations, :budget_min, :budget_max, :bedrooms, :notes, :created, :updated)',
        [
            ':id'            => $id,
            ':email'         => $data['email'],
            ':name'          => $data['name'],
            ':role'          => $data['role'],
            ':phone'         => $data['phone'],
            ':password_hash' => $data['password_hash'],
            ':avatar'        => $data['avatar'] ?? '',
            ':address'       => $data['address'] ?? '',
            ':company'       => $data['company'] ?? '',
            ':bio'           => $data['bio'] ?? '',
            ':verified'      => $data['role'] === 'landlord' ? 1 : 0,
            ':locations'     => json_encode($data['preferred_locations'] ?? []),
            ':budget_min'    => $data['budget_min'] ?? null,
            ':budget_max'    => $data['budget_max'] ?? null,
            ':bedrooms'      => $data['preferred_bedrooms'] ?? null,
            ':notes'         => $data['additional_notes'] ?? '',
            ':created'       => db_now(),
            ':updated'       => db_now(),
        ]
    );
    $user = find_user_by_id($id);
    if (!$user) {
        throw new RuntimeException('User could not be created');
    }
    return $user;
}

function update_user(string $id, array $fields): void
{
    $allowed = [
        'name'                => 'name',
        'phone'               => 'phone',
        'avatar'              => 'avatar',
        'address'             => 'address',
        'bio'                 => 'bio',
        'company'             => 'company',
        'preferred_locations' => 'preferred_locations',
        'budget_min'          => 'budget_min',
        'budget_max'          => 'budget_max',
        'preferred_bedrooms'  => 'preferred_bedrooms',
        'additional_notes'    => 'additional_notes',
        'password_hash'       => 'password_hash',
    ];

    $set = [];
    $params = [':id' => $id];
    foreach ($allowed as $key => $column) {
        if (array_key_exists($key, $fields)) {
            $set[] = $column . ' = :' . $column;
            $params[':' . $column] = $fields[$key];
        }
    }
    if (!$set) {
        return;
    }
    $set[] = 'updated_at = :updated';
    $params[':updated'] = db_now();

    db_exec('UPDATE users SET ' . implode(', ', $set) . ' WHERE id = :id', $params);
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------
function find_property(string $id): ?array
{
    return db_one('SELECT * FROM properties WHERE id = :id LIMIT 1', [':id' => $id]);
}

/**
 * Query properties.
 *
 * @param array $filters q, location, city, type, bedrooms, minRent, maxRent,
 *                       status (string|array), landlordId, featured, sort,
 *                       page, perPage
 * @return array{items: array, total: int, page: int, perPage: int}
 */
function query_properties(array $filters): array
{
    $where = [];
    $params = [];

    if (!empty($filters['status'])) {
        $statuses = is_array($filters['status']) ? $filters['status'] : [$filters['status']];
        $statuses = array_values(array_intersect($statuses, PROPERTY_STATUSES));
        if ($statuses) {
            $placeholders = [];
            foreach ($statuses as $i => $status) {
                $placeholders[] = ':status' . $i;
                $params[':status' . $i] = $status;
            }
            $where[] = 'status IN (' . implode(', ', $placeholders) . ')';
        }
    }

    if (!empty($filters['landlordId'])) {
        $where[] = 'landlord_id = :landlord_id';
        $params[':landlord_id'] = $filters['landlordId'];
    }

    if (!empty($filters['q'])) {
        $where[] = '(LOWER(title) LIKE :q OR LOWER(location) LIKE :q OR LOWER(description) LIKE :q OR LOWER(city) LIKE :q)';
        $params[':q'] = '%' . mb_strtolower($filters['q']) . '%';
    }

    if (!empty($filters['location'])) {
        $where[] = 'LOWER(location) LIKE :location';
        $params[':location'] = '%' . mb_strtolower($filters['location']) . '%';
    }

    if (!empty($filters['city'])) {
        $where[] = 'LOWER(city) LIKE :city';
        $params[':city'] = '%' . mb_strtolower($filters['city']) . '%';
    }

    if (!empty($filters['type']) && $filters['type'] !== 'All') {
        $where[] = 'property_type = :type';
        $params[':type'] = $filters['type'];
    }

    if (!empty($filters['bedrooms']) && $filters['bedrooms'] !== 'All') {
        $where[] = 'bedrooms >= :bedrooms';
        $params[':bedrooms'] = (int)$filters['bedrooms'];
    }

    if (isset($filters['minRent']) && $filters['minRent'] !== null && $filters['minRent'] !== '') {
        $where[] = 'rent_ghs >= :min_rent';
        $params[':min_rent'] = (float)$filters['minRent'];
    }

    if (isset($filters['maxRent']) && $filters['maxRent'] !== null && $filters['maxRent'] !== '') {
        $where[] = 'rent_ghs <= :max_rent';
        $params[':max_rent'] = (float)$filters['maxRent'];
    }

    if (!empty($filters['featured'])) {
        $where[] = 'featured = 1';
    }

    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    $sortMap = [
        'newest'     => 'created_at DESC',
        'oldest'     => 'created_at ASC',
        'price_asc'  => 'rent_ghs ASC, created_at DESC',
        'price_desc' => 'rent_ghs DESC, created_at DESC',
        'popular'    => 'views_count DESC, created_at DESC',
    ];
    $sort = $sortMap[$filters['sort'] ?? 'featured'] ?? 'featured DESC, created_at DESC';

    $total = (int)db_value('SELECT COUNT(*) FROM properties' . $whereSql, $params);

    $perPage = max(1, min(100, (int)($filters['perPage'] ?? 50)));
    $page = max(1, (int)($filters['page'] ?? 1));
    $offset = ($page - 1) * $perPage;

    $rows = db_all(
        'SELECT * FROM properties' . $whereSql . ' ORDER BY ' . $sort . db_limit_clause($perPage, $offset),
        $params
    );

    return [
        'items'   => array_map('shape_property', $rows),
        'total'   => $total,
        'page'    => $page,
        'perPage' => $perPage,
    ];
}

function increment_property_views(string $id): void
{
    db_exec('UPDATE properties SET views_count = views_count + 1 WHERE id = :id', [':id' => $id]);
}

function create_property(array $data): string
{
    $id = $data['id'] ?? new_id('prop');
    db_exec(
        'INSERT INTO properties (id, landlord_id, landlord_name, landlord_company, is_landlord_verified,
                                 title, location, city, rent_ghs, bedrooms, bathrooms, property_type,
                                 status, images, description, amenities, nearby_places, availability,
                                 featured, views_count, enquiries_count, created_at, updated_at)
         VALUES (:id, :landlord_id, :landlord_name, :landlord_company, :verified,
                 :title, :location, :city, :rent_ghs, :bedrooms, :bathrooms, :property_type,
                 :status, :images, :description, :amenities, :nearby_places, :availability,
                 :featured, 0, 0, :created, :updated)',
        [
            ':id'               => $id,
            ':landlord_id'      => $data['landlord_id'] ?? null,
            ':landlord_name'    => $data['landlord_name'] ?? '',
            ':landlord_company' => $data['landlord_company'] ?? '',
            ':verified'         => !empty($data['is_landlord_verified']) ? 1 : 0,
            ':title'            => $data['title'],
            ':location'         => $data['location'],
            ':city'             => $data['city'],
            ':rent_ghs'         => $data['rent_ghs'],
            ':bedrooms'         => $data['bedrooms'],
            ':bathrooms'        => $data['bathrooms'],
            ':property_type'    => $data['property_type'],
            ':status'           => $data['status'],
            ':images'           => json_encode($data['images'] ?? []),
            ':description'      => $data['description'] ?? '',
            ':amenities'        => json_encode($data['amenities'] ?? []),
            ':nearby_places'    => json_encode($data['nearby_places'] ?? []),
            ':availability'     => $data['availability'] ?? 'Available Now',
            ':featured'         => !empty($data['featured']) ? 1 : 0,
            ':created'          => db_now(),
            ':updated'          => db_now(),
        ]
    );
    return $id;
}

/**
 * Update a property. Only the provided keys change.
 */
function update_property(string $id, array $data): void
{
    $columns = [
        'title', 'location', 'city', 'rent_ghs', 'bedrooms', 'bathrooms', 'property_type',
        'status', 'images', 'description', 'amenities', 'nearby_places', 'availability',
        'featured', 'landlord_name', 'landlord_company', 'is_landlord_verified',
    ];
    $set = [];
    $params = [':id' => $id];

    foreach ($columns as $column) {
        if (!array_key_exists($column, $data)) {
            continue;
        }
        $value = $data[$column];
        if (in_array($column, ['images', 'amenities', 'nearby_places'], true)) {
            $value = json_encode($value);
        }
        if (in_array($column, ['featured', 'is_landlord_verified'], true)) {
            $value = $value ? 1 : 0;
        }
        $set[] = $column . ' = :' . $column;
        $params[':' . $column] = $value;
    }

    if (!$set) {
        return;
    }
    $set[] = 'updated_at = :updated';
    $params[':updated'] = db_now();

    db_exec('UPDATE properties SET ' . implode(', ', $set) . ' WHERE id = :id', $params);
}

function increment_property_enquiries(string $propertyId): void
{
    db_exec('UPDATE properties SET enquiries_count = enquiries_count + 1 WHERE id = :id', [':id' => $propertyId]);
}

// ---------------------------------------------------------------------------
// Saved properties
// ---------------------------------------------------------------------------
function list_saved_property_ids(string $userId): array
{
    $rows = db_all('SELECT property_id FROM saved_properties WHERE user_id = :u ORDER BY created_at DESC', [':u' => $userId]);
    return array_map(static fn($r) => (string)$r['property_id'], $rows);
}

function save_property_for_user(string $userId, string $propertyId): void
{
    try {
        db_exec(
            'INSERT INTO saved_properties (user_id, property_id, created_at) VALUES (:u, :p, :created)',
            [':u' => $userId, ':p' => $propertyId, ':created' => db_now()]
        );
    } catch (Throwable $e) {
        if (!db_is_unique_violation($e)) {
            throw $e;
        }
    }
}

function remove_saved_property(string $userId, string $propertyId): void
{
    db_exec('DELETE FROM saved_properties WHERE user_id = :u AND property_id = :p', [':u' => $userId, ':p' => $propertyId]);
}

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------
function create_enquiry(array $data): string
{
    $id = new_id('enq');
    db_exec(
        'INSERT INTO enquiries (id, property_id, property_title, name, email, phone, message, source, status, created_at)
         VALUES (:id, :property_id, :property_title, :name, :email, :phone, :message, :source, :status, :created)',
        [
            ':id'             => $id,
            ':property_id'    => $data['property_id'] ?: null,
            ':property_title' => $data['property_title'] ?? '',
            ':name'           => $data['name'],
            ':email'          => $data['email'],
            ':phone'          => $data['phone'] ?? '',
            ':message'        => $data['message'],
            ':source'         => $data['source'] ?? 'contact_form',
            ':status'         => 'new',
            ':created'        => db_now(),
        ]
    );
    return $id;
}

function list_enquiries(int $limit = 200): array
{
    $rows = db_all('SELECT * FROM enquiries ORDER BY created_at DESC' . db_limit_clause($limit, 0));
    return array_map('shape_enquiry', $rows);
}

// ---------------------------------------------------------------------------
// Tenant requests
// ---------------------------------------------------------------------------
function create_tenant_request(array $data): string
{
    $id = new_id('req');
    db_exec(
        'INSERT INTO tenant_requests (id, tenant_id, tenant_name, tenant_phone, tenant_email, preferred_locations,
                                      budget_min, budget_max, bedrooms, bathrooms, property_type, move_in_date,
                                      status, matched_property_ids, assigned_agent, notes, created_at)
         VALUES (:id, :tenant_id, :name, :phone, :email, :locations,
                 :budget_min, :budget_max, :bedrooms, :bathrooms, :type, :move_in,
                 :status, :matched, :agent, :notes, :created)',
        [
            ':id'          => $id,
            ':tenant_id'   => $data['tenant_id'] ?: null,
            ':name'        => $data['tenant_name'],
            ':phone'       => $data['tenant_phone'],
            ':email'       => $data['tenant_email'],
            ':locations'   => json_encode($data['preferred_locations'] ?? []),
            ':budget_min'  => $data['budget_min'],
            ':budget_max'  => $data['budget_max'],
            ':bedrooms'    => $data['bedrooms'],
            ':bathrooms'   => $data['bathrooms'],
            ':type'        => $data['property_type'],
            ':move_in'     => $data['move_in_date'] ?? '',
            ':status'      => 'submitted',
            ':matched'     => json_encode([]),
            ':agent'       => 'Goodlucks Intermediary Desk',
            ':notes'       => $data['notes'] ?? '',
            ':created'     => db_now(),
        ]
    );
    return $id;
}

/**
 * @param array $scope ['tenantId' => ..., 'email' => ...] or empty for all
 */
function list_tenant_requests(array $scope = [], int $limit = 200): array
{
    $where = [];
    $params = [];
    if (!empty($scope['tenantId'])) {
        $where[] = 'tenant_id = :tenant_id';
        $params[':tenant_id'] = $scope['tenantId'];
    } elseif (!empty($scope['email'])) {
        $where[] = 'LOWER(tenant_email) = LOWER(:email)';
        $params[':email'] = $scope['email'];
    }
    $sql = 'SELECT * FROM tenant_requests'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY created_at DESC' . db_limit_clause($limit, 0);
    return array_map('shape_tenant_request', db_all($sql, $params));
}

function find_tenant_request(string $id): ?array
{
    $row = db_one('SELECT * FROM tenant_requests WHERE id = :id LIMIT 1', [':id' => $id]);
    return $row ? shape_tenant_request($row) : null;
}

function update_tenant_request(string $id, array $fields): void
{
    $set = [];
    $params = [':id' => $id];
    if (isset($fields['status'])) {
        $set[] = 'status = :status';
        $params[':status'] = $fields['status'];
    }
    if (array_key_exists('matched_property_ids', $fields)) {
        $set[] = 'matched_property_ids = :matched';
        $params[':matched'] = json_encode($fields['matched_property_ids']);
    }
    if (!$set) {
        return;
    }
    db_exec('UPDATE tenant_requests SET ' . implode(', ', $set) . ' WHERE id = :id', $params);
}

// ---------------------------------------------------------------------------
// Viewings
// ---------------------------------------------------------------------------
function create_viewing(array $data): string
{
    $id = new_id('view');
    db_exec(
        'INSERT INTO viewing_schedules (id, tenant_request_id, tenant_name, tenant_phone, tenant_email, property_id,
                                       property_title, property_location, date, time, assigned_agent, status,
                                       viewing_fee_paid, fee_amount_ghs, outcome_notes, created_at)
         VALUES (:id, :req_id, :name, :phone, :email, :property_id,
                 :title, :location, :date, :time, :agent, :status,
                 :fee_paid, :fee_amount, :notes, :created)',
        [
            ':id'          => $id,
            ':req_id'      => $data['tenant_request_id'] ?: null,
            ':name'        => $data['tenant_name'],
            ':phone'       => $data['tenant_phone'],
            ':email'       => $data['tenant_email'] ?? '',
            ':property_id' => $data['property_id'] ?: null,
            ':title'       => $data['property_title'],
            ':location'    => $data['property_location'],
            ':date'        => $data['date'],
            ':time'        => $data['time'],
            ':agent'       => $data['assigned_agent'] ?? 'Goodlucks Field Agent',
            ':status'      => $data['status'] ?? 'scheduled',
            ':fee_paid'    => !empty($data['viewing_fee_paid']) ? 1 : 0,
            ':fee_amount'  => $data['fee_amount_ghs'] ?? VIEWING_FEE_GHS,
            ':notes'       => $data['outcome_notes'] ?? '',
            ':created'     => db_now(),
        ]
    );
    return $id;
}

function list_viewings(array $scope = [], int $limit = 200): array
{
    $where = [];
    $params = [];
    if (!empty($scope['tenantEmail'])) {
        $where[] = 'LOWER(tenant_email) = LOWER(:email)';
        $params[':email'] = $scope['tenantEmail'];
    }
    if (!empty($scope['propertyId'])) {
        $where[] = 'property_id = :property_id';
        $params[':property_id'] = $scope['propertyId'];
    }
    if (!empty($scope['landlordId'])) {
        $where[] = 'property_id IN (SELECT id FROM properties WHERE landlord_id = :landlord_id)';
        $params[':landlord_id'] = $scope['landlordId'];
    }
    $sql = 'SELECT * FROM viewing_schedules'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY created_at DESC' . db_limit_clause($limit, 0);
    return array_map('shape_viewing', db_all($sql, $params));
}

function find_viewing(string $id): ?array
{
    $row = db_one('SELECT * FROM viewing_schedules WHERE id = :id LIMIT 1', [':id' => $id]);
    return $row ? shape_viewing($row) : null;
}

function update_viewing(string $id, array $fields): void
{
    $set = [];
    $params = [':id' => $id];
    if (isset($fields['status'])) {
        $set[] = 'status = :status';
        $params[':status'] = $fields['status'];
    }
    if (array_key_exists('viewing_fee_paid', $fields)) {
        $set[] = 'viewing_fee_paid = :fee_paid';
        $params[':fee_paid'] = $fields['viewing_fee_paid'] ? 1 : 0;
    }
    if (array_key_exists('outcome_notes', $fields)) {
        $set[] = 'outcome_notes = :notes';
        $params[':notes'] = clean_text($fields['outcome_notes'], 1000);
    }
    if (array_key_exists('assigned_agent', $fields)) {
        $set[] = 'assigned_agent = :agent';
        $params[':agent'] = clean_string($fields['assigned_agent'], 200);
    }
    if (!$set) {
        return;
    }
    db_exec('UPDATE viewing_schedules SET ' . implode(', ', $set) . ' WHERE id = :id', $params);
}

// ---------------------------------------------------------------------------
// Price drop alerts
// ---------------------------------------------------------------------------
function upsert_price_alert(array $data): string
{
    $existing = db_one(
        'SELECT id FROM price_drop_alerts WHERE property_id = :property_id AND LOWER(email) = LOWER(:email) LIMIT 1',
        [':property_id' => $data['property_id'], ':email' => $data['email']]
    );

    if ($existing) {
        db_exec(
            'UPDATE price_drop_alerts
                SET target_rent_ghs = :target, current_rent_ghs = :current,
                    notify_on_any_drop = :any_drop, active = 1, name = :name
              WHERE id = :id',
            [
                ':target'   => $data['target_rent_ghs'],
                ':current'  => $data['current_rent_ghs'],
                ':any_drop' => $data['notify_on_any_drop'] ? 1 : 0,
                ':name'     => $data['name'] ?? '',
                ':id'       => $existing['id'],
            ]
        );
        return (string)$existing['id'];
    }

    $id = new_id('alert');
    db_exec(
        'INSERT INTO price_drop_alerts (id, property_id, property_title, property_location, current_rent_ghs,
                                        target_rent_ghs, email, name, notify_on_any_drop, active, created_at)
         VALUES (:id, :property_id, :title, :location, :current,
                 :target, :email, :name, :any_drop, 1, :created)',
        [
            ':id'          => $id,
            ':property_id' => $data['property_id'],
            ':title'       => $data['property_title'] ?? '',
            ':location'    => $data['property_location'] ?? '',
            ':current'     => $data['current_rent_ghs'] ?? 0,
            ':target'      => $data['target_rent_ghs'],
            ':email'       => $data['email'],
            ':name'        => $data['name'] ?? '',
            ':any_drop'    => $data['notify_on_any_drop'] ? 1 : 0,
            ':created'     => db_now(),
        ]
    );
    return $id;
}

function list_price_alerts(int $limit = 200): array
{
    return db_all('SELECT * FROM price_drop_alerts ORDER BY created_at DESC' . db_limit_clause($limit, 0));
}

// ---------------------------------------------------------------------------
// Search alerts
// ---------------------------------------------------------------------------
function create_search_alert(array $data): array
{
    $id = new_id('salert');
    db_exec(
        'INSERT INTO search_alerts (id, user_id, email, name, phone, location, property_type, bedrooms,
                                    max_rent_ghs, search_query, frequency, channels, active, created_at)
         VALUES (:id, :user_id, :email, :name, :phone, :location, :property_type, :bedrooms,
                 :max_rent, :query, :frequency, :channels, 1, :created)',
        [
            ':id'            => $id,
            ':user_id'       => $data['user_id'] ?: null,
            ':email'         => $data['email'],
            ':name'          => $data['name'] ?? '',
            ':phone'         => $data['phone'] ?? '',
            ':location'      => $data['location'] ?? 'All',
            ':property_type' => $data['property_type'] ?? 'All',
            ':bedrooms'      => $data['bedrooms'],
            ':max_rent'      => $data['max_rent_ghs'],
            ':query'         => $data['search_query'] ?? '',
            ':frequency'     => $data['frequency'] ?? 'instant',
            ':channels'      => json_encode($data['channels'] ?? ['email']),
            ':created'       => db_now(),
        ]
    );
    $row = db_one('SELECT * FROM search_alerts WHERE id = :id', [':id' => $id]);
    return $row ? shape_search_alert($row) : [];
}

function list_search_alerts(?array $user): array
{
    if ($user === null) {
        return [];
    }
    if (($user['role'] ?? '') === 'admin') {
        $rows = db_all('SELECT * FROM search_alerts ORDER BY created_at DESC' . db_limit_clause(200, 0));
    } else {
        $rows = db_all(
            'SELECT * FROM search_alerts WHERE user_id = :uid OR LOWER(email) = LOWER(:email) ORDER BY created_at DESC' . db_limit_clause(100, 0),
            [':uid' => $user['id'], ':email' => $user['email']]
        );
    }
    return array_map('shape_search_alert', $rows);
}

function delete_search_alert(string $id, array $user): bool
{
    $row = db_one('SELECT * FROM search_alerts WHERE id = :id LIMIT 1', [':id' => $id]);
    if (!$row) {
        return false;
    }
    $isOwner = (string)($row['user_id'] ?? '') === (string)$user['id']
        || strtolower((string)$row['email']) === strtolower((string)$user['email']);
    if (!$isOwner && ($user['role'] ?? '') !== 'admin') {
        error_response('You do not have permission to remove this alert.', 403);
    }
    db_exec('DELETE FROM search_alerts WHERE id = :id', [':id' => $id]);
    return true;
}

// ---------------------------------------------------------------------------
// Agreements & receipts
// ---------------------------------------------------------------------------
function create_agreement(array $data): array
{
    $id = new_id('agr');
    $code = 'GHL-AGR-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(3)));
    db_exec(
        'INSERT INTO tenancy_agreements (id, property_id, property_title, property_address, city, landlord_name,
                                         landlord_phone, landlord_ghana_card, tenant_name, tenant_phone, tenant_ghana_card,
                                         monthly_rent_ghs, duration_months, total_rent_ghs, security_deposit_ghs,
                                         start_date, end_date, notice_period_months, utilities_responsibility,
                                         landlord_signed, tenant_signed, landlord_signature_date, tenant_signature_date,
                                         witness_name, status, verification_code, created_at)
         VALUES (:id, :property_id, :title, :address, :city, :landlord_name,
                 :landlord_phone, :landlord_card, :tenant_name, :tenant_phone, :tenant_card,
                 :rent, :duration, :total, :deposit,
                 :start, :end, :notice, :utilities,
                 0, 0, NULL, NULL,
                 :witness, :status, :code, :created)',
        [
            ':id'            => $id,
            ':property_id'   => $data['property_id'] ?: null,
            ':title'         => $data['property_title'],
            ':address'       => $data['property_address'],
            ':city'          => $data['city'] ?? 'Accra',
            ':landlord_name' => $data['landlord_name'],
            ':landlord_phone'=> $data['landlord_phone'],
            ':landlord_card' => $data['landlord_ghana_card'] ?? '',
            ':tenant_name'   => $data['tenant_name'],
            ':tenant_phone'  => $data['tenant_phone'],
            ':tenant_card'   => $data['tenant_ghana_card'] ?? '',
            ':rent'          => $data['monthly_rent_ghs'],
            ':duration'      => $data['duration_months'],
            ':total'         => $data['total_rent_ghs'],
            ':deposit'       => $data['security_deposit_ghs'],
            ':start'         => $data['start_date'],
            ':end'           => $data['end_date'],
            ':notice'        => $data['notice_period_months'],
            ':utilities'     => clean_text($data['utilities_responsibility'] ?? '', 1000),
            ':witness'       => clean_string($data['witness_name'] ?? 'Goodlucks Legal Intermediary', 200),
            ':status'        => 'pending_signatures',
            ':code'          => $code,
            ':created'       => db_now(),
        ]
    );
    $row = db_one('SELECT * FROM tenancy_agreements WHERE id = :id', [':id' => $id]);
    return $row ? shape_agreement($row) : [];
}

function list_agreements(int $limit = 200): array
{
    $rows = db_all('SELECT * FROM tenancy_agreements ORDER BY created_at DESC' . db_limit_clause($limit, 0));
    return array_map('shape_agreement', $rows);
}

function sign_agreement_by_id(string $id, string $role): ?array
{
    $row = db_one('SELECT * FROM tenancy_agreements WHERE id = :id LIMIT 1', [':id' => $id]);
    if (!$row) {
        return null;
    }
    $column = $role === 'landlord' ? 'landlord_signed' : 'tenant_signed';
    $dateColumn = $role === 'landlord' ? 'landlord_signature_date' : 'tenant_signature_date';
    db_exec(
        'UPDATE tenancy_agreements SET ' . $column . ' = 1, ' . $dateColumn . ' = :signed WHERE id = :id',
        [':signed' => db_now(), ':id' => $id]
    );

    $updated = db_one('SELECT * FROM tenancy_agreements WHERE id = :id', [':id' => $id]);
    if ($updated && (int)$updated['landlord_signed'] === 1 && (int)$updated['tenant_signed'] === 1 && $updated['status'] !== 'active') {
        db_exec('UPDATE tenancy_agreements SET status = :status WHERE id = :id', [':status' => 'active', ':id' => $id]);
        $updated['status'] = 'active';
    }
    return $updated ? shape_agreement($updated) : null;
}

function create_receipt(array $data): array
{
    $id = new_id('rec');
    $receiptNo = 'GHL-REC-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(3)));
    $verification = 'VERIFIED-REC-' . strtoupper(bin2hex(random_bytes(3)));
    db_exec(
        'INSERT INTO rent_receipts (id, receipt_no, property_title, property_address, tenant_name, tenant_phone,
                                    landlord_name, amount_ghs, amount_in_words, payment_purpose, payment_method,
                                    transaction_ref, payment_date, issued_by, verification_code, created_at)
         VALUES (:id, :receipt_no, :title, :address, :tenant_name, :tenant_phone,
                 :landlord_name, :amount, :words, :purpose, :method,
                 :ref, :payment_date, :issued_by, :verification, :created)',
        [
            ':id'           => $id,
            ':receipt_no'   => $receiptNo,
            ':title'        => $data['property_title'],
            ':address'      => $data['property_address'],
            ':tenant_name'  => $data['tenant_name'],
            ':tenant_phone' => $data['tenant_phone'] ?? '',
            ':landlord_name'=> $data['landlord_name'],
            ':amount'       => $data['amount_ghs'],
            ':words'        => clean_string($data['amount_in_words'] ?? '', 300),
            ':purpose'      => clean_string($data['payment_purpose'] ?? '', 200),
            ':method'       => clean_string($data['payment_method'] ?? 'Cash', 60),
            ':ref'          => clean_string($data['transaction_ref'] ?? '', 128),
            ':payment_date' => $data['payment_date'],
            ':issued_by'    => clean_string($data['issued_by'] ?? 'Goodlucks Homes Intermediary Desk', 200),
            ':verification' => $verification,
            ':created'      => db_now(),
        ]
    );
    $row = db_one('SELECT * FROM rent_receipts WHERE id = :id', [':id' => $id]);
    return $row ? shape_receipt($row) : [];
}

function list_receipts(int $limit = 200): array
{
    $rows = db_all('SELECT * FROM rent_receipts ORDER BY created_at DESC' . db_limit_clause($limit, 0));
    return array_map('shape_receipt', $rows);
}

// ---------------------------------------------------------------------------
// Notifications listing, email logs
// ---------------------------------------------------------------------------
function list_notifications(?array $user, int $limit = 50): array
{
    if (!$user) {
        return [];
    }
    $rows = db_all(
        'SELECT * FROM notifications WHERE user_id = :uid ORDER BY created_at DESC' . db_limit_clause($limit, 0),
        [':uid' => $user['id']]
    );
    return array_map('shape_notification', $rows);
}

function mark_notification_read(string $id, array $user): bool
{
    $affected = db_exec(
        'UPDATE notifications SET is_read = 1 WHERE id = :id AND user_id = :uid',
        [':id' => $id, ':uid' => $user['id']]
    );
    return $affected > 0;
}

function list_email_logs(int $limit = 200): array
{
    $rows = db_all('SELECT * FROM email_logs ORDER BY sent_at DESC' . db_limit_clause($limit, 0));
    return array_map('shape_email_log', $rows);
}

// ---------------------------------------------------------------------------
// Analytics (real data only)
// ---------------------------------------------------------------------------
function record_page_view(string $path): void
{
    $sessionId = $_COOKIE['gl_visitor'] ?? '';
    if (!is_string($sessionId) || strlen($sessionId) < 16) {
        $sessionId = bin2hex(random_bytes(16));
        if (!headers_sent()) {
            setcookie('gl_visitor', $sessionId, session_cookie_options(time() + 60 * 60 * 24 * 365) + ['httponly' => true]);
        }
    }
    try {
        db_exec(
            'INSERT INTO page_views (id, path, session_hash, created_at) VALUES (:id, :path, :session, :created)',
            [
                ':id'      => new_id('pv'),
                ':path'    => clean_string($path, 255),
                ':session' => hash('sha256', $sessionId),
                ':created' => db_now(),
            ]
        );
    } catch (Throwable $e) {
        gl_log('error', 'Failed to record page view: ' . $e->getMessage());
    }
}

function count_visitors(string $sinceIso): int
{
    return (int)db_value(
        'SELECT COUNT(DISTINCT session_hash) FROM page_views WHERE created_at >= :since',
        [':since' => $sinceIso]
    );
}

function analytics_stats(): array
{
    $today = gmdate('Y-m-d 00:00:00');
    $yesterday = gmdate('Y-m-d 00:00:00', time() - 86400);
    $sevenDays = gmdate('Y-m-d 00:00:00', time() - 6 * 86400);
    $thirtyDays = gmdate('Y-m-d 00:00:00', time() - 29 * 86400);
    $yearAgo = gmdate('Y-m-d 00:00:00', time() - 364 * 86400);

    $propertyStatusCounts = ['active' => 0, 'pending' => 0, 'rejected' => 0];
    foreach (db_all('SELECT status, COUNT(*) AS c FROM properties GROUP BY status') as $row) {
        $propertyStatusCounts[(string)$row['status']] = (int)$row['c'];
    }
    $totalProperties = (int)db_value('SELECT COUNT(*) FROM properties');

    $totalUsers = (int)db_value('SELECT COUNT(*) FROM users');
    $totalTenants = (int)db_value("SELECT COUNT(*) FROM users WHERE role = 'tenant'");
    $totalLandlords = (int)db_value("SELECT COUNT(*) FROM users WHERE role = 'landlord'");
    $newUsersToday = (int)db_value('SELECT COUNT(*) FROM users WHERE created_at >= :since', [':since' => $today]);
    $newUsersThisWeek = (int)db_value('SELECT COUNT(*) FROM users WHERE created_at >= :since', [':since' => $sevenDays]);

    $totalViewings = (int)db_value('SELECT COUNT(*) FROM viewing_schedules');
    $completedViewings = (int)db_value("SELECT COUNT(*) FROM viewing_schedules WHERE status = 'completed'");
    $paidViewings = (int)db_value('SELECT COUNT(*) FROM viewing_schedules WHERE viewing_fee_paid = 1');

    $visitorsToday = count_visitors($today);
    $visitorsYesterday = (int)db_value(
        'SELECT COUNT(DISTINCT session_hash) FROM page_views WHERE created_at >= :start AND created_at < :end',
        [':start' => $yesterday, ':end' => $today]
    );
    $visitors7 = count_visitors($sevenDays);
    $visitors30 = count_visitors($thirtyDays);
    $visitors12m = count_visitors($yearAgo);

    $growth = $visitorsYesterday > 0
        ? round((($visitorsToday - $visitorsYesterday) / $visitorsYesterday) * 100, 1)
        : 0.0;

    // Last 7 days series
    $dailyTraffic = [];
    for ($i = 6; $i >= 0; $i--) {
        $dayStart = gmdate('Y-m-d 00:00:00', time() - $i * 86400);
        $dayEnd = gmdate('Y-m-d 00:00:00', time() - ($i - 1) * 86400);
        $dailyTraffic[] = [
            'label'     => gmdate('D', time() - $i * 86400),
            'visitors'  => (int)db_value(
                'SELECT COUNT(DISTINCT session_hash) FROM page_views WHERE created_at >= :start AND created_at < :end',
                [':start' => $dayStart, ':end' => $dayEnd]
            ),
            'pageViews' => (int)db_value(
                'SELECT COUNT(*) FROM page_views WHERE created_at >= :start AND created_at < :end',
                [':start' => $dayStart, ':end' => $dayEnd]
            ),
        ];
    }

    // Last 6 months series
    $monthlyTraffic = [];
    for ($i = 5; $i >= 0; $i--) {
        $monthStart = gmdate('Y-m-01 00:00:00', strtotime(gmdate('Y-m-01') . ' -' . $i . ' months'));
        $nextMonthStart = gmdate('Y-m-01 00:00:00', strtotime(gmdate('Y-m-01') . ' -' . ($i - 1) . ' months'));
        $monthlyTraffic[] = [
            'label'     => gmdate('M', strtotime($monthStart)),
            'visitors'  => (int)db_value(
                'SELECT COUNT(DISTINCT session_hash) FROM page_views WHERE created_at >= :start AND created_at < :end',
                [':start' => $monthStart, ':end' => $nextMonthStart]
            ),
            'pageViews' => (int)db_value(
                'SELECT COUNT(*) FROM page_views WHERE created_at >= :start AND created_at < :end',
                [':start' => $monthStart, ':end' => $nextMonthStart]
            ),
        ];
    }

    return [
        'visitorsToday'        => $visitorsToday,
        'visitorsYesterday'    => $visitorsYesterday,
        'visitorsLast7Days'    => $visitors7,
        'visitorsLast30Days'   => $visitors30,
        'visitorsLast12Months' => $visitors12m,
        'growthPercentage'     => $growth,
        'totalRegisteredUsers' => $totalUsers,
        'totalTenants'         => $totalTenants,
        'totalLandlords'       => $totalLandlords,
        'newUsersToday'        => $newUsersToday,
        'newUsersThisWeek'     => $newUsersThisWeek,
        'totalProperties'      => $totalProperties,
        'approvedProperties'   => $propertyStatusCounts['active'] ?? 0,
        'pendingProperties'    => $propertyStatusCounts['pending'] ?? 0,
        'rejectedProperties'   => $propertyStatusCounts['rejected'] ?? 0,
        'totalViewings'        => $totalViewings,
        'completedViewings'    => $completedViewings,
        'physicalRevenueGhs'   => round($paidViewings * VIEWING_FEE_GHS, 2),
        'totalEnquiries'       => (int)db_value('SELECT COUNT(*) FROM enquiries'),
        'newEnquiries'         => (int)db_value("SELECT COUNT(*) FROM enquiries WHERE status = 'new'"),
        'totalTenantRequests'  => (int)db_value('SELECT COUNT(*) FROM tenant_requests'),
        'dailyTraffic'         => $dailyTraffic,
        'monthlyTraffic'       => $monthlyTraffic,
    ];
}
