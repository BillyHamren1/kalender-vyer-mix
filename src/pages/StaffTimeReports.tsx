import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { Clock, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { StaffGanttView } from '@/components/staff/StaffGanttView';
import { StaffTimeReportDetail } from '@/components/staff/StaffTimeReportDetail';

import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { format } from 'date-fns';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';
import {
  buildStaffDayJournal,
  type RawTimeReport,
  type RawLocationEntry,
  type RawTravelLog,
  type RawWorkday,
} from '@/lib/staff/dayJournal';
import { calculateDayMetrics, type DayMetrics } from '@/lib/staff/dayMetrics';
import { buildCanonicalStaffDayModel, type CanonicalStaffDayModel } from '@/lib/staff/canonicalDayModel';
import { classifyLocationEntry } from '@/lib/staff/locationEntryClassification';
import {
  buildActualStaffDayModel,
  type ActualStaffDayModel,
} from '@/lib/staff/actualStaffDayModel';
import { buildPlaceVisits, buildDayTimeline, type KnownSite } from '@/lib/staff/pingPlaceSegments';
import type { Ping } from '@/lib/staff/movementDetection';
import { fetchStaffMembers } from '@/services/staffService';
import { deriveStaffEvents } from '@/lib/staffCalendar/deriveStaffEvents';

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
  /**
   * Single source of truth för dagsmetri. Workday = total. Activity/travel
   * = fördelning. payableMinutes = workday (aldrig workday + activity).
   * UI ska föredra detta över `total_hours` när det visar "Arbetsdag" /
   * "Total arbetstid".
   */
  metrics: DayMetrics;
  /** Canonical workday-based model (Lönegrundande/Fördelad/Ofördelad). */
  canonical: CanonicalStaffDayModel;
  /**
   * Faktisk-dag-modell: kronologisk händelsejournal + GPS-vistelser +
   * föreslagen rapport. Bygger på workday + time_reports + LTE + travel
   * PLUS staff_location_history + assistant_events + workday_flags.
   * Detta ska vara huvudvyn — inte rapporttabellen.
   */
  actualModel: ActualStaffDayModel;
  /**
   * True om GPS-historiken för denna staff/dag har trunkerats (träffat
   * hårt safety-tak). UI ska visa en varning så admin vet att timeline
   * är ofullständig och inte tolkar tystnaden som "signal tappad".
   */
  pingsTruncated: boolean;
  /** Senaste GPS-fetchfel för dagen (om något), så UI kan varna istället för att tolka tomheten som "inga händelser". */
  pingsFetchError: string | null;
  /**
   * Planeringsstatus för dagen — beräknas mot dagsbundna JOBB-assignments
   * (booking_staff_assignments)
   * unionat med faktisk aktivitet (workday/time_reports/LTE/travel/GPS).
   */
  planningStatus: PlanningStatus;
  /** Etiketter för planerade pass denna dag (för tooltip / sekundär rad). */
  plannedLabels: string[];
  /**
   * Debug-signaler som förklarar varför personen visas och varför
   * planningStatus blev satt. Speglar exakt de boolean-flaggorna som
   * UI:t exponerar i en expanderbar "Varför syns denna?"-sektion.
   */
  presence: PresenceDebug;
}

export interface PresenceDebug {
  plannedFromBookingStaffAssignments: boolean;
  plannedFromStaffAssignments: boolean;
  plannedFromLargeProjectStaff: boolean;
  hasWorkday: boolean;
  hasOpenWorkday: boolean;
  hasTimeReports: boolean;
  hasLocationTimeEntries: boolean;
  hasTravelLogs: boolean;
  hasGpsPings: boolean;
  hasAssistantEvents: boolean;
  hasWorkdayFlags: boolean;
  /** Mänskligt formulerade förklaringar (visningsorsak + statusorsak). */
  visibilityReason: string;
  statusReason: string;
}

export type PlanningStatus =
  | 'planned_not_started'   // Planerad, ingen faktisk aktivitet
  | 'missing_workday'        // Faktisk aktivitet finns men ingen workday
  | 'unplanned_activity'     // Aktivitet finns men ingen planering
  | 'workday_active'         // Pågående arbetsdag
  | 'planned'                // Planerad + workday/aktivitet (normalt fall)
  | 'completed';             // Workday avslutad

/**
 * Hämta hela dagens staff_location_history för EN staff via paginering.
 * Aldrig en global limit — den kapar dagar med många pings (8000+).
 * Säkerhetstak per staff (PER_STAFF_PING_CAP) hindrar runaway om DB
 * returnerar miljoner rader; sätter pingsTruncated i så fall.
 */
const PING_PAGE_SIZE = 1000;
const PER_STAFF_PING_CAP = 20_000;

async function fetchAllPingsForStaff(
  staffId: string,
  dayStartIso: string,
  nextDayIso: string,
): Promise<{ rows: any[]; truncated: boolean; error: string | null }> {
  const out: any[] = [];
  let from = 0;
  while (out.length < PER_STAFF_PING_CAP) {
    const to = from + PING_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('staff_location_history')
      .select('staff_id, lat, lng, accuracy, speed, recorded_at')
      .eq('staff_id', staffId)
      .gte('recorded_at', dayStartIso)
      .lt('recorded_at', nextDayIso)
      .order('recorded_at', { ascending: true })
      .range(from, to);
    if (error) {
      // Non-fatal: returnera det vi har men markera fel så UI kan visa
      // varning istället för att tolka tomheten som "inga händelser".
      return { rows: out, truncated: false, error: error.message || 'GPS-fetch misslyckades' };
    }
    const batch = data || [];
    out.push(...batch);
    if (batch.length < PING_PAGE_SIZE) {
      return { rows: out, truncated: false, error: null };
    }
    from += PING_PAGE_SIZE;
  }
  return { rows: out.slice(0, PER_STAFF_PING_CAP), truncated: true, error: null };
}

// Build a UTC ISO timestamp from a date (yyyy-MM-dd) and an HH:mm[:ss] time
// string. time_reports stores wall-clock as Europe/Stockholm — we MUST NOT
// reinterpret it through the browser's local timezone, otherwise the ISO
// instant becomes off by 1–2h and the GPS resolver mis-classifies the row
// as "Resa" even when it actually falls inside a real visit.
import { stockholmWallClockToIso } from '@/lib/staff/stockholmTime';
const composeLocalIso = (dateStr: string, timeStr: string): string =>
  stockholmWallClockToIso(dateStr, timeStr);

const StaffTimeReports: React.FC = () => {
  // Deep-link support: ?staff=<id>&date=YYYY-MM-DD öppnar direkt i detaljvyn.
  const initialParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const initialStaff = initialParams.get('staff');
  const initialDateParam = initialParams.get('date');
  const parsedInitialDate = initialDateParam && /^\d{4}-\d{2}-\d{2}$/.test(initialDateParam)
    ? new Date(`${initialDateParam}T12:00:00Z`)
    : new Date();

  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(initialStaff);
  const [selectedStaffName, setSelectedStaffName] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState(parsedInitialDate);

  // Hämta staff-namn när deep-link används utan att ha klickat i listan.
  useEffect(() => {
    if (!selectedStaffId || selectedStaffName) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('staff_members')
        .select('name')
        .eq('id', selectedStaffId)
        .maybeSingle();
      if (!cancelled && data?.name) setSelectedStaffName(data.name);
    })();
    return () => { cancelled = true; };
  }, [selectedStaffId, selectedStaffName]);


  // Tolka selectedDate som Europe/Stockholm-dag oavsett webbläsarens TZ.
  // Vi formaterar YYYY-MM-DD i Stockholm-zonen och bygger UTC-instans-gränser
  // för 00:00 lokal → nästa dag 00:00 lokal. På så sätt slipper en admin på
  // resa (eller en testmiljö i UTC) få "natt-pings" från fel kalenderdygn.
  const dateStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(selectedDate); // sv-SE → "YYYY-MM-DD"
  const dayStartIso = stockholmWallClockToIso(dateStr, '00:00:00');
  // Nästa lokala dygn — beräknas via Stockholm-formaterad nästa-dag-sträng
  // (inte +24h) för att vara DST-säker.
  const nextDayDate = new Date(`${dateStr}T12:00:00Z`);
  nextDayDate.setUTCDate(nextDayDate.getUTCDate() + 1);
  const nextDateStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(nextDayDate);
  const nextDayIso = stockholmWallClockToIso(nextDateStr, '00:00:00');

  // Realtime: refresh the day view when any of the source tables change for today.
  useRealtimeInvalidation({
    channelName: `staff-time-reports-day-${dateStr}`,
    tables: [
      { table: 'time_reports', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'travel_time_logs', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'location_time_entries', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'workdays', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'staff_locations', events: ['INSERT', 'UPDATE'] },
      { table: 'assistant_events', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'workday_flags', events: ['INSERT', 'UPDATE', 'DELETE'] },
      // Authoritativ källa för "aktiv timer" — Time Engine.
      { table: 'active_time_registrations', events: ['INSERT', 'UPDATE', 'DELETE'] },
    ],
    queryKeys: [['staff-time-reports-day', dateStr]],
    debounceMs: 400,
  });

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff-time-reports-day', dateStr],
    refetchInterval: 60_000,
    queryFn: async (): Promise<StaffWithDayReport[]> => {
      // Fetch reports + travel + location-based time (e.g. Lager) in parallel
      const [reportsRes, travelRes, locationRes, workdaysRes, pingsRes, assistantRes, flagsRes, bsaRes, saRes, lpsRes, activeRegRes] = await Promise.all([
        supabase
          .from('time_reports')
          .select('id, staff_id, booking_id, large_project_id, location_id, hours_worked, start_time, end_time, source, source_entry_id, approved, break_time, description, report_date')
          .eq('report_date', dateStr)
          .eq('is_subdivision', false)
          .or('source.is.null,source.neq.location_auto'),
        supabase
          .from('travel_time_logs')
          .select('id, staff_id, hours_worked, start_time, end_time, to_address, from_address, from_latitude, from_longitude, to_latitude, to_longitude, destination_booking_id, auto_detected, source, approved')
          .eq('report_date', dateStr),
        supabase
          .from('location_time_entries')
          .select('id, staff_id, location_id, booking_id, large_project_id, entered_at, exited_at, total_minutes, source, entry_date, metadata, stop_source, stop_reason, stopped_by, stop_metadata')
          .eq('entry_date', dateStr),
        supabase
          .from('workdays')
          .select('id, staff_id, started_at, ended_at, review_status, review_reasons, notes, admin_note, started_by, metadata')
          .gte('started_at', dayStartIso)
          .lt('started_at', nextDayIso),
        supabase
          .from('staff_locations')
          .select('staff_id, latitude, longitude, updated_at, last_address, app_version, app_build, app_platform'),
        supabase
          .from('assistant_events')
          .select('id, staff_id, event_type, target_type, target_id, target_label, suggested_action, happened_at, detected_at, resolved_at, resolution_status, metadata')
          .gte('happened_at', dayStartIso)
          .lt('happened_at', nextDayIso),
        supabase
          .from('workday_flags')
          .select('id, staff_id, flag_type, severity, title, description, created_at, resolved')
          .eq('flag_date', dateStr),
        // ── Planerad personal (samma källor som personalkalendern använder) ──
        supabase
          .from('booking_staff_assignments')
          .select('staff_id, booking_id, team_id, assignment_date')
          .eq('assignment_date', dateStr),
        supabase
          .from('staff_assignments')
          .select('staff_id, team_id, assignment_date')
          .eq('assignment_date', dateStr),
        supabase
          .from('large_project_staff')
          .select('staff_id, large_project_id'),
        // ── Authoritativ källa för "aktiv timer": active_time_registrations.
        // Tar alla som är status='active' och har startat senast dagSlut.
        // RLS isolerar org. stopped_at är NULL för alla active-rader. ──
        supabase
          .from('active_time_registrations')
          .select('id, staff_id, status, started_at, stopped_at, start_source, start_target_label, current_label, current_kind, current_target_type, current_target_id, auto_started')
          .eq('status', 'active')
          .lte('started_at', nextDayIso)
          .is('stopped_at', null),
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
      // ── Authoritativ aktiv-timer-källa (Time Engine) ───────────────
      const activeRegRows = ((activeRegRes as any).error ? [] : (activeRegRes as any).data || []) as any[];
      const activeRegByStaff = new Map<string, any>();
      for (const r of activeRegRows) {
        if (!activeRegByStaff.has(r.staff_id)) activeRegByStaff.set(r.staff_id, r);
      }
      // historyPings hämtas per-staff längre ned (efter att staffIds är kända)
      // för att kunna paginera komplett utan global limit.
      let historyPings: any[] = [];
      const pingsTruncatedByStaff = new Map<string, boolean>();
      const pingsErrorByStaff = new Map<string, string>();
      const assistantEvents = (assistantRes as any).error ? [] : ((assistantRes as any).data || []);
      const workdayFlags = (flagsRes as any).error ? [] : ((flagsRes as any).data || []);

      // ── Planerad personal: använd EXAKT samma kalenderderivering som
      // personalkalendern, så tidrapportsidan aldrig visar andra namn än
      // kalendern för vald dag.
      const bsaRowsRaw = ((bsaRes as any).error ? [] : (bsaRes as any).data || []) as any[];
      // Per [Mobile Calendar Authority v1]: team_id='project' = projektmedlemskap,
      // INTE dagsplanering. Får aldrig generera "planerad denna dag".
      const bsaRows = bsaRowsRaw.filter(r => r && r.team_id && r.team_id !== 'project');
      const saRows = ((saRes as any).error ? [] : (saRes as any).data || []) as any[];
      // large_project_staff är projektmedlemskap över hela projektets livstid —
      // det säger ingenting om vilken dag personen är planerad. Skickas
      // medvetet inte vidare till deriveStaffEvents (annars markeras alla
      // projektets medlemmar som "planerade" varje rig/rigDown-datum).
      const lpsRows = ((lpsRes as any).error ? [] : (lpsRes as any).data || []) as any[];
      const plannedStaffIds = new Set<string>();
      const plannedLabelsByStaff = new Map<string, Set<string>>();
      const plannedFromBSA = new Set<string>();
      const plannedFromSA = new Set<string>();
      const plannedFromLPS = new Set<string>();
      const addPlanned = (sid: string, label: string) => {
        if (!sid) return;
        plannedStaffIds.add(sid);
        const set = plannedLabelsByStaff.get(sid) ?? new Set<string>();
        if (label) set.add(label);
        plannedLabelsByStaff.set(sid, set);
      };
      const allStaff = await fetchStaffMembers();
      const staffNames = new Map(allStaff.map(s => [s.id, s.name]));

      const bookingIdsFromAssignments = Array.from(new Set(bsaRows.map(r => r.booking_id).filter(Boolean)));
      const bookingsById = new Map<string, any>();
      if (bookingIdsFromAssignments.length > 0) {
        const { data: bookingRows } = await supabase
          .from('bookings')
          .select('id, client, booking_number, large_project_id, rigdaydate, eventdate, rigdowndate, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time, deliveryaddress')
          .in('id', bookingIdsFromAssignments);
        (bookingRows || []).forEach((b: any) => bookingsById.set(b.id, b));
      }

      const lpIds = Array.from(new Set([
        ...[...bookingsById.values()].map((b: any) => b.large_project_id).filter(Boolean),
        ...lpsRows.map((r: any) => r.large_project_id).filter(Boolean),
      ]));
      const largeProjectsById = new Map<string, any>();
      let largeProjectBookings: Array<{ large_project_id: string; booking_id: string }> = [];
      if (lpIds.length > 0) {
        const [{ data: lpRows }, { data: lpbRows }] = await Promise.all([
          supabase
            .from('large_projects')
            .select('id, name, address, start_date, event_date, end_date, deleted_at')
            .in('id', lpIds)
            .is('deleted_at', null),
          supabase
            .from('large_project_bookings')
            .select('large_project_id, booking_id')
            .in('large_project_id', lpIds),
        ]);
        (lpRows || []).forEach((p: any) => largeProjectsById.set(p.id, p));
        largeProjectBookings = (lpbRows || []) as any[];
      }

      const calendarEventsByBookingIds = Array.from(new Set([
        ...bookingIdsFromAssignments,
        ...largeProjectBookings.map(row => row.booking_id),
      ]));
      let planningCalendarEvents: any[] = [];
      if (calendarEventsByBookingIds.length > 0) {
        const { data: ceRows } = await supabase
          .from('calendar_events')
          .select('id, booking_id, start_time, end_time, event_type, resource_id, booking_number, delivery_address, source_date')
          .in('booking_id', calendarEventsByBookingIds)
          .gte('start_time', `${dateStr}T00:00:00`)
          .lt('start_time', `${nextDateStr}T00:00:00`);
        planningCalendarEvents = ceRows || [];
      }

      const derivedPlannedEvents = deriveStaffEvents({
        staffIds: allStaff.map(s => s.id),
        startDate: dateStr,
        endDate: dateStr,
        staffNames,
        bookingAssignments: bsaRows,
        largeProjectStaff: [],
        bookings: bookingsById,
        largeProjects: largeProjectsById,
        largeProjectBookings,
        calendarEvents: planningCalendarEvents,
      });

      for (const event of derivedPlannedEvents) {
        if (event.largeProjectId) {
          plannedFromLPS.add(event.staffId);
        } else {
          plannedFromBSA.add(event.staffId);
        }
        plannedStaffIds.add(event.staffId);
        const label = event.largeProjectName || event.client || 'Bokning';
        addPlanned(event.staffId, label);
      }
      // staff_assignments = personalkalenderns team-tilldelning för dagen.
      // Personer i ett team SKA visas som planerade på tidrapportsidan
      // även om teamet inte har någon bokning den dagen — annars matchar
      // listan inte det adminen ser i personalkalendern.
      for (const r of saRows) {
        if (!r.staff_id) continue;
        plannedFromSA.add(r.staff_id);
        const teamLabel = r.team_id ? `Team ${String(r.team_id).replace(/^team-/, '')}` : 'Planerad';
        addPlanned(r.staff_id, teamLabel);
      }
      // OBS: large_project_staff är projektmedlemskap, inte dagsassignering.
      // Det får därför INTE användas för att visa någon som "planerad" på
      // denna sida, annars syns personen på alla projektets dagar.

      // Resolve location -> internal booking (e.g. Lager) for project label.
      // Include location_id from BOTH location_time_entries AND time_reports so
      // a manually-created Lager-tidrapport (without LTE) still resolves to the
      // location's name (e.g. "FA Warehouse") instead of falling back to "Lager".
      const locationIds = [...new Set([
        ...locationEntries.map(e => e.location_id).filter(Boolean),
        ...reports.map(r => (r as any).location_id).filter(Boolean),
      ])] as string[];
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
      const bookingMap = new Map<string, { label: string; is_internal: boolean; location_id: string | null }>();
      const warehouseBookingLocationIds: string[] = [];
      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, client, booking_number, is_internal, internal_type')
          .in('id', bookingIds);
        // Look up the location for any internal warehouse booking via projects.
        const warehouseBookingIds = (bookings || [])
          .filter(b => b.is_internal && b.internal_type === 'warehouse')
          .map(b => b.id);
        const bookingLocationMap = new Map<string, string>();
        if (warehouseBookingIds.length > 0) {
          const { data: warehouseProjects } = await supabase
            .from('projects')
            .select('booking_id, location_id')
            .in('booking_id', warehouseBookingIds)
            .eq('is_internal', true);
          (warehouseProjects || []).forEach(p => {
            if (p.booking_id && p.location_id) {
              bookingLocationMap.set(p.booking_id, p.location_id);
              warehouseBookingLocationIds.push(p.location_id);
            }
          });
        }
        (bookings || []).forEach(b => {
          let label: string;
          if (b.is_internal) {
            label = b.client || 'Internt';
          } else if (b.booking_number) {
            label = `${b.booking_number} · ${b.client}`;
          } else {
            label = b.client;
          }
          bookingMap.set(b.id, {
            label,
            is_internal: !!b.is_internal,
            location_id: bookingLocationMap.get(b.id) || null,
          });
        });
      }

      // Fetch large project labels — include BOTH location_time_entries AND
      // time_reports so a manually-created project tidrapport (e.g. Tiomila 2026)
      // resolves to the project name instead of falling back to "Projekt".
      const largeProjectIds = [...new Set([
        ...locationEntries.map(e => (e as any).large_project_id).filter(Boolean),
        ...reports.map(r => (r as any).large_project_id).filter(Boolean),
      ])] as string[];
      const largeProjectMap = new Map<string, string>();
      if (largeProjectIds.length > 0) {
        const { data: lps } = await supabase
          .from('large_projects')
          .select('id, name')
          .in('id', largeProjectIds);
        (lps || []).forEach(p => largeProjectMap.set(p.id, p.name || 'Stort projekt'));
      }

      // Fetch coordinates for KnownSites used by buildPlaceVisits.
      // KnownSites måste täcka ALLA platser som dagen kan röra — inte
      // bara rapporterade. Annars matchas GPS vid Lager/dagens projekt
      // mot "okänd plats" när time_report saknas.
      //   1. organization_locations (Lager, FA Warehouse, kontor osv.)
      //   2. dagens bokningar (rigday/event/rigdown == dateStr) — även
      //      utan time_report/LTE
      //   3. dagens stora projekt (start_date <= dateStr <= end_date)
      //   4. ID:n som RAPPORTER/LTE pekar på (säkerhet om datumkolumner
      //      inte är satta på bokningen)
      const knownSites: KnownSite[] = [];
      // ±21-dagars fönster runt visit-datum så att projekt vars rig/event/rigdown
      // ligger en/två veckor bort fortfarande finns i poolen för "närmsta projekt"-
      // förslag. Utan detta blir det enda projekt som råkar matcha exakt dagens
      // datum "närmast" — fast det kan ligga 7 km bort.
      const windowDays = 21;
      const dateMs = new Date(`${dateStr}T00:00:00Z`).getTime();
      const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      const windowStart = fmtDate(dateMs - windowDays * 86_400_000);
      const windowEnd = fmtDate(dateMs + windowDays * 86_400_000);

      // Autologin-fönster: rig-2d ≤ visit ≤ rigdown+2d
      const autoWindowDays = 2;
      const computeAutoWindow = (rigStart: string | null, rigEnd: string | null): {
        eligible: boolean;
        daysOutside: number;
        label: string | null;
      } => {
        if (!rigStart && !rigEnd) return { eligible: false, daysOutside: Infinity, label: null };
        const startMs = rigStart ? new Date(`${rigStart}T00:00:00Z`).getTime() : null;
        const endMs = rigEnd ? new Date(`${rigEnd}T00:00:00Z`).getTime() : startMs;
        const lo = (startMs ?? endMs!) - autoWindowDays * 86_400_000;
        const hi = (endMs ?? startMs!) + autoWindowDays * 86_400_000;
        const eligible = dateMs >= lo && dateMs <= hi;
        const daysOutside = eligible
          ? 0
          : Math.ceil(Math.min(Math.abs(dateMs - lo), Math.abs(dateMs - hi)) / 86_400_000);
        const fmtSv = (s: string) => {
          const [, m, d] = s.split('-');
          return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
        };
        const parts: string[] = [];
        if (rigStart) parts.push(`Rig ${fmtSv(rigStart)}`);
        if (rigEnd && rigEnd !== rigStart) parts.push(`Rigdown ${fmtSv(rigEnd)}`);
        return { eligible, daysOutside, label: parts.length ? parts.join(' – ') : null };
      };

      const [orgLocsRes, bookingsWindowRes, lpsWindowRes, bookingCoordsRes, lpCoordsRes] = await Promise.all([
        supabase
          .from('organization_locations')
          .select('id, name, latitude, longitude, radius_meters, is_active')
          .eq('is_active', true),
        supabase
          .from('bookings')
          .select('id, client, booking_number, large_project_id, deliveryaddress, delivery_latitude, delivery_longitude, eventdate, rigdaydate, rigdowndate, status')
          .not('delivery_latitude', 'is', null)
          .lte('rigdaydate', windowEnd)
          .gte('rigdowndate', windowStart)
          .neq('status', 'CANCELLED'),
        // large_projects: start_date/end_date är date[]. Hämta brett och filtrera i JS.
        supabase
          .from('large_projects')
          .select('id, name, address_latitude, address_longitude, address_radius_meters, start_date, end_date, event_date')
          .not('address_latitude', 'is', null),
        bookingIds.length
          ? supabase
              .from('bookings')
              .select('id, client, booking_number, large_project_id, deliveryaddress, delivery_latitude, delivery_longitude, eventdate, rigdaydate, rigdowndate, status')
              .in('id', bookingIds)
          : Promise.resolve({ data: [] as any[] } as any),
        largeProjectIds.length
          ? supabase
              .from('large_projects')
              .select('id, name, address_latitude, address_longitude, address_radius_meters, start_date, end_date, event_date')
              .in('id', largeProjectIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);

      const seenSiteIds = new Set<string>();
      const pushSite = (s: KnownSite) => {
        if (seenSiteIds.has(s.id)) return;
        seenSiteIds.add(s.id);
        knownSites.push(s);
      };

      for (const l of ((orgLocsRes as any).data || [])) {
        if (l.latitude == null || l.longitude == null) continue;
        pushSite({
          id: `loc:${l.id}`,
          name: l.name,
          lat: Number(l.latitude),
          lng: Number(l.longitude),
          radiusMeters: Number(l.radius_meters ?? 200) || 200,
          autoLoginEligible: true, // fixed locations är alltid aktiva
          daysFromActiveWindow: 0,
          activeWindowLabel: null,
        });
      }
      const allBookingRows = [
        ...((bookingsWindowRes as any).data || []),
        ...((bookingCoordsRes as any).data || []),
      ];

      // Sub-bookings i ett stort projekt får INTE bli självständiga
      // "närmsta projekt"-kandidater — det stora projektet är
      // planeringsenheten (se memory: large-project-team-source-of-truth-v1).
      // Undantag: om en time_report/LTE faktiskt pekar på sub-bookingen
      // (id finns i bookingIds) får den vara kvar som källa.
      const reportedBookingIds = new Set<string>(bookingIds);

      // Bygg fallback-koordinater per stort projekt från första
      // tillgängliga sub-booking — så att vi kan visa "närmsta:
      // <stora projektets namn>" även när large_projects.address_*
      // saknas.
      const lpFallbackCoords = new Map<string, { lat: number; lng: number }>();
      for (const b of allBookingRows) {
        if (!b.large_project_id) continue;
        if (b.delivery_latitude == null || b.delivery_longitude == null) continue;
        if (!lpFallbackCoords.has(b.large_project_id)) {
          lpFallbackCoords.set(b.large_project_id, {
            lat: Number(b.delivery_latitude),
            lng: Number(b.delivery_longitude),
          });
        }
      }

      for (const b of allBookingRows) {
        if (b.delivery_latitude == null || b.delivery_longitude == null) continue;
        // Hoppa över sub-bookings vars stora projekt äger planeringen,
        // om de inte också är en bekräftad rapportkälla.
        if (b.large_project_id && !reportedBookingIds.has(b.id)) continue;
        const win = computeAutoWindow(b.rigdaydate ?? b.eventdate ?? null, b.rigdowndate ?? b.eventdate ?? null);
        pushSite({
          id: `booking:${b.id}`,
          name: b.booking_number ? `${b.booking_number} · ${b.client ?? 'Bokning'}` : (b.client ?? b.deliveryaddress ?? 'Bokning'),
          lat: Number(b.delivery_latitude),
          lng: Number(b.delivery_longitude),
          radiusMeters: 200,
          autoLoginEligible: win.eligible,
          daysFromActiveWindow: win.daysOutside,
          activeWindowLabel: win.label,
        });
      }
      const allLpRows = [
        ...((lpsWindowRes as any).data || []),
        ...((lpCoordsRes as any).data || []),
      ];
      const seenLpIds = new Set<string>();
      for (const lp of allLpRows) {
        seenLpIds.add(lp.id);
        // Overlap-check för date[]-kolumner i JS.
        const startDates: string[] = Array.isArray(lp.start_date) ? lp.start_date : (lp.start_date ? [lp.start_date] : []);
        const endDates: string[] = Array.isArray(lp.end_date) ? lp.end_date : (lp.end_date ? [lp.end_date] : []);
        const minStart = startDates.sort()[0] ?? null;
        const maxEnd = endDates.sort().slice(-1)[0] ?? minStart;
        // Filter: behåll bara projekt vars [minStart, maxEnd] överlappar [windowStart, windowEnd].
        if (minStart && maxEnd && (maxEnd < windowStart || minStart > windowEnd)) continue;
        const win = computeAutoWindow(minStart, maxEnd);
        // Fallback till sub-booking-koordinater om stora projektets adress saknas.
        const lat = lp.address_latitude ?? lpFallbackCoords.get(lp.id)?.lat ?? null;
        const lng = lp.address_longitude ?? lpFallbackCoords.get(lp.id)?.lng ?? null;
        if (lat == null || lng == null) continue;
        pushSite({
          id: `large:${lp.id}`,
          name: lp.name || 'Stort projekt',
          lat: Number(lat),
          lng: Number(lng),
          radiusMeters: Number(lp.address_radius_meters ?? 200) || 200,
          autoLoginEligible: win.eligible,
          daysFromActiveWindow: win.daysOutside,
          activeWindowLabel: win.label,
        });
      }

      // Säkerställ att stora projekt som har sub-bookings i fönstret
      // men som vi inte hämtade i lpsWindowRes/lpCoordsRes ändå
      // representeras i poolen (annars filtreras de bort och
      // sub-bookingen försvinner — vi vill att GPS-träffen pekar på
      // projektet med dess riktiga namn).
      const missingLpIds = [...lpFallbackCoords.keys()].filter(id => !seenLpIds.has(id));
      if (missingLpIds.length > 0) {
        const { data: extraLps } = await supabase
          .from('large_projects')
          .select('id, name, address_radius_meters, start_date, end_date')
          .in('id', missingLpIds);
        for (const lp of (extraLps || [])) {
          const coord = lpFallbackCoords.get(lp.id);
          if (!coord) continue;
          const startDates: string[] = Array.isArray(lp.start_date) ? lp.start_date : (lp.start_date ? [lp.start_date] : []);
          const endDates: string[] = Array.isArray(lp.end_date) ? lp.end_date : (lp.end_date ? [lp.end_date] : []);
          const minStart = startDates.sort()[0] ?? null;
          const maxEnd = endDates.sort().slice(-1)[0] ?? minStart;
          const win = computeAutoWindow(minStart, maxEnd);
          pushSite({
            id: `large:${lp.id}`,
            name: lp.name || 'Stort projekt',
            lat: coord.lat,
            lng: coord.lng,
            radiusMeters: Number(lp.address_radius_meters ?? 200) || 200,
            autoLoginEligible: win.eligible,
            daysFromActiveWindow: win.daysOutside,
            activeWindowLabel: win.label,
          });
        }
      }

      // If the warehouse-booking lookup found new location IDs that weren't in
      // the initial locationIds set, fetch their names too.
      const missingLocationIds = warehouseBookingLocationIds.filter(id => !locNameMap.has(id));
      if (missingLocationIds.length > 0) {
        const { data: extraLocations } = await supabase
          .from('organization_locations')
          .select('id, name')
          .in('id', missingLocationIds);
        (extraLocations || []).forEach(l => locNameMap.set(l.id, l.name));
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

      // Centralized label resolver — same priority used by both the segment
      // loop AND the journal mapping. Priority:
      //   1. large_project_id  → large_projects.name
      //   2. booking + warehouse-internal → location name (e.g. "FA Warehouse")
      //   3. booking_id → bookingMap.label
      //   4. location_id → location name
      //   5. fallback "—" (NEVER "Projekt"/"Tidrapport" — silently masks bugs)
      const resolveTimeReportLabel = (r: {
        booking_id: string | null;
        large_project_id: string | null;
        location_id: string | null;
      }): { key: string; label: string } => {
        if (r.large_project_id) {
          return {
            key: `lp:${r.large_project_id}`,
            label: largeProjectMap.get(r.large_project_id) || 'Stort projekt',
          };
        }
        if (r.booking_id) {
          const info = bookingMap.get(r.booking_id);
          if (info?.is_internal && info.location_id) {
            const locName = locNameMap.get(info.location_id);
            if (locName) return { key: `booking:${r.booking_id}`, label: locName };
          }
          return {
            key: `booking:${r.booking_id}`,
            label: info?.label || 'Okänt projekt',
          };
        }
        if (r.location_id) {
          return {
            key: `loc:${r.location_id}`,
            label: locNameMap.get(r.location_id) || 'Plats',
          };
        }
        return { key: 'unknown', label: '—' };
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
        const resolved = resolveTimeReportLabel(r as any);
        const label = resolved.label;
        const projectKey = resolved.key;
        if (!shadowed && projectKey !== 'unknown') {
          const existing = a.projects.get(projectKey);
          a.projects.set(projectKey, {
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

        // Klassificera LTE: ren passiv närvaro (gps/geofence utan
        // booking/lp) ska INTE bidra till total_hours. Men en LTE med
        // location_id som startats explicit (manual/timer/mobile/
        // location_timer/auto_assigned) är en RIKTIG location work timer
        // (t.ex. Lager / FA Warehouse) och måste räknas. Tidigare regel
        // `!booking_id && !large_project_id` slog ihop båda fallen och
        // gjorde Lager-pass osynliga som "Fördelad 0h".
        const { isPresenceOnly, isLocationWorkTimer } = classifyLocationEntry({
          source: e.source,
          booking_id: e.booking_id,
          large_project_id: e.large_project_id,
          location_id: e.location_id,
        });

        if (!isPresenceOnly) {
          a.total_hours += hours;
          a.reports_count += 1;
          if (isOpen) a.has_open_report = true;
        }
        const startHHMM = formatStockholmHms(e.entered_at);
        if (!a.earliest_start || startHHMM < a.earliest_start) a.earliest_start = startHHMM;
        if (!isOpen && e.exited_at) {
          const endHHMM = formatStockholmHms(e.exited_at);
          if (!a.latest_end || endHHMM > a.latest_end) a.latest_end = endHHMM;
        }

        // Resolve label + key + segment kind by precedence.
        let projectKey: string;
        let projectLabel: string;
        let segmentKind: SegmentKind = 'location';
        if (e.booking_id) {
          const info = bookingMap.get(e.booking_id);
          projectKey = e.booking_id;
          // Internal warehouse booking → prefer location name (e.g. "FA Warehouse")
          // so all rows for that location share the same label.
          if (info?.is_internal && info.location_id) {
            projectLabel = locNameMap.get(info.location_id) || info.label || 'Okänt projekt';
          } else {
            projectLabel = info?.label || 'Okänt projekt';
          }
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
        const startHHMM = formatStockholmHms(wd.started_at);

        if (!a.earliest_start || startHHMM < a.earliest_start) {
          a.earliest_start = startHHMM;
        }

        if (isOpen) {
          a.has_open_report = true;
        } else if (wd.ended_at) {
          const endHHMM = formatStockholmHms(wd.ended_at);
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

      // Listan = planerad personal för dagen + personer med FAKTISK arbets-
      // aktivitet (time_reports/workdays/LTE/travel — redan i byStaff).
      // Vi tar INTE in folk bara för att de har GPS-pings, assistant_events
      // eller workday_flags — det skulle visa "alla med telefon på" oavsett
      // om de jobbar idag eller inte.
      for (const id of plannedStaffIds) {
        if (!byStaff.has(id)) byStaff.set(id, newAgg());
      }

      const staffIds = [...byStaff.keys()];
      if (staffIds.length === 0) return [];

      // ── Per-staff ping-fetch (paginerad). Ingen global limit — den
      // kapade dagar med 8000+ pings (Billy/Kevin/Matīss). Per-staff
      // safety cap = PER_STAFF_PING_CAP; sätter pingsTruncatedByStaff
      // om vi når taket så UI kan visa en varning.
      const perStaffPings = await Promise.all(
        staffIds.map(async (id) => {
          const { rows, truncated, error } = await fetchAllPingsForStaff(id, dayStartIso, nextDayIso);
          if (truncated) pingsTruncatedByStaff.set(id, true);
          if (error) pingsErrorByStaff.set(id, error);
          return rows;
        }),
      );
      historyPings = perStaffPings.flat();

      // Privata/exkluderade GPS-zoner per staff (hem, manuellt ignorerade,
      // återkommande natt). RLS säkerställer org-isolation.
      const privateZonesByStaff = new Map<string, Array<{
        id: string; lat: number; lng: number; radiusMeters: number;
        kind: 'home' | 'manual_ignore' | 'recurring_night'; label: string | null;
      }>>();
      {
        const { data: pzRows } = await supabase
          .from('staff_private_zones')
          .select('id, staff_id, lat, lng, radius_m, kind, label')
          .in('staff_id', staffIds)
          .eq('active', true);
        for (const z of (pzRows ?? []) as any[]) {
          const arr = privateZonesByStaff.get(z.staff_id) ?? [];
          arr.push({
            id: z.id,
            lat: Number(z.lat),
            lng: Number(z.lng),
            radiusMeters: Number(z.radius_m) || 150,
            kind: z.kind,
            label: z.label ?? null,
          });
          privateZonesByStaff.set(z.staff_id, arr);
        }
      }

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
              large_project_id: r.large_project_id ?? null,
              location_id: r.location_id ?? null,
              start_iso: composeLocalIso(dateStr, r.start_time),
              end_iso: r.end_time ? composeLocalIso(dateStr, r.end_time) : null,
              hours: r.hours_worked || 0,
              label: resolveTimeReportLabel(r as any).label,
              approved: !!r.approved,
              break_hours: Number(r.break_time || 0),
              description: r.description ?? null,
              report_date: r.report_date ?? dateStr,
              start_time_hhmm: r.start_time ? String(r.start_time).slice(0, 5) : null,
              end_time_hhmm: r.end_time ? String(r.end_time).slice(0, 5) : null,
            }));

          const staffLTEs: RawLocationEntry[] = (locationEntries as any[])
            .filter(e => e.staff_id === s.id)
            .map(e => {
              const { isPresenceOnly } = classifyLocationEntry({
                source: e.source,
                booking_id: e.booking_id,
                large_project_id: e.large_project_id,
                location_id: e.location_id,
              });
              const isOpen = !e.exited_at;
              const hours = e.total_minutes
                ? e.total_minutes / 60
                : isOpen
                  ? Math.max(0, (nowMs - new Date(e.entered_at).getTime()) / 3_600_000)
                  : 0;
              // Use the same centralized resolver as time_reports so an LTE
              // on an internal warehouse booking shows "FA Warehouse" too.
              const resolved = resolveTimeReportLabel({
                booking_id: e.booking_id,
                large_project_id: e.large_project_id,
                location_id: e.location_id,
              });
              const label = resolved.label === '—' ? 'Plats' : resolved.label;
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
                source: e.source ?? null,
                entry_date: e.entry_date ?? null,
                metadata: {
                  ...(e.metadata && typeof e.metadata === 'object' ? e.metadata : {}),
                  // Lyft de nya stop-kolumnerna in i metadata så
                  // actualStaffDayModel + classifyStopSource hittar dem.
                  stop_source: (e as any).stop_source ?? null,
                  stop_reason: (e as any).stop_reason ?? null,
                  stopped_by: (e as any).stopped_by ?? null,
                  stop_metadata: (e as any).stop_metadata ?? null,
                },
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
              from_address: t.from_address ?? null,
              from_latitude: t.from_latitude ?? null,
              from_longitude: t.from_longitude ?? null,
              to_latitude: t.to_latitude ?? null,
              to_longitude: t.to_longitude ?? null,
              destination_booking_id: t.destination_booking_id ?? null,
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

          const metrics = calculateDayMetrics({
            workday: staffWorkdays.length > 0
              ? {
                  started_at: staffWorkdays[0].started_at,
                  ended_at: staffWorkdays.find(w => !w.ended_at)
                    ? null
                    : staffWorkdays.map(w => w.ended_at).filter(Boolean).sort().reverse()[0] ?? null,
                }
              : null,
            activitySegments: [
              ...staffReports.map(r => ({
                start: r.start_iso,
                end: r.end_iso,
                hours: r.hours,
              })),
              ...staffLTEs
                .filter(e => !e.isPresenceOnly)
                .map(e => ({
                  start: e.entered_at,
                  end: e.exited_at,
                  hours: e.hours,
                })),
            ],
            travelSegments: staffTravel.map(t => ({
              start: t.start_iso,
              end: t.end_iso,
              hours: t.hours,
            })),
          });

          // Active timer authority = active_time_registrations (Time Engine).
          // Öppna time_reports/LTE/travel-rader är legacy-historik och får
          // INTE driva "Pågående aktivitet"-statusen — de visas fortfarande
          // som rader i sina egna sektioner, men authority är denna enda rad.
          const activeReg = activeRegByStaff.get(s.id) || null;
          const activeTimerInputs = activeReg
            ? [{
                id: `atr:${activeReg.id}`,
                startedAt: activeReg.started_at,
                label: activeReg.current_label
                  ?? activeReg.start_target_label
                  ?? activeReg.current_kind
                  ?? 'Pågående',
                source: 'active_registration' as const,
                reportedAsDistribution: false,
                startSource: activeReg.start_source ?? null,
                autoStarted: !!activeReg.auto_started,
                currentKind: activeReg.current_kind ?? null,
                currentTargetType: activeReg.current_target_type ?? null,
                currentTargetId: activeReg.current_target_id ?? null,
                startTargetLabel: activeReg.start_target_label ?? null,
              }]
            : [];

          const ping = pingMap.get(s.id) || null;

          // Travel suggestions are "föreslagen" until approved. Flag
          // auto_detected + source='gap_derived' so UI separates them.
          const rawTravel = (travel as any[]).filter(t => t.staff_id === s.id);
          const canonical = buildCanonicalStaffDayModel({
            workdays: staffWorkdays.map(w => ({ started_at: w.started_at, ended_at: w.ended_at })),
            distributionRows: [
              ...staffReports.map(r => ({
                id: r.id,
                start: r.start_iso,
                end: r.end_iso,
                hours: r.hours,
                breakHours: r.break_hours ?? 0,
                label: r.label ?? '—',
                category: (r.location_id ? 'location' : r.large_project_id || r.booking_id ? 'project' : 'other') as 'location' | 'project' | 'other',
                approved: r.approved,
              })),
              // Location-LTE som är riktiga work timers (Lager etc) räknas
              // också som fördelning. Stängda → confirmed_distribution,
              // öppna → active_distribution. Presence-only filtreras bort.
              ...staffLTEs
                .filter(e => !e.isPresenceOnly)
                .map(e => ({
                  id: `lte:${e.id}`,
                  start: e.entered_at,
                  end: e.exited_at,
                  hours: e.hours,
                  breakHours: 0,
                  label: e.label ?? 'Plats',
                  category: 'location' as const,
                  approved: false,
                })),
            ],
            activeTimers: activeTimerInputs,
            travelSuggestions: rawTravel.map(t => ({
              id: t.id,
              start: t.start_time,
              end: t.end_time,
              hours: t.hours_worked || 0,
              fromAddress: t.from_address ?? null,
              toAddress: t.to_address ?? null,
              approved: !!t.approved,
              autoDetected: !!t.auto_detected,
              sourceTag: t.source ?? null,
              destinationBookingId: t.destination_booking_id ?? null,
            })),
            latestPing: ping ? { updatedAt: ping.updated_at } : null,
          });

          // ── Faktisk-dag-modell ─────────────────────────────────────
          // Bygg per-staff från råpings + kända platser + assistant_events
          // + workday_flags. Detta är den nya huvudvyn — visar GPS-evidens
          // även när time_reports saknas.
          const staffPings: Ping[] = (historyPings as any[])
            .filter(p => p.staff_id === s.id && p.lat != null && p.lng != null)
            .map(p => ({
              lat: Number(p.lat),
              lng: Number(p.lng),
              recorded_at: p.recorded_at,
              accuracy: p.accuracy ?? null,
            }));
          const placeVisits = buildPlaceVisits(staffPings, knownSites);
          const dayTimeline = buildDayTimeline(staffPings, placeVisits);
          const staffAssistantEvents = (assistantEvents as any[])
            .filter(a => a.staff_id === s.id)
            .map(a => ({
              id: a.id,
              event_type: String(a.event_type || ''),
              happened_at: a.happened_at,
              target_label: a.target_label ?? null,
              resolution_status: a.resolution_status ?? null,
            }));
          const staffFlags = (workdayFlags as any[])
            .filter(f => f.staff_id === s.id)
            .map(f => ({
              id: f.id,
              flag_type: String(f.flag_type || ''),
              severity: (f.severity as string) ?? null,
              title: f.title ?? null,
              description: f.description ?? null,
              created_at: f.created_at,
              resolved: !!f.resolved,
            }));
          const actualModel = buildActualStaffDayModel({
            date: dateStr,
            workday: staffWorkdays.length > 0
              ? {
                  id: staffWorkdays[0].id,
                  started_at: staffWorkdays[0].started_at,
                  ended_at: staffWorkdays[0].ended_at,
                  started_by: (staffWorkdays[0] as any).started_by ?? null,
                  metadata: (staffWorkdays[0] as any).metadata ?? null,
                }
              : null,
            timeReports: staffReports.map(r => ({
              id: r.id,
              start_iso: r.start_iso,
              end_iso: r.end_iso,
              label: r.label ?? '—',
              approved: r.approved,
              booking_id: r.booking_id ?? null,
              large_project_id: r.large_project_id ?? null,
              location_id: r.location_id ?? null,
              hours: r.hours,
            })),
            locationEntries: staffLTEs.map(e => ({
              id: e.id,
              entered_at: e.entered_at,
              exited_at: e.exited_at,
              label: e.label ?? 'Plats',
              isPresenceOnly: e.isPresenceOnly,
              hours: e.hours,
              source: (e as any).source ?? null,
              entry_date: (e as any).entry_date ?? null,
              metadata: (e as any).metadata ?? null,
            })),
            travelLogs: staffTravel.map(t => {
              const rt = rawTravel.find(x => x.id === t.id);
              return {
                id: t.id,
                start_iso: t.start_iso!,
                end_iso: t.end_iso,
                fromAddress: t.from_address ?? null,
                toAddress: t.to_address ?? null,
                approved: !!rt?.approved,
                autoDetected: !!rt?.auto_detected,
                source: rt?.source ?? null,
                hours: t.hours,
              };
            }),
            assistantEvents: staffAssistantEvents,
            flags: staffFlags,
            visits: placeVisits,
            travels: dayTimeline.travels,
            pings: staffPings,
            knownSites,
            privateZones: privateZonesByStaff.get(s.id) ?? [],
            plannedAssignments: derivedPlannedEvents
              .filter(ev => ev.staffId === s.id && ev.start && ev.end)
              .map(ev => ({
                id: ev.id,
                label: ev.largeProjectName || ev.client || ev.title || 'Planerad',
                plannedStart: ev.start,
                plannedEnd: ev.end,
              })),
            // latestPing för actual day model MÅSTE vara dagens sista ping
            // (recorded_at ≤ dagens slut), inte staff_locations.updated_at —
            // den senare är "live" och blir fel för historiska dagar.
            latestPing: (() => {
              if (!staffPings.length) return null;
              let last = staffPings[0];
              for (let i = 1; i < staffPings.length; i++) {
                if (new Date(staffPings[i].recorded_at).getTime() > new Date(last.recorded_at).getTime()) {
                  last = staffPings[i];
                }
              }
              return { recorded_at: last.recorded_at };
            })(),
          });

          return {
            id: s.id,
            name: s.name,
            role: s.role,
            color: s.color,
            // Behåll legacy total_hours för befintliga callers, men UI ska
            // föredra metrics.payableMinutes.
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
            metrics,
            canonical,
            actualModel,
            pingsTruncated: pingsTruncatedByStaff.get(s.id) === true,
            pingsFetchError: pingsErrorByStaff.get(s.id) || null,
            ...(() => {
              const presenceFlags = {
                plannedFromBookingStaffAssignments: plannedFromBSA.has(s.id),
                plannedFromStaffAssignments: plannedFromSA.has(s.id),
                plannedFromLargeProjectStaff: plannedFromLPS.has(s.id),
                hasWorkday: staffWorkdays.length > 0,
                hasOpenWorkday: staffWorkdays.some(w => !w.ended_at),
                hasTimeReports: staffReports.length > 0,
                hasLocationTimeEntries: staffLTEs.length > 0,
                hasTravelLogs: staffTravel.length > 0,
                hasGpsPings: staffPings.length > 0,
                hasAssistantEvents: staffAssistantEvents.length > 0,
                hasWorkdayFlags: staffFlags.length > 0,
              };
               const isPlanned = plannedStaffIds.has(s.id);
              const hasActivity =
                presenceFlags.hasTimeReports ||
                presenceFlags.hasLocationTimeEntries ||
                presenceFlags.hasTravelLogs ||
                presenceFlags.hasWorkday ||
                presenceFlags.hasGpsPings ||
                presenceFlags.hasAssistantEvents ||
                presenceFlags.hasWorkdayFlags;

              const status: PlanningStatus = presenceFlags.hasOpenWorkday
                ? 'workday_active'
                : isPlanned && !hasActivity
                  ? 'planned_not_started'
                  : !isPlanned && hasActivity
                    ? 'unplanned_activity'
                    : hasActivity && !presenceFlags.hasWorkday
                      ? 'missing_workday'
                      : presenceFlags.hasWorkday
                        ? 'completed'
                        : 'planned';

              const visibilityParts: string[] = [];
              if (isPlanned) visibilityParts.push('planerad i personalkalendern för vald dag');
              if (presenceFlags.plannedFromBookingStaffAssignments) visibilityParts.push('underlag från booking_staff_assignments');
              if (presenceFlags.plannedFromStaffAssignments) visibilityParts.push('teamplacerad i staff_assignments');
              if (presenceFlags.plannedFromLargeProjectStaff) visibilityParts.push('medlem i aktivt large_project');
              if (presenceFlags.hasWorkday) visibilityParts.push(presenceFlags.hasOpenWorkday ? 'pågående workday finns' : 'workday finns');
              if (presenceFlags.hasTimeReports) visibilityParts.push('time_reports finns');
              if (presenceFlags.hasLocationTimeEntries) visibilityParts.push('location_time_entries finns');
              if (presenceFlags.hasTravelLogs) visibilityParts.push('travel_time_logs finns');
              if (presenceFlags.hasGpsPings) visibilityParts.push(`${staffPings.length} GPS-pings`);
              if (presenceFlags.hasAssistantEvents) visibilityParts.push('assistant_events finns');
              if (presenceFlags.hasWorkdayFlags) visibilityParts.push('workday_flags finns');
              const visibilityReason = visibilityParts.length
                ? `Visas eftersom: ${visibilityParts.join(', ')}.`
                : 'Visas (ingen tydlig signal — fallback).';

              const statusReasonMap: Record<PlanningStatus, string> = {
                workday_active: 'Pågående arbetsdag — workdays.ended_at är null.',
                planned_not_started: 'Jobbassignerad denna dag men ingen workday/timer/rapport finns ännu.',
                unplanned_activity: 'Aktivitet finns men personen är inte planerad i någon assignment-källa.',
                missing_workday: 'Aktivitet finns (rapport/timer/GPS) men ingen workday-rad har skapats.',
                completed: 'Workday avslutad (ended_at satt).',
                planned: 'Jobbassignerad och normal dag.',
              };

              return {
                planningStatus: status,
                plannedLabels: [...(plannedLabelsByStaff.get(s.id) ?? [])],
                presence: {
                  ...presenceFlags,
                  visibilityReason,
                  statusReason: statusReasonMap[status],
                },
              };
            })(),
          };
        })
        .sort((a, b) => {
          // Sortering: pågående arbetsdag → öppen rapport → övriga, sedan namn
          const rank = (s: typeof a) =>
            s.planningStatus === 'workday_active' ? 0 :
            s.has_open_report ? 1 :
            s.planningStatus === 'missing_workday' ? 2 :
            s.planningStatus === 'unplanned_activity' ? 3 :
            s.planningStatus === 'planned_not_started' ? 4 : 5;
          const ra = rank(a); const rb = rank(b);
          if (ra !== rb) return ra - rb;
          return a.name.localeCompare(b.name, 'sv');
        });
    },
  });

  // ── Parallel per-staff hämtning av reportCandidateBlocks ──
  // Backend (get-staff-presence-day) kör samma motor som
  // report-candidate-blocks-health validerar som PASS. Read-only.
  const reportCandidateQueries = useQueries({
    queries: staffList.map((s) => ({
      queryKey: ['staff-report-candidates', dateStr, s.id],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke('get-staff-presence-day', {
          body: { staffId: s.id, date: dateStr },
        });
        if (error) throw new Error(error.message);
        if (data && (data as any).ok === false) {
          throw new Error((data as any).error ?? 'presence_day_failed');
        }
        return data as any;
      },
      staleTime: 30_000,
      refetchInterval: 60_000,
    })),
  });
  const reportCandidateByStaff = useMemo(() => {
    const map: Record<string, {
      blocks: any[];
      summary: any;
      diagnostics: any;
      excludedPreWorkBlocks: any[];
      preWorkExclusionDiagnostics: any;
      targetResolution: any;
      presenceBlocks: any[];
      presenceRawEvidence: any[];
      rawGpsTimeline: any;
      technicalTimeline: any[];
      presenceDaySummary: any;
      presenceDayAggregation: any;
      targetMatchSummary: any;
      targets: any[];
      counts: any;
      loading: boolean;
      missing: boolean;
    }> = {};
    staffList.forEach((s, idx) => {
      const q = reportCandidateQueries[idx];
      // "Saknas" = query har felat eller (efter att den slutat ladda) inte
      // returnerade någon data alls. Tom blocks-array är ett giltigt svar
      // (dag utan aktivitet) och räknas INTE som saknad motor.
      const data = q?.data as any | undefined;
      const isLoading = !!q?.isLoading;
      const hasError = !!q?.isError;
      const missing = hasError || (!isLoading && !data);
      map[s.id] = {
        blocks: data?.reportCandidateBlocks ?? [],
        summary: data?.reportCandidateSummary ?? null,
        diagnostics: data?.reportCandidateDiagnostics ?? null,
        excludedPreWorkBlocks: data?.excludedPreWorkBlocks ?? [],
        preWorkExclusionDiagnostics: data?.preWorkExclusionDiagnostics ?? null,
        targetResolution:
          data?.targetResolution ?? data?.reportCandidateDiagnostics?.targetResolution ?? null,
        presenceBlocks: data?.presenceDayBlocks ?? [],
        presenceRawEvidence: data?.presenceDayBlocksRawEvidence ?? [],
        rawGpsTimeline: data?.rawGpsTimeline ?? null,
        technicalTimeline: data?.technicalTimeline ?? [],
        presenceDaySummary: data?.presenceDaySummary ?? null,
        presenceDayAggregation: data?.presenceDayAggregation ?? null,
        targetMatchSummary: data?.targetMatchSummary ?? null,
        targets: data?.targets ?? [],
        counts: data?.counts ?? null,
        loading: isLoading,
        missing,
      };
    });
    return map;
  }, [staffList, reportCandidateQueries]);

  // ── EngineMode: bestäms PÅ SIDNIVÅ. Ingen personrad får själv välja motor. ──
  // Regel: om reportCandidateBlocks saknas för någon person → hela sidan visar
  // fallback (actual_model_fallback). Annars använder ALLA report_candidate.
  // Loading räknas inte som "saknas" — då visar vi laddtillstånd, inte fallback.
  const anyStillLoading = staffList.some((s) => reportCandidateByStaff[s.id]?.loading);
  const missingStaffCount = staffList.filter((s) => reportCandidateByStaff[s.id]?.missing).length;

  // ── TILLFÄLLIG GUARD: pausa ny motor om underlaget innehåller osäkra targets. ──
  // Vi gissar inte själva från data.targets — vi läser den auktoritativa
  // targetResolution-räknaren som resolveWorkTargets returnerar. Räknaren är
  // redan baserad på assignmentAnchor (inte targetSource ensam).
  let unsafeStaffCount = 0;
  let unsafeExampleSources: string[] = [];
  for (const s of staffList) {
    const q = reportCandidateQueries[staffList.indexOf(s)];
    const data = q?.data as any | undefined;
    if (!data) continue;
    const resolution =
      data.reportCandidateDiagnostics?.targetResolution ?? data.targetResolution ?? null;
    if (!resolution) continue;
    const unsafeCount = Number(resolution.unsafeAutoMatchedTargetsCount ?? 0);
    if (unsafeCount > 0) {
      unsafeStaffCount += 1;
      if (unsafeExampleSources.length < 3) {
        if (Number(resolution.dateRelevantBookingsAsPrimaryCount ?? 0) > 0)
          unsafeExampleSources.push('date_relevant_booking');
        if (Number(resolution.activeProjectsAsPrimaryCount ?? 0) > 0)
          unsafeExampleSources.push('active_project');
        if (Number(resolution.unassignedBookingsMatchedAsWorkCount ?? 0) > 0)
          unsafeExampleSources.push('unassigned_booking');
        if (Number(resolution.unassignedProjectsMatchedAsWorkCount ?? 0) > 0)
          unsafeExampleSources.push('unassigned_project');
      }
    }
  }
  const hasUnsafeTargets = unsafeStaffCount > 0;

  const engineMode: 'report_candidate' | 'actual_model_fallback' =
    !anyStillLoading && (missingStaffCount > 0 || hasUnsafeTargets)
      ? 'actual_model_fallback'
      : 'report_candidate';

  // ── Phase per booking/large_project på valt datum (rig/event/rigdown) för Gantt-färgning.
  // Sanning: personalkalendern (calendar_events.event_type), INTE bookings.rig/event/rigdowndate.
  // Förrigg-events kan ligga i kalendern utan att bookings-datumkolumnerna uppdaterats.
  const { data: phaseMaps = { bookingPhaseByDate: {}, largeProjectPhaseByDate: {} } } = useQuery({
    queryKey: ['staff-tr-phase-by-date-v2', dateStr],
    queryFn: async (): Promise<{
      bookingPhaseByDate: Record<string, 'rig' | 'event' | 'rigdown'>;
      largeProjectPhaseByDate: Record<string, 'rig' | 'event' | 'rigdown'>;
    }> => {
      const startIso = `${dateStr}T00:00:00.000Z`;
      const endIso = `${dateStr}T23:59:59.999Z`;
      const { data: events, error: evErr } = await supabase
        .from('calendar_events')
        .select('booking_id, event_type, start_time')
        .gte('start_time', startIso)
        .lte('start_time', endIso)
        .in('event_type', ['rig', 'event', 'rigdown']);
      if (evErr || !events) return { bookingPhaseByDate: {}, largeProjectPhaseByDate: {} };

      const priority: Record<'rig' | 'event' | 'rigdown', number> = { rig: 3, rigdown: 2, event: 1 };
      const bookingPhaseByDate: Record<string, 'rig' | 'event' | 'rigdown'> = {};
      for (const r of events) {
        const bid = (r as any).booking_id as string | null;
        const et = (r as any).event_type as 'rig' | 'event' | 'rigdown' | null;
        if (!bid || !et) continue;
        const existing = bookingPhaseByDate[bid];
        if (!existing || priority[et] > priority[existing]) bookingPhaseByDate[bid] = et;
      }

      const bookingIds = Object.keys(bookingPhaseByDate);
      const largeProjectPhaseByDate: Record<string, 'rig' | 'event' | 'rigdown'> = {};
      if (bookingIds.length) {
        const { data: bks } = await supabase
          .from('bookings')
          .select('id, large_project_id')
          .in('id', bookingIds);
        for (const b of bks ?? []) {
          const lpId = (b as any).large_project_id as string | null;
          if (!lpId) continue;
          const phase = bookingPhaseByDate[(b as any).id];
          if (!phase) continue;
          const existing = largeProjectPhaseByDate[lpId];
          if (!existing || priority[phase] > priority[existing]) {
            largeProjectPhaseByDate[lpId] = phase;
          }
        }
      }

      return { bookingPhaseByDate, largeProjectPhaseByDate };
    },
    staleTime: 60_000,
  });
  const bookingPhaseByDate = phaseMaps.bookingPhaseByDate;
  const largeProjectPhaseByDate = phaseMaps.largeProjectPhaseByDate;

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
        />
      </PageContainer>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden theme-purple bg-[hsl(220_20%_97%)] dark:bg-background">
      <div className="flex-1 min-h-0 p-3 sm:p-4 lg:p-5 overflow-hidden">
        <div className="h-full overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.08)]">
          <StaffGanttView
          staffList={staffList}
          isLoading={isLoading}
          onSelectStaff={(id, name) => {
            setSelectedStaffId(id);
            setSelectedStaffName(name);
          }}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          reportCandidateByStaff={reportCandidateByStaff}
          engineMode={engineMode}
          bookingPhaseByDate={bookingPhaseByDate}
          largeProjectPhaseByDate={largeProjectPhaseByDate}
        />
      </div>
    </div>
  );
};

export default StaffTimeReports;
