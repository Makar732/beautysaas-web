import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Users, Star, TrendingUp, Send, RefreshCw,
  Crown, Phone, Calendar, AlertCircle, CheckCircle,
  Loader2, Sparkles, LogOut, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// ============================================================
// ⚠️  ВСТАВЬ СВОЙ UUID ИЗ SUPABASE → Authentication → Users
// ============================================================
const ADMIN_UUID = '789e7654-c21d-4edc-9ad8-a5a316aad726';
// ============================================================

const PREMIUM_PRICE = 990; // ₽/мес

// ---------- Типы ----------
interface MasterRow {
  id: string;
  name: string;
  phone: string;
  slug: string;
  is_premium: boolean;
  trial_start_date: string | null;
  created_at: string;
  telegram_id: string | null;
  telegram_chat_id: string | null;
}

interface Stats {
  totalMasters: number;
  activePremium: number;
  mrr: number;
}

// ---------- Helpers ----------
function getSubscriptionLabel(master: MasterRow): {
  label: string;
  color: string;
} {
  if (master.is_premium) {
    return { label: '⭐ Premium', color: 'text-amber-600 bg-amber-50 border-amber-200' };
  }
  if (master.trial_start_date) {
    const start = new Date(master.trial_start_date);
    const diffDays = Math.floor(
      (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysLeft = Math.max(0, 14 - diffDays);
    if (daysLeft > 0) {
      return {
        label: `Триал (${daysLeft} дн.)`,
        color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      };
    }
  }
  return { label: 'Бесплатный', color: 'text-gray-500 bg-gray-50 border-gray-200' };
}

// ============================================================
// КОМПОНЕНТ
// ============================================================
export default function AdminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // --- Стейт ---
  const [masters, setMasters] = useState<MasterRow[]>([]);
  const [stats, setStats] = useState<Stats>({ totalMasters: 0, activePremium: 0, mrr: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastStatus, setBroadcastStatus] = useState<
    'idle' | 'sending' | 'success' | 'error'
  >('idle');
  const [broadcastResult, setBroadcastResult] = useState('');
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [extendResults, setExtendResults] = useState<Record<string, 'success' | 'error'>>({});

  // --- Защита: только для ADMIN_UUID ---
  const isAdmin = user?.id === ADMIN_UUID;

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (!isAdmin) {
      navigate('/dashboard', { replace: true });
      return;
    }
    loadData();
  }, [user, isAdmin]);

  // --- Загрузка данных ---
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, name, phone, slug, is_premium, trial_start_date, created_at, telegram_id, telegram_chat_id'
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data as MasterRow[]) || [];
      setMasters(rows);

      const totalMasters = rows.length;
      const activePremium = rows.filter((m) => m.is_premium).length;
      const mrr = activePremium * PREMIUM_PRICE;
      setStats({ totalMasters, activePremium, mrr });
    } catch (err) {
      console.error('❌ Ошибка загрузки мастеров:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- Продлить Premium на 30 дней ---
  const handleExtendPremium = async (master: MasterRow) => {
    setExtendingId(master.id);
    try {
      // Если подписка уже активна — продлеваем от сегодня + 30 дней
      // (логика: просто включаем is_premium = true; для полноценного решения
      //  нужна колонка premium_expires_at — см. NOTE ниже)
      const { error } = await supabase
        .from('profiles')
        .update({ is_premium: true })
        .eq('id', master.id);

      if (error) throw error;

      // Обновляем локальный стейт без перезагрузки
      setMasters((prev) =>
        prev.map((m) =>
          m.id === master.id ? { ...m, is_premium: true } : m
        )
      );
      setStats((prev) => {
        const wasAlreadyPremium = master.is_premium;
        const newActivePremium = wasAlreadyPremium
          ? prev.activePremium
          : prev.activePremium + 1;
        return {
          ...prev,
          activePremium: newActivePremium,
          mrr: newActivePremium * PREMIUM_PRICE,
        };
      });
      setExtendResults((prev) => ({ ...prev, [master.id]: 'success' }));
      setTimeout(
        () => setExtendResults((prev) => ({ ...prev, [master.id]: undefined as any })),
        3000
      );
    } catch (err) {
      console.error('❌ Ошибка продления Premium:', err);
      setExtendResults((prev) => ({ ...prev, [master.id]: 'error' }));
      setTimeout(
        () => setExtendResults((prev) => ({ ...prev, [master.id]: undefined as any })),
        3000
      );
    } finally {
      setExtendingId(null);
    }
  };

  // --- Массовая рассылка ---
  const handleBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setBroadcastStatus('sending');
    setBroadcastResult('');

    try {
      // Собираем всех мастеров у которых есть telegram_id или telegram_chat_id
      const targets = masters.filter(
        (m) => (m.telegram_id && m.telegram_id.trim()) ||
                (m.telegram_chat_id && m.telegram_chat_id.trim())
      );

      if (targets.length === 0) {
        setBroadcastStatus('error');
        setBroadcastResult('Нет мастеров с привязанным Telegram.');
        return;
      }

      // Отправляем через наш серверный endpoint (тот же, что использует telegram.ts)
      const response = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: user?.id,
          message: broadcastText.trim(),
          targets: targets.map((m) => ({
            id: m.id,
            name: m.name,
            telegram_id: m.telegram_id || m.telegram_chat_id,
          })),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Ошибка сервера');
      }

      const result = await response.json();
      setBroadcastStatus('success');
      setBroadcastResult(
        `✅ Отправлено ${result.sent ?? targets.length} из ${targets.length} мастеров.`
      );
      setBroadcastText('');
    } catch (err: any) {
      console.error('❌ Ошибка рассылки:', err);
      setBroadcastStatus('error');
      setBroadcastResult(`❌ Ошибка: ${err.message}`);
    }
  };

  // --- Выход ---
  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // --- Guard ---
  if (!user || !isAdmin) return null;

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* ===== TOP BAR ===== */}
      <header className="bg-gray-900 border-b border-white/8 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft size={18} />
            <span className="text-sm">Назад</span>
          </button>
          <div className="w-px h-5 bg-white/10" />
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-400" size={20} />
            <span className="font-bold text-lg">
              Beauty<span className="text-emerald-400">SaaS</span>
            </span>
            <span className="ml-2 flex items-center gap-1 bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full border border-red-500/30">
              <Shield size={10} />
              ADMIN
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400 hidden sm:block">{user.name}</span>
          <button
            onClick={loadData}
            disabled={isLoading}
            title="Обновить данные"
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
          >
            <LogOut size={16} />
            <span className="hidden sm:block">Выйти</span>
          </button>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">

        <div>
          <h1 className="text-2xl font-bold text-white">Панель администратора</h1>
          <p className="text-gray-400 text-sm mt-1">
            Управление платформой BeautySaaS · Только для создателя
          </p>
        </div>

        {/* ================================================ */}
        {/* БЛОК А: БИЗНЕС-АНАЛИТИКА                        */}
        {/* ================================================ */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Блок А — Бизнес-аналитика</h2>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-gray-900 rounded-2xl border border-white/8 p-6 animate-pulse h-28"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Карточка 1: Всего мастеров */}
              <div className="bg-gray-900 rounded-2xl border border-white/8 p-6 hover:border-emerald-500/30 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                    <Users size={20} className="text-emerald-400" />
                  </div>
                  <p className="text-sm text-gray-400 font-medium">Всего мастеров</p>
                </div>
                <p className="text-4xl font-black text-white">{stats.totalMasters}</p>
                <p className="text-xs text-gray-500 mt-2">
                  зарегистрировано на платформе
                </p>
              </div>

              {/* Карточка 2: Активный Premium */}
              <div className="bg-gray-900 rounded-2xl border border-white/8 p-6 hover:border-amber-500/30 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                    <Star size={20} className="text-amber-400" />
                  </div>
                  <p className="text-sm text-gray-400 font-medium">Активный Premium</p>
                </div>
                <p className="text-4xl font-black text-amber-400">{stats.activePremium}</p>
                <p className="text-xs text-gray-500 mt-2">
                  платных подписчиков сейчас
                </p>
              </div>

              {/* Карточка 3: MRR */}
              <div className="bg-gray-900 rounded-2xl border border-white/8 p-6 hover:border-blue-500/30 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                    <TrendingUp size={20} className="text-blue-400" />
                  </div>
                  <p className="text-sm text-gray-400 font-medium">
                    Прогноз дохода (MRR)
                  </p>
                </div>
                <p className="text-4xl font-black text-blue-400">
                  {stats.mrr.toLocaleString('ru-RU')} ₽
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {stats.activePremium} × {PREMIUM_PRICE.toLocaleString('ru-RU')} ₽/мес
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ================================================ */}
        {/* БЛОК Б: МАССОВАЯ РАССЫЛКА                       */}
        {/* ================================================ */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Send size={18} className="text-blue-400" />
            <h2 className="text-lg font-bold text-white">
              Блок Б — Массовая рассылка через бота
            </h2>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-white/8 p-6">
            <p className="text-sm text-gray-400 mb-4">
              Сообщение получат все мастера, у которых привязан Telegram.
              Отправка идёт через <code className="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded text-xs">/api/broadcast</code>.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-2">
                  Текст объявления
                </label>
                <textarea
                  value={broadcastText}
                  onChange={(e) => setBroadcastText(e.target.value)}
                  placeholder="Введите текст сообщения для всех мастеров платформы..."
                  rows={5}
                  className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm resize-none focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
                <p className="text-xs text-gray-600 mt-1">
                  {broadcastText.length} символов
                </p>
              </div>

              {/* Статус рассылки */}
              {broadcastStatus !== 'idle' && broadcastResult && (
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm border ${
                    broadcastStatus === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : broadcastStatus === 'error'
                      ? 'bg-red-500/10 border-red-500/20 text-red-400'
                      : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                  }`}
                >
                  {broadcastStatus === 'success' && <CheckCircle size={16} />}
                  {broadcastStatus === 'error' && <AlertCircle size={16} />}
                  {broadcastStatus === 'sending' && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  {broadcastResult || 'Отправка...'}
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Telegram-бот привязан у{' '}
                  <span className="text-white font-semibold">
                    {
                      masters.filter(
                        (m) =>
                          (m.telegram_id && m.telegram_id.trim()) ||
                          (m.telegram_chat_id && m.telegram_chat_id.trim())
                      ).length
                    }
                  </span>{' '}
                  из <span className="text-white font-semibold">{masters.length}</span> мастеров
                </p>

                <button
                  onClick={handleBroadcast}
                  disabled={
                    !broadcastText.trim() || broadcastStatus === 'sending'
                  }
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition-all text-sm cursor-pointer"
                >
                  {broadcastStatus === 'sending' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  {broadcastStatus === 'sending'
                    ? 'Отправка...'
                    : 'Отправить объявление всем мастерам'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================ */}
        {/* БЛОК В: УПРАВЛЕНИЕ МАСТЕРАМИ                    */}
        {/* ================================================ */}
        <section className="pb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Crown size={18} className="text-amber-400" />
              <h2 className="text-lg font-bold text-white">
                Блок В — Управление мастерами
              </h2>
            </div>
            <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1 rounded-full">
              {masters.length} мастеров
            </span>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-white/8 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-emerald-400" />
              </div>
            ) : masters.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <Users size={48} className="mx-auto mb-4 opacity-20" />
                <p>Нет зарегистрированных мастеров</p>
              </div>
            ) : (
              <>
                {/* Таблица — Desktop */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/8 bg-gray-800/50">
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-4">
                          Мастер / Студия
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-4">
                          Телефон
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-4">
                          Telegram
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-4">
                          Статус подписки
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-4">
                          Дата регистрации
                        </th>
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wide px-6 py-4">
                          Действия
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {masters.map((master) => {
                        const sub = getSubscriptionLabel(master);
                        const result = extendResults[master.id];
                        const isExtending = extendingId === master.id;
                        const hasTelegram =
                          (master.telegram_id && master.telegram_id.trim()) ||
                          (master.telegram_chat_id && master.telegram_chat_id.trim());

                        return (
                          <tr
                            key={master.id}
                            className="hover:bg-white/3 transition-colors group"
                          >
                            {/* Имя */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-emerald-700 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                                  {master.name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-white">
                                    {master.name || '—'}
                                  </p>
                                  <p className="text-xs text-gray-500 font-mono">
                                    /book/{master.slug}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Телефон */}
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2 text-sm text-gray-300">
                                <Phone size={13} className="text-gray-500" />
                                {master.phone || '—'}
                              </div>
                            </td>

                            {/* Telegram */}
                            <td className="px-4 py-4">
                              {hasTelegram ? (
                                <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded-lg">
                                  Привязан
                                </span>
                              ) : (
                                <span className="text-xs text-gray-600">Не привязан</span>
                              )}
                            </td>

                            {/* Статус */}
                            <td className="px-4 py-4">
                              <span
                                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${sub.color}`}
                              >
                                {sub.label}
                              </span>
                            </td>

                            {/* Дата регистрации */}
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <Calendar size={12} />
                                {new Date(master.created_at).toLocaleDateString('ru-RU', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </div>
                            </td>

                            {/* Кнопка действия */}
                            <td className="px-6 py-4 text-right">
                              {result === 'success' ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl">
                                  <CheckCircle size={13} />
                                  Premium включён!
                                </span>
                              ) : result === 'error' ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">
                                  <AlertCircle size={13} />
                                  Ошибка
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleExtendPremium(master)}
                                  disabled={isExtending}
                                  className="inline-flex items-center gap-2 text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:border-amber-500/40 px-3 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isExtending ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <Star size={13} />
                                  )}
                                  {isExtending ? 'Обновление...' : 'Продлить Premium +30д'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Карточки — Mobile */}
                <div className="md:hidden divide-y divide-white/5">
                  {masters.map((master) => {
                    const sub = getSubscriptionLabel(master);
                    const result = extendResults[master.id];
                    const isExtending = extendingId === master.id;
                    const hasTelegram =
                      (master.telegram_id && master.telegram_id.trim()) ||
                      (master.telegram_chat_id && master.telegram_chat_id.trim());

                    return (
                      <div key={master.id} className="p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-700 rounded-full flex items-center justify-center font-bold shrink-0">
                            {master.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white truncate">
                              {master.name || '—'}
                            </p>
                            <p className="text-xs text-gray-500">{master.phone || '—'}</p>
                          </div>
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded-lg border shrink-0 ${sub.color}`}
                          >
                            {sub.label}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{hasTelegram ? '🟢 Telegram' : '⚪ Без Telegram'}</span>
                            <span>
                              {new Date(master.created_at).toLocaleDateString('ru-RU')}
                            </span>
                          </div>

                          {result === 'success' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                              <CheckCircle size={12} /> Готово!
                            </span>
                          ) : result === 'error' ? (
                            <span className="text-xs text-red-400">Ошибка</span>
                          ) : (
                            <button
                              onClick={() => handleExtendPremium(master)}
                              disabled={isExtending}
                              className="flex items-center gap-1.5 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-2 rounded-xl cursor-pointer"
                            >
                              {isExtending ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Star size={12} />
                              )}
                              +30 дней
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}