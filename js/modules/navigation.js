// RentBill Pro — Application Routing, Sub-Tabs & Mobile Navigation Controls
import { setActiveSubTab, getActiveSubTab } from '../core/state.js';
import { openModal, refreshLucideIcons } from '../core/ui.js';
import { loadDashboard } from './dashboard.js';
import { loadPropertiesPage, loadTenantsPage } from './properties.js';
import { loadOwnersPage } from './owners.js';
import { loadBillsPage } from './bills.js';
import { loadPaymentsPage } from './payments.js';
import { loadExpensesPage } from './expenses.js';
import { loadDiagnosticsPage, runDiagnosticsCheck } from './diagnostics.js';
import { loadSettingsPage } from './backups.js';
import { openAddDocumentModal } from './documents.js';
import { loadTenantLoginsSettings } from './tenantAuth.js';

export function openMobileDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  if (drawer) {
    drawer.classList.add('active');
    refreshLucideIcons();
  }
}

export function closeMobileDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  if (drawer) drawer.classList.remove('active');
}

export function setupNavigation() {
  const toggleBtn = document.getElementById('mobile-drawer-toggle');
  const closeBtn = document.getElementById('close-mobile-drawer');
  const drawer = document.getElementById('mobile-drawer');

  if (toggleBtn) toggleBtn.addEventListener('click', (e) => { e.preventDefault(); openMobileDrawer(); });
  if (closeBtn) closeBtn.addEventListener('click', () => closeMobileDrawer());
  if (drawer) {
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer) closeMobileDrawer();
    });
  }

  const items = document.querySelectorAll('.nav-item, .mobile-nav-item');
  items.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target');
      if (!target) return;
      
      localStorage.setItem('rentbill_active_page', target);
      closeMobileDrawer();

      items.forEach(nav => nav.classList.remove('active'));
      document.querySelectorAll(`[data-target="${target}"]`).forEach(nav => nav.classList.add('active'));

      document.querySelectorAll('.page-section').forEach(page => page.classList.remove('active'));
      const targetPage = document.getElementById(target);
      if (targetPage) targetPage.classList.add('active');

      switch (target) {
        case 'page-dashboard': loadDashboard(); break;
        case 'page-properties': loadPropertiesPage(); break;
        case 'page-tenants': loadTenantsPage(); break;
        case 'page-owners': loadOwnersPage(); break;
        case 'page-bills': loadBillsPage(); break;
        case 'page-payments': loadPaymentsPage(); break;
        case 'page-expenses': loadExpensesPage(); break;
        case 'page-diagnostics': loadDiagnosticsPage(); break;
        case 'page-settings': loadSettingsPage(); break;
      }
      refreshLucideIcons();
    });
  });
}

export function switchPropertiesSubTab(tabName, groupEl) {
  setActiveSubTab(tabName);
  document.querySelectorAll('.tab-pill-group').forEach(g => g.classList.remove('active'));
  document.querySelectorAll('.properties-tab-btn').forEach(b => {
    b.classList.remove('active');
  });

  if (groupEl) {
    if (groupEl.classList.contains('properties-tab-btn')) {
      groupEl.classList.add('active');
    } else {
      const parentGroup = groupEl.closest('.tab-pill-group');
      if (parentGroup) parentGroup.classList.add('active');
      const btn = parentGroup ? parentGroup.querySelector('.properties-tab-btn') : null;
      if (btn) btn.classList.add('active');
    }
  }

  document.querySelectorAll('.properties-sub-section').forEach(sec => sec.style.display = 'none');
  const targetSec = document.getElementById(`prop-sub-tab-${tabName}`);
  if (targetSec) targetSec.style.display = 'block';

  // Close mobile speed dial if open
  const speedDial = document.getElementById('mobile-speed-dial-menu');
  if (speedDial) speedDial.classList.remove('active');

  refreshLucideIcons();
}

export function handleMobileFabClick(e) {
  if (e) e.stopPropagation();
  const speedDial = document.getElementById('mobile-speed-dial-menu');
  if (speedDial) {
    speedDial.classList.toggle('active');
    refreshLucideIcons();
  }
}

export function triggerDynamicSubTabAdd() {
  const currentActiveSubTab = getActiveSubTab();
  if (currentActiveSubTab === 'properties') openModal('modal-add-property');
  else if (currentActiveSubTab === 'units') openModal('modal-add-unit');
  else if (currentActiveSubTab === 'tenants') openModal('modal-add-tenant');
  else if (currentActiveSubTab === 'owners') openModal('modal-add-owner');
  else if (currentActiveSubTab === 'documents') openAddDocumentModal();
}

export function switchSettingsSubTab(tabName, btn) {
  document.querySelectorAll('.settings-tab-btn').forEach(b => {
    b.classList.remove('active', 'btn-primary');
    b.classList.add('btn-secondary');
  });
  if (btn) {
    btn.classList.remove('btn-secondary');
    btn.classList.add('active', 'btn-primary');
  }

  document.querySelectorAll('.settings-sub-section').forEach(sec => sec.style.display = 'none');
  const targetSec = document.getElementById(`settings-tab-${tabName}`);
  if (targetSec) targetSec.style.display = 'block';

  if (tabName === 'diagnostics') {
    runDiagnosticsCheck();
  } else if (tabName === 'tenants') {
    loadTenantLoginsSettings();
  }
  refreshLucideIcons();
}
