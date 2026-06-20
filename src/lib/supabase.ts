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
// ПРОКСИ ДЛЯ РФ: в продакшене все запросы идут через Railway
// (/supabase-proxy → supabase.co). В dev — напрямую.
// Логика авторизации, OAuth (VK, Yandex), онбординг — НЕ ТРОГАЕМ.
// ─────────────────────────────────────────────────────────────
const clientUrl: string = import.meta.env.DEV
  ? supabaseUrl
  : '/supabase-proxy';

export const supabase: SupabaseClient = createClient(
  clientUrl,
  supabaseAnonKey,
  {
    auth: {
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