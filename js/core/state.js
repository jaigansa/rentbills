// RentBill Pro — Centralized Application State Management

export const state = {
  currentLang: 'en',
  translations: {},
  currentUser: { id: null, username: '', role: 'TENANT', email: '' },
  currentActiveSubTab: 'properties',
  uploadedDocBase64: ''
};

export function getCurrentUser() {
  return state.currentUser;
}

export function setCurrentUser(user) {
  state.currentUser = { ...state.currentUser, ...user };
}

export function getCurrentLang() {
  return state.currentLang;
}

export function setCurrentLang(lang) {
  state.currentLang = lang;
}

export function getTranslations() {
  return state.translations;
}

export function setTranslations(t) {
  state.translations = t;
}

export function getActiveSubTab() {
  return state.currentActiveSubTab;
}

export function setActiveSubTab(tab) {
  state.currentActiveSubTab = tab;
}

export function getUploadedDocBase64() {
  return state.uploadedDocBase64;
}

export function setUploadedDocBase64(b64) {
  state.uploadedDocBase64 = b64;
}
