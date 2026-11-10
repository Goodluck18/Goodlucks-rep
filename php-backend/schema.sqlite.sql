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
  -- Task 03: the official Ghana Card name supplied at registration (a claim,
  -- never a verification). NULL for existing accounts, which are not locked out.
  official_name TEXT,
  role TEXT NOT NULL DEFAULT 'tenant',
  -- Upgrade 2 correction: an Agent/Landlord account chooses its professional
  -- classification during verification. 'pending' means the account registered
  -- through the Agent/Landlord group and has not chosen yet; 'agent'/'landlord'
  -- record the choice; NULL is every tenant and every account created before
  -- this column existed (those are classified by their role, so nobody is sent
  -- back through the choice).
  provider_category TEXT,
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
  -- Increment D: least-privilege staff capabilities, both default-deny.
  can_review_verifications INTEGER NOT NULL DEFAULT 0,
  can_access_identity_documents INTEGER NOT NULL DEFAULT 0,
  -- Increment E: financial-policy capabilities (manage / approve), both default-deny.
  can_manage_fee_policies INTEGER NOT NULL DEFAULT 0,
  can_approve_fee_policies INTEGER NOT NULL DEFAULT 0,
  -- Increment F: exceptional, audited viewing corrections. Default 0.
  can_correct_viewings INTEGER NOT NULL DEFAULT 0,
  -- Increment G: reading financial records and moving money are separate powers.
  can_view_finance INTEGER NOT NULL DEFAULT 0,
  can_confirm_remittances INTEGER NOT NULL DEFAULT 0,
  -- Upgrade 2: the primary platform administrator. Assigned only from the
  -- server console (php-backend/assign_primary_admin.php); never by HTTP.
  is_primary_admin INTEGER NOT NULL DEFAULT 0,
  -- Upgrade 2 Phase 3: the user directory and bulk email are their own powers,
  -- granted from the server console like the other capabilities. Default deny.
  can_manage_users INTEGER NOT NULL DEFAULT 0,
  can_view_user_activity INTEGER NOT NULL DEFAULT 0,
  can_send_bulk_email INTEGER NOT NULL DEFAULT 0,
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
  submitted_by_user_id TEXT,
  submitted_by_role TEXT,
  landlord_authority_state TEXT NOT NULL DEFAULT 'not_applicable',
  -- Increment F: the landlord contact an agent claimed, for staff review only.
  landlord_contact_claimed TEXT,
  -- Parity with MySQL: a listing is never verified by default (Increment B).
  is_landlord_verified INTEGER NOT NULL DEFAULT 0,
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
  -- Task 03: this property's OWN approved viewing fee and viewing terms. NULL
  -- means no approved viewing fee — there is no platform-wide default.
  viewing_fee_ghs REAL,
  viewing_terms_json TEXT,
  viewing_terms_state TEXT NOT NULL DEFAULT 'not_set',
  viewing_terms_updated_at TEXT,
  viewing_terms_approved_by TEXT,
  -- Upgrade 2 (B2): optional coordinates; proximity is scored from area_adjacency.
  latitude REAL,
  longitude REAL,
  -- Upgrade 2 (C5): structured specs and canonical amenities. The original free
  -- text is kept in amenities_note so an old listing still reads as it was
  -- written; `amenities` becomes a JSON array of canonical keys.
  toilets INTEGER,
  kitchens INTEGER,
  furnishing TEXT,
  amenities_note TEXT,
  -- Upgrade 2 (C4): a YouTube/TikTok/Facebook video, stored as the provider we
  -- recognised plus the canonical URL. Nothing is ever rendered from raw input.
  video_provider TEXT,
  video_url TEXT,
  -- Upgrade 2 (C6): the provider's own expectation, never a platform fee and
  -- never used in a calculation.
  provider_commission_percent REAL,
  provider_commission_note TEXT,
  views_count INTEGER NOT NULL DEFAULT 0,
  enquiries_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_prop_status ON properties (status);
CREATE INDEX IF NOT EXISTS idx_prop_landlord ON properties (landlord_id);
CREATE INDEX IF NOT EXISTS idx_prop_submitted_by ON properties (submitted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_prop_created ON properties (created_at);

-- ---------------------------------------------------------------------------
-- Task 03: property-specific viewing fee / terms change requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS property_viewing_fee_changes (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_by_role TEXT NOT NULL DEFAULT '',
  proposed_fee_ghs REAL NOT NULL,
  proposed_terms_json TEXT,
  previous_fee_ghs REAL,
  previous_terms_json TEXT,
  -- pending_review | approved | rejected
  status TEXT NOT NULL DEFAULT 'pending_review',
  note TEXT,
  decision_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  applied_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_vfc_property ON property_viewing_fee_changes (property_id, status);
CREATE INDEX IF NOT EXISTS idx_vfc_status ON property_viewing_fee_changes (status, created_at);

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
  assigned_agent TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled',
  viewing_fee_paid INTEGER NOT NULL DEFAULT 0,
  -- Task 03: copied from the property's approved viewing fee at request time.
  -- 0 means no viewing fee applies; there is no universal default.
  fee_amount_ghs REAL NOT NULL DEFAULT 0.0,
  viewing_terms_snapshot_json TEXT,
  outcome_notes TEXT,
  -- Increment F: a row is a request first and an appointment only once a slot
  -- is agreed (confirmed_at). See docs/INCREMENT_F_REPORT.md.
  tenant_user_id TEXT,
  agent_user_id TEXT,
  landlord_user_id TEXT,
  request_type TEXT NOT NULL DEFAULT 'viewing',
  preferred_date TEXT,
  preferred_time TEXT,
  confirmed_at TEXT,
  confirmed_by TEXT,
  cancel_reason TEXT,
  cancelled_by TEXT,
  cancelled_at TEXT,
  completed_at TEXT,
  completed_by TEXT,
  agent_notes TEXT,
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vs_agent ON viewing_schedules (agent_user_id, status);
CREATE INDEX IF NOT EXISTS idx_vs_tenant ON viewing_schedules (tenant_user_id);
CREATE INDEX IF NOT EXISTS idx_vs_slot ON viewing_schedules (date, status);

-- ---------------------------------------------------------------------------
-- Increment F: viewing lifecycle history (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viewing_events (
  id TEXT PRIMARY KEY,
  viewing_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL DEFAULT '',
  previous_date TEXT,
  previous_time TEXT,
  new_date TEXT,
  new_time TEXT,
  note TEXT,
  actor_id TEXT,
  actor_role TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ve_viewing ON viewing_events (viewing_id, created_at);

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

-- RETIRED (Increment A): tenancy-agreement drafting, signing and emailing were
-- removed from the product. The table is kept so no destructive migration is
-- needed; it is no longer written to or read by the application.
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

-- Increment B: viewing-fee ledger (see database.sql for the authoritative
-- definitions and the accounting rules).

-- Upgrade 2 (B2): administrator-maintained proximity between areas. One row per
-- undirected pair, so A->B and B->A can never disagree.
-- Upgrade 2 Phase 5 (B6): approved tenant-contact disclosure, one row per
-- (viewing, provider). Contact is serialised only while approved and unexpired.
CREATE TABLE IF NOT EXISTS contact_disclosures (
  id TEXT PRIMARY KEY,
  viewing_id TEXT NOT NULL,
  property_id TEXT,
  property_title TEXT NOT NULL DEFAULT '',
  provider_user_id TEXT NOT NULL,
  provider_name TEXT NOT NULL DEFAULT '',
  tenant_user_id TEXT,
  tenant_name TEXT NOT NULL DEFAULT '',
  requested_by TEXT,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cd_viewing_provider ON contact_disclosures (viewing_id, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_cd_status ON contact_disclosures (status, created_at);
CREATE INDEX IF NOT EXISTS idx_cd_tenant ON contact_disclosures (tenant_user_id);

CREATE TABLE IF NOT EXISTS area_adjacency (
  id TEXT PRIMARY KEY,
  area_a TEXT NOT NULL,
  area_b TEXT NOT NULL,
  band INTEGER NOT NULL DEFAULT 2,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_area_pair ON area_adjacency (area_a, area_b);
CREATE INDEX IF NOT EXISTS idx_area_second ON area_adjacency (area_b);

CREATE TABLE IF NOT EXISTS fee_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  description TEXT,
  category TEXT NOT NULL DEFAULT 'viewing_fee',
  tier TEXT NOT NULL DEFAULT 'standard',
  calculation_method TEXT NOT NULL DEFAULT 'percentage',
  currency TEXT NOT NULL DEFAULT 'GHS',
  agent_share_percent REAL NOT NULL DEFAULT 0,
  goodlucks_share_percent REAL NOT NULL DEFAULT 0,
  agent_share_fixed_ghs REAL,
  goodlucks_share_fixed_ghs REAL,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_policy_id TEXT,
  effective_from TEXT,
  effective_to TEXT,
  created_by TEXT,
  submitted_by TEXT,
  submitted_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  -- Upgrade 2: 1 only when the primary administrator approved its own policy.
  self_approved INTEGER NOT NULL DEFAULT 0,
  self_approved_at TEXT,
  rejected_by TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  activated_by TEXT,
  activated_at TEXT,
  deactivated_by TEXT,
  deactivated_at TEXT,
  deactivation_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_fee_policy_status ON fee_policies (status, tier);
CREATE INDEX IF NOT EXISTS idx_fee_policy_tier_category ON fee_policies (tier, category, status);
CREATE INDEX IF NOT EXISTS idx_fee_policy_dates ON fee_policies (effective_from, effective_to);

CREATE TABLE IF NOT EXISTS viewing_fee_records (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  viewing_id TEXT,
  property_id TEXT,
  property_title TEXT NOT NULL DEFAULT '',
  agent_name TEXT NOT NULL DEFAULT '',
  agent_user_id TEXT,
  fee_total_ghs REAL,
  -- Task 03 update: agent_collection | landlord_platform_fee
  fee_source TEXT NOT NULL DEFAULT 'agent_collection',
  collection_state TEXT NOT NULL DEFAULT 'reported',
  share_basis TEXT NOT NULL DEFAULT 'not_set',
  goodlucks_share_ghs REAL,
  agent_share_ghs REAL,
  policy_snapshot_json TEXT,
  policy_id TEXT,
  policy_snapshot_id TEXT,
  agent_tier_at_snapshot TEXT,
  recorded_by TEXT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vfr_viewing ON viewing_fee_records (viewing_id);
CREATE INDEX IF NOT EXISTS idx_vfr_state ON viewing_fee_records (collection_state);

CREATE TABLE IF NOT EXISTS fee_remittances (
  id TEXT PRIMARY KEY,
  viewing_fee_record_id TEXT NOT NULL,
  amount_ghs REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'unknown',
  reference TEXT,
  received_at TEXT NOT NULL,
  recorded_by TEXT,
  notes TEXT,
  -- Increment G: which agent submission and allocation produced this receipt,
  -- and whether the row is a receipt or a linked reversal. Reversals are
  -- negative rows: nothing is ever edited or deleted.
  submission_id TEXT,
  allocation_id TEXT,
  entry_type TEXT NOT NULL DEFAULT 'receipt',
  adjustment_id TEXT,
  -- Increment G audit remediation R3: the receipt this row reverses. Cumulative
  -- reversals are measured against this receipt only, never across the whole
  -- obligation, so reversing one receipt cannot consume another's headroom.
  reversal_of_receipt_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fee_remit_record ON fee_remittances (viewing_fee_record_id);
CREATE INDEX IF NOT EXISTS idx_fee_remit_received ON fee_remittances (received_at);

-- Increment C: agent account profiles. Deny-by-default: account_status starts
-- at 'pending_review' and can_submit_listings at 0.
CREATE TABLE IF NOT EXISTS agent_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  agency_name TEXT NOT NULL DEFAULT '',
  operating_city TEXT NOT NULL DEFAULT '',
  account_status TEXT NOT NULL DEFAULT 'pending_review',
  can_submit_listings INTEGER NOT NULL DEFAULT 0,
  status_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_status ON agent_profiles (account_status);

-- Increment D: identity verification (identity only, never ownership).
CREATE TABLE IF NOT EXISTS identity_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE RESTRICT,
  subject_role TEXT NOT NULL DEFAULT 'agent',
  legal_name TEXT NOT NULL DEFAULT '',
  document_type TEXT NOT NULL DEFAULT 'ghana_card',
  document_number_masked TEXT NOT NULL DEFAULT '',
  document_number_encrypted TEXT,
  document_number_retained INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_submitted',
  submitted_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  decision_note TEXT,
  retention_purge_after TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_identity_status ON identity_verifications (status);

-- Increment D: professional authorisation, kept separate from identity.
CREATE TABLE IF NOT EXISTS professional_authorisations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE RESTRICT,
  licence_number TEXT NOT NULL DEFAULT '',
  issuing_authority TEXT NOT NULL DEFAULT '',
  licence_category TEXT NOT NULL DEFAULT '',
  issue_date TEXT,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'not_submitted',
  registry_checked INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  decision_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_professional_status ON professional_authorisations (status);

-- Increment D: private document metadata (files live in the private store).
CREATE TABLE IF NOT EXISTS verification_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  scope TEXT NOT NULL DEFAULT 'identity',
  kind TEXT NOT NULL DEFAULT 'document_front',
  storage_id TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT,
  -- Task 03: per-document reviewer outcome (pending | accepted | rejected).
  review_status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_vdoc_user ON verification_documents (user_id);
CREATE INDEX IF NOT EXISTS idx_vdoc_scope ON verification_documents (user_id, scope);

-- Increment D: append-only decision history.
CREATE TABLE IF NOT EXISTS verification_decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  scope TEXT NOT NULL DEFAULT 'identity',
  decision TEXT NOT NULL,
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL,
  note TEXT,
  reviewer_id TEXT,
  reviewer_name TEXT,
  decided_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vdecision_user ON verification_decisions (user_id, scope);

-- ---------------------------------------------------------------------------
-- Increment E: immutable fee-policy snapshots (one row per priced transaction)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_policy_snapshots (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  policy_name TEXT NOT NULL DEFAULT '',
  policy_version INTEGER NOT NULL DEFAULT 1,
  policy_category TEXT NOT NULL DEFAULT 'viewing_fee',
  agent_tier TEXT NOT NULL,
  subject_user_id TEXT,
  transaction_type TEXT NOT NULL DEFAULT 'viewing_fee',
  transaction_id TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  calculation_method TEXT NOT NULL DEFAULT 'percentage',
  fee_total_ghs REAL NOT NULL,
  agent_share_percent REAL NOT NULL DEFAULT 0,
  goodlucks_share_percent REAL NOT NULL DEFAULT 0,
  agent_share_fixed_ghs REAL,
  goodlucks_share_fixed_ghs REAL,
  agent_entitlement_ghs REAL NOT NULL,
  goodlucks_entitlement_ghs REAL NOT NULL,
  policy_status_at_use TEXT NOT NULL DEFAULT 'active',
  policy_effective_from TEXT,
  policy_effective_to TEXT,
  policy_approved_by TEXT,
  policy_approved_at TEXT,
  transaction_at TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL DEFAULT '',
  snapshot_at TEXT NOT NULL,
  created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fps_transaction ON fee_policy_snapshots (transaction_type, transaction_id);
CREATE INDEX IF NOT EXISTS idx_fps_policy ON fee_policy_snapshots (policy_id);
CREATE INDEX IF NOT EXISTS idx_fps_subject ON fee_policy_snapshots (subject_user_id);

-- ---------------------------------------------------------------------------
-- Increment E: append-only fee-policy history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_policy_events (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT NOT NULL DEFAULT '',
  to_status TEXT NOT NULL DEFAULT '',
  note TEXT,
  -- Upgrade 2 Phase 4: the values that changed, so the trail shows old -> new
  -- rather than only the fact that something was edited.
  changes_json TEXT,
  actor_id TEXT,
  actor_name TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fpe_policy ON fee_policy_events (policy_id, created_at);


-- ---------------------------------------------------------------------------
-- Increment G: agent remittances, financial reconciliation, rental commissions.
--
-- Three rules shape these tables:
--   1. A submission is a CLAIM. It is not revenue until an authorised
--      administrator confirms the money actually arrived.
--   2. Confirmed money is applied to a specific viewing-fee obligation through
--      an allocation, so nothing is counted twice and partial settlement is
--      visible per obligation.
--   3. Rental commissions are a separate workflow from viewing fees. Nothing
--      here generates a commission automatically.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS remittance_submissions (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  agent_user_id TEXT NOT NULL,
  agent_name TEXT NOT NULL DEFAULT '',
  amount_ghs REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  method TEXT NOT NULL DEFAULT 'unknown',
  payment_reference TEXT NOT NULL DEFAULT '',
  paid_at TEXT NOT NULL,
  evidence_reference TEXT NOT NULL DEFAULT '',
  -- submitted | confirmed | rejected | disputed
  status TEXT NOT NULL DEFAULT 'submitted',
  -- What the finance team actually confirmed receiving. NULL until confirmed;
  -- never assumed equal to the claimed amount.
  confirmed_ghs REAL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  requested_allocations_json TEXT,
  decision_reason TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_remit_sub_agent ON remittance_submissions (agent_user_id, status);
CREATE INDEX IF NOT EXISTS idx_remit_sub_status ON remittance_submissions (status, paid_at);

CREATE TABLE IF NOT EXISTS remittance_allocations (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  viewing_fee_record_id TEXT NOT NULL,
  agent_user_id TEXT NOT NULL DEFAULT '',
  amount_ghs REAL NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_remit_alloc_once ON remittance_allocations (submission_id, viewing_fee_record_id);
CREATE INDEX IF NOT EXISTS idx_remit_alloc_record ON remittance_allocations (viewing_fee_record_id);

CREATE TABLE IF NOT EXISTS rental_commissions (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  property_id TEXT,
  property_title TEXT NOT NULL DEFAULT '',
  tenant_user_id TEXT,
  tenant_name TEXT NOT NULL DEFAULT '',
  landlord_user_id TEXT,
  landlord_name TEXT NOT NULL DEFAULT '',
  agent_user_id TEXT,
  agent_name TEXT NOT NULL DEFAULT '',
  rental_reference TEXT NOT NULL DEFAULT '',
  commission_amount_ghs REAL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  -- manual_agreement | policy_snapshot
  basis TEXT NOT NULL DEFAULT 'manual_agreement',
  -- Task 03 update: agent_commission | landlord_platform_fee. The two policies
  -- never share a row; a landlord row carries no agent tier at all.
  policy_type TEXT NOT NULL DEFAULT 'agent_commission',
  -- Landlord platform fee only: the rent actually paid (the calculation basis)
  -- and the percentage applied at that moment.
  rent_amount_ghs REAL,
  platform_fee_percent REAL,
  -- Landlord platform fee only: one key per (property, rent payment) so the same
  -- rent payment cannot be charged twice. NULL for agent commissions.
  dedupe_key TEXT,
  policy_id TEXT,
  policy_snapshot_json TEXT,
  policy_snapshot_hash TEXT,
  -- Task 03: tier split frozen when the commission was priced.
  agent_tier TEXT,
  agent_share_percent REAL,
  goodlucks_share_percent REAL,
  agent_share_ghs REAL,
  goodlucks_share_ghs REAL,
  split_snapshot_json TEXT,
  split_snapshot_hash TEXT,
  split_frozen_at TEXT,
  due_date TEXT,
  -- draft | awaiting_agreement | agreed | due | partially_paid | paid |
  -- disputed | cancelled | corrected
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  cancel_reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_commission_status ON rental_commissions (status, due_date);
CREATE INDEX IF NOT EXISTS idx_commission_agent ON rental_commissions (agent_user_id);
CREATE INDEX IF NOT EXISTS idx_commission_policy_type ON rental_commissions (policy_type);
-- One platform fee per rent payment. SQLite allows many NULLs in a unique index,
-- so agent commissions are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_commission_dedupe ON rental_commissions (dedupe_key);

CREATE TABLE IF NOT EXISTS commission_payments (
  id TEXT PRIMARY KEY,
  commission_id TEXT NOT NULL,
  amount_ghs REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'unknown',
  reference TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL,
  recorded_by TEXT,
  adjustment_id TEXT,
  -- receipt | reversal
  entry_type TEXT NOT NULL DEFAULT 'receipt',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_commission_payment ON commission_payments (commission_id, received_at);

CREATE TABLE IF NOT EXISTS financial_adjustments (
  id TEXT PRIMARY KEY,
  -- viewing_fee_remittance | rental_commission
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  -- reversal | correction
  kind TEXT NOT NULL,
  amount_ghs REAL NOT NULL,
  reason TEXT NOT NULL,
  support_reference TEXT NOT NULL DEFAULT '',
  meta_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fin_adj_subject ON financial_adjustments (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_fin_adj_created ON financial_adjustments (created_at);

-- ------------------------------------------------------------
-- Platform settings (Task 03 update)
-- ------------------------------------------------------------
-- One row per administrator-controlled setting. `landlord_viewing_fee_ghs` is
-- the general landlord viewing fee; it has NO default value, so a missing row
-- means "not configured" rather than an invented amount.
CREATE TABLE IF NOT EXISTS platform_settings (
  id TEXT PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  -- money | string | integer | boolean
  value_type TEXT NOT NULL DEFAULT 'string',
  updated_by TEXT,
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Task 07: Blog & Learning Centre (mirrors database.sql)
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL UNIQUE,
  featured_image TEXT NOT NULL DEFAULT '',
  featured_image_alt TEXT NOT NULL DEFAULT '',
  content_html TEXT,
  category_id TEXT,
  tags TEXT NOT NULL DEFAULT '',
  -- lower-cased, comma-padded tags for portable tag filtering
  tags_search TEXT NOT NULL DEFAULT '',
  author_user_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  -- draft | scheduled | published | unpublished
  status TEXT NOT NULL DEFAULT 'draft',
  publish_at TEXT,
  published_at TEXT,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_blog_post_status ON blog_posts (status, publish_at);
CREATE INDEX IF NOT EXISTS idx_blog_post_category ON blog_posts (category_id, status);
CREATE INDEX IF NOT EXISTS idx_blog_post_featured ON blog_posts (is_featured, status);
CREATE INDEX IF NOT EXISTS idx_blog_post_author ON blog_posts (author_user_id);

CREATE TABLE IF NOT EXISTS blog_post_properties (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  display_rule TEXT NOT NULL DEFAULT 'show_status',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_blog_post_property ON blog_post_properties (post_id, property_id);
CREATE INDEX IF NOT EXISTS idx_blog_post_property_order ON blog_post_properties (post_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_blog_post_property_property ON blog_post_properties (property_id);

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target_type TEXT NOT NULL,
  body_html TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_template_type ON email_templates (target_type, status);
CREATE INDEX IF NOT EXISTS idx_email_template_status ON email_templates (status);

-- ===========================================================================
-- Upgrade 2 Phase 3: bulk email campaigns and email preferences
--
-- One message per recipient: `email_campaign_recipients` points at the row in
-- `email_outbox` that carries that one address. There is no recipient list in
-- any single message, so no recipient can see another's address.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS email_preferences (
  email TEXT PRIMARY KEY,
  user_id TEXT,
  -- Marketing is opt-in: 0 until the address holder says otherwise.
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  opted_in_at TEXT,
  unsubscribed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  -- all | tenants | landlords | agents | admins | providers
  audience TEXT NOT NULL DEFAULT 'all',
  -- marketing (opt-in only) | service (non-optional account notices)
  kind TEXT NOT NULL DEFAULT 'marketing',
  -- draft | queued | sent | partly_failed
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT,
  recipient_total INTEGER NOT NULL DEFAULT 0,
  skipped_unsubscribed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  queued_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_campaign_status ON email_campaigns (status, created_at);

CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  -- queued | sent | failed. The outbox row remains the truth for delivery.
  status TEXT NOT NULL DEFAULT 'queued',
  outbox_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_campaign_recipient ON email_campaign_recipients (campaign_id, email);
CREATE INDEX IF NOT EXISTS idx_campaign_recipient_status ON email_campaign_recipients (campaign_id, status);
