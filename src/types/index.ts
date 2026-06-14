export interface AppUser {
  id: string;
  name: string;
  phone: string;
  slug: string;
  isGuest: boolean;
  telegram_chat_id?: string;
  telegram_bot_token?: string;
  telegram_id?: string;        // ID из Telegram бота (привязка через /start)
  trial_start_date?: string;   // ISO дата начала триала
  is_premium?: boolean;        // Платный тариф
  workingHours?: {
    start: string;
    end: string;
  };
  daysOff?: number[];
}

export interface Master {
  id: string;
  name: string;
  slug: string;
  phone: string;
  telegram_chat_id?: string;
  telegram_bot_token?: string;
  telegram_id?: string;        // ID из Telegram бота
  trial_start_date?: string;   // ISO дата начала триала
  is_premium?: boolean;        // Платный тариф
  workingHours?: {
    start: string;
    end: string;
  };
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
  date: string;                    // Строго 'YYYY-MM-DD'
  time: string;                    // Строго 'HH:MM'
  status: 'pending' | 'confirmed' | 'cancelled';
  client_tg_chat_id?: string;      // Telegram chat_id клиента (заполняется через бота, опционально)
  created_at: string;
}