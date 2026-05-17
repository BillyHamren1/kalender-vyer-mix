
# Plan: "Boende"-platser ska alltid vara hem, och hem-inferensen ska räcka med en natt

## Bakgrund (vad jag hittade)

- Ni har redan två platser markerade korrekt i DB:
  - `Boende - Vällsta` (`is_private_residence=true`, polygon)
  - `Boende - Venngarn` (`is_private_residence=true`, polygon)
- Båda används redan som "stäng av dagen"-zoner i mobilen (`useGeofencing` dispatchar `request-end-day` på enter).
- MEN: i hela home-stacken (`useEndDayOnArrivalHome`, `process-day-timer-auto-stop`, `close-stale-workday-entries`, `workday-ai-auto-stop`, `get-staff-presence-day`) läses hem ENBART från `staff_inferred_home_locations`. De markerade boendena räknas aldrig som "personens hem".
- `infer-home-location` kräver ≥ 2 nätter i samma 100 m‑kluster i rad. Billy har 7 nattobservationer men bara 2 sammanhängande → en (svag) primary, övrig personal saknar helt.

## Beslut (utifrån era svar)

1. **Boende-platser = alltid hem för alla.** Polygonen är källan. Behöver inte vara "min" adress för att räknas som hem.
2. **Boende vinner direkt.** Om en persons nattcluster ligger inuti en `is_private_residence`-polygon → spara hem omedelbart (en natt räcker), oavsett 2-natters-regeln. Annars kör vanlig inferens som idag.

## Vad jag bygger

### 1. Ny gemensam hem-resolver (server)

`supabase/functions/_shared/home-zones/resolveHomeZones.ts` — singel sanningskälla:

```text
resolveHomeZones(supabase, { organization_id, staff_id })
  → HomeZone[]   // { kind: 'private_residence_polygon' | 'inferred_primary' | 'inferred_temporary' | 'manual_private_zone',
                 //   lat, lng, radius_m?, polygon?, source_id, label }
```

Reglerna:
- Hämta ALLA aktiva `organization_locations` där `is_private_residence=true` för org → varje sådan polygon är en hemzon **för all personal i org**.
- Lägg på `staff_private_zones` (manuella, per staff) som idag.
- Lägg på `staff_inferred_home_locations` (primary + giltig temporary) som idag.
- Inside-test: polygon vinner alltid över cirkel.

### 2. Byt ut alla ställen som idag bara läser `staff_inferred_home_locations`

Ersätt direkta selects i:
- `supabase/functions/process-day-timer-auto-stop/index.ts` (`loadHomeZones`)
- `supabase/functions/close-stale-workday-entries/index.ts` (suggestions: `arrived_home`)
- `supabase/functions/workday-ai-auto-stop/index.ts`
- `supabase/functions/get-staff-presence-day/index.ts`
- `supabase/functions/backfill-staff-day-report-cache/index.ts`
- Frontend: `src/hooks/useEndDayOnArrivalHome.ts` → använd nytt endpoint i `mobile-app-api` `get_home_zones` istället för direkt select. (Polygon-stöd: hem är "inne om dist < radius ELLER inside polygon".)

### 3. `infer-home-location`: Boende vinner direkt

I `supabase/functions/infer-home-location/index.ts` per (staff, datum)-observation:
- Snap-klustret kontrolleras mot alla aktiva `is_private_residence`-polygoner i org.
- Träff → upsert direkt `staff_inferred_home_locations` med:
  - `kind='primary'`, `cluster_key='residence:<location_id>'`,
  - `lat/lng` = polygonens centroid, `radius_m=HOME_RADIUS_M`,
  - `confidence=1.0`, `nights_observed=1`, `valid_until=null`,
  - `metadata.source='private_residence_polygon'`, `metadata.location_id=<id>`.
- Hoppa över 2-natters-regeln för dessa.
- Behåll exklusionen av andra org-locations (warehouse/projektplats) som idag.

Detta gör att Billy direkt får en primary om hans nattcluster ligger i Vällsta eller Venngarn — utan att vi väntar två nätter i följd.

### 4. Engångs-backfill nu (manuell körning av cron)

Efter deploy: trigga `infer-home-location` en gång manuellt så att alla personer med nattobservationer i Vällsta/Venngarn omedelbart får primary hem. Jag kör den från min sida.

### 5. Tester (vitest + Deno)

- `src/test/homeZones.privateResidenceWins.test.ts` — kontrakt: `infer-home-location/index.ts` innehåller polygon-check + en-natt-shortcut.
- `supabase/functions/_shared/home-zones/resolveHomeZones.test.ts` — Deno-test som matar in (polygon + inferred + private_zone) och verifierar prioritet, inside-test, multi-tenant filter.
- Kontrakttest att alla 5 server-funktionerna importerar `resolveHomeZones` (inte längre rå select från `staff_inferred_home_locations`).

## Teknisk detalj — datamodell rörs INTE

- Inga nya tabeller, inga schema-ändringar.
- `staff_inferred_home_locations` blir fortsatt enda hem-tabellen som klienten/funktionerna läser; vi använder den för att projicera Boende-polygonerna in i samma form (med markör i `metadata`). Det håller bakåtkompatibilitet med admin-UI som listar hem per person.
- Multi-tenant: allt filtreras alltid på `organization_id`.

## Vad ni märker efteråt

- Billy och alla andra som ofta sover på Vällsta/Venngarn får hem **direkt efter nästa nattscan** (eller direkt vid backfill).
- "Du kom hem"-logik, auto-stop-dagen, dag-stäng-förslag, presence-vyer — alla använder samma sanning.
- Markerar ni ett nytt "Boende" i Ops Control räcker det att en person sover där en natt för att personen ska få det som hem.
