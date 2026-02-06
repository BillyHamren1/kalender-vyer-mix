import { MapPin, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActiveTimer } from '@/hooks/useGeofencing';

interface GeofenceStatusBarProps {
  isTracking: boolean;
  activeTimers: Map<string, ActiveTimer>;
}

const GeofenceStatusBar = ({ isTracking, activeTimers }: GeofenceStatusBarProps) => {
  const timerCount = activeTimers.size;

  if (!isTracking && timerCount === 0) return null;

  return (
    <div className={cn(
      "flex items-center gap-2 px-4 py-1.5 text-xs",
      timerCount > 0
        ? "bg-primary/10 text-primary"
        : "bg-muted text-muted-foreground"
    )}>
      {isTracking ? (
        <div className="relative flex items-center gap-1.5">
          <div className="relative">
            <MapPin className="w-3 h-3" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
          <span>GPS aktiv</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <WifiOff className="w-3 h-3" />
          <span>GPS inaktiv</span>
        </div>
      )}

      {timerCount > 0 && (
        <div className="ml-auto flex items-center gap-1.5 font-medium">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span>{timerCount} aktiv{timerCount > 1 ? 'a' : ''} timer{timerCount > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
};

export default GeofenceStatusBar;
