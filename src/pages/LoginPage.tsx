import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const {
    loginWithEmail,
    registerWithEmail,
    isAuthenticated,
    needsOnboarding,
    isLoading,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Редиректы после смены состояния auth
  useEffect(() => {
    if (isLoading) return;
    if (needsOnboarding) {
      navigate('/onboarding', { replace: true });
    } else if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, needsOnboarding, isLoading, navigate]);

  const handleSubmit = async () => {
    setError('');
    setSuccess('');

    if (!email.trim()) return setError('Введите email');
    if (!password.trim()) return setError('Введите пароль');
    if (password.length < 6) return setError('Пароль должен быть не менее 6 символов');

    setFormLoading(true);

    if (mode === 'login') {
      const { error: err } = await loginWithEmail(email.trim(), password);
      if (err) {
        setError(
          err.includes('Invalid') || err.includes('credentials') || err.includes('invalid')
            ? 'Неверный email или пароль'
            : 'Ошибка входа. Попробуйте снова.'
        );
      }
      // Редирект произойдёт автоматически через useEffect выше
    } else {
      const { error: err } = await registerWithEmail(email.trim(), password);
      if (err) {
        setError(
          err.includes('already') || err.includes('registered')
            ? 'Этот email уже зарегистрирован. Попробуйте войти.'
            : 'Ошибка регистрации. Попробуйте снова.'
        );
      } else {
        setSuccess(
          `Аккаунт создан! Если требуется подтверждение — проверьте почту ${email}. Иначе заполните профиль.`
        );
      }
    }

    setFormLoading(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-400" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Фоновые блики */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-amber-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Логотип */}
        <div className="text-center mb-8">
          <a href="#/" className="inline-flex items-center gap-2 mb-6">
            <Sparkles className="text-amber-400" size={24} />
            <span className="text-2xl font-bold text-white">
              Beauty<span className="text-emerald-400">SaaS</span>
            </span>
          </a>
          <h1 className="text-3xl font-bold text-white mb-2">Добро пожаловать!</h1>
          <p className="text-gray-400">Управляйте записями вашего салона</p>
        </div>

        {/* Карточка формы */}
        <div className="bg-gray-900 rounded-3xl border border-white/8 p-8 shadow-2xl">
          {/* Переключатель Войти / Зарегистрироваться */}
          <div className="flex bg-gray-800 rounded-xl p-1 mb-6">
            <button
              onClick={() => {
                setMode('login');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Войти
            </button>
            <button
              onClick={() => {
                setMode('register');
                setError('');
                setSuccess('');
              }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                mode === 'register'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Зарегистрироваться
            </button>
          </div>

          {/* Поле Email */}
          <div className="space-y-4 mb-6">
            <div className="relative">
              <label className="block text-sm text-gray-400 mb-1.5 ml-1">Email</label>
              <div className="relative">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  autoComplete="email"
                  className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-3 pl-11 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              </div>
            </div>

            {/* Поле Пароль */}
            <div className="relative">
              <label className="block text-sm text-gray-400 mb-1.5 ml-1">Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={
                    mode === 'register' ? 'Придумайте пароль (мин. 6 символов)' : 'Ваш пароль'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-3 pl-11 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* Сообщения об ошибке / успехе */}
          {error && (
            <div className="mb-4 bg-red-900/30 border border-red-700/50 text-red-400 rounded-2xl px-4 py-3 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 bg-emerald-900/30 border border-emerald-700/50 text-emerald-400 rounded-2xl px-4 py-3 text-sm">
              {success}
            </div>
          )}

          {/* Кнопка отправки */}
          <button
            onClick={handleSubmit}
            disabled={formLoading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.97] text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {formLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
                <ArrowRight size={18} />
              </>
            )}
          </button>

          {/* Политика конфиденциальности */}
          <p className="text-xs text-gray-500 text-center mt-6">
            Входя в систему, вы соглашаетесь с{' '}
            <a href="#/privacy" className="text-emerald-400 hover:text-emerald-300">
              политикой конфиденциальности
            </a>
          </p>
        </div>

        {/* Ссылка назад */}
        <div className="text-center mt-6">
          <a href="#/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← Вернуться на главную
          </a>
        </div>
      </div>
    </div>
  );
}