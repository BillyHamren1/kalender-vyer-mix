---
name: Work Shift (multi per day) v1
description: A "workday" row is now a work shift in the UI; staff can run multiple shifts per calendar day, server already supports it via the one-open-per-staff partial unique index.
type: feature
---
Användarspråket i appen är nu **"Arbetspass"** — inte "Arbetsdag":

- Headerknappen i mobilen heter **"Starta arbetspass"** / **"Avsluta arbetspass"** (i18n-nycklar `workday.startDay` / `workday.endDay` är oförändrade men strängarna uppdaterade).
- Pillen visar **pågående arbetspass** (inte hela dagen). Tooltip: "Arbetspassets längd".
- StartDayDialog: titel "Vart börjar du arbetspasset?", primärknapp "Starta arbetspass".
- Toasts: "Arbetspass startat på {label}" istället för "Dagen startad …".

Datalagret är **oförändrat**:

- Tabellen heter fortfarande `public.workdays`.
- Edge-funktionen `workday` (actions `start | end | current`) är oförändrad och redan korrekt:
  - `start` är idempotent på *öppen rad*, inte per kalenderdag → om personen avslutat tidigare pass samma dag skapas en ny rad.
  - Partial unique index `workdays_one_open_per_staff` (`UNIQUE (staff_id) WHERE ended_at IS NULL`) håller fortfarande max ett öppet pass per person.
- `useWorkDay`/`WorkDayHeaderTimer` behöver inga logikändringar — de visar bara "current open workday" som nu är "current shift".

Arkitekturregel: ändra ALDRIG `workday/start` till att blockera baserat på kalenderdatum. Personalen MÅSTE kunna köra ett pass 04–08 och ett nytt pass 18–22 samma dag (verifierat case: Billy Hamrén 2026-04-29 hade redan tre stängda pass på en dag).

Ingen schema-migration utförd — `workdays`-tabellnamnet behålls för att undvika koppling till alla beroende vyer/queries (CSV-export, admin time review, EOD-funktioner). Ny terminologi lever bara i UI/i18n-lagret.
