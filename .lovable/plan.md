

## Problem: Meddelanden synkar långsamt och webben/appen har separata identiteter

### Tre separata problem identifierade

---

### Problem 1: Sync sker inte förrän man öppnar inkorgen

**Orsak**: `useMobileInbox` hook anropas bara från `MobileInbox`-sidan. Ingen prefetch sker vid app-start.

**Lösning**: Starta inbox-fetch redan i `MobileAppLayout` (som renderas på alla sidor) genom att trigga en bakgrunds-prefetch av `mobile-inbox-all` direkt när appen laddas. Ingen UI-rendering — bara cachning i bakgrunden.

**Fil**: `src/components/mobile-app/MobileAppLayout.tsx`
- Lägg till en `useEffect` som gör `queryClient.prefetchQuery` med `mobile-inbox-all` queryKey vid mount

---

### Problem 2: Nya meddelanden syns inte i realtid

**Orsak**: `useMobileInbox` pollar var 30:e sekund. `useUnreadMessageCount` har Supabase Realtime-subscription men uppdaterar bara badge-räknaren, inte inbox-datan.

**Lösning**: Lägg till Supabase Realtime-subscription i `useMobileInbox` som invaliderar `mobile-inbox-all`-cachen vid INSERT på `direct_messages` och `broadcast_messages`. Minska refetchInterval till 60s (backup). Använd `useRealtimeInvalidation`-hooken som redan finns.

**Fil**: `src/hooks/useMobileInbox.ts`
- Lägg till `useRealtimeInvalidation` för tabellerna `direct_messages` och `broadcast_messages` med queryKey `['mobile-inbox-all']`
- Öka refetchInterval till 60s (backup only)

---

### Problem 3: Webb-identitet ≠ App-identitet

**Orsak**: När Billy Hamrén skickar DM från webben (OpsDirectChat, FloatingInbox, CommunicationPage), används `user?.id` (Supabase auth UUID) som `sender_id`. I tidappen identifieras Billy med `staff_members.id`. Dessa är olika UUID:n. Appen söker DMs med `sender_id = staff_member_id` och hittar aldrig meddelanden skickade med auth UUID.

**Lösning**: Koppla ihop identiteterna. Tabellen `staff_members` behöver ett fält `user_id` som pekar på Supabase auth-kontot. Sedan uppdateras `handleGetInboxAll` i edge-funktionen att söka DMs med **båda** ID:na (staff_member_id OCH user_id).

**Steg**:
1. **Migration**: Lägg till kolumn `user_id UUID` i `staff_members`-tabellen
2. **Edge function**: Uppdatera `handleGetInboxAll` att hämta staffens `user_id`, sedan söka DMs med `sender_id IN (staffId, userId) OR recipient_id IN (staffId, userId)`
3. **Admin-UI**: Lägg till möjlighet att koppla staff_member till ett användarkonto (kan göras i ett senare steg — initialt kan kopplingen sättas manuellt i databasen)

### Filer som ändras
- `src/components/mobile-app/MobileAppLayout.tsx` — prefetch inbox vid start
- `src/hooks/useMobileInbox.ts` — realtime-subscription + längre poll-interval
- `supabase/functions/mobile-app-api/index.ts` — dual-identity DM-sökning
- Migration: lägg till `user_id` på `staff_members`

### Teknisk detalj
Problemet med identitet (nr 3) är det mest komplexa. Kortfattat: staff_members.id ≠ auth.users.id. När du skickar DM från webben som inloggad användare sparas ditt auth-UUID som sender_id. Appen letar efter ditt staff_members-UUID. Kopplingen (user_id-kolumnen) låter backend-koden förstå att det är samma person.

