// RentBill Pro — Pure, dependency-free formatting & financial rules.
// This module must NEVER import browser globals, DOM, or supabase, so it can be
// unit-tested in isolation with Node's built-in test runner. The app re-exports
// these from ui.js so the exact same "golden" logic drives both the UI and tests.

export function formatCurrency(paise) {
  const rupees = (paise || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(rupees);
}

// Escape a value for safe interpolation into an inline onclick JS-string
// argument AND as HTML text/attribute content. Handles the JS-string-in-HTML
// attribute compound context used across the UI (onclick="fn('...')"):
//   - backslash first, then single-quote (JS string escaping)
//   - then ampersand/angle-brackets/double-quote (HTML entity escaping)
// Without the &< > escapes a malicious value could break out of a quoted
// attribute and inject markup (stored XSS).
export function escapeStr(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Encode a single cell value for CSV output. Quotes embedded double quotes per
// RFC 4180, wraps in quotes when needed, and neutralizes spreadsheet formula
// injection (=, +, @, tab, CR, and a leading '-' that is not a negative number)
// by prefixing a single quote so Excel/Sheets treat the cell as literal text.
export function csvEscapeValue(val) {
  let s = val === null || val === undefined ? '' : String(val);
  const trimmed = s.trim();
  const first = trimmed.charAt(0);
  let formulaPrefix = false;
  if (first === '=' || first === '+' || first === '@' || first === '\t' || first === '\r') {
    formulaPrefix = true;
  } else if (first === '-' && !/^-?\d+(\.\d+)?$/.test(trimmed)) {
    formulaPrefix = true;
  }

  let out = s.replace(/"/g, '""');
  const needsQuote = out.includes(',') || out.includes('\n') || out.includes('\r') || out.includes('"');
  if (formulaPrefix) {
    out = "'" + out;
  }
  if (needsQuote || formulaPrefix) {
    out = `"${out}"`;
  }
  return out;
}

export function formatInvoiceNumber(b) {
  if (!b) return 'INV-1001';
  if (b.invoice_no) return b.invoice_no;
  const num = parseInt(b.id, 10);
  if (!isNaN(num)) {
    return `INV-${1000 + num}`;
  }
  return `INV-${String(b.id || 1).padStart(4, '0')}`;
}

// ---- Financial rules (mirror the SQL triggers) ----------------------------

// Derive a bill's status from net amount vs paid amount.
// Mirrors the BEFORE INSERT/UPDATE trigger on public.bills.
// Returns 'PAID' | 'PARTIAL' | 'UNPAID'; does NOT handle VOID (pass-through).
export function deriveBillStatus(netAmountPaise, paidAmountPaise, forceVoid = false) {
  if (forceVoid) return 'VOID';
  const net = Number(netAmountPaise) || 0;
  const paid = Number(paidAmountPaise) || 0;
  if (net > 0 && paid >= net) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'UNPAID';
}

// Derive a bill's status AFTER a payment is added or removed.
// Mirrors payments.js triggerDeletePayment / payment add logic.
export function deriveBillStatusAfterPayment(netAmountPaise, newPaidPaise) {
  return deriveBillStatus(netAmountPaise, newPaidPaise);
}

// ---- Tenant login derivations (mirror tenantAuth.js / forms.js) -----------

// Strip a phone number to its trailing 10 digits, or '' if too short.
export function normalizeTenDigitMobile(mobile = '') {
  const digits = String(mobile).replace(/[^0-9]/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

// Build the deterministic tenant portal login email from a 10-digit phone.
// Mirrors tensantAuth.js: `tenant_${tenDigitMobile}@rentbill.local`.
export function tenantLoginEmailFromMobile(mobile = '') {
  const ten = normalizeTenDigitMobile(mobile);
  if (!ten || ten.length < 10) return '';
  return `tenant_${ten}@rentbill.local`;
}

// Default tenant password: trailing 10 digits, or fallback if too short.
// Mirrors forms.js default password logic.
export function defaultTenantPassword(mobile = '', fallback = 'Tenant@123') {
  const ten = normalizeTenDigitMobile(mobile);
  if (ten && ten.length >= 6) return ten;
  return fallback;
}

// Normalize a parsed backup JSON into an ordered table -> rows map.
// Export writes tables under { data: { <table>: rows } }; older exports placed
// them at the top level, so both are accepted. Returns only known tables that
// actually contain an array of rows.
export function extractBackupTables(backupData) {
  const tables = ['properties', 'units', 'renters', 'owners', 'documents', 'expenses', 'owner_withdrawals', 'bills', 'payments'];
  const root = (backupData && backupData.data && typeof backupData.data === 'object') ? backupData.data : backupData;
  const out = {};
  for (const t of tables) {
    let rows = (root && typeof root === 'object') ? root[t] : null;
    if (!Array.isArray(rows) && backupData && typeof backupData === 'object') rows = backupData[t];
    if (Array.isArray(rows)) out[t] = rows;
  }
  return out;
}
