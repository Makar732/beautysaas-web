import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Provider } from '@supabase/supabase-js';
import { AppUser } from '../types';
import { getUser, saveUser, clearUser, upsertMaster, getMasterById, initStorage } from '../lib/storage';
import { generateSlug } from '../lib/transliterate';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: AppUser | null;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  isPremium: boolean;
  isTrialActive: boolean;
  trialDaysLeft: number;
  loginAsGuest: () => void;
  loginWithYandex: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  registerWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  completeOnboarding: (name: string, phone: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AppUser>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Проверяет активен ли триал (14 дней с даты регистрации).
 */
function checkTrial(trialStartDate?: string): { isActive: boolean; daysLeft: number } {
  if (!trialStartDate) return { isActive: true, daysLeft: 14 };
  const start = new Date(trialStartDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, 14 - diffDays);
  return { isActive: daysLeft > 0, daysLeft };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    initStorage();

    // Шаг 1: Быстрый старт из localStorage
    const savedUser = getUser();
    if (savedUser) {
      setUser(savedUser);
    }

    // Шаг 2: Слушаем OAuth редиректы (Яндекс) и email-сессии
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth event:', event, session?.user?.email);

        if (event === 'SIGNED_IN' && session?.user) {
          const authUser = session.user;
          const userId = authUser.id;

          const existingMaster = await getMasterById(userId);

          if (existingMaster) {
            console.log('✅ Найден существующий профиль:', existingMaster.name);
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
              workingHours: existingMaster.workingHours || { start: '09:00', end: '21:00' },
              daysOff: existingMaster.daysOff || [],
            };
            saveUser(appUser);
            setUser(appUser);
            setNeedsOnboarding(false);
          } else {
            console.log('🆕 Новый пользователь, нужен онбординг');
            sessionStorage.setItem('oauth_user_id', userId);
            sessionStorage.setItem('oauth_user_email', authUser.email || '');
            const rawName =
              authUser.user_metadata?.full_name ||
              authUser.user_metadata?.name ||
              authUser.user_metadata?.first_name ||
              '';
            sessionStorage.setItem('oauth_user_name', rawName);
            setNeedsOnboarding(true);
          }
        }

        if (event === 'SIGNED_OUT') {
          clearUser();
          setUser(null);
          setNeedsOnboarding(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loginAsGuest = () => {};

  /**
   * Авторизация через Яндекс (Custom OAuth Provider в Supabase).
   */
  const loginWithYandex = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'custom:yandex' as unknown as Provider,
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) console.error('❌ Ошибка Яндекс OAuth:', error.message);
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
   */
  const registerWithEmail = async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      console.error('❌ Ошибка регистрации по email:', error.message);
      return { error: error.message };
    }
    return { error: null };
  };

  const completeOnboarding = async (name: string, phone: string) => {
    const userId =
      sessionStorage.getItem('oauth_user_id') ||
      sessionStorage.getItem('google_user_id') ||
      `master-${Date.now()}`;

    const slug = generateSlug(name);
    const trialStartDate = new Date().toISOString();

    const newUser: AppUser = {
      id: userId,
      name,
      phone,
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

    const master = {
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
    };

    await upsertMaster(master);
    saveUser(newUser);
    setUser(newUser);
    setNeedsOnboarding(false);

    sessionStorage.removeItem('oauth_user_id');
    sessionStorage.removeItem('oauth_user_email');
    sessionStorage.removeItem('oauth_user_name');
    sessionStorage.removeItem('google_user_id');
    sessionStorage.removeItem('google_user_email');
    sessionStorage.removeItem('google_user_name');
  };

  const logout = async () => {
    await supabase.auth.signOut();
    clearUser();
    setUser(null);
    setNeedsOnboarding(false);
  };

  const updateUser = async (updates: Partial<AppUser>) => {
    if (!user) return;
    const updated = { ...user, ...updates };

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

  const { isActive: isTrialActive, daysLeft: trialDaysLeft } = checkTrial(user?.trial_start_date);
  const isPremium = user?.is_premium || false;

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      needsOnboarding,
      isPremium,
      isTrialActive,
      trialDaysLeft,
      loginAsGuest,
      loginWithYandex,
      loginWithEmail,
      registerWithEmail,
      completeOnboarding,
      logout,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}