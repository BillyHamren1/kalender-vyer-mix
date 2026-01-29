
# 3D Karusell-Kalender - Implementering

## Analys av problemet

Den tidigare implementeringen missade helt rätt fil. 3D-karusellkoden lades till i `UnifiedResourceCalendar.tsx`, men:

- **Rutt `/calendar`** (Personalplanering) → använder `CustomCalendarPage` → `CustomCalendar.tsx`
- **Rutt `/warehouse/calendar`** → använder `WarehouseCalendarPage` → `CustomCalendar.tsx`

`UnifiedResourceCalendar.tsx` används INTE av någon av dessa rutter. Därför ser du exakt samma vy som tidigare - koden finns men aktiveras aldrig.

## Lösning

Implementera 3D-karusellen direkt i **`CustomCalendar.tsx`** som faktiskt används av båda kalendersidorna.

## Teknisk plan

### 1. Uppdatera `CustomCalendar.tsx`

**Lägg till:**
- Import av `Carousel3DStyles.css`
- State för `centerIndex` (vilken dag som är i fokus)
- Logik för att sätta dagens datum (idag) som default center
- `getPositionFromCenter`-funktion
- Scroll-hjul-hantering
- Navigation med pilknappar

**Ändra renderingen:**
```tsx
// Från:
<div className="weekly-calendar-container overflow-x-auto p-4">
  <div className="weekly-calendar-grid flex gap-4">
    {days.map(...)}
  </div>
</div>

// Till:
<div className="carousel-3d-wrapper">
  <button className="carousel-3d-nav nav-left">...</button>
  <button className="carousel-3d-nav nav-right">...</button>
  
  <div className="carousel-3d-container">
    {days.map((date, index) => {
      const position = getPositionFromCenter(index);
      return (
        <div 
          className="carousel-3d-card"
          data-position={position}
          onClick={() => handleDayCardClick(index)}
        >
          <TimeGrid ... />
        </div>
      );
    })}
  </div>
  
  <div className="carousel-3d-indicators">...</div>
</div>
```

### 2. Uppdatera `Carousel3DStyles.css`

Justera dimensionerna för att passa den befintliga `TimeGrid`-komponenten:
- Kortbredd baseras på antal synliga team
- Höjd anpassas till TimeGrid's höjd
- Se till att overflow är visible på alla föräldrar

### 3. Sätt "idag" som centerdag

Logik för att hitta vilken index som motsvarar dagens datum:
```tsx
const getTodayIndex = () => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const index = days.findIndex(d => format(d, 'yyyy-MM-dd') === todayStr);
  return index >= 0 ? index : 3; // Fallback till mitten
};

const [centerIndex, setCenterIndex] = useState(getTodayIndex());
```

### 4. Stöd för båda systemen

Eftersom både Personalplanering och Warehouse använder `CustomCalendar`, fungerar 3D-karusellen automatiskt i båda. Amber-temat för Warehouse hanteras redan via `variant`-prop.

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/components/Calendar/CustomCalendar.tsx` | Implementera 3D-karusell-logik och rendering |
| `src/components/Calendar/Carousel3DStyles.css` | Justera dimensioner för TimeGrid |

## Funktionalitet

- **Idag i mitten**: Dagens datum centreras automatiskt (om det finns i veckan)
- **Klick på sidokort**: Roterar till center
- **Pilknappar**: Stegar igenom dagarna
- **Scroll-hjul**: Roterar karusellen horisontellt
- **Indikatordottar**: Visar vilken dag som är i fokus

## Visuell effekt

```
        ┌─────────┐
       /           \
   ┌──┐    IDAG    ┌──┐
  /    \  ┌─────┐  /    \
┌─┐ Mån │ │ Ons │ │ Fre ┌─┐
│Sö│    └─────────┘    │Lör│
└─┘       │       │     └─┘
   \      └───────┘      /
    └─── roterade ───┘
```

- **Centerdag (idag)**: Full storlek, z-index 50, ingen rotation
- **±1 dag**: 85% storlek, 25° rotation, z-index 40
- **±2 dagar**: 70% storlek, 45° rotation, z-index 30
- **±3 dagar**: 55% storlek, 60° rotation, z-index 20
