

## Problem

1. **Edge Function inte deployad** — Funktionen returnerar 404. Den behöver deployas.
2. **Fel endpoint-namn i fetchExternal** — Koden anropar `planning-api` (rad 91) men den faktiska funktionen heter `planning-api-proxy` i config.toml.

## Plan

### Steg 1: Fixa endpoint-namn
Ändra rad 91 i `supabase/functions/export-economy-data/index.ts`:
- Från: `${efUrl}/functions/v1/planning-api?${qs.toString()}`
- Till: `${efUrl}/functions/v1/planning-api-proxy?${qs.toString()}`

### Steg 2: Deploya funktionen
Deploya `export-economy-data` edge function.

### Steg 3: Testa med curl
Anropa funktionen med rätt API-nyckel och organization_id för att verifiera att den svarar korrekt.

