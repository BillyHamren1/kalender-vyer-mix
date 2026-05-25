
# Mål
För varje (staff, dag) ska summan av visade segment ≡ totalfönstret (last − first). Inga "försvunna" minuter. Användaren ska alltid kunna svara på frågan "vad gjorde han då?".

# Princip
Bygg en **segmenterad dagsremsa** [firstIso → lastIso] där varje ms tillhör exakt ETT segment. Inga overlap, inga gap. Summan ska matematiskt = total.

# Segment-typer (täcker 100% av fönstret)
1. `work` — visit knuten till känd arbetsplats (projekt/lager/booking-geofence)
2. `private` — visit inuti privat zon / hem / Boende-polygon
3. `travel` — pings rör sig ≥ 500 m mellan två visits (egen rörelse, inte companion)
4. `unknown_place` — visit utan match (stillaståen­de men okänd plats)
5. `gps_gap` — inga pings alls > X min (telefon av/batteri/inomhus utan signal)
6. `idle_between` — < X min mellan visits utan rörelse (mikropauser)

Allt utom `work` och `private` visas men räknas INTE som arbetstid i totalen "Arbetstid".

# Två totaler, båda alltid synliga
- **Fönster**: `firstIso → lastIso` (HH:MM–HH:MM, t.ex. 07:29–22:29 = 15h 00m)
- **Arbetstid**: sum(work)  (t.ex. 10h 14m + 5h 20m = 15h 34m → blir nu omöjligt, se nedan)
- **Resa/gap/privat/okänt**: separata badges så användaren ser var resten tog vägen

Eftersom hela fönstret nu är partitionerat: `work + private + travel + unknown + gap + idle = fönster`. Då kan arbetstid ALDRIG överstiga fönstret.

# Tekniska fixar i `summarize()` (get-staff-gps-week-summary + detail-vyn)

1. **Boundary-ping ägs av nästa visit.** När vi bygger visits: `prev.end = nextStart - 1ms` (eller `pings[i].recorded_at` för end men `pings[i+1].recorded_at` för nästa start). Aldrig samma ms i två visits.
2. **Clampa varje segment till [firstIso, lastIso]** innan minutberäkning.
3. **Privat-överlapp**: dra bort overlap från `work`-segmentet, inte bara från totalen. Använd intervallsubtraktion (samma logik båda håll).
4. **Inga separata rundningar**. Räkna i ms, summera, runda EN gång per kategori i slutet.
5. **Partition-invariant**: efter bygget, assertion `sum(allSegments) === windowMs`. Om inte → logga + fyll med `unknown_place` så användaren ändå ser något.

# UI (StaffGpsSatelliteMap dag-panel + week-summary-raden)
- Visa en horisontell remsa 07:29 ──────── 22:29 där varje segment är färgkodat (work=grön, travel=blå, gap=grå streckad, privat=lila, okänt=gul).
- Lista under remsan:
  - `FA Warehouse · 10h 14m · 07:29–17:43`
  - `Resa · 0h 12m · 17:43–17:55`
  - `Craft · 5h 20m · 17:55–22:15`
  - `GPS-glapp · 0h 14m · 22:15–22:29`
- Header: `Fönster 07:29–22:29 (15h) · Arbete 15h 06m · Resa 12m · Glapp 14m`

# Kontrakttest (låst beteende)
`src/test/gpsDayPartition.contract.test.ts`:
- Inga overlap
- Inga gap
- sum(segments) === lastIso − firstIso
- Boundary-ping räknas bara en gång
- Privat-overlap subtraheras från work

`supabase/functions/_shared/staff-gps/__tests__/summarize_test.ts` speglar samma kontrakt på Deno-sidan.

# Filer som rörs
- `supabase/functions/_shared/staff-gps/snapshotCache.ts` — visit-builder: boundary-ms-regel
- `supabase/functions/get-staff-gps-week-summary/index.ts` — ny `summarize()` med partition
- `supabase/functions/_shared/staff-gps/dayPartition.ts` (ny, pure) — bygger segment-listan
- `src/lib/staff-gps/dayPartition.ts` (ny, speglar Deno-versionen för detail-vyn)
- `src/components/staff/StaffGpsSatelliteMap.tsx` — render remsa + segmentlista + ny header
- `src/test/gpsDayPartition.contract.test.ts` (ny)
- `.lovable/memory/constraints/gps-day-partition-v1.md` (ny memory för att låsa regeln)

# Minne att lägga till Core
> **GPS day partition**: Dagsfönstret [firstPing, lastPing] partitioneras till exakt täckande segment (work/private/travel/unknown/gap/idle). Summan av segmenten = fönstret. Boundary-ping ägs av nästa visit. Privat-overlap subtraheras från work. Se [GPS Day Partition](mem://constraints/gps-day-partition-v1).

# Validering
1. `bunx vitest run src/test/gpsDayPartition.contract.test.ts`
2. Deno-test för summarize
3. Manuell verifiering i preview på din nuvarande dag — kontrollera att 07:29–22:29 fylls 100% och att FA + Craft + resa/gap = 15h.
