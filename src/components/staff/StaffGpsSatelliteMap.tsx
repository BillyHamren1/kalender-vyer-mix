import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { fetchStaffMembers } from '@/services/staffService';
import { supabase } from '@/integrations/supabase/client';
import { useStaffGpsPingsForDay, type RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import { useStaffPingDaysForMonth } from '@/hooks/staff/useStaffPingDaysForMonth';
import { useDayKnownSites } from '@/hooks/useDayKnownSites';
import { useAllActiveProjectGeofences } from '@/hooks/useAllActiveProjectGeofences';
import { useOrganizationLocations } from '@/hooks/useOrganizationLocations';
import RawGpsSatelliteMap from './RawGpsSatelliteMap';
import type { GeofenceSite } from '@/lib/staff/geofencesToFeatures';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';
import { type PlaceVisit } from '@/lib/staff/pingPlaceSegments';
import { buildExactGeofenceVisits } from '@/lib/staff/buildExactGeofenceVisits';

function dash(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

type FilterMode = 'both' | 'assigned' | 'pinged' | 'all';

interface Props {
  initialStaffId?: string | null;
  initialDate?: string | null;
}

// DEV DEFAULT: öppna alltid Markuss Minalto den 16 maj 2026 tills användaren säger annat.
const DEFAULT_STAFF_ID = 'staff_1775736478460_k1q8idrvv';
const DEFAULT_DATE_ISO = '2026-05-16';

export default function StaffGpsSatelliteMap({ initialStaffId, initialDate }: Props) {
  const [staffId, setStaffId] = useState<string | null>(initialStaffId ?? DEFAULT_STAFF_ID);
  const [date, setDate] = useState<Date>(initialDate ? new Date(initialDate) : new Date(DEFAULT_DATE_ISO));
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    initialDate ? new Date(initialDate) : new Date(DEFAULT_DATE_ISO),
  );
  const [filterMode, setFilterMode] = useState<FilterMode>('both');
  const [showLocations, setShowLocations] = useState(true);
  const [showTargets, setShowTargets] = useState(true);


  const dateStr = format(date, 'yyyy-MM-dd');
  const queryClient = useQueryClient();

  const saveRadius = useCallback(async (id: string, radiusMeters: number) => {
    const [prefix, rawId] = id.split(':');
    if (!rawId) throw new Error('Ogiltigt geofence-id');
    if (prefix === 'loc') {
      const { error } = await supabase
        .from('organization_locations')
        .update({ radius_meters: radiusMeters })
        .eq('id', rawId);
      if (error) throw error;
    } else if (prefix === 'project') {
      const { error } = await supabase
        .from('projects')
        .update({ address_radius_meters: radiusMeters })
        .eq('id', rawId);
      if (error) throw error;
    } else if (prefix === 'large') {
      const { error } = await supabase
        .from('large_projects')
        .update({ address_radius_meters: radiusMeters })
        .eq('id', rawId);
      if (error) throw error;
    } else {
      throw new Error(`Radie kan inte sparas för ${prefix}`);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['day-known-sites'] }),
      queryClient.invalidateQueries({ queryKey: ['organization-locations-known'] }),
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
  const assignedSet = assignedQuery.data ?? new Set<string>();
  const pingedSet = pingedQuery.data ?? new Set<string>();

  const staff = useMemo(() => {
    if (filterMode === 'all') return allStaff;
    return allStaff.filter((s) => {
      const a = assignedSet.has(s.id);
      const p = pingedSet.has(s.id);
      if (filterMode === 'assigned') return a;
      if (filterMode === 'pinged') return p;
      return a || p; // both
    });
  }, [allStaff, assignedSet, pingedSet, filterMode]);

  const effectiveStaffId = staff.some((s) => s.id === staffId) ? staffId : (staff[0]?.id ?? null);

  const pingsQuery = useStaffGpsPingsForDay(effectiveStaffId, dateStr);
  const pings: RawStaffGpsPing[] = pingsQuery.data ?? [];

  // Geofences: alla org-platser + DAGENS targets för vald person +
  // ALLA aktiva projekt/stora projekt (oavsett person/dag) så kartan alltid
  // visar varje projekts geofence. Matchar regeln "inside geo = tid där".
  const { knownSites } = useDayKnownSites(effectiveStaffId ?? '', dateStr, !!effectiveStaffId);
  const { data: allProjectSites = [] } = useAllActiveProjectGeofences(dateStr, true);
  const { data: orgLocations = [] } = useOrganizationLocations();
  // Polygoner finns ENDAST på organization_locations. Mappa id → polygon
  // så vi kan attacha den till `loc:<id>`-sites utan att röra KnownSite-typen.
  const polygonByLocId = useMemo(() => {
    const m = new Map<string, GeoJSON.Polygon>();
    for (const l of orgLocations) {
      if (l.polygon) m.set(`loc:${l.id}`, l.polygon);
    }
    return m;
  }, [orgLocations]);
  const geofences = useMemo<GeofenceSite[]>(() => {
    const out: GeofenceSite[] = [];
    const seen = new Set<string>();
    const push = (s: { id: string; name: string; lat: number; lng: number; radiusMeters: number }) => {
      if (seen.has(s.id)) return;
      seen.add(s.id);
      const isLoc = s.id.startsWith('loc:');
      if (isLoc && !showLocations) return;
      if (!isLoc && !showTargets) return;
      out.push({
        id: s.id, name: s.name, lat: s.lat, lng: s.lng,
        radiusMeters: s.radiusMeters,
        polygon: polygonByLocId.get(s.id),
      });
    };
    for (const s of knownSites) push(s);
    for (const s of allProjectSites) push(s);
    return out;
  }, [knownSites, allProjectSites, polygonByLocId, showLocations, showTargets]);

  const summary = useMemo(() => {
    if (!pings.length) return null;
    const first = pings[0];
    const last = pings[pings.length - 1];
    const newest = pings.reduce((a, b) => (a.recorded_at > b.recorded_at ? a : b));
    return {
      count: pings.length,
      first: formatStockholmHms(first.recorded_at),
      last: formatStockholmHms(last.recorded_at),
      build: `${dash(newest.app_version)} (${dash(newest.app_build)})`,
      device: dash(newest.device_model),
    };
  }, [pings]);

  // Geofence-besök: räkna ut IN/UT-tid per ping ↔ känd plats (DAGENS sites).
  const geofenceVisits = useMemo<PlaceVisit[]>(() => {
    if (!pings.length || !geofences.length) return [];
    const asPings = pings.map(p => ({
      lat: p.lat, lng: p.lng, recorded_at: p.recorded_at, accuracy: p.accuracy ?? null,
    }));
    return buildExactGeofenceVisits(asPings, geofences);
  }, [pings, geofences]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Topbar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Person</label>
          <Select value={effectiveStaffId ?? ''} onValueChange={(v) => setStaffId(v)}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Välj person" />
            </SelectTrigger>
            <SelectContent>
              {staff.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">Ingen matchar filtret.</div>
              )}
              {staff.map((s) => {
                const a = assignedSet.has(s.id);
                const p = pingedSet.has(s.id);
                return (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      <span>{s.name}</span>
                      {a && <Badge variant="secondary" className="h-4 px-1 text-[10px]">Ass</Badge>}
                      {p && <Badge variant="outline" className="h-4 px-1 text-[10px]">GPS</Badge>}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Visa</label>
          <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Assignade el. pingade</SelectItem>
              <SelectItem value="assigned">Endast assignade</SelectItem>
              <SelectItem value="pinged">Endast pingade</SelectItem>
              <SelectItem value="all">Alla</SelectItem>
            </SelectContent>
          </Select>
        </div>


        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Datum</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[200px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, 'yyyy-MM-dd')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Lager på kartan</label>
          <div className="flex items-center gap-3 h-10 px-3 border rounded-md">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={showLocations} onCheckedChange={(v) => setShowLocations(v === true)} />
              <span>Platser</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={showTargets} onCheckedChange={(v) => setShowTargets(v === true)} />
              <span>Targets (dagen)</span>
            </label>
          </div>
        </div>

        {/* Linjer inuti geofence döljs alltid visuellt (logiken är orörd). */}


        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {pingsQuery.isLoading && <Badge variant="outline">Laddar…</Badge>}
          {geofences.length > 0 && (
            <Badge variant="outline">{geofences.length} geofences</Badge>
          )}
          {summary && (
            <>
              <Badge variant="secondary">{summary.count} pings</Badge>
              <Badge variant="outline">Första {summary.first}</Badge>
              <Badge variant="outline">Sista {summary.last}</Badge>
              <Badge variant="outline">Build {summary.build}</Badge>
              <Badge variant="outline">{summary.device}</Badge>
            </>
          )}
        </div>
      </div>

      {/* Karta */}
      <div className="relative h-[55vh] min-h-[360px] rounded-md overflow-hidden border bg-muted/30">
        {pings.length > 0 || geofences.length > 0 ? (
          <RawGpsSatelliteMap pings={pings} geofences={geofences} visits={geofenceVisits} onSaveRadius={saveRadius} className="h-full w-full" />

        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {pingsQuery.isLoading ? 'Laddar pings…' : 'Inga GPS-pings eller geofences för vald person och dag.'}
          </div>
        )}
      </div>


      {/* Geofence-besök — exakt IN/UT per stängsel */}
      <GeofenceVisitsTable visits={geofenceVisits} />

      {/* Tabell — samma gruppering som kartan: stay-block (≥20 min på samma plats) slås ihop */}
      <PingTimelineTable pings={pings} />
    </div>
  );
}

function GeofenceVisitsTable({ visits }: { visits: PlaceVisit[] }) {
  const sorted = useMemo(
    () => [...visits].sort((a, b) => a.start.localeCompare(b.start)),
    [visits],
  );
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="px-3 py-2 text-sm font-medium bg-muted/40 border-b flex items-center justify-between">
        <span>Geofence-besök ({sorted.length})</span>
        <span className="text-xs text-muted-foreground">Exakt IN/UT per stängsel</span>
      </div>
      <div className="max-h-[40vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 sticky top-0">
            <tr className="text-left">
              <th className="px-2 py-1">Plats</th>
              <th className="px-2 py-1">Typ</th>
              <th className="px-2 py-1">IN</th>
              <th className="px-2 py-1">UT</th>
              <th className="px-2 py-1">Varaktighet</th>
              <th className="px-2 py-1">Pings</th>
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
              return (
                <tr key={`gv-${v.placeKey}-${v.start}`} className="border-t hover:bg-muted/20">
                  <td className="px-2 py-1">
                    {v.knownSite!.name}
                    {isOutside && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600">· Utanför geo</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-muted-foreground">{kind}</td>
                  <td className="px-2 py-1 font-mono">{formatStockholmHms(v.start)}</td>
                  <td className="px-2 py-1 font-mono">{formatStockholmHms(v.end)}</td>
                  <td className="px-2 py-1">{dur}</td>
                  <td className="px-2 py-1">{v.pingCount}</td>
                </tr>
              );
            })}
            {!sorted.length && (
              <tr><td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">Inga geofence-besök för vald person och dag.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PingTimelineTable({ pings }: { pings: RawStaffGpsPing[] }) {
  const sorted = useMemo(
    () => [...pings].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)),
    [pings],
  );

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="px-3 py-2 text-sm font-medium bg-muted/40 border-b flex items-center justify-between">
        <span>Tidslinje ({sorted.length} pings)</span>
        <span className="text-xs text-muted-foreground">Råa pings, en rad per ping</span>
      </div>
      <div className="max-h-[40vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 sticky top-0">
            <tr className="text-left">
              <th className="px-2 py-1">Tid</th>
              <th className="px-2 py-1">Lat</th>
              <th className="px-2 py-1">Lng</th>
              <th className="px-2 py-1">Accuracy</th>
              <th className="px-2 py-1">Source</th>
              <th className="px-2 py-1">Battery</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={`pt-${p.id}`} className="border-t hover:bg-muted/20">
                <td className="px-2 py-1 font-mono">{formatStockholmHms(p.recorded_at)}</td>
                <td className="px-2 py-1 font-mono">{p.lat.toFixed(6)}</td>
                <td className="px-2 py-1 font-mono">{p.lng.toFixed(6)}</td>
                <td className="px-2 py-1">{p.accuracy != null ? `${p.accuracy.toFixed(0)} m` : '—'}</td>
                <td className="px-2 py-1">{dash(p.source)}</td>
                <td className="px-2 py-1">{p.battery_percent != null ? `${p.battery_percent}%${p.is_charging ? ' ⚡' : ''}` : '—'}</td>
              </tr>
            ))}
            {!sorted.length && (
              <tr><td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">Inga pings.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

