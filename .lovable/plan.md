# Mål
När en person lämnar ett projekt och sedan kommer tillbaka till samma projekt ska tiden utanför inte försvinna. Den ska visas som ett eget block under samma projektpanel.

Exempel:
- B1: 08:51 → 12:30
- B2: 12:30 → 12:46 (Utanför geo)
- B3: 12:46 → 20:18

Det som ensam får flytta bort fortsättningen från projektet är att personen korsar in i ett annat projekts geofence. Då avslutas nuvarande projekt, och nästa block visas under det andra projektet.

# Plan

## 1. Ändra blocklogiken i `buildExactGeofenceVisits`
Gör om state-maskinen så att den arbetar med tre lägen inom ett aktivt projektblock:
- inne i aktivt projekts geofence
- utanför alla geofences men fortfarande knuten till samma aktiva projekt
- inne i ett annat projekts geofence

Regler:
- Första inträdet i ett geofence öppnar ett projektblock.
- Om personen går ut ur geofence men ännu inte gått in i ett annat projekt, skapa ett separat delblock `Utanför geo` under samma aktiva projekt.
- Om personen går tillbaka in i samma projekt, starta nästa delblock under samma projekt.
- Om personen i stället går in i ett annat projekts geofence, stäng det gamla projektet och starta ett nytt projektblock där.
- Tid får aldrig "försvinna" mellan två block så länge den tillhör samma aktiva projektkedja.

## 2. Utöka datamodellen för visning
Behåll dagens `PlaceVisit` som projektblock, men lägg till delblock för visning under samma projekt, t.ex.:
- `inside`
- `outside_geo`

Varje projektbesök ska alltså kunna innehålla flera renderbara rader i ordning, i stället för att allt pressas till en enda start/slut-rad.

## 3. Uppdatera popup-panelen i `RawGpsSatelliteMap.tsx`
Ändra panelen så att varje projekt visar sina delblock rad för rad:
- `B1 08:51 → 12:30`
- `B2 12:30 → 12:46 (Utanför geo)`
- `B3 12:46 → 20:18`

Totalen för projektet ska fortsatt summera alla delblock som hör till projektkedjan, inklusive utanför-blocket så länge inget annat projekt har tagit över.

## 4. Uppdatera tabellen i `StaffGpsSatelliteMap.tsx`
Samma uppdelning ska visas i geofence-tabellen, så att popup och tabell följer exakt samma blocklogik.

## 5. Tester
Uppdatera och lägg till tester för följande fall:
- Inne A → utanför → inne A igen = tre delblock under samma projekt.
- Inne A → utanför → inne B = A avslutas, B startar som nytt projekt.
- Inne A → utanför och dagen slutar utan nytt projekt = utanför-blocket ligger kvar under A och försvinner inte.
- Nuvarande exempel från skärmdumpen ska ge två projekt-inneblock med ett eget mellanblock `Utanför geo`.

# Tekniska detaljer
- Berörd logik: `src/lib/staff/buildExactGeofenceVisits.ts`
- Berörd presentation: `src/components/staff/RawGpsSatelliteMap.tsx`, `src/components/staff/StaffGpsSatelliteMap.tsx`
- Berörda tester: `src/test/buildExactGeofenceVisits.test.ts`
- Ingen databasändring.
- Ingen ändring i linje-/prickfiltreringen mer än att blockvisningen ska använda den nya modellens resultat konsekvent.