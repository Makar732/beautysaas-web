import { TELEGRAM_BOT_TOKEN } from './storage';

interface TelegramNotificationData {
  clientName: string;
  clientPhone: string;
  serviceName: string;
  date: string;
  time: string;
  masterName: string;
}

export async function sendTelegramNotification(
  chatId: string,
  data: TelegramNotificationData,
  botToken?: string
): Promise<boolean> {
  const token = botToken || TELEGRAM_BOT_TOKEN;

  if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    console.warn('[BeautySaaS] Telegram Bot Token не настроен. Уведомление не отправлено.');
    return false;
  }

  if (!chatId) {
    console.warn('[BeautySaaS] Telegram Chat ID мастера не указан. Уведомление не отправлено.');
    return false;
  }

  const text =
    `🌸 <b>Новая запись на сайте!</b> 💅\n\n` +
    `👤 <b>Клиент:</b> ${data.clientName}\n` +
    `📞 <b>Телефон:</b> ${data.clientPhone}\n` +
    `✨ <b>Услуга:</b> ${data.serviceName}\n` +
    `📅 <b>Время:</b> ${data.date} в ${data.time}\n` +
    `👩‍🎨 <b>Мастер:</b> ${data.masterName}\n\n` +
    `_Уведомление от BeautySaaS_`;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    const result = await response.json();
    if (!result.ok) {
      console.error('[BeautySaaS] Ошибка отправки в Telegram:', result);
      return false;
    }
    console.log('[BeautySaaS] Уведомление в Telegram отправлено успешно!');
    return true;
  } catch (error) {
    console.error('[BeautySaaS] Ошибка сети при отправке в Telegram:', error);
    return false;
  }
}
