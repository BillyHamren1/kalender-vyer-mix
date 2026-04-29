## Mål
Lås in den korrekta modellen: **personalen tillhör teamet, bokningen flyttas mellan team**. BSA blir en härledd spegel av `staff_assignments × calendar_events.resource_id`. Tryggt utrullat i små verifierade steg.

## Modell

```text
staff_assignments  (dag → team)         PRIMÄR — vem är i vilket team
calendar_events    (dag → team)         PRIMÄR — vilken bokning ligger i vilket team
booking_staff_assignments (BSA)         HÄRLEDD — alla i teamet får jobbet
```

**Regel:** För varje (booking, datum) gäller:
> BSA = { staff där `staff_assignments.team_id = calendar_events.resource_id` på det datumet }

Drag av bokning ändrar bara `calendar_events`. BSA räknas om från principerna. Personalen "stannar" i teamet — bokningen byter team.

**Skyddade kategorier:** rader med `team_id IN ('activity','project','location')` är härledda från andra system (tasks, large_project_staff, location-show-as-project) och rörs ALDRIG av detta.

## Användarens regler (bekräftade)
- Tomt mål-team → flytta ändå, BSA blir tom.
- Datumflytt → personalen i `<gamlaTeam>` på `<nyaDatum>` får jobbet.
- Ingen extra-bemanning utanför teammodellen.

---

## Stegvis utrullning (verifiera mellan varje steg)

### Steg 1 — RPC `recompute_booking_staff_for_day` (migration)
Ren funktion. Påverkar inget än om vi inte kallar den.

```sql
CREATE OR REPLACE FUNCTION recompute_booking_staff_for_day(
  p_booking_id text, p_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_team text; v_org uuid; v_added int:=0; v_removed int:=0;
BEGIN
  SELECT resource_id, organization_id INTO v_team, v_org
  FROM calendar_events
  WHERE booking_id = p_booking_id AND source_date = p_date
    AND event_type IN ('rig','rigDown')
  ORDER BY event_type DESC LIMIT 1;

  WITH removed AS (
    DELETE FROM booking_staff_assignments
    WHERE booking_id = p_booking_id
      AND assignment_date = p_date
      AND team_id NOT IN ('activity','project','location')
      AND (v_team IS NULL OR team_id <> v_team
           OR staff_id NOT IN (
             SELECT staff_id FROM staff_assignments
             WHERE team_id = v_team AND assignment_date = p_date))
    RETURNING 1
  ) SELECT count(*) INTO v_removed FROM removed;

  IF v_team IS NOT NULL THEN
    WITH added AS (
      INSERT INTO booking_staff_assignments
        (booking_id, staff_id, team_id, assignment_date, organization_id)
      SELECT p_booking_id, sa.staff_id, v_team, p_date, v_org
      FROM staff_assignments sa
      WHERE sa.team_id = v_team AND sa.assignment_date = p_date
      ON CONFLICT (booking_id, staff_id, assignment_date) DO NOTHING
      RETURNING 1
    ) SELECT count(*) INTO v_added FROM added;
  END IF;

  RETURN jsonb_build_object('team',v_team,'added',v_added,'removed',v_removed);
END $$;
```

**Verifiering (manuell, READ-only):**
- `SELECT recompute_booking_staff_for_day('<skolfest-id>','2026-04-27')` → returnerar `{team:'team-2',added:N,removed:0}`. Kontrollera BSA-rader matchar.
- Kör mot ett par andra (booking, datum) som vi vet är OK → `added:0, removed:0` (idempotent).

### Steg 2 — Conflict-merge i `updateCalendarEvent`
Catcha 23505 (unique på `(booking_id, event_type, source_date)`). Vid kollision: uppdatera mål-raden, DELETE källraden, returnera `{merged:true}`.

**Test:** Ny `src/test/calendarEventMerge.contract.test.ts` mockar Supabase, säkerställer att merge-grenen körs.

### Steg 3 — Drag-drop använder RPC
`useEventDragDrop.ts`:
- UPDATE calendar_events (befintligt).
- Spegla `bookings.<phase>date` ENDAST om `oldDate === bookingPhaseDate` (skydd mot multi-day överskrivning).
- Anropa `recompute_booking_staff_for_day` för (booking, oldDate) och (booking, newDate).
- Ta bort gammalt `handleBookingMove`-anrop.

**Test:** `src/test/calendarTeamModel.contract.test.ts`
- Dra team-1→team-2 → BSA på source rensas, target fylls (mockat).
- Dra till tomt team → BSA tom, ingen blockering.
- Dra till annat datum → BSA(old) tom, BSA(new)=teamets personal på det datumet.
- Multi-day: dra "rigDown dag 2" → `bookings.rigdowndate` orörd.

### Steg 4 — `MoveEventDateDialog` parar koden
Samma två RPC-anrop. Inget gammalt staff-flytt-anrop kvar.

### Steg 5 — Reconciler `import-bookings`
Efter att den reconcilat `calendar_events`-rader för en bokning:
- Samla alla datum som BSA + calendar_events finns på för bokningen.
- För varje datum → `recompute_booking_staff_for_day`.
Tar bort kvarvarande "spöken" och säkerställer alltid spegelegenskapen.

**Test:** `supabase--test_edge_functions` på import-bookings (befintliga tester) + manuellt anrop via `supabase--curl_edge_functions` för Skolfest → kontrollera att BSA stämmer mot teamen efteråt.

### Steg 6 — Engångs-normalisering (separat migration)
Loop som kallar `recompute_booking_staff_for_day` för varje (booking, datum) som har calendar_events ELLER BSA i framtiden (cutoff: `assignment_date >= CURRENT_DATE - 30`). Idempotent. Säkerställer ren start.

**Verifiering:** SELECT-diff före/efter på antal BSA-rader per team för en handfull bokningar. Skolfest 27/4 ska hamna på team-2 utan att vi rör datan manuellt.

### Steg 7 — Deprecera `handle_booking_move`
Ersätt funktionskroppen med en no-op som returnerar `{deprecated:true}`. Inga klienter får krascha. Loggar varning i Edge Function-loggar om någon fortfarande kallar den.

### Steg 8 — Kontraktstest + memory
- `src/test/calendarTeamModel.contract.test.ts` (från steg 3) failar om någon återinför "personal följer med bokning"-logik.
- `mem://features/planning/calendar-team-model-v1` med modellen.
- Uppdatera `.lovable/memory/index.md`.

---

## Filer

```text
NEW supabase/migrations/<ts>_recompute_booking_staff_for_day.sql        (steg 1)
NEW supabase/migrations/<ts>_normalize_bsa_one_time.sql                 (steg 6)
NEW supabase/migrations/<ts>_deprecate_handle_booking_move.sql          (steg 7)
EDIT src/services/eventService.ts                                       (steg 2)
EDIT src/hooks/useEventDragDrop.ts                                      (steg 3)
EDIT src/components/Calendar/MoveEventDateDialog.tsx                    (steg 4)
EDIT supabase/functions/import-bookings/index.ts                        (steg 5)
NEW src/test/calendarEventMerge.contract.test.ts                        (steg 2)
NEW src/test/calendarTeamModel.contract.test.ts                         (steg 3)
NEW .lovable/memory/features/planning/calendar-team-model-v1.md         (steg 8)
EDIT .lovable/memory/index.md                                           (steg 8)
```

## Säkerhetsnät
- Alla migrationer är icke-destruktiva — `recompute` kan köras hur många gånger som helst.
- Skyddade `team_id`-kategorier (`activity/project/location`) rörs aldrig.
- `handle_booking_move` blir no-op men finns kvar → inga 404-RPC-fel.
- Mellan steg 1 och steg 6 fungerar gammal kod fortfarande exakt som idag (vi har bara *lagt till* en oanvänd RPC).
- Efter varje steg verifierar jag med READ-only SQL eller test innan nästa.

## Klart när
- Skolfest 27/4 ligger på team-2 efter normaliseringen — utan manuell datafix.
- Drag av bokning mellan team uppdaterar BSA korrekt åt båda håll, hoppar inte tillbaka.
- Drag mellan datum ger jobbet till personalen på nya datumets team.
- Drag till tomt team funkar utan blockering, BSA blir tom.
- Reconciler-körning är idempotent (andra körningen `added:0, removed:0` överallt).
- Kontraktstest grönt.
