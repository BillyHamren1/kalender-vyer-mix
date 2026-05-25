# Plan

## Mål
Se till att projekt/bokningar som inte är aktiva för dagen, särskilt `OFFER`/avbokade som TAVET, aldrig dyker upp i GPS-dags- eller veckosummeringen.

## Vad jag kommer att ändra
1. Skärpa serverns urval i `loadDayKnownSites` så att bokningar med icke-aktiva statusar inte får bidra med geofence/pin eller härleda projekt för GPS-snapshoten.
2. Säkerställa att bokningsstatus tolkas konsekvent med befintlig statusnormalisering (`OFFER`, `CANCELLED`, avbokad-varianter), inte bara projektets egen status.
3. Lägga till/uppdatera kontraktstest som låser att en bokning med status `OFFER` eller avbokad inte kan bli en känd plats eller synas i summeringen.
4. Validera i preview/test att TAVET inte längre visas i dagens sammanställning men att riktiga aktiva projekt fortfarande syns.

## Varför detta behövs
Just nu filtreras projektstatus i serverkoden, men bokningsspåret som bygger upp dagens kända platser släpper igenom bokningar som fortfarande finns länkade men inte är bekräftade. Det gör att en offert/avbokad bokning kan smyga in i GPS-snapshoten trots att den inte ska vara arbetsplats för dagen.

## Teknisk detalj
- Berörda filer:
  - `supabase/functions/_shared/staff-gps/dayKnownSites.ts`
  - relevant testfil för kontraktet kring known sites / GPS-summering
- Jag håller mig till befintlig policy: datumkänsliga kända platser, inga org-breda projektsvep, och tydlig spärr mot icke-aktiva bokningar.
- Ingen DB-migration behövs.

## Validering
- Köra riktade tester för known-sites/GPS-kontrakt.
- Kontrollera preview-/snapshotflödet så att TAVET försvinner ur summeringen utan att dagspings-funktionen påverkas.