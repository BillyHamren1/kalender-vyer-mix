
# Fixa: "Kunde inte lägga till bokning i projekt"

## Sammanfattning av problemet
Bokningen "A Catering Sweden AB" är redan tillagd i "Swedish game fair" men visas ändå i listan "Nya bokningar". När du försöker lägga till den igen får du felet eftersom databasen har en unik begränsning som förhindrar dubletter.

## Åtgärder

### 1. Filtrera bort redan tilldelade bokningar
Uppdatera Project Management-sidan så att "Nya bokningar"-listan exkluderar bokningar som redan har ett `large_project_id`.

**Fil**: `src/pages/ProjectManagement.tsx` eller relevant service-fil

**Ändring**: Lägg till filter `large_project_id IS NULL` i frågan som hämtar nya/obesvarade bokningar.

### 2. Bättre felhantering i dialogen
Uppdatera `AddToLargeProjectDialog` för att ge ett mer informativt felmeddelande när bokningen redan finns.

**Fil**: `src/components/project/AddToLargeProjectDialog.tsx`

**Ändring**: Fånga specifika fel (duplicate key) och visa meddelandet "Bokningen är redan tillagd i detta projekt".

### 3. Kontrollera före tillägg (valfritt)
Lägg till en kontroll i `addBookingToLargeProject`-funktionen som först kollar om kombinationen redan finns, för att ge ett renare felmeddelande.

---

## Tekniska detaljer

### Databasstruktur
- Tabellen `large_project_bookings` har en unik begränsning på `(large_project_id, booking_id)`
- Tabellen `bookings` har en kolumn `large_project_id` som uppdateras vid tilldelning

### Berörda filer
1. `src/pages/ProjectManagement.tsx` - hämtning av nya bokningar
2. `src/services/largeProjectService.ts` - `addBookingToLargeProject` funktion
3. `src/components/project/AddToLargeProjectDialog.tsx` - felhantering

### Planerade ändringar

**largeProjectService.ts (rad 156-191)**:
```typescript
export async function addBookingToLargeProject(...) {
  // Ny: Kolla om redan tillagd
  const { data: existing } = await supabase
    .from('large_project_bookings')
    .select('id')
    .eq('large_project_id', largeProjectId)
    .eq('booking_id', bookingId)
    .single();
  
  if (existing) {
    throw new Error('BOOKING_ALREADY_ADDED');
  }
  
  // ... resten av koden
}
```

**AddToLargeProjectDialog.tsx (rad 57-68)**:
```typescript
onError: (error: any) => {
  if (error?.message === 'BOOKING_ALREADY_ADDED') {
    toast.error('Bokningen är redan tillagd i detta projekt');
  } else {
    toast.error('Kunde inte lägga till bokning i projekt');
  }
},
```

**Query för nya bokningar**:
Lägg till `.is('large_project_id', null)` i frågan som hämtar nya bokningar.
