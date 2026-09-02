# RentBill Pro — Production-Grade Offline-First Property & Rental Management System

## MASTER BUILD PROMPT

You are a senior software architect, Go developer, database engineer, accounting-system designer, security engineer, UX designer, and offline-sync engineer.

Build a production-grade application called **RentBill Pro**.

RentBill Pro is a self-hosted property/rental management system designed for landlords and small property managers.

The application must work:

- completely offline
- on a local computer
- over a local LAN
- with optional Supabase cloud synchronization
- with multiple devices
- without duplicate financial records
- without silent financial data loss
- without corrupting accounting data

The application must be **local-first**, not cloud-dependent.

---

# 1. NON-NEGOTIABLE PRINCIPLES

Follow these rules throughout the entire project.

### Rule 1 — Local-first

SQLite is the local operational database.

The application must continue working when the internet is unavailable.

### Rule 2 — Cloud synchronization is optional

Supabase is used for:

- cloud synchronization
- centralized cloud data
- multi-device synchronization
- cloud backup
- Supabase Storage
- optional authentication/integration features

The application must NOT stop working when Supabase is unavailable.

### Rule 3 — Never silently overwrite financial data

For financial conflicts:

```text
DO NOT use blind last-write-wins.
```

Use conflict detection and administrator resolution.

### Rule 4 — Financial operations are transactional

Bills, payments, arrears, settlements, meter corrections, etc. must use database transactions.

### Rule 5 — No floating-point money

Store monetary values as integer paise.

Example:

```text
₹1,250.50 = 125050 paise
```

### Rule 6 — Never physically delete financial history

Use:

```text
VOID
REVERSAL
SOFT DELETE
```

where appropriate.

### Rule 7 — Backend is authoritative

Frontend calculations are previews only.

The Go backend recalculates and validates all financial values before saving.

### Rule 8 — Every synchronized record has a UUID

Never use SQLite auto-increment IDs as the global synchronization identity.

### Rule 9 — Sync must be idempotent

Retrying the same sync operation must never create duplicate:

- bills
- payments
- tenants
- expenses
- documents

### Rule 10 — Every important financial mutation is audited.

---

# 2. TECHNOLOGY STACK

## Backend

Use:

- Go
- Gin
- `database/sql`
- `modernc.org/sqlite`
- Go standard library wherever practical

CGO must remain disabled.

The final production application must compile into a standalone binary.

---

# 3. FRONTEND

Use:

- HTML
- CSS
- Vanilla JavaScript

Do NOT use:

- React
- Vue
- Angular
- Next.js
- external frontend frameworks

Use local bundled assets.

Use Go `//go:embed`.

Suggested:

```text
web/
├── index.html
├── css/
├── js/
├── icons/
├── fonts/
└── vendor/
```

No production dependency may require an internet connection.

---

# 4. OPTIONAL FRONTEND LIBRARIES

If needed, locally bundle:

- Lucide
- Chart.js
- QR-code library

Never use:

```text
CDN
Google Fonts
remote JavaScript
remote CSS
remote analytics
```

---

# 5. APPLICATION DIRECTORY

Create automatically:

```text
rentbill/
├── data/
├── backups/
├── uploads/
│   ├── proofs/
│   ├── maintenance/
│   └── documents/
├── logs/
└── config.json
```

Do not assume directories exist.

Create them safely during startup.

---

# 6. CONFIGURATION

Use:

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 8080
  },
  "database": {
    "path": "data/rentbill.db"
  },
  "uploads": {
    "path": "uploads"
  },
  "backups": {
    "path": "backups",
    "retention_days": 30
  },
  "sync": {
    "enabled": false,
    "interval_seconds": 30
  }
}
```

Never hardcode important filesystem paths or ports.

---

# 7. DATABASE

Use SQLite.

Enable:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

Important:

`foreign_keys = ON` is connection-specific.

Implement database initialization correctly so foreign-key enforcement is active for every connection used by the application.

---

# 8. DATABASE MIGRATIONS

Do not recreate the database on startup.

Implement versioned migrations.

Example:

```text
internal/migrations/
├── 001_initial.sql
├── 002_sync.sql
├── 003_payments.sql
└── ...
```

Create:

```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Never destroy existing user data during migrations.

---

# 9. GLOBAL SYNCHRONIZATION IDENTITY

Every synchronizable record must contain:

```text
uuid
created_at
updated_at
version
device_id
deleted_at
```

Example:

```sql
uuid TEXT NOT NULL UNIQUE
```

UUID is the global record identity.

SQLite integer IDs are local database IDs only.

---

# 10. DEVICE ID

Generate a persistent unique device ID during first startup.

Store it locally.

Example:

```text
device_id = UUID
```

Every local mutation records the device ID.

Do not regenerate the device ID on every startup.

---

# 11. PROPERTY MODEL

Hierarchy:

```text
Property
    ↓
Unit
    ↓
Tenant
    ↓
Bills
    ↓
Payments
```

---

# 12. PROPERTIES

```sql
CREATE TABLE properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    name TEXT NOT NULL,
    address TEXT,

    owner_name TEXT,

    agreement_terms TEXT,

    is_active INTEGER NOT NULL DEFAULT 1,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    version INTEGER NOT NULL DEFAULT 1,
    device_id TEXT NOT NULL,
    deleted_at DATETIME
);
```

---

# 13. UNITS

```sql
CREATE TABLE units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    property_id INTEGER NOT NULL,

    unit_name TEXT NOT NULL,
    floor TEXT,

    default_rent INTEGER NOT NULL DEFAULT 0,
    default_maint INTEGER NOT NULL DEFAULT 0,

    agreement_terms TEXT,

    status TEXT NOT NULL DEFAULT 'VACANT',

    is_active INTEGER NOT NULL DEFAULT 1,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    version INTEGER NOT NULL DEFAULT 1,
    device_id TEXT NOT NULL,
    deleted_at DATETIME,

    FOREIGN KEY(property_id)
        REFERENCES properties(id)
        ON DELETE RESTRICT,

    UNIQUE(property_id, unit_name)
);
```

Allowed status:

```text
VACANT
OCCUPIED
RESERVED
MAINTENANCE
```

---

# 14. TENANTS

Use table name `renters` if maintaining compatibility with the original design.

```sql
CREATE TABLE renters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    unit_id INTEGER NOT NULL,

    name TEXT NOT NULL,

    mobile_number TEXT,
    email TEXT,

    aadhar_no TEXT,
    perm_address TEXT,
    emergency_contact TEXT,
    occupation TEXT,

    move_in_date DATE,

    advance_amount INTEGER NOT NULL DEFAULT 0,

    base_rent INTEGER NOT NULL DEFAULT 0,
    eb_unit_price INTEGER NOT NULL DEFAULT 0,

    maint_charge INTEGER NOT NULL DEFAULT 0,

    water_calc_mode TEXT NOT NULL DEFAULT 'FIXED',
    water_fixed_charge INTEGER NOT NULL DEFAULT 0,
    water_unit_price INTEGER NOT NULL DEFAULT 0,

    initial_eb INTEGER NOT NULL DEFAULT 0,
    initial_water INTEGER NOT NULL DEFAULT 0,

    pending_arrears INTEGER NOT NULL DEFAULT 0,

    assigned_upi TEXT,

    co_tenant_names TEXT,

    is_active INTEGER NOT NULL DEFAULT 1,

    vacate_date DATE,
    exit_reason TEXT,

    password_hash TEXT,

    agreement_start_date DATE,
    agreement_expiry_date DATE,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    version INTEGER NOT NULL DEFAULT 1,
    device_id TEXT NOT NULL,
    deleted_at DATETIME,

    FOREIGN KEY(unit_id)
        REFERENCES units(id)
        ON DELETE RESTRICT
);
```

---

# 15. ACTIVE TENANT RULE

One unit can have only one active primary tenant.

Tenant assignment must happen inside a transaction.

```text
BEGIN

check active tenant for unit

if active tenant exists:
    reject

assign tenant

update unit status

audit

sync queue

COMMIT
```

Never rely only on frontend validation.

---

# 16. TENANT TRANSFER

Support:

```text
Tenant
Room 101
     ↓
Room 205
```

The old unit and new unit relationship must be audited.

Do not change historical bills to the new unit.

Historical bills remain associated with the original tenant and historical relationship.

---

# 17. TENANT HISTORY

When a tenant leaves:

Do not delete the tenant.

Keep:

```text
move_in_date
vacate_date
exit_reason
final settlement
historical bills
payment history
documents
maintenance history
```

---

# 18. BILL TABLE

```sql
CREATE TABLE bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    renter_id INTEGER NOT NULL,

    billing_period TEXT NOT NULL,
    -- YYYY-MM

    prev_eb_reading INTEGER NOT NULL DEFAULT 0,
    curr_eb_reading INTEGER,

    eb_unit_price INTEGER NOT NULL DEFAULT 0,
    eb_amount INTEGER NOT NULL DEFAULT 0,

    prev_water_reading INTEGER NOT NULL DEFAULT 0,
    curr_water_reading INTEGER,

    water_unit_price INTEGER NOT NULL DEFAULT 0,
    water_calc_mode TEXT NOT NULL DEFAULT 'FIXED',
    water_amount INTEGER NOT NULL DEFAULT 0,

    rent_amount INTEGER NOT NULL DEFAULT 0,
    maint_amount INTEGER NOT NULL DEFAULT 0,
    others INTEGER NOT NULL DEFAULT 0,

    arrears_included INTEGER NOT NULL DEFAULT 0,

    late_fee INTEGER NOT NULL DEFAULT 0,

    discount_amount INTEGER NOT NULL DEFAULT 0,

    write_off_amount INTEGER NOT NULL DEFAULT 0,

    gross_amount INTEGER NOT NULL DEFAULT 0,

    net_amount INTEGER NOT NULL DEFAULT 0,

    paid_amount INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'UNPAID',

    payment_date DATE,
    payment_method TEXT,
    payment_details TEXT,

    proof_status TEXT NOT NULL DEFAULT 'NONE',
    proof_ref TEXT,
    proof_photo TEXT,
    proof_date DATETIME,

    notes TEXT,

    voided_at DATETIME,
    voided_by INTEGER,
    void_reason TEXT,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    version INTEGER NOT NULL DEFAULT 1,
    device_id TEXT NOT NULL,
    deleted_at DATETIME,

    FOREIGN KEY(renter_id)
        REFERENCES renters(id)
        ON DELETE RESTRICT,

    UNIQUE(renter_id, billing_period)
);
```

---

# 19. BILL PERIOD

Store:

```text
2026-08
```

not:

```text
August 2026
```

Display formatting happens only in the UI.

---

# 20. ONE BILL PER TENANT PER PERIOD

Database must enforce:

```sql
UNIQUE(renter_id, billing_period)
```

Duplicate bill attempts must return a controlled error.

Example:

```json
{
  "error": {
    "code": "BILL_DUPLICATE",
    "message": "A bill already exists for this tenant and billing period."
  }
}
```

---

# 21. ELECTRICITY CALCULATION

```text
units =
    current_eb_reading - previous_eb_reading

eb_amount =
    units × eb_unit_price
```

Require:

```text
current >= previous
```

Otherwise reject.

Never silently produce negative consumption.

---

# 22. WATER CALCULATION

FIXED:

```text
water_amount =
    water_fixed_charge
```

METERED:

```text
units =
    current_water_reading - previous_water_reading

water_amount =
    units × water_unit_price
```

Require:

```text
current >= previous
```

unless explicit meter-reset workflow is used.

---

# 23. METER RESET

Support meter replacement/reset.

Record:

```text
meter type
old reading
new initial reading
reset date
reason
user
```

Do not treat a legitimate meter reset as negative consumption.

Audit every reset.

---

# 24. METER READING CHAIN

First bill:

```text
previous EB =
    renter.initial_eb
```

Subsequent bill:

```text
previous EB =
    previous valid non-voided bill.current EB
```

Same for water.

The application must not silently accept an inconsistent previous reading.

---

# 25. AUTHORITATIVE BILL FORMULA

All financial calculations must use the same backend accounting service.

### Current charges

```text
current_charges =
    rent_amount
  + maint_amount
  + water_amount
  + eb_amount
  + others
  + late_fee
```

### Gross

```text
gross_amount =
    current_charges
  + arrears_included
```

### Net

```text
net_amount =
    gross_amount
  - discount_amount
  - write_off_amount
```

### Balance

```text
balance_due =
    net_amount
  - verified_payments
```

Do not create alternate formulas elsewhere.

---

# 26. FINANCIAL VALIDATION

Never allow:

```text
negative rent
negative water
negative EB
negative maintenance
negative payment
negative discount
negative write-off
```

unless explicitly defined as an accounting adjustment.

Never allow:

```text
discount > gross_amount
write_off > outstanding balance
```

without an authorized override.

---

# 27. PAYMENT TABLE

Do not use `bills.paid_amount` as the only payment record.

Create:

```sql
CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    bill_id INTEGER NOT NULL,
    renter_id INTEGER NOT NULL,

    amount INTEGER NOT NULL,

    payment_method TEXT,

    transaction_reference TEXT,

    payment_date DATETIME NOT NULL,

    proof_status TEXT NOT NULL DEFAULT 'NONE',

    proof_photo TEXT,

    verified_at DATETIME,
    verified_by INTEGER,

    reversed_at DATETIME,
    reversed_by INTEGER,
    reversal_reason TEXT,

    notes TEXT,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    version INTEGER NOT NULL DEFAULT 1,
    device_id TEXT NOT NULL,
    deleted_at DATETIME,

    FOREIGN KEY(bill_id)
        REFERENCES bills(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(renter_id)
        REFERENCES renters(id)
        ON DELETE RESTRICT
);
```

---

# 28. PAYMENT STATUS

Allowed:

```text
UNPAID
PARTIAL
PAID
OVERPAID
VOID
```

Derive status from verified payments.

Do not allow the frontend to arbitrarily set:

```text
is_paid = true
```

---

# 29. PARTIAL PAYMENT

Example:

```text
Bill = ₹10,000
Verified payment = ₹4,000

Balance = ₹6,000

Status = PARTIAL
```

---

# 30. FULL PAYMENT

```text
Bill = ₹10,000
Verified payment = ₹10,000

Balance = ₹0

Status = PAID
```

---

# 31. OVERPAYMENT

If:

```text
payments > bill.net_amount
```

show:

```text
OVERPAID
```

Do not silently lose the excess amount.

Create a tenant credit/advance mechanism.

---

# 32. TENANT CREDIT / ADVANCE

Create:

```sql
CREATE TABLE tenant_credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    renter_id INTEGER NOT NULL,

    source_payment_id INTEGER,

    amount INTEGER NOT NULL,

    remaining_amount INTEGER NOT NULL,

    reason TEXT,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(renter_id)
        REFERENCES renters(id)
        ON DELETE RESTRICT
);
```

Example:

```text
Bill = ₹10,000
Payment = ₹12,000

Bill paid = ₹10,000
Credit = ₹2,000
```

Credit can later be allocated against another bill.

---

# 33. PAYMENT ALLOCATION

Support allocation across bills.

Example:

```text
August outstanding = ₹8,000
September outstanding = ₹10,000

Tenant pays = ₹15,000
```

Allocation:

```text
August = ₹8,000
September = ₹7,000
Remaining = ₹0
```

Every payment allocation must be recorded.

---

# 34. PAYMENT ALLOCATIONS TABLE

```sql
CREATE TABLE payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    payment_id INTEGER NOT NULL,
    bill_id INTEGER NOT NULL,

    amount INTEGER NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(payment_id)
        REFERENCES payments(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(bill_id)
        REFERENCES bills(id)
        ON DELETE RESTRICT
);
```

Validate:

```text
sum allocations <= payment amount
```

and:

```text
sum allocations <= bill outstanding
```

unless credit/overpayment is explicitly handled.

---

# 35. PAYMENT REVERSAL

Never simply edit a verified payment amount.

Provide:

```text
REVERSE PAYMENT
```

with:

```text
reason
user
date
```

Create a reversal record/audit event.

Recalculate bill balance transactionally.

---

# 36. ARREARS

`renters.pending_arrears` means:

> Outstanding tenant debt that has not yet been allocated into a bill.

It must not duplicate the balance already represented elsewhere.

---

# 37. ARREARS ALLOCATION

When creating a bill:

```text
arrears_included =
    amount allocated from pending_arrears
```

Then transactionally:

```text
pending_arrears -= arrears_included
```

Never allocate more than available arrears unless an authorized override exists.

---

# 38. ARREARS TRANSACTION

Bill creation:

```text
BEGIN

validate tenant

calculate current charges

calculate available arrears

allocate arrears

create bill

update arrears

create audit log

create sync queue item

COMMIT
```

If anything fails:

```text
ROLLBACK
```

---

# 39. BILL VOIDING

Do not physically delete normal bills.

Use:

```text
VOID
```

A void operation must:

```text
load bill
verify authorization
reverse applicable financial allocations
reverse payment allocations if permitted
mark bill VOID
record reason
record user
audit
queue sync
broadcast event
COMMIT
```

Voided bills:

- do not count in revenue
- do not count in outstanding
- do not count in arrears
- do not accept new payments
- remain visible in history
- remain auditable

---

# 40. TENANT LEDGER

Create a proper tenant ledger.

The ledger should show chronological financial events:

```text
2026-08-01  Bill             +₹10,000
2026-08-05  Payment           -₹5,000
2026-08-10  Late Fee            +₹200
2026-08-10  Discount            -₹500
--------------------------------------
Balance                         ₹4,700
```

The ledger must be reconstructable from financial events.

---

# 41. FINANCIAL EVENT TABLE

Implement:

```sql
CREATE TABLE financial_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    renter_id INTEGER NOT NULL,

    event_type TEXT NOT NULL,

    reference_type TEXT,
    reference_uuid TEXT,

    debit_amount INTEGER NOT NULL DEFAULT 0,
    credit_amount INTEGER NOT NULL DEFAULT 0,

    description TEXT,

    event_date DATETIME NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    device_id TEXT NOT NULL,

    FOREIGN KEY(renter_id)
        REFERENCES renters(id)
        ON DELETE RESTRICT
);
```

Possible event types:

```text
BILL
PAYMENT
PAYMENT_REVERSAL
DISCOUNT
WRITE_OFF
LATE_FEE
ARREARS
ARREARS_ALLOCATION
CREDIT
CREDIT_ALLOCATION
REFUND
REFUND_REVERSAL
```

The ledger is an accounting history, not merely a UI table.

---

# 42. RECURRING BILLING

Allow recurring configuration:

```text
base rent
maintenance
water mode
water price
EB price
other recurring charges
late fee rules
due date
```

Generate monthly bills.

Do not create duplicates.

Use:

```text
UNIQUE(renter_id, billing_period)
```

as final protection.

---

# 43. LATE FEE RULES

Support configurable:

```text
FIXED
PERCENTAGE
PER_DAY
```

Example:

```text
₹100 fixed
```

or:

```text
2%
```

or:

```text
₹10 per late day
```

The exact configured rule must be stored/audited when the bill is generated.

---

# 44. EXPENSES

```sql
CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    category TEXT NOT NULL,

    amount INTEGER NOT NULL,

    date DATE NOT NULL,

    notes TEXT,

    owner_name TEXT,

    created_by INTEGER,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    version INTEGER NOT NULL DEFAULT 1,
    device_id TEXT NOT NULL,
    deleted_at DATETIME
);
```

Expenses are separate from owner withdrawals.

---

# 45. OWNER WITHDRAWALS

```sql
CREATE TABLE owner_withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    owner_name TEXT NOT NULL,

    amount INTEGER NOT NULL,

    date DATE NOT NULL,

    notes TEXT,

    created_by INTEGER,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    version INTEGER NOT NULL DEFAULT 1,
    device_id TEXT NOT NULL,
    deleted_at DATETIME
);
```

Owner withdrawals are NOT operating expenses.

---

# 46. FINAL TENANT SETTLEMENT

When tenant leaves:

Calculate:

```text
total_deductions =
    rent_due
  + eb_due
  + water_due
  + maintenance_due
  + repair_deduction
  + other_deductions
```

Then:

```text
settlement =
    advance_amount
  - total_deductions
```

If positive:

```text
REFUND DUE TO TENANT
```

If negative:

```text
AMOUNT DUE FROM TENANT
```

---

# 47. SETTLEMENT TABLE

Create a dedicated settlement record containing:

```text
advance
rent due
EB due
water due
maintenance due
repair deduction
other deductions
refund
remaining tenant debt
refund date
refund method
refund reference
status
```

Never store only one ambiguous `exit_balance`.

---

# 48. REFUNDS

Track:

```text
PENDING
PROCESSED
CANCELLED
```

with:

```text
amount
date
method
reference
verified_by
```

---

# 49. MAINTENANCE

Create maintenance task management.

Fields:

```text
tenant
property
unit
title
description
category
priority
status
estimated cost
actual cost
photo
reported date
resolved date
```

Statuses:

```text
PENDING
IN_PROGRESS
RESOLVED
CANCELLED
```

---

# 50. DOCUMENT MANAGEMENT

Support:

- rental agreements
- identity documents
- payment proofs
- maintenance photos
- other documents

Store metadata in SQLite and files separately.

---

# 51. FILE STORAGE

Local:

```text
uploads/
```

Cloud:

```text
Supabase Storage
```

Every file gets:

```text
file_uuid
stored_name
SHA-256
size
MIME
entity_uuid
upload_status
```

Never use the original filename as the storage path.

---

# 52. FILE SECURITY

Validate:

```text
extension
MIME
size
file signature where practical
```

Prevent:

```text
path traversal
executable uploads
HTML execution
malicious SVG
oversized files
```

Suggested limits:

```text
payment proof: 5 MB
maintenance image: 10 MB
document: 10 MB
```

Serve private files only after authorization.

---

# 53. USERS

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    username TEXT NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    email TEXT,

    role TEXT NOT NULL DEFAULT 'ADMIN',

    is_active INTEGER NOT NULL DEFAULT 1,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Use Argon2id or another strong password hashing algorithm.

Never store plaintext passwords.

---

# 54. AUTHORIZATION

Roles:

```text
ADMIN
TENANT
```

Admin can manage authorized properties.

Tenant can only access their own data.

Never trust browser-supplied:

```text
tenant_id
property_id
user_id
```

Authorization must happen server-side.

---

# 55. TENANT PORTAL

Tenant can:

- view profile
- view current bills
- view previous bills
- view balance
- view ledger
- view payment history
- submit payment proof
- submit UTR
- view payment verification status
- download receipts
- create maintenance requests
- view maintenance status
- view permitted documents

Tenant cannot:

- edit bills
- change rent
- modify arrears
- verify payments
- void bills
- access another tenant
- access admin reports
- modify accounting

---

# 56. PAYMENT PROOF

Statuses:

```text
NONE
PENDING
VERIFIED
REJECTED
```

Uploading proof does not mean payment is automatically accepted.

Admin must verify.

---

# 57. PAYMENT VERIFICATION

Use transaction:

```text
BEGIN

load payment

verify authorization

verify proof state

validate amount

mark verified

allocate payment

update financial events

recalculate bill

audit

queue sync

broadcast

COMMIT
```

---

# 58. AUDIT LOG

Create structured audit records:

```sql
CREATE TABLE activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    entity_type TEXT NOT NULL,
    entity_uuid TEXT,

    action TEXT NOT NULL,

    old_value TEXT,
    new_value TEXT,

    amount INTEGER DEFAULT 0,

    username TEXT,

    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Examples:

```text
BILL CREATED
BILL UPDATED
BILL VOIDED
PAYMENT VERIFIED
PAYMENT REVERSED
TENANT TRANSFERRED
ARREARS ALLOCATED
METER RESET
SETTLEMENT CREATED
```

---

# 59. OFFLINE-FIRST ARCHITECTURE

The local application is the primary working environment.

```text
Browser
   ↓
Go API
   ↓
SQLite
   ↓
Sync Queue
   ↓
Sync Engine
   ↓
Supabase
```

If internet is unavailable:

```text
Browser
   ↓
Go
   ↓
SQLite
   ↓
Sync Queue = PENDING
```

Application continues operating normally.

---

# 60. SYNC QUEUE

Create:

```sql
CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    entity_type TEXT NOT NULL,

    entity_uuid TEXT NOT NULL,

    operation TEXT NOT NULL,

    payload TEXT NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    synced_at DATETIME,

    retry_count INTEGER NOT NULL DEFAULT 0,

    status TEXT NOT NULL DEFAULT 'PENDING',

    last_error TEXT,

    next_retry_at DATETIME
);
```

Operations:

```text
CREATE
UPDATE
DELETE
VOID
REVERSAL
```

---

# 61. CRITICAL SYNC TRANSACTION

Every local database mutation and its sync queue record must be committed in the same transaction.

Example:

```text
BEGIN

UPDATE bill

INSERT sync_queue

INSERT audit log

COMMIT
```

If queue insertion fails:

```text
ROLLBACK
```

This prevents local data from changing without being queued for synchronization.

---

# 62. SYNC ENGINE

Run a background sync worker.

Example:

```text
every 30 seconds
```

also support:

```text
Sync Now
```

button.

The sync engine should:

1. detect connectivity
2. read pending queue
3. upload changes
4. receive server acknowledgement
5. process remote changes
6. detect conflicts
7. update local state
8. mark queue entries synced

---

# 63. SYNC STATUS

Display:

```text
ONLINE
OFFLINE
SYNCING
SYNCED
SYNC ERROR
CONFLICT
```

Show:

```text
Last successful sync:
2026-08-31 18:40
```

Admin can press:

```text
SYNC NOW
```

---

# 64. SYNC RETRIES

If synchronization fails:

```text
PENDING
 ↓
RETRY
 ↓
RETRY
 ↓
RETRY
 ↓
FAILED
```

Use exponential backoff.

Do not continuously hammer Supabase.

---

# 65. DEAD-LETTER / FAILED SYNC

After configurable retry count:

```text
FAILED
```

Move the item into a visible failed-sync queue.

Admin can:

```text
Inspect
Retry
Resolve
Discard
```

Do not silently discard failed financial changes.

---

# 66. IDEMPOTENT SYNC

Every synchronization request must contain the mutation UUID.

Supabase must enforce uniqueness.

If the same mutation is received twice:

```text
DO NOT create a second record.
```

Return the existing result.

---

# 67. SYNC ORDERING

Respect dependencies.

Example:

```text
CREATE PROPERTY
    ↓
CREATE UNIT
    ↓
CREATE TENANT
    ↓
CREATE BILL
    ↓
CREATE PAYMENT
```

Never upload a child record before its required parent exists.

---

# 68. SOFT DELETE / TOMBSTONES

Never immediately remove synchronization metadata.

Use:

```text
deleted_at
```

A deletion becomes:

```text
soft deleted
```

and synchronizes to other devices.

Keep tombstones long enough to ensure other devices can receive the deletion.

---

# 69. CONFLICT DETECTION

Every synchronizable record has:

```text
version
updated_at
device_id
```

If:

```text
local.version != server.version
```

and both sides have changed:

```text
CONFLICT
```

Do not silently overwrite.

---

# 70. CONFLICT TYPES

Detect:

```text
UPDATE vs UPDATE
UPDATE vs DELETE
DELETE vs UPDATE
PAYMENT vs PAYMENT
BILL vs BILL
METER vs METER
```

---

# 71. FINANCIAL CONFLICTS

For:

```text
bills
payments
arrears
settlements
expenses
withdrawals
financial events
```

never use blind last-write-wins.

Create a conflict record.

---

# 72. SYNC CONFLICT TABLE

Create:

```sql
CREATE TABLE sync_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    uuid TEXT NOT NULL UNIQUE,

    entity_type TEXT NOT NULL,
    entity_uuid TEXT NOT NULL,

    local_version INTEGER,
    remote_version INTEGER,

    local_payload TEXT NOT NULL,
    remote_payload TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'OPEN',

    resolution TEXT,

    resolved_by INTEGER,
    resolved_at DATETIME,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

# 73. CONFLICT UI

Admin must be able to see:

```text
CONFLICT DETECTED

Local:
Payment = ₹5,000

Cloud:
Payment = ₹7,000
```

Actions:

```text
Keep Local
Keep Cloud
Merge
Create Adjustment
Resolve Manually
```

For financial records, provide enough information for an informed decision.

Every resolution must be audited.

---

# 74. NEVER AUTO-MERGE FINANCIAL AMOUNTS

Never do:

```text
5000 + 7000 = 12000
```

unless the business logic explicitly determines these are two separate payments.

Conflicting financial values require interpretation.

---

# 75. SUPABASE ARCHITECTURE

Use Supabase as the central cloud database.

Recommended:

```text
Supabase PostgreSQL
Supabase Auth
Supabase Storage
Supabase Realtime where useful
```

Do not expose the Supabase service-role key to the browser.

---

# 76. SUPABASE DATABASE

Create cloud equivalents for synchronizable entities:

```text
properties
units
renters
bills
payments
payment_allocations
tenant_credits
tenant_ledger/financial_events
expenses
owner_withdrawals
maintenance_tasks
documents
activity_logs
sync_mutations
sync_conflicts
```

Use UUID as the primary synchronization identity.

---

# 77. SUPABASE RLS

Enable Row Level Security.

Tenant users must only access their own records.

Admin users can access authorized properties.

Never depend solely on frontend filtering.

---

# 78. CLOUD SYNC MUTATIONS

Create a cloud mutation/idempotency table.

Example:

```text
mutation_uuid
device_id
entity_uuid
operation
processed_at
```

Unique constraint:

```text
mutation_uuid
```

This prevents duplicate processing.

---

# 79. SUPABASE DATA OWNERSHIP

The cloud record should contain:

```text
uuid
device_id
version
created_at
updated_at
deleted_at
```

The sync engine must preserve these values correctly.

---

# 80. MULTI-DEVICE EXAMPLE

Device A offline:

```text
Bill #X = ₹10,000
```

Device B offline:

```text
Bill #X = ₹12,000
```

When both synchronize:

```text
Supabase
   ↓
Conflict detected
```

Do NOT silently choose one.

Admin resolves.

---

# 81. CLOUD UNAVAILABLE

If Supabase is down:

```text
SQLite continues normally.
```

Display:

```text
Cloud Sync Offline
Local data is safe.
```

Queue changes.

Resume automatically when connectivity returns.

---

# 82. LOCAL DATABASE FAILURE

Provide:

```text
automatic backup
manual backup
restore
database integrity check
```

---

# 83. BACKUP

Run automatic local database backup at least once per day.

Use a real timestamp generated by Go.

Example:

```text
auto_2026-08-31_18-35-00_backup.db
```

Never use a literal placeholder filename.

---

# 84. BACKUP VALIDATION

After creating a backup:

```text
file exists
file size > 0
database can be opened
PRAGMA integrity_check
PRAGMA foreign_key_check
```

Record success/failure.

---

# 85. BACKUP RETENTION

Default:

```text
30 days
```

Make configurable.

Never delete the live database.

Never overwrite existing backups.

---

# 86. SUPABASE AS CLOUD BACKUP

Local SQLite backups and Supabase synchronization are separate concepts.

Do not call synchronization "backup".

The system should support:

```text
Local Backup
Cloud Sync
Cloud Storage
```

independently.

---

# 87. FILE SYNCHRONIZATION

Files should not be placed inside the normal database sync payload.

Use:

```text
Local file
   ↓
File metadata in SQLite
   ↓
Upload queue
   ↓
Supabase Storage
```

Use SHA-256 to avoid duplicate uploads.

---

# 88. FILE SYNC STATES

```text
LOCAL_ONLY
UPLOADING
CLOUD
FAILED
CONFLICT
```

If the same file already exists by hash:

```text
do not upload duplicate
```

---

# 89. SSE REALTIME

Local clients can use:

```text
/api/events/stream
```

Events:

```text
BILL_CREATED
BILL_UPDATED
PAYMENT_VERIFIED
PAYMENT_REVERSED
BILL_VOIDED
TENANT_UPDATED
MAINTENANCE_UPDATED
EXPENSE_CREATED
SYNC_COMPLETED
SYNC_FAILED
CONFLICT_CREATED
```

---

# 90. SSE SECURITY

Admin receives authorized global events.

Tenant receives only events belonging to that tenant.

Do not leak:

```text
another tenant's name
bill amount
payment details
property data
```

---

# 91. SSE BROKER

Implement:

```text
subscriber registration
subscriber cleanup
disconnect detection
heartbeat
safe broadcast
slow subscriber handling
```

Never write to closed channels.

Never let one dead client block the server.

---

# 92. REPORTS

Dashboard:

```text
Total billed
Total collected
Outstanding
Current arrears
Expenses
Owner withdrawals
Net operating result
Active tenants
Vacant units
Pending maintenance
Pending payment proofs
Sync status
Backup status
```

Keep:

```text
revenue
collections
receivables
expenses
withdrawals
```

separate.

---

# 93. TENANT LEDGER REPORT

Show:

```text
Date
Description
Debit
Credit
Balance
Reference
```

Allow:

```text
print
PDF
CSV
```

---

# 94. PROPERTY REPORTS

Provide:

```text
occupancy
vacancy
rent collection
arrears
expenses
maintenance
tenant list
agreement expiry
```

---

# 95. IMPORT / EXPORT

Support:

```text
CSV tenant import
CSV bill import
CSV expense import
CSV export
JSON export
full database backup
PDF reports
```

Imports must use:

```text
Preview
↓
Validate
↓
Show errors
↓
Confirm
↓
Transaction
↓
Import
```

Never partially import invalid data.

---

# 96. RECEIPTS

Receipts must display:

```text
business/property
tenant
unit
billing period
rent
maintenance
water
electricity
other
arrears
late fee
discount
write-off
gross
net
paid
balance
payment method
transaction reference
payment date
```

Receipt calculations must come from the backend accounting service.

---

# 97. RECEIPT NUMBER

Implement unique receipt numbers.

Example:

```text
RB-2026-000001
```

Never reuse a receipt number.

Voided receipts remain in history.

---

# 98. BILL NUMBER

Implement unique bill numbers.

Example:

```text
INV-2026-000001
```

Do not use SQLite ID alone as the human-readable bill number.

---

# 99. SECURITY

Implement:

```text
HttpOnly cookies
SameSite cookies
Secure cookies when HTTPS
CSRF protection
authentication middleware
authorization middleware
rate limiting
password hashing
session expiry
logout
session regeneration
input validation
file validation
```

---

# 100. LOGIN SECURITY

Protect login against brute force.

Use:

```text
rate limiting
failed attempt tracking
generic error messages
session expiration
```

Never reveal whether username or password was incorrect.

---

# 101. SENSITIVE DATA

Protect:

```text
Aadhaar
mobile numbers
email
documents
payment proofs
transaction references
```

Do not expose them unnecessarily in logs or API responses.

---

# 102. LOGGING

Log:

```text
startup
shutdown
database errors
migration errors
backup failures
sync failures
authentication failures
important financial operations
```

Never log:

```text
passwords
password hashes
session cookies
secret keys
service-role keys
private document contents
```

---

# 103. PANIC RECOVERY

Gin must use recovery middleware.

Do not expose stack traces to users.

Log stack traces server-side.

---

# 104. DATABASE HEALTH

Admin health page:

```text
Database
Database size
SQLite WAL
Schema version
Foreign key check
Integrity check
Last backup
Backup status
Disk space
Sync status
Last sync
Pending sync count
Failed sync count
Open conflicts
```

---

# 105. ACCOUNTING INVARIANTS

The diagnostic system must detect:

```text
negative financial values
duplicate bills
payment totals inconsistent
allocation totals inconsistent
void bills included in reports
void payments included in balances
negative pending arrears
invalid meter chain
multiple active tenants in one unit
orphaned records
missing UUID
sync queue without entity
```

---

# 106. DATABASE INTEGRITY CHECK

Provide:

```sql
PRAGMA integrity_check;
```

and:

```sql
PRAGMA foreign_key_check;
```

Show results in admin diagnostics.

---

# 107. RESPONSIVE DESIGN

Use modern responsive UI.

Desktop:

```text
collapsible sidebar
dashboard cards
tables
filters
charts
```

Mobile:

```text
bottom navigation
bottom-sheet modals
large touch targets
responsive cards
horizontal table scrolling
sticky actions
```

Minimum interactive target:

```text
44px
```

---

# 108. DESIGN SYSTEM

Use:

```css
:root {
    --primary: #4f46e5;
    --primary-gradient: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    --bg-main: #f8fafc;
    --bg-card: #ffffff;
    --bg-input: #f1f5f9;
    --text-main: #0f172a;
    --border: #e2e8f0;
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-xl: 24px;
}
```

---

# 109. TAMIL + ENGLISH

Support:

```text
English
Tamil
```

Do not hardcode user-facing text throughout JavaScript.

Use a translation structure.

Example:

```text
i18n/en.json
i18n/ta.json
```

Allow language switching.

---

# 110. DATE / CURRENCY

Default:

```text
India
INR
₹
```

Use Indian number formatting:

```text
₹1,00,000
```

Internally store paise.

---

# 111. OFFLINE UI

Always show connectivity/sync state.

Example:

```text
🟢 Online • Synced
```

```text
🟡 Online • Syncing
```

```text
🔴 Offline • Local mode
```

```text
⚠ Sync conflict requires attention
```

---

# 112. DATA-SAFETY UX

For financial changes show confirmation:

```text
Old balance: ₹10,000
Payment: ₹4,000
New balance: ₹6,000
```

For void:

```text
This will cancel the bill and remove it from outstanding calculations.
The action will be permanently audited.
```

---

# 113. DEVELOPMENT STRUCTURE

Use:

```text
rentbill/
├── cmd/
│   └── rentbill/
│       └── main.go
│
├── internal/
│   ├── config/
│   ├── database/
│   ├── migrations/
│   ├── auth/
│   ├── accounting/
│   ├── properties/
│   ├── units/
│   ├── tenants/
│   ├── bills/
│   ├── payments/
│   ├── ledger/
│   ├── expenses/
│   ├── maintenance/
│   ├── documents/
│   ├── settlements/
│   ├── audit/
│   ├── sync/
│   ├── backup/
│   └── events/
│
├── web/
│   ├── index.html
│   ├── css/
│   ├── js/
│   ├── icons/
│   ├── fonts/
│   ├── vendor/
│   └── i18n/
│
├── data/
├── uploads/
├── backups/
├── logs/
│
├── go.mod
└── README.md
```

---

# 114. ACCOUNTING SERVICE

Create a centralized service such as:

```text
internal/accounting/
```

It must provide functions for:

```text
CalculateBill
CalculateWater
CalculateElectricity
CalculateBalance
AllocateArrears
RecordPayment
AllocatePayment
ReversePayment
CreateCredit
AllocateCredit
CreateSettlement
VoidBill
CreateFinancialEvent
```

Do not duplicate formulas across handlers.

---

# 115. API LAYERS

Use separation such as:

```text
HTTP Handler
    ↓
Service
    ↓
Repository
    ↓
SQLite
```

Sync should operate through controlled service/repository logic.

Do not put all business logic inside Gin handlers.

---

# 116. API RESPONSE FORMAT

Use consistent JSON:

```json
{
  "success": true,
  "data": {}
}
```

Errors:

```json
{
  "success": false,
  "error": {
    "code": "BILL_DUPLICATE",
    "message": "A bill already exists for this tenant and period."
  }
}
```

---

# 117. TRANSACTION RULE

These operations MUST be transactional:

```text
bill creation
bill update
bill void
payment creation
payment verification
payment reversal
payment allocation
credit allocation
arrears allocation
tenant transfer
tenant vacating
final settlement
meter reset
financial corrections
```

---

# 118. CONCURRENCY

Protect against:

```text
two tabs creating same bill
two devices creating same bill
double payment verification
double payment allocation
double tenant assignment
duplicate sync
```

Use:

```text
database constraints
transactions
version checks
idempotency keys
```

Do not rely only on Go mutexes.

---

# 119. TESTING

Write automated tests.

## Billing

Test:

```text
rent only
rent + EB
rent + water
rent + maintenance
all charges
discount
late fee
write-off
arrears
```

## Payments

Test:

```text
no payment
partial
full
overpayment
multiple payments
payment allocation
payment reversal
```

## Arrears

Test:

```text
creation
allocation
partial allocation
void bill
bill edit
```

## Meter

Test:

```text
first reading
normal increase
same reading
lower reading
meter reset
```

## Sync

Test:

```text
offline creation
online sync
retry
duplicate mutation
dependency ordering
update conflict
delete conflict
financial conflict
```

## Authorization

Test:

```text
tenant own bill
tenant another tenant bill
tenant admin API
unauthenticated API
```

## Uploads

Test:

```text
valid file
large file
invalid file
path traversal
unauthorized download
duplicate file
```

---

# 120. SYNC TEST SCENARIOS

### Scenario A — Offline

```text
Device A
offline

Create tenant
Create bill
Create payment

Everything saved locally.

Internet returns.

All changes synchronize exactly once.
```

### Scenario B — Duplicate retry

```text
Upload payment
network timeout
client retries

Result:
ONE payment
NOT two payments
```

### Scenario C — Two-device conflict

```text
Device A:
bill = ₹10,000

Device B:
bill = ₹12,000

Both offline.

Both synchronize.

Result:
CONFLICT

NOT:
last-write-wins
```

### Scenario D — Offline deletion

```text
Device A deletes/voids record offline.

Device B still has record.

Sync.

Device B receives deletion/void event.
```

---

# 121. PERFORMANCE

Use indexes for:

```text
tenant
property
unit
billing_period
status
payments
sync queue
updated_at
UUID
```

Avoid N+1 queries.

Paginate large lists.

---

# 122. DATABASE INDEXES

Create appropriate indexes such as:

```sql
CREATE INDEX idx_renters_unit
ON renters(unit_id);

CREATE INDEX idx_bills_renter
ON bills(renter_id);

CREATE INDEX idx_bills_period
ON bills(billing_period);

CREATE INDEX idx_bills_status
ON bills(status);

CREATE INDEX idx_payments_bill
ON payments(bill_id);

CREATE INDEX idx_payments_renter
ON payments(renter_id);

CREATE INDEX idx_payment_allocations_bill
ON payment_allocations(bill_id);

CREATE INDEX idx_sync_queue_status
ON sync_queue(status);

CREATE INDEX idx_sync_queue_entity
ON sync_queue(entity_uuid);

CREATE INDEX idx_sync_conflicts_status
ON sync_conflicts(status);
```

---

# 123. GRACEFUL SHUTDOWN

Handle:

```text
SIGINT
SIGTERM
```

Shutdown:

```text
HTTP server
SSE connections
sync worker
backup worker
database
logs
```

cleanly.

---

# 124. BUILD

Development:

```bash
go run ./cmd/rentbill
```

Build:

```bash
CGO_ENABLED=0 go build -o rentbill ./cmd/rentbill
```

The binary must work without the source code.

---

# 125. README

Create complete documentation covering:

```text
installation
configuration
database
first login
property creation
tenant creation
bill generation
payments
arrears
meter readings
offline mode
Supabase setup
sync
conflict resolution
backup
restore
file storage
security
updates
troubleshooting
```

---

# 126. FIRST-RUN SETUP

On first launch:

```text
Create admin account
Configure business profile
Create first property
Create first unit
Optional Supabase setup
```

Do not require Supabase to complete initial setup.

---

# 127. BUSINESS PROFILE

Support:

```text
business/workshop/landlord name
address
phone
email
logo
UPI ID
tax/GST information if applicable
```

Use this on receipts and documents.

---

# 128. APPLICATION SETTINGS

Settings should include:

```text
language
currency
date format
billing day
late fee rules
default rent
default maintenance
water mode
water rate
EB rate
backup retention
sync interval
```

Property-specific settings override global defaults where configured.

---

# 129. DATA FLOW

Normal local operation:

```text
User
 ↓
Frontend
 ↓
Go API
 ↓
Service
 ↓
SQLite transaction
 ├── business record
 ├── financial event
 ├── audit log
 └── sync queue
 ↓
COMMIT
 ↓
SSE local clients
```

Cloud synchronization:

```text
Sync Queue
 ↓
Sync Engine
 ↓
Supabase
 ↓
ACK
 ↓
Mark synced
```

Remote changes:

```text
Supabase
 ↓
Sync Engine
 ↓
version/conflict check
 ↓
SQLite transaction
 ↓
SSE
 ↓
UI refresh
```

---

# 130. FINAL ARCHITECTURE

The final architecture must look conceptually like:

```text
                         RENTBILL PRO
                              │
                 ┌────────────┴────────────┐
                 │                         │
             LOCAL-FIRST                 CLOUD
                 │                         │
          ┌──────▼──────┐          ┌──────▼──────┐
          │   SQLite    │          │  Supabase   │
          │             │          │             │
          │ Properties  │          │ PostgreSQL  │
          │ Tenants     │          │ Auth        │
          │ Bills       │          │ Storage     │
          │ Payments    │          │ RLS         │
          │ Ledger      │          │ Realtime    │
          │ Queue       │          └──────▲──────┘
          └──────┬──────┘                 │
                 │                        │
                 └──── SYNC ENGINE ───────┘
                              │
                         Go / Gin
                              │
                    ┌─────────▼─────────┐
                    │   Accounting      │
                    │   Auth            │
                    │   Sync            │
                    │   Backup          │
                    │   SSE             │
                    └─────────┬─────────┘
                              │
                        Vanilla JS UI
```

---

# 131. FINAL ACCEPTANCE CRITERIA

Do not declare the project complete because the UI renders.

The project is complete only when all of these work:

## Core

- [ ] Property management
- [ ] Unit management
- [ ] Tenant management
- [ ] Tenant transfer
- [ ] Tenant history
- [ ] Vacancy management
- [ ] Agreement expiry

## Accounting

- [ ] Monthly bills
- [ ] Electricity calculation
- [ ] Water calculation
- [ ] Meter chain
- [ ] Meter reset
- [ ] Maintenance
- [ ] Arrears
- [ ] Discounts
- [ ] Late fees
- [ ] Write-offs
- [ ] Partial payments
- [ ] Full payments
- [ ] Overpayments
- [ ] Credits
- [ ] Payment allocation
- [ ] Payment reversal
- [ ] Tenant ledger
- [ ] Final settlement
- [ ] Refund tracking

## Offline

- [ ] Works without internet
- [ ] Local SQLite
- [ ] Sync queue
- [ ] Retry
- [ ] Idempotency
- [ ] Dependency ordering
- [ ] Tombstones
- [ ] Sync status
- [ ] Manual Sync Now

## Supabase

- [ ] PostgreSQL schema
- [ ] UUID synchronization
- [ ] RLS
- [ ] Cloud sync
- [ ] Conflict detection
- [ ] Conflict resolution
- [ ] Supabase Storage
- [ ] Cloud file sync

## Security

- [ ] Password hashing
- [ ] Session security
- [ ] CSRF
- [ ] Authorization
- [ ] Tenant isolation
- [ ] Upload validation
- [ ] Rate limiting
- [ ] Sensitive-data protection

## Reliability

- [ ] SQLite WAL
- [ ] Transactions
- [ ] Database migrations
- [ ] Automatic backup
- [ ] Backup validation
- [ ] Restore
- [ ] Integrity check
- [ ] Foreign-key check
- [ ] Audit logs
- [ ] Error logging

## UI

- [ ] Desktop responsive
- [ ] Mobile responsive
- [ ] Tamil
- [ ] English
- [ ] Touch-friendly
- [ ] Offline indicator
- [ ] Sync indicator
- [ ] Conflict indicator
- [ ] Print/PDF receipts

## Testing

- [ ] Accounting tests
- [ ] Payment tests
- [ ] Arrears tests
- [ ] Meter tests
- [ ] Sync tests
- [ ] Conflict tests
- [ ] Authorization tests
- [ ] Upload security tests
- [ ] Database integrity tests

---

# 132. MOST IMPORTANT FINAL RULE

When implementing RentBill Pro, never optimize for "looks complete" at the expense of correctness.

The system must prioritize:

```text
DATA INTEGRITY
      ↓
ACCOUNTING CORRECTNESS
      ↓
TRANSACTION SAFETY
      ↓
SYNC SAFETY
      ↓
SECURITY
      ↓
RELIABILITY
      ↓
UX
      ↓
VISUAL POLISH
```

The application must be able to survive:

```text
internet failure
computer restart
application crash
database restart
sync retry
duplicate request
two browser tabs
two devices
conflicting edits
partial payment
payment reversal
bill correction
tenant transfer
meter replacement
backup restoration
```

without silently losing or duplicating financial data.

**Build the system around these guarantees rather than adding them later.**