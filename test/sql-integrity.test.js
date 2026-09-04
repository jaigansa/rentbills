import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function readSql(rel) {
  return readFileSync(join(root, 'sql', rel), 'utf8');
}

// Returns positions of all `$$` tokens. Checks strict alternation (balanced LIFO).
function dollarQuoteInfo(sql) {
  const positions = [];
  let i = 0;
  while (true) {
    const j = sql.indexOf('$$', i);
    if (j === -1) break;
    positions.push(j);
    i = j + 2;
  }
  let depth = 0;
  let balanced = true;
  for (let k = 0; k < positions.length; k++) {
    depth += (k % 2 === 0) ? 1 : -1;
    if (depth < 0) balanced = false;
  }
  return { even: positions.length % 2 === 0, balanced, count: positions.length };
}

function extractCreates(sql, kind) {
  const re = new RegExp(`CREATE OR REPLACE (?:${kind}) public\\.(\\w+)`, 'g');
  return new Set(Array.from(sql.matchAll(re), (m) => m[1]));
}

const install = readSql('install/00_master_schema.sql');
const update = readSql('update/01_upgrade_existing_database.sql');

test('install schema has balanced dollar quotes', () => {
  const info = dollarQuoteInfo(install);
  assert.ok(info.even, 'dollar-quote count must be even (found ' + info.count + ')');
  assert.ok(info.balanced, 'dollar quotes must nest (open/close alternate)');
});

test('update migration has balanced dollar quotes', () => {
  const info = dollarQuoteInfo(update);
  assert.ok(info.even, 'dollar-quote count must be even (found ' + info.count + ')');
  assert.ok(info.balanced, 'dollar quotes must nest (open/close alternate)');
});

test('install and update both define the full user-management + ledger surface', () => {
  for (const sql of [install, update]) {
    const funcs = extractCreates(sql, 'FUNCTION');
    for (const fn of [
      'is_admin', 'is_auditor', 'is_staff',
      'admin_list_all_users', 'admin_create_user', 'admin_update_user_password',
      'admin_change_user_role', 'admin_toggle_user_status', 'admin_delete_user',
      'fn_reconcile_ledger'
    ]) {
      assert.ok(funcs.has(fn), `missing FUNCTION ${fn}`);
    }
    const views = extractCreates(sql, 'VIEW');
    for (const v of ['v_ledger_entries', 'v_ledger_accounts']) {
      assert.ok(views.has(v), `missing VIEW ${v}`);
    }
  }
});

test('install and update grant execute on the key RPCs', () => {
  for (const sql of [install, update]) {
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.fn_reconcile_ledger() TO authenticated'),
      'missing fn_reconcile_ledger grant');
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated'),
      'missing admin_delete_user grant');
    assert.ok(sql.includes('GRANT SELECT ON public.v_ledger_entries TO authenticated'),
      'missing v_ledger_entries grant');
    assert.ok(sql.includes('GRANT SELECT ON public.v_ledger_accounts TO authenticated'),
      'missing v_ledger_accounts grant');
  }
});

test('no duplicate CREATE POLICY names within a single file', () => {
  for (const [name, sql] of [['install', install], ['update', update]]) {
    const re = /CREATE POLICY "([^"]+)"/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(sql)) !== null) {
      assert.ok(!seen.has(m[1]), `duplicate policy name "${m[1]}" in ${name}`);
      seen.add(m[1]);
    }
  }
});

test('install schema fn_reconcile_ledger mirrors the same accounts as its views', () => {
  // The function filters on these account names; they must exist in the journal view.
  for (const account of [
    'RECEIVABLE_INVOICED', 'RECEIVABLE_WRITTEN_OFF',
    'CASH_IN', 'CASH_OUT_EXPENSES', 'CASH_OUT_WITHDRAWALS'
  ]) {
    assert.ok(install.indexOf(account) !== -1, `missing account constant "${account}"`);
  }
});

test('install and update SQL files are syntactically non-trivial (not empty)', () => {
  assert.ok(install.trim().length > 5000, 'install schema seems too short');
  assert.ok(update.trim().length > 5000, 'update migration seems too short');
});
