interface TelegramNotificationData {
  clientName: string;
  clientPhone: string;
  serviceName: string;
  date: string;
  time: string;
  masterName: string;
}

/**
 * Отправляет уведомление мастеру в Telegram через серверный endpoint.
 * Токен бота НЕ передаётся в браузер — всё безопасно на сервере.
 */
export async function sendTelegramNotification(
  telegramId: string,
  data: TelegramNotificationData
): Promise<boolean> {
  if (!telegramId) {
    console.warn('[BeautySaaS] Telegram ID не указан');
    return false;
  }

  try {
    const response = await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_id: telegramId,
        booking: data,
      }),
    });

    if (!response.ok) {
      console.error('[BeautySaaS] Ошибка сервера при отправке уведомления');
      return false;
    }

    const result = await response.json();
    if (!result.success) {
      console.error('[BeautySaaS] Не удалось отправить уведомление');
      return false;
    }

    console.log('[BeautySaaS] ✅ Уведомление отправлено!');
    return true;
  } catch (error) {
    console.error('[BeautySaaS] Ошибка сети:', error);
    return false;
  }
}