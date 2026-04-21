

## Visa alla in/utloggningar med live-timer i tidrapportöversikten

### Problem
På `/staff-management/time-reports` listas idag bara ETT samlingsnamn ("Lager") per person, även om hen växlat mellan flera platser/jobb under dagen. Man ser inte:
- Vart hen är **just nu**
- Tidigare in/ut-händelser i ordning
- En live-räknande timer för pågående pass

### Lösning
Bygg om varje rad i `StaffTimeReportsList` så den visar en **kronologisk tidslinje** av dagens händelser per person, med pågående passet **överst** och en sekundräknande live-timer.

### Datakällor (per dag, per personal) — sammanslås till en tidslinje
Hämtas redan i `StaffTimeReports.tsx`, men måste exponeras som **enskilda segment**, inte aggregeras bort:

| Källa | Segment |
|---|---|
| `location_time_entries` | "Lager" / fast plats — ett segment per rad (entered_at → exited_at, eller pågående) |
| `time_reports` (booking) | "Kund X" — ett segment per rad |
| `travel_time_logs` | "Resa → Y" — ett segment per rad |

Varje segment: `{ id, label, kind: 'location'|'booking'|'travel', start, end|null, isOpen, hours }`.

### UI-design per personalrad

```text
┌──────────────────────────────────────────────────────────────┐
│ 🟠 Jānis Puriņš  [Pågående]                       2h 44m     │
│                                                  06:58 – pågår│
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ● NU: Holmträskvägen 19    08:24 → 00:41:23  (live) ⏱   │ │  ← pulserar
│ │ ─ Resa → Holmträskvägen    07:15 → 08:23      1h 8m      │ │
│ │ ─ Lager                    06:58 → 07:15      17m        │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- **Översta rad** = pågående segment, orange pulserande prick, live HH:MM:SS som tickar varje sekund.
- **Övriga** sorteras nyast → äldst (omvänd kronologi).
- Varje rad visar: ikon (📍 lager / 🏗 jobb / 🚗 resa), label, start–slut, total tid.

### Live-timer
- Ny liten komponent `<LiveDuration startedAt={Date} />` som använder `useEffect` + `setInterval(1000)` för att rendera `HH:MM:SS` sedan start. En enda timer per öppet segment (vanligtvis 0–1 per person).
- Pausas automatiskt när tabben inte är synlig (`document.visibilityState`).

### Sortering av personlistan
Behåll: pågående överst, sedan alfabetiskt. Det stämmer redan.

### Filer som ändras
- `src/pages/StaffTimeReports.tsx` — bygg `segments[]` per staff istället för (eller utöver) `projects` aggregatet. Behåll `total_hours` etc.
- `src/components/staff/StaffTimeReportsList.tsx` — rendera segmentlistan; pågående överst med live-timer.
- **Ny**: `src/components/staff/LiveDuration.tsx` — sekundräknande HH:MM:SS-komponent.
- Lägg till realtime-prenumeration på `location_time_entries`, `time_reports`, `travel_time_logs` (för dagens datum) så att nya in/utloggningar dyker upp utan att man behöver ladda om — använd den befintliga `useRealtimeInvalidation`-mönstret som finns i projektet.

### Förväntat resultat
- Du ser direkt på listan att Jānis just nu står på **Holmträskvägen** (live-tickar), och att han tidigare varit på Lager + rest dit.
- Raivis visar Lager 06:57→07:15, Resa, och **NU: Holmträskvägen** (live).
- Inget "Lager Lager" utan ordning — alla händelser i tydlig kronologi.

