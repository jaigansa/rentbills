// RentBill Pro — Supabase Configuration & Initialization Engine

// Supabase project credentials (can also be customized in-browser via Settings):
export const SUPABASE_CONFIG = {
  url: 'https://kkixhxrniodyndgzkqgq.supabase.co',
  anonKey: 'sb_publishable_zy5YRiETmug7i0qUII8pJQ_fVrF1th-',
  get projectIdOrUrl() { return this.url; },
  get publishableOrAnonKey() { return this.anonKey; }
};

let supabaseClient = null;

function sanitizeConfigVal(val) {
  if (!val) return '';
  let s = String(val).trim().replace(/^["']|["']$/g, '').trim();
  if (/^(YOUR_PROJECT_ID|YOUR_KEY|YOUR_SUPABASE_URL|YOUR_ANON_KEY)$/i.test(s)) {
    return '';
  }
  return s;
}

export function normalizeSupabaseUrl(input) {
  const clean = sanitizeConfigVal(input);
  if (!clean) return '';
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean.replace(/\/+$/, '');
  }
  return `https://${clean}.supabase.co`;
}

export function initSupabaseClient() {
  const storedUrl = sanitizeConfigVal(localStorage.getItem('rentbill_sb_url'));
  const storedKey = sanitizeConfigVal(localStorage.getItem('rentbill_sb_key'));

  const rawInput = storedUrl || SUPABASE_CONFIG.projectIdOrUrl;
  const keyInput = storedKey || SUPABASE_CONFIG.publishableOrAnonKey;

  const finalUrl = normalizeSupabaseUrl(rawInput);
  const finalKey = sanitizeConfigVal(keyInput);

  if (!window.supabase) {
    console.error('Supabase CDN library (supabase-js) is not loaded.');
    return false;
  }

  if (finalUrl && finalKey && finalUrl !== 'https://YOUR_PROJECT_ID.supabase.co' && finalKey !== 'YOUR_KEY') {
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
