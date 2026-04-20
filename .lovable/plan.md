

## Visa datum direkt i Jobbkö-raden

### Vad som saknas idag
I jobbkö-raden (`OpsJobQueue.tsx`) syns bara klockslag (`HH:mm`) — inget datum. När jobbet ligger på en annan dag än idag, eller när rig/event/down ligger på olika dagar, måste man expandera och gå in i bokningen för att se datumet. Det ger ingen överblick.

Datafältet finns redan: `OpsJobQueueItem` har `eventDate`, `rigDate`, `startTime`, `endTime` (bara `rigDownDate` saknas i typen — läggs till).

### Vad jag bygger

**1. Visa datum + tid på huvudraden**
Ersätter dagens smala `HH:mm`-kolumn med en kompakt datum/tid-stapel:

```text
┌─────────────────────────────────────────────────────┐
│ ⚠  20/4  #2603-31R1 Westmans … 👥 0  Saknar personal│
│    08:00                                             │
└─────────────────────────────────────────────────────┘
```

- Rad 1: `dd/M` (t.ex. `20/4`) — fet, mindre stil
- Rad 2: `HH:mm` — monospace, dämpad
- Om datumet är **idag** → visa "Idag" istället för datum (kortare, tydligare).
- Om datumet är **imorgon** → "Imorgon".
- Om jobbet sträcker sig över flera dagar (rig ≠ event ≠ down) → visa intervall `20/4–22/4`.

**2. Datum-källa**
Använder första tillgängliga datum i ordningen: `rigDate || eventDate || rigDownDate`. För intervallet beräknas `min/max` av alla tre fälten.

**3. Expanderad vy: visa hela schemat**
I expanderingen läggs en kompakt rad till:
```text
Etablering: 20/4 · Event: 21/4 · Avetablering: 22/4
```
Faser utan datum hoppas över. Detta ger full överblick utan att öppna jobbet.

**4. Lägg till `rigDownDate` i datakällan**
- `OpsJobQueueItem`: nytt fält `rigDownDate: string | null`
- `fetchOpsJobQueue`: hämta `rigdowndate` från bookings-select och inkludera i resultatet

### Berörda filer
- `src/services/opsControlService.ts` — lägg till `rigDownDate` i typ + hämta `rigdowndate`
- `src/components/ops-control/OpsJobQueue.tsx` — ny datum/tid-kolumn + datumrad i expanderingen

### Inte i denna ändring
- Ingen ändring av filtrering eller sortering
- Ingen ändring av övriga ops-control-vyer (timeline/karta)
- Ingen DB-/edge-funktion-ändring

### QA efter implementation
1. Öppna `/ops-control` → varje rad i Jobbkö visar datum (Idag/Imorgon/dd-M) + tid.
2. Jobb där rig och event är olika dagar → datumet visas som intervall `20/4–21/4`.
3. Expandera ett jobb → schemaraden visar Etablering/Event/Avetablering med rätt datum.
4. Jobb utan tider → datumet visas ändå, "—" där tiden saknas.

