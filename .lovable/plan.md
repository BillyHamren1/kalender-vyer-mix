

## Flytande meddelandeknapp — alla sidor

### Vad
En flytande knapp (FAB) med meddelandeikon + oläst-badge som alltid syns i nedre högra hörnet, oavsett vilken sida man är på i huvudsystemet. Klick öppnar en popup/panel med konversationslistan (DM-inbox) och möjlighet att chatta direkt.

### Hur

**1. Skapa `FloatingInbox`-komponent** (`src/components/FloatingInbox.tsx`)
- Flytande knapp (`fixed bottom-6 right-6 z-50`) med `MessageCircle`-ikon
- Visar oläst-badge (röd cirkel med siffra) via `useQuery` mot `fetchDMInboxGrouped`
- Klick togglar en popup-panel (ca 400x500px) med:
  - Konversationslista (återanvänd logik från `OpsActivityComms` conversations-tab)
  - Klick på konversation öppnar inline-chatt (återanvänd `OpsDirectChat`-logiken)
  - "Nytt meddelande"-knapp för att starta ny konversation
- Klick utanför stänger panelen

**2. Lägg till i `MainSystemLayout`**
- Importera och rendera `<FloatingInbox />` bredvid `{children}` i layouten
- Synlig på alla sidor som använder detta layout

### Tekniska detaljer
- Positionering: `fixed` med hög `z-index` så den ligger ovanpå allt innehåll
- Realtidsuppdatering: prenumerera på `direct_messages`-tabellen via Supabase realtime för badge-uppdatering
- Panelen renderas som en `absolute`/`fixed` container ovanför knappen
- Responsivt: på mobil göms den (mobilen har egen bottom-nav med inbox)

