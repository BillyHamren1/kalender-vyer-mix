## Rotorsak

`gps-heartbeat-pulse` kraschar i produktion med:

```text
column device_tokens.refreshed_at does not exist
```

Tabellen `device_tokens` har kolumnen `last_refreshed_at`, inte `refreshed_at`. Därför avbryts hela pulse-cronet innan silent push skickas till mobilerna. Då får stillastående/iOS-bakgrundade telefoner ingen `gps_pulse`, och inga nya pings laddas upp.

## Plan

1. **Fixa fel kolumn i `gps-heartbeat-pulse`**
   - Byt queryn från `refreshed_at` till `last_refreshed_at`.
   - Sortera på `last_refreshed_at`.
   - Behåll samma multi-tenant- och stale-ping-logik.

2. **Lås felet med test**
   - Lägg till kontraktstest som förbjuder `refreshed_at` i `gps-heartbeat-pulse`.
   - Lägg till/uppdatera test som kräver `last_refreshed_at` i device token-queryn.

3. **Verifiera edge-funktionen**
   - Kör Deno-testerna för `gps-heartbeat-pulse`.
   - Deploya `gps-heartbeat-pulse`.
   - Kör/calla funktionen och verifiera att den inte längre kraschar på kolumnfel.
   - Kontrollera edge logs efteråt.

4. **Verifiera att servern börjar producera signal igen**
   - Kontrollera `gps_pulse_log` efter körning.
   - Kontrollera att funktionen returnerar antal tokens/pulser eller en rimlig no-op, inte 500.

## Viktigt

Jag ändrar inte Tid & Lön-filtret. Det ska vara som du säger. Felet som ska fixas är GPS-puls/uppladdning.