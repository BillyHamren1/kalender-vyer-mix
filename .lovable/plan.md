
# Prestandaoptimering: Logistikplanering och systemomfattande stabilisering

## Identifierade problem

### 1. Bakgrundsimporten kraschar var 30:e sekund (hela appen)
`sync_state`-tabellens RLS-policy ar markerad som **RESTRICTIVE** utan nagon **PERMISSIVE** policy. I PostgreSQL innebar det att ALL atkomst nekas, oavsett vad. Detta orsakar ett felflode var 30:e sekund som spammar konsolen med 5+ felmeddelanden per cykel.

```text
Varje 30s:
  -> updateSyncState() -> PGRST116 error (0 rows)
  -> initializeSyncState() -> 42501 RLS violation
  -> importBookings() -> 42501 RLS violation (kastas vidare)
  -> updateSyncState() -> PGRST116 error (igen)
  -> updateSyncState() -> PGRST116 error (igen)
  = 5 felmeddelanden per 30-sekunders-cykel
```

### 2. useBackgroundImport har en omstartsloop
`startBackgroundImport` och `stopBackgroundImport` skapas om vid varje renderingscykel pa grund av instabila callback-beroenden. Detta gor att `useEffect` stannar och startar om tjänsten kontinuerligt (syns tydligt i konsolloggarna: "stopped" -> "started" -> "stopped" -> "started"...).

### 3. Dubbla databashämtningar pa logistiksidan
Bade `LogisticsWeekView` och `LogisticsTransportWidget` anropar `useTransportAssignments` var for sig med overlappande datumintervall. Det resulterar i:
- 2 separata Supabase-querys med JOINs (transport_assignments + vehicles + bookings + booking_products)
- 2 separata realtidsprenumerationer pa `transport_assignments`
- Plus ytterligare en realtidsprenumeration fran `useBookingsForTransport` (om den anvands)

### 4. useVehicles laddar allt i onödan
`useVehicles` hamtar alla fordon med realtidsprenumeration aven nar datan bara anvands for att slå upp namn i transportwidgeten.

---

## Losningsplan

### Steg 1: Fixa sync_state RLS-policy (databas)
Andrar den RESTRICTIVE policyn till PERMISSIVE sa att autentiserade anvandare med ratt organization_id kan lasa/skriva sync_state. Detta stoppar omedelbart det felflode som kor var 30:e sekund.

**SQL-migration:**
```sql
DROP POLICY IF EXISTS "org_filter_sync_state" ON sync_state;
CREATE POLICY "org_filter_sync_state" ON sync_state
  FOR ALL
  USING (organization_id = get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = get_user_organization_id(auth.uid()));
```

### Steg 2: Stabilisera useBackgroundImport
Refaktorera hooken for att eliminera omstartsloopen:
- Flytta `performBackgroundImport` logiken till en stabil ref-baserad approach
- Ta bort cirkulara beroenden i useCallback-kedjan
- Anvand en enda useEffect med stabil referens for interval-hantering

**Fil:** `src/hooks/useBackgroundImport.ts`

### Steg 3: Lyft upp transportdata till LogisticsPlanning
Istallet for att bade `LogisticsWeekView` och `LogisticsTransportWidget` hamtar sin egen data:
1. Anropa `useTransportAssignments` en gang i `LogisticsPlanning`
2. Skicka ner assignments som props till bada komponenterna
3. Resulterar i 1 databasfraga istallet for 2, och 1 realtidsprenumeration istallet for 2

**Filer:**
- `src/pages/LogisticsPlanning.tsx` -- hamtar data, skickar ner
- `src/components/logistics/LogisticsWeekView.tsx` -- tar emot assignments som props
- `src/components/logistics/widgets/LogisticsTransportWidget.tsx` -- tar emot assignments som props

### Steg 4: Optimera useVehicles-anropet
`LogisticsPlanning` anropar `useVehicles` som laddar alla fordon + realtid. Fordonsdata anvands bara for namnuppslag i TransportWidget. Flytta detta sa att fordonsnamn redan ar inkluderade i transport_assignments-queryn (de ar redan JOINade via `vehicle`-relationen), sa att `useVehicles` inte behovs alls pa planning-fliken.

**Filer:**
- `src/pages/LogisticsPlanning.tsx` -- ta bort useVehicles
- `src/components/logistics/widgets/LogisticsTransportWidget.tsx` -- anvand `assignment.vehicle?.name` istallet for separat vehicles-lookup

---

## Resultat

| | Fore | Efter |
|---|---|---|
| Felmeddelanden per minut | ~10 (sync_state RLS) | 0 |
| DB-fragor vid sidladdning | 3+ (2x transport + 1x vehicles) | 1 (transport med JOINs) |
| Realtidsprenumerationer | 3-4 | 1 |
| Bakgrundsimport-omstarter | Varje renderingscykel | Ingen (stabil) |
| Upplevd laddtid | Laggig | Snabb |

## Tekniska detaljer

### Filer som andras
1. **Databas**: Ny migration for sync_state RLS-fix
2. `src/hooks/useBackgroundImport.ts` -- stabilisera hook, ta bort omstartsloop
3. `src/pages/LogisticsPlanning.tsx` -- lyft data, ta bort useVehicles
4. `src/components/logistics/LogisticsWeekView.tsx` -- ta emot props istallet for egen hook
5. `src/components/logistics/widgets/LogisticsTransportWidget.tsx` -- anvand vehicle-data fran assignments
