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
        // A database that is momentarily held by another writer is not a server
        // fault: SQLite's busy timeout and MySQL's lock-wait timeout both end
        // here, and the caller can retry safely because the failed transaction
        // was rolled back.
        if (db_is_busy_error($e)) {
            error_response('Another payment is being recorded right now. Nothing was changed — please try again.', 409);
        }
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
        ['POST', '#^/account/password$#', 'handle_change_password'],
        ['POST', '#^/account/avatar$#', 'handle_upload_avatar'],
        ['DELETE', '#^/account/avatar$#', 'handle_delete_avatar'],

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

        // --- Agent accounts (Increment C) --------------------------------
        // An agent reads and edits only their own profile. Status changes are
        // staff decisions and are admin-only.
        ['GET',   '#^/agent/profile$#', 'handle_get_agent_profile'],
        // Increment G: an agent's own money position and remittance claims.
        // Submitting is a claim; confirming is not an agent power at all.
        ['GET',   '#^/agent/finance$#', 'handle_agent_finance'],
        ['POST',  '#^/agent/remittances$#', 'handle_agent_submit_remittance'],
        ['GET',   '#^/agent/remittances/([A-Za-z0-9\-_]+)$#', 'handle_agent_remittance_show'],
        ['PATCH', '#^/agent/profile$#', 'handle_update_agent_profile'],
        ['GET',   '#^/admin/agents$#', 'handle_list_agents'],
        ['POST',  '#^/admin/agents/([A-Za-z0-9\-_]+)/status$#', 'handle_set_agent_status'],

        // --- Verification & private documents (Increment D) --------------
        // Agents and landlords manage their own verification. Reviewing it is
        // restricted to administrators holding the reviewer capability, and
        // reading the actual files needs a second capability.
        ['GET',   '#^/verification$#', 'handle_get_verification'],
        ['POST',  '#^/verification/documents$#', 'handle_upload_verification_document'],
        ['POST',  '#^/verification/identity$#', 'handle_submit_identity_verification'],
        ['POST',  '#^/verification/professional$#', 'handle_submit_professional_authorisation'],
        ['GET',   '#^/verification-documents/([A-Za-z0-9\-_]+)$#', 'handle_serve_verification_document'],
        ['DELETE','#^/verification-documents/([A-Za-z0-9\-_]+)$#', 'handle_delete_verification_document'],
        ['GET',   '#^/admin/verifications$#', 'handle_admin_verification_queue'],
        ['GET',   '#^/admin/verifications/([A-Za-z0-9\-_]+)$#', 'handle_admin_verification_detail'],
        ['GET',   '#^/admin/verifications/([A-Za-z0-9\-_]+)/history$#', 'handle_admin_verification_history'],
        ['POST',  '#^/admin/verifications/([A-Za-z0-9\-_]+)/identity/decision$#', 'handle_admin_decide_identity'],
        ['POST',  '#^/admin/verifications/([A-Za-z0-9\-_]+)/professional/decision$#', 'handle_admin_decide_professional'],

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

        // --- Viewings (Increment F: request → appointment lifecycle) ------
        ['POST', '#^/viewing-requests$#', 'handle_create_viewing'],
        ['POST', '#^/viewing-request$#', 'handle_create_viewing'],
        ['POST', '#^/viewing_request$#', 'handle_create_viewing'],
        ['POST', '#^/viewings$#', 'handle_create_viewing'],
        ['GET',  '#^/viewings$#', 'handle_list_viewings'],
        ['GET',  '#^/admin/viewings$#', 'handle_list_viewings'],
        ['GET',  '#^/admin/viewings/([A-Za-z0-9\-_]+)$#', 'handle_admin_viewing_detail'],
        ['POST', '#^/admin/viewings/([A-Za-z0-9\-_]+)/correction$#', 'handle_correct_viewing'],
        ['POST', '#^/admin/viewings/([A-Za-z0-9\-_]+)/assign-agent$#', 'handle_assign_viewing_agent'],
        ['POST', '#^/viewings/([A-Za-z0-9\-_]+)/(propose|confirm|reschedule|request-reschedule|cancel|complete|no-show|could-not-proceed)$#', 'handle_viewing_action'],
        ['GET',  '#^/viewings/([A-Za-z0-9\-_]+)$#', 'handle_get_viewing'],
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

        // --- Rent payment records ---------------------------------------
        // Tenancy-agreement drafting, signing and emailing were retired: the
        // platform does not prepare or execute tenancy agreements (Increment A).
        ['GET',  '#^/receipts$#', 'handle_list_receipts'],
        ['POST', '#^/receipts$#', 'handle_create_receipt'],
        ['GET',  '#^/receipts/([A-Za-z0-9\-_]+)$#', 'handle_get_receipt'],

        // --- Viewing-fee ledger (Increment B) ---------------------------
        // Admin-only. These endpoints record what agents collected, what is
        // owed to Goodlucks and what Goodlucks actually received; they never
        // apply a fee-sharing percentage (none is approved).
        ['GET',  '#^/admin/viewing-fees$#', 'handle_list_viewing_fees'],
        ['GET',  '#^/admin/viewing-fees/policy$#', 'handle_fee_policy'],
        ['POST', '#^/admin/viewing-fees/([A-Za-z0-9\-_]+)/share$#', 'handle_set_viewing_fee_share'],
        ['POST', '#^/admin/viewing-fees/([A-Za-z0-9\-_]+)/remittances$#', 'handle_add_fee_remittance'],
        ['POST', '#^/admin/viewing-fees/([A-Za-z0-9\-_]+)/state$#', 'handle_set_viewing_fee_state'],
        // Increment E: link a fee to an agent account (needed to resolve a tier)
        // and apply an approved, active policy to it. Applying writes an
        // immutable snapshot; it never marks money as received.
        ['POST', '#^/admin/viewing-fees/([A-Za-z0-9\-_]+)/agent$#', 'handle_link_viewing_fee_agent'],
        ['POST', '#^/admin/viewing-fees/([A-Za-z0-9\-_]+)/apply-policy$#', 'handle_apply_fee_policy'],

        // --- Fee policies & agent tiers (Increment E) --------------------
        // Capability-gated: creating/editing needs the manager capability,
        // approving/activating needs the approver capability. Being an
        // administrator grants neither by default.
        ['GET',  '#^/admin/fee-policies$#', 'handle_list_fee_policies'],
        ['POST', '#^/admin/fee-policies$#', 'handle_create_fee_policy'],
        ['GET',  '#^/admin/fee-policies/([A-Za-z0-9\-_]+)$#', 'handle_get_fee_policy'],
        ['PATCH','#^/admin/fee-policies/([A-Za-z0-9\-_]+)$#', 'handle_update_fee_policy'],
        ['POST', '#^/admin/fee-policies/([A-Za-z0-9\-_]+)/submit$#', 'handle_submit_fee_policy'],
        ['POST', '#^/admin/fee-policies/([A-Za-z0-9\-_]+)/approve$#', 'handle_approve_fee_policy'],
        ['POST', '#^/admin/fee-policies/([A-Za-z0-9\-_]+)/reject$#', 'handle_reject_fee_policy'],
        ['POST', '#^/admin/fee-policies/([A-Za-z0-9\-_]+)/activate$#', 'handle_activate_fee_policy'],
        ['POST', '#^/admin/fee-policies/([A-Za-z0-9\-_]+)/deactivate$#', 'handle_deactivate_fee_policy'],
        ['GET',  '#^/admin/agents/([A-Za-z0-9\-_]+)/tier$#', 'handle_admin_agent_tier'],

        // --- Remittances, reconciliation & rental commissions (Increment G) ---
        // Reading the money position needs `can_view_finance`. Confirming that
        // money arrived, allocating it, rejecting it, reversing it and running
        // the commission workflow need `can_confirm_remittances`. An ordinary
        // administrator has neither.
        ['GET',  '#^/admin/finance/summary$#', 'handle_admin_finance_summary'],
        ['GET',  '#^/admin/finance/remittances$#', 'handle_admin_finance_remittances'],
        ['GET',  '#^/admin/finance/remittances/([A-Za-z0-9\-_]+)$#', 'handle_admin_finance_remittance_show'],
        ['POST', '#^/admin/finance/remittances/([A-Za-z0-9\-_]+)/confirm$#', 'handle_admin_confirm_remittance'],
        ['POST', '#^/admin/finance/remittances/([A-Za-z0-9\-_]+)/decision$#', 'handle_admin_decide_remittance'],
        ['POST', '#^/admin/finance/receipts/([A-Za-z0-9\-_]+)/reverse$#', 'handle_admin_reverse_receipt'],
        ['GET',  '#^/admin/finance/agents/([A-Za-z0-9\-_]+)$#', 'handle_admin_finance_agent'],
        ['GET',  '#^/admin/finance/adjustments$#', 'handle_admin_finance_adjustments'],
        ['GET',  '#^/admin/finance/commissions$#', 'handle_admin_commissions'],
        ['POST', '#^/admin/finance/commissions$#', 'handle_admin_create_commission'],
        ['GET',  '#^/admin/finance/commissions/([A-Za-z0-9\-_]+)$#', 'handle_admin_commission_show'],
        ['PATCH','#^/admin/finance/commissions/([A-Za-z0-9\-_]+)$#', 'handle_admin_update_commission'],
        ['POST', '#^/admin/finance/commissions/([A-Za-z0-9\-_]+)/status$#', 'handle_admin_commission_status'],
        ['POST', '#^/admin/finance/commissions/([A-Za-z0-9\-_]+)/payments$#', 'handle_admin_commission_payment'],
        ['POST', '#^/admin/finance/commissions/([A-Za-z0-9\-_]+)/adjustments$#', 'handle_admin_commission_adjust'],

        // --- Notifications ----------------------------------------------
        ['GET',  '#^/notifications$#', 'handle_list_notifications'],
        ['PATCH', '#^/notifications/([A-Za-z0-9\-_]+)$#', 'handle_mark_notification'],
        ['POST', '#^/notifications/read-all$#', 'handle_mark_all_notifications'],

        // --- Admin ------------------------------------------------------
        ['GET',  '#^/admin/stats$#', 'handle_admin_stats'],
        ['GET',  '#^/admin/email-logs$#', 'handle_admin_email_logs'],
        ['POST', '#^/admin/alerts/run$#', 'handle_run_alert_digest'],
        ['POST', '#^/admin/emails/run$#', 'handle_run_email_outbox'],
        ['GET',  '#^/admin/audit-logs$#', 'handle_list_audit_logs'],

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
    enforce_rate_limit('register', REGISTER_RATE_LIMIT_PER_HOUR, 3600);
    $input = request_json();

    $validator = new Validator();
    $validator->required('name', $input['name'] ?? '', 'Full name', 2);
    $validator->email('email', $input['email'] ?? '');
    $validator->phone('phone', $input['phone'] ?? '');
    $password = is_string($input['password'] ?? null) ? (string)$input['password'] : '';
    if (!password_is_strong_enough($password)) {
        $validator->add('password', 'Password must be at least 8 characters.');
    }
    // Increment C: agent is a first-class role, so an agent sign-up keeps the
    // role it asked for. Anything outside this list (including "admin") is
    // refused rather than silently coerced into a tenant account: a
    // half-registered account with the wrong role is worse than an honest
    // "not available". Privileged roles are never self-assigned.
    $requestedRole = is_string($input['role'] ?? null)
        ? strtolower(trim((string)$input['role']))
        : 'tenant';
    if ($requestedRole === '') {
        $requestedRole = 'tenant';
    }
    $selfServiceRoles = ['tenant', 'landlord', 'agent'];
    if (!in_array($requestedRole, $selfServiceRoles, true)) {
        $validator->add(
            'role',
            'That account type is not available for self-registration. Choose tenant, landlord or agent.'
        );
    }
    $role = in_array($requestedRole, $selfServiceRoles, true) ? $requestedRole : 'tenant';

    // An agent's operating base is part of the account, not an optional extra:
    // it is where they work, and it is distinct from any home address.
    $agencyName = clean_string($input['agencyName'] ?? $input['company'] ?? '', 200);
    $operatingCity = clean_string($input['operatingCity'] ?? $input['city'] ?? $input['address'] ?? '', 120);
    if ($role === 'agent') {
        if ($operatingCity === '') {
            $validator->add('operatingCity', 'Tell us the city you work from.');
        }
    }
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
            // City/town or general location. Ordinary contact information, not
            // identity verification; optional and stored on the existing
            // users.address column so no schema change is needed.
            'address'       => clean_string($input['city'] ?? $input['address'] ?? '', 255),
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

    // The agent profile is created with the account, in a deny-by-default state:
    // account_status 'pending_review' and can_submit_listings 0. Registration
    // never grants verification, authorisation or any operational permission.
    $agentProfile = null;
    if ($role === 'agent') {
        try {
            $agentProfile = create_agent_profile((string)$user['id'], [
                'agency_name'    => $agencyName,
                'operating_city' => $operatingCity,
            ]);
        } catch (Throwable $e) {
            // Never leave a half-registered account without its profile.
            try {
                db_exec('DELETE FROM users WHERE id = :id', [':id' => $user['id']]);
            } catch (Throwable $ignored) {
                // fall through to the error response
            }
            error_response('We could not finish setting up your agent account. Please try again.', 500);
        }
        audit_log('agent.registered', 'agent_profile', (string)$agentProfile['id'], [
            'operating_city' => $operatingCity,
            'has_agency_name' => $agencyName !== '',
        ]);
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
                : ($role === 'agent'
                    ? 'Your agent account is pending review. You can complete your agent profile now; listing submissions open once an administrator approves your account.'
                    : 'You can now save properties, request viewings and submit property-matching requests.'))
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

    // The role tab a client picked must match the account, so an agent cannot
    // be nudged into a tenant session by the sign-in form.
    $requestedRole = one_of($input['role'] ?? null, ['tenant', 'landlord', 'agent'], null);
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
// Account settings (password change, profile picture)
//
// Routine account housekeeping that every signed-in role may do for *their own*
// account only. Nothing here can name another user: the account is always taken
// from the session, never from the request body.
// ===========================================================================

/**
 * Change the signed-in user's password.
 *
 * The current password is re-verified against the stored bcrypt hash, so a
 * borrowed session cannot silently lock the real owner out. The new password
 * runs through the same strength rule as registration and reset, and every
 * *other* session is revoked afterwards while the current one is kept, so the
 * person who just changed it stays signed in.
 */
function handle_change_password(): void
{
    $user = require_auth();
    enforce_rate_limit('password-change', 10, 3600, (string)$user['id']);

    $input = request_json();
    $current = is_string($input['currentPassword'] ?? null) ? (string)$input['currentPassword'] : '';
    $new = is_string($input['newPassword'] ?? null) ? (string)$input['newPassword'] : '';
    $confirm = is_string($input['confirmPassword'] ?? null) ? (string)$input['confirmPassword'] : '';

    $errors = [];
    if ($current === '') {
        $errors['currentPassword'] = 'Enter your current password.';
    }
    if (!password_is_strong_enough($new)) {
        $errors['newPassword'] = 'Use at least 8 characters.';
    }
    if ($confirm !== $new || $confirm === '') {
        $errors['confirmPassword'] = 'The two new passwords do not match.';
    }
    if ($errors) {
        error_response('Please correct the highlighted fields.', 422, $errors);
    }

    $row = find_user_by_id((string)$user['id']);
    if (!$row) {
        error_response('Your account could not be loaded. Please sign in again.', 401);
    }

    $hash = (string)($row['password_hash'] ?? '');
    if ($hash === '' || !password_verify($current, $hash)) {
        error_response('Your current password is not correct.', 422, [
            'currentPassword' => 'That is not your current password.',
        ]);
    }

    if (password_verify($new, $hash)) {
        error_response('Choose a password you have not used here before.', 422, [
            'newPassword' => 'The new password must be different from the current one.',
        ]);
    }

    update_user((string)$row['id'], ['password_hash' => password_hash($new, PASSWORD_BCRYPT)]);

    // Keep the session that made the change; drop every other device.
    $token = (string)($_COOKIE[SESSION_COOKIE] ?? '');
    if ($token !== '') {
        db_exec(
            'DELETE FROM auth_sessions WHERE user_id = :uid AND token_hash <> :hash',
            [':uid' => $row['id'], ':hash' => hash_session_token($token)]
        );
    }

    create_notification(
        (string)$row['id'],
        'Password changed',
        'Your password was changed from your account settings. Other devices were signed out.',
        'success'
    );
    audit_log('account.password_changed', 'user', (string)$row['id'], []);
    gl_log('info', 'Password changed by account owner', ['user_id' => $row['id']]);

    json_response([
        'success' => true,
        'message' => 'Your password has been changed. Other devices were signed out.',
    ]);
}

/** Resolve the stored avatar filename of an uploaded avatar, or null. */
function avatar_file_path(string $avatar): ?string
{
    if (!preg_match('#^' . preg_quote(UPLOAD_URL_PATH, '#') . '/([A-Za-z0-9\-_.]+)$#', $avatar, $m)) {
        return null;
    }
    $name = $m[1];
    // Only files this endpoint created are ever touched.
    if (!str_starts_with($name, 'avatar-') || str_contains($name, '..')) {
        return null;
    }
    $root = realpath(rtrim(UPLOAD_DIR, '/'));
    $real = realpath(rtrim(UPLOAD_DIR, '/') . '/' . $name);
    if ($root === false || $real === false || !str_starts_with($real, $root . DIRECTORY_SEPARATOR) || !is_file($real)) {
        return null;
    }
    return $real;
}

/**
 * Upload (or replace) the signed-in user's profile picture.
 *
 * Deliberately separate from `/uploads` (which is for listing photographs and
 * is limited to landlord/agent/admin): an avatar is a small, single image on
 * one account, so it gets its own validation, its own rate limit and its own
 * naming scheme. The file goes into the same uploads directory and is served by
 * the same static/`/api/uploads` path — no second storage system.
 */
function handle_upload_avatar(): void
{
    $user = require_auth();
    enforce_rate_limit('avatar-upload', 20, 3600, (string)$user['id']);

    if (!isset($_FILES['file'])) {
        error_response('No image was uploaded.', 400, ['file' => 'Choose an image to upload.']);
    }
    $file = $_FILES['file'];
    if (is_array($file['name'] ?? null)) {
        error_response('Upload one image at a time.', 400, ['file' => 'Upload one image at a time.']);
    }
    if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        error_response('The image did not upload. Please try again.', 422, ['file' => 'The upload failed.']);
    }

    $maxBytes = 2 * 1024 * 1024;
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0) {
        error_response('That file is empty.', 422, ['file' => 'Choose an image to upload.']);
    }
    if ($size > $maxBytes) {
        error_response('Profile pictures must be smaller than 2 MB.', 422, [
            'file' => 'Use an image under 2 MB.',
        ]);
    }
    if (!is_uploaded_file((string)$file['tmp_name'])) {
        error_response('Invalid upload.', 400, ['file' => 'Invalid upload.']);
    }

    $allowedTypes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string)$finfo->file((string)$file['tmp_name']);
    if (!isset($allowedTypes[$mime])) {
        error_response('Use a JPG, PNG or WEBP image.', 422, ['file' => 'Unsupported image type.']);
    }
    $dimensions = @getimagesize((string)$file['tmp_name']);
    if ($dimensions === false || $dimensions[0] < 50 || $dimensions[1] < 50) {
        error_response('That file is not a usable image.', 422, ['file' => 'The image is too small.']);
    }

    if (!is_dir(UPLOAD_DIR) && !@mkdir(UPLOAD_DIR, 0755, true)) {
        gl_log('error', 'Avatar directory could not be created: ' . UPLOAD_DIR);
        error_response('Uploads are temporarily unavailable.', 500);
    }

    $filename = 'avatar-' . gmdate('Ymd') . '-' . bin2hex(random_bytes(10)) . '.' . $allowedTypes[$mime];
    $target = rtrim(UPLOAD_DIR, '/') . '/' . $filename;
    if (!@move_uploaded_file((string)$file['tmp_name'], $target)) {
        gl_log('error', 'Could not move avatar upload', ['target' => $target]);
        error_response('The server could not save the image.', 500);
    }
    @chmod($target, 0644);

    $previous = (string)($user['avatar'] ?? '');
    $avatarUrl = UPLOAD_URL_PATH . '/' . $filename;
    update_user((string)$user['id'], ['avatar' => $avatarUrl]);

    // Remove the picture this upload replaces, but only if it is one of ours.
    $oldPath = $previous !== '' ? avatar_file_path($previous) : null;
    if ($oldPath !== null) {
        @unlink($oldPath);
    }

    $updated = find_user_by_id((string)$user['id']);
    audit_log('account.avatar_updated', 'user', (string)$user['id'], []);
    json_response([
        'success' => true,
        'avatar'  => $avatarUrl,
        'user'    => $updated ? public_user($updated) : null,
    ], 201);
}

/** Remove the signed-in user's profile picture (falls back to initials). */
function handle_delete_avatar(): void
{
    $user = require_auth();
    $previous = (string)($user['avatar'] ?? '');

    update_user((string)$user['id'], ['avatar' => '']);
    $oldPath = $previous !== '' ? avatar_file_path($previous) : null;
    if ($oldPath !== null) {
        @unlink($oldPath);
    }

    $updated = find_user_by_id((string)$user['id']);
    audit_log('account.avatar_removed', 'user', (string)$user['id'], []);
    json_response(['success' => true, 'user' => $updated ? public_user($updated) : null]);
}

// ===========================================================================
// Agent accounts (Increment C)
//
// Scope discipline: these handlers manage *who an agent is* and *whether their
// account may submit listings*. They do not verify identity, licences or
// landlord authority — no document exists in this release, and every response
// says so explicitly.
// ===========================================================================
function handle_get_agent_profile(): void
{
    $user = require_auth(['agent']);
    $profile = find_agent_profile_by_user((string)$user['id']);
    if (!$profile) {
        error_response('This account has no agent profile.', 404);
    }

    // Own profile only: the id always comes from the session, never the request.
    json_response([
        'success' => true,
        'profile' => shape_agent_profile($profile),
        'permissions' => [
            'canSubmitListings' => agent_can_submit_listings($profile),
            // Stated as facts about this release, not as future promises.
            'identityVerified' => false,
            'professionalAuthorisationVerified' => false,
            'canModerate' => false,
        ],
    ]);
}

function handle_update_agent_profile(): void
{
    $user = require_auth(['agent']);
    $profile = find_agent_profile_by_user((string)$user['id']);
    if (!$profile) {
        error_response('This account has no agent profile.', 404);
    }

    $input = request_json();
    $fields = [];

    if (array_key_exists('agencyName', $input)) {
        $fields['agency_name'] = is_string($input['agencyName']) ? $input['agencyName'] : '';
    }
    if (array_key_exists('operatingCity', $input)) {
        $city = is_string($input['operatingCity']) ? clean_string($input['operatingCity'], 120) : '';
        if ($city === '') {
            error_response('Tell us the city you work from.', 422, [
                'operatingCity' => 'Enter the city you operate from.',
            ]);
        }
        $fields['operating_city'] = $city;
    }

    // Status, permissions and review fields are deliberately not accepted here;
    // unknown keys are ignored rather than trusted.
    if ($fields) {
        update_agent_profile((string)$user['id'], $fields);
        audit_log('agent.profile_updated', 'agent_profile', (string)$profile['id'], [
            'fields' => array_keys($fields),
        ]);
    }

    $updated = find_agent_profile_by_user((string)$user['id']);
    json_response([
        'success' => true,
        'profile' => $updated ? shape_agent_profile($updated) : null,
    ]);
}

function handle_list_agents(): void
{
    require_auth(['admin']);
    $status = query_param('status');
    $agents = list_agent_profiles(200);
    if ($status) {
        $agents = array_values(array_filter(
            $agents,
            static fn(array $a): bool => (string)$a['accountStatus'] === (string)$status
        ));
    }

    json_response([
        'success' => true,
        'count'   => count($agents),
        'agents'  => $agents,
    ]);
}

function handle_set_agent_status(array $params): void
{
    $admin = require_auth(['admin']);
    $userId = (string)($params[0] ?? '');
    $profile = find_agent_profile_by_user($userId);
    if (!$profile) {
        error_response('Agent account not found.', 404);
    }

    $input = request_json();
    $status = strtolower(trim((string)($input['accountStatus'] ?? '')));
    if (!in_array($status, AGENT_ACCOUNT_STATUSES, true)) {
        error_response('Choose a valid agent account status.', 422, [
            'accountStatus' => 'Allowed values: ' . implode(', ', AGENT_ACCOUNT_STATUSES) . '.',
        ]);
    }

    // Listing permission can only be granted to an active account.
    $canSubmit = !empty($input['canSubmitListings']);
    if ($status !== 'active' && $canSubmit) {
        error_response('Only an active agent account can be allowed to submit listings.', 422, [
            'canSubmitListings' => 'Activate the account first.',
        ]);
    }

    set_agent_account_status(
        $userId,
        $status,
        $canSubmit,
        (string)($input['note'] ?? ''),
        (string)$admin['id']
    );

    audit_log('agent.status_changed', 'agent_profile', (string)$profile['id'], [
        'from' => (string)$profile['account_status'],
        'to'   => $status,
        'canSubmitListings' => $status === 'active' ? $canSubmit : false,
        // Recorded so the audit trail never implies identity or licence checks.
        'identityChecked' => false,
        'licenceChecked'  => false,
    ]);

    $updated = find_agent_profile_by_user($userId);
    json_response([
        'success' => true,
        'profile' => $updated ? shape_agent_profile($updated) : null,
    ]);
}

// ===========================================================================
// Verification and private documents (Increment D)
//
// Two independent checks: IDENTITY (agent or landlord) and PROFESSIONAL
// AUTHORISATION (agent only). Uploading evidence only ever reaches
// `pending_review`; every decision is made by a reviewer and appended to an
// immutable history. No endpoint here touches receipts, fees, listings or
// tenancy agreements.
// ===========================================================================
function handle_get_verification(): void
{
    // Landlords may complete identity verification voluntarily; tenants never
    // need to (tenant registration is unchanged and requires no documents).
    $user = require_auth(['agent', 'landlord']);

    json_response([
        'success'      => true,
        'verification' => verification_summary_for_user($user),
    ]);
}

function handle_upload_verification_document(): void
{
    $user = require_auth(['agent', 'landlord']);
    enforce_rate_limit('verification-upload', 40, 3600);

    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        error_response('Choose a document to upload.', 400, ['file' => 'Choose a document to upload.']);
    }

    // Multipart bodies are not available through request_json(); form fields
    // arrive in $_POST.
    $kind = clean_string($_POST['kind'] ?? '', 32);
    if (!isset(VERIFICATION_DOCUMENT_KINDS[$kind])) {
        error_response('Choose a supported document type.', 422, ['kind' => 'Unsupported document type.']);
    }

    $kindScope = (string)VERIFICATION_DOCUMENT_KINDS[$kind]['scope'];
    $requestedScope = clean_string($_POST['scope'] ?? '', 32);
    $scope = $kindScope === 'any'
        ? (in_array($requestedScope, VERIFICATION_SCOPES, true) ? $requestedScope : 'identity')
        : $kindScope;

    if ($scope === 'professional' && (string)$user['role'] !== 'agent') {
        error_response('Only agents can submit professional authorisation documents.', 422);
    }

    if (count_verification_documents((string)$user['id'], $scope) >= MAX_VERIFICATION_DOCUMENTS_PER_SCOPE) {
        error_response(
            'You have reached the document limit for this section. Remove one before uploading another.',
            422
        );
    }

    try {
        $stored = store_private_document($_FILES['file'], (string)$user['id'], $kind);
    } catch (RuntimeException $e) {
        // Messages from the storage layer are written for humans and contain no
        // paths, no filenames and no server detail.
        error_response($e->getMessage(), 422, ['file' => $e->getMessage()]);
    }

    $document = create_verification_document(
        (string)$user['id'],
        $scope,
        $kind,
        $stored,
        (string)$user['id']
    );

    json_response([
        'success'  => true,
        'document' => shape_verification_document($document, true),
    ], 201);
}

function handle_submit_identity_verification(): void
{
    $user = require_auth(['agent', 'landlord']);
    enforce_rate_limit('verification-submit', 20, 3600);

    $existing = find_identity_verification((string)$user['id']);
    if ($existing && (string)$existing['status'] === 'approved') {
        // Replacing an approved identity without staff involvement would let
        // somebody swap the person behind a verified account.
        error_response(
            'Your identity is already verified. Contact Goodlucks to update it.',
            409,
            ['identity' => 'Already verified.']
        );
    }

    $input = request_json();
    $documentIds = is_array($input['documentIds'] ?? null) ? $input['documentIds'] : [];

    $row = submit_identity_verification($user, $input, $documentIds);

    json_response([
        'success'  => true,
        'message'  => 'Identity documents submitted for review.',
        'identity' => shape_identity_verification($row, false, (string)$user['id']),
    ], 201);
}

function handle_submit_professional_authorisation(): void
{
    $user = require_auth(['agent']);
    enforce_rate_limit('verification-submit', 20, 3600);

    $existing = find_professional_authorisation((string)$user['id']);
    if ($existing && effective_professional_status($existing) === 'approved') {
        error_response(
            'Your professional authorisation is already approved. Contact Goodlucks to change it.',
            409,
            ['professional' => 'Already approved.']
        );
    }

    $input = request_json();
    $documentIds = is_array($input['documentIds'] ?? null) ? $input['documentIds'] : [];

    $row = submit_professional_authorisation($user, $input, $documentIds);

    json_response([
        'success'  => true,
        'message'  => 'Professional authorisation submitted for review.',
        'professional' => shape_professional_authorisation($row, true, (string)$user['id']),
    ], 201);
}

function handle_serve_verification_document(array $params): void
{
    // Any signed-in account: ownership is checked below, so an agent reading
    // their own file works while the same URL is a 404 for everyone else.
    $user = require_auth();
    $document = find_verification_document((string)($params[0] ?? ''));

    if (!$document || !user_can_read_verification_document($user, $document)) {
        // 404, not 403: the endpoint must not confirm that a document exists.
        error_response('Document not found.', 404);
    }

    serve_private_document((string)$document['storage_id'], $user);
}

function handle_delete_verification_document(array $params): void
{
    $user = require_auth(['agent', 'landlord']);
    $document = find_verification_document((string)($params[0] ?? ''));

    // Owners only. A reviewer cannot delete evidence; the retention job does.
    if (!$document || (string)$document['user_id'] !== (string)$user['id']) {
        error_response('Document not found.', 404);
    }

    if ((string)$document['scope'] === 'identity') {
        $identity = find_identity_verification((string)$user['id']);
        if ($identity && (string)$identity['status'] === 'approved') {
            error_response('A verified identity document cannot be removed. Contact Goodlucks.', 409);
        }
    } else {
        $professional = find_professional_authorisation((string)$user['id']);
        if ($professional && effective_professional_status($professional) === 'approved') {
            error_response('An approved authorisation document cannot be removed. Contact Goodlucks.', 409);
        }
    }

    delete_verification_document($document, 'owner_deleted', $user);

    json_response(['success' => true]);
}

// --- Reviewer endpoints ----------------------------------------------------

function handle_admin_verification_queue(): void
{
    $reviewer = require_verification_reviewer();

    $status = query_param('status');
    $scope = query_param('scope');
    $items = verification_queue(
        is_string($status) ? $status : null,
        is_string($scope) ? $scope : null
    );

    json_response([
        'success'      => true,
        'count'        => count($items),
        'verifications'=> $items,
        'capabilities' => verification_capabilities($reviewer),
        'statuses'     => [
            'identity'     => IDENTITY_STATUSES,
            'professional' => PROFESSIONAL_STATUSES,
        ],
    ]);
}

function handle_admin_verification_detail(array $params): void
{
    $reviewer = require_verification_reviewer();
    $subject = find_user_by_id((string)($params[0] ?? ''));

    if (!$subject || !in_array((string)$subject['role'], ['agent', 'landlord'], true)) {
        error_response('Verification record not found.', 404);
    }

    json_response([
        'success'      => true,
        'verification' => verification_detail_for_reviewer(
            $subject,
            can_access_identity_documents($reviewer)
        ),
    ]);
}

function handle_admin_verification_history(array $params): void
{
    require_verification_reviewer();
    $subject = find_user_by_id((string)($params[0] ?? ''));
    if (!$subject) {
        error_response('Verification record not found.', 404);
    }

    $scope = query_param('scope');
    json_response([
        'success' => true,
        'history' => verification_history(
            (string)$subject['id'],
            is_string($scope) && in_array($scope, VERIFICATION_SCOPES, true) ? $scope : null
        ),
    ]);
}

function handle_admin_decide_identity(array $params): void
{
    $reviewer = require_verification_reviewer();
    enforce_rate_limit('verification-decision', 200, 3600);

    $subject = find_user_by_id((string)($params[0] ?? ''));
    if (!$subject || !in_array((string)$subject['role'], ['agent', 'landlord'], true)) {
        error_response('Verification record not found.', 404);
    }

    $input = request_json();
    try {
        $row = record_verification_decision(
            (string)$subject['id'],
            'identity',
            strtolower(trim((string)($input['decision'] ?? ''))),
            (string)($input['note'] ?? ''),
            $reviewer
        );
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    json_response([
        'success'  => true,
        'identity' => shape_identity_verification($row, false, (string)$subject['id']),
        'history'  => verification_history((string)$subject['id'], 'identity'),
    ]);
}

function handle_admin_decide_professional(array $params): void
{
    $reviewer = require_verification_reviewer();
    enforce_rate_limit('verification-decision', 200, 3600);

    $subject = find_user_by_id((string)($params[0] ?? ''));
    if (!$subject || (string)$subject['role'] !== 'agent') {
        error_response('Verification record not found.', 404);
    }

    $input = request_json();
    try {
        $row = record_verification_decision(
            (string)$subject['id'],
            'professional',
            strtolower(trim((string)($input['decision'] ?? ''))),
            (string)($input['note'] ?? ''),
            $reviewer
        );
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    json_response([
        'success'      => true,
        'professional' => shape_professional_authorisation($row, false, (string)$subject['id']),
        'history'      => verification_history((string)$subject['id'], 'professional'),
    ]);
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
        $user = require_auth(['landlord', 'agent', 'admin']);
        if (($user['role'] ?? '') === 'agent') {
            // An agent's own listings are the ones they submitted, which is not
            // the same thing as owning the property or representing the owner.
            $filters = ['submittedByUserId' => $user['id']];
        } else {
            $filters = ['landlordId' => $user['id']];
        }
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
    $user = require_auth(['landlord', 'agent', 'admin']);
    enforce_rate_limit('property-create', 30, 3600);

    $input = request_json();

    // Increment C: an agent submitting on someone else's behalf is a different
    // relationship from an owner listing their own property. Both end up in the
    // same moderation queue, but they are stored differently.
    $isAgentSubmission = ($user['role'] ?? '') === 'agent';
    $agentProfile = null;
    $landlordAccount = null;
    if ($isAgentSubmission) {
        $agentProfile = find_agent_profile_by_user((string)$user['id']);
        if (!agent_can_submit_listings($agentProfile)) {
            error_response(
                'Your agent account is still pending review, so listing submissions are not open yet.',
                403,
                ['agentStatus' => 'Agent listing submissions require an approved account.']
            );
        }

        // An agent must always say who the landlord is. Refusing to fall back to
        // "the creating user" is the whole point: the agent's own account must
        // never become the property's owner by accident.
        //
        // Increment F: the reference is resolved server-side and the response is
        // IDENTICAL whether or not an account matched. The old behaviour ("that
        // landlord account could not be found") turned this endpoint into an
        // account-existence oracle for any agent; it also let an agent attach a
        // listing to an arbitrary landlord id. Now an unmatched claim is simply
        // recorded for staff to review, and no tenant ever sees it.
        $landlordId = clean_string($input['landlordId'] ?? '', 64);
        $landlordEmail = strtolower(clean_string($input['landlordEmail'] ?? '', 200));
        $landlordPhone = clean_string($input['landlordPhone'] ?? '', 40);
        $landlordName = clean_string($input['landlordName'] ?? '', 120);

        if ($landlordId === '' && $landlordEmail === '' && $landlordPhone === '') {
            error_response(
                'Provide the landlord this listing is for.',
                422,
                ['landlordId' => 'Give the landlord\'s name plus their email or phone number.']
            );
        }

        $landlordAccount = null;
        if ($landlordId !== '') {
            $candidate = find_user_by_id($landlordId);
            if ($candidate && (string)($candidate['role'] ?? '') === 'landlord') {
                $landlordAccount = $candidate;
            }
        }
        if ($landlordAccount === null && $landlordEmail !== '') {
            $candidate = find_user_by_email($landlordEmail);
            if ($candidate && (string)($candidate['role'] ?? '') === 'landlord') {
                $landlordAccount = $candidate;
            }
        }
        if ($landlordAccount === null && $landlordPhone !== '') {
            $candidate = find_user_by_phone($landlordPhone);
            if ($candidate && (string)($candidate['role'] ?? '') === 'landlord') {
                $landlordAccount = $candidate;
            }
        }
    }

    [$data, $validator] = property_payload($input, false);
    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }

    // Landlord and agent submissions always start in the moderation queue.
    $data['status'] = $user['role'] === 'admin'
        ? one_of($input['status'] ?? 'active', PROPERTY_STATUSES, 'pending')
        : 'pending';

    if ($isAgentSubmission) {
        // The agent is recorded separately, and never as the owner. When the
        // reference matched a landlord account, that account is linked; when it
        // did not, the listing is stored with NO landlord account and the claim
        // kept for staff review. The response says the same thing either way.
        if ($landlordAccount !== null) {
            $data['landlord_id'] = (string)$landlordAccount['id'];
            $data['landlord_name'] = (string)$landlordAccount['name'];
            $data['landlord_company'] = (string)($landlordAccount['company'] ?? '');
            $data['landlord_contact_claimed'] = null;
        } else {
            // No account matched. The listing is stored without a landlord
            // account, and the claim is kept for staff review. The authority
            // state is the SAME word either way: the response must not answer
            // "does this landlord exist on Goodlucks?".
            $data['landlord_id'] = null;
            $data['landlord_name'] = $landlordName !== '' ? $landlordName : 'Landlord named by the agent';
            $data['landlord_company'] = '';
            // Keep whatever the agent gave us, so staff can follow it up.
            $claimed = array_values(array_filter([$landlordEmail, $landlordPhone, $landlordId], static fn($v) => $v !== ''));
            $data['landlord_contact_claimed'] = implode(' / ', $claimed);
        }
        $data['landlord_authority_state'] = 'claimed_by_agent';
        $data['submitted_by_user_id'] = (string)$user['id'];
        $data['submitted_by_role'] = 'agent';
        // A declaration, not proof: the agent says they act for this landlord.
        // Nothing here verifies ownership or authority.
    } else {
        $data['landlord_id'] = $user['role'] === 'admin' && !empty($input['landlordId'])
            ? clean_string($input['landlordId'], 64)
            : (string)$user['id'];
        $data['landlord_name'] = (string)$user['name'];
        $data['landlord_company'] = (string)($user['company'] ?? '');
        $data['submitted_by_user_id'] = (string)$user['id'];
        $data['submitted_by_role'] = (string)$user['role'];
        $data['landlord_authority_state'] = $user['role'] === 'admin' ? 'recorded_by_staff' : 'owner';
    }
    // Increment B: nothing is auto-verified. A listing (or a landlord identity)
    // only carries the flag when staff explicitly set it after a real check;
    // registering or having staff create a listing proves nothing about
    // ownership or identity, so every new listing starts unverified.
    $data['is_landlord_verified'] = 0;

    $id = create_property($data);
    $created = find_property($id);

    if ($isAgentSubmission) {
        // Staff-only record of what the agent claimed. The contact itself is
        // never returned to a client and never confirmed against an account in
        // the response.
        audit_log('property.agent_submitted', 'property', $id, [
            'agentUserId'     => (string)$user['id'],
            'landlordMatched' => $landlordAccount !== null,
            'authorityState'  => (string)($data['landlord_authority_state'] ?? ''),
        ]);
    }

    // An admin can publish immediately; landlords go to the queue and are
    // matched when approved.
    if ($created && ($created['status'] ?? '') === 'active') {
        try {
            dispatch_search_alert_matches($created);
        } catch (Throwable $e) {
            gl_log('error', 'Search alert dispatch failed: ' . $e->getMessage(), ['property' => $id]);
        }
    }

    if ($user['role'] === 'landlord' || $isAgentSubmission) {
        send_email(
            (string)$user['email'],
            (string)$user['name'],
            'Property submission received: ' . $data['title'],
            email_html_template(
                'Property submitted for verification',
                '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e($user['name']) . ',</p>'
                . '<p style="color:#CBD5E1;font-size:14px;">We have received your listing <strong>' . e($data['title']) . '</strong> in '
                . e($data['location']) . '. Our team will physically verify the property before it goes live.</p>'
                . ($isAgentSubmission
                    ? '<p style="color:#94A3B8;font-size:13px;">It is recorded as submitted by you on behalf of '
                        . e((string)$landlordAccount['name']) . '. This is your declaration: Goodlucks has not yet checked it.</p>'
                    : '')
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
                    '<p style="color:#CBD5E1;font-size:14px;">' . e($user['name'])
                    . ($isAgentSubmission ? ' (agent)' : '') . ' submitted <strong>' . e($data['title'])
                    . '</strong> in ' . e($data['location']) . ' (GH₵ ' . number_format((float)$data['rent_ghs'], 2) . '/mo).</p>'
                    . ($isAgentSubmission
                        ? '<p style="color:#94A3B8;font-size:12px;">Agent declaration: acts for ' . e((string)$landlordAccount['name'])
                            . ' (landlord account ' . e((string)$landlordAccount['id']) . '). Landlord authority is unverified.</p>'
                        : '')
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
    // Agents edit only listings they submitted (see can_manage_property).
    $user = require_auth(['landlord', 'agent', 'admin']);

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
    $user = require_auth(['landlord', 'agent', 'admin']);

    $row = find_property($id);
    if (!$row) {
        error_response('Property not found.', 404);
    }
    if (!can_manage_property($user, $row)) {
        error_response('You do not have permission to delete this property.', 403);
    }

    // Soft delete: keeps enquiries and viewing history intact while
    // removing the listing from public view.
    update_property($id, ['status' => 'deactivated']);

    audit_log('property.deleted', 'property', $id, [
        'purge' => query_param('purge') === '1',
        'asRole' => (string)$user['role'],
    ]);

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

    audit_log('property.status_changed', 'property', $id, [
        'from' => (string)($row['status'] ?? ''),
        'to'   => $status,
    ]);

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

    audit_log('property.verification_changed', 'property', $id, [
        'verified' => $verified,
    ]);
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

    audit_log('property.featured_changed', 'property', $id, ['featured' => $featured]);
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
    $user = require_auth(['landlord', 'agent', 'admin']);
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
    // Resolve and confirm the file really sits inside the public uploads
    // directory. Private documents live in PRIVATE_UPLOAD_DIR and are only
    // reachable through serve_private_document(), never here.
    $root = realpath(rtrim(UPLOAD_DIR, '/'));
    $real = realpath($path);
    if ($root === false || $real === false || !str_starts_with($real, $root . DIRECTORY_SEPARATOR) || !is_file($real)) {
        error_response('File not found.', 404);
    }
    $path = $real;
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

    audit_log('enquiry.status_changed', 'enquiry', $id, [
        'from' => (string)($row['status'] ?? ''),
        'to'   => $status,
    ]);

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
/**
 * Increment F — a tenant (or a guest) asks to see a property.
 *
 * The row this creates is a REQUEST, not an appointment: its status is
 * `viewing_requested` (or `enquiry_received` for a plain enquiry) and
 * `confirmed_at` stays null. Nothing in this handler claims a viewing has been
 * agreed, and nothing touches money.
 */
function handle_create_viewing(): void
{
    enforce_rate_limit('viewing', VIEWING_RATE_LIMIT_PER_HOUR, 3600);
    $input = request_json();
    $user = auth_user();

    // Pressing "Request viewing" twice must not create two requests.
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

    $requestType = one_of($input['requestType'] ?? 'viewing', array_keys(VIEWING_REQUEST_TYPES), 'viewing');
    $isEnquiry = $requestType === 'enquiry';

    $validator = new Validator();
    $validator->required('tenantName', $input['tenantName'] ?? '', 'Your name', 2);
    $validator->phone('tenantPhone', $input['tenantPhone'] ?? '');
    $validator->email('tenantEmail', $input['tenantEmail'] ?? '');

    $propertyId = clean_string($input['propertyId'] ?? '', 64);
    if ($propertyId === '') {
        $validator->add('propertyId', 'Select the property you are asking about.');
    }

    $date = valid_date_iso($input['date'] ?? $input['preferredDate'] ?? null);
    $time = clean_string($input['time'] ?? $input['preferredTime'] ?? '', 20);
    if (!$isEnquiry || $date !== null || $time !== '') {
        if ($date === null) {
            $validator->add('date', 'Choose a preferred viewing date.');
        } elseif ($date < gmdate('Y-m-d')) {
            $validator->add('date', 'The preferred date cannot be in the past.');
        }
        if ($time === '') {
            $validator->add('time', 'Choose a preferred viewing time.');
        }
    }

    $message = clean_text($input['message'] ?? $input['notes'] ?? '', 1000);

    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }

    $property = find_property($propertyId);
    if (!$property || !in_array((string)$property['status'], ['active', 'rented'], true)) {
        error_response('That property is no longer available for viewing.', 404);
    }

    // The responsible agent is the agent who submitted the listing, when that
    // agent's account is active. Otherwise the request waits for the Goodlucks
    // viewing desk — it is never silently assigned to a landlord.
    $agentUser = viewing_responsible_agent($property);
    $agentUserId = $agentUser ? (string)$agentUser['id'] : '';
    $agentName = $agentUser ? (string)$agentUser['name'] : 'Goodlucks viewing desk';

    $tenantUserId = '';
    if ($user && (string)($user['role'] ?? '') === 'tenant') {
        $tenantUserId = (string)$user['id'];
    }

    $status = $isEnquiry ? 'enquiry_received' : 'viewing_requested';
    $viewingId = create_viewing([
        'tenant_request_id' => clean_string($input['tenantRequestId'] ?? '', 64),
        'tenant_name'       => clean_string($input['tenantName'], 120),
        'tenant_phone'      => (string)valid_phone($input['tenantPhone']),
        'tenant_email'      => (string)valid_email($input['tenantEmail']),
        'tenant_user_id'    => $tenantUserId,
        'agent_user_id'     => $agentUserId,
        'landlord_user_id'  => (string)($property['landlord_id'] ?? ''),
        'request_type'      => $requestType,
        'property_id'       => $propertyId,
        'property_title'    => (string)$property['title'],
        'property_location' => (string)$property['location'],
        'date'              => $date ?? '',
        'time'              => $time,
        'preferred_date'    => $date ?? '',
        'preferred_time'    => $time,
        'assigned_agent'    => $agentName,
        'status'            => $status,
        'viewing_fee_paid'  => false, // Never assumed: paid on site, if at all.
        'fee_amount_ghs'    => VIEWING_FEE_GHS,
        'outcome_notes'     => $message,
    ]);

    record_viewing_event(
        $viewingId,
        'viewing.created',
        '',
        $status,
        $message !== '' ? $message : null,
        $user,
        $user ? (string)($user['role'] ?? 'guest') : 'guest',
        null,
        null,
        $date,
        $time
    );

    $viewing = find_viewing($viewingId);
    if ($viewing === null) {
        error_response('The viewing request could not be read back.', 500);
    }

    // Honest tenant email: this is a request, not a confirmed appointment.
    send_email(
        (string)valid_email($input['tenantEmail']),
        clean_string($input['tenantName'], 120),
        ($isEnquiry ? 'We received your enquiry: ' : 'We received your viewing request: ') . (string)$property['title'],
        email_html_template(
            $isEnquiry ? 'Enquiry received' : 'Viewing request received',
            '<p style="color:#CBD5E1;font-size:14px;">Dear ' . e(clean_string($input['tenantName'], 120)) . ',</p>'
            . '<p style="color:#CBD5E1;font-size:14px;">'
            . ($isEnquiry
                ? 'We have passed your question about <strong>' . e((string)$property['title']) . '</strong> to the agent responsible for it.'
                : 'Your request to view <strong>' . e((string)$property['title']) . '</strong> has been sent to '
                  . e($agentName) . '. It is <strong>not confirmed yet</strong>: the agent will contact you to agree a time.')
            . '</p>'
            . ($date !== null ? '<div style="background:#252A34;padding:16px;border-radius:8px;border-left:4px solid #08D9D6;margin:15px 0;">'
                . '<span style="color:#94A3B8;font-size:13px;">Your preferred slot</span><br>'
                . '<span style="color:#38BDF8;font-weight:bold;">' . e($date) . ' at ' . e($time) . '</span><br>'
                . '<span style="color:#E2E8F0;font-size:13px;">The agent may propose a different time.</span></div>' : '')
            . '<p style="color:#94A3B8;font-size:12px;">A viewing fee, if one applies, is paid on site after meeting the agent. Goodlucks never asks for a viewing fee online, and no payment has been recorded for this request.</p>'
        ),
        $isEnquiry ? 'enquiry_received' : 'viewing_requested',
        'Request received'
    );

    if ($agentUserId !== '') {
        create_notification(
            $agentUserId,
            'New viewing request: ' . $property['title'],
            $viewing['tenantName'] . ' asked to view ' . $property['title']
                . ($date !== null ? ' on ' . $date . ' at ' . $time : '') . '. Nothing is confirmed yet.',
            'viewing'
        );
    }

    send_internal_notification(
        '[NEW VIEWING REQUEST] ' . $property['title'] . ' by ' . $viewing['tenantName'],
        '<p style="color:#CBD5E1;font-size:14px;"><strong>' . e($viewing['tenantName']) . '</strong> ('
        . e($viewing['tenantPhone']) . ' / ' . e($viewing['tenantEmail']) . ') requested a viewing.</p>'
        . '<p style="color:#94A3B8;font-size:13px;">Property: ' . e((string)$property['title'])
        . '<br>Preferred: ' . e($date ?? 'not stated') . ' at ' . e($time)
        . '<br>Agent: ' . e($agentName)
        . '<br>Status: ' . e(viewing_status_label($status)) . ' (not confirmed)'
        . '<br>Reference: ' . e($viewingId) . '</p>',
        ['viewing_id' => $viewingId]
    );

    remember_submission($fingerprint, 'viewing', $viewingId);

    json_response([
        'success'      => true,
        'message'      => $isEnquiry
            ? 'Your enquiry has been sent to the agent responsible for this property.'
            : 'Your viewing request has been sent. It is not confirmed until the agent agrees a time with you.',
        'viewingId'    => $viewingId,
        'feeAmountGhs' => VIEWING_FEE_GHS,
        'awaitingAgent'=> true,
        'viewing'      => $viewing,
    ], 201);
}

/**
 * Scoped listing. Tenants see their own, agents see the ones assigned to them,
 * landlords see their own properties, administrators see everything with
 * optional filters. A client cannot widen its own scope.
 */
function handle_list_viewings(): void
{
    $user = require_auth();
    $role = (string)($user['role'] ?? '');

    if ($role === 'admin') {
        $scope = [];
        $status = query_param('status');
        if ($status !== null && $status !== '') {
            $scope['status'] = $status;
        }
        foreach (['propertyId' => 'propertyId', 'agentUserId' => 'agentUserId', 'tenantUserId' => 'tenantUserId'] as $key => $param) {
            $value = query_param($param);
            if ($value !== null && $value !== '') {
                $scope[$key] = $value;
            }
        }
        $viewings = list_viewings_filtered($scope, 500);
        $overdue = array_values(array_filter($viewings, static fn(array $v) => (bool)$v['overdue']));
        $unresolved = array_values(array_filter(
            $viewings,
            static fn(array $v) => !$v['isTerminal'] && in_array($v['status'], ['enquiry_received', 'viewing_requested', 'awaiting_agent', 'reschedule_requested'], true)
        ));

        json_response([
            'success'  => true,
            'viewings' => $viewings,
            'counts'   => [
                'total'      => count($viewings),
                'overdue'    => count($overdue),
                'unresolved' => count($unresolved),
                'confirmed'  => count(array_filter($viewings, static fn(array $v) => $v['isConfirmed'])),
                'completed'  => count(array_filter($viewings, static fn(array $v) => $v['status'] === 'completed')),
                'cancelled'  => count(array_filter($viewings, static fn(array $v) => $v['status'] === 'cancelled')),
            ],
            'filters'  => ['status' => $scope['status'] ?? '', 'propertyId' => $scope['propertyId'] ?? '', 'agentUserId' => $scope['agentUserId'] ?? '', 'tenantUserId' => $scope['tenantUserId'] ?? ''],
            'capabilities' => viewing_capabilities($user),
        ]);
        return;
    }

    if ($role === 'agent') {
        if (!viewing_agent_operational($user)) {
            error_response(
                'Your agent account is not active, so viewing tools are closed. Your existing records are kept but not shown here.',
                403
            );
        }
        json_response(['success' => true, 'viewings' => list_viewings_filtered(['agentUserId' => (string)$user['id']], 200)]);
        return;
    }

    if ($role === 'landlord') {
        json_response(['success' => true, 'viewings' => list_viewings_filtered(['landlordId' => (string)$user['id']], 200)]);
        return;
    }

    json_response([
        'success'  => true,
        'viewings' => list_viewings_filtered([
            'tenantUserId' => (string)$user['id'],
            'tenantEmail'  => (string)($user['email'] ?? ''),
        ], 100),
    ]);
}

/** One viewing, with its history, if the caller is allowed to see it. */
function handle_get_viewing(array $params): void
{
    $user = require_auth();
    $id = (string)($params[0] ?? '');
    $viewing = find_viewing($id);
    if (!$viewing) {
        error_response('Viewing not found.', 404);
    }

    $access = viewing_access($viewing, $user);
    if (!$access['canView']) {
        error_response($access['canView'] ? 'You cannot view this.' : 'You do not have access to this viewing.', 403);
    }

    $detail = [
        'success'        => true,
        'viewing'        => $viewing,
        'history'        => list_viewing_events($id),
        'access'         => ['role' => $access['role'], 'canAct' => $access['canAct']],
        'allowedActions' => $access['canAct'] ? viewing_allowed_actions($viewing, $access['role']) : [],
        'financial'      => viewing_financial_state($viewing),
    ];

    if ($access['role'] === 'admin') {
        $detail['capabilities'] = viewing_capabilities($user);
        $detail['landlordUserId'] = (string)($viewing['landlordUserId'] ?? '');
    }

    json_response($detail);
}

/**
 * One endpoint per lifecycle action, all routed through the same validated
 * state machine. The action name is a route parameter so a typo is a 404, not
 * an accidental status change.
 */
function handle_viewing_action(array $params): void
{
    $user = require_auth();
    $id = (string)($params[0] ?? '');
    $action = (string)($params[1] ?? '');
    enforce_rate_limit('viewing-action', VIEWING_ACTION_RATE_LIMIT_PER_HOUR, 3600);

    $viewing = find_viewing($id);
    if (!$viewing) {
        error_response('Viewing not found.', 404);
    }

    $access = viewing_access($viewing, $user);
    if (!$access['canView']) {
        error_response('You do not have access to this viewing.', 403);
    }
    if (!$access['canAct']) {
        error_response($access['reason'] !== '' ? $access['reason'] : 'This viewing cannot be changed.', 409);
    }
    $role = $access['role'];

    $input = request_json();
    $note = clean_text($input['note'] ?? '', 1000);
    $reason = clean_text($input['reason'] ?? '', 1000);
    $date = isset($input['date']) ? clean_string((string)$input['date'], 32) : null;
    $time = isset($input['time']) ? clean_string((string)$input['time'], 32) : null;

    $agentOnly = static function (string $role): void {
        if (!in_array($role, ['agent', 'admin'], true)) {
            error_response('Only the agent responsible for this viewing can do that.', 403);
        }
    };

    switch ($action) {
        case 'propose':
            $agentOnly($role);
            if ($date === null || $time === null || $time === '') {
                error_response('Choose the date and time you are proposing.', 422, [
                    'date' => 'A proposed appointment needs a date.',
                    'time' => 'A proposed appointment needs a time.',
                ]);
            }
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => 'proposed', 'date' => $date, 'time' => $time, 'note' => $note,
            ]);
            json_response([
                'success' => true,
                'message' => 'Proposed ' . $updated['date'] . ' at ' . $updated['time'] . '. The tenant still has to agree.',
                'viewing' => $updated,
            ]);
            return;

        case 'confirm':
            if (!in_array($role, ['tenant', 'agent', 'admin'], true)) {
                error_response('Only the tenant or the responsible agent can confirm this appointment.', 403);
            }
            if (viewing_normalise_status($viewing['status']) === 'confirmed') {
                error_response('This appointment is already confirmed.', 409);
            }
            $updated = viewing_apply_transition($viewing, $user, $role, ['status' => 'confirmed', 'note' => $note]);
            json_response([
                'success' => true,
                'message' => 'Appointment confirmed for ' . $updated['date'] . ' at ' . $updated['time'] . '.',
                'viewing' => $updated,
            ]);
            return;

        case 'reschedule':
            $agentOnly($role);
            if ($date === null || $time === null || $time === '') {
                error_response('Choose the new date and time.', 422, [
                    'date' => 'A rescheduled appointment needs a date.',
                    'time' => 'A rescheduled appointment needs a time.',
                ]);
            }
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => 'rescheduled', 'date' => $date, 'time' => $time, 'note' => $note !== '' ? $note : $reason,
            ]);
            json_response([
                'success' => true,
                'message' => 'Rescheduled to ' . $updated['date'] . ' at ' . $updated['time'] . '. The previous slot is kept in the history.',
                'viewing' => $updated,
            ]);
            return;

        case 'request-reschedule':
            if (!in_array($role, ['tenant', 'agent', 'admin'], true)) {
                error_response('Only the tenant or the agent can ask for a new time.', 403);
            }
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => 'reschedule_requested', 'date' => $date, 'time' => $time, 'note' => $note,
            ]);
            json_response([
                'success' => true,
                'message' => 'Reschedule request recorded. The appointment is not moved until a new time is agreed.',
                'viewing' => $updated,
            ]);
            return;

        case 'cancel':
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => 'cancelled',
                'note'   => $note,
                'reason' => $reason !== '' ? $reason : ($role === 'tenant' ? 'Cancelled by the tenant' : ''),
            ]);
            json_response([
                'success' => true,
                'message' => 'Viewing cancelled. The reason is recorded in the history.',
                'viewing' => $updated,
            ]);
            return;

        case 'complete':
            $agentOnly($role);
            if ($role === 'admin' && $note === '') {
                error_response('Add a note when an administrator records a completion.', 422, [
                    'note' => 'The audit trail needs to say what was verified.',
                ]);
            }
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => 'completed', 'note' => $note !== '' ? $note : ($reason !== '' ? $reason : null),
            ]);
            json_response([
                'success' => true,
                'message' => 'Viewing marked complete. No payment has been recorded by this action.',
                'viewing' => $updated,
            ]);
            return;

        case 'no-show':
            $who = one_of($input['who'] ?? '', ['tenant', 'agent'], null);
            if ($who === null) {
                error_response('Say who did not attend.', 422, ['who' => 'Choose tenant or agent.']);
            }
            if ($role === 'tenant' && $who === 'tenant') {
                error_response('A tenant cannot record themselves as a no-show.', 403);
            }
            if ($role === 'agent' && $who === 'agent') {
                error_response('An agent cannot record themselves as a no-show; the tenant can.', 403);
            }
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => $who === 'tenant' ? 'tenant_no_show' : 'agent_no_show',
                'note'   => $note,
                'reason' => $reason,
            ]);
            json_response([
                'success' => true,
                'message' => 'Recorded: ' . ($who === 'tenant' ? 'the tenant did not attend' : 'the agent did not attend') . '.',
                'viewing' => $updated,
            ]);
            return;

        case 'could-not-proceed':
            $agentOnly($role);
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => 'could_not_proceed', 'reason' => $reason, 'note' => $note,
            ]);
            json_response([
                'success' => true,
                'message' => 'Recorded that the viewing could not proceed.',
                'viewing' => $updated,
            ]);
            return;
    }

    error_response('Unknown viewing action.', 404);
}

/** Admin view of one viewing: full history, financial state and landlord link. */
function handle_admin_viewing_detail(array $params): void
{
    $user = require_auth(['admin']);
    $id = (string)($params[0] ?? '');
    $viewing = find_viewing($id);
    if (!$viewing) {
        error_response('Viewing not found.', 404);
    }

    json_response([
        'success'        => true,
        'viewing'        => $viewing,
        'history'        => list_viewing_events($id),
        'financial'      => viewing_financial_state($viewing),
        'landlordUserId' => (string)($viewing['landlordUserId'] ?? ''),
        'allowedActions' => viewing_allowed_actions($viewing, 'admin'),
        'capabilities'   => viewing_capabilities($user),
    ]);
}

/** Exceptional, audited correction. Requires the viewing-correction capability. */
function handle_correct_viewing(array $params): void
{
    $admin = require_viewing_corrector();
    $id = (string)($params[0] ?? '');
    $viewing = find_viewing($id);
    if (!$viewing) {
        error_response('Viewing not found.', 404);
    }

    $input = request_json();
    $status = (string)($input['status'] ?? '');
    $reason = (string)($input['reason'] ?? '');

    $updated = viewing_apply_correction($viewing, $admin, $status, $reason);

    json_response([
        'success' => true,
        'message' => 'Correction recorded. The previous status is kept in the audit trail.',
        'viewing' => $updated,
    ]);
}

/** Assign or reassign the agent responsible for a viewing. */
function handle_assign_viewing_agent(array $params): void
{
    $admin = require_auth(['admin']);
    $id = (string)($params[0] ?? '');
    $viewing = find_viewing($id);
    if (!$viewing) {
        error_response('Viewing not found.', 404);
    }

    $input = request_json();
    $updated = viewing_assign_agent($viewing, (string)($input['agentUserId'] ?? ''), $admin);

    json_response([
        'success' => true,
        'message' => 'Viewing assigned to the agent.',
        'viewing' => $updated,
    ]);
}

/**
 * Legacy PATCH /viewings/{id} (Increment 0).
 *
 * Kept because the existing admin screen and the fee ledger depend on it. It now
 * runs through the same state machine: an administrator status change writes a
 * viewing_events row and an audit entry, and a landlord can only cancel their
 * own property's viewing. The physical fee checkbox is unchanged (Increment B).
 */
function handle_update_viewing(array $params): void
{
    $user = require_auth();
    $id = (string)($params[0] ?? '');
    $viewing = find_viewing($id);
    if (!$viewing) {
        error_response('Viewing not found.', 404);
    }

    $access = viewing_access($viewing, $user);
    if (!$access['canView']) {
        error_response('You do not have permission to update this viewing.', 403);
    }
    $role = $access['role'];

    $input = request_json();
    $requestedStatus = isset($input['status']) && $input['status'] !== null && $input['status'] !== ''
        ? viewing_normalise_status((string)$input['status'])
        : null;

    if ($requestedStatus !== null && $requestedStatus !== viewing_normalise_status($viewing['status'])) {
        if (!in_array($role, ['admin', 'landlord'], true)) {
            error_response(
                'Change a viewing through its own actions (propose, confirm, reschedule, cancel, complete).',
                403
            );
        }
        if (!$access['canAct'] && $role !== 'admin') {
            error_response($access['reason'] !== '' ? $access['reason'] : 'This viewing is closed.', 409);
        }
        if ($role === 'landlord' && $requestedStatus !== 'cancelled') {
            error_response('A landlord can only cancel a viewing.', 403);
        }

        $note = clean_text($input['note'] ?? $input['reason'] ?? '', 1000);
        if ($role === 'landlord') {
            $viewing = viewing_apply_transition($viewing, $user, 'landlord', [
                'status' => 'cancelled',
                'reason' => $note !== '' ? $note : 'Cancelled by the landlord',
                'note'   => $note,
            ]);
        } else {
            // Administrator path: allowed transitions are applied normally;
            // anything a normal transition cannot express is refused rather
            // than forced, so the record cannot be rewritten silently.
            $viewing = viewing_apply_transition($viewing, $user, 'admin', [
                'status' => $requestedStatus,
                'reason' => $note !== '' ? $note : 'Status set from the legacy viewing update endpoint',
                'note'   => $note,
            ]);
        }
    }

    $fields = [];
    $existingFeeRecord = find_viewing_fee_record_by_viewing($id);
    if (array_key_exists('viewingFeePaid', $input) && $role === 'admin') {
        $markingUnpaid = !(bool)$input['viewingFeePaid'];
        // Money already remitted must never disappear from the ledger because a
        // checkbox was unticked: refuse the reversal instead of rewriting it.
        if ($markingUnpaid && $existingFeeRecord
            && fee_remitted_total((string)$existingFeeRecord['id']) > 0
        ) {
            error_response(
                'Money has already been remitted against this viewing fee. '
                . 'Resolve the remittance in the fee ledger before removing the fee.',
                409
            );
        }
        $fields['viewing_fee_paid'] = (bool)$input['viewingFeePaid'];
    }
    if (array_key_exists('outcomeNotes', $input) && $role === 'admin') {
        $fields['outcome_notes'] = $input['outcomeNotes'];
    }
    if (array_key_exists('assignedAgent', $input) && $role === 'admin') {
        $fields['assigned_agent'] = $input['assignedAgent'];
    }
    if ($fields) {
        update_viewing($id, $fields);
    }

    // Increment B: a reported on-site collection creates a ledger row. The row
    // records what the AGENT collected; it is not Goodlucks revenue, and
    // nothing here is triggered by a status change on its own.
    $updated = find_viewing($id);
    if ($updated && (bool)($updated['viewingFeePaid'] ?? false)) {
        if (!$existingFeeRecord) {
            $record = ensure_viewing_fee_record($updated, $user);
            if ($record) {
                audit_log('viewing_fee.reported', 'viewing_fee', (string)$record['id'], [
                    'viewingId'        => $id,
                    'feeTotalGhs'      => $record['fee_total_ghs'] === null ? null : (float)$record['fee_total_ghs'],
                    'agentName'        => (string)($record['agent_name'] ?? ''),
                    'collectedByAgent' => true,
                ]);
            }
        }
    } elseif ($updated && !(bool)($updated['viewingFeePaid'] ?? false) && $existingFeeRecord) {
        try {
            set_viewing_fee_state((string)$existingFeeRecord['id'], 'void', 'Fee collection reversed by staff', $user);
            audit_log('viewing_fee.voided', 'viewing_fee', (string)$existingFeeRecord['id'], ['viewingId' => $id]);
        } catch (InvalidArgumentException $e) {
            // Keep the ledger intact; the viewing flag still changed.
            error_response($e->getMessage(), 409);
        }
    }

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
// Rent payment records
//
// Goodlucks no longer drafts, signs, emails or stores tenancy agreements. The
// agreement handlers and routes were removed in Increment A; the
// `tenancy_agreements` table is left untouched in the schema.
// ===========================================================================
function handle_list_receipts(): void
{
    $user = require_auth(['admin', 'landlord', 'tenant']);
    json_response([
        'success'        => true,
        'receipts'       => list_receipts($user, 200),
        'issuingEnabled' => RECEIPT_ISSUING_ENABLED,
    ]);
}

/**
 * One receipt, scoped to the people it concerns.
 *
 * Unauthorised callers get 404 rather than 403 so receipt ids cannot be probed
 * for existence.
 */
function handle_get_receipt(array $params): void
{
    $user = require_auth(['admin', 'landlord', 'tenant']);
    $row = find_receipt((string)($params[0] ?? ''));
    if (!$row || !user_can_read_receipt($user, $row)) {
        error_response('Receipt not found.', 404);
    }

    json_response(['success' => true, 'receipt' => shape_receipt($row)]);
}

function handle_create_receipt(): void
{
    // Landlords may no longer issue Goodlucks-branded receipts: the money in a
    // rent payment goes to the landlord, not to Goodlucks.
    $user = require_auth(['admin']);

    // Issuing is disabled until the truthful transaction-record model ships
    // (Increment B). Reads and printing of existing records stay available.
    if (!RECEIPT_ISSUING_ENABLED) {
        error_response(
            'Receipt issuing is disabled while the payment-record model is corrected. '
            . 'Existing records can still be viewed.',
            503
        );
    }

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

    $tenantPhone = clean_string($input['tenantPhone'] ?? '', 40);

    // Only staff can reach this handler. The landlord link stays NULL until the
    // transaction-record model records the real recipient (Increment B); the
    // tenant is linked by phone so receipts stay scoped to the people concerned.
    $landlordUserId = null;
    $tenantUserId = null;
    $tenantMatch = find_user_by_phone($tenantPhone);
    if ($tenantMatch && ($tenantMatch['role'] ?? '') === 'tenant') {
        $tenantUserId = (string)$tenantMatch['id'];
    }

    $receipt = create_receipt([
        'property_title'   => clean_string($input['propertyTitle'], 200),
        'property_address' => clean_string($input['propertyAddress'], 255),
        'tenant_name'      => clean_string($input['tenantName'], 120),
        'tenant_phone'     => $tenantPhone,
        'landlord_name'    => clean_string($input['landlordName'], 120),
        'amount_ghs'       => $amount,
        'amount_in_words'  => $input['amountInWords'] ?? '',
        'payment_purpose'  => $input['paymentPurpose'] ?? 'Rent payment',
        'payment_method'   => $input['paymentMethod'] ?? 'Cash',
        'transaction_ref'  => $input['transactionRef'] ?? '',
        'payment_date'     => valid_date_iso($input['paymentDate'] ?? null) ?? gmdate('Y-m-d'),
        'issued_by'        => $input['issuedBy'] ?? (string)$user['name'],
        'landlord_user_id' => $landlordUserId,
        'tenant_user_id'   => $tenantUserId,
    ]);

    audit_log('receipt.issued', 'receipt', (string)($receipt['id'] ?? ''), [
        'receiptNo' => $receipt['receiptNo'] ?? '',
        'amountGhs' => $receipt['amountGhs'] ?? null,
        'issuedBy'  => $receipt['issuedBy'] ?? '',
    ]);

    json_response(['success' => true, 'receipt' => $receipt], 201);
}

// ===========================================================================
// Viewing-fee ledger (Increment B)
//
// Admin-only. The ledger separates:
//   * money an agent collected from a tenant   (NOT Goodlucks money),
//   * the share Goodlucks is owed              (explicitly agreed per fee),
//   * money Goodlucks actually received        (the only revenue figure),
//   * what is still outstanding.
// No percentage is applied anywhere: the 60/40 and 70/30 splits are provisional
// (config.php) and no approved policy row exists, so nothing is computed from
// them. See docs/INCREMENT_B_REPORT.md.
// ===========================================================================
function handle_list_viewing_fees(): void
{
    // Increment G: reading the money ledger is a financial capability, not part
    // of ordinary administration.
    require_finance_view();
    $records = list_viewing_fee_records(500);

    json_response([
        'success' => true,
        'records' => $records,
        // Totals cover every ledger row, not just the page above.
        'summary' => viewing_fee_summary(),
        'policy'  => fee_policy_status(),
    ]);
}

function handle_fee_policy(): void
{
    require_finance_view();
    json_response(['success' => true, 'policy' => fee_policy_status()]);
}

function handle_set_viewing_fee_share(array $params): void
{
    $user = require_auth(['admin']);
    $id = (string)($params[0] ?? '');
    if (!find_viewing_fee_record($id)) {
        error_response('Viewing fee record not found.', 404);
    }

    $input = request_json();
    $amount = valid_money($input['amountGhs'] ?? null, 0);
    if ($amount === null) {
        error_response('Enter the agreed Goodlucks share.', 422, [
            'amountGhs' => 'Enter a valid amount.',
        ]);
    }

    try {
        $row = set_viewing_fee_share($id, (float)$amount, (string)($input['note'] ?? ''), $user);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    audit_log('viewing_fee.share_agreed', 'viewing_fee', $id, [
        'goodlucksShareGhs' => (float)$amount,
        'policyApplied'     => false,
    ]);

    json_response(['success' => true, 'record' => shape_viewing_fee_record($row)]);
}

function handle_add_fee_remittance(array $params): void
{
    $user = require_auth(['admin']);
    $id = (string)($params[0] ?? '');
    if (!find_viewing_fee_record($id)) {
        error_response('Viewing fee record not found.', 404);
    }

    $input = request_json();
    $amount = valid_money($input['amountGhs'] ?? null, 0);
    if ($amount === null || (float)$amount <= 0) {
        error_response('Enter the amount Goodlucks actually received.', 422, [
            'amountGhs' => 'Enter a valid amount.',
        ]);
    }

    try {
        $result = add_fee_remittance($id, [
            'amount_ghs'  => (float)$amount,
            'method'      => (string)($input['method'] ?? 'unknown'),
            'reference'   => (string)($input['reference'] ?? ''),
            'received_at' => valid_date_iso($input['receivedAt'] ?? null) ?? gmdate('Y-m-d'),
            'recorded_by' => (string)$user['id'],
            'notes'       => (string)($input['notes'] ?? ''),
        ]);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    audit_log('viewing_fee.remittance_recorded', 'viewing_fee', $id, [
        'amountGhs'  => (float)$amount,
        'method'     => (string)($input['method'] ?? 'unknown'),
        'receivedBy' => 'goodlucks',
    ]);

    json_response([
        'success' => true,
        'remittanceId' => $result['id'],
        'record'  => shape_viewing_fee_record($result['record']),
    ], 201);
}

/**
 * Link a viewing-fee record to an agent account.
 *
 * The tier used by any policy comes from that account's Increment D records, so
 * a fee with no agent link cannot be priced by a tier policy — and a tier can
 * never arrive in the request body. Linking is staff data entry, audited, and
 * refused once the fee carries financial terms.
 */
function handle_link_viewing_fee_agent(array $params): void
{
    $user = require_fee_policy_staff();
    $id = (string)($params[0] ?? '');
    $record = find_viewing_fee_record($id);
    if (!$record) {
        error_response('Viewing fee record not found.', 404);
    }
    if (($record['share_basis'] ?? 'not_set') !== 'not_set' || $record['goodlucks_share_ghs'] !== null) {
        error_response('This fee already carries agreed terms; its agent link cannot be changed.', 409);
    }
    if (find_fee_snapshot_for_transaction('viewing_fee', $id) !== null) {
        error_response('This fee already has a policy snapshot and cannot be relinked.', 409);
    }

    $input = request_json();
    $agentUserId = clean_string($input['agentUserId'] ?? '', 64);

    if ($agentUserId === '') {
        db_exec(
            'UPDATE viewing_fee_records SET agent_user_id = NULL, updated_at = :updated WHERE id = :id',
            [':updated' => db_now(), ':id' => $id]
        );
        audit_log('viewing_fee.agent_unlinked', 'viewing_fee', $id, []);
        json_response(['success' => true, 'record' => shape_viewing_fee_record(find_viewing_fee_record($id) ?? [])]);
    }

    $agent = find_user_by_id($agentUserId);
    if (!$agent || (string)$agent['role'] !== 'agent') {
        error_response('Choose an agent account.', 422, ['agentUserId' => 'No agent account has that id.']);
    }

    db_exec(
        'UPDATE viewing_fee_records SET agent_user_id = :agent, updated_at = :updated WHERE id = :id',
        [':agent' => $agentUserId, ':updated' => db_now(), ':id' => $id]
    );

    $tier = agent_tier_state($agentUserId);
    audit_log('viewing_fee.agent_linked', 'viewing_fee', $id, [
        'agentUserId' => $agentUserId,
        'agentTier'   => $tier['tier'],
    ]);

    json_response([
        'success' => true,
        'record'  => shape_viewing_fee_record(find_viewing_fee_record($id) ?? []),
        'agentTier' => $tier,
    ]);
}

/**
 * Apply an approved, active fee policy to one viewing fee.
 *
 * The snapshot written here is the financial record of the transaction. Nothing
 * is marked as received: Goodlucks revenue still requires a remittance.
 */
function handle_apply_fee_policy(array $params): void
{
    $user = require_fee_policy_approver();
    enforce_rate_limit('fee-policy-apply', 120, 3600);

    $id = (string)($params[0] ?? '');
    if (!find_viewing_fee_record($id)) {
        error_response('Viewing fee record not found.', 404);
    }

    $input = request_json();
    $policyId = clean_string($input['policyId'] ?? '', 64);

    try {
        $result = apply_fee_policy_to_viewing_fee($id, $policyId === '' ? null : $policyId, $user);
    } catch (FeePolicyNotApplicableException $e) {
        // Explicit and auditable: no policy applies, so no share is invented.
        audit_log('viewing_fee.policy_not_applicable', 'viewing_fee', $id, [
            'reason' => $e->getMessage(),
        ]);
        error_response($e->getMessage(), 409);
    } catch (FeePolicyTierMismatchException $e) {
        error_response($e->getMessage(), 409);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    $snapshot = shape_fee_snapshot($result['snapshot']);

    audit_log('viewing_fee.policy_applied', 'viewing_fee', $id, [
        'policyId'   => $snapshot['policyId'],
        'policyName' => $snapshot['policyName'],
        'agentTier'  => $snapshot['agentTier'],
        'goodlucksEntitlementGhs' => $snapshot['goodlucksEntitlementGhs'],
        'agentEntitlementGhs'     => $snapshot['agentEntitlementGhs'],
        'receivedBy' => 'nobody', // an entitlement is not a receipt
    ]);

    json_response([
        'success'  => true,
        'record'   => shape_viewing_fee_record($result['record']),
        'snapshot' => $snapshot,
        'agentTier'=> $result['tier'],
    ]);
}

// ===========================================================================
// Fee policies & agent tiers (Increment E)
// ===========================================================================
function handle_list_fee_policies(): void
{
    $staff = require_fee_policy_staff();
    $filters = [
        'status'    => query_param('status'),
        'category'  => query_param('category'),
        'agentTier' => query_param('agentTier'),
    ];

    $overview = fee_policy_overview();
    $overview['policies'] = list_fee_policies(array_filter($filters));

    json_response($overview + [
        'success'      => true,
        'capabilities' => finance_capabilities($staff),
    ]);
}

function handle_create_fee_policy(): void
{
    $user = require_fee_policy_manager();
    enforce_rate_limit('fee-policy-write', 60, 3600);
    $input = request_json();

    try {
        $policy = create_fee_policy($input, $user);
    } catch (FeePolicyValidationException $e) {
        error_response($e->getMessage(), 422, $e->fields);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    audit_log('fee_policy.created', 'fee_policy', (string)$policy['id'], [
        'name'       => (string)$policy['name'],
        'category'   => (string)$policy['category'],
        'agentTier'  => (string)$policy['tier'],
        'status'     => 'draft',
        'approved'   => false,
        'appliedToTransactions' => false,
    ]);

    json_response(['success' => true, 'policy' => shape_fee_policy($policy)], 201);
}

function handle_get_fee_policy(array $params): void
{
    require_fee_policy_staff();
    $policy = find_fee_policy((string)($params[0] ?? ''));
    if (!$policy) {
        error_response('Fee policy not found.', 404);
    }

    json_response([
        'success' => true,
        'policy'  => shape_fee_policy($policy),
        'history' => list_fee_policy_events((string)$policy['id']),
    ]);
}

function handle_update_fee_policy(array $params): void
{
    $user = require_fee_policy_manager();
    $id = (string)($params[0] ?? '');
    if (!find_fee_policy($id)) {
        error_response('Fee policy not found.', 404);
    }

    try {
        $policy = update_fee_policy($id, request_json(), $user);
    } catch (FeePolicyValidationException $e) {
        error_response($e->getMessage(), 422, $e->fields);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    audit_log('fee_policy.updated', 'fee_policy', $id, ['status' => 'draft']);

    json_response(['success' => true, 'policy' => shape_fee_policy($policy)]);
}

function handle_submit_fee_policy(array $params): void
{
    $user = require_fee_policy_manager();
    $id = (string)($params[0] ?? '');
    if (!find_fee_policy($id)) {
        error_response('Fee policy not found.', 404);
    }

    try {
        $policy = submit_fee_policy($id, $user, (string)(request_json()['note'] ?? ''));
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    audit_log('fee_policy.submitted', 'fee_policy', $id, ['status' => 'pending_approval']);

    json_response(['success' => true, 'policy' => shape_fee_policy($policy)]);
}

function handle_approve_fee_policy(array $params): void
{
    $user = require_fee_policy_approver();
    $id = (string)($params[0] ?? '');
    if (!find_fee_policy($id)) {
        error_response('Fee policy not found.', 404);
    }

    try {
        $policy = approve_fee_policy($id, $user, trim((string)(request_json()['note'] ?? '')));
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    audit_log('fee_policy.approved', 'fee_policy', $id, [
        'approvedBy' => (string)$user['id'],
        'activated'  => false,
        'note'       => 'Approval recorded. The policy is not applicable until it is activated.',
    ]);

    json_response(['success' => true, 'policy' => shape_fee_policy($policy)]);
}

function handle_reject_fee_policy(array $params): void
{
    $user = require_fee_policy_approver();
    $id = (string)($params[0] ?? '');
    if (!find_fee_policy($id)) {
        error_response('Fee policy not found.', 404);
    }

    $input = request_json();
    try {
        $policy = reject_fee_policy($id, $user, (string)($input['reason'] ?? $input['note'] ?? ''));
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    audit_log('fee_policy.rejected', 'fee_policy', $id, ['status' => 'rejected']);

    json_response(['success' => true, 'policy' => shape_fee_policy($policy)]);
}

function handle_activate_fee_policy(array $params): void
{
    $user = require_fee_policy_approver();
    $id = (string)($params[0] ?? '');
    if (!find_fee_policy($id)) {
        error_response('Fee policy not found.', 404);
    }

    $input = request_json();
    try {
        $policy = activate_fee_policy($id, $user, (string)($input['note'] ?? ''));
    } catch (FeePolicyConflictException $e) {
        error_response($e->getMessage(), 409, ['conflictPolicyId' => $e->conflictPolicyId]);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    audit_log('fee_policy.activated', 'fee_policy', $id, [
        'effectiveFrom' => (string)$policy['effective_from'],
        'agentTier'     => (string)$policy['tier'],
        'category'      => (string)$policy['category'],
    ]);

    json_response(['success' => true, 'policy' => shape_fee_policy($policy)]);
}

function handle_deactivate_fee_policy(array $params): void
{
    $user = require_fee_policy_approver();
    $id = (string)($params[0] ?? '');
    if (!find_fee_policy($id)) {
        error_response('Fee policy not found.', 404);
    }

    $input = request_json();
    try {
        $policy = deactivate_fee_policy($id, $user, (string)($input['reason'] ?? $input['note'] ?? ''));
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    audit_log('fee_policy.deactivated', 'fee_policy', $id, [
        'status' => 'deactivated',
        'note'   => 'Existing transaction snapshots are unchanged.',
    ]);

    json_response(['success' => true, 'policy' => shape_fee_policy($policy)]);
}

/** Eligibility for one agent. Read-only: there is no endpoint that sets a tier. */
function handle_admin_agent_tier(array $params): void
{
    require_fee_policy_staff();
    $user = find_user_by_id((string)($params[0] ?? ''));
    if (!$user || (string)$user['role'] !== 'agent') {
        error_response('Agent not found.', 404);
    }

    json_response([
        'success' => true,
        'agent'   => [
            'userId' => (string)$user['id'],
            'name'   => (string)$user['name'],
            'email'  => (string)$user['email'],
        ],
        'tier' => agent_tier_state((string)$user['id']),
    ]);
}

function handle_set_viewing_fee_state(array $params): void
{
    $user = require_auth(['admin']);
    $id = (string)($params[0] ?? '');
    if (!find_viewing_fee_record($id)) {
        error_response('Viewing fee record not found.', 404);
    }

    $input = request_json();
    $state = (string)($input['state'] ?? '');

    try {
        $row = set_viewing_fee_state($id, $state, (string)($input['note'] ?? ''), $user);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    audit_log('viewing_fee.state_changed', 'viewing_fee', $id, ['state' => $state]);

    json_response(['success' => true, 'record' => shape_viewing_fee_record($row)]);
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
 * Read the audit trail (admin only).
 *
 * Filters: entityType, entityId, action, actorId, limit (1-500).
 */
function handle_list_audit_logs(): void
{
    require_admin();

    $limit = (int)query_param('limit', 200);
    $limit = max(1, min(500, $limit));

    $filters = [];
    foreach (['entityType', 'entityId', 'action', 'actorId'] as $key) {
        $value = query_param($key);
        if ($value !== null && $value !== '') {
            $filters[$key] = clean_string((string)$value, 64);
        }
    }

    json_response([
        'success' => true,
        'logs'    => list_audit_logs($filters, $limit),
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

    audit_log('email_outbox.run', 'email_outbox', '', [
        'sent'    => $result['sent'],
        'retried' => $result['retried'],
        'failed'  => $result['failed'],
    ]);

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
        // These must be the app's real routes (src/routing/routes.ts): the
        // sitemap previously advertised /browse and /find-home, which the site
        // never served.
        ['loc' => SITE_URL . '/properties', 'priority' => '0.9', 'changefreq' => 'daily'],
        ['loc' => SITE_URL . '/find-a-home', 'priority' => '0.8', 'changefreq' => 'weekly'],
        ['loc' => SITE_URL . '/list-property', 'priority' => '0.6', 'changefreq' => 'monthly'],
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
