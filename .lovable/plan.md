# Adaptiv kalender — utnyttja hela ytan

## Problem
Dag-vyn (3D-carousel) i `/calendar` har:
- `--card-max-width: 1400px` som cappar bredden även när skärmen är 1600+ px → tomt utrymme på sidorna.
- `MIN_COMPRESSED_TEAM_COLUMN_WIDTH = 68px` → när det finns 7 teams (Team 1–6 + Lager) + tidkolumner blir totalbredden större än cappen → horisontell scroll syns (som i skärmdumpen där nästa dags Team 1 sticker in från höger).
- Event-korten har samma padding/font oavsett kolumnbredd → mycket text wrappas till tre rader och kort blir onödigt höga.

## Lösning

### 1. Ta bort fast pixel-cap på dagskortet
`src/components/Calendar/Carousel3DStyles.css`
- `--card-max-width: 1400px` → byt till `min(98vw, 1800px)`, eller mer adaptivt: använd `clamp(900px, 96vw, 2000px)`.
- Säkerställer att centerkortet alltid fyller tillgänglig bredd, men på riktigt små skärmar inte klipps.

### 2. Adaptiv kolumnbredd i TimeGrid
`src/components/Calendar/TimeGrid.tsx`
- Mät containerbredden (ny `useResizeObserver` på `time-grid-with-staff-header` eller en wrapper-ref).
- Beräkna `availableWidth = containerWidth - 2 * TIME_COLUMN_WIDTH`.
- Räkna ideal kolumn = `availableWidth / resources.length`.
- I `fullWidth`-läget: använd `minmax(${dynamicMin}px, 1fr)` där `dynamicMin = clamp(48, idealCol, 95)`.
- Sänk hårda golvet `MIN_COMPRESSED_TEAM_COLUMN_WIDTH` 68 → 52 som absolut fallback.

Resultat: 7 teams på 1300 px content-bredd får ~178 px/kolumn (rejält!), 7 teams på 800 px får ~110 px, 10 teams på 800 px får 70 px utan scroll.

### 3. Kompakt event-kort vid trånga kolumner
- I `TimeGrid.tsx` lägg ett dataset-attribut på rotnoden: `data-density="compact" | "comfortable" | "spacious"` baserat på beräknad kolumnbredd (compact <80, comfortable 80–140, spacious >140).
- I `TimeGrid.css` (eller event-renderern): justera padding (4→2px), font-size (12→11px) och radhöjd för `data-density="compact"`. Klipp bokningsnummer till en rad med ellipsis.

### 4. Veckovy använder redan vågrät scroll per dagskort
Inga ändringar där (kort är medvetet smala för att 7 ska få plats vågrätt).

## Tekniska detaljer
```css
/* Carousel3DStyles.css */
.carousel-3d-wrapper {
  --card-width: 100%;
  --card-max-width: clamp(900px, 96vw, 2000px);
}
```

```tsx
// TimeGrid.tsx
const wrapRef = useRef<HTMLDivElement>(null);
const [containerW, setContainerW] = useState(0);
useEffect(() => {
  if (!wrapRef.current) return;
  const ro = new ResizeObserver(([e]) => setContainerW(e.contentRect.width));
  ro.observe(wrapRef.current);
  return () => ro.disconnect();
}, []);

const idealCol = resources.length
  ? Math.floor((containerW - 2 * TIME_COLUMN_WIDTH) / resources.length)
  : TEAM_COLUMN_WIDTH;
const dynamicMin = Math.max(52, Math.min(idealCol, 95));
const density = idealCol < 80 ? 'compact' : idealCol < 140 ? 'comfortable' : 'spacious';

const responsiveColumnWidth = `minmax(${dynamicMin}px, 1fr)`;
```

## Verifiering
- Snapshot-test: `TimeGrid` med 7 resurser i container 1600 px → `dynamicMin` ≈ 95, density `spacious`.
- Snapshot-test: 10 resurser i 900 px → `dynamicMin` = 80, ingen overflow.
- Visuellt i preview på `/calendar` (dag + vecka).

## Inte i scope
- Vertikal höjd-anpassning (events vid många timmar)
- Veckovyns smala dagskort
