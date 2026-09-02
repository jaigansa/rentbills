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
  const elements = document.querySelectorAll('[id^="i18n-"]');
  elements.forEach(el => {
    const key = el.id.replace('i18n-', '').replace(/-/g, '_');
    if (translations[key]) {
      el.textContent = translations[key];
    }
  });

  const btn = document.getElementById('lang-switch-btn');
  if (btn) {
    btn.title = currentLang === 'en' ? 'Switch to தமிழ் (Tamil)' : 'Switch to English';
    btn.innerHTML = '<i data-lucide="globe"></i>';
    refreshLucideIcons();
  }
}

export function toggleLanguage() {
  const newLang = getCurrentLang() === 'en' ? 'ta' : 'en';
  setCurrentLang(newLang);
  loadTranslations(newLang);
}
