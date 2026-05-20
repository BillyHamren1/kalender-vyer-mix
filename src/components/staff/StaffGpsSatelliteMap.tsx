import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { fetchStaffMembers } from '@/services/staffService';
import { supabase } from '@/integrations/supabase/client';
import { useStaffGpsPingsForDay, type RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import RawGpsSatelliteMap from './RawGpsSatelliteMap';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';

function dash(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

type FilterMode = 'both' | 'assigned' | 'pinged' | 'all';

interface Props {
  initialStaffId?: string | null;
  initialDate?: string | null;
}

export default function StaffGpsSatelliteMap({ initialStaffId, initialDate }: Props) {
  const [staffId, setStaffId] = useState<string | null>(initialStaffId ?? null);
  const [date, setDate] = useState<Date>(initialDate ? new Date(initialDate) : new Date());
  const [filterMode, setFilterMode] = useState<FilterMode>('both');

  const dateStr = format(date, 'yyyy-MM-dd');

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

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {pingsQuery.isLoading && <Badge variant="outline">Laddar…</Badge>}
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
        {pings.length > 0 ? (
          <RawGpsSatelliteMap pings={pings} className="h-full w-full" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {pingsQuery.isLoading ? 'Laddar pings…' : 'Inga GPS-pings hittades för vald person och dag.'}
          </div>
        )}
      </div>

      {/* Tabell — samma gruppering som kartan: stay-block (≥20 min på samma plats) slås ihop */}
      <PingTimelineTable pings={pings} />
    </div>
  );
}

function PingTimelineTable({ pings }: { pings: RawStaffGpsPing[] }) {
  const sampled = useMemo(
    () => downsamplePingsByBucket(pings, 5 * 60 * 1000),
    [pings],
  );
  const markers = useMemo(
    () => groupPingsByStay(sampled, { minStayMs: 20 * 60 * 1000, radiusMeters: 60 }),
    [sampled],
  );

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="px-3 py-2 text-sm font-medium bg-muted/40 border-b flex items-center justify-between">
        <span>Tidslinje ({markers.length} block, {pings.length} råa pings)</span>
        <span className="text-xs text-muted-foreground">Stay = ≥20 min inom 60 m</span>
      </div>
      <div className="max-h-[40vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 sticky top-0">
            <tr className="text-left">
              <th className="px-2 py-1">Typ</th>
              <th className="px-2 py-1">Tid / Tidsspann</th>
              <th className="px-2 py-1">Längd</th>
              <th className="px-2 py-1">Pings</th>
              <th className="px-2 py-1">Lat</th>
              <th className="px-2 py-1">Lng</th>
              <th className="px-2 py-1">Accuracy</th>
              <th className="px-2 py-1">Source</th>
              <th className="px-2 py-1">Battery</th>
            </tr>
          </thead>
          <tbody>
            {markers.map((m, i) => {
              if (m.kind === 'stay') {
                const durMin = Math.round(m.durationMs / 60000);
                const last = m.pings[m.pings.length - 1];
                return (
                  <tr key={`stay-${i}`} className="border-t bg-yellow-500/5 hover:bg-yellow-500/10">
                    <td className="px-2 py-1"><Badge variant="secondary" className="h-4 px-1 text-[10px]">Vistelse</Badge></td>
                    <td className="px-2 py-1 font-mono">{formatStockholmHms(m.startIso)} – {formatStockholmHms(m.endIso)}</td>
                    <td className="px-2 py-1">{durMin} min</td>
                    <td className="px-2 py-1">{m.pings.length}</td>
                    <td className="px-2 py-1 font-mono">{m.lat.toFixed(6)}</td>
                    <td className="px-2 py-1 font-mono">{m.lng.toFixed(6)}</td>
                    <td className="px-2 py-1">{last.accuracy != null ? `${last.accuracy.toFixed(0)} m` : '—'}</td>
                    <td className="px-2 py-1">{dash(last.source)}</td>
                    <td className="px-2 py-1">{last.battery_percent != null ? `${last.battery_percent}%${last.is_charging ? ' ⚡' : ''}` : '—'}</td>
                  </tr>
                );
              }
              const p = m.ping;
              return (
                <tr key={`pt-${p.id}`} className="border-t hover:bg-muted/20">
                  <td className="px-2 py-1"><Badge variant="outline" className="h-4 px-1 text-[10px]">Ping</Badge></td>
                  <td className="px-2 py-1 font-mono">{formatStockholmHms(p.recorded_at)}</td>
                  <td className="px-2 py-1">—</td>
                  <td className="px-2 py-1">1</td>
                  <td className="px-2 py-1 font-mono">{p.lat.toFixed(6)}</td>
                  <td className="px-2 py-1 font-mono">{p.lng.toFixed(6)}</td>
                  <td className="px-2 py-1">{p.accuracy != null ? `${p.accuracy.toFixed(0)} m` : '—'}</td>
                  <td className="px-2 py-1">{dash(p.source)}</td>
                  <td className="px-2 py-1">{p.battery_percent != null ? `${p.battery_percent}%${p.is_charging ? ' ⚡' : ''}` : '—'}</td>
                </tr>
              );
            })}
            {!markers.length && (
              <tr><td colSpan={9} className="px-2 py-6 text-center text-muted-foreground">Inga pings.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
