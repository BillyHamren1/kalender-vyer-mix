
# Optimering: En enda edge function-anrop for hela ekonomiöversikten

## Problemet nu

Batch-optimeringen fungerar korrekt -- varje projekt skickar `type: 'batch'` istallet for 7 separata anrop. Men det ar fortfarande **5 separata edge function-anrop** (ett per projekt), som alla triggar egna boot-ups och var och en gor 7 HTTP-anrop internt till det externa API:t.

```text
Nu:  5 edge function-anrop x 7 externa anrop = 35 externa anrop + 5 boot-ups
Mal: 1 edge function-anrop x 7 externa anrop per booking = 35 externa anrop + 1 boot-up
```

Den stora vinsten: **1 edge function boot istallet for 5**, plus att alla 35 externa anrop kor i en enda `Promise.all` inuti en enda funktion.

## Losning: `type: 'multi_batch'` med alla booking_ids

### Steg 1: Utoka edge function (`planning-api-proxy/index.ts`)

Lagg till en ny typ `multi_batch` som tar emot en array av `booking_ids` istallet for ett enda `booking_id`. Internt gor den `Promise.all` over alla bokningar, dar varje bokning i sin tur gor 7 parallella anrop.

**Input:**
```json
{
  "type": "multi_batch",
  "booking_ids": ["abc123", "def456", "ghi789"]
}
```

**Output:**
```json
{
  "abc123": { "budget": ..., "time_reports": [], ... },
  "def456": { "budget": ..., "time_reports": [], ... },
  "ghi789": { "budget": ..., "time_reports": [], ... }
}
```

### Steg 2: Ny service-funktion (`planningApiService.ts`)

Lagg till `fetchAllEconomyDataMulti(bookingIds: string[])` som anropar `multi_batch` med alla booking_ids och returnerar en `Record<string, BatchEconomyData>`.

### Steg 3: Uppdatera hooken (`useEconomyOverviewData.ts`)

Istallet for `Promise.all` med ett batch-anrop per projekt:
1. Samla alla booking_ids fran projekten
2. Gor ETT anrop med `fetchAllEconomyDataMulti(bookingIds)`
3. Mappa resultaten till respektive projekt

## Resultat

| | Fore | Efter |
|---|---|---|
| Edge function-anrop | 5 | **1** |
| Edge function boot-ups | 5 | **1** |
| Externa API-anrop (internt) | 35 | 35 (men i en enda Promise.all) |
| Uppskattat laddtid | 5-10s | **1-2s** |

## Tekniska detaljer

### Filer som andras

1. `supabase/functions/planning-api-proxy/index.ts` -- ny `multi_batch`-typ
2. `src/services/planningApiService.ts` -- ny `fetchAllEconomyDataMulti()`
3. `src/hooks/useEconomyOverviewData.ts` -- anvand multi_batch istallet for flera batch-anrop
