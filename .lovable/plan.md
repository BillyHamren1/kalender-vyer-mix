

# Fix: Ekonomioversikten visar fel siffror

## Problem

Ekonomioversikten (`/economy`) hamtar data fran **lokala Supabase-tabeller** (`project_budget`, `project_purchases`, `project_quotes`, `project_invoices`), medan varje projekts ekonomiflik hamtar data via **planning-api-proxy** fran det externa EventFlow-systemet.

Eftersom all ekonomidata lever i EventFlow (inte lokalt) blir oversikten tom/felaktig -- budgetar visar 0 kr, inkop saknas, etc.

## Losning

Refaktorera `ProjectEconomyView` i `EconomyOverview.tsx` sa att den anvander samma datakalla som projektvyn -- dvs. planning-api-proxy via `bookingId`.

## Tekniska steg

### 1. Skapa en ny hook: `useProjectEconomySummary`
En lattare variant av `useProjectEconomy` som bara hamtar summerad data for ett projekt (budget, tidrapporter, inkop, offerter, fakturor, produktkostnader, leverantorsfakturor) via planning-api-proxy.

### 2. Skapa en sammansattande hook: `useEconomyOverviewData`
En hook som:
- Hamtar alla aktiva projekt fran lokala `projects`-tabellen (som idag)
- For varje projekt med `booking_id`: anropar planning-api-proxy for att hamta budget, tidrapporter, inkop, offerter, fakturor, produktkostnader och leverantorsfakturor
- Kor `calculateEconomySummary` med **alla** parametrar (inklusive `productCosts` och `supplierInvoices` som saknas idag)
- Returnerar samma `ProjectWithEconomy[]`-struktur

### 3. Uppdatera `EconomyOverview.tsx`
- Ersatt den stora inline `queryFn` (rad 61-189) med den nya `useEconomyOverviewData`-hooken
- Inga andringar i UI-koden -- den renderar redan `summary`-falt korrekt

### 4. Behall lokal fallback for projekt utan booking_id
Projekt utan `booking_id` kan inte ha ekonomidata fran EventFlow. Dessa visas med 0-varden som idag, eller doljs fran listan.

## Vad fixas

| Kolumn | Innan | Efter |
|---|---|---|
| Budget | 0 kr (lokal tabell tom) | Ratt varde fran EventFlow |
| Faktisk | Bara lokala tidrapporter | Tidrapporter + inkop + leverantorsfakturor fran EventFlow |
| Inkop | Lokal `project_purchases` | EventFlow purchases |
| Avvikelse | Felaktig (-100%) | Korrekt beraknad |
| Timmar | Bara lokala | Fran EventFlow tidrapporter |
| Produktkostnader | Saknas helt | Inkluderas i budget |
| Leverantorsfakturor | Saknas helt | Inkluderas i faktisk kostnad |

## Prestanda

Eftersom varje projekt kraver ett API-anrop till planning-api-proxy, lagger vi till:
- `staleTime: 5 * 60 * 1000` (5 min cache)
- Parallella anrop via `Promise.all` (som idag)
- Laddindikatorer per projekt om nodvandigt

