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
