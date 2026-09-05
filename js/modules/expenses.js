// RentBill Pro — Operating Expenses & Owner Withdrawals Management
import { getSupabaseClient } from '../core/config.js';
import { safeDelete } from '../core/db.js';
import { formatCurrency, escapeStr, renderEmptyState, refreshLucideIcons } from '../core/ui.js';
import { populateOwnerSelects } from './owners.js';

export async function loadExpensesPage() {
  const supabaseClient = getSupabaseClient();
  try {
    if (!supabaseClient) return;
    await populateOwnerSelects();

    // 1. Load Operating Expenses
    const { data: expenses } = await supabaseClient.from('expenses').select('*').is('deleted_at', null).order('expense_date', { ascending: false });
    const tbodyExpenses = document.getElementById('table-body-expenses');
    if (tbodyExpenses) {
      tbodyExpenses.innerHTML = '';
      if (!expenses || expenses.length === 0) {
        tbodyExpenses.innerHTML = renderEmptyState(5, 'No operating expenses logged yet');
      } else {
        expenses.forEach(e => {
          const expenseDate = e.expense_date || e.date || '-';
          const expenseNotes = e.description || e.notes || '-';
          const tr = document.createElement('tr');
          tr.className = 'expense-card-row';
          tr.innerHTML = `
            <td data-label="Category">
              <div class="expense-mobile-header">
                <div class="expense-cat-badge">
                  <i data-lucide="receipt" class="mobile-only"></i>
                  <strong>${escapeStr(e.category)}</strong>
                </div>
                <div class="expense-date-tag mobile-only">${expenseDate}</div>
              </div>
            </td>
            <td data-label="Amount">
              <span class="expense-amount-val">-${formatCurrency(e.amount)}</span>
            </td>
            <td data-label="Date" class="expense-desktop-col">${expenseDate}</td>
            <td data-label="Notes">
              <span class="expense-notes-text">${escapeStr(expenseNotes)}</span>
            </td>
            <td data-label="Actions">
              <div class="dropdown">
                <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
                <div class="dropdown-menu">
                  <button class="dropdown-item danger" onclick="triggerDeleteExpense(${e.id}, '${escapeStr(e.category)}')"><i data-lucide="trash-2"></i> Delete Expense</button>
                </div>
              </div>
              <div class="expense-mobile-quick-actions mobile-only">
                <button type="button" class="btn-quick-action action-delete" onclick="triggerDeleteExpense(${e.id}, '${escapeStr(e.category)}')">
                  <i data-lucide="trash-2"></i> Delete
                </button>
              </div>
            </td>
          `;
          tbodyExpenses.appendChild(tr);
        });
      }
    }

    // 2. Load Owner Withdrawals
    const { data: withdrawals } = await supabaseClient.from('owner_withdrawals').select('*').is('deleted_at', null).order('withdrawal_date', { ascending: false });
    const { data: ownersData } = await supabaseClient.from('owners').select('id, name');
    const ownerMap = {};
    (ownersData || []).forEach(o => { ownerMap[o.id] = o.name; });

    const tbodyWithdrawals = document.getElementById('table-body-withdrawals');
    if (tbodyWithdrawals) {
      tbodyWithdrawals.innerHTML = '';
      if (!withdrawals || withdrawals.length === 0) {
        tbodyWithdrawals.innerHTML = renderEmptyState(5, 'No owner withdrawals recorded yet');
      } else {
        withdrawals.forEach(w => {
          const ownerName = ownerMap[w.owner_id] || w.owner_name || (w.owner_id ? `Owner #${w.owner_id}` : '-');
          const withdrawalDate = w.withdrawal_date || w.date || '-';
          const tr = document.createElement('tr');
          tr.className = 'withdrawal-card-row';
          tr.innerHTML = `
            <td data-label="Owner Name">
              <div class="withdrawal-mobile-header">
                <div class="withdrawal-name-wrap">
                  <i data-lucide="user-check" class="mobile-only"></i>
                  <strong>${escapeStr(ownerName)}</strong>
                </div>
                <div class="withdrawal-date-tag mobile-only">${withdrawalDate}</div>
              </div>
            </td>
            <td data-label="Amount">
              <span class="withdrawal-amount-val">-${formatCurrency(w.amount)}</span>
            </td>
            <td data-label="Date" class="expense-desktop-col">${withdrawalDate}</td>
            <td data-label="Notes">
              <span class="withdrawal-notes-text">${escapeStr(w.notes || '-')}</span>
            </td>
            <td data-label="Actions">
              <div class="dropdown">
                <button class="dropdown-btn" onclick="toggleDropdown(event, this)">⋮</button>
                <div class="dropdown-menu">
                  <button class="dropdown-item danger" onclick="triggerDeleteWithdrawal(${w.id}, '${escapeStr(ownerName)}')"><i data-lucide="trash-2"></i> Delete Withdrawal</button>
                </div>
              </div>
              <div class="expense-mobile-quick-actions mobile-only">
                <button type="button" class="btn-quick-action action-delete" onclick="triggerDeleteWithdrawal(${w.id}, '${escapeStr(ownerName)}')">
                  <i data-lucide="trash-2"></i> Delete
                </button>
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
  const { error } = await safeDelete(supabaseClient, 'expenses', id);
  if (error) alert('Failed to delete expense: ' + error.message);
  else loadExpensesPage();
}

export async function triggerDeleteWithdrawal(id, ownerName) {
  const supabaseClient = getSupabaseClient();
  if (!confirm(`Are you sure you want to delete withdrawal record for "${ownerName}"?`)) return;
  const { error } = await safeDelete(supabaseClient, 'owner_withdrawals', id);
  if (error) alert('Failed to delete withdrawal: ' + error.message);
  else loadExpensesPage();
}
