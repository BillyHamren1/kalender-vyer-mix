## Mål

Byt ut **Jobbkö**-widgeten (nere till vänster i `/ops-control`) mot en **Live Projekt**-widget som följer projekt genom hela packprocessen:

```
Planering → Pågående → Slutförd (UT) → I produktion → Tillbaka → Påbörjad → Slutförd (IN)
```

Visa notisbubblor när det sker uppdateringar (foton, utlägg, kommentarer, kvitton, statusbyten) — i realtid via Supabase Realtime.

---

## Vad användaren ser

Vänsterspalten i bottenbaren på `/ops-control` får rubriken **"LIVE PROJEKT — N aktiva"** istället för Jobbkö.

Varje rad = ett `packing_projects` med status ≠ `planning`/`completed`/`cancelled` (alltså live i flödet):

```text
[●] 5/5 Westers Catering AB                I produktion   📷 2  💸 1  💬 3  >
    📍 Stockholm · Anna Berg                                            14:22
```

- Vänster färgad prick = nuvarande fas (blå=pågående, lila=i produktion, orange=tillbaka, grön=påbörjad återinlämning, etc — samma färgkarta som `PACKING_STATUS_COLORS`)
- Statusbadge visar nuvarande fas (svenska labels från `PACKING_STATUS_LABELS`)
- **Räknare/badges** för nya händelser sedan senaste visning:
  - 📷 nya filer (`packing_files` + `project_files`/`large_project_files` om kopplat)
  - 💸 nya utlägg (`packing_purchases` + `project_purchases`/`large_project_purchases`)
  - 💬 nya kommentarer (`packing_comments` + `packing_task_comments`)
  - ⚡ statusbyte (pulserande dot 30 sekunder efter `updated_at` ändring)
- Klick på rad → expanderar och visar tidslinje (vilken fas den passerat + tidpunkt) samt knappar **Öppna packning**, **Öppna projekt**.
- Sortering: senast uppdaterade överst (mest "live" känsla).
- Tom state: "Inga aktiva projekt just nu".

Filter-pills överst: **Alla · UT-flöde · I produktion · IN-flöde** (mappning mot statuskluster).

---

## Realtid + notiser

- Supabase `postgres_changes` subscription på:
  - `packing_projects` (status, updated_at)
  - `packing_files`, `packing_comments`, `packing_purchases`, `packing_task_comments`
  - För kopplade projekt: `project_files`/`project_purchases` filtrerat på `project_id` som matchar `packing_projects.booking_id` eller `large_project_files`/`large_project_purchases` på `large_project_id`
- Vid INSERT → öka räknaren på rätt rad + spela liten subtil pulsanimation + (valfritt) toast längst ner till höger: *"Anna laddade upp ett kvitto på Westers Catering"*.
- Räknare nollställs när användaren klickar/expanderar raden (lagras i `localStorage` per `packing_id` med tidsstämpel).

---

## Teknisk plan

### Nya filer

1. **`src/services/livePackingFeedService.ts`**
   - `fetchLivePackingProjects(orgId)`: hämtar `packing_projects` med `status IN ('in_progress','packed','delivered','back','returning')` joinat med booking-info (klient, adress) via befintlig `bookings`-relation och leverer `LivePackingItem[]`.
   - `fetchActivityCounts(packingIds, sinceMap)`: räknar nya händelser i de fyra child-tabellerna sedan respektive `seenAt`-timestamp.

2. **`src/hooks/useLivePackingFeed.ts`**
   - `useQuery` för listan (5 min stale).
   - `useEffect` som sätter upp Realtime-channels för de nämnda tabellerna, invaliderar query + bumpar lokal `eventCounter` per packing_id.
   - Returnerar `{ items, counts, isLoading, markSeen(packingId) }`.
   - `markSeen` skriver `livePackingSeen.<packingId>` till localStorage med `Date.now()`.

3. **`src/components/ops-control/OpsLiveProjects.tsx`**
   - Tar `items`, `counts`, `markSeen`.
   - Renderar filter-pills, lista, expanderbar rad enligt skissen ovan.
   - Använder `PACKING_STATUS_LABELS` / `PACKING_STATUS_COLORS` från `src/types/packing.ts`.
   - Klick → `navigate('/packing/' + packingId)` (öppna packning) eller projekt-deeplink.

### Ändrade filer

4. **`src/pages/OpsControlCenter.tsx`**
   - Byt ut `<OpsJobQueue ... />` mot `<OpsLiveProjects ... />` i bottom-area vänster kolumn.
   - Rensa `handleFocusJob` / `handleOpenChat` om de inte används av något annat.

5. **`src/hooks/useOpsControl.ts`**
   - Ta bort `jobQueue`/`isLoadingJobQueue` från default returnen (om inget annat använder dem) — alternativt behåll tills vidare för bakåtkompatibilitet.

### Behålls orört

- `OpsStaffTimeline` (tidsöversikten i bild 2) — den är inte vad användaren vill ta bort.
- `OpsJobQueue.tsx` lämnas i repot men oanvänd (kan rensas i nästa svep).

---

## Edge cases

- Packing utan booking → visa bara `name` + status.
- Stora projekt (`large_project_id`) → öppna `/large-project/{id}` istället för booking.
- Status `completed`/`cancelled` filtreras bort (inte längre "live").
- localStorage tomt för en packing → räknare visar totalt antal under sista 24h.
- Realtime-fel → tyst fallback till 30s polling.

---

## Acceptanskriterier

- [ ] "Jobbkö"-rutan är ersatt med "Live Projekt" i `/ops-control`.
- [ ] Listan visar bara packing_projects i live-faserna, sorterat på senast uppdaterade.
- [ ] När en testanvändare laddar upp en fil eller utlägg på ett listat projekt → räknare bumpas inom ~2s utan reload.
- [ ] Klick expanderar rad och nollställer räknarna.
- [ ] Statusbyte (t.ex. `packed → delivered`) syns med pulserande indikator + uppdaterad badge.
