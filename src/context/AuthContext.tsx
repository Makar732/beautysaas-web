import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppUser } from '../types';
import { getUser, saveUser, clearUser, upsertMaster, initStorage } from '../lib/storage';
import { generateSlug } from '../lib/transliterate';

interface AuthContextType {
  user: AppUser | null;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  loginAsGuest: () => void;
  loginWithGoogle: () => void;
  completeOnboarding: (name: string, phone: string) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<AppUser>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    initStorage();
    const savedUser = getUser();
    if (savedUser) {
      setUser(savedUser);
    }
  }, []);

  const loginAsGuest = () => {};

  const loginWithGoogle = () => {
    const savedUser = getUser();
    if (savedUser) {
      setUser(savedUser);
      setNeedsOnboarding(false);
    } else {
      setNeedsOnboarding(true);
    }
  };

  const completeOnboarding = async (name: string, phone: string) => {
    const slug = generateSlug(name);
    const id = `master-${slug}-${Date.now()}`;

    // ✅ ИСПРАВЛЕНИЕ: Единый объект со всеми полями
    const newUser: AppUser = {
      id,
      name,
      phone,
      slug,
      isGuest: false,
      telegram_chat_id: '',
      telegram_bot_token: '',
      workingHours: {
        start: '00:00', // ✅ 24/7 по умолчанию
        end: '24:00',
      },
      daysOff: [], // ✅ Все дни рабочие
    };

    const master = {
      id: newUser.id,
      name: newUser.name,
      slug: newUser.slug,
      phone: newUser.phone,
      telegram_chat_id: newUser.telegram_chat_id || '',
      telegram_bot_token: newUser.telegram_bot_token || '',
      workingHours: newUser.workingHours!,
      daysOff: newUser.daysOff!,
      created_at: new Date().toISOString(),
    };

    // ЖДЁМ сохранения в базу данных!
    await upsertMaster(master);
    
    saveUser(newUser);
    setUser(newUser);
    setNeedsOnboarding(false);
  };

  const logout = () => {
    clearUser();
    setUser(null);
    setNeedsOnboarding(false);
  };

  const updateUser = async (updates: Partial<AppUser>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    
    // Ждём сохранения профиля
    await upsertMaster({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      phone: updated.phone,
      telegram_chat_id: updated.telegram_chat_id || '',
      telegram_bot_token: updated.telegram_bot_token || '',
      workingHours: updated.workingHours || { start: '00:00', end: '24:00' },
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