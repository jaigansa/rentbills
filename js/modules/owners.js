// RentBill Pro — Property Owners Management & Directory
import { getSupabaseClient } from '../core/config.js';
import { escapeStr, renderEmptyState, openModal, refreshLucideIcons } from '../core/ui.js';

export async function populateOwnerSelects() {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;
  const { data: owners } = await supabaseClient.from('owners').select('*').is('deleted_at', null);
  
  const withdrawalSelect = document.getElementById('withdrawal-owner-name');
  if (withdrawalSelect) {
    const currentVal = withdrawalSelect.value;
    withdrawalSelect.innerHTML = '<option value="">Select Owner *</option>';
    (owners || []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.name;
      opt.textContent = `${o.name} ${o.bank_name ? `(${o.bank_name})` : ''}`;
      withdrawalSelect.appendChild(opt);
    });
    if (currentVal) withdrawalSelect.value = currentVal;
  }

  const tenantOwnerSelect = document.getElementById('tenant-owner-id');
  if (tenantOwnerSelect) {
    const currentVal = tenantOwnerSelect.value;
    tenantOwnerSelect.innerHTML = '<option value="">Select Property Owner (Optional)</option>';
    (owners || []).forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `${o.name} ${o.upi_id ? `(UPI: ${o.upi_id})` : ''}`;
      tenantOwnerSelect.appendChild(opt);
    });
    if (currentVal) tenantOwnerSelect.value = currentVal;
  }
}

export async function loadOwnersPage() {
  const supabaseClient = getSupabaseClient();
  try {
    if (!supabaseClient) return;
    const { data: owners } = await supabaseClient.from('owners').select('*').is('deleted_at', null);
    const tbody = document.getElementById('table-body-owners');
    if (tbody) {
      tbody.innerHTML = '';
      if (!owners || owners.length === 0) {
        tbody.innerHTML = renderEmptyState(5, 'No owners registered yet');
      } else {
        owners.forEach(o => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td data-label="Owner Name"><strong>${o.name}</strong></td>
            <td data-label="Mobile">${o.mobile_number || '-'}</td>
            <td data-label="Email">${o.email || '-'}</td>
            <td data-label="UPI ID"><span class="badge badge-info">${o.upi_id || '-'}</span></td>
            <td data-label="Actions">
              <div class="dropdown">
                <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
                <div class="dropdown-menu">
                  <button class="dropdown-item" onclick="triggerEditOwner(${o.id})"><i data-lucide="edit-2"></i> Edit Owner</button>
                  <button class="dropdown-item danger" onclick="triggerDeleteOwner(${o.id}, '${escapeStr(o.name)}')"><i data-lucide="trash-2"></i> Delete Owner</button>
                </div>
              </div>
            </td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
    refreshLucideIcons();
  } catch (err) {
    console.error('Failed to load owners', err);
  }
}

export async function triggerEditOwner(id) {
  const supabaseClient = getSupabaseClient();
  let o = null;
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient.from('owners').select('*').eq('id', id).single();
      o = data;
    } catch (err) {
      console.warn('Supabase edit owner fetch error', err);
    }
  }
  if (!o) return;

  const setVal = (elemId, val) => {
    const el = document.getElementById(elemId);
    if (el) el.value = val || '';
  };

  setVal('edit-owner-id', o.id);
  setVal('owner-name', o.name);
  setVal('owner-mobile', o.mobile_number);
  setVal('owner-email', o.email);
  setVal('owner-upi', o.upi_id);
  setVal('owner-bank-name', o.bank_name);
  setVal('owner-account-no', o.account_number);
  setVal('owner-ifsc', o.ifsc_code);

  openModal('modal-add-owner');
}

export async function triggerDeleteOwner(id, name) {
  const supabaseClient = getSupabaseClient();
  if (!confirm(`Are you sure you want to delete owner "${name}"?`)) return;
  const { error } = await supabaseClient.from('owners').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) alert('Failed to delete owner: ' + error.message);
  else loadOwnersPage();
}
