

## Fix: OrphanBookingsWarning visar falska positiver

### Problem
Varningen "bekräftade bokningar saknar projekt" visar bokningar som faktiskt ÄR kopplade till stora projekt (via `large_project_bookings` och `large_project_id`). Queryn kollar bara `assigned_to_project = false` men ignorerar `large_project_id`.

Alla 6 flaggade bokningar (2603-116, 2602-15, 2603-126, 2603-127, 2604-5, 2603-125) har `large_project_id` satt och finns i `large_project_bookings`.

### Lösning
Uppdatera queryn i `OrphanBookingsWarning.tsx` för att också exkludera bokningar med `large_project_id`:

**`src/components/project/OrphanBookingsWarning.tsx`** — lägg till `.is('large_project_id', null)` i queryn (rad 15-16):

```typescript
.or('assigned_to_project.is.null,assigned_to_project.eq.false')
.is('large_project_id', null)
```

Detta gör att bokningar kopplade till stora projekt inte längre visas som "orphans". En rad ändras, inget annat påverkas.

