

## Solid kommunikation + Enhetlig användaridentitet

### Problemet

Systemet har **tre olika identiteter** för samma person:

1. **`auth.users.id`** — Supabase Auth UUID, används av webbappen (OpsDirectChat) som `sender_id`
2. **`staff_members.id`** — personal-UUID, används av mobilappen som `sender_id`
3. **`staff_accounts.id`** — inloggningskonto för mobilappen

När en planerare skickar ett DM från webben lagras `auth.user.id` som sender. Mobilappen söker på `staff_members.id`. Resultatet: meddelanden försvinner eller syns bara i ena riktningen.

`handleGetInboxAll` hanterar redan dual-identity, men `handleGetDirectMessages`, `handleMarkDMRead`, och **hela webb-sidan** gör det inte.

### Lösning: Normalisera identitet

**Princip**: Alla meddelanden ska konsekvent använda `staff_members.id` som identitet. Webbappen ska slå upp den inloggade användarens `staff_members.id` via e-post och använda det vid send/read/fetch.

---

### Steg 1: Webb — Använd staff_members.id konsekvent

**`OpsDirectChat.tsx`**:
- Byt `myId` från `user?.id` till att använda `useCurrentStaffId()` (som redan finns och slår upp staff_members via e-post)
- Fallback till `user?.id` om staff-koppling saknas (för rena admin-användare utan staff-post)
- Uppdatera `myName` att hämtas från staff_members-posten

**`directMessageService.ts`**:
- `fetchDirectMessages` och `fetchDMInboxGrouped`: Utöka filtret att söka på BÅDA id:n (staff_id + user_id) om en mappning finns, liknande hur `handleGetInboxAll` redan gör
- `markDirectMessagesRead`: Samma dual-id-hantering

**Ny hook `useMyIdentity.ts`**:
- Returnerar `{ staffId, userId, displayName, allIds }` — en central punkt för identitetsupplösning
- Används av OpsDirectChat, DM-inbox, och alla kommunikationskomponenter

### Steg 2: Mobil API — Dual-identity överallt

**`handleGetDirectMessages`** (rad 1779):
- Hämta `user_id` från `staff_members` (redan tillgängligt via `staffOrg`)
- Skicka med `user_id` till funktionen och filtrera DMs på båda IDs, precis som `handleGetInboxAll` redan gör

**`handleMarkDMRead`** (rad 1944):
- Utöka `recipient_id`-filtret att matcha både `staffId` och `userId`

**`handleSendDirectMessage`** (rad 1830):
- Push-notiser: Sök device_tokens på ALLA kopplade identiteter (staff_id + user_id) för mottagaren

### Steg 3: Säkerställ user_id-koppling vid kontoskapande

**Auto-account-creation** (redan existerande logik):
- Verifiera att när staff_accounts skapas, `staff_members.user_id` också sätts om personen har ett Supabase Auth-konto
- Lägg till en hjälpfunktion i edge-funktionen som matchar `staff_members.email` mot `auth.users.email` och skriver `user_id` automatiskt

### Steg 4: Realtime-synk för webb

**`useRealtimeInvalidation`**:
- Säkerställ att DM-kanalen prenumererar på rätt filter som inkluderar BÅDA identiteter

---

### Teknisk sammanfattning

```text
Före:
  Webb → sender_id = auth.user.id (UUID A)
  Mobil → sender_id = staff_members.id (UUID B)
  → Meddelanden syns inte korrekt på båda sidor

Efter:
  Webb → sender_id = staff_members.id (om koppling finns)
  Mobil → sender_id = staff_members.id
  Alla queries → söker på BÅDA ids som fallback
  → Samma konversation synlig överallt
```

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/hooks/useMyIdentity.ts` | Ny hook — central identitetsupplösning |
| `src/components/ops-control/OpsDirectChat.tsx` | Använd `useMyIdentity` istället för `user?.id` |
| `src/services/directMessageService.ts` | Dual-id-filter i fetch/mark-read |
| `supabase/functions/mobile-app-api/index.ts` | `handleGetDirectMessages` + `handleMarkDMRead` — dual identity |
| `src/hooks/useDirectMessages.ts` | Acceptera `allIds` för bredare matchning |

