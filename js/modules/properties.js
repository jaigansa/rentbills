// RentBill Pro — Property Buildings, Rental Units & Tenants Directory
import { getSupabaseClient } from '../core/config.js';
import { safeUpdate, safeDelete } from '../core/db.js';
import { formatCurrency, escapeStr, renderEmptyState, openModal, closeModal, refreshLucideIcons, sortTenants } from '../core/ui.js';
import { loadOwnersPage, populateOwnerSelects } from './owners.js';
import { loadDocumentsPage } from './documents.js';

export async function populateTenantUnitSelect(selectedUnitId = null) {
  const supabaseClient = getSupabaseClient();
  const select = document.getElementById('tenant-unit-id');
  if (!select || !supabaseClient) return;

  const { data: units } = await supabaseClient.from('units').select('*').is('deleted_at', null);
  select.innerHTML = '<option value="">Select Target Unit *</option>';
  
  (units || []).forEach(u => {
    if (u.status === 'VACANT' || u.id === selectedUnitId) {
      const opt = document.createElement('option');
      opt.value = u.id;
      const uLabel = u.unit_name || u.unit_number || `Unit #${u.id}`;
      opt.textContent = `${uLabel} ${u.id === selectedUnitId ? '(Current)' : ''}`;
      select.appendChild(opt);
    }
  });

  if (selectedUnitId) {
    select.value = selectedUnitId;
  }
}

export async function loadPropertiesPage() {
  const supabaseClient = getSupabaseClient();
  try {
    if (!supabaseClient) return;
    loadTenantsPage();
    loadOwnersPage();
    loadDocumentsPage();
    const { data: owners } = await supabaseClient.from('owners').select('name').is('deleted_at', null);
    const propOwnerSelect = document.getElementById('prop-owner');
    if (propOwnerSelect) {
      propOwnerSelect.innerHTML = '<option value="">Select Owner *</option>';
      (owners || []).forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.name;
        opt.textContent = o.name;
        propOwnerSelect.appendChild(opt);
      });
    }

    const { data: properties } = await supabaseClient.from('properties').select('*').is('deleted_at', null);
    const tbodyProps = document.getElementById('table-body-properties');
    const unitPropSelect = document.getElementById('unit-property-id');

    if (tbodyProps) tbodyProps.innerHTML = '';
    if (unitPropSelect) unitPropSelect.innerHTML = '<option value="">Select Property</option>';

    if (tbodyProps) {
      if (!properties || properties.length === 0) {
        tbodyProps.innerHTML = renderEmptyState(5, 'No properties registered yet');
      } else {
        properties.forEach(p => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td data-label="Property Name"><strong>${p.name}</strong></td>
            <td data-label="Address">${p.address || '-'}</td>
            <td data-label="Status"><span class="badge badge-success">Active</span></td>
            <td data-label="Actions">
              <div class="dropdown">
                <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
                <div class="dropdown-menu">
                  <button class="dropdown-item" onclick="triggerEditProperty(${p.id}, '${escapeStr(p.name)}', '${escapeStr(p.address)}')"><i data-lucide="edit-2"></i> Edit Property</button>
                  <button class="dropdown-item danger" onclick="triggerDeleteProperty(${p.id}, '${escapeStr(p.name)}')"><i data-lucide="trash-2"></i> Delete Property</button>
                </div>
              </div>
            </td>
          `;
          tbodyProps.appendChild(tr);

          if (unitPropSelect) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name;
            unitPropSelect.appendChild(opt);
          }
        });
      }
    }

    const { data: units } = await supabaseClient.from('units').select('*').is('deleted_at', null);
    const tbodyUnits = document.getElementById('table-body-units');
    if (tbodyUnits) {
      tbodyUnits.innerHTML = '';
      (units || []).forEach(u => {
        const tr = document.createElement('tr');
        const badgeClass = u.status === 'VACANT' ? 'badge-success' : 'badge-warning';
        const displayName = u.unit_name || u.unit_number || `Unit #${u.id}`;
        tr.innerHTML = `
          <td data-label="Unit Name"><strong>${displayName}</strong></td>
          <td data-label="Floor">${(u.floor !== null && u.floor !== undefined && u.floor !== '') ? (u.floor === 0 ? 'Ground (0)' : u.floor) : '-'}</td>
          <td data-label="Status"><span class="badge ${badgeClass}">${u.status}</span></td>
          <td data-label="Actions">
            <div class="dropdown">
              <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
              <div class="dropdown-menu">
                <button class="dropdown-item" onclick="triggerEditUnit(${u.id}, ${u.property_id}, '${escapeStr(displayName)}', '${escapeStr(u.floor)}')"><i data-lucide="edit-2"></i> Edit Unit</button>
                <button class="dropdown-item danger" onclick="triggerDeleteUnit(${u.id}, '${escapeStr(displayName)}')"><i data-lucide="trash-2"></i> Delete Unit</button>
              </div>
            </div>
          </td>
        `;
        tbodyUnits.appendChild(tr);
      });
    }
    refreshLucideIcons();
  } catch (err) {
    console.error('Failed to load properties', err);
  }
}

export async function loadTenantsPage() {
  const supabaseClient = getSupabaseClient();
  try {
    if (!supabaseClient) return;

    const { data: allUnits } = await supabaseClient.from('units').select('*');
    const unitMap = {};
    (allUnits || []).forEach(u => { unitMap[u.id] = u.unit_name || u.unit_number || `Unit #${u.id}`; });

    const { data: vacantUnits } = await supabaseClient.from('units').select('*').eq('status', 'VACANT').is('deleted_at', null);
    const tenantUnitSelect = document.getElementById('tenant-unit-id');
    if (tenantUnitSelect) {
      tenantUnitSelect.innerHTML = '<option value="">Select Vacant Unit</option>';
      (vacantUnits || []).forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.unit_name || u.unit_number || `Unit #${u.id}`;
        tenantUnitSelect.appendChild(opt);
      });
    }

    let tenants = [];
    try {
      const { data: tData } = await supabaseClient
        .from('renters')
        .select('*')
        .is('deleted_at', null)
        .order('is_active', { ascending: false })
        .order('name', { ascending: true });
      tenants = sortTenants(tData || []);
    } catch (e) {
      console.warn('Tenants fetch error:', e);
    }
    const tbody = document.getElementById('table-body-tenants');
    if (tbody) {
      tbody.innerHTML = '';
      if (!tenants || tenants.length === 0) {
        tbody.innerHTML = renderEmptyState(8, 'No tenants registered yet');
      } else {
        tenants.forEach(t => {
          const statusClass = t.is_active ? 'status-active' : 'status-vacated';
          const tr = document.createElement('tr');
          tr.className = `renter-card-row ${statusClass}`;
          tr.setAttribute('data-status', t.is_active ? 'ACTIVE' : 'VACATED');

          const badgeClass = t.is_active ? 'badge-success' : 'badge-danger';
          const badgeLabel = t.is_active ? 'Active' : 'Vacated';
          const unitDisplayName = unitMap[t.unit_id] || (t.unit_id ? `Unit #${t.unit_id}` : '-');

          const cleanPhone = (t.mobile_number || '').replace(/[^0-9]/g, '');
          const hasPhone = cleanPhone.length >= 10;
          const phoneParam = hasPhone ? `91${cleanPhone.slice(-10)}` : cleanPhone;

          const contactStripHtml = hasPhone ? `
            <div class="renter-mobile-contact-bar mobile-only">
              <a href="tel:${cleanPhone}" class="btn-contact-action btn-call">
                <i data-lucide="phone"></i> Call
              </a>
              <a href="https://api.whatsapp.com/send?phone=${phoneParam}" target="_blank" class="btn-contact-action btn-wa">
                <i data-lucide="message-circle"></i> WhatsApp
              </a>
            </div>
          ` : '';

          const arrearsVal = t.pending_arrears || 0;
          const arrearsClass = arrearsVal > 0 ? 'arrears-due' : 'arrears-none';

          let actionBtn = '';
          if (t.is_active) {
            actionBtn = `
              <div class="dropdown">
                <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
                <div class="dropdown-menu">
                  <button class="dropdown-item" onclick="triggerEditTenant(${t.id})"><i data-lucide="edit-2"></i> Edit Tenant</button>
                  <button class="dropdown-item" onclick="triggerAdjustArrears(${t.id})"><i data-lucide="sliders"></i> Adjust Pending Arrears</button>
                  <button class="dropdown-item" onclick="triggerTransferModal(${t.id}, '${escapeStr(t.name)}', ${t.unit_id})"><i data-lucide="arrow-right-left"></i> Transfer Unit</button>
                  <button class="dropdown-item" onclick="triggerMeterResetModal(${t.id}, '${escapeStr(t.name)}')"><i data-lucide="zap"></i> Reset Meter</button>
                  <button class="dropdown-item" onclick="triggerVacateModal(${t.id}, '${escapeStr(t.name)}')"><i data-lucide="log-out"></i> Vacate Tenant</button>
                </div>
              </div>
            `;
          } else {
            actionBtn = `
              <div class="dropdown">
                <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
                <div class="dropdown-menu">
                  <button class="dropdown-item danger" onclick="triggerDeleteTenant(${t.id}, '${escapeStr(t.name)}')"><i data-lucide="trash-2"></i> Delete Record</button>
                </div>
              </div>
            `;
          }

          const quickActionsHtml = `
            <div class="renter-mobile-quick-actions mobile-only">
              <button type="button" class="btn-quick-action" onclick="triggerEditTenant(${t.id})">
                <i data-lucide="edit-2"></i> Edit
              </button>
              ${t.is_active ? `
                <button type="button" class="btn-quick-action" onclick="triggerMeterResetModal(${t.id}, '${escapeStr(t.name)}')">
                  <i data-lucide="zap"></i> Meter
                </button>
                <button type="button" class="btn-quick-action action-vacate" onclick="triggerVacateModal(${t.id}, '${escapeStr(t.name)}')">
                  <i data-lucide="log-out"></i> Vacate
                </button>
              ` : `
                <button type="button" class="btn-quick-action action-delete" onclick="triggerDeleteTenant(${t.id}, '${escapeStr(t.name)}')">
                  <i data-lucide="trash-2"></i> Delete
                </button>
              `}
            </div>
          `;

          tr.innerHTML = `
            <td data-label="Tenant Name">
              <div class="renter-mobile-header">
                <div class="renter-name-wrap">
                  <i data-lucide="user" class="mobile-only"></i>
                  <strong>${escapeStr(t.name)}</strong>
                </div>
                <div class="renter-unit-pill mobile-only">${escapeStr(unitDisplayName)}</div>
              </div>
            </td>
            <td data-label="Unit" class="renter-desktop-col"><strong>${unitDisplayName}</strong></td>
            <td data-label="Mobile">
              <span class="renter-desktop-col">${t.mobile_number || '-'}</span>
              ${contactStripHtml}
            </td>
            <td data-label="Monthly Rent">
              <span class="renter-desktop-col">${formatCurrency(t.base_rent)}</span>
              
              <!-- Mobile Financial & Lease Strip -->
              <div class="renter-mobile-strip mobile-only">
                <div class="renter-col">
                  <span class="renter-label">Monthly Rent</span>
                  <span class="renter-val">${formatCurrency(t.base_rent)}</span>
                </div>
                <div class="renter-col">
                  <span class="renter-label">Arrears Due</span>
                  <span class="renter-val ${arrearsClass}">${formatCurrency(arrearsVal)}</span>
                </div>
                <div class="renter-col">
                  <span class="renter-label">Lease End</span>
                  <span class="renter-val" style="font-size: 11px;">${t.agreement_expiry_date || '-'}</span>
                </div>
              </div>
            </td>
            <td data-label="Arrears" class="renter-desktop-col">${formatCurrency(t.pending_arrears)}</td>
            <td data-label="Expiry Date" class="renter-desktop-col">${t.agreement_expiry_date || '-'}</td>
            <td data-label="Status"><span class="badge ${badgeClass}">${badgeLabel}</span></td>
            <td data-label="Actions">
              ${actionBtn}
              ${quickActionsHtml}
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
    refreshLucideIcons();
  } catch (err) {
    console.error('Failed to load tenants', err);
  }
}

export function triggerEditProperty(id, name, address) {
  document.getElementById('edit-property-id').value = id;
  document.getElementById('prop-name').value = name || '';
  document.getElementById('prop-address').value = address || '';
  openModal('modal-add-property');
}

export async function triggerDeleteProperty(id, name) {
  const supabaseClient = getSupabaseClient();
  if (!confirm(`Are you sure you want to delete property "${name}"?`)) return;
  const { error } = await safeDelete(supabaseClient, 'properties', id);
  if (error) alert('Failed to delete property: ' + error.message);
  else loadPropertiesPage();
}

export function triggerEditUnit(id, propertyId, unitName, floor) {
  document.getElementById('edit-unit-id').value = id;
  document.getElementById('unit-property-id').value = propertyId || '';
  document.getElementById('unit-name').value = unitName || '';
  document.getElementById('unit-floor').value = floor || '';
  openModal('modal-add-unit');
}

export async function triggerDeleteUnit(id, name) {
  const supabaseClient = getSupabaseClient();
  if (!confirm(`Are you sure you want to delete unit "${name}"?`)) return;
  const { error } = await safeDelete(supabaseClient, 'units', id);
  if (error) alert('Failed to delete unit: ' + error.message);
  else loadPropertiesPage();
}

export async function triggerEditTenant(tenantId) {
  const supabaseClient = getSupabaseClient();
  const { data: t } = await supabaseClient.from('renters').select('*').eq('id', tenantId).single();
  if (!t) return;
  
  document.getElementById('edit-tenant-id').value = t.id;
  await populateTenantUnitSelect(t.unit_id);
  await populateOwnerSelects();
  if (t.owner_id) {
    const selOwner = document.getElementById('tenant-owner-id');
    if (selOwner) selOwner.value = t.owner_id;
  }

  let mobileVal = t.mobile_number || '';
  let emailVal = t.email || '';
  if (mobileVal.includes('@') && (!emailVal || !emailVal.includes('@'))) {
    const temp = mobileVal;
    mobileVal = emailVal;
    emailVal = temp;
  }

  document.getElementById('tenant-name').value = t.name || '';
  document.getElementById('tenant-mobile').value = mobileVal;
  const emailEl = document.getElementById('tenant-email');
  if (emailEl) emailEl.value = emailVal;
  document.getElementById('tenant-aadhar').value = t.aadhar_number || t.aadhar_no || '';
  document.getElementById('tenant-rent').value = (t.base_rent || 0) / 100;
  document.getElementById('tenant-advance').value = (t.advance_amount || 0) / 100;
  const arrearsEl = document.getElementById('tenant-arrears');
  if (arrearsEl) arrearsEl.value = ((t.pending_arrears || 0) / 100).toFixed(2);
  document.getElementById('tenant-maint').value = (t.maint_charge || 0) / 100;
  document.getElementById('tenant-eb-price').value = t.eb_per_unit_price != null ? t.eb_per_unit_price : ((t.eb_unit_price || 800) / 100);
  document.getElementById('tenant-init-eb').value = t.initial_eb_reading ?? t.initial_eb ?? 0;
  document.getElementById('tenant-water-mode').value = t.water_calc_mode || 'FIXED';
  document.getElementById('tenant-water-rate').value = (t.water_calc_mode === 'METERED' && t.water_per_unit_price != null)
    ? t.water_per_unit_price
    : ((t.water_fixed_charge || t.water_unit_price || 15000) / 100);
  document.getElementById('tenant-init-water').value = t.initial_water_reading ?? t.initial_water ?? 0;
  document.getElementById('tenant-start-date').value = t.agreement_start_date || '';
  document.getElementById('tenant-end-date').value = t.agreement_expiry_date || '';
  const pwEl = document.getElementById('tenant-password');
  if (pwEl) {
    pwEl.value = '';
    pwEl.placeholder = 'Leave blank to keep existing password';
  }
  openModal('modal-add-tenant');
}

export async function triggerAdjustArrears(tenantId) {
  const supabaseClient = getSupabaseClient();
  const { data: t } = await supabaseClient.from('renters').select('name, pending_arrears').eq('id', tenantId).single();
  if (!t) return;

  const currentRupees = ((t.pending_arrears || 0) / 100).toFixed(2);
  const input = prompt(`Adjust pending arrears for tenant "${t.name}" (Current: ₹${currentRupees}):`, currentRupees);
  if (input === null) return;

  const newRupees = parseFloat(input);
  if (isNaN(newRupees)) { alert('Invalid amount entered'); return; }

  const newPaise = Math.round(newRupees * 100);
  const { error } = await safeUpdate(supabaseClient, 'renters', { pending_arrears: newPaise }, 'id', tenantId);
  if (error) alert('Failed to update arrears: ' + error.message);
  else {
    alert(`✅ Pending arrears updated to ₹${newRupees.toFixed(2)} for ${t.name}`);
    loadTenantsPage();
  }
}

export async function triggerDeleteTenant(id, name) {
  const supabaseClient = getSupabaseClient();
  if (!confirm(`Are you sure you want to delete tenant "${name}"?\n\nThis will also free up their rental unit and mark it as Vacant.`)) return;

  let unitId = null;
  try {
    const { data: tenant } = await supabaseClient.from('renters').select('unit_id').eq('id', id).maybeSingle();
    unitId = tenant ? tenant.unit_id : null;
  } catch (e) {}

  const { error } = await safeDelete(supabaseClient, 'renters', id);
  if (error) {
    alert('Failed to delete tenant: ' + error.message);
    return;
  }

  if (unitId) {
    try {
      await safeUpdate(supabaseClient, 'units', { status: 'VACANT' }, 'id', unitId);
    } catch (e) {}
  }

  loadTenantsPage();
  loadPropertiesPage();
}

export function triggerVacateModal(tenantId, tenantName) {
  document.getElementById('vacate-renter-id').value = tenantId;
  document.getElementById('vacate-tenant-name-display').value = tenantName;
  openModal('modal-vacate-tenant');
}

export async function triggerTransferModal(tenantId, tenantName, currentUnitId) {
  const supabaseClient = getSupabaseClient();
  document.getElementById('transfer-renter-id').value = tenantId;
  document.getElementById('transfer-renter-name').textContent = tenantName;
  
  const { data: units } = await supabaseClient.from('units').select('*').eq('status', 'VACANT').is('deleted_at', null);
  const select = document.getElementById('transfer-new-unit-id');
  if (select) {
    select.innerHTML = '<option value="">Select New Vacant Unit</option>';
    (units || []).forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.unit_name || u.unit_number || `Unit #${u.id}`;
      select.appendChild(opt);
    });
  }
  openModal('modal-transfer-tenant');
}

export async function submitTransfer() {
  const supabaseClient = getSupabaseClient();
  const renter_id = document.getElementById('transfer-renter-id').value;
  const new_unit_id = document.getElementById('transfer-new-unit-id').value;

  const { data: tenant } = await supabaseClient.from('renters').select('unit_id').eq('id', renter_id).single();
  const old_unit_id = tenant ? tenant.unit_id : null;

  const { error } = await safeUpdate(supabaseClient, 'renters', { unit_id: new_unit_id }, 'id', renter_id);
  if (error) alert('Transfer failed: ' + error.message);
  else {
    if (old_unit_id) await safeUpdate(supabaseClient, 'units', { status: 'VACANT' }, 'id', old_unit_id);
    await safeUpdate(supabaseClient, 'units', { status: 'OCCUPIED' }, 'id', new_unit_id);
    closeModal('modal-transfer-tenant');
    loadTenantsPage();
    loadPropertiesPage();
  }
}

export function triggerMeterResetModal(tenantId, tenantName) {
  document.getElementById('reset-renter-id').value = tenantId;
  document.getElementById('reset-renter-name').textContent = tenantName;
  openModal('modal-reset-meter');
}

export async function submitMeterReset() {
  const supabaseClient = getSupabaseClient();
  const renter_id = document.getElementById('reset-renter-id').value;
  const type = document.getElementById('reset-reading-type').value;
  const new_reading = parseInt(document.getElementById('reset-new-reading').value || '0', 10);
  const reason = (document.getElementById('reset-reason')?.value || '').trim();

  if (!renter_id) {
    alert('No tenant selected for meter reset');
    return;
  }

  const field = type === 'EB' ? 'initial_eb' : 'initial_water';
  const resetTimeField = type === 'EB' ? 'eb_reset_at' : 'water_reset_at';

  const updateObj = {
    [field]: new_reading,
    [resetTimeField]: new Date().toISOString()
  };

  const { error } = await safeUpdate(supabaseClient, 'renters', updateObj, 'id', renter_id);
  if (error) {
    alert('Meter reset failed: ' + error.message);
  } else {
    closeModal('modal-reset-meter');
    alert(`✅ ${type === 'EB' ? 'Electricity (EB)' : 'Water'} meter baseline reset to ${new_reading}${reason ? ` (${reason})` : ''}. Upcoming bills will start from this reading.`);
    loadTenantsPage();
    loadPropertiesPage();
  }
}
