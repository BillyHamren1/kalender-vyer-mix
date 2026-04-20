

## Smart karta — kontextkänsliga förslag (justerad scope, v2)

### Scenario A — uppdaterad

När en resa avslutas inom 300 m från ett planerat jobb där användaren *inte* är assignad:

> 🧭 *Är du här i ett ärende kring det planerade jobbet på {datum} ({client})?*
>
> [ ] Ja — registrera tid på plats kopplat till jobbet
> [ ] Nej, annat ärende
>
> Om "Ja":
> - Kort kommentar (obligatorisk, max 200 tecken): *"Vad gör du där?"*
> - Visning av tid på plats: startar nu, stoppas automatiskt när användaren lämnar geofencet (300 m) ELLER manuellt via "Avsluta besök".

**Vad som sparas vid "Ja":**

1. `travel_log.related_booking_id` = bokningens id (referens, inte assignment).
2. `travel_log.related_booking_note` = användarens kommentar.
3. **Ny `location_time_entry`** med:
   - `booking_id` = planerade jobbets id
   - `staff_id` = användaren
   - `entered_at` = nu
   - `exited_at` = null (öppen, stängs av geofence-utträde eller manuell stop)
   - `source` = `'arrival_context_unplanned_visit'`
   - Notering på entry: kommentaren från dialogen.
4. En `arrival_context_suggestions`-rad med decision=`accepted`.
5. Admin får en notis (befintlig inbox-pipeline) — "Personal X besökte planerat jobb Y utan att vara assignad".

**Vad som INTE sker:**

- Ingen `booking_staff_assignment` skapas.
- Ingen `time_report` skapas automatiskt — `location_time_entry` är ren närvarosignal som befintlig pipeline kan promota senare om relevant.
- Inget självtilldelningsflöde, inget "ta jobbet"-erbjudande.

**Vid "Nej, annat ärende":**

- `arrival_context_suggestions.decision` = `rejected`.
- Faller tillbaka till nuvarande "Vad gjorde du där?"-fält i `TravelCompletedDialog`.

**Stoppvillkor för det öppna besöket:**

- Geofence-utträde (>300 m från bokningens delivery-koordinat) → `exited_at` sätts.
- Användaren trycker "Avsluta besök" i mobil-shellet (banner visas under besöket).
- Dagsslut via `endDay` → stänger eventuellt öppet besök som vanligt.

### Scenario B — lunch/paus (oförändrat)

Mapbox POI = `restaurant/cafe/fast_food` + tid 11:00–13:30:

> 🍽 *Det ser ut som du stannade vid {namn}. Vill du registrera tiden som lunch?*
> [Ja, lunch] [Nej, jobb] [Privat]

"Ja, lunch" → om aktiv timer finns: bumpar `time_reports.break_minutes` med varaktigheten (cap 5–90 min).

### Scenario C — inköp på butik (oförändrat)

Mapbox POI = `hardware/home_improvement/furniture_store` eller AI-fallback `supply_store`:

> 🛠 *Handlade du på {namn} åt något projekt?*
> [Dagens jobb — {client}] [Imorgon — {client}] [Lager (alltid)] [Annat] [Privat]

Val → loggar `purchase_intent` på travel_log + förbereder kvittouppladdning.

### Klassificeringsmotor (oförändrat)

Hybrid, billigast först:

1. Lokala bokningar ±14 d inom 300 m, ej assignad → A.
2. `organization_locations` → tystas.
3. Mapbox POI-kategori → B eller C.
4. AI-fallback (`google/gemini-3-flash-preview`) bara på otydliga fall.

Konfidens < 0.5 → ingen prompt.

### Filer

| Fil | Roll |
|---|---|
| `supabase/functions/classify-arrival-context/index.ts` (ny) | Regelmotor + AI-fallback |
| `supabase/functions/classify-arrival-context/index_test.ts` (ny) | Deno-tester för alla scenarier |
| `supabase/functions/mobile-app-api/index.ts` | Nya actions: `accept_unplanned_site_visit`, `end_unplanned_site_visit`, `register_break_from_travel`, `link_purchase_intent_to_project` |
| `src/hooks/useArrivalContext.ts` (ny) | Pollar edge functionen när `completedTravel.matchedBookingId == null` |
| `src/hooks/useUnplannedSiteVisit.ts` (ny) | Håller öppet besök i state, lyssnar på geofence-exit |
| `src/components/mobile-app/SmartArrivalSuggestion.tsx` (ny) | En komponent, tre renderlägen (A/B/C) — A inkluderar kommentarsfält |
| `src/components/mobile-app/UnplannedVisitBanner.tsx` (ny) | Persistent banner under aktivt besök, "Avsluta besök"-knapp |
| `src/components/mobile-app/TravelCompletedDialog.tsx` | Renderar `<SmartArrivalSuggestion>` ovanför nuvarande UI |
| `src/components/mobile-app/MobileGlobalOverlays.tsx` | Mounts banner när `useUnplannedSiteVisit().active` |
| `src/services/mobileApiService.ts` | Klient-wrappers + utökad `WorkdayFlagType` |
| Migration | `arrival_context_suggestions` + lägg till `related_booking_id` + `related_booking_note` på `travel_time_logs` |

### Datamodell

- **Ny tabell** `arrival_context_suggestions` (id, staff_id, org_id, travel_log_id, lat, lng, kind, confidence, payload jsonb, decision, decided_at).
- **Utökning** `travel_time_logs`: `related_booking_id uuid null`, `related_booking_note text null`.
- **Återanvänder** `location_time_entries` för det öppna besöket — ingen ny tabell.

### Tystnadsregler

- Max ett smart-förslag per resa.
- Suppressas om `arrivalDialogOpen`, `staleDialogOpen`, `endDayHomeSuggestion` är öppna.
- Suppressas om destinationen är assignad arbetsplats.
- Samma plats + samma dag + redan dismissad → ingen ny prompt.
- Konfidens < 0.5 → ingen prompt.

### Tester

Edge function (Deno):
1. Planerat jobb 3 dagar fram, ej assignad → A med datum + client.
2. Restaurang 12:15 → B.
3. Restaurang 15:00 → ingen B.
4. Bauhaus → C med 3 förslag.
5. Residential → unknown, ingen prompt.
6. Assignad arbetsplats → ingen smart prompt.
7. AI-fallback körs endast vid `unknown` från regler.
8. Avvisat samma dag → ingen ny prompt.
9. Edge function 500 → klient faller tillbaka tyst.
10. Copy-test A: innehåller "ärende" + "planerade jobbet"; INTE "ta jobbet"/"tilldela".

Klient (manuell smoke):
11. "Ja" på A → kommentarsfält visas, kräver minst 3 tecken, banner visas efteråt.
12. Geofence-exit → besöket stängs, banner försvinner.
13. "Avsluta besök" manuellt → samma sak.

### Vad detta INTE gör

- Erbjuder aldrig självtilldelning.
- Skapar inga `time_reports` automatiskt — bara `location_time_entries` (samma signaltyp som vanlig geofencing).
- Visar inte andras besök i mobilappen.
- Ersätter inte `TravelCompletedDialog`.

