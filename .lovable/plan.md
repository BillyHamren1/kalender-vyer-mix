## Mål
En enda regel överallt:

1. **Bokningstider = kalendertider.** Ändras tid på endera sidan ska den andra omedelbart matcha. Per fas (rig / event / rigDown).
2. **Stora projekt:** alla bokningar i samma stora projekt ärver samma tid per fas + datum. Ändrar man tiden på vilken bokning eller vilket event som helst → alla syskon i projektet får samma tid.

Inga nya kolumner. Ingen ny datakälla. Bara konsekvent spegling vid varje skrivpunkt.

## Sanningsmodell
```text
calendar_events.start_time / end_time   ⇄  bookings.<fas>_start_time / <fas>_end_time
                                         (exakt samma värde, alltid)
                  │
                  └── om bookings.large_project_id finns:
                          alla syskon-bokningar (samma fas + samma datum) får samma tid
```

`<fas>` = `rig` | `event` | `rigdown`, mappat från `calendar_events.event_type`.

## Implementation: en gemensam funktion, anropad från alla skrivpunkter

### Ny modul: `src/services/timeSync.ts`
En funktion som är hela sanningen:

```ts
syncPhaseTime({
  bookingId,         // uuid (sub-booking)
  phase,             // 'rig' | 'event' | 'rigDown'
  date,              // YYYY-MM-DD (rigdaydate / eventdate / rigdowndate)
  startISO, endISO,  // de nya tiderna
})
```

Den gör, i en transaktion (RPC) eller sekventiellt:

1. **Bokning:** uppdatera `bookings.<fas>_start_time` / `<fas>_end_time` på `bookingId`.
2. **Kalender:** uppsert `calendar_events` där `booking_id = bookingId AND event_type = phase AND source_date = date` med samma `start_time`/`end_time`.
3. **Stort projekt-spridning:** om bokningen har `large_project_id`, hitta alla *andra* bokningar i samma projekt som har samma fas-datum (`rigdaydate` / `eventdate` / `rigdowndate` = `date`). För varje sådan: upprepa steg 1 + 2 (samma klockslag, samma datum).
4. Returnera `{ syncedSiblings: number }` för toast-feedback.

För att undvika rekursion/loopar: trigger `track_booking_changes` skriver redan till `booking_changes` men den startar ingen kaskad. Vi gör all spridning från klient-/edge-koden, inte via DB-triggers.

### Skrivpunkter som ska gå genom `syncPhaseTime`

**A. Kalender-sidan (när man ändrar tid på ett event):**
- `src/services/eventService.ts` → `updateCalendarEvent`: efter befintlig update, om både `start` och `end` finns och `event_type` + `booking_id` finns → anropa `syncPhaseTime`. Då skrivs det egna eventet förvisso två gånger (en gång nu, en gång via syncPhaseTime steg 2) men idempotent.
  - Renare: vi kan ta bort den första lokala updaten och låta `syncPhaseTime` göra allt jobb. Det blir den föredragna vägen.
- `src/components/Calendar/QuickTimeEditPopover.tsx`: visa toast med `syncedSiblings`-räkning.
- `src/components/Calendar/MoveEventDateDialog.tsx`: samma.
- `src/services/eventEditHelpers.ts` (drag/resize): går redan via `updateCalendarEvent` → ärver beteendet.

**B. Bokning-sidan (när man ändrar tid på själva bokningen):**
- Identifiera UI-platser som direkt skriver `bookings.<fas>_*_time`. Vanliga misstänkta:
  - Bokningens detaljvy / "redigera tider"-modal i Planning.
  - Edge function `planning-api-proxy` (om den exponerar tids-uppdateringar) — där läggs samma helper in på server-sidan.
- Alla dessa byts till att gå genom `syncPhaseTime` (klient eller server).

**C. Edge-funktioner som rör tider:**
- `import-bookings`: gör inget extra — den importerar från extern källa och vi vill inte trigga vår propagering där (den kan skriva olika tider på syskon-bokningar avsiktligt vid import). Lämnas oförändrad.
- `planning-api-proxy`: om den har en "uppdatera tid"-action, lägg in samma propageringssteg där (med service role) så det fungerar även när admin ändrar tid via API-vägen.

### Backfill (engångsfix för befintlig data)
För varje stort projekt: gruppera dess bokningar per fas + datum, ta median-tiden (eller första icke-null) och kör `syncPhaseTime` på alla syskon. Säkerställer att Tiomila och liknande blir konsekvent direkt.

- En liten knapp "Synka alla tider i projektet" i `LargeProjectLayout` som kör backfillen för det öppna projektet. (Plus ev. en admin-batch för alla projekt.)

## Filändringar
- ny: `src/services/timeSync.ts`
- edit: `src/services/eventService.ts` (`updateCalendarEvent` → använd `syncPhaseTime`)
- edit: `src/components/Calendar/QuickTimeEditPopover.tsx` (toast med syskon-räkning)
- edit: `src/components/Calendar/MoveEventDateDialog.tsx` (toast)
- edit: bokningens "redigera tider"-vy i Planning (identifieras under bygget) — skrivs via `syncPhaseTime`
- edit: `supabase/functions/planning-api-proxy/index.ts` om den hanterar tids-uppdateringar (server-side helper med service role)
- edit: `src/pages/project/LargeProjectLayout.tsx` (backfill-knapp)

## Vad som **inte** ändras
- Inga schema-ändringar.
- `import-bookings` rörs inte.
- Personalkalender, AdminTimeReview, mobil, plannedDay etc. fortsätter läsa från `calendar_events` / `bookings.*_time` — får automatiskt rätt värden.

## Edge-case att fundera på
- **Olika datum för samma fas inom samma stora projekt** (t.ex. en bokning har rig 27/4 och en annan rig 28/4). Då propageras INGENTING mellan dem — propagering kräver matchande datum. Det är rätt beteende: olika datum = olika dag, kan ha olika tider.
- **En bokning saknar fas-datum** (t.ex. ingen `rigdowndate`): bara den fas som faktiskt finns spridningsbar. Övriga ignoreras.
