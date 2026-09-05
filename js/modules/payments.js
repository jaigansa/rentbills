// RentBill Pro — Payments Recording, Receipts & A4 Print Engine (Pure Supabase)
import { getSupabaseClient } from '../core/config.js';
import { safeUpdate, safeDelete } from '../core/db.js';
import { getCurrentUser } from '../core/state.js';
import { formatCurrency, formatInvoiceNumber, numberToWordsINR, renderEmptyState, openModal, refreshLucideIcons, escapeStr } from '../core/ui.js';
import { loadBillsPage, shareInvoiceWhatsApp, copyInvoiceToClipboard, sharePaymentReceiptWhatsApp } from './bills.js';
import { loadDashboard } from './dashboard.js';

export async function loadPaymentsPage() {
  const supabaseClient = getSupabaseClient();
  const currentUser = getCurrentUser();
  try {
    if (!supabaseClient) return;

    let payments = [];
    try {
      let query = supabaseClient.from('payments').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (currentUser && currentUser.role === 'TENANT') {
        if (currentUser.renter_id) {
          query = query.eq('renter_id', currentUser.renter_id);
        } else {
          // No resolved renter_id -> force an empty result, never widen scope.
          query = query.eq('renter_id', -1);
        }
      }
      const { data: pData } = await query;
      payments = pData || [];
    } catch (e) {
      console.warn('Payments fetch warning:', e);
    }
    
    let renters = [];
    try {
      const { data: rData } = await supabaseClient.from('renters').select('id, name');
      renters = rData || [];
    } catch (e) {}

    const renterMap = {};
    renters.forEach(r => { renterMap[r.id] = r.name; });

    let bills = [];
    try {
      const { data: bData } = await supabaseClient.from('bills').select('id, uuid, billing_period');
      bills = bData || [];
    } catch (e) {}

    const billMap = {};
    bills.forEach(b => { billMap[b.id] = b; });

    const tbody = document.getElementById('table-body-payments');
    if (tbody) {
      tbody.innerHTML = '';
      if (!payments || payments.length === 0) {
        tbody.innerHTML = renderEmptyState(8, 'No payment records logged yet');
      } else {
        payments.forEach(p => {
          const tenantName = renterMap[p.renter_id] || `Tenant #${p.renter_id || '-'}`;
          const parentBill = billMap[p.bill_id] || { id: p.bill_id || p.id };
          const invoiceNo = formatInvoiceNumber(parentBill);

          const uuidSuffix = parentBill.uuid ? ` (${parentBill.uuid.substring(0, 8)})` : (p.uuid ? ` (${p.uuid.substring(0, 8)})` : ` (ID:${p.id})`);

          let proofBadge = `<span class="badge badge-success">VERIFIED</span>`;
          if (p.proof_status === 'PENDING') {
            proofBadge = `<span class="badge badge-warning">PENDING VERIFICATION</span>`;
          } else if (p.proof_status === 'REJECTED') {
            proofBadge = `<span class="badge badge-danger">REJECTED</span>`;
          }

          const isPending = p.proof_status === 'PENDING';
          const isRejected = p.proof_status === 'REJECTED';
          const statusClass = isPending ? 'status-pending' : (isRejected ? 'status-rejected' : 'status-verified');

          const tr = document.createElement('tr');
          tr.className = `payment-card-row ${statusClass}`;
          tr.setAttribute('data-status', p.proof_status || 'VERIFIED');

          const paymentDateDisplay = p.payment_date ? new Date(p.payment_date).toLocaleDateString() : (p.created_at ? new Date(p.created_at).toLocaleDateString() : '-');

          const quickActionsHtml = `
            <div class="payment-mobile-quick-actions mobile-only">
              <button type="button" class="btn-quick-action" onclick="printPaidReceipt(${p.bill_id}, ${p.id})">
                <i data-lucide="printer"></i> Receipt
              </button>
              <button type="button" class="btn-quick-action" onclick="sharePaymentReceiptWhatsApp(${p.id})">
                <i data-lucide="share-2"></i> Share
              </button>
              ${p.proof_photo ? `
                <button type="button" class="btn-quick-action" onclick="viewPaymentProofImage(${p.id})">
                  <i data-lucide="image"></i> Photo
                </button>
              ` : ''}
              ${currentUser && currentUser.role !== 'TENANT' && isPending ? `
                <button type="button" class="btn-quick-action action-approve" onclick="triggerApprovePaymentProof(${p.id}, ${p.bill_id})">
                  <i data-lucide="check-circle"></i> Approve
                </button>
                <button type="button" class="btn-quick-action action-reject" onclick="triggerRejectPaymentProof(${p.id})">
                  <i data-lucide="x-circle"></i> Reject
                </button>
              ` : ''}
            </div>
          `;

          tr.innerHTML = `
            <td data-label="Invoice Number & UUID">
              <div class="payment-mobile-header">
                <div class="payment-inv-pill">
                  <i data-lucide="receipt" class="mobile-only"></i>
                  <strong>${escapeStr(invoiceNo)}</strong>
                  <span class="payment-uuid-tag">${escapeStr(uuidSuffix)}</span>
                </div>
                <div class="payment-date-tag">Date: ${escapeStr(paymentDateDisplay)}</div>
              </div>
            </td>
            <td data-label="Renter Name">
              <div class="payment-tenant-row">
                <i data-lucide="user" class="mobile-only"></i>
                <strong>${escapeStr(tenantName)}</strong>
              </div>
            </td>
            <td data-label="Amount">
              <span class="payment-desktop-col"><strong>${formatCurrency(p.amount)}</strong></span>
              
              <!-- Mobile Payment Strip -->
              <div class="payment-mobile-strip mobile-only">
                <div class="payment-col">
                  <span class="payment-label">Received</span>
                  <span class="payment-val amount-val">${formatCurrency(p.amount)}</span>
                </div>
                <div class="payment-col">
                  <span class="payment-label">Method</span>
                  <span class="payment-val method-val">${escapeStr(p.payment_method || '-')}</span>
                </div>
                <div class="payment-col">
                  <span class="payment-label">Ref No</span>
                  <span class="payment-val ref-val" title="${escapeStr(p.transaction_reference || '-')}">${escapeStr(p.transaction_reference || '-')}</span>
                </div>
              </div>
            </td>
            <td data-label="Method" class="payment-desktop-col">${escapeStr(p.payment_method || '-')}</td>
            <td data-label="Ref No" class="payment-desktop-col">${escapeStr(p.transaction_reference || '-')}</td>
            <td data-label="Payment Date" class="payment-desktop-col">${paymentDateDisplay}</td>
            <td data-label="Verification">${proofBadge}</td>
            <td data-label="Actions">
              <div class="dropdown">
                <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
                <div class="dropdown-menu">
                  ${p.proof_photo ? `<button class="dropdown-item" onclick="viewPaymentProofImage(${p.id})"><i data-lucide="image"></i> View Receipt Photo</button>` : ''}
                  ${currentUser && currentUser.role !== 'TENANT' && p.proof_status === 'PENDING' ? `<button class="dropdown-item success" onclick="triggerApprovePaymentProof(${p.id}, ${p.bill_id})"><i data-lucide="check-circle"></i> Approve Proof</button>` : ''}
                  ${currentUser && currentUser.role !== 'TENANT' && p.proof_status === 'PENDING' ? `<button class="dropdown-item danger" onclick="triggerRejectPaymentProof(${p.id})"><i data-lucide="x-circle"></i> Reject Proof</button>` : ''}
                  <button class="dropdown-item" onclick="printPaidReceipt(${p.bill_id}, ${p.id})"><i data-lucide="printer"></i> Print Payment Receipt</button>
                  <button class="dropdown-item" onclick="sharePaymentReceiptWhatsApp(${p.id})"><i data-lucide="share-2"></i> Share Receipt</button>
                  <button class="dropdown-item" onclick="shareInvoiceWhatsApp(${p.bill_id})"><i data-lucide="share-2"></i> Share Invoice</button>
                  <button class="dropdown-item" onclick="copyInvoiceToClipboard(${p.bill_id})"><i data-lucide="copy"></i> Copy Invoice Text</button>
                  ${currentUser && currentUser.role !== 'TENANT' ? `<button class="dropdown-item danger" onclick="triggerDeletePayment(${p.id}, ${p.bill_id})"><i data-lucide="trash-2"></i> Delete Payment</button>` : ''}
                </div>
              </div>
              ${quickActionsHtml}
            </td>
          `;
          tbody.appendChild(tr);
        });
        filterPaymentsTable();
        refreshLucideIcons();
      }
    }
  } catch (err) {
    console.error('Failed to load payments', err);
  }
}

export function filterPaymentsTable() {
  const searchVal = (document.getElementById('payment-search-input')?.value || '').toLowerCase();
  const methodFilter = document.getElementById('payment-filter-method')?.value || 'ALL';
  const statusFilter = document.getElementById('payment-filter-status')?.value || 'ALL';

  const rows = document.querySelectorAll('#table-body-payments tr');
  rows.forEach(tr => {
    if (tr.children.length === 1 && tr.textContent.includes('No payment')) return;

    const text = tr.textContent.toLowerCase();
    const methodCell = tr.querySelector('[data-label="Method"]')?.textContent.toUpperCase() || '';
    const statusCell = tr.querySelector('[data-label="Verification"]')?.textContent.toUpperCase() || '';

    const matchesSearch = text.includes(searchVal);
    const matchesMethod = methodFilter === 'ALL' || methodCell.includes(methodFilter);
    const matchesStatus = statusFilter === 'ALL' || statusCell.includes(statusFilter);

    tr.style.display = (matchesSearch && matchesMethod && matchesStatus) ? '' : 'none';
  });
}

// After a payment insert/delete/approve/reject the sync_bill_paid_amount trigger
// keeps bills.paid_amount (and status) authoritative. This helper refreshes the
// tenant's pending_arrears from the post-trigger bill value without manually
// re-deriving paid_amount (which previously double-counted on approve and
// double-decremented on delete).
async function syncPaymentArrears(client, billId) {
  if (!client || !billId) return;
  const { data: bill } = await client
    .from('bills')
    .select('id, renter_id, net_amount, paid_amount, status')
    .eq('id', billId)
    .single();
  if (bill && bill.renter_id) {
    const remainingDue = Math.max(0, (Number(bill.net_amount) || 0) - (Number(bill.paid_amount) || 0));
    await safeUpdate(client, 'renters', { pending_arrears: remainingDue }, 'id', bill.renter_id);
  }
}

export async function triggerDeletePayment(paymentId, billId) {
  const supabaseClient = getSupabaseClient();
  if (!confirm('Are you sure you want to delete/revoke this payment record?')) return;
  try {
    const { error: delErr } = await safeDelete(supabaseClient, 'payments', paymentId);
    if (delErr) {
      alert('Failed to delete payment: ' + delErr.message);
      return;
    }

    // The trigger already recomputed bills.paid_amount/status excluding this
    // payment; only refresh the tenant's pending_arrears from the fresh value.
    if (billId) {
      await syncPaymentArrears(supabaseClient, billId);
    }

    alert('Payment deleted and bill balance updated successfully');
    loadPaymentsPage();
    loadBillsPage();
    loadDashboard();
  } catch (err) {
    alert('Delete payment error: ' + err.message);
  }
}

export async function printPaidReceipt(billId, paymentId) {
  if (!billId && !paymentId) {
    alert('Invalid payment reference');
    return;
  }
  // Opens standalone official payment receipt voucher in a new window with autoprint triggered
  window.open(`paid.html?billId=${billId || ''}&paymentId=${paymentId || ''}&autoprint=1`, '_blank');
}

export async function printReceipt(billId) {
  if (!billId) {
    alert('Invalid Bill ID');
    return;
  }
  // Opens standalone A4 receipt template in a new window with autoprint triggered
  window.open(`receipt.html?id=${billId}&autoprint=1`, '_blank');
}

export async function triggerApprovePaymentProof(paymentId, billId) {
  if (!confirm('Approve this tenant payment proof verification?')) return;
  const client = getSupabaseClient();
  if (!client) return;

  try {
    await safeUpdate(client, 'payments', {
      proof_status: 'VERIFIED',
      verified_at: new Date().toISOString()
    }, 'id', paymentId);

    // The payment was already counted in bills.paid_amount while PENDING, and the
    // trigger re-sums on the PENDING->VERIFIED transition (sum is unchanged).
    // Simply refresh arrears — never add the amount again (was double-counting).
    await syncPaymentArrears(client, billId);

    alert('✅ Payment proof approved successfully! Invoice updated.');
    loadPaymentsPage();
    loadBillsPage();
    loadDashboard();
  } catch (e) {
    alert('Failed to approve proof: ' + e.message);
  }
}

export async function triggerRejectPaymentProof(paymentId) {
  if (!confirm('Reject this tenant payment proof submission?')) return;
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { data: payment } = await client.from('payments').select('bill_id').eq('id', paymentId).maybeSingle();
    await safeUpdate(client, 'payments', { proof_status: 'REJECTED' }, 'id', paymentId);

    // REJECTED payments are excluded by the sync trigger, so paid_amount drops;
    // refresh the tenant's pending_arrears to match.
    if (payment && payment.bill_id) {
      await syncPaymentArrears(client, payment.bill_id);
    }

    alert('⚠️ Payment proof rejected.');
    loadPaymentsPage();
    loadBillsPage();
  } catch (e) {
    alert('Failed to reject proof: ' + e.message);
  }
}

export async function viewPaymentProofImage(paymentId) {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { data: p } = await client.from('payments').select('proof_photo').eq('id', paymentId).single();
    const photoUrl = p ? p.proof_photo : null;
    if (!photoUrl) {
      alert('No proof screenshot image attached for this payment.');
      return;
    }
    const imgEl = document.getElementById('proof-image-display');
    if (imgEl) imgEl.src = photoUrl;
    openModal('modal-view-proof-image');
  } catch (e) {
    alert('Failed to load image: ' + e.message);
  }
}
