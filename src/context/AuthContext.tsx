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
  getMasterById,
  upsertMaster,
  initStorage,
} from '../lib/storage';
import { generateSlug } from '../lib/transliterate';

// ─────────────────────────────────────────────────────────────
// ТИПЫ
// ─────────────────────────────────────────────────────────────
interface AuthContextType {
  user: AppUser | null;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  isLoading: boolean;
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysLeft: number;
  planType: 'solo' | 'salon';
  premiumDaysLeft: number;
  premiumExpiresAt: string | null;
  loginWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  registerWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  completeOnboarding: (name: string, phone: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AppUser>) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// ХЕЛПЕРЫ
// ─────────────────────────────────────────────────────────────
function checkTrial(trialStartDate?: string): { isActive: boolean; daysLeft: number } {
  if (!trialStartDate) return { isActive: true, daysLeft: 14 };
  const diffDays = Math.floor(
    (Date.now() - new Date(trialStartDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysLeft = Math.max(0, 14 - diffDays);
  return { isActive: daysLeft > 0, daysLeft };
}

function checkPremiumExpiry(premiumExpiresAt?: string | null): { daysLeft: number } {
  if (!premiumExpiresAt) return { daysLeft: 0 };
  const target = new Date(premiumExpiresAt);
  const now    = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return {
    daysLeft: Math.max(
      0,
      Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    ),
  };
}

function isProfileComplete(master: { name?: string | null; phone?: string | null }): boolean {
  const hasName  = typeof master.name  === 'string' && master.name.trim().length  >= 2;
  const hasPhone = typeof master.phone === 'string' && master.phone.replace(/\D/g, '').length >= 10;
  return hasName && hasPhone;
}

// ─────────────────────────────────────────────────────────────
// ★ НОВЫЙ ХЕЛПЕР: пауза между попытками
// ─────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────
// ★ МЕСТО 1: getMasterById с повторными попытками
// ─────────────────────────────────────────────────────────────
async function getMasterByIdWithRetry(
  id: string,
  attempts = 4,
  delayMs  = 2000,
) {
  for (let i = 0; i < attempts; i++) {
    try {
      console.log(`🔄 getMasterById попытка ${i + 1}/${attempts} для id: ${id}`);

      // ★ Перед каждой попыткой проверяем что сессия реально есть
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn(`⏳ Сессия ещё не готова (попытка ${i + 1}), ждём...`);
        await sleep(delayMs);
        continue;
      }

      const profile = await getMasterById(id);
      if (profile) {
        console.log('✅ Профиль найден:', profile.name);
        return profile;
      }
      console.warn(`⚠️ Профиль не найден (попытка ${i + 1})`);

    } catch (err) {
      console.error(`❌ Ошибка попытки ${i + 1}:`, err);
    }

    if (i < attempts - 1) {
      console.log(`⏳ Ждём ${delayMs}мс...`);
      await sleep(delayMs);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// КОНТЕКСТ
// ─────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,             setUser]             = useState<AppUser | null>(null);
  const [needsOnboarding,  setNeedsOnboarding]  = useState(false);
  const [isLoading,        setIsLoading]        = useState(true);

  // ── После успешного входа ──────────────────────────────────
  const handleSignedIn = useCallback(
    async (authUserId: string, authUserEmail: string) => {
      console.log('🔐 handleSignedIn вызван для:', authUserId);
      // ★ МЕСТО 3: Даём время сессии полностью установиться
      // Особенно важно после fresh login (не TOKEN_REFRESHED)
      await sleep(300);

      // ★ ШАГ 1: Проверяем localStorage — может профиль уже есть локально
      // Это спасает от мигания экрана онбординга при перезагрузке
      const savedUser = getUser();
      if (savedUser && savedUser.id === authUserId && isProfileComplete(savedUser)) {
        console.log('💾 Профиль найден в localStorage, используем его');
        setUser(savedUser);
        setNeedsOnboarding(false);
        setIsLoading(false);

        // Фоново обновляем из БД (без блокировки UI)
        getMasterByIdWithRetry(authUserId).then(freshProfile => {
          if (freshProfile && isProfileComplete(freshProfile)) {
            const refreshed: AppUser = {
              ...savedUser,
              name:              freshProfile.name!,
              phone:             freshProfile.phone!,
              slug:              freshProfile.slug,
              telegram_chat_id:  freshProfile.telegram_chat_id  || '',
              telegram_bot_token:freshProfile.telegram_bot_token || '',
              telegram_id:       freshProfile.telegram_id       || '',
              trial_start_date:  freshProfile.trial_start_date,
              is_premium:        freshProfile.is_premium        || false,
              plan_type:         freshProfile.plan_type         || 'solo',
              premium_expires_at:freshProfile.premium_expires_at ?? null,
              workingHours:      freshProfile.workingHours      || { start: '09:00', end: '21:00' },
              daysOff:           freshProfile.daysOff           || [],
            };
            saveUser(refreshed);
            setUser(refreshed);
            console.log('🔄 Профиль обновлён из БД в фоне');
          }
        });

        return; // ← Выходим, UI уже показан
      }

      // ★ ШАГ 2: localStorage пустой или чужой — грузим из БД с retry
      try {
        const profile = await getMasterByIdWithRetry(authUserId, 4, 2000);

        if (profile && isProfileComplete(profile)) {
          // ✅ Профиль найден и заполнен → в дашборд
          const appUser: AppUser = {
            id:                profile.id,
            name:              profile.name!,
            phone:             profile.phone!,
            slug:              profile.slug,
            isGuest:           false,
            telegram_chat_id:  profile.telegram_chat_id  || '',
            telegram_bot_token:profile.telegram_bot_token || '',
            telegram_id:       profile.telegram_id       || '',
            trial_start_date:  profile.trial_start_date,
            is_premium:        profile.is_premium        || false,
            plan_type:         profile.plan_type         || 'solo',
            premium_expires_at:profile.premium_expires_at ?? null,
            workingHours:      profile.workingHours      || { start: '09:00', end: '21:00' },
            daysOff:           profile.daysOff           || [],
          };

          saveUser(appUser);
          setUser(appUser);
          setNeedsOnboarding(false);
          console.log('✅ Пользователь авторизован:', appUser.name);

        } else if (profile && !isProfileComplete(profile)) {
          // ⚠️ Профиль есть но не заполнен (нет имени/телефона) → онбординг
          console.warn('⚠️ Профиль не заполнен — онбординг');
          sessionStorage.setItem('pending_user_id',    authUserId);
          sessionStorage.setItem('pending_user_email', authUserEmail);
          setUser(null);
          setNeedsOnboarding(true);

        } else {
          // ❌ Профиль не найден совсем (новый пользователь) → онбординг
          console.warn('❌ Профиль не найден после всех попыток — онбординг');
          sessionStorage.setItem('pending_user_id',    authUserId);
          sessionStorage.setItem('pending_user_email', authUserEmail);
          setUser(null);
          setNeedsOnboarding(true);
        }

      } catch (err) {
        // ★ КРИТИЧНО: при любой ошибке НЕ отправляем на онбординг
        // если есть сохранённый пользователь — используем его
        console.error('❌ Критическая ошибка handleSignedIn:', err);

        const fallback = getUser();
        if (fallback && fallback.id === authUserId && isProfileComplete(fallback)) {
          console.log('🆘 Fallback: используем localStorage после ошибки');
          setUser(fallback);
          setNeedsOnboarding(false);
        } else {
          sessionStorage.setItem('pending_user_id',    authUserId);
          sessionStorage.setItem('pending_user_email', authUserEmail);
          setNeedsOnboarding(true);
        }
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // ── Инициализация ──────────────────────────────────────────
  useEffect(() => {
    initStorage();

    // ★ Сначала показываем сохранённого пользователя из localStorage
    // чтобы не было мигания онбординга при перезагрузке
    const savedUser = getUser();
    if (savedUser && isProfileComplete(savedUser)) {
      console.log('💾 Быстрая загрузка из localStorage:', savedUser.name);
      setUser(savedUser);
      setNeedsOnboarding(false);
      // isLoading остаётся true — ждём подтверждения сессии
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        console.log('🔑 Сессия найдена:', session.user.id);
        await handleSignedIn(session.user.id, session.user.email || '');
      } else {
        console.log('🔑 Сессия не найдена — выход');
        clearUser();
        setUser(null);
        setNeedsOnboarding(false);
        setIsLoading(false);
      }
    });

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('🔔 Auth event:', event);
        if (
          (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') &&
          session?.user
        ) {
          await handleSignedIn(session.user.id, session.user.email || '');
        }
        if (event === 'SIGNED_OUT') {
          clearUser();
          sessionStorage.clear();
          setUser(null);
          setNeedsOnboarding(false);
          setIsLoading(false);
        }
      });

    return () => subscription.unsubscribe();
  }, [handleSignedIn]);

  // ── МЕСТО 2: Вход ──────────────────────────────────────────
  const loginWithEmail = async (
    email: string,
    password: string,
  ): Promise<{ error: string | null }> => {
    
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });
    
    if (error) return { error: error.message };

    // ★ КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ:
    // Ждём чуть-чуть чтобы сессия успела записаться
    // прежде чем onAuthStateChange триггернёт handleSignedIn
    // и тот попытается читать профиль из БД
    if (data.session) {
      await sleep(500);
    }

    return { error: null };
  };

  // ── Регистрация ────────────────────────────────────────────
  const registerWithEmail = async (
    email: string,
    password: string,
  ): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      sessionStorage.setItem('pending_user_id',    data.user.id);
      sessionStorage.setItem('pending_user_email', email);
    }
    return { error: null };
  };

  // ── ШАГ 1: Онбординг (ИСПРАВЛЕНО) ──────────────────────────
  const completeOnboarding = async (name: string, phone: string): Promise<void> => {
    // ★ КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ:
    // Берём ID из сессии Supabase Auth, а не генерируем новый!
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      console.error('❌ Нет активной сессии при онбординге!');
      throw new Error('No active session');
    }

    const userId = session.user.id; // ← auth.uid() из Supabase
    const slug   = generateSlug(name);
    const trialStartDate = new Date().toISOString();

    console.log('💾 Создаём профиль с ID:', userId);

    const newUser: AppUser = {
      id:                userId,
      name:              name.trim(),
      phone:             phone.trim(),
      slug,
      isGuest:           false,
      telegram_chat_id:  '',
      telegram_bot_token:'',
      telegram_id:       '',
      trial_start_date:  trialStartDate,
      is_premium:        false,
      plan_type:         'solo',
      premium_expires_at:null,
      workingHours:      { start: '09:00', end: '21:00' },
      daysOff:           [],
    };

    await upsertMaster({
      id:                userId,
      name:              newUser.name,
      slug:              newUser.slug,
      phone:             newUser.phone,
      telegram_chat_id:  '',
      telegram_bot_token:'',
      telegram_id:       '',
      trial_start_date:  trialStartDate,
      is_premium:        false,
      plan_type:         'solo',
      premium_expires_at:null,
      working_hours:     newUser.workingHours,
      days_off:          newUser.daysOff,
      created_at:        new Date().toISOString(),
    } as any);

    saveUser(newUser);
    setUser(newUser);
    setNeedsOnboarding(false);
    sessionStorage.removeItem('pending_user_id');
    sessionStorage.removeItem('pending_user_email');
    
    console.log('✅ Профиль создан и сохранён');
  };

  // ── Выход ─────────────────────────────────────────────────
  const logout = async (): Promise<void> => {
    await supabase.auth.signOut();
    clearUser();
    sessionStorage.clear();
    setUser(null);
    setNeedsOnboarding(false);
    setIsLoading(false);
  };

  // ── Обновление пользователя ───────────────────────────────
  const updateUser = async (updates: Partial<AppUser>): Promise<void> => {
    if (!user) return;
    const updated: AppUser = { ...user, ...updates };
    await upsertMaster({
      ...updated,
      working_hours: updated.workingHours,
      days_off:      updated.daysOff,
      created_at:    new Date().toISOString(),
    } as any);
    saveUser(updated);
    setUser(updated);
  };

  // ── Подписка ──────────────────────────────────────────────
  const { isActive: isTrialActive, daysLeft: trialDaysLeft } =
    checkTrial(user?.trial_start_date);
  const isPremium                         = user?.is_premium        || false;
  const planType                          = user?.plan_type         || 'solo';
  const premiumExpiresAt                  = user?.premium_expires_at ?? null;
  const { daysLeft: premiumDaysLeft }     = checkPremiumExpiry(premiumExpiresAt);

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
        planType,
        premiumDaysLeft,
        premiumExpiresAt,
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
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}