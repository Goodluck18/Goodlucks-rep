-- ============================================================
-- Goodlucks Homes - Database Schema Script (PostgreSQL / MySQL)
-- Web Server Hosting Database Structure & Initial Seed Data
-- ============================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'tenant', -- 'tenant', 'landlord', 'admin'
  phone VARCHAR(64) NOT NULL,
  avatar TEXT,
  address TEXT,
  bio TEXT,
  company VARCHAR(255),
  is_verified BOOLEAN DEFAULT FALSE,
  preferred_locations JSON,
  budget_min DECIMAL(12,2),
  budget_max DECIMAL(12,2),
  preferred_bedrooms INT,
  additional_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. PROPERTIES TABLE
CREATE TABLE IF NOT EXISTS properties (
  id VARCHAR(64) PRIMARY KEY,
  landlord_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  location VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Accra',
  rent_ghs DECIMAL(12,2) NOT NULL,
  bedrooms INT NOT NULL,
  bathrooms INT NOT NULL,
  property_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active', 'pending', 'rejected', 'rented', 'deactivated'
  images JSON NOT NULL,
  description TEXT NOT NULL,
  amenities JSON NOT NULL,
  nearby_places JSON,
  availability VARCHAR(100) DEFAULT 'Available Now',
  featured BOOLEAN DEFAULT FALSE,
  views_count INT DEFAULT 0,
  enquiries_count INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TENANT REQUESTS TABLE
CREATE TABLE IF NOT EXISTS tenant_requests (
  id VARCHAR(64) PRIMARY KEY,
  tenant_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  tenant_name VARCHAR(255) NOT NULL,
  tenant_phone VARCHAR(64) NOT NULL,
  tenant_email VARCHAR(255) NOT NULL,
  preferred_locations JSON NOT NULL,
  budget_min DECIMAL(12,2) NOT NULL,
  budget_max DECIMAL(12,2) NOT NULL,
  bedrooms INT NOT NULL,
  bathrooms INT NOT NULL,
  property_type VARCHAR(64) NOT NULL,
  move_in_date DATE,
  status VARCHAR(32) NOT NULL DEFAULT 'submitted', -- 'submitted', 'searching', 'matched', 'viewing_scheduled', 'completed', 'cancelled'
  matched_property_ids JSON,
  assigned_agent VARCHAR(255) DEFAULT 'Goodlucks Intermediary Desk',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. VIEWING SCHEDULES TABLE
CREATE TABLE IF NOT EXISTS viewing_schedules (
  id VARCHAR(64) PRIMARY KEY,
  tenant_request_id VARCHAR(64) REFERENCES tenant_requests(id) ON DELETE CASCADE,
  tenant_name VARCHAR(255) NOT NULL,
  tenant_phone VARCHAR(64) NOT NULL,
  property_id VARCHAR(64) REFERENCES properties(id) ON DELETE CASCADE,
  property_title VARCHAR(255) NOT NULL,
  property_location VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  time VARCHAR(32) NOT NULL,
  assigned_agent VARCHAR(255) DEFAULT 'Goodlucks Senior Verification Agent',
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'completed', 'cancelled'
  viewing_fee_paid BOOLEAN DEFAULT TRUE,
  fee_amount_ghs DECIMAL(10,2) DEFAULT 100.00,
  outcome_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. EMAIL LOGS TABLE
CREATE TABLE IF NOT EXISTS email_logs (
  id VARCHAR(64) PRIMARY KEY,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  type VARCHAR(64) NOT NULL,
  body_preview TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(32) DEFAULT 'delivered'
);

-- 6. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(32) DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INITIAL DEMO SEED DATA
-- ============================================================

INSERT INTO users (id, email, name, role, phone, avatar, address, is_verified)
VALUES 
('user-tenant-1', 'tenant@goodlucks.com', 'Kofi Mensah', 'tenant', '+233 24 412 3456', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80', 'Cantonments, Accra', TRUE),
('user-landlord-1', 'landlord@goodlucks.com', 'Abena Osei', 'landlord', '+233 20 899 7711', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80', 'East Legon, Accra', TRUE),
('user-admin-1', 'admin@goodlucks.com', 'Goodlucks Admin', 'admin', '+233 30 299 8800', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80', 'Ridge, Accra', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO properties (id, landlord_id, title, location, city, rent_ghs, bedrooms, bathrooms, property_type, status, images, description, amenities)
VALUES 
('prop-1', 'user-landlord-1', 'The Pearl Executive 3-Bedroom Apartment', 'Cantonments, Accra', 'Accra', 6500.00, 3, 3, 'Apartment', 'active', 
 '["https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80"]', 
 'Masterpiece of modern West African architecture located in Cantonments.', 
 '["24/7 Security", "Swimming Pool", "Standby Generator", "Fitted Kitchen", "Air Conditioning"]')
ON CONFLICT (id) DO NOTHING;
