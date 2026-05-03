## Mål
Ersätta dagens kort-grid i "Planerad personal" med en kompakt **Gantt-vy per dag** där:
- Vänster kolumn = personalnamn (sticky)
- Övre rad = tidslinje (timmar)
- Varje persons projekt ritas som färgade block längs tidslinjen enligt planerad start/slut

## Layout

```text
                08  09  10  11  12  13  14  15  16  17  18
─────────────┬──────────────────────────────────────────────
Aleksejs ●   │      [▓ 2603-156 Westers ▓][▓ 2604-97 Craft ▓]
Joel ●       │  [▓ 2602-15 Tiomila ▓][▓▓ 2604-98 SP Office ▓▓]
Ivars ●      │            [▓▓▓▓ 2603-156 Westers ▓▓▓▓]  Pågår
Kristaps ●   │   [▓ 2604-97 Craft ▓]                    Pågår
Markuss ●    │  [▓▓ 2602-15 Tiomila ▓▓]                 ✓ Rapporterat
```

- Vänster kolumn ~160px sticky (namn + färgprick + statusprick).
- Tidslinjeområde scrollbar horisontellt vid behov; defaultintervall = min(planerad start) → max(planerad slut) över alla rader, klampat till hel timme.
- Varje block visar `bookingNumber · client` (truncate). Tooltip med fullständigt namn, roll, start–slut, fas (rigg/event/nedrigg).
- Färg på block = personens färg (svag fyllning) + vänsterkant i fasfärg (rigg/event/nedrigg).
- Status-pill (Ej startat / Pågår / Rapporterat / Sen start) flyttas till slutet av raden, kompakt.
- "Nu"-linje (vertikal) ritas om dagen = idag.
- Rader sorteras: avvikelser först (ej startat, sen), sedan namn.

## Tekniska ändringar

**`src/components/staff/PlannedStaffPanel.tsx`** — skrivs om till timeline:
1. Utöka query: hämta även `rig_end_time`, `event_end_time`, `rigdown_end_time` så block får både start och slut (fallback 1h om end saknas).
2. Berika `PlannedJob` med `phase: 'rigg'|'event'|'nedrigg'`, `startDate`, `endDate`.
3. Räkna ut `dayWindow = { startHour, endHour }` från min/max över alla jobb (default 06–22, expanderar vid behov).
4. Ny intern komponent `<TimelineRow row hourPx windowStart windowEnd />`:
   - Container: `relative h-10` med horisontellt rutnät (1px border varje timme via background-image linear-gradient).
   - Varje block: `absolute` med `left = (jobStart - windowStart)/3600 * hourPx`, `width = duration/3600 * hourPx`, min-width 60px.
   - Overlap: om två jobb krockar i tid, stapla i två sub-rader (auto höjd).
5. Header-rad med timmarna ritas en gång ovanför raderna, sticky top.
6. Behåll status-beräkning (`getStatus`) men rendera den som liten badge längst till höger på raden.
7. Behåll `onSelectStaff`-klick (klick var som helst på raden).

**Inga andra filer behöver röras** — komponenten används redan från admin-vyn med samma props.

## Edge cases
- Jobb utan tider: visas som grått pill längst till vänster ("Tid saknas") — ingen position på tidslinjen.
- Jobb som spänner över flera dagar: klampas till dagens fönster.
- Tom dag: returnerar `null` som idag.
- Mobil (<768px): faller tillbaka till befintlig kompakt listvy (en kolumn) eftersom Gantt blir oläsbar smalt — behåller status-pill + jobblista som textrader.

## Tester (manuell QA)
- Öppna admin Tidrapporter, dag = idag → bekräfta att 5 personer från screenshoten visas som rader, med korrekt block-position, och att "Nu"-linjen är synlig.
- Hovra ett block → tooltip visar bokningsnr, kund, fas, start–slut.
- Klicka på rad → öppnar staffens rapportdetalj som tidigare.