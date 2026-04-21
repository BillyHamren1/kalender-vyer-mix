import React, { useEffect, useState } from 'react';

interface LiveDurationProps {
  startedAt: string | Date;
  className?: string;
}

const fmt = (totalSec: number): string => {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

/**
 * Live HH:MM:SS counter that ticks every second since `startedAt`.
 * Pauses when the tab is hidden and resyncs on visibility change.
 */
export const LiveDuration: React.FC<LiveDurationProps> = ({ startedAt, className }) => {
  const startMs = typeof startedAt === 'string' ? new Date(startedAt).getTime() : startedAt.getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval) return;
      setNow(Date.now());
      interval = setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [startMs]);

  return <span className={className}>{fmt((now - startMs) / 1000)}</span>;
};
