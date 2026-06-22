import { createClient, SupabaseClient } from '@supabase/supabase-js';

const REAL_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey   = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const PROXY_URL = `${window.location.origin}/api/supabase`;

if (!REAL_SUPABASE_URL || REAL_SUPABASE_URL === 'undefined') {
  console.error('❌ VITE_SUPABASE_URL не задан!');
}

if (!supabaseAnonKey || supabaseAnonKey === 'undefined') {
  console.error('❌ VITE_SUPABASE_ANON_KEY не задан!');
}

export const supabase: SupabaseClient = createClient(
  PROXY_URL,
  supabaseAnonKey,
  {
    auth: {
      persistSession:   true,
      autoRefreshToken: true,
      flowType: 'pkce',
    },
    global: {
      headers: {
        'x-real-supabase-url': REAL_SUPABASE_URL,
      },
    },
    db: {
      schema: 'public',
    },
  }
);

async function testSupabaseConnection(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      console.warn('⚠️ Supabase ответил с ошибкой:', error.message);
    } else {
      console.log('✅ Подключение к Supabase через прокси работает!');
      console.log('📡 Прокси URL:', PROXY_URL);
      console.log('🌐 Реальный Supabase:', REAL_SUPABASE_URL);
      console.log('👥 Профилей найдено:', data?.length ?? 0);
    }
  } catch (err) {
    console.error('❌ Не удалось подключиться к Supabase:', err);
  }
}

if (import.meta.env.DEV) {
  testSupabaseConnection();
}

export default supabase;