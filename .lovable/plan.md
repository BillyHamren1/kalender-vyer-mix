

## Visa etableringsuppgifter (to-dos) i tidappen

### Vad som ska byggas
Personalen ska se sina tilldelade etableringsuppgifter som en **checklista** direkt i **Info-fliken** på jobb-detaljsidan i mobilappen. Bara uppgifter tilldelade den inloggade personen visas. De kan bocka av uppgifter direkt.

### Ändringar

**1. Edge function: `mobile-app-api/index.ts`**
I `handleGetBookingDetails` (rad ~1399), lägg till en fetch av `establishment_tasks` filtrerat på `booking_id` OCH `assigned_to = staffId`:

```sql
SELECT id, title, category, start_date, end_date, completed, notes
FROM establishment_tasks
WHERE booking_id = $booking_id AND assigned_to = $staffId
ORDER BY start_date, sort_order
```

Inkludera resultatet i responsen som `establishment_tasks`.

Lägg även till en ny action `toggle_establishment_task` som tar `task_id` och togglar `completed`-status (med verifiering att uppgiften är tilldelad till den inloggade personalen).

**2. Frontend: `JobInfoTab.tsx`**
Lägg till en ny sektion **"Mina uppgifter"** mellan "Interna anteckningar" och "Kommentarer" (~rad 299). Visa en checklista med:
- Kategori-ikon + titel
- Datum (start → slut)  
- Checkbox för att bocka av

Vid klick på checkbox: anropa `mobileApi` med `toggle_establishment_task`.

**3. Service: `mobileApiService.ts`**
Lägg till metod `toggleEstablishmentTask(taskId: string)` som anropar edge function med action `toggle_establishment_task`.

### Filer att ändra
- `supabase/functions/mobile-app-api/index.ts` — Hämta establishment_tasks + ny toggle-action
- `src/components/mobile-app/job-tabs/JobInfoTab.tsx` — Ny checklista-sektion
- `src/services/mobileApiService.ts` — Ny API-metod

