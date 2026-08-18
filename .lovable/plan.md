# Avbokade bokningar ska synas som avbokade — inte ligga kvar som nya

## Vad jag ser i systemet

Bokning `#2608-43` ("11 - TEST - !!") ligger lokalt kvar med status `CONFIRMED`, utan projekt och utan koppling till stort projekt. Därför visas den i listan "Nya bokningar" med grön "Placera"-knapp.

Orsaken: efter incidenten då ~80 bokningar massavbokades av misstag spärrades all automatisk avbokning:

- Normal sync (`import-bookings`) utför aldrig avbokning — den loggar bara en "cancellation candidate".
- Reconcilern (`reconcile-booking-status`) kräver miljöflaggan `AUTOMATIC_DESTRUCTIVE_SYNC_ENABLED=true` (avstängd) och har hård gräns 1 avbokning/körning.
- Det finns ingen UI-väg för att se eller godkänna kandidaterna → avbokningar fastnar i limbo.

## Så här ska det fungera

En avbokning i bokningssystemet ska alltid **synas** i planeringen, i samma inkorg som uppdaterade bokningar:

```text
Inkommande bokningar
  Uppdaterade · kräver granskning
    ● Kund AB    #2608-43    AVBOKAD I BOOKING   [ Granska ]
  Nya bokningar · ska placeras
    ● Drivex AB  #2608-44                        [ Placera ]
```

1. **Avbokade bokningar lämnar "Nya bokningar"** och hamnar i sektionen "Uppdaterade / kräver granskning" med röd accent och badge "Avbokad i booking".
2. **Granska-dialogen** för en avbokad bokning visar tydligt "Bokningen är avbokad i bokningssystemet" plus datum/kund, och har en primärknapp "Bekräfta avbokning" som faktiskt avbokar lokalt (projekt/jobb/kalenderposter/packning stängs via befintlig `applyBookingCancellation`).
3. **Ingen tyst massavbokning**: en människa bekräftar per bokning. Automatflaggan förblir avstängd.

## Så upptäcks avbokningarna

- `reconcile-booking-status` körs redan via cron och känner igen mismatchen. Istället för att bara logga kandidaten ska den skriva ner den som en synlig post (kandidatlista per organisation) som planeringens inkorg läser.
- Kandidaten lagras som en bokningsändring av typen `status → CANCELLED`, så den plockas upp av den befintliga "osedda uppdateringar"-mekaniken (`get_unseen_booking_updates`) och försvinner när den granskats/bekräftats.

## Tekniskt

- `supabase/functions/reconcile-booking-status/index.ts`: när extern status = CANCELLED och lokal ≠ CANCELLED → registrera kandidat (booking_changes-rad + markering på bokningen), fortfarande utan destruktiv mutation.
- Ny action `apply_cancellation` (en `booking_id` per anrop, org-verifierad, hämtar extern status på nytt och kräver CANCELLED) som anropar `applyBookingCancellation` i `_shared/cancellation-handler.ts` — enda skrivvägen, oförändrad.
- `src/components/project/IncomingBookingsList.tsx`: filtrera bort avbokningskandidater ur "Nya"; rendera dem i uppdateringssektionen med röd accent + badge.
- `src/components/project/ProjectUpdateDialog.tsx`: avbokningsläge med "Bekräfta avbokning".
- Tester: kontraktstest för `apply_cancellation` (fel om extern status ≠ CANCELLED, idempotent om redan avbokad, max 1 bokning/anrop) + test att avbokade kandidater aldrig visas som "ny bokning". Kör sync-sviten efteråt.

## Verifiering efter bygget

Kör reconcilern mot organisationen, kontrollera att `#2608-43` flyttas från "Nya bokningar" till "Uppdaterade · avbokad", bekräfta avbokningen och verifiera i databasen att status blir CANCELLED och att kalender/projekt städas.
