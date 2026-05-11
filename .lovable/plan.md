## Rotorsak
Den här resan blir inte korrekt därför att motorn aldrig ser någon faktisk `transport`-sekvens i rå GPS-data.

I just det här fallet visar kedjan:
```text
FA Warehouse (known_site)
→ GPS-gap 07:28–09:01
→ Bergman Event AB (known_site)
```

Det innebär att:
- `buildGpsDayTimeline` skapar `gps_gap` direkt när inga pings finns i mellanrummet.
- `buildPresenceDayBlocks` får bara göra om ett sådant gap till transport om `classifyTransportSignalGap` godkänner det.
- Den klassificeraren kräver i praktiken extra transportbevis: transportsegment på ena/båda sidorna, companion-route eller annan rörelseform.
- När det bara finns två kända arbetsplatser med ett rent GPS-gap mellan dem blir `countsAsTransport = false`.
- Eftersom platserna är olika blir blocket då `uncertain_transition`, som senare blir `needs_review` i `buildReportCandidateBlocks`.
- UI-lagret översätter det till “Trolig resa”.

Så: felet sitter inte främst i visningstexten, utan i att presence-/report-motorn fortfarande behandlar just den här typen av känd A→B-förflyttning som osäker när mellanpings saknas.

## Plan
1. Justera signal-gap-klassificeringen så att ett GPS-gap mellan två olika kända arbetsrelaterade mål kan räknas som transport även utan mellanliggande transportpings, om bevisen är tillräckliga.
2. Använd deterministiska grindar för att undvika falska positiva: båda ändpunkterna måste vara kända arbetsmål, gapet måste vara inom tillåten längd, hastighet/distans måste vara rimlig, och inga konfliktsignaler får finnas.
3. Låt resultatet gå ut som riktig `transport` redan i `buildPresenceDayBlocks`, så att resten av kedjan automatiskt visar korrekt resa i stället för `needs_review`.
4. Lägg till regressionstester för just scenariot “known_site A → gps_gap → known_site B” så att framtida ändringar inte skickar tillbaka resan till “Trolig resa”.

## Tekniska detaljer
- Ändra främst i:
  - `supabase/functions/_shared/time-engine/classifyTransportSignalGap.ts`
  - eventuellt mindre följdjustering i `supabase/functions/_shared/time-engine/buildPresenceDayBlocks.ts`
- Ny regel ska bara gälla när följande är sant:
  - båda ankare finns
  - nästa mål är arbetsrelaterat
  - gapet är högst 30 min
  - implied speed är rimlig
  - inga hårda konflikter finns
- Viktigt: detta ska ändra motorlogiken, inte bara UI-texten.
- Regression bör täcka att blocket blir `transport` i presence-lagret och inte `needs_review` i report-candidate-lagret.