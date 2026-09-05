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
import { formatBillInvoiceMessage, formatOverdueReminderMessage, formatPaymentReceiptMessage, shareMessage } from '../js/modules/bills.js';

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

test('formatBillInvoiceMessage includes meter breakdown, avoids @ 0.00/u, and formats bank details', () => {
  const bill = {
    id: 2,
    invoice_no: 'INV-1002',
    billing_period: '2026-08',
    period_start_date: '2026-08-01',
    period_end_date: '2026-08-31',
    bill_date: '2026-09-05',
    due_date: '2026-09-10',
    rent_amount: 1000000,
    maint_amount: 0,
    prev_eb_reading: 0,
    curr_eb_reading: 120,
    eb_units: 120,
    eb_unit_price: 0,
    eb_rate: null,
    eb_amount: 96000,
    water_calc_mode: 'FLAT',
    water_amount: 15000,
    arrears_included: 100000,
    others: 20000,
    late_fee: 10000,
    discount_amount: 10000,
    net_amount: 1231000,
    paid_amount: 0,
    status: 'UNPAID'
  };
  const tenant = { name: 'Mugindh', mobile_number: '9876543210' };
  const owner = {
    name: 'Rajesh Kumar',
    bank_name: 'State Bank of India',
    account_number: '50100123456789',
    ifsc_code: 'SBIN0001234',
    upi_id: '9876543210@upi',
    gpay_mobile: '9876543210'
  };

  const msg = formatBillInvoiceMessage(bill, tenant, 'Room 1', owner);
  assert.match(msg, /🏡 \*RENT INVOICE — 2026-08\*/);
  assert.match(msg, /👤 \*Tenant:\* Mugindh/);
  assert.match(msg, /🏢 \*Unit:\* Room 1/);
  assert.match(msg, /⚡ Electricity \(EB\): 120 Units \(120 - 0 @ ₹8\.00\/u\) = ₹960\.00/);
  assert.doesNotMatch(msg, /@ ₹0\.00\/u/);
  assert.match(msg, /💳 \*Payment Transfer Details:\*/);
  assert.match(msg, /• Bank: State Bank of India/);
  assert.match(msg, /• A\/C No: 50100123456789/);
  assert.match(msg, /• IFSC: SBIN0001234/);
  assert.match(msg, /• UPI ID: 9876543210@upi/);
  assert.match(msg, /💰 \*Total Net Amount:\* ₹12,310\.00/);
  assert.match(msg, /🗣️ \*In Words:\* Twelve Thousand Three Hundred Ten Rupees Only/);
});

test('formatOverdueReminderMessage includes meter details, payment transfer info, and amount in words', () => {
  const bill = {
    id: 3,
    invoice_no: 'INV-1003',
    billing_period: '2026-08',
    rent_amount: 500000,
    maint_amount: 50000,
    prev_eb_reading: 10,
    curr_eb_reading: 50,
    eb_amount: 32000,
    net_amount: 582000,
    paid_amount: 0,
    status: 'UNPAID'
  };
  const tenant = { name: 'Priya' };
  const owner = {
    bank_name: 'HDFC Bank',
    account_number: '123456',
    upi_id: 'priya@upi'
  };

  const overdue = formatOverdueReminderMessage(bill, tenant, 'Flat 101', owner);
  assert.match(overdue, /URGENT RENT OVERDUE NOTICE/);
  assert.match(overdue, /⚡ Electricity \(EB\):/);
  assert.match(overdue, /• Bank: HDFC Bank/);
  assert.match(overdue, /• UPI ID: priya@upi/);
  assert.match(overdue, /🗣️ \*In Words:\* Five Thousand Eight Hundred Twenty Rupees Only/);
});

test('formatPaymentReceiptMessage includes amount in words, receipt no, and status', () => {
  const payment = {
    id: 105,
    amount: 1231000,
    payment_method: 'UPI',
    transaction_reference: 'UPI12345678',
    payment_date: '2026-09-05'
  };
  const bill = {
    id: 2,
    invoice_no: 'INV-1002',
    billing_period: '2026-08',
    net_amount: 1231000,
    paid_amount: 1231000
  };
  const tenant = { name: 'Mugindh' };
  const owner = { name: 'Rajesh Kumar' };

  const receiptMsg = formatPaymentReceiptMessage(payment, bill, tenant, 'Room 1', owner);
  assert.match(receiptMsg, /🧾 \*RENT PAYMENT RECEIPT — RCP-105\*/);
  assert.match(receiptMsg, /👤 \*Tenant:\* Mugindh/);
  assert.match(receiptMsg, /🏢 \*Unit:\* Room 1/);
  assert.match(receiptMsg, /💵 \*Amount Received:\* ₹12,310\.00/);
  assert.match(receiptMsg, /🗣️ \*In Words:\* Twelve Thousand Three Hundred Ten Rupees Only/);
  assert.match(receiptMsg, /PAID IN FULL \(CLEARED\)/);
  assert.match(receiptMsg, /👤 \*Beneficiary:\* Rajesh Kumar/);
});

test('shareMessage utilizes Web Share API when navigator.share is supported', async () => {
  let sharedPayload = null;
  const originalNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        share: async (data) => {
          sharedPayload = data;
        },
        canShare: () => true
      },
      configurable: true,
      writable: true
    });

    const res = await shareMessage({
      title: 'Rent Invoice INV-1001',
      text: 'Test Invoice Message',
      phone: '9876543210',
      email: 'tenant@example.com'
    });

    assert.equal(res.success, true);
    assert.equal(res.method, 'native');
    assert.equal(sharedPayload.title, 'Rent Invoice INV-1001');
    assert.equal(sharedPayload.text, 'Test Invoice Message');
  } finally {
    if (originalNavDesc) {
      Object.defineProperty(globalThis, 'navigator', originalNavDesc);
    }
  }
});

test('shareMessage handles Web Share API AbortError gracefully without throwing', async () => {
  const originalNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    const abortErr = new Error('Share canceled');
    abortErr.name = 'AbortError';
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        share: async () => {
          throw abortErr;
        }
      },
      configurable: true,
      writable: true
    });

    const res = await shareMessage({
      title: 'Rent Invoice',
      text: 'Test',
      phone: '9876543210'
    });

    assert.equal(res.success, false);
    assert.equal(res.aborted, true);
  } finally {
    if (originalNavDesc) {
      Object.defineProperty(globalThis, 'navigator', originalNavDesc);
    }
  }
});

test('shareMessage falls back to URL scheme/fallback when navigator.share is unavailable', async () => {
  const originalNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = globalThis.window;
  let openedUrl = null;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true
    });
    globalThis.window = {
      open: (url) => {
        openedUrl = url;
      }
    };

    const res = await shareMessage({
      title: 'Rent Invoice',
      text: 'Hello World',
      phone: '9876543210',
      email: 'tenant@test.com'
    });

    assert.equal(res.success, true);
    assert.equal(res.method, 'whatsapp');
    assert.match(openedUrl, /https:\/\/api\.whatsapp\.com\/send\?phone=919876543210&text=Hello%20World/);
  } finally {
    if (originalNavDesc) {
      Object.defineProperty(globalThis, 'navigator', originalNavDesc);
    }
    globalThis.window = originalWindow;
  }
});


