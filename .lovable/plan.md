## Problem

Skärmdumpen visar "närmsta: 2603-84 · Magnusson Petfood AB" för en GPS-vistelse. `2603-84` är en **sub-booking under ett stort projekt**, inte ett fristående jobb. Det är fel beteende — vi ska aldrig föreslå (eller "extrahera") en underliggande bokning ur ett stort projekt; det stora projektet är planeringsenheten.

## Orsak

Efter ±21d-fönsterutökningen i `src/pages/StaffTimeReports.tsx` pushas **alla** bokningar i fönstret som egna `KnownSite` (`booking:<id>`), inklusive de som har `large_project_id != null`. När `findNearestSite` sedan letar närmsta kandidat kan en sub-booking vinna över sitt eget stora projekt (t.ex. för att den har en något annan `delivery_latitude`, eller för att stora projektets `address_*` inte är satta). UI skriver då ut bokningens `booking_number · client` istället för det stora projektets namn.

Detta är samma princip som vår memory `large-project-team-source-of-truth-v1` / `large/management`: stora projekt planeras på projektnivå — sub-bookings ska inte exponeras som självständiga "närmsta projekt"-förslag.

## Lösning

Ett enda, minimalt fix i `src/pages/StaffTimeReports.tsx` (KnownSites-bygget runt rad 605–700):

1. Hämta `large_project_id` på bokningarna i båda queries (`bookingsWindowRes` och `bookingCoordsRes`).
2. När en booking-rad har `large_project_id != null`:
   - Pusha **inte** den som en egen `KnownSite` (`booking:<id>`) i kandidatpoolen.
   - Undantag: om bokningens id finns i `bookingIds` (dvs. en time_report/LTE faktiskt pekar på sub-bookingen) får den vara kvar — då är det redan en bekräftad rapportkälla, inte ett "närmsta"-gissningsförslag.
3. Säkerställ att det stora projektet det tillhör finns i poolen även om `large_projects.address_latitude` saknas: fall tillbaka på första underliggande bokningens `delivery_latitude/longitude` för `large:<lp_id>` så att GPS-förslaget pekar på projektet (med projektets namn) istället för en sub-booking.

Resultat: GPS-vistelser nära ett stort projekts adress får antingen "närmsta: <Stora projektets namn>" eller — om vi saknar koordinater för båda — ingen kandidat alls. Aldrig "närmsta: <booking_number> · <client>" för en sub-booking.

## Filer som ändras

- `src/pages/StaffTimeReports.tsx` — lägg till `large_project_id` i select, filtrera vid `pushSite`, fall tillbaka på sub-booking-koordinater för `large:<id>` när address_latitude saknas.
- `src/lib/staff/__tests__/nearestKnownSite.regression.test.ts` — ny test: sub-booking med `large_project_id` får inte föreslås som närmsta; stora projektet vinner.

Inga ändringar i `actualStaffDayModel.ts` / `dayBlockTimeline.ts` behövs — de jobbar bara mot KnownSites-poolen vi matar in.
