

## Plan: Komplett avbokningsflöde för projekt

### Nuläge — problem på flera ställen

1. **Edge function (`import-bookings`)** sätter avbokade projekt till `completed` (rad 2041-2048), inte `cancelled` — trots att `cancelled` finns som giltig `ProjectStatus` i typsystemet
2. **`handleBookingLifecycleSideEffects`** sätter projekt till `cancelled` korrekt, men har ingen hantering för återaktivering (CANCELLED → CONFIRMED)
3. **Projektlistan** (`UnifiedProjectList`) filtrerar INTE bort `cancelled` från `all_active` — avbokade syns bland aktiva
4. **`GlobalStatusFilter`** saknar `cancelled` som alternativ — kan inte söka efter avbokade
5. **Dashboard-widgeten** (`DashboardCancelledBookings`) erbjuder bara "Ta bort" — ingen möjlighet att återaktivera

### Ändringar

#### 1. Edge function: Använd `cancelled` istället för `completed`
**Fil:** `supabase/functions/import-bookings/index.ts`
- Rad 2045: Ändra `status: 'completed'` → `status: 'cancelled'` för projekt vid avbokning
- Rad 2060: Ändra `status: 'completed'` → `status: 'cancelled'` för jobs vid avbokning
- Lägg till logik: om en befintlig bokning går från CANCELLED → CONFIRMED, återaktivera länkade projekt (`cancelled` → `planning`) och jobs (`cancelled` → `planned`)

#### 2. Lifecycle side-effects: Lägg till återaktivering
**Fil:** `src/services/booking/bookingStatusService.ts`
- Ändra `handleBookingLifecycleSideEffects` att hantera `CONFIRMED`:
  - Om länkat projekt har status `cancelled` → sätt till `planning`
  - Om länkade jobs har status `cancelled` → sätt till `planned`
- Ta bort early return på rad 57 som blockerar all annan status än CANCELLED/OFFER

#### 3. Projektlistan: Göm avbokade från standardvy, lägg till filter
**Fil:** `src/pages/ProjectManagement.tsx`
- Lägg till `'cancelled': 'Avbokade'` i `GLOBAL_STATUS_OPTIONS`
- Uppdatera `GlobalStatusFilter`-typen med `'cancelled'`

**Fil:** `src/components/project/UnifiedProjectList.tsx`
- Rad 156: Ändra `all_active`-filtret: `p.status !== 'completed' && p.status !== 'cancelled'`
- Lägg till: `if (statusFilter === 'cancelled') return p.status === 'cancelled';`
- Rad 164 (default): exkludera även `cancelled`

#### 4. Dashboard-widget: Behåll synlighet, förbättra åtgärder
**Fil:** `src/components/dashboard/DashboardCancelledBookings.tsx`
- Behålls som den är — ger synlig notifiering om avbokningar
- "Ta bort"-knappen finns redan för permanent borttagning

### Filer som ändras

| Fil | Vad |
|-----|-----|
| `supabase/functions/import-bookings/index.ts` | `cancelled` istället för `completed`, + återaktivering |
| `src/services/booking/bookingStatusService.ts` | Hantera CONFIRMED för återaktivering |
| `src/pages/ProjectManagement.tsx` | Nytt filteralternativ `cancelled` |
| `src/components/project/UnifiedProjectList.tsx` | Exkludera `cancelled` från `all_active`, hantera filtret |

### Resultat
- Avbokade projekt får rätt status (`cancelled`, inte `completed`)
- Avbokade syns INTE i standardlistan — bara via filtret "Avbokade"
- Dashboard-widgeten visar avbokningar direkt
- Om en bokning bekräftas igen aktiveras projektet automatiskt med all historik

