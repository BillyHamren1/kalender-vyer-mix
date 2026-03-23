

## Problem: Inbox-sidan gör 3 separata API-anrop

`useMobileInbox` triggar tre parallella anrop till edge-funktionen `mobile-app-api`:
1. `get_direct_messages` — hämtar alla DMs, grupperar per partner
2. `get_broadcasts` — hämtar broadcasts + filtrerar per staff
3. `get_inbox_jobs` — hämtar bokningar via assignments

Varje anrop är ett separat HTTP-request till samma edge function. Med Supabase edge functions kan varje anrop trigga en **cold boot** (~100-500ms) plus nätverkslatens. Tre sekventiella/parallella anrop multiplicerar väntetiden. Dessutom har varje anrop en 12s timeout — om en hänger blockerar det hela sidan.

### Lösning: Kombinera till ett enda anrop

**1. Ny action `get_inbox_all` i edge-funktionen**
- Kör alla tre queries (DMs, broadcasts, inbox jobs) i en enda request med `Promise.all`
- Returnerar `{ conversations, broadcasts, bookings }` i ett svar
- En cold boot istället för tre

**2. Uppdatera `useMobileInbox` hooket**
- Byt från tre separata `useQuery` till en enda query med key `['mobile-inbox-all']`
- Destructura resultatet till `dmConversations`, `broadcasts`, `jobConversations`
- Behåll optimistic update-funktionerna (de uppdaterar cachen direkt)

**3. Uppdatera `useUnreadMessageCount`**
- Anpassa cache-nyckeln till `['mobile-inbox-all']` istället för separata nycklar

**4. Ny API-metod i `mobileApiService.ts`**
- `getInboxAll()` → `callApi('get_inbox_all')`

### Tekniska detaljer

**Edge function (`mobile-app-api/index.ts`):**
```text
case 'get_inbox_all':
  return await handleGetInboxAll(supabase, staffId, organizationId)
```
`handleGetInboxAll` kör befintliga DM/broadcast/jobs-queries med `Promise.all` och returnerar allt i ett JSON-objekt.

**Filer som ändras:**
- `supabase/functions/mobile-app-api/index.ts` — ny handler + route
- `src/services/mobileApiService.ts` — ny `getInboxAll` metod
- `src/hooks/useMobileInbox.ts` — en query istället för tre
- `src/hooks/useUnreadMessageCount.ts` — uppdaterad cache-nyckel

Resultat: 1 nätverksanrop istället för 3, snabbare laddning.

