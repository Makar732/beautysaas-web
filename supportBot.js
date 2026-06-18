// supportBot.js
// Бот поддержки BeautySaaS — обновлённая версия с покупкой тарифов

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
// НИЗКОУРОВНЕВЫЕ ХЕЛПЕРЫ
// ─────────────────────────────────────────────

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

async function sendMessage(chatId, text, extra = {}) {
  return callTg('sendMessage', {
    chat_id:    chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  });
}

async function sendPhotoFile(chatId, filePath, caption, replyMarkup) {
  if (!SUPPORT_TOKEN) return null;

  try {
    const fileBuffer  = fs.readFileSync(filePath);
    const fileName    = path.basename(filePath);

    const formData = new FormData();
    formData.append('chat_id',     String(chatId));
    formData.append('caption',     caption);
    formData.append('parse_mode',  'HTML');

    if (replyMarkup) {
      formData.append('reply_markup', JSON.stringify(replyMarkup));
    }

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

async function forwardPhotoToAdmin(adminId, fileId, caption) {
  return callTg('sendPhoto', {
    chat_id:    adminId,
    photo:      fileId,
    caption,
    parse_mode: 'HTML',
  });
}

// ─────────────────────────────────────────────
// КЛАВИАТУРЫ
// ─────────────────────────────────────────────

/** ★ НОВОЕ главное меню */
const MAIN_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: '💎 Купить тариф "Соло" — 550 ₽' }],
      [{ text: '🏆 Купить тариф "Салон" — 990 ₽' }],
      [{ text: '❓ Связаться с поддержкой' }],
    ],
    resize_keyboard:   true,
    one_time_keyboard: false,
  },
};

/** Inline-кнопка СБП */
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

/** /start — приветствие */
async function handleStart(chatId, firstName, param) {
  // ── Если есть параметр (buy_solo, buy_salon, trial_...) ───
  if (param) {
    if (param === 'buy_solo') {
      await handlePaymentSolo(chatId);
      return;
    }
    if (param === 'buy_salon') {
      await handlePaymentSalon(chatId);
      return;
    }
    if (param.startsWith('trial_')) {
      const plan = param.replace('trial_', ''); // solo | salon
      await handleTrial(chatId, plan);
      return;
    }
  }

  // ── Обычное приветствие ────────────────────────────────────
  await sendMessage(
    chatId,
    `👋 Привет, <b>${firstName}</b>! Добро пожаловать в <b>BeautySaaS</b>!\n\n` +
    `Здесь ты можешь:\n` +
    `• 💎 Купить тариф "Соло" (550 ₽/мес)\n` +
    `• 🏆 Купить тариф "Салон" (990 ₽/мес)\n` +
    `• ❓ Задать вопрос поддержке\n\n` +
    `Выбери нужное действие ниже ⬇️`,
    MAIN_KEYBOARD
  );
}

/** ★ НОВОЕ — триал */
async function handleTrial(chatId, plan) {
  const planName = plan === 'solo' ? 'Соло' : 'Салон';
  const price    = plan === 'solo' ? '550 ₽' : '990 ₽';

  await sendMessage(
    chatId,
    `🎁 <b>Пробный период тарифа "${planName}"</b>\n\n` +
    `У тебя <b>14 дней бесплатно</b> для тестирования всех возможностей!\n\n` +
    `<b>Что дальше:</b>\n` +
    `1️⃣ Зарегистрируйся на сайте beautysaas.ru\n` +
    `2️⃣ Подключи свой Telegram для уведомлений\n` +
    `3️⃣ Добавь услуги и поделись ссылкой для записи с клиентами\n\n` +
    `Через 14 дней триал закончится — чтобы продолжить, купи подписку (${price}/мес).\n\n` +
    `Нужна помощь? Нажми "❓ Связаться с поддержкой"`,
    MAIN_KEYBOARD
  );
}

/** ★ НОВОЕ — покупка Соло */
async function handlePaymentSolo(chatId) {
  const caption =
    `💎 <b>Тариф "Соло" — 550 ₽ / 30 дней</b>\n\n` +
    `<b>Что входит:</b>\n` +
    `• Онлайн-запись 24/7 через персональную ссылку\n` +
    `• 1 активный мастер (для соло-специалиста)\n` +
    `• До 10 активных услуг в прайсе\n` +
    `• Telegram-уведомления о каждой записи\n` +
    `• Аналитика выручки и загрузки\n\n` +
    `<b>Как оплатить:</b>\n` +
    `• 📱 <b>С телефона:</b> нажмите кнопку ниже\n` +
    `• 💻 <b>С компьютера:</b> отсканируйте QR-код\n\n` +
    `🛑 <b>Важно!</b> После оплаты пришлите сюда <b>скриншот чека</b> — ` +
    `мы активируем подписку в течение нескольких минут!`;

  if (fs.existsSync(QR_PATH)) {
    await sendPhotoFile(chatId, QR_PATH, caption, paymentInlineKeyboard());
  } else {
    await sendMessage(chatId, caption, {
      reply_markup: paymentInlineKeyboard(),
    });
  }
}

/** ★ НОВОЕ — покупка Салон */
async function handlePaymentSalon(chatId) {
  const caption =
    `🏆 <b>Тариф "Салон" — 990 ₽ / 30 дней</b>\n\n` +
    `<b>Что входит:</b>\n` +
    `• Всё из тарифа "Соло" + возможности для команды\n` +
    `• Несколько мастеров в одной системе\n` +
    `• Круглосуточная запись без администратора\n` +
    `• Профессиональный имидж для клиентов\n` +
    `• Аналитика по каждому мастеру\n` +
    `• Авто-напоминания клиентам в Telegram\n` +
    `• Приоритетная поддержка\n\n` +
    `<b>Как оплатить:</b>\n` +
    `• 📱 <b>С телефона:</b> нажмите кнопку ниже\n` +
    `• 💻 <b>С компьютера:</b> отсканируйте QR-код\n\n` +
    `🛑 <b>Важно!</b> После оплаты пришлите сюда <b>скриншот чека</b> — ` +
    `мы активируем подписку в течение нескольких минут!`;

  if (fs.existsSync(QR_PATH)) {
    await sendPhotoFile(chatId, QR_PATH, caption, paymentInlineKeyboard());
  } else {
    await sendMessage(chatId, caption, {
      reply_markup: paymentInlineKeyboard(),
    });
  }
}

/** ★ НОВОЕ — связаться с поддержкой */
async function handleSupport(chatId) {
  await sendMessage(
    chatId,
    `✍️ <b>Служба поддержки BeautySaaS</b>\n\n` +
    `Напишите ваш вопрос прямо сюда — мы ответим в течение нескольких часов.\n\n` +
    `Если нужна техническая помощь — опишите проблему подробно. 🛠`
  );
}

/** Пересылка текста администратору */
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

/** Пересылка фото (чека) администратору */
async function forwardPhotoToAdminWithInfo(from, photoArray, userCaption) {
  if (!ADMIN_TG_ID) {
    console.error('[supportBot] ❌ ADMIN_TG_ID не задан');
    return;
  }

  const bestPhoto = photoArray[photoArray.length - 1];
  const fileId    = bestPhoto.file_id;

  const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ');
  const username = from.username ? `@${from.username}` : '—';

  const adminCaption =
    `📩 <b>Новое обращение (чек об оплате)</b>\n\n` +
    `👤 <b>От:</b> ${fullName}\n` +
    `🔗 <b>Username:</b> ${username}\n` +
    `🆔 <b>ID:</b> <code>${from.id}</code>\n\n` +
    `🧾 <b>Чек об оплате</b>` +
    (userCaption ? `\n📝 <b>Подпись:</b> ${userCaption}` : '');

  await forwardPhotoToAdmin(ADMIN_TG_ID, fileId, adminCaption);
}

// ─────────────────────────────────────────────
// ГЛАВНЫЙ ОБРАБОТЧИК
// ─────────────────────────────────────────────

export async function handleSupportUpdate(update) {
  try {
    const msg = update.message;
    if (!msg) return;

    const chatId    = msg.chat.id;
    const from      = msg.from;
    const firstName = from?.first_name || 'Пользователь';
    const userId    = from?.id;

    // ── /start с параметром или без ────────────────────────────
    if (msg.text?.startsWith('/start')) {
      const parts = msg.text.split(' ');
      const param = parts[1]?.trim() || '';
      await handleStart(chatId, firstName, param);
      return;
    }

    // ── Кнопки главного меню ────────────────────────────────────
    if (msg.text === '💎 Купить тариф "Соло" — 550 ₽') {
      await handlePaymentSolo(chatId);
      return;
    }

    if (msg.text === '🏆 Купить тариф "Салон" — 990 ₽') {
      await handlePaymentSalon(chatId);
      return;
    }

    if (msg.text === '❓ Связаться с поддержкой') {
      await handleSupport(chatId);
      return;
    }

    // ── Сообщения от администратора — игнорируем ────────────────
    if (ADMIN_TG_ID && String(userId) === String(ADMIN_TG_ID)) {
      return;
    }

    // ── Фото (чек) ──────────────────────────────────────────────
    if (msg.photo) {
      await forwardPhotoToAdminWithInfo(from, msg.photo, msg.caption);
      await sendMessage(
        chatId,
        `✅ <b>Чек получен!</b>\n\n` +
        `Мы проверим оплату и активируем подписку в течение нескольких минут. 🕐\n\n` +
        `Если возникнут вопросы — напишем вам сюда.`
      );
      return;
    }

    // ── Любой текст → в поддержку ───────────────────────────────
    if (msg.text) {
      await forwardTextToAdmin(from, msg.text);
      await sendMessage(
        chatId,
        `✅ <b>Сообщение получено!</b>\n\n` +
        `Служба поддержки ответит вам в ближайшее время. 🕐`
      );
      return;
    }

  } catch (err) {
    console.error('[supportBot] ❌ Ошибка обработки update:', err);
  }
}

// ─────────────────────────────────────────────
// УСТАНОВКА WEBHOOK
// ─────────────────────────────────────────────

export async function registerSupportBotWebhook(baseUrl) {
  if (!SUPPORT_TOKEN) {
    console.warn('[supportBot] ⚠️ TELEGRAM_SUPPORT_BOT_TOKEN не задан');
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