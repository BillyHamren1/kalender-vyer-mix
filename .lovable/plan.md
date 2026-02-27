

## Plan: Skicka faktureringsignal till EventFlow vid projektstängning

### Valt tillvägagångssätt: Uppdatera bokningens status via `planning-api-proxy`

Detta är det säkraste och mest robusta alternativet eftersom:
- All ekonomikommunikation redan flödar genom `planning-api-proxy` till EventFlow
- Autentisering (JWT + PLANNING_API_KEY) redan hanteras
- Ingen ny infrastruktur behövs — bara en ny `type` i befintlig proxy
- Transaktionell: stängningen sker bara om API-anropet lyckas

### Steg

1. **Lägg till `markReadyForInvoicing` i `planningApiService.ts`**
   - Ny funktion som anropar `callPlanningApi({ type: 'close_project', method: 'POST', booking_id, data: { status: 'READY_FOR_INVOICING' } })`

2. **Uppdatera `handleCloseProject` i `ProjectEconomyDetail.tsx`**
   - Innan lokalt statusbyte: anropa `markReadyForInvoicing(project.booking_id)`
   - Om det misslyckas: visa felmeddelande, avbryt stängning
   - Om det lyckas: uppdatera lokal status till `completed` som idag

3. **Felhantering**
   - Om API-anropet till EventFlow misslyckas visas toast med "Kunde inte signalera faktureringssystemet — försök igen"
   - Projektet förblir öppet tills signalen bekräftas

### Teknisk detalj

Flödet blir:
```text
Användare klickar "Markera som avslutat"
  → checklist valideras
  → POST till planning-api-proxy (type: 'close_project', booking_id)
    → proxy vidarebefordrar till EventFlow planning-api
    → EventFlow markerar bokning som READY_FOR_INVOICING
  → Om OK: lokal UPDATE projects.status = 'completed'
  → Om FEL: toast-felmeddelande, projektet förblir öppet
```

EventFlow-sidan behöver hantera `type: 'close_project'` i sin `planning-api`. Om detta inte redan finns där behöver det implementeras externt — men signaleringsflödet härifrån är klart.

