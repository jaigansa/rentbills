// RentBill Pro — UI Helpers, Modals, Dropdowns & Formatting Utilities
import { populateBillingPeriods } from '../modules/bills.js';
import { populateOwnerSelects } from '../modules/owners.js';
import { populateTenantUnitSelect } from '../modules/properties.js';

export function formatCurrency(paise) {
  const rupees = (paise || 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(rupees);
}

export function escapeStr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

export function refreshLucideIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

export function formatInvoiceNumber(b) {
  if (!b) return 'INV-1001';
  if (b.invoice_no) return b.invoice_no;
  const num = parseInt(b.id, 10);
  if (!isNaN(num)) {
    return `INV-${1000 + num}`;
  }
  return `INV-${String(b.id || 1).padStart(4, '0')}`;
}

export function renderEmptyState(iconOrColspan = 6, title = 'No records found', subtitle = 'Use the action buttons above to create new entries.') {
  let colSpan = 6;
  let iconHtml = '<div style="font-size: 28px; margin-bottom: 6px;">📋</div>';

  if (typeof iconOrColspan === 'number' || (!isNaN(parseInt(iconOrColspan)) && !String(iconOrColspan).match(/^[a-zA-Z]/))) {
    colSpan = parseInt(iconOrColspan, 10) || 6;
  } else if (typeof iconOrColspan === 'string') {
    colSpan = 8;
    iconHtml = `<div style="font-size: 24px; margin-bottom: 8px; color: var(--primary);"><i data-lucide="${iconOrColspan}"></i></div>`;
  }

  return `
    <tr>
      <td colspan="${colSpan}" style="text-align: center; padding: 36px 16px; color: var(--text-muted);">
        ${iconHtml}
        <div style="font-weight: 600; color: var(--text-main); font-size: 14px;">${title}</div>
        <div style="font-size: 12px; margin-top: 4px; color: var(--text-muted);">${subtitle}</div>
      </td>
    </tr>
  `;
}

export function toggleDropdown(event, button) {
  if (event) {
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof event.preventDefault === 'function') event.preventDefault();
  }

  const currentDropdown = button ? button.closest('.dropdown') : null;
  if (!currentDropdown) return;

  // Locate dropdown menu whether in dropdown container or portaled to body
  let menu = currentDropdown.querySelector('.dropdown-menu');
  if (!menu && currentDropdown._portaledMenu) {
    menu = currentDropdown._portaledMenu;
  }
  if (!menu) return;

  const isCurrentlyOpen = menu.classList.contains('show-floating') || currentDropdown.classList.contains('active');

  closeAllDropdowns();

  if (!isCurrentlyOpen) {
    // 1. Move menu element to document.body (Portal) to escape parent container transforms/overflows
    if (menu.parentElement !== document.body) {
      menu._originalParent = currentDropdown;
      currentDropdown._portaledMenu = menu;
      document.body.appendChild(menu);
    }

    // 2. Measure exact rendered menu geometry
    menu.style.cssText = 'display: block !important; visibility: hidden !important; position: fixed !important; top: 0px !important; left: 0px !important; width: max-content !important; min-width: 195px !important; max-width: min(340px, 92vw) !important; margin: 0 !important;';

    const btnRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const actualWidth = Math.max(195, menuRect.width);
    const actualHeight = Math.max(50, menuRect.height);

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    // 3. Align right edge of menu flush with right edge of trigger button
    let left = btnRect.right - actualWidth;

    if (left + actualWidth > viewportWidth - 10) {
      left = viewportWidth - actualWidth - 10;
    }
    if (left < 10) {
      left = 10;
    }

    // 4. Position vertically below button; flip above if overflowing bottom
    let top = btnRect.bottom + 4;
    let isDropup = false;

    if (top + actualHeight > viewportHeight - 10) {
      if (btnRect.top - actualHeight - 4 >= 10) {
        top = btnRect.top - actualHeight - 4;
        isDropup = true;
      } else {
        top = Math.max(10, viewportHeight - actualHeight - 10);
      }
    }

    const transformOrigin = isDropup ? 'bottom right' : 'top right';

    // 5. Apply final pixel-perfect floating styles
    menu.style.cssText = `
      display: block !important;
      visibility: visible !important;
      position: fixed !important;
      top: ${Math.round(top)}px !important;
      left: ${Math.round(left)}px !important;
      width: max-content !important;
      min-width: 195px !important;
      max-width: min(340px, 92vw) !important;
      right: auto !important;
      bottom: auto !important;
      z-index: 999999 !important;
      margin: 0 !important;
      max-height: calc(100vh - 20px) !important;
      overflow-y: auto !important;
      transform-origin: ${transformOrigin} !important;
    `;
    menu.classList.add('show-floating');
    currentDropdown.classList.add('active');
    if (isDropup) currentDropdown.classList.add('dropup');
  }
}

export function closeAllDropdowns() {
  document.querySelectorAll('.dropdown.active').forEach(d => {
    d.classList.remove('active', 'dropup');
    if (d._portaledMenu) {
      const m = d._portaledMenu;
      m.classList.remove('show-floating');
      m.style.cssText = '';
      if (m.parentElement === document.body && d) {
        d.appendChild(m);
      }
      delete d._portaledMenu;
      delete m._originalParent;
    }
  });

  // Fallback cleanup for any orphaned floating menus
  document.querySelectorAll('.dropdown-menu.show-floating').forEach(m => {
    m.classList.remove('show-floating');
    m.style.cssText = '';
    if (m._originalParent && m.parentElement === document.body) {
      m._originalParent.appendChild(m);
      delete m._originalParent._portaledMenu;
      delete m._originalParent;
    }
  });
}

export function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
    if (id === 'modal-add-bill') {
      populateBillingPeriods();
    }
    if (id === 'modal-add-withdrawal' || id === 'modal-add-expense' || id === 'modal-add-property' || id === 'modal-add-tenant') {
      populateOwnerSelects();
    }
    if (id === 'modal-add-tenant') {
      const editId = document.getElementById('edit-tenant-id')?.value;
      if (!editId) {
        populateTenantUnitSelect();
      }
    }
    refreshLucideIcons();
  }
}

export function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
    if (id === 'modal-add-tenant') {
      const editTenantEl = document.getElementById('edit-tenant-id');
      if (editTenantEl) editTenantEl.value = '';
      const form = document.getElementById('form-add-tenant');
      if (form) form.reset();
      const pwEl = document.getElementById('tenant-password');
      if (pwEl) {
        pwEl.value = '';
        pwEl.placeholder = 'Min 6 chars to enable login';
      }
    }
    if (id === 'modal-add-property') {
      const editPropEl = document.getElementById('edit-property-id');
      if (editPropEl) editPropEl.value = '';
      const form = document.getElementById('form-add-property');
      if (form) form.reset();
    }
    if (id === 'modal-add-unit') {
      const editUnitEl = document.getElementById('edit-unit-id');
      if (editUnitEl) editUnitEl.value = '';
      const form = document.getElementById('form-add-unit');
      if (form) form.reset();
    }
    if (id === 'modal-add-owner') {
      const editOwnerEl = document.getElementById('edit-owner-id');
      if (editOwnerEl) editOwnerEl.value = '';
      const form = document.getElementById('form-add-owner');
      if (form) form.reset();
    }
  }
}

export function numberToWordsINR(paise) {
  if (!paise || paise <= 0) return 'Zero Rupees Only';

  const rupees = Math.floor(paise / 100);
  const paiseRem = Math.round(paise % 100);

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 
                'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertChunk(num) {
    let str = '';
    if (num >= 100) {
      str += ones[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }
    if (num >= 20) {
      str += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    }
    if (num > 0) {
      str += ones[num] + ' ';
    }
    return str.trim();
  }

  function inrWords(num) {
    if (num === 0) return 'Zero';
    let str = '';

    if (Math.floor(num / 10000000) > 0) {
      str += convertChunk(Math.floor(num / 10000000)) + ' Crore ';
      num %= 10000000;
    }
    if (Math.floor(num / 100000) > 0) {
      str += convertChunk(Math.floor(num / 100000)) + ' Lakh ';
      num %= 100000;
    }
    if (Math.floor(num / 1000) > 0) {
      str += convertChunk(Math.floor(num / 1000)) + ' Thousand ';
      num %= 1000;
    }
    if (num > 0) {
      str += convertChunk(num);
    }
    return str.trim();
  }

  let words = inrWords(rupees) + ' Rupees';
  if (paiseRem > 0) {
    words += ' and ' + convertChunk(paiseRem) + ' Paise';
  }
  return words.trim() + ' Only';
}
