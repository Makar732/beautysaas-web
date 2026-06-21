import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────
// Определяем URL для Supabase.
//
// В продакшене (Railway) запросы идут через наш прокси /api/supabase
// чтобы обойти блокировки РФ.
//
// В dev-режиме (локально) — тоже через прокси, который Vite
// перенаправит на сервер (настроено в vite.config.ts).
//
// VITE_SUPABASE_URL нужен только как fallback и для Auth redirect.
// ─────────────────────────────────────────────────────────────────

const REAL_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey   = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Прокси-URL: относительный путь → всегда на том же домене что и сайт
const PROXY_URL = '/api/supabase';

if (!REAL_SUPABASE_URL || REAL_SUPABASE_URL === 'undefined') {
  console.error('❌ VITE_SUPABASE_URL не задан!');
}

if (!supabaseAnonKey || supabaseAnonKey === 'undefined') {
  console.error('❌ VITE_SUPABASE_ANON_KEY не задан!');
}

export const supabase: SupabaseClient = createClient(
  PROXY_URL,         // ← все запросы к БД идут через наш сервер
  supabaseAnonKey,
  {
    auth: {
      persistSession:   true,
      autoRefreshToken: true,
      // Auth (OAuth, сессии) всё ещё идёт напрямую на Supabase
      // потому что редиректы Google OAuth должны знать реальный URL
      flowType: 'pkce',
    },
    global: {
      // Supabase SDK будет слать запросы на PROXY_URL,
      // но для Auth-эндпоинтов нужен реальный URL в заголовке
      headers: {
        'x-real-supabase-url': REAL_SUPABASE_URL,
      },
    },
  }
);

// ─── Проверка соединения (только в dev) ───────────────────────
async function testSupabaseConnection(): Promise<void> {
  try {
    const { error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      console.warn('⚠️ Supabase ответил с ошибкой:', error.message);
    } else {
      console.log('✅ Успешное подключение к Supabase через прокси!');
      console.log('📡 Прокси URL:', PROXY_URL);
      console.log('🌐 Реальный Supabase:', REAL_SUPABASE_URL);
    }
  } catch (err) {
    console.error('❌ Не удалось подключиться к Supabase:', err);
  }
}

if (import.meta.env.DEV) {
  testSupabaseConnection();
}

export default supabase;