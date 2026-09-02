// RentBill Pro — Master Modular Application Entry Point
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
import { showLogin, hideLoader, checkAuth, handleLogout, showSetupConfigModal, toggleKeyMask } from './modules/auth.js';
import {
  openMobileDrawer,
  closeMobileDrawer,
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
import { loadPaymentsPage, filterPaymentsTable, triggerDeletePayment, printReceipt, triggerApprovePaymentProof, triggerRejectPaymentProof, viewPaymentProofImage } from './modules/payments.js';
import { loadExpensesPage, triggerDeleteExpense, triggerDeleteWithdrawal } from './modules/expenses.js';
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
import {
  loadTenantLoginsSettings,
  renderTenantLoginsTable,
  filterTenantLoginsTable,
  triggerTenantPasswordModal,
  submitTenantPasswordForm,
  saveAndShareTenantWhatsApp,
  copyTenantCredentials,
  copyTenantCredentialsFromRow,
  shareTenantCredentialsWhatsApp,
  shareTenantCredentialsFromRow,
  generateRandomTenantPassword,
  generateTenantModalPassword,
  toggleTenantPasswordMask,
  toggleTenantModalPasswordMask,
  toggleLoginPasswordMask,
  triggerDeleteTenantLogin,
  triggerDeleteTenantLoginFromModal,
  triggerToggleTenantLoginStatus,
  triggerToggleTenantLoginStatusFromModal
} from './modules/tenantAuth.js';

// Register public handlers to window for HTML inline event listeners
window.openModal = openModal;
window.closeModal = closeModal;
window.openPaymentModal = openPaymentModal;
window.voidBill = voidBill;
window.printReceipt = printReceipt;
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
window.openMobileDrawer = openMobileDrawer;
window.closeMobileDrawer = closeMobileDrawer;
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
window.loadTenantLoginsSettings = loadTenantLoginsSettings;
window.renderTenantLoginsTable = renderTenantLoginsTable;
window.filterTenantLoginsTable = filterTenantLoginsTable;
window.triggerTenantPasswordModal = triggerTenantPasswordModal;
window.submitTenantPasswordForm = submitTenantPasswordForm;
window.saveAndShareTenantWhatsApp = saveAndShareTenantWhatsApp;
window.copyTenantCredentials = copyTenantCredentials;
window.copyTenantCredentialsFromRow = copyTenantCredentialsFromRow;
window.shareTenantCredentialsWhatsApp = shareTenantCredentialsWhatsApp;
window.shareTenantCredentialsFromRow = shareTenantCredentialsFromRow;
window.generateRandomTenantPassword = generateRandomTenantPassword;
window.generateTenantModalPassword = generateTenantModalPassword;
window.toggleTenantPasswordMask = toggleTenantPasswordMask;
window.toggleTenantModalPasswordMask = toggleTenantModalPasswordMask;
window.toggleLoginPasswordMask = toggleLoginPasswordMask;
window.triggerDeleteTenantLogin = triggerDeleteTenantLogin;
window.triggerDeleteTenantLoginFromModal = triggerDeleteTenantLoginFromModal;
window.triggerToggleTenantLoginStatus = triggerToggleTenantLoginStatus;
window.triggerToggleTenantLoginStatusFromModal = triggerToggleTenantLoginStatusFromModal;
window.triggerApprovePaymentProof = triggerApprovePaymentProof;
window.triggerRejectPaymentProof = triggerRejectPaymentProof;
window.viewPaymentProofImage = viewPaymentProofImage;

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

// Bootstrap Lifecycle Execution
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupNavigation();
  setupFormSubmitHandlers();

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
