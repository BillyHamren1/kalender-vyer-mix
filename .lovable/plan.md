## Mål
Restid ska aldrig auto-starta på morgonpendlingen till första jobbet. Men när arbetsdagen väl har börjat ska systemet inte bli så hårt att legitima arbetsresor blockeras bara för att användaren mellanlandar på t.ex. Bauhaus.

## Fastslagna regler
1. Auto-restid får aldrig skapa dagens första arbetssignal.
2. Före dagens första riktiga arbetsbesök ska all auto-detekterad resa ignoreras.
3. Ett riktigt arbetsbesök kan vara:
   - fast plats / lager
   - internt lagerprojekt
   - vanligt jobb / booking
   - stort projekt
4. När arbetsdagen redan har börjat får resa fortsätta fungera mellan arbetsärenden samma dag.
5. Okända stopp under pågående resa (t.ex. Bauhaus, tankning, lunch) ska varken avsluta eller ogiltigförklara resan.
6. `travel_start` får inte längre starta arbetsdagen.
7. Privat resa ska aldrig auto-loggas före första arbetsbesöket; vill användaren lägga in sådan tid får det ske manuellt i efterhand.

## Varför Upplandsgatan startade men inte Wenngarn
Nuvarande flöde startar resa när hastigheten varit hög nog i 15 sekunder. Servern blockerar bara om användaren fortfarande är inne i en känd geofence. Det betyder:
- Wenngarn blockerades medan användaren fortfarande var "inne på jobbet".
- Först när hastighetströskeln uppfylldes utanför geofence blev start tillåten.
- Då råkade första giltiga punkten vara Upplandsgatan.
- Dessutom kopplas resa idag till `autoStartWorkDay('travel_start')`, vilket gör felet större än bara restiden.

## Implementation
### 1. Gör första-resan-spärren explicit
Uppdatera klient och server så att auto-detekterad resa bara får starta om dagen redan har börjat på riktigt.

Klientlogik:
- `src/hooks/useTravelDetection.ts`
  - innan `createTravelLog` körs, kontrollera om användaren redan har haft ett riktigt arbetsbesök idag
  - om inte: nollställ debounce och starta inte resa
  - ta bort kopplingen som idag kör `autoStartWorkDay('travel_start')`

Serverlogik:
- `supabase/functions/mobile-app-api/index.ts`
  - i `handleStartTravelLog` lägg en hård backstop för `auto_detected`
  - returnera `409` för första-morgon-resor där ingen tidigare arbetsnärvaro finns idag
  - tillåt manuell restid även fortsättningsvis

### 2. Räkna även lager/fasta platser som giltig dagstart
Idag skickas `reportArrival` för project/booking, men inte för fasta platser.

Ändring:
- `src/hooks/useGeofencing.ts`
  - när användaren går in i en fast plats/lager, skicka också `mobileApi.reportArrival({ kind: 'location', ... })`

Det gör att "kom till jobbet först, åk sedan vidare" fungerar även om första stoppet är lager/fast plats.

### 3. Behåll mjukt beteende efter dagstart
Efter att första arbetsbesöket finns registrerat ska vi inte lägga på en för hård spärr som blockerar senare resor samma dag.

Det innebär:
- vi kräver inte att varje ny GPS-punkt måste vara ett projekt
- vi kräver inte att Bauhaus eller annat mellan-stopp ska vara en känd arbetsplats
- pågående resa fortsätter tills användaren anländer till nästa kända arbetsplats eller stoppar manuellt

### 4. Använd arbetskontext som stöd, inte som total spärr
Vi kan fortfarande bära med senaste `workplace-exit` som klientkontext för bättre felsökning och återhämtning, men inte göra den till en absolut blockerare efter dagstart.

### 5. Testning
Lägg till regressionstester för att låsa följande:
- morgonpendling hem -> jobb startar inte auto-restid
- Wenngarn/lager som första arbetsbesök öppnar för senare resa samma dag
- jobb/lager -> Bauhaus -> nästa jobb blockeras inte mitt i dagen
- `travel_start` kan inte längre öppna workday
- servern returnerar tydlig 409-reason för pre-workday commute

## Filer att ändra
- `src/hooks/useTravelDetection.ts`
- `src/hooks/useGeofencing.ts`
- `src/services/workdayServerSync.ts`
- `supabase/functions/mobile-app-api/index.ts`
- relevanta testfiler för travel/workday-regler

## Tekniska detaljer
Föreslagen serverdefinition av "dagen har börjat":
- minst en giltig arbetsnärvaro idag före resans starttid, t.ex. via befintlig workday/arrival/presence-signal
- inte bara rörelsehastighet utanför geofence

ASCII-flöde:
```text
FÖRE första arbetsbesöket:
hem/privat adress + rörelse -> ingen auto-restid

EFTER första arbetsbesöket:
jobb/lager -> lämnar plats -> resa kan starta
resa -> Bauhaus/tankning -> resa fortsätter
resa -> nästa kända arbetsplats -> resa stoppas
```

## Städning efter implementation
När ändringen är godkänd och byggläget öppnas kan jag också rensa Billys felaktiga restid/workday från idag så logiken och datat matchar varandra.