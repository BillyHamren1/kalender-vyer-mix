import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLocationTimeEntriesForPeriod } from '@/services/locationTimeService';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, User } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { sv } from 'date-fns/locale';

interface LocationTimeSectionProps {
  locationId: string;
}

export const LocationTimeSection = ({ locationId }: LocationTimeSectionProps) => {
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const validPeriod = Boolean(dateFrom && dateTo && dateFrom <= dateTo);
  const { data: entries = [], isLoading, error, refetch } = useQuery({
    queryKey: ['location-time-entries-period', locationId, dateFrom, dateTo],
    enabled: validPeriod,
    queryFn: () => fetchLocationTimeEntriesForPeriod({ location_id: locationId, date_from: dateFrom, date_to: dateTo }),
  });

  const { data: staffMap = {} } = useQuery({
    queryKey: ['staff-names-map'],
    queryFn: async () => {
      const { data } = await supabase.from('staff_members').select('id, name');
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => { map[s.id] = s.name; });
      return map;
    },
  });

  const validMinutes = (value: number | null): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const totalMinutes = entries.reduce((sum, e) => sum + (e.exited_at !== null ? (validMinutes(e.total_minutes) ? e.total_minutes : 0) : 0), 0);
  const missingDurationCount = entries.filter(e => e.exited_at !== null && !validMinutes(e.total_minutes)).length;
  const totalHours = Math.round(totalMinutes / 6) / 10; // 1 decimal


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Närvarotid på lagerplatsen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            <label className="text-sm">Från<input aria-label="Från datum" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="block rounded border bg-background p-2" /></label>
            <label className="text-sm">Till<input aria-label="Till datum" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="block rounded border bg-background p-2" /></label>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Närvarotid för registreringar som startat under perioden. Tid på platsen är inte samma sak som tid fördelad på projekt. Pågående registreringar ingår inte i summan.</p>
          <button type="button" className="text-sm underline mb-3" onClick={() => void refetch()} disabled={!validPeriod || isLoading}>Uppdatera</button>
          {missingDurationCount > 0 && <p role="status" className="text-sm mb-3">{missingDurationCount} avslutade registreringar saknar tidsvärde. Summan är ofullständig.</p>}
          {(!validPeriod || error) ? <p role="alert">{!validPeriod ? 'Välj en giltig period.' : 'Tidsunderlaget kunde inte hämtas fullständigt. Försök igen.'}</p> : isLoading ? <p>Laddar tidsunderlag…</p> : <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{totalHours} tim</p>
              <p className="text-xs text-muted-foreground">Avslutad närvarotid</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{entries.length}</p>
              <p className="text-xs text-muted-foreground">Registreringar</p>
            </div>
          </div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Senaste registreringar i perioden (högst 50)</CardTitle>
        </CardHeader>
        <CardContent>
          {error || !validPeriod || isLoading ? <p className="text-sm text-muted-foreground">Underlag saknas för vald period.</p> : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Ingen tid registrerad ännu</p>
          ) : (
            <div className="divide-y divide-border/40">
              {entries.slice(0, 50).map(entry => (
                <div key={entry.id} className="flex items-center gap-3 py-2.5">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {staffMap[entry.staff_id] || entry.staff_id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.entered_at), 'd MMM yyyy HH:mm', { locale: sv })}
                      {entry.exited_at && ` — ${format(new Date(entry.exited_at), 'HH:mm')}`}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground shrink-0">
                    {entry.exited_at === null ? 'Pågår' : !validMinutes(entry.total_minutes) ? 'Tid saknas' : `${Math.round(entry.total_minutes)} min`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
