# BuddyOS — Frontend Design Spec

**Date:** 2026-04-07
**Scope:** App mobile React Native + Expo (Blocco 4)
**Status:** Approved

---

## 1. Stack Tecnico

| Layer | Scelta |
|---|---|
| Framework | React Native + Expo SDK 52 |
| Styling | NativeWind v4 (Tailwind CSS per RN) |
| Navigazione | React Navigation v7 (Bottom Tabs + Stack) |
| State | Zustand |
| Animazioni | React Native Reanimated 3 |
| Voce | `expo-av` (registrazione) + WebSocket/SSE streaming |
| Notifiche | `expo-notifications` |
| Immagini | `expo-image` |
| Icone | `@expo/vector-icons` (Ionicons) |
| Form inputs | Controlled TextInput + KeyboardAvoidingView |
| Tipo | TypeScript strict |

---

## 2. Design System (da UI/UX Pro Max)

### Stile: Dark Mode OLED + Micro-interactions

**Perché:**
- App usata mattino/sera → eye-friendly, OLED power-efficient
- Companion personale → atmosfera intima, non corporate
- Micro-interactions: feedback tattile immediato → Nielsen #1 (visibilità stato)

### Palette colori

```
Background:     #000000 (OLED black)
Surface:        #121212 (card, modal)
Surface2:       #1E1E1E (input, tab bar)
Primary:        #22D3EE (Cyan — salute, calma)
Primary Dark:   #0891B2
Accent:         #22C55E (Green — successo, habit ok)
Warning:        #F59E0B (Amber — ATTENZIONE)
Error:          #EF4444 (Red — SUPERATO, errore)
Text Primary:   #FFFFFF
Text Secondary: #94A3B8
Border:         #2D2D2D
```

### Tipografia: Space Grotesk + DM Sans

```
Heading:  Space Grotesk (400, 500, 600, 700) — tech, moderno, AI
Body:     DM Sans (400, 500, 700) — leggibile, friendly
```

**Gerarchia:**
- H1: Space Grotesk 700, 28px
- H2: Space Grotesk 600, 22px
- H3: Space Grotesk 500, 18px
- Body: DM Sans 400, 16px (min per accessibilità)
- Caption: DM Sans 400, 13px, #94A3B8

### Border radius
```
Card:    16px
Button:  12px
Input:   12px
Chip:    999px (pill)
```

### Animazioni (Reanimated)
```
Micro-interaction:  50–100ms ease-out
Standard:           200–300ms ease-out
Page transition:    300ms ease-in-out
```

---

## 3. Nielsen's 10 Euristiche — Applicazione

| Euristica | Come applicata in BuddyAI |
|---|---|
| 1. Visibilità stato sistema | Spinner durante stream SSE, indicatore "BuddyAI sta scrivendo...", badge notifica habit |
| 2. Match sistema / mondo reale | Icone intuitive, nomi italiani, zero gergo tecnico |
| 3. Controllo e libertà | "Annulla" su ogni azione distruttiva, swipe-to-delete con conferma |
| 4. Consistenza e standard | Tab bar sempre visibile, stessi colori per stesso tipo di alert ovunque |
| 5. Prevenzione errori | Confirm modal prima di eliminare habit/memoria, input validati live |
| 6. Riconoscimento > ricordo | Habit e pasti suggeriti come chip cliccabili, log recenti visibili |
| 7. Flessibilità ed efficienza | Chat vocale per utenti veloci, tap diretto per utenti che preferiscono touch |
| 8. Design estetico e minimale | Solo info necessarie per schermata, niente decorazioni superflue |
| 9. Riconoscimento e recupero errori | Errore API → messaggio chiaro + tasto Riprova, mai crash silenzioso |
| 10. Help e documentazione | Onboarding al primo avvio (3 schermate), tooltip contestuali inline |

---

## 4. Struttura Navigazione

```
Root Stack
├── Onboarding (solo primo avvio)
└── Main (Bottom Tab Navigator)
    ├── Tab: Chat          (icona: mic)
    ├── Tab: Dashboard     (icona: grid)
    ├── Tab: Journal       (icona: book-outline)
    └── Tab: Impostazioni  (icona: settings-outline)
        
Stack dentro Dashboard:
├── TrainingScreen
├── TrainingDetailScreen  (esercizi del giorno)
├── HabitListScreen
├── HabitDetailScreen     (modifica, reminder)
├── NutritionScreen
├── FridgeScreen          (store ingredienti)
└── MealSuggestionScreen
```

---

## 5. Schermate — Dettaglio

---

### 5.1 ChatScreen (Tab principale)

**Entry point dell'app.** Voice-first.

**Layout:**
```
┌─────────────────────────────┐
│ [BuddyAI]          [⚙]     │  ← header minimal
├─────────────────────────────┤
│                             │
│   ScrollView messaggi       │  ← FlatList invertita
│   (bubble user + bubble AI) │
│                             │
├─────────────────────────────┤
│ [🎤 Tieni premuto]  [⌨ ]   │  ← input bar
└─────────────────────────────┘
```

**Componenti:**
- `MessageBubble` — user: cyan bg; AI: surface bg, testo bianco
- `VoiceButton` — Pressable con long-press → `expo-av` registrazione → `POST /voice`
- `TextInputBar` — fallback testo → `POST /chat`
- `StreamingIndicator` — "BuddyAI sta scrivendo..." con dot animation (Reanimated)
- SSE streaming: token per token → aggiorna bubble AI in tempo reale
- Scroll automatico all'ultimo messaggio

**Nielsen:** #1 (streaming visibile), #3 (stop voice con rilascio), #8 (minimal header)

---

### 5.2 DashboardScreen (Tab)

**Overview settimanale a colpo d'occhio.**

**Layout:**
```
┌─────────────────────────────┐
│ Buongiorno, Jump 👋          │
│ Lunedì 7 aprile             │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ 🏋 Allenamento oggi      │ │  ← TrainingCard (tap → TrainingDetailScreen)
│ │ Blocco A  [Inizia →]    │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ Habit settimana             │
│ ┌──────┐ ┌──────┐ ┌──────┐ │
│ │Lettura│ │Acqua │ │Alcol │ │  ← HabitChip (colore = stato)
│ │ 71%  │ │ 45%  │ │ATTN  │ │
│ └──────┘ └──────┘ └──────┘ │
├─────────────────────────────┤
│ Nutrizione oggi             │
│ Calorie 1200/2000  [+Log]  │
│ Prot 45/150g               │
└─────────────────────────────┘
```

**Componenti:**
- `TrainingCard` — blocco del giorno + CTA "Inizia" (naviga a TrainingDetailScreen)
- `HabitChip` — colore: cyan=ok, amber=ATTENZIONE, red=SUPERATO, grey=BASSO
- `NutritionBar` — barra progresso calorie + macro principali
- Pull-to-refresh → ricarica tutti i dati

**Nielsen:** #6 (tutto visibile senza navigare), #4 (colori consistenti)

---

### 5.3 TrainingDetailScreen

**Schermata allenamento del giorno.**

**Layout:**
```
┌─────────────────────────────┐
│ ← Blocco A — Oggi           │
├─────────────────────────────┤
│ FlatList esercizi:          │
│ ┌─────────────────────────┐ │
│ │ Squat                   │ │
│ │ 4x8 · Riposo 90s        │ │
│ │ [▶ Video]               │ │  ← apre link YouTube
│ └─────────────────────────┘ │
│ ...                         │
├─────────────────────────────┤
│ [✓ Allenamento completato]  │  ← POST /training/complete
└─────────────────────────────┘
```

- CTA "Completato" → POST `/training/complete` → toast successo → torna Dashboard
- Badge verde su TrainingCard in Dashboard

**Nielsen:** #1 (stato completamento visibile), #3 (← back)

---

### 5.4 HabitListScreen

**CRUD completo delle habit.**

**Layout:**
```
┌─────────────────────────────┐
│ ← Habit & Limiti      [+]  │
├─────────────────────────────┤
│ FlatList habit:             │
│ ┌─────────────────────────┐ │
│ │ 📚 Lettura   habit      │ │
│ │ 300/420 min · 71%       │ │
│ │ ⏰ 21:00                 │ │  ← reminder impostato
│ └─────────────────────────┘ │
│ (swipe left → elimina)      │
├─────────────────────────────┤
│ [+ Aggiungi via chat]       │  ← naviga a ChatScreen con prefill
└─────────────────────────────┘
```

- Swipe-to-delete con confirm modal (Nielsen #3, #5)
- Tap → HabitDetailScreen (modifica nome, target, reminder)
- `[+]` header → HabitDetailScreen vuoto (crea nuova)

---

### 5.5 HabitDetailScreen

**Modifica habit + impostazione reminder.**

**Campi:**
- Nome (TextInput)
- Tipo: habit / limit (SegmentedControl)
- Unità (TextInput: min, g, ml, unità…)
- Target settimanale (TextInput numerico)
- Reminder time (TimePicker → `PATCH habit_definitions`)

**Salva:** PATCH `/habit_definitions/{id}` (da aggiungere al backend)

---

### 5.6 NutritionScreen

**Log pasti + overview.**

**Layout:**
```
┌─────────────────────────────┐
│ ← Nutrizione         [🛒]  │  ← [🛒] → FridgeScreen
├─────────────────────────────┤
│ Oggi — 1200/2000 kcal       │
│ ████████░░░░░░░ 60%         │
├─────────────────────────────┤
│ Log pasti:                  │
│ • Colazione: uova riso (08:30)│
│ • Pranzo: pollo (13:00)     │
├─────────────────────────────┤
│ [+ Log pasto]               │  ← TextInput → POST /chat
│ [💡 Cosa mangio?]           │  ← meal_suggestion intent
└─────────────────────────────┘
```

---

### 5.7 FridgeScreen

**Store ingredienti disponibili.**

**Layout:**
```
┌─────────────────────────────┐
│ ← Frigo                    │
├─────────────────────────────┤
│ FlatList ingredienti:       │
│ • Pollo   500g    [−]      │
│ • Riso    300g    [−]      │
├─────────────────────────────┤
│ [+ Aggiungi via chat]       │
└─────────────────────────────┘
```

- `[−]` → remove_fridge_items → aggiorna lista
- `[+ Aggiungi via chat]` → ChatScreen con "ho comprato …" prefill

---

### 5.8 JournalScreen (Tab)

**Memorie e check-in con filtri e raggruppamenti.**

**Layout:**
```
┌─────────────────────────────┐
│ Journal                     │
│ [Tutti ▾] [Data ▾] [Mood ▾]│  ← filtri
├─────────────────────────────┤
│ ── 7 aprile 2026 ──         │  ← raggruppamento per giorno
│ ┌─────────────────────────┐ │
│ │ Check-in mattutino      │ │
│ │ "Mi sento carico oggi…" │ │
│ │ 08:02                   │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Memoria                 │ │
│ │ "Ho parlato con Marco…" │ │
│ └─────────────────────────┘ │
│ ── 6 aprile 2026 ──         │
│ ...                         │
└─────────────────────────────┘
```

**Filtri:**
- Tipo: Tutti / Check-in / Memoria / Task / Emozione
- Data: range picker (settimana, mese, custom)
- Mood: positivo / neutro / negativo (da `entities.emotions`)

**Raggruppamenti:**
- Per giorno (default)
- Per settimana
- Per tema (da `entities.topics`)

**Azioni su ogni card:**
- Tap → expand testo completo
- Long-press → menu (Copia, Elimina)
- Elimina con confirm modal (Nielsen #5)

---

### 5.9 ImpostazioniScreen (Tab)

```
┌─────────────────────────────┐
│ Impostazioni                │
├─────────────────────────────┤
│ Notifiche                   │
│  Check-in mattutino   08:00 │  ← TimePicker → .env backend (o API)
│  Reminder allenamento 09:00 │
├─────────────────────────────┤
│ Profilo nutrizionale        │
│  Dieta: omnivore            │  ← naviga a NutritionPlanScreen
│  Target calorie: 2000       │
├─────────────────────────────┤
│ Versione 0.2.0              │
└─────────────────────────────┘
```

---

## 6. Struttura File Progetto

```
frontend/
├── app.json
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── App.tsx                        # Root navigator + NotificationHandler
├── src/
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   ├── TabNavigator.tsx
│   │   └── types.ts               # RootStackParamList, TabParamList
│   ├── screens/
│   │   ├── ChatScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── TrainingDetailScreen.tsx
│   │   ├── HabitListScreen.tsx
│   │   ├── HabitDetailScreen.tsx
│   │   ├── NutritionScreen.tsx
│   │   ├── FridgeScreen.tsx
│   │   ├── JournalScreen.tsx
│   │   └── ImpostazioniScreen.tsx
│   ├── components/
│   │   ├── MessageBubble.tsx
│   │   ├── VoiceButton.tsx
│   │   ├── StreamingIndicator.tsx
│   │   ├── HabitChip.tsx
│   │   ├── TrainingCard.tsx
│   │   ├── NutritionBar.tsx
│   │   ├── JournalCard.tsx
│   │   ├── ConfirmModal.tsx
│   │   └── ErrorView.tsx
│   ├── store/
│   │   ├── chatStore.ts           # Zustand: messaggi, streaming state
│   │   ├── habitStore.ts          # Zustand: habit definitions + logs
│   │   ├── nutritionStore.ts      # Zustand: logs giornalieri, piano
│   │   └── journalStore.ts        # Zustand: memorie + filtri attivi
│   ├── services/
│   │   ├── api.ts                 # base URL, fetch helpers
│   │   ├── sse.ts                 # SSE streaming parser
│   │   └── notifications.ts      # expo-notifications setup + token reg
│   ├── hooks/
│   │   ├── useVoiceRecorder.ts
│   │   └── useSSEStream.ts
│   └── constants/
│       ├── colors.ts
│       ├── typography.ts
│       └── theme.ts
```

---

## 7. API Backend Necessarie (da aggiungere)

| Endpoint | Metodo | Scopo |
|---|---|---|
| `/habits` | GET | Lista habit definitions + totali settimana |
| `/habits/{id}` | PATCH | Modifica habit (nome, target, reminder_time) |
| `/habits/{id}` | DELETE | Elimina habit |
| `/fridge` | GET | Lista ingredienti frigo |
| `/nutrition/logs` | GET | Log pasti (filtro per data) |
| `/memories` | GET | Già presente (limit, offset) — aggiungere filtri |
| `/memories/{id}` | DELETE | Elimina memoria |
| `/training/today` | GET | Già presente |
| `/training/complete` | POST | Già presente |
| `/push/token` | POST | Già presente |

---

## 8. Dipendenze npm

```json
{
  "expo": "~52.0.0",
  "react-native": "0.76.x",
  "nativewind": "^4.0.0",
  "tailwindcss": "^3.4.0",
  "@react-navigation/native": "^7.0.0",
  "@react-navigation/bottom-tabs": "^7.0.0",
  "@react-navigation/native-stack": "^7.0.0",
  "react-native-reanimated": "~3.10.0",
  "react-native-gesture-handler": "~2.20.0",
  "react-native-safe-area-context": "^4.10.0",
  "react-native-screens": "~4.0.0",
  "expo-av": "~15.0.0",
  "expo-notifications": "~0.29.0",
  "expo-image": "~2.0.0",
  "expo-font": "~13.0.0",
  "zustand": "^5.0.0",
  "@expo/vector-icons": "^14.0.0"
}
```

---

## 9. Onboarding (primo avvio)

3 schermate swipeable:
1. **"Ciao, sono BuddyAI"** — cosa fa l'app
2. **"Parliamo"** — spiega la chat vocale
3. **"Iniziamo"** → richiede permesso notifiche → registra Expo Push Token via `POST /push/token`

---

## 10. Fuori Scope MVP Frontend

- Grafici/charts storici (multi-settimana)
- Tema chiaro (solo dark OLED)
- Localizzazione multi-lingua
- Offline mode / sync
- Animazioni di pagina complesse
- Widget home screen
- Apple Watch / WearOS
