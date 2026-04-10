-- Supabase Schema for BuddyOS Core Engine
--
-- USAGE INSTRUCTIONS:
-- 1. Go to Supabase dashboard (https://app.supabase.com)
-- 2. Select your project
-- 3. Navigate to the SQL Editor
-- 4. Create a new query and paste the entire contents of this file
-- 5. Click "Run" to execute all statements
--
-- This creates tables for storing user memories and conversation sessions.
-- See docs/REQUIREMENTS.md for detailed schema documentation.

-- Tabella memories: ogni messaggio dell'utente viene memorizzato qui
CREATE TABLE IF NOT EXISTS memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_text    TEXT NOT NULL,
  summary     TEXT,
  tags        JSONB DEFAULT '[]',
  entities    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella sessions: cronologia conversazione giornaliera (max 20 msg)
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  messages    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index per recuperare rapidamente la sessione di oggi
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);

-- Index per recuperare memorie in ordine cronologico
CREATE INDEX IF NOT EXISTS idx_memories_date ON memories(date DESC);

-- Esercizi dal piano di allenamento (popolato da load_training.py)
CREATE TABLE IF NOT EXISTS training_exercises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block         CHAR(1) NOT NULL,
  drill_id      TEXT,
  exercise_name TEXT NOT NULL,
  sets          TEXT,
  reps          TEXT,
  rest          TEXT,
  month_focus   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(block, exercise_name)
);

-- Link video per esercizio (cache YouTube + link manuali)
CREATE TABLE IF NOT EXISTS training_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_name TEXT NOT NULL UNIQUE,
  url           TEXT NOT NULL,
  title         TEXT,
  source        TEXT NOT NULL DEFAULT 'youtube',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_exercises_block ON training_exercises(block);
CREATE INDEX IF NOT EXISTS idx_training_links_exercise ON training_links(exercise_name);

-- Log giornaliero pasti
CREATE TABLE IF NOT EXISTS nutrition_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_description TEXT NOT NULL,
  nutrients        JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Piano nutrizionale personalizzato (unico record)
CREATE TABLE IF NOT EXISTS nutrition_plan (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diet_type    TEXT NOT NULL DEFAULT 'omnivore',
  allergies    TEXT[] NOT NULL DEFAULT '{}',
  targets      JSONB NOT NULL DEFAULT '{}',
  foods        JSONB NOT NULL DEFAULT '{}',
  notes        TEXT,
  source       TEXT NOT NULL DEFAULT 'generated',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_logs_date ON nutrition_logs(date DESC);

-- Definizioni habit e limit configurati dall'utente
CREATE TABLE IF NOT EXISTS habit_definitions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  habit_type TEXT NOT NULL DEFAULT 'habit',  -- 'habit' | 'limit'
  unit       TEXT NOT NULL DEFAULT '',
  target     FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log giornaliero di ogni entry
CREATE TABLE IF NOT EXISTS habit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id    UUID NOT NULL REFERENCES habit_definitions(id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  value       FLOAT NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_id ON habit_logs(habit_id);

-- Ingredienti disponibili nel frigo (store)
CREATE TABLE IF NOT EXISTS fridge_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  quantity   FLOAT NOT NULL DEFAULT 0,
  unit       TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fridge_items_name ON fridge_items(name);

-- Token Expo Push per invio notifiche
CREATE TABLE IF NOT EXISTS push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log completamento allenamento giornaliero (per adaptive reminder)
CREATE TABLE IF NOT EXISTS training_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
  completed  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_logs_date ON training_logs(date DESC);

-- Aggiunta reminder_time a habit_definitions
ALTER TABLE habit_definitions
  ADD COLUMN IF NOT EXISTS reminder_time TIME DEFAULT NULL;

-- Colonna tags per memories
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';

-- Impostazioni utente (unico record)
CREATE TABLE IF NOT EXISTS user_settings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_time           TEXT NOT NULL DEFAULT '08:00',
  training_reminder_time TEXT NOT NULL DEFAULT '09:00',
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
