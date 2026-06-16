import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, Sparkles } from 'lucide-react';

// ============================================================
// ⚠️  ДОЛЖЕН СОВПАДАТЬ с ADMIN_UUID в AdminPage.tsx
// ============================================================
const ADMIN_UUID = '789e7654-c21d-4edc-9ad8-a5a316aad726';
// ============================================================

interface AdminRouteProps {
  children: ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isLoading } = useAuth();

  // Ждём пока AuthContext загрузится
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

  // Не авторизован → на логин
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Авторизован, но не админ → на дашборд (тихий редирект)
  if (user.id !== ADMIN_UUID) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}