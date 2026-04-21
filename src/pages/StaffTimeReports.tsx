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
    ],
    queryKeys: [['staff-time-reports-day', dateStr]],
    debounceMs: 400,
  });

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff-time-reports-day', dateStr],
    refetchInterval: 60_000,
    queryFn: async (): Promise<StaffWithDayReport[]> => {
      // Fetch reports + travel + location-based time (e.g. Lager) in parallel
      const [reportsRes, travelRes, locationRes] = await Promise.all([
        supabase
          .from('time_reports')
          .select('id, staff_id, booking_id, hours_worked, start_time, end_time')
          .eq('report_date', dateStr),
        supabase
          .from('travel_time_logs')
          .select('id, staff_id, hours_worked, start_time, end_time, to_address')
          .eq('report_date', dateStr),
        supabase
          .from('location_time_entries')
          .select('id, staff_id, location_id, booking_id, large_project_id, entered_at, exited_at, total_minutes, source')
          .eq('entry_date', dateStr),
      ]);

      if (reportsRes.error) throw reportsRes.error;
      if (travelRes.error) throw travelRes.error;
      if (locationRes.error) throw locationRes.error;

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

      for (const r of reports) {
        const a = byStaff.get(r.staff_id) || newAgg();
        a.total_hours += r.hours_worked || 0;
        a.reports_count += 1;
        if (!r.end_time) a.has_open_report = true;
        if (r.start_time && (!a.earliest_start || r.start_time < a.earliest_start)) {
          a.earliest_start = r.start_time;
        }
        if (r.end_time && (!a.latest_end || r.end_time > a.latest_end)) {
          a.latest_end = r.end_time;
        }
        const label = r.booking_id ? (bookingMap.get(r.booking_id) || 'Okänt projekt') : 'Tidrapport';
        if (r.booking_id) {
          const existing = a.projects.get(r.booking_id);
          a.projects.set(r.booking_id, {
            label,
            is_open: (existing?.is_open || false) || !r.end_time,
            total_hours: (existing?.total_hours || 0) + (r.hours_worked || 0),
          });
        }
        if (r.start_time) {
          const startIso = composeLocalIso(dateStr, r.start_time);
          const endIso = r.end_time ? composeLocalIso(dateStr, r.end_time) : null;
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

      // Location-based time (e.g. Lager via "Starta dag på Lager")
      for (const e of locationEntries) {
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
        const locInfo = locationBookingMap.get(e.location_id);
        const projectKey = locInfo?.booking_id || `loc:${e.location_id}`;
        const projectLabel = locInfo?.label || locNameMap.get(e.location_id) || 'Lager';
        const existing = a.projects.get(projectKey);
        a.projects.set(projectKey, {
          label: projectLabel,
          is_open: (existing?.is_open || false) || isOpen,
          total_hours: (existing?.total_hours || 0) + hours,
        });
        a.segments.push({
          id: `lt:${e.id}`,
          kind: 'location',
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
