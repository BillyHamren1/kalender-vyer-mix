
# Nya bokningar direkt pa dashboarden

## Problem
Dashboarden visar bara en siffra ("Ooppnade bokningar") som en klickbar widget. Det finns ingen lista med nya bokningar och inga atgardsknappar -- man tvingas navigera bort fran dashboarden for att gora nagonting.

## Losning
Lagg till en fullstandig lista med nya bokningar direkt pa dashboarden, med samma triage-knappar (Litet, Medel, Stort) som redan finns pa projekthanteringssidan. Listan placeras mellan KPI-widgetarna och kalendervyn.

## Andringar

### 1. Ny komponent: `DashboardNewBookings`
Skapar en ny komponent `src/components/dashboard/DashboardNewBookings.tsx` som:
- Hamtar alla bekraftade bokningar utan projekt (samma fraga som `IncomingBookingsList`)
- Visar en scrollbar lista med bokningar (klientnamn, bokningsnummer, eventdatum, leveransadress)
- Har tre atgardsknappar per bokning:
  - **Litet** -- skapar ett litet projekt (jobb) direkt
  - **Medel** -- oppnar CreateProjectWizard
  - **Stort** -- oppnar AddToLargeProjectDialog
- Klick pa bokningsraden navigerar till bokningsdetaljen
- Visar "Inga nya bokningar" om listan ar tom

### 2. Uppdatera `PlanningDashboard.tsx`
- Importera `DashboardNewBookings`, `CreateProjectWizard`, och `AddToLargeProjectDialog`
- Lagg till state for wizard-dialogen och storprojekt-dialogen
- Placera `DashboardNewBookings` mellan KPI-widgetarna och filtrerings/kalendersektion
- Invalidera relevanta queries vid framgangsrik projektskaping

## Teknisk detalj

```text
+-------------------------------+
|  KPI Widgets (som idag)       |
+-------------------------------+
|  NYA BOKNINGAR (ny sektion)   |
|  [#123 Kund A  12/3  Litet Medel Stort] |
|  [#124 Kund B  15/3  Litet Medel Stort] |
+-------------------------------+
|  Filters + Kalendervy         |
+-------------------------------+
```

### Filer som andras

| Fil | Andring |
|-----|---------|
| `src/components/dashboard/DashboardNewBookings.tsx` | Ny fil -- bokningslista med triage-knappar |
| `src/pages/PlanningDashboard.tsx` | Importera och visa nya komponenten + dialoger |

### Ateranvandning
- Ateranvander `createJobFromBooking` fran `jobService` for "Litet"-knappen
- Ateranvander `CreateProjectWizard` for "Medel"-knappen  
- Ateranvander `AddToLargeProjectDialog` for "Stort"-knappen
- Samma datahamtningslogik som `IncomingBookingsList` (bekraftade bokningar utan projekt)
