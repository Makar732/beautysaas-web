-- =====================================================
-- BEAUTYSAAS DATABASE SCHEMA FOR SUPABASE
-- =====================================================

-- Удаляем старые таблицы (если существуют)
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- =====================================================
-- 1. ТАБЛИЦА: profiles (мастера)
-- =====================================================
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  telegram_chat_id TEXT DEFAULT '',
  telegram_bot_token TEXT DEFAULT '',
  working_hours JSONB DEFAULT '{"start": "00:00", "end": "24:00"}'::jsonb,
  days_off INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для быстрого поиска по slug
CREATE INDEX idx_profiles_slug ON profiles(slug);

-- =====================================================
-- 2. ТАБЛИЦА: services (услуги)
-- =====================================================
CREATE TABLE services (
  id TEXT PRIMARY KEY,
  master_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  duration INTEGER NOT NULL CHECK (duration > 0),
  description TEXT DEFAULT ''
);

-- Индекс для быстрой выборки услуг мастера
CREATE INDEX idx_services_master ON services(master_id);

-- =====================================================
-- 3. ТАБЛИЦА: appointments (записи клиентов)
-- =====================================================
CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  master_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  date TEXT NOT NULL, -- ✅ Строго 'YYYY-MM-DD' (без UTC-конвертации)
  time TEXT NOT NULL, -- ✅ Формат 'HH:MM' (24-часовой)
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для быстрой выборки
CREATE INDEX idx_appointments_master ON appointments(master_id);
CREATE INDEX idx_appointments_date ON appointments(date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- =====================================================
-- 4. RLS POLICIES (Row Level Security)
-- =====================================================
-- Отключаем RLS для упрощения (можно включить позже для безопасности)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE services DISABLE ROW LEVEL SECURITY;
ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. ТЕСТОВЫЕ ДАННЫЕ (опционально)
-- =====================================================
-- Раскомментируй для добавления тестового мастера

/*
INSERT INTO profiles (id, name, slug, phone, telegram_chat_id, working_hours, days_off, created_at)
VALUES (
  'master-test-001',
  'Елена Смирнова',
  'elena-smirnova',
  '+7 (999) 123-45-67',
  '123456789',
  '{"start": "09:00", "end": "21:00"}'::jsonb,
  ARRAY[0, 6], -- Воскресенье и суббота выходные
  NOW()
);

INSERT INTO services (id, master_id, name, price, duration, description)
VALUES 
  ('service-001', 'master-test-001', 'Маникюр классический', 1500, 60, 'Классический маникюр с покрытием'),
  ('service-002', 'master-test-001', 'Педикюр аппаратный', 2500, 90, 'Аппаратный педикюр с покрытием гель-лаком');
*/

-- =====================================================
-- ГОТОВО! Запусти этот скрипт в SQL Editor Supabase
-- =====================================================