

## Plan: Byt teal till lila i Projekt, Logistik, Personal & Ekonomi — via CSS-override

### Problem
Bara PageHeader-ikonerna ändrades till lila. Alla knappar, badges, ikoner, borders, tab-indikatorer och andra UI-element i dessa sektioner använder fortfarande `bg-primary`, `text-primary`, `border-primary` etc. som pekar på teal (`--primary: 184 55% 38%`).

Det finns 1000+ references till `primary` i ~60 komponentfiler under dessa sektioner. Att byta varje enskild referens manuellt är opraktiskt och skapar underhållsproblem.

### Lösning: CSS-scope override

Skapa en CSS-klass `.theme-purple` som omdefinierar `--primary` och relaterade variabler till lila. Wrappa sedan varje berörd sida med den klassen. Alla `bg-primary`, `text-primary`, `border-primary/X` etc. inom wrappern blir automatiskt lila.

### Teknisk implementation

**1. Lägg till i `src/index.css` — ny theme-klass:**
```css
/* Purple theme override for Project/Logistics/Staff/Economy sections */
.theme-purple {
  --primary: 270 45% 55%;
  --primary-hover: 270 45% 48%;
  --primary-dark: 280 50% 42%;
  --ring: 270 45% 55%;
  --gradient-icon: linear-gradient(135deg, hsl(270 45% 60%) 0%, hsl(280 50% 45%) 100%);
  --gradient-teal: linear-gradient(135deg, hsl(270 45% 55%) 0%, hsl(280 50% 42%) 100%);
  --shadow-btn-primary: 0 3px 0 hsl(280 50% 35%);
  --shadow-soft: 0 1px 2px hsl(270 30% 15% / 0.08), 0 1px 4px hsl(270 30% 15% / 0.05);
}
```

**2. Skapa en wrapper-komponent `src/components/ui/PurpleTheme.tsx`:**
En enkel wrapper som lägger `className="theme-purple"` runt children. Alternativt läggs klassen direkt i `PageContainer` via en prop.

**3. Uppdatera varje berörd sida (wrappa med `theme-purple`):**
Sidor som behöver wrappas:
- `src/pages/ProjectManagement.tsx`
- `src/pages/MyProjects.tsx`
- `src/pages/ProjectArchive.tsx`
- `src/pages/LargeProjectDetail.tsx`
- `src/pages/EconomyOverview.tsx`
- `src/pages/ProjectEconomyDetail.tsx`
- `src/pages/LogisticsHub.tsx`
- `src/pages/LogisticsVehicles.tsx`
- `src/pages/CustomCalendarPage.tsx`
- `src/pages/OpsControlCenter.tsx`
- `src/pages/PlanningDashboard.tsx`
- `src/pages/StaffManagement.tsx`
- `src/pages/StaffDashboard.tsx`
- `src/pages/StaffDetail.tsx`
- `src/pages/TimeReportApprovals.tsx`
- `src/pages/StaffRevenueOverview.tsx`

**4. PageHeader `variant="purple"` kan behållas eller tas bort** — den stylar bara ikonen med inline `hsl()` och kommer fungera oavsett, men PageHeader-knappen bör också plocka upp den nya `--primary` automatiskt om vi byter till default-variant.

**5. Uppdatera `EconomyOverview.tsx` och `LogisticsHub.tsx`** — ta bort de hårdkodade `hsl(270...)` inline-styles (från förra ändringen) och låt dem använda `var(--primary)` / `var(--gradient-icon)` istället, vilket nu automatiskt pekar på lila tack vare wrappern.

**6. Calendar CSS** — `src/components/Calendar/TimeGrid.css` har `--calendar-primary: var(--primary)` som default, så kalendern inom dessa sidor blir automatiskt lila.

### Vad detta löser
- Alla knappar (`bg-primary`) → lila
- Alla ikoner (`text-primary`) → lila
- Alla badges (`bg-primary/10 text-primary`) → lila
- Alla tab-indikatorer (`border-primary`) → lila
- Alla borders, rings, gradients → lila
- Kalendervyn i personalplanering → lila
- ~16 sidändringar + 1 CSS-tillägg istället för 60+ komponentfiler

### Vad som INTE ändras
- Sidebar (har egna `--sidebar-primary` variabler)
- Scanner/Mobile app
- Auth-sidor
- Lagerplanering (warehouse, har sin amber-theme)
- Globala delade komponenter som Button, Badge etc. (de ärver rätt färg via CSS-scope)

