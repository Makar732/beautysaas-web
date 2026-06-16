// supportBot.js
// Бот поддержки BeautySaaS — ESM, без внешних зависимостей (чистый fetch)
// Работает через webhook, как и основной бот уведомлений.

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─────────────────────────────────────────────
// КОНФИГ
// ─────────────────────────────────────────────
const SUPPORT_TOKEN = process.env.TELEGRAM_SUPPORT_BOT_TOKEN || '';
const ADMIN_TG_ID   = process.env.ADMIN_TG_ID                || '';
const SBP_URL       = process.env.SBP_PAYMENT_URL            || '';
const QR_PATH       = path.join(__dirname, 'qr-payment.png');

// ─────────────────────────────────────────────
// НИЗКОУРОВНЕВЫЕ ХЕЛПЕРЫ (Telegram Bot API)
// ─────────────────────────────────────────────

/**
 * Универсальный вызов метода Telegram Bot API (JSON-тело).
 */
async function callTg(method, payload) {
  if (!SUPPORT_TOKEN) {
    console.error('[supportBot] ❌ TELEGRAM_SUPPORT_BOT_TOKEN не задан');
    return null;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${SUPPORT_TOKEN}/${method}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (!data.ok) {
      console.error(`[supportBot] ❌ Telegram API "${method}":`, data.description);
    }
    return data;
  } catch (err) {
    console.error(`[supportBot] ❌ Сетевая ошибка "${method}":`, err);
    return null;
  }
}

/**
 * Отправка текстового сообщения с HTML-разметкой.
 */
async function sendMessage(chatId, text, extra = {}) {
  return callTg('sendMessage', {
    chat_id:    chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  });
}

/**
 * Отправка фото (файл) с подписью через multipart/form-data.
 * Telegram требует multipart для отправки бинарного файла.
 */
async function sendPhotoFile(chatId, filePath, caption, replyMarkup) {
  if (!SUPPORT_TOKEN) return null;

  try {
    // Читаем файл в буфер
    const fileBuffer  = fs.readFileSync(filePath);
    const fileName    = path.basename(filePath);

    // Формируем multipart вручную (Node.js не имеет FormData в старых версиях,
    // но fetch глобально доступен в Node 18+ вместе с File/Blob)
    const formData = new FormData();
    formData.append('chat_id',  String(chatId));
    formData.append('caption',  caption);
    formData.append('parse_mode', 'HTML');

    if (replyMarkup) {
      formData.append('reply_markup', JSON.stringify(replyMarkup));
    }

    // Создаём Blob из буфера
    const blob = new Blob([fileBuffer], { type: 'image/png' });
    formData.append('photo', blob, fileName);

    const res = await fetch(
      `https://api.telegram.org/bot${SUPPORT_TOKEN}/sendPhoto`,
      { method: 'POST', body: formData }
    );
    const data = await res.json();
    if (!data.ok) {
      console.error('[supportBot] ❌ sendPhoto:', data.description);
    }
    return data;
  } catch (err) {
    console.error('[supportBot] ❌ Ошибка отправки фото:', err);
    return null;
  }
}

/**
 * Пересылка фото от пользователя — по file_id (уже на серверах Telegram).
 * Не требует multipart, используем JSON.
 */
async function forwardPhotoToAdmin(adminId, fileId, caption) {
  return callTg('sendPhoto', {
    chat_id:      adminId,
    photo:        fileId,
    caption,
    parse_mode:   'HTML',
  });
}

// ─────────────────────────────────────────────
// КЛАВИАТУРЫ
// ─────────────────────────────────────────────

/** Reply-клавиатура главного меню */
const MAIN_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: '💎 Продлить подписку (990 ₽)' }],
      [{ text: '❓ Задать вопрос поддержке'    }],
    ],
    resize_keyboard:   true,
    one_time_keyboard: false,
  },
};

/** Inline-кнопка «Перейти к оплате СБП» */
function paymentInlineKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔗 Перейти к оплате СБП', url: SBP_URL }],
    ],
  };
}

// ─────────────────────────────────────────────
// СЦЕНАРИИ
// ─────────────────────────────────────────────

/** Приветствие по /start — показываем главное меню */
async function handleStart(chatId, firstName) {
  await sendMessage(
    chatId,
    `👋 Привет, <b>${firstName}</b>! Я служба поддержки <b>BeautySaaS</b>.\n\n` +
    `Здесь ты можешь продлить подписку или задать любой вопрос — выбери нужное:`,
    MAIN_KEYBOARD
  );
}

/** Пользователь нажал «Продлить подписку» */
async function handlePayment(chatId) {
  const caption =
    `💳 <b>Продление подписки BeautySaaS — 990 ₽ / 30 дней</b>\n\n` +
    `<b>Как оплатить:</b>\n` +
    `• 📱 <b>С телефона:</b> нажмите кнопку «Перейти к оплате СБП» ниже\n` +
    `• 💻 <b>С компьютера:</b> отсканируйте QR-код камерой телефона\n\n` +
    `🛑 <b>Важно!</b> После успешной оплаты обязательно пришлите сюда <b>скриншот чека</b> — ` +
    `мы активируем подписку в течение нескольких минут!`;

  // Проверяем, существует ли QR-файл
  if (fs.existsSync(QR_PATH)) {
    await sendPhotoFile(chatId, QR_PATH, caption, paymentInlineKeyboard());
  } else {
    // Файл не найден — отправляем только текст с кнопкой
    console.warn('[supportBot] ⚠️ qr-payment.png не найден, отправляем только текст');
    await sendMessage(chatId, caption, {
      reply_markup: paymentInlineKeyboard(),
    });
  }
}

/** Пользователь нажал «Задать вопрос» */
async function handleAskQuestion(chatId) {
  await sendMessage(
    chatId,
    `✍️ Напишите ваш вопрос прямо сюда — я передам его администратору.\n\n` +
    `Мы стараемся отвечать в течение нескольких часов. 🕐`
  );
}

/**
 * Пересылаем текстовое сообщение от мастера администратору.
 * Оформление: имя, юзернейм, ID и текст.
 */
async function forwardTextToAdmin(from, text) {
  if (!ADMIN_TG_ID) {
    console.error('[supportBot] ❌ ADMIN_TG_ID не задан');
    return;
  }

  const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ');
  const username = from.username ? `@${from.username}` : '—';

  const adminText =
    `📩 <b>Новое обращение в поддержку!</b>\n\n` +
    `👤 <b>От:</b> ${fullName}\n` +
    `🔗 <b>Username:</b> ${username}\n` +
    `🆔 <b>ID:</b> <code>${from.id}</code>\n\n` +
    `💬 <b>Сообщение:</b>\n${text}`;

  await sendMessage(ADMIN_TG_ID, adminText);
}

/**
 * Пересылаем фото (чек) от мастера администратору.
 */
async function forwardPhotoToAdminWithInfo(from, photoArray, userCaption) {
  if (!ADMIN_TG_ID) {
    console.error('[supportBot] ❌ ADMIN_TG_ID не задан');
    return;
  }

  // Берём фото в наибольшем разрешении
  const bestPhoto = photoArray[photoArray.length - 1];
  const fileId    = bestPhoto.file_id;

  const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ');
  const username = from.username ? `@${from.username}` : '—';

  const adminCaption =
    `📩 <b>Новое обращение в поддержку!</b>\n\n` +
    `👤 <b>От:</b> ${fullName}\n` +
    `🔗 <b>Username:</b> ${username}\n` +
    `🆔 <b>ID:</b> <code>${from.id}</code>\n\n` +
    `🧾 <b>Чек об оплате</b>` +
    (userCaption ? `\n📝 <b>Подпись:</b> ${userCaption}` : '');

  await forwardPhotoToAdmin(ADMIN_TG_ID, fileId, adminCaption);
}

// ─────────────────────────────────────────────
// ГЛАВНЫЙ ОБРАБОТЧИК ОБНОВЛЕНИЙ
// Вызывается из server.js при получении POST на /webhook/support
// ─────────────────────────────────────────────

/**
 * Обрабатывает входящий update от Telegram.
 * @param {object} update  — тело запроса от Telegram
 */
export async function handleSupportUpdate(update) {
  try {
    const msg = update.message;

    // Игнорируем всё, что не является сообщением
    if (!msg) return;

    const chatId    = msg.chat.id;
    const from      = msg.from;
    const firstName = from?.first_name || 'Пользователь';
    const userId    = from?.id;

    // ── Команда /start ──────────────────────────────────────
    if (msg.text?.startsWith('/start')) {
      await handleStart(chatId, firstName);
      return;
    }

    // ── Кнопка «Продлить подписку» ───────────────────────────
    if (msg.text === '💎 Продлить подписку (990 ₽)') {
      await handlePayment(chatId);
      return;
    }

    // ── Кнопка «Задать вопрос» ───────────────────────────────
    if (msg.text === '❓ Задать вопрос поддержке') {
      await handleAskQuestion(chatId);
      return;
    }

    // ── Сообщения от самого администратора — не пересылаем ───
    if (ADMIN_TG_ID && String(userId) === String(ADMIN_TG_ID)) {
      return;
    }

    // ── Фото (чек об оплате или любое другое) ────────────────
    if (msg.photo) {
      await forwardPhotoToAdminWithInfo(from, msg.photo, msg.caption);
      await sendMessage(
        chatId,
        `✅ <b>Спасибо!</b> Ваш чек получен.\n\n` +
        `Мы проверим оплату и активируем подписку в течение нескольких минут. 🕐`
      );
      return;
    }

    // ── Любой другой текст — пересылаем как вопрос ────────────
    if (msg.text) {
      await forwardTextToAdmin(from, msg.text);
      await sendMessage(
        chatId,
        `✅ <b>Сообщение получено!</b>\n\n` +
        `Администратор ответит вам в ближайшее время. 🕐`
      );
      return;
    }

  } catch (err) {
    console.error('[supportBot] ❌ Ошибка обработки update:', err);
  }
}

// ─────────────────────────────────────────────
// УСТАНОВКА WEBHOOK ДЛЯ БОТА ПОДДЕРЖКИ
// Вызывается из server.js при старте
// ─────────────────────────────────────────────

/**
 * Регистрирует webhook для бота поддержки в Telegram.
 * @param {string} baseUrl  — публичный URL сервера (без слеша на конце)
 */
export async function registerSupportBotWebhook(baseUrl) {
  if (!SUPPORT_TOKEN) {
    console.warn('[supportBot] ⚠️ TELEGRAM_SUPPORT_BOT_TOKEN не задан — бот поддержки отключён');
    return;
  }

  const webhookUrl = `${baseUrl}/webhook/support`;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${SUPPORT_TOKEN}/setWebhook`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: webhookUrl }),
      }
    );
    const data = await res.json();
    if (data.ok) {
      console.log(`✅ [supportBot] Webhook установлен: ${webhookUrl}`);
    } else {
      console.error('[supportBot] ❌ Ошибка установки webhook:', data.description);
    }
  } catch (err) {
    console.error('[supportBot] ❌ Сетевая ошибка при установке webhook:', err);
  }
}