

# Propagera tidsändringar från projektnivå till alla bokningar

## Problem
När användaren ändrar tider (start/slut) på RIGG/EVENT/NEDRIVNING i stora projektets schedule-vy sparas ingenting — tiderna visas bara read-only. Användaren vill kunna ändra tider här och att de propageras ner till alla underliggande bokningar.

## Lösning

### 1. Uppdatera `LargeProjectScheduleEditable.tsx`
- `handleSave` ska nu skicka **både datum och tider** uppåt via `onUpdateDates` (eller en ny callback `onUpdateSchedule`)
- Behåll tidsfälten i `EditDateDialog` (de ska vara redigerbara)

### 2. Uppdatera `LargeProjectLayout.tsx`
- Byt ut den enkla `detail.updateProject(updates)`-callbacken mot en ny funktion som:
  1. Uppdaterar projektets datum (`start_date`, `event_date`, `end_date`) via `detail.updateProject`
  2. Loopar igenom **alla länkade bokningar** och anropar `updateBookingDateWithTimes(bookingId, dateType, newDate, startTime, endTime)` för var och en
  3. Triggar `import-bookings` edge function (syncMode: single) per bokning för kalendersynk
  4. Invaliderar queries så att de härledda tiderna uppdateras

### 3. Justera callback-signaturen
- `onUpdateDates` → `onUpdateSchedule(dateType: DateType, date: string, startTime: string, endTime: string)`
- Enklare och tydligare — skickar allt som behövs för att propagera

## Filer som ändras
- `src/components/project/LargeProjectScheduleEditable.tsx` — skicka datum+tider, behåll tidsfält i dialogen
- `src/pages/project/LargeProjectLayout.tsx` — propagera till alla bokningar via `updateBookingDateWithTimes` + kalendersynk

## Resultat
- Ändra rigg-tid 08:00→07:00 i projektvyn → alla bokningars `rig_start_time` uppdateras → kalendern speglar den nya tiden

