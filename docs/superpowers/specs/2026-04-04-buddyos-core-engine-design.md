# BuddyOS — Core Engine Design Spec

**Date:** 2026-04-04  
**Scope:** Core Engine MVP (Orchestrator + Memory Agent + DB)  
**Status:** Approved

---

## 1. Overview

BuddyOS è un companion comportamentale agentico. Il Core Engine è la fondamenta su cui si appoggiano tutti gli altri moduli (Task, Nutrition, Coaching, Habit Agent). Gestisce input testo e voce, orchestra gli agenti, salva le memorie e restituisce risposte in streaming.

---

## 2. Stack Tecnologico

| Layer | Tecnologia | Motivo |
|---|---|---|
| Backend API | FastAPI (Python 3.11+) | Ecosistema AI maturo, async nativo, streaming facile |
| Trascrizione voce | OpenAI Whisper | Unica opzione economica e affidabile ($0.006/min) |
| AI — task semplici | Claude Haiku (Anthropic) | ~$0.08/1M token, ottimo per classificazione e summary |
| AI — reasoning | Claude Sonnet (Anthropic) | ~$3/1M token, per coaching e risposte complesse |
| Database | Supabase (PostgreSQL) | DB + storage audio in un unico servizio |
| Utenti | Single-user (nessuna auth) | MVP personale, nessuna complessità auth |

---

## 3. Architettura

### Principio

Pipeline sincrona con **streaming SSE** della risposta finale. La memoria viene salvata in modo asincrono (non blocca lo streaming).

### Data Flow — Input Testo

```
POST /chat {text}
  ↓
Orchestrator
  ├─ Claude Haiku: classifica intent → [log_memory, coaching, ...]
  ├─ Memory Agent → Supabase (async, non blocca)
  └─ Claude Sonnet: genera risposta in streaming
  ↓
SSE stream → Frontend (token per token)
```

### Data Flow — Input Voce

```
POST /voice {audio_file}
  ↓
Whisper (OpenAI) → testo trascritto
  ↓
[identico a /chat]
```

---

## 4. Orchestrator

**Responsabilità:** ricevere l'input, classificare l'intent con Claude Haiku, decidere quali agenti attivare, coordinare la risposta.

**Intent classification (Claude Haiku):**

Input → lista di intent attivi tra:
- `log_memory` — sempre attivo
- `log_nutrition` — se l'input contiene cibo/pasti
- `log_task` — se l'input contiene un'azione da fare
- `coaching_check` — se l'input esprime stato emotivo o deviazione da abitudini
- `habit_update` — se l'input aggiorna un habit tracciato

**Output orchestrator:**

```json
{
  "intent": ["log_memory", "coaching_check"],
  "tone": "motivational",
  "agents": ["MemoryAgent"],
  "context": { "raw_text": "...", "transcript": "..." }
}
```

**Scelta modello per risposta finale:**
- Se intent contiene solo `log_memory` → Claude Haiku
- Se intent contiene `coaching_check` o reasoning complesso → Claude Sonnet

---

## 5. Memory Agent

**Responsabilità:** ricevere il testo, produrre un summary strutturato, estrarre entità, salvare su Supabase.

**Processing:**
1. Riassume il testo con Claude Haiku (prompt dedicato)
2. Estrae entità strutturate (stesso prompt, output JSON)
3. Salva nella tabella `memories`

**Entità estratte:**
- `events` — azioni, fatti accaduti
- `people` — persone menzionate
- `emotions` — stato emotivo rilevato
- `topics` — argomenti principali (cibo, sport, lavoro, ecc.)

**Eseguito in background** (`asyncio.create_task`) per non bloccare lo streaming della risposta.

---

## 6. Database Schema (Supabase)

### Tabella `memories`

```sql
CREATE TABLE memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_text    TEXT NOT NULL,
  summary     TEXT,
  entities    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Tabella `sessions`

```sql
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  messages    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> `sessions` mantiene la cronologia della conversazione per dare contesto a Claude nelle richieste successive. Una nuova sessione viene creata ogni giorno (reset alla mezzanotte). Vengono tenuti al massimo gli ultimi 20 messaggi per non sforare il context window. `updated_at` viene aggiornato programmaticamente ogni volta che si aggiunge un messaggio.

---

## 7. API Endpoints

| Method | Path | Descrizione | Response |
|---|---|---|---|
| POST | `/chat` | Input testo | StreamingResponse (SSE) |
| POST | `/voice` | Input audio (multipart/form-data) | StreamingResponse (SSE) |
| GET | `/memories?limit=20&offset=0` | Lista memorie (paginata) | JSON |
| GET | `/health` | Status check | JSON |

### Formato SSE

```
data: {"type": "token", "content": "Ciao"}
data: {"type": "token", "content": "!"}
data: {"type": "done", "memory_saved": true}
```

---

## 8. Struttura Progetto

```
buddyos/
├── backend/
│   ├── main.py              # FastAPI app, endpoints
│   ├── orchestrator.py      # Intent classification, routing
│   ├── agents/
│   │   └── memory.py        # Memory Agent
│   ├── services/
│   │   ├── whisper.py       # Trascrizione audio
│   │   ├── claude.py        # Client Anthropic (Haiku + Sonnet)
│   │   └── supabase.py      # DB client
│   ├── models.py            # Pydantic request/response schemas
│   └── config.py            # Settings (carica .env)
├── docs/
│   └── superpowers/specs/   # Design docs
└── .env                     # API keys (non committare)
```

---

## 9. Error Handling

- **Whisper fallisce:** restituisce errore 400 con messaggio chiaro, non crasha l'app
- **Claude non risponde:** timeout di 30s, errore 503 con retry suggerito
- **Supabase non raggiungibile:** la risposta viene comunque streamata, il salvataggio viene loggato come fallito (non bloccante)
- **Audio non supportato:** validazione formato (mp3, mp4, wav, m4a) prima di chiamare Whisper

---

## 10. Testing

- **Unit:** `pytest` su Orchestrator (intent classification) e Memory Agent (entity extraction) con risposte Claude mockate
- **Integration:** test end-to-end su `/chat` con Supabase locale (Docker)
- **Manual:** Postman/curl per verificare SSE stream

---

## 11. Miglioramenti rispetto al PRD originale

1. **Backend framework esplicitato:** FastAPI — il PRD non lo specificava
2. **Model routing concreto:** Haiku per classificazione/summary, Sonnet per coaching — non più "cheap/strong model"
3. **Intent classification separata:** step dedicato con Haiku prima dell'agent routing
4. **Single-user esplicito:** nessuna auth, nessun row-level security per MVP
5. **SSE streaming:** risposta fluida invece di risposta bloccante
6. **Tabella `sessions`:** contesto conversazionale per Claude (mancava nel PRD)
7. **Memory Agent asincrono:** non blocca lo streaming della risposta

---

## 12. Fuori Scope (MVP)

- Auth / multi-utente
- Task Agent, Nutrition Agent, Coaching Agent, Habit Agent
- Proactive Engine (notifiche, cron)
- Model Router avanzato
- Frontend app
- Memory Graph (v2)
