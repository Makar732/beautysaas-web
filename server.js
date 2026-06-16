import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ===== КОНФИГ =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== УТИЛИТЫ =====

/**
 * Проверяет, истёк ли 14-дневный триал.
 */
function isTrialExpired(trialStartDate) {
  if (!trialStartDate) return false;
  const start = new Date(trialStartDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 14;
}

/**
 * Базовая функция отправки сообщения в Telegram.
 */
async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN не задан');
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...extra,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('❌ Ошибка отправки в Telegram:', data);
      return false;
    }
    return true;
  } catch (error) {
    console.error('❌ Ошибка сети при отправке в Telegram:', error);
    return false;
  }
}

/**
 * Отправляет мастеру уведомление об окончании триала.
 */
async function sendTrialExpiredNotification(chatId, masterName) {
  const text =
    `⚠️ <b>${masterName}</b>, ваш 14-дневный пробный период BeautySaaS завершён.\n\n` +
    `Чтобы продолжать получать мгновенные уведомления в Telegram и видеть аналитику доходов — активируйте тариф <b>ПРО</b>.\n\n` +
    `👉 <a href="https://beautysaas.ru/#/pricing">Перейти к оплате</a>`;

  return sendTelegramMessage(chatId, text);
}

/**
 * Находит все записи на завтра с привязанным Telegram клиента
 * и рассылает им напоминания.
 */
async function checkAndSendReminders() {
  // Вычисляем дату завтра в формате YYYY-MM-DD (локальное время сервера)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  const tomorrowStr = `${year}-${month}-${day}`;

  console.log(`🔔 Проверяем напоминания на дату: ${tomorrowStr}`);

  // Запрашиваем все записи на завтра с непустым client_tg_chat_id
  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, master_id, service_name, time, client_tg_chat_id, client_name')
    .eq('date', tomorrowStr)
    .neq('status', 'cancelled')
    .neq('client_tg_chat_id', '')
    .not('client_tg_chat_id', 'is', null);

  if (error) {
    console.error('❌ Ошибка запроса записей для напоминаний:', error);
    return { sent: 0, error: error.message };
  }

  if (!appointments || appointments.length === 0) {
    console.log('✅ Нет записей с подключённым Telegram на завтра');
    return { sent: 0 };
  }

  console.log(`📨 Найдено записей для напоминания: ${appointments.length}`);

  // Собираем уникальные master_id чтобы подтянуть имена одним запросом
  const masterIds = [...new Set(appointments.map(a => a.master_id))];
  const { data: masters } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', masterIds);

  const masterMap = {};
  if (masters) {
    masters.forEach(m => { masterMap[m.id] = m.name; });
  }

  let sent = 0;

  for (const appt of appointments) {
    const masterName = masterMap[appt.master_id] || 'мастера';

    const text =
      `⏰ <b>Напоминание о визите!</b>\n\n` +
      `Привет, <b>${appt.client_name}</b>! 👋\n\n` +
      `Завтра вы записаны:\n` +
      `✨ <b>Услуга:</b> ${appt.service_name}\n` +
      `👩‍🎨 <b>Мастер:</b> ${masterName}\n` +
      `🕐 <b>Время:</b> ${appt.time}\n\n` +
      `Ждём вас! 💅`;

    const ok = await sendTelegramMessage(appt.client_tg_chat_id, text);

    if (ok) {
      sent++;
      console.log(`✅ Напоминание отправлено клиенту (запись ${appt.id})`);
    } else {
      console.warn(`⚠️ Не удалось отправить напоминание (запись ${appt.id})`);
    }
  }

  return { sent, total: appointments.length };
}

// ===== API: Уведомление мастеру о новой записи =====
app.post('/api/send-notification', async (req, res) => {
  const { telegram_id, booking } = req.body;

  if (!telegram_id || !booking) {
    return res.status(400).json({ error: 'Missing telegram_id or booking data' });
  }

  // Проверяем статус мастера: триал и премиум
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_premium, trial_start_date, name')
    .eq('telegram_id', telegram_id)
    .single();

  if (!profileError && profile) {
    const isPremium = profile.is_premium || false;
    const trialExpired = isTrialExpired(profile.trial_start_date);

    if (!isPremium && trialExpired) {
      console.log(`🔒 Уведомление заблокировано для ${profile.name}: триал истёк`);
      return res.json({ success: false, reason: 'trial_expired' });
    }
  }

  const text =
    `🌸 <b>Новая запись!</b> 💅\n\n` +
    `👤 <b>Клиент:</b> ${booking.clientName}\n` +
    `📞 <b>Телефон:</b> ${booking.clientPhone}\n` +
    `✨ <b>Услуга:</b> ${booking.serviceName}\n` +
    `📅 <b>Дата:</b> ${booking.date}\n` +
    `🕐 <b>Время:</b> ${booking.time}\n\n` +
    `<i>Уведомление от BeautySaaS</i>`;

  const success = await sendTelegramMessage(telegram_id, text);

  if (success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to send Telegram notification' });
  }
});

app.post('/api/broadcast', async (req, res) => {
  const { admin_id, message, targets } = req.body;

  const ADMIN_UUID = process.env.ADMIN_UUID || 'СЮДА_ВСТАВЬ_СВОЙ_UUID';
  if (admin_id !== ADMIN_UUID) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!message || !targets || !Array.isArray(targets)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'Bot token not configured' });
  }

  let sent = 0;
  const errors = [];

  for (const target of targets) {
    const chatId = target.telegram_id;
    if (!chatId) continue;

    try {
      const telegramRes = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `📢 *Объявление от BeautySaaS*\n\n${message}`,
            parse_mode: 'Markdown',
          }),
        }
      );

      const telegramData = await telegramRes.json();
      if (telegramData.ok) {
        sent++;
      } else {
        errors.push({ id: target.id, error: telegramData.description });
      }
    } catch (err) {
      errors.push({ id: target.id, error: err.message });
    }
  }

  console.log(`[Broadcast] Отправлено: ${sent}/${targets.length}`);
  res.json({ success: true, sent, total: targets.length, errors });
});

// ===== API: Рассылка напоминаний клиентам =====
app.post('/api/send-reminders', async (req, res) => {
  console.log('📬 Запущена рассылка напоминаний...');
  const result = await checkAndSendReminders();
  res.json(result);
});

// ===== API: Проверка истечения триалов и рассылка уведомлений мастерам =====
app.post('/api/check-trial-expiry', async (req, res) => {
  const now = new Date();
  const expiryDate = new Date(now);
  expiryDate.setDate(expiryDate.getDate() - 14);

  const dateFrom = `${expiryDate.toISOString().split('T')[0]}T00:00:00.000Z`;
  const dateTo = `${expiryDate.toISOString().split('T')[0]}T23:59:59.999Z`;

  console.log(`🔍 Проверяем триалы за период: ${dateFrom} — ${dateTo}`);

  const { data: expiredMasters, error } = await supabase
    .from('profiles')
    .select('id, name, telegram_id, trial_start_date, is_premium')
    .eq('is_premium', false)
    .gte('trial_start_date', dateFrom)
    .lte('trial_start_date', dateTo);

  if (error) {
    console.error('❌ Ошибка запроса истёкших триалов:', error);
    return res.status(500).json({ error: 'Database error' });
  }

  if (!expiredMasters || expiredMasters.length === 0) {
    console.log('✅ Нет мастеров с истёкшим триалом сегодня');
    return res.json({ sent: 0 });
  }

  let sent = 0;
  for (const master of expiredMasters) {
    if (master.telegram_id) {
      const ok = await sendTrialExpiredNotification(master.telegram_id, master.name);
      if (ok) {
        sent++;
        console.log(`✅ Уведомление об окончании триала: ${master.name}`);
      }
    }
  }

  res.json({ sent, total: expiredMasters.length });
});

// ===== TELEGRAM BOT WEBHOOK =====
app.post('/webhook/telegram', async (req, res) => {
  try {
    const update = req.body;

    if (!update.message || !update.message.text) {
      return res.sendStatus(200);
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const firstName = update.message.from.first_name || 'Пользователь';

    console.log(`📩 Сообщение от ${chatId}: ${text}`);

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const param = parts[1] || '';

      // ================================================================
      // КЛИЕНТСКИЙ СЦЕНАРИЙ: параметр начинается с 'appt_'
      // Клиент перешёл по deep link с виджета записи
      // ================================================================
      if (param.startsWith('appt_')) {
        const bookingId = param.replace('appt_', '');
        console.log(`🎯 Клиентский сценарий, booking id: ${bookingId}`);

        // Ищем запись в базе
        const { data: appointment, error: apptError } = await supabase
          .from('appointments')
          .select('id, service_name, date, time, master_id, client_name')
          .eq('id', bookingId)
          .single();

        if (apptError || !appointment) {
          console.error('❌ Запись не найдена:', bookingId, apptError);
          await sendTelegramMessage(
            chatId,
            `❌ Не удалось найти вашу запись.\n\n` +
            `Возможно, ссылка устарела. Пожалуйста, обратитесь к мастеру напрямую.`
          );
          return res.sendStatus(200);
        }

        // Подтягиваем имя мастера
        const { data: masterProfile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', appointment.master_id)
          .single();

        const masterName = masterProfile?.name || 'мастера';

        // Сохраняем chat_id клиента в запись
        const { error: updateError } = await supabase
          .from('appointments')
          .update({ client_tg_chat_id: String(chatId) })
          .eq('id', bookingId);

        if (updateError) {
          console.error('❌ Ошибка сохранения client_tg_chat_id:', updateError);
          await sendTelegramMessage(
            chatId,
            `❌ Произошла ошибка. Пожалуйста, попробуйте позже.`
          );
          return res.sendStatus(200);
        }

        // Форматируем дату для сообщения
        const [year, month, day] = appointment.date.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const dateFormatted = dateObj.toLocaleDateString('ru-RU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });

        console.log(`✅ Напоминание подключено для клиента (запись ${bookingId})`);

        await sendTelegramMessage(
          chatId,
          `🎉 <b>Напоминание включено!</b>\n\n` +
          `Я пришлю уведомление за день до вашего визита.\n\n` +
          `📋 <b>Детали записи:</b>\n` +
          `✨ <b>Услуга:</b> ${appointment.service_name}\n` +
          `👩‍🎨 <b>Мастер:</b> ${masterName}\n` +
          `📅 <b>Дата:</b> ${dateFormatted}\n` +
          `🕐 <b>Время:</b> ${appointment.time}\n\n` +
          `До встречи! 💅`
        );

        return res.sendStatus(200);
      }

      // ================================================================
      // МАСТЕРСКИЙ СЦЕНАРИЙ: параметр есть, но это не 'appt_'
      // Мастер перешёл по ссылке из панели управления
      // ================================================================
      if (param && !param.startsWith('appt_')) {
        const masterId = param;
        console.log(`🔧 Мастерский сценарий, master id: ${masterId}`);

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('id, name, telegram_id')
          .eq('id', masterId)
          .single();

        if (error || !profile) {
          console.error('❌ Мастер не найден:', masterId, error);
          await sendTelegramMessage(
            chatId,
            `❌ Ошибка: аккаунт не найден.\n\n` +
            `Убедитесь, что вы перешли по ссылке из личного кабинета BeautySaaS.`
          );
          return res.sendStatus(200);
        }

        // Уже подключён
        if (profile.telegram_id && profile.telegram_id === String(chatId)) {
          await sendTelegramMessage(
            chatId,
            `✅ <b>Вы уже подключены!</b>\n\n` +
            `Уведомления о новых записях приходят сюда автоматически.`
          );
          return res.sendStatus(200);
        }

        // Привязываем telegram_id мастера
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ telegram_id: String(chatId) })
          .eq('id', masterId);

        if (updateError) {
          console.error('❌ Ошибка обновления профиля мастера:', updateError);
          await sendTelegramMessage(chatId, `❌ Произошла ошибка при подключении. Попробуйте позже.`);
          return res.sendStatus(200);
        }

        console.log(`✅ Telegram подключён для мастера ${profile.name} (${masterId})`);
        await sendTelegramMessage(
          chatId,
          `🎉 <b>Готово, ${profile.name}!</b>\n\n` +
          `Теперь вы будете получать уведомления о каждой новой записи прямо сюда.\n\n` +
          `📲 Когда клиент запишется через ваш сайт — вы моментально узнаете об этом!`
        );

        return res.sendStatus(200);
      }

      // ================================================================
      // СЦЕНАРИЙ БЕЗ ПАРАМЕТРА: /start без аргументов
      // Проверяем: это уже подключённый мастер или незнакомый пользователь?
      // ================================================================
      if (!param) {
        console.log(`👤 /start без параметра от chat_id: ${chatId}`);

        // Проверяем, есть ли этот chat_id среди мастеров
        const { data: existingMaster } = await supabase
          .from('profiles')
          .select('id, name')
          .eq('telegram_id', String(chatId))
          .single();

        if (existingMaster) {
          // Это уже подключённый мастер
          await sendTelegramMessage(
            chatId,
            `👋 С возвращением, <b>${existingMaster.name}</b>!\n\n` +
            `Ваш аккаунт мастера подключён. Уведомления о новых записях приходят сюда автоматически.\n\n` +
            `Управляйте записями в панели BeautySaaS.`
          );
        } else {
          // Незнакомый пользователь — заглушка
          await sendTelegramMessage(
            chatId,
            `👋 Привет, <b>${firstName}</b>!\n\n` +
            `Это бот платформы <b>BeautySaaS</b> для уведомлений о записях.\n\n` +
            `Если вы <b>мастер</b> — войдите в личный кабинет BeautySaaS и нажмите «Подключить Telegram-бота» в разделе Настройки.\n\n` +
            `Если вы <b>клиент</b> — перейдите по ссылке для записи от вашего мастера.`
          );
        }

        return res.sendStatus(200);
      }
    }

    // Любые другие сообщения — игнорируем тихо
    res.sendStatus(200);

  } catch (error) {
    console.error('❌ Ошибка в Telegram webhook:', error);
    res.sendStatus(500);
  }
});

// ===== СТАТИКА =====
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ===== ЗАПУСК =====
app.listen(PORT, async () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);

  if (TELEGRAM_BOT_TOKEN) {
    const RAILWAY_URL =
      process.env.RAILWAY_STATIC_URL ||
      process.env.RAILWAY_PUBLIC_DOMAIN ||
      process.env.RAILWAY_GEN_PUBLIC_DOMAIN;

    if (RAILWAY_URL) {
      const webhookUrl = `https://${RAILWAY_URL}/webhook/telegram`;
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
          }
        );
        const data = await res.json();
        if (data.ok) {
          console.log(`✅ Telegram webhook установлен: ${webhookUrl}`);
        } else {
          console.error('❌ Ошибка установки webhook:', data);
        }
      } catch (error) {
        console.error('❌ Ошибка при установке webhook:', error);
      }
    } else {
      console.warn('⚠️ RAILWAY_URL не задан — webhook не установлен (норма для локалки)');
    }
  } else {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN не задан — Telegram бот отключён');
  }
});