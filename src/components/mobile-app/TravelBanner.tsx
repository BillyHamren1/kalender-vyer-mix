import { Car, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TravelState } from '@/hooks/useTravelDetection';

interface TravelBannerProps {
  travelState: TravelState;
  elapsedSeconds: number;
  onStop: () => void;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const TravelBanner = ({ travelState, elapsedSeconds, onStop }: TravelBannerProps) => {
  if (!travelState.isMoving) return null;

  return (
    <div className="mx-4 mt-2 rounded-2xl bg-primary/10 border border-primary/20 px-4 py-3 shadow-md">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="p-2 rounded-xl bg-primary/15">
            <Car className="w-5 h-5 text-primary" />
          </div>
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">Travelling</span>
            <span className="text-sm font-mono font-bold text-primary tabular-nums">
              {formatDuration(elapsedSeconds)}
            </span>
          </div>
          {travelState.fromAddress && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
              From: {travelState.fromAddress}
            </p>
          )}
        </div>

        <button
          onClick={onStop}
          className="p-2 rounded-xl bg-destructive/10 active:scale-95 transition-all"
          aria-label="Stoppa resa"
        >
          <Square className="w-4 h-4 text-destructive fill-destructive" />
        </button>
      </div>
    </div>
  );
};

export default TravelBanner;
