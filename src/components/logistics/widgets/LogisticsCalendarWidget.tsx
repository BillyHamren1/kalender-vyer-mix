import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Maximize2, Truck, MapPin } from 'lucide-react';
import { format, startOfWeek, endOfWeek, isSameDay, isAfter } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import { cn } from '@/lib/utils';

interface Props {
  onClick: () => void;
}

const LogisticsCalendarWidget: React.FC<Props> = ({ onClick }) => {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const { assignments, isLoading } = useTransportAssignments(weekStart, weekEnd);

  // Get upcoming/today assignments sorted
  const upcoming = assignments
    .filter(a => {
      const d = new Date(a.transport_date);
      return isSameDay(d, now) || isAfter(d, now);
    })
    .sort((a, b) => a.transport_date.localeCompare(b.transport_date))
    .slice(0, 4);

  const todayCount = assignments.filter(a => a.transport_date === format(now, 'yyyy-MM-dd')).length;

  return (
    <Card
      className="group cursor-pointer border-border/40 shadow-2xl rounded-2xl overflow-hidden hover:shadow-3xl transition-all duration-300 hover:scale-[1.02]"
      onClick={onClick}
    >
      <CardContent className="p-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-primary/80 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary-foreground" />
            <span className="text-sm font-medium text-primary-foreground">
              Vecka {format(now, 'w', { locale: sv })}
            </span>
          </div>
          <Maximize2 className="w-3.5 h-3.5 text-primary-foreground/60 group-hover:text-primary-foreground transition-colors" />
        </div>

        {/* Stats */}
        <div className="px-4 pt-4 pb-1 flex items-baseline gap-2">
          <span className="text-3xl font-bold">{todayCount}</span>
          <span className="text-sm text-muted-foreground">transporter idag</span>
        </div>

        {/* Upcoming list */}
        <div className="px-4 pb-4 space-y-2">
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Laddar...</div>
          ) : upcoming.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Inga kommande transporter</div>
          ) : (
            upcoming.map(a => (
              <div key={a.id} className="flex items-center gap-2.5 py-1.5 border-b border-border/20 last:border-0">
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {a.booking?.client || 'Okänd'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {a.booking?.deliveryaddress || '–'}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {isSameDay(new Date(a.transport_date), now) ? 'Idag' : format(new Date(a.transport_date), 'd MMM', { locale: sv })}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LogisticsCalendarWidget;
