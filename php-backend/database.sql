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
  `views_count` INT NOT NULL DEFAULT 0,
  `enquiries_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_prop_status` (`status`),
  KEY `idx_prop_landlord` (`landlord_id`),
  KEY `idx_prop_city` (`city`),
  KEY `idx_prop_rent` (`rent_ghs`),
  KEY `idx_prop_created` (`created_at`)
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
  `assigned_agent` VARCHAR(255) DEFAULT 'Goodlucks Field Agent',
  `status` VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  `viewing_fee_paid` TINYINT(1) NOT NULL DEFAULT 0,
  `fee_amount_ghs` DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  `outcome_notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vs_property` (`property_id`),
  KEY `idx_vs_status` (`status`),
  KEY `idx_vs_email` (`tenant_email`)
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
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tenancy_agreements` (
  `id` VARCHAR(64) NOT NULL,
  `property_id` VARCHAR(64) DEFAULT NULL,
  `property_title` VARCHAR(255) NOT NULL,
  `property_address` VARCHAR(255) NOT NULL,
  `city` VARCHAR(100) DEFAULT 'Accra',
  `landlord_name` VARCHAR(255) NOT NULL,
  `landlord_phone` VARCHAR(64) NOT NULL,
  `landlord_ghana_card` VARCHAR(64) DEFAULT NULL,
  `tenant_name` VARCHAR(255) NOT NULL,
  `tenant_phone` VARCHAR(64) NOT NULL,
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
  `landlord_name` VARCHAR(255) NOT NULL,
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
