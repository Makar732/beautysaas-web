// src/pages/DashboardPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Package, Settings, LogOut, Sparkles, Plus, Trash2, Edit3,
  Copy, Check, ExternalLink, Bell, Clock, User, Phone, DollarSign,
  ChevronLeft, ChevronRight, Save, TrendingUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getBookingsByMasterId, getServicesByMasterId,
  upsertService, deleteService, addBooking, updateBookingStatus, deleteBooking,
  getMasterById
} from '../lib/storage';
import { Booking, Service } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { PhoneInput, isPhoneComplete } from '../components/ui/PhoneInput';
import { formatDateToString, parseDateFromString } from '../utils/dateUtils';

type Tab = 'calendar' | 'services' | 'settings';

// ШАГ СЕТКИ — 30 минут, строго совпадает с BookingPage
const SLOT_MINUTES = 30;

// Генерируем все слоты суток: 00:00, 00:30, 01:00 ... 23:30
const ALL_TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
})();

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-emerald-100 border-emerald-400 text-emerald-900',
  pending: 'bg-amber-100 border-amber-400 text-amber-900',
  cancelled: 'bg-gray-100 border-gray-300 text-gray-500 line-through',
};
const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Подтверждена',
  pending: 'В ожидании',
  cancelled: 'Отменена',
};
const WEEK_DAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function generateId() {
  return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatDate(d: Date): string {
  return formatDateToString(d);
}

function getWeekDates(baseDate: Date) {
  const dow = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (dow === 0 ? 6 : dow - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Сколько слотов по 30 минут занимает услуга.
 * duration=100 → ceil(100/30)=4 слота
 */
function getSlotsCount(durationMinutes: number): number {
  return Math.ceil(durationMinutes / SLOT_MINUTES);
}

/**
 * Переводим время "HH:MM" в общее количество минут от полуночи.
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export default function DashboardPage() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('calendar');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [copied, setCopied] = useState(false);
  const [showAddBookingModal, setShowAddBookingModal] = useState(false);
  const [showEditServiceModal, setShowEditServiceModal] = useState(false);
  const [showBookingDetailModal, setShowBookingDetailModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [mobileView, setMobileView] = useState<'week' | 'day'>('week');
  const [isLoading, setIsLoading] = useState(true);

  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('21:00');
  const [daysOff, setDaysOff] = useState<number[]>([]);

  const [revenueMonth, setRevenueMonth] = useState(new Date());

  const [bookingForm, setBookingForm] = useState({
    clientName: '', clientPhone: '', serviceId: '', date: '', time: '',
  });
  const [serviceForm, setServiceForm] = useState({ name: '', price: '', duration: '' });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    const week = getWeekDates(currentDate);
    setWeekDates(week);
    loadData();
  }, [user, currentDate]);

  const loadData = async () => {
    if (!user) return;
    setIsLoading(true);

    const fetchedBookings = await getBookingsByMasterId(user.id);
    const fetchedServices = await getServicesByMasterId(user.id);
    const master = await getMasterById(user.id);

    setBookings(fetchedBookings);
    setServices(fetchedServices);

    if (master) {
      if (master.telegram_chat_id) setTelegramChatId(master.telegram_chat_id);
      const workHours = (master as any).working_hours || master.workingHours;
      if (workHours) {
        setWorkStart(workHours.start);
        setWorkEnd(workHours.end);
      }
      const offDays = (master as any).days_off || master.daysOff;
      if (offDays) setDaysOff(offDays);
    }
    setIsLoading(false);
  };

  const masterId = user?.id || '';
  const masterSlug = user?.slug || '';
  const bookingLink = `${window.location.origin}/#/book/${masterSlug}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(bookingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Строим видимую сетку слотов на основе рабочих часов мастера.
   * Если рабочие часы не заданы — показываем все 48 слотов (00:00–23:30).
   * Шаг строго 30 минут — ни одна запись на "половинку" не пропадёт.
   */
  const getVisibleSlots = (): string[] => {
    if (!workStart || !workEnd) return ALL_TIME_SLOTS;

    const startMin = timeToMinutes(workStart);
    const endMin = timeToMinutes(workEnd);

    // Добавляем буфер: показываем на 1 час раньше начала и 2 часа позже конца,
    // чтобы записи у границ рабочего времени точно были видны
    const bufferBefore = 60;
    const bufferAfter = 120;

    const visibleStart = Math.max(0, startMin - bufferBefore);
    const visibleEnd = Math.min(23 * 60 + 30, endMin + bufferAfter);

    return ALL_TIME_SLOTS.filter(slot => {
      const slotMin = timeToMinutes(slot);
      return slotMin >= visibleStart && slotMin <= visibleEnd;
    });
  };

  /**
   * Возвращает записи, которые НАЧИНАЮТСЯ ровно в этот слот.
   * Слоты продолжения (занятые из-за длительности) не возвращают запись повторно.
   */
  const getBookingsStartingAtSlot = (date: Date, slotTime: string): Booking[] => {
    const dateStr = formatDate(date);
    return bookings.filter(
      (b) => b.date === dateStr && b.time === slotTime && b.status !== 'cancelled'
    );
  };

  /**
   * Проверяет: является ли этот слот "продолжением" какой-то записи
   * (т.е. запись началась раньше, но из-за длительности "захватывает" этот слот).
   * Используется чтобы не рисовать пустую ячейку там, где карточка уже растянута.
   */
  const isSlotCoveredByEarlierBooking = (date: Date, slotTime: string): boolean => {
    const dateStr = formatDate(date);
    const slotMin = timeToMinutes(slotTime);

    return bookings.some((b) => {
      if (b.date !== dateStr || b.status === 'cancelled') return false;
      if (b.time === slotTime) return false; // это начало — не "продолжение"

      const bookingStartMin = timeToMinutes(b.time);
      if (bookingStartMin >= slotMin) return false; // запись начинается позже

      const service = services.find(s => s.id === b.service_id);
      const duration = service?.duration ?? SLOT_MINUTES;
      const slotsCount = getSlotsCount(duration);
      const bookingEndMin = bookingStartMin + slotsCount * SLOT_MINUTES;

      return slotMin < bookingEndMin;
    });
  };

  /**
   * Высота одного слота в пикселях — используется для растягивания карточек.
   */
  const SLOT_HEIGHT_PX = 48;

  /**
   * Вычисляет высоту карточки записи в пикселях на основе длительности услуги.
   */
  const getBookingCardHeight = (booking: Booking): number => {
    const service = services.find(s => s.id === booking.service_id);
    const duration = service?.duration ?? SLOT_MINUTES;
    const slotsCount = getSlotsCount(duration);
    // -4px — небольшой отступ чтобы карточки не сливались
    return slotsCount * SLOT_HEIGHT_PX - 4;
  };

  const getDayBookings = (date: Date): Booking[] => {
    const dateStr = formatDate(date);
    return bookings.filter((b) => b.date === dateStr && b.status !== 'cancelled');
  };

  const handleCellClick = (date: Date, slotTime: string) => {
    setBookingForm({
      clientName: '', clientPhone: '', serviceId: services[0]?.id || '',
      date: formatDate(date), time: slotTime,
    });
    setShowAddBookingModal(true);
  };

  const handleAddBooking = async () => {
    if (!bookingForm.clientName || !isPhoneComplete(bookingForm.clientPhone) || !bookingForm.serviceId) return;
    const service = services.find((s) => s.id === bookingForm.serviceId);

    const newBooking: Booking = {
      id: generateId(),
      master_id: masterId,
      service_id: bookingForm.serviceId,
      service_name: service?.name || '',
      client_name: bookingForm.clientName,
      client_phone: bookingForm.clientPhone,
      date: bookingForm.date,
      time: bookingForm.time,
      status: 'confirmed',
      created_at: new Date().toISOString(),
    };

    await addBooking(newBooking);
    await loadData();
    setShowAddBookingModal(false);
  };

  const handleStatusChange = async (bookingId: string, status: Booking['status']) => {
    await updateBookingStatus(bookingId, status);
    await loadData();
  };

  const handleDeleteBooking = async (bookingId: string) => {
    await deleteBooking(bookingId);
    await loadData();
    setShowBookingDetailModal(false);
  };

  const handleSaveService = async () => {
    if (!serviceForm.name || !serviceForm.price || !serviceForm.duration) return;

    try {
      const service: Service = {
        id: editingService?.id || generateId(),
        master_id: masterId,
        name: serviceForm.name.trim(),
        price: Number(serviceForm.price),
        duration: Number(serviceForm.duration),
      };

      await upsertService(service);
      await loadData();
      setShowEditServiceModal(false);
      setEditingService(null);
      setServiceForm({ name: '', price: '', duration: '' });
    } catch (error) {
      console.error('❌ Ошибка при сохранении услуги:', error);
      alert('Не удалось сохранить услугу. Проверьте консоль.');
    }
  };

  const handleEditService = (s: Service) => {
    setEditingService(s);
    setServiceForm({ name: s.name, price: String(s.price), duration: String(s.duration) });
    setShowEditServiceModal(true);
  };

  const handleDeleteService = async (id: string) => {
    await deleteService(id);
    await loadData();
  };

  const toggleDayOff = (day: number) => {
    setDaysOff(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    const updatedUser = {
      ...user,
      telegram_chat_id: telegramChatId,
      workingHours: { start: workStart, end: workEnd },
      daysOff,
    };
    await updateUser(updatedUser);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const calculateMonthRevenue = () => {
    const year = revenueMonth.getFullYear();
    const month = String(revenueMonth.getMonth() + 1).padStart(2, '0');
    const prefix = `${year}-${month}`;
    return bookings
      .filter(b => b.date.startsWith(prefix) && b.status === 'confirmed')
      .reduce((sum, b) => {
        const svc = services.find(s => s.id === b.service_id);
        return sum + (svc?.price || 0);
      }, 0);
  };

  const monthRevenue = calculateMonthRevenue();

  const goToPrevMonth = () => {
    setRevenueMonth(new Date(revenueMonth.getFullYear(), revenueMonth.getMonth() - 1));
  };

  const goToNextMonth = () => {
    setRevenueMonth(new Date(revenueMonth.getFullYear(), revenueMonth.getMonth() + 1));
  };

  const today = formatDate(new Date());
  const todayBookings = bookings.filter((b) => b.date === today && b.status !== 'cancelled');
  const todayRevenue = todayBookings.reduce((sum, b) => {
    const svc = services.find((s) => s.id === b.service_id);
    return sum + (svc?.price || 0);
  }, 0);

  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthBookings = bookings.filter((b) => b.date.startsWith(currentMonthPrefix));

  const isAddBookingValid = bookingForm.clientName.trim() && isPhoneComplete(bookingForm.clientPhone) && bookingForm.serviceId;

  // Видимые слоты для текущих рабочих часов мастера
  const visibleSlots = getVisibleSlots();

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* SIDEBAR */}
      <aside className="hidden lg:flex flex-col w-64 bg-gray-950 text-white h-screen sticky top-0">
        <div className="p-6 border-b border-white/8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="text-amber-400" size={20} />
            <span className="font-bold text-lg">
              Beauty<span className="text-emerald-400">SaaS</span>
            </span>
          </div>
          <div className="bg-white/5 rounded-2xl p-3">
            <div className="w-10 h-10 bg-emerald-700 rounded-full flex items-center justify-center text-lg font-bold mb-2">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <p className="font-semibold text-sm truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{user.phone}</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {([
            { id: 'calendar', icon: Calendar, label: 'Календарь' },
            { id: 'services', icon: Package, label: 'Мои услуги' },
            { id: 'settings', icon: Settings, label: 'Настройки' },
          ] as { id: Tab; icon: typeof Calendar; label: string }[]).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                activeTab === item.id
                  ? 'bg-emerald-700 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/8 space-y-3">
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">Сегодня</p>
            <p className="font-bold text-emerald-400">{todayRevenue.toLocaleString('ru-RU')} ₽</p>
            <p className="text-xs text-gray-500">{todayBookings.length} записей</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-400 hover:bg-red-900/20 hover:text-red-400 transition-all cursor-pointer"
          >
            <LogOut size={18} />
            Выйти
          </button>
        </div>
      </aside>

      {/* MOBILE NAV */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-gray-950 border-t border-white/8 flex">
        {([
          { id: 'calendar', icon: Calendar, label: 'Журнал' },
          { id: 'services', icon: Package, label: 'Услуги' },
          { id: 'settings', icon: Settings, label: 'Настройки' },
        ] as { id: Tab; icon: typeof Calendar; label: string }[]).map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === item.id ? 'text-emerald-400' : 'text-gray-500'
            }`}
          >
            <item.icon size={20} />
            {item.label}
          </button>
        ))}
      </div>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-auto pb-20 lg:pb-0 relative">

        {isLoading && (
          <div className="absolute inset-0 bg-white/60 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Mobile Header */}
        <div className="lg:hidden bg-gray-950 text-white px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-400" size={18} />
            <span className="font-bold">Beauty<span className="text-emerald-400">SaaS</span></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">{user.name}</span>
            <button onClick={handleLogout} className="text-gray-400 hover:text-white transition-colors cursor-pointer">
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Page Header */}
        <div className="bg-white border-b border-gray-100 px-4 lg:px-8 py-4 lg:py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-gray-900">
                {activeTab === 'calendar' && 'Журнал записей'}
                {activeTab === 'services' && 'Мои услуги'}
                {activeTab === 'settings' && 'Настройки профиля'}
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                {activeTab === 'calendar' && `${monthBookings.length} записей в этом месяце`}
                {activeTab === 'services' && `${services.length} услуг в вашем прайсе`}
                {activeTab === 'settings' && 'Управляйте профилем и уведомлениями'}
              </p>
            </div>
            {activeTab === 'calendar' && (
              <Button variant="primary" size="sm" onClick={() => {
                setBookingForm({ clientName: '', clientPhone: '', serviceId: services[0]?.id || '', date: today, time: '10:00' });
                setShowAddBookingModal(true);
              }}>
                <Plus size={16} />
                Добавить запись
              </Button>
            )}
            {activeTab === 'services' && (
              <Button variant="primary" size="sm" onClick={() => {
                setEditingService(null);
                setServiceForm({ name: '', price: '', duration: '' });
                setShowEditServiceModal(true);
              }}>
                <Plus size={16} />
                Добавить услугу
              </Button>
            )}
          </div>

          {activeTab === 'calendar' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                <div className="text-emerald-600 bg-emerald-100 p-2 rounded-lg">
                  <Calendar size={14} />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{todayBookings.length}</p>
                  <p className="text-xs text-gray-500">Сегодня</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                <div className="text-emerald-600 bg-emerald-100 p-2 rounded-lg">
                  <DollarSign size={14} />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{todayRevenue.toLocaleString('ru-RU')} ₽</p>
                  <p className="text-xs text-gray-500">Выручка</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-blue-600" />
                    <p className="text-xs text-gray-500">За месяц</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={goToPrevMonth} className="p-1 hover:bg-gray-200 rounded transition-colors">
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs text-gray-600 px-2">
                      {revenueMonth.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })}
                    </span>
                    <button onClick={goToNextMonth} className="p-1 hover:bg-gray-200 rounded transition-colors">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                <p className="font-bold text-gray-900 text-lg">{monthRevenue.toLocaleString('ru-RU')} ₽</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 lg:p-8">

          {/* CALENDAR TAB */}
          {activeTab === 'calendar' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d); }}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="text-center">
                  <p className="font-semibold text-gray-900">
                    {weekDates[0]?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} —{' '}
                    {weekDates[6]?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  <button
                    onClick={() => setCurrentDate(new Date())}
                    className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                  >
                    Сегодня
                  </button>
                </div>
                <button
                  onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d); }}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="flex lg:hidden gap-2 mb-4">
                <button
                  onClick={() => setMobileView('week')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${mobileView === 'week' ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  Неделя
                </button>
                <button
                  onClick={() => setMobileView('day')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${mobileView === 'day' ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  День
                </button>
              </div>

              {mobileView === 'day' && (
                <div className="flex gap-1 mb-4 overflow-x-auto pb-1 lg:hidden">
                  {weekDates.map((d, i) => {
                    const isToday = formatDate(d) === today;
                    const isSelected = formatDate(d) === formatDate(selectedDay);
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedDay(d)}
                        className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${
                          isSelected ? 'bg-emerald-700 text-white' : isToday ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        <span>{DAY_NAMES[i]}</span>
                        <span className="font-bold text-sm">{d.getDate()}</span>
                        <span className="text-xs opacity-60">{getDayBookings(d).length}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ===== DESKTOP CALENDAR ===== */}
              <div className="hidden lg:block bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                {/* Шапка с днями недели */}
                <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: '72px repeat(7, 1fr)' }}>
                  <div className="p-3 text-xs text-gray-400 text-center font-medium">Время</div>
                  {weekDates.map((d, i) => {
                    const isToday = formatDate(d) === today;
                    const dayBookingsCount = getDayBookings(d).length;
                    return (
                      <div
                        key={i}
                        className={`p-3 text-center border-l border-gray-100 ${isToday ? 'bg-emerald-50' : ''}`}
                      >
                        <p className="text-xs text-gray-400 font-medium">{DAY_NAMES[i]}</p>
                        <p className={`text-lg font-bold ${isToday ? 'text-emerald-600' : 'text-gray-900'}`}>
                          {d.getDate()}
                        </p>
                        {dayBookingsCount > 0 && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                            {dayBookingsCount}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Тело сетки — 30-минутные строки */}
                <div className="overflow-y-auto max-h-[600px]">
                  {visibleSlots.map((slotTime) => {
                    const isHalfHour = slotTime.endsWith(':30');
                    return (
                      <div
                        key={slotTime}
                        className={`grid border-b transition-colors ${
                          isHalfHour ? 'border-gray-50' : 'border-gray-100'
                        } hover:bg-gray-50/30`}
                        style={{
                          gridTemplateColumns: '72px repeat(7, 1fr)',
                          minHeight: `${SLOT_HEIGHT_PX}px`,
                        }}
                      >
                        {/* Метка времени — показываем только целые часы, чтобы не загромождать */}
                        <div className="text-xs text-gray-400 font-mono text-right pr-3 flex items-start justify-end pt-1 shrink-0">
                          {isHalfHour ? (
                            <span className="text-gray-300">·</span>
                          ) : (
                            slotTime
                          )}
                        </div>

                        {/* Ячейки для каждого дня */}
                        {weekDates.map((d, di) => {
                          const isToday = formatDate(d) === today;
                          const isCovered = isSlotCoveredByEarlierBooking(d, slotTime);
                          const startingBookings = getBookingsStartingAtSlot(d, slotTime);

                          // Если слот "перекрыт" растянутой карточкой — рисуем пустой div
                          // (карточка уже нарисована выше через position:absolute или overflow:visible)
                          if (isCovered) {
                            return (
                              <div
                                key={di}
                                className={`border-l border-gray-100 ${isToday ? 'bg-emerald-50/20' : ''}`}
                              />
                            );
                          }

                          return (
                            <div
                              key={di}
                              onClick={() => handleCellClick(d, slotTime)}
                              className={`border-l border-gray-100 p-0.5 cursor-pointer group relative ${isToday ? 'bg-emerald-50/20' : ''}`}
                              style={{ minHeight: `${SLOT_HEIGHT_PX}px` }}
                            >
                              {/* Подсказка "+" при наведении на пустой слот */}
                              {startingBookings.length === 0 && (
                                <div className="absolute inset-0.5 rounded-lg border-2 border-dashed border-transparent group-hover:border-emerald-200 transition-colors flex items-center justify-center">
                                  <Plus size={12} className="text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              )}

                              {/* Карточки записей — растягиваются на нужное количество слотов */}
                              {startingBookings.map((b) => {
                                const cardHeight = getBookingCardHeight(b);
                                const service = services.find(s => s.id === b.service_id);
                                const duration = service?.duration ?? SLOT_MINUTES;
                                const slotsCount = getSlotsCount(duration);

                                return (
                                  <div
                                    key={b.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedBooking(b);
                                      setShowBookingDetailModal(true);
                                    }}
                                    className={`rounded-lg border-l-4 px-1.5 py-1 text-xs cursor-pointer hover:shadow-md hover:z-10 transition-shadow ${STATUS_COLORS[b.status]}`}
                                    style={{
                                      // Карточка растягивается на все слоты длительности
                                      height: `${cardHeight}px`,
                                      // Позиционируем поверх следующих строк
                                      position: 'relative',
                                      zIndex: 1,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    <p className="font-semibold truncate leading-tight">{b.client_name}</p>
                                    <p className="opacity-70 truncate leading-tight">{b.service_name}</p>
                                    <p className="opacity-50 leading-tight">{b.time}</p>
                                    {slotsCount > 1 && (
                                      <p className="opacity-40 text-xs leading-tight">{duration} мин</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ===== MOBILE VIEWS ===== */}
              <div className="lg:hidden">
                {mobileView === 'day' ? (
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-emerald-50">
                      <p className="font-bold text-gray-900">
                        {selectedDay.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                      <p className="text-sm text-gray-500">{getDayBookings(selectedDay).length} записей</p>
                    </div>
                    <div className="overflow-y-auto max-h-[60vh]">
                      {visibleSlots.map((slotTime) => {
                        const isHalfHour = slotTime.endsWith(':30');
                        const isCovered = isSlotCoveredByEarlierBooking(selectedDay, slotTime);
                        const cellBookings = getBookingsStartingAtSlot(selectedDay, slotTime);

                        if (isCovered) return null;

                        return (
                          <div
                            key={slotTime}
                            className={`flex gap-3 p-3 border-b cursor-pointer group ${
                              isHalfHour ? 'border-gray-50 bg-gray-50/30' : 'border-gray-100 hover:bg-gray-50'
                            }`}
                            onClick={() => handleCellClick(selectedDay, slotTime)}
                          >
                            <div className="w-14 text-xs font-mono pt-1 shrink-0 text-right">
                              {isHalfHour ? (
                                <span className="text-gray-300">·</span>
                              ) : (
                                <span className="text-gray-400">{slotTime}</span>
                              )}
                            </div>
                            <div className="flex-1" style={{ minHeight: '36px' }}>
                              {cellBookings.length === 0 ? (
                                <div className="h-full flex items-center">
                                  <span className="text-xs text-gray-300 group-hover:text-emerald-400 transition-colors">
                                    + Добавить запись
                                  </span>
                                </div>
                              ) : (
                                cellBookings.map((b) => {
                                  const service = services.find(s => s.id === b.service_id);
                                  const duration = service?.duration ?? SLOT_MINUTES;
                                  return (
                                    <div
                                      key={b.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedBooking(b);
                                        setShowBookingDetailModal(true);
                                      }}
                                      className={`rounded-xl border-l-4 p-2 text-xs mb-1 ${STATUS_COLORS[b.status]}`}
                                    >
                                      <p className="font-semibold">{b.client_name}</p>
                                      <p className="opacity-70">{b.service_name} · {b.time} · {duration} мин</p>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {weekDates.map((d, i) => {
                      const dayBks = getDayBookings(d);
                      const isToday = formatDate(d) === today;
                      return (
                        <div
                          key={i}
                          className={`bg-white rounded-2xl border p-4 ${isToday ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200'}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className={`font-bold ${isToday ? 'text-emerald-700' : 'text-gray-900'}`}>
                                {DAY_NAMES[i]}, {d.getDate()} {d.toLocaleDateString('ru-RU', { month: 'short' })}
                                {isToday && <span className="ml-2 text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full">Сегодня</span>}
                              </p>
                            </div>
                            <button
                              onClick={() => { setSelectedDay(d); setMobileView('day'); }}
                              className="text-xs text-emerald-600 hover:text-emerald-700 cursor-pointer"
                            >
                              Открыть →
                            </button>
                          </div>
                          {dayBks.length === 0 ? (
                            <p className="text-xs text-gray-400">Нет записей</p>
                          ) : (
                            <div className="space-y-1">
                              {dayBks.slice(0, 3).map((b) => (
                                <div key={b.id} className={`rounded-lg border-l-4 px-2 py-1 text-xs ${STATUS_COLORS[b.status]}`}>
                                  {b.time} · {b.client_name} · {b.service_name}
                                </div>
                              ))}
                              {dayBks.length > 3 && (
                                <p className="text-xs text-gray-400 pl-2">+{dayBks.length - 3} ещё...</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SERVICES TAB */}
          {activeTab === 'services' && (
            <div>
              {services.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                  <Package size={48} className="text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg font-medium mb-2">Услуги не добавлены</p>
                  <p className="text-gray-400 text-sm mb-6">Добавьте свои услуги, чтобы клиенты могли записаться</p>
                  <Button variant="primary" onClick={() => { setEditingService(null); setServiceForm({ name: '', price: '', duration: '' }); setShowEditServiceModal(true); }}>
                    <Plus size={16} />
                    Добавить первую услугу
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {services.map((s) => (
                    <div key={s.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow group">
                      <div className="flex items-start justify-between mb-3">
                        <div className="bg-emerald-100 text-emerald-700 p-2 rounded-xl">
                          <Package size={18} />
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditService(s)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteService(s.id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <h3 className="font-bold text-gray-900 text-lg mb-1">{s.name}</h3>
                      {s.description && <p className="text-sm text-gray-500 mb-3">{s.description}</p>}
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-black text-emerald-600">{s.price.toLocaleString('ru-RU')} ₽</span>
                        <div className="flex items-center gap-1 text-gray-400 text-sm">
                          <Clock size={14} />
                          {s.duration} мин
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="font-bold text-gray-900 text-lg mb-1">Ваша ссылка для записи</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Поделитесь этой ссылкой с клиентами — они смогут записаться онлайн в любое время
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono text-gray-700 truncate">
                    {bookingLink}
                  </div>
                  <Button variant="primary" size="sm" onClick={copyLink}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? 'Скопировано!' : 'Копировать'}
                  </Button>
                </div>
                <div className="flex gap-3 mt-3">
                  <a
                    href={`#/book/${masterSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
                  >
                    <ExternalLink size={14} />
                    Открыть страницу записи
                  </a>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="font-bold text-gray-900 text-lg mb-4">Профиль</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Имя / Название студии</label>
                    <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <User size={16} className="text-gray-400" />
                      <span className="text-gray-700">{user.name}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Телефон</label>
                    <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <Phone size={16} className="text-gray-400" />
                      <span className="text-gray-700">{user.phone}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Slug (URL)</label>
                    <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <span className="text-gray-400 text-sm">/book/</span>
                      <span className="text-gray-700 font-mono">{user.slug}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="font-bold text-gray-900 text-lg mb-4">Время работы</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Начало дня</label>
                    <select
                      value={workStart}
                      onChange={(e) => setWorkStart(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-gray-900"
                    >
                      {ALL_TIME_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Конец дня</label>
                    <select
                      value={workEnd}
                      onChange={(e) => setWorkEnd(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-gray-900"
                    >
                      {ALL_TIME_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="font-bold text-gray-900 text-lg mb-4">Выходные дни</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Отметьте дни, когда вы не принимаете клиентов
                </p>
                <div className="flex flex-wrap gap-2">
                  {WEEK_DAYS.map((day, idx) => (
                    <button
                      key={idx}
                      onClick={() => toggleDayOff(idx)}
                      className={`px-4 py-2 rounded-xl font-medium transition-all ${
                        daysOff.includes(idx)
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Bell size={18} className="text-emerald-600" />
                  <h2 className="font-bold text-gray-900 text-lg">Уведомления в Telegram</h2>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Введите ваш Telegram Chat ID, чтобы получать мгновенные уведомления о новых записях.
                  Узнать Chat ID можно через бот <span className="font-mono text-emerald-600">@userinfobot</span>
                </p>
                <div className="space-y-4">
                  <Input
                    label="Telegram Chat ID"
                    placeholder="Например: 123456789"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    hint="Введите числовой ID вашего чата в Telegram"
                  />
                  <Button
                    variant="primary"
                    onClick={handleSaveSettings}
                    className={settingsSaved ? '!bg-emerald-500' : ''}
                  >
                    {settingsSaved ? (
                      <><Check size={16} />Сохранено!</>
                    ) : (
                      <><Save size={16} />Сохранить настройки</>
                    )}
                  </Button>
                </div>
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs text-amber-700">
                    <strong>Примечание:</strong> Для работы уведомлений необходимо добавить токен Telegram-бота
                    в файл <span className="font-mono">src/lib/storage.ts</span> (константа TELEGRAM_BOT_TOKEN).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ADD BOOKING MODAL */}
      <Modal isOpen={showAddBookingModal} onClose={() => setShowAddBookingModal(false)} title="Добавить запись">
        <div className="space-y-4">
          <Input
            label="Имя клиента"
            placeholder="Анна Иванова"
            value={bookingForm.clientName}
            onChange={(e) => setBookingForm((f) => ({ ...f, clientName: e.target.value }))}
          />
          <PhoneInput
            label="Телефон клиента"
            value={bookingForm.clientPhone}
            onChange={(value) => setBookingForm((f) => ({ ...f, clientPhone: value }))}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-gray-900"
          />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Услуга</label>
            <select
              value={bookingForm.serviceId}
              onChange={(e) => setBookingForm((f) => ({ ...f, serviceId: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-gray-900"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {s.price} ₽ · {s.duration} мин</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Дата"
              type="date"
              value={bookingForm.date}
              onChange={(e) => setBookingForm((f) => ({ ...f, date: e.target.value }))}
            />
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Время</label>
              <select
                value={bookingForm.time}
                onChange={(e) => setBookingForm((f) => ({ ...f, time: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-gray-900"
              >
                {ALL_TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setShowAddBookingModal(false)}>Отмена</Button>
            <Button variant="primary" className="flex-1" onClick={handleAddBooking} disabled={!isAddBookingValid}>
              <Plus size={16} />Добавить
            </Button>
          </div>
        </div>
      </Modal>

      {/* BOOKING DETAIL MODAL */}
      <Modal isOpen={showBookingDetailModal} onClose={() => setShowBookingDetailModal(false)} title="Детали записи">
        {selectedBooking && (
          <div className="space-y-4">
            <div className={`rounded-xl border-l-4 p-4 ${STATUS_COLORS[selectedBooking.status]}`}>
              <p className="font-bold text-lg">{selectedBooking.client_name}</p>
              <p className="text-sm opacity-80">{selectedBooking.service_name}</p>
              <p className="text-sm font-medium mt-1">
                {parseDateFromString(selectedBooking.date).toLocaleDateString('ru-RU', {
                  weekday: 'long', day: 'numeric', month: 'long'
                })} в {selectedBooking.time}
              </p>
              {(() => {
                const svc = services.find(s => s.id === selectedBooking.service_id);
                return svc ? (
                  <p className="text-xs opacity-60 mt-1">
                    Длительность: {svc.duration} мин ({getSlotsCount(svc.duration)} слота по 30 мин)
                  </p>
                ) : null;
              })()}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-gray-500 text-xs mb-1">Телефон</p>
                <p className="font-medium">{selectedBooking.client_phone}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-gray-500 text-xs mb-1">Статус</p>
                <p className="font-medium">{STATUS_LABELS[selectedBooking.status]}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Изменить статус:</p>
              <div className="flex gap-2">
                {(['confirmed', 'pending', 'cancelled'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { handleStatusChange(selectedBooking.id, s); setSelectedBooking({ ...selectedBooking, status: s }); }}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      selectedBooking.status === s
                        ? s === 'confirmed' ? 'bg-emerald-600 text-white' : s === 'pending' ? 'bg-amber-500 text-white' : 'bg-gray-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => handleDeleteBooking(selectedBooking.id)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-red-500 hover:bg-red-50 transition-colors text-sm cursor-pointer"
            >
              <Trash2 size={14} />
              Удалить запись
            </button>
          </div>
        )}
      </Modal>

      {/* SERVICE MODAL */}
      <Modal
        isOpen={showEditServiceModal}
        onClose={() => setShowEditServiceModal(false)}
        title={editingService ? 'Редактировать услугу' : 'Добавить услугу'}
      >
        <div className="space-y-4">
          <Input
            label="Название услуги"
            placeholder="Маникюр + покрытие"
            value={serviceForm.name}
            onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Цена (₽)"
            placeholder="1500"
            type="number"
            value={serviceForm.price}
            onChange={(e) => setServiceForm((f) => ({ ...f, price: e.target.value }))}
          />
          <Input
            label="Длительность (минут)"
            placeholder="90"
            type="number"
            value={serviceForm.duration}
            onChange={(e) => setServiceForm((f) => ({ ...f, duration: e.target.value }))}
          />
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setShowEditServiceModal(false)}>Отмена</Button>
            <Button variant="primary" className="flex-1" onClick={handleSaveService}>
              <Save size={16} />
              {editingService ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}