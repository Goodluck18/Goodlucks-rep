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

/**
 * The account responsible for a listing: the landlord who owns it, or — for an
 * independent agent listing (Upgrade 2, C1) — the agent who submitted it.
 *
 * Notification and contact-disclosure paths use this instead of reaching for
 * `landlord_id`, which is now empty on agent listings.
 */
function property_provider_user_id(array $row): string
{
    $landlordId = trim((string)($row['landlord_id'] ?? ''));
    if ($landlordId !== '') {
        return $landlordId;
    }

    return trim((string)($row['submitted_by_user_id'] ?? ''));
}

function shape_property(array $row): array
{
    // Upgrade 2 (C2): who submitted a listing, and who owns it, are account
    // facts — not catalogue copy. They used to be returned to everyone, which
    // made the public catalogue a way to profile providers. They are now
    // returned only to staff, the owning landlord, and the account that
    // submitted the listing; everybody else gets empty values.
    $providerViewer = auth_user();
    $providerViewerId = (string)($providerViewer['id'] ?? '');
    $providerViewerRole = (string)($providerViewer['role'] ?? '');
    $submittedById = (string)($row['submitted_by_user_id'] ?? '');
    $rowLandlordId = (string)($row['landlord_id'] ?? '');
    $exposeProviderDetail = $providerViewerRole === 'admin'
        || ($providerViewerId !== '' && ($providerViewerId === $rowLandlordId || $providerViewerId === $submittedById));

    // Upgrade 2 (C5): map whatever is stored — including the free text written
    // before this phase — onto the canonical keys, and keep the unmapped words.
    $storedAmenityValues = json_column($row['amenities'] ?? null);
    $amenities = normalise_amenities($storedAmenityValues);
    $amenitiesNote = trim((string)($row['amenities_note'] ?? ''));
    if ($amenities['unknown'] !== []) {
        $amenitiesNote = trim(implode(', ', array_unique(array_merge($amenities['unknown'], [$amenitiesNote]))), ', ');
    }

    // Upgrade 2 (C4): the stored pair, and only when we recognise the provider.
    $video = null;
    $videoProvider = (string)($row['video_provider'] ?? '');
    $videoUrl = (string)($row['video_url'] ?? '');
    if ($videoUrl !== '' && in_array($videoProvider, PROPERTY_VIDEO_PROVIDERS, true)) {
        $parsed = parse_property_video($videoUrl);
        if ($parsed['embedUrl'] !== null && $parsed['provider'] === $videoProvider) {
            $video = [
                'provider' => $parsed['provider'],
                'url'      => $parsed['url'],
                'embedUrl' => $parsed['embedUrl'],
            ];
        }
    }

    $landlordName = '';
    $submittedByRole = (string)($row['submitted_by_role'] ?? '');
    if ($exposeProviderDetail) {
        $landlordName = trim((string)($row['landlord_name'] ?? ''));
        if ($landlordName === '' && $submittedByRole !== 'agent') {
            // Task 05: never show a made-up owner name — say the name is missing.
            $landlordName = 'Landlord (name not recorded)';
        }
    }

    // Increment F: a landlord account id is private account information. It is
    // only returned to the landlord themselves, to staff, or to the agent who
    // submitted the listing (who supplied the reference). Public listings, and
    // therefore tenants, get an empty string — the catalogue never becomes a
    // way to enumerate landlord accounts.
    $landlordId = $rowLandlordId;
    $viewer = $providerViewer;
    $viewerId = $providerViewerId;
    $viewerRole = $providerViewerRole;
    // Agents do NOT see it either: an agent who submits a listing must not be
    // able to learn from the response whether the landlord reference they gave
    // matched an account. The claim and its resolution are staff-visible only.
    $exposeLandlordId = $landlordId !== '' && ($viewerId === $landlordId || $viewerRole === 'admin');

    return [
        'id'                      => (string)$row['id'],
        // The public URL of this listing, in its canonical descriptive form
        // (/property/{title}-{location}-{id}). Built here so the browser never
        // has to guess, and so the client, the sitemap and the share card all
        // point at exactly the same address.
        'slug'                    => property_slug($row),
        'path'                    => property_path($row),
        'url'                     => property_canonical_url($row),
        // The short sharing address (/p/{id}) and the listing's payment period,
        // both derived from the row so the client never has to guess either.
        'shortPath'               => property_short_path($row),
        'shortUrl'                => property_short_url($row),
        'rentPeriod'              => property_rent_period_key($row),
        'landlordId'              => $exposeLandlordId ? $landlordId : '',
        // Staff-only: the landlord contact an agent supplied when no account
        // was matched. Never returned to tenants, agents or the public.
        'landlordContactClaimed'  => $viewerRole === 'admin' ? (string)($row['landlord_contact_claimed'] ?? '') : '',
        'isLandlordVerified'      => (bool)($row['is_landlord_verified'] ?? false),
        // Who actually submitted the listing, and whether landlord authority has
        // been established. 'declared_by_agent' means an agent told us they act
        // for the owner; nothing has been verified (Increment D).
        'submittedByUserId'       => $exposeProviderDetail ? $submittedById : '',
        'submittedByRole'         => $exposeProviderDetail ? $submittedByRole : '',
        'landlordAuthorityState'  => $exposeProviderDetail
            ? (string)($row['landlord_authority_state'] ?? 'not_applicable')
            : 'not_applicable',
        'landlordName'            => $landlordName,
        'landlordCompany'         => $exposeProviderDetail ? (string)($row['landlord_company'] ?? '') : '',
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
        'amenities'               => $amenities['keys'],
        // The words a listing actually used, kept so nothing is silently
        // rewritten and a legacy listing still reads as it was written.
        'amenityLabels'           => amenity_labels($amenities['keys']),
        'amenitiesNote'           => $amenitiesNote,
        'toilets'                 => isset($row['toilets']) && $row['toilets'] !== null ? (int)$row['toilets'] : null,
        'kitchens'                => isset($row['kitchens']) && $row['kitchens'] !== null ? (int)$row['kitchens'] : null,
        'furnishing'              => (string)($row['furnishing'] ?? ''),
        'furnishingLabel'         => (string)(FURNISHING_STATES[(string)($row['furnishing'] ?? '')] ?? ''),
        'video'                   => $video,
        'videoProvider'           => (string)($row['video_provider'] ?? ''),
        'videoUrl'                => (string)($row['video_url'] ?? ''),
        // Upgrade 2 (C6): the provider's own expectation. Never a platform fee,
        // never used in a calculation — the client must label it as such. It is
        // business between the provider and the owner, so only the provider and
        // staff see the figure; a tenant gets the shape with nothing in it.
        'providerCommission'      => [
            'percent' => $exposeProviderDetail
                && isset($row['provider_commission_percent'])
                && $row['provider_commission_percent'] !== null
                ? (float)$row['provider_commission_percent']
                : null,
            'note'    => $exposeProviderDetail ? (string)($row['provider_commission_note'] ?? '') : '',
            'isPlatformFee' => false,
        ],
        'nearbyPlaces'            => json_column($row['nearby_places'] ?? null),
        'availability'            => (string)($row['availability'] ?? 'Available Now'),
        'featured'                => (bool)($row['featured'] ?? false),
        'viewsCount'              => (int)($row['views_count'] ?? 0),
        'enquiriesCount'          => (int)($row['enquiries_count'] ?? 0),
        'createdAt'               => to_iso($row['created_at'] ?? null),
        'updatedAt'               => to_iso($row['updated_at'] ?? null),
        // Task 03: this property's own viewing fee and viewing terms. Only
        // approved values are included for the public; review state and the
        // pending proposal are visible to the owner, the submitting agent and
        // staff. Never a storage path and never a reviewer's identity.
        'viewingTerms'            => shape_property_viewing_terms(
            $row,
            $viewer,
            // Only a reviewer, the owner or the submitting agent is shown the
            // pending proposal — and only then is it read from the database.
            ($viewerId !== '' && ($viewerId === (string)($row['landlord_id'] ?? '')
                || $viewerId === (string)($row['submitted_by_user_id'] ?? '')))
                || $viewerRole === 'admin'
                ? pending_viewing_fee_change((string)$row['id'])
                : null
        ),
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
        // The console's own vocabulary for the same lifecycle (Upgrade 2, A7).
        'stage'                => tenant_request_stage((string)$row['status']),
        'matchedPropertyIds'   => json_column($row['matched_property_ids'] ?? null),
        'assignedAgent'        => (string)($row['assigned_agent'] ?? ''),
        'notes'                => (string)($row['notes'] ?? ''),
        'createdAt'            => to_iso($row['created_at'] ?? null),
    ];
}

/**
 * Shape a viewing row (Increment F).
 *
 * `status` is the lifecycle status the caller should act on. The raw stored
 * value is exposed as `storedStatus` so a legacy `scheduled` row is never
 * silently presented as if it had always said `confirmed`, while every rule in
 * the codebase still treats it as a confirmed appointment.
 *
 * `isConfirmed` is derived from `confirmed_at` — not from the status word —
 * so "confirmed viewing" means an appointment that somebody actually agreed to.
 */
function shape_viewing(array $row): array
{
    $storedStatus = (string)($row['status'] ?? 'scheduled');
    $status = viewing_normalise_status($storedStatus);
    // The fee/terms snapshot written when the request was made, decoded once.
    $feeSnapshot = json_column($row['viewing_terms_snapshot_json'] ?? null);
    $shaped = [
        'id'               => (string)$row['id'],
        'tenantRequestId'  => (string)($row['tenant_request_id'] ?? ''),
        'tenantName'       => (string)$row['tenant_name'],
        'tenantPhone'      => (string)$row['tenant_phone'],
        'tenantEmail'      => (string)($row['tenant_email'] ?? ''),
        'tenantUserId'     => (string)($row['tenant_user_id'] ?? ''),
        'agentUserId'      => (string)($row['agent_user_id'] ?? ''),
        'propertyId'       => (string)($row['property_id'] ?? ''),
        'propertyTitle'    => (string)$row['property_title'],
        'propertyLocation' => (string)$row['property_location'],
        'date'             => (string)$row['date'],
        'time'             => (string)$row['time'],
        'assignedAgent'    => (string)($row['assigned_agent'] ?? ''),
        'status'           => $status,
        'storedStatus'     => $storedStatus,
        'statusLabel'      => viewing_status_label($status),
        'requestType'      => (string)($row['request_type'] ?? 'viewing'),
        'preferredDate'    => (string)($row['preferred_date'] ?? ''),
        'preferredTime'    => (string)($row['preferred_time'] ?? ''),
        'confirmedAt'      => to_iso($row['confirmed_at'] ?? null),
        'confirmedBy'      => (string)($row['confirmed_by'] ?? ''),
        'cancelReason'     => (string)($row['cancel_reason'] ?? ''),
        'cancelledAt'      => to_iso($row['cancelled_at'] ?? null),
        'completedAt'      => to_iso($row['completed_at'] ?? null),
        'agentNotes'       => (string)($row['agent_notes'] ?? ''),
        'viewingFeePaid'   => (bool)($row['viewing_fee_paid'] ?? false),
        // Task 03: the fee recorded for THIS request, copied from the property
        // when it was made. 0 means no viewing fee applied — never a default.
        'feeAmountGhs'     => (float)($row['fee_amount_ghs'] ?? 0),
        'viewingTerms'     => $feeSnapshot ?: null,
        // Task 03 update: where the recorded fee came from and who it is paid
        // to, taken from the snapshot written when the request was made. A
        // landlord listing's fee is set by Goodlucks and paid to Goodlucks; an
        // agent listing's fee is the agent's own and is never re-labelled.
        'feeSource'        => (string)($feeSnapshot['source'] ?? ''),
        'feePaidTo'        => (string)($feeSnapshot['paidTo'] ?? ''),
        'feePayableAfterViewing' => (bool)($feeSnapshot['payableAfterViewing'] ?? false),
        'outcomeNotes'     => (string)($row['outcome_notes'] ?? ''),
        'createdAt'        => to_iso($row['created_at'] ?? null),
        'updatedAt'        => to_iso($row['updated_at'] ?? null),
    ];
    $shaped['isConfirmed'] = viewing_appointment_is_confirmed($shaped);
    $shaped['isTerminal'] = viewing_is_terminal($status);
    $shaped['overdue'] = viewing_is_overdue($shaped);
    $shaped['legacyScheduledStatus'] = $storedStatus === 'scheduled' && $status === 'confirmed';

    return $shaped;
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

/**
 * Phone comparison key: digits only, compared on the last nine digits so that
 * "+233 24 123 4567", "0241234567" and "233241234567" are the same subscriber.
 */
function phone_key(?string $phone): string
{
    $digits = preg_replace('/\D+/', '', (string)$phone) ?? '';
    return $digits === '' ? '' : substr($digits, -9);
}

/**
 * Mask an identity number for display, keeping the last four characters.
 *
 * Kept after the tenancy-agreement retirement: the identity-verification
 * increment must mask Ghana Card numbers in every ordinary response.
 */
function mask_identity_number(string $value): string
{
    $value = trim($value);
    if ($value === '') {
        return '';
    }
    $visible = substr($value, -4);

    return strlen($value) <= 4 ? '••••' : '••••••••' . $visible;
}

/** Look a user up by phone number (exact match first, then normalised). */
function find_user_by_phone(?string $phone): ?array
{
    $normalised = phone_key($phone);
    if ($normalised === '') {
        return null;
    }

    $exact = db_one(
        'SELECT * FROM users WHERE phone = :phone LIMIT 1',
        [':phone' => trim((string)$phone)]
    );
    if ($exact) {
        return $exact;
    }

    // Formatted legacy values: compare normalised digits over a bounded window.
    foreach (db_all('SELECT * FROM users WHERE phone IS NOT NULL AND phone <> \'\'' . db_limit_clause(2000, 0)) as $candidate) {
        if (phone_key((string)$candidate['phone']) === $normalised) {
            return $candidate;
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Rent payment records — read path removed (Upgrade 2, E1)
//
// `user_can_read_receipt()`, `shape_receipt()` and the phone-sharing rule that
// existed only to attribute a legacy record to a tenant were deleted with the
// feature. The `rent_receipts` table and every row in it remain.
// ---------------------------------------------------------------------------

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
        'INSERT INTO users (id, email, name, official_name, role, phone, password_hash, avatar, address, company, bio,
                            is_verified, preferred_locations, budget_min, budget_max, preferred_bedrooms,
                            additional_notes, created_at, updated_at)
         VALUES (:id, :email, :name, :official_name, :role, :phone, :password_hash, :avatar, :address, :company, :bio,
                 :verified, :locations, :budget_min, :budget_max, :bedrooms, :notes, :created, :updated)',
        [
            ':id'            => $id,
            ':email'         => $data['email'],
            ':name'          => $data['name'],
            // Task 03: the official Ghana Card name given at registration. A
            // claim only; it never sets `is_verified`.
            ':official_name' => $data['official_name'] ?? null,
            ':role'          => $data['role'],
            ':phone'         => $data['phone'],
            ':password_hash' => $data['password_hash'],
            ':avatar'        => $data['avatar'] ?? '',
            ':address'       => $data['address'] ?? '',
            ':company'       => $data['company'] ?? '',
            ':bio'           => $data['bio'] ?? '',
            // Increment B: registering never verifies anyone. `is_verified` is an
            // internal flag with no evidence behind it yet (no document, no
            // reviewer). Landlords used to be marked verified the moment they
            // signed up, which displayed a "verified" badge nobody had earned.
            ':verified'      => 0,
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

/**
 * Set an account's provider classification (Upgrade 2, E2).
 *
 * Separate from `update_user()` on purpose: that function's column whitelist is
 * what stops a profile edit from ever touching a role, and it stays that way. The
 * only caller here is the audited staff correction endpoint, and the role is
 * re-validated at this layer so no future caller can store `admin` by accident.
 */
function set_user_role(string $id, string $role): void
{
    if (!in_array($role, ['tenant', 'landlord', 'agent'], true)) {
        throw new InvalidArgumentException('Only Agent, Landlord or Tenant can be assigned here.');
    }
    db_exec(
        'UPDATE users SET role = :role, updated_at = :updated WHERE id = :id',
        [':role' => $role, ':updated' => db_now(), ':id' => $id]
    );
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

    // Listings an agent submitted on a landlord's behalf are attributed to the
    // submitting account, not to a landlord account (there may not be one).
    if (!empty($filters['submittedByUserId'])) {
        $where[] = 'submitted_by_user_id = :submitted_by';
        $params[':submitted_by'] = $filters['submittedByUserId'];
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

    // Listing date range (Upgrade 2, A6). `createdTo` is inclusive of the whole
    // day it names, so "1–7 November" includes listings created on the 7th.
    if (!empty($filters['createdFrom'])) {
        $where[] = 'created_at >= :created_from';
        $params[':created_from'] = (string)$filters['createdFrom'] . ' 00:00:00';
    }
    if (!empty($filters['createdTo'])) {
        $nextDay = date('Y-m-d', strtotime((string)$filters['createdTo'] . ' +1 day'));
        $where[] = 'created_at < :created_to';
        $params[':created_to'] = $nextDay . ' 00:00:00';
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

// ---------------------------------------------------------------------------
// Agent accounts (Increment C)
//
// An agent profile exists so an agent account is identifiable, has a declared
// operating base (distinct from a home address on users.address) and carries an
// explicit, deny-by-default account status.
//
// Nothing here verifies anybody. `account_status` and `can_submit_listings`
// describe an internal review decision, not identity, licensing or regulatory
// authorisation — those belong to Increment D and there is no document upload
// in this release.
// ---------------------------------------------------------------------------

const AGENT_ACCOUNT_STATUSES = ['pending_review', 'active', 'suspended'];

function find_agent_profile_by_user(string $userId): ?array
{
    if ($userId === '') {
        return null;
    }
    return db_one('SELECT * FROM agent_profiles WHERE user_id = :uid LIMIT 1', [':uid' => $userId]);
}

function find_agent_profile(string $id): ?array
{
    return db_one('SELECT * FROM agent_profiles WHERE id = :id LIMIT 1', [':id' => $id]);
}

function create_agent_profile(string $userId, array $data): array
{
    $id = new_id('agent');
    db_exec(
        'INSERT INTO agent_profiles (id, user_id, agency_name, operating_city, account_status,
                                     can_submit_listings, created_at)
         VALUES (:id, :user_id, :agency, :city, :status, :can_submit, :created)',
        [
            ':id'         => $id,
            ':user_id'    => $userId,
            ':agency'     => clean_string($data['agency_name'] ?? '', 200),
            ':city'       => clean_string($data['operating_city'] ?? '', 120),
            // Deny by default: a brand-new agent account is pending review and
            // may not submit listings.
            ':status'     => 'pending_review',
            ':can_submit' => 0,
            ':created'    => db_now(),
        ]
    );

    $row = find_agent_profile($id);
    if (!$row) {
        throw new RuntimeException('Agent profile could not be created');
    }
    return $row;
}

/** Fields an agent may change about their own profile. Status is never one of them. */
function update_agent_profile(string $userId, array $fields): void
{
    $allowed = [
        'agency_name'    => 'agency_name',
        'operating_city' => 'operating_city',
    ];

    $set = [];
    $params = [':uid' => $userId, ':updated' => db_now()];
    foreach ($allowed as $key => $column) {
        if (array_key_exists($key, $fields)) {
            $set[] = $column . ' = :' . $key;
            $params[':' . $key] = clean_string($fields[$key], $column === 'agency_name' ? 200 : 120);
        }
    }
    if (!$set) {
        return;
    }

    db_exec(
        'UPDATE agent_profiles SET ' . implode(', ', $set) . ', updated_at = :updated WHERE user_id = :uid',
        $params
    );
}

/** Staff decision on an agent account. Audited by the caller. */
function set_agent_account_status(string $userId, string $status, bool $canSubmitListings, string $note, string $reviewerId): void
{
    if (!in_array($status, AGENT_ACCOUNT_STATUSES, true)) {
        throw new InvalidArgumentException('Unknown agent account status.');
    }

    // A suspended or pending account never keeps listing permission.
    $canSubmit = $status === 'active' ? $canSubmitListings : false;

    db_exec(
        'UPDATE agent_profiles
            SET account_status = :status, can_submit_listings = :can_submit, status_note = :note,
                reviewed_by = :reviewer, reviewed_at = :reviewed_at, updated_at = :updated
          WHERE user_id = :uid',
        [
            ':status'     => $status,
            ':can_submit' => $canSubmit ? 1 : 0,
            ':note'       => clean_string($note, 500),
            ':reviewer'   => $reviewerId,
            ':reviewed_at' => db_now(),
            ':updated'    => db_now(),
            ':uid'        => $userId,
        ]
    );
}

/**
 * Public shape of an agent profile.
 *
 * Deliberately reports what is *not* true as well: identity and professional
 * authorisation are unverified in this release, so the client cannot render a
 * "verified agent" badge from this data.
 */
function shape_agent_profile(array $row): array
{
    $status = (string)($row['account_status'] ?? 'pending_review');
    $canSubmit = (int)($row['can_submit_listings'] ?? 0) === 1 && $status === 'active';
    // Increment E: the tier is derived from the Increment D verification records
    // on every read. It is a label describing verification — never a permission,
    // and never something a client can set.
    $tier = agent_tier_state((string)($row['user_id'] ?? ''));

    return [
        'id'            => (string)$row['id'],
        'userId'        => (string)$row['user_id'],
        'agencyName'    => (string)($row['agency_name'] ?? ''),
        // The area the agent works from — not their home address, not coverage.
        'operatingCity' => (string)($row['operating_city'] ?? ''),
        'accountStatus' => $status,
        'canSubmitListings' => $canSubmit,
        'statusNote'    => (string)($row['status_note'] ?? ''),
        'reviewedAt'    => to_iso($row['reviewed_at'] ?? null),
        'createdAt'     => to_iso($row['created_at'] ?? null),
        'updatedAt'     => to_iso($row['updated_at'] ?? null),
        // Derived from the Increment D records (Increment E). Identity approval
        // is not a licence, and neither field is a permission.
        'identityVerified' => $tier['identityApproved'],
        'professionalAuthorisationVerified' => $tier['professionalApproved'],
        'agentTier'      => $tier['tier'],
        'agentTierLabel' => $tier['tierLabel'],
        'tierEligibility' => [
            'eligibleStandard'     => $tier['eligibleStandard'],
            'eligibleProfessional' => $tier['eligibleProfessional'],
            'identityStatus'       => $tier['identityStatus'],
            'professionalStatus'   => $tier['professionalStatus'],
        ],
        'serviceAreas'  => [],
    ];
}

function agent_can_submit_listings(?array $profile): bool
{
    if (!$profile) {
        return false;
    }
    return (string)($profile['account_status'] ?? '') === 'active'
        && (int)($profile['can_submit_listings'] ?? 0) === 1;
}

/** Admin listing: agent account + the public user fields staff need. */
/**
 * Agent accounts with the console's search and filters (Upgrade 2, A8).
 *
 * Identity verification and listing authorisation are DIFFERENT decisions and
 * stay separate here: `verification` filters on the verification record, while
 * `listing` and `stage` filter on the listing-authorisation decision. An agent
 * whose identity is verified has not therefore been allowed to publish.
 *
 *   'q'            — name, email address, contact address, agency or operating city
 *   'stage'        — pending | approved_for_listing | suspended
 *   'verification' — verified | unverified
 *   'listing'      — allowed | blocked
 *   'accountStatus'— pending_review | active | suspended
 */
function list_agent_profiles(int $limit = 200, array $filters = []): array
{
    $where = [];
    $params = [];

    $query = trim((string)($filters['q'] ?? ''));
    if ($query !== '') {
        $needle = '%' . mb_strtolower($query) . '%';
        $where[] = '(LOWER(u.name) LIKE :q OR LOWER(u.email) LIKE :q OR LOWER(u.address) LIKE :q'
            . ' OR LOWER(COALESCE(ap.agency_name, \'\')) LIKE :q OR LOWER(COALESCE(ap.operating_city, \'\')) LIKE :q)';
        $params[':q'] = $needle;
    }

    if (!empty($filters['accountStatus'])) {
        $where[] = 'ap.account_status = :account_status';
        $params[':account_status'] = (string)$filters['accountStatus'];
    }

    $rows = db_all(
        "SELECT ap.*, u.name, u.email, u.phone, u.address, u.created_at AS user_created_at
           FROM agent_profiles ap
           JOIN users u ON u.id = ap.user_id"
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY ap.created_at DESC' . db_limit_clause($limit, 0),
        $params
    );

    $profiles = array_map(static function (array $row): array {
        $profile = shape_agent_profile($row);
        $profile['name'] = (string)($row['name'] ?? '');
        $profile['email'] = (string)($row['email'] ?? '');
        $profile['phone'] = (string)($row['phone'] ?? '');
        // users.address is the agent's own contact address; it is not shown as
        // an operating base and is never mixed with `operatingCity`.
        $profile['contactAddress'] = (string)($row['address'] ?? '');
        $profile['registeredAt'] = to_iso($row['user_created_at'] ?? null);
        return $profile;
    }, $rows);

    return agent_profiles_matching($profiles, $filters);
}

/** The stage an administrator sees for one agent account (Upgrade 2, A8). */
function agent_account_stage(array $profile): string
{
    if ((string)($profile['accountStatus'] ?? '') === 'suspended') {
        return 'suspended';
    }
    if (!empty($profile['canSubmitListings'])) {
        return 'approved_for_listing';
    }

    return 'pending';
}

/**
 * Apply the verification / listing / stage filters to already-shaped profiles.
 *
 * These live in PHP rather than SQL because verification is derived from the
 * verification records (see `agent_tier_state()`); putting it in the query would
 * mean a second, divergent definition of what "verified" means.
 */
function agent_profiles_matching(array $profiles, array $filters): array
{
    $stage = (string)($filters['stage'] ?? '');
    $verification = (string)($filters['verification'] ?? '');
    $listing = (string)($filters['listing'] ?? '');

    return array_values(array_filter($profiles, static function (array $profile) use ($stage, $verification, $listing): bool {
        if ($stage !== '' && agent_account_stage($profile) !== $stage) {
            return false;
        }
        if ($verification === 'verified' && empty($profile['identityVerified'])) {
            return false;
        }
        if ($verification === 'unverified' && !empty($profile['identityVerified'])) {
            return false;
        }
        if ($listing === 'allowed' && empty($profile['canSubmitListings'])) {
            return false;
        }
        if ($listing === 'blocked' && !empty($profile['canSubmitListings'])) {
            return false;
        }

        return true;
    }));
}

/**
 * How many agent accounts are in each console stage, over every account.
 *
 * @return array<string, int>
 */
function count_agents_by_stage(): array
{
    $counts = ['pending' => 0, 'approved_for_listing' => 0, 'suspended' => 0];
    foreach (list_agent_profiles(1000) as $profile) {
        $counts[agent_account_stage($profile)] = ($counts[agent_account_stage($profile)] ?? 0) + 1;
    }

    return $counts;
}

function create_property(array $data): string
{
    $id = $data['id'] ?? new_id('prop');
    db_exec(
        'INSERT INTO properties (id, landlord_id, landlord_name, landlord_company,
                                 submitted_by_user_id, submitted_by_role, landlord_authority_state,
                                 landlord_contact_claimed,
                                 is_landlord_verified,
                                 title, location, city, rent_ghs, bedrooms, bathrooms, property_type,
                                 status, images, description, amenities, amenities_note, nearby_places, availability,
                                 toilets, kitchens, furnishing,
                                 video_provider, video_url,
                                 provider_commission_percent, provider_commission_note,
                                 featured, views_count, enquiries_count,
                                 viewing_fee_ghs, viewing_terms_json, viewing_terms_state,
                                 viewing_terms_updated_at, viewing_terms_approved_by,
                                 created_at, updated_at)
         VALUES (:id, :landlord_id, :landlord_name, :landlord_company,
                 :submitted_by_user_id, :submitted_by_role, :landlord_authority_state,
                 :landlord_contact_claimed,
                 :verified,
                 :title, :location, :city, :rent_ghs, :bedrooms, :bathrooms, :property_type,
                 :status, :images, :description, :amenities, :amenities_note, :nearby_places, :availability,
                 :toilets, :kitchens, :furnishing,
                 :video_provider, :video_url,
                 :provider_commission_percent, :provider_commission_note,
                 :featured, 0, 0,
                 :viewing_fee, :viewing_terms, :viewing_state,
                 :viewing_updated, :viewing_by,
                 :created, :updated)',
        [
            ':id'               => $id,
            ':landlord_id'      => $data['landlord_id'] ?? null,
            ':landlord_name'    => $data['landlord_name'] ?? '',
            ':landlord_company' => $data['landlord_company'] ?? '',
            ':submitted_by_user_id' => $data['submitted_by_user_id'] ?? null,
            ':submitted_by_role'    => $data['submitted_by_role'] ?? null,
            ':landlord_authority_state' => $data['landlord_authority_state'] ?? 'not_applicable',
            ':landlord_contact_claimed' => $data['landlord_contact_claimed'] ?? null,
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
            ':amenities_note'   => $data['amenities_note'] ?? null,
            ':toilets'          => $data['toilets'] ?? null,
            ':kitchens'         => $data['kitchens'] ?? null,
            ':furnishing'       => $data['furnishing'] ?? null,
            ':video_provider'   => $data['video_provider'] ?? null,
            ':video_url'        => $data['video_url'] ?? null,
            ':provider_commission_percent' => $data['provider_commission_percent'] ?? null,
            ':provider_commission_note'    => $data['provider_commission_note'] ?? null,
            ':nearby_places'    => json_encode($data['nearby_places'] ?? []),
            ':availability'     => $data['availability'] ?? 'Available Now',
            ':featured'         => !empty($data['featured']) ? 1 : 0,
            // Task 03: a per-property viewing fee and terms. NULL means "none",
            // never a platform default.
            ':viewing_fee'      => $data['viewing_fee_ghs'] ?? null,
            ':viewing_terms'    => isset($data['viewing_terms'])
                ? json_encode($data['viewing_terms'], JSON_UNESCAPED_SLASHES)
                : null,
            ':viewing_state'    => $data['viewing_terms_state'] ?? 'not_set',
            ':viewing_updated'  => $data['viewing_terms_updated_at'] ?? null,
            ':viewing_by'       => $data['viewing_terms_approved_by'] ?? null,
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
        'status', 'images', 'description', 'amenities', 'amenities_note', 'nearby_places', 'availability',
        'toilets', 'kitchens', 'furnishing',
        'video_provider', 'video_url',
        'provider_commission_percent', 'provider_commission_note',
        'featured', 'landlord_name', 'landlord_company', 'is_landlord_verified',
        // Task 03: per-property viewing fee / terms. Written only by the
        // viewing-terms helpers or by staff approval, never blindly by an edit.
        'viewing_fee_ghs', 'viewing_terms_json', 'viewing_terms_state',
        'viewing_terms_updated_at', 'viewing_terms_approved_by',
    ];
    $set = [];
    $params = [':id' => $id];

    foreach ($columns as $column) {
        if (!array_key_exists($column, $data)) {
            continue;
        }
        $value = $data[$column];
        if (in_array($column, ['images', 'amenities', 'nearby_places', 'viewing_terms_json'], true)) {
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

/**
 * Enquiries, newest first (Upgrade 2, A10).
 *
 * The console used to fetch every enquiry and filter it in the browser, which
 * silently hid anything past the limit and could not be searched at all. The
 * filters run in SQL over the real rows:
 *
 *   'q'      — name, email address or phone number (a phone search also matches
 *              the same subscriber written with spaces, +233 or a local 0 prefix
 *              because the digits are compared, not the punctuation);
 *   'status' — one of ENQUIRY_STATUSES, or an array of them.
 *
 * `count_enquiries_by_status()` is separate on purpose: the console's status
 * chips show how many enquiries exist in each state across ALL records, not how
 * many survived the current search.
 */
function list_enquiries(int $limit = 200, array $filters = []): array
{
    $where = [];
    $params = [];

    $statuses = $filters['status'] ?? null;
    if ($statuses !== null && $statuses !== '' && $statuses !== []) {
        $statuses = is_array($statuses) ? $statuses : [$statuses];
        $statuses = array_values(array_intersect($statuses, ENQUIRY_STATUSES));
        if ($statuses) {
            $placeholders = [];
            foreach ($statuses as $index => $status) {
                $placeholders[] = ':status' . $index;
                $params[':status' . $index] = $status;
            }
            $where[] = 'status IN (' . implode(', ', $placeholders) . ')';
        } else {
            // An unknown status can never match a record; be explicit rather
            // than silently returning everything.
            return [];
        }
    }

    $query = trim((string)($filters['q'] ?? ''));
    if ($query !== '') {
        $needle = '%' . mb_strtolower($query) . '%';
        $conditions = ['LOWER(name) LIKE :q', 'LOWER(email) LIKE :q'];
        $params[':q'] = $needle;

        // A phone number is matched on its digits so "+233 24 123 4567" and
        // "0241234567" find the same enquiry.
        $digits = preg_replace('/\D+/', '', $query) ?? '';
        if (strlen($digits) >= 3) {
            $conditions[] = "REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE :phone_q";
            $params[':phone_q'] = '%' . $digits . '%';
        }
        $where[] = '(' . implode(' OR ', $conditions) . ')';
    }

    $sql = 'SELECT * FROM enquiries'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY created_at DESC' . db_limit_clause($limit, 0);

    return array_map('shape_enquiry', db_all($sql, $params));
}

/**
 * How many enquiries exist in each status, over every record.
 *
 * @return array<string, int> keyed by status, every known status present (0 when empty)
 */
function count_enquiries_by_status(): array
{
    $counts = array_fill_keys(ENQUIRY_STATUSES, 0);
    foreach (db_all('SELECT status, COUNT(*) AS total FROM enquiries GROUP BY status', []) as $row) {
        $status = (string)($row['status'] ?? '');
        if (array_key_exists($status, $counts)) {
            $counts[$status] = (int)$row['total'];
        }
    }

    return $counts;
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
/**
 * The console's three-way view of a rental request (Upgrade 2, A7).
 *
 * The stored lifecycle (`submitted … cancelled`, REQUEST_STATUSES) is unchanged
 * and is still what the pipeline acts on. The console groups it into the
 * vocabulary an administrator uses:
 *
 *   pending           — submitted or searching: nobody has approved matches yet
 *   approved          — matched: staff approved the matches for the tenant
 *   viewing_scheduled — a viewing appointment exists for the request
 *   completed         — the request finished
 *   cancelled         — the tenant or staff cancelled it
 */
function tenant_request_stage(string $status): string
{
    return match ($status) {
        'submitted', 'searching' => 'pending',
        'matched'                => 'approved',
        'viewing_scheduled'      => 'viewing_scheduled',
        'completed'              => 'completed',
        'cancelled'              => 'cancelled',
        default                  => 'pending',
    };
}

/** The stored statuses that make up a console stage. @return string[] */
function tenant_request_stage_statuses(string $stage): array
{
    return match ($stage) {
        'pending'           => ['submitted', 'searching'],
        'approved'          => ['matched'],
        'viewing_scheduled' => ['viewing_scheduled'],
        'completed'         => ['completed'],
        'cancelled'         => ['cancelled'],
        default             => [],
    };
}

/**
 * Rental requests (Upgrade 2, A7).
 *
 * `$scope` may carry the owner restriction (`tenantId` / `email`) used by the
 * tenant's own view, and the console filters:
 *
 *   'q'      — the tenant's name, phone number or email address;
 *   'stage'  — pending | approved | viewing_scheduled | completed | cancelled;
 *   'status' — the exact stored status (or a list of them).
 *
 * Real records only: nothing is invented for a request that has no match yet.
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

    $stageStatuses = [];
    if (!empty($scope['stage'])) {
        $stageStatuses = tenant_request_stage_statuses((string)$scope['stage']);
        if ($stageStatuses === []) {
            return [];
        }
    }

    if (!empty($scope['status'])) {
        $statuses = is_array($scope['status']) ? $scope['status'] : [$scope['status']];
        $statuses = array_values(array_intersect($statuses, REQUEST_STATUSES));
        if ($stageStatuses !== []) {
            $statuses = array_values(array_intersect($statuses, $stageStatuses));
        }
        if ($statuses === []) {
            return [];
        }
        $placeholders = [];
        foreach ($statuses as $index => $status) {
            $placeholders[] = ':status' . $index;
            $params[':status' . $index] = $status;
        }
        $where[] = 'status IN (' . implode(', ', $placeholders) . ')';
    } elseif ($stageStatuses !== []) {
        $placeholders = [];
        foreach ($stageStatuses as $index => $status) {
            $placeholders[] = ':stage' . $index;
            $params[':stage' . $index] = $status;
        }
        $where[] = 'status IN (' . implode(', ', $placeholders) . ')';
    }

    $query = trim((string)($scope['q'] ?? ''));
    if ($query !== '') {
        $needle = '%' . mb_strtolower($query) . '%';
        $conditions = [
            'LOWER(tenant_name) LIKE :q',
            'LOWER(tenant_email) LIKE :q',
        ];
        $params[':q'] = $needle;
        $digits = preg_replace('/\D+/', '', $query) ?? '';
        if (strlen($digits) >= 3) {
            $conditions[] = "REPLACE(REPLACE(REPLACE(REPLACE(tenant_phone, ' ', ''), '-', ''), '+', ''), '(', '') LIKE :phone_q";
            $params[':phone_q'] = '%' . $digits . '%';
        }
        $where[] = '(' . implode(' OR ', $conditions) . ')';
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
                                       viewing_fee_paid, fee_amount_ghs, viewing_terms_snapshot_json, outcome_notes,
                                       tenant_user_id, agent_user_id, landlord_user_id, request_type,
                                       preferred_date, preferred_time, agent_notes, created_at)
         VALUES (:id, :req_id, :name, :phone, :email, :property_id,
                 :title, :location, :date, :time, :agent, :status,
                 :fee_paid, :fee_amount, :terms_snapshot, :notes,
                 :tenant_user_id, :agent_user_id, :landlord_user_id, :request_type,
                 :preferred_date, :preferred_time, :agent_notes, :created)',
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
            // No invented placeholder name (finding D13): an unassigned viewing has no agent.
            ':agent'       => $data['assigned_agent'] ?? '',
            ':status'      => $data['status'] ?? 'scheduled',
            ':fee_paid'    => !empty($data['viewing_fee_paid']) ? 1 : 0,
            ':fee_amount'  => $data['fee_amount_ghs'] ?? 0,
            // Task 03: the approved fee + terms in force at request time.
            ':terms_snapshot' => isset($data['viewing_terms_snapshot_json'])
                ? (is_string($data['viewing_terms_snapshot_json'])
                    ? $data['viewing_terms_snapshot_json']
                    : json_encode($data['viewing_terms_snapshot_json'], JSON_UNESCAPED_SLASHES))
                : null,
            ':notes'       => $data['outcome_notes'] ?? '',
            ':tenant_user_id'  => ($data['tenant_user_id'] ?? '') !== '' ? $data['tenant_user_id'] : null,
            ':agent_user_id'   => ($data['agent_user_id'] ?? '') !== '' ? $data['agent_user_id'] : null,
            ':landlord_user_id'=> ($data['landlord_user_id'] ?? '') !== '' ? $data['landlord_user_id'] : null,
            ':request_type'    => $data['request_type'] ?? 'viewing',
            ':preferred_date'  => ($data['preferred_date'] ?? '') !== '' ? $data['preferred_date'] : null,
            ':preferred_time'  => ($data['preferred_time'] ?? '') !== '' ? $data['preferred_time'] : null,
            ':agent_notes'     => $data['agent_notes'] ?? '',
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
    if (array_key_exists('agent_user_id', $fields)) {
        $set[] = 'agent_user_id = :agent_user_id';
        $params[':agent_user_id'] = $fields['agent_user_id'] !== null && $fields['agent_user_id'] !== ''
            ? clean_string((string)$fields['agent_user_id'], 64)
            : null;
    }
    if (array_key_exists('agent_notes', $fields)) {
        $set[] = 'agent_notes = :agent_notes';
        $params[':agent_notes'] = clean_text((string)$fields['agent_notes'], 1000);
    }
    if (!$set) {
        return;
    }
    $set[] = 'updated_at = :updated_at';
    $params[':updated_at'] = db_now();
    db_exec('UPDATE viewing_schedules SET ' . implode(', ', $set) . ' WHERE id = :id', $params);
}

// ---------------------------------------------------------------------------
// Viewing-fee ledger (Increment B)
//
// Accounting rules enforced here (see docs/INCREMENT_B_REPORT.md):
//   * `fee_total_ghs`   = money an AGENT collected from the tenant on site.
//                         It is NOT Goodlucks revenue.
//   * `goodlucks_share_ghs` = money OWED to Goodlucks for that fee. It is only
//                         ever set by an explicit, audited agreement (or, in a
//                         future increment, by an APPROVED policy snapshot).
//                         The 60/40 and 70/30 proposals in config.php are never
//                         read by any calculation.
//   * remittances      = money Goodlucks actually received. The sum of these
//                         rows is the only viewing-fee figure reported as
//                         Goodlucks revenue.
//   * outstanding      = share owed - remitted (never negative; NULL when no
//                         share has been agreed, because nothing is "owed"
//                         until an amount is agreed).
// No function here deletes or rewrites a financial row: mistakes are recorded
// by moving a record to `void`, never by removing history.
// ---------------------------------------------------------------------------

const VIEWING_FEE_COLLECTION_STATES = ['reported', 'confirmed_by_staff', 'disputed', 'void'];
const VIEWING_FEE_SHARE_BASES = ['not_set', 'manual_agreement', 'policy_snapshot', 'platform_policy'];

function new_viewing_fee_reference(): string
{
    return 'VFR-' . gmdate('Y') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

function find_viewing_fee_record(string $id): ?array
{
    return db_one('SELECT * FROM viewing_fee_records WHERE id = :id LIMIT 1', [':id' => $id]);
}

function find_viewing_fee_record_by_viewing(string $viewingId): ?array
{
    if ($viewingId === '') {
        return null;
    }
    return db_one(
        'SELECT * FROM viewing_fee_records WHERE viewing_id = :vid LIMIT 1',
        [':vid' => $viewingId]
    );
}

function fee_remitted_total(string $recordId): float
{
    return round((float)db_value(
        'SELECT COALESCE(SUM(amount_ghs), 0) FROM fee_remittances WHERE viewing_fee_record_id = :id',
        [':id' => $recordId]
    ), 2);
}

function list_fee_remittances(string $recordId): array
{
    $rows = db_all(
        'SELECT * FROM fee_remittances WHERE viewing_fee_record_id = :id ORDER BY received_at ASC, created_at ASC',
        [':id' => $recordId]
    );
    return array_map(static fn($row) => [
        'id'         => (string)$row['id'],
        'amountGhs'  => (float)$row['amount_ghs'],
        'method'     => (string)($row['method'] ?? ''),
        'reference'  => (string)($row['reference'] ?? ''),
        'receivedAt' => (string)$row['received_at'],
        'recordedBy' => (string)($row['recorded_by'] ?? ''),
        'notes'      => (string)($row['notes'] ?? ''),
        // Increment G: a negative row is a linked reversal, never an edit.
        'entryType'  => (string)($row['entry_type'] ?? 'receipt'),
        'submissionId' => (string)($row['submission_id'] ?? ''),
        'adjustmentId' => (string)($row['adjustment_id'] ?? ''),
        // Increment G audit remediation R3: which receipt this reversal
        // reverses, and how much of that receipt is still reversible. Reversals
        // are counted per receipt, not per obligation.
        'reversalOfReceiptId' => (string)($row['reversal_of_receipt_id'] ?? ''),
        'createdAt'  => to_iso($row['created_at'] ?? null),
    ], $rows);
}

/**
 * Public shape of a ledger row, with the derived figures the dashboard shows.
 *
 * `goodlucksShareGhs`, `agentShareGhs`, `outstandingGhs` and `agentRetainedGhs`
 * are NULL when the underlying amount is genuinely unknown — the API never
 * substitutes zero for "not agreed yet".
 */
function shape_viewing_fee_record(array $row): array
{
    $id = (string)$row['id'];
    $feeTotal = $row['fee_total_ghs'] === null ? null : round((float)$row['fee_total_ghs'], 2);
    $share = $row['goodlucks_share_ghs'] === null ? null : round((float)$row['goodlucks_share_ghs'], 2);
    $agentShare = $row['agent_share_ghs'] === null ? null : round((float)$row['agent_share_ghs'], 2);
    $remitted = fee_remitted_total($id);
    $outstanding = $share === null ? null : round(max(0.0, $share - $remitted), 2);
    $state = (string)$row['collection_state'];

    $basis = (string)$row['share_basis'];
    $snapshotRow = $basis === 'policy_snapshot' ? fee_snapshot_for_viewing_fee($row) : null;
    $agentUserId = (string)($row['agent_user_id'] ?? '');

    // When nothing has priced the fee yet, say explicitly whether a policy could
    // have priced it — and when not, why. Never invent a share.
    $applicability = null;
    if ($basis === 'not_set') {
        $tier = $agentUserId !== '' ? agent_tier_state($agentUserId)['tier'] : null;
        $date = substr((string)($row['recorded_at'] ?? db_now()), 0, 10);
        if ($tier === null) {
            $applicability = [
                'applies' => false,
                'reason'  => 'This fee is not linked to an agent account, so no tier-based policy can be resolved.',
            ];
        } else {
            $candidate = find_applicable_fee_policy($tier, 'viewing_fee', $date);
            $applicability = [
                'applies'   => $candidate !== null,
                'policyId'  => $candidate ? (string)$candidate['id'] : '',
                'policyName'=> $candidate ? (string)($candidate['name'] ?? '') : '',
                'agentTier' => $tier,
                'reason'    => $candidate
                    ? 'An active policy covers this fee; an administrator must apply it explicitly.'
                    : fee_policy_non_applicability_reason($tier, 'viewing_fee', $date),
            ];
        }
    }

    return [
        'id'              => $id,
        'reference'       => (string)$row['reference'],
        'viewingId'       => (string)($row['viewing_id'] ?? ''),
        'propertyId'      => (string)($row['property_id'] ?? ''),
        'propertyTitle'   => (string)($row['property_title'] ?? ''),
        'agentName'       => (string)($row['agent_name'] ?? ''),
        'agentUserId'     => $agentUserId,
        // Task 03 update: agent_collection | landlord_platform_fee. A landlord
        // fee is paid by the tenant straight to Goodlucks and has no agent share.
        'feeSource'       => (string)($row['fee_source'] ?? 'agent_collection'),
        'feeSourceLabel'  => (string)($row['fee_source'] ?? 'agent_collection') === 'landlord_platform_fee'
            ? 'Landlord listing — paid to Goodlucks Homes'
            : 'Agent collection',
        'feeTotalGhs'     => $feeTotal,
        'collectionState' => $state,
        'shareBasis'      => $basis,
        // Distinguishes the two ways a fee can be priced, and "not priced yet".
        'snapshotKind'    => match ($basis) {
            'policy_snapshot' => 'policy',
            'manual_agreement' => 'manual_agreement',
            'platform_policy' => 'platform_policy',
            default => 'none',
        },
        'policyId'        => (string)($row['policy_id'] ?? ''),
        'agentTierAtSnapshot' => (string)($row['agent_tier_at_snapshot'] ?? ''),
        'policySnapshot'  => $snapshotRow ? shape_fee_snapshot($snapshotRow) : null,
        'policyApplicability' => $applicability,
        'goodlucksShareGhs' => $share,
        'agentShareGhs'   => $agentShare,
        'remittedGhs'     => $remitted,
        'outstandingGhs'  => $outstanding,
        'settled'         => $share !== null && $remitted + 0.005 >= $share,
        'countsInTotals'  => $state !== 'void',
        'recordedBy'      => (string)($row['recorded_by'] ?? ''),
        'recordedAt'      => to_iso($row['recorded_at'] ?? null),
        'notes'           => (string)($row['notes'] ?? ''),
        'remittances'     => list_fee_remittances($id),
    ];
}

function list_viewing_fee_records(int $limit = 200): array
{
    $rows = db_all(
        'SELECT * FROM viewing_fee_records ORDER BY recorded_at DESC' . db_limit_clause($limit, 0)
    );
    return array_map('shape_viewing_fee_record', $rows);
}

/**
 * Ledger totals. Every figure is derived from stored rows — never from a
 * percentage constant.
 */
function viewing_fee_summary(?array $records = null): array
{
    $records = $records ?? list_viewing_fee_records(5000);

    $collected = 0.0;
    $shareDue = 0.0;
    $remitted = 0.0;
    $agentRetained = 0.0;
    $outstanding = 0.0;
    $withoutShare = 0;
    $disputed = 0;
    $counted = 0;

    foreach ($records as $record) {
        if (!($record['countsInTotals'] ?? true)) {
            continue;
        }
        $counted++;
        $collected += (float)($record['feeTotalGhs'] ?? 0);
        $remitted += (float)($record['remittedGhs'] ?? 0);
        if (($record['collectionState'] ?? '') === 'disputed') {
            $disputed++;
        }
        if ($record['goodlucksShareGhs'] === null) {
            $withoutShare++;
            continue;
        }
        $shareDue += (float)$record['goodlucksShareGhs'];
        $outstanding += (float)($record['outstandingGhs'] ?? 0);
        if ($record['agentShareGhs'] !== null) {
            $agentRetained += (float)$record['agentShareGhs'];
        }
    }

    return [
        // Money the agents collected from tenants (reported, not Goodlucks money).
        'viewingFeesCollectedGhs' => round($collected, 2),
        // Money owed to Goodlucks under explicitly agreed shares.
        'goodlucksShareDueGhs'    => round($shareDue, 2),
        // Money Goodlucks confirmed it received (the ONLY revenue figure).
        'goodlucksShareReceivedGhs' => round($remitted, 2),
        // Money the agents keep.
        'agentShareRetainedGhs'   => round($agentRetained, 2),
        // Still owed to Goodlucks.
        'outstandingReceivablesGhs' => round($outstanding, 2),
        'recordsWithoutAgreedShare' => $withoutShare,
        'disputedRecords'         => $disputed,
        'recordsCounted'          => $counted,
    ];
}

/**
 * Create the ledger row for a viewing whose fee an agent has just collected.
 * Idempotent per viewing; an existing row is returned untouched so a later
 * share agreement or remittance can never be overwritten by a re-report.
 */
function ensure_viewing_fee_record(
    array $viewing,
    ?array $actor,
    ?float $amount = null,
    string $feeSource = 'agent_collection'
): ?array {
    $viewingId = (string)($viewing['id'] ?? '');
    if ($viewingId === '') {
        return null;
    }

    $existing = find_viewing_fee_record_by_viewing($viewingId);
    if ($existing) {
        return $existing;
    }

    $id = new_id('vfr');
    db_exec(
        'INSERT INTO viewing_fee_records (id, reference, viewing_id, property_id, property_title,
                                          agent_name, agent_user_id, fee_total_ghs, fee_source,
                                          collection_state, share_basis, recorded_by, recorded_at)
         VALUES (:id, :reference, :viewing_id, :property_id, :property_title,
                 :agent_name, NULL, :fee_total, :fee_source, :state, :basis, :recorded_by, :recorded_at)',
        [
            ':id'             => $id,
            ':reference'      => new_viewing_fee_reference(),
            ':viewing_id'     => $viewingId,
            ':property_id'    => (string)($viewing['propertyId'] ?? ''),
            ':property_title' => clean_string($viewing['propertyTitle'] ?? '', 255),
            ':agent_name'     => clean_string($viewing['assignedAgent'] ?? 'Unassigned', 200),
            // Task 03: no universal fee. A viewing with no approved fee is
            // recorded as 0 until a real amount is reported.
            ':fee_total'      => $amount ?? (float)($viewing['feeAmountGhs'] ?? 0),
            ':fee_source'     => $feeSource === 'landlord_platform_fee' ? 'landlord_platform_fee' : 'agent_collection',
            ':state'          => 'reported',
            ':basis'          => 'not_set',
            ':recorded_by'    => (string)($actor['id'] ?? ''),
            ':recorded_at'    => db_now(),
        ]
    );

    return find_viewing_fee_record($id);
}

/**
 * Record the amount Goodlucks and the agent have explicitly agreed for one fee.
 *
 * Deliberately manual: no percentage is applied automatically, so the
 * provisional 60/40 and 70/30 proposals can never leak into a live figure.
 */
function set_viewing_fee_share(string $id, float $amount, string $note, ?array $actor): array
{
    $record = find_viewing_fee_record($id);
    if (!$record) {
        throw new InvalidArgumentException('Viewing fee record not found.');
    }
    if (in_array((string)$record['collection_state'], ['void', 'disputed'], true)) {
        throw new InvalidArgumentException('A disputed or void fee record cannot be re-priced.');
    }
    // Increment E: a policy-priced fee carries an immutable snapshot. Replacing
    // it with a typed-in figure would rewrite agreed terms, so it is refused.
    if ((string)($record['share_basis'] ?? 'not_set') === 'policy_snapshot' || !empty($record['policy_snapshot_id'])) {
        throw new InvalidArgumentException('This fee was priced by an approved fee policy and cannot be re-priced manually.');
    }
    // Task 03 update: a landlord viewing fee belongs to Goodlucks in full and is
    // set by the platform policy, so it is never re-shared by hand either.
    if ((string)($record['share_basis'] ?? 'not_set') === 'platform_policy'
        || (string)($record['fee_source'] ?? 'agent_collection') === 'landlord_platform_fee'
    ) {
        throw new InvalidArgumentException('This is a landlord viewing fee: it belongs to Goodlucks Homes in full and cannot be re-shared.');
    }

    $feeTotal = $record['fee_total_ghs'] === null ? null : round((float)$record['fee_total_ghs'], 2);
    if ($amount < 0) {
        throw new InvalidArgumentException('The Goodlucks share cannot be negative.');
    }
    if ($feeTotal !== null && $amount - $feeTotal > 0.005) {
        throw new InvalidArgumentException('The Goodlucks share cannot exceed the amount the agent collected.');
    }

    $remitted = fee_remitted_total($id);
    if ($amount + 0.005 < $remitted) {
        throw new InvalidArgumentException('The agreed share cannot be lower than the amount already remitted.');
    }

    $agentShare = $feeTotal === null ? null : round($feeTotal - $amount, 2);
    $snapshot = [
        'basis'      => 'manual_agreement',
        'note'       => clean_string($note, 300),
        'feeTotalGhs' => $feeTotal,
        'goodlucksShareGhs' => $amount,
        'agreedBy'   => (string)($actor['id'] ?? ''),
        'agreedAt'   => gmdate('c'),
        // Recorded so nobody can later claim a percentage policy was applied.
        'policyApplied' => false,
    ];

    db_exec(
        'UPDATE viewing_fee_records
            SET goodlucks_share_ghs = :share, agent_share_ghs = :agent_share,
                share_basis = :basis, policy_snapshot_json = :snapshot, updated_at = :updated
          WHERE id = :id',
        [
            ':share'       => $amount,
            ':agent_share' => $agentShare,
            ':basis'       => 'manual_agreement',
            ':snapshot'    => json_encode($snapshot),
            ':updated'     => db_now(),
            ':id'          => $id,
        ]
    );

    return find_viewing_fee_record($id) ?? [];
}

/** Record money Goodlucks actually received from an agent for one fee. */
function add_fee_remittance(string $recordId, array $data): array
{
    $record = find_viewing_fee_record($recordId);
    if (!$record) {
        throw new InvalidArgumentException('Viewing fee record not found.');
    }
    $state = (string)$record['collection_state'];
    if ($state === 'void') {
        throw new InvalidArgumentException('A void fee record cannot receive a remittance.');
    }
    if ($state === 'disputed') {
        throw new InvalidArgumentException('A disputed fee cannot be settled until the dispute is resolved.');
    }
    if (($record['share_basis'] ?? 'not_set') === 'not_set' || $record['goodlucks_share_ghs'] === null) {
        throw new InvalidArgumentException('Agree the Goodlucks share for this fee before recording a remittance.');
    }

    $amount = round((float)($data['amount_ghs'] ?? 0), 2);
    if ($amount <= 0) {
        throw new InvalidArgumentException('Enter the amount Goodlucks actually received.');
    }

    $share = round((float)$record['goodlucks_share_ghs'], 2);
    $already = fee_remitted_total($recordId);
    if ($already + $amount - $share > 0.005) {
        throw new InvalidArgumentException('That is more than the agent still owes for this fee.');
    }

    $id = new_id('remit');
    db_exec(
        'INSERT INTO fee_remittances (id, viewing_fee_record_id, amount_ghs, method, reference,
                                      received_at, recorded_by, notes, created_at)
         VALUES (:id, :record_id, :amount, :method, :reference, :received_at, :recorded_by, :notes, :created_at)',
        [
            ':id'          => $id,
            ':record_id'   => $recordId,
            ':amount'      => $amount,
            ':method'      => clean_string($data['method'] ?? 'unknown', 60),
            ':reference'   => clean_string($data['reference'] ?? '', 128),
            ':received_at' => $data['received_at'] ?? gmdate('Y-m-d'),
            ':recorded_by' => (string)($data['recorded_by'] ?? ''),
            ':notes'       => clean_string($data['notes'] ?? '', 300),
            ':created_at'  => db_now(),
        ]
    );

    db_exec(
        'UPDATE viewing_fee_records SET updated_at = :updated WHERE id = :id',
        [':updated' => db_now(), ':id' => $recordId]
    );

    return [
        'id'     => $id,
        'record' => find_viewing_fee_record($recordId) ?? [],
    ];
}

/**
 * Move a fee record between `reported`, `confirmed_by_staff`, `disputed` and
 * `void`. Nothing is deleted: a mistake is voided and stays in the ledger.
 */
function set_viewing_fee_state(string $id, string $state, string $note, ?array $actor): array
{
    if (!in_array($state, VIEWING_FEE_COLLECTION_STATES, true)) {
        throw new InvalidArgumentException('Unknown fee record state.');
    }
    $record = find_viewing_fee_record($id);
    if (!$record) {
        throw new InvalidArgumentException('Viewing fee record not found.');
    }
    if ((string)$record['collection_state'] === 'void' && $state !== 'void') {
        throw new InvalidArgumentException('A void fee record cannot be reopened.');
    }
    if ($state === 'void' && fee_remitted_total($id) > 0) {
        throw new InvalidArgumentException('Money has already been remitted against this fee; voiding it would hide a receipt.');
    }

    db_exec(
        'UPDATE viewing_fee_records SET collection_state = :state, notes = :notes, updated_at = :updated WHERE id = :id',
        [
            ':state'   => $state,
            ':notes'   => clean_string($note, 500),
            ':updated' => db_now(),
            ':id'      => $id,
        ]
    );

    return find_viewing_fee_record($id) ?? [];
}

/**
 * The active fee-sharing policy, if — and only if — one has been approved.
 *
 * Returns null when no approved row exists, which is the shipped state: the
 * 60/40 and 70/30 proposals must not be used for any calculation before the
 * owner approves them in writing.
 */
function active_fee_policy(): ?array
{
    $row = db_one(
        "SELECT * FROM fee_policies WHERE status = 'approved' ORDER BY effective_from DESC, created_at DESC LIMIT 1"
    );
    if (!$row) {
        return null;
    }
    return [
        'id'                   => (string)$row['id'],
        'tier'                 => (string)$row['tier'],
        'agentSharePercent'    => (float)$row['agent_share_percent'],
        'goodlucksSharePercent' => (float)$row['goodlucks_share_percent'],
        'approvedBy'           => (string)($row['approved_by'] ?? ''),
        'approvedAt'           => to_iso($row['approved_at'] ?? null),
        'effectiveFrom'        => (string)($row['effective_from'] ?? ''),
    ];
}

/**
 * Policy state for the ledger screen and `GET /admin/viewing-fees/policy`.
 *
 * Increment E keeps the Increment B keys (`status`, `approvedPolicy`,
 * `proposed`, `appliedToCalculations`) so existing clients and tests keep
 * working, and adds the full policy list, tiers and categories. `proposed` holds
 * the untouched 60/40 and 70/30 *proposals*, labelled and never applied.
 */
function fee_policy_status(): array
{
    $overview = fee_policy_overview();
    $active = $overview['activePolicies'][0] ?? null;

    return [
        'status'                => $active ? 'approved' : PROPOSED_FEE_POLICY_STATUS,
        'appliedToCalculations' => false,
        'approvedPolicy'        => $active ? [
            'id'                    => $active['id'],
            'tier'                  => $active['agentTier'],
            'agentSharePercent'     => $active['agentSharePercent'],
            'goodlucksSharePercent' => $active['goodlucksSharePercent'],
            'approvedBy'            => $active['approvedBy'],
            'approvedAt'            => $active['approvedAt'] ?: null,
            'effectiveFrom'         => $active['effectiveFrom'],
        ] : null,
        'proposed'              => array_map(
            static fn(array $proposal): array => [
                'tier'                  => $proposal['agentTier'],
                'label'                 => $proposal['label'],
                'agentSharePercent'     => $proposal['agentSharePercent'],
                'goodlucksSharePercent' => $proposal['goodlucksSharePercent'],
                'status'                => 'provisional',
                'appliedToCalculations' => false,
            ],
            $overview['proposed']
        ),
        'activePolicies'        => $overview['activePolicies'],
        'counts'                => $overview['counts'],
        'note'                  => $overview['note'],
    ];
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
// Rent payment records — write/read helpers removed (Upgrade 2, E1)
//
// Nothing in the platform issues, lists or fetches a rent receipt any more. The
// data stays: `rent_receipts` is untouched by this removal, and the fee ledger
// (`fee_remittances`, its reversals and the fee policies) never used these
// helpers.
// ---------------------------------------------------------------------------

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

/** Mark every unread notification for a user as read. Returns the row count. */
function mark_all_notifications_read(array $user): int
{
    return db_exec(
        'UPDATE notifications SET is_read = 1 WHERE user_id = :uid AND is_read = 0',
        [':uid' => $user['id']]
    );
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
    $totalAgents = (int)db_value("SELECT COUNT(*) FROM users WHERE role = 'agent'");
    $pendingAgents = (int)db_value("SELECT COUNT(*) FROM agent_profiles WHERE account_status = 'pending_review'");
    $newUsersToday = (int)db_value('SELECT COUNT(*) FROM users WHERE created_at >= :since', [':since' => $today]);
    $newUsersThisWeek = (int)db_value('SELECT COUNT(*) FROM users WHERE created_at >= :since', [':since' => $sevenDays]);

    $totalViewings = (int)db_value('SELECT COUNT(*) FROM viewing_schedules');
    $completedViewings = (int)db_value("SELECT COUNT(*) FROM viewing_schedules WHERE status = 'completed'");

    // Increment B: viewing-fee money is reported in four separate figures and
    // never as a single "revenue" number. Only remittances are Goodlucks money.
    $feeSummary = viewing_fee_summary();

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
        'totalAgents'          => $totalAgents,
        'pendingAgentAccounts' => $pendingAgents,
        'newUsersToday'        => $newUsersToday,
        'newUsersThisWeek'     => $newUsersThisWeek,
        'totalProperties'      => $totalProperties,
        'approvedProperties'   => $propertyStatusCounts['active'] ?? 0,
        'pendingProperties'    => $propertyStatusCounts['pending'] ?? 0,
        'rejectedProperties'   => $propertyStatusCounts['rejected'] ?? 0,
        'totalViewings'        => $totalViewings,
        'completedViewings'    => $completedViewings,
        // Money collected by agents on site (reported) — NOT Goodlucks revenue.
        'viewingFeesCollectedGhs'   => $feeSummary['viewingFeesCollectedGhs'],
        // Share owed to Goodlucks under explicitly agreed amounts.
        'goodlucksShareDueGhs'      => $feeSummary['goodlucksShareDueGhs'],
        // Money Goodlucks actually received. This is the only revenue figure.
        'goodlucksShareReceivedGhs' => $feeSummary['goodlucksShareReceivedGhs'],
        'agentShareRetainedGhs'     => $feeSummary['agentShareRetainedGhs'],
        'outstandingReceivablesGhs' => $feeSummary['outstandingReceivablesGhs'],
        'viewingFeeRecordsWithoutShare' => $feeSummary['recordsWithoutAgreedShare'],
        'viewingFeeDisputedRecords'     => $feeSummary['disputedRecords'],
        'totalEnquiries'       => (int)db_value('SELECT COUNT(*) FROM enquiries'),
        'newEnquiries'         => (int)db_value("SELECT COUNT(*) FROM enquiries WHERE status = 'new'"),
        'totalTenantRequests'  => (int)db_value('SELECT COUNT(*) FROM tenant_requests'),
        'dailyTraffic'         => $dailyTraffic,
        'monthlyTraffic'       => $monthlyTraffic,
    ];
}
