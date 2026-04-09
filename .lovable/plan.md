

## Plan: Sätt stora projektets datum från första bokningen

### Problem
När ett stort projekt skapas och en bokning kopplas, hämtas aldrig bokningens datum (rigg/event/nedrigg) till projektets `start_date`, `event_date` och `end_date`. Projektet förblir utan datum.

### Lösning
Uppdatera `addBookingToLargeProject` i `src/services/largeProjectService.ts` så att den — **om projektet saknar datum** — automatiskt hämtar den tillagda bokningens datum och sätter dem på projektet.

### Steg

**1. Uppdatera `addBookingToLargeProject` (largeProjectService.ts)**
- Efter att bokningen länkats, kontrollera om projektet saknar `start_date`/`event_date`/`end_date`
- Om ja: hämta bokningens `rigdaydate`, `eventdate`, `rigdowndate` och sätt dem som projektets datum
- Detta gäller alltså bara om projektet är "tomt" på datum — befintliga datum rörs inte

**2. Uppdatera `AddToLargeProjectDialog` (AddToLargeProjectDialog.tsx)**
- När ett nytt projekt skapas med en bokning i samma flöde: skicka med bokningens datum direkt till `createLargeProject`

### Teknisk detalj

I `addBookingToLargeProject`, efter insert av länken:

```typescript
// If project has no dates, inherit from first booking
const { data: project } = await supabase
  .from('large_projects')
  .select('start_date, event_date, end_date')
  .eq('id', largeProjectId)
  .single();

if (project && !project.start_date && !project.event_date && !project.end_date) {
  const { data: booking } = await supabase
    .from('bookings')
    .select('rigdaydate, eventdate, rigdowndate')
    .eq('id', bookingId)
    .single();

  if (booking) {
    await supabase
      .from('large_projects')
      .update({
        start_date: booking.rigdaydate || null,
        event_date: booking.eventdate || null,
        end_date: booking.rigdowndate || null,
      })
      .eq('id', largeProjectId);
  }
}
```

Befintliga datum kan sedan justeras manuellt av användaren som vanligt.

