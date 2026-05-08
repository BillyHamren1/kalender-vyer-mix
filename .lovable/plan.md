# Fasta tider från bokning — lås/lås-upp i kalendern

## Mål

Tider som kommer in från Booking-systemet ska vara **synliga som fasta** i planneringskalendern (röd ram), och **kan inte dras eller resizas** förrän man bockar ur en checkbox. Saknar bokningen fasta tider ska planeraren själv kunna bocka i checkboxen (i projektet eller i personalkalendern) för att låsa de tider som valts.

Inga befintliga tids- eller workday-flöden ändras — bara presentation, en låsflagga, och en guard i `syncPhaseTime`.

## Datamodell (1 migration)

Lägg till per fas på `public.bookings`:

```
rig_start_time_external      timestamptz
rig_end_time_external        timestamptz
event_start_time_external    timestamptz
event_end_time_external      timestamptz
rigdown_start_time_external  timestamptz
rigdown_end_time_external    timestamptz

rig_time_locked       boolean NOT NULL DEFAULT false
event_time_locked     boolean NOT NULL DEFAULT false
rigdown_time_locked   boolean NOT NULL DEFAULT false
```

- `*_external`: snapshot av vad Booking senast skickade. **Aldrig** överskriven av plannern, bara av `import-bookings`.
- `*_locked`: planneringsflagga. Sätts automatiskt till `true` när `import-bookings` ser en extern tid första gången. Användaren kan toggla.

Ingen RLS-policy behöver ändras (ärver bookings-policyn).

## Backend

### `supabase/functions/import-bookings/index.ts`
- Vid varje fas-mappning (rad ~2690–2716): skriv extern tid till både `*_start_time` (live) **och** `*_start_time_external`.
- Sätt `<phase>_time_locked = true` om extern tid finns och flaggan ännu är `false` på första observation. Toggla **inte** om användaren redan satt den manuellt.
- Om extern tid saknas: rör inte `*_locked`, lämna `*_external = NULL`.

### `supabase/functions/_shared/.../timeSync` motsvarighet samt `src/services/timeSync.ts`
- `syncPhaseTime` får ny parameter `allowLocked?: boolean` (default `false`).
- Innan write: läs `<phase>_time_locked`. Om `true` och `allowLocked !== true` → returnera `{ blocked: 'locked' }` och skriv inget.
- Ny helper `setPhaseLock(bookingId, phase, locked: boolean, opts)`:
  - När man **låser upp** (`false`): bara uppdatera flaggan.
  - När man **låser** (`true`) utan extern tid: kopiera nuvarande `<phase>_*_time` till `*_external` så vi har en sanning att rulla tillbaka till.
  - Propagera till syskon i stora projekt (samma fas+datum), exakt som `syncPhaseTime` gör idag.

## Frontend — Planeringskalender

### `src/components/Calendar/BookingEvent.tsx` (+ `CustomEvent.tsx`)
- Läs `extendedProps.timeLocked` (mappas in i event-byggandet från `bookings.<phase>_time_locked`).
- Om `timeLocked`: röd 2px ram + litet hänglås-ikon i hörnet. Behåll fyllningsfärg.

### Drag/Resize
- I planner-koden (eventService / kalender-handlers, sökterm `onEventDrop` / `eventDrop` / resize): om `timeLocked` → avbryt operationen och visa toast `"Tiden är låst – bocka ur 'Fast tid' för att flytta."`.
- `syncPhaseTime` returnerar `{ blocked: 'locked' }` som fallback skydd även om UI-guarden missas.

### Checkbox-UI
Två platser:
1. **Event-popover/redigeringsdialog i kalendern** (där man idag ändrar start/slut): ny rad `[ ] Fast tid (från bokning)`. Toggle anropar `setPhaseLock`.
2. **Projektets datum-/tidssektion** (`LargeProjectScheduleEditable` + medel-projekt-headern som speglar samma komponent): per fas en checkbox `Fast tid` bredvid tidsfältet. När den är ibockad är tidsfältet read-only och får röd ram.

Visa även en read-only badge `"Importerad från bokning"` när `*_external` är satt.

## Edge-cases

- **Stora projekt**: lås gäller per syskon-bokning + fas + datum. När man togglar i UI propageras flaggan till alla syskon (samma logik som tidspropageringen).
- **Bokning utan extern tid → användaren låser**: vi snapshottar nuvarande live-tid till `*_external`. Om Booking senare skickar en faktisk extern tid skriver `import-bookings` över både live och external (och lämnar `locked = true`).
- **Workday/time_reports**: helt orörda. Det här är planning-presentation.

## Tekniska steg

1. SQL-migration för 6 + 3 kolumner.
2. Patcha `import-bookings`: skriv `*_external`, sätt `*_locked = true` vid första externa observation.
3. Patcha `src/services/timeSync.ts`: `allowLocked`-guard + ny `setPhaseLock`-helper.
4. Mappa `timeLocked` per event in i kalender-event-byggaren (där `extendedProps` fylls).
5. UI: röd ram + hänglås i `BookingEvent.tsx` / `CustomEvent.tsx`.
6. UI: blockera drag/resize i planner-handlers när `timeLocked`.
7. UI: checkbox `Fast tid` i a) event-redigerings-popovern, b) `LargeProjectScheduleEditable` (används av både stora och medel-projekt nu).
8. Toast/copy + invalidate queries efter toggle.

## Vad jag INTE rör

- Ingen ändring av workday, time_reports, location_time_entries, travel_time_logs, autostart, geofence.
- Ingen ändring av kalenderkonsolidering eller team-modell.
- Ingen ändring av personalkalenderns syskon-spegling utöver att respektera `*_locked` vid drag.
