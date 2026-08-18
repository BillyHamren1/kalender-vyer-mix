# Avbokade bokningar ligger kvar i "Nya bokningar"

## Vad jag ser i systemet

Bokning `#2608-43` ("11 - TEST - !!") ligger lokalt kvar med status `CONFIRMED`, utan projekt och utan koppling till stort projekt. Därför visas den korrekt (enligt nuvarande regler) i listan "Nya bokningar".

Orsaken till att den inte blivit avbokad lokalt är en medveten säkerhetsspärr som lades in efter incidenten då ~80 bokningar massavbokades av misstag:

- Normal sync (`import-bookings`) utför **aldrig** avbokning. Den loggar bara en "cancellation candidate".
- Den aktiva avbokningsreconcilern (`reconcile-booking-status`) kräver miljöflaggan `AUTOMATIC_DESTRUCTIVE_SYNC_ENABLED=true`, som är avstängd, och har hård gräns på 1 avbokning per körning.
- Det finns **ingen UI-väg** för att godkänna en kandidat manuellt. Alltså fastnar varje extern avbokning i limbo.

Att den externa bokningen verkligen är avbokad är ännu inte bekräftat mot API:t — det blir steg 1.

## Förslag: manuell, säker avbokningsväg (människa i loopen)

Behåll spärren mot automatisk massavbokning, men gör kandidaterna synliga och åtgärdbara.

1. **Verifiera källan**: kör `reconcile-booking-status` i dry-run för organisationen och bekräfta att `#2608-43` rapporteras som CANCELLED externt.
2. **Ny explicit apply-väg**: lägg till action `apply_cancellation` i `reconcile-booking-status` som tar EN `booking_id`, hämtar extern status på nytt, kräver att den är CANCELLED, och kör `applyBookingCancellation` (samma single source of truth). Ingen batch, ingen flagga behövs, allt loggas.
3. **Synliggör i planeringen**: i "Nya bokningar"/"Inkommande bokningar" markeras bokningar som är avbokade i bokningssystemet med röd rad + badge "Avbokad i bokning", istället för grön "Placera"-rad. Knappen blir "Avboka här" (bekräftelsedialog med bokningsnummer).
4. **Kandidatkälla**: lätt statuskontroll per synlig kandidat via samma dry-run-läge (inga skrivningar), så listan kan flagga rätt rader utan att förlita sig på cron.
5. **Test**: utöka befintlig kontraktstestsvit med fall för `apply_cancellation` (fel om extern status ≠ CANCELLED, idempotent om redan avbokad lokalt, max 1 bokning per anrop) och kör hela sync-sviten.

## Teknisk detalj

- `supabase/functions/reconcile-booking-status/index.ts`: ny action, org-verifierad via `tenantGuard`, återanvänder `fetchExternalStatus` + `parseSingleBookingSourceResponse` + `evaluateDestructiveAction`.
- `supabase/functions/_shared/cancellation-handler.ts`: oförändrad — enda skrivvägen.
- `src/components/project/IncomingBookingsList.tsx`: ny visuell status + bekräftelsedialog; ingen ändring av placeringsflödet.
- Automatflaggan förblir avstängd; ingen massavbokning möjlig.

## Alternativ (om du hellre vill)

Slå på automatiken igen med höjd men begränsad gräns (t.ex. 5/körning) så avbokningar går igenom av sig själva. Snabbare, men återinför risken från incidenten. Jag rekommenderar den manuella vägen ovan.
