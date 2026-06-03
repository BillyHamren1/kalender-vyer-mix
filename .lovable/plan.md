## Mål
"Uppdaterade bokningar"-listan ska börja räkna från och med nu. Alla historiska, osedda ändringar (idag 60 st) ska aldrig mer dyka upp som "ny uppdatering". Endast ändringar som sker **efter** att denna logik aktiveras får dyka upp — och de försvinner när användaren klickar "Granska" (oförändrat). Ingen UI-knapp.

## Princip
Inför en **per-användare baseline-timestamp** (`baseline_at`). En ändring räknas som "osedd" endast om:

```
booking_changes.changed_at > GREATEST(baseline_at, COALESCE(last_seen_at, '-infinity'))
```

Första gången en användare träffar RPC:n skrivs `baseline_at = now()` för den användaren. Allt som finns i `booking_changes` innan dess är osynligt för all framtid. Detta är permanent — inte ett UI-filter, inte en knapp.

## Tekniska detaljer

### 1. Ny tabell
`public.booking_change_baselines`
- `user_id uuid PK` (= `auth.uid()`)
- `baseline_at timestamptz NOT NULL DEFAULT now()`
- `created_at`/`updated_at` standard
- GRANT till `authenticated` (SELECT) + `service_role`
- RLS: en användare får bara se/skapa sin egen rad
- Skapas i samma migration som funktions­ändringen

### 2. RPC `get_unseen_booking_updates` skrivs om
- Byt från `LANGUAGE sql STABLE` → `LANGUAGE plpgsql VOLATILE SECURITY DEFINER`
- Första steget: `INSERT INTO booking_change_baselines (user_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING` — sätter baseline till `now()` första anropet per användare
- Andra steget: oförändrad CTE, men WHERE-villkoret ändras till
  ```
  l.last_change_at > GREATEST(b_base.baseline_at, COALESCE(s.last_seen_at, '-infinity'))
  ```
- Resten (`change_count`, projekt-koppling, etc.) oförändrat

### 3. UI-rensning (`src/components/project/IncomingBookingsList.tsx`)
- Ta bort det provisoriska "filtrera bort om `last_change_at < idag`" (rad 150-159). RPC:n är nu sanningen.
- `visibleUpdates` blir alias för `unseenUpdates`.
- Inga visuella ändringar i övrigt.

### 4. Test
- Lägg till en vitest som mockar Supabase-klienten och verifierar att `IncomingBookingsList` renderar exakt vad RPC:n returnerar (inget client-side datumfilter kvar).
- Testet placeras i `src/components/project/__tests__/IncomingBookingsList.test.tsx`.

## Vad som händer vid deploy
1. Migrationen körs → tom tabell + ny RPC.
2. Du laddar `/projects` → RPC anropas → din `user_id` får `baseline_at = NOW()` → returnerar 0 rader → listan försvinner direkt.
3. Nästa gång importsystemet skriver en ny rad i `booking_changes` med `changed_at > din baseline_at` → den dyker upp som "Uppdaterad bokning".
4. Du klickar "Granska" → `mark_booking_changes_seen` skriver `last_seen_at = now()` (oförändrat) → raden försvinner igen.

## Vad som INTE händer
- Inga rader i `booking_changes` raderas.
- Ingen massiv UPDATE på existerande data.
- Inga andra användares baseline påverkas.
- Ingen UI-knapp läggs till.

## Filer som ändras
- **Migration**: ny tabell + ersätter `get_unseen_booking_updates`
- `src/components/project/IncomingBookingsList.tsx` — tar bort dagens-filtret
- `src/components/project/__tests__/IncomingBookingsList.test.tsx` — ny testfil