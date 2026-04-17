import { useRef, useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Action {
  label: string;
  icon?: ReactNode;
  onAction: () => void;
  variant?: 'destructive' | 'neutral';
}

interface Props {
  children: ReactNode;
  actions: Action[];
  /** Max distance the row can swipe (default 88px per action) */
  threshold?: number;
}

/**
 * iOS-style swipe-to-reveal action row. Only handles horizontal swipe;
 * vertical scrolling passes through to the parent list.
 */
export const SwipeableRow = ({ children, actions, threshold }: Props) => {
  const max = (threshold ?? 88) * actions.length;
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const decided = useRef<'h' | 'v' | null>(null);

  const onStart = (x: number, y: number) => {
    startX.current = x;
    startY.current = y;
    decided.current = null;
  };
  const onMove = (x: number, y: number) => {
    const ddx = x - startX.current;
    const ddy = y - startY.current;
    if (decided.current === null) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      decided.current = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v';
    }
    if (decided.current !== 'h') return;
    const next = open ? -max + ddx : ddx;
    setDx(Math.max(-max - 30, Math.min(0, next)));
  };
  const onEnd = () => {
    if (decided.current !== 'h') {
      setDx(open ? -max : 0);
      return;
    }
    if (dx < -max / 2) {
      setOpen(true);
      setDx(-max);
    } else {
      setOpen(false);
      setDx(0);
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Action layer */}
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((a, i) => (
          <button
            key={i}
            onClick={() => { a.onAction(); setOpen(false); setDx(0); }}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 px-4 text-xs font-semibold text-white',
              a.variant === 'destructive' ? 'bg-destructive' : 'bg-muted-foreground'
            )}
            style={{ width: threshold ?? 88 }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>

      {/* Content layer */}
      <div
        className="bg-card transition-transform"
        style={{ transform: `translateX(${dx}px)`, transitionDuration: decided.current === 'h' ? '0ms' : '180ms' }}
        onTouchStart={(e) => onStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => onMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={onEnd}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeableRow;
