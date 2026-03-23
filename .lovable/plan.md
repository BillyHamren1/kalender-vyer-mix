

## Fix: Tidrapporteringssidan spiller utanför containern på små skärmar

### Problem

`MobileTimeReport.tsx` har formulärfält som spiller ut utanför skärmens bredd på små telefoner. Huvudsakliga orsaker:

1. **Inga overflow-begränsningar** — yttre containern (`div.flex.flex-col`) saknar `overflow-hidden` / `overflow-x-hidden`, så bredare barn kan pusha ut
2. **Input-fält med fasta bredder** — `h-12`-inputs med `text-center` och `type="date"`/`type="time"` renderas ibland bredare än sin container på iOS
3. **Containern har `px-5`** men saknar `w-full` och `max-w-full` för att tvinga barn att respektera gränser
4. **Övertid-fältet** använder `type="number"` utan `min-w-0` — kan expandera

### Åtgärd

**Fil: `src/pages/mobile/MobileTimeReport.tsx`**

- Lägg till `overflow-x-hidden` på yttersta `div` (rad 95)
- Lägg till `w-full min-w-0 overflow-hidden` på formulär-containern (rad 138)
- Sätt `min-w-0 w-full` på alla `Input`-element för att förhindra overflow
- Lägg till `box-border` och `max-w-full` på den inre `space-y-6`-containern
- Säkerställ att grid-kolumner (`grid-cols-2`, `grid-cols-4`) har `min-w-0` på barnen

Inga strukturella ändringar — bara CSS-constraints som tvingar allt att hålla sig inom containerns bredd.

