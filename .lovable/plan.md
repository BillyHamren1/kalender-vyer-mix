

# Plan: Anslut till eventflow-bookings och inspektera schema

## Steg 1 -- Lagra credentials som secrets
Jag kommer be dig klistra in dessa två värden:
- **EF_SUPABASE_URL** -- URL:en till eventflow-bookings Supabase-projektet (t.ex. `https://xxxxx.supabase.co`)
- **EF_SUPABASE_SERVICE_ROLE_KEY** -- Service role key för samma projekt

## Steg 2 -- Skapa en "schema-discovery" Edge Function
En tillfällig Edge Function som:
1. Ansluter till eventflow-bookings med service role key
2. Kör en SQL-fråga mot `information_schema.tables` och `information_schema.columns` för att lista alla tabeller och kolumner
3. Returnerar resultatet som JSON

## Steg 3 -- Kör funktionen och analysera schemat
Jag anropar funktionen, läser svaret och identifierar:
- Vilka tabeller som hanterar budget, inköp, offerter, fakturor och tidrapporter
- Hur de relaterar till bokningar (foreign keys)
- Kolumnnamn och datatyper

## Steg 4 -- Bygg den riktiga proxyn
Med full kunskap om schemat bygger jag sedan `project-economy-proxy` Edge Function och frontend-tjänsten som mappar data korrekt.

---

### Tekniska detaljer

**Schema-discovery-funktionen** kommer använda `supabase.rpc` eller en direktfråga mot `information_schema`:
```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position
```

Funktionen tas bort efter att schemat är kartlagt.

