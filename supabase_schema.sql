-- =====================================================
-- BEAUTYSAAS — ОБНОВЛЁННАЯ СХЕМА БД
-- Запустите в Supabase Dashboard → SQL Editor
-- =====================================================

-- Удаляем старые таблицы
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- =====================================================
-- 1. ТАБЛИЦА: profiles (мастера)
-- =====================================================
CREATE TABLE profiles (
  -- Supabase Auth UUID (совпадает с auth.users.id)
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  slug          TEXT        UNIQUE NOT NULL,
  phone         TEXT        NOT NULL DEFAULT '',

  -- Telegram интеграция
  telegram_chat_id    TEXT  DEFAULT '',
  telegram_bot_token  TEXT  DEFAULT '',
  telegram_id         TEXT  DEFAULT '',     -- ← НОВОЕ: привязка через /start бот

  -- Рабочие часы и выходные
  working_hours JSONB       DEFAULT '{"start":"09:00","end":"21:00"}'::jsonb,
  days_off      INTEGER[]   DEFAULT ARRAY[]::INTEGER[],

  -- Тариф и триал
  trial_start_date  TIMESTAMPTZ DEFAULT NOW(),   -- ← НОВОЕ: дата начала 14-дневного триала
  is_premium        BOOLEAN     DEFAULT FALSE,   -- ← НОВОЕ: флаг платного тарифа

  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_profiles_slug ON profiles(slug);
CREATE INDEX idx_profiles_is_premium ON profiles(is_premium);

-- =====================================================
-- 2. ТАБЛИЦА: services (услуги мастера)
-- =====================================================
CREATE TABLE services (
  id          TEXT    PRIMARY KEY,
  master_id   TEXT    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  price       INTEGER NOT NULL CHECK (price >= 0),
  duration    INTEGER NOT NULL CHECK (duration > 0),  -- в минутах
  description TEXT    DEFAULT ''
);

CREATE INDEX idx_services_master ON services(master_id);

-- =====================================================
-- 3. ТАБЛИЦА: appointments (записи клиентов)
-- =====================================================
CREATE TABLE appointments (
  id            TEXT  PRIMARY KEY,
  master_id     TEXT  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id    TEXT  NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  service_name  TEXT  NOT NULL,
  client_name   TEXT  NOT NULL,
  client_phone  TEXT  NOT NULL,
  date          TEXT  NOT NULL,  -- строго 'YYYY-MM-DD'
  time          TEXT  NOT NULL,  -- строго 'HH:MM' (24-часовой)
  status        TEXT  NOT NULL
                CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  -- Telegram уведомления клиенту (опционально)
  client_tg_chat_id TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointments_master ON appointments(master_id);
CREATE INDEX idx_appointments_date   ON appointments(date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- =====================================================
-- 4. RLS — отключено для упрощения
-- (включите после добавления row-level политик)
-- =====================================================
ALTER TABLE profiles     DISABLE ROW LEVEL SECURITY;
ALTER TABLE services     DISABLE ROW LEVEL SECURITY;
ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. ФУНКЦИЯ автоматического создания профиля
--    при регистрации через email (опционально)
-- =====================================================
-- Если хотите автоматически создавать пустой профиль при регистрации:
/*
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, slug, phone, trial_start_date)
  VALUES (
    NEW.id::text,
    '',                              -- заполнит онбординг
    'user-' || LEFT(NEW.id::text, 8),
    '',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
*/

-- =====================================================
-- 6. ТЕСТОВЫЕ ДАННЫЕ (раскомментируйте при необходимости)
-- =====================================================
/*
INSERT INTO profiles
  (id, name, slug, phone, telegram_chat_id, working_hours, days_off, trial_start_date, is_premium)
VALUES (
  'demo-master-001',
  'Елена Смирнова',
  'elena-smirnova',
  '+7 (999) 123-45-67',
  '',
  '{"start":"09:00","end":"21:00"}'::jsonb,
  ARRAY[0,6],
  NOW(),
  FALSE
);

INSERT INTO services (id, master_id, name, price, duration, description) VALUES
  ('svc-001', 'demo-master-001', 'Маникюр классический',  1500, 60,  'С покрытием гель-лаком'),
  ('svc-002', 'demo-master-001', 'Педикюр аппаратный',    2500, 90,  'Аппаратный + покрытие'),
  ('svc-003', 'demo-master-001', 'Наращивание ногтей',    3500, 120, 'Гель или акрил');
*/

-- =====================================================
-- ГОТОВО! Schema применена.
-- =====================================================