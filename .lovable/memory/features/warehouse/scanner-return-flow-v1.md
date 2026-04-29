---
name: Scanner Return (IN) Flow
description: Same packing list shows up twice in scanner calendar — once as OUT (rigdaydate) for packing/loadout, once as IN (rigdowndate) for returning items to the shelf via quantity_returned tracking.
type: feature
---

# Returflöde i scanner-kalendern

Varje `packing_project` kan dyka upp som **två** kort i scanner-kalendern:

| Kort | Anchor | Visas när status är |
|------|--------|---------------------|
| **OUT** (Pack/Loadout) | `rigdaydate` → `eventdate` → `created_at` | `planning`, `in_progress`, `packed` |
| **IN** (Retur) | `rigdowndate` → `eventdate` | `delivered`, `returning`, `returned` |

Samma underliggande packlista, men retur-flödet spårar **`quantity_returned`** mot **`quantity_packed`** (vad som faktiskt skickades ut), inte `quantity_to_pack`.

## Datamodell

`packing_list_items` har dessa retur-kolumner (added 2026-04-29):
- `quantity_returned int` — antal scannade tillbaka till hyllan
- `returned_at timestamptz` — senaste retur-scan
- `returned_by text` — vem som scannade tillbaka

`quantity_packed/packed_at/packed_by/verified_*` är **utlämnings-historik och rörs aldrig** av retur-flödet.

## Statusvokabulär (interna för warehouse)

`packing_projects.status` är `text` (ingen enum-constraint) och har dessa värden för retur-flödet:
- `delivered` — allt skickat ut, ingen retur än
- `returning` — minst en rad har `quantity_returned > 0` men inte alla
- `returned` — alla utskickade rader är fullt returnerade

(Planning-modulen visar fortfarande Aktivt/Stängt/Avbokat per `project-status-vocabulary-v1` — retur-statusarna läcker inte dit.)

## Edge function actions (scanner-api)

Single source of truth för status-flips:
- `transitionToReturning(packingId)` — `delivered → returning` vid första retur-scan
- `checkIfAllReturned(packingId)` — flippar till `returned` när allt är hemma, eller tillbaka till `delivered` om alla retur-scans ångras

Actions:
- `return_scan_sku` — matchar SKU/namn lokalt mot items där `quantity_packed > quantity_returned`, +1 (inget WMS-anrop)
- `return_toggle_item` — manuell +1 från checklist
- `return_decrement_item` — manuell -1
- `reset_return_item` — nollställ rad

`list_active_packings` inkluderar nu också `delivered` och `returning` (delivered filtreras på `rigdowndate ≤ now+14d`).

## Frontend

- `usePackingsByDate` returnerar `{packing, kind: 'out' | 'in'}` entries istället för packings
- `PackingCard` får `kind`-prop och visar olika badges/knappar/färg (orange vänsterkant för IN)
- `ReturnView` (`src/components/scanner/ReturnView.tsx`) är den lättviktiga retur-UIn — separat från `VerificationView` för att hålla utlämnings-koden orörd
- "Pågående nu"-pin visar både `in_progress` (OUT) och `returning` (IN)

## Avgränsningar

- Ingen WMS-avallokering implementerad än — retur-scan är lokal-bara. När WMS ska få besked om att enheter är tillgängliga igen behövs ett `release-instance`-anrop motsv. `allocate-instance`.
- Desktop `PackingManagement` visar inte retur-UI än, men ser status `returning`/`returned` korrekt via samma tabell.
