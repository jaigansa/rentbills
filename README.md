# RentBill Pro (Serverless Static Edition)

**RentBill Pro** is a modern, lightweight property and rental management application for landlords and property managers. It runs as a **pure static web application** using **Vanilla HTML5, CSS3, and JavaScript**, backed by **Supabase** for database, authentication, real-time updates, and storage.

---

## Table of Contents

- [Features](#features)
- [Technical Architecture](#technical-architecture)
- [Project Structure](#project-structure)
- [Quick Setup Overview](#quick-setup-overview)
- [Step 1: Create a Supabase Project](#step-1-create-a-supabase-project)
- [Step 2: Run Master Database Schema](#step-2-run-master-database-schema)
- [Step 3: Storage Bucket Setup (Payment Proofs)](#step-3-storage-bucket-setup-payment-proofs)
- [Step 4: Configure Supabase Authentication](#step-4-configure-supabase-authentication)
- [Step 5: Connect App to Supabase](#step-5-connect-app-to-supabase)
- [Step 6: Default Logins & Verification](#step-6-default-logins--verification)
- [Database Reset / Maintenance Scripts](#database-reset--maintenance-scripts)
- [Local Development](#local-development)
- [Cross-Platform Single Binary Executable](#cross-platform-single-binary-executable)
- [Deployment on Cloudflare Pages](#deployment-on-cloudflare-pages)
- [How Tenants Log In](#how-tenants-log-in)
- [Custom Domain & Free SSL](#custom-domain--free-ssl)
- [Security Checklist & Verification](#security-checklist--verification)

---

## Features

- 🏠 **Property, Unit, Tenant, Owner & Documents management**
- 📄 **Automatic monthly billing** with electricity & water calculations
- 💳 **Payments, partial payments, arrears, credit/advance tracking**
- 🔧 **Maintenance work orders**
- 📊 **Dashboard & financial overviews**
- 🔐 **Multi-role access**: Admin, Staff, and scoped Resident Tenant Portal
- 🌐 **Bilingual**: English & Tamil (তமிழ்)
- 📈 **Integer-based (paise) financial math** to prevent floating-point errors
- ☁️ **Supabase-backed** database, auth, realtime & storage
- 💻 **Cross-platform standalone binary** — zero runtime dependencies

---

## Technical Architecture

- **Frontend**: Clean, lightweight Vanilla HTML5, CSS3, and JavaScript (No build step required).
- **Backend / Database**: [Supabase](https://supabase.com) (PostgreSQL with Row Level Security, Auth & Storage).
- **Hosting**: Can be deployed on GitHub Pages, Vercel, Netlify, Cloudflare Pages, or run locally via any web server.
- **Accounting**: Strict integer-based calculations (paise) to prevent IEEE-754 floating-point inaccuracies.

---

## Project Structure

```
.
├── README.md
├── build.sh
├── main.go                  # Go embedded server
├── sql/                     # Database scripts — install / update / delete
│   ├── install/             # Brand-new database: 00_master_schema.sql
│   ├── update/              # Upgrade existing DB, keep data
│   └── delete/              # Clear data / full reset
├── index.html               # Single Page Application entrypoint
├── css/
│   ├── app.css              # Master entry stylesheet
│   ├── variables.css        # Theme variables & design tokens
│   ├── base.css             # Base reset, typography & icon rules
│   ├── layout.css           # Shell layout & header
│   ├── components.css       # Stat cards, tables, badges, buttons, dropdowns
│   ├── modals.css           # Modals, drawer & mobile controls
│   └── print.css            # A4 receipt & invoice print engine
├── i18n/
│   ├── en.json              # English translations
│   └── ta.json              # Tamil translations
└── js/
    ├── core/                # Core config, state, UI, theme, i18n
    ├── modules/             # Domain modules (auth, dashboard, properties, bills, etc.)
    └── main.js              # Application entry point
```

---

## Quick Setup Overview

| Step | Action | Description |
| :--- | :--- | :--- |
| **Step 1** | Create Supabase Project | Create a project at [supabase.com](https://supabase.com) |
| **Step 2** | Run Master SQL Script | Run [`sql/install/00_master_schema.sql`](sql/install/00_master_schema.sql) in SQL Editor |
| **Step 3** | Verify Storage Bucket | Ensure the `proofs` bucket is created & set to Public |
| **Step 4** | Configure Auth Settings | Enable Email Auth provider and disable email confirmation if needed |
| **Step 5** | Connect Web App | Enter Supabase URL & Anon Key into the RentBill Pro web interface |
| **Step 6** | Log In & Test | Sign in as Admin (`admin@rentbill.com` / `Admin@123`) |

---

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and log in or create a free account.
2. Click **New Project**.
3. Fill in the project details:
   - **Name**: `rentbills-pro` (or your preferred name)
   - **Database Password**: Choose a strong password and save it safely.
   - **Region**: Choose the region closest to your users.
4. Click **Create new project** and wait ~2 minutes for provision completion.

---

## Step 2: Run Master Database Schema

1. Open your Supabase Dashboard.
2. On the left sidebar, click the **SQL Editor** icon (`< />`).
3. Click **New Query**.
4. Open [`sql/install/00_master_schema.sql`](sql/install/00_master_schema.sql) in your code editor, copy the entire content, and paste it into the Supabase SQL Editor.
5. Click **Run** (or press `Ctrl + Enter`).

> [!SUCCESS]
> **What this script automatically sets up:**
> - Core extensions (`uuid-ossp`, `pgcrypto`)
> - User profiles table & auto-trigger `handle_new_user()`
> - Business tables (`properties`, `units`, `renters`, `owners`, `bills`, `payments`, `expenses`, `owner_withdrawals`, `documents`)
> - Automated financial triggers (`calculate_bill_amounts()`, `sync_bill_paid_amount()`)
> - Row Level Security (RLS) policies for Admins and Tenants
> - Auth RPC functions (create tenant users, resolve login emails, manage/delete/toggle tenant logins, link leases)
> - Default Administrator user (`admin@rentbill.com` / `Admin@123`)

---

## Step 3: Storage Bucket Setup (Payment Proofs)

1. On the left sidebar, navigate to **Storage** → **Buckets**.
2. Verify that the **`proofs`** bucket is present.
3. If missing:
   - Click **New Bucket**.
   - Name: `proofs`.
   - Toggle **Public Bucket** to **ON**.
   - Click **Save**.

---

## Step 4: Configure Supabase Authentication

1. Go to **Authentication** → **Providers** → **Email**:
   - Ensure **Enable Email provider** is turned **ON**.
2. Go to **Authentication** → **URL Configuration**:
   - Set **Site URL** to your web app location (e.g. `http://localhost:8080` or `https://your-domain.com`).
3. **Optional (Recommended for Tenant Instant Sign-In)**:
   - Go to **Authentication** → **Auth Providers / Sign Up Restrictions**.
   - Turn **Confirm email** **OFF** if you want tenant login accounts to activate immediately without email confirmation links.

---

## Step 5: Connect App to Supabase

1. In Supabase Dashboard, go to **Project Settings** (gear icon) → **API**.
2. Copy your **Project URL** (e.g. `https://xxxx.supabase.co`) and **Publishable / anon key**.
3. Open **RentBill Pro** in your browser.
4. If prompted on startup (or click **Settings** / **Configure Supabase**):
   - Paste your **Supabase Project URL**.
   - Paste your **Supabase Anon Key**.
   - Click **Save & Connect**.

> **Security note:** Do **not** hardcode real credentials in [`js/core/config.js`](js/core/config.js) — only placeholders (`YOUR_PROJECT_ID` / `YOUR_KEY`) are committed. Supply the real values from your own browser (**Settings → Configure Supabase**, stored in your browser's `localStorage`) or inject them at build/deploy time via environment variables (see [Deployment on Cloudflare Pages](#deployment-on-cloudflare-pages)). The Supabase **anon/publishable key is public by design** — it ships to browsers anyway — so your database must rely on **Row Level Security**, never on hiding the anon key.

---

## Step 6: Default Logins & Verification

### Administrator Login
- **Email**: `admin@rentbill.com`
- **Password**: `Admin@123`

### Creating & Testing Tenant Logins
1. Log in as Administrator.
2. Go to **Settings** → **Tenant Logins** (or **Tenants Directory** → **Login & Password**).
3. Click **Create Login Account** on any tenant row.
4. Enter an Email and Password → click **Save Account**.
5. Log out and test signing in with the Tenant's email/mobile and password to verify the Resident Tenant Portal.

---

## Database Reset / Maintenance Scripts

| File | Purpose | When to use |
| :--- | :--- | :--- |
| **[`sql/delete/01_clear_all_data.sql`](sql/delete/01_clear_all_data.sql)** | Clear Data | Wipes test properties, bills, tenants, and payments while keeping database tables & Admin login intact |
| **[`sql/delete/02_reset_database.sql`](sql/delete/02_reset_database.sql)** | Full Teardown | Drops all tables, triggers, and RPC functions in `public` schema for a complete fresh database rebuild |

---

## Local Development

Run the application locally:

```bash
go run main.go
# or serve using any static server:
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser.

---

## Cross-Platform Single Binary Executable

RentBill Pro can be built into a standalone executable binary file for **Windows, macOS, and Linux** with **zero runtime dependencies** (no Node.js, Python, or web server installation needed on target systems).

### Building Executables

Ensure [Go](https://go.dev) (1.18+) is installed on your build machine, then run:

```bash
./build.sh
```

This compiles single binary executables into the `dist/` directory:
- `dist/rentbill-windows-amd64.exe` (Windows 64-bit)
- `dist/rentbill-darwin-arm64` (macOS Apple Silicon M1/M2/M3)
- `dist/rentbill-darwin-amd64` (macOS Intel)
- `dist/rentbill-linux-amd64` (Linux 64-bit)

### Running Portable Binary

Simply double-click or run the binary from the terminal:

```bash
# On Linux:
./dist/rentbill-linux-amd64

# On macOS:
./dist/rentbill-darwin-arm64

# On Windows:
.\dist\rentbill-windows-amd64.exe
```

The app will start a lightweight embedded web server and automatically open your default browser.

---

## Deployment on Cloudflare Pages

RentBill Pro deploys to **Cloudflare Pages** for **100% Free**, lightning-fast global edge hosting with automatic SSL and continuous deployment, backed by **Supabase Cloud**.

- **Edge CDN & Hosting**: [Cloudflare Pages](https://pages.cloudflare.com) (Free tier, Unlimited Bandwidth, Global Edge CDN, Free DDoS & WAF protection, automated SSL/TLS).
- **Edge Security**: `_headers` injecting strict Content Security Policy (`CSP`), HSTS, anti-clickjacking (`X-Frame-Options: DENY`), and permission policies.
- **Isolation Guarantee**: Multi-tenant Row Level Security (RLS) ensures tenants can only ever view their own unit's invoices and receipts. Landlord bank details, expenses, and other tenant profiles are completely blocked at the PostgreSQL engine level.

### Method 1: Git Integration (Recommended)

1. Push your RentBill repository to **GitHub** or **GitLab**:

```bash
git init
git add .
git commit -m "Initial RentBill Pro commit"
git remote add origin https://github.com/YOUR_USERNAME/rentbill.git
git push -u origin main
```

2. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com) and select **Workers & Pages** → **Create Application** → **Pages** → **Connect to Git**.
3. Select your `rentbill` repository.
4. Configure the Build & Deployment settings:
   - **Project Name**: `rentbill` (or any preferred name)
   - **Production Branch**: `main` (or `master`)
   - **Framework Preset**: `None`
   - **Build Command**: `bash cloudflare-build.sh`
   - **Build Output Directory**: `dist`
5. Click **Save and Deploy**. Within ~30 seconds, Cloudflare will deploy your application to a global edge address like `https://rentbill.pages.dev`.

#### Configure Supabase credentials (encrypted env vars)

Real Supabase credentials are **never committed** to the repo. The build script
[`cloudflare-build.sh`](cloudflare-build.sh) injects them from Cloudflare Pages
**encrypted environment variables** into a generated `dist/js/core/build-config.js`:

1. In the Cloudflare dashboard for your Pages project, go to **Settings → Environment variables**.
2. Add these two variables under **Production** (and **Preview** if you want previews to work):
   - `RENTBILL_SUPABASE_URL` = your Supabase **Project URL**, e.g. `https://abcd1234.supabase.co`
   - `RENTBILL_SUPABASE_KEY` = your Supabase **anon / publishable key**
3. Enable **"Encrypt"** on both, then **Save**. Trigger a new build (**Deployments → Retry deployment**).

> The anon key is public by design (browsers need it), so security comes from
> Supabase **Row Level Security** — see [Security Checklist & Verification](#security-checklist--verification). The `service_role`
> secret key must **never** be placed in these env vars or anywhere in the repo.

### Method 2: Direct CLI Deployment (Instant 1-Command Deploy)

If you don't want to use Git, deploy directly from your computer using Cloudflare Wrangler:

```bash
# Run from the project root:
bash cloudflare-build.sh
npx wrangler pages deploy dist --project-name=rentbill
```

Wrangler will ask you to log in to Cloudflare in your browser once, then upload and deploy your files immediately. Set the same `RENTBILL_SUPABASE_URL` / `RENTBILL_SUPABASE_KEY` environment variables (encrypted) in your Pages project **Settings → Environment variables** before deploying, or pass them to the build:

```bash
RENTBILL_SUPABASE_URL="https://abcd1234.supabase.co" \
RENTBILL_SUPABASE_KEY="YOUR_ANON_KEY" \
bash cloudflare-build.sh
```

### Post-Deployment Checklist

Once your Cloudflare URL is live (e.g. `https://rentbill.pages.dev`):

1. **Update Allowed URLs in Supabase**:
   - Go to [Supabase Dashboard](https://supabase.com/dashboard) → **Authentication** → **URL Configuration**.
   - Set **Site URL** to: `https://rentbill.pages.dev` (replace with your actual URL).
   - In **Redirect URLs**, add: `https://rentbill.pages.dev/**`.
   - Click **Save**.

### Included Cloudflare Configuration Files

| File | Purpose |
| :--- | :--- |
| **[`_redirects`](_redirects)** | Single Page Application (SPA) routing fallback to `index.html` |
| **[`_headers`](_headers)** | Security headers (`X-Frame-Options`, `XSS protection`) & 24hr static caching |
| **[`wrangler.toml`](wrangler.toml)** | Direct CLI deployment configuration |

---

## How Tenants Log In (Built-in Password Management & Universal Login)

1. **Landlord creates tenant & sets password in RentBill Pro**:
   - Navigate to **Documents** → **Tenants** → Click **+ Add Tenant**.
   - Fill in details including the tenant's **Mobile Number**, **Email Address**, and optional **Portal Login Password**.
   - Or, go to **Settings** → **Tenant Logins** tab: click **Create Login** / **Reset Password** on any tenant row to set/reset credentials anytime, copy login details, or share directly via WhatsApp in 1 click.
2. **Tenant logs in (Email or Mobile Number)**:
   - Tenant visits your RentBill Pro portal URL.
   - Enters their **Email** OR **Registered Mobile Number** (or username) and their Password.
   - The system automatically resolves their identifier, checks their credentials, matches their profile to their lease, and displays their scoped **Resident Tenant Portal**.
   - The tenant sees their unit, current balance, monthly invoices, can download A4 PDF receipts, or submit a payment reference/proof.
   - Landlord-only pages (Properties, Expenses, System Settings) are completely hidden and inaccessible.

---

## Custom Domain & Free SSL (Optional)

1. In Cloudflare Pages, navigate to **Custom Domains** → **Set up a custom domain**.
2. Enter your desired domain (e.g., `rent.yourdomain.com`).
3. If your domain's DNS is managed by Cloudflare, it will configure the CNAME automatically and issue an SSL/TLS certificate in minutes.

---

## Security Checklist & Verification

| Security Control | Implementation | Verification Method |
| :--- | :--- | :--- |
| **Row Level Security (RLS)** | Enabled on all PostgreSQL tables | cURL test without auth returns `401` or empty `[]` |
| **Tenant Data Isolation** | Filtered by `renter_id IN (SELECT id FROM renters WHERE user_id = auth.uid())` | Tenant login only returns bills for their assigned unit |
| **Landlord Privacy** | `expenses`, `owners.account_number`, `owner_withdrawals` restricted to `ADMIN` | Tenant querying `/rest/v1/expenses` receives empty list |
| **Content Security Policy** | Configured in `_headers` at Cloudflare Edge | Inspect HTTP response headers for `Content-Security-Policy` |
| **Anti-Clickjacking** | `X-Frame-Options: DENY` | Cannot be embedded in malicious iframes |
| **Transport Security** | `Strict-Transport-Security: max-age=31536000` | Automated HTTPS enforcement across all browsers |
| **Payment Verification** | Proof status marked `PENDING` until approved by landlord | Unverified tenant submissions do not alter bill status without admin confirmation |
