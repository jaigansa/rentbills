// RentBill Pro — Backup, JSON Export/Restore, CSV Engines & App Settings
import { getSupabaseClient } from '../core/config.js';
import { safeInsert } from '../core/db.js';
import { getCurrentUser } from '../core/state.js';
import { loadDashboard } from './dashboard.js';
import { loadPropertiesPage, loadTenantsPage } from './properties.js';
import { loadOwnersPage } from './owners.js';
import { loadBillsPage } from './bills.js';
import { loadExpensesPage } from './expenses.js';
import { loadDiagnosticsPage, runDiagnosticsCheck } from './diagnostics.js';

export function exportToCSV(filename, rows) {
  if (!rows || !rows.length) {
    alert('No data available to export.');
    return;
  }

  const headers = Object.keys(rows[0]);
  let csvContent = headers.join(',') + '\n';

  rows.forEach(row => {
    const rowValues = headers.map(header => {
      let val = row[header] !== undefined && row[header] !== null ? String(row[header]) : '';
      val = val.replace(/"/g, '""');
      if (val.includes(',') || val.includes('\n') || val.includes('"')) {
        val = `"${val}"`;
      }
      return val;
    });
    csvContent += rowValues.join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportBillsCSV() {
  const supabaseClient = getSupabaseClient();
  try {
    if (!supabaseClient) return;
    const { data: bills } = await supabaseClient.from('bills').select('*').is('deleted_at', null);
    if (!bills || !bills.length) {
      alert('No bill invoices found to export.');
      return;
    }
    const exportData = bills.map(b => ({
      ID: b.id,
      UUID: b.uuid,
      TenantID: b.renter_id,
      BillingPeriod: b.billing_period,
      GrossAmountRupees: (b.gross_amount || 0) / 100,
      NetAmountRupees: (b.net_amount || 0) / 100,
      PaidAmountRupees: (b.paid_amount || 0) / 100,
      Status: b.status,
      CreatedAt: b.created_at
    }));
    exportToCSV('rentbill_bills', exportData);
  } catch (err) {
    alert('Failed to export bills: ' + err.message);
  }
}

export async function exportPaymentsCSV() {
  const supabaseClient = getSupabaseClient();
  try {
    if (!supabaseClient) return;
    const { data: payments } = await supabaseClient.from('payments').select('*').is('deleted_at', null);
    if (!payments || !payments.length) {
      alert('No payment records found to export.');
      return;
    }
    const exportData = payments.map(p => ({
      ID: p.id,
      UUID: p.uuid,
      BillID: p.bill_id,
      TenantID: p.renter_id,
      AmountRupees: (p.amount || 0) / 100,
      PaymentMethod: p.payment_method || '',
      ReferenceNo: p.transaction_reference || '',
      PaymentDate: p.payment_date || '',
      Status: p.proof_status || 'VERIFIED'
    }));
    exportToCSV('rentbill_payments', exportData);
  } catch (err) {
    alert('Failed to export payments: ' + err.message);
  }
}

export async function exportExpensesCSV() {
  const supabaseClient = getSupabaseClient();
  try {
    if (!supabaseClient) return;
    const { data: expenses } = await supabaseClient.from('expenses').select('*').is('deleted_at', null);
    if (!expenses || !expenses.length) {
      alert('No operating expenses found to export.');
      return;
    }
    const exportData = expenses.map(e => ({
      ID: e.id,
      Category: e.category,
      AmountRupees: (e.amount || 0) / 100,
      Date: e.date || '',
      OwnerName: e.owner_name || '',
      Notes: e.notes || ''
    }));
    exportToCSV('rentbill_expenses', exportData);
  } catch (err) {
    alert('Failed to export expenses: ' + err.message);
  }
}

export async function triggerManualBackup() {
  const supabaseClient = getSupabaseClient();
  try {
    if (!supabaseClient) {
      alert('Supabase client not initialized');
      return;
    }
    const [
      { data: properties },
      { data: units },
      { data: renters },
      { data: bills },
      { data: payments },
      { data: expenses },
      { data: owners },
      { data: owner_withdrawals }
    ] = await Promise.all([
      supabaseClient.from('properties').select('*'),
      supabaseClient.from('units').select('*'),
      supabaseClient.from('renters').select('*'),
      supabaseClient.from('bills').select('*'),
      supabaseClient.from('payments').select('*'),
      supabaseClient.from('expenses').select('*'),
      supabaseClient.from('owners').select('*'),
      supabaseClient.from('owner_withdrawals').select('*')
    ]);

    const backupData = {
      app: 'RentBill Pro',
      version: '2.0-static',
      export_date: new Date().toISOString(),
      data: {
        properties: properties || [],
        units: units || [],
        renters: renters || [],
        bills: bills || [],
        payments: payments || [],
        expenses: expenses || [],
        owners: owners || [],
        owner_withdrawals: owner_withdrawals || []
      }
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentbill_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert('Backup file created and downloaded successfully!');
    loadDiagnosticsPage();
  } catch (err) {
    alert('Backup failed: ' + err.message);
  }
}

export function triggerRestoreData() {
  const fileInput = document.getElementById('json-restore-file-input');
  if (fileInput) {
    fileInput.click();
  } else {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = handleRestoreFileUpload;
    input.click();
  }
}

export async function handleRestoreFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!confirm(`Are you sure you want to restore database records from file "${file.name}"? This will import records into your database.`)) return;

  try {
    const text = await file.text();
    const backupData = JSON.parse(text);

    let restoredCount = 0;
    const tables = ['properties', 'units', 'renters', 'owners', 'documents', 'expenses', 'owner_withdrawals', 'bills', 'payments'];

    for (const tbl of tables) {
      if (Array.isArray(backupData[tbl]) && backupData[tbl].length > 0) {
        await restoreTableData(tbl, backupData[tbl]);
        restoredCount += backupData[tbl].length;
      }
    }

    alert(`✅ Successfully restored ${restoredCount} records across database tables!`);
    location.reload();
  } catch (err) {
    alert('❌ Failed to restore data: ' + err.message);
  }
}

export async function restoreTableData(tableName, rows) {
  const supabaseClient = getSupabaseClient();
  if (!rows || rows.length === 0) return;
  if (supabaseClient) {
    const { error } = await supabaseClient.from(tableName).upsert(rows);
    if (error) console.warn(`Supabase restore warning for ${tableName}:`, error.message);
  }
}

export async function triggerSeedSampleData() {
  const supabaseClient = getSupabaseClient();
  if (!confirm('Would you like to insert realistic sample demo data (Owners, Property, Units, Tenants, Bills) into your Supabase database?')) return;

  try {
    if (!supabaseClient) {
      alert('Supabase client not initialized');
      return;
    }

    // 1. Seed Owners
    const { data: ownerRes } = await safeInsert(supabaseClient, 'owners', [
      { name: 'Rajesh Kumar', email: 'rajesh.kumar@example.com', mobile_number: '9876543210', upi_id: 'rajesh.kumar@okicici', bank_name: 'State Bank of India', account_number: '30123456789', ifsc_code: 'SBIN0001234' },
      { name: 'Priya Sharma', email: 'priya.sharma@example.com', mobile_number: '9812345678', upi_id: 'priya@okhdfcbank', bank_name: 'HDFC Bank', account_number: '50100987654321', ifsc_code: 'HDFC0000123' }
    ]);

    const ownerId = ownerRes && ownerRes.length > 0 ? ownerRes[0].id : null;
    const ownerName = ownerRes && ownerRes.length > 0 ? ownerRes[0].name : 'Rajesh Kumar';

    // 2. Seed Property
    const { data: propRes } = await safeInsert(supabaseClient, 'properties', [
      { name: 'Royal Heights Residency', address: '123 MG Road, Koramangala, Bengaluru, Karnataka 560034', agreement_terms: 'Standard 11-month lease agreement' }
    ]);

    const propertyId = propRes && propRes.length > 0 ? propRes[0].id : null;

    if (propertyId) {
      // 3. Seed Units
      const { data: unitRes } = await safeInsert(supabaseClient, 'units', [
        { property_id: propertyId, unit_name: 'Flat 101 (1BHK)', floor: '1st Floor', status: 'OCCUPIED' },
        { property_id: propertyId, unit_name: 'Flat 102 (2BHK)', floor: '1st Floor', status: 'OCCUPIED' },
        { property_id: propertyId, unit_name: 'Flat 201 (3BHK)', floor: '2nd Floor', status: 'VACANT' }
      ]);

      const unit1Id = unitRes && unitRes.length > 0 ? unitRes[0].id : null;
      const unit2Id = unitRes && unitRes.length > 1 ? unitRes[1].id : null;

      if (unit1Id && unit2Id) {
        // 4. Seed Tenants
        const { data: tenantRes } = await safeInsert(supabaseClient, 'renters', [
          {
            unit_id: unit1Id,
            owner_id: ownerId,
            owner_name: ownerName,
            name: 'Arun Varma',
            mobile_number: '9988776655',
            email: 'arun.v@example.com',
            aadhar_no: '1234 5678 9012',
            base_rent: 1500000,
            advance_amount: 6000000,
            maint_charge: 150000,
            eb_unit_price: 800,
            initial_eb: 1020,
            water_calc_mode: 'FIXED',
            water_fixed_charge: 15000,
            initial_water: 50,
            is_active: true
          },
          {
            unit_id: unit2Id,
            owner_id: ownerId,
            owner_name: ownerName,
            name: 'Suresh Menon',
            mobile_number: '9876512345',
            email: 'suresh.m@example.com',
            aadhar_no: '9876 5432 1098',
            base_rent: 2200000,
            advance_amount: 8800000,
            maint_charge: 200000,
            eb_unit_price: 800,
            initial_eb: 1450,
            water_calc_mode: 'METERED',
            water_unit_price: 500,
            initial_water: 120,
            is_active: true
          }
        ]);

        const renter1Id = tenantRes && tenantRes.length > 0 ? tenantRes[0].id : null;

        if (renter1Id) {
          // 5. Seed Bills & Expenses
          const nowStr = new Date().toISOString().slice(0, 7);
          await safeInsert(supabaseClient, 'bills', [
            {
              renter_id: renter1Id,
              billing_period: nowStr,
              prev_eb_reading: 1020,
              curr_eb_reading: 1140,
              eb_unit_price: 800,
              eb_amount: 96000,
              rent_amount: 1500000,
              maint_amount: 150000,
              water_calc_mode: 'FIXED',
              water_amount: 15000,
              paid_amount: 0,
              status: 'UNPAID'
            }
          ]);

          await safeInsert(supabaseClient, 'expenses', [
            { category: 'Plumbing & Repairs', amount: 350000, date: new Date().toISOString().slice(0, 10), notes: 'Fixed lobby pipe leak' }
          ]);
        }
      }
    }

    alert('🎉 Sample demo data seeded successfully!');
    loadDashboard();
    loadPropertiesPage();
    loadTenantsPage();
    loadBillsPage();
    loadExpensesPage();
    loadOwnersPage();
    loadDiagnosticsPage();
  } catch (err) {
    alert('Failed to seed sample data: ' + err.message);
  }
}

export async function loadSettingsPage() {
  const sbUrlInput = document.getElementById('cfg-sb-url');
  const sbKeyInput = document.getElementById('cfg-sb-key');
  if (sbUrlInput) sbUrlInput.value = localStorage.getItem('rentbill_sb_url') || '';
  if (sbKeyInput) sbKeyInput.value = localStorage.getItem('rentbill_sb_key') || '';

  const currentUser = getCurrentUser();
  const emailSpan = document.getElementById('settings-user-email');
  const roleSpan = document.getElementById('settings-user-role');
  if (emailSpan) emailSpan.textContent = currentUser.email || currentUser.username || 'Admin';
  if (roleSpan) roleSpan.textContent = currentUser.role || 'ADMIN';

  runDiagnosticsCheck();
}

export async function saveSupabaseSettings() {
  const urlVal = document.getElementById('cfg-sb-url').value.trim();
  const keyVal = document.getElementById('cfg-sb-key').value.trim();

  if (!urlVal || !keyVal) {
    alert('Please enter valid Supabase Project URL and Anon Key');
    return;
  }

  localStorage.setItem('rentbill_sb_url', urlVal);
  localStorage.setItem('rentbill_sb_key', keyVal);
  alert('✅ Supabase credentials saved successfully. Reloading application...');
  window.location.reload();
}

export async function testSupabaseConnection() {
  const supabaseClient = getSupabaseClient();
  const resultDiv = document.getElementById('sb-ping-result');
  if (resultDiv) {
    resultDiv.style.color = 'var(--text-muted)';
    resultDiv.textContent = '⏳ Testing connection...';
  }

  const startTime = performance.now();
  try {
    if (!supabaseClient) throw new Error('Supabase client not initialized');
    const { data, error } = await supabaseClient.from('properties').select('id').limit(1);
    const endTime = performance.now();
    const latency = Math.round(endTime - startTime);

    if (error) throw error;

    if (resultDiv) {
      resultDiv.style.color = 'var(--success)';
      resultDiv.textContent = `🟢 Connection Successful! Response time: ${latency} ms`;
    }
  } catch (err) {
    if (resultDiv) {
      resultDiv.style.color = 'var(--danger)';
      resultDiv.textContent = `🔴 Connection Failed: ${err.message}`;
    }
  }
}

export function saveAppSettings() {
  const appTitle = document.getElementById('cfg-app-title').value;
  const currency = document.getElementById('cfg-currency').value;
  const dueDay = document.getElementById('cfg-due-day').value;
  const waTemplate = document.getElementById('cfg-wa-template').value;

  localStorage.setItem('rentbill_app_title', appTitle);
  localStorage.setItem('rentbill_currency', currency);
  localStorage.setItem('rentbill_due_day', dueDay);
  localStorage.setItem('rentbill_wa_template', waTemplate);

  alert('✅ Application settings saved successfully!');
}

export function clearAppCache() {
  if (!confirm('Clear all local browser cache and reset application state? (Cloud database will not be affected)')) return;
  localStorage.removeItem('rentbill_sb_url');
  localStorage.removeItem('rentbill_sb_key');
  alert('🧹 Local cache cleared. Reloading page...');
  window.location.reload();
}
