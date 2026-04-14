

## Plan: Automatisk projekttilldelning vid kalenderbemanning

### Vad som ska hända

1. Planeraren tilldelar Billy till Team 4 på en tisdag i kalendern (som idag)
2. Triggern skapar BSA-rader som vanligt (oförändrat)
3. **NYTT**: Systemet kontrollerar om bokningen tillhör ett stort projekt via `large_project_bookings`
4. **NYTT**: Om ja → Billy läggs automatiskt till i `large_project_staff` (om han inte redan finns där)
5. Billy ser nu ALLA bokningar i hela projektet i tidappen

### Teknisk lösning

En ny trigger på `booking_staff_assignments` (AFTER INSERT) som:
- Kollar om `booking_id` finns i `large_project_bookings`
- Om ja, insertar en rad i `large_project_staff` med `role = 'field'`
- `ON CONFLICT DO NOTHING` om personen redan är projektmedlem

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| Migration SQL | Ny trigger `auto_add_to_large_project_staff` på `booking_staff_assignments` |

Ingen annan kodändring behövs — edge-funktionen hanterar redan `large_project_staff` för visning i appen.

### Flöde

```text
Kalender: tilldela Billy → Team 4 → tisdag 10 juni
  ↓
Befintlig trigger: BSA-rad skapas (booking X, Billy, team-4, 2025-06-10)
  ↓
NY trigger: booking X finns i large_project_bookings → projekt "Swedish Game Fair"
  ↓
INSERT INTO large_project_staff (large_project_id, staff_id, role)
VALUES ('sgf-id', 'billy-id', 'field')
ON CONFLICT DO NOTHING
  ↓
Billy ser alla 29 bokningar i tidappen
```

