// Dry-run for phase-date consolidation v1.
// READ-ONLY: scans projects.<phase>date and reports how many calendar_events
// rows WOULD be inserted by the consolidation migration. Does not write
// anything to the database.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Phase = 'rig' | 'event' | 'rigDown';

const PHASE_FIELDS: Record<Phase, { date: string; start: string; end: string }> = {
  rig:     { date: 'rigdaydate',  start: 'rig_start_time',     end: 'rig_end_time' },
  event:   { date: 'eventdate',   start: 'event_start_time',   end: 'event_end_time' },
  rigDown: { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' },
};

interface Candidate {
  project_id: string;
  booking_id: string;
  organization_id: string;
  phase: Phase;
  source_date: string;
  reason: 'missing_in_calendar_events';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Pull all projects with a booking_id and any phase date set.
    const { data: projects, error: pErr } = await supabase
      .from('projects')
      .select('id, booking_id, organization_id, rigdaydate, eventdate, rigdowndate')
      .not('booking_id', 'is', null);
    if (pErr) throw pErr;

    const bookingIds = Array.from(new Set((projects ?? []).map((p: any) => p.booking_id).filter(Boolean)));

    // 2. Pull existing calendar_events rows for those bookings (rig/event/rigDown).
    const existingByKey = new Set<string>();
    const chunkSize = 200;
    for (let i = 0; i < bookingIds.length; i += chunkSize) {
      const chunk = bookingIds.slice(i, i + chunkSize);
      const { data: ce, error: ceErr } = await supabase
        .from('calendar_events')
        .select('booking_id, event_type, source_date, start_time')
        .in('booking_id', chunk)
        .in('event_type', ['rig', 'event', 'rigDown']);
      if (ceErr) throw ceErr;
      for (const r of ce ?? []) {
        const d = (r as any).source_date ?? String((r as any).start_time ?? '').slice(0, 10);
        if (d) existingByKey.add(`${(r as any).booking_id}|${(r as any).event_type}|${d}`);
      }
    }

    // 3. Compute candidates: project has phase date, but no calendar_events row exists for it.
    const candidates: Candidate[] = [];
    let projectsWithAnyDate = 0;
    for (const p of projects ?? []) {
      const proj = p as any;
      let hasAny = false;
      (Object.keys(PHASE_FIELDS) as Phase[]).forEach((phase) => {
        const dateField = PHASE_FIELDS[phase].date;
        const date: string | null = proj[dateField];
        if (!date) return;
        hasAny = true;
        const key = `${proj.booking_id}|${phase}|${date}`;
        if (!existingByKey.has(key)) {
          candidates.push({
            project_id: proj.id,
            booking_id: proj.booking_id,
            organization_id: proj.organization_id,
            phase,
            source_date: date,
            reason: 'missing_in_calendar_events',
          });
        }
      });
      if (hasAny) projectsWithAnyDate++;
    }

    // 4. Group counts by phase + organization for quick eyeballing.
    const byPhase: Record<Phase, number> = { rig: 0, event: 0, rigDown: 0 };
    const byOrg: Record<string, number> = {};
    for (const c of candidates) {
      byPhase[c.phase]++;
      byOrg[c.organization_id] = (byOrg[c.organization_id] ?? 0) + 1;
    }

    return new Response(JSON.stringify({
      generated_at: new Date().toISOString(),
      projects_scanned: projects?.length ?? 0,
      projects_with_any_phase_date: projectsWithAnyDate,
      bookings_scanned: bookingIds.length,
      existing_calendar_event_rows_for_phases: existingByKey.size,
      events_to_insert: candidates.length,
      breakdown_by_phase: byPhase,
      breakdown_by_organization: byOrg,
      examples: candidates.slice(0, 20),
      note: 'READ-ONLY. No rows were inserted, updated, or deleted. Run the additive migration only after reviewing these numbers.',
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as any)?.message ?? err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
