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

export type SegmentKind = 'location' | 'booking' | 'travel';

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

  // Realtime: refresh the day view when any of the source tables change for today.
  useRealtimeInvalidation({
    channelName: `staff-time-reports-day-${dateStr}`,
    tables: [
      { table: 'time_reports', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'travel_time_logs', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'location_time_entries', events: ['INSERT', 'UPDATE', 'DELETE'] },
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
      const [reportsRes, travelRes, locationRes, pingsRes] = await Promise.all([
        // EXCLUDE auto-mirrored rows: a DB trigger (sync_location_entry_to_time_report)
        // copies every closed location_time_entry into time_reports with
        // source='location_auto'. That's the SAME shift — counting it again would
        // start a second timer / row in the UI. The location_time_entry is the
        // canonical record; we render only that one.
        supabase
          .from('time_reports')
          .select('id, staff_id, booking_id, hours_worked, start_time, end_time, source, source_entry_id')
          .eq('report_date', dateStr)
          .or('source.is.null,source.neq.location_auto'),
        supabase
          .from('travel_time_logs')
          .select('id, staff_id, hours_worked, start_time, end_time, to_address')
          .eq('report_date', dateStr),
        supabase
          .from('location_time_entries')
          .select('id, staff_id, location_id, booking_id, large_project_id, entered_at, exited_at, total_minutes, source')
          .eq('entry_date', dateStr),
        // Latest GPS ping per staff (one row per staff_id by table design).
        supabase
          .from('staff_locations')
          .select('staff_id, latitude, longitude, updated_at, last_address'),
      ]);

      if (reportsRes.error) throw reportsRes.error;
      if (travelRes.error) throw travelRes.error;
      if (locationRes.error) throw locationRes.error;
      // pingsRes is non-fatal — fall back to no ping data on error.
      const pingMap = new Map<string, LatestPing>();
      for (const p of (pingsRes.data || []) as any[]) {
        pingMap.set(p.staff_id, {
          address: p.last_address ?? null,
          latitude: p.latitude ?? null,
          longitude: p.longitude ?? null,
          updated_at: p.updated_at ?? null,
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
        a.total_hours += hours;
        a.reports_count += 1;
        if (isOpen) a.has_open_report = true;
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

        const existing = a.projects.get(projectKey);
        a.projects.set(projectKey, {
          label: projectLabel,
          is_open: (existing?.is_open || false) || isOpen,
          total_hours: (existing?.total_hours || 0) + hours,
        });
        a.segments.push({
          id: `lt:${e.id}`,
          kind: segmentKind,
          label: projectLabel,
          start: e.entered_at,
          end: e.exited_at,
          isOpen,
          hours,
        });
        byStaff.set(e.staff_id, a);
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
          <Button variant="outline" size="sm" onClick={() => setSelectedStaffId(null)} className="rounded-xl">
            <ArrowLeft className="h-4 w-4 mr-1" />
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
