
# Plan: Ta bort packningsprojekt vid avbokning

## Problem
När en bokning ändras till "CANCELLED" i det externa systemet tar import-funktionen bort kalenderhändelser, men packningsprojektet ligger kvar och visas i lagersystemet.

## Lösning
Uppdatera `import-bookings` edge function för att också radera eller markera packningsprojekt när en bokning avbokas.

---

## Tekniska ändringar

### 1. Edge Function - import-bookings/index.ts

Lägg till radering av packningsprojekt i avbokningslogiken (efter rad 732):

```typescript
// Remove warehouse calendar events (befintlig kod)
const { error: deleteWhError } = await supabase
  .from('warehouse_calendar_events')
  .delete()
  .eq('booking_id', existingBooking.id)

// ... befintlig loggning ...

// ===== NY KOD =====
// Ta bort packningsprojekt och tillhörande data
const { error: deletePackingError } = await supabase
  .from('packing_projects')
  .delete()
  .eq('booking_id', existingBooking.id)

if (deletePackingError) {
  console.error(`Error removing packing project for CANCELLED booking:`, deletePackingError)
} else {
  console.log(`Removed packing project for CANCELLED booking ${existingBooking.id}`)
}
```

### 2. Åtgärda existerande data

Kör en direkt SQL-rensning för att ta bort den befintliga avbokade packningsprojektet:

```sql
DELETE FROM packing_projects 
WHERE booking_id IN (
  SELECT id FROM bookings WHERE status = 'CANCELLED'
);
```

---

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `supabase/functions/import-bookings/index.ts` | Lägg till radering av packing_projects vid CANCELLED |
| Databas | Engångsrensning av redan avbokade packningsprojekt |

---

## Resultat

1. När en bokning avbokas i externa systemet kommer:
   - Bokningens status uppdateras till CANCELLED
   - Kalenderhändelser raderas
   - Lagerhändelser raderas
   - **Packningsprojektet raderas** (nytt!)

2. Den befintliga "A Catering Sweden AB"-packningsprojektet försvinner omedelbart efter SQL-rensning.
