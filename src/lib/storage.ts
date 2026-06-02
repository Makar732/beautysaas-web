import { Master, Service, Booking, AppUser } from '../types';

// ============================================================
// TELEGRAM BOT CONFIGURATION
// Вставьте токен вашего Telegram-бота здесь:
// ============================================================
export const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
// ============================================================

const KEYS = {
  USER: 'beauty_saas_user',
  MASTERS: 'beauty_saas_masters',
  SERVICES: 'beauty_saas_services',
  BOOKINGS: 'beauty_saas_bookings',
};

// Default demo master
const DEFAULT_MASTER: Master = {
  id: 'master-irina-kozlova',
  name: 'Ирина Козлова',
  slug: 'irina-kozlova',
  phone: '+7 900 123-45-67',
  telegram_chat_id: '',
  created_at: new Date().toISOString(),
  workingHours: {
    start: '09:00',
    end: '21:00',
  },
  daysOff: [0], // воскресенье выходной по умолчанию
};

const DEFAULT_SERVICES: Service[] = [
  {
    id: 'svc-1',
    master_id: 'master-irina-kozlova',
    name: 'Маникюр + покрытие',
    price: 1500,
    duration: 90,
    description: 'Классический маникюр с гель-лаком, любой дизайн',
  },
  {
    id: 'svc-2',
    master_id: 'master-irina-kozlova',
    name: 'Педикюр + покрытие',
    price: 2000,
    duration: 120,
    description: 'Аппаратный педикюр с гель-лаком',
  },
  {
    id: 'svc-3',
    master_id: 'master-irina-kozlova',
    name: 'Наращивание ногтей',
    price: 3500,
    duration: 180,
    description: 'Акрил или гель, любой дизайн',
  },
];

function generateDemoBookings(): Booking[] {
  const today = new Date();
  const bookings: Booking[] = [];

  const clients = [
    { name: 'Анастасия Петрова', phone: '+7 916 234-56-78' },
    { name: 'Екатерина Смирнова', phone: '+7 926 345-67-89' },
    { name: 'Мария Иванова', phone: '+7 936 456-78-90' },
    { name: 'Дарья Новикова', phone: '+7 906 567-89-01' },
    { name: 'Ольга Федорова', phone: '+7 919 678-90-12' },
    { name: 'Татьяна Морозова', phone: '+7 929 789-01-23' },
    { name: 'Наталья Волкова', phone: '+7 939 890-12-34' },
    { name: 'Светлана Козлова', phone: '+7 909 901-23-45' },
  ];

  const services = DEFAULT_SERVICES;
  const statuses: Array<'pending' | 'confirmed'> = ['confirmed', 'confirmed', 'confirmed', 'pending'];

  for (let dayOffset = -3; dayOffset <= 3; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().split('T')[0];

    const numBookings = dayOffset === 0 ? 4 : Math.floor(Math.random() * 3) + 1;

    const times = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00', '19:30'];
    const usedTimes = new Set<string>();

    for (let i = 0; i < numBookings; i++) {
      let time = times[Math.floor(Math.random() * times.length)];
      while (usedTimes.has(time)) {
        time = times[Math.floor(Math.random() * times.length)];
      }
      usedTimes.add(time);

      const client = clients[Math.floor(Math.random() * clients.length)];
      const service = services[Math.floor(Math.random() * services.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];

      bookings.push({
        id: `booking-demo-${dayOffset}-${i}`,
        master_id: 'master-irina-kozlova',
        service_id: service.id,
        service_name: service.name,
        client_name: client.name,
        client_phone: client.phone,
        date: dateStr,
        time,
        status,
        created_at: new Date().toISOString(),
      });
    }
  }

  return bookings;
}

function initializeDefaultData() {
  const masters = getMasters();
  if (masters.length === 0) {
    saveMasters([DEFAULT_MASTER]);
    saveServices(DEFAULT_SERVICES);
    saveBookings(generateDemoBookings());
  }
}

// ---- MASTERS ----
export function getMasters(): Master[] {
  try {
    const data = localStorage.getItem(KEYS.MASTERS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveMasters(masters: Master[]) {
  localStorage.setItem(KEYS.MASTERS, JSON.stringify(masters));
}

export function getMasterBySlug(slug: string): Master | null {
  const masters = getMasters();
  return masters.find((m) => m.slug === slug) || null;
}

export function getMasterById(id: string): Master | null {
  const masters = getMasters();
  return masters.find((m) => m.id === id) || null;
}

export function upsertMaster(master: Master) {
  const masters = getMasters();
  const idx = masters.findIndex((m) => m.id === master.id);
  if (idx >= 0) {
    masters[idx] = master;
  } else {
    masters.push(master);
  }
  saveMasters(masters);
}

// ---- SERVICES ----
export function getServices(): Service[] {
  try {
    const data = localStorage.getItem(KEYS.SERVICES);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveServices(services: Service[]) {
  localStorage.setItem(KEYS.SERVICES, JSON.stringify(services));
}

export function getServicesByMasterId(masterId: string): Service[] {
  return getServices().filter((s) => s.master_id === masterId);
}

export function upsertService(service: Service) {
  const services = getServices();
  const idx = services.findIndex((s) => s.id === service.id);
  if (idx >= 0) {
    services[idx] = service;
  } else {
    services.push(service);
  }
  saveServices(services);
}

export function deleteService(id: string) {
  const services = getServices().filter((s) => s.id !== id);
  saveServices(services);
}

// ---- BOOKINGS ----
export function getBookings(): Booking[] {
  try {
    const data = localStorage.getItem(KEYS.BOOKINGS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveBookings(bookings: Booking[]) {
  localStorage.setItem(KEYS.BOOKINGS, JSON.stringify(bookings));
}

export function getBookingsByMasterId(masterId: string): Booking[] {
  return getBookings().filter((b) => b.master_id === masterId);
}

export function addBooking(booking: Booking) {
  const bookings = getBookings();
  bookings.push(booking);
  saveBookings(bookings);
}

export function updateBookingStatus(id: string, status: Booking['status']) {
  const bookings = getBookings();
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx >= 0) {
    bookings[idx].status = status;
    saveBookings(bookings);
  }
}

export function deleteBooking(id: string) {
  const bookings = getBookings().filter((b) => b.id !== id);
  saveBookings(bookings);
}

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

// ---- INIT ----
export function initStorage() {
  initializeDefaultData();
}

/*
// ============================================================
// SUPABASE ADAPTER (закомментирован — активируйте при добавлении ключей)
// ============================================================
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getMastersSupabase(): Promise<Master[]> {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) throw error;
  return data || [];
}

export async function getServicesByMasterIdSupabase(masterId: string): Promise<Service[]> {
  const { data, error } = await supabase.from('services').select('*').eq('master_id', masterId);
  if (error) throw error;
  return data || [];
}

export async function getBookingsByMasterIdSupabase(masterId: string): Promise<Booking[]> {
  const { data, error } = await supabase.from('bookings').select('*').eq('master_id', masterId);
  if (error) throw error;
  return data || [];
}

export async function addBookingSupabase(booking: Booking): Promise<void> {
  const { error } = await supabase.from('bookings').insert([booking]);
  if (error) throw error;
}

export async function upsertServiceSupabase(service: Service): Promise<void> {
  const { error } = await supabase.from('services').upsert([service]);
  if (error) throw error;
}

export async function deleteServiceSupabase(id: string): Promise<void> {
  const { error } = await supabase.from('services').delete().eq('id', id);
  if (error) throw error;
}
*/