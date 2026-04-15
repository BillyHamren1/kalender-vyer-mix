

## Plan: Fixa bokning #2602-13 och revert bulk-migrationen

### Problem
1. Förra migrationen satte `assigned_to_project = true` på **alla** bokningar med jobb/projekt — det var bara #2602-13 som skulle fixas.
2. 9 bokningar med enbart avslutade projekt har nu felaktigt `assigned_to_project = true` och syns inte som "nya".

### Åtgärd

**Steg 1 — Datafix (via insert-verktyget)**
Kör UPDATE på de 9 drabbade bokningarna som har `assigned_to_project = true` men inga aktiva jobb/projekt/large-links. Sätter `assigned_to_project = false` och `assigned_project_id = NULL` för dessa.

```sql
UPDATE bookings b
SET assigned_to_project = false, assigned_project_id = NULL, assigned_project_name = NULL
WHERE b.assigned_to_project = true
AND b.status = 'CONFIRMED'
AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.booking_id = b.id AND j.deleted_at IS NULL AND j.status NOT IN ('completed','cancelled'))
AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.booking_id = b.id AND p.status NOT IN ('completed','cancelled'))
AND NOT EXISTS (SELECT 1 FROM large_project_bookings lpb WHERE lpb.booking_id = b.id);
```

**Steg 2 — Fixa IncomingBookingsList-filtret**
Samma problem som i `DashboardNewBookings`: filtret i `IncomingBookingsList.tsx` (rad ~55) exkluderar completed jobb. Ta bort `.not('status', 'in', '("completed","cancelled")')` från jobs-queryn så att bara **aktiva** jobb blockerar visning.

### Resultat
Bokning #2602-13 (och andra med enbart avslutade projekt) dyker upp som "nya" igen och kan tilldelas nya projekt.

