# BuddyOS — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-04-04  
**Status:** In sviluppo (Core Engine MVP completato)

---

## 1. Problema

L'utente sperimenta:
- Motivazione non stabile (picchi → cali)
- Difficoltà di memoria (episodica + prospettica)
- Incoerenza nei comportamenti (habits, training, nutrizione)
- Overload cognitivo
- Difficoltà nel mantenere routine

---

## 2. Obiettivo

Un'app AI agentica che funzioni come:

> 🧠 memoria esterna + 🎯 coach comportamentale + ⚡ motivatore attivo

---

## 3. Stack Tecnologico (approvato)

| Layer | Tecnologia |
|---|---|
| Backend API | FastAPI (Python 3.11+) |
| Trascrizione voce | OpenAI Whisper |
| AI task semplici | Claude Haiku (`claude-haiku-4-5-20251001`) |
| AI reasoning/coaching | Claude Sonnet (`claude-sonnet-4-6`) |
| Database | Supabase (PostgreSQL) |
| Utenti | Single-user, nessuna auth (MVP) |

---

## 4. Architettura

```
📱 App (Web/Mobile)
   ↓
🧠 Orchestrator API (FastAPI)
   ↓
🤖 Agents Layer
   ↓
🗄 Supabase (DB)
   ↓
🧠 Model Router (Haiku / Sonnet)
```

**Pipeline:** Sincrona + SSE streaming. Memory Agent in background (`asyncio.create_task`). Sessione giornaliera max 20 messaggi.

---

## 5. Roadmap Blocchi

### Blocco 1 — Core Engine ✅ COMPLETATO
**Spec:** `docs/superpowers/specs/2026-04-04-buddyos-core-engine-design.md`  
**Piano:** `docs/superpowers/plans/2026-04-04-buddyos-core-engine.md`

Componenti:
- **Orchestrator** — classifica intent con Haiku, seleziona modello, coordina SSE stream
- **Memory Agent** — riassume input, estrae entità (eventi, persone, emozioni, topic), salva su Supabase
- **API Endpoints:** `POST /chat`, `POST /voice`, `GET /memories`, `GET /health`

---

### Blocco 2 — Agents Layer ⬜ DA FARE

#### 🍽 Nutrition Agent
- Input: "ho mangiato X" (testo/voce)
- Tracking settimanale macro + micronutrienti
- Suggerimenti alimentari
- Ricette semplici → avanzate
- Storage: tabella `nutrition`

#### ✅ Task Agent
- Parsing input → task con priorità (alta/media/bassa) e categoria
- Lista task con link Google Calendar (no integrazione diretta)
- Storage: tabella `tasks`

#### 🧠 Coaching + Motivation Agent
- Riduzione frizione, micro-task, reframing
- Training Buddy: supporta link forniti dall'utente + suggerimenti automatici
- Storage: `training_links`, preferenze, obiettivi

#### 📊 Habit & Limit Agent
- Tracking abitudini (esercizio, lettura, ecc.)
- Limiti settimanali configurabili
- Progress tracking + notifiche
- Storage: tabella `habits`

---

### Blocco 3 — Proactive Engine ⬜ DA FARE

Triggers automatici basati su:
- Inattività dell'utente
- Deviazioni dai pattern abituali
- Sotto-target nutrizionali

Esempi output:
- "Hai saltato 2 giorni di allenamento"
- "Sei sotto target proteico questa settimana"
- "Di solito il giovedì leggi — vuoi farlo oggi?"

Implementazione: cron jobs + tabella eventi

---

### Blocco 4 — Frontend App ⬜ DA FARE

**Principio:** Chat-first experience

Schermate:
- **Home (Chat)** — input vocale + testo, risposta AI, quick suggestions
- **Memoria** — timeline, summary giornalieri, ricerca
- **Task** — lista, priorità, link calendario
- **Habits** — tracking, limiti, progress
- **Nutrizione** — log settimanale, suggerimenti

Stack frontend: React (web) / React Native (mobile futuro)

---

## 6. Database Schema (completo)

### Tabelle Core Engine (implementate)
```sql
memories  — id, date, raw_text, summary, entities (JSONB), created_at
sessions  — id, messages (JSONB, max 20), created_at, updated_at
```

### Tabelle Agents Layer (da creare)
```sql
tasks      — id, title, priority, category, due_date, created_at
habits     — id, type, target, current, week_start, created_at
nutrition  — id, food, nutrients (JSONB), date, created_at
training_links — id, url, category, created_at
```

---

## 7. Model Routing

| Task | Modello |
|---|---|
| Intent classification | Claude Haiku |
| Summary + entity extraction | Claude Haiku |
| Risposta semplice (solo log_memory) | Claude Haiku |
| Coaching / reasoning complesso | Claude Sonnet |
| Più di 2 intent attivi | Claude Sonnet |
| Trascrizione voce | Whisper (OpenAI) |

---

## 8. Intent Classificati

| Intent | Trigger |
|---|---|
| `log_memory` | sempre attivo |
| `log_nutrition` | cibo, pasti, bevande, calorie |
| `log_task` | qualcosa da fare, obiettivi |
| `coaching_check` | stato emotivo, difficoltà, deviazioni |
| `habit_update` | esercizio, lettura, habit tracciati |

---

## 9. SSE Stream Format

```
data: {"type": "token", "content": "Ciao"}
data: {"type": "token", "content": "!"}
data: {"type": "done", "memory_saved": true}
```

---

## 10. Gamification (futuro)

- Streaks
- Progress visivo
- Feedback positivo

⚠️ Nessun meccanismo di colpa o pressione.

---

## 11. Metriche di Successo

- Utilizzo giornaliero
- Task completati
- Coerenza habits
- Percezione controllo da parte dell'utente

---

## 12. Fuori Scope (ora)

- Auth / multi-utente
- Memory Graph (v2) — potenziale integrazione Supermemory o pgvector
- Model Router avanzato con telemetria costi
- Integrazione diretta Google Calendar
- App mobile nativa
