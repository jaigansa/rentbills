// RentBill Pro — Supabase Configuration & Initialization Engine

// Real credentials are NOT committed. They are injected at deploy time:
//   Cloudflare Pages -> js/core/build-config.js (generated from env vars)
// or per-browser via Settings (stored in localStorage).
// These placeholders make the app run but never expose a live key in git.
export const SUPABASE_CONFIG = {
  projectIdOrUrl: 'YOUR_PROJECT_ID',
  publishableOrAnonKey: 'YOUR_KEY'
};

let supabaseClient = null;

export function normalizeSupabaseUrl(input) {
  if (!input) return '';
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}.supabase.co`;
}

export function initSupabaseClient() {
  const storedUrl = localStorage.getItem('rentbill_sb_url');
  const storedKey = localStorage.getItem('rentbill_sb_key');

  // Build-injected values (Cloudflare Pages env vars via config.js generation)
  // take precedence, then per-browser localStorage override, then the committed
  // fallback. Keeps real project credentials out of the repo.
  const injectedUrl = (typeof window !== 'undefined' && window.__RENTBILL_SB_URL__) || '';
  const injectedKey = (typeof window !== 'undefined' && window.__RENTBILL_SB_KEY__) || '';

  const rawInput = injectedUrl || ((storedUrl && storedUrl !== 'YOUR_PROJECT_ID') ? storedUrl : SUPABASE_CONFIG.projectIdOrUrl);
  const keyInput = injectedKey || ((storedKey && storedKey !== 'YOUR_KEY') ? storedKey : SUPABASE_CONFIG.publishableOrAnonKey);

  const finalUrl = normalizeSupabaseUrl(rawInput);
  const finalKey = keyInput ? keyInput.trim() : '';

  if (!window.supabase) {
    console.error('Supabase CDN library (supabase-js) is not loaded.');
    return false;
  }

  if (finalUrl && finalKey) {
    try {
      supabaseClient = window.supabase.createClient(finalUrl, finalKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      return true;
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err);
      return false;
    }
  }
  return false;
}

export function getSupabaseClient() {
  return supabaseClient;
}

export function resetSupabaseConfig() {
  localStorage.removeItem('rentbill_sb_url');
  localStorage.removeItem('rentbill_sb_key');
  window.location.reload();
}
