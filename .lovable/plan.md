## Orsak
Den här raden fastnar som **"Trolig resa"** för att display-regeln för att auto-promota en osäker kedja till riktig transport är för strikt.

I dag krävs bland annat att varje enskilt icke-transportblock i kedjan är **högst 15 min**. Markus-raden visar **"GPS saknades 18 min"**, så den missar den spärren och faller därför ned till **bridged trip = "Trolig resa" + needs_review**, trots att den är tydlig mellan två kända platser.

## Plan
1. **Justera promotionsregeln för säkra broresor**
   - Uppdatera `src/lib/staff/buildReportDisplayBlocks.ts` så att en kedja mellan två olika kända platser kan gå igenom som riktig transport även när ett enskilt GPS-glapp är längre än 15 min, så länge övriga säkerhetskrav fortfarande är uppfyllda.

2. **Behåll hårda spärrar för verkligt osäkra fall**
   - Låt blocket fortsätta vara `needs_review` om det finns eget stopp-bevis, inbäddat arbetsblock, okänd plats med egna koordinater eller andra tecken på att det faktiskt kan ha skett ett stopp.

3. **Lås beteendet med regressionstest/scenario**
   - Lägg till täckning för ett fall motsvarande **FA Warehouse → Bergman Event AB med 18 min GPS-glapp och inga stoppkoordinater**, så att just detta inte regressar igen.

## Tekniska detaljer
- **Rotorsak i UI-lagret:** `src/lib/staff/buildReportDisplayBlocks.ts`
  - `promoteToTransport` blockeras i dag av villkoret `longestNonTransportMin <= 15`
  - när det faller igenom används `promoteAsBridgedTrip` och renderas som **"Trolig resa"**
- **Renderingen i sig är inte felet:** `src/components/staff/ReportCandidateTimeline.tsx`
- **Backendmotorn sätter osäkerheten från början:** `supabase/functions/_shared/time-engine/buildReportCandidateBlocks.ts` lägger `missing_transition_evidence`; ingen backfill behövs eftersom detta räknas fram vid hämtning.

## Förväntat resultat
Rader som är **uppenbart resa mellan två kända platser utan stopp-evidens** ska visas som riktig transport i stället för **"Trolig resa"**, medan genuint osäkra fall fortfarande stoppas för granskning.