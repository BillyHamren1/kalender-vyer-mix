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
import { calculateDayMetrics, type DayMetrics } from '@/lib/staff/dayMetrics';
import { buildCanonicalStaffDayModel, type CanonicalStaffDayModel } from '@/lib/staff/canonicalDayModel';
import { classifyLocationEntry } from '@/lib/staff/locationEntryClassification';
import {
  buildActualStaffDayModel,
  type ActualStaffDayModel,
} from '@/lib/staff/actualStaffDayModel';
import { buildPlaceVisits, buildDayTimeline, type KnownSite } from '@/lib/staff/pingPlaceSegments';
import type { Ping } from '@/lib/staff/movementDetection';

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
}

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
): Promise<{ rows: any[]; truncated: boolean }> {
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
      // Non-fatal: returnera det vi har (dagen får aldrig bli tom).
      return { rows: out, truncated: false };
    }
    const batch = data || [];
    out.push(...batch);
    if (batch.length < PING_PAGE_SIZE) {
      return { rows: out, truncated: false };
    }
    from += PING_PAGE_SIZE;
  }
  return { rows: out.slice(0, PER_STAFF_PING_CAP), truncated: true };
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
      { table: 'assistant_events', events: ['INSERT', 'UPDATE', 'DELETE'] },
      { table: 'workday_flags', events: ['INSERT', 'UPDATE', 'DELETE'] },
    ],
    queryKeys: [['staff-time-reports-day', dateStr]],
    debounceMs: 400,
  });

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff-time-reports-day', dateStr],
    refetchInterval: 60_000,
    queryFn: async (): Promise<StaffWithDayReport[]> => {
      // Fetch reports + travel + location-based time (e.g. Lager) in parallel
      const [reportsRes, travelRes, locationRes, workdaysRes, pingsRes, assistantRes, flagsRes] = await Promise.all([
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
          .select('id, staff_id, location_id, booking_id, large_project_id, entered_at, exited_at, total_minutes, source')
          .eq('entry_date', dateStr),
        supabase
          .from('workdays')
          .select('id, staff_id, started_at, ended_at, review_status, review_reasons, notes, admin_note')
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
      // historyPings hämtas per-staff längre ned (efter att staffIds är kända)
      // för att kunna paginera komplett utan global limit.
      let historyPings: any[] = [];
      const pingsTruncatedByStaff = new Map<string, boolean>();
      const assistantEvents = (assistantRes as any).error ? [] : ((assistantRes as any).data || []);
      const workdayFlags = (flagsRes as any).error ? [] : ((flagsRes as any).data || []);

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
      // Org locations + dagens bokningar + dagens stora projekt.
      const knownSites: KnownSite[] = [];
      const [orgLocsRes, bookingCoordsRes, lpCoordsRes] = await Promise.all([
        supabase
          .from('organization_locations')
          .select('id, name, latitude, longitude, radius_meters, is_active')
          .eq('is_active', true),
        bookingIds.length
          ? supabase
              .from('bookings')
              .select('id, client, booking_number, deliveryaddress, delivery_latitude, delivery_longitude')
              .in('id', bookingIds)
          : Promise.resolve({ data: [] as any[] } as any),
        largeProjectIds.length
          ? supabase
              .from('large_projects')
              .select('id, name, address_latitude, address_longitude, address_radius_meters')
              .in('id', largeProjectIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);
      for (const l of ((orgLocsRes as any).data || [])) {
        if (l.latitude == null || l.longitude == null) continue;
        knownSites.push({
          id: `loc:${l.id}`,
          name: l.name,
          lat: Number(l.latitude),
          lng: Number(l.longitude),
          radiusMeters: Number(l.radius_meters ?? 200) || 200,
        });
      }
      for (const b of ((bookingCoordsRes as any).data || [])) {
        if (b.delivery_latitude == null || b.delivery_longitude == null) continue;
        knownSites.push({
          id: `booking:${b.id}`,
          name: b.booking_number ? `${b.booking_number} · ${b.client ?? 'Bokning'}` : (b.client ?? b.deliveryaddress ?? 'Bokning'),
          lat: Number(b.delivery_latitude),
          lng: Number(b.delivery_longitude),
          radiusMeters: 200,
        });
      }
      for (const lp of ((lpCoordsRes as any).data || [])) {
        if (lp.address_latitude == null || lp.address_longitude == null) continue;
        knownSites.push({
          id: `large:${lp.id}`,
          name: lp.name || 'Stort projekt',
          lat: Number(lp.address_latitude),
          lng: Number(lp.address_longitude),
          radiusMeters: Number(lp.address_radius_meters ?? 200) || 200,
        });
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

      // Inkludera även staff som har pings men inga rapporter (annars
      // försvinner deras "faktiska dag" vyn helt — kravet i regressionen).
      const pingStaffIds = await (async () => {
        const { data } = await supabase
          .from('staff_location_history')
          .select('staff_id')
          .gte('recorded_at', dayStartIso)
          .lt('recorded_at', nextDayIso)
          .limit(1000);
        return [...new Set((data || []).map((r: any) => r.staff_id).filter(Boolean))];
      })();
      for (const id of pingStaffIds) {
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
          const { rows, truncated } = await fetchAllPingsForStaff(id, dayStartIso, nextDayIso);
          if (truncated) pingsTruncatedByStaff.set(id, true);
          return rows;
        }),
      );
      historyPings = perStaffPings.flat();

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

          // Active timers: any open distribution row (time_report w/o end,
          // open LTE that isn't presence-only) — used to detect "tappad signal".
          const activeTimerInputs = [
            ...staffReports
              .filter(r => !r.end_iso)
              .map(r => ({
                id: `tr:${r.id}`,
                startedAt: r.start_iso,
                label: r.label ?? '—',
                source: 'time_report' as const,
                reportedAsDistribution: true,
              })),
            ...staffLTEs
              .filter(e => !e.exited_at && !e.isPresenceOnly)
              .map(e => ({
                id: `lte:${e.id}`,
                startedAt: e.entered_at,
                label: e.label ?? 'Plats',
                source: 'location_entry' as const,
                reportedAsDistribution: false,
              })),
            ...staffTravel
              .filter(t => !t.end_iso)
              .map(t => ({
                id: `tv:${t.id}`,
                startedAt: t.start_iso!,
                label: t.to_address ? `Resa → ${t.to_address.split(',')[0].trim()}` : 'Resa',
                source: 'travel' as const,
                reportedAsDistribution: false,
              })),
          ];

          const ping = pingMap.get(s.id) || null;

          // Travel suggestions are "föreslagen" until approved. Flag
          // auto_detected + source='gap_derived' so UI separates them.
          const rawTravel = (travel as any[]).filter(t => t.staff_id === s.id);
          const canonical = buildCanonicalStaffDayModel({
            workdays: staffWorkdays.map(w => ({ started_at: w.started_at, ended_at: w.ended_at })),
            distributionRows: staffReports.map(r => ({
              id: r.id,
              start: r.start_iso,
              end: r.end_iso,
              hours: r.hours,
              breakHours: r.break_hours ?? 0,
              label: r.label ?? '—',
              category: r.location_id ? 'location' : r.large_project_id || r.booking_id ? 'project' : 'other',
              approved: r.approved,
            })),
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
              ? { id: staffWorkdays[0].id, started_at: staffWorkdays[0].started_at, ended_at: staffWorkdays[0].ended_at }
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
            latestPing: ping ? { recorded_at: ping.updated_at } : null,
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
