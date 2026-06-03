import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl === 'undefined') {
  console.error('❌ VITE_SUPABASE_URL не задан!');
}

if (!supabaseAnonKey || supabaseAnonKey === 'undefined') {
  console.error('❌ VITE_SUPABASE_ANON_KEY не задан!');
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

async function testSupabaseConnection(): Promise<void> {
  try {
    const { error } = await supabase
      .from('profiles')  // ✅ было 'masters' — исправлено
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      console.warn('⚠️ Supabase ответил с ошибкой:', error.message);
    } else {
      console.log('✅ Успешное подключение к Supabase на фронтенде!');
      console.log('📡 URL:', supabaseUrl);
    }
  } catch (err) {
    console.error('❌ Не удалось подключиться к Supabase:', err);
  }
}

if (import.meta.env.DEV) {
  testSupabaseConnection();
}

export default supabase;