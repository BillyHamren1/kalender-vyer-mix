## Vad som faktiskt är fel

Rapporterna SER olika ut för att UI har växt fram i lager — header, badges, journal-rader och korrigeringar har var sitt regelverk. När datatillståndet skiftar (pågående / signal tappad / saknar arbetsdag / auto-skapad / okänt projekt) tar olika kodvägar över och ritar olika kombinationer av rubriker, pillar och sektioner.

Konkret från dina fem skärmdumpar:

| Person | Header-pill | Topp-banner | Råvy/kompakt? | Status-badges som dyker upp |
|---|---|---|---|---|
| Billy | "Pågående arbetsdag" + "(omräknad)" + "EXKLUDERADE (4)" | — | kompakt | VISTELSE / GRANSKA / MÖJLIG / TIMER SAKNAS |
| (rad 2) | — | — | kompakt | VISTELSE / RESA / OPLANERAD / MÖJLIG / TIMER AKTIV |
| Kristaps | "Pågående arbetsdag" + "Planerad: Team 1" | "PÅ PROJEKT — ingen timer registrerad" | rådata-vy | PÅ PROJEKT / PÅ PROJEKT NU / Oplanerat / Saknar arbetsdag |
| Armands | "Signal tappad" | "Arbetsdag auto-skapad från 07:57" | kompakt | OPLANERAD / PÅ PROJEKT / TIMER AKTIV |
| Elvijs | "Saknar arbetsdag" + "Signal tappad" | "Arbetsdag auto-skapad från 07:57" | kompakt | GRANSKA / TIMER SAKNAS / TIMER SAKNAS |

Inga av dessa är trasig data — det är samma motor som producerar dem. Problemet är att rad-skalet inte normaliserar vyn:

1. **Header-pillen** beräknas i `deriveStatus()` (ActualDayPanel.tsx 168–209) med 9 olika returvärden som renderas som olika sorters chips på olika ställen runt namnet.
2. **Topp-bannern** ("PÅ PROJEKT — ingen timer", "Arbetsdag auto-skapad", osv.) ritas separat från header-pillen och kan dyka upp samtidigt eller saknas.
3. **Vy-läget** växlar mellan kompakt journal och rådata-vy beroende på state (Kristaps får rådata p.g.a. saknar arbetsdag).
4. **Badge-vokabulären** i `DayBlockTimelineView.tsx` 549–562 stoppar in upp till 5 badges per rad utan prioritet, så vissa rader visar 4 badges, andra 1.
5. **"Exkluderade händelser"-bannern** dyker upp högst upp för Billy men längst ner för andra.

## Förslag

Bygg en gemensam **DayReportShell** som varje rapportrad går igenom. Den ska producera samma sektioner i samma ordning för ALLA tillstånd:

```text
┌─ DayReportShell ─────────────────────────────────────────┐
│ [Namn]  [EN status-pill]  [Planerad: Team X om finns]    │
│ Datum · Arbetsdag-tid · Lönegrundande                    │
├──────────────────────────────────────────────────────────┤
│ [Topp-banner — MAX 1, hierarkisk]                        │
│   • Signal tappad (högst prio)                           │
│   • Auto-skapad arbetsdag                                │
│   • På projekt utan timer                                │
│   • Saknar arbetsdag                                     │
│   • (inget — om allt är OK)                              │
├──────────────────────────────────────────────────────────┤
│ DAGENS FAKTISKA HÄNDELSER  [▸ Visa alla händelser]       │
│   Alltid kompakt-vy som default. Rådata bara via toggle. │
│   Varje rad: TID · IKON · PLATS · EN status-badge        │
├──────────────────────────────────────────────────────────┤
│ EXKLUDERADE HÄNDELSER (n)  — alltid här om n>0           │
├──────────────────────────────────────────────────────────┤
│ FÖRESLAGNA KORRIGERINGAR                                 │
├──────────────────────────────────────────────────────────┤
│ NUVARANDE SPARAD RAPPORT                                 │
└──────────────────────────────────────────────────────────┘
```

### Konkreta ändringar

1. **Reducera `deriveStatus()` till 5 statusar** (ActualDayPanel.tsx 168–209): `ok` · `ongoing` · `signal_lost` · `auto_repaired` · `needs_review`. Allt annat (planned_only, missing_report, missing_strong_evidence, pre_workday) blir topp-banners istället för pillar.

2. **En topp-banner-komponent med prioritetslista** — välj högst prioriterade. Idag ritas "Pågående arbetsdag" + "(omräknad)" + "EXKLUDERADE" + "På projekt utan timer" som separata block utan ordning.

3. **Låsa journal-vyn till kompakt som default**, även när `workday` saknas. Idag växlar Kristaps automatiskt till rådata-vy vilket gör hans rapport oigenkännlig från de andras. Toggla med "Visa rådata" i hörnet — alltid synlig, alltid samma plats.

4. **En badge per rad i journalen** (DayBlockTimelineView.tsx 549–567). Idag pushas upp till 5 badges. Inför prioritet:
   - `TIMER AKTIV` > `TIMER SAKNAS` > `GRANSKA` > `OPLANERAD` > strength-default
   - Övriga badges flyttas in i expand-vyn.

5. **Flytta "EXKLUDERADE HÄNDELSER" till fast position** under journalen istället för ovanför (Billy har den ovanför, andra under).

6. **Enhetlig "Okänt projekt"-rendering**: Billys rader 09:22 och 11:37 visar lång subtitle "Okänt projekt – sparas som övrigt · närmsta: 2604-96 (275 m)". Korta ner till `Okänt projekt` + ikon med tooltip för detaljer. Detta är samma data som idag bara visas på vissa rader.

### Tekniska detaljer

- Filer som ändras:
  - `src/components/staff/ActualDayPanel.tsx` — slå ihop header + topp-banners till en `DayReportShell`-komponent. Reducera `deriveStatus`.
  - `src/components/staff/DayBlockTimelineView.tsx` — prioritera badges, max 1 per rad, korta subtitles.
  - Ny: `src/components/staff/DayReportTopBanner.tsx` — väljer högst prioriterade banner från model-state.
- Ingen ändring i datalogik (`actualStaffDayModel`, `dayBlockTimeline`, edge functions). Allt detta är ren rendering.
- Skydd: contract-test som verifierar att samma `ActualStaffDayModel` alltid renderar samma sektionsordning oavsett state.

### Ej i scope

- Ingen ändring i hur tider beräknas, hur GPS klassas eller hur korrigeringsförslag genereras. Detta är ENBART visuell normalisering.
- Anomalier som "Signal tappad" / "Saknar arbetsdag" finns kvar — de bara presenteras i samma slot istället för slumpmässigt runt header.

Vill du att jag kör?