

# Scanner med inloggning och persistent session

## Problem
Utan inloggning kan scanner-api:n antingen visa alla organisationers data (säkerhetsrisk) eller vara hårdkodad till en org (fungerar inte multi-tenant). Användaren vill ha inloggning men att enheten hålls inloggad permanent.

## Lösning
Återanvänd det befintliga **MobileAuth-systemet** (`staff_accounts` + `mobile-app-api` login) för scannern. Personalen loggar in en gång, sedan sparas token/staff i localStorage och enheten förblir inloggad.

### Ändringar

**1. Skapa `ScannerLoginPage.tsx`**
- Enkel login-sida specifikt för scannern (kan återanvända MobileLogin-designen)
- Använder `MobileAuthContext` för login
- Redirect till `/scanner` efter lyckad inloggning

**2. Wrappa scanner-routen med auth**
- I `App.tsx`: wrappa `/scanner` med `MobileAuthProvider` + `MobileProtectedRoute`
- Ny route `/scanner/login` för inloggningssidan
- `MobileProtectedRoute` redirectar till `/scanner/login` (inte `/m/login`)

**3. Uppdatera `scanner-api` edge function**
- Ta bort hårdkodad `ORG_ID`
- Kräv `token` i request body (samma JWT som `mobile-app-api` genererar)
- Verifiera token via `staff_accounts`-tabellen
- Hämta `organization_id` från den inloggade personalens staff-record
- Filtrera all data på den organisationen

**4. Uppdatera `scannerService.ts`**
- Skicka med `getToken()` från `mobileApiService` i varje API-anrop
- `callScannerApi` inkluderar `token` i request body

**5. Uppdatera `main.tsx` redirect**
- Ändra native redirect från `/scanner` till `/scanner` (oförändrat — `MobileProtectedRoute` hanterar redirect till login om ej inloggad)

### Flöde
```text
Enhet startar → /scanner → MobileProtectedRoute
  ├─ Ingen token → /scanner/login → logga in → sparas i localStorage → /scanner
  └─ Token finns → verifiera i bakgrund → visa packlistor (filtrerade på org)
```

### Säkerhet
- Varje request autentiseras med token
- `organization_id` hämtas server-side från staff-record — kan inte manipuleras
- Token sparas persistent i localStorage — enheten förblir inloggad
- Om token blir ogiltig → redirect till login automatiskt

