

# Bättre synlighet av personal på Ops-kartan

## Problem (från skärmdumparna)
1. Personalprickarna är små (13 px) och staplas ovanpå varandra när flera står på samma plats — initialbokstaven blir oläslig och man förstår inte att det är flera personer.
2. Det finns ingen hover idag — man måste klicka för att se vem det är, och då ser man bara EN person i sidopanelen.
3. När namn väl visas (i sidopanelen / smala chips) klipps de av.

## Lösning

### 1. Klustra överlappande personal
När två eller flera personer är inom samma lilla pixelradie på aktuell zoom, slå ihop dem till en enda markör som visar antalet (t.ex. en cirkel med "3" istället för en bokstav). Klustret behåller statusfärgen om alla har samma status, annars neutral grå med färgad ring.

### 2. Hover visar ALLA namn
- **Enskild person**: hover → liten tooltip med fullständigt namn, status, team, sista GPS-tid.
- **Kluster (flera på samma plats)**: hover → tooltip listar **alla** namn i klustret med statusprick framför varje, t.ex.:
  ```
  ● Armands Birznieks — På plats
  ● Karl Karlsson — På plats
  ● Anna Andersson — På väg
  ● Erik Eriksson — Inaktiv
  ```
  Tooltipen är scrollbar om listan är lång och bred nog att rymma fulla namn (auto-bredd, max ~280 px).

### 3. Klick på kluster
- Klick på enskild person → samma sidopanel som idag.
- Klick på kluster → antingen zooma in (om det går att separera dem) eller öppna en liten lista där man väljer person, som sedan öppnar sidopanelen.

### 4. Större och tydligare markörer
- Höj basradien från 13 → 15 px så bokstaven syns bättre.
- Lägg till en mörkare halo/skugga runt cirkeln så den lyfter från kartans bakgrund (särskilt mot gula/gröna trafiklinjer).
- Etikettens text-halo görs starkare (mörkare, bredare) så den vita bokstaven läses även mot ljusa underlag.

### 5. Sidopanelens textavklippning
`Armands Birz…` i panelen → ta bort `truncate` på namnet, låt det wrappa till två rader vid behov, och öka panelens bredd något.

## Tekniskt (för referens)

Filer som ändras:
- `src/components/ops-control/OpsLiveMap.tsx`
  - Bygg ett klusterindex i klienten (enkelt pixel-grid baserat på aktuell zoom — vi kan inte använda Mapbox cluster-source rakt av utan att bryta nuvarande feature-properties, så vi gör en lättviktig egen pass innan vi sätter `staffGeoJson`).
  - Uppdatera `STAFF_MARKER_LAYER_ID` paint så `circle-radius` och färg reagerar på `clusterSize > 1`.
  - Uppdatera `STAFF_LABEL_LAYER_ID` så `text-field` blir antalet vid kluster.
  - Lägg till `mousemove`/`mouseleave` handlers på staff-lagren som visar en HTML-tooltip (absolut-positionerad div ovanpå kartan, inte Mapbox-popup för att undvika flimmer). Vid kluster: rendera lista över alla namn.
  - Klick på kluster: om zoom < 16, `flyTo` + zoom +2; annars öppna en "välj person"-lista.
- Eventuell liten justering i sidopanelens namnrad (samma fil, runt rad 850+).

Vad som **inte** ändras:
- Datakällor, hooks, status-logik, sidopanelens funktionalitet i övrigt, jobbmarkörer, kameror, organisationsplatser, fullskärm/satellit-toggle, route-rendering.

## Resultat
- Du ser direkt var det står flera personer (siffran på markören).
- Hover visar alla fullständiga namn — ingen klickning behövs för att förstå vilka som är på en plats.
- Markörerna sticker ut mer mot kartan, även mot färgglada trafiklager.

