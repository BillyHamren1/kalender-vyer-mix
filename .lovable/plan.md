
## Preferens: Håll filer små och uppdelade

Jag noterar detta som en regel för framtida arbete i projektet:

**Regel:** Skriv inte stora monolitiska filer. Dela upp i mindre, fokuserade moduler.

**Hur jag tillämpar det framöver:**
- Komponenter > ~200 rader → dela i sub-komponenter (egen mapp med `index.tsx` + delar)
- Hooks > ~150 rader → dela i flera hooks eller extrahera helpers
- Edge Functions → en fil per ansvar (handler, validation, db-access separat)
- Tester → en testfil per scenario-grupp, inte en jättefil
- Inga "god-objects" eller filer som gör allt

**Spara som memory:**
Jag lägger till detta i `mem://preferences/file-size-and-modularity.md` och refererar i `mem://index.md` så att alla framtida sessioner respekterar regeln automatiskt — annars glömmer jag bort det vid nästa loop.

**Konkret nästa gång (Workday-implementationen):**
När vi kör backend + hook + flödesintegration delar jag upp så här istället för stora filer:
- `supabase/functions/workday-start/index.ts`
- `supabase/functions/workday-end/index.ts`  
- `supabase/functions/workday-current/index.ts`
- `src/hooks/workday/useWorkDay.ts` (tunn)
- `src/hooks/workday/useWorkDayRealtime.ts`
- `src/hooks/workday/workdayApi.ts`
- `src/hooks/workday/types.ts`

Säg till när jag ska köra — så börjar jag med att spara memoryn och sedan fortsätter med Workday-flödet i små filer.
