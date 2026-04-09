import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

const fetchOrphanBookings = async () => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data, error } = await supabase
    .from('bookings')
    .select('id, client, booking_number, eventdate, created_at')
    .eq('status', 'CONFIRMED')
    .or('assigned_to_project.is.null,assigned_to_project.eq.false')
    .eq('viewed', true)
    .lt('created_at', sevenDaysAgo.toISOString())
    .order('eventdate', { ascending: true })
    .limit(20);

  if (error) throw error;
  return data || [];
};

const OrphanBookingsWarning = () => {
  const { data: orphans = [] } = useQuery({
    queryKey: ['orphan-bookings'],
    queryFn: fetchOrphanBookings,
    refetchInterval: 300000,
  });

  if (orphans.length === 0) return null;

  return (
    <Card className="border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10">
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
              {orphans.length} bekräftade bokningar saknar projekt
            </p>
            <p className="text-xs text-amber-700/70 dark:text-amber-500/70 mt-0.5 mb-2">
              Dessa bokningar har bekräftats men aldrig fått ett projekt skapat. Skapa projekt via "Nya bokningar".
            </p>
            <div className="flex flex-wrap gap-1.5">
              {orphans.slice(0, 8).map(b => (
                <Badge key={b.id} variant="outline" className="text-xs bg-amber-100/50 text-amber-800 border-amber-300">
                  {b.booking_number ? `#${b.booking_number}` : b.client}
                </Badge>
              ))}
              {orphans.length > 8 && (
                <Badge variant="outline" className="text-xs">+{orphans.length - 8} till</Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default OrphanBookingsWarning;
