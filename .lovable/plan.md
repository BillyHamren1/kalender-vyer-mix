

# Granskning: Tidrapporteringsappen (Time App)

## Övergripande bedömning
Appen är välstrukturerad med tydlig separation: Edge Function (`mobile-app-api`) som backend, `mobileApiService` som API-lager, React Query-hooks för state, och GPS-hooks för geofencing/resdetektering. Dock finns flera buggar och robusthetsproblem.

---

## Identifierade problem

### 1. BUGG: `useGeofencing` skapar dubbla GPS-watchers
**Allvarlighet: HÖG**

`useGeofencing` startar en `navigator.geolocation.watchPosition` i sin `useEffect` (rad 88-131). `useTravelDetection` startar en *separat* `watchPosition` (rad 204-264). Båda körs samtidigt i `MobileJobs.tsx`. Det innebär:
- Dubbel GPS-batteriförbrukning
- Potentiella konflikter med `lastPositionRef` (useTravelDetection använder sin egen)
- På äldre Android kan inte flera watchers samexistera stabilt

**Fix:** Konsolidera till en enda GPS-watcher som matar båda logikerna, eller använd en delad kontext.

### 2. BUGG: `useGeofencing` dependency array saknar `staffId`
**Allvarlighet: MEDEL**

GPS-effekten (rad 88-131) har dependency `[]` — den skickar location-reports med det `staffId` som var aktuellt vid mount. Om `staffId` ändras (t.ex. vid re-auth) skickas rapporter med det gamla ID:t.

**Fix:** Lägg till `staffId` i dependency-arrayen.

### 3. BUGG: `stopTimer` returnerar `null` pga async setState
**Allvarlighet: MEDEL**

I `useGeofencing.ts` rad 190-201: `stopTimer` försöker läsa `stopped` efter `setActiveTimers`, men React state-uppdateringar är asynkrona. Variabeln `stopped` sätts inuti `setActiveTimers`-callback, men *läses* efter return. I praktiken returnerar `stopTimer` alltid `null` i *samma tick*.

`MobileJobs.tsx` rad 40-41 använder returvärdet:
```typescript
const stopped = stopTimer(geofenceEvent.booking.id);
if (stopped) { ... }
```
Denna kod fungerar av slump — exit-händelsen navigerar alltid till `/m/report`, men `stopped` är `null`.

**Fix:** Använd `useRef` för timers-state, eller returnera timer från en ref istället.

### 4. BUGG: Broadcasts filtreras bara på dagens datum
**Allvarlighet: MEDEL**

`handleGetBroadcasts` rad 1638: `gte('created_at', ${today}T00:00:00)`. Personal som öppnar appen nästa dag ser *inga* broadcasts från igår. Schemaändringar eller brådskande meddelanden som skickades kvällen innan försvinner.

**Fix:** Hämta broadcasts från de senaste 3-7 dagarna istället.

### 5. BUGG: `markBroadcastRead` har race condition
**Allvarlighet: LÅG**

`handleMarkBroadcastRead` (rad 1702-1730) gör en read-then-write: hämtar `is_read_by`, pushar `staffId`, sparar. Två samtida anrop kan läsa samma array och en av dem förlorar sin uppdatering.

**Fix:** Använd Postgres `array_append` med `DISTINCT` eller en junction-tabell.

### 6. UI: Tidrapportformulär validerar inte negativa timmar
**Allvarlighet: LÅG**

`calculateHours()` i `MobileTimeReport.tsx` rad 32-38: Om `startTime > endTime` (nattskift som passerar midnatt), returneras `0` pga `Math.max(0, ...)`. Användaren får ingen feedback att tiderna är ogiltiga — rapporten sparas med 0h.

**Fix:** Hantera nattskift (lägg till 24h) eller visa ett felmeddelande.

### 7. UI: Timer auto-break vid >5h är för strikt
**Allvarlighet: LÅG**

`MobileJobDetail.tsx` rad 59 och `MobileTimeReport.tsx` rad 101: `breakDeduction = totalHours > 5 ? 0.5 : 0`. Detta drar alltid 30 min rast vid >5h arbete — även om personen faktiskt tog rast eller inte. Användaren kan inte styra detta.

**Fix:** Visa rastavdraget till användaren och låt dem justera innan sparande.

### 8. SAKNAS: Tidrapporthistorik begränsad till 50 st
**Allvarlighet: LÅG**

`handleGetTimeReports` (rad 512): `.limit(50)`. Om en person har fler än 50 rapporter visas inte de äldsta. Det finns ingen paginering i frontend.

**Fix:** Lägg till datumfilter (hämta per månad) eller öka gränsen.

### 9. BUGG: `useTravelDetection` effect dependencies skapar restart-loop
**Allvarlighet: MEDEL**

Rad 271: `[enabled, travelState.isMoving, startTravel, stopTravel]`. `startTravel` och `stopTravel` skapas med `useCallback` men `stopTravel` beror på `travelState.activeTravelLogId` (rad 167). Varje gång travel startas → `travelState` ändras → `stopTravel` återskapas → useEffect körs om → GPS-watcher stoppas och skapas om. Tappar potentiellt position-data under omstart.

**Fix:** Använd refs för travel-state inuti effekten, eller flytta GPS-watchern utanför effekten med travelState-beroende.

---

## Sammanfattning: Vad fungerar bra
- Auth-flödet med token + session verify + timeout (8s) — robust
- Organisation-isolering genomgående i backend — korrekt
- Geofence-promptar med enter/exit-hysteresis — bra UX
- Optimistiska DM-uppdateringar + cache-invalidering — snabb feedback
- Push-notiser vid DM — korrekt implementerat
- Travel-detection med iOS-fallback (beräknad hastighet) — smart
- Tidrapportexport till HTML/PDF — fungerar

## Åtgärdsplan (prioriterad)

| # | Problem | Allvarlighet | Fil |
|---|---------|-------------|-----|
| 1 | Dubbla GPS-watchers | **Hög** | `useGeofencing.ts` + `useTravelDetection.ts` |
| 2 | `useGeofencing` saknar `staffId` dep | Medel | `useGeofencing.ts` |
| 3 | `stopTimer` returnerar null | Medel | `useGeofencing.ts` |
| 4 | Broadcasts bara idag | Medel | `mobile-app-api/index.ts` |
| 5 | Travel detection effect restart-loop | Medel | `useTravelDetection.ts` |
| 6 | Broadcast read race condition | Låg | `mobile-app-api/index.ts` |
| 7 | Nattskift → 0h utan varning | Låg | `MobileTimeReport.tsx` |
| 8 | Auto-break 30min ej justerbar | Låg | `MobileJobDetail.tsx`, `MobileTimeReport.tsx` |
| 9 | Max 50 tidrapporter | Låg | `mobile-app-api/index.ts` |

### Filer som ändras
1. **`src/hooks/useGeofencing.ts`** — Fixa `staffId` dependency, fixa `stopTimer` return, exportera GPS-position via kontext
2. **`src/hooks/useTravelDetection.ts`** — Ta emot GPS-position externt istället för egen watcher, stabilisera effect deps med refs
3. **`src/pages/mobile/MobileJobs.tsx`** — Skicka GPS-position från `useGeofencing` till `useTravelDetection`
4. **`supabase/functions/mobile-app-api/index.ts`** — Broadcasts senaste 7 dagar, tidrapporter limit 200, `array_append` för broadcast read
5. **`src/pages/mobile/MobileTimeReport.tsx`** — Nattskifthantering + validering
6. **`src/pages/mobile/MobileJobDetail.tsx`** — Visa rastavdrag till användaren

