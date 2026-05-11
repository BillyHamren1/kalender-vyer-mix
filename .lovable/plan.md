## Mål

När en "Osäker period" visas i admin-tidrapporten ska användaren direkt se **var** den ägde rum och **vad platsen är** — inte bara råkoordinater. Platsen ska aktivt slås upp mot:

1. Reverse-geocodad gatuadress (Mapbox)
2. Kända organisations-platser (`organization_locations`)
3. Bokningsadresser (både dagens, **framtida** och tidigare)
4. Personalens hemadress / privata zoner (`staff_private_zones`)
5. Personalens tidigare besök på samma koordinat (historiska `place_visits` / GPS-vistelser)

Allt sker enbart i **adminwebbens display-lager**. Inga writes, ingen AI, ingen mobilapp.

## Vad som ändras

### 1. Ny edge function: `resolve-unknown-stop`

`supabase/functions/resolve-unknown-stop/index.ts`

Input (POST):
```json
{
  "organizationId": "...",
  "staffUserId": "...",
  "lat": 59.123,
  "lng": 17.456,
  "atIso": "2026-05-09T03:30:00Z",
  "radiusMeters": 250
}
```

Output:
```json
{
  "reverseGeocoded": { "label": "Storgatan 5, Solna", "source": "mapbox" } | null,
  "knownLocation": { "id": "...", "name": "FA Lager", "distanceMeters": 42 } | null,
  "privateZone":   { "kind": "home" | "manual_ignore" | "recurring_night",
                     "label": "Hemma", "distanceMeters": 30 } | null,
  "matchingBookings": [
    { "bookingId": "...", "bookingNumber": "B12345",
      "label": "Konsert Globen", "address": "...",
      "eventDate": "2026-05-12", "relativeDays": 3,
      "distanceMeters": 80, "direction": "future" | "past" | "today" }
  ],
  "priorVisits": {
    "count": 7, "firstSeenIso": "2026-02-11T...",
    "lastSeenIso": "2026-04-30T...",
    "totalMinutes": 412
  } | null
}
```

Logik (read-only):
- Reverse-geocode via befintlig Mapbox-token-flow (samma som `useReverseGeocodeRich`).
- `organization_locations`: hämta alla i org, beräkna haversine → returnera närmaste inom `radiusMeters`.
- `staff_private_zones` för `staffUserId`: närmaste inom radius + dess `kind`.
- `bookings` (master data) inom org där `latitude`/`longitude` finns och haversine ≤ radius. Sortera på `abs(eventDate - atIso)`, max 5. Sätt `direction` (today/future/past) och `relativeDays`.
- `priorVisits`: aggregera `place_visits` (eller motsvarande pings-tabell vi redan har) för samma `staffUserId` med `centerLat/Lng` inom 100 m och `endIso < atIso`. Returnera count, first/last, totala minuter. Om tabellen inte finns under detta namn — använd den vi redan läser i `_shared/timeline/`.

Inga skrivningar. Multi-tenant: filtrera ALLT på `organization_id`. Caller-token = adminens JWT.

### 2. Ny hook: `useResolvedUnknownStop`

`src/hooks/useResolvedUnknownStop.ts` — `useQuery` med `staleTime: 1h`, key `[lat-rounded, lng-rounded, staffUserId, dateBucket]` så två närliggande osäkra block delar cache. Anropar edge function via `supabase.functions.invoke`.

### 3. Utöka `LocationEvidence`

I `src/lib/staff/buildReportDisplayBlocks.ts`:

```ts
export interface LocationEvidence {
  // ... befintliga fält
  resolvedAddress?:        { label: string; source: 'mapbox' } | null;
  resolvedKnownLocation?:  { name: string; distanceMeters: number } | null;
  resolvedPrivateZone?:    { kind: 'home' | 'manual_ignore' | 'recurring_night';
                             label: string; distanceMeters: number } | null;
  resolvedMatchingBookings?: Array<{
    bookingNumber: string; label: string; eventDate: string;
    relativeDays: number; direction: 'today' | 'future' | 'past';
    distanceMeters: number;
  }>;
  resolvedPriorVisits?:    { count: number; lastSeenIso: string;
                             totalMinutes: number } | null;
}
```

`buildReportDisplayBlocks` förblir pure och tar emot resolverade fält via en ny valfri input `resolvedByBlockId: Map<blockId, ResolvedUnknownStop>` och kopierar in i `locationEvidence`.

### 4. UI: ny rendering för "Osäker period"

I `ReportCandidateTimeline.tsx` (och `DecisionTraceDrawer.tsx` för full bevisning):

För block med `kind === 'needs_review' | 'unknown'` och `locationEvidence` — visa en strukturerad "Vad vet vi om platsen?"-sektion (under befintlig titel/subtitel) med rader, i denna prioritetsordning:

1. **Hemma / privat zon** — `Hemma (35 m)` → tonas som info-badge "privat — räknas inte".
2. **Känd plats** — `FA Lager (42 m)` → klickbar länk till `organization_locations`-detalj.
3. **Adress** — `Storgatan 5, Solna` (reverse-geocode).
4. **Matchande bokningar** — kompakt lista:
   - `Idag: Konsert Globen (B12345)` 
   - `Om 3 d: Mässa Älvsjö (B12350)`
   - `Var: Tidigare bokning (B12000) — 2026-04-12`
5. **Historik** — `Personen har varit här 7 gånger (412 min, senast 2026-04-30)`.
6. **Inget av ovan** — `Adress kunde inte slås upp` + koordinat.

Ingen rad → utelämnas (inget tomt brus).

### 5. Wiring

I `StaffTimeReportsList.tsx` / `StaffDayTimelineCard.tsx`:
- Samla unika `(lat, lng, blockId)` för alla osäkra block i synlig dag.
- Anropa `useResolvedUnknownStop` per unikt block (eller batch-version om det blir många).
- Skicka `resolvedByBlockId` vidare till `ReportCandidateTimeline`.

### 6. Tester

- `src/test/resolveUnknownStopUI.contract.test.ts` — verifierar prioritetsordning (privat zon > känd plats > adress) och att inga rader visas när data saknas.
- Edge function-test som mockar Supabase-klient och bekräftar org_id-filter på alla queries.

## Säkerhet / icke-mål

- Inga writes till `time_reports`, `workdays`, `location_time_entries`, `travel_time_logs`, `gps_pings`.
- Ingen AI.
- Mobilappen rörs inte.
- Klassificeringen i `buildPresenceDayBlocks` / `classifyTransportSignalGap` ändras INTE — `kind`/`reviewState` förblir samma. Vi berikar bara display-lagret.
- Ingen geocode-cachelagring i DB i denna iteration (Mapbox-cachen i React Query räcker).

## Tekniska anteckningar

- Org-isolering: edge function hämtar caller-org via JWT och filtrerar `bookings`, `organization_locations`, `staff_private_zones`, `place_visits` på `organization_id` (RESTRICTIVE RLS speglar redan detta).
- "Future bookings"-fönster: ±60 dagar runt `atIso`, sortera närmast först.
- Distans-tröskel: 250 m för bokning/känd plats, 100 m för privat zon och historik (matchar nuvarande precision på GPS-vistelser).
- Mapbox-token: återanvänd `loadMapboxToken()` om edge function har motsv.; annars använd `MAPBOX_ACCESS_TOKEN` secret. Jag verifierar i implementeringen vilken som finns.
