
**Problem:** Personalen visar 10:00–16:00 men kalendern visar 08:00–14:00 för samma event.

**Orsak:** I `useWarehouseStaffScheduleOverview.ts` används `event.start_time` direkt i en `Date(...)`-konvertering via UI:t (eller liknande lokal tolkning). Resten av kalendern använder UTC-tid (se `extractUTCTime` i `dateUtils`) — `calendar_events.start_time` lagras som UTC-ISO och kalendern renderar med `getUTCHours()`. När vi i schemaöversikten skickar rå `start_time`-sträng och formaterar med lokal tidzon (Europe/Stockholm = UTC+2 i april) blir det +2h skift → 08 blir 10.

**Verifiering jag behöver göra först:**
1. Läs `WarehouseStaffActivationCard.tsx` för att se hur `startTime`/`endTime` formateras till "10:00–16:00".
2. Bekräfta att andra kalendervyer använder UTC (de gör det enligt `TimeGrid.tsx` rad ~270 och `extractUTCTime`).

**Fix (1 fil, ev. 2):**
- I `WarehouseStaffActivationCard.tsx`: byt lokal `format(new Date(startTime), 'HH:mm')` (eller motsvarande) till UTC-baserad formatering, t.ex. `extractUTCTime(startTime).slice(0,5)` från `@/utils/dateUtils`. Detta matchar hur kalendern renderar tider.

Inga datamodeller eller hooks ändras. Endast presentationsformatering byts från lokal tid → UTC, så 08–14 visas konsekvent.

**Plan:**
1. Inspektera `WarehouseStaffActivationCard.tsx` för exakt formatkod.
2. Ersätt lokal tidsformatering med `extractUTCTime` (samma helper som resten av kalendern).
3. Be användaren bekräfta att tiderna nu matchar kalendern.
