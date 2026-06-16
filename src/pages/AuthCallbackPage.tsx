import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';

/**
 * Страница-заглушка для OAuth-редиректов.
 * OAuth провайдеры удалены, поэтому просто редиректим на /login.
 * Файл оставлен, чтобы не ломать старые закладки и возможные внешние ссылки.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-6">
          <Sparkles className="text-amber-400" size={42} />
        </div>
        <Loader2 size={48} className="animate-spin text-emerald-400 mx-auto mb-6" />
        <p className="text-xl font-semibold text-white">Перенаправляем...</p>
      </div>
    </div>
  );
}