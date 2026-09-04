// RentBill Pro — Unified User Logins & Access Management (All Roles)
import { getSupabaseClient } from '../core/config.js';
import { getCurrentUser } from '../core/state.js';
import { escapeStr, renderEmptyState, openModal, closeModal, refreshLucideIcons } from '../core/ui.js';

let userLoginsCache = [];

const ROLE_BADGES = {
  ADMIN: '<span class="badge badge-danger">Admin</span>',
  STAFF: '<span class="badge badge-success">Staff</span>',
  AUDITOR: '<span class="badge badge-warning">Auditor</span>',
  TENANT: '<span class="badge badge-info">Tenant</span>'
};

/**
 * Loads all users (all roles) and their auth account status
 */
export async function loadUserLoginsSettings() {
  const supabaseClient = getSupabaseClient();
  const tbody = document.getElementById('table-body-user-logins');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);"><i data-lucide="loader-2" class="spin"></i> Loading user accounts...</td></tr>';
  refreshLucideIcons();

  try {
    if (!supabaseClient) return;

    let users = [];
    const { data: rpcData, error: rpcErr } = await supabaseClient.rpc('admin_list_all_users');

    if (!rpcErr && Array.isArray(rpcData)) {
      users = rpcData;
    } else if (rpcErr && rpcErr.message && rpcErr.message.includes('relation "public.admin_list_all_users" does not exist')) {
      console.warn('RPC admin_list_all_users not found, falling back to direct profiles query.');
      const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('id, username, email, role, is_disabled, created_at, updated_at')
        .order('role');

      users = (profiles || []).map(p => ({
        user_id: p.id,
        username: p.username,
        email: p.email,
        role: p.role,
        is_disabled: !!p.is_disabled,
        created_at: p.created_at,
        updated_at: p.updated_at
      }));
    } else if (rpcErr) {
      console.warn('RPC admin_list_all_users notice:', rpcErr.message);
    }

    userLoginsCache = users;
    renderUserLoginsTable(users);

    const countEl = document.getElementById('user-logins-count');
    if (countEl) {
      const activeCount = users.filter(u => !u.is_disabled).length;
      countEl.textContent = `${activeCount} of ${users.length} user accounts active`;
    }

  } catch (err) {
    console.error('Failed to load user logins', err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger); padding: 20px;">Error loading user accounts: ${escapeStr(err.message)}</td></tr>`;
  }
}

/**
 * Renders rows in the unified User Logins table
 */
export function renderUserLoginsTable(users) {
  const tbody = document.getElementById('table-body-user-logins');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!users || users.length === 0) {
    tbody.innerHTML = renderEmptyState(6, 'No user accounts found.');
    return;
  }

  const currentUserId = getCurrentUser()?.id;

  users.forEach(u => {
    const roleBadge = ROLE_BADGES[u.role] || '<span class="badge badge-secondary">Unknown</span>';

    let statusBadge = '<span class="badge badge-success">Active</span>';
    if (u.is_disabled) {
      statusBadge = '<span class="badge badge-danger">Deactivated</span>';
    }

    const lastActivity = u.last_sign_in_at || u.updated_at;
    const lastLoginDisplay = lastActivity ?
      new Date(lastActivity).toLocaleDateString() + ' ' + new Date(lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
      'Never';

    const emailDisplay = u.email || '<span style="color: var(--text-muted); font-style: italic;">Not set</span>';
    const usernameDisplay = u.username || '<span style="color: var(--text-muted); font-style: italic;">-</span>';
    const isSelf = currentUserId && u.user_id === currentUserId;

    // Role change menu: allowed roles excluding the target's current role
    const otherRoles = ['ADMIN', 'STAFF', 'AUDITOR'].filter(r => r !== u.role);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="User & Role">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="width: 34px; height: 34px; border-radius: 10px; background: rgba(79, 70, 229, 0.12); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px; flex-shrink: 0;">${escapeStr((usernameDisplay && usernameDisplay !== '-' ? usernameDisplay[0] : 'U').toUpperCase())}</span>
          <div>
            <strong>${escapeStr(usernameDisplay)}${isSelf ? ' <span class="badge badge-secondary" style="font-size:10px;">You</span>' : ''}</strong>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${roleBadge}</div>
          </div>
        </div>
      </td>
      <td data-label="Email">
        <code style="font-size: 12px; background: var(--bg-input); padding: 2px 6px; border-radius: 4px;">${escapeStr(emailDisplay)}</code>
      </td>
      <td data-label="Status">${statusBadge}</td>
      <td data-label="Last Activity">${lastLoginDisplay}</td>
      <td data-label="Actions">
        <div class="dropdown">
          <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
          <div class="dropdown-menu">
            <button class="dropdown-item" onclick="openEditUserModal('${u.user_id}', '${escapeStr(u.username || '')}', '${escapeStr(u.email || '')}', '${u.role}', ${!!u.is_disabled})">
              <i data-lucide="settings-2"></i> Edit Account
            </button>
            <button class="dropdown-item" onclick="triggerResetUserPassword('${u.user_id}', '${escapeStr(u.username || 'User')}')">
              <i data-lucide="key-round"></i> Reset Password
            </button>
            ${otherRoles.length > 0 && !isSelf ? `
              <div style="border-top: 1px solid var(--border); margin: 4px 0;"></div>
              <button class="dropdown-item" onclick="triggerChangeUserRole('${u.user_id}', '${escapeStr(u.username || 'User')}', '${u.role}', '${otherRoles[0]}')">
                <i data-lucide="refresh-cw"></i> Change Role → ${otherRoles[0]}
              </button>
            ` : ''}
            ${!isSelf ? `
              <div style="border-top: 1px solid var(--border); margin: 4px 0;"></div>
              <button class="dropdown-item" style="color: var(--warning);" onclick="triggerToggleUserStatus('${u.user_id}', '${escapeStr(u.username || 'User')}', ${!u.is_disabled})">
                <i data-lucide="${u.is_disabled ? 'unlock' : 'lock'}"></i> ${u.is_disabled ? 'Reactivate Account' : 'Deactivate Account'}
              </button>
              <button class="dropdown-item danger" onclick="triggerDeleteUser('${u.user_id}', '${escapeStr(u.username || 'User')}', '${u.role}')">
                <i data-lucide="trash-2"></i> Delete Account
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
 * Filter the user logins table by search text and role
 */
export function filterUserLoginsTable() {
  const searchVal = (document.getElementById('search-user-logins')?.value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('filter-user-role')?.value || 'ALL';

  const filtered = userLoginsCache.filter(u => {
    const nameMatch = (u.username || '').toLowerCase().includes(searchVal);
    const emailMatch = (u.email || '').toLowerCase().includes(searchVal);
    const textMatch = nameMatch || emailMatch;

    let roleMatch = true;
    if (roleFilter !== 'ALL' && roleFilter !== 'ALL_ROLES') {
      roleMatch = u.role === roleFilter;
    }

    return textMatch && roleMatch;
  });

  renderUserLoginsTable(filtered);
}

/**
 * Opens the Add/Edit User modal
 */
export function openCreateUserModal() {
  const modal = document.getElementById('modal-add-edit-user');
  if (!modal) return;

  document.getElementById('eu-user-id').value = '';
  document.getElementById('eu-title').textContent = 'Add New User Account';
  document.getElementById('eu-username').value = '';
  document.getElementById('eu-email').value = '';
  document.getElementById('eu-password').value = '';
  document.getElementById('eu-password-group').style.display = '';
  document.getElementById('eu-role').value = 'STAFF';
  document.getElementById('eu-password-label').textContent = 'Password *';
  document.getElementById('eu-password').required = true;
  document.getElementById('eu-status-msg').style.display = 'none';

  openModal('modal-add-edit-user');
  refreshLucideIcons();
}

/**
 * Opens the Add/Edit User modal in edit mode
 */
export function openEditUserModal(userId, username, email, role = 'STAFF', isDisabled = false) {
  const modal = document.getElementById('modal-add-edit-user');
  if (!modal) return;

  document.getElementById('eu-user-id').value = userId || '';
  document.getElementById('eu-title').textContent = `Edit Account: ${username || 'User'}`;
  document.getElementById('eu-username').value = username || '';
  document.getElementById('eu-email').value = email || '';
  document.getElementById('eu-password').value = '';
  document.getElementById('eu-password-group').style.display = 'none';
  document.getElementById('eu-role').value = role || 'STAFF';
  document.getElementById('eu-password').required = false;
  document.getElementById('eu-status-msg').style.display = 'none';

  openModal('modal-add-edit-user');
  refreshLucideIcons();
}

/**
 * Submits the Add/Edit User form (create or update)
 */
export async function submitUserForm(e) {
  if (e) e.preventDefault();

  const userId = document.getElementById('eu-user-id').value;
  const username = document.getElementById('eu-username').value.trim();
  const email = document.getElementById('eu-email').value.trim();
  const password = document.getElementById('eu-password').value.trim();
  const role = document.getElementById('eu-role').value;
  const statusMsg = document.getElementById('eu-status-msg');

  if (!email || !email.includes('@')) {
    if (statusMsg) {
      statusMsg.style.display = 'block';
      statusMsg.style.background = 'rgba(239, 68, 68, 0.1)';
      statusMsg.style.color = 'var(--danger)';
      statusMsg.textContent = 'A valid email address is required.';
    }
    return;
  }

  if (statusMsg) {
    statusMsg.style.display = 'block';
    statusMsg.style.background = 'rgba(79, 70, 229, 0.1)';
    statusMsg.style.color = 'var(--primary)';
    statusMsg.textContent = 'Saving account...';
  }

  try {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) throw new Error('Supabase client is not connected.');

    if (userId) {
      // Edit mode — update existing account
      // 1. Update role via dedicated RPC (never touches password)
      try {
        const { error: roleErr } = await supabaseClient.rpc('admin_change_user_role', {
          p_user_id: userId,
          p_new_role: role
        });
        if (roleErr) {
          // Fallback: direct profile update if RPC isn't deployed
          await supabaseClient.from('profiles').update({ role }).eq('id', userId);
        }
      } catch (innerErr) {
        try {
          await supabaseClient.from('profiles').update({ role }).eq('id', userId);
        } catch (finalErr) {
          throw new Error('Failed to update role: ' + finalErr.message);
        }
      }

      // 2. Update display name and email on profile
      try {
        await supabaseClient.from('profiles').update({ username, email }).eq('id', userId);
      } catch (nameErr) {}

      // 3. Reset password ONLY if a new one was provided
      if (password && password.length >= 6) {
        try {
          const { error: pwErr } = await supabaseClient.rpc('admin_update_user_password', {
            p_user_id: userId,
            p_new_password: password
          });
          if (pwErr) {
            try {
              await supabaseClient.rpc('admin_reset_tenant_password', {
                p_user_id: userId,
                p_new_password: password
              });
            } catch (fb2) {
              // ignore password fallback failures
            }
          }
        } catch (pwCatch) {}
      }

      if (statusMsg) {
        statusMsg.style.background = 'rgba(16, 185, 129, 0.1)';
        statusMsg.style.color = 'var(--success)';
        statusMsg.textContent = '✓ Account updated successfully!';
      }
    } else {
      // Create mode
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
      }
      const { data, error } = await supabaseClient.rpc('admin_create_user', {
        p_email: email,
        p_password,
        p_username: username,
        p_role: role
      });

      if (error) throw new Error(error.message);

      if (statusMsg) {
        statusMsg.style.background = 'rgba(16, 185, 129, 0.1)';
        statusMsg.style.color = 'var(--success)';
        statusMsg.textContent = `✓ ${role} account created successfully!`;
      }
    }

    setTimeout(() => {
      closeModal('modal-add-edit-user');
      loadUserLoginsSettings();
    }, 900);

  } catch (err) {
    if (statusMsg) {
      statusMsg.style.background = 'rgba(239, 68, 68, 0.1)';
      statusMsg.style.color = 'var(--danger)';
      statusMsg.textContent = err.message || 'Failed to save account';
    }
  }
}

/**
 * Reset a user's password
 */
export async function triggerResetUserPassword(userId, username) {
  const newPassword = prompt(
    `Reset password for "${username}".\n\nEnter a new password (minimum 6 characters):`,
    'NewPass#123'
  );

  if (!newPassword) return;

  if (newPassword.length < 6) {
    alert('Password must be at least 6 characters long.');
    return;
  }

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient.rpc('admin_update_user_password', {
      p_user_id: userId,
      p_new_password: newPassword
    });

    if (error) {
      // Fallback: try direct auth admin-less update via profiles is not possible,
      // so try admin_reset_tenant_password RPC as a fallback
      const fallback = await supabaseClient.rpc('admin_reset_tenant_password', {
        p_user_id: userId,
        p_new_password: newPassword
      });
      if (fallback.error) throw new Error(error.message);
    }

    alert(`✅ Password for "${username}" has been reset.`);
  } catch (err) {
    alert('Failed to reset password: ' + err.message);
  }
}

/**
 * Change a user's role
 */
export async function triggerChangeUserRole(userId, username, currentRole, newRole) {
  if (!confirm(`Change role of "${username}" from ${currentRole} to ${newRole}?`)) {
    return;
  }

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient.rpc('admin_change_user_role', {
      p_user_id: userId,
      p_new_role: newRole
    });

    if (error) {
      try {
        await supabaseClient.from('profiles').update({ role: newRole }).eq('id', userId);
      } catch (innerErr) {
        throw new Error(error.message);
      }
    }

    alert(`✅ "${username}" is now ${newRole}.`);
    await loadUserLoginsSettings();
  } catch (err) {
    alert('Failed to change role: ' + err.message);
  }
}

/**
 * Toggle a user's active/deactivated status
 */
export async function triggerToggleUserStatus(userId, username, disable) {
  const actionText = disable ? 'deactivate' : 'reactivate';
  if (!confirm(`Are you sure you want to ${actionText} the account for "${username}"?`)) {
    return;
  }

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient.rpc('admin_toggle_user_status', {
      p_user_id: userId,
      p_disabled: disable
    });

    if (error) {
      try {
        await supabaseClient.from('profiles').update({ is_disabled: disable }).eq('id', userId);
      } catch (innerErr) {
        throw new Error(error.message);
      }
    }

    alert(`✅ Account for "${username}" has been ${disable ? 'deactivated' : 'reactivated'}.`);
    await loadUserLoginsSettings();
  } catch (err) {
    alert('Failed to update account status: ' + err.message);
  }
}

/**
 * Delete a user account
 */
export async function triggerDeleteUser(userId, username, role) {
  if (!confirm(`Are you sure you want to permanently delete the ${role} account for "${username}"?\n\nThis will revoke their login access permanently. Their related records will be preserved but unlinked from this user.`)) {
    return;
  }

  if (!confirm(`⚠️ This action is irreversible.\n\nType DELETE to confirm deletion of "${username}":`) || !prompt('Type DELETE to confirm:')?.toUpperCase().includes('DELETE')) {
    alert('Deletion cancelled.');
    return;
  }

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient.rpc('admin_delete_user', {
      p_user_id: userId
    });

    if (error) {
      // Fallback: unlink FKs in JS then delete profile
      try {
        await supabaseClient.from('renters').update({ user_id: null }).eq('user_id', userId);
        await supabaseClient.from('bills').update({ voided_by: null }).eq('voided_by', userId);
        await supabaseClient.from('payments').update({ verified_by: null }).eq('verified_by', userId);
        await supabaseClient.from('payments').update({ reversed_by: null }).eq('reversed_by', userId);
        await supabaseClient.from('expenses').update({ created_by: null }).eq('created_by', userId);
        await supabaseClient.from('owner_withdrawals').update({ created_by: null }).eq('created_by', userId);
        await supabaseClient.from('documents').update({ created_by: null }).eq('created_by', userId);
        await supabaseClient.from('maintenance_tasks').update({ reported_by: null }).eq('reported_by', userId);
        await supabaseClient.from('profiles').delete().eq('id', userId);
      } catch (innerErr) {
        throw new Error(error.message);
      }
    }

    alert(`✅ Account for "${username}" has been permanently deleted.`);
    await loadUserLoginsSettings();
  } catch (err) {
    alert('Failed to delete account: ' + err.message);
  }
}

/**
 * Toggle password visibility in add/edit modal
 */
export function toggleUserPasswordMask() {
  const input = document.getElementById('eu-password');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  const btn = input.closest('.eu-pw-wrapper')?.querySelector('button');
  if (btn) {
    const icon = btn.querySelector('i[data-lucide]');
    if (icon) icon.setAttribute('data-lucide', input.type === 'password' ? 'eye' : 'eye-off');
    refreshLucideIcons();
  }
}

/**
 * Generate a strong password in add/edit modal
 */
export function generateUserPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789#@!';
  let randPw = 'Rent#';
  for (let i = 0; i < 5; i++) {
    randPw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const input = document.getElementById('eu-password');
  if (input) input.value = randPw;
}
