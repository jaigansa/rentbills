// RentBill Pro — Payments Recording, Receipts & A4 Print Engine (Pure Supabase)
import { getSupabaseClient } from '../core/config.js';
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
      if (currentUser && currentUser.role === 'TENANT' && currentUser.renter_id) {
        query = query.eq('renter_id', currentUser.renter_id);
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
      const { data: bData } = await supabaseClient.from('bills').select('id, uuid, invoice_no');
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
                  <button class="dropdown-item" onclick="printReceipt(${p.bill_id})"><i data-lucide="printer"></i> Print Receipt</button>
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
    const { error: delErr } = await supabaseClient.from('payments').update({ deleted_at: new Date().toISOString() }).eq('id', paymentId);
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

        await supabaseClient.from('bills').update({ paid_amount: newPaid, status: newStatus }).eq('id', billId);
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

export async function printReceipt(billId) {
  const supabaseClient = getSupabaseClient();
  try {
    if (!supabaseClient) return;
    const { data: b } = await supabaseClient.from('bills').select('*').eq('id', billId).single();
    if (!b) { alert('Bill invoice not found'); return; }

    const { data: t } = await supabaseClient.from('renters').select('*').eq('id', b.renter_id).single();
    const tenantName = t ? t.name : `Tenant #${b.renter_id}`;

    let propName = 'RentBill Pro Property';
    let propAddress = 'Property Address Details';
    let unitName = `Unit #${t ? t.unit_id : '-'}`;

    if (t && t.unit_id) {
      const { data: u } = await supabaseClient.from('units').select('unit_name, property_id').eq('id', t.unit_id).single();
      if (u) {
        unitName = u.unit_name;
        const { data: p } = await supabaseClient.from('properties').select('name, address').eq('id', u.property_id).single();
        if (p) {
          propName = p.name;
          propAddress = p.address || '';
        }
      }
    }

    const { data: payments } = await supabaseClient.from('payments').select('*').eq('bill_id', billId).is('deleted_at', null).order('created_at', { ascending: false }).limit(1);
    const lastPay = payments && payments.length > 0 ? payments[0] : null;

    const docTitleEl = document.getElementById('print-doc-title');
    if (docTitleEl) {
      docTitleEl.textContent = b.status === 'PAID' ? 'OFFICIAL RENT PAYMENT RECEIPT / CASH BILL' : 'RENT BILL / INVOICE STATEMENT';
    }

    const elPropName = document.getElementById('print-prop-name'); if (elPropName) elPropName.textContent = propName;
    const elPropAddr = document.getElementById('print-prop-address'); if (elPropAddr) elPropAddr.textContent = propAddress;
    const elTenantName = document.getElementById('print-tenant-name'); if (elTenantName) elTenantName.textContent = tenantName;
    const elUnitName = document.getElementById('print-unit-name'); if (elUnitName) elUnitName.textContent = unitName;
    const elPeriod = document.getElementById('print-period');
    if (elPeriod) {
      if (b.period_start_date && b.period_end_date) {
        elPeriod.innerHTML = `<strong>${b.billing_period}</strong><div style="font-size: 10px; color: #64748b; font-weight: normal; margin-top: 2px;">Stay: ${b.period_start_date} to ${b.period_end_date}</div>`;
      } else {
        elPeriod.textContent = b.billing_period || '-';
      }
    }
    const elStatus = document.getElementById('print-status-label'); if (elStatus) elStatus.textContent = b.status || 'UNPAID';
    const elRcpNo = document.getElementById('print-receipt-no'); if (elRcpNo) elRcpNo.textContent = `RCP-${b.id}`;
    const elBillNo = document.getElementById('print-bill-no'); if (elBillNo) elBillNo.textContent = formatInvoiceNumber(b);
    const elDate = document.getElementById('print-date');
    if (elDate) {
      elDate.textContent = b.bill_date || (b.created_at ? new Date(b.created_at).toLocaleDateString() : new Date().toLocaleDateString());
    }

    // EB Meter Readings & Consumption
    const prevEb = b.prev_eb_reading || 0;
    const currEb = b.curr_eb_reading || 0;
    const ebUnits = Math.max(0, currEb - prevEb);
    const ebRatePaise = b.eb_unit_price || 0;

    const elEbPrev = document.getElementById('print-eb-prev');
    if (elEbPrev) elEbPrev.textContent = prevEb;
    const elEbCurr = document.getElementById('print-eb-curr');
    if (elEbCurr) elEbCurr.textContent = currEb;
    const elEbConsumed = document.getElementById('print-eb-consumed');
    if (elEbConsumed) elEbConsumed.textContent = `${ebUnits} Units`;
    const elEbRate = document.getElementById('print-eb-rate');
    if (elEbRate) elEbRate.textContent = formatCurrency(ebRatePaise) + '/unit';
    const elEbTotal = document.getElementById('print-eb-total');
    if (elEbTotal) elEbTotal.textContent = formatCurrency(b.eb_amount || 0);

    // Water Meter Readings & Consumption
    if (b.water_calc_mode === 'METERED') {
      const prevW = b.prev_water_reading || 0;
      const currW = b.curr_water_reading || 0;
      const wUnits = Math.max(0, currW - prevW);
      const wRatePaise = b.water_unit_price || 0;

      const elWPrev = document.getElementById('print-water-prev');
      if (elWPrev) elWPrev.textContent = prevW;
      const elWCurr = document.getElementById('print-water-curr');
      if (elWCurr) elWCurr.textContent = currW;
      const elWConsumed = document.getElementById('print-water-consumed');
      if (elWConsumed) elWConsumed.textContent = `${wUnits} Units`;
      const elWRate = document.getElementById('print-water-rate');
      if (elWRate) elWRate.textContent = formatCurrency(wRatePaise) + '/unit';
      const elWTotal = document.getElementById('print-water-total');
      if (elWTotal) elWTotal.textContent = formatCurrency(b.water_amount || 0);
    } else {
      const elWPrev = document.getElementById('print-water-prev');
      if (elWPrev) elWPrev.textContent = 'N/A';
      const elWCurr = document.getElementById('print-water-curr');
      if (elWCurr) elWCurr.textContent = 'N/A';
      const elWConsumed = document.getElementById('print-water-consumed');
      if (elWConsumed) elWConsumed.textContent = 'Fixed Charge';
      const elWRate = document.getElementById('print-water-rate');
      if (elWRate) elWRate.textContent = 'Flat Rate';
      const elWTotal = document.getElementById('print-water-total');
      if (elWTotal) elWTotal.textContent = formatCurrency(b.water_amount || 0);
    }

    const elRent = document.getElementById('print-val-rent'); if (elRent) elRent.textContent = formatCurrency(b.rent_amount);
    const elMaint = document.getElementById('print-val-maint'); if (elMaint) elMaint.textContent = formatCurrency(b.maint_amount);
    const elWater = document.getElementById('print-val-water'); if (elWater) elWater.textContent = formatCurrency(b.water_amount);
    const elEb = document.getElementById('print-val-eb'); if (elEb) elEb.textContent = formatCurrency(b.eb_amount);
    const elArrears = document.getElementById('print-val-arrears'); if (elArrears) elArrears.textContent = formatCurrency(b.arrears_included);
    const elLate = document.getElementById('print-val-late'); if (elLate) elLate.textContent = formatCurrency(b.late_fee);
    const elDiscount = document.getElementById('print-val-discount'); if (elDiscount) elDiscount.textContent = formatCurrency(b.discount_amount);
    const elNet = document.getElementById('print-val-net'); if (elNet) elNet.textContent = formatCurrency(b.net_amount);
    const elPaid = document.getElementById('print-val-paid'); if (elPaid) elPaid.textContent = formatCurrency(b.paid_amount);

    const due = Math.max(0, (b.net_amount || 0) - (b.paid_amount || 0));
    const elDue = document.getElementById('print-val-outstanding'); if (elDue) elDue.textContent = formatCurrency(due);

    const targetAmount = (b.paid_amount && b.paid_amount > 0) ? b.paid_amount : b.net_amount;
    const wordsEl = document.getElementById('print-amount-words');
    if (wordsEl) {
      wordsEl.textContent = numberToWordsINR(targetAmount);
    }

    // Owner Payment & Bank Transfer Details for Receipt
    let ownerName = '-';
    let ownerUpi = '-';
    let ownerBank = '-';
    let ownerAcc = '-';
    let ownerIfsc = '-';

    let ownerObj = null;
    if (t && t.owner_id) {
      const { data: o } = await supabaseClient.from('owners').select('*').eq('id', t.owner_id).single();
      if (o) ownerObj = o;
    }
    if (!ownerObj) {
      const { data: ownersList } = await supabaseClient.from('owners').select('*').is('deleted_at', null).limit(1);
      if (ownersList && ownersList.length > 0) ownerObj = ownersList[0];
    }

    if (ownerObj) {
      ownerName = ownerObj.name || '-';
      ownerUpi = ownerObj.upi_id || '-';
      ownerBank = ownerObj.bank_name || '-';
      ownerAcc = ownerObj.account_number || '-';
      ownerIfsc = ownerObj.ifsc_code || '-';
    }

    const elOwnerName = document.getElementById('print-owner-name');
    if (elOwnerName) elOwnerName.textContent = ownerName;
    const elOwnerUpi = document.getElementById('print-owner-upi');
    if (elOwnerUpi) elOwnerUpi.textContent = ownerUpi;
    const elOwnerBank = document.getElementById('print-owner-bank');
    if (elOwnerBank) elOwnerBank.textContent = ownerBank;
    const elOwnerAcc = document.getElementById('print-owner-acc');
    if (elOwnerAcc) elOwnerAcc.textContent = ownerAcc;
    const elOwnerIfsc = document.getElementById('print-owner-ifsc');
    if (elOwnerIfsc) elOwnerIfsc.textContent = ownerIfsc;

    // Render Dynamic UPI QR Code for unpaid/partial bills
    const qrContainer = document.getElementById('print-upi-qr-container');
    const qrImg = document.getElementById('print-upi-qr');
    if (b.status !== 'PAID' && b.status !== 'VOID' && ownerObj && ownerObj.upi_id) {
      const dueRupees = (due / 100).toFixed(2);
      const upiURI = `upi://pay?pa=${ownerObj.upi_id}&pn=${encodeURIComponent(ownerObj.name)}&am=${dueRupees}&cu=INR&tn=${encodeURIComponent('Rent Bill ' + b.billing_period)}`;
      if (qrImg) {
        qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(upiURI)}`;
      }
      if (qrContainer) qrContainer.style.display = 'block';
    } else {
      if (qrContainer) qrContainer.style.display = 'none';
    }

    const printMethodEl = document.getElementById('print-method');
    if (printMethodEl) printMethodEl.textContent = lastPay ? (lastPay.payment_method || 'CASH') : 'PENDING';
    const printRefEl = document.getElementById('print-ref');
    if (printRefEl) printRefEl.textContent = lastPay ? (lastPay.transaction_reference || '-') : '-';

    window.print();
  } catch (err) {
    console.error('Print receipt failed', err);
    window.print();
  }
}

export async function triggerApprovePaymentProof(paymentId, billId, amount) {
  if (!confirm('Approve this tenant payment proof verification?')) return;
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { data: bill } = await client.from('bills').select('*').eq('id', billId).maybeSingle();
    await client.from('payments').update({
      proof_status: 'VERIFIED',
      verified_at: new Date().toISOString()
    }).eq('id', paymentId);

    if (bill) {
      const newPaid = (bill.paid_amount || 0) + amount;
      let newStatus = 'PARTIAL';
      if (newPaid >= bill.net_amount) newStatus = 'PAID';

      await client.from('bills').update({ paid_amount: newPaid, status: newStatus }).eq('id', billId);

      const remainingDue = Math.max(0, bill.net_amount - newPaid);
      if (bill.renter_id) {
        await client.from('renters').update({ pending_arrears: remainingDue }).eq('id', bill.renter_id);
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
    await client.from('payments').update({ proof_status: 'REJECTED' }).eq('id', paymentId);
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
