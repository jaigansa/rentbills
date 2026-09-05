// RentBill Pro — Billing Engine, Invoices & WhatsApp Automated Notifications (Pure Supabase)
import { getSupabaseClient } from '../core/config.js';
import { safeUpdate, safeDelete } from '../core/db.js';
import { getCurrentUser } from '../core/state.js';
import { formatCurrency, formatInvoiceNumber, numberToWordsINR, escapeStr, renderEmptyState, openModal, refreshLucideIcons } from '../core/ui.js';
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
      if (currentUser && currentUser.role === 'TENANT') {
        if (currentUser.renter_id) {
          query = query.eq('renter_id', currentUser.renter_id);
        } else {
          // A tenant with no resolved renter_id must NOT see every tenant's bills.
          // Force an impossible filter to return an empty set instead of widening scope.
          query = query.eq('renter_id', -1);
        }
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
                <button class="dropdown-item" onclick="shareInvoiceWhatsApp(${b.id})"><i data-lucide="share-2"></i> Share Invoice</button>
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
            ? `<div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeStr(b.period_start_date)} → ${escapeStr(b.period_end_date)}</div>`
            : '';

          const billDateDisplay = b.bill_date || (b.created_at ? new Date(b.created_at).toLocaleDateString() : '');

          tr.innerHTML = `
            <td data-label="Invoice Number & UUID">
              <strong>${escapeStr(formatInvoiceNumber(b))}</strong>
              <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeStr(uuidSuffix)}</span>
              ${billDateDisplay ? `<div style="font-size: 10px; color: var(--text-muted);">Generated: ${escapeStr(billDateDisplay)}</div>` : ''}
            </td>
            <td data-label="Renter Name"><strong>${escapeStr(tenantDisplayName)}</strong></td>
            <td data-label="Billing & Stay Period">
              <strong>${escapeStr(b.billing_period)}</strong>
              ${stayPeriodDisplay}
            </td>
            <td data-label="Gross Charge">${formatCurrency(b.gross_amount)}</td>
            <td data-label="Net Charge"><strong>${formatCurrency(b.net_amount)}</strong></td>
            <td data-label="Paid Amount">${formatCurrency(b.paid_amount)}</td>
            <td data-label="Status"><span class="badge ${badgeClass}">${escapeStr(b.status)}</span></td>
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
  const hintEl = document.getElementById('live-calc-hint-text');

  if (!renterId || !supabaseClient) {
    const elNet = document.getElementById('live-calc-net'); if (elNet) elNet.textContent = '₹0.00';
    const elRent = document.getElementById('live-calc-rent'); if (elRent) elRent.textContent = '₹0.00';
    const elEb = document.getElementById('live-calc-eb'); if (elEb) elEb.textContent = '₹0.00';
    const elEbUnits = document.getElementById('live-calc-eb-units'); if (elEbUnits) elEbUnits.textContent = '0';
    const elWater = document.getElementById('live-calc-water'); if (elWater) elWater.textContent = '₹0.00';
    const elMaint = document.getElementById('live-calc-maint'); if (elMaint) elMaint.textContent = '₹0.00';
    const elExtra = document.getElementById('live-calc-extra'); if (elExtra) elExtra.textContent = '₹0.00';
    const elDiscount = document.getElementById('live-calc-discount'); if (elDiscount) elDiscount.textContent = '₹0.00';
    if (hintEl) hintEl.textContent = 'Select a tenant to preview automated billing calculations.';
    return;
  }

  const { data: tenant } = await supabaseClient.from('renters').select('*').eq('id', renterId).single();
  if (!tenant) return;

  const { data: lastBills } = await supabaseClient.from('bills')
    .select('curr_eb_reading, curr_water_reading, created_at, bill_date')
    .eq('renter_id', renterId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1);

  let prevEb = tenant.initial_eb_reading ?? tenant.initial_eb ?? 0;
  let prevWater = tenant.initial_water_reading ?? tenant.initial_water ?? 0;

  if (lastBills && lastBills.length > 0) {
    const lastBill = lastBills[0];
    const lastBillDate = new Date(lastBill.created_at || lastBill.bill_date || 0);

    const ebResetDate = tenant.eb_reset_at ? new Date(tenant.eb_reset_at) : null;
    if (!ebResetDate || ebResetDate <= lastBillDate) {
      prevEb = lastBill.curr_eb_reading ?? tenant.initial_eb_reading ?? tenant.initial_eb ?? 0;
    }

    const waterResetDate = tenant.water_reset_at ? new Date(tenant.water_reset_at) : null;
    if (!waterResetDate || waterResetDate <= lastBillDate) {
      prevWater = lastBill.curr_water_reading ?? tenant.initial_water_reading ?? tenant.initial_water ?? 0;
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
    ? Math.max(0, parseFloat(rentInputVal))
    : ((tenant.base_rent || 0) / 100);

  const rawEb = document.getElementById('bill-eb')?.value;
  const currEb = (rawEb !== undefined && rawEb !== '' && !isNaN(parseInt(rawEb, 10)))
    ? parseInt(rawEb, 10)
    : prevEb;

  const rawWater = document.getElementById('bill-water')?.value;
  const currWater = (rawWater !== undefined && rawWater !== '' && !isNaN(parseInt(rawWater, 10)))
    ? parseInt(rawWater, 10)
    : prevWater;

  const lateRupees = Math.max(0, parseFloat(document.getElementById('bill-late')?.value) || 0);
  const discountRupees = Math.max(0, parseFloat(document.getElementById('bill-discount')?.value) || 0);
  const othersRupees = Math.max(0, parseFloat(document.getElementById('bill-others')?.value) || 0);

  const inputArrears = document.getElementById('bill-arrears')?.value;
  const arrearsRupees = (inputArrears !== undefined && inputArrears !== '' && !isNaN(parseFloat(inputArrears)))
    ? parseFloat(inputArrears)
    : ((tenant.pending_arrears || 0) / 100);

  // Rate in rupees per unit
  const ebUnitPriceRupees = (tenant.eb_per_unit_price !== undefined && tenant.eb_per_unit_price !== null)
    ? parseFloat(tenant.eb_per_unit_price)
    : (((tenant.eb_unit_price !== undefined && tenant.eb_unit_price !== null) ? tenant.eb_unit_price : 800) / 100);

  const waterUnitPriceRupees = (tenant.water_per_unit_price !== undefined && tenant.water_per_unit_price !== null)
    ? parseFloat(tenant.water_per_unit_price)
    : (((tenant.water_unit_price !== undefined && tenant.water_unit_price !== null) ? tenant.water_unit_price : 0) / 100);

  const waterFixedRupees = (tenant.water_fixed_charge !== undefined && tenant.water_fixed_charge !== null)
    ? (tenant.water_fixed_charge > 500 ? tenant.water_fixed_charge / 100 : tenant.water_fixed_charge)
    : 0;

  const ebUnits = Math.max(0, currEb - prevEb);
  const ebRupees = ebUnits * ebUnitPriceRupees;

  let waterUnits = 0;
  let waterRupees = waterFixedRupees;
  if (tenant.water_calc_mode === 'METERED') {
    waterUnits = Math.max(0, currWater - prevWater);
    waterRupees = waterUnits * waterUnitPriceRupees;
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
  const elDiscount = document.getElementById('live-calc-discount');
  if (elDiscount) {
    elDiscount.textContent = discountRupees > 0 ? `-${formatCurrency(Math.round(discountRupees * 100))}` : '₹0.00';
  }

  if (hintEl) {
    const ebPart = `EB: Prev ${prevEb} → Curr ${currEb} (${ebUnits}u @ ₹${ebUnitPriceRupees.toFixed(2)}/u)`;
    const waterPart = tenant.water_calc_mode === 'METERED'
      ? `Water: Prev ${prevWater} → Curr ${currWater} (${waterUnits}u @ ₹${waterUnitPriceRupees.toFixed(2)}/u)`
      : `Water: Fixed ₹${waterFixedRupees.toFixed(2)}`;
    hintEl.textContent = `${ebPart} | ${waterPart}`;
  }
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
        
        if (currentUser && currentUser.role === 'TENANT') {
          if (currentUser.renter_id) {
            query = query.eq('renter_id', currentUser.renter_id);
          } else {
            // Do NOT fabricate a renter id from an arbitrary row (data leak):
            // a tenant with no resolved renter_id gets an empty invoice list.
            query = query.eq('renter_id', -1);
          }
        }

        const { data: unpaidBills } = await query;
        const { data: renters } = await supabaseClient.from('renters').select('id, name');
        const renterMap = {};
        (renters || []).forEach(r => { renterMap[r.id] = r.name; });

        if (!unpaidBills || unpaidBills.length === 0) {
          payBillSelect.innerHTML = '<option value="">No unpaid invoices found (All bills are paid)</option>';
        } else {
          payBillSelect.innerHTML = '<option value="">Select Unpaid Invoice *</option>';
          unpaidBills.forEach(b => {
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

    const reason = prompt('Reason for voiding this invoice? (optional)', '');
    const voidReason = reason ? reason.trim() : null;

    const currentUser = getCurrentUser();
    const uId = currentUser ? currentUser.id : null;

    // Record the void audit trail. Recording voided_at is what the ledger views
    // and fn_reconcile_ledger rely on to exclude the invoice from billed totals.
    const { error } = await safeUpdate(supabaseClient, 'bills', {
      status: 'VOID',
      paid_amount: 0,
      voided_at: new Date().toISOString(),
      voided_by: uId,
      void_reason: voidReason
    }, 'id', billId);

    if (error) {
      alert('Failed to void invoice: ' + error.message);
      return;
    }

    // Reverse any active payments on this bill so paid_amount stays 0 and the
    // ledger's CASH_IN no longer counts them (avoids resurrecting a non-zero
    // balance when a payment later changes via sync_bill_paid_amount).
    try {
      await supabaseClient
        .from('payments')
        .update({
          reversed_at: new Date().toISOString(),
          reversed_by: uId,
          reversal_reason: 'BILL_VOIDED'
        })
        .eq('bill_id', billId)
        .is('deleted_at', null)
        .is('reversed_at', null);
    } catch (revErr) {
      console.warn('Void payment reversal notice:', revErr);
    }

    alert('Invoice successfully marked as VOID');
    loadBillsPage();
    loadDashboard();
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
 * Generates a clean, itemized bill invoice text with stay period, detailed EB & Water meter readings and payment transfer details
 */
export function formatBillInvoiceMessage(b, t, unitName = '-', ownerObj = null) {
  const invoiceNo = formatInvoiceNumber(b);
  const netRupees = formatCurrency(b.net_amount || 0);
  const paidRupees = formatCurrency(b.paid_amount || 0);
  const duePaise = Math.max(0, (b.net_amount || 0) - (b.paid_amount || 0));
  const dueRupees = formatCurrency(duePaise);

  // Stay Period & Dates String
  let stayPeriodStr = b.billing_period || 'Monthly';
  if (b.period_start_date && b.period_end_date) {
    stayPeriodStr = `${b.period_start_date} to ${b.period_end_date} (${b.billing_period})`;
  }

  const billDateStr = b.bill_date || (b.created_at ? new Date(b.created_at).toISOString().split('T')[0] : '-');
  const dueDateStr = b.due_date || '-';

  // EB Reading & Consumption Details
  const prevEb = b.prev_eb_reading ?? 0;
  const currEb = b.curr_eb_reading ?? prevEb;
  const ebUnits = b.eb_units ?? Math.max(0, currEb - prevEb);
  
  let ebRateNum = 0;
  if (b.eb_rate !== undefined && b.eb_rate !== null && parseFloat(b.eb_rate) > 0) {
    ebRateNum = parseFloat(b.eb_rate);
  } else if (b.eb_unit_price !== undefined && b.eb_unit_price !== null && b.eb_unit_price > 0) {
    ebRateNum = b.eb_unit_price / 100;
  } else if (t && (t.eb_per_unit_price || t.eb_unit_price)) {
    ebRateNum = t.eb_per_unit_price ? parseFloat(t.eb_per_unit_price) : (t.eb_unit_price / 100);
  }

  // Derive rate from amount / units if 0
  if (ebRateNum <= 0 && (b.eb_amount || 0) > 0 && ebUnits > 0) {
    ebRateNum = ((b.eb_amount || 0) / 100) / ebUnits;
  }
  if (ebRateNum <= 0) {
    ebRateNum = 8.0;
  }
  const ebRateStr = ebRateNum.toFixed(2);
  const ebBreakdown = `${ebUnits} Units (${currEb} - ${prevEb} @ ₹${ebRateStr}/u) = ${formatCurrency(b.eb_amount || 0)}`;

  // Water Calculation & Meter Breakdown
  let waterRateNum = 0;
  if (b.water_rate !== undefined && b.water_rate !== null && parseFloat(b.water_rate) > 0) {
    waterRateNum = parseFloat(b.water_rate);
  } else if (b.water_unit_price !== undefined && b.water_unit_price !== null && b.water_unit_price > 0) {
    waterRateNum = b.water_unit_price / 100;
  } else if (t && (t.water_per_unit_price || t.water_unit_price)) {
    waterRateNum = t.water_per_unit_price ? parseFloat(t.water_per_unit_price) : (t.water_unit_price / 100);
  }

  let waterBreakdown = '';
  if (b.water_calc_mode === 'METERED') {
    const prevW = b.prev_water_reading ?? 0;
    const currW = b.curr_water_reading ?? prevW;
    const wUnits = b.water_units ?? Math.max(0, currW - prevW);
    if (waterRateNum <= 0 && (b.water_amount || 0) > 0 && wUnits > 0) {
      waterRateNum = ((b.water_amount || 0) / 100) / wUnits;
    }
    const wRateStr = waterRateNum.toFixed(2);
    waterBreakdown = `${wUnits} Units (${currW} - ${prevW} @ ₹${wRateStr}/u) = ${formatCurrency(b.water_amount || 0)}`;
  } else if (b.water_amount && b.water_amount > 0) {
    waterBreakdown = `Flat Fixed = ${formatCurrency(b.water_amount)}`;
  } else {
    waterBreakdown = `Flat Fixed = ${formatCurrency(0)}`;
  }

  // Payment Status Line
  let statusSection = '';
  if (b.status === 'PAID') {
    statusSection = `✅ *Payment Status:* PAID (${formatCurrency(b.paid_amount || b.net_amount)})`;
  } else if (b.status === 'PARTIAL') {
    statusSection = `⚠️ *Payment Status:* PARTIAL (Paid: ${paidRupees})\n🚨 *Amount Due:* ${dueRupees}`;
  } else if (b.status === 'VOID') {
    statusSection = `🚫 *Payment Status:* VOIDED`;
  } else {
    statusSection = `📌 *Payment Status:* UNPAID\n🚨 *Amount Due:* ${dueRupees}`;
  }

  // Owner Payment & Bank Transfer Details
  let paymentDetails = '';
  const bankParts = [];
  if (ownerObj) {
    if (ownerObj.bank_name) bankParts.push(`• Bank: ${ownerObj.bank_name}`);
    if (ownerObj.account_number) bankParts.push(`• A/C No: ${ownerObj.account_number}`);
    if (ownerObj.ifsc_code) bankParts.push(`• IFSC: ${ownerObj.ifsc_code}`);
    if (ownerObj.account_holder || ownerObj.name) bankParts.push(`• A/C Name: ${ownerObj.account_holder || ownerObj.name}`);
    if (ownerObj.upi_id) bankParts.push(`• UPI ID: ${ownerObj.upi_id}`);
    if (ownerObj.gpay_mobile) bankParts.push(`• GPay / PhonePe: ${ownerObj.gpay_mobile}`);
  }
  if (bankParts.length > 0) {
    paymentDetails = `\n\n💳 *Payment Transfer Details:*\n` + bankParts.join('\n') + `\n`;
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
• ⚡ Electricity (EB): ${ebBreakdown}` +
(b.water_amount ? `\n• 💧 Water Utility: ${waterBreakdown}` : '') +
(b.arrears_included ? `\n• Previous Arrears: ${formatCurrency(b.arrears_included)}` : '') +
(b.others ? `\n• Other Charges: ${formatCurrency(b.others)}` : '') +
(b.late_fee ? `\n• Late Fee: ${formatCurrency(b.late_fee)}` : '') +
(b.discount_amount ? `\n• Discount: -${formatCurrency(b.discount_amount)}` : '') +
`
━━━━━━━━━━━━━━━━━━━━
💰 *Total Net Amount:* ${netRupees}
🗣️ *In Words:* ${numberToWordsINR(b.net_amount || 0)}
${statusSection}` +
paymentDetails +
`
📸 *Please share payment screenshot / transaction reference after paying.*

Please complete payment on or before the due date. Thank you!`
  );
}

/**
 * Formats an urgent overdue reminder notice with itemized breakdown and reading details
 */
export function formatOverdueReminderMessage(b, t, unitName = '-', ownerObj = null) {
  const invoiceNo = formatInvoiceNumber(b);
  const netRupees = formatCurrency(b.net_amount || 0);
  const duePaise = Math.max(0, (b.net_amount || 0) - (b.paid_amount || 0));
  const dueRupees = formatCurrency(duePaise);

  let stayPeriodStr = b.billing_period || 'Period';
  if (b.period_start_date && b.period_end_date) {
    stayPeriodStr = `${b.period_start_date} to ${b.period_end_date} (${b.billing_period})`;
  }

  const prevEb = b.prev_eb_reading ?? 0;
  const currEb = b.curr_eb_reading ?? prevEb;
  const ebUnits = b.eb_units ?? Math.max(0, currEb - prevEb);
  
  let ebRateNum = 0;
  if (b.eb_rate !== undefined && b.eb_rate !== null && parseFloat(b.eb_rate) > 0) {
    ebRateNum = parseFloat(b.eb_rate);
  } else if (b.eb_unit_price !== undefined && b.eb_unit_price !== null && b.eb_unit_price > 0) {
    ebRateNum = b.eb_unit_price / 100;
  } else if (t && (t.eb_per_unit_price || t.eb_unit_price)) {
    ebRateNum = t.eb_per_unit_price ? parseFloat(t.eb_per_unit_price) : (t.eb_unit_price / 100);
  }

  if (ebRateNum <= 0 && (b.eb_amount || 0) > 0 && ebUnits > 0) {
    ebRateNum = ((b.eb_amount || 0) / 100) / ebUnits;
  }
  if (ebRateNum <= 0) {
    ebRateNum = 8.0;
  }
  const ebRateStr = ebRateNum.toFixed(2);
  const ebBreakdown = `${ebUnits} Units (${currEb} - ${prevEb} @ ₹${ebRateStr}/u) = ${formatCurrency(b.eb_amount || 0)}`;

  let waterRateNum = 0;
  if (b.water_rate !== undefined && b.water_rate !== null && parseFloat(b.water_rate) > 0) {
    waterRateNum = parseFloat(b.water_rate);
  } else if (b.water_unit_price !== undefined && b.water_unit_price !== null && b.water_unit_price > 0) {
    waterRateNum = b.water_unit_price / 100;
  } else if (t && (t.water_per_unit_price || t.water_unit_price)) {
    waterRateNum = t.water_per_unit_price ? parseFloat(t.water_per_unit_price) : (t.water_unit_price / 100);
  }

  let waterBreakdown = '';
  if (b.water_calc_mode === 'METERED') {
    const prevW = b.prev_water_reading ?? 0;
    const currW = b.curr_water_reading ?? prevW;
    const wUnits = b.water_units ?? Math.max(0, currW - prevW);
    if (waterRateNum <= 0 && (b.water_amount || 0) > 0 && wUnits > 0) {
      waterRateNum = ((b.water_amount || 0) / 100) / wUnits;
    }
    const wRateStr = waterRateNum.toFixed(2);
    waterBreakdown = `${wUnits} Units (${currW} - ${prevW} @ ₹${wRateStr}/u) = ${formatCurrency(b.water_amount || 0)}`;
  } else if (b.water_amount && b.water_amount > 0) {
    waterBreakdown = `Flat Fixed = ${formatCurrency(b.water_amount)}`;
  }

  let paymentDetails = '';
  const bankParts = [];
  if (ownerObj) {
    if (ownerObj.bank_name) bankParts.push(`• Bank: ${ownerObj.bank_name}`);
    if (ownerObj.account_number) bankParts.push(`• A/C No: ${ownerObj.account_number}`);
    if (ownerObj.ifsc_code) bankParts.push(`• IFSC: ${ownerObj.ifsc_code}`);
    if (ownerObj.account_holder || ownerObj.name) bankParts.push(`• A/C Name: ${ownerObj.account_holder || ownerObj.name}`);
    if (ownerObj.upi_id) bankParts.push(`• UPI ID: ${ownerObj.upi_id}`);
    if (ownerObj.gpay_mobile) bankParts.push(`• GPay / PhonePe: ${ownerObj.gpay_mobile}`);
  }
  if (bankParts.length > 0) {
    paymentDetails = `\n\n💳 *Payment Transfer Details:*\n` + bankParts.join('\n') + `\n`;
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
(waterBreakdown ? `\n• 💧 Water Utility: ${waterBreakdown}` : '') +
(b.arrears_included ? `\n• Previous Arrears: ${formatCurrency(b.arrears_included)}` : '') +
(b.late_fee ? `\n• Late Fee: ${formatCurrency(b.late_fee)}` : '') +
(b.others ? `\n• Other Charges: ${formatCurrency(b.others)}` : '') +
(b.discount_amount ? `\n• Discount: -${formatCurrency(b.discount_amount)}` : '') +
`
━━━━━━━━━━━━━━━━━━━━
💰 *Net Invoice:* ${netRupees}
🚨 *Outstanding Balance Due:* ${dueRupees}
🗣️ *In Words:* ${numberToWordsINR(duePaise > 0 ? duePaise : (b.net_amount || 0))}` +
paymentDetails +
`
📸 *Please share payment screenshot / transaction reference after paying.*

Please complete your payment immediately to avoid late penalties. Thank you!`
  );
}

/**
 * Generates a clean, professional payment receipt message with amount in words
 */
export function formatPaymentReceiptMessage(p, b, t, unitName = '-', ownerObj = null) {
  const receiptNo = p?.id ? `RCP-${p.id}` : `RCP-${b?.id || '1001'}`;
  const invoiceNo = formatInvoiceNumber(b);
  const amountPaise = p?.amount || b?.paid_amount || b?.net_amount || 0;
  const amountRupees = formatCurrency(amountPaise);
  const words = numberToWordsINR(amountPaise);

  const balancePaise = Math.max(0, ((b?.net_amount || 0) - (b?.paid_amount || 0)));
  const balanceRupees = formatCurrency(balancePaise);
  const balanceStatus = balancePaise === 0 ? 'PAID IN FULL (CLEARED)' : `PARTIAL PAYMENT (Balance: ${balanceRupees})`;

  const payDateStr = p?.payment_date 
    ? (typeof p.payment_date === 'string' && p.payment_date.includes('T') ? p.payment_date.split('T')[0] : String(p.payment_date))
    : (p?.created_at ? new Date(p.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

  const beneficiaryName = ownerObj?.name || ownerObj?.account_holder || 'Property Management';

  return (
`🧾 *RENT PAYMENT RECEIPT — ${receiptNo}*
━━━━━━━━━━━━━━━━━━━━
👤 *Tenant:* ${t?.name || '-'}
🏢 *Unit:* ${unitName}
📋 *Invoice Ref:* ${invoiceNo}
📅 *Billing Period:* ${b?.billing_period || '-'}
🗓️ *Payment Date:* ${payDateStr}
💳 *Payment Mode:* ${p?.payment_method || 'ONLINE / DIRECT'}
🔖 *Transaction Ref / UTR:* ${p?.transaction_reference || 'N/A'}
━━━━━━━━━━━━━━━━━━━━
💵 *Amount Received:* ${amountRupees}
🗣️ *In Words:* ${words}
📊 *Status:* ${balanceStatus}
${balancePaise > 0 ? `🚨 *Remaining Due:* ${balanceRupees}\n` : ''}
👤 *Beneficiary:* ${beneficiaryName}

━━━━━━━━━━━━━━━━━━━━
✅ *Payment successfully acknowledged. Thank you!*`
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
    const { data: u } = await supabaseClient.from('units').select('*').eq('id', t.unit_id).single();
    if (u) unitName = u.unit_name || u.unit_number || '-';
  }

  let ownerObj = null;
  // 1. Try owner explicitly assigned to tenant
  if (t.owner_id) {
    const { data: o } = await supabaseClient.from('owners').select('*').eq('id', t.owner_id).single();
    if (o) ownerObj = o;
  }

  // 2. If no owner or owner lacks bank/upi details, search active owners
  if (!ownerObj || (!ownerObj.bank_name && !ownerObj.account_number && !ownerObj.upi_id)) {
    const { data: ownersList } = await supabaseClient.from('owners').select('*').is('deleted_at', null).order('id', { ascending: true });
    if (ownersList && ownersList.length > 0) {
      const detailedOwner = ownersList.find(o => o.bank_name || o.account_number || o.upi_id);
      if (detailedOwner) {
        ownerObj = detailedOwner;
      } else if (!ownerObj) {
        ownerObj = ownersList[0];
      }
    }
  }

  // 3. Fallback to settings in localStorage
  const defaultBank = localStorage.getItem('rentbill_bank_name') || '';
  const defaultAcc = localStorage.getItem('rentbill_account_no') || '';
  const defaultIfsc = localStorage.getItem('rentbill_ifsc') || '';
  const defaultHolder = localStorage.getItem('rentbill_acc_holder') || '';
  const defaultUpi = localStorage.getItem('rentbill_upi_id') || '';
  const defaultGpay = localStorage.getItem('rentbill_gpay_mobile') || '';

  if (!ownerObj) {
    ownerObj = {};
  }
  if (!ownerObj.bank_name && defaultBank) ownerObj.bank_name = defaultBank;
  if (!ownerObj.account_number && defaultAcc) ownerObj.account_number = defaultAcc;
  if (!ownerObj.ifsc_code && defaultIfsc) ownerObj.ifsc_code = defaultIfsc;
  if (!ownerObj.account_holder && (defaultHolder || ownerObj.name)) ownerObj.account_holder = defaultHolder || ownerObj.name;
  if (!ownerObj.upi_id && defaultUpi) ownerObj.upi_id = defaultUpi;
  if (!ownerObj.gpay_mobile && defaultGpay) ownerObj.gpay_mobile = defaultGpay;

  return { bill: b, tenant: t, unitName, owner: ownerObj };
}

/**
 * Universal Share Engine:
 * 1. Primary: Native Web Share API (navigator.share) supporting WhatsApp, SMS, Signal,
 *    Email, Telegram, and any installed app on mobile & modern desktop browsers.
 * 2. Fallback: URL schemes (whatsapp:// / https://api.whatsapp.com, sms:, mailto:)
 *    with interactive chooser dialog when native share is unavailable.
 */
export async function shareMessage({ title, text, phone = '', email = '' }) {
  // 1. Primary: Native Web Share API
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const shareData = { title: title || 'RentBill Pro', text };
      if (!navigator.canShare || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return { success: true, method: 'native' };
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // User dismissed native share sheet - graceful exit
        return { success: false, aborted: true };
      }
      console.warn('Native navigator.share failed, falling back to URL schemes:', err);
    }
  }

  // 2. URL Fallback Schemes
  const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, '') : '';
  const intlPhone = cleanPhone.length >= 10 ? `91${cleanPhone.slice(-10)}` : cleanPhone;
  const encodedText = encodeURIComponent(text);
  const encodedTitle = encodeURIComponent(title || 'RentBill Pro Notification');

  const waUrl = intlPhone 
    ? `https://api.whatsapp.com/send?phone=${intlPhone}&text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`;
  const smsUri = cleanPhone ? `sms:${cleanPhone}?body=${encodedText}` : `sms:?body=${encodedText}`;
  const mailtoUri = email 
    ? `mailto:${email}?subject=${encodedTitle}&body=${encodedText}`
    : `mailto:?subject=${encodedTitle}&body=${encodedText}`;

  // Check if share chooser modal exists in DOM
  const shareModal = typeof document !== 'undefined' ? document.getElementById('modal-share-chooser') : null;
  if (shareModal) {
    const titleEl = document.getElementById('share-modal-title');
    if (titleEl) titleEl.textContent = title || 'Share Document';

    const waBtn = document.getElementById('share-btn-whatsapp');
    if (waBtn) waBtn.href = waUrl;

    const smsBtn = document.getElementById('share-btn-sms');
    if (smsBtn) smsBtn.href = smsUri;

    const mailBtn = document.getElementById('share-btn-email');
    if (mailBtn) mailBtn.href = mailtoUri;

    const copyBtn = document.getElementById('share-btn-copy');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(text);
          alert('📋 Complete message copied to clipboard!');
        } catch {
          alert('Failed to copy to clipboard');
        }
      };
    }

    if (typeof openModal === 'function') {
      openModal('modal-share-chooser');
      refreshLucideIcons();
      return { success: true, method: 'chooser' };
    }
  }

  // Direct URL fallback if no modal in DOM (e.g. standalone print view)
  if (typeof window !== 'undefined') {
    window.open(waUrl, '_blank');
  }
  return { success: true, method: 'whatsapp' };
}

/**
 * Shares the itemized bill invoice via Web Share API or WhatsApp / SMS / Email URL schemes
 */
export async function shareInvoiceWhatsApp(billId) {
  try {
    const { bill, tenant, unitName, owner } = await fetchBillContext(billId);
    const message = formatBillInvoiceMessage(bill, tenant, unitName, owner);
    const invoiceNo = formatInvoiceNumber(bill);

    await shareMessage({
      title: `Rent Invoice — ${invoiceNo} (${tenant.name || 'Tenant'})`,
      text: message,
      phone: tenant.mobile_number || '',
      email: tenant.email || ''
    });
  } catch (err) {
    alert('Failed to share invoice: ' + err.message);
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
 * Sends urgent overdue reminder notice via Web Share API or WhatsApp / SMS / Email URL schemes
 */
export async function sendOverdueReminderWhatsApp(billId) {
  try {
    const { bill, tenant, unitName, owner } = await fetchBillContext(billId);
    const message = formatOverdueReminderMessage(bill, tenant, unitName, owner);
    const invoiceNo = formatInvoiceNumber(bill);

    await shareMessage({
      title: `⚠️ Rent Overdue Notice — ${invoiceNo} (${tenant.name || 'Tenant'})`,
      text: message,
      phone: tenant.mobile_number || '',
      email: tenant.email || ''
    });
  } catch (err) {
    alert('Failed to send overdue reminder: ' + err.message);
  }
}

/**
 * Shares official payment receipt via Web Share API or WhatsApp / SMS / Email URL schemes
 */
export async function sharePaymentReceiptWhatsApp(paymentId) {
  try {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) throw new Error('Supabase client not initialized');

    const { data: p, error: pErr } = await supabaseClient.from('payments').select('*').eq('id', paymentId).single();
    if (pErr || !p) throw new Error('Payment record not found');

    const { bill, tenant, unitName, owner } = await fetchBillContext(p.bill_id);
    const message = formatPaymentReceiptMessage(p, bill, tenant, unitName, owner);
    const receiptNo = p?.id ? `RCP-${p.id}` : `RCP-${bill?.id || '1001'}`;

    await shareMessage({
      title: `Payment Receipt — ${receiptNo} (${tenant.name || 'Tenant'})`,
      text: message,
      phone: tenant.mobile_number || '',
      email: tenant.email || ''
    });
  } catch (err) {
    alert('Failed to share payment receipt: ' + err.message);
  }
}

