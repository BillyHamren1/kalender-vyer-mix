import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { StaffTimeReportsList } from '@/components/staff/StaffTimeReportsList';
import { StaffTimeReportDetail } from '@/components/staff/StaffTimeReportDetail';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { format } from 'date-fns';
import {
  buildStaffDayJournal,
  type RawTimeReport,
  type RawLocationEntry,
  type RawTravelLog,
  type RawWorkday,
} from '@/lib/staff/dayJournal';

export type SegmentKind = 'location' | 'booking' | 'travel' | 'workday';

export interface DaySegment {
  id: string;
  kind: SegmentKind;
  label: string;
  start: string; // ISO timestamp
  end: string | null; // ISO timestamp or null if open
  isOpen: boolean;
  hours: number;
}

interface ProjectInfo {
  booking_id: string;
  label: string;
  is_open: boolean;
  total_hours: number;
}

export interface LatestPing {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  updated_at: string | null;
  app_version: string | null;
  app_build: string | null;
  app_platform: string | null;
}

interface StaffWithDayReport {
  id: string;
  name: string;
  role: string | null;
  color: string | null;
  total_hours: number;
  reports_count: number;
  has_open_report: boolean;
  earliest_start: string | null;
  latest_end: string | null;
  projects: ProjectInfo[];
  segments: DaySegment[];
  journal: import('@/lib/staff/dayJournal').StaffDayJournal;
  latestPing: LatestPing | null;
}

// Build an ISO timestamp from a date (yyyy-MM-dd) and an HH:mm[:ss] time string.
// time_reports stores time as HH:mm:ss without timezone, so we treat it as local.
const composeLocalIso = (dateStr: string, timeStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss = '0'] = timeStr.split(':');
  const dt = new Date(y, (m || 1) - 1, d || 1, Number(hh) || 0, Number(mm) || 0, Number(ss) || 0);
  return dt.toISOString();
};

const StaffTimeReports: React.FC = () => {
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedStaffName, setSelectedStaffName] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayStart = new Date(selectedDate);
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);
  const dayStartIso = dayStart.toISOString();
  const nextDayIso = nextDay.toISOString();

  // Realtime: refresh the day view when any of the source tables change for today.
  useRealtimeInvalidation({
    channelName: `staff-time-reports-day-${dateStr}`,
    tables: [
      { table: 'time_reports', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'travel_time_logs', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'location_time_entries', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'workdays', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'staff_locations', events: ['INSERT', 'UPDATE'] },
    ],
    queryKeys: [['staff-time-reports-day', dateStr]],
    debounceMs: 400,
  });

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff-time-reports-day', dateStr],
    refetchInterval: 60_000,
    queryFn: async (): Promise<StaffWithDayReport[]> => {
      // Fetch reports + travel + location-based time (e.g. Lager) in parallel
      const [reportsRes, travelRes, locationRes, workdaysRes, pingsRes] = await Promise.all([
        // EXCLUDE legacy auto-mirrored rows. The DB trigger
        // `sync_location_entry_to_time_report` was REMOVED 2026-04-22 and
        // time_reports are now created exclusively via
        // `mobile-app-api.handleCreateTimeReport` (single owner).
        // The exclude-filter remains so historical rows from before that
        // migration don't double up against the canonical location_time_entry.
        supabase
          .from('time_reports')
          .select('id, staff_id, booking_id, large_project_id, location_id, hours_worked, start_time, end_time, source, source_entry_id')
          .eq('report_date', dateStr)
          .eq('is_subdivision', false)
          .or('source.is.null,source.neq.location_auto'),
        supabase
          .from('travel_time_logs')
          .select('id, staff_id, hours_worked, start_time, end_time, to_address')
          .eq('report_date', dateStr),
        supabase
          .from('location_time_entries')
          .select('id, staff_id, location_id, booking_id, large_project_id, entered_at, exited_at, total_minutes, source')
          .eq('entry_date', dateStr),
        // Workdays scoped strictly by start day. A workday that starts at
        // T-1 23:30 and ends T 00:38 belongs to T-1 (its start day) — not
        // both days. This matches the mobile UI grouping. Real night shifts
        // (start 22:00, end 02:00) thus appear only on the start day, which
        // is consistent and predictable. Open workdays from earlier days
        // are ghosts (handled by close-stale-workday-entries watchdog) and
        // must NOT bleed into today's view as 50h "still active" timers.
        supabase
          .from('workdays')
          .select('id, staff_id, started_at, ended_at, review_status, review_reasons, notes, admin_note')
          .gte('started_at', dayStartIso)
          .lt('started_at', nextDayIso),
        // Latest GPS ping per staff (one row per staff_id by table design).
        supabase
          .from('staff_locations')
          .select('staff_id, latitude, longitude, updated_at, last_address, app_version, app_build, app_platform'),
      ]);

      if (reportsRes.error) throw reportsRes.error;
      if (travelRes.error) throw travelRes.error;
      if (locationRes.error) throw locationRes.error;
      if (workdaysRes.error) throw workdaysRes.error;
      // pingsRes is non-fatal — fall back to no ping data on error.
      const pingMap = new Map<string, LatestPing>();
      for (const p of (pingsRes.data || []) as any[]) {
        pingMap.set(p.staff_id, {
          address: p.last_address ?? null,
          latitude: p.latitude ?? null,
          longitude: p.longitude ?? null,
          updated_at: p.updated_at ?? null,
          app_version: p.app_version ?? null,
          app_build: p.app_build ?? null,
          app_platform: p.app_platform ?? null,
        });
      }

      // Fire-and-forget: ask backend to fill any missing addresses.
      // Trigger has already nulled out stale ones (>100m moved or >1h old).
      const staffNeedingAddress = [...pingMap.entries()]
        .filter(([, v]) => v.address === null && v.latitude != null && v.longitude != null)
        .map(([id]) => id);
      if (staffNeedingAddress.length > 0) {
        supabase.functions
          .invoke('reverse-geocode-staff', { body: { staff_ids: staffNeedingAddress } })
          .catch(() => { /* best-effort */ });
      }

      const reports = reportsRes.data || [];
      const travel = travelRes.data || [];
      const locationEntries = locationRes.data || [];
      const workdays = workdaysRes.data || [];

      // Resolve location -> internal booking (e.g. Lager) for project label
      const locationIds = [...new Set(locationEntries.map(e => e.location_id).filter(Boolean))];
      const locationBookingMap = new Map<string, { booking_id: string; label: string }>();
      const locNameMap = new Map<string, string>();
      if (locationIds.length > 0) {
        const [{ data: internalProjects }, { data: locations }] = await Promise.all([
          supabase
            .from('projects')
            .select('booking_id, location_id, name')
            .eq('is_internal', true)
            .in('location_id', locationIds),
          supabase
            .from('organization_locations')
            .select('id, name')
            .in('id', locationIds),
        ]);
        (locations || []).forEach(l => locNameMap.set(l.id, l.name));
        (internalProjects || []).forEach(p => {
          if (p.location_id && p.booking_id) {
            locationBookingMap.set(p.location_id, {
              booking_id: p.booking_id,
              label: locNameMap.get(p.location_id) || p.name || 'Lager',
            });
          }
        });
      }

      // Fetch booking labels
      // Fetch booking labels — include both time_reports.booking_id AND
      // location_time_entries.booking_id (auto_assigned check-ins on a booking).
      const bookingIds = [...new Set([
        ...reports.map(r => r.booking_id).filter(Boolean),
        ...locationEntries.map(e => (e as any).booking_id).filter(Boolean),
      ])] as string[];
      const bookingMap = new Map<string, { label: string; is_internal: boolean }>();
      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, client, booking_number, is_internal, internal_type')
          .in('id', bookingIds);
        (bookings || []).forEach(b => {
          let label: string;
          if (b.is_internal) {
            label = b.client || 'Internt';
          } else if (b.booking_number) {
            label = `${b.booking_number} · ${b.client}`;
          } else {
            label = b.client;
          }
          bookingMap.set(b.id, { label, is_internal: !!b.is_internal });
        });
      }

      // Fetch large project labels for LTE rows tied to a large project.
      const largeProjectIds = [...new Set(
        locationEntries.map(e => (e as any).large_project_id).filter(Boolean)
      )] as string[];
      const largeProjectMap = new Map<string, string>();
      if (largeProjectIds.length > 0) {
        const { data: lps } = await supabase
          .from('large_projects')
          .select('id, name')
          .in('id', largeProjectIds);
        (lps || []).forEach(p => largeProjectMap.set(p.id, p.name || 'Stort projekt'));
      }

      // Build per-staff aggregate
      type Agg = {
        total_hours: number;
        reports_count: number;
        has_open_report: boolean;
        earliest_start: string | null;
        latest_end: string | null;
        projects: Map<string, { label: string; is_open: boolean; total_hours: number }>;
        segments: DaySegment[];
      };
      const newAgg = (): Agg => ({
        total_hours: 0,
        reports_count: 0,
        has_open_report: false,
        earliest_start: null,
        latest_end: null,
        projects: new Map(),
        segments: [],
      });
      const byStaff = new Map<string, Agg>();

      const nowMs = Date.now();

      // ── Dedupe key: a (staff_id, booking_id) shift covered by a location_time_entry
      // is the canonical one. Skip any time_reports row for the same staff+booking
      // whose [start,end] window overlaps that LTE — otherwise "Lager" shows twice
      // (once from time_reports, once from location_time_entries) for the same shift.
      const lteWindowsByStaffBooking = new Map<string, Array<[number, number]>>();
      for (const e of locationEntries as any[]) {
        if (!e.booking_id) continue;
        const key = `${e.staff_id}:${e.booking_id}`;
        const startMs = new Date(e.entered_at).getTime();
        const endMs = e.exited_at ? new Date(e.exited_at).getTime() : nowMs;
        const arr = lteWindowsByStaffBooking.get(key) || [];
        arr.push([startMs, endMs]);
        lteWindowsByStaffBooking.set(key, arr);
      }
      const isReportShadowedByLTE = (staffId: string, bookingId: string | null, startIso: string, endIso: string | null) => {
        if (!bookingId) return false;
        const wins = lteWindowsByStaffBooking.get(`${staffId}:${bookingId}`);
        if (!wins) return false;
        const s = new Date(startIso).getTime();
        const e = endIso ? new Date(endIso).getTime() : nowMs;
        return wins.some(([ws, we]) => s < we && e > ws); // overlap
      };

      for (const r of reports) {
        const a = byStaff.get(r.staff_id) || newAgg();

        // Check if this time_report is shadowed by a location_time_entry for the same shift.
        // If so, skip it entirely (both from totals and segments) — the LTE is the canonical source.
        const startIsoForShadow = r.start_time ? composeLocalIso(dateStr, r.start_time) : null;
        const endIsoForShadow = r.end_time ? composeLocalIso(dateStr, r.end_time) : null;
        const shadowed = !!startIsoForShadow && isReportShadowedByLTE(r.staff_id, r.booking_id, startIsoForShadow, endIsoForShadow);

        if (!shadowed) {
          a.total_hours += r.hours_worked || 0;
        }
        a.reports_count += 1;
        if (!r.end_time) a.has_open_report = true;
        if (r.start_time && (!a.earliest_start || r.start_time < a.earliest_start)) {
          a.earliest_start = r.start_time;
        }
        if (r.end_time && (!a.latest_end || r.end_time > a.latest_end)) {
          a.latest_end = r.end_time;
        }
        const bookingInfo = r.booking_id ? bookingMap.get(r.booking_id) : null;
        const label = bookingInfo?.label || (r.booking_id ? 'Okänt projekt' : 'Tidrapport');
        if (r.booking_id && !shadowed) {
          const existing = a.projects.get(r.booking_id);
          a.projects.set(r.booking_id, {
            label,
            is_open: (existing?.is_open || false) || !r.end_time,
            total_hours: (existing?.total_hours || 0) + (r.hours_worked || 0),
          });
        }
        if (r.start_time && !shadowed) {
          const startIso = startIsoForShadow!;
          const endIso = endIsoForShadow;
          const isOpen = !r.end_time;
          const hours = r.hours_worked || (isOpen ? Math.max(0, (nowMs - new Date(startIso).getTime()) / 3_600_000) : 0);
          a.segments.push({
            id: `tr:${r.id}`,
            kind: 'booking',
            label,
            start: startIso,
            end: endIso,
            isOpen,
            hours,
          });
        }
        byStaff.set(r.staff_id, a);
      }

      for (const t of travel) {
        const a = byStaff.get(t.staff_id) || newAgg();
        a.total_hours += t.hours_worked || 0;
        if (t.start_time) {
          const isOpen = !t.end_time;
          const hours = t.hours_worked || (isOpen ? Math.max(0, (nowMs - new Date(t.start_time).getTime()) / 3_600_000) : 0);
          const dest = (t.to_address || '').split(',')[0].trim();
          a.segments.push({
            id: `tv:${t.id}`,
            kind: 'travel',
            label: dest ? `Resa → ${dest}` : 'Resa',
            start: t.start_time,
            end: t.end_time,
            isOpen,
            hours,
          });
          if (isOpen) a.has_open_report = true;
        }
        byStaff.set(t.staff_id, a);
      }

      // Build a map of open travel logs per staff (start_time only) so we can
      // suppress any older still-open location_time_entries for the same staff
      // that should have been closed at travel start. Server-side handler now
      // does this atomically, but legacy/in-flight rows may still leak through.
      const openTravelStartByStaff = new Map<string, number>();
      for (const t of travel as any[]) {
        if (t.end_time) continue;
        if (!t.start_time) continue;
        const ms = new Date(t.start_time).getTime();
        const prev = openTravelStartByStaff.get(t.staff_id);
        if (prev === undefined || ms < prev) openTravelStartByStaff.set(t.staff_id, ms);
      }

      // Location-based time entries.
      // These are the canonical record for: warehouse stays, auto-assigned check-ins
      // on bookings, and large project check-ins. Choose the right label based on
      // what the row points to (booking_id > large_project_id > location_id).
      for (const e of locationEntries as any[]) {
        // Suppress shadowed open LTE: if this row is still open AND a later
        // open travel log exists for the same staff, the LTE is a "ghost"
        // that should have been closed at travel start. Drop it from totals
        // and segments so admin doesn't see two parallel "NU" timers.
        if (!e.exited_at) {
          const travelStartMs = openTravelStartByStaff.get(e.staff_id);
          const enteredMs = new Date(e.entered_at).getTime();
          if (travelStartMs !== undefined && enteredMs < travelStartMs) {
            continue;
          }
        }

        const a = byStaff.get(e.staff_id) || newAgg();
        const isOpen = !e.exited_at;
        const hours = e.total_minutes
          ? e.total_minutes / 60
          : isOpen
            ? Math.max(0, (nowMs - new Date(e.entered_at).getTime()) / 3_600_000)
            : 0;

        // Presence-only LTE: a location_time_entry without booking_id AND
        // without large_project_id is a passive "närvaro" marker (the staff
        // is physically at a place, e.g. FA Warehouse). It must NOT be added
        // to total_hours — that would double-count the same physical time
        // when a parallel booking/project timer (e.g. "Lager") is also
        // running. See memory `location-timer-role-v1`: presence LTE never
        // produces a time_report, so it must not contribute to payable hours.
        const isPresenceOnly = !e.booking_id && !e.large_project_id;

        if (!isPresenceOnly) {
          a.total_hours += hours;
          a.reports_count += 1;
          if (isOpen) a.has_open_report = true;
        }
        const startHHMM = format(new Date(e.entered_at), 'HH:mm:ss');
        if (!a.earliest_start || startHHMM < a.earliest_start) a.earliest_start = startHHMM;
        if (!isOpen && e.exited_at) {
          const endHHMM = format(new Date(e.exited_at), 'HH:mm:ss');
          if (!a.latest_end || endHHMM > a.latest_end) a.latest_end = endHHMM;
        }

        // Resolve label + key + segment kind by precedence.
        let projectKey: string;
        let projectLabel: string;
        let segmentKind: SegmentKind = 'location';
        if (e.booking_id) {
          const info = bookingMap.get(e.booking_id);
          projectKey = e.booking_id;
          projectLabel = info?.label || 'Okänt projekt';
          // Internal booking (Lager) → keep as 'location' icon; real booking → 'booking'.
          segmentKind = info?.is_internal ? 'location' : 'booking';
        } else if (e.large_project_id) {
          projectKey = `lp:${e.large_project_id}`;
          projectLabel = largeProjectMap.get(e.large_project_id) || 'Stort projekt';
          segmentKind = 'booking';
        } else if (e.location_id) {
          const locInfo = locationBookingMap.get(e.location_id);
          projectKey = locInfo?.booking_id || `loc:${e.location_id}`;
          projectLabel = locInfo?.label || locNameMap.get(e.location_id) || 'Lager';
          segmentKind = 'location';
        } else {
          projectKey = `lt:${e.id}`;
          projectLabel = 'Plats';
          segmentKind = 'location';
        }

        // Presence-only segments: show in timeline (so admin sees where the
        // staff was) but with hours=0 so any per-project totals stay correct.
        const segmentLabel = isPresenceOnly ? `Närvaro: ${projectLabel}` : projectLabel;
        const segmentHours = isPresenceOnly ? 0 : hours;

        if (!isPresenceOnly) {
          const existing = a.projects.get(projectKey);
          a.projects.set(projectKey, {
            label: projectLabel,
            is_open: (existing?.is_open || false) || isOpen,
            total_hours: (existing?.total_hours || 0) + hours,
          });
        }
        a.segments.push({
          id: `lt:${e.id}`,
          kind: segmentKind,
          label: segmentLabel,
          start: e.entered_at,
          end: e.exited_at,
          isOpen,
          hours: segmentHours,
        });
        byStaff.set(e.staff_id, a);
      }

      for (const wd of workdays as any[]) {
        const a = byStaff.get(wd.staff_id) || newAgg();
        // Belt-and-suspenders: even though the query above scopes to today,
        // refuse to render an "open workday" that is older than 18h. The
        // watchdog will close it on the next run; in the meantime show it
        // as a closed anomaly rather than a 50h running timer.
        const ageHours =
          (Date.now() - new Date(wd.started_at).getTime()) / (1000 * 60 * 60);
        const isStaleOpen = !wd.ended_at && ageHours > 18;
        const isOpen = !wd.ended_at && !isStaleOpen;
        const startHHMM = format(new Date(wd.started_at), 'HH:mm:ss');

        if (!a.earliest_start || startHHMM < a.earliest_start) {
          a.earliest_start = startHHMM;
        }

        if (isOpen) {
          a.has_open_report = true;
        } else if (wd.ended_at) {
          const endHHMM = format(new Date(wd.ended_at), 'HH:mm:ss');
          if (!a.latest_end || endHHMM > a.latest_end) {
            a.latest_end = endHHMM;
          }
        }

        // Watchdog signal: workday is closed but flagged needs_review,
        // OR notes explicitly say "auto-closed". Show as "⚠ Auto-stängd"
        // so admins can see when a stop wasn't user-initiated.
        const notesStr: string = typeof wd.notes === 'string' ? wd.notes : '';
        const isAutoClosed =
          !!wd.ended_at &&
          (notesStr.toLowerCase().includes('auto-closed') ||
            wd.review_status === 'needs_review');

        let label: string;
        if (isStaleOpen) {
          label = 'Arbetsdag — ej avslutad (anomali)';
        } else if (isAutoClosed) {
          label = '⚠ Auto-stängd arbetsdag';
        } else {
          label = 'Arbetsdag startad';
        }

        a.segments.push({
          id: `wd:${wd.id}`,
          kind: 'workday',
          label,
          start: wd.started_at,
          end: wd.ended_at,
          isOpen,
          hours: 0,
        });

        byStaff.set(wd.staff_id, a);
      }

      const staffIds = [...byStaff.keys()];
      if (staffIds.length === 0) return [];

      const { data: staff, error: staffError } = await supabase
        .from('staff_members')
        .select('id, name, role, color')
        .in('id', staffIds);

      if (staffError) throw staffError;

      return (staff || [])
        .map(s => {
          const a = byStaff.get(s.id)!;
          // Sort segments: open first, then newest start desc
          const segments = [...a.segments].sort((x, y) => {
            if (x.isOpen !== y.isOpen) return x.isOpen ? -1 : 1;
            return new Date(y.start).getTime() - new Date(x.start).getTime();
          });

          // Build the per-staff journal (the new, hierarchical view).
          const staffReports: RawTimeReport[] = (reports as any[])
            .filter(r => r.staff_id === s.id && r.start_time)
            .map(r => ({
              id: r.id,
              booking_id: r.booking_id,
              start_iso: composeLocalIso(dateStr, r.start_time),
              end_iso: r.end_time ? composeLocalIso(dateStr, r.end_time) : null,
              hours: r.hours_worked || 0,
            }));

          const staffLTEs: RawLocationEntry[] = (locationEntries as any[])
            .filter(e => e.staff_id === s.id)
            .map(e => {
              const isPresenceOnly = !e.booking_id && !e.large_project_id;
              const isOpen = !e.exited_at;
              const hours = e.total_minutes
                ? e.total_minutes / 60
                : isOpen
                  ? Math.max(0, (nowMs - new Date(e.entered_at).getTime()) / 3_600_000)
                  : 0;
              let label = 'Plats';
              if (e.booking_id) {
                label = bookingMap.get(e.booking_id)?.label || 'Okänt projekt';
              } else if (e.large_project_id) {
                label = largeProjectMap.get(e.large_project_id) || 'Stort projekt';
              } else if (e.location_id) {
                label = locationBookingMap.get(e.location_id)?.label
                  || locNameMap.get(e.location_id)
                  || 'Lager';
              }
              return {
                id: e.id,
                booking_id: e.booking_id,
                large_project_id: e.large_project_id,
                location_id: e.location_id,
                entered_at: e.entered_at,
                exited_at: e.exited_at,
                hours: isPresenceOnly ? 0 : hours,
                label,
                isPresenceOnly,
              };
            });

          const staffTravel: RawTravelLog[] = (travel as any[])
            .filter(t => t.staff_id === s.id && t.start_time)
            .map(t => ({
              id: t.id,
              start_iso: t.start_time,
              end_iso: t.end_time,
              hours: t.hours_worked || 0,
              to_address: t.to_address,
            }));

          const staffWorkdays: RawWorkday[] = (workdays as any[])
            .filter(w => w.staff_id === s.id)
            .map(w => ({
              id: w.id,
              started_at: w.started_at,
              ended_at: w.ended_at,
              admin_note: w.admin_note ?? null,
            }));

          const journal = buildStaffDayJournal({
            reports: staffReports,
            locationEntries: staffLTEs,
            travel: staffTravel,
            workdays: staffWorkdays,
            latestPing: pingMap.get(s.id) || null,
          });

          return {
            id: s.id,
            name: s.name,
            role: s.role,
            color: s.color,
            total_hours: a.total_hours,
            reports_count: a.reports_count,
            has_open_report: a.has_open_report,
            earliest_start: a.earliest_start,
            latest_end: a.latest_end,
            projects: [...a.projects.entries()]
              .map(([booking_id, v]) => ({
                booking_id,
                label: v.label,
                is_open: v.is_open,
                total_hours: v.total_hours,
              }))
              .sort((x, y) => y.total_hours - x.total_hours),
            segments,
            journal,
            latestPing: pingMap.get(s.id) || null,
          };
        })
        .sort((a, b) => {
          if (a.has_open_report !== b.has_open_report) return a.has_open_report ? -1 : 1;
          return a.name.localeCompare(b.name, 'sv');
        });
    },
  });

  if (selectedStaffId) {
    return (
      <PageContainer theme="purple">
        <PageHeader
          icon={Clock}
          title={selectedStaffName}
          subtitle="Tidrapporter per vecka"
          variant="purple"
        >
          <Button variant="outline" size="sm" onClick={() => setSelectedStaffId(null)} className="rounded-lg gap-1.5 h-8 px-3">
            <ArrowLeft className="h-3.5 w-3.5" />
            Tillbaka
          </Button>
        </PageHeader>
        <StaffTimeReportDetail
          staffId={selectedStaffId}
          staffName={selectedStaffName}
          initialDate={selectedDate}
          autoOpenDailyOverviewDate={dateStr}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer theme="purple">
      <PageHeader
        icon={Clock}
        title="Tidrapporter"
        subtitle="Översikt av rapporterad tid per personal"
        variant="purple"
      />
      <StaffTimeReportsList
        staffList={staffList}
        isLoading={isLoading}
        onSelectStaff={(id, name) => {
          setSelectedStaffId(id);
          setSelectedStaffName(name);
        }}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />
    </PageContainer>
  );
};

export default StaffTimeReports;
