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

test('install and update both define the single-user core surface', () => {
  for (const sql of [install, update]) {
    const funcs = extractCreates(sql, 'FUNCTION');
    assert.ok(funcs.has('is_admin'), 'missing FUNCTION is_admin');
    assert.ok(!funcs.has('fn_reconcile_ledger'), 'fn_reconcile_ledger should be removed');

    const views = extractCreates(sql, 'VIEW');
    assert.ok(!views.has('v_ledger_entries'), 'v_ledger_entries should be removed');
    assert.ok(!views.has('v_ledger_accounts'), 'v_ledger_accounts should be removed');
  }
});

test('install and update do not define obsolete multi-user admin functions', () => {
  const obsoleteFns = [
    'is_staff', 'is_auditor',
    'admin_list_all_users', 'admin_create_user', 'admin_update_user_password',
    'admin_change_user_role', 'admin_toggle_user_status', 'admin_delete_user'
  ];
  for (const [name, sql] of [['install', install], ['update', update]]) {
    const funcs = extractCreates(sql, 'FUNCTION');
    for (const fn of obsoleteFns) {
      assert.ok(!funcs.has(fn), `${name} should not define obsolete FUNCTION ${fn}`);
    }
  }
});

test('update migration explicitly drops obsolete functions and ledger views', () => {
  const dropsToVerify = [
    'DROP VIEW IF EXISTS public.v_ledger_accounts CASCADE;',
    'DROP VIEW IF EXISTS public.v_ledger_entries CASCADE;',
    'DROP FUNCTION IF EXISTS public.fn_reconcile_ledger() CASCADE;',
    'DROP FUNCTION IF EXISTS public.is_staff() CASCADE;',
    'DROP FUNCTION IF EXISTS public.is_auditor() CASCADE;',
    'DROP FUNCTION IF EXISTS public.admin_list_all_users() CASCADE;',
    'DROP POLICY IF EXISTS "Anon read public bills" ON public.bills;',
    'DROP FUNCTION IF EXISTS public.admin_delete_user(UUID) CASCADE;'
  ];
  for (const dropStmt of dropsToVerify) {
    assert.ok(update.includes(dropStmt), `update migration missing drop statement: ${dropStmt}`);
  }
});

test('install and update grant execute on is_admin to authenticated only', () => {
  for (const sql of [install, update]) {
    assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;'),
      'missing is_admin grant');
  }
});

test('no policies grant access to anon role (100% login required)', () => {
  for (const [name, sql] of [['install', install], ['update', update]]) {
    const re = /CREATE POLICY[^\n]+TO\s+anon/gi;
    const matches = Array.from(sql.matchAll(re));
    assert.equal(matches.length, 0, `${name} should have 0 policies granting access to anon`);
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

test('install and update SQL files are syntactically non-trivial (not empty)', () => {
  assert.ok(install.trim().length > 5000, 'install schema seems too short');
  assert.ok(update.trim().length > 5000, 'update migration seems too short');
});
