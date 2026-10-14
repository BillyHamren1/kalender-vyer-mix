# Lager: personal och enkel arbetsplanering

## Mål
Arbetsledaren ska kunna se dagens arbete, planerad belastning, registrerad tillgänglighet och konflikter, öppna ett jobb och bemanna det utan att förlora planeringskontext. Personalen ska se sin dag och en fungerande nästa handling.

## Data och gränser
- Befintliga staff_members och staff_availability äger personal respektive registrerad tillgänglighet. Inga parallella personregister.
- warehouse_assignments äger konkret bemanning; dagsplacering i staff_assignments är inte automatiskt ansvar för alla jobb.
- WMS äger packning, retur och lagerstatus. Vi ändrar inte dessa skrivgränser.
- Saknad arbetstid, kompetens eller bemanningsbehov får inte presenteras som verifierad kapacitet.
- Ingen produktionsdata ändras vid utveckling/test. Ingen automatisk deploy via main under denna kodleverans.

## Genomförande och slutkriterier
1. **Tider och jobb.** Svenska tider konsekvent, DST täckt, ISO korrekt, överlappande jobb synliga, interna jobb öppningsbara. Testa sommar/vinter, datumgränser och överlappningar.
2. **Arbetsledare.** Samma jobbsidopanel från översikt, kalender och personal; datum bevaras; åtgärdskö tillgänglig på mindre skärmar. Klickflöden och responsiv layout granskas.
3. **Bemanning.** ID-baserade val, tydlig sparstatus/fel, planerad tid och konflikter, befintlig registrerad tillgänglighet. Inget antagande att en person räcker till ett jobb eller att inga uppgifter betyder ledig.
4. **Personal.** Min dag med datumval, Nu/Nästa/Klart, avslutade uppgifter hopfällda, fungerande detalj/utförandehandlingar. Scanneråtkomst förblir oberoende av personlig tilldelning. Personaladministration återanvänds.
5. **Verifiering och leverans.** Integrerad diffgranskning, relevanta tester, byggkontroll, dokumenterad PR. Skilj kodverifiering från liveverifiering och driftsättning.

## Arbetsspår
Bas: 88891cbd23e9301071fe542163f9993548e909d4.
- Integration/plan/gemensam jobbsidopanel: codex/warehouse-workforce-20261014.
- Tid och kalender: codex/warehouse-time-20261014.
- Personal och bemanning: codex/warehouse-personnel-20261014.
- Min dag och personalnavigering: codex/warehouse-mobile-20261014.
- Interna uppgifter och mobil-API: codex/warehouse-tasks-20261014.
Samtliga spår integrerade och granskade i integrationsgrenen. Ingen agent fortsätter efter leverans.

## Levererat i kod
- Gemensam jobbsidopanel från översikt, kalender och personal; välj rätt pack-/returmoment, ändra tid och bemanning utan att lämna planeringen.
- Stockholm-tid med riktig FullCalendar/Luxon-zonhantering, validering av DST, oförändrade tidsstämplar bevaras, SQL time skrivs som klockslag.
- Personalens standardlista fungerar på mobil; tidsöversikt skiljer överlappande jobb. Flerdagarsjobb delas per dag med faktisk tidsåtgång och unika kortnycklar.
- Planerade timmar och krockar visas. Bemanningsväljaren använder person-ID, befintlig registrerad tillgänglighet, felstatus och spärr för dubbla skrivningar. Okänd tillgänglighet är uttryckligen okänd.
- Min dag har datumval, Nu/Nästa/Klart, hopfällda avslutade jobb och självständig ingång till skannern. Ogiltiga/inaktiva åtgärder öppnar instruktioner istället för fel arbetsflöde.
- Interna uppgifter kopplas explicit till kalender och konkreta tilldelningar. Slutförande kontrollerar aktuell uppgiftstilldelning. Befintliga äldre uppgifter matchas aldrig med namn.

## Verifiering
- 89 riktade Vitest-tester passerar (17 filer): tid/DST, verklig FullCalendar-flytt, sparande/återställning, tidsintervall, ID-baserad bemanning, uppgiftstilldelning, detaljer och mobilflöden.
- 9 isolerade PostgreSQL/PGlite-tester passerar för migrationsförslaget: organisationsgräns, interna projekt, RLS, befintliga rättigheter, ogiltiga föräldraändringar, null-länkar och upprepad applicering.
- `npm run build` godkänd. Vite rapporterar befintliga stora chunks och blandad statisk/dynamisk import.
- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` godkänd.
- Riktad ESLint för de nya UI-komponenterna godkänd. Bred lint av berörda legacy-filer är inte grön (många befintliga any-/legacyfel); ingen full lint-grön claim.
- Tidsblockens slutliga höjd återgranskad vid 390/1440 px: 08–12 och 10–13 visas med korrekt längd och separata konfliktytor, dygnsaxel 00–24.
- Riktiga komponenter renderade med syntetiska lokala data på 390 och 1440 px: inga sidöverflöden eller skymda huvudkontroller; tidsöversikt scrollar inom sin panel. Detta är inte liveverifiering.

## Aktivering och återstående slutkriterier
1. Granska och aktivera det additiva SQL-förslaget `db/pending-migrations/warehouse_internal_task_link.proposal.sql` via ordinarie migrationsväg. Granska tabellstorlek/lås för stödindex och samordna relationernas FK-regler. Ingen migration har körts mot produktion. Nya interna uppgifter avvisas före skrivning om kopplingskolumnen saknas.
2. Driftsätt mobil-API och frontend samordnat efter databasen. UI ensamt är inte en komplett release.
3. Inloggad livekontroll: öppna befintligt jobb från varje vy, jämför svensk tid, bemanna/ta bort rätt person, kontrollera samma uppgift på personalens sida. Avgränsa eventuella skrivprov uttryckligen; inga testbokningar har skapats.
4. Kontrollera faktisk native Time-klient separat; denna leverans ändrar Operations-repots mobila lagerflöde, inte det separata eventflow-time-repot.

## Medvetna begränsningar
- Planerad jobbtid är inte ett komplett arbetspass eller bevis på ledig kapacitet. Befintlig tillgänglighet återanvänds; inga nya HR-/arbetspassregister skapas.
- Antal tilldelade personer är inte verifierat bemanningsbehov. Krav på antal/kompetens och full schemakapacitet behöver ett uttryckligt datakontrakt innan de kan beräknas sanningsenligt.
- Inventering får ingen påhittad färdigfunktion; den felaktiga länken till utgående packning ersätts med uppgiftsinformation.
- Gamla interna kalenderhändelser utan säker uppgiftskoppling repareras inte genom gissningar.

Kodleveransen är implementerad och lokalt verifierad. Migration, driftsättning och inloggad produktionsverifiering återstår.

## Publiceringsstopp
Automatisk säkerhetsgranskning avvisade push till BillyHamren1/kalender-vyer-mix: implementation/review ansågs auktoriserad men GitHub-publicering inte uttryckligen godkänd. Inga alternativa skrivvägar prövades. Lokal integrationsgren: codex/warehouse-workforce-20261014. Nästa steg efter användargodkännande: push denna gren och skapa draft PR, utan merge eller produktionsdeploy. Därefter hanteras aktiveringskriterierna ovan.

## Publiceringsgodkännande 2026-10-14
Användaren har uttryckligen godkänt publicering i det publika repot BillyHamren1/kalender-vyer-mix och skapande av draft-PR. Ändringarna har kontrollerats för nya hemligheter/personuppgifter. Publicering sker via ansluten GitHub-integration eftersom lokal git saknar autentisering. Ingen merge eller produktionsdeploy ingår.

## Releaseförberedelse 2026-10-14
Användaren har begärt slutförande inklusive driftsättning. Senaste main integrerad utan konflikter. Databasens tabeller och typer verifierade i pihrhltinhewhoxefjxv; cirka 3033 lagerhändelser, 1135 uppgifter och 332 projekt. RLS är aktiv. Live mobile-app-api v1196 och samtliga dess delade filer matchar main; inga oregistrerade liveändringar skrivs över.

SQL-förslaget har flyttats till CLI-genererad migration 20261014113037_warehouse_internal_task_link.sql med lock_timeout 3s och statement_timeout 30s. Nio SQL-tester passerar. Meddelandetesternas gamla mock ersatt med aktuellt HUB-resolverkontrakt; 30 meddelande-/HUB-tester passerar utan ändring av produktionsbehörigheter.

## Databas och API aktiverade
Lovables migrationsverktyg registrerade den identiska SQL-filen under version 20261014120134. Releasen använder nu endast denna faktiska migration; den tidigare CLI-genererade dubbletten är borttagen. Direkt databasverifiering bekräftar tre kolumner, tre validerade constraints, aktiv trigger, SECURITY INVOKER och bevarad RLS. Alla 3170 äldre händelser saknar fortsatt uppgiftskoppling. mobile-app-api v1197 är ACTIVE; oautentiserat anrop returnerar 401.

## Visuell uppföljning och inloggad kontroll 2026-10-14
PR #59 är mergad och frontend, databas och API driftsatta. Inloggning lyckades och befintligt jobb öppnades med tid och bemanningsväljare. Livekontrollen visade två problem: grå kalenderarbetsyta med alltför breda personkolumner samt öppna event/legacy-poster i personallistan som jobbkalendern filtrerar bort.

Användaren begär systemets befintliga utseende med högre visuell kvalitet. Uppföljningen behåller HUB/WMS-palett, typsnitt och komponenter; använder kortytan i kalendern, befintliga aktivitetsfärger, tydligare val och responsiva kontroller. Personkolumner får fast bredd, överlappningar hanteras inom sin kolumn och tidsvyn öppnar nära första jobbet utan att nattarbete döljs.

Gemensam policy för sex lageraktiviteter används i kalenderfilter och obemannade jobb. Verkliga tilldelningar bevaras även för äldre typer; ingen namnmatchning, radering eller produktionsdatamutation. Före release: integrerad typkontroll/build, riktade tester och visuell kontroll på mobil/desktop. Efter release: inloggad kontroll av lista/tidsvy/kalender och jobbdetalj.
