
## Två förbättringar i nedre raden: lika höga kort + bokningsbilder i Filer

### Problem 1: Ojämn höjd på de tre korten
Griden använder `items-start`, vilket innebär att varje kort bara är lika högt som sitt innehåll. Filer-kortet är kortast och Historik-kortet längst. Lösningen är att byta till `items-stretch` och ge korten `h-full` så att alla tre sträcker sig till samma höjd.

### Problem 2: Bokningsbilder syns bara i Boknings-panelen, inte i Filer
`bookingAttachments` (bilderna från bokningen) skickas idag till `BookingInfoExpanded` men inte till `ProjectFiles`. Användaren vill se dessa bilder direkt i Filer-kortet.

---

### Lösning

**`src/pages/project/ProjectViewPage.tsx`**
- Ändra `items-start` → `items-stretch` på den tre-kolumniga griden
- Skicka `bookingAttachments` som prop till `<ProjectFiles />`

**`src/components/project/ProjectFiles.tsx`**
- Lägg till en `bookingAttachments` prop (array av `BookingAttachment`)
- Lägg till en sektion under uppladdade filer som visar bilderna från bokningen i ett bildgalleri (klickbara, öppnar i ny flik)
- Korten får `h-full` via en wrapping `div` så de fyller hela gridens höjd

---

### Tekniska detaljer

| Fil | Ändring |
|---|---|
| `src/pages/project/ProjectViewPage.tsx` | `items-start` → `items-stretch`, lägg till `bookingAttachments={bookingAttachments}` på `<ProjectFiles />`, wrappa varje `<section>` i `<div className="flex flex-col h-full">` och ge `<ProjectFiles>` `className="h-full"` |
| `src/components/project/ProjectFiles.tsx` | Ny prop `bookingAttachments?: BookingAttachment[]`, filtrera ut bilderna (`file_type?.startsWith('image/')` eller bildfil-extension), visa dem i ett bildgalleri-grid under de uppladdade filerna med en avskiljare och rubrik "Bilder från bokning" |

### Resultat
- Alla tre kort (Filer, Kommentarer, Historik) håller exakt samma höjd
- Filer-kortet visar bokningens bilder (tältbilder, situationsplaner) direkt utan att användaren behöver scrolla upp till Boknings-panelen
