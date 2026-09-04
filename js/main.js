// RentBill Pro — Master Modular Application Entry Point
import { loadLayout } from './core/layout.js';
import { initSupabaseClient, getSupabaseClient, resetSupabaseConfig } from './core/config.js';
import { getCurrentUser, setCurrentUser, getCurrentLang, setCurrentLang } from './core/state.js';
import {
  formatCurrency,
  formatInvoiceNumber,
  escapeStr,
  numberToWordsINR,
  renderEmptyState,
  toggleDropdown,
  closeAllDropdowns,
  openModal,
  closeModal,
  refreshLucideIcons
} from './core/ui.js';
import { initTheme, applyThemeMode, toggleTheme, setTheme } from './core/theme.js';
import { loadTranslations, applyTranslations, toggleLanguage } from './core/i18n.js';
import { showLogin, hideLoader, checkAuth, handleLogout, showSetupConfigModal, toggleKeyMask, toggleLoginPasswordMask } from './modules/auth.js';
import {
  openMobileMenu,
  closeMobileMenu,
  toggleMobileMenu,
  setupNavigation,
  switchPropertiesSubTab,
  handleMobileFabClick,
  triggerDynamicSubTabAdd,
  switchSettingsSubTab
} from './modules/navigation.js';
import { loadDashboard } from './modules/dashboard.js';
import {
  populateTenantUnitSelect,
  loadPropertiesPage,
  loadTenantsPage,
  triggerEditProperty,
  triggerDeleteProperty,
  triggerEditUnit,
  triggerDeleteUnit,
  triggerEditTenant,
  triggerAdjustArrears,
  triggerDeleteTenant,
  triggerVacateModal,
  triggerTransferModal,
  submitTransfer,
  triggerMeterResetModal,
  submitMeterReset
} from './modules/properties.js';
import { populateOwnerSelects, loadOwnersPage, triggerEditOwner, triggerDeleteOwner } from './modules/owners.js';
import {
  populateBillingPeriods,
  loadBillsPage,
  populateBillsMonthFilter,
  updateUnpaidKpis,
  filterBillsTable,
  updateLiveBillCalculation,
  openPaymentModal,
  voidBill,
  triggerDeleteBill,
  shareInvoiceWhatsApp,
  copyInvoiceToClipboard,
  sendOverdueReminderWhatsApp
} from './modules/bills.js';
import { loadPaymentsPage, filterPaymentsTable, triggerDeletePayment, printReceipt, printPaidReceipt, triggerApprovePaymentProof, triggerRejectPaymentProof, viewPaymentProofImage } from './modules/payments.js';
import { loadExpensesPage, triggerDeleteExpense, triggerDeleteWithdrawal } from './modules/expenses.js';
import {
  loadMaintenancePage,
  filterMaintenanceTable,
  triggerEditMaintenance,
  triggerUpdateMaintenanceStatus,
  triggerDeleteMaintenance,
  exportMaintenanceCSV
} from './modules/maintenance.js';
import {
  handleDocFileUpload,
  openAddDocumentModal,
  populateDocEntitySelect,
  loadDocumentsPage,
  renderDocumentsRows,
  viewDocument,
  triggerDeleteDocument,
  filterDocumentsTable
} from './modules/documents.js';
import { loadDiagnosticsPage, runDiagnosticsCheck } from './modules/diagnostics.js';
import {
  exportToCSV,
  exportBillsCSV,
  exportPaymentsCSV,
  exportExpensesCSV,
  triggerManualBackup,
  triggerRestoreData,
  handleRestoreFileUpload,
  restoreTableData,
  triggerSeedSampleData,
  loadSettingsPage,
  saveSupabaseSettings,
  testSupabaseConnection,
  saveAppSettings,
  clearAppCache
} from './modules/backups.js';
import { setupFormSubmitHandlers } from './modules/forms.js';
import { setupRealtimeSubscriptions } from './modules/realtime.js';

// Register public handlers to window for HTML inline event listeners
window.openModal = openModal;
window.closeModal = closeModal;
window.openPaymentModal = openPaymentModal;
window.voidBill = voidBill;
window.printReceipt = printReceipt;
window.printPaidReceipt = printPaidReceipt;
window.triggerVacateModal = triggerVacateModal;
window.triggerTransferModal = triggerTransferModal;
window.submitTransfer = submitTransfer;
window.triggerMeterResetModal = triggerMeterResetModal;
window.submitMeterReset = submitMeterReset;
window.triggerManualBackup = triggerManualBackup;
window.loadDiagnosticsPage = loadDiagnosticsPage;
window.loadSettingsPage = loadSettingsPage;
window.switchSettingsSubTab = switchSettingsSubTab;
window.toggleKeyMask = toggleKeyMask;
window.saveSupabaseSettings = saveSupabaseSettings;
window.testSupabaseConnection = testSupabaseConnection;
window.saveAppSettings = saveAppSettings;
window.runDiagnosticsCheck = runDiagnosticsCheck;
window.clearAppCache = clearAppCache;
window.showSetupConfigModal = showSetupConfigModal;
window.triggerEditProperty = triggerEditProperty;
window.triggerDeleteProperty = triggerDeleteProperty;
window.triggerEditUnit = triggerEditUnit;
window.triggerDeleteUnit = triggerDeleteUnit;
window.triggerEditTenant = triggerEditTenant;
window.triggerDeleteTenant = triggerDeleteTenant;
window.triggerEditOwner = triggerEditOwner;
window.triggerDeleteOwner = triggerDeleteOwner;
window.triggerDeleteExpense = triggerDeleteExpense;
window.triggerDeleteWithdrawal = triggerDeleteWithdrawal;
window.triggerDeletePayment = triggerDeletePayment;
window.toggleDropdown = toggleDropdown;
window.exportBillsCSV = exportBillsCSV;
window.exportPaymentsCSV = exportPaymentsCSV;
window.exportExpensesCSV = exportExpensesCSV;
window.shareInvoiceWhatsApp = shareInvoiceWhatsApp;
window.copyInvoiceToClipboard = copyInvoiceToClipboard;
window.sendOverdueReminderWhatsApp = sendOverdueReminderWhatsApp;
window.triggerSeedSampleData = triggerSeedSampleData;
window.openAddDocumentModal = openAddDocumentModal;
window.populateDocEntitySelect = populateDocEntitySelect;
window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.toggleMobileMenu = toggleMobileMenu;
window.toggleTheme = toggleTheme;
window.setTheme = setTheme;
window.switchPropertiesSubTab = switchPropertiesSubTab;
window.handleDocFileUpload = handleDocFileUpload;
window.loadDocumentsPage = loadDocumentsPage;
window.viewDocument = viewDocument;
window.triggerDeleteDocument = triggerDeleteDocument;
window.filterDocumentsTable = filterDocumentsTable;
window.triggerDeleteBill = triggerDeleteBill;
window.handleMobileFabClick = handleMobileFabClick;
window.triggerDynamicSubTabAdd = triggerDynamicSubTabAdd;
window.filterBillsTable = filterBillsTable;
window.filterPaymentsTable = filterPaymentsTable;
window.triggerRestoreData = triggerRestoreData;
window.handleRestoreFileUpload = handleRestoreFileUpload;
window.triggerAdjustArrears = triggerAdjustArrears;
window.toggleLanguage = toggleLanguage;
window.toggleLoginPasswordMask = toggleLoginPasswordMask;
window.triggerApprovePaymentProof = triggerApprovePaymentProof;
window.triggerRejectPaymentProof = triggerRejectPaymentProof;
window.viewPaymentProofImage = viewPaymentProofImage;
window.loadMaintenancePage = loadMaintenancePage;
window.filterMaintenanceTable = filterMaintenanceTable;
window.triggerEditMaintenance = triggerEditMaintenance;
window.triggerUpdateMaintenanceStatus = triggerUpdateMaintenanceStatus;
window.triggerDeleteMaintenance = triggerDeleteMaintenance;
window.exportMaintenanceCSV = exportMaintenanceCSV;

// Global Event Listeners
document.addEventListener('click', (e) => {
  // If clicked inside a dropdown button, toggleDropdown handles it
  if (e.target && e.target.closest && e.target.closest('.dropdown-btn')) {
    return;
  }
  closeAllDropdowns();
});

// Close open menus and modals on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllDropdowns();
  }
});

// Auto-close mobile speed dial when clicking outside
document.addEventListener('click', (e) => {
  const fabContainer = document.getElementById('mobile-fab-container');
  if (fabContainer && !fabContainer.contains(e.target)) {
    const speedDial = document.getElementById('mobile-speed-dial-menu');
    if (speedDial) speedDial.classList.remove('active');
  }
});

// Sync status indicator on the user avatar (green ring = synced, red ring = offline)
function updateSyncIndicator() {
  const avatar = document.getElementById('user-avatar-text');
  if (!avatar) return;
  if (navigator.onLine) {
    avatar.classList.remove('unsynced');
    avatar.classList.add('synced');
  } else {
    avatar.classList.remove('synced');
    avatar.classList.add('unsynced');
  }
}

window.addEventListener('online', updateSyncIndicator);
window.addEventListener('offline', updateSyncIndicator);

// Bootstrap Lifecycle Execution
document.addEventListener('DOMContentLoaded', async () => {
  // Asynchronously mount all modular layout templates
  await loadLayout();

  initTheme();
  setupNavigation();
  setupFormSubmitHandlers();

  updateSyncIndicator();

  if (!initSupabaseClient()) {
    showSetupConfigModal();
  } else {
    const supabaseClient = getSupabaseClient();
    if (supabaseClient && supabaseClient.auth) {
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          await checkAuth(session);
        } else if (event === 'SIGNED_OUT') {
          showLogin();
        }
      });
    }
    checkAuth();
  }

  refreshLucideIcons();

  const langBtn = document.getElementById('lang-switch-btn');
  if (langBtn) langBtn.addEventListener('click', toggleLanguage);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
});
