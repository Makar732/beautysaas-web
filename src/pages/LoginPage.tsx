import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, User, Phone, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { PhoneInput, isPhoneComplete } from '../components/ui/PhoneInput';

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loginWithGoogle, completeOnboarding, needsOnboarding } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Редирект если уже залогинен и онбординг не нужен
  useEffect(() => {
    if (user && !needsOnboarding) {
      navigate('/dashboard');
    }
  }, [user, needsOnboarding, navigate]);

  // Подставляем имя из Google если есть
  useEffect(() => {
    const googleName = sessionStorage.getItem('google_user_name');
    if (googleName && needsOnboarding) {
      setName(googleName);
    }
  }, [needsOnboarding]);

  const validate = () => {
    const newErrors: { name?: string; phone?: string } = {};
    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Введите имя или название студии (минимум 2 символа)';
    }
    if (!isPhoneComplete(phone)) {
      newErrors.phone = 'Введите полный номер телефона';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    // Реальный редирект на Google — браузер уйдёт со страницы
    await loginWithGoogle();
    // Этот код выполнится только если произошла ошибка (редиректа не было)
    setGoogleLoading(false);
  };

  const handleOnboardingSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    await completeOnboarding(name.trim(), phone.trim());
    setLoading(false);
    navigate('/dashboard');
  };

  const isFormValid = name.trim().length >= 2 && isPhoneComplete(phone);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-amber-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <a href="#/" className="inline-flex items-center gap-2 mb-6">
            <Sparkles className="text-amber-400" size={24} />
            <span className="text-2xl font-bold text-white">
              Beauty<span className="text-emerald-400">SaaS</span>
            </span>
          </a>
          <h1 className="text-3xl font-bold text-white mb-2">Добро пожаловать!</h1>
          <p className="text-gray-400">Войдите в систему для управления записями</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 rounded-3xl border border-white/8 p-8 shadow-2xl">
          <p className="text-gray-400 text-sm text-center mb-6">
            Войдите чтобы получить доступ к панели мастера
          </p>

          {/* Google Login Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3.5 px-6 rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-60"
          >
            {googleLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {googleLoading ? 'Переходим к Google...' : 'Войти через Google'}
          </button>

          <p className="text-xs text-gray-600 text-center mt-6">
            Нажимая кнопку, вы соглашаетесь с{' '}
            <a href="#/privacy" className="text-emerald-400 hover:text-emerald-300 transition-colors">
              политикой конфиденциальности
            </a>
          </p>
        </div>

        <div className="text-center mt-6">
          <a href="#/" className="text-gray-500 hover:text-gray-300 transition-colors text-sm">
            ← Вернуться на главную
          </a>
        </div>
      </div>

      {/* Onboarding Modal — появляется после первого входа через Google */}
      <Modal
        isOpen={needsOnboarding}
        onClose={() => {}}
        title="Расскажите о себе"
      >
        <div className="space-y-4">
          <p className="text-gray-500 text-sm">
            Вы входите впервые. Заполните профиль — это займёт 30 секунд.
          </p>

          <div className="relative">
            <Input
              label="ФИО или название компании"
              placeholder="Например: Ирина Козлова или Студия Beauty"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
            />
            <User size={16} className="absolute right-4 top-10 text-gray-400 pointer-events-none" />
          </div>

          <div className="relative">
            <PhoneInput
              label="Номер телефона"
              value={phone}
              onChange={setPhone}
              error={errors.phone}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-gray-900"
            />
            <Phone size={16} className="absolute right-4 top-10 text-gray-400 pointer-events-none" />
          </div>

          {name.trim().length >= 2 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs text-emerald-700">
                Ваша ссылка для записи клиентов:{' '}
                <span className="font-mono font-bold">
                  /book/{name.toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-zа-яё-]/gi, '')}
                </span>
              </p>
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            className="w-full mt-2"
            onClick={handleOnboardingSubmit}
            loading={loading}
            disabled={!isFormValid}
          >
            Создать профиль и войти
            <ArrowRight size={18} />
          </Button>
        </div>
      </Modal>
    </div>
  );
}