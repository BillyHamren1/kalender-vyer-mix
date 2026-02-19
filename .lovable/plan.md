
## Ny sida: Rapporterad tid / Utlägg

### Vad som ska byggas

En ny sida under Ekonomiöversikt som samlar alla tidrapporter och projektutlägg i en samlad kronologisk lista. Sidan ger en helhetsbild och möjliggör att godkänna tidrapporter direkt i listan — utan att behöva gå in på varje enskilt projekt.

### Sidans URL och menyplacering

- URL: `/economy/time-reports`
- Lägg till i Ekonomiöversikt-menyn i sidebaren: "Rapporterad tid / Utlägg"
- Route i `App.tsx`

### Datakällor

**Tidrapporter** (`time_reports`):
- Kopplat till `staff_members` (namn) och `bookings` → `projects` (projektnamn)
- Fält: datum, start/slut-tid, timmar, övertid, beskrivning, `approved`

**Utlägg** (`project_purchases`):
- Kopplat till `projects` (projektnamn)
- Fält: datum (`purchase_date`), belopp (`amount`), beskrivning, leverantör, kategori

### Layout och design

Sidan har:
1. **Filtreringsfält** - filtrering per typ (Alla / Tidrapporter / Utlägg), datumperiod och söktext
2. **Samlad tabell** sorterad i tidsordning (nyaste överst) med kolumner:

| Datum | Typ | Personal / Leverantör | Projekt | Detalj | Belopp / Timmar | Status |
|-------|-----|----------------------|---------|--------|-----------------|--------|

3. **Statuskolumn** (referensbilden):
   - Grön bock-ikon = Godkänd (tidrapport)
   - Amber klock-ikon + "Väntar" text = Ej godkänd (klickbar för att godkänna)
   - Grå streck = Utlägg (kräver ej godkännande)

### Godkännandelogik

- Klick på "Väntar"-badge i tidrapportrad → godkänner den enskilda rapporten
- Knapp "Godkänn alla väntande" i sidhuvudet
- Invaliderar `pending-time-reports` och `economy-overview` queries

### Tekniska filer att skapa/ändra

| Fil | Åtgärd |
|-----|--------|
| `src/pages/EconomyTimeReports.tsx` | Ny sida |
| `src/App.tsx` | Ny route `/economy/time-reports` |
| `src/components/Sidebar3D.tsx` | Ny menypost under Ekonomiöversikt |

### Datastruktur i sidan

```typescript
type ReportEntry =
  | { type: 'time'; id: string; date: string; staffName: string; projectName: string;
      startTime: string | null; endTime: string | null; hours: number;
      overtimeHours: number; description: string | null; approved: boolean; }
  | { type: 'purchase'; id: string; date: string; supplier: string | null;
      projectName: string; description: string; amount: number; category: string | null; }
```

Båda typerna kombineras och sorteras på `date` (fallback till `created_at`).

### Query-logik

```typescript
// time_reports: hämta med staff_members + bookings (inkl. projekt via assigned_project_id)
// project_purchases: hämta med projects

// Merge och sortera: 
const entries = [...timeEntries, ...purchaseEntries]
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
```

### Sammanfattning

Inga databasmigrationer krävs — all data finns redan. Tre filer berörs: en ny sida, en ny route och en uppdaterad sidebar-meny.
