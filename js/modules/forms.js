// RentBill Pro — Unified Form Handlers & Submission Subsystems (Pure Supabase)
import { getSupabaseClient } from '../core/config.js';
import { safeInsert, safeUpdate, safeDelete } from '../core/db.js';
import { getCurrentUser, setCurrentUser, getUploadedDocBase64, setUploadedDocBase64 } from '../core/state.js';
import { closeModal, refreshLucideIcons } from '../core/ui.js';
import { parseFloorValue } from '../core/format.js';
import { checkAuth, showLogin } from './auth.js';
import { loadDashboard } from './dashboard.js';
import { loadPropertiesPage, loadTenantsPage } from './properties.js';
import { loadOwnersPage } from './owners.js';
import { loadBillsPage, updateLiveBillCalculation } from './bills.js';
import { loadPaymentsPage } from './payments.js';
import { loadExpensesPage } from './expenses.js';
import { loadDocumentsPage } from './documents.js';
import { submitMaintenanceForm, submitMaintenanceStatusForm } from './maintenance.js';

export function setupFormSubmitHandlers() {
  const supabaseClient = getSupabaseClient();
  
  // Guard: Intercept all form submissions for AUDITOR role (Read-Only Safety Shield)
  document.addEventListener('submit', (e) => {
    const user = getCurrentUser();
    if (user && user.role === 'AUDITOR' && e.target.id !== 'login-form') {
      e.preventDefault();
      e.stopPropagation();
      alert('🔒 Financial Auditor View — Read-Only Mode Active. Data modifications are disabled.');
      return false;
    }
  }, true);

  // 1. LOGIN FORM SUBMIT HANDLER
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorDiv = document.getElementById('login-error');
      if (errorDiv) errorDiv.style.display = 'none';

      const loginBtn = document.getElementById('i18n-btn-login');
      const origBtnHtml = loginBtn ? loginBtn.innerHTML : 'Login';

      function showError(msg) {
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.innerHTML = origBtnHtml;
          refreshLucideIcons();
        }
        if (errorDiv) {
          const errText = document.getElementById('login-error-text');
          if (errText) errText.textContent = msg;
          else errorDiv.textContent = msg;
          errorDiv.style.display = 'flex';
          refreshLucideIcons();
        }
      }

      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Logging in...';
        refreshLucideIcons();
      }

      const identifierInput = (document.getElementById('login-email')?.value || document.getElementById('login-username')?.value || '').trim();
      const passwordInput = document.getElementById('login-password').value.trim();

      if (!identifierInput || !passwordInput) {
        showError('Please enter both email/username and password');
        return;
      }

      const client = getSupabaseClient();
      if (!client || !client.auth) {
        showError('Supabase client is not initialized. Please configure your Supabase Project URL & Anon Key.');
        return;
      }

      let emailToLogin = identifierInput.trim().toLowerCase();

      // If user typed a username without '@', resolve to email via RPC
      if (!emailToLogin.includes('@')) {
        try {
          const { data: rpcEmail } = await client.rpc('resolve_login_email', { p_identifier: identifierInput.trim() });
          if (rpcEmail && typeof rpcEmail === 'string' && rpcEmail.includes('@')) {
            emailToLogin = rpcEmail.toLowerCase().trim();
          }
        } catch (e) {}

        if (!emailToLogin.includes('@')) {
          showError(`Could not find an account with username "${identifierInput.trim()}". Please use your email address or check the username.`);
          return;
        }
      }

      // Perform Supabase Authentication with Email & Password
      try {
        const { data, error } = await client.auth.signInWithPassword({
          email: emailToLogin,
          password: passwordInput
        });

        if (error) {
          let msg = error.message || 'Invalid login credentials.';
          if (msg.toLowerCase().includes('database error') || msg.toLowerCase().includes('querying schema') || msg.toLowerCase().includes('invalid login credentials')) {
            msg = 'Invalid username/email or password. Please verify your credentials or ask the property manager to reset your password.';
          }
          showError(msg);
          return;
        }

        // onAuthStateChange will fire SIGNED_IN and call checkAuth automatically.
        if (data && data.session && loginBtn) {
          loginBtn.disabled = false;
          loginBtn.innerHTML = origBtnHtml;
        }
      } catch (err) {
        let msg = err.message || String(err);
        if (msg.toLowerCase().includes('database error') || msg.toLowerCase().includes('querying schema')) {
          msg = 'Invalid username/email or password. Please verify your credentials or ask the property manager to reset your password.';
        }
        showError(msg);
      }
    });
  }

  // 2. ADD / EDIT PROPERTY
  const formAddProp = document.getElementById('form-add-property');
  if (formAddProp) {
    formAddProp.addEventListener('submit', async (e) => {
      e.preventDefault();
      const client = getSupabaseClient();
      if (!client) return;

      const editId = document.getElementById('edit-property-id').value;
      const name = document.getElementById('prop-name').value;
      const address = document.getElementById('prop-address').value;

      let result;
      if (editId) {
        result = await safeUpdate(client, 'properties', { name, address }, 'id', editId);
      } else {
        result = await safeInsert(client, 'properties', [{ name, address }]);
      }

      if (result.error) {
        alert('Error saving property: ' + result.error.message);
      } else {
        formAddProp.reset();
        document.getElementById('edit-property-id').value = '';
        closeModal('modal-add-property');
        loadPropertiesPage();
      }
    });
  }

  // 3. ADD / EDIT UNIT
  const formAddUnit = document.getElementById('form-add-unit');
  if (formAddUnit) {
    formAddUnit.addEventListener('submit', async (e) => {
      e.preventDefault();
      const client = getSupabaseClient();
      if (!client) return;

      const editId = document.getElementById('edit-unit-id').value;
      const rawPropId = document.getElementById('unit-property-id').value;
      const unit_name = (document.getElementById('unit-name').value || '').trim();
      const rawFloor = (document.getElementById('unit-floor').value || '').trim();

      if (!rawPropId) {
        alert('Please select a target property.');
        return;
      }

      const property_id = parseInt(rawPropId, 10);
      if (isNaN(property_id)) {
        alert('Please select a valid target property.');
        return;
      }

      if (!unit_name) {
        alert('Please enter a unit name/number.');
        return;
      }

      const floor = parseFloorValue(rawFloor);
      const unitPayload = { property_id, unit_name };

      if (floor !== null) {
        unitPayload.floor = floor;
      } else if (editId) {
        unitPayload.floor = null;
      }

      let result;
      if (editId) {
        result = await safeUpdate(client, 'units', unitPayload, 'id', editId);
      } else {
        result = await safeInsert(client, 'units', [unitPayload]);
      }

      if (result.error) {
        alert('Error saving unit: ' + result.error.message);
      } else {
        formAddUnit.reset();
        document.getElementById('edit-unit-id').value = '';
        closeModal('modal-add-unit');
        loadPropertiesPage();
      }
    });
  }

  // 4. ADD / EDIT TENANT
  const formAddTenant = document.getElementById('form-add-tenant');
  if (formAddTenant) {
    formAddTenant.addEventListener('submit', async (e) => {
      e.preventDefault();
      const client = getSupabaseClient();
      if (!client) return;

      const editId = document.getElementById('edit-tenant-id').value;
      const unit_id = document.getElementById('tenant-unit-id').value;
      const owner_id = document.getElementById('tenant-owner-id').value || null;
      const name = document.getElementById('tenant-name').value;
      let mobile_number = (document.getElementById('tenant-mobile')?.value || '').trim();
      let email = (document.getElementById('tenant-email')?.value || '').trim().toLowerCase();

      // Auto-correct if user accidentally swapped phone and email inputs
      if (mobile_number.includes('@') && (!email || !email.includes('@'))) {
        const temp = mobile_number;
        mobile_number = email;
        email = temp.toLowerCase();
      }
      const aadhar_no = document.getElementById('tenant-aadhar').value;
      const base_rent = Math.round(parseFloat(document.getElementById('tenant-rent').value || '0') * 100);
      const advance_amount = Math.round(parseFloat(document.getElementById('tenant-advance').value || '0') * 100);
      const pending_arrears = Math.round(parseFloat(document.getElementById('tenant-arrears')?.value || '0') * 100);
      const maint_charge = Math.round(parseFloat(document.getElementById('tenant-maint').value || '0') * 100);
      const eb_unit_price = Math.round(parseFloat(document.getElementById('tenant-eb-price').value || '8') * 100);
      const initial_eb = parseInt(document.getElementById('tenant-init-eb').value || '0');
      const water_calc_mode = document.getElementById('tenant-water-mode').value;
      const water_rate = Math.round(parseFloat(document.getElementById('tenant-water-rate').value || '150') * 100);
      const initial_water = parseInt(document.getElementById('tenant-init-water').value || '0');
      const agreement_start_date = document.getElementById('tenant-start-date').value || null;
      const agreement_expiry_date = document.getElementById('tenant-end-date').value || null;

      const water_fixed_charge = water_calc_mode === 'FIXED' ? water_rate : 0;
      const water_unit_price = water_calc_mode === 'METERED' ? water_rate : 0;

      let result;
      let savedRenterId = editId;
      const tenantPayload = {
        unit_id, owner_id, name, mobile_number, email, aadhar_no, base_rent, advance_amount, pending_arrears,
        maint_charge, eb_unit_price, initial_eb, water_calc_mode,
        water_fixed_charge, water_unit_price, initial_water,
        agreement_start_date, agreement_expiry_date
      };

      if (editId) {
        result = await safeUpdate(client, 'renters', tenantPayload, 'id', editId);
      } else {
        tenantPayload.is_active = true;
        result = await safeInsert(client, 'renters', [tenantPayload]);
        if (result.data && result.data.length > 0) {
          savedRenterId = result.data[0].id;
        }
      }

      if (result.error) {
        alert('Error saving tenant: ' + result.error.message);
      } else {
        if (unit_id) {
          await safeUpdate(client, 'units', { status: 'OCCUPIED' }, 'id', unit_id);
        }

        formAddTenant.reset();
        document.getElementById('edit-tenant-id').value = '';
        closeModal('modal-add-tenant');
        loadTenantsPage();
        loadPropertiesPage();
      }
    });
  }

  // 5. GENERATE BILL
  const formAddBill = document.getElementById('form-add-bill');
  if (formAddBill) {
    formAddBill.addEventListener('submit', async (e) => {
      e.preventDefault();
      const client = getSupabaseClient();
      if (!client) return;

      const renter_id = document.getElementById('bill-renter-id').value;
      const billing_period = document.getElementById('bill-period').value;
      const period_start_date = document.getElementById('bill-period-from')?.value || null;
      const period_end_date = document.getElementById('bill-period-to')?.value || null;
      const bill_date = document.getElementById('bill-generated-date')?.value || new Date().toISOString().slice(0, 10);
      let due_date = document.getElementById('bill-due-date')?.value || null;
      if (!due_date && billing_period) {
        const [year, month] = billing_period.split('-').map(Number);
        if (!isNaN(year) && !isNaN(month)) {
          const lastDay = new Date(year, month, 0).getDate();
          const cfgDueDay = parseInt(localStorage.getItem('rentbill_due_day') || '10', 10) || 10;
          const dueDayClamped = Math.min(cfgDueDay, lastDay);
          due_date = `${year}-${String(month).padStart(2, '0')}-${String(dueDayClamped).padStart(2, '0')}`;
        }
      }
      const curr_eb = parseInt(document.getElementById('bill-eb').value || '0');
      const curr_water = parseInt(document.getElementById('bill-water').value || '0');
      const late_fee = Math.round(parseFloat(document.getElementById('bill-late').value || '0') * 100);
      const discount_amount = Math.round(parseFloat(document.getElementById('bill-discount').value || '0') * 100);
      const others = Math.round(parseFloat(document.getElementById('bill-others').value || '0') * 100);

      const { data: tenant } = await client.from('renters').select('*').eq('id', renter_id).single();
      if (!tenant) { alert('Tenant not found'); return; }

      const { data: lastBills } = await client.from('bills')
        .select('*').eq('renter_id', renter_id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1);

      let prev_eb = tenant.initial_eb || 0;
      let prev_water = tenant.initial_water || 0;

      if (lastBills && lastBills.length > 0) {
        const lastBill = lastBills[0];
        const lastBillDate = new Date(lastBill.created_at || lastBill.bill_date || 0);

        const ebResetDate = tenant.eb_reset_at ? new Date(tenant.eb_reset_at) : null;
        if (!ebResetDate || ebResetDate <= lastBillDate) {
          prev_eb = lastBill.curr_eb_reading ?? tenant.initial_eb ?? 0;
        }

        const waterResetDate = tenant.water_reset_at ? new Date(tenant.water_reset_at) : null;
        if (!waterResetDate || waterResetDate <= lastBillDate) {
          prev_water = lastBill.curr_water_reading ?? tenant.initial_water ?? 0;
        }
      }

      const eb_units = Math.max(0, curr_eb - prev_eb);
      const eb_amount = eb_units * (tenant.eb_unit_price || 0);

      let water_amount = tenant.water_fixed_charge || 0;
      if (tenant.water_calc_mode === 'METERED') {
        const water_units = Math.max(0, curr_water - prev_water);
        water_amount = water_units * (tenant.water_unit_price || 0);
      }

      const inputRentRupees = parseFloat(document.getElementById('bill-rent-amount')?.value || '0');
      const rent_amount = !isNaN(inputRentRupees) && inputRentRupees > 0 
        ? Math.round(inputRentRupees * 100) 
        : (tenant.base_rent || 0);
      const maint_amount = tenant.maint_charge || 0;
      const inputArrearsRupees = parseFloat(document.getElementById('bill-arrears')?.value || '0');
      const arrears_included = !isNaN(inputArrearsRupees) && inputArrearsRupees >= 0
        ? Math.round(inputArrearsRupees * 100)
        : (tenant.pending_arrears || 0);

      const gross_amount = rent_amount + maint_amount + eb_amount + water_amount + arrears_included + late_fee + others;
      const net_amount = Math.max(0, gross_amount - discount_amount);

      let billPayload = {
        renter_id,
        billing_period,
        period_start_date,
        period_end_date,
        bill_date,
        due_date,
        prev_eb_reading: prev_eb,
        curr_eb_reading: curr_eb,
        eb_unit_price: tenant.eb_unit_price,
        eb_amount,
        prev_water_reading: prev_water,
        curr_water_reading: curr_water,
        water_unit_price: tenant.water_unit_price,
        water_calc_mode: tenant.water_calc_mode,
        water_amount,
        rent_amount,
        maint_amount,
        others,
        arrears_included,
        late_fee,
        discount_amount,
        gross_amount,
        net_amount,
        paid_amount: 0,
        status: 'UNPAID'
      };

      // Check if a bill (active or soft-deleted) already exists for this renter & billing period
      const { data: existingBills } = await client.from('bills')
        .select('id, deleted_at, status, paid_amount')
        .eq('renter_id', renter_id)
        .eq('billing_period', billing_period);

      let insertOrUpdateError = null;

      if (existingBills && existingBills.length > 0) {
        const softDeleted = existingBills.filter(b => b.deleted_at !== null);
        const activeBills = existingBills.filter(b => b.deleted_at === null);

        // Permanently purge any soft-deleted records so they do not block the unique constraint
        for (const sdb of softDeleted) {
          await client.from('bills').delete().eq('id', sdb.id);
        }

        if (activeBills.length > 0) {
          const active = activeBills[0];
          if (!confirm(`An invoice for period ${billing_period} already exists. Do you want to overwrite and recalculate it?`)) {
            return;
          }
          const { error: updErr } = await safeUpdate(client, 'bills', {
            ...billPayload,
            deleted_at: null
          }, 'id', active.id);
          insertOrUpdateError = updErr;
        } else {
          const { error: insErr } = await safeInsert(client, 'bills', [billPayload]);
          insertOrUpdateError = insErr;
        }
      } else {
        const { error: insErr } = await safeInsert(client, 'bills', [billPayload]);
        insertOrUpdateError = insErr;
      }

      if (insertOrUpdateError) {
        alert('Error generating bill: ' + insertOrUpdateError.message);
      } else {
        closeModal('modal-add-bill');
        loadBillsPage();
        loadDashboard();
      }
    });

    ['bill-renter-id', 'bill-period', 'bill-period-from', 'bill-period-to', 'bill-due-date', 'bill-rent-amount', 'bill-eb', 'bill-water', 'bill-late', 'bill-discount', 'bill-others', 'bill-arrears'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        ['input', 'change'].forEach(evt => el.addEventListener(evt, updateLiveBillCalculation));
      }
    });
  }

  // 6. RECORD PAYMENT SUBMIT
  const formAddPayment = document.getElementById('form-add-payment');
  if (formAddPayment) {
    formAddPayment.addEventListener('submit', async (e) => {
      e.preventDefault();
      const client = getSupabaseClient();
      if (!client) return;

      const activeUser = getCurrentUser();
      const isTenant = activeUser && activeUser.role === 'TENANT';

      const bill_id = document.getElementById('pay-bill-id').value;
      if (!bill_id) {
        alert('Please select an unpaid bill invoice before submitting payment.');
        return;
      }

      const amount = Math.round(parseFloat(document.getElementById('pay-amount').value || '0') * 100);
      const payment_method = document.getElementById('pay-method').value;
      const transaction_reference = (document.getElementById('pay-ref').value || '').trim();
      const notes = (document.getElementById('pay-notes').value || '').trim();

      // Read optional payment screenshot
      const fileInput = document.getElementById('pay-proof-photo');
      let proof_photo = null;
      if (fileInput && fileInput.files && fileInput.files[0]) {
        try {
          proof_photo = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = evt => resolve(evt.target.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(fileInput.files[0]);
          });
        } catch (e) {}
      }

      // Query bill from Supabase
      const { data: bill } = await client.from('bills').select('*').eq('id', bill_id).single();
      if (!bill) {
        alert('Selected bill invoice not found.');
        return;
      }

      if (payment_method === 'UNPAID') {
        if (isTenant) {
          alert('Tenants cannot mark bills as unpaid.');
          return;
        }

        await safeUpdate(client, 'bills', { paid_amount: 0, status: 'UNPAID' }, 'id', bill_id);
        if (bill.renter_id) {
          await safeUpdate(client, 'renters', { pending_arrears: bill.net_amount || 0 }, 'id', bill.renter_id);
        }

        alert('⚠️ Bill marked as UNPAID');
        formAddPayment.reset();
        closeModal('modal-add-payment');
        loadBillsPage();
        loadPaymentsPage();
        loadTenantsPage();
        loadDashboard();
        return;
      }

      const { error: payErr } = await safeInsert(client, 'payments', [{
        bill_id,
        renter_id: bill.renter_id,
        amount,
        payment_method,
        transaction_reference: transaction_reference || null,
        notes: notes || null,
        proof_photo: proof_photo || null,
        proof_status: isTenant ? 'PENDING' : 'VERIFIED'
      }]);

      if (payErr) {
        alert('Error saving payment: ' + payErr.message);
        return;
      }

      if (!isTenant) {
        // The sync_bill_paid_amount trigger already recomputed bills.paid_amount
        // (and status) to include this payment. Re-read the fresh value and sync
        // the tenant's pending_arrears — never add amount to the pre-insert
        // paid_amount manually (which drifted from the trigger's authoritative sum).
        const { data: freshBill } = await client
          .from('bills')
          .select('id, renter_id, net_amount, paid_amount')
          .eq('id', bill_id)
          .single();
        const remainingDue = Math.max(0, (Number(freshBill?.net_amount) || 0) - (Number(freshBill?.paid_amount) || 0));
        if (freshBill && freshBill.renter_id) {
          await safeUpdate(client, 'renters', { pending_arrears: remainingDue }, 'id', freshBill.renter_id);
        }
      }

      if (isTenant) {
        alert('✅ Payment proof screenshot submitted successfully! Your landlord will verify and confirm your invoice.');
      } else {
        alert('✅ Payment recorded successfully!');
      }

      formAddPayment.reset();
      closeModal('modal-add-payment');
      loadBillsPage();
      loadPaymentsPage();
      loadDashboard();
      if (!isTenant) loadTenantsPage();
    });

    const payMethodSelect = document.getElementById('pay-method');
    if (payMethodSelect) {
      payMethodSelect.addEventListener('change', function() {
        const payAmtInput = document.getElementById('pay-amount');
        const payRefInput = document.getElementById('pay-ref');
        if (this.value === 'UNPAID') {
          if (payAmtInput) { payAmtInput.value = '0'; payAmtInput.setAttribute('min', '0'); payAmtInput.removeAttribute('required'); }
          if (payRefInput) { payRefInput.value = ''; payRefInput.removeAttribute('required'); payRefInput.placeholder = 'Optional for unpaid status'; }
        } else {
          if (payAmtInput) { payAmtInput.setAttribute('min', '0.01'); payAmtInput.setAttribute('required', 'true'); }
          if (payRefInput) { payRefInput.setAttribute('required', 'true'); payRefInput.placeholder = 'Enter bank reference number'; }
        }
      });
    }
  }

  // 7. ADD EXPENSE
  const formAddExpense = document.getElementById('form-add-expense');
  if (formAddExpense) {
    formAddExpense.addEventListener('submit', async (e) => {
      e.preventDefault();
      const client = getSupabaseClient();
      if (!client) return;

      const category = document.getElementById('expense-category').value;
      const amount = Math.round(parseFloat(document.getElementById('expense-amount').value || '0') * 100);
      const date = document.getElementById('expense-date').value;
      const notes = document.getElementById('expense-notes').value;

      const { error } = await safeInsert(client, 'expenses', [{ category, amount, date, notes }]);
      if (error) alert('Error logging expense: ' + error.message);
      else {
        formAddExpense.reset();
        closeModal('modal-add-expense');
        loadExpensesPage();
        loadDashboard();
      }
    });
  }

  // 8. ADD WITHDRAWAL
  const formAddWithdrawal = document.getElementById('form-add-withdrawal');
  if (formAddWithdrawal) {
    formAddWithdrawal.addEventListener('submit', async (e) => {
      e.preventDefault();
      const client = getSupabaseClient();
      if (!client) return;

      const owner_name = document.getElementById('withdrawal-owner-name').value;
      const amount = Math.round(parseFloat(document.getElementById('withdrawal-amount').value || '0') * 100);
      const date = document.getElementById('withdrawal-date').value;
      const notes = document.getElementById('withdrawal-notes').value;

      const { error } = await safeInsert(client, 'owner_withdrawals', [{ owner_name, amount, date, notes }]);
      if (error) alert('Error recording withdrawal: ' + error.message);
      else {
        formAddWithdrawal.reset();
        closeModal('modal-add-withdrawal');
        loadExpensesPage();
      }
    });
  }

  // 9. ADD / EDIT OWNER
  const formAddOwner = document.getElementById('form-add-owner');
  if (formAddOwner) {
    formAddOwner.addEventListener('submit', async (e) => {
      e.preventDefault();
      const client = getSupabaseClient();
      if (!client) return;

      const editId = document.getElementById('edit-owner-id').value;
      const name = document.getElementById('owner-name').value;
      const mobile_number = document.getElementById('owner-mobile').value;
      const email = document.getElementById('owner-email').value;
      const upi_id = document.getElementById('owner-upi').value;
      const bank_name = document.getElementById('owner-bank-name').value;
      const account_number = document.getElementById('owner-account-no').value;
      const ifsc_code = document.getElementById('owner-ifsc').value;

      const ownerPayload = {
        name, mobile_number, email, upi_id, bank_name, account_number, ifsc_code
      };

      let result;
      if (editId) {
        result = await safeUpdate(client, 'owners', ownerPayload, 'id', editId);
      } else {
        result = await safeInsert(client, 'owners', [ownerPayload]);
      }

      if (result.error) {
        alert('Error saving owner: ' + result.error.message);
      } else {
        formAddOwner.reset();
        document.getElementById('edit-owner-id').value = '';
        closeModal('modal-add-owner');
        loadOwnersPage();
      }
    });
  }

  // 10. TENANT VACATE FORM
  const formVacate = document.getElementById('form-vacate-tenant');
  if (formVacate) {
    formVacate.addEventListener('submit', async (e) => {
      e.preventDefault();
      const client = getSupabaseClient();
      if (!client) return;

      const renter_id = document.getElementById('vacate-renter-id').value;
      const vacate_date = document.getElementById('vacate-date').value;
      const exit_reason = document.getElementById('vacate-reason').value;

      const { data: tenant } = await client.from('renters').select('unit_id').eq('id', renter_id).single();
      
      const { error } = await safeUpdate(client, 'renters', { is_active: false, vacate_date, exit_reason }, 'id', renter_id);

      if (error) alert('Error processing vacate: ' + error.message);
      else {
        if (tenant && tenant.unit_id) {
          await safeUpdate(client, 'units', { status: 'VACANT' }, 'id', tenant.unit_id);
        }
        closeModal('modal-vacate-tenant');
        loadTenantsPage();
        loadPropertiesPage();
        loadDashboard();
      }
    });
  }

  // 11. ADD DOCUMENT FORM
  const formAddDoc = document.getElementById('form-add-document');
  if (formAddDoc) {
    formAddDoc.addEventListener('submit', async (e) => {
      e.preventDefault();
      const client = getSupabaseClient();
      if (!client) return;

      const title = document.getElementById('doc-title').value;
      const category = document.getElementById('doc-category').value;
      const expiryDate = document.getElementById('doc-expiry-date').value || null;
      const entityType = document.getElementById('doc-entity-type').value;
      const entityId = document.getElementById('doc-entity-id').value;
      const fileUrlInput = document.getElementById('doc-file-url').value;
      const notes = document.getElementById('doc-notes').value;

      const fileUrl = getUploadedDocBase64() || fileUrlInput || '';

      const { error } = await safeInsert(client, 'documents', [{
        title,
        category,
        expiry_date: expiryDate,
        entity_type: entityType,
        entity_id: entityId,
        file_url: fileUrl,
        notes
      }]);

      if (error) {
        alert('Error saving document: ' + error.message);
      } else {
        setUploadedDocBase64('');
        closeModal('modal-add-document');
        formAddDoc.reset();
        loadDocumentsPage();
      }
    });
  }

  // 12. ADMIN CHANGE PASSWORD FORM
  const formChangePassword = document.getElementById('form-change-password');
  if (formChangePassword) {
    formChangePassword.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPw = document.getElementById('cfg-new-password')?.value;
      const confirmPw = document.getElementById('cfg-confirm-password')?.value;
      if (!newPw || newPw.length < 6) {
        alert('Password must be at least 6 characters long.');
        return;
      }
      if (newPw !== confirmPw) {
        alert('Passwords do not match. Please re-enter.');
        return;
      }
      const client = getSupabaseClient();
      if (!client) {
        alert('Supabase client not initialized.');
        return;
      }
      const { data, error } = await client.auth.updateUser({ password: newPw });
      if (error) {
        alert('Failed to update password: ' + error.message);
      } else {
        alert('✅ Password updated successfully! Please remember your new password.');
        formChangePassword.reset();
      }
    });
  }

  // MAINTENANCE FORM HANDLERS
  const formAddMaintenance = document.getElementById('form-add-maintenance');
  if (formAddMaintenance) {
    formAddMaintenance.addEventListener('submit', submitMaintenanceForm);
  }

  const formUpdateMaintenanceStatus = document.getElementById('form-update-maintenance-status');
  if (formUpdateMaintenanceStatus) {
    formUpdateMaintenanceStatus.addEventListener('submit', submitMaintenanceStatusForm);
  }
}
