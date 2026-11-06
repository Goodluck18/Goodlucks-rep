-- ============================================================
-- Goodlucks Homes - MySQL schema for cPanel / phpMyAdmin
--
-- Safe to import more than once: tables use CREATE TABLE IF NOT EXISTS and
-- seed rows are inserted with INSERT IGNORE, so an existing production
-- database is never dropped or overwritten.
--
-- For an existing installation run:  php php-backend/migrate.php
-- (adds the new columns/tables without touching stored data)
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+00:00";
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- 1. Users (tenants, landlords, administrators)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  -- Task 03: the name the account holder entered as their official Ghana Card
  -- name at registration. It is a claim, never a verification: only an approved
  -- identity check makes an account identity-verified. Existing accounts keep
  -- NULL until they supply it, so nobody is locked out.
  `official_name` VARCHAR(200) DEFAULT NULL,
  `role` VARCHAR(32) NOT NULL DEFAULT 'tenant',
  `phone` VARCHAR(64) NOT NULL DEFAULT '',
  `password_hash` VARCHAR(255) DEFAULT NULL,
  `avatar` TEXT DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `bio` TEXT DEFAULT NULL,
  `company` VARCHAR(255) DEFAULT NULL,
  `is_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `preferred_locations` TEXT DEFAULT NULL,
  `budget_min` DECIMAL(12,2) DEFAULT NULL,
  `budget_max` DECIMAL(12,2) DEFAULT NULL,
  `preferred_bedrooms` INT DEFAULT NULL,
  `additional_notes` TEXT DEFAULT NULL,
  -- Increment D: least-privilege staff capabilities. Both default to 0, so a new
  -- administrator cannot read identity documents until someone with server
  -- access grants the capability explicitly (php-backend/grant_reviewer.php).
  `can_review_verifications` TINYINT(1) NOT NULL DEFAULT 0,
  `can_access_identity_documents` TINYINT(1) NOT NULL DEFAULT 0,
  -- Increment E: financial-policy capabilities. Creating/editing (manage) and
  -- approving/activating (approve) are separate powers, both default 0, and both
  -- granted only from the server console (php-backend/grant_finance.php).
  `can_manage_fee_policies` TINYINT(1) NOT NULL DEFAULT 0,
  `can_approve_fee_policies` TINYINT(1) NOT NULL DEFAULT 0,
  -- Increment F: correcting a viewing record is an exceptional, audited act and
  -- is not part of ordinary administration. Default 0 (grant with
  -- php-backend/grant_viewing.php).
  `can_correct_viewings` TINYINT(1) NOT NULL DEFAULT 0,
  `can_view_finance` TINYINT(1) NOT NULL DEFAULT 0,
  `can_confirm_remittances` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_users_email` (`email`),
  KEY `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. Server-side sessions (HttpOnly cookie tokens, stored hashed)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL,
  `last_seen_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_sessions_token` (`token_hash`),
  KEY `idx_sessions_user` (`user_id`),
  KEY `idx_sessions_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. Properties
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `properties` (
  `id` VARCHAR(64) NOT NULL,
  `landlord_id` VARCHAR(64) DEFAULT NULL,
  `landlord_name` VARCHAR(255) DEFAULT NULL,
  `landlord_company` VARCHAR(255) DEFAULT NULL,
  `submitted_by_user_id` VARCHAR(64) DEFAULT NULL,
  `submitted_by_role` VARCHAR(32) DEFAULT NULL,
  `landlord_authority_state` VARCHAR(32) NOT NULL DEFAULT 'not_applicable',
  -- Increment F: the landlord contact an agent supplied. Kept for staff review
  -- only; it is never used to confirm whether an account exists and is never
  -- shown to tenants.
  `landlord_contact_claimed` VARCHAR(255) DEFAULT NULL,
  `is_landlord_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `title` VARCHAR(255) NOT NULL,
  `location` VARCHAR(255) NOT NULL,
  `city` VARCHAR(100) NOT NULL DEFAULT 'Accra',
  `rent_ghs` DECIMAL(12,2) NOT NULL,
  `bedrooms` INT NOT NULL DEFAULT 0,
  `bathrooms` INT NOT NULL DEFAULT 0,
  `property_type` VARCHAR(64) NOT NULL DEFAULT 'Apartment',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `images` LONGTEXT NOT NULL,
  `description` LONGTEXT NOT NULL,
  `amenities` LONGTEXT DEFAULT NULL,
  `nearby_places` LONGTEXT DEFAULT NULL,
  `availability` VARCHAR(100) DEFAULT 'Available Now',
  `featured` TINYINT(1) NOT NULL DEFAULT 0,
  -- Task 03: the property's OWN viewing fee and viewing terms. The values here
  -- are the APPROVED, publicly visible ones; a change to an already-approved
  -- listing lives in `property_viewing_fee_changes` until staff approve it.
  -- NULL means "no viewing fee has been approved for this property" — there is
  -- deliberately no platform-wide default.
  `viewing_fee_ghs` DECIMAL(10,2) DEFAULT NULL,
  `viewing_terms_json` LONGTEXT DEFAULT NULL,
  `viewing_terms_state` VARCHAR(24) NOT NULL DEFAULT 'not_set',
  `viewing_terms_updated_at` DATETIME DEFAULT NULL,
  `viewing_terms_approved_by` VARCHAR(64) DEFAULT NULL,
  `views_count` INT NOT NULL DEFAULT 0,
  `enquiries_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_prop_status` (`status`),
  KEY `idx_prop_landlord` (`landlord_id`),
  KEY `idx_prop_submitted_by` (`submitted_by_user_id`),
  KEY `idx_prop_city` (`city`),
  KEY `idx_prop_rent` (`rent_ghs`),
  KEY `idx_prop_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3b. Property-specific viewing fee / terms change requests (Task 03)
-- ------------------------------------------------------------
-- A property carries exactly one APPROVED viewing fee and set of viewing terms
-- (see `properties.viewing_fee_ghs` / `viewing_terms_json`). Every proposal to
-- change them is a row here, so the previous approved values keep applying
-- until staff approve the replacement, and the whole history is kept.
-- Rows are append-only apart from the decision fields.
CREATE TABLE IF NOT EXISTS `property_viewing_fee_changes` (
  `id` VARCHAR(64) NOT NULL,
  `property_id` VARCHAR(64) NOT NULL,
  `requested_by` VARCHAR(64) NOT NULL,
  `requested_by_role` VARCHAR(32) NOT NULL DEFAULT '',
  -- The values being proposed.
  `proposed_fee_ghs` DECIMAL(10,2) NOT NULL,
  `proposed_terms_json` LONGTEXT DEFAULT NULL,
  -- What was in force when the proposal was made, so the decision is readable
  -- on its own even if the property row changes later.
  `previous_fee_ghs` DECIMAL(10,2) DEFAULT NULL,
  `previous_terms_json` LONGTEXT DEFAULT NULL,
  -- pending_review | approved | rejected
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending_review',
  `note` TEXT DEFAULT NULL,
  `decision_note` TEXT DEFAULT NULL,
  `reviewed_by` VARCHAR(64) DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `applied_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vfc_property` (`property_id`, `status`),
  KEY `idx_vfc_status` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. Tenant property-matching requests
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tenant_requests` (
  `id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) DEFAULT NULL,
  `tenant_name` VARCHAR(255) NOT NULL,
  `tenant_phone` VARCHAR(64) NOT NULL,
  `tenant_email` VARCHAR(255) NOT NULL,
  `preferred_locations` TEXT NOT NULL,
  `budget_min` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `budget_max` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `bedrooms` INT NOT NULL DEFAULT 1,
  `bathrooms` INT NOT NULL DEFAULT 1,
  `property_type` VARCHAR(64) NOT NULL DEFAULT 'Apartment',
  `move_in_date` VARCHAR(64) DEFAULT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'submitted',
  `matched_property_ids` TEXT DEFAULT NULL,
  `assigned_agent` VARCHAR(255) DEFAULT 'Goodlucks Intermediary Desk',
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tr_status` (`status`),
  KEY `idx_tr_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. Physical viewing schedules
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `viewing_schedules` (
  `id` VARCHAR(64) NOT NULL,
  `tenant_request_id` VARCHAR(64) DEFAULT NULL,
  `tenant_name` VARCHAR(255) NOT NULL,
  `tenant_phone` VARCHAR(64) NOT NULL,
  `tenant_email` VARCHAR(255) DEFAULT NULL,
  `property_id` VARCHAR(64) DEFAULT NULL,
  `property_title` VARCHAR(255) NOT NULL,
  `property_location` VARCHAR(255) NOT NULL,
  `date` VARCHAR(32) NOT NULL,
  `time` VARCHAR(32) NOT NULL,
  `assigned_agent` VARCHAR(255) DEFAULT '',
  `status` VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  `viewing_fee_paid` TINYINT(1) NOT NULL DEFAULT 0,
  -- Task 03: copied from the property's APPROVED viewing fee when the request is
  -- made. No platform-wide default exists any more; 0 means "no fee applies".
  `fee_amount_ghs` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `viewing_terms_snapshot_json` LONGTEXT DEFAULT NULL,
  `outcome_notes` TEXT DEFAULT NULL,
  -- Increment F: the agent-led viewing lifecycle. A row is a REQUEST first and
  -- becomes an appointment only when a slot is agreed (confirmed_at).
  `tenant_user_id` VARCHAR(64) DEFAULT NULL,
  `agent_user_id` VARCHAR(64) DEFAULT NULL,
  `landlord_user_id` VARCHAR(64) DEFAULT NULL,
  `request_type` VARCHAR(16) NOT NULL DEFAULT 'viewing',
  `preferred_date` VARCHAR(32) DEFAULT NULL,
  `preferred_time` VARCHAR(32) DEFAULT NULL,
  `confirmed_at` DATETIME DEFAULT NULL,
  `confirmed_by` VARCHAR(64) DEFAULT NULL,
  `cancel_reason` TEXT DEFAULT NULL,
  `cancelled_by` VARCHAR(64) DEFAULT NULL,
  `cancelled_at` DATETIME DEFAULT NULL,
  `completed_at` DATETIME DEFAULT NULL,
  `completed_by` VARCHAR(64) DEFAULT NULL,
  `agent_notes` TEXT DEFAULT NULL,
  `updated_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vs_property` (`property_id`),
  KEY `idx_vs_status` (`status`),
  KEY `idx_vs_email` (`tenant_email`),
  KEY `idx_vs_agent` (`agent_user_id`, `status`),
  KEY `idx_vs_tenant` (`tenant_user_id`),
  KEY `idx_vs_slot` (`date`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5b. Viewing lifecycle history (Increment F, append-only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `viewing_events` (
  `id` VARCHAR(64) NOT NULL,
  `viewing_id` VARCHAR(64) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `from_status` VARCHAR(32) NOT NULL DEFAULT '',
  `to_status` VARCHAR(32) NOT NULL DEFAULT '',
  `previous_date` VARCHAR(32) DEFAULT NULL,
  `previous_time` VARCHAR(32) DEFAULT NULL,
  `new_date` VARCHAR(32) DEFAULT NULL,
  `new_time` VARCHAR(32) DEFAULT NULL,
  `note` TEXT DEFAULT NULL,
  `actor_id` VARCHAR(64) DEFAULT NULL,
  `actor_role` VARCHAR(32) DEFAULT NULL,
  `actor_name` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ve_viewing` (`viewing_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. Website enquiries (contact form / property questions)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `enquiries` (
  `id` VARCHAR(64) NOT NULL,
  `property_id` VARCHAR(64) DEFAULT NULL,
  `property_title` VARCHAR(255) DEFAULT NULL,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(64) DEFAULT NULL,
  `message` TEXT NOT NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'contact_form',
  `status` VARCHAR(24) NOT NULL DEFAULT 'new',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_enq_status` (`status`),
  KEY `idx_enq_property` (`property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. Price drop alerts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `price_drop_alerts` (
  `id` VARCHAR(64) NOT NULL,
  `property_id` VARCHAR(64) NOT NULL,
  `property_title` VARCHAR(255) NOT NULL,
  `property_location` VARCHAR(255) NOT NULL,
  `current_rent_ghs` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `target_rent_ghs` DECIMAL(12,2) DEFAULT NULL,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `notify_on_any_drop` TINYINT(1) NOT NULL DEFAULT 1,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pda_property` (`property_id`),
  KEY `idx_pda_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 8. Search / listing alerts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `search_alerts` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `email` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(64) DEFAULT NULL,
  `location` VARCHAR(100) DEFAULT 'All',
  `property_type` VARCHAR(64) DEFAULT 'All',
  `bedrooms` INT DEFAULT NULL,
  `max_rent_ghs` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `search_query` VARCHAR(200) DEFAULT NULL,
  `frequency` VARCHAR(20) NOT NULL DEFAULT 'instant',
  `channels` TEXT DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sa_email` (`email`),
  KEY `idx_sa_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 9. Saved properties
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `saved_properties` (
  `user_id` VARCHAR(64) NOT NULL,
  `property_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 10. Tenancy agreements
-- RETIRED (Increment A): tenancy-agreement drafting, signing and emailing were
-- removed from the product. The table is kept so no destructive migration is
-- needed; it is no longer written to or read by the application.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tenancy_agreements` (
  `id` VARCHAR(64) NOT NULL,
  `property_id` VARCHAR(64) DEFAULT NULL,
  `property_title` VARCHAR(255) NOT NULL,
  `property_address` VARCHAR(255) NOT NULL,
  `city` VARCHAR(100) DEFAULT 'Accra',
  `landlord_name` VARCHAR(255) NOT NULL,
  `landlord_phone` VARCHAR(64) NOT NULL,
  `landlord_user_id` VARCHAR(64) DEFAULT NULL,
  `landlord_ghana_card` VARCHAR(64) DEFAULT NULL,
  `tenant_name` VARCHAR(255) NOT NULL,
  `tenant_phone` VARCHAR(64) NOT NULL,
  `tenant_user_id` VARCHAR(64) DEFAULT NULL,
  `tenant_ghana_card` VARCHAR(64) DEFAULT NULL,
  `monthly_rent_ghs` DECIMAL(12,2) NOT NULL,
  `duration_months` INT NOT NULL DEFAULT 12,
  `total_rent_ghs` DECIMAL(12,2) NOT NULL,
  `security_deposit_ghs` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `start_date` VARCHAR(32) NOT NULL,
  `end_date` VARCHAR(32) NOT NULL,
  `notice_period_months` INT NOT NULL DEFAULT 3,
  `utilities_responsibility` TEXT DEFAULT NULL,
  `landlord_signed` TINYINT(1) NOT NULL DEFAULT 0,
  `tenant_signed` TINYINT(1) NOT NULL DEFAULT 0,
  `landlord_signature_date` VARCHAR(64) DEFAULT NULL,
  `tenant_signature_date` VARCHAR(64) DEFAULT NULL,
  `witness_name` VARCHAR(255) DEFAULT 'Goodlucks Legal Intermediary',
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending_signatures',
  `verification_code` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_agree_verif` (`verification_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 11. Rent receipts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rent_receipts` (
  `id` VARCHAR(64) NOT NULL,
  `receipt_no` VARCHAR(64) NOT NULL,
  `property_title` VARCHAR(255) NOT NULL,
  `property_address` VARCHAR(255) NOT NULL,
  `tenant_name` VARCHAR(255) NOT NULL,
  `tenant_phone` VARCHAR(64) DEFAULT NULL,
  `tenant_user_id` VARCHAR(64) DEFAULT NULL,
  `landlord_name` VARCHAR(255) NOT NULL,
  `landlord_user_id` VARCHAR(64) DEFAULT NULL,
  `amount_ghs` DECIMAL(12,2) NOT NULL,
  `amount_in_words` TEXT DEFAULT NULL,
  `payment_purpose` VARCHAR(255) DEFAULT NULL,
  `payment_method` VARCHAR(64) DEFAULT 'Cash',
  `transaction_ref` VARCHAR(128) DEFAULT NULL,
  `payment_date` VARCHAR(32) NOT NULL,
  `issued_by` VARCHAR(255) DEFAULT 'Goodlucks Homes Intermediary Desk',
  `verification_code` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_rec_no` (`receipt_no`),
  UNIQUE KEY `idx_rec_verif` (`verification_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 12. Transactional email audit log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `email_logs` (
  `id` VARCHAR(64) NOT NULL,
  `recipient_email` VARCHAR(255) NOT NULL,
  `recipient_name` VARCHAR(255) DEFAULT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `type` VARCHAR(64) NOT NULL,
  `body_preview` TEXT DEFAULT NULL,
  `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` VARCHAR(32) NOT NULL DEFAULT 'queued',
  PRIMARY KEY (`id`),
  KEY `idx_log_sent` (`sent_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 13. In-app notifications
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `type` VARCHAR(32) NOT NULL DEFAULT 'info',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 14. Privacy-friendly traffic analytics
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `page_views` (
  `id` VARCHAR(64) NOT NULL,
  `path` VARCHAR(255) NOT NULL,
  `session_hash` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pv_created` (`created_at`),
  KEY `idx_pv_session` (`session_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 15. Rate limiting for sensitive endpoints
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `rate_limits` (
  `rl_key` VARCHAR(64) NOT NULL,
  `window_start` BIGINT NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`rl_key`, `window_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- SEED DATA - existing Goodlucks Homes Accra listings
-- INSERT IGNORE keeps re-imports safe on a live database.
-- ============================================================

INSERT IGNORE INTO `users` (`id`, `email`, `name`, `role`, `phone`, `avatar`, `address`, `is_verified`) VALUES
('user-tenant-1', 'tenant@goodlucks.com', 'Kofi Mensah', 'tenant', '+233 24 412 3456', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80', 'Cantonments, Accra, Ghana', 1),
('user-landlord-1', 'landlord@goodlucks.com', 'Abena Osei', 'landlord', '+233 20 899 7711', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80', 'East Legon, Accra, Ghana', 1),
('user-admin-1', 'admin@goodlucks.com', 'Goodlucks Admin', 'admin', '+233 30 299 8800', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80', 'Goodlucks HQ, Ridge, Accra', 1);

INSERT IGNORE INTO `properties` (`id`, `landlord_id`, `landlord_name`, `landlord_company`, `title`, `location`, `city`, `rent_ghs`, `bedrooms`, `bathrooms`, `property_type`, `status`, `images`, `description`, `amenities`, `availability`, `featured`, `views_count`, `enquiries_count`) VALUES
('prop-1', 'user-landlord-1', 'Abena Osei', 'Prime Haven Properties Ltd', 'The Pearl Executive 3-Bedroom Apartment', 'Cantonments, Accra', 'Accra', 6500.00, 3, 3, 'Apartment', 'active', 
 '[\"https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80\", \"https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80\", \"https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1000&q=80\"]', 
 'A masterpiece of modern West African architecture located in the elite diplomatic precinct of Cantonments. Features floor-to-ceiling soundproof glass, ultra-sleek fitted Italian kitchen, continuous solar back-up power, olympic-size swimming pool, and 24/7 armed private security guards.', 
 '[\"24/7 Standby Generator\", \"Swimming Pool\", \"Fitted Kitchen\", \"Air Conditioning\", \"Gated Security\", \"Balcony\", \"Water Reservoir (Polytank)\", \"Electric Fencing\", \"Gym\"]', 
 'Available Now', 1, 412, 18),

('prop-2', 'user-landlord-1', 'Abena Osei', 'Prime Haven Properties Ltd', 'Serene Oasis 4-Bedroom Gated Townhouse', 'East Legon, Accra', 'Accra', 9200.00, 4, 4, 'Townhouse', 'active', 
 '[\"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80\", \"https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1000&q=80\", \"https://images.unsplash.com/photo-1600573472592-401b489a3cdc?auto=format&fit=crop&w=1000&q=80\"]', 
 'Opulent 4-bedroom contemporary townhouse in the heartbeat of East Legon near Lagos Avenue. Boasts all en-suite bedrooms, imported marble flooring, an expansive private terrace, modern maid room (boys quarters), and dedicated automated borehole water treatment plant.', 
 '[\"24/7 Standby Generator\", \"Gated Security\", \"Boys Quarters\", \"Water Reservoir (Polytank)\", \"Electric Fencing\", \"Air Conditioning\", \"Fitted Kitchen\", \"CCTV Cameras\", \"Fiber Internet Ready\"]', 
 'Available Now', 1, 620, 29),

('prop-3', 'user-landlord-1', 'Abena Osei', 'Prime Haven Properties Ltd', 'Airport Heights Luxury 2-Bedroom Haven', 'Airport Residential Area, Accra', 'Accra', 7800.00, 2, 2, 'Apartment', 'active', 
 '[\"https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80\", \"https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80\"]', 
 'Sophisticated boutique residence nestled in tranquil Airport Residential Area. Perfect for corporate expatriates and discerning professionals seeking peaceful living within minutes of Kotoka International Airport and top international schools.', 
 '[\"Swimming Pool\", \"Gym\", \"24/7 Standby Generator\", \"Elevator / Lift\", \"Underground Parking\", \"Concierge Service\", \"Air Conditioning\", \"Fitted Kitchen\"]', 
 'Available from Sept 1', 1, 389, 14),

('prop-4', 'user-landlord-1', 'Abena Osei', 'Prime Haven Properties Ltd', 'Urban Chic 1-Bedroom Designer Studio', 'Dzorwulu, Accra', 'Accra', 3200.00, 1, 1, 'Studio', 'active', 
 '[\"https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=80\", \"https://images.unsplash.com/photo-1502005229762-ee1b2b81e4b9?auto=format&fit=crop&w=1000&q=80\"]', 
 'Smart minimalist studio flat curated with designer finishes, ambient lighting, high-speed fiber internet, and sleek space-saving architecture. Located 3 minutes stroll from Perez Chapel and Bloomsbury.', 
 '[\"Air Conditioning\", \"Fitted Kitchen\", \"24/7 Standby Generator\", \"Gated Security\", \"Water Reservoir (Polytank)\", \"Balcony\"]', 
 'Available Now', 0, 510, 22);

-- 16. Alert delivery log (idempotency for price-drop & search-alert emails)
CREATE TABLE IF NOT EXISTS `alert_deliveries` (
  `id` VARCHAR(64) NOT NULL,
  `alert_type` VARCHAR(32) NOT NULL,
  `alert_id` VARCHAR(64) NOT NULL,
  `property_id` VARCHAR(64) NOT NULL,
  `context` VARCHAR(64) NOT NULL DEFAULT '',
  `email` VARCHAR(255) NOT NULL,
  `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_alert_delivery_once` (`alert_type`, `alert_id`, `property_id`, `context`),
  KEY `idx_alert_delivery_alert` (`alert_type`, `alert_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. Password reset tokens (hashed; single use, 60 minute expiry)
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_pwreset_token` (`token_hash`),
  KEY `idx_pwreset_user` (`user_id`),
  KEY `idx_pwreset_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. Duplicate-submission guard (double clicks, retried requests)
CREATE TABLE IF NOT EXISTS `submission_dedupe` (
  `fingerprint` VARCHAR(64) NOT NULL,
  `resource_type` VARCHAR(32) NOT NULL,
  `resource_id` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fingerprint`),
  KEY `idx_dedupe_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. Email outbox (durable queue: delivery happens after the response, retried
--     with backoff by cron.php until it succeeds or the attempt cap is reached)
CREATE TABLE IF NOT EXISTS `email_outbox` (
  `id` VARCHAR(64) NOT NULL,
  `recipient_email` VARCHAR(255) NOT NULL,
  `recipient_name` VARCHAR(255) NOT NULL DEFAULT '',
  `subject` VARCHAR(255) NOT NULL,
  `body_html` MEDIUMTEXT NOT NULL,
  `type` VARCHAR(64) NOT NULL DEFAULT 'notification',
  `body_preview` VARCHAR(500) NOT NULL DEFAULT '',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
  `attempts` INT NOT NULL DEFAULT 0,
  `last_error` VARCHAR(500) DEFAULT NULL,
  `next_attempt_at` DATETIME NOT NULL,
  `email_log_id` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sent_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_outbox_due` (`status`, `next_attempt_at`),
  KEY `idx_outbox_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. Audit trail for sensitive administrative, financial and PII actions
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` VARCHAR(64) NOT NULL,
  `actor_id` VARCHAR(64) DEFAULT NULL,
  `actor_role` VARCHAR(32) DEFAULT NULL,
  `action` VARCHAR(64) NOT NULL,
  `entity_type` VARCHAR(64) NOT NULL,
  `entity_id` VARCHAR(64) DEFAULT NULL,
  `context_json` LONGTEXT DEFAULT NULL,
  `ip_address` VARCHAR(64) DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_created` (`created_at`),
  KEY `idx_audit_entity` (`entity_type`, `entity_id`),
  KEY `idx_audit_actor` (`actor_id`),
  KEY `idx_audit_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 21. Fee policies (Increment B foundation, extended in Increment E)
--
-- A policy is an administrative agreement about how one fee category is shared
-- between the agent and Goodlucks. It is NOT a proposal until someone creates
-- one, NOT approved until a *different* administrator with the approver
-- capability approves it, and NOT applicable until it is activated.
--
-- The 60/40 and 70/30 arrangements are proposals only: they exist as
-- PROPOSED_* constants in config.php, are never read by any calculation, and no
-- row for them is seeded here or by migrate.php.
--
-- Additive-only across increments: Increment B created this table with a small
-- column set; Increment E adds the workflow, audit and calculation columns. A
-- legacy row keeps its stored status and is read as a draft (`proposed` ->
-- draft), never as applicable.
--
-- Money never moves because of this table. Applying a policy writes an
-- immutable snapshot (table 29); revenue is recognised only from a remittance.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fee_policies` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(160) NOT NULL DEFAULT '',
  `description` TEXT DEFAULT NULL,
  `category` VARCHAR(32) NOT NULL DEFAULT 'viewing_fee',
  `tier` VARCHAR(32) NOT NULL DEFAULT 'standard',
  `calculation_method` VARCHAR(16) NOT NULL DEFAULT 'percentage',
  `currency` VARCHAR(8) NOT NULL DEFAULT 'GHS',
  -- Percentage policies: both shares are stored and must add up to 100.
  `agent_share_percent` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `goodlucks_share_percent` DECIMAL(5,2) NOT NULL DEFAULT 0,
  -- Fixed-amount policies (future-friendly): the two amounts are the whole fee.
  `agent_share_fixed_ghs` DECIMAL(10,2) DEFAULT NULL,
  `goodlucks_share_fixed_ghs` DECIMAL(10,2) DEFAULT NULL,
  -- draft | pending_approval | approved | active | rejected | deactivated
  -- (`expired` is derived from effective_to and never written here)
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
  `version` INT NOT NULL DEFAULT 1,
  `supersedes_policy_id` VARCHAR(64) DEFAULT NULL,
  `effective_from` DATE DEFAULT NULL,
  `effective_to` DATE DEFAULT NULL,
  `created_by` VARCHAR(64) DEFAULT NULL,
  `submitted_by` VARCHAR(64) DEFAULT NULL,
  `submitted_at` DATETIME DEFAULT NULL,
  `approved_by` VARCHAR(64) DEFAULT NULL,
  `approved_at` DATETIME DEFAULT NULL,
  `rejected_by` VARCHAR(64) DEFAULT NULL,
  `rejected_at` DATETIME DEFAULT NULL,
  `rejection_reason` TEXT DEFAULT NULL,
  `activated_by` VARCHAR(64) DEFAULT NULL,
  `activated_at` DATETIME DEFAULT NULL,
  `deactivated_by` VARCHAR(64) DEFAULT NULL,
  `deactivated_at` DATETIME DEFAULT NULL,
  `deactivation_reason` TEXT DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fee_policy_status` (`status`, `tier`),
  KEY `idx_fee_policy_tier_category` (`tier`, `category`, `status`),
  KEY `idx_fee_policy_dates` (`effective_from`, `effective_to`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 22. Viewing-fee ledger (Increment B)
-- One row per viewing fee event. `fee_total_ghs` is money the AGENT collected
-- from the tenant; `goodlucks_share_ghs` is money OWED to Goodlucks and stays
-- NULL until an explicit agreement is recorded. Neither is Goodlucks revenue:
-- revenue is only recognised when a row exists in `fee_remittances`.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `viewing_fee_records` (
  `id` VARCHAR(64) NOT NULL,
  `reference` VARCHAR(64) NOT NULL,
  `viewing_id` VARCHAR(64) DEFAULT NULL,
  `property_id` VARCHAR(64) DEFAULT NULL,
  `property_title` VARCHAR(255) NOT NULL DEFAULT '',
  `agent_name` VARCHAR(200) NOT NULL DEFAULT '',
  `agent_user_id` VARCHAR(64) DEFAULT NULL,
  `fee_total_ghs` DECIMAL(10,2) DEFAULT NULL,
  -- Task 03 update: whose fee this is.
  --   'agent_collection'        an AGENT listing's fee, collected by an agent
  --                             and shared with Goodlucks by explicit agreement
  --   'landlord_platform_fee'   a LANDLORD listing's fee, paid by the tenant
  --                             directly to Goodlucks. It is 100% Goodlucks and
  --                             is never run through an agent share.
  `fee_source` VARCHAR(32) NOT NULL DEFAULT 'agent_collection',
  `collection_state` VARCHAR(24) NOT NULL DEFAULT 'reported',
  `share_basis` VARCHAR(24) NOT NULL DEFAULT 'not_set',
  `goodlucks_share_ghs` DECIMAL(10,2) DEFAULT NULL,
  `agent_share_ghs` DECIMAL(10,2) DEFAULT NULL,
  `policy_snapshot_json` TEXT DEFAULT NULL,
  -- Increment E: which policy (if any) priced this fee, and the immutable
  -- snapshot that holds the exact terms. NULL for manual agreements and for fees
  -- with no share agreed yet.
  `policy_id` VARCHAR(64) DEFAULT NULL,
  `policy_snapshot_id` VARCHAR(64) DEFAULT NULL,
  `agent_tier_at_snapshot` VARCHAR(32) DEFAULT NULL,
  `recorded_by` VARCHAR(64) DEFAULT NULL,
  `recorded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_vfr_reference` (`reference`),
  UNIQUE KEY `idx_vfr_viewing` (`viewing_id`),
  KEY `idx_vfr_state` (`collection_state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 23. Remittances actually received by Goodlucks (Increment B)
-- Every row is money Goodlucks confirms it received. The sum of these rows is
-- the only viewing-fee figure reported as Goodlucks revenue.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fee_remittances` (
  `id` VARCHAR(64) NOT NULL,
  `viewing_fee_record_id` VARCHAR(64) NOT NULL,
  `amount_ghs` DECIMAL(10,2) NOT NULL,
  `method` VARCHAR(64) NOT NULL DEFAULT 'unknown',
  `reference` VARCHAR(128) DEFAULT NULL,
  `received_at` DATE NOT NULL,
  `recorded_by` VARCHAR(64) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `submission_id` VARCHAR(64) DEFAULT NULL,
  `allocation_id` VARCHAR(64) DEFAULT NULL,
  `entry_type` VARCHAR(16) NOT NULL DEFAULT 'receipt',
  `adjustment_id` VARCHAR(64) DEFAULT NULL,
  `reversal_of_receipt_id` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fee_remit_record` (`viewing_fee_record_id`),
  KEY `idx_fee_remit_received` (`received_at`),
  KEY `idx_fee_remit_submission` (`submission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 24. Agent profiles (Increment C)
-- One row per agent account. `account_status` and `can_submit_listings`
-- default to DENY: a new agent may sign in and complete their profile but
-- cannot submit listings until staff review the account. Nothing in this table
-- is identity or licence verification — that is Increment D.
-- `operating_city` is the area the agent works from, NOT their home address
-- (which stays on users.address) and not a per-area coverage list.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `agent_profiles` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `agency_name` VARCHAR(200) NOT NULL DEFAULT '',
  `operating_city` VARCHAR(120) NOT NULL DEFAULT '',
  `account_status` VARCHAR(24) NOT NULL DEFAULT 'pending_review',
  `can_submit_listings` TINYINT(1) NOT NULL DEFAULT 0,
  `status_note` VARCHAR(500) DEFAULT NULL,
  `reviewed_by` VARCHAR(64) DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_agent_user` (`user_id`),
  KEY `idx_agent_status` (`account_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 25. Identity verifications (Increment D)
-- One row per subject (agent or landlord). This is an IDENTITY check only:
-- it never establishes property ownership, and for a landlord it says nothing
-- about authority over any listing.
--
-- Ghana Card numbers are sensitive personal data:
--   * `document_number_masked` is the only value ordinary API responses use;
--   * `document_number_encrypted` holds the full number, AES-256-GCM encrypted
--     with a key supplied by the deployment (IDENTITY_DATA_KEY). When no key is
--     configured the full number is NOT stored at all and
--     `document_number_retained` stays 0, so nothing plaintext ever lands here;
--   * `retention_purge_after` is set when a decision is final and drives the
--     retention job (php-backend/verification_retention.php).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `identity_verifications` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `subject_role` VARCHAR(32) NOT NULL DEFAULT 'agent',
  `legal_name` VARCHAR(200) NOT NULL DEFAULT '',
  `document_type` VARCHAR(32) NOT NULL DEFAULT 'ghana_card',
  `document_number_masked` VARCHAR(64) NOT NULL DEFAULT '',
  `document_number_encrypted` TEXT DEFAULT NULL,
  `document_number_retained` TINYINT(1) NOT NULL DEFAULT 0,
  `status` VARCHAR(32) NOT NULL DEFAULT 'not_submitted',
  `submitted_at` DATETIME DEFAULT NULL,
  `reviewed_by` VARCHAR(64) DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `decision_note` VARCHAR(1000) DEFAULT NULL,
  `retention_purge_after` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_identity_user` (`user_id`),
  KEY `idx_identity_status` (`status`),
  CONSTRAINT `fk_identity_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 26. Professional authorisations (Increment D)
-- Deliberately SEPARATE from identity verification. An agent may have a
-- verified identity and no professional authorisation, or an expired licence.
-- Reviewing an identity must never change this row and vice versa.
--
-- There is NO external registry integration: `registry_checked` stays 0 and
-- records that no regulator was consulted. A submitted number is evidence for a
-- human reviewer, not a licence.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `professional_authorisations` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `licence_number` VARCHAR(120) NOT NULL DEFAULT '',
  `issuing_authority` VARCHAR(200) NOT NULL DEFAULT '',
  `licence_category` VARCHAR(120) NOT NULL DEFAULT '',
  `issue_date` DATE DEFAULT NULL,
  `expiry_date` DATE DEFAULT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'not_submitted',
  `registry_checked` TINYINT(1) NOT NULL DEFAULT 0,
  `submitted_at` DATETIME DEFAULT NULL,
  `reviewed_by` VARCHAR(64) DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `decision_note` VARCHAR(1000) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_professional_user` (`user_id`),
  KEY `idx_professional_status` (`status`),
  CONSTRAINT `fk_professional_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 27. Verification documents (Increment D)
-- Metadata for files stored by lib/private_storage.php. The file itself lives
-- outside the web root under a random `doc_<hex>` name; `storage_id` is that
-- name. Nothing here is ever served by a public URL.
-- `deleted_at` is set by owner deletion or the retention job; the row is kept so
-- the audit trail can still explain what was removed and when.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `verification_documents` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `scope` VARCHAR(32) NOT NULL DEFAULT 'identity',
  `kind` VARCHAR(32) NOT NULL DEFAULT 'document_front',
  `storage_id` VARCHAR(64) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL DEFAULT '',
  `bytes` INT NOT NULL DEFAULT 0,
  `checksum_sha256` VARCHAR(64) NOT NULL DEFAULT '',
  `uploaded_by` VARCHAR(64) DEFAULT NULL,
  -- Task 03: the reviewer's per-document outcome. 'pending' until a reviewer
  -- records it; it never changes a verification status by itself.
  `review_status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `review_note` VARCHAR(500) DEFAULT NULL,
  `reviewed_by` VARCHAR(64) DEFAULT NULL,
  `reviewed_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_vdoc_storage` (`storage_id`),
  KEY `idx_vdoc_user` (`user_id`),
  KEY `idx_vdoc_scope` (`user_id`, `scope`),
  CONSTRAINT `fk_vdoc_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 28. Verification decision history (Increment D)
-- Append-only. The application never updates or deletes these rows: the current
-- status lives on the verification row, while every decision stays here so a
-- reviewer cannot silently rewrite history.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `verification_decisions` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `scope` VARCHAR(32) NOT NULL DEFAULT 'identity',
  `decision` VARCHAR(32) NOT NULL,
  `from_status` VARCHAR(32) NOT NULL DEFAULT '',
  `to_status` VARCHAR(32) NOT NULL,
  `note` VARCHAR(1000) DEFAULT NULL,
  `reviewer_id` VARCHAR(64) DEFAULT NULL,
  `reviewer_name` VARCHAR(200) DEFAULT NULL,
  -- Microseconds so two decisions made in the same second still sort correctly.
  `decided_at` DATETIME(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vdecision_user` (`user_id`, `scope`),
  CONSTRAINT `fk_vdecision_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 29. Fee-policy transaction snapshots (Increment E)
--
-- The frozen financial terms of ONE transaction. Written once, when an
-- administrator explicitly applies an approved, active policy; never updated and
-- never deleted. Every figure the decision depended on is copied here, including
-- the policy's name, version, tier, percentages and approval evidence, so a
-- later policy edit, expiry, deactivation or an agent changing tier cannot
-- rewrite history.
--
-- `snapshot_hash` is a sha256 over the canonical payload; `shape_fee_snapshot()`
-- recomputes it on read, so tampering with a stored value is visible in the API.
--
-- Money here is an ENTITLEMENT, not a receipt: Goodlucks revenue is recognised
-- only when a row in `fee_remittances` says money was received.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fee_policy_snapshots` (
  `id` VARCHAR(64) NOT NULL,
  `policy_id` VARCHAR(64) NOT NULL,
  `policy_name` VARCHAR(160) NOT NULL DEFAULT '',
  `policy_version` INT NOT NULL DEFAULT 1,
  `policy_category` VARCHAR(32) NOT NULL DEFAULT 'viewing_fee',
  `agent_tier` VARCHAR(32) NOT NULL,
  `subject_user_id` VARCHAR(64) DEFAULT NULL,
  `transaction_type` VARCHAR(32) NOT NULL DEFAULT 'viewing_fee',
  `transaction_id` VARCHAR(64) NOT NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'GHS',
  `calculation_method` VARCHAR(16) NOT NULL DEFAULT 'percentage',
  `fee_total_ghs` DECIMAL(10,2) NOT NULL,
  `agent_share_percent` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `goodlucks_share_percent` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `agent_share_fixed_ghs` DECIMAL(10,2) DEFAULT NULL,
  `goodlucks_share_fixed_ghs` DECIMAL(10,2) DEFAULT NULL,
  `agent_entitlement_ghs` DECIMAL(10,2) NOT NULL,
  `goodlucks_entitlement_ghs` DECIMAL(10,2) NOT NULL,
  `policy_status_at_use` VARCHAR(24) NOT NULL DEFAULT 'active',
  `policy_effective_from` DATE DEFAULT NULL,
  `policy_effective_to` DATE DEFAULT NULL,
  `policy_approved_by` VARCHAR(64) DEFAULT NULL,
  `policy_approved_at` DATETIME DEFAULT NULL,
  `transaction_at` DATETIME NOT NULL,
  `snapshot_hash` VARCHAR(64) NOT NULL DEFAULT '',
  `snapshot_at` DATETIME(6) NOT NULL,
  `created_by` VARCHAR(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_fps_transaction` (`transaction_type`, `transaction_id`),
  KEY `idx_fps_policy` (`policy_id`),
  KEY `idx_fps_subject` (`subject_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 30. Fee-policy history (Increment E)
-- Append-only record of every lifecycle action: created, updated, submitted,
-- approved, rejected, activated, deactivated. The application never updates or
-- deletes these rows, so an approval cannot be quietly undone in the record.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fee_policy_events` (
  `id` VARCHAR(64) NOT NULL,
  `policy_id` VARCHAR(64) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `from_status` VARCHAR(24) NOT NULL DEFAULT '',
  `to_status` VARCHAR(24) NOT NULL DEFAULT '',
  `note` TEXT DEFAULT NULL,
  `actor_id` VARCHAR(64) DEFAULT NULL,
  `actor_name` VARCHAR(200) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fpe_policy` (`policy_id`, `created_at`),
  CONSTRAINT `fk_fpe_policy` FOREIGN KEY (`policy_id`) REFERENCES `fee_policies` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------------
-- Increment G: agent remittances, financial reconciliation, rental commissions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `remittance_submissions` (
  `id` VARCHAR(64) NOT NULL,
  `reference` VARCHAR(64) NOT NULL,
  `agent_user_id` VARCHAR(64) NOT NULL,
  `agent_name` VARCHAR(255) NOT NULL DEFAULT '',
  `amount_ghs` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'GHS',
  `method` VARCHAR(64) NOT NULL DEFAULT 'unknown',
  `payment_reference` VARCHAR(128) NOT NULL DEFAULT '',
  `paid_at` DATE NOT NULL,
  `evidence_reference` VARCHAR(255) NOT NULL DEFAULT '',
  `status` VARCHAR(24) NOT NULL DEFAULT 'submitted',
  `confirmed_ghs` DECIMAL(10,2) DEFAULT NULL,
  `confirmed_by` VARCHAR(64) DEFAULT NULL,
  `confirmed_at` DATETIME DEFAULT NULL,
  `requested_allocations_json` LONGTEXT DEFAULT NULL,
  `decision_reason` TEXT DEFAULT NULL,
  `note` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_remit_reference` (`reference`),
  KEY `idx_remit_sub_agent` (`agent_user_id`, `status`),
  KEY `idx_remit_sub_status` (`status`, `paid_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `remittance_allocations` (
  `id` VARCHAR(64) NOT NULL,
  `submission_id` VARCHAR(64) NOT NULL,
  `viewing_fee_record_id` VARCHAR(64) NOT NULL,
  `agent_user_id` VARCHAR(64) NOT NULL DEFAULT '',
  `amount_ghs` DECIMAL(10,2) NOT NULL,
  `created_by` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_remit_alloc_once` (`submission_id`, `viewing_fee_record_id`),
  KEY `idx_remit_alloc_record` (`viewing_fee_record_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rental_commissions` (
  `id` VARCHAR(64) NOT NULL,
  `reference` VARCHAR(64) NOT NULL,
  `property_id` VARCHAR(64) DEFAULT NULL,
  `property_title` VARCHAR(255) NOT NULL DEFAULT '',
  `tenant_user_id` VARCHAR(64) DEFAULT NULL,
  `tenant_name` VARCHAR(255) NOT NULL DEFAULT '',
  `landlord_user_id` VARCHAR(64) DEFAULT NULL,
  `landlord_name` VARCHAR(255) NOT NULL DEFAULT '',
  `agent_user_id` VARCHAR(64) DEFAULT NULL,
  `agent_name` VARCHAR(255) NOT NULL DEFAULT '',
  `rental_reference` VARCHAR(128) NOT NULL DEFAULT '',
  `commission_amount_ghs` DECIMAL(10,2) DEFAULT NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'GHS',
  `basis` VARCHAR(32) NOT NULL DEFAULT 'manual_agreement',
  -- Task 03 update: which policy priced this record.
  --   'agent_commission'     an AGENT listing's commission, split by the
  --                          identity/professional tier (60% / 70%)
  --   'landlord_platform_fee' a LANDLORD listing's 8% platform fee on rent
  --                          actually paid. It belongs entirely to Goodlucks,
  --                          no agent tier is ever applied to it, and it never
  --                          shares a row with an agent commission.
  `policy_type` VARCHAR(32) NOT NULL DEFAULT 'agent_commission',
  -- Landlord platform fee only: the total rent actually paid by the tenant
  -- (the calculation basis) and the percentage applied at that moment.
  `rent_amount_ghs` DECIMAL(12,2) DEFAULT NULL,
  `platform_fee_percent` DECIMAL(5,2) DEFAULT NULL,
  -- Landlord platform fee only: one key per (property, rent payment) so the
  -- same rent payment can never be charged the platform fee twice. NULL for
  -- every agent commission, and MySQL/SQLite both allow many NULLs in a
  -- UNIQUE index.
  `dedupe_key` VARCHAR(191) DEFAULT NULL,
  `policy_id` VARCHAR(64) DEFAULT NULL,
  `policy_snapshot_json` LONGTEXT DEFAULT NULL,
  `policy_snapshot_hash` VARCHAR(64) DEFAULT NULL,
  -- Task 03: the tier split that applied when this commission was priced. These
  -- are frozen at that moment; a later verification change never rewrites them.
  `agent_tier` VARCHAR(32) DEFAULT NULL,
  `agent_share_percent` DECIMAL(5,2) DEFAULT NULL,
  `goodlucks_share_percent` DECIMAL(5,2) DEFAULT NULL,
  `agent_share_ghs` DECIMAL(12,2) DEFAULT NULL,
  `goodlucks_share_ghs` DECIMAL(12,2) DEFAULT NULL,
  `split_snapshot_json` LONGTEXT DEFAULT NULL,
  `split_snapshot_hash` VARCHAR(64) DEFAULT NULL,
  `split_frozen_at` DATETIME DEFAULT NULL,
  `due_date` DATE DEFAULT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
  `notes` TEXT DEFAULT NULL,
  `cancel_reason` TEXT DEFAULT NULL,
  `created_by` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_commission_reference` (`reference`),
  UNIQUE KEY `uniq_commission_dedupe` (`dedupe_key`),
  KEY `idx_commission_status` (`status`, `due_date`),
  KEY `idx_commission_agent` (`agent_user_id`),
  KEY `idx_commission_policy_type` (`policy_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `commission_payments` (
  `id` VARCHAR(64) NOT NULL,
  `commission_id` VARCHAR(64) NOT NULL,
  `amount_ghs` DECIMAL(10,2) NOT NULL,
  `method` VARCHAR(64) NOT NULL DEFAULT 'unknown',
  `reference` VARCHAR(128) NOT NULL DEFAULT '',
  `received_at` DATE NOT NULL,
  `recorded_by` VARCHAR(64) DEFAULT NULL,
  `adjustment_id` VARCHAR(64) DEFAULT NULL,
  `entry_type` VARCHAR(16) NOT NULL DEFAULT 'receipt',
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_commission_payment` (`commission_id`, `received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `financial_adjustments` (
  `id` VARCHAR(64) NOT NULL,
  `subject_type` VARCHAR(32) NOT NULL,
  `subject_id` VARCHAR(64) NOT NULL,
  `kind` VARCHAR(24) NOT NULL,
  `amount_ghs` DECIMAL(10,2) NOT NULL,
  `reason` TEXT NOT NULL,
  `support_reference` VARCHAR(255) NOT NULL DEFAULT '',
  `meta_json` LONGTEXT DEFAULT NULL,
  `created_by` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fin_adj_subject` (`subject_type`, `subject_id`),
  KEY `idx_fin_adj_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 31. Platform settings (Task 03 update)
-- ------------------------------------------------------------
-- Administrator-controlled settings that are not a per-property value and not
-- a versioned fee policy. One row per setting key.
--
-- The only setting in this release is `landlord_viewing_fee_ghs`: the ONE
-- general viewing fee that applies to every landlord-submitted property. It has
-- NO default — when the row is missing the fee is genuinely unconfigured, and
-- the application says so instead of inventing an amount.
CREATE TABLE IF NOT EXISTS `platform_settings` (
  `id` VARCHAR(64) NOT NULL,
  `setting_key` VARCHAR(64) NOT NULL,
  -- Stored as text so the table stays useful for non-numeric settings; the
  -- reading code validates the type it expects.
  `setting_value` VARCHAR(255) NOT NULL,
  -- 'money' | 'string' | 'integer' | 'boolean'
  `value_type` VARCHAR(16) NOT NULL DEFAULT 'string',
  `updated_by` VARCHAR(64) DEFAULT NULL,
  `updated_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_platform_setting_key` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Task 07: Blog & Learning Centre
--
-- Editorial content lives in these four tables. The property showcase is a
-- REFERENCE table (`blog_post_properties`), never a copy of the listing: an
-- article renders whatever the property record says at the moment it is read,
-- so a changed price or a rented listing is never stale in an article.
-- ============================================================

CREATE TABLE IF NOT EXISTS `blog_categories` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NOT NULL DEFAULT '',
  -- Ascending display order; categories with the same value sort by name.
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_by` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_blog_category_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blog_posts` (
  `id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `subtitle` VARCHAR(400) NOT NULL DEFAULT '',
  `slug` VARCHAR(160) NOT NULL,
  `featured_image` VARCHAR(500) NOT NULL DEFAULT '',
  `featured_image_alt` VARCHAR(300) NOT NULL DEFAULT '',
  -- Sanitised article HTML. Only a small allowlist of tags survives
  -- `blog_sanitize_html()`; a checkbox in the editor is never the guard.
  `content_html` LONGTEXT DEFAULT NULL,
  `category_id` VARCHAR(64) DEFAULT NULL,
  -- Comma-separated display tags (free text, sanitised on write).
  `tags` VARCHAR(500) NOT NULL DEFAULT '',
  -- The same tags lower-cased and comma-padded (",rent,legon,"), so a tag
  -- filter is a plain LIKE that behaves identically on MySQL and SQLite.
  `tags_search` VARCHAR(600) NOT NULL DEFAULT '',
  -- The administrator who wrote it: real account id + the name it showed at
  -- save time, so the byline is never invented.
  `author_user_id` VARCHAR(64) NOT NULL,
  `author_name` VARCHAR(255) NOT NULL DEFAULT '',
  -- draft | scheduled | published | unpublished
  `status` VARCHAR(24) NOT NULL DEFAULT 'draft',
  -- When a scheduled post goes live. A scheduled post is public only once this
  -- moment has passed; nothing else makes it public.
  `publish_at` DATETIME DEFAULT NULL,
  -- When it first became public. NULL until it has been published.
  `published_at` DATETIME DEFAULT NULL,
  `seo_title` VARCHAR(200) NOT NULL DEFAULT '',
  `seo_description` VARCHAR(320) NOT NULL DEFAULT '',
  `is_featured` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_blog_post_slug` (`slug`),
  KEY `idx_blog_post_status` (`status`, `publish_at`),
  KEY `idx_blog_post_category` (`category_id`, `status`),
  KEY `idx_blog_post_featured` (`is_featured`, `status`),
  KEY `idx_blog_post_author` (`author_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `blog_post_properties` (
  `id` VARCHAR(64) NOT NULL,
  `post_id` VARCHAR(64) NOT NULL,
  -- The listing's id. No copy of its title, rent or photos is stored here.
  `property_id` VARCHAR(64) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  -- hide_unavailable | show_status
  `display_rule` VARCHAR(24) NOT NULL DEFAULT 'show_status',
  -- Optional one-line editorial note shown with the card ("Refurbished in 2025").
  `note` VARCHAR(300) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_blog_post_property` (`post_id`, `property_id`),
  KEY `idx_blog_post_property_order` (`post_id`, `sort_order`),
  KEY `idx_blog_post_property_property` (`property_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_templates` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  -- The transactional email this template adds content to (see
  -- `email_template_targets()`): enquiry_confirmation, viewing_update, …
  `target_type` VARCHAR(64) NOT NULL,
  `body_html` LONGTEXT DEFAULT NULL,
  -- active | inactive. An inactive template is stored but never sent.
  `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  `created_by` VARCHAR(64) DEFAULT NULL,
  `updated_by` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_email_template_type` (`target_type`, `status`),
  KEY `idx_email_template_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
