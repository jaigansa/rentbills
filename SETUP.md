# 🏢 RentBill Pro — Enterprise Setup & Deployment Guide

Welcome to **RentBill Pro**, an enterprise-grade property management, tenant directory, lease document vault, and POS utility bill receipt generator.

---

## ⚡ Quick Start

### Option A: Running with Go Web Server (Embedded Binary)

RentBill Pro includes a zero-dependency Go web server that embeds static frontend assets (`index.html`, `css/`, `js/`).

```bash
# 1. Clone or navigate to codebase directory
cd /home/jaigansa/Projects/rentbill

# 2. Build executable binary
go build -o rentbill .

# 3. Run application server
./rentbill
```

* Open your browser at **`http://localhost:8080`**.

---

### Option B: Running with Any Static Web Server

Because RentBill Pro is engineered as a modern, decoupled Single Page Application (SPA), you can host `index.html` on any static web server:

```bash
# Using Python 3 Built-in HTTP Server
python3 -m http.server 8000

# Or using Nginx / Caddy / Vercel / Netlify / GitHub Pages
```

---

## ☁️ Supabase Cloud Database Setup

RentBill Pro supports **Dual-Mode Operation**:
1. **Local Demo Mode**: Works out-of-the-box using browser LocalStorage when cloud authentication is offline.
2. **Supabase Cloud Mode**: Syncs all property, tenant, bill, document, payment, and expense records with Supabase.

### 🔑 Configuring Supabase Credentials

1. Open **RentBill Pro** in your browser.
2. On the Login Screen or Navigation Bar, click **Configure Supabase Keys**.
3. Input your **Supabase Project URL** (e.g. `https://your-project.supabase.co`) and **Anon API Key**.

---

## 🗄️ Production SQL Migration Script (100% Audited)

Run the following SQL migration script in your **Supabase Dashboard $\rightarrow$ SQL Editor**:

```sql
-- ==========================================
-- 🏢 RENTBILL PRO PRODUCTION SQL MIGRATION (100% AUDITED)
-- ==========================================

-- 1. Property Buildings Table
CREATE TABLE IF NOT EXISTS public.properties (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    name TEXT NOT NULL,
    address TEXT,
    owner_name TEXT,
    status TEXT DEFAULT 'Active'
);

-- 2. Rental Units & Apartments Table
CREATE TABLE IF NOT EXISTS public.units (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    property_id BIGINT REFERENCES public.properties(id) ON DELETE SET NULL,
    unit_name TEXT NOT NULL,
    floor TEXT,
    rent_amount NUMERIC(10,2) DEFAULT 0,
    status TEXT DEFAULT 'VACANT'
);

-- 3. Active Tenants Directory Table
CREATE TABLE IF NOT EXISTS public.renters (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    unit_id BIGINT REFERENCES public.units(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    mobile_number TEXT,
    rent_amount NUMERIC(10,2) DEFAULT 0,
    deposit_amount NUMERIC(10,2) DEFAULT 0,
    arrears NUMERIC(10,2) DEFAULT 0,
    pending_arrears NUMERIC(10,2) DEFAULT 0,
    lease_end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'Occupied'
);

-- 4. Property Owners Directory Table
CREATE TABLE IF NOT EXISTS public.owners (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    name TEXT NOT NULL,
    mobile_number TEXT,
    email TEXT,
    upi_id TEXT,
    bank_name TEXT,
    account_number TEXT,
    ifsc_code TEXT
);

-- 5. Digital Documents Vault Table
CREATE TABLE IF NOT EXISTS public.documents (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'OTHER',
    entity_type TEXT,
    entity_id TEXT,
    expiry_date DATE,
    file_url TEXT,
    notes TEXT
);

-- 6. Property Maintenance Expenses Table
CREATE TABLE IF NOT EXISTS public.expenses (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    property_id BIGINT REFERENCES public.properties(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    expense_date DATE DEFAULT CURRENT_DATE,
    description TEXT,
    notes TEXT
);

-- 7. Owner Withdrawals Table
CREATE TABLE IF NOT EXISTS public.owner_withdrawals (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    owner_name TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    withdrawal_date DATE DEFAULT CURRENT_DATE,
    notes TEXT
);

-- 8. Monthly Utility & Rent Bills Table
CREATE TABLE IF NOT EXISTS public.bills (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    renter_id BIGINT REFERENCES public.renters(id) ON DELETE CASCADE,
    bill_month TEXT NOT NULL,
    previous_meter_reading NUMERIC(10,2) DEFAULT 0,
    current_meter_reading NUMERIC(10,2) DEFAULT 0,
    meter_units_consumed NUMERIC(10,2) DEFAULT 0,
    rent_amount NUMERIC(10,2) DEFAULT 0,
    electricity_amount NUMERIC(10,2) DEFAULT 0,
    water_amount NUMERIC(10,2) DEFAULT 0,
    net_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'UNPAID',
    proof_status TEXT DEFAULT 'PENDING'
);

-- 9. Payment Transactions Table
CREATE TABLE IF NOT EXISTS public.payments (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    bill_id BIGINT REFERENCES public.bills(id) ON DELETE CASCADE,
    renter_id BIGINT REFERENCES public.renters(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'CASH',
    transaction_ref TEXT,
    notes TEXT
);

-- ==========================================
-- ⚡ PERFORMANCE INDEXING
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_units_property ON public.units(property_id);
CREATE INDEX IF NOT EXISTS idx_renters_unit ON public.renters(unit_id);
CREATE INDEX IF NOT EXISTS idx_bills_renter ON public.bills(renter_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON public.payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_documents_cat ON public.documents(category);

-- ==========================================
-- 🔒 ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Full access properties" ON public.properties FOR ALL USING (true);
CREATE POLICY "Full access units" ON public.units FOR ALL USING (true);
CREATE POLICY "Full access renters" ON public.renters FOR ALL USING (true);
CREATE POLICY "Full access owners" ON public.owners FOR ALL USING (true);
CREATE POLICY "Full access documents" ON public.documents FOR ALL USING (true);
CREATE POLICY "Full access expenses" ON public.expenses FOR ALL USING (true);
CREATE POLICY "Full access owner_withdrawals" ON public.owner_withdrawals FOR ALL USING (true);
CREATE POLICY "Full access bills" ON public.bills FOR ALL USING (true);
CREATE POLICY "Full access payments" ON public.payments FOR ALL USING (true);
```

---

## 📄 Storage Bucket Setup (For File Uploads)

If you plan to upload document files (PDFs, images) to Supabase Storage:
1. In Supabase Dashboard, navigate to **Storage** $\rightarrow$ **Buckets**.
2. Click **Create New Bucket** and name it **`documents`**.
3. Mark the bucket as **Public**.

---

## 🛠️ Features & Thermal Print Engine

* **Zero-Blank-Page POS Print Engine**: Generates 80mm thermal receipt invoices for rent payments without blank pages or unwanted headers.
* **Responsive Mobile Cards**: Automatically converts tables to touch-friendly card layouts on mobile devices.
* **Sticky Modal Footers**: Modal action buttons stay pinned to the bottom of the screen on all device resolutions.
* **Light / Dark Mode**: Theme toggles seamlessly across all components and table states.
