

# Separat kopiera-dialog vid klick på "Kopiera"

## Vad
När användaren klickar "Kopiera" i flytta-dialogen ska en ny dialog öppnas där man kan ändra datum, tid och team för kopian — sedan klicka "Spara" för att skapa den.

## Hur

### 1. Skapa `CopyEventDialog.tsx`
Ny komponent med:
- Datum-väljare (kalender), tid-inputs (start/slut), team-dropdown — samma layout som flytta-dialogen
- Titel: "Kopiera händelse"
- Visar källhändelsens info (titel, nuvarande datum/tid)
- "Spara"-knapp som anropar `createCalendarEvent` med valda värden
- "Avbryt" stänger dialogen

### 2. Ändra `MoveEventDateDialog.tsx`
- "Kopiera"-knappen öppnar `CopyEventDialog` istället för att direkt duplicera
- Ta bort `handleDuplicate`-funktionen
- Lägg till state `showCopyDialog` + rendera `CopyEventDialog` med event-data och resources som props
- När kopian sparas: stäng båda dialogerna och anropa `onUpdate`

