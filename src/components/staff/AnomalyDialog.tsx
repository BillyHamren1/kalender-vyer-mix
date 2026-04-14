import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, MapPin, Car } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { Anomaly } from '@/lib/timeReportAnomalies';
import { formatHoursMinutes } from '@/utils/formatHours';

interface TravelRoute {
  start_time: string | null;
  from_address: string | null;
  to_address: string | null;
  hours_worked: number;
}

interface AnomalyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  anomalies: Anomaly[];
  travelRoutes: TravelRoute[];
}

export const AnomalyDialog: React.FC<AnomalyDialogProps> = ({
  open,
  onOpenChange,
  date,
  anomalies,
  travelRoutes,
}) => {
  if (!date) return null;

  const formattedDate = format(new Date(date), 'EEEE d MMMM', { locale: sv });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Avvikelser — {formattedDate}
          </DialogTitle>
          <DialogDescription>
            {anomalies.length} avvikelse{anomalies.length !== 1 ? 'r' : ''} upptäckt{anomalies.length !== 1 ? 'a' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {anomalies.map((a, i) => (
            <div
              key={i}
              className="flex gap-3 p-3 rounded-lg border bg-card"
            >
              <div className="shrink-0 mt-0.5">
                {a.severity === 'error' ? (
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-destructive" />
                ) : (
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
              </div>
            </div>
          ))}

          {travelRoutes.length > 0 && (
            <div className="pt-2 border-t">
              <div className="flex items-center gap-1.5 mb-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Reserutt denna dag</span>
              </div>
              <div className="space-y-1.5">
                {travelRoutes.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Car className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                    <span className="font-mono">{r.start_time?.slice(0, 5) || '??:??'}</span>
                    <span className="truncate">
                      {r.from_address || '?'} → {r.to_address || '?'}
                    </span>
                    <Badge variant="outline" className="text-[10px] ml-auto shrink-0">
                      {formatHoursMinutes(r.hours_worked)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
