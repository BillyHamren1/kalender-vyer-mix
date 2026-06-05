# Snygga till veckorapport-dagraderna

Mål: varje dag i `StaffPayrollReportSheet` ska visa raka, linjerade rader där Aktivitet, Start, Slut och Tim hör ihop på exakt samma höjd, plus tydlig separation mellan dagar. Inga datakällor eller business-regler ändras — bara presentation av `StaffPayrollReportDayRow`.

## Vad som är trasigt idag

I `StaffPayrollReportDayRow.tsx` renderas dagar med:

```text
[Datum] [Aktivitet (stack)] [Start (stack)] [Slut (stack)] [Tim (stack)] [Status]
```

Varje kolumns interna stack räknas oberoende. När en aktivitetsrad får ett "Belastar:"-chip eller "→ from → to"-text blir den ~28px hög, medan motsvarande Start/Slut/Tim-rad är ~16px. Resultatet: tiderna glider ur led mot aktiviteten (syns tydligt för Ons 3 juni och Tors 4 juni i screenshot).

Dessutom skiljs dagar bara av en tunn `border-b border-border/40` mellan rader — när en dag har 10 aktivitetsrader smälter de ihop med nästa dag.

## Lösning

Strukturera om dagraden så att varje aktivitetsrad är en egen **sub-grid-row** som spänner Aktivitet+Start+Slut+Tim. Då tvingas alla fyra cellerna till samma höjd per aktivitet.

### Konkreta ändringar i `StaffPayrollReportDayRow.tsx`

1. Behåll yttre 6-kolumnsgrid endast för headern. Inuti varje dag, rendera istället en inre grid:
   ```text
   grid-cols-[minmax(0,1fr)_60px_60px_64px]
   ```
   och en rad per aktivitet. Datum-cellen ligger i den yttre layouten och spänner alla inre rader (`row-span`/sticky-top inom dagblocket).

2. Lyfta datum + status ur den yttre 6-kolumns-flat-griden och bygga dagen som ett "dagblock" med tre regioner:
   - vänster: `Datum` (sticky-top inom blocket, font-semibold)
   - mitten: inre grid med aktivitetsrader (Aktivitet | Start | Slut | Tim) — varje rad `items-center` så chip och tid centreras mot varandra
   - höger: status/actions (sticky-top inom blocket)

3. Per aktivitetsrad: lägg `min-h-[28px] items-center` så att rader utan chip får samma höjd som rader med chip → raka horisontella linjer.

4. Totalsumman för dagen (när det finns flera aktivitetsrader) flyttas till en egen separator-rad längst ner i dagblocket: tunn `border-t`, högerställd `Σ 12:05` i Tim-kolumnen.

5. Dag-separation: byt den per-rad `border-b border-border/40` mot:
   - **inga** borders mellan aktivitetsrader inom samma dag
   - tydlig `border-b border-border` + lite `pb-2 mb-0` mellan dagblock
   - svag zebra-bg (`even:bg-muted/20`) på dagblock-nivå, inte på radnivå

6. Justera headern (rad 168 i `StaffPayrollReportSheet.tsx`) till samma yttre layout: `grid-cols-[112px_minmax(0,1fr)_60px_60px_64px_minmax(176px,220px)]` förblir, men dag-blocket inuti bygger sin egen inre 4-kolumns sub-grid där bredderna matchar 60/60/64 exakt så headern fortfarande linjerar mot dagarnas tid-kolumner.

7. Travel-badge ("Belastar: …") flyttas till slutet av aktivitetsraden med `ml-auto`-fallback bortkopplad — den ska ligga **efter** label men inte tvinga tid-cellerna att växa, eftersom hela raden nu är en grid-row med fast minhöjd.

### Filer som rörs

- `src/components/staff-time-approvals/StaffPayrollReportDayRow.tsx` — full omstrukturering av render-trädet (samma props, samma data).
- `src/components/staff-time-approvals/StaffPayrollReportSheet.tsx` — minimal: säkerställ att header-grid och dagblock-grid har samma yttre kolumnbredder, och ta bort `overflow-hidden` om det klipper sub-griden.

### Vad som INTE ändras

- `useStaffTimeWeekMatrix`, `ReportProjectDayPanel` (högerpanelen), attest-knappar, datastruktur, status-vokabulär, badges/chip-utseende, print-CSS.

## Verifiering

1. Öppna `/staff-management/time?tab=lon`, vecka 23 · 2026 (samma som screenshot).
2. Kontrollera att för Ons 3 juni ligger "08:53 / 14:25 / 5:32" exakt mittemot raden "Belastar: Westers Catering …" och att alla tider linjerar vertikalt rakt nedåt utan glapp.
3. Kontrollera att dag-skiftet Ons→Tors har en tydligare avskiljare än aktivitetsraderna inom dagen.
4. Kontrollera tom dag (Mån 1 juni) fortfarande visar "—" och "Ingen rapport".
5. Kör `bunx vitest run src/components/staff-time-approvals` för att fånga ev. snapshot-regressioner.
