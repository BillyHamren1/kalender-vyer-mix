

## Plan: Bevara lokala OCH externa interna anteckningar vid sync

### Problem
Vid sync skrivs `internalnotes` alltid över med det externa API:ets värde (rad 2200+2703 i `import-bookings`). Om det finns lokala anteckningar försvinner de, och om det externa fältet är tomt raderas de lokala.

### Lösning
I `import-bookings/index.ts`, efter att `updateData` byggs (rad 2703), lägg till logik som **mergar** externa och lokala anteckningar istället för att välja en:

- Om **bara** externt värde finns → använd det
- Om **bara** lokalt värde finns → behåll det
- Om **båda** finns och är olika → konkatenera med separator, t.ex.:
  ```
  [Booking] External notes here
  ---
  [Planning] Local notes here
  ```
- Om de redan innehåller båda delar (redan mergade) → ingen ändring

### Fil som ändras
**`supabase/functions/import-bookings/index.ts`** (ca 15 rader tillägg efter rad ~2707):

```typescript
// Preserve and merge internal notes — both sources coexist
const externalNotes = (bookingData.internalnotes || '').trim();
const localNotes = (existingBooking.internalnotes || '').trim();

if (externalNotes && localNotes && externalNotes !== localNotes) {
  // If local already contains the external text, keep as-is
  if (!localNotes.includes(externalNotes)) {
    updateData.internalnotes = `${externalNotes}\n---\n${localNotes}`;
  } else {
    updateData.internalnotes = localNotes; // already merged
  }
} else if (!externalNotes && localNotes) {
  updateData.internalnotes = localNotes; // preserve local
}
// else: external only or both identical — bookingData value is fine
```

Dessutom exkluderas `internalnotes` från `hasBookingChanged` (rad 1292–1296) så att en anteckningsändring inte triggar onödiga uppdateringar av hela bokningen.

### Vad som INTE ändras
- `ProjectInternalNotes` — ingen ändring
- `useBookingInternalNotes` — ingen ändring
- Inga migreringar behövs

