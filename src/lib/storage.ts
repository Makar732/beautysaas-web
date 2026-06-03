import { supabase } from './supabase';
import { Master, Service, Booking, AppUser } from '../types';

export const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';

const KEYS = {
  USER: 'beauty_saas_user',
};

// ---- USER SESSION ----
export function getUser(): AppUser | null {
  try {
    const data = localStorage.getItem(KEYS.USER);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function saveUser(user: AppUser) {
  localStorage.setItem(KEYS.USER, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(KEYS.USER);
}

export function initStorage() {}

// ---- PROFILES (бывший masters) ----
export async function getMasterBySlug(slug: string): Promise<Master | null> {
  console.log('🔍 Ищем мастера по slug:', slug);
  const { data, error } = await supabase
    .from('profiles')        // ✅ было masters
    .select('*')
    .eq('slug', slug)
    .single();
    
  if (error) {
    console.error('Ошибка получения мастера по slug:', error);
    return null;
  }
  return data;
}

export async function getMasterById(id: string): Promise<Master | null> {
  console.log('🔍 Ищем мастера по id:', id);
  const { data, error } = await supabase
    .from('profiles')        // ✅ было masters
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Ошибка получения мастера по id:', error);
    return null;
  }
  return data;
}

export async function upsertMaster(master: Master): Promise<void> {
  const dbMaster = {
    id: master.id,
    name: master.name,
    slug: master.slug,
    phone: master.phone,
    telegram_chat_id: master.telegram_chat_id || '',
    telegram_bot_token: master.telegram_bot_token || '',
    working_hours: master.workingHours || { start: '09:00', end: '21:00' },
    days_off: master.daysOff || [],
    created_at: master.created_at,
  };

  console.log('💾 Сохраняем профиль в profiles:', dbMaster);
  const { error } = await supabase
    .from('profiles')        // ✅ было masters
    .upsert(dbMaster);
    
  if (error) console.error('Ошибка сохранения профиля:', error);
  else console.log('✅ Профиль сохранён!');
}

// ---- SERVICES ----
export async function getServicesByMasterId(masterId: string): Promise<Service[]> {
  console.log('🔍 Загружаем услуги для мастера:', masterId);
  const { data, error } = await supabase
    .from('services')        // ✅ без изменений
    .select('*')
    .eq('master_id', masterId);
    
  if (error) {
    console.error('Ошибка получения услуг:', error);
    return [];
  }
  console.log('✅ Услуги загружены:', data);
  return data || [];
}

export async function upsertService(service: Service): Promise<void> {
  console.log('💾 Сохраняем услугу:', service);
  const { error } = await supabase
    .from('services')        // ✅ без изменений
    .upsert(service);
    
  if (error) {
    console.error('Ошибка сохранения услуги:', error);
    throw error;
  }
  console.log('✅ Услуга сохранена!');
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await supabase
    .from('services')
    .delete()
    .eq('id', id);
  if (error) console.error('Ошибка удаления услуги:', error);
}

// ---- APPOINTMENTS (бывший bookings) ----
export async function getBookingsByMasterId(masterId: string): Promise<Booking[]> {
  console.log('🔍 Загружаем записи для мастера:', masterId);
  const { data, error } = await supabase
    .from('appointments')    // ✅ было bookings
    .select('*')
    .eq('master_id', masterId);
    
  if (error) {
    console.error('Ошибка получения записей:', error);
    return [];
  }
  console.log('✅ Записи загружены:', data);
  return data || [];
}

export async function addBooking(booking: Booking): Promise<void> {
  console.log('💾 Сохраняем запись:', booking);
  const { error } = await supabase
    .from('appointments')    // ✅ было bookings
    .insert(booking);
    
  if (error) {
    console.error('Ошибка создания записи:', error);
    throw error;
  }
  console.log('✅ Запись создана!');
}

export async function updateBookingStatus(
  id: string,
  status: Booking['status']
): Promise<void> {
  const { error } = await supabase
    .from('appointments')    // ✅ было bookings
    .update({ status })
    .eq('id', id);
  if (error) console.error('Ошибка обновления статуса:', error);
}

export async function deleteBooking(id: string): Promise<void> {
  const { error } = await supabase
    .from('appointments')    // ✅ было bookings
    .delete()
    .eq('id', id);
  if (error) console.error('Ошибка удаления записи:', error);
}