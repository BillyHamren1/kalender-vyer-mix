

## Ge Lager-personal automatisk åtkomst till Scanner-appen

### Problem
Personal taggad som "Lager" har konton (staff_accounts) men det saknas en tydlig koppling och automatik som säkerställer att de kan logga in i scanner-appen. Det finns ingen teknisk blockering i koden — samma login-API (`mobile-app-api`) och samma `staff_accounts`-tabell används för båda apparna. Problemet verkar vara att Lager-personal inte alltid har konton skapade, eller att det inte är tydligt vilka appar som är tillgängliga.

### Analys
- Login-API:t (`mobile-app-api`) kontrollerar **inte** taggar — alla med ett `staff_account` kan logga in
- Scanner-API:t (`scanner-api`) kontrollerar **inte** taggar — alla autentiserade kan använda det
- Kontoskapning i `StaffAccountsPanel` nämner bara "tidrapporteringsappen"
- Det finns ingen automatik som skapar konton när en person taggas som Lager

### Lösning
Automatiskt skapa ett `staff_account` när en person taggas som "Lager" (eller "Montage") på personalkortet, om de inte redan har ett. Uppdatera UI:t så det tydligt visar vilka appar kontot ger tillgång till.

### Ändringar

**1. `src/pages/StaffDetail.tsx` — Auto-skapa konto vid Lager-taggning**
- När en person taggas som "Lager" (eller "Montage") och saknar `staff_account`:
  - Skapa automatiskt ett konto med genererat användarnamn/lösenord
  - Visa en dialog med inloggningsuppgifterna
  - Visa en tydlig indikation om vilka appar personen nu har tillgång till

**2. `src/components/staff/StaffAccountCard.tsx` — Visa app-tillgång**
- Hämta personalens taggar och visa vilka appar kontot ger tillgång till:
  - "Montage" → Tidrapporteringsappen
  - "Lager" → Scanner-appen
- Uppdatera kortets beskrivning från "tidrapporteringsappen" till att lista alla appar personen har tillgång till

**3. `src/components/staff/StaffAccountsPanel.tsx` — Uppdatera beskrivning**
- Ändra beskrivningen från "Hantera inloggningsuppgifter för tidrapporteringsappen" till "Hantera inloggningsuppgifter för mobilapparna (Tid & Scanner)"

### Flöde efter ändring
```text
Admin taggar personal som "Lager"
  → System kontrollerar om staff_account finns
  → Om nej: skapar automatiskt konto
  → Visar dialog med användarnamn + lösenord
  → StaffAccountCard visar "Scanner-appen ✓"
```

