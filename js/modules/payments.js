// RentBill Pro — Payments Recording, Receipts & A4 Print Engine (Pure Supabase)
import { getSupabaseClient } from '../core/config.js';
import { safeUpdate, safeDelete } from '../core/db.js';
import { getCurrentUser } from '../core/state.js';
import { formatCurrency, formatInvoiceNumber, numberToWordsINR, renderEmptyState, openModal, refreshLucideIcons } from '../core/ui.js';
import { loadBillsPage, shareInvoiceWhatsApp, copyInvoiceToClipboard } from './bills.js';
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

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td data-label="Invoice Number & UUID">
              <strong>${invoiceNo}</strong>
              <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${uuidSuffix}</span>
            </td>
            <td data-label="Renter Name"><strong>${tenantName}</strong></td>
            <td data-label="Amount"><strong>${formatCurrency(p.amount)}</strong></td>
            <td data-label="Method">${p.payment_method || '-'}</td>
            <td data-label="Ref No">${p.transaction_reference || '-'}</td>
            <td data-label="Payment Date">${p.payment_date ? new Date(p.payment_date).toLocaleDateString() : (p.created_at ? new Date(p.created_at).toLocaleDateString() : '-')}</td>
            <td data-label="Verification">${proofBadge}</td>
            <td data-label="Actions">
              <div class="dropdown">
                <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
                <div class="dropdown-menu">
                  ${p.proof_photo ? `<button class="dropdown-item" onclick="viewPaymentProofImage(${p.id})"><i data-lucide="image"></i> View Receipt Photo</button>` : ''}
                  ${currentUser && currentUser.role !== 'TENANT' && p.proof_status === 'PENDING' ? `<button class="dropdown-item success" onclick="triggerApprovePaymentProof(${p.id}, ${p.bill_id}, ${p.amount})"><i data-lucide="check-circle"></i> Approve Proof</button>` : ''}
                  ${currentUser && currentUser.role !== 'TENANT' && p.proof_status === 'PENDING' ? `<button class="dropdown-item danger" onclick="triggerRejectPaymentProof(${p.id})"><i data-lucide="x-circle"></i> Reject Proof</button>` : ''}
                  <button class="dropdown-item" onclick="printPaidReceipt(${p.bill_id}, ${p.id})"><i data-lucide="printer"></i> Print Payment Receipt</button>
                  <button class="dropdown-item" onclick="shareInvoiceWhatsApp(${p.bill_id})"><i data-lucide="message-square"></i> WhatsApp Invoice</button>
                  <button class="dropdown-item" onclick="copyInvoiceToClipboard(${p.bill_id})"><i data-lucide="copy"></i> Copy Invoice Text</button>
                  ${currentUser && currentUser.role !== 'TENANT' ? `<button class="dropdown-item danger" onclick="triggerDeletePayment(${p.id}, ${p.bill_id}, ${p.amount})"><i data-lucide="trash-2"></i> Delete Payment</button>` : ''}
                </div>
              </div>
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

export async function triggerDeletePayment(paymentId, billId, amountPaise) {
  const supabaseClient = getSupabaseClient();
  if (!confirm('Are you sure you want to delete/revoke this payment record?')) return;
  try {
    const { error: delErr } = await safeDelete(supabaseClient, 'payments', paymentId);
    if (delErr) {
      alert('Failed to delete payment: ' + delErr.message);
      return;
    }

    if (billId) {
      const { data: bill } = await supabaseClient.from('bills').select('*').eq('id', billId).single();
      if (bill) {
        const newPaid = Math.max(0, (bill.paid_amount || 0) - amountPaise);
        let newStatus = 'UNPAID';
        if (newPaid >= bill.net_amount && bill.net_amount > 0) newStatus = 'PAID';
        else if (newPaid > 0) newStatus = 'PARTIAL';

        await safeUpdate(supabaseClient, 'bills', { paid_amount: newPaid, status: newStatus }, 'id', billId);
      }
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

export async function triggerApprovePaymentProof(paymentId, billId, amount) {
  if (!confirm('Approve this tenant payment proof verification?')) return;
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { data: bill } = await client.from('bills').select('*').eq('id', billId).maybeSingle();
    await safeUpdate(client, 'payments', {
      proof_status: 'VERIFIED',
      verified_at: new Date().toISOString()
    }, 'id', paymentId);

    if (bill) {
      const newPaid = (bill.paid_amount || 0) + amount;
      let newStatus = 'PARTIAL';
      if (newPaid >= bill.net_amount) newStatus = 'PAID';

      await safeUpdate(client, 'bills', { paid_amount: newPaid, status: newStatus }, 'id', billId);

      const remainingDue = Math.max(0, bill.net_amount - newPaid);
      if (bill.renter_id) {
        await safeUpdate(client, 'renters', { pending_arrears: remainingDue }, 'id', bill.renter_id);
      }
    }

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
    await safeUpdate(client, 'payments', { proof_status: 'REJECTED' }, 'id', paymentId);
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
