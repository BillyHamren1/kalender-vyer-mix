

## Fix: Visa personalval alltid i "Lägg till aktivitet"

### Problem
Personalvalet visas bara om `staffPool.length > 0`. Om inga anställda är tilldelade till projektets bokningar (via `booking_staff_assignments`) blir listan tom och hela dropdown:en döljs.

### Lösning

**1. `src/pages/project/LargeEstablishmentPage.tsx`**
Ändra staffPool-queryn: om `booking_staff_assignments` ger 0 resultat (eller om det inte finns bokningar), hämta **alla** aktiva `staff_members` som fallback istället för att returnera tom lista.

```
queryFn: async () => {
  let staffIds: string[] = [];
  
  if (bookingIds.length > 0) {
    const { data } = await supabase
      .from('booking_staff_assignments')
      .select('staff_id')
      .in('booking_id', bookingIds);
    staffIds = [...new Set((data || []).map(d => d.staff_id))];
  }

  // Fallback: hämta alla aktiva personal om ingen är tilldelad
  const query = supabase.from('staff_members').select('id, name').eq('is_active', true).order('name');
  if (staffIds.length > 0) {
    query.in('id', staffIds);
  }
  const { data: staffData } = await query;
  return staffData || [];
}
```

Ändra också `enabled` till bara `!!project?.id` (ta bort `bookingIds.length > 0`-kravet).

**2. `src/components/project/AddEstablishmentTaskDialog.tsx`**
Ta bort villkoret `staffPool.length > 0` runt personalvalet (rad 234). Dropdown:en ska alltid visas — om listan är tom visas bara "Ingen tilldelad".

### Filer att ändra
- `src/pages/project/LargeEstablishmentPage.tsx` — fallback-hämtning av all personal
- `src/components/project/AddEstablishmentTaskDialog.tsx` — visa dropdown oavsett listans storlek

