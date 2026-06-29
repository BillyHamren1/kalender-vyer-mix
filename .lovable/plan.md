## Problem

När en bokning placeras i ett **befintligt stort projekt** anropar `BookingPlacementDialog.handleFinish` `writeProjectDates({ projectType: 'large', dates: <hela LP:s datumarrayer> })`. Edge-funktionen `apply-project-dates` itererar då **sekventiellt** över *samtliga* sub-bokningar i LP:t och kör per bokning:

1. UPDATE `bookings.{phase}date` lokalt
2. HTTP push till externa bokningssystemet (`pushBookingFieldsToExternal`)
3. `supabase.functions.invoke('import-bookings', { booking_id, localOnly:true })` — rebuildar calendar_events
4. INSERT i `sync_audit_log`

För ett LP med t.ex. 15 sub-bokningar = 15 × (extern HTTP + edge-invoke + DB-skrivningar) i serie. Det är därför det tar evigheter — trots att de andra bokningarna redan har korrekta datum.

## Lösning

Den enda bokning som faktiskt behöver datum-propagering är **den nyinlagda**. Övriga sub-bokningar är redan i synk.

### Steg 1 — `apply-project-dates`: stöd för riktad körning
Lägg till valfri `only_booking_ids?: string[]` i request body. När den är satt:
- `resolveBookingIds` returnerar snittet mellan projektets bokningar och `only_booking_ids` (säkerhetsfilter — annan org kan inte injicera främmande id:n).
- Övrig logik oförändrad.

Parallellisera även loopen i skarpläget med `Promise.all(bookingIds.map(processBooking))` så att eventuella framtida bulk-körningar också blir snabbare.

### Steg 2 — `projectDateAuthority.writeProjectDates` propagerar fältet
Lägg till `onlyBookingIds?: string[]` i `WriteProjectDatesInput` och skicka som `only_booking_ids` i body.

### Steg 3 — `BookingPlacementDialog` skickar bara den nya bokningen
I `linkingToExistingLarge`-grenen:

```ts
await writeProjectDates({
  projectId: largeProjectId,
  projectType: 'large',
  dates: phaseDates,
  onlyBookingIds: [booking.id],   // 👈 nytt
});
```

Resultat: endast 1 bokning processas oavsett hur många syskon LP:t har → snabbt.

## Teknisk detalj

Filer som ändras:

- `supabase/functions/apply-project-dates/index.ts` — schema-validering, `resolveBookingIds`-filter, parallell loop
- `supabase/functions/apply-project-dates/index.test.ts` — testfall för `only_booking_ids` (filtrering + säkerhet mot främmande id)
- `src/services/projectDateAuthority.ts` — `onlyBookingIds`-fält
- `src/components/project/BookingPlacementDialog.tsx` — skickar `onlyBookingIds: [booking.id]`

Inga DB-migrationer. Inget UI ändras. Bakåtkompatibelt: utan `only_booking_ids` beter sig funktionen exakt som idag.

## Validering

- Befintliga vitest-tester kring `BookingPlacementDialog` (`projectIncomingFlow.test.ts`) körs och uppdateras vid behov.
- `supabase--test_edge_functions` på `apply-project-dates` för det nya testet.
- Manuell verifiering: placera bokning i befintligt LP, mät tid i Network-tabben.
