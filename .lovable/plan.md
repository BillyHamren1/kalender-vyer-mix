## Vad som händer

Två saker att fixa i mobilappen:

### 1. "Overview"-fliken i bottennavigationen
Planners (du) får en extra flik `/m/overview` ("Översikt") längst till höger i `MobileBottomNav`. Du vill ta bort den.

### 2. Felaktigt "Stale timer found" på en helt färsk timer
Du startade en location-timer på FA Warehouse 13:30. Klockan 13:38 (8 min senare) säger appen att timern är "older than 24 hours". Det är fel.

**Rotorsak** (i `src/hooks/useTimerReconciliation.ts`):
- För **location-timers** kollar reconciliation OM det finns en matchande **öppen** `location_time_entry` på servern.
- Om servern inte returnerar en matchande öppen post → timern flaggas direkt som `isStale: 'no_server_match'`, oavsett ålder.
- `StaleTimerDialog` visar däremot alltid copy:n "older than 24 hours…" — vilket är direkt missvisande för `no_server_match`-fallet.
- Race-möjligheter som triggar detta för en färsk timer:
  - Server-entryt har inte hunnit skapas/synkas (pending sync queue) när reconcile körs (initial reconcile sker 4s efter mount, plus vid varje window focus).
  - Edge-functionens `getLocationTimeEntries` returnerar inte den nystartade posten (filter, paginering, eller staff_id/org-mismatch).
  - Posten stängdes på servern av watchdog/EOD utan att lokal timer rensades.

Oavsett orsak ska reconciliation **inte** flagga en location-timer som stale bara för att server-listan saknar den om timern är yngre än `STALE_AGE_MS` (24h). Annars är dialogens 24h-text en lögn.

## Ändringar

### A. `src/components/mobile-app/MobileBottomNav.tsx`
- Ta bort `plannerTab` (`/m/overview`) och planner-villkoret. Alla får samma 4 flikar: Jobs, Time, Messages, Tools.
- Ta bort oanvänd `LayoutGrid`-import och `useMobileRoles`.

(Routen `/m/overview` lämnas kvar i routern för deep-links, men är inte längre i navigationen. Vill du att jag tar bort routen helt också, säg till.)

### B. `src/hooks/useTimerReconciliation.ts` — gör stale-flagging ärlig
- För **location-timers**: flagga endast som stale när **både** `!openByLocation.has(key)` **och** `isOld` (>24h). Yngre timers utan server-match lämnas i fred — nästa reconcile-cykel försöker igen.
- Bibehåll `staleReason: 'no_server_match'` när det är relevant, annars `'age'`.
- Detta löser det aktuella fallet: 8-min-gammal FA Warehouse-timer flaggas inte längre.

### C. `src/components/mobile-app/StaleTimerDialog.tsx` — ärlig copy
- Gör body-texten beroende av `staleReason`:
  - `age` → nuvarande "äldre än 24 timmar…"-text
  - `no_server_match` → "Den här timern hittas inte på servern längre. Spara som tidrapport eller släng den."
- Lägg till motsvarande i18n-nycklar (`staleTimer.bodyAge`, `staleTimer.bodyNoMatch`) i `src/i18n/translations.ts`. Behåll `staleTimer.body` som fallback.

### D. Ingen serverändring krävs
Reconciliation-edge-pathen (`mobile-app-api` → `getLocationTimeEntries`) rörs inte. Vi gör bara klient-logiken mindre aggressiv så att UX matchar verkligheten.

## Verifiering

1. Starta en location-timer → ingen stale-dialog inom 24h även om reconcile råkar köra innan server-svaret hunnit fram.
2. En genuint gammal övergiven timer (>24h) får fortfarande dialogen, men med korrekt text.
3. Bottennavigationen visar exakt 4 flikar för planner-roller (samma som icke-planner).
