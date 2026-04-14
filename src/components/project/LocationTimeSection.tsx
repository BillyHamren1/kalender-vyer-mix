import { useQuery } from '@tanstack/react-query';
import { fetchLocationTimeEntries } from '@/services/locationTimeService';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface LocationTimeSectionProps {
  locationId: string;
}

export const LocationTimeSection = ({ locationId }: LocationTimeSectionProps) => {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['location-time-entries', locationId],
    queryFn: () => fetchLocationTimeEntries({ location_id: locationId }),
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

  const totalMinutes = entries.reduce((sum, e) => sum + (e.total_minutes || 0), 0);
  const totalHours = Math.round(totalMinutes / 6) / 10; // 1 decimal

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-20 bg-muted/40 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Tidöversikt — Lager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{totalHours} tim</p>
              <p className="text-xs text-muted-foreground">Total tid</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{entries.length}</p>
              <p className="text-xs text-muted-foreground">Registreringar</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Senaste registreringar</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
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
                    {entry.total_minutes ? `${Math.round(entry.total_minutes)} min` : 'Pågår'}
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
