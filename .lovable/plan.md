## Princip (låst)
Lagret "karta" = `staff_location_history` ska ALLTID ta emot allt telefonen skickar. Ingen backend-dedupe, ingen migration som raderar rader. Det enda vi får styra är **vad** som ritas/listas i UI och **hur**.

## Vad jag hittade i DB (Billy 2026-05-20)
Totalt 206 pings för dagen; mellan 14:31 och 19:53 finns **bara 3 rader**. Det är inte UI-filter — raderna saknas i tabellen. Orsak: två ändringar jag gjort tidigare i denna tråd som bryter mot principen ovan.

## Det här ska backas

### 1. Backend-dedupe i `mobile-app-api` (insert till `staff_location_history`)
- Ta bort hela `isExactDuplicate(...)`-grinden som droppar inserts när `(lat,lng,accuracy,speed)` matchar senaste raden.
- Insert ska alltid ske för varje ping i payloaden. Klienten bestämmer vad som skickas; servern lagrar rått.
- Behåll endast hårda valideringar (auth, org_id, numeriska intervall, payload-storleksgräns). Inga "smarta" hopp.

### 2. Migration som raderade "duplicates"
- Migrationen `20260520205238_*.sql` (DELETE WHERE grp_size>=3 per dag) återinförs aldrig. Datan den tog bort är borta — det går inte att återskapa. Vi accepterar förlusten för historiska dagar och säkrar att framtida dagar är intakta.
- Lägg en kort kommentar i migrationen som varnar mot att återanvända mönstret.

## Det här ska INTE ändras
- `RawGpsSatelliteMap.tsx` och `StaffGpsSatelliteMap.tsx` är redan visningsskikt utan filter — ingen ändring behövs nu för att lösa Billys problem.
- Inga ändringar i `useStaffGpsPingsForDay` utöver att se till att hooken hämtar alla rader (paginering om >1000, se nedan).

## Sidofix (samma princip)
- **1000-radersgränsen**: `useStaffGpsPingsForDay` ska paginera så att vi alltid ritar **alla** rader för dagen, oavsett antal. Inget urval, inget tak. (Vi diskuterade detta i början av tråden — säkerställs här som en del av "rådata in, allt visas").

## Display-styrning (separat — inte i denna ändring)
Om/när vi vill minska visuell brus är det ett rent UI-jobb i `Raw…Map` / `PingTimelineTable` med togglar typ "dölj exakta dubbletter inom <X s" — men datan bakom togglen är fortsatt komplett. Lägger inget av detta nu; bara förbereder så att raw-vägen är ren först.

## Tekniska detaljer
- Fil: `supabase/functions/mobile-app-api/index.ts` — ta bort dedupe-blocket runt insert till `staff_location_history`, behåll batch-insert.
- Fil: `src/hooks/staff/useStaffGpsPingsForDay.ts` — pagineringsloop tills färre rader än page size returneras.
- Testar via:
  - Deno-test för insert-action: skickar 3 identiska pings inom 1 s → förväntar 3 rader.
  - Vitest för hooken: mockar 2400 rader → förväntar att alla returneras.

## Vad jag INTE gör
- Ingen ny dedupe, vare sig tidsfönsterbaserad eller värdebaserad, på lagret som tar emot pings.
- Rör inte kart/tabell-logiken för att "fixa" Billys dag — den ser tom ut eftersom datan är raderad, inte för att UI gömmer den.
