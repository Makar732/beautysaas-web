import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Users, Star, TrendingUp, Send, RefreshCw,
  Crown, Phone, Calendar, AlertCircle, CheckCircle,
  Loader2, Sparkles, LogOut, ChevronLeft, Trash2,
  StarOff, RotateCcw, Gift, Award, DatabaseZap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// ============================================================
const ADMIN_UUID = '789e7654-c21d-4edc-9ad8-a5a316aad726';
// ============================================================

const PREMIUM_PRICE = 990;
const TRIAL_DAYS = 14;

// ─── Типы ────────────────────────────────────────────────────
interface MasterRow {
  id: string;
  name: string;
  phone: string;
  slug: string;
  is_premium: boolean;
  premium_expires_at: string | null;
  plan_type: 'solo' | 'salon' | null;
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

type BtnState = 'idle' | 'loading' | 'confirm' | 'success' | 'error';

interface RowStates {
  grantPlan:  BtnState;
  extend:     BtnState;
  revoke:     BtnState;
  grantTrial: BtnState;
  resetTrial: BtnState;
  delete:     BtnState;
}

// ─── Helpers ──────────────────────────────────────────────────
function daysUntil(isoDate: string | null | undefined): number {
  if (!isoDate) return 0;
  const target = new Date(isoDate);
  const now    = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function trialDaysLeft(trialStartDate: string | null): number {
  if (!trialStartDate) return TRIAL_DAYS;
  const diffDays = Math.floor(
    (Date.now() - new Date(trialStartDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  return Math.max(0, TRIAL_DAYS - diffDays);
}

interface SubStatus {
  label:      string;
  detail:     string;
  badgeClass: string;
}

function getSubStatus(master: MasterRow): SubStatus {
  if (master.is_premium) {
    const planLabel = master.plan_type === 'salon' ? 'Салон PRO' : 'Соло PRO';
    if (master.premium_expires_at) {
      const days = daysUntil(master.premium_expires_at);
      return {
        label:      planLabel,
        detail:     days > 0 ? `Ещё ${days} дн.` : 'Истёк',
        badgeClass: days > 0
          ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
          : 'text-red-400 bg-red-500/10 border-red-500/30',
      };
    }
    return {
      label:      planLabel,
      detail:     'Бессрочно',
      badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    };
  }
  const left = trialDaysLeft(master.trial_start_date);
  if (left > 0) {
    return {
      label:      'Триал',
      detail:     `Осталось ${left} дн.`,
      badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    };
  }
  return {
    label:      'Бесплатный',
    detail:     'Триал истёк',
    badgeClass: 'text-gray-500 bg-gray-500/10 border-gray-500/30',
  };
}

function defaultRowStates(): RowStates {
  return {
    grantPlan:  'idle',
    extend:     'idle',
    revoke:     'idle',
    grantTrial: 'idle',
    resetTrial: 'idle',
    delete:     'idle',
  };
}

// ─── Универсальная кнопка действия ───────────────────────────
interface ActionBtnProps {
  btnState:        BtnState;
  onClick:         () => void;
  idleClass:       string;
  idleContent:     React.ReactNode;
  confirmContent?: React.ReactNode;
  confirmClass?:   string;
  successContent?: React.ReactNode;
  successClass?:   string;
  visible?:        boolean;
  title?:          string;
}

function ActionBtn({
  btnState, onClick, idleClass, idleContent,
  confirmContent, confirmClass, successContent, successClass,
  visible = true, title,
}: ActionBtnProps) {
  if (!visible) return null;

  const isDisabled = btnState === 'loading' || btnState === 'success';

  const cls = {
    idle:    idleClass,
    loading: `${idleClass} opacity-60`,
    confirm: confirmClass ?? 'bg-red-600/30 text-red-300 border-red-500/40 animate-pulse',
    success: successClass ?? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    error:   'bg-red-500/10 text-red-400 border-red-500/20',
  }[btnState];

  const content = {
    idle:    idleContent,
    loading: <><Loader2 size={11} className="animate-spin shrink-0" /><span>...</span></>,
    confirm: confirmContent ?? idleContent,
    success: successContent ?? <><CheckCircle size={11} className="shrink-0" /><span>Готово</span></>,
    error:   <><AlertCircle size={11} className="shrink-0" /><span>Ошибка</span></>,
  }[btnState];

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      className={`
        inline-flex items-center gap-1 text-xs font-semibold
        px-2 py-1.5 rounded-lg border transition-all cursor-pointer
        disabled:cursor-not-allowed whitespace-nowrap
        ${cls}
      `}
    >
      {content}
    </button>
  );
}

// ─── Основной компонент ───────────────────────────────────────
export default function AdminPage() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();

  const [masters,   setMasters]   = useState<MasterRow[]>([]);
  const [stats,     setStats]     = useState<Stats>({ totalMasters: 0, activePremium: 0, mrr: 0 });
  const [isLoading, setIsLoading] = useState(true);

  // Broadcast
  const [broadcastText,   setBroadcastText]   = useState('');
  const [broadcastStatus, setBroadcastStatus] = useState<'idle'|'sending'|'success'|'error'>('idle');
  const [broadcastResult, setBroadcastResult] = useState('');

  // Синхронизация БД
  const [syncState,  setSyncState]  = useState<'idle'|'loading'|'success'|'error'>('idle');
  const [syncResult, setSyncResult] = useState('');

  // Модалка выбора плана
  const [showPlanModal,         setShowPlanModal]         = useState(false);
  const [selectedMasterForPlan, setSelectedMasterForPlan] = useState<MasterRow | null>(null);
  const [selectedPlanType,      setSelectedPlanType]      = useState<'solo'|'salon'>('solo');

  // Состояния кнопок строк
  const [rowStates, setRowStates] = useState<Record<string, RowStates>>({});
  const confirmTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isAdmin = user?.id === ADMIN_UUID;

  useEffect(() => {
    if (!user)    { navigate('/login',     { replace: true }); return; }
    if (!isAdmin) { navigate('/dashboard', { replace: true }); return; }
    loadData();
    return () => { Object.values(confirmTimers.current).forEach(clearTimeout); };
  }, [user, isAdmin]);

  // ─── Загрузка ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id,name,phone,slug,is_premium,premium_expires_at,plan_type,' +
          'trial_start_date,created_at,telegram_id,telegram_chat_id'
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data as unknown as MasterRow[]) ?? [];

      // ✅ ИСПРАВЛЕНО: показываем ВСЕ профили у которых есть id и имя
      // Убираем жёсткий фильтр по телефону — старые пользователи могут иметь пустой phone
      const real = rows.filter(
        (m) => m.id && m.name?.trim().length >= 1
      );

      console.log(`[AdminPage] Загрузка: всего из БД ${rows.length}, отображаем ${real.length}`);

      setMasters(real);

      const initStates: Record<string, RowStates> = {};
      real.forEach((m) => { initStates[m.id] = defaultRowStates(); });
      setRowStates(initStates);

      const activePremium = real.filter((m) => m.is_premium).length;
      setStats({ totalMasters: real.length, activePremium, mrr: activePremium * PREMIUM_PRICE });
    } catch (err) {
      console.error('❌ Ошибка загрузки:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ─── Хелперы стейта ────────────────────────────────────────
  const setBtn = (masterId: string, btn: keyof RowStates, state: BtnState) => {
    setRowStates((prev) => ({
      ...prev,
      [masterId]: { ...(prev[masterId] ?? defaultRowStates()), [btn]: state },
    }));
  };

  const patchMaster = (masterId: string, patch: Partial<MasterRow>) => {
    setMasters((prev) => {
      const updated       = prev.map((m) => m.id === masterId ? { ...m, ...patch } : m);
      const activePremium = updated.filter((m) => m.is_premium).length;
      setStats({ totalMasters: updated.length, activePremium, mrr: activePremium * PREMIUM_PRICE });
      return updated;
    });
  };

  const autoReset = (key: string, masterId: string, btn: keyof RowStates, delay = 3000) => {
    clearTimeout(confirmTimers.current[key]);
    confirmTimers.current[key] = setTimeout(() => setBtn(masterId, btn, 'idle'), delay);
  };

  // ─── Синхронизация БД ──────────────────────────────────────
  const handleSyncUsers = async () => {
    if (syncState === 'loading') return;

    setSyncState('loading');
    setSyncResult('');

    try {
      const res = await fetch('/api/sync-users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ admin_id: user?.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setSyncState('success');

      if (data.created === 0) {
        setSyncResult(
          `✅ Все синхронизировано. Новых пользователей не найдено ` +
          `(всего в auth: ${data.total}, профилей в БД: ${data.allProfiles?.length ?? 0}).`
        );
      } else {
        setSyncResult(
          `✅ СОЗДАНО ${data.created} профилей в базе: ` +
          (data.details as Array<{ id: string; name: string; email?: string }>)
            .map((u) => u.name || u.email || u.id)
            .join(', ')
        );
      }

      // ✅ КЛЮЧЕВОЕ: сервер вернул ВСЕ профили — сразу пишем в стейт
      // После перезагрузки страницы они останутся потому что реально в БД
      if (data.allProfiles && Array.isArray(data.allProfiles)) {
        const rows = data.allProfiles as MasterRow[];
        const real = rows.filter((m) => m.id && m.name?.trim().length >= 1);

        console.log(`[Sync] Получено профилей с сервера: ${real.length}`);

        setMasters(real);

        const initStates: Record<string, RowStates> = {};
        real.forEach((m) => { initStates[m.id] = defaultRowStates(); });
        setRowStates(initStates);

        const activePremium = real.filter((m) => m.is_premium).length;
        setStats({ totalMasters: real.length, activePremium, mrr: activePremium * PREMIUM_PRICE });
      } else {
        // Fallback: перезагружаем через обычный запрос к БД
        await loadData();
      }

    } catch (err: any) {
      console.error('❌ Sync error:', err);
      setSyncState('error');
      setSyncResult(`❌ Ошибка: ${err.message}`);
    } finally {
      setTimeout(() => {
        setSyncState('idle');
        setSyncResult('');
      }, 8000);
    }
  };

  // ─── Выдать план ───────────────────────────────────────────
  const handleGrantPlanClick = (master: MasterRow) => {
    setSelectedMasterForPlan(master);
    setSelectedPlanType(master.plan_type || 'solo');
    setShowPlanModal(true);
  };

  // ✅ 1. ОБНОВЛЕНО: handleGrantPlanConfirm
  const handleGrantPlanConfirm = async () => {
    if (!selectedMasterForPlan) return;
    setBtn(selectedMasterForPlan.id, 'grantPlan', 'loading');
    try {
      const now    = new Date();
      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + 30);

      // ✅ ИСПОЛЬЗУЕМ АДМИНСКИЙ ЭНДПОИНТ вместо прямого запроса
      const res = await fetch('/api/admin-update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: user?.id,
          master_id: selectedMasterForPlan.id,
          updates: {
            is_premium: true,
            plan_type: selectedPlanType,
            premium_expires_at: expiry.toISOString(),
          },
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      patchMaster(selectedMasterForPlan.id, {
        is_premium: true,
        plan_type: selectedPlanType,
        premium_expires_at: expiry.toISOString(),
      });
      
      setBtn(selectedMasterForPlan.id, 'grantPlan', 'success');
      autoReset(`gp_${selectedMasterForPlan.id}`, selectedMasterForPlan.id, 'grantPlan');
      setShowPlanModal(false);
    } catch (err) {
      console.error('❌ Ошибка выдачи плана:', err);
      setBtn(selectedMasterForPlan.id, 'grantPlan', 'error');
      autoReset(`gp_${selectedMasterForPlan.id}`, selectedMasterForPlan.id, 'grantPlan');
    }
  };

  // ✅ 2. ОБНОВЛЕНО: handleExtend
  const handleExtend = async (master: MasterRow) => {
    if (rowStates[master.id]?.extend === 'loading') return;
    setBtn(master.id, 'extend', 'loading');
    try {
      const base = (() => {
        if (master.premium_expires_at) {
          const exp = new Date(master.premium_expires_at);
          return exp > new Date() ? exp : new Date();
        }
        return new Date();
      })();
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + 30);

      // ✅ ИСПОЛЬЗУЕМ АДМИНСКИЙ ЭНДПОИНТ
      const res = await fetch('/api/admin-update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: user?.id,
          master_id: master.id,
          updates: {
            is_premium: true,
            premium_expires_at: newExpiry.toISOString(),
          },
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      patchMaster(master.id, { is_premium: true, premium_expires_at: newExpiry.toISOString() });
      setBtn(master.id, 'extend', 'success');
      autoReset(`ext_${master.id}`, master.id, 'extend');
    } catch {
      setBtn(master.id, 'extend', 'error');
      autoReset(`ext_${master.id}`, master.id, 'extend');
    }
  };

  // ✅ 3. ОБНОВЛЕНО: handleRevoke
  const handleRevoke = async (master: MasterRow) => {
    const state = rowStates[master.id]?.revoke;
    if (state === 'loading') return;
    if (state !== 'confirm') {
      setBtn(master.id, 'revoke', 'confirm');
      autoReset(`rev_${master.id}`, master.id, 'revoke', 4000);
      return;
    }
    clearTimeout(confirmTimers.current[`rev_${master.id}`]);
    setBtn(master.id, 'revoke', 'loading');
    try {
      // ✅ ИСПОЛЬЗУЕМ АДМИНСКИЙ ЭНДПОИНТ
      const res = await fetch('/api/admin-update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: user?.id,
          master_id: master.id,
          updates: {
            is_premium: false,
            premium_expires_at: null,
            plan_type: null,
          },
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      patchMaster(master.id, { is_premium: false, premium_expires_at: null, plan_type: null });
      setBtn(master.id, 'revoke', 'success');
      autoReset(`rev_${master.id}`, master.id, 'revoke');
    } catch {
      setBtn(master.id, 'revoke', 'error');
      autoReset(`rev_${master.id}`, master.id, 'revoke');
    }
  };

  // ✅ 4. ОБНОВЛЕНО: handleGrantTrial
  const handleGrantTrial = async (master: MasterRow) => {
    if (rowStates[master.id]?.grantTrial === 'loading') return;
    setBtn(master.id, 'grantTrial', 'loading');
    try {
      const newStart = new Date().toISOString();
      
      // ✅ ИСПОЛЬЗУЕМ АДМИНСКИЙ ЭНДПОИНТ
      const res = await fetch('/api/admin-update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: user?.id,
          master_id: master.id,
          updates: {
            trial_start_date: newStart,
          },
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      patchMaster(master.id, { trial_start_date: newStart });
      setBtn(master.id, 'grantTrial', 'success');
      autoReset(`gt_${master.id}`, master.id, 'grantTrial');
    } catch {
      setBtn(master.id, 'grantTrial', 'error');
      autoReset(`gt_${master.id}`, master.id, 'grantTrial');
    }
  };

  // ✅ 5. ОБНОВЛЕНО: handleResetTrial
  const handleResetTrial = async (master: MasterRow) => {
    if (rowStates[master.id]?.resetTrial === 'loading') return;
    setBtn(master.id, 'resetTrial', 'loading');
    try {
      const expired = new Date();
      expired.setDate(expired.getDate() - 15);
      
      // ✅ ИСПОЛЬЗУЕМ АДМИНСКИЙ ЭНДПОИНТ
      const res = await fetch('/api/admin-update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: user?.id,
          master_id: master.id,
          updates: {
            trial_start_date: expired.toISOString(),
          },
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      patchMaster(master.id, { trial_start_date: expired.toISOString() });
      setBtn(master.id, 'resetTrial', 'success');
      autoReset(`rt_${master.id}`, master.id, 'resetTrial');
    } catch {
      setBtn(master.id, 'resetTrial', 'error');
      autoReset(`rt_${master.id}`, master.id, 'resetTrial');
    }
  };

  // ─── Удалить профиль ───────────────────────────────────────
  const handleDelete = async (master: MasterRow) => {
    const state = rowStates[master.id]?.delete;
    if (state === 'loading') return;
    if (state !== 'confirm') {
      setBtn(master.id, 'delete', 'confirm');
      autoReset(`del_${master.id}`, master.id, 'delete', 4000);
      return;
    }
    clearTimeout(confirmTimers.current[`del_${master.id}`]);
    setBtn(master.id, 'delete', 'loading');
    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', master.id);
      if (error) throw error;

      setMasters((prev) => {
        const updated       = prev.filter((m) => m.id !== master.id);
        const activePremium = updated.filter((m) => m.is_premium).length;
        setStats({ totalMasters: updated.length, activePremium, mrr: activePremium * PREMIUM_PRICE });
        return updated;
      });
      setRowStates((prev) => {
        const next = { ...prev };
        delete next[master.id];
        return next;
      });
    } catch {
      setBtn(master.id, 'delete', 'error');
      autoReset(`del_${master.id}`, master.id, 'delete');
    }
  };

  // ─── Broadcast ─────────────────────────────────────────────
  const handleBroadcast = async () => {
    if (!broadcastText.trim()) return;
    setBroadcastStatus('sending');
    setBroadcastResult('');
    try {
      const targets = masters.filter(
        (m) => m.telegram_id?.trim() || m.telegram_chat_id?.trim()
      );
      if (!targets.length) {
        setBroadcastStatus('error');
        setBroadcastResult('Нет мастеров с привязанным Telegram.');
        return;
      }
      const res = await fetch('/api/broadcast', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: user?.id,
          message:  broadcastText.trim(),
          targets:  targets.map((m) => ({
            id:          m.id,
            name:        m.name,
            telegram_id: m.telegram_id || m.telegram_chat_id,
          })),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      setBroadcastStatus('success');
      setBroadcastResult(`✅ Отправлено ${result.sent ?? targets.length} из ${targets.length}.`);
      setBroadcastText('');
    } catch (err: any) {
      setBroadcastStatus('error');
      setBroadcastResult(`❌ ${err.message}`);
    }
  };

  if (!user || !isAdmin) return null;

  // ─── RENDER ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* TOP BAR */}
      <header className="bg-gray-900 border-b border-white/8 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft size={18} />
            <span className="text-sm hidden sm:block">Назад</span>
          </button>
          <div className="w-px h-5 bg-white/10 hidden sm:block" />
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-400" size={18} />
            <span className="font-bold">
              Beauty<span className="text-emerald-400">SaaS</span>
            </span>
            <span className="flex items-center gap-1 bg-red-500/20 text-red-400 text-xs font-bold px-2 py-0.5 rounded-full border border-red-500/30">
              <Shield size={10} /> ADMIN
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 hidden sm:block">{user.name}</span>

          {/* ── КНОПКА СИНХРОНИЗАЦИИ ── */}
          <button
            onClick={handleSyncUsers}
            disabled={syncState === 'loading'}
            title="Синхронизировать базу — найти пользователей без профиля"
            className={`
              flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-xl border
              transition-all cursor-pointer disabled:cursor-not-allowed
              ${syncState === 'idle'    ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20' : ''}
              ${syncState === 'loading' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 opacity-60' : ''}
              ${syncState === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : ''}
              ${syncState === 'error'   ? 'bg-red-500/10 text-red-400 border-red-500/30' : ''}
            `}
          >
            {syncState === 'loading' ? (
              <Loader2 size={15} className="animate-spin shrink-0" />
            ) : syncState === 'success' ? (
              <CheckCircle size={15} className="shrink-0" />
            ) : syncState === 'error' ? (
              <AlertCircle size={15} className="shrink-0" />
            ) : (
              <DatabaseZap size={15} className="shrink-0" />
            )}
            <span className="hidden sm:block">
              {syncState === 'loading' ? 'Синхронизация...'
               : syncState === 'success' ? 'Синхронизировано'
               : syncState === 'error'   ? 'Ошибка'
               : 'Синхр. базу'}
            </span>
          </button>

          <button
            onClick={loadData}
            disabled={isLoading}
            title="Обновить"
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => { logout(); navigate('/'); }}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
          >
            <LogOut size={16} />
            <span className="hidden sm:block">Выйти</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-10">

        <div>
          <h1 className="text-2xl font-bold">Панель администратора</h1>
          <p className="text-gray-400 text-sm mt-1">
            Управление платформой BeautySaaS · Только для создателя
          </p>
        </div>

        {/* Результат синхронизации */}
        {syncResult && (
          <div className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm border ${
            syncState === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {syncState === 'success'
              ? <CheckCircle size={16} className="shrink-0 mt-0.5" />
              : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
            <span>{syncResult}</span>
          </div>
        )}

        {/* АНАЛИТИКА */}
        <section>
          <SectionTitle icon={<TrendingUp size={18} className="text-emerald-400" />}>
            Блок А — Бизнес-аналитика
          </SectionTitle>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-gray-900 rounded-2xl border border-white/8 p-6 animate-pulse h-28" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                icon={<Users size={20} className="text-emerald-400" />}
                iconBg="bg-emerald-500/10"
                label="Всего мастеров"
                value={stats.totalMasters}
                sub="реальных профилей"
              />
              <StatCard
                icon={<Star size={20} className="text-amber-400" />}
                iconBg="bg-amber-500/10"
                label="Активный Premium"
                value={stats.activePremium}
                valueClass="text-amber-400"
                sub="платных подписчиков"
              />
              <StatCard
                icon={<TrendingUp size={20} className="text-blue-400" />}
                iconBg="bg-blue-500/10"
                label="Прогноз дохода (MRR)"
                value={`${stats.mrr.toLocaleString('ru-RU')} ₽`}
                valueClass="text-blue-400"
                sub={`${stats.activePremium} × ${PREMIUM_PRICE.toLocaleString('ru-RU')} ₽/мес`}
              />
            </div>
          )}
        </section>

        {/* РАССЫЛКА */}
        <section>
          <SectionTitle icon={<Send size={18} className="text-blue-400" />}>
            Блок Б — Массовая рассылка
          </SectionTitle>
          <div className="bg-gray-900 rounded-2xl border border-white/8 p-6 space-y-4">
            <p className="text-sm text-gray-400">
              Сообщение получат все мастера с привязанным Telegram.
            </p>
            <div>
              <label className="text-sm font-medium text-gray-300 block mb-2">
                Текст объявления
              </label>
              <textarea
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="Введите текст для всех мастеров..."
                rows={4}
                className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm resize-none focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
              <p className="text-xs text-gray-600 mt-1">{broadcastText.length} символов</p>
            </div>
            {broadcastStatus !== 'idle' && broadcastResult && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm border ${
                broadcastStatus === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : broadcastStatus === 'error'
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              }`}>
                {broadcastStatus === 'success' && <CheckCircle size={16} />}
                {broadcastStatus === 'error'   && <AlertCircle size={16} />}
                {broadcastStatus === 'sending' && <Loader2 size={16} className="animate-spin" />}
                {broadcastResult}
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                Telegram: {masters.filter((m) => m.telegram_id?.trim() || m.telegram_chat_id?.trim()).length} / {masters.length}
              </p>
              <button
                onClick={handleBroadcast}
                disabled={!broadcastText.trim() || broadcastStatus === 'sending'}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl transition-all text-sm cursor-pointer w-full sm:w-auto justify-center"
              >
                {broadcastStatus === 'sending'
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Send size={16} />}
                {broadcastStatus === 'sending' ? 'Отправка...' : 'Отправить всем'}
              </button>
            </div>
          </div>
        </section>

        {/* ТАБЛИЦА МАСТЕРОВ */}
        <section className="pb-12">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle icon={<Crown size={18} className="text-amber-400" />}>
              Блок В — Управление мастерами
            </SectionTitle>
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
                {/* DESKTOP TABLE */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/8 bg-gray-800/50">
                        {['Мастер / Студия','Телефон','Telegram','Статус подписки','Регистрация','Действия'].map((h) => (
                          <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 py-3 first:pl-6 last:pr-6">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {masters.map((master) => {
                        const sub    = getSubStatus(master);
                        const states = rowStates[master.id] ?? defaultRowStates();
                        const hasTg  = !!(master.telegram_id?.trim() || master.telegram_chat_id?.trim());

                        return (
                          <tr key={master.id} className="hover:bg-white/3 transition-colors align-top">

                            <td className="pl-6 pr-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-emerald-700 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                                  {master.name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-white truncate max-w-[160px]">
                                    {master.name || '—'}
                                  </p>
                                  <p className="text-xs text-gray-500 font-mono truncate max-w-[160px]">
                                    /book/{master.slug}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex items-center gap-1.5 text-sm text-gray-300">
                                <Phone size={12} className="text-gray-500 shrink-0" />
                                <span className="whitespace-nowrap">{master.phone || '—'}</span>
                              </div>
                            </td>

                            <td className="px-4 py-4">
                              {hasTg ? (
                                <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded-lg">
                                  Привязан
                                </span>
                              ) : (
                                <span className="text-xs text-gray-600">Нет</span>
                              )}
                            </td>

                            <td className="px-4 py-4">
                              <div className={`inline-flex flex-col px-2.5 py-1.5 rounded-xl border ${sub.badgeClass}`}>
                                <span className="text-xs font-bold leading-tight">{sub.label}</span>
                                <span className="text-xs opacity-70 leading-tight">{sub.detail}</span>
                              </div>
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                                <Calendar size={12} />
                                {new Date(master.created_at).toLocaleDateString('ru-RU', {
                                  day: 'numeric', month: 'short', year: 'numeric',
                                })}
                              </div>
                            </td>

                            <td className="px-4 pr-6 py-4">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex flex-wrap gap-1.5">
                                  <ActionBtn
                                    btnState={states.grantPlan}
                                    onClick={() => handleGrantPlanClick(master)}
                                    idleClass="bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20"
                                    idleContent={<><Award size={11} className="shrink-0" /><span>Выдать план</span></>}
                                    successClass="bg-purple-500/10 text-purple-400 border-purple-500/20"
                                    title="Выдать тариф Соло/Салон на 30 дней"
                                  />
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  <ActionBtn
                                    btnState={states.extend}
                                    onClick={() => handleExtend(master)}
                                    idleClass="bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                                    idleContent={<><Star size={11} className="shrink-0" /><span>+30 дн.</span></>}
                                    successClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    title="Продлить на 30 дней"
                                  />
                                  <ActionBtn
                                    btnState={states.revoke}
                                    onClick={() => handleRevoke(master)}
                                    visible={master.is_premium}
                                    idleClass="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                                    idleContent={<><StarOff size={11} className="shrink-0" /><span>Снять</span></>}
                                    confirmContent={<><AlertCircle size={11} className="shrink-0" /><span>Уверен?</span></>}
                                    confirmClass="bg-red-600/40 text-red-300 border-red-500/50 animate-pulse"
                                    successClass="bg-gray-500/10 text-gray-400 border-gray-500/20"
                                    title="Снять Premium"
                                  />
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  <ActionBtn
                                    btnState={states.grantTrial}
                                    onClick={() => handleGrantTrial(master)}
                                    idleClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                    idleContent={<><Gift size={11} className="shrink-0" /><span>+14д</span></>}
                                    successClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    title="+14 дней триала"
                                  />
                                  <ActionBtn
                                    btnState={states.resetTrial}
                                    onClick={() => handleResetTrial(master)}
                                    idleClass="bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20"
                                    idleContent={<><RotateCcw size={11} className="shrink-0" /><span>Сбр.</span></>}
                                    successClass="bg-orange-500/10 text-orange-400 border-orange-500/20"
                                    title="Сбросить триал"
                                  />
                                </div>
                                <div>
                                  <ActionBtn
                                    btnState={states.delete}
                                    onClick={() => handleDelete(master)}
                                    idleClass="bg-gray-800 text-gray-500 border-gray-700 hover:bg-red-900/20 hover:text-red-400"
                                    idleContent={<><Trash2 size={11} className="shrink-0" /><span>Удалить</span></>}
                                    confirmContent={<><AlertCircle size={11} className="shrink-0" /><span>Точно?</span></>}
                                    confirmClass="bg-red-600/30 text-red-300 border-red-500/40 animate-pulse"
                                    title="Удалить профиль"
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE CARDS */}
                <div className="lg:hidden divide-y divide-white/5">
                  {masters.map((master) => {
                    const sub    = getSubStatus(master);
                    const states = rowStates[master.id] ?? defaultRowStates();
                    const hasTg  = !!(master.telegram_id?.trim() || master.telegram_chat_id?.trim());

                    return (
                      <div key={master.id} className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-emerald-700 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                            {master.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white truncate">{master.name || '—'}</p>
                            <p className="text-xs text-gray-500">{master.phone || '—'}</p>
                          </div>
                          <div className={`shrink-0 flex flex-col items-end px-2.5 py-1.5 rounded-xl border ${sub.badgeClass}`}>
                            <span className="text-xs font-bold leading-tight">{sub.label}</span>
                            <span className="text-xs opacity-70 leading-tight">{sub.detail}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{hasTg ? '🟢 Telegram' : '⚪ Нет TG'}</span>
                          <span>·</span>
                          <span>{new Date(master.created_at).toLocaleDateString('ru-RU')}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <ActionBtn
                            btnState={states.grantPlan}
                            onClick={() => handleGrantPlanClick(master)}
                            idleClass="bg-purple-500/10 text-purple-400 border-purple-500/20"
                            idleContent={<><Award size={11} /><span>Выдать</span></>}
                            successClass="bg-purple-500/10 text-purple-400 border-purple-500/20"
                          />
                          <ActionBtn
                            btnState={states.extend}
                            onClick={() => handleExtend(master)}
                            idleClass="bg-amber-500/10 text-amber-400 border-amber-500/20"
                            idleContent={<><Star size={11} /><span>+30</span></>}
                            successClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          />
                          <ActionBtn
                            btnState={states.revoke}
                            onClick={() => handleRevoke(master)}
                            visible={master.is_premium}
                            idleClass="bg-red-500/10 text-red-400 border-red-500/20"
                            idleContent={<><StarOff size={11} /><span>Снять</span></>}
                            confirmContent={<><AlertCircle size={11} /><span>Уверен?</span></>}
                            confirmClass="bg-red-600/30 text-red-300 border-red-500/40 animate-pulse"
                            successClass="bg-gray-500/10 text-gray-400 border-gray-500/20"
                          />
                          <ActionBtn
                            btnState={states.grantTrial}
                            onClick={() => handleGrantTrial(master)}
                            idleClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            idleContent={<><Gift size={11} /><span>+14д</span></>}
                            successClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          />
                          <ActionBtn
                            btnState={states.delete}
                            onClick={() => handleDelete(master)}
                            idleClass="bg-gray-800 text-gray-500 border-gray-700"
                            idleContent={<><Trash2 size={11} /><span>Удалить</span></>}
                            confirmContent={<><AlertCircle size={11} /><span>Точно?</span></>}
                            confirmClass="bg-red-600/30 text-red-300 border-red-500/40 animate-pulse"
                          />
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

      {/* МОДАЛКА ВЫБОРА ПЛАНА */}
      {showPlanModal && selectedMasterForPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-gray-900 rounded-3xl border border-white/10 p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-2">Выдать подписку</h2>
            <p className="text-sm text-gray-400 mb-6">
              Мастер: <span className="text-white font-semibold">{selectedMasterForPlan.name}</span>
            </p>
            <div className="space-y-3 mb-6">
              <label className="text-sm font-medium text-gray-300 block">Выберите тариф:</label>
              <div className="grid grid-cols-2 gap-3">
                {(['solo', 'salon'] as const).map((plan) => (
                  <button
                    key={plan}
                    onClick={() => setSelectedPlanType(plan)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                      selectedPlanType === plan
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <span className="text-2xl">{plan === 'solo' ? '🌿' : '💎'}</span>
                    <span className="font-bold text-sm">{plan === 'solo' ? 'Соло' : 'Салон'}</span>
                    <span className="text-xs text-gray-400">{plan === 'solo' ? '550 ₽' : '990 ₽'}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-emerald-950/30 border border-emerald-700/30 rounded-2xl p-4 mb-6">
              <p className="text-sm text-emerald-300"><strong>✅ Будет выдано:</strong></p>
              <ul className="text-xs text-emerald-400 mt-2 space-y-1 list-disc list-inside">
                <li>Тариф: <strong>{selectedPlanType === 'solo' ? 'Соло' : 'Салон'}</strong></li>
                <li>Срок: <strong>30 дней</strong> (до {new Date(new Date().setDate(new Date().getDate() + 30)).toLocaleDateString('ru-RU')})</li>
                <li>Статус: <strong>Premium активен</strong></li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPlanModal(false); setSelectedMasterForPlan(null); }}
                className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-semibold transition-all cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleGrantPlanConfirm}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Award size={16} />
                Выдать план
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────
function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon}
      <h2 className="text-lg font-bold text-white">{children}</h2>
    </div>
  );
}

function StatCard({
  icon, iconBg, label, value, sub, valueClass = 'text-white',
}: {
  icon:        React.ReactNode;
  iconBg:      string;
  label:       string;
  value:       string | number;
  sub:         string;
  valueClass?: string;
}) {
  return (
    <div className="bg-gray-900 rounded-2xl border border-white/8 p-6 hover:border-white/15 transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
        <p className="text-sm text-gray-400 font-medium">{label}</p>
      </div>
      <p className={`text-4xl font-black ${valueClass}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-2">{sub}</p>
    </div>
  );
}