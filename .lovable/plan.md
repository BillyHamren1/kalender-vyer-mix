# Tre tabbar i stora projekt

## Mål
Återställ den klassiska bokningslistan inuti stora projekt och placera den vid sidan av Excel-vyn och Produktvyn — totalt **tre tabbar** i toggle-baren ovanför innehållet:

1. **Excelvy** — nuvarande `LargeProjectExcelView` (kalkyl-tabell över alla produkter från alla bokningar)
2. **Bokningsvy** — den gamla bokningslistan (en rad per bokning, klick → expanderar `BookingInfoExpanded`), exakt som den såg ut före 1 maj 2026
3. **Produktvy** — nuvarande `LargeProjectProductsOverview`

Filen som rörs: `src/pages/project/LargeProjectLayout.tsx` (raderna ~554–588 där dagens 2-knapp-toggle och rendering ligger).

## Vad som ska göras

### 1. Utöka toggle-baren till tre knappar
- Bredda containern (`bg-muted rounded-md p-0.5`) så den rymmer tre `Button`-knappar utan att texten klipps.
- Lägg till en tredje knapp **"Excelvy"** med `Table2`/`FileSpreadsheet`-ikon (lucide).
- Byt etiketten på dagens första knapp från "Bokningar (n)" till **"Bokningar (n)"** men styr `linkedView='bookings'` mot LISTA i stället för Excel.
- Behåll **"Produkter"**-knappen oförändrad.

### 2. Utöka state
```ts
const [linkedView, setLinkedView] = useState<'excel' | 'bookings' | 'products'>('bookings');
```
Defaultvärde `'bookings'` så användaren landar i den välbekanta listan (kan justeras om önskat).

### 3. Återinför bokningslistan
Återanvänd den befintliga koden från commit `a308dc97e` (rad ~454–520). Den behöver:
- `expandedBookingIds`, `toggleBookingExpanded` — finns redan i layouten.
- `BookingInfoExpanded`, `getLargeProjectBookingLabel`, `cn`, `ChevronDown`, `ChevronRight`, `MapPin`, `AlertTriangle`, `Trash2`, `Badge`, `Card`, `CardContent` — alla existerar redan i projektet, importera de som saknas i nuvarande layout.
- Tom-state: kort med "Inga bokningar kopplade ännu" + "Lägg till första bokningen"-knapp som öppnar `setIsAddBookingOpen(true)` (dialogen finns kvar).
- Behåll "Lägg till bokning"-knappen i toolbar **endast** när `linkedView === 'bookings'` (precis som idag, inte vid `'excel'` eller `'products'`).

### 4. Rendering-switch
Ersätt nuvarande `if products else excel`-block med:
```tsx
{linkedView === 'excel' && <LargeProjectExcelView bookings={bookings as any} />}
{linkedView === 'bookings' && <BookingsList ... />}
{linkedView === 'products' && <LargeProjectProductsOverview ... />}
```

### 5. Inga förändringar i
- `LargeProjectViewPage.tsx` (dess interna Tabs är på sub-sidan, inte den här toggle-baren).
- `LargeProjectExcelView`, `LargeProjectProductsOverview`, `BookingInfoExpanded` — oförändrade.
- Datamodell, hooks, services, edge functions — inga ändringar.

## Verifiering
- Manuell test i preview på `/large-project/...`: byt mellan de tre vyerna, expandera bokningar i bokningsvyn, "Lägg till bokning"-knappen syns endast i bokningsvyn.
- `bunx vitest run` på relevanta tester (inga av nuvarande tester rör denna toggle, men kör `largeProjectPlannerService.test.ts` som rökkontroll).

## Risker
- Ren UI/presentations-ändring i en fil. Ingen påverkan på Single Timer Policy, time-engine, packing, eller multi-tenancy.
