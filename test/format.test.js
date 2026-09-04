import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrency,
  escapeStr,
  formatInvoiceNumber,
  deriveBillStatus,
  deriveBillStatusAfterPayment,
  normalizeTenDigitMobile,
  tenantLoginEmailFromMobile,
  defaultTenantPassword,
  extractBackupTables,
  csvEscapeValue,
  parseFloorValue
} from '../js/core/format.js';
import { cleanPayload } from '../js/core/db.js';

test('formatCurrency converts paise to INR rupees', () => {
  assert.equal(formatCurrency(0), '₹0.00');
  assert.equal(formatCurrency(123456), '₹1,234.56');
  assert.equal(formatCurrency(100), '₹1.00');
  assert.equal(formatCurrency(null), '₹0.00');
});

test('formatCurrency handles negative (credit) amounts', () => {
  assert.equal(formatCurrency(-5000), '-₹50.00');
});

test('escapeStr escapes smile-quote, backslash, and HTML chars', () => {
  assert.equal(escapeStr(''), '');
  assert.equal(escapeStr(null), '');
  assert.equal(escapeStr("O'Brien"), "O\\'Brien"); // single-quote is JS-escaped
  assert.equal(escapeStr('say "hi"'), 'say &quot;hi&quot;');
});

test('escapeStr neutralizes HTML/attribute injection (stored XSS)', () => {
  assert.equal(escapeStr('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeStr('"><script>alert(1)</script>'), '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeStr("a&b"), 'a&amp;b');
  assert.equal(escapeStr('back\\slash'), 'back\\\\slash');
});

test('escapeStr output round-trips through HTML+JS decoding to original', () => {
  // Simulate how an inline onclick='...' attribute is decoded by the HTML parser
  // then parsed as a single-quoted JS string: the value must come back intact.
  const malicious = `O'Brien <img src=x onerror=alert(1)> "q" & b`;
  const out = escapeStr(malicious);
  const inJsString = out
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\\'/g, "'");
  assert.equal(inJsString, malicious);
});

test('formatInvoiceNumber falls back to INV-1001 without a bill', () => {
  assert.equal(formatInvoiceNumber(), 'INV-1001');
  assert.equal(formatInvoiceNumber(null), 'INV-1001');
});

test('formatInvoiceNumber uses invoice_no when present', () => {
  assert.equal(formatInvoiceNumber({ invoice_no: 'INV-9000' }), 'INV-9000');
});

test('formatInvoiceNumber computes INV-1000+n from numeric id', () => {
  assert.equal(formatInvoiceNumber({ id: 1 }), 'INV-1001');
  assert.equal(formatInvoiceNumber({ id: 42 }), 'INV-1042');
});

test('deriveBillStatus: PAID when paid >= net', () => {
  assert.equal(deriveBillStatus(1000, 1000), 'PAID');
  assert.equal(deriveBillStatus(1000, 1500), 'PAID');
});

test('deriveBillStatus: PARTIAL when partially paid', () => {
  assert.equal(deriveBillStatus(1000, 500), 'PARTIAL');
  assert.equal(deriveBillStatus(1000, 1), 'PARTIAL');
});

test('deriveBillStatus: UNPAID when nothing paid', () => {
  assert.equal(deriveBillStatus(1000, 0), 'UNPAID');
  assert.equal(deriveBillStatus(1000, null), 'UNPAID');
});

test('deriveBillStatus: zero-net bill with payment is PARTIAL (matches SQL trigger)', () => {
  assert.equal(deriveBillStatus(0, 0), 'UNPAID');
  assert.equal(deriveBillStatus(0, 100), 'PARTIAL');
});

test('deriveBillStatus: force void returns VOID', () => {
  assert.equal(deriveBillStatus(1000, 1000, true), 'VOID');
});

test('deriveBillStatusAfterPayment mirrors payments.js delete-payment logic', () => {
  // In payments.js triggerDeletePayment: newPaid>=net -> PAID, >0 -> PARTIAL, else UNPAID
  assert.equal(deriveBillStatusAfterPayment(1000, 1000), 'PAID');
  assert.equal(deriveBillStatusAfterPayment(1000, 500), 'PARTIAL');
  assert.equal(deriveBillStatusAfterPayment(1000, 0), 'UNPAID');
});

test('normalizeTenDigitMobile returns trailing 10 digits', () => {
  assert.equal(normalizeTenDigitMobile('+91 98765 43210'), '9876543210');
  assert.equal(normalizeTenDigitMobile('98765432101'), '8765432101');
  assert.equal(normalizeTenDigitMobile('12345'), '12345'); // too short, unchanged
  assert.equal(normalizeTenDigitMobile(''), '');
});

test('tenantLoginEmailFromMobile builds deterministic email', () => {
  assert.equal(tenantLoginEmailFromMobile('9876543210'), 'tenant_9876543210@rentbill.local');
  assert.equal(tenantLoginEmailFromMobile('+91 9876543210'), 'tenant_9876543210@rentbill.local');
  // too short -> no email
  assert.equal(tenantLoginEmailFromMobile('12345'), '');
  assert.equal(tenantLoginEmailFromMobile(''), '');
});

test('defaultTenantPassword uses mobile digits when >= 6', () => {
  assert.equal(defaultTenantPassword('9876543210'), '9876543210');
  assert.equal(defaultTenantPassword('123456'), '123456');
});

test('defaultTenantPassword falls back when mobile too short', () => {
  assert.equal(defaultTenantPassword('12345'), 'Tenant@123');
  assert.equal(defaultTenantPassword('', 'Custom@1'), 'Custom@1');
});

test('extractBackupTables reads tables nested under data (current export format)', () => {
  const backup = {
    app: 'RentBill Pro',
    data: { properties: [{ id: 1 }], bills: [{ id: 1 }, { id: 2 }] }
  };
  const map = extractBackupTables(backup);
  assert.deepEqual(map.properties, [{ id: 1 }]);
  assert.deepEqual(map.bills, [{ id: 1 }, { id: 2 }]);
  assert.equal(map.units, undefined);
});

test('extractBackupTables reads flat top-level tables (legacy format)', () => {
  const backup = { properties: [{ id: 1 }], renters: [{ id: 9 }] };
  const map = extractBackupTables(backup);
  assert.deepEqual(map.properties, [{ id: 1 }]);
  assert.deepEqual(map.renters, [{ id: 9 }]);
});

test('extractBackupTables prefers nested data when both present', () => {
  const backup = { properties: [{ id: 1 }], data: { properties: [{ id: 2 }] } };
  const map = extractBackupTables(backup);
  assert.deepEqual(map.properties, [{ id: 2 }]);
});

test('extractBackupTables handles missing/malformed input', () => {
  assert.deepEqual(extractBackupTables(null), {});
  assert.deepEqual(extractBackupTables({}), {});
  assert.deepEqual(extractBackupTables({ data: {} }), {});
});

test('csvEscapeValue double-quotes embedded quotes per RFC 4180', () => {
  assert.equal(csvEscapeValue('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscapeValue('a,b'), '"a,b"');
  assert.equal(csvEscapeValue('plain'), 'plain');
});

test('csvEscapeValue neutralizes spreadsheet formula injection', () => {
  assert.equal(csvEscapeValue('=SUM(A1)'), '"\'=SUM(A1)"');
  assert.equal(csvEscapeValue('+cmd'), '"\'+cmd"');
  assert.equal(csvEscapeValue('@name'), '"\'@name"');
  assert.equal(csvEscapeValue('\t=2+2'), '"\'\t=2+2"');
  assert.equal(csvEscapeValue('-2+3'), '"\'-2+3"');
});

test('csvEscapeValue preserves legitimate negative numbers', () => {
  assert.equal(csvEscapeValue('-123.45'), '-123.45');
  assert.equal(csvEscapeValue('0'), '0');
  assert.equal(csvEscapeValue(''), '');
  assert.equal(csvEscapeValue(null), '');
});

test('parseFloorValue handles empty strings, text ordinals, ground and basement', () => {
  assert.equal(parseFloorValue(''), null);
  assert.equal(parseFloorValue('   '), null);
  assert.equal(parseFloorValue(null), null);
  assert.equal(parseFloorValue(undefined), null);
  assert.equal(parseFloorValue('1'), 1);
  assert.equal(parseFloorValue(2), 2);
  assert.equal(parseFloorValue('0'), 0);
  assert.equal(parseFloorValue('-1'), -1);
  assert.equal(parseFloorValue('1st Floor'), 1);
  assert.equal(parseFloorValue('2nd'), 2);
  assert.equal(parseFloorValue('3rd floor'), 3);
  assert.equal(parseFloorValue('Ground'), 0);
  assert.equal(parseFloorValue('ground floor'), 0);
  assert.equal(parseFloorValue('G'), 0);
  assert.equal(parseFloorValue('Basement'), -1);
  assert.equal(parseFloorValue('B'), -1);
});

test('cleanPayload sanitizes empty strings to null for integer/numeric columns', () => {
  const dirtyUnit = { property_id: 1, unit_name: 'Flat 101', floor: '' };
  const cleanedUnit = cleanPayload('units', dirtyUnit);
  assert.equal(cleanedUnit.floor, null);
  assert.equal(cleanedUnit.unit_name, 'Flat 101');
  assert.equal(cleanedUnit.property_id, 1);

  const dirtyRenter = { unit_id: '', owner_id: '', name: 'John Doe', base_rent: '' };
  const cleanedRenter = cleanPayload('renters', dirtyRenter);
  assert.equal(cleanedRenter.unit_id, null);
  assert.equal(cleanedRenter.owner_id, null);
  assert.equal(cleanedRenter.name, 'John Doe');
  assert.equal(cleanedRenter.base_rent, null);
});

