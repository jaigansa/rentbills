// RentBill Pro — Maintenance & Work Orders Module
import { getSupabaseClient } from '../core/config.js';
import { getCurrentUser } from '../core/state.js';
import { formatCurrency, escapeStr, renderEmptyState, refreshLucideIcons, openModal, closeModal } from '../core/ui.js';
import { exportToCSV } from './backups.js';

let cachedMaintenanceTasks = [];
let cachedRentersList = [];
let cachedUnitsList = [];

/**
 * Loads the Maintenance & Repairs Page
 */
export async function loadMaintenancePage() {
  const supabaseClient = getSupabaseClient();
  const currentUser = getCurrentUser();

  try {
    if (!supabaseClient) return;

    // 1. Fetch renters & units for labels and modal dropdowns
    try {
      const { data: rData } = await supabaseClient.from('renters').select('id, name, unit_id, user_id, email, mobile_number').is('deleted_at', null);
      cachedRentersList = rData || [];

      const { data: uData } = await supabaseClient.from('units').select('id, unit_name, property_id').is('deleted_at', null);
      cachedUnitsList = uData || [];
    } catch (e) {
      console.warn('Maintenance reference fetch notice:', e);
    }

    populateMaintenanceUnitSelect();

    // 2. Fetch maintenance tasks
    let query = supabaseClient.from('maintenance_tasks').select('*').is('deleted_at', null).order('created_at', { ascending: false });

    if (currentUser && currentUser.role === 'TENANT' && currentUser.renter_id) {
      query = query.eq('renter_id', currentUser.renter_id);
    }

    const { data: maintData, error } = await query;
    if (error) throw error;

    cachedMaintenanceTasks = maintData || [];

    // 3. Update KPI Stat Cards
    updateMaintenanceKpis(cachedMaintenanceTasks);

    // 4. Render Table Rows
    filterMaintenanceTable();

  } catch (err) {
    console.error('Failed to load maintenance tasks:', err);
    const tbody = document.getElementById('table-body-maintenance');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8">${renderEmptyState('Wrench', 'Unable to load maintenance records', err.message || 'Please check connection')}</td></tr>`;
    }
  }
}

/**
 * Updates KPI Summary Stat Cards
 */
function updateMaintenanceKpis(tasks) {
  let totalCount = tasks.length;
  let pendingCount = 0;
  let progressCount = 0;
  let completedCount = 0;
  let totalCostPaise = 0;

  tasks.forEach(t => {
    if (t.status === 'PENDING') pendingCount++;
    else if (t.status === 'IN_PROGRESS') progressCount++;
    else if (t.status === 'COMPLETED') completedCount++;

    totalCostPaise += (t.actual_cost || t.estimated_cost || 0);
  });

  const totEl = document.getElementById('val-maint-total');
  const pendEl = document.getElementById('val-maint-pending');
  const progEl = document.getElementById('val-maint-progress');
  const compEl = document.getElementById('val-maint-completed');
  const costEl = document.getElementById('val-maint-cost');

  if (totEl) totEl.textContent = totalCount;
  if (pendEl) pendEl.textContent = pendingCount;
  if (progEl) progEl.textContent = progressCount;
  if (compEl) compEl.textContent = completedCount;
  if (costEl) costEl.textContent = formatCurrency(totalCostPaise / 100);
}

/**
 * Populates Renter/Unit dropdown in Add Maintenance Modal
 */
function populateMaintenanceUnitSelect() {
  const selectEl = document.getElementById('maint-renter-id');
  if (!selectEl) return;

  const currentUser = getCurrentUser();
  selectEl.innerHTML = '';

  if (currentUser && currentUser.role === 'TENANT') {
    const myRenter = cachedRentersList.find(r => String(r.id) === String(currentUser.renter_id) || r.user_id === currentUser.id);
    if (myRenter) {
      const opt = document.createElement('option');
      opt.value = myRenter.id;
      opt.textContent = `${myRenter.name} (My Lease)`;
      opt.selected = true;
      selectEl.appendChild(opt);
      return;
    }
  }

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Select Unit / Tenant...';
  selectEl.appendChild(defaultOpt);

  cachedRentersList.forEach(r => {
    const unitObj = cachedUnitsList.find(u => String(u.id) === String(r.unit_id));
    const unitName = unitObj ? unitObj.unit_name : 'No Unit';
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = `${r.name} (Unit: ${unitName})`;
    selectEl.appendChild(opt);
  });
}

/**
 * Filters & renders maintenance tasks table based on user selections
 */
export function filterMaintenanceTable() {
  const searchVal = (document.getElementById('maint-search-input')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('maint-filter-status')?.value || 'ALL';
  const priorityFilter = document.getElementById('maint-filter-priority')?.value || 'ALL';
  const categoryFilter = document.getElementById('maint-filter-category')?.value || 'ALL';

  const filtered = cachedMaintenanceTasks.filter(t => {
    // 1. Status Filter
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;

    // 2. Priority Filter
    if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;

    // 3. Category Filter
    if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;

    // 4. Search Filter
    if (searchVal) {
      const title = (t.title || '').toLowerCase();
      const tech = (t.assigned_to || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const renterObj = cachedRentersList.find(r => String(r.id) === String(t.renter_id));
      const renterName = renterObj ? renterObj.name.toLowerCase() : '';

      return title.includes(searchVal) || tech.includes(searchVal) || desc.includes(searchVal) || renterName.includes(searchVal);
    }

    return true;
  });

  renderMaintenanceRows(filtered);
}

/**
 * Renders HTML table rows for filtered maintenance tasks
 */
function renderMaintenanceRows(tasks) {
  const tbody = document.getElementById('table-body-maintenance');
  if (!tbody) return;

  if (!tasks || tasks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">${renderEmptyState('wrench', 'No maintenance tasks found', 'Click "New Task Request" to submit a maintenance work order')}</td></tr>`;
    refreshLucideIcons();
    return;
  }

  const currentUser = getCurrentUser();
  const isAdmin = currentUser && currentUser.role === 'ADMIN';
  const isAuditor = currentUser && currentUser.role === 'AUDITOR';
  const canUpdateStatus = currentUser && !isAuditor;

  tbody.innerHTML = tasks.map(t => {
    const renterObj = cachedRentersList.find(r => String(r.id) === String(t.renter_id));
    const unitObj = renterObj ? cachedUnitsList.find(u => String(u.id) === String(renterObj.unit_id)) : null;
    const unitLabel = unitObj ? `${unitObj.unit_name}` : (renterObj ? renterObj.name : 'General Facility');

    // Priority Badge formatting
    let priorityBadge = '<span class="badge badge-secondary">Low</span>';
    if (t.priority === 'URGENT') priorityBadge = '<span class="badge badge-danger">🚨 Urgent</span>';
    else if (t.priority === 'HIGH') priorityBadge = '<span class="badge badge-warning">🔥 High</span>';
    else if (t.priority === 'MEDIUM') priorityBadge = '<span class="badge badge-primary">⚡ Medium</span>';

    // Status Badge formatting
    let statusBadge = '<span class="badge badge-secondary">Pending</span>';
    if (t.status === 'COMPLETED') statusBadge = '<span class="badge badge-success">✅ Completed</span>';
    else if (t.status === 'IN_PROGRESS') statusBadge = '<span class="badge badge-primary">⚙️ In Progress</span>';
    else if (t.status === 'CANCELLED') statusBadge = '<span class="badge badge-danger">❌ Cancelled</span>';
    else statusBadge = '<span class="badge badge-warning">⏳ Pending</span>';

    const costDisplay = t.actual_cost 
      ? `<strong style="color: var(--success);">${formatCurrency(t.actual_cost / 100)}</strong> <small style="color: var(--text-muted);">(Actual)</small>`
      : (t.estimated_cost ? `${formatCurrency(t.estimated_cost / 100)} <small style="color: var(--text-muted);">(Est.)</small>` : '-');

    const scheduledDateDisplay = t.scheduled_date ? t.scheduled_date : '<span style="color: var(--text-muted);">-</span>';

    return `
      <tr>
        <td>
          <div style="font-weight: 700;">${escapeStr(t.title)}</div>
          <span class="badge badge-secondary" style="font-size: 11px; margin-top: 2px;">${t.category || 'GENERAL'}</span>
          ${t.description ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${escapeStr(t.description)}</div>` : ''}
        </td>
        <td>
          <div style="font-weight: 600;">${escapeStr(unitLabel)}</div>
          ${renterObj ? `<div style="font-size: 12px; color: var(--text-muted);">${escapeStr(renterObj.name)}</div>` : ''}
        </td>
        <td>${priorityBadge}</td>
        <td>${statusBadge}</td>
        <td>${escapeStr(t.assigned_to || '-')}</td>
        <td>${scheduledDateDisplay}</td>
        <td>${costDisplay}</td>
        <td>
          ${canUpdateStatus ? `
            <div class="dropdown" style="position: relative; display: inline-block;">
              <button class="btn btn-secondary btn-sm" onclick="toggleDropdown(event, 'maint-drop-${t.id}')">
                <i data-lucide="more-vertical"></i>
              </button>
              <div id="maint-drop-${t.id}" class="dropdown-menu" style="display: none; position: absolute; right: 0; z-index: 100; min-width: 160px;">
                <button class="dropdown-item" onclick="triggerUpdateMaintenanceStatus(${t.id})">
                  <i data-lucide="check-circle-2"></i> Update Status & Cost
                </button>
                ${isAdmin ? `
                  <button class="dropdown-item" onclick="triggerEditMaintenance(${t.id})">
                    <i data-lucide="edit-3"></i> Edit Task
                  </button>
                  <button class="dropdown-item danger" onclick="triggerDeleteMaintenance(${t.id})">
                    <i data-lucide="trash-2"></i> Delete Work Order
                  </button>
                ` : ''}
              </div>
            </div>
          ` : '<span style="color: var(--text-muted); font-size: 12px;">Read-Only</span>'}
        </td>
      </tr>
    `;
  }).join('');

  refreshLucideIcons();
}

/**
 * Triggers modal to edit existing maintenance task
 */
export function triggerEditMaintenance(taskId) {
  const task = cachedMaintenanceTasks.find(t => String(t.id) === String(taskId));
  if (!task) return;

  document.getElementById('modal-maint-title').textContent = 'Edit Maintenance Work Order';
  document.getElementById('edit-maint-id').value = task.id;
  document.getElementById('maint-title').value = task.title || '';
  document.getElementById('maint-category').value = task.category || 'PLUMBING';
  document.getElementById('maint-priority').value = task.priority || 'MEDIUM';
  document.getElementById('maint-renter-id').value = task.renter_id || '';
  document.getElementById('maint-assigned-to').value = task.assigned_to || '';
  document.getElementById('maint-scheduled-date').value = task.scheduled_date || '';
  document.getElementById('maint-est-cost').value = task.estimated_cost ? (task.estimated_cost / 100) : '';
  document.getElementById('maint-description').value = task.description || '';

  openModal('modal-add-maintenance');
}

/**
 * Triggers modal to update status & actual cost of task
 */
export function triggerUpdateMaintenanceStatus(taskId) {
  const task = cachedMaintenanceTasks.find(t => String(t.id) === String(taskId));
  if (!task) return;

  document.getElementById('status-maint-id').value = task.id;
  document.getElementById('maint-update-status').value = task.status || 'PENDING';
  document.getElementById('maint-actual-cost').value = task.actual_cost ? (task.actual_cost / 100) : (task.estimated_cost ? (task.estimated_cost / 100) : '');
  document.getElementById('maint-completion-notes').value = task.notes || '';

  openModal('modal-update-maintenance-status');
}

/**
 * Deletes a maintenance task (Soft Delete)
 */
export async function triggerDeleteMaintenance(taskId) {
  if (!confirm('Are you sure you want to delete this maintenance task?')) return;

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient
      .from('maintenance_tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId);

    if (error) throw error;

    await loadMaintenancePage();
  } catch (err) {
    alert('Failed to delete task: ' + err.message);
  }
}

/**
 * Form Submit: Add / Edit Maintenance Task
 */
export async function submitMaintenanceForm(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  const currentUser = getCurrentUser();
  if (!supabaseClient) return;

  const editId = document.getElementById('edit-maint-id')?.value;
  const title = document.getElementById('maint-title')?.value.trim();
  const category = document.getElementById('maint-category')?.value || 'PLUMBING';
  const priority = document.getElementById('maint-priority')?.value || 'MEDIUM';
  const renterId = document.getElementById('maint-renter-id')?.value;
  const assignedTo = document.getElementById('maint-assigned-to')?.value.trim();
  const scheduledDate = document.getElementById('maint-scheduled-date')?.value || null;
  const estCostRupees = parseFloat(document.getElementById('maint-est-cost')?.value || 0);
  const description = document.getElementById('maint-description')?.value.trim();

  if (!title) {
    alert('Please enter a task title.');
    return;
  }

  const renterObj = cachedRentersList.find(r => String(r.id) === String(renterId));
  const unitId = renterObj ? renterObj.unit_id : null;

  const payload = {
    title,
    category,
    priority,
    renter_id: renterId ? parseInt(renterId) : null,
    unit_id: unitId ? parseInt(unitId) : null,
    assigned_to: assignedTo || null,
    scheduled_date: scheduledDate,
    estimated_cost: Math.round(estCostRupees * 100),
    description: description || null,
    updated_at: new Date().toISOString()
  };

  try {
    if (editId) {
      const { error } = await supabaseClient.from('maintenance_tasks').update(payload).eq('id', editId);
      if (error) throw error;
    } else {
      payload.reported_by = currentUser ? currentUser.id : null;
      payload.status = 'PENDING';
      const { error } = await supabaseClient.from('maintenance_tasks').insert([payload]);
      if (error) throw error;
    }

    closeModal('modal-add-maintenance');
    e.target.reset();
    await loadMaintenancePage();

  } catch (err) {
    alert('Failed to save maintenance task: ' + err.message);
  }
}

/**
 * Form Submit: Update Status & Cost
 */
export async function submitMaintenanceStatusForm(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  const taskId = document.getElementById('status-maint-id')?.value;
  const status = document.getElementById('maint-update-status')?.value || 'PENDING';
  const actualCostRupees = parseFloat(document.getElementById('maint-actual-cost')?.value || 0);
  const completionNotes = document.getElementById('maint-completion-notes')?.value.trim();

  if (!taskId) return;

  const payload = {
    status,
    actual_cost: Math.round(actualCostRupees * 100),
    notes: completionNotes || null,
    updated_at: new Date().toISOString()
  };

  if (status === 'COMPLETED') {
    payload.completed_at = new Date().toISOString();
  }

  try {
    const { error } = await supabaseClient.from('maintenance_tasks').update(payload).eq('id', taskId);
    if (error) throw error;

    closeModal('modal-update-maintenance-status');
    e.target.reset();
    await loadMaintenancePage();

  } catch (err) {
    alert('Failed to update status: ' + err.message);
  }
}

/**
 * Export Maintenance Tasks to CSV
 */
export function exportMaintenanceCSV() {
  const exportData = cachedMaintenanceTasks.map(t => {
    const renterObj = cachedRentersList.find(r => String(r.id) === String(t.renter_id));
    return {
      'Task ID': t.id,
      'Title': t.title,
      'Category': t.category,
      'Priority': t.priority,
      'Status': t.status,
      'Resident / Tenant': renterObj ? renterObj.name : 'Facility',
      'Assigned Technician': t.assigned_to || '-',
      'Scheduled Date': t.scheduled_date || '-',
      'Est Cost (INR)': (t.estimated_cost || 0) / 100,
      'Actual Cost (INR)': (t.actual_cost || 0) / 100,
      'Description': t.description || ''
    };
  });

  exportToCSV(exportData, `RentBill_Maintenance_Tasks_${new Date().toISOString().split('T')[0]}.csv`);
}
