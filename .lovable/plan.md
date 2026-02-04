

# Plan: Fixa Lager-Ganttschemat med korrekt logik

## Sammanfattning

Ganttschemat för packningsprojekt (`PackingGanttChart.tsx`) använder fel logik. Det är kopierat från projekthanteringens logik med 7-dagars perioder och nyckelordssökning ("feedback", "stängning"), men lagersystemet har en helt annan struktur baserad på bokningens datum (riggdag, eventdag, rigdowndag).

---

## Vad som är fel

### Nuvarande (felaktig) logik:
```text
┌─────────────────────────────────────────────────────────────┐
│  Titeln innehåller "feedback"? → 6 dagar tillbaka från deadline │
│  Titeln innehåller "stängning"? → 7 dagar tillbaka            │
│  Annars: 7 dagar tillbaka från deadline                      │
└─────────────────────────────────────────────────────────────┘
```
Detta fungerar inte för lagret eftersom uppgifterna baseras på specifika datum-offsets från bokningens rigg- och rigdowndatum.

### Korrekt lagerlogik (från import-bookings):
```text
Tidslinje baserad på bokningens datum:

     Rigg -4d     Rigg -2d    Rigg -1d      Rigg       Event      Rigdown    Rigdown +1d   Rigdown +2d
        │            │           │            │          │           │            │             │
   ┌────┴────┐   ┌───┴───┐   ┌───┴───┐    ┌───┴───┐            ┌───────┐    ┌────┴────┐    ┌────┴────┐
   │Packning │   │Packlista│   │Utrustning│  │Utleverans│         │Återlev│   │Inventering│  │Upppackning│
   │påbörjad │   │klar    │   │packad    │  │klar     │         │       │   │          │  │klar      │
   └─────────┘   └────────┘   └──────────┘  └─────────┘         └───────┘   └──────────┘  └──────────┘
```

---

## Teknisk lösning

### 1. Uppdatera bokning-fetch för att inkludera datum
**Fil:** `src/services/packingService.ts`

Utöka `fetchPacking()` för att även hämta `rigdaydate`, `eventdate` och `rigdowndate` från den kopplade bokningen.

### 2. Skicka bokningsdatum till Ganttschemat
**Fil:** `src/pages/PackingDetail.tsx`

Lägg till props för `rigdaydate`, `eventdate` och `rigdowndate` till `PackingGanttChart`.

### 3. Bygg om Gantt-logiken
**Fil:** `src/components/packing/PackingGanttChart.tsx`

Helt ny `calculateTaskDates()`-funktion:

- **Tar emot:** task-titel + bokningens datum
- **Mappar uppgiftstitlar till rätt datum-offset:**
  - "packning påbörjad" → Riggdag - 4 dagar
  - "packlista klar" → Riggdag - 2 dagar  
  - "utrustning packad" → Riggdag - 1 dag
  - "utleverans" → Riggdag
  - "inventering" → Rigdown + 1 dag
  - "upppackning klar" → Rigdown + 2 dagar
- **Fallback:** Om titeln inte matchar, använd uppgiftens deadline

### 4. Visuella förbättringar
- Lägg till milstolpar för Riggdag, Eventdag och Rigdowndag som vertikala linjer
- Använd lager-färgerna (lila för packning, blå för leverans, etc.)
- Matcha stilen med `EstablishmentGanttChart` för konsistens

---

## Tekniska detaljer

### Ändrade typer
```typescript
interface PackingGanttChartProps {
  tasks: PackingTask[];
  rigDate?: string | null;       // Ny
  eventDate?: string | null;     // Ny  
  rigdownDate?: string | null;   // Ny
  onTaskClick?: (task: PackingTask) => void;
}
```

### Ny datumlogik (pseudo-kod)
```typescript
function calculateWarehouseTaskDates(task: PackingTask, rigDate: Date | null, rigdownDate: Date | null) {
  const title = task.title.toLowerCase();
  
  if (rigDate) {
    if (title.includes('packning påbörjad')) return { start: subDays(rigDate, 4), end: subDays(rigDate, 4) };
    if (title.includes('packlista')) return { start: subDays(rigDate, 2), end: subDays(rigDate, 2) };
    if (title.includes('utrustning')) return { start: subDays(rigDate, 1), end: subDays(rigDate, 1) };
    if (title.includes('utleverans')) return { start: rigDate, end: rigDate };
  }
  
  if (rigdownDate) {
    if (title.includes('inventering')) return { start: addDays(rigdownDate, 1), end: addDays(rigdownDate, 1) };
    if (title.includes('upppackning')) return { start: addDays(rigdownDate, 2), end: addDays(rigdownDate, 2) };
  }
  
  // Fallback: använd deadline
  return { start: task.deadline, end: task.deadline };
}
```

### Uppdaterad service
```typescript
// packingService.ts - utökad bokningsdata
.select('id, client, eventdate, rigdaydate, rigdowndate, deliveryaddress, ...')
```

---

## Berörda filer

| Fil | Ändring |
|-----|---------|
| `src/services/packingService.ts` | Lägg till `rigdaydate`, `rigdowndate` i booking-select |
| `src/types/packing.ts` | Utöka `PackingWithBooking.booking` med nya datum-fält |
| `src/pages/PackingDetail.tsx` | Skicka bokningsdatum till Ganttschemat |
| `src/components/packing/PackingGanttChart.tsx` | Ny datumlogik, milstolpar, färger |

---

## Resultat

Efter implementationen:
- Ganttschemat visar uppgifter på rätt dagar baserat på bokningens faktiska datum
- Milstolpar markerar Riggdag, Eventdag och Rigdowndag tydligt
- Konsistent stil med övriga Gantt-scheman i systemet
- Egen-skapade uppgifter faller tillbaka på sin deadline

