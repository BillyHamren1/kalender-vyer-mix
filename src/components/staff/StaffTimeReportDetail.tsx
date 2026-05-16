import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Calendar, Car, AlertTriangle, MapPin, Coffee, Briefcase, HelpCircle, Pin, Route, Activity, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, parseISO, eachDayOfInterval, isToday, getISOWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { formatHoursMinutes } from '@/utils/formatHours';
import { detectAnomalies, getAnomaliesForDate, type Anomaly, type TimeEntry, type TravelEntry, type TeamMemberReport, type AssignmentDate } from '@/lib/timeReportAnomalies';
import { AnomalyDialog } from './AnomalyDialog';
import { WorkdayFlagsAdminSection } from './WorkdayFlagsAdminSection';
import { DailyOverviewDialog } from './DailyOverviewDialog';
import { StaffMovementMap } from './StaffMovementMap';
import { StaffLatestPing, type LatestPing } from './StaffLatestPing';
import { formatStockholmHm, formatStockholmHms } from '../../lib/staff/formatStockholmTime';
import {
  useStaffDaySubmissionsRange,
  deriveSubmissionDisplay,
} from '@/hooks/useStaffDaySubmissionsRange';
import { StaffDaySubmissionStatusBadge } from './StaffDaySubmissionStatusBadge';

interface StaffTimeReportDetailProps {
  staffId: string;
  staffName: string;
  initialDate?: Date;
  /** If provided (yyyy-MM-dd), opens the daily overview dialog automatically on mount. */
  autoOpenDailyOverviewDate?: string;
}

interface TimeReportRow {
  id: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  overtime_hours: number | null;
  description: string | null;
  approved: boolean | null;
  booking_client: string;
  booking_number: string | null;
  booking_id: string | null;
  type: 'work' | 'travel';
}

interface RawTravelLog {
  id: string;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  destination_booking_id: string | null;
  from_address: string | null;
  to_address: string | null;
  from_latitude: number | null;
  from_longitude: number | null;
  to_latitude: number | null;
  to_longitude: number | null;
}

export const StaffTimeReportDetail: React.FC<StaffTimeReportDetailProps> = ({
  staffId,
  staffName,
  initialDate,
  autoOpenDailyOverviewDate,
}) => {
  const [currentWeek, setCurrentWeek] = useState(initialDate || new Date());
  const [anomalyDate, setAnomalyDate] = useState<string | null>(null);
  const [dailyOverviewDate, setDailyOverviewDate] = useState<string | null>(autoOpenDailyOverviewDate ?? null);
  const [movementDate, setMovementDate] = useState<string | null>(null);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const monthStart = format(weekStart, 'yyyy-MM-dd');
  const monthEnd = format(weekEnd, 'yyyy-MM-dd');
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const isoWeek = getISOWeek(weekStart);

  // Pending correction suggestions for the visible week (badge per day)
  const { data: pendingSuggestions } = useQuery({
    queryKey: ['pending-suggestions', staffId, monthStart, monthEnd],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('time_report_correction_suggestions')
        .select('id, report_date')
        .eq('staff_id', staffId)
        .eq('status', 'pending')
        .gte('report_date', monthStart)
        .lte('report_date', monthEnd);
      return data ?? [];
    },
  });
  const pendingSuggestionsByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of pendingSuggestions ?? []) {
      m.set(s.report_date, (m.get(s.report_date) ?? 0) + 1);
    }
    return m;
  }, [pendingSuggestions]);

  // Lager 5.7 — Användarens egna submissions för veckan (read-only, status-projektion).
  const { data: weekSubmissions } = useStaffDaySubmissionsRange(staffId, monthStart, monthEnd);
  const submissionByDate = useMemo(() => {
    const m = new Map<string, (typeof weekSubmissions extends (infer U)[] | undefined ? U : never)>();
    for (const s of weekSubmissions ?? []) m.set(s.date, s as any);
    return m as Map<string, NonNullable<typeof weekSubmissions>[number]>;
  }, [weekSubmissions]);


  const { data: queryData, isLoading } = useQuery({
    queryKey: ['staff-time-reports-detail', staffId, monthStart],
    queryFn: async () => {
      const [timeResult, travelResult] = await Promise.all([
        supabase
          .from('time_reports')
          .select(`
            id, report_date, start_time, end_time, hours_worked,
            overtime_hours, description, approved, booking_id, large_project_id,
            bookings (client, booking_number, large_project_id)
          `)
          .eq('staff_id', staffId)
          .gte('report_date', monthStart)
          .lte('report_date', monthEnd)
          .order('report_date', { ascending: false }),
        supabase
          .from('travel_time_logs')
          .select('id, report_date, start_time, end_time, hours_worked, destination_booking_id, from_address, to_address, from_latitude, from_longitude, to_latitude, to_longitude, classification')
          .eq('staff_id', staffId)
          .gte('report_date', monthStart)
          .lte('report_date', monthEnd)
          .not('end_time', 'is', null),
      ]);

      if (timeResult.error) throw timeResult.error;
      if (travelResult.error) throw travelResult.error;

      const rawTravel: RawTravelLog[] = (travelResult.data || []).map((t: any) => ({
        id: t.id,
        report_date: t.report_date,
        start_time: t.start_time,
        end_time: t.end_time,
        hours_worked: t.hours_worked,
        destination_booking_id: t.destination_booking_id,
        from_address: t.from_address,
        to_address: t.to_address,
        from_latitude: t.from_latitude,
        from_longitude: t.from_longitude,
        to_latitude: t.to_latitude,
        to_longitude: t.to_longitude,
      }));

      // Fetch destination booking names + large project names
      const travelBookingIds = rawTravel.map(t => t.destination_booking_id).filter(Boolean) as string[];
      const lpIds = (timeResult.data || [])
        .flatMap((r: any) => [r.bookings?.large_project_id, r.large_project_id])
        .filter(Boolean) as string[];

      let destBookingMap = new Map<string, string>();
      let lpNameMap = new Map<string, { name: string; project_number: string | null }>();

      const [destRes, lpRes] = await Promise.all([
        travelBookingIds.length > 0
          ? supabase.from('bookings').select('id, client').in('id', travelBookingIds)
          : null,
        lpIds.length > 0
          ? supabase.from('large_projects').select('id, name, project_number').in('id', [...new Set(lpIds)])
          : null,
      ]);

      for (const b of destRes?.data || []) destBookingMap.set(b.id, b.client);
      for (const lp of lpRes?.data || []) lpNameMap.set(lp.id, { name: lp.name, project_number: lp.project_number });

      // Map time reports
      const workRows: TimeReportRow[] = (timeResult.data || []).map((r: any) => {
        // Direct large_project_id on the row (project timer with no booking) takes precedence
        const directLp = r.large_project_id ? lpNameMap.get(r.large_project_id) : null;
        const bookingLpName = r.bookings?.large_project_id
          ? lpNameMap.get(r.bookings.large_project_id)?.name
          : null;
        // Internal warehouse booking uses a synthetic booking_number ("LAGER-xxxxxxxx")
        // that is a technical id, not a real project number — hide it in the UI.
        const rawBookingNumber = r.bookings?.booking_number || null;
        const isInternalLager =
          typeof rawBookingNumber === 'string' && rawBookingNumber.startsWith('LAGER-');
        const clientLabel = directLp?.name || bookingLpName || r.bookings?.client || '-';
        const numberLabel = directLp
          ? directLp.project_number
          : (bookingLpName || isInternalLager ? null : rawBookingNumber);
        return {
          id: r.id,
          report_date: r.report_date,
          start_time: r.start_time,
          end_time: r.end_time,
          hours_worked: r.hours_worked,
          overtime_hours: r.overtime_hours,
          description: r.description,
          approved: r.approved,
          booking_client: clientLabel,
          booking_number: numberLabel,
          booking_id: r.booking_id || null,
          type: 'work' as const,
        };
      });

      // Map travel logs
      const travelRows: TimeReportRow[] = rawTravel.map(t => {
        const destClient = t.destination_booking_id
          ? destBookingMap.get(t.destination_booking_id)
          : null;
        const clientLabel = destClient ? `Resa → ${destClient}` : 'Resa';
        return {
          id: t.id,
          report_date: t.report_date,
          start_time: t.start_time,
          end_time: t.end_time,
          hours_worked: t.hours_worked,
          overtime_hours: null,
          description: [t.from_address, t.to_address].filter(Boolean).join(' → ') || null,
          approved: null,
          booking_client: clientLabel,
          booking_number: null,
          booking_id: t.destination_booking_id || null,
          type: 'travel' as const,
        };
      });

      const reports = [...workRows, ...travelRows].sort((a, b) => {
        const dateComp = a.report_date.localeCompare(b.report_date);
        if (dateComp !== 0) return -dateComp;
        return (a.start_time || '').localeCompare(b.start_time || '');
      });

      return { reports, rawTravel };
    },
  });

  // Team data + assignments query for anomaly detection
  const { data: teamData } = useQuery({
    queryKey: ['staff-team-anomaly-data', staffId, monthStart],
    queryFn: async (): Promise<{ teamReports: TeamMemberReport[]; assignments: AssignmentDate[] }> => {
      // Get this staff's assignments for the month
      const { data: bsa } = await supabase
        .from('booking_staff_assignments')
        .select('booking_id, assignment_date')
        .eq('staff_id', staffId)
        .gte('assignment_date', monthStart)
        .lte('assignment_date', monthEnd);

      if (!bsa || bsa.length === 0) return { teamReports: [], assignments: [] };

      const assignments: AssignmentDate[] = bsa.map(a => ({
        date: a.assignment_date,
        booking_id: a.booking_id,
      }));

      // Get team members for same bookings+dates
      const bookingDatePairs = bsa.map(a => a.booking_id);
      const uniqueBookingIds = [...new Set(bookingDatePairs)];

      const { data: teamBsa } = await supabase
        .from('booking_staff_assignments')
        .select('staff_id, booking_id, assignment_date')
        .in('booking_id', uniqueBookingIds.slice(0, 50))
        .gte('assignment_date', monthStart)
        .lte('assignment_date', monthEnd)
        .neq('staff_id', staffId);

      if (!teamBsa || teamBsa.length === 0) return { teamReports: [], assignments };

      const teamStaffIds = [...new Set(teamBsa.map(t => t.staff_id))];

      // Get team members' time reports
      const { data: teamTr } = await supabase
        .from('time_reports')
        .select('staff_id, report_date, start_time, end_time, booking_id, staff_members!inner(name)')
        .in('staff_id', teamStaffIds.slice(0, 30))
        .gte('report_date', monthStart)
        .lte('report_date', monthEnd);

      const teamReports: TeamMemberReport[] = (teamTr || []).map((r: any) => ({
        staff_name: r.staff_members?.name || 'Okänd',
        report_date: r.report_date,
        start_time: r.start_time,
        end_time: r.end_time,
        booking_id: r.booking_id,
      }));

      return { teamReports, assignments };
    },
    enabled: !isLoading && !!queryData,
  });

  const reports = queryData?.reports || [];
  const rawTravel = queryData?.rawTravel || [];

  // Background-tracked absence anomalies (geofence-based)
  const { data: bgAnomalies = [] } = useQuery({
    queryKey: ['staff-bg-anomalies', staffId, monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('time_report_anomalies')
        .select('id, time_report_id, started_at, ended_at, duration_minutes, classification, work_description, location_id, end_location_lat, end_location_lng, auto_classified, organization_locations(name)')
        .eq('staff_id', staffId)
        .gte('started_at', `${monthStart}T00:00:00`)
        .lte('started_at', `${monthEnd}T23:59:59`)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: true });
      return data || [];
    },
  });

  // Group anomalies by time_report_id (linked) and by date (unlinked)
  const anomaliesByReportId = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of bgAnomalies as any[]) {
      if (!a.time_report_id) continue;
      if (!map.has(a.time_report_id)) map.set(a.time_report_id, []);
      map.get(a.time_report_id)!.push(a);
    }
    return map;
  }, [bgAnomalies]);

  const unlinkedAnomaliesByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of bgAnomalies as any[]) {
      if (a.time_report_id) continue;
      const date = a.started_at.slice(0, 10);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(a);
    }
    return map;
  }, [bgAnomalies]);

  // Fetch booking geocodes for work entries (for daily overview map)
  const bookingIdsInReports = useMemo(() => {
    return [...new Set(reports.filter(r => r.booking_id).map(r => r.booking_id!))];
  }, [reports]);

  const { data: bookingGeoMap = new Map<string, { lat: number; lng: number }>() } = useQuery({
    queryKey: ['booking-geocodes', bookingIdsInReports],
    queryFn: async () => {
      if (bookingIdsInReports.length === 0) return new Map<string, { lat: number; lng: number }>();
      // Try bookings first
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, delivery_latitude, delivery_longitude, large_project_id')
        .in('id', bookingIdsInReports.slice(0, 50));

      const geoMap = new Map<string, { lat: number; lng: number }>();
      const lpIds: string[] = [];
      for (const b of bookings || []) {
        if (b.delivery_latitude && b.delivery_longitude) {
          geoMap.set(b.id, { lat: b.delivery_latitude, lng: b.delivery_longitude });
        } else if (b.large_project_id) {
          lpIds.push(b.large_project_id);
        }
      }
      // Fallback to large_project geocodes
      if (lpIds.length > 0) {
        const { data: lps } = await supabase
          .from('large_projects')
          .select('id, address_latitude, address_longitude')
          .in('id', [...new Set(lpIds)]);
        const lpGeo = new Map<string, { lat: number; lng: number }>();
        for (const lp of lps || []) {
          if (lp.address_latitude && lp.address_longitude) {
            lpGeo.set(lp.id, { lat: lp.address_latitude, lng: lp.address_longitude });
          }
        }
        for (const b of bookings || []) {
          if (!geoMap.has(b.id) && b.large_project_id && lpGeo.has(b.large_project_id)) {
            geoMap.set(b.id, lpGeo.get(b.large_project_id)!);
          }
        }
      }
      return geoMap;
    },
    enabled: bookingIdsInReports.length > 0,
  });

  // Active/closed location_time_entries for the selected day (live lager-pass).
  // These are NOT yet in time_reports while ongoing, so the dialog must read
  // them directly to match the totals shown in the table.
  const { data: dailyLocationEntries = [] } = useQuery({
    queryKey: ['daily-overview-lte', staffId, dailyOverviewDate],
    enabled: !!dailyOverviewDate,
    queryFn: async () => {
      const { data } = await supabase
        .from('location_time_entries')
        .select('id, entered_at, exited_at, location_id, source, organization_locations(name, latitude, longitude)')
        .eq('staff_id', staffId)
        .eq('entry_date', dailyOverviewDate!)
        .order('entered_at', { ascending: true });
      return data || [];
    },
  });

  // Daily overview data
  const dailyOverviewTravel = useMemo(() => {
    if (!dailyOverviewDate) return [];
    return rawTravel.filter(t => t.report_date === dailyOverviewDate)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  }, [dailyOverviewDate, rawTravel]);

  const dailyOverviewWork = useMemo(() => {
    if (!dailyOverviewDate) return [];

    const reportRows = reports
      .filter(r => r.report_date === dailyOverviewDate && r.type === 'work')
      .map(r => {
        const geo = r.booking_id ? bookingGeoMap.get(r.booking_id) : undefined;
        return {
          id: r.id,
          start_time: r.start_time,
          end_time: r.end_time,
          hours_worked: r.hours_worked,
          booking_client: r.booking_client,
          booking_number: r.booking_number,
          description: r.description,
          delivery_lat: geo?.lat || null,
          delivery_lng: geo?.lng || null,
          ongoing: !r.end_time,
        };
      });

    // Dedupe: historical closed LTE rows that legacy trigger mirrored into
    // time_reports (source='location_auto', pre 2026-04-22) would otherwise
    // show twice. New rows go via the single-owner write path so this is
    // only relevant for back-fill / old data. Skip closed LTE if a report
    // starts within ±2 min.
    const reportStartMinutes = reportRows
      .map(r => {
        const t = r.start_time;
        if (!t) return null;
        const hhmm = t.includes('T') ? formatStockholmHm(t) : t.slice(0, 5);
        return parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3, 5), 10);
      })
      .filter((m): m is number => m !== null);

    // Build a sorted list of travel-log start times (ms) for this day so we
    // can cap an open warehouse session to the moment the staff started
    // travelling (root cause of double-counted hours when geofence-exit was
    // missed and exited_at stayed NULL).
    const travelStartsMs = dailyOverviewTravel
      .map(t => (t.start_time ? new Date(t.start_time).getTime() : NaN))
      .filter(n => !Number.isNaN(n))
      .sort((a, b) => a - b);

    const lteRows = (dailyLocationEntries as any[])
      .filter(lte => {
        if (!lte.exited_at) return true; // ongoing — always include (will be capped below)
        const hhmm = formatStockholmHm(String(lte.entered_at));
        const lteMin = parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3, 5), 10);
        return !reportStartMinutes.some(m => Math.abs(m - lteMin) <= 2);
      })
      .map(lte => {
        const start = new Date(lte.entered_at);
        const startMs = start.getTime();
        const isOngoing = !lte.exited_at;

        // Cap: if a travel log started after this entry, the warehouse
        // session must have ended at least by then.
        let cappedAtTravel: number | null = null;
        if (isOngoing) {
          const nextTravel = travelStartsMs.find(ms => ms > startMs);
          if (nextTravel) cappedAtTravel = nextTravel;
        }

        const endMs = lte.exited_at
          ? new Date(lte.exited_at).getTime()
          : (cappedAtTravel ?? Date.now());
        const hours = Math.max(0, (endMs - startMs) / 3_600_000);
        const locName = lte.organization_locations?.name || 'Lager';
        const wasCapped = cappedAtTravel !== null;
        return {
          id: `lte-${lte.id}`,
          start_time: lte.entered_at as string,
          end_time: wasCapped
            ? new Date(cappedAtTravel!).toISOString()
            : ((lte.exited_at as string | null) || null),
          hours_worked: hours,
          booking_client: locName,
          booking_number: null as string | null,
          description: wasCapped
            ? '⚠️ Lagerpass ej stängt — kapad till resans start'
            : (lte.exited_at ? `Lagervistelse (${lte.source})` : 'Lagervistelse — pågår'),
          delivery_lat: lte.organization_locations?.latitude
            ? Number(lte.organization_locations.latitude)
            : null,
          delivery_lng: lte.organization_locations?.longitude
            ? Number(lte.organization_locations.longitude)
            : null,
          ongoing: isOngoing && !wasCapped,
        };
      });

    return [...reportRows, ...lteRows].sort(
      (a, b) => (a.start_time || '').localeCompare(b.start_time || '')
    );
  }, [dailyOverviewDate, reports, bookingGeoMap, dailyLocationEntries, dailyOverviewTravel]);

  // Compute anomalies
  const anomalies = useMemo<Anomaly[]>(() => {
    if (!teamData) return [];

    const timeEntries: TimeEntry[] = reports.map(r => ({
      id: r.id,
      report_date: r.report_date,
      start_time: r.start_time,
      end_time: r.end_time,
      hours_worked: r.hours_worked,
      type: r.type,
    }));

    const travelEntries: TravelEntry[] = rawTravel.map(t => ({
      id: t.id,
      report_date: t.report_date,
      start_time: t.start_time,
      end_time: t.end_time,
      hours_worked: t.hours_worked,
      from_latitude: t.from_latitude,
      from_longitude: t.from_longitude,
      to_latitude: t.to_latitude,
      to_longitude: t.to_longitude,
      from_address: t.from_address,
      to_address: t.to_address,
    }));

    return detectAnomalies(
      timeEntries,
      travelEntries,
      teamData.teamReports,
      teamData.assignments,
      staffName,
    );
  }, [reports, rawTravel, teamData, staffName]);

  const anomalyCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of anomalies) {
      map.set(a.date, (map.get(a.date) || 0) + 1);
    }
    return map;
  }, [anomalies]);

  const totalHours = reports.reduce((sum, r) => sum + r.hours_worked, 0);
  const totalOvertime = reports.reduce((sum, r) => sum + (r.overtime_hours || 0), 0);
  const totalTravelHours = reports.filter(r => r.type === 'travel').reduce((sum, r) => sum + r.hours_worked, 0);

  // Dialog data
  const dialogAnomalies = anomalyDate ? getAnomaliesForDate(anomalies, anomalyDate) : [];
  const dialogTravelRoutes = anomalyDate
    ? rawTravel
        .filter(t => t.report_date === anomalyDate)
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
        .map(t => ({
          start_time: t.start_time,
          from_address: t.from_address,
          to_address: t.to_address,
          hours_worked: t.hours_worked,
        }))
    : [];

  const weekRangeLabel = `${format(weekStart, 'd MMM', { locale: sv })} – ${format(weekEnd, 'd MMM yyyy', { locale: sv })}`;

  // Latest GPS ping for this staff (header row). One snapshot per page open;
  // refetches on realtime invalidation through the parent query keys.
  const { data: latestPing } = useQuery({
    queryKey: ['staff-latest-ping', staffId],
    queryFn: async (): Promise<LatestPing | null> => {
      const { data } = await supabase
        .from('staff_locations')
        .select('latitude, longitude, updated_at, last_address')
        .eq('staff_id', staffId)
        .maybeSingle();
      if (!data) return null;
      // Best-effort backfill if address missing.
      if (data.last_address == null && data.latitude != null && data.longitude != null) {
        supabase.functions
          .invoke('reverse-geocode-staff', { body: { staff_ids: [staffId] } })
          .catch(() => {});
      }
      return {
        address: data.last_address ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        updated_at: data.updated_at ?? null,
      };
    },
  });

  return (
    <>
      <PremiumCard
        icon={Calendar}
        title={`Vecka ${isoWeek}`}
        subtitle={`${weekRangeLabel} · ${formatHoursMinutes(totalHours)} totalt`}
      >
        {/* Latest GPS ping header */}
        <div className="mb-3">
          <StaffLatestPing ping={latestPing} />
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeek(prev => subWeeks(prev, 1))}
            className="rounded-lg h-8 px-3 gap-1.5"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Förra vecka
          </Button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-semibold capitalize text-[hsl(var(--heading))]">Vecka {isoWeek}</span>
            <span className="text-xs text-muted-foreground capitalize">{weekRangeLabel}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeek(prev => addWeeks(prev, 1))}
            className="rounded-lg h-8 px-3 gap-1.5"
          >
            Nästa vecka
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Today shortcut */}
        <div className="flex justify-center mb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentWeek(new Date())}
            className="rounded-lg text-xs h-7 text-muted-foreground hover:text-foreground"
          >
            Gå till denna vecka
          </Button>
        </div>

        {/* Summary badges */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          <Badge variant="secondary" className="text-[11px] gap-1 font-medium">
            <Clock className="h-3 w-3" />
            {formatHoursMinutes(totalHours)} totalt
          </Badge>
          {totalOvertime > 0 && (
            <Badge variant="outline" className="text-[11px] font-medium">
              Övertid: {formatHoursMinutes(totalOvertime)}
            </Badge>
          )}
          {totalTravelHours > 0 && (
            <Badge variant="outline" className="text-[11px] gap-1 font-medium border-primary/30 text-primary">
              <Car className="h-3 w-3" />
              Restid: {formatHoursMinutes(totalTravelHours)}
            </Badge>
          )}
          <Badge variant="outline" className="text-[11px] font-medium">
            {reports.length} rapporter
          </Badge>
          {anomalies.length > 0 && (
            <Badge
              variant="outline"
              className="text-[11px] gap-1 font-medium border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10 cursor-pointer"
              onClick={() => setAnomalyDate(anomalies[0].date)}
            >
              <AlertTriangle className="h-3 w-3" />
              {anomalies.length} avvikelse{anomalies.length !== 1 ? 'r' : ''}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/10 hover:bg-primary/10">
                  <TableHead className="font-bold text-foreground">Kund</TableHead>
                  <TableHead className="font-bold text-foreground">Start</TableHead>
                  <TableHead className="font-bold text-foreground">Slut</TableHead>
                  <TableHead className="text-right font-bold text-foreground">Timmar</TableHead>
                  <TableHead className="text-right font-bold text-foreground">Övertid</TableHead>
                  <TableHead className="font-bold text-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  // Group reports by date
                  const grouped = new Map<string, TimeReportRow[]>();
                  for (const r of reports) {
                    if (!grouped.has(r.report_date)) grouped.set(r.report_date, []);
                    grouped.get(r.report_date)!.push(r);
                  }

                  // Iterate all 7 days of the week (Mon→Sun) so empty days are visible
                  return weekDays.map(dayDate => {
                    const date = format(dayDate, 'yyyy-MM-dd');
                    const dateRows = grouped.get(date) || [];
                    const dateAnomalyCount = anomalyCountByDate.get(date) || 0;
                    const datePendingSuggestions = pendingSuggestionsByDate.get(date) || 0;
                    const dateTotalHours = dateRows.reduce((s, r) => s + r.hours_worked, 0);
                    const dateTravelHours = dateRows.filter(r => r.type === 'travel').reduce((s, r) => s + r.hours_worked, 0);
                    const hasOpenWork = dateRows.some(r => r.type === 'work' && !r.end_time);
                    const hasAnyReport = dateRows.length > 0;
                    const dayIsToday = isToday(dayDate);
                    const submissionDisplay = deriveSubmissionDisplay(
                      submissionByDate.get(date),
                      hasAnyReport,
                    );

                    return (
                      <React.Fragment key={date}>
                        {/* Date header row — clickable only if there's data */}
                        <TableRow
                          className={`border-t-4 border-t-primary/30 ${
                            hasAnyReport
                              ? 'bg-primary/30 hover:bg-primary/40 cursor-pointer'
                              : 'bg-primary/10'
                          } ${dayIsToday ? 'border-l-4 border-l-primary' : ''}`}
                          onClick={hasAnyReport ? () => setDailyOverviewDate(date) : undefined}
                        >
                          <TableCell colSpan={6}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-wrap">
                                <MapPin className={`h-4 w-4 ${hasAnyReport ? 'text-primary' : 'text-muted-foreground/40'}`} />
                                <span className={`font-semibold text-sm capitalize ${!hasAnyReport && 'text-muted-foreground'}`}>
                                  {format(dayDate, 'EEEE d MMMM', { locale: sv })}
                                </span>
                                {dayIsToday && (
                                  <Badge variant="default" className="text-[10px] bg-primary/15 text-primary border-0 hover:bg-primary/20">
                                    Idag
                                  </Badge>
                                )}
                                {hasAnyReport && (hasOpenWork ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] gap-1 border-primary/30 text-primary bg-primary/5"
                                  >
                                    <Activity className="h-2.5 w-2.5" />
                                    Pågående
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] gap-1 border-border text-muted-foreground"
                                  >
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                    Stängd
                                  </Badge>
                                ))}
                                {dateAnomalyCount > 0 && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setAnomalyDate(date); }}
                                    className="text-destructive/80 hover:text-destructive transition-colors"
                                    title={`${dateAnomalyCount} avvikelse${dateAnomalyCount !== 1 ? 'r' : ''}`}
                                  >
                                    <AlertTriangle className="h-4 w-4" />
                                  </button>
                                )}
                                {datePendingSuggestions > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] gap-1 border-destructive/40 text-destructive bg-destructive/5"
                                    title={`${datePendingSuggestions} korrigeringsförslag väntar`}
                                  >
                                    <Sparkles className="h-2.5 w-2.5" />
                                    {datePendingSuggestions} förslag
                                  </Badge>
                                )}
                                {(unlinkedAnomaliesByDate.get(date) || []).length > 0 && (
                                  <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                                    {(unlinkedAnomaliesByDate.get(date) || []).length} oklassad frånvaro
                                  </Badge>
                                )}
                              </div>
                              {hasAnyReport ? (
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="font-medium tabular-nums">{formatHoursMinutes(dateTotalHours)}</span>
                                  {dateTravelHours > 0 && (
                                    <span className="flex items-center gap-1 tabular-nums">
                                      <Car className="h-3 w-3" /> {formatHoursMinutes(dateTravelHours)}
                                    </span>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setMovementDate(date); }}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-border/60 hover:bg-accent hover:border-border transition-colors text-[10px]"
                                    title="Visa rörelse på karta"
                                  >
                                    <Route className="h-3 w-3" /> Rörelse
                                  </button>
                                  <Badge variant="outline" className="text-[10px] border-border/60">
                                    Dagöversikt →
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground/60 italic">
                                  Ingen rapport
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {/* Individual rows for that date */}
                        {dateRows.map(report => {
                          const reportAnomalies = report.type === 'work'
                            ? (anomaliesByReportId.get(report.id) || [])
                            : [];
                          return (
                            <React.Fragment key={report.id}>
                              <TableRow className={report.type === 'travel' ? 'bg-muted/30' : ''}>
                                <TableCell>
                                  <div className="truncate max-w-[180px] flex items-center gap-1">
                                    {report.type === 'travel' && <Car className="h-3.5 w-3.5 text-primary shrink-0" />}
                                    <span>
                                      {report.booking_client}
                                      {report.booking_number && (
                                        <span className="text-muted-foreground text-xs ml-1">
                                          #{report.booking_number}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="tabular-nums">{report.start_time ? report.start_time.slice(0, 5) : '-'}</TableCell>
                                <TableCell className="tabular-nums">{report.end_time ? report.end_time.slice(0, 5) : '-'}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatHoursMinutes(report.hours_worked)}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {report.type === 'travel'
                                    ? '-'
                                    : (report.overtime_hours || 0) > 0
                                      ? formatHoursMinutes(report.overtime_hours!)
                                      : '-'}
                                </TableCell>
                                <TableCell>
                                  {report.type === 'travel' ? (
                                    <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                                      Resa
                                    </Badge>
                                  ) : !report.end_time ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] gap-1 border-primary/30 text-primary bg-primary/5"
                                    >
                                      <Activity className="h-2.5 w-2.5" />
                                      Pågående
                                    </Badge>
                                  ) : report.approved ? (
                                    <Badge variant="default" className="text-[10px] bg-primary/15 text-primary border-0 hover:bg-primary/20">
                                      Godkänd
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] border-border/60">
                                      Väntande
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                              {reportAnomalies.length > 0 && (
                                <TableRow className="bg-muted/20">
                                  <TableCell colSpan={6} className="py-2">
                                    <div className="flex flex-wrap gap-1.5 pl-6">
                                      {reportAnomalies.map((a: any) => {
                                        const startTime = format(parseISO(a.started_at), 'HH:mm');
                                        const endTime = format(parseISO(a.ended_at), 'HH:mm');
                                        const dur = a.duration_minutes ?? 0;
                                        if (a.classification === 'break') {
                                          return (
                                            <Badge key={a.id} variant="outline" className="text-[10px] gap-1">
                                              <Coffee className="h-3 w-3" /> Rast {startTime}–{endTime} ({dur}m)
                                            </Badge>
                                          );
                                        }
                                        if (a.classification === 'work') {
                                          const hasPos = a.end_location_lat != null && a.end_location_lng != null;
                                          const mapsUrl = hasPos
                                            ? `https://www.google.com/maps?q=${a.end_location_lat},${a.end_location_lng}`
                                            : null;
                                          return (
                                            <Badge
                                              key={a.id}
                                              variant="outline"
                                              className={`text-[10px] gap-1 ${a.auto_classified ? 'border-primary/30 text-primary' : ''}`}
                                              title={a.work_description || ''}
                                            >
                                              <Briefcase className="h-3 w-3" />
                                              {a.auto_classified ? 'Efter arbetsplatsen' : 'Arbete'} {startTime}–{endTime} ({dur}m)
                                              {a.work_description && <span className="ml-1 text-muted-foreground truncate max-w-[140px]">"{a.work_description}"</span>}
                                              {mapsUrl && (
                                                <a
                                                  href={mapsUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="ml-1 text-primary hover:underline inline-flex items-center"
                                                  title="Visa position på karta"
                                                >
                                                  <Pin className="h-3 w-3" />
                                                </a>
                                              )}
                                            </Badge>
                                          );
                                        }
                                        return (
                                          <Badge key={a.id} variant="outline" className="text-[10px] gap-1 border-destructive/30 text-destructive">
                                            <HelpCircle className="h-3 w-3" /> Oklassad {startTime}–{endTime} ({dur}m)
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  });
                })()}
                <TableRow className="font-semibold bg-muted/50">
                  <TableCell colSpan={3}>TOTALT</TableCell>
                  <TableCell className="text-right">{formatHoursMinutes(totalHours)}</TableCell>
                  <TableCell className="text-right">
                    {totalOvertime > 0 ? formatHoursMinutes(totalOvertime) : '-'}
                  </TableCell>
                  <TableCell />
                </TableRow>
                {totalTravelHours > 0 && (
                  <TableRow className="text-xs text-muted-foreground">
                    <TableCell colSpan={3} className="italic">varav restid</TableCell>
                    <TableCell className="text-right italic">{formatHoursMinutes(totalTravelHours)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </PremiumCard>

      <WorkdayFlagsAdminSection
        staffId={staffId}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />

      <AnomalyDialog
        open={!!anomalyDate}
        onOpenChange={(open) => !open && setAnomalyDate(null)}
        date={anomalyDate}
        anomalies={dialogAnomalies}
        travelRoutes={dialogTravelRoutes}
      />

      <DailyOverviewDialog
        open={!!dailyOverviewDate}
        onOpenChange={(open) => !open && setDailyOverviewDate(null)}
        date={dailyOverviewDate}
        staffId={staffId}
        staffName={staffName}
        travelSegments={dailyOverviewTravel}
        workEntries={dailyOverviewWork}
      />

      <Dialog open={!!movementDate} onOpenChange={(open) => !open && setMovementDate(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Route className="h-5 w-5" />
              Rörelse {movementDate && format(parseISO(movementDate), 'EEEE d MMMM', { locale: sv })}
              <span className="text-sm font-normal text-muted-foreground ml-2">— {staffName}</span>
            </DialogTitle>
          </DialogHeader>
          {movementDate && (
            <StaffMovementMap staffId={staffId} date={movementDate} className="h-[500px]" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
