

## Mål

Mobilappen ska veta **exakt när** varje jobb är planerat för **just denna personal** (per event/fas) — inte bokningens generella tider — och visa hela dagen som en lodrät tidslinje (timmar 06–22) där varje pass ligger på sin planerade tid. Den nya kalendervyn **ersätter** den platta jobblistan på startskärmen.

## Datakälla — vad räknas som "planerad tid"

Personalens planering ligger i `calendar_events` (rader skapade från Planning-kalendern via `staff_assignments` + `booking_staff_assignments`). En `calendar_events`-rad har:
- `start_time`, `end_time` (ISO timestamps — **detta är den auktoritativa tiden för personalen**)
- `booking_id`, `booking_number`, `title`, `delivery_address`, `event_type` (rig/event/rigdown/övrigt)
- `resource_id` (team) och `source_date`

Varje event-rad blir **ett separat pass** i appen. En personal som har rig 07–10 + event 14–18 på samma bokning får **två separata kort** på tidslinjen.

Koppling personal ↔ calendar_event sker via `booking_staff_assignments` (BSA): `staff_id + booking_id + assignment_date`. Vi joinar BSA → calendar_events där `ce.booking_id = bsa.booking_id` och `DATE(ce.start_time) = bsa.assignment_date`.

## Backend — `mobile-app-api` `handleGetBookings`

**Fil:** `supabase/functions/mobile-app-api/index.ts`

Idag returnerar funktionen en lista av bokningar för dagen. Ändras till att returnera en lista av **planerade pass** (en rad per `calendar_events`-träff för personalen):

```ts
type ScheduledShift = {
  shift_id: string;            // calendar_events.id
  booking_id: string;
  booking_number: string | null;
  title: string;               // ce.title
  event_type: 'rig' | 'event' | 'rigdown' | 'other';
  start_time: string;          // ISO, från calendar_events
  end_time: string;            // ISO, från calendar_events
  delivery_address: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  client: string;
  is_internal: boolean;
  internal_type: string | null;
  // befintliga bokningsfält som appen redan använder behålls
};
```

- Ny respons-property `shifts` i sidan av befintlig `bookings` (bakåtkompatibilitet under övergång). Appen migreras till `shifts` i samma PR.
- Interna lager-pass har inte calendar_events och visas inte i tidslinjen — bara via befintlig "Lager"-ingång (oförändrad).

## Frontend — ny dagskalender

**Ny fil:** `src/components/mobile-app/DayTimeline.tsx`

- Lodrät tidslinje 06:00–22:00 (auto-utöka om pass ligger utanför).
- 1 timme = fast pixelhöjd (64px). Nu-linje (semantic `--destructive`) som uppdateras varje minut och auto-scrollar till "nu" vid mount.
- Varje pass renderas som ett absolut-positionerat kort (`top = (start - dayStart) * pxPerMinute`, `height = duration * pxPerMinute`), tap → öppnar befintlig bokningsdetalj.
- Färgkod per `event_type`:
  - rig → `--primary`
  - event → `--accent`
  - rigdown → `--secondary`
  - other → `--muted`
- Överlappande pass läggs sida-vid-sida (50/50 bredd) — enkel kollisionsdetektering.
- Aktiv timer (om något pass är igång) får `ring-2 ring-primary` + pulserande prick.

**Hook:** `src/hooks/useScheduledShifts.ts`
- Läser `shifts` från `mobile-app-api`.
- Realtime: subscribar på `calendar_events` + `booking_staff_assignments` (filtrerat på org) → invalidera vid ändring så planerad tid uppdateras live om planeraren flyttar passet.

**Ersätt:** `src/components/mobile-app/MobileHome.tsx` (eller motsvarande startskärm)
- Den platta jobblistan byts ut mot `<DayTimeline shifts={shifts} />`.
- Header behåller dagsdatum + befintlig dagstimer/"Starta dagen".
- Tom dag → centrerad illustration + "Inga planerade pass idag".

## Felhantering / edge cases

- Pass som spänner över midnatt: klipps vid 23:59 i dagens vy.
- Pass utan koordinater: korten fungerar ändå (tap → detalj), men "Navigera"-knappen i detaljen är disabled.
- Om BSA finns men `calendar_events` saknas (osynkat): visas en banner "X jobb saknar planerad tid — kontakta planeraren", **inte** i tidslinjen.

## Filer som rörs

- `supabase/functions/mobile-app-api/index.ts` — ny `shifts`-respons i `handleGetBookings`
- `src/components/mobile-app/DayTimeline.tsx` — ny komponent
- `src/components/mobile-app/MobileHome.tsx` — ersätter listan med tidslinjen
- `src/hooks/useScheduledShifts.ts` — ny hook + realtime-subscription
- `src/types/mobile.ts` (eller motsv.) — `ScheduledShift`-typ

**Inga DB-migrationer.** All data finns redan i `calendar_events` + `booking_staff_assignments`.

## Validering

- **A**: Personal har rig 07–10 + event 14–18 på samma bokning → två separata kort på tidslinjen.
- **B**: Två olika bokningar överlappar 13–15 → korten renderas sida-vid-sida.
- **C**: Planeraren flyttar event 14:00 → 15:00 → mobilappens tidslinje uppdateras live via realtime.
- **D**: Tom dag → empty-state.
- **E**: Tap på pass → öppnar befintlig bokningsdetalj med rätt `booking_id`.
- **F**: Nu-linje rör sig minutvis, auto-scroll till nu vid första rendering.

