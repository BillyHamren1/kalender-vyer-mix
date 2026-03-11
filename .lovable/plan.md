

# Plan: Parallell FullCalendar-migration med feature flag

## Sammanfattning

Ja, det är fullt möjligt. Vi bygger custom-ersättningar för de två FullCalendar-komponenterna i en separat mapp, testar dem via en feature flag, och byter över när allt fungerar.

## Komponenter att ersätta

1. **ResourceCalendar** — Resurs-tidsgrid (dagvy med team-kolumner och tidslots 06–22). Används av `MonthlyResourceCalendar` och `TestMonthlyResourceCalendar`.
2. **IndividualStaffCalendar** — Månadskalender (dayGrid) med bokningshändelser per personal. Används av `StaffMemberCalendar`.

## Arkitektur

```text
src/components/Calendar/
├── custom/                          ← NY mapp
│   ├── CustomResourceTimeGrid.tsx   ← Ersätter ResourceCalendar
│   ├── CustomMonthGrid.tsx          ← Ersätter IndividualStaffCalendar
│   ├── TimeColumn.tsx               ← Tidslots-kolumn (06:00–22:00)
│   ├── ResourceColumn.tsx           ← En team-kolumn med events
│   ├── MonthCell.tsx                ← En dag-cell i månadsvy
│   └── useCalendarGrid.tsx          ← Gemensam hook för tidsberäkning
├── ResourceCalendarSwitch.tsx       ← NY: feature-flag wrapper
└── StaffCalendarSwitch.tsx          ← NY: feature-flag wrapper
```

## Feature flag

En enkel `localStorage`-flagga: `use_custom_calendar`. Switch-komponenterna renderar antingen FullCalendar- eller custom-versionen:

```tsx
// ResourceCalendarSwitch.tsx
const useCustom = localStorage.getItem('use_custom_calendar') === 'true';
return useCustom ? <CustomResourceTimeGrid {...props} /> : <ResourceCalendar {...props} />;
```

`MonthlyResourceCalendar` och `StaffMemberCalendar` byter import till Switch-varianten.

## Steg

1. **Skapa `useCalendarGrid` hook** — Beräknar timeslots, positionerar events i pixlar baserat på start/slut-tid. Återanvänder `dateUtils.ts`.

2. **Bygga `CustomResourceTimeGrid`** — Ren React/Tailwind-grid med team-kolumner. Samma props-interface som `ResourceCalendar`. Stöd för: tidskolumn, resource-headers med personal, event-rendering via befintlig `CustomEvent`.

3. **Bygga `CustomMonthGrid`** — Månadskalender-grid. Samma props som `IndividualStaffCalendar`. Stöd för: veckodagar-header, dag-celler, event-lista med max 3 + "more"-länk, today-markering.

4. **Skapa Switch-wrappers** — `ResourceCalendarSwitch` och `StaffCalendarSwitch` med localStorage-flagga.

5. **Koppla in** — Uppdatera imports i `MonthlyResourceCalendar`, `TestMonthlyResourceCalendar` och `StaffMemberCalendar` till Switch-komponenterna.

6. **Rensa console.log** i `IndividualStaffCalendar` (5 st kvar).

## Vad som INTE ändras

- Inga API/service-ändringar
- Inga route-ändringar
- Befintliga FullCalendar-komponenter förblir intakta
- Design och färger replikeras exakt från nuvarande implementation

## Risk

Låg. FullCalendar-koden rörs inte. Feature flag gör att man kan testa custom-versionen och växla tillbaka omedelbart.

