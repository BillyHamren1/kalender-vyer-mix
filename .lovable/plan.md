# Plan: få webhook-jobb att verkligen uppdatera Planning

## Vad jag har bekräftat
- Bokning **2605-5** finns lokalt i `bookings` men dess `updated_at` är fortfarande från igår kväll.
- Samtidigt finns flera `booking_sync_jobs` för exakt den bokningen idag med status **completed**.
- Det betyder att webhooken/kön tas emot och markeras klar, men att den faktiska skrivningen till Planning uteblir.

## Trolig rotorsak
`process-sync-jobs` anropar `import-bookings` i `incremental`-läge.
Men `import-bookings` är just nu byggd så att **alla icke-single-körningar köar vidare jobb istället för att applicera datat inline**.
Då uppstår detta felmönster:

```text
receive-booking -> booking_sync_jobs: pending
process-sync-jobs claimar jobbet
process-sync-jobs -> import-bookings(incremental)
import-bookings hämtar externa ändringar men köar bara vidare / hoppar över aktiva jobb
process-sync-jobs markerar ursprungsjobbet som completed
Ingen faktisk update av bookings/calendar_events sker
```

## Jag kommer att ändra
1. **Rätta kontraktet mellan worker och import**
   - Införa ett explicit worker-/apply-läge så att `import-bookings` vid köad inkrementell körning faktiskt **persisterar bokningar/events/products** istället för att bara köa vidare.
   - Behålla nuvarande snabbare intake i `receive-booking`.

2. **Skydda mot falsk “completed”**
   - Se till att `process-sync-jobs` bara markerar jobb som completed när importen verkligen har kört appliceringssteget.
   - Om importen bara returnerar “queued” eller tom applicering av fel skäl ska jobbet inte räknas som klart tyst.

3. **Lägga till riktade tester för regressionsskydd**
   - Ett test för hela kedjan: `receive-booking`/kö/worker/import ska ge verklig uppdatering i `bookings`.
   - Ett test som fångar just denna bug: worker får inte “slänga” en uppdatering genom att markera jobb completed utan lokal write.

4. **Verifiera på den riktiga bokningen**
   - Köra en ny synk för 2605-5.
   - Kontrollera att lokal `bookings.updated_at` ändras och att Planning därefter får realtime/invalidation på korrekt sätt.

## Tekniska ändringar
- `supabase/functions/process-sync-jobs/index.ts`
- `supabase/functions/import-bookings/index.ts`
- ev. kompletterande test i `supabase/functions/process-sync-jobs/*` eller ny Deno-test för worker→import-kontraktet

## Resultat efter fix
- När Planning svarar med `job_id` + `pending` ska bokningen inte bara accepteras i kön, utan också verkligen landa i Planning-databasen.
- UI:t behöver då inte gissa eller poll:a fram förändringen; det ska komma via den normala dataskrivningen + realtime/invalidation.