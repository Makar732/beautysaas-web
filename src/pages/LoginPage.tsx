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
    user,
    loginWithYandex,
    loginWithVK,
    loginWithEmail,
    registerWithEmail,
    completeOnboarding,
    needsOnboarding,
  } = useAuth();

  // Онбординг
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [onboardingErrors, setOnboardingErrors] = useState<{ name?: string; phone?: string }>({});
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  // OAuth загрузка
  const [yandexLoading, setYandexLoading] = useState(false);
  const [vkLoading, setVkLoading] = useState(false);

  // Email-форма
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailMode, setEmailMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  // Редирект если уже залогинен
  useEffect(() => {
    if (user && !needsOnboarding) {
      navigate('/dashboard');
    }
  }, [user, needsOnboarding, navigate]);

  // Подставляем имя из OAuth если есть
  useEffect(() => {
    const oauthName =
      sessionStorage.getItem('oauth_user_name') ||
      sessionStorage.getItem('google_user_name') ||
      '';
    if (oauthName && needsOnboarding) {
      setName(oauthName);
    }
  }, [needsOnboarding]);

  // ---- ОНБОРДИНГ ----
  const validateOnboarding = () => {
    const errs: { name?: string; phone?: string } = {};
    if (!name.trim() || name.trim().length < 2) {
      errs.name = 'Введите имя или название студии (минимум 2 символа)';
    }
    if (!isPhoneComplete(phone)) {
      errs.phone = 'Введите полный номер телефона';
    }
    setOnboardingErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleOnboardingSubmit = async () => {
    if (!validateOnboarding()) return;
    setOnboardingLoading(true);
    await completeOnboarding(name.trim(), phone.trim());
    setOnboardingLoading(false);
    navigate('/dashboard');
  };

  const isOnboardingValid = name.trim().length >= 2 && isPhoneComplete(phone);

  // ---- OAUTH ----
  const handleYandex = async () => {
    setYandexLoading(true);
    await loginWithYandex();
    setYandexLoading(false);
  };

  const handleVK = async () => {
    setVkLoading(true);
    await loginWithVK();
    setVkLoading(false);
  };

  // ---- EMAIL ----
  const handleEmailSubmit = async () => {
    setEmailError('');
    setEmailSuccess('');

    if (!email.trim() || !password.trim()) {
      setEmailError('Заполните email и пароль');
      return;
    }
    if (password.length < 6) {
      setEmailError('Пароль должен быть не менее 6 символов');
      return;
    }

    setEmailLoading(true);

    if (emailMode === 'login') {
      const { error } = await loginWithEmail(email.trim(), password);
      if (error) {
        // Переводим типичные ошибки Supabase на русский
        if (error.includes('Invalid login credentials')) {
          setEmailError('Неверный email или пароль');
        } else if (error.includes('Email not confirmed')) {
          setEmailError('Подтвердите email — письмо отправлено при регистрации');
        } else {
          setEmailError('Ошибка входа. Проверьте данные и попробуйте снова.');
        }
      }
    } else {
      const { error } = await registerWithEmail(email.trim(), password);
      if (error) {
        if (error.includes('already registered') || error.includes('User already registered')) {
          setEmailError('Этот email уже зарегистрирован. Попробуйте войти.');
        } else if (error.includes('Password should be')) {
          setEmailError('Пароль слишком простой. Минимум 6 символов.');
        } else {
          setEmailError('Ошибка регистрации. Попробуйте снова.');
        }
      } else {
        setEmailSuccess(
          'Письмо с подтверждением отправлено на ' + email +
          '. Перейдите по ссылке в письме, затем войдите.'
        );
        setEmailMode('login');
      }
    }

    setEmailLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none">
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
          <p className="text-gray-400">Войдите для управления записями</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 rounded-3xl border border-white/8 p-8 shadow-2xl space-y-4">

          {/* ---- ЯНДЕКС ---- */}
          <button
            onClick={handleYandex}
            disabled={yandexLoading || vkLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#FC3F1D] hover:bg-[#e8391a] active:bg-[#d43518] text-white font-semibold py-3.5 px-6 rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-red-900/20"
          >
            {yandexLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              /* Яндекс «Y» логотип */
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="12" fill="white" fillOpacity="0.15"/>
                <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="bold" fill="white" fontFamily="Arial">Я</text>
              </svg>
            )}
            {yandexLoading ? 'Переходим к Яндексу...' : 'Войти через Яндекс'}
          </button>

          {/* ---- VK ---- */}
          <button
            onClick={handleVK}
            disabled={yandexLoading || vkLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#0077FF] hover:bg-[#006be0] active:bg-[#005ec7] text-white font-semibold py-3.5 px-6 rounded-2xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
          >
            {vkLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              /* VK логотип */
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.523-2.049-1.712-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.560c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4 8.983 4 8.577c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.847 2.456 2.270 4.608 2.855 4.608.22 0 .322-.102.322-.660V9.736c-.068-1.186-.695-1.287-.695-1.710 0-.203.169-.407.44-.407h2.745c.373 0 .508.203.508.643v3.473c0 .373.169.508.271.508.22 0 .407-.135.813-.542 1.254-1.406 2.152-3.575 2.152-3.575.118-.254.322-.491.762-.491h1.744c.525 0 .644.271.525.643-.22 1.017-2.355 4.031-2.355 4.031-.186.305-.254.44 0 .779.186.254.796.779 1.203 1.253.745.847 1.321 1.558 1.473 2.050.17.49-.085.745-.576.745z"/>
              </svg>
            )}
            {vkLoading ? 'Переходим к VK...' : 'Войти через VK'}
          </button>

          {/* Разделитель */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-gray-600 text-xs">или</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {/* ---- EMAIL-ФОРМА (раскрывающаяся) ---- */}
          <div>
            <button
              onClick={() => setShowEmailForm(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-white/10 hover:border-white/20 text-gray-400 hover:text-white text-sm font-medium transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Mail size={16} />
                Войти через почту
              </div>
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 ${showEmailForm ? 'rotate-180' : ''}`}
              />
            </button>

            {showEmailForm && (
              <div className="mt-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                {/* Переключатель Войти / Зарегистрироваться */}
                <div className="flex bg-gray-800 rounded-xl p-1">
                  <button
                    onClick={() => { setEmailMode('login'); setEmailError(''); setEmailSuccess(''); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      emailMode === 'login'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Войти
                  </button>
                  <button
                    onClick={() => { setEmailMode('register'); setEmailError(''); setEmailSuccess(''); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                      emailMode === 'register'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Зарегистрироваться
                  </button>
                </div>

                {/* Email */}
                <div className="relative">
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setEmailError(''); }}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-3 pl-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                  <Mail size={15} className="absolute left-3 top-3.5 text-gray-600 pointer-events-none" />
                </div>

                {/* Пароль */}
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={emailMode === 'register' ? 'Придумайте пароль (мин. 6 символов)' : 'Ваш пароль'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setEmailError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-3 pl-10 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                  <Lock size={15} className="absolute left-3 top-3.5 text-gray-600 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-3 text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Ошибка */}
                {emailError && (
                  <div className="bg-red-900/30 border border-red-700/40 rounded-xl px-4 py-3 text-sm text-red-400">
                    {emailError}
                  </div>
                )}

                {/* Успех регистрации */}
                {emailSuccess && (
                  <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl px-4 py-3 text-sm text-emerald-400">
                    {emailSuccess}
                  </div>
                )}

                {/* Кнопка отправки */}
                <button
                  onClick={handleEmailSubmit}
                  disabled={emailLoading}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                >
                  {emailLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      {emailMode === 'login' ? 'Войти' : 'Создать аккаунт'}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Соглашение */}
          <p className="text-xs text-gray-600 text-center pt-2">
            Входя в систему, вы соглашаетесь с{' '}
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

      {/* ===== ОНБОРДИНГ МОДАЛ (после первого входа) ===== */}
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
              label="ФИО или название студии"
              placeholder="Например: Ирина Козлова или Студия Beauty"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={onboardingErrors.name}
            />
            <User size={16} className="absolute right-4 top-10 text-gray-400 pointer-events-none" />
          </div>

          <div className="relative">
            <PhoneInput
              label="Номер телефона"
              value={phone}
              onChange={setPhone}
              error={onboardingErrors.phone}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none bg-white text-gray-900"
            />
            <Phone size={16} className="absolute right-4 top-10 text-gray-400 pointer-events-none" />
          </div>

          {name.trim().length >= 2 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs text-emerald-700">
                Ваша ссылка для записи клиентов:{' '}
                <span className="font-mono font-bold">
                  /book/{name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zа-яё-]/gi, '')}
                </span>
              </p>
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            className="w-full mt-2"
            onClick={handleOnboardingSubmit}
            loading={onboardingLoading}
            disabled={!isOnboardingValid}
          >
            Создать профиль и войти
            <ArrowRight size={18} />
          </Button>
        </div>
      </Modal>
    </div>
  );
}