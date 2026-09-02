// RentBill Pro — Billing Engine, Invoices & WhatsApp Automated Notifications (Pure Supabase)
import { getSupabaseClient } from '../core/config.js';
import { safeUpdate, safeDelete } from '../core/db.js';
import { getCurrentUser } from '../core/state.js';
import { formatCurrency, formatInvoiceNumber, escapeStr, renderEmptyState, openModal, refreshLucideIcons } from '../core/ui.js';
import { loadDashboard } from './dashboard.js';

export function populateBillingPeriods() {
  const periodInput = document.getElementById('bill-period');
  if (!periodInput) return;
  
  if (!periodInput.value) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    periodInput.value = currentMonth;
  }

  syncBillPeriodDates();

  periodInput.oninput = function() {
    syncBillPeriodDates();
    updateLiveBillCalculation();
  };
  periodInput.onchange = function() {
    syncBillPeriodDates();
    updateLiveBillCalculation();
  };
}

export function syncBillPeriodDates(force = false) {
  const periodSelect = document.getElementById('bill-period');
  const fromInput = document.getElementById('bill-period-from');
  const toInput = document.getElementById('bill-period-to');
  const genDateInput = document.getElementById('bill-generated-date');
  const dueDateInput = document.getElementById('bill-due-date');

  if (!periodSelect || !periodSelect.value) return;

  const parts = periodSelect.value.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);

  if (!isNaN(year) && !isNaN(month)) {
    const endDate = new Date(year, month, 0); // Last day of month
    const startIso = `${year}-${String(month).padStart(2, '0')}-01`;
    const endIso = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    if (fromInput) fromInput.value = startIso;
    if (toInput) toInput.value = endIso;

    if (genDateInput && (!genDateInput.value || force)) {
      genDateInput.value = new Date().toISOString().slice(0, 10);
    }

    const cfgDueDay = parseInt(localStorage.getItem('rentbill_due_day') || '10', 10) || 10;
    const dueDayClamped = Math.min(cfgDueDay, endDate.getDate());
    const dueIso = `${year}-${String(month).padStart(2, '0')}-${String(dueDayClamped).padStart(2, '0')}`;
    if (dueDateInput && (!dueDateInput.value || force)) {
      dueDateInput.value = dueIso;
    }
  }
}

export async function loadBillsPage() {
  const supabaseClient = getSupabaseClient();
  const currentUser = getCurrentUser();

  try {
    if (!supabaseClient) return;
    populateBillingPeriods();

    let allRenters = [];
    const { data: rData } = await supabaseClient.from('renters').select('id, name').is('deleted_at', null);
    allRenters = rData || [];
    
    const renterMap = {};
    allRenters.forEach(r => { renterMap[r.id] = r.name; });

    const { data: tenants } = await supabaseClient.from('renters').select('*').eq('is_active', true).is('deleted_at', null);
    const billRenterSelect = document.getElementById('bill-renter-id');
    if (billRenterSelect) {
      billRenterSelect.innerHTML = '<option value="">Select Tenant</option>';
      (tenants || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.name} (Unit: ${t.unit_id})`;
        billRenterSelect.appendChild(opt);
      });
      billRenterSelect.onchange = async function() {
        const selId = this.value;
        const selTenant = (tenants || []).find(t => String(t.id) === String(selId));
        const rentEl = document.getElementById('bill-rent-amount');
        if (rentEl && selTenant) {
          rentEl.value = ((selTenant.base_rent || 0) / 100).toFixed(2);
        }
        const arrearsEl = document.getElementById('bill-arrears');
        if (arrearsEl && selTenant) {
          arrearsEl.value = ((selTenant.pending_arrears || 0) / 100).toFixed(2);
        }
        syncBillPeriodDates();
        await updateLiveBillCalculation();
      };
    }

    let bills = [];
    try {
      let query = supabaseClient.from('bills').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (currentUser && currentUser.role === 'TENANT' && currentUser.renter_id) {
        query = query.eq('renter_id', currentUser.renter_id);
      }
      const { data: bData } = await query;
      bills = bData || [];
    } catch (e) {
      console.warn('Bills fetch warning:', e);
    }

    const tbody = document.getElementById('table-body-bills');
    if (tbody) {
      tbody.innerHTML = '';
      if (!bills || bills.length === 0) {
        tbody.innerHTML = renderEmptyState(8, 'No bill invoices generated yet');
      } else {
        bills.forEach(b => {
          const tr = document.createElement('tr');
          let badgeClass = 'badge-warning';
          if (b.status === 'PAID') badgeClass = 'badge-success';
          if (b.status === 'VOID') badgeClass = 'badge-danger';
          if (b.status === 'OVERPAID') badgeClass = 'badge-info';
          
          const due = (b.net_amount || 0) - (b.paid_amount || 0);
          const tenantDisplayName = renterMap[b.renter_id] || (b.renter_id ? `Tenant #${b.renter_id}` : '-');

          let actionHtml = `
            <div class="dropdown">
              <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
              <div class="dropdown-menu">
                <button class="dropdown-item" onclick="printReceipt(${b.id})"><i data-lucide="printer"></i> View & Print Invoice</button>
                <button class="dropdown-item" onclick="shareInvoiceWhatsApp(${b.id})"><i data-lucide="message-square"></i> Share on WhatsApp</button>
                <button class="dropdown-item" onclick="copyInvoiceToClipboard(${b.id})"><i data-lucide="copy"></i> Copy Invoice Text</button>
                ${b.status !== 'PAID' && b.status !== 'VOID' && currentUser.role !== 'TENANT' ? `<button class="dropdown-item" style="color: #d97706;" onclick="sendOverdueReminderWhatsApp(${b.id})"><i data-lucide="alert-triangle"></i> Overdue Reminder</button>` : ''}
                ${b.status !== 'PAID' && b.status !== 'VOID' ? `<button class="dropdown-item" onclick="openPaymentModal(${b.id}, ${due})"><i data-lucide="${currentUser.role === 'TENANT' ? 'upload-cloud' : 'credit-card'}"></i> ${currentUser.role === 'TENANT' ? 'Submit Payment Proof' : 'Record Payment'}</button>` : ''}
                ${b.status !== 'VOID' && currentUser.role !== 'TENANT' ? `<button class="dropdown-item danger" onclick="voidBill(${b.id})"><i data-lucide="slash"></i> Void Invoice</button>` : ''}
                ${currentUser.role !== 'TENANT' ? `<button class="dropdown-item danger" onclick="triggerDeleteBill(${b.id})"><i data-lucide="trash-2"></i> Delete Invoice</button>` : ''}
              </div>
            </div>
          `;

          const uuidSuffix = b.uuid ? ` (${b.uuid.substring(0, 8)})` : ` (ID:${b.id})`;
          
          const stayPeriodDisplay = (b.period_start_date && b.period_end_date)
            ? `<div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${b.period_start_date} → ${b.period_end_date}</div>`
            : '';

          const billDateDisplay = b.bill_date || (b.created_at ? new Date(b.created_at).toLocaleDateString() : '');

          tr.innerHTML = `
            <td data-label="Invoice Number & UUID">
              <strong>${formatInvoiceNumber(b)}</strong>
              <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${uuidSuffix}</span>
              ${billDateDisplay ? `<div style="font-size: 10px; color: var(--text-muted);">Generated: ${billDateDisplay}</div>` : ''}
            </td>
            <td data-label="Renter Name"><strong>${tenantDisplayName}</strong></td>
            <td data-label="Billing & Stay Period">
              <strong>${b.billing_period}</strong>
              ${stayPeriodDisplay}
            </td>
            <td data-label="Gross Charge">${formatCurrency(b.gross_amount)}</td>
            <td data-label="Net Charge"><strong>${formatCurrency(b.net_amount)}</strong></td>
            <td data-label="Paid Amount">${formatCurrency(b.paid_amount)}</td>
            <td data-label="Status"><span class="badge ${badgeClass}">${b.status}</span></td>
            <td data-label="Actions">${actionHtml}</td>
          `;
          tbody.appendChild(tr);
        });
        populateBillsMonthFilter(bills);
        updateUnpaidKpis(bills);
        filterBillsTable();
        refreshLucideIcons();
      }
    }
  } catch (err) {
    console.error('Failed to load bills', err);
  }
}

export function populateBillsMonthFilter(bills) {
  const monthSelect = document.getElementById('bill-filter-month');
  if (!monthSelect) return;

  const months = new Set();
  (bills || []).forEach(b => {
    if (b.billing_period) months.add(b.billing_period);
  });

  const currentVal = monthSelect.value || 'ALL';
  monthSelect.innerHTML = '<option value="ALL">All Months</option>';
  Array.from(months).sort().reverse().forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === currentVal) opt.selected = true;
    monthSelect.appendChild(opt);
  });
}

export function updateUnpaidKpis(bills) {
  const unpaidCountEl = document.getElementById('unpaid-count-kpi');
  const unpaidAmountEl = document.getElementById('unpaid-amount-kpi');
  if (!unpaidCountEl || !unpaidAmountEl) return;

  const unpaidBills = (bills || []).filter(b => b.status === 'UNPAID' || b.status === 'PARTIAL');
  const totalUnpaidCount = unpaidBills.length;
  const totalOutstandingPaise = unpaidBills.reduce((sum, b) => sum + Math.max(0, (b.net_amount || 0) - (b.paid_amount || 0)), 0);

  unpaidCountEl.textContent = `${totalUnpaidCount} Unpaid ${totalUnpaidCount === 1 ? 'Bill' : 'Bills'}`;
  unpaidAmountEl.textContent = formatCurrency(totalOutstandingPaise);
}

export function filterBillsTable() {
  const searchVal = (document.getElementById('bill-search-input')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('bill-filter-status')?.value || 'ALL';
  const monthFilter = document.getElementById('bill-filter-month')?.value || 'ALL';

  const rows = document.querySelectorAll('#table-body-bills tr');
  rows.forEach(tr => {
    if (tr.children.length === 1 && tr.textContent.includes('No bill')) return;

    const text = tr.textContent.toLowerCase();
    const statusCell = tr.querySelector('[data-label="Status"]')?.textContent.toUpperCase() || '';
    const monthCell = tr.querySelector('[data-label="Billing & Stay Period"]')?.textContent || '';

    const matchesSearch = text.includes(searchVal);
    const matchesStatus = statusFilter === 'ALL' || statusCell.includes(statusFilter);
    const matchesMonth = monthFilter === 'ALL' || monthCell.includes(monthFilter);

    tr.style.display = (matchesSearch && matchesMonth && matchesStatus) ? '' : 'none';
  });
}

export async function updateLiveBillCalculation() {
  const supabaseClient = getSupabaseClient();
  const renterId = document.getElementById('bill-renter-id')?.value;

  if (!renterId || !supabaseClient) {
    const elNet = document.getElementById('live-calc-net'); if (elNet) elNet.textContent = '₹0.00';
    const elRent = document.getElementById('live-calc-rent'); if (elRent) elRent.textContent = '₹0.00';
    const elEb = document.getElementById('live-calc-eb'); if (elEb) elEb.textContent = '₹0.00';
    const elEbUnits = document.getElementById('live-calc-eb-units'); if (elEbUnits) elEbUnits.textContent = '0';
    const elWater = document.getElementById('live-calc-water'); if (elWater) elWater.textContent = '₹0.00';
    const elMaint = document.getElementById('live-calc-maint'); if (elMaint) elMaint.textContent = '₹0.00';
    const elExtra = document.getElementById('live-calc-extra'); if (elExtra) elExtra.textContent = '₹0.00';
    const elDiscount = document.getElementById('live-calc-discount'); if (elDiscount) elDiscount.textContent = '₹0.00';
    return;
  }

  const { data: tenant } = await supabaseClient.from('renters').select('*').eq('id', renterId).single();
  if (!tenant) return;

  const { data: lastBills } = await supabaseClient.from('bills')
    .select('curr_eb_reading, curr_water_reading, created_at, bill_date')
    .eq('renter_id', renterId)
    .order('created_at', { ascending: false }).limit(1);

  let prevEb = tenant.initial_eb || 0;
  let prevWater = tenant.initial_water || 0;

  if (lastBills && lastBills.length > 0) {
    const lastBill = lastBills[0];
    const lastBillDate = new Date(lastBill.created_at || lastBill.bill_date || 0);

    const ebResetDate = tenant.eb_reset_at ? new Date(tenant.eb_reset_at) : null;
    if (!ebResetDate || ebResetDate <= lastBillDate) {
      prevEb = lastBill.curr_eb_reading ?? tenant.initial_eb ?? 0;
    }

    const waterResetDate = tenant.water_reset_at ? new Date(tenant.water_reset_at) : null;
    if (!waterResetDate || waterResetDate <= lastBillDate) {
      prevWater = lastBill.curr_water_reading ?? tenant.initial_water ?? 0;
    }
  }

  // Set dynamic placeholders showing previous meter readings
  const ebInput = document.getElementById('bill-eb');
  if (ebInput && !ebInput.value) {
    ebInput.placeholder = `Prev Reading: ${prevEb}`;
  }
  const waterInput = document.getElementById('bill-water');
  if (waterInput && !waterInput.value) {
    waterInput.placeholder = tenant.water_calc_mode === 'METERED' ? `Prev Reading: ${prevWater}` : 'Fixed Flat Rate';
  }

  const rentInputVal = document.getElementById('bill-rent-amount')?.value;
  const rentRupees = (rentInputVal !== undefined && rentInputVal !== '' && !isNaN(parseFloat(rentInputVal)))
    ? parseFloat(rentInputVal)
    : ((tenant.base_rent || 0) / 100);

  const rawEb = document.getElementById('bill-eb')?.value;
  const currEb = (rawEb !== undefined && rawEb !== '' && !isNaN(parseInt(rawEb, 10)))
    ? parseInt(rawEb, 10)
    : prevEb;

  const rawWater = document.getElementById('bill-water')?.value;
  const currWater = (rawWater !== undefined && rawWater !== '' && !isNaN(parseInt(rawWater, 10)))
    ? parseInt(rawWater, 10)
    : prevWater;

  const lateRupees = parseFloat(document.getElementById('bill-late')?.value) || 0;
  const discountRupees = parseFloat(document.getElementById('bill-discount')?.value) || 0;
  const othersRupees = parseFloat(document.getElementById('bill-others')?.value) || 0;

  const inputArrears = document.getElementById('bill-arrears')?.value;
  const arrearsRupees = (inputArrears !== undefined && inputArrears !== '' && !isNaN(parseFloat(inputArrears)))
    ? parseFloat(inputArrears)
    : ((tenant.pending_arrears || 0) / 100);

  const ebUnits = Math.max(0, currEb - prevEb);
  const ebRupees = (ebUnits * (tenant.eb_unit_price || 0)) / 100;

  let waterRupees = (tenant.water_fixed_charge || 0) / 100;
  if (tenant.water_calc_mode === 'METERED') {
    const waterUnits = Math.max(0, currWater - prevWater);
    waterRupees = (waterUnits * (tenant.water_unit_price || 0)) / 100;
  }

  const maintRupees = (tenant.maint_charge || 0) / 100;
  const extraRupees = arrearsRupees + lateRupees + othersRupees;

  const grossRupees = rentRupees + maintRupees + ebRupees + waterRupees + extraRupees;
  const netRupees = Math.max(0, grossRupees - discountRupees);

  const elNet = document.getElementById('live-calc-net'); if (elNet) elNet.textContent = formatCurrency(Math.round(netRupees * 100));
  const elRent = document.getElementById('live-calc-rent'); if (elRent) elRent.textContent = formatCurrency(Math.round(rentRupees * 100));
  const elEb = document.getElementById('live-calc-eb'); if (elEb) elEb.textContent = formatCurrency(Math.round(ebRupees * 100));
  const elEbUnits = document.getElementById('live-calc-eb-units'); if (elEbUnits) elEbUnits.textContent = ebUnits;
  const elWater = document.getElementById('live-calc-water'); if (elWater) elWater.textContent = formatCurrency(Math.round(waterRupees * 100));
  const elMaint = document.getElementById('live-calc-maint'); if (elMaint) elMaint.textContent = formatCurrency(Math.round(maintRupees * 100));
  const elExtra = document.getElementById('live-calc-extra'); if (elExtra) elExtra.textContent = formatCurrency(Math.round(extraRupees * 100));
  const elDiscount = document.getElementById('live-calc-discount'); if (elDiscount) elDiscount.textContent = formatCurrency(Math.round(discountRupees * 100));
}

export async function openPaymentModal(billId, duePaise) {
  const currentUser = getCurrentUser();
  const supabaseClient = getSupabaseClient();
  const modalHeader = document.querySelector('#modal-add-payment .modal-header h2');
  const submitBtn = document.getElementById('pay-submit-btn');

  if (currentUser && currentUser.role === 'TENANT') {
    if (modalHeader) modalHeader.textContent = 'Submit Payment Proof';
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="upload-cloud"></i> Submit Payment Screenshot';
    const proofGroup = document.getElementById('pay-proof-group');
    if (proofGroup) proofGroup.style.display = 'block';
    const notesEl = document.getElementById('pay-notes');
    if (notesEl) notesEl.placeholder = 'Optional transaction details, UPI ref, etc.';
  } else {
    if (modalHeader) modalHeader.textContent = 'Record Tenant Payment';
    if (submitBtn) submitBtn.innerHTML = '<i data-lucide="check"></i> Confirm Payment';
    const proofGroup = document.getElementById('pay-proof-group');
    if (proofGroup) proofGroup.style.display = 'block';
  }

  const payBillSelect = document.getElementById('pay-bill-id');
  if (payBillSelect) {
    payBillSelect.innerHTML = '<option value="">Loading invoices...</option>';
    try {
      if (supabaseClient) {
        let query = supabaseClient.from('bills').select('id, uuid, billing_period, net_amount, paid_amount, renter_id, status').is('deleted_at', null).neq('status', 'PAID').neq('status', 'VOID').order('created_at', { ascending: false });
        if (currentUser && currentUser.role === 'TENANT' && currentUser.renter_id) {
          query = query.eq('renter_id', currentUser.renter_id);
        }
        const { data: unpaidBills } = await query;
        const { data: renters } = await supabaseClient.from('renters').select('id, name');
        const renterMap = {};
        (renters || []).forEach(r => { renterMap[r.id] = r.name; });

        payBillSelect.innerHTML = '<option value="">Select Unpaid Invoice *</option>';
        (unpaidBills || []).forEach(b => {
          const invName = formatInvoiceNumber(b);
          const tenantName = renterMap[b.renter_id] || `Tenant #${b.renter_id}`;
          const balancePaise = Math.max(0, (b.net_amount || 0) - (b.paid_amount || 0));
          const opt = document.createElement('option');
          opt.value = b.id;
          opt.textContent = `${invName} — ${tenantName} (${b.billing_period}) — Due: ${formatCurrency(balancePaise)}`;
          opt.setAttribute('data-due', balancePaise);
          payBillSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Payment modal bill load error', err);
    }
  }

  const payBillEl = document.getElementById('pay-bill-id');
  if (payBillEl) {
    payBillEl.value = billId;
    payBillEl.onchange = function() {
      const selected = this.options[this.selectedIndex];
      const selectedDue = selected ? selected.getAttribute('data-due') : null;
      if (selectedDue) {
        const amtEl = document.getElementById('pay-amount');
        if (amtEl) amtEl.value = (parseFloat(selectedDue) / 100).toFixed(2);
      }
    };
  }

  const amtEl = document.getElementById('pay-amount');
  if (amtEl && duePaise !== undefined) {
    amtEl.value = (duePaise / 100).toFixed(2);
  }

  openModal('modal-add-payment');
  refreshLucideIcons();
}

export async function voidBill(billId) {
  const supabaseClient = getSupabaseClient();
  if (!confirm('Are you sure you want to void this invoice? This will cancel the bill and zero its balance.')) return;
  try {
    if (!supabaseClient) return;
    const { error } = await safeUpdate(supabaseClient, 'bills', { status: 'VOID', paid_amount: 0 }, 'id', billId);
    if (error) alert('Failed to void invoice: ' + error.message);
    else {
      alert('Invoice successfully marked as VOID');
      loadBillsPage();
      loadDashboard();
    }
  } catch (err) {
    alert('Void invoice error: ' + err.message);
  }
}

export async function triggerDeleteBill(billId) {
  const supabaseClient = getSupabaseClient();
  if (!confirm('Are you sure you want to permanently delete this bill invoice?')) return;
  try {
    if (!supabaseClient) return;

    // Delete or clean up payments linked to this bill
    await supabaseClient.from('payments').delete().eq('bill_id', billId);

    // Delete bill record directly so unique constraint slot is immediately freed
    const { error } = await supabaseClient.from('bills').delete().eq('id', billId);
    if (error) {
      // Fallback to safeDelete if direct delete is blocked
      const { error: safeErr } = await safeDelete(supabaseClient, 'bills', billId);
      if (safeErr) {
        alert('Failed to delete bill: ' + safeErr.message);
        return;
      }
    }

    alert('Invoice deleted successfully');
    loadBillsPage();
    loadDashboard();
  } catch (err) {
    alert('Delete bill error: ' + err.message);
  }
}

/**
 * Generates a clean, minimal, itemized bill invoice text with stay period, EB & Water meter breakdowns and payment transfer details
 */
export function formatBillInvoiceMessage(b, t, unitName = '-', ownerObj = null) {
  const invoiceNo = formatInvoiceNumber(b);
  const netRupees = ((b.net_amount || 0) / 100).toFixed(2);
  const paidRupees = ((b.paid_amount || 0) / 100).toFixed(2);
  const dueRupees = Math.max(0, ((b.net_amount || 0) - (b.paid_amount || 0)) / 100).toFixed(2);

  // Stay Period & Dates String
  let stayPeriodStr = b.billing_period || 'Monthly';
  if (b.period_start_date && b.period_end_date) {
    stayPeriodStr = `${b.period_start_date} to ${b.period_end_date} (${b.billing_period})`;
  }

  const billDateStr = b.bill_date || (b.created_at ? new Date(b.created_at).toLocaleDateString() : '-');
  const dueDateStr = b.due_date || '-';

  // EB Reading & Consumption Calculation
  const prevEb = b.prev_eb_reading || 0;
  const currEb = b.curr_eb_reading || 0;
  const ebUnits = Math.max(0, currEb - prevEb);
  const ebRate = ((b.eb_unit_price || 0) / 100).toFixed(2);
  const ebBreakdown = `${ebUnits} Units (${currEb} - ${prevEb} @ ₹${ebRate}/u) = ${formatCurrency(b.eb_amount || 0)}`;

  // Water Calculation & Meter Breakdown
  let waterBreakdown = '';
  if (b.water_calc_mode === 'METERED') {
    const prevW = b.prev_water_reading || 0;
    const currW = b.curr_water_reading || 0;
    const wUnits = Math.max(0, currW - prevW);
    const wRate = ((b.water_unit_price || 0) / 100).toFixed(2);
    waterBreakdown = `${wUnits} Units (${currW} - ${prevW} @ ₹${wRate}/u) = ${formatCurrency(b.water_amount || 0)}`;
  } else if (b.water_amount && b.water_amount > 0) {
    waterBreakdown = `Flat Fixed = ${formatCurrency(b.water_amount)}`;
  } else {
    waterBreakdown = formatCurrency(0);
  }

  // Payment Status Line
  let statusSection = '';
  if (b.status === 'PAID') {
    statusSection = `✅ *Payment Status:* PAID (${formatCurrency(b.paid_amount)})`;
  } else if (b.status === 'PARTIAL') {
    statusSection = `⚠️ *Payment Status:* PARTIAL (Paid: ₹${paidRupees})\n🚨 *Balance Due:* ₹${dueRupees}`;
  } else if (b.status === 'VOID') {
    statusSection = `🚫 *Payment Status:* VOIDED`;
  } else {
    statusSection = `📌 *Payment Status:* UNPAID\n🚨 *Amount Due:* ₹${dueRupees}`;
  }

  // Owner Payment & Bank Transfer Details
  let paymentDetails = '';
  if (ownerObj) {
    const upiStr = ownerObj.upi_id ? `• *UPI ID:* ${ownerObj.upi_id}\n` : '';
    const bankStr = ownerObj.bank_name ? `• *Bank:* ${ownerObj.bank_name}\n` : '';
    const accStr = ownerObj.account_number ? `• *A/C No:* ${ownerObj.account_number}\n` : '';
    const ifscStr = ownerObj.ifsc_code ? `• *IFSC:* ${ownerObj.ifsc_code}\n` : '';
    if (upiStr || bankStr || accStr) {
      paymentDetails = `\n💳 *Payment Details:*\n${upiStr}${bankStr}${accStr}${ifscStr}`;
    }
  }

  return (
`🏡 *RENT INVOICE — ${b.billing_period || 'MONTHLY'}*
━━━━━━━━━━━━━━━━━━━━
👤 *Tenant:* ${t.name || '-'}
🏢 *Unit:* ${unitName}
📋 *Invoice No:* ${invoiceNo}
📅 *Stay Period:* ${stayPeriodStr}
🗓️ *Bill Date:* ${billDateStr}
⏰ *Due Date:* ${dueDateStr}

*Itemized Breakdown:*
• Base Rent: ${formatCurrency(b.rent_amount || 0)}
• Maintenance: ${formatCurrency(b.maint_amount || 0)}
• ⚡ Electricity (EB): ${ebBreakdown}
• 💧 Water Utility: ${waterBreakdown}` +
(b.arrears_included ? `\n• Previous Arrears: ${formatCurrency(b.arrears_included)}` : '') +
(b.others ? `\n• Other Charges: ${formatCurrency(b.others)}` : '') +
(b.late_fee ? `\n• Late Fee: ${formatCurrency(b.late_fee)}` : '') +
(b.discount_amount ? `\n• Discount: -${formatCurrency(b.discount_amount)}` : '') +
`
━━━━━━━━━━━━━━━━━━━━
💰 *Total Net Amount:* ₹${netRupees}
${statusSection}` +
paymentDetails +
`
📸 *Please share payment screenshot / transaction reference after paying.*

Please complete payment on or before the due date. Thank you!`
  );
}

/**
 * Formats an urgent overdue reminder notice with itemized breakdown
 */
export function formatOverdueReminderMessage(b, t, unitName = '-', ownerObj = null) {
  const invoiceNo = formatInvoiceNumber(b);
  const netRupees = ((b.net_amount || 0) / 100).toFixed(2);
  const dueRupees = Math.max(0, ((b.net_amount || 0) - (b.paid_amount || 0)) / 100).toFixed(2);

  let stayPeriodStr = b.billing_period || 'Period';
  if (b.period_start_date && b.period_end_date) {
    stayPeriodStr = `${b.period_start_date} to ${b.period_end_date} (${b.billing_period})`;
  }

  const prevEb = b.prev_eb_reading || 0;
  const currEb = b.curr_eb_reading || 0;
  const ebUnits = Math.max(0, currEb - prevEb);
  const ebRate = ((b.eb_unit_price || 0) / 100).toFixed(2);
  const ebBreakdown = `${ebUnits} Units (${currEb} - ${prevEb} @ ₹${ebRate}/u) = ${formatCurrency(b.eb_amount || 0)}`;

  let waterBreakdown = '';
  if (b.water_calc_mode === 'METERED') {
    const prevW = b.prev_water_reading || 0;
    const currW = b.curr_water_reading || 0;
    const wUnits = Math.max(0, currW - prevW);
    const wRate = ((b.water_unit_price || 0) / 100).toFixed(2);
    waterBreakdown = `${wUnits} Units (${currW} - ${prevW} @ ₹${wRate}/u) = ${formatCurrency(b.water_amount || 0)}`;
  } else if (b.water_amount && b.water_amount > 0) {
    waterBreakdown = `Flat Fixed = ${formatCurrency(b.water_amount)}`;
  }

  let paymentDetails = '';
  if (ownerObj) {
    const upiStr = ownerObj.upi_id ? `• *UPI ID:* ${ownerObj.upi_id}\n` : '';
    const bankStr = ownerObj.bank_name ? `• *Bank:* ${ownerObj.bank_name}\n` : '';
    const accStr = ownerObj.account_number ? `• *A/C No:* ${ownerObj.account_number}\n` : '';
    const ifscStr = ownerObj.ifsc_code ? `• *IFSC:* ${ownerObj.ifsc_code}\n` : '';
    if (upiStr || bankStr || accStr) {
      paymentDetails = `\n💳 *Payment Transfer Details:*\n${upiStr}${bankStr}${accStr}${ifscStr}`;
    }
  }

  return (
`⚠️ *URGENT RENT OVERDUE NOTICE* ⚠️
━━━━━━━━━━━━━━━━━━━━
Dear *${t.name || 'Tenant'}*,

This is a reminder that your rent payment for *${stayPeriodStr}* (Unit: *${unitName}*) is currently *OVERDUE*.

📌 *Invoice Summary (${invoiceNo}):*
• Base Rent: ${formatCurrency(b.rent_amount || 0)}
• Maintenance: ${formatCurrency(b.maint_amount || 0)}
• ⚡ Electricity (EB): ${ebBreakdown}` +
(waterBreakdown ? `\n• 💧 Water: ${waterBreakdown}` : '') +
(b.arrears_included ? `\n• Previous Arrears: ${formatCurrency(b.arrears_included)}` : '') +
`
━━━━━━━━━━━━━━━━━━━━
💰 *Net Invoice:* ₹${netRupees}
🚨 *Outstanding Balance Due:* ₹${dueRupees}` +
paymentDetails +
`
📸 *Please share payment screenshot / transaction reference after paying.*

Please complete your payment immediately to avoid late penalties. Thank you!`
  );
}

/**
 * Fetch bill, tenant, unit, and owner details bundle
 */
async function fetchBillContext(billId) {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) throw new Error('Supabase client not initialized');

  const { data: b } = await supabaseClient.from('bills').select('*').eq('id', billId).single();
  if (!b) throw new Error('Invoice bill not found');

  const { data: t } = await supabaseClient.from('renters').select('*').eq('id', b.renter_id).single();
  if (!t) throw new Error('Tenant details not found');

  let unitName = '-';
  if (t.unit_id) {
    const { data: u } = await supabaseClient.from('units').select('unit_name').eq('id', t.unit_id).single();
    if (u) unitName = u.unit_name;
  }

  let ownerObj = null;
  if (t.owner_id) {
    const { data: o } = await supabaseClient.from('owners').select('*').eq('id', t.owner_id).single();
    if (o) ownerObj = o;
  }
  if (!ownerObj) {
    const { data: ownersList } = await supabaseClient.from('owners').select('*').is('deleted_at', null).limit(1);
    if (ownersList && ownersList.length > 0) ownerObj = ownersList[0];
  }

  return { bill: b, tenant: t, unitName, owner: ownerObj };
}

/**
 * Shares the minimal, itemized bill invoice directly on WhatsApp
 */
export async function shareInvoiceWhatsApp(billId) {
  try {
    const { bill, tenant, unitName, owner } = await fetchBillContext(billId);
    const message = formatBillInvoiceMessage(bill, tenant, unitName, owner);

    const encodedMsg = encodeURIComponent(message);
    const mobileNo = tenant.mobile_number ? tenant.mobile_number.replace(/[^0-9]/g, '') : '';
    const phoneParam = mobileNo.length >= 10 ? `phone=91${mobileNo.slice(-10)}&` : '';

    const waUrl = `https://api.whatsapp.com/send?${phoneParam}text=${encodedMsg}`;
    window.open(waUrl, '_blank');
  } catch (err) {
    alert('Failed to generate WhatsApp invoice: ' + err.message);
  }
}

/**
 * Copies the itemized bill invoice text directly to user's clipboard
 */
export async function copyInvoiceToClipboard(billId) {
  try {
    const { bill, tenant, unitName, owner } = await fetchBillContext(billId);
    const message = formatBillInvoiceMessage(bill, tenant, unitName, owner);

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(message);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = message;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    alert('📋 Bill invoice copied to clipboard!');
  } catch (err) {
    alert('Failed to copy invoice: ' + err.message);
  }
}

/**
 * Sends urgent overdue reminder notice on WhatsApp
 */
export async function sendOverdueReminderWhatsApp(billId) {
  try {
    const { bill, tenant, unitName, owner } = await fetchBillContext(billId);
    const message = formatOverdueReminderMessage(bill, tenant, unitName, owner);

    const encodedMsg = encodeURIComponent(message);
    const mobileNo = tenant.mobile_number ? tenant.mobile_number.replace(/[^0-9]/g, '') : '';
    const phoneParam = mobileNo.length >= 10 ? `phone=91${mobileNo.slice(-10)}&` : '';

    const waUrl = `https://api.whatsapp.com/send?${phoneParam}text=${encodedMsg}`;
    window.open(waUrl, '_blank');
  } catch (err) {
    alert('Failed to send overdue reminder: ' + err.message);
  }
}
