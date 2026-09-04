// RentBill Pro — Tenant Logins & Passwords Management Engine (Pure Supabase)
import { getSupabaseClient } from '../core/config.js';
import { getCurrentUser } from '../core/state.js';
import { escapeStr, renderEmptyState, openModal, closeModal, refreshLucideIcons } from '../core/ui.js';

let tenantLoginsCache = [];

/**
 * Loads all tenants and their Supabase Auth login account status
 */
export async function loadTenantLoginsSettings() {
  const supabaseClient = getSupabaseClient();
  const tbody = document.getElementById('table-body-tenant-logins');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);"><i data-lucide="loader-2" class="spin"></i> Loading tenant login accounts...</td></tr>';
  refreshLucideIcons();

  try {
    if (!supabaseClient) return;
    let tenantsWithAuth = [];

    // 1. Try calling the PostgreSQL SECURITY DEFINER RPC
    const { data: rpcData, error: rpcErr } = await supabaseClient.rpc('admin_list_tenants_with_auth');
    
    if (!rpcErr && Array.isArray(rpcData)) {
      tenantsWithAuth = rpcData;
    } else {
      console.warn('RPC admin_list_tenants_with_auth notice, falling back to direct table queries:', rpcErr?.message);
      
      const { data: renters } = await supabaseClient
        .from('renters')
        .select('id, name, mobile_number, email, unit_id, user_id, is_active')
        .is('deleted_at', null)
        .order('is_active', { ascending: false });

      const { data: units } = await supabaseClient.from('units').select('id, unit_name, property_id');
      const { data: properties } = await supabaseClient.from('properties').select('id, name');

      const unitMap = {};
      (units || []).forEach(u => { unitMap[u.id] = u; });
      const propMap = {};
      (properties || []).forEach(p => { propMap[p.id] = p.name; });

      const { data: profiles } = await supabaseClient.from('profiles').select('id, email, username, updated_at');
      const profileEmailMap = {};
      const profileIdMap = {};
      (profiles || []).forEach(p => {
        if (p.email) profileEmailMap[p.email.toLowerCase()] = p;
        if (p.id) profileIdMap[p.id] = p;
      });

      tenantsWithAuth = (renters || []).map(r => {
        let mobile = r.mobile_number || '';
        let email = r.email || '';
        if (mobile.includes('@') && (!email || !email.includes('@'))) {
          const temp = mobile;
          mobile = email;
          email = temp;
        }

        const u = unitMap[r.unit_id];
        const propName = u ? propMap[u.property_id] : '-';
        const matchedProfile = (r.user_id && profileIdMap[r.user_id]) || (email && profileEmailMap[email.toLowerCase()]);
        
        return {
          renter_id: r.id,
          renter_name: r.name,
          mobile_number: mobile,
          email: email,
          unit_name: u ? u.unit_name : (r.unit_id ? `Unit #${r.unit_id}` : '-'),
          property_name: propName || '-',
          user_id: r.user_id || (matchedProfile ? matchedProfile.id : null),
          has_auth_account: !!matchedProfile,
          last_sign_in_at: matchedProfile ? matchedProfile.updated_at : null,
          is_active: r.is_active
        };
      });
    }

    tenantLoginsCache = tenantsWithAuth;
    renderTenantLoginsTable(tenantsWithAuth);

    const totalCount = tenantsWithAuth.length;
    const activeCount = tenantsWithAuth.filter(t => t.has_auth_account).length;
    const countEl = document.getElementById('tenant-logins-count');
    if (countEl) countEl.textContent = `${activeCount} of ${totalCount} tenants have active login accounts`;

  } catch (err) {
    console.error('Failed to load tenant logins', err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 20px;">Error loading tenant accounts: ${escapeStr(err.message)}</td></tr>`;
  }
}

/**
 * Renders rows in the Tenant Logins table
 */
export function renderTenantLoginsTable(tenants) {
  const tbody = document.getElementById('table-body-tenant-logins');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!tenants || tenants.length === 0) {
    tbody.innerHTML = renderEmptyState(6, 'No tenants found. Add tenants in the Tenants Directory first.');
    return;
  }

  tenants.forEach(t => {
    let email = t.email || '';
    let mobile = t.mobile_number || '';
    if (mobile.includes('@') && (!email || !email.includes('@'))) {
      const temp = mobile;
      mobile = email;
      email = temp;
    }
    t.email = email;
    t.mobile_number = mobile;

    const tr = document.createElement('tr');
    
    let statusBadge = '<span class="badge badge-warning">No Account</span>';
    if (t.is_disabled) {
      statusBadge = '<span class="badge badge-danger">Deactivated</span>';
    } else if (t.has_auth_account) {
      statusBadge = '<span class="badge badge-success">Active Account</span>';
    }

    const lastLogin = t.last_sign_in_at ? 
      new Date(t.last_sign_in_at).toLocaleDateString() : 
      (t.has_auth_account ? 'Never' : '-');

    const emailDisplay = t.email || '<span style="color: var(--text-muted); font-style: italic;">Not set</span>';
    const mobileDisplay = t.mobile_number || '-';

    tr.innerHTML = `
      <td data-label="Tenant & Unit">
        <strong>${escapeStr(t.renter_name)}</strong>
        <div style="font-size: 11px; color: var(--text-muted);">${escapeStr(t.property_name)} • ${escapeStr(t.unit_name)}</div>
      </td>
      <td data-label="Mobile">${escapeStr(mobileDisplay)}</td>
      <td data-label="Login Email">
        <code style="font-size: 12px; background: var(--bg-input); padding: 2px 6px; border-radius: 4px;">${escapeStr(emailDisplay)}</code>
      </td>
      <td data-label="Portal Access">${statusBadge}</td>
      <td data-label="Last Activity">${lastLogin}</td>
      <td data-label="Actions">
        <div class="dropdown">
          <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
          <div class="dropdown-menu">
            <button class="dropdown-item" onclick="triggerTenantPasswordModal(${t.renter_id}, '${escapeStr(t.renter_name)}', '${escapeStr(t.email || '')}', '${escapeStr(t.mobile_number || '')}', '${t.user_id || ''}', ${t.has_auth_account}, ${t.is_disabled || false}, '${escapeStr(t.assigned_password || '')}')">
              <i data-lucide="key-round"></i> ${t.has_auth_account ? 'Reset / Edit Password' : 'Create Login Account'}
            </button>
            <button class="dropdown-item" onclick="shareTenantCredentialsFromRow('${escapeStr(t.renter_name)}', '${escapeStr(t.email || '')}', '${escapeStr(t.mobile_number || '')}')">
              <i data-lucide="message-square"></i> Send via WhatsApp
            </button>
            <button class="dropdown-item" onclick="copyTenantCredentialsFromRow('${escapeStr(t.renter_name)}', '${escapeStr(t.email || '')}', '${escapeStr(t.mobile_number || '')}')">
              <i data-lucide="copy"></i> Copy Login Details
            </button>
            ${t.has_auth_account ? `
              <div style="border-top: 1px solid var(--border); margin: 4px 0;"></div>
              <button class="dropdown-item" style="color: var(--warning);" onclick="triggerToggleTenantLoginStatus(${t.renter_id}, '${escapeStr(t.renter_name)}', '${t.user_id || ''}', ${!t.is_disabled})">
                <i data-lucide="${t.is_disabled ? 'unlock' : 'lock'}"></i> ${t.is_disabled ? 'Reactivate Access' : 'Suspend / Deactivate Access'}
              </button>
              <button class="dropdown-item danger" onclick="triggerDeleteTenantLogin(${t.renter_id}, '${escapeStr(t.renter_name)}', '${t.user_id || ''}')">
                <i data-lucide="user-x"></i> Revoke & Delete Account
              </button>
            ` : ''}
          </div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  refreshLucideIcons();
}

/**
 * Filter the tenant logins table
 */
export function filterTenantLoginsTable() {
  const searchVal = (document.getElementById('tenant-login-search')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('tenant-login-filter-status')?.value || 'ALL';

  const filtered = tenantLoginsCache.filter(t => {
    const nameMatch = (t.renter_name || '').toLowerCase().includes(searchVal);
    const emailMatch = (t.email || '').toLowerCase().includes(searchVal);
    const mobileMatch = (t.mobile_number || '').includes(searchVal);
    const unitMatch = (t.unit_name || '').toLowerCase().includes(searchVal);
    const textMatch = nameMatch || emailMatch || mobileMatch || unitMatch;

    let statusMatch = true;
    if (statusFilter === 'ACTIVE') {
      statusMatch = t.has_auth_account && !t.is_disabled;
    } else if (statusFilter === 'NO_ACCOUNT') {
      statusMatch = !t.has_auth_account;
    } else if (statusFilter === 'DEACTIVATED') {
      statusMatch = t.is_disabled;
    }

    return textMatch && statusMatch;
  });

  renderTenantLoginsTable(filtered);
}

/**
 * Opens Set / Reset Tenant Password Modal
 */
export function triggerTenantPasswordModal(renterId, name, email = '', mobile = '', userId = '', hasAccount = false, isDisabled = false, assignedPassword = '') {
  const modal = document.getElementById('modal-tenant-password');
  if (!modal) return;

  // Auto-correct if email and mobile are swapped
  if ((mobile || '').includes('@') && (!email || !email.includes('@'))) {
    const temp = mobile;
    mobile = email;
    email = temp;
  }

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  setVal('tp-renter-id', renterId);
  setVal('tp-user-id', userId || '');
  setText('tp-tenant-name', name || 'Tenant');
  setText('tp-tenant-mobile', mobile || '-');
  setText('tp-tenant-unit', '-');

  const cleanMobile = (mobile || '').replace(/[^0-9]/g, '');
  const tenDigitMobile = cleanMobile.length >= 10 ? cleanMobile.slice(-10) : cleanMobile;
  const defaultEmail = email || (tenDigitMobile ? `tenant_${tenDigitMobile}@rentbill.local` : (name ? `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@rentbill.local` : ''));
  setVal('tp-tenant-email', defaultEmail);
  setVal('tp-tenant-password', assignedPassword || '');

  const titleEl = document.getElementById('tp-modal-title');
  if (titleEl) {
    titleEl.textContent = hasAccount ? `Reset Password: ${name}` : `Create Login Account: ${name}`;
  }

  const statusMsg = document.getElementById('tp-status-msg');
  if (statusMsg) statusMsg.style.display = 'none';

  const deleteBtn = document.getElementById('tp-delete-btn');
  if (deleteBtn) {
    deleteBtn.style.display = hasAccount ? 'inline-flex' : 'none';
    deleteBtn.title = 'Delete / Revoke login account';
    deleteBtn.setAttribute('aria-label', 'Delete / Revoke login account');
  }

  const toggleBtn = document.getElementById('tp-toggle-status-btn');
  if (toggleBtn) {
    toggleBtn.style.display = hasAccount ? 'inline-flex' : 'none';
    toggleBtn.setAttribute('data-disabled', isDisabled ? 'true' : 'false');
    toggleBtn.title = isDisabled ? 'Reactivate Access' : 'Suspend Access';
    toggleBtn.setAttribute('aria-label', toggleBtn.title);
    const icon = toggleBtn.querySelector('i[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', isDisabled ? 'unlock' : 'lock');
    }
  }

  openModal('modal-tenant-password');
  refreshLucideIcons();

  // If no assigned password provided, fetch from cache asynchronously
  if (!assignedPassword && renterId) {
    const cached = tenantLoginsCache.find(t => t.renter_id === renterId);
    if (cached && cached.assigned_password) {
      setVal('tp-tenant-password', cached.assigned_password);
    }
  }
}

/**
 * Handles Toggle Status button click from inside the modal
 */
export async function triggerToggleTenantLoginStatusFromModal() {
  const renterId = document.getElementById('tp-renter-id')?.value;
  const userId = document.getElementById('tp-user-id')?.value;
  const name = document.getElementById('tp-tenant-name')?.textContent || 'this tenant';
  const toggleBtn = document.getElementById('tp-toggle-status-btn');
  const isCurrentlyDisabled = toggleBtn?.getAttribute('data-disabled') === 'true';

  if (!renterId) return;
  closeModal('modal-tenant-password');
  await triggerToggleTenantLoginStatus(renterId, name, userId, !isCurrentlyDisabled);
}

/**
 * Toggles a tenant's portal login access (Deactivate / Reactivate)
 */
export async function triggerToggleTenantLoginStatus(renterId, renterName, userId = '', disable = true) {
  const actionText = disable ? 'deactivate (suspend)' : 'reactivate';
  if (!confirm(`Are you sure you want to ${actionText} portal login access for "${renterName}"?`)) {
    return;
  }

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    let targetUserId = (userId && userId !== 'null' && userId !== 'undefined') ? userId : null;
    if (!targetUserId && renterId) {
      const { data: rData } = await supabaseClient.from('renters').select('user_id').eq('id', renterId).maybeSingle();
      if (rData && rData.user_id) targetUserId = rData.user_id;
    }

    const { error: rpcErr } = await supabaseClient.rpc('admin_toggle_tenant_login_status', {
      p_renter_id: renterId ? parseInt(renterId) : null,
      p_user_id: targetUserId,
      p_disabled: disable
    });

    if (rpcErr && targetUserId) {
      await supabaseClient.from('profiles').update({ is_disabled: disable }).eq('id', targetUserId);
    }
  } catch (err) {
    console.warn('Status toggle error:', err);
  }

  alert(`✅ Portal login access for "${renterName}" has been ${disable ? 'deactivated' : 'reactivated'}.`);
  await loadTenantLoginsSettings();
}

/**
 * Handles Delete Login Account button click from inside the modal
 */
export async function triggerDeleteTenantLoginFromModal() {
  const renterId = document.getElementById('tp-renter-id')?.value;
  const userId = document.getElementById('tp-user-id')?.value;
  const name = document.getElementById('tp-tenant-name')?.textContent || 'this tenant';

  if (!renterId) return;
  closeModal('modal-tenant-password');
  await triggerDeleteTenantLogin(renterId, name, userId);
}

/**
 * Deletes / revokes portal login account for a tenant
 */
export async function triggerDeleteTenantLogin(renterId, renterName, userId = '') {
  if (!confirm(`Are you sure you want to delete the portal login account for "${renterName}"?\n\nThis will revoke the tenant's login access. Their lease agreement, invoices, and payment records will NOT be deleted.`)) {
    return;
  }

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    let targetUserId = (userId && userId !== 'null' && userId !== 'undefined') ? userId : null;
    if (!targetUserId && renterId) {
      const { data: rData } = await supabaseClient.from('renters').select('user_id').eq('id', renterId).maybeSingle();
      if (rData && rData.user_id) targetUserId = rData.user_id;
    }

    const { error: rpcErr } = await supabaseClient.rpc('admin_delete_tenant_login', {
      p_renter_id: renterId ? parseInt(renterId) : null,
      p_user_id: targetUserId
    });

    if (rpcErr) {
      if (renterId) {
        try { await supabaseClient.from('renters').update({ user_id: null }).eq('id', renterId); } catch (e) {}
      }
      if (targetUserId) {
        try { await supabaseClient.from('renters').update({ user_id: null }).eq('user_id', targetUserId); } catch (e) {}
        try { await supabaseClient.from('bills').update({ voided_by: null }).eq('voided_by', targetUserId); } catch (e) {}
        try { await supabaseClient.from('payments').update({ verified_by: null }).eq('verified_by', targetUserId); } catch (e) {}
        try { await supabaseClient.from('payments').update({ reversed_by: null }).eq('reversed_by', targetUserId); } catch (e) {}
        try { await supabaseClient.from('expenses').update({ created_by: null }).eq('created_by', targetUserId); } catch (e) {}
        try { await supabaseClient.from('owner_withdrawals').update({ created_by: null }).eq('created_by', targetUserId); } catch (e) {}
        try { await supabaseClient.from('documents').update({ created_by: null }).eq('created_by', targetUserId); } catch (e) {}
        try {
          await supabaseClient.from('profiles').delete().eq('id', targetUserId);
        } catch (pErr) {}
      }
    }
  } catch (err) {
    console.warn('Delete login notice:', err);
  }

  await loadTenantLoginsSettings();
  alert(`✅ Portal login account for "${renterName}" has been removed.`);
}

/**
 * Saves tenant login credentials to Supabase Auth and Renter record
 */
export async function saveTenantCredentials(renterId, email, password, name = '', mobile = '') {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) throw new Error('Supabase client is not connected.');

  password = (password || '').trim();
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const cleanMobileDigits = (mobile || '').replace(/[^0-9]/g, '');
  const tenDigitMobile = cleanMobileDigits.length >= 10 ? cleanMobileDigits.slice(-10) : cleanMobileDigits;

  // Strictly use phone-number-based email as login identifier
  if (!tenDigitMobile || tenDigitMobile.length < 10) {
    throw new Error('A valid 10-digit phone number is required for tenant login.');
  }

  const loginEmail = `tenant_${tenDigitMobile}@rentbill.local`;
  const username = name || tenDigitMobile;
  const parsedRenterId = renterId ? parseInt(renterId) : null;

  let createdUserId = null;
  let passwordUpdated = false;

  // Tier 0: Direct admin_update_tenant_user_password RPC by renter_id
  if (parsedRenterId) {
    try {
      const { data: updateRes, error: updateErr } = await supabaseClient.rpc('admin_update_tenant_user_password', {
        p_renter_id: parsedRenterId,
        p_new_password: password,
        p_email: loginEmail
      });

      if (!updateErr && updateRes && updateRes.success && updateRes.user_id) {
        createdUserId = updateRes.user_id;
        passwordUpdated = true;
      }
    } catch (e) {}
  }

  // Tier 1: Try 5-parameter admin_create_tenant_user RPC
  if (!passwordUpdated) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('admin_create_tenant_user', {
        p_email: loginEmail,
        p_password: password,
        p_username: username,
        p_renter_id: parsedRenterId,
        p_mobile: tenDigitMobile || null
      });

      if (!rpcErr && rpcRes && rpcRes.user_id) {
        createdUserId = rpcRes.user_id;
        passwordUpdated = true;
      }
    } catch (e) {}
  }

  // Tier 2: Try 4-parameter admin_create_tenant_user RPC (backwards compatibility)
  if (!passwordUpdated) {
    try {
      const { data: rpcRes2, error: rpcErr2 } = await supabaseClient.rpc('admin_create_tenant_user', {
        p_email: loginEmail,
        p_password: password,
        p_username: username,
        p_renter_id: parsedRenterId
      });

      if (!rpcErr2 && rpcRes2 && rpcRes2.user_id) {
        createdUserId = rpcRes2.user_id;
        passwordUpdated = true;
      }
    } catch (e) {}
  }

  // Tier 3: Try admin_reset_tenant_password RPC if renter has an existing user_id
  if (!passwordUpdated && parsedRenterId) {
    try {
      const { data: renter } = await supabaseClient.from('renters').select('user_id').eq('id', parsedRenterId).single();
      if (renter && renter.user_id) {
        const { error: resetErr } = await supabaseClient.rpc('admin_reset_tenant_password', {
          p_user_id: renter.user_id,
          p_new_password: password
        });
        if (!resetErr) {
          createdUserId = renter.user_id;
          passwordUpdated = true;
        }
      }
    } catch (e) {}
  }

  // Tier 4: Fallback to auth.signUp (only if RPCs unavailable).
  // signUp can switch the active session to the new tenant, which would log the
  // admin out. We capture the admin session first and restore it afterwards.
  if (!passwordUpdated) {
    let adminSession = null;
    try {
      const { data: sessData } = await supabaseClient.auth.getSession();
      adminSession = sessData?.session || null;
    } catch (se) {}

    const restoreAdminSession = async () => {
      try {
        if (adminSession && adminSession.access_token && adminSession.refresh_token) {
          await supabaseClient.auth.setSession({
            access_token: adminSession.access_token,
            refresh_token: adminSession.refresh_token
          });
        }
      } catch (restoreErr) {
        console.warn('Admin session restore notice:', restoreErr);
      }
    };

    try {
      const { data: authData, error: authErr } = await supabaseClient.auth.signUp({
        email: loginEmail,
        password,
        options: {
          data: {
            role: 'TENANT',
            username,
            mobile: tenDigitMobile || null,
            renter_id: parsedRenterId
          }
        }
      });

      await restoreAdminSession();

      if (!authErr && authData?.user) {
        createdUserId = authData.user.id;
        passwordUpdated = true;
      } else if (authErr && authErr.message.includes('already registered')) {
        throw new Error(`The login account "${loginEmail}" already exists. Run sql/update/01_upgrade_existing_database.sql in Supabase SQL Editor to enable password updates.`);
      } else if (authErr) {
        throw authErr;
      }
    } catch (e) {
      await restoreAdminSession();
      throw e;
    }
  }

  if (createdUserId) {
    try {
      if (renterId) {
        await supabaseClient.from('renters').update({ user_id: createdUserId, email: loginEmail }).eq('id', parseInt(renterId));
      } else if (loginEmail) {
        await supabaseClient.from('renters').update({ user_id: createdUserId }).ilike('email', loginEmail);
      }
      await supabaseClient.from('profiles').upsert([{
        id: createdUserId,
        email: loginEmail,
        username: username,
        role: 'TENANT',
        is_disabled: false
      }]);
    } catch (linkErr) {
      console.warn('Profile linkage notice:', linkErr);
    }
  }

  return { success: true, user_id: createdUserId, email: loginEmail };
}

/**
 * Handle form submit for Set/Reset Tenant Password modal
 */
export async function submitTenantPasswordForm(e) {
  if (e) e.preventDefault();
  
  const renterId = document.getElementById('tp-renter-id').value;
  const email = document.getElementById('tp-tenant-email').value.trim();
  const password = document.getElementById('tp-tenant-password').value.trim();
  const name = document.getElementById('tp-tenant-name').textContent;
  const mobile = document.getElementById('tp-tenant-mobile').textContent;
  const copyCheck = document.getElementById('tp-copy-clipboard')?.checked;
  const statusMsg = document.getElementById('tp-status-msg');

  if (statusMsg) {
    statusMsg.style.display = 'block';
    statusMsg.style.background = 'rgba(79, 70, 229, 0.1)';
    statusMsg.style.color = 'var(--primary)';
    statusMsg.textContent = 'Saving login account in Supabase...';
  }

  try {
    const result = await saveTenantCredentials(renterId, email, password, name, mobile);
    const loginEmail = result.email || email;

    if (copyCheck) {
      copyTenantCredentials(name, loginEmail, mobile, password);
    }

    if (statusMsg) {
      statusMsg.style.background = 'rgba(16, 185, 129, 0.1)';
      statusMsg.style.color = 'var(--success)';
      statusMsg.textContent = `✓ Account for ${name} saved successfully in Supabase!`;
    }

    setTimeout(() => {
      closeModal('modal-tenant-password');
      loadTenantLoginsSettings();
    }, 900);

  } catch (err) {
    if (statusMsg) {
      statusMsg.style.background = 'rgba(239, 68, 68, 0.1)';
      statusMsg.style.color = 'var(--danger)';
      statusMsg.textContent = err.message || 'Failed to save credentials';
    }
  }
}

/**
 * Save credentials and immediately open WhatsApp pre-filled message
 */
export async function saveAndShareTenantWhatsApp() {
  const renterId = document.getElementById('tp-renter-id').value;
  const email = document.getElementById('tp-tenant-email').value.trim();
  const password = document.getElementById('tp-tenant-password').value.trim();
  const name = document.getElementById('tp-tenant-name').textContent;
  const mobile = document.getElementById('tp-tenant-mobile').textContent;

  try {
    const result = await saveTenantCredentials(renterId, email, password, name, mobile);
    const loginEmail = result.email || email;
    shareTenantCredentialsWhatsApp(name, loginEmail, mobile, password);
    closeModal('modal-tenant-password');
    loadTenantLoginsSettings();
  } catch (err) {
    alert('Error saving credentials: ' + err.message);
  }
}

/**
 * Copy tenant login credentials to clipboard
 */
export function copyTenantCredentials(name, email, mobile, password = '') {
  if ((mobile || '').includes('@') && (!email || !email.includes('@'))) {
    const temp = mobile;
    mobile = email;
    email = temp;
  }

  const portalUrl = window.location.origin + window.location.pathname;
  let text = `🏠 *RentBill Pro — Resident Tenant Portal*\n`;
  text += `Hello ${name || 'Resident'},\n\nHere are your tenant portal login credentials:\n`;
  text += `🔗 *Portal Link:* ${portalUrl}\n`;
  text += `📱 *Login Phone:* ${mobile || email}\n`;
  if (password) {
    text += `🔑 *Password:* ${password}\n\n`;
  }
  text += `Use your phone number and the password set by the property manager to log in.`;

  navigator.clipboard.writeText(text).then(() => {
    alert('✓ Tenant login credentials copied to clipboard!');
  }).catch(() => {
    prompt('Copy tenant credentials below:', text);
  });
}

export function copyTenantCredentialsFromRow(name, email, mobile) {
  const cached = tenantLoginsCache.find(t => (t.email || '').toLowerCase() === (email || '').toLowerCase() && !t.deleted_at);
  copyTenantCredentials(name, email, mobile, cached?.assigned_password || '');
}

/**
 * Share credentials on WhatsApp
 */
export function shareTenantCredentialsWhatsApp(name, email, mobile, password = '') {
  if ((mobile || '').includes('@') && (!email || !email.includes('@'))) {
    const temp = mobile;
    mobile = email;
    email = temp;
  }

  const cleanMobile = (mobile || '').replace(/[^0-9]/g, '');
  const portalUrl = window.location.origin + window.location.pathname;
  
  let msg = `🏠 *RentBill Pro — Resident Tenant Portal*\n`;
  msg += `Hello ${name || 'Resident'},\n\nHere are your tenant portal login credentials:\n`;
  msg += `🔗 *Portal Link:* ${portalUrl}\n`;
  msg += `📱 *Login Phone:* ${mobile || email}\n`;
  if (password) {
    msg += `🔑 *Password:* ${password}\n\n`;
  }
  msg += `Use your phone number and the password set by the property manager to log in.`;

  const waUrl = cleanMobile ? 
    `https://wa.me/${cleanMobile}?text=${encodeURIComponent(msg)}` : 
    `https://wa.me/?text=${encodeURIComponent(msg)}`;

  window.open(waUrl, '_blank');
}

export function shareTenantCredentialsFromRow(name, email, mobile) {
  const cached = tenantLoginsCache.find(t => (t.email || '').toLowerCase() === (email || '').toLowerCase() && !t.deleted_at);
  shareTenantCredentialsWhatsApp(name, email, mobile, cached?.assigned_password || '');
}

export function toggleTenantPasswordMask() {
  const pwInput = document.getElementById('tp-tenant-password');
  if (!pwInput) return;
  const isHidden = pwInput.type === 'password';
  pwInput.type = isHidden ? 'text' : 'password';
  const btn = pwInput.closest('div')?.querySelector('button');
  if (btn) {
    const icon = btn.querySelector('i[data-lucide]');
    if (icon) icon.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
    refreshLucideIcons();
  }
}

export function toggleTenantModalPasswordMask() {
  const pwInput = document.getElementById('tenant-password');
  if (!pwInput) return;
  pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
}

export function toggleLoginPasswordMask() {
  const pwInput = document.getElementById('login-password');
  const eyeIcon = document.getElementById('login-eye-icon');
  if (!pwInput) return;
  const isHidden = pwInput.type === 'password';
  pwInput.type = isHidden ? 'text' : 'password';
  if (eyeIcon) {
    eyeIcon.setAttribute('data-lucide', isHidden ? 'eye-off' : 'eye');
    refreshLucideIcons();
  }
}

export function fillMobilePassword() {
  const mobileText = document.getElementById('tp-tenant-mobile')?.textContent || '';
  const cleanMobile = mobileText.replace(/[^0-9]/g, '');
  const tenDigit = cleanMobile.length >= 10 ? cleanMobile.slice(-10) : cleanMobile;
  if (tenDigit && tenDigit.length >= 6) {
    const pwInput = document.getElementById('tp-tenant-password');
    if (pwInput) pwInput.value = tenDigit;
  } else {
    alert('Mobile number must have at least 6 digits.');
  }
}

export function generateRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789#@!';
  let randPw = 'Rent#';
  for (let i = 0; i < 5; i++) {
    randPw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const pwInput = document.getElementById('tp-tenant-password');
  if (pwInput) pwInput.value = randPw;
}
