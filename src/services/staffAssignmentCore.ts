/**
 * staffAssignmentCore — THE single source of truth for staff↔team writes.
 *
 * Hard rule (locked by staffCalendar.contract.test.ts): every assign/remove
 * for `public.staff_assignments` MUST go through one of these two functions.
 *
 * Direct DB writes elsewhere = bug. Edge function `staff-management` is no
 * longer used for assign/remove (kept only for booking-export and summaries).
 *
 * Multi-team policy (see mem://features/planning/multi-team-staff-assignment-v1):
 * - assign  : upsert on (staff_id, team_id, assignment_date) — adds a row,
 *             never replaces other team memberships for the same day.
 * - remove  : if `teamId` is provided, only THAT row is deleted; otherwise
 *             ALL rows for the day are deleted (legacy "fully unassign").
 */
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { notifyTimeWorkerAssignments } from "@/services/time/timeWorkerSync";

export async function assignStaffToTeamCore(
  staffId: string,
  teamId: string,
  date: Date,
): Promise<void> {
  const dateStr = format(date, "yyyy-MM-dd");
  const { error } = await supabase
    .from("staff_assignments")
    .upsert(
      { staff_id: staffId, team_id: teamId, assignment_date: dateStr },
      { onConflict: "staff_id,team_id,assignment_date" },
    );
  if (error) throw error;
  notifyTimeWorkerAssignments({ staffIds: [staffId], reason: "staff_assignment_changed" });
}

export async function removeStaffAssignmentCore(
  staffId: string,
  date: Date,
  teamId?: string,
): Promise<void> {
  const dateStr = format(date, "yyyy-MM-dd");
  let q = supabase
    .from("staff_assignments")
    .delete()
    .eq("staff_id", staffId)
    .eq("assignment_date", dateStr);
  if (teamId) q = q.eq("team_id", teamId);
  const { error } = await q;
  if (error) throw error;
  // Personen ska INTE längre se uppdraget — projektionen skickas ändå (nu utan
  // raden) så Time kan flytta head och markera bort uppdraget.
  notifyTimeWorkerAssignments({ staffIds: [staffId], reason: "assignment_removed" });
}

