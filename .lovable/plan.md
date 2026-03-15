

# Fix: Konsekventa mobilheaders

## Problem

Headers har olika höjd beroende på vilken kombination av eyebrow/subtitle som används:

- **Jobb**: har eyebrow ("Välkommen") men ingen subtitle → unik höjd
- **Tidrapport**: har subtitle men ingen eyebrow → annan höjd  
- **Utlägg**: har subtitle men ingen eyebrow → samma som tidrapport
- **Meddelanden**: BackHeader med pb-4 → kortare
- **Profil**: ProfileHeader med avatar → helt annan höjd

Det skapar ett ojämnt, osammanhängande intryck.

## Lösning

### 1. Standardisera HeroHeader — alla toppnivåsidor får BÅDE eyebrow OCH subtitle

| Sida | eyebrow | title | subtitle |
|------|---------|-------|----------|
| Jobb | MINA JOBB | {Förnamn} | Dagens uppdrag |
| Tidrapport | TIDRAPPORT | Tidrapportering | Rapportera arbetstid |
| Utlägg | UTLÄGG | Utlägg | Kvitton & inköp |
| Meddelanden | → Byt till HeroHeader med eyebrow + subtitle (inte BackHeader, eftersom det är en toppnivå-tab) |

### 2. Ge HeroHeader en **fast min-höjd på innehållsdelen**

Lägg till `min-h-[60px]` på den inre `px-5 pb-5`-diven så att höjden inte varierar även om subtitle/eyebrow saknas av någon anledning. Detta ger en visuell baseline.

### 3. Meddelanden — byt till HeroHeader

Inbox-listan är en toppnivå-tab (visas via bottom nav), inte en inner page. Den ska använda `MobileHeroHeader` med eyebrow/subtitle, precis som de andra tabbarna. BackHeader ska bara användas i sub-vyer (DM-chatt, broadcast-detalj, jobb-tråd).

### 4. BackHeader — standardisera höjd

Ge BackHeader samma `min-h-[60px]` på innehållsdelen och ändra `pb-4` → `pb-5` så att den matchar HeroHeader i bottenmarginal.

### Filer som ändras

1. **`src/components/mobile-app/MobileHeader.tsx`** — Lägg till `min-h-[60px]` på HeroHeader och BackHeader content-div, ändra BackHeader pb-4 → pb-5
2. **`src/pages/mobile/MobileJobs.tsx`** — Lägg till eyebrow "MINA JOBB", subtitle "Dagens uppdrag"
3. **`src/pages/mobile/MobileTimeReport.tsx`** — Lägg till eyebrow "TIDRAPPORT"
4. **`src/pages/mobile/MobileExpenses.tsx`** — Lägg till eyebrow "UTLÄGG"
5. **`src/pages/mobile/MobileInbox.tsx`** — Inbox list-vy: byt från `MobileBackHeader` till `MobileHeroHeader` med eyebrow "MEDDELANDEN", subtitle baserat på olästa

