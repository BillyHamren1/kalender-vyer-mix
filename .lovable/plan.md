

## Lager-tidsöversikt (timeline) på Lagerdashboard

### Vad som ska ändras
Dagens "Personal & schema"-kort (`WarehouseStaffActivationCard`) är en kompakt listvy. Jag ersätter den vyn med en **timeline-baserad tidsöversikt** för lagret som är 1:1 visuellt och funktionellt jämförbar med `OpsStaffTimeline` på `/ops-control` (bilden du visade).

### Vad jag bygger

**1. Ny komponent: `src/components/warehouse-dashboard/WarehouseStaffTimeline.tsx`**
En lager-anpassad kopia av `OpsStaffTimeline` med samma layout:
- **Header**: "TIDSÖVERSIKT" + dag-navigering (◀ Idag ▶) + räknare (`X tilldelade`, `Y lediga`, ev. `Z konflikter`).
- **Sticky timrad** 06–24 (samma som ops).
- **Personal grupperad per Lagerteam** (`Lager 1`, `Lager 2`, …). Personal utan lagerteam för dagen hamnar under "Ej tilldelade lagerteam".
- **Block per pass** med samma färgkoder anpassade för lager:
  - Packning (primary), Utleverans (grön), Retur (amber), Inventering (sky), Uppackning (cyan), Internt lagerpass (warehouse-färg), Transport (slate).
- **Hover-tooltip** med titel, tid, adress, typ — samma `OpsAssignmentTooltip`-stil (eller en lokal motsvarighet, se nedan).
- **"Nu"-linje** (röd vertikal) endast på dagens datum.
- **Klick på block** → navigerar till passets detaljvy:
  - Packning/uppackning → `/warehouse/packing/:packingId`
  - Internt lagerpass → öppnar uppgiftsdialog
  - Transport → `/warehouse/transport`
  - Övrigt med booking → `/booking/:id`
- **Drag-och-släpp utelämnas i v1** (lager har inte samma "tilldela till bokning"-flöde från denna vy — kan läggas till senare). Texten "Dra personal..." byts ut mot info om antal pass.

**2. Datakälla — återanvänder befintlig hook**
`useWarehouseStaffScheduleOverview(staffWithActivations, date, 'day')` returnerar redan exakt det vi behöver per person:
- `id`, `title`, `eventType`, `startTime`, `endTime`, `resourceLabel` (= team-namn), `bookingNumber`, `bookingId`, `packingId`.

Mappning till timeline-modellen:
```text
WarehouseStaffScheduleItem  →  TimelineAssignment
- startTime/endTime         →  block-position på timrad
- eventType                 →  färg + typ-etikett
- title                     →  block-text
- resourceLabel ("Lager 2") →  team-grupp för personen
- bookingNumber             →  visas i tooltip
```

För team-gruppering används personens **primära lagerteam** för dagen (från `staff_assignments` där `team_id LIKE 'lager-%'`). Är hen inte tilldelad ett team men har pass → "Ej tilldelade lagerteam".

**3. Hook: `src/hooks/useWarehouseStaffTimeline.ts`** (ny)
Tunn wrapper som:
- Hämtar lagerpersonal via `useWarehouseStaffActivations`
- Hämtar dag-schema via `useWarehouseStaffScheduleOverview(..., 'day')`
- Hämtar dagens `staff_assignments` för team_id (filtrerat på `lager-%`)
- Returnerar `WarehouseTimelineStaff[]` med samma form som `OpsTimelineStaff`:
  ```ts
  { id, name, color, role, status, assignments[], hasConflict,
    currentJob, nextJob, teamId, teamName }
  ```
- Markerar `hasConflict` när två block överlappar i tid.

**4. Integration i `WarehouseDashboard.tsx`**
Jag flyttar `WarehouseStaffActivationCard` ut ur `grid-cols-2` och lägger den nya `WarehouseStaffTimeline` som en **bred sektion ovanför** transportkortet:
```text
[ Inbox ]
[ IncomingPackingList ]
[ Recent packings widgets ]
[ ░░░░░ TIDSÖVERSIKT (full bredd) ░░░░░ ]   ← NY
[ Personal & schema (kompakt) | Transporter ]
```
Den gamla listan behålls som sekundär detaljvy men i halv bredd. Vill du senare ta bort den helt — bara att kommentera ut.

### Berörda filer
- `src/components/warehouse-dashboard/WarehouseStaffTimeline.tsx` (ny — kopierar struktur från `OpsStaffTimeline`)
- `src/components/warehouse-dashboard/WarehouseAssignmentTooltip.tsx` (ny — lager-anpassad tooltip)
- `src/hooks/useWarehouseStaffTimeline.ts` (ny — sammanställer data)
- `src/pages/WarehouseDashboard.tsx` (lägger in ny sektion + omplacerar gamla kortet)

### Inte i denna ändring
- Ingen drag-och-släpp för tilldelning (hanteras via lagerkalendern).
- Ingen ändring av `OpsStaffTimeline` (det är planning-domänen).
- Ingen DB- eller edge-funktion-ändring.
- Mobilvyn på lagerdashboarden påverkas inte (timeline är desktop-orienterad — visas dold på `<lg`).

### QA efter implementation
1. Öppna `/warehouse` → "TIDSÖVERSIKT"-sektionen visas över befintliga kort.
2. Personal grupperas under `Lager 1`, `Lager 2` osv enligt dagens `staff_assignments`.
3. Varje pass syns som färgat block på rätt tid; "Nu"-linjen syns idag.
4. Hover på block → tooltip med titel/tid/adress/typ.
5. Klick på packningsblock → `/warehouse/packing/:id`; klick på transportblock → transportlistan.
6. Byt dag med ◀▶/Idag → datat uppdateras; "Nu"-linje försvinner på andra dagar.
7. Två överlappande pass på samma person → varningsikon + ljus destruktiv bakgrund på raden.

