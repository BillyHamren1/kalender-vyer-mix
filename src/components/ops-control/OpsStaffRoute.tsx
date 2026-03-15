import { RouteStop, StaffRouteResult } from '@/services/staffRouteService';
import { MapPin, Navigation, Clock, Sparkles, X, Map } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  staffName: string;
  route: StaffRouteResult;
  onClose: () => void;
  onShowOnMap: () => void;
}

const OpsStaffRoute = ({ staffName, route, onClose, onShowOnMap }: Props) => {
  return (
    <div className="h-full flex flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Navigation className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-foreground truncate">{staffName}</div>
            <div className="text-[10px] text-muted-foreground">Optimerad rutt</div>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Summary */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-3 shrink-0 bg-muted/30">
        <div className="flex items-center gap-1 text-[11px] font-medium text-foreground">
          <MapPin className="w-3 h-3 text-primary" />
          {route.stops.length} stopp
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Navigation className="w-3 h-3" />
          {route.total_distance_km} km
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          {route.total_duration_min} min
        </div>
      </div>

      {/* Stop list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-3 py-2 space-y-0.5">
          {route.stops.map((stop, idx) => (
            <div key={stop.bookingId} className="flex gap-2 group">
              {/* Route line */}
              <div className="flex flex-col items-center shrink-0 pt-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  idx === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                }`}>
                  {idx + 1}
                </div>
                {idx < route.stops.length - 1 && (
                  <div className="w-0.5 flex-1 bg-border my-0.5" />
                )}
              </div>

              {/* Stop info */}
              <div className="flex-1 min-w-0 pb-2">
                <div className="text-[11px] font-semibold text-foreground truncate">{stop.client}</div>
                {stop.address && (
                  <div className="text-[10px] text-muted-foreground truncate">{stop.address}</div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {stop.startTime && (
                    <span className="text-[9px] text-muted-foreground">
                      {format(new Date(stop.startTime), 'HH:mm')}
                      {stop.endTime && `–${format(new Date(stop.endTime), 'HH:mm')}`}
                    </span>
                  )}
                  {stop.eventType && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                      {stop.eventType}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* AI Suggestions */}
        {route.ai_suggestions && (
          <div className="px-3 py-2 border-t border-border/50">
            <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase mb-1.5">
              <Sparkles className="w-3 h-3 text-amber-500" />
              AI-analys
            </div>
            <div className="text-[11px] text-foreground leading-relaxed whitespace-pre-wrap bg-amber-500/5 border border-amber-500/20 rounded-md px-2.5 py-2">
              {route.ai_suggestions}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-t border-border shrink-0">
        <button
          onClick={onShowOnMap}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 transition-opacity"
        >
          <Map className="w-3.5 h-3.5" />
          Visa på karta
        </button>
      </div>
    </div>
  );
};

export default OpsStaffRoute;
