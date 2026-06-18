// src/types/index.ts

export interface AppUser {
  id: string;
  name: string;
  phone: string;
  slug: string;
  isGuest: boolean;
  telegram_chat_id?: string;
  telegram_bot_token?: string;
  telegram_id?: string;
  trial_start_date?: string;
  is_premium?: boolean;
  plan_type?: 'solo' | 'salon';
  premium_expires_at?: string | null;
  workingHours?: { start: string; end: string };
  daysOff?: number[];
}

export interface Master {
  id: string;
  name: string;
  slug: string;
  phone: string;
  telegram_chat_id?: string;
  telegram_bot_token?: string;
  telegram_id?: string;
  trial_start_date?: string;
  is_premium?: boolean;
  plan_type?: 'solo' | 'salon';
  premium_expires_at?: string | null;
  workingHours?: { start: string; end: string };
  daysOff?: number[];
  created_at: string;
}

export interface Service {
  id: string;
  master_id: string;
  name: string;
  price: number;
  duration: number;
  description?: string;
}

export interface Booking {
  id: string;
  master_id: string;
  service_id: string;
  service_name: string;
  client_name: string;
  client_phone: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  client_tg_chat_id?: string;
  // ★ НОВОЕ: привязка к мастеру салона
  salon_master_id?: string | null;
  created_at: string;
}

// ★ НОВОЕ: мастер в составе салона
export interface SalonMaster {
  id: string;
  director_id: string;
  name: string;
  specialization: string;
  color: string;
  link_code: string;
  telegram_chat_id: string;
  created_at: string;
}

// ★ НОВОЕ: лимиты по тарифам
export const MASTER_LIMITS = {
  solo:  0,
  salon: 3,
} as const;