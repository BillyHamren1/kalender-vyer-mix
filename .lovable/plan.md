## Mål
När – och bara när – en rad i tidrapportvyn klassas som **Okänd plats**, skicka radens fulla kontext + dagens pings till AI. AI returnerar ett kort platsförslag (t.ex. "Restaurang Prinsen, Vasagatan 12"). Raden visar förslaget som vanlig text + en liten AI-ikon till höger. Inga badges, ingen tooltip, ingen förklaring, ingen automatisk ändring av tid eller klassning.

## Vad som ändras

### 1. Ny edge function `suggest-unknown-place-label`
- Input: `{ staffId, date, rowKey, startIso, endIso, lat, lng, pings? }`
- Hämtar (server-side) dagens pings, närliggande kända platser, reverse-geocode (samma kontext som `resolve-unknown-stop` redan bygger).
- Skickar paketet + dagbyggar-reglerna (kort prompt) till Lovable AI Gateway (`google/gemini-3-flash-preview`).
- Output: `{ label: string, confidence: number }`. Inget annat returneras till klienten.
- Cache i ny tabell `unknown_place_label_suggestions` på `(staff_id, row_signature)` (signature = hash av staff+start+end+lat+lng@~100m) så samma rad inte triggar nytt AI-anrop.
- Avvisar 422 om rad-kind inte är `unknown_place` (följer regeln *AI Only on Unclear Segments*).
- Skriver ALDRIG till `time_reports`, `staff_day_submissions`, klassning eller minuter.

### 2. Ny frontend-hook `useUnknownPlaceLabel(row, staffId, date)`
- Aktiveras **bara** när `row.kind === "unknown_place"`.
- React Query, `staleTime: 1h`, en query per rad-signatur.
- Returnerar `{ label, isLoading }`. Felar tyst (visar då bara "Okänd plats").

### 3. Minimal UI-ändring i `StaffPayrollReportDayRow.tsx`
- Bryt ut platscellen i en liten subkomponent `RowPlaceLabel`.
- För alla andra `kind` än `unknown_place`: oförändrat (`kindLabel(r)`).
- För `unknown_place`:
  - Visar AI-förslaget om sådant finns, annars "Okänd plats" (samma som idag).
  - Liten AI-ikon (`Sparkles` från lucide, `h-3 w-3 text-muted-foreground/70`) **till höger om texten på samma rad**.
  - Inga badges, ingen tooltip-text, ingen "AI-förslag"-prefix, ingen confidence, ingen knapp.
- Inga andra rader påverkas. Inga ändringar i sheet-detaljvyn, höger-panelen, attest, print.

### 4. Verifiering
- Vitest: ny `useUnknownPlaceLabel.test.tsx` som verifierar (a) inget kall för `kind !== unknown_place`, (b) label byts ut när AI svarar.
- Manuell preview-koll: rader med t.ex. "FA Warehouse" är oförändrade; raden "Okänd plats" får ett platsnamn + liten ikon.

## Det här rörs INTE
- Klassningslogik / Time Engine / geofence
- `time_reports`, `staff_day_submissions`, minuter, attest-flöde
- Höger-panelen, kalkyler, print-layout
- Andra rad-kinds än `unknown_place`

## Filer
- ny: `supabase/functions/suggest-unknown-place-label/index.ts`
- ny: migration för `unknown_place_label_suggestions` (cache)
- ny: `src/hooks/staff-time/useUnknownPlaceLabel.ts` (+ test)
- edit: `src/components/staff-time-approvals/StaffPayrollReportDayRow.tsx` (endast platscellen)
