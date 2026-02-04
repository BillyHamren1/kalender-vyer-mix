
# Plan: Korrigera Avvikelselogik för Ekonomisystemet

## Sammanfattning
Avvikelsen (Deviation) beräknas idag som `Utfall - Budget`, vilket visar positiva värden när man spenderar MER än budget. Den korrekta logiken bör vara `Budget - Utfall`:

- **Positiv avvikelse (+)** = under budget = BRA (grönt)
- **Negativ avvikelse (-)** = över budget = DÅLIGT (rött)

## Vad som ändras

### Kärnlogik - Avvikelseberäkning
**Fil:** `src/services/projectEconomyService.ts`

Ändra beräkningen från:
```javascript
// FEL (nuvarande)
const staffDeviation = staffActual - staffBudget;
const totalDeviation = totalActual - totalBudget;
```

Till:
```javascript
// RÄTT (ny logik)
const staffDeviation = staffBudget - staffActual;
const totalDeviation = totalBudget - totalActual;
```

### Statuslogik - Färger och Ikoner
**Fil:** `src/types/projectEconomy.ts`

Uppdatera `getDeviationStatus` för att baseras på avvikelsens tecken:
- Positiv eller noll = OK (grön)
- Liten negativ (0 till -10% av budget) = Warning (gul)
- Stor negativ (>-10% av budget) = Danger (röd)

### Visningslogik - EconomySummaryCard
**Fil:** `src/components/project/EconomySummaryCard.tsx`

- Visa minus/plus korrekt baserat på ny logik
- Grön check för positiv/noll avvikelse
- Varning för negativ avvikelse

### Procentberäkning
Ändra från "användning av budget" (Actual/Budget × 100) till "avvikelse från budget":
- 0% = exakt på budget
- +10% = 10% under budget (bra)
- -10% = 10% över budget (dåligt)

## Teknisk Implementation

### Steg 1: Uppdatera beräkningslogik
```typescript
// src/services/projectEconomyService.ts

// Staff deviation: positive = under budget (good)
const staffDeviation = staffBudget - staffActual;
const staffDeviationPercent = staffBudget > 0 
  ? ((staffBudget - staffActual) / staffBudget) * 100 
  : (staffActual > 0 ? -100 : 0);

// Total deviation: positive = under budget (good)  
const totalDeviation = totalBudget - totalActual;
const totalDeviationPercent = totalBudget > 0 
  ? ((totalBudget - totalActual) / totalBudget) * 100 
  : (totalActual > 0 ? -100 : 0);
```

### Steg 2: Uppdatera statuslogik
```typescript
// src/types/projectEconomy.ts

export const getDeviationStatus = (deviationPercent: number): DeviationStatus => {
  // Positive = under budget, negative = over budget
  if (deviationPercent >= 0) return 'ok';
  if (deviationPercent >= -10) return 'warning';
  return 'danger';
};
```

### Steg 3: Uppdatera UI-visning
```typescript
// src/components/project/EconomySummaryCard.tsx

// Show correct sign and color
<p className={`text-2xl font-bold ${getDeviationColor(status)}`}>
  {summary.totalDeviation >= 0 ? '+' : ''}{formatCurrency(summary.totalDeviation)}
</p>

// Progress bar: show how much of budget is used
const budgetUsagePercent = summary.totalBudget > 0 
  ? (summary.totalActual / summary.totalBudget) * 100 
  : 0;
```

## Filer som påverkas
1. `src/services/projectEconomyService.ts` - Ny beräkningslogik
2. `src/types/projectEconomy.ts` - Ny statuslogik
3. `src/components/project/EconomySummaryCard.tsx` - Uppdaterad visning

## Förväntat resultat
Med Budget = 0 kr och Utfall = 2 800 kr:
- **Före:** Avvikelse visar "+2 800 kr" med grön check
- **Efter:** Avvikelse visar "-2 800 kr" med röd varning
