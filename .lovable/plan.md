

## Hypotes bekräftad — konflikt vid samtidiga geofence-targets

Användaren har identifierat något viktigt: Raivis (och de andra) är assignade till **2 jobb på samma adress, samma tid** (SP Office Data + Craft of Scandinavia, båda 10:00–14:00). När geofencing ska starta timer ser systemet 2 targets på exakt samma plats → konflikt.

### Vad jag behöver verifiera (read-only undersökning först)

1. **`useGeofencing.ts`** — hur byggs `targets`-listan? Dedupliceras targets på koordinater? Vad händer när 2 targets matchar samma `dist <= enterRadius` samtidigt?
2. **`useBackgroundLocationReporter.ts` rad 119–162** — `checkBackgroundGeofences` loopar igenom alla targets och pushar pending arrivals. Vid 2 targets på samma plats → 2 pending arrivals samtidigt.
3. **Timer concurrency-regler** (`mem://features/field-staff/timer-concurrency-rules-v1`) — booking↔booking = "switch-dialog". Om 2 booking-arrivals triggas samtidigt → switch-dialog mot sig själv? Eller blockerar varandra?
4. **`useArrivalPrompt` + arrival-dialogen** — kan den hantera 2 samtidiga prompts, eller "äter" den ena den andra?
5. **Edge function `mobile-app-api` `getArrivalState`** — returnerar den bara EN location åt gången? Då försvinner den andra tyst.

### Frågor jag behöver svar på från koden

- Skapas 2 separata `location_time_entries` (en per booking) eller bara en?
- Om bara en — vilken vinner, och vad händer med den andra?
- Triggas en `presence_without_repo` eller liknande workday_flag när detta inträffar?

### Plan för att hitta rotorsaken

**Steg 1 — Läsning (denna plan):**
- Läs `src/hooks/useGeofencing.ts` (target-byggning + arrival-hantering)
- Läs `supabase/functions/mobile-app-api/index.ts` `handleGetArrivalState` + `handleReportLocation`
- Kör SQL: kolla `location_time_entries` för Raivis idag — finns en eller två rader för dessa bokningar? Kolla också `staff_location_history` (för att bekräfta Bug A från förra rundan).
- Kör SQL: kolla `workday_flags` för Raivis idag.

**Steg 2 — Diagnos:**
Presentera en rapport med:
- Exakt vad som händer i koden vid 2 samtidiga geofence-targets på samma adress
- Bevis från databasen (vilka rader skapades/saknas)
- Vilken bugg det är: (a) target-deduplicering saknas, (b) arrival-prompt hanterar inte multipla, (c) timer-concurrency blockerar sig själv, eller (d) kombination

**Steg 3 — Fix-förslag (separat plan efter diagnos):**
Sannolikt en av:
- Slå ihop targets med identiska koordinater till en "multi-job target" som visar båda jobben i samma arrival-prompt och startar **en** timer som linkas till båda bokningarna.
- Eller: kö-baserad arrival där den andra prompten visas efter att första hanterats.
- Plus: workday_flag `geofence_conflict_same_address` så drift ser detta i adminvyn.

**Inga kodändringar i denna runda** — bara läsning + SQL för att bekräfta rotorsaken innan vi designar fixen.

