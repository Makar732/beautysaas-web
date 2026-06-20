import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// Оригинальные данные Supabase (нужны серверу для форвардинга)
// ─────────────────────────────────────────────────────────────
const supabaseUrl: string     = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ─────────────────────────────────────────────────────────────
// URL нашего прокси на Railway
// Продакшн : https://www.beautysaas-crm.ru
// Локально  : http://localhost:3000 (Vite сам проксирует через vite.config.ts)
// ─────────────────────────────────────────────────────────────
const appUrl: string =
  import.meta.env.VITE_APP_URL || window.location.origin;

const proxyRestUrl = `${appUrl}/proxy/supabase`;

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
// SUPABASE КЛИЕНТ — все запросы идут через наш Railway-прокси
// ─────────────────────────────────────────────────────────────
export const supabase: SupabaseClient = createClient(
  proxyRestUrl,   // ← вместо supabaseUrl — наш прокси
  supabaseAnonKey,
  {
    auth: {
      persistSession:   true,
      autoRefreshToken: true,
      // Auth-запросы (/auth/v1/*) тоже пойдут через proxyRestUrl
      // потому что Supabase SDK строит URL как: baseUrl + /auth/v1/...
    },
  }
);

// ─────────────────────────────────────────────────────────────
// ДИАГНОСТИКА (только локально)
// ─────────────────────────────────────────────────────────────
if (import.meta.env.DEV) {
  console.log('🔧 Режим: Supabase Proxy');
  console.log('📡 REST  →', proxyRestUrl);
  console.log('🌍 App URL:', appUrl);

  supabase
    .from('profiles')
    .select('id')
    .limit(1)
    .then(({ error }) => {
      if (error && error.code !== 'PGRST116') {
        console.warn('⚠️ Proxy тест не прошёл:', error.message);
      } else {
        console.log('✅ Proxy работает!');
      }
    });
}

export default supabase;