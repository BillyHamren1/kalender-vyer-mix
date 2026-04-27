import { supabase } from '@/integrations/supabase/client';

export type LargeProjectPhase = 'rig' | 'event' | 'rigDown';

const PHASE_TO_DATE_COLUMN: Record<LargeProjectPhase, 'start_date' | 'event_date' | 'end_date'> = {
  rig: 'start_date',
  event: 'event_date',
  rigDown: 'end_date',
};

const PHASE_TO_BOOKING_DATE: Record<LargeProjectPhase, 'rigdaydate' | 'eventdate' | 'rigdowndate'> = {
  rig: 'rigdaydate',
  event: 'eventdate',
  rigDown: 'rigdowndate',
};

const PHASE_TO_BOOKING_TIMES: Record<LargeProjectPhase, { start: string; end: string }> = {
  rig: { start: 'rig_start_time', end: 'rig_end_time' },
  event: { start: 'event_start_time', end: 'event_end_time' },
  rigDown: { start: 'rigdown_start_time', end: 'rigdown_end_time' },
};

interface MoveLargeProjectDayInput {
  largeProjectId: string;
  phase: LargeProjectPhase;
  fromDate: string; // yyyy-MM-dd
  toDate: string;   // yyyy-MM-dd
  newStartISO: string;
  newEndISO: string;
}

/**
 * Move a single project day for a large project from `fromDate` → `toDate`
 * for the given phase. Updates:
 *  - large_projects.<phase>_date array (replace fromDate with toDate)
 *  - all linked bookings: their phase date + start/end time
 *  - large_project_team_assignments: keep team mapping on the new date
 */
export async function moveLargeProjectDay({
  largeProjectId,
  phase,
  fromDate,
  toDate,
  newStartISO,
  newEndISO,
}: MoveLargeProjectDayInput): Promise<void> {
  if (fromDate === toDate) return;

  // 1. Update large_projects.<phase>_date array
  const dateColumn = PHASE_TO_DATE_COLUMN[phase];
  const { data: project, error: projErr } = await supabase
    .from('large_projects')
    .select(`id, ${dateColumn}`)
    .eq('id', largeProjectId)
    .single();

  if (projErr) throw projErr;

  const dates: string[] = Array.isArray((project as any)[dateColumn])
    ? [...(project as any)[dateColumn]]
    : [];

  const idx = dates.indexOf(fromDate);
  if (idx === -1) {
    // Add the new date if old not found (defensive)
    if (!dates.includes(toDate)) dates.push(toDate);
  } else {
    dates[idx] = toDate;
  }
  // De-dupe + sort
  const finalDates = Array.from(new Set(dates)).sort();

  const { error: updErr } = await supabase
    .from('large_projects')
    .update({ [dateColumn]: finalDates })
    .eq('id', largeProjectId);
  if (updErr) throw updErr;

  // 2. Update all linked bookings — only those whose phase date matches fromDate
  const { data: links, error: linksErr } = await supabase
    .from('large_project_bookings')
    .select('booking_id')
    .eq('large_project_id', largeProjectId);
  if (linksErr) throw linksErr;

  const bookingIds = (links || []).map(l => l.booking_id);
  const bookingDateCol = PHASE_TO_BOOKING_DATE[phase];
  const bookingTimes = PHASE_TO_BOOKING_TIMES[phase];

  if (bookingIds.length > 0) {
    const { error: bookErr } = await supabase
      .from('bookings')
      .update({
        [bookingDateCol]: toDate,
        [bookingTimes.start]: newStartISO,
        [bookingTimes.end]: newEndISO,
      })
      .in('id', bookingIds)
      .eq(bookingDateCol, fromDate);
    if (bookErr) throw bookErr;
  }

  // 3. Update calendar_events rows for these bookings on this phase/date
  if (bookingIds.length > 0) {
    const { error: ceErr } = await supabase
      .from('calendar_events')
      .update({
        start_time: newStartISO,
        end_time: newEndISO,
        source_date: toDate,
      })
      .in('booking_id', bookingIds)
      .eq('event_type', phase)
      .eq('source_date', fromDate);
    if (ceErr) console.warn('[moveLargeProjectDay] calendar_events update warning:', ceErr);
  }

  // 4. Move team assignment (if any)
  const { data: existing } = await supabase
    .from('large_project_team_assignments')
    .select('id, team_id')
    .eq('large_project_id', largeProjectId)
    .eq('phase', phase)
    .eq('assignment_date', fromDate)
    .maybeSingle();

  if (existing?.team_id) {
    await supabase
      .from('large_project_team_assignments')
      .upsert(
        {
          large_project_id: largeProjectId,
          phase,
          assignment_date: toDate,
          team_id: existing.team_id,
        },
        { onConflict: 'large_project_id,phase,assignment_date' }
      );

    await supabase
      .from('large_project_team_assignments')
      .delete()
      .eq('id', existing.id);
  }
}

/**
 * Set/replace the team for a (project, phase, date).
 */
export async function setLargeProjectDayTeam(
  largeProjectId: string,
  phase: LargeProjectPhase,
  date: string,
  teamId: string,
): Promise<void> {
  const { error } = await supabase
    .from('large_project_team_assignments')
    .upsert(
      {
        large_project_id: largeProjectId,
        phase,
        assignment_date: date,
        team_id: teamId,
      },
      { onConflict: 'large_project_id,phase,assignment_date' }
    );
  if (error) throw error;
}
