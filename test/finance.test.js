import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  billReceivableEntry,
  paymentCashInEntry,
  reconcileLedger,
  billPaidAmountMatches
} from '../js/core/finance.js';

test('billReceivableEntry includes a live non-voided bill', () => {
  const entry = billReceivableEntry({ net_amount: 100000, status: 'UNPAID' });
  assert.deepEqual(entry, { source_type: 'BILL', account: 'RECEIVABLE_INVOICED', amount: 100000 });
});

test('billReceivableEntry excludes soft-deleted bills', () => {
  assert.equal(billReceivableEntry({ net_amount: 100, deleted_at: new Date().toISOString() }), null);
  assert.equal(billReceivableEntry({ net_amount: 100 }, new Date()), null);
});

test('billReceivableEntry excludes voided bills', () => {
  assert.equal(billReceivableEntry({ net_amount: 100, status: 'VOID' }), null);
  assert.equal(billReceivableEntry({ net_amount: 100, voided_at: new Date().toISOString() }), null);
  assert.equal(billReceivableEntry({ net_amount: 100 }, null, true), null);
});

test('paymentCashInEntry counts verified/none proofs', () => {
  assert.equal(paymentCashInEntry({ amount: 500, proof_status: 'NONE' }).amount, 500);
  assert.equal(paymentCashInEntry({ amount: 500, proof_status: 'VERIFIED' }).amount, 500);
  assert.equal(paymentCashInEntry({ amount: 500 }).amount, 500);
});

test('paymentCashInEntry excludes rejected/pending/reversed/deleted', () => {
  assert.equal(paymentCashInEntry({ amount: 500, proof_status: 'REJECTED' }), null);
  assert.equal(paymentCashInEntry({ amount: 500, proof_status: 'PENDING' }), null);
  assert.equal(paymentCashInEntry({ amount: 500, reversed_at: new Date().toISOString() }), null);
  assert.equal(paymentCashInEntry({ amount: 500, deleted_at: new Date().toISOString() }), null);
});

test('reconcileLedger computes exact billed/collected/outstanding/net cash flow', () => {
  const rec = reconcileLedger({
    bills: [
      { net_amount: 100000, status: 'UNPAID' },
      { net_amount: 50000, status: 'PAID', write_off_amount: 5000 }
    ],
    payments: [
      { amount: 60000, proof_status: 'VERIFIED' },
      { amount: 10000, proof_status: 'REJECTED' } // excluded
    ],
    expenses: [{ amount: 20000 }],
    withdrawals: [{ amount: 10000 }]
  });
  // billed = 100000 + 50000 = 150000
  // collected = 60000 (rejected excluded)
  // writtenOff = 5000
  // outstanding = 150000 - 5000 - 60000 = 85000
  // expenses = 20000, withdrawn = 10000
  // net_cash_flow = 60000 - 20000 - 10000 = 30000
  assert.equal(rec.total_billed, 150000);
  assert.equal(rec.total_collected, 60000);
  assert.equal(rec.total_written_off, 5000);
  assert.equal(rec.outstanding, 85000);
  assert.equal(rec.total_expenses, 20000);
  assert.equal(rec.total_withdrawn, 10000);
  assert.equal(rec.net_cash_flow, 30000);
});

test('reconcileLedger excludes soft-deleted expenses/withdrawals and voided bills', () => {
  const rec = reconcileLedger({
    bills: [
      { net_amount: 100000, status: 'UNPAID' },
      { net_amount: 90000, status: 'VOID' },          // excluded
      { net_amount: 80000, deleted_at: new Date().toISOString() } // excluded
    ],
    payments: [
      { amount: 100000, proof_status: 'VERIFIED' },
      { amount: 500, deleted_at: new Date().toISOString() } // excluded
    ],
    expenses: [{ amount: 3000 }, { amount: 999, deleted_at: new Date().toISOString() }],
    withdrawals: [{ amount: 4000 }]
  });
  assert.equal(rec.total_billed, 100000);
  assert.equal(rec.total_collected, 100000);
  assert.equal(rec.outstanding, 0);
  assert.equal(rec.total_expenses, 3000);
});

test('reconcileLedger reports a negative net cash flow when outflows exceed inflows', () => {
  const rec = reconcileLedger({
    bills: [{ net_amount: 10000, status: 'PAID', write_off_amount: 0 }],
    payments: [{ amount: 10000, proof_status: 'VERIFIED' }],
    expenses: [{ amount: 15000 }],
    withdrawals: []
  });
  assert.equal(rec.net_cash_flow, -5000);
});

test('billPaidAmountMatches: cached paid_amount equals live payments total', () => {
  const bill = { paid_amount: 80000 };
  const payments = [
    { amount: 40000, proof_status: 'VERIFIED' },
    { amount: 40000, proof_status: 'VERIFIED' }
  ];
  assert.equal(billPaidAmountMatches(bill, payments), true);
});

test('billPaidAmountMatches: detects mismatch (rejected/deleted ignored, paid_amount wrong)', () => {
  const bill = { paid_amount: 80000 };
  const payments = [
    { amount: 40000, proof_status: 'VERIFIED' },
    { amount: 40000, proof_status: 'REJECTED' },      // ignored
    { amount: 40000, reversed_at: new Date().toISOString() } // ignored
  ];
  assert.equal(billPaidAmountMatches(bill, payments), false);
});
