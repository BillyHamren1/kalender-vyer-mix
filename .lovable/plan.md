## Mål

När en rad i tidrapporten klassas som **`unknown_place`** men det finns GPS-pings under blocket — kör automatiskt befintlig AI (`analyze-unclear-segment`), och **använd resultatet visuellt**. Idag genereras "Okänd plats" trots att råpings finns; AI-funktionen finns men triggas bara via knappen "Analysera dag" och resultatet skrivs aldrig tillbaka in i radens etikett.

**Ingen ändring i klassningslogik, Time Engine, geofence, attest eller DB-skrivningar.** Bara: trigga befintlig AI när villkoret uppfylls + presentera svaret.

## Vad som ändras

### 1. Ny hook `useUnknownPlaceAi(staffId, date, row)`
`src/hooks/staff-time/useUnknownPlaceAi.ts`

- Aktiveras endast om `row.kind === "unknown_place"` och `row.startIso && row.endIso`.
- Hämtar pings för fönstret från `staff_location_history` (samma källa som `ActualDayPanel` använder) — `select id, lat, lng, recorded_at where staff_id=… and recorded_at between start and end`.
- Om `pings.length === 0` → returnera `{ status: "no_pings" }` (då är "Okänd plats" rätt; gör inget).
- Annars beräkna centroid (lat/lng-medel) + `ping_count`, bygg `segment_id` deterministiskt (`${staffId}:${startIso}:${endIso}:unknown_place`) och kalla `supabase.functions.invoke('analyze-unclear-segment', { body: { staff_id, date, segment: { segment_id, kind: 'other_place', start_ts, end_ts, duration_min, center_lat, center_lng, is_stationary: true, ping_count } } })`.
- Använd React Query med `queryKey: ['unknown-place-ai', staffId, segment_id]` och `staleTime: Infinity` — Edge function cachar redan i `unclear_segment_ai_analyses`, queryn ger UI-cache.
- Returnerar `{ status: 'loading' | 'no_pings' | 'ready' | 'error', label?, confidence?, explanation?, suggestedType?, address? }`.

### 2. `StaffPayrollReportDayRow.tsx` — visa AI-label på unknown_place-rader
- Ny komponent `UnknownPlaceCell({ cell, item })` som anropar hooken och renderar:
  - `loading` → samma "Okänd plats"-text + liten `Loader2`-spinner.
  - `ready` med `confidence ≥ 0.6` → ersätt "Okänd plats" med AI-förslagets label (`Trolig plats: …` eller adress) + liten badge `AI · ${Math.round(c*100)}%` med tooltip = `explanation`.
  - `ready` med `confidence < 0.6` eller `suggestedType === 'needs_user_input'` → "Okänd plats" + badge `AI: behöver input` (tooltip = `userQuestion`).
  - `no_pings`/`error` → fallback till nuvarande "Okänd plats".
- Endast text- och badge-rendering. `kind`/`minutes`/summor rörs inte.

### 3. Samma visning i admin-tidsvyer
Två platser där "Okänd plats" syns idag återanvänder samma hook + helper-komponent:
- `src/components/staff/DayBlockTimelineView.tsx` (raden `Plats okänd` / `Okänd plats – …`).
- `src/components/staff-time/week-flow/WeekFlowReportRowsMini.tsx` (mini-vy).

I dessa visas AI-labeln på samma sätt (label + AI-badge), men ändrar inte blockets typ/minuter.

### 4. Test
`src/hooks/staff-time/__tests__/useUnknownPlaceAi.test.ts` (vitest):
- Inga pings → `status: 'no_pings'`, ingen invoke.
- Pings finns → invoke kallas med rätt centroid + segment_id + `kind: 'other_place'`.
- Edge-fel → `status: 'error'`, fallback i UI.
- Cache-träff (samma segment_id) återanvänds.

## Vad som inte rörs

- `analyze-unclear-segment` (oförändrad — endast ny anropare).
- Time Engine, geofence, `same-target-sandwich-collapse`, `resolveWorkTargets`, dag-klassning.
- `time_reports`, `place_visits`, `staff_day_submissions`, attest/lön.
- Andra rad-typer (`work`/`travel`/`gps_gap`/`private`) — AI körs bara på `unknown_place`.

## Tekniska detaljer

- Pings-läsning gör en query per unik (staff,date) — cellen har redan dem? Om inte: batcha i hooken genom att läsa hela dagens pings (`recorded_at::date = date`) en gång per cell via `useQuery(['staff-pings', staffId, date])` och filtrera per row i minnet.
- `analyze-unclear-segment` cachar per `segment_id` i DB → upprepade öppningar av rapporten kostar ~0.
- Hård regel från memory `ai-only-on-unclear-segments-v1` respekteras: vi skickar bara `kind: 'other_place'` (en av de tillåtna), aldrig confirmed_*.
- Confidence-tröskel = 0.6 matchar edge-funktionens egen `CONFIDENCE_THRESHOLD`.

## Verifiering

1. Öppna Lön-fliken för veckan med Andis 2 juni — raden 12:17–18:09 ska visa AI-label (förväntat: "Trolig plats: FA Warehouse / Vällsta" e.l.) + AI-badge.
2. Rader utan pings ska fortsatt visa "Okänd plats" oförändrat.
3. Vitest grön.
4. Inga ändringar i summerings-kolumner eller dagens totaler.
