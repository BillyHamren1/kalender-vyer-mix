

## Visa de 10 närmast kommande uppgifterna

Panelen "Pågår & kommande" ska lista de 10 närmast kommande uppgifterna (sorterade på startdatum), oavsett om de är idag, imorgon eller längre fram. Gruppera visuellt med datumrubriker.

### Ändringar

**1. `useTaskAnalytics.ts`** — Lägg till `upcomingNext10`: de 10 närmaste ej klara uppgifterna med startdatum idag eller framåt, sorterade på `start_date`.

**2. `ProjectControlPanel.tsx`** — Skriv om `TodayFocus` att använda `upcomingNext10` istället för separata today/tomorrow-listor:
- Gruppera per datum med rubriker ("Idag", "Imorgon", "ons 2 apr", etc.)
- Visa max 10 rader totalt
- Panelen visas om det finns minst 1 kommande uppgift

**3. `hasToday`-logiken** i huvudkomponenten uppdateras att kolla `upcomingNext10.length > 0`.

