## Verifierat från eventflow-booking

Externa Booking-systemet:
- Lagrar datum som **arrayer**: `event_dates[]`, `rig_up_dates[]`, `rig_down_dates[]` + globala tider `rig_up_time`, `rig_down_time`.
- Har en officiell skriv-endpoint: `update-booking-from-planning` som accepterar exakt dessa fält. Auth: `x-api-key: PLANNING_API_KEY` (vi har redan secret).
- Whitelist tillåter: `event_dates`, `rig_up_dates`, `rig_down_dates`, `rig_up_time`, `rig_down_time` m.fl.

**Konsekvens:** Memory `large-project-dates-local-authority-v1` baseras på fel endpoint. Externa systemet stödjer LP-datum perfekt — extra dagar = bara fler element i arrayen. Inga duplicerade sub-bookings behövs.

## Mål

Efter konvertering bokning → projekt äger projektet rig/event/rigDown-datum för **alla sina sub-bookings**. När någon redigerar i projektvyn:

1. Lokal UPDATE på `bookings.rig_dates / event_dates / rigdown_dates` (arrays) + `rigdaydate / eventdate / rigdowndate` (= första elementet, för bakåtkompatibilitet).
2. PUSH till externa systemet via `update-booking-from-planning` per booking — en payload med arrayerna.
3. `import-bookings` (REP-path) eller direkt `materializeCalendarEvents` regenererar `calendar_events` från dessa arrayer.
4. Personalkalendern: oförändrad path, läser `calendar_events` som vanligt.

`projects.rigdaydate/eventdate/rigdowndate` blir **deprecated** (UI läser via `useBookingPhaseDays(bookingIds)` som vi redan börjat på).

## Arkitektur

```text
Projektvy (medium/LP)
   │  edit dates
   ▼
projectDateAuthority.write({projectId, type, phase, dates[]})
   │
   ├─► edge: apply-project-dates
   │     1. lookup bookings (medium=1, LP=N sub-bookings)
   │     2. för varje booking:
   │        a. UPDATE bookings.{phase}_dates + .{phase}date (=dates[0])
   │        b. invoke external: update-booking-from-planning
   │           { booking_id, organization_id, source:'planning',
   │             fields:{ rig_up_dates|event_dates|rig_down_dates: dates } }
   │        c. invoke import-bookings { localOnly:true, bookingIds:[bid] }
   │           (rebuilds calendar_events från nya arrayen)
   │     3. audit-loggar varje steg i sync_audit_log
   │     4. returnerar per-booking-resultat
   │
   ▼
QueryClient.invalidateQueries(['booking-phase-days'])
   ▼
Projektvy + personalkalender uppdateras via realtime
```

## Filer som skapas/ändras

**Nya:**
- `supabase/functions/apply-project-dates/index.ts` — central skriv-funktion (~150 rader)
- `supabase/functions/_shared/external-booking-write.ts` — tunn klient för `update-booking-from-planning`
- `src/services/projectDateAuthority.ts` — frontend-fasad (~80 rader)
- `src/test/projectDateAuthority.contract.test.ts` — verifierar att alla 3 stegen körs i ordning
- `supabase/functions/apply-project-dates/index.test.ts` — Deno-test mot mockad extern endpoint
- `.lovable/memory/features/projects/project-owns-dates-v1.md` — ny memory

**Uppdateras:**
- `src/pages/project/LargeProjectLayout.tsx` — `handleScheduleUpdate` → `projectDateAuthority.write`
- `src/components/project/ProjectScheduleEditable.tsx` — samma kall
- `src/services/largeProjectScheduleSync.ts` — markeras `@deprecated`, delegera till nya tjänsten
- `.lovable/memory/index.md` — pekar bort `large-project-dates-local-authority-v1` som superseded

## Säkerhet / felhantering

- **Multi-tenancy:** alla queries filtrerar på `organization_id`.
- **Atomicitet:** lokal UPDATE först. Om externa failar → `sync_audit_log` markerar `external_push_failed` + retry-kö (ny tabell `pending_external_pushes` med org_id, booking_id, payload, attempts).
- **Personalkalendern oförändrad:** `personalkalenderUntouched.contract.test.ts` (finns redan från förra steget) körs i CI.
- **Rollback:** backup-tabellen `_backup_projects_phase_dates_20260515` finns redan.

## Migrationsordning (en commit per steg)

1. `apply-project-dates` edge function + Deno-test (ingen UI-koppling).
2. `projectDateAuthority.ts` + frontend kontrakttest. Fortfarande ingen UI-koppling.
3. `LargeProjectLayout.handleScheduleUpdate` byts till nya tjänsten. Personalkalendertest körs.
4. `ProjectScheduleEditable` (medium) byts.
5. `largeProjectScheduleSync.ts` markeras deprecated.
6. Uppdatera memories.

Tom rad mellan dem så användaren kan stoppa när som helst.

## Frågor innan jag börjar

1. **Retry-policy om externa systemet är nere:** spara i `pending_external_pushes` och visa banner i projektvyn ("Datum sparade lokalt, väntar på sync till bokningssystemet"), eller blockera UI-spar tills push lyckas?
2. **Eventdagen för LP:** ska den också skrivas tillbaka till externa? Memory `staff-calendar-no-event-day-v1` säger att eventdagen filtreras bort i personalkalendern, men det är en visnings-regel — själva datumet borde fortfarande pushas. OK?
3. **Tider (`rig_up_time` / `rig_down_time`):** ska projektet också äga dessa, eller bara datumen? Externa har ett tidsfält per fas (globalt över alla dagar), inte per dag.
