// RentBill Pro — Multi-language Internationalization (i18n) Engine
import { getCurrentLang, setCurrentLang, setTranslations, getTranslations } from './state.js';
import { refreshLucideIcons } from './ui.js';

export async function loadTranslations(lang) {
  try {
    const res = await fetch(`i18n/${lang}.json`);
    const data = await res.json();
    setTranslations(data);
    applyTranslations();
  } catch (err) {
    console.warn('Translations fallback', err);
  }
}

export function applyTranslations() {
  const translations = getTranslations();
  const currentLang = getCurrentLang();

  // 1. Target elements with id="i18n-..."
  const elementsById = document.querySelectorAll('[id^="i18n-"]');
  elementsById.forEach(el => {
    const key = el.id.replace('i18n-', '').replace(/-/g, '_');
    if (translations[key]) {
      if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
        el.value = translations[key];
      } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translations[key];
      } else {
        el.textContent = translations[key];
      }
    }
  });

  // 2. Target elements with data-i18n="..."
  const elementsByData = document.querySelectorAll('[data-i18n]');
  elementsByData.forEach(el => {
    const key = el.dataset.i18n;
    if (translations[key]) {
      if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) {
        el.value = translations[key];
      } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translations[key];
      } else {
        el.textContent = translations[key];
      }
    }
  });

  // 3. Target elements with data-i18n-placeholder="..."
  const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
  placeholders.forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (translations[key]) {
      el.placeholder = translations[key];
    }
  });

  const btn = document.getElementById('lang-switch-btn');
  if (btn) {
    btn.title = currentLang === 'en' ? 'Switch to தமிழ் (Tamil)' : 'Switch to English';
    btn.innerHTML = '<i data-lucide="globe"></i>';
    refreshLucideIcons();
  }
}

export function t(key, fallback = '') {
  const translations = getTranslations();
  return translations[key] || fallback || key;
}

export function toggleLanguage() {
  const newLang = getCurrentLang() === 'en' ? 'ta' : 'en';
  setCurrentLang(newLang);
  loadTranslations(newLang);
}
