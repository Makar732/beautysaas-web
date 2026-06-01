import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, Shield } from 'lucide-react';
import { Button } from '../components/ui/Button';

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-white/5 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a href="#/" className="flex items-center gap-2">
            <Sparkles className="text-amber-400" size={20} />
            <span className="font-bold">Beauty<span className="text-emerald-400">SaaS</span></span>
          </a>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="!text-gray-400 !hover:text-white">
            <ArrowLeft size={16} />
            Назад
          </Button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-emerald-900/40 p-3 rounded-2xl">
            <Shield className="text-emerald-400" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Политика конфиденциальности</h1>
            <p className="text-gray-400 text-sm mt-1">Последнее обновление: 1 января 2026 г.</p>
          </div>
        </div>

        <div className="prose prose-invert max-w-none space-y-8">
          <section className="bg-gray-900 rounded-2xl border border-white/5 p-6">
            <h2 className="text-xl font-bold mb-3 text-emerald-400">1. Общие положения</h2>
            <p className="text-gray-300 leading-relaxed text-sm">
              Настоящая Политика конфиденциальности определяет порядок обработки и защиты персональных данных
              пользователей платформы BeautySaaS (далее — «Платформа», «Оператор»).
              Использование Платформы означает безоговорочное согласие пользователя с настоящей Политикой
              и указанными в ней условиями обработки персональных данных.
              В случае несогласия с условиями, пользователь должен воздержаться от использования Платформы.
            </p>
          </section>

          <section className="bg-gray-900 rounded-2xl border border-white/5 p-6">
            <h2 className="text-xl font-bold mb-3 text-emerald-400">2. Персональные данные, которые мы собираем</h2>
            <p className="text-gray-300 leading-relaxed text-sm mb-3">
              Оператор может собирать следующие категории персональных данных:
            </p>
            <ul className="space-y-2 text-sm text-gray-300">
              {[
                'Имя и фамилия пользователя (мастера или клиента)',
                'Номер телефона для связи',
                'Telegram Chat ID для отправки уведомлений (по желанию)',
                'История записей и оказанных услуг',
                'Технические данные: IP-адрес, тип браузера, данные сессии',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-gray-900 rounded-2xl border border-white/5 p-6">
            <h2 className="text-xl font-bold mb-3 text-emerald-400">3. Цели обработки персональных данных</h2>
            <p className="text-gray-300 leading-relaxed text-sm mb-3">
              Персональные данные обрабатываются в следующих целях:
            </p>
            <ul className="space-y-2 text-sm text-gray-300">
              {[
                'Предоставление доступа к функциям онлайн-записи',
                'Отправка уведомлений о записях через Telegram Bot API',
                'Формирование расписания мастера',
                'Техническая поддержка пользователей',
                'Улучшение качества и функциональности Платформы',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-gray-900 rounded-2xl border border-white/5 p-6">
            <h2 className="text-xl font-bold mb-3 text-emerald-400">4. Хранение данных</h2>
            <p className="text-gray-300 leading-relaxed text-sm">
              В демонстрационном режиме все данные хранятся исключительно в localStorage вашего браузера
              и не передаются на серверы третьих лиц. Данные автоматически удаляются при очистке кэша браузера.
              При подключении режима Supabase данные хранятся на защищённых серверах согласно политике
              конфиденциальности Supabase (supabase.com/privacy).
            </p>
          </section>

          <section className="bg-gray-900 rounded-2xl border border-white/5 p-6">
            <h2 className="text-xl font-bold mb-3 text-emerald-400">5. Передача персональных данных третьим лицам</h2>
            <p className="text-gray-300 leading-relaxed text-sm">
              Оператор не передаёт персональные данные пользователей третьим лицам за исключением случаев,
              прямо предусмотренных законодательством Российской Федерации. Уведомления через Telegram Bot API
              отправляются исключительно по запросу пользователя и только указанному им Chat ID.
            </p>
          </section>

          <section className="bg-gray-900 rounded-2xl border border-white/5 p-6">
            <h2 className="text-xl font-bold mb-3 text-emerald-400">6. Права пользователя</h2>
            <p className="text-gray-300 leading-relaxed text-sm mb-3">
              Пользователь имеет право:
            </p>
            <ul className="space-y-2 text-sm text-gray-300">
              {[
                'Получить информацию об обработке его персональных данных',
                'Требовать исправления неточных персональных данных',
                'Требовать удаления своих персональных данных',
                'Отозвать согласие на обработку персональных данных',
                'Обжаловать действия Оператора в уполномоченном органе',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-gray-900 rounded-2xl border border-white/5 p-6">
            <h2 className="text-xl font-bold mb-3 text-emerald-400">7. Соответствие законодательству</h2>
            <p className="text-gray-300 leading-relaxed text-sm">
              Обработка персональных данных осуществляется в соответствии с Федеральным законом
              от 27.07.2006 № 152-ФЗ «О персональных данных» и иными нормативными правовыми актами
              Российской Федерации в области защиты персональных данных.
            </p>
          </section>

          <section className="bg-gray-900 rounded-2xl border border-white/5 p-6">
            <h2 className="text-xl font-bold mb-3 text-emerald-400">8. Контакты</h2>
            <p className="text-gray-300 leading-relaxed text-sm">
              По всем вопросам, связанным с обработкой персональных данных, обращайтесь:
            </p>
            <div className="mt-3 space-y-1 text-sm">
              <p className="text-gray-300">
                Telegram: <a href="https://t.me/beautysaas_support" className="text-emerald-400 hover:text-emerald-300 transition-colors">@beautysaas_support</a>
              </p>
              <p className="text-gray-300">
                © 2026 BeautySaaS. Все права защищены.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
