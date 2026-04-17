
User wants the week tabs bottom bar (like in warehouse calendar) added to the **week view** in the **project staff calendar** (Personalplanering / Personalkalender in projects).

Looking at the screenshot: the warehouse calendar shows "Vecka 14, Vecka 15, Vecka 16, Vecka 17, Vecka 18" tabs at the bottom. The user wants this exact component visible on the week view in the project's staff/personnel calendar.

The component already exists: `src/components/Calendar/WeekTabsNavigation.tsx`. I just need to find the project staff/personnel calendar week view and add it.

Let me explore to find the right file.
<lov-tool-use id="toolu_vrtx_019MzwVx16v7nxHYkgZ2dZgb" name="code--search_files" integration-id="code" data="{\"query\": \"Personalkalender|Personalplanering\", \"include_patterns\": \"*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_016ioNyMQ3ReiCjiieqo79d6" name="code--search_files" integration-id="code" data="{\"query\": \"WeekTabsNavigation\", \"include_patterns\": \"*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_014ch5aLnU6mey72ZqgfJTWc" name="code--search_files" integration-id="code" data="{\"query\": \"WeekTabsNavigation\", \"include_patterns\": \"*.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01RR9jznuUhhGZ5QyNTTjpc8" name="code--search_files" integration-id="code" data="{\"query\": \"Personalplanering|StaffCalendar|PersonalKalender\", \"include_patterns\": \"*.tsx\"}">
</lov-tool-use>
The user mentioned "Personalkalender i projekt" — but the path is `/calendar` (CustomCalendarPage). It already imports WeekTabsNavigation. Let me check it.
<lov-tool-use id="toolu_vrtx_019upff9FDmgtu2oLyZJbrjA" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/CustomCalendarPage.tsx\", \"lines\": \"300-450\"}">
</lov-tool-use>
The WeekTabsNavigation only shows under monthly view. The user wants it to also appear under the WEEKLY view. Also let me check warehouse's structure to see the pattern.
<lov-tool-use id="toolu_vrtx_016ao6rVvE7vxZQeHzuLEwH2" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/WarehouseCalendarPage.tsx\", \"lines\": \"470-540\"}">
</lov-tool-use>
Wait, looking at the user's screenshot again — it shows the warehouse calendar Month view at /warehouse/calendar with Vecka 14-18 tabs at bottom. The user wants the same thing in the project staff calendar (/calendar), but specifically when **VECKA** view (weekly) is selected.

Looking at the current code: `CustomCalendarPage.tsx` only renders WeekTabsNavigation in monthly view. Need to add it in weekly view too.

I should also check the daily view — user said "VECKOVYN ska se ut som lagerkalenderns MÅNADSVY" — so they want the week tabs to appear in weekly view in the project calendar.

<lov-plan>
## Problem
I `/calendar` (Personalplanering – Projekt) visas vecknavigeringen (Vecka 14, 15, 16…) i botten **endast** när Månadsvy är vald. När man väljer **Veckovy** finns ingen sådan navigeringsbar längst ner.

I lagerkalendern (`/warehouse/calendar`) visas däremot dessa veckotabbar tydligt i Månadsvyn (se din skärmbild).

Du vill att **Veckovyn i Personalkalendern** ska få samma bottom-bar med månadens alla veckor som lagerkalenderns månadsvy.

## Lösning
En liten, fokuserad ändring i `src/pages/CustomCalendarPage.tsx`:

Lägg till `<WeekTabsNavigation>` även under blocket för `viewMode === 'weekly'` (desktop), exakt på samma sätt som det redan görs för `monthly`.

```text
viewMode === 'weekly' (desktop)
 ┌─────────────────────────────┐
 │  CustomCalendar (veckogrid) │
 ├─────────────────────────────┤
 │ [Vecka 14][Vecka 15][16]... │ ← NY bottom-bar
 └─────────────────────────────┘
```

### Detaljer
- Använder befintlig komponent `WeekTabsNavigation` (samma som i `WarehouseCalendarPage` och i monthly-vyn).
- Props: `currentMonth={monthlyDate}`, `currentWeekStart={currentWeekStart}`, `onWeekSelect={handleWeekSelect}` — alla finns redan i scope.
- Aktiv vecka markeras automatiskt (primary färg) eftersom `isSameWeek` jämför mot `currentWeekStart`.
- Klick på en veckotabb byter `currentWeekStart` → veckogriden uppdateras direkt.
- Endast desktop (inom befintlig `!isMobile`-gren). Mobil har redan sin egen `MobileWarehouseWeekSelector`-logik.

### Fil som ändras
- `src/pages/CustomCalendarPage.tsx` — lägg till `<WeekTabsNavigation>` under desktop-`CustomCalendar` i weekly-grenen (rad ~335–354), wrappa i fragment `<>...</>` precis som monthly-grenen.

Inga andra filer behöver röras. `WeekTabsNavigation` stöder redan `variant="default"` (primary färg, matchar projektkalenderns tema) — ingen variant-prop behövs här eftersom detta är projektsidan, inte warehouse.
