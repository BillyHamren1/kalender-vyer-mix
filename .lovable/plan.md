
# Utokat Gantt-schema och fullstandig projekthistorik

## Del 1: Gantt-schemat visar alla uppgifter (inklusive administrativa)

Idag visar Gantt-schemat pa Projektvyn (`ProjectGanttChart`) bara uppgifter som har deadlines. Det etablerings-Gantt som visas pa bilden ar en separat komponent for fysiska logistiksteg.

### Andring
Uppdatera `ProjectGanttChart` sa att det visar **samtliga** uppgifter fran projektets checklista -- inklusive administrativa som "Transportbokning", "Offert skickad" etc. Uppgifter utan deadline far en beraknad position baserat pa skapad-datum och en standardlangd. Fargkodning baseras pa uppgiftskategori:

| Kategori | Farg | Matchningsregel |
|----------|------|-----------------|
| Transport | Bla | Titel innehaller "transport" |
| Material | Orange | Titel innehaller "material" eller "produkt" |
| Personal | Gron | Titel innehaller "personal" |
| Installation | Lila | Titel innehaller "montering" eller "installation" |
| Kontroll | Teal | Titel innehaller "kontroll" eller "slutkontroll" |
| Admin | Gra | Alla ovriga |

En legend visas langst ned (som i skarmbilden).

### Filer
- `src/components/project/ProjectGanttChart.tsx` -- Ny fargkategorisering, inkludera uppgifter utan deadline, uppdaterad legend

## Del 2: Fullstandig projekthistorik med detaljvy

### Problem idag
Aktivitetsloggen visar enradsbeskrivningar ("Transport bokad: Fordon X") men saknar:
- Detaljvy: man kan inte klicka och se *vad* som hande
- Mejlinnehall: att se det faktiska mejlet som skickades
- Partnersvar: vem svarade, nar, och vad de svarade
- Tidsstamplar for varje delsteg

### Losning: Expanderbar historikrad med detaljinnehall

Varje rad i aktivitetsloggen blir klickbar/expanderbar. Vid expandering visas:

**For `email_sent` / `email_snapshot`:**
- Mottagare (namn + e-post)
- Amnesrad
- Eventuellt meddelande
- Skickat-tidpunkt
- Mejlforhandsgranskning (bild fran `email_snapshot` om den finns)

**For `transport_added` / `transport_updated`:**
- Fordon och fordonstyp
- Transportdatum och tid
- Upphantningsadress
- Status (vantande, accepterad, nekad)

**For `transport_response` / `transport_declined`:**
- Partnerns namn
- Svar (Accepterad/Nekad)
- Svarstidpunkt
- Fordon

**For `task_completed`:**
- Uppgiftsnamn
- Vem som slutforde
- Nar

### Implementering

1. **Utoka metadata vid loggning** -- Nar aktiviteter loggas (i `useProjectDetail.tsx`), spara rikare metadata. Till exempel vid `email_sent`: spara `recipient_email`, `subject`, `assignment_id`. Vid `transport_response`: spara `vehicle_name`, `partner_name`, `response_type`.

2. **Expanderbar rad i `ProjectActivityLog`** -- Anvand Collapsible fran Radix for att visa/dolj detaljer. Klick pa en rad expanderar den och visar metadata formaterat i en kompakt detaljvy.

3. **Mejlforhandsgranskning inline** -- For `email_snapshot`-poster: visa mejlbilden direkt i den expanderade raden (redan delvis implementerat).

4. **Hamta kompletterande data vid behov** -- For transport-poster: hamta `transport_assignments` och `transport_email_log` och matcha mot `assignment_id` i metadata for att visa fullstandiga detaljer.

### Filer
- `src/components/project/ProjectActivityLog.tsx` -- Expanderbara rader med detaljinnehall per aktivitetstyp
- `src/hooks/useProjectDetail.tsx` -- Rikare metadata vid loggning av aktiviteter
- `src/services/projectActivityService.ts` -- Ev. ny funktion for att hamta transport-detaljer kopplat till en aktivitet

## Sammanfattning av filer

| Fil | Andring |
|-----|---------|
| `src/components/project/ProjectGanttChart.tsx` | Kategorifarger, inkludera alla uppgifter, legend |
| `src/components/project/ProjectActivityLog.tsx` | Expanderbara rader med rik detaljvy |
| `src/hooks/useProjectDetail.tsx` | Utokad metadata vid loggning |
| `src/services/projectActivityService.ts` | Hjalp-funktion for transportdetaljer |
