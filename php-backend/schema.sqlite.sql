-- ============================================================
-- Goodlucks Homes - SQLite schema (LOCAL DEVELOPMENT & TESTS ONLY)
--
-- Produced to mirror database.sql (MySQL) column for column.
-- The production database on cPanel is MySQL.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tenant',
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  avatar TEXT,
  address TEXT,
  bio TEXT,
  company TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  preferred_locations TEXT,
  budget_min REAL,
  budget_max REAL,
  preferred_bedrooms INTEGER,
  additional_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  landlord_id TEXT,
  landlord_name TEXT,
  landlord_company TEXT,
  is_landlord_verified INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Accra',
  rent_ghs REAL NOT NULL,
  bedrooms INTEGER NOT NULL DEFAULT 0,
  bathrooms INTEGER NOT NULL DEFAULT 0,
  property_type TEXT NOT NULL DEFAULT 'Apartment',
  status TEXT NOT NULL DEFAULT 'pending',
  images TEXT NOT NULL,
  description TEXT NOT NULL,
  amenities TEXT,
  nearby_places TEXT,
  availability TEXT DEFAULT 'Available Now',
  featured INTEGER NOT NULL DEFAULT 0,
  views_count INTEGER NOT NULL DEFAULT 0,
  enquiries_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_prop_status ON properties (status);
CREATE INDEX IF NOT EXISTS idx_prop_landlord ON properties (landlord_id);
CREATE INDEX IF NOT EXISTS idx_prop_created ON properties (created_at);

CREATE TABLE IF NOT EXISTS tenant_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  tenant_name TEXT NOT NULL,
  tenant_phone TEXT NOT NULL,
  tenant_email TEXT NOT NULL,
  preferred_locations TEXT NOT NULL,
  budget_min REAL NOT NULL DEFAULT 0,
  budget_max REAL NOT NULL DEFAULT 0,
  bedrooms INTEGER NOT NULL DEFAULT 1,
  bathrooms INTEGER NOT NULL DEFAULT 1,
  property_type TEXT NOT NULL DEFAULT 'Apartment',
  move_in_date TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  matched_property_ids TEXT,
  assigned_agent TEXT DEFAULT 'Goodlucks Intermediary Desk',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS viewing_schedules (
  id TEXT PRIMARY KEY,
  tenant_request_id TEXT,
  tenant_name TEXT NOT NULL,
  tenant_phone TEXT NOT NULL,
  tenant_email TEXT,
  property_id TEXT,
  property_title TEXT NOT NULL,
  property_location TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  assigned_agent TEXT DEFAULT 'Goodlucks Field Agent',
  status TEXT NOT NULL DEFAULT 'scheduled',
  viewing_fee_paid INTEGER NOT NULL DEFAULT 0,
  fee_amount_ghs REAL NOT NULL DEFAULT 100.0,
  outcome_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  property_title TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'contact_form',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_drop_alerts (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  property_title TEXT NOT NULL,
  property_location TEXT NOT NULL,
  current_rent_ghs REAL NOT NULL DEFAULT 0,
  target_rent_ghs REAL,
  email TEXT NOT NULL,
  name TEXT,
  notify_on_any_drop INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS search_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  location TEXT DEFAULT 'All',
  property_type TEXT DEFAULT 'All',
  bedrooms INTEGER,
  max_rent_ghs REAL NOT NULL DEFAULT 0,
  search_query TEXT,
  frequency TEXT NOT NULL DEFAULT 'instant',
  channels TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_properties (
  user_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, property_id)
);

CREATE TABLE IF NOT EXISTS tenancy_agreements (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  property_title TEXT NOT NULL,
  property_address TEXT NOT NULL,
  city TEXT DEFAULT 'Accra',
  landlord_name TEXT NOT NULL,
  landlord_phone TEXT NOT NULL,
  landlord_ghana_card TEXT,
  tenant_name TEXT NOT NULL,
  tenant_phone TEXT NOT NULL,
  tenant_ghana_card TEXT,
  monthly_rent_ghs REAL NOT NULL,
  duration_months INTEGER NOT NULL DEFAULT 12,
  total_rent_ghs REAL NOT NULL,
  security_deposit_ghs REAL NOT NULL DEFAULT 0,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  notice_period_months INTEGER NOT NULL DEFAULT 3,
  utilities_responsibility TEXT,
  landlord_signed INTEGER NOT NULL DEFAULT 0,
  tenant_signed INTEGER NOT NULL DEFAULT 0,
  landlord_signature_date TEXT,
  tenant_signature_date TEXT,
  witness_name TEXT DEFAULT 'Goodlucks Legal Intermediary',
  status TEXT NOT NULL DEFAULT 'pending_signatures',
  verification_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  landlord_user_id TEXT,
  tenant_user_id TEXT
);

CREATE TABLE IF NOT EXISTS rent_receipts (
  id TEXT PRIMARY KEY,
  receipt_no TEXT NOT NULL UNIQUE,
  property_title TEXT NOT NULL,
  property_address TEXT NOT NULL,
  tenant_name TEXT NOT NULL,
  tenant_phone TEXT,
  landlord_name TEXT NOT NULL,
  amount_ghs REAL NOT NULL,
  amount_in_words TEXT,
  payment_purpose TEXT,
  payment_method TEXT DEFAULT 'Cash',
  transaction_ref TEXT,
  payment_date TEXT NOT NULL,
  issued_by TEXT DEFAULT 'Goodlucks Homes Intermediary Desk',
  verification_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  landlord_user_id TEXT,
  tenant_user_id TEXT
);

CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  type TEXT NOT NULL,
  body_preview TEXT,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'queued'
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS page_views (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pv_created ON page_views (created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  rl_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (rl_key, window_start)
);

-- ============================================================
-- SEED DATA - mirrors the production listing seed
-- ============================================================

INSERT INTO `users` (`id`, `email`, `name`, `role`, `phone`, `avatar`, `address`, `is_verified`) VALUES
('user-tenant-1', 'tenant@goodlucks.com', 'Kofi Mensah', 'tenant', '+233 24 412 3456', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80', 'Cantonments, Accra, Ghana', 1),
('user-landlord-1', 'landlord@goodlucks.com', 'Abena Osei', 'landlord', '+233 20 899 7711', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80', 'East Legon, Accra, Ghana', 1),
('user-admin-1', 'admin@goodlucks.com', 'Goodlucks Admin', 'admin', '+233 30 299 8800', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80', 'Goodlucks HQ, Ridge, Accra', 1);

INSERT INTO `properties` (`id`, `landlord_id`, `landlord_name`, `landlord_company`, `title`, `location`, `city`, `rent_ghs`, `bedrooms`, `bathrooms`, `property_type`, `status`, `images`, `description`, `amenities`, `availability`, `featured`, `views_count`, `enquiries_count`) VALUES
('prop-1', 'user-landlord-1', 'Abena Osei', 'Prime Haven Properties Ltd', 'The Pearl Executive 3-Bedroom Apartment', 'Cantonments, Accra', 'Accra', 6500.00, 3, 3, 'Apartment', 'active', 
 '["https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80", "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80", "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1000&q=80"]', 
 'A masterpiece of modern West African architecture located in the elite diplomatic precinct of Cantonments. Features floor-to-ceiling soundproof glass, ultra-sleek fitted Italian kitchen, continuous solar back-up power, olympic-size swimming pool, and 24/7 armed private security guards.', 
 '["24/7 Standby Generator", "Swimming Pool", "Fitted Kitchen", "Air Conditioning", "Gated Security", "Balcony", "Water Reservoir (Polytank)", "Electric Fencing", "Gym"]', 
 'Available Now', 1, 412, 18),

('prop-2', 'user-landlord-1', 'Abena Osei', 'Prime Haven Properties Ltd', 'Serene Oasis 4-Bedroom Gated Townhouse', 'East Legon, Accra', 'Accra', 9200.00, 4, 4, 'Townhouse', 'active', 
 '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80", "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=1000&q=80", "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?auto=format&fit=crop&w=1000&q=80"]', 
 'Opulent 4-bedroom contemporary townhouse in the heartbeat of East Legon near Lagos Avenue. Boasts all en-suite bedrooms, imported marble flooring, an expansive private terrace, modern maid room (boys quarters), and dedicated automated borehole water treatment plant.', 
 '["24/7 Standby Generator", "Gated Security", "Boys Quarters", "Water Reservoir (Polytank)", "Electric Fencing", "Air Conditioning", "Fitted Kitchen", "CCTV Cameras", "Fiber Internet Ready"]', 
 'Available Now', 1, 620, 29),

('prop-3', 'user-landlord-1', 'Abena Osei', 'Prime Haven Properties Ltd', 'Airport Heights Luxury 2-Bedroom Haven', 'Airport Residential Area, Accra', 'Accra', 7800.00, 2, 2, 'Apartment', 'active', 
 '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1000&q=80", "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1000&q=80"]', 
 'Sophisticated boutique residence nestled in tranquil Airport Residential Area. Perfect for corporate expatriates and discerning professionals seeking peaceful living within minutes of Kotoka International Airport and top international schools.', 
 '["Swimming Pool", "Gym", "24/7 Standby Generator", "Elevator / Lift", "Underground Parking", "Concierge Service", "Air Conditioning", "Fitted Kitchen"]', 
 'Available from Sept 1', 1, 389, 14),

('prop-4', 'user-landlord-1', 'Abena Osei', 'Prime Haven Properties Ltd', 'Urban Chic 1-Bedroom Designer Studio', 'Dzorwulu, Accra', 'Accra', 3200.00, 1, 1, 'Studio', 'active', 
 '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1000&q=80", "https://images.unsplash.com/photo-1502005229762-ee1b2b81e4b9?auto=format&fit=crop&w=1000&q=80"]', 
 'Smart minimalist studio flat curated with designer finishes, ambient lighting, high-speed fiber internet, and sleek space-saving architecture. Located 3 minutes stroll from Perez Chapel and Bloomsbury.', 
 '["Air Conditioning", "Fitted Kitchen", "24/7 Standby Generator", "Gated Security", "Water Reservoir (Polytank)", "Balcony"]', 
 'Available Now', 0, 510, 22);

CREATE TABLE IF NOT EXISTS `alert_deliveries` (
  `id` TEXT NOT NULL,
  `alert_type` TEXT NOT NULL,
  `alert_id` TEXT NOT NULL,
  `property_id` TEXT NOT NULL,
  `context` TEXT NOT NULL DEFAULT '',
  `email` TEXT NOT NULL,
  `sent_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE (`alert_type`, `alert_id`, `property_id`, `context`)
);

CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` TEXT NOT NULL,
  `user_id` TEXT NOT NULL,
  `token_hash` TEXT NOT NULL,
  `expires_at` TEXT NOT NULL,
  `used_at` TEXT DEFAULT NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE (`token_hash`)
);

CREATE TABLE IF NOT EXISTS `submission_dedupe` (
  `fingerprint` TEXT NOT NULL,
  `resource_type` TEXT NOT NULL,
  `resource_id` TEXT NOT NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fingerprint`)
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'notification',
  body_preview TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT NOT NULL,
  email_log_id TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_due ON email_outbox (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  context_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action);
