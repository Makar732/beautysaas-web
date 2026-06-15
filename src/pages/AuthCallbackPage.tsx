import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * Страница-обработчик OAuth редиректа.
 *
 * Яндекс перенаправляет сюда после авторизации с code/token в URL.
 * Supabase автоматически обрабатывает сессию через onAuthStateChange.
 * Мы просто ждём и переходим на /login (там AuthContext сам решит,
 * нужен ли онбординг или можно в /dashboard).
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase сам разберёт токены из URL и вызовет onAuthStateChange(SIGNED_IN)
    // Нам остаётся только дождаться сессии и перенаправить
    const checkSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error('❌ Ошибка получения сессии:', error.message);
          navigate('/login', { replace: true });
          return;
        }

        if (session) {
          // Сессия есть — AuthContext разберётся с онбордингом/дашбордом
          // Ждём секунду чтобы onAuthStateChange успел сработать
          setTimeout(() => navigate('/login', { replace: true }), 500);
        } else {
          // Сессии нет (токен не пришёл) — возвращаем на логин
          navigate('/login', { replace: true });
        }
      } catch (err) {
        console.error('❌ Непредвиденная ошибка в AuthCallback:', err);
        navigate('/login', { replace: true });
      }
    };

    checkSession();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center px-4">
        {/* Логотип */}
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="text-amber-400" size={28} />
          <span className="text-2xl font-bold text-white">
            Beauty<span className="text-emerald-400">SaaS</span>
          </span>
        </div>

        {/* Спиннер */}
        <div className="bg-gray-900 rounded-3xl border border-white/8 p-10 flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-emerald-400" />
          <div>
            <p className="text-white font-semibold text-lg">
              Выполняем вход через Яндекс...
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Пожалуйста, подождите несколько секунд
            </p>
          </div>
        </div>

        <p className="text-gray-600 text-xs">
          Если ничего не происходит —{' '}
          <a
            href="#/login"
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            вернитесь на страницу входа
          </a>
        </p>
      </div>
    </div>
  );
}