import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppUser } from '../types';
import { getUser, saveUser, clearUser, upsertMaster, getMasterById, initStorage } from '../lib/storage';
import { generateSlug } from '../lib/transliterate';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: AppUser | null;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  loginAsGuest: () => void;
  loginWithGoogle: () => Promise<void>;
  completeOnboarding: (name: string, phone: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AppUser>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    initStorage();

    // Шаг 1: Проверяем localStorage (быстрый старт для обычных пользователей)
    const savedUser = getUser();
    if (savedUser) {
      setUser(savedUser);
    }

    // Шаг 2: Слушаем сессию Supabase (для Google OAuth)
    // Срабатывает когда пользователь возвращается после редиректа от Google
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth event:', event, session?.user?.email);

        if (event === 'SIGNED_IN' && session?.user) {
          const googleUser = session.user;
          const googleId = googleUser.id; // UUID от Supabase Auth

          // Проверяем: есть ли уже профиль этого пользователя в БД
          const existingMaster = await getMasterById(googleId);

          if (existingMaster) {
            // ✅ Пользователь уже регистрировался — просто входим
            console.log('✅ Найден существующий профиль:', existingMaster.name);
            const appUser: AppUser = {
              id: existingMaster.id,
              name: existingMaster.name,
              phone: existingMaster.phone,
              slug: existingMaster.slug,
              isGuest: false,
              telegram_chat_id: existingMaster.telegram_chat_id || '',
              telegram_bot_token: existingMaster.telegram_bot_token || '',
              workingHours: existingMaster.workingHours || { start: '09:00', end: '21:00' },
              daysOff: existingMaster.daysOff || [],
            };
            saveUser(appUser);
            setUser(appUser);
            setNeedsOnboarding(false);
          } else {
            // 🆕 Новый пользователь — нужен онбординг (имя + телефон)
            console.log('🆕 Новый пользователь через Google, нужен онбординг');
            // Сохраняем Google ID во временное хранилище
            // чтобы потом использовать в completeOnboarding
            sessionStorage.setItem('google_user_id', googleId);
            sessionStorage.setItem('google_user_email', googleUser.email || '');
            sessionStorage.setItem(
              'google_user_name',
              googleUser.user_metadata?.full_name || googleUser.user_metadata?.name || ''
            );
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

    // Отписываемся при размонтировании
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loginAsGuest = () => {};

  // ✅ Реальный Google OAuth — редирект на страницу Google
  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // После авторизации Google редиректит сюда
        redirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      console.error('❌ Ошибка Google OAuth:', error.message);
    }
    // Браузер автоматически переходит на страницу Google
    // После входа — возвращается на redirectTo
    // Там срабатывает onAuthStateChange выше
  };

  // Вызывается после Google OAuth когда новый пользователь заполняет имя и телефон
  const completeOnboarding = async (name: string, phone: string) => {
    // Получаем Google ID из sessionStorage (сохранили в onAuthStateChange)
    const googleId = sessionStorage.getItem('google_user_id');

    // Если пришли через Google — используем его ID, иначе генерируем новый
    const id = googleId || `master-${Date.now()}`;
    const slug = generateSlug(name);

    const newUser: AppUser = {
      id,
      name,
      phone,
      slug,
      isGuest: false,
      telegram_chat_id: '',
      telegram_bot_token: '',
      workingHours: {
        start: '09:00',
        end: '21:00',
      },
      daysOff: [],
    };

    const master = {
      id: newUser.id,
      name: newUser.name,
      slug: newUser.slug,
      phone: newUser.phone,
      telegram_chat_id: '',
      telegram_bot_token: '',
      workingHours: newUser.workingHours!,
      daysOff: newUser.daysOff!,
      created_at: new Date().toISOString(),
    };

    await upsertMaster(master);
    saveUser(newUser);
    setUser(newUser);
    setNeedsOnboarding(false);

    // Очищаем временные данные
    sessionStorage.removeItem('google_user_id');
    sessionStorage.removeItem('google_user_email');
    sessionStorage.removeItem('google_user_name');
  };

  const logout = async () => {
    // Выходим из Supabase Auth (Google сессия)
    await supabase.auth.signOut();
    // Очищаем localStorage
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
      workingHours: updated.workingHours || { start: '09:00', end: '21:00' },
      daysOff: updated.daysOff || [],
      created_at: new Date().toISOString(),
    });

    saveUser(updated);
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      needsOnboarding,
      loginAsGuest,
      loginWithGoogle,
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