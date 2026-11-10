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
        // Upgrade 2 correction: the one-time professional classification of an
        // Agent/Landlord account (Agent or Landlord), chosen during verification.
        ['POST', '#^/account/classification$#', 'handle_choose_provider_category'],
        ['POST', '#^/account/avatar$#', 'handle_upload_avatar'],
        ['DELETE', '#^/account/avatar$#', 'handle_delete_avatar'],
        // The signed-in account records a fresh, explicit acceptance of the
        // legal documents. Nothing is recorded without the flags in the body.
        ['POST', '#^/account/legal-acceptance$#', 'handle_account_legal_acceptance'],

        // --- Legal documents (public) ------------------------------------
        // Only the current PUBLISHED version is ever served here. A saved draft
        // is not reachable from any public URL.
        ['GET',  '#^/legal$#', 'handle_legal_index'],
        ['GET',  '#^/legal/([A-Za-z0-9\-_]+)$#', 'handle_legal_document'],

        // --- Legal documents (administrator console) ---------------------
        // Editing needs can_manage_legal; publishing needs can_publish_legal.
        // Both default to deny and are granted only from the server console.
        ['GET',    '#^/admin/legal$#', 'handle_admin_legal_index'],
        ['PUT',    '#^/admin/legal/reacceptance$#', 'handle_admin_legal_reacceptance'],
        ['GET',    '#^/admin/legal/([a-z]+)$#', 'handle_admin_legal_document'],
        ['GET',    '#^/admin/legal/([a-z]+)/versions/([0-9]+)$#', 'handle_admin_legal_version'],
        ['PUT',    '#^/admin/legal/([a-z]+)/draft$#', 'handle_admin_legal_save_draft'],
        ['DELETE', '#^/admin/legal/([a-z]+)/draft$#', 'handle_admin_legal_discard_draft'],
        ['POST',   '#^/admin/legal/([a-z]+)/preview$#', 'handle_admin_legal_preview'],
        ['POST',   '#^/admin/legal/([a-z]+)/publish$#', 'handle_admin_legal_publish'],
        ['POST',   '#^/admin/legal/([a-z]+)/restore$#', 'handle_admin_legal_restore'],

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
        // Task 03: a property's own viewing fee + viewing terms. Approving a
        // change is a staff decision; proposing one is the owner's/agent's.
        // Seven-day availability renewal. The provider answers "still available"
        // or "no longer available"; the deadline itself is enforced by the
        // backend, never by the browser.
        ['POST', '#^/properties/([A-Za-z0-9\-_]+)/availability/confirm$#', 'handle_property_availability_confirm'],
        ['POST', '#^/properties/([A-Za-z0-9\-_]+)/availability/decline$#', 'handle_property_availability_decline'],
        ['GET',  '#^/properties/([A-Za-z0-9\-_]+)/availability/history$#', 'handle_property_availability_history'],
        ['POST', '#^/properties/([A-Za-z0-9\-_]+)/viewing-terms$#', 'handle_request_viewing_terms'],
        ['GET',  '#^/properties/([A-Za-z0-9\-_]+)/viewing-terms/history$#', 'handle_viewing_terms_history'],
        // Task 03 update: the ONE general landlord viewing fee, controlled by an
        // administrator. Landlords never set or change it.
        ['GET',  '#^/admin/landlord-policy$#', 'handle_admin_landlord_policy'],
        ['PUT',  '#^/admin/landlord-policy/viewing-fee$#', 'handle_admin_set_landlord_viewing_fee'],
        ['GET',  '#^/admin/viewing-terms/changes$#', 'handle_admin_viewing_term_changes'],
        ['POST', '#^/admin/viewing-terms/changes/([A-Za-z0-9\-_]+)/decision$#', 'handle_admin_decide_viewing_term_change'],
        ['GET',  '#^/admin/properties$#', 'handle_admin_properties'],
        // The availability console: awaiting confirmation, due soon, expired,
        // draft, unavailable and reactivated listings, with counts.
        ['GET',  '#^/admin/property-availability$#', 'handle_admin_property_availability'],
        ['GET',  '#^/admin/property-availability/activity$#', 'handle_admin_property_availability_activity'],
        ['POST', '#^/admin/properties/([A-Za-z0-9\-_]+)/availability/reactivate$#', 'handle_admin_property_availability_reactivate'],

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
        // Task 03: per-document outcomes (accept / reject one certificate).
        ['POST',  '#^/admin/verifications/documents/([A-Za-z0-9\-_]+)/review$#', 'handle_admin_review_verification_document'],
        ['POST',  '#^/admin/verifications/([A-Za-z0-9\-_]+)/professional/decision$#', 'handle_admin_decide_professional'],

        // --- Uploads ----------------------------------------------------
        ['POST', '#^/uploads$#', 'handle_upload'],
        ['GET',  '#^/uploads/([A-Za-z0-9\-_.]+)$#', 'handle_serve_upload'],

        // --- Enquiries --------------------------------------------------
        ['POST', '#^/enquiries$#', 'handle_create_enquiry'],
        ['GET',  '#^/admin/enquiries$#', 'handle_admin_enquiries'],
        ['PATCH', '#^/admin/enquiries/([A-Za-z0-9\-_]+)$#', 'handle_update_enquiry'],

        // --- User directory, profiles and activity (Upgrade 2, A11/A13/A14) ---
        ['GET',  '#^/admin/users$#', 'handle_admin_users'],
        ['GET',  '#^/admin/users/([A-Za-z0-9\-_]+)$#', 'handle_admin_user_profile'],
        ['GET',  '#^/admin/users/([A-Za-z0-9\-_]+)/activity$#', 'handle_admin_user_activity'],
        // This upgrade: formal suspension and reinstatement of an Agent or
        // Landlord account. One pair of endpoints for both classifications.
        ['POST', '#^/admin/users/([A-Za-z0-9\-_]+)/suspension$#', 'handle_admin_suspend_provider'],
        ['POST', '#^/admin/users/([A-Za-z0-9\-_]+)/reinstatement$#', 'handle_admin_reinstate_provider'],
        // Upgrade 2 (E2): the only way a provider classification changes.
        ['POST', '#^/admin/users/([A-Za-z0-9\-_]+)/role$#', 'handle_admin_correct_user_role'],
        ['GET',  '#^/admin/activity$#', 'handle_admin_activity'],

        // --- Bulk email campaigns (Upgrade 2, A12) -----------------------
        ['GET',  '#^/admin/campaigns$#', 'handle_list_campaigns'],
        ['GET',  '#^/admin/campaigns/preview$#', 'handle_campaign_preview'],
        ['POST', '#^/admin/campaigns$#', 'handle_create_campaign'],
        ['GET',  '#^/admin/campaigns/([A-Za-z0-9\-_]+)$#', 'handle_campaign_show'],
        ['POST', '#^/admin/campaigns/([A-Za-z0-9\-_]+)/queue$#', 'handle_queue_campaign'],
        ['POST', '#^/admin/campaigns/([A-Za-z0-9\-_]+)/retry$#', 'handle_retry_campaign'],

        // --- Email preferences (public link from every campaign email) ----
        ['GET',  '#^/email/preferences$#', 'handle_email_preferences_show'],
        ['POST', '#^/email/preferences$#', 'handle_email_preferences_update'],

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
        ['POST', '#^/viewings/([A-Za-z0-9\-_]+)/(propose|confirm|reschedule|request-reschedule|accept-reschedule|decline-reschedule|cancel|complete|no-show|could-not-proceed)$#', 'handle_viewing_action'],
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
        // Deleting is allowed only for a policy that never priced anything and
        // never went through approval; everything else is history.
        ['DELETE', '#^/admin/fee-policies/([A-Za-z0-9\-_]+)$#', 'handle_delete_fee_policy'],
        // Every agent's derived tier, read-only: a tier decides how a real
        // commission is split, so it follows verification, never a dropdown.
        ['GET',  '#^/admin/agent-tiers$#', 'handle_admin_agent_tier_overview'],

        // --- Tenant contact disclosure (Upgrade 2, B6) -------------------
        // A provider asks; staff decide; the tenant is told what was shared.
        ['POST', '#^/viewings/([A-Za-z0-9\-_]+)/request-contact$#', 'handle_request_contact_disclosure'],
        ['GET',  '#^/contact-disclosures$#', 'handle_my_contact_disclosures'],
        ['GET',  '#^/admin/contact-disclosures$#', 'handle_list_contact_disclosures'],
        // Area proximity: the administrator's judgement, used by the scorer.
        ['GET',    '#^/admin/area-adjacency$#', 'handle_list_area_adjacency'],
        ['POST',   '#^/admin/area-adjacency$#', 'handle_save_area_adjacency'],
        ['DELETE', '#^/admin/area-adjacency/([A-Za-z0-9\-_]+)$#', 'handle_delete_area_adjacency'],
        ['POST', '#^/admin/contact-disclosures/([A-Za-z0-9\-_]+)/decision$#', 'handle_decide_contact_disclosure'],
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
        // Task 03 update: landlord money is recorded and read separately from
        // agent money, and never mixed into the same transaction.
        ['GET',  '#^/admin/finance/landlord-platform-fees$#', 'handle_admin_landlord_platform_fees'],
        ['POST', '#^/admin/finance/landlord-platform-fees$#', 'handle_admin_create_landlord_platform_fee'],
        ['GET',  '#^/admin/finance/landlord-viewing-fees$#', 'handle_admin_landlord_viewing_fees'],
        ['POST', '#^/admin/finance/landlord-viewing-fees$#', 'handle_admin_record_landlord_viewing_fee'],
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

        // --- Blog Management (Task 07) ----------------------------------
        // Every handler re-checks the admin role; a draft is only ever read
        // through these endpoints.
        ['GET',   '#^/admin/blog/posts$#', 'handle_admin_blog_posts'],
        ['POST',  '#^/admin/blog/posts$#', 'handle_admin_blog_create_post'],
        ['GET',   '#^/admin/blog/posts/([A-Za-z0-9\-_]+)$#', 'handle_admin_blog_post_show'],
        ['PATCH', '#^/admin/blog/posts/([A-Za-z0-9\-_]+)$#', 'handle_admin_blog_update_post'],
        ['DELETE','#^/admin/blog/posts/([A-Za-z0-9\-_]+)$#', 'handle_admin_blog_delete_post'],
        ['POST',  '#^/admin/blog/posts/([A-Za-z0-9\-_]+)/status$#', 'handle_admin_blog_post_status'],
        ['POST',  '#^/admin/blog/posts/([A-Za-z0-9\-_]+)/properties$#', 'handle_admin_blog_post_properties'],
        ['GET',   '#^/admin/blog/properties$#', 'handle_admin_blog_property_search'],
        // The "Insert Blog Post" picker: published articles only.
        ['GET',   '#^/admin/blog/published-for-links$#', 'handle_admin_blog_published_for_links'],
        ['GET',   '#^/admin/blog/categories$#', 'handle_admin_blog_categories'],
        ['POST',  '#^/admin/blog/categories$#', 'handle_admin_blog_create_category'],
        ['PATCH', '#^/admin/blog/categories/([A-Za-z0-9\-_]+)$#', 'handle_admin_blog_update_category'],
        ['DELETE','#^/admin/blog/categories/([A-Za-z0-9\-_]+)$#', 'handle_admin_blog_delete_category'],

        // --- Email templates (Task 07) ----------------------------------
        // The one editable layer over the existing transactional emails.
        ['GET',   '#^/admin/email-templates$#', 'handle_admin_email_templates'],
        ['POST',  '#^/admin/email-templates$#', 'handle_admin_email_template_create'],
        ['PATCH', '#^/admin/email-templates/([A-Za-z0-9\-_]+)$#', 'handle_admin_email_template_update'],
        ['DELETE','#^/admin/email-templates/([A-Za-z0-9\-_]+)$#', 'handle_admin_email_template_delete'],
        ['POST',  '#^/admin/email-templates/check-links$#', 'handle_admin_email_template_check_links'],

        ['GET',  '#^/sitemap\.xml$#', 'handle_sitemap'],

        // --- Blog & Learning Centre (Task 07) ---------------------------
        // Public reads return published articles only; the queries themselves
        // filter on status, so no parameter can widen them.
        ['GET',  '#^/blog$#', 'handle_blog_index'],
        ['GET',  '#^/blog/categories$#', 'handle_blog_categories'],
        ['GET',  '#^/blog/([a-z0-9]+(?:-[a-z0-9]+)*)$#', 'handle_blog_post'],

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
    // Upgrade 2 correction: the website offers exactly TWO account groups —
    //   * Tenant
    //   * Agent/Landlord  (ONE shared account type)
    //
    // An Agent and a Landlord are not separate account types and cannot register
    // twice. A provider chooses its professional classification (Agent or
    // Landlord) later, during verification; that choice is stored in
    // `users.provider_category` and decides how the account is verified.
    //
    // A provider account starts on the 'agent' role because every provider
    // capability is already closed for an agent with no approved profile — so a
    // freshly registered Agent/Landlord account can do nothing until it is
    // classified and verified. `provider_category = 'pending'` is what marks it.
    //
    // Older API clients that still send role 'agent' or 'landlord' are read as
    // having made the choice at registration, exactly as before; nothing about
    // their accounts changes.
    $requestedRole = is_string($input['role'] ?? null)
        ? strtolower(trim((string)$input['role']))
        : 'tenant';
    if ($requestedRole === '') {
        $requestedRole = 'tenant';
    }
    $requestedCategory = is_string($input['providerCategory'] ?? $input['category'] ?? null)
        ? strtolower(trim((string)($input['providerCategory'] ?? $input['category'])))
        : '';

    $group = 'tenant';          // 'tenant' | 'provider'
    $role = 'tenant';           // the role stored on the account
    $classification = null;     // null | 'pending' | 'agent' | 'landlord'

    if ($requestedRole === 'tenant') {
        $group = 'tenant';
    } elseif ($requestedRole === 'agent' || $requestedRole === 'landlord') {
        // Legacy self-classification: the caller says what it is, so the account
        // is stored already classified.
        $group = 'provider';
        $role = $requestedRole;
        $classification = $requestedRole;
    } elseif ($requestedRole === 'provider' || $requestedRole === 'agent_landlord') {
        $group = 'provider';
        if (in_array($requestedCategory, ['agent', 'landlord'], true)) {
            $role = $requestedCategory;
            $classification = $requestedCategory;
        } else {
            $role = 'agent';
            $classification = 'pending';
        }
    } else {
        $validator->add(
            'role',
            'That account type is not available for self-registration. Choose Tenant or Agent/Landlord.'
        );
    }

    if ($requestedCategory !== '' && !in_array($requestedCategory, ['tenant', 'provider', 'agent', 'landlord'], true)) {
        $validator->add('providerCategory', 'Choose Tenant or Agent/Landlord.');
    } elseif ($group === 'tenant' && ($requestedCategory === 'provider' || $requestedCategory === 'agent' || $requestedCategory === 'landlord')) {
        $validator->add('providerCategory', 'Choose the Agent/Landlord account group to provide properties.');
    } elseif (
        in_array($requestedRole, ['agent', 'landlord'], true) &&
        in_array($requestedCategory, ['agent', 'landlord'], true) &&
        $requestedCategory !== $requestedRole
    ) {
        // A caller that names both must be consistent. The website no longer
        // names either at registration — the account chooses at verification —
        // so this only guards older clients, which are refused rather than
        // silently given an account that disagrees with what they asked for.
        $validator->add(
            'providerCategory',
            'The account category you chose does not match the account type. Pick Agent or Landlord once.'
        );
    }

    // The official Ghana Card name is recorded when it is supplied. It is a
    // CLAIM, never a verification: only an approved identity check makes an
    // account identity-verified. Pre-task accounts (and API clients that do not
    // send it) are not rejected, so nobody is locked out.
    $officialName = clean_string($input['officialName'] ?? $input['ghanaCardName'] ?? '', 200);
    if ($officialName !== '' && mb_strlen($officialName) < 3) {
        $validator->add('officialName', 'Enter the full name exactly as it appears on the Ghana Card.');
    }

    // An agent's operating base is part of the account, not an optional extra:
    // it is where they work, and it is distinct from any home address.
    $agencyName = clean_string($input['agencyName'] ?? $input['company'] ?? '', 200);
    $operatingCity = clean_string($input['operatingCity'] ?? $input['city'] ?? $input['address'] ?? '', 120);
    // The city is required only when the account is an agent from the start and
    // its profile is created here. A pending Agent/Landlord account may give it
    // when it chooses Agent or Landlord — nothing is guessed on its behalf.
    if ($role === 'agent' && $operatingCity === '') {
        $validator->add('operatingCity', 'Tell us the city you work from.');
    }
    $contactCity = clean_string($input['city'] ?? $input['address'] ?? '', 255);
    if ($contactCity === '' && $group === 'provider') {
        $contactCity = $operatingCity;
    }

    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }

    // -----------------------------------------------------------------------
    // Legal consent (Terms and Conditions + Privacy Policy).
    //
    // Enforced HERE, not only in the browser: an account cannot be created by a
    // caller that skips the checkbox, and the acceptance is written against the
    // version that is published at the moment of registration. The Terms
    // acceptance and the Privacy acknowledgement are two separate records.
    //
    // The browser is not trusted to say which version it accepted, but if it
    // does and the document has moved on in the meantime, the registration is
    // refused rather than recorded against the wrong text.
    // -----------------------------------------------------------------------
    $legal = legal_registration_acceptance($input);
    if (!($legal['ok'] ?? false)) {
        error_response(
            (string)($legal['message'] ?? 'Please accept the Terms and Conditions to create an account.'),
            (int)($legal['status'] ?? 422),
            $legal['fields'] ?? null
        );
    }

    $email = valid_email($input['email']);
    if (find_user_by_email((string)$email)) {
        // One account per person: a second registration never creates a second
        // role, and it never silently upgrades or converts the existing one.
        error_response('An account with this email already exists. Please sign in instead.', 409, [
            'email' => 'This email is already registered. Use the account you already have — an account cannot be re-registered as another type.',
        ]);
    }

    try {
        $user = create_user([
            'email'         => $email,
            'name'          => clean_string($input['name'], 120),
            'official_name' => $officialName !== '' ? $officialName : null,
            // An Agent/Landlord account keeps the business name it gave, so the
            // agent profile created at the classification step uses it instead of
            // asking for it twice.
            'company'       => $group === 'provider' ? $agencyName : '',
            'role'          => $role,
            'phone'         => (string)valid_phone($input['phone']),
            // City/town or general location. Ordinary contact information, not
            // identity verification; optional and stored on the existing
            // users.address column so no schema change is needed. An
            // Agent/Landlord account's base is kept here too, so the agent
            // profile created at classification has it.
            'address'       => $contactCity,
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

    // The acceptance is recorded only once the account exists, so it always names
    // a real account, the real published version and the real time. If it cannot
    // be recorded, the account is removed again: an account without its consent
    // record must not exist.
    try {
        legal_record_acceptance((string)$user['id'], 'terms', $legal['terms'], 'registration');
        legal_record_acceptance((string)$user['id'], 'privacy', $legal['privacy'], 'registration');
        audit_log('legal.accepted', 'user', (string)$user['id'], [
            'source'          => 'registration',
            'terms_version'   => (int)$legal['terms']['version_number'],
            'privacy_version' => (int)$legal['privacy']['version_number'],
        ]);
    } catch (Throwable $e) {
        try {
            db_exec('DELETE FROM users WHERE id = :id', [':id' => $user['id']]);
            db_exec('DELETE FROM legal_acceptances WHERE user_id = :id', [':id' => $user['id']]);
        } catch (Throwable $ignored) {
            // fall through to the error response
        }
        gl_log('error', 'Could not record legal acceptance at registration', ['error' => $e->getMessage()]);
        error_response('We could not record your acceptance of the Terms and Conditions. Please try again.', 500);
    }

    // An Agent/Landlord account that has not chosen yet is marked 'pending'. The
    // choice is made once, during verification; it is not a second sign-up.
    if ($group === 'provider') {
        db_exec('UPDATE users SET provider_category = :category WHERE id = :id', [
            ':category' => $classification,
            ':id'       => (string)$user['id'],
        ]);
        $user['provider_category'] = $classification;
        audit_log('provider.registered', 'user', (string)$user['id'], [
            'classification' => $classification,
            'account_group'  => 'agent_landlord',
        ]);
    }

    // The agent profile is created with the account, in a deny-by-default state:
    // account_status 'pending_review' and can_submit_listings 0. Registration
    // never grants verification, authorisation or any operational permission.
    // A pending Agent/Landlord account has no profile yet: the profile belongs to
    // an account that has actually chosen to be an agent, so it is created by
    // handle_choose_provider_category() at that moment.
    $agentProfile = null;
    if ($role === 'agent' && $classification === 'agent') {
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
            '<h3 style="color:#FFFFFF;margin:0 0 12px 0;">Your ' . e($group === 'provider' ? 'Agent/Landlord' : 'Tenant') . ' account is ready</h3>'
            . '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e($user['name']) . ',</p>'
            . '<p style="color:#CBD5E1;font-size:14px;">Your Goodlucks Homes account has been created successfully. '
            . ($group === 'provider'
                ? 'Next, tell us whether you are an Agent or a Landlord: sign in and open Verification on your dashboard. '
                    . 'Listing submissions open once your account is reviewed and approved.'
                : 'You can now save properties, request viewings and submit property-matching requests.')
            . '</p>'
            . '<p style="color:#94A3B8;font-size:12px;">If you did not create this account, please contact ' . e(OFFICIAL_EMAIL) . ' immediately.</p>'
        ),
        'registration',
        'Welcome to Goodlucks Homes - ' . ($group === 'provider' ? 'Agent/Landlord' : 'Tenant') . ' account created'
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

    // The account group a client picked must match the account, so nobody is
    // nudged into the wrong session by the sign-in form.
    //
    // Upgrade 2 correction: the website offers two groups — Tenant, and ONE
    // Agent/Landlord account. 'provider' is that group: it matches an agent and a
    // landlord alike, and it is never stored on an account. 'agent' and
    // 'landlord' are still accepted so older clients keep working.
    $requestedRole = one_of($input['role'] ?? null, ['tenant', 'landlord', 'agent', 'provider', 'agent_landlord'], null);
    if ($requestedRole === 'agent_landlord') {
        $requestedRole = 'provider';
    }
    if ($requestedRole === 'provider') {
        if (!in_array((string)$user['role'], ['agent', 'landlord'], true)) {
            error_response(
                'This email is registered as a Tenant account. Please sign in using the Tenant tab.',
                403
            );
        }
    } elseif ($requestedRole !== null && $requestedRole !== $user['role']) {
        $groupLabel = $user['role'] === 'agent' || $user['role'] === 'landlord' ? 'Agent/Landlord' : ucfirst((string)$user['role']);
        // "an Agent/Landlord account", "a Tenant account".
        $article = in_array(strtolower($groupLabel[0]), ['a', 'e', 'i', 'o', 'u'], true) ? 'an' : 'a';
        error_response(
            'This email is registered as ' . $article . ' ' . $groupLabel . ' account. Please sign in using the '
            . $groupLabel . ' tab.',
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
    // Where the signed-in account stands on the legal documents. Informational:
    // the prompt it drives (`reacceptanceRequired`) is switched on deliberately by
    // an administrator, because publishing a new version must not silently change
    // what an existing account is allowed to do.
    $legal = null;
    if ($user !== null) {
        try {
            $legal = legal_acceptance_state($user);
        } catch (Throwable $e) {
            gl_log('warning', 'Could not read the legal acceptance state', ['error' => $e->getMessage()]);
        }
    }

    json_response([
        'success'        => true,
        'user'           => $user ? public_user($user) : null,
        'role'           => $user['role'] ?? 'guest',
        'savedPropertyIds' => $user ? list_saved_property_ids((string)$user['id']) : [],
        'legal'          => $legal,
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
/**
 * POST /account/classification
 *
 * The single professional classification of an Agent/Landlord account: an Agent
 * or a Landlord. The website collects one account group at registration and asks
 * this question once, during verification.
 *
 * What it changes
 * ---------------
 *  * 'agent'   → the account's role becomes 'agent' and its agent profile is
 *                created in the normal deny-by-default state (pending review,
 *                listings closed until staff approve it).
 *  * 'landlord'→ the account's role becomes 'landlord'. No agent profile exists
 *                or is created.
 *
 * It is available exactly once. A genuine mistake after that is corrected by
 * staff through POST /admin/users/<id>/role, which is audited — the account
 * holder cannot reclassify themselves, and cannot gain a second account by
 * registering again.
 *
 * It grants nothing else: identity verification, listing approval and every
 * other permission stay exactly as they were.
 */
function handle_choose_provider_category(): void
{
    $user = require_auth(['agent', 'landlord']);
    enforce_rate_limit('provider-classification', 10, 3600, (string)$user['id']);

    $input = request_json();
    $category = is_string($input['category'] ?? $input['providerCategory'] ?? null)
        ? strtolower(trim((string)($input['category'] ?? $input['providerCategory'])))
        : '';

    if (!in_array($category, ['agent', 'landlord'], true)) {
        error_response('Choose whether you are an Agent or a Landlord.', 422, [
            'category' => 'Choose Agent or Landlord.',
        ]);
    }

    if (provider_category_state($user) !== 'pending') {
        error_response(
            'This account already has a classification. If it is wrong, ask Goodlucks staff to correct it — an account cannot be reclassified by signing up again.',
            409,
            ['category' => 'Already classified.']
        );
    }

    $agencyName = (string)($user['company'] ?? '');
    $operatingCity = (string)($user['address'] ?? '');

    db_exec('UPDATE users SET role = :role, provider_category = :category WHERE id = :id', [
        ':role'     => $category,
        ':category' => $category,
        ':id'       => (string)$user['id'],
    ]);

    if ($category === 'agent' && find_agent_profile_by_user((string)$user['id']) === null) {
        $profile = create_agent_profile((string)$user['id'], [
            'agency_name'    => $agencyName,
            'operating_city' => $operatingCity,
        ]);
        audit_log('agent.registered', 'agent_profile', (string)$profile['id'], [
            'operating_city'  => $operatingCity,
            'has_agency_name' => $agencyName !== '',
            'via'             => 'classification',
        ]);
    }

    audit_log('provider.classified', 'user', (string)$user['id'], [
        'category' => $category,
        'from'     => 'pending',
    ], $user);

    create_notification(
        (string)$user['id'],
        'Classification saved',
        $category === 'agent'
            ? 'Your account is an Agent account. Verification is the next step.'
            : 'Your account is a Landlord account. Verification is the next step.',
        'success'
    );

    $fresh = find_user_by_id((string)$user['id']);
    json_response([
        'success' => true,
        'message' => 'Saved. You can now complete verification as '
            . ($category === 'agent' ? 'an Agent' : 'a Landlord') . '.',
        'user'    => public_user($fresh ?? $user),
    ]);
}

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

/**
 * Agent accounts, with the console's search and filters (Upgrade 2, A8).
 *
 * Identity verification and listing authorisation are separate filters on
 * purpose: `verification=verified` says nothing about `listing=allowed`, and the
 * three status chips (pending / approved for listing / suspended) are derived
 * from the account's own decision fields, never guessed.
 */
function handle_list_agents(): void
{
    require_auth(['admin']);

    $filters = [
        'q'             => trim((string)query_param('q', '')),
        'stage'         => strtolower(trim((string)query_param('stage', ''))),
        'verification'  => strtolower(trim((string)query_param('verification', ''))),
        'listing'       => strtolower(trim((string)query_param('listing', ''))),
        'accountStatus' => strtolower(trim((string)query_param('accountStatus', ''))),
    ];

    if ($filters['stage'] !== '' && !in_array($filters['stage'], ['pending', 'approved_for_listing', 'suspended'], true)) {
        error_response('Unknown agent filter.', 422, [
            'stage' => 'Choose one of: pending, approved_for_listing, suspended.',
        ]);
    }
    if ($filters['verification'] !== '' && !in_array($filters['verification'], ['verified', 'unverified'], true)) {
        error_response('Unknown verification filter.', 422, [
            'verification' => 'Choose one of: verified, unverified.',
        ]);
    }
    if ($filters['listing'] !== '' && !in_array($filters['listing'], ['allowed', 'blocked'], true)) {
        error_response('Unknown listing filter.', 422, [
            'listing' => 'Choose one of: allowed, blocked.',
        ]);
    }
    if ($filters['accountStatus'] !== '' && !in_array($filters['accountStatus'], AGENT_ACCOUNT_STATUSES, true)) {
        error_response('Unknown account status.', 422, [
            'accountStatus' => 'Allowed values: ' . implode(', ', AGENT_ACCOUNT_STATUSES) . '.',
        ]);
    }
    $filters = array_filter($filters, static fn($value): bool => $value !== '');

    $agents = list_agent_profiles(500, $filters);

    json_response([
        'success'    => true,
        'count'      => count($agents),
        'agents'     => $agents,
        'stageCounts' => count_agents_by_stage(),
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
/**
 * The listing gate (Upgrade 2 correction).
 *
 * Verification is mandatory before property listing. A provider account that has
 * not chosen Agent or Landlord, whose identity is not approved, or that has been
 * suspended cannot submit a property — whatever the client shows or hides. The
 * check is here so every submission route goes through it, and an administrator
 * keeps working from the console.
 */
function require_provider_listing_access(array $user): void
{
    if ((string)($user['role'] ?? '') === 'admin') {
        return;
    }
    $state = provider_listing_state($user);
    if ($state['canList']) {
        return;
    }
    $fields = [
        'verificationRequired' => $state['message'],
        'verificationStatus'   => $state['identityStatus'],
    ];
    if ($state['reason'] === 'classification_required') {
        $fields['classificationRequired'] = 'Choose Agent or Landlord to continue.';
    }
    if ($state['reason'] === 'suspended') {
        // The client must be able to tell a suspension from a verification gap.
        $fields['accountSuspended'] = 'Your account is suspended.';
        $fields['suspensionReason'] = (string)($state['suspension']['reason'] ?? '');
    }
    error_response($state['message'], 403, $fields);
}

/**
 * Refuse a provider action until the account has chosen Agent or Landlord.
 *
 * The choice is the first step of verification and it decides what the account
 * actually is, so nothing a provider does — uploading proof of identity, applying
 * for a professional authorisation, submitting a listing — can start before it.
 */
function require_provider_classification(array $user): void
{
    if (!provider_classification_required($user)) {
        return;
    }
    error_response(
        'Tell us whether you are an Agent or a Landlord first — it is the first step of verification on your dashboard.',
        409,
        ['classificationRequired' => 'Choose Agent or Landlord to continue.']
    );
}

function handle_get_verification(): void
{
    // An Agent/Landlord account completes identity verification; tenants never
    // need to (tenant registration is unchanged and requires no documents).
    $user = require_auth(['agent', 'landlord']);

    $summary = verification_summary_for_user($user);
    // Upgrade 2 correction: verification begins with the one-time Agent or
    // Landlord choice, so the panel can show it as step one.
    $summary['providerCategory'] = provider_category_state($user);
    $summary['classificationRequired'] = provider_classification_required($user);

    json_response([
        'success'      => true,
        'verification' => $summary,
    ]);
}

function handle_upload_verification_document(): void
{
    $user = require_auth(['agent', 'landlord']);
    require_provider_classification($user);
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
    require_provider_classification($user);
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
    require_provider_classification($user);
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

/**
 * Task 03: record the reviewer's outcome for ONE uploaded document.
 *
 * Requires the reviewer capability. A second capability is still needed to open
 * the file itself, so an account that can mark a document accepted without being
 * able to see it gains nothing.
 */
function handle_admin_review_verification_document(array $params): void
{
    $reviewer = require_verification_reviewer();
    enforce_rate_limit('verification-decision', 200, 3600);
    $input = request_json();

    $document = review_verification_document(
        (string)($params[0] ?? ''),
        (string)($input['decision'] ?? ''),
        (string)($input['note'] ?? ''),
        $reviewer
    );

    json_response(['success' => true, 'document' => $document]);
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
        // Staff see the whole catalogue, including expired listings: that is the
        // point of the availability console.
        $filters = [];
        if (query_param('status')) {
            $filters['status'] = (string)query_param('status');
        }
    } else {
        // The public catalogue: published AND inside its confirmation period.
        $filters = ['status' => $statuses, 'availabilityCurrent' => true];
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

    // Property URLs carry a descriptive slug that ends in the stable id
    // (/property/3-bedroom-apartment-east-legon-prop-1). Both the slug and the
    // bare id resolve to the same row, so a deep link, a share card and an API
    // call all identify the listing the same way — by its id, never by the
    // words in front of it.
    $row = find_property($id) ?? property_resolve_segment($id);
    if (!$row) {
        error_response('Property not found.', 404);
    }

    $user = auth_user();
    // A listing whose availability deadline has passed is not public, even if
    // the scheduled job has not yet written `expired` (rented listings keep
    // their page: the record of a let property is still useful).
    $isPublic = in_array($row['status'], ['active', 'rented'], true)
        && ((string)$row['status'] === 'rented' || property_is_publicly_visible($row));
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
    // Upgrade 2 (C5): amenities are canonical keys. Anything we cannot map is
    // kept verbatim in `amenities_note` so a listing never loses what its owner
    // actually wrote, and an old listing keeps rendering unchanged.
    if (array_key_exists('amenities', $input)) {
        $normalisedAmenities = normalise_amenities($input['amenities']);
        $data['amenities'] = $normalisedAmenities['keys'];
        $extraNote = clean_text($input['amenitiesNote'] ?? '', 1000);
        $unmapped = array_values(array_unique(array_filter(
            array_merge($normalisedAmenities['unknown'], $extraNote !== '' ? [$extraNote] : []),
            static fn(string $value): bool => trim($value) !== ''
        )));
        $data['amenities_note'] = $unmapped === [] ? null : implode(', ', $unmapped);
    }
    if (array_key_exists('toilets', $input)) {
        $toilets = valid_int($input['toilets'], 0, 50);
        if ($toilets === null && $input['toilets'] !== null && $input['toilets'] !== '') {
            $validator->add('toilets', 'Enter a valid number of toilets.');
        } else {
            $data['toilets'] = $toilets;
        }
    }
    if (array_key_exists('kitchens', $input)) {
        $kitchens = valid_int($input['kitchens'], 0, 50);
        if ($kitchens === null && $input['kitchens'] !== null && $input['kitchens'] !== '') {
            $validator->add('kitchens', 'Enter a valid number of kitchens.');
        } else {
            $data['kitchens'] = $kitchens;
        }
    }
    if (array_key_exists('furnishing', $input)) {
        $furnishing = strtolower(clean_string($input['furnishing'] ?? '', 40));
        if ($furnishing !== '' && !isset(FURNISHING_STATES[$furnishing])) {
            $validator->add('furnishing', 'Choose unfurnished, semi-furnished or furnished.');
        } else {
            $data['furnishing'] = $furnishing === '' ? null : $furnishing;
        }
    }
    // Upgrade 2 (C4): only YouTube, TikTok and Facebook, stored as a canonical
    // URL. The raw link is never rendered.
    if (array_key_exists('videoUrl', $input)) {
        $video = parse_property_video($input['videoUrl'] === null ? null : (string)$input['videoUrl']);
        if ($video['error'] !== null) {
            $validator->add('videoUrl', (string)$video['error']);
        } else {
            $data['video_provider'] = $video['provider'];
            $data['video_url'] = $video['url'];
        }
    }
    // Upgrade 2 (C6): the provider's own expectation. It is stored for display
    // beside the platform fee and is never read by any calculation.
    if (array_key_exists('providerCommissionPercent', $input) || array_key_exists('providerCommissionNote', $input)) {
        $rawPercent = $input['providerCommissionPercent'] ?? null;
        $note = clean_text($input['providerCommissionNote'] ?? '', 500);
        $percent = null;
        if ($rawPercent !== null && $rawPercent !== '') {
            $percent = is_numeric($rawPercent) ? round((float)$rawPercent, 2) : null;
            if ($percent === null || $percent < 0 || $percent > 100) {
                $validator->add('providerCommissionPercent', 'Enter a percentage between 0 and 100, or leave it blank.');
                $percent = null;
            }
        }
        $data['provider_commission_percent'] = $percent;
        $data['provider_commission_note'] = $note !== '' ? $note : null;
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
    // Verification is mandatory before listing: the classification is chosen,
    // the identity is approved, and the account is not suspended. One rule for
    // both provider roles — a landlord is not exempt.
    require_provider_listing_access($user);

    $input = request_json();

    // Increment C: an agent submitting on someone else's behalf is a different
    // relationship from an owner listing their own property. Both end up in the
    // same moderation queue, but they are stored differently.
    $isAgentSubmission = ($user['role'] ?? '') === 'agent';
    $agentProfile = null;
    if ($isAgentSubmission) {
        $agentProfile = find_agent_profile_by_user((string)$user['id']);
        // The gate above already required an approved identity. This second check
        // is the administrator's suspension switch: it can close submissions on an
        // otherwise verified agent, and nothing here can reopen them.
        if (!agent_can_submit_listings($agentProfile)) {
            error_response(
                'Listing submissions are closed on this agent account. Contact Goodlucks Homes if you think this is wrong.',
                403,
                ['agentStatus' => 'Agent listing submissions are closed for this account.']
            );
        }

        // Upgrade 2 (C1): an agent is an independent provider. No landlord
        // reference is required, accepted or stored. The agent's own account is
        // the listing's provider, and nothing claims ownership or legal
        // authority on anyone else's behalf. Anything an old client still sends
        // (landlordName/landlordEmail/landlordPhone/landlordId) is ignored
        // rather than trusted, so the endpoint cannot be used to probe for
        // landlord accounts.
        //
        // Listings created before this change keep the landlord information they
        // were created with; nothing here rewrites or deletes it.
    }
    [$data, $validator] = property_payload($input, false);

    // Task 03: an AGENT listing carries its own viewing fee and viewing terms,
    // set here and validated here. There is no platform-wide default: without a
    // fee the submission is refused, so no tenant is ever quoted a figure the
    // property never agreed to.
    //
    // Task 03 update: a LANDLORD listing does NOT. A landlord cannot set, change
    // or omit the viewing fee: the administrator's general landlord viewing fee
    // is applied to the listing server-side after it is created. Any fee or
    // terms sent by a landlord are ignored (and audited), never applied.
    $isLandlordSubmission = ($user['role'] ?? '') === 'landlord';
    $hasViewingFeeInput = array_key_exists('viewingFeeGhs', $input) || array_key_exists('viewingTerms', $input);
    $viewingTermsErrors = [];
    $viewingFee = null;
    if ($isAgentSubmission) {
        $viewingFee = valid_viewing_fee($input['viewingFeeGhs'] ?? $input['feeGhs'] ?? null);
        if ($viewingFee === null) {
            $viewingTermsErrors['viewingFeeGhs'] = 'Enter this property\'s viewing fee in GHS, greater than zero. '
                . 'Every property has its own fee — there is no standard amount.';
        }
        $normalisedTerms = normalise_viewing_terms($input['viewingTerms'] ?? null);
        $viewingTermsErrors += $normalisedTerms['errors'];
    } elseif (!$isLandlordSubmission && $hasViewingFeeInput) {
        // Staff-created listings keep the Task 03 behaviour: a fee/terms pair is
        // recorded as a proposal for review.
        $viewingFee = valid_viewing_fee($input['viewingFeeGhs'] ?? $input['feeGhs'] ?? null);
        if ($viewingFee === null) {
            $viewingTermsErrors['viewingFeeGhs'] = 'Enter this property\'s viewing fee in GHS, greater than zero. '
                . 'Every property has its own fee — there is no standard amount.';
        }
        $normalisedTerms = normalise_viewing_terms($input['viewingTerms'] ?? null);
        $viewingTermsErrors += $normalisedTerms['errors'];
    }

    if ($validator->fails() || $viewingTermsErrors) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors() + $viewingTermsErrors);
    }

    // Landlord and agent submissions always start in the moderation queue.
    $data['status'] = $user['role'] === 'admin'
        ? one_of($input['status'] ?? 'active', PROPERTY_STATUSES, 'pending')
        : 'pending';

    if ($isAgentSubmission) {
        // Upgrade 2 (C1): the agent is the provider. There is no landlord
        // account to attach, no landlord name to invent and no authority state
        // to claim; the listing belongs to the agent who submitted it.
        $data['landlord_id'] = null;
        $data['landlord_name'] = '';
        $data['landlord_company'] = '';
        $data['landlord_contact_claimed'] = null;
        $data['landlord_authority_state'] = 'not_applicable';
        $data['submitted_by_user_id'] = (string)$user['id'];
        $data['submitted_by_role'] = 'agent';
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

    // Task 03 update: the administrator's general landlord viewing fee is
    // applied to a landlord listing by the server, from the configured setting.
    // A landlord's own fee/terms input is never used, and none is invented when
    // no fee has been configured.
    if ($created !== null && $isLandlordSubmission) {
        if ($hasViewingFeeInput) {
            audit_log('landlord_policy.landlord_fee_input_ignored', 'property', $id, [
                'reason' => 'A landlord cannot set the viewing fee; the platform fee is configured by an administrator.',
            ], $user);
        }
        apply_landlord_viewing_fee_to_property($created, $user);
        $created = find_property($id);
        if (!landlord_viewing_fee_is_configured()) {
            foreach (db_all("SELECT id FROM users WHERE role = 'admin' LIMIT 20") as $adminRow) {
                create_notification(
                    (string)$adminRow['id'],
                    'Landlord viewing fee is not configured',
                    'A landlord submitted a listing, but no general landlord viewing fee is set, so it has no viewing fee. '
                        . 'Set it in Fee Policies before the listing is published.',
                    'warning'
                );
            }
        }
    }

    // Task 03: the submitted fee and terms are a PROPOSAL. They become the
    // property's public values only when staff approve the listing (or approve
    // the change later), so `viewing_terms_state` starts at pending_review.
    if ($created !== null && $viewingFee !== null) {
        request_viewing_fee_change($created, [
            'viewingFeeGhs' => $viewingFee,
            'viewingTerms'  => $input['viewingTerms'] ?? null,
        ], $user);
        db_exec(
            "UPDATE properties SET viewing_terms_state = 'pending_review', updated_at = :now WHERE id = :id",
            [':now' => db_now(), ':id' => $id]
        );
        $created = find_property($id);
    }

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
    // matched when approved. A listing that goes live here starts its seven-day
    // availability clock at the same moment it becomes public.
    if ($created && ($created['status'] ?? '') === 'active') {
        $created = start_property_availability_cycle(
            $created,
            ['role' => (string)$user['role'], 'id' => (string)$user['id'], 'name' => (string)$user['name']],
            'staff_dashboard',
            'published'
        );
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
                'Property submitted for review',
                '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e($user['name']) . ',</p>'
                . '<p style="color:#CBD5E1;font-size:14px;">We have received your listing <strong>' . e($data['title']) . '</strong> in '
                . e($data['location']) . '. Our team will review the listing before it goes live. That review covers the listing details, not a visit to the property.</p>'
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

    // Upgrade 2 correction: editing a listing is a listing action, so the same
    // verification rule applies as at creation. Without this, a provider whose
    // verification was never approved could create nothing but still rewrite an
    // existing advert. Administrators are exempt (they moderate).
    require_provider_listing_access($user);

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

    // Task 03: the viewing fee and viewing terms are NOT ordinary fields. They
    // never reach `properties` through this handler; a change is a proposal that
    // staff decide on. The currently approved values keep applying until then.
    $input = request_json();
    $touchesViewingTerms = array_key_exists('viewingFeeGhs', $input) || array_key_exists('viewingTerms', $input);

    if ($validator->fails()) {
        error_response('Please correct the highlighted fields.', 422, $validator->errors());
    }
    if (empty($data) && !$touchesViewingTerms) {
        error_response('No changes were provided.', 400);
    }

    // Task 03 update: a landlord cannot set or change the viewing fee — it is
    // the administrator's general landlord fee. Refused here as well as in the
    // dedicated endpoint, so neither route can be used to bypass it.
    if ($touchesViewingTerms && is_landlord_listing($row)) {
        error_response(
            'The viewing fee for landlord listings is set by Goodlucks Homes and cannot be changed from a listing. '
            . 'Contact the Goodlucks team if you believe it is wrong.',
            403,
            ['viewingFeeGhs' => 'Only Goodlucks Homes sets this fee.']
        );
    }

    $viewingChange = null;
    if ($touchesViewingTerms) {
        $viewingChange = request_viewing_fee_change($row, [
            'viewingFeeGhs' => $input['viewingFeeGhs'] ?? $input['feeGhs'] ?? null,
            'viewingTerms'  => $input['viewingTerms'] ?? null,
            'note'          => $input['viewingNote'] ?? '',
        ], $user);
        if (empty($data)) {
            $fresh = find_property($id);
            json_response([
                'success' => true,
                'message' => 'Your viewing fee and terms change was sent for review. The current fee and terms stay in place until it is approved.',
                'property' => $fresh ? shape_property($fresh) : null,
                'viewingTermsChange' => $viewingChange,
            ], 202);
        }
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
                $watchers = dispatch_price_drop_alerts($updated, $oldRent, $newRent);
                // Upgrade 2 (C7): tell the provider how many watchers were told.
                if ($watchers > 0) {
                    notify_provider_property_interest($updated, 'price_drop', ['watchers' => $watchers]);
                }
            } catch (Throwable $e) {
                gl_log('error', 'Price drop dispatch failed: ' . $e->getMessage(), ['property' => $id]);
            }
        }
    }

    json_response([
        'success'  => true,
        'property' => $updated ? shape_property($updated) : null,
        'viewingTermsChange' => $viewingChange,
    ]);
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

    // Suspension outranks every other publication rule: a listing whose
    // responsible account is suspended cannot be approved into public view, no
    // matter who asks. The refusal names the cause so staff know what to fix.
    if ($status === 'active') {
        $provider = availability_provider_for($row);
        if ($provider !== null) {
            $providerState = provider_listing_state($provider);
            // Only the suspension is re-checked on this existing approval path:
            // identity verification is enforced where a provider submits or
            // republishes, so historic listings approved before this upgrade can
            // still be moderated without inventing a new refusal for them.
            if ($providerState['suspended']) {
                error_response(
                    'This listing cannot be published: the responsible account is suspended.',
                    409,
                    ['provider' => $providerState['message'], 'accountSuspended' => 'The account is suspended.']
                );
            }
        }
    }

    // Task 03 update: a landlord listing is published with the administrator's
    // general viewing fee attached. The fee is applied here too, so a listing
    // that was submitted before the fee was configured still gets it. When no
    // fee has been configured the listing is still published — it simply has no
    // viewing fee, because printing an amount nobody set would be worse — and
    // the audit trail records that configuration is still required.
    if ($status === 'active' && is_landlord_listing($row)) {
        apply_landlord_viewing_fee_to_property($row, $user);
    }

    update_property($id, ['status' => $status]);

    audit_log('property.status_changed', 'property', $id, [
        'from' => (string)($row['status'] ?? ''),
        'to'   => $status,
    ]);

    // Task 03: the listing's viewing fee and terms are approved (or refused)
    // together with the listing itself — one review, not a second system. A
    // pending proposal is the only thing that can be applied here; the approved
    // values of a live listing are never rewritten by this call.
    if ($status === 'active') {
        apply_pending_change_on_property_approval($row, $user);
    } elseif ($status === 'rejected') {
        reject_pending_change_on_property_rejection($row, $user, clean_string($input['note'] ?? '', 500));
    }

    // Going live is the moment saved searches should hear about it — and the
    // moment the seven-day availability clock starts. `start_property_availability_cycle`
    // records the original publication date the first time only, so a listing
    // that is republished after an expiry keeps its history.
    if ($status === 'active' && !$wasActive) {
        $live = find_property($id);
        if ($live) {
            $live = start_property_availability_cycle(
                $live,
                ['role' => (string)$user['role'], 'id' => (string)$user['id'], 'name' => (string)$user['name']],
                'admin_console',
                'published'
            );
            try {
                dispatch_search_alert_matches($live);
            } catch (Throwable $e) {
                gl_log('error', 'Search alert dispatch failed: ' . $e->getMessage(), ['property' => $id]);
            }
        }
    }

    // Tell the submitting agent what happened to a listing they submitted. An
    // agent submission often has no landlord account, so without this the only
    // person who can act on a rejection would never hear about it.
    $submitterId = (string)($row['submitted_by_user_id'] ?? '');
    $submitterRole = (string)($row['submitted_by_role'] ?? '');
    if ($submitterRole === 'agent' && $submitterId !== '' && $submitterId !== (string)($row['landlord_id'] ?? '')) {
        if ($status === 'active') {
            create_notification($submitterId, 'Listing approved', 'Your listing "' . $row['title'] . '" is now live, with the viewing fee and terms you submitted.', 'success');
        } elseif ($status === 'rejected') {
            $agentNote = clean_string($input['note'] ?? '', 500);
            create_notification(
                $submitterId,
                'Listing needs changes',
                $agentNote !== '' ? $agentNote : 'Your listing "' . $row['title'] . '" was not approved.',
                'warning'
            );
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
                    . '<p style="color:#CBD5E1;font-size:14px;">Your listing <strong>' . e($row['title']) . '</strong> has been approved and is now live on Goodlucks Homes.</p>'
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
/**
 * Seven-day availability renewal: the provider's own answers.
 *
 * One endpoint per answer, both authorised the same way (the signed-in account
 * must own or have submitted the listing) and both enforced on the server: the
 * dashboard is a convenience, never the rule.
 */
function handle_property_availability_confirm(array $params): void
{
    $id = (string)($params[0] ?? '');
    $user = require_auth(['landlord', 'agent', 'admin']);
    $row = find_property($id);
    if (!$row || !can_manage_property($user, $row)) {
        // The same answer for "missing" and "not yours": ownership is never
        // confirmed to an account that does not hold it.
        error_response('Property not found.', 404);
    }

    $input = request_json();
    $result = confirm_property_availability(
        $row,
        $user,
        is_admin($user) ? 'admin_console' : 'provider_dashboard',
        clean_string($input['note'] ?? '', 500)
    );
    if (!$result['ok']) {
        error_response($result['error'], $result['code'] ?? 422, $result['fields'] ?? []);
    }

    json_response([
        'success'  => true,
        'message'  => $result['reactivated']
            ? 'Availability confirmed. Your listing is published again with a fresh seven-day confirmation period.'
            : 'Availability confirmed. Your listing stays published and the next confirmation is due in seven days.',
        'property' => shape_property($result['property']),
    ]);
}

function handle_property_availability_decline(array $params): void
{
    $id = (string)($params[0] ?? '');
    $user = require_auth(['landlord', 'agent', 'admin']);
    $row = find_property($id);
    if (!$row || !can_manage_property($user, $row)) {
        error_response('Property not found.', 404);
    }

    $input = request_json();
    $note = clean_string($input['note'] ?? $input['reason'] ?? '', 500);
    $result = withdraw_property_availability($row, $user, $note);
    if (!$result['ok']) {
        error_response($result['error'], $result['code'] ?? 422, $result['fields'] ?? []);
    }

    json_response([
        'success'  => true,
        'message'  => 'Marked as no longer available. It is no longer publicly advertised; the listing and its photographs are kept.',
        'property' => shape_property($result['property']),
    ]);
}

/** The listing's availability history: owner, submitting agent and staff. */
function handle_property_availability_history(array $params): void
{
    $id = (string)($params[0] ?? '');
    $user = require_auth(['landlord', 'agent', 'admin']);
    $row = find_property($id);
    if (!$row || !can_manage_property($user, $row)) {
        error_response('Property not found.', 404);
    }
    json_response([
        'success' => true,
        'history' => property_availability_history($id),
        'availability' => property_availability_state($row),
    ]);
}

/**
 * The administrator's availability console.
 *
 * Filters: all | active | due_soon | awaiting | expired | draft | unavailable |
 * reactivated | suspended. `q` searches title, location, provider and id.
 */
function handle_admin_property_availability(): void
{
    require_admin();
    $result = admin_property_availability_list([
        'filter'  => (string)query_param('filter', ''),
        'q'       => (string)query_param('q', ''),
        'page'    => (int)query_param('page', 1),
        'perPage' => (int)query_param('perPage', 50),
    ]);
    $result['success'] = true;
    json_response($result);
}

/**
 * The activity side of the availability console: confirmations, declines,
 * automatic expiries, reactivations and provider suspensions, newest first.
 */
function handle_admin_property_availability_activity(): void
{
    require_admin();
    $result = admin_availability_activity([
        'kind'    => (string)query_param('kind', ''),
        'q'       => (string)query_param('q', ''),
        'page'    => (int)query_param('page', 1),
        'perPage' => (int)query_param('perPage', 50),
    ]);
    $result['success'] = true;
    json_response($result);
}

/**
 * Administrative reactivation. A reason is required, and the source of the
 * availability confirmation is recorded with it, because an administrator is
 * asserting a fact about the property on the provider's behalf.
 */
function handle_admin_property_availability_reactivate(array $params): void
{
    $admin = require_admin();
    $id = (string)($params[0] ?? '');
    $row = find_property($id);
    if (!$row) {
        error_response('Property not found.', 404);
    }

    $input = request_json();
    $reason = clean_string($input['reason'] ?? '', 500);
    $source = clean_string($input['confirmedWith'] ?? $input['source'] ?? '', 120);
    if (mb_strlen($reason) < 10) {
        error_response(
            'Record the reason for the reactivation (at least 10 characters).',
            422,
            ['reason' => 'Explain how the availability was established.']
        );
    }
    if ($source === '') {
        error_response(
            'Record how availability was confirmed (for example: telephone call with the agent).',
            422,
            ['confirmedWith' => 'Say who confirmed the property is still available.']
        );
    }

    $result = admin_reactivate_property_availability($row, $admin, $reason, $source, clean_string($input['note'] ?? '', 500));
    if (!$result['ok']) {
        error_response($result['error'], $result['code'] ?? 422, $result['fields'] ?? []);
    }

    json_response([
        'success'  => true,
        'message'  => 'Listing reactivated with a fresh seven-day confirmation period. The reason is recorded.',
        'property' => shape_property($result['property']),
    ]);
}

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

/**
 * Task 03: propose a new viewing fee / viewing terms for a property.
 *
 * Only the property's owner or the agent who submitted it may propose. The
 * approved values are not touched here: they keep applying until staff decide,
 * and a refusal leaves them exactly as they were.
 */
function handle_request_viewing_terms(array $params): void
{
    $id = (string)($params[0] ?? '');
    $user = require_auth(['landlord', 'agent']);
    $row = find_property($id);
    if (!$row) {
        error_response('Property not found.', 404);
    }
    if (!can_manage_property($user, $row)) {
        // An agent may never re-price another agent's listing.
        error_response('You can only set the viewing fee for a listing you own or submitted.', 403);
    }
    if ((string)($row['submitted_by_role'] ?? '') === 'agent' && (string)($row['submitted_by_user_id'] ?? '') !== (string)$user['id']) {
        error_response('This listing belongs to another agent.', 403);
    }
    // Task 03 update: the fee on a landlord listing is the administrator's
    // general landlord viewing fee, so a landlord cannot propose a change to it.
    if (is_landlord_listing($row)) {
        error_response(
            'The viewing fee for landlord listings is set by Goodlucks Homes and cannot be changed from a listing. '
            . 'Contact the Goodlucks team if you believe it is wrong.',
            403,
            ['viewingFeeGhs' => 'Only Goodlucks Homes sets this fee.']
        );
    }

    $input = request_json();
    $change = request_viewing_fee_change($row, $input, $user);

    // The property's review state moves to pending, but its APPROVED fee and
    // terms — the ones the public sees — are untouched.
    if ((string)($row['viewing_terms_state'] ?? 'not_set') === 'not_set') {
        db_exec(
            "UPDATE properties SET viewing_terms_state = 'pending_review', updated_at = :now WHERE id = :id",
            [':now' => db_now(), ':id' => $id]
        );
    }

    $fresh = find_property($id);
    json_response([
        'success'            => true,
        'message'            => 'Sent for review. The current viewing fee and terms stay in place until a reviewer approves the change.',
        'viewingTermsChange' => $change,
        'property'           => $fresh ? shape_property($fresh) : null,
    ], 202);
}

/** Task 03: the viewing fee / terms history for one property (owner, agent, staff). */
function handle_viewing_terms_history(array $params): void
{
    $id = (string)($params[0] ?? '');
    $user = require_auth();
    $row = find_property($id);
    if (!$row) {
        error_response('Property not found.', 404);
    }
    if (!can_manage_property($user, $row)) {
        error_response('You can only see the viewing-terms history for your own listings.', 403);
    }

    json_response([
        'success' => true,
        'propertyId' => $id,
        'current' => shape_property_viewing_terms($row, $user, pending_viewing_fee_change($id)),
        'changes' => list_viewing_fee_changes(['propertyId' => $id], 100),
    ]);
}

/** Task 03: staff queue of viewing fee / terms changes. */
function handle_admin_viewing_term_changes(): void
{
    require_admin();
    $status = query_param('status', 'pending_review');
    $filters = [];
    if ($status !== '' && isset(VIEWING_FEE_CHANGE_STATUSES[$status])) {
        $filters['status'] = $status;
    }
    $changes = list_viewing_fee_changes($filters, 200);

    // The listing title is included so staff can judge the change in context;
    // nothing about the owner's account is exposed here.
    foreach ($changes as &$change) {
        $property = find_property((string)$change['propertyId']);
        $change['propertyTitle'] = (string)($property['title'] ?? '');
        $change['propertyStatus'] = (string)($property['status'] ?? '');
    }
    unset($change);

    json_response(['success' => true, 'changes' => $changes, 'count' => count($changes)]);
}

/** Task 03: approve or reject a viewing fee / terms change. */
function handle_admin_decide_viewing_term_change(array $params): void
{
    $actor = require_admin();
    $id = (string)($params[0] ?? '');
    $input = request_json();
    $decision = one_of(strtolower(trim((string)($input['decision'] ?? ''))), ['approve', 'reject'], null);
    if ($decision === null) {
        error_response('Choose approve or reject.', 422, ['decision' => 'Send decision=approve or decision=reject.']);
    }
    $note = clean_string($input['note'] ?? '', 500);

    $change = $decision === 'approve'
        ? approve_viewing_fee_change($id, $actor, $note)
        : reject_viewing_fee_change($id, $actor, $note);

    $property = find_property((string)$change['propertyId']);
    json_response([
        'success' => true,
        'message' => $decision === 'approve'
            ? 'Approved. The new viewing fee and terms now apply, and the previous values are kept in the history.'
            : 'Rejected. The previously approved viewing fee and terms still apply.',
        'viewingTermsChange' => $change,
        'property' => $property ? shape_property($property) : null,
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

/**
 * Every listing, for the administrator's Manage Listings screen (Upgrade 2, A6).
 *
 * The console used to fetch one page and filter it in the browser, so a search
 * only ever covered the listings that happened to be in that page and anything
 * past the 100-row cap was invisible. Every filter below runs in SQL over the
 * real table, and the response carries the true total so the console can page
 * through all of it:
 *
 *   q, status (comma-separated or repeated), location, city, type, bedrooms,
 *   minRent, maxRent, createdFrom, createdTo, sort, page, perPage
 */
function handle_admin_properties(): void
{
    require_admin();

    $statusParam = query_param('status');
    $statuses = [];
    if (is_string($statusParam) && trim($statusParam) !== '') {
        foreach (explode(',', $statusParam) as $candidate) {
            $candidate = strtolower(trim($candidate));
            if (in_array($candidate, PROPERTY_STATUSES, true)) {
                $statuses[] = $candidate;
            }
        }
    }

    // A date the console sends must be a real YYYY-MM-DD date; anything else is
    // ignored rather than silently matching everything.
    $validDate = static function ($value): ?string {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }
        $parsed = date_create($value);
        return $parsed !== false ? $parsed->format('Y-m-d') : null;
    };

    $filters = [
        'q'           => trim((string)query_param('q', '')),
        'sort'        => (string)query_param('sort', 'newest'),
        'page'        => (int)query_param('page', 1),
        'perPage'     => (int)query_param('perPage', 20),
        'location'    => trim((string)query_param('location', '')),
        'city'        => trim((string)query_param('city', '')),
        'type'        => trim((string)query_param('type', '')),
        'bedrooms'    => trim((string)query_param('bedrooms', '')),
        'minRent'     => query_param('minRent'),
        'maxRent'     => query_param('maxRent'),
        'createdFrom' => $validDate(query_param('createdFrom')),
        'createdTo'   => $validDate(query_param('createdTo')),
    ];
    if ($statuses !== []) {
        $filters['status'] = $statuses;
    }

    // Drop the empty strings so `query_properties()` does not create an
    // always-true LIKE on an empty needle.
    $filters = array_filter($filters, static fn($value): bool => $value !== null && $value !== '');
    // A page size outside the API's own range is clamped by query_properties();
    // asking for everything is never allowed.
    $result = query_properties($filters);

    json_response([
        'success'    => true,
        'count'      => count($result['items']),
        'total'      => $result['total'],
        'page'       => $result['page'],
        'perPage'    => $result['perPage'],
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

// ===========================================================================
// User directory, profiles and activity (Upgrade 2 Phase 3: A11, A13, A14)
//
// Every endpoint here re-checks its capability server-side. The console hides a
// screen it cannot use, but hiding is never the enforcement.
// ===========================================================================
/**
 * Formal suspension of an Agent or Landlord account (this upgrade).
 *
 * Both classifications go through the same two endpoints, because suspension is
 * an account state, not a role feature. Reinstatement is deliberately a separate
 * action with its own reason: lifting a suspension is not the same decision as
 * imposing one, and neither is the same as verifying an identity.
 */
function handle_admin_suspend_provider(array $params): void
{
    $admin = require_admin();
    $userId = (string)($params[0] ?? '');
    $target = find_user_by_id($userId);
    if (!$target) {
        error_response('Account not found.', 404);
    }

    $input = request_json();
    $result = suspend_provider($target, $admin, (string)($input['reason'] ?? ''));
    if (!$result['ok']) {
        error_response($result['error'], 422, $result['fields'] ?? []);
    }

    json_response([
        'success' => true,
        'message' => 'Account suspended. ' . (int)($result['unpublished'] ?? 0)
            . ' live listing(s) were removed from public view and every record is kept.',
        'user' => public_user($result['user']),
        'listingsUnpublished' => (int)($result['unpublished'] ?? 0),
    ]);
}

function handle_admin_reinstate_provider(array $params): void
{
    $admin = require_admin();
    $userId = (string)($params[0] ?? '');
    $target = find_user_by_id($userId);
    if (!$target) {
        error_response('Account not found.', 404);
    }

    $input = request_json();
    $result = reinstate_provider($target, $admin, (string)($input['reason'] ?? ''));
    if (!$result['ok']) {
        error_response($result['error'], 422, $result['fields'] ?? []);
    }

    json_response([
        'success' => true,
        'message' => 'Account reinstated. Identity verification and classification are unchanged. '
            . (int)($result['awaitingConfirmation'] ?? 0)
            . ' listing(s) now wait for a fresh availability confirmation — none were republished automatically.',
        'user' => public_user($result['user']),
        'listingsAwaitingConfirmation' => (int)($result['awaitingConfirmation'] ?? 0),
    ]);
}

function handle_admin_users(): void
{
    $admin = require_admin();
    if (!can_manage_users($admin)) {
        error_response('Your account cannot open the user directory.', 403);
    }

    $page = max(1, (int)query_param('page', 1));
    $perPage = (int)query_param('perPage', 25);

    $roles = [];
    foreach (explode(',', (string)query_param('role', '')) as $candidate) {
        $candidate = strtolower(trim($candidate));
        if (in_array($candidate, USER_DIRECTORY_ROLES, true)) {
            $roles[] = $candidate;
        }
    }

    $status = strtolower(trim((string)query_param('status', '')));
    if ($status !== '' && !in_array($status, USER_DIRECTORY_STATUSES, true)) {
        error_response(
            'Unknown verification filter.',
            422,
            ['status' => 'Choose one of: ' . implode(', ', USER_DIRECTORY_STATUSES)]
        );
    }

    $result = list_admin_users(
        [
            'q'      => (string)query_param('q', ''),
            'roles'  => $roles,
            'status' => $status,
        ],
        $page,
        $perPage
    );

    json_response([
        'success'      => true,
        'count'        => count($result['rows']),
        'total'        => $result['total'],
        'page'         => $result['page'],
        'perPage'      => $result['perPage'],
        'users'        => $result['rows'],
        'roles'        => USER_DIRECTORY_ROLES,
        'statuses'     => USER_DIRECTORY_STATUSES,
        'capabilities' => directory_capabilities($admin),
    ]);
}

function handle_admin_user_profile(array $params): void
{
    $admin = require_admin();
    if (!can_manage_users($admin) && !can_view_user_activity($admin)) {
        error_response('Your account cannot read user profiles.', 403);
    }

    $summary = admin_user_summary((string)($params[0] ?? ''));
    if ($summary === null) {
        error_response('That account does not exist.', 404);
    }

    // The summary never carries a document reference; when the viewer also holds
    // the activity capability it carries the stored history as well.
    $activity = can_view_user_activity($admin)
        ? admin_user_activity((string)$summary['id'], 50)
        : [];

    json_response([
        'success'      => true,
        'user'         => $summary,
        'activity'     => $activity,
        'canViewActivity' => can_view_user_activity($admin),
        // Upgrade 2 (E2): the profile screen only offers the classification
        // control to an administrator who may actually use it.
        'canCorrectClassification' => can_manage_users($admin) && (string)($summary['role'] ?? '') !== 'admin',
    ]);
}

/**
 * Correct an account's provider classification (Upgrade 2, E2).
 *
 * A provider's classification — Agent or Landlord — is chosen during verification
 * (an Agent/Landlord account is stored on the agent or landlord role), and
 * is final once the account has been verified. This endpoint exists for the one
 * case that justifies changing it: the person picked the wrong one, or staff
 * recorded the wrong one, and the account is now telling tenants something
 * untrue.
 *
 * What it refuses, deliberately:
 *   * an administrator account as the target — no path from here to privilege;
 *   * `admin` as the new role — this is a provider correction, not a promotion;
 *   * the account's existing role (a no-op is not a correction);
 *   * a correction without a written reason.
 *
 * Every change is audited with the previous value, the new value, the reason and
 * the administrator who made it, and the account holder is told in the app.
 */
function handle_admin_correct_user_role(array $params): void
{
    $admin = require_admin();
    if (!can_manage_users($admin)) {
        error_response('Your account cannot change account classifications.', 403);
    }

    $userId = (string)($params[0] ?? '');
    $input = request_json();
    $reason = clean_text($input['reason'] ?? '', 500);
    $role = strtolower(clean_string($input['role'] ?? '', 20));

    if (!in_array($role, ['tenant', 'landlord', 'agent'], true)) {
        error_response('Choose Agent, Landlord or Tenant.', 422, ['role' => 'Choose Agent, Landlord or Tenant.']);
    }
    if (mb_strlen($reason) < 10) {
        error_response(
            'Write why this correction is needed — it is kept with the record.',
            422,
            ['reason' => 'At least 10 characters describing the mistake.']
        );
    }

    $target = find_user_by_id($userId);
    if ($target === null) {
        error_response('That account does not exist.', 404);
    }
    if ((string)$target['role'] === 'admin') {
        // Staff accounts are never reachable from a provider-classification tool.
        error_response('Administrator accounts cannot be reclassified here.', 403);
    }
    if ((string)$target['role'] === $role) {
        error_response('That account already holds this classification.', 422, ['role' => 'No change to make.']);
    }
    if ((string)$target['id'] === (string)$admin['id']) {
        error_response('You cannot reclassify your own account.', 403);
    }

    $from = (string)$target['role'];
    set_user_role((string)$target['id'], $role);

    // The professional classification follows the role: a staff correction is
    // also the only way an Agent/Landlord account changes the Agent-or-Landlord
    // choice it made during verification, and it must clear 'pending' so the
    // account is not still asked to choose.
    db_exec('UPDATE users SET provider_category = :category WHERE id = :id', [
        ':category' => $role === 'tenant' ? null : $role,
        ':id'       => (string)$target['id'],
    ]);

    // Becoming an agent needs an agent profile to review: create it in the
    // normal pending state so staff approve it through the Agent Accounts
    // screen, exactly as they would for a new sign-up. A correction must not
    // hand out listing permission.
    if ($role === 'agent' && find_agent_profile_by_user((string)$target['id']) === null) {
        create_agent_profile((string)$target['id'], [
            'agency_name'    => (string)($target['company'] ?? ''),
            'operating_city' => (string)($target['address'] ?? ''),
        ]);
    }

    audit_log('user.role_corrected', 'user', (string)$target['id'], [
        'from'   => $from,
        'to'     => $role,
        'reason' => $reason,
    ]);

    try {
        create_notification(
            (string)$target['id'],
            'Account type corrected',
            'Goodlucks staff corrected your account type from ' . $from . ' to ' . $role . '. Reason: ' . $reason,
            'info'
        );
    } catch (Throwable $e) {
        gl_log('error', 'Could not notify corrected account: ' . $e->getMessage());
    }

    $summary = admin_user_summary((string)$target['id']);

    json_response([
        'success' => true,
        'user'    => $summary,
        'corrected' => ['from' => $from, 'to' => $role],
    ]);
}

function handle_admin_user_activity(array $params): void
{
    $admin = require_admin();
    if (!can_view_user_activity($admin)) {
        error_response('Your account cannot read user activity.', 403);
    }

    $userId = (string)($params[0] ?? '');
    $exists = db_one('SELECT id FROM users WHERE id = :id', [':id' => $userId]);
    if ($exists === null) {
        error_response('That account does not exist.', 404);
    }

    $limit = (int)query_param('limit', 50);

    json_response([
        'success'  => true,
        'userId'   => $userId,
        'activity' => admin_user_activity($userId, $limit),
    ]);
}

function handle_admin_activity(): void
{
    $admin = require_admin();
    // The feed is the same power as a person's history: reading who did what.
    // Holding the directory capability does not carry it.
    if (!can_view_user_activity($admin)) {
        error_response('Your account cannot read the activity feed.', 403);
    }

    $limit = (int)query_param('limit', 20);
    $entries = admin_activity_feed($limit);

    json_response([
        'success'  => true,
        'count'    => count($entries),
        'activity' => $entries,
    ]);
}

// ===========================================================================
// Bulk email campaigns (Upgrade 2 Phase 3: A12)
// ===========================================================================
function handle_list_campaigns(): void
{
    $admin = require_admin();
    if (!can_send_bulk_email($admin)) {
        error_response('Your account cannot send bulk email.', 403);
    }

    json_response([
        'success'   => true,
        'campaigns' => campaign_list((int)query_param('limit', 20)),
        'audiences' => CAMPAIGN_AUDIENCES,
        'kinds'     => CAMPAIGN_KINDS,
    ]);
}

function handle_campaign_preview(): void
{
    $admin = require_admin();
    if (!can_send_bulk_email($admin)) {
        error_response('Your account cannot send bulk email.', 403);
    }

    $preview = campaign_preview(
        (string)query_param('audience', 'all'),
        (string)query_param('kind', 'marketing')
    );

    json_response(['success' => true] + $preview);
}

function handle_create_campaign(): void
{
    $admin = require_admin();
    if (!can_send_bulk_email($admin)) {
        error_response('Your account cannot send bulk email.', 403);
    }

    $input = request_json();

    try {
        $campaign = campaign_create($input, $admin);
    } catch (CampaignValidationException $e) {
        error_response($e->getMessage(), 422, $e->fields);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    json_response(['success' => true, 'campaign' => $campaign], 201);
}

function handle_campaign_show(array $params): void
{
    $admin = require_admin();
    if (!can_send_bulk_email($admin)) {
        error_response('Your account cannot send bulk email.', 403);
    }

    $summary = campaign_summary((string)($params[0] ?? ''));
    if ($summary === null) {
        error_response('That campaign does not exist.', 404);
    }

    json_response(['success' => true] + $summary);
}

function handle_queue_campaign(array $params): void
{
    $admin = require_admin();
    if (!can_send_bulk_email($admin)) {
        error_response('Your account cannot send bulk email.', 403);
    }

    try {
        $summary = campaign_queue((string)($params[0] ?? ''), $admin);
    } catch (CampaignValidationException $e) {
        error_response($e->getMessage(), 422, $e->fields);
    } catch (CampaignConflictException $e) {
        error_response($e->getMessage(), 409);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    json_response([
        'success' => true,
        'message' => 'Queued ' . (int)($summary['counts']['total'] ?? 0) . ' messages. Delivery happens in the background.',
    ] + $summary);
}

function handle_retry_campaign(array $params): void
{
    $admin = require_admin();
    if (!can_send_bulk_email($admin)) {
        error_response('Your account cannot send bulk email.', 403);
    }

    try {
        $summary = campaign_retry_failed((string)($params[0] ?? ''), $admin);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    json_response(['success' => true, 'message' => 'Failed messages are back in the queue.'] + $summary);
}

// ---------------------------------------------------------------------------
// Email preferences (public: the link in every campaign email)
// ---------------------------------------------------------------------------
function handle_email_preferences_show(): void
{
    $token = trim((string)query_param('token', ''));
    $preferences = $token === '' ? null : email_preferences_by_token($token);

    if ($preferences === null) {
        http_response_code(404);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title></head>'
            . '<body style="font-family:Arial,Helvetica,sans-serif;background:#F7F7F7;color:#252A34;padding:40px 16px;">'
            . '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;">'
            . '<h1 style="font-size:20px;margin:0 0 10px;">This link is not valid</h1>'
            . '<p style="font-size:14px;line-height:1.5;color:#4B5563;margin:0;">The preferences link may have been '
            . 'shortened or copied wrongly. Reply to any of our emails and we will update your preference for you.</p>'
            . '</div></body></html>';
        return;
    }

    $masked = mask_email_address($preferences['email']);
    $state = $preferences['optIn'] ? 'You are receiving occasional updates.' : 'You are not receiving marketing email.';
    $action = $preferences['optIn'] ? 'Stop marketing email' : 'Receive platform updates';
    $next = $preferences['optIn'] ? 'false' : 'true';

    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title></head>'
        . '<body style="font-family:Arial,Helvetica,sans-serif;background:#F7F7F7;color:#252A34;padding:40px 16px;">'
        . '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;">'
        . '<p style="font-size:12px;letter-spacing:.5px;color:#FF2E63;font-weight:bold;margin:0 0 6px;">GOODLUCKS HOMES</p>'
        . '<h1 style="font-size:20px;margin:0 0 10px;">Email preferences</h1>'
        . '<p style="font-size:14px;line-height:1.5;color:#4B5563;margin:0 0 6px;">This page manages ' . e($masked) . '.</p>'
        . '<p style="font-size:14px;line-height:1.5;color:#4B5563;margin:0 0 18px;">' . e($state) . '</p>'
        . '<button type="button" data-next="' . e($next) . '" id="gl-pref-button" '
        . 'style="background:#FF2E63;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-size:14px;font-weight:bold;cursor:pointer;">'
        . e($action) . '</button>'
        . '<p id="gl-pref-result" style="font-size:13px;color:#4B5563;margin:14px 0 0;"></p>'
        . '<p style="font-size:11px;color:#8A8A8A;margin:18px 0 0;">Account, security and payment messages are '
        . 'not affected by this setting.</p>'
        . '</div><script>'
        . 'document.getElementById("gl-pref-button").addEventListener("click",function(){'
        . 'var b=this;var out=document.getElementById("gl-pref-result");b.disabled=true;'
        . 'fetch("/api/email/preferences",{method:"POST",headers:{"Content-Type":"application/json"},'
        . 'body:JSON.stringify({token:' . json_encode($token) . ',optIn:' . ($preferences['optIn'] ? 'false' : 'true') . '})})'
        . '.then(function(r){return r.json();}).then(function(d){if(d&&d.success){out.textContent=d.message||"Saved.";}'
        . 'else{out.textContent=(d&&d.message)||"Could not save that.";b.disabled=false;}})'
        . '.catch(function(){out.textContent="Could not reach the server. Please try again.";b.disabled=false;});'
        . '});</script></body></html>';
}

function handle_email_preferences_update(): void
{
    enforce_rate_limit('email-preferences', 60, 3600);
    $input = request_json();
    $token = trim((string)($input['token'] ?? ''));
    $optIn = filter_var($input['optIn'] ?? false, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

    if ($token === '' || $optIn === null) {
        error_response('That preferences link is not valid.', 422);
    }

    $preferences = email_preferences_update($token, (bool)$optIn);
    if ($preferences === null) {
        error_response('That preferences link is not valid.', 404);
    }

    json_response([
        'success' => true,
        'message' => $optIn
            ? 'You will receive occasional platform updates. You can change this at any time.'
            : 'You have been removed from marketing email. Account and security messages still reach you.',
        'preferences' => [
            'optIn' => $preferences['optIn'],
            'email' => mask_email_address($preferences['email']),
        ],
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

/**
 * Web enquiries, with search and status filters (Upgrade 2, A10).
 *
 * `statusCounts` counts EVERY enquiry, so the console's status chips stay
 * truthful while a search narrows the list below them.
 */
function handle_admin_enquiries(): void
{
    require_admin();

    $statusParam = query_param('status');
    $statuses = [];
    if (is_string($statusParam) && trim($statusParam) !== '') {
        foreach (explode(',', $statusParam) as $candidate) {
            $candidate = strtolower(trim($candidate));
            if (in_array($candidate, ENQUIRY_STATUSES, true)) {
                $statuses[] = $candidate;
            }
        }
    }

    $filters = ['q' => trim((string)query_param('q', ''))];
    if ($statuses !== []) {
        $filters['status'] = $statuses;
    }
    if ($filters['q'] === '') {
        unset($filters['q']);
    }

    $enquiries = list_enquiries(500, $filters);

    json_response([
        'success'      => true,
        'count'        => count($enquiries),
        'enquiries'    => $enquiries,
        'statusCounts' => count_enquiries_by_status(),
    ]);
}

// ===========================================================================
// Tenant requests
// ===========================================================================
function handle_create_tenant_request(): void
{
    enforce_rate_limit('tenant-request', TENANT_REQUEST_RATE_LIMIT_PER_HOUR, 3600);
    $input = request_json();

    // Correction 1: a rent request is a tenant action. The role is read from
    // the session on the server — never from the request body — so an agent, a
    // landlord or a visitor cannot submit one by calling the API directly.
    // Guests get 401, the wrong role gets 403, and no record is written.
    $user = require_auth(['tenant']);

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

    $payload = [
        // The account that submitted it, taken from the session (Correction 1).
        'tenant_id'         => (string)$user['id'],
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
    ];

    // Upgrade 2 (D1): at most three requests may be open at once. The check and
    // the insert share one immediate transaction, so two submissions racing each
    // other cannot both squeeze past a count of two.
    $pendingStatuses = TENANT_REQUEST_PENDING_STATUSES;
    $placeholders = implode(', ', array_map(static fn($s) => "'" . $s . "'", $pendingStatuses));
    $outcome = db_transaction_immediate(static function () use ($user, $payload, $placeholders): array {
        $pending = (int)db_value(
            'SELECT COUNT(*) FROM tenant_requests WHERE tenant_id = :tid AND status IN (' . $placeholders . ')',
            [':tid' => (string)$user['id']]
        );
        if ($pending >= TENANT_REQUEST_PENDING_LIMIT) {
            return ['blocked' => true, 'pending' => $pending, 'requestId' => null];
        }

        return ['blocked' => false, 'pending' => $pending, 'requestId' => create_tenant_request($payload)];
    });

    if ($outcome['blocked']) {
        audit_log('tenant_request.limit_reached', 'tenant_request', (string)$user['id'], [
            'pending' => $outcome['pending'],
            'limit'   => TENANT_REQUEST_PENDING_LIMIT,
        ], $user);
        error_response(
            'You already have ' . TENANT_REQUEST_PENDING_LIMIT . ' rental requests in progress. '
            . 'Once one is matched, scheduled or closed you can submit another.',
            409,
            ['pending' => 'Close or complete one of your open rental requests first.']
        );
    }

    $requestId = (string)$outcome['requestId'];

    send_email(
        (string)valid_email($input['tenantEmail']),
        clean_string($input['tenantName'], 120),
        'Rental matching request received - Goodlucks Homes',
        email_html_template(
            'Rental matching request received',
            '<p style="color:#CBD5E1;font-size:14px;">Hello ' . e($input['tenantName']) . ',</p>'
            . '<p style="color:#CBD5E1;font-size:14px;">Your rental request has been received. We are now scoring the live listings against your request and will show the matches on your dashboard.</p>'
            . '<ul style="color:#94A3B8;font-size:13px;">'
            . '<li>Locations: ' . e(implode(', ', $locations)) . '</li>'
            . '<li>Budget: GH₵ ' . number_format((float)$budgetMin, 2) . ' - GH₵ ' . number_format((float)$budgetMax, 2) . ' per month</li>'
            . '<li>Bedrooms: ' . e((string)$bedrooms) . ' &bull; Move-in: ' . e((string)$moveInDate) . '</li>'
            . '</ul>'
        ),
        'tenant_request',
        'Rental matching request received'
    );

    create_notification((string)$user['id'], 'Rental request submitted', 'We are matching live listings against your request.', 'info');

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

        // Console filters (Upgrade 2, A7): a name/phone/email search and the
        // pending / approved / viewing-scheduled stages. `stageCounts` counts
        // every request so the chips stay truthful while a search narrows the
        // list below them.
        $scope = [];
        $query = trim((string)query_param('q', ''));
        if ($query !== '') {
            $scope['q'] = $query;
        }
        $stage = strtolower(trim((string)query_param('stage', '')));
        if ($stage !== '') {
            if (tenant_request_stage_statuses($stage) === []) {
                error_response('Unknown request stage.', 422, [
                    'stage' => 'Choose one of: pending, approved, viewing_scheduled, completed, cancelled.',
                ]);
            }
            $scope['stage'] = $stage;
        }
        $status = trim((string)query_param('status', ''));
        if ($status !== '') {
            $scope['status'] = $status;
        }

        $requests = list_tenant_requests($scope, 500);
        $stageCounts = ['pending' => 0, 'approved' => 0, 'viewing_scheduled' => 0, 'completed' => 0, 'cancelled' => 0];
        foreach (list_tenant_requests([], 2000) as $row) {
            $key = (string)($row['stage'] ?? 'pending');
            $stageCounts[$key] = ($stageCounts[$key] ?? 0) + 1;
        }

        json_response([
            'success'     => true,
            'requests'    => $requests,
            'stageCounts' => $stageCounts,
        ]);
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
            // Upgrade 2 (B3): the administrator's "chosen for you" set is a real
            // recommendation, so it is validated rather than stored blindly: only
            // live listings, no duplicates, and never more than six.
            //
            // Three is the point at which a shortlist reads as a recommendation,
            // but it is not a hard floor: a genuine single-property match has
            // always been allowed and existing records still say so. A shorter
            // set is therefore accepted and *labelled* — `curationWarning` in
            // /api/matches tells the tenant (and the console) that the list is
            // thin rather than pretending it is a considered shortlist.
            $chosen = array_values(array_unique(clean_string_list($input['matchedPropertyIds'], 20, 64)));
            if (count($chosen) > 6) {
                error_response(
                    'Choose at most 6 properties for the tenant. More than six is a search result, not a recommendation.',
                    422,
                    ['matchedPropertyIds' => 'Select up to 6 live listings.']
                );
            }
            foreach ($chosen as $propertyId) {
                $property = find_property($propertyId);
                if (!$property || (string)($property['status'] ?? '') !== 'active') {
                    error_response(
                        'One of the chosen properties is not a live listing any more. Refresh and choose again.',
                        422,
                        ['matchedPropertyIds' => 'Every chosen property must be an active listing.']
                    );
                }
            }
            $fields['matched_property_ids'] = $chosen;
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
                    . '<p style="color:#CBD5E1;font-size:14px;">New listings match your request. Sign in to your tenant dashboard to review the matches, see why each one was suggested, and ask for a viewing.</p>'
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
            // The fee recorded when the request was made, never a default.
            'feeAmountGhs' => $existing['feeAmountGhs'] ?? null,
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

    // Task 03: the viewing fee and terms come from THIS property's approved
    // values. There is no platform-wide fee; a property with nothing approved
    // has no fee (0), and that is what the tenant is told.
    //
    // Task 03 update: a landlord listing approved before the general landlord
    // viewing fee existed has no fee on the row yet. The configured fee is
    // applied here, once, BEFORE the viewing is snapshotted — never on a
    // recorded viewing, and never as an invented amount.
    if (is_landlord_listing($property)
        && approved_viewing_fee($property) === null
        && landlord_viewing_fee_is_configured()
    ) {
        apply_landlord_viewing_fee_to_property($property, $user ?? ['id' => '', 'role' => 'system']);
        $property = find_property($propertyId) ?? $property;
    }

    $approvedFee = approved_viewing_fee($property);
    $approvedTerms = approved_viewing_terms($property);
    // Where the fee came from and who it is paid to, frozen with the request.
    $feePolicy = viewing_fee_policy_payload($property);
    $viewingTermsSnapshot = [
        'snapshotKind' => 'property_viewing_terms',
        'propertyId'   => $propertyId,
        'feeGhs'       => $approvedFee,
        'terms'        => $approvedTerms,
        'capturedAt'   => db_now(),
    ] + $feePolicy;

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
        'fee_amount_ghs'    => $approvedFee ?? 0,
        'viewing_terms_snapshot_json' => json_encode($viewingTermsSnapshot, JSON_UNESCAPED_SLASHES),
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
            . '<p style="color:#94A3B8;font-size:12px;">'
                . ($feePolicy['source'] === 'platform_policy'
                    ? 'A viewing fee, if one applies, is paid to Goodlucks Homes after the viewing — never online and never to the landlord.'
                    : 'A viewing fee, if one applies, is paid on site after meeting the agent.')
                . ' Goodlucks never asks for a viewing fee online, and no payment has been recorded for this request.</p>'
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
        'feeAmountGhs' => $approvedFee,
        // What this property's approved viewing terms say, exactly as recorded
        // on the request.
        'viewingTerms' => $approvedTerms,
        'awaitingAgent'=> true,
        // The person who just submitted this request typed these details in this
        // same call, so echoing them back reveals nothing they do not already
        // know. Every READ of a viewing goes through `viewing_payload()`.
        'viewing'      => $viewing,
    ], 201);
}

/**
 * Shape a viewing for the person making THIS request.
 *
 * The tenant's phone number and email address are withheld from agents and
 * landlords until an administrator approves sharing (Upgrade 2 security fix;
 * the full approval workflow lands in Phase 5). Staff and the tenant themselves
 * are unaffected. Every viewing payload in this file passes through here, so a
 * new endpoint cannot forget the rule.
 */
function viewing_payload(array $viewing): array
{
    return viewing_for_viewer($viewing, auth_user());
}

/** @param array<int,array> $viewings */
function viewing_payload_list(array $viewings): array
{
    return array_map('viewing_payload', $viewings);
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
            'viewings' => viewing_payload_list($viewings),
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
        json_response([
            'success'  => true,
            'viewings' => viewing_payload_list(list_viewings_filtered(['agentUserId' => (string)$user['id']], 200)),
        ]);
        return;
    }

    if ($role === 'landlord') {
        json_response([
            'success'  => true,
            'viewings' => viewing_payload_list(list_viewings_filtered(['landlordId' => (string)$user['id']], 200)),
        ]);
        return;
    }

    json_response([
        'success'  => true,
        'viewings' => viewing_payload_list(list_viewings_filtered([
            'tenantUserId' => (string)$user['id'],
            'tenantEmail'  => (string)($user['email'] ?? ''),
        ], 100)),
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
        'viewing'        => viewing_payload($viewing),
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

    // Upgrade 2 (B5): the provider responsible for the viewing acts on it —
    // an agent, or the landlord who listed the property. Administrators keep
    // their override. `viewing_access()` has already established which of those
    // the caller is, so this only has to reject a tenant.
    $providerOnly = static function (string $role): void {
        if (!in_array($role, ['agent', 'landlord', 'admin'], true)) {
            error_response('Only the provider responsible for this viewing can do that.', 403);
        }
    };

    switch ($action) {
        case 'propose':
            $providerOnly($role);
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
                'viewing' => viewing_payload($updated),
            ]);
            return;

        case 'confirm':
            if (!in_array($role, ['tenant', 'agent', 'landlord', 'admin'], true)) {
                error_response('Only the tenant or the responsible provider can confirm this appointment.', 403);
            }
            if (viewing_normalise_status($viewing['status']) === 'confirmed') {
                error_response('This appointment is already confirmed.', 409);
            }
            $updated = viewing_apply_transition($viewing, $user, $role, ['status' => 'confirmed', 'note' => $note]);
            json_response([
                'success' => true,
                'message' => 'Appointment confirmed for ' . $updated['date'] . ' at ' . $updated['time'] . '.',
                'viewing' => viewing_payload($updated),
            ]);
            return;

        case 'reschedule':
            if (!in_array($role, ['agent', 'landlord', 'admin'], true)) {
                error_response('Only the provider responsible for this viewing can move it.', 403);
            }
            if ($date === null || $time === null || $time === '') {
                error_response('Choose the new date and time.', 422, [
                    'date' => 'A rescheduled appointment needs a date.',
                    'time' => 'A rescheduled appointment needs a time.',
                ]);
            }
            if ($reason === '') {
                error_response('Say why the appointment needs to move.', 422, [
                    'reason' => 'A reschedule needs a reason the tenant can read.',
                ]);
            }
            // Upgrade 2 (B5): the provider proposes; the tenant accepts. Only an
            // administrator may move an agreed appointment outright.
            $rescheduleTarget = $role === 'admin' ? 'rescheduled' : 'reschedule_requested';
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => $rescheduleTarget,
                'date'   => $date,
                'time'   => $time,
                'note'   => $note,
                'reason' => $reason,
            ]);
            json_response([
                'success' => true,
                'message' => $rescheduleTarget === 'rescheduled'
                    ? 'Rescheduled to ' . $updated['date'] . ' at ' . $updated['time'] . '. The previous slot is kept in the history.'
                    : 'New time proposed (' . $updated['date'] . ' at ' . $updated['time'] . '). The tenant must accept it before the appointment moves.',
                'viewing' => viewing_payload($updated),
            ]);
            return;

        case 'accept-reschedule':
            // Upgrade 2 (B5): the tenant accepts the time the provider proposed.
            // The slot comes from the stored request, not from the client.
            if (!in_array($role, ['tenant', 'admin'], true)) {
                error_response('Only the tenant can accept a new time.', 403);
            }
            if (viewing_normalise_status($viewing['status']) !== 'reschedule_requested') {
                error_response('There is no requested new time to accept.', 409);
            }
            $requestedDate = (string)($viewing['preferredDate'] ?? '');
            if ($requestedDate === '') {
                error_response('The requested time is missing its date. Ask the provider to propose it again.', 422);
            }
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => 'rescheduled',
                'date'   => $requestedDate,
                'time'   => (string)($viewing['preferredTime'] ?? ''),
                'note'   => $note,
            ]);
            json_response([
                'success' => true,
                'message' => 'New time accepted: ' . $updated['date'] . ' at ' . $updated['time'] . '.',
                'viewing' => viewing_payload($updated),
            ]);
            return;

        case 'decline-reschedule':
            if (!in_array($role, ['tenant', 'admin'], true)) {
                error_response('Only the tenant can decline a new time.', 403);
            }
            if (viewing_normalise_status($viewing['status']) !== 'reschedule_requested') {
                error_response('There is no requested new time to decline.', 409);
            }
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => 'confirmed',
                'note'   => $note !== '' ? $note : 'The agreed time stands.',
            ]);
            json_response([
                'success' => true,
                'message' => 'New time declined. The agreed appointment stands: ' . $updated['date'] . ' at ' . $updated['time'] . '.',
                'viewing' => viewing_payload($updated),
            ]);
            return;

        case 'request-reschedule':
            if (!in_array($role, ['tenant', 'agent', 'landlord', 'admin'], true)) {
                error_response('Only the tenant or the provider can ask for a new time.', 403);
            }
            if ($reason === '') {
                error_response('Say why the appointment needs to move.', 422, [
                    'reason' => 'A reschedule request needs a reason.',
                ]);
            }
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => 'reschedule_requested', 'date' => $date, 'time' => $time,
                'note' => $note, 'reason' => $reason,
            ]);
            json_response([
                'success' => true,
                'message' => 'Reschedule request recorded. The appointment is not moved until a new time is agreed.',
                'viewing' => viewing_payload($updated),
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
                'viewing' => viewing_payload($updated),
            ]);
            return;

        case 'complete':
            $providerOnly($role);
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
                'viewing' => viewing_payload($updated),
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
                'viewing' => viewing_payload($updated),
            ]);
            return;

        case 'could-not-proceed':
            $providerOnly($role);
            $updated = viewing_apply_transition($viewing, $user, $role, [
                'status' => 'could_not_proceed', 'reason' => $reason, 'note' => $note,
            ]);
            json_response([
                'success' => true,
                'message' => 'Recorded that the viewing could not proceed.',
                'viewing' => viewing_payload($updated),
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
        'viewing'        => viewing_payload($viewing),
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
        'viewing' => viewing_payload($updated),
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
        'viewing' => viewing_payload($updated),
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

    // Task 03 update: on a landlord listing the viewing fee is Goodlucks money,
    // recorded as received through the landlord fee section (which needs the
    // viewing to be complete and writes the receipt). This legacy checkbox
    // records an AGENT collection, so it is refused here rather than creating a
    // ledger row that says an agent collected a fee Goodlucks took itself.
    if (array_key_exists('viewingFeePaid', $input) && $role === 'admin') {
        $policyProperty = (string)($viewing['propertyId'] ?? '') !== '' ? find_property((string)$viewing['propertyId']) : null;
        if ($policyProperty !== null && is_landlord_listing($policyProperty)) {
            error_response(
                'This viewing is for a landlord listing. Record the viewing fee from Admin → Finance → Landlord fees; '
                . 'it is paid to Goodlucks Homes, not collected by an agent.',
                422,
                ['viewingFeePaid' => 'Landlord viewing fees are recorded in the landlord fee section.']
            );
        }
    }

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

    $finalViewing = find_viewing($id);
    json_response(['success' => true, 'viewing' => $finalViewing ? viewing_payload($finalViewing) : null]);
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
            '<p style="color:#CBD5E1;font-size:14px;">We will notify you when a listing matching your criteria goes live.</p>'
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

    // Upgrade 2 (C7): the provider learns their listing drew interest. Only the
    // fact and a count — the saver's identity never leaves this handler.
    try {
        $savedRow = find_property($propertyId);
        $providerId = $savedRow ? property_provider_user_id($savedRow) : '';
        if ($savedRow && $providerId !== '' && $providerId !== (string)$user['id']) {
            notify_provider_property_interest($savedRow, 'saved');
        }
    } catch (Throwable $e) {
        gl_log('error', 'Provider interest notification failed: ' . $e->getMessage(), ['property' => $propertyId]);
    }

    json_response(['success' => true, 'propertyIds' => list_saved_property_ids((string)$user['id'])]);
}

function handle_unsave_property(array $params): void
{
    $user = require_auth();
    remove_saved_property((string)$user['id'], (string)($params[0] ?? ''));
    json_response(['success' => true, 'propertyIds' => list_saved_property_ids((string)$user['id'])]);
}

// ===========================================================================
// Rent payment records — removed (Upgrade 2, E1)
//
// The tenant rent-receipt feature is gone: its routes and handlers were deleted
// in Phase 7, and the client no longer has a screen, a menu entry or a type for
// it. What remains in the database is the history itself — `rent_receipts` is
// never dropped and its rows are never deleted. Rent is paid between a tenant
// and a landlord; Goodlucks does not receive it, so it does not issue receipts
// for it.
//
// The *fee* ledger below is a different system and is untouched: money Goodlucks
// did receive (viewing fees, commissions), with its reversals.
// ===========================================================================

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

function handle_delete_fee_policy(array $params): void
{
    $user = require_fee_policy_manager();
    enforce_rate_limit('fee-policy-write', 60, 3600);
    $id = (string)($params[0] ?? '');
    if (!find_fee_policy($id)) {
        error_response('Fee policy not found.', 404);
    }

    $input = request_json();
    try {
        $result = delete_fee_policy($id, $user, (string)($input['reason'] ?? ''));
    } catch (FeePolicyConflictException $e) {
        // 409: the request is understood but the record is history.
        json_response([
            'success'  => false,
            'error'    => $e->getMessage(),
            'code'     => 'policy_is_history',
            'policyId' => $id,
        ], 409);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    json_response(['success' => true] + $result);
}

/** Every agent's derived tier. Read-only: there is no endpoint that sets a tier. */
function handle_admin_agent_tier_overview(): void
{
    $staff = require_fee_policy_staff();

    json_response(admin_agent_tier_overview() + [
        'success'      => true,
        'capabilities' => finance_capabilities($staff),
    ]);
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

// ===========================================================================
// Area proximity (Upgrade 2, Phase 5: B2)
// ===========================================================================
function handle_list_area_adjacency(): void
{
    require_auth(['admin']);

    json_response([
        'success'     => true,
        'adjacencies' => list_area_adjacency(),
        'areas'       => match_known_areas(),
        'bands'       => AREA_ADJACENCY_BANDS,
        'weights'     => MATCH_WEIGHTS,
        'note'        => 'Proximity is the administrator\'s judgement, not a guessed distance. '
            . 'A listing in an area with no recorded relationship earns no proximity points, and the '
            . 'tenant sees that in the score breakdown.',
    ]);
}

function handle_save_area_adjacency(): void
{
    $admin = require_auth(['admin']);
    enforce_rate_limit('area-adjacency', 120, 3600);
    $input = request_json();

    try {
        $adjacency = save_area_adjacency($input, $admin);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    json_response(['success' => true, 'adjacency' => $adjacency], 201);
}

function handle_delete_area_adjacency(array $params): void
{
    $admin = require_auth(['admin']);
    $id = (string)($params[0] ?? '');

    try {
        delete_area_adjacency($id, $admin);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 404);
    }

    json_response(['success' => true]);
}

// ===========================================================================
// Tenant contact disclosure (Upgrade 2, Phase 5: B6)
// ===========================================================================
function handle_request_contact_disclosure(array $params): void
{
    $user = require_auth(['agent', 'landlord']);
    enforce_rate_limit('contact-disclosure-request', 30, 3600);

    $id = (string)($params[0] ?? '');
    $viewing = find_viewing($id);
    if (!$viewing) {
        error_response('Viewing not found.', 404);
    }

    // The provider must be responsible for this viewing; the relationship is
    // resolved on the server, never taken from the request body.
    $access = viewing_access($viewing, $user);
    if (!$access['canView'] || !in_array($access['role'], ['agent', 'landlord'], true)) {
        error_response('You do not have access to this viewing.', 403);
    }

    $input = request_json();
    try {
        $disclosure = request_contact_disclosure($viewing, $user, (string)($input['reason'] ?? ''));
    } catch (RuntimeException $e) {
        error_response($e->getMessage(), 409);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    json_response([
        'success'    => true,
        'message'    => 'Request sent to Goodlucks staff. The tenant\'s details stay hidden until it is approved.',
        'disclosure' => $disclosure,
        'viewing'    => viewing_for_viewer($viewing, $user),
    ], 201);
}

/** A provider's own requests, and the record a tenant is entitled to see. */
function handle_my_contact_disclosures(): void
{
    $user = require_auth();
    $role = (string)($user['role'] ?? '');
    $id = (string)$user['id'];

    if ($role === 'tenant') {
        json_response(['success' => true, 'disclosures' => list_contact_disclosures_for_tenant($id)]);
    }
    if ($role === 'agent' || $role === 'landlord') {
        json_response([
            'success'     => true,
            'disclosures' => list_contact_disclosures_for_provider($id, clean_string(query_param('viewingId', ''), 64)),
        ]);
    }

    json_response(['success' => true, 'disclosures' => []]);
}

function handle_list_contact_disclosures(): void
{
    require_auth(['admin']);
    $status = clean_string(query_param('status', ''), 24);

    json_response([
        'success'     => true,
        'disclosures' => list_contact_disclosures(['status' => $status]),
        'counts'      => [
            'pending'  => count(list_contact_disclosures(['status' => 'pending'])),
            'approved' => count(list_contact_disclosures(['status' => 'approved'])),
            'rejected' => count(list_contact_disclosures(['status' => 'rejected'])),
            'revoked'  => count(list_contact_disclosures(['status' => 'revoked'])),
        ],
        'validDays'   => CONTACT_DISCLOSURE_VALID_DAYS,
    ]);
}

function handle_decide_contact_disclosure(array $params): void
{
    $admin = require_auth(['admin']);
    $id = (string)($params[0] ?? '');
    $input = request_json();

    try {
        $disclosure = decide_contact_disclosure(
            $id,
            $admin,
            (string)($input['decision'] ?? ''),
            (string)($input['note'] ?? '')
        );
    } catch (RuntimeException $e) {
        error_response($e->getMessage(), 409);
    } catch (InvalidArgumentException $e) {
        error_response($e->getMessage(), 422);
    }

    json_response(['success' => true, 'disclosure' => $disclosure]);
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
        // Task 07: the Learning Centre itself.
        ['loc' => SITE_URL . '/blog', 'priority' => '0.7', 'changefreq' => 'weekly'],
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

    $result = query_properties(['status' => 'active', 'perPage' => 500, 'availabilityCurrent' => true]);
    foreach ($result['items'] as $property) {
        $updated = (string)($property['updatedAt'] ?? '');
        $timestamp = $updated !== '' ? strtotime($updated) : false;
        // One URL per listing, in the canonical descriptive form
        // (/property/{title}-{location}-{id}) that the property page redirects
        // to. Listing the bare id here as well would advertise two URLs for one
        // page, so it is deliberately not added.
        $entries[] = [
            'loc'        => property_canonical_url($property),
            'lastmod'    => gmdate('Y-m-d', $timestamp !== false ? $timestamp : time()),
            'changefreq' => 'weekly',
            'priority'   => '0.8',
        ];
    }

    // Task 07: published articles only. A draft, a scheduled post before its
    // time and an unpublished article are never advertised to a crawler.
    blog_promote_due_posts();
    foreach (db_all("SELECT slug, COALESCE(updated_at, published_at, created_at) AS last_touch
                       FROM blog_posts WHERE status = 'published'
                       ORDER BY published_at DESC LIMIT 2000", []) as $post) {
        $timestamp = strtotime((string)($post['last_touch'] ?? '')) ?: time();
        $entries[] = [
            'loc'        => SITE_URL . '/blog/' . rawurlencode((string)$post['slug']),
            'lastmod'    => gmdate('Y-m-d', $timestamp),
            'changefreq' => 'monthly',
            'priority'   => '0.6',
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
        'A %d-bedroom %s in %s, with %s. The listing was submitted through Goodlucks Homes, which reviews it before publishing and passes viewing requests to the agent or landlord. '
        . 'View the property before you commit. Monthly rent is GH₵ %s.',
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

    $prompt = "Write a clear, factual property description (80-120 words) for a rental listing in Ghana:\n"
        . "Title: {$title}\nLocation: {$location}\nType: {$type}\nBedrooms: {$bedrooms}\nMonthly Rent: GH₵ {$rent}\n"
        . 'Key Amenities: ' . implode(', ', $amenities) . "\n"
        . 'Describe only what the submitted details support: the space, the amenities and the location. '
        . 'Do not claim the property was inspected, verified, guaranteed, managed or owned by Goodlucks Homes, and do not mention landlord contact details.';

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
/**
 * Score one listing against one rental request (Upgrade 2, B2).
 *
 * The arithmetic lives in `lib/matching.php` so the weights, the proximity rule
 * and the explanation are in one place. This wrapper keeps the historic
 * signature: callers get the score and the sentence, and now also the breakdown
 * that produced them.
 */
function match_score(array $request, array $property): array
{
    $result = match_score_breakdown($request, $property);

    return [
        'score'     => $result['score'],
        'reason'    => $result['reason'],
        'breakdown' => $result['breakdown'],
        'band'      => match_score_band($result['score']),
    ];
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
    $result = query_properties(['status' => 'active', 'perPage' => 120, 'availabilityCurrent' => true]);

    $scored = [];
    foreach ($result['items'] as $property) {
        $scoredScore = match_score($request, $property);
        $scored[] = [
            'property'  => $property,
            'score'     => $scoredScore['score'],
            'reason'    => $scoredScore['reason'],
            'breakdown' => $scoredScore['breakdown'],
            'band'      => $scoredScore['band'],
            'curated'   => in_array((string)$property['id'], $curated, true),
        ];
    }

    // Upgrade 2 (B3): two lists, because they are two different promises.
    //
    //   curatedForYou  — properties an administrator chose for this tenant, in
    //                    the order they chose them. These come first.
    //   similarMatches — everything else, ordered by the documented score.
    //
    // A tenant must be able to tell which is which, so they are never merged
    // into one unlabelled list.
    $curatedMatches = [];
    foreach ($curated as $propertyId) {
        foreach ($scored as $candidate) {
            if ((string)$candidate['property']['id'] === $propertyId) {
                $curatedMatches[] = $candidate;
                break;
            }
        }
    }

    $similar = array_values(array_filter($scored, static fn(array $row): bool => !$row['curated']));
    usort($similar, static fn(array $a, array $b): int => $b['score'] <=> $a['score']);
    $similarMatches = array_slice($similar, 0, 12);

    $curatedCount = count($curatedMatches);

    json_response([
        'success'        => true,
        'requestId'      => (string)$request['id'],
        // Legacy key, in the order the console and dashboard have always read.
        'matches'        => array_merge($curatedMatches, $similarMatches),
        'curatedForYou'  => $curatedMatches,
        'similarMatches' => $similarMatches,
        'curatedCount'   => $curatedCount,
        'curatedMinimum' => 3,
        // Stated, not hidden: a shortlist of one or two is labelled as such.
        'curationWarning' => $curatedCount > 0 && $curatedCount < 3
            ? 'Only ' . $curatedCount . ' propert' . ($curatedCount === 1 ? 'y is' : 'ies are')
                . ' marked as chosen for this tenant. Choose at least 3 so the shortlist reads as a recommendation.'
            : null,
        'topScore'       => $similarMatches ? (int)$similarMatches[0]['score'] : ($curatedMatches ? (int)$curatedMatches[0]['score'] : 0),
        'scoreBands'     => ['strong' => 85, 'good' => 65, 'possible' => 45],
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

// ===========================================================================
// Landlord fee policy (Task 03 update)
// ===========================================================================
/**
 * The administrator's general landlord viewing fee and the landlord platform
 * fee statement, in one read.
 *
 * Any administrator may read it (it is the setting that publishes landlord
 * listings); the money records below are capability-gated like the rest of the
 * finance desk.
 */
function handle_admin_landlord_policy(): void
{
    require_auth(['admin']);
    json_response([
        'success' => true,
        'policy'  => landlord_policy_summary(),
    ]);
}

/**
 * Set the one general landlord viewing fee.
 *
 * Administrator-only, validated server-side as a non-negative money amount, and
 * audited with the previous value. Nothing a landlord or agent sends can reach
 * this setting: the role check is the only door.
 */
function handle_admin_set_landlord_viewing_fee(): void
{
    $user = require_auth(['admin']);
    $input = request_json();

    $result = set_landlord_viewing_fee($input['amountGhs'] ?? $input['viewingFeeGhs'] ?? null, $user);

    json_response([
        'success' => true,
        'message' => 'The general landlord viewing fee is now GH₵ '
            . number_format((float)($result['policy']['viewingFee']['amountGhs'] ?? 0), 2)
            . '. It applies to landlord-submitted listings; recorded viewings and payments keep their own figures.',
        'policy'  => $result['policy'],
        'listingsUpdated' => $result['listingsUpdated'],
    ]);
}

