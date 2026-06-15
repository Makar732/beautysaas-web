import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import { AppUser } from '../types';
import {
  getUser,
  saveUser,
  clearUser,
  upsertMaster,
  getMasterById,
  initStorage,
} from '../lib/storage';
import { generateSlug } from '../lib/transliterate';

// ─────────────────────────────────────────────────────────────
// ТИПЫ
// ─────────────────────────────────────────────────────────────
interface AuthContextType {
  user: AppUser | null;
  isAuthenticated: boolean;
  /**
   * true  → профиль не заполнен, пользователь обязан пройти онбординг
   * false → профиль готов, можно работать в /dashboard
   */
  needsOnboarding: boolean;
  /** Загрузка первоначальной сессии (не показываем UI пока неизвестно) */
  isLoading: boolean;
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysLeft: number;
  loginWithYandex: () => Promise<void>;
  loginWithEmail: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  registerWithEmail: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  completeOnboarding: (name: string, phone: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AppUser>) => Promise<void>;
  // оставляем для обратной совместимости (DashboardPage может вызывать)
  loginAsGuest: () => void;
}

// ─────────────────────────────────────────────────────────────
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ─────────────────────────────────────────────────────────────

/**
 * Безопасное извлечение имени из user_metadata.
 * Яндекс кладёт данные в display_name / real_name / first_name.
 * Google клал в full_name / name.
 * Если ничего нет — возвращаем пустую строку (не падаем).
 */
function extractDisplayName(metadata: Record<string, unknown>): string {
  return (
    (metadata?.display_name as string) ||
    (metadata?.real_name as string) ||
    (metadata?.first_name as string) ||
    (metadata?.full_name as string) ||
    (metadata?.name as string) ||
    ''
  );
}

/**
 * Проверяет, активен ли 14-дневный триал.
 */
function checkTrial(trialStartDate?: string): {
  isActive: boolean;
  daysLeft: number;
} {
  if (!trialStartDate) return { isActive: true, daysLeft: 14 };
  const start = new Date(trialStartDate);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysLeft = Math.max(0, 14 - diffDays);
  return { isActive: daysLeft > 0, daysLeft };
}

/**
 * Проверяет, заполнены ли обязательные поля профиля.
 * Профиль считается завершённым если есть name И phone.
 */
function isProfileComplete(master: {
  name?: string | null;
  phone?: string | null;
}): boolean {
  const hasName = typeof master.name === 'string' && master.name.trim().length >= 2;
  const hasPhone =
    typeof master.phone === 'string' && master.phone.replace(/\D/g, '').length >= 10;
  return hasName && hasPhone;
}

// ─────────────────────────────────────────────────────────────
// КОНТЕКСТ
// ─────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ── Обработчик успешного входа ────────────────────────────
  const handleSignedIn = useCallback(
    async (authUserId: string, authUserEmail: string, metadata: Record<string, unknown>) => {
      try {
        console.log('🔐 handleSignedIn:', authUserEmail);

        // 1. Ищем профиль в Supabase (таблица profiles)
        const existingMaster = await getMasterById(authUserId);

        if (existingMaster && isProfileComplete(existingMaster)) {
          // ── ПРОФИЛЬ СУЩЕСТВУЕТ И ЗАПОЛНЕН ────────────────
          console.log('✅ Профиль найден и заполнен:', existingMaster.name);

          const appUser: AppUser = {
            id: existingMaster.id,
            name: existingMaster.name,
            phone: existingMaster.phone,
            slug: existingMaster.slug,
            isGuest: false,
            telegram_chat_id: existingMaster.telegram_chat_id || '',
            telegram_bot_token: existingMaster.telegram_bot_token || '',
            telegram_id: existingMaster.telegram_id || '',
            trial_start_date: existingMaster.trial_start_date,
            is_premium: existingMaster.is_premium || false,
            workingHours: existingMaster.workingHours || {
              start: '09:00',
              end: '21:00',
            },
            daysOff: existingMaster.daysOff || [],
          };

          saveUser(appUser);
          setUser(appUser);
          setNeedsOnboarding(false);
        } else {
          // ── ПРОФИЛЯ НЕТ ИЛИ ОН НЕ ЗАПОЛНЕН → ОНБОРДИНГ ──
          console.log('🆕 Профиль отсутствует или не заполнен → онбординг');

          // Сохраняем данные OAuth во временное хранилище
          sessionStorage.setItem('oauth_user_id', authUserId);
          sessionStorage.setItem('oauth_user_email', authUserEmail);

          // Безопасно извлекаем имя из метаданных Яндекса/email
          const rawName = extractDisplayName(metadata);
          sessionStorage.setItem('oauth_user_name', rawName);

          // Если профиль есть но не заполнен — всё равно показываем онбординг
          // (пользователь сам заполнит оставшиеся поля)
          setNeedsOnboarding(true);

          // user остаётся null до завершения онбординга
          // (чтобы ProtectedRoute не пустил в /dashboard)
          setUser(null);
        }
      } catch (err) {
        console.error('❌ Ошибка в handleSignedIn:', err);
        // При ошибке — не блокируем UI, показываем онбординг
        setNeedsOnboarding(true);
        setUser(null);
      }
    },
    []
  );

  // ── Инициализация и подписка на Supabase Auth ─────────────
  useEffect(() => {
    initStorage();

    // Шаг 1: Быстрый старт из localStorage (пока Supabase грузится)
    const savedUser = getUser();
    if (savedUser && isProfileComplete(savedUser)) {
      setUser(savedUser);
    }

    // Шаг 2: Получаем текущую сессию (важно для OAuth-редиректа)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await handleSignedIn(
          session.user.id,
          session.user.email || '',
          session.user.user_metadata || {}
        );
      }
      // Скрываем лоадер — теперь точно знаем состояние
      setIsLoading(false);
    });

    // Шаг 3: Слушаем все последующие изменения (OAuth редиректы, email login, logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔔 Auth event:', event, session?.user?.email || '—');

      if (
        (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
        session?.user
      ) {
        await handleSignedIn(
          session.user.id,
          session.user.email || '',
          session.user.user_metadata || {}
        );
      }

      if (event === 'SIGNED_OUT') {
        clearUser();
        sessionStorage.removeItem('oauth_user_id');
        sessionStorage.removeItem('oauth_user_email');
        sessionStorage.removeItem('oauth_user_name');
        setUser(null);
        setNeedsOnboarding(false);
      }

      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [handleSignedIn]);

  // ─────────────────────────────────────────────────────────
  // МЕТОДЫ АВТОРИЗАЦИИ
  // ─────────────────────────────────────────────────────────

  /**
   * Авторизация через Яндекс ID.
   * Supabase поддерживает 'yandex' как встроенный провайдер.
   * Настройте его в Supabase Dashboard → Authentication → Providers → Yandex.
   */
  const loginWithYandex = async (): Promise<void> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'yandex',
      options: {
        // После OAuth Яндекс вернёт сюда — HashRouter подхватит хэш
        redirectTo: `${window.location.origin}${window.location.pathname}#/login`,
        // Запрашиваем базовые данные профиля у Яндекса
        scopes: 'login:email login:info login:avatar',
      },
    });

    if (error) {
      console.error('❌ Ошибка Яндекс OAuth:', error.message);
      throw error;
    }
    // Браузер делает редирект на Яндекс — дальнейший код не выполняется
  };

  /**
   * Вход по email + пароль.
   */
  const loginWithEmail = async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('❌ Ошибка входа по email:', error.message);
      return { error: error.message };
    }
    return { error: null };
  };

  /**
   * Регистрация по email + пароль.
   * После регистрации Supabase отправляет письмо подтверждения.
   * Триал начинается после прохождения онбординга (completeOnboarding).
   */
  const registerWithEmail = async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      console.error('❌ Ошибка регистрации:', error.message);
      return { error: error.message };
    }

    // Если Supabase настроен без подтверждения email — сразу кладём в sessionStorage
    if (data.user) {
      sessionStorage.setItem('oauth_user_id', data.user.id);
      sessionStorage.setItem('oauth_user_email', email);
      sessionStorage.setItem('oauth_user_name', '');
    }

    return { error: null };
  };

  /**
   * Завершение онбординга: создаём/обновляем профиль в БД.
   * Вызывается из формы LoginPage после ввода имени и телефона.
   */
  const completeOnboarding = async (
    name: string,
    phone: string
  ): Promise<void> => {
    const userId =
      sessionStorage.getItem('oauth_user_id') || `master-${Date.now()}`;

    const slug = generateSlug(name);
    const trialStartDate = new Date().toISOString();

    const newUser: AppUser = {
      id: userId,
      name: name.trim(),
      phone: phone.trim(),
      slug,
      isGuest: false,
      telegram_chat_id: '',
      telegram_bot_token: '',
      telegram_id: '',
      trial_start_date: trialStartDate,
      is_premium: false,
      workingHours: { start: '09:00', end: '21:00' },
      daysOff: [],
    };

    // Сохраняем в Supabase
    await upsertMaster({
      id: newUser.id,
      name: newUser.name,
      slug: newUser.slug,
      phone: newUser.phone,
      telegram_chat_id: '',
      telegram_bot_token: '',
      telegram_id: '',
      trial_start_date: trialStartDate,
      is_premium: false,
      workingHours: newUser.workingHours!,
      daysOff: newUser.daysOff!,
      created_at: new Date().toISOString(),
    });

    // Обновляем локальный стейт
    saveUser(newUser);
    setUser(newUser);
    setNeedsOnboarding(false);

    // Очищаем временное хранилище
    sessionStorage.removeItem('oauth_user_id');
    sessionStorage.removeItem('oauth_user_email');
    sessionStorage.removeItem('oauth_user_name');

    console.log('✅ Онбординг завершён, профиль создан:', newUser.name);
  };

  /**
   * Выход из аккаунта.
   */
  const logout = async (): Promise<void> => {
    await supabase.auth.signOut();
    clearUser();
    sessionStorage.clear();
    setUser(null);
    setNeedsOnboarding(false);
  };

  /**
   * Обновление данных профиля (из DashboardPage).
   */
  const updateUser = async (updates: Partial<AppUser>): Promise<void> => {
    if (!user) return;
    const updated: AppUser = { ...user, ...updates };

    await upsertMaster({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      phone: updated.phone,
      telegram_chat_id: updated.telegram_chat_id || '',
      telegram_bot_token: updated.telegram_bot_token || '',
      telegram_id: updated.telegram_id || '',
      trial_start_date: updated.trial_start_date,
      is_premium: updated.is_premium || false,
      workingHours: updated.workingHours || { start: '09:00', end: '21:00' },
      daysOff: updated.daysOff || [],
      created_at: new Date().toISOString(),
    });

    saveUser(updated);
    setUser(updated);
  };

  // ─────────────────────────────────────────────────────────
  // ВЫЧИСЛЯЕМЫЕ ЗНАЧЕНИЯ
  // ─────────────────────────────────────────────────────────
  const { isActive: isTrialActive, daysLeft: trialDaysLeft } = checkTrial(
    user?.trial_start_date
  );
  const isPremium = user?.is_premium || false;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user && !needsOnboarding,
        needsOnboarding,
        isLoading,
        isPremium,
        isTrialActive,
        trialDaysLeft,
        loginAsGuest: () => {}, // заглушка для обратной совместимости
        loginWithYandex,
        loginWithEmail,
        registerWithEmail,
        completeOnboarding,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}