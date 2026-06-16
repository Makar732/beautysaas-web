import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, Sparkles } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, needsOnboarding, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="text-amber-400" size={28} />
            <span className="text-2xl font-bold text-white">
              Beauty<span className="text-emerald-400">SaaS</span>
            </span>
          </div>
          <Loader2 size={36} className="animate-spin text-emerald-400" />
        </div>
      </div>
    );
  }

  // Профиль не заполнен — на онбординг
  if (needsOnboarding) return <Navigate to="/onboarding" replace />;

  // Не авторизован — на логин
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}