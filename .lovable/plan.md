# Rensa Almedalen-dubbletten + förebygg nya

## Bekräftat i DB

Två `large_projects` med samma namn:

| Skapat | project_number | id | Bokningar | warehouse_project | packing_project |
|---|---|---|---|---|---|
| 2026-04-20 | 260420-Projekt01 | `5c94ebcc…` | **0** | `b3bb02cb…` | `a2568c55…` (Hansa Event AB - 2026-06-22, planning) |
| 2026-05-28 | 260528-Projekt01 | `a5d3f31b…` | **23** | `1a97c48a…` | `de0e56c5…` (Almedalenveckan 2026, planning) ← du tittar på denna |

April-raden är tom och saknar motsvarighet i Planning som du säger. Den ska bort.

## Steg 1 — Engångsstädning (migration / insert tool)

Hårdradera i denna ordning (barn → förälder), scopat på de exakta id:n:

1. `packing_list_item_allocations`, `packing_list_items`, `packing_parcels`, `packing_control_session_items`, `packing_control_sessions`, `packing_work_session_events`, `packing_work_sessions`, `packing_tasks`, `packing_task_comments`, `packing_comments`, `packing_files`, `packing_invoices`, `packing_quotes`, `packing_budget`, `packing_labor_costs`, `packing_purchases`, `packing_project_bookings`, `packing_sync_log` för `packing_project_id = a2568c55…`
2. `packing_projects` rad `a2568c55…`
3. `warehouse_project_tasks`, `warehouse_project_changes`, `warehouse_staff_activations`, `warehouse_assignments`, `warehouse_calendar_events` för `warehouse_project_id = b3bb02cb…`
4. `warehouse_projects` rad `b3bb02cb…`
5. `warehouse_project_inbox` rader som pekar på `source_id = 5c94ebcc…`
6. `large_project_*` (bookings/tasks/files/budget/purchases/staff/team_assignments/booking_plan_items/cost_lines/gantt_steps/view_config/budget) för `large_project_id = 5c94ebcc…` (alla bör vara 0 rader men kör för säkerhets skull)
7. `large_projects` rad `5c94ebcc…`

Allt körs i en transaktion. Säkerhetscheck före delete på `large_projects`: bekräfta `(SELECT COUNT(*) FROM large_project_bookings WHERE large_project_id='5c94ebcc…') = 0`.

## Steg 2 — Kodlås mot nya dubbletter

Bara två små UI-ändringar, inget databasschema:

**A. Planning — `CreateLargeProjectDialog` (eller motsvarande "Skapa stort projekt"-flöde)**
Vid namnändring: kör en query mot `large_projects` (samma org) på `name ILIKE` och visa varning i dialogen:
> "Det finns redan ett stort projekt med namnet 'X' (skapat YYYY-MM-DD, N bokningar). Vill du verkligen skapa ett till?"
Knappar: "Öppna befintligt" / "Skapa ändå" / "Avbryt". Ingen hård spärr — bara medveten varning.

**B. Warehouse — `WarehouseProjectInbox` (filen visad i context)**
I `ConvertInboxDialog`: innan konvertering, kolla om det redan finns en `warehouse_projects`-rad med samma `client_name` (case-insensitive) i org. Om ja, visa:
> "Lagerprojekt 'X' finns redan (skapat YYYY-MM-DD). Vill du länka inbox-raden till befintligt projekt eller skapa nytt?"
Knappar: "Länka till befintligt" (sätter `warehouse_project_inbox.status='converted'` + `warehouse_project_id` till det gamla, inget nytt skapas) / "Skapa nytt ändå" / "Avbryt".

## Inte med i denna plan
- Trasig inbox-rad `260603-Projekt01` (pekar på borttagen LP) — separat fråga, hanteras i nästa runda
- Per-bokning-vy inuti stora lagerprojekt — separat fråga
- Schemaändring (unique index på `large_projects.name` per org) — varning räcker, hård spärr kräver mer diskussion

## Filer som kommer ändras i Steg 2
- `src/components/.../CreateLargeProjectDialog.tsx` (hittas i build-fasen)
- `src/components/warehouse/ConvertInboxDialog.tsx`
- Ev. ny helper `src/services/largeProjectDuplicateCheck.ts`

Säg till om jag ska köra hela planen (Steg 1 + Steg 2) eller bara städningen först.
