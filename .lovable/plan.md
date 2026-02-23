

# Ekonomisk stängning baserad på leverantörsfakturor

## Sammanfattning
Projektets ekonomiska status (ÖPPEN/STÄNGD) i ekonomiöversikten ska avgöras av om **alla leverantörsfakturor** kopplade till projektet har markerats som "Slutgiltig" (`is_final_link = true`). Inga ändringar behövs på inköp eller vanliga fakturor.

## Vad ändras

### 1. Hämta leverantörsfaktura-status per projekt (`useEconomyOverviewData.ts`)
- I `fetchProjectEconomyFromProxy` returneras redan `supplierInvoices` men sparas inte i `ProjectWithEconomy`
- Utöka `ProjectWithEconomy`-interfacet med ett nytt fält: `economyClosed: boolean`
- Beräkna `economyClosed` baserat på: alla leverantörsfakturor har `is_final_link === true` (och minst en faktura finns)
- Ett projekt utan leverantörsfakturor räknas som ÖPPEN

### 2. Uppdatera ÖPPEN/STÄNGD-logiken (`EconomyOverview.tsx`)
- Ta bort `isProjectClosed(status)` som jämför mot `completed`/`delivered`
- Ersätt med `project.economyClosed` direkt från datan
- Behåll visuell stil (opacity-60 för stängda, badge-färger)

## Tekniska detaljer

**Filer som ändras:**

| Fil | Ändring |
|-----|---------|
| `src/hooks/useEconomyOverviewData.ts` | Lägg till `economyClosed` i `ProjectWithEconomy`. Beräkna värdet från `supplierInvoices` -- true om alla har `is_final_link === true` och det finns minst en. |
| `src/pages/EconomyOverview.tsx` | Byt `isProjectClosed(project.status)` mot `project.economyClosed`. Ta bort `isProjectClosed`-funktionen. |

**Ingen databasmigrering krävs** -- `is_final_link` finns redan på leverantörsfakturorna.

