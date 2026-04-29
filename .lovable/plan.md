# Operations Board v2 — Kontroll, inte korthög

Nuvarande sidan ersätts helt. Ingen mer "lista av projektkort". Sidan har **EN datumväljare** högst upp som styr hela vyn (Idag / Imorgon / +N dagar / valfritt datum / hel vecka), och tre fokuserade sektioner under den.

## Layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│  [Idag] [Imorgon] [Vecka] [📅 valfri]      Senast scannat: 09:42    │
│  Kontroll · 4 jobb UT · 2 IN · 6 personer aktiva                    │
└──────────────────────────────────────────────────────────────────────┘

┌─ Behöver uppmärksamhet ─────────────────────────────────────────────┐
│  🔴 Bokning 4521 — UT imorgon 07:00 — 38% packat — ingen scannat 2h│
│  🟠 Bokning 4498 — Tillbaka idag — retur ej påbörjad                │
│  🟡 Anders har inga scans senaste 90 min (sista jobbet 65%)         │
└──────────────────────────────────────────────────────────────────────┘

┌─ Jobb (för valt datum) ─────────────────────────────────────────────┐
│  ▸ UT 4521  Trygghetsbolaget   ████████░░ 78%  Anders, Eva  Rig 07:│
│  ▸ UT 4530  Volvo Möte         ██░░░░░░░░ 20%  —             Rig 09│
│  ▸ IN 4498  Castellum          ███░░░░░░░ 30%  Anders        Down 14│
│  ▸ IN 4477  Skanska            ██████████ 100% (signerat)    Down 16│
└──────────────────────────────────────────────────────────────────────┘

┌─ Personalens dag (skift-tidslinje) ─────────────────────────────────┐
│  Kl  06  07  08  09  10  11  12  13  14  15  16  17  18           │
│  Anders ┃███▓▓▓ ░ ▓▓▓▓▓▓▓▓▓░▓▓▓▓┃   8h  4521(60%)→4498(retur)     │
│  Eva    ┃     ███████ ░ ▓▓▓▓░░░░┃   5h  4521(40%)                  │
│  Mikael ┃   ░ ░ ░                ┃   pres only — inga scans        │
│  Pia    ┃                         ┃   ej inloggad                   │
│   Legend: ▓ scan-aktivitet  ░ rast  ┃ skift start/slut             │
└──────────────────────────────────────────────────────────────────────┘
```

Alla rader klickbara → öppnar lagerprojektet eller staff-detalj.

## Datumväljaren (kärna)

- En kontrollpanel: knappar **Igår / Idag / Imorgon / Vecka** + en `<DatePicker>`-popover för valfritt datum.
- Internt state: `mode = 'day' | 'week'`, `anchorDate = Date`. Vecka = mån–sön kring `anchorDate`.
- Hela sidan filtrerar på dessa.

## Sektion 1 — "Behöver uppmärksamhet"

Beräknad client-side från ops-data + lite extra. Visar max 5–8 rader, sorterat efter allvar.

Regler:
1. **UT-deadline missad/nära**: jobb där `rigdaydate` ∈ [valt-datum, +1 dag] och `percent < 100`. Kritiskt om <8h kvar.
2. **IN ej påbörjad**: status = `back` mer än 4h.
3. **Stillastående jobb**: `in_progress` med scans senaste 6h men inget de senaste 2h.
4. **Personal inaktiv**: scannat något idag men inget de senaste 90 min, och har inte loggat ut.
5. **Försenat utan ansvarig**: deadline ≤ idag, status `planning`/`in_progress`, 0 workers tilldelade.

## Sektion 2 — "Jobb för valt datum/vecka"

Kompakt tabellrad (inte stora kort):
- Riktning-badge (UT/IN), bokningsnummer, kund
- Progress-bar inline + procent
- Workers (avatarer komprimerade)
- Tid kvar / deadline relativt valt datum

För **vecka**: gruppera per dag (Mån / Tis / Ons …), klick på dag = byt mode till 'day' med det datumet.

Hämtas från utökad `useWarehouseOpsBoard(anchorDate, mode)` som bara returnerar jobb vars `rigdaydate` (UT) eller `rigdowndate` (IN) ligger inom intervallet, plus aktiva (status `in_progress`/`returning`) oavsett datum.

## Sektion 3 — "Personalens dag" (tidslinje per person, skift-baserad)

För varje lagerpersonal som har scan-aktivitet eller `time_reports`-skift på valt datum (för 'week'-mode: en kompaktare variant per dag, eller dolt — föreslås dolt i week-mode).

**Datakällor:**
- `time_reports` filtrerade på datum + tag `lager`/internal warehouse project → ger `start_time`, `end_time`, `break_minutes` per person → skift-pillen `┃...┃`.
- `packing_list_item_allocations` per `scanned_by_staff_id` på datum → scan-block (hopslagna i 5-min-buckets).
- `location_time_entries` på lager-location → fallback om inga scans (visa bara närvaro `░`).

**Render:**
- Horisontell tidsaxel 06–20.
- Per person: en rad. Skift-pill från start→slut. Inom skiftet: heat-block där scans skedde (täthet = antal scans).
- Höger om raden: total tid + senaste/aktuella jobb (tex `4521 (60%) → 4498 retur`).
- Enkla regler för status-prick:
  - 🟢 scannat senaste 30 min
  - 🟡 inga scans senaste 60–120 min men skift pågår
  - 🔴 inga scans 2h+ och skift > 4h pågående
  - ⚫ skift slutat

## Implementation

### Nya/utökade hooks
- `useWarehouseOpsRange(anchorDate, mode)` — ersätter `useWarehouseOpsBoard`. Returnerar:
  - `jobs: OpsProject[]` — filtrerade på datum-intervall.
  - `attentionItems: AttentionItem[]` — beräknat från jobs + workers.
  - `staffDay: StaffDayEntry[]` — skift + scan-blocks per person.
  - `summary: { jobsOut, jobsIn, peopleActive, lastScanAt }`.
- Ett tunt `useWarehouseShifts(anchorDate, mode)` som hämtar `time_reports` med lager-tag eller kopplade till internal warehouse project.

### Nya komponenter (alla små, <200 rader)
- `src/components/warehouse-ops/OpsDateBar.tsx` — kontrollpanel + datumväljare + sammanfattning.
- `src/components/warehouse-ops/OpsAttention.tsx` — sektion 1, lista med prio-rader.
- `src/components/warehouse-ops/OpsJobsTable.tsx` — sektion 2, kompakta rader (vecko-grupperad om mode=week).
- `src/components/warehouse-ops/OpsStaffTimeline.tsx` — sektion 3, tidslinjen.
- `src/components/warehouse-ops/OpsStaffRow.tsx` — en rad i tidslinjen.

### Borttagna
- `OpsBoardSection.tsx` & `OpsProjectCard.tsx` — den gamla kortvyn skrotas i ops-boardet (filerna kan finnas kvar tills inget importerar dem; PackingDashboard använder dem inte).

### Sidan
- `src/pages/WarehouseDashboard.tsx` skrivs om från grunden, monterar `OpsDateBar` + 3 sektioner. Behåller endast: header, refresh-knapp, internal-task-knapp och `<WarehouseProjectInbox />`.

### Datafetch & prestanda
- All beräkning kvar i React Query med `refetchInterval: 30_000` för jobs/scans, `60_000` för shifts.
- Range-baserad hämtning gör att vi slipper läsa 500 packings — bara de som matchar valt datumintervall + aktiva.
- `staffDay` byggs i hooken (inte i komponent) så vi får en enda källa.

### Sortering & buckets
- "Behöver uppmärksamhet" sorterad efter allvar (kritisk → varning).
- "Jobb" sorteras: aktiva först, sen efter rig-tid stigande.
- "Personal" sorteras: aktiva nu överst, sen efter total tid idag fallande.

## Det här ändras INTE
- Status-flödet (Planering→Pågående→…→Slutförd IN) är orört.
- Scanner-API och `packing_projects`-data orört.
- Lagerprojekt-detaljsidor orörda.
