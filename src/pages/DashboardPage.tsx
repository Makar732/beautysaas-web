import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Package, Settings, LogOut, Sparkles, Plus, Trash2, Edit3,
  Copy, Check, ExternalLink, Bell, Clock, User, Phone, DollarSign,
  ChevronLeft, ChevronRight, Save, TrendingUp, BarChart2, Lock,
  Send, Star, Shield, Users, Link, Palette, RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getBookingsByMasterId, getServicesByMasterId,
  upsertService, deleteService, addBooking, updateBookingStatus, deleteBooking,
  getMasterById, getSalonMasters, addSalonMaster, deleteSalonMaster,
  checkMasterCount, MASTER_LIMITS,
  SalonMaster,
} from '../lib/storage';
import { Booking, Service } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { PhoneInput, isPhoneComplete } from '../components/ui/PhoneInput';
import { formatDateToString, parseDateFromString } from '../utils/dateUtils';

const ADMIN_UUID = '789e7654-c21d-4edc-9ad8-a5a316aad726';

type Tab = 'calendar' | 'services' | 'masters' | 'analytics' | 'settings';

const SLOT_MINUTES   = 30;
const SLOT_HEIGHT_PX = 48;
const FREE_SERVICES_LIMIT = 3;

// Цвета для мастеров салона
const MASTER_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

const ALL_TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++)
    for (let m = 0; m < 60; m += SLOT_MINUTES)
      slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'00')}`);
  return slots;
})();

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-emerald-100 border-emerald-400 text-emerald-900',
  pending:   'bg-amber-100 border-amber-400 text-amber-900',
  cancelled: 'bg-gray-100 border-gray-300 text-gray-500 line-through',
};
const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Подтверждена',
  pending:   'В ожидании',
  cancelled: 'Отменена',
};

const WEEK_DAYS   = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const DAY_NAMES   = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const MONTH_NAMES_RU = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
];

function generateId() {
  return `id-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
}
function formatDate(d: Date): string { return formatDateToString(d); }
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
function getSlotsCount(dur: number) { return Math.ceil(dur / SLOT_MINUTES); }
function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function getMonthName(i: number) { return MONTH_NAMES_RU[i]; }
function pluralDays(n: number) {
  const a = Math.abs(n);
  if (a % 100 >= 11 && a % 100 <= 14) return 'дней';
  switch (a % 10) {
    case 1: return 'день';
    case 2: case 3: case 4: return 'дня';
    default: return 'дней';
  }
}

function getSubBadge(
  isPremium: boolean, isTrialActive: boolean, trialDaysLeft: number,
  planType: 'solo'|'salon', premiumDaysLeft: number,
) {
  if (isPremium) {
    const planLabel = planType === 'salon' ? 'Салон PRO' : 'Соло PRO';
    if (premiumDaysLeft > 0) {
      return {
        label: `⭐ ${planLabel}`,
        sublabel: `Осталось ${premiumDaysLeft} ${pluralDays(premiumDaysLeft)}`,
        className: 'bg-amber-500/20 text-amber-300',
        barPercent: Math.min(100, Math.round((premiumDaysLeft / 30) * 100)),
        barColor: 'bg-amber-400',
      };
    }
    return {
      label: `⭐ ${planLabel}`, sublabel: 'Активна',
      className: 'bg-amber-500/20 text-amber-300',
      barPercent: null, barColor: 'bg-amber-400',
    };
  }
  if (isTrialActive) {
    const barPct   = Math.min(100, Math.round((trialDaysLeft / 14) * 100));
    const isUrgent = trialDaysLeft <= 3;
    return {
      label: '🎁 Пробный период',
      sublabel: `Осталось ${trialDaysLeft} ${pluralDays(trialDaysLeft)}`,
      className: isUrgent ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400',
      barPercent: barPct,
      barColor:   isUrgent ? 'bg-red-400' : 'bg-emerald-400',
    };
  }
  return {
    label: '🔒 Подписка истекла', sublabel: 'Обновите тариф',
    className: 'bg-gray-500/20 text-gray-400',
    barPercent: 0, barColor: 'bg-gray-600',
  };
}

// ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const {
    user, logout, updateUser,
    isPremium, isTrialActive, trialDaysLeft, planType, premiumDaysLeft,
  } = useAuth();
  const navigate = useNavigate();

  // ── Tabs & UI state ──────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState<Tab>('calendar');
  const [bookings,     setBookings]     = useState<Booking[]>([]);
  const [services,     setServices]     = useState<Service[]>([]);
  const [currentDate,  setCurrentDate]  = useState(new Date());
  const [weekDates,    setWeekDates]    = useState<Date[]>([]);
  const [selectedDay,  setSelectedDay]  = useState(new Date());
  const [copied,       setCopied]       = useState(false);
  const [isLoading,    setIsLoading]    = useState(true);
  const [mobileView,   setMobileView]   = useState<'week'|'day'>('week');
  const [settingsSaved,setSettingsSaved]= useState(false);

  // ── Salon Masters state ───────────────────────────────────
  const [salonMasters,       setSalonMasters]       = useState<SalonMaster[]>([]);
  const [masterCount,        setMasterCount]        = useState({ count:0, limit:1, canAdd:false });
  const [showAddMasterModal, setShowAddMasterModal] = useState(false);
  const [masterForm,         setMasterForm]         = useState({
    name: '', specialization: '', color: MASTER_COLORS[0],
  });
  const [masterFormError,    setMasterFormError]    = useState('');
  const [addingMaster,       setAddingMaster]       = useState(false);
  const [copiedLinkId,       setCopiedLinkId]       = useState<string|null>(null);

  // ── Calendar filter ───────────────────────────────────────
  const [calendarMasterFilter, setCalendarMasterFilter] = useState<string|'all'>('all');

  // ── Modals ────────────────────────────────────────────────
  const [showAddBookingModal,    setShowAddBookingModal]    = useState(false);
  const [showEditServiceModal,   setShowEditServiceModal]   = useState(false);
  const [showBookingDetailModal, setShowBookingDetailModal] = useState(false);
  const [selectedBooking,        setSelectedBooking]        = useState<Booking|null>(null);
  const [editingService,         setEditingService]         = useState<Service|null>(null);

  // ── Settings ──────────────────────────────────────────────
  const [telegramChatId, setTelegramChatId] = useState('');
  const [workStart,      setWorkStart]      = useState('09:00');
  const [workEnd,        setWorkEnd]        = useState('21:00');
  const [daysOff,        setDaysOff]        = useState<number[]>([]);
  const [revenueMonth,   setRevenueMonth]   = useState(new Date());

  // ── Forms ─────────────────────────────────────────────────
  const [bookingForm, setBookingForm] = useState({
    clientName:'', clientPhone:'', serviceId:'',
    date:'', time:'', salonMasterId:'',
  });
  const [serviceForm, setServiceForm] = useState({
    name:'', price:'', duration:'',
  });

  // ── Computed ──────────────────────────────────────────────
  const isAdmin                = user?.id === ADMIN_UUID;
  const isSalon                = planType === 'salon' && isPremium;
  const isAnalyticsLocked      = !isPremium && !isTrialActive;
  const isServicesLimitReached = !isPremium && services.length >= FREE_SERVICES_LIMIT;
  const subBadge = getSubBadge(isPremium, isTrialActive, trialDaysLeft, planType, premiumDaysLeft);

  const TELEGRAM_BOT_USERNAME = 'Beauty_SaaSbot';
  const masterId    = user?.id    || '';
  const masterSlug  = user?.slug  || '';
  const bookingLink = `${window.location.origin}/#/book/${masterSlug}`;
  const telegramBotLink = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${masterId}`;

  const today = formatDate(new Date());

  // ── ИСПРАВЛЕНИЕ 1: loadData обёрнута в useCallback ────────
  const loadData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const [fetchedBookings, fetchedServices, master] = await Promise.all([
      getBookingsByMasterId(user.id),
      getServicesByMasterId(user.id),
      getMasterById(user.id),
    ]);
    setBookings(fetchedBookings);
    setServices(fetchedServices);

    if (master) {
      if (master.telegram_chat_id) setTelegramChatId(master.telegram_chat_id);
      if (master.workingHours)     { setWorkStart(master.workingHours.start); setWorkEnd(master.workingHours.end); }
      if (master.daysOff)          setDaysOff(master.daysOff);
    }

    // Загружаем мастеров салона
    if (user.plan_type === 'salon' && user.is_premium) {
      const [masters, count] = await Promise.all([
        getSalonMasters(user.id),
        checkMasterCount(user.id, user.plan_type),
      ]);
      setSalonMasters(masters);
      setMasterCount(count);
    }

    setIsLoading(false);
  }, [user]);

  // ── ИСПРАВЛЕНИЕ 2: правильные зависимости useEffect ───────
  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    setWeekDates(getWeekDates(currentDate));
    loadData();
  }, [user, currentDate, loadData, navigate]);

  // ── Calendar helpers ──────────────────────────────────────
  const getVisibleSlots = (): string[] => {
    if (!workStart || !workEnd) return ALL_TIME_SLOTS;
    const startMin    = timeToMinutes(workStart);
    const endMin      = timeToMinutes(workEnd);
    const visibleStart = Math.max(0, startMin - 60);
    const visibleEnd   = Math.min(23 * 60 + 30, endMin + 120);
    return ALL_TIME_SLOTS.filter(s => {
      const m = timeToMinutes(s);
      return m >= visibleStart && m <= visibleEnd;
    });
  };

  // Фильтруем записи по выбранному мастеру
  const getFilteredBookings = (): Booking[] => {
    if (!isSalon || calendarMasterFilter === 'all') return bookings;
    return bookings.filter(b => b.salon_master_id === calendarMasterFilter);
  };

  const getBookingsStartingAtSlot = (date: Date, slotTime: string): Booking[] => {
    const dateStr  = formatDate(date);
    const filtered = getFilteredBookings();
    return filtered.filter(
      b => b.date === dateStr && b.time === slotTime && b.status !== 'cancelled'
    );
  };

  const isSlotCoveredByEarlierBooking = (date: Date, slotTime: string): boolean => {
    const dateStr  = formatDate(date);
    const slotMin  = timeToMinutes(slotTime);
    const filtered = getFilteredBookings();
    return filtered.some(b => {
      if (b.date !== dateStr || b.status === 'cancelled' || b.time === slotTime) return false;
      const bStart = timeToMinutes(b.time);
      if (bStart >= slotMin) return false;
      const svc      = services.find(s => s.id === b.service_id);
      const duration = svc?.duration ?? SLOT_MINUTES;
      return slotMin < bStart + getSlotsCount(duration) * SLOT_MINUTES;
    });
  };

  const getBookingCardHeight = (b: Booking): number => {
    const svc      = services.find(s => s.id === b.service_id);
    const duration = svc?.duration ?? SLOT_MINUTES;
    return getSlotsCount(duration) * SLOT_HEIGHT_PX - 2;
  };

  const getDayBookings = (date: Date): Booking[] => {
    const dateStr  = formatDate(date);
    const filtered = getFilteredBookings();
    return filtered.filter(b => b.date === dateStr && b.status !== 'cancelled');
  };

  // Цвет карточки записи (по мастеру салона или дефолт)
  

  const getMasterColor = (b: Booking): string => {
    if (!isSalon || !b.salon_master_id) return '';
    const sm = salonMasters.find(m => m.id === b.salon_master_id);
    return sm?.color || '#10b981';
  };

  // ── Handlers ─────────────────────────────────────────────
  const handleCellClick = (date: Date, slotTime: string) => {
    setBookingForm({
      clientName:'', clientPhone:'',
      serviceId: services[0]?.id || '',
      date: formatDate(date), time: slotTime,
      salonMasterId: salonMasters[0]?.id || '',
    });
    setShowAddBookingModal(true);
  };

  const handleAddBooking = async () => {
    if (!bookingForm.clientName || !isPhoneComplete(bookingForm.clientPhone) || !bookingForm.serviceId) return;
    const service = services.find(s => s.id === bookingForm.serviceId);
    const newBooking: Booking = {
      id:            generateId(),
      master_id:     masterId,
      service_id:    bookingForm.serviceId,
      service_name:  service?.name || '',
      client_name:   bookingForm.clientName,
      client_phone:  bookingForm.clientPhone,
      date:          bookingForm.date,
      time:          bookingForm.time,
      status:        'confirmed',
      salon_master_id: isSalon && bookingForm.salonMasterId
        ? bookingForm.salonMasterId : null,
      created_at:    new Date().toISOString(),
    };
    await addBooking(newBooking);

    // Уведомляем мастера салона если выбран
    if (isSalon && bookingForm.salonMasterId) {
      try {
        await fetch('/api/notify-salon-master', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            salon_master_id: bookingForm.salonMasterId,
            booking: {
              clientName:  newBooking.client_name,
              clientPhone: newBooking.client_phone,
              serviceName: newBooking.service_name,
              date:        newBooking.date,
              time:        newBooking.time,
            },
          }),
        });
      } catch (e) {
        console.warn('Не удалось уведомить мастера:', e);
      }
    }

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
    if (!editingService && isServicesLimitReached) return;
    try {
      await upsertService({
        id:        editingService?.id || generateId(),
        master_id: masterId,
        name:      serviceForm.name.trim(),
        price:     Number(serviceForm.price),
        duration:  Number(serviceForm.duration),
      });
      await loadData();
      setShowEditServiceModal(false);
      setEditingService(null);
      setServiceForm({ name:'', price:'', duration:'' });
    } catch (e) {
      console.error('Ошибка сохранения услуги:', e);
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

  const toggleDayOff = (day: number) =>
    setDaysOff(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

  const handleSaveSettings = async () => {
    if (!user) return;
    await updateUser({
      ...user,
      telegram_chat_id: telegramChatId,
      workingHours: { start: workStart, end: workEnd },
      daysOff,
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const handleLogout = () => { logout(); navigate('/'); };

  const copyLink = async () => {
    await navigator.clipboard.writeText(bookingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Salon Masters handlers ────────────────────────────────
  const handleAddMaster = async () => {
    if (!masterForm.name.trim()) return;
    setAddingMaster(true);
    setMasterFormError('');

    const result = await addSalonMaster(masterId, masterForm, planType);
    if (!result.success) {
      setMasterFormError(result.error || 'Ошибка при добавлении');
      setAddingMaster(false);
      return;
    }

    await loadData();
    setShowAddMasterModal(false);
    setMasterForm({ name:'', specialization:'', color: MASTER_COLORS[0] });
    setAddingMaster(false);
  };

  const handleDeleteMaster = async (id: string) => {
    await deleteSalonMaster(id);
    await loadData();
  };

  const handleCopyMasterLink = async (master: SalonMaster) => {
    if (!master.link_code) return;
    const link = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${master.link_code}`;
    await navigator.clipboard.writeText(link);
    setCopiedLinkId(master.id);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  // ── Revenue helpers ───────────────────────────────────────
  const calculateMonthRevenue = (targetMonth: Date) => {
    const prefix = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth()+1).padStart(2,'0')}`;
    return bookings
      .filter(b => b.date.startsWith(prefix) && b.status === 'confirmed')
      .reduce((sum, b) => {
        const svc = services.find(s => s.id === b.service_id);
        return sum + (svc?.price || 0);
      }, 0);
  };

  // Аналитика по мастерам салона
  const getMasterRevenue = (salonMasterId: string, targetMonth: Date) => {
    const prefix = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth()+1).padStart(2,'0')}`;
    return bookings
      .filter(b =>
        b.salon_master_id === salonMasterId &&
        b.date.startsWith(prefix) &&
        b.status === 'confirmed'
      )
      .reduce((sum, b) => {
        const svc = services.find(s => s.id === b.service_id);
        return sum + (svc?.price || 0);
      }, 0);
  };

  const monthRevenue   = calculateMonthRevenue(revenueMonth);
  const now            = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthBookings  = bookings.filter(b => b.date.startsWith(currentMonthPrefix));
  const confirmedMonth = monthBookings.filter(b => b.status === 'confirmed');
  const avgCheck       = confirmedMonth.length > 0
    ? Math.round(confirmedMonth.reduce((sum, b) => {
        const svc = services.find(s => s.id === b.service_id);
        return sum + (svc?.price || 0);
      }, 0) / confirmedMonth.length)
    : 0;

  const todayBookings = bookings.filter(b => b.date === today && b.status !== 'cancelled');
  const todayRevenue  = todayBookings.reduce((sum, b) => {
    const svc = services.find(s => s.id === b.service_id);
    return sum + (svc?.price || 0);
  }, 0);

  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    return d;
  });
  const revenueByMonth = last6Months.map(d => ({
    label: getMonthName(d.getMonth()).slice(0,3),
    value: calculateMonthRevenue(d),
  }));
  const maxRevenue = Math.max(...revenueByMonth.map(r => r.value), 1);

  const serviceStats = services
    .map(s => ({
      name:    s.name,
      count:   bookings.filter(b => b.service_id === s.id && b.status === 'confirmed').length,
      revenue: bookings.filter(b => b.service_id === s.id && b.status === 'confirmed').length * s.price,
    }))
    .sort((a, b) => b.count - a.count);

  const isAddBookingValid =
    bookingForm.clientName.trim() &&
    isPhoneComplete(bookingForm.clientPhone) &&
    bookingForm.serviceId;

  const visibleSlots = getVisibleSlots();

  // ── ИСПРАВЛЕНИЕ 3: if (!user) return — ПОСЛЕ всех хуков ──
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ══ SIDEBAR ══ */}
      <aside className="hidden lg:flex flex-col w-64 bg-gray-950 text-white h-screen sticky top-0">
        <div className="p-6 border-b border-white/8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="text-amber-400" size={20} />
            <span className="font-bold text-lg">
              Beauty<span className="text-emerald-400">SaaS</span>
            </span>
          </div>
          <div className="bg-white/5 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 bg-emerald-700 rounded-full flex items-center justify-center text-lg font-bold shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{user.name}</p>
                <p className="text-xs text-gray-400 truncate">{user.phone}</p>
              </div>
            </div>

            <div className={`rounded-xl px-3 py-2 ${subBadge.className}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold">{subBadge.label}</span>
                {planType && isPremium && (
                  <span className="text-xs opacity-60">
                    {planType === 'salon' ? 'Салон' : 'Соло'}
                  </span>
                )}
              </div>
              {subBadge.sublabel && (
                <p className="text-xs opacity-75 mb-2">{subBadge.sublabel}</p>
              )}
              {subBadge.barPercent !== null && (
                <div className="w-full bg-black/20 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${subBadge.barColor}`}
                    style={{ width: `${subBadge.barPercent}%` }}
                  />
                </div>
              )}
            </div>

            {!isPremium && (
              <a
                href="https://t.me/beautysaas_support_bot"
                target="_blank" rel="noopener noreferrer"
                className={`mt-2 flex items-center justify-center gap-1.5 w-full text-xs font-semibold px-3 py-2 rounded-xl transition-all ${
                  isTrialActive && trialDaysLeft > 3
                    ? 'bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-300'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 animate-pulse'
                }`}
              >
                <Star size={11} />
                {isTrialActive ? 'Перейти на PRO' : 'Обновить тариф'}
              </a>
            )}
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {([
            { id: 'calendar',  icon: Calendar,  label: 'Календарь' },
            { id: 'services',  icon: Package,   label: 'Мои услуги' },
            { id: 'masters',   icon: Users,     label: 'Мастера',   salonOnly: true },
            { id: 'analytics', icon: BarChart2, label: 'Аналитика' },
            { id: 'settings',  icon: Settings,  label: 'Настройки' },
          ] as { id: Tab; icon: typeof Calendar; label: string; salonOnly?: boolean }[])
            .map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  activeTab === item.id
                    ? 'bg-emerald-700 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon size={18} />
                {item.label}
                {item.id === 'analytics' && isAnalyticsLocked && (
                  <Lock size={12} className="ml-auto text-gray-600" />
                )}
                {item.salonOnly && !isSalon && (
                  <Lock size={12} className="ml-auto text-gray-600" />
                )}
                {item.salonOnly && isSalon && (
                  <span className="ml-auto text-xs bg-emerald-700/40 text-emerald-300 px-1.5 py-0.5 rounded-full">
                    {salonMasters.length}/{MASTER_LIMITS.salon}
                  </span>
                )}
              </button>
            ))}

          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-900/20 border border-red-500/20 mt-2 cursor-pointer"
            >
              <Shield size={18} />
              Админ Панель
              <span className="ml-auto text-xs bg-red-500/20 px-1.5 py-0.5 rounded-full">ONLY</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-white/8 space-y-3">
          <div className="bg-white/5 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">Сегодня</p>
            <p className="font-bold text-emerald-400">{todayRevenue.toLocaleString('ru-RU')} ₽</p>
            <p className="text-xs text-gray-500">
              {todayBookings.length === 0
                ? '🌿 Записей нет'
                : `${todayBookings.length} ${todayBookings.length === 1 ? 'запись' : todayBookings.length < 5 ? 'записи' : 'записей'}`}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-400 hover:bg-red-900/20 hover:text-red-400 transition-all cursor-pointer"
          >
            <LogOut size={18} />Выйти
          </button>
        </div>
      </aside>

      {/* ══ MOBILE BOTTOM NAV ══ */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-gray-950 border-t border-white/8 flex">
        {([
          { id: 'calendar',  icon: Calendar,  label: 'Журнал' },
          { id: 'services',  icon: Package,   label: 'Услуги' },
          { id: 'masters',   icon: Users,     label: 'Мастера' },
          { id: 'analytics', icon: BarChart2, label: 'Аналитика' },
          { id: 'settings',  icon: Settings,  label: 'Настройки' },
        ] as { id: Tab; icon: typeof Calendar; label: string }[]).map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium cursor-pointer ${
              activeTab === item.id ? 'text-emerald-400' : 'text-gray-500'
            }`}
          >
            <item.icon size={20} />
            {item.label}
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium text-red-400 cursor-pointer"
          >
            <Shield size={20} />Админка
          </button>
        )}
      </div>

      {/* ══ MAIN ══ */}
      <main className="flex-1 overflow-auto pb-20 lg:pb-0 relative">

        {isLoading && (
          <div className="absolute inset-0 bg-white/60 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Mobile Header */}
        <div className="lg:hidden bg-gray-950 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-400" size={16} />
            <span className="font-bold text-sm">
              Beauty<span className="text-emerald-400">SaaS</span>
            </span>
          </div>
          <div className="flex flex-col items-center min-w-0 flex-1 px-3">
            <span className="text-xs text-gray-300 font-medium truncate max-w-[140px]">{user.name}</span>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold mt-0.5 ${subBadge.className}`}>
              {subBadge.label}
            </span>
          </div>
          <button onClick={handleLogout} className="text-gray-400 hover:text-white cursor-pointer p-1">
            <LogOut size={17} />
          </button>
          {!isPremium && (
            <a
              href="https://t.me/beautysaas_support_bot"
              target="_blank" rel="noopener noreferrer"
              className={`ml-2 p-1.5 rounded-lg ${
                isTrialActive && trialDaysLeft > 3
                  ? 'bg-emerald-700/40 text-emerald-300'
                  : 'bg-amber-500/30 text-amber-300 animate-pulse'
              }`}
            >
              <Star size={16} />
            </a>
          )}
        </div>

        {/* Page Header */}
        <div className="bg-white border-b border-gray-100 px-4 lg:px-8 py-4 lg:py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-gray-900">
                {activeTab === 'calendar'  && 'Журнал записей'}
                {activeTab === 'services'  && 'Мои услуги'}
                {activeTab === 'masters'   && 'Команда мастеров'}
                {activeTab === 'analytics' && 'Аналитика'}
                {activeTab === 'settings'  && 'Настройки профиля'}
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                {activeTab === 'calendar'  && `${monthBookings.length} записей в этом месяце`}
                {activeTab === 'services'  && `${services.length} услуг в вашем прайсе`}
                {activeTab === 'masters'   && (isSalon ? `${salonMasters.length} из ${MASTER_LIMITS.salon} мастеров` : 'Доступно на тарифе "Салон"')}
                {activeTab === 'analytics' && 'Доходы и статистика'}
                {activeTab === 'settings'  && 'Управляйте профилем и уведомлениями'}
              </p>
            </div>

            {activeTab === 'calendar' && (
              <Button variant="primary" size="sm" onClick={() => {
                setBookingForm({ clientName:'', clientPhone:'', serviceId: services[0]?.id||'', date: today, time:'10:00', salonMasterId: salonMasters[0]?.id||'' });
                setShowAddBookingModal(true);
              }}>
                <Plus size={16} />Добавить запись
              </Button>
            )}
            {activeTab === 'services' && (
              <div className="flex flex-col items-end gap-1">
                <Button
                  variant="primary" size="sm"
                  disabled={isServicesLimitReached}
                  onClick={() => {
                    if (isServicesLimitReached) return;
                    setEditingService(null);
                    setServiceForm({ name:'', price:'', duration:'' });
                    setShowEditServiceModal(true);
                  }}
                >
                  <Plus size={16} />Добавить услугу
                </Button>
                {isServicesLimitReached && (
                  <p className="text-xs text-amber-600">Лимит {FREE_SERVICES_LIMIT} услуги на бесплатном тарифе</p>
                )}
              </div>
            )}
            {activeTab === 'masters' && isSalon && (
              <Button
                variant="primary" size="sm"
                disabled={!masterCount.canAdd}
                onClick={() => {
                  setMasterFormError('');
                  setMasterForm({ name:'', specialization:'', color: MASTER_COLORS[0] });
                  setShowAddMasterModal(true);
                }}
              >
                <Plus size={16} />Добавить мастера
              </Button>
            )}
          </div>

          {/* Calendar top stats */}
          {activeTab === 'calendar' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                <div className="text-emerald-600 bg-emerald-100 p-2 rounded-lg"><Calendar size={14}/></div>
                <div><p className="font-bold text-gray-900 text-sm">{todayBookings.length}</p><p className="text-xs text-gray-500">Сегодня</p></div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                <div className="text-emerald-600 bg-emerald-100 p-2 rounded-lg"><DollarSign size={14}/></div>
                <div><p className="font-bold text-gray-900 text-sm">{todayRevenue.toLocaleString('ru-RU')} ₽</p><p className="text-xs text-gray-500">Выручка</p></div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-blue-600"/>
                    <p className="text-xs text-gray-500">За месяц</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setRevenueMonth(new Date(revenueMonth.getFullYear(), revenueMonth.getMonth()-1))} className="p-1 hover:bg-gray-200 rounded">
                      <ChevronLeft size={14}/>
                    </button>
                    <span className="text-xs text-gray-600 px-2">
                      {revenueMonth.toLocaleDateString('ru-RU',{month:'short',year:'numeric'})}
                    </span>
                    <button onClick={() => setRevenueMonth(new Date(revenueMonth.getFullYear(), revenueMonth.getMonth()+1))} className="p-1 hover:bg-gray-200 rounded">
                      <ChevronRight size={14}/>
                    </button>
                  </div>
                </div>
                <p className="font-bold text-gray-900 text-lg">{monthRevenue.toLocaleString('ru-RU')} ₽</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 lg:p-8">

          {/* ════════════════════════════════════════════════ */}
          {/* CALENDAR TAB                                     */}
          {/* ════════════════════════════════════════════════ */}
          {activeTab === 'calendar' && (
            <div>
              {/* Фильтр по мастерам (только Салон) */}
              {isSalon && salonMasters.length > 0 && (
                <div className="flex gap-2 mb-4 flex-wrap">
                  <button
                    onClick={() => setCalendarMasterFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                      calendarMasterFilter === 'all'
                        ? 'bg-gray-900 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Все мастера
                  </button>
                  {salonMasters.map(sm => (
                    <button
                      key={sm.id}
                      onClick={() => setCalendarMasterFilter(sm.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                        calendarMasterFilter === sm.id
                          ? 'text-white shadow-sm'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                      style={calendarMasterFilter === sm.id ? { backgroundColor: sm.color } : {}}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: sm.color }}
                      />
                      {sm.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <button onClick={() => { const d=new Date(currentDate); d.setDate(d.getDate()-7); setCurrentDate(d); }} className="p-2 hover:bg-gray-200 rounded-lg cursor-pointer">
                  <ChevronLeft size={20}/>
                </button>
                <div className="text-center">
                  <p className="font-semibold text-gray-900">
                    {weekDates[0]?.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})} — {weekDates[6]?.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}
                  </p>
                  <button onClick={() => setCurrentDate(new Date())} className="text-xs text-emerald-600 hover:text-emerald-700 cursor-pointer">Сегодня</button>
                </div>
                <button onClick={() => { const d=new Date(currentDate); d.setDate(d.getDate()+7); setCurrentDate(d); }} className="p-2 hover:bg-gray-200 rounded-lg cursor-pointer">
                  <ChevronRight size={20}/>
                </button>
              </div>

              <div className="flex lg:hidden gap-2 mb-4">
                {(['week','day'] as const).map(v => (
                  <button key={v} onClick={() => setMobileView(v)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium cursor-pointer ${mobileView===v?'bg-emerald-700 text-white':'bg-gray-100 text-gray-600'}`}>
                    {v==='week'?'Неделя':'День'}
                  </button>
                ))}
              </div>

              {/* Desktop calendar */}
              <div className="hidden lg:block bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="grid border-b border-gray-100" style={{ gridTemplateColumns:'72px repeat(7, 1fr)' }}>
                  <div className="p-3 text-xs text-gray-400 text-center font-medium">Время</div>
                  {weekDates.map((d, i) => {
                    const isToday = formatDate(d) === today;
                    const cnt     = getDayBookings(d).length;
                    return (
                      <div key={i} className={`p-3 text-center border-l border-gray-100 ${isToday?'bg-emerald-50':''}`}>
                        <p className="text-xs text-gray-400 font-medium">{DAY_NAMES[i]}</p>
                        <p className={`text-lg font-bold ${isToday?'text-emerald-600':'text-gray-900'}`}>{d.getDate()}</p>
                        {cnt > 0 && <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">{cnt}</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="overflow-y-auto max-h-[600px]">
                  {visibleSlots.map(slotTime => {
                    const isHalfHour = slotTime.endsWith(':30');
                    return (
                      <div key={slotTime}
                        className={`grid border-b ${isHalfHour?'border-gray-50':'border-gray-100'}`}
                        style={{ gridTemplateColumns:'72px repeat(7, 1fr)', height:`${SLOT_HEIGHT_PX}px` }}>
                        <div className="text-xs text-gray-400 font-mono text-right pr-3 flex items-center justify-end">
                          {isHalfHour ? <span className="text-gray-200">·</span> : slotTime}
                        </div>
                        {weekDates.map((d, di) => {
                          const isToday  = formatDate(d) === today;
                          const isCovered = isSlotCoveredByEarlierBooking(d, slotTime);
                          const startingBookings = getBookingsStartingAtSlot(d, slotTime);
                          return (
                            <div key={di}
                              onClick={() => !isCovered && handleCellClick(d, slotTime)}
                              className={`border-l border-gray-100 relative ${isToday?'bg-emerald-50/20':''} ${!isCovered?'cursor-pointer group':''}`}
                              style={{ height:`${SLOT_HEIGHT_PX}px`, overflow:'visible' }}>
                              {!isCovered && startingBookings.length === 0 && (
                                <div className="absolute inset-0.5 rounded-lg border-2 border-dashed border-transparent group-hover:border-emerald-200 transition-colors flex items-center justify-center z-0">
                                  <Plus size={12} className="text-emerald-400 opacity-0 group-hover:opacity-100"/>
                                </div>
                              )}
                              {startingBookings.map(b => {
                                const cardHeight = getBookingCardHeight(b);
                                const svc        = services.find(s => s.id === b.service_id);
                                const duration   = svc?.duration ?? SLOT_MINUTES;
                                const slotsCount = getSlotsCount(duration);
                                const mColor     = getMasterColor(b);
                                return (
                                  <div key={b.id}
                                    onClick={e => { e.stopPropagation(); setSelectedBooking(b); setShowBookingDetailModal(true); }}
                                    className={`absolute left-0.5 right-0.5 top-0.5 rounded-lg border-l-4 px-1.5 py-1 text-xs cursor-pointer hover:shadow-lg transition-shadow ${STATUS_COLORS[b.status]}`}
                                    style={{
                                      height:`${cardHeight}px`, zIndex:2, overflow:'hidden',
                                      ...(mColor ? { borderLeftColor: mColor } : {}),
                                    }}>
                                    <p className="font-semibold truncate leading-tight">{b.client_name}</p>
                                    <p className="opacity-70 truncate text-xs">{b.service_name}</p>
                                    <p className="opacity-50 text-xs">{b.time}</p>
                                    {slotsCount > 1 && <p className="opacity-40 text-xs">{duration} мин</p>}
                                    {isSalon && b.salon_master_id && (
                                      <p className="text-xs font-medium mt-0.5 opacity-80">
                                        {salonMasters.find(m => m.id === b.salon_master_id)?.name}
                                      </p>
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

              {/* Mobile views */}
              <div className="lg:hidden">
                {mobileView === 'day' ? (
                  <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 bg-emerald-50">
                      <p className="font-bold text-gray-900">
                        {selectedDay.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}
                      </p>
                      <p className="text-sm text-gray-500">{getDayBookings(selectedDay).length} записей</p>
                    </div>
                    <div className="overflow-y-auto max-h-[60vh]">
                      {visibleSlots.map(slotTime => {
                        const isHalfHour   = slotTime.endsWith(':30');
                        const isCovered    = isSlotCoveredByEarlierBooking(selectedDay, slotTime);
                        const cellBookings = getBookingsStartingAtSlot(selectedDay, slotTime);
                        if (isCovered) return null;
                        return (
                          <div key={slotTime}
                            className={`flex gap-3 p-3 border-b cursor-pointer group ${isHalfHour?'border-gray-50 bg-gray-50/30':'border-gray-100 hover:bg-gray-50'}`}
                            onClick={() => handleCellClick(selectedDay, slotTime)}>
                            <div className="w-14 text-xs font-mono pt-1 shrink-0 text-right">
                              {isHalfHour ? <span className="text-gray-300">·</span> : <span className="text-gray-400">{slotTime}</span>}
                            </div>
                            <div className="flex-1" style={{ minHeight:'36px' }}>
                              {cellBookings.length === 0 ? (
                                <span className="text-xs text-gray-300 group-hover:text-emerald-400">+ Добавить запись</span>
                              ) : (
                                cellBookings.map(b => {
                                  const svc      = services.find(s => s.id === b.service_id);
                                  const duration = svc?.duration ?? SLOT_MINUTES;
                                  const mColor   = getMasterColor(b);
                                  return (
                                    <div key={b.id}
                                      onClick={e => { e.stopPropagation(); setSelectedBooking(b); setShowBookingDetailModal(true); }}
                                      className={`rounded-xl border-l-4 p-2 text-xs mb-1 ${STATUS_COLORS[b.status]}`}
                                      style={mColor ? { borderLeftColor: mColor } : {}}>
                                      <p className="font-semibold">{b.client_name}</p>
                                      <p className="opacity-70">{b.service_name} · {b.time} · {duration} мин</p>
                                      {isSalon && b.salon_master_id && (
                                        <p className="text-xs opacity-70">
                                          👩‍🎨 {salonMasters.find(m => m.id === b.salon_master_id)?.name}
                                        </p>
                                      )}
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
                      const dayBks  = getDayBookings(d);
                      const isToday = formatDate(d) === today;
                      return (
                        <div key={i} className={`bg-white rounded-2xl border p-4 ${isToday?'border-emerald-300 bg-emerald-50/30':'border-gray-200'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <p className={`font-bold ${isToday?'text-emerald-700':'text-gray-900'}`}>
                              {DAY_NAMES[i]}, {d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}
                              {isToday && <span className="ml-2 text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full">Сегодня</span>}
                            </p>
                            <button onClick={() => { setSelectedDay(d); setMobileView('day'); }} className="text-xs text-emerald-600 cursor-pointer">Открыть →</button>
                          </div>
                          {dayBks.length === 0 ? (
                            <div className="flex items-center gap-2 py-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-200"/>
                              <p className="text-xs text-gray-400">Свободно</p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {dayBks.slice(0,3).map(b => {
                                const mColor = getMasterColor(b);
                                return (
                                  <div key={b.id}
                                    className={`rounded-lg border-l-4 px-2 py-1 text-xs ${STATUS_COLORS[b.status]}`}
                                    style={mColor ? { borderLeftColor: mColor } : {}}>
                                    {b.time} · {b.client_name} · {b.service_name}
                                    {isSalon && b.salon_master_id && ` · ${salonMasters.find(m=>m.id===b.salon_master_id)?.name}`}
                                  </div>
                                );
                              })}
                              {dayBks.length > 3 && <p className="text-xs text-gray-400 pl-2">+{dayBks.length-3} ещё...</p>}
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

          {/* ════════════════════════════════════════════════ */}
          {/* SERVICES TAB                                     */}
          {/* ════════════════════════════════════════════════ */}
          {activeTab === 'services' && (
            <div>
              {isServicesLimitReached && (
                <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                    <Lock size={18} className="text-amber-600"/>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900">Достигнут лимит бесплатного тарифа</p>
                    <p className="text-xs text-amber-700 mt-0.5">До {FREE_SERVICES_LIMIT} услуг на бесплатном тарифе. Перейдите на PRO.</p>
                  </div>
                  <Button variant="primary" size="sm"><Star size={14}/> PRO</Button>
                </div>
              )}
              {services.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                  <Package size={48} className="text-gray-300 mx-auto mb-4"/>
                  <p className="text-gray-500 font-medium mb-4">Добавьте первую услугу</p>
                  <Button variant="primary" onClick={() => { setEditingService(null); setServiceForm({name:'',price:'',duration:''}); setShowEditServiceModal(true); }}>
                    <Plus size={16}/>Добавить услугу
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {services.map(s => (
                    <div key={s.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow group">
                      <div className="flex items-start justify-between mb-3">
                        <div className="bg-emerald-100 text-emerald-700 p-2 rounded-xl"><Package size={18}/></div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEditService(s)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 cursor-pointer"><Edit3 size={14}/></button>
                          <button onClick={() => handleDeleteService(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 size={14}/></button>
                        </div>
                      </div>
                      <h3 className="font-bold text-gray-900 text-lg mb-1">{s.name}</h3>
                      {s.description && <p className="text-sm text-gray-500 mb-3">{s.description}</p>}
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-black text-emerald-600">{s.price.toLocaleString('ru-RU')} ₽</span>
                        <div className="flex items-center gap-1 text-gray-400 text-sm"><Clock size={14}/>{s.duration} мин</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════ */}
          {/* MASTERS TAB                                      */}
          {/* ════════════════════════════════════════════════ */}
          {activeTab === 'masters' && (
            <div>
              {!isSalon ? (
                <div className="max-w-lg mx-auto">
                  <div className="bg-white rounded-3xl border border-gray-200 p-10 text-center shadow-sm">
                    <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Users size={36} className="text-purple-500"/>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-3">
                      Управление командой
                    </h2>
                    <p className="text-gray-500 text-sm mb-2 leading-relaxed">
                      Добавляйте мастеров в свой салон, назначайте их на записи и получайте аналитику по каждому.
                    </p>
                    <p className="text-gray-400 text-xs mb-8">
                      Доступно на тарифе <strong className="text-purple-600">«Салон» — 990 ₽/мес</strong>
                    </p>

                    <div className="grid grid-cols-1 gap-3 mb-8 text-left">
                      {[
                        { icon:'👥', title:'До 3 мастеров', desc:'Каждый получает уведомления о своих записях' },
                        { icon:'📅', title:'Фильтрация в календаре', desc:'Смотрите записи по конкретному мастеру' },
                        { icon:'📊', title:'Аналитика по мастерам', desc:'Выручка и загрузка каждого специалиста' },
                        { icon:'🔔', title:'Персональные Telegram-уведомления', desc:'Мастер сам привязывает свой аккаунт' },
                      ].map((f, i) => (
                        <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                          <span className="text-xl">{f.icon}</span>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{f.title}</p>
                            <p className="text-xs text-gray-500">{f.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <a
                      href="https://t.me/beautysaas_support_bot"
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold px-6 py-3 rounded-xl transition-all w-full text-sm"
                    >
                      <Star size={16}/>
                      Перейти на тариф «Салон»
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <Users size={18} className="text-emerald-600"/>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          Мастера: {masterCount.count} / {masterCount.limit}
                        </p>
                        <p className="text-xs text-gray-500">
                          {masterCount.canAdd
                            ? `Можно добавить ещё ${masterCount.limit - masterCount.count}`
                            : 'Достигнут лимит тарифа «Салон»'}
                        </p>
                      </div>
                    </div>
                    {!masterCount.canAdd && (
                      <a
                        href="https://t.me/beautysaas_support_bot"
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                      >
                        Нужно больше? →
                      </a>
                    )}
                  </div>

                  {salonMasters.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
                      <Users size={48} className="text-gray-300 mx-auto mb-4"/>
                      <p className="text-gray-500 font-medium mb-2">Добавьте первого мастера</p>
                      <p className="text-xs text-gray-400 mb-6">
                        После добавления мастер получит ссылку для привязки Telegram
                      </p>
                      <Button variant="primary" onClick={() => { setMasterFormError(''); setMasterForm({name:'',specialization:'',color:MASTER_COLORS[0]}); setShowAddMasterModal(true); }}>
                        <Plus size={16}/>Добавить мастера
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {salonMasters.map(sm => (
                        <div key={sm.id} className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold"
                                style={{ backgroundColor: sm.color }}
                              >
                                {sm.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-gray-900">{sm.name}</p>
                                <p className="text-xs text-gray-500">{sm.specialization || 'Мастер'}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteMaster(sm.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                            >
                              <Trash2 size={14}/>
                            </button>
                          </div>

                          <div className={`rounded-xl p-3 mb-3 flex items-center gap-2 ${
                            sm.telegram_chat_id
                              ? 'bg-emerald-50 border border-emerald-100'
                              : 'bg-gray-50 border border-gray-200'
                          }`}>
                            {sm.telegram_chat_id ? (
                              <>
                                <div className="w-2 h-2 rounded-full bg-emerald-500"/>
                                <p className="text-xs font-medium text-emerald-700">Telegram подключён</p>
                              </>
                            ) : (
                              <>
                                <div className="w-2 h-2 rounded-full bg-gray-400"/>
                                <p className="text-xs text-gray-500">Telegram не привязан</p>
                              </>
                            )}
                          </div>

                          {sm.link_code && (
                            <button
                              onClick={() => handleCopyMasterLink(sm)}
                              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-blue-300 transition-all cursor-pointer"
                            >
                              {copiedLinkId === sm.id ? (
                                <><Check size={14} className="text-emerald-500"/><span className="text-emerald-600">Скопировано!</span></>
                              ) : (
                                <><Link size={14} className="text-blue-500"/><span>Скопировать ссылку привязки TG</span></>
                              )}
                            </button>
                          )}

                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs text-gray-400">
                              Записей в этом месяце: <span className="font-semibold text-gray-700">
                                {bookings.filter(b =>
                                  b.salon_master_id === sm.id &&
                                  b.date.startsWith(currentMonthPrefix) &&
                                  b.status !== 'cancelled'
                                ).length}
                              </span>
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              Выручка: <span className="font-semibold text-emerald-600">
                                {getMasterRevenue(sm.id, now).toLocaleString('ru-RU')} ₽
                              </span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                    <p className="text-sm font-semibold text-blue-900 mb-2">Как подключить мастера?</p>
                    <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                      <li>Добавьте мастера — введите имя и специализацию</li>
                      <li>Скопируйте ссылку привязки и отправьте мастеру</li>
                      <li>Мастер переходит по ссылке → нажимает /start в @Beauty_SaaSbot</li>
                      <li>Telegram привязан — мастер получает уведомления о своих записях</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════ */}
          {/* ANALYTICS TAB                                    */}
          {/* ════════════════════════════════════════════════ */}
          {activeTab === 'analytics' && (
            <div className="relative">
              <div className={isAnalyticsLocked ? 'blur-sm pointer-events-none select-none' : ''}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  {[
                    { icon: <DollarSign size={18}/>, bg:'bg-emerald-100 text-emerald-600', label:'Выручка за месяц', value:`${calculateMonthRevenue(new Date()).toLocaleString('ru-RU')} ₽`, sub: getMonthName(new Date().getMonth()) },
                    { icon: <Calendar size={18}/>,   bg:'bg-blue-100 text-blue-600',       label:'Записей за месяц',  value: confirmedMonth.length, sub:'подтверждённых' },
                    { icon: <TrendingUp size={18}/>, bg:'bg-amber-100 text-amber-600',     label:'Средний чек',       value:`${avgCheck.toLocaleString('ru-RU')} ₽`, sub:'за услугу' },
                  ].map((card, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded-xl ${card.bg}`}>{card.icon}</div>
                        <p className="text-sm text-gray-500 font-medium">{card.label}</p>
                      </div>
                      <p className="text-3xl font-black text-gray-900">{card.value}</p>
                      <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
                    </div>
                  ))}
                </div>

                {isSalon && salonMasters.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
                    <h3 className="font-bold text-gray-900 text-lg mb-4 flex items-center gap-2">
                      <Users size={18} className="text-purple-500"/>
                      Выручка по мастерам
                    </h3>
                    <div className="space-y-4">
                      {salonMasters.map(sm => {
                        const rev   = getMasterRevenue(sm.id, now);
                        const count = bookings.filter(b =>
                          b.salon_master_id === sm.id &&
                          b.date.startsWith(currentMonthPrefix) &&
                          b.status === 'confirmed'
                        ).length;
                        const maxRev = Math.max(
                          ...salonMasters.map(m => getMasterRevenue(m.id, now)), 1
                        );
                        const pct = Math.round((rev / maxRev) * 100);
                        return (
                          <div key={sm.id} className="flex items-center gap-4">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                              style={{ backgroundColor: sm.color }}
                            >
                              {sm.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-medium text-gray-900">{sm.name}</p>
                                <p className="text-sm font-bold text-emerald-600">{rev.toLocaleString('ru-RU')} ₽</p>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="h-2 rounded-full transition-all duration-500"
                                  style={{ width:`${pct}%`, backgroundColor: sm.color }}
                                />
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">{count} записей</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
                  <h3 className="font-bold text-gray-900 text-lg mb-6">Выручка за 6 месяцев</h3>
                  <div className="flex items-end gap-3 h-40">
                    {revenueByMonth.map((item, i) => {
                      const heightPct = maxRevenue > 0 ? (item.value / maxRevenue) * 100 : 0;
                      const isCurrent = i === revenueByMonth.length - 1;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-2">
                          <p className="text-xs font-bold text-gray-700">{item.value>0?`${Math.round(item.value/1000)}к`:''}</p>
                          <div className="w-full flex items-end" style={{ height:'100px' }}>
                            <div className={`w-full rounded-t-lg transition-all duration-500 ${isCurrent?'bg-emerald-500':'bg-emerald-200'}`}
                              style={{ height:`${Math.max(heightPct, item.value>0?4:0)}%` }}/>
                          </div>
                          <p className="text-xs text-gray-400">{item.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h3 className="font-bold text-gray-900 text-lg mb-4">Топ услуг</h3>
                  {serviceStats.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-8">Данных пока нет</p>
                  ) : (
                    <div className="space-y-3">
                      {serviceStats.map((s, i) => (
                        <div key={i} className="flex items-center gap-4">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i===0?'bg-amber-100 text-amber-700':'bg-gray-100 text-gray-600'}`}>
                            {i+1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-medium text-gray-900">{s.name}</p>
                              <p className="text-sm font-bold text-emerald-600">{s.revenue.toLocaleString('ru-RU')} ₽</p>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                                style={{ width: serviceStats[0].count>0 ? `${(s.count/serviceStats[0].count)*100}%` : '0%' }}/>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{s.count} записей</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {isAnalyticsLocked && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <div className="bg-white rounded-3xl border border-gray-200 shadow-2xl p-8 max-w-sm mx-4 text-center">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Lock size={28} className="text-amber-600"/>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Аналитика заблокирована</h3>
                    <p className="text-gray-500 text-sm mb-6">Доступ к аналитике открывается на тарифе <strong>PRO</strong>.</p>
                    <a href="https://t.me/beautysaas_support_bot" target="_blank" rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-3 rounded-xl text-sm">
                      <Star size={16}/>Перейти на PRO
                    </a>
                    <p className="text-xs text-gray-400 mt-3">От 550 ₽/месяц</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════ */}
          {/* SETTINGS TAB                                     */}
          {/* ════════════════════════════════════════════════ */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-6">
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="font-bold text-gray-900 text-lg mb-1">Ваша ссылка для записи</h2>
                <p className="text-sm text-gray-500 mb-4">Поделитесь ссылкой с клиентами</p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono text-gray-700 truncate">{bookingLink}</div>
                  <Button variant="primary" size="sm" onClick={copyLink}>
                    {copied ? <Check size={16}/> : <Copy size={16}/>}
                    {copied ? 'Скопировано!' : 'Копировать'}
                  </Button>
                </div>
                <a href={`#/book/${masterSlug}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 mt-3">
                  <ExternalLink size={14}/> Открыть страницу записи
                </a>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="font-bold text-gray-900 text-lg mb-4">Профиль</h2>
                <div className="space-y-4">
                  {[
                    { label:'Имя / Название студии', icon:<User size={16} className="text-gray-400"/>, value: user.name },
                    { label:'Телефон', icon:<Phone size={16} className="text-gray-400"/>, value: user.phone },
                    { label:'Slug (URL)', icon:<span className="text-gray-400 text-sm">/book/</span>, value: user.slug },
                  ].map((f, i) => (
                    <div key={i}>
                      <label className="text-sm font-medium text-gray-700 block mb-1">{f.label}</label>
                      <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                        {f.icon}<span className="text-gray-700">{f.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="font-bold text-gray-900 text-lg mb-4">Время работы</h2>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label:'Начало дня', value: workStart, onChange: setWorkStart },
                    { label:'Конец дня',  value: workEnd,   onChange: setWorkEnd   },
                  ].map((f, i) => (
                    <div key={i}>
                      <label className="text-sm font-medium text-gray-700 block mb-2">{f.label}</label>
                      <select value={f.value} onChange={e => f.onChange(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:border-emerald-500 outline-none bg-white text-gray-900">
                        {ALL_TIME_SLOTS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="font-bold text-gray-900 text-lg mb-4">Выходные дни</h2>
                <div className="flex flex-wrap gap-2">
                  {WEEK_DAYS.map((day, idx) => (
                    <button key={idx} onClick={() => toggleDayOff(idx)}
                      className={`px-4 py-2 rounded-xl font-medium transition-all cursor-pointer ${daysOff.includes(idx)?'bg-red-600 text-white':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Send size={18} className="text-emerald-600"/>
                  <h2 className="font-bold text-gray-900 text-lg">Telegram-уведомления</h2>
                </div>
                <p className="text-sm text-gray-500 mb-5">Получайте уведомления о новых записях в Telegram.</p>
                <a href={telegramBotLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold px-5 py-3.5 rounded-2xl w-full justify-center mb-5">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.05 9.66c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.913.561z"/>
                  </svg>
                  Подключить Telegram-бота
                </a>
                <details className="group">
                  <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600 flex items-center gap-2 list-none">
                    <Bell size={14}/>Или введите Chat ID вручную
                    <ChevronRight size={14} className="group-open:rotate-90 transition-transform"/>
                  </summary>
                  <div className="mt-4 space-y-3">
                    <Input label="Telegram Chat ID" placeholder="Например: 123456789"
                      value={telegramChatId} onChange={e => setTelegramChatId(e.target.value)}/>
                  </div>
                </details>
                <Button variant="primary" onClick={handleSaveSettings}
                  className={`mt-4 ${settingsSaved?'!bg-emerald-500':''}`}>
                  {settingsSaved ? <><Check size={16}/>Сохранено!</> : <><Save size={16}/>Сохранить настройки</>}
                </Button>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ══ MODALS ══ */}

      {/* Добавить запись */}
      <Modal isOpen={showAddBookingModal} onClose={() => setShowAddBookingModal(false)} title="Добавить запись">
        <div className="space-y-4">
          <Input label="Имя клиента" placeholder="Анна Иванова"
            value={bookingForm.clientName}
            onChange={e => setBookingForm(f => ({ ...f, clientName: e.target.value }))}/>
          <PhoneInput label="Телефон клиента" value={bookingForm.clientPhone}
            onChange={v => setBookingForm(f => ({ ...f, clientPhone: v }))}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-gray-900"/>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Услуга</label>
            <select value={bookingForm.serviceId}
              onChange={e => setBookingForm(f => ({ ...f, serviceId: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-gray-900">
              {services.map(s => <option key={s.id} value={s.id}>{s.name} — {s.price} ₽ · {s.duration} мин</option>)}
            </select>
          </div>

          {isSalon && salonMasters.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Мастер</label>
              <select value={bookingForm.salonMasterId}
                onChange={e => setBookingForm(f => ({ ...f, salonMasterId: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-gray-900">
                <option value="">Не выбран</option>
                {salonMasters.map(sm => <option key={sm.id} value={sm.id}>{sm.name}{sm.specialization ? ` (${sm.specialization})` : ''}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Дата" type="date" value={bookingForm.date}
              onChange={e => setBookingForm(f => ({ ...f, date: e.target.value }))}/>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Время</label>
              <select value={bookingForm.time}
                onChange={e => setBookingForm(f => ({ ...f, time: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 outline-none bg-white text-gray-900">
                {ALL_TIME_SLOTS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setShowAddBookingModal(false)}>Отмена</Button>
            <Button variant="primary" className="flex-1" onClick={handleAddBooking} disabled={!isAddBookingValid}>
              <Plus size={16}/>Добавить
            </Button>
          </div>
        </div>
      </Modal>

      {/* Детали записи */}
      <Modal isOpen={showBookingDetailModal} onClose={() => setShowBookingDetailModal(false)} title="Детали записи">
        {selectedBooking && (
          <div className="space-y-4">
            <div className={`rounded-xl border-l-4 p-4 ${STATUS_COLORS[selectedBooking.status]}`}>
              <p className="font-bold text-lg">{selectedBooking.client_name}</p>
              <p className="text-sm opacity-80">{selectedBooking.service_name}</p>
              <p className="text-sm font-medium mt-1">
                {parseDateFromString(selectedBooking.date).toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})} в {selectedBooking.time}
              </p>
              {isSalon && selectedBooking.salon_master_id && (
                <p className="text-xs opacity-70 mt-1">
                  👩‍🎨 Мастер: {salonMasters.find(m => m.id === selectedBooking.salon_master_id)?.name || '—'}
                </p>
              )}
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
                {(['confirmed','pending','cancelled'] as const).map(s => (
                  <button key={s}
                    onClick={() => { handleStatusChange(selectedBooking.id, s); setSelectedBooking({ ...selectedBooking, status: s }); }}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                      selectedBooking.status === s
                        ? s==='confirmed' ? 'bg-emerald-600 text-white' : s==='pending' ? 'bg-amber-500 text-white' : 'bg-gray-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => handleDeleteBooking(selectedBooking.id)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-red-500 hover:bg-red-50 text-sm cursor-pointer">
              <Trash2 size={14}/> Удалить запись
            </button>
          </div>
        )}
      </Modal>

      {/* Редактировать услугу */}
      <Modal isOpen={showEditServiceModal} onClose={() => setShowEditServiceModal(false)} title={editingService ? 'Редактировать услугу' : 'Добавить услугу'}>
        <div className="space-y-4">
          <Input label="Название услуги" placeholder="Маникюр + покрытие"
            value={serviceForm.name} onChange={e => setServiceForm(f => ({ ...f, name: e.target.value }))}/>
          <Input label="Цена (₽)" placeholder="1500" type="number"
            value={serviceForm.price} onChange={e => setServiceForm(f => ({ ...f, price: e.target.value }))}/>
          <Input label="Длительность (минут)" placeholder="90" type="number"
            value={serviceForm.duration} onChange={e => setServiceForm(f => ({ ...f, duration: e.target.value }))}/>
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setShowEditServiceModal(false)}>Отмена</Button>
            <Button variant="primary" className="flex-1" onClick={handleSaveService}>
              <Save size={16}/>{editingService ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Добавить мастера салона */}
      <Modal isOpen={showAddMasterModal} onClose={() => setShowAddMasterModal(false)} title="Добавить мастера">
        <div className="space-y-4">
          <Input label="Имя мастера" placeholder="Анна Иванова"
            value={masterForm.name}
            onChange={e => setMasterForm(f => ({ ...f, name: e.target.value }))}/>
          <Input label="Специализация" placeholder="Маникюр, педикюр"
            value={masterForm.specialization}
            onChange={e => setMasterForm(f => ({ ...f, specialization: e.target.value }))}/>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              <Palette size={14} className="inline mr-1"/>Цвет в календаре
            </label>
            <div className="flex gap-2 flex-wrap">
              {MASTER_COLORS.map(color => (
                <button key={color}
                  onClick={() => setMasterForm(f => ({ ...f, color }))}
                  className={`w-8 h-8 rounded-lg transition-all cursor-pointer ${masterForm.color === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: color }}/>
              ))}
            </div>
          </div>

          {masterFormError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-700">{masterFormError}</p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <p className="text-xs text-blue-700">
              После добавления скопируйте ссылку привязки и отправьте мастеру — он сам подключит Telegram.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={() => setShowAddMasterModal(false)}>Отмена</Button>
            <Button variant="primary" className="flex-1" onClick={handleAddMaster}
              disabled={!masterForm.name.trim() || addingMaster}>
              {addingMaster
                ? <><RefreshCw size={16} className="animate-spin"/>Добавляем...</>
                : <><Plus size={16}/>Добавить</>}
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}