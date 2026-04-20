

## Lär systemet vad "hem" betyder — tyst, från dag 2

### Vad användaren får

**1. Systemet lär sig hemma snabbt och tyst**
Redan efter **andra natten** på samma plats antar systemet att det är hemma. Ingen fråga, ingen notis, ingen bekräftelseruta. Hemma är helt enkelt där hen sover.

Om hen åker på affärsresa och sover på hotell — andra natten på hotellet räknas hotellet som hem temporärt. När hen är hemma igen växlar det automatiskt tillbaka. Allt sker i bakgrunden.

**2. Ett mjukare dagsslutsförslag**
När en resa avslutas och destinationen matchar hemplatsen, **och** användaren tidigare under dagen var aktiv på en arbetsplats utan att ha avslutat dagen, så får hen **en enda lugn fråga** — utan att appen nämner "hem":

> 🏁 **Avsluta dagen?**
> Jag misstänker att du avslutade din arbetsdag när du lämnade *Plats X* kl **17:42**.
> Stämmer detta och du vill rapportera din tid?
>
> [Ja, rapportera till 17:42] [Nej, jag ska tillbaka] [Anpassa tid]

- **Ja** → kör samma `endDay`-flöde som "Avsluta dagen"-knappen, sluttiden satt till när hen lämnade arbetsplatsen.
- **Nej** → tystar förslaget för dagen. Timern tickar vidare, vanlig kvällsbanner gäller.
- **Anpassa tid** → tidsväljare, sen samma `endDay`.

**3. Inget händer automatiskt**
Systemet stoppar fortfarande aldrig timern utan ett aktivt val. Om hen inte svarar på frågan ligger timern kvar och kvällsbannern tar över som förut.

**4. Hemplatsen är osynlig för användaren**
Ingen "Mina platser → Hem"-vy. Ingen karta. Ordet "hem" syns aldrig i UI:t — hemplatsen är en intern signal som bara används som *trigger* för förslaget. Texten användaren ser handlar bara om arbetsplatsen hen lämnade.

### Var i appen

- Ingen ny inställningssida.
- Ny dialog `EndDayOnArrivalHomeDialog` triggad direkt efter `TravelCompletedDialog` när villkoren är uppfyllda.
- Lärningen sker server-side via en daglig cron.

### Tekniska bitar

**Datamodell**
- `staff_inferred_home_locations` (staff_id, organization_id, lat, lng, radius_m, kind: `'primary' | 'temporary'`, valid_from, valid_until, confidence, last_observed_at, nights_observed). Endast server-skriven. RLS: ägaren kan läsa.
- `staff_home_observations` (staff_id, observed_date, lat, lng, dwell_minutes). Råmaterial. Raderas efter 30 dagar.

**Lärningsmotor (cron, dagligen)**
Edge function `infer-home-location` aggregerar nattvistelser (02–05) från `staff_location_history` och klustrar med grid-snap (~100 m).

- **Primary**: andra natten i rad på samma kluster → skrivs som `primary` direkt.
- **Temporary**: andra natten i rad på ett kluster som avviker från primary → skrivs som `temporary` med rullande `valid_until`.
- **Återgång**: en natt på primary igen → temporary expireras automatiskt.
- **Idempotens**: uppsert på (staff_id, kluster).

**Dagsslutsförslaget**
Ny hook `useEndDayOnArrivalHome` lyssnar på `useTravelDetection.travelCompletedInfo`:
1. Hämta aktiv inferred home (temporary före primary).
2. Haversine: destination ≤ `radius_m`.
3. Finns öppen timer eller arbetsplats-närvaro tidigare idag som aldrig stängdes?
4. Om ja → öppna dialog. Föreslagen sluttid och platsnamn = senaste `location_time_entries.exited_at` + tillhörande plats, fallback timer-slut / `travel_log.start_time`.

Dialogen återanvänder `endDay` i `useWorkSession`.

**Copy-konstant**
Texten "Jag misstänker att du avslutade din arbetsdag när du lämnade {plats} kl {tid}. Stämmer detta och du vill rapportera din tid?" hålls i en konstant i dialogfilen — inga referenser till "hem" i UI-strängar.

**Workday-flagga**
Om "Anpassa tid" avviker mer än 30 min från resans starttid → `workday_flags`-rad `home_arrival_end_day_adjusted` (intern term, syns inte för användaren).

**Tystnadsregler**
- Max en gång per dag.
- Suppressas om `last_workplace_for_day`-assistenten redan körts samma dag.
- Suppressas om ingen inferred home finns ännu (cold start).

### Berörda filer

- `src/hooks/useEndDayOnArrivalHome.ts` (ny)
- `src/components/mobile-app/EndDayOnArrivalHomeDialog.tsx` (ny)
- `src/components/mobile-app/MobileGlobalOverlays.tsx` (montera dialogen)
- `supabase/functions/infer-home-location/index.ts` (ny, cron)
- `supabase/functions/mobile-app-api/index.ts` (lägg till `get_active_home_location`)
- Ny migration: tabellerna + RLS + cron-schema
- Tester i `src/test/` och `supabase/functions/infer-home-location/`

### Tester

1. Hem identisk med arbetsplats → inget förslag.
2. Resa hem efter aktiv arbetsdag → förslag visas med korrekt platsnamn och sluttid.
3. Resa hem utan tidigare arbetsdag → inget förslag.
4. **Andra natten på samma plats** → primary skapas. Första natten ensam → ingen primary.
5. **Andra natten på hotell** → temporary skapas, primary ignoreras. Återgång hem → temporary expireras.
6. Användare väljer "Nej, jag ska tillbaka" → tyst resten av dagen.
7. Cold start: ny användare första natten → inget förslag, ingen krasch.
8. Cron körs två gånger samma dag → exakt en rad per kluster.
9. Copy-test: dialogen innehåller aldrig orden "hem", "hemma" eller "bostad".

### Vad detta INTE gör

- Nämner inte hemma i något UI.
- Visar inte hemadressen någonstans.
- Skapar inte automatiskt sluttider.
- Delar inte hemadressen med admin eller andra användare.
- Ersätter inte kvällsbannern — det är ett vänligare alternativ som kommer **före** den.

