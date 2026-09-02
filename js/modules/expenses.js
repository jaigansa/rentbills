// RentBill Pro — Operating Expenses & Owner Withdrawals Management
import { getSupabaseClient } from '../core/config.js';
import { formatCurrency, escapeStr, renderEmptyState, refreshLucideIcons } from '../core/ui.js';
import { populateOwnerSelects } from './owners.js';

export async function loadExpensesPage() {
  const supabaseClient = getSupabaseClient();
  try {
    if (!supabaseClient) return;
    await populateOwnerSelects();

    // 1. Load Operating Expenses
    const { data: expenses } = await supabaseClient.from('expenses').select('*').is('deleted_at', null).order('date', { ascending: false });
    const tbodyExpenses = document.getElementById('table-body-expenses');
    if (tbodyExpenses) {
      tbodyExpenses.innerHTML = '';
      if (!expenses || expenses.length === 0) {
        tbodyExpenses.innerHTML = renderEmptyState(5, 'No operating expenses logged yet');
      } else {
        expenses.forEach(e => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td data-label="Category"><strong>${e.category}</strong></td>
            <td data-label="Amount">${formatCurrency(e.amount)}</td>
            <td data-label="Date">${e.date || '-'}</td>
            <td data-label="Notes">${e.notes || '-'}</td>
            <td data-label="Actions">
              <div class="dropdown">
                <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
                <div class="dropdown-menu">
                  <button class="dropdown-item danger" onclick="triggerDeleteExpense(${e.id}, '${escapeStr(e.category)}')"><i data-lucide="trash-2"></i> Delete Expense</button>
                </div>
              </div>
            </td>
          `;
          tbodyExpenses.appendChild(tr);
        });
      }
    }

    // 2. Load Owner Withdrawals
    const { data: withdrawals } = await supabaseClient.from('owner_withdrawals').select('*').is('deleted_at', null).order('date', { ascending: false });
    const tbodyWithdrawals = document.getElementById('table-body-withdrawals');
    if (tbodyWithdrawals) {
      tbodyWithdrawals.innerHTML = '';
      if (!withdrawals || withdrawals.length === 0) {
        tbodyWithdrawals.innerHTML = renderEmptyState(5, 'No owner withdrawals recorded yet');
      } else {
        withdrawals.forEach(w => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td data-label="Owner Name"><strong>${w.owner_name}</strong></td>
            <td data-label="Amount"><strong>${formatCurrency(w.amount)}</strong></td>
            <td data-label="Date">${w.date || '-'}</td>
            <td data-label="Notes">${w.notes || '-'}</td>
            <td data-label="Actions">
              <div class="dropdown">
                <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
                <div class="dropdown-menu">
                  <button class="dropdown-item danger" onclick="triggerDeleteWithdrawal(${w.id}, '${escapeStr(w.owner_name)}')"><i data-lucide="trash-2"></i> Delete Withdrawal</button>
                </div>
              </div>
            </td>
          `;
          tbodyWithdrawals.appendChild(tr);
        });
      }
    }
    refreshLucideIcons();

  } catch (err) {
    console.error('Failed to load expenses', err);
  }
}

export async function triggerDeleteExpense(id, category) {
  const supabaseClient = getSupabaseClient();
  if (!confirm(`Are you sure you want to delete expense "${category}"?`)) return;
  const { error } = await supabaseClient.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) alert('Failed to delete expense: ' + error.message);
  else loadExpensesPage();
}

export async function triggerDeleteWithdrawal(id, ownerName) {
  const supabaseClient = getSupabaseClient();
  if (!confirm(`Are you sure you want to delete withdrawal record for "${ownerName}"?`)) return;
  const { error } = await supabaseClient.from('owner_withdrawals').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) alert('Failed to delete withdrawal: ' + error.message);
  else loadExpensesPage();
}
