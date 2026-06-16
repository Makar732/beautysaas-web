const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const NOTIFY_BOT_TOKEN = process.env.TELEGRAM_NOTIFY_BOT_TOKEN;
const SUPPORT_BOT_TOKEN = process.env.TELEGRAM_SUPPORT_BOT_TOKEN;
const ADMIN_UUID = process.env.ADMIN_UUID;

// Supabase клиент для серверных проверок
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service_role — обходит RLS
);

// ─── Хелпер: проверка активности подписки мастера ───────────
async function isMasterSubscriptionActive(masterId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_premium, trial_start_date')
      .eq('id', masterId)
      .single();

    if (error || !data) {
      // Если не удалось получить профиль — пропускаем уведомление
      console.warn(`[BeautySaaS] Не удалось получить профиль ${masterId}:`, error?.message);
      return false;
    }

    // Premium активен — всегда отправляем
    if (data.is_premium) return true;

    // Проверяем триал
    if (!data.trial_start_date) {
      // Нет даты старта триала — считаем триал активным (новый пользователь)
      return true;
    }

    const trialStart = new Date(data.trial_start_date);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    const TRIAL_DAYS = 14;
    const isTrialActive = diffDays <= TRIAL_DAYS;

    if (!isTrialActive) {
      console.log(
        `[BeautySaaS] 🔕 Уведомление заблокировано для ${masterId} — триал истёк ${diffDays - TRIAL_DAYS} дн. назад`
      );
    }

    return isTrialActive;
  } catch (err) {
    console.error('[BeautySaaS] Ошибка проверки подписки:', err);
    return false;
  }
}

// ─── /api/send-notification — уведомление о новой записи ─────
// Блокируется если триал истёк и нет Premium
app.post('/api/send-notification', async (req, res) => {
  const { telegram_id, booking } = req.body;

  if (!telegram_id) {
    return res.status(400).json({ success: false, error: 'telegram_id обязателен' });
  }

  if (!NOTIFY_BOT_TOKEN) {
    return res.status(500).json({ success: false, error: 'TELEGRAM_NOTIFY_BOT_TOKEN не настроен' });
  }

  // ── Получаем master_id из booking ──
  const masterId = booking?.master_id;

  if (masterId) {
    const canNotify = await isMasterSubscriptionActive(masterId);
    if (!canNotify) {
      // Тихо возвращаем success чтобы фронтенд не показывал ошибку клиенту
      return res.json({
        success: true,
        blocked: true,
        reason: 'trial_expired',
      });
    }
  }

  // ── Формируем текст уведомления ──
  const text = `
📅 *Новая запись!*

👤 *Клиент:* ${booking?.clientName || '—'}
📞 *Телефон:* ${booking?.clientPhone || '—'}
💆 *Услуга:* ${booking?.serviceName || '—'}
🗓 *Дата:* ${booking?.date || '—'}
⏰ *Время:* ${booking?.time || '—'}
  `.trim();

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${NOTIFY_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegram_id,
          text,
          parse_mode: 'Markdown',
        }),
      }
    );

    const result = await response.json();

    if (!result.ok) {
      console.error('[BeautySaaS] Telegram API error:', result.description);
      return res.status(500).json({ success: false, error: result.description });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[BeautySaaS] Ошибка отправки:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── /api/broadcast — рассылка от администратора ─────────────
// НИКОГДА не блокируется — проверки подписки нет намеренно
app.post('/api/broadcast', async (req, res) => {
  const { admin_id, message, targets } = req.body;

  // Проверяем что запрос от администратора
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
    const chatId = target.telegram_id;
    if (!chatId || !String(chatId).trim()) continue;

    try {
      const tgRes = await fetch(
        `https://api.telegram.org/bot${SUPPORT_BOT_TOKEN}/sendMessage`,
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

      const tgData = await tgRes.json();

      if (tgData.ok) {
        sent++;
      } else {
        errors.push({ id: target.id, error: tgData.description });
        console.warn(`[Broadcast] Не отправлено ${target.id}:`, tgData.description);
      }
    } catch (err) {
      errors.push({ id: target.id, error: err.message });
    }
  }

  console.log(`[Broadcast] ✅ Отправлено: ${sent}/${targets.length}`);
  return res.json({ success: true, sent, total: targets.length, errors });
});

// ─── Статика (React build) ────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ BeautySaaS server running on port ${PORT}`);
});