export interface Master {
  id: string;
  name: string;
  slug: string;
  phone: string;
  telegram_chat_id?: string;
  telegram_bot_token?: string;
  avatar?: string;
  created_at: string;
}

export interface Service {
  id: string;
  master_id: string;
  name: string;
  price: number;
  duration: number; // minutes
  description?: string;
}

export interface Booking {
  id: string;
  master_id: string;
  service_id: string;
  service_name: string;
  client_name: string;
  client_phone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
}

export interface AppUser {
  id: string;
  name: string;
  phone: string;
  slug: string;
  isGuest: boolean;
  telegram_chat_id?: string;
  telegram_bot_token?: string;
}
