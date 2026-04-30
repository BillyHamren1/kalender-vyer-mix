## Problemet

Tre konkreta fel i den expanderade dagloggen i `StaffTimeReportsTable`:

1. **Fel ordning** — Loggen renderas FÖRE namnraden, så Aleksejs händelselogg hamnar ovanför hans eget namn och ser ut att tillhöra raden ovanför (eller "ingen"). Nanas logg hamnar visuellt under Aleksejs sista rad.
2. **Ingen tydlig person-gräns** — Det finns ingen visuell avgränsare som binder loggen till rätt person.
3. **Stilen matchar inte tabellen** — Kort med ramar, KPI-pills och färgkodade ikoner sticker ut. Resten av appen (referensbild 3: Kontrollcenter) använder ren tabell-stil: subtil bakgrund, dämpade textfärger, ingen "kort-i-kort"-känsla.

## Lösning

### 1. Rätt ordning i `StaffTimeReportsTable.tsx`

Flytta `<StaffDaySummaryRow>`-blocket från FÖRE `<tr>` (rad 308–322) till EFTER namnraden men FÖRE detail-raderna. Konkret: rendera den när `r.isFirstForStaff` OCH `isOpen` (eller alltid efter första raden — bestäms nedan).

Förslag: visa dagloggen direkt efter namn-raden för första raden per person, så namnet alltid står ovanför sin egen logg.

```text
[Aleksejs Dolgovs] ← namn
  └─ Händelselogg (logg-rad spänner över hela bredden)
  └─ Dagen startade 06:51
  └─ FA Warehouse 06:51–19:53
  └─ Pågår …
─────────────────────────── tydlig divider
[Nana Yaw Antwi] ← namn
  └─ Händelselogg
  └─ …
```

### 2. Tydlig person-gräns

- Förstärk `border-t-2 border-t-border` på första raden per person till `border-t-4 border-t-primary/20` så varje persons block får ett tydligt visuellt band.
- Lägg en bottom-divider efter sista raden per person (kräver att vi vet `isLastForStaff` — kan härledas i `rows.map` via index/lookup).

### 3. Stil som matchar tabellen (referens: bild 3)

I `StaffDaySummaryRow.tsx`:

- **Bort med 4-kort-griden.** Ersätt med en enda platt sektion med 4 kolumner separerade av tunna vertikala dividers (`divide-x divide-border/40`), ingen border runt varje, ingen nested bakgrund.
- **Bort med KPI-pills i headern.** Behåll bara namn + datum vänsterställt, dämpat. Inga färgade chips.
- **Sektionsrubriker**: små, dämpade, samma stil som tabellens `<th>` (`text-[10px] uppercase tracking-wide text-muted-foreground`).
- **Färger**: bara `text-muted-foreground` + `text-foreground` + sparsamt `text-amber-700` / `text-destructive` på kritiska rader. Inga emerald-gröna prickar/pills.
- **Bakgrund**: en enda subtil `bg-muted/30` på hela `<td colSpan>`, inga inre kort.
- **Höjd**: cap till `max-h-[220px]` per kolumn med scroll, så raden aldrig tar mer än ~250px höjd totalt.

### Resultat

```text
NAMN                BESKRIVNING       PLATS    KLOCKA   VARAKTIGHET
─────────────────────────────────────────────────────────────────
Aleksejs Dolgovs    > Dagen startade  …        06:51
                    > FA Warehouse    …        06:51–19:53  12h 2m
                    > Pågår …         …        —            12h 2m
┌─ Aleksejs Dolgovs · Onsdag 29 apr ────────────────────────────┐
│ HÄNDELSELOGG │ TOLKNING      │ ÅTGÄRDSFÖRSLAG │ NOTISER & SVAR │
│ 06:51 Start  │ Lager-tagg    │ Flytta rapport │ Inga notiser   │
│ 06:51 Ankom  │ men på FA…    │ till FA Ware…  │                │
│ 08:38 Glapp  │ 9h 11m på FA  │ Verifiera rast │                │
│ …            │               │                │                │
└───────────────────────────────────────────────────────────────┘
═══════════════════════════════════════════════════════════════ (tjock divider)
Nana Yaw Antwi      > Dagen startade  …        09:47
                    > …
┌─ Nana Yaw Antwi · Onsdag 29 apr ──────────────────────────────┐
│ …
```

## Tekniska ändringar

**`src/components/staff/StaffTimeReportsTable.tsx`**
- Flytta `<StaffDaySummaryRow>`-fragmentet (rad 308–322) till efter namnraden `</tr>` (efter rad 391).
- Beräkna `isLastForStaff` per rad i `rows.map` (jämför `r.staffId` med nästa rads).
- Ändra `border-t-2 border-t-border` → `border-t-4 border-t-primary/20` för tydligare person-gräns.

**`src/components/staff/StaffDaySummaryRow.tsx`**
- Ta bort `Pill`-komponenten och alla KPI-pills i headern.
- Ersätt 4-`CompactCard`-griden med en enda `<div className="grid grid-cols-4 divide-x divide-border/40 bg-muted/30 rounded-md">` utan inre borders.
- Ersätt färgade `SEV_DOT`/`SEV_PILL` med dämpad palett: bara amber/destructive på warning/critical, info & success blir `text-muted-foreground`.
- `max-h-[220px]` per kolumn-innehåll med `overflow-y-auto`.
- Header: bara `{staffName} · {datum}` i `text-xs text-muted-foreground`.

Inga ändringar i `dayEventLog.ts` eller hooks — bara ren UI-fix.
