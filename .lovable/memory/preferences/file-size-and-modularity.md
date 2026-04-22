---
name: File size & modularity
description: Pragmatic file-size rule — split when files mix responsibilities or near ~500 lines, not at 200.
type: preference
---
Håll filer pragmatiskt små men inte mikro-splittrade.

**Riktmärken:**
- Komponenter / hooks / services upp till ~500 rader är OK om filen har ETT tydligt ansvar.
- Splitta när:
  - filen blandar tydligt olika ansvar (t.ex. UI + business logic + persistens i samma fil), eller
  - filen passerar ~500 rader, eller
  - en sektion av filen återanvänds från ett annat ställe.
- Splitta INTE bara för att en hook passerar 200 rader om logiken är sammanhängande.

**Why:** Användaren vill inte ha 8000-radersfiler, men inte heller mikrosplittring som sprider kontext över tio filer.

**How to apply:** När en ny feature byggs — börja med 1–2 filer per ansvar (t.ex. `useFoo.ts` + `fooApi.ts`). Splitta vidare vid behov, inte preventivt.
