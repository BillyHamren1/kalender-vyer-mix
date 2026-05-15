---
name: Project Dates Authority v1
description: Projektet (medium + large) äger sub-bookings rig/event/rigDown-datum; UI skriver ENDAST via writeProjectDates → apply-project-dates
type: constraint
---

Projektet äger datumen. När en bokning blir ett projekt så är projektets datum sanningen för **alla** dess sub-bookings, både lokalt och i externa Bokning-systemet.

**Enda skrivvägen från UI:**
`writeProjectDates()` i `src/services/projectDateAuthority.ts` → edge function `supabase/functions/apply-project-dates/`.

Den gör per sub-booking, atomärt:
1. UPDATE `bookings.{rigdaydate|eventdate|rigdowndate} = dates[0]` (lokalt, första datum i arrayen).
2. PUSH `{rig_up_dates|event_dates|rig_down_dates}` (full array) till externa via `update-booking-from-planning` (shared helper `_shared/external-booking-write.ts`).
3. INVOKE `import-bookings { localOnly:true }` så `calendar_events` rebuildas.
4. INSERT `sync_audit_log` med `sync_action='apply_project_dates'`.

`organization_id` i body är **valfri** — härleds server-side från caller's profile. Skarp körning kräver inloggad user-JWT; `dry_run:true` kringgår auth (ingen skrivning, bara payload-preview).

**Förbjudet:**
- UI får INTE skriva direkt till `bookings.{phase}date` eller `calendar_events`.
- Den gamla `propagateProjectDatesToBookings` (i `largeProjectScheduleSync.ts`) kastar nu `Error` — använd den inte.
- Den gamla memory-noten `large-project-dates-local-authority-v1` är **felaktig** (externa stödjer datum-arrayer per fas) och ersätts av denna.

**Implementerat i:** `LargeProjectLayout.handleScheduleUpdate`, `ProjectLayout.handleScheduleUpdate`, `useLargeProjectDetail.saveGanttMutation`.
