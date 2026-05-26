## Mål
Inga oplanerade-bokningar ska visas eller räknas på Personalplanering. Allt nytt landar på **Projekt** — det är där badge och lista hör hemma.

## Ändringar

### 1. `src/components/Sidebar3D.tsx`
- Ta bort hela blocket som sätter `badge` på `/calendar` (Personalplanering) baserat på `unplannedCount`.
- I `/projects`-blocket: kombinera till `badge = unviewedCount + unplannedCount` (visa bara om > 0).
- Personalplanering renderas hädanefter helt badge-fritt.

### 2. `src/components/Calendar/UnplannedProjectsBanner.tsx`
- Bekräfta att komponenten inte längre monteras någonstans i kalendervyerna (`CustomCalendarPage`, `PersonalkalendernPage`, `ProjectCalendarView`). Om någon import finns kvar → ta bort den.
- Filen kan ligga kvar oanvänd (eller raderas) — vi rör den inte funktionellt.

### 3. Verifiering
- `rg "UnplannedProjectsBanner|unplannedCount"` ska bara träffa `Sidebar3D` (för Projekt-badge) och hooken.
- Visuellt: ladda `/calendar` → ingen "Att planera"-lista, ingen siffra i sidopanelen.
- Westmans-bokningen syns på `/projects` via befintlig `IncomingBookingsList` / `UnifiedProjectList`.
- Lägg till ett snabbt vitest-snapshot/regex-test som failar om `/calendar`-itemet får en `badge`-prop i `Sidebar3D`.

## Varför
Vi har redan beslutat (One Bulletin Board / Single Inbox-policy-andan) att bekräftade bokningar ska gå EN väg: Projekt. Att hålla en badge på Personalplanering bryter mot detta och förvirrar — bokningen finns inte ens där.
