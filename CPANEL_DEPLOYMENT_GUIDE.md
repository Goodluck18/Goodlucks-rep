# Goodlucks Homes - cPanel & phpMyAdmin Deployment Guide (Option 1)

This guide walks you through deploying **Goodlucks Homes** to any standard **cPanel hosting** account with **phpMyAdmin (MySQL)**.

---

## 🏗️ Architecture Overview

Your website uses the industry-standard architecture for high-performance web apps on shared hosting:
1. **Frontend (Fast & Interactive)**: React + Tailwind CSS compiled into lightweight static HTML, JavaScript, and CSS files.
2. **Backend (cPanel PHP & MySQL)**: PHP REST API scripts (`/api/*`) connected to your MySQL database managed via phpMyAdmin.
3. **Apache Routing (`.htaccess`)**: Automatically routes API requests to PHP scripts and web page visits to `index.html`.

---

## 📋 Directory Structure on cPanel (`public_html`)

Once uploaded, your cPanel `public_html` folder will look like this:

```text
public_html/
│
├── index.html                  <-- Frontend entry page (from dist/)
├── .htaccess                   <-- Apache routing file (ensures React & API routes work)
├── assets/                     <-- Compiled JS & CSS files (from dist/assets/)
│   ├── index-xxxx.js
│   └── index-xxxx.css
│
└── api/                        <-- PHP Backend folder (from php-backend/)
    ├── config.php              <-- Database credentials (HOST, DB, USER, PASS)
    ├── database.sql            <-- Database backup file
    ├── health.php              <-- API health check (tests MySQL connection)
    ├── properties.php          <-- Listing & searching properties
    ├── price_alerts.php        <-- "Notify me if price drops" subscriptions
    ├── viewing_request.php     <-- Physical viewing booking (GH₵ 100 on-site)
    ├── tenant_requests.php     <-- Tenant match requests
    ├── send_email.php          <-- Automated email notifications
    └── .htaccess               <-- API routing rules
```

---

## 🚀 Step-by-Step Deployment Instructions

### Step 1: Create Database & User in cPanel
1. Log in to your **cPanel Dashboard**.
2. Under the **Databases** section, click **MySQL® Database Wizard** (or **MySQL® Databases**).
3. **Create a Database**:
   - Enter a name, e.g., `goodlucks` (full name will be like `cpaneluser_goodlucks`).
   - Click **Next Step**.
4. **Create a Database User**:
   - Enter a username, e.g., `dbuser` (full name will be like `cpaneluser_dbuser`).
   - Generate a strong password and **copy it down**.
   - Click **Create User**.
5. **Assign Privileges**:
   - Check the box for **ALL PRIVILEGES**.
   - Click **Make Changes**.

---

### Step 2: Import `database.sql` in phpMyAdmin
1. In cPanel, navigate to **phpMyAdmin** (under Databases).
2. In the left sidebar, click on the database you just created (e.g., `cpaneluser_goodlucks`).
3. Click the **Import** tab at the top.
4. Click **Choose File** and select `php-backend/database.sql` from your project folder.
5. Click **Import** (or **Go** at the bottom).
6. ✅ You will see green checkmarks confirming the creation of 9 tables:
   - `properties` (pre-seeded with Accra luxury listings: Cantonments, East Legon, Airport Residential, Dzorwulu)
   - `price_drop_alerts` (stores email alerts for price drops)
   - `viewing_schedules`
   - `tenant_requests`
   - `users`
   - `tenancy_agreements`
   - `rent_receipts`
   - `email_logs`
   - `notifications`

---

### Step 3: Configure `config.php`
Open `php-backend/config.php` on your computer (or in cPanel File Manager) and update lines 13–16:

```php
define('DB_HOST', 'localhost');                  // Keep as localhost on cPanel
define('DB_NAME', 'cpaneluser_goodlucks');        // Your full cPanel DB name
define('DB_USER', 'cpaneluser_dbuser');           // Your full cPanel DB user
define('DB_PASS', 'your_actual_password_here');   // Your database password
```

> **Note**: In cPanel, database and usernames almost always have your cPanel account username as a prefix (e.g., `account_dbname`).

---

### Step 4: Build the Frontend (or Download ZIP)
In your development environment, run:
```bash
npm run build
```
This builds production files into the `dist/` folder. It automatically includes the optimized `public_html` `.htaccess` file.

---

### Step 5: Upload Files to cPanel `public_html`
1. In cPanel, open **File Manager** and go to `public_html/`.
2. Upload all files from the `dist/` folder directly into `public_html/`:
   - `index.html`
   - `.htaccess`
   - `assets/` folder
   - Any public icons/images
3. In `public_html/`, create a new folder named **`api`**.
4. Upload all files from `php-backend/` into `public_html/api/`:
   - `config.php`
   - `health.php`
   - `properties.php`
   - `price_alerts.php`
   - `viewing_request.php`
   - `tenant_requests.php`
   - `send_email.php`
   - `.htaccess`

---

### Step 6: Test Your Live Installation!
1. **Test the Database & API**:
   Visit in your browser:
   ```text
   https://yourdomain.com/api/health.php
   ```
   You should see a JSON response confirming:
   ```json
   {
     "status": "ok",
     "platform": "Goodlucks Homes cPanel PHP Backend",
     "database_connected": true,
     "properties_count": 4,
     "tables": ["email_logs", "notifications", "price_drop_alerts", "properties", ...]
   }
   ```

2. **Test the Frontend**:
   Visit `https://yourdomain.com`.
   - Browse properties.
   - Click on any property (e.g. Cantonments 3-Bed).
   - Click **"Notify me if price drops"**, enter your email, and submit.
   - The alert will immediately save to your MySQL `price_drop_alerts` table in phpMyAdmin!

---

## 🛠️ Common cPanel Questions & Solutions

### 1. "Page shows 404 when refreshed on internal routes"
- Make sure `.htaccess` is uploaded to the root of `public_html`.
- In cPanel File Manager, click **Settings** (top right) and check **"Show Hidden Files (dotfiles)"** so `.htaccess` is visible.

### 2. "Database connection failed in health.php"
- Check that the database user is added to the database in **cPanel MySQL Databases** with **ALL PRIVILEGES**.
- Ensure the password in `api/config.php` matches the password set when creating the database user.

### 3. "Where can I view submitted price drop alerts?"
- Open phpMyAdmin in cPanel.
- Click your database.
- Click the table **`price_drop_alerts`** to browse all subscriber emails, target budgets, and property IDs.
