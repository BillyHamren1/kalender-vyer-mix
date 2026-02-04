
# Plan: Ny projektstruktur med tre nivåer

## Sammanfattning

Omstrukturering av projektsystemet till tre distinkta nivåer:
- **Projekt litet** (nuvarande "Jobb") - Enkel struktur, 1 bokning
- **Projekt medel** (nuvarande "Projekt") - Full projekthantering, 1 bokning  
- **Projekt stort** (nytt) - Sammanhållande projekt för FLERA bokningar med gemensam ekonomi och logistik

## Nuläge vs Nyläge

```text
NUVARANDE:                           NYTT:
┌────────────┐                      ┌─────────────────┐
│    Jobb    │ ──────────────────▶  │  Projekt litet  │
│ (1 bokning)│                      │   (1 bokning)   │
└────────────┘                      └─────────────────┘

┌────────────┐                      ┌─────────────────┐
│  Projekt   │ ──────────────────▶  │  Projekt medel  │
│ (1 bokning)│                      │   (1 bokning)   │
└────────────┘                      └─────────────────┘

                                    ┌─────────────────┐
                   NYTT ──────────▶ │  Projekt stort  │
                                    │ (N bokningar)   │
                                    │   "Mässprojekt" │
                                    └─────────────────┘
```

## Arkitektur för "Projekt stort"

```text
┌──────────────────────────────────────────────────────────────────┐
│                     PROJEKT STORT (Huvudprojekt)                  │
│  Namn: "Stockholmsmässan 2026"                                   │
│  Status: Pågående                                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                 GEMENSAMMA RESURSER                       │    │
│  │  • Samordnad ekonomi (budget, kostnader, fakturering)    │    │
│  │  • Gemensam personal-pool                                 │    │
│  │  • Samordnad logistik/transport                          │    │
│  │  • Övergripande uppgifter & filer                        │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐     │
│  │   Kund ABC      │ │   Kund XYZ      │ │   Kund 123      │     │
│  │   (Bokning 1)   │ │   (Bokning 2)   │ │   (Bokning N)   │     │
│  │   Monter A1     │ │   Monter B5     │ │   Monter C12    │     │
│  │   ────────────  │ │   ────────────  │ │   ────────────  │     │
│  │   • Produkter   │ │   • Produkter   │ │   • Produkter   │     │
│  │   • Leverans    │ │   • Leverans    │ │   • Leverans    │     │
│  │   • Kontakt     │ │   • Kontakt     │ │   • Kontakt     │     │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘     │
│                              ...                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Databasändringar

### Ny tabell: `large_projects`
```sql
CREATE TABLE large_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  project_leader TEXT,
  location TEXT,           -- Gemensam plats (t.ex. "Stockholmsmässan")
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Ny kopplingstell: `large_project_bookings`
```sql
CREATE TABLE large_project_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id UUID REFERENCES large_projects(id) ON DELETE CASCADE,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  display_name TEXT,       -- T.ex. "Monter A1" eller anpassat namn
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(large_project_id, booking_id)
);
```

### Stödtabeller för Projekt stort
```sql
-- Uppgifter för stora projekt
CREATE TABLE large_project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id UUID REFERENCES large_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  deadline DATE,
  completed BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Filer för stora projekt
CREATE TABLE large_project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id UUID REFERENCES large_projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  url TEXT NOT NULL,
  uploaded_by TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kommentarer för stora projekt
CREATE TABLE large_project_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  large_project_id UUID REFERENCES large_projects(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Uppdatering av `bookings`-tabellen
```sql
-- Lägg till referens till storprojekt
ALTER TABLE bookings ADD COLUMN large_project_id UUID REFERENCES large_projects(id);
```

## UI-förändringar

### 1. Projekthantering-dashboard (/projects)

**Tre kolumner/sektioner:**

| Projekt litet | Projekt medel | Projekt stort |
|---------------|---------------|---------------|
| Korta jobb    | Standard      | Mässor etc.   |
| 1 bokning     | 1 bokning     | N bokningar   |

### 2. "Skapa projekt"-dialogen

Ny första fråga: **Vilken typ av projekt?**
- Projekt litet (snabbt, enkelt)
- Projekt medel (fullständig projekthantering)
- Projekt stort (flera bokningar, samordning)

### 3. Ny detaljsida för Projekt stort

**Flikar:**
- **Översikt** - Alla kopplade bokningar i en lista/grid
- **Bokningar** - Lägg till/ta bort bokningar, sök bland tillgängliga
- **Gemensam ekonomi** - Aggregerad budget för alla bokningar
- **Personal** - Gemensam personalpool för hela projektet
- **Transporter** - Samordnad logistik
- **Filer** - Dokument på projektnivå
- **Kommentarer** - Kommunikation

## Funktionalitet för Projekt stort

### A. Lägga till bokningar
- Sök bland bekräftade bokningar
- Filtrera på datum, kund, adress
- Bulk-lägg till flera samtidigt
- Ge varje bokning ett visningsnamn (t.ex. "Monter A1")

### B. Samordnad ekonomi
- Visa aggregerad budget för alla bokningar
- Produktkostnader per bokning + totalt
- Arbetskostnader för hela projektet
- Gemensamma inköp (som inte tillhör specifik bokning)

### C. Personalhantering
- Tilldela personal till hela storprojektet
- Personal kan sedan fördelas på enskilda bokningar
- Översikt: vem jobbar var och när

### D. Transport/Logistik
- Gemensam leveransadress (t.ex. mässhallen)
- Enskilda leveranspunkter per bokning
- Samordnad packlista för hela projektet

## Implementation (steg-för-steg)

### Fas 1: Namnbyte
1. Byt "Jobb" → "Projekt litet" i UI
2. Byt "Projekt" → "Projekt medel" i UI
3. Uppdatera statusetiketter och ikoner

### Fas 2: Databas
1. Skapa nya tabeller (`large_projects`, etc.)
2. Lägg till `large_project_id` i `bookings`
3. Skapa RLS-policies

### Fas 3: Projekt stort - Grundfunktionalitet
1. Lista/skapa/ta bort storprojekt
2. Koppla bokningar till storprojekt
3. Detaljsida med flikar

### Fas 4: Avancerade funktioner
1. Aggregerad ekonomi
2. Gemensam personalhantering
3. Samordnad logistik

## Tekniska filer att skapa/ändra

### Nya filer:
| Fil | Beskrivning |
|-----|-------------|
| `src/types/largeProject.ts` | TypeScript-typer |
| `src/services/largeProjectService.ts` | API-anrop |
| `src/pages/LargeProjectDetail.tsx` | Detaljsida |
| `src/components/large-project/` | UI-komponenter |

### Filer att ändra:
| Fil | Ändring |
|-----|---------|
| `src/pages/ProjectManagement.tsx` | Tre-kolumns layout, namnbyte |
| `src/components/project/JobsListPanel.tsx` | Byt "Jobb" → "Projekt litet" |
| `src/components/project/IncomingBookingsList.tsx` | Tre knappar istället för två |
| `src/types/job.ts` | Behåll men uppdatera kommentarer |
| Navigation/meny-komponenter | Uppdatera etiketter |

## Förväntade tidsåtgång

| Fas | Uppskattad tid |
|-----|----------------|
| Fas 1: Namnbyte | 1-2h |
| Fas 2: Databas | 2-3h |
| Fas 3: Grundfunktionalitet | 4-6h |
| Fas 4: Avancerat | 4-6h |
| **Totalt** | **~15h** |

---

Vill du att jag börjar implementera? Jag rekommenderar att börja med **Fas 1 (namnbyte)** för att snabbt se förändringen i gränssnittet, sedan fortsätta med databas och ny funktionalitet.
