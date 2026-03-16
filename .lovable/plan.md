

## Problem

Bokningen "Stiftelse Stockholm International School #2603-32" visar "Ingen bokning kopplad" trots att jobbet har en giltig `booking_id`. Orsaken: **bokningen skapades med fel `organization_id`**.

- **Jobbet**: `organization_id = f5e5cade...` (Frans August AB) ✅
- **Bokningen**: `organization_id = 08186612...` (Doomie Design AB) ❌
- **Kalenderhändelserna**: `organization_id = 08186612...` (Doomie Design AB) ❌

RLS blockerar bokningen eftersom användaren tillhör Frans August AB men bokningen tillhör Doomie Design AB.

**Totalt drabbat**: 14 bokningar + 12 kalenderhändelser har fel org.

## Rotorsak

`import-bookings` har en fallback i `resolveOrganizationId` som gör `.limit(1).single()` på `organizations`-tabellen. Detta returnerar den **första** organisationen (Doomie Design AB), inte den avsedda (Frans August AB). Fallbacken triggas från:

1. **APITester** (`src/pages/APITester.tsx` rad 150) — anropar utan `organization_id`
2. Eventuella andra anrop som missar parametern

## Fix

### 1. Ta bort fallbacken i `import-bookings` (kräv alltid explicit org_id)

**Fil:** `supabase/functions/import-bookings/index.ts`

Ändra `resolveOrganizationId` så att den **kastar fel** om `organization_id` saknas istället för att gissa:

```typescript
if (!explicitOrgId) {
  throw new Error('organization_id is required. All callers must provide it explicitly.');
}
```

### 2. Fixa APITester att skicka `organization_id`

**Fil:** `src/pages/APITester.tsx`

Hämta `organization_id` från användarens profil och skicka med i anropet (samma mönster som `importService.ts`).

### 3. Fixa felaktiga data via migration

Skapa en SQL-migration som uppdaterar de 14 bokningarna och 12 kalenderhändelserna från `08186612...` till `f5e5cade...` (Frans August AB):

```sql
UPDATE bookings SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE calendar_events SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE booking_products SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE booking_attachments SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE booking_changes SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';

UPDATE warehouse_calendar_events SET organization_id = 'f5e5cade-f08b-4833-a105-56461f15b191' 
WHERE organization_id = '08186612-9d04-4e86-9bef-3111a377cc53';
```

### 4. Deploy `import-bookings`

Deploy den uppdaterade edge-funktionen så att felet aldrig kan uppstå igen.

