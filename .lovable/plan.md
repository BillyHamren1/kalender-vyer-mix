# Nyfiken AI-dagssammanfattning i GPS-vyn

Idag får AI:n bara en lista över kända geofence-besök (projekt/lager/boende). Allt däremellan — bilturer, lunchstopp på Bauhaus, tankning, snabb sväng hem — är osynligt. Resultatet blir trist och säger inget mer än siffrorna ovanför.

Vi byter ut hela inputen och hela prompten så att AI:n får ett komplett dygnsspår, inklusive *okända* stopp med riktiga adresser/POI, och uppmuntras att resonera som en arbetsledare som faktiskt är nyfiken på dagen.

## Vad som ändras

### 1. Bygg en komplett dagstidslinje (inte bara geofence-träffar)

I `useStaffGpsWeekSummary` (eller en ny `useStaffGpsDayTimeline`) bygger vi förutom dagens kända besök även:

- **Okända stopp** — kluster av pings ≥ ~8 min utanför alla geofences (vi använder befintliga `buildPlaceVisits` istället för `buildExactGeofenceVisits`, eller kompletterar).
- **Förflyttningar mellan stopp** — start/slut, varaktighet, ungefärlig sträcka (haversine mellan stoppens medelpunkter).
- Markera privat/boende-stopp separat så AI:n inte spekulerar om hemmet.

Payloaden som skickas till edge-funktionen blir en kronologisk lista:

```
[
  { kind: "stay", name: "FA Warehouse", start, end, min, known: true },
  { kind: "move", start, end, min, distance_km: 12.4 },
  { kind: "stay", lat, lng, start, end, min, known: false }, // okänt — ska geokodas
  { kind: "stay", name: "Swedish game fair", ... },
  ...
]
```

### 2. Reverse-geocoda okända stopp i edge-funktionen

`gps-day-narrative` får en ny förprocess: för varje `stay` utan namn anropas Mapbox (`MAPBOX_PUBLIC_TOKEN`, samma som `reverse-geocode-staff`) med `types=poi,address` för att få närmaste POI eller adress. Resultatet bakas in som `nearby: "Bauhaus Sickla"` eller `address: "Värmdövägen 84"` i payloaden innan AI:n kallas.

Cache: vi memoiserar per (rundad lat/lng till ~4 decimaler) i en in-memory Map i edge-funktionen så samma stopp inte slås upp flera gånger inom samma request.

### 3. Ny prompt — nyfiken arbetsledar-ton

System-prompten byts ut helt. Ny instruktion (kort sammanfattat):

> Du är en erfaren arbetsledare som läser en persons GPS-dag. Var nyfiken. Resonera om vad rörelserna betyder. Använd POI-namn och adresser när du beskriver okända stopp ("ett 35 min stopp vid Bauhaus Sickla — troligen materialinköp"). Spekulera försiktigt om syfte (lunch, tankning, materialhämtning, hem) när längd + plats + tidpunkt gör det rimligt — men säg "troligen" eller "ser ut som". Markera tydligt om något ser avvikande ut (oväntad lång lucka, sent slut, mycket körning). Avsluta med "Inga avvikelser." bara när allt verkligen ser normalt ut. 3–5 meningar, svensk löpande text, ingen punktlista.

Modellbyte: `google/gemini-2.5-pro` istället för flash (vi behöver resonemanget). Cache:n i `useStaffGpsDayNarrative` gör att vi bara betalar en gång per dag tills datan ändras.

### 4. Bumpad cache-nyckel

Cache-nyckeln i `useStaffGpsDayNarrative` utökas med antalet timeline-event så vi inte serverar gamla "tunna" sammanfattningar.

## Filer som rörs

- `supabase/functions/gps-day-narrative/index.ts` — ny payload-form, reverse-geocode-loop, ny prompt, byt modell till `gemini-2.5-pro`.
- `src/hooks/staff/useStaffGpsWeekSummary.ts` — bygg och exponera även `timeline` (stops + moves, inkl. okända) per dag.
- `src/hooks/staff/useStaffGpsDayNarrative.ts` — skicka `timeline` istället för bara `visits`, bumpa cache-nyckel.
- `src/components/staff/StaffGpsDayRow.tsx` — orört utseendemässigt, fortsätter rendera `narrative` (men texten blir nu rikare).

## Förväntad effekt

Dagstexten går från:

> "Markuss arbetade 06:46–07:36 på FA Warehouse och 08:21–14:11 på Swedish game fair. Inga avvikelser."

till t.ex.:

> "Markuss startade 06:46 vid FA Warehouse (50 min — verkar ha lastat). Körde sedan ~14 km till Swedish game fair där han var 08:21–14:11. Kring 12:10 ett 35 min stopp vid Bauhaus Sickla på vägen tillbaka — troligen materialinköp. Lämnade arbetsplatsen 17:32 och åkte via lagret (10 min) hem. Inga avvikelser."

## Kostnad / risker

- Mapbox reverse-geocode körs nu en gång per okänt stopp per dag (typiskt 0–3 per dag). Token finns redan.
- Gemini 2.5 Pro ~5–10× dyrare än flash, men cachen + att vi bara genererar när dagen faktiskt ändrats gör det hanterbart. Vi surface:ar 429/402 som vi redan gör.
- Om Mapbox-token saknas faller vi tillbaka på lat/lng-text — AI:n får i alla fall säga "okänt stopp nära X,Y".
