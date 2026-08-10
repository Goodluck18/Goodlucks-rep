import { Property, TenantRequest, ViewingSchedule, User } from '../types';

export function generateSqlDump(
  properties: Property[],
  tenantRequests: TenantRequest[],
  viewingSchedules: ViewingSchedule[],
  currentUser?: User | null
): string {
  const escapeSql = (str: string | undefined | null) => {
    if (!str) return "''";
    return `'${str.replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
  };

  const sqlStatements: string[] = [];

  // SQL Header Comment
  sqlStatements.push(`-- =========================================================`);
  sqlStatements.push(`-- Goodlucks Real Estate & Housing Database Dump`);
  sqlStatements.push(`-- Generated: ${new Date().toISOString()}`);
  sqlStatements.push(`-- Target Engine: PostgreSQL / MySQL Compatible`);
  sqlStatements.push(`-- =========================================================\n`);

  // Table 1: Users
  sqlStatements.push(`-- 1. USERS TABLE SCHEMA & DATA`);
  sqlStatements.push(`CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    phone VARCHAR(50),
    company VARCHAR(255),
    is_verified BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);\n`);

  const usersList: User[] = currentUser ? [
    currentUser,
    {
      id: 'usr_landlord_01',
      name: 'Abena Osei',
      email: 'abena.osei@primehaven.com',
      role: 'landlord',
      phone: '+233 24 555 0192',
      company: 'Prime Haven Properties Ltd',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2',
      bio: 'Premier luxury property developer in Greater Accra.',
      isVerified: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr_tenant_01',
      name: 'Kwame Mensah',
      email: 'kwame.mensah@gmail.com',
      role: 'tenant',
      phone: '+233 20 111 2233',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb',
      isVerified: true,
      createdAt: new Date().toISOString()
    }
  ] : [];

  usersList.forEach(u => {
    sqlStatements.push(
      `INSERT INTO users (id, name, email, role, phone, company, is_verified) VALUES (` +
      `${escapeSql(u.id)}, ${escapeSql(u.name)}, ${escapeSql(u.email)}, ${escapeSql(u.role)}, ${escapeSql(u.phone)}, ${escapeSql(u.company)}, ${u.isVerified ? 'TRUE' : 'FALSE'});`
    );
  });

  sqlStatements.push('\n');

  // Table 2: Properties
  sqlStatements.push(`-- 2. PROPERTIES TABLE SCHEMA & DATA`);
  sqlStatements.push(`CREATE TABLE IF NOT EXISTS properties (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    property_type VARCHAR(100) NOT NULL,
    rent_ghs DECIMAL(12, 2) NOT NULL,
    location VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    bedrooms INT NOT NULL,
    bathrooms INT NOT NULL,
    status VARCHAR(50) NOT NULL,
    landlord_id VARCHAR(100),
    availability VARCHAR(100),
    amenities TEXT,
    images TEXT,
    views_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);\n`);

  properties.forEach(p => {
    const amenitiesJson = JSON.stringify(p.amenities || []);
    const imagesJson = JSON.stringify(p.images || []);
    sqlStatements.push(
      `INSERT INTO properties (id, title, description, property_type, rent_ghs, location, city, bedrooms, bathrooms, status, landlord_id, availability, amenities, images, views_count) VALUES (` +
      `${escapeSql(p.id)}, ${escapeSql(p.title)}, ${escapeSql(p.description)}, ${escapeSql(p.propertyType)}, ${p.rentGhs}, ${escapeSql(p.location)}, ${escapeSql(p.city)}, ${p.bedrooms}, ${p.bathrooms}, ${escapeSql(p.status)}, ${escapeSql(p.landlordId)}, ${escapeSql(p.availability)}, ${escapeSql(amenitiesJson)}, ${escapeSql(imagesJson)}, ${p.viewsCount || 0});`
    );
  });

  sqlStatements.push('\n');

  // Table 3: Tenant Requests
  sqlStatements.push(`-- 3. TENANT REQUESTS TABLE SCHEMA & DATA`);
  sqlStatements.push(`CREATE TABLE IF NOT EXISTS tenant_requests (
    id VARCHAR(100) PRIMARY KEY,
    tenant_name VARCHAR(255) NOT NULL,
    tenant_email VARCHAR(255) NOT NULL,
    tenant_phone VARCHAR(50) NOT NULL,
    preferred_locations TEXT,
    property_type VARCHAR(100),
    min_rent_ghs DECIMAL(12,2),
    max_rent_ghs DECIMAL(12,2),
    bedrooms INT,
    status VARCHAR(50) NOT NULL,
    matched_property_ids TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);\n`);

  tenantRequests.forEach(r => {
    const locsJson = JSON.stringify(r.preferredLocations || []);
    const matchesJson = JSON.stringify(r.matchedPropertyIds || []);
    sqlStatements.push(
      `INSERT INTO tenant_requests (id, tenant_name, tenant_email, tenant_phone, preferred_locations, property_type, min_rent_ghs, max_rent_ghs, bedrooms, status, matched_property_ids) VALUES (` +
      `${escapeSql(r.id)}, ${escapeSql(r.tenantName)}, ${escapeSql(r.tenantEmail)}, ${escapeSql(r.tenantPhone)}, ${escapeSql(locsJson)}, ${escapeSql(r.propertyType)}, ${r.budgetMin || 0}, ${r.budgetMax || 0}, ${r.bedrooms}, ${escapeSql(r.status)}, ${escapeSql(matchesJson)});`
    );
  });

  sqlStatements.push('\n');

  // Table 4: Viewing Schedules
  sqlStatements.push(`-- 4. VIEWING SCHEDULES TABLE SCHEMA & DATA`);
  sqlStatements.push(`CREATE TABLE IF NOT EXISTS viewing_schedules (
    id VARCHAR(100) PRIMARY KEY,
    tenant_request_id VARCHAR(100),
    tenant_name VARCHAR(255) NOT NULL,
    tenant_phone VARCHAR(50) NOT NULL,
    property_id VARCHAR(100) NOT NULL,
    property_title VARCHAR(255) NOT NULL,
    property_location VARCHAR(255) NOT NULL,
    scheduled_date VARCHAR(50) NOT NULL,
    scheduled_time VARCHAR(50) NOT NULL,
    assigned_agent VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    viewing_fee_paid BOOLEAN DEFAULT FALSE,
    fee_amount_ghs DECIMAL(10,2) DEFAULT 100.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);\n`);

  viewingSchedules.forEach(v => {
    sqlStatements.push(
      `INSERT INTO viewing_schedules (id, tenant_request_id, tenant_name, tenant_phone, property_id, property_title, property_location, scheduled_date, scheduled_time, assigned_agent, status, viewing_fee_paid, fee_amount_ghs) VALUES (` +
      `${escapeSql(v.id)}, ${escapeSql(v.tenantRequestId)}, ${escapeSql(v.tenantName)}, ${escapeSql(v.tenantPhone)}, ${escapeSql(v.propertyId)}, ${escapeSql(v.propertyTitle)}, ${escapeSql(v.propertyLocation)}, ${escapeSql(v.date)}, ${escapeSql(v.time)}, ${escapeSql(v.assignedAgent)}, ${escapeSql(v.status)}, ${v.viewingFeePaid ? 'TRUE' : 'FALSE'}, ${v.feeAmountGhs || 100.00});`
    );
  });

  sqlStatements.push(`\n-- End of SQL Dump`);

  return sqlStatements.join('\n');
}

export function downloadSqlDumpFile(content: string, filename: string = 'goodlucks_housing_db.sql') {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
