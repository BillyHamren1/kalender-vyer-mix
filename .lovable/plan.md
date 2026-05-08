## Problem

På `/admin/presence/staff/:staffId` visas:
1. **"Failed to send a request to the Edge Function"** — `get-staff-presence-day` 500:ar
2. **Tomt namn** ("—") — eftersom svaret aldrig kommer fram

## Rotorsak

I `supabase/functions/get-staff-presence-day/index.ts` selectar jag fel kolumnnamn från `active_time_registrations`:

```ts
.select('id, started_at, stopped_at, status, stop_source, metadata, target_type, target_id')
```

Tabellen har inte `target_type` / `target_id` — riktiga namnen är `start_target_type`, `start_target_id`, `start_target_label`, `current_label`, `current_target_type`, `current_target_id`. Felaktig select → PostgREST-fel → funktionen kraschar.

Dessutom skickas namnet bara i `data.staff.name` när allt går igenom — så även en mindre framtida fel-väg i funktionen släcker hela headern.

## Åtgärd

### 1. Fixa kolumnnamn i `get-staff-presence-day`

- Byt select till `start_target_type, start_target_id, start_target_label, current_label, current_target_type, current_target_id, auto_started, start_source`.
- Använd `current_label || start_target_label` som etikett för timer-händelser.
- Uppdatera `activeTimerInfo` och timer-rad-objekten med rätt fältnamn.

### 2. Robust felhantering

- Lägg in en yttre `try/catch` runt hela handlern så att oväntade fel returnerar `{ ok: false, error }` med 200 + CORS (istället för att Supabase-klienten visar generiskt "Failed to send a request to the Edge Function").
- Kontrollera `error` på varje Supabase-anrop och fortsätt med tom array om det failar — funktionen ska aldrig krascha helt bara för att en delkälla saknas.
- Returnera alltid `staff: { id, name }` så fort vi har gjort staff-fetchen, även om presence/timer/GPS senare fallerar.

### 3. Visa namn direkt på sidan utan att vänta på edge function

I `StaffPresenceDay.tsx`:
- Hämta namnet från `staff_members`-tabellen direkt via `supabase.from('staff_members').select('name').eq('id', staffId).maybeSingle()` parallellt med edge-anropet, så headern visar namnet även om edge-funktionen failar.
- Visa edge-funktionens fel som notis utan att dölja header/datumväljare.

### 4. Verifiera

- Deploya och kör funktionen manuellt med en känd staffId via curl-edge-functions.
- Ladda om `/admin/presence/staff/365f4d55-…?date=2026-05-08` och bekräfta att "Billy Hamrén" syns och tidslinjen renderar.

## Filer som ändras

- `supabase/functions/get-staff-presence-day/index.ts` — kolumnnamn + try/catch + alltid returnera staff
- `src/pages/admin/StaffPresenceDay.tsx` — parallell namn-fetch + visa fel utan att dölja header

Inga DB-migrationer. Inga ändringar i andra funktioner.