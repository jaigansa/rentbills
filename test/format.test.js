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
  defaultTenantPassword
} from '../js/core/format.js';

test('formatCurrency converts paise to INR rupees', () => {
  assert.equal(formatCurrency(0), '₹0.00');
  assert.equal(formatCurrency(123456), '₹1,234.56');
  assert.equal(formatCurrency(100), '₹1.00');
  assert.equal(formatCurrency(null), '₹0.00');
});

test('formatCurrency handles negative (credit) amounts', () => {
  assert.equal(formatCurrency(-5000), '-₹50.00');
});

test('escapeStr escapes quotes and decodes nothing else', () => {
  assert.equal(escapeStr(''), '');
  assert.equal(escapeStr(null), '');
  assert.equal(escapeStr("O'Brien"), "O\\'Brien");
  assert.equal(escapeStr('say "hi"'), 'say &quot;hi&quot;');
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
