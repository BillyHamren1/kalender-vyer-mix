

## Plan: Lägg till "Skapa alla konton"-knapp

### Problem
Bulk-funktionen (`handleCreateAllAccounts`) finns redan i `StaffAccountsPanel.tsx` men exponeras inte i gränssnittet — det finns ingen knapp att klicka på.

### Åtgärd
Lägg till en knapp i `StaffAccountsPanel.tsx` som syns när det finns personal utan konto (`staffWithoutAccounts.length > 0`). Knappen anropar `handleCreateAllAccounts`.

### Teknisk detalj

**Fil:** `src/components/staff/StaffAccountsPanel.tsx`

- Direkt under stats-badgarna och texten "Konton skapas automatiskt…", lägg till en knapp:
  - Text: `Skapa konton för alla ({staffWithoutAccounts.length} st)`
  - Ikon: `UserPlus` (redan importerad)
  - Villkor: visas bara om `staffWithoutAccounts.length > 0`
  - Loading-state: disabled + spinner medan `isCreatingBulk` är true
  - Anropar `handleCreateAllAccounts` vid klick

- Valfritt: visa även en lista över vilka som saknar konto under knappen, så man ser vilka som kommer att få konton.

### Resultat
En tydlig knapp i Personalkonton-panelen som skapar konton (mejl + Frasse123) för all personal som saknar konto, och visar inloggningsuppgifterna i dialogen efteråt.

