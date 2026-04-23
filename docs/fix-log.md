# BuddyAI Fix Log

Data: 2026-04-23
Branch: feature/habit-agent
Backend live: https://buddyai-505250600889.europe-west1.run.app
APK build in corso: https://expo.dev/accounts/jummmp/projects/buddyai/builds/e199b057-3560-4bfd-95c8-c39cf44fff9e

Questo file tiene traccia dei fix ancora da chiudere prima del prossimo APK finale.

## P0 - Blocca esperienza utente

### 1. YouTube deve restare davvero in app
Stato: fix applicato, da testare su APK

Problema:
- Il crash su web e' stato evitato con lazy require della WebView.
- Su Android il fallback non apre piu' YouTube esterno.
- Se YouTube blocca embed, resta una schermata interna con CTA per sostituire link.

File coinvolti:
- `frontend/src/screens/TrainingDetailScreen.tsx`

Fix applicato:
- WebView nativa ora carica un HTML wrapper interno con iframe YouTube.
- URL embed usa `youtube.com/embed` con `origin`, `enablejsapi=1`, `playsinline=1`.
- Rimossa apertura automatica via `Linking.openURL`.
- Fallback interno con "Sostituisci link video".

Criterio done:
- Toccando "Play Overlay" il video rimane dentro modal app.
- Nessun redirect automatico a YouTube.
- Web e Android non crashano.

### 2. Push notifications affidabili su Cloud Run
Stato: diagnostica applicata, scheduling cloud ancora da completare

Problema:
- L'app registra token Expo all'avvio.
- Backend salva token e invia push.
- Ma i reminder dipendono da `AsyncIOScheduler` dentro FastAPI.
- Su Cloud Run con istanze a zero, i job possono non partire se il container dorme.
- `send_push` non controlla la risposta Expo, quindi eventuali errori token restano invisibili.

File coinvolti:
- `frontend/App.tsx`
- `frontend/src/services/notifications.ts`
- `backend/services/scheduler.py`
- `backend/services/push.py`
- `backend/jobs/training_reminder.py`
- `backend/jobs/habit_reminder.py`
- `backend/jobs/morning_checkin.py`

Fix da fare:
- Aggiungere endpoint manuali protetti per triggerare job da Cloud Scheduler, tipo `/triggers/training-reminder`.
- Usare Google Cloud Scheduler per chiamare gli endpoint agli orari corretti, oppure impostare min instances > 0.

Fix applicato:
- `send_push` ora ritorna `{sent, status_code, expo}` e logga errori Expo.
- Aggiunto endpoint `/push/test`.
- Impostazioni mostra stato permesso push e bottoni "Enable Token" + "Test Push".

Criterio done:
- Test trigger push manuale produce notifica sul telefono.
- Errori Expo vengono loggati.
- Reminder non dipende dal fatto che Cloud Run sia gia' caldo.

## P1 - Dati e tracking

### 3. Habit type non si aggiorna da edit
Stato: fix applicato, da testare su APK

Problema:
- La UI manda `habit_type` quando cambi Habit/Limit.
- Il backend `HabitUpdateRequest` non include `habit_type`.
- Risultato: il cambio tipo sembra possibile ma non viene salvato.

File coinvolti:
- `frontend/src/screens/HabitDetailScreen.tsx`
- `backend/api/habits.py`
- `backend/services/supabase.py`

Fix applicato:
- Aggiunto `habit_type` a `HabitUpdateRequest`.
- Validazione valori ammessi: `habit`, `limit`.
- La UI gia' invia il campo quando cambia tipo.

Criterio done:
- Modifico una habit da Habit a Limit.
- Torno alla lista.
- Riapro detail e vedo il tipo corretto persistito.

### 4. Free training deve contare anche nei reminder adattivi
Stato: fix applicato, da testare con trigger reminder

Problema:
- Dashboard conta training programmato + free training.
- Pero' `training_reminder.adaptive_recheck()` usa `get_training_log_today()`, che legge solo `training_logs`.
- Se faccio solo allenamento libero, il sistema potrebbe notificare "non hai fatto allenamento".

File coinvolti:
- `backend/jobs/training_reminder.py`
- `backend/services/supabase.py`
- `backend/api/push.py`

Fix applicato:
- Creato helper `get_training_completed_today_including_free()`.
- Il primo reminder e il re-check adattivo ora saltano se oggi esiste training programmato o free log.

Criterio done:
- Dopo un free training log di oggi, `/training/status` torna `completed: true`.
- Il re-check training non invia seconda notifica.

### 5. Applicare schema Supabase per free_training_logs
Stato: da verificare su ambiente reale

Problema:
- `docs/sql/schema.sql` contiene la tabella.
- Non abbiamo conferma che la tabella sia stata eseguita nel Supabase live.
- Il backend e' tollerante in lettura, ma il salvataggio free log richiede tabella esistente.

File coinvolti:
- `docs/sql/schema.sql`
- `backend/api/push.py`
- `backend/orchestrator.py`

Fix da fare:
- Eseguire su Supabase il blocco `free_training_logs`.
- Fare test POST `/training/free-log`.
- Verificare GET `/training/free-logs`.

Criterio done:
- Inserimento free log ritorna `logged: true`.
- La lista training mostra il nuovo log.

### 6. Evitare doppi log quando la chat ritenta dopo timeout
Stato: da valutare

Problema:
- La chat mobile usa retry e `client_message_id`.
- La cache backend evita replay solo quando la risposta e' completata e salvata in memoria locale.
- Se la prima richiesta continua lato server ma il client va in timeout, il retry potrebbe generare doppio log nutrizione/free training.

File coinvolti:
- `frontend/src/screens/ChatScreen.tsx`
- `backend/main.py`
- `backend/orchestrator.py`
- `backend/agents/nutrition.py`

Fix da fare:
- Propagare `client_message_id` fino agli agenti di log.
- Salvare idempotency key in DB o cache piu' robusta prima di eseguire side effects.
- Oppure aggiungere dedupe per stesso testo/data in finestra breve.

Criterio done:
- Simulando retry della stessa chat non si creano due nutrition/free training logs.

## P1 - UI mobile

### 7. Chat input ancora troppo compresso su telefono
Stato: fix applicato, da testare su APK

Problema:
- Il `TextInput` e' multiline e ha altezza max.
- Pero' nella barra ci sono quattro elementi fissi: attach, fridge, mic, send.
- Su schermi stretti la trascrizione lunga resta schiacciata.

File coinvolti:
- `frontend/src/screens/ChatScreen.tsx`

Fix applicato:
- Quando c'e' testo/trascrizione, attach e fridge si nascondono temporaneamente.
- Bottone send diventa compatto.
- TextInput ottiene piu' spazio e altezza minima maggiore.

Criterio done:
- Una trascrizione lunga e' leggibile mentre la modifichi.
- Non appare testo verticale/schiacciato come negli screenshot.

### 8. Dashboard refresh dopo log da chat
Stato: fix applicato, da testare su APK

Problema:
- Dashboard ricarica su focus.
- Se resti in app e vuoi feedback immediato tra tab/schermate, manca una invalidazione dati globale.

File coinvolti:
- `frontend/src/screens/ChatScreen.tsx`
- `frontend/src/screens/DashboardScreen.tsx`
- `frontend/src/store/habitStore.ts`

Fix applicato:
- Aggiunto store `appEventsStore` con `lastDataMutationAt`.
- Dopo ogni chat completata viene marcata una mutazione dati.
- Dashboard ascolta l'evento e ricarica.

Criterio done:
- Dopo log da chat, aprendo dashboard vedo subito dati aggiornati.
- Se dashboard e' gia' montata, ricarica al ritorno focus o evento.

### 9. Training card header e densita UI
Stato: migliorato, da rifinire dopo test APK

Problema:
- Header training e' stato compattato.
- Serve conferma reale su APK nuovo, perche' screenshot vecchi mostravano card ancora molto alte.

File coinvolti:
- `frontend/src/screens/TrainingDetailScreen.tsx`
- `frontend/src/components/ui.tsx`

Fix da fare:
- Testare su telefono APK 1.0.6.
- Se ancora alto, ridurre `ScreenHeader` title size in sub-screen e padding card.

Criterio done:
- Sopra la lista esercizi si vedono header + almeno una card senza scroll eccessivo.

## P2 - Qualita backend/UX

### 10. Nutrition: non salvare log vuoti o falsi positivi
Stato: migliorato, da testare con casi reali

Problema:
- Il vecchio bug salvava "(Non ci sono alimenti)" con 0 kcal.
- Ora `extract_food_description` ritorna stringa vuota se non trova alimenti.
- Serve testare testi lunghi misti, come screenshot con emozioni + "gnocchi/tofu/lenticchie".

File coinvolti:
- `backend/services/nutrition_estimator.py`
- `backend/agents/nutrition.py`
- `frontend/src/screens/NutritionScreen.tsx`

Fix da fare:
- Aggiungere test unitari per estrazione cibo.
- Evitare salvataggio se nutrienti sono tutti zero e descrizione sembra no-food.
- Rendere edit meal piu' semplice per correggere manualmente.

Criterio done:
- Messaggio senza cibo non crea log.
- Messaggio misto con cibo crea log solo degli alimenti.

### 11. Video link: possibilita di sostituire link problematici
Stato: editor presente, UX da migliorare

Problema:
- L'editor consente video URL.
- Ma se un video blocca embed, l'utente non ha flusso guidato per sostituirlo al volo.

File coinvolti:
- `frontend/src/screens/TrainingDetailScreen.tsx`
- `backend/api/push.py`

Fix da fare:
- Nel fallback video interno aggiungere CTA "Sostituisci link".
- Aprire editor esercizio gia' popolato.

Criterio done:
- Se un video non parte, posso cambiare URL senza uscire dalla sezione training.

### 12. Push token e permessi visibili in impostazioni
Stato: da fare

Problema:
- Registrazione token avviene in background.
- Se l'utente nega permessi o token fallisce, non c'e' UI diagnostica.

File coinvolti:
- `frontend/src/services/notifications.ts`
- `frontend/src/screens/ImpostazioniScreen.tsx`
- `backend/api/push.py`

Fix da fare:
- Mostrare stato permessi notifiche.
- Aggiungere bottone "Test notifica".
- Backend endpoint `/push/test`.

Criterio done:
- Da Impostazioni posso capire se notifiche sono attive.
- Posso inviare test push e riceverlo.

## Gia' verificato

- TypeScript frontend: OK con `npm.cmd exec tsc --noEmit`.
- Backend smoke tests: OK con `python -m pytest tests/test_endpoints.py -q`.
- Cloud Run deploy: OK, revisione `buddyai-00009-68n`.
- `/health`: OK.
- `/training/status`: OK.
- `/training/free-logs`: OK in lettura.
- TypeScript dopo fix 2026-04-23: OK.
- Backend smoke tests dopo fix 2026-04-23: OK.
