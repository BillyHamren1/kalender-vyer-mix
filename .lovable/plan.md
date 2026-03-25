

## Plan: Ta bort "Litet projekt" som skapningsalternativ + Återställ closing-listan

Två saker att fixa:

### 1. Ta bort möjligheten att skapa små projekt

**IncomingBookingsList.tsx** (rad 230-240): Ta bort "Litet"-knappen som skapar jobb via `createJobFromBooking`. Behåll bara "Medel" och "Stort".

**ProjectManagement.tsx** (rad 113-117): ToggleGroup-filtret — ta bort "Litet"-alternativet. Ändra `ProjectTypeFilter` till `'all' | 'medium' | 'large'`.

**UnifiedProjectList.tsx**: Ta bort `small` från `ProjectTypeFilter`-typen och ToggleGroup. Behåll visning av befintliga små projekt (de finns ju redan i systemet) men ta bort möjligheten att konvertera till small.

**ProjectActionMenu.tsx** (rad 28): Filtrera bort `'small'` från konverteringsalternativen så man inte kan ändra till litet projekt.

**projectConversionService.ts**: Ta bort `convertToSmall`-funktionen.

### 2. Återställ closing-listan att inkludera alla projekttyper

**ClosingProjectsList.tsx**: Lägg tillbaka `jobs` (små projekt) i closing-listan. Hämta jobb igen och inkludera dem som `type: 'small'` i `closingItems`. De ska visas men behöver inte ha tidrapport/utläggshantering — expanderingspanelen kan visa "Inga tidrapporter" och tillåta direkt stängning.

### Sammanfattning
- Man ska **inte kunna skapa** eller **konvertera till** små projekt längre
- Befintliga små projekt visas fortfarande i listorna och i closing-vyn
- Closing-listan visar alla projekttyper igen (small, medium, large)

