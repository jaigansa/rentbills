# 🚀 RentBill Pro — Production Deployment & Security Guide

This document provides a step-by-step guide to deploying **RentBill Pro** to **Cloudflare Pages** backed by **Supabase Cloud**, with full support for **Standard Email & Password** authentication for both landlords and tenants.

---

## 🏛️ Architecture Overview

- **Frontend**: High-performance Vanilla HTML5/CSS3/ES6 JavaScript (Single Page Application).
- **Edge CDN & Hosting**: [Cloudflare Pages](https://pages.cloudflare.com) (100% Free tier, Unlimited Bandwidth, Global Edge CDN, Free DDoS & WAF protection, automated SSL/TLS).
- **Edge Security**: `_headers` injecting strict Content Security Policy (`CSP`), HSTS, anti-clickjacking (`X-Frame-Options: DENY`), and permission policies.
- **Database & Auth**: [Supabase Cloud](https://supabase.com) (Managed PostgreSQL 15+ with Row Level Security, Supabase Auth, and Storage).
- **Isolation Guarantee**: Multi-tenant Row Level Security (RLS) ensures tenants can only ever view their own unit's invoices and receipts. Landlord bank details, expenses, and other tenant profiles are completely blocked at the PostgreSQL engine level.

---

## 📋 Step-by-Step Deployment Runbook

### Step 1: Set Up Supabase Cloud Database

1. Sign in to [supabase.com](https://supabase.com) and click **New Project**.
2. Select your closest region (e.g. `ap-south-1` Mumbai if located in India) and choose a strong database password.
3. Once the database finishes provisioning (approx. 1-2 minutes), navigate to the **SQL Editor** on the left menu.
4. Click **New Query**, paste the entire contents of [`sql/00_master_schema.sql`](sql/00_master_schema.sql), and click **Run**.
   - This creates all required tables (`profiles`, `owners`, `properties`, `units`, `renters`, `bills`, `payments`, `expenses`, `owner_withdrawals`).
   - This installs the automated `handle_new_user()` trigger which connects newly registered tenant accounts to their lease.
   - This enables strict Row Level Security (RLS) policies and secures the `proofs` storage bucket.

---

### Step 2: Create the Landlord Admin Account

1. In your Supabase Dashboard, navigate to **Authentication $\rightarrow$ Users**.
2. Click **Add User $\rightarrow$ Create User**.
3. Enter your admin email (e.g. `admin@yourdomain.com`) and a strong password.
4. Once created, go to the **SQL Editor** and promote your account to `ADMIN`:
   ```sql
   UPDATE public.profiles
   SET role = 'ADMIN'
   WHERE email = 'admin@yourdomain.com';
   ```
5. Retrieve your project credentials from **Project Settings $\rightarrow$ API**:
   - **Project URL** (e.g., `https://xyzcompany.supabase.co`)
   - **Anon / Public Key** (e.g., `eyJhbGciOi...`)

---

### Step 3: Deploy on Cloudflare Pages

1. Push your RentBill repository to **GitHub** or **GitLab**.
2. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com) and select **Workers & Pages** $\rightarrow$ **Create Application** $\rightarrow$ **Pages** $\rightarrow$ **Connect to Git**.
3. Select your `rentbill` repository.
4. Configure the Build & Deployment settings:
   - **Project Name**: `rentbill` (or any custom name)
   - **Production Branch**: `main` (or `master`)
   - **Framework Preset**: `None`
   - **Build Command**: *(Leave empty — zero build step required)*
   - **Build Output Directory**: *(Leave empty or enter `/`)*
5. Click **Save and Deploy**.
6. Within 15 seconds, Cloudflare will deploy your application to a global edge address like `https://rentbill.pages.dev`.

---

### Step 4: Configure Supabase Keys in Application

1. Open your deployed Cloudflare URL (`https://rentbill.pages.dev`).
2. On the login screen or via the prompt, click **Configure Supabase API Keys**.
3. Enter your Supabase **Project URL** and **Anon Key**.
4. The application will initialize the secure connection and remember the keys in local browser storage.
*(Optional: You can also hardcode your URL and anon key inside `js/core/config.js` prior to pushing to Git if your repository is private).*

---

### Step 5: How Tenants Log In (Built-in Password Management & Universal Login)

1. **Landlord creates tenant & sets password in RentBill Pro**:
   - Navigate to **Documents** $\rightarrow$ **Tenants** $\rightarrow$ Click **+ Add Tenant**.
   - Fill in details including the tenant's **Mobile Number**, **Email Address**, and optional **Portal Login Password**.
   - Or, go to **Settings** $\rightarrow$ **Tenant Logins** tab: click **Create Login** / **Reset Password** on any tenant row to set/reset credentials anytime, copy login details, or share directly via WhatsApp in 1 click!
2. **Tenant logs in (Email or Mobile Number)**:
   - Tenant visits your RentBill Pro portal URL.
   - Enters their **Email** OR **Registered Mobile Number** (or username) and their Password.
   - The system automatically resolves their identifier, checks their credentials, matches their profile to their lease, and displays their scoped **Resident Tenant Portal**.
   - The tenant sees their unit, current balance, monthly invoices, can download A4 PDF receipts, or submit a payment reference/proof.
   - Landlord-only pages (Properties, Expenses, System Settings) are completely hidden and inaccessible.

---

### Step 6: Custom Domain & Free SSL (Optional)

1. In Cloudflare Pages, navigate to **Custom Domains** $\rightarrow$ **Set up a custom domain**.
2. Enter your desired domain (e.g., `rent.yourdomain.com`).
3. If your domain's DNS is managed by Cloudflare, it will configure the CNAME automatically and issue an SSL/TLS certificate in minutes.

---

## 🔒 Security Checklist & Verification

| Security Control | Implementation | Verification Method |
| :--- | :--- | :--- |
| **Row Level Security (RLS)** | Enabled on all PostgreSQL tables | cURL test without auth returns `401` or empty `[]` |
| **Tenant Data Isolation** | Filtered by `renter_id IN (SELECT id FROM renters WHERE user_id = auth.uid())` | Tenant login only returns bills for their assigned unit |
| **Landlord Privacy** | `expenses`, `owners.account_number`, `owner_withdrawals` restricted to `ADMIN` | Tenant querying `/rest/v1/expenses` receives empty list |
| **Content Security Policy** | Configured in `_headers` at Cloudflare Edge | Inspect HTTP response headers for `Content-Security-Policy` |
| **Anti-Clickjacking** | `X-Frame-Options: DENY` | Cannot be embedded in malicious iframes |
| **Transport Security** | `Strict-Transport-Security: max-age=31536000` | Automated HTTPS enforcement across all browsers |
| **Payment Verification** | Proof status marked `PENDING` until approved by landlord | Unverified tenant submissions do not alter bill status without admin confirmation |
