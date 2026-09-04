// RentBill Pro — Pure ledger & reconciliation rules (no browser/supabase deps).
// These mirror the SQL contract in install/00_master_schema.sql section 7.5
// (views v_ledger_entries / v_ledger_accounts and fn_reconcile_ledger).
// Unit-testable in isolation so the exact "billed vs collected vs spent"
// figures can be guarded against regressions on both sides (JS + SQL).

// Derive a bill's ledger contribution exactly as v_ledger_entries does.
// Returns null when the bill should NOT hit the ledger (voided/deleted).
export function billReceivableEntry(bill, deletedAt = null, isVoid = false) {
  const deleted = deletedAt != null || bill.deleted_at != null;
  const voided = isVoid || bill.status === 'VOID' || bill.voided_at != null;
  if (deleted || voided) return null;
  return { source_type: 'BILL', account: 'RECEIVABLE_INVOICED', amount: (Number(bill.net_amount) || 0) };
}

// A payment's cash-in contribution. Mirrors v_ledger_entries PAYMENT branch:
// only counts if not deleted, not reversed, and proof is NONE/VERIFIED.
export function paymentCashInEntry(payment) {
  const proof = (payment.proof_status || 'NONE').toUpperCase();
  if (payment.deleted_at != null) return null;
  if (payment.reversed_at != null) return null;
  if (!(proof === 'NONE' || proof === 'VERIFIED')) return null;
  return { source_type: 'PAYMENT', account: 'CASH_IN', amount: (Number(payment.amount) || 0) };
}

// Compute the full ledger snapshot from arrays of source rows.
// Returns the same shape as fn_reconcile_ledger so JS and SQL can be compared.
export function reconcileLedger({ bills = [], payments = [], expenses = [], withdrawals = [] }) {
  const billed = bills.reduce((s, b) => s + ((billReceivableEntry(b) || {}).amount || 0), 0);
  const collected = payments.reduce((s, p) => s + ((paymentCashInEntry(p) || {}).amount || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => (e.deleted_at != null ? s : s + (Number(e.amount) || 0)), 0);
  const totalWithdrawn = withdrawals.reduce((s, w) => (w.deleted_at != null ? s : s + (Number(w.amount) || 0)), 0);
  const writtenOff = bills.reduce((s, b) => {
    if (b.deleted_at != null || b.status === 'VOID' || b.voided_at != null) return s;
    return s + (Number(b.write_off_amount) || 0);
  }, 0);

  const outstanding = billed - writtenOff - collected;
  const netCashFlow = collected - totalExpenses - totalWithdrawn;

  return {
    total_billed: billed,
    total_written_off: writtenOff,
    total_collected: collected,
    total_expenses: totalExpenses,
    total_withdrawn: totalWithdrawn,
    outstanding,
    net_cash_flow: netCashFlow
  };
}

// Guard that a bill's cached paid_amount matches the sum of its live payments.
// Mirrors the invariant the sync_bill_paid_amount trigger is supposed to hold.
export function billPaidAmountMatches(bill, itsPayments = []) {
  const liveTotal = itsPayments.reduce((s, p) => {
    const proof = (p.proof_status || 'NONE').toUpperCase();
    if (p.deleted_at != null) return s;
    if (p.reversed_at != null) return s;
    if (proof === 'REJECTED') return s;
    return s + (Number(p.amount) || 0);
  }, 0);
  return liveTotal === (Number(bill.paid_amount) || 0);
}
