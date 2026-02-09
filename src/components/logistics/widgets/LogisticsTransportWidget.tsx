import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Maximize2, Clock, Check, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTransportAssignments } from '@/hooks/useTransportAssignments';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Props {
  onClick: () => void;
  vehicles: any[];
}

const LogisticsTransportWidget: React.FC<Props> = ({ onClick, vehicles }) => {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const { assignments, isLoading } = useTransportAssignments(weekStart, weekEnd);

  const unbooked = assignments.filter(a => !a.partner_response && a.status !== 'delivered');
  const waiting = assignments.filter(a => a.partner_response === 'pending' || (!a.partner_response && a.status === 'pending'));
  const confirmed = assignments.filter(a => a.partner_response === 'accepted');
  const delivered = assignments.filter(a => a.status === 'delivered');

  const stats = [
    { label: 'Ej bokad', count: unbooked.length, icon: Package, color: 'text-muted-foreground' },
    { label: 'Väntar', count: waiting.length, icon: Clock, color: 'text-amber-500' },
    { label: 'Bekräftad', count: confirmed.length, icon: Check, color: 'text-primary' },
    { label: 'Levererad', count: delivered.length, icon: Truck, color: 'text-green-500' },
  ];

  return (
    <Card
      className="group cursor-pointer border-border/40 shadow-2xl rounded-2xl overflow-hidden hover:shadow-3xl transition-all duration-300"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Transportbokningar
            <Badge variant="secondary" className="text-[10px]">
              Vecka {format(now, 'w', { locale: sv })}
            </Badge>
          </div>
          <Maximize2 className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="text-center p-3 rounded-xl bg-muted/30">
              <s.icon className={cn("w-5 h-5 mx-auto mb-1", s.color)} />
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default LogisticsTransportWidget;
