# Varför "Placera bokning" inte funkar

Dialogen hänger på "Laddar bokning…" och slutar i "Kunde inte hämta bokningen."

Postgres-loggarna visar att alla anrop mot `public.bookings` just nu kraschar med:

```
ERROR: column bookings.project_id does not exist
ERROR: column bookings.event_type does not exist
```

Det innebär att en RLS-policy, vy, trigger eller funktion på `bookings` refererar till kolumner som inte längre finns. Så fort `BookingPlacementDialog` gör sin `select(...).eq('id', ...).maybeSingle()` mot `bookings` får den ett PostgrestError istället för en rad → dialogen visar fel-läget. Detta påverkar troligen även andra läs/skriv-flöden mot `bookings`.

Listan med bokningar i `IncomingBookingsList` råkar lyckas eftersom dess policy-väg inte triggar samma referens (eller cachas), men single-row med fler kolumner triggar uttrycket.

# Plan

1. **Identifiera vad som refererar till `bookings.project_id` / `bookings.event_type`**
   - Köra (via migration eller read_query när DB svarar igen):
     ```sql
     select n.nspname, p.proname, pg_get_functiondef(p.oid)
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where pg_get_functiondef(p.oid) ilike '%bookings.project_id%'
        or pg_get_functiondef(p.oid) ilike '%bookings.event_type%';

     select schemaname, tablename, policyname, qual, with_check
     from pg_policies
     where (qual ilike '%bookings.project_id%' or with_check ilike '%bookings.project_id%'
            or qual ilike '%bookings.event_type%' or with_check ilike '%bookings.event_type%');

     select n.nspname, c.relname, pg_get_viewdef(c.oid)
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where c.relkind in ('v','m') and pg_get_viewdef(c.oid) ilike '%bookings.project_id%';
     ```

2. **Skapa migration som lagar referensen**
   - Beroende på vad som hittas:
     - Om det är en RLS-policy → ersätt `bookings.project_id` med rätt fält (`assigned_project_id`) och `bookings.event_type` med rätt logik (event_type finns på `calendar_events`, inte `bookings`).
     - Om det är en vy → uppdatera vyns SELECT.
     - Om det är en trigger-funktion → uppdatera funktionen.
   - Migrationen ska inte ändra data, endast definitionerna.

3. **Verifiera**
   - Köra samma single-select som `BookingPlacementDialog` använder (`select id, client, … from bookings where id = '<någon id>'`) och bekräfta 200.
   - Öppna "Placera bokning"-dialogen i preview och verifiera att bokningen laddas.
   - Köra befintliga vitest-suiter relaterade till bookings/planning.

# Tekniska detaljer

- Frontendkoden i `src/components/project/BookingPlacementDialog.tsx` är OK – ingen kodändring där behövs. Felmeddelandet ("Kunde inte hämta bokningen.") beror på att `bookingError` är en `PostgrestError` (inte `Error`), så fallback-texten visas. Vi kan i samma svep förbättra felvisningen så att den faktiska Postgres-koden syns för admin, men huvudfixen är DB-sidan.
- DB svarar just nu sporadiskt med timeouts (vi fick 544 från read_query). Migrationen ska köras när DB är stabil; loggarna räcker som bevis för rotorsaken.

# Inte i scope

- Ingen omdesign av dialogen.
- Inga ändringar av RLS-policyer utöver att laga de trasiga referenserna.
