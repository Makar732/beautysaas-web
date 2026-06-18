// src/lib/storage.ts

import { supabase } from './supabase';
import { Master, Service, Booking, AppUser, SalonMaster, MASTER_LIMITS } from '../types';

// ── Реэкспорт констант и типов ────────────────────────────
export { MASTER_LIMITS };
export type { SalonMaster };

// ─────────────────────────────────────────────────────────
const KEYS = { USER: 'beauty_saas_user' };

// ---- USER SESSION ----------------------------------------
export function getUser(): AppUser | null {
  try {
    const data = localStorage.getItem(KEYS.USER);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}
export function saveUser(user: AppUser) {
  localStorage.setItem(KEYS.USER, JSON.stringify(user));
}
export function clearUser() {
  localStorage.removeItem(KEYS.USER);
}
export function initStorage() {}

// ---- PROFILES --------------------------------------------
export async function getMasterBySlug(slug: string): Promise<Master | null> {
  console.log('🔍 Ищем мастера по slug:', slug);
  const { data, error } = await supabase
    .from('profiles').select('*').eq('slug', slug).single();
  if (error) { console.error('Ошибка getMasterBySlug:', error); return null; }
  return normalizeMaster(data);
}

export async function getMasterById(id: string): Promise<Master | null> {
  console.log('🔍 Ищем мастера по id:', id);
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', id).single();
  if (error) { console.error('Ошибка getMasterById:', error); return null; }
  return normalizeMaster(data);
}

function normalizeMaster(data: any): Master {
  return {
    id:                 data.id,
    name:               data.name,
    slug:               data.slug,
    phone:              data.phone,
    telegram_chat_id:   data.telegram_chat_id   || '',
    telegram_bot_token: data.telegram_bot_token || '',
    telegram_id:        data.telegram_id        || '',
    trial_start_date:   data.trial_start_date   || new Date().toISOString(),
    is_premium:         data.is_premium         || false,
    plan_type:          data.plan_type          || 'solo',
    premium_expires_at: data.premium_expires_at ?? null,
    workingHours:       data.working_hours      || { start: '09:00', end: '21:00' },
    daysOff:            data.days_off           || [],
    created_at:         data.created_at,
  };
}

export async function upsertMaster(master: Master): Promise<void> {
  const dbMaster = {
    id:                 master.id,
    name:               master.name,
    slug:               master.slug,
    phone:              master.phone,
    telegram_chat_id:   master.telegram_chat_id   || '',
    telegram_bot_token: master.telegram_bot_token || '',
    telegram_id:        master.telegram_id        || '',
    trial_start_date:   master.trial_start_date   || new Date().toISOString(),
    is_premium:         master.is_premium         || false,
    plan_type:          master.plan_type          || 'solo',
    premium_expires_at: master.premium_expires_at ?? null,
    working_hours:      master.workingHours       || { start: '09:00', end: '21:00' },
    days_off:           master.daysOff            || [],
    created_at:         master.created_at,
  };
  console.log('💾 Сохраняем профиль:', dbMaster);
  const { error } = await supabase.from('profiles').upsert(dbMaster);
  if (error) console.error('Ошибка upsertMaster:', error);
  else console.log('✅ Профиль сохранён!');
}

// ---- SERVICES --------------------------------------------
export async function getServicesByMasterId(masterId: string): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services').select('*').eq('master_id', masterId);
  if (error) { console.error('Ошибка getServicesByMasterId:', error); return []; }
  return data || [];
}

export async function upsertService(service: Service): Promise<void> {
  const { error } = await supabase.from('services').upsert(service);
  if (error) { console.error('Ошибка upsertService:', error); throw error; }
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await supabase.from('services').delete().eq('id', id);
  if (error) console.error('Ошибка deleteService:', error);
}

// ---- APPOINTMENTS ----------------------------------------
export async function getBookingsByMasterId(masterId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('appointments').select('*').eq('master_id', masterId);
  if (error) { console.error('Ошибка getBookingsByMasterId:', error); return []; }
  return data || [];
}

export async function addBooking(booking: Booking): Promise<void> {
  console.log('💾 Сохраняем запись:', booking);
  const { error } = await supabase.from('appointments').insert(booking);
  if (error) { console.error('Ошибка addBooking:', error); throw error; }
  console.log('✅ Запись создана!');
}

export async function updateBookingStatus(
  id: string, status: Booking['status']
): Promise<void> {
  const { error } = await supabase
    .from('appointments').update({ status }).eq('id', id);
  if (error) console.error('Ошибка updateBookingStatus:', error);
}

export async function deleteBooking(id: string): Promise<void> {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) console.error('Ошибка deleteBooking:', error);
}

export async function getMonthBookingsCount(masterId: string): Promise<number> {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('appointments').select('id')
    .eq('master_id', masterId).neq('status', 'cancelled')
    .like('date', `${monthPrefix}%`);
  if (error) { console.error('Ошибка getMonthBookingsCount:', error); return 0; }
  return data?.length ?? 0;
}

// ---- SALON MASTERS ★ НОВОЕ ------------------------------

/**
 * Получает всех мастеров салона по director_id
 */
export async function getSalonMasters(directorId: string): Promise<SalonMaster[]> {
  console.log('🔍 Загружаем мастеров салона для директора:', directorId);
  const { data, error } = await supabase
    .from('salon_masters')
    .select('*')
    .eq('director_id', directorId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Ошибка getSalonMasters:', error);
    return [];
  }
  return (data || []).map(normalizeSalonMaster);
}

/**
 * Добавляет мастера в команду директора.
 * Генерирует уникальный link_code для Telegram-онбординга.
 */
export async function addSalonMaster(
  directorId: string,
  form: { name: string; specialization: string; color: string },
  planType: 'solo' | 'salon'
): Promise<{ success: boolean; master?: SalonMaster; error?: string }> {

  // Проверяем лимит
  const countCheck = await checkMasterCount(directorId, planType);
  if (!countCheck.canAdd) {
    return {
      success: false,
      error: `Достигнут лимит тарифа: максимум ${countCheck.limit} мастеров`,
    };
  }

  // link_code = уникальный токен для Telegram /start
  // Формат: sm_<directorId_short>_<random>
  const linkCode = `sm_${directorId.slice(0, 8)}_${Date.now().toString(36)}`;
  const id       = `smaster-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

  const newMaster = {
    id,
    director_id:      directorId,
    name:             form.name.trim(),
    specialization:   form.specialization.trim(),
    color:            form.color,
    link_code:        linkCode,
    telegram_chat_id: '',
    created_at:       new Date().toISOString(),
  };

  console.log('💾 Добавляем мастера салона:', newMaster);
  const { error } = await supabase.from('salon_masters').insert(newMaster);

  if (error) {
    console.error('Ошибка addSalonMaster:', error);
    return { success: false, error: 'Ошибка базы данных. Попробуйте ещё раз.' };
  }

  console.log('✅ Мастер салона добавлен:', id);
  return { success: true, master: normalizeSalonMaster(newMaster) };
}

/**
 * Удаляет мастера из команды
 */
export async function deleteSalonMaster(id: string): Promise<void> {
  console.log('🗑️ Удаляем мастера салона:', id);
  const { error } = await supabase
    .from('salon_masters').delete().eq('id', id);
  if (error) console.error('Ошибка deleteSalonMaster:', error);
  else console.log('✅ Мастер удалён');
}

/**
 * Проверяет текущее количество мастеров и возможность добавить ещё
 */
export async function checkMasterCount(
  directorId: string,
  planType: 'solo' | 'salon'
): Promise<{ count: number; limit: number; canAdd: boolean }> {
  const limit = MASTER_LIMITS[planType] ?? 0;

  const { data, error } = await supabase
    .from('salon_masters')
    .select('id')
    .eq('director_id', directorId);

  if (error) {
    console.error('Ошибка checkMasterCount:', error);
    return { count: 0, limit, canAdd: false };
  }

  const count = data?.length ?? 0;
  return { count, limit, canAdd: count < limit };
}

/**
 * Привязывает Telegram chat_id к мастеру салона по link_code.
 * Вызывается из server.js при онбординге.
 */
export async function linkSalonMasterTelegram(
  linkCode: string,
  telegramChatId: string
): Promise<{ success: boolean; master?: any; directorId?: string }> {
  const { data, error } = await supabase
    .from('salon_masters')
    .select('*')
    .eq('link_code', linkCode)
    .single();

  if (error || !data) {
    console.error('Мастер по link_code не найден:', linkCode);
    return { success: false };
  }

  const { error: updateError } = await supabase
    .from('salon_masters')
    .update({ telegram_chat_id: String(telegramChatId) })
    .eq('link_code', linkCode);

  if (updateError) {
    console.error('Ошибка привязки Telegram:', updateError);
    return { success: false };
  }

  return {
    success:    true,
    master:     data,
    directorId: data.director_id,
  };
}

/**
 * Нормализует данные salon_master из Supabase
 */
function normalizeSalonMaster(data: any): SalonMaster {
  return {
    id:               data.id,
    director_id:      data.director_id,
    name:             data.name,
    specialization:   data.specialization || '',
    color:            data.color          || '#10b981',
    link_code:        data.link_code      || '',
    telegram_chat_id: data.telegram_chat_id || '',
    created_at:       data.created_at,
  };
}

// ---- DEV TOOLS -------------------------------------------
export async function devTogglePremium(
  masterId: string, currentValue: boolean
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_premium: !currentValue })
    .eq('id', masterId);
  if (error) { console.error('❌ [DEV] devTogglePremium:', error); throw error; }
  console.log(`✅ [DEV] is_premium → ${!currentValue}`);
}

export async function devExpireTrial(masterId: string): Promise<void> {
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 15);
  const { error } = await supabase
    .from('profiles')
    .update({ trial_start_date: expiredDate.toISOString() })
    .eq('id', masterId);
  if (error) { console.error('❌ [DEV] devExpireTrial:', error); throw error; }
  console.log(`✅ [DEV] trial_start_date → ${expiredDate.toISOString()}`);
}

export async function devResetTrial(masterId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ trial_start_date: new Date().toISOString() })
    .eq('id', masterId);
  if (error) { console.error('❌ [DEV] devResetTrial:', error); throw error; }
  console.log('✅ [DEV] trial_start_date сброшен');
}