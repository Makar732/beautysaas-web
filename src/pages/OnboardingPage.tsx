import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { PhoneInput, isPhoneComplete } from '../components/ui/PhoneInput';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { completeOnboarding, needsOnboarding, isAuthenticated, isLoading } =
    useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // Редиректы — срабатывают ТОЛЬКО когда isLoading === false
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    } else if (!needsOnboarding) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, needsOnboarding, isLoading, navigate]);

  const validate = (): boolean => {
    const errs: { name?: string; phone?: string } = {};
    if (!name.trim() || name.trim().length < 2) {
      errs.name = 'Введите имя или название студии (минимум 2 символа)';
    }
    if (!isPhoneComplete(phone)) {
      errs.phone = 'Введите полный номер телефона';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    await completeOnboarding(name.trim(), phone.trim());
    setSubmitting(false);
    navigate('/dashboard', { replace: true });
  };

  // Пока загрузка — показываем лоадер, редиректов нет
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
          <div className="inline-flex items-center gap-2 mb-6">
            <Sparkles className="text-amber-400" size={24} />
            <span className="text-2xl font-bold text-white">
              Beauty<span className="text-emerald-400">SaaS</span>
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Расскажите о себе</h1>
          <p className="text-gray-400">
            Это займёт 30 секунд. Данные будут отображаться в вашем профиле.
          </p>
        </div>

        {/* Карточка */}
        <div className="bg-gray-900 rounded-3xl border border-white/8 p-8 shadow-2xl space-y-5">
          {/* Шаг-индикатор */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                1
              </div>
              <span className="text-xs text-emerald-400 font-medium">Аккаунт создан</span>
            </div>
            <div className="flex-1 h-px bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold">
                2
              </div>
              <span className="text-xs text-amber-400 font-medium">Заполните профиль</span>
            </div>
          </div>

          {/* Поле имени — используем компонент Input */}
          <Input
            label="ФИО или название студии"
            placeholder="Ирина Козлова или Студия Beauty"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />

          {/* Поле телефона — теперь стилизован идентично Input */}
          <PhoneInput
            label="Номер телефона"
            value={phone}
            onChange={setPhone}
            error={errors.phone}
          />

          {/* Кнопка */}
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={submitting || !name.trim() || !isPhoneComplete(phone)}
            className="w-full mt-2"
            size="lg"
          >
            Завершить регистрацию и войти
            <ArrowRight size={18} />
          </Button>

          <p className="text-xs text-gray-500 text-center">
            Эти данные можно изменить позже в настройках профиля
          </p>
        </div>
      </div>
    </div>
  );
}