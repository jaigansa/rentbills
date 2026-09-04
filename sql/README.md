# 🗄️ SQL Database Scripts

These scripts build and manage the RentBill Pro **Supabase** database.
They are split into three folders — pick the one that matches what you're doing.

```
sql/
├── install/   → build a brand-new database
├── update/    → upgrade an existing database (keeps your data)
└── delete/    → wipe data or reset everything
```

---

## 📥 install/ — Brand-New Database

| File | What it does |
|---|---|
| [`install/00_master_schema.sql`](install/00_master_schema.sql) | **One file, everything.** Tables, security, roles (Admin/Tenant/Staff/Auditor), user management, and the default Admin login. Run the whole file in the SQL Editor. |

## 🔄 update/ — Existing Database

| File | What it does |
|---|---|
| [`update/01_upgrade_existing_database.sql`](update/01_upgrade_existing_database.sql) | **Safe upgrade.** Adds the newest features (maintenance, Staff/Auditor roles, user management, security fix) without touching your data. Idempotent — safe to re-run. |

## 🗑️ delete/ — Cleanup

| File | What it does |
|---|---|
| [`delete/01_clear_all_data.sql`](delete/01_clear_all_data.sql) | Deletes **all business data** (properties, bills, tenants...) but keeps tables + Admin login. Starts fresh, keeps structure. |
| [`delete/02_reset_database.sql`](delete/02_reset_database.sql) | **Full teardown.** Drops every table, trigger, policy, and function. Completely empty database. |

---

## 💡 Quick guide

- **Never had a database?** → `install/00_master_schema.sql`
- **Already have data, want the latest features?** → `update/01_upgrade_existing_database.sql`
- **Just testing, want clean data?** → `delete/01_clear_all_data.sql`
- **Delete everything and restart?** → `delete/02_reset_database.sql`

> ⚠️ **Delete scripts are destructive.** Back up your data before running them.
