-- =====================================================
-- BEAUTYSAAS — ОБНОВЛЁННАЯ СХЕМА БД v2.0
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
  id                  TEXT        PRIMARY KEY,
  name                TEXT        NOT NULL,
  slug                TEXT        UNIQUE NOT NULL,
  phone               TEXT        NOT NULL DEFAULT '',

  -- Telegram интеграция
  telegram_chat_id    TEXT        DEFAULT '',
  telegram_bot_token  TEXT        DEFAULT '',
  telegram_id         TEXT        DEFAULT '',

  -- Рабочие часы и выходные
  working_hours       JSONB       DEFAULT '{"start":"09:00","end":"21:00"}'::jsonb,
  days_off            INTEGER[]   DEFAULT ARRAY[]::INTEGER[],

  -- Тариф и триал
  trial_start_date    TIMESTAMPTZ DEFAULT NOW(),
  is_premium          BOOLEAN     DEFAULT FALSE,

  -- ★ НОВОЕ v2.0: тип плана и дата окончания PRO
  plan_type           TEXT        DEFAULT 'solo'
                      CHECK (plan_type IN ('solo', 'salon')),
  premium_expires_at  TIMESTAMPTZ DEFAULT NULL,

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_profiles_slug        ON profiles(slug);
CREATE INDEX idx_profiles_is_premium  ON profiles(is_premium);
CREATE INDEX idx_profiles_plan_type   ON profiles(plan_type);

-- =====================================================
-- 2. ТАБЛИЦА: services (услуги мастера)
-- =====================================================
CREATE TABLE services (
  id          TEXT    PRIMARY KEY,
  master_id   TEXT    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  price       INTEGER NOT NULL CHECK (price >= 0),
  duration    INTEGER NOT NULL CHECK (duration > 0),
  description TEXT    DEFAULT ''
);

CREATE INDEX idx_services_master ON services(master_id);

-- =====================================================
-- 3. ТАБЛИЦА: appointments (записи клиентов)
-- =====================================================
CREATE TABLE appointments (
  id                TEXT  PRIMARY KEY,
  master_id         TEXT  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id        TEXT  NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  service_name      TEXT  NOT NULL,
  client_name       TEXT  NOT NULL,
  client_phone      TEXT  NOT NULL,
  date              TEXT  NOT NULL,
  time              TEXT  NOT NULL,
  status            TEXT  NOT NULL
                    CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  client_tg_chat_id TEXT  DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointments_master ON appointments(master_id);
CREATE INDEX idx_appointments_date   ON appointments(date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- =====================================================
-- 4. RLS — отключено
-- =====================================================
ALTER TABLE profiles     DISABLE ROW LEVEL SECURITY;
ALTER TABLE services     DISABLE ROW LEVEL SECURITY;
ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;