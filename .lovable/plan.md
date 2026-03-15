

# Uppgradera kommunikation i Ops Control Center

## Nuläge
Bottom-right panelen i `/ops-control` har två tabs: **Operationslogg** och **Chatt**. Chatten är en enkel broadcast-liknande kanal (`staff_messages`) utan möjlighet att:
- Starta ny DM-konversation med specifik personal
- Se en konversationslista / inbox
- Växla mellan DM-konversationer direkt från överblicken

DM-funktionalitet finns redan i sidopanelen (`OpsDirectChat`) men kräver att man klickar på en person i tidslinjen/kartan.

## Plan

Ersätt nuvarande "Chatt"-tab i `OpsActivityComms` med en **mini-inbox** som visar konversationer och låter planeraren starta nya.

### Ny tab-struktur (3 tabs)

```text
OPERATIONSLOGG | KONVERSATIONER | BROADCAST-LOGG
```

### Tab: Konversationer (nytt)

**Överst**: Knapp "+ Nytt meddelande" → öppnar dropdown med sökbar personallista (från `timeline`-datan som redan finns). Klick på person → öppnar `OpsDirectChat` i sidopanelen (redan implementerat via `handleOpenDM`).

**Lista**: Senaste DM-konversationer grupperade per mottagare, visar:
- Namn + oläst-badge
- Senaste meddelandet (trunkerat)  
- Tidsstämpel
- Klick → öppnar sidopanel-DM

**Datakälla**: Ny funktion `fetchDMInboxGrouped(plannerId)` som hämtar senaste DM per unik motpart och grupperar dem.

### Tab: Broadcast-logg (ersätter nuvarande "Chatt")

Visar skickade broadcasts + staff_messages (nuvarande chatt-tab logiken behålls här).

### Filer som ändras

1. **`src/components/ops-control/OpsActivityComms.tsx`** — Utöka från 2 till 3 tabs, lägg till konversationslista-UI med "Nytt meddelande"-knapp och DM-lista
2. **`src/services/directMessageService.ts`** — Lägg till `fetchDMInboxGrouped()` som returnerar unika konversationer med senaste meddelande, oläst-count
3. **`src/pages/OpsControlCenter.tsx`** — Skicka `onOpenDM` och `timeline` som props till `OpsActivityComms` så att konversationslistan kan öppna DM-sidopanelen

### Konversationslista-logik

```typescript
// Ny funktion i directMessageService.ts
export const fetchDMInboxGrouped = async (myId: string) => {
  // Hämta alla DMs för planeraren, gruppera per motpart
  // Returnera: { recipientId, recipientName, lastMessage, lastTimestamp, unreadCount }[]
};
```

### UI-flöde

```text
┌─────────────────────────────────────────┐
│ OPERATIONSLOGG  KONVERSATIONER  BC-LOGG │
├─────────────────────────────────────────┤
│ [+ Nytt meddelande]                     │
│                                         │
│ ● Anna Svensson              20:54      │
│   "Bra, tack!"                          │
│                                         │
│   Erik Persson                20:30     │
│   "Ok, jag är på väg"                   │
│                                         │
│   Joel Habegger              19:15      │
│   "Bekräftar ankomst"                   │
└─────────────────────────────────────────┘
  Klick → öppnar OpsDirectChat i sidopanelen
```

### "Nytt meddelande"-dropdown

Klick på knappen visar en sökbar lista över all personal från `timeline`. Välj person → triggar `onOpenDM(staffId, staffName)` → sidopanelen öppnas med DM-chatten.

### Vad som INTE ändras
- `OpsDirectChat` (sidopanelen) — redan komplett med quick messages, bilagor, jobb-tagg
- `OpsBroadcastDialog` — redan komplett
- Routing, appMode-system
- Operationsloggen

