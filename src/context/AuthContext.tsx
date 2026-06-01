import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppUser } from '../types';
import { getUser, saveUser, clearUser, upsertMaster, initStorage } from '../lib/storage';
import { generateSlug } from '../lib/transliterate';

interface AuthContextType {
  user: AppUser | null;
  isAuthenticated: boolean;
  loginAsGuest: (name: string, phone: string) => void;
  loginWithGoogle: () => void;
  logout: () => void;
  updateUser: (updates: Partial<AppUser>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    initStorage();
    const savedUser = getUser();
    if (savedUser) {
      setUser(savedUser);
    }
  }, []);

  const loginAsGuest = (name: string, phone: string) => {
    const slug = generateSlug(name);
    const id = `master-${slug}-${Date.now()}`;

    const newUser: AppUser = {
      id,
      name,
      phone,
      slug,
      isGuest: true,
    };

    const master = {
      id,
      name,
      slug,
      phone,
      telegram_chat_id: '',
      created_at: new Date().toISOString(),
    };

    upsertMaster(master);
    saveUser(newUser);
    setUser(newUser);
  };

  const loginWithGoogle = () => {
    // Google OAuth stub — подключить реальный провайдер при необходимости
    const stubUser: AppUser = {
      id: 'google-user-stub',
      name: 'Ирина Козлова',
      phone: '+7 900 123-45-67',
      slug: 'irina-kozlova',
      isGuest: false,
    };
    saveUser(stubUser);
    setUser(stubUser);
  };

  const logout = () => {
    clearUser();
    setUser(null);
  };

  const updateUser = (updates: Partial<AppUser>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    saveUser(updated);
    setUser(updated);

    // Sync to master profile
    upsertMaster({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      phone: updated.phone,
      telegram_chat_id: updated.telegram_chat_id,
      created_at: new Date().toISOString(),
    });
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, loginAsGuest, loginWithGoogle, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
