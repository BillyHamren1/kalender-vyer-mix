

# Återöppna felstängda projekt

## Vad som byggs

En "Återöppna projekt"-funktion som:
1. Sätter tillbaka lokal status från `completed` till föregående status
2. Skickar en `reopen_project`-signal till Booking-systemet
3. Tillgänglig via en knapp på stängda projekt i "Under slutförande"-vyn

## Teknisk plan

### 1. Ny API-funktion i `planningApiService.ts`
Lägg till `markReopenedInBooking(bookingId)` som anropar proxyn med `type=reopen_project`, body `{ status: 'REOPENED' }`.

### 2. Ny service-funktion i `bookingCloseSyncService.ts`
Lägg till `reopenBookingsInInvoicing(bookingIds)` — samma mönster som `syncBookingsForInvoicing` men anropar `markReopenedInBooking` istället.

### 3. Uppdatera `planning-api-proxy` Edge Function
Lägg till loggning för `reopen_project`-typen (samma mönster som `close_project`). Proxyn vidarebefordrar redan alla typer generiskt, så ingen ny routing behövs — bara loggning.

### 4. UI: "Återöppna"-knapp i `ClosingProjectsList.tsx`
- Visa en "Återöppna"-knapp på rader med status `completed` (stängda projekt)
- Knappen öppnar en bekräftelsedialog
- Vid bekräftelse:
  - Anropar `reopenBookingsInInvoicing` med projektets booking_id(s)
  - Om synk lyckas: sätter status tillbaka (`jobs` → `planned`, `projects` → `delivered`, `large_projects` → `delivered`)
  - Invaliderar queries

### 5. UI: Även i `ProjectEconomyPage.tsx` och `ProjectEconomyDetail.tsx`
- På stängda projekt, visa "Återöppna"-knapp bredvid STÄNGD-badgen
- Samma logik som ovan

---

## Info att ge till Booking-teamet

När implementationen är klar kan du skicka detta till Booking-teamet:

```text
=== NY ENDPOINT: reopen_project ===

Vi skickar nu även en signal när ett projekt återöppnas (ångrat stängning).

Anrop som görs:
  POST {EF_SUPABASE_URL}/functions/v1/planning-api?type=reopen_project&booking_id=<UUID>
  Header: x-api-key: <PLANNING_API_KEY>
  Body: { "status": "REOPENED" }

Förväntad hantering:
  - Ta bort bokningen från faktureringskön (READY_FOR_INVOICING → DRAFT/CONFIRMED)
  - Returnera { success: true } vid lyckad hantering
  - Returnera { error: "..." } vid fel

Detta är motsatsen till close_project. Tidslinjen:
  1. close_project  → Bokning läggs i faktureringskö
  2. reopen_project → Bokning tas BORT ur faktureringskö

Om reopen_project-endpointen inte finns ännu kommer vårt system
visa ett felmeddelande och projektet förblir stängt tills synk lyckas.
```

