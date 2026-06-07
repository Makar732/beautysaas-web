import { TELEGRAM_BOT_TOKEN } from './storage';

interface TelegramNotificationData {
  clientName: string;
  clientPhone: string;
  serviceName: string;
  date: string;
  time: string;
  masterName: string;
}

/**
 * Отправляет уведомление мастеру в Telegram о новой записи.
 * Использует telegram_id (Chat ID полученный через /start в боте).
 */
export async function sendTelegramNotification(
  telegramId: string, // telegram_id из profiles (не telegram_chat_id!)
  data: TelegramNotificationData,
  botToken?: string
): Promise<boolean> {
  const token = botToken || TELEGRAM_BOT_TOKEN;

  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    console.warn('[BeautySaaS] Telegram Bot Token не настроен.');
    return false;
  }

  if (!telegramId) {
    console.warn('[BeautySaaS] Telegram ID мастера не указан (бот не подключён).');
    return false;
  }

  const text =
    `🌸 <b>Новая запись!</b> 💅\n\n` +
    `👤 <b>Клиент:</b> ${data.clientName}\n` +
    `📞 <b>Телефон:</b> ${data.clientPhone}\n` +
    `✨ <b>Услуга:</b> ${data.serviceName}\n` +
    `📅 <b>Дата:</b> ${data.date}\n` +
    `🕐 <b>Время:</b> ${data.time}\n\n` +
    `<i>Уведомление от BeautySaaS</i>`;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId, // ✅ используем telegram_id
        text,
        parse_mode: 'HTML',
      }),
    });

    const result = await response.json();
    if (!result.ok) {
      console.error('[BeautySaaS] Ошибка отправки в Telegram:', result);
      return false;
    }
    console.log('[BeautySaaS] ✅ Уведомление отправлено в Telegram!');
    return true;
  } catch (error) {
    console.error('[BeautySaaS] Ошибка сети при отправке в Telegram:', error);
    return false;
  }
}