import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, ArrowRight, Calendar, Users, TrendingUp, Star,
  CheckCircle, MessageCircle, Shield, Zap, Bell,
  ChevronRight, Phone, ExternalLink, BarChart3, Settings
} from 'lucide-react';
import { Button } from '../components/ui/Button';

// ─────────────────────────────────────────────────────────────
// DEMO: вставьте slug вашего демо-мастера из Supabase.
// Пока пустая строка — кнопки будут вести на /book/ (без ошибки 404,
// т.к. BookingPage покажет экран "Мастер не найден").
// Замените на реальный slug, например 'studiya-beautysaas'
// ─────────────────────────────────────────────────────────────
const DEMO_MASTER_SLUG = '';

// ─────────────────────────────────────────────────────────────
// ПОДДЕРЖКА: единый Telegram-бот техподдержки
// ─────────────────────────────────────────────────────────────
const SUPPORT_TG_URL = 'https://t.me/beautysaas_support_bot';

// Реалистичные данные для графика выручки
const revenueData = [42, 38, 55, 61, 48, 72, 68, 85, 79, 91, 88, 95];
const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const masters = [
  { name: 'Анастасия', load: 87, revenue: '48 200 ₽', color: 'bg-emerald-500' },
  { name: 'Екатерина', load: 74, revenue: '41 800 ₽', color: 'bg-amber-400' },
  { name: 'Мария', load: 62, revenue: '35 100 ₽', color: 'bg-sky-400' },
];

const todayBookings = [
  { time: '09:00', client: 'Анна К.', service: 'Маникюр + покрытие', master: 'Анастасия', status: 'confirmed', duration: 90 },
  { time: '10:30', client: 'Виктория М.', service: 'Педикюр', master: 'Екатерина', status: 'confirmed', duration: 60 },
  { time: '11:00', client: 'Елена Р.', service: 'Наращивание ногтей', master: 'Мария', status: 'pending', duration: 120 },
  { time: '12:00', client: 'Ирина С.', service: 'Маникюр', master: 'Анастасия', status: 'confirmed', duration: 60 },
  { time: '13:30', client: 'Ольга П.', service: 'Педикюр + покрытие', master: 'Екатерина', status: 'pending', duration: 90 },
  { time: '14:00', client: 'Наталья В.', service: 'Маникюр + покрытие', master: 'Мария', status: 'confirmed', duration: 90 },
  { time: '15:00', client: 'Татьяна Ф.', service: 'Маникюр', master: 'Анастасия', status: 'confirmed', duration: 60 },
  { time: '16:30', client: 'Светлана Д.', service: 'Наращивание', master: 'Мария', status: 'pending', duration: 120 },
];

const reviews = [
  {
    name: 'Елена Орлова',
    role: 'Мастер-маникюрист, Краснодар',
    avatar: '👩‍🎨',
    rating: 5,
    text: 'Работаю одна. Раньше тратила по 2 часа в день на переписку с клиентами в WhatsApp и путалась в блокноте. Теперь они записываются сами по ссылке, а я просто пилю ногти и зарабатываю.',
  },
  {
    name: 'Александра Комарова',
    role: 'Владелец студии «Blossom», 3 мастера',
    avatar: '👩‍💼',
    rating: 5,
    text: 'Перевела студию с бумажного журнала на BeautySaaS. Человеческий фактор исчез, администратор больше не забывает подтверждать записи, а выручка выросла на 20% за счёт авто-напоминаний.',
  },
  {
    name: 'Юлия Захарова',
    role: 'Мастер бровиста, Москва',
    avatar: '✨',
    rating: 5,
    text: 'Простая интеграция, понятный интерфейс. Клиенты в восторге от возможности записываться 24/7. Теперь получаю запись даже ночью, пока сплю!',
  },
];

const features = [
  { icon: Calendar, title: 'Онлайн-запись 24/7', desc: 'Клиенты записываются в любое время через персональную ссылку' },
  { icon: Bell, title: 'Авто-напоминания', desc: 'Telegram-уведомления мастеру и клиенту сразу после записи' },
  { icon: BarChart3, title: 'Аналитика выручки', desc: 'Наглядные графики доходов, нагрузки мастеров и популярных услуг' },
  { icon: Shield, title: 'Безопасные данные', desc: 'Шифрование данных клиентов согласно 152-ФЗ' },
  { icon: Zap, title: 'Быстрый старт', desc: 'Настройка за 5 минут — зарегистрируйтесь и сразу начните принимать записи' },
  { icon: Settings, title: 'Гибкие настройки', desc: 'Настройте услуги, цены, расписание и автоматические уведомления' },
];

type TabType = 'landing' | 'widget' | 'crm';

export default function LandingPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('landing');
  const [animatedRevenue, setAnimatedRevenue] = useState(0);
  const [currentMonth] = useState(new Date().getMonth());

  useEffect(() => {
    const target = 125100;
    const duration = 1500;
    const step = target / (duration / 16);
    let current = 0;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      setAnimatedRevenue(Math.floor(current));
      if (current >= target) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, []);

  const maxRevenue = Math.max(...revenueData);


  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ===== NAV ===== */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-gray-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-400" size={22} />
            <span className="text-xl font-bold">
              Beauty<span className="text-emerald-400">SaaS</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <button
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Возможности
            </button>
            <button
              onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Отзывы
            </button>
            <button
              onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Тарифы
            </button>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/login')}
              className="!text-gray-300 !hover:text-white !hover:bg-white/10"
            >
              Войти
            </Button>
            <Button variant="amber" size="sm" onClick={() => navigate('/login')}>
              Начать бесплатно
            </Button>
          </div>
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Background */}
        <div className="absolute inset-0">
          <img
            src="/images/salon-hero.jpg"
            alt="Luxury Beauty Salon"
            className="w-full h-full object-cover opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-950/70 via-gray-950/50 to-gray-950" />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/30 to-transparent" />
        </div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-900/40 border border-emerald-700/50 rounded-full px-4 py-2 text-emerald-400 text-sm font-medium mb-8 backdrop-blur-sm">
            <Sparkles size={14} />
            Платформа онлайн-записи для бьюти-бизнеса
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight mb-6">
            Автоматизируйте записи.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-300">
              Растите выручку.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Больше никаких блокнотов и переписок в WhatsApp. Клиенты записываются по ссылке,
            а вы получаете уведомление в Telegram. Работает 24/7.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            {/* Кнопка демо: ведёт на реальный виджет демо-мастера */}
            <a
              href="https://beautysaas-web-production.up.railway.app/#/book/studiya-beauty-saas"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white text-gray-900 hover:bg-gray-100 font-semibold px-6 py-3 rounded-xl transition-all text-sm shadow-lg"
            >
              Протестировать виджет записи
            </a>
            <Button variant="secondary" size="lg" onClick={() => navigate('/login')}>
              Попробовать бесплатно
            </Button>
          </div>

          {/* Tab switcher */}
          <div className="inline-flex bg-white/5 border border-white/10 rounded-2xl p-1 backdrop-blur-sm">
            {([
              { id: 'landing', label: 'Лендинг', icon: '🌐' },
              { id: 'widget', label: 'Виджет записи', icon: '📅' },
              { id: 'crm', label: 'CRM-панель', icon: '📊' },
            ] as { id: TabType; label: string; icon: string }[]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'widget') {
                    setTimeout(() => document.getElementById('widget-preview')?.scrollIntoView({ behavior: 'smooth' }), 100);
                  } else if (tab.id === 'crm') {
                    setTimeout(() => document.getElementById('crm-preview')?.scrollIntoView({ behavior: 'smooth' }), 100);
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:block">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-600 animate-bounce">
          <span className="text-xs">Листайте вниз</span>
          <ChevronRight size={16} className="rotate-90" />
        </div>
      </section>

      {/* ===== STATS & REVENUE CARD ===== */}
      <section id="crm-preview" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Вся аналитика <span className="text-emerald-400">в одном экране</span>
            </h2>
            <p className="text-gray-400 text-lg">Следите за выручкой и загрузкой мастеров в реальном времени</p>
          </div>

          <div className={`transition-all duration-300 ${activeTab === 'crm' ? 'ring-2 ring-emerald-500 rounded-3xl' : ''}`}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Revenue Card */}
              <div className="lg:col-span-2 bg-gray-900 rounded-3xl p-6 border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600/5 rounded-full blur-3xl" />
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <p className="text-gray-400 text-sm font-medium">Выручка за месяц</p>
                    <p className="text-4xl font-black mt-1">
                      {animatedRevenue.toLocaleString('ru-RU')} <span className="text-emerald-400">₽</span>
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <TrendingUp size={14} className="text-emerald-400" />
                      <span className="text-emerald-400 text-sm font-medium">+23% к прошлому месяцу</span>
                    </div>
                  </div>
                  <div className="bg-emerald-900/40 p-3 rounded-2xl">
                    <BarChart3 className="text-emerald-400" size={24} />
                  </div>
                </div>

                {/* Chart */}
                <div className="flex items-end gap-1 h-24">
                  {revenueData.map((val, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-t-sm transition-all duration-700 ${
                          i === currentMonth
                            ? 'bg-emerald-400'
                            : i < currentMonth
                            ? 'bg-emerald-700/60'
                            : 'bg-gray-700/40'
                        }`}
                        style={{ height: `${(val / maxRevenue) * 100}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  {months.map((m, i) => (
                    <span
                      key={i}
                      className={`text-xs ${i === currentMonth ? 'text-emerald-400 font-bold' : 'text-gray-600'}`}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* Masters Load */}
              <div className="bg-gray-900 rounded-3xl p-6 border border-white/5">
                <div className="flex items-center gap-2 mb-6">
                  <Users size={18} className="text-amber-400" />
                  <h3 className="font-semibold">Загрузка мастеров</h3>
                </div>
                <div className="space-y-4">
                  {masters.map((m) => (
                    <div key={m.name}>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${m.color}`} />
                          <span className="text-sm font-medium">{m.name}</span>
                        </div>
                        <span className="text-xs text-gray-400">{m.load}%</span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${m.color} rounded-full transition-all duration-1000`}
                          style={{ width: `${m.load}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{m.revenue}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-white/5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Всего за месяц</span>
                    <span className="font-bold text-emerald-400">125 100 ₽</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-400">Записей</span>
                    <span className="font-bold">124</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CALENDAR / ЖУРНАЛ ===== */}
      <section id="widget-preview" className="py-10 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Журнал записей <span className="text-emerald-400">в реальном времени</span>
            </h2>
            <p className="text-gray-400 text-lg">Все записи автоматически попадают в расписание мастера</p>
          </div>

          <div className={`transition-all duration-300 ${activeTab === 'widget' ? 'ring-2 ring-emerald-500 rounded-3xl' : ''}`}>
            <div className="bg-gray-900 rounded-3xl border border-white/5 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-900/40 p-2 rounded-xl">
                    <Calendar className="text-emerald-400" size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">
                      {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </h3>
                    <p className="text-xs text-gray-400">Сегодня</p>
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="text-right">
                    <p className="text-gray-400 text-xs">Выручка сегодня</p>
                    <p className="font-bold text-emerald-400">18 500 ₽</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs">Активных мастеров</p>
                    <p className="font-bold">3</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="grid grid-cols-4 gap-px bg-white/5 border-b border-white/5">
                    <div className="bg-gray-900 p-3 text-xs text-gray-500 font-medium">Время</div>
                    {masters.map((m) => (
                      <div key={m.name} className="bg-gray-900 p-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${m.color}`} />
                          <span className="text-xs font-medium">{m.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {todayBookings.map((booking, i) => (
                    <div key={i} className="grid grid-cols-4 gap-px bg-white/5 border-b border-white/3">
                      <div className="bg-gray-900 p-3 flex items-center">
                        <span className="text-xs text-gray-500 font-mono">{booking.time}</span>
                      </div>
                      {masters.map((m) => (
                        <div key={m.name} className="bg-gray-900 p-2">
                          {booking.master === m.name && (
                            <div className={`rounded-lg p-2 text-xs ${
                              booking.status === 'confirmed'
                                ? 'bg-emerald-900/40 border border-emerald-700/40'
                                : 'bg-amber-900/30 border border-amber-600/30'
                            }`}>
                              <div className="flex items-center gap-1 mb-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                  booking.status === 'confirmed' ? 'bg-emerald-400' : 'bg-amber-400'
                                }`} />
                                <span className="font-semibold truncate">{booking.client}</span>
                              </div>
                              <p className="text-gray-400 truncate">{booking.service}</p>
                              <p className={`text-xs mt-0.5 ${
                                booking.status === 'confirmed' ? 'text-emerald-400' : 'text-amber-400'
                              }`}>
                                {booking.status === 'confirmed' ? 'Подтверждена' : 'В ожидании'}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/login')}
                  className="!text-emerald-400 !hover:text-emerald-300"
                >
                  Открыть полный журнал
                  <ExternalLink size={14} />
                </Button>
                <div className="flex gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    Подтверждена
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    В ожидании
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Всё необходимое <span className="text-emerald-400">в одной платформе</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-gray-900 rounded-2xl p-6 border border-white/5 hover:border-emerald-700/40 transition-all duration-300 hover:-translate-y-1 group"
              >
                <div className="bg-emerald-900/30 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-emerald-900/50 transition-colors">
                  <f.icon className="text-emerald-400" size={22} />
                </div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== REVIEWS ===== */}
      <section id="reviews" className="py-20 px-4 bg-gray-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Нам доверяют <span className="text-emerald-400">мастера</span>
            </h2>
            <p className="text-gray-400 text-lg">Реальные истории успеха наших клиентов</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {reviews.map((r) => (
              <div
                key={r.name}
                className="bg-gray-900 rounded-2xl p-6 border border-white/5 flex flex-col hover:border-emerald-700/30 transition-all duration-300"
              >
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: r.rating }).map((_, i) => (
                    <Star key={i} size={14} className="fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed flex-1 mb-6">"{r.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-900/40 rounded-full flex items-center justify-center text-lg">
                    {r.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{r.name}</p>
                    <p className="text-xs text-gray-500">{r.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section id="pricing" className="py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Простой <span className="text-emerald-400">тариф</span>
          </h2>
          <p className="text-gray-400 text-lg mb-12">Без скрытых платежей и комиссий</p>

          <div className="bg-gradient-to-br from-emerald-900/40 to-gray-900 rounded-3xl border border-emerald-700/40 p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl" />
            <div className="absolute top-4 right-4 bg-amber-400 text-gray-900 text-xs font-bold px-3 py-1 rounded-full">
              Популярный
            </div>

            <div className="relative">
              <h3 className="text-2xl font-bold mb-2">Старт</h3>
              <p className="text-gray-400 mb-6">Для соло-мастеров и микро-студий</p>

              {/* ── ИСПРАВЛЕНО: цена 990 ₽ вместо 1 490 ₽ ── */}
              <div className="flex items-baseline gap-2 justify-center mb-2">
                <span className="text-5xl font-black">990</span>
                <div className="text-left">
                  <span className="text-emerald-400 font-bold text-xl">₽</span>
                  <p className="text-gray-400 text-sm">/мес</p>
                </div>
              </div>
              <p className="text-gray-500 text-sm mb-8">14 дней бесплатно — без привязки карты</p>

              <div className="space-y-3 mb-8 text-left">
                {[
                  'Онлайн-запись 24/7 через персональную ссылку',
  '1 активный мастер (для соло-специалиста)',        // ← ИСПРАВЛЕНО
  'До 10 активных услуг в прайсе',
  'Telegram-уведомления мастеру и клиентам',
  'Аналитика выручки и загрузки',
  'Управление расписанием и выходными днями',
  'Поддержка через Telegram-бот',
  'Все будущие обновления включены',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-sm text-gray-300">{item}</span>
                  </div>
                ))}
              </div>

              {/* Кнопка ведёт на страницу авторизации */}
              <Button
                variant="amber"
                size="lg"
                className="w-full"
                onClick={() => navigate('/login')}
              >
                Начать бесплатно — 14 дней
                <ArrowRight size={18} />
              </Button>
              <p className="text-xs text-gray-500 mt-3">Без привязки карты. Отмена в любой момент.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-emerald-900/50 to-gray-900 rounded-3xl border border-emerald-700/30 p-10 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-800/10 to-transparent" />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Готовы автоматизировать свой бизнес?
            </h2>
            <p className="text-gray-400 text-lg mb-8">
              Протестируйте виджет записи прямо сейчас — без регистрации
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {/* Кнопка демо: ведёт на реальный виджет демо-мастера */}
              <a
                href="https://beautysaas-web-production.up.railway.app/#/book/studiya-beauty-saas"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-white text-gray-900 hover:bg-gray-100 font-semibold px-6 py-3 rounded-xl transition-all text-sm shadow-lg"
              >
                Протестировать виджет записи
              </a>
              <Button variant="secondary" size="lg" onClick={() => navigate('/login')}>
                Войти / Зарегистрироваться
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-gray-950 border-t border-white/5 py-10 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="text-amber-400" size={18} />
              <span className="font-bold">
                Beauty<span className="text-emerald-400">SaaS</span>
              </span>
              <span className="text-gray-600 text-sm ml-2">© 2026 BeautySaaS. Платформа онлайн-записи</span>
            </div>

            <div className="flex items-center gap-6 flex-wrap justify-center">
              {/* ── ИСПРАВЛЕНО: ссылка на официального бот-поддержки ── */}
              <a
                href={SUPPORT_TG_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
              >
                <MessageCircle size={16} />
                Техподдержка
              </a>
              <a
                href="tel:+78001234567"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm"
              >
                <Phone size={16} />
                8 800 123-45-67
              </a>
              <a
                href="#/privacy"
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                Политика конфиденциальности
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}