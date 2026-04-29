# Returflöde (IN) i scanner-kalendern

## Mål
Idag visar scanner-kalendern bara packningar för **UT** (ankrade på `rigdaydate`). Vi behöver att samma packlista även dyker upp på **`rigdowndate`** som ett **retur-jobb (IN)**, där hela ursprungslistan visas igen och varje kolli/artikel kan scannas tillbaka till hyllan.

## UX

En packning kan nu ha **två kort** i kalendern:

```text
[OUT] 12 jun  Acme AB · Pack    → status: planning/in_progress/packed
[IN]  18 jun  Acme AB · Retur   → status: delivered → returning → returned
```

Korten särskiljs visuellt:
- **OUT-kort** (oförändrat): grön/blå badge, knappar "Scan" + "Check off"
- **IN-kort** (nytt): orange/lila badge "Retur", knappar "Scan tillbaka" + "Check off"

Pinned-sektionen "Pågående nu" inkluderar både `in_progress` (OUT) och `returning` (IN).

## Datamodell

Lägger till två nya statusar på `packing_projects.status`:
- `delivered` → finns redan, betyder "ute hos kund". Triggas idag när chaffören signerar utlämning.
- **`returning`** (NY) → minst ett kolli har scannats tillbaka, ej alla.
- **`returned`** (NY) → alla kollin tillbaka på hyllan, jobbet är klart.

Befintligt `completed` behålls för administrativ avslut efter `returned`.

`packing_list_items` får två nya kolumner för att tracka returscanning utan att överskriva utlämningsdatan:
- `quantity_returned int default 0`
- `returned_at timestamptz`
- `returned_by uuid`

(Vi rör inte `quantity_packed/packed_at` — den datan är historik från utlämning.)

## Backend (scanner-api edge function)

1. **`list_active_packings`**: utöka filtret till `['planning','in_progress','packed','delivered','returning']` så delivered-packningar finns kvar i listan tills de är fullt returnerade.
2. **Nytt action `return_scan_item`**: ökar `quantity_returned` (klampat mot `quantity_packed`), sätter `returned_at/by`, och flippar packningens status `delivered → returning → returned` enligt samma single-source-regel som packing-progress-mirrorn (`supabase/functions/_shared/packing-progress.ts` får ett spegelfält för "returnable items").
3. **Idempotens**: parcel-baserad scanning återanvänder `packing_list_item_allocations` så ett scan av kolli A returnerar exakt de items som var packade i A.

## Frontend

### `src/hooks/scanner/usePackingsByDate.ts`
Lägg till en andra ankring per packning:

```text
För varje packning emit:
  - { kind:'out', anchor: rigdaydate ?? eventdate ?? created_at }
  - om status ∈ {delivered, returning} och rigdowndate finns:
      { kind:'in',  anchor: rigdowndate }
```

Hooken returnerar `Array<{ packing, kind: 'out' | 'in' }>` per dag istället för bara packningar.

### `src/components/scanner/calendar/PackingCard.tsx`
Tar emot `kind`-prop:
- Olika badge/färg/ikon (`PackageOpen` för IN, `Package` för OUT)
- Olika knapptexter: "Scan tillbaka" / "Check off retur" vs nuvarande
- `onSelect(packingId, mode, kind)` så `VerificationView` vet om den är i retur-läge

### `PackingDayView` / `WeekView` / `MonthView`
Loopar över de nya `{packing, kind}`-entries istället för packings. Counten i månadsvyn räknar OUT+IN separat (eller summerat — föreslår summerat med tooltip).

### `MobileScannerApp.tsx`
- `handleSelectPacking(id, mode, kind)` → state får ett nytt fält `flow: 'out' | 'in'`
- Pinned-sektionen "Pågående nu" inkluderar både `in_progress` och `returning`

### `VerificationView` + `ManualChecklistView`
Får en `flow`-prop. När `flow === 'in'`:
- Visar `quantity_packed` som "Att scanna tillbaka"
- Progress = `quantity_returned / quantity_packed`
- Scan-handler kallar `return_scan_item` istället för `scan_item`
- "Klar"-knappen sätter status till `returned` när alla items är returnerade

## Realtime
`useScannerRealtime` lyssnar redan på `packing_list_items` och `packing_projects` — räcker, eftersom retur-scans uppdaterar samma rader.

## Migrations
Två migrations:
1. ALTER TABLE `packing_list_items` ADD COLUMN `quantity_returned`, `returned_at`, `returned_by`.
2. Lägg till `'returning'` och `'returned'` i `packing_status` enum (eller text-check).

## Risk / scope
- Backend mirror `packing-progress.ts` måste få en parallell "return-progress"-räknare så inga andra delar av systemet (planning-statusbadges) tror jobbet plötsligt är "stuck" när det är på väg tillbaka.
- Statusvokabulär för Planning-modulen ändras INTE — där visas fortfarande Aktivt/Stängt/Avbokat (memory: project-status-vocabulary-v1). Retur-statusarna är interna för warehouse-modulen.

## Avgränsning
Denna PR rör enbart scanner-mobilen + edge function + DB. Desktop "PackingManagement" får en kort indikator (Retur in_progress) men ingen full retur-UI i denna runda.

Är detta rätt riktning, eller vill du att returscanning ska gå mot en helt separat tabell/projekttyp istället för att återanvända `packing_projects`?
