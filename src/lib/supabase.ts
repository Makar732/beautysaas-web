import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl === 'undefined') {
  console.error('❌ VITE_SUPABASE_URL не задан!');
}

if (!supabaseAnonKey || supabaseAnonKey === 'undefined') {
  console.error('❌ VITE_SUPABASE_ANON_KEY не задан!');
}

// ─────────────────────────────────────────────────────────────
// ПРОКСИ: в проде запросы идут через наш сервер на Railway,
// чтобы обойти блокировку Supabase через ТСПУ/РКН в РФ.
// В dev-режиме используем оригинальный URL напрямую.
// Логика авторизации и онбординга не меняется.
// ─────────────────────────────────────────────────────────────
const clientUrl: string = import.meta.env.DEV
  ? supabaseUrl
  : '/supabase-proxy';

export const supabase: SupabaseClient = createClient(
  clientUrl,
  supabaseAnonKey,
  {
    auth: {
      // ✅ ВКЛЮЧАЕМ — без этого Google OAuth не работает (сессия теряется после редиректа)
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

async function testSupabaseConnection(): Promise<void> {
  try {
    const { error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      console.warn('⚠️ Supabase ответил с ошибкой:', error.message);
    } else {
      console.log('✅ Успешное подключение к Supabase!');
      console.log('📡 URL:', clientUrl);
    }
  } catch (err) {
    console.error('❌ Не удалось подключиться к Supabase:', err);
  }
}

if (import.meta.env.DEV) {
  testSupabaseConnection();
}

export default supabase;