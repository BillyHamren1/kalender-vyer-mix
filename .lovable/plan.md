# Verifiering av Mobile Time v2 snabbflöde

Föregående tur implementerade snabbflödet (Skicka/Granska/Fyll i direkt från listan, auto-next i review-kö, optimistiska uppdateringar). Nu ska vi verifiera att allt fungerar.

## Steg

1. **Kör enhetstesterna**
   - `bash scripts/test-time-reporting.sh` (officiella tidsrapporterings-gaten enligt time-reporting-quality-gate-v1)
   - `bunx vitest run src/features/mobile-time-v2/suggestionPayload.test.ts` för det nya logiklagret
   - Om något test fallerar: läs felet, åtgärda i `suggestionPayload.ts` eller anropande komponent, kör om

2. **Statisk genomgång av call-sites**
   - Bekräfta att `MobileTimeReportQueue` korrekt hanterar:
     - tom kö efter sista submit (visar "Allt klart")
     - skip → nästa dag utan att markera som submitted
     - fel vid submit → dagen stannar i "Att göra", felmeddelande visas
   - Bekräfta att `MobileTimeReportDayCard` knappar är disabled under pågående submit (ingen dubbel-submit)

3. **Backend-validering intakt**
   - Verifiera att direct-submit fortfarande går genom `submit-mobile-gps-day-v2` (samma payload som "Granska"-flödet), så att alla server-side guards (approved-lock, overlap, night-guard) gäller även för snabbsubmit
   - Inga shortcuts förbi `staff_day_submissions`

4. **Rapportera resultat**
   - Lista vilka tester som kördes och status
   - Bekräfta de 8 kontrollpunkterna från originaluppdraget (dagkort-knappar, direct submit, Granska alla, auto-next, ingen back-navigering, listuppdatering utan refresh, Redigera kvar, backend-validering)
   - Flagga eventuella avvikelser

## Inga kodändringar planerade
Detta är ren verifiering. Om tester avslöjar buggar lägger jag in fixar i samma tur och kör om gaten innan jag rapporterar klart.
