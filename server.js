const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// ─── Токены двух ботов ────────────────────────────────────────
// TELEGRAM_NOTIFY_BOT_TOKEN  — бот уведомлений о записях
// TELEGRAM_SUPPORT_BOT_TOKEN — бот саппорта / оплаты PRO
const NOTIFY_BOT_TOKEN   = process.env.TELEGRAM_NOTIFY_BOT_TOKEN;
const SUPPORT_BOT_TOKEN  = process.env.TELEGRAM_SUPPORT_BOT_TOKEN;
const ADMIN_UUID         = process.env.ADMIN_UUID;

// ─── Supabase (service_role обходит RLS) ─────────────────────
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Проверяет, активна ли подписка мастера.
 * Premium  → true всегда
 * Триал    → true если с trial_start_date прошло ≤ 14 дней
 * Истёк    → false
 */
async function isMasterSubscriptionActive(masterId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_premium, trial_start_date')
      .eq('id', masterId)
      .single();

    if (error || !data) {
      console.warn(`[Notify] Профиль не найден ${masterId}:`, error?.message);
      return false;
    }

    if (data.is_premium) return true;

    if (!data.trial_start_date) return true; // новый пользователь

    const diffDays = Math.floor(
      (Date.now() - new Date(data.trial_start_date).getTime()) / 86_400_000
    );
    const active = diffDays <= 14;

    if (!active) {
      console.log(`[Notify] 🔕 Заблокировано для ${masterId} — триал истёк ${diffDays - 14} дн. назад`);
    }
    return active;
  } catch (err) {
    console.error('[Notify] Ошибка проверки подписки:', err);
    return false;
  }
}

/**
 * Отправляет сообщение через указанного бота.
 */
async function sendTelegramMessage(botToken, chatId, text, parseMode = 'Markdown') {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
    }
  );
  return res.json();
}

// ════════════════════════════════════════════════════════════════
// WEBHOOK — БОТ УВЕДОМЛЕНИЙ (/start привязывает telegram_id)
// ════════════════════════════════════════════════════════════════
app.post('/api/webhook/notify', async (req, res) => {
  res.sendStatus(200); // отвечаем Telegram сразу

  const message = req.body?.message;
  if (!message) return;

  const chatId   = message.chat?.id;
  const text     = message.text || '';
  const username = message.from?.username || '';
  const firstName = message.from?.first_name || 'Мастер';

  // Обработка /start <masterId>
  if (text.startsWith('/start')) {
    const parts    = text.split(' ');
    const masterId = parts[1]?.trim();

    if (!masterId) {
      await sendTelegramMessage(
        NOTIFY_BOT_TOKEN, chatId,
        `👋 Привет, ${firstName}!\n\nЭтот бот будет присылать вам уведомления о новых записях клиентов.\n\nДля привязки перейдите в панель управления BeautySaaS → Настройки → Telegram.`
      );
      return;
    }

    // Сохраняем telegram_id в профиль мастера
    const { error } = await supabase
      .from('profiles')
      .update({
        telegram_id:      String(chatId),
        telegram_chat_id: String(chatId),
      })
      .eq('id', masterId);

    if (error) {
      console.error('[Webhook/notify] Ошибка записи telegram_id:', error.message);
      await sendTelegramMessage(
        NOTIFY_BOT_TOKEN, chatId,
        '❌ Не удалось привязать аккаунт. Попробуйте ещё раз или обратитесь в поддержку.'
      );
      return;
    }

    await sendTelegramMessage(
      NOTIFY_BOT_TOKEN, chatId,
      `✅ *Аккаунт успешно привязан!*\n\n` +
      `Привет, ${firstName}! 👋\n\n` +
      `Теперь вы будете получать уведомления о каждой новой записи прямо сюда.\n\n` +
      `📱 Управляйте записями в панели BeautySaaS.`
    );

    console.log(`[Webhook/notify] ✅ Привязан telegram_id=${chatId} к мастеру ${masterId}`);
    return;
  }

  // Любое другое сообщение
  await sendTelegramMessage(
    NOTIFY_BOT_TOKEN, chatId,
    `ℹ️ Этот бот предназначен только для получения уведомлений о записях.\n\nПо всем вопросам: @beautysaas_support_bot`
  );
});

// ════════════════════════════════════════════════════════════════
// WEBHOOK — БОТ САППОРТА (вопросы, оплата PRO)
// ════════════════════════════════════════════════════════════════
app.post('/api/webhook/support', async (req, res) => {
  res.sendStatus(200);

  const message = req.body?.message;
  if (!message) return;

  const chatId    = message.chat?.id;
  const text      = message.text || '';
  const firstName = message.from?.first_name || 'Пользователь';

  if (text.startsWith('/start')) {
    await sendTelegramMessage(
      SUPPORT_BOT_TOKEN, chatId,
      `👋 Привет, ${firstName}!\n\n` +
      `Я бот поддержки *BeautySaaS*.\n\n` +
      `*Что я умею:*\n` +
      `• Отвечать на вопросы о платформе\n` +
      `• Помочь с переходом на PRO-тариф\n` +
      `• Решать технические проблемы\n\n` +
      `Напишите ваш вопрос — мы ответим в течение нескольких минут! 💚`
    );
    return;
  }

  if (text.startsWith('/pro') || text.toLowerCase().includes('про') || text.toLowerCase().includes('оплат')) {
    await sendTelegramMessage(
      SUPPORT_BOT_TOKEN, chatId,
      `⭐ *Тариф PRO — 990 ₽/месяц*\n\n` +
      `✅ Онлайн-запись 24/7\n` +
      `✅ Telegram-уведомления\n` +
      `✅ Полная аналитика выручки\n` +
      `✅ Неограниченные услуги\n` +
      `✅ Приоритетная поддержка\n\n` +
      `Для подключения напишите нам — мы активируем PRO вручную и свяжемся с вами для оплаты.`
    );
    return;
  }

  // Пересылаем сообщение администратору
  if (ADMIN_UUID) {
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('telegram_id, telegram_chat_id')
      .eq('id', ADMIN_UUID)
      .single();

    const adminChatId = adminProfile?.telegram_id || adminProfile?.telegram_chat_id;
    if (adminChatId) {
      await sendTelegramMessage(
        SUPPORT_BOT_TOKEN, adminChatId,
        `📨 *Новое сообщение в саппорт*\n\n` +
        `👤 От: ${firstName} (chat_id: ${chatId})\n` +
        `💬 Текст: ${text}`
      );
    }
  }

  await sendTelegramMessage(
    SUPPORT_BOT_TOKEN, chatId,
    `✅ Ваше сообщение получено! Мы ответим в ближайшее время.\n\n` +
    `⏱ Обычное время ответа: до 2 часов в рабочее время.`
  );
});

// ════════════════════════════════════════════════════════════════
// /api/send-notification — уведомление о новой записи клиента
// Блокируется если триал истёк и нет Premium
// ════════════════════════════════════════════════════════════════
app.post('/api/send-notification', async (req, res) => {
  const { telegram_id, booking } = req.body;

  if (!telegram_id) {
    return res.status(400).json({ success: false, error: 'telegram_id обязателен' });
  }

  if (!NOTIFY_BOT_TOKEN) {
    return res.status(500).json({ success: false, error: 'TELEGRAM_NOTIFY_BOT_TOKEN не настроен' });
  }

  // Проверяем подписку мастера
  const masterId = booking?.master_id;
  if (masterId) {
    const canNotify = await isMasterSubscriptionActive(masterId);
    if (!canNotify) {
      // Тихий успех — фронтенд не видит ошибки, клиент не знает о блокировке
      return res.json({ success: true, blocked: true, reason: 'trial_expired' });
    }
  }

  const text = [
    '📅 *Новая запись!*',
    '',
    `👤 *Клиент:* ${booking?.clientName   || '—'}`,
    `📞 *Телефон:* ${booking?.clientPhone  || '—'}`,
    `💆 *Услуга:* ${booking?.serviceName   || '—'}`,
    `🗓 *Дата:* ${booking?.date            || '—'}`,
    `⏰ *Время:* ${booking?.time           || '—'}`,
  ].join('\n');

  try {
    const result = await sendTelegramMessage(NOTIFY_BOT_TOKEN, telegram_id, text);

    if (!result.ok) {
      console.error('[Notify] Telegram error:', result.description);
      return res.status(500).json({ success: false, error: result.description });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[Notify] Ошибка отправки:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// /api/broadcast — рассылка администратора
// НЕ блокируется по подписке — только проверка admin_id
// ════════════════════════════════════════════════════════════════
app.post('/api/broadcast', async (req, res) => {
  const { admin_id, message, targets } = req.body;

  if (!ADMIN_UUID || admin_id !== ADMIN_UUID) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!message || !Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ error: 'Некорректный запрос' });
  }

  if (!SUPPORT_BOT_TOKEN) {
    return res.status(500).json({ error: 'TELEGRAM_SUPPORT_BOT_TOKEN не настроен' });
  }

  let sent = 0;
  const errors = [];

  for (const target of targets) {
    const chatId = String(target.telegram_id || '').trim();
    if (!chatId) continue;

    try {
      const result = await sendTelegramMessage(
        SUPPORT_BOT_TOKEN,
        chatId,
        `📢 *Объявление от BeautySaaS*\n\n${message}`
      );

      if (result.ok) {
        sent++;
      } else {
        errors.push({ id: target.id, error: result.description });
        console.warn(`[Broadcast] Не доставлено ${target.id}:`, result.description);
      }
    } catch (err) {
      errors.push({ id: target.id, error: err.message });
    }
  }

  console.log(`[Broadcast] ✅ ${sent}/${targets.length}`);
  return res.json({ success: true, sent, total: targets.length, errors });
});

// ════════════════════════════════════════════════════════════════
// /api/set-webhook — регистрация вебхуков обоих ботов
// Вызови один раз: POST /api/set-webhook?secret=ADMIN_UUID
// ════════════════════════════════════════════════════════════════
app.post('/api/set-webhook', async (req, res) => {
  const { secret } = req.query;
  if (secret !== ADMIN_UUID) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.PUBLIC_URL;

  if (!baseUrl) {
    return res.status(500).json({ error: 'PUBLIC_URL или RAILWAY_PUBLIC_DOMAIN не задан' });
  }

  const results = {};

  // Webhook для бота уведомлений
  if (NOTIFY_BOT_TOKEN) {
    const r = await fetch(
      `https://api.telegram.org/bot${NOTIFY_BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${baseUrl}/api/webhook/notify` }),
      }
    );
    results.notify = await r.json();
  }

  // Webhook для бота саппорта
  if (SUPPORT_BOT_TOKEN) {
    const r = await fetch(
      `https://api.telegram.org/bot${SUPPORT_BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `${baseUrl}/api/webhook/support` }),
      }
    );
    results.support = await r.json();
  }

  console.log('[Webhook] Результат:', results);
  return res.json({ success: true, results });
});

// ════════════════════════════════════════════════════════════════
// Статика React
// ════════════════════════════════════════════════════════════════
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ BeautySaaS server running on port ${PORT}`);
});