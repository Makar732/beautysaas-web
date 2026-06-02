import { Master, Service, Booking, AppUser } from '../types';

export const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';

const KEYS = {
  USER: 'beauty_saas_user',
  MASTERS: 'beauty_saas_masters',
  SERVICES: 'beauty_saas_services',
  BOOKINGS: 'beauty_saas_bookings',
};

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

// Больше никаких автоматических Ирин Козловых!
export function initStorage() {
  // Оставлено пустым, чтобы не ломать импорты в других файлах
}