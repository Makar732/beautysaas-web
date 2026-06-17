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

  // Подписка
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysLeft: number;
  planType: 'solo' | 'salon';           // ★ НОВОЕ
  premiumDaysLeft: number;              // ★ НОВОЕ
  premiumExpiresAt: string | null;      // ★ НОВОЕ

  // Методы
  loginWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  registerWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  completeOnboarding: (name: string, phone: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AppUser>) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────
// ХЕЛПЕРЫ
// ─────────────────────────────────────────────────────────────

/** Считает дни триала */
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

/** Считает дни до окончания PRO-подписки */
function checkPremiumExpiry(premiumExpiresAt?: string | null): {
  daysLeft: number;
} {
  if (!premiumExpiresAt) return { daysLeft: 0 };
  const target = new Date(premiumExpiresAt);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const days = Math.max(
    0,
    Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );
  return { daysLeft: days };
}

/** Проверяет полноту профиля */
function isProfileComplete(master: {
  name?: string | null;
  phone?: string | null;
}): boolean {
  const hasName =
    typeof master.name === 'string' && master.name.trim().length >= 2;
  const hasPhone =
    typeof master.phone === 'string' &&
    master.phone.replace(/\D/g, '').length >= 10;
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

  // ── После успешного входа ──────────────────────────────────
  const handleSignedIn = useCallback(
    async (authUserId: string, authUserEmail: string) => {
      try {
        const profile = await getMasterById(authUserId);

        if (profile && isProfileComplete(profile)) {
          const appUser: AppUser = {
            id: profile.id,
            name: profile.name!,
            phone: profile.phone!,
            slug: profile.slug,
            isGuest: false,
            telegram_chat_id:   profile.telegram_chat_id   || '',
            telegram_bot_token: profile.telegram_bot_token || '',
            telegram_id:        profile.telegram_id        || '',
            trial_start_date:   profile.trial_start_date,
            is_premium:         profile.is_premium || false,

            // ★ НОВОЕ
            plan_type:           profile.plan_type           || 'solo',
            premium_expires_at:  profile.premium_expires_at  ?? null,

            workingHours: profile.workingHours || { start: '09:00', end: '21:00' },
            daysOff:      profile.daysOff      || [],
          };

          saveUser(appUser);
          setUser(appUser);
          setNeedsOnboarding(false);
        } else {
          sessionStorage.setItem('pending_user_id',    authUserId);
          sessionStorage.setItem('pending_user_email', authUserEmail);
          setUser(null);
          setNeedsOnboarding(true);
        }
      } catch (err) {
        console.error('❌ Ошибка в handleSignedIn:', err);
        setUser(null);
        setNeedsOnboarding(true);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // ── Инициализация ──────────────────────────────────────────
  useEffect(() => {
    initStorage();

    const savedUser = getUser();
    if (savedUser && isProfileComplete(savedUser)) {
      setUser(savedUser);
      setNeedsOnboarding(false);
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await handleSignedIn(session.user.id, session.user.email || '');
      } else {
        clearUser();
        setUser(null);
        setNeedsOnboarding(false);
        setIsLoading(false);
      }
    });

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange(async (event, session) => {
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

  // ── Вход ──────────────────────────────────────────────────
  const loginWithEmail = async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  };

  // ── Регистрация ────────────────────────────────────────────
  const registerWithEmail = async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      sessionStorage.setItem('pending_user_id',    data.user.id);
      sessionStorage.setItem('pending_user_email', email);
    }
    return { error: null };
  };

  // ── Онбординг ─────────────────────────────────────────────
  const completeOnboarding = async (
    name: string,
    phone: string
  ): Promise<void> => {
    const userId =
      sessionStorage.getItem('pending_user_id') || `master-${Date.now()}`;
    const slug           = generateSlug(name);
    const trialStartDate = new Date().toISOString();

    const newUser: AppUser = {
      id:    userId,
      name:  name.trim(),
      phone: phone.trim(),
      slug,
      isGuest:            false,
      telegram_chat_id:   '',
      telegram_bot_token: '',
      telegram_id:        '',
      trial_start_date:   trialStartDate,
      is_premium:         false,

      // ★ НОВОЕ — новый пользователь по умолчанию solo
      plan_type:          'solo',
      premium_expires_at: null,

      workingHours: { start: '09:00', end: '21:00' },
      daysOff:      [],
    };

    await upsertMaster({
      id:                newUser.id,
      name:              newUser.name,
      slug:              newUser.slug,
      phone:             newUser.phone,
      telegram_chat_id:  '',
      telegram_bot_token:'',
      telegram_id:       '',
      trial_start_date:  trialStartDate,
      is_premium:        false,
      plan_type:         'solo',
      premium_expires_at: null,
      working_hours:     newUser.workingHours,
      days_off:          newUser.daysOff,
      created_at:        new Date().toISOString(),
    } as any);

    saveUser(newUser);
    setUser(newUser);
    setNeedsOnboarding(false);

    sessionStorage.removeItem('pending_user_id');
    sessionStorage.removeItem('pending_user_email');
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

  // ── Вычисляемые значения подписки ────────────────────────
  const { isActive: isTrialActive, daysLeft: trialDaysLeft } =
    checkTrial(user?.trial_start_date);

  const isPremium = user?.is_premium || false;

  // ★ НОВОЕ
  const planType          = user?.plan_type          || 'solo';
  const premiumExpiresAt  = user?.premium_expires_at ?? null;
  const { daysLeft: premiumDaysLeft } = checkPremiumExpiry(premiumExpiresAt);

  // ─────────────────────────────────────────────────────────
  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated:  !!user && !needsOnboarding,
        needsOnboarding,
        isLoading,
        isPremium,
        isTrialActive,
        trialDaysLeft,
        planType,           // ★
        premiumDaysLeft,    // ★
        premiumExpiresAt,   // ★
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