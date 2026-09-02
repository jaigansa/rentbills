# 🗄️ RentBill Pro — Modular SQL Schema Directory

This directory contains modular, organized SQL files for setting up, managing, and maintaining your **Supabase PostgreSQL** database.

---

## 🚀 Quick Start (Two Ways to Run)

### Option A: 1-Click Master Setup ⭐ *(Fastest)*
Copy and paste the entire master schema from [`00_master_schema.sql`](00_master_schema.sql) into the **Supabase SQL Editor** and click **Run**.

---

### Option B: Modular Step-by-Step Setup
Run the SQL files in numerical order:

| File | Purpose | What it sets up |
| :--- | :--- | :--- |
| **[`01_extensions_and_profiles.sql`](01_extensions_and_profiles.sql)** | Core Setup | Enables `uuid-ossp`, `pgcrypto`, creates `profiles` table & auth trigger |
| **[`02_properties_and_units.sql`](02_properties_and_units.sql)** | Real Estate Assets | Creates `owners`, `properties`, and `units` tables |
| **[`03_renters_and_tenants.sql`](03_renters_and_tenants.sql)** | Tenants Directory | Creates `renters` table (lease dates, meter rates, arrears) |
| **[`04_bills_and_payments.sql`](04_bills_and_payments.sql)** | Invoices & Ledgers | Creates `bills`, `payments` tables + automated financial triggers |
| **[`05_expenses_and_documents.sql`](05_expenses_and_documents.sql)** | Vault & Operations | Creates `expenses`, `owner_withdrawals`, and `documents` vault |
| **[`06_indexes_and_performance.sql`](06_indexes_and_performance.sql)** | Performance | Adds high-speed indexes for billing periods, mobile numbers, soft-deletes |
| **[`07_rls_security_policies.sql`](07_rls_security_policies.sql)** | Security & Privacy | Enables Row-Level Security (RLS), `is_admin()`, and tenant isolation |
| **[`08_tenant_auth_rpcs.sql`](08_tenant_auth_rpcs.sql)** | Auth RPCs | Adds admin tenant account creation, password resets & universal login |
| **[`09_default_admin.sql`](09_default_admin.sql)** | Admin Account | Creates the default Administrator account (`admin@rentbill.com` / `Admin@123`) |

---

## 🧹 Maintenance & Cleanup

| File | Purpose | When to use |
| :--- | :--- | :--- |
| **[`10_clear_all_data.sql`](10_clear_all_data.sql)** | Safe Reset | Wipes all test properties/bills/tenants and resets ID sequences back to `1` without deleting tables or your Admin login |
