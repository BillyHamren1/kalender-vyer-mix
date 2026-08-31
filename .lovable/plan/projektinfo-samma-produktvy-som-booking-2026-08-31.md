# Projektinfo: samma produktvy som Booking

## Problem
Projektinfo-fliken (projektvyn) visar hela plocklistan — inklusive alla uppackade paketkomponenter (raderna med "PKT"-tagg: Ben, Mellanstag, Rör, Nock bult osv.). I Booking visas istället en kompakt lista: huvudprodukter (F20 – 20x15/300, UNIFLEX 15x10/340, F8 – 8x5/300, Förankringsvikter, Arbetskostnader, Kranbil) med sina tillbehör indragna under sig (↳ Takduk, Gaveltriangel, Vägg). Paketkomponenterna syns inte alls.

## Orsak (bekräftad i koden)
- Projektinfo-fliken → `BookingInfoExpanded` → `ProjectProductsList` (`src/components/project/ProjectProductsList.tsx`).
- `ProjectProductsList.isChildRow()` behandlar paketmedlemmar (`is_package_component`, `parent_package_id`, `--`-prefix) som barnrader och renderar ALLA barn med `renderChildRow` — därav PKT-raderna.
- Bookings vy (`src/components/booking/ProductsList.tsx`) är den vy användaren vill efterlikna: huvudprodukt + tillbehör, inga paketkomponenter.

## Åtgärd
1. **`src/components/project/ProjectProductsList.tsx`**
   - Filtrera bort paketkomponenter (`isPackageMember`: `is_package_component`, `parent_package_id` eller `--`-prefix) ur barnlistan — de ska varken renderas under föräldern eller som "föräldralösa".
   - Kvar visas: huvudprodukter (fetmarkerade) + deras tillbehör (↳/└/L,-rader), exakt som i Booking.
   - Tillbehörsraderna får "↳"-prefix i stället för prick, för att matcha Bookings visuella utseende.
   - Sammanfattningsraden (antal produkter, vikt, volym) räknar fortfarande på det som faktiskt visas.
   - Ingen ändring av databas, import eller packningslogik — detta är enbart presentationsfilter i projektvyn. Plocklistan i lagret/scannern påverkas INTE.

2. **Test**: uppdatera/lägg till kontraktstest i `src/components/project/__tests__/` som låser att paketmedlemmar inte renderas men tillbehör gör det (bygger på befintliga `isVisibleAccessory`-tester).

## Tekniska detaljer
- Berörda filer: `src/components/project/ProjectProductsList.tsx`, `src/components/project/__tests__/projectProductsList.*.test.*`.
- Enda konsumenten av komponenten är `BookingInfoExpanded` (Projektinfo-fliken) — förändringen är isolerad dit.
- Ingen migration, ingen datamutation.

## Verifiering
- `lovable-exec test` (vitest) för produktlistetesterna.
- Typecheck/build grönt.
- Visuell kontroll i preview på Projektinfo-fliken om möjligt (annars via test + kodgranskning — extern Supabase blockerar autentiserad preview).
