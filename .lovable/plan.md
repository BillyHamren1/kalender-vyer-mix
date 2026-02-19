
## Dynamisk kolumnbredd baserat på förfluten tid

### Vad som ska göras

Kolumnerna i veckovyn ska få dynamisk bredd beroende på om dagen har passerat eller ej:

- **Förflutna dagar** (igår, förrgår, etc.) → 10% smalare än normal bredd
- **Kvarvarande dagar** (idag och framåt) → får den "frigjorda" bredden fördelad jämnt

Flex-systemet löser detta elegant med viktade `flex`-värden — inga pixlar eller procent behövs.

### Hur det fungerar

Varje dag tilldelas ett `flex`-värde:
- Förfluten dag: `flex: 0.65` (minskat)  
- Idag eller framtida dag: `flex: 1` (normal/utökad)

Flex-layouten fördelar automatiskt den totala bredden proportionellt. Om t.ex. 4 av 7 dagar har passerat och resten är 3 kvarvarande, får de 3 kvarvarande extra utrymme från de 4 smalare.

**Exempel vecka med 4 förflutna + 3 kvarvarande:**
```text
Förfluten: flex 0.65  x4 = 2.60 flex-enheter
Kvarvarande: flex 1.0 x3 = 3.00 flex-enheter
Total = 5.60 enheter → kvarvarande dagar får ~53% av bredden
```

### Teknisk implementation

**Fil att ändra:** `src/components/warehouse-dashboard/WeekPackingsView.tsx`

**Ändringar i `DayColumn`-komponenten:**

1. Beräkna `isPast` korrekt (dag är strikt före dagens datum)
2. Lägg till `flex`-stil dynamiskt:
   - `isPast` → `style={{ flex: '0 0 auto', flexBasis: '...' }}` — eller enklare: sätt `flex`-värde direkt
3. Behåll `min-w-0` för att tillåta flex-krympning

Enklaste ansatsen: ersätt `flex-1 min-w-0` med en beräknad inline `style`:

```tsx
// I DayColumn:
const flexValue = isPast ? 0.65 : 1;

<div
  style={{ flex: flexValue, minWidth: 0 }}
  className="flex flex-col"
>
```

**Gällande "inte keff efter 6 dagar":**  
När det bara finns 1 dag kvar i veckan som inte är förfluten, skulle den dagen ta upp nästan hela bredden. För att förhindra att det ser konstigt ut sätts ett `maxWidth`-skydd: kvarvarande dagar begränsas till max `250px` medan de fortfarande är flex. Detta via:

```tsx
maxWidth: isPast ? undefined : '250px'
```

Nej — tvärtom, vi vill inte begränsa. Istället sätts ett `minWidth: 60px` på förflutna dagar så de aldrig försvinner helt, och kvarvarande dagar får växa fritt. Det ger ett naturligt och snyggt resultat oavsett hur många dagar som återstår.

### Sammanfattning av ändringen

- `DayColumn` får `style={{ flex: isPast ? 0.65 : 1, minWidth: isPast ? 60 : 80 }}`
- Tar bort `flex-1 min-w-0` från className och ersätter med inline style
- `min-w-0` i Tailwind håller kvar för text-truncation att fungera
- Inga färgändringar, inga layoutändringar utöver flex-viktningen
