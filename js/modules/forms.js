// RentBill Pro — Unified Form Handlers & Submission Subsystems (Pure Supabase)
import { getSupabaseClient } from '../core/config.js';
import { getCurrentUser, setCurrentUser, getUploadedDocBase64, setUploadedDocBase64 } from '../core/state.js';
import { closeModal, refreshLucideIcons } from '../core/ui.js';
import { checkAuth } from './auth.js';
import { loadDashboard } from './dashboard.js';
import { loadPropertiesPage, loadTenantsPage } from './properties.js';
import { loadOwnersPage } from './owners.js';
import { loadBillsPage, updateLiveBillCalculation } from './bills.js';
import { loadPaymentsPage } from './payments.js';
import { loadExpensesPage } from './expenses.js';
import { loadDocumentsPage } from './documents.js';
import { saveTenantCredentials, submitTenantPasswordForm, loadTenantLoginsSettings } from './tenantAuth.js';

export function setupFormSubmitHandlers() {
  const supabaseClient = getSupabaseClient();
  const currentUser = getCurrentUser();

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
          errorDiv.textContent = msg;
          errorDiv.style.display = 'block';
        }
      }

      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Logging in...';
        refreshLucideIcons();
      }

      const emailInput = (document.getElementById('login-email')?.value || document.getElementById('login-username')?.value || '').trim().toLowerCase();
      const passwordInput = document.getElementById('login-password').value.trim();

      if (!emailInput || !passwordInput) {
        showError('Please enter both email address and password');
        return;
      }

      const client = getSupabaseClient();
      if (!client || !client.auth) {
        showError('Supabase client is not initialized. Please configure your Supabase Project URL & Anon Key.');
        return;
      }

      // Perform Supabase Authentication directly with Email & Password
      try {
        const { data, error } = await client.auth.signInWithPassword({
          email: emailInput,
          password: passwordInput
        });

        if (error) {
          showError(error.message || 'Invalid email or password.');
          return;
        }

        if (data && data.session) {
          const authV = document.getElementById('auth-view');
          if (authV) authV.style.display = 'none';
          const appV = document.getElementById('app-view');
          if (appV) appV.style.display = 'flex';

          await checkAuth(data.session);

          if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = origBtnHtml;
          }
        }
      } catch (err) {
        showError('Authentication error: ' + (err.message || err));
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
        result = await client.from('properties').update({ name, address }).eq('id', editId);
      } else {
        result = await client.from('properties').insert([{ name, address }]);
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
      const property_id = document.getElementById('unit-property-id').value;
      const unit_name = document.getElementById('unit-name').value;
      const floor = document.getElementById('unit-floor').value;

      let result;
      if (editId) {
        result = await client.from('units').update({ property_id, unit_name, floor }).eq('id', editId);
      } else {
        result = await client.from('units').insert([{ property_id, unit_name, floor }]);
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
      const mobile_number = document.getElementById('tenant-mobile').value;
      const email = (document.getElementById('tenant-email')?.value || '').trim().toLowerCase();
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
      if (editId) {
        result = await client.from('renters').update({
          unit_id, owner_id, name, mobile_number, email, aadhar_no, base_rent, advance_amount, pending_arrears,
          maint_charge, eb_unit_price, initial_eb, water_calc_mode,
          water_fixed_charge, water_unit_price, initial_water,
          agreement_start_date, agreement_expiry_date
        }).eq('id', editId);
      } else {
        result = await client.from('renters').insert([{
          unit_id, owner_id, name, mobile_number, email, aadhar_no, base_rent, advance_amount, pending_arrears,
          maint_charge, eb_unit_price, initial_eb, water_calc_mode,
          water_fixed_charge, water_unit_price, initial_water,
          agreement_start_date, agreement_expiry_date, is_active: true
        }]).select();
        if (result.data && result.data.length > 0) {
          savedRenterId = result.data[0].id;
        }
      }

      if (result.error) {
        alert('Error saving tenant: ' + result.error.message);
      } else {
        if (unit_id) {
          await client.from('units').update({ status: 'OCCUPIED' }).eq('id', unit_id);
        }

        // If a password was supplied, provision tenant login credentials in Supabase Auth
        const tenantPassword = (document.getElementById('tenant-password')?.value || '').trim();
        if (tenantPassword && tenantPassword.length >= 6 && email) {
          try {
            await saveTenantCredentials(savedRenterId, email, tenantPassword, name, mobile_number);
          } catch (authErr) {
            console.warn('Tenant credential auto-save warning:', authErr.message);
          }
        }

        formAddTenant.reset();
        document.getElementById('edit-tenant-id').value = '';
        const pwEl = document.getElementById('tenant-password');
        if (pwEl) pwEl.value = '';
        closeModal('modal-add-tenant');
        loadTenantsPage();
        loadPropertiesPage();
        loadTenantLoginsSettings();
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
      const due_date = document.getElementById('bill-due-date')?.value || null;
      const curr_eb = parseInt(document.getElementById('bill-eb').value || '0');
      const curr_water = parseInt(document.getElementById('bill-water').value || '0');
      const late_fee = Math.round(parseFloat(document.getElementById('bill-late').value || '0') * 100);
      const discount_amount = Math.round(parseFloat(document.getElementById('bill-discount').value || '0') * 100);
      const others = Math.round(parseFloat(document.getElementById('bill-others').value || '0') * 100);

      const { data: tenant } = await client.from('renters').select('*').eq('id', renter_id).single();
      if (!tenant) { alert('Tenant not found'); return; }

      const { data: lastBills } = await client.from('bills')
        .select('*').eq('renter_id', renter_id).order('created_at', { ascending: false }).limit(1);

      const prev_eb = lastBills && lastBills.length > 0 ? (lastBills[0].curr_eb_reading || tenant.initial_eb) : tenant.initial_eb;
      const prev_water = lastBills && lastBills.length > 0 ? (lastBills[0].curr_water_reading || tenant.initial_water) : tenant.initial_water;

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

      const { error } = await client.from('bills').insert([{
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
      }]);

      if (error) alert('Error generating bill: ' + error.message);
      else {
        closeModal('modal-add-bill');
        loadBillsPage();
        loadDashboard();
      }
    });

    ['bill-rent-amount', 'bill-eb', 'bill-water', 'bill-late', 'bill-discount', 'bill-others', 'bill-arrears'].forEach(id => {
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

        await client.from('bills').update({ paid_amount: 0, status: 'UNPAID' }).eq('id', bill_id);
        if (bill.renter_id) {
          await client.from('renters').update({ pending_arrears: bill.net_amount || 0 }).eq('id', bill.renter_id);
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

      const { error: payErr } = await client.from('payments').insert([{
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
        const newPaid = (bill.paid_amount || 0) + amount;
        let newStatus = 'PARTIAL';
        if (newPaid >= bill.net_amount) newStatus = 'PAID';

        await client.from('bills').update({ paid_amount: newPaid, status: newStatus }).eq('id', bill_id);

        const remainingDue = Math.max(0, bill.net_amount - newPaid);
        if (bill.renter_id) {
          await client.from('renters').update({ pending_arrears: remainingDue }).eq('id', bill.renter_id);
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

      const { error } = await client.from('expenses').insert([{ category, amount, date, notes }]);
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

      const { error } = await client.from('owner_withdrawals').insert([{ owner_name, amount, date, notes }]);
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

      let result;
      if (editId) {
        result = await client.from('owners').update({
          name, mobile_number, email, upi_id, bank_name, account_number, ifsc_code
        }).eq('id', editId);
      } else {
        result = await client.from('owners').insert([{
          name, mobile_number, email, upi_id, bank_name, account_number, ifsc_code
        }]);
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
      
      const { error } = await client.from('renters')
        .update({ is_active: false, vacate_date, exit_reason })
        .eq('id', renter_id);

      if (error) alert('Error processing vacate: ' + error.message);
      else {
        if (tenant && tenant.unit_id) {
          await client.from('units').update({ status: 'VACANT' }).eq('id', tenant.unit_id);
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

      const { error } = await client.from('documents').insert([{
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

  // 12. TENANT PASSWORD FORM
  const formTenantPw = document.getElementById('form-tenant-password');
  if (formTenantPw) {
    formTenantPw.addEventListener('submit', submitTenantPasswordForm);
  }
}
