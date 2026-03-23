

## Plan: Taggar redigeringsbara på personalkortet + kalenderfiltrering per tagg

### Sammanfattning

Tre saker ska fixas:
1. Taggar (Montage/Lager) ska kunna redigeras direkt på personalkortet (StaffDetail)
2. Planeringskalendern (montage) visar bara personal med taggen "Montage"
3. Lagerkalendern visar bara personal med taggen "Lager"
4. Personal med båda taggarna syns i båda kalendrarna

### 1. Redigera taggar på personalkortet

**Fil: `src/pages/StaffDetail.tsx`**

I "Anställning"-kortet (rad 265-278), lägg till en tagg-sektion under "Anställningsdatum". Samma UI som i EditStaffDialog: klickbara badges för "Montage" och "Lager" som togglar on/off och sparar direkt till databasen via `handleFieldSave` (anpassad för arrays).

### 2. Filtrera personal i kalenderdialoger baserat på taggar

Huvudändringen sker i **`src/services/staffAvailabilityService.ts`** — funktionen `getAvailableStaffForDateRange`:

- Lägg till en optional parameter `filterByTag?: string`
- Om satt, filtrera `staff_members`-queryn med `.contains('tags', [filterByTag])`
- Kallar-koden skickar `'Montage'` från planeringskalendern och `'Lager'` från lagerkalendern

**Filer som uppdateras för att skicka tag-filter:**
- `src/components/Calendar/StaffSelectionDialog.tsx` — ta emot en `calendarType` prop, skicka `'Montage'` till `getAvailableStaffForDate`
- `src/hooks/useAvailableStaffWeek.tsx` — ta emot `filterByTag` och skicka vidare
- `src/components/Calendar/StaffSelector.tsx` — samma mönster

Lagerkalendern behöver identifieras — den använder troligen samma komponenter men med kontexten "warehouse". Jag lägger till en prop som propageras genom befintliga kalender-komponenter.

### 3. Ingen databasändring

Kolumnen `tags text[]` finns redan. PostgreSQL `@>` (contains) operatorn fungerar med Supabase `.contains()`.

### Tekniska detaljer

**staffAvailabilityService.ts — ändrad signatur:**
```text
getAvailableStaffForDateRange(dates, filterByTag?)
  → .select('id, name, tags')
  → om filterByTag: .contains('tags', [filterByTag])
```

**StaffDetail.tsx — ny sektion i Anställning-kortet:**
- Klickbara badges: Montage / Lager
- Klick → supabase update `tags` array → refetch

**StaffSelectionDialog.tsx:**
- Ny prop: `filterByTag?: string`
- Skickas vidare till `getAvailableStaffForDate(date, filterByTag)`

**Identifiering av kalendertyp:**
- Planeringskalendern (huvudkalendern) → `filterByTag='Montage'`
- Lagerkalendern → `filterByTag='Lager'`
- Propageras från sidnivå ner genom komponenterna

