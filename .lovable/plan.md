# Plan

Jag fixar laddlåset i den gemensamma kalenderkedjan så att både `/calendar` och `/personalkalendern` börjar rendera igen.

## Vad jag kommer göra

1. Isolera `fetchCalendarEvents()` så den inte kan hänga hela sidan
   - bryta ut de tunga del-frågorna
   - lägga in skydd mot långsamma/felande sekundärfrågor
   - säkerställa att kalendern kan visa basdata även om enrichment/fallback-data fallerar

2. Göra loading-state robust i `useRealTimeCalendarEvents`
   - se till att `isMounted`/`isLoading` alltid släpper
   - undvika att UI fastnar i permanent spinner om en del av laddningen timeoutar eller kastar sent

3. Verifiera båda vyerna som delar samma hook
   - `/calendar`
   - `/personalkalendern`

4. Lägga testskydd för regression
   - test för att kalendern inte fastnar i loading när sekundär datahämtning fallerar
   - test för att bas-events fortfarande returneras när enrichment misslyckas

## Teknisk bedömning

Det som pekar ut felet just nu är att loggen når:
- `📅 [fetchCalendarEvents] Starting fetch...`
- `🔑 [fetchCalendarEvents] Session OK...`

men aldrig når loggarna som kommer efter själva dataladdningen (`Fetched` / `Returning`). Det betyder att stoppet sannolikt ligger i den gemensamma eventkedjan efter auth men före return, inte i iOS-specifik kod.

Berörda delar:
- `src/services/eventService.ts`
- `src/hooks/useRealTimeCalendarEvents.tsx`
- ev. kompletterande testfil för kalender-fetch/hook

## Resultat efter fix

- Personalkalendern ska inte längre stå och ladda oändligt
- Interna kalendern ska inte heller fastna
- Om någon sekundär query strular ska användaren få kalender istället för total blockering