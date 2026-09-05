// RentBill Pro — Digital Documents Vault & Deeds Storage (Pure Supabase)
import { getSupabaseClient } from '../core/config.js';
import { safeDelete } from '../core/db.js';
import { setUploadedDocBase64, getUploadedDocBase64 } from '../core/state.js';
import { escapeStr, renderEmptyState, openModal, refreshLucideIcons } from '../core/ui.js';

export function handleDocFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    setUploadedDocBase64(e.target.result);
    const urlInput = document.getElementById('doc-file-url');
    if (urlInput) urlInput.value = `[Attached: ${file.name}]`;
  };
  reader.readAsDataURL(file);
}

export async function openAddDocumentModal() {
  setUploadedDocBase64('');
  const form = document.getElementById('form-add-document');
  if (form) form.reset();
  const entityTypeSelect = document.getElementById('doc-entity-type');
  const defaultType = entityTypeSelect ? entityTypeSelect.value : 'GENERAL';
  await populateDocEntitySelect(defaultType);
  openModal('modal-add-document');
}

export async function populateDocEntitySelect(type) {
  const supabaseClient = getSupabaseClient();
  const select = document.getElementById('doc-entity-id');
  if (!select) return;
  select.innerHTML = '<option value="">Select Entity</option>';
  if (!supabaseClient || type === 'GENERAL') return;

  try {
    if (type === 'PROPERTY') {
      const { data } = await supabaseClient.from('properties').select('id, name').is('deleted_at', null);
      (data || []).forEach(item => {
        select.innerHTML += `<option value="${item.name}">Building: ${item.name}</option>`;
      });
    } else if (type === 'UNIT') {
      const { data } = await supabaseClient.from('units').select('*').is('deleted_at', null);
      (data || []).forEach(item => {
        const uName = item.unit_name || item.unit_number || `Unit #${item.id}`;
        select.innerHTML += `<option value="${uName}">Unit: ${uName}</option>`;
      });
    } else if (type === 'RENTER') {
      const { data } = await supabaseClient.from('renters').select('id, name').is('deleted_at', null);
      (data || []).forEach(item => {
        select.innerHTML += `<option value="${item.name}">Tenant: ${item.name}</option>`;
      });
    } else if (type === 'OWNER') {
      const { data } = await supabaseClient.from('owners').select('id, name').is('deleted_at', null);
      (data || []).forEach(item => {
        select.innerHTML += `<option value="${item.name}">Owner: ${item.name}</option>`;
      });
    }
  } catch (err) {
    console.error('Failed to populate entity select', err);
  }
}

export async function loadDocumentsPage() {
  const supabaseClient = getSupabaseClient();
  try {
    const tbody = document.getElementById('table-body-documents');
    if (!tbody) return;

    if (!supabaseClient) {
      renderDocumentsRows([]);
      return;
    }

    const { data: docs, error } = await supabaseClient
      .from('documents')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error || !docs) {
      renderDocumentsRows([]);
    } else {
      renderDocumentsRows(docs);
    }
  } catch (err) {
    console.warn('Documents load notice:', err);
    renderDocumentsRows([]);
  }
}

export function renderDocumentsRows(docs) {
  const tbody = document.getElementById('table-body-documents');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!docs || docs.length === 0) {
    tbody.innerHTML = renderEmptyState(6, 'No documents stored in vault yet');
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  docs.forEach(doc => {
    let statusBadge = '<span class="badge badge-success">ACTIVE</span>';
    if (doc.expiry_date) {
      if (doc.expiry_date < todayStr) {
        statusBadge = '<span class="badge badge-danger">EXPIRED</span>';
      } else {
        const diffDays = Math.ceil((new Date(doc.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) {
          statusBadge = '<span class="badge badge-warning">RENEW SOON</span>';
        }
      }
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Document Name">
        <strong>${doc.title}</strong>
        ${doc.notes ? `<div style="font-size: 11px; color: var(--text-muted);">${doc.notes}</div>` : ''}
      </td>
      <td data-label="Category"><span class="badge badge-secondary">${(doc.category || 'OTHER').replace(/_/g, ' ')}</span></td>
      <td data-label="Associated Entity">${doc.entity_id || doc.entity_type || 'General'}</td>
      <td data-label="Expiry Date">${doc.expiry_date || '-'}</td>
      <td data-label="Status">${statusBadge}</td>
      <td data-label="Actions">
        <div class="dropdown">
          <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
          <div class="dropdown-menu">
            ${doc.file_url ? `<button class="dropdown-item" onclick="viewDocument('${escapeStr(doc.file_url)}')"><i data-lucide="eye"></i> View Attachment</button>` : ''}
            <button class="dropdown-item danger" onclick="triggerDeleteDocument(${doc.id}, '${escapeStr(doc.title)}')"><i data-lucide="trash-2"></i> Delete Document</button>
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  refreshLucideIcons();
}

export function viewDocument(fileUrl) {
  if (!fileUrl) return;
  if (fileUrl.startsWith('data:')) {
    const win = window.open();
    win.document.write(`<iframe src="${fileUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
  } else {
    window.open(fileUrl, '_blank');
  }
}

export async function triggerDeleteDocument(id, title) {
  const supabaseClient = getSupabaseClient();
  if (!confirm(`Delete document "${title}"?`)) return;
  try {
    if (supabaseClient) {
      const { error } = await safeDelete(supabaseClient, 'documents', id);
      if (error) alert('Delete doc error: ' + error.message);
    }
  } catch (err) {
    alert('Delete doc error: ' + err.message);
  }
  loadDocumentsPage();
}

export function filterDocumentsTable() {
  const catFilter = document.getElementById('doc-filter-category').value;
  const searchVal = document.getElementById('doc-search-input').value.toLowerCase();
  const rows = document.querySelectorAll('#table-body-documents tr');

  rows.forEach(tr => {
    const text = tr.textContent.toLowerCase();
    const catCell = tr.querySelector('[data-label="Category"]');
    const matchesSearch = text.includes(searchVal);
    const matchesCat = catFilter === 'ALL' || (catCell && catCell.textContent.replace(/ /g, '_').includes(catFilter));
    tr.style.display = (matchesSearch && matchesCat) ? '' : 'none';
  });
}
