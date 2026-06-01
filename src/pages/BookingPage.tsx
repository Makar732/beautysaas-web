import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Sparkles, ChevronLeft, ChevronRight, Check, Phone, User,
  Clock, ArrowRight, Calendar, AlertCircle, Scissors
} from 'lucide-react';
import {
  getMasterBySlug, getServicesByMasterId, getBookingsByMasterId, addBooking
} from '../lib/storage';
import { sendTelegramNotification } from '../lib/telegram';
import { Master, Service, Booking } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const DEMO_SLUG = 'irina-kozlova';
const SLOT_INTERVAL = 30; // minutes
const DAY_START = 9; // 9:00
const DAY_END = 21; // 21:00

function generateId() {
  return `booking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = DAY_START; h < DAY_END; h++) {
    for (let m = 0; m < 60; m += SLOT_INTERVAL) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

function getMonthMatrix(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const matrix: (Date | null)[][] = [];
  let week: (Date | null)[] = Array(startDow).fill(null);

  for (let d = 1; d <= lastDay.getDate(); d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) {
      matrix.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    matrix.push(week);
  }
  return matrix;
}

function formatDateRU(date: Date): string {
  return date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

function dateToStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

type Step = 'service' | 'datetime' | 'contacts' | 'success';

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function BookingPage() {
  const { master_slug } = useParams<{ master_slug: string }>();
  const navigate = useNavigate();

  const [master, setMaster] = useState<Master | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [existingBookings, setExistingBookings] = useState<Booking[]>([]);
  const [step, setStep] = useState<Step>('service');
  const [redirected, setRedirected] = useState(false);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [loading, setLoading] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());

  useEffect(() => {
    const slug = master_slug || DEMO_SLUG;
    let foundMaster = getMasterBySlug(slug);
    if (!foundMaster) {
      setRedirected(true);
      foundMaster = getMasterBySlug(DEMO_SLUG);
    }
    if (foundMaster) {
      setMaster(foundMaster);
      setServices(getServicesByMasterId(foundMaster.id));
      setExistingBookings(getBookingsByMasterId(foundMaster.id));
    }
  }, [master_slug]);

  const allSlots = generateTimeSlots();
  const matrixDates = getMonthMatrix(calendarYear, calendarMonth);

  const getOccupiedSlots = (dateStr: string): string[] => {
    return existingBookings
      .filter((b) => b.date === dateStr && b.status !== 'cancelled')
      .map((b) => b.time);
  };

  const isSlotOccupied = (time: string): boolean => {
    if (!selectedDate) return false;
    const dateStr = dateToStr(selectedDate);
    const occupied = getOccupiedSlots(dateStr);
    return occupied.includes(time);
  };

  const isPastSlot = (time: string): boolean => {
    if (!selectedDate) return false;
    const now = new Date();
    const d = new Date(selectedDate);
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d <= now;
  };

  const validateContacts = () => {
    const errs: { name?: string; phone?: string } = {};
    if (!clientName.trim() || clientName.trim().length < 2) errs.name = 'Введите ваше имя';
    if (!clientPhone.trim() || clientPhone.replace(/\D/g, '').length < 10) errs.phone = 'Введите корректный номер телефона';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateContacts() || !master || !selectedService || !selectedDate || !selectedTime) return;
    setLoading(true);

    const booking: Booking = {
      id: generateId(),
      master_id: master.id,
      service_id: selectedService.id,
      service_name: selectedService.name,
      client_name: clientName.trim(),
      client_phone: clientPhone.trim(),
      date: dateToStr(selectedDate),
      time: selectedTime,
      status: 'confirmed',
      created_at: new Date().toISOString(),
    };

    addBooking(booking);
    setCreatedBooking(booking);

    // Send Telegram notification
    if (master.telegram_chat_id) {
      await sendTelegramNotification(
        master.telegram_chat_id,
        {
          clientName: booking.client_name,
          clientPhone: booking.client_phone,
          serviceName: booking.service_name,
          date: selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
          time: booking.time,
          masterName: master.name,
        },
        master.telegram_bot_token
      );
    }

    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setStep('success');
    // Refresh bookings list
    setExistingBookings(getBookingsByMasterId(master.id));
  };

  const stepIndex = { service: 0, datetime: 1, contacts: 2, success: 3 };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-4">
      {/* Desktop: smartphone frame */}
      <div className="w-full max-w-sm">

        {/* Redirect notice */}
        {redirected && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Мастер не найден</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Мастер «{master_slug}» не найден. Показываем демо-страницу Ирины Козловой.
              </p>
            </div>
          </div>
        )}

        {/* Phone frame */}
        <div className="bg-white rounded-[44px] shadow-2xl overflow-hidden border-4 border-gray-200 relative">
          {/* Phone notch */}
          <div className="bg-gray-950 h-8 flex items-center justify-center relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-5 bg-gray-900 rounded-b-2xl" />
            </div>
          </div>

          {/* App header */}
          <div className="bg-gradient-to-br from-emerald-800 to-emerald-950 text-white px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-amber-400" />
              <span className="text-xs font-semibold text-emerald-300">BeautySaaS</span>
            </div>
            {master && (
              <div>
                <h1 className="text-lg font-bold">{master.name}</h1>
                <p className="text-xs text-emerald-300 mt-0.5">Онлайн-запись</p>
              </div>
            )}

            {/* Step indicator */}
            {step !== 'success' && (
              <div className="flex items-center gap-1 mt-3">
                {(['service', 'datetime', 'contacts'] as const).map((s, i) => (
                  <div key={s} className="flex items-center gap-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      stepIndex[step] > i
                        ? 'bg-emerald-400 text-white'
                        : stepIndex[step] === i
                        ? 'bg-amber-400 text-gray-900'
                        : 'bg-white/20 text-white/50'
                    }`}>
                      {stepIndex[step] > i ? <Check size={12} /> : i + 1}
                    </div>
                    {i < 2 && <div className={`flex-1 h-0.5 w-8 ${stepIndex[step] > i ? 'bg-emerald-400' : 'bg-white/20'}`} />}
                  </div>
                ))}
                <span className="text-xs text-white/60 ml-2">
                  {step === 'service' && 'Услуга'}
                  {step === 'datetime' && 'Дата и время'}
                  {step === 'contacts' && 'Контакты'}
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="overflow-y-auto" style={{ maxHeight: '620px', minHeight: '420px' }}>

            {/* STEP 1: Service selection */}
            {step === 'service' && (
              <div className="p-4">
                <h2 className="font-bold text-gray-900 text-base mb-1">Выберите услугу</h2>
                <p className="text-xs text-gray-500 mb-4">
                  {services.length === 0 ? 'У мастера пока нет услуг' : `${services.length} услуги в прайсе`}
                </p>
                <div className="space-y-2">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedService(s); setStep('datetime'); }}
                      className={`w-full text-left rounded-2xl border-2 p-3.5 transition-all cursor-pointer ${
                        selectedService?.id === s.id
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-100 bg-gray-50 hover:border-emerald-200 hover:bg-emerald-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="bg-emerald-100 p-1.5 rounded-xl shrink-0">
                            <Scissors size={14} className="text-emerald-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">{s.name}</p>
                            {s.description && <p className="text-xs text-gray-500 truncate mt-0.5">{s.description}</p>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="font-bold text-emerald-600 text-sm">{s.price.toLocaleString('ru-RU')} ₽</p>
                          <div className="flex items-center gap-1 justify-end mt-0.5">
                            <Clock size={10} className="text-gray-400" />
                            <span className="text-xs text-gray-400">{s.duration} мин</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2: Date & Time */}
            {step === 'datetime' && selectedService && (
              <div className="p-4">
                <button
                  onClick={() => setStep('service')}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 cursor-pointer transition-colors"
                >
                  <ChevronLeft size={16} />
                  Назад
                </button>

                <div className="bg-emerald-50 rounded-2xl p-3 mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Выбранная услуга</p>
                    <p className="font-bold text-sm text-gray-900">{selectedService.name}</p>
                  </div>
                  <span className="font-bold text-emerald-600">{selectedService.price.toLocaleString('ru-RU')} ₽</span>
                </div>

                {/* Calendar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => {
                        if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); }
                        else setCalendarMonth(m => m - 1);
                      }}
                      className="p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="font-semibold text-sm text-gray-900">
                      {MONTH_NAMES[calendarMonth]} {calendarYear}
                    </span>
                    <button
                      onClick={() => {
                        if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); }
                        else setCalendarMonth(m => m + 1);
                      }}
                      className="p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {DAY_NAMES.map((d) => (
                      <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-0.5">
                    {matrixDates.flat().map((d, i) => {
                      if (!d) return <div key={i} />;
                      const isPast = d < today;
                      const isSelected = selectedDate && dateToStr(d) === dateToStr(selectedDate);
                      const isToday = dateToStr(d) === dateToStr(today);
                      const dayOccupied = getOccupiedSlots(dateToStr(d));
                      const allSlotsOccupied = allSlots.every((s) => dayOccupied.includes(s));

                      return (
                        <button
                          key={i}
                          disabled={isPast || allSlotsOccupied}
                          onClick={() => { setSelectedDate(d); setSelectedTime(null); }}
                          className={`aspect-square flex items-center justify-center rounded-xl text-xs font-medium transition-all cursor-pointer ${
                            isPast || allSlotsOccupied
                              ? 'text-gray-300 cursor-not-allowed'
                              : isSelected
                              ? 'bg-emerald-600 text-white font-bold'
                              : isToday
                              ? 'bg-emerald-100 text-emerald-700 font-bold'
                              : 'hover:bg-gray-100 text-gray-700'
                          }`}
                        >
                          {d.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time Slots */}
                {selectedDate && (
                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-2 flex items-center gap-1">
                      <Calendar size={14} className="text-emerald-600" />
                      {formatDateRU(selectedDate)}
                    </p>
                    <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                      {allSlots.map((slot) => {
                        const occupied = isSlotOccupied(slot);
                        const past = isPastSlot(slot);
                        const disabled = occupied || past;
                        return (
                          <button
                            key={slot}
                            disabled={disabled}
                            onClick={() => setSelectedTime(slot)}
                            className={`py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                              disabled
                                ? 'bg-gray-100 text-gray-300 cursor-not-allowed line-through'
                                : selectedTime === slot
                                ? 'bg-emerald-600 text-white font-bold'
                                : 'bg-gray-50 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-100'
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>

                    {selectedTime && (
                      <Button
                        variant="primary"
                        size="md"
                        className="w-full mt-4"
                        onClick={() => setStep('contacts')}
                      >
                        Продолжить
                        <ArrowRight size={16} />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: Contacts */}
            {step === 'contacts' && (
              <div className="p-4">
                <button
                  onClick={() => setStep('datetime')}
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 cursor-pointer transition-colors"
                >
                  <ChevronLeft size={16} />
                  Назад
                </button>

                {/* Summary */}
                <div className="bg-emerald-50 rounded-2xl p-3 mb-4 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Услуга</span>
                    <span className="font-medium text-gray-900">{selectedService?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Дата</span>
                    <span className="font-medium text-gray-900">
                      {selectedDate?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Время</span>
                    <span className="font-medium text-gray-900">{selectedTime}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t border-emerald-100">
                    <span className="text-gray-500">Стоимость</span>
                    <span className="font-bold text-emerald-600">{selectedService?.price.toLocaleString('ru-RU')} ₽</span>
                  </div>
                </div>

                <h2 className="font-bold text-gray-900 text-base mb-3">Ваши контакты</h2>
                <div className="space-y-3">
                  <div className="relative">
                    <Input
                      label="Ваше имя"
                      placeholder="Анна Иванова"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      error={errors.name}
                    />
                    <User size={14} className="absolute right-3 top-10 text-gray-400 pointer-events-none" />
                  </div>
                  <div className="relative">
                    <Input
                      label="Номер телефона"
                      placeholder="+7 900 000-00-00"
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      error={errors.phone}
                    />
                    <Phone size={14} className="absolute right-3 top-10 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <Button
                  variant="amber"
                  size="md"
                  className="w-full mt-4"
                  onClick={handleSubmit}
                  loading={loading}
                >
                  {loading ? 'Отправляем...' : 'Записаться'}
                  {!loading && <ArrowRight size={16} />}
                </Button>

                <p className="text-xs text-gray-400 text-center mt-2">
                  Нажимая кнопку, вы соглашаетесь с обработкой персональных данных
                </p>
              </div>
            )}

            {/* STEP 4: Success */}
            {step === 'success' && createdBooking && (
              <div className="p-6 text-center flex flex-col items-center">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4 animate-[bounceIn_0.5s_ease-out]">
                  <Check size={40} className="text-emerald-600" />
                </div>

                <h2 className="text-xl font-black text-gray-900 mb-1">Вы записаны! 🎉</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Ждём вас в назначенное время
                </p>

                <div className="bg-gray-50 rounded-2xl p-4 w-full text-left space-y-2 mb-6">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Мастер</span>
                    <span className="text-xs font-medium text-gray-900">{master?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Услуга</span>
                    <span className="text-xs font-medium text-gray-900">{createdBooking.service_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Дата</span>
                    <span className="text-xs font-medium text-gray-900">
                      {new Date(createdBooking.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Время</span>
                    <span className="text-xs font-bold text-emerald-600">{createdBooking.time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Клиент</span>
                    <span className="text-xs font-medium text-gray-900">{createdBooking.client_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Телефон</span>
                    <span className="text-xs font-medium text-gray-900">{createdBooking.client_phone}</span>
                  </div>
                </div>

                <div className="space-y-2 w-full">
                  <Button
                    variant="primary"
                    size="md"
                    className="w-full"
                    onClick={() => {
                      setStep('service');
                      setSelectedService(null);
                      setSelectedDate(null);
                      setSelectedTime(null);
                      setClientName('');
                      setClientPhone('');
                      setCreatedBooking(null);
                    }}
                  >
                    Записаться ещё раз
                  </Button>
                  <Button variant="ghost" size="sm" className="w-full !text-gray-500" onClick={() => navigate('/')}>
                    На главную
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Phone home button area */}
          <div className="bg-gray-50 h-8 flex items-center justify-center">
            <div className="w-28 h-1 bg-gray-300 rounded-full" />
          </div>
        </div>

        {/* Powered by */}
        <div className="text-center mt-4">
          <a href="#/" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors text-xs">
            <Sparkles size={12} className="text-amber-400" />
            Работает на BeautySaaS
          </a>
        </div>
      </div>
    </div>
  );
}
