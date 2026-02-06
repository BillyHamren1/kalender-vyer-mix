import { MapPin, Play, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GeofenceEvent } from '@/hooks/useGeofencing';
import { cn } from '@/lib/utils';

interface GeofencePromptProps {
  event: GeofenceEvent;
  onConfirm: () => void;
  onDismiss: () => void;
}

const GeofencePrompt = ({ event, onConfirm, onDismiss }: GeofencePromptProps) => {
  const isEnter = event.type === 'enter';

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
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-sm">
              {isEnter ? 'Du är på plats!' : 'Du lämnar arbetsplatsen'}
            </p>
            <p className="text-white/80 text-xs">
              {event.distance}m från {event.booking.client}
            </p>
          </div>
          <button onClick={onDismiss} className="p-1 rounded-full hover:bg-white/20 transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <h3 className="font-bold text-foreground">{event.booking.client}</h3>
            {event.booking.booking_number && (
              <p className="text-xs text-muted-foreground font-mono">#{event.booking.booking_number}</p>
            )}
            {event.booking.deliveryaddress && (
              <p className="text-sm text-muted-foreground mt-1">{event.booking.deliveryaddress}</p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {isEnter
              ? 'Vill du starta tidrapporten för detta jobb?'
              : 'Vill du avsluta tidrapporten?'}
          </p>

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
              onClick={onConfirm}
            >
              {isEnter ? (
                <>
                  <Play className="w-4 h-4" />
                  Starta
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
  );
};

export default GeofencePrompt;
