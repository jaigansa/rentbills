// RentBill Pro — Theme Manager (Light, Dark, System Defaults)
import { refreshLucideIcons } from './ui.js';

export function initTheme() {
  const savedTheme = localStorage.getItem('rentbill_theme') || 'system';
  applyThemeMode(savedTheme);
}

export function applyThemeMode(theme) {
  let activeTheme = theme;
  if (theme === 'system') {
    activeTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  document.documentElement.setAttribute('data-theme', activeTheme);

  const themeIcon = document.getElementById('theme-icon');
  const themeSelect = document.getElementById('cfg-theme');

  if (themeSelect) themeSelect.value = theme;

  if (themeIcon) {
    themeIcon.setAttribute('data-lucide', activeTheme === 'dark' ? 'sun' : 'moon');
    refreshLucideIcons();
  }
}

export function toggleTheme() {
  const currentAttr = document.documentElement.getAttribute('data-theme');
  const newTheme = currentAttr === 'dark' ? 'light' : 'dark';
  localStorage.setItem('rentbill_theme', newTheme);
  applyThemeMode(newTheme);
}

export function setTheme(theme) {
  localStorage.setItem('rentbill_theme', theme);
  applyThemeMode(theme);
}
