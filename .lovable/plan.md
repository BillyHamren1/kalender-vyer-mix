

# Plan: Migrera ekonomi till eventflow-bookings backend

## Nuläge

Idag hämtar ekonomi-fliken data från **lokala tabeller** i denna Supabase-instans:
- `project_budget` -- budgeterade timmar och timpris
- `project_purchases` -- inköp/utlägg
- `project_quotes` -- leverantörsofferter
- `project_invoices` -- fakturor
- `time_reports` -- tidrapporter (via booking_id)
- `booking_products` -- produktkostnader (lokalt synkade)

Booking-teamet erbjuder en `planning-api` Edge Function som ger oss read+write-access via API-nyckel.

## Vad booking-teamet behover gora (deras sida)

Innan vi kan migrera behover de:

1. **Skapa saknade tabeller** i sin databas:
   - `planning_budget` (project_id/booking_id, budgeted_hours, hourly_rate, description)
   - `planning_purchases` (booking_id, description, amount, supplier, category, purchase_date, receipt_url, created_by)
   - `planning_quotes` (booking_id, supplier, description, quoted_amount, status, quote_date, valid_until)
   - `planning_invoices` (booking_id, supplier, invoice_number, invoiced_amount, status, invoice_date, due_date, quote_id, notes)
   - `planning_time_reports` (booking_id, staff_id, staff_name, hours_worked, overtime_hours, hourly_rate, overtime_rate, report_date, start_time, end_time, approved)

2. **Bygga `planning-api` Edge Function** med dessa endpoints:

```text
GET  ?type=budget&booking_id=xxx
POST ?type=budget  (upsert)

GET  ?type=purchases&booking_id=xxx
POST ?type=purchases  (create)
DELETE ?type=purchases&id=xxx

GET  ?type=quotes&booking_id=xxx
POST ?type=quotes  (create)
PUT  ?type=quotes&id=xxx  (update)
DELETE ?type=quotes&id=xxx

GET  ?type=invoices&booking_id=xxx
POST ?type=invoices  (create)
PUT  ?type=invoices&id=xxx  (update)
DELETE ?type=invoices&id=xxx

GET  ?type=time_reports&booking_id=xxx
GET  ?type=product_costs&booking_id=xxx
```

3. **Autentisering**: Validera `PLANNING_API_KEY` i request header (`x-api-key`).

## Vad vi gor pa var sida (efter att deras API ar klart)

### Steg 1 -- Lagg till API-nyckel som secret
- `PLANNING_API_KEY` -- nyckeln som booking-teamet ger oss

### Steg 2 -- Skapa en tunn lokal Edge Function (`planning-api-proxy`)
En lokal proxy som:
- Tar emot anrop fran frontenden
- Validerar att anvandaren ar inloggad (getClaims)
- Vidarebefodrar till eventflow-bookings `planning-api` med API-nyckeln
- Returnerar svaret

Detta behover vi for att inte exponera API-nyckeln i frontend-koden.

### Steg 3 -- Ersatt `projectEconomyService.ts`
Byt alla `supabase.from(...)` anrop till `supabase.functions.invoke('planning-api-proxy', ...)`:

```text
Fore:  supabase.from('project_budget').select(...)
Efter: supabase.functions.invoke('planning-api-proxy', { body: { type: 'budget', booking_id } })
```

### Steg 4 -- Ersatt `productCostService.ts`
Samma monster -- hamta produktkostnader via proxyn istallet for lokala `booking_products`.

### Steg 5 -- Uppdatera `useProjectEconomy.tsx`
- Alla queries pekar pa nya service-funktioner
- Query keys andras till att inkludera `booking_id` istallet for `project_id` for ekonomidata
- Mutations anropar proxy-write-endpoints
- Optimistic updates behalls (samma monster, ny datakalla)

### Steg 6 -- Rensa lokala tabeller (valfritt, sista steget)
Nar allt fungerar kan vi ta bort beroendet pa lokala ekonomitabeller:
- `project_budget`
- `project_purchases`
- `project_quotes`
- `project_invoices`

Dessa tabeller behalls i databasen for historisk data men anvands inte langre i koden.

## Dataflode efter migrering

```text
Frontend (useProjectEconomy)
    |
    v
planning-api-proxy (lokal Edge Function)
    |  - Validerar JWT
    |  - Lagger till x-api-key header
    v
planning-api (eventflow-bookings Edge Function)
    |  - Validerar API-nyckel
    |  - Laser/skriver mot sin databas
    v
eventflow-bookings Supabase DB
```

## Fordelar
- En kalla till sanning for all ekonomidata
- Inga synkroniseringsproblem
- Booking-teamet kan se samma ekonomidata i sitt system
- Produktkostnader, fakturor etc. ar alltid uppdaterade

## Risker och hantering
- **Latens**: Extra nathop via proxy -- minimalt (~50-100ms), acceptabelt
- **Tillganglighet**: Om eventflow-bookings ar nere visas inga ekonomidata -- hanteras med felmeddelanden
- **Schema-andringar**: Proxyn fungerar som kontrakt, booking-teamet meddelar fore andringar

## Nasta steg
1. Skicka tabellspecifikationen till booking-teamet sa de kan skapa tabeller och API
2. Nar deras API ar klart, implementerar vi steg 1-5 ovan

