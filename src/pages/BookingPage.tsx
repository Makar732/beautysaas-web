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
// ✅ ИСПРАВЛЕНИЕ: Импорт утилит для работы с датами
import { formatDateToString, parseDateFromString, formatDateRU } from '../utils/dateUtils';

const SLOT_INTERVAL = 30;
// ✅ ИСПРАВЛЕНИЕ: 24/7 по умолчанию
const DEFAULT_DAY_START = 0;
const DEFAULT_DAY_END = 24;

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
    async function fetchMasterData() {
      if (!master_slug) {
        setNotFound(true);
        return;
      }
      
      const foundMaster = await getMasterBySlug(master_slug);
      
      if (!foundMaster) {
        setNotFound(true);
        return;
      }
      
      // ✅ ИСПРАВЛЕНИЕ: 24/7 по умолчанию если нет настроек
      const formattedMaster = {
        ...foundMaster,
        workingHours: (foundMaster as any).working_hours || foundMaster.workingHours || { start: '00:00', end: '24:00' },
        daysOff: (foundMaster as any).days_off || foundMaster.daysOff || []
      };
      
      setMaster(formattedMaster);
      
      const masterServices = await getServicesByMasterId(formattedMaster.id);
      const masterBookings = await getBookingsByMasterId(formattedMaster.id);
      
      setServices(masterServices);
      setExistingBookings(masterBookings);
    }
    
    fetchMasterData();
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
    if (!master?.daysOff || master.daysOff.length === 0) return false; // ✅ Все дни рабочие
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
    return getOccupiedSlots(formatDateToString(selectedDate)).includes(time); // ✅ ИСПРАВЛЕНИЕ
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

    // ✅ ИСПРАВЛЕНИЕ: Используем formatDateToString вместо toISOString
    const booking: Booking = {
      id: generateId(),
      master_id: master.id,
      service_id: selectedService.id,
      service_name: selectedService.name,
      client_name: clientName.trim(),
      client_phone: clientPhone.trim(),
      date: formatDateToString(selectedDate),
      time: selectedTime,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    await addBooking(booking);
    setCreatedBooking(booking);

    if (master.telegram_chat_id) {
      await sendTelegramNotification(
        master.telegram_chat_id,
        {
          clientName: booking.client_name,
          clientPhone: booking.client_phone,
          serviceName: booking.service_name,
          date: formatDateRU(selectedDate), // ✅ ИСПРАВЛЕНИЕ
          time: booking.time,
          masterName: master.name,
        },
        master.telegram_bot_token
      );
    }

    setLoading(false);
    setStep('success');
    
    const updatedBookings = await getBookingsByMasterId(master.id);
    setExistingBookings(updatedBookings);
  };

  const stepIndex = { service: 0, datetime: 1, contacts: 2, success: 3 };
  const isContactsValid = clientName.trim().length >= 2 && isPhoneComplete(clientPhone);

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={40} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Мастер не найден</h1>
          <p className="text-gray-500 mb-8">
            Возможно, ссылка устарела или скопирована с ошибкой. Пожалуйста, проверьте URL.
          </p>
          <Button variant="primary" onClick={() => navigate('/')} className="w-full">
            <Home size={18} className="mr-2" />
            Вернуться на главную
          </Button>
        </div>
      </div>
    );
  }

  if (!master) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-emerald-800 to-emerald-900 text-white shadow-lg">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={18} className="text-amber-400" />
            <span className="text-sm font-semibold text-emerald-300 tracking-wider uppercase">BeautySaaS</span>
          </div>
          <h1 className="text-3xl font-bold mb-1">{master.name}</h1>
          <p className="text-emerald-300 font-medium">Онлайн-запись</p>

          {step !== 'success' && (
            <div className="flex items-center gap-3 mt-8">
              {(['service', 'datetime', 'contacts'] as const).map((s, i) => (
                <div key={s} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    stepIndex[step] > i
                      ? 'bg-emerald-400 text-white shadow-lg shadow-emerald-400/30'
                      : stepIndex[step] === i
                      ? 'bg-amber-400 text-gray-900 shadow-lg shadow-amber-400/30'
                      : 'bg-white/10 text-white/40'
                  }`}>
                    {stepIndex[step] > i ? <Check size={16} /> : i + 1}
                  </div>
                  <span className={`text-sm hidden sm:block ${stepIndex[step] === i ? 'text-white font-semibold' : 'text-white/40'}`}>
                    {s === 'service' && 'Услуга'}
                    {s === 'datetime' && 'Дата и время'}
                    {s === 'contacts' && 'Контакты'}
                  </span>
                  {i < 2 && <div className={`h-px w-8 sm:w-16 ${stepIndex[step] > i ? 'bg-emerald-400' : 'bg-white/10'}`} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
        {step === 'service' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Выберите услугу</h2>
            <p className="text-gray-500 mb-8">
              {services.length === 0
                ? 'Мастер пока не добавил услуги'
                : `${services.length} ${services.length === 1 ? 'услуга' : 'услуги'} в прайсе`}
            </p>

            {services.length === 0 ? (
              <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center shadow-sm">
                <Scissors size={48} className="text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">Мастер ещё не добавил услуги</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {services.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedService(s); setStep('datetime'); }}
                    className="bg-white rounded-3xl border border-gray-200 p-6 text-left hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-900/5 transition-all cursor-pointer group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-4 group-hover:translate-x-0">
                      <ArrowRight className="text-emerald-500" size={20} />
                    </div>
                    
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                          <Scissors size={20} />
                        </div>
                        <h3 className="font-bold text-gray-900 text-lg mb-1 pr-6">{s.name}</h3>
                        {s.description && (
                          <p className="text-sm text-gray-500 mb-4 line-clamp-2">{s.description}</p>
                        )}
                      </div>
                      
                      <div className="flex items-end justify-between mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-1.5 text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg">
                          <Clock size={14} />
                          <span className="text-sm font-medium">{s.duration} мин</span>
                        </div>
                        <p className="font-black text-emerald-600 text-xl">
                          {s.price.toLocaleString('ru-RU')} ₽
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'datetime' && selectedService && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <button
              onClick={() => setStep('service')}
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 mb-6 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm transition-all"
            >
              <ChevronLeft size={16} />
              Назад к услугам
            </button>

            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-3xl p-6 mb-8 flex items-center justify-between shadow-sm">
              <div>
                <p className="text-sm text-emerald-800/60 font-medium mb-1 uppercase tracking-wide">Выбранная услуга</p>
                <p className="text-xl font-bold text-gray-900">{selectedService.name}</p>
                <div className="flex items-center gap-1.5 mt-2 text-emerald-700 font-medium">
                  <Clock size={14} />
                  <span>{selectedService.duration} мин</span>
                </div>
              </div>
              <span className="font-black text-emerald-600 text-2xl">
                {selectedService.price.toLocaleString('ru-RU')} ₽
              </span>
            </div>

            <div className="grid gap-6 lg:grid-cols-2 items-start">
              <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <Calendar className="text-emerald-500" size={20} />
                  Выберите дату
                </h3>
                <div className="flex items-center justify-between mb-6">
                  <button
                    onClick={() => {
                      if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); }
                      else setCalendarMonth(m => m - 1);
                    }}
                    className="w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="font-bold text-gray-900 text-lg">
                    {MONTH_NAMES[calendarMonth]} {calendarYear}
                  </span>
                  <button
                    onClick={() => {
                      if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); }
                      else setCalendarMonth(m => m + 1);
                    }}
                    className="w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2 mb-3">
                  {DAY_NAMES.map((d) => (
                    <div key={d} className="text-center text-sm font-semibold text-gray-400">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {matrixDates.flat().map((d, i) => {
                    if (!d) return <div key={i} className="aspect-square" />;
                    const isPast = d < today;
                    // ✅ ИСПРАВЛЕНИЕ: Сравнение через formatDateToString
                    const isSelected = selectedDate && formatDateToString(d) === formatDateToString(selectedDate);
                    const isToday = formatDateToString(d) === formatDateToString(today);
                    const dayOff = isDayOff(d);
                    const dayOccupied = getOccupiedSlots(formatDateToString(d));
                    const allSlotsOccupied = allSlots.every((s) => dayOccupied.includes(s));
                    const disabled = isPast || allSlotsOccupied || dayOff;

                    return (
                      <button
                        key={i}
                        disabled={disabled}
                        onClick={() => { setSelectedDate(d); setSelectedTime(null); }}
                        title={dayOff ? 'Выходной день' : undefined}
                        className={`aspect-square flex items-center justify-center rounded-xl text-sm font-bold transition-all ${
                          disabled
                            ? 'text-gray-300 cursor-not-allowed bg-gray-50'
                            : isSelected
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105'
                            : isToday
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                  <Clock className="text-emerald-500" size={20} />
                  Выберите время
                </h3>

                {!selectedDate ? (
                  <div className="flex flex-col items-center justify-center h-[280px] text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <Calendar size={48} className="text-gray-300 mb-4" />
                    <p className="text-gray-500 font-medium">Сначала выберите дату слева</p>
                  </div>
                ) : isDayOff(selectedDate) ? (
                  <div className="flex flex-col items-center justify-center h-[280px] text-center bg-red-50 rounded-2xl border border-red-100 p-6">
                    <AlertCircle size={48} className="text-red-400 mb-4" />
                    <p className="font-bold text-red-900 text-lg mb-1">У мастера выходной</p>
                    <p className="text-red-600/80">Пожалуйста, выберите другой день для записи</p>
                  </div>
                ) : (
                  <div className="flex flex-col h-[280px]">
                    <div className="bg-emerald-50 text-emerald-800 px-4 py-3 rounded-xl font-medium flex items-center gap-2 mb-4 shrink-0">
                      <Check size={16} className="text-emerald-500" />
                      {/* ✅ ИСПРАВЛЕНИЕ: formatDateRU вместо formatDateRU(selectedDate) */}
                      {formatDateRU(selectedDate)}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3 overflow-y-auto pr-2 pb-2 custom-scrollbar">
                      {allSlots.map((slot) => {
                        const occupied = isSlotOccupied(slot);
                        const past = isPastSlot(slot);
                        const disabled = occupied || past;
                        return (
                          <button
                            key={slot}
                            disabled={disabled}
                            onClick={() => setSelectedTime(slot)}
                            className={`py-3.5 rounded-xl text-base font-bold transition-all ${
                              disabled
                                ? 'bg-gray-50 text-gray-300 cursor-not-allowed border border-gray-100'
                                : selectedTime === slot
                                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                                : 'bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 border border-gray-200 hover:border-emerald-200 cursor-pointer'
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {selectedDate && selectedTime && (
              <div className="mt-8 flex justify-end animate-in slide-in-from-bottom-4">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full lg:w-auto px-12 shadow-lg shadow-emerald-900/20"
                  onClick={() => setStep('contacts')}
                >
                  Перейти к контактам
                  <ArrowRight size={20} className="ml-2" />
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'contacts' && (
          <div className="max-w-xl mx-auto animate-in fade-in slide-in-from-right-4 duration-500">
            <button
              onClick={() => setStep('datetime')}
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 mb-6 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm transition-all"
            >
              <ChevronLeft size={16} />
              Назад ко времени
            </button>

            <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
              <h2 className="font-bold text-gray-900 text-2xl mb-6">Ваши данные</h2>
              
              <div className="space-y-5 mb-8">
                <div className="relative">
                  <Input
                    label="Ваше имя"
                    placeholder="Анна Иванова"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    error={errors.name}
                  />
                  <User size={18} className="absolute right-4 top-10 text-gray-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <PhoneInput
                    label="Номер телефона"
                    value={clientPhone}
                    onChange={setClientPhone}
                    error={errors.phone}
                    className="w-full px-5 py-4 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-gray-900 text-base"
                  />
                  <Phone size={18} className="absolute right-4 top-10 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-5 mb-8 border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-4 text-sm uppercase tracking-wide">Сводка заказа</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 flex items-center gap-2"><Scissors size={14}/> Услуга</span>
                    <span className="font-medium text-gray-900 text-right max-w-[60%] truncate">{selectedService?.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 flex items-center gap-2"><Calendar size={14}/> Дата</span>
                    <span className="font-medium text-gray-900">
                      {/* ✅ ИСПРАВЛЕНИЕ */}
                      {selectedDate && formatDateRU(selectedDate).split(',')[0]}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 flex items-center gap-2"><Clock size={14}/> Время</span>
                    <span className="font-medium text-gray-900">{selectedTime}</span>
                  </div>
                  <div className="pt-3 mt-3 border-t border-gray-200 flex justify-between items-center">
                    <span className="font-medium text-gray-900">К оплате</span>
                    <span className="font-black text-emerald-600 text-xl">
                      {selectedService?.price.toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                </div>
              </div>

              <Button
                variant="primary"
                size="lg"
                className="w-full py-4 text-lg shadow-lg shadow-emerald-900/20"
                onClick={handleSubmit}
                loading={loading}
                disabled={!isContactsValid}
              >
                {loading ? 'Отправка заявки...' : 'Подтвердить запись'}
                {!loading && <Check size={20} className="ml-2" />}
              </Button>

              <p className="text-xs text-gray-400 text-center mt-4">
                Нажимая кнопку, вы даете согласие на обработку персональных данных
              </p>
            </div>
          </div>
        )}

        {step === 'success' && createdBooking && (
          <div className="max-w-md mx-auto text-center animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Check size={48} className="text-emerald-600" />
            </div>

            <h2 className="text-3xl font-black text-gray-900 mb-3">Вы успешно записаны!</h2>
            <p className="text-gray-500 text-lg mb-8">
              Мастер свяжется с вами для подтверждения.
            </p>

            <div className="bg-white rounded-3xl border border-gray-200 p-8 text-left shadow-lg mb-8">
              <div className="flex items-center gap-4 border-b border-gray-100 pb-6 mb-6">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <User size={24} className="text-gray-500"/>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Ваш мастер</p>
                  <p className="font-bold text-lg text-gray-900">{master.name}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Услуга</p>
                  <p className="font-semibold text-gray-900">{createdBooking.service_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Дата</p>
                    {/* ✅ ИСПРАВЛЕНИЕ: Парсинг через parseDateFromString */}
                    <p className="font-semibold text-gray-900">
                      {parseDateFromString(createdBooking.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Время</p>
                    <p className="font-bold text-emerald-600 text-lg">{createdBooking.time}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
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
                Сделать ещё одну запись
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-full text-gray-600"
                onClick={() => navigate('/')}
              >
                <Home size={18} className="mr-2" />
                Вернуться на главную
              </Button>
            </div>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #e5e7eb;
          border-radius: 20px;
        }
      `}} />
    </div>
  );
}