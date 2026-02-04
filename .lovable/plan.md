
# Plan: Bomba Planeringsassistenten med Information

## Sammanfattning
Utöka AI-planeringsassistenten ("EstablishmentAIAssistant") med betydligt rikare kontext från databasen. Detta ger assistenten möjlighet att ge mer relevanta och detaljerade förslag.

## Ny information som läggs till

### 1. Utökad bokningsinformation
- **Bokningsnummer** - För referens
- **Status** - Aktuell status på bokningen  
- **Kontaktperson** - Namn, telefon, e-post
- **Logistikinställningar**:
  - Bärs längre än 10m? (ja/nej)
  - Markspett tillåtet? (ja/nej)
  - Exakt tid krävs? (ja/nej + info)
- **Interna anteckningar** - Viktig information från tidigare planering

### 2. Detaljerade tider
- Start- och sluttid för riggdag
- Start- och sluttid för eventdag  
- Start- och sluttid för avetablering

### 3. Utökad produktinformation
- **Kategorisering** - Paket vs tillbehör
- **Priser** - Enhetspris och totalpris (ger AI förståelse för projektets storlek)
- **Beräknade arbetstimmar** (setup_hours) per produkt
- **Kostnadsinformation** - Arbetskostnad, materialkostnad, externa kostnader

### 4. Utökad personalinformation  
- **Roll/kompetens** - T.ex. "Riggare", "Ljustekniker"
- **Timpris** - Ger AI förståelse för budgetkonsekvenser
- **Team-tillhörighet** - Vilken grupp de arbetar med

### 5. Projektkontext (om bokning är kopplad)
- **Projektstatus** - Ej påbörjat/Pågående/Avslutat
- **Projektledare** - Vem som ansvarar
- **Checklista/uppgifter** - Status på förberedelser

### 6. Historisk data
- **Tidigare tidrapporter** - Hur lång tid tog liknande arbete?
- **Packningsstatus** - Är allt packat och klart?

## Teknisk implementation

### Steg 1: Utöka data-hämtning
Uppdatera `fetchEstablishmentBookingData` i `establishmentPlanningService.ts` för att hämta:
- Utökad bokningsdata (logistik, kontakt, notes)
- Produkter med priser och kostnader
- Personal med timpris
- Projekt-info om kopplat
- Tidrapporter för historik
- Packningsstatus

### Steg 2: Uppdatera TypeScript-interfaces
Utöka `EstablishmentBookingData` och `AssignedStaff` med nya fält.

### Steg 3: Berika AI-kontexten
Uppdatera `buildContext()` i `EstablishmentAIAssistant.tsx` för att inkludera all ny data i prompten som skickas till AI:n.

### Steg 4: Förbättra förslagsgenerering
Ge AI:n mer specifika instruktioner baserat på tillgänglig data, t.ex.:
- Om exakt tid krävs: föreslå detaljerat minutschema
- Om bärsträcka > 10m: påminn om extra personal/utrustning
- Om budgeten är hög: föreslå kvalitetskontroller

## Filer som ändras

**Ändras:**
- `src/services/establishmentPlanningService.ts` - Utökad datahämtning
- `src/components/project/EstablishmentGanttChart.tsx` - Skicka mer data till AI
- `src/components/project/EstablishmentAIAssistant.tsx` - Utökad `buildContext()`
- `supabase/functions/establishment-ai-assistant/index.ts` - Bättre systemprompt

## Exempel på ny AI-kontext

```text
AKTUELL BOKNING:
- Bokningsnummer: BK-2024-0342
- Kund: Spotify AB
- Status: Bekräftad
- Adress: Kungsgatan 8, Stockholm
- Kontakt: Anna Svensson, 070-123 45 67, anna@spotify.com

DATUM & TIDER:
- Riggdag: 2024-03-15 (08:00 - 18:00)
- Eventdag: 2024-03-16 (10:00 - 22:00)  
- Avetablering: 2024-03-17 (08:00 - 14:00)

LOGISTIK:
- Bärsträcka över 10m: Ja
- Markspett tillåtet: Nej
- Exakt tid krävs: Ja - "Kunden har strikt access 08:00"

PRODUKTER (12 st, totalt 145 000 kr):
- Scen 8x6m (1 st) - 45 000 kr, ~8 arbetstimmar
  └ Stakettäcke 6m (4 st) - ingår i paket
  └ Trappa scenfront (2 st) - ingår i paket
- PA-system Large (1 st) - 35 000 kr, ~4 arbetstimmar
- Belysningsrigg 12m (1 st) - 28 000 kr, ~6 arbetstimmar
...

TILLDELAD PERSONAL:
- Erik Johansson (Riggare) - 450 kr/h - 15-16 mars
- Maria Lindqvist (Ljustekniker) - 520 kr/h - 15-16 mars
- Anders Berg (Riggare) - 420 kr/h - endast 15 mars

PROJEKTSTATUS:
- Status: Pågående
- Projektledare: Sofia Andersson
- Förberedelser: 4/7 klara (packning ej påbörjad)

INTERNA ANTECKNINGAR:
"Viktigt: Kunden vill ha extra tyst riggning, grannar har klagat tidigare."
```

## Förväntade förbättringar

Med denna rikare kontext kan AI:n:
- Ge mer exakta tidsuppskattningar baserat på produkternas arbetstimmar
- Varna för logistikutmaningar (lång bärsträcka, inga markspett)
- Beakta budgetrestriktioner vid personalförslag
- Påminna om viktiga noteringar och kundkrav
- Föreslå rätt kompetenser baserat på produkttyper
- Identifiera om förberedelser (packning) ligger efter
