import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchStaffMembers } from '@/services/staffService';
import { supabase } from '@/integrations/supabase/client';
import type { RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import { useMobileStaffDayPings } from '@/hooks/staff/useMobileStaffDayPings';
import RawGpsSatelliteMap from './RawGpsSatelliteMap';
import { StaffGpsWeekPanel } from './StaffGpsWeekPanel';
import { StaffGpsWeekList } from './StaffGpsWeekList';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';
import { type PlaceVisit } from '@/lib/staff/pingPlaceSegments';
import { useAllActiveProjectGeofences } from '@/hooks/useAllActiveProjectGeofences';

interface Props {
  initialStaffId?: string | null;
  initialDate?: string | null;
}

export default function StaffGpsSatelliteMap({ initialStaffId, initialDate }: Props) {
  const [staffId, setStaffId] = useState<string | null>(initialStaffId ?? null);
  const [date, setDate] = useState<Date>(initialDate ? new Date(initialDate) : new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    initialDate ? new Date(initialDate) : new Date(),
  );

  const dateStr = format(date, 'yyyy-MM-dd');
  const queryClient = useQueryClient();

  const saveRadius = useCallback(async (id: string, radiusMeters: number) => {
    const [prefix, rawId] = id.split(':');
    if (!rawId) throw new Error('Ogiltigt geofence-id');
    if (prefix === 'loc') {
      const { error } = await supabase
        .from('organization_locations')
        .update({ radius_meters: radiusMeters, geofence_mode: 'circle', geofence_polygon: null })
        .eq('id', rawId);
      if (error) throw error;
    } else if (prefix === 'project') {
      const { error } = await supabase
        .from('projects')
        .update({ address_radius_meters: radiusMeters, address_geofence_mode: 'circle', address_geofence_polygon: null })
        .eq('id', rawId);
      if (error) throw error;
    } else if (prefix === 'large') {
      const { error } = await supabase
        .from('large_projects')
        .update({ address_radius_meters: radiusMeters, address_geofence_mode: 'circle', address_geofence_polygon: null })
        .eq('id', rawId);
      if (error) throw error;
    } else {
      throw new Error(`Radie kan inte sparas för ${prefix}`);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['day-known-sites'] }),
      queryClient.invalidateQueries({ queryKey: ['organization-locations-known'] }),
      queryClient.invalidateQueries({ queryKey: ['all-active-project-geofences'] }),
      queryClient.invalidateQueries({ queryKey: ['mobile-staff-day-pings'] }),
    ]);
  }, [queryClient]);

  const savePolygon = useCallback(async (id: string, polygon: GeoJSON.Polygon | null) => {
    const [prefix, rawId] = id.split(':');
    if (!rawId) throw new Error('Ogiltigt geofence-id');
    const usePoly = polygon !== null;
    if (prefix === 'loc') {
      const { error } = await supabase
        .from('organization_locations')
        .update({
          geofence_mode: usePoly ? 'polygon' : 'circle',
          geofence_polygon: usePoly ? (polygon as any) : null,
        })
        .eq('id', rawId);
      if (error) throw error;
    } else if (prefix === 'project') {
      const { error } = await supabase
        .from('projects')
        .update({
          address_geofence_mode: usePoly ? 'polygon' : 'circle',
          address_geofence_polygon: usePoly ? (polygon as any) : null,
        })
        .eq('id', rawId);
      if (error) throw error;
    } else if (prefix === 'large') {
      const { error } = await supabase
        .from('large_projects')
        .update({
          address_geofence_mode: usePoly ? 'polygon' : 'circle',
          address_geofence_polygon: usePoly ? (polygon as any) : null,
        })
        .eq('id', rawId);
      if (error) throw error;
    } else {
      throw new Error(`Polygon kan inte sparas för ${prefix}`);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['day-known-sites'] }),
      queryClient.invalidateQueries({ queryKey: ['organization-locations-known'] }),
      queryClient.invalidateQueries({ queryKey: ['all-active-project-geofences'] }),
      queryClient.invalidateQueries({ queryKey: ['mobile-staff-day-pings'] }),
    ]);
  }, [queryClient]);

  const staffQuery = useQuery({
    queryKey: ['staff-members-all-gps-map'],
    queryFn: () => fetchStaffMembers({ includeInactive: true }),
    staleTime: 5 * 60_000,
  });

  // Bemanning för hela veckan (för lista) + utvald dag (för day-vy).
  const weekStart = useMemo(() => startOfWeek(date, { weekStartsOn: 1 }), [date]);
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  const assignedWeekQuery = useQuery({
    queryKey: ['gps-map-assigned-ids-week', weekStartStr],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_assignments')
        .select('staff_id')
        .gte('assignment_date', weekStartStr)
        .lte('assignment_date', weekEndStr);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => String(r.staff_id)));
    },
  });

  const pingedWeekQuery = useQuery({
    queryKey: ['gps-map-pinged-ids-week', weekStartStr],
    staleTime: 60_000,
    queryFn: async () => {
      const startIso = `${weekStartStr}T00:00:00.000Z`;
      const endIso = `${weekEndStr}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from('staff_location_history')
        .select('staff_id')
        .gte('recorded_at', startIso)
        .lte('recorded_at', endIso)
        .limit(50000);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => String(r.staff_id)));
    },
  });

  // Bemanning + pingade för EXAKT vald dag (används av StaffGpsWeekPanel-badges).
  const assignedDayQuery = useQuery({
    queryKey: ['gps-map-assigned-ids', dateStr],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_assignments')
        .select('staff_id')
        .eq('assignment_date', dateStr);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => String(r.staff_id)));
    },
  });

  const pingedDayQuery = useQuery({
    queryKey: ['gps-map-pinged-ids', dateStr],
    staleTime: 60_000,
    queryFn: async () => {
      const startIso = `${dateStr}T00:00:00.000Z`;
      const endIso = `${dateStr}T23:59:59.999Z`;
      const { data, error } = await supabase
        .from('staff_location_history')
        .select('staff_id')
        .gte('recorded_at', startIso)
        .lte('recorded_at', endIso)
        .limit(50000);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => String(r.staff_id)));
    },
  });

  const allStaff = staffQuery.data ?? [];
  const assignedWeekSet = assignedWeekQuery.data ?? new Set<string>();
  const pingedWeekSet = pingedWeekQuery.data ?? new Set<string>();
  const assignedDaySet = assignedDayQuery.data ?? new Set<string>();
  const pingedDaySet = pingedDayQuery.data ?? new Set<string>();

  const staffForDay = useMemo(() => {
    return allStaff.filter((s) => assignedDaySet.has(s.id) || pingedDaySet.has(s.id));
  }, [allStaff, assignedDaySet, pingedDaySet]);

  const snapshotQuery = useMobileStaffDayPings(staffId, dateStr, !!staffId);
  const pings: RawStaffGpsPing[] = useMemo(() => (snapshotQuery.data?.pings ?? []).map((p) => ({
    id: p.id,
    recorded_at: p.recorded_at,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    speed: null,
    source: null,
    battery_percent: null,
    is_charging: null,
    app_version: null,
    app_build: null,
    platform: null,
    os_version: null,
    device_model: null,
    app_id: null,
  })), [snapshotQuery.data?.pings]);

  void calendarMonth;

  const activeProjectGeofencesQuery = useAllActiveProjectGeofences(dateStr);
  const geofences = useMemo<GeofenceSite[]>(() => {
    const nonProject = (snapshotQuery.data?.geofences ?? []).filter((site) => {
      const id = String(site.id ?? '');
      return !id.startsWith('project:') && !id.startsWith('large:');
    });
    const projectsForDay = activeProjectGeofencesQuery.data ?? [];
    const merged = [...nonProject, ...projectsForDay];
    return merged.map((site) => ({
      id: site.id,
      name: site.name,
      lat: site.lat,
      lng: site.lng,
      radiusMeters: site.radiusMeters,
      polygon: site.polygon ?? undefined,
    }));
  }, [snapshotQuery.data?.geofences, activeProjectGeofencesQuery.data]);

  const geofenceVisits = useMemo<PlaceVisit[]>(() => (snapshotQuery.data?.visits ?? []).map((visit) => ({
    placeKey: visit.placeKey,
    knownSite: visit.knownSite,
    centre: visit.centre,
    start: visit.start,
    end: visit.end,
    durationMin: visit.durationMin,
    pingCount: visit.pingCount,
    pings: visit.pings.map((ping) => ({
      recorded_at: ping.recorded_at,
      lat: ping.lat,
      lng: ping.lng,
      accuracy: ping.accuracy,
    })),
    subKind: visit.subKind,
  })), [snapshotQuery.data?.visits]);

  const handleDateChange = useCallback((d: Date) => {
    setDate(d);
    setCalendarMonth(d);
  }, []);

  const handleSelect = useCallback((id: string, d: Date) => {
    setStaffId(id);
    setDate(d);
    setCalendarMonth(d);
  }, []);

  // LIST-VY (default): visa alla personer med veckosammanfattning, ingen karta.
  if (!staffId) {
    return (
      <StaffGpsWeekList
        staff={allStaff}
        assignedSet={assignedWeekSet}
        pingedSet={pingedWeekSet}
        date={date}
        onDateChange={handleDateChange}
        onSelect={handleSelect}
      />
    );
  }

  // DETALJ-VY: vald person → veckopanel + karta.
  return (
    <div className="flex flex-col gap-4 h-full">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStaffId(null)}
          className="h-8 px-2 text-[12px] font-semibold text-[hsl(280_45%_38%)] hover:bg-[hsl(270_45%_94%)] rounded-md"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka till lista
        </Button>
      </div>

      <StaffGpsWeekPanel
        staff={staffForDay}
        staffId={staffId}
        onStaffChange={(id) => setStaffId(id)}
        assignedSet={assignedDaySet}
        pingedSet={pingedDaySet}
        date={date}
        onDateChange={handleDateChange}
      />

      <div className="planning-card relative h-[calc(100vh-360px)] min-h-[520px] overflow-hidden p-0">
        {pings.length > 0 || geofences.length > 0 ? (
          <RawGpsSatelliteMap pings={pings} geofences={geofences} visits={geofenceVisits} onSaveRadius={saveRadius} onSavePolygon={savePolygon} className="h-full w-full" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
             {snapshotQuery.isLoading ? 'Laddar…' : 'Inga rörelser registrerade för vald dag.'}
          </div>
        )}
      </div>
    </div>
  );
}
