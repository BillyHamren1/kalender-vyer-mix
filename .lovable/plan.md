

# Lägg till "Nytt meddelande" (+) i inkorgen

## Problem
Det finns ingen knapp för att starta en ny konversation med någon man inte redan chattat med.

## Plan

### 1. Nytt backend-endpoint: `get_contacts`
**Fil:** `supabase/functions/mobile-app-api/index.ts`

Lägg till ett nytt case `get_contacts` som returnerar alla kontaktbara personer i organisationen:
- Hämta alla `staff_members` i samma `organization_id` (exkludera sig själv)
- Hämta alla `profiles` kopplade till organisationen (planerare)
- Returnera `{ contacts: [{ id, name, type: 'staff'|'planner' }] }`

### 2. Ny API-metod i frontend
**Fil:** `src/services/mobileApiService.ts`

Lägg till:
```typescript
getContacts: () => callApi<{ contacts: { id: string; name: string; type: string }[] }>('get_contacts'),
```

### 3. Ny vy: Kontaktväljare + nytt meddelande
**Fil:** `src/pages/mobile/MobileInbox.tsx`

- Lägg till en `+`-knapp (FAB) i inkorgens listvy, nere till höger
- Nytt view-state: `'new-message'`
- Vid klick: hämta kontakter via `mobileApi.getContacts()`, visa sökbar lista
- Vid val av kontakt: öppna DM-tråd direkt (om konversation redan finns, öppna den; annars starta ny tom tråd)

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `supabase/functions/mobile-app-api/index.ts` | Nytt case `get_contacts` + handler |
| `src/services/mobileApiService.ts` | Ny `getContacts()`-metod |
| `src/pages/mobile/MobileInbox.tsx` | FAB-knapp + kontaktväljare-vy |

