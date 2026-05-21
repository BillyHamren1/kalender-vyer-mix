## Problem

Mobil time-app visar felmeddelande och blockerar attest/inskick när brutto > 16h. Det bryter mot Mobile Time App Mirror-Only — appen ska bara spegla det `staff_day_report_cache` / kartan visar, aldrig räkna eller validera själv.

Två ställen har samma `grossMin > 16 * 60`-spärr plus andra lokala räkningsregler ("Arbetstid efter rast måste vara större än 0", "Brutto överstiger 16 timmar"):

- `src/components/mobile-app/time/StaffDayAttestSection.tsx` (rad 220–229)
- `src/components/mobile-app/time/StaffDaySubmitSection.tsx` (rad 191–196)

## Ändring

I båda `validate()`:

- Ta bort `grossMin > 16 * 60`-checken helt.
- Ta bort `grossMin - breakMinutes <= 0`-checken (även den är lokal räkning).
- Ta bort `breakMinutes > 600`-övre gränsen (behåll bara `>= 0` + finite, så vi inte skickar skräp).
- Behåll endast strikt syntax-validering som behövs för att kunna POSTA: starttid finns, sluttid finns, parsebart, start < slut, sluttid inte i framtiden för idag.

Servern (`submit-staff-day-report` / `attest-staff-day`) får fortsätta vara sanningen. Appen speglar, validerar inte längden.

## Felkod

För att hitta exakt felkod-strängen behöver jag se skärmen — kan du dela en skärmdump eller skriva exakt vad det står? Om det är just "Brutto överstiger 16 timmar — kontrollera tiderna." försvinner den med ändringen ovan. Om det är en annan toast (server-fel från `submitDayReport` / `attestDay`) behöver jag se texten för att veta om den också ska bort eller bara bytas mot ett rent re-fetch.

## Verifiering

- `bunx vitest run src/components/mobile-app/time` — befintliga dayStatus/segmenttester ska fortsätta vara gröna.
- Manuell: öppna `/m/report` på dag med >16h GPS-spann, verifiera att Skicka in / Bekräfta inte längre blockeras.

## Filer

- edit `src/components/mobile-app/time/StaffDayAttestSection.tsx`
- edit `src/components/mobile-app/time/StaffDaySubmitSection.tsx`

Inga DB-ändringar, inga edge functions, inga nya filer.
