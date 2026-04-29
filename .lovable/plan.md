# Nytt statusflöde för lagerprojekt

Användarvänliga steg ska visas så här genom hela systemet (kort, listor, dashboard, scanner-app, lagerprojekt-detalj):

```
UT:        1. Planering   →  2. Pågående    →  3. Slutförd
                                                     ↓
Mellan:                       I produktion  (ute hos kund)
                                                     ↓
IN:        1. Tillbaka    →  2. Påbörjad    →  3. Slutförd
```

## Mappning till databasens `packing_projects.status`

| Visad etikett | DB-status | Trigger |
|---|---|---|
| Planering | `planning` | Skapas vid inbox→packing |
| Pågående | `in_progress` | Första pack-scan eller manuell start |
| Slutförd (UT) | `packed` | Alla items packade (canonical progress = 100%) |
| I produktion | `delivered` | Sätts vid signering av packlistan (befintligt) |
| **Tillbaka** | **`back`** *(ny status)* | **Auto vid `rigdowndate <= today` och `status='delivered'`** |
| Påbörjad (IN) | `returning` | Första retur-scan |
| Slutförd (IN) | `returned` | Alla utskickade items returnerade |

`completed`/`cancelled` behålls oförändrade.

## Vad som behöver göras

### 1. Databas-migration
- Lägg till `'back'` i CHECK-constraint på `packing_projects.status` (om sådan finns, annars bara dokumentation).
- Skapa edge-cron-funktion `flip-delivered-to-back` som körs t.ex. var 30:e minut: sätter `status='back'` på alla `packing_projects` där `status='delivered'` och kopplad bookings `rigdowndate <= today`.
  - Alternativt: kör check på read-vägen i `useWarehouseOpsBoard` och `scanner-api get_packing_status` så vi inte behöver cron — men cron är tydligast för konsekvent UI överallt. Vi kör cron + samma check i `scanner-api/get_packing_items` som säkerhet.

### 2. `supabase/functions/scanner-api/index.ts`
- `transitionToReturning` & `checkIfAllReturned`: tillåt övergång från **både `delivered` och `back`** till `returning`, och från `returning`/`back` → `returned` när allt scannats in.
- När en retur-scan undos (allt = 0): återgå till `back` om `rigdowndate <= today`, annars `delivered`.
- `signed`-pathen orörd (sätter fortsatt `delivered`).

### 3. Ny cron edge-function `packing-status-cron`
- Lyssnar på schedule (config.toml `[functions.packing-status-cron] schedule = "*/30 * * * *"`).
- Joinar `packing_projects` med `bookings` på `booking_id`/`large_project_id` och flippar `delivered → back` när rigdown-datum är passerat.
- Multi-tenant safe (filtrerar per `organization_id` rad-för-rad, ingen org-stripning behövs).

### 4. Frontend-etiketter (`src/types/packing.ts`)
- Lägg till `'back'` i `PackingStatus`-unionen.
- Uppdatera `PACKING_STATUS_LABELS`:
  - `planning: 'Planering'`
  - `in_progress: 'Pågående'`
  - `packed: 'Slutförd'`  *(tidigare "Packad")*
  - `delivered: 'I produktion'`  *(tidigare "Levererat")*
  - `back: 'Tillbaka'`
  - `returning: 'Påbörjad'`  *(tidigare "Retur pågår")*
  - `returned: 'Slutförd'`  *(tidigare "Retur klar")*
- Uppdatera `PACKING_STATUS_COLORS` (lägg `back` = orange/amber).

### 5. Komponenter som visar status
Inga logikändringar utöver att hantera `'back'` som ett giltigt status-värde:
- `OpsProjectCard.tsx` / `OpsBoardSection.tsx` — bucketize: `back` hamnar i "Idag/försenat IN"-sektion.
- `PackingCard.tsx`, `PackingDashboard.tsx`, `PackingCalendarView.tsx`, `ActivePackingsGrid.tsx`, `PackingDetail.tsx`, `PackingManagement.tsx` — använder bara labels/colors-mappar, fungerar automatiskt efter typuppdatering.
- `usePackingsByDate.ts`: lägg till `'back'` i `isReturnable`-check så IN-anchor genereras även för `back`.

### 6. `useWarehouseOpsBoard`
- Hämta även status `'back'` i listfiltret.
- Bucketize: `back` → "Tillbaka idag" eller liknande sektion (bredvid "Pågående UT").

### 7. Memory-uppdatering
Skapa `mem://features/warehouse/packing-status-flow-v1` med tabellen ovan + auto-flip-regel, och referera i index.

## Inget av detta ändrar
- Pack/retur-scan-logik (kvantiteter, allokeringar, kollin) — orörd.
- Sign_packing-flödet — orört (sätter fortsatt `delivered`).
- Avbruten/avslutad-statusarna.
