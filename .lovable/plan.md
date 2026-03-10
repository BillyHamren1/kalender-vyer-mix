

## Problem

`importService.ts` skickar aldrig `organization_id` till `import-bookings` Edge Function. Fallback i Edge Function väljer första organisationen i tabellen (Doomie Design AB `08186612...`). Alla bokningar sparas med fel org-ID och blir osynliga pga RLS.

**Bevis:** Samtliga bokningar i databasen har `organization_id = 08186612-9d04-4e86-9bef-3111a377cc53`.

## Åtgärd

### 1. Fix `src/services/importService.ts`
Före anropet till `import-bookings`, hämta användarens `organization_id` från profilen och inkludera det i request body:

```typescript
// Before the edge function call
const { data: { user } } = await supabase.auth.getUser();
let organizationId: string | undefined;
if (user) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();
  organizationId = profile?.organization_id ?? undefined;
}

// In the body:
body: { 
  ...enhancedFilters, 
  syncMode,
  organization_id: organizationId,  // <-- ADD THIS
  ...
}
```

### 2. Fix befintlig data (SQL via insert-tool)
Uppdatera alla rader som har fel org-ID till rätt (Frans August AB):

```sql
UPDATE bookings SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';
UPDATE calendar_events SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';
UPDATE booking_products SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';
UPDATE booking_attachments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';
UPDATE booking_changes SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';
UPDATE packing_list_items SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';
UPDATE packing_projects SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';
```

### 3. Fix `src/hooks/useCalendarImport.ts`
Samma fix — se till att `organization_id` skickas med vid `triggerImport`.

### Filer som ändras
- `src/services/importService.ts` — hämta och skicka `organization_id`
- `src/hooks/useCalendarImport.ts` — skicka org-ID (om det inte redan delegerar till importService)
- SQL data-fix för alla befintliga rader med fel org-ID

