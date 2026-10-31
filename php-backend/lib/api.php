<?php
/**
 * Goodlucks Homes - API router & request handlers
 *
 * Single source of truth for every API route. `index.php` is the front
 * controller; the legacy *.php endpoint files simply delegate here so old
 * links/bookmarks keep working.
 */

declare(strict_types=1);

/**
 * Dispatch the current HTTP request to the matching handler.
 */
function dispatch_api_request(): void
{
    $method = request_method();
    $path = request_path();

    try {
        if ($method !== 'GET' && $method !== 'HEAD') {
            require_trusted_origin();
        }

        $route = resolve_route($method, $path);
        if ($route === null) {
            error_response('Endpoint not found.', 404);
        }
        [$handler, $params] = $route;
        $handler($params);
    } catch (Throwable $e) {
        server_error_response($e);
    }
}

/**
 * @return array{0: callable, 1: array}|null
 */
function resolve_route(string $method, string $path): ?array
{
    $normalized = '/' . trim($path, '/');
    // Accept the legacy .php suffixes (/properties.php, /health.php, ...)
    $normalized = preg_replace('#\.php$#', '', $normalized) ?? $normalized;

    $routes = [
        // --- Health -----------------------------------------------------
        ['GET', '#^/health$#', 'handle_health'],

        // --- Auth -------------------------------------------------------
        ['POST', '#^/auth/register$#', 'handle_register'],
        ['POST', '#^/auth/login$#', 'handle_login'],
        ['POST', '#^/auth/admin-login$#', 'handle_admin_login'],
        ['POST', '#^/auth/password-reset/request$#', 'handle_password_reset_request'],
        ['POST', '#^/auth/password-reset/confirm$#', 'handle_password_reset_confirm'],
        ['POST', '#^/auth/logout$#', 'handle_logout'],
        ['GET',  '#^/auth/me$#', 'handle_me'],
        ['PUT',  '#^/profile$#', 'handle_update_profile'],

        // --- Properties -------------------------------------------------
        ['GET',  '#^/matches$#', 'handle_matches'],
        ['GET',  '#^/properties$#', 'handle_list_properties'],
        ['POST', '#^/properties$#', 'handle_create_property'],
        ['GET',  '#^/properties/([A-Za-z0-9\-_]+)$#', 'handle_get_property'],
        ['PUT',  '#^/properties/([A-Za-z0-9\-_]+)$#', 'handle_update_property'],
        ['DELETE', '#^/properties/([A-Za-z0-9\-_]+)$#', 'handle_delete_property'],
        ['POST', '#^/properties/([A-Za-z0-9\-_]+)/status$#', 'handle_property_status'],
        ['POST', '#^/properties/([A-Za-z0-9\-_]+)/feature$#', 'handle_property_feature'],
        ['POST', '#^/properties/([A-Za-z0-9\-_]+)/verify$#', 'handle_property_verify'],
        ['GET',  '#^/admin/properties$#', 'handle_admin_properties'],

        // --- Uploads ----------------------------------------------------
        ['POST', '#^/uploads$#', 'handle_upload'],
        ['GET',  '#^/uploads/([A-Za-z0-9\-_.]+)$#', 'handle_serve_upload'],

        // --- Enquiries --------------------------------------------------
        ['POST', '#^/enquiries$#', 'handle_create_enquiry'],
        ['GET',  '#^/admin/enquiries$#', 'handle_admin_enquiries'],
        ['PATCH', '#^/admin/enquiries/([A-Za-z0-9\-_]+)$#', 'handle_update_enquiry'],

        // --- Tenant requests -------------------------------------------
        ['POST', '#^/tenant-requests$#', 'handle_create_tenant_request'],
        ['POST', '#^/tenant_requests$#', 'handle_create_tenant_request'],
        ['GET',  '#^/tenant-requests$#', 'handle_list_tenant_requests'],
        ['GET',  '#^/admin/tenant-requests$#', 'handle_list_tenant_requests'],
        ['PATCH', '#^/tenant-requests/([A-Za-z0-9\-_]+)$#', 'handle_update_tenant_request'],

        // --- Viewings ---------------------------------------------------
        ['POST', '#^/viewing-requests$#', 'handle_create_viewing'],
        ['POST', '#^/viewing-request$#', 'handle_create_viewing'],
        ['POST', '#^/viewing_request$#', 'handle_create_viewing'],
        ['GET',  '#^/viewings$#', 'handle_list_viewings'],
        ['GET',  '#^/admin/viewings$#', 'handle_list_viewings'],
        ['PATCH', '#^/viewings/([A-Za-z0-9\-_]+)$#', 'handle_update_viewing'],

        // --- Alerts -----------------------------------------------------
        ['POST', '#^/price-alerts$#', 'handle_create_price_alert'],
        ['POST', '#^/price_alerts$#', 'handle_create_price_alert'],
        ['GET',  '#^/admin/price-alerts$#', 'handle_list_price_alerts'],
        ['POST', '#^/search-alerts$#', 'handle_create_search_alert'],
        ['GET',  '#^/search-alerts$#', 'handle_list_search_alerts'],
        ['DELETE', '#^/search-alerts/([A-Za-z0-9\-_]+)$#', 'handle_delete_search_alert'],

        // --- Saved properties -------------------------------------------
        ['GET',  '#^/saved-properties$#', 'handle_list_saved'],
        ['POST', '#^/saved-properties$#', 'handle_save_property'],
        ['DELETE', '#^/saved-properties/([A-Za-z0-9\-_]+)$#', 'handle_unsave_property'],

        // --- Agreements & receipts --------------------------------------
        ['GET',  '#^/agreements$#', 'handle_list_agreements'],
        ['POST', '#^/agreements$#', 'handle_create_agreement'],
        ['POST', '#^/agreements/([A-Za-z0-9\-_]+)/sign$#', 'handle_sign_agreement'],
        ['POST', '#^/agreements/([A-Za-z0-9\-_]+)/email$#', 'handle_email_agreement'],
        ['GET',  '#^/receipts$#', 'handle_list_receipts'],
        ['POST', '#^/receipts$#', 'handle_create_receipt'],

        // --- Notifications ----------------------------------------------
        ['GET',  '#^/notifications$#', 'handle_list_notifications'],
        ['PATCH', '#^/notifications/([A-Za-z0-9\-_]+)$#', 'handle_mark_notification'],
        ['POST', '#^/notifications/read-all$#', 'handle_mark_all_notifications'],

        // --- Admin ------------------------------------------------------
        ['GET',  '#^/admin/stats$#', 'handle_admin_stats'],
        ['GET',  '#^/admin/email-logs$#', 'handle_admin_email_logs'],
        ['POST', '#^/admin/alerts/run$#', 'handle_run_alert_digest'],
        ['POST', '#^/admin/emails/run$#', 'handle_run_email_outbox'],

        ['GET',  '#^/sitemap\.xml$#', 'handle_sitemap'],

        // --- Utility ----------------------------------------------------
        ['POST', '#^/track/pageview$#', 'handle_track_pageview'],
        ['POST', '#^/ai/describe$#', 'handle_ai_describe'],
        ['POST', '#^/ai/match$#', 'handle_ai_match'],
        ['POST', '#^/send-email$#', 'handle_send_email'],
        ['POST', '#^/send_email$#', 'handle_send_email'],
    ];

    foreach ($routes as [$routeMethod, $pattern, $handlerName]) {
        if ($routeMethod !== $method) {
            continue;
        }
        if (preg_match($pattern, $normalized, $matches)) {
            array_shift($matches);
            return [$handlerName, $matches];
        }
    }

    return null;
}

// ===========================================================================
// Health
// ===========================================================================
function handle_health(): void
{
    $pdo = db();
    $propertiesCount = (int)db_value('SELECT COUNT(*) FROM properties');
    json_response([
        'status'             => 'ok',
        'platform'           => 'Goodlucks Homes API',
        'php_version'        => PHP_VERSION,
        'driver'             => db_driver(),
        'database_connected' => true,
        'properties_count'   => $propertiesCount,
        'timestamp'          => gmdate('c'),
    ]);
}

// ===========================================================================
// Authentication
// ===========================================================================
function handle_register(): void
{
    enforce_rate_limit('register', 10, 3600);
    $input = request_json();

    $validator = new Validator();
    $validator->required('name', $input['name'] ?? '', 'Full name', 2);
    $validator->email('email', $input['email'] ?? '');
    $validator->phone('phone', $input['phone'] ?? '');
    $password = is_string($input['password'] ?? null) ? (string)$input['password'] : '';
    if (!password_is_strong_enough($password)) {
        $validator->add('password', 'Password must be at least 8 characters.');
    }
    $role = one_of($input['role'] ?? 'tenant', ['tenant', 'landlord'], 'tenant');
    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }

    $email = valid_email($input['email']);
    if (find_user_by_email((string)$email)) {
        error_response('An account with this email already exists. Please sign in instead.', 409, [
            'email' => 'This email is already registered.',
        ]);
    }

    try {
        $user = create_user([
            'email'         => $email,
            'name'          => clean_string($input['name'], 120),
            'role'          => $role,
            'phone'         => (string)valid_phone($input['phone']),
            'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            'preferred_locations' => clean_string_list($input['preferredLocations'] ?? []),
            'budget_min'    => valid_money($input['budgetMin'] ?? null, 0),
            'budget_max'    => valid_money($input['budgetMax'] ?? null, 0),
            'preferred_bedrooms' => valid_int($input['preferredBedrooms'] ?? null, 0, 20),
        ]);
    } catch (Throwable $e) {
        if (db_is_unique_violation($e)) {
            error_response('An account with this email already exists.', 409);
        }
        throw $e;
    }

    issue_session((string)$user['id']);

    send_email(
        (string)$user['email'],
        (string)$user['name'],
        'Welcome to Goodlucks Homes',
        email_html_template(
            'Welcome to Goodlucks Homes',
            '<h3 style="color:#FFFFFF;margin:0 0 12px 0;">Your ' . e(ucfirst($role)) . ' account is ready</h3>'
            . '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e($user['name']) . ',</p>'
            . '<p style="color:#CBD5E1;font-size:14px;">Your Goodlucks Homes account has been created successfully. '
            . ($role === 'landlord'
                ? 'You can now submit properties for verification from your landlord dashboard.'
                : 'You can now save properties, request viewings and submit property-matching requests.')
            . '</p>'
            . '<p style="color:#94A3B8;font-size:12px;">If you did not create this account, please contact ' . e(OFFICIAL_EMAIL) . ' immediately.</p>'
        ),
        'registration',
        'Welcome to Goodlucks Homes - ' . ucfirst($role) . ' account created'
    );

    create_notification((string)$user['id'], 'Welcome to Goodlucks Homes', 'Your account has been created successfully.', 'success');

    json_response(['success' => true, 'user' => public_user($user)], 201);
}

function handle_login(): void
{
    $input = request_json();

    $email = valid_email($input['email'] ?? null);
    $password = is_string($input['password'] ?? null) ? (string)$input['password'] : '';

    if ($email === null || $password === '') {
        error_response('Enter your email address and password.', 422);
    }

    // Two buckets: a generous per-IP ceiling (stops credential stuffing across
    // many emails) and a tight per-email one (stops guessing one password).
    enforce_rate_limit('login-ip', 60, 900);
    enforce_rate_limit('login', 12, 900, $email);

    $user = find_user_by_email($email);

    // Constant-ish time behaviour: always run a hash comparison.
    $storedHash = $user['password_hash'] ?? '$2y$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    $passwordOk = password_verify($password, (string)$storedHash);

    if (!$user || !$passwordOk) {
        gl_log('warning', 'Failed login attempt', ['email' => $email]);
        error_response('Invalid email address or password.', 401);
    }

    if (($user['role'] ?? '') === 'admin') {
        // Admin accounts must use the dedicated admin console.
        error_response('Administrator accounts must sign in through the admin console.', 403);
    }

    $requestedRole = one_of($input['role'] ?? null, ['tenant', 'landlord'], null);
    if ($requestedRole !== null && $requestedRole !== $user['role']) {
        error_response(
            'This email is registered as a ' . ucfirst((string)$user['role']) . ' account. Please sign in using the '
            . ucfirst((string)$user['role']) . ' tab.',
            403
        );
    }

    // Genuine credentials wipe the failed-attempt counter for this account.
    clear_rate_limit('login', 900, $email);

    issue_session((string)$user['id']);
    gl_log('info', 'User signed in', ['user_id' => $user['id'], 'role' => $user['role']]);

    json_response(['success' => true, 'user' => public_user($user)]);
}

function handle_admin_login(): void
{
    $input = request_json();

    $email = valid_email($input['email'] ?? null);
    $password = is_string($input['password'] ?? null) ? (string)$input['password'] : '';
    $accessKey = clean_string($input['accessKey'] ?? $input['securityCode'] ?? '', 200);

    if ($email === null || $password === '') {
        error_response('Enter your administrator email and password.', 422);
    }

    enforce_rate_limit('admin-login-ip', 40, 900);
    enforce_rate_limit('admin-login', 6, 900, $email);

    $user = find_user_by_email($email);
    $storedHash = $user['password_hash'] ?? '$2y$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    $passwordOk = password_verify($password, (string)$storedHash);

    $requiredAccessKey = trim((string)cfg('ADMIN_ACCESS_KEY', ''));
    $accessKeyOk = $requiredAccessKey === '' || hash_equals($requiredAccessKey, $accessKey);

    if (!$user || !$passwordOk || ($user['role'] ?? '') !== 'admin' || !$accessKeyOk) {
        gl_log('warning', 'Failed admin login attempt', ['email' => $email, 'key_required' => $requiredAccessKey !== '']);
        error_response('Invalid administrator credentials.', 401);
    }

    clear_rate_limit('admin-login', 900, $email);

    issue_session((string)$user['id']);
    gl_log('info', 'Administrator signed in', ['user_id' => $user['id']]);

    json_response(['success' => true, 'user' => public_user($user)]);
}

/**
 * Start a password reset.
 *
 * The response is always the same, whether or not the address is registered, so
 * this endpoint cannot be used to discover who has an account.
 */
function handle_password_reset_request(): void
{
    $input = request_json();
    $email = valid_email($input['email'] ?? null);

    if ($email === null) {
        error_response('Enter the email address on your account.', 422, ['email' => 'Enter a valid email address.']);
    }

    enforce_rate_limit('password-reset-ip', 20, 3600);
    enforce_rate_limit('password-reset', 5, 3600, $email);

    $user = find_user_by_email($email);
    $genericMessage = 'If that email is registered with Goodlucks Homes, a reset link is on its way. It expires in one hour.';

    if (!$user) {
        gl_log('info', 'Password reset requested for unknown email');
        json_response(['success' => true, 'message' => $genericMessage]);
    }

    $reset = create_password_reset((string)$user['id']);
    $link = SITE_URL . '/?reset=' . urlencode($reset['token']);

    $body = '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e((string)$user['name']) . ',</p>'
        . '<p style="color:#CBD5E1;font-size:14px;">We received a request to reset the password on your Goodlucks Homes account.</p>'
        . '<p style="margin:22px 0;"><a href="' . e($link) . '" style="background:#08D9D6;color:#252A34;padding:12px 22px;border-radius:10px;'
        . 'font-weight:bold;text-decoration:none;font-size:14px;">Set a new password</a></p>'
        . '<p style="color:#94A3B8;font-size:12px;">This link expires in one hour and can only be used once. '
        . 'If you did not request it, you can ignore this email — your password has not changed.</p>'
        . '<p style="color:#94A3B8;font-size:11px;word-break:break-all;">' . e($link) . '</p>';

    send_email(
        $email,
        (string)$user['name'],
        'Reset your Goodlucks Homes password',
        email_html_template('Password reset', $body),
        'password_reset',
        'Password reset requested'
    );

    gl_log('info', 'Password reset token issued', ['user_id' => $user['id']]);

    json_response(['success' => true, 'message' => $genericMessage]);
}

/** Finish a password reset with a valid token. */
function handle_password_reset_confirm(): void
{
    $input = request_json();
    $token = trim((string)($input['token'] ?? ''));
    $password = is_string($input['password'] ?? null) ? (string)$input['password'] : '';

    if ($token === '') {
        error_response('This reset link is incomplete. Request a new one.', 422, ['token' => 'Missing token.']);
    }

    if (!password_is_strong_enough($password)) {
        error_response('Please correct the highlighted fields.', 422, [
            'password' => 'Password must be at least 8 characters.',
        ]);
    }

    enforce_rate_limit('password-reset-confirm', 20, 3600);

    $reset = find_password_reset($token);
    if (!$reset) {
        error_response('This reset link has expired or was already used. Request a new one.', 400, [
            'token' => 'Invalid or expired token.',
        ]);
    }

    $user = find_user_by_id((string)$reset['user_id']);
    if (!$user) {
        error_response('This reset link is no longer valid.', 400);
    }

    update_user((string)$user['id'], ['password_hash' => password_hash($password, PASSWORD_BCRYPT)]);
    consume_password_reset($reset);

    create_notification((string)$user['id'], 'Password changed', 'Your password was reset. All other devices were signed out.', 'success');
    gl_log('info', 'Password reset completed', ['user_id' => $user['id']]);

    json_response([
        'success' => true,
        'message' => 'Your password has been updated. Please sign in with the new password.',
    ]);
}

function handle_logout(): void
{
    revoke_current_session();
    json_response(['success' => true]);
}

function handle_me(): void
{
    $user = auth_user();
    json_response([
        'success'        => true,
        'user'           => $user ? public_user($user) : null,
        'role'           => $user['role'] ?? 'guest',
        'savedPropertyIds' => $user ? list_saved_property_ids((string)$user['id']) : [],
    ]);
}

function handle_update_profile(): void
{
    $user = require_auth();
    $input = request_json();

    $validator = new Validator();
    $validator->required('name', $input['name'] ?? '', 'Full name', 2);
    if (array_key_exists('phone', $input) && trim((string)$input['phone']) !== '') {
        $validator->phone('phone', $input['phone']);
    }
    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }

    $fields = [
        'name'    => clean_string($input['name'], 120),
        'phone'   => trim((string)($input['phone'] ?? '')),
        'address' => clean_string($input['address'] ?? '', 255),
        'company' => clean_string($input['company'] ?? '', 255),
        'bio'     => clean_text($input['bio'] ?? '', 1000),
    ];

    if (isset($input['avatar']) && is_string($input['avatar'])) {
        $avatar = clean_string($input['avatar'], 500);
        if ($avatar === '' || preg_match('#^(https?://|/api/uploads/)#', $avatar)) {
            $fields['avatar'] = $avatar;
        }
    }
    if (isset($input['preferredLocations'])) {
        $fields['preferred_locations'] = json_encode(clean_string_list($input['preferredLocations']));
    }
    if (array_key_exists('budgetMin', $input)) {
        $fields['budget_min'] = valid_money($input['budgetMin'], 0);
    }
    if (array_key_exists('budgetMax', $input)) {
        $fields['budget_max'] = valid_money($input['budgetMax'], 0);
    }
    if (array_key_exists('preferredBedrooms', $input)) {
        $fields['preferred_bedrooms'] = valid_int($input['preferredBedrooms'], 0, 20);
    }
    if (array_key_exists('additionalNotes', $input)) {
        $fields['additional_notes'] = clean_text($input['additionalNotes'], 2000);
    }
    if (!empty($input['password']) && is_string($input['password'])) {
        if (!password_is_strong_enough($input['password'])) {
            error_response('Password must be at least 8 characters.', 422, ['password' => 'Use at least 8 characters.']);
        }
        $fields['password_hash'] = password_hash($input['password'], PASSWORD_BCRYPT);
    }

    update_user((string)$user['id'], $fields);
    $updated = find_user_by_id((string)$user['id']);

    json_response(['success' => true, 'user' => $updated ? public_user($updated) : null]);
}

// ===========================================================================
// Properties
// ===========================================================================
function handle_list_properties(): void
{
    $user = auth_user();
    $statuses = ['active'];

    $mine = query_param('mine') === '1';
    if ($mine) {
        $user = require_auth(['landlord', 'admin']);
        $filters = ['landlordId' => $user['id']];
    } elseif (is_admin($user) && query_param('all') === '1') {
        $filters = [];
        if (query_param('status')) {
            $filters['status'] = (string)query_param('status');
        }
    } else {
        $filters = ['status' => $statuses];
    }

    $filters['q'] = query_param('q');
    $filters['location'] = query_param('location');
    $filters['city'] = query_param('city');
    $filters['type'] = query_param('type');
    $filters['bedrooms'] = query_param('bedrooms');
    $filters['minRent'] = query_param('minRent');
    $filters['maxRent'] = query_param('maxRent');
    $filters['sort'] = query_param('sort', 'featured');
    $filters['page'] = query_param('page', 1);
    $filters['perPage'] = query_param('perPage', 60);

    $result = query_properties($filters);

    json_response([
        'success'   => true,
        'count'     => count($result['items']),
        'total'     => $result['total'],
        'page'      => $result['page'],
        'perPage'   => $result['perPage'],
        'properties'=> $result['items'],
    ]);
}

function handle_get_property(array $params): void
{
    $id = (string)($params[0] ?? query_param('id', ''));
    if ($id === '') {
        error_response('Property id is required.', 400);
    }

    $row = find_property($id);
    if (!$row) {
        error_response('Property not found.', 404);
    }

    $user = auth_user();
    $isPublic = in_array($row['status'], ['active', 'rented'], true);
    if (!$isPublic && !is_admin($user) && !($user && can_manage_property($user, $row))) {
        // Do not reveal that a hidden listing exists.
        error_response('Property not found.', 404);
    }

    // Count public views only (never inflate with owner/admin previews)
    if ($isPublic) {
        increment_property_views($id);
        $row['views_count'] = (int)$row['views_count'] + 1;
    }

    json_response(['success' => true, 'property' => shape_property($row)]);
}

/**
 * Validate + normalise a property payload coming from the client.
 *
 * @return array{0: array, 1: Validator}
 */
function property_payload(array $input, bool $isUpdate = false): array
{
    $validator = new Validator();
    $data = [];

    if (!$isUpdate || array_key_exists('title', $input)) {
        $validator->required('title', $input['title'] ?? '', 'Property title', 4);
        $data['title'] = clean_string($input['title'] ?? '', 200);
    }
    if (!$isUpdate || array_key_exists('location', $input)) {
        $validator->required('location', $input['location'] ?? '', 'Location', 2);
        $data['location'] = clean_string($input['location'] ?? '', 200);
    }
    if (!$isUpdate || array_key_exists('city', $input)) {
        $data['city'] = clean_string($input['city'] ?? 'Accra', 100) ?: 'Accra';
    }
    if (!$isUpdate || array_key_exists('rentGhs', $input)) {
        $rent = valid_money($input['rentGhs'] ?? null, 1, 10000000);
        if ($rent === null) {
            $validator->add('rentGhs', 'Enter a valid monthly rent greater than zero.');
        } else {
            $data['rent_ghs'] = $rent;
        }
    }
    if (!$isUpdate || array_key_exists('bedrooms', $input)) {
        $bedrooms = valid_int($input['bedrooms'] ?? 0, 0, 50);
        if ($bedrooms === null) {
            $validator->add('bedrooms', 'Enter a valid number of bedrooms.');
        } else {
            $data['bedrooms'] = $bedrooms;
        }
    }
    if (!$isUpdate || array_key_exists('bathrooms', $input)) {
        $bathrooms = valid_int($input['bathrooms'] ?? 0, 0, 50);
        if ($bathrooms === null) {
            $validator->add('bathrooms', 'Enter a valid number of bathrooms.');
        } else {
            $data['bathrooms'] = $bathrooms;
        }
    }
    if (!$isUpdate || array_key_exists('propertyType', $input)) {
        $type = one_of($input['propertyType'] ?? 'Apartment', PROPERTY_TYPES, 'Apartment');
        $data['property_type'] = $type;
    }
    if (!$isUpdate || array_key_exists('description', $input)) {
        $validator->required('description', $input['description'] ?? '', 'Description', 20);
        $data['description'] = clean_text($input['description'] ?? '', 8000);
    }
    if (array_key_exists('availability', $input)) {
        $data['availability'] = clean_string($input['availability'] ?? 'Available Now', 100) ?: 'Available Now';
    }
    if (array_key_exists('images', $input)) {
        $images = [];
        foreach (clean_string_list($input['images'], 15, 600) as $url) {
            // Only allow http(s) links or our own upload paths. Blocks
            // javascript:, data: and other scheme-based XSS vectors.
            if (preg_match('#^https?://#i', $url) || preg_match('#^/api/uploads/[A-Za-z0-9\-_.]+$#', $url)) {
                $images[] = $url;
            }
        }
        $data['images'] = $images;
        if ($images === [] && !$isUpdate) {
            $validator->add('images', 'Add at least one property image.');
        }
    }
    if (array_key_exists('amenities', $input)) {
        $data['amenities'] = clean_string_list($input['amenities'], 30, 80);
    }
    if (array_key_exists('nearbyPlaces', $input)) {
        $data['nearby_places'] = clean_nearby_places($input['nearbyPlaces']);
    }
    if (array_key_exists('featured', $input)) {
        $data['featured'] = (bool)$input['featured'];
    }

    return [$data, $validator];
}

function handle_create_property(): void
{
    $user = require_auth(['landlord', 'admin']);
    enforce_rate_limit('property-create', 30, 3600);

    [$data, $validator] = property_payload(request_json(), false);
    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }

    // Landlord submissions always start in the moderation queue.
    $data['status'] = $user['role'] === 'admin'
        ? one_of(request_json()['status'] ?? 'active', PROPERTY_STATUSES, 'pending')
        : 'pending';
    $data['landlord_id'] = $user['role'] === 'admin' && !empty(request_json()['landlordId'])
        ? clean_string(request_json()['landlordId'], 64)
        : (string)$user['id'];
    $data['landlord_name'] = (string)$user['name'];
    $data['landlord_company'] = (string)($user['company'] ?? '');
    // Verification is earned: staff inspect the property, then tick it off in
    // the console. Admin-created listings are trusted on creation.
    $data['is_landlord_verified'] = $user['role'] === 'admin' ? 1 : 0;

    $id = create_property($data);
    $created = find_property($id);

    // An admin can publish immediately; landlords go to the queue and are
    // matched when approved.
    if ($created && ($created['status'] ?? '') === 'active') {
        try {
            dispatch_search_alert_matches($created);
        } catch (Throwable $e) {
            gl_log('error', 'Search alert dispatch failed: ' . $e->getMessage(), ['property' => $id]);
        }
    }

    if ($user['role'] === 'landlord') {
        send_email(
            (string)$user['email'],
            (string)$user['name'],
            'Property submission received: ' . $data['title'],
            email_html_template(
                'Property submitted for verification',
                '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e($user['name']) . ',</p>'
                . '<p style="color:#CBD5E1;font-size:14px;">We have received your listing <strong>' . e($data['title']) . '</strong> in '
                . e($data['location']) . '. Our team will physically verify the property before it goes live.</p>'
                . '<p style="color:#94A3B8;font-size:13px;">Monthly rent: GH₵ ' . number_format((float)$data['rent_ghs'], 2) . '</p>'
            ),
            'property_submission',
            'Property submission received: ' . $data['title']
        );

        // Let the operations team know a listing is waiting.
        foreach (db_all("SELECT email, name FROM users WHERE role = 'admin' LIMIT 10") as $admin) {
            send_email(
                (string)$admin['email'],
                (string)$admin['name'],
                'New property awaiting approval: ' . $data['title'],
                email_html_template(
                    'New property awaiting approval',
                    '<p style="color:#CBD5E1;font-size:14px;">' . e($user['name']) . ' submitted <strong>' . e($data['title'])
                    . '</strong> in ' . e($data['location']) . ' (GH₵ ' . number_format((float)$data['rent_ghs'], 2) . '/mo).</p>'
                ),
                'property_submission',
                'New property awaiting approval'
            );
        }
    }

    json_response([
        'success'  => true,
        'message'  => $user['role'] === 'admin' ? 'Property created.' : 'Property submitted for verification.',
        'property' => $created ? shape_property($created) : null,
    ], 201);
}

function handle_update_property(array $params): void
{
    $id = (string)($params[0] ?? '');
    $user = require_auth(['landlord', 'admin']);

    $row = find_property($id);
    if (!$row) {
        error_response('Property not found.', 404);
    }
    if (!can_manage_property($user, $row)) {
        error_response('You do not have permission to edit this property.', 403);
    }

    // Optimistic concurrency: if the client is editing a copy of the record that
    // has since changed, refuse the write instead of silently overwriting the
    // other editor's work.
    $expectedUpdatedAt = trim((string)(request_json()['updatedAt'] ?? ''));
    if ($expectedUpdatedAt !== '') {
        $currentUpdatedAt = (string)($row['updated_at'] ?? '');
        $expectedTs = strtotime($expectedUpdatedAt);
        $currentTs = $currentUpdatedAt !== '' ? strtotime($currentUpdatedAt) : false;

        if ($expectedTs !== false && $currentTs !== false && $expectedTs !== $currentTs) {
            json_response([
                'success' => false,
                'error'   => 'This listing was changed by someone else while you were editing it. Reload and try again.',
                'code'    => 'stale_property',
                'property' => shape_property($row),
            ], 409);
        }
    }

    [$data, $validator] = property_payload(request_json(), true);
    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }
    if (empty($data)) {
        error_response('No changes were provided.', 400);
    }

    if ($user['role'] !== 'admin') {
        // Landlords cannot change moderation state or the featured flag.
        unset($data['status'], $data['featured']);
    } elseif (array_key_exists('status', request_json())) {
        $data['status'] = one_of(request_json()['status'], PROPERTY_STATUSES, (string)$row['status']);
    }

    $oldRent = (float)($row['rent_ghs'] ?? 0);

    update_property($id, $data);
    $updated = find_property($id);

    // A rent reduction is the one event price-drop subscribers care about.
    if ($updated) {
        $newRent = (float)($updated['rent_ghs'] ?? 0);
        if ($newRent > 0 && $newRent < $oldRent) {
            try {
                dispatch_price_drop_alerts($updated, $oldRent, $newRent);
            } catch (Throwable $e) {
                gl_log('error', 'Price drop dispatch failed: ' . $e->getMessage(), ['property' => $id]);
            }
        }
    }

    json_response(['success' => true, 'property' => $updated ? shape_property($updated) : null]);
}

function handle_delete_property(array $params): void
{
    $id = (string)($params[0] ?? '');
    $user = require_auth(['landlord', 'admin']);

    $row = find_property($id);
    if (!$row) {
        error_response('Property not found.', 404);
    }
    if (!can_manage_property($user, $row)) {
        error_response('You do not have permission to delete this property.', 403);
    }

    // Soft delete: keeps enquiries/viewings/agreement history intact while
    // removing the listing from public view.
    update_property($id, ['status' => 'deactivated']);

    if ($user['role'] === 'admin' && query_param('purge') === '1') {
        db_exec('DELETE FROM saved_properties WHERE property_id = :id', [':id' => $id]);
        db_exec('DELETE FROM properties WHERE id = :id', [':id' => $id]);
    }

    json_response(['success' => true, 'message' => 'Property removed from public listings.']);
}

function handle_property_status(array $params): void
{
    $id = (string)($params[0] ?? '');
    $user = require_admin();
    $row = find_property($id);
    if (!$row) {
        error_response('Property not found.', 404);
    }

    $input = request_json();
    $status = one_of($input['status'] ?? '', PROPERTY_STATUSES, null);
    if ($status === null) {
        error_response('Invalid property status.', 422, ['status' => 'Choose one of: ' . implode(', ', PROPERTY_STATUSES)]);
    }

    $wasActive = ((string)($row['status'] ?? '')) === 'active';

    update_property($id, ['status' => $status]);

    // Going live is the moment saved searches should hear about it.
    if ($status === 'active' && !$wasActive) {
        $live = find_property($id);
        if ($live) {
            try {
                dispatch_search_alert_matches($live);
            } catch (Throwable $e) {
                gl_log('error', 'Search alert dispatch failed: ' . $e->getMessage(), ['property' => $id]);
            }
        }
    }

    // Tell the landlord what happened.
    $landlord = find_user_by_id((string)$row['landlord_id']);
    if ($landlord) {
        if ($status === 'active') {
            send_email(
                (string)$landlord['email'],
                (string)$landlord['name'],
                'Property approved: ' . $row['title'],
                email_html_template(
                    'Your property is now live',
                    '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e($landlord['name']) . ',</p>'
                    . '<p style="color:#CBD5E1;font-size:14px;">Your listing <strong>' . e($row['title']) . '</strong> has been verified and is now live on Goodlucks Homes.</p>'
                ),
                'property_approval',
                'Property approved: ' . $row['title']
            );
            create_notification((string)$landlord['id'], 'Property approved', 'Your listing "' . $row['title'] . '" is now live.', 'success');
        } elseif ($status === 'rejected') {
            $note = clean_string($input['note'] ?? '', 500);
            send_email(
                (string)$landlord['email'],
                (string)$landlord['name'],
                'Property needs attention: ' . $row['title'],
                email_html_template(
                    'Property requires changes',
                    '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e($landlord['name']) . ',</p>'
                    . '<p style="color:#CBD5E1;font-size:14px;">Your listing <strong>' . e($row['title']) . '</strong> could not be approved yet.</p>'
                    . ($note !== '' ? '<p style="color:#F59E0B;font-size:13px;">Reviewer note: ' . e($note) . '</p>' : '')
                ),
                'property_rejection',
                'Property needs attention: ' . $row['title']
            );
            create_notification((string)$landlord['id'], 'Property requires changes', $note !== '' ? $note : 'Your listing was not approved.', 'warning');
        }
    }

    $updated = find_property($id);
    json_response(['success' => true, 'property' => $updated ? shape_property($updated) : null]);
}

/**
 * Mark a listing's landlord as verified (admin only).
 *
 * "Verified" is a physical-inspection claim made by Goodlucks staff, so it is
 * never set by the client and never defaults to true.
 */
function handle_property_verify(array $params): void
{
    require_admin();

    $id = (string)($params[0] ?? '');
    $row = find_property($id);
    if (!$row) {
        error_response('Property not found.', 404);
    }

    $input = request_json();
    $verified = filter_var($input['verified'] ?? true, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($verified === null) {
        error_response('Send verified=true or verified=false.', 422, ['verified' => 'Invalid value.']);
    }

    update_property($id, ['is_landlord_verified' => $verified ? 1 : 0]);
    $updated = find_property($id);

    json_response([
        'success'  => true,
        'property' => $updated ? shape_property($updated) : null,
        'message'  => $verified ? 'Landlord marked as verified.' : 'Verification removed.',
    ]);
}

function handle_property_feature(array $params): void
{
    $id = (string)($params[0] ?? '');
    require_admin();
    $row = find_property($id);
    if (!$row) {
        error_response('Property not found.', 404);
    }
    $input = request_json();
    $featured = array_key_exists('featured', $input) ? (bool)$input['featured'] : !((bool)$row['featured']);
    update_property($id, ['featured' => $featured]);
    $updated = find_property($id);
    json_response(['success' => true, 'property' => $updated ? shape_property($updated) : null]);
}

function handle_admin_properties(): void
{
    require_admin();
    $filters = [
        'status'  => query_param('status') ? (string)query_param('status') : null,
        'q'       => query_param('q'),
        'sort'    => query_param('sort', 'newest'),
        'page'    => query_param('page', 1),
        'perPage' => query_param('perPage', 100),
    ];
    if ($filters['status'] === null) {
        unset($filters['status']);
    }
    $result = query_properties($filters);
    json_response([
        'success'    => true,
        'count'      => count($result['items']),
        'total'      => $result['total'],
        'properties' => $result['items'],
    ]);
}

// ===========================================================================
// Image uploads
// ===========================================================================
function handle_upload(): void
{
    $user = require_auth(['landlord', 'admin']);
    enforce_rate_limit('upload', 120, 3600);

    if (!isset($_FILES['file']) && !isset($_FILES['files'])) {
        error_response('No file was uploaded.', 400, ['file' => 'Choose an image to upload.']);
    }

    if (!is_dir(UPLOAD_DIR) && !@mkdir(UPLOAD_DIR, 0755, true)) {
        gl_log('error', 'Upload directory could not be created: ' . UPLOAD_DIR);
        error_response('Uploads are temporarily unavailable.', 500);
    }

    $allowedTypes = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
        'image/gif'  => 'gif',
    ];

    $files = [];
    if (isset($_FILES['file']) && is_array($_FILES['file']['name'])) {
        foreach ($_FILES['file']['name'] as $index => $name) {
            $files[] = [
                'name'     => $name,
                'tmp_name' => $_FILES['file']['tmp_name'][$index] ?? '',
                'error'    => $_FILES['file']['error'][$index] ?? UPLOAD_ERR_NO_FILE,
                'size'     => $_FILES['file']['size'][$index] ?? 0,
            ];
        }
    } elseif (isset($_FILES['files']) && is_array($_FILES['files']['name'])) {
        foreach ($_FILES['files']['name'] as $index => $name) {
            $files[] = [
                'name'     => $name,
                'tmp_name' => $_FILES['files']['tmp_name'][$index] ?? '',
                'error'    => $_FILES['files']['error'][$index] ?? UPLOAD_ERR_NO_FILE,
                'size'     => $_FILES['files']['size'][$index] ?? 0,
            ];
        }
    } elseif (isset($_FILES['file'])) {
        $files[] = $_FILES['file'];
    }

    $urls = [];
    $errors = [];

    foreach (array_slice($files, 0, 10) as $file) {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $errors[] = 'One of the images failed to upload.';
            continue;
        }
        $size = (int)($file['size'] ?? 0);
        if ($size <= 0 || $size > UPLOAD_MAX_BYTES) {
            $errors[] = 'Each image must be smaller than ' . round(UPLOAD_MAX_BYTES / 1048576) . ' MB.';
            continue;
        }
        if (!is_uploaded_file((string)$file['tmp_name'])) {
            $errors[] = 'Invalid upload.';
            continue;
        }

        // Verify the real content type (never trust the client extension)
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string)$finfo->file((string)$file['tmp_name']);
        if (!isset($allowedTypes[$mime])) {
            $errors[] = 'Only JPG, PNG, WEBP or GIF images are allowed.';
            continue;
        }
        $dimensions = @getimagesize((string)$file['tmp_name']);
        if ($dimensions === false || $dimensions[0] < 50 || $dimensions[1] < 50) {
            $errors[] = 'One of the images is not a valid image file.';
            continue;
        }

        $filename = 'gl-' . gmdate('Ymd') . '-' . bin2hex(random_bytes(10)) . '.' . $allowedTypes[$mime];
        $target = rtrim(UPLOAD_DIR, '/') . '/' . $filename;
        if (!@move_uploaded_file((string)$file['tmp_name'], $target)) {
            gl_log('error', 'Could not move uploaded file', ['target' => $target]);
            $errors[] = 'The server could not save the image.';
            continue;
        }
        @chmod($target, 0644);
        $urls[] = UPLOAD_URL_PATH . '/' . $filename;
    }

    if (!$urls) {
        error_response($errors[0] ?? 'Upload failed.', 422, ['file' => $errors[0] ?? 'Upload failed.']);
    }

    json_response([
        'success' => true,
        'urls'    => $urls,
        'count'   => count($urls),
        'warnings'=> $errors,
    ], 201);
}

/**
 * Serve an uploaded image when the web server is not serving it directly
 * (e.g. PHP built-in dev server without static mapping). Never executes PHP.
 */
function handle_serve_upload(array $params): void
{
    $name = (string)($params[0] ?? '');
    if (!preg_match('/^[A-Za-z0-9\-_.]+$/', $name) || str_contains($name, '..')) {
        error_response('File not found.', 404);
    }
    $path = rtrim(UPLOAD_DIR, '/') . '/' . $name;
    if (!is_file($path)) {
        error_response('File not found.', 404);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path) ?: 'application/octet-stream';
    $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!in_array($mime, $allowed, true)) {
        error_response('File not found.', 404);
    }
    if (ob_get_length()) {
        @ob_clean();
    }
    http_response_code(200);
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (string)filesize($path));
    header('Cache-Control: public, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');
    readfile($path);
    exit;
}

// ===========================================================================
// Enquiries
// ===========================================================================
/**
 * Move an enquiry through the follow-up workflow (admin only).
 *
 * Without this, every enquiry stayed 'new' forever and the dashboard KPI
 * "new enquiries" could never differ from the total.
 */
function handle_update_enquiry(array $params): void
{
    require_admin();

    $id = (string)($params[0] ?? '');
    $row = db_one('SELECT * FROM enquiries WHERE id = :id LIMIT 1', [':id' => $id]);
    if (!$row) {
        error_response('Enquiry not found.', 404);
    }

    $input = request_json();
    $status = one_of($input['status'] ?? '', ENQUIRY_STATUSES, null);
    if ($status === null) {
        error_response('Invalid enquiry status.', 422, ['status' => 'Choose one of: ' . implode(', ', ENQUIRY_STATUSES)]);
    }

    db_exec('UPDATE enquiries SET status = :status WHERE id = :id', [':status' => $status, ':id' => $id]);
    $updated = db_one('SELECT * FROM enquiries WHERE id = :id LIMIT 1', [':id' => $id]);

    json_response([
        'success' => true,
        'enquiry' => $updated ? shape_enquiry($updated) : null,
        'message' => 'Enquiry marked as ' . str_replace('_', ' ', $status) . '.',
    ]);
}

function handle_create_enquiry(): void
{
    enforce_rate_limit('enquiry', 15, 3600);
    $input = request_json();

    // Double clicks and retried requests must not create two enquiries.
    $fingerprint = submission_fingerprint('enquiry', $input);
    if ($recent = recent_submission($fingerprint, 120)) {
        json_response([
            'success'   => true,
            'duplicate' => true,
            'message'   => 'We already received this message — our team is on it.',
            'enquiryId' => (string)$recent['resource_id'],
        ]);
    }

    $validator = new Validator();
    $validator->required('name', $input['name'] ?? '', 'Your name', 2);
    $validator->email('email', $input['email'] ?? '');
    $validator->required('message', $input['message'] ?? '', 'Message', 5);
    if (!empty($input['phone'])) {
        $validator->phone('phone', $input['phone']);
    }
    if (mb_strlen(clean_text($input['message'] ?? '', 5000)) > 4000) {
        $validator->add('message', 'Please keep your message under 4000 characters.');
    }
    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }

    $propertyId = clean_string($input['propertyId'] ?? '', 64);
    $propertyTitle = '';
    if ($propertyId !== '') {
        $property = find_property($propertyId);
        if (!$property || $property['status'] !== 'active') {
            error_response('That property is no longer available. Please browse our current listings.', 404);
        }
        $propertyTitle = (string)$property['title'];
    }

    $enquiryId = create_enquiry([
        'property_id'    => $propertyId,
        'property_title' => $propertyTitle,
        'name'           => clean_string($input['name'], 120),
        'email'          => (string)valid_email($input['email']),
        'phone'          => clean_string($input['phone'] ?? '', 40),
        'message'        => clean_text($input['message'], 4000),
        'source'         => one_of($input['source'] ?? 'contact_form', ['contact_form', 'property_page'], 'contact_form'),
    ]);

    if ($propertyId !== '') {
        increment_property_enquiries($propertyId);
    }

    send_email(
        (string)valid_email($input['email']),
        clean_string($input['name'], 120),
        'We received your message - Goodlucks Homes',
        email_html_template(
            'Message received',
            '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e($input['name']) . ',</p>'
            . '<p style="color:#CBD5E1;font-size:14px;">Thank you for contacting Goodlucks Homes. A member of our team will respond within one working day.</p>'
            . '<p style="color:#94A3B8;font-size:13px;">Your message: "' . e(clean_text($input['message'], 400)) . '"</p>'
        ),
        'enquiry_confirmation',
        'Enquiry received'
    );

    send_internal_notification(
        'New website enquiry from ' . clean_string($input['name'], 120),
        '<p style="color:#CBD5E1;font-size:14px;"><strong>' . e($input['name']) . '</strong> (' . e($input['email'])
        . (($input['phone'] ?? '') ? ' / ' . e($input['phone']) : '') . ') wrote:</p>'
        . '<p style="color:#E2E8F0;font-size:13px;background:#252A34;padding:12px;border-radius:8px;">' . nl2br(e(clean_text($input['message'], 2000))) . '</p>'
        . ($propertyTitle !== '' ? '<p style="font-size:12px;color:#94A3B8;">About property: ' . e($propertyTitle) . '</p>' : ''),
        ['enquiry_id' => $enquiryId]
    );

    remember_submission($fingerprint, 'enquiry', $enquiryId);

    json_response([
        'success'   => true,
        'message'   => 'Thank you for your message. A Goodlucks Homes specialist will be in touch shortly.',
        'enquiryId' => $enquiryId,
    ], 201);
}

function handle_admin_enquiries(): void
{
    require_admin();
    json_response(['success' => true, 'enquiries' => list_enquiries(300)]);
}

// ===========================================================================
// Tenant requests
// ===========================================================================
function handle_create_tenant_request(): void
{
    enforce_rate_limit('tenant-request', 10, 3600);
    $input = request_json();
    $user = auth_user();

    // Same form submitted twice in a row = one rental request.
    $fingerprint = submission_fingerprint('tenant_request', $input);
    if ($recent = recent_submission($fingerprint, 120)) {
        json_response([
            'success'   => true,
            'duplicate' => true,
            'message'   => 'We already have this rental request.',
            'requestId' => (string)$recent['resource_id'],
        ]);
    }

    $validator = new Validator();
    $validator->required('tenantName', $input['tenantName'] ?? '', 'Your name', 2);
    $validator->phone('tenantPhone', $input['tenantPhone'] ?? '');
    $validator->email('tenantEmail', $input['tenantEmail'] ?? '');

    $locations = clean_string_list($input['preferredLocations'] ?? []);
    if (!$locations) {
        $validator->add('preferredLocations', 'Select at least one preferred location.');
    }
    $budgetMin = valid_money($input['budgetMin'] ?? null, 0, 10000000);
    $budgetMax = valid_money($input['budgetMax'] ?? null, 0, 10000000);
    if ($budgetMin === null || $budgetMax === null) {
        $validator->add('budget', 'Enter a valid budget range.');
    } elseif ($budgetMin > $budgetMax) {
        $validator->add('budget', 'Minimum budget cannot be higher than the maximum budget.');
    }
    $bedrooms = valid_int($input['bedrooms'] ?? 1, 0, 50);
    $bathrooms = valid_int($input['bathrooms'] ?? 1, 0, 50);
    if ($bedrooms === null) {
        $validator->add('bedrooms', 'Select the number of bedrooms you need.');
    }

    $moveInDate = valid_date_iso($input['moveInDate'] ?? null);
    if ($moveInDate === null) {
        $validator->add('moveInDate', 'Choose a valid move-in date.');
    }

    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }

    $requestId = create_tenant_request([
        'tenant_id'         => $user['id'] ?? null,
        'tenant_name'       => clean_string($input['tenantName'], 120),
        'tenant_phone'      => (string)valid_phone($input['tenantPhone']),
        'tenant_email'      => (string)valid_email($input['tenantEmail']),
        'preferred_locations' => $locations,
        'budget_min'        => $budgetMin,
        'budget_max'        => $budgetMax,
        'bedrooms'          => $bedrooms,
        'bathrooms'         => $bathrooms ?? 1,
        'property_type'     => one_of($input['propertyType'] ?? 'Apartment', array_merge(PROPERTY_TYPES, ['All']), 'Apartment'),
        'move_in_date'      => $moveInDate,
        'notes'             => clean_text($input['notes'] ?? '', 2000),
    ]);

    send_email(
        (string)valid_email($input['tenantEmail']),
        clean_string($input['tenantName'], 120),
        'Rental matching request received - Goodlucks Homes',
        email_html_template(
            'Rental matching request received',
            '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e($input['tenantName']) . ',</p>'
            . '<p style="color:#CBD5E1;font-size:14px;">Your rental request has been received. Our matching desk is now searching verified listings for you.</p>'
            . '<ul style="color:#94A3B8;font-size:13px;">'
            . '<li>Locations: ' . e(implode(', ', $locations)) . '</li>'
            . '<li>Budget: GH₵ ' . number_format((float)$budgetMin, 2) . ' - GH₵ ' . number_format((float)$budgetMax, 2) . ' per month</li>'
            . '<li>Bedrooms: ' . e((string)$bedrooms) . ' &bull; Move-in: ' . e((string)$moveInDate) . '</li>'
            . '</ul>'
        ),
        'tenant_request',
        'Rental matching request received'
    );

    if ($user) {
        create_notification((string)$user['id'], 'Rental request submitted', 'Our team is matching verified properties to your request.', 'info');
    }

    remember_submission($fingerprint, 'tenant_request', $requestId);

    json_response([
        'success'   => true,
        'message'   => 'Tenant rental request received. Goodlucks agents will begin matching properties.',
        'requestId' => $requestId,
    ], 201);
}

function handle_list_tenant_requests(): void
{
    $user = require_auth();
    $path = request_path();
    $isAdminEndpoint = str_starts_with($path, '/admin');

    if ($isAdminEndpoint || is_admin($user)) {
        if (!is_admin($user)) {
            error_response('You do not have permission to view all requests.', 403);
        }
        json_response(['success' => true, 'requests' => list_tenant_requests([], 300)]);
    }

    json_response(['success' => true, 'requests' => list_tenant_requests([
        'tenantId' => $user['id'],
        'email'    => $user['email'],
    ], 100)]);
}

function handle_update_tenant_request(array $params): void
{
    $user = require_auth();
    $id = (string)($params[0] ?? '');
    $request = find_tenant_request($id);
    if (!$request) {
        error_response('Request not found.', 404);
    }

    $owner = (string)$request['tenantId'] === (string)$user['id']
        || strtolower($request['tenantEmail']) === strtolower((string)$user['email']);

    $input = request_json();
    $status = one_of($input['status'] ?? null, REQUEST_STATUSES, null);

    if (is_admin($user)) {
        $fields = [];
        if ($status !== null) {
            $fields['status'] = $status;
        }
        if (isset($input['matchedPropertyIds'])) {
            $fields['matched_property_ids'] = clean_string_list($input['matchedPropertyIds'], 20, 64);
        }
        if (!$fields) {
            error_response('No valid changes were provided.', 400);
        }
        update_tenant_request($id, $fields);
        if ($status === 'matched') {
            send_email(
                $request['tenantEmail'],
                $request['tenantName'],
                'We found properties matching your request - Goodlucks Homes',
                email_html_template(
                    'Your matches are ready',
                    '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e($request['tenantName']) . ',</p>'
                    . '<p style="color:#CBD5E1;font-size:14px;">Good news! We have verified properties that match your request. Sign in to your tenant dashboard to review them and book a physical viewing.</p>'
                ),
                'match_found',
                'Property matches available'
            );
            if ($request['tenantId']) {
                create_notification((string)$request['tenantId'], 'Property matches available', 'Goodlucks Homes found properties matching your request.', 'success');
            }
        }
        json_response(['success' => true, 'request' => find_tenant_request($id)]);
    }

    if (!$owner) {
        error_response('You do not have permission to update this request.', 403);
    }
    if ($status !== 'cancelled') {
        error_response('You can only cancel your own request.', 403);
    }
    update_tenant_request($id, ['status' => 'cancelled']);
    json_response(['success' => true, 'request' => find_tenant_request($id)]);
}

// ===========================================================================
// Viewings
// ===========================================================================
function handle_create_viewing(): void
{
    enforce_rate_limit('viewing', 12, 3600);
    $input = request_json();

    // Pressing "Confirm Viewing" twice must not book two appointments.
    $fingerprint = submission_fingerprint('viewing', $input);
    if ($recent = recent_submission($fingerprint, 120)) {
        $existing = find_viewing((string)$recent['resource_id']);
        json_response([
            'success'      => true,
            'duplicate'    => true,
            'message'      => 'This viewing request was already received.',
            'viewingId'    => (string)$recent['resource_id'],
            'feeAmountGhs' => VIEWING_FEE_GHS,
            'viewing'      => $existing,
        ]);
    }
    $user = auth_user();

    $validator = new Validator();
    $validator->required('tenantName', $input['tenantName'] ?? '', 'Your name', 2);
    $validator->phone('tenantPhone', $input['tenantPhone'] ?? '');
    $validator->email('tenantEmail', $input['tenantEmail'] ?? '');

    $propertyId = clean_string($input['propertyId'] ?? '', 64);
    if ($propertyId === '') {
        $validator->add('propertyId', 'Select the property you would like to view.');
    }

    $date = valid_date_iso($input['date'] ?? null);
    if ($date === null) {
        $validator->add('date', 'Choose a valid viewing date.');
    } elseif ($date < gmdate('Y-m-d')) {
        $validator->add('date', 'The viewing date cannot be in the past.');
    }

    $time = clean_string($input['time'] ?? '', 20);
    if ($time === '') {
        $validator->add('time', 'Choose a preferred viewing time.');
    }

    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }

    $property = find_property($propertyId);
    if (!$property || !in_array($property['status'], ['active', 'rented'], true)) {
        error_response('That property is no longer available for viewing.', 404);
    }

    $viewingId = create_viewing([
        'tenant_request_id' => clean_string($input['tenantRequestId'] ?? '', 64),
        'tenant_name'       => clean_string($input['tenantName'], 120),
        'tenant_phone'      => (string)valid_phone($input['tenantPhone']),
        'tenant_email'      => (string)valid_email($input['tenantEmail']),
        'property_id'       => $propertyId,
        'property_title'    => (string)$property['title'],
        'property_location' => (string)$property['location'],
        'date'              => $date,
        'time'              => $time,
        'assigned_agent'    => 'Goodlucks Field Agent',
        'status'            => 'scheduled',
        'viewing_fee_paid'  => false, // Always paid physically on site
        'fee_amount_ghs'    => VIEWING_FEE_GHS,
        'outcome_notes'     => clean_text($input['notes'] ?? '', 1000) ?: 'Scheduled via Goodlucks Homes web platform',
    ]);

    $tenantName = clean_string($input['tenantName'], 120);
    $tenantEmail = (string)valid_email($input['tenantEmail']);
    $tenantPhone = clean_string($input['tenantPhone'], 40);

    send_email(
        $tenantEmail,
        $tenantName,
        'Viewing scheduled: ' . $property['title'] . ' (' . $date . ' at ' . $time . ')',
        email_html_template(
            'Your viewing request is confirmed',
            '<p style="color:#CBD5E1;font-size:14px;">Dear ' . e($tenantName) . ',</p>'
            . '<p style="color:#CBD5E1;font-size:14px;">A Goodlucks Homes agent will accompany you for a private inspection of <strong>' . e($property['title']) . '</strong>.</p>'
            . '<div style="background:#252A34;padding:16px;border-radius:8px;border-left:4px solid #08D9D6;margin:15px 0;">'
            . '<span style="color:#94A3B8;font-size:13px;">Location: ' . e($property['location']) . '</span><br>'
            . '<span style="color:#38BDF8;font-weight:bold;">Date: ' . e($date) . ' at ' . e($time) . '</span><br>'
            . '<span style="color:#E2E8F0;font-size:13px;">Viewing fee: GH₵ ' . number_format(VIEWING_FEE_GHS, 2) . ' - payable in cash on site after meeting our agent.</span>'
            . '</div>'
            . '<p style="color:#CBD5E1;font-size:13px;">Our agent will contact you on ' . e($tenantPhone) . ' two hours before the visit to confirm the meeting point.</p>'
        ),
        'viewing_scheduled',
        'Viewing scheduled for ' . $property['title']
    );

    send_internal_notification(
        '[NEW VIEWING REQUEST] ' . $property['title'] . ' by ' . $tenantName,
        '<p style="color:#CBD5E1;font-size:14px;"><strong>' . e($tenantName) . '</strong> (' . e($tenantPhone) . ' / ' . e($tenantEmail) . ') requested a viewing.</p>'
        . '<p style="color:#94A3B8;font-size:13px;">Property: ' . e($property['title']) . '<br>Location: ' . e($property['location'])
        . '<br>Preferred: ' . e($date) . ' at ' . e($time) . '<br>Reference: ' . e($viewingId) . '</p>',
        ['viewing_id' => $viewingId]
    );

    if ($user) {
        create_notification(
            (string)$user['id'],
            'Viewing scheduled',
            'Your viewing for "' . $property['title'] . '" is set for ' . $date . ' at ' . $time . '.',
            'viewing'
        );
    }

    remember_submission($fingerprint, 'viewing', $viewingId);

    json_response([
        'success'      => true,
        'message'      => 'Viewing scheduled successfully.',
        'viewingId'    => $viewingId,
        'feeAmountGhs' => VIEWING_FEE_GHS,
        'viewing'      => find_viewing($viewingId),
    ], 201);
}

function handle_list_viewings(): void
{
    $user = require_auth();
    $path = request_path();
    if (str_starts_with($path, '/admin') || is_admin($user)) {
        if (!is_admin($user)) {
            error_response('You do not have permission to view all viewings.', 403);
        }
        json_response(['success' => true, 'viewings' => list_viewings([], 300)]);
    }

    $scope = ['tenantEmail' => $user['email']];
    if ($user['role'] === 'landlord') {
        $scope = ['landlordId' => $user['id']];
    }
    json_response(['success' => true, 'viewings' => list_viewings($scope, 100)]);
}

function handle_update_viewing(array $params): void
{
    $user = require_auth();
    $id = (string)($params[0] ?? '');
    $viewing = find_viewing($id);
    if (!$viewing) {
        error_response('Viewing not found.', 404);
    }

    $input = request_json();
    $status = one_of($input['status'] ?? null, VIEWING_STATUSES, null);

    if (!is_admin($user)) {
        if ($user['role'] !== 'landlord') {
            error_response('You do not have permission to update this viewing.', 403);
        }
        $property = $viewing['propertyId'] ? find_property($viewing['propertyId']) : null;
        if (!$property || !can_manage_property($user, $property)) {
            error_response('You do not have permission to update this viewing.', 403);
        }
        if ($status !== 'cancelled') {
            error_response('You can only cancel a viewing.', 403);
        }
    }

    $fields = [];
    if ($status !== null) {
        $fields['status'] = $status;
    }
    if (array_key_exists('viewingFeePaid', $input) && is_admin($user)) {
        $fields['viewing_fee_paid'] = (bool)$input['viewingFeePaid'];
    }
    if (array_key_exists('outcomeNotes', $input)) {
        $fields['outcome_notes'] = $input['outcomeNotes'];
    }
    if (array_key_exists('assignedAgent', $input) && is_admin($user)) {
        $fields['assigned_agent'] = $input['assignedAgent'];
    }
    if (!$fields) {
        error_response('No valid changes were provided.', 400);
    }

    update_viewing($id, $fields);
    json_response(['success' => true, 'viewing' => find_viewing($id)]);
}

// ===========================================================================
// Alerts
// ===========================================================================
function handle_create_price_alert(): void
{
    enforce_rate_limit('price-alert', 20, 3600);
    $input = request_json();

    $email = valid_email($input['email'] ?? null);
    $propertyId = clean_string($input['propertyId'] ?? '', 64);
    if ($email === null) {
        error_response('Enter a valid email address.', 422, ['email' => 'Enter a valid email address.']);
    }
    if ($propertyId === '') {
        error_response('A property is required.', 422, ['propertyId' => 'Choose a property.']);
    }

    $property = find_property($propertyId);
    if (!$property) {
        error_response('Property not found.', 404);
    }

    $target = valid_money($input['targetRentGhs'] ?? null, 0);
    $alertId = upsert_price_alert([
        'property_id'        => $propertyId,
        'property_title'     => (string)$property['title'],
        'property_location'  => (string)$property['location'],
        'current_rent_ghs'   => (float)$property['rent_ghs'],
        'target_rent_ghs'    => $target,
        'email'              => $email,
        'name'               => clean_string($input['name'] ?? '', 120),
        'notify_on_any_drop' => !empty($input['notifyOnAnyDrop']) || $target === null,
    ]);

    send_email(
        $email,
        clean_string($input['name'] ?? '', 120),
        'Price drop alert set: ' . $property['title'],
        email_html_template(
            'Price drop alert activated',
            '<p style="color:#CBD5E1;font-size:14px;">We will email you as soon as the rent changes for:</p>'
            . '<div style="background:#252A34;padding:16px;border-radius:8px;border-left:4px solid #08D9D6;margin:15px 0;">'
            . '<strong style="color:#FFFFFF;">' . e($property['title']) . '</strong><br>'
            . '<span style="color:#94A3B8;font-size:13px;">' . e($property['location']) . '</span><br>'
            . '<span style="color:#08D9D6;font-weight:bold;">Current rent: GH₵ ' . number_format((float)$property['rent_ghs'], 2) . '/month</span><br>'
            . '<span style="color:#38BDF8;font-size:13px;">Alert threshold: '
            . ($target !== null ? 'below GH₵ ' . number_format($target, 2) . '/month' : 'any price reduction')
            . '</span></div>'
        ),
        'price_alert',
        'Price drop alert for ' . $property['title']
    );

    json_response([
        'success' => true,
        'message' => 'Price drop alert registered successfully.',
        'alertId' => $alertId,
        'email'   => $email,
    ]);
}

function handle_list_price_alerts(): void
{
    require_admin();
    json_response(['success' => true, 'alerts' => list_price_alerts(300)]);
}

function handle_create_search_alert(): void
{
    enforce_rate_limit('search-alert', 15, 3600);
    $input = request_json();
    $user = auth_user();

    $email = valid_email($input['email'] ?? null);
    if ($email === null) {
        error_response('Enter a valid email address.', 422, ['email' => 'Enter a valid email address.']);
    }

    $bedrooms = $input['bedrooms'] ?? 'All';
    $bedroomsValue = $bedrooms === 'All' ? null : valid_int($bedrooms, 0, 50);

    $alert = create_search_alert([
        'user_id'       => $user['id'] ?? null,
        'email'         => $email,
        'name'          => clean_string($input['name'] ?? '', 120),
        'phone'         => clean_string($input['phone'] ?? '', 40),
        'location'      => clean_string($input['location'] ?? 'All', 100) ?: 'All',
        'property_type' => clean_string($input['propertyType'] ?? 'All', 60) ?: 'All',
        'bedrooms'      => $bedroomsValue,
        'max_rent_ghs'  => valid_money($input['maxRentGhs'] ?? null, 0) ?? 25000,
        'search_query'  => clean_string($input['searchQuery'] ?? '', 200),
        'frequency'     => one_of($input['frequency'] ?? 'instant', ['instant', 'daily', 'weekly'], 'instant'),
        'channels'      => clean_string_list($input['channels'] ?? ['email'], 2, 20) ?: ['email'],
    ]);

    send_email(
        $email,
        clean_string($input['name'] ?? '', 120),
        'Search alert active - Goodlucks Homes',
        email_html_template(
            'Your search alert is active',
            '<p style="color:#CBD5E1;font-size:14px;">We will notify you when a verified listing matching your criteria goes live.</p>'
            . '<ul style="color:#94A3B8;font-size:13px;">'
            . '<li>Location: ' . e($alert['location'] ?? 'All') . '</li>'
            . '<li>Type: ' . e($alert['propertyType'] ?? 'All') . '</li>'
            . '<li>Max rent: GH₵ ' . number_format((float)($alert['maxRentGhs'] ?? 0), 2) . '/month</li>'
            . '<li>Bedrooms: ' . e((string)($alert['bedrooms'] ?? 'All')) . '</li>'
            . '</ul>'
        ),
        'alert_subscription',
        'Search alert active'
    );

    if ($user) {
        create_notification((string)$user['id'], 'Search alert activated', 'We will email you when matching listings go live.', 'success');
    }

    json_response(['success' => true, 'message' => 'Search alert activated.', 'alert' => $alert], 201);
}

function handle_list_search_alerts(): void
{
    $user = require_auth();
    json_response(['success' => true, 'alerts' => list_search_alerts($user)]);
}

function handle_delete_search_alert(array $params): void
{
    $user = require_auth();
    $id = (string)($params[0] ?? '');
    if (!delete_search_alert($id, $user)) {
        error_response('Alert not found.', 404);
    }
    json_response(['success' => true]);
}

// ===========================================================================
// Saved properties
// ===========================================================================
function handle_list_saved(): void
{
    $user = require_auth();
    json_response(['success' => true, 'propertyIds' => list_saved_property_ids((string)$user['id'])]);
}

function handle_save_property(): void
{
    $user = require_auth();
    $input = request_json();
    $propertyId = clean_string($input['propertyId'] ?? '', 64);
    if ($propertyId === '' || !find_property($propertyId)) {
        error_response('Property not found.', 404);
    }
    save_property_for_user((string)$user['id'], $propertyId);
    json_response(['success' => true, 'propertyIds' => list_saved_property_ids((string)$user['id'])]);
}

function handle_unsave_property(array $params): void
{
    $user = require_auth();
    remove_saved_property((string)$user['id'], (string)($params[0] ?? ''));
    json_response(['success' => true, 'propertyIds' => list_saved_property_ids((string)$user['id'])]);
}

// ===========================================================================
// Agreements & receipts
// ===========================================================================
function handle_list_agreements(): void
{
    require_auth(['admin', 'landlord', 'tenant']);
    json_response(['success' => true, 'agreements' => list_agreements(200)]);
}

function handle_create_agreement(): void
{
    $user = require_auth();
    enforce_rate_limit('agreement', 30, 3600);
    $input = request_json();

    $validator = new Validator();
    foreach ([
        'propertyTitle' => 'Property title',
        'propertyAddress' => 'Property address',
        'landlordName' => 'Landlord name',
        'landlordPhone' => 'Landlord phone',
        'tenantName' => 'Tenant name',
        'tenantPhone' => 'Tenant phone',
    ] as $field => $label) {
        $validator->required($field, $input[$field] ?? '', $label, 2);
    }
    $rent = valid_money($input['monthlyRentGhs'] ?? null, 1);
    if ($rent === null) {
        $validator->add('monthlyRentGhs', 'Enter a valid monthly rent.');
    }
    $duration = valid_int($input['durationMonths'] ?? 12, 1, 120);
    if ($duration === null) {
        $validator->add('durationMonths', 'Enter a valid duration in months.');
    }
    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }

    $agreement = create_agreement([
        'property_id'      => clean_string($input['propertyId'] ?? '', 64),
        'property_title'   => clean_string($input['propertyTitle'], 200),
        'property_address' => clean_string($input['propertyAddress'], 255),
        'city'             => clean_string($input['city'] ?? 'Accra', 100),
        'landlord_name'    => clean_string($input['landlordName'], 120),
        'landlord_phone'   => clean_string($input['landlordPhone'], 40),
        'landlord_ghana_card' => clean_string($input['landlordGhanaCard'] ?? '', 60),
        'tenant_name'      => clean_string($input['tenantName'], 120),
        'tenant_phone'     => clean_string($input['tenantPhone'], 40),
        'tenant_ghana_card'=> clean_string($input['tenantGhanaCard'] ?? '', 60),
        'monthly_rent_ghs' => $rent,
        'duration_months'  => $duration,
        'total_rent_ghs'   => round($rent * $duration, 2),
        'security_deposit_ghs' => valid_money($input['securityDepositGhs'] ?? $rent, 0) ?? $rent,
        'start_date'       => valid_date_iso($input['startDate'] ?? null) ?? gmdate('Y-m-d'),
        'end_date'         => valid_date_iso($input['endDate'] ?? null) ?? gmdate('Y-m-d', strtotime('+' . $duration . ' months')),
        'notice_period_months' => valid_int($input['noticePeriodMonths'] ?? 3, 0, 24) ?? 3,
        'utilities_responsibility' => $input['utilitiesResponsibility'] ?? '',
        'witness_name'     => $input['witnessName'] ?? 'Goodlucks Legal Intermediary',
    ]);

    json_response(['success' => true, 'agreement' => $agreement], 201);
}

function handle_sign_agreement(array $params): void
{
    $user = require_auth();
    $id = (string)($params[0] ?? '');
    $role = one_of(request_json()['role'] ?? null, ['landlord', 'tenant'], null);
    if ($role === null) {
        error_response('Signature role must be landlord or tenant.', 422);
    }
    if ($user['role'] !== 'admin' && $user['role'] !== $role) {
        error_response('You can only sign as your own account role.', 403);
    }
    $agreement = sign_agreement_by_id($id, $role);
    if ($agreement === null) {
        error_response('Agreement not found.', 404);
    }
    json_response(['success' => true, 'agreement' => $agreement]);
}

/**
 * Email a copy of a tenancy agreement to the tenant and landlord.
 */
function handle_email_agreement(array $params): void
{
    $user = require_auth(['admin', 'landlord', 'tenant']);
    enforce_rate_limit('agreement-email', 20, 3600);

    $id = (string)($params[0] ?? '');
    $row = db_one('SELECT * FROM tenancy_agreements WHERE id = :id LIMIT 1', [':id' => $id]);
    if (!$row) {
        error_response('Agreement not found.', 404);
    }
    $agreement = shape_agreement($row);

    $body = '<p style="color:#CBD5E1;font-size:14px;">A copy of the tenancy agreement is below.</p>'
        . '<div style="background:#252A34;padding:16px;border-radius:8px;border-left:4px solid #08D9D6;margin:15px 0;">'
        . '<strong style="color:#FFFFFF;">' . e($agreement['propertyTitle']) . '</strong><br>'
        . '<span style="color:#94A3B8;font-size:13px;">' . e($agreement['propertyAddress']) . ', ' . e($agreement['city']) . '</span><br>'
        . '<span style="color:#E2E8F0;font-size:13px;">Tenant: ' . e($agreement['tenantName']) . ' &bull; Landlord: ' . e($agreement['landlordName']) . '</span><br>'
        . '<span style="color:#08D9D6;font-weight:bold;">Monthly rent: GH₵ ' . number_format((float)$agreement['monthlyRentGhs'], 2) . '</span><br>'
        . '<span style="color:#94A3B8;font-size:13px;">Term: ' . e($agreement['startDate']) . ' to ' . e($agreement['endDate']) . '</span><br>'
        . '<span style="color:#94A3B8;font-size:13px;">Verification code: ' . e($agreement['verificationCode']) . '</span>'
        . '</div>'
        . '<p style="color:#94A3B8;font-size:12px;">Goodlucks Homes acts as intermediary for every viewing and signing. '
        . 'Viewing fees are paid in cash on site after meeting our agent.</p>';

    // The copy is sent to the signed-in party; Goodlucks staff can resend it to
    // the other party from the admin console.
    send_email(
        (string)$user['email'],
        (string)$user['name'],
        'Tenancy agreement: ' . $agreement['propertyTitle'],
        email_html_template('Tenancy agreement', $body, $agreement['verificationCode']),
        'tenancy_agreement',
        'Tenancy agreement ' . $agreement['verificationCode']
    );

    json_response(['success' => true, 'message' => 'Agreement email dispatched.']);
}

function handle_list_receipts(): void
{
    require_auth(['admin', 'landlord', 'tenant']);
    json_response(['success' => true, 'receipts' => list_receipts(200)]);
}

function handle_create_receipt(): void
{
    $user = require_auth(['admin', 'landlord']);
    $input = request_json();

    $validator = new Validator();
    foreach ([
        'propertyTitle' => 'Property title',
        'propertyAddress' => 'Property address',
        'tenantName' => 'Tenant name',
        'landlordName' => 'Landlord name',
    ] as $field => $label) {
        $validator->required($field, $input[$field] ?? '', $label, 2);
    }
    $amount = valid_money($input['amountGhs'] ?? null, 1);
    if ($amount === null) {
        $validator->add('amountGhs', 'Enter a valid amount.');
    }
    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }

    $receipt = create_receipt([
        'property_title'   => clean_string($input['propertyTitle'], 200),
        'property_address' => clean_string($input['propertyAddress'], 255),
        'tenant_name'      => clean_string($input['tenantName'], 120),
        'tenant_phone'     => clean_string($input['tenantPhone'] ?? '', 40),
        'landlord_name'    => clean_string($input['landlordName'], 120),
        'amount_ghs'       => $amount,
        'amount_in_words'  => $input['amountInWords'] ?? '',
        'payment_purpose'  => $input['paymentPurpose'] ?? 'Rent payment',
        'payment_method'   => $input['paymentMethod'] ?? 'Cash',
        'transaction_ref'  => $input['transactionRef'] ?? '',
        'payment_date'     => valid_date_iso($input['paymentDate'] ?? null) ?? gmdate('Y-m-d'),
        'issued_by'        => $input['issuedBy'] ?? (string)$user['name'],
    ]);

    json_response(['success' => true, 'receipt' => $receipt], 201);
}

// ===========================================================================
// Notifications
// ===========================================================================
function handle_list_notifications(): void
{
    $user = require_auth();
    json_response(['success' => true, 'notifications' => list_notifications($user)]);
}

function handle_mark_notification(array $params): void
{
    $user = require_auth();
    $ok = mark_notification_read((string)($params[0] ?? ''), $user);
    if (!$ok) {
        error_response('Notification not found.', 404);
    }
    json_response(['success' => true]);
}

/**
 * Mark every notification as read in one request.
 *
 * The badge counts unread rows, so opening the notifications view calls this
 * instead of firing one PATCH per row.
 */
function handle_mark_all_notifications(): void
{
    $user = require_auth();
    $updated = mark_all_notifications_read($user);
    json_response(['success' => true, 'updated' => $updated, 'notifications' => list_notifications($user)]);
}

// ===========================================================================
// Admin
// ===========================================================================
function handle_admin_stats(): void
{
    require_admin();
    json_response(['success' => true, 'stats' => analytics_stats()]);
}

/**
 * Run the saved-search matcher on demand (admin only).
 *
 * Shared hosting often has no shell cron; this lets staff deliver pending
 * matches from the console. The cron script calls the same function.
 */
function handle_run_alert_digest(): void
{
    require_admin();
    enforce_rate_limit('alert-digest', 12, 3600);

    $result = run_search_alert_digest();

    json_response([
        'success'    => true,
        'properties' => $result['properties'],
        'emails'     => $result['emails'],
        'message'    => $result['emails'] === 0
            ? 'No new matches to send.'
            : 'Sent ' . $result['emails'] . ' match email(s).',
    ]);
}

function handle_admin_email_logs(): void
{
    require_admin();
    json_response([
        'success' => true,
        'logs'    => list_email_logs(300),
        'outbox'  => email_outbox_summary(),
    ]);
}

/**
 * Drain the email outbox immediately.
 *
 * Shared hosting often has no shell cron; this lets an admin push queued mail
 * (and retry failures) from the console. cron.php runs the same worker.
 */
function handle_run_email_outbox(): void
{
    require_admin();
    enforce_rate_limit('email-outbox-run', 20, 3600);

    $result = process_email_outbox(50, 25.0);

    $message = $result['sent'] . ' email(s) sent';
    if ($result['retried'] > 0) {
        $message .= ', ' . $result['retried'] . ' will retry later';
    }
    if ($result['failed'] > 0) {
        $message .= ', ' . $result['failed'] . ' given up on';
    }

    json_response([
        'success' => true,
        'result'  => $result,
        'outbox'  => email_outbox_summary(),
        'message' => $message,
    ]);
}

// ===========================================================================
// SEO
// ===========================================================================
/**
 * Dynamic XML sitemap.
 *
 * The SPA build cannot know the catalogue at build time, so /sitemap.xml is
 * generated from the live database: core pages plus every published listing,
 * with real last-modified dates.
 */
function handle_sitemap(): void
{
    $core = [
        ['loc' => SITE_URL . '/', 'priority' => '1.0', 'changefreq' => 'daily'],
        ['loc' => SITE_URL . '/browse', 'priority' => '0.9', 'changefreq' => 'daily'],
        ['loc' => SITE_URL . '/find-home', 'priority' => '0.8', 'changefreq' => 'weekly'],
        ['loc' => SITE_URL . '/about', 'priority' => '0.5', 'changefreq' => 'monthly'],
        ['loc' => SITE_URL . '/contact', 'priority' => '0.5', 'changefreq' => 'monthly'],
    ];

    $entries = [];
    foreach ($core as $page) {
        $entries[] = [
            'loc'        => $page['loc'],
            'lastmod'    => gmdate('Y-m-d'),
            'changefreq' => $page['changefreq'],
            'priority'   => $page['priority'],
        ];
    }

    $result = query_properties(['status' => 'active', 'perPage' => 500]);
    foreach ($result['items'] as $property) {
        $updated = (string)($property['updatedAt'] ?? '');
        $timestamp = $updated !== '' ? strtotime($updated) : false;
        $entries[] = [
            'loc'        => SITE_URL . '/property/' . rawurlencode((string)$property['id']),
            'lastmod'    => gmdate('Y-m-d', $timestamp !== false ? $timestamp : time()),
            'changefreq' => 'weekly',
            'priority'   => '0.8',
        ];
    }

    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
        . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($entries as $entry) {
        $xml .= "  <url>\n"
            . '    <loc>' . htmlspecialchars($entry['loc'], ENT_XML1) . "</loc>\n"
            . '    <lastmod>' . $entry['lastmod'] . "</lastmod>\n"
            . '    <changefreq>' . $entry['changefreq'] . "</changefreq>\n"
            . '    <priority>' . $entry['priority'] . "</priority>\n"
            . "  </url>\n";
    }
    $xml .= '</urlset>' . "\n";

    if (ob_get_length()) {
        @ob_clean();
    }
    header('Content-Type: application/xml; charset=utf-8');
    header('Cache-Control: public, max-age=3600');
    echo $xml;
    exit;
}

// ===========================================================================
// Utility endpoints
// ===========================================================================
function handle_track_pageview(): void
{
    enforce_rate_limit('pageview', 300, 300);
    $input = request_json();
    $path = clean_string($input['path'] ?? '/', 255);
    if ($path === '' || str_starts_with($path, '/admin')) {
        json_response(['success' => true]);
    }
    record_page_view($path);
    json_response(['success' => true]);
}

/**
 * AI description writer.
 * Uses Gemini when GEMINI_API_KEY is configured, otherwise a deterministic
 * template so the feature keeps working without a paid API key.
 */
function handle_ai_describe(): void
{
    $input = request_json();
    $title = clean_string($input['title'] ?? '', 200);
    $location = clean_string($input['location'] ?? '', 200);
    $type = one_of($input['propertyType'] ?? 'Apartment', PROPERTY_TYPES, 'Apartment');
    $bedrooms = valid_int($input['bedrooms'] ?? 1, 0, 50) ?? 1;
    $rent = valid_money($input['rentGhs'] ?? 0, 0) ?? 0;
    $amenities = clean_string_list($input['amenities'] ?? [], 12, 80);

    if ($title === '' || $location === '') {
        error_response('A title and location are required.', 422);
    }

    $fallback = sprintf(
        'Stunning %d-bedroom %s located in prime %s. The residence features high quality finishes, %s, and reliable services managed end-to-end by Goodlucks Homes. '
        . 'Every viewing is arranged with a Goodlucks agent, so you can inspect the property with confidence before committing. Monthly rent is GH₵ %s.',
        $bedrooms,
        $type,
        $location,
        $amenities ? implode(', ', array_slice($amenities, 0, 3)) : 'modern amenities',
        number_format($rent, 0)
    );

    $apiKey = trim((string)cfg('GEMINI_API_KEY', ''));
    if ($apiKey === '') {
        json_response(['success' => true, 'description' => $fallback, 'ai' => false]);
    }

    $prompt = "Write a luxury, compelling, high-converting property description (80-120 words) for a rental listing in Ghana:\n"
        . "Title: {$title}\nLocation: {$location}\nType: {$type}\nBedrooms: {$bedrooms}\nMonthly Rent: GH₵ {$rent}\n"
        . 'Key Amenities: ' . implode(', ', $amenities) . "\n"
        . 'Focus on luxury living, security, modern amenities, and peace of mind through the Goodlucks Homes intermediary service. Do not mention landlord contact details.';

    $text = gl_gemini_generate_text($apiKey, $prompt);
    if ($text === null) {
        json_response(['success' => true, 'description' => $fallback, 'ai' => false]);
    }
    json_response(['success' => true, 'description' => trim($text), 'ai' => true]);
}

/** AI match score between a tenant request and a property. */
/**
 * Score a listing against a tenant's rental request.
 *
 * Shared by /ai/match (one property at a time) and /matches (the signed-in
 * tenant's whole shortlist) so both always report the same number.
 *
 * @return array{score: int, reason: string}
 */
function match_score(array $request, array $property): array
{
    $rent = (float)($property['rentGhs'] ?? 0);
    $budgetMin = (float)($request['budgetMin'] ?? 0);
    $budgetMax = (float)($request['budgetMax'] ?? PHP_INT_MAX);
    $bedrooms = (int)($property['bedrooms'] ?? 0);

    $score = 70;
    if ($rent >= $budgetMin && $rent <= $budgetMax) {
        $score += 20;
    } elseif ($rent > $budgetMax) {
        $score -= min(25, (int)(($rent - $budgetMax) / max(1, $budgetMax) * 50));
    }
    if ($bedrooms >= (int)($request['bedrooms'] ?? 0)) {
        $score += 8;
    }
    foreach ((array)($request['preferredLocations'] ?? []) as $location) {
        if (is_string($location) && $location !== '' && stripos((string)($property['location'] ?? ''), $location) !== false) {
            $score += 5;
            break;
        }
    }
    if (($property['propertyType'] ?? '') === ($request['propertyType'] ?? '')) {
        $score += 4;
    }
    $score = max(40, min(98, $score));

    $reason = sprintf(
        'Fits the GH₵ %s - GH₵ %s budget at GH₵ %s/month and offers %d bedroom(s) in %s.',
        number_format($budgetMin, 0),
        number_format($budgetMax, 0),
        number_format($rent, 0),
        $bedrooms,
        (string)($property['location'] ?? 'Accra')
    );

    return ['score' => $score, 'reason' => $reason];
}

function handle_ai_match(): void
{
    $input = request_json();
    $request = $input['tenantRequest'] ?? null;
    $property = $input['property'] ?? null;
    if (!is_array($request) || !is_array($property)) {
        error_response('Both tenantRequest and property objects are required.', 422);
    }

    $result = match_score($request, $property);
    json_response(['success' => true, 'matchScore' => $result['score'], 'aiMatchReason' => $result['reason']]);
}

/**
 * The signed-in tenant's shortlist, scored against their own rental request.
 *
 * Replaces the hardcoded percentages the dashboard used to show: staff-curated
 * matches (set on the request) stay first, then the best-scoring live listings.
 */
function handle_matches(): void
{
    $user = require_auth();
    $requestId = clean_string(query_param('requestId', ''), 64);

    if ($requestId !== '') {
        // Staff score any request; a tenant may only score their own.
        $request = find_tenant_request($requestId);
        if (!$request) {
            error_response('Tenant request not found.', 404);
        }
        $owns = (string)($request['tenantId'] ?? '') === (string)$user['id']
            || strcasecmp((string)($request['tenantEmail'] ?? ''), (string)($user['email'] ?? '')) === 0;
        if (!$owns && !is_admin($user)) {
            error_response('You do not have permission to view these matches.', 403);
        }
    } else {
        $requests = list_tenant_requests(['tenantId' => (string)$user['id']], 1);
        if (!$requests && !empty($user['email'])) {
            $requests = list_tenant_requests(['email' => (string)$user['email']], 1);
        }
        $request = $requests[0] ?? null;
    }

    if (!$request) {
        json_response(['success' => true, 'requestId' => null, 'matches' => []]);
    }

    $curated = array_map('strval', (array)($request['matchedPropertyIds'] ?? []));
    $result = query_properties(['status' => 'active', 'perPage' => 120]);

    $scored = [];
    foreach ($result['items'] as $property) {
        $scoredScore = match_score($request, $property);
        $scored[] = [
            'property' => $property,
            'score'    => $scoredScore['score'],
            'reason'   => $scoredScore['reason'],
            'curated'  => in_array((string)$property['id'], $curated, true),
        ];
    }

    usort($scored, static function (array $a, array $b): int {
        if ($a['curated'] !== $b['curated']) {
            return $a['curated'] ? -1 : 1;
        }
        return $b['score'] <=> $a['score'];
    });

    $matches = array_slice($scored, 0, 12);

    json_response([
        'success'      => true,
        'requestId'    => (string)$request['id'],
        'topScore'     => $matches ? (int)$matches[0]['score'] : 0,
        'matches'      => $matches,
    ]);
}

/** Low-level Gemini REST call (returns null on any failure). */
function gl_gemini_generate_text(string $apiKey, string $prompt): ?string
{
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' . urlencode($apiKey);
    $payload = json_encode(['contents' => [['parts' => [['text' => $prompt]]]]]);
    $context = stream_context_create([
        'http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json\r\n",
            'content' => $payload,
            'timeout' => 12,
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents($url, false, $context);
    if (!is_string($response) || $response === '') {
        gl_log('warning', 'Gemini request failed');
        return null;
    }
    $decoded = json_decode($response, true);
    $text = $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
    return is_string($text) ? $text : null;
}

/**
 * Transactional email relay. Restricted to administrators: it is internal
 * tooling, not a public email gateway.
 */
function handle_send_email(): void
{
    require_admin();
    enforce_rate_limit('send-email', 60, 3600);
    $input = request_json();

    $to = valid_email($input['to'] ?? null);
    $subject = clean_string($input['subject'] ?? '', 200);
    $html = is_string($input['html'] ?? null) ? (string)$input['html'] : '';
    if ($to === null || $subject === '' || $html === '') {
        error_response('Missing required fields: to, subject, html.', 400);
    }

    // Queued, not sent: delivery happens after the response and is retried by
    // the outbox worker, so this endpoint never blocks on the mail transport.
    $queued = send_email($to, clean_string($input['recipientName'] ?? '', 120), $subject, $html, clean_string($input['type'] ?? 'notification', 64));
    json_response(['success' => true, 'queued' => $queued, 'delivered' => false]);
}
