// RentBill Pro — Authentication, Session & User Access Gatekeeper
import { getSupabaseClient } from '../core/config.js';
import { getCurrentUser, setCurrentUser, getCurrentLang } from '../core/state.js';
import { loadTranslations } from '../core/i18n.js';
import { loadDashboard } from './dashboard.js';
import { loadBillsPage } from './bills.js';
import { loadPaymentsPage } from './payments.js';
import { loadMaintenancePage } from './maintenance.js';
import { loadPropertiesPage } from './properties.js';
import { setupRealtimeSubscriptions, teardownRealtimeSubscriptions } from './realtime.js';

export function showLogin() {
  const loader = document.getElementById('app-loader');
  if (loader) loader.style.display = 'none';
  const appView = document.getElementById('app-view');
  if (appView) appView.style.display = 'none';
  const authView = document.getElementById('auth-view');
  if (authView) authView.style.display = 'flex';
  try {
    loadTranslations(getCurrentLang());
  } catch (e) {}
}

export function hideLoader() {
  const loader = document.getElementById('app-loader');
  if (loader) loader.style.display = 'none';
}

export async function checkAuth(passedSession = null) {
  const supabaseClient = getSupabaseClient();

  try {
    let session = passedSession;

    if (!session && supabaseClient && supabaseClient.auth) {
      try {
        const { data: sessData, error: sessionErr } = await supabaseClient.auth.getSession();
        if (!sessionErr && sessData && sessData.session) {
          session = sessData.session;
        }
      } catch (sErr) {
        console.warn('Session check notice:', sErr);
      }
    }
    
    if (!session) {
      showLogin();
      return;
    } else {
      let profile = null;
      try {
        const { data: pData } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        profile = pData;
      } catch (pErr) {
        console.warn('Profile fetch notice:', pErr);
      }

      if (profile && profile.is_disabled) {
        if (supabaseClient && supabaseClient.auth) {
          try { await supabaseClient.auth.signOut(); } catch (soErr) {}
        }
        localStorage.removeItem('rentbill_active_page');
        setCurrentUser({ id: null, username: '', role: '', email: '' });

        showLogin();
        const errorDiv = document.getElementById('login-error');
        if (errorDiv) {
          errorDiv.textContent = '🔒 Login access suspended. Your account has been temporarily deactivated by property administration.';
          errorDiv.style.display = 'block';
        }
        return;
      }

      const userRole = profile && profile.role ? profile.role : 'TENANT';
      const userObj = {
        id: session.user.id,
        email: session.user.email,
        username: profile ? profile.username : (session.user.email ? session.user.email.split('@')[0] : 'User'),
        role: userRole
      };

      if (userRole === 'TENANT') {
        try {
          await supabaseClient.rpc('tenant_link_own_lease');
        } catch (lErr) {}

        try {
          const safeEmail = (session.user.email || '').replace(/"/g, '').toLowerCase().trim();
          const metaRenterId = session.user.user_metadata?.renter_id;
          const metaMobile = session.user.user_metadata?.mobile || '';
          const rawDigits = (safeEmail + metaMobile).replace(/[^0-9]/g, '');
          const tenDigitMobile = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;

          let renterRecs = [];

          // 0. Try direct metadata renter_id match first
          if (metaRenterId) {
            const { data: d0 } = await supabaseClient
              .from('renters')
              .select('id, name')
              .eq('id', metaRenterId)
              .is('deleted_at', null)
              .limit(1);
            renterRecs = d0 || [];
          }
          
          // 1. Try user_id or email match
          if ((!renterRecs || renterRecs.length === 0) && safeEmail.includes('@')) {
            const { data: d1 } = await supabaseClient
              .from('renters')
              .select('id, name')
              .or(`user_id.eq.${session.user.id},email.ilike."${safeEmail}"`)
              .is('deleted_at', null)
              .limit(1);
            renterRecs = d1 || [];
          }

          // 2. Try mobile digits match if user_id/email yielded no results
          if ((!renterRecs || renterRecs.length === 0) && tenDigitMobile.length >= 7) {
            const { data: d2 } = await supabaseClient
              .from('renters')
              .select('id, name')
              .or(`user_id.eq.${session.user.id},mobile_number.ilike."%${tenDigitMobile}%"`)
              .is('deleted_at', null)
              .limit(1);
            renterRecs = d2 || [];
          }

          // 3. Fallback to direct user_id match
          if (!renterRecs || renterRecs.length === 0) {
            const { data: d3 } = await supabaseClient
              .from('renters')
              .select('id, name')
              .eq('user_id', session.user.id)
              .is('deleted_at', null)
              .limit(1);
            renterRecs = d3 || [];
          }

          if (renterRecs && renterRecs.length > 0) {
            userObj.renter_id = renterRecs[0].id;
            if (renterRecs[0].name) userObj.username = renterRecs[0].name;

            // Auto-link user_id on renter record if missing
            try {
              await supabaseClient.from('renters').update({ user_id: session.user.id }).eq('id', renterRecs[0].id);
            } catch (uErr) {}
          }
        } catch (rErr) {
          console.warn('Tenant lease resolution notice:', rErr);
        }
      }

      setCurrentUser(userObj);
    }

    const activeUser = getCurrentUser();

    // Instantly switch views to application workspace
    hideLoader();
    const authView = document.getElementById('auth-view');
    if (authView) authView.style.display = 'none';
    const appView = document.getElementById('app-view');
    if (appView) appView.style.display = 'flex';

    const badgeEl = document.getElementById('user-profile-badge');
    const avatarTxt = document.getElementById('user-avatar-text');
    if (badgeEl) badgeEl.title = `${activeUser.username} (${activeUser.role})`;
    if (avatarTxt) avatarTxt.textContent = (activeUser.username || 'A').charAt(0).toUpperCase();

    // Handle Auditor Banner Element
    let auditorBanner = document.getElementById('auditor-mode-banner');
    if (activeUser.role === 'AUDITOR') {
      if (!auditorBanner) {
        auditorBanner = document.createElement('div');
        auditorBanner.id = 'auditor-mode-banner';
        auditorBanner.style.cssText = 'background: linear-gradient(90deg, #0f172a, #1e293b); color: #38bdf8; border-bottom: 1px solid rgba(56, 189, 248, 0.25); padding: 8px 16px; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: space-between; z-index: 999;';
        auditorBanner.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="eye"></i>
            <span>🔍 Financial Auditor View — Read-Only Mode Active (Data modifications disabled)</span>
          </div>
          <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);">Auditor Mode</span>
        `;
        const appView = document.getElementById('app-view');
        if (appView) appView.parentNode.insertBefore(auditorBanner, appView);
      }
      auditorBanner.style.display = 'flex';
    } else if (auditorBanner) {
      auditorBanner.style.display = 'none';
    }

    if (activeUser.role === 'TENANT') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.tenant-only').forEach(el => el.style.display = '');
    } else if (activeUser.role === 'AUDITOR') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.tenant-only').forEach(el => el.style.display = 'none');
    } else if (activeUser.role === 'STAFF') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.tenant-only').forEach(el => el.style.display = 'none');
    } else {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
      document.querySelectorAll('.tenant-only').forEach(el => el.style.display = 'none');
    }

    try {
      await loadTranslations(getCurrentLang());
    } catch (i18nErr) {}

    // Restore active page across browser reloads
    let savedPage = localStorage.getItem('rentbill_active_page') || 'page-dashboard';
    if (activeUser.role === 'TENANT' && (savedPage === 'page-properties' || savedPage === 'page-expenses' || savedPage === 'page-settings')) {
      savedPage = 'page-dashboard';
    } else if (activeUser.role === 'STAFF' && savedPage === 'page-dashboard') {
      savedPage = 'page-maintenance';
    }

    // Activate the targeted page DOM section explicitly
    document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
    const targetSection = document.getElementById(savedPage) || document.getElementById('page-dashboard');
    if (targetSection) targetSection.classList.add('active');

    // Update active nav styling
    document.querySelectorAll('.nav-item').forEach(nav => {
      if (nav.getAttribute('data-target') === savedPage) {
        nav.classList.add('active');
      } else {
        nav.classList.remove('active');
      }
    });

    // Directly trigger content loader for the selected page
    switch (savedPage) {
      case 'page-bills': loadBillsPage(); break;
      case 'page-payments': loadPaymentsPage(); break;
      case 'page-maintenance': loadMaintenancePage(); break;
      case 'page-properties':
        if (activeUser.role !== 'TENANT') loadPropertiesPage();
        else loadDashboard();
        break;
      default:
        loadDashboard();
        break;
    }

    try {
      setupRealtimeSubscriptions();
    } catch (rtErr) {
      console.warn('Realtime subscription notice:', rtErr);
    }

  } catch (err) {
    console.error('Auth verification failed', err);
    showLogin();
  }
}

export async function handleLogout() {
  teardownRealtimeSubscriptions();
  const supabaseClient = getSupabaseClient();
  if (supabaseClient && supabaseClient.auth) {
    try {
      await supabaseClient.auth.signOut();
    } catch (soErr) {
      console.warn('SignOut error:', soErr);
    }
  }
  localStorage.removeItem('rentbill_active_page');
  setCurrentUser({ id: null, username: '', role: '', email: '' });
  showLogin();
}

export function showSetupConfigModal() {
  const inputIdOrUrl = prompt("Enter your Supabase Project ID (e.g., 'YOUR_PROJECT_ID') or Project URL:");
  const inputKey = prompt("Enter your Supabase Publishable Key or Anon Key:");
  if (inputIdOrUrl && inputKey) {
    localStorage.setItem('rentbill_sb_url', inputIdOrUrl.trim());
    localStorage.setItem('rentbill_sb_key', inputKey.trim());
    window.location.reload();
  }
}

export function toggleKeyMask() {
  const input = document.getElementById('cfg-sb-key');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

export function openForgotPasswordModal() {
  const loginEmail = document.getElementById('login-email')?.value?.trim();
  const forgotEmailInput = document.getElementById('forgot-email');
  if (forgotEmailInput && loginEmail) forgotEmailInput.value = loginEmail;
  const errorDiv = document.getElementById('forgot-error');
  const successDiv = document.getElementById('forgot-success');
  if (errorDiv) errorDiv.style.display = 'none';
  if (successDiv) successDiv.style.display = 'none';
  const modal = document.getElementById('modal-forgot-password');
  if (modal) modal.style.display = 'flex';
}
