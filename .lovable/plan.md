## Problem

Panelen **"Uppdaterade bokningar"** (på `/projects` och dashboard) listar varje bokning där `bookings.needs_review = true`. Idag flaggas detta för **alla** UPDATE på `bookings` (oavsett källa), så ändringar som görs **inuti vårt system** (Planning-UI, internal notes, status-bytes, team-tilldelningar m.m.) hamnar i listan tillsammans med riktiga externa ändringar från Booking.

Du vill att panelen ENDAST visar ändringar som kommer från det externa Booking-systemet (import-bookings / booking-webhook).

## Rotorsak

Triggern `public.track_booking_changes()` (senast definierad i `supabase/migrations/20260604200105_*.sql`) sätter:

```sql
IF has_external_changes AND OLD.assigned_to_project = true AND NOT should_skip_review THEN
  NEW.needs_review := true;
  NEW.needs_review_reason := change_type_value;
END IF;
```

Variabeln `should_skip_review` läses från GUC `app.skip_review`, men ingen Planning-UI-mutation sätter den. Resultat: varje UPDATE från authenticated user flaggar `needs_review`.

`resolved_changed_by` beräknas redan längre ner i samma trigger:
- `service_role` = edge function (import-bookings, booking-webhook) → extern Booking-ändring
- `authenticated` = Planning UI/intern mutation → ska INTE flagga needs_review

## Lösning (minsta möjliga ändring)

**En migration**: skriv om `public.track_booking_changes()` så att `needs_review`-flaggan bara sätts när källan är extern.

### Ändringar i trigger

1. Flytta `resolved_changed_by`-beräkningen UPPÅT (före needs_review-blocket).
2. Lägg till en `is_external_source`-flagga:
   ```sql
   is_external_source := resolved_changed_by IN ('service_role', 'booking-import', 'booking-webhook');
   ```
3. Uppdatera villkoret:
   ```sql
   IF has_external_changes 
      AND OLD.assigned_to_project = true 
      AND NOT should_skip_review
      AND is_external_source THEN
     NEW.needs_review := true;
     NEW.needs_review_reason := change_type_value;
   END IF;
   ```
4. `booking_changes`-loggen påverkas INTE — alla ändringar fortsätter loggas där (med `changed_by` så audit-trailen kan filtreras på källa i framtiden).

### Engångsstädning av redan flaggade interna ändringar

Det finns redan 6 bokningar med `needs_review=true` i listan (skärmdumpen). Eftersom vi inte vet vilka som är externa vs interna i historik, gör vi **ingen massiv reset** (per "Never Delete DB Rows"-policyn). Två alternativ — välj ett i nästa steg:

- **A (mjukast)**: Lämna befintliga 6 kvar — användaren klickar "Godkänn" en gång och de försvinner. Nya interna ändringar flaggas inte framåt.
- **B (rensa nu)**: En engångs-UPDATE `SET needs_review=false, needs_review_reason=null WHERE needs_review=true`. Du måste explicit godkänna eftersom det är massiv UPDATE.

Default i planen: **A** (säkrast).

## Vad som INTE ändras

- Frontend (`UpdatedBookingsList.tsx`, `DashboardUpdatedBookings.tsx`) — orörd. Den läser fortfarande `needs_review=true`, men nu kommer endast externa Booking-ändringar dit.
- `booking_changes`-tabellen — orörd. All change-historik bevaras.
- `BookingChangesDetail` (expanderad detaljvy) — orörd.
- `import-bookings`/`booking-webhook` — orörda. De kör som `service_role` → triggern flaggar nu korrekt.
- Inga datatabeller raderas, inga DELETEs körs.

## Verifiering efter migration

Vitest-kontrakttest (`src/test/bookingNeedsReviewSource.contract.test.ts`) som verifierar:
1. Trigger-källkod innehåller `is_external_source`-villkoret för `NEW.needs_review := true`.
2. Trigger sätter fortfarande `booking_changes`-rad för alla UPDATE (interna + externa).

Manuell smoke-test:
1. Öppna en bokning i Planning-UI, redigera ett fält → bokningen ska INTE dyka upp i "Uppdaterade bokningar".
2. Simulera import-bookings-uppdatering (eller vänta på nästa sync) → bokningen SKA dyka upp.

## Filer som ändras

- **NY**: `supabase/migrations/<timestamp>_track_booking_changes_external_only.sql` — `CREATE OR REPLACE FUNCTION public.track_booking_changes()` med uppdaterat villkor.
- **NY**: `src/test/bookingNeedsReviewSource.contract.test.ts` — låser kontraktet.

Inga andra filer rörs.