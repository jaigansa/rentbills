// RentBill Pro — Maintenance & Repair Task Management Engine (Pure Supabase)
import { getSupabaseClient } from '../core/config.js';
import { safeInsert, safeUpdate, safeDelete } from '../core/db.js';
import { getCurrentUser } from '../core/state.js';
import { formatCurrency, escapeStr, renderEmptyState, openModal, closeModal, refreshLucideIcons } from '../core/ui.js';

let maintenanceCache = [];

/**
 * Load all maintenance tasks and render table
 */
export async function loadMaintenancePage() {
  const supabaseClient = getSupabaseClient();
  const currentUser = getCurrentUser();
  const tbody = document.getElementById('table-body-maintenance');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);"><i data-lucide="loader-2" class="spin"></i> Loading maintenance requests...</td></tr>';
  refreshLucideIcons();

  try {
    if (!supabaseClient) return;

    // Populate tenant select in add modal
    const tenantSelect = document.getElementById('maint-renter-id');
    if (tenantSelect) {
      const { data: renters } = await supabaseClient
        .from('renters')
        .select('id, name, unit_id')
        .is('deleted_at', null)
        .eq('is_active', true);

      tenantSelect.innerHTML = '<option value="">Select Tenant / Unit *</option>';
      (renters || []).forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `${r.name} (Unit: ${r.unit_id || '-'})`;
        if (currentUser && currentUser.role === 'TENANT' && currentUser.renter_id === r.id) {
          opt.selected = true;
        }
        tenantSelect.appendChild(opt);
      });
    }

    let query = supabaseClient.from('maintenance_tasks').select('*').order('created_at', { ascending: false });

    // If logged in as tenant, show only tenant's own requests
    if (currentUser && currentUser.role === 'TENANT' && currentUser.renter_id) {
      query = query.eq('renter_id', currentUser.renter_id);
    }

    const { data: tasks, error } = await query;
    if (error) throw error;

    // Fetch related maps for display
    const { data: rentersData } = await supabaseClient.from('renters').select('id, name, unit_id, property_id');
    const { data: unitsData } = await supabaseClient.from('units').select('*');
    const { data: propsData } = await supabaseClient.from('properties').select('id, name');

    const renterMap = {}; (rentersData || []).forEach(r => { renterMap[r.id] = r; });
    const unitMap = {}; (unitsData || []).forEach(u => { unitMap[u.id] = u; });
    const propMap = {}; (propsData || []).forEach(p => { propMap[p.id] = p.name; });

    maintenanceCache = (tasks || []).map(t => {
      const renter = renterMap[t.renter_id];
      const unit = unitMap[t.unit_id] || (renter ? unitMap[renter.unit_id] : null);
      const propName = propMap[t.property_id] || (unit ? propMap[unit.property_id] : '-');

      return {
        ...t,
        renter_name: renter ? renter.name : (t.renter_id ? `Tenant #${t.renter_id}` : '-'),
        unit_name: unit ? (unit.unit_name || unit.unit_number || '-') : '-',
        property_name: propName
      };
    });

    renderMaintenanceTable(maintenanceCache);

  } catch (err) {
    console.error('Failed to load maintenance tasks', err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 20px;">Error loading maintenance tasks: ${escapeStr(err.message)}</td></tr>`;
  }
}

/**
 * Render table rows
 */
function renderMaintenanceTable(tasks) {
  const tbody = document.getElementById('table-body-maintenance');
  if (!tbody) return;

  const currentUser = getCurrentUser();
  tbody.innerHTML = '';

  if (!tasks || tasks.length === 0) {
    tbody.innerHTML = renderEmptyState('wrench', 'No maintenance tasks recorded yet', 'Use the "New Repair Request" button to report an issue.');
    return;
  }

  tasks.forEach(t => {
    const tr = document.createElement('tr');
    tr.className = `maintenance-card-row priority-${(t.priority || 'normal').toLowerCase()} status-${(t.status || 'pending').toLowerCase()}`;
    tr.setAttribute('data-priority', t.priority || 'NORMAL');
    tr.setAttribute('data-status', t.status || 'PENDING');

    let priorityBadge = 'badge-info';
    if (t.priority === 'HIGH') priorityBadge = 'badge-warning';
    if (t.priority === 'URGENT') priorityBadge = 'badge-danger';
    if (t.priority === 'LOW') priorityBadge = 'badge-secondary';

    let statusBadge = 'badge-warning';
    if (t.status === 'IN_PROGRESS') statusBadge = 'badge-info';
    if (t.status === 'COMPLETED') statusBadge = 'badge-success';
    if (t.status === 'CANCELLED') statusBadge = 'badge-secondary';

    const categoryIcons = {
      PLUMBING: '<span style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="wrench" style="width:13px;height:13px;"></i> Plumbing</span>',
      ELECTRICAL: '<span style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="zap" style="width:13px;height:13px;"></i> Electrical</span>',
      APPLIANCE: '<span style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="tv" style="width:13px;height:13px;"></i> Appliance</span>',
      CLEANING: '<span style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="sparkles" style="width:13px;height:13px;"></i> Cleaning</span>',
      PAINTING: '<span style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="paintbrush" style="width:13px;height:13px;"></i> Painting</span>',
      CARPENTRY: '<span style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="hammer" style="width:13px;height:13px;"></i> Carpentry</span>',
      GENERAL: '<span style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="building" style="width:13px;height:13px;"></i> General</span>',
      OTHER: '<span style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="help-circle" style="width:13px;height:13px;"></i> Other</span>'
    };

    const estCost = t.estimated_cost ? formatCurrency(t.estimated_cost) : '-';
    const actCost = t.actual_cost ? formatCurrency(t.actual_cost) : '-';

    const descSnippet = t.description ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeStr(t.description.length > 60 ? t.description.substring(0, 60) + '...' : t.description)}</div>` : '';

    const quickActionsHtml = `
      <div class="maint-mobile-quick-actions mobile-only">
        ${currentUser.role !== 'TENANT' ? `
          <button type="button" class="btn-quick-action action-status" onclick="triggerUpdateMaintenanceStatus(${t.id})">
            <i data-lucide="check-circle-2"></i> Update Status
          </button>
        ` : ''}
        <button type="button" class="btn-quick-action" onclick="triggerEditMaintenance(${t.id})">
          <i data-lucide="edit-2"></i> Edit
        </button>
      </div>
    `;

    tr.innerHTML = `
      <td data-label="Task Subject & Category">
        <div class="maint-mobile-header">
          <div class="maint-title-pill">
            <strong>${escapeStr(t.title)}</strong>
          </div>
          <div style="font-size: 11px; color: var(--primary); font-weight: 600;">${categoryIcons[t.category] || t.category}</div>
          ${descSnippet}
        </div>
      </td>
      <td data-label="Property / Unit & Resident">
        <div class="maint-tenant-row">
          <i data-lucide="user" class="mobile-only"></i>
          <strong>${escapeStr(t.renter_name)}</strong>
        </div>
        <div style="font-size: 11px; color: var(--text-muted);">${escapeStr(t.property_name)} • ${escapeStr(t.unit_name)}</div>
      </td>
      <td data-label="Priority & Status">
        <span class="badge ${priorityBadge}" style="margin-right: 4px;">${t.priority}</span>
        <span class="badge ${statusBadge}">${t.status}</span>
      </td>
      <td data-label="Assigned Tech / Scheduled" class="maint-desktop-col">
        <div>${escapeStr(t.assigned_to || 'Unassigned')}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${t.scheduled_date ? `Scheduled: ${t.scheduled_date}` : 'Not scheduled'}</div>
      </td>
      <td data-label="Est. / Actual Cost">
        <div class="maint-desktop-col">
          <div>Est: ${estCost}</div>
          <div style="font-weight: 700; color: var(--text-main);">Act: ${actCost}</div>
        </div>

        <!-- Mobile Cost & Tech Strip -->
        <div class="maint-mobile-strip mobile-only">
          <div class="maint-col">
            <span class="maint-label">Est. Cost</span>
            <span class="maint-val">${estCost}</span>
          </div>
          <div class="maint-col">
            <span class="maint-label">Actual Cost</span>
            <span class="maint-val" style="font-weight: 800; color: var(--text-main);">${actCost}</span>
          </div>
          <div class="maint-col">
            <span class="maint-label">Technician</span>
            <span class="maint-val" title="${escapeStr(t.assigned_to || 'Unassigned')}">${escapeStr(t.assigned_to || 'Unassigned')}</span>
          </div>
        </div>
      </td>
      <td data-label="Actions">
        <div class="dropdown">
          <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
          <div class="dropdown-menu">
            ${currentUser.role !== 'TENANT' ? `
              <button class="dropdown-item" onclick="triggerUpdateMaintenanceStatus(${t.id})">
                <i data-lucide="check-circle-2"></i> Update Status & Cost
              </button>
            ` : ''}
            <button class="dropdown-item" onclick="triggerEditMaintenance(${t.id})">
              <i data-lucide="edit-2"></i> Edit Details
            </button>
            ${currentUser.role !== 'TENANT' ? `
              <button class="dropdown-item danger" onclick="triggerDeleteMaintenance(${t.id}, '${escapeStr(t.title)}')">
                <i data-lucide="trash-2"></i> Delete Request
              </button>
            ` : ''}
          </div>
        </div>
        ${quickActionsHtml}
      </td>
    `;

    tbody.appendChild(tr);
  });

  refreshLucideIcons();
}

/**
 * Filter maintenance table
 */
export function filterMaintenanceTable() {
  const searchVal = (document.getElementById('maint-search-input')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('maint-filter-status')?.value || 'ALL';
  const categoryFilter = document.getElementById('maint-filter-category')?.value || 'ALL';

  const filtered = maintenanceCache.filter(t => {
    const textMatch = (t.title || '').toLowerCase().includes(searchVal) ||
                      (t.description || '').toLowerCase().includes(searchVal) ||
                      (t.renter_name || '').toLowerCase().includes(searchVal) ||
                      (t.unit_name || '').toLowerCase().includes(searchVal) ||
                      (t.assigned_to || '').toLowerCase().includes(searchVal);

    const statusMatch = statusFilter === 'ALL' || t.status === statusFilter;
    const categoryMatch = categoryFilter === 'ALL' || t.category === categoryFilter;

    return textMatch && statusMatch && categoryMatch;
  });

  renderMaintenanceTable(filtered);
}

/**
 * Pre-fills modal for editing a task
 */
export function triggerEditMaintenance(taskId) {
  const task = maintenanceCache.find(t => String(t.id) === String(taskId));
  if (!task) return;

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

  setVal('edit-maint-id', task.id);
  setVal('maint-title', task.title);
  setVal('maint-category', task.category);
  setVal('maint-priority', task.priority);
  setVal('maint-renter-id', task.renter_id);
  setVal('maint-assigned-to', task.assigned_to);
  setVal('maint-scheduled-date', task.scheduled_date);
  setVal('maint-est-cost', task.estimated_cost ? (task.estimated_cost / 100).toFixed(2) : '');
  setVal('maint-description', task.description);

  const titleEl = document.getElementById('modal-maint-title');
  if (titleEl) titleEl.textContent = 'Edit Maintenance Task';

  openModal('modal-add-maintenance');
}

/**
 * Pre-fills status update modal
 */
export function triggerUpdateMaintenanceStatus(taskId) {
  const task = maintenanceCache.find(t => String(t.id) === String(taskId));
  if (!task) return;

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

  setVal('status-maint-id', task.id);
  setVal('maint-update-status', task.status);
  setVal('maint-actual-cost', task.actual_cost ? (task.actual_cost / 100).toFixed(2) : '');
  setVal('maint-completion-notes', task.notes || '');

  openModal('modal-update-maintenance-status');
}

/**
 * Deletes a maintenance task
 */
export async function triggerDeleteMaintenance(taskId, title) {
  if (!confirm(`Are you sure you want to delete maintenance task "${title}"?`)) return;

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await safeDelete(supabaseClient, 'maintenance_tasks', taskId);
    if (error) {
      alert('Error deleting task: ' + error.message);
    } else {
      alert('Task deleted successfully');
      loadMaintenancePage();
    }
  } catch (err) {
    alert('Delete error: ' + err.message);
  }
}

/**
 * Exports maintenance tasks to CSV
 */
export function exportMaintenanceCSV() {
  if (!maintenanceCache || maintenanceCache.length === 0) {
    alert('No maintenance records available to export.');
    return;
  }

  const headers = ['ID', 'Task Title', 'Category', 'Priority', 'Status', 'Tenant Name', 'Property', 'Unit', 'Assigned Tech', 'Est Cost (₹)', 'Act Cost (₹)', 'Scheduled Date', 'Created Date'];
  const rows = maintenanceCache.map(t => [
    t.id,
    `"${(t.title || '').replace(/"/g, '""')}"`,
    t.category,
    t.priority,
    t.status,
    `"${(t.renter_name || '').replace(/"/g, '""')}"`,
    `"${(t.property_name || '').replace(/"/g, '""')}"`,
    `"${(t.unit_name || '').replace(/"/g, '""')}"`,
    `"${(t.assigned_to || '').replace(/"/g, '""')}"`,
    (t.estimated_cost || 0) / 100,
    (t.actual_cost || 0) / 100,
    t.scheduled_date || '',
    t.created_at ? new Date(t.created_at).toLocaleDateString() : ''
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `maintenance_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Handles submission of form-add-maintenance
 */
export async function submitMaintenanceForm(e) {
  if (e) e.preventDefault();
  const client = getSupabaseClient();
  if (!client) return;

  const editId = document.getElementById('edit-maint-id')?.value;
  const title = document.getElementById('maint-title')?.value;
  const category = document.getElementById('maint-category')?.value || 'GENERAL';
  const priority = document.getElementById('maint-priority')?.value || 'MEDIUM';
  const renter_id = document.getElementById('maint-renter-id')?.value || null;
  const assigned_to = document.getElementById('maint-assigned-to')?.value || null;
  const scheduled_date = document.getElementById('maint-scheduled-date')?.value || null;
  const estimated_cost = Math.round(parseFloat(document.getElementById('maint-est-cost')?.value || '0') * 100);
  const description = document.getElementById('maint-description')?.value || null;

  let unit_id = null;
  let property_id = null;

  if (renter_id) {
    const { data: renter } = await client.from('renters').select('unit_id, property_id').eq('id', renter_id).single();
    if (renter) {
      unit_id = renter.unit_id || null;
      property_id = renter.property_id || null;
      if (unit_id && !property_id) {
        const { data: unit } = await client.from('units').select('property_id').eq('id', unit_id).single();
        if (unit) property_id = unit.property_id || null;
      }
    }
  }

  const payload = {
    title, category, priority, renter_id, unit_id, property_id,
    assigned_to, scheduled_date, estimated_cost, description
  };

  let result;
  if (editId) {
    result = await safeUpdate(client, 'maintenance_tasks', payload, 'id', editId);
  } else {
    payload.status = 'PENDING';
    result = await safeInsert(client, 'maintenance_tasks', [payload]);
  }

  if (result.error) {
    alert('Error saving maintenance request: ' + result.error.message);
  } else {
    document.getElementById('form-add-maintenance')?.reset();
    const editIdEl = document.getElementById('edit-maint-id');
    if (editIdEl) editIdEl.value = '';
    closeModal('modal-add-maintenance');
    loadMaintenancePage();
  }
}

/**
 * Handles submission of form-update-maintenance-status
 */
export async function submitMaintenanceStatusForm(e) {
  if (e) e.preventDefault();
  const client = getSupabaseClient();
  if (!client) return;

  const taskId = document.getElementById('status-maint-id')?.value;
  if (!taskId) return;

  const status = document.getElementById('maint-update-status')?.value || 'PENDING';
  const actual_cost = Math.round(parseFloat(document.getElementById('maint-actual-cost')?.value || '0') * 100);
  const notes = document.getElementById('maint-completion-notes')?.value || null;

  const updateData = { status, actual_cost, notes };
  if (status === 'COMPLETED') {
    updateData.completed_at = new Date().toISOString();
  }

  const result = await safeUpdate(client, 'maintenance_tasks', updateData, 'id', taskId);

  if (result.error) {
    alert('Error updating status: ' + result.error.message);
  } else {
    closeModal('modal-update-maintenance-status');
    loadMaintenancePage();
  }
}
