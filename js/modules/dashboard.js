// RentBill Pro — Financial & Real-Time KPI Dashboard Engine (Pure Supabase)
import { getSupabaseClient } from '../core/config.js';
import { getCurrentUser } from '../core/state.js';
import { formatCurrency, refreshLucideIcons } from '../core/ui.js';

export async function loadDashboard() {
  const supabaseClient = getSupabaseClient();
  const currentUser = getCurrentUser();

  try {
    if (!supabaseClient) return;

    // 1. TENANT DASHBOARD VIEW
    if (currentUser && currentUser.role === 'TENANT') {
      const bannerEl = document.getElementById('tenant-portal-banner');
      if (bannerEl) bannerEl.style.display = 'block';

      const dashTitle = document.getElementById('i18n-dash-title');
      if (dashTitle) dashTitle.textContent = 'Resident Tenant Portal';

      let myRentersList = [];
      let myBillsList = [];

      try {
        const { data: rData } = await supabaseClient.from('renters').select('*').is('deleted_at', null);
        myRentersList = rData || [];
      } catch (e) {
        console.warn('Tenant lease fetch warning:', e);
      }

      try {
        const { data: bData } = await supabaseClient.from('bills').select('*').is('deleted_at', null);
        myBillsList = bData || [];
      } catch (e) {
        console.warn('Tenant bills fetch warning:', e);
      }

      const myLease = (myRentersList && myRentersList.length > 0) ? myRentersList[0] : null;

      let tenantDue = 0;
      (myBillsList || []).forEach(b => {
        if (b.status !== 'PAID' && b.status !== 'VOID') {
          tenantDue += ((b.net_amount || 0) - (b.paid_amount || 0));
        }
      });

      let unitLabel = 'My Rental Unit';
      let upiId = '-';

      if (myLease) {
        if (myLease.unit_id) {
          const { data: unitData } = await supabaseClient.from('units').select('unit_name, property_id').eq('id', myLease.unit_id).maybeSingle();
          if (unitData) {
            const { data: propData } = await supabaseClient.from('properties').select('name').eq('id', unitData.property_id).maybeSingle();
            unitLabel = `${unitData.unit_name} — ${propData ? propData.name : 'Property'}`;
          }
        }

        if (myLease.owner_id) {
          const { data: ownerData } = await supabaseClient.from('owners').select('upi_id').eq('id', myLease.owner_id).maybeSingle();
          if (ownerData && ownerData.upi_id) upiId = ownerData.upi_id;
        } else if (myLease.assigned_upi) {
          upiId = myLease.assigned_upi;
        }

        const dueEl = document.getElementById('tenant-banner-due');
        const unitEl = document.getElementById('tenant-banner-unit');
        const leaseEl = document.getElementById('tenant-banner-lease');
        const rentEl = document.getElementById('tenant-banner-rent');
        const advanceEl = document.getElementById('tenant-banner-advance');
        const upiEl = document.getElementById('tenant-banner-upi');

        if (dueEl) dueEl.textContent = formatCurrency(tenantDue > 0 ? tenantDue : 0);
        if (unitEl) unitEl.textContent = unitLabel;
        if (leaseEl) leaseEl.textContent = `Tenant: ${myLease.name} | Active Lease`;
        if (rentEl) rentEl.textContent = formatCurrency(myLease.base_rent || 0);
        if (advanceEl) advanceEl.textContent = formatCurrency(myLease.advance_amount || 0);
        if (upiEl) upiEl.textContent = upiId;
      }

      refreshLucideIcons();
      return;
    }

    // 2. LANDLORD ADMIN DASHBOARD VIEW
    const bannerEl = document.getElementById('tenant-portal-banner');
    if (bannerEl) bannerEl.style.display = 'none';

    let bills = [];
    let renters = [];
    let units = [];
    let expenses = [];

    try {
      const { data: bData } = await supabaseClient.from('bills').select('net_amount, paid_amount, status, proof_status').is('deleted_at', null);
      bills = bData || [];
      const { data: rData } = await supabaseClient.from('renters').select('id, is_active, pending_arrears').is('deleted_at', null);
      renters = rData || [];
      const { data: uData } = await supabaseClient.from('units').select('id, status').is('deleted_at', null);
      units = uData || [];
      const { data: eData } = await supabaseClient.from('expenses').select('amount').is('deleted_at', null);
      expenses = eData || [];
    } catch (e) {
      console.warn('Dashboard fetch warning:', e);
    }

    let totalBilled = 0;
    let totalCollected = 0;
    let totalExpenses = 0;
    let arrearsSum = 0;
    let pendingProofs = 0;

    (bills || []).forEach(b => {
      totalBilled += (b.net_amount || 0);
      totalCollected += (b.paid_amount || 0);
      if (b.proof_status === 'PENDING') pendingProofs++;
    });

    (expenses || []).forEach(e => totalExpenses += (e.amount || 0));
    (renters || []).forEach(r => { if (r.is_active) arrearsSum += (r.pending_arrears || 0); });

    const activeTenants = (renters || []).filter(r => r.is_active).length;
    const vacantUnits = (units || []).filter(u => u.status === 'VACANT').length;
    const outstanding = totalBilled - totalCollected;

    const valBilled = document.getElementById('val-billed');
    const valCollected = document.getElementById('val-collected');
    const valOutstanding = document.getElementById('val-outstanding');
    const valArrears = document.getElementById('val-arrears');
    const valExpenses = document.getElementById('val-expenses');
    const valTenants = document.getElementById('val-tenants');
    const valVacant = document.getElementById('val-vacant');
    const valProofs = document.getElementById('val-proofs');

    if (valBilled) valBilled.textContent = formatCurrency(totalBilled);
    if (valCollected) valCollected.textContent = formatCurrency(totalCollected);
    if (valOutstanding) valOutstanding.textContent = formatCurrency(outstanding > 0 ? outstanding : 0);
    if (valArrears) valArrears.textContent = formatCurrency(arrearsSum);
    if (valExpenses) valExpenses.textContent = formatCurrency(totalExpenses);
    if (valTenants) valTenants.textContent = activeTenants;
    if (valVacant) valVacant.textContent = vacantUnits;
    if (valProofs) valProofs.textContent = pendingProofs;

    refreshLucideIcons();
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}
