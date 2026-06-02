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
  completeOnboarding: (name: string, phone: string) => void;
  logout: () => void;
  updateUser: (updates: Partial<AppUser>) => void;
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

  const loginAsGuest = () => {
    // Демо-вход (отключен)
  };

  const loginWithGoogle = () => {
    const savedUser = getUser();
    if (savedUser) {
      // Профиль уже есть, впускаем
      setUser(savedUser);
      setNeedsOnboarding(false);
    } else {
      // Профиля нет — показываем окно создания профиля
      setNeedsOnboarding(true);
    }
  };

  const completeOnboarding = (name: string, phone: string) => {
    const slug = generateSlug(name);
    const id = `master-${slug}-${Date.now()}`;

    const newUser: AppUser = {
      id,
      name,
      phone,
      slug,
      isGuest: false,
    };

    const master = {
      id,
      name,
      slug,
      phone,
      telegram_chat_id: '',
      created_at: new Date().toISOString(),
      workingHours: {
        start: '09:00',
        end: '21:00',
      },
      daysOff: [], // Без выходных по умолчанию
    };

    upsertMaster(master);
    saveUser(newUser);
    setUser(newUser);
    setNeedsOnboarding(false);
  };

  const logout = () => {
    clearUser();
    setUser(null);
    setNeedsOnboarding(false);
  };

  const updateUser = (updates: Partial<AppUser>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    saveUser(updated);
    setUser(updated);

    // Синхронизация с профилем мастера
    upsertMaster({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      phone: updated.phone,
      telegram_chat_id: updated.telegram_chat_id,
      workingHours: updated.workingHours,
      daysOff: updated.daysOff,
      created_at: new Date().toISOString(),
    });
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