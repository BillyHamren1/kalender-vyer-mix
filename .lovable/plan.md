
## Mål

En enda adminvy `/admin/presence` som visar både:
- **Personal-perspektiv**: vem är var just nu (från `StaffPresence`)
- **Plats-perspektiv**: vilka är på ett visst event/projekt/lager (från `TargetPresence`)

Istället för två separata sidor.

## Vy-struktur

Sida: `src/pages/admin/Presence.tsx` (route `/admin/presence`)

Toppen: gemensam header med "Senast uppdaterad" + auto-refresh.

Två tabbar (shadcn `Tabs`):

1. **Personal** (default)
   - Återanvänder hela nuvarande `StaffPresence`-listan: namn, signalstatus (live/recent/stale/no_signal), aktuell tolkad status (på event/lager/transport/okänd plats/GPS-glapp), target_label, arrival/departure, aktiv timer.
   - Klick på en rad → expanderar inline och visar personens senaste presence-händelser (arrival/departure/signal_lost/signal_resumed) från `staff_presence_events` senaste 24h.

2. **Platser**
   - Lista över alla targets (events/projekt/lager) som har minst en person på plats just nu, eller har haft det idag.
   - Per target: namn, typ (event/projekt/lager), antal personer på plats nu, antal som lämnat idag.
   - Klick på en target → expanderar och visar `TargetPresence`-listan inline (personer med arrived_at, departed_at, senaste ping, confidence, aktiv timer ja/nej).

## Datakällor (oförändrade)

- `get-staff-presence` edge function (Personal-tabben)
- `get-target-presence` edge function (Platser-tabben, anropas per target on-expand eller batch för "aktiva targets idag")
- `staff_presence_events` (24h-historik vid expansion)
- `active_time_registrations` (aktiv timer-flagga)

Inga nya tabeller. Inget skrivande. Ingen `time_report`/`workday`/`LTE`/`travel` läses eller skrivs.

## Filer

**Nya:**
- `src/pages/admin/Presence.tsx` — wrapper med tabbar
- `src/components/admin/presence/StaffPresenceTab.tsx` — extraherad från `StaffPresence.tsx`
- `src/components/admin/presence/TargetsPresenceTab.tsx` — ny: lista aktiva targets idag + expansion till `TargetPresence`-data
- `src/components/admin/presence/TargetPresenceList.tsx` — extraherad från `TargetPresence.tsx`

**Edge functions:**
- Ny `get-active-targets-today` (eller utökning av `get-target-presence` med `action: 'list_active_today'`) som returnerar listan av targets med minst en arrival idag.

**Routing (`src/App.tsx`):**
- Lägg till `/admin/presence`
- Behåll `/admin/staff-presence` och `/admin/target-presence` som thin redirects till `/admin/presence?tab=staff` resp. `?tab=targets&target=...` så gamla länkar fungerar.

**Navigation:**
- Lägg till en synlig "Närvaro"-länk i admin-sidebaren så det går att hitta utan att skriva URL manuellt.

## Acceptans

- En sida visar både "vem är var" och "vilka är på X"
- Tabbarna delar samma realtime-uppdatering (Supabase realtime på `staff_location_history` + `staff_presence_events` + `active_time_registrations`)
- Inga nya skrivvägar. Inga `time_report`/`workday`-mutationer.
- Gamla URL:er fortsätter fungera via redirect.
