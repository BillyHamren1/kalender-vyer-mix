## Problem

På `/staff-management/gps-satellite-map` visas just nu en 5-minuters rad
"Okänd plats FA Warehouse → — 11:31–11:36" efter att personen lämnat FA
Warehouse, samt korta 2-minuters resor "Resa FA Warehouse → FA Warehouse"
som i praktiken är GPS-brus runt samma adress.

Vi har redan en projektpolicy (`short-visit-no-auto-workpass-v1`,
`MIN_VISIT_MIN = 15` i `timelineVisibility.ts`) som säger att vistelser
1–15 min på okänd plats inte ska bli ett eget block — men
`dayPartition.ts` (som driver StaffGpsDayRow / vyn på den här sidan)
saknar samma regel, och saknar dessutom motsvarande absorbering av
korta travel-rader.

## Fix

Lägg till en ny `absorbShortNoise()`-pass i `buildDayPartition`
(och dess Deno-spegel). Två regler:

### 1. Korta unknown_place (< 15 min)

- Ett `unknown_place`-segment med `minutes < 15` får inte renderas
  som eget block.
- Absorberas i föregående `work`/`private`-visit om sådant finns
  (work-blockets `end` flyttas fram till segmentets `end`).
- Om inget föregående finns: absorberas i nästa block (nästa blocks
  `start` backas).
- Finns varken före eller efter → segmentet behålls (annars ramlar
  tid bort).

### 2. Korta travel (< 10 min) utan ny verklig destination

- Ett `travel`-segment med `minutes < 10` absorberas i föregående
  `work`/`private`-block om det INTE leder till minst 5 min vistelse
  på en annan adress.
- "Annan adress" = nästa `work`/`private`-segment vars `knownSiteId`
  skiljer sig från föregående blocks `knownSiteId` OCH har
  `minutes >= 5`.
- Praktiskt fall: "Resa FA Warehouse → FA Warehouse 2m" (samma site
  på båda sidor) → absorberas i FA Warehouse-blocket.
- "Resa FA Warehouse → Okänd plats 5m" (om okänd-platsen redan
  absorberats i steg 1) → travel-raden räknas också som internt
  brus och absorberas.
- Travel som leder till ny känd plats med ≥5 min vistelse → behålls
  som idag (visas med from/to-adresser).

### Ordning

1. Bygg segments som idag.
2. Kör absorb-passet på `unknown_place` (regel 1).
3. Kör absorb-passet på `travel` (regel 2) — efter steg 1 så att
   travel-rader som leder till en absorberad unknown också kollapsar.
4. Eventuellt slå ihop två angränsande `work`-segment med samma
   `knownSiteId` som uppstår efter absorberingen.
5. Kör largest-remainder-minutfördelningen som idag, så att
   `sum(segments.minutes) === windowMin` bevaras.

### Vad rörs INTE

- `gps_gap`, `idle`, `work`, `private` får inga nya regler.
- Travel-rader ≥ 10 min, eller travel < 10 min som faktiskt leder
  till en ny adress med ≥ 5 min vistelse, visas oförändrat med
  from→to-adresser.
- `timelineVisibility.ts`, `pingPlaceSegments.ts` och geofence-logik
  är redan korrekta — ingen ändring där.

## Filer som ändras

- `src/lib/staff-gps/dayPartition.ts` — ny `absorbShortNoise()`
  som körs på segments-arrayen innan minut-fördelningen.
- `supabase/functions/_shared/staff-gps/dayPartition.ts` — identisk
  spegling (filerna måste hållas synkade).
- `src/lib/staff-gps/dayPartition.test.ts` — nya testfall:
  1. work → unknown_place 5 min (slut på dagen) → unknown försvinner,
     work-blocket förlängs till windowEnd.
  2. work(A) → unknown_place 5 min → work(A) → mellanliggande unknown
     absorberas in i föregående work; resultatet blir ETT work-block.
  3. work(A) → travel 2 min → work(A) → travel absorberas, blir ETT
     sammanhängande work-block.
  4. work(A) → travel 8 min → work(B) 3 min (kort) → travel absorberas
     (destinationen håller inte 5-min-tröskeln).
  5. work(A) → travel 8 min → work(B) 30 min → travel BEHÅLLS
     (riktig förflyttning till ny adress).
  6. work(A) → travel 25 min → work(B) → travel BEHÅLLS (≥ 10 min).
  7. unknown_place 30 min → behålls oförändrat (över tröskel).
  8. gps_gap och idle korta segment påverkas inte.

## Vad ändras INTE

- Ingen ändring i `timelineVisibility.ts`, `pingPlaceSegments.ts`
  eller geofence-logik.
- Ingen ändring i lagring/edge functions utöver den speglade
  pure-helpern.
- Ingen UI-ändring i `StaffGpsDayRow.tsx` — den renderar bara det
  partitioneraren ger.
