
# 3D Karusell-Kalender

## Översikt
Skapa en interaktiv 3D-karusell för kalendern där den **centrerade dagen** visas i full storlek och i fokus, medan dagarna på sidorna är **mindre och roterade bakåt** i perspektiv. Detta skapar en känsla av att alla 7 dagar i veckan "roterar" runt en cirkel.

## Visuell Effekt

```text
          ┌─────────┐
         /           \
     ┌──┐             ┌──┐
    /    \    TODAY   /    \
┌─┐ │ -1 │  ┌─────┐  │ +1 │ ┌─┐
│-2│      │ │FULL │ │      │ │+2│
└─┘       └─────────┘       └─┘
   \                         /
    └─── stackade bakom ───┘
```

**Centerdag (index 3):**
- Full storlek (scale: 1.0)
- Ingen rotation (rotateY: 0deg)
- Längst fram (z-index: 50)
- Ingen opacitet-reduktion

**Dag ±1 från center:**
- Lite mindre (scale: 0.85)
- Lätt roterade (rotateY: ±25deg)
- Bakom center (z-index: 40)
- Lätt reducerad opacitet (0.9)

**Dag ±2 från center:**
- Ännu mindre (scale: 0.7)
- Mer roterade (rotateY: ±45deg)
- Längre bak (z-index: 30)
- Mer reducerad opacitet (0.75)

**Dag ±3 (kantdagar):**
- Minst (scale: 0.55)
- Mest roterade (rotateY: ±60deg)
- Längst bak (z-index: 20)
- Mest reducerad opacitet (0.6)

## Teknisk Implementation

### 1. Ny CSS-fil: `Carousel3DStyles.css`
```css
.carousel-3d-wrapper {
  perspective: 2000px;
  perspective-origin: 50% 50%;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.carousel-3d-container {
  transform-style: preserve-3d;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  position: relative;
}

.carousel-3d-card {
  position: absolute;
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center center;
  backface-visibility: hidden;
}

/* Center card - full size, in front */
.carousel-3d-card[data-position="0"] {
  transform: translateZ(100px) scale(1);
  z-index: 50;
  opacity: 1;
}

/* Adjacent cards ±1 */
.carousel-3d-card[data-position="1"] {
  transform: translateX(350px) rotateY(-25deg) scale(0.85);
  z-index: 40;
  opacity: 0.9;
}
.carousel-3d-card[data-position="-1"] {
  transform: translateX(-350px) rotateY(25deg) scale(0.85);
  z-index: 40;
  opacity: 0.9;
}

/* Cards ±2 */
.carousel-3d-card[data-position="2"] {
  transform: translateX(550px) rotateY(-45deg) scale(0.7);
  z-index: 30;
  opacity: 0.75;
}
.carousel-3d-card[data-position="-2"] {
  transform: translateX(-550px) rotateY(45deg) scale(0.7);
  z-index: 30;
  opacity: 0.75;
}

/* Edge cards ±3 */
.carousel-3d-card[data-position="3"] {
  transform: translateX(680px) rotateY(-60deg) scale(0.55);
  z-index: 20;
  opacity: 0.6;
}
.carousel-3d-card[data-position="-3"] {
  transform: translateX(-680px) rotateY(60deg) scale(0.55);
  z-index: 20;
  opacity: 0.6;
}
```

### 2. Uppdatera `UnifiedResourceCalendar.tsx`

**Ny state och logik:**
```tsx
// Center index - vald dag (default: mittendagen, index 3 för måndag-söndag)
const [centerIndex, setCenterIndex] = useState(3);

// Beräkna relativ position för varje dag
const getPositionFromCenter = (dayIndex: number) => {
  return dayIndex - centerIndex;
};

// Hantera dag-klick för att flytta fokus
const handleDayCardClick = (dayIndex: number) => {
  setCenterIndex(dayIndex);
};
```

**Uppdaterad rendering:**
```tsx
<div className="carousel-3d-wrapper">
  <div className="carousel-3d-container">
    {days.map((date, index) => {
      const position = getPositionFromCenter(index);
      const clampedPosition = Math.max(-3, Math.min(3, position));
      
      return (
        <div
          key={format(date, 'yyyy-MM-dd')}
          className="carousel-3d-card day-card"
          data-position={clampedPosition}
          onClick={() => handleDayCardClick(index)}
          style={{
            width: '550px', // Fast bredd för alla kort
            cursor: position !== 0 ? 'pointer' : 'default'
          }}
        >
          <ResourceCalendar ... />
        </div>
      );
    })}
  </div>
</div>
```

### 3. Navigation med pilknappar

Lägg till navigationsknappar direkt på karusellen:

```tsx
{/* Vänster pil */}
<Button
  className="absolute left-4 z-60 bg-primary/90 hover:bg-primary"
  onClick={() => setCenterIndex(prev => Math.max(0, prev - 1))}
  disabled={centerIndex === 0}
>
  <ChevronLeft />
</Button>

{/* Höger pil */}
<Button
  className="absolute right-4 z-60 bg-primary/90 hover:bg-primary"
  onClick={() => setCenterIndex(prev => Math.min(days.length - 1, prev + 1))}
  disabled={centerIndex === days.length - 1}
>
  <ChevronRight />
</Button>
```

### 4. Scroll-interaktion (valfritt)

Möjlighet att använda scroll-hjul för att rotera karusellen:

```tsx
const handleWheel = useCallback((e: WheelEvent) => {
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    e.preventDefault();
    if (e.deltaX > 50) {
      setCenterIndex(prev => Math.min(days.length - 1, prev + 1));
    } else if (e.deltaX < -50) {
      setCenterIndex(prev => Math.max(0, prev - 1));
    }
  }
}, [days.length]);
```

## Filer att Ändra

| Fil | Ändring |
|-----|---------|
| `src/components/Calendar/Carousel3DStyles.css` | **NY FIL** - All 3D CSS |
| `src/components/Calendar/UnifiedResourceCalendar.tsx` | Lägg till 3D-karusell-logik, state för centerIndex, rendering med data-position |
| `src/components/Calendar/WeeklyCalendarStyles.css` | Ta bort gammalt horisontellt scroll-layout |

## Interaktion

1. **Klick på sidokort** → Kortet roterar till center, alla andra justeras
2. **Navigations-pilar** → Stegar igenom dagarna en i taget
3. **Vecko-navigation** → Behåller samma funktionalitet för att byta vecka
4. **Scroll-hjul** → Roterar karusellen vänster/höger

## Fördelar

- **Alla dagar synliga** - Inga dagar är "långt utanför skärmen"
- **Fokus på aktuell dag** - Tydlig visuell hierarki
- **Smooth animations** - 3D-transforms ger mjuka övergångar
- **Touch-vänlig** - Klicka på kort för att fokusera
- **Minnesvärd UX** - Unik och modern kalenderupplevelse

## Tekniska Detaljer

- Använder CSS `transform-style: preserve-3d` för äkta 3D
- `perspective` på wrapper för djupkänsla
- `backface-visibility: hidden` för att dölja baksidor
- Cubic-bezier easing för naturliga animationer
- `z-index` baserad på position för korrekt överlappning
