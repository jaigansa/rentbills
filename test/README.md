# 🧪 RentBill Pro — Automated Tests

Test runner: **Node.js built-in test runner** (`node --test`). No external deps.
Requires Node 18+. The app code is vanilla ES modules, so tests import the pure
modules directly.

## Commands

```bash
npm test          # run all unit + SQL-integrity tests
npm run test:unit # format + finance only
npm run test:sql  # SQL schema-integrity guards only
npm run check     # syntax-check the modified app JS files
```

## What's covered

| File | Purpose |
|---|---|
| `test/format.test.js` | Currencies, escaping, invoice numbers, **bill-status derivation**, and **tenant login email/password** rules (mirror the SQL triggers + auth flow) |
| `test/finance.test.js` | **Ledger reconciliation** (`billed/collected/outstanding/net cash-flow`) mirroring `fn_reconcile_ledger`, payment proof rules, and `paid_amount` invariant |
| `test/sql-integrity.test.js` | Guards the `install/00_master_schema.sql` + `update/01_upgrade_existing_database.sql`: balanced `$$`, all RPCs/views/grants present, no duplicate policies |

## Golden-logic modules (pure, no browser/supabase deps)

- `js/core/format.js` — formatters + bill status + tenant login derivations
  (re-exported by `js/core/ui.js`, used by the UI **and** the tests)
- `js/core/finance.js` — pure ledger reconciliation mirroring the SQL contract

Because the UI and the tests share these exact modules, any change to bill-status
or reconciliation logic is enforced on both sides.

## Live SQL integration tests

`node --test` can't exercise Postgres triggers (no DB in CI). Run
[`sql/tests/integration_checks.sql`](../sql/tests/integration_checks.sql) in the
**Supabase SQL Editor** to verify the real triggers + ledger against your live DB.
It is wrapped in a transaction and rolled back — it never modifies data.
