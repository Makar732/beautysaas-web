import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, User, Phone, ArrowRight, Loader2, Mail, Lock, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { PhoneInput, isPhoneComplete } from '../components/ui/PhoneInput';

export default function LoginPage() {
  const navigate = useNavigate();
  const {
    loginWithYandex,
    loginWithEmail,
    registerWithEmail,
    completeOnboarding,
    needsOnboarding,
    isLoading,
  } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [onboardingErrors, setOnboardingErrors] = useState<{ name?: string; phone?: string }>({});
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  const [yandexLoading, setYandexLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailMode, setEmailMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  useEffect(() => {
    const oauthName = sessionStorage.getItem('oauth_user_name') || '';
    if (oauthName && needsOnboarding) setName(oauthName);
  }, [needsOnboarding]);

  const validateOnboarding = () => {
    const errs: { name?: string; phone?: string } = {};
    if (!name.trim() || name.trim().length < 2) errs.name = 'Введите имя или название студии (минимум 2 символа)';
    if (!isPhoneComplete(phone)) errs.phone = 'Введите полный номер телефона';
    setOnboardingErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleOnboardingSubmit = async () => {
    if (!validateOnboarding()) return;
    setOnboardingLoading(true);
    await completeOnboarding(name.trim(), phone.trim());
    setOnboardingLoading(false);
    navigate('/dashboard', { replace: true });
  };

  const handleYandex = async () => {
    setYandexLoading(true);
    try {
      await loginWithYandex();
    } catch (err: any) {
      console.error('Yandex login error:', err.message);
    } finally {
      setYandexLoading(false);
    }
  };

  const handleEmailSubmit = async () => {
    setEmailError('');
    setEmailSuccess('');
    if (!email.trim() || !password.trim()) return setEmailError('Заполните email и пароль');
    if (password.length < 6) return setEmailError('Пароль должен быть не менее 6 символов');

    setEmailLoading(true);

    if (emailMode === 'login') {
      const { error } = await loginWithEmail(email.trim(), password);
      if (error) {
        setEmailError(error.includes('Invalid') || error.includes('credentials') 
          ? 'Неверный email или пароль' 
          : 'Ошибка входа. Попробуйте снова.');
      }
    } else {
      const { error } = await registerWithEmail(email.trim(), password);
      if (error) {
        setEmailError('Этот email уже используется или ошибка регистрации');
      } else {
        setEmailSuccess(`Письмо с подтверждением отправлено на ${email}. После подтверждения войдите.`);
        setEmailMode('login');
      }
    }
    setEmailLoading(false);
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
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-amber-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <a href="#/" className="inline-flex items-center gap-2 mb-6">
            <Sparkles className="text-amber-400" size={24} />
            <span className="text-2xl font-bold text-white">Beauty<span className="text-emerald-400">SaaS</span></span>
          </a>
          <h1 className="text-3xl font-bold text-white mb-2">Добро пожаловать!</h1>
          <p className="text-gray-400">Войдите для управления записями</p>
        </div>

        <div className="bg-gray-900 rounded-3xl border border-white/8 p-8 shadow-2xl space-y-4">
          <button
            onClick={handleYandex}
            disabled={yandexLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#FC3F1D] hover:bg-[#e8391a] text-white font-semibold py-3.5 px-6 rounded-2xl transition-all active:scale-[0.97] disabled:opacity-60"
          >
            {yandexLoading ? <Loader2 size={20} className="animate-spin" /> : 'Войти через Яндекс'}
          </button>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-gray-600 text-xs">или</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <div>
            <button
              onClick={() => setShowEmailForm(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-white/10 hover:border-white/20 text-gray-400 hover:text-white text-sm font-medium transition-all"
            >
              <div className="flex items-center gap-2">
                <Mail size={16} />
                Войти через почту
              </div>
              <ChevronDown size={16} className={`transition-transform ${showEmailForm ? 'rotate-180' : ''}`} />
            </button>

            {showEmailForm && (
              <div className="mt-4 space-y-3">
                <div className="flex bg-gray-800 rounded-xl p-1">
                  <button
                    onClick={() => { setEmailMode('login'); setEmailError(''); setEmailSuccess(''); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${emailMode === 'login' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    Войти
                  </button>
                  <button
                    onClick={() => { setEmailMode('register'); setEmailError(''); setEmailSuccess(''); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${emailMode === 'register' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    Зарегистрироваться
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-3 pl-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                  />
                  <Mail size={16} className="absolute left-3.5 top-4 text-gray-500" />
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={emailMode === 'register' ? 'Придумайте пароль (мин. 6 символов)' : 'Ваш пароль'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-3 pl-10 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                  />
                  <Lock size={16} className="absolute left-3.5 top-4 text-gray-500" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-4 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {emailError && <div className="bg-red-900/30 border border-red-700/50 text-red-400 rounded-2xl px-4 py-3 text-sm">{emailError}</div>}
                {emailSuccess && <div className="bg-emerald-900/30 border border-emerald-700/50 text-emerald-400 rounded-2xl px-4 py-3 text-sm">{emailSuccess}</div>}

                <button
                  onClick={handleEmailSubmit}
                  disabled={emailLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 py-3 rounded-2xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {emailLoading ? <Loader2 className="animate-spin" size={20} /> : (emailMode === 'login' ? 'Войти' : 'Создать аккаунт')}
                  {!emailLoading && <ArrowRight size={18} />}
                </button>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500 text-center pt-4">
            Входя в систему, вы соглашаетесь с{' '}
            <a href="#/privacy" className="text-emerald-400 hover:text-emerald-300">политикой конфиденциальности</a>
          </p>
        </div>

        <div className="text-center mt-6">
          <a href="#/" className="text-gray-500 hover:text-gray-300 text-sm">← Вернуться на главную</a>
        </div>
      </div>

      <Modal isOpen={needsOnboarding} onClose={() => {}} title="Расскажите о себе">
        <div className="space-y-5">
          <p className="text-gray-400 text-sm">Это займёт 30 секунд. Эти данные будут использоваться в системе.</p>

          <div className="relative">
            <Input
              label="ФИО или название студии"
              placeholder="Ирина Козлова или Студия Beauty"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={onboardingErrors.name}
            />
            <User size={18} className="absolute right-4 top-[42px] text-gray-400 pointer-events-none" />
          </div>

          <div className="relative">
            <PhoneInput
              label="Номер телефона"
              value={phone}
              onChange={setPhone}
              error={onboardingErrors.phone}
            />
            <Phone size={18} className="absolute right-4 top-[42px] text-gray-400 pointer-events-none" />
          </div>

          <Button
            onClick={handleOnboardingSubmit}
            loading={onboardingLoading}
            disabled={!name.trim() || !isPhoneComplete(phone)}
            className="w-full mt-2"
            size="lg"
          >
            Завершить регистрацию и войти
            <ArrowRight size={18} />
          </Button>
        </div>
      </Modal>
    </div>
  );
}