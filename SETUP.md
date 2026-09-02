# 🏢 RentBill Pro — Complete Supabase Setup & Deployment Guide

Welcome to **RentBill Pro**. This guide provides step-by-step instructions to set up your **Supabase Cloud Database**, Authentication, Storage Buckets, and connect your web application.

---

## ⚡ Quick Setup Overview

| Step | Action | Description |
| :--- | :--- | :--- |
| **Step 1** | Create Supabase Project | Create a project at [supabase.com](https://supabase.com) |
| **Step 2** | Run Master SQL Script | Run [`sql/00_master_schema.sql`](sql/00_master_schema.sql) in SQL Editor |
| **Step 3** | Verify Storage Bucket | Ensure the `proofs` bucket is created & set to Public |
| **Step 4** | Configure Auth Settings | Enable Email Auth provider and disable email confirmation if needed |
| **Step 5** | Connect Web App | Enter Supabase URL & Anon Key into the RentBill Pro web interface |
| **Step 6** | Log In & Test | Sign in as Admin (`admin@rentbill.com` / `Admin@123`) |

---

## 🚀 Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and log in or create a free account.
2. Click **New Project**.
3. Fill in the project details:
   - **Name**: `rentbills-pro` (or your preferred name)
   - **Database Password**: Choose a strong password and save it safely.
   - **Region**: Choose the region closest to your users.
4. Click **Create new project** and wait ~2 minutes for provision completion.

---

## 🗄️ Step 2: Run Master Database Schema

1. Open your Supabase Dashboard.
2. On the left sidebar, click the **SQL Editor** icon (`< />`).
3. Click **New Query**.
4. Open [`sql/00_master_schema.sql`](sql/00_master_schema.sql) in your code editor, copy the entire content, and paste it into the Supabase SQL Editor.
5. Click **Run** (or press `Ctrl + Enter`).

> [!SUCCESS]
> **What this script automatically sets up:**
> - Core extensions (`uuid-ossp`, `pgcrypto`)
> - User profiles table & auto-trigger `handle_new_user()`
> - Business tables (`properties`, `units`, `renters`, `owners`, `bills`, `payments`, `expenses`, `owner_withdrawals`, `documents`)
> - Automated financial triggers (`calculate_bill_amounts()`, `sync_bill_paid_amount()`)
> - Row Level Security (RLS) policies for Admins and Tenants
> - Auth RPC functions (`admin_create_tenant_user`, `resolve_login_email`, `get_login_email_for_identifier`, `admin_list_tenants_with_auth`, `admin_delete_tenant_login`, `admin_toggle_tenant_login_status`, `tenant_link_own_lease`)
> - Default Administrator user (`admin@rentbill.com` / `Admin@123`)

---

## 📄 Step 3: Storage Bucket Setup (Payment Proofs)

1. On the left sidebar, navigate to **Storage** $\rightarrow$ **Buckets**.
2. Verify that the **`proofs`** bucket is present.
3. If missing:
   - Click **New Bucket**.
   - Name: `proofs`.
   - Toggle **Public Bucket** to **ON**.
   - Click **Save**.

---

## 🔐 Step 4: Configure Supabase Authentication

1. Go to **Authentication** $\rightarrow$ **Providers** $\rightarrow$ **Email**:
   - Ensure **Enable Email provider** is turned **ON**.
2. Go to **Authentication** $\rightarrow$ **URL Configuration**:
   - Set **Site URL** to your web app location (e.g. `http://localhost:8080` or `https://your-domain.com`).
3. **Optional (Recommended for Tenant Instant Sign-In)**:
   - Go to **Authentication** $\rightarrow$ **Auth Providers / Sign Up Restrictions**.
   - Turn **Confirm email** **OFF** if you want tenant login accounts to activate immediately without email confirmation links.

---

## 🔑 Step 5: Connect App to Supabase

1. In Supabase Dashboard, go to **Project Settings** (gear icon) $\rightarrow$ **API**.
2. Copy your **Project URL** (e.g. `https://xxxx.supabase.co`) and **Publishable / anon key**.
3. Open **RentBill Pro** in your browser.
4. If prompted on startup (or click **Settings** / **Configure Supabase**):
   - Paste your **Supabase Project URL**.
   - Paste your **Supabase Anon Key**.
   - Click **Save & Connect**.

---

## 👤 Step 6: Default Logins & Verification

### Administrator Login:
- **Email**: `admin@rentbill.com`
- **Password**: `Admin@123`

### Creating & Testing Tenant Logins:
1. Log in as Administrator.
2. Go to **Settings** $\rightarrow$ **Tenant Logins** (or **Tenants Directory** $\rightarrow$ **Login & Password**).
3. Click **Create Login Account** on any tenant row.
4. Enter an Email and Password $\rightarrow$ click **Save Account**.
5. Log out and test signing in with the Tenant's email/mobile and password to verify the Resident Tenant Portal.

---

## 🧹 Database Reset / Maintenance Scripts

| File | Purpose | When to use |
| :--- | :--- | :--- |
| **[`sql/10_clear_all_data.sql`](sql/10_clear_all_data.sql)** | Clear Data | Wipes test properties, bills, tenants, and payments while keeping database tables & Admin login intact |
| **[`sql/11_reset_database.sql`](sql/11_reset_database.sql)** | Full Teardown | Drops all tables, triggers, and RPC functions in `public` schema for a complete fresh database rebuild |
