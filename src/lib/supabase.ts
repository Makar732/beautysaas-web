import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// Оригинальные данные Supabase
// ─────────────────────────────────────────────────────────────
const supabaseUrl: string     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ─────────────────────────────────────────────────────────────
// URL прокси — со слэшем в конце чтобы SDK правильно строил пути
// https://beautysaas-crm.ru/proxy/supabase/ + rest/v1/profiles
// ─────────────────────────────────────────────────────────────
const appUrl: string =
  import.meta.env.VITE_APP_URL || window.location.origin;

// ⚠️ ВАЖНО: слэш в конце обязателен!
const proxyRestUrl = `${appUrl}/proxy/supabase/`;

// ─────────────────────────────────────────────────────────────
// ВАЛИДАЦИЯ
// ─────────────────────────────────────────────────────────────
if (!supabaseUrl || supabaseUrl === 'undefined') {
  console.error('❌ VITE_SUPABASE_URL не задан!');
}
if (!supabaseAnonKey || supabaseAnonKey === 'undefined') {
  console.error('❌ VITE_SUPABASE_ANON_KEY не задан!');
}

// ─────────────────────────────────────────────────────────────
// SUPABASE КЛИЕНТ
// ─────────────────────────────────────────────────────────────
export const supabase: SupabaseClient = createClient(
  proxyRestUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession:   true,
      autoRefreshToken: true,
    },
  }
);

// ─────────────────────────────────────────────────────────────
// ДИАГНОСТИКА (только локально)
// ─────────────────────────────────────────────────────────────
if (import.meta.env.DEV) {
  console.log('🔧 Режим: Supabase Proxy');
  console.log('📡 Proxy URL:', proxyRestUrl);

  supabase
    .from('profiles')
    .select('id')
    .limit(1)
    .then(({ data, error }) => {
      if (error && error.code !== 'PGRST116') {
        console.warn('⚠️ Proxy тест не прошёл:', error.message);
      } else {
        console.log('✅ Proxy работает! data:', data);
      }
    });
}

export default supabase;