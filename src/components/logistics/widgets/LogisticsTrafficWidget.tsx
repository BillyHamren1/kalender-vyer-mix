import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, Car, Construction } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrafficStatus {
  level: 'low' | 'moderate' | 'heavy';
  label: string;
  incidents: number;
}

const getTrafficStatus = (): TrafficStatus => {
  // Simulate traffic based on time of day
  const hour = new Date().getHours();
  if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18)) {
    return { level: 'heavy', label: 'Mycket trafik', incidents: Math.floor(Math.random() * 3) + 2 };
  }
  if ((hour >= 10 && hour <= 15) || (hour >= 19 && hour <= 21)) {
    return { level: 'moderate', label: 'Måttlig trafik', incidents: Math.floor(Math.random() * 2) + 1 };
  }
  return { level: 'low', label: 'Lugn trafik', incidents: 0 };
};

const LogisticsTrafficWidget: React.FC = () => {
  const [status, setStatus] = useState<TrafficStatus>(getTrafficStatus);

  useEffect(() => {
    const interval = setInterval(() => setStatus(getTrafficStatus()), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const color = status.level === 'heavy' ? 'text-destructive' :
    status.level === 'moderate' ? 'text-amber-500' : 'text-green-500';

  const bgColor = status.level === 'heavy' ? 'bg-destructive/10' :
    status.level === 'moderate' ? 'bg-amber-500/10' : 'bg-green-500/10';

  const Icon = status.level === 'heavy' ? AlertTriangle :
    status.level === 'moderate' ? Car : CheckCircle2;

  return (
    <Card className="border-border/40 shadow-2xl rounded-2xl overflow-hidden">
      <CardContent className="p-0">
        {/* Colored header strip */}
        <div className={cn("px-3 py-2.5 flex items-center gap-2", bgColor)}>
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", bgColor)}>
            <Icon className={cn("w-4 h-4", color)} />
          </div>
          <div>
            <p className="text-xs font-semibold">Trafikläge</p>
            <p className={cn("text-[10px] font-medium", color)}>{status.label}</p>
          </div>
        </div>

        {/* Traffic meter */}
        <div className="px-3 pt-3 pb-2">
          <div className="flex gap-1 mb-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className={cn(
                  "h-2 flex-1 rounded-full transition-colors",
                  i <= (status.level === 'heavy' ? 5 : status.level === 'moderate' ? 3 : 1)
                    ? (status.level === 'heavy' ? 'bg-destructive' : status.level === 'moderate' ? 'bg-amber-500' : 'bg-green-500')
                    : 'bg-muted'
                )}
              />
            ))}
          </div>
        </div>

        {/* Incidents */}
        <div className="px-3 pb-3">
          {status.incidents > 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Construction className="w-3.5 h-3.5" />
              <span>{status.incidents} störning{status.incidents > 1 ? 'ar' : ''} rapporterad{status.incidents > 1 ? 'e' : ''}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span>Inga rapporterade störningar</span>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Senast uppdaterad {new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default LogisticsTrafficWidget;
