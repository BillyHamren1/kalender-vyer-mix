

## Transportkalendern - Veckovy med samma design som Dashboard

### Problem
1. Kalendern visar idag en **dag-valjare** (klicka pa en dag, se korningar nedan) istallet for en riktig veckovy med 7 kolumner
2. Transportkorningar visas inte korrekt - `useTransportAssignments` filterar pa en enskild dag, men behover hamta hela veckan
3. Designen matchar inte dashboard-kalendern som har teal-header, dag-kolumner med event-kort, och "Inga handelser" for tomma dagar

### Losning

Byta ut den nuvarande kalendersektionen i `LogisticsPlanning.tsx` mot en layout som exakt foljer `DashboardWeekView`-designen:

**1. Hamta hela veckans data**
- Andra anropet till `useTransportAssignments` sa att det hamtar hela veckan (startOfWeek till endOfWeek), inte bara en dag
- Alternativt anvanda `useDashboardEvents` med kategorin `logistics` for att fa samma data som dashboard-kalendern visar

**2. Ny kalenderdesign (identisk med DashboardWeekView)**
- Teal gradient-header med "Vecka X" och navigationpilar
- 7 dag-kolumner sida vid sida med scrollbar (`overflow-x-auto`)
- Varje dag-kolumn har:
  - Header med dagnamn (MANDAG, TISDAG...), datum och manad
  - Idag markerad med teal-bakgrund och prickindikator
  - Event-kort for varje transportuppdrag
  - "Inga handelser" med kalenderikon for tomma dagar

**3. Event-kort i transportstil**
- Anvanda `DashboardEventCard`-komponentens stil med TRANSPORT-badge
- Visa bokningsnummer, kundnamn och status (Vantar/Levererad/Pa vag)

### Tekniska detaljer

**Filer som andras:**

| Fil | Andring |
|-----|---------|
| `src/pages/LogisticsPlanning.tsx` | Ersatt PremiumCard-kalender med DashboardWeekView-liknande layout. Ta bort `selectedDate` state (behovs ej langre). Hamta veckodata istallet for dagsdata |
| `src/hooks/useTransportAssignments.ts` | Laga sa att hooken kan ta emot ett datumintervall (start + slut) istallet for bara en dag, sa att hela veckans korningar hamtas |

**Datahanterings-approach:**
- Modifiera `useTransportAssignments` att acceptera en optional `endDate` parameter
- Nar `endDate` ges, filtrera med `.gte()` och `.lte()` istallet for `.eq()`
- Gruppera sedan assignments per dag i UI:t med `isSameDay()` fran date-fns

**Kalender-struktur (JSX):**
```text
+--------------------------------------------------+
| [<]       Vecka 7        [>]    (teal gradient)   |
+--------------------------------------------------+
| MAN  | TIS  | ONS  | TORS | FRE  | LOR  | SON  |
|  9   | 10   | 11   |  12  | 13   | 14   | 15   |
| feb. | feb. | feb. | feb. | feb. | feb. | feb. |
|------|------|------|------|------|------|------|
|      |      |      |[TRAN]|      |      |      |
| Inga | Inga | Inga |11-TE-|      |      |      |
| hand.| hand.| hand.|  !!  |      |      |      |
|      |      |      |Vantar|      |      |      |
+--------------------------------------------------+
```

Transport-korten atervander samma `DashboardEventCard`-komponent som redan anvands pa dashboard, sa att styling ar identisk.

