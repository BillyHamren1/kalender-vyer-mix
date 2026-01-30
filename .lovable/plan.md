
# Plan: Fixa Dag/Vecka-vyerna i Kalendern

## Problemet
Just nu funkar inte vyerna rätt:
- **"Dag"** ska visa den befintliga 3D-karusellen (ett fokuserat dagskort i mitten med side-kort bakom) 
- **"Vecka"** ska visa EXAKT samma dagskortsdesign (TimeGrid med alla team, "Tillgängliga"-kolumnen, etc.) men sida vid sida för alla 7 dagar, inte som en karusell

Problemet är att `CustomCalendarPage.tsx` nu använder `UnifiedResourceCalendar` för båda vyerna, men `UnifiedResourceCalendar` har en egen implementation för `viewMode="weekly"` som inte matchar `CustomCalendar`-designen.

## Lösning
Använda `CustomCalendar` för BÅDA vyerna (`day` och `weekly`) eftersom den redan har rätt design och layout. `CustomCalendar` har redan stöd för:
- **`viewMode="day"`**: Visar karusellen (redan implementerat)
- **`viewMode="weekly"`**: Visar karusellen (men ska ändras till sida-vid-sida grid)

## Tekniska ändringar

### 1. Uppdatera `CustomCalendar.tsx`
Ändra så att `viewMode="weekly"` renderar alla 7 dagar i en horisontell grid (sida-vid-sida) istället för 3D-karusellen:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Vecka 5, Januari 2026                        Dag │ Vecka │ Månad │ Lista │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                       │
│ │Mån │ │Tis │ │Ons │ │Tor │ │Fre │ │Lör │ │Sön │  <-- 7 dagskort       │
│ │ 27 │ │ 28 │ │ 29 │ │ 30 │ │ 31 │ │ 1  │ │ 2  │      (horizontal      │
│ │    │ │    │ │    │ │    │ │    │ │    │ │    │       scroll)         │
│ │    │ │    │ │    │ │    │ │    │ │    │ │    │                       │
│ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘                       │
└─────────────────────────────────────────────────────────────────────────┘
```

Ändringar i `CustomCalendar.tsx`:
- **Byt rendering för `viewMode === 'weekly'`**: Istället för karusell, rendera en horisontell scroll-container med alla 7 dagar
- **Behåll samma `TimeGrid`-komponent** för varje dag (samma utseende som dag-vyn)
- **Ingen karusell-navigering** i veckovyn (varje kort är lika, inget "center"-kort)
- **Behåll "Tillgängliga"-kolumnen** i varje dagskort

### 2. Uppdatera `CustomCalendarPage.tsx`
Byt tillbaka till att använda `CustomCalendar` (inte `UnifiedResourceCalendar`) för både `day` och `weekly`:

```tsx
viewMode === 'day' || viewMode === 'weekly' ? (
  <CustomCalendar
    events={events}
    resources={teamResources}
    viewMode={viewMode}  // 'day' eller 'weekly'
    // ... övriga props
  />
)
```

### 3. Uppdatera `WarehouseCalendarPage.tsx`
Samma ändring så Lagerkalendern får samma beteende (Dag=karusell, Vecka=grid).

### 4. Lägg till CSS för veckogriden
Ny klass i `Carousel3DStyles.css` eller `WeeklyCalendarStyles.css`:

```css
.weekly-horizontal-grid {
  display: flex;
  flex-direction: row;
  gap: 8px;
  overflow-x: auto;
  padding: 8px;
  scroll-snap-type: x mandatory;
}

.weekly-horizontal-grid .day-card {
  flex: 0 0 auto;
  min-width: 350px;  /* eller beräknad bredd */
  scroll-snap-align: start;
}
```

## Resultat efter ändring
| Vy | Beteende |
|-----|---------|
| **Dag** | 3D-karusell med ett fokuserat dagskort och sidokort bakom |
| **Vecka** | Alla 7 dagskort sida vid sida med horisontell scroll |
| **Månad** | Samma som Vecka men med vecko-tabs för att byta vecka |

## Filer som ändras
1. `src/components/Calendar/CustomCalendar.tsx` - Ny rendering för `weekly`-läget
2. `src/pages/CustomCalendarPage.tsx` - Använd `CustomCalendar` istället för `UnifiedResourceCalendar`
3. `src/pages/WarehouseCalendarPage.tsx` - Samma ändring för konsistens
4. `src/components/Calendar/Carousel3DStyles.css` eller `WeeklyCalendarStyles.css` - CSS för horisontell grid
