

## Plan: Direkt projektsynlighet via BSA — ingen large_project_staff

### Princip

Om Billy har EN BSA-rad mot en bokning som tillhör ett stort projekt → han ser ALLA bokningar i det projektet. Ingen extra tabell behövs.

### Vad som ändras

**`supabase/functions/mobile-app-api/index.ts` — `handleGetBookings`**

Byt ut steg 2 (large_project_staff-lookup) mot:

1. Hämta BSA-bokningar som idag (oförändrat)
2. **NYTT**: Kolla vilka av dessa BSA-bokningar som tillhör ett stort projekt via `large_project_bookings`
3. **NYTT**: Hämta ALLA bokningar i de projekten
4. Slå ihop och markera `assignment_type` som vanligt

```text
BSA → booking_id X
  ↓
large_project_bookings: booking X tillhör projekt "Swedish Game Fair"
  ↓
Hämta ALLA booking_ids i "Swedish Game Fair"
  ↓
Billy ser alla 29 bokningar
```

### Vad som tas bort / kan ignoreras

- Triggern `trg_auto_add_to_large_project_staff` och backfill-migrationen blir onödiga (kan lämnas kvar utan skada — de gör ingen skada men används inte längre av appen)
- `large_project_staff`-tabellen används inte längre för mobilappen

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `supabase/functions/mobile-app-api/index.ts` | Ändra `handleGetBookings` rad ~400-417: ersätt `large_project_staff`-query med BSA→project-chain |

### Exakt logik (rad 400-417 ersätts)

```typescript
// 2. Check if any BSA bookings belong to a large project
const bsaIds = (assignments || []).map(a => a.booking_id).filter(id => !id.startsWith('location-'))
let projectBookingIds: string[] = []
if (bsaIds.length > 0) {
  const { data: lpLinks } = await supabase
    .from('large_project_bookings')
    .select('large_project_id')
    .in('booking_id', bsaIds)
    .eq('organization_id', organizationId)
  
  const projectIds = [...new Set((lpLinks || []).map(r => r.large_project_id))]
  
  if (projectIds.length > 0) {
    const { data: allProjectBookings } = await supabase
      .from('large_project_bookings')
      .select('booking_id')
      .in('large_project_id', projectIds)
      .eq('organization_id', organizationId)
    projectBookingIds = (allProjectBookings || []).map(r => r.booking_id)
  }
}
```

Resten av funktionen (merge, assignment_type-logik) förblir oförändrad.

