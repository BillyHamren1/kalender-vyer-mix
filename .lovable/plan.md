## Problem

På raden för en okänd vistelse (t.ex. `Mjölbyvägen 10, 573 34 Tranås — Okänt projekt`) visas bara gatuadressen. Användaren vill se **vad som faktiskt ligger på platsen** (POI-namn / verksamhet) så det går snabbt att avgöra om det är ett kommande bygge, ett tidigare bygge, en kund, eller bara en privat adress.

## Rotorsak

`useReverseGeocodeRich` skickar idag ETT Mapbox-anrop med `limit=1&types=poi,address,…`. Mapbox returnerar då typiskt en `address.*`-feature och POI-fältet blir tomt. Slutlabeln blir gatuadress, och `poiName/poiCategory` försvinner. Inget i UI visar POI separat även när det finns.

## Lösning

Två parallella Mapbox-anrop per okänd punkt + utöka rendering så POI alltid syns när Mapbox känner till en verksamhet.

### 1. `src/hooks/useReverseGeocodeRich.ts`

- Gör två fetch i parallell mot Mapbox reverse:
  - `?types=address&limit=1` → adress + ort
  - `?types=poi&limit=5` → upp till 5 POI inom ~100 m
- Plocka närmaste meningsfulla POI (filtrera bort `category=residential`, ren adress, etc.).
- Returnera utökad `RichGeocode`:
  - `address`, `city` (oförändrat)
  - `poiName`, `poiCategory` (närmaste POI ≤ ~100 m)
  - Ny: `nearbyPois: Array<{ name; category; distanceMeters }>` (max 3, sorterade på avstånd) — för debug-expand och tooltip.
- `label`: behåll dagens prioritet (POI > adress) men säkerställ att POI inte slukar gatuadressen — lägg den i `address` så UI kan visa båda.

### 2. `src/lib/staff/dayBlockTimeline.ts` → `ResolvedPlace`

- Lägg till valfria fält `poiName`, `poiCategory`, `nearbyPois` på `ResolvedPlace` (de propageras redan från `useReverseGeocodeRich` via `applyEndpoint` i `ActualDayPanel`, men typen behöver fälten).

### 3. `src/components/staff/DayBlockTimelineView.tsx` → `PresenceRow`

För `presenceKind === 'unknown'`-rader med upplöst adress:

- Huvudraden visar adressen som idag (klickbar Google Maps-länk).
- **Ny chip** direkt efter adressen: `📍 <poiName>` med tooltip = `<poiCategory> · ~<dist> m` när POI finns. Klick = öppna Google Maps på POI.
- Fortsätter med befintlig subtitle `Okänt projekt – sparas som övrigt · närmsta: Tiomila 2026 (2287 m)`.
- I expand-vyn: lista `nearbyPois` (max 3) som "I närheten: Företag A · Företag B · Företag C".

### 4. Test

Lägg till en regression i `src/lib/staff/__tests__/` som mockar två-anropsvarianten och säkerställer att en feature med POI-träff ger `poiName` även när bästa adress också finns.

## Resultat

Raden går från:

```
12:04–12:45 · 41m   Mjölbyvägen 10, 573 34 Tranås · Okänt projekt – sparas som övrigt · närmsta: Tiomila 2026 (2287 m)
```

till:

```
12:04–12:45 · 41m   Mjölbyvägen 10, 573 34 Tranås · 📍 Westmans Bil  ·  Okänt projekt – sparas som övrigt · närmsta: Tiomila 2026 (2287 m)
```

så det syns omedelbart vad som ligger där, utan att GPS-träffen automatiskt klassas som arbete.
