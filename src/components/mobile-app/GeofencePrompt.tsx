import { useState, useEffect } from 'react';
import { MapPin, Play, Square, X, Building2, FolderOpen, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GeofenceEvent } from '@/hooks/useGeofencing';
import { cn } from '@/lib/utils';

interface GeofencePromptProps {
  event: GeofenceEvent;
  onConfirm: (correctedStartTime?: string) => void;
  onDismiss: () => void;
}

const GeofencePrompt = ({ event, onConfirm, onDismiss }: GeofencePromptProps) => {
  const isEnter = event.type === 'enter';
  const isLocation = event.locationType === 'fixed';
  const isProject = event.locationType === 'project';

  const [now, setNow] = useState(Date.now());

  // Update "now" every 30s so the relative time stays fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const arrivalTimestamp = event.arrivalTimestamp;
  const timeSinceArrival = arrivalTimestamp ? now - arrivalTimestamp : 0;
  const showArrivalCorrection = isEnter && arrivalTimestamp && timeSinceArrival > 5 * 60 * 1000; // > 5 min

  const arrivalDate = arrivalTimestamp ? new Date(arrivalTimestamp) : null;
  const arrivalTimeStr = arrivalDate
    ? arrivalDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    : '';

  const formatTimeSince = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins} min sedan`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return remainMins > 0 ? `${hours}h ${remainMins}min sedan` : `${hours}h sedan`;
  };

  const Icon = isProject ? FolderOpen : isLocation ? Building2 : MapPin;
  const label = isProject
    ? event.largeProjectName || 'Projekt'
    : isLocation
      ? event.locationName || 'Plats'
      : event.booking?.client || '';

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl border overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className={cn(
          "px-5 py-4 flex items-center gap-3",
          isEnter
            ? "bg-gradient-to-r from-primary to-primary/80"
            : "bg-gradient-to-r from-amber-500 to-amber-500/80"
        )}>
          <div className="p-2 rounded-full bg-white/20">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-sm">
              {isEnter
                ? (isProject ? 'Du är vid projektet!' : isLocation ? 'Du är på plats!' : 'Du är på plats!')
                : (isProject ? 'Du lämnar projektet' : isLocation ? 'Du lämnar platsen' : 'Du lämnar arbetsplatsen')}
            </p>
            <p className="text-white/80 text-xs">
              {event.distance}m från {label}
            </p>
          </div>
          <button onClick={onDismiss} className="p-1 rounded-full hover:bg-white/20 transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <h3 className="font-bold text-foreground">{label}</h3>
            {!isLocation && !isProject && event.booking?.booking_number && (
              <p className="text-xs text-muted-foreground font-mono">#{event.booking.booking_number}</p>
            )}
            {!isLocation && !isProject && event.booking?.deliveryaddress && (
              <p className="text-sm text-muted-foreground mt-1">{event.booking.deliveryaddress}</p>
            )}
            {isProject && event.largeProjectAddress && (
              <p className="text-sm text-muted-foreground mt-1">{event.largeProjectAddress}</p>
            )}
            {isLocation && event.locationAddress && (
              <p className="text-sm text-muted-foreground mt-1">{event.locationAddress}</p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {isEnter
              ? (isProject ? 'Vill du starta tidregistrering för detta projekt?' : isLocation ? 'Vill du starta tidregistrering för denna plats?' : 'Vill du starta tidrapporten för detta jobb?')
              : (isProject ? 'Vill du avsluta tidregistreringen för projektet?' : isLocation ? 'Vill du avsluta tidregistreringen?' : 'Vill du avsluta tidrapporten?')}
          </p>

          {showArrivalCorrection && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Enligt GPS anlände du kl. <span className="font-semibold">{arrivalTimeStr}</span> ({formatTimeSince(timeSinceArrival)})
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {showArrivalCorrection && (
              <Button
                className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => onConfirm(arrivalDate!.toISOString())}
              >
                <Clock className="w-4 h-4" />
                Starta från {arrivalTimeStr}
              </Button>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onDismiss}
              >
                Inte nu
              </Button>
              <Button
                className={cn(
                  "flex-1 gap-2",
                  isEnter
                    ? "bg-primary hover:bg-primary/90"
                    : "bg-amber-500 hover:bg-amber-600"
                )}
                onClick={() => onConfirm()}
              >
                {isEnter ? (
                  <>
                    <Play className="w-4 h-4" />
                    Starta nu
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4" />
                    Avsluta
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeofencePrompt;
