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
import { Badge } from '@/components/ui/badge';
import { fetchStaffMembers } from '@/services/staffService';
import { useStaffGpsPingsForDay, type RawStaffGpsPing } from '@/hooks/staff/useStaffGpsPingsForDay';
import RawGpsSatelliteMap from './RawGpsSatelliteMap';
import { formatStockholmHms } from '@/lib/staff/formatStockholmTime';

function dash(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

interface Props {
  initialStaffId?: string | null;
  initialDate?: string | null;
}

export default function StaffGpsSatelliteMap({ initialStaffId, initialDate }: Props) {
  const [staffId, setStaffId] = useState<string | null>(initialStaffId ?? null);
  const [date, setDate] = useState<Date>(initialDate ? new Date(initialDate) : new Date());

  const dateStr = format(date, 'yyyy-MM-dd');

  const staffQuery = useQuery({
    queryKey: ['staff-members-all-gps-map'],
    queryFn: () => fetchStaffMembers({ includeInactive: true }),
    staleTime: 5 * 60_000,
  });

  const staff = staffQuery.data ?? [];
  const effectiveStaffId = staffId ?? staff[0]?.id ?? null;

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
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Välj person" />
            </SelectTrigger>
            <SelectContent>
              {staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
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

      {/* Tabell */}
      <div className="border rounded-md overflow-hidden">
        <div className="px-3 py-2 text-sm font-medium bg-muted/40 border-b">
          Råa pings ({pings.length})
        </div>
        <div className="max-h-[40vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 sticky top-0">
              <tr className="text-left">
                <th className="px-2 py-1">Tid</th>
                <th className="px-2 py-1">Lat</th>
                <th className="px-2 py-1">Lng</th>
                <th className="px-2 py-1">Accuracy</th>
                <th className="px-2 py-1">Speed</th>
                <th className="px-2 py-1">Source</th>
                <th className="px-2 py-1">Battery</th>
                <th className="px-2 py-1">Build</th>
                <th className="px-2 py-1">Device</th>
              </tr>
            </thead>
            <tbody>
              {pings.map((p) => (
                <tr key={p.id} className="border-t hover:bg-muted/20">
                  <td className="px-2 py-1 font-mono">{formatStockholmHms(p.recorded_at)}</td>
                  <td className="px-2 py-1 font-mono">{p.lat.toFixed(6)}</td>
                  <td className="px-2 py-1 font-mono">{p.lng.toFixed(6)}</td>
                  <td className="px-2 py-1">{p.accuracy != null ? `${p.accuracy.toFixed(0)} m` : '—'}</td>
                  <td className="px-2 py-1">{p.speed != null ? p.speed.toFixed(1) : '—'}</td>
                  <td className="px-2 py-1">{dash(p.source)}</td>
                  <td className="px-2 py-1">
                    {p.battery_percent != null ? `${p.battery_percent}%${p.is_charging ? ' ⚡' : ''}` : '—'}
                  </td>
                  <td className="px-2 py-1">{dash(p.app_build)}</td>
                  <td className="px-2 py-1">{dash(p.device_model)}</td>
                </tr>
              ))}
              {!pings.length && (
                <tr><td colSpan={9} className="px-2 py-6 text-center text-muted-foreground">Inga pings.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
