

## Plan: Personal-kolumn → bred container med 4 kolumner

### Problem
"Personal"-kolumnen är smal (70px) och listar alla namn vertikalt, vilket skapar enorm höjd i headern.

### Lösning
Ändra layouten så att "Personal"-raden (rad 3 i headern) spänner över hela bredden (samma som dag-containern) och visar namnen i ett 4-kolumns grid istället för en smal vertikal lista.

### Implementation

**Fil: `src/components/Calendar/TimeGrid.tsx`**

1. **Flytta "Personal" ut ur grid-kolumn 2** — Rad 3 (staff row) ska ha en separat sektion ovanför team-kolumnerna för lediga personal, som spänner hela bredden (`gridColumn: 1 / -1`).

2. **Ändra layouten för lediga personal**:
   - Istället för `flexDirection: column` i en 70px-bred kolumn → använd `display: grid` med `gridTemplateColumns: repeat(4, 1fr)`
   - Behåll samma pill-stil (färg, dot, förnamn)
   - Kompakt padding så det inte tar mer plats än nödvändigt

3. **Ta bort den tomma "Personal"-tidskolumnen** (rad under headern, kolumn 2) som idag bara visar tomma time-slots — den behövs inte längre.

4. **Justera grid-template**:
   - Header rad 1-2: behåll `timeColumnWidth` + team-kolumner (ta bort `availableColumnWidth`)
   - Header rad 3: full-bredd container för personal-grid
   - Scrollable content: ta bort kolumn 2 (`availableColumnWidth`), börja team-kolumner direkt efter time-kolumnen

5. **Uppdatera `getGridTemplateColumns()`** och `getTotalWidth()`** — ta bort `availableColumnWidth` från beräkningarna för det scrollbara innehållet.

### Visuellt resultat
```text
┌──────────────────────────────────────────────┐
│  Time │        Mån 7 April                   │
├───────┤  Team 1  │  Team 2  │  Team 3  │ Live│
├──────────────────────────────────────────────┤
│ ● Gints    ● Billy    ● Ranjan   ● Ivars    │
│ ● Aleksejs ● Nana     ● Raivis   ● Joel     │
├───────┬──────────┬──────────┬──────────┬─────┤
│ 05:00 │          │          │          │     │
│ 06:00 │          │          │          │     │
```

### Filer som ändras
- `src/components/Calendar/TimeGrid.tsx` — omstrukturering av header-grid och borttagning av personal-kolumnen från tidsrutnätet

