Jag har hittat det faktiska felet.

Problemet är inte bara att ett API-anrop failar — det farliga är att sidan först sparar datumen lokalt i `large_projects`, och först därefter försöker skriva till bokningssystemet. När `planning-api-proxy` returnerar `400 {"error":"Unknown type: update_booking"}`, blir resultatet att UI:t ser sparat ut trots att source-of-truth inte har uppdaterats.

Do I know what the issue is?
Ja.

Exakt problem
- `src/pages/project/LargeProjectLayout.tsx` kör `detail.updateProject(...)` direkt i början av `handleScheduleUpdate`.
- Först efter det försöker den köra `propagateProjectDatesToBookings(...)`.
- `propagateProjectDatesToBookings` använder `updateBookingDatesViaApi(...)` i `src/services/planningApiService.ts`.
- Den tjänsten skickar `type: 'update_booking'` till `planning-api-proxy`.
- Den deployade proxyn/external planning API svarar nu med `Unknown type: update_booking`.
- Därför sparas datum bara i lokal projekt-UI/state, inte i bokningssystemet/databasen som är sanningen.

Plan

1. Gör sparflödet transaktionellt ur användarens perspektiv
- Ändra `handleScheduleUpdate` i `src/pages/project/LargeProjectLayout.tsx` så att den inte uppdaterar `large_projects` först.
- Kör bokningsskrivningen först.
- Uppdatera lokal `large_projects`-spegel och Gantt först efter att bokningsskrivningen faktiskt lyckats.
- Om bokningsskrivningen failar ska inga lokala datum stå kvar som “sparade”.

2. Lägg in tydlig rollback/failsafe
- Om någon lokal uppdatering ändå redan hunnit ske, revert:a den eller invalidatea queryn direkt så att UI:t laddar om servervärden.
- Byt success/error-hantering så att toast och visning matchar verklig persistens.
- Säkerställ att användaren aldrig lämnas i ett läge där datum ser sparade ut fast de inte är det.

3. Isolera booking write contractet
- Gå igenom `src/services/planningApiService.ts` och samla booking-write-funktionerna bakom en tydlig wrapper.
- Förbered koden så att booking update-kontraktet kan justeras på ett ställe när vi verifierat vad den deployade externa `planning-api` faktiskt accepterar.
- Behåll övriga typer (`purchases`, `supplier_invoices`, osv.) orörda.

4. Fixa den verkliga skrivvägen mot bokningssystemet
- Uppdatera `planning-api-proxy` och/eller frontend-kontraktet så att booking-uppdateringar använder den request-form som den nuvarande deployade externa `planning-api` faktiskt stödjer.
- Jag kommer verifiera mot befintliga mönster i projektet innan ändringen görs brett, eftersom tidigare försök på just detta har gått fram och tillbaka.
- Målet är att datumändringar för `rig`, `event` och `rigDown` verkligen persisteras i source-of-truth.

5. Säkerställ att import/spegeln uppdateras efter lyckad write
- Behåll eller justera `import-bookings`-triggern i `src/services/largeProjectScheduleSync.ts` så att kalender/event-spegeln fortfarande regenereras efter lyckad bokningsuppdatering.
- Ingen import ska köras som “maskerar” ett misslyckat write.

6. Lägg på skydd för framtida regressions
- Lägg till defensiv felhantering kring save-flödet så att samma problem inte kan uppstå igen för andra booking writes.
- Om det är rimligt i scope: återanvänd samma säkra princip även för andra hooks som använder `updateBookingDatesViaApi`, så att de inte visar falskt sparad state.

Tekniska detaljer
- Berörda filer:
  - `src/pages/project/LargeProjectLayout.tsx`
  - `src/services/largeProjectScheduleSync.ts`
  - `src/services/planningApiService.ts`
  - eventuellt `supabase/functions/planning-api-proxy/index.ts`
  - eventuellt även `src/hooks/booking/useBookingDates.tsx` om samma osäkra mönster behöver hårdnas där

- Bekräftad felkedja:
```text
LargeProjectScheduleEditable
  -> handleScheduleUpdate()
    -> detail.updateProject(...)          [lokalt/UI ser sparat ut]
    -> propagateProjectDatesToBookings()
      -> updateBookingDatesViaApi()
        -> planning-api-proxy
          -> external planning-api
             -> 400 Unknown type: update_booking
```

- Säkerhetsprincip för fixen:
```text
source-of-truth write först
  -> om OK: uppdatera local mirror + invalidate queries + success toast
  -> om FAIL: ingen kvarvarande lokal "sparad" state
```

När du godkänner planen implementerar jag detta direkt.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>
<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>