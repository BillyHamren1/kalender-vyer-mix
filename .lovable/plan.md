
# Plan: Fixa Godkännande av Tidrapporter

## Sammanfattning
UI:t uppdateras inte efter godkännande pga tre buggar: fel ID skickas till Supabase-uppdateringen, fel query key invalideras, och aggregeringen tappar individuella rapport-ID:n.

## Ändringar

### 1. Uppdatera Service för att behålla rapport-ID:n
**Fil:** `src/services/projectEconomyService.ts`

Utöka `fetchProjectTimeReports` för att returnera en lista med individuella rapport-ID:n för varje personal:

```typescript
export interface StaffTimeReport {
  staff_id: string;
  staff_name: string;
  total_hours: number;
  overtime_hours: number;
  hourly_rate: number;
  overtime_rate: number;
  total_cost: number;
  approved: boolean;
  report_ids: string[];  // Lägg till lista med alla rapport-ID:n
}
```

### 2. Uppdatera typdefinitionen
**Fil:** `src/types/projectEconomy.ts`

Lägg till `report_ids: string[]` i `StaffTimeReport`-interfacet.

### 3. Fixa StaffCostTable för korrekt godkännande
**Fil:** `src/components/project/StaffCostTable.tsx`

**Problem att åtgärda:**
- Ändra `handleApprove` så den godkänner alla rapporter för en personal via `report_ids`
- Invalidera rätt query key: `['project-time-reports', bookingId]`
- Invänta invalidering före toast med `await queryClient.invalidateQueries()`
- Lägg till `bookingId` som prop för korrekt invalidering

### 4. Uppdatera komponenten som använder StaffCostTable
**Fil:** `src/components/project/ProjectEconomyTab.tsx` (eller liknande)

Skicka `bookingId` till `StaffCostTable` så att rätt query key kan invalideras.

## Teknisk implementation

### Steg 1: Typ-uppdatering
```typescript
// src/types/projectEconomy.ts
export interface StaffTimeReport {
  staff_id: string;
  staff_name: string;
  total_hours: number;
  overtime_hours: number;
  hourly_rate: number;
  overtime_rate: number;
  total_cost: number;
  approved: boolean;
  report_ids: string[];  // NY: lista med rapport-ID för godkännande
}
```

### Steg 2: Service-uppdatering
```typescript
// src/services/projectEconomyService.ts - fetchProjectTimeReports
// Lägg till 'id' i SELECT och samla i report_ids array

const { data, error } = await supabase
  .from('time_reports')
  .select(`
    id,  // NYTT
    staff_id,
    hours_worked,
    overtime_hours,
    approved,
    staff_members!inner(name, hourly_rate, overtime_rate)
  `)
  .eq('booking_id', bookingId);

// Vid aggregering, samla alla id:n
if (existing) {
  existing.report_ids.push(report.id);
  // ... resten av logiken
} else {
  staffMap.set(staffId, {
    // ... befintliga fält
    report_ids: [report.id]
  });
}
```

### Steg 3: Komponent-uppdatering
```typescript
// src/components/project/StaffCostTable.tsx

interface StaffCostTableProps {
  timeReports: StaffTimeReport[];
  summary: EconomySummary;
  bookingId: string | null;  // NY prop
  onOpenBudgetSettings: () => void;
}

const handleApprove = async (reportIds: string[], staffName: string) => {
  try {
    // Godkänn ALLA rapporter för denna personal
    const { error } = await supabase
      .from('time_reports')
      .update({
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: 'Projektledare'
      })
      .in('id', reportIds);  // Använd .in() för flera ID:n

    if (error) throw error;
    
    // Invalidera RÄTT query key och invänta
    await queryClient.invalidateQueries({ 
      queryKey: ['project-time-reports', bookingId] 
    });
    await queryClient.invalidateQueries({ 
      queryKey: ['pending-time-reports'] 
    });
    
    toast.success(`Tidrapport för ${staffName} godkänd`);
  } catch (error) {
    console.error('Error approving time report:', error);
    toast.error('Kunde inte godkänna tidrapporten');
  }
};

// I render, skicka report_ids istället för staff_id
onClick={() => handleApprove(report.report_ids, report.staff_name)}
```

## Filer som påverkas
1. `src/types/projectEconomy.ts` - Lägg till `report_ids`
2. `src/services/projectEconomyService.ts` - Hämta och aggregera rapport-ID:n
3. `src/components/project/StaffCostTable.tsx` - Fixa approve-logik och query keys
4. `src/components/project/ProjectEconomyTab.tsx` - Skicka bookingId som prop

## Förväntat resultat
- Godkännande uppdaterar korrekt alla tidrapporter för den valda personalen
- UI:t uppdateras omedelbart efter godkännande
- Toasten visas efter att UI:t har uppdaterats
