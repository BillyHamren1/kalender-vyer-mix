## Problem
`ProjectFollowersPanel` (panelen "Mina projekt – tilldelade" på projekt/large-project-sidan) listar alla aktiva `staff_members` i pickern. Det inkluderar fältpersonal som bara är appanvändare och som inte ska få projekt-tilldelningar (eftersom hela poängen är att en systemanvändare = någon med inloggning till webben/admin) ska se projektet i sin "Min sida".

I kodbasen är definitionen redan etablerad (se `CreateProjectWizard.tsx`): **systemanvändare = rader i `profiles`-tabellen** (har auth-konto + webbinloggning). En `staff_member` är en systemanvändare när dess `user_id` matchar en `profiles.user_id`. Övriga staff_members är rena appanvändare.

## Ändring

Endast `src/components/project/ProjectFollowersPanel.tsx`:

1. Byt picker-query (`all-staff-followers-picker`) så den först hämtar `profiles.user_id` och sedan endast returnerar `staff_members` där:
   - `is_active = true`
   - `user_id IS NOT NULL`
   - `user_id IN (profiles.user_id)`
2. Uppdatera `queryKey` till `system-users-followers-picker` så gammal cache inte återanvänds.
3. Tomtext i Select ändras till "Inga systemanvändare tillgängliga" när listan är tom.
4. Behåll befintliga followers-rader oförändrade (vi tar inte bort redan tilldelade automatiskt — bara nya tilldelningar gated).

## Inte i scope
- Inga DB-migrationer, inga ändringar i `project_followers`-schemat eller RLS.
- Ingen ändring i `useProjectFollowers` (hooken är agnostisk mot vem som tilldelas).
- Övriga ställen som listar staff (kalender, BSA, mobil) påverkas inte.

## Verifiering
- Öppna `/large-project/:id` → panelen visar bara namn från `profiles` i dropdown.
- Befintlig "Billy Hamrén"-badge ligger kvar men kan tas bort som vanligt.
- TypeScript/lint körs automatiskt av harness.