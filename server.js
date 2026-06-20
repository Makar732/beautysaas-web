import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { handleSupportUpdate, registerSupportBotWebhook } from './supportBot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ════════════════════════════════════════════════════════════════
// КОНФИГ
// ════════════════════════════════════════════════════════════════

const NOTIFY_BOT_TOKEN = process.env.TELEGRAM_NOTIFY_BOT_TOKEN
  || process.env.TELEGRAM_BOT_TOKEN
  || '';

const SUPPORT_BOT_TOKEN = process.env.TELEGRAM_SUPPORT_BOT_TOKEN
  || process.env.TELEGRAM_BOT_TOKEN
  || '';

const ADMIN_UUID    = process.env.ADMIN_UUID || '';
const SUPABASE_URL  = process.env.VITE_SUPABASE_URL || '';

const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ════════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ════════════════════════════════════════════════════════════════

function isTrialExpired(trialStartDate) {
  if (!trialStartDate) return false;
  const diffDays = Math.floor(
    (Date.now() - new Date(trialStartDate).getTime()) / 86_400_000
  );
  return diffDays >= 14;
}

async function sendTelegramMessage(botToken, chatId, text, extra = {}) {
  if (!botToken) {
    console.error('❌ Токен бота не задан');
    return false;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          ...extra,
        }),
      }
    );
    const data = await res.json();
    if (!data.ok) {
      console.error('❌ Telegram API error:', data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error('❌ Сетевая ошибка Telegram:', err);
    return false;
  }
}

async function isMasterSubscriptionActive(masterId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_premium, trial_start_date')
      .eq('id', masterId)
      .single();

    if (error || !data) {
      console.warn(`[Subscription] Профиль не найден: ${masterId}`);
      return false;
    }

    if (data.is_premium) return true;
    if (!data.trial_start_date) return true;

    const active = !isTrialExpired(data.trial_start_date);
    if (!active) {
      const daysPast = Math.floor(
        (Date.now() - new Date(data.trial_start_date).getTime()) / 86_400_000
      ) - 14;
      console.log(`[Subscription] 🔕 Заблокировано для ${masterId} — триал истёк ${daysPast} дн. назад`);
    }
    return active;
  } catch (err) {
    console.error('[Subscription] Ошибка:', err);
    return false;
  }
}

async function sendTrialExpiredNotification(chatId, masterName) {
  const text =
    `⚠️ <b>${masterName}</b>, ваш 14-дневный пробный период BeautySaaS завершён.\n\n` +
    `Чтобы продолжать получать уведомления в Telegram и видеть аналитику — ` +
    `активируйте тариф <b>ПРО</b>.\n\n` +
    `👉 Напишите нам: @beautysaas_support_bot`;

  return sendTelegramMessage(NOTIFY_BOT_TOKEN, chatId, text);
}

async function checkAndSendReminders() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  console.log(`🔔 Напоминания на: ${tomorrowStr}`);

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, master_id, service_name, time, client_tg_chat_id, client_name')
    .eq('date', tomorrowStr)
    .neq('status', 'cancelled')
    .neq('client_tg_chat_id', '')
    .not('client_tg_chat_id', 'is', null);

  if (error) {
    console.error('❌ Ошибка запроса напоминаний:', error);
    return { sent: 0, error: error.message };
  }

  if (!appointments?.length) {
    console.log('✅ Нет записей с Telegram на завтра');
    return { sent: 0 };
  }

  console.log(`📨 Записей для напоминания: ${appointments.length}`);

  const masterIds = [...new Set(appointments.map(a => a.master_id))];
  const { data: masters } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', masterIds);

  const masterMap = {};
  masters?.forEach(m => { masterMap[m.id] = m.name; });

  let sent = 0;
  for (const appt of appointments) {
    const masterName = masterMap[appt.master_id] || 'мастера';
    const [year, month, day] = appt.date.split('-').map(Number);
    const dateFormatted = new Date(year, month - 1, day).toLocaleDateString('ru-RU', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    const text =
      `⏰ <b>Напоминание о визите!</b>\n\n` +
      `Привет, <b>${appt.client_name}</b>! 👋\n\n` +
      `Завтра вы записаны:\n` +
      `✨ <b>Услуга:</b> ${appt.service_name}\n` +
      `👩‍🎨 <b>Мастер:</b> ${masterName}\n` +
      `📅 <b>Дата:</b> ${dateFormatted}\n` +
      `🕐 <b>Время:</b> ${appt.time}\n\n` +
      `Ждём вас! 💅`;

    const ok = await sendTelegramMessage(NOTIFY_BOT_TOKEN, appt.client_tg_chat_id, text);
    if (ok) {
      sent++;
      console.log(`✅ Напоминание отправлено (запись ${appt.id})`);
    } else {
      console.warn(`⚠️ Не удалось отправить (запись ${appt.id})`);
    }
  }

  return { sent, total: appointments.length };
}

// ════════════════════════════════════════════════════════════════
// ПРОКСИ: фронтенд → /supabase-proxy/* → supabase.co
// Решает проблему блокировки Supabase через ТСПУ/РКН в РФ
// Логику авторизации и онбординга НЕ затрагивает
// ════════════════════════════════════════════════════════════════
app.use('/supabase-proxy', async (req, res) => {
  const targetBase = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');

  if (!targetBase) {
    console.error('❌ [proxy] VITE_SUPABASE_URL не задан');
    return res.status(500).json({ error: 'Proxy not configured' });
  }

  const targetPath = req.originalUrl.replace('/supabase-proxy', '');
  const targetUrl  = `${targetBase}${targetPath}`;

  console.log(`[proxy] ${req.method} ${targetUrl}`);

  try {
    const headersToForward = {};
    const skipHeaders = new Set([
      'host',
      'connection',
      'transfer-encoding',
      'content-length',
    ]);

    for (const [key, value] of Object.entries(req.headers)) {
      if (!skipHeaders.has(key.toLowerCase())) {
        headersToForward[key] = value;
      }
    }

    const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());

    const proxyResponse = await fetch(targetUrl, {
      method:  req.method,
      headers: headersToForward,
      body:    hasBody ? JSON.stringify(req.body) : undefined,
    });

    res.status(proxyResponse.status);

    const skipResponseHeaders = new Set([
      'transfer-encoding',
      'connection',
    ]);

    for (const [key, value] of proxyResponse.headers.entries()) {
      if (!skipResponseHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    const responseBody = await proxyResponse.arrayBuffer();
    res.send(Buffer.from(responseBody));

  } catch (err) {
    console.error('❌ [proxy] Ошибка проксирования:', err);
    res.status(502).json({ error: 'Proxy error', detail: String(err) });
  }
});

// ════════════════════════════════════════════════════════════════
// API: Уведомление мастеру о новой записи клиента
// ════════════════════════════════════════════════════════════════
app.post('/api/send-notification', async (req, res) => {
  const { telegram_id, booking } = req.body;

  if (!telegram_id || !booking) {
    return res.status(400).json({ error: 'Missing telegram_id or booking data' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_premium, trial_start_date, name, id')
    .eq('telegram_id', String(telegram_id))
    .single();

  if (!profileError && profile) {
    const isPremium = profile.is_premium || false;
    const trialExpired = isTrialExpired(profile.trial_start_date);

    if (!isPremium && trialExpired) {
      console.log(`🔒 Уведомление заблокировано для ${profile.name}: триал истёк`);
      return res.json({ success: true, blocked: true, reason: 'trial_expired' });
    }
  }

  if ((profileError || !profile) && booking?.master_id) {
    const canNotify = await isMasterSubscriptionActive(booking.master_id);
    if (!canNotify) {
      return res.json({ success: true, blocked: true, reason: 'trial_expired' });
    }
  }

  const text =
    `🌸 <b>Новая запись!</b> 💅\n\n` +
    `👤 <b>Клиент:</b> ${booking.clientName || '—'}\n` +
    `📞 <b>Телефон:</b> ${booking.clientPhone || '—'}\n` +
    `✨ <b>Услуга:</b> ${booking.serviceName || '—'}\n` +
    `📅 <b>Дата:</b> ${booking.date || '—'}\n` +
    `🕐 <b>Время:</b> ${booking.time || '—'}\n\n` +
    `<i>Уведомление от BeautySaaS</i>`;

  const success = await sendTelegramMessage(NOTIFY_BOT_TOKEN, telegram_id, text);

  return success
    ? res.json({ success: true })
    : res.status(500).json({ error: 'Failed to send Telegram notification' });
});

// ════════════════════════════════════════════════════════════════
// API: Рассылка от администратора
// ════════════════════════════════════════════════════════════════
app.post('/api/broadcast', async (req, res) => {
  const { admin_id, message, targets } = req.body;

  if (!ADMIN_UUID || admin_id !== ADMIN_UUID) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!message || !Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  if (!SUPPORT_BOT_TOKEN) {
    return res.status(500).json({ error: 'TELEGRAM_SUPPORT_BOT_TOKEN не настроен' });
  }

  let sent = 0;
  const errors = [];

  for (const target of targets) {
    const chatId = String(target.telegram_id || '').trim();
    if (!chatId) continue;

    const text =
      `📢 <b>Объявление от BeautySaaS</b>\n\n${message}`;

    const ok = await sendTelegramMessage(SUPPORT_BOT_TOKEN, chatId, text);
    if (ok) {
      sent++;
    } else {
      errors.push({ id: target.id, error: 'Telegram API error' });
    }
  }

  console.log(`[Broadcast] ✅ ${sent}/${targets.length}`);
  return res.json({ success: true, sent, total: targets.length, errors });
});

// ════════════════════════════════════════════════════════════════
// API: Уведомление мастера САЛОНА о новой записи
// ════════════════════════════════════════════════════════════════
app.post('/api/notify-salon-master', async (req, res) => {
  const { salon_master_id, booking } = req.body;

  if (!salon_master_id || !booking) {
    return res.status(400).json({ error: 'Missing salon_master_id or booking' });
  }

  const { data: salonMaster, error } = await supabase
    .from('salon_masters')
    .select('id, name, telegram_chat_id, director_id')
    .eq('id', salon_master_id)
    .single();

  if (error || !salonMaster) {
    console.warn(`[notify-salon-master] Мастер не найден: ${salon_master_id}`);
    return res.status(404).json({ error: 'Salon master not found' });
  }

  if (!salonMaster.telegram_chat_id) {
    console.log(`[notify-salon-master] У мастера ${salonMaster.name} нет Telegram`);
    return res.json({ success: true, skipped: true, reason: 'no_telegram' });
  }

  const canNotify = await isMasterSubscriptionActive(salonMaster.director_id);
  if (!canNotify) {
    console.log(`[notify-salon-master] Директор ${salonMaster.director_id} — подписка истекла`);
    return res.json({ success: true, blocked: true, reason: 'trial_expired' });
  }

  const text =
    `🌸 <b>Новая запись для вас!</b>\n\n` +
    `👤 <b>Клиент:</b> ${booking.clientName  || '—'}\n` +
    `📞 <b>Телефон:</b> ${booking.clientPhone || '—'}\n` +
    `✨ <b>Услуга:</b> ${booking.serviceName  || '—'}\n` +
    `📅 <b>Дата:</b> ${booking.date           || '—'}\n` +
    `🕐 <b>Время:</b> ${booking.time          || '—'}\n\n` +
    `<i>Уведомление от BeautySaaS 💅</i>`;

  const success = await sendTelegramMessage(
    NOTIFY_BOT_TOKEN,
    salonMaster.telegram_chat_id,
    text
  );

  return success
    ? res.json({ success: true })
    : res.status(500).json({ error: 'Failed to send Telegram notification' });
});

// ════════════════════════════════════════════════════════════════
// API: Рассылка напоминаний клиентам (cron)
// ════════════════════════════════════════════════════════════════
app.post('/api/send-reminders', async (req, res) => {
  console.log('📬 Рассылка напоминаний...');
  const result = await checkAndSendReminders();
  res.json(result);
});

// ════════════════════════════════════════════════════════════════
// API: Проверка истечения триалов → уведомление мастерам
// ════════════════════════════════════════════════════════════════
app.post('/api/check-trial-expiry', async (req, res) => {
  const now = new Date();
  const expiryDate = new Date(now);
  expiryDate.setDate(expiryDate.getDate() - 14);
  const dateStr = expiryDate.toISOString().split('T')[0];

  const dateFrom = `${dateStr}T00:00:00.000Z`;
  const dateTo   = `${dateStr}T23:59:59.999Z`;

  console.log(`🔍 Триалы за: ${dateFrom} — ${dateTo}`);

  const { data: expiredMasters, error } = await supabase
    .from('profiles')
    .select('id, name, telegram_id, trial_start_date, is_premium')
    .eq('is_premium', false)
    .gte('trial_start_date', dateFrom)
    .lte('trial_start_date', dateTo);

  if (error) {
    console.error('❌ Ошибка запроса триалов:', error);
    return res.status(500).json({ error: 'Database error' });
  }

  if (!expiredMasters?.length) {
    console.log('✅ Нет мастеров с истёкшим триалом сегодня');
    return res.json({ sent: 0 });
  }

  let sent = 0;
  for (const master of expiredMasters) {
    if (!master.telegram_id) continue;
    const ok = await sendTrialExpiredNotification(master.telegram_id, master.name);
    if (ok) {
      sent++;
      console.log(`✅ Уведомление об окончании триала: ${master.name}`);
    }
  }

  return res.json({ sent, total: expiredMasters.length });
});

// ════════════════════════════════════════════════════════════════
// WEBHOOK: Бот уведомлений (NOTIFY_BOT_TOKEN)
// ════════════════════════════════════════════════════════════════
app.post('/webhook/telegram', async (req, res) => {
  res.sendStatus(200);

  try {
    const update = req.body;
    if (!update.message?.text) return;

    const chatId    = update.message.chat.id;
    const text      = update.message.text.trim();
    const firstName = update.message.from?.first_name || 'Пользователь';

    console.log(`📩 [notify-bot] chat_id=${chatId}: ${text}`);

    if (!text.startsWith('/start')) {
      await sendTelegramMessage(
        NOTIFY_BOT_TOKEN, chatId,
        `ℹ️ Этот бот предназначен только для уведомлений о записях.\n\n` +
        `По всем вопросам: @beautysaas_support_bot`
      );
      return;
    }

    const parts = text.split(' ');
    const param = parts[1]?.trim() || '';

    // ── КЛИЕНТСКИЙ СЦЕНАРИЙ: /start appt_<bookingId> ──────────
    if (param.startsWith('appt_')) {
      const bookingId = param.replace('appt_', '');
      console.log(`🎯 Клиент, booking: ${bookingId}`);

      const { data: appointment, error: apptError } = await supabase
        .from('appointments')
        .select('id, service_name, date, time, master_id, client_name')
        .eq('id', bookingId)
        .single();

      if (apptError || !appointment) {
        console.error('❌ Запись не найдена:', bookingId);
        await sendTelegramMessage(
          NOTIFY_BOT_TOKEN, chatId,
          `❌ Не удалось найти вашу запись.\n\n` +
          `Возможно, ссылка устарела. Обратитесь к мастеру напрямую.`
        );
        return;
      }

      const { data: masterProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', appointment.master_id)
        .single();

      const masterName = masterProfile?.name || 'мастера';

      const { error: updateError } = await supabase
        .from('appointments')
        .update({ client_tg_chat_id: String(chatId) })
        .eq('id', bookingId);

      if (updateError) {
        console.error('❌ Ошибка сохранения client_tg_chat_id:', updateError);
        await sendTelegramMessage(
          NOTIFY_BOT_TOKEN, chatId,
          `❌ Произошла ошибка. Попробуйте позже.`
        );
        return;
      }

      const [year, month, day] = appointment.date.split('-').map(Number);
      const dateFormatted = new Date(year, month - 1, day).toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long',
      });

      console.log(`✅ Напоминание подключено для клиента (запись ${bookingId})`);

      await sendTelegramMessage(
        NOTIFY_BOT_TOKEN, chatId,
        `🎉 <b>Напоминание включено!</b>\n\n` +
        `Я пришлю уведомление за день до вашего визита.\n\n` +
        `📋 <b>Детали записи:</b>\n` +
        `✨ <b>Услуга:</b> ${appointment.service_name}\n` +
        `👩‍🎨 <b>Мастер:</b> ${masterName}\n` +
        `📅 <b>Дата:</b> ${dateFormatted}\n` +
        `🕐 <b>Время:</b> ${appointment.time}\n\n` +
        `До встречи! 💅`
      );
      return;
    }

    // ── СЦЕНАРИЙ МАСТЕРА САЛОНА: /start sm_<...> ──────────────
    if (param && param.startsWith('sm_')) {
      const linkCode = param;
      console.log(`🎯 Онбординг мастера салона, link_code: ${linkCode}`);

      const { data: salonMaster, error: smError } = await supabase
        .from('salon_masters')
        .select('id, name, director_id, telegram_chat_id, link_code')
        .eq('link_code', linkCode)
        .single();

      if (smError || !salonMaster) {
        console.error('❌ Мастер салона не найден по link_code:', linkCode);
        await sendTelegramMessage(
          NOTIFY_BOT_TOKEN, chatId,
          `❌ <b>Ссылка недействительна</b>\n\n` +
          `Попросите директора салона прислать новую ссылку для привязки.`
        );
        return;
      }

      if (salonMaster.telegram_chat_id &&
          salonMaster.telegram_chat_id === String(chatId)) {
        await sendTelegramMessage(
          NOTIFY_BOT_TOKEN, chatId,
          `✅ <b>Вы уже подключены!</b>\n\n` +
          `Уведомления о ваших записях будут приходить сюда автоматически.`
        );
        return;
      }

      const { error: updateError } = await supabase
        .from('salon_masters')
        .update({ telegram_chat_id: String(chatId) })
        .eq('id', salonMaster.id);

      if (updateError) {
        console.error('❌ Ошибка привязки telegram_chat_id:', updateError);
        await sendTelegramMessage(
          NOTIFY_BOT_TOKEN, chatId,
          `❌ Произошла ошибка. Попробуйте позже.`
        );
        return;
      }

      const { data: director } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', salonMaster.director_id)
        .single();

      const directorName = director?.name || 'директора';

      console.log(
        `✅ Мастер салона привязан: ${salonMaster.name} ` +
        `(${salonMaster.id}), chat_id=${chatId}`
      );

      await sendTelegramMessage(
        NOTIFY_BOT_TOKEN, chatId,
        `🎉 <b>Готово, ${salonMaster.name}!</b>\n\n` +
        `Вы успешно подключены к салону <b>${directorName}</b>.\n\n` +
        `Теперь вы будете получать уведомления о каждой записи, ` +
        `назначенной на вас, прямо сюда.\n\n` +
        `📲 Как только появится новая запись — вы моментально узнаете!`
      );
      return;
    }

    // ── МАСТЕРСКИЙ СЦЕНАРИЙ: /start <masterId> ────────────────
    if (param && !param.startsWith('appt_')) {
      const masterId = param;
      console.log(`🔧 Мастер-владелец, id: ${masterId}`);

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, name, telegram_id')
        .eq('id', masterId)
        .single();

      if (error || !profile) {
        console.error('❌ Мастер не найден:', masterId);
        await sendTelegramMessage(
          NOTIFY_BOT_TOKEN, chatId,
          `❌ Аккаунт не найден.\n\n` +
          `Убедитесь, что вы перешли по ссылке из личного кабинета BeautySaaS.`
        );
        return;
      }

      if (profile.telegram_id && profile.telegram_id === String(chatId)) {
        await sendTelegramMessage(
          NOTIFY_BOT_TOKEN, chatId,
          `✅ <b>Вы уже подключены!</b>\n\n` +
          `Уведомления о новых записях приходят сюда автоматически.`
        );
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          telegram_id:      String(chatId),
          telegram_chat_id: String(chatId),
        })
        .eq('id', masterId);

      if (updateError) {
        console.error('❌ Ошибка обновления профиля:', updateError);
        await sendTelegramMessage(
          NOTIFY_BOT_TOKEN, chatId,
          `❌ Ошибка при подключении. Попробуйте позже.`
        );
        return;
      }

      console.log(
        `✅ Telegram привязан: мастер ${profile.name} ` +
        `(${masterId}), chat_id=${chatId}`
      );

      await sendTelegramMessage(
        NOTIFY_BOT_TOKEN, chatId,
        `🎉 <b>Готово, ${profile.name}!</b>\n\n` +
        `Теперь вы будете получать уведомления о каждой новой записи прямо сюда.\n\n` +
        `📲 Когда клиент запишется — вы моментально узнаете об этом!`
      );
      return;
    }

    // ── /start без параметра ───────────────────────────────────
    if (!param) {
      console.log(`👤 /start без параметра, chat_id=${chatId}`);

      const { data: existingMaster } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('telegram_id', String(chatId))
        .single();

      if (existingMaster) {
        await sendTelegramMessage(
          NOTIFY_BOT_TOKEN, chatId,
          `👋 С возвращением, <b>${existingMaster.name}</b>!\n\n` +
          `Ваш аккаунт подключён. Уведомления приходят сюда автоматически.\n\n` +
          `Управляйте записями в панели BeautySaaS.`
        );
      } else {
        await sendTelegramMessage(
          NOTIFY_BOT_TOKEN, chatId,
          `👋 Привет, <b>${firstName}</b>!\n\n` +
          `Это бот платформы <b>BeautySaaS</b> для уведомлений о записях.\n\n` +
          `Если вы <b>мастер</b> — войдите в личный кабинет и нажмите «Подключить Telegram-бота» в Настройках.\n\n` +
          `Если вы <b>клиент</b> — перейдите по ссылке для записи от вашего мастера.`
        );
      }
    }

  } catch (err) {
    console.error('❌ Ошибка в webhook/telegram:', err);
  }
});

// ════════════════════════════════════════════════════════════════
// WEBHOOK: Бот поддержки (SUPPORT_BOT_TOKEN)
// ════════════════════════════════════════════════════════════════
app.post('/webhook/support', async (req, res) => {
  res.sendStatus(200);
  await handleSupportUpdate(req.body);
});

// ════════════════════════════════════════════════════════════════
// СТАТИКА
// ════════════════════════════════════════════════════════════════
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ════════════════════════════════════════════════════════════════
// ЗАПУСК + АВТОУСТАНОВКА WEBHOOK
// ════════════════════════════════════════════════════════════════
app.listen(PORT, async () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);

  if (!NOTIFY_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_NOTIFY_BOT_TOKEN не задан — бот уведомлений отключён');
    return;
  }

  const RAILWAY_URL =
    process.env.RAILWAY_STATIC_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RAILWAY_GEN_PUBLIC_DOMAIN;

  if (!RAILWAY_URL) {
    console.warn('⚠️ RAILWAY_URL не задан — webhook не установлен (норма для локалки)');
    return;
  }

  const webhookUrl = `https://${RAILWAY_URL}/webhook/telegram`;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${NOTIFY_BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      }
    );
    const data = await res.json();
    if (data.ok) {
      console.log(`✅ Webhook бота уведомлений установлен: ${webhookUrl}`);
    } else {
      console.error('❌ Ошибка установки webhook:', data);
    }
  } catch (err) {
    console.error('❌ Ошибка при установке webhook:', err);
  }

  if (RAILWAY_URL) {
    await registerSupportBotWebhook(`https://${RAILWAY_URL}`);
  }
});