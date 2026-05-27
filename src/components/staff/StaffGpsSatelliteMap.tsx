import { Fragment, useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fetchStaffMembers } from '@/services/staffService';
import { supabase } from '@/integrations/supabase/client';
import type { RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import { useStaffGpsPingsForDay } from '@/hooks/staff/useStaffGpsPingsForDay';
import { useMobileStaffDayPings } from '@/hooks/staff/useMobileStaffDayPings';
import { stockholmDayWindowUtc } from '@/lib/staff/stockholmTime';

import RawGpsSatelliteMap from './RawGpsSatelliteMap';
import { StaffGpsWeekPanel } from './StaffGpsWeekPanel';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';
import { type PlaceVisit } from '@/lib/staff/pingPlaceSegments';
import { useOrganizationLocations } from '@/hooks/useOrganizationLocations';
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
  const [showAllRawPings, setShowAllRawPings] = useState(false);


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

  /**
   * Sparar polygon för en geofence. polygon=null tar bort polygonen och
   * återgår till cirkel.
   */
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

  // Vilka är assignade den valda dagen?
  const assignedQuery = useQuery({
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

  // Vilka har pingat den valda dagen?
  const pingedQuery = useQuery({
    queryKey: ['gps-map-pinged-ids', dateStr],
    staleTime: 60_000,
    queryFn: async () => {
      const { startIso, endIso } = stockholmDayWindowUtc(dateStr);

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
  const assignedSet = assignedQuery.data ?? new Set<string>();
  const pingedSet = pingedQuery.data ?? new Set<string>();

  const staff = useMemo(() => {
    // Visa alltid personer som antingen är assignade ELLER har pingat den valda dagen.
    return allStaff.filter((s) => assignedSet.has(s.id) || pingedSet.has(s.id));
  }, [allStaff, assignedSet, pingedSet]);

  const effectiveStaffId = staff.some((s) => s.id === staffId) ? staffId : (staff[0]?.id ?? null);

  // PRIMÄR källa för pings = rådata från staff_location_history.
  // Kartan ska aldrig bli tom bara för att snapshot-/Time Engine-spåret failar.
  const rawPingsQuery = useStaffGpsPingsForDay(effectiveStaffId, dateStr, !!effectiveStaffId);
  // SEKUNDÄR källa: snapshot bidrar bara med geofence-besök / org_locations.
  const snapshotQuery = useMobileStaffDayPings(effectiveStaffId, dateStr, !!effectiveStaffId);
  const pings: RawStaffGpsPing[] = useMemo(() => rawPingsQuery.data ?? [], [rawPingsQuery.data]);


  // (Månadsprickar borttagna — vecknavigeringen ersätter månadskalendern.)
  void calendarMonth;


  // Geofences:
  //   - Projekt + stora projekt → ENDAST de som är aktiva på vald dag
  //     (rigg → sista nedrigg). Filtrering sker i useAllActiveProjectGeofences.
  //   - Övriga geofences från snapshot (org_locations: lager, boenden m.m.)
  //     visas alltid — de är inte projektbundna och kan inte "vara avbokade".
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

  // Privata boenden (organization_locations.is_private_residence) ska aldrig
  // visas i geofence-listan. De räknas som hem och hör inte hemma i
  // arbets-/projektvyn.
  const { data: orgLocations = [] } = useOrganizationLocations();
  const privateLocationIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of orgLocations) {
      if (l.isPrivate) s.add(`loc:${l.id}`);
    }
    return s;
  }, [orgLocations]);

  const visibleGeofenceVisits = useMemo<PlaceVisit[]>(
    () => geofenceVisits.filter((v) => !(v.knownSite && privateLocationIds.has(v.knownSite.id))),
    [geofenceVisits, privateLocationIds],
  );

  const handleDateChange = useCallback((d: Date) => {
    setDate(d);
    setCalendarMonth(d);
  }, []);

  return (
    <div className="flex flex-col md:flex-row gap-4 h-full">
      <StaffGpsWeekPanel
        staff={staff}
        staffId={effectiveStaffId}
        onStaffChange={(id) => setStaffId(id)}
        assignedSet={assignedSet}
        pingedSet={pingedSet}
        date={date}
        onDateChange={handleDateChange}
      />

      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Karta */}
        <div className="planning-card relative h-[60vh] min-h-[420px] overflow-hidden p-0">
          {pings.length > 0 || geofences.length > 0 ? (
            <>
              <RawGpsSatelliteMap pings={pings} geofences={geofences} visits={geofenceVisits} onSaveRadius={saveRadius} onSavePolygon={savePolygon} showAllRawPings={showAllRawPings} className="h-full w-full" />
              <button
                type="button"
                onClick={() => setShowAllRawPings((v) => !v)}
                className={`absolute top-3 left-3 z-10 text-[11px] px-2.5 py-1.5 rounded-md border font-medium shadow-md transition-colors ${
                  showAllRawPings
                    ? 'bg-yellow-300 border-yellow-500 text-slate-900 hover:bg-yellow-200'
                    : 'bg-white/95 border-[hsl(270_25%_85%)] text-foreground/80 hover:bg-[hsl(270_45%_96%)]'
                }`}
                title={`${pings.length} råpings för dagen`}
              >
                {showAllRawPings ? 'Dölj' : 'Visa'} alla råpings ({pings.length})
              </button>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
               {snapshotQuery.isLoading ? 'Laddar…' : 'Inga rörelser registrerade för vald dag.'}
            </div>
          )}
        </div>

        {/* Geofence-besök — exakt IN/UT per stängsel (privata boenden döljs) */}
        <GeofenceVisitsTable visits={visibleGeofenceVisits} allDayPings={snapshotQuery.data?.pings ?? []} />
      </div>
    </div>
  );
}


type PingRow = { recorded_at: string; lat: number; lng: number; accuracy?: number | null };

function GeofenceVisitsTable({ visits, allDayPings }: { visits: PlaceVisit[]; allDayPings: PingRow[] }) {
  const sorted = useMemo(
    () => [...visits].sort((a, b) => a.start.localeCompare(b.start)),
    [visits],
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showAllPings, setShowAllPings] = useState(false);
  const sortedAllPings = useMemo(
    () => [...allDayPings].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)),
    [allDayPings],
  );
  return (
    <div className="planning-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[hsl(270_20%_90%)] flex items-center justify-between bg-[hsl(270_35%_98%)]">
        <div className="flex items-center gap-2">
          <span className="planning-section-title">Geofence-besök</span>
          <span className="planning-badge">{sorted.length}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground hidden sm:inline">Klicka på en rad för att se alla pings</span>
          <button
            type="button"
            onClick={() => setShowAllPings(v => !v)}
            className="text-[11px] px-2.5 py-1 rounded border border-[hsl(270_25%_85%)] bg-white hover:bg-[hsl(270_45%_96%)] transition-colors font-medium text-foreground/80"
          >
            {showAllPings ? 'Dölj' : 'Visa'} alla pings för dagen ({sortedAllPings.length})
          </button>
        </div>
      </div>
      {showAllPings && (
        <div className="border-b border-[hsl(270_20%_90%)] bg-[hsl(270_45%_98%)]">
          <PingsTable pings={sortedAllPings} />
        </div>
      )}
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-[hsl(270_18%_92%)]">
            <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className="px-3 py-2 font-semibold w-6"></th>
              <th className="px-3 py-2 font-semibold">Plats</th>
              <th className="px-3 py-2 font-semibold">Typ</th>
              <th className="px-3 py-2 font-semibold">IN</th>
              <th className="px-3 py-2 font-semibold">UT</th>
              <th className="px-3 py-2 font-semibold">Varaktighet</th>
              <th className="px-3 py-2 font-semibold text-right">Pings</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => {
              const id = v.knownSite!.id;
              const kind = id.startsWith('loc:') ? 'Plats'
                : id.startsWith('large:') ? 'Stort projekt'
                : id.startsWith('project:') ? 'Projekt'
                : id.startsWith('booking:') ? 'Bokning'
                : '—';
              const hh = Math.floor(v.durationMin / 60);
              const mm = v.durationMin % 60;
              const dur = hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
              const isOutside = v.subKind === 'outside_geo';
              const rowKey = `gv-${v.placeKey}-${v.start}`;
              const isOpen = expandedKey === rowKey;
              return (
                <Fragment key={rowKey}>
                  <tr
                    onClick={() => setExpandedKey(isOpen ? null : rowKey)}
                    className={`border-t border-[hsl(270_18%_94%)] cursor-pointer transition-colors ${isOpen ? 'bg-[hsl(270_45%_96%)]' : 'hover:bg-[hsl(270_35%_98%)]'}`}
                  >
                    <td className="px-3 py-2 text-muted-foreground tabular-nums select-none">
                      {isOpen ? '▾' : '▸'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground/90">{v.knownSite!.name}</span>
                      {isOutside && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">· Utanför geo</span>
                      )}
                    </td>
                    <td className="px-3 py-2"><span className="planning-chip">{kind}</span></td>
                    <td className="px-3 py-2 font-mono tabular-nums text-foreground/80">{formatStockholmHms(v.start)}</td>
                    <td className="px-3 py-2 font-mono tabular-nums text-foreground/80">{formatStockholmHms(v.end)}</td>
                    <td className="px-3 py-2 font-medium tabular-nums">{dur}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{v.pingCount}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-[hsl(270_45%_98%)]">
                      <td colSpan={7} className="px-0 py-0">
                        <div className="px-6 py-3 border-t border-[hsl(270_25%_90%)]">
                          <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground mb-2 flex items-center gap-2">
                            <span>Alla pings för detta besök</span>
                            <span className="planning-badge">{v.pings?.length ?? 0}</span>
                          </div>
                          <PingsTable pings={v.pings ?? []} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!sorted.length && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Inga geofence-besök för vald person och dag.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PingsTable({ pings }: { pings: PingRow[] }) {
  return (
    <div className="px-6 py-3">
      <div className="max-h-[40vh] overflow-auto rounded border border-[hsl(270_20%_92%)] bg-white">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-[hsl(270_35%_97%)] text-left text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-semibold w-10">#</th>
              <th className="px-3 py-1.5 font-semibold">Tid</th>
              <th className="px-3 py-1.5 font-semibold">Lat</th>
              <th className="px-3 py-1.5 font-semibold">Lng</th>
              <th className="px-3 py-1.5 font-semibold text-right">Acc (m)</th>
              <th className="px-3 py-1.5 font-semibold">Karta</th>
            </tr>
          </thead>
          <tbody>
            {pings.map((p, idx) => (
              <tr key={`${p.recorded_at}-${idx}`} className="border-t border-[hsl(270_18%_95%)] hover:bg-[hsl(270_35%_98%)]">
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{idx + 1}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums">{formatStockholmHms(p.recorded_at)}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums">{p.lat.toFixed(6)}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums">{p.lng.toFixed(6)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {p.accuracy != null ? Math.round(p.accuracy) : '—'}
                </td>
                <td className="px-3 py-1.5">
                  <a
                    href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Öppna
                  </a>
                </td>
              </tr>
            ))}
            {!pings.length && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Inga pings registrerade.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}



