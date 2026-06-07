import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ===== TELEGRAM CONFIG =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function sendTelegramMessage(chatId, text) {
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

// ===== API ENDPOINT: Отправка уведомлений (защищено на сервере) =====
app.post('/api/send-notification', async (req, res) => {
  const { telegram_id, booking } = req.body;

  if (!telegram_id || !booking) {
    return res.status(400).json({ error: 'Missing telegram_id or booking data' });
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

    console.log(`📩 Получено сообщение от ${chatId}: ${text}`);

    if (text.startsWith('/start')) {
      const parts = text.split(' ');

      if (parts.length === 1) {
        await sendTelegramMessage(
          chatId,
          `👋 Привет, ${firstName}!\n\n` +
          `Я бот BeautySaaS для уведомлений о записях.\n\n` +
          `Чтобы подключить уведомления:\n` +
          `1. Войдите в личный кабинет BeautySaaS\n` +
          `2. Откройте раздел "Настройки"\n` +
          `3. Нажмите кнопку "Подключить Telegram-бота"\n\n` +
          `Вы будете автоматически перенаправлены сюда с вашим ID.`
        );
        return res.sendStatus(200);
      }

      const masterId = parts[1];

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
          `Пожалуйста, убедитесь что вы перешли по ссылке из личного кабинета BeautySaaS.`
        );
        return res.sendStatus(200);
      }

      if (profile.telegram_id && profile.telegram_id === String(chatId)) {
        await sendTelegramMessage(
          chatId,
          `✅ Вы уже подключены!\n\n` +
          `Уведомления о новых записях приходят сюда автоматически.`
        );
        return res.sendStatus(200);
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ telegram_id: String(chatId) })
        .eq('id', masterId);

      if (updateError) {
        console.error('❌ Ошибка обновления профиля:', updateError);
        await sendTelegramMessage(
          chatId,
          `❌ Произошла ошибка при подключении. Попробуйте позже.`
        );
        return res.sendStatus(200);
      }

      console.log(`✅ Telegram подключён для мастера ${profile.name} (${masterId})`);
      await sendTelegramMessage(
        chatId,
        `🎉 Готово, ${profile.name}!\n\n` +
        `Теперь вы будете получать уведомления о каждой новой записи прямо сюда.\n\n` +
        `📲 Когда клиент запишется через ваш сайт — вы моментально узнаете об этом!`
      );

      return res.sendStatus(200);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Ошибка в Telegram webhook:', error);
    res.sendStatus(500);
  }
});

// ===== СТАТИКА (ФРОНТЕНД) =====
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ===== ЗАПУСК СЕРВЕРА =====
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