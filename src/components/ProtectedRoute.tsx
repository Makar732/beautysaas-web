import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, Sparkles } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, needsOnboarding, isLoading } = useAuth();

  // Показываем лоадер пока AuthContext определяет состояние
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="text-amber-400" size={24} />
            <span className="text-xl font-bold text-white">
              Beauty<span className="text-emerald-400">SaaS</span>
            </span>
          </div>
          <Loader2 size={32} className="animate-spin text-emerald-400" />
          <p className="text-gray-400 text-sm">Загрузка...</p>
        </div>
      </div>
    );
  }

  // ЖЁСТКАЯ ПРОВЕРКА: если пользователь не завершил онбординг — 
  // перенаправляем на /login (там откроется модалка онбординга)
  if (needsOnboarding) {
    return <Navigate to="/login" replace />;
  }

  // Если вообще не залогинен — тоже на /login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Всё ОК — профиль заполнен, пускаем в защищённую зону
  return <>{children}</>;
}