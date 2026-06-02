import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Sparkles, ChevronLeft, ChevronRight, Check, Phone, User,
  Clock, ArrowRight, Calendar, AlertCircle, Scissors, Home
} from 'lucide-react';
import {
  getMasterBySlug, getServicesByMasterId, getBookingsByMasterId, addBooking
} from '../lib/storage';
import { sendTelegramNotification } from '../lib/telegram';
import { Master, Service, Booking } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { PhoneInput, isPhoneComplete } from '../components/ui/PhoneInput';

const SLOT_INTERVAL = 30;
const DEFAULT_DAY_START = 9;
const DEFAULT_DAY_END = 21;

function generateId() {
  return `booking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateTimeSlots(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += SLOT_INTERVAL) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

function getMonthMatrix(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
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
  const [notFound, setNotFound] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [existingBookings, setExistingBookings] = useState<Booking[]>([]);
  const [step, setStep] = useState<Step>('service');

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
    if (!master_slug) {
      setNotFound(true);
      return;
    }
    const foundMaster = getMasterBySlug(master_slug);
    if (!foundMaster) {
      setNotFound(true);
      return;
    }
    setMaster(foundMaster);
    setServices(getServicesByMasterId(foundMaster.id));
    setExistingBookings(getBookingsByMasterId(foundMaster.id));
  }, [master_slug]);

  const getMasterTimeSlots = (): string[] => {
    if (!master?.workingHours) {
      return generateTimeSlots(DEFAULT_DAY_START, DEFAULT_DAY_END);
    }
    const [startH] = master.workingHours.start.split(':').map(Number);
    const [endH] = master.workingHours.end.split(':').map(Number);
    return generateTimeSlots(startH, endH);
  };

  const isDayOff = (date: Date): boolean => {
    if (!master?.daysOff) return false;
    return master.daysOff.includes(date.getDay());
  };

  const allSlots = getMasterTimeSlots();
  const matrixDates = getMonthMatrix(calendarYear, calendarMonth);

  const getOccupiedSlots = (dateStr: string): string[] => {
    return existingBookings
      .filter((b) => b.date === dateStr && b.status !== 'cancelled')
      .map((b) => b.time);
  };

  const isSlotOccupied = (time: string): boolean => {
    if (!selectedDate) return false;
    return getOccupiedSlots(dateToStr(selectedDate)).includes(time);
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
    if (!isPhoneComplete(clientPhone)) errs.phone = 'Введите полный номер телефона';
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
    setExistingBookings(getBookingsByMasterId(master.id));
  };

  const stepIndex = { service: 0, datetime: 1, contacts: 2, success: 3 };
  const isContactsValid = clientName.trim().length >= 2 && isPhoneComplete(clientPhone);

  // Мастер не найден
  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Мастер не найден</h1>
          <p className="text-gray-500 mb-6">
            Страница мастера «{master_slug}» не существует или была удалена.
          </p>
          <Button variant="primary" onClick={() => navigate('/')}>
            <Home size={16} />
            На главную
          </Button>
        </div>
      </div>
    );
  }

  // Загрузка
  if (!master) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-800 to-emerald-900 text-white">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-amber-400" />
            <span className="text-sm font-medium text-emerald-300">BeautySaaS</span>
          </div>
          <h1 className="text-2xl font-bold">{master.name}</h1>
          <p className="text-emerald-300 text-sm mt-1">Онлайн-запись</p>

          {/* Step indicator */}
          {step !== 'success' && (
            <div className="flex items-center gap-2 mt-5">
              {(['service', 'datetime', 'contacts'] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    stepIndex[step] > i
                      ? 'bg-emerald-400 text-white'
                      : stepIndex[step] === i
                      ? 'bg-amber-400 text-gray-900'
                      : 'bg-white/20 text-white/50'
                  }`}>
                    {stepIndex[step] > i ? <Check size={14} /> : i + 1}
                  </div>
                  <span className={`text-sm hidden sm:block ${stepIndex[step] === i ? 'text-white font-medium' : 'text-white/50'}`}>
                    {s === 'service' && 'Услуга'}
                    {s === 'datetime' && 'Дата и время'}
                    {s === 'contacts' && 'Контакты'}
                  </span>
                  {i < 2 && <div className={`h-px w-8 sm:w-16 ${stepIndex[step] > i ? 'bg-emerald-400' : 'bg-white/20'}`} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">

        {/* STEP 1: Выбор услуги */}
        {step === 'service' && (
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Выберите услугу</h2>
            <p className="text-gray-500 text-sm mb-6">
              {services.length === 0
                ? 'Мастер пока не добавил услуги'
                : `${services.length} ${services.length === 1 ? 'услуга' : 'услуги'} в прайсе`}
            </p>

            {services.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <Scissors size={40} className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Мастер ещё не добавил услуги</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {services.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedService(s); setStep('datetime'); }}
                    className="bg-white rounded-2xl border-2 border-gray-100 p-5 text-left hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="bg-emerald-100 p-2 rounded-xl shrink-0 group-hover:bg-emerald-200 transition-colors">
                          <Scissors size={18} className="text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{s.name}</p>
                          {s.description && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{s.description}</p>
                          )}
                          <div className="flex items-center gap-1 mt-1">
                            <Clock size={11} className="text-gray-400" />
                            <span className="text-xs text-gray-400">{s.duration} мин</span>
                          </div>
                        </div>
                      </div>
                      <p className="font-bold text-emerald-600 text-lg shrink-0">
                        {s.price.toLocaleString('ru-RU')} ₽
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Дата и время */}
        {step === 'datetime' && selectedService && (
          <div>
            <button
              onClick={() => setStep('service')}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 cursor-pointer transition-colors"
            >
              <ChevronLeft size={16} />
              Назад к услугам
            </button>

            {/* Выбранная услуга */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Выбранная услуга</p>
                <p className="font-bold text-gray-900">{selectedService.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock size={11} className="text-gray-400" />
                  <span className="text-xs text-gray-500">{selectedService.duration} мин</span>
                </div>
              </div>
              <span className="font-bold text-emerald-600 text-xl">
                {selectedService.price.toLocaleString('ru-RU')} ₽
              </span>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Календарь */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Выберите дату</h3>
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => {
                      if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); }
                      else setCalendarMonth(m => m - 1);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="font-semibold text-gray-900">
                    {MONTH_NAMES[calendarMonth]} {calendarYear}
                  </span>
                  <button
                    onClick={() => {
                      if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); }
                      else setCalendarMonth(m => m + 1);
                    }}
                    className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {DAY_NAMES.map((d) => (
                    <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {matrixDates.flat().map((d, i) => {
                    if (!d) return <div key={i} />;
                    const isPast = d < today;
                    const isSelected = selectedDate && dateToStr(d) === dateToStr(selectedDate);
                    const isToday = dateToStr(d) === dateToStr(today);
                    const dayOff = isDayOff(d);
                    const dayOccupied = getOccupiedSlots(dateToStr(d));
                    const allSlotsOccupied = allSlots.every((s) => dayOccupied.includes(s));
                    const disabled = isPast || allSlotsOccupied || dayOff;

                    return (
                      <button
                        key={i}
                        disabled={disabled}
                        onClick={() => { setSelectedDate(d); setSelectedTime(null); }}
                        title={dayOff ? 'Выходной день' : undefined}
                        className={`aspect-square flex items-center justify-center rounded-xl text-sm font-medium transition-all ${
                          disabled
                            ? 'text-gray-300 cursor-not-allowed'
                            : isSelected
                            ? 'bg-emerald-600 text-white font-bold shadow-md'
                            : isToday
                            ? 'bg-emerald-100 text-emerald-700 font-bold'
                            : 'hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 cursor-pointer'
                        }`}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Слоты времени */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">Выберите время</h3>

                {!selectedDate ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <Calendar size={32} className="text-gray-300 mb-2" />
                    <p className="text-gray-400 text-sm">Сначала выберите дату</p>
                  </div>
                ) : isDayOff(selectedDate) ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                    <AlertCircle size={32} className="text-amber-500 mx-auto mb-2" />
                    <p className="font-medium text-amber-800">🚫 У мастера выходной</p>
                    <p className="text-xs text-amber-600 mt-1">Пожалуйста, выберите другой день</p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
                      <Calendar size={13} className="text-emerald-600" />
                      {formatDateRU(selectedDate)}
                    </p>
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                      {allSlots.map((slot) => {
                        const occupied = isSlotOccupied(slot);
                        const past = isPastSlot(slot);
                        const disabled = occupied || past;
                        return (
                          <button
                            key={slot}
                            disabled={disabled}
                            onClick={() => setSelectedTime(slot)}
                            className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                              disabled
                                ? 'bg-gray-50 text-gray-300 cursor-not-allowed line-through'
                                : selectedTime === slot
                                ? 'bg-emerald-600 text-white font-bold shadow-md'
                                : 'bg-gray-50 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-100 cursor-pointer'
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
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Контакты */}
        {step === 'contacts' && (
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setStep('datetime')}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 cursor-pointer transition-colors"
            >
              <ChevronLeft size={16} />
              Назад
            </button>

            {/* Сводка */}
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Ваша запись</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Мастер</span>
                  <span className="font-medium text-gray-900">{master.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Услуга</span>
                  <span className="font-medium text-gray-900">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Дата</span>
                  <span className="font-medium text-gray-900">
                    {selectedDate?.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Время</span>
                  <span className="font-medium text-gray-900">{selectedTime}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-emerald-100">
                  <span className="text-gray-500">Стоимость</span>
                  <span className="font-bold text-emerald-600 text-base">
                    {selectedService?.price.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              </div>
            </div>

            {/* Форма */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-bold text-gray-900 text-lg mb-4">Ваши контакты</h2>
              <div className="space-y-4">
                <div className="relative">
                  <Input
                    label="Ваше имя"
                    placeholder="Анна Иванова"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    error={errors.name}
                  />
                  <User size={16} className="absolute right-4 top-10 text-gray-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <PhoneInput
                    label="Номер телефона"
                    value={clientPhone}
                    onChange={setClientPhone}
                    error={errors.phone}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-gray-900"
                  />
                  <Phone size={16} className="absolute right-4 top-10 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <Button
                variant="amber"
                size="lg"
                className="w-full mt-6"
                onClick={handleSubmit}
                loading={loading}
                disabled={!isContactsValid}
              >
                {loading ? 'Отправляем...' : 'Записаться'}
                {!loading && <ArrowRight size={16} />}
              </Button>

              <p className="text-xs text-gray-400 text-center mt-3">
                Нажимая кнопку, вы соглашаетесь с обработкой персональных данных
              </p>
            </div>
          </div>
        )}

        {/* STEP 4: Успех */}
        {step === 'success' && createdBooking && (
          <div className="max-w-lg mx-auto text-center">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check size={40} className="text-emerald-600" />
            </div>

            <h2 className="text-2xl font-black text-gray-900 mb-2">Вы записаны! 🎉</h2>
            <p className="text-gray-500 mb-8">
              Мастер свяжется с вами для подтверждения
            </p>

            <div className="bg-white rounded-2xl border border-gray-200 p-6 text-left space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Мастер</span>
                <span className="text-sm font-medium text-gray-900">{master.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Услуга</span>
                <span className="text-sm font-medium text-gray-900">{createdBooking.service_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Дата</span>
                <span className="text-sm font-medium text-gray-900">
                  {new Date(createdBooking.date).toLocaleDateString('ru-RU', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Время</span>
                <span className="text-sm font-bold text-emerald-600">{createdBooking.time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Клиент</span>
                <span className="text-sm font-medium text-gray-900">{createdBooking.client_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Телефон</span>
                <span className="text-sm font-medium text-gray-900">{createdBooking.client_phone}</span>
              </div>
            </div>

            <div className="space-y-3">
              <Button
                variant="primary"
                size="lg"
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
              <Button
                variant="ghost"
                size="md"
                className="w-full text-gray-500"
                onClick={() => navigate('/')}
              >
                <Home size={16} />
                На главную
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 mt-8">
        <a href="#/" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors text-xs">
          <Sparkles size={12} className="text-amber-400" />
          Работает на BeautySaaS
        </a>
      </footer>
    </div>
  );
}