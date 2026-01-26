
# Plan: Gör Warehouse Dashboard Interaktiv

## Problemanalys
Dashboarden visar data men saknar arbetsflöden för att **utföra åtgärder**. Användaren måste kunna agera direkt från dashboarden utan att navigera bort.

---

## Del 1: Klickbara Stats-kort

### Nuvarande
Stats-korten (Kommande jobb, Aktiva packningar, Akuta packningar, Förfallna uppgifter) är endast visuella.

### Åtgärd
Gör varje stats-kort klickbart för att navigera till relevant vy:

| Kort | Navigerar till |
|------|----------------|
| Kommande jobb | `/warehouse/calendar` (lagerkalendern) |
| Aktiva packningar | `/warehouse/packing` (packningslistan) |
| Akuta packningar | `/warehouse/packing?filter=urgent` |
| Förfallna uppgifter | `/warehouse/packing?filter=overdue` |

### Ändringar
- **`WarehouseStatsRow.tsx`**: Lägg till `onClick` och `cursor-pointer` på varje kort
- Lägg till hover-effekt för visuell feedback

---

## Del 2: Skapa Packning från Dashboarden

### 2.1 Global "Skapa Packning"-knapp
Lägg till en knapp i headern:
```
[Lagerdashboard]                    [+ Ny packning] [Uppdatera]
```

### 2.2 Skapa Packning från 7-dagars-jobb
Lägg till en liten ikon/knapp på varje jobb-kort i tidslinjen:
- Om packning **inte finns**: Visa `+` ikon som öppnar `BookingProductsDialog`
- Om packning **finns**: Visa `📦` ikon som navigerar till packningen

### Ändringar
- **`WarehouseDashboard.tsx`**: Lägg till "Ny packning"-knapp och `CreatePackingWizard` state
- **`UpcomingJobsTimeline.tsx`**: 
  - Lägg till `onCreatePacking` callback
  - Visa status-ikon per jobb

---

## Del 3: Snabbåtgärder på Uppgifter

### Nuvarande
Man måste klicka in på packningen för att bocka av uppgifter.

### Åtgärd
Lägg till checkbox direkt på varje uppgift i "Uppgifter att åtgärda":

```
[x] Beställ material        | Imorgon
    Bröllop Skansen         | 28 jan
```

### Ändringar
- **`PackingTasksAttention.tsx`**: 
  - Lägg till `Checkbox` komponent
  - Implementera mutation för att markera uppgift som klar
  - Uppdatera listan efter bockad uppgift

---

## Del 4: Förbättra 7-dagars-tidslinjen

### Nuvarande
Klick på ett jobb navigerar till `/booking/{id}`.

### Åtgärd
Ändra klickbeteendet:
1. Öppna `BookingProductsDialog` istället för att navigera
2. Från dialogen kan man sedan välja "Visa bokning" eller "Skapa packning"

### Ändringar
- **`UpcomingJobsTimeline.tsx`**: 
  - Lägg till `onJobClick` callback istället för `navigate`
- **`WarehouseDashboard.tsx`**: 
  - Lägg till `BookingProductsDialog` state
  - Hantera klick från tidslinjen

---

## Teknisk Sammanfattning

### Nya Imports i WarehouseDashboard.tsx
```typescript
import { useState } from "react";
import { Plus } from "lucide-react";
import BookingProductsDialog from "@/components/Calendar/BookingProductsDialog";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
```

### Nya States
```typescript
const [showCreateWizard, setShowCreateWizard] = useState(false);
const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
const [showBookingDialog, setShowBookingDialog] = useState(false);
```

### Filer som ändras
| Fil | Ändringar |
|-----|-----------|
| `WarehouseDashboard.tsx` | + "Ny packning"-knapp, + Dialog-states, + Dialog-komponenter |
| `WarehouseStatsRow.tsx` | + onClick navigering på alla kort |
| `UpcomingJobsTimeline.tsx` | + onJobClick callback, + status-ikoner |
| `PackingTasksAttention.tsx` | + Checkbox med mutation för att bocka av uppgifter |

### Inga databasändringar krävs
All funktionalitet använder befintliga tabeller och endpoints.

---

## Resultat efter implementering

Användaren kan direkt från dashboarden:
1. Klicka på stats för att se relevanta listor
2. Skapa nya packningar via knapp i header
3. Klicka på ett kommande jobb och se produkter + skapa packning
4. Bocka av uppgifter utan att lämna dashboarden
5. Se tydligt vilka jobb som redan har packningar
